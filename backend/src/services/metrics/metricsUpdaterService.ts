import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

interface DexScreenerResponse {
    volume: {
        h24: string;
        h6: string;
        h1: string;
        m5: string;
    };
    txns: {
        m5: { buys: number; sells: number; };
        h1: { buys: number; sells: number; };
        h6: { buys: number; sells: number; };
        h24: { buys: number; sells: number; };
    };
    priceChange: {
        m5: number;
        h1: number;
        h6: number;
        h24: number;
    };
    priceUsd: string;
    marketCap: string;
    fdv: string;
    liquidity: { usd: string; };
    baseToken: { address: string; };
}

export class MetricsUpdaterService {
    private static instance: MetricsUpdaterService;
    private isRunning: boolean = false;

    private constructor() { }

    public static getInstance(): MetricsUpdaterService {
        if (!MetricsUpdaterService.instance) {
            MetricsUpdaterService.instance = new MetricsUpdaterService();
        }
        return MetricsUpdaterService.instance;
    }

    public async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('MetricsUpdaterService is already running');
            return;
        }

        this.isRunning = true;
        this.scheduleUpdates();
    }
    //asdfasdfasdfasdf

    private async scheduleUpdates(): Promise<void> {
        while (this.isRunning) {
            try {
                const batchNumber = Math.floor(Date.now() / 1000 / 15) % 10; // Changes every 15 seconds, cycles 0-9

                const tokensResult = await pool().query(`
                    WITH tokens_to_update AS (
                        SELECT mint_address, volume_24h
                        FROM onstrument.tokens
                        WHERE 
                            -- High volume tokens: update every 15 minutes
                            (volume_24h > 100000 AND (last_price_update < NOW() - INTERVAL '15 minutes' OR last_price_update IS NULL))
                            OR
                            -- Medium volume tokens: update every 30 minutes
                            (volume_24h > 10000 AND (last_price_update < NOW() - INTERVAL '30 minutes' OR last_price_update IS NULL))
                            OR
                            -- Low volume tokens: update every hour
                            (last_price_update < NOW() - INTERVAL '1 hour' OR last_price_update IS NULL)
                    )
                    SELECT mint_address
                    FROM (
                        SELECT mint_address,
                            CASE 
                                WHEN ${batchNumber} < 5 THEN
                                    ROW_NUMBER() OVER (ORDER BY COALESCE(volume_24h, 0) DESC)
                                ELSE
                                    ROW_NUMBER() OVER (ORDER BY mint_address)
                            END as row_num
                        FROM tokens_to_update
                    ) ranked
                    WHERE row_num > ${batchNumber * 50} 
                        AND row_num <= ${(batchNumber + 1) * 50}
                    ORDER BY 
                        CASE WHEN ${batchNumber} < 5 THEN row_num END,
                        CASE WHEN ${batchNumber} >= 5 THEN row_num END
                    LIMIT 50
                `);

                if (tokensResult.rows.length === 0) {
                    logger.info('No tokens to update, waiting...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                await this.updateAllMetrics(tokensResult.rows);

                // Delay to maintain ~200 requests per minute
                // 60 seconds / 200 requests = 300ms between requests
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    private async updateAllMetrics(tokens: { mint_address: string }[]): Promise<void> {
        const dbPool = pool();
        const client = await dbPool.connect();

        try {
            if (tokens.length === 0) {
                return;
            }

            const addresses = tokens.map(t => t.mint_address).join(',');
            const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${addresses}`);
            const pairs = await response.json() as DexScreenerResponse[];

            const pairMap = new Map(pairs.map(pair => [pair.baseToken.address, pair]));

            await client.query('BEGIN');

            try {
                for (const token of tokens) {
                    const pair = pairMap.get(token.mint_address);
                    if (!pair) {
                        logger.warn(`No pair data found for token: ${token.mint_address}`);
                        continue;
                    }

                    const result = await client.query(`
                        UPDATE onstrument.tokens 
                        SET 
                            current_price = $1::numeric,
                            market_cap_usd = $2::numeric,
                            fully_diluted_value_usd = $3::numeric,
                            volume_5m = $4::numeric,
                            volume_1h = $5::numeric,
                            volume_6h = $6::numeric,
                            volume_24h = $7::numeric,
                            price_change_5m = $8::numeric,
                            price_change_1h = $9::numeric,
                            price_change_6h = $10::numeric,
                            price_change_24h = $11::numeric,
                            tx_5m_buys = $12,
                            tx_5m_sells = $13,
                            tx_1h_buys = $14,
                            tx_1h_sells = $15,
                            tx_6h_buys = $16,
                            tx_6h_sells = $17,
                            tx_24h_buys = $18,
                            tx_24h_sells = $19,
                            reserve_in_usd = $20::numeric,
                            last_price_update = NOW()
                        WHERE mint_address = $21
                        RETURNING mint_address, current_price, volume_24h, last_price_update;
                    `, [
                        pair.priceUsd || 0,
                        pair.marketCap || 0,
                        pair.fdv || 0,
                        parseFloat(pair.volume?.m5 || '0'),
                        parseFloat(pair.volume?.h1 || '0'),
                        parseFloat(pair.volume?.h6 || '0'),
                        parseFloat(pair.volume?.h24 || '0'),
                        Number(pair.priceChange?.m5 || 0),
                        Number(pair.priceChange?.h1 || 0),
                        Number(pair.priceChange?.h6 || 0),
                        Number(pair.priceChange?.h24 || 0),
                        pair.txns?.m5?.buys || 0,
                        pair.txns?.m5?.sells || 0,
                        pair.txns?.h1?.buys || 0,
                        pair.txns?.h1?.sells || 0,
                        pair.txns?.h6?.buys || 0,
                        pair.txns?.h6?.sells || 0,
                        pair.txns?.h24?.buys || 0,
                        pair.txns?.h24?.sells || 0,
                        Number(pair.liquidity?.usd || 0),
                        pair.baseToken.address
                    ]);
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                logger.error('Error during token updates:', {
                    error,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack
                });
                throw error;
            }

        } catch (error) {
            logger.error('Error in updateAllMetrics:', {
                error,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    public stop(): void {
        this.isRunning = false;
        logger.info('MetricsUpdaterService stopped');
    }
}
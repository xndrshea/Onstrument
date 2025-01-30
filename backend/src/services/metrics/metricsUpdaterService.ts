import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

interface DexScreenerResponse {
    volume: {
        h24: number;
        h6: number;
        h1: number;
        m5: number;
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
    marketCap: number;
    fdv: number;
    liquidity: { usd: number; };
    baseToken: { address: string; };
}

export class MetricsUpdaterService {
    private static instance: MetricsUpdaterService;
    private isRunning: boolean = false;
    private readonly UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

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

    private async scheduleUpdates(): Promise<void> {
        while (this.isRunning) {
            try {
                // Balance between importance and update fairness
                const tokensResult = await pool().query(`
                    SELECT mint_address 
                    FROM onstrument.tokens 
                    ORDER BY 
                        CASE
                            -- High priority: Important tokens not updated in 5+ minutes
                            WHEN volume_24h > 1000000 AND (last_price_update < NOW() - INTERVAL '5 minutes' OR last_price_update IS NULL) THEN 0
                            
                            -- Medium priority: Any token not updated in 15+ minutes
                            WHEN last_price_update < NOW() - INTERVAL '15 minutes' OR last_price_update IS NULL THEN 1
                            
                            -- Lower priority: Important tokens updated recently
                            WHEN volume_24h > 1000000 THEN 2
                            
                            -- Lowest priority: Everything else
                            ELSE 3
                        END,
                        COALESCE(volume_24h, 0) DESC,
                        mint_address
                    LIMIT 30
                `);

                if (tokensResult.rows.length === 0) {
                    logger.info('No tokens to update, waiting...');
                    continue;
                }
                await this.updateAllMetrics();

                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                logger.error('Error in metrics update loop:', error);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    private async updateAllMetrics(): Promise<void> {
        const client = await pool().connect();
        try {
            const tokensResult = await client.query(`
                SELECT mint_address 
                FROM onstrument.tokens 
                ORDER BY mint_address
                LIMIT 30
            `);

            if (tokensResult.rows.length === 0) {
                return;
            }

            const addresses = tokensResult.rows.map(t => t.mint_address).join(',');

            const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${addresses}`);
            if (!response.ok) {
                throw new Error(`DexScreener API error: ${response.statusText}`);
            }

            const pairs = await response.json() as DexScreenerResponse[];
            const pairMap = new Map(pairs.map(pair => [pair.baseToken.address, pair]));

            await client.query('BEGIN');

            try {
                for (const token of tokensResult.rows) {
                    const pair = pairMap.get(token.mint_address);
                    if (!pair) {
                        continue;
                    }

                    await client.query(`
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
                    `, [
                        Number(pair.priceUsd),
                        Number(pair.marketCap),
                        Number(pair.fdv),
                        Number(pair.volume?.m5 || 0),
                        Number(pair.volume?.h1 || 0),
                        Number(pair.volume?.h6 || 0),
                        Number(pair.volume?.h24 || 0),
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
                throw error;
            }

        } catch (error) {
            logger.error('Error in updateAllMetrics:', error);
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
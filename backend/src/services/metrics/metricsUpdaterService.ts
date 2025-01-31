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
                const tokensResult = await pool().query(`
                    SELECT mint_address 
                    FROM onstrument.tokens 
                    WHERE 
                        -- Only get tokens that haven't been updated in the last 10 minutes
                        (last_price_update < NOW() - INTERVAL '10 minutes' OR last_price_update IS NULL)
                    ORDER BY 
                        COALESCE(volume_24h, 0) DESC,
                        mint_address
                    LIMIT 30
                `);

                if (tokensResult.rows.length === 0) {
                    logger.info('No tokens to update, waiting...');
                    continue;
                }
                await this.updateAllMetrics(tokensResult.rows);

                await new Promise(resolve => setTimeout(resolve, 1000));

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

            // Add more detailed logging
            logger.info('Token batch details:', {
                requestedTokens: tokens.map(t => t.mint_address),
                receivedPairs: pairs.map(p => p.baseToken.address),
                totalRequested: tokens.length,
                totalReceived: pairs.length
            });

            const pairMap = new Map(pairs.map(pair => [pair.baseToken.address, pair]));

            await client.query('BEGIN');

            try {
                for (const token of tokens) {
                    const pair = pairMap.get(token.mint_address);
                    if (!pair) {
                        logger.warn('No pair data found for token:', token.mint_address);
                        continue;
                    }

                    // Log each update attempt
                    logger.info('Updating token:', {
                        mintAddress: token.mint_address,
                        price: pair.priceUsd,
                        volume24h: pair.volume.h24
                    });

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
                        RETURNING mint_address, current_price, volume_24h
                    `, [
                        pair.priceUsd,
                        pair.marketCap.toString(),
                        pair.fdv.toString(),
                        pair.volume.m5.toString(),
                        pair.volume.h1.toString(),
                        pair.volume.h6.toString(),
                        pair.volume.h24.toString(),
                        Number(pair.priceChange.m5),
                        Number(pair.priceChange.h1),
                        Number(pair.priceChange.h6),
                        Number(pair.priceChange.h24),
                        pair.txns.m5.buys,
                        pair.txns.m5.sells,
                        pair.txns.h1.buys,
                        pair.txns.h1.sells,
                        pair.txns.h6.buys,
                        pair.txns.h6.sells,
                        pair.txns.h24.buys,
                        pair.txns.h24.sells,
                        Number(pair.liquidity.usd),
                        pair.baseToken.address
                    ]);

                    // Log the result
                    logger.info('Update result:', {
                        mintAddress: token.mint_address,
                        rowsAffected: result.rowCount,
                        updatedData: result.rows[0]
                    });
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
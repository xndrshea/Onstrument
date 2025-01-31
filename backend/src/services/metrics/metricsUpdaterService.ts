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
                logger.info('Starting update batch');

                // Get top tokens by volume and any new tokens that haven't been checked
                const tokensResult = await pool().query(`
                    (
                        SELECT mint_address, volume_24h, last_price_update
                        FROM onstrument.tokens 
                        WHERE volume_24h > 0
                        AND (last_price_update IS NULL OR last_price_update < NOW() - INTERVAL '10 minutes')
                        ORDER BY volume_24h DESC
                        LIMIT 20
                    )
                    UNION ALL
                    (
                        SELECT mint_address, volume_24h, last_price_update
                        FROM onstrument.tokens
                        WHERE last_price_update IS NULL
                        LIMIT 10
                    )
                `);

                logger.info('Selected tokens for update', {
                    count: tokensResult.rows.length,
                    tokens: tokensResult.rows.map(t => ({
                        mint: t.mint_address,
                        volume: t.volume_24h,
                        lastUpdate: t.last_price_update
                    }))
                });

                await this.updateAllMetrics(tokensResult.rows);
                logger.info('Completed batch update');

                // Wait 5 seconds before next batch
                await new Promise(resolve => setTimeout(resolve, 5000));

            } catch (error) {
                logger.error('Error in scheduleUpdates', {
                    error: (error as Error).message,
                    stack: (error as Error).stack
                });
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    private async updateAllMetrics(tokens: { mint_address: string }[]): Promise<void> {
        const dbPool = pool();
        const client = await dbPool.connect();

        try {
            logger.info('Starting metrics update', { tokenCount: tokens.length });

            const addresses = tokens.map(t => t.mint_address).join(',');
            logger.info('Fetching DexScreener data', { addresses });

            const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${addresses}`);
            const pairs = await response.json() as DexScreenerResponse[];

            logger.info('DexScreener response received', {
                pairsCount: pairs.length,
                pairs: pairs.map(p => ({
                    address: p.baseToken.address,
                    volume: p.volume?.h24
                }))
            });

            const pairMap = new Map(pairs.map(pair => [pair.baseToken.address, pair]));
            await client.query('BEGIN');

            try {
                for (const token of tokens) {
                    const pair = pairMap.get(token.mint_address);
                    if (!pair) {
                        logger.warn('No pair data found', { token: token.mint_address });
                        continue;
                    }

                    logger.info('Updating token', {
                        token: token.mint_address,
                        newVolume: pair.volume?.h24,
                        newPrice: pair.priceUsd
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
                        RETURNING mint_address, volume_24h, last_price_update;
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

                    logger.info('Token update complete', {
                        token: token.mint_address,
                        updated: result!.rowCount! > 0,
                        newValues: result!.rows![0]
                    });
                }

                await client.query('COMMIT');
                logger.info('Batch commit complete', { tokenCount: tokens.length });

            } catch (error) {
                await client.query('ROLLBACK');
                logger.error('Error during token updates', {
                    error: (error as Error).message,
                    stack: (error as Error).stack
                });
                throw error;
            }

        } catch (error) {
            logger.error('Error in updateAllMetrics', {
                error: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        } finally {
            client.release();
            logger.info('Database connection released');
        }
    }

    public stop(): void {
        this.isRunning = false;
        logger.info('MetricsUpdaterService stopped');
    }
}
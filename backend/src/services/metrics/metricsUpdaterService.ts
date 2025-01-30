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
        try {
            logger.info('Starting metrics update...');

            const tokensResult = await pool().query(`
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

            // Create a map for quick lookup of pair data by token address
            const pairMap = new Map(pairs.map(pair => [pair.baseToken.address, pair]));

            // Batch update all tokens that we got data for
            for (const token of tokensResult.rows) {
                const pair = pairMap.get(token.mint_address);
                if (!pair) {
                    continue;
                }

                await pool().query(`
                    UPDATE onstrument.tokens 
                    SET 
                        current_price = $1,
                        market_cap_usd = $2,
                        fully_diluted_value_usd = $3,
                        volume_5m = $4,
                        volume_1h = $5,
                        volume_6h = $6,
                        volume_24h = $7,
                        price_change_5m = $8,
                        price_change_1h = $9,
                        price_change_6h = $10,
                        price_change_24h = $11,
                        tx_5m_buys = $12,
                        tx_5m_sells = $13,
                        tx_1h_buys = $14,
                        tx_1h_sells = $15,
                        tx_6h_buys = $16,
                        tx_6h_sells = $17,
                        tx_24h_buys = $18,
                        tx_24h_sells = $19,
                        reserve_in_usd = $20,
                        last_price_update = NOW()
                    WHERE mint_address = $21
                `, [
                    pair.priceUsd,
                    pair.marketCap,
                    pair.fdv,
                    pair.volume?.m5,
                    pair.volume?.h1,
                    pair.volume?.h6,
                    pair.volume?.h24,
                    pair.priceChange?.m5,
                    pair.priceChange?.h1,
                    pair.priceChange?.h6,
                    pair.priceChange?.h24,
                    pair.txns?.m5?.buys,
                    pair.txns?.m5?.sells,
                    pair.txns?.h1?.buys,
                    pair.txns?.h1?.sells,
                    pair.txns?.h6?.buys,
                    pair.txns?.h6?.sells,
                    pair.txns?.h24?.buys,
                    pair.txns?.h24?.sells,
                    pair.liquidity?.usd,
                    token.mint_address
                ]);

                const verifyUpdate = await pool().query(`
                    SELECT mint_address, volume_24h, current_price, market_cap_usd, last_price_update
                    FROM onstrument.tokens
                    WHERE mint_address = $1
                `, [token.mint_address]);
                logger.info('Database values after update:', verifyUpdate.rows[0]);
            }

            logger.info(`DexScreener data for first token:`, {
                mint: pairs[0]?.baseToken?.address,
                volume24h: pairs[0]?.volume?.h24,
                currentPrice: pairs[0]?.priceUsd,
                marketCap: pairs[0]?.marketCap
            });

        } catch (error) {
            logger.error('Error in updateAllMetrics:', error);
            throw error;
        }
    }

    public stop(): void {
        this.isRunning = false;
        logger.info('MetricsUpdaterService stopped');
    }
}
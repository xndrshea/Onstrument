import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

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
                // Get next batch of tokens
                const tokensResult = await pool().query(`
                    SELECT mint_address 
                    FROM onstrument.tokens 
                    WHERE last_price_update IS NULL 
                       OR last_price_update < NOW() - INTERVAL '1 minute'
                    ORDER BY last_price_update ASC NULLS FIRST
                    LIMIT 30
                `);

                if (tokensResult.rows.length === 0) {
                    // No tokens need updating, wait a bit
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                // Update the batch
                await this.updateAllMetrics();

                // Rate limit: 200 requests per minute = 1 request per 300ms
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                logger.error('Error in metrics update loop:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    private async updateAllMetrics(): Promise<void> {
        try {
            const tokensResult = await pool().query(`
                SELECT mint_address 
                FROM onstrument.tokens 
                WHERE last_price_update IS NULL 
                   OR last_price_update < NOW() - INTERVAL '5 minutes'
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

            const pairs = await response.json();

            for (const pair of pairs) {
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
                    pair.baseToken.address
                ]);
            }

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
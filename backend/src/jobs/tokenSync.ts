import { DexService } from '../services/dexService';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { PoolClient } from 'pg';
import { DexToken } from '../../../shared/types/token';

export class TokenSyncJob {
    private dexService: DexService;
    private static instance: TokenSyncJob;

    private constructor() {
        this.dexService = new DexService();
    }

    static getInstance(): TokenSyncJob {
        if (!TokenSyncJob.instance) {
            TokenSyncJob.instance = new TokenSyncJob();
        }
        return TokenSyncJob.instance;
    }

    async start() {
        logger.info('Starting TokenSyncJob');

        // Run initial sync
        await this.syncTokens();

        // Schedule regular syncs every 30 seconds
        setInterval(async () => {
            await this.syncTokens();
        }, 30 * 1000);
    }

    private async syncTokens() {
        const client = await pool.connect();
        try {
            logger.info('Starting DEX token sync process...');
            await client.query('BEGIN');

            // Ensure token_stats table exists with correct schema
            await client.query(`
                CREATE TABLE IF NOT EXISTS token_platform.token_stats (
                    token_id INTEGER REFERENCES token_platform.tokens(id),
                    price NUMERIC,
                    volume_24h NUMERIC,
                    liquidity NUMERIC,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (token_id)
                );
            `);

            // Fetch tokens from Raydium API
            const dexTokens = await this.dexService.getTopTokens();

            // Add debug logging
            logger.info(`Raw DEX tokens data:`, {
                sampleToken: dexTokens[0],
                totalTokens: dexTokens.length
            });

            if (!dexTokens || dexTokens.length === 0) {
                logger.warn('No DEX tokens returned from API');
                return;
            }

            // Process each token and collect results
            const processedTokens = [];
            for (const token of dexTokens) {
                if (!token.mintAddress) {
                    logger.warn('Skipping token with no mint address:', token);
                    continue;
                }

                // Clean token data before processing
                const cleanedToken = {
                    ...token,
                    // Split name and remove the trading pair part (e.g., "TOKEN/SOL" -> "TOKEN")
                    name: token.name?.split('/')[0]?.trim() || 'Unknown Token',
                    // Do the same for symbol
                    symbol: token.symbol?.split('/')[0]?.trim() || 'UNKNOWN',
                };

                try {
                    const tokenId = await this.processToken(client, cleanedToken);
                    processedTokens.push(tokenId);
                } catch (error) {
                    logger.error(`Failed to process token ${token.mintAddress}:`, error);
                    // Continue processing other tokens
                    continue;
                }
            }

            // Run verification queries
            const verificationResults = await Promise.all([
                client.query(`
                    SELECT COUNT(*) as token_count 
                    FROM token_platform.tokens 
                    WHERE token_type = 'dex'
                `),
                client.query(`
                    SELECT COUNT(*) as stats_count 
                    FROM token_platform.token_stats ts
                    JOIN token_platform.tokens t ON t.id = ts.token_id
                    WHERE t.token_type = 'dex'
                `),
                client.query(`
                    SELECT COUNT(*) as history_count 
                    FROM token_platform.price_history ph
                    JOIN token_platform.tokens t ON t.mint_address = ph.token_mint_address
                    WHERE t.token_type = 'dex'
                `)
            ]);

            logger.info(`Total DEX tokens in database: ${verificationResults[0].rows[0].token_count}`);
            logger.info(`Total DEX token stats in database: ${verificationResults[1].rows[0].stats_count}`);
            logger.info(`Total DEX price history in database: ${verificationResults[2].rows[0].history_count}`);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Token sync failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    private async processToken(client: PoolClient, token: DexToken) {
        try {
            // Special handling for Wrapped SOL
            if (token.mintAddress === 'So11111111111111111111111111111111111111112') {
                logger.debug('Processing Wrapped SOL token...');
                token.totalSupply = 0;
                token.name = 'Wrapped SOL';
                token.symbol = 'wSOL';
                token.decimals = 9;
            }

            // Truncate symbol if it's too long (max 32 chars)
            const truncatedSymbol = token.symbol?.substring(0, 32) || 'UNKNOWN';

            // Check if token exists
            const result = await client.query(`
                SELECT id, name, symbol FROM token_platform.tokens 
                WHERE mint_address = $1
            `, [token.mintAddress]);

            let tokenId: number;

            if (result.rows.length === 0) {
                // Create new token if it doesn't exist
                const insertResult = await client.query(`
                    INSERT INTO token_platform.tokens (
                        mint_address,
                        name,
                        symbol,
                        token_type,
                        decimals,
                        total_supply,
                        created_at
                    ) VALUES ($1, $2, $3, 'dex', $4, $5, NOW())
                    RETURNING id
                `, [
                    token.mintAddress,
                    token.name || 'Unknown Token',
                    truncatedSymbol,
                    token.decimals || 9,
                    token.totalSupply || 0,
                ]);

                tokenId = insertResult.rows[0].id;
                logger.info(`Created new DEX token: ${truncatedSymbol} (${token.mintAddress})`);
            } else {
                tokenId = result.rows[0].id;
                logger.debug(`Updating existing DEX token: ${result.rows[0].symbol} (${token.mintAddress})`);
            }

            // Update token stats
            await client.query(`
                INSERT INTO token_platform.token_stats (
                    token_id, price, volume_24h, liquidity, last_updated
                ) VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (token_id) 
                DO UPDATE SET
                    price = EXCLUDED.price,
                    volume_24h = EXCLUDED.volume_24h,
                    liquidity = EXCLUDED.liquidity,
                    last_updated = NOW()
            `, [
                tokenId,
                token.price || 0,
                token.volume24h || 0,
                token.liquidity || 0
            ]);

            // Record price history
            await client.query(`
                INSERT INTO token_platform.price_history (
                    token_mint_address, price, total_supply, timestamp, source
                ) VALUES ($1, $2, $3, NOW(), 'dex')
            `, [
                token.mintAddress,
                token.price || 0,
                token.totalSupply || 0
            ]);

            return tokenId;
        } catch (error) {
            logger.error(`Error processing DEX token ${token.mintAddress}:`, error);
            throw error;
        }
    }

    public async startSync(): Promise<void> {
        return this.syncTokens();
    }
}

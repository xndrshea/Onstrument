import axios from 'axios';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { MetadataService } from '../metadata/metadataService';
import { Pool } from 'pg';
import { TokenUpsertData } from '../../types/token';

export interface RaydiumPool {
    type: string;
    programId: string;
    id: string;
    mintA: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
    };
    mintB: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
    };
    price: number;
    mintAmountA: number;
    mintAmountB: number;
    feeRate: number;
    tvl: number;
    day: {
        volume: number;
        volumeQuote: number;
        volumeFee: number;
        apr: number;
        feeApr: number;
        priceMin: number;
        priceMax: number;
    };
    week?: {
        volume: number;
        volumeQuote: number;
        volumeFee: number;
        apr: number;
        feeApr: number;
        priceMin: number;
        priceMax: number;
    };
    month?: {
        volume: number;
        volumeQuote: number;
        volumeFee: number;
        apr: number;
        feeApr: number;
        priceMin: number;
        priceMax: number;
    };
    lpPrice: number;
    lpAmount: number;
    burnPercent: number;
    marketId: string;
    pooltype?: string[];
}

interface GeckoTerminalPool {
    id: string;
    type: string;
    attributes: {
        base_token_price_usd: string;
        base_token_price_native_currency: string;
        quote_token_price_usd: string;
        quote_token_price_native_currency: string;
        base_token_price_quote_token: string;
        quote_token_price_base_token: string;
        address: string;
        name: string;
        pool_created_at: string;
        fdv_usd: string;
        market_cap_usd: string | null;
        price_change_percentage: {
            m5: string;
            h1: string;
            h6: string;
            h24: string;
        };
        transactions: {
            m5: { buys: number; sells: number; buyers: number; sellers: number };
            m15: { buys: number; sells: number; buyers: number; sellers: number };
            m30: { buys: number; sells: number; buyers: number; sellers: number };
            h1: { buys: number; sells: number; buyers: number; sellers: number };
            h24: { buys: number; sells: number; buyers: number; sellers: number };
        };
        volume_usd: {
            m5: string;
            h1: string;
            h6: string;
            h24: string;
        };
        reserve_in_usd: string;
    };
    relationships: {
        base_token: { data: { id: string; type: string; } };
        quote_token: { data: { id: string; type: string; } };
        dex: { data: { id: string; type: string; } };
    };
}

interface RaydiumPoolResponse {
    success: boolean;
    data: {
        data: Array<RaydiumPool>;
    };
}

export class TokenDiscoveryService {
    private static instance: TokenDiscoveryService;
    private metadataService: MetadataService;
    private readonly RAYDIUM_API = 'https://api.raydium.io/v2/main/pairs';
    private readonly GECKO_API = 'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools';
    private readonly client: Pool;
    private readonly logger = logger;
    private readonly SOL_ADDRESSES = [
        'So11111111111111111111111111111111111111112', // WSOL
        'SOL' // Native SOL
    ];

    private constructor(client: Pool) {
        this.client = client;
        this.metadataService = MetadataService.getInstance();
        // Ensure SOL exists in database once when service starts
        this.ensureTokenMetadata('So11111111111111111111111111111111111111112').catch(err =>
            this.logger.error('Failed to ensure SOL metadata:', err)
        );
    }

    static getInstance(): TokenDiscoveryService {
        if (!TokenDiscoveryService.instance) {
            TokenDiscoveryService.instance = new TokenDiscoveryService(pool);
        }
        return TokenDiscoveryService.instance;
    }

    async discoverAndUpdatePools(): Promise<void> {
        try {
            // Fetch from both APIs
            const [raydiumPools, geckoTerminalPools] = await Promise.all([
                this.fetchRaydiumPools(),
                this.fetchGeckoTerminalPools()
            ]);

            // Process pools and update database
            await this.processPools(raydiumPools, geckoTerminalPools);

            // Update market caps after processing all pools
            await this.updateMarketCaps();
        } catch (error) {
            logger.error('Error in pool discovery:', error);
        }
    }

    private async processPools(raydiumPools: RaydiumPool[], geckoTerminalPools: any[]): Promise<void> {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const rPool of raydiumPools) {

                // Queue metadata fetching for new tokens
                await this.ensureTokenMetadata(rPool.mintA.address);
                await this.ensureTokenMetadata(rPool.mintB.address);

                // Update pool statistics
                await this.updatePoolStats(client, rPool);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async ensureTokenMetadata(mintAddress: string): Promise<void> {
        try {

            const result = await pool.query(
                'SELECT mint_address, metadata_status FROM token_platform.tokens WHERE mint_address = $1',
                [mintAddress]
            );

            // If token doesn't exist or metadata is pending/null, queue it
            if (!result.rows.length || !result.rows[0].metadata_status || result.rows[0].metadata_status === 'pending') {
                await this.metadataService.queueMetadataUpdate(mintAddress, 'discovery_service');

                // Update metadata_status to 'pending' if it's null
                if (!result.rows[0]?.metadata_status) {
                    await pool.query(
                        'UPDATE token_platform.tokens SET metadata_status = $1 WHERE mint_address = $2',
                        ['pending', mintAddress]
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Error ensuring token metadata: ${(error as Error).message}`, {
                mintAddress,
                error: error as Error
            });
        }
    }

    public async fetchRaydiumPools(): Promise<RaydiumPool[]> {
        try {
            console.log('Attempting to fetch Raydium pools...');
            const response = await axios.get<RaydiumPoolResponse>(
                'https://api-v3.raydium.io/pools/info/list',
                {
                    params: {
                        poolType: 'all',
                        poolSortField: 'volume24h',
                        sortType: 'desc',
                        pageSize: 20,
                        page: 1
                    }
                }
            );

            if (!response.data.success) {
                throw new Error('Raydium API request failed');
            }

            const allPools = response.data.data.data;

            // Only ensure metadata for non-SOL tokens
            for (const pool of allPools) {
                await Promise.all([
                    // Only queue non-SOL tokens
                    !this.SOL_ADDRESSES.includes(pool.mintA.address) && this.ensureTokenMetadata(pool.mintA.address),
                    !this.SOL_ADDRESSES.includes(pool.mintB.address) && this.ensureTokenMetadata(pool.mintB.address)
                ].filter(Boolean)); // Filter out false values from the Promise.all array

                await this.processRaydiumToken(pool);
            }

            return allPools;
        } catch (error) {
            console.error('Full error details:', error);
            logger.error('Error fetching Raydium pools:', {
                message: (error as Error).message,
                stack: (error as Error).stack,
                response: (error as any).response?.data
            });
            throw error;
        }
    }

    private async processRaydiumToken(pool: RaydiumPool): Promise<void> {
        try {
            // Get SOL's current price from database using mint address
            const solResult = await this.client.query(
                'SELECT current_price FROM token_platform.tokens WHERE mint_address = $1',
                ['So11111111111111111111111111111111111111112']
            );
            const solPriceUSD = solResult.rows[0]?.current_price;

            const isBaseSol = this.SOL_ADDRESSES.includes(pool.mintA.address);

            // Adjust calculation based on decimals
            const priceSol = isBaseSol
                ? (pool.mintAmountB / Math.pow(10, pool.mintB.decimals)) / (pool.mintAmountA / Math.pow(10, pool.mintA.decimals))
                : (pool.mintAmountA / Math.pow(10, pool.mintA.decimals)) / (pool.mintAmountB / Math.pow(10, pool.mintB.decimals));

            const priceUSD = priceSol * solPriceUSD;

            console.log(`Raydium - ${isBaseSol ? pool.mintB.address : pool.mintA.address}: priceUSD: ${priceUSD}, priceSol: ${priceSol}, decimalsA: ${pool.mintA.decimals}, decimalsB: ${pool.mintB.decimals}`);

            const tokenData: TokenUpsertData = {
                address: isBaseSol ? pool.mintB.address : pool.mintA.address,
                token_type: 'dex' as const,
                name: isBaseSol ? pool.mintB.name : pool.mintA.name,
                symbol: isBaseSol ? pool.mintB.symbol : pool.mintA.symbol,
                decimals: isBaseSol ? pool.mintB.decimals : pool.mintA.decimals,
                current_price: priceUSD,
                price_sol: priceSol,
                // Standardize volume fields
                volume_24h: pool.day?.volume || 0,        // Use this as primary 24h volume
                volume_7d: pool.week?.volume || 0,        // Use this as primary 7d volume
                volume_30d: pool.month?.volume || 0,      // Use this as primary 30d volume
                tvl: pool.tvl,
                // Standardize price changes
                price_change_24h: this.calculatePriceChange(pool.day?.priceMin, pool.day?.priceMax),
                price_change_7d: this.calculatePriceChange(pool.week?.priceMin, pool.week?.priceMax),
                price_change_30d: this.calculatePriceChange(pool.month?.priceMin, pool.month?.priceMax),
                // Store APR data
                apr_24h: pool.day?.apr || 0,
                apr_7d: pool.week?.apr || 0,
                apr_30d: pool.month?.apr || 0,
                // Additional Raydium-specific data
                fee_rate: pool.feeRate,
                lp_price: pool.lpPrice,
                lp_amount: pool.lpAmount,
                burn_percent: pool.burnPercent,
                mint_amount_a: pool.mintAmountA,
                mint_amount_b: pool.mintAmountB,
                market_id: pool.marketId,
                program_id: pool.programId,
                pool_type: pool.pooltype?.join(','),
                token_source: 'raydium'
            };

            await this.upsertToken(tokenData);
        } catch (error) {
            this.logger.error('Failed to process Raydium token:', error);
        }
    }

    public async fetchGeckoTerminalPools(): Promise<GeckoTerminalPool[]> {
        try {
            const response = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools', {
                params: { page: 1 },
                headers: { 'Accept': 'application/json;version=20230302' }
            });

            const allPools = response.data?.data || [];

            for (const pool of allPools) {
                const baseTokenId = pool.relationships.base_token.data.id.split('_')[1];
                const quoteTokenId = pool.relationships.quote_token.data.id.split('_')[1];

                await Promise.all([
                    // Only queue non-SOL tokens
                    !this.SOL_ADDRESSES.includes(baseTokenId) && this.ensureTokenMetadata(baseTokenId),
                    !this.SOL_ADDRESSES.includes(quoteTokenId) && this.ensureTokenMetadata(quoteTokenId)
                ].filter(Boolean));

                await this.processGeckoToken(pool);
            }

            return allPools;
        } catch (error) {
            logger.error('Error fetching GeckoTerminal pools:', error);
            throw error;
        }
    }

    private async processGeckoToken(pool: GeckoTerminalPool): Promise<void> {
        try {
            const attributes = pool.attributes;
            const baseTokenId = pool.relationships.base_token.data.id.split('_')[1];
            const quoteTokenId = pool.relationships.quote_token.data.id.split('_')[1];

            // Save SOL's price data first
            await this.upsertToken({
                address: 'So11111111111111111111111111111111111111112',
                token_type: 'dex',
                current_price: parseFloat(attributes.quote_token_price_usd),
                price_sol: 1,
                token_source: 'geckoterminal'
            });

            const isBaseSol = this.SOL_ADDRESSES.includes(baseTokenId);

            const priceUSD = isBaseSol
                ? parseFloat(attributes.quote_token_price_usd)
                : parseFloat(attributes.base_token_price_usd);
            const priceSol = isBaseSol
                ? parseFloat(attributes.quote_token_price_native_currency)
                : parseFloat(attributes.base_token_price_native_currency);

            console.log(`Gecko - ${isBaseSol ? quoteTokenId : baseTokenId}: priceUSD: ${priceUSD}, priceSol: ${priceSol}`);

            const tokenData: TokenUpsertData = {
                address: isBaseSol ? quoteTokenId : baseTokenId,
                token_type: 'dex' as const,
                current_price: isBaseSol
                    ? parseFloat(attributes.quote_token_price_usd)
                    : parseFloat(attributes.base_token_price_usd),
                price_sol: isBaseSol
                    ? parseFloat(attributes.quote_token_price_native_currency)
                    : parseFloat(attributes.base_token_price_native_currency),
                price_quote_token: isBaseSol
                    ? parseFloat(attributes.quote_token_price_base_token)
                    : parseFloat(attributes.base_token_price_quote_token),
                // Standard volume fields
                volume_24h: parseFloat(attributes.volume_usd.h24),
                volume_1h: parseFloat(attributes.volume_usd.h1),
                volume_6h: parseFloat(attributes.volume_usd.h6),
                volume_5m: parseFloat(attributes.volume_usd.m5),
                // Standard price change fields
                price_change_24h: parseFloat(attributes.price_change_percentage.h24),
                price_change_1h: parseFloat(attributes.price_change_percentage.h1),
                price_change_6h: parseFloat(attributes.price_change_percentage.h6),
                price_change_5m: parseFloat(attributes.price_change_percentage.m5),
                // Market data
                market_cap_usd: attributes.market_cap_usd ? parseFloat(attributes.market_cap_usd) : null,
                fdv_usd: parseFloat(attributes.fdv_usd),
                // Transaction data
                tx_5m_buys: attributes.transactions.m5.buys,
                tx_5m_sells: attributes.transactions.m5.sells,
                tx_5m_buyers: attributes.transactions.m5.buyers,
                tx_5m_sellers: attributes.transactions.m5.sellers,
                tx_15m_buys: attributes.transactions.m15.buys,
                tx_15m_sells: attributes.transactions.m15.sells,
                tx_15m_buyers: attributes.transactions.m15.buyers,
                tx_15m_sellers: attributes.transactions.m15.sellers,
                tx_30m_buys: attributes.transactions.m30.buys,
                tx_30m_sells: attributes.transactions.m30.sells,
                tx_30m_buyers: attributes.transactions.m30.buyers,
                tx_30m_sellers: attributes.transactions.m30.sellers,
                tx_1h_buys: attributes.transactions.h1.buys,
                tx_1h_sells: attributes.transactions.h1.sells,
                tx_1h_buyers: attributes.transactions.h1.buyers,
                tx_1h_sellers: attributes.transactions.h1.sellers,
                tx_24h_buys: attributes.transactions.h24.buys,
                tx_24h_sells: attributes.transactions.h24.sells,
                tx_24h_buyers: attributes.transactions.h24.buyers,
                tx_24h_sellers: attributes.transactions.h24.sellers,
                // Additional data
                reserve_in_usd: parseFloat(attributes.reserve_in_usd),
                pool_created_at: attributes.pool_created_at,
                token_source: 'geckoterminal'
            };

            await this.upsertToken(tokenData);
        } catch (error) {
            this.logger.error('Failed to process GeckoTerminal token:', error);
        }
    }

    private async upsertToken(data: TokenUpsertData): Promise<void> {
        try {
            const query = `
                INSERT INTO token_platform.tokens (
                    mint_address,
                    token_type,
                    current_price,
                    price_sol,
                    volume_5m,
                    volume_1h,
                    volume_6h,
                    volume_24h,
                    volume_7d,
                    volume_30d,
                    price_change_5m,
                    price_change_1h,
                    price_change_6h,
                    price_change_24h,
                    price_change_7d,
                    price_change_30d,
                    apr_24h,
                    apr_7d,
                    apr_30d,
                    tvl,
                    tx_5m_buys,
                    tx_5m_sells,
                    tx_5m_buyers,
                    tx_5m_sellers,
                    tx_1h_buys,
                    tx_1h_sells,
                    tx_1h_buyers,
                    tx_1h_sellers,
                    tx_6h_buys,
                    tx_6h_sells,
                    tx_6h_buyers,
                    tx_6h_sellers,
                    tx_24h_buys,
                    tx_24h_sells,
                    tx_24h_buyers,
                    tx_24h_sellers,
                    token_source,
                    last_price_update
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                    $29, $30, $31, $32, $33, $34, $35, $36, $37, CURRENT_TIMESTAMP
                )
                ON CONFLICT (mint_address) DO UPDATE SET
                    current_price = EXCLUDED.current_price,
                    price_sol = EXCLUDED.price_sol,
                    volume_5m = EXCLUDED.volume_5m,
                    volume_1h = EXCLUDED.volume_1h,
                    volume_6h = EXCLUDED.volume_6h,
                    volume_24h = EXCLUDED.volume_24h,
                    volume_7d = EXCLUDED.volume_7d,
                    volume_30d = EXCLUDED.volume_30d,
                    price_change_5m = EXCLUDED.price_change_5m,
                    price_change_1h = EXCLUDED.price_change_1h,
                    price_change_6h = EXCLUDED.price_change_6h,
                    price_change_24h = EXCLUDED.price_change_24h,
                    price_change_7d = EXCLUDED.price_change_7d,
                    price_change_30d = EXCLUDED.price_change_30d,
                    apr_24h = EXCLUDED.apr_24h,
                    apr_7d = EXCLUDED.apr_7d,
                    apr_30d = EXCLUDED.apr_30d,
                    tvl = EXCLUDED.tvl,
                    tx_5m_buys = EXCLUDED.tx_5m_buys,
                    tx_5m_sells = EXCLUDED.tx_5m_sells,
                    tx_5m_buyers = EXCLUDED.tx_5m_buyers,
                    tx_5m_sellers = EXCLUDED.tx_5m_sellers,
                    tx_1h_buys = EXCLUDED.tx_1h_buys,
                    tx_1h_sells = EXCLUDED.tx_1h_sells,
                    tx_1h_buyers = EXCLUDED.tx_1h_buyers,
                    tx_1h_sellers = EXCLUDED.tx_1h_sellers,
                    tx_6h_buys = EXCLUDED.tx_6h_buys,
                    tx_6h_sells = EXCLUDED.tx_6h_sells,
                    tx_6h_buyers = EXCLUDED.tx_6h_buyers,
                    tx_6h_sellers = EXCLUDED.tx_6h_sellers,
                    tx_24h_buys = EXCLUDED.tx_24h_buys,
                    tx_24h_sells = EXCLUDED.tx_24h_sells,
                    tx_24h_buyers = EXCLUDED.tx_24h_buyers,
                    tx_24h_sellers = EXCLUDED.tx_24h_sellers,
                    token_source = EXCLUDED.token_source,
                    last_price_update = CURRENT_TIMESTAMP
            `;

            await pool.query(query, [
                data.address,
                data.token_type,
                data.current_price,
                data.price_sol,
                data.volume_5m || null,
                data.volume_1h || null,
                data.volume_6h || null,
                data.volume_24h || null,
                data.volume_7d || null,
                data.volume_30d || null,
                data.price_change_5m || null,
                data.price_change_1h || null,
                data.price_change_6h || null,
                data.price_change_24h || null,
                data.price_change_7d || null,
                data.price_change_30d || null,
                data.apr_24h || null,
                data.apr_7d || null,
                data.apr_30d || null,
                data.tvl || null,
                data.tx_5m_buys || null,
                data.tx_5m_sells || null,
                data.tx_5m_buyers || null,
                data.tx_5m_sellers || null,
                data.tx_1h_buys || null,
                data.tx_1h_sells || null,
                data.tx_1h_buyers || null,
                data.tx_1h_sellers || null,
                data.tx_6h_buys || null,
                data.tx_6h_sells || null,
                data.tx_6h_buyers || null,
                data.tx_6h_sellers || null,
                data.tx_24h_buys || null,
                data.tx_24h_sells || null,
                data.tx_24h_buyers || null,
                data.tx_24h_sellers || null,
                data.token_source
            ]);
        } catch (error) {
            logger.error('Error upserting token:', {
                error,
                tokenAddress: data.address
            });
            throw error;
        }
    }

    private calculatePriceChange(min?: number, max?: number): number {
        if (!min || !max) return 0;
        return ((max - min) / min) * 100;
    }

    private async updatePoolStats(client: any, pool: RaydiumPool): Promise<void> {
        // Update token statistics
        await client.query(`
            UPDATE token_platform.tokens 
            SET 
                current_price = $1,
                volume_24h = $2,
                price_change_24h = $3,
                token_source = 'raydium',
                last_price_update = CURRENT_TIMESTAMP
            WHERE mint_address = $4
        `, [
            pool.price,
            pool.day.volume,
            this.calculatePriceChange(pool.day.priceMin, pool.day.priceMax),
            pool.mintA.address
        ]);
    }

    async updateMarketCaps(): Promise<void> {
        try {
            const query = `
                WITH market_cap_updates AS (
                    SELECT 
                        mint_address,
                        current_price,
                        supply->>'total_supply' as total_supply,
                        CASE 
                            WHEN supply->>'total_supply' IS NOT NULL AND current_price IS NOT NULL
                            THEN (supply->>'total_supply')::numeric * current_price
                            ELSE NULL
                        END as calculated_market_cap
                    FROM token_platform.tokens 
                    WHERE token_type = 'dex'
                    AND current_price IS NOT NULL
                    AND (
                        last_price_update >= NOW() - INTERVAL '5 minutes'
                        OR market_cap_usd IS NULL
                    )
                )
                UPDATE token_platform.tokens t
                SET 
                    market_cap_usd = u.calculated_market_cap,
                    last_updated = CURRENT_TIMESTAMP
                FROM market_cap_updates u
                WHERE t.mint_address = u.mint_address
                AND t.market_cap_usd IS DISTINCT FROM u.calculated_market_cap
                RETURNING t.mint_address, t.market_cap_usd, t.current_price
            `;

            const result = await pool.query(query);

            this.logger.info(`Updated market caps for ${result.rowCount} tokens`, {
                firstFewUpdates: result.rows.slice(0, 3),
                totalUpdated: result.rowCount
            });

        } catch (error) {
            this.logger.error('Error updating market caps:', {
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

}

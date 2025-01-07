import axios from 'axios';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { MetadataService } from '../metadata/metadataService';
import { Pool } from 'pg';
import { TokenUpsertData } from '../../types/token';

export interface RaydiumPool {
    id: string;
    type: string;
    programId: string;
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
    tvl: number;
    day: {
        volume: number;
        volumeQuote: number;
        priceMin: number;
        priceMax: number;
        apr: number;
    };
    week?: {
        volume: number;
        volumeQuote: number;
        priceMin: number;
        priceMax: number;
        apr: number;
    };
    month?: {
        volume: number;
        volumeQuote: number;
        priceMin: number;
        priceMax: number;
        apr: number;
    };
}

interface GeckoTerminalPool {
    id: string;
    type: string;
    attributes: {
        base_token_price_usd: string;
        quote_token_price_usd: string;
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
            h1: { buys: number; sells: number; buyers: number; sellers: number };
            h6: { buys: number; sells: number; buyers: number; sellers: number };
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
        base_token: {
            data: {
                id: string;
                type: string;
            }
        };
        quote_token: {
            data: {
                id: string;
                type: string;
            }
        };
        dex: {
            data: {
                id: string;
                type: string;
            }
        };
    };
}

interface RaydiumPoolResponse {
    id: string;
    success: boolean;
    data: {
        count: number;
        data: Array<{
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
            tvl: number;
            day: {
                volume: number;
                volumeQuote: number;
                priceMin: number;
                priceMax: number;
                apr: number;
                feeApr: number;
            };
            feeRate: number;
        }>;
    };
}

export class TokenDiscoveryService {
    private static instance: TokenDiscoveryService;
    private metadataService: MetadataService;
    private readonly RAYDIUM_API = 'https://api.raydium.io/v2/main/pairs';
    private readonly GECKO_API = 'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools';
    private readonly client: Pool;
    private readonly logger = logger;

    private constructor(client: Pool) {
        this.client = client;
        this.metadataService = MetadataService.getInstance();
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
        const result = await pool.query(
            'SELECT metadata_status FROM token_platform.tokens WHERE mint_address = $1',
            [mintAddress]
        );

        if (!result.rows.length || result.rows[0].metadata_status === 'pending') {
            await this.metadataService.queueMetadataUpdate(mintAddress, 'discovery_service');
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

            console.log('\n=== RAW RAYDIUM API RESPONSE ===');
            console.log(JSON.stringify(response.data, null, 2));

            if (!response.data.success) {
                throw new Error('Raydium API request failed');
            }

            const allPools = response.data.data.data;

            // Ensure metadata for each pool's tokens
            for (const pool of allPools) {
                await this.ensureTokenMetadata(pool.mintA.address);
                await this.ensureTokenMetadata(pool.mintB.address);
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
            // Add default token type if not present
            const tokenData = {
                address: pool.mintA.address,
                token_type: 'dex' as const,
                name: pool.mintA.name,
                symbol: pool.mintA.symbol,
                decimals: pool.mintA.decimals,
                current_price: pool.price,
                volume_24h: pool.day?.volume || 0,
                volume_7d: pool.week?.volume || 0,
                volume_30d: pool.month?.volume || 0,
                tvl: pool.tvl,
                price_change_24h: this.calculatePriceChange(pool.day?.priceMin, pool.day?.priceMax),
                price_change_7d: this.calculatePriceChange(pool.week?.priceMin, pool.week?.priceMax),
                price_change_30d: this.calculatePriceChange(pool.month?.priceMin, pool.month?.priceMax),
                apr_24h: pool.day?.apr || 0,
                apr_7d: pool.week?.apr || 0,
                apr_30d: pool.month?.apr || 0,
                token_source: 'raydium'
            };

            await this.upsertToken(tokenData);
        } catch (error) {
            this.logger.error(`Error processing Raydium token: ${(error as Error).message}`, {
                error: error as Error,
                pool
            });
            throw error;
        }
    }

    public async fetchGeckoTerminalPools(): Promise<GeckoTerminalPool[]> {
        try {
            const response = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools', {
                params: { page: 1 },
                headers: { 'Accept': 'application/json;version=20230302' }
            });

            console.log('\n=== RAW GECKO TERMINAL API RESPONSE ===');
            console.log(JSON.stringify(response.data, null, 2));

            const allPools = response.data?.data || [];

            // Ensure metadata for each pool's tokens
            for (const pool of allPools) {
                const baseTokenId = pool.relationships.base_token.data.id.split('_')[1];
                await this.ensureTokenMetadata(baseTokenId);
                await this.processGeckoToken(pool);
            }

            return allPools;
        } catch (error) {
            logger.error('Error fetching GeckoTerminal pools:', error);
            throw error;
        }
    }

    private async processGeckoToken(pool: GeckoTerminalPool): Promise<void> {
        const attributes = pool.attributes;
        const baseTokenId = pool.relationships.base_token.data.id.split('_')[1];

        await this.upsertToken({
            address: baseTokenId,
            token_type: 'dex',
            current_price: parseFloat(attributes.base_token_price_usd),
            volume_5m: parseFloat(attributes.volume_usd.m5),
            volume_1h: parseFloat(attributes.volume_usd.h1),
            volume_6h: parseFloat(attributes.volume_usd.h6),
            volume_24h: parseFloat(attributes.volume_usd.h24),
            tx_5m_buys: attributes.transactions.m5.buys,
            tx_5m_sells: attributes.transactions.m5.sells,
            tx_5m_buyers: attributes.transactions.m5.buyers,
            tx_5m_sellers: attributes.transactions.m5.sellers,
            tx_1h_buys: attributes.transactions.h1.buys,
            tx_1h_sells: attributes.transactions.h1.sells,
            tx_1h_buyers: attributes.transactions.h1.buyers,
            tx_1h_sellers: attributes.transactions.h1.sellers,
            tx_6h_buys: attributes.transactions.h6?.buys || 0,
            tx_6h_sells: attributes.transactions.h6?.sells || 0,
            tx_6h_buyers: attributes.transactions.h6?.buyers || 0,
            tx_6h_sellers: attributes.transactions.h6?.sellers || 0,
            tx_24h_buys: attributes.transactions.h24.buys,
            tx_24h_sells: attributes.transactions.h24.sells,
            token_source: 'geckoterminal'
        });
    }

    private async upsertToken(data: TokenUpsertData): Promise<void> {
        try {
            const query = `
                INSERT INTO token_platform.tokens (
                    mint_address,
                    token_type,
                    current_price,
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
                    $29, $30, $31, $32, $33, $34, $35, $36, CURRENT_TIMESTAMP
                )
                ON CONFLICT (mint_address) DO UPDATE SET
                    current_price = EXCLUDED.current_price,
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

}

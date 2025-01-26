import axios, { AxiosError } from 'axios';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { MetadataService } from '../metadata/metadataService';
import type { Pool } from 'pg';
import type { TokenUpsertData } from '../../types/token';
import { wsManager } from '../websocket/WebSocketManager';
import type { PoolClient } from 'pg';

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

interface PriceUpdate {
    tokenAddress: string;
    price: number;
    timestamp: Date;
    source: string;
}

interface JupiterResponse {
    data: {
        [key: string]: {
            id: string;
            type: 'derivedPrice' | 'buyPrice';
            price: string;
        }
    };
    timeTaken: number;
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
    private tokenPriceQueue: Set<string> = new Set();
    private queueTimer: NodeJS.Timeout | null = null;
    private readonly JUPITER_PRICE_API = 'https://api.jup.ag/price/v2';
    private readonly BATCH_SIZE = 100;
    private readonly QUEUE_TIMEOUT = 5000; // 5 seconds
    private readonly SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
    private readonly retryDelay = 1000; // 1 second
    private readonly maxRetries = 5;
    private isFetching: boolean = false;
    private readonly JUPITER_BATCH_SIZE = 100; // Maximum tokens per Jupiter API request
    private readonly RATE_LIMIT_PER_MIN = 600; // Jupiter's rate limit
    private readonly MIN_DELAY_MS = (60 * 1000) / this.RATE_LIMIT_PER_MIN; // Minimum delay between requests

    private constructor(client: Pool) {
        this.client = client;
        this.metadataService = MetadataService.getInstance();
    }

    static getInstance(): TokenDiscoveryService {
        if (!TokenDiscoveryService.instance) {
            TokenDiscoveryService.instance = new TokenDiscoveryService(pool());
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
        const client = await pool().connect();
        const BATCH_SIZE = 20;

        try {
            await client.query('BEGIN');

            // Collect all unique token addresses
            const tokenAddresses = new Set<string>();
            raydiumPools.forEach(pool => {
                tokenAddresses.add(pool.mintA.address);
                tokenAddresses.add(pool.mintB.address);
            });

            // Process metadata in batches
            const addressArray = Array.from(tokenAddresses);
            const batches: string[][] = [];

            for (let i = 0; i < addressArray.length; i += BATCH_SIZE) {
                batches.push(addressArray.slice(i, i + BATCH_SIZE));
            }

            // Process each batch
            for (const batch of batches) {
                await this.metadataService.queueMetadataUpdate(batch, 'raydium');
            }

            // Update pool statistics
            for (const rPool of raydiumPools) {
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
            // We should check FIRST if we already have fetched metadata
            const existingToken = await pool().query(
                'SELECT metadata_status FROM onstrument.tokens WHERE mint_address = $1',
                [mintAddress]
            );

            // Only proceed if we don't have the token or its metadata isn't fetched
            if (!existingToken.rows.length || existingToken.rows[0].metadata_status !== 'fetched') {
                await pool().query(
                    `INSERT INTO onstrument.tokens 
                    (mint_address, metadata_status, created_at, last_metadata_fetch, token_type) 
                    VALUES ($1, 'pending', NOW(), NOW(), 'dex')
                    ON CONFLICT (mint_address) 
                    DO UPDATE SET 
                        metadata_status = CASE 
                            WHEN tokens.metadata_status != 'fetched' 
                            THEN 'pending' 
                            ELSE tokens.metadata_status 
                        END`,
                    [mintAddress]
                );

                await this.metadataService.queueMetadataUpdate([mintAddress], 'discovery_service');
            }
        } catch (error) {
            logger.error('TokenDiscoveryService: Error ensuring token metadata:', {
                mintAddress,
                error: error as Error
            });
        }
    }

    public async fetchRaydiumPools(): Promise<RaydiumPool[]> {
        try {
            const allPools: RaydiumPool[] = [];

            // Fetch both pages
            for (let page = 1; page <= 2; page++) {
                const response = await axios.get<RaydiumPoolResponse>(
                    'https://api-v3.raydium.io/pools/info/list',
                    {
                        params: {
                            poolType: 'all',
                            poolSortField: 'volume24h',
                            sortType: 'desc',
                            pageSize: 1000,
                            page: page
                        }
                    }
                );

                if (!response.data.success) {
                    throw new Error(`Raydium API request failed for page ${page}`);
                }

                allPools.push(...response.data.data.data);
            }

            // Process all pools in batches
            for (const pool of allPools) {
                await Promise.all([
                    !this.SOL_ADDRESSES.includes(pool.mintA.address) && this.ensureTokenMetadata(pool.mintA.address),
                    !this.SOL_ADDRESSES.includes(pool.mintB.address) && this.ensureTokenMetadata(pool.mintB.address)
                ].filter(Boolean));

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
            // Queue the non-SOL token for price updates
            if (this.SOL_ADDRESSES.includes(pool.mintA.address)) {
                this.queueTokenForPriceUpdate(pool.mintB.address);
            } else if (this.SOL_ADDRESSES.includes(pool.mintB.address)) {
                this.queueTokenForPriceUpdate(pool.mintA.address);
            }

            // Store all non-price metrics
            const tokenData: TokenUpsertData = {
                address: pool.mintA.address,
                token_type: 'dex',
                name: pool.mintA.name,
                symbol: pool.mintA.symbol,
                decimals: pool.mintA.decimals,
                volume_24h: pool.day?.volume || 0,
                volume_7d: pool.week?.volume || 0,
                volume_30d: pool.month?.volume || 0,
                tvl: pool.tvl,
                fee_rate: pool.feeRate,
                lp_price: pool.lpPrice,
                lp_amount: pool.lpAmount,
                burn_percent: pool.burnPercent,
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
        if (this.isFetching) {
            return [];
        }

        this.isFetching = true;
        try {
            const allPools: GeckoTerminalPool[] = [];
            const totalPages = 10;

            for (let page = 1; page <= totalPages; page++) {
                try {
                    const pools = await this.fetchWithRetry(page);
                    allPools.push(...pools);
                } catch (error) {
                    this.logger.error(`Error fetching page ${page}:`, error);
                }
            }

            return allPools;
        } catch (error) {
            this.logger.error('Error fetching GeckoTerminal pools:', error);
            throw error;
        } finally {
            this.isFetching = false;
        }
    }

    private async fetchWithRetry(page: number, retryCount = 0): Promise<any> {
        try {
            await this.delay(this.retryDelay);

            const response = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools', {
                params: {
                    page,
                    duration: '5m',
                    include: 'base_token,quote_token'
                },
                headers: { 'Accept': 'application/json;version=20230302' }
            });

            const pools = response.data?.data || [];

            // Process pools from this page
            for (const pool of pools) {
                const baseTokenId = pool.relationships.base_token.data.id.split('_')[1];
                const quoteTokenId = pool.relationships.quote_token.data.id.split('_')[1];

                await Promise.all([
                    !this.SOL_ADDRESSES.includes(baseTokenId) && this.ensureTokenMetadata(baseTokenId),
                    !this.SOL_ADDRESSES.includes(quoteTokenId) && this.ensureTokenMetadata(quoteTokenId)
                ].filter(Boolean));

                await this.processGeckoToken(pool);
            }

            return pools;
        } catch (error) {
            if (error instanceof AxiosError && error.response?.status === 429) {
                if (retryCount >= this.maxRetries) {
                    throw new Error('Max retries reached for rate limiting');
                }

                const retryAfter = parseInt(error.response.headers['retry-after'] || '0');
                const backoffDelay = retryAfter * 1000 || this.retryDelay * Math.pow(2, retryCount);

                this.logger.info(`Rate limited, waiting ${backoffDelay}ms before retry ${retryCount + 1}`);
                await this.delay(backoffDelay);

                return this.fetchWithRetry(page, retryCount + 1);
            }
            throw error;
        }
    }

    private async processGeckoToken(pool: GeckoTerminalPool): Promise<void> {
        try {
            const attributes = pool.attributes;
            const baseTokenId = pool.relationships.base_token.data.id.split('_')[1];
            const quoteTokenId = pool.relationships.quote_token.data.id.split('_')[1];

            // Skip if either token is SOL
            if (this.SOL_ADDRESSES.includes(baseTokenId) || this.SOL_ADDRESSES.includes(quoteTokenId)) {
                return;
            }

            const isBaseSol = this.SOL_ADDRESSES.includes(baseTokenId);
            const currentPrice = isBaseSol
                ? parseFloat(attributes.quote_token_price_usd)
                : parseFloat(attributes.base_token_price_usd);

            const tokenData: TokenUpsertData = {
                address: isBaseSol ? quoteTokenId : baseTokenId,
                token_type: 'dex' as const,
                current_price: currentPrice,
                price_sol: isBaseSol
                    ? parseFloat(attributes.quote_token_price_native_currency)
                    : parseFloat(attributes.base_token_price_native_currency),
                price_quote_token: isBaseSol
                    ? parseFloat(attributes.quote_token_price_base_token)
                    : parseFloat(attributes.base_token_price_quote_token),
                market_cap_usd: attributes.market_cap_usd ?
                    parseFloat(attributes.market_cap_usd) :
                    parseFloat(attributes.fdv_usd),
                volume_24h: parseFloat(attributes.volume_usd.h24),
                volume_1h: parseFloat(attributes.volume_usd.h1),
                volume_6h: parseFloat(attributes.volume_usd.h6),
                volume_5m: parseFloat(attributes.volume_usd.m5),
                price_change_24h: parseFloat(attributes.price_change_percentage.h24),
                price_change_1h: parseFloat(attributes.price_change_percentage.h1),
                price_change_6h: parseFloat(attributes.price_change_percentage.h6),
                price_change_5m: parseFloat(attributes.price_change_percentage.m5),
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
                reserve_in_usd: parseFloat(attributes.reserve_in_usd),
                pool_created_at: attributes.pool_created_at,
                token_source: 'geckoterminal'
            };

            await this.upsertToken(tokenData);
            wsManager.broadcastPrice(tokenData.address, tokenData.current_price || 0);
        } catch (error) {
            this.logger.error('Failed to process GeckoTerminal token:', error);
        }
    }

    private async upsertToken(data: TokenUpsertData): Promise<void> {
        try {
            // Build dynamic query parts based on provided data
            const insertColumns: string[] = ['mint_address', 'token_type'];
            const insertValues: any[] = [data.address, data.token_type];
            const updateParts: string[] = [];
            let valueCounter = 3; // Starting from $3 since $1 and $2 are used

            // Helper function to add a field if it exists
            const addField = (fieldName: string, value: any) => {
                if (value !== undefined && value !== null) {
                    insertColumns.push(fieldName);
                    insertValues.push(value);
                    updateParts.push(`${fieldName} = $${valueCounter}`);
                    valueCounter++;
                }
            };

            // Add each field if it exists
            addField('current_price', data.current_price);
            addField('price_sol', data.price_sol);
            addField('volume_5m', data.volume_5m);
            addField('volume_1h', data.volume_1h);
            addField('volume_6h', data.volume_6h);
            addField('volume_24h', data.volume_24h);
            addField('volume_7d', data.volume_7d);
            addField('volume_30d', data.volume_30d);
            addField('price_change_5m', data.price_change_5m);
            addField('price_change_1h', data.price_change_1h);
            addField('price_change_6h', data.price_change_6h);
            addField('price_change_24h', data.price_change_24h);
            addField('price_change_7d', data.price_change_7d);
            addField('price_change_30d', data.price_change_30d);
            addField('apr_24h', data.apr_24h);
            addField('apr_7d', data.apr_7d);
            addField('apr_30d', data.apr_30d);
            addField('tvl', data.tvl);
            addField('tx_5m_buys', data.tx_5m_buys);
            addField('tx_5m_sells', data.tx_5m_sells);
            addField('tx_5m_buyers', data.tx_5m_buyers);
            addField('tx_5m_sellers', data.tx_5m_sellers);
            addField('tx_1h_buys', data.tx_1h_buys);
            addField('tx_1h_sells', data.tx_1h_sells);
            addField('tx_1h_buyers', data.tx_1h_buyers);
            addField('tx_1h_sellers', data.tx_1h_sellers);
            addField('tx_6h_buys', data.tx_6h_buys);
            addField('tx_6h_sells', data.tx_6h_sells);
            addField('tx_6h_buyers', data.tx_6h_buyers);
            addField('tx_6h_sellers', data.tx_6h_sellers);
            addField('tx_24h_buys', data.tx_24h_buys);
            addField('tx_24h_sells', data.tx_24h_sells);
            addField('tx_24h_buyers', data.tx_24h_buyers);
            addField('tx_24h_sellers', data.tx_24h_sellers);
            addField('token_source', data.token_source);
            addField('market_cap_usd', data.market_cap_usd);

            // Always add last_price_update for inserts
            insertColumns.push('last_price_update');
            insertValues.push('NOW()');

            const query = `
                INSERT INTO onstrument.tokens (${insertColumns.join(', ')})
                VALUES (${insertValues.map((_, i) => `$${i + 1}`).join(', ')})
                ON CONFLICT (mint_address) DO UPDATE SET
                    ${updateParts.length > 0 ? updateParts.join(', ') + ',' : ''}
                    last_price_update = NOW()
                WHERE onstrument.tokens.mint_address = $1
            `;

            await pool().query(query, insertValues);

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

    private async updatePoolStats(client: PoolClient, pool: RaydiumPool): Promise<void> {
        console.log('\n[DEBUG] updatePoolStats called with:', {
            poolId: pool.id,
            mintA: pool.mintA.address,
            mintB: pool.mintB.address,
            price: pool.price
        });

        try {
            await client.query(`
                UPDATE onstrument.tokens 
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
            wsManager.broadcastPrice(pool.mintA.address, pool.price);
            wsManager.broadcastPrice(pool.mintB.address, pool.price);
        } catch (error) {
            console.error('[DEBUG] Error in updatePoolStats:', error);
            throw error;
        }
    }

    private chunk<T>(array: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(array.length / size) },
            (_, i) => array.slice(i * size, i * size + size)
        );
    }

    async processQueuedPriceUpdates() {
        const queueSnapshot = Array.from(this.tokenPriceQueue);
        this.tokenPriceQueue.clear();

        // Make smaller chunks to reduce timeout likelihood
        const tokenChunks = this.chunk(queueSnapshot, Math.min(50, this.JUPITER_BATCH_SIZE));

        for (const batchAddresses of tokenChunks) {
            try {
                const priceData = await this.fetchJupiterPrices(batchAddresses);
                await this.updateBatchPrices(priceData);

                // Respect rate limits
                await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY_MS));
            } catch (error) {
                this.logger.error('Error in batch processing:', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    batchSize: batchAddresses.length
                });

                // Only requeue if it's not a permanent failure
                if (error instanceof Error &&
                    !error.message.includes('HTTP error') &&
                    batchAddresses.length > 1) {
                    // Split batch in half and requeue if batch size > 1
                    const mid = Math.floor(batchAddresses.length / 2);
                    const firstHalf = batchAddresses.slice(0, mid);
                    const secondHalf = batchAddresses.slice(mid);

                    firstHalf.forEach(addr => this.queueTokenForPriceUpdate(addr));
                    secondHalf.forEach(addr => this.queueTokenForPriceUpdate(addr));

                    this.logger.info('Requeued failed batch in smaller chunks', {
                        originalSize: batchAddresses.length,
                        newBatchSizes: [firstHalf.length, secondHalf.length]
                    });
                }

                // Wait longer after an error
                await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY_MS * 2));
            }
        }
    }

    private async updateBatchPrices(prices: Record<string, any>): Promise<void> {
        try {
            const addresses = Object.keys(prices.data);
            const tokenQuery = `
                SELECT mint_address, supply, decimals 
                FROM onstrument.tokens 
                WHERE mint_address = ANY($1)
            `;
            const tokenData = await this.client.query(tokenQuery, [addresses]);
            const tokenMap = new Map(tokenData.rows.map(row => [row.mint_address, row]));

            const updates = Object.entries((prices as JupiterResponse).data)
                .filter(([address, info]) => info && info.price && tokenMap.has(address))
                .map(([address, info]) => {
                    const token = tokenMap.get(address)!;
                    const price = parseFloat(info.price);
                    const adjustedSupply = token.supply / Math.pow(10, token.decimals);
                    const marketCap = token.supply ? adjustedSupply * price : null;

                    return {
                        address,
                        price,
                        marketCap
                    };
                });

            // Process updates sequentially
            for (const update of updates) {
                const query = `
                    UPDATE onstrument.tokens 
                    SET 
                        current_price = $2,
                        market_cap_usd = $3,
                        last_price_update = NOW()
                    WHERE mint_address = $1`;

                await this.client.query(query, [
                    update.address,
                    update.price,
                    update.marketCap
                ]);

                // Add this line to broadcast price updates
                wsManager.broadcastPrice(update.address, update.price);
            }

        } catch (error) {
            this.logger.error('Error updating batch prices:', error);
            throw error;
        }
    }

    private async fetchJupiterPrices(addresses: string[]): Promise<any> {
        const maxRetries = 3;
        const baseTimeout = 15000; // 15 seconds

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutDuration = baseTimeout * (attempt + 1); // Increase timeout with each retry
                const timeout = setTimeout(() => controller.abort(), timeoutDuration);

                try {
                    const response = await fetch(
                        `https://api.jup.ag/price/v2?ids=${addresses.join(',')}`,
                        {
                            signal: controller.signal,
                            headers: {
                                'Accept': 'application/json'
                            }
                        }
                    );

                    clearTimeout(timeout);

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    return data;
                } finally {
                    clearTimeout(timeout);
                }
            } catch (error) {
                const isLastAttempt = attempt === maxRetries - 1;
                const isAbortError = error instanceof DOMException && error.name === 'AbortError';

                this.logger.warn(`Jupiter API attempt ${attempt + 1}/${maxRetries} failed:`, {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    isTimeout: isAbortError,
                    addresses: addresses.length
                });

                if (isLastAttempt) {
                    throw error;
                }

                // Wait before retry, with exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }

    private queueTokenForPriceUpdate(address: string): void {
        if (!this.SOL_ADDRESSES.includes(address)) {
            this.tokenPriceQueue.add(address);

            if (this.tokenPriceQueue.size === 1) {
                this.startQueueTimer();
            }

            if (this.tokenPriceQueue.size >= this.BATCH_SIZE) {
                this.clearQueueTimer();
                this.processQueuedPriceUpdates();
            }
        }
    }

    private startQueueTimer(): void {
        if (this.queueTimer === null) {
            this.queueTimer = setTimeout(() => {
                this.processQueuedPriceUpdates();
            }, this.QUEUE_TIMEOUT);
        }
    }

    private clearQueueTimer(): void {
        if (this.queueTimer) {
            clearTimeout(this.queueTimer);
            this.queueTimer = null;
        }
    }

    public cleanup(): void {
        this.clearQueueTimer();
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}

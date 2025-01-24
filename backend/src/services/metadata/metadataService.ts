import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import { parameterStore } from '../../config/parameterStore';


export class MetadataService {
    private static instance: MetadataService;
    private umi: any;
    private processingQueue: Set<string> = new Set();
    private queueTimer: NodeJS.Timeout | null = null;
    private readonly QUEUE_PROCESS_INTERVAL = 30000; // 30 seconds

    private constructor() {
        if (!config.HELIUS_RPC_URL) {
            throw new Error('HELIUS_RPC_URL is required');
        }
        this.umi = createUmi(config.HELIUS_RPC_URL)
            .use(mplTokenMetadata());

        // Start queue processor
        this.startQueueProcessor();
    }

    private startQueueProcessor() {
        this.queueTimer = setInterval(() => {
            if (this.processingQueue.size > 0) {
                const addresses = Array.from(this.processingQueue);
                this.processingQueue.clear();
                void this.queueMetadataUpdate(addresses, 'queue_processor');
            }
        }, this.QUEUE_PROCESS_INTERVAL);
    }

    static getInstance(): MetadataService {
        if (!MetadataService.instance) {
            MetadataService.instance = new MetadataService();
        }
        return MetadataService.instance;
    }

    async getMetadata(mintAddress: string): Promise<any> {
        // Return basic DB info while metadata processes
        const result = await pool().query(
            'SELECT name, symbol, metadata_url FROM onstrument.tokens WHERE mint_address = $1',
            [mintAddress]
        );

        // Queue update if not already processing
        this.queueMetadataUpdate([mintAddress]);

        return result.rows[0] || null;
    }

    async queueMetadataUpdate(mintAddresses: string[], source: string = 'unknown'): Promise<void> {
        // Process in batches of 20
        const BATCH_SIZE = 20;
        const batches: string[][] = [];

        for (let i = 0; i < mintAddresses.length; i += BATCH_SIZE) {
            batches.push(mintAddresses.slice(i, i + BATCH_SIZE));
        }

        for (const batch of batches) {
            try {
                const metadataResults = await this.fetchMetadataBatch(batch);

                // Process each result in the batch
                for (const [mintAddress, metadata] of metadataResults.entries()) {
                    await this.processMetadata(mintAddress, metadata, source);
                }
            } catch (error) {
                logger.error('Error processing metadata batch:', {
                    error,
                    batchSize: batch.length,
                    addresses: batch
                });
            }
        }
    }

    private async processMetadata(mintAddress: string, metadata: any, source: string): Promise<void> {
        try {
            // Extract supply as a number instead of JSON
            const supply = typeof metadata.supply === 'number' ? metadata.supply : null;

            // Validate and clean JSON data
            const cleanMetadata = {
                content: metadata.content ? JSON.stringify(metadata.content) : null,
                authorities: metadata.authorities ? JSON.stringify(metadata.authorities) : null,
                compression: metadata.compression ? JSON.stringify(metadata.compression) : null,
                grouping: metadata.grouping ? JSON.stringify(metadata.grouping) : null,
                royalty: metadata.royalty ? JSON.stringify(metadata.royalty) : null,
                creators: metadata.creators ? JSON.stringify(metadata.creators) : null,
                ownership: metadata.ownership ? JSON.stringify(metadata.ownership) : null,
                token_info: metadata.token_info ? JSON.stringify(metadata.token_info) : null,
                attributes: metadata.attributes ? JSON.stringify(metadata.attributes) : null,
                off_chain_metadata: metadata.off_chain_metadata ? JSON.stringify(metadata.off_chain_metadata) : null
            };

            await pool().query(
                `UPDATE onstrument.tokens 
                 SET 
                    name = $1,
                    symbol = $2,
                    description = $3,
                    metadata_url = $4,
                    interface = $5,
                    content = $6::jsonb,
                    authorities = $7::jsonb,
                    compression = $8::jsonb,
                    grouping = $9::jsonb,
                    royalty = $10::jsonb,
                    creators = $11::jsonb,
                    ownership = $12::jsonb,
                    supply = $13,
                    mutable = $14,
                    burnt = $15,
                    token_info = $16::jsonb,
                    verified = $17,
                    image_url = $18,
                    attributes = $19::jsonb,
                    off_chain_metadata = $20::jsonb,
                    metadata_status = 'fetched',
                    metadata_source = $21,
                    decimals = $22,
                    metadata_fetch_attempts = metadata_fetch_attempts + 1,
                    last_metadata_fetch = CURRENT_TIMESTAMP
                 WHERE mint_address = $23`,
                [
                    metadata.name || null,
                    metadata.symbol || null,
                    metadata.description || null,
                    metadata.metadata_url || null,
                    metadata.interface || null,
                    cleanMetadata.content,
                    cleanMetadata.authorities,
                    cleanMetadata.compression,
                    cleanMetadata.grouping,
                    cleanMetadata.royalty,
                    cleanMetadata.creators,
                    cleanMetadata.ownership,
                    supply,
                    metadata.mutable || false,
                    metadata.burnt || false,
                    cleanMetadata.token_info,
                    metadata.verified || false,
                    metadata.image_url || null,
                    cleanMetadata.attributes,
                    cleanMetadata.off_chain_metadata,
                    source,
                    metadata.decimals || null,
                    mintAddress
                ]
            );
        } catch (error) {
            logger.error(`Error processing metadata for ${mintAddress}:`, error);
            throw error;
        }
    }

    private async fetchMetadataBatch(mintAddresses: string[]): Promise<Map<string, any>> {
        const maxRetries = 3;
        const baseDelay = 1000;
        const results = new Map<string, any>();

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (!parameterStore.isInitialized()) {
                    await parameterStore.initialize();
                }

                const response = await fetch(config.HELIUS_RPC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'metadata-batch',
                        method: 'getAssetBatch',
                        params: {
                            ids: mintAddresses
                        }
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (data.error) {
                    throw new Error(`API error: ${JSON.stringify(data.error)}`);
                }

                // Process each asset in the batch
                for (const asset of data.result) {
                    const totalSupply = asset.interface === 'V1_NFT'
                        ? asset.supply?.print_current_supply
                        : asset.token_info?.supply;

                    results.set(asset.id, {
                        name: asset.content?.metadata?.name,
                        symbol: asset.content?.metadata?.symbol,
                        description: asset.content?.metadata?.description,
                        metadata_url: asset.content?.json_uri,
                        interface: asset.interface || 'unknown',
                        content: asset.content,
                        authorities: asset.authorities,
                        compression: asset.compression,
                        grouping: asset.grouping,
                        royalty: asset.royalty,
                        creators: asset.creators,
                        ownership: asset.ownership,
                        supply: totalSupply,
                        decimals: asset.token_info?.decimals,
                        mutable: asset.mutable ?? false,
                        burnt: asset.burnt ?? false,
                        token_info: asset.token_info,
                        verified: false,
                        image_url: asset.content?.files?.[0]?.uri || null,
                        attributes: asset.content?.attributes
                    });
                }

                return results;

            } catch (error) {
                logger.warn(`Batch attempt ${attempt + 1}/${maxRetries} failed:`, {
                    error: error instanceof Error ? {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    } : error,
                    mintAddresses: mintAddresses.length,
                    mintAddressList: mintAddresses
                });

                if (attempt === maxRetries - 1) {
                    logger.error('All retry attempts failed for batch:', {
                        addresses: mintAddresses,
                        finalError: error instanceof Error ? error.message : error
                    });
                    // On final attempt, return default values for all addresses
                    mintAddresses.forEach(address => {
                        results.set(address, {
                            name: null,
                            symbol: null,
                            description: null,
                            metadata_url: null,
                            interface: 'unknown',
                            // ... other default values ...
                        });
                    });
                    return results;
                }

                await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
            }
        }

        return results;
    }
} 
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { findMetadataPda, fetchMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

export class MetadataService {
    private static instance: MetadataService;
    private umi: any;
    private processingQueue: Set<string> = new Set();

    private constructor() {
        if (!config.HELIUS_RPC_URL) {
            throw new Error('HELIUS_RPC_URL is required');
        }
        this.umi = createUmi(config.HELIUS_RPC_URL)
            .use(mplTokenMetadata());
    }

    static getInstance(): MetadataService {
        if (!MetadataService.instance) {
            MetadataService.instance = new MetadataService();
        }
        return MetadataService.instance;
    }

    async getMetadata(mintAddress: string): Promise<any> {
        // Return basic DB info while metadata processes
        const result = await pool.query(
            'SELECT name, symbol, metadata_url FROM token_platform.tokens WHERE mint_address = $1',
            [mintAddress]
        );

        // Queue update if not already processing
        this.queueMetadataUpdate(mintAddress);

        return result.rows[0] || null;
    }

    async queueMetadataUpdate(mintAddress: string, source: string = 'unknown'): Promise<void> {
        if (this.processingQueue.has(mintAddress)) return;

        try {
            this.processingQueue.add(mintAddress);
            await this.processMetadata(mintAddress, source);
        } finally {
            this.processingQueue.delete(mintAddress);
        }
    }

    private async processMetadata(mintAddress: string, source: string): Promise<void> {
        try {
            const metadata = await this.fetchMetadata(mintAddress);

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

            await pool.query(
                `UPDATE token_platform.tokens 
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
                    metadata_fetch_attempts = metadata_fetch_attempts + 1,
                    last_metadata_fetch = CURRENT_TIMESTAMP
                 WHERE mint_address = $22`,
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
                    mintAddress
                ]
            );
        } catch (error) {
            logger.error(`Error processing metadata for ${mintAddress}:`, error);
            throw error;
        }
    }

    private async fetchMetadata(mintAddress: string): Promise<any> {
        const response = await fetch(config.HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'metadata',
                method: 'getAsset',
                params: {
                    id: mintAddress,
                    displayOptions: {
                        showFungible: true
                    }
                }
            }),
        });

        const { result } = await response.json();

        // Get total supply based on token type
        const totalSupply = result.interface === 'V1_NFT'
            ? result.supply?.print_current_supply
            : result.token_info?.supply;

        // Transform Helius response to our schema
        return {
            name: result.content?.metadata?.name,
            symbol: result.content?.metadata?.symbol,
            description: result.content?.metadata?.description,
            metadata_url: result.content?.json_uri,
            interface: result.interface,
            content: result.content,
            authorities: result.authorities,
            compression: result.compression,
            grouping: result.grouping,
            royalty: result.royalty,
            creators: result.creators,
            ownership: result.ownership,
            supply: totalSupply,
            decimals: result.token_info?.decimals,
            mutable: result.mutable,
            burnt: result.burnt,
            token_info: result.token_info,
            verified: false,
            image_url: result.content?.files?.[0]?.uri || null,
            attributes: result.content?.attributes
        };
    }
} 
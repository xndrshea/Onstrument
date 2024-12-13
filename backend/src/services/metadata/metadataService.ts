import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { findMetadataPda, fetchMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

export class MetadataService {
    private static instance: MetadataService;
    private umi: any;
    private processingQueue: Set<string> = new Set();

    private constructor() {
        if (!process.env.HELIUS_RPC_URL) {
            throw new Error('HELIUS_RPC_URL is required');
        }
        this.umi = createUmi(process.env.HELIUS_RPC_URL)
            .use(mplTokenMetadata());
    }

    static getInstance(): MetadataService {
        if (!MetadataService.instance) {
            MetadataService.instance = new MetadataService();
        }
        return MetadataService.instance;
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
            const metadataPda = findMetadataPda(this.umi, { mint: publicKey(mintAddress) })[0];
            const metadata = await fetchMetadata(this.umi, metadataPda);

            if (metadata) {
                await pool.query(
                    `UPDATE token_platform.tokens 
                     SET 
                        name = COALESCE($2, name),
                        symbol = COALESCE($3, symbol),
                        metadata_url = COALESCE($4, metadata_url),
                        last_metadata_fetch = NOW(),
                        metadata_status = 'success',
                        metadata_source = $5
                     WHERE mint_address = $1`,
                    [
                        mintAddress,
                        metadata.name,
                        metadata.symbol,
                        metadata.uri,
                        source
                    ]
                );
            }
        } catch (error) {
            logger.error(`Error processing metadata for ${mintAddress}:`, error);
            await pool.query(
                `UPDATE token_platform.tokens 
                 SET metadata_status = 'failed', last_metadata_fetch = NOW()
                 WHERE mint_address = $1`,
                [mintAddress]
            );
        }
    }
} 
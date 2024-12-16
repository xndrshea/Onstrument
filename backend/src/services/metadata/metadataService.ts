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

    private async processMetadata(mintAddress: string, source: string, retryCount = 0): Promise<void> {
        const MAX_RETRIES = 3;

        try {
            // Get decimals from mint account
            const connection = new Connection(config.HELIUS_RPC_URL);
            const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mintAddress));

            if (!mintInfo.value?.data || typeof mintInfo.value.data !== 'object') {
                throw new Error('Failed to get mint info');
            }

            const decimals = (mintInfo.value.data as any).parsed.info.decimals;
            if (typeof decimals !== 'number') {
                throw new Error('Invalid decimals from mint account');
            }

            // Get metadata as before
            const metadataPda = findMetadataPda(this.umi, { mint: publicKey(mintAddress) })[0];
            const metadata = await fetchMetadata(this.umi, metadataPda);

            // Update query to include decimals
            await pool.query(
                `UPDATE token_platform.tokens 
                 SET 
                    name = $2,
                    symbol = $3,
                    metadata_url = $4,
                    decimals = $5,
                    last_metadata_fetch = NOW(),
                    metadata_status = 'success',
                    metadata_source = $6,
                    metadata_fetch_attempts = metadata_fetch_attempts + 1
                 WHERE mint_address = $1`,
                [
                    mintAddress,
                    metadata?.name || 'Unknown',
                    metadata?.symbol || 'UNKNOWN',
                    metadata?.uri || '',
                    decimals,
                    source
                ]
            );
        } catch (error) {
            logger.error(`Error processing metadata for ${mintAddress}:`, error);

            if (retryCount < MAX_RETRIES) {
                logger.info(`Retrying metadata fetch for ${mintAddress}, attempt ${retryCount + 1}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                return this.processMetadata(mintAddress, source, retryCount + 1);
            }

            await pool.query(
                `UPDATE token_platform.tokens 
                 SET metadata_status = 'failed', 
                     last_metadata_fetch = NOW(),
                     metadata_fetch_attempts = metadata_fetch_attempts + 1
                 WHERE mint_address = $1`,
                [mintAddress]
            );
        }
    }
} 
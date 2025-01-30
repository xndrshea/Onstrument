import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { LIQUIDITY_STATE_LAYOUT_V4 } from '@raydium-io/raydium-sdk';
import { pool } from '../../../config/database';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import type { Umi } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { MetadataService } from '../../metadata/metadataService';
import { BN } from 'bn.js';
import { PriceFetcher } from './priceFetcher';
import { PRICE_WHITELIST } from '../../../constants/priceWhitelist';


export class RaydiumStateProcessor extends BaseProcessor {
    private connection: Connection;
    private umi: Umi;


    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_RPC_URL);
        this.umi = createUmi(config.HELIUS_RPC_URL)
            .use(mplTokenMetadata());
    }

    async processEvent(message: string, _accountKey: string, _programId: string): Promise<void> {
        try {
            const parsed = JSON.parse(message);

            // Skip subscription confirmations
            if (!parsed.params?.result?.value?.account?.data) {
                logger.debug('Skipping message - no account data');
                return;
            }

            const data = parsed.params.result.value.account.data[0];
            const accountKey = parsed.params.result.value.pubkey;

            logger.debug('Processing data:', {
                accountKey,
                dataLength: data.length
            });

            const buffer = Buffer.from(data, 'base64');

            logger.debug('Created buffer:', {
                length: buffer.length,
                firstBytes: buffer.subarray(0, 16).toString('hex')
            });

            await this.processCPState(buffer, accountKey);
        } catch (error) {
            logger.error('Error in RaydiumProcessor:', error);
            logger.error('Failed message:', message);
        }
    }

    private async processCPState(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            if (buffer.length < 328) {  // Add this check
                logger.warn(`Buffer too small for CP pool ${accountKey}: ${buffer.length} bytes`);
                return;
            }
            // Skip discriminator (8 bytes)
            let offset = 8;

            console.log("OSUDFHPOUSDHFPSODIFHUSDPOFIHSDFOIHSDFOISHN");
            console.log(LIQUIDITY_STATE_LAYOUT_V4.decode(buffer));

            const poolState = {
                // First comes all the PublicKeys (32 bytes each)
                ammConfig: new PublicKey(buffer.subarray(offset, offset += 32)),
                poolCreator: new PublicKey(buffer.subarray(offset, offset += 32)),
                token0Vault: new PublicKey(buffer.subarray(offset, offset += 32)),
                token1Vault: new PublicKey(buffer.subarray(offset, offset += 32)),
                lpMint: new PublicKey(buffer.subarray(offset, offset += 32)),
                token0Mint: new PublicKey(buffer.subarray(offset, offset += 32)),
                token1Mint: new PublicKey(buffer.subarray(offset, offset += 32)),
                token0Program: new PublicKey(buffer.subarray(offset, offset += 32)),
                token1Program: new PublicKey(buffer.subarray(offset, offset += 32)),
                observationKey: new PublicKey(buffer.subarray(offset, offset += 32)),

                // Then come the smaller fields
                authBump: buffer.readUInt8(offset++),
                status: buffer.readUInt8(offset++),
                lpMintDecimals: buffer.readUInt8(offset++),
                mint0Decimals: buffer.readUInt8(offset++),
                mint1Decimals: buffer.readUInt8(offset++),

                // Then the u64 fields
                lpSupply: new BN(buffer.subarray(offset, offset += 8), 'le'),
                protocolFeesToken0: new BN(buffer.subarray(offset, offset += 8), 'le'),
                protocolFeesToken1: new BN(buffer.subarray(offset, offset += 8), 'le'),
                fundFeesToken0: new BN(buffer.subarray(offset, offset += 8), 'le'),
                fundFeesToken1: new BN(buffer.subarray(offset, offset += 8), 'le'),
                openTime: new BN(buffer.subarray(offset, offset += 8), 'le'),
                recentEpoch: new BN(buffer.subarray(offset, offset += 8), 'le'),
            };

            console.log(poolState);



        } catch (error) {
            logger.error('Error processing Raydium CP pool:', error);
        }
    }


    private async ensureTokenExists(mintAddress: string, decimals: number): Promise<boolean> {
        try {
            await pool().query(
                `INSERT INTO onstrument.tokens (
                    mint_address,
                    decimals,
                    metadata_status,
                    metadata_source,
                    token_type
                )
                VALUES ($1, $2, 'pending', 'raydium', 'dex')
                ON CONFLICT (mint_address) 
                DO UPDATE SET 
                    metadata_status = CASE 
                        WHEN onstrument.tokens.metadata_status IS NULL 
                        THEN 'pending' 
                        ELSE onstrument.tokens.metadata_status 
                    END`,
                [mintAddress, decimals]
            );

            // Queue metadata update
            const result = await pool().query(
                `SELECT metadata_status FROM onstrument.tokens WHERE mint_address = $1`,
                [mintAddress]
            );

            if (result.rows[0]?.metadata_status === 'pending') {
                await MetadataService.getInstance().queueMetadataUpdate([mintAddress], 'raydium');
            }

            return true;
        } catch (error) {
            logger.error(`Error ensuring token exists for ${mintAddress}:`, error);
            return false;
        }
    }
}

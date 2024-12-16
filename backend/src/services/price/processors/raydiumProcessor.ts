import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { Liquidity } from '@raydium-io/raydium-sdk';
import { pool } from '../../../config/database';
import { NATIVE_SOL_MINT } from '../../../constants';
import { PriceUpdateQueue } from '../queue/priceUpdateQueue';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Umi } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { MetadataService } from '../../metadata/metadataService';
import { Decimal } from 'decimal.js';

export class RaydiumProcessor extends BaseProcessor {
    private connection: Connection;
    private umi: Umi;



    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_RPC_URL);
        this.umi = createUmi(config.HELIUS_RPC_URL)
            .use(mplTokenMetadata());
    }

    async processEvent(buffer: Buffer, accountKey: string, programId: string): Promise<void> {
        try {
            logger.info('Received Raydium event:', {
                accountKey,
                programId,
                bufferLength: buffer.length
            });

            switch (programId) {
                case config.RAYDIUM_PROGRAMS.STANDARD_AMM:
                    await this.processStandardAMM(buffer, accountKey);
                    break;
                case config.RAYDIUM_PROGRAMS.LEGACY_AMM:
                    await this.processLegacyAMM(buffer, accountKey);
                    break;
                case config.RAYDIUM_PROGRAMS.CLMM:
                    await this.processCLMM(buffer, accountKey);
                    break;
                default:
                    logger.warn('Unknown Raydium program:', programId);
            }
        } catch (error) {
            logger.error('Error in RaydiumProcessor:', { error, programId, accountKey });
        }
    }

    private async processStandardAMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = Liquidity.getStateLayout(4).decode(buffer);

            if (!poolState.baseMint || !poolState.quoteMint) {
                return;
            }

            const baseMint = poolState.baseMint.toString();
            const quoteMint = poolState.quoteMint.toString();
            const baseDecimals = Number(poolState.baseDecimal);
            const quoteDecimals = Number(poolState.quoteDecimal);

            const isSolBase = baseMint === NATIVE_SOL_MINT;
            const isSolQuote = quoteMint === NATIVE_SOL_MINT;
            if (!isSolBase && !isSolQuote) {
                return;
            }

            const tokenToTrack = isSolBase ? quoteMint : baseMint;
            const tokenDecimals = isSolBase ? quoteDecimals : baseDecimals;

            const baseReserve = this.getRawNumber(poolState.baseVault?.toString(), baseDecimals);
            const quoteReserve = this.getRawNumber(poolState.quoteVault?.toString(), quoteDecimals);

            if (baseReserve <= 0 || quoteReserve <= 0) {
                return;
            }

            const price = isSolBase ?
                baseReserve / quoteReserve :
                quoteReserve / baseReserve;

            const volume = Math.min(baseReserve, quoteReserve);

            logger.info('Calculated price for pool:', {
                accountKey,
                tokenToTrack,
                price,
                volume,
                baseReserve,
                quoteReserve,
                isSolBase
            });

            await this.ensureTokenExists(tokenToTrack, tokenDecimals);
            await this.recordPriceUpdate(tokenToTrack, price, volume);

        } catch (error) {
            logger.error('Error processing Standard AMM:', error);
        }
    }

    private async processLegacyAMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            logger.info('Starting Legacy AMM processing:', { accountKey });

            const poolState = Liquidity.getStateLayout(4).decode(buffer);

            logger.info('Raw Legacy AMM pool state:', {
                accountKey,
                baseMint: poolState.baseMint?.toString(),
                quoteMint: poolState.quoteMint?.toString(),
                baseDecimal: poolState.baseDecimal?.toString(),
                quoteDecimal: poolState.quoteDecimal?.toString(),
                swapBaseInAmount: poolState.swapBaseInAmount?.toString(),
                swapBaseOutAmount: poolState.swapBaseOutAmount?.toString(),
                swapQuoteInAmount: poolState.swapQuoteInAmount?.toString(),
                swapQuoteOutAmount: poolState.swapQuoteOutAmount?.toString()
            });

            if (!poolState.baseMint || !poolState.quoteMint) {
                logger.warn('Missing mints in Legacy AMM:', { accountKey });
                return;
            }

            const baseMint = poolState.baseMint.toString();
            const quoteMint = poolState.quoteMint.toString();
            const baseDecimals = Number(poolState.baseDecimal);
            const quoteDecimals = Number(poolState.quoteDecimal);

            logger.info('Processed pool info:', {
                accountKey,
                baseMint,
                quoteMint,
                baseDecimals,
                quoteDecimals
            });

            const isSolBase = baseMint === NATIVE_SOL_MINT;
            const isSolQuote = quoteMint === NATIVE_SOL_MINT;

            if (!isSolBase && !isSolQuote) {
                logger.info('Skipping non-SOL pool:', { accountKey, baseMint, quoteMint });
                return;
            }

            const tokenToTrack = isSolBase ? quoteMint : baseMint;
            const tokenDecimals = isSolBase ? quoteDecimals : baseDecimals;

            logger.info('Volume calculations:', {
                accountKey,
                baseVolume: {
                    in: this.getRawNumber(poolState.swapBaseInAmount?.toString(), baseDecimals),
                    out: this.getRawNumber(poolState.swapBaseOutAmount?.toString(), baseDecimals)
                },
                quoteVolume: {
                    in: this.getRawNumber(poolState.swapQuoteInAmount?.toString(), quoteDecimals),
                    out: this.getRawNumber(poolState.swapQuoteOutAmount?.toString(), quoteDecimals)
                },
                tokenToTrack
            });

            const totalBaseVolume = poolState.swapBaseInAmount?.toString() === '0' ? 0 : this.getRawNumber(poolState.swapBaseInAmount?.toString(), baseDecimals) + this.getRawNumber(poolState.swapBaseOutAmount?.toString(), baseDecimals);
            const totalQuoteVolume = poolState.swapQuoteInAmount?.toString() === '0' ? 0 : this.getRawNumber(poolState.swapQuoteInAmount?.toString(), quoteDecimals) + this.getRawNumber(poolState.swapQuoteOutAmount?.toString(), quoteDecimals);

            if (totalBaseVolume === 0 || totalQuoteVolume === 0) {
                logger.info('Zero volume detected:', {
                    accountKey,
                    totalBaseVolume,
                    totalQuoteVolume
                });
                return;
            }

            const price = isSolBase ?
                totalQuoteVolume / totalBaseVolume :
                totalBaseVolume / totalQuoteVolume;

            logger.info('Price calculation:', {
                accountKey,
                tokenToTrack,
                price,
                isSolBase,
                totalBaseVolume,
                totalQuoteVolume
            });

            const tokenExists = await this.ensureTokenExists(tokenToTrack, tokenDecimals);
            if (!tokenExists) {
                logger.error('Failed to ensure token exists:', { tokenToTrack, tokenDecimals });
                return;
            }

            if (!isFinite(price) || price <= 0) {
                logger.error('Invalid price calculated:', {
                    tokenToTrack,
                    price,
                    totalBaseVolume,
                    totalQuoteVolume
                });
                return;
            }

            await this.recordPriceUpdate(
                tokenToTrack,
                price,
                Math.max(totalBaseVolume, totalQuoteVolume)
            );

            logger.info('Successfully processed Legacy AMM event:', {
                accountKey,
                tokenToTrack,
                price,
                volume: Math.max(totalBaseVolume, totalQuoteVolume)
            });

        } catch (error) {
            logger.error('Error processing Legacy AMM:', {
                error,
                accountKey,
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }

    private async processCLMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
        } catch (error) {
            logger.error('Error processing CLMM:', error);
        }
    }

    private getRawNumber(num: string, decimals: number): number {
        if (!num) return 0;
        try {
            const value = new Decimal(num);
            return value.dividedBy(new Decimal(10).pow(decimals)).toNumber();
        } catch (e) {
            logger.error('Error converting number:', { num, decimals, error: e });
            return 0;
        }
    }

    private async recordPriceUpdate(
        mintAddress: string,
        price: number,
        volume: number,
    ): Promise<void> {
        try {
            if (!isFinite(price) || price <= 0) {
                logger.error(`Invalid price calculation for ${mintAddress}:`, {
                    price,
                    volume
                });
                return;
            }

            await pool.query(`
                INSERT INTO token_platform.price_history (
                    time,
                    mint_address,
                    price,
                    open,
                    high,
                    low,
                    close,
                    volume
                ) VALUES (
                    NOW(),
                    $1,
                    $2,
                    $2,
                    $2,
                    $2,
                    $2,
                    $3
                )
            `, [mintAddress, price, volume]);

            const queue = PriceUpdateQueue.getInstance();
            await queue.addUpdate({
                mintAddress,
                price,
                volume,
                timestamp: Date.now()
            });

            logger.info(`Recorded price update for ${mintAddress}:`, {
                price,
                volume,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to record price update for ${mintAddress}:`, error);
        }
    }


    private async ensureTokenExists(mintAddress: string, decimals: number): Promise<boolean> {
        try {
            await pool.query(
                `INSERT INTO token_platform.tokens (
                    mint_address,
                    metadata_status,
                    metadata_source
                )
                VALUES ($1, 'pending', 'raydium')
                ON CONFLICT (mint_address) 
                DO UPDATE SET 
                    metadata_status = CASE 
                        WHEN token_platform.tokens.metadata_status IS NULL 
                        THEN 'pending' 
                        ELSE token_platform.tokens.metadata_status 
                    END`,
                [mintAddress]
            );

            // Queue metadata update (which will now handle decimals)
            const result = await pool.query(
                `SELECT metadata_status FROM token_platform.tokens WHERE mint_address = $1`,
                [mintAddress]
            );

            if (result.rows[0]?.metadata_status === 'pending') {
                await MetadataService.getInstance().queueMetadataUpdate(
                    mintAddress,
                    'raydium_processor'
                );
            }

            return true;
        } catch (error) {
            logger.error(`Error ensuring token exists for ${mintAddress}:`, error);
            return false;
        }
    }

    private async savePoolInfo(
        accountKey: string,
        baseMint: string,
        quoteMint: string,
        baseDecimals: number,
        quoteDecimals: number,
        programId: string,
        poolType: 'LEGACY_AMM' | 'STANDARD_AMM' | 'CLMM',
        version: number
    ): Promise<void> {
        try {
            const normalizedVersion = version % 10000;

            await pool.query(`
                INSERT INTO token_platform.raydium_pools 
                (pool_address, base_mint, quote_mint, base_decimals, quote_decimals, program_id, pool_type, version)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (pool_address) DO NOTHING
            `, [accountKey, baseMint, quoteMint, baseDecimals, quoteDecimals, programId, poolType, normalizedVersion]);
        } catch (error) {
            logger.error('Error saving pool info:', error);
        }
    }
}



import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { Liquidity } from '@raydium-io/raydium-sdk';
import { pool } from '../../../config/database';
import { NATIVE_SOL_MINT } from '../../../constants';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Umi } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { MetadataService } from '../../metadata/metadataService';
import { Decimal } from 'decimal.js';
import { PRICE_WHITELIST } from '../../../constants/priceWhitelist';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';

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

            if (!PRICE_WHITELIST.has(baseMint) && !PRICE_WHITELIST.has(quoteMint)) {
                return;
            }

            const baseDecimals = Number(poolState.baseDecimal);
            const quoteDecimals = Number(poolState.quoteDecimal);

            const isSolBase = baseMint === NATIVE_SOL_MINT;
            const isSolQuote = quoteMint === NATIVE_SOL_MINT;
            if (!isSolBase && !isSolQuote) {
                return;
            }

            const tokenToTrack = isSolBase ? quoteMint : baseMint;
            const tokenDecimals = isSolBase ? quoteDecimals : baseDecimals;

            const baseReserve = new Decimal(poolState.baseVault?.toString() || '0');
            const quoteReserve = new Decimal(poolState.quoteVault?.toString() || '0');

            logger.info('Pool state details:', {
                accountKey,
                baseDecimals,
                quoteDecimals,
                isSolBase,
                rawBaseReserve: baseReserve.toString(),
                rawQuoteReserve: quoteReserve.toString(),
                baseVaultRaw: poolState.baseVault?.toString(),
                quoteVaultRaw: poolState.quoteVault?.toString(),
            });

            if (baseReserve.isZero() || quoteReserve.isZero()) {
                return;
            }

            const price = isSolBase
                ? baseReserve.div(quoteReserve).mul(new Decimal(10).pow(quoteDecimals - baseDecimals)).toNumber()
                : quoteReserve.div(baseReserve).mul(new Decimal(10).pow(baseDecimals - quoteDecimals)).toNumber();

            logger.info('Price calculation details:', {
                price,
                decimalAdjustment: new Decimal(10).pow(quoteDecimals - baseDecimals).toString(),
                baseReserveAdjusted: baseReserve.div(new Decimal(10).pow(baseDecimals)).toString(),
                quoteReserveAdjusted: quoteReserve.div(new Decimal(10).pow(quoteDecimals)).toString(),
            });

            const volume = Math.min(
                baseReserve.div(new Decimal(10).pow(baseDecimals)).toNumber(),
                quoteReserve.div(new Decimal(10).pow(quoteDecimals)).toNumber()
            );

            await this.ensureTokenExists(tokenToTrack, tokenDecimals);
            await this.recordPriceUpdate(tokenToTrack, price, volume);

        } catch (error) {
            logger.error('Error processing Standard AMM:', error);
        }
    }

    private async processLegacyAMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = Liquidity.getStateLayout(4).decode(buffer);

            if (!poolState.baseMint || !poolState.quoteMint) {
                return;
            }

            const baseMint = poolState.baseMint.toString();
            const quoteMint = poolState.quoteMint.toString();

            if (!PRICE_WHITELIST.has(baseMint) && !PRICE_WHITELIST.has(quoteMint)) {
                return;
            }

            const baseDecimals = Number(poolState.baseDecimal);
            const quoteDecimals = Number(poolState.quoteDecimal);

            const isSolBase = baseMint === NATIVE_SOL_MINT;
            const isSolQuote = quoteMint === NATIVE_SOL_MINT;

            if (!isSolBase && !isSolQuote) {
                return;
            }

            const tokenToTrack = isSolBase ? quoteMint : baseMint;
            const tokenDecimals = isSolBase ? quoteDecimals : baseDecimals;

            const baseInAmount = new Decimal(poolState.swapBaseInAmount?.toString() || '0');
            const baseOutAmount = new Decimal(poolState.swapBaseOutAmount?.toString() || '0');
            const quoteInAmount = new Decimal(poolState.swapQuoteInAmount?.toString() || '0');
            const quoteOutAmount = new Decimal(poolState.swapQuoteOutAmount?.toString() || '0');

            const totalBaseVolume = baseInAmount.plus(baseOutAmount);
            const totalQuoteVolume = quoteInAmount.plus(quoteOutAmount);

            if (totalBaseVolume.isZero() || totalQuoteVolume.isZero()) {
                return;
            }

            const price = isSolBase
                ? totalBaseVolume.div(totalQuoteVolume).mul(new Decimal(10).pow(quoteDecimals - baseDecimals)).toNumber()
                : totalQuoteVolume.div(totalBaseVolume).mul(new Decimal(10).pow(baseDecimals - quoteDecimals)).toNumber();

            const volume = Math.max(
                totalBaseVolume.div(new Decimal(10).pow(baseDecimals)).toNumber(),
                totalQuoteVolume.div(new Decimal(10).pow(quoteDecimals)).toNumber()
            );

            await this.ensureTokenExists(tokenToTrack, tokenDecimals);
            await this.recordPriceUpdate(tokenToTrack, price, volume);

        } catch (error) {
            logger.error('Error processing Legacy AMM:', error);
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
            await PriceHistoryModel.recordPrice({
                mintAddress,
                price,
                volume,
                timestamp: new Date()
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



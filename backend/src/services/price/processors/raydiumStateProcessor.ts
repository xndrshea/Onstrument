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


export class RaydiumStateProcessor extends BaseProcessor {
    private connection: Connection;
    private umi: Umi;
    private static readonly RAYDIUM_POOL_SIZE = 328; // Minimum size for CP pool
    private static readonly RAYDIUM_POOL_DISCRIMINATOR = Buffer.from([0xf7, 0xed, 0xe3, 0xf5, 0xd7, 0xc3, 0xde, 0x46]);
    private static readonly KNOWN_DISCRIMINATORS = {
        CP_AMM: Buffer.from([0xf7, 0xed, 0xe3, 0xf5, 0xd7, 0xc3, 0xde, 0x46]),
        // Add other known discriminators if needed
    };


    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_RPC_URL);
        this.umi = createUmi(config.HELIUS_RPC_URL)
            .use(mplTokenMetadata());
    }

    async processEvent(buffer: Buffer, accountKey: string, programId: string): Promise<void> {
        try {
            const discriminator = buffer.subarray(0, 8);

            // Log the discriminator for V4 AMM to discover its value
            if (programId === config.RAYDIUM_PROGRAMS.V4_AMM) {
                await this.processV4AMM(buffer, accountKey);
                return;
            }

            // Handle CP AMM as before
            if (programId === config.RAYDIUM_PROGRAMS.CP_AMM) {
                if (!discriminator.equals(RaydiumStateProcessor.KNOWN_DISCRIMINATORS.CP_AMM)) {
                    return;
                }
                await this.processCPState(buffer, accountKey);
            }
        } catch (error) {
            logger.error('Error in RaydiumProcessor:', error);
            if (error instanceof Error) {
                logger.error('Error details:', error.message);
                logger.error('Stack trace:', error.stack);
            }
        }
    }

    private async processCPState(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            if (buffer.length < 328) {
                logger.warn(`Buffer too small for CP pool ${accountKey}: ${buffer.length} bytes`);
                return;
            }

            let offset = 8; // Skip discriminator

            const poolState = {
                // PublicKeys (32 bytes each)
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

                // Small fields
                authBump: buffer.readUInt8(offset++),
                status: buffer.readUInt8(offset++),
                lpMintDecimals: buffer.readUInt8(offset++),
                mint0Decimals: buffer.readUInt8(offset++),
                mint1Decimals: buffer.readUInt8(offset++),

                // U64 fields
                lpSupply: new BN(buffer.subarray(offset, offset += 8), 'le'),
                protocolFeesToken0: new BN(buffer.subarray(offset, offset += 8), 'le'),
                protocolFeesToken1: new BN(buffer.subarray(offset, offset += 8), 'le'),
                fundFeesToken0: new BN(buffer.subarray(offset, offset += 8), 'le'),
                fundFeesToken1: new BN(buffer.subarray(offset, offset += 8), 'le'),
                openTime: new BN(buffer.subarray(offset, offset += 8), 'le'),
                recentEpoch: new BN(buffer.subarray(offset, offset += 8), 'le'),
            };


            // First ensure both tokens exist in our database
            const token0Mint = poolState.token0Mint.toBase58();
            const token1Mint = poolState.token1Mint.toBase58();

            await Promise.all([
                this.ensureTokenExists(token0Mint, poolState.mint0Decimals),
                this.ensureTokenExists(token1Mint, poolState.mint1Decimals)
            ]);

            // Then store the pool mapping
            await pool().query(
                `INSERT INTO onstrument.raydium_pools (
                    pool_id,
                    token0_mint,
                    token1_mint,
                    token0_decimals,
                    token1_decimals
                ) VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (pool_id) 
                DO UPDATE SET 
                    token0_mint = $2,
                    token1_mint = $3,
                    token0_decimals = $4,
                    token1_decimals = $5`,
                [
                    accountKey,
                    token0Mint,
                    token1Mint,
                    poolState.mint0Decimals,
                    poolState.mint1Decimals
                ]
            );

        } catch (error) {
            logger.error('Error processing Raydium CP pool:', error);
            if (error instanceof Error) {
                logger.error('Error details:', error.message);
                logger.error('Stack trace:', error.stack);
            }
            throw error;
        }
    }

    private async ensureTokenExists(mintAddress: string, decimals: number): Promise<boolean> {
        const client = await pool().connect();
        try {
            await client.query('BEGIN');

            // Lock the row if it exists
            const existingToken = await client.query(
                `SELECT mint_address, metadata_status 
                 FROM onstrument.tokens 
                 WHERE mint_address = $1
                 FOR UPDATE`,
                [mintAddress]
            );

            if (existingToken.rows.length === 0) {
                // Token doesn't exist, insert it
                await client.query(
                    `INSERT INTO onstrument.tokens (
                        mint_address,
                        decimals,
                        metadata_status,
                        metadata_source,
                        token_type
                    )
                    VALUES ($1, $2, 'pending', 'raydium', 'dex')`,
                    [mintAddress, decimals]
                );

                // Queue for metadata since it's new
                await MetadataService.getInstance().queueMetadataUpdate([mintAddress], 'raydium');
            } else if (existingToken.rows[0].metadata_status === 'pending') {
                // Token exists but needs metadata
                await MetadataService.getInstance().queueMetadataUpdate([mintAddress], 'raydium');
            }

            await client.query('COMMIT');
            return true;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Error ensuring token exists for ${mintAddress}:`, error);
            return false;
        } finally {
            client.release();
        }
    }

    private async processV4AMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(buffer);

            // Skip if both vaults are the default public key
            if (poolState.baseVault?.toString() === '11111111111111111111111111111111' ||
                poolState.quoteVault?.toString() === '11111111111111111111111111111111') {
                return;
            }

            // Continue with existing processing
            const extractedPoolState = {
                accountKey,
                // Basic info
                nonce: poolState.nonce?.toString(),
                owner: poolState.owner?.toString(),
                status: poolState.status?.toString(),
                maxOrder: poolState.maxOrder?.toString(),
                depth: poolState.depth?.toString(),

                // Decimals and state
                baseDecimal: poolState.baseDecimal?.toString(),
                quoteDecimal: poolState.quoteDecimal?.toString(),
                state: poolState.state?.toString(),
                resetFlag: poolState.resetFlag?.toString(),

                // Size and ratio parameters
                minSize: poolState.minSize?.toString(),
                volMaxCutRatio: poolState.volMaxCutRatio?.toString(),
                amountWaveRatio: poolState.amountWaveRatio?.toString(),
                baseLotSize: poolState.baseLotSize?.toString(),
                quoteLotSize: poolState.quoteLotSize?.toString(),

                // Price multipliers
                minPriceMultiplier: poolState.minPriceMultiplier?.toString(),
                maxPriceMultiplier: poolState.maxPriceMultiplier?.toString(),
                systemDecimalValue: poolState.systemDecimalValue?.toString(),

                // Separation parameters
                minSeparateNumerator: poolState.minSeparateNumerator?.toString(),
                minSeparateDenominator: poolState.minSeparateDenominator?.toString(),

                // Fee structure
                tradeFeeNumerator: poolState.tradeFeeNumerator?.toString(),
                tradeFeeDenominator: poolState.tradeFeeDenominator?.toString(),
                swapFeeNumerator: poolState.swapFeeNumerator?.toString(),
                swapFeeDenominator: poolState.swapFeeDenominator?.toString(),

                // PnL related
                pnlNumerator: poolState.pnlNumerator?.toString(),
                pnlDenominator: poolState.pnlDenominator?.toString(),
                baseNeedTakePnl: poolState.baseNeedTakePnl?.toString(),
                quoteNeedTakePnl: poolState.quoteNeedTakePnl?.toString(),
                quoteTotalPnl: poolState.quoteTotalPnl?.toString(),
                baseTotalPnl: poolState.baseTotalPnl?.toString(),

                // Time related
                poolOpenTime: poolState.poolOpenTime?.toString(),
                orderbookToInitTime: poolState.orderbookToInitTime?.toString(),

                // Punishment amounts
                punishPcAmount: poolState.punishPcAmount?.toString(),
                punishCoinAmount: poolState.punishCoinAmount?.toString(),

                // Swap amounts
                swapBaseInAmount: poolState.swapBaseInAmount?.toString(),
                swapQuoteOutAmount: poolState.swapQuoteOutAmount?.toString(),
                swapBase2QuoteFee: poolState.swapBase2QuoteFee?.toString(),
                swapQuoteInAmount: poolState.swapQuoteInAmount?.toString(),
                swapBaseOutAmount: poolState.swapBaseOutAmount?.toString(),
                swapQuote2BaseFee: poolState.swapQuote2BaseFee?.toString(),

                // PublicKeys
                baseVault: poolState.baseVault?.toString(),
                quoteVault: poolState.quoteVault?.toString(),
                baseMint: poolState.baseMint?.toString(),
                quoteMint: poolState.quoteMint?.toString(),
                lpMint: poolState.lpMint?.toString(),
                openOrders: poolState.openOrders?.toString(),
                marketId: poolState.marketId?.toString(),
                marketProgramId: poolState.marketProgramId?.toString(),
                targetOrders: poolState.targetOrders?.toString(),
                withdrawQueue: poolState.withdrawQueue?.toString(),
                lpVault: poolState.lpVault?.toString(),

                // LP related
                lpReserve: poolState.lpReserve?.toString(),
            };

            // Add new database operations
            const baseMint = poolState.baseMint?.toString();
            const quoteMint = poolState.quoteMint?.toString();
            const baseDecimals = parseInt(poolState.baseDecimal?.toString() || '0');
            const quoteDecimals = parseInt(poolState.quoteDecimal?.toString() || '0');

            if (!baseMint || !quoteMint) {
                logger.warn(`Missing mint addresses for pool ${accountKey}`);
                return;
            }

            // Ensure both tokens exist in our database
            await Promise.all([
                this.ensureTokenExists(baseMint, baseDecimals),
                this.ensureTokenExists(quoteMint, quoteDecimals)
            ]);

            // Store the pool mapping
            await pool().query(
                `INSERT INTO onstrument.raydium_pools (
                    pool_id,
                    token0_mint,
                    token1_mint,
                    token0_decimals,
                    token1_decimals
                ) VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (pool_id) 
                DO UPDATE SET 
                    token0_mint = $2,
                    token1_mint = $3,
                    token0_decimals = $4,
                    token1_decimals = $5`,
                [
                    accountKey,
                    baseMint,
                    quoteMint,
                    baseDecimals,
                    quoteDecimals
                ]
            );

        } catch (error) {
            logger.error('Error processing Raydium V4 AMM:', error);
            if (error instanceof Error) {
                logger.error('Error details:', error.message);
                logger.error('Stack trace:', error.stack);
            }
            throw error;
        }
    }
}

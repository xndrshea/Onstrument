import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { Liquidity, LIQUIDITY_STATE_LAYOUT_V4 } from '@raydium-io/raydium-sdk';
import { pool } from '../../../config/database';
import { NATIVE_SOL_MINT } from '../../../constants';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Umi } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { MetadataService } from '../../metadata/metadataService';
import { Decimal } from 'decimal.js';
import { PRICE_WHITELIST } from '../../../constants/priceWhitelist';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { BN } from 'bn.js';
import bs58 from 'bs58';


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
            switch (programId) {
                case config.RAYDIUM_PROGRAMS.CP_AMM:
                    await this.processCPSwap(buffer, accountKey);
                    break;
                // case config.RAYDIUM_PROGRAMS.V4_AMM:
                //     await this.processV4AMM(buffer, accountKey);
                //     break;
                // case config.RAYDIUM_PROGRAMS.CLMM:
                //     await this.processCLMM(buffer, accountKey);
                //     break;
                default:
                    logger.warn('Unknown Raydium program:', programId);
            }
        } catch (error) {
            logger.error('Error in RaydiumProcessor:', { error, programId, accountKey });
        }
    }

    private async processCPSwap(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            // Skip discriminator (8 bytes)
            let offset = 8;

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



            logger.info('Processed Raydium CP pool:', {
                account: accountKey,
                baseToken: poolState.token0Mint.toString(),
                quoteToken: poolState.token1Mint.toString(),
                baseVault: poolState.token0Vault.toString(),
                quoteVault: poolState.token1Vault.toString(),



            });

        } catch (error) {
            logger.error('Error processing Raydium CP pool:', error);
        }
    }

    private async processV4AMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(buffer);

            // Log the entire pool state object with all fields
            /*logger.info('V4 Pool State:', {
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
            });*/

            // Now let's use that data for price calculation
            const baseMint = poolState.baseMint?.toString();
            const quoteMint = poolState.quoteMint?.toString();
            const baseDecimal = Number(poolState.baseDecimal);
            const quoteDecimal = Number(poolState.quoteDecimal);

            // Only proceed if we have valid data and one of the tokens is whitelisted
            if (baseMint && quoteMint &&
                (PRICE_WHITELIST.has(baseMint) || PRICE_WHITELIST.has(quoteMint))) {

                // Ensure both tokens exist in our database first
                await Promise.all([
                    this.ensureTokenExists(baseMint, baseDecimal),
                    this.ensureTokenExists(quoteMint, quoteDecimal)
                ]);

                const baseVaultBalance = this.getRawNumber(poolState.swapBaseInAmount.toString(), baseDecimal);
                const quoteVaultBalance = this.getRawNumber(poolState.swapQuoteInAmount.toString(), quoteDecimal);

                if (baseVaultBalance !== 0 && quoteVaultBalance !== 0) {
                    let price: number | undefined;
                    let mintToRecord: string | undefined;
                    let volume: number | undefined;

                    // Need to account for these fees in price calculation
                    const tradeFeeNumerator = Number(poolState.tradeFeeNumerator);
                    const tradeFeeDenominator = Number(poolState.tradeFeeDenominator);
                    const swapFeeNumerator = Number(poolState.swapFeeNumerator);
                    const swapFeeDenominator = Number(poolState.swapFeeDenominator);

                    // Calculate total fee multiplier
                    const feeMultiplier = (1 - (tradeFeeNumerator / tradeFeeDenominator)) *
                        (1 - (swapFeeNumerator / swapFeeDenominator));

                    if (baseMint === NATIVE_SOL_MINT) {
                        price = (baseVaultBalance / quoteVaultBalance) / feeMultiplier;  // DIVIDE by fee multiplier
                        mintToRecord = quoteMint;
                        volume = quoteVaultBalance;
                    } else if (quoteMint === NATIVE_SOL_MINT) {
                        price = (quoteVaultBalance / baseVaultBalance) / feeMultiplier;  // DIVIDE by fee multiplier
                        mintToRecord = baseMint;
                        volume = baseVaultBalance;
                    }
                    console.log('Price:', price);
                    console.log('Mint to record:', mintToRecord);
                    console.log('Volume:', volume);

                    if (price && volume) {
                        await this.recordPriceUpdate(mintToRecord!, price, volume);
                    }
                }
            }
        } catch (error) {
            logger.error('Error in processV4AMM:', error);
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



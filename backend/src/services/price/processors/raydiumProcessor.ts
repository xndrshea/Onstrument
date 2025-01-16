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
                case config.RAYDIUM_PROGRAMS.V4_AMM:
                    await this.processV4AMM(buffer, accountKey);
                    break;

                default:
                    logger.warn('Unknown Raydium program:', programId);
            }
        } catch (error) {
            logger.error('Error in RaydiumProcessor:', { error, programId, accountKey });
        }
    }

    private async processCPSwap(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            if (buffer.length < 328) {  // Add this check
                logger.warn(`Buffer too small for CP pool ${accountKey}: ${buffer.length} bytes`);
                return;
            }
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

            await this.pairFetcher({
                baseToken: poolState.token0Mint.toString(),
                quoteToken: poolState.token1Mint.toString(),
                baseVault: poolState.token0Vault.toString(),
                quoteVault: poolState.token1Vault.toString(),
                baseDecimals: poolState.mint0Decimals,
                quoteDecimals: poolState.mint1Decimals,
                accountKey
            });



        } catch (error) {
            logger.error('Error processing Raydium CP pool:', error);
        }
    }

    private async processV4AMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(buffer);

            // Log the entire pool state object with all fields
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



            await this.pairFetcher({
                baseToken: poolState.baseMint.toString(),
                quoteToken: poolState.quoteMint.toString(),
                baseVault: poolState.baseVault.toString(),
                quoteVault: poolState.quoteVault.toString(),
                baseDecimals: parseInt(poolState.baseDecimal.toString()),
                quoteDecimals: parseInt(poolState.quoteDecimal.toString()),
                accountKey
            });





        } catch (error) {
            logger.error('Error in processV4AMM:', error);
        }
    }


    private async ensureTokenExists(mintAddress: string, decimals: number): Promise<boolean> {
        try {
            await pool.query(
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
            const result = await pool.query(
                `SELECT metadata_status FROM onstrument.tokens WHERE mint_address = $1`,
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

    private async pairFetcher({
        baseToken,
        quoteToken,
        baseVault,
        quoteVault,
        baseDecimals,
        quoteDecimals,
        accountKey
    }: {
        baseToken: string,
        quoteToken: string,
        baseVault: string,
        quoteVault: string,
        baseDecimals: number,
        quoteDecimals: number,
        accountKey: string
    }): Promise<void> {
        const NATIVE_SOL = "So11111111111111111111111111111111111111112";

        // Check if either token is SOL
        const isBaseSol = baseToken === NATIVE_SOL;
        const isQuoteSol = quoteToken === NATIVE_SOL;

        if (!isBaseSol && !isQuoteSol) {
            return; // Skip if neither token is SOL
        }

        // Determine which token needs to be tracked
        const tokenToTrack = isBaseSol ? quoteToken : baseToken;

        // Check if token is in whitelist
        if (!PRICE_WHITELIST.has(tokenToTrack)) {
            return; // Skip if token is not in whitelist
        }

        const tokenDecimals = isBaseSol ? quoteDecimals : baseDecimals;

        // Ensure token exists in database
        await this.ensureTokenExists(tokenToTrack, tokenDecimals);

        // Forward to price fetcher
        await PriceFetcher.fetchPrice({
            baseToken,
            quoteToken,
            baseVault,
            quoteVault,
            baseDecimals,
            quoteDecimals,
            accountKey
        });
    }
}
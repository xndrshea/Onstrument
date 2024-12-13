import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { Liquidity } from '@raydium-io/raydium-sdk';
import { pool } from '../../../config/database';
import { NATIVE_SOL_MINT } from '../../../constants';
import { PriceUpdateQueue } from '../queue/priceUpdateQueue';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey, Umi } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { findMetadataPda, Metadata, fetchMetadata } from '@metaplex-foundation/mpl-token-metadata'



interface TokenMetadata {
    name: string;
    symbol: string;
    image?: string;
    uri?: string;
}

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
                case config.RAYDIUM_PROGRAMS.STANDARD_AMM:
                    await this.processStandardAMM(buffer, accountKey);
                    break;
                case config.RAYDIUM_PROGRAMS.LEGACY_AMM:
                    await this.processLegacyAMM(buffer, accountKey);
                    break;
                case config.RAYDIUM_PROGRAMS.CLMM:
                    await this.processCLMM(buffer, accountKey);
                    break;
            }
        } catch (error) {
            logger.error('Error in RaydiumProcessor:', { error, programId, accountKey });
        }
    }

    private async processStandardAMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            logger.info('Starting processStandardAMM', { accountKey });

            const poolState = Liquidity.getStateLayout(4).decode(buffer);

            // Add MORE logging
            logger.info('Processing Standard AMM:', {
                accountKey,
                baseMint: poolState.baseMint?.toString(),
                quoteMint: poolState.quoteMint?.toString(),
                baseDecimal: poolState.baseDecimal,
                quoteDecimal: poolState.quoteDecimal,
                baseVault: poolState.baseVault?.toString(),
                quoteVault: poolState.quoteVault?.toString(),
            });

            // Log raw pool state data
            logger.info('Standard AMM Pool State:', {
                accountKey,
                baseMint: poolState.baseMint?.toString(),
                quoteMint: poolState.quoteMint?.toString(),
                baseDecimal: poolState.baseDecimal,
                quoteDecimal: poolState.quoteDecimal,
                baseVault: poolState.baseVault?.toString(),
                quoteVault: poolState.quoteVault?.toString(),
                // Add any other relevant fields from poolState
            });

            // Basic validation
            if (!poolState.baseMint || !poolState.quoteMint) {
                logger.debug('Invalid pool state - missing mints', { accountKey });
                return;
            }

            const baseMint = poolState.baseMint.toString();
            const quoteMint = poolState.quoteMint.toString();
            const baseDecimals = Number(poolState.baseDecimal);
            const quoteDecimals = Number(poolState.quoteDecimal);

            // Check SOL pair
            const isSolBase = baseMint === NATIVE_SOL_MINT;
            const isSolQuote = quoteMint === NATIVE_SOL_MINT;
            if (!isSolBase && !isSolQuote) {
                logger.debug('Skipping non-SOL pair', { baseMint, quoteMint });
                return;
            }

            const tokenToTrack = isSolBase ? quoteMint : baseMint;
            const tokenDecimals = isSolBase ? quoteDecimals : baseDecimals;

            // Get pool reserves instead of swap amounts for more accurate pricing
            const baseReserve = this.getRawNumber(poolState.baseVault?.toString(), baseDecimals);
            const quoteReserve = this.getRawNumber(poolState.quoteVault?.toString(), quoteDecimals);

            if (baseReserve <= 0 || quoteReserve <= 0) {
                logger.debug('Invalid reserves', { baseReserve, quoteReserve });
                return;
            }

            // Calculate price from reserves
            const price = isSolBase ?
                baseReserve / quoteReserve :
                quoteReserve / baseReserve;

            // Use smaller of the reserves as volume indicator
            const volume = Math.min(baseReserve, quoteReserve);

            if (!isFinite(price) || price <= 0) {
                logger.debug('Invalid price calculated', { price, baseReserve, quoteReserve });
                return;
            }

            // First ensure the token exists
            await this.ensureTokenExists(tokenToTrack);
            // Then record the price update which also saves token info
            await this.recordPriceUpdate(tokenToTrack, price, volume);

            logger.info('SOL pair validation:', {
                baseMint: poolState.baseMint?.toString(),
                quoteMint: poolState.quoteMint?.toString(),
                isSolBase,
                isSolQuote,
                passed: isSolBase || isSolQuote
            });

            logger.info('Price calculation inputs:', {
                baseReserve,
                quoteReserve,
                isSolBase
            });

            logger.info('Price calculation result:', {
                price,
                volume,
                isValid: isFinite(price) && price > 0
            });

        } catch (error) {
            logger.error('Error processing Standard AMM:', error);
        }
    }

    private async processLegacyAMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = Liquidity.getStateLayout(4).decode(buffer);

            // Skip invalid or empty pools
            if (poolState.baseMint?.toString() === '11111111111111111111111111111111' ||
                poolState.quoteMint?.toString() === '11111111111111111111111111111111' ||
                poolState.swapBaseInAmount?.toString() === '0' ||
                poolState.swapQuoteInAmount?.toString() === '0') {
                logger.debug('Skipping invalid/empty pool', { accountKey });
                return;
            }

            // Log raw pool state data
            logger.info('Legacy AMM Pool State:', {
                accountKey,
                baseMint: poolState.baseMint?.toString(),
                quoteMint: poolState.quoteMint?.toString(),
                baseDecimal: poolState.baseDecimal,
                quoteDecimal: poolState.quoteDecimal,
                swapBaseInAmount: poolState.swapBaseInAmount?.toString(),
                swapBaseOutAmount: poolState.swapBaseOutAmount?.toString(),
                swapQuoteInAmount: poolState.swapQuoteInAmount?.toString(),
                swapQuoteOutAmount: poolState.swapQuoteOutAmount?.toString(),
                // Add any other relevant fields from poolState
            });

            // Basic validation
            if (!poolState.baseMint || !poolState.quoteMint) return;

            const baseMint = poolState.baseMint.toString();
            const quoteMint = poolState.quoteMint.toString();
            const baseDecimals = Number(poolState.baseDecimal);
            const quoteDecimals = Number(poolState.quoteDecimal);

            // Check SOL pair
            const isSolBase = baseMint === NATIVE_SOL_MINT;
            const isSolQuote = quoteMint === NATIVE_SOL_MINT;
            if (!isSolBase && !isSolQuote) return;

            const tokenToTrack = isSolBase ? quoteMint : baseMint;
            const tokenDecimals = isSolBase ? quoteDecimals : baseDecimals;

            // Legacy AMM uses swap amounts
            const baseVolume = {
                in: this.getRawNumber(poolState.swapBaseInAmount?.toString(), baseDecimals),
                out: this.getRawNumber(poolState.swapBaseOutAmount?.toString(), baseDecimals)
            };
            const quoteVolume = {
                in: this.getRawNumber(poolState.swapQuoteInAmount?.toString(), quoteDecimals),
                out: this.getRawNumber(poolState.swapQuoteOutAmount?.toString(), quoteDecimals)
            };

            const totalBaseVolume = baseVolume.in + baseVolume.out;
            const totalQuoteVolume = quoteVolume.in + quoteVolume.out;

            if (totalBaseVolume === 0 || totalQuoteVolume === 0) return;

            // Calculate price from volumes
            const price = isSolBase ?
                totalQuoteVolume / totalBaseVolume :  // If SOL is base, price is quote/base
                totalBaseVolume / totalQuoteVolume;   // If SOL is quote, price is base/quote

            // Log the price calculation
            logger.info('Price calculation:', {
                tokenToTrack,
                isSolBase,
                totalBaseVolume,
                totalQuoteVolume,
                price
            });

            // First ensure the token exists
            await this.ensureTokenExists(tokenToTrack);
            // Then record the price update which also saves token info
            await this.recordPriceUpdate(
                tokenToTrack,
                price,
                Math.max(totalBaseVolume, totalQuoteVolume)
            );

            // Legacy AMM also gives us trade information
            if (baseVolume.in > 0 || quoteVolume.in > 0) {
                const tradePrice = isSolBase ?
                    baseVolume.in / quoteVolume.out :
                    quoteVolume.in / baseVolume.out;

                await this.recordTrade({
                    signature: `${accountKey}-${Date.now()}`,
                    tokenAddress: tokenToTrack,
                    tokenType: 'pool',
                    walletAddress: accountKey,
                    side: isSolBase ? 'buy' : 'sell',
                    amount: isSolBase ? baseVolume.in : quoteVolume.in,
                    total: isSolBase ? quoteVolume.out : baseVolume.out,
                    price: tradePrice,
                    slot: 0  // TODO: Get actual slot
                });
            }
        } catch (error) {
            logger.error('Error processing Legacy AMM:', error);
        }
    }

    private async processCLMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            // Log raw buffer data since we haven't implemented CLMM yet
            logger.info('CLMM Raw Data:', {
                accountKey,
                bufferLength: buffer.length,
                bufferPreview: buffer.subarray(0, 100).toString('hex'), // First 100 bytes as hex
            });
        } catch (error) {
            logger.error('Error processing CLMM:', error);
        }
    }

    private getRawNumber(num: string, decimals: number): number {
        if (!num) return 0;
        try {
            return Number(num) / Math.pow(10, decimals);
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
            const tokenExists = await this.ensureTokenExists(mintAddress);

            if (!tokenExists) {
                logger.error(`Failed to ensure token exists: ${mintAddress}`);
                return;
            }

            const queue = PriceUpdateQueue.getInstance();
            await queue.addUpdate({
                mintAddress,
                price,
                volume,
                timestamp: Math.floor(Date.now() / 1000),
            });

        } catch (error) {
            logger.error(`Error in recordPriceUpdate for ${mintAddress}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
        try {
            const metadataPda = findMetadataPda(this.umi, { mint: publicKey(mintAddress) })[0];
            const metadata = await fetchMetadata(this.umi, metadataPda);

            return {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri,
                // Add any other fields you need from the metadata
            };
        } catch (error) {
            logger.error(`Failed to fetch metadata for ${mintAddress}: ${error}`);
            return null;
        }
    }


    private async ensureTokenExists(mintAddress: string): Promise<boolean> {
        try {
            // First just check existence using indexed mint_address
            const existingCheck = await pool.query(
                'SELECT 1 FROM token_platform.tokens WHERE mint_address = $1 LIMIT 1',
                [mintAddress]
            );

            if (existingCheck.rows.length === 0) {
                // Token doesn't exist at all, try to create it
                const metadata = await this.getTokenMetadata(mintAddress);
                if (metadata) {
                    await this.saveToken(mintAddress, metadata);
                    return true;
                }
                return false;
            }

            // Only fetch full token data if we need to check for unknown values
            const tokenData = await pool.query(
                'SELECT name, symbol FROM token_platform.tokens WHERE mint_address = $1 AND (name IS NULL OR name = \'Unknown Token\' OR symbol IS NULL OR symbol = \'UNKNOWN\')',
                [mintAddress]
            );

            if (tokenData.rows.length > 0) {
                // Token exists but needs metadata update
                const metadata = await this.getTokenMetadata(mintAddress);
                if (metadata) {
                    await this.saveToken(mintAddress, metadata);
                }
            }

            return true;
        } catch (error) {
            logger.error(`Error ensuring token exists for ${mintAddress}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private async saveToken(mintAddress: string, metadata: any): Promise<void> {
        try {
            await pool.query(
                `INSERT INTO token_platform.tokens (mint_address, name, symbol, decimals)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (mint_address) 
                 DO UPDATE SET name = $2, symbol = $3, decimals = $4`,
                [mintAddress, metadata.name, metadata.symbol, metadata.decimals]
            );
        } catch (error) {
            logger.error(`Failed to save token ${mintAddress}`);
        }
    }
}



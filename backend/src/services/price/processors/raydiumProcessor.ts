import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { Liquidity } from '@raydium-io/raydium-sdk';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { pool } from '../../../config/database';
import { NATIVE_SOL_MINT } from '../../../constants';
import { PriceUpdate } from '../queue/types';
import { Metaplex } from '@metaplex-foundation/js';
import { TokenListProvider, ENV } from '@solana/spl-token-registry';

interface TokenMetadata {
    name: string;
    symbol: string;
    image?: string;
    uri?: string;
}

const METADATA_TIMEOUT_MS = 15000; // Increase timeout to 15 seconds

export class RaydiumProcessor extends BaseProcessor {
    private connection: Connection;
    private metaplex: Metaplex;

    constructor() {
        super();
        this.connection = new Connection(config.SOLANA_RPC_URL);
        this.metaplex = new Metaplex(this.connection);
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

            // Process the price update
            await this.processTokenPrice(tokenToTrack, tokenDecimals, price, volume, 'raydium_standard');

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
                price,
                source: 'raydium_legacy'
            });

            // Add to queue even if volume is 0 (as long as we can calculate a price)
            if (isFinite(price) && price > 0) {
                await this.queue.add({
                    mintAddress: tokenToTrack,
                    price,
                    volume: Math.max(totalBaseVolume, totalQuoteVolume),
                    timestamp: Date.now(),
                    source: 'raydium_legacy'
                });
            }

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
                bufferPreview: buffer.slice(0, 100).toString('hex'), // First 100 bytes as hex
            });
        } catch (error) {
            logger.error('Error processing CLMM:', error);
        }
    }

    private async processTokenPrice(
        tokenMintAddress: string,
        decimals: number,
        price: number,
        volume: number,
        source: PriceUpdate['source']
    ): Promise<void> {
        try {
            logger.info('Starting processTokenPrice:', {
                tokenMintAddress,
                decimals,
                price,
                volume,
                source
            });

            // First ensure the token exists
            const tokenResult = await this.ensureTokenExists(tokenMintAddress, decimals);
            logger.info('Token ensure result:', { tokenMintAddress, tokenResult });

            // Then record the price update
            const priceResult = await this.recordPriceUpdate(tokenMintAddress, price, volume, source);
            logger.info('Price update result:', { tokenMintAddress, price, priceResult });

        } catch (error) {
            logger.error('Error in processTokenPrice:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                tokenMintAddress
            });
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

    private async ensureTokenExists(mintAddress: string, decimals: number): Promise<void> {
        if (!mintAddress) {
            logger.error('Invalid mint address provided');
            return;
        }

        try {
            // Add more detailed logging
            logger.info('Ensuring token exists:', {
                mintAddress,
                decimals,
                callSite: new Error().stack?.split('\n')[2] // Get caller info
            });

            // Check if token exists in database with better error handling
            const existingToken = await pool.query(`
                SELECT * FROM token_platform.tokens 
                WHERE mint_address = $1
            `, [mintAddress]).catch(err => {
                logger.error('Database query failed:', {
                    error: err.message,
                    query: 'SELECT token',
                    mintAddress
                });
                throw err;
            });

            if (existingToken.rows.length > 0) {
                logger.info('Token already exists:', {
                    mintAddress,
                    tokenData: existingToken.rows[0]
                });
                return;
            }

            // Fetch metadata with timeout and retry
            logger.info('Fetching metadata for new token:', { mintAddress });
            const metadata = await Promise.race([
                this.getTokenMetadata(mintAddress).catch(err => {
                    logger.error('Metadata fetch failed:', {
                        error: err.message,
                        mintAddress,
                        stack: err.stack
                    });
                    return null;
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Metadata fetch timeout after ${METADATA_TIMEOUT_MS}ms`)), METADATA_TIMEOUT_MS)
                )
            ]);

            logger.info('Metadata fetch result:', {
                mintAddress,
                metadata,
                success: !!metadata
            });

            // Insert with better error handling
            const result = await pool.query(`
                INSERT INTO token_platform.tokens 
                (mint_address, name, symbol, decimals, image_url, verified)
                VALUES ($1, $2, $3, $4, $5, false)
                ON CONFLICT (mint_address) DO UPDATE 
                SET updated_at = NOW()
                RETURNING *
            `, [
                mintAddress,
                (metadata as TokenMetadata)?.name || 'Unknown Token',
                (metadata as TokenMetadata)?.symbol || 'UNKNOWN',
                decimals,
                (metadata as TokenMetadata)?.image || ''
            ]).catch(err => {
                logger.error('Token insertion failed:', {
                    error: err.message,
                    mintAddress,
                    metadata
                });
                throw err;
            });

            logger.info('Token operation completed:', {
                mintAddress,
                operation: result.rows[0] ? 'inserted' : 'updated',
                token: result.rows[0]
            });

        } catch (error) {
            logger.error('Error in ensureTokenExists:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                mintAddress,
                decimals
            });
            // Don't throw - let processing continue
            return;
        }
    }

    private async recordPriceUpdate(
        mintAddress: string,
        price: number,
        volume: number,
        source: PriceUpdate['source']
    ): Promise<void> {
        try {
            logger.info('Starting price recording process:', {
                mintAddress,
                price,
                volume,
                source
            });

            await PriceHistoryModel.recordPrice(mintAddress, price, volume);
            logger.info('Successfully recorded price in history:', {
                mintAddress,
                price,
                volume
            });

            await this.queuePriceUpdate({
                mintAddress,
                price,
                volume,
                timestamp: Date.now(),
                source
            });
            logger.info('Successfully queued price update:', {
                mintAddress,
                price
            });
        } catch (error) {
            logger.error('Error in recordPriceUpdate:', {
                error,
                errorType: (error as Error).constructor.name,
                message: (error as Error).message,
                mintAddress,
                price,
                volume
            });
        }
    }

    private async getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
        try {
            // Try token list first (faster and more reliable)
            const provider = await new TokenListProvider().resolve();
            const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
            const token = tokenList.find(t => t.address === mintAddress);

            if (token) {
                return {
                    name: token.name,
                    symbol: token.symbol,
                    uri: '',
                    image: token.logoURI || ''
                };
            }

            // Only try Metaplex as fallback
            const mint = new PublicKey(mintAddress);
            const metadata = await this.metaplex.nfts().findByMint({ mintAddress: mint });

            return {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri,
                image: metadata.json?.image || ''
            };
        } catch (error) {
            logger.error('Error fetching token metadata:', { mintAddress, error: (error as Error).message });
            return null;
        }
    }
}



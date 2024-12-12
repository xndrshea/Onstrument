import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { Liquidity } from '@raydium-io/raydium-sdk';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { pool } from '../../../config/database';
import { NATIVE_SOL_MINT } from '../../../constants';
import { PriceUpdate } from '../queue/types';
import { Metaplex } from "@metaplex-foundation/js";

interface TokenMetadata {
    name: string;
    symbol: string;
    image?: string;
    uri?: string;
}

export class RaydiumProcessor extends BaseProcessor {
    private connection: Connection;
    private metaplexConnection: Metaplex;

    constructor() {
        super();
        this.connection = new Connection(config.SOLANA_RPC_URL);
        this.metaplexConnection = new Metaplex(
            new Connection(config.HELIUS_RPC_URL)
        );
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

            // Debug raw values
            console.log('Standard AMM Raw Values:', {
                swapBaseInAmount: poolState.swapBaseInAmount?.toString(),
                swapQuoteOutAmount: poolState.swapQuoteOutAmount?.toString(),
                swapBase2QuoteFee: poolState.swapBase2QuoteFee?.toString(),
                swapQuoteInAmount: poolState.swapQuoteInAmount?.toString(),
                swapBaseOutAmount: poolState.swapBaseOutAmount?.toString(),
                swapQuote2BaseFee: poolState.swapQuote2BaseFee?.toString(),
                baseDecimal: poolState.baseDecimal?.toString(),
                quoteDecimal: poolState.quoteDecimal?.toString()
            });

            // Convert hex strings to numbers
            const baseDecimal = parseInt(poolState.baseDecimal?.toString() || '0', 16);
            const quoteDecimal = parseInt(poolState.quoteDecimal?.toString() || '0', 16);

            // Convert swap amounts from hex to BigInt
            const baseIn = BigInt(`0x${poolState.swapBaseInAmount?.toString()}`);
            const quoteOut = BigInt(`0x${poolState.swapQuoteOutAmount?.toString()}`);
            const quoteIn = BigInt(`0x${poolState.swapQuoteInAmount?.toString()}`);
            const baseOut = BigInt(`0x${poolState.swapBaseOutAmount?.toString()}`);

            console.log('Decoded Values:', {
                baseDecimal,
                quoteDecimal,
                baseIn: baseIn.toString(),
                quoteOut: quoteOut.toString(),
                quoteIn: quoteIn.toString(),
                baseOut: baseOut.toString()
            });

        } catch (error) {
            console.error('Failed to decode Standard AMM:', error);
        }
    }

    private async processLegacyAMM(buffer: Buffer, accountKey: string): Promise<void> {
        try {
            const poolState = Liquidity.getStateLayout(4).decode(buffer);

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

            const price = isSolBase ?
                totalBaseVolume / totalQuoteVolume :
                totalQuoteVolume / totalBaseVolume;
            const volume = isSolBase ? totalQuoteVolume : totalBaseVolume;

            await this.processTokenPrice(tokenToTrack, tokenDecimals, price, volume, 'raydium_legacy');

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
            // CLMM uses a different state layout and price calculation
            // TODO: Implement CLMM specific logic
            logger.info('CLMM processing not yet implemented');
        } catch (error) {
            logger.error('Error processing CLMM:', error);
        }
    }

    private async processTokenPrice(
        mintAddress: string,
        decimals: number,
        price: number,
        volume: number,
        source: PriceUpdate['source']
    ): Promise<void> {
        await this.ensureTokenExists(mintAddress, decimals);
        await this.recordPriceUpdate(mintAddress, price, volume, source);
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
        try {
            const exists = await pool.query(
                'SELECT mint_address FROM token_platform.tokens WHERE mint_address = $1',
                [mintAddress]
            );

            if (exists.rows.length === 0) {
                const metadata = await this.getTokenMetadata(mintAddress);
                if (!metadata) {
                    logger.warn(`No metadata found for mint: ${mintAddress}`);
                    return;
                }

                await pool.query(`
                    INSERT INTO token_platform.tokens 
                    (mint_address, name, symbol, decimals, metadata_url, image_url, verified)
                    VALUES ($1, $2, $3, $4, $5, $6, false)
                `, [
                    mintAddress,
                    metadata.name,
                    metadata.symbol,
                    decimals,
                    metadata.uri || '',
                    metadata.image || ''
                ]);
            }
        } catch (error) {
            logger.error('Error ensuring token exists:', error);
        }
    }

    private async recordPriceUpdate(
        mintAddress: string,
        price: number,
        volume: number,
        source: PriceUpdate['source']
    ): Promise<void> {
        try {
            await PriceHistoryModel.recordPrice(mintAddress, price, volume);
            await this.queuePriceUpdate({
                mintAddress,
                price,
                volume,
                timestamp: Date.now(),
                source
            });
        } catch (error) {
            logger.error('Error recording price update:', error);
        }
    }

    private async getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
        try {
            // Add defensive check
            if (!mintAddress) {
                console.warn('Received empty mint address');
                return null;
            }

            // Log the mint address for debugging
            console.log('Fetching metadata for mint:', mintAddress);

            const metadata = await this.metaplexConnection.nfts().findByMint({
                mintAddress: new PublicKey(mintAddress)
            });

            // Add defensive check for metadata
            if (!metadata) {
                console.warn(`No metadata found for mint: ${mintAddress}`);
                return null;
            }

            return {
                name: metadata.name,
                symbol: metadata.symbol,
                image: metadata.json?.image || ''
            };
        } catch (error) {
            console.error('Error fetching token metadata:', error);
            return null;
        }
    }
}



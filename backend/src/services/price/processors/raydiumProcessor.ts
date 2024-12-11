import { BaseProcessor, PriceUpdate } from './baseProcessor';
import { logger } from '../../../utils/logger';
import { config } from '../../../config/env';
import { Liquidity } from '@raydium-io/raydium-sdk';

export class RaydiumProcessor extends BaseProcessor {
    async processEvent(buffer: Buffer, accountKey: string, programId: string): Promise<void> {
        try {
            logger.info('Received Raydium event:', {
                programId,
                accountKey,
                bufferLength: buffer.length
            });

            switch (programId) {
                case config.RAYDIUM_PROGRAMS.STANDARD_AMM:
                    try {
                        const poolState = Liquidity.getStateLayout(4).decode(buffer);

                        const formatNumber = (num: string, decimals: number) => {
                            return (Number(num) / Math.pow(10, decimals)).toLocaleString();
                        };

                        const baseDecimals = Number(poolState.baseDecimal);
                        const quoteDecimals = Number(poolState.quoteDecimal);

                        const poolInfo = {
                            baseVault: poolState.baseVault?.toString(),
                            quoteVault: poolState.quoteVault?.toString(),
                            baseBalance: formatNumber(poolState.baseDecimal?.toString() || '0', baseDecimals),
                            quoteBalance: formatNumber(poolState.quoteDecimal?.toString() || '0', quoteDecimals),
                            status: poolState.status?.toString()
                        };

                        logger.info('Standard AMM Pool Summary:', {
                            poolId: accountKey,
                            ...poolInfo
                        });

                    } catch (e: any) {
                        logger.error('Failed to decode Standard AMM', {
                            error: e.message,
                            bufferLength: buffer.length
                        });
                    }
                    break;

                case config.RAYDIUM_PROGRAMS.LEGACY_AMM:
                    try {
                        const poolState = Liquidity.getStateLayout(4).decode(buffer);

                        // Calculate actual volumes in human-readable format
                        const baseDecimals = Number(poolState.baseDecimal);
                        const quoteDecimals = Number(poolState.quoteDecimal);

                        const formatNumber = (num: string, decimals: number) => {
                            return (Number(num) / Math.pow(10, decimals)).toLocaleString();
                        };

                        const poolInfo = {
                            // Token Information
                            baseMint: poolState.baseMint?.toString(),
                            quoteMint: poolState.quoteMint?.toString(),

                            // Pool Statistics
                            status: poolState.status?.toString(),
                            depth: poolState.depth?.toString(),


                            // Trading Volume (in actual token amounts)
                            baseVolume: {
                                in: formatNumber(poolState.swapBaseInAmount?.toString() || '0', baseDecimals),
                                out: formatNumber(poolState.swapBaseOutAmount?.toString() || '0', baseDecimals),
                            },
                            quoteVolume: {
                                in: formatNumber(poolState.swapQuoteInAmount?.toString() || '0', quoteDecimals),
                                out: formatNumber(poolState.swapQuoteOutAmount?.toString() || '0', quoteDecimals),
                            },

                            // Fee Information
                            swapFeeRate: `${(Number(poolState.swapFeeNumerator) / Number(poolState.swapFeeDenominator) * 100).toFixed(2)}%`,
                            tradeFeeRate: `${(Number(poolState.tradeFeeNumerator) / Number(poolState.tradeFeeDenominator) * 100).toFixed(2)}%`,
                        };

                        logger.info('Legacy AMM Pool Summary:', {
                            poolId: accountKey,
                            ...poolInfo
                        });

                    } catch (e: any) {
                        logger.error('Failed to decode Legacy AMM', {
                            error: e.message,
                            bufferLength: buffer.length
                        });
                    }
                    break;

                case config.RAYDIUM_PROGRAMS.CLMM:
                    try {
                        const poolState = Liquidity.getStateLayout(4).decode(buffer);

                        // Format pool state into human readable format
                        const poolInfo = {
                            tokens: {
                                base: {
                                    decimal: poolState.baseDecimal?.toString(),
                                    vault: poolState.baseVault?.toString()
                                },
                                quote: {
                                    decimal: poolState.quoteDecimal?.toString(),
                                    vault: poolState.quoteVault?.toString()
                                }
                            },
                            metrics: {
                                status: poolState.status?.toString(),
                                depth: poolState.depth?.toString()
                            }
                        };

                        logger.info('CLMM Pool Summary:', {
                            poolId: accountKey,
                            ...poolInfo
                        });

                        // TODO: Calculate price using CLMM specific formula
                    } catch (e: any) {
                        logger.error('Failed to decode CLMM', {
                            error: e.message,
                            bufferLength: buffer.length
                        });
                    }
                    break;
            }
        } catch (error: any) {
            logger.error('Error in RaydiumProcessor:', { error: error.message });
        }
    }
}


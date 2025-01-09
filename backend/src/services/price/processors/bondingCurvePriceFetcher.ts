import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import WebSocket from 'ws';
import { WebSocketClient } from '../websocket/types';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { wsManager } from '../../websocket/WebSocketManager';

interface BondingCurvePairData {
    mintAddress: string;
    curveAddress: string;
    tokenVault: string;
    decimals: number;
    volume?: number;
}

export class BondingCurvePriceFetcher {
    private static instance: BondingCurvePriceFetcher;
    private connection: Connection;
    private readonly VIRTUAL_SOL = 30_000_000_000; // 30 SOL in lamports
    private queue: BondingCurvePairData[] = [];
    private readonly BATCH_SIZE = 100;
    private isProcessing = false;
    private lastProcessTime = Date.now();
    private readonly PROCESS_INTERVAL = 5000; // 5 seconds

    private constructor() {
        this.connection = new Connection(config.HELIUS_DEVNET_RPC_URL);
        setInterval(() => this.checkAndProcessBatch(), 1000);
    }

    public static getInstance(): BondingCurvePriceFetcher {
        if (!this.instance) {
            this.instance = new BondingCurvePriceFetcher();
        }
        return this.instance;
    }

    static async fetchPrice(pairData: BondingCurvePairData): Promise<void> {
        const instance = BondingCurvePriceFetcher.getInstance();
        instance.queue.push(pairData);

        if (instance.queue.length >= instance.BATCH_SIZE && !instance.isProcessing) {
            await instance.processBatch();
        }
    }

    private async checkAndProcessBatch(): Promise<void> {
        const now = Date.now();
        if (!this.isProcessing && this.queue.length > 0 &&
            (now - this.lastProcessTime >= this.PROCESS_INTERVAL)) {
            await this.processBatch();
        }
    }

    private async processBatch(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;
        this.lastProcessTime = Date.now();

        try {
            this.isProcessing = true;
            const batchToProcess = this.queue.splice(0, this.BATCH_SIZE);

            // Batch fetch token balances and curve balances
            const [tokenAccounts, curveBalances] = await Promise.all([
                this.connection.getMultipleAccountsInfo(
                    batchToProcess.map(p => new PublicKey(p.tokenVault))
                ),
                this.connection.getMultipleAccountsInfo(
                    batchToProcess.map(p => new PublicKey(p.curveAddress))
                )
            ]);

            // Process each pair
            for (let i = 0; i < batchToProcess.length; i++) {
                const pair = batchToProcess[i];
                const tokenAccount = tokenAccounts[i];
                const curveAccount = curveBalances[i];

                if (!tokenAccount?.data || !curveAccount) {
                    logger.error("Missing account data for:", {
                        mint: pair.mintAddress,
                        vault: pair.tokenVault,
                        curve: pair.curveAddress
                    });
                    continue;
                }

                const tokenAmount = BigInt(tokenAccount.data.readBigUInt64LE(64));
                const curveBalance = BigInt(curveAccount.lamports);

                await this.calculateAndRecordPrice(
                    pair.mintAddress,
                    curveBalance,
                    tokenAmount,
                    pair.decimals,
                    pair.volume
                );
            }

        } catch (error) {
            logger.error('Error processing bonding curve batch:', error);
        } finally {
            this.isProcessing = false;

            // Check if there are more pairs to process
            if (this.queue.length >= this.BATCH_SIZE) {
                await this.processBatch();
            }
        }
    }

    private async calculateAndRecordPrice(
        mintAddress: string,
        solAmount: bigint,
        tokenAmount: bigint,
        decimals: number,
        volume?: number
    ): Promise<void> {
        try {
            const totalSolAmount = solAmount + BigInt(this.VIRTUAL_SOL);
            const price = (Number(totalSolAmount) / 1e9) / (Number(tokenAmount) / (10 ** decimals));

            // Calculate market cap (total SOL in lamports converted to SOL)
            const marketCap = Number(totalSolAmount) / 1e9;

            logger.debug('Price calculation details', {
                mintAddress,
                totalSolAmount: totalSolAmount.toString(),
                calculatedPrice: price,
                marketCap,
                curveSolBalance: Number(solAmount) / 1e9,
                virtualSol: Number(this.VIRTUAL_SOL) / 1e9,
                tokenSupply: Number(tokenAmount) / (10 ** decimals),
                timestamp: new Date().toISOString()
            });

            if (!isFinite(price) || price <= 0) {
                logger.error(`Invalid price calculation`, {
                    mintAddress,
                    price,
                    totalSolAmount: totalSolAmount.toString(),
                    tokenAmount: tokenAmount.toString()
                });
                return;
            }

            await PriceHistoryModel.recordPrice({
                mintAddress,
                price,
                marketCap,  // Add market cap to price history
                volume: volume || 0,
                timestamp: new Date()
            });

            logger.info('Successfully recorded price', {
                mintAddress,
                price,
                marketCap,
                volume: volume || 0,
                timestamp: new Date().toISOString()
            });

            this.emitPriceUpdate({
                mintAddress,
                price,
                volume: volume || 0
            });
        } catch (error) {
            logger.error(`Error calculating price`, {
                error,
                stack: (error as Error).stack,
                mintAddress,
                solAmount: solAmount.toString(),
                tokenAmount: tokenAmount.toString()
            });
        }
    }

    private emitPriceUpdate(update: { mintAddress: string; price: number; volume: number; }) {
        logger.debug('Emitting price update', {
            ...update,
            timestamp: Date.now()
        });

        wsManager.broadcastPrice(update.mintAddress, update.price);

        logger.debug('WebSocket clients status', wsManager.getStats());
    }
}
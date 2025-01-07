import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import WebSocket from 'ws';
import { WebSocketClient } from '../websocket/types';

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
    private queue: BondingCurvePairData[] = [];
    private isProcessing = false;
    private lastProcessTime = 0;
    private readonly BATCH_SIZE = 100;
    private readonly PROCESS_INTERVAL = 1000; // 1 second for bonding curves
    private readonly VIRTUAL_SOL = 30_000_000_000; // 1 SOL in lamports

    private constructor() {
        this.connection = new Connection(config.HELIUS_RPC_URL);
        setInterval(() => this.checkAndProcessBatch(), 500);
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

            // Batch fetch SOL balances from curve accounts
            const solBalances = await this.connection.getMultipleAccountsInfo(
                batchToProcess.map(pair => new PublicKey(pair.curveAddress))
            );

            // Batch fetch token balances from vaults
            const tokenAccounts = await this.connection.getMultipleAccountsInfo(
                batchToProcess.map(pair => new PublicKey(pair.tokenVault))
            );

            // Process each pair
            for (let i = 0; i < batchToProcess.length; i++) {
                const pair = batchToProcess[i];
                const solBalance = solBalances[i]?.lamports || 0;
                const tokenAccount = tokenAccounts[i];

                if (!tokenAccount?.data) {
                    logger.error(`Missing token account data for ${pair.mintAddress}`);
                    continue;
                }

                const tokenAmount = this.extractTokenAmount(tokenAccount.data);
                const solAmount = BigInt(solBalance);

                await this.calculateAndRecordPrice(
                    pair.mintAddress,
                    solAmount,
                    tokenAmount,
                    pair.decimals,
                    pair.volume
                );
            }
        } catch (error) {
            logger.error('Error processing bonding curve batch:', error);
        } finally {
            this.isProcessing = false;

            if (this.queue.length >= this.BATCH_SIZE) {
                await this.processBatch();
            }
        }
    }

    private extractTokenAmount(data: Buffer): bigint {
        return BigInt(data.readBigUInt64LE(64));
    }

    private async calculateAndRecordPrice(
        mintAddress: string,
        solAmount: bigint,
        tokenAmount: bigint,
        decimals: number,
        volume?: number
    ): Promise<void> {
        try {
            // Add virtual SOL to the actual SOL balance
            const totalSolAmount = solAmount + BigInt(this.VIRTUAL_SOL);

            // Price calculation including virtual SOL
            const price = (Number(totalSolAmount) / 1e9) / (Number(tokenAmount) / (10 ** decimals));

            if (!isFinite(price) || price <= 0) {
                logger.error(`Invalid price calculation for ${mintAddress}:`, {
                    solAmount: solAmount.toString(),
                    virtualSol: this.VIRTUAL_SOL,
                    totalSolAmount: totalSolAmount.toString(),
                    tokenAmount: tokenAmount.toString(),
                    price
                });
                return;
            }

            await PriceHistoryModel.recordPrice({
                mintAddress,
                price,
                volume: volume || 0,
                timestamp: new Date()
            });

            this.emitPriceUpdate({
                mintAddress,
                price,
                volume: volume || 0
            });

        } catch (error) {
            logger.error(`Error calculating price for ${mintAddress}:`, error);
        }
    }

    private emitPriceUpdate(update: {
        mintAddress: string;
        price: number;
        volume: number;
    }) {
        const wss = global.wss;
        if (wss) {
            wss.clients.forEach((client: WebSocketClient) => {
                if (client.readyState === WebSocket.OPEN &&
                    client.subscriptions?.has(update.mintAddress)) {
                    client.send(JSON.stringify({
                        type: 'price',
                        ...update,
                        timestamp: Date.now()
                    }));
                }
            });
        }
    }
} 
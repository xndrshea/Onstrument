import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';

interface PairData {
    baseToken: string;
    quoteToken: string;
    baseVault: string;
    quoteVault: string;
    baseDecimals: number;
    quoteDecimals: number;
    accountKey: string;
}

export class PriceFetcher {
    private static instance: PriceFetcher;
    private connection: Connection;
    private queue: PairData[] = [];
    private readonly BATCH_SIZE = 100; // Updated to 200 pairs
    private isProcessing = false;
    private lastProcessTime: number = Date.now();
    private readonly PROCESS_INTERVAL = 10000; // 10 seconds in milliseconds

    private constructor() {
        this.connection = new Connection(config.HELIUS_RPC_URL);
        // Start periodic check
        setInterval(() => this.checkAndProcessBatch(), 1000);
    }

    static getInstance(): PriceFetcher {
        if (!this.instance) {
            this.instance = new PriceFetcher();
        }
        return this.instance;
    }

    static async fetchPrice(pairData: PairData): Promise<void> {
        const instance = PriceFetcher.getInstance();
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
            const NATIVE_SOL = "So11111111111111111111111111111111111111112";

            // Separate SOL vaults and token vaults
            const solVaults: { pubkey: PublicKey, pairIndex: number, isBase: boolean }[] = [];
            const tokenVaults: { pubkey: PublicKey, pairIndex: number, isBase: boolean }[] = [];

            batchToProcess.forEach((pair, index) => {
                const isBaseSol = pair.baseToken === NATIVE_SOL;
                const isQuoteSol = pair.quoteToken === NATIVE_SOL;

                if (isBaseSol) {
                    solVaults.push({ pubkey: new PublicKey(pair.baseVault), pairIndex: index, isBase: true });
                    tokenVaults.push({ pubkey: new PublicKey(pair.quoteVault), pairIndex: index, isBase: false });
                } else if (isQuoteSol) {
                    tokenVaults.push({ pubkey: new PublicKey(pair.baseVault), pairIndex: index, isBase: true });
                    solVaults.push({ pubkey: new PublicKey(pair.quoteVault), pairIndex: index, isBase: false });
                } else {
                    logger.error(`Invalid pair ${pair.accountKey}: neither token is SOL`);
                }
            });

            // Batch fetch SOL balances
            const solBalances = await this.connection.getMultipleAccountsInfo(
                solVaults.map(v => v.pubkey)
            );

            // Batch fetch token account infos
            const tokenAccountInfos = await this.connection.getMultipleAccountsInfo(
                tokenVaults.map(v => v.pubkey)
            );

            // Create a map to store all amounts
            const amounts = new Map<string, bigint>();

            // Process SOL balances
            solVaults.forEach((vault, i) => {
                const balance = BigInt(solBalances[i]?.lamports || 0);
                const key = `${vault.pairIndex}-${vault.isBase ? 'base' : 'quote'}`;
                amounts.set(key, balance);
            });

            // Process token accounts
            tokenVaults.forEach((vault, i) => {
                const accountInfo = tokenAccountInfos[i];
                if (!accountInfo?.data) {
                    logger.error(`Missing token account info for vault ${vault.pubkey.toString()}`);
                    return;
                }
                const amount = this.extractTokenAmount(accountInfo.data);
                const key = `${vault.pairIndex}-${vault.isBase ? 'base' : 'quote'}`;
                amounts.set(key, amount);
            });

            // Calculate prices for all pairs
            for (let i = 0; i < batchToProcess.length; i++) {
                const pair = batchToProcess[i];
                const baseAmount = amounts.get(`${i}-base`);
                const quoteAmount = amounts.get(`${i}-quote`);

                if (!baseAmount || !quoteAmount) {
                    logger.error(`Missing amounts for pair ${pair.accountKey}`);
                    continue;
                }

                await this.calculateAndRecordPrice(pair, baseAmount, quoteAmount);
            }
        } catch (error) {
            logger.error('Error processing price batch:', error);
        } finally {
            this.isProcessing = false;

            // Check if there are more pairs to process
            if (this.queue.length >= this.BATCH_SIZE) {
                await this.processBatch();
            }
        }
    }

    private extractTokenAmount(data: Buffer): bigint {
        // Token account data structure: after header, amount is at offset 64
        return BigInt(data.readBigUInt64LE(64));
    }

    private async calculateAndRecordPrice(
        pair: PairData,
        baseAmount: bigint,
        quoteAmount: bigint
    ): Promise<void> {
        const NATIVE_SOL = "So11111111111111111111111111111111111111112";
        const isBaseSol = pair.baseToken === NATIVE_SOL;

        try {
            let price: number;
            let volume: number;

            if (isBaseSol) {
                // Price = SOL amount / 10^9 (SOL decimals) needed for 1 token
                price = (Number(baseAmount) / 1e9) / (Number(quoteAmount) / (10 ** pair.quoteDecimals));
                volume = Number(quoteAmount) / (10 ** pair.quoteDecimals);
                await PriceHistoryModel.recordPrice({
                    mintAddress: pair.quoteToken,
                    price,
                    volume,
                    timestamp: new Date()
                });
            } else {
                // Price = SOL amount / 10^9 (SOL decimals) needed for 1 token
                price = (Number(quoteAmount) / 1e9) / (Number(baseAmount) / (10 ** pair.baseDecimals));
                volume = Number(baseAmount) / (10 ** pair.baseDecimals);
                await PriceHistoryModel.recordPrice({
                    mintAddress: pair.baseToken,
                    price,
                    volume,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            logger.error(`Error calculating price for pair ${pair.accountKey}:`, error);
        }
    }
}
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import WebSocket from 'ws';
import { WebSocketClient } from '../websocket/types';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { wsManager } from '../../websocket/WebSocketManager';
import { pool } from '../../../config/database';

interface BondingCurvePairData {
    mintAddress: string;
    curveAddress: string;
    tokenVault: string;
    decimals: number;
    volume?: number;
    isBuy?: boolean;
}

// Update OHLC interface to only use USD prices
interface OHLCData {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    market_cap: number;
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

        console.log(pairData);


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

        try {
            this.isProcessing = true;
            const batchToProcess = [...this.queue];
            this.queue = [];



            // Explicitly use 'confirmed' commitment when fetching account data
            const [tokenAccounts, curveBalances] = await Promise.all([
                this.connection.getMultipleAccountsInfo(
                    batchToProcess.map(p => new PublicKey(p.tokenVault)),
                    { commitment: 'confirmed' }  // Add explicit commitment
                ),
                this.connection.getMultipleAccountsInfo(
                    batchToProcess.map(p => new PublicKey(p.curveAddress)),
                    { commitment: 'confirmed' }  // Add explicit commitment
                )
            ]);


            // Process each pair
            for (let i = 0; i < batchToProcess.length; i++) {
                const pair = batchToProcess[i];


                const tokenAccount = tokenAccounts[i];
                const curveAccount = curveBalances[i];

                if (!tokenAccount?.data || !curveAccount) {
                    continue;
                }

                const tokenAmount = BigInt(tokenAccount.data.readBigUInt64LE(64));
                const curveBalance = BigInt(curveAccount.lamports);

                await this.calculateAndRecordPrice(
                    pair.mintAddress,
                    curveBalance,
                    tokenAmount,
                    pair.decimals,
                    pair.volume,
                    pair.isBuy
                );
            }

        } catch (error) {
            logger.error('Error processing bonding curve batch:', error);
        } finally {
            this.isProcessing = false;
            this.lastProcessTime = Date.now();

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
        volume?: number,
        isBuy?: boolean
    ): Promise<void> {
        try {


            // If it's a sell and the token amount is very small (dust), treat it as zero
            if (isBuy === false && tokenAmount < BigInt(1000)) {
                tokenAmount = BigInt(0);
                solAmount = BigInt(0);
            }



            const solPrice = await this.getSolUsdPrice();
            const volumeUsd = volume ? volume * solPrice : 0;




            // Convert amounts to numbers and handle decimals
            const solBalanceInSol = Number(solAmount) / LAMPORTS_PER_SOL;
            const tokenSupply = Number(tokenAmount) / (10 ** decimals);
            const virtualSolInSol = this.VIRTUAL_SOL / LAMPORTS_PER_SOL;



            const solPerToken = (solBalanceInSol + virtualSolInSol) / tokenSupply;
            const usdPrice = solPerToken * solPrice;
            const marketCap = (solBalanceInSol + virtualSolInSol) * solPrice;



            await PriceHistoryModel.recordPrice({
                mintAddress,
                price: usdPrice,
                marketCap,
                volume: volumeUsd,
                timestamp: new Date(),
                isBuy
            });



            wsManager.broadcastPrice(mintAddress, usdPrice, volumeUsd);
        } catch (error) {
            logger.error('Error calculating price:', error);
            throw error;
        }
    }

    private async getSolUsdPrice(): Promise<number> {
        try {
            const result = await pool.query(`
                SELECT current_price
                FROM onstrument.tokens 
                WHERE mint_address = 'So11111111111111111111111111111111111111112'
            `);

            const price = Number(result.rows[0]?.current_price);
            if (!price) {
                logger.warn('No SOL price found, using default');
                return 187.5; // Fallback to recent price
            }

            logger.debug('Got SOL price:', { price });
            return price;
        } catch (error) {
            logger.error('Error getting SOL price:', error);
            return 187.5; // Fallback on error
        }
    }
}
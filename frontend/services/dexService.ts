import { TokenRecord } from '../../shared/types/token';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Liquidity, Market, Token } from '@raydium-io/raydium-sdk';
import { connection } from '../config';
import { WebSocketService } from './websocketService';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

interface TradeParams {
    mintAddress: string;
    amount: number;
    isSelling: boolean;
    slippageTolerance: number;
}

interface PriceSubscriber {
    callback: (price: number) => void;
    mintAddress: string;
}

export class DexService {
    private static instance: DexService | null = null;
    private connection: Connection;
    private wsService: WebSocketService;
    private priceSubscribers: PriceSubscriber[] = [];
    private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
    private readonly CACHE_DURATION = 5000; // 5 seconds

    private constructor() {
        this.connection = connection;
        this.wsService = WebSocketService.getInstance();
        this.setupWebSocketListeners();
    }

    static getInstance(): DexService {
        if (!DexService.instance) {
            DexService.instance = new DexService();
        }
        return DexService.instance;
    }

    private setupWebSocketListeners() {
        this.wsService.on('price', (data: { mintAddress: string; price: number; trade?: any }) => {
            try {
                this.priceCache.set(data.mintAddress, {
                    price: data.price,
                    timestamp: Date.now()
                });

                const subscribers = this.priceSubscribers
                    .filter(sub => sub.mintAddress === data.mintAddress);

                subscribers.forEach(sub => {
                    try {
                        sub.callback(data.price);
                    } catch (error) {
                        logger.error(`Subscriber callback failed: ${error}`);
                    }
                });
            } catch (error) {
                logger.error(`WebSocket price handler failed: ${error}`);
            }
        });
    }

    subscribeToPriceUpdates(mintAddress: string, callback: (price: number) => void) {
        this.priceSubscribers.push({ callback, mintAddress });
        this.wsService.subscribe(mintAddress);
        return () => {
            this.priceSubscribers = this.priceSubscribers.filter(
                sub => !(sub.callback === callback && sub.mintAddress === mintAddress)
            );
        };
    }

    async getTopTokens(): Promise<TokenRecord[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/tokens?type=raydium`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const tokens = await response.json();

            // Subscribe to all top tokens
            tokens.forEach(token => this.wsService.subscribe(token.mintAddress));

            return tokens;
        } catch (error) {
            console.error('Error fetching DEX tokens:', error);
            throw error;
        }
    }

    async getTokenPrice(mintAddress: string): Promise<number> {
        // Check cache first
        const cached = this.priceCache.get(mintAddress);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
            return cached.price;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/dex/price/${mintAddress}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            // Update cache
            this.priceCache.set(mintAddress, {
                price: data.price,
                timestamp: Date.now()
            });

            // Ensure we're subscribed to updates
            this.wsService.subscribe(mintAddress);

            return data.price;
        } catch (error) {
            console.error('Error fetching token price:', error);
            throw error;
        }
    }

    async executeTrade({ mintAddress, amount, isSelling, slippageTolerance }: TradeParams): Promise<string> {
        try {
            const response = await fetch(`${API_BASE_URL}/dex/pool/${mintAddress}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch pool info`);
            }
            const poolInfo = await response.json();

            const tx = await this.createTradeTransaction({
                poolAddress: new PublicKey(poolInfo.poolAddress),
                mintAddress: new PublicKey(mintAddress),
                amount,
                isSelling,
                slippageTolerance
            });

            // Trade execution is handled by the WebSocket service automatically
            // We just need to send the transaction

            return tx;
        } catch (error) {
            console.error('Trade execution error:', error);
            throw new Error(error instanceof Error ? error.message : 'Trade failed');
        }
    }

    async getTradeHistory(mintAddress: string): Promise<any[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/dex/trades/${mintAddress}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch trade history`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching trade history:', error);
            throw error;
        }
    }
}
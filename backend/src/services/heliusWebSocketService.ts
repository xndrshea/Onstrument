import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { config } from '../config/env';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { Connection, PublicKey } from '@solana/web3.js';

interface ParsedPoolData {
    mintAddress: string;
    price: number;
    baseReserve: number;
    quoteReserve: number;
    baseVolume?: number;
    quoteVolume?: number;
}

export class HeliusWebSocketService extends EventEmitter {
    private static instance: HeliusWebSocketService;
    private ws: WebSocket | null = null;
    private currentMintAddress: string | null = null;
    private messageCount = 0;
    private readonly MAX_LOGS = 20;

    public async initialize(): Promise<void> {
        logger.info('Initializing HeliusWebSocketService');
        this.connect();
    }

    private constructor() {
        super();
    }

    static getInstance(): HeliusWebSocketService {
        if (!this.instance) {
            this.instance = new HeliusWebSocketService();
        }
        return this.instance;
    }

    private connect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.ws = new WebSocket(config.HELIUS_WEBSOCKET_URL);

        this.ws.on('open', () => {
            logger.info('Connected to Helius WebSocket');

            const subscribeMessage = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "programSubscribe",
                "params": [
                    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
                    {
                        "encoding": "jsonParsed"
                    }
                ]
            };

            this.ws?.send(JSON.stringify(subscribeMessage));
            logger.info('Sent subscription request');
        });

        this.ws.on('message', async (data) => {
            if (this.messageCount >= this.MAX_LOGS) return;

            const messageStr = data.toString('utf8');
            try {
                const messageObj = JSON.parse(messageStr);

                if (messageObj.method === "programNotification") {
                    const accountData = messageObj.params.result.value.account;
                    const buffer = Buffer.from(accountData.data[0], 'base64');

                    if (buffer.length === 752) {
                        const baseReserve = buffer.readBigUInt64LE(192);
                        const quoteReserve = buffer.readBigUInt64LE(200);

                        if (baseReserve > 0 && quoteReserve > 0) {
                            this.messageCount++;
                            const price = Number(quoteReserve) / Number(baseReserve);

                            logger.info(`Active Pool #${this.messageCount}:`, {
                                poolId: messageObj.params.result.value.pubkey,
                                baseReserve: baseReserve.toString(),
                                quoteReserve: quoteReserve.toString(),
                                calculatedPrice: price
                            });
                        }
                    }
                }
            } catch (error) {
                logger.error('Error processing WebSocket message:', error);
            }
        });

        this.ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('close', () => {
            logger.warn('WebSocket connection closed');
            setTimeout(() => this.connect(), 5000);
        });
    }

    public getStatus() {
        return {
            connected: this.ws?.readyState === WebSocket.OPEN,
            currentMint: this.currentMintAddress
        };
    }


}
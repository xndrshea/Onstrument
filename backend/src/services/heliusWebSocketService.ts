import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { config } from '../config/env';

export class HeliusWebSocketService extends EventEmitter {
    private static instance: HeliusWebSocketService;
    private ws: WebSocket | null = null;

    private constructor() {
        super();
        this.connect();
    }

    static getInstance(): HeliusWebSocketService {
        if (!this.instance) {
            this.instance = new HeliusWebSocketService();
        }
        return this.instance;
    }

    private connect() {
        this.ws = new WebSocket(config.HELIUS_WEBSOCKET_URL);

        this.ws.on('open', () => {
            logger.info('Connected to Helius WebSocket');
            this.subscribe();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(JSON.parse(data.toString()));
        });
    }

    async getPriceHistory(mintAddress: string, timeframe: '24h' | '7d' | '30d'): Promise<any[]> {
        const intervalMap = { '24h': '1 day', '7d': '7 days', '30d': '30 days' };

        const result = await pool.query(`
            SELECT EXTRACT(EPOCH FROM timestamp) as time, price as value
            FROM token_platform.price_history
            WHERE mint_address = $1 AND timestamp > NOW() - $2::interval
            ORDER BY timestamp ASC
        `, [mintAddress, intervalMap[timeframe]]);

        return result.rows;
    }

    async getTradeHistory(mintAddress: string, limit: number = 50) {
        const result = await pool.query(`
            SELECT 
                price,
                amount,
                side,
                wallet_address as walletAddress,
                signature,
                timestamp
            FROM token_platform.trade_history
            WHERE mint_address = $1
            ORDER BY timestamp DESC
            LIMIT $2
        `, [mintAddress, limit]);

        return result.rows;
    }

    getStatus() {
        return {
            connected: this.ws?.readyState === WebSocket.OPEN,
            lastMessage: this.lastMessageTime,
            subscribedTokens: this.subscribedTokens.size
        };
    }

    private lastMessageTime: Date | null = null;
    private subscribedTokens: Set<string> = new Set();

    private subscribe() {
        if (!this.ws) return;

        const subscribeMessage = {
            jsonrpc: "2.0",
            id: "helius-sub",
            method: "subscribe",
            params: ["trade"]
        };

        this.ws.send(JSON.stringify(subscribeMessage));
        logger.info('Subscribed to Helius trade events');
    }

    initialize(wss: WebSocket.Server) {
        wss.on('connection', (ws) => {
            logger.info('Client connected to WebSocket');

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleClientMessage(data, ws);
                } catch (error) {
                    logger.error('Error handling client message:', error);
                }
            });
        });
    }

    private handleClientMessage(data: any, ws: WebSocket) {
        logger.info('Processing client message:', data);
    }

    public handleMessage(data: any, ws?: WebSocket) {
        logger.info('Received message:', data);
        // Handle both Helius and client messages
        if (ws) {
            // Client message handling
            this.handleClientMessage(data, ws);
        } else {
            // Helius message handling
            this.handleHeliusMessage(data);
        }
    }

    private handleHeliusMessage(data: any) {
        logger.info('Processing Helius message:', data);
    }
} 
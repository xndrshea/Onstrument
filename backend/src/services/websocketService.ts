import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

export class WebSocketService extends EventEmitter {
    private static instance: WebSocketService;
    private ws: WebSocket | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private subscribedTokens: Set<string> = new Set();
    private clients: Set<WebSocket> = new Set();
    private subscriptions: Map<string, Set<WebSocket>> = new Map();

    private constructor() {
        super();
        this.initializeConnection();
    }

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    private initializeConnection() {
        this.ws = new WebSocket('wss://api.raydium.io/v2/main/ws');

        this.ws.on('open', () => {
            logger.info('Connected to Raydium WebSocket');
            this.subscribeToTokens();
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleMessage(message);
            } catch (error) {
                logger.error('Error processing WebSocket message:', error);
            }
        });

        this.ws.on('close', () => this.handleReconnect());
        this.ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            this.handleReconnect();
        });
    }

    private async handleMessage(message: any) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (message.type === 'trade') {
                const { marketId, price, size, side, timestamp, signature } = message.data;

                // Record trade
                await client.query(`
                    INSERT INTO token_platform.trade_history (
                        mint_address, price, amount, side, signature, timestamp, token_type
                    ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6), 'raydium')
                    ON CONFLICT (signature) DO NOTHING
                `, [marketId, price, size, side, signature, timestamp]);

                // Update price history
                await client.query(`
                    INSERT INTO token_platform.price_history (
                        mint_address, price, timestamp, token_type
                    ) VALUES ($1, $2, to_timestamp($3), 'raydium')
                `, [marketId, price, timestamp]);

                // Update token stats
                await client.query(`
                    UPDATE token_platform.token_stats 
                    SET price = $2, 
                        volume_24h = volume_24h + $3,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE mint_address = $1
                `, [marketId, price, parseFloat(size) * parseFloat(price)]);

                // Emit event for real-time updates
                this.emit('trade', {
                    mintAddress: marketId,
                    price,
                    size,
                    side,
                    timestamp
                });
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error handling WebSocket message:', error);
        } finally {
            client.release();
        }
    }

    subscribeToToken(mintAddress: string) {
        if (this.subscribedTokens.has(mintAddress)) return;

        this.subscribedTokens.add(mintAddress);
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                method: "subscribe",
                markets: [mintAddress],
                channels: ["trade", "orderbook"]
            }));
        }
    }

    private subscribeToTokens() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                method: "subscribe",
                markets: Array.from(this.subscribedTokens),
                channels: ["trade", "orderbook"]
            }));
        }
    }

    private handleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
            this.initializeConnection();
        }, 5000);
    }

    private handleConnection(ws: WebSocket) {
        this.clients.add(ws);

        ws.on('close', () => {
            this.clients.delete(ws);
            this.subscriptions.forEach(subscribers => {
                subscribers.delete(ws);
            });
        });
    }

    private broadcast(message: any, subscribers?: Set<WebSocket>) {
        const targets = subscribers || this.clients;
        const messageStr = JSON.stringify(message);

        targets.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    getStatus() {
        return {
            connected: this.ws?.readyState === WebSocket.OPEN,
            subscribedTokens: Array.from(this.subscribedTokens),
            clientCount: this.clients.size
        };
    }

    initialize(wss: WebSocket.Server) {
        wss.on('connection', (ws: WebSocket) => {
            this.handleConnection(ws);

            ws.on('message', async (data: WebSocket.Data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'subscribe') {
                        this.subscribeToToken(message.mintAddress);
                    }
                } catch (error) {
                    logger.error('Error handling WebSocket message:', error);
                }
            });
        });
    }
}

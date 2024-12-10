import WebSocket, { Server as WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

interface RaydiumTokenInfo {
    lpToken?: string;
    name: string;
    symbol: string;
    decimals?: number;
}

export class WebSocketService extends EventEmitter {
    public on!: (event: string, listener: (...args: any[]) => void) => this;
    public emit!: (event: string, ...args: any[]) => boolean;

    private static instance: WebSocketService;
    private wss: WebSocketServer | null = null;
    private raydiumWs: WebSocket | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private subscribedTokens: Set<string> = new Set();
    private clients: Set<WebSocket> = new Set();
    private subscriptions: Map<string, Set<WebSocket>> = new Map();
    private reconnectAttempts: number = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly INITIAL_RECONNECT_DELAY = 5000;
    private pollingInterval: NodeJS.Timeout | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

    private constructor() {
        super();
    }

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    public async initialize(wss: WebSocketServer) {
        this.wss = wss;
        logger.info('WebSocketService initialized');
        this.setupServerHandlers();
        this.startPolling();
    }

    private setupServerHandlers() {
        if (!this.wss) {
            logger.error('WebSocket server is null during setup');
            return;
        }

        logger.info('Setting up WebSocket server handlers');

        this.wss.on('connection', (ws) => {
            logger.info('New WebSocket connection established');
            this.clients.add(ws);
            logger.info(`Total connected clients: ${this.clients.size}`);

            // Add message handler
            ws.on('message', (data) => {
                try {
                    logger.info('Raw WebSocket message received:', data.toString());
                    const message = JSON.parse(data.toString());
                    logger.info('Parsed WebSocket message:', JSON.stringify(message, null, 2));
                    this.handleMessage(message, ws);
                } catch (error) {
                    logger.error('Error parsing WebSocket message:', error);
                    logger.error('Raw message that failed:', data.toString());
                }
            });

            ws.on('close', () => {
                logger.info('WebSocket connection closed');
                this.clients.delete(ws);
                this.subscriptions.forEach((subscribers, mintAddress) => {
                    subscribers.delete(ws);
                    if (subscribers.size === 0) {
                        this.subscribedTokens.delete(mintAddress);
                        this.subscriptions.delete(mintAddress);
                    }
                });
            });
        });
    }

    private async startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        this.pollingInterval = setInterval(async () => {
            try {
                // Fetch prices from Raydium
                const priceResponse = await fetch('https://api.raydium.io/v2/main/price');
                if (!priceResponse.ok) throw new Error(`HTTP error! status: ${priceResponse.status}`);
                const priceData = await priceResponse.json();
                logger.info(`Fetched price data for ${Object.keys(priceData).length} tokens. Sample:`,
                    JSON.stringify(Object.entries(priceData).slice(0, 2))
                );

                // Fetch token metadata
                const metadataResponse = await fetch('https://api.raydium.io/v2/sdk/token/raydium.mainnet.json');
                if (!metadataResponse.ok) throw new Error(`HTTP error! status: ${metadataResponse.status}`);
                const rawMetadata = await metadataResponse.json();

                const tokenList = rawMetadata.official;
                if (!Array.isArray(tokenList)) {
                    throw new Error('Invalid token metadata format');
                }
                logger.info(`Processing ${tokenList.length} tokens from metadata`);

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    let insertedCount = 0;
                    let skippedCount = 0;
                    let existingCount = 0;

                    // Process each token in the array
                    for (const token of tokenList) {
                        if (!token.mint || !token.name || !token.symbol) {
                            skippedCount++;
                            logger.warn('Skipping invalid token:', {
                                mint: token.mint,
                                name: token.name,
                                symbol: token.symbol,
                                reason: 'Missing required fields'
                            });
                            continue;
                        }

                        const tokenExists = await client.query(`
                            SELECT EXISTS (
                                SELECT 1 FROM token_platform.raydium_tokens 
                                WHERE mint_address = $1
                            )
                        `, [token.mint]);

                        if (!tokenExists.rows[0].exists) {
                            await client.query(`
                                INSERT INTO token_platform.raydium_tokens 
                                (mint_address, pool_address, name, symbol, decimals)
                                VALUES ($1, $2, $3, $4, $5)
                            `, [
                                token.mint,
                                '', // pool_address is not provided in the metadata
                                token.name,
                                token.symbol,
                                token.decimals || 9
                            ]);
                            insertedCount++;
                            logger.info(`Inserted new token: ${token.symbol} (${token.mint})`);
                        } else {
                            existingCount++;
                        }
                    }

                    // Log processing summary
                    logger.info('Token processing summary:', {
                        total: tokenList.length,
                        inserted: insertedCount,
                        skipped: skippedCount,
                        existing: existingCount
                    });

                    // Process prices
                    let priceUpdateCount = 0;
                    for (const [mintAddress, price] of Object.entries(priceData)) {
                        if (typeof price === 'number' && !isNaN(price)) {
                            await client.query(`
                                INSERT INTO token_platform.token_stats 
                                (mint_address, price, last_updated)
                                VALUES ($1, $2, CURRENT_TIMESTAMP)
                                ON CONFLICT (mint_address) 
                                DO UPDATE SET 
                                    price = $2,
                                    last_updated = CURRENT_TIMESTAMP
                            `, [mintAddress, price]);
                            priceUpdateCount++;
                        }
                    }
                    logger.info(`Updated prices for ${priceUpdateCount} tokens`);

                    await client.query('COMMIT');
                } catch (error) {
                    await client.query('ROLLBACK');
                    logger.error('Database error in price polling:', error);
                } finally {
                    client.release();
                }
            } catch (error) {
                logger.error('Error in price polling:', error);
            }
        }, 10000);
    }

    public subscribeToToken(mintAddress: string, ws: WebSocket) {
        if (!this.subscriptions.has(mintAddress)) {
            this.subscriptions.set(mintAddress, new Set());
        }
        this.subscriptions.get(mintAddress)?.add(ws);
        this.subscribedTokens.add(mintAddress);
        logger.info(`Subscribed to token: ${mintAddress}`);

        // Fetch initial price immediately
        this.fetchPrice(mintAddress);
    }

    private async fetchPrice(mintAddress: string) {
        try {
            const response = await fetch('https://api.raydium.io/v2/main/price');
            const data = await response.json();
            if (data[mintAddress]) {
                this.handlePriceUpdate(mintAddress, data[mintAddress].current_price);
            }
        } catch (error) {
            logger.error('Error fetching price:', error);
        }
    }

    private handlePriceUpdate(mintAddress: string, price: number) {
        const message = {
            type: 'price',
            mintAddress,
            data: { price }
        };

        const subscribers = this.subscriptions.get(mintAddress);
        if (subscribers) {
            subscribers.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        }
    }

    private cleanup() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.raydiumWs) this.raydiumWs.close();
    }

    public async handleMessage(message: any, ws: WebSocket) {
        try {
            logger.info('Processing message:', JSON.stringify(message, null, 2));
            if (message.type === 'subscribe' && message.mintAddress) {
                logger.info(`Subscription request for mintAddress: ${message.mintAddress}`);
                this.subscribeToToken(message.mintAddress, ws);
            }
        } catch (error) {
            logger.error('Error handling message:', error);
        }
    }

    public getStatus(): { isConnected: boolean; connectedClients: number } {
        return {
            isConnected: this.wss !== null,
            connectedClients: this.clients.size
        };
    }
}

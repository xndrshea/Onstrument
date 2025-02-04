import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import express from 'express';
import { getPool } from '../../config/database';

interface WebSocketClient extends WebSocket {
    id: string;
    isAlive: boolean;
    subscriptions: Set<string>;
    username?: string;
}

export class WebSocketManager extends EventEmitter {
    private static instance: WebSocketManager;
    private wss: WebSocket.Server | null = null;
    private clients: Map<string, WebSocketClient> = new Map();
    private readonly HEARTBEAT_INTERVAL = 30000;
    private messageRateLimit = new Map<string, number>();
    private readonly MESSAGE_HISTORY_LIMIT = 100; // Messages to keep per query
    private readonly MESSAGE_RETENTION_DAYS = 7;  // Days to keep messages
    private readonly CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // Weekly cleanup

    private constructor() {
        super();
        setInterval(() => this.checkConnections(), this.HEARTBEAT_INTERVAL);
        // Run cleanup weekly instead of daily
        setInterval(() => this.cleanupOldMessages(), this.CLEANUP_INTERVAL);
    }

    static getInstance(): WebSocketManager {
        if (!WebSocketManager.instance) {
            WebSocketManager.instance = new WebSocketManager();
        }
        return WebSocketManager.instance;
    }

    initialize(wss: WebSocket.Server) {
        this.wss = wss;
        this.setupWebSocketServer();


        this.wss.on('error', (error) => {
            logger.error('WebSocket server error:', error);
        });

    }

    private setupWebSocketServer() {
        if (!this.wss) return;

        this.wss.on('connection', (ws: WebSocket) => {
            const client = this.setupNewClient(ws as WebSocketClient);
            this.setupClientHandlers(client);
        });
    }

    private setupNewClient(ws: WebSocketClient): WebSocketClient {
        const id = Math.random().toString(36).substring(2, 15);
        ws.id = id;
        ws.isAlive = true;
        ws.subscriptions = new Set();
        this.clients.set(id, ws);

        return ws;
    }

    private setupClientHandlers(client: WebSocketClient) {
        client.on('pong', () => {
            client.isAlive = true;
        });

        client.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleClientMessage(client, message);
            } catch (error) {
                logger.error(`Error handling message from ${client.id}:`, error);
            }
        });

        client.on('close', () => {
            this.removeClient(client.id);
        });

        client.on('error', (error) => {
            logger.error(`Client ${client.id} error:`, error);
            this.removeClient(client.id);
        });
    }

    private async handleClientMessage(client: WebSocketClient, message: any) {
        // Rate limit: 1 message per second per user
        const now = Date.now();
        const lastMessage = this.messageRateLimit.get(message.userId) || 0;
        if (now - lastMessage < 1000) {
            return; // Silently drop messages that exceed rate limit
        }
        this.messageRateLimit.set(message.userId, now);

        switch (message.type) {
            case 'subscribe':
                if (message.mintAddress) {
                    client.subscriptions.add(message.mintAddress);
                }
                break;
            case 'unsubscribe':
                if (message.mintAddress) {
                    client.subscriptions.delete(message.mintAddress);
                }
                break;
            case 'chat':
                try {
                    // Ensure user_id exists
                    if (!message.userId) {
                        logger.error('Missing userId in chat message');
                        return;
                    }

                    await getPool().query(
                        'INSERT INTO onstrument.chat_messages (user_id, message) VALUES ($1, $2)',
                        [message.userId, message.message]
                    );

                    const displayName = `user_${message.userId.slice(0, 4)}`;

                    this.broadcastChat({
                        type: 'chat',
                        username: displayName,
                        message: message.message,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    logger.error('Error storing chat message:', error);
                }
                break;
        }
    }

    private checkConnections() {
        this.clients.forEach((client, id) => {
            if (!client.isAlive) {
                logger.info(`Client ${id} is inactive, removing`);
                return this.removeClient(id);
            }
            client.isAlive = false;
            client.ping();
        });
    }

    private removeClient(id: string) {
        const client = this.clients.get(id);
        if (client) {
            client.terminate();
            this.clients.delete(id);
            logger.info(`Removed client ${id}`);
        }
    }

    broadcastPrice(mintAddress: string, price: number, volume?: number, isSell?: boolean) {
        const message = {
            type: 'price',
            mintAddress,
            price,
            open: price,
            high: price,
            low: price,
            close: price,
            timestamp: Date.now(),
            time: Date.now(),
            volume: volume,
            isSell: isSell
        };

        if (this.wss) {
            this.wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        }
    }

    broadcastMigration(mintAddress: string) {
        const network = process.env.NODE_ENV === 'production' ? 'mainnet' : 'devnet';

        this.clients.forEach(client => {
            if (client.subscriptions.has(mintAddress)) {
                try {
                    client.send(JSON.stringify({
                        type: 'migration',
                        mintAddress,
                        timestamp: Date.now(),
                        network
                    }));
                } catch (error) {
                    logger.error(`Error broadcasting migration to ${client.id}:`, error);
                    this.removeClient(client.id);
                }
            }
        });
    }

    getStats() {
        return {
            totalConnections: this.clients.size,
            clients: Array.from(this.clients.values()).map(client => ({
                id: client.id,
                subscriptions: Array.from(client.subscriptions),
                isAlive: client.isAlive
            }))
        };
    }

    handleUpgrade(req: express.Request, res: express.Response) {
        if (!this.wss) {
            res.status(500).send('WebSocket server not initialized');
            return;
        }

        const head = req.headers;
        const socket = res.socket;

        if (!socket) {
            res.status(400).send('WebSocket upgrade failed');
            return;
        }

        this.wss.handleUpgrade(req, socket, Buffer.from(''), (ws) => {
            this.wss!.emit('connection', ws, req);
        });
    }

    public broadcastChat(chatMessage: any) {
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(chatMessage));
            }
        });
    }

    public async getChatHistory() {
        try {
            const result = await getPool().query(
                `SELECT message, created_at, user_id 
                 FROM onstrument.chat_messages 
                 ORDER BY created_at ASC  -- Oldest first, newest last
                 LIMIT 1000`
            );

            return result.rows.map(row => ({
                type: 'chat',
                username: `user_${row.user_id.slice(0, 4)}`,
                message: row.message,
                timestamp: row.created_at.getTime()
            }));
        } catch (error) {
            logger.error('Error fetching chat history:', error);
            return [];
        }
    }

    // Add a cleanup method
    private async cleanupOldMessages() {
        try {
            const result = await getPool().query(
                `DELETE FROM onstrument.chat_messages 
                 WHERE created_at < NOW() - INTERVAL '${this.MESSAGE_RETENTION_DAYS} days'
                 RETURNING COUNT(*) as deleted_count`
            );
            logger.info(`Cleaned up ${result.rows[0].deleted_count} old chat messages`);
        } catch (error) {
            logger.error('Error cleaning up old messages:', error);
        }
    }
}

export const wsManager = WebSocketManager.getInstance(); 
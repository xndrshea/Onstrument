import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

interface WebSocketClient extends WebSocket {
    id: string;
    isAlive: boolean;
    subscriptions: Set<string>;
}

export class WebSocketManager extends EventEmitter {
    private static instance: WebSocketManager;
    private wss: WebSocket.Server | null = null;
    private clients: Map<string, WebSocketClient> = new Map();
    private readonly HEARTBEAT_INTERVAL = 30000;

    private constructor() {
        super();
        setInterval(() => this.checkConnections(), this.HEARTBEAT_INTERVAL);
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
        logger.info('WebSocket Manager initialized');
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

        logger.info(`New WebSocket client connected: ${id}`);
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

    private handleClientMessage(client: WebSocketClient, message: any) {
        switch (message.type) {
            case 'subscribe':
                if (message.mintAddress) {
                    client.subscriptions.add(message.mintAddress);
                    logger.info(`Client ${client.id} subscribed to ${message.mintAddress}`);
                }
                break;
            case 'unsubscribe':
                if (message.mintAddress) {
                    client.subscriptions.delete(message.mintAddress);
                    logger.info(`Client ${client.id} unsubscribed from ${message.mintAddress}`);
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

    broadcastPrice(mintAddress: string, price: number) {
        this.clients.forEach(client => {
            if (client.subscriptions.has(mintAddress)) {
                try {
                    client.send(JSON.stringify({
                        type: 'price',
                        mintAddress,
                        price,
                        timestamp: Date.now()
                    }));
                } catch (error) {
                    logger.error(`Error broadcasting to ${client.id}:`, error);
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
}

export const wsManager = WebSocketManager.getInstance(); 
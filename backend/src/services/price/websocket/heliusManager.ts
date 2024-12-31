import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { RaydiumProcessor } from '../processors/raydiumProcessor';
import { BondingCurveProcessor } from '../processors/bondingCurveProcessor';

export class HeliusManager extends EventEmitter {
    private static instance: HeliusManager;
    private messageCount: number = 0;
    private readonly MAX_MESSAGES = 1000;
    private wsClient: WebSocket | null = null;
    private wss!: WebSocket.Server;
    private raydiumProcessor: RaydiumProcessor;
    private bondingCurveProcessor: BondingCurveProcessor;
    private lastHeartbeat: number = Date.now();
    private lastReconnectAttempt: number = 0;
    private readonly RECONNECT_INTERVAL = 5000; // 5 seconds

    private constructor() {
        super();
        this.raydiumProcessor = new RaydiumProcessor();
        this.bondingCurveProcessor = new BondingCurveProcessor();
    }

    static getInstance(): HeliusManager {
        if (!this.instance) {
            this.instance = new HeliusManager();
        }
        return this.instance;
    }

    async initialize(wss: WebSocket.Server): Promise<void> {
        this.wss = wss;
        this.setupWebSocketServer(wss);
        await this.connect();
    }

    private setupWebSocketServer(wss: WebSocket.Server): void {
        // Forward price updates from processors to connected clients
        this.raydiumProcessor.on('priceUpdate', (update) => {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'price', data: update }));
                }
            });
        });

        this.bondingCurveProcessor.on('priceUpdate', (update) => {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'price', data: update }));
                }
            });
        });
    }

    private async connect(): Promise<void> {
        this.wsClient = new WebSocket(config.HELIUS_WEBSOCKET_URL);

        this.wsClient.on('open', () => {
            logger.info('Connected to Helius WebSocket');
            this.subscribeToPrograms();
        });

        this.wsClient.on('message', (data) => this.handleMessage(data));

        // Standard WebSocket error handling
        this.wsClient.on('close', () => {
            logger.warn('Helius WebSocket connection closed');
            this.reconnect();
        });

        this.wsClient.on('error', (error) => {
            logger.error('Helius WebSocket error:', error);
            this.wsClient?.close();
        });
    }

    private subscribeToPrograms(): void {
        const programs = [
            //...Object.values(config.RAYDIUM_PROGRAMS),
            config.BONDING_CURVE_PROGRAM_ID
        ];

        programs.forEach((programId, index) => {
            const subscribeMessage = {
                jsonrpc: "2.0",
                id: index + 1,
                method: "programSubscribe",
                params: [programId, { encoding: "base64" }]
            };
            this.wsClient?.send(JSON.stringify(subscribeMessage));
            logger.info(`Subscribed to program: ${programId}`);
        });
    }

    private async handleMessage(data: any) {
        this.messageCount++;
        try {
            const messageObj = JSON.parse(data.toString());
            if (messageObj.method === "programNotification") {
                const programId = messageObj.params.result.value.account.owner;
                const buffer = Buffer.from(messageObj.params.result.value.account.data[0], 'base64');
                const accountKey = messageObj.params.result.value.pubkey;

                if (Object.values(config.RAYDIUM_PROGRAMS).includes(programId)) {
                    await this.raydiumProcessor.processEvent(buffer, accountKey, programId);
                } else if (programId === config.BONDING_CURVE_PROGRAM_ID) {
                    await this.bondingCurveProcessor.processEvent(buffer, accountKey, programId);
                }
            }
        } catch (error) {
            logger.error('Error handling Helius message:', error);
        }
    }

    private async reconnect() {
        const now = Date.now();
        if (now - this.lastReconnectAttempt < this.RECONNECT_INTERVAL) {
            return; // Prevent rapid reconnection attempts
        }

        this.lastReconnectAttempt = now;
        try {
            if (this.wsClient?.readyState === WebSocket.OPEN) {
                this.wsClient.close();
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for close
            await this.connect(); // Use connect instead of initialize
            logger.info('Successfully reconnected to Helius WebSocket');
        } catch (error) {
            logger.error('Failed to reconnect:', error);
            setTimeout(() => this.reconnect(), this.RECONNECT_INTERVAL);
        }
    }

    public async subscribeToAccount(accountAddress: string): Promise<void> {
        try {
            await this.wsClient?.send(JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'accountSubscribe',
                params: [
                    accountAddress,
                    { encoding: 'base64', commitment: 'confirmed' }
                ]
            }));
            logger.info(`Subscribed to account: ${accountAddress}`);
        } catch (error) {
            logger.error(`Failed to subscribe to account ${accountAddress}:`, error);
            throw error;
        }
    }

    public getStatus() {
        return {
            connected: this.wsClient?.readyState === WebSocket.OPEN,
            messageCount: this.messageCount,
            maxMessages: this.MAX_MESSAGES
        };
    }
}

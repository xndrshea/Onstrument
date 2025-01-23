import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { RaydiumProcessor } from '../processors/raydiumProcessor';
import { BondingCurveProcessor } from '../processors/bondingCurveProcessor';
import { wsManager } from '../../websocket/WebSocketManager';

export class HeliusManager extends EventEmitter {
    private static instance: HeliusManager;
    private messageCount: number = 0;
    private readonly MAX_MESSAGES = 1000;
    private wsClientMainnet: WebSocket | null = null;
    private wsClientDevnet: WebSocket | null = null;
    private wss!: WebSocket.Server;
    // private raydiumProcessor: RaydiumProcessor;
    private bondingCurveProcessor: BondingCurveProcessor;
    private lastHeartbeat: number = Date.now();
    private lastReconnectAttempt: number = 0;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 10;
    private readonly BASE_RECONNECT_DELAY = 1000;
    private readonly MAX_RECONNECT_DELAY = 30000; // Cap at 30 seconds
    private isReconnecting = false;

    private constructor() {
        super();
        // this.raydiumProcessor = new RaydiumProcessor();
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
        // this.raydiumProcessor.on('priceUpdate', (update) => {
        //     wss.clients.forEach(client => {
        //         if (client.readyState === WebSocket.OPEN) {
        //             client.send(JSON.stringify({ type: 'price', data: update }));
        //         }
        //     });
        // });

        this.bondingCurveProcessor.on('priceUpdate', (update) => {
            // Replace direct WebSocket broadcasting with WebSocketManager
            wsManager.broadcastPrice(update.mintAddress, update.price);
        });
    }

    private async connect(): Promise<void> {
        const isProd = process.env.NODE_ENV === 'production';

        // Production uses mainnet, development uses devnet
        const wsClient = isProd
            ? new WebSocket(config.HELIUS_MAINNET_WEBSOCKET_URL)
            : new WebSocket(config.HELIUS_DEVNET_WEBSOCKET_URL);

        this.setupWebSocketHandlers(wsClient, isProd ? 'mainnet' : 'devnet');
        await this.subscribeToPrograms(wsClient, [config.BONDING_CURVE_PROGRAM_ID]);
    }

    private setupWebSocketHandlers(wsClient: WebSocket | null, network: string): void {
        if (!wsClient) return;

        wsClient.on('open', () => {
        });

        wsClient.on('message', (data) => {
            this.handleMessage(data, network);
        });

        // Standard WebSocket error handling
        wsClient.on('close', () => {
            logger.warn(`Helius WebSocket connection closed on ${network}`);
            this.reconnect();
        });

        wsClient.on('error', (error) => {
            logger.error(`Helius WebSocket error on ${network}:`, error);
            if (network === 'mainnet') {
                this.wsClientMainnet?.close();
            } else {
                this.wsClientDevnet?.close();
            }
        });
    }

    private async subscribeToPrograms(wsClient: WebSocket | null, programs: string | Record<string, string> | string[]): Promise<void> {
        if (!wsClient) return;

        return new Promise((resolve, reject) => {
            try {
                const programIds = Array.isArray(programs)
                    ? programs
                    : typeof programs === 'string'
                        ? [programs]
                        : Object.values(programs);

                programIds.forEach(programId => {
                    if (wsClient.readyState === WebSocket.OPEN) {
                        wsClient.send(JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'accountSubscribe',
                            params: [
                                programId,
                                { encoding: 'jsonParsed', commitment: 'confirmed' }
                            ],
                            id: `${programId}-subscription`
                        }));
                    }
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    private handleMessage(data: any, network: string): void {
        try {
            const message = JSON.parse(data.toString());
            logger.info(`Parsed WebSocket message on ${network}:`, message);

            if (message.result?.data) {
                const accountKeys = message.result.data.accountData.map((d: any) => d.account);
                const programId = message.result.data.programId;
                logger.info('Program event received:', { programId, accountKeys });

                // Comment out Raydium processing
                // if (Object.values(config.RAYDIUM_PROGRAMS).includes(programId)) {
                //     this.raydiumProcessor.processEvent(Buffer.from(message.result.data.accountData[0], 'base64'), accountKeys[0], programId);
                // } else 
                if (programId === config.BONDING_CURVE_PROGRAM_ID) {
                    this.bondingCurveProcessor.processEvent(Buffer.from(message.result.data.accountData[0], 'base64'), accountKeys[0], programId);
                }
            }
        } catch (error) {
            logger.error(`Error handling WebSocket message on ${network}:`, error);
        }
    }

    private async reconnect(): Promise<void> {
        // Prevent multiple simultaneous reconnection attempts
        if (this.isReconnecting) {
            return;
        }

        this.isReconnecting = true;

        try {
            if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                logger.error('Max reconnection attempts reached, waiting for longer cooldown');
                await new Promise(resolve => setTimeout(resolve, this.MAX_RECONNECT_DELAY));
                this.reconnectAttempts = 0; // Reset after cooldown
            }

            // Calculate delay with a maximum cap
            const delay = Math.min(
                this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
                this.MAX_RECONNECT_DELAY
            );
            this.reconnectAttempts++;

            logger.info(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delay));

            await this.connect();
            this.reconnectAttempts = 0;
            logger.info('Successfully reconnected to Helius WebSocket');
        } catch (error) {
            logger.error('Failed to reconnect:', error);
            this.reconnect(); // Continue trying
        } finally {
            this.isReconnecting = false;
        }
    }

    public async subscribeToAccount(accountAddress: string, network: 'mainnet' | 'devnet' = 'devnet'): Promise<void> {
        const wsClient = network === 'mainnet' ? this.wsClientMainnet : this.wsClientDevnet;
        try {
            await wsClient?.send(JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'accountSubscribe',
                params: [
                    accountAddress,
                    { encoding: 'base64', commitment: 'confirmed' }
                ]
            }));
        } catch (error) {
            logger.error(`Failed to subscribe to account ${accountAddress}:`, error);
            throw error;
        }
    }

    public getStatus() {
        return {
            mainnetConnected: this.wsClientMainnet?.readyState === WebSocket.OPEN,
            devnetConnected: this.wsClientDevnet?.readyState === WebSocket.OPEN,
            messageCount: this.messageCount,
            maxMessages: this.MAX_MESSAGES
        };
    }
}

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { BondingCurveProcessor } from '../processors/bondingCurveProcessor';
import { wsManager } from '../../websocket/WebSocketManager';
import { RaydiumStateProcessor } from '../processors/RaydiumStateProcessor';
import { RaydiumCpProcessor } from '../processors/raydiumLogProcessor';

export class HeliusManager extends EventEmitter {
    private static instance: HeliusManager;
    private messageCount: number = 0;
    private readonly MAX_MESSAGES = 1000;
    private wsClientMainnet: WebSocket | null = null;
    private wsClientDevnet: WebSocket | null = null;
    private wsClientRaydium: WebSocket | null = null;  // Dedicated mainnet connection for Raydium
    private wss!: WebSocket.Server;
    private bondingCurveProcessor: BondingCurveProcessor;
    private lastHeartbeat: number = Date.now();
    private lastReconnectAttempt: number = 0;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 10;
    private readonly BASE_RECONNECT_DELAY = 1000;
    private readonly MAX_RECONNECT_DELAY = 30000;
    private isReconnecting = false;
    private raydiumProcessor: RaydiumStateProcessor;
    private raydiumCpProcessor: RaydiumCpProcessor;

    private readonly RAYDIUM_CP_PROGRAM_ID = config.RAYDIUM_PROGRAMS.CP_AMM;

    private constructor() {
        super();
        this.bondingCurveProcessor = new BondingCurveProcessor();
        this.raydiumProcessor = new RaydiumStateProcessor();
        this.raydiumCpProcessor = RaydiumCpProcessor.getInstance();
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
        await this.connectRaydium();  // Separate connection for Raydium
    }

    private setupWebSocketServer(wss: WebSocket.Server): void {
        this.bondingCurveProcessor.on('priceUpdate', (update) => {
            wsManager.broadcastPrice(update.mintAddress, update.price);
        });
    }

    private async connectRaydium(): Promise<void> {
        this.wsClientRaydium = new WebSocket(config.HELIUS_MAINNET_WEBSOCKET_URL);

        this.wsClientRaydium.on('open', () => {
            logger.info('Connected to Helius WebSocket for Raydium CP AMM monitoring');
            this.setupRaydiumSubscriptions();
        });

        this.wsClientRaydium.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                logger.debug('Received Raydium message');

                // Just forward everything to the processor
                this.raydiumProcessor.processEvent(
                    data.toString(),
                    '',  // We'll let the processor handle parsing the account key
                    this.RAYDIUM_CP_PROGRAM_ID
                );
            } catch (error) {
                logger.error('Error handling Raydium WebSocket message:', error);
            }
        });

        this.wsClientRaydium.on('close', () => {
            logger.warn('Raydium WebSocket connection closed');
            setTimeout(() => this.connectRaydium(), this.BASE_RECONNECT_DELAY);
        });

        this.wsClientRaydium.on('error', (error) => {
            logger.error('Raydium WebSocket error:', error);
            this.wsClientRaydium?.close();
        });
    }

    private setupRaydiumSubscriptions() {
        logger.info('Setting up Raydium subscriptions...');

        if (!this.wsClientRaydium) {
            logger.error('Raydium WebSocket client not initialized');
            return;
        }

        // Subscribe to all accounts owned by the Raydium CP program
        const accountSub = {
            jsonrpc: '2.0',
            id: 'accounts-' + Date.now(),
            method: 'programSubscribe',
            params: [
                this.RAYDIUM_CP_PROGRAM_ID,
                {
                    encoding: 'base64',
                    commitment: 'confirmed'
                }
            ]
        };

        logger.info('Sending account subscription:', accountSub);
        this.wsClientRaydium.send(JSON.stringify(accountSub));

        // Keep the heartbeat check
        setInterval(() => {
            if (this.wsClientRaydium?.readyState === WebSocket.OPEN) {
                this.wsClientRaydium.ping();
            }
        }, 30000);
    }

    private async connect(): Promise<void> {
        const isProd = process.env.NODE_ENV === 'production';

        // Production uses mainnet, development uses devnet (for bonding curves)
        const wsClient = isProd
            ? new WebSocket(config.HELIUS_MAINNET_WEBSOCKET_URL)
            : new WebSocket(config.HELIUS_DEVNET_WEBSOCKET_URL);

        this.setupWebSocketHandlers(wsClient, isProd ? 'mainnet' : 'devnet');

        // Subscribe only to Bonding Curve program
        await this.subscribeToPrograms(wsClient, [
            config.BONDING_CURVE_PROGRAM_ID
        ]);
    }

    private setupWebSocketHandlers(wsClient: WebSocket | null, network: string): void {
        if (!wsClient) return;

        wsClient.on('open', () => {
            logger.info(`Connected to Helius WebSocket on ${network}`);
        });

        wsClient.on('message', (data) => {
            this.handleMessage(data, network);
        });

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

    private handleMessage(data: any, network: string): void {
        try {
            const message = data.toString();
            const parsedMessage = JSON.parse(message);

            // Handle account state updates only
            if (parsedMessage.params?.result?.value?.data) {
                const buffer = Buffer.from(parsedMessage.params.result.value.data[0], 'base64');
                const accountKey = parsedMessage.params.result.value.pubkey;

                // Process bonding curve messages for mainnet/devnet connection
                if (network === 'mainnet' || network === 'devnet') {
                    this.bondingCurveProcessor.processEvent(buffer, accountKey, config.BONDING_CURVE_PROGRAM_ID);  // Fixed program ID
                }
            }

        } catch (error) {
            logger.error('Error in handleMessage:', error);
        }
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


    public async subscribeToLogs(programId: string, callback: (logs: any) => Promise<void>): Promise<void> {
        const wsClient = this.wsClientMainnet || this.wsClientDevnet;
        if (!wsClient) return;

        const subscribeMessage = {
            jsonrpc: '2.0',
            id: 'logs-' + Date.now(),
            method: 'logsSubscribe',
            params: [
                {
                    mentions: [programId]
                },
                {
                    commitment: 'confirmed'
                }
            ]
        };

        wsClient.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.params?.result?.value?.logs) {
                    await callback({
                        signature: message.params.result.value.signature,
                        logs: message.params.result.value.logs
                    });
                }
            } catch (error) {
                logger.error(`Error handling log subscription message:`, error);
            }
        });

        if (wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify(subscribeMessage));
            logger.info(`Subscribed to logs for program: ${programId}`);
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
            raydiumConnected: this.wsClientRaydium?.readyState === WebSocket.OPEN,
            messageCount: this.messageCount,
            maxMessages: this.MAX_MESSAGES
        };
    }

    public cleanup() {
        this.wsClientMainnet?.close();
        this.wsClientDevnet?.close();
        this.wsClientRaydium?.close();
    }
}

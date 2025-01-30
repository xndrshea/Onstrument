import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { BondingCurveProcessor } from '../processors/bondingCurveProcessor';
import { wsManager } from '../../websocket/WebSocketManager';
import { RaydiumStateProcessor } from '../processors/raydiumStateProcessor';
import { RaydiumLogProcessor } from '../processors/raydiumLogProcessor';

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
    private raydiumLogProcessor: RaydiumLogProcessor;

    private readonly RAYDIUM_CP_PROGRAM_ID = config.RAYDIUM_PROGRAMS.CP_AMM;
    private readonly RAYDIUM_V4_PROGRAM_ID = config.RAYDIUM_PROGRAMS.V4_AMM;

    private constructor() {
        super();
        this.bondingCurveProcessor = new BondingCurveProcessor();
        this.raydiumProcessor = new RaydiumStateProcessor();
        this.raydiumLogProcessor = RaydiumLogProcessor.getInstance();
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

        // Subscribe to Raydium CP AMM logs
        await this.subscribeToLogs(this.RAYDIUM_CP_PROGRAM_ID, async (logData) => {
            await this.raydiumLogProcessor.processLogs(logData.signature, logData.logs);
        });
    }

    private setupWebSocketServer(wss: WebSocket.Server): void {
        this.bondingCurveProcessor.on('priceUpdate', (update) => {
            wsManager.broadcastPrice(update.mintAddress, update.price);
        });
    }

    private async connectRaydium(): Promise<void> {
        this.wsClientRaydium = new WebSocket(config.HELIUS_MAINNET_WEBSOCKET_URL);

        this.wsClientRaydium.on('open', () => {
            this.subscribeToPrograms(this.wsClientRaydium, [
                this.RAYDIUM_CP_PROGRAM_ID,
                this.RAYDIUM_V4_PROGRAM_ID
            ]);
        });

        this.wsClientRaydium.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Handle program notifications
                if (message.method === 'programNotification' &&
                    message.params?.result?.value?.account?.data) {
                    const accountData = message.params.result.value.account.data;
                    const buffer = Buffer.from(accountData[0], 'base64');
                    const accountKey = message.params.result.value.pubkey;
                    const programId = message.params.result.value.account.owner;

                    // Process based on program ID
                    if (programId === this.RAYDIUM_CP_PROGRAM_ID) {
                        await this.raydiumProcessor.processEvent(
                            buffer,
                            accountKey,
                            this.RAYDIUM_CP_PROGRAM_ID
                        );
                    } else if (programId === this.RAYDIUM_V4_PROGRAM_ID) {
                        await this.raydiumProcessor.processEvent(
                            buffer,
                            accountKey,
                            this.RAYDIUM_V4_PROGRAM_ID
                        );
                    }
                }

                // Handle log notifications
                if (message.params?.result?.value?.logs) {
                    await this.raydiumLogProcessor.processLogs(
                        message.params.result.value.signature,
                        message.params.result.value.logs
                    );
                }
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

    private async subscribeToPrograms(wsClient: WebSocket | null, programs: string[]): Promise<void> {
        if (!wsClient) return;

        programs.forEach(programId => {
            if (wsClient.readyState === WebSocket.OPEN) {
                wsClient.send(JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'programSubscribe',
                    params: [
                        programId,
                        {
                            encoding: 'base64',
                            commitment: 'confirmed',
                            filters: [] // Add any specific filters if needed
                        }
                    ],
                    id: `${programId}-subscription`
                }));
                logger.info(`Subscribed to program: ${programId}`);
            }
        });
    }

    public async subscribeToLogs(programId: string, callback: (logs: any) => Promise<void>): Promise<void> {
        const wsClient = this.wsClientRaydium;
        if (!wsClient) {
            logger.error('Cannot subscribe to logs: WebSocket client is null');
            return;
        }

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

        if (wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify(subscribeMessage));
            logger.info(`Subscribed to logs for program: ${programId}`);
        } else {
            logger.error('Cannot subscribe to logs: WebSocket not open', {
                readyState: wsClient.readyState
            });
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

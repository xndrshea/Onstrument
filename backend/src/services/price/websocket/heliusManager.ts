import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { RaydiumProcessor } from '../processors/raydiumProcessor';
import { BondingCurveProcessor } from '../processors/bondingCurveProcessor';

export class HeliusManager extends EventEmitter {
    private static instance: HeliusManager;
    private ws: WebSocket | null = null;
    private raydiumProcessor: RaydiumProcessor;
    private bondingCurveProcessor: BondingCurveProcessor;
    private messageCount: number = 0;
    private readonly RATE_LIMIT = 30; // total messages
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private lastHeartbeat: number = Date.now();

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
        this.ws = new WebSocket(config.HELIUS_WEBSOCKET_URL);

        this.ws.on('open', () => {
            logger.info('Connected to Helius WebSocket');
            this.subscribeToPrograms();
        });

        this.ws.on('message', (data) => this.handleMessage(data));

        // Standard WebSocket error handling
        this.ws.on('close', () => {
            logger.warn('Helius WebSocket connection closed');
            this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (error) => {
            logger.error('Helius WebSocket error:', error);
            this.ws?.close();
        });
    }

    private subscribeToPrograms(): void {
        const programs = [
            ...Object.values(config.RAYDIUM_PROGRAMS),
            config.BONDING_CURVE_PROGRAM_ID
        ];

        programs.forEach((programId, index) => {
            const subscribeMessage = {
                jsonrpc: "2.0",
                id: index + 1,
                method: "programSubscribe",
                params: [programId, { encoding: "base64" }]
            };
            this.ws?.send(JSON.stringify(subscribeMessage));
            logger.info(`Subscribed to program: ${programId}`);
        });
    }

    private async handleMessage(data: WebSocket.Data): Promise<void> {
        try {
            // Check rate limit before processing any message
            if (this.messageCount >= this.RATE_LIMIT) {
                logger.info(`Maximum message limit (${this.RATE_LIMIT}) reached. Closing connection.`);
                this.ws?.close();
                return;
            }

            const messageObj = JSON.parse(data.toString());
            logger.debug('Received message:', {
                method: messageObj.method,
                programId: messageObj.params?.result?.value?.account?.owner,
                type: messageObj.params?.type
            });

            if (messageObj.method === "programNotification") {
                const programId = messageObj.params.result.value.account.owner;
                const buffer = Buffer.from(messageObj.params.result.value.account.data[0], 'base64');
                const accountKey = messageObj.params.result.value.pubkey;

                // Check if it's any of the Raydium programs
                if (Object.values(config.RAYDIUM_PROGRAMS).includes(programId)) {
                    this.messageCount++;
                    logger.info(`Processing Raydium message ${this.messageCount}/${this.RATE_LIMIT} from program ${programId}`, {
                        programId,
                        programType: Object.entries(config.RAYDIUM_PROGRAMS).find(([_, id]) => id === programId)?.[0],
                        bufferLength: buffer.length
                    });
                    await this.raydiumProcessor.processEvent(buffer, accountKey, programId);
                } else if (programId === config.BONDING_CURVE_PROGRAM_ID) {
                    this.messageCount++;
                    logger.info(`Processing Bonding Curve message ${this.messageCount}/${this.RATE_LIMIT}`);
                    await this.bondingCurveProcessor.processEvent(buffer, accountKey, programId);
                }
            }
        } catch (error) {
            logger.error('Error processing Helius message:', error);
        }
    }

    public async subscribeToAccount(accountAddress: string): Promise<void> {
        try {
            await this.ws?.send(JSON.stringify({
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

    public getStatus(): { isConnected: boolean; lastHeartbeat: number } {
        return {
            isConnected: this.ws?.readyState === WebSocket.OPEN,
            lastHeartbeat: this.lastHeartbeat
        };
    }
}

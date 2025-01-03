import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { MigrationService } from '../../migration/migrationService';
import { BN } from '@project-serum/anchor';
import { createHash } from 'crypto';
import WebSocket from 'ws';

// Event discriminators (use full 8 bytes)
const EVENT_DISCRIMINATORS = {
    MIGRATION: createHash('sha256').update('event:MigrationEvent').digest('hex').slice(0, 16),
    // Add more event types here as needed
} as const;

export class BondingCurveProcessor extends BaseProcessor {
    private connection: Connection;
    private migrationService: MigrationService;
    private wsClient: WebSocket | null = null;

    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_DEVNET_RPC_URL);
        this.migrationService = new MigrationService();
        this.connectWebSocket();
    }

    private connectWebSocket() {
        this.wsClient = new WebSocket(config.HELIUS_DEVNET_WEBSOCKET_URL);

        this.wsClient.on('open', () => {
            logger.info('BondingCurve WebSocket Connected');
            this.subscribe();
        });

        this.wsClient.on('message', this.handleMessage.bind(this));

        this.wsClient.on('error', (error) => {
            logger.error('BondingCurve WebSocket error:', error);
        });

        this.wsClient.on('close', () => {
            logger.warn('BondingCurve WebSocket closed, attempting to reconnect...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
    }

    private subscribe() {
        const subscribeMessage = {
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [
                {
                    mentions: [config.BONDING_CURVE_PROGRAM_ID]
                },
                { commitment: "confirmed" }
            ]
        };
        logger.info('BondingCurve Subscribing to logs:', subscribeMessage);
        this.wsClient?.send(JSON.stringify(subscribeMessage));
    }

    private handleMessage(message: WebSocket.Data) {
        try {
            const parsed = JSON.parse(message.toString());

            if (parsed.method === 'logsNotification') {
                const logs = parsed.params.result.value.logs;
                const programData = logs.find((log: string) => log.startsWith('Program data:'));

                if (programData) {
                    const base64Data = programData.split('Program data: ')[1];
                    const buffer = Buffer.from(base64Data, 'base64');

                    // Get event discriminator (first 8 bytes = 16 hex chars)
                    const discriminator = buffer.subarray(0, 8).toString('hex');
                    console.log('Raw discriminator:', discriminator);
                    console.log('Expected discriminator:', EVENT_DISCRIMINATORS.MIGRATION);
                    console.log('Full buffer (hex):', buffer.toString('hex'));

                    switch (discriminator) {
                        case EVENT_DISCRIMINATORS.MIGRATION:
                            this.handleMigrationEvent(buffer);
                            break;
                        default:
                            logger.warn('Unknown event discriminator:', discriminator);
                    }
                }
            }
        } catch (error) {
            logger.error('Error processing bonding curve message:', error);
        }
    }

    private handleMigrationEvent(buffer: Buffer) {
        try {
            // Skip 8-byte discriminator
            const mint = new PublicKey(buffer.subarray(8, 40));
            const realSolAmount = Number(buffer.readBigUInt64LE(40));
            const virtualSolAmount = Number(buffer.readBigUInt64LE(48));
            const tokenAmount = Number(buffer.readBigUInt64LE(56));
            const effectivePrice = Number(buffer.readBigUInt64LE(64));
            const developer = new PublicKey(buffer.subarray(72, 104));
            const isSubscribed = buffer.readUInt8(104) === 1;

            logger.info('Decoded MigrationEvent:', {
                mint: mint.toString(),
                realSolAmount,
                virtualSolAmount,
                tokenAmount,
                effectivePrice,
                developer: developer.toString(),
                isSubscribed
            });

            // Forward to MigrationService
            this.migrationService.handleMigrationEvent({
                mint: mint.toString(),
                realSolAmount,
                virtualSolAmount,
                tokenAmount,
                effectivePrice,
                developer: developer.toString(),
                isSubscribed
            }).catch(error => {
                logger.error('Error in MigrationService.handleMigrationEvent:', error);
            });

        } catch (error) {
            logger.error('Error handling migration event:', error);
        }
    }

    public processEvent(data: Buffer, accountKey: string, programId: string): void {
        // This method is called by HeliusManager but we're using WebSocket now
        // We can leave it empty or log for debugging
        logger.debug('Received event through HeliusManager (ignored):', { accountKey, programId });
    }

}

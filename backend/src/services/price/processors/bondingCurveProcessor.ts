import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { MigrationService } from '../../migration/migrationService';
import { createHash } from 'crypto';
import WebSocket from 'ws';
import type { WebSocketClient } from '../websocket/types';
import { pool } from '../../../config/database';
import { BondingCurvePriceFetcher } from './bondingCurvePriceFetcher';
import { wsManager } from '../../websocket/WebSocketManager';


const TOKEN_DECIMALS = 6;
const TOKEN_DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;
const VIRTUAL_SOL_AMOUNT = 30 * LAMPORTS_PER_SOL; // 30 SOL in lamports

// Event discriminators
const EVENT_DISCRIMINATORS = {
    MIGRATION: createHash('sha256').update('event:MigrationEvent').digest('hex').slice(0, 16),
    BUY: createHash('sha256').update('event:BuyEvent').digest('hex').slice(0, 16),
    SELL: createHash('sha256').update('event:SellEvent').digest('hex').slice(0, 16),
};

export class BondingCurveProcessor extends BaseProcessor {
    private connection: Connection;
    private migrationService: MigrationService;
    private wsClient: WebSocket | null = null;

    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_DEVNET_RPC_URL);
        this.migrationService = new MigrationService(wsManager);
        this.connectWebSocket();
    }

    private connectWebSocket() {
        this.wsClient = new WebSocket(config.HELIUS_DEVNET_WEBSOCKET_URL);

        this.wsClient.on('open', () => {
            this.subscribe();
        });

        this.wsClient.on('message', this.handleMessage.bind(this));

        this.wsClient.on('error', (error) => {
            logger.error('BondingCurve WebSocket error:', error);
        });

        this.wsClient.on('close', () => {
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
        this.wsClient?.send(JSON.stringify(subscribeMessage));
    }

    private handleMessage(message: WebSocket.Data) {
        try {
            const parsed = JSON.parse(message.toString());

            if (parsed.method === 'logsNotification') {
                const logs = parsed.params.result.value.logs;

                // Get all Program data entries in order
                const programDataEntries = logs
                    .filter((log: string) => log.startsWith('Program data:'))
                    .map((programData: string) => {
                        const base64Data = programData.split('Program data: ')[1];
                        return Buffer.from(base64Data, 'base64');
                    });

                logger.info('Found program data entries:', {
                    count: programDataEntries.length,
                    discriminators: programDataEntries.map((buffer: Buffer) =>
                        buffer.subarray(0, 8).toString('hex')
                    )
                });

                // Process each entry in order
                programDataEntries.forEach((buffer: Buffer, index: number) => {
                    const discriminator = buffer.subarray(0, 8).toString('hex');

                    logger.info(`Processing event ${index + 1}/${programDataEntries.length}:`, {
                        discriminator,
                        matches: {
                            migration: discriminator === EVENT_DISCRIMINATORS.MIGRATION,
                            buy: discriminator === EVENT_DISCRIMINATORS.BUY,
                            sell: discriminator === EVENT_DISCRIMINATORS.SELL
                        }
                    });

                    switch (discriminator) {
                        case EVENT_DISCRIMINATORS.MIGRATION:
                            this.handleMigrationEvent(buffer);
                            break;
                        case EVENT_DISCRIMINATORS.BUY:
                            this.handleBuyEvent(buffer);
                            break;
                        case EVENT_DISCRIMINATORS.SELL:
                            this.handleSellEvent(buffer);
                            break;
                        default:
                            logger.warn('Unknown event discriminator:', discriminator);
                    }
                });
            }
        } catch (error) {
            logger.error('Error processing bonding curve message:', error);
        }
    }

    private async waitForNextBlock(): Promise<number> {
        const currentSlot = await this.connection.getSlot('finalized');
        logger.info('Waiting for next block, current slot:', currentSlot);

        let newSlot = currentSlot;
        let attempts = 0;
        while (newSlot <= currentSlot) {
            await new Promise(resolve => setTimeout(resolve, 500));
            newSlot = await this.connection.getSlot('finalized');
            attempts++;
            logger.info('Block check attempt:', {
                attempt: attempts,
                currentSlot,
                newSlot,
                difference: newSlot - currentSlot
            });
        }

        logger.info('Block confirmation complete:', {
            startingSlot: currentSlot,
            endingSlot: newSlot,
            slotDifference: newSlot - currentSlot,
            attempts
        });
        return newSlot;
    }

    private async handleMigrationEvent(buffer: Buffer) {
        try {
            // Parse event data
            const mint = new PublicKey(buffer.subarray(8, 40));
            const realSolAmount = Number(buffer.readBigUInt64LE(40));
            const virtualSolAmount = Number(buffer.readBigUInt64LE(48));
            const tokenAmount = Number(buffer.readBigUInt64LE(56));
            const effectivePrice = Number(buffer.readBigUInt64LE(64));
            const developer = new PublicKey(buffer.subarray(72, 104));
            const isSubscribed = buffer.readUInt8(104) === 1;

            // Wait for next block
            await this.waitForNextBlock();

            // Forward to MigrationService
            await this.migrationService.handleMigrationEvent({
                mint: mint.toString(),
                realSolAmount,
                virtualSolAmount,
                tokenAmount,
                effectivePrice,
                developer: developer.toString(),
                isSubscribed
            });

        } catch (error) {
            logger.error('Error handling migration event:', error);
        }
    }

    private async getTokenInfo(mintAddress: string): Promise<{
        tokenVault: string,
        curveAddress: string,
        decimals: number
    } | null> {
        try {
            logger.info('Fetching token info for:', mintAddress);

            const result = await pool().query(`
                SELECT token_vault, curve_address, decimals
                FROM onstrument.tokens 
                WHERE mint_address = $1 AND token_type = 'custom'
            `, [mintAddress]);

            logger.info('Token info query result:', {
                mintAddress,
                rowCount: result.rowCount,
                firstRow: result.rows[0]
            });

            if (result.rows.length > 0) {
                return {
                    tokenVault: result.rows[0].token_vault,
                    curveAddress: result.rows[0].curve_address,
                    decimals: result.rows[0].decimals
                };
            }
            return null;
        } catch (error) {
            logger.error('Error fetching token info:', {
                error,
                mintAddress
            });
            return null;
        }
    }

    private async handleBuyEvent(buffer: Buffer) {
        try {
            // Parse event data
            const mint = new PublicKey(buffer.subarray(8, 40));
            const amount = Number(buffer.readBigUInt64LE(40));
            const solAmount = Number(buffer.readBigUInt64LE(48));



            // Wait for next block
            await this.waitForNextBlock();

            const tokenInfo = await this.getTokenInfo(mint.toString());
            if (tokenInfo) {
                await BondingCurvePriceFetcher.fetchPrice({
                    mintAddress: mint.toString(),
                    curveAddress: tokenInfo.curveAddress,
                    tokenVault: tokenInfo.tokenVault,
                    decimals: tokenInfo.decimals,
                    volume: solAmount / LAMPORTS_PER_SOL,
                    isBuy: true
                });
            }
        } catch (error) {
            logger.error('Error handling buy event:', error);
        }
    }

    private async handleSellEvent(buffer: Buffer) {
        try {
            // Parse event data
            const mint = new PublicKey(buffer.subarray(8, 40));
            const amount = Number(buffer.readBigUInt64LE(40));
            const solAmount = Number(buffer.readBigUInt64LE(48));
            const seller = new PublicKey(buffer.subarray(56, 88));
            const isSubscribed = buffer.readUInt8(88) === 1;



            // Wait for next block
            await this.waitForNextBlock();

            const tokenInfo = await this.getTokenInfo(mint.toString());
            if (tokenInfo) {
                await BondingCurvePriceFetcher.fetchPrice({
                    mintAddress: mint.toString(),
                    curveAddress: tokenInfo.curveAddress,
                    tokenVault: tokenInfo.tokenVault,
                    decimals: tokenInfo.decimals,
                    volume: solAmount / LAMPORTS_PER_SOL,
                    isBuy: false
                });
            }
        } catch (error) {
            logger.error('Error handling sell event:', error);
        }
    }

    public processEvent(data: Buffer, accountKey: string, programId: string): void {
        // This method is called by HeliusManager but we're using WebSocket now
        // We can leave it empty or log for debugging
        logger.debug('Received event through HeliusManager (ignored):', { accountKey, programId });
    }

    protected async emitPriceUpdate(update: {
        mintAddress: string;
        price: number;
        volume?: number;
    }) {
        this.emit('priceUpdate', update);

        // Get the WebSocket server instance and broadcast to subscribed clients
        const wss = global.wss; // We'll need to expose this from index.ts
        if (wss) {
            wss.clients.forEach((client: WebSocketClient) => {
                if (client.readyState === WebSocket.OPEN &&
                    client.subscriptions?.has(update.mintAddress)) {
                    client.send(JSON.stringify({
                        type: 'price',
                        mintAddress: update.mintAddress,
                        price: update.price,
                        timestamp: Date.now()
                    }));
                }
            });
        }
    }

}

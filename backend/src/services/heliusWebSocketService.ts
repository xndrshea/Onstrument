import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { config } from '../config/env';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';

interface PoolData {
    mintAddress: string;
    price: number;
    baseReserve: number;
    quoteReserve: number;
    baseVolume: number;
    quoteVolume: number;
    timestamp: Date;
}

export class HeliusWebSocketService extends EventEmitter {
    private static instance: HeliusWebSocketService;
    private ws: WebSocket | null = null;
    private currentMintAddress: string | null = null;
    private poolToMintMap: Map<string, string> = new Map();

    private constructor() {
        super();
        this.initializePoolMintMap().then(() => this.connect());
    }

    static getInstance(): HeliusWebSocketService {
        if (!this.instance) {
            this.instance = new HeliusWebSocketService();
        }
        return this.instance;
    }

    private connect() {
        // Close existing connection if any
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.ws = new WebSocket(config.HELIUS_WEBSOCKET_URL);

        this.ws.on('open', () => {
            logger.info('Connected to Helius WebSocket');

            // Subscribe to DEX programs
            const programs = [
                "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  // Raydium
                "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",   // Jupiter
                "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"    // Orca
            ];

            programs.forEach(program => {
                const subscribeMessage = {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "programSubscribe",
                    params: [
                        program,
                        { encoding: "base64", commitment: "confirmed" }
                    ]
                };
                this.ws?.send(JSON.stringify(subscribeMessage));
            });
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleMessage(message);
            } catch (error) {
                logger.error('Error processing WebSocket message:', error);
            }
        });

        this.ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            // Attempt to reconnect after error
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('close', () => {
            logger.warn('WebSocket connection closed');
            // Attempt to reconnect after close
            setTimeout(() => this.connect(), 5000);
        });
    }

    private async handleMessage(message: any) {
        try {
            if (message.method === "programNotification") {
                const accountData = message.params.result.value.account.data;
                const programId = message.params.result.value.account.owner;

                switch (programId) {
                    case "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8":
                        await this.handleRaydiumSwap(accountData);
                        break;
                    case "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB":
                        await this.handleJupiterSwap(accountData);
                        break;
                    case "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc":
                        await this.handleOrcaSwap(accountData);
                        break;
                }
            }
        } catch (error) {
            logger.error('Error handling message:', error);
        }
    }

    private async handleRaydiumSwap(base64Data: string) {
        try {
            const buffer = Buffer.from(base64Data, 'base64');

            // Extract token mints first
            const tokenMintA = new PublicKey(buffer.subarray(8, 40));
            const tokenMintB = new PublicKey(buffer.subarray(40, 72));

            // Add both tokens to tracking if they don't exist
            await Promise.all([
                this.addTokenToTracking(tokenMintA.toString()),
                this.addTokenToTracking(tokenMintB.toString())
            ]);

            // Get pool address from the account data
            const poolAddress = buffer.slice(0, 32).toString('hex');

            // Use the map to get the correct mint address for this pool
            const mintAddress = this.poolToMintMap.get(poolAddress);
            if (!mintAddress) {
                logger.debug(`Unknown pool address: ${poolAddress}`);
                return;
            }

            // Extract reserves and calculate price
            const reserveA = buffer.readBigUInt64LE(168);
            const reserveB = buffer.readBigUInt64LE(176);

            // Extract volumes
            const volumeA = buffer.readBigUInt64LE(184);
            const volumeB = buffer.readBigUInt64LE(192);

            if (reserveA > 0) {
                const price = Number(reserveB) / Number(reserveA);

                await this.handlePriceUpdate(tokenMintA.toString(), price, {
                    baseReserve: Number(reserveA),
                    quoteReserve: Number(reserveB),
                    baseVolume: Number(volumeA),
                    quoteVolume: Number(volumeB)
                });

                if (reserveB > 0) {
                    const reversePrice = Number(reserveA) / Number(reserveB);
                    await this.handlePriceUpdate(tokenMintB.toString(), reversePrice, {
                        baseReserve: Number(reserveB),
                        quoteReserve: Number(reserveA),
                        baseVolume: Number(volumeB),
                        quoteVolume: Number(volumeA)
                    });
                }
            }
        } catch (error) {
            logger.error('Error parsing Raydium swap:', error);
        }
    }

    private async handleJupiterSwap(base64Data: string) {
        try {
            const buffer = Buffer.from(base64Data, 'base64');

            const tokenInMint = new PublicKey(buffer.subarray(8, 40));
            const tokenOutMint = new PublicKey(buffer.subarray(40, 72));

            // Add both tokens to tracking if they don't exist
            await Promise.all([
                this.addTokenToTracking(tokenInMint.toString()),
                this.addTokenToTracking(tokenOutMint.toString())
            ]);

            // Extract amounts and calculate price
            const amountIn = buffer.readBigUInt64LE(72);
            const amountOut = buffer.readBigUInt64LE(80);
            const price = Number(amountOut) / Number(amountIn);

            await this.handlePriceUpdate(tokenInMint.toString(), price);
        } catch (error) {
            logger.error('Error parsing Jupiter swap:', error);
        }
    }

    private async handleOrcaSwap(base64Data: string) {
        try {
            const buffer = Buffer.from(base64Data, 'base64');

            // Log the buffer size for debugging
            logger.debug(`Orca swap buffer size: ${buffer.length}`);

            // Minimum size for Orca whirlpool state
            const MIN_SIZE = 32;  // Basic account header size

            if (buffer.length < MIN_SIZE) {
                logger.warn(`Orca swap data buffer too small: ${buffer.length} bytes`);
                return;
            }

            // Extract token mints (assuming similar structure as other DEXes)
            const tokenMintA = new PublicKey(buffer.subarray(8, 40));
            const tokenMintB = new PublicKey(buffer.subarray(40, 72));

            // Add both tokens to tracking if they don't exist
            await Promise.all([
                this.addTokenToTracking(tokenMintA.toString()),
                this.addTokenToTracking(tokenMintB.toString())
            ]);

            // Try to read price data from different possible layouts
            let price: number | null = null;

            if (buffer.length >= 76) {
                // Standard whirlpool layout
                const sqrtPrice = buffer.readBigUInt64LE(76);
                price = Number(sqrtPrice) * Number(sqrtPrice) / (2 ** 64);
            } else if (buffer.length >= 48) {
                // Alternative layout
                const rawPrice = buffer.readBigUInt64LE(40);
                price = Number(rawPrice) / (2 ** 32);
            }

            if (price && price > 0 && this.currentMintAddress) {
                logger.debug(`Processed Orca price: ${price}`);
                await this.handlePriceUpdate(this.currentMintAddress, price);
            }
        } catch (error) {
            logger.error('Error parsing Orca swap:', error);
        }
    }

    private async handlePriceUpdate(
        mintAddress: string,
        price: number,
        poolData?: {
            baseReserve: number,
            quoteReserve: number,
            baseVolume: number,
            quoteVolume: number
        }
    ) {
        try {
            // Check if this is the first price for this token
            const firstPrice = await pool.query(`
                SELECT COUNT(*) 
                FROM token_platform.price_history 
                WHERE token_address = $1
            `, [mintAddress]);

            if (firstPrice.rows[0].count === '0' && price > 0) {
                // For the first price point, create an initial candle
                const time = Math.floor(Date.now() / 1000);
                const periodStart = Math.floor(time / 60) * 60;

                await PriceHistoryModel.recordPrice(mintAddress, price, 0);
                logger.info(`Recorded first price for token ${mintAddress}: ${price}`);
            }

            // Get previous pool state to calculate volume
            const prevState = await pool.query(`
                SELECT base_reserve, quote_reserve
                FROM token_platform.pool_states
                WHERE pool_address = $1
            `, [mintAddress]);

            // Calculate volume if we have pool data
            let volume = 0;
            if (poolData && prevState.rows.length > 0) {
                const prev = prevState.rows[0];
                // Calculate volume based on reserve changes
                const baseVolumeDelta = Math.abs(poolData.baseReserve - prev.base_reserve);
                const quoteVolumeDelta = Math.abs(poolData.quoteReserve - prev.quote_reserve);
                volume = Math.max(baseVolumeDelta, quoteVolumeDelta);

                // Update pool state
                await pool.query(`
                    UPDATE token_platform.pool_states
                    SET 
                        base_reserve = $2,
                        quote_reserve = $3,
                        base_volume = base_volume + $4,
                        quote_volume = quote_volume + $5,
                        price = $6,
                        last_update = CURRENT_TIMESTAMP
                    WHERE pool_address = $1
                `, [
                    mintAddress,
                    poolData.baseReserve,
                    poolData.quoteReserve,
                    poolData.baseVolume,
                    poolData.quoteVolume,
                    price
                ]);
            }

            // Emit real-time update for charts
            this.emit('priceUpdate', {
                mintAddress,
                price,
                volume,
                timestamp: Math.floor(Date.now() / 1000)
            });

            // Record OHLCV data
            await PriceHistoryModel.recordPrice(mintAddress, price, volume);

        } catch (error) {
            logger.error('Error handling price update:', error);
            throw error;
        }
    }

    private async initializePoolMintMap() {
        try {
            const connection = new Connection(config.HELIUS_RPC_URL);

            // Get known DEX pools and their associated mint addresses
            const pools = await pool.query(`
                SELECT DISTINCT pool_address, mint_address 
                FROM token_platform.pool_states
                WHERE pool_address IS NOT NULL
            `);

            pools.rows.forEach(row => {
                this.poolToMintMap.set(row.pool_address, row.mint_address);
            });

            logger.info(`Initialized pool-to-mint map with ${this.poolToMintMap.size} entries`);
        } catch (error) {
            logger.error('Error initializing pool mint map:', error);
            throw error;
        }
    }

    public setCurrentMintAddress(mintAddress: string) {
        this.currentMintAddress = mintAddress;
    }

    public initialize(wss: WebSocket.Server) {
        wss.on('connection', (ws) => {
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleClientMessage(data, ws);
                } catch (error) {
                    logger.error('Error handling client message:', error);
                }
            });

            ws.on('error', (error) => {
                logger.error('WebSocket client error:', error);
            });
        });
    }

    private handleClientMessage(data: any, ws: WebSocket) {
        if (data.type === 'subscribe' && data.mintAddress) {
            this.setCurrentMintAddress(data.mintAddress);
        }
    }

    public async getPriceHistory(mintAddress: string, timeframe: '24h' | '7d' | '30d' = '24h') {
        return await PriceHistoryModel.getPriceHistory(mintAddress);
    }

    public async getTradeHistory(mintAddress: string, limit: number) {
        // Implement if needed or return empty array for now
        return [];
    }

    public getStatus() {
        return {
            connected: this.ws?.readyState === WebSocket.OPEN,
            currentMint: this.currentMintAddress
        };
    }

    private async addTokenToTracking(mintAddress: string) {
        try {
            // Check if token exists in tokens table
            const exists = await pool.query(`
                SELECT 1 FROM token_platform.tokens WHERE mint_address = $1
            `, [mintAddress]);

            if (exists.rowCount === 0) {
                // Add to tokens table
                await pool.query(`
                    INSERT INTO token_platform.tokens 
                    (mint_address, name, symbol, decimals, verified)
                    VALUES ($1, '', '', 0, false)
                    ON CONFLICT (mint_address) DO NOTHING
                `, [mintAddress]);

                // Initialize pool_states entry
                await pool.query(`
                    INSERT INTO token_platform.pool_states 
                    (pool_address, base_reserve, quote_reserve, base_volume, quote_volume, last_slot, price)
                    VALUES ($1, 0, 0, 0, 0, 0, 0)
                    ON CONFLICT (pool_address) DO NOTHING
                `, [mintAddress]);

                logger.info(`Added new DEX token to tracking: ${mintAddress}`);
            }
        } catch (error) {
            logger.error('Error adding token to tracking:', error);
        }
    }

    private async handleWebSocketMessage(data: any) {
        try {
            if (data.type === 'dex_update') {
                const poolData = {
                    baseReserve: data.baseReserve,
                    quoteReserve: data.quoteReserve,
                    baseVolume: data.baseVolume || 0,
                    quoteVolume: data.quoteVolume || 0
                };
                await this.handlePriceUpdate(data.mintAddress, data.price, poolData);
            } else if (data.type === 'custom_token_update') {
                await this.handlePriceUpdate(data.mintAddress, data.price);
            }
        } catch (error) {
            logger.error('Error handling WebSocket message:', error);
        }
    }
}
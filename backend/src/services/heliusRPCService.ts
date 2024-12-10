import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

interface PoolData {
    mintAddress: string;
    price: number;
    baseReserve: number;
    quoteReserve: number;
}

export class HeliusRPCService extends EventEmitter {
    private static instance: HeliusRPCService;
    private connection: Connection;
    private subscriptions: Map<string, number> = new Map();

    private constructor() {
        super();
        this.connection = new Connection(config.HELIUS_RPC_URL);
    }

    static getInstance(): HeliusRPCService {
        if (!HeliusRPCService.instance) {
            HeliusRPCService.instance = new HeliusRPCService();
        }
        return HeliusRPCService.instance;
    }

    async subscribeToPool(poolAddress: string, mintAddress: string) {
        try {
            const subscriptionId = this.connection.onAccountChange(
                new PublicKey(poolAddress),
                async (accountInfo) => {
                    const poolData = this.parsePoolData(accountInfo.data, mintAddress);
                    if (poolData) {
                        await this.updatePoolData(poolData);
                        this.emit('priceUpdate', poolData);
                    }
                },
                'processed'
            );
            this.subscriptions.set(poolAddress, subscriptionId);
            logger.info(`Subscribed to pool: ${poolAddress} for token: ${mintAddress}`);
        } catch (error) {
            logger.error(`Failed to subscribe to pool ${poolAddress}:`, error);
        }
    }

    private parsePoolData(data: Buffer, mintAddress: string): PoolData | null {
        try {
            // Implement Raydium pool data parsing here
            // This is a placeholder - actual implementation needed
            return {
                mintAddress,
                price: 0,
                baseReserve: 0,
                quoteReserve: 0
            };
        } catch (error) {
            logger.error('Error parsing pool data:', error);
            return null;
        }
    }

    private async updatePoolData(poolData: PoolData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(`
                UPDATE token_platform.token_stats 
                SET 
                    price = $2,
                    base_reserve = $3,
                    quote_reserve = $4,
                    last_updated = CURRENT_TIMESTAMP
                WHERE mint_address = $1
            `, [
                poolData.mintAddress,
                poolData.price,
                poolData.baseReserve,
                poolData.quoteReserve
            ]);

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error updating pool data:', error);
        } finally {
            client.release();
        }
    }

    async initialize() {
        try {
            const result = await pool.query(`
                SELECT rt.pool_address, rt.mint_address 
                FROM token_platform.raydium_tokens rt
                JOIN token_platform.token_stats ts ON rt.mint_address = ts.mint_address
                WHERE ts.volume_24h > 0
                ORDER BY ts.volume_24h DESC
                LIMIT 300
            `);

            for (const row of result.rows) {
                await this.subscribeToPool(row.pool_address, row.mint_address);
            }
        } catch (error) {
            logger.error('Error initializing RPC subscriptions:', error);
        }
    }
} 
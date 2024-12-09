import { WebSocketService } from './websocketService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { Connection, PublicKey } from '@solana/web3.js';

export class DexService {
    private static instance: DexService | null = null;
    private wsService: WebSocketService;
    private connection: Connection;

    private constructor(connection: Connection) {
        this.connection = connection;
        this.wsService = WebSocketService.getInstance();
    }

    static getInstance(connection: Connection): DexService {
        if (!DexService.instance) {
            DexService.instance = new DexService(connection);
        }
        return DexService.instance;
    }

    async getTokenPrice(mintAddress: string): Promise<number> {
        const result = await pool.query(`
            SELECT price 
            FROM token_platform.token_stats
            WHERE mint_address = $1
        `, [mintAddress]);

        if (!result.rows[0]) {
            throw new Error('Token price not found');
        }

        // Ensure we're subscribed to updates
        this.wsService.subscribeToToken(mintAddress);

        return result.rows[0].price;
    }

    async getPoolInfo(mintAddress: string) {
        const result = await pool.query(`
            SELECT 
                rt.pool_address,
                ts.price,
                ts.liquidity,
                ts.volume_24h
            FROM token_platform.raydium_tokens rt
            JOIN token_platform.token_stats ts ON rt.mint_address = ts.mint_address
            WHERE rt.mint_address = $1
        `, [mintAddress]);

        if (!result.rows[0]) {
            throw new Error('Pool not found');
        }

        return {
            poolAddress: result.rows[0].pool_address,
            price: result.rows[0].price,
            liquidity: result.rows[0].liquidity,
            volume24h: result.rows[0].volume_24h
        };
    }

    async getTradeHistory(mintAddress: string, limit: number = 50) {
        const result = await pool.query(`
            SELECT 
                price,
                amount,
                side,
                wallet_address,
                signature,
                timestamp
            FROM token_platform.trade_history
            WHERE mint_address = $1
            ORDER BY timestamp DESC
            LIMIT $2
        `, [mintAddress, limit]);

        return result.rows;
    }

    async handleTransaction(transaction: any) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Record trade
            const tradeResult = await client.query(`
                INSERT INTO token_platform.trade_history (
                    mint_address, price, amount, side, wallet_address, 
                    signature, timestamp, token_type
                ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 'raydium')
                RETURNING *
            `, [
                transaction.mintAddress,
                transaction.price,
                transaction.amount,
                transaction.side,
                transaction.walletAddress,
                transaction.signature
            ]);

            // Update pool stats
            await client.query(`
                UPDATE token_platform.token_stats 
                SET price = $2,
                    volume_24h = volume_24h + $3,
                    last_updated = CURRENT_TIMESTAMP
                WHERE mint_address = $1
            `, [
                transaction.mintAddress,
                transaction.price,
                transaction.amount * transaction.price
            ]);

            await client.query('COMMIT');

            // Notify WebSocket clients
            this.wsService.emit('trade', tradeResult.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
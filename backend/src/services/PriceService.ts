import { WebSocketService } from './websocketService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class PriceService {
    private static instance: PriceService;
    private wsService: WebSocketService;

    private constructor() {
        this.wsService = WebSocketService.getInstance();
        this.setupWebSocketListeners();
    }

    static getInstance(): PriceService {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService();
        }
        return PriceService.instance;
    }

    private setupWebSocketListeners() {
        this.wsService.on('trade', async (data) => {
            await this.recordPrice(data.mintAddress, data.price, data.tokenType);
        });
    }

    // Only used for recording historical prices
    async recordPrice(mintAddress: string, price: number, tokenType: 'raydium' | 'custom') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(`
                INSERT INTO token_platform.price_history 
                (mint_address, price, timestamp, token_type)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            `, [mintAddress, price, tokenType]);

            await client.query('COMMIT');

            // Notify WebSocket clients about the new historical price point
            this.wsService.emit('price_history_update', { mintAddress, price });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Only used for historical price data
    async getPriceHistory(mintAddress: string, timeframe: '24h' | '7d' | '30d'): Promise<any[]> {
        const intervalMap = { '24h': '1 day', '7d': '7 days', '30d': '30 days' };

        const result = await pool.query(`
            SELECT EXTRACT(EPOCH FROM timestamp) as time, price as value
            FROM token_platform.price_history
            WHERE mint_address = $1 AND timestamp > NOW() - $2::interval
            ORDER BY timestamp ASC
        `, [mintAddress, intervalMap[timeframe]]);

        return result.rows;
    }
}
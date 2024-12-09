import { WebSocketService } from './websocketService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class PriceService {
    private static instance: PriceService | null = null;
    private priceCache: Map<string, {
        price: number;
        timestamp: number;
        tokenType: 'raydium' | 'custom';
    }> = new Map();
    private readonly CACHE_DURATION = 60 * 1000; // 60 seconds
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
        this.wsService.on('trade', (data) => {
            this.priceCache.set(data.mintAddress, {
                price: data.price,
                timestamp: Date.now(),
                tokenType: 'raydium'
            });
        });
    }

    async getTokenPrice(mintAddress: string): Promise<number> {
        // Check cache first
        const cached = this.priceCache.get(mintAddress);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
            return cached.price;
        }

        // If not in cache, check database
        const result = await pool.query(`
            SELECT price, 
                   CASE 
                       WHEN EXISTS (SELECT 1 FROM token_platform.raydium_tokens WHERE mint_address = $1) THEN 'raydium'
                       ELSE 'custom'
                   END as token_type
            FROM token_platform.token_stats
            WHERE mint_address = $1
        `, [mintAddress]);

        if (!result.rows[0]) {
            throw new Error('Token price not found');
        }

        // Subscribe to WebSocket updates for Raydium tokens
        if (result.rows[0].token_type === 'raydium') {
            this.wsService.subscribeToToken(mintAddress);
        }

        // Update cache
        this.priceCache.set(mintAddress, {
            price: result.rows[0].price,
            timestamp: Date.now(),
            tokenType: result.rows[0].token_type
        });

        return result.rows[0].price;
    }

    async getPriceHistory(mintAddress: string, timeframe: '24h' | '7d' | '30d' = '24h'): Promise<Array<{ timestamp: number; price: number }>> {
        const timeframeMap = {
            '24h': 'interval \'1 hour\'',
            '7d': 'interval \'4 hours\'',
            '30d': 'interval \'1 day\''
        };

        const result = await pool.query(`
            SELECT 
                time_bucket($2, timestamp) AS time,
                FIRST(price, timestamp) as price
            FROM token_platform.price_history
            WHERE mint_address = $1
            AND timestamp > NOW() - $3::interval
            GROUP BY time
            ORDER BY time ASC
        `, [
            mintAddress,
            timeframeMap[timeframe],
            timeframe
        ]);

        return result.rows.map(row => ({
            timestamp: row.time.getTime(),
            price: parseFloat(row.price)
        }));
    }

    async updatePrice(mintAddress: string, price: number, tokenType: 'raydium' | 'custom') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update current price
            await client.query(`
                UPDATE token_platform.token_stats 
                SET price = $2, last_updated = CURRENT_TIMESTAMP
                WHERE mint_address = $1
            `, [mintAddress, price]);

            // Record price history
            await client.query(`
                INSERT INTO token_platform.price_history 
                (mint_address, price, timestamp, token_type)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            `, [mintAddress, price, tokenType]);

            await client.query('COMMIT');

            // Update cache and notify WebSocket clients
            this.priceCache.set(mintAddress, {
                price,
                timestamp: Date.now(),
                tokenType
            });

            if (tokenType === 'raydium') {
                this.wsService.emit('price', { mintAddress, price });
            }
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
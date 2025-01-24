import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { wsManager } from '../websocket/WebSocketManager';
import axios from 'axios';
import { MetadataService } from '../metadata/metadataService';

export class SolPriceService {
    private static instance: SolPriceService;
    private readonly SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
    private readonly JUPITER_PRICE_API = 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';
    private lastPrice: number | null = null;

    private constructor() {
        // Fetch price immediately on startup
        void this.updateSolPrice();
    }

    static getInstance(): SolPriceService {
        if (!SolPriceService.instance) {
            SolPriceService.instance = new SolPriceService();
        }
        return SolPriceService.instance;
    }

    private isValidPrice(price: number): boolean {
        const MIN_PRICE = 0.01;
        const MAX_PRICE = 1000;
        const MAX_CHANGE = 0.25; // 25% max change from last price

        if (price < MIN_PRICE || price > MAX_PRICE) return false;
        if (this.lastPrice && Math.abs(price - this.lastPrice) / this.lastPrice > MAX_CHANGE) {
            logger.warn('SOL price change exceeds threshold', {
                lastPrice: this.lastPrice,
                newPrice: price,
                change: (price - this.lastPrice) / this.lastPrice
            });
            return false;
        }
        return true;
    }

    public async updateSolPrice(): Promise<void> {
        try {
            const response = await axios.get(this.JUPITER_PRICE_API);
            const price = Number(response.data?.data?.[this.SOL_ADDRESS]?.price);

            if (!price || isNaN(price)) {
                throw new Error('Invalid price received from Jupiter');
            }

            // First, verify the current state
            const verifyQuery = await pool().query(
                'SELECT current_price FROM onstrument.tokens WHERE mint_address = $1',
                [this.SOL_ADDRESS]
            );

            const query = `
                UPDATE onstrument.tokens 
                SET 
                    current_price = $1,
                    last_price_update = NOW()
                WHERE mint_address = $2
                RETURNING current_price, last_price_update, 
                        EXTRACT(EPOCH FROM NOW()) as update_timestamp;
            `;

            const result = await pool().query(query, [price, this.SOL_ADDRESS]);

            // Immediately verify the update
            const postVerifyQuery = await pool().query(
                'SELECT current_price FROM onstrument.tokens WHERE mint_address = $1',
                [this.SOL_ADDRESS]
            );


            if (!postVerifyQuery.rows[0]?.current_price) {
                throw new Error('Price was cleared immediately after update!');
            }

            this.lastPrice = price;

        } catch (error) {
            logger.error('Failed to update SOL price:', error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
} 
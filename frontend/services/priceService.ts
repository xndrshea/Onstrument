import { TokenRecord } from '../../shared/types/token';
import { Connection } from '@solana/web3.js';

interface PriceHistoryPoint {
    timestamp: number;
    price: number;
}

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

export class PriceService {
    private static instance: PriceService;
    private connection: Connection;

    private constructor(connection: Connection) {
        this.connection = connection;
    }

    static getInstance(connection: Connection): PriceService {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService(connection);
        }
        return PriceService.instance;
    }

    async getPriceHistory(token: TokenRecord): Promise<PriceHistoryPoint[]> {
        try {
            const response = await fetch(`${API_BASE_URL}/price-history/${token.mintAddress}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching price history:', error);
            throw error;
        }
    }

    async getPrice(token: TokenRecord): Promise<number> {
        try {
            const response = await fetch(`${API_BASE_URL}/prices/${token.mintAddress}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.price;
        } catch (error) {
            console.error('Error fetching price:', error);
            throw error;
        }
    }
}

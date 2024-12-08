import { pool } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { BondingCurve } from './bondingCurve';

export class PriceService {
    private connection: Connection;
    private updateInterval: NodeJS.Timeout | null = null;
    private readonly JUPITER_API = 'https://price.jup.ag/v4/price';

    constructor(connection: Connection) {
        this.connection = connection;
        this.startPriceUpdates();
    }

    private async startPriceUpdates() {
        // Update prices every 30 seconds
        this.updateInterval = setInterval(async () => {
            await this.updateAllPrices();
        }, 30000);
    }

    private async updateAllPrices() {
        try {
            // 1. Get all tokens from database
            const { rows: tokens } = await pool.query(
                'SELECT mint_address, token_type, curve_address FROM token_platform.tokens'
            );

            // 2. Update each token's price
            for (const token of tokens) {
                try {
                    let price: number;

                    if (token.token_type === 'dex') {
                        const response = await axios.get(`${this.JUPITER_API}?ids=${token.mint_address}`);
                        price = response.data.data[token.mint_address]?.price || 0;
                    } else {
                        const bondingCurve = new BondingCurve(
                            this.connection,
                            new PublicKey(token.mint_address),
                            new PublicKey(token.curve_address)
                        );
                        const quote = await bondingCurve.getPriceQuote(1, true);
                        price = quote.price;
                    }

                    // Record price
                    await pool.query(`
                        INSERT INTO token_platform.price_history 
                        (token_mint_address, price, timestamp, source)
                        VALUES ($1, $2, $3, $4)
                    `, [
                        token.mint_address,
                        price,
                        Math.floor(Date.now() / 1000),
                        token.token_type
                    ]);
                } catch (error) {
                    logger.error(`Failed to update price for token ${token.mint_address}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error in updateAllPrices:', error);
        }
    }

    async getPriceHistory(mintAddress: string) {
        const result = await pool.query(`
            SELECT timestamp, price
            FROM token_platform.price_history
            WHERE token_mint_address = $1
            ORDER BY timestamp ASC
        `, [mintAddress]);

        return result.rows;
    }

    static async getPrice(mintAddress: string): Promise<number> {
        // Implement your price fetching logic here
        // For example:
        const result = await pool.query(
            `SELECT price FROM token_platform.price_history 
             WHERE token_mint_address = $1 
             ORDER BY timestamp DESC LIMIT 1`,
            [mintAddress]
        );
        return result.rows[0]?.price ?? 0;
    }
}
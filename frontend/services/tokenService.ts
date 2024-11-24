import { db } from '../db';
import {
    TokenData,
    TokenRecord,
    TokenStats,
    TradeHistory,
    CreateTokenParams,
    Network
} from '../../shared/types/token';
import { logger } from '../utils/logger';

export class TokenService {
    async create(params: CreateTokenParams): Promise<TokenData> {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // Create token record
            const tokenResult = await client.query<TokenRecord>(
                `INSERT INTO token_platform.tokens (
                    mint_address,
                    curve_address,
                    name,
                    symbol,
                    description,
                    total_supply,
                    creator_id,
                    network,
                    metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [
                    params.mint_address,
                    params.curve_address,
                    params.name,
                    params.symbol,
                    params.description || '',
                    params.total_supply,
                    params.creator_id || null,
                    params.network || 'devnet',
                    params.metadata || {}
                ]
            );

            // Initialize token stats
            await client.query(
                `INSERT INTO token_platform.token_stats (
                    token_id, holder_count, transaction_count
                ) VALUES ($1, 0, 0)`,
                [tokenResult.rows[0].id]
            );

            await client.query('COMMIT');
            return tokenResult.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error creating token:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getByMintAddress(mintAddress: string): Promise<TokenData | null> {
        try {
            const result = await db.query<TokenData>(
                `SELECT 
                    t.*,
                    ts.holder_count,
                    ts.transaction_count,
                    ts.last_price,
                    ts.market_cap,
                    ts.volume_24h,
                    ts.updated_at as stats_updated_at
                FROM token_platform.tokens t
                LEFT JOIN token_platform.token_stats ts ON t.id = ts.token_id
                WHERE t.mint_address = $1`,
                [mintAddress]
            );

            if (result.rows.length === 0) return null;

            // Get recent trades
            const trades = await db.query<TradeHistory>(
                `SELECT * FROM token_platform.trade_history
                WHERE token_id = $1
                ORDER BY timestamp DESC
                LIMIT 10`,
                [result.rows[0].id]
            );

            return {
                ...result.rows[0],
                recent_trades: trades.rows
            };
        } catch (error) {
            logger.error('Error fetching token:', error);
            throw error;
        }
    }

    async updateStats(tokenId: number, stats: Partial<TokenStats>): Promise<void> {
        try {
            const updates = [];
            const values = [];
            let paramCount = 1;

            // Build dynamic update query
            for (const [key, value] of Object.entries(stats)) {
                if (value !== undefined) {
                    updates.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }

            if (updates.length === 0) return;

            values.push(tokenId);
            await db.query(
                `UPDATE token_platform.token_stats
                SET ${updates.join(', ')},
                    updated_at = CURRENT_TIMESTAMP
                WHERE token_id = $${paramCount}`,
                values
            );
        } catch (error) {
            logger.error('Error updating token stats:', error);
            throw error;
        }
    }

    async recordTrade(trade: Omit<TradeHistory, 'id' | 'timestamp'>): Promise<void> {
        try {
            await db.query(
                `INSERT INTO token_platform.trade_history (
                    token_id,
                    trader_address,
                    transaction_signature,
                    amount,
                    price,
                    is_buy
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    trade.token_id,
                    trade.trader_address,
                    trade.transaction_signature,
                    trade.amount,
                    trade.price,
                    trade.is_buy
                ]
            );

            // Update token stats
            await this.updateStats(trade.token_id, {
                transaction_count: await this.getTransactionCount(trade.token_id),
                last_price: trade.price,
                volume_24h: await this.get24HourVolume(trade.token_id)
            });
        } catch (error) {
            logger.error('Error recording trade:', error);
            throw error;
        }
    }
}

export const tokenService = new TokenService();
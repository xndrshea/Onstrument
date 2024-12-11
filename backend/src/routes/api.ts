import cors from 'cors';
import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { HeliusManager } from '../services/price/websocket/heliusManager';
import { Connection } from '@solana/web3.js';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { RaydiumProcessor } from '../services/price/processors/raydiumProcessor';
import { BondingCurveProcessor } from '../services/price/processors/bondingCurveProcessor';
import { PriceUpdateQueue } from '../services/price/queue/priceUpdateQueue';

const router = Router();

// CORS and rate limiting setup
router.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const heliusService = HeliusManager.getInstance();
const connection = new Connection(config.HELIUS_RPC_URL);
const priceQueue = PriceUpdateQueue.getInstance();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});

router.use(limiter);

// System status monitoring endpoint
router.get('/system/status', async (_req, res) => {
    try {
        const status = {
            websocket: heliusService.getStatus(),
            processors: {
                raydium: RaydiumProcessor.getStatus(),
                bondingCurve: BondingCurveProcessor.getStatus()
            },
            queue: priceQueue.getMetrics()
        };

        res.json(status);
    } catch (error) {
        logger.error('Error fetching system status:', error);
        res.status(500).json({ error: 'Failed to fetch system status' });
    }
});

// Token creation endpoint
router.post('/tokens', async (req, res) => {
    try {
        const {
            mintAddress,
            curveAddress,
            name,
            symbol,
            description,
            metadataUri,
            totalSupply,
            decimals,
            curveConfig
        } = req.body;

        // Database operations
        const result = await pool.query(`
            INSERT INTO token_platform.custom_tokens (
                mint_address,
                curve_address,
                name,
                symbol,
                decimals,
                description,
                metadata_uri
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            mintAddress,
            curveAddress,
            name,
            symbol,
            decimals || 6,
            description,
            metadataUri
        ]);

        await pool.query(`
            INSERT INTO token_platform.custom_token_states (
                mint_address,
                supply,
                reserve,
                price,
                last_slot,
                volume_24h_usd
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [mintAddress, totalSupply || 0, 0, 0, 0, 0]);

        // Initialize price history
        await PriceHistoryModel.recordPrice(mintAddress, 0);

        // Initialize processor subscription for bonding curve tokens
        if (curveAddress) {
            await heliusService.subscribeToAccount(curveAddress);
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error creating token:', error);
        res.status(500).json({ error: 'Failed to create token' });
    }
});

// Existing endpoints remain unchanged
router.get('/tokens', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        logger.info('Fetching tokens with params:', { page, limit, offset });

        // Get custom tokens
        const customTokensQuery = `
            SELECT 
                ct.mint_address,
                ct.name,
                ct.symbol,
                ct.decimals,
                ct.description,
                ct.metadata_url,
                ct.curve_address,
                ct.curve_config,
                cts.supply as total_supply,
                cts.price,
                cts.volume_24h_usd as volume_24h,
                'custom' as token_type,
                ct.created_at
            FROM token_platform.custom_tokens ct
            LEFT JOIN token_platform.custom_token_states cts 
            ON ct.mint_address = cts.mint_address
        `;

        // Get pool tokens
        const poolTokensQuery = `
            SELECT 
                t.mint_address,
                t.name,
                t.symbol,
                t.decimals,
                t.metadata_url,
                NULL as description,
                NULL as curve_address,
                NULL as curve_config,
                NULL as total_supply,
                ps.price,
                ps.volume_24h_usd as volume_24h,
                'pool' as token_type,
                t.created_at
            FROM token_platform.tokens t
            LEFT JOIN token_platform.pool_states ps 
            ON t.mint_address = ps.pool_address
            WHERE EXISTS (
                SELECT 1 
                FROM token_platform.price_history price_hist 
                WHERE price_hist.token_address = t.mint_address
                LIMIT 1
            )
        `;

        // Get total count
        const countQuery = `
            SELECT 
                (SELECT COUNT(*) FROM token_platform.custom_tokens) +
                (SELECT COUNT(*) FROM token_platform.tokens t 
                 WHERE EXISTS (
                     SELECT 1 
                     FROM token_platform.price_history ph 
                     WHERE ph.mint_address = t.mint_address
                     LIMIT 1
                 )
                ) as total
        `;

        try {
            const [customTokens, poolTokens, totalCount] = await Promise.all([
                pool.query(customTokensQuery),
                pool.query(poolTokensQuery),
                pool.query(countQuery)
            ]);

            logger.info('Query results:', {
                customTokensCount: customTokens.rows.length,
                poolTokensCount: poolTokens.rows.length,
                total: totalCount.rows[0]?.total
            });

            // Combine results and apply pagination after combining
            const allTokens = [...customTokens.rows, ...poolTokens.rows]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(offset, offset + limit);

            const total = parseInt(totalCount.rows[0]?.total || '0');

            res.json({
                tokens: allTokens,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (dbError) {
            logger.error('Database query error:', dbError);
            throw dbError;
        }
    } catch (error) {
        logger.error('Error in /tokens route:', error);
        res.status(500).json({
            error: 'Failed to fetch tokens',
            details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

// For Lightweight Charts
router.get('/price-history/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const history = await PriceHistoryModel.getPriceHistory(mintAddress);
        res.json(history);
    } catch (error) {
        logger.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});

// For TradingView Advanced
router.get('/ohlcv/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { from, to, resolution } = req.query;
        const candles = await PriceHistoryModel.getOHLCV(
            mintAddress,
            resolution as string,
            Number(from),
            Number(to)
        );
        res.json(candles);
    } catch (error) {
        logger.error('Error fetching OHLCV:', error);
        res.status(500).json({ error: 'Failed to fetch OHLCV data' });
    }
});

// Get trade history
router.get('/trades/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { limit = '50' } = req.query;

        const trades = await pool.query(`
            SELECT 
                signature,
                wallet_address,
                side,
                amount,
                total,
                price,
                timestamp
            FROM token_platform.trades 
            WHERE token_address = $1 
            ORDER BY timestamp DESC 
            LIMIT $2
        `, [mintAddress, parseInt(limit as string)]);

        res.json(trades.rows);
    } catch (error) {
        logger.error('Error fetching trade history:', error);
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
});

// WebSocket status
router.get('/ws/status', async (_req, res) => {
    try {
        const status = heliusService.getStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error fetching WebSocket status:', error);
        res.status(500).json({ error: 'Failed to fetch WebSocket status' });
    }
});

export default router; 
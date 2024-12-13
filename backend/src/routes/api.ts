import cors from 'cors';
import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { HeliusManager } from '../services/price/websocket/heliusManager';
import rateLimit from 'express-rate-limit';
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
const priceQueue = PriceUpdateQueue.getInstance();

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,  // 1 minute window
    max: 300,                  // 300 requests per minute
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
            curveConfig
        } = req.body;

        // Simple insertion into custom_tokens only
        const result = await pool.query(`
            INSERT INTO token_platform.custom_tokens (
                mint_address,
                curve_address,
                name,
                symbol,
                description,
                metadata_url,
                curve_config
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            mintAddress,
            curveAddress,
            name,
            symbol,
            description,
            metadataUri,
            curveConfig
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error creating token:', error);
        res.status(500).json({ error: 'Failed to create token' });
    }
});

// Keep existing /tokens endpoint for TokenList component
router.get('/tokens', async (req, res) => {
    try {
        logger.info('Fetching custom tokens');
        const result = await pool.query(`
            SELECT * FROM token_platform.custom_tokens
            ORDER BY created_at DESC
        `);

        const tokens = result.rows.map(token => ({
            mintAddress: token.mint_address,
            curveAddress: token.curve_address,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token.description,
            metadataUri: token.metadata_url,
            curveConfig: token.curve_config,
            createdAt: token.created_at
        }));

        res.json({ tokens });
    } catch (error) {
        logger.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new endpoint for market page
router.get('/market/tokens',
    (req, res, next) => next(),
    async (req, res) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const offset = (page - 1) * limit;

            // Only fetch from tokens table (DEX tokens)
            const tokensQuery = `
                SELECT 
                    mint_address,
                    name,
                    symbol,
                    'pool' as token_type
                FROM token_platform.tokens
                WHERE name IS NOT NULL 
                AND symbol IS NOT NULL
                ORDER BY name ASC
                LIMIT $1 OFFSET $2
            `;

            const countQuery = `
                SELECT COUNT(*) 
                FROM token_platform.tokens
                WHERE name IS NOT NULL 
                AND symbol IS NOT NULL
            `;

            const [countResult, tokensResult] = await Promise.all([
                pool.query(countQuery),
                pool.query(tokensQuery, [limit, offset])
            ]);

            res.json({
                tokens: tokensResult.rows,
                pagination: {
                    total: parseInt(countResult.rows[0].count),
                    page,
                    limit
                }
            });
        } catch (error) {
            logger.error('Error fetching market tokens:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

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

// Add a new endpoint for getting a single custom token
router.get('/tokens/custom/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        logger.info(`Fetching custom token: ${mintAddress}`);

        const result = await pool.query(`
            SELECT * FROM token_platform.custom_tokens
            WHERE mint_address = $1
        `, [mintAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const token = result.rows[0];
        res.json({
            mintAddress: token.mint_address,
            curveAddress: token.curve_address,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token.description,
            metadataUri: token.metadata_url,
            curveConfig: token.curve_config,
            createdAt: token.created_at
        });
    } catch (error) {
        logger.error('Error fetching custom token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router; 
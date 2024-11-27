import express from 'express';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import { pool } from '../db/pool';
import { validateTokenData } from '../middleware/validation';
import { logger } from '../utils/logger';

const router = express.Router();
router.use(cors());

// Rate limiters
const priceLimiter = rateLimit({
    windowMs: 15 * 1000, // 15 seconds
    max: 20
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100
});

// Jupiter API endpoint
const JUPITER_PRICE_V2_API = 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';

// SOL price endpoint
router.get('/solana-price', priceLimiter, async (_req, res) => {
    try {
        const response = await fetch(JUPITER_PRICE_V2_API);
        if (!response.ok) {
            throw new Error(`Jupiter API returned status: ${response.status}`);
        }

        const data = await response.json();
        const price = parseFloat(data.data.So11111111111111111111111111111111111111112.price);

        res.json({ price });
    } catch (error) {
        logger.error('Error fetching SOL price:', error);
        res.status(500).json({
            error: 'Failed to fetch SOL price',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Token endpoints
router.post('/tokens', apiLimiter, validateTokenData, async (req, res) => {
    try {
        const result = await pool.query(
            `INSERT INTO token_platform.tokens 
             (mintAddress, curveAddress, name, symbol, description, totalSupply, 
              creatorAddress, curveType, basePrice, slope, exponent, logBase, metadataUri)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                req.body.mintAddress,
                req.body.curveAddress,
                req.body.name,
                req.body.symbol,
                req.body.description,
                req.body.totalSupply,
                req.body.creatorAddress,
                req.body.curveType,
                req.body.basePrice,
                req.body.slope,
                req.body.exponent,
                req.body.logBase,
                req.body.metadataUri
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error creating token:', error);
        res.status(500).json({ error: 'Failed to create token' });
    }
});

router.get('/tokens/:mintAddress', apiLimiter, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM token_platform.tokens WHERE mintAddress = $1`,
            [req.params.mintAddress]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Token not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching token:', error);
        res.status(500).json({ error: 'Failed to fetch token' });
    }
});

// Add this new endpoint near your other token endpoints
router.get('/tokens', apiLimiter, async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM token_platform.tokens ORDER BY created_at DESC`
        );

        if (!result) {
            throw new Error('Database query failed');
        }

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching tokens:', error);

        // More specific error handling
        if (error instanceof Error && 'code' in error && error.code === '42P01') {
            res.status(500).json({
                error: 'Database table not properly initialized',
                details: 'Please contact system administrator'
            });
        } else {
            res.status(500).json({
                error: 'Failed to fetch tokens',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }
});

// Trade history endpoint
router.post('/trades', apiLimiter, async (req, res) => {
    try {
        const result = await pool.query(
            `INSERT INTO token_platform.tradeHistory 
             (mintAddress, traderAddress, signature, amount, pricePerToken, 
              totalPrice, isBuy)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                req.body.mintAddress,
                req.body.traderAddress,
                req.body.signature,
                req.body.amount,
                req.body.pricePerToken,
                req.body.totalPrice,
                req.body.isBuy
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error recording trade:', error);
        res.status(500).json({ error: 'Failed to record trade' });
    }
});



export default router; 
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import { pool } from '../db/pool';
import { validateTokenData } from '../middleware/validation';
import { logger } from '../utils/logger';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { DexService } from '../services/dexService';

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
        // Log the exact request data
        console.log('Token creation request data:', {
            mintAddress: req.body.mintAddress,
            curveAddress: req.body.curveAddress,
            name: req.body.name,
            symbol: req.body.symbol,
            totalSupply: req.body.totalSupply,
            curveConfig: req.body.curveConfig
        });

        // Verify all required fields are present
        if (!req.body.mintAddress || !req.body.curveAddress || !req.body.name ||
            !req.body.symbol || !req.body.totalSupply || !req.body.curveConfig) {
            throw new Error('Missing required fields');
        }

        // Log the SQL query parameters
        const queryParams = [
            req.body.mintAddress,
            req.body.curveAddress,
            req.body.name,
            req.body.symbol,
            req.body.description || '',
            req.body.metadataUri || '',
            req.body.totalSupply,
            req.body.decimals || 9,
            JSON.stringify(req.body.curveConfig)  // Ensure curveConfig is stringified
        ];
        console.log('Query parameters:', queryParams);

        const result = await pool.query(
            `INSERT INTO token_platform.tokens 
             (mint_address, curve_address, name, symbol, description, 
              metadata_uri, total_supply, decimals, curve_config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            queryParams
        );

        if (!result.rows[0]) {
            throw new Error('No data returned from database insert');
        }

        console.log('Database insert successful:', result.rows[0]);

        const token = result.rows[0];
        res.status(201).json({
            id: token.id,
            mintAddress: token.mint_address,
            curveAddress: token.curve_address,
            name: token.name,
            symbol: token.symbol,
            description: token.description,
            metadataUri: token.metadata_uri,
            totalSupply: token.total_supply,
            decimals: token.decimals,
            curveConfig: token.curve_config,
            createdAt: token.created_at
        });
    } catch (error: any) {
        // Enhanced error logging
        console.error('Token creation error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            stack: error.stack,
            requestBody: req.body
        });

        res.status(500).json({
            error: 'Failed to create token',
            message: error.message,
            detail: error.detail || 'No additional details',
            code: error.code
        });
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
router.get('/tokens', apiLimiter, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM token_platform.tokens ORDER BY created_at DESC`
        );

        // Convert snake_case to camelCase
        const tokens = result.rows.map(token => ({
            id: token.id,
            mintAddress: token.mint_address,
            curveAddress: token.curve_address,
            name: token.name,
            symbol: token.symbol,
            description: token.description,
            metadataUri: token.metadata_uri,
            totalSupply: token.total_supply,
            decimals: token.decimals,
            creatorId: token.creator_id,
            network: token.network,
            curveConfig: token.curve_config,
            createdAt: token.created_at
        }));

        res.json(tokens);
    } catch (error) {
        logger.error('Error fetching tokens:', error);
        res.status(500).json({ error: 'Failed to fetch tokens' });
    }
});

// Add these routes to your existing router
router.post('/price-history', async (req, res) => {
    try {
        const { tokenMintAddress, price, totalSupply } = req.body;
        await PriceHistoryModel.recordPrice(tokenMintAddress, price, totalSupply);
        res.status(201).json({ success: true });
    } catch (error) {
        logger.error('Error recording price:', error);
        res.status(500).json({ error: 'Failed to record price' });
    }
});

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

const dexService = new DexService();

// Add these new routes after existing token routes
router.get('/dex/tokens', apiLimiter, async (req, res) => {
    try {
        const tokens = await dexService.getTopTokens();
        res.json(tokens);
    } catch (error) {
        logger.error('Error fetching DEX tokens:', error);
        res.status(500).json({ error: 'Failed to fetch DEX tokens' });
    }
});

router.get('/dex/price/:mintAddress', apiLimiter, async (req, res) => {
    try {
        const price = await dexService.getTokenPrice(req.params.mintAddress);
        res.json({ price });
    } catch (error) {
        logger.error('Error fetching token price:', error);
        res.status(500).json({ error: 'Failed to fetch token price' });
    }
});

// Add route to record DEX trade history
router.post('/dex/trades', apiLimiter, async (req, res) => {
    try {
        const { tokenMintAddress, price, amount, type } = req.body;
        await PriceHistoryModel.recordPrice(tokenMintAddress, price, amount);
        res.status(201).json({ success: true });
    } catch (error) {
        logger.error('Error recording DEX trade:', error);
        res.status(500).json({ error: 'Failed to record trade' });
    }
});

router.get('/dex/pool/:mintAddress', apiLimiter, async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const poolInfo = await dexService.getPoolInfo(mintAddress);
        res.json(poolInfo);
    } catch (error) {
        logger.error('Error fetching pool info:', error);
        res.status(500).json({ error: 'Failed to fetch pool info' });
    }
});

export default router; 
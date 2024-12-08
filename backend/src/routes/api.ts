import express from 'express';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import { pool } from '../db/pool';
import { validateTokenData } from '../middleware/validation';
import { logger } from '../utils/logger';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { TokenSyncJob } from '../jobs/tokenSync';

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
        const tokenType = req.query.type as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const query = tokenType
            ? `SELECT * FROM token_platform.tokens 
               WHERE token_type = $3
               ORDER BY created_at DESC 
               LIMIT $1 OFFSET $2`
            : `SELECT * FROM token_platform.tokens 
               ORDER BY created_at DESC 
               LIMIT $1 OFFSET $2`;

        const queryParams = tokenType
            ? [limit, offset, tokenType]
            : [limit, offset];

        const result = await pool.query(query, queryParams);

        // Get total count for pagination
        const countQuery = tokenType
            ? `SELECT COUNT(*) FROM token_platform.tokens 
               WHERE token_type = $1`
            : 'SELECT COUNT(*) FROM token_platform.tokens';

        const totalCount = await pool.query(countQuery, tokenType ? [tokenType] : []);
        const total = parseInt(totalCount.rows[0].count);

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
            createdAt: token.created_at,
            token_type: token.token_type
        }));

        res.json({
            tokens,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
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
        console.log('Fetching price history for:', mintAddress);

        const history = await PriceHistoryModel.getPriceHistory(mintAddress);
        console.log('Raw history from DB:', history);

        if (!history || !Array.isArray(history)) {
            console.warn('Invalid history data from DB:', history);
            return res.status(404).json({ error: 'No price history found' });
        }

        // Create a Map to handle duplicate timestamps
        const timestampMap = new Map();

        // Process each data point, keeping only the latest price for each timestamp
        history.forEach(point => {
            if (point && point.timestamp && point.price != null) {
                const timestamp = Math.floor(new Date(point.timestamp).getTime() / 1000);
                // Only update if this is a new timestamp or if it's more recent for the same timestamp
                if (!timestampMap.has(timestamp) || point.timestamp > timestampMap.get(timestamp).originalTimestamp) {
                    timestampMap.set(timestamp, {
                        timestamp,
                        price: Number(point.price),
                        originalTimestamp: point.timestamp
                    });
                }
            }
        });

        // Convert Map to array and sort by timestamp
        const formattedHistory = Array.from(timestampMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(({ timestamp, price }) => ({
                timestamp,
                price
            }));

        console.log('Formatted history:', formattedHistory);

        if (formattedHistory.length === 0) {
            return res.status(404).json({ error: 'No valid price history data' });
        }

        res.json(formattedHistory);
    } catch (error) {
        logger.error('Error fetching price history:', error);
        res.status(500).json({
            error: 'Failed to fetch price history',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.get('/prices/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;

        const result = await pool.query(`
            SELECT ts.price 
            FROM token_platform.tokens t
            JOIN token_platform.token_stats ts ON t.id = ts.token_id
            WHERE t.mint_address = $1
        `, [mintAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Token not found' });
        }

        res.json({ price: result.rows[0].price });
    } catch (error) {
        logger.error('Error fetching token price:', error);
        res.status(500).json({ error: 'Failed to fetch price' });
    }
});

// Add this endpoint to manually trigger a sync
router.post('/dex/sync', apiLimiter, async (_req, res) => {
    try {
        await TokenSyncJob.getInstance().startSync();
        res.json({ message: 'DEX sync triggered successfully' });
    } catch (error) {
        logger.error('Manual DEX sync failed:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

// Add this endpoint to check sync status
router.get('/dex/status', apiLimiter, async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) as count, 
                   MAX(ts.last_updated) as last_sync
            FROM token_platform.tokens t
            JOIN token_platform.token_stats ts ON t.id = ts.token_id
            WHERE t.token_type = 'dex'
        `);

        res.json({
            dexTokenCount: parseInt(result.rows[0].count),
            lastSync: result.rows[0].last_sync
        });
    } catch (error) {
        logger.error('Error fetching DEX status:', error);
        res.status(500).json({ error: 'Failed to fetch DEX status' });
    }
});

export default router; 
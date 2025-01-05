import cors from 'cors';
import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { HeliusManager } from '../services/price/websocket/heliusManager';
import rateLimit from 'express-rate-limit';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { RaydiumProcessor } from '../services/price/processors/raydiumProcessor';
import { BondingCurveProcessor } from '../services/price/processors/bondingCurveProcessor';

const router = Router();

// CORS and rate limiting setup
router.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const heliusService = HeliusManager.getInstance();

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
            }
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
            curveConfig,
            decimals,
            totalSupply,
            initialPrice
        } = req.body;

        const result = await pool.query(`
            INSERT INTO token_platform.tokens (
                mint_address,
                curve_address,
                name,
                symbol,
                description,
                website_url,
                docs_url,
                twitter_url,
                telegram_url,
                metadata_url,
                curve_config,
                decimals,
                token_type,
                supply
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'custom', $13)
            RETURNING *
        `, [
            mintAddress,
            curveAddress,
            name,
            symbol,
            description,
            req.body.websiteUrl || null,
            req.body.docsUrl || null,
            req.body.twitterUrl || null,
            req.body.telegramUrl || null,
            metadataUri,
            curveConfig,
            decimals,
            totalSupply
        ]);

        // Record the initial price
        await PriceHistoryModel.recordPrice({
            mintAddress,
            price: initialPrice,
            volume: 0,
            timestamp: new Date()
        });

        const token = result.rows[0];
        res.status(201).json({
            mintAddress: token.mint_address,
            curveAddress: token.curve_address,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token.description,
            metadataUri: token.metadata_url,
            curveConfig: token.curve_config,
            supply: token.supply,
            tokenType: token.token_type,
            createdAt: token.created_at
        });
    } catch (error) {
        logger.error('Error creating token:', error);
        res.status(500).json({ error: 'Failed to create token' });
    }
});

// Get custom tokens for homepage
router.get('/tokens', async (req, res) => {
    try {
        logger.info('Fetching custom tokens');
        const result = await pool.query(`
            SELECT * FROM token_platform.tokens
            WHERE token_type = 'custom'
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
            createdAt: token.created_at,
            tokenType: token.token_type,
            supply: token.supply,
            totalSupply: token.supply
        }));

        res.json({ tokens });
    } catch (error) {
        logger.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get DEX tokens for market page
router.get('/market/tokens', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;
        const type = req.query.type as string;

        // Debug log
        logger.info(`Fetching market tokens. Type: ${type}, Page: ${page}, Limit: ${limit}`);

        const tokensQuery = `
            SELECT 
                t.mint_address,
                t.name,
                t.symbol,
                t.decimals,
                t.token_type,
                t.verified,
                t.image_url,
                COALESCE(
                    (SELECT price FROM token_platform.price_history 
                     WHERE mint_address = t.mint_address 
                     ORDER BY time DESC LIMIT 1),
                    0
                ) as current_price,
                COALESCE(
                    (SELECT SUM(volume) FROM token_platform.price_history 
                     WHERE mint_address = t.mint_address 
                     AND time > NOW() - INTERVAL '24 hours'),
                    0
                ) as volume_24h
            FROM token_platform.tokens t
            ${type ? 'WHERE t.token_type = $3' : ''}
            ORDER BY t.verified DESC, t.name ASC NULLS LAST
            LIMIT $1 OFFSET $2
        `;

        // Debug log the query and parameters
        const params = type ? [limit, offset, type] : [limit, offset];
        logger.info(`Query params:`, params);

        const result = await pool.query(tokensQuery, params);

        // Debug log
        logger.info(`Found ${result.rows.length} tokens`);

        const countQuery = `
            SELECT COUNT(*) FROM token_platform.tokens
            ${type ? 'WHERE token_type = $1' : ''}
        `;

        const countResult = await pool.query(countQuery, type ? [type] : []);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            tokens: result.rows,
            pagination: {
                total,
                page,
                limit
            }
        });
    } catch (error) {
        logger.error('Error fetching market tokens:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single token (works for both custom and DEX tokens)
router.get('/tokens/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const result = await pool.query(`
            SELECT 
                t.*,
                COALESCE(
                    (SELECT price FROM token_platform.price_history 
                     WHERE mint_address = t.mint_address 
                     ORDER BY time DESC LIMIT 1),
                    0
                ) as current_price,
                COALESCE(
                    (SELECT SUM(volume) FROM token_platform.price_history 
                     WHERE mint_address = t.mint_address 
                     AND time > NOW() - INTERVAL '24 hours'),
                    0
                ) as volume_24h
            FROM token_platform.tokens t
            WHERE t.mint_address = $1`,
            [mintAddress]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const token = result.rows[0];
        res.json({
            mintAddress: token.mint_address,
            name: token.name?.trim(),
            symbol: token.symbol?.trim(),
            decimals: token.decimals,
            description: token.description || '',
            metadataUri: token.metadata_url,
            tokenType: token.token_type,
            verified: token.verified,
            imageUrl: token.image_url,
            attributes: token.attributes,
            content: token.content,
            authorities: token.authorities,
            compression: token.compression,
            grouping: token.grouping,
            royalty: token.royalty,
            creators: token.creators,
            ownership: token.ownership,
            supply: token.supply,
            mutable: token.mutable,
            burnt: token.burnt,
            tokenInfo: token.token_info,
            currentPrice: token.current_price,
            volume24h: token.volume_24h,
            offChainMetadata: token.off_chain_metadata,
            interface: token.interface,
            curveAddress: token.curve_address,
            curveConfig: token.curve_config,
            metadataStatus: token.metadata_status,
            metadataSource: token.metadata_source,
            metadataFetchAttempts: token.metadata_fetch_attempts,
            lastMetadataFetch: token.last_metadata_fetch,
            createdAt: token.created_at
        });
    } catch (error) {
        logger.error('Error fetching token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search endpoint (searches both custom and DEX tokens)
router.get('/search/tokens', async (req, res) => {
    try {
        const query = req.query.q as string;
        const type = req.query.type as string;

        if (!query || query.length < 1) {
            return res.json({ tokens: [] });
        }

        const searchQuery = `
            SELECT 
                mint_address,
                name,
                symbol,
                token_type,
                verified,
                image_url
            FROM token_platform.tokens 
            WHERE 
                (LOWER(name) LIKE LOWER($1) OR 
                LOWER(symbol) LIKE LOWER($1) OR 
                mint_address LIKE $2)
                ${type ? 'AND token_type = $3' : ''}
            AND name IS NOT NULL 
            AND symbol IS NOT NULL
            ORDER BY 
                verified DESC,
                name ASC
            LIMIT 10
        `;

        const params = type
            ? [`%${query}%`, `${query}%`, type]
            : [`%${query}%`, `${query}%`];

        const result = await pool.query(searchQuery, params);
        res.json({ tokens: result.rows });
    } catch (error) {
        logger.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// For Lightweight Charts
router.get('/price-history/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        logger.info(`Fetching price history for ${mintAddress}`);

        const history = await PriceHistoryModel.getPriceHistory(mintAddress);
        logger.info(`Found ${history.length} price points for ${mintAddress}`);

        // Log first and last points
        if (history.length > 0) {
            logger.info('First point:', history[0]);
            logger.info('Last point:', history[history.length - 1]);
        }

        res.json(history);
    } catch (error) {
        logger.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});

// Get latest price
router.get('/prices/:mintAddress/latest', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const result = await pool.query(`
            SELECT price 
            FROM token_platform.price_history 
            WHERE mint_address = $1 
            ORDER BY time DESC 
            LIMIT 1
        `, [mintAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No price data found' });
        }

        res.json({ price: Number(result.rows[0].price) });
    } catch (error) {
        logger.error('Error fetching latest price:', error);
        res.status(500).json({ error: 'Internal server error' });
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

router.get('/market/tokens/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        logger.info(`Fetching market token: ${mintAddress}`);

        const result = await pool.query(`
            SELECT 
                t.mint_address,
                t.name,
                t.symbol,
                t.decimals,
                t.metadata_url,
                t.description,
                t.verified,
                t.image_url,
                COALESCE(t.attributes, '{}') as attributes,
                COALESCE(
                    (SELECT price FROM token_platform.price_history 
                     WHERE mint_address = t.mint_address 
                     ORDER BY time DESC LIMIT 1),
                    0
                ) as current_price,
                COALESCE(
                    (SELECT SUM(volume) FROM token_platform.price_history 
                     WHERE mint_address = t.mint_address 
                     AND time > NOW() - INTERVAL '24 hours'),
                    0
                ) as volume_24h
            FROM token_platform.tokens t
            WHERE t.mint_address = $1
        `, [mintAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const token = result.rows[0];
        res.json({
            mint_address: token.mint_address,
            name: token.name?.trim(),
            symbol: token.symbol?.trim(),
            decimals: token.decimals,
            description: token.description || '',
            metadata_url: token.metadata_url,
            token_type: 'pool',
            current_price: token.current_price,
            volume_24h: token.volume_24h,
            verified: token.verified,
            image_url: token.image_url,
            attributes: token.attributes
        });
    } catch (error) {
        logger.error('Error fetching market token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/pools/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const result = await pool.query(`
            SELECT * FROM token_platform.raydium_pools 
            WHERE base_mint = $1 OR quote_mint = $1
            ORDER BY created_at DESC
        `, [mintAddress]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching pools:', error);
        res.status(500).json({ error: 'Failed to fetch pools' });
    }
});

router.post('/users', async (req, res) => {
    try {
        const { walletAddress } = req.body;

        const result = await pool.query(`
            INSERT INTO token_platform.users (wallet_address)
            VALUES ($1)
            ON CONFLICT (wallet_address) 
            DO UPDATE SET last_seen = CURRENT_TIMESTAMP
            RETURNING user_id, wallet_address, is_subscribed, subscription_expires_at, created_at, last_seen
        `, [walletAddress]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error creating/updating user:', error);
        res.status(500).json({ error: 'Failed to create/update user' });
    }
});

router.get('/users/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;

        const result = await pool.query(`
            SELECT user_id, wallet_address, is_subscribed, subscription_expires_at, created_at, last_seen
            FROM token_platform.users
            WHERE wallet_address = $1
        `, [walletAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

router.post('/users/:walletAddress/toggle-subscription', async (req, res) => {
    try {
        const { walletAddress } = req.params;

        const result = await pool.query(`
            UPDATE token_platform.users 
            SET 
                is_subscribed = NOT is_subscribed,
                subscription_expires_at = CASE 
                    WHEN NOT is_subscribed THEN CURRENT_TIMESTAMP + INTERVAL '365 days'
                    ELSE NULL 
                END
            WHERE wallet_address = $1
            RETURNING user_id, wallet_address, is_subscribed, subscription_expires_at, created_at, last_seen
        `, [walletAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error toggling subscription:', error);
        res.status(500).json({ error: 'Failed to toggle subscription' });
    }
});

router.post('/users/:walletAddress/trading-stats', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { mintAddress, totalVolume, isSelling } = req.body;

        // First get the user_id
        const userResult = await pool.query(`
            SELECT user_id FROM token_platform.users 
            WHERE wallet_address = $1
        `, [walletAddress]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].user_id;

        // Update trading stats
        await pool.query(`
            INSERT INTO token_platform.user_trading_stats (
                user_id, 
                mint_address, 
                total_trades,
                total_volume,
                total_buy_volume,
                total_sell_volume,
                first_trade_at,
                last_trade_at
            )
            VALUES ($1, $2, 1, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, mint_address) DO UPDATE
            SET 
                total_trades = token_platform.user_trading_stats.total_trades + 1,
                total_volume = token_platform.user_trading_stats.total_volume + $3,
                total_buy_volume = token_platform.user_trading_stats.total_buy_volume + $4,
                total_sell_volume = token_platform.user_trading_stats.total_sell_volume + $5,
                last_trade_at = CURRENT_TIMESTAMP,
                first_trade_at = COALESCE(token_platform.user_trading_stats.first_trade_at, CURRENT_TIMESTAMP)
        `, [
            userId,
            mintAddress,
            totalVolume, // Total volume in SOL
            isSelling ? 0 : totalVolume, // Buy volume
            isSelling ? totalVolume : 0  // Sell volume
        ]);

        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating trading stats:', error);
        res.status(500).json({ error: 'Failed to update trading stats' });
    }
});

router.get('/users/:walletAddress/trading-stats', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { mintAddress } = req.query;

        const userResult = await pool.query(`
            SELECT uts.*, t.symbol, t.name
            FROM token_platform.users u
            JOIN token_platform.user_trading_stats uts ON u.user_id = uts.user_id
            JOIN token_platform.tokens t ON uts.mint_address = t.mint_address
            WHERE u.wallet_address = $1
            ${mintAddress ? 'AND uts.mint_address = $2' : ''}
            ORDER BY uts.last_trade_at DESC
        `, mintAddress ? [walletAddress, mintAddress] : [walletAddress]);

        res.json(userResult.rows);
    } catch (error) {
        logger.error('Error fetching trading stats:', error);
        res.status(500).json({ error: 'Failed to fetch trading stats' });
    }
});

export default router; 
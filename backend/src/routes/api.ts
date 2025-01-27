import cors from 'cors';
import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { HeliusManager } from '../services/price/websocket/heliusManager';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { RaydiumProcessor } from '../services/price/processors/raydiumProcessor';
import { BondingCurveProcessor } from '../services/price/processors/bondingCurveProcessor';
import multer from 'multer';
import { pinataService } from '../services/pinataService';
import { heliusService as heliusRestService } from '../services/heliusService';
import { heliusService } from '../services/heliusService';
import { wsManager } from '../services/websocket/WebSocketManager';
import { generateNonce, authMiddleware, verifyWalletOwnership } from '../middleware/auth';
import { PublicKey } from '@solana/web3.js';
import jwt from 'jsonwebtoken';
import bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import { verify } from 'tweetnacl';
import { csrfProtection } from '../middleware/csrfProtection';


const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
let heliusManagerInstance: HeliusManager | null = null;
const getHeliusManager = () => {
    if (!heliusManagerInstance) {
        heliusManagerInstance = HeliusManager.getInstance();
    }
    return heliusManagerInstance;
};

// Authentication routes
router.post('/auth/nonce', csrfProtection, async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({
                status: 'error',
                message: 'Wallet address is required'
            });
        }

        const nonce = generateNonce(walletAddress);

        return res.json({ nonce });
    } catch (error) {
        console.error('Nonce generation error:', error);
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Something went wrong'
        });
    }
});

router.post('/auth/verify', csrfProtection, async (req, res) => {
    try {
        const { walletAddress, signature, nonce } = req.body;

        // Verify the signature
        const message = new TextEncoder().encode(
            `Sign this message to verify your wallet ownership. Nonce: ${nonce}`
        );

        const publicKey = new PublicKey(walletAddress);
        const signatureUint8 = bs58.decode(signature);

        if (!nacl.sign.detached.verify(message, signatureUint8, publicKey.toBytes())) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // After successful verification
        const token = jwt.sign({ walletAddress }, process.env.JWT_SECRET!, { expiresIn: '24h' });

        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            domain: process.env.NODE_ENV === 'production'
                ? '.onstrument.com'
                : 'localhost',
            path: '/',
            maxAge: 86400000
        });

        // Create user if not exists
        const userResult = await pool().query(`
            INSERT INTO onstrument.users (wallet_address)
            VALUES ($1)
            ON CONFLICT (wallet_address) DO NOTHING
            RETURNING *
        `, [walletAddress]);

        res.json({
            success: true,
            user: userResult.rows[0] || { walletAddress }
        });
    } catch (error) {
        logger.error('Verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// System status monitoring endpoint
router.get('/system/status', async (_req, res) => {
    try {
        const status = {
            websocket: getHeliusManager().getStatus(),
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
router.post('/tokens', authMiddleware, async (req, res) => {
    try {

        const {
            mintAddress,
            curveAddress,
            tokenVault,
            name,
            symbol,
            description,
            metadataUri,
            curveConfig,
            decimals,
            totalSupply,
            initialPrice,
            websiteUrl,
            twitterUrl,
            docsUrl,
            telegramUrl
        } = req.body;

        // Get current SOL price
        const solPriceResult = await pool().query(`
            SELECT current_price 
            FROM onstrument.tokens 
            WHERE mint_address = 'So11111111111111111111111111111111111111112'
            LIMIT 1
        `);

        const solanaPrice = solPriceResult.rows[0]?.current_price || 0;

        // Calculate USD values
        const initialPriceUsd = initialPrice * solanaPrice;
        const virtualSolana = 30;
        const initialMarketCapUsd = virtualSolana * solanaPrice;


        // Insert token
        const insertQuery = `
            INSERT INTO onstrument.tokens (
                mint_address,
                curve_address,
                token_vault,
                name,
                symbol,
                description,
                metadata_url,
                website_url,
                docs_url,
                twitter_url,
                telegram_url,
                curve_config,
                decimals,
                token_type,
                supply,
                market_cap_usd,
                current_price,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'custom', $14, $15, $16, CURRENT_TIMESTAMP)
            RETURNING *
        `;

        const values = [
            mintAddress,
            curveAddress,
            tokenVault,
            name,
            symbol,
            description,
            metadataUri,
            websiteUrl || null,
            docsUrl || null,
            twitterUrl || null,
            telegramUrl || null,
            curveConfig,
            decimals,
            totalSupply,
            initialMarketCapUsd,
            initialPriceUsd
        ];


        const result = await pool().query(insertQuery, values);

        // Record initial price
        if (initialPriceUsd && initialPriceUsd > 0) {
            const priceHistoryQuery = `
                INSERT INTO onstrument.price_history (
                    time,
                    mint_address,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    market_cap,
                    is_buy,
                    trade_count,
                    buy_count,
                    sell_count
                ) VALUES (
                    date_trunc('minute', CURRENT_TIMESTAMP),
                    $1,
                    $2,
                    $2,
                    $2,
                    $2,
                    0,
                    $3,
                    true,
                    1,
                    1,
                    0
                )
            `;

            await pool().query(priceHistoryQuery, [mintAddress, initialPriceUsd, initialMarketCapUsd]);
            console.log('Price history recorded');
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Token creation API error:', {
            error,
            message: (error as Error).message,
            stack: (error as Error).stack
        });
        res.status(500).json({ error: (error as Error).message });
    }
});

// Get custom tokens for homepage
router.get('/tokens', async (req, res) => {
    try {
        const sortBy = req.query.sortBy as '5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all' | 'newest' | 'oldest' | 'marketCap' || '24h';

        // Handle volume-based intervals
        const volumeInterval = {
            '5m': 'INTERVAL \'5 minutes\'',
            '30m': 'INTERVAL \'30 minutes\'',
            '1h': 'INTERVAL \'1 hour\'',
            '4h': 'INTERVAL \'4 hours\'',
            '12h': 'INTERVAL \'12 hours\'',
            '24h': 'INTERVAL \'24 hours\'',
            'all': null,
            'newest': null,
            'oldest': null,
            'marketCap': null
        }[sortBy];

        // Only include volume calculation if we're sorting by volume
        const volumeSelect = !['newest', 'oldest', 'marketCap'].includes(sortBy)
            ? `, COALESCE(
                    (SELECT SUM(volume) 
                     FROM onstrument.price_history 
                     WHERE mint_address = t.mint_address 
                     ${volumeInterval ? `AND time > NOW() - ${volumeInterval}` : ''}
                    ),
                    0
                ) as volume`
            : ', 0 as volume';

        // Determine the ORDER BY clause based on sortBy
        let orderByClause;
        switch (sortBy) {
            case 'newest':
                orderByClause = 'ORDER BY t.created_at DESC';
                break;
            case 'oldest':
                orderByClause = 'ORDER BY t.created_at ASC';
                break;
            case 'marketCap':
                orderByClause = 'ORDER BY t.market_cap_usd DESC NULLS LAST';
                break;
            default:
                orderByClause = 'ORDER BY volume DESC NULLS LAST';
        }

        const result = await pool().query(`
            SELECT 
                t.mint_address,
                t.curve_address,
                t.name,
                t.symbol,
                t.decimals,
                t.description,
                t.metadata_url,
                t.curve_config,
                t.created_at,
                t.token_type,
                t.supply,
                t.current_price,
                t.market_cap_usd as "marketCapUsd"
                ${volumeSelect}
            FROM onstrument.tokens t
            WHERE t.token_type = 'custom'
            ${orderByClause}
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
            totalSupply: token.supply,
            volume: Number(token.volume || 0),
            currentPrice: Number(token.current_price || 0),
            marketCapUsd: token.marketCapUsd ? Number(token.marketCapUsd) : null
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
        const sortBy = req.query.sortBy as string || 'volume24h';

        // Build the WHERE clause for token type
        const typeWhere = 'WHERE t.token_type = \'dex\'';  // Always filter for DEX tokens only

        // Define the ORDER BY clause based on sortBy
        let orderByClause;
        let additionalSelect = '';

        switch (sortBy) {
            case 'marketCapUsd':
                orderByClause = 'ORDER BY t.market_cap_usd DESC NULLS LAST';
                break;
            case 'volume5m':
                additionalSelect = ', COALESCE(t.volume_5m, 0) as volume';
                orderByClause = 'ORDER BY volume DESC';
                break;
            case 'volume1h':
                additionalSelect = ', COALESCE(t.volume_1h, 0) as volume';
                orderByClause = 'ORDER BY volume DESC';
                break;
            case 'volume24h':
                additionalSelect = ', COALESCE(t.volume_24h, 0) as volume';
                orderByClause = 'ORDER BY volume DESC';
                break;
            case 'priceChange24h':
                orderByClause = 'ORDER BY t.price_change_24h DESC NULLS LAST';
                break;
            default:
                orderByClause = 'ORDER BY t.volume_24h DESC NULLS LAST';
        }

        // Get total count
        const countResult = await pool().query(`
            SELECT COUNT(*) FROM onstrument.tokens t ${typeWhere}
        `);
        const totalCount = parseInt(countResult.rows[0].count);

        // Get paginated results
        const query = `
            SELECT 
                t.mint_address,
                t.name,
                t.symbol,
                t.token_type,
                t.verified,
                t.image_url,
                t.current_price,
                t.market_cap_usd,
                t.volume_5m,
                t.volume_1h,
                t.volume_24h,
                t.volume_7d,
                t.price_change_5m,
                t.price_change_1h,
                t.price_change_24h,
                t.price_change_7d,
                t.created_at
                ${additionalSelect}
            FROM onstrument.tokens t
            WHERE t.token_type = 'dex'
            AND t.name IS NOT NULL 
            AND t.name != ''
            AND t.symbol IS NOT NULL 
            AND t.symbol != ''
            ${orderByClause}
            LIMIT $1 OFFSET $2
        `;

        const result = await pool().query(query, [limit, offset]);

        res.json({
            tokens: result.rows.map(token => ({
                mintAddress: token.mint_address,
                name: token.name,
                symbol: token.symbol,
                tokenType: token.token_type,
                verified: token.verified,
                imageUrl: token.image_url,
                currentPrice: token.current_price,
                marketCapUsd: token.market_cap_usd ? Number(token.market_cap_usd) : null,
                volume5m: token.volume_5m,
                volume1h: token.volume_1h,
                volume24h: token.volume_24h,
                volume7d: token.volume_7d,
                priceChange5m: token.price_change_5m,
                priceChange1h: token.price_change_1h,
                priceChange24h: token.price_change_24h,
                priceChange7d: token.price_change_7d,
                createdAt: token.created_at
            })),
            pagination: {
                total: totalCount,
                page,
                limit
            }
        });
    } catch (error) {
        logger.error('Error fetching market tokens:', error);
        res.status(500).json({ error: 'Failed to fetch market tokens' });
    }
});

// Get single token (works for both custom and DEX tokens)
router.get('/tokens/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;

        const query = `
            SELECT * FROM onstrument.tokens 
            WHERE mint_address = $1
        `;

        const result = await pool().query(query, [mintAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Token not found'
            });
        }

        const token = result.rows[0];
        return res.json(token);

    } catch (error) {
        console.error('Detailed error in /tokens/:mintAddress:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
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
            FROM onstrument.tokens 
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

        const result = await pool().query(searchQuery, params);
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
        const history = await PriceHistoryModel.getPriceHistory(mintAddress);
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
        const result = await pool().query(`
            SELECT 
                time,
                close as price,
                volume,
                market_cap,
                is_buy
            FROM onstrument.price_history 
            WHERE mint_address = $1 
            ORDER BY time DESC 
            LIMIT 1
        `, [mintAddress]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No price data found' });
        }

        const latestPrice = result.rows[0];
        res.json({
            time: latestPrice.time,
            price: latestPrice.price,
            volume: latestPrice.volume,
            marketCap: latestPrice.market_cap,
            isBuy: latestPrice.is_buy
        });
    } catch (error) {
        logger.error('Error fetching latest price:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// For TradingView chart
router.get('/ohlcv/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { resolution, from, to } = req.query;

        const data = await PriceHistoryModel.getOHLCV(
            mintAddress,
            resolution as string,
            Number(from),
            Number(to)
        );

        res.json(data);
    } catch (error) {
        console.error('Error in OHLCV endpoint:', error);
        res.status(500).json({ error: 'Failed to fetch OHLCV data' });
    }
});

// Get trade history
router.get('/trades/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { limit = '50' } = req.query;

        const trades = await pool().query(`
            SELECT 
                signature,
                wallet_address,
                side,
                amount,
                total,
                price,
                timestamp
            FROM onstrument.trades 
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
        const status = getHeliusManager().getStatus();
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

        const result = await pool().query(`
            SELECT * FROM onstrument.custom_tokens
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

        const result = await pool().query(`
            SELECT 
                t.mint_address,
                t.name,
                t.symbol,
                t.decimals,
                t.metadata_url,
                t.description,
                t.verified,
                t.image_url,
                t.token_type,
                t.curve_config,
                COALESCE(t.attributes, '{}') as attributes,
                COALESCE(
                    (SELECT price FROM onstrument.price_history 
                     WHERE mint_address = t.mint_address 
                     ORDER BY time DESC LIMIT 1),
                    0
                ) as current_price,
                COALESCE(
                    (SELECT SUM(volume) FROM onstrument.price_history 
                     WHERE mint_address = t.mint_address 
                     AND time > NOW() - INTERVAL '24 hours'),
                    0
                ) as volume_24h
            FROM onstrument.tokens t
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
            token_type: token.token_type,
            curve_address: token.curve_address,
            token_vault: token.token_vault,
            curve_config: token.curve_config,
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
        const result = await pool().query(`
            SELECT * FROM onstrument.raydium_pools 
            WHERE base_mint = $1 OR quote_mint = $1
            ORDER BY created_at DESC
        `, [mintAddress]);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching pools:', error);
        res.status(500).json({ error: 'Failed to fetch pools' });
    }
});

router.get('/users/:walletAddress', [authMiddleware, verifyWalletOwnership], async (req, res) => {
    try {
        const { walletAddress } = req.params;

        const result = await pool().query(`
            SELECT user_id, wallet_address, is_subscribed, subscription_expires_at, created_at, last_seen
            FROM onstrument.users
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

router.post('/users/:walletAddress/toggle-subscription', [authMiddleware, verifyWalletOwnership], async (req, res) => {
    try {
        const { walletAddress } = req.params;

        const result = await pool().query(`
            UPDATE onstrument.users 
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

        // Get SOL price from database
        const solPriceResult = await pool().query(`
            SELECT current_price 
            FROM onstrument.tokens 
            WHERE mint_address = 'So11111111111111111111111111111111111111112'
            LIMIT 1
        `);
        const solPrice = solPriceResult.rows[0].current_price;

        // Convert volume to USD
        const volumeUsd = totalVolume * solPrice;

        // First get the user_id
        const userResult = await pool().query(`
            SELECT user_id FROM onstrument.users 
            WHERE wallet_address = $1
        `, [walletAddress]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].user_id;

        // Update trading stats with USD values
        await pool().query(`
            INSERT INTO onstrument.user_trading_stats (
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
                total_trades = onstrument.user_trading_stats.total_trades + 1,
                total_volume = onstrument.user_trading_stats.total_volume + $3,
                total_buy_volume = onstrument.user_trading_stats.total_buy_volume + $4,
                total_sell_volume = onstrument.user_trading_stats.total_sell_volume + $5,
                last_trade_at = CURRENT_TIMESTAMP,
                first_trade_at = COALESCE(onstrument.user_trading_stats.first_trade_at, CURRENT_TIMESTAMP)
        `, [
            userId,
            mintAddress,
            volumeUsd,         // Total volume in USD
            isSelling ? 0 : volumeUsd,  // Buy volume in USD
            isSelling ? volumeUsd : 0   // Sell volume in USD
        ]);

        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating trading stats:', error);
        res.status(500).json({ error: 'Failed to update trading stats' });
    }
});

router.get('/users/:walletAddress/trading-stats', [authMiddleware, verifyWalletOwnership], async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { mintAddress } = req.query;

        const userResult = await pool().query(`
            SELECT uts.*, t.symbol, t.name
            FROM onstrument.users u
            JOIN onstrument.user_trading_stats uts ON u.user_id = uts.user_id
            JOIN onstrument.tokens t ON uts.mint_address = t.mint_address
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

// File upload endpoint
router.post('/upload/image', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }
        const imageUrl = await pinataService.uploadImage(req.file);
        res.json({ url: imageUrl });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Metadata upload endpoint
router.post('/upload/metadata', async (req, res) => {
    try {
        const metadata = req.body;
        const metadataUrl = await pinataService.uploadMetadata(metadata);
        res.json({ url: metadataUrl });
    } catch (error) {
        console.error('Metadata upload error:', error);
        res.status(500).json({ error: 'Failed to upload metadata' });
    }
});

// Helius proxy endpoint
router.post('/helius/assets', async (req, res) => {
    try {
        const { walletAddress, isDevnet } = req.body;
        const assets = await heliusRestService.getAssetsByOwner(walletAddress, isDevnet);
        res.json(assets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// Helius RPC proxy endpoint
router.post('/helius/rpc', async (req, res) => {
    try {
        const response = await heliusService.makeRpcRequest(req.body);
        res.json(response);
    } catch (error) {
        console.error('Helius RPC error:', error);
        res.status(500).json({ error: 'Failed to process RPC request' });
    }
});

// Helius Devnet RPC proxy endpoint
router.post('/helius/devnet/rpc', async (req, res) => {
    try {
        const response = await heliusService.makeRpcRequest({ ...req.body, isDevnet: true });
        res.json(response);
    } catch (error) {
        logger.error('Helius Devnet RPC error:', error);
        res.status(500).json({ error: 'Failed to process RPC request' });
    }
});

// Add WebSocket health check endpoint
router.get('/ws/health', (req, res) => {
    const stats = wsManager.getStats();
    res.json({
        status: 'ok',
        connections: stats.totalConnections
    });
});

// Add subscription check endpoint
router.get('/subscription/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;

        const result = await pool().query(`
            SELECT 
                is_subscribed, 
                subscription_expires_at,
                subscription_tier,
                golden_points
            FROM onstrument.users 
            WHERE wallet_address = $1
        `, [walletAddress]);

        if (result.rows.length === 0) {
            return res.json({
                isSubscribed: false,
                tier: null,
                goldenPoints: 0
            });
        }

        const user = result.rows[0];
        const isSubscribed = user.is_subscribed &&
            (!user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date());

        res.json({
            isSubscribed,
            tier: user.subscription_tier,
            goldenPoints: user.golden_points
        });
    } catch (error) {
        logger.error('Error checking subscription:', error);
        res.status(500).json({ error: 'Failed to check subscription status' });
    }
});

router.post('/users/:walletAddress/activate-subscription', async (req, res) => {
    const client = await pool().connect();
    try {
        await client.query('BEGIN');

        const { walletAddress } = req.params;
        const { durationMonths, paymentTxId, tierType, amountPaid, goldenPoints } = req.body;

        // Get user
        const userResult = await client.query(
            'SELECT user_id FROM onstrument.users WHERE wallet_address = $1',
            [walletAddress]
        );

        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }

        const userId = userResult.rows[0].user_id;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

        // Update user subscription status AND golden points
        await client.query(`
            UPDATE onstrument.users 
            SET 
                is_subscribed = true,
                subscription_expires_at = $1,
                subscription_tier = $2,
                golden_points = golden_points + $3
            WHERE user_id = $4
        `, [expiresAt, tierType, goldenPoints, userId]);

        // Insert subscription history
        await client.query(
            `INSERT INTO onstrument.subscription_history 
            (user_id, payment_tx_id, tier_type, amount_paid, duration_months, expires_at) 
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, paymentTxId, tierType, amountPaid, durationMonths, expiresAt]
        );

        // Get updated user data
        const updatedUser = await client.query(
            `SELECT * FROM onstrument.users WHERE user_id = $1`,
            [userId]
        );

        await client.query('COMMIT');
        res.json(updatedUser.rows[0]);

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error activating subscription:', error);
        res.status(500).json({ error: 'Failed to activate subscription' });
    } finally {
        client.release();
    }
});

router.post('/tokens/update-metadata', csrfProtection, async (req, res) => {
    try {
        const { mint_address, twitter_url, telegram_url, website_url, image_url } = req.body;

        const query = `
            UPDATE onstrument.tokens 
            SET 
                twitter_url = COALESCE($1, twitter_url),
                telegram_url = COALESCE($2, telegram_url),
                website_url = COALESCE($3, website_url),
                image_url = COALESCE($4, image_url)
            WHERE mint_address = $5
            RETURNING *;
        `;

        const result = await pool().query(query, [
            twitter_url,
            telegram_url,
            website_url,
            image_url,
            mint_address
        ]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating token metadata:', error);
        res.status(500).json({ error: 'Failed to update token metadata' });
    }
});

// Add a new endpoint to check and update subscription status
router.post('/users/:walletAddress/check-subscription', csrfProtection, async (req, res) => {
    try {
        const { walletAddress } = req.params;

        // First check if user exists, create if not
        const userResult = await pool().query(`
            INSERT INTO onstrument.users (wallet_address)
            VALUES ($1)
            ON CONFLICT (wallet_address) 
            DO UPDATE SET last_seen = CURRENT_TIMESTAMP
            RETURNING is_subscribed, subscription_expires_at, subscription_tier
        `, [walletAddress]);

        const user = userResult.rows[0];
        const isExpired = user.subscription_expires_at &&
            new Date(user.subscription_expires_at) <= new Date();

        // If subscription is expired, update the subscription status
        if (isExpired) {
            await pool().query(`
                UPDATE onstrument.users 
                SET is_subscribed = false
                WHERE wallet_address = $1
            `, [walletAddress]);
            user.is_subscribed = false;
        }

        res.json({
            isSubscribed: user.is_subscribed,
            isExpired,
            expiresAt: user.subscription_expires_at,
            tier: user.subscription_tier
        });

    } catch (error) {
        logger.error('Error checking subscription:', error);
        res.status(500).json({ error: 'Failed to check subscription status' });
    }
});

router.post('/users', csrfProtection, async (req, res) => {
    try {
        const { walletAddress } = req.body;

        // Only create/update the user, don't generate auth token
        const result = await pool().query(`
            INSERT INTO onstrument.users (wallet_address)
            VALUES ($1)
            ON CONFLICT (wallet_address) 
            DO UPDATE SET last_seen = CURRENT_TIMESTAMP
            RETURNING *
        `, [walletAddress]);

        // Remove the token generation and cookie setting
        res.status(201).json(result.rows[0]);

    } catch (error) {
        logger.error('User creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

export default router; 
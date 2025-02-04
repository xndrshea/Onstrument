import cors from 'cors';
import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { HeliusManager } from '../services/price/websocket/heliusManager';
import { PriceHistoryModel } from '../models/priceHistoryModel';
import { RaydiumStateProcessor } from '../services/price/processors/raydiumStateProcessor';
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

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

let heliusManagerInstance: HeliusManager | null = null;
const getHeliusManager = () => {
    if (!heliusManagerInstance) {
        heliusManagerInstance = HeliusManager.getInstance();
    }
    return heliusManagerInstance;
};

// Authentication routes
router.post('/auth/nonce', async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({
                status: 'error',
                message: 'Wallet address is required'
            });
        }

        try {
            const nonce = generateNonce(walletAddress);
            return res.json({ nonce });
        } catch (nonceError) {
            console.error('Nonce generation error:', nonceError);
            return res.status(500).json({
                status: 'error',
                message: 'Failed to generate nonce'
            });
        }
    } catch (error) {
        console.error('Nonce endpoint error:', error);
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Something went wrong'
        });
    }
});

router.post('/auth/verify', async (req, res) => {
    try {
        const { walletAddress, signature, nonce } = req.body;

        // Log incoming data
        logger.info('Verify attempt:', {
            hasWalletAddress: !!walletAddress,
            hasSignature: !!signature,
            hasNonce: !!nonce,
            walletAddressLength: walletAddress?.length,
            signatureLength: signature?.length
        });

        if (!walletAddress || !signature || !nonce) {
            logger.error('Missing required fields:', { walletAddress, signature, nonce });
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            // Verify the signature
            const message = new TextEncoder().encode(
                `Sign this message to verify your wallet ownership. Nonce: ${nonce}`
            );

            const publicKey = new PublicKey(walletAddress);
            const signatureUint8 = bs58.decode(signature);

            logger.info('Verification details:', {
                messageLength: message.length,
                message: Buffer.from(message).toString('hex'),
                publicKeyBytes: publicKey.toBytes().length,
                signatureBytes: signatureUint8.length
            });

            const isValid = nacl.sign.detached.verify(
                message,
                signatureUint8,
                publicKey.toBytes()
            );

            if (!isValid) {
                logger.error('Invalid signature:', {
                    message: Buffer.from(message).toString('hex'),
                    signature: Buffer.from(signatureUint8).toString('hex'),
                    publicKey: publicKey.toString()
                });
                return res.status(401).json({ error: 'Invalid signature' });
            }

        } catch (verifyError) {
            logger.error('Signature verification error:', {
                error: verifyError instanceof Error ? verifyError.message : 'Unknown error',
                stack: verifyError instanceof Error ? verifyError.stack : undefined
            });
            return res.status(500).json({ error: 'Signature verification failed' });
        }

        // Add timestamp and random session ID to make token unique
        const tokenPayload = {
            walletAddress,
            timestamp: Date.now(),
            sessionId: Math.random().toString(36).substring(2)
        };

        // After successful verification
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET!, { expiresIn: '24h' });

        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            domain: process.env.NODE_ENV === 'production'
                ? '.onstrument.com'
                : undefined,
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
        logger.error('Auth endpoint error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            body: req.body
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// System status monitoring endpoint
router.get('/system/status', async (_req, res) => {
    try {
        const status = {
            websocket: getHeliusManager().getStatus(),
            processors: {
                raydium: RaydiumStateProcessor.getStatus(),
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
            telegramUrl,
            // Project data
            projectCategory,
            teamMembers,
            isAnonymous,
            projectTitle,
            projectDescription,
            projectStory
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

        // Start a transaction since we're making multiple related updates
        const client = await pool().connect();
        try {
            await client.query('BEGIN');

            // Insert token (existing logic)
            const insertTokenQuery = `
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
                    created_at,
                    project_category,
                    team_members,
                    is_anonymous,
                    project_title,
                    project_description,
                    project_story
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'custom', $14, $15, $16, 
                    CURRENT_TIMESTAMP, $17, $18, $19, $20, $21, $22
                )
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
                initialPriceUsd,
                projectCategory,
                JSON.stringify(teamMembers),
                isAnonymous,
                projectTitle,
                projectDescription,
                projectStory
            ];

            console.log('About to execute query with values:', values);

            const result = await client.query(insertTokenQuery, values);
            console.log('Query result:', result.rows[0]);

            // Record initial price (existing logic)
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
                        $1, $2, $2, $2, $2, 0, $3,
                        true, 1, 1, 0
                    )
                `;

                await client.query(priceHistoryQuery, [mintAddress, initialPriceUsd, initialMarketCapUsd]);
            }

            await client.query('COMMIT');
            res.json(result.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Token creation API error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// Get custom tokens for homepage
router.get('/tokens', async (req, res) => {
    try {
        const { sortBy = 'newest', page = 1, limit = 100 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let countQuery = `
            SELECT COUNT(*) 
            FROM onstrument.tokens 
            WHERE token_type = 'custom'
        `;

        // Get total count first
        const countResult = await pool().query(countQuery);
        const total = parseInt(countResult.rows[0].count);

        let query;
        if (sortBy === 'newest') {
            query = `
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
                    t.market_cap_usd as "marketCapUsd",
                    COALESCE(vd.total_volume, 0) as volume
                FROM onstrument.tokens t
                LEFT JOIN (
                    SELECT mint_address, SUM(volume) as total_volume
                    FROM onstrument.price_history_1d
                    WHERE bucket > NOW() - INTERVAL '24 hours'
                    GROUP BY mint_address
                ) vd ON t.mint_address = vd.mint_address
                WHERE t.token_type = 'custom'
                ORDER BY t.created_at DESC
                LIMIT $1 OFFSET $2
            `;
        } else if (sortBy === 'oldest') {
            query = `
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
                    t.market_cap_usd as "marketCapUsd",
                    COALESCE(vd.total_volume, 0) as volume
                FROM onstrument.tokens t
                LEFT JOIN (
                    SELECT mint_address, SUM(volume) as total_volume
                    FROM onstrument.price_history_1d
                    WHERE bucket > NOW() - INTERVAL '24 hours'
                    GROUP BY mint_address
                ) vd ON t.mint_address = vd.mint_address
                WHERE t.token_type = 'custom'
                ORDER BY t.created_at ASC
                LIMIT $1 OFFSET $2
            `;
        } else if (sortBy === 'marketCapUsd') {
            query = `
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
                    t.market_cap_usd as "marketCapUsd",
                    0 as volume
                FROM onstrument.tokens t
                WHERE t.token_type = 'custom'
                ORDER BY t.market_cap_usd DESC NULLS LAST
                LIMIT $1 OFFSET $2
            `;
        } else {
            // Volume-based sorting
            const volumeInterval = {
                '5m': "NOW() - INTERVAL '5 minutes'",
                '30m': "NOW() - INTERVAL '30 minutes'",
                '1h': "NOW() - INTERVAL '1 hour'",
                '4h': "NOW() - INTERVAL '4 hours'",
                '12h': "NOW() - INTERVAL '12 hours'",
                '24h': "NOW() - INTERVAL '24 hours'",
                'all': null
            }[sortBy as string];

            query = `
                WITH volume_data AS (
                    SELECT 
                        mint_address,
                        SUM(volume) as total_volume
                    FROM onstrument.price_history
                    ${volumeInterval ? `WHERE time > ${volumeInterval}` : ''}
                    GROUP BY mint_address
                )
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
                    t.market_cap_usd as "marketCapUsd",
                    COALESCE(vd.total_volume, 0) as volume
                FROM onstrument.tokens t
                LEFT JOIN volume_data vd ON t.mint_address = vd.mint_address
                WHERE t.token_type = 'custom'
                ORDER BY volume DESC
                LIMIT $1 OFFSET $2
            `;
        }

        const result = await pool().query(query, [limit, offset]);

        const tokens = result.rows.map((token: any) => ({
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

        res.json({
            tokens,
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit))
        });
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

        const tokenQuery = `
            SELECT 
                t.*,
                t.project_category,
                t.team_members,
                t.is_anonymous,
                t.project_title,
                t.project_description,
                t.project_story
            FROM onstrument.tokens t
            WHERE t.mint_address = $1
        `;

        const result = await pool().query(tokenQuery, [mintAddress]);

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
                image_url,
                volume_24h
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
                volume_24h DESC,
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

router.get('/users/:walletAddress', async (req, res) => {
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

router.post('/users/:walletAddress/toggle-subscription', ...[authMiddleware, verifyWalletOwnership], async (req, res) => {
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

router.post('/users/:walletAddress/trading-stats', ...[authMiddleware, verifyWalletOwnership], async (req, res) => {
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

router.get('/users/:walletAddress/trading-stats', ...[authMiddleware, verifyWalletOwnership], async (req, res) => {
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

// Update the file upload endpoint to explicitly handle SVG files as well
router.post('/upload/image', async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                error: 'Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG images are allowed.'
            });
        }

        const imageUrl = await pinataService.uploadImage(req.file);
        res.json({ url: imageUrl });
    } catch (error) {
        logger.error('Image upload error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            fileInfo: req.file ? {
                mimetype: req.file.mimetype,
                size: req.file.size,
                originalname: req.file.originalname
            } : null
        });
        res.status(500).json({
            error: 'Failed to upload image',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Metadata upload endpoint
router.post('/upload/metadata', async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ error: 'No metadata provided' });
        }

        const metadata = req.body;
        logger.debug('Attempting to upload metadata:', {
            metadata: {
                ...metadata,
                image: metadata.image ? '[TRUNCATED]' : null // Don't log full image data
            }
        });

        const metadataUrl = await pinataService.uploadMetadata(metadata);

        if (!metadataUrl) {
            throw new Error('Failed to get metadata URL from Pinata');
        }

        res.json({ url: metadataUrl });
    } catch (error) {
        logger.error('Metadata upload error:', {
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack
            } : error,
            body: req.body
        });

        // Send more specific error message
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to upload metadata',
            details: 'Error occurred while uploading to Pinata'
        });
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

router.post('/auth/logout', (req, res) => {
    try {
        res.header('Access-Control-Allow-Origin', process.env.NODE_ENV === 'production'
            ? 'https://onstrument.com'
            : 'http://localhost:3000');
        res.header('Access-Control-Allow-Credentials', 'true');

        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            domain: process.env.NODE_ENV === 'production'
                ? '.onstrument.com'
                : 'localhost',
            path: '/'
        });

        res.json({ success: true });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
});

router.get('/auth/verify-silent', async (req, res) => {
    try {
        const token = req.cookies.authToken;
        if (!token) return res.json({ valid: false });

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { walletAddress: string };
        res.json({ valid: decoded.walletAddress === req.query.wallet });
    } catch (error) {
        res.json({ valid: false });
    }
});

router.get('/price-history/:mintAddress/volume', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const period = req.query.period as '5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all';
        const volume = await PriceHistoryModel.getVolumeStats(mintAddress, period);
        res.json({ volume });
    } catch (error) {
        logger.error('Error fetching volume:', error);
        res.status(500).json({ error: 'Failed to fetch volume' });
    }
});

// Add favorite token
router.post('/favorites', ...[authMiddleware, csrfProtection], async (req, res) => {
    try {

        const { mintAddress } = req.body;
        const userResult = await pool().query(
            'SELECT user_id FROM onstrument.users WHERE wallet_address = $1',
            [req.user?.walletAddress]
        );
        const userId = userResult.rows[0].user_id;

        await pool().query(
            `INSERT INTO onstrument.user_favorites (user_id, mint_address)
             VALUES ($1, $2)
             ON CONFLICT (user_id, mint_address) DO NOTHING`,
            [userId, mintAddress]
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

// Remove favorite token
router.delete('/favorites/:mintAddress', ...[authMiddleware, csrfProtection], async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const userResult = await pool().query(
            'SELECT user_id FROM onstrument.users WHERE wallet_address = $1',
            [req.user?.walletAddress]
        );
        const userId = userResult.rows[0].user_id;

        await pool().query(
            `DELETE FROM onstrument.user_favorites
             WHERE user_id = $1 AND mint_address = $2`,
            [userId, mintAddress]
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

// Get user's favorite tokens
router.get('/favorites', authMiddleware, async (req, res) => {
    try {
        const userResult = await pool().query(
            'SELECT user_id FROM onstrument.users WHERE wallet_address = $1',
            [req.user?.walletAddress]
        );
        const userId = userResult.rows[0].user_id;

        const result = await pool().query(
            `SELECT t.* 
             FROM onstrument.tokens t
             JOIN onstrument.user_favorites f ON t.mint_address = f.mint_address
             WHERE f.user_id = $1`,
            [userId]
        );

        res.json({ tokens: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

export default router; 
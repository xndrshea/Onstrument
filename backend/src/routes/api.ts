import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { WebSocketService } from '../services/websocketService';
import { DexService } from '../services/dexService';
import { PriceService } from '../services/PriceService';
import { Connection, clusterApiUrl } from '@solana/web3.js';

const router = Router();
const wsService = WebSocketService.getInstance();
const connection = new Connection(clusterApiUrl('devnet'));
const dexService = DexService.getInstance(connection);
const priceService = PriceService.getInstance();

// Get all tokens (both Raydium and custom)
router.get('/tokens', async (req, res) => {
    try {
        const { type = 'all' } = req.query;
        console.log('Received token request with type:', type);

        let query = '';

        if (type === 'dex') {
            query = `
                SELECT 
                    rt.*,
                    ts.volume_24h,
                    ts.liquidity,
                    'dex' as token_type,
                    NULL as curve_address,
                    NULL as curve_config
                FROM token_platform.raydium_tokens rt
                LEFT JOIN token_platform.token_stats ts ON rt.mint_address = ts.mint_address
                ORDER BY ts.volume_24h DESC NULLS LAST
            `;
        } else if (type === 'custom') {
            query = `
                SELECT 
                    ct.*,
                    ts.volume_24h,
                    ts.liquidity,
                    'custom' as token_type,
                    ct.curve_address,
                    ct.curve_config
                FROM token_platform.custom_tokens ct
                LEFT JOIN token_platform.token_stats ts ON ct.mint_address = ts.mint_address
                ORDER BY ts.volume_24h DESC NULLS LAST
            `;
        } else {
            query = `
                SELECT 
                    COALESCE(rt.mint_address, ct.mint_address) as mint_address,
                    COALESCE(rt.name, ct.name) as name,
                    COALESCE(rt.symbol, ct.symbol) as symbol,
                    ts.volume_24h,
                    ts.liquidity,
                    CASE 
                        WHEN rt.mint_address IS NOT NULL THEN 'dex'
                        ELSE 'custom'
                    END as token_type,
                    ct.curve_address,
                    ct.curve_config,
                    rt.pool_address,
                    rt.decimals as dex_decimals,
                    ct.decimals as custom_decimals
                FROM (
                    SELECT mint_address FROM token_platform.raydium_tokens
                    UNION
                    SELECT mint_address FROM token_platform.custom_tokens
                ) tokens
                LEFT JOIN token_platform.raydium_tokens rt ON tokens.mint_address = rt.mint_address
                LEFT JOIN token_platform.custom_tokens ct ON tokens.mint_address = ct.mint_address
                LEFT JOIN token_platform.token_stats ts ON tokens.mint_address = ts.mint_address
                ORDER BY ts.volume_24h DESC NULLS LAST
            `;
        }

        const result = await pool.query(query);
        console.log('Query executed successfully, found', result.rows.length, 'tokens');
        res.json({ tokens: result.rows });
    } catch (error) {
        console.error('Detailed error in /tokens route:', error);
        res.status(500).json({
            error: 'Failed to fetch tokens',
            details: error instanceof Error ? error.message : 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
        });
    }
});

// Get price history
router.get('/price-history/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { timeframe = '24h' } = req.query;
        const history = await priceService.getPriceHistory(mintAddress, timeframe as '24h' | '7d' | '30d');
        res.json(history);
    } catch (error) {
        logger.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});

// Get trade history
router.get('/trades/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { limit = '50' } = req.query;
        const trades = await dexService.getTradeHistory(mintAddress, parseInt(limit as string));
        res.json(trades);
    } catch (error) {
        logger.error('Error fetching trade history:', error);
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
});

// WebSocket status
router.get('/ws/status', async (_req, res) => {
    try {
        const status = wsService.getStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error fetching WebSocket status:', error);
        res.status(500).json({ error: 'Failed to fetch WebSocket status' });
    }
});

// Record new trade
router.post('/trades', async (req, res) => {
    try {
        const { mintAddress, price, amount, side, signature, walletAddress } = req.body;
        await dexService.handleTransaction({
            mintAddress,
            price,
            amount,
            side,
            signature,
            walletAddress
        });
        res.status(201).json({ success: true });
    } catch (error) {
        logger.error('Error recording trade:', error);
        res.status(500).json({ error: 'Failed to record trade' });
    }
});

// Add this after your existing routes
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

        // Insert into custom_tokens table
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

        // Initialize token stats
        await pool.query(`
            INSERT INTO token_platform.token_stats (
                mint_address,
                price,
                volume_24h,
                liquidity
            ) VALUES ($1, $2, $3, $4)
        `, [mintAddress, 0, 0, 0]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error creating token:', error);
        res.status(500).json({ error: 'Failed to create token' });
    }
});

export default router; 
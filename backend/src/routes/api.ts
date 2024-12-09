import { Router } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { WebSocketService } from '../services/websocketService';
import { DexService } from '../services/dexService';
import { PriceService } from '../services/PriceService';
import { Connection } from '@solana/web3.js';

const router = Router();
const wsService = WebSocketService.getInstance();
const dexService = DexService.getInstance(new Connection(process.env.RPC_ENDPOINT!));
const priceService = PriceService.getInstance();

// Get all tokens (both Raydium and custom)
router.get('/tokens', async (req, res) => {
    try {
        const { type = 'all' } = req.query;
        let query = '';

        if (type === 'raydium') {
            query = `
                SELECT rt.*, ts.price, ts.volume_24h, ts.liquidity
                FROM token_platform.raydium_tokens rt
                JOIN token_platform.token_stats ts ON rt.mint_address = ts.mint_address
                ORDER BY ts.volume_24h DESC
            `;
        } else if (type === 'custom') {
            query = `
                SELECT ct.*, ts.price, ts.volume_24h
                FROM token_platform.custom_tokens ct
                JOIN token_platform.token_stats ts ON ct.mint_address = ts.mint_address
                ORDER BY ts.volume_24h DESC
            `;
        } else {
            query = `
                SELECT 
                    COALESCE(rt.mint_address, ct.mint_address) as mint_address,
                    COALESCE(rt.name, ct.name) as name,
                    COALESCE(rt.symbol, ct.symbol) as symbol,
                    ts.price,
                    ts.volume_24h,
                    ts.liquidity,
                    CASE 
                        WHEN rt.mint_address IS NOT NULL THEN 'raydium'
                        ELSE 'custom'
                    END as token_type
                FROM token_platform.token_stats ts
                LEFT JOIN token_platform.raydium_tokens rt ON rt.mint_address = ts.mint_address
                LEFT JOIN token_platform.custom_tokens ct ON ct.mint_address = ts.mint_address
                ORDER BY ts.volume_24h DESC
            `;
        }

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching tokens:', error);
        res.status(500).json({ error: 'Failed to fetch tokens' });
    }
});

// Get token price
router.get('/prices/:mintAddress', async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const price = await priceService.getTokenPrice(mintAddress);
        res.json({ price });
    } catch (error) {
        logger.error('Error fetching token price:', error);
        res.status(500).json({ error: 'Failed to fetch price' });
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

export default router; 
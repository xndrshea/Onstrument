import { Request, Response, NextFunction } from 'express';
import { PublicKey } from '@solana/web3.js';
import { verify } from 'tweetnacl';
import jwt from 'jsonwebtoken';
import bs58 from 'bs58';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                walletAddress: string;
                nonce?: string;  // Make nonce optional
            };
        }
    }
}

// Store nonces in memory (consider using Redis in production)
const nonceStore = new Map<string, { nonce: string; createdAt: number }>();

export const generateNonce = (walletAddress: string) => {
    // Check for existing valid nonce (5 minute window)
    const existing = nonceStore.get(walletAddress);
    if (existing && Date.now() - existing.createdAt < 300_000) {
        return existing.nonce;
    }

    const nonce = Math.random().toString(36).substring(2, 15);
    nonceStore.set(walletAddress, {
        nonce,
        createdAt: Date.now()
    });
    return nonce;
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for these paths
    if (req.path.startsWith('/auth/nonce') ||
        req.path.startsWith('/auth/verify-silent') ||
        req.path.includes('/helius/') ||
        req.path.startsWith('/market/tokens') ||  // Add market data
        (req.path.startsWith('/tokens') && req.method === 'GET') ||  // Add public token info
        req.path === '/system/status') {  // Add system status
        return next();
    }

    try {
        const token = req.cookies.authToken;
        if (!token) return res.status(401).json({ error: 'No token provided' });

        // Add explicit error handling
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET!) as { walletAddress: string };
        } catch (e) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // New validation: Check if requested resource matches token's wallet
        if (req.params.walletAddress && req.params.walletAddress !== decoded.walletAddress) {
            return res.status(403).json({ error: 'Wallet address mismatch' });
        }

        // Verify user exists in database
        const result = await pool().query(
            'SELECT wallet_address FROM onstrument.users WHERE wallet_address = $1',
            [decoded.walletAddress]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = decoded;

        // Refresh logic remains the same but only uses cookies
        const tokenExp = (jwt.decode(token) as any).exp;
        const now = Math.floor(Date.now() / 1000);

        if (tokenExp - now < 3600) {
            const newToken = jwt.sign({ walletAddress: decoded.walletAddress }, process.env.JWT_SECRET!, { expiresIn: '24h' });
            res.cookie('authToken', newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 86400000,
                domain: process.env.NODE_ENV === 'production'
                    ? '.onstrument.com'
                    : undefined
            });
        }

        next();
    } catch (error) {
        // Ensure JSON error response
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Middleware for routes that need wallet verification
export const verifyWalletOwnership = async (req: Request, res: Response, next: NextFunction) => {
    const { walletAddress } = req.params;

    if (!req.user || req.user.walletAddress !== walletAddress) {
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    next();
}; 
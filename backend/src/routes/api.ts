import express from 'express';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';

const router = express.Router();
router.use(cors());

const JUPITER_PRICE_V2_API = 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';

interface JupiterPriceResponse {
    data: {
        So11111111111111111111111111111111111111112: {
            id: string;
            type: string;
            price: string;
        }
    };
    timeTaken: number;
}

// Define rate limiter first
const priceLimiter = rateLimit({
    windowMs: 15 * 1000, // 15 seconds
    max: 5,
    handler: async (_req, res) => {
        try {
            const response = await fetch(JUPITER_PRICE_V2_API, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Jupiter API returned status: ${response.status}`);
            }

            const data = await response.json() as JupiterPriceResponse;
            const price = parseFloat(data.data.So11111111111111111111111111111111111111112.price);

            res.status(429).json({ price, rateLimited: true });
        } catch (error) {
            console.error('Error in rate limit handler:', error);
            res.status(429).json({ error: 'Too many requests, please try again later' });
        }
    }
});

// Then use it in the route
router.get('/solana-price', priceLimiter, async (_req, res) => {
    try {
        const response = await fetch(JUPITER_PRICE_V2_API, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Jupiter API returned status: ${response.status}`);
        }

        const rawData = await response.text();


        const data = JSON.parse(rawData) as JupiterPriceResponse;


        if (!data?.data?.So11111111111111111111111111111111111111112?.price) {
            console.error('Invalid data structure:', JSON.stringify(data, null, 2));
            throw new Error('Invalid response structure from Jupiter');
        }

        const price = parseFloat(data.data.So11111111111111111111111111111111111111112.price);
        console.log('Calculated SOL Price:', price);

        res.json({ price });
    } catch (error) {
        console.error('Error fetching SOL price:', error);
        console.error('Full error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        res.status(500).json({
            error: 'Failed to fetch SOL price',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router; 
export const config = {
    HELIUS_RPC_URL: `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
    HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
    HELIUS_WEBSOCKET_URL: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899',
    RAYDIUM_SOL_USDC_POOL: process.env.RAYDIUM_SOL_USDC_POOL || '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
} as const; 
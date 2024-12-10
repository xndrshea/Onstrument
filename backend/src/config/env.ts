export const config = {
    HELIUS_RPC_URL: `https://rpc.helius.xyz/?api-key=Speakerthorn`,
    HELIUS_API_KEY: 'Speakerthorn',
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899',
    RAYDIUM_SOL_USDC_POOL: process.env.RAYDIUM_SOL_USDC_POOL || '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    HELIUS_WEBSOCKET_URL: `wss://ws.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    // ... other config variables
}; 
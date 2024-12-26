export const config = {
    HELIUS_RPC_URL: `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
    HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
    HELIUS_WEBSOCKET_URL: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899',
    RAYDIUM_SOL_USDC_POOL: process.env.RAYDIUM_SOL_USDC_POOL || '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    RAYDIUM_PROGRAMS: {
        CP_AMM: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',    // Concentrated Price Swap
        V4_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',    // V4 AMM (OpenBook)
    } as const,
    BONDING_CURVE_PROGRAM_ID: '6M1WSZeEAGtc8oTkdTNWruMsW58XPByzuf6ayoN16cEq',
} as const; 
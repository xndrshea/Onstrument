export const config = {
    HELIUS_RPC_URL: `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
    HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
    PINATA_JWT: process.env.VITE_PINATA_JWT || '',
    HELIUS_MAINNET_WEBSOCKET_URL: `wss://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
    HELIUS_DEVNET_WEBSOCKET_URL: `wss://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    HELIUS_DEVNET_RPC_URL: `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899',
    RAYDIUM_PROGRAMS: {
        CP_AMM: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
        V4_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    } as const,
    BONDING_CURVE_PROGRAM_ID: '6M1WSZeEAGtc8oTkdTNWruMsW58XPByzuf6ayoN16cEq',
} as const;


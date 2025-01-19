export const config = {
    get HELIUS_RPC_URL() {
        return `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`;
    },
    get HELIUS_API_KEY() {
        return process.env.HELIUS_API_KEY || '';
    },
    get PINATA_JWT() {
        return process.env.VITE_PINATA_JWT || '';
    },
    get HELIUS_MAINNET_WEBSOCKET_URL() {
        return `wss://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`;
    },
    get HELIUS_DEVNET_WEBSOCKET_URL() {
        return `wss://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    },
    get HELIUS_DEVNET_RPC_URL() {
        return `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    },
    get SOLANA_RPC_URL() {
        return process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
    },
    get MIGRATION_ADMIN_KEYPAIR() {
        return process.env.MIGRATION_ADMIN_KEYPAIR || '';
    },
    RAYDIUM_PROGRAMS: {
        CP_AMM: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
        V4_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    } as const,
    BONDING_CURVE_PROGRAM_ID: '6M1WSZeEAGtc8oTkdTNWruMsW58XPByzuf6ayoN16cEq',
} as const;


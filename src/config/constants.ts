import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Debug log
console.log('Environment variables:', {
    VITE_BONDING_CURVE_SECRET_KEY: import.meta.env.VITE_BONDING_CURVE_SECRET_KEY,
    isDefined: !!import.meta.env.VITE_BONDING_CURVE_SECRET_KEY
});

// Load from environment variable
const bondingCurveSecretKey = import.meta.env.VITE_BONDING_CURVE_SECRET_KEY;
if (!bondingCurveSecretKey) {
    throw new Error('VITE_BONDING_CURVE_SECRET_KEY is not set in environment');
}

export const BONDING_CURVE_KEYPAIR = Keypair.fromSecretKey(
    bs58.decode(bondingCurveSecretKey)
);

export const BONDING_CURVE_PUBKEY = BONDING_CURVE_KEYPAIR.publicKey.toBase58(); 
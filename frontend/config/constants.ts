import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Load from environment variable
const bondingCurveSecretKey = import.meta.env.VITE_BONDING_CURVE_SECRET_KEY;
if (!bondingCurveSecretKey) {
    throw new Error('VITE_BONDING_CURVE_SECRET_KEY is not set in environment');
}

export const BONDING_CURVE_KEYPAIR = Keypair.fromSecretKey(
    bs58.decode(bondingCurveSecretKey)
);

export const BONDING_CURVE_PUBKEY = BONDING_CURVE_KEYPAIR.publicKey.toBase58(); 
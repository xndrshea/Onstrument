import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();
const secretKey = bs58.encode(keypair.secretKey);
const publicKey = keypair.publicKey.toBase58();

console.log('Add these to your .env file:');
console.log(`VITE_BONDING_CURVE_SECRET_KEY=${secretKey}`);
console.log('\nPublic key (for reference):', publicKey); 
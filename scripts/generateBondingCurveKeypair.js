const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58').default;

// Generate the keypair
const keypair = Keypair.generate();

// Convert the secret key to a base58 string
const secretKey = bs58.encode(Buffer.from(keypair.secretKey));

// Get the public key in base58 format
const publicKey = keypair.publicKey.toBase58();

console.log('Add this to your .env file:');
console.log(`VITE_BONDING_CURVE_SECRET_KEY=${secretKey}`);
console.log('\nPublic key (for reference):', publicKey); 
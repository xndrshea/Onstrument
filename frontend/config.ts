import { Connection, clusterApiUrl } from '@solana/web3.js';

// Existing API config
export const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

// New Solana devnet config
export const CLUSTER = 'devnet';
export const CLUSTER_URL = clusterApiUrl('devnet');
export const connection = new Connection(CLUSTER_URL);

// If you need to reference the program ID in multiple places
export const BONDING_CURVE_PROGRAM_ID = 'DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw'; 
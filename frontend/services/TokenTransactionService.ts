import { Connection } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { BondingCurve, TOKEN_DECIMALS } from './bondingCurve';
// import { StorageService } from './storageService';
import { TokenService } from './tokenService';
import {
    TokenRecord,
    createTokenParams,
    TokenFormData
} from '../../shared/types/token';

export class TokenTransactionService {
    private bondingCurve: BondingCurve;
    // private storageService: StorageService;
    private tokenService: TokenService;
    private connection: Connection;

    constructor(
        connection: Connection,
        wallet: WalletContextState
    ) {
        this.connection = connection;
        if (!connection) throw new Error('Connection is required');
        if (!wallet) throw new Error('Wallet is required');
        if (!wallet.publicKey) throw new Error('Wallet not connected');

        // Initialize services
        this.bondingCurve = new BondingCurve(connection, wallet);
        this.tokenService = new TokenService();
        // this.storageService = new StorageService();
    }

    async createToken(params: createTokenParams, description: string): Promise<TokenRecord> {
        try {
            // Create token with bonding curve
            const { mint, curve, signature } = await this.bondingCurve.createTokenWithCurve(params);

            if (!signature || !mint || !curve) {
                throw new Error('Failed to create token - missing required parameters');
            }

            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction({
                signature,
                blockhash: await this.connection.getLatestBlockhash().then(res => res.blockhash),
                lastValidBlockHeight: await this.connection.getLatestBlockhash().then(res => res.lastValidBlockHeight),
            });

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
            }

            // Create token record with description
            const tokenRecord: TokenRecord = {
                id: Date.now(),
                mintAddress: mint.toString(),
                curveAddress: curve.toString(),
                name: params.name,
                symbol: params.symbol,
                description: description,
                metadataUri: params.metadataUri || '',
                totalSupply: params.totalSupply,
                decimals: TOKEN_DECIMALS,
                curveConfig: params.curveConfig,
                createdAt: new Date()
            };

            // Save to database through tokenService
            const savedToken = await this.tokenService.create(tokenRecord);
            return savedToken;
        } catch (error: any) {
            console.error('Token creation error:', error);
            throw error;
        }
    }
}


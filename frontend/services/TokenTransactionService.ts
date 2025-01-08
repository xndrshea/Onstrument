import { Connection } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { BondingCurve, TOKEN_DECIMALS } from './bondingCurve';
// import { StorageService } from './storageService';
import { TokenService } from './tokenService';
import {
    TokenRecord,
    createTokenParams,
} from '../../shared/types/token';

export class TokenTransactionService {
    private bondingCurve: BondingCurve;
    // private storageService: StorageService;
    private tokenService: TokenService;
    private connection: Connection;
    private wallet: WalletContextState;

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
        this.wallet = wallet;
    }

    async createToken(
        params: createTokenParams,
        description: string,
        socialLinks: {
            websiteUrl?: string;
            twitterUrl?: string;
            docsUrl?: string;
            telegramUrl?: string;
        }
    ): Promise<TokenRecord> {
        try {
            // Create token with bonding curve
            const { mint, curve, tokenVault, signature } = await this.bondingCurve.createTokenWithCurve(params);

            if (!signature || !mint || !curve || !tokenVault) {
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

            // Create new bonding curve instance with the new addresses
            const newBondingCurve = new BondingCurve(this.connection, this.wallet, mint, curve);
            const initialPrice = await newBondingCurve.getInitialPrice();

            // Create token record with description and initial price
            const tokenRecord: TokenRecord = {
                mintAddress: mint.toString(),
                curveAddress: curve.toString(),
                tokenVault: tokenVault.toString(),
                verified: false,
                name: params.name,
                symbol: params.symbol,
                description: description,
                metadataUri: params.metadataUri || '',
                totalSupply: params.totalSupply.toNumber(),
                decimals: TOKEN_DECIMALS,
                curveConfig: params.curveConfig,
                createdAt: new Date().toISOString(),
                tokenType: 'custom',
                initialPrice: initialPrice,
                websiteUrl: socialLinks.websiteUrl || '',
                twitterUrl: socialLinks.twitterUrl || '',
                docsUrl: socialLinks.docsUrl || '',
                telegramUrl: socialLinks.telegramUrl || ''
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


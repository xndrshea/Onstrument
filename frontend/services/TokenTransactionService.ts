import type { Connection } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { BondingCurve, TOKEN_DECIMALS } from './bondingCurve';
// import { StorageService } from './storageService';
import { TokenService } from './tokenService';
import type {
    TokenRecord,
    createTokenParams,
} from '../../shared/types/token';
import { getConnection, getConnectionForToken } from '../config';

export class TokenTransactionService {
    private connection: Connection;
    private wallet: WalletContextState;
    private bondingCurve: BondingCurve;
    private tokenService: TokenService;

    constructor(
        wallet: WalletContextState,
        connection: Connection,
        token?: { tokenType: string }
    ) {

        // Use the wallet's connection instead of creating a new one
        this.wallet = wallet;
        this.connection = connection;
        this.bondingCurve = new BondingCurve(this.connection, wallet);
        this.tokenService = new TokenService();
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
            const { mint, curve, tokenVault, signatures } = await this.bondingCurve.createTokenWithCurve(params);

            if (!signatures?.[0] || !mint || !curve || !tokenVault) {
                console.error('Missing parameters:', { signatures, mint, curve, tokenVault });
                throw new Error('Failed to create token - missing required parameters');
            }

            // Instead of using confirmTransaction, use getSignatureStatus in a polling loop
            let retries = 0;
            while (retries < 30) {
                const status = await this.connection.getSignatureStatus(signatures[0]);

                if (status?.value?.confirmationStatus === 'processed' ||
                    status?.value?.confirmationStatus === 'confirmed' ||
                    status?.value?.confirmationStatus === 'finalized') {
                    break;
                }

                if (status?.value?.err) {
                    throw new Error(`Transaction failed: ${status.value.err.toString()}`);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                retries++;
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
                metadataUrl: params.metadataUri || '',
                supply: params.totalSupply.toNumber(),
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
            console.error('Token creation error:', {
                error,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}


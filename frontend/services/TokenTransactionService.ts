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
import { PublicKey } from '@solana/web3.js';

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
        },
        projectData?: {
            category: string;
            teamMembers: Array<{ name: string; role: string; social: string; }>;
            isAnonymous: boolean;
            projectTitle: string;
            projectDescription: string;
            projectStory: string;
        }
    ): Promise<TokenRecord> {
        try {
            // Remove the token seed generation since it's in the params
            const { mint, curve, tokenVault } = await this.bondingCurve.createTokenWithCurve(params);

            // Create new bonding curve instance with the new addresses
            const newBondingCurve = new BondingCurve(this.connection, this.wallet, mint, curve);
            const initialPrice = await newBondingCurve.getInitialPrice();

            // Create token record with all data
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
                telegramUrl: socialLinks.telegramUrl || '',
                projectCategory: projectData?.category || '',
                teamMembers: projectData?.teamMembers || [],
                isAnonymous: projectData?.isAnonymous || false,
                projectTitle: projectData?.projectTitle || '',
                projectDescription: projectData?.projectDescription || '',
                projectStory: projectData?.projectStory || ''
            };

            // Save to database through tokenService
            return await this.tokenService.create(tokenRecord);
        } catch (error: any) {
            throw error;
        }
    }
}


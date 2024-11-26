import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { BondingCurve } from './bondingCurve';
// import { StorageService } from './storageService';
import { TokenService } from './tokenService';
import {
    TokenRecord,
    CreateTokenParams,
    TokenFormData
} from '../../shared/types/token';

const PARAM_SCALE = 10_000;

export class TokenTransactionService {
    private bondingCurve: BondingCurve;
    // private storageService: StorageService;
    private tokenService: TokenService;

    constructor(
        connection: Connection,
        wallet: WalletContextState
    ) {
        if (!connection) throw new Error('Connection is required');
        if (!wallet) throw new Error('Wallet is required');
        if (!wallet.publicKey) throw new Error('Wallet not connected');

        // Initialize services
        this.bondingCurve = new BondingCurve(connection, wallet);
        this.tokenService = new TokenService();
        // this.storageService = new StorageService();
    }

    async createToken(formData: TokenFormData): Promise<TokenRecord> {
        // 1. Upload metadata if needed
        const metadataUri = formData.image
            ? await this.uploadMetadata(formData)
            : generateTestMetadataUri(formData);

        // 2. Create token with bonding curve
        const { mint, curve } = await this.bondingCurve.createTokenWithCurve({
            name: formData.name,
            symbol: formData.symbol,
            initial_supply: new BN(formData.supply),
            metadata_uri: metadataUri,
            curve_config: {
                curve_type: formData.curveType,
                base_price: new BN(formData.basePrice * LAMPORTS_PER_SOL),
                slope: new BN(formData.slope * PARAM_SCALE),
                exponent: new BN(formData.exponent * PARAM_SCALE),
                log_base: new BN(formData.logBase * PARAM_SCALE)
            }
        });

        // 3. Create token record
        const tokenRecord: TokenRecord = {
            id: Date.now(), // Temporary ID for frontend tracking
            mint_address: mint.toString(),
            curve_address: curve.toString(),
            name: formData.name,
            symbol: formData.symbol,
            description: formData.description || '',
            metadata_uri: metadataUri,
            total_supply: new BN(formData.supply),
            decimals: 9, // Standard SPL token decimals
            curve_config: {
                curve_type: formData.curveType,
                base_price: new BN(formData.basePrice * LAMPORTS_PER_SOL),
                slope: new BN(formData.slope * PARAM_SCALE),
                exponent: new BN(formData.exponent * PARAM_SCALE),
                log_base: new BN(formData.logBase * PARAM_SCALE)
            },
            created_at: new Date()
        };

        return tokenRecord;
    }

    private async uploadMetadata(formData: TokenFormData): Promise<string> {
        // TODO: Implement metadata upload when storage service is ready
        return generateTestMetadataUri(formData);
    }
}

function generateTestMetadataUri(formData: TokenFormData): string {
    return `https://test.metadata/${formData.name}-${formData.symbol}`;
}
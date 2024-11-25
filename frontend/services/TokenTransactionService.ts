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
        // 1. Upload metadata to IPFS/Arweave if image exists
        let metadataUri = null;
        /* Comment out the image upload logic for now
        if (formData.image) {
            const imageUri = await this.storageService.uploadFile(formData.image);
            metadataUri = await this.storageService.uploadJson({
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                image: imageUri
            });
        }
        */

        // 2. Create token with bonding curve (single transaction)
        const { mint, curve } = await this.bondingCurve.createTokenWithCurve({
            name: formData.name,
            symbol: formData.symbol,
            initial_supply: new BN(formData.supply),
            curve_config: {
                curve_type: formData.curveType,
                base_price: new BN(formData.basePrice * LAMPORTS_PER_SOL),
                slope: formData.slope ? new BN(formData.slope * PARAM_SCALE) : null,
                exponent: formData.exponent ? new BN(formData.exponent * PARAM_SCALE) : null,
                log_base: formData.log_base ? new BN(formData.log_base * PARAM_SCALE) : null
            },
            metadata_uri: metadataUri || generateTestMetadataUri(formData)
        });

        // 3. Return complete token record
        return {
            mint_address: mint,
            curve_address: curve,
            name: formData.name,
            symbol: formData.symbol,
            description: formData.description,
            metadata_uri: metadataUri,
            id: parseInt(mint),
            total_supply: new BN(formData.supply),
            decimals: 9,
            curve_config: {
                curve_type: formData.curveType,
                base_price: new BN(formData.basePrice * LAMPORTS_PER_SOL),
                slope: formData.slope ? new BN(formData.slope * PARAM_SCALE) : null,
                exponent: formData.exponent ? new BN(formData.exponent * PARAM_SCALE) : null,
                log_base: formData.log_base ? new BN(formData.log_base * PARAM_SCALE) : null
            },
            created_at: new Date()
        };
    }
}

function generateTestMetadataUri(formData: TokenFormData): string {
    return `https://test.metadata/${formData.name}-${formData.symbol}`;
}
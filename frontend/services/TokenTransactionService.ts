import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { BondingCurve } from './bondingCurve';
import { TokenService } from './tokenService';
import {
    TokenRecord,
    CreateTokenParams
} from '../../shared/types/token';

export class TokenTransactionService {
    private bondingCurve: BondingCurve;
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
    }

    async createToken(params: CreateTokenParams): Promise<TokenRecord> {
        // Create on-chain first
        const onChainResult = await this.bondingCurve.createTokenWithCurve({
            name: params.name,
            symbol: params.symbol,
            initialSupply: params.total_supply.toNumber(),
            basePrice: params.base_price.toNumber() / LAMPORTS_PER_SOL,
            curveType: params.curve_type,
            slope: params.slope?.toNumber(),
            exponent: params.exponent?.toNumber(),
            log_base: params.log_base?.toNumber()
        });

        // Then create database record with all parameters
        return await this.tokenService.create({
            ...params,
            mint_address: onChainResult.mint,
            curve_address: onChainResult.curve
        });
    }
}
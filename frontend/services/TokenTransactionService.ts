import { Connection } from '@solana/web3.js';
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
        const onChainResult = await this.bondingCurve.createTokenWithCurve(params);

        // Then create database record with just the required CreateTokenParams
        return await this.tokenService.create({
            name: params.name,
            symbol: params.symbol,
            initial_supply: params.initial_supply,
            curve_config: params.curve_config
        });
    }
}
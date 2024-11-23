import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { TokenBondingCurveConfig } from '../../shared/types/token';
import { createToken } from '../utils/tokenCreation';
import { tokenService } from './tokenService';
import { validateBondingCurveConfig } from "../../shared/utils/bondingCurveValidator";

export class TokenTransactionService {
    constructor(
        private connection: Connection,
        private wallet: {
            publicKey: PublicKey;
            sendTransaction: (transaction: Transaction) => Promise<string>;
            signTransaction: (transaction: Transaction) => Promise<Transaction>;
        }
    ) { }

    async createToken(config: {
        name: string;
        symbol: string;
        description?: string;
        totalSupply: number;
        bondingCurve: TokenBondingCurveConfig;
    }) {
        try {
            // Validate bonding curve config first
            validateBondingCurveConfig(config.bondingCurve);

            // 1. Create token on-chain
            const onChainResult = await createToken({
                connection: this.connection,
                wallet: this.wallet,
                ...config,
                description: config.description || ''
            });

            // 2. Verify on-chain creation
            const latestBlockhash = await this.connection.getLatestBlockhash();
            const signature = await this.connection.confirmTransaction({
                signature: onChainResult.signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });
            if (signature.value.err) {
                throw new Error('Failed to confirm transaction');
            }

            // 3. Create database entry - use the existing bonding curve keypair
            const dbToken = await tokenService.create({
                mint_address: onChainResult.mintKeypair.publicKey.toString(),
                name: config.name,
                symbol: config.symbol,
                description: config.description,
                total_supply: config.totalSupply,
                metadata: onChainResult.metadata,
                bondingCurveConfig: config.bondingCurve
            });

            return { onChainResult, dbToken };
        } catch (error) {
            console.error('Error in TokenTransactionService.createToken:', error);
            throw error;
        }
    }
}
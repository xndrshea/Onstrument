import { WalletContextState } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { API_BASE_URL } from '../config';

export interface FeeConfig {
    feePercentage: number;
    isSubscriber: boolean;
    exemptionList?: string[]; // Wallet addresses exempt from fees
}

export class FeeService {
    private static instance: FeeService;

    private constructor() { }

    static getInstance(): FeeService {
        if (!this.instance) {
            this.instance = new FeeService();
        }
        return this.instance;
    }

    async getFeeConfig(wallet: WalletContextState): Promise<FeeConfig> {
        try {
            const response = await fetch(
                `${API_BASE_URL}/user/subscription/${wallet.publicKey?.toString()}`
            );
            const data = await response.json();

            return {
                feePercentage: data.isSubscriber ? 0 : 0.003, // 0.3% for non-subscribers
                isSubscriber: data.isSubscriber,
                exemptionList: data.exemptionList
            };
        } catch (error) {
            // Default to non-subscriber fees if check fails
            return {
                feePercentage: 0.003,
                isSubscriber: false
            };
        }
    }

    calculateFee(amount: number, feePercentage: number): number {
        return amount * feePercentage;
    }
}

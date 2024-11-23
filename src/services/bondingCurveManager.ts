// src/services/bondingCurveManager.ts
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { BONDING_CURVE_KEYPAIR } from '../config/constants';

class BondingCurveManager {
    private readonly masterKeypair: Keypair;
    private static instance: BondingCurveManager;
    private bondingCurveAccounts: Map<string, PublicKey> = new Map();

    private constructor() {
        this.masterKeypair = BONDING_CURVE_KEYPAIR;
    }

    static getInstance(): BondingCurveManager {
        if (!BondingCurveManager.instance) {
            BondingCurveManager.instance = new BondingCurveManager();
        }
        return BondingCurveManager.instance;
    }

    async getBondingCurvePDA(mintAddress: string): Promise<PublicKey> {
        const existingPDA = this.bondingCurveAccounts.get(mintAddress);
        if (existingPDA) return existingPDA;

        const [pda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("bonding_curve"),
                new PublicKey(mintAddress).toBuffer(),
                this.masterKeypair.publicKey.toBuffer()
            ],
            new PublicKey(mintAddress)
        );

        this.bondingCurveAccounts.set(mintAddress, pda);
        return pda;
    }

    async signTransaction(transaction: Transaction): Promise<void> {
        // Set the fee payer
        transaction.feePayer = this.masterKeypair.publicKey;

        // Sign with master keypair
        transaction.sign(this.masterKeypair);
    }

    getMasterKeypair(): Keypair {
        return this.masterKeypair;
    }
}

export const bondingCurveManager = BondingCurveManager.getInstance();
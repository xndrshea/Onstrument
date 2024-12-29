import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';

const VIRTUAL_SOL_AMOUNT = BigInt(30_000_000_000); // 30 SOL in lamports

export class BondingCurveProcessor extends BaseProcessor {
    private connection: Connection;

    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_RPC_URL);
    }

    async processEvent(buffer: Buffer, curveAddress: string, programId: string): Promise<void> {
        try {
            // Deserialize curve account data
            if (buffer.length < 8 + 32 + 8 + 1) return; // Minimum size check

            const mintAddress = new PublicKey(buffer.subarray(8, 40)); // Skip discriminator
            const virtualSol = buffer.readBigUInt64LE(40);

            // Get curve's SOL balance
            const curveBalance = await this.connection.getBalance(new PublicKey(curveAddress));

            // Get token vault
            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), mintAddress.toBuffer()],
                new PublicKey(programId)
            );

            const vaultBalance = await this.connection.getTokenAccountBalance(tokenVault);
            const totalTokens = BigInt(vaultBalance.value.amount);

            if (totalTokens === 0n) return;

            // Calculate effective SOL (real + virtual)
            const effectiveSol = BigInt(curveBalance) + VIRTUAL_SOL_AMOUNT;

            // Calculate price using the bonding curve formula
            // Based on programs/bonding_curve/src/state/bonding_curve.rs
            const k = effectiveSol * totalTokens;
            const newTokenAmount = totalTokens - BigInt(1e9); // 1 token in base units
            const newSolAmount = k / newTokenAmount;
            const price = Number(newSolAmount - effectiveSol) / LAMPORTS_PER_SOL;

            const update = {
                mintAddress: mintAddress.toString(),
                price,
                timestamp: new Date(),
                volume: Number(vaultBalance.value.amount)
            };

            await PriceHistoryModel.recordPrice(update);
        } catch (error) {
            logger.error(`Error processing Bonding Curve event: ${error}`);
        }
    }
}

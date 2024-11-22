import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import { BONDING_CURVE_KEYPAIR } from '../config/constants';

export async function ensureBondingCurveATA(
    connection: Connection,
    mintAddress: PublicKey,
    payer: PublicKey
): Promise<PublicKey> {
    const bondingCurveATA = await getAssociatedTokenAddress(
        mintAddress,
        BONDING_CURVE_KEYPAIR.publicKey
    );

    try {
        // Check if ATA already exists
        await getAccount(connection, bondingCurveATA);
        return bondingCurveATA;
    } catch (error) {
        // If ATA doesn't exist, create it
        const createATAIx = createAssociatedTokenAccountInstruction(
            payer,
            bondingCurveATA,
            BONDING_CURVE_KEYPAIR.publicKey,
            mintAddress
        );

        // Add to token creation transaction
        return bondingCurveATA;
    }
} 
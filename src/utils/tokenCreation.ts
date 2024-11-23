import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair,
} from '@solana/web3.js'
import {
    createInitializeMintInstruction,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createMintToInstruction,
    getAccount,
    getMint
} from '@solana/spl-token'
import { CurveType, TokenMetadata, TokenBondingCurveConfig } from '../../shared/types/token';
import { bondingCurveManager } from '../services/bondingCurveManager';

// Add import for Window type definition
/// <reference path="../types/global.d.ts" />

// Add this constant
const MINT_SIZE = 82;

interface TokenCreationConfig {
    connection: Connection;
    wallet: {
        publicKey: PublicKey;
        sendTransaction: (transaction: Transaction) => Promise<string>;
        signTransaction: (transaction: Transaction) => Promise<Transaction>;
    };
    name: string;
    symbol: string;
    description: string;
    totalSupply: number;
    bondingCurve: {
        curveType: CurveType;
        basePrice: number;
        slope?: number;
        exponent?: number;
        logBase?: number;
    };
};

export async function createToken({
    connection,
    wallet,
    name,
    symbol,
    description,
    totalSupply,
    bondingCurve
}: TokenCreationConfig): Promise<{
    transaction: Transaction;
    signature: string;
    mintKeypair: Keypair;
    bondingCurveATA: string;
    metadata: TokenMetadata;
    bonding_curve_config: TokenBondingCurveConfig;
}> {
    try {
        const mintKeypair = Keypair.generate();
        const masterKeypair = bondingCurveManager.getMasterKeypair();

        // Get the PDA for this token's bonding curve
        const bondingCurvePDA = await bondingCurveManager.getBondingCurvePDA(
            mintKeypair.publicKey.toString()
        );

        // Create the bonding curve ATA
        const bondingCurveATA = await getAssociatedTokenAddress(
            mintKeypair.publicKey,
            bondingCurvePDA,
            true // allowOwnerOffCurve = true for PDAs
        );

        const lamports = await connection.getMinimumBalanceForRentExemption(
            MINT_SIZE
        );

        const instructions = [
            // Create mint account
            SystemProgram.createAccount({
                fromPubkey: wallet.publicKey,
                newAccountPubkey: mintKeypair.publicKey,
                space: MINT_SIZE,
                lamports,
                programId: TOKEN_PROGRAM_ID
            }),

            // Initialize mint
            createInitializeMintInstruction(
                mintKeypair.publicKey,
                9,
                masterKeypair.publicKey, // Master keypair is mint authority
                masterKeypair.publicKey  // Master keypair is freeze authority
            ),

            // Create ATA for bonding curve PDA
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,      // payer
                bondingCurveATA,       // ata
                bondingCurvePDA,       // owner (PDA)
                mintKeypair.publicKey  // mint
            ),

            // Mint initial supply to bonding curve ATA
            createMintToInstruction(
                mintKeypair.publicKey,  // mint
                bondingCurveATA,        // destination
                masterKeypair.publicKey, // authority
                BigInt(totalSupply * Math.pow(10, 9))
            )
        ];

        const transaction = new Transaction();
        transaction.add(...instructions);

        try {
            // Sign with both wallet and mint keypair
            transaction.feePayer = wallet.publicKey;
            transaction.recentBlockhash = (
                await connection.getLatestBlockhash()
            ).blockhash;

            // First, have the bonding curve manager sign
            await bondingCurveManager.signTransaction(transaction);

            // Then sign with the mint keypair
            transaction.partialSign(mintKeypair);

            // Finally send the transaction through the wallet
            const signature = await wallet.sendTransaction(transaction);
            await connection.confirmTransaction(signature);

            return {
                transaction,
                signature,
                mintKeypair,
                bondingCurveATA: bondingCurveATA.toBase58(),
                metadata: {
                    bondingCurveATA: bondingCurveATA.toString(),
                    bondingCurveAddress: bondingCurvePDA.toString(),
                    totalSupply: totalSupply,
                },
                bonding_curve_config: {
                    curveType: bondingCurve.curveType,
                    basePrice: bondingCurve.basePrice,
                    slope: bondingCurve.slope,
                    exponent: bondingCurve.exponent,
                    logBase: bondingCurve.logBase
                }
            };
        } catch (error) {
            console.error('Error creating token:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error in createToken:', error);
        throw error;
    }
}

export async function addTokenToWallet(
    connection: Connection,
    publicKey: PublicKey,
    mintAddress: string
): Promise<boolean> {
    try {
        console.log('Adding token to wallet:', mintAddress);
        const mintPubkey = new PublicKey(mintAddress);
        const tokenMint = await getMint(connection, mintPubkey);

        // TypeScript now knows about window.solana
        if (!window.solana?.isPhantom) {
            console.log('Phantom wallet not detected, showing manual instructions');
            alert(getManualTokenAddInstructions(mintAddress));
            return false;
        }

        try {
            await window.solana.request({
                method: 'wallet_watchAsset',
                params: {
                    type: 'spl-token',
                    options: {
                        address: mintAddress,
                        decimals: tokenMint.decimals,
                        symbol: 'TOKEN',
                        name: 'Custom Token',
                        image: ''
                    }
                }
            });

            return true;
        } catch (phantomError) {
            console.warn('Phantom-specific method failed:', phantomError);
            // Alternative approach: Create ATA if it doesn't exist
            try {
                const ata = await getAssociatedTokenAddress(
                    mintPubkey,
                    publicKey
                );

                const account = await getAccount(connection, ata);
                console.log('Token account already exists:', account.address.toString());

                // Even if ATA exists, show manual instructions as fallback
                alert(getManualTokenAddInstructions(mintAddress));
                return true;
            } catch (error) {
                console.log('Token account does not exist, showing manual instructions');
                alert(getManualTokenAddInstructions(mintAddress));
                return false;
            }
        }
    } catch (error) {
        console.error('Error adding token to wallet:', error);
        alert(getManualTokenAddInstructions(mintAddress));
        return false;
    }
}

export function getManualTokenAddInstructions(mintAddress: string): string {
    return `To add this token manually:
1. Open your wallet
2. Find "Add Token" or "Import Token"
3. Enter this mint address: ${mintAddress}
4. Make sure you're on the correct network (Devnet)`;
} 
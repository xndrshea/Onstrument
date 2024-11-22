import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL
} from '@solana/web3.js'
import {
    createInitializeMintInstruction,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createMintToInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
    getAccount
} from '@solana/spl-token'
import bs58 from 'bs58'
import { BONDING_CURVE_KEYPAIR } from '../config/constants';

interface TokenCreationConfig {
    connection: Connection;
    wallet: {
        publicKey: PublicKey;
        sendTransaction: (transaction: Transaction) => Promise<string>;
    };
    name: string;
    symbol: string;
    description: string;
    totalSupply: number;
}

function serializeKeypair(keypair: Keypair): string {
    return bs58.encode(keypair.secretKey);
}

export async function createToken({
    connection,
    wallet,
    name,
    symbol,
    description,
    totalSupply
}: TokenCreationConfig) {
    try {
        const mintKeypair = Keypair.generate();
        const bondingCurveKeypair = BONDING_CURVE_KEYPAIR;

        // Get the bonding curve ATA
        const bondingCurveATA = await getAssociatedTokenAddress(
            mintKeypair.publicKey,
            bondingCurveKeypair.publicKey
        );

        const transaction = new Transaction();

        // Create mint account
        const createMintAccountIx = SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: 82,
            lamports: await connection.getMinimumBalanceForRentExemption(82),
            programId: TOKEN_PROGRAM_ID
        });

        // Initialize mint
        const initializeMintIx = createInitializeMintInstruction(
            mintKeypair.publicKey,
            9, // decimals
            wallet.publicKey,
            wallet.publicKey
        );

        // Create ATA for bonding curve
        const createATAIx = createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            bondingCurveATA,
            bondingCurveKeypair.publicKey,
            mintKeypair.publicKey
        );

        // Mint tokens to bonding curve ATA
        const mintToIx = createMintToInstruction(
            mintKeypair.publicKey,
            bondingCurveATA,
            wallet.publicKey,
            BigInt(totalSupply * Math.pow(10, 9))  // Convert to smallest units
        );

        // Add all instructions in correct order
        transaction.add(
            createMintAccountIx,
            initializeMintIx,
            createATAIx,
            mintToIx
        );

        // Get latest blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        // Sign with mint keypair
        transaction.partialSign(mintKeypair);

        console.log('Transaction created with instructions:', {
            createMint: true,
            initializeMint: true,
            createATA: true,
            mintTo: true,
            totalSupply,
            bondingCurveATA: bondingCurveATA.toBase58()
        });

        const metadata = {
            name,
            symbol,
            description,
            initialSupply: totalSupply,
            bondingCurveATA: bondingCurveATA.toString(),
            reserveAccount: bondingCurveKeypair.publicKey.toString()
        };

        return {
            transaction,
            mintKeypair,
            bondingCurveATA: bondingCurveATA.toBase58(),
            metadata,
            lastValidBlockHeight
        };
    } catch (error) {
        console.error('Error in createToken:', error);
        throw error;
    }
}

export async function addTokenToWallet(
    mintAddress: string,
    wallet: any // Phantom wallet
) {
    try {
        const tokenPublicKey = new PublicKey(mintAddress)

        const response = await wallet.request({
            method: "wallet_watchAsset",
            params: {
                type: "SPL",
                options: {
                    address: mintAddress,
                    decimals: 9,
                }
            }
        })

        if (response.success) {
            console.log('Token added to wallet successfully')
            return true
        } else {
            console.error('Failed to add token to wallet')
            return false
        }
    } catch (error) {
        console.error('Error adding token to wallet:', error)
        throw error
    }
} 
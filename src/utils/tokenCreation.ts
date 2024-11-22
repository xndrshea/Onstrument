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
    getAccount,
    getMint
} from '@solana/spl-token'
import bs58 from 'bs58'
import { BONDING_CURVE_KEYPAIR } from '../config/constants';
import { CurveType } from '../services/bondingCurve';

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
    bondingCurve: {
        curveType: CurveType;
        basePrice: number;
        slope?: number;
        exponent?: number;
        logBase?: number;
    };
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
    totalSupply,
    bondingCurve
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

        // Send and confirm transaction
        const signature = await wallet.sendTransaction(transaction);

        return {
            transaction,
            signature,
            mintKeypair,
            bondingCurveATA: bondingCurveATA.toBase58(),
            metadata: {
                name,
                symbol,
                description,
                initialSupply: totalSupply,
                bondingCurveATA: bondingCurveATA.toString(),
                bondingCurveConfig: {
                    curveType: bondingCurve.curveType,
                    basePrice: bondingCurve.basePrice,
                    slope: bondingCurve.slope,
                    exponent: bondingCurve.exponent,
                    logBase: bondingCurve.logBase
                }
            }
        };
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

        // Ensure we're working with a valid PublicKey for the mint
        const mintPubkey = new PublicKey(mintAddress);

        // Get the token's metadata
        const tokenMint = await getMint(connection, mintPubkey);
        console.log('Token mint data:', tokenMint);

        // Check if window.solana exists and is Phantom
        if (!window.solana?.isPhantom) {
            console.log('Phantom wallet not detected, showing manual instructions');
            alert(getManualTokenAddInstructions(mintAddress));
            return false;
        }

        try {
            // Use Phantom's specific method for adding tokens
            await window.solana.request({
                method: 'wallet_watchAsset',
                params: {
                    type: 'spl-token',  // Changed from 'SPL' to 'spl-token'
                    options: {
                        address: mintAddress,  // Use the string address directly
                        decimals: tokenMint.decimals,
                        // These fields are optional but recommended
                        symbol: 'TOKEN',
                        name: 'Custom Token',
                        image: ''
                    }
                }
            });

            console.log('Token successfully added to wallet');
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
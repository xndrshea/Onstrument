import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL,
    ConfirmOptions
} from '@solana/web3.js'
import {
    createInitializeMintInstruction,
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createMintToInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
} from '@solana/spl-token'
import { BondingCurveConfig } from '../services/bondingCurve'

export async function createToken(
    connection: Connection,
    payer: PublicKey,
    bondingConfig: BondingCurveConfig,
) {
    try {
        // Create necessary keypairs
        const mintKeypair = Keypair.generate()
        const bondingCurveKeypair = Keypair.generate()
        const reserveAccount = Keypair.generate()

        // Get the ATA for bonding curve
        const bondingCurveATA = await getAssociatedTokenAddress(
            mintKeypair.publicKey,
            bondingCurveKeypair.publicKey
        )

        // Create the transaction
        const transaction = await initializeToken(
            connection,
            payer,
            mintKeypair,
            bondingCurveKeypair,
            reserveAccount,
            bondingCurveATA,
            bondingConfig
        )

        // Add creation timestamp to metadata
        const metadata = {
            // ... existing metadata ...
            createdAt: new Date().toISOString(),
        };

        // Save token data
        await tokenService.saveToken({
            mint_address: mintKeypair.publicKey.toString(),
            metadata,
            bondingCurveConfig: bondingConfig,
            // ... other token data ...
        });

        return {
            transaction,
            mintKeypair,
            bondingCurveKeypair,
            reserveAccount,
            bondingCurveATA: bondingCurveATA.toBase58(),
            metadata
        }
    } catch (error) {
        console.error('Detailed token creation error:', error)
        throw error
    }
}

// New function to initialize token during first purchase
export async function initializeToken(
    connection: Connection,
    payer: PublicKey,
    mintKeypair: Keypair,
    bondingCurveKeypair: Keypair,
    reserveAccount: Keypair,
    bondingCurveATA: PublicKey,
    bondingConfig: BondingCurveConfig,
    decimals: number = 9
) {
    const transaction = new Transaction()

    // Get minimum lamports using connection.getMinimumBalanceForRentExemption
    const mintSpace = 82 // Fixed size for mint account
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintSpace)
    const accountSpace = 0 // No data needed for bonding curve account
    const bondingCurveLamports = await connection.getMinimumBalanceForRentExemption(accountSpace)
    const reserveLamports = await connection.getMinimumBalanceForRentExemption(accountSpace)

    // Create mint account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: mintKeypair.publicKey,
            space: mintSpace,
            lamports: mintLamports,
            programId: TOKEN_PROGRAM_ID
        })
    )

    // Initialize mint
    transaction.add(
        createInitializeMintInstruction(
            mintKeypair.publicKey,
            decimals,
            payer,
            payer,
            TOKEN_PROGRAM_ID
        )
    )

    // Create bonding curve account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: bondingCurveKeypair.publicKey,
            space: accountSpace,
            lamports: bondingCurveLamports,
            programId: TOKEN_PROGRAM_ID
        })
    )

    // Create reserve account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: reserveAccount.publicKey,
            space: accountSpace,
            lamports: reserveLamports,
            programId: SystemProgram.programId
        })
    )

    // Create ATA for bonding curve
    transaction.add(
        createAssociatedTokenAccountInstruction(
            payer,
            bondingCurveATA,
            bondingCurveKeypair.publicKey,
            mintKeypair.publicKey
        )
    )

    // Add instruction to mint initial supply to bonding curve
    transaction.add(
        createMintToInstruction(
            mintKeypair.publicKey,
            bondingCurveATA,
            payer,
            bondingConfig.maxSupply * Math.pow(10, decimals)
        )
    )

    // Transfer mint authority to bonding curve
    transaction.add(
        createSetAuthorityInstruction(
            mintKeypair.publicKey,
            payer,
            AuthorityType.MintTokens,
            bondingCurveKeypair.publicKey
        )
    )

    return transaction
}

export async function addTokenToWallet(
    mintAddress: string,
    wallet: any // Phantom wallet instance
) {
    try {
        await wallet.request({
            method: "wallet_watchAsset",
            params: {
                type: "SPL",
                options: {
                    address: mintAddress,
                }
            }
        })
        return true
    } catch (error) {
        console.error('Error adding token to wallet:', error)
        return false
    }
} 
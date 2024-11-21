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
} from '@solana/spl-token'

interface TokenCreationConfig {
    name: string
    symbol: string
    description: string
    supply: string
    initialPrice: string
    slope: string
    initialSupply: string
    reserveRatio: string
}

export async function createToken(
    connection: Connection,
    payer: PublicKey,
    config: TokenCreationConfig
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

        // Calculate initial supply in smallest units (with 9 decimals)
        const initialSupply = Math.floor(parseFloat(config.supply) * Math.pow(10, 9))
        if (isNaN(initialSupply) || initialSupply <= 0) {
            throw new Error('Invalid initial supply')
        }

        // Create the transaction
        const transaction = await initializeToken(
            connection,
            payer,
            mintKeypair,
            bondingCurveKeypair,
            reserveAccount,
            bondingCurveATA,
            initialSupply
        )

        // Convert bonding curve parameters to numbers
        const initialPrice = parseFloat(config.initialPrice)
        const slope = parseFloat(config.slope)
        const reserveRatio = parseFloat(config.reserveRatio)

        return {
            transaction,
            mintKeypair,
            bondingCurveKeypair,
            reserveAccount,
            bondingCurveATA: bondingCurveATA.toBase58(),
            metadata: {
                bondingCurveATA: bondingCurveATA.toBase58(),
                reserveAccount: reserveAccount.publicKey.toBase58(),
                initialSupply,
                currentSupply: initialSupply  // Set current supply equal to initial supply
            },
            bondingCurveConfig: {
                initialPrice,
                slope,
                reserveRatio
            }
        }
    } catch (error) {
        console.error('Error in createToken:', error)
        throw error
    }
}

async function initializeToken(
    connection: Connection,
    payer: PublicKey,
    mintKeypair: Keypair,
    bondingCurveKeypair: Keypair,
    reserveAccount: Keypair,
    bondingCurveATA: PublicKey,
    initialSupply: number,
    decimals: number = 9
) {
    const transaction = new Transaction()

    // Get minimum lamports for rent exemption
    const mintSpace = 82
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintSpace)
    const accountSpace = 0
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
            initialSupply
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
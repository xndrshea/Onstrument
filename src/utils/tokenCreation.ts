import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair
} from '@solana/web3.js'
import {
    createInitializeMintInstruction,
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token'

export async function createToken(
    connection: Connection,
    payer: PublicKey,
    decimals: number = 9
) {
    // Generate a new keypair for the mint account
    const mintKeypair = Keypair.generate()

    // Get the minimum lamports required for the mint
    const lamports = await getMinimumBalanceForRentExemptMint(connection)

    // Create instructions for the transaction
    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID
    })

    const initializeMintInstruction = createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer,
        payer,
        TOKEN_PROGRAM_ID
    )

    // Create the transaction
    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMintInstruction
    )

    return {
        transaction,
        mintKeypair,
    }
} 
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
} from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
    AmmConfigLayout,
    ApiPoolInfo,
    Liquidity,
    LiquidityPoolKeys,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    Token,
    TokenAmount,
    LiquidityPoolKeysV4,
    LiquidityStateV4,
} from '@raydium-io/raydium-sdk';
import BN from 'bn.js';

export async function createRaydiumPool(
    connection: Connection,
    mintAddress: PublicKey,
    bondingCurveKeypair: Keypair
): Promise<{ poolAddress: PublicKey; lpMintAddress: PublicKey }> {
    try {
        // Create LP token mint
        const lpMintKeypair = Keypair.generate();
        const transaction = new Transaction();

        // Get WSOL token info for the pool pair
        const WSOL = new Token(TOKEN_PROGRAM_ID, SystemProgram.programId, 9, 'WSOL', 'Wrapped SOL');
        const customToken = new Token(TOKEN_PROGRAM_ID, mintAddress, 9, 'CUSTOM', 'Custom Token');

        // Create pool configuration
        const ammConfig: LiquidityStateV4 = {
            status: new BN(1),
            baseDecimal: new BN(9),
            quoteDecimal: new BN(9),
            lpDecimal: new BN(9),
            baseReserve: new TokenAmount(customToken, '0'),
            quoteReserve: new TokenAmount(WSOL, '0'),
            lpSupply: new TokenAmount(new Token(TOKEN_PROGRAM_ID, lpMintKeypair.publicKey, 9, 'LP', 'LP Token'), '0'),
            startTime: Date.now() / 1000,
            version: 4
        };

        // Get pool keys
        const associatedPoolKeys = await Liquidity.getAssociatedPoolKeys({
            version: 4,
            marketVersion: 3,
            marketId: Keypair.generate().publicKey,
            baseMint: mintAddress,
            quoteMint: SystemProgram.programId,
            baseDecimals: 9,
            quoteDecimals: 9,
            programId: DEVNET_PROGRAM_ID.AmmV4,
            marketProgramId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET,
        });

        // Create market keys
        const marketKeys = {
            marketBaseVault: Keypair.generate().publicKey,
            marketQuoteVault: Keypair.generate().publicKey,
            marketBids: Keypair.generate().publicKey,
            marketAsks: Keypair.generate().publicKey,
            marketEventQueue: Keypair.generate().publicKey,
        };

        const poolKeys: LiquidityPoolKeysV4 = {
            ...associatedPoolKeys,
            ...marketKeys
        };

        // Create pool initialization instruction
        const instructions = await Liquidity.makeCreatePoolV4InstructionV2({
            programId: poolKeys.programId,
            ammId: poolKeys.id,
            ammAuthority: poolKeys.authority,
            ammOpenOrders: poolKeys.openOrders,
            lpMint: lpMintKeypair.publicKey,
            coinMint: mintAddress,
            quoteMint: SystemProgram.programId,
            baseVault: poolKeys.baseVault,
            quoteVault: poolKeys.quoteVault,
            lpVault: poolKeys.lpVault,
            marketId: poolKeys.marketId,
            marketProgramId: poolKeys.marketProgramId,
            userKeys: {
                payer: bondingCurveKeypair.publicKey
            },
            connection,
            makeTxVersion: 0,
        });

        // Add instructions to transaction
        transaction.add(...instructions.innerTransaction.instructions);

        // Send and confirm transaction
        const signature = await connection.sendTransaction(transaction, [bondingCurveKeypair, lpMintKeypair]);
        await connection.confirmTransaction(signature, 'confirmed');

        // Return the pool and LP token addresses
        return {
            poolAddress: poolKeys.id,
            lpMintAddress: lpMintKeypair.publicKey
        };
    } catch (error) {
        console.error('Error creating Raydium pool:', error);
        throw new Error(`Failed to create Raydium pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 
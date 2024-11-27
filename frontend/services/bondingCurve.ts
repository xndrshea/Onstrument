import idl from '../../target/idl/bonding_curve.json';
import type { BondingCurve as BondingCurveIDL } from '../../target/types/bonding_curve';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Program, Idl, AnchorProvider } from '@coral-xyz/anchor';

import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';
import { createTokenParams, curveType } from '../../shared/types/token';
import { VersionedTransaction } from '@solana/web3.js';




// Required Program IDs
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const programId = new PublicKey('DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw');

// Add this type to match Anchor's enum representation
type AnchorCurveType =
    | { linear: Record<string, never> }
    | { exponential: Record<string, never> }
    | { logarithmic: Record<string, never> };

// Type-safe conversion function
function convertCurveType(type: curveType): AnchorCurveType {
    return { [type]: {} } as AnchorCurveType;
}

export class BondingCurve {
    private program: Program<BondingCurveIDL>;
    private connection: Connection;
    private wallet: WalletContextState | null;
    public readonly mintAddress: PublicKey | undefined;
    public readonly curveAddress: PublicKey | undefined;

    constructor(
        connection: Connection,
        wallet: WalletContextState,
        mintAddress?: PublicKey,
        curveAddress?: PublicKey
    ) {
        if (!connection) throw new Error('Connection is required');
        if (!wallet) throw new Error('Wallet is required');
        if (!wallet.publicKey) throw new Error('Wallet not connected');

        // Check if instructions exist before verification
        if (!idl.instructions || idl.instructions.length === 0) {
            throw new Error('IDL has no instructions defined');
        }

        // Look for create_token or createToken instruction
        const createTokenIx = idl.instructions.find(ix =>
            ix.name === 'createToken' || ix.name === 'create_token'
        );

        if (!createTokenIx) {
            console.error('Available instructions:', idl.instructions.map(ix => ix.name));
            throw new Error('createToken instruction not found in IDL. Please verify the IDL contains the correct instruction name.');
        }

        this.connection = connection;
        this.wallet = wallet;
        this.mintAddress = mintAddress;
        this.curveAddress = curveAddress;

        const provider = new AnchorProvider(
            connection,
            wallet as any,
            { commitment: 'confirmed' }
        );

        this.program = new Program(
            idl as BondingCurveIDL,
            provider
        );

        this.setupLogListener();
    }

    private async setupLogListener() {
        const logsCallback = (logs: any, ctx: any) => {
            console.log("Transaction logs:", logs);
        };

        const subscriptionId = await this.connection.onLogs(
            this.program.programId,
            logsCallback,
            "processed"
        );

        return subscriptionId; // Save this if you want to remove the listener later
    }

    async createTokenWithCurve(params: createTokenParams) {
        // Log input parameters
        console.log('Creating token with params:', JSON.stringify(params, null, 2));

        // Convert params to match program's expected format
        const convertedParams = {
            ...params,
            initialSupply: new BN(params.initialSupply),
            curveConfig: {
                ...params.curveConfig,
                curveType: convertCurveType(params.curveConfig.curveType),
                basePrice: new BN(params.curveConfig.basePrice),
                slope: new BN(params.curveConfig.slope),
                exponent: new BN(params.curveConfig.exponent),
                logBase: new BN(params.curveConfig.logBase),
            }
        };

        const mintKeypair = Keypair.generate();

        // Derive PDAs
        const [curveAddress] = PublicKey.findProgramAddressSync(
            [Buffer.from("bonding_curve"), mintKeypair.publicKey.toBuffer()],
            this.program.programId
        );

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), mintKeypair.publicKey.toBuffer()],
            this.program.programId
        );

        // Derive metadata address
        const [metadataAddress] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("metadata"),
                METADATA_PROGRAM_ID.toBuffer(),
                mintKeypair.publicKey.toBuffer(),
            ],
            METADATA_PROGRAM_ID
        );


        try {
            // Debug wallet state
            console.log('Wallet state:', {
                connected: this.wallet?.connected,
                publicKey: this.wallet?.publicKey?.toString(),
                signTransaction: !!this.wallet?.signTransaction,
                sendTransaction: !!this.wallet?.sendTransaction,
            });

            const tx = await this.program.methods
                .createToken(convertedParams)
                .accountsStrict({
                    creator: this.wallet!.publicKey!,
                    mint: mintKeypair.publicKey,
                    curve: curveAddress,
                    tokenVault: tokenVault,
                    metadata: metadataAddress,
                    metadataProgram: METADATA_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .signers([mintKeypair])
                .transaction();

            // Get latest blockhash
            const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
            tx.recentBlockhash = latestBlockhash.blockhash;
            tx.feePayer = this.wallet!.publicKey!;

            // Debug transaction
            console.log('Transaction details:', {
                signers: tx.signatures.map(s => s.publicKey.toString()),
                instructions: tx.instructions.length,
                recentBlockhash: tx.recentBlockhash,
                feePayer: tx.feePayer?.toString(),
            });

            // Try direct signing first
            if (!this.wallet?.signTransaction) {
                throw new Error('Wallet does not support signing');
            }

            // Sign with wallet first
            const signedTx = await this.wallet.signTransaction(tx);
            console.log('Transaction signed by wallet');

            // Then sign with mintKeypair
            signedTx.partialSign(mintKeypair);
            console.log('Transaction signed by mintKeypair');

            // Send the fully signed transaction
            const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: true,
                preflightCommitment: 'confirmed',
            });

            console.log('Transaction submitted:', signature);

            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
            }

            return { mint: mintKeypair.publicKey, curve: curveAddress, signature };

        } catch (err: any) {
            console.error('Detailed error:', {
                error: err,
                message: err.message,
                logs: err.logs,
                stack: err.stack,
                walletConnected: this.wallet?.connected,
                walletPublicKey: this.wallet?.publicKey?.toString(),
            });
            throw new Error(`Token creation failed: ${err.message || 'Unknown error'}`);
        }
    }

    async buy(params: {
        amount: number;
        maxSolCost: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        return await this.program.methods
            .buy(
                new BN(params.amount),
                new BN(params.maxSolCost * LAMPORTS_PER_SOL)
            )
            .accounts({
                buyer: this.wallet!.publicKey!,
                mint: this.mintAddress,
                buyerTokenAccount,
            })
            .rpc();
    }

    async sell(params: {
        amount: number;
        minSolReturn: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');
        if (!this.curveAddress) throw new Error('Curve address is required');

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        const [solVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("sol_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        const sellerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        return await this.program.methods
            .sell(
                new BN(params.amount),
                new BN(params.minSolReturn * LAMPORTS_PER_SOL)
            )
            .accounts({
                seller: this.wallet!.publicKey!,
                mint: this.mintAddress,
            })
            .rpc();
    }

    async getPriceQuote(amount: number, isBuy: boolean): Promise<{
        price: number;
        supplyDelta: number;
        isBuy: boolean;
    }> {
        if (!this.mintAddress) throw new Error('Mint address is required');

        const quote = await this.program.methods
            .getPriceInfo(new BN(amount), isBuy)
            .accounts({
                mint: this.mintAddress,
            })
            .view();

        return {
            price: Number(quote.price) / LAMPORTS_PER_SOL,
            supplyDelta: Number(quote.supplyDelta),
            isBuy: quote.isBuy
        };
    }

}

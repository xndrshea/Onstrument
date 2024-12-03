import idl from '../../target/idl/bonding_curve.json';
import type { BondingCurve as BondingCurveIDL } from '../../target/types/bonding_curve';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Program, Idl, AnchorProvider } from '@coral-xyz/anchor';

import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { BN } from 'bn.js';
import { createTokenParams } from '../../shared/types/token';
import { getProgramErrorMessage } from '../types/errors';

// Add this constant at the top of the file
const TOKEN_DECIMALS = 9;
const TOKEN_DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;

// Required Program IDs
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const programId = new PublicKey('Cf6CYaiGJVmTa1oTPJ4XWgMTyp3vRgeuTPkUkM5hYmar');
export class BondingCurve {
    public readonly program: Program<BondingCurveIDL>;
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
        try {
            const mintKeypair = Keypair.generate();

            // Log the PDAs being derived
            console.log('Deriving PDAs...');

            const [curveAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("bonding_curve"), mintKeypair.publicKey.toBuffer()],
                this.program.programId
            );
            console.log('Curve PDA:', curveAddress.toString());

            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), mintKeypair.publicKey.toBuffer()],
                this.program.programId
            );
            console.log('Token Vault PDA:', tokenVault.toString());

            // Derive metadata address
            const [metadataAddress] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    METADATA_PROGRAM_ID.toBuffer(),
                    mintKeypair.publicKey.toBuffer(),
                ],
                METADATA_PROGRAM_ID
            );
            console.log('Metadata PDA:', metadataAddress.toString());

            // Create token instruction
            console.log('Building create token instruction...');
            const createTokenIx = await this.program.methods
                .createToken({
                    curveConfig: {
                        basePrice: params.curveConfig.basePrice
                    },
                    totalSupply: params.totalSupply
                })
                .accounts({
                    creator: this.wallet!.publicKey!,
                    curve: curveAddress,
                    mint: mintKeypair.publicKey,
                    tokenVault: tokenVault,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                } as any)
                .signers([mintKeypair])
                .instruction();

            const createMetadataIx = await this.program.methods
                .createMetadata({
                    name: params.name,
                    symbol: params.symbol,
                    uri: params.metadataUri
                })
                .accounts({
                    creator: this.wallet!.publicKey!,
                    curve: curveAddress,
                    mint: mintKeypair.publicKey,
                    metadata: metadataAddress,
                    metadataProgram: METADATA_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                } as any)
                .instruction();

            // Build and send transaction
            const tx = await this.buildAndSendTransaction(
                [createTokenIx, createMetadataIx],
                [mintKeypair]
            );

            return {
                mint: mintKeypair.publicKey,
                curve: curveAddress,
                signature: tx
            };

        } catch (err: any) {
            console.error('Detailed error:', {
                error: err,
                message: err.message,
                logs: err.logs,
                programError: err.programError
            });
            throw err;
        }
    }

    private async buildAndSendTransaction(
        instructions: any[],
        signers: Keypair[]
    ) {
        const latestBlockhash = await this.connection.getLatestBlockhash();

        const tx = new Transaction();
        tx.feePayer = this.wallet!.publicKey!;
        tx.recentBlockhash = latestBlockhash.blockhash;
        tx.add(...instructions);

        if (!this.wallet?.signTransaction) {
            throw new Error('Wallet does not support signing');
        }

        const signedTx = await this.wallet.signTransaction(tx);
        signers.forEach(signer => signedTx.partialSign(signer));

        const signature = await this.connection.sendRawTransaction(signedTx.serialize());
        await this.connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });

        console.log(`Transaction submitted: https://solscan.io/tx/${signature}?cluster=devnet`);
        return signature;
    }

    async ensureTokenAccount(): Promise<PublicKey> {
        if (!this.mintAddress) throw new Error('Mint address is required');

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        try {
            const tokenAccountInfo = await this.connection.getAccountInfo(buyerTokenAccount);
            if (!tokenAccountInfo) {
                const createAtaIx = createAssociatedTokenAccountInstruction(
                    this.wallet!.publicKey!,
                    buyerTokenAccount,
                    this.wallet!.publicKey!,
                    this.mintAddress
                );

                const latestBlockhash = await this.connection.getLatestBlockhash();
                const tx = new Transaction();
                tx.feePayer = this.wallet!.publicKey!;
                tx.recentBlockhash = latestBlockhash.blockhash;
                tx.add(createAtaIx);

                const signedTx = await this.wallet!.signTransaction!(tx);
                const signature = await this.connection.sendRawTransaction(signedTx.serialize());
                await this.connection.confirmTransaction({
                    signature,
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                });
            }
            return buyerTokenAccount;
        } catch (error) {
            console.error('Error ensuring token account:', error);
            throw error;
        }
    }

    async buy(params: {
        amount: number;
        maxSolCost: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');
        if (!this.curveAddress) throw new Error('Curve address is required');

        // Convert to raw units and ensure they're integers
        const scaledAmount = Math.floor(params.amount * TOKEN_DECIMAL_MULTIPLIER);
        const scaledMaxCost = Math.floor(params.maxSolCost * LAMPORTS_PER_SOL);

        if (scaledAmount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        // Ensure token account exists
        const buyerTokenAccount = await this.ensureTokenAccount();

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        try {
            return await this.program.methods
                .buy(new BN(scaledAmount), new BN(scaledMaxCost))
                .accounts({
                    buyer: this.wallet!.publicKey!,
                    mint: this.mintAddress,
                    buyerTokenAccount,
                    curve: this.curveAddress,
                    tokenVault: tokenVault,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                } as any)
                .rpc();
        } catch (error: any) {
            console.error('Buy error:', {
                error,
                message: error.message,
                code: error.code,
                logs: error.logs
            });
            throw error;
        }
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
                sellerTokenAccount,
                curve: this.curveAddress,
                tokenVault: tokenVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any)
            .rpc();
    }

    async getPriceQuote(amount: number, isBuy: boolean): Promise<{
        price: number;
        isBuy: boolean;
    }> {
        if (!this.mintAddress || !this.curveAddress) {
            throw new Error('Mint address and curve address are required');
        }

        try {
            const tokenVault = this.getTokenVault();

            // Fetch and validate account states
            const [curveAccount, vaultAccount, curveSolBalance] = await Promise.all([
                this.program.account.bondingCurve.fetch(this.curveAddress),
                this.connection.getTokenAccountBalance(tokenVault),
                this.connection.getBalance(this.curveAddress),
            ]);

            console.log('Debug values:', {
                basePrice: curveAccount.config.basePrice.toString(),
                currentSupply: vaultAccount.value.amount,
                curveSolBalance: curveSolBalance,
                virtualSol: (BigInt(vaultAccount.value.amount) * BigInt(curveAccount.config.basePrice.toString())).toString(),
                scaledAmount: new BN(Math.floor(amount * TOKEN_DECIMAL_MULTIPLIER)).toString(),
                isBuy,
                accounts: {
                    mint: this.mintAddress.toString(),
                    curve: this.curveAddress.toString(),
                    tokenVault: tokenVault.toString()
                }
            });

            const scaledAmount = new BN(Math.floor(amount * TOKEN_DECIMAL_MULTIPLIER));

            const result = await this.program.methods
                .getPriceInfo(scaledAmount, isBuy)
                .accounts({
                    mint: this.mintAddress,
                    curve: this.curveAddress,
                    tokenVault: tokenVault,
                })
                .view();

            return {
                price: Number(result.price) / LAMPORTS_PER_SOL,
                isBuy: result.isBuy
            };
        } catch (error: any) {
            console.error('Price quote error:', error);
            throw error;
        }
    }

    private getTokenVault(): PublicKey {
        if (!this.mintAddress) throw new Error('Mint address is required');
        return PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        )[0];
    }

}

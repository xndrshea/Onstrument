import idl from '../../target/idl/bonding_curve.json';
import type { BondingCurve as BondingCurveIDL } from '../../target/types/bonding_curve';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { BN } from 'bn.js';
import { createTokenParams, TokenRecord } from '../../shared/types/token';
import { dexService } from './dexService';

// Add this constant at the top of the file
export const TOKEN_DECIMALS = 6;
const TOKEN_DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;

// Required Program IDs
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Add these constants at the top of the file
const MIGRATION_ADMIN = new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu'); // Replace with actual address

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
    }


    async createTokenWithCurve(params: createTokenParams) {
        try {
            const mintKeypair = Keypair.generate();

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

            const createTokenIx = await this.program.methods
                .createToken({
                    curveConfig: {
                        migrationStatus: { active: {} },
                        isSubscribed: false,
                        developer: this.wallet!.publicKey!
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

    /**
     * Ensures both user and admin have Associated Token Accounts (ATAs) for the token
     * @returns Object containing both ATAs
     */
    async ensureTokenAccounts(): Promise<{ userAta: PublicKey, adminAta: PublicKey }> {
        if (!this.mintAddress) throw new Error('Mint address is required');
        if (!this.wallet?.publicKey) throw new Error('Wallet not connected');

        // Get ATAs for both user and admin
        const [userAta, adminAta] = await Promise.all([
            getAssociatedTokenAddress(
                this.mintAddress,
                this.wallet.publicKey
            ),
            getAssociatedTokenAddress(
                this.mintAddress,
                MIGRATION_ADMIN
            )
        ]);

        try {
            // Check both accounts
            const [userAccountInfo, adminAccountInfo] = await Promise.all([
                this.connection.getAccountInfo(userAta),
                this.connection.getAccountInfo(adminAta)
            ]);

            const instructions: TransactionInstruction[] = [];

            // Create user ATA if needed
            if (!userAccountInfo) {
                instructions.push(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        userAta,
                        this.wallet.publicKey,
                        this.mintAddress
                    )
                );
            }

            // Create admin ATA if needed
            if (!adminAccountInfo) {
                instructions.push(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        adminAta,
                        MIGRATION_ADMIN,
                        this.mintAddress
                    )
                );
            }

            // If any ATAs need to be created
            if (instructions.length > 0) {
                await this.buildAndSendTransaction(instructions, []);
            }

            return { userAta, adminAta };
        } catch (error) {
            console.error('Error ensuring token accounts:', error);
            throw error;
        }
    }

    async buy(params: {
        amount: InstanceType<typeof BN> | number;
        maxSolCost: InstanceType<typeof BN> | number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        // Check if migrated to Raydium
        if (await this.shouldUseRaydium()) {
            return await dexService.executeTrade({
                mintAddress: this.mintAddress.toString(),
                amount: BN.isBN(params.amount) ? params.amount : new BN(params.amount),
                isSelling: false,
                slippageTolerance: 0.01,
                wallet: this.wallet!,
                connection: this.connection
            });
        }

        if (!this.curveAddress) throw new Error('Curve address is required');

        const rawAmount = BN.isBN(params.amount)
            ? params.amount
            : new BN(Math.floor(params.amount * TOKEN_DECIMAL_MULTIPLIER));

        const priceQuote = await this.getPriceQuote(
            Number(rawAmount) / TOKEN_DECIMAL_MULTIPLIER,
            true
        );

        const rawMaxSolCost = new BN(Math.ceil(priceQuote.totalCost * 1.01));

        if (rawAmount.lten(0)) {
            throw new Error('Amount must be greater than 0');
        }

        // Get both ATAs
        const { userAta: buyerTokenAccount, adminAta: adminTokenAccount } = await this.ensureTokenAccounts();

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        try {
            const tx = await this.program.methods
                .buy(
                    rawAmount,
                    rawMaxSolCost,
                    false
                )
                .accounts({
                    buyer: this.wallet!.publicKey!,
                    mint: this.mintAddress,
                    buyerTokenAccount,
                    migrationAdmin: MIGRATION_ADMIN,
                    migrationAdminTokenAccount: adminTokenAccount,
                    curve: this.curveAddress,
                    tokenVault: tokenVault,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                } as any)
                .rpc();

            console.log('Buy transaction successful:', tx);
            return tx;
        } catch (error: any) {
            throw error;
        }
    }

    async sell(params: {
        amount: InstanceType<typeof BN> | number;
        minSolReturn: InstanceType<typeof BN> | number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        if (await this.shouldUseRaydium()) {
            return await dexService.executeTrade({
                mintAddress: this.mintAddress.toString(),
                amount: BN.isBN(params.amount) ? params.amount : new BN(params.amount),
                isSelling: true,
                slippageTolerance: 0.01,
                wallet: this.wallet!,
                connection: this.connection
            });
        }

        if (!this.curveAddress) throw new Error('Curve address is required');

        const scaledAmount = BN.isBN(params.amount)
            ? params.amount
            : new BN(Math.floor(Math.max(0, params.amount * TOKEN_DECIMAL_MULTIPLIER)).toString());

        const scaledMinReturn = BN.isBN(params.minSolReturn)
            ? params.minSolReturn
            : new BN(Math.floor(Math.max(0, params.minSolReturn * LAMPORTS_PER_SOL)).toString());

        if (scaledAmount.lten(0)) {
            throw new Error('Amount must be greater than 0');
        }

        // Get both ATAs
        const { userAta: sellerTokenAccount, adminAta: adminTokenAccount } = await this.ensureTokenAccounts();

        // Verify token account has sufficient balance
        const tokenAccountInfo = await this.connection.getTokenAccountBalance(sellerTokenAccount);
        const currentBalance = new BN(tokenAccountInfo.value.amount);
        if (currentBalance.lt(scaledAmount)) {
            throw new Error('Insufficient token balance');
        }

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        try {
            const tx = await this.program.methods
                .sell(scaledAmount, scaledMinReturn, false)
                .accounts({
                    seller: this.wallet!.publicKey!,
                    mint: this.mintAddress,
                    curve: this.curveAddress,
                    sellerTokenAccount: sellerTokenAccount,
                    migrationAdmin: MIGRATION_ADMIN,
                    migrationAdminTokenAccount: adminTokenAccount,
                    tokenVault: tokenVault,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                } as any)
                .rpc();

            console.log('Sell transaction:', tx);
            return tx;
        } catch (error: any) {
            console.error('Sell error:', {
                error,
                message: error.message,
                code: error.code,
                logs: error.logs
            });
            throw error;
        }
    }

    async getPriceQuote(amount: number, isSelling: boolean): Promise<{
        price: number;
        totalCost: number;
        isSelling: boolean;
    }> {
        if (!this.mintAddress) throw new Error('Mint address is required');

        // Check if migrated to Raydium
        if (await this.shouldUseRaydium()) {
            return await dexService.calculateTradePrice(
                this.mintAddress.toString(),
                amount,
                isSelling,
                this.connection
            );
        }

        // Original bonding curve logic
        if (!this.curveAddress) throw new Error('Curve address is required');

        try {
            const scaledAmount = new BN(amount * TOKEN_DECIMAL_MULTIPLIER);
            const tokenVault = this.getTokenVault();

            // Check accounts individually and provide specific error messages
            const curveInfo = await this.connection.getAccountInfo(this.curveAddress);
            if (!curveInfo) {
                throw new Error(`Curve account ${this.curveAddress.toString()} not found`);
            }

            const vaultInfo = await this.connection.getAccountInfo(tokenVault);
            if (!vaultInfo) {
                throw new Error(`Token vault ${tokenVault.toString()} not found`);
            }

            try {
                const price = await this.program.methods
                    .calculatePrice(scaledAmount, isSelling)
                    .accounts({
                        mint: this.mintAddress,
                        curve: this.curveAddress,
                        tokenVault: tokenVault,
                    })
                    .view();

                return {
                    price: price.toNumber() / LAMPORTS_PER_SOL,
                    totalCost: price.toNumber(),
                    isSelling
                };
            } catch (viewError: any) {
                console.error('View method error:', viewError);
                // If the view method fails, try simulating the transaction
                const priceSimulation = await this.program.methods
                    .calculatePrice(scaledAmount, isSelling)
                    .accounts({
                        mint: this.mintAddress,
                        curve: this.curveAddress,
                        tokenVault: tokenVault,
                    })
                    .simulate();

                // Extract the return value from simulation logs
                // You might need to adjust this based on your program's actual logging
                console.log('Simulation result:', priceSimulation);
                throw new Error('Price calculation failed - please check program logs');
            }
        } catch (error: any) {
            console.error('Price quote error:', {
                error,
                curveAddress: this.curveAddress.toString(),
                mintAddress: this.mintAddress.toString(),
                tokenVault: this.getTokenVault().toString()
            });
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

    async shouldUseRaydium(): Promise<boolean> {
        if (!this.mintAddress) throw new Error('Mint address is required');

        try {
            // Just check database
            const response = await fetch(`/api/tokens/${this.mintAddress}`);
            const token = await response.json() as TokenRecord;
            return token.curveConfig?.migrationStatus === "migrated";
        } catch (error) {
            console.error('Error checking migration status:', error);
            return false;
        }
    }

    async getInitialPrice(): Promise<number> {
        if (!this.mintAddress || !this.curveAddress) throw new Error('Addresses required');

        const tokenVault = this.getTokenVault();
        const scaledAmount = new BN(1 * TOKEN_DECIMAL_MULTIPLIER);

        const price = await this.program.methods
            .calculatePrice(scaledAmount, false)
            .accounts({
                mint: this.mintAddress,
                curve: this.curveAddress,
                tokenVault: tokenVault,
            })
            .view();

        return price.toNumber() / LAMPORTS_PER_SOL;
    }

}

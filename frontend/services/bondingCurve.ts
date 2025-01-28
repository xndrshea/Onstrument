import idl from '../../target/idl/bonding_curve.json';
import type { BondingCurve as BondingCurveIDL } from '../../target/types/bonding_curve';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

import { Connection } from '@solana/web3.js';
import type { TransactionInstruction } from '@solana/web3.js';
import { PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, VersionedTransaction, ComputeBudgetProgram, TransactionMessage, SimulateTransactionConfig } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { BN } from 'bn.js';
import type { createTokenParams, TokenRecord } from '../../shared/types/token';
import { DexService } from './dexService';

const dexService = new DexService();

// Add this constant at the top of the file
export const TOKEN_DECIMALS = 6;
const TOKEN_DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;

// Required Program IDs
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Add at the top of the file
function getProvider(wallet: WalletContextState, connection: Connection) {
    // Try Phantom first
    if ('phantom' in window) {
        const provider = (window as any).phantom?.solana;
        if (provider?.isPhantom) {
            return provider;
        }
    }

    // Fallback to standard wallet adapter
    return {
        signAndSendTransaction: async (tx: Transaction) => {
            const signature = await wallet.sendTransaction(tx, connection);
            return { signature };
        }
    };
}

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

        // Use the wallet's connection for transactions
        this.connection = connection;  // Keep using passed connection
        this.wallet = wallet;
        this.mintAddress = mintAddress;
        this.curveAddress = curveAddress;


        const provider = new AnchorProvider(
            this.connection,
            wallet as any,
            { commitment: 'confirmed' }
        );



        this.program = new Program(
            idl as BondingCurveIDL,
            provider
        );

        console.log('Wallet details:', {
            wallet: this.wallet,
            connected: this.wallet?.connected,
            publicKey: this.wallet?.publicKey?.toString(),
            methods: Object.keys(this.wallet || {})
        });
    }


    async createTokenWithCurve(params: createTokenParams) {
        try {
            const mintKeypair = Keypair.generate();
            const migrationAdmin = new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu');

            const [curveAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("bonding_curve"), mintKeypair.publicKey.toBuffer()],
                this.program.programId
            );

            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), mintKeypair.publicKey.toBuffer()],
                this.program.programId
            );

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
                        isSubscribed: params.curveConfig.isSubscribed,
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

            const adminTokenAccount = await getAssociatedTokenAddress(
                mintKeypair.publicKey,
                migrationAdmin
            );
            const createAdminAtaIx = createAssociatedTokenAccountInstruction(
                this.wallet!.publicKey!,
                adminTokenAccount,
                migrationAdmin,
                mintKeypair.publicKey
            );

            const signature = await this.buildAndSendTransaction(
                [createTokenIx, createMetadataIx, createAdminAtaIx],
                [mintKeypair]
            );

            return {
                mint: mintKeypair.publicKey,
                curve: curveAddress,
                tokenVault: tokenVault,
                signature
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
        instructions: TransactionInstruction[],
        signers: Keypair[]
    ): Promise<string> {
        try {
            const provider = getProvider(this.wallet!, this.connection);

            const computeUnitIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 300_000
            });

            const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 500_000
            });

            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');

            const tx = new Transaction();
            tx.feePayer = this.wallet!.publicKey!;
            tx.recentBlockhash = blockhash;
            tx.add(computeUnitIx, priorityFeeIx, ...instructions);

            if (signers.length > 0) {
                tx.partialSign(...signers);
            }

            const { signature } = await provider.signAndSendTransaction(tx);

            // Keep confirmation logic
            let done = false;
            let retries = 30;
            while (!done && retries > 0) {
                const status = await this.connection.getSignatureStatus(signature);

                if (status?.value?.confirmationStatus === 'confirmed') {
                    done = true;
                } else if (status?.value?.confirmationStatus === 'processed' || status?.value?.confirmationStatus === 'finalized') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries--;
                } else if (!status?.value) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries--;
                } else {
                    throw new Error(`Transaction failed with status: ${status?.value?.confirmationStatus}`);
                }
            }

            if (!done) {
                throw new Error('Transaction confirmation timeout');
            }

            return signature;
        } catch (error) {
            console.error('Transaction failed:', error);
            throw error;
        }
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
                const signature = await this.wallet!.sendTransaction(signedTx, this.connection);
                await this.connection.confirmTransaction({
                    signature,
                    blockhash: tx.recentBlockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
                });
            }
            return buyerTokenAccount;
        } catch (error) {
            console.error('Error ensuring token account:', error);
            throw error;
        }
    }

    async buy(params: {
        amount: InstanceType<typeof BN> | number;
        maxSolCost: InstanceType<typeof BN> | number;
        isSubscribed: boolean;
        slippageTolerance: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        // Check if migrated to Raydium
        if (await this.shouldUseRaydium()) {
            return await dexService.executeTrade({
                mintAddress: this.mintAddress.toString(),
                amount: BN.isBN(params.amount) ? params.amount : new BN(params.amount),
                isSelling: false,
                slippageTolerance: params.slippageTolerance,
                wallet: this.wallet!,
                connection: this.connection,
                isSubscribed: params.isSubscribed
            });
        }

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        // Build instructions array
        const instructions: TransactionInstruction[] = [];

        // Check if ATA exists and add create instruction if needed
        const ataInfo = await this.connection.getAccountInfo(buyerTokenAccount);
        if (!ataInfo) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    this.wallet!.publicKey!,  // payer
                    buyerTokenAccount,        // ata
                    this.wallet!.publicKey!,  // owner
                    this.mintAddress          // mint
                )
            );
        }

        // Convert amount to raw token units
        const rawAmount = BN.isBN(params.amount)
            ? params.amount
            : new BN(Math.floor(params.amount * TOKEN_DECIMAL_MULTIPLIER));

        // Get price quote and validate
        const priceQuote = await this.getPriceQuote(
            Number(rawAmount) / TOKEN_DECIMAL_MULTIPLIER,
            true
        );
        const rawMaxSolCost = new BN(Math.ceil(priceQuote.totalCost * 1.01));
        if (rawAmount.lten(0)) {
            throw new Error('Amount must be greater than 0');
        }

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        // Add buy instruction
        const buyIx = await this.program.methods
            .buy(rawAmount, rawMaxSolCost, params.isSubscribed)
            .accounts({
                buyer: this.wallet!.publicKey!,
                mint: this.mintAddress,
                buyerTokenAccount,
                // @ts-ignore - Anchor types mismatch
                curve: this.curveAddress,
                tokenVault: tokenVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,  // Added rent sysvar
                feeCollector: new PublicKey('E5Qsw5J8F7WWZT69sqRsmCrYVcMfqcoHutX31xCxhM9L'),
                migrationAdmin: new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu'),
                migrationAdminTokenAccount: await getAssociatedTokenAddress(
                    this.mintAddress!,
                    new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu')
                )
            })
            .instruction();

        instructions.push(buyIx);

        // Send as single transaction
        return await this.buildAndSendTransaction(instructions, []);
    }

    async sell(params: {
        amount: InstanceType<typeof BN> | number;
        minSolReturn: InstanceType<typeof BN> | number;
        isSubscribed: boolean;
        slippageTolerance: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        // Check if migrated to Raydium
        if (await this.shouldUseRaydium()) {
            // Use dexService to execute trade
            return await dexService.executeTrade({
                mintAddress: this.mintAddress.toString(),
                amount: BN.isBN(params.amount) ? params.amount : new BN(params.amount),
                isSelling: true,
                slippageTolerance: params.slippageTolerance,
                wallet: this.wallet!,
                connection: this.connection,
                isSubscribed: params.isSubscribed
            });
        }

        if (!this.curveAddress) throw new Error('Curve address is required');

        // Convert to BN if number provided, with additional safety checks
        const scaledAmount = BN.isBN(params.amount)
            ? params.amount
            : new BN(Math.floor(Math.max(0, params.amount * TOKEN_DECIMAL_MULTIPLIER)).toString());

        const scaledMinReturn = BN.isBN(params.minSolReturn)
            ? params.minSolReturn
            : new BN(Math.floor(Math.max(0, params.minSolReturn * LAMPORTS_PER_SOL)).toString());

        if (scaledAmount.lten(0)) {
            throw new Error('Amount must be greater than 0');
        }

        // Get seller token account first
        const sellerTokenAccount = await this.ensureTokenAccount();

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
            const instruction = await this.program.methods
                .sell(scaledAmount, scaledMinReturn, params.isSubscribed)
                .accounts({
                    seller: this.wallet!.publicKey!,
                    mint: this.mintAddress,
                    // @ts-ignore - Anchor types mismatch
                    curve: this.curveAddress,
                    sellerTokenAccount: sellerTokenAccount,
                    tokenVault: tokenVault,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    feeCollector: new PublicKey('E5Qsw5J8F7WWZT69sqRsmCrYVcMfqcoHutX31xCxhM9L')
                })
                .instruction();

            return await this.buildAndSendTransaction([instruction], []);
        } catch (error: any) {
            console.error('Sell error:', error);
            throw error;
        }
    }

    async getPriceQuote(amount: number, isSelling: boolean): Promise<{
        price: number;
        totalCost: number;
        isSelling: boolean;
    }> {

        if (await this.shouldUseRaydium()) {
            if (!this.mintAddress) throw new Error('Mint address is required');
            const quote = await dexService.calculateTradePrice(
                this.mintAddress.toString(),
                amount,
                isSelling,
                this.connection
            );
            if (!quote) throw new Error('Failed to get price quote from Raydium');
            return quote;
        }


        if (!this.mintAddress || !this.curveAddress) throw new Error('Required addresses missing');
        const tokenVault = this.getTokenVault();

        if (isSelling) {

            const scaledAmount = new BN(amount * TOKEN_DECIMAL_MULTIPLIER);
            const price = await this.program.methods
                .calculatePrice(scaledAmount, true)
                .accounts({
                    mint: this.mintAddress,
                    curve: this.curveAddress,
                    tokenVault: tokenVault,
                })
                .view();


            const solReturn = price.toNumber() / LAMPORTS_PER_SOL;



            return {
                price: solReturn,
                totalCost: solReturn,  // For selling, this is how much SOL you get back
                isSelling: true
            };
        } else {
            // For buying with SOL, use calculate_tokens_for_sol
            const solAmount = new BN(amount * LAMPORTS_PER_SOL);
            const tokenAmount = await this.program.methods
                .calculateTokensForSol(solAmount)
                .accounts({
                    mint: this.mintAddress,
                    curve: this.curveAddress,
                    tokenVault: tokenVault,
                })
                .view();



            return {
                price: tokenAmount.toNumber() / TOKEN_DECIMAL_MULTIPLIER,
                totalCost: amount,
                isSelling: false
            };
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

    async buyWithSol(params: {
        solAmount: number;  // Amount in SOL
        slippageTolerance: number;
        isSubscribed: boolean;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        // Check if migrated to Raydium
        if (await this.shouldUseRaydium()) {
            return await dexService.executeTrade({
                mintAddress: this.mintAddress.toString(),
                amount: new BN(params.solAmount * LAMPORTS_PER_SOL),
                isSelling: false,
                slippageTolerance: params.slippageTolerance,
                wallet: this.wallet!,
                connection: this.connection,
                isSubscribed: params.isSubscribed
            });
        }

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        // Build instructions array
        const instructions: TransactionInstruction[] = [];

        // Check if ATA exists and add create instruction if needed
        const ataInfo = await this.connection.getAccountInfo(buyerTokenAccount);
        if (!ataInfo) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    this.wallet!.publicKey!,  // payer
                    buyerTokenAccount,        // ata
                    this.wallet!.publicKey!,  // owner
                    this.mintAddress          // mint
                )
            );
        }

        const rawSolAmount = new BN(params.solAmount * LAMPORTS_PER_SOL);

        // Get expected token amount
        const priceQuote = await this.getPriceQuote(params.solAmount, false);
        const minTokens = new BN(Math.floor(
            priceQuote.price *
            (1 - params.slippageTolerance) *
            TOKEN_DECIMAL_MULTIPLIER
        ));

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            this.program.programId
        );

        const buyIx = await this.program.methods
            .buyWithSol(rawSolAmount, minTokens, params.isSubscribed)
            .accounts({
                buyer: this.wallet!.publicKey!,
                mint: this.mintAddress,
                buyerTokenAccount,
                // @ts-ignore - Anchor types mismatch
                curve: this.curveAddress,
                tokenVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
                feeCollector: new PublicKey('E5Qsw5J8F7WWZT69sqRsmCrYVcMfqcoHutX31xCxhM9L'),
                migrationAdmin: new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu'),
                migrationAdminTokenAccount: await getAssociatedTokenAddress(
                    this.mintAddress,
                    new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu')
                )
            })
            .instruction();

        instructions.push(buyIx);

        return await this.buildAndSendTransaction(instructions, []);
    }

    async getCurrentPrice(): Promise<number> {
        if (!this.mintAddress || !this.curveAddress) throw new Error('Required addresses missing');

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

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

    }


    async createTokenWithCurve(params: createTokenParams): Promise<{ mint: PublicKey, curve: PublicKey, tokenVault: PublicKey }> {

        // Check SOL balance before proceeding
        const balance = await this.connection.getBalance(this.wallet!.publicKey!);
        const minimumRequired = 0.02 * LAMPORTS_PER_SOL; // Adding buffer for fees
        if (balance < minimumRequired) {
            throw new Error(`Insufficient SOL balance. Need at least 0.02 SOL to create token and metadata. Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        }

        // Match exact order from Rust program
        const [mintPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("token_mint"),
                this.wallet!.publicKey!.toBuffer(),
                Buffer.from(params.tokenSeed)
            ],
            this.program.programId
        );

        const [curvePDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("bonding_curve"),
                this.wallet!.publicKey!.toBuffer(),
                Buffer.from(params.tokenSeed)
            ],
            this.program.programId
        );

        const [tokenVaultPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("token_vault"),
                this.wallet!.publicKey!.toBuffer(),
                Buffer.from(params.tokenSeed)
            ],
            this.program.programId
        );



        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("metadata"),
                METADATA_PROGRAM_ID.toBuffer(),
                mintPDA.toBuffer(),
            ],
            METADATA_PROGRAM_ID
        );

        // Build all instructions in a single array
        const instructions: TransactionInstruction[] = [];

        // Add create token instruction
        instructions.push(
            await this.program.methods
                .createToken({
                    curveConfig: {
                        ...params.curveConfig,
                        migrationStatus: { active: {} },
                        developer: this.wallet!.publicKey!
                    },
                    totalSupply: new BN(params.totalSupply),
                    tokenSeed: params.tokenSeed
                })
                .accounts({
                    creator: this.wallet!.publicKey!,
                    // @ts-ignore - Anchor types mismatch
                    curve: curvePDA,
                    mint: mintPDA,
                    tokenVault: tokenVaultPDA,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY
                })
                .instruction()
        );

        instructions.push(
            createAssociatedTokenAccountInstruction(
                this.wallet!.publicKey!,
                await getAssociatedTokenAddress(mintPDA, new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu')),
                new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu'),
                mintPDA
            )
        );
        // Add metadata instruction using the SAME curve PDA
        instructions.push(
            await this.program.methods
                .createMetadata({
                    name: params.name,
                    symbol: params.symbol,
                    uri: params.metadataUri,
                    tokenSeed: params.tokenSeed,
                })
                .accounts({
                    creator: this.wallet!.publicKey!,
                    mint: mintPDA,
                    // @ts-ignore - Anchor types mismatch
                    curve: curvePDA,
                    metadata: metadataPDA,
                    metadataProgram: METADATA_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction()
        );

        // Add ATA creation instruction in the same transaction
        const buyerATA = await getAssociatedTokenAddress(mintPDA, this.wallet!.publicKey!);
        const ataInfo = await this.connection.getAccountInfo(buyerATA);
        if (!ataInfo) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    this.wallet!.publicKey!,
                    buyerATA,
                    this.wallet!.publicKey!,
                    mintPDA
                )
            );
        }

        // Send as single transaction
        const signature = await this.buildAndSendTransaction(instructions, []);

        // Wait for confirmation
        let retries = 0;
        while (retries < 30) {
            const status = await this.connection.getSignatureStatus(signature);
            if (status?.value?.confirmationStatus === 'confirmed' ||
                status?.value?.confirmationStatus === 'finalized') {
                break;
            }
            if (status?.value?.err) {
                throw new Error(`Transaction failed: ${status.value.err.toString()}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
        }

        return { mint: mintPDA, curve: curvePDA, tokenVault: tokenVaultPDA };
    }

    private async buildAndSendTransaction(
        instructions: TransactionInstruction[],
        signers: Keypair[]
    ): Promise<string> {
        try {
            if (!this.wallet?.publicKey) {
                throw new Error('Wallet not connected');
            }

            const provider = getProvider();
            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');

            const messageV0 = new TransactionMessage({
                payerKey: this.wallet.publicKey,
                recentBlockhash: blockhash,
                instructions
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);

            // Add transaction structure logging
            console.log('Transaction Structure:', {
                instructions: instructions.map(ix => ({
                    programId: ix.programId.toString(),
                    keys: ix.keys.map(k => ({
                        pubkey: k.pubkey.toString(),
                        isSigner: k.isSigner,
                        isWritable: k.isWritable
                    })),
                    data: ix.data.toString('hex')
                })),
                signers: signers.map(s => s.publicKey.toString())
            });

            // Simulate first
            try {
                const sim = await this.connection.simulateTransaction(transaction);
                console.log('Raw Simulation Result:', JSON.stringify(sim, null, 2));

                if (sim.value.err) {
                    const errorLogs = sim.value.logs?.join('\n') || '';
                    console.error('Transaction Simulation Failed. Full Logs:\n', errorLogs);

                    // NEW: Parse program-specific errors
                    const errorIndex = errorLogs.indexOf('Program log: Error:');
                    if (errorIndex > -1) {
                        const errorMessage = errorLogs.substring(errorIndex).split('\n')[0];
                        console.error('Program Error Message:', errorMessage.replace('Program log: Error: ', ''));
                    }

                    // Check for specific error patterns
                    if (errorLogs.includes('insufficient lamports')) {
                        const match = errorLogs.match(/insufficient lamports (\d+), need (\d+)/);
                        if (match) {
                            const needed = Number(match[2]) / LAMPORTS_PER_SOL;
                            throw new Error(`Insufficient SOL balance. You need ${needed.toFixed(4)} SOL to complete this transaction.`);
                        }
                    }

                    // NEW: Log program-specific error codes
                    const errorCodeMatch = errorLogs.match(/Custom program error: (\d+)/);
                    if (errorCodeMatch) {
                        console.error('Anchor Error Code:', errorCodeMatch[1]);
                        // You can add error code mapping here based on your program's error codes
                    }

                    throw new Error('Transaction failed during simulation. Please check your inputs and try again.');
                }
            } catch (simError: any) {
                console.error('Simulation Error Details:', {
                    message: simError.message,
                    logs: simError.logs || [],
                    stack: simError.stack
                });

                // NEW: Check for account existence issues
                if (simError.message.includes('Account does not exist')) {
                    const match = simError.message.match(/Account ([\w]+) does not exist/);
                    if (match) console.error('Missing account:', match[1]);
                }

                throw simError;
            }

            if (signers.length > 0) {
                transaction.sign(signers);
            }

            const { signature } = await provider.signAndSendTransaction(transaction);

            // Log explorer link
            const isDevnet = this.connection.rpcEndpoint.includes('devnet');
            const explorerUrl = `https://explorer.solana.com/tx/${signature}${isDevnet ? '?cluster=devnet' : ''}`;

            return signature;
        } catch (error: any) {
            console.error('Full Error Context:', {
                message: error.message,
                stack: error.stack,
                instructionData: instructions.map(ix => ix.data),
                signers: signers.map(s => s.publicKey.toString())
            });
            throw error;
        }
    }


    async ensureTokenAccount(): Promise<PublicKey> {
        if (!this.mintAddress) throw new Error('Mint address is required');

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        const tokenAccountInfo = await this.connection.getAccountInfo(buyerTokenAccount);
        if (!tokenAccountInfo) {
            const createAtaIx = createAssociatedTokenAccountInstruction(
                this.wallet!.publicKey!,
                buyerTokenAccount,
                this.wallet!.publicKey!,
                this.mintAddress
            );

            // Get Phantom provider directly
            const phantomProvider = getProvider();

            // Use VersionedTransaction
            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
            const messageV0 = new TransactionMessage({
                payerKey: this.wallet!.publicKey!,
                recentBlockhash: blockhash,
                instructions: [createAtaIx]
            }).compileToV0Message();

            const versionedTx = new VersionedTransaction(messageV0);

            // Use Phantom's provider directly
            const { signature } = await phantomProvider.signAndSendTransaction(versionedTx);

            // Wait for confirmation
            await this.connection.getSignatureStatus(signature);
        }
        return buyerTokenAccount;
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
        if (!this.mintAddress || !this.curveAddress) throw new Error('Required addresses missing');

        // Get curve account to get correct seeds
        const curveAccount = await this.program.account.bondingCurve.fetch(this.curveAddress);

        // Derive token vault with correct seeds
        const [tokenVault] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("token_vault"),
                curveAccount.config.developer.toBuffer(),
                Buffer.from(curveAccount.tokenSeed)
            ],
            this.program.programId
        );

        const sellerTokenAccount = await this.ensureTokenAccount();
        const scaledAmount = BN.isBN(params.amount)
            ? params.amount
            : new BN(Math.floor(params.amount * TOKEN_DECIMAL_MULTIPLIER));

        try {
            const instruction = await this.program.methods
                .sell(
                    scaledAmount,
                    BN.isBN(params.minSolReturn) ? params.minSolReturn : new BN(params.minSolReturn),
                    params.isSubscribed
                )
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

        try {
            // First fetch the curve account to get developer and token_seed
            const curveAccount = await this.program.account.bondingCurve.fetch(this.curveAddress);

            // Derive token vault with correct seeds
            const tokenVault = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("token_vault"),
                    curveAccount.config.developer.toBuffer(),
                    Buffer.from(curveAccount.tokenSeed)
                ],
                this.program.programId
            )[0];

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
        } catch (error) {
            console.error('GetPriceQuote error:', error);
            if (error instanceof Error && 'logs' in error) {
                console.error('Program logs:', error.logs);
            }
            throw error;
        }
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
        if (!this.mintAddress || !this.curveAddress) {
            throw new Error('Required addresses missing');
        }

        // Get curve account data first
        const curveAccount = await this.program.account.bondingCurve.fetch(this.curveAddress);

        const tokenVault = PublicKey.findProgramAddressSync(
            [
                Buffer.from("token_vault"),
                curveAccount.config.developer.toBuffer(),
                Buffer.from(curveAccount.tokenSeed)
            ],
            this.program.programId
        )[0];

        // Get price quote for 1 token
        const price = await this.program.methods
            .calculatePrice(new BN(1 * TOKEN_DECIMAL_MULTIPLIER), true)
            .accounts({
                mint: this.mintAddress,
                curve: this.curveAddress,
                tokenVault: tokenVault,
            })
            .view();

        return price.toNumber() / LAMPORTS_PER_SOL;
    }

    async buyWithSol(params: {
        solAmount: number;
        slippageTolerance: number;
        isSubscribed: boolean;
    }) {
        if (!this.mintAddress || !this.curveAddress) throw new Error('Required addresses missing');
        if (!this.wallet?.publicKey) throw new Error('Wallet not connected');

        // 1. Check/create buyer ATA
        const buyerATA = await getAssociatedTokenAddress(this.mintAddress, this.wallet.publicKey);
        const buyerATAInfo = await this.connection.getAccountInfo(buyerATA);

        const instructions: TransactionInstruction[] = [];

        if (!buyerATAInfo) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    this.wallet.publicKey,
                    buyerATA,
                    this.wallet.publicKey,
                    this.mintAddress
                )
            );
        }

        // 2. Check migration admin ATA (even if created earlier)
        const migrationAdmin = new PublicKey('G6SEeP1DqZmZUnXmb1aJJhXVdjffeBPLZEDb8VYKiEVu');
        const migrationAdminATA = await getAssociatedTokenAddress(this.mintAddress, migrationAdmin);
        const adminATAInfo = await this.connection.getAccountInfo(migrationAdminATA);

        if (!adminATAInfo) {
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    this.wallet.publicKey, // Payer
                    migrationAdminATA,
                    migrationAdmin,
                    this.mintAddress
                )
            );
        }

        // Get curve account to get correct seeds
        const curveAccount = await this.program.account.bondingCurve.fetch(this.curveAddress);

        // Derive token vault with correct seeds
        const [tokenVault] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("token_vault"),
                curveAccount.config.developer.toBuffer(),
                Buffer.from(curveAccount.tokenSeed)
            ],
            this.program.programId
        );

        // Rest of the method stays the same
        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet!.publicKey!
        );

        const rawSolAmount = new BN(params.solAmount * LAMPORTS_PER_SOL);
        const priceQuote = await this.getPriceQuote(params.solAmount, false);
        const minTokens = new BN(Math.floor(priceQuote.price * TOKEN_DECIMAL_MULTIPLIER));

        // Add curve signer seeds
        const [curve] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("bonding_curve"),
                curveAccount.config.developer.toBuffer(),
                Buffer.from(curveAccount.tokenSeed)
            ],
            this.program.programId
        );

        return await this.buildAndSendTransaction([
            await this.program.methods
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
                .signers([])
                .instruction()
        ], []);
    }

    async getCurrentPrice(): Promise<number> {
        if (!this.mintAddress || !this.curveAddress) {
            throw new Error('Required addresses missing');
        }

        try {
            // First fetch the curve account to get developer and token_seed
            const curveAccount = await this.program.account.bondingCurve.fetch(this.curveAddress);

            // Derive token vault with correct seeds
            const tokenVault = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("token_vault"),
                    curveAccount.config.developer.toBuffer(),
                    Buffer.from(curveAccount.tokenSeed)
                ],
                this.program.programId
            )[0];

            // Get price quote for 1 token
            const price = await this.program.methods
                .calculatePrice(new BN(1 * TOKEN_DECIMAL_MULTIPLIER), false)
                .accounts({
                    mint: this.mintAddress,
                    curve: this.curveAddress,
                    tokenVault: tokenVault,
                })
                .view();

            return price.toNumber() / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('GetCurrentPrice error:', error);
            // Log program logs if available
            if (error instanceof Error && 'logs' in error) {
                console.error('Program logs:', error.logs);
            }
            throw error;
        }
    }

}

declare global {
    interface Window {
        phantom?: any;
    }
}

const getProvider = () => {
    const phantom = window.phantom;
    const provider = phantom?.solana;
    if (provider?.isPhantom) {
        return provider;
    }
    throw new Error('Phantom wallet not found');
};

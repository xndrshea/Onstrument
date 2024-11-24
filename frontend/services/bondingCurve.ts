import { Program, AnchorProvider, Idl } from '@project-serum/anchor';
import {
    Connection,
    PublicKey,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL,
    SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TokenAccountNotFoundError,
    getAccount,
    getAssociatedTokenAddress,
} from '@solana/spl-token';
import { BN } from 'bn.js';
import { CurveType, CreateTokenParams } from '../../shared/types/token';
import IDL from '../../target/idl/bonding_curve.json';
import { WalletContextState } from '@solana/wallet-adapter-react';

const PROGRAM_ID = new PublicKey('AHEvJgq7txtTdF1UKfG8FmPEk145wKBV1FdbuNtwpk1F');

const PRICE_SCALE = LAMPORTS_PER_SOL; // 1e9 (1 SOL = 1,000,000,000 lamports)
const PARAM_SCALE = 10_000; // Fixed-point scaling for curve parameters

export class BondingCurve {
    private program: Program;
    private connection: Connection;
    private wallet: WalletContextState;
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

        this.connection = connection;
        this.wallet = wallet;
        this.mintAddress = mintAddress;
        this.curveAddress = curveAddress;

        const provider = new AnchorProvider(
            connection,
            {
                publicKey: wallet.publicKey,
                signTransaction: wallet.signTransaction!,
                signAllTransactions: wallet.signAllTransactions!,
            },
            { commitment: 'confirmed' }
        );
        this.program = new Program(IDL as unknown as Idl, PROGRAM_ID, provider);
    }

    async createTokenWithCurve(params: CreateTokenParams): Promise<{ mint: string, curve: string }> {
        console.log('[BondingCurve] Raw params:', params);

        try {
            // Generate a new keypair for the mint if not provided
            const mintKeypair = Keypair.generate();

            // Calculate PDAs
            const [curveAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("bonding_curve"), mintKeypair.publicKey.toBuffer()],
                PROGRAM_ID
            );

            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), mintKeypair.publicKey.toBuffer()],
                PROGRAM_ID
            );

            const [solVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("sol_vault"), mintKeypair.publicKey.toBuffer()],
                PROGRAM_ID
            );

            const creatorTokenAccount = await getAssociatedTokenAddress(
                mintKeypair.publicKey,
                this.wallet.publicKey!
            );

            console.log('[BondingCurve] Calling program with params:', params);
            console.log('[BondingCurve] Accounts:', {
                creator: this.wallet.publicKey?.toString(),
                mint: mintKeypair.publicKey.toString(),
                curve: curveAddress.toString(),
                tokenVault: tokenVault.toString(),
                solVault: solVault.toString(),
                creatorTokenAccount: creatorTokenAccount.toString()
            });

            const tx = await this.program.methods
                .createTokenWithCurve(params)
                .accounts({
                    creator: this.wallet.publicKey!,
                    mint: mintKeypair.publicKey,
                    curve: curveAddress,
                    tokenVault: tokenVault,
                    solVault: solVault,
                    creatorTokenAccount: creatorTokenAccount,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY
                })
                .signers([mintKeypair])
                .rpc();

            console.log('[BondingCurve] Transaction successful:', tx);
            return {
                mint: mintKeypair.publicKey.toString(),
                curve: curveAddress.toString()
            };
        } catch (error) {
            console.error('[BondingCurve] Transaction failed:', error);
            throw error;
        }
    }

    async buy(params: {
        amount: number;
        maxSolCost: number;
    }) {
        if (!this.mintAddress || !this.curveAddress) {
            throw new Error('Mint and curve addresses are required');
        }

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.program.provider.publicKey!
        );

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            PROGRAM_ID
        );

        const [solVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("sol_vault"), this.mintAddress.toBuffer()],
            PROGRAM_ID
        );

        return await this.program.methods
            .buy(
                new BN(params.amount),
                new BN(params.maxSolCost * LAMPORTS_PER_SOL)
            )
            .accounts({
                buyer: this.program.provider.publicKey,
                curve: this.curveAddress,
                mint: this.mintAddress,
                tokenVault,
                buyerTokenAccount,
                solVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    async sell(params: {
        amount: number;
        minSolReturn: number;
    }) {
        if (!this.mintAddress || !this.curveAddress) {
            throw new Error('Mint and curve addresses are required');
        }

        const sellerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.program.provider.publicKey!
        );

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), this.mintAddress.toBuffer()],
            PROGRAM_ID
        );

        const [solVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("sol_vault"), this.mintAddress.toBuffer()],
            PROGRAM_ID
        );

        return await this.program.methods
            .sell(
                new BN(params.amount),
                new BN(params.minSolReturn * LAMPORTS_PER_SOL)
            )
            .accounts({
                seller: this.program.provider.publicKey,
                curve: this.curveAddress,
                mint: this.mintAddress,
                sellerTokenAccount,
                tokenVault,
                solVault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    async getPriceQuote(
        amount: number,
        isBuy: boolean
    ): Promise<{
        spotPrice: number,
        totalPrice: number,
        priceImpact: number
    }> {
        if (!this.mintAddress || !this.curveAddress) {
            throw new Error('Mint and curve addresses are required');
        }

        try {
            const quote = await this.program.methods
                .getPriceQuote(
                    new BN(amount),
                    isBuy
                )
                .accounts({
                    mint: this.mintAddress,
                    curve: this.curveAddress,
                })
                .view();

            return {
                spotPrice: Number(quote.spotPrice) / LAMPORTS_PER_SOL,
                totalPrice: Number(quote.totalPrice) / LAMPORTS_PER_SOL,
                priceImpact: Number(quote.priceImpact) / 100,
            };
        } catch (error) {
            console.error('Error getting price quote:', error);
            throw error;
        }
    }

    async getCurveData() {
        if (!this.curveAddress) {
            throw new Error('Curve address is required');
        }
        return await this.program.account.bondingCurve.fetch(this.curveAddress);
    }

    async getUserBalance(userPublicKey: PublicKey): Promise<bigint> {
        if (!this.mintAddress) {
            throw new Error('Mint address is required');
        }
        try {
            const userATA = await getAssociatedTokenAddress(
                this.mintAddress,
                userPublicKey
            );
            const account = await getAccount(this.connection, userATA);
            return account.amount;
        } catch (error) {
            if (error instanceof TokenAccountNotFoundError) {
                return BigInt(0);
            }
            throw error;
        }
    }
}
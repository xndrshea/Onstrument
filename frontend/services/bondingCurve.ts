import { Program, AnchorProvider, Idl } from '@project-serum/anchor';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';
import { CreateTokenParams } from '../../shared/types/token';
import IDL from '../../target/idl/bonding_curve.json';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Required Program IDs
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

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
            wallet as any,
            { commitment: 'confirmed' }
        );
        this.program = new Program(
            IDL as unknown as Idl,
            new PublicKey("DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw"),
            provider
        );
    }

    async createTokenWithCurve(params: CreateTokenParams) {
        const mintKeypair = Keypair.generate();

        return await this.program.methods
            .createToken(params)
            .accounts({
                creator: this.wallet.publicKey!,
                mint: mintKeypair.publicKey,
                metadataProgram: METADATA_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY
            })
            .signers([mintKeypair])
            .rpc();
    }

    async buy(params: {
        amount: number;
        maxSolCost: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        const buyerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet.publicKey!
        );

        return await this.program.methods
            .buy(
                new BN(params.amount),
                new BN(params.maxSolCost * LAMPORTS_PER_SOL)
            )
            .accounts({
                buyer: this.wallet.publicKey!,
                mint: this.mintAddress,
                buyerTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId
            })
            .rpc();
    }

    async sell(params: {
        amount: number;
        minSolReturn: number;
    }) {
        if (!this.mintAddress) throw new Error('Mint address is required');

        const sellerTokenAccount = await getAssociatedTokenAddress(
            this.mintAddress,
            this.wallet.publicKey!
        );

        return await this.program.methods
            .sell(
                new BN(params.amount),
                new BN(params.minSolReturn * LAMPORTS_PER_SOL)
            )
            .accounts({
                seller: this.wallet.publicKey!,
                mint: this.mintAddress!,
                sellerTokenAccount,
            })
            .rpc();
    }

    async getPriceQuote(amount: number, isBuy: boolean) {
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
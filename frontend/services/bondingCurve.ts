import { Program, AnchorProvider } from '@project-serum/anchor';
import {
    Connection,
    PublicKey,
    SystemProgram,
    Keypair
} from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
} from '@solana/spl-token';
import { BN } from 'bn.js';
import { IDL } from '../idl/bonding_curve';
import { validateBondingCurveConfig } from '../utils/bondingCurveValidator';

const PROGRAM_ID = new PublicKey('HWy5j9JEBQedpxgvtYHY2BbvcJE774NaKSGfSUpR6GEM');

export class BondingCurve {
    private program: Program;

    constructor(connection: Connection, wallet: any) {
        const provider = new AnchorProvider(
            connection,
            wallet,
            AnchorProvider.defaultOptions()
        );
        this.program = new Program(IDL, PROGRAM_ID, provider);
    }

    async createToken(params: {
        name: string;
        symbol: string;
        totalSupply: number;
        basePrice: number;
        curveType: 'linear' | 'exponential' | 'logarithmic';
        slope?: number;
        exponent?: number;
        logBase?: number;
    }) {
        const config = {
            curveType: { [params.curveType]: {} },
            basePrice: new BN(params.basePrice),
            slope: params.slope ? new BN(params.slope) : null,
            exponent: params.exponent ? new BN(params.exponent) : null,
            logBase: params.logBase ? new BN(params.logBase) : null,
        };

        validateBondingCurveConfig(config);

        const mint = Keypair.generate();
        const [curve] = PublicKey.findProgramAddressSync(
            [Buffer.from("bonding_curve"), mint.publicKey.toBuffer()],
            PROGRAM_ID
        );

        const tx = await this.program.methods
            .initializeCurve(config)
            .accounts({
                authority: this.program.provider.publicKey,
                curve,
                mint: mint.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([mint])
            .rpc();

        return { mint: mint.publicKey.toString(), curve: curve.toString(), tx };
    }

    async buy(params: {
        curveAddress: string;
        amount: number;
        maxSolCost: number;
    }) {
        const curve = new PublicKey(params.curveAddress);
        const curveData = await this.program.account.curve.fetch(curve);

        const buyerTokenAccount = await getAssociatedTokenAddress(
            curveData.mint,
            this.program.provider.publicKey
        );

        const [tokenVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("token_vault"), curveData.mint.toBuffer()],
            PROGRAM_ID
        );

        const [vault] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), curveData.mint.toBuffer()],
            PROGRAM_ID
        );

        return await this.program.methods
            .buy(
                new BN(params.amount),
                new BN(params.maxSolCost)
            )
            .accounts({
                buyer: this.program.provider.publicKey,
                curve,
                mint: curveData.mint,
                tokenVault,
                buyerTokenAccount,
                vault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    async getPrice(curveAddress: string, amount: number): Promise<number> {
        const curve = new PublicKey(curveAddress);
        const curveData = await this.program.account.curve.fetch(curve);

        return this.calculatePrice(curveData, amount);
    }

    private calculatePrice(curveData: any, amount: number): number {
        const supply = Number(curveData.totalSupply);
        const basePrice = Number(curveData.config.basePrice);

        if ('linear' in curveData.config.curveType) {
            const slope = Number(curveData.config.slope);
            return (basePrice + (slope * supply)) * amount;
        }

        if ('exponential' in curveData.config.curveType) {
            const exponent = Number(curveData.config.exponent);
            return basePrice * Math.exp(exponent * supply) * amount;
        }

        const logBase = Number(curveData.config.logBase);
        return basePrice * Math.log(1 + logBase * supply) * amount;
    }
}
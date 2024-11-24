import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { tokenService } from './tokenService';
import { validateBondingCurveConfig } from "../../shared/utils/bondingCurveValidator";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export class TokenTransactionService {
    constructor(
        private connection: Connection,
        private wallet: {
            publicKey: PublicKey;
            sendTransaction: (transaction: Transaction) => Promise<string>;
            signTransaction: (transaction: Transaction) => Promise<Transaction>;
        },
        private program: any
    ) { }

    async createToken(config: {
        name: string;
        symbol: string;
        description?: string;
        totalSupply: number;
        bondingCurve: TokenBondingCurveConfig;
    }) {
        try {
            validateBondingCurveConfig(config.bondingCurve);

            const mintKeypair = Keypair.generate();
            const [curve] = PublicKey.findProgramAddressSync(
                [Buffer.from("bonding_curve"), mintKeypair.publicKey.toBuffer()],
                this.program.programId
            );

            // Initialize token and curve in one atomic transaction
            const tx = await this.program.methods
                .initializeCurve({
                    name: config.name,
                    symbol: config.symbol,
                    totalSupply: config.totalSupply,
                    config: config.bondingCurve
                })
                .accounts({
                    authority: this.wallet.publicKey,
                    mint: mintKeypair.publicKey,
                    curve,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([mintKeypair])
                .rpc();

            // Create database entry
            const dbToken = await tokenService.create({
                mint_address: mintKeypair.publicKey.toString(),
                name: config.name,
                symbol: config.symbol,
                description: config.description,
                total_supply: config.totalSupply,
                metadata: {
                    curveAddress: curve.toString()
                },
                bondingCurveConfig: config.bondingCurve
            });

            return { tx, mintKeypair, dbToken };
        } catch (error) {
            console.error('Error in TokenTransactionService.createToken:', error);
            throw error;
        }
    }
}
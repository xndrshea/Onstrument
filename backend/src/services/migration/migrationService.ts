import {
    Connection,
    PublicKey,
    Keypair,
} from '@solana/web3.js';
import BN from 'bn.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import {
    DEVNET_PROGRAM_ID,
    getCpmmPdaAmmConfigId,
} from '@raydium-io/raydium-sdk-v2';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import fs from 'fs';

const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const LAMPORTS_PER_SOL = 1_000_000_000;
const txVersion = 0;

export class MigrationService {
    private connection: Connection;
    private keypair: Keypair;

    constructor() {
        if (process.env.NODE_ENV === 'production' && !process.env.MIGRATION_ADMIN_KEYPAIR_PATH) {
            throw new Error('MIGRATION_ADMIN_KEYPAIR_PATH not set in production');
        }

        // If no MIGRATION_ADMIN_KEYPAIR_PATH is provided, generate a random keypair (for dev usage).
        if (!process.env.MIGRATION_ADMIN_KEYPAIR_PATH) {
            this.keypair = Keypair.generate();
            this.connection = new Connection('https://api.devnet.solana.com');
            return;
        }

        // Otherwise, load the keypair from file
        const rawKey = fs.readFileSync(process.env.MIGRATION_ADMIN_KEYPAIR_PATH);
        this.keypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(rawKey.toString()))
        );
        this.connection = new Connection(
            process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com'
        );
    }

    async handleMigrationEvent(event: {
        mint: string;
        realSolAmount: number;
        virtualSolAmount: number;
        tokenAmount: number;
        effectivePrice: number;
        developer: string;
        isSubscribed: boolean;
    }) {
        try {
            // 1. Update the "migrationStatus" in the DB to "migrated"
            await pool.query(
                `
                UPDATE token_platform.tokens
                SET 
                    curve_config = jsonb_set(
                        curve_config::jsonb,
                        '{migrationStatus}',
                        '"migrated"'
                    )
                WHERE mint_address = $1
            `,
                [event.mint]
            );
            logger.info('Updated migration status to migrated:', { mint: event.mint });

            // 2. Calculate pre-migration effective price
            const totalPreMigrationSol = event.realSolAmount + event.virtualSolAmount;
            const effectivePrice =
                event.tokenAmount > 0 ? totalPreMigrationSol / event.tokenAmount : 0;

            // 3. Subtract fees + safety buffer
            const RAYDIUM_POOL_CREATION_FEE = 0.15 * LAMPORTS_PER_SOL; // 0.15 SOL
            const ADMIN_SAFETY_BUFFER = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL

            const remainingSol =
                event.realSolAmount - RAYDIUM_POOL_CREATION_FEE - ADMIN_SAFETY_BUFFER;
            if (remainingSol <= 0) {
                throw new Error(
                    `Insufficient SOL for migration. ` +
                    `Available: ${event.realSolAmount / LAMPORTS_PER_SOL} SOL, ` +
                    `Required: ${(RAYDIUM_POOL_CREATION_FEE + ADMIN_SAFETY_BUFFER) / LAMPORTS_PER_SOL
                    } SOL`
                );
            }

            // 4. Calculate how many tokens to deposit in the new pool
            const requiredTokenAmount = remainingSol / effectivePrice;

            logger.info('Calculated migration amounts:', {
                totalPreMigrationSol,
                tokenAmount: event.tokenAmount,
                effectivePrice,
                poolCreationFee: RAYDIUM_POOL_CREATION_FEE / LAMPORTS_PER_SOL + ' SOL',
                safetyBuffer: ADMIN_SAFETY_BUFFER / LAMPORTS_PER_SOL + ' SOL',
                remainingSol: remainingSol / LAMPORTS_PER_SOL + ' SOL',
                requiredTokenAmount,
                isSubscribed: event.isSubscribed
            });

            // 5. Create the Raydium pool
            const poolAddress = await this.createRaydiumPool({
                tokenMint: new PublicKey(event.mint),
                initialLiquidity: {
                    tokenAmount: requiredTokenAmount,
                    solAmount: remainingSol
                }
            });

            // Since "sendAndConfirm: true" is used inside createRaydiumPool(),
            // the transaction is already confirmed at this point.

            // 6. Log success
            logger.info('Migration completed successfully', {
                mint: event.mint,
                poolAddress: poolAddress.toString(),
                effectivePrice: event.effectivePrice
            });
        } catch (error) {
            logger.error('Migration failed:', error);
            throw error;
        }
    }

    private async initSdk() {
        // Must have MIGRATION_ADMIN_KEYPAIR_PATH set
        if (!process.env.MIGRATION_ADMIN_KEYPAIR_PATH) {
            throw new Error('MIGRATION_ADMIN_KEYPAIR_PATH environment variable is not set');
        }

        // Load the admin keypair from file
        const rawKey = fs.readFileSync(process.env.MIGRATION_ADMIN_KEYPAIR_PATH);
        const adminKeypair = Keypair.fromSecretKey(
            Uint8Array.from(JSON.parse(rawKey.toString()))
        );

        // Log some debug info
        console.log('Initializing SDK with admin wallet:', {
            publicKey: adminKeypair.publicKey.toString(),
            hasSecretKey: !!adminKeypair.secretKey,
            balance:
                (await this.connection.getBalance(adminKeypair.publicKey)) / 1e9 + ' SOL'
        });

        // Load the Raydium SDK (devnet)
        return Raydium.load({
            connection: this.connection,
            owner: adminKeypair,
            cluster: 'devnet'
        });
    }

    private async createRaydiumPool(params: {
        tokenMint: PublicKey;
        initialLiquidity: {
            tokenAmount: number;
            solAmount: number;
        };
    }): Promise<PublicKey> {
        const sdk = await this.initSdk();

        console.log('Available CPMM methods:', Object.getOwnPropertyNames(sdk.cpmm));

        const feeConfigs = await sdk.api.getCpmmConfigs();
        if (sdk.cluster === 'devnet') {
            feeConfigs.forEach((config) => {
                config.id = getCpmmPdaAmmConfigId(
                    DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
                    config.index
                ).publicKey.toBase58();
            });
        }

        // 1. Get token info for both sides of the pool
        const mintAInfo = await sdk.token.getTokenInfo(params.tokenMint.toString());
        const mintBInfo = await sdk.token.getTokenInfo(WSOL_MINT.toString());

        // 2. Convert inputs to BN lamports
        //    Because we already computed 'params.initialLiquidity.tokenAmount' in lamports,
        //    we just do a floor to ensure an integer BN.
        const mintAAmount = new BN(Math.floor(params.initialLiquidity.tokenAmount));
        const mintBAmount = new BN(Math.floor(params.initialLiquidity.solAmount));

        logger.info('Creating Raydium pool with amounts:', {
            tokenAmount: params.initialLiquidity.tokenAmount,
            solAmount: params.initialLiquidity.solAmount,
            mintAAmountRaw: mintAAmount.toString(),
            mintBAmountRaw: mintBAmount.toString(),
            tokenDecimals: mintAInfo.decimals,
            solDecimals: mintBInfo.decimals
        });

        // 3. Build the createPool transaction
        const { execute, extInfo } = await sdk.cpmm.createPool({
            programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
            poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
            mintA: mintAInfo,
            mintB: mintBInfo,
            mintAAmount,
            mintBAmount,
            startTime: new BN(0),
            feeConfig: feeConfigs[0],
            associatedOnly: false,
            ownerInfo: {
                feePayer: this.keypair.publicKey, // We'll pay the fee from the admin keypair
                useSOLBalance: true,              // Let the SDK wrap SOL into wSOL as needed
            },
            computeBudgetConfig: {
                units: 600000,
                microLamports: 50000
            },
            txVersion
        });

        // 4. Execute (and auto-confirm)
        try {
            const { txId } = await execute({ sendAndConfirm: true });
            console.log('Transaction sent:', txId);

            // The pool's public key (not the tx signature!)
            const poolId = new PublicKey(extInfo.address.poolId);
            return poolId;
        } catch (error: any) {
            console.error('Pool creation failed:', error);

            // If we got a transaction signature, fetch logs for deeper debugging
            if (error.signature) {
                try {
                    const txReceipt = await this.connection.getTransaction(error.signature, {
                        maxSupportedTransactionVersion: 0,
                        commitment: 'confirmed'
                    });

                    if (!txReceipt) {
                        console.error('No transaction found for signature:', error.signature);
                    } else {
                        console.error('On-chain logs:', txReceipt.meta?.logMessages);
                        console.error('Transaction details:', {
                            fee: txReceipt.meta?.fee,
                            balanceChanges: txReceipt.meta?.postBalances?.map((bal, i) => ({
                                account: txReceipt.transaction.message
                                    .getAccountKeys()
                                    .get(i)
                                    ?.toString(),
                                balance: bal / 1e9
                            }))
                        });
                    }
                } catch (logError) {
                    console.error('Failed to fetch logs:', logError);
                }
            }

            throw error;
        }
    }
}

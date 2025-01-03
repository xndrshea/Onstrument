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
const txVersion = 0;

export class MigrationService {
    private connection: Connection;
    private migrationAdmin: Keypair;

    constructor() {
        this.connection = new Connection("https://api.devnet.solana.com", 'confirmed');

        const rawKey = JSON.parse(fs.readFileSync(
            process.env.MIGRATION_ADMIN_KEYPAIR_PATH!,
            'utf-8'
        ));
        this.migrationAdmin = Keypair.fromSecretKey(new Uint8Array(rawKey));
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
            const poolAddress = await this.createRaydiumPool({
                tokenMint: new PublicKey(event.mint),
                initialLiquidity: {
                    tokenAmount: event.tokenAmount,
                    solAmount: event.realSolAmount + event.virtualSolAmount
                }
            });

            const latestBlockhash = await this.connection.getLatestBlockhash();
            await this.connection.confirmTransaction({
                signature: poolAddress.toString(),
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });

            await pool.query(`
                UPDATE token_platform.tokens
                SET 
                    curve_config = jsonb_set(
                        curve_config::jsonb,
                        '{migrationStatus}',
                        '"migrated"'
                    )
                WHERE mint_address = $1
            `, [event.mint]);

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

    private async createRaydiumPool(params: {
        tokenMint: PublicKey,
        initialLiquidity: {
            tokenAmount: number,
            solAmount: number
        }
    }): Promise<PublicKey> {
        const sdk = await Raydium.load({
            connection: this.connection,
            owner: this.migrationAdmin.publicKey,
            cluster: 'devnet'
        });

        const feeConfigs = await sdk.api.getCpmmConfigs();

        if (sdk.cluster === 'devnet') {
            feeConfigs.forEach((config) => {
                config.id = getCpmmPdaAmmConfigId(
                    DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
                    config.index
                ).publicKey.toBase58();
            });
        }

        const mintAInfo = await sdk.token.getTokenInfo(params.tokenMint.toString());
        const mintBInfo = await sdk.token.getTokenInfo(WSOL_MINT.toString());

        const mintAAmount = new BN(params.initialLiquidity.tokenAmount * (10 ** mintAInfo.decimals));
        const mintBAmount = new BN(params.initialLiquidity.solAmount * (10 ** mintBInfo.decimals));

        const { execute, extInfo } = await sdk.cpmm.createPool({
            programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
            poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
            mintA: mintAInfo,
            mintB: mintBInfo,
            mintAAmount,
            mintBAmount,
            startTime: new BN(Math.floor(Date.now() / 1000)),
            feeConfig: feeConfigs[0],
            associatedOnly: false,
            ownerInfo: {
                useSOLBalance: true,
            },
            txVersion,
        });

        const { txId } = await execute({ sendAndConfirm: true });
        console.log('Transaction sent:', txId);

        const latestBlockhash = await this.connection.getLatestBlockhash();
        await this.connection.confirmTransaction({
            signature: txId,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        });

        return new PublicKey(extInfo.address.poolId);
    }
}

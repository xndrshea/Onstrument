import { Connection, PublicKey } from '@solana/web3.js';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { RaydiumService } from '../raydium/raydiumService';
import { config } from '../../config/env';

export class MigrationService {
    private connection: Connection;
    private raydiumService: RaydiumService;

    constructor() {
        this.connection = new Connection(config.HELIUS_RPC_URL);
        this.raydiumService = new RaydiumService();
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
            // 1. Create Raydium liquidity pool
            const poolAddress = await this.raydiumService.createLiquidityPool({
                tokenMint: new PublicKey(event.mint),
                initialLiquidity: {
                    tokenAmount: event.tokenAmount,
                    solAmount: event.realSolAmount + event.virtualSolAmount
                }
            });

            // 2. Update token record in database
            await pool.query(`
                UPDATE token_platform.tokens
                SET 
                    curve_config = jsonb_set(
                        curve_config::jsonb,
                        '{migrationStatus}',
                        '"migrated"'
                    ),
                    interface = 'raydium'
                WHERE mint_address = $1
            `, [event.mint]);

            // 3. Create pool record
            await pool.query(`
                INSERT INTO token_platform.raydium_pools (
                    pool_address,
                    base_mint,
                    quote_mint,
                    base_decimals,
                    quote_decimals,
                    program_id,
                    version,
                    pool_type
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8
                )
            `, [
                poolAddress.toString(),
                event.mint,
                config.WSOL_MINT, // Native SOL wrapped address
                6, // Standard SPL token decimals
                9, // SOL decimals
                config.RAYDIUM_PROGRAMS.V4_AMM,
                4,
                'STANDARD_AMM'
            ]);

            logger.info('Migration completed successfully', {
                mint: event.mint,
                poolAddress: poolAddress.toString()
            });

        } catch (error) {
            logger.error('Migration failed:', error);
            throw error;
        }
    }
} 
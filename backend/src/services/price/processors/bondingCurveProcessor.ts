import { BaseProcessor } from './baseProcessor';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { PriceHistoryModel } from '../../../models/priceHistoryModel';
import { MigrationService } from '../../migration/migrationService';
import { BN } from '@project-serum/anchor';
import { createHash } from 'crypto';

const VIRTUAL_SOL_AMOUNT = BigInt(30_000_000_000); // 30 SOL in lamports
const MIGRATION_EVENT_DISCRIMINATOR = createHash('sha256').update('event:MigrationEvent').digest('hex').slice(0, 8); // f015ae6d

export class BondingCurveProcessor extends BaseProcessor {
    private connection: Connection;
    private migrationService: MigrationService;

    constructor() {
        super();
        this.connection = new Connection(config.HELIUS_RPC_URL);
        this.migrationService = new MigrationService();
    }

    async processEvent(buffer: Buffer, curveAddress: string, programId: string): Promise<void> {
        try {
            // Deserialize curve account data
            if (buffer.length < 8 + 32 + 8 + 1) return; // Minimum size check

            const mintAddress = new PublicKey(buffer.subarray(8, 40)); // Skip discriminator
            const virtualSol = buffer.readBigUInt64LE(40);

            // Get curve's SOL balance
            const curveBalance = await this.connection.getBalance(new PublicKey(curveAddress));

            // Get token vault
            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), mintAddress.toBuffer()],
                new PublicKey(programId)
            );

            const vaultBalance = await this.connection.getTokenAccountBalance(tokenVault);
            const totalTokens = BigInt(vaultBalance.value.amount);

            if (totalTokens === 0n) return;

            // Calculate effective SOL (real + virtual)
            const effectiveSol = BigInt(curveBalance) + VIRTUAL_SOL_AMOUNT;

            // Calculate price using the bonding curve formula
            // Based on programs/bonding_curve/src/state/bonding_curve.rs
            const k = effectiveSol * totalTokens;
            const newTokenAmount = totalTokens - BigInt(1e9); // 1 token in base units
            const newSolAmount = k / newTokenAmount;
            const price = Number(newSolAmount - effectiveSol) / LAMPORTS_PER_SOL;

            const update = {
                mintAddress: mintAddress.toString(),
                price,
                timestamp: new Date(),
                volume: Number(vaultBalance.value.amount)
            };

            await PriceHistoryModel.recordPrice(update);

            // Check if this is a migration event
            if (buffer.length >= 8) {
                const discriminator = buffer.subarray(0, 8);
                if (discriminator.toString('hex') === MIGRATION_EVENT_DISCRIMINATOR) {
                    logger.info('Migration event detected!');

                    const migrationEvent = this.parseMigrationEvent(
                        Buffer.from(buffer.subarray(8, 40)),
                        Buffer.from(buffer.subarray(40))
                    );

                    if (migrationEvent) {
                        logger.info('Parsed migration event:', {
                            mint: migrationEvent.mint.toString(),
                            realSolAmount: migrationEvent.realSolAmount.toString(),
                            virtualSolAmount: migrationEvent.virtualSolAmount.toString(),
                            tokenAmount: migrationEvent.tokenAmount.toString(),
                            effectivePrice: migrationEvent.effectivePrice.toString(),
                            developer: migrationEvent.developer.toString(),
                            isSubscribed: migrationEvent.isSubscribed
                        });
                    }
                }
            }
        } catch (error) {
            logger.error(`Error processing Bonding Curve event: ${error}`);
        }
    }

    private parseMigrationEvent(accountKeys: Buffer, data: Buffer): {
        mint: PublicKey;
        realSolAmount: BN;
        virtualSolAmount: BN;
        tokenAmount: BN;
        effectivePrice: BN;
        developer: PublicKey;
        isSubscribed: boolean;
    } | null {
        try {
            const mint = new PublicKey(accountKeys);
            let offset = 8; // Skip discriminator

            const realSolAmount = new BN(data.subarray(offset, offset + 8), 'le');
            offset += 8;

            const virtualSolAmount = new BN(data.subarray(offset, offset + 8), 'le');
            offset += 8;

            const tokenAmount = new BN(data.subarray(offset, offset + 8), 'le');
            offset += 8;

            const effectivePrice = new BN(data.subarray(offset, offset + 8), 'le');
            offset += 8;

            const developer = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const isSubscribed = data.readUInt8(offset) === 1;

            return {
                mint,
                realSolAmount,
                virtualSolAmount,
                tokenAmount,
                effectivePrice,
                developer,
                isSubscribed
            };
        } catch (error) {
            logger.error('Error parsing migration event:', error);
            return null;
        }
    }
}

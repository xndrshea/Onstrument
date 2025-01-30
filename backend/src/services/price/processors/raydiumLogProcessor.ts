import { PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { config } from '../../../config/env';
import { BorshCoder } from '@coral-xyz/anchor';

export class RaydiumCpProcessor extends EventEmitter {
    private static instance: RaydiumCpProcessor;
    private readonly CP_PROGRAM_ID = config.RAYDIUM_PROGRAMS.CP_AMM;

    private constructor() {
        super();
    }

    public static getInstance(): RaydiumCpProcessor {
        if (!RaydiumCpProcessor.instance) {
            RaydiumCpProcessor.instance = new RaydiumCpProcessor();
        }
        return RaydiumCpProcessor.instance;
    }

    public async processLogs(signature: string, logs: string[]): Promise<void> {
        try {
            const rayLog = logs.find(log => log.includes('Program log: ray_log:'));
            if (!rayLog) return;

            const swapEventBase64 = rayLog.split('Program log: ray_log: ')[1];
            const swapEventBuffer = Buffer.from(swapEventBase64, 'base64');

            if (swapEventBuffer.length === 57) {
                const inputVaultBefore = swapEventBuffer.readBigUInt64LE(32);
                const inputAmount = swapEventBuffer.readBigUInt64LE(48);

                const swapEvent = {
                    poolId: new PublicKey(Buffer.from(swapEventBuffer.subarray(0, 32))),
                    inputVaultBefore,
                    outputVaultBefore: swapEventBuffer.readBigUInt64LE(40),
                    inputAmount,
                    baseInput: swapEventBuffer.readUInt8(56) === 1,
                    // Calculate derived values
                    inputVaultAfter: inputVaultBefore + inputAmount,
                    inputPercentage: Number((inputAmount * 10000n) / inputVaultBefore) / 100,
                    timestamp: new Date().toISOString()
                };

                logger.info('SWAP EVENT:', {
                    signature,
                    ...swapEvent,
                    // Format large numbers for readability
                    inputVaultBefore: swapEvent.inputVaultBefore.toString(),
                    outputVaultBefore: swapEvent.outputVaultBefore.toString(),
                    inputAmount: swapEvent.inputAmount.toString(),
                    inputVaultAfter: swapEvent.inputVaultAfter.toString(),
                    inputPercentage: `${swapEvent.inputPercentage}%`
                });
            }

        } catch (error) {
            logger.error('Error processing logs:', error);
        }
    }

    public getStatus() {
        return {
            programId: this.CP_PROGRAM_ID,
            isProcessing: true
        };
    }
} 
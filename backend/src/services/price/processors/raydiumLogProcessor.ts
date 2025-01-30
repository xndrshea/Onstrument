import { PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { config } from '../../../config/env';
import { BorshCoder } from '@coral-xyz/anchor';
import { getPool } from '../../../config/database';

export class RaydiumLogProcessor extends EventEmitter {
    private static instance: RaydiumLogProcessor;
    private readonly CP_PROGRAM_ID = config.RAYDIUM_PROGRAMS.CP_AMM;

    private constructor() {
        super();
    }

    public static getInstance(): RaydiumLogProcessor {
        if (!RaydiumLogProcessor.instance) {
            RaydiumLogProcessor.instance = new RaydiumLogProcessor();
        }
        return RaydiumLogProcessor.instance;
    }

    public async processLogs(signature: string, logs: string[]): Promise<void> {
        try {
            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];

                if (log.includes('Instruction: SwapBaseInput')) {
                    // Get the next log which contains the program data
                    const programDataLog = logs[i + 1];
                    if (programDataLog?.includes('Program data:')) {
                        const data = programDataLog.split('Program data: ')[1];
                        logger.debug('Found swap:', {
                            programData: data,
                            transfers: logs.filter(l => l.includes('TransferChecked')),
                            signature,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('Error processing logs:', {
                error,
                signature,
                timestamp: new Date().toISOString()
            });
        }
    }
} 
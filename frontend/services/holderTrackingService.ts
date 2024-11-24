import { Connection, PublicKey } from '@solana/web3.js';
import { db } from '../db';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export class HolderTrackingService {
    constructor(private connection: Connection) { }

    async updateHolderCount(mintAddress: string): Promise<number> {
        try {
            // Get all token accounts for this mint
            const accounts = await this.connection.getProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {
                            dataSize: 165, // Size of token account
                        },
                        {
                            memcmp: {
                                offset: 0,
                                bytes: mintAddress,
                            },
                        },
                    ],
                }
            );

            // Filter out zero balance accounts
            const activeHolders = accounts.filter(
                account => account.account.data.readBigInt64LE(64) > BigInt(0)
            );

            const holderCount = activeHolders.length;

            // Update database
            await db.query(
                `UPDATE token_platform.token_stats 
                 SET holder_count = $1, 
                     updated_at = CURRENT_TIMESTAMP
                 WHERE token_id = (
                     SELECT id FROM token_platform.tokens 
                     WHERE mint_address = $2
                 )`,
                [holderCount, mintAddress]
            );

            return holderCount;
        } catch (error) {
            console.error('Error updating holder count:', error);
            throw error;
        }
    }

    async getHolderAddresses(mintAddress: string): Promise<string[]> {
        const accounts = await this.connection.getProgramAccounts(
            TOKEN_PROGRAM_ID,
            {
                filters: [
                    {
                        dataSize: 165,
                    },
                    {
                        memcmp: {
                            offset: 0,
                            bytes: mintAddress,
                        },
                    },
                ],
            }
        );

        return accounts
            .filter(account => account.account.data.readBigInt64LE(64) > BigInt(0))
            .map(account => account.pubkey.toString());
    }
}
import { pool } from '../config/database'
import { logger } from '../utils/logger'

export interface Token {
    id?: number
    mint_address: string
    name: string
    symbol: string
    description?: string
    creator?: string
    creator_id?: number
    total_supply: number
    image_url?: string
    network?: 'mainnet' | 'devnet'
    metadata?: {
        bondingCurveATA?: string
        solReserves?: number
        currentSupply?: number
    }
    bonding_curve_config: {
        curveType: 'linear' | 'exponential' | 'logarithmic'
        basePrice: number
        slope?: number
        exponent?: number
        logBase?: number
    }
    created_at?: string
}

export const TokenModel = {
    async create(token: Token) {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            const existingToken = await client.query(
                'SELECT * FROM token_platform.tokens WHERE mint_address = $1',
                [token.mint_address]
            )

            if (existingToken.rows[0]) {
                await client.query('COMMIT')
                logger.info(`Token ${token.mint_address} already exists`)
                return existingToken.rows[0]
            }

            let creator_id = null
            if (token.creator) {
                const userResult = await client.query(
                    `INSERT INTO token_platform.users (wallet_address)
                     VALUES ($1)
                     ON CONFLICT (wallet_address) DO UPDATE SET last_login = CURRENT_TIMESTAMP
                     RETURNING id`,
                    [token.creator]
                )
                creator_id = userResult.rows[0].id
            }

            const result = await client.query(
                `INSERT INTO token_platform.tokens 
                (mint_address, metadata)
                VALUES ($1, $2)
                RETURNING *`,
                [
                    token.mint_address,
                    JSON.stringify({
                        name: token.name || 'Unnamed Token',
                        symbol: token.symbol || 'UNKNOWN',
                        description: token.description || '',
                        creator_id: creator_id,
                        total_supply: token.total_supply || 0,
                        image_url: token.image_url || '',
                        network: token.network || 'devnet',
                        bondingCurveATA: token.metadata?.bondingCurveATA || '',
                        solReserves: token.metadata?.solReserves || 0
                    })
                ]
            )

            await client.query('COMMIT')
            logger.info(`Token created successfully: ${token.mint_address}`)
            return result.rows[0]
        } catch (error) {
            await client.query('ROLLBACK')
            logger.error('Error creating token:', error)
            throw error
        } finally {
            client.release()
        }
    },

    async findAll() {
        try {
            logger.info('Attempting to fetch tokens from database');

            // Debug: Check what schemas exist
            const schemasResult = await pool.query(`
                SELECT schema_name 
                FROM information_schema.schemata
            `);
            logger.info('Available schemas:', schemasResult.rows);

            // Debug: Check what tables exist in our schema
            const tablesResult = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'token_platform'
            `);
            logger.info('Tables in token_platform:', tablesResult.rows);

            const result = await pool.query(
                'SELECT * FROM token_platform.tokens'  // You're using token_platform here
            );

            logger.info(`Found ${result.rows.length} tokens`);

            return result.rows.map(token => ({
                ...token,
                metadata: typeof token.metadata === 'string' ?
                    JSON.parse(token.metadata) : token.metadata
            }))
        } catch (error) {
            logger.error('Error fetching all tokens:', error)
            throw error
        }
    },

    async findByCreator(creator: string) {
        try {
            const result = await pool.query(
                `SELECT t.* FROM token_platform.tokens t
                 JOIN token_platform.users u ON t.metadata->>'creator_id' = u.id::text
                 WHERE u.wallet_address = $1
                 ORDER BY t.created_at DESC`,
                [creator]
            )
            return result.rows.map(token => ({
                ...token,
                metadata: typeof token.metadata === 'string' ?
                    JSON.parse(token.metadata) : token.metadata
            }))
        } catch (error) {
            logger.error('Error fetching tokens by creator:', error)
            throw error
        }
    },

    async findOne({ where }: { where: { mint_address: string } }) {
        try {
            const result = await pool.query(
                'SELECT * FROM token_platform.tokens WHERE mint_address = $1',
                [where.mint_address]
            )

            if (result.rows.length === 0) {
                return null
            }

            const token = result.rows[0]
            return {
                ...token,
                rawMetadata: token.metadata,
                update: async (data: any) => {
                    const updateResult = await pool.query(
                        'UPDATE token_platform.tokens SET metadata = $1 WHERE mint_address = $2 RETURNING *',
                        [data.rawMetadata, where.mint_address]
                    )
                    return updateResult.rows[0]
                }
            }
        } catch (error) {
            logger.error('Error finding token:', error)
            throw error
        }
    },

    async updateSolReserves(mintAddress: string, newReserves: number) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const token = await this.findOne({ where: { mint_address: mintAddress } });
            if (!token) throw new Error('Token not found');

            const updatedMetadata = {
                ...token.metadata,
                solReserves: newReserves
            };

            await client.query(
                `UPDATE token_platform.tokens 
                 SET metadata = $1
                 WHERE mint_address = $2`,
                [JSON.stringify(updatedMetadata), mintAddress]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
} 
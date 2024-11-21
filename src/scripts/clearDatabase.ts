import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function clearDatabase() {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // Clear all tables in the correct order to handle foreign key constraints
        await client.query('TRUNCATE TABLE token_platform.token_stats CASCADE')
        await client.query('TRUNCATE TABLE token_platform.tokens CASCADE')
        await client.query('TRUNCATE TABLE token_platform.users CASCADE')

        // Reset the sequences
        await client.query('ALTER SEQUENCE token_platform.tokens_id_seq RESTART WITH 1')
        await client.query('ALTER SEQUENCE token_platform.users_id_seq RESTART WITH 1')

        await client.query('COMMIT')
        console.log('Database cleared successfully')
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Error clearing database:', error)
    } finally {
        client.release()
        await pool.end()
    }
}

clearDatabase() 
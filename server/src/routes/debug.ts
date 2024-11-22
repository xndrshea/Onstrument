import { pool } from 'config/database';
import { Router } from 'express';
const router = Router();

router.get('/debug/database', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT COUNT(*) FROM token_platform.tokens');
        const tableInfo = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'token_platform' 
            AND table_name = 'tokens'
        `);
        client.release();

        res.json({
            status: 'connected',
            tokenCount: result.rows[0].count,
            tableSchema: tableInfo.rows
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}); 
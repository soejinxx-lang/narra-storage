/**
 * Get Episode ID for Comment Bot
 */

import { Pool } from 'pg';

async function getEpisodeId() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway')
            ? { rejectUnauthorized: false }
            : false,
    });

    try {
        const result = await pool.query(
            `SELECT id FROM episodes WHERE novel_id = $1 ORDER BY episode_number ASC LIMIT 1`,
            ['novel-1770910615867']
        );

        if (result.rows.length === 0) {
            console.log('❌ No episodes found for novel-1770910615867');
            return null;
        }

        console.log('✅ Episode ID:', result.rows[0].id);
        return result.rows[0].id;
    } catch (error) {
        console.error('Error:', error);
        return null;
    } finally {
        await pool.end();
    }
}

getEpisodeId();

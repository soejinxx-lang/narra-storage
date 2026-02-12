/**
 * Hide Test Author
 * 
 * Usage: tsx scripts/hide-test-author.ts
 */

import { Pool } from 'pg';

async function hideTestAuthor() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway')
            ? { rejectUnauthorized: false }
            : false,
    });

    try {
        console.log('Hiding Test author...');

        const result = await pool.query(
            'UPDATE users SET is_hidden = TRUE WHERE username = $1 RETURNING id, username, is_hidden',
            ['Test']
        );

        if (result.rows.length === 0) {
            console.log('❌ Test author not found');
        } else {
            console.log('✅ Test author hidden');
            console.log('ID:', result.rows[0].id);
            console.log('Username:', result.rows[0].username);
            console.log('Is Hidden:', result.rows[0].is_hidden);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

hideTestAuthor();

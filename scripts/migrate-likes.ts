import fs from 'fs';
import path from 'path';

// Manual .env loading
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            process.env[key] = value;
        }
    });
}

import db from "../app/db";

async function run() {
    console.log("Running migration: Add community_post_likes table...");

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS community_post_likes (
                post_id UUID NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (post_id, user_id),
                CONSTRAINT fk_post
                    FOREIGN KEY(post_id) 
                    REFERENCES community_posts(id)
                    ON DELETE CASCADE,
                CONSTRAINT fk_user
                    FOREIGN KEY(user_id) 
                    REFERENCES users(id)
                    ON DELETE CASCADE
            );
        `);
        console.log("Migration successful!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        process.exit();
    }
}

run();

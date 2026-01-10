/**
 * Create Master Admin Account
 * 
 * Usage:
 *   tsx scripts/create-admin.ts
 * 
 * Environment variables required:
 *   DATABASE_URL
 */

import { Pool } from 'pg';
import bcrypt from 'bcrypt';

async function createAdmin() {
  // DB connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    console.log('Creating admin account...');

    // Admin credentials
    const username = process.env.ADMIN_USERNAME || 'lego1357';
    const password = process.env.ADMIN_PASSWORD || 'blue2040';
    const name = 'Master Admin';

    // Check if admin column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_admin'
    `);

    // Add is_admin column if not exists
    if (columnCheck.rows.length === 0) {
      console.log('Adding is_admin column...');
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN is_admin BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Column added');
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      // Update existing user to admin
      console.log('User already exists, updating to admin...');
      const passwordHash = await bcrypt.hash(password, 10);
      
      await pool.query(
        'UPDATE users SET password_hash = $1, is_admin = TRUE WHERE username = $2',
        [passwordHash, username]
      );
      
      console.log('✅ Updated existing user to admin');
    } else {
      // Create new admin user
      console.log('Creating new admin user...');
      const passwordHash = await bcrypt.hash(password, 10);

      await pool.query(
        `INSERT INTO users (username, password_hash, name, is_admin)
         VALUES ($1, $2, $3, TRUE)`,
        [username, passwordHash, name]
      );

      console.log('✅ Admin account created');
    }

    // Verify
    const result = await pool.query(
      'SELECT id, username, name, is_admin FROM users WHERE username = $1',
      [username]
    );

    console.log('\n📊 Admin Account Info:');
    console.log('------------------------');
    console.log('ID:', result.rows[0].id);
    console.log('Username:', result.rows[0].username);
    console.log('Name:', result.rows[0].name);
    console.log('Is Admin:', result.rows[0].is_admin);
    console.log('------------------------\n');

    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createAdmin();

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

    // Ensure role column exists
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'reader';
    `);

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
        `UPDATE users SET password_hash = $1, role = 'admin' WHERE username = $2`,
        [passwordHash, username]
      );

      console.log('✅ Updated existing user to admin');
    } else {
      // Create new admin user
      console.log('Creating new admin user...');
      const passwordHash = await bcrypt.hash(password, 10);

      await pool.query(
        `INSERT INTO users (username, password_hash, name, role)
         VALUES ($1, $2, $3, 'admin')`,
        [username, passwordHash, name]
      );

      console.log('✅ Admin account created');
    }

    // Verify
    const result = await pool.query(
      'SELECT id, username, name, role FROM users WHERE username = $1',
      [username]
    );

    console.log('\n📊 Admin Account Info:');
    console.log('------------------------');
    console.log('ID:', result.rows[0].id);
    console.log('Username:', result.rows[0].username);
    console.log('Name:', result.rows[0].name);
    console.log('Role:', result.rows[0].role);
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


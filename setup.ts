/**
 * One-time setup script to manage database initialization.
 * Called by install.sh after the project is built.
 *
 * Usage: 
 *   node ./build/setup.js --check-user
 *   node ./build/setup.js --create-admin <username> <password>
 *   node ./build/setup.js --set-setting <key> <value>
 */
import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const args = process.argv.slice(2);
const command = args[0];

// Initialize SQLite database (same path as the main app)
const dbPath = path.join(process.cwd(), 'data', 'data.db');
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

// Ensure tables exist before querying
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

if (command === '--check-user') {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  console.log(userCount.count);
  db.close();
  process.exit(0);
} else if (command === '--set-setting') {
  const key = args[1];
  const value = args[2];
  if (!key || !value) {
    console.error('Usage: node setup.js --set-setting <key> <value>');
    process.exit(1);
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  console.log(`${key} set to: ${value}`);
  db.close();
  process.exit(0);
} else if (command === '--get-setting') {
  const key = args[1];
  if (!key) {
    console.error('Usage: node setup.js --get-setting <key>');
    process.exit(1);
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (row) {
    console.log(row.value);
  } else {
    // Return empty string or fallback in bash
    console.log('');
  }
  db.close();
  process.exit(0);
} else if (command === '--create-admin') {
  const username = args[1];
  const password = args[2];
  
  if (!username || !password) {
    console.error('Usage: node setup.js --create-admin <username> <password>');
    process.exit(1);
  }
  
  if (username.length < 3) {
    console.error('Username must be at least 3 characters long.');
    process.exit(1);
  }
  
  if (password.length < 6) {
    console.error('Password must be at least 6 characters long.');
    process.exit(1);
  }
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  
  if (userCount.count > 0) {
    console.log('An admin user already exists. Skipping setup.');
    db.close();
    process.exit(0);
  }
  
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (username, password_hash, email, role) 
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, `${username}@localhost`, 'admin');
  
  console.log(`Admin user "${username}" created successfully.`);
  db.close();
  process.exit(0);
} else {
  // Backwards compatibility for old arguments: <username> <password>
  const username = args[0];
  const password = args[1];
  
  if (!username || !password) {
    console.error('Usage: node setup.js --create-admin <username> <password>');
    console.error('       node setup.js --check-user');
    console.error('       node setup.js --set-setting <key> <value>');
    process.exit(1);
  }
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) {
    console.log('An admin user already exists. Skipping setup.');
    db.close();
    process.exit(0);
  }
  
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (username, password_hash, email, role) 
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, `${username}@localhost`, 'admin');
  
  console.log(`Admin user "${username}" created successfully.`);
  db.close();
  process.exit(0);
}

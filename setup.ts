/**
 * One-time setup script to create the initial admin user.
 * Called by install.sh after the project is built.
 *
 * Usage: node ./build/setup.js <username> <password>
 */
import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.error('Usage: node setup.js <username> <password>');
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

// Initialize SQLite database (same path as the main app)
const dbPath = path.join(process.cwd(), 'data', 'data.db');
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

// Ensure the users table exists
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
`);

// Check if any users already exist
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

if (userCount.count > 0) {
  console.log('An admin user already exists. Skipping setup.');
  process.exit(0);
}

// Hash the password and insert the admin user
const passwordHash = bcrypt.hashSync(password, 10);

db.prepare(`
  INSERT INTO users (username, password_hash, email, role) 
  VALUES (?, ?, ?, ?)
`).run(username, passwordHash, `${username}@localhost`, 'admin');

console.log(`Admin user "${username}" created successfully.`);
db.close();

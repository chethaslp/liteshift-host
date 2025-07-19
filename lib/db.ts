import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

// Initialize SQLite database
const dbPath = path.join(process.cwd(), 'data', 'data.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
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

  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    pm2_id INTEGER,
    repository_url TEXT,
    branch TEXT DEFAULT 'main',
    deploy_path TEXT NOT NULL,
    start_command TEXT NOT NULL,
    build_command TEXT,
    install_command TEXT DEFAULT 'bun install',
    status TEXT DEFAULT 'stopped',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    ssl_enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
    UNIQUE(domain)
  );

  CREATE TABLE IF NOT EXISTS app_env_vars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
    UNIQUE(app_id, key)
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    log TEXT,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deployment_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('git', 'file')),
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'building', 'completed', 'failed')),
    options TEXT NOT NULL,
    logs TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default settings if they don't exist
const insertDefaultSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
`);

insertDefaultSetting.run('apps_directory', '/var/www/apps');
insertDefaultSetting.run('caddy_config_path', '/etc/caddy/Caddyfile');
insertDefaultSetting.run('auto_ssl', 'true');
insertDefaultSetting.run('pm2_auto_startup', 'true');

// Create default admin user if no users exist
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const defaultPassword = bcrypt.hashSync('admin123', 10);
  
  // Use INSERT OR IGNORE to prevent constraint errors during build
  const result = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, email, role) 
    VALUES (?, ?, ?, ?)
  `).run('admin', defaultPassword, 'admin@localhost', 'admin');
  
  if (result.changes > 0) {
    console.log('Default admin user created: admin/admin123');
  }
}

export default db;

// Helper functions for database operations
export const dbHelpers = {
  // Users
  getUserByUsername: (username: string) => 
    db.prepare('SELECT * FROM users WHERE username = ?').get(username),
  
  updateUserLastLogin: (userId: number) =>
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId),

  getPasetoKey: () => {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get('paseto_key') as { value: string } | undefined;
    return result?.value;
  },

  // Apps
  getAllApps: () => 
    db.prepare('SELECT * FROM apps ORDER BY name').all(),
  
  getAppById: (id: number) =>
    db.prepare('SELECT * FROM apps WHERE id = ?').get(id),
  
  getAppByName: (name: string) =>
    db.prepare('SELECT * FROM apps WHERE name = ?').get(name),
  
  createApp: (app: any) =>
    db.prepare(`
      INSERT INTO apps (name, repository_url, branch, deploy_path, start_command, build_command, install_command)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(app.name, app.repository_url, app.branch, app.deploy_path, app.start_command, app.build_command, app.install_command),
  
  updateApp: (id: number, updates: any) => {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    return db.prepare(`UPDATE apps SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  },
  
  deleteApp: (id: number) =>
    db.prepare('DELETE FROM apps WHERE id = ?').run(id),

  // Domains
  getAppDomains: (appId: number) =>
    db.prepare('SELECT * FROM app_domains WHERE app_id = ? ORDER BY is_primary DESC, domain').all(appId),
  
  getAllDomains: () =>
    db.prepare(`
      SELECT d.*, a.name as app_name 
      FROM app_domains d 
      JOIN apps a ON d.app_id = a.id 
      ORDER BY d.domain
    `).all(),
  
  addAppDomain: (appId: number, domain: string, isPrimary: boolean = false) =>
    db.prepare('INSERT INTO app_domains (app_id, domain, is_primary) VALUES (?, ?, ?)').run(appId, domain, isPrimary),
  
  removeAppDomain: (id: number) =>
    db.prepare('DELETE FROM app_domains WHERE id = ?').run(id),

  // Environment Variables
  getAppEnvVars: (appId: number) =>
    db.prepare('SELECT * FROM app_env_vars WHERE app_id = ? ORDER BY key').all(appId),
  
  setAppEnvVar: (appId: number, key: string, value: string) =>
    db.prepare('INSERT OR REPLACE INTO app_env_vars (app_id, key, value) VALUES (?, ?, ?)').run(appId, key, value),
  
  removeAppEnvVar: (id: number) =>
    db.prepare('DELETE FROM app_env_vars WHERE id = ?').run(id),

  // Deployments
  createDeployment: (appId: number) =>
    db.prepare('INSERT INTO deployments (app_id) VALUES (?)').run(appId),
  
  updateDeployment: (id: number, status: string, log?: string) => {
    if (log) {
      return db.prepare('UPDATE deployments SET status = ?, log = ? WHERE id = ?').run(status, log, id);
    } else {
      return db.prepare('UPDATE deployments SET status = ? WHERE id = ?').run(status, id);
    }
  },
  
  getAppDeployments: (appId: number, limit: number = 10) =>
    db.prepare('SELECT * FROM deployments WHERE app_id = ? ORDER BY deployed_at DESC LIMIT ?').all(appId, limit),

  // Deployment Queue
  createQueueItem: (appName: string, type: string, options: string) =>
    db.prepare('INSERT INTO deployment_queue (app_name, type, options) VALUES (?, ?, ?)').run(appName, type, options),
  
  updateQueueStatus: (id: number, status: string, errorMessage?: string) => {
    const now = new Date().toISOString();
    if (status === 'building') {
      return db.prepare('UPDATE deployment_queue SET status = ?, started_at = ? WHERE id = ?').run(status, now, id);
    } else if (status === 'completed' || status === 'failed') {
      if (errorMessage) {
        return db.prepare('UPDATE deployment_queue SET status = ?, completed_at = ?, error_message = ? WHERE id = ?').run(status, now, errorMessage, id);
      } else {
        return db.prepare('UPDATE deployment_queue SET status = ?, completed_at = ? WHERE id = ?').run(status, now, id);
      }
    } else {
      return db.prepare('UPDATE deployment_queue SET status = ? WHERE id = ?').run(status, id);
    }
  },
  
  updateQueueLogs: (id: number, logs: string) =>
    db.prepare('UPDATE deployment_queue SET logs = ? WHERE id = ?').run(logs, id),
  
  appendQueueLogs: (id: number, newLogs: string) => {
    const current = db.prepare('SELECT logs FROM deployment_queue WHERE id = ?').get(id) as any;
    return db.prepare('UPDATE deployment_queue SET logs = ? WHERE id = ?').run((current?.logs || '') + newLogs, id);
  },
  
  getQueueItem: (id: number) =>
    db.prepare('SELECT * FROM deployment_queue WHERE id = ?').get(id),
  
  getAllQueueItems: () =>
    db.prepare('SELECT * FROM deployment_queue ORDER BY created_at DESC').all(),
  
  getQueuedItems: () =>
    db.prepare('SELECT * FROM deployment_queue WHERE status = ? ORDER BY created_at ASC').all('queued'),
  
  deleteQueueItem: (id: number) =>
    db.prepare('DELETE FROM deployment_queue WHERE id = ?').run(id),

  // Settings
  getSetting: (key: string) => {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return result?.value;
  },
  
  setSetting: (key: string, value: string) =>
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value),
};

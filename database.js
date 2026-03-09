import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'data', 'auth.db');
let db = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export async function initDatabase() {
  const database = getDb();
  
  // Create users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      email_verified INTEGER DEFAULT 0,
      name TEXT,
      image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      role TEXT DEFAULT 'user'
    )
  `);

  // Create sessions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create authentications table (social & email login methods)
  database.exec(`
    CREATE TABLE IF NOT EXISTS authentications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_id TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create verification codes table
  database.exec(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create account linking requests table
  database.exec(`
    CREATE TABLE IF NOT EXISTS linking_requests (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      new_provider TEXT NOT NULL,
      new_provider_id TEXT,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_user ON authentications(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_provider ON authentications(provider, provider_id);
    CREATE INDEX IF NOT EXISTS idx_session_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_verification_user ON verification_codes(user_id);
  `);

  console.log('✅ Database initialized');
  
  return database;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}


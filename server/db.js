/* ==========================================================================
   SQLite Database Initialization (Node.js built-in node:sqlite)
   ========================================================================== */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, 'edith.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    picture TEXT,
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'Email',
    telegram_chat_id TEXT,
    telegram_link_token TEXT,
    telegram_tts_voice TEXT NOT NULL DEFAULT 'en-IN-NeerjaNeural',
    phone_number TEXT,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    call_consent INTEGER NOT NULL DEFAULT 0,
    consent_timestamp TEXT,
    onboarding_complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    email TEXT NOT NULL,
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT,
    token_expiry INTEGER,
    is_default INTEGER NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, email)
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phone_number TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schedules (
    user_id INTEGER PRIMARY KEY,
    is_active INTEGER NOT NULL DEFAULT 1,
    telegram_chat_id TEXT,
    tts_voice TEXT NOT NULL DEFAULT 'en-IN-NeerjaNeural',
    mode TEXT NOT NULL DEFAULT 'once',
    preferred_time TEXT NOT NULL DEFAULT '09:00',
    interval_hours INTEGER NOT NULL DEFAULT 4,
    custom_times_json TEXT NOT NULL DEFAULT '["09:00","18:00"]',
    calling_window_enabled INTEGER NOT NULL DEFAULT 1,
    window_start TEXT NOT NULL DEFAULT '09:00',
    window_end TEXT NOT NULL DEFAULT '21:00',
    max_calls_per_day INTEGER NOT NULL DEFAULT 4,
    skip_if_empty INTEGER NOT NULL DEFAULT 1,
    include_weekends INTEGER NOT NULL DEFAULT 1,
    summary_length TEXT NOT NULL DEFAULT 'Standard (3-4 minutes)',
    timezone TEXT NOT NULL DEFAULT '(GMT+5:30) India Standard Time',
    last_call_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS call_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    called_at TEXT NOT NULL DEFAULT (datetime('now')),
    emails_covered INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    telegram_chat_id TEXT,
    voice_used TEXT,
    summary_preview TEXT,
    telegram_message_id TEXT,
    spoken_greeting TEXT,
    spoken_script TEXT,
    summary_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Safe migrations for existing local SQLite databases
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('picture')) {
  db.exec('ALTER TABLE users ADD COLUMN picture TEXT');
}
if (!userCols.includes('telegram_chat_id')) {
  db.exec('ALTER TABLE users ADD COLUMN telegram_chat_id TEXT');
}
if (!userCols.includes('telegram_link_token')) {
  db.exec('ALTER TABLE users ADD COLUMN telegram_link_token TEXT');
}
if (!userCols.includes('telegram_tts_voice')) {
  db.exec("ALTER TABLE users ADD COLUMN telegram_tts_voice TEXT NOT NULL DEFAULT 'en-IN-NeerjaNeural'");
}
const accCols = db.prepare('PRAGMA table_info(email_accounts)').all().map((c) => c.name);
if (!accCols.includes('confirmed')) {
  db.exec('ALTER TABLE email_accounts ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0');
}
const schedCols = db.prepare('PRAGMA table_info(schedules)').all().map((c) => c.name);
if (!schedCols.includes('telegram_chat_id')) {
  db.exec('ALTER TABLE schedules ADD COLUMN telegram_chat_id TEXT');
}
if (!schedCols.includes('tts_voice')) {
  db.exec("ALTER TABLE schedules ADD COLUMN tts_voice TEXT NOT NULL DEFAULT 'en-IN-NeerjaNeural'");
}
const callCols = db.prepare('PRAGMA table_info(call_history)').all().map((c) => c.name);
if (!callCols.includes('spoken_greeting')) {
  db.exec('ALTER TABLE call_history ADD COLUMN spoken_greeting TEXT');
}
if (!callCols.includes('telegram_chat_id')) {
  db.exec('ALTER TABLE call_history ADD COLUMN telegram_chat_id TEXT');
}
if (!callCols.includes('voice_used')) {
  db.exec('ALTER TABLE call_history ADD COLUMN voice_used TEXT');
}
if (!callCols.includes('summary_preview')) {
  db.exec('ALTER TABLE call_history ADD COLUMN summary_preview TEXT');
}
if (!callCols.includes('telegram_message_id')) {
  db.exec('ALTER TABLE call_history ADD COLUMN telegram_message_id TEXT');
}

module.exports = db;

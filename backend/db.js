// db.js
// This file sets up our database. We use SQLite, which stores the whole
// database as a single file (fitlift.db) sitting right next to this code -
// no separate database server to install. Perfect for learning + small apps.

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'fitlift.db'));
db.pragma('journal_mode = WAL');

// Run once on startup: create tables if they don't already exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    bodyweight_kg REAL NOT NULL,
    bio TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    lift_name TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    reps INTEGER NOT NULL,
    bodyweight_kg REAL NOT NULL,
    caption TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    base_points REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    value INTEGER NOT NULL, -- 1 for upvote, -1 for downvote
    UNIQUE(post_id, user_id)
  );
`);

module.exports = db;

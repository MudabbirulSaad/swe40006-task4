CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    color TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_owner ON notes(user_id);

-- Import receipts outlive deleted notes so retrying an old transfer cannot resurrect them.
CREATE TABLE IF NOT EXISTS imports (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    PRIMARY KEY(user_id, client_id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
    identity TEXT PRIMARY KEY,
    failures INTEGER NOT NULL,
    expires_at REAL NOT NULL
);
PRAGMA user_version = 1;

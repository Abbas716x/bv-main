CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'deactivated')),
    created_at TEXT NOT NULL,
    last_opened_at TEXT,
    open_count INTEGER NOT NULL DEFAULT 0,
    frozen_reason TEXT,
    frozen_at TEXT,
    unfrozen_at TEXT,
    deactivated_at TEXT,
    deactivated_reason TEXT
);

CREATE TABLE IF NOT EXISTS tenant_data (
    branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    branch_user TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    client_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    severity TEXT NOT NULL DEFAULT 'normal'
);

CREATE INDEX IF NOT EXISTS audit_logs_epoch_idx ON audit_logs(epoch DESC);
CREATE INDEX IF NOT EXISTS audit_logs_branch_idx ON audit_logs(branch_id, epoch DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('master_admin', 'branch')),
    branch_id TEXT,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    frozen INTEGER NOT NULL DEFAULT 0,
    reason TEXT
);

INSERT OR IGNORE INTO system_state (id, frozen, reason) VALUES (1, 0, NULL);

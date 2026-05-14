/**
 * frontend/src/lib/db.ts — Read-only data DB connection (better-sqlite3).
 *
 * Written by the Python pipeline; Next.js only reads.
 * Board DB lives in board-db.ts — separate file, separate connection.
 *
 * DB path priority:
 *   1. DATA_DB_PATH env var
 *   2. /data/data.db  (Docker / Synology volume)
 *   3. <project_root>/output/data.db  (local dev: cwd = frontend/)
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname, join } from 'path';

function getDataDbPath(): string {
  if (process.env.DATA_DB_PATH) return process.env.DATA_DB_PATH;
  if (existsSync('/data')) return '/data/data.db';
  // local dev: frontend/ is cwd, output/data.db is one level up
  return join(process.cwd(), '..', 'output', 'data.db');
}

let _db: Database.Database | null = null;
let _dbMtime = 0;
let _dbPath = '';

export function getDataDb(): Database.Database | null {
  try {
    const dbPath = getDataDbPath();
    if (!existsSync(dbPath)) { _db = null; return null; }

    // Reopen if file was replaced by daily pipeline upload
    const mtime = statSync(dbPath).mtimeMs;
    if (_db && _dbPath === dbPath && mtime === _dbMtime) return _db;

    try { _db?.close(); } catch { /* ignore close errors */ }
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    _db = new Database(dbPath, { readonly: true });
    _db.pragma('journal_mode = WAL');
    _dbMtime = mtime;
    _dbPath = dbPath;
    return _db;
  } catch {
    _db = null;
    return null;
  }
}

/** Parse data_json column and return typed result, or null on failure. */
export function parseJson<T>(row: unknown): T | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.data_json !== 'string') return null;
  try {
    return JSON.parse(r.data_json) as T;
  } catch {
    return null;
  }
}

/** Standard 503 response when DB is unavailable. */
export function dbUnavailable() {
  return Response.json({ error: 'data DB not available' }, { status: 503 });
}

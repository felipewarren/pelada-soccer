// Postgres data layer (pg). Uses DATABASE_URL; SQL uses `?` placeholders converted to $1..$n.
// Default driver: pg over TCP 5432 (Render). PG_DRIVER=neon-ws uses Neon's pg-compatible Pool over WebSocket/443,
// for networks that block outbound 5432 (e.g. this dev box).
let { Pool, types } = require('pg');
if (process.env.PG_DRIVER === 'neon-ws') {
  const neon = require('@neondatabase/serverless'); neon.neonConfig.webSocketConstructor = require('ws'); ({ Pool, types } = neon);
}
types.setTypeParser(20, v => parseInt(v, 10));   // int8 (COUNT/SUM) -> number
types.setTypeParser(1700, v => parseFloat(v));   // numeric -> number

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
// Neon URLs carry sslmode=require; pg treats it as verify-full anyway, so say so explicitly (silences pg's deprecation warning).
const url = process.env.DATABASE_URL.replace(/sslmode=(prefer|require|verify-ca)\b/, 'sslmode=verify-full');
const pool = new Pool({ connectionString: url, max: 5 });
pool.on('error', e => console.error('pg pool error', e.message));

const conv = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
const wrap = c => ({
  run: (sql, ...p) => c.query(conv(sql), p),
  all: async (sql, ...p) => (await c.query(conv(sql), p)).rows,
  get: async (sql, ...p) => (await c.query(conv(sql), p)).rows[0],
});
const db = wrap(pool);
db.pool = pool;
db.tx = async fn => {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(wrap(c)); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
};

const NOW = `to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`;
db.NOW = NOW;
db.migrate = () => pool.query(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS players (id SERIAL PRIMARY KEY, name TEXT NOT NULL, nickname TEXT, photo TEXT,
  position TEXT DEFAULT 'CM', can_gk INTEGER DEFAULT 0, age INTEGER, atk INTEGER DEFAULT 60, def INTEGER DEFAULT 60,
  str INTEGER DEFAULT 60, skl INTEGER DEFAULT 60, pin TEXT UNIQUE, is_demo INTEGER DEFAULT 0, lang TEXT,
  created_at TEXT DEFAULT ${NOW});
CREATE TABLE IF NOT EXISTS games (id SERIAL PRIMARY KEY, date TEXT UNIQUE, capacity INTEGER DEFAULT 32,
  status TEXT DEFAULT 'open', teams_json TEXT, matches_json TEXT, mvp_id INTEGER);
CREATE TABLE IF NOT EXISTS attendance (seq BIGSERIAL, game_id INTEGER, player_id INTEGER, status TEXT, at TEXT DEFAULT ${NOW},
  PRIMARY KEY (game_id, player_id));
CREATE TABLE IF NOT EXISTS game_stats (game_id INTEGER, player_id INTEGER, team INTEGER, is_gk INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0, assists INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, rating DOUBLE PRECISION, wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, clean_sheets INTEGER DEFAULT 0, score DOUBLE PRECISION,
  PRIMARY KEY (game_id, player_id));
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, player_id INTEGER, created_at TEXT DEFAULT ${NOW});
`);
module.exports = db;

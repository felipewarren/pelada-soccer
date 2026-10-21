// One-off: copy data/pelada.db (legacy SQLite) into Postgres (DATABASE_URL). Skips sessions and the old manager PIN hash.
// Usage: node tools-import-sqlite.js   (needs devDependency better-sqlite3; target tables must be empty)
require('dotenv').config({ quiet: true });
const Database = require('better-sqlite3'); const db = require('./db');
const src = new Database(__dirname + '/data/pelada.db', { readonly: true });
const TABLES = { settings: null, players: 'id', games: 'id', attendance: null, game_stats: null };
(async () => {
  await db.migrate();
  if ((await db.get('SELECT COUNT(*) n FROM players')).n) throw new Error('players table not empty; refusing to import');
  await db.tx(async t => {
    for (const [tb, serial] of Object.entries(TABLES)) {
      let rows = src.prepare(`SELECT * FROM ${tb}${tb === 'attendance' ? ' ORDER BY at, rowid' : ''}`).all();
      if (tb === 'settings') rows = rows.filter(r => r.key !== 'manager_pin_hash');
      for (const r of rows) { const k = Object.keys(r); await t.run(`INSERT INTO ${tb}(${k.join(',')}) VALUES(${k.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`, ...k.map(x => r[x])); }
      if (serial) await t.run(`SELECT setval(pg_get_serial_sequence('${tb}','id'), GREATEST((SELECT MAX(id) FROM ${tb}), 1))`);
      console.log(tb, rows.length);
    }
  });
  await db.pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { generateTeams, strength, overall, summarise } = require('./teams');

const PORT = process.env.PORT || 8787;
const getS = async k => (await db.get('SELECT value FROM settings WHERE key=?', k))?.value;
const setS = (k, v) => db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));
// manager PIN: salted scrypt "scrypt$salt$hash"
const hashPin = pin => { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(String(pin), salt, 32).toString('hex')}`; };
const checkPin = (pin, stored) => {
  const [alg, salt, h] = String(stored || '').split('$'); if (alg !== 'scrypt' || !h) return false;
  const a = crypto.scryptSync(String(pin), salt, 32), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const rndPin = (len = 4) => String(crypto.randomInt(0, 10 ** len)).padStart(len, '0');
async function uniquePin() { let p; do { p = rndPin(4); } while (await db.get('SELECT 1 FROM players WHERE pin=?', p)); return p; }

// --- startup: migrations, manager PIN (from MANAGER_PIN env), invite code, seed
async function init() {
  await db.migrate();
  if (!(await getS('manager_pin_hash'))?.startsWith('scrypt$')) {
    let pin = String(process.env.MANAGER_PIN || '').trim();
    if (!/^\d{4,8}$/.test(pin)) { pin = rndPin(6); console.warn('MANAGER_PIN not set/invalid; generated a one-time manager PIN:', pin); }
    await setS('manager_pin_hash', hashPin(pin));
  }
  if (!(await getS('invite_code'))) await setS('invite_code', 'PELADA-' + crypto.randomBytes(2).toString('hex').toUpperCase());
  if (!(await getS('capacity'))) await setS('capacity', 32);
  if (!(await getS('seeded'))) { await require('./seed')(db, uniquePin); await setS('seeded', 1); }
}

// --- dates (America/Toronto, same as Québec)
const TZ = 'America/Toronto';
function localParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false });
  const o = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: +o.hour % 24, wd: o.weekday };
}
function nextThursday() {
  const { date, hour, wd } = localParts();
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let add = (4 - map[wd] + 7) % 7;
  if (add === 0 && hour >= 23) add = 7;
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
async function ensureGame() {
  const date = nextThursday();
  await db.run('INSERT INTO games(date, capacity) VALUES(?, ?) ON CONFLICT(date) DO NOTHING', date, +(await getS('capacity')));
  return db.get('SELECT * FROM games WHERE date=?', date);
}

// --- stats
function matchScore(r) {
  const base = r.rating != null ? r.rating : 6;
  return Math.min(10, base + 0.5 * r.goals + 0.3 * r.assists + 0.1 * r.saves + 0.3 * (r.wins || 0) + (r.is_gk ? 0.5 * (r.clean_sheets || 0) : 0));
}
async function seasonStats(season) {
  const rows = await db.all(`SELECT s.player_id, COUNT(*) games, SUM(goals) goals, SUM(assists) assists, SUM(saves) saves,
    SUM(wins) wins, SUM(clean_sheets) clean_sheets, AVG(score) spm,
    SUM(CASE WHEN g.mvp_id=s.player_id THEN 1 ELSE 0 END) mvps
    FROM game_stats s JOIN games g ON g.id=s.game_id WHERE g.status='done' AND substr(g.date,1,4)=? GROUP BY s.player_id`, String(season));
  const att = await db.all(`SELECT a.player_id, COUNT(*) n FROM attendance a JOIN games g ON g.id=a.game_id
    WHERE a.status='in' AND g.status='done' AND substr(g.date,1,4)=? GROUP BY a.player_id`, String(season));
  const m = {};
  for (const r of rows) m[r.player_id] = { ...r, spm: Math.round(r.spm * 100) / 100 };
  for (const a of att) (m[a.player_id] ||= { player_id: a.player_id, games: 0, goals: 0, assists: 0, saves: 0, wins: 0, clean_sheets: 0, spm: null, mvps: 0 }).attendance = a.n;
  return m;
}
async function allTimeForm() { // used for strength
  const rows = await db.all(`SELECT player_id, COUNT(*) games, AVG(score) spm FROM game_stats s JOIN games g ON g.id=s.game_id WHERE g.status='done' GROUP BY player_id`);
  return Object.fromEntries(rows.map(r => [r.player_id, r]));
}
function publicPlayer(p, form = {}) {
  const f = form[p.id] || {};
  const o = { id: p.id, name: p.name, nickname: p.nickname, photo: p.photo, position: p.position, can_gk: !!p.can_gk, age: p.age,
    atk: p.atk, def: p.def, str: p.str, skl: p.skl, is_demo: !!p.is_demo, overall: overall(p), games: f.games || 0, spm: f.spm != null ? Math.round(f.spm * 100) / 100 : null };
  o.strength = strength(o);
  return o;
}
async function achievements(pid) {
  const r = await db.get(`SELECT COUNT(*) games, COALESCE(SUM(goals),0) goals, COALESCE(MAX(goals),0) maxg, COALESCE(SUM(assists),0) assists,
    COALESCE(SUM(CASE WHEN is_gk=1 THEN clean_sheets ELSE 0 END),0) cs, COALESCE(SUM(wins),0) wins
    FROM game_stats s JOIN games g ON g.id=s.game_id WHERE g.status='done' AND player_id=?`, pid);
  const mvp = (await db.get(`SELECT COUNT(*) n FROM games WHERE status='done' AND mvp_id=?`, pid)).n;
  return [
    { key: 'first_game', icon: '⚽', got: r.games >= 1 },
    { key: 'first_goal', icon: '🎯', got: r.goals >= 1 },
    { key: 'hat_trick', icon: '🎩', got: r.maxg >= 3 },
    { key: 'ten_games', icon: '🔟', got: r.games >= 10 },
    { key: 'clean_sheet', icon: '🧤', got: r.cs >= 1 },
    { key: 'playmaker', icon: '🅰️', got: r.assists >= 10 },
    { key: 'mvp', icon: '🏆', got: mvp >= 1 },
    { key: 'winner', icon: '🥇', got: r.wins >= 10 },
  ];
}

// --- app
const app = express();
app.set('trust proxy', 1);
app.get('/healthz', async (req, res) => { try { await db.get('SELECT 1'); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false }); } });
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { req.body ||= {}; next(); });
app.use(async (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  req.user = t ? await db.get('SELECT * FROM sessions WHERE token=?', t) : null;
  next();
});
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'auth' });
const mgr = (req, res, next) => req.user?.role === 'manager' ? next() : res.status(403).json({ error: 'forbidden' });
const newSession = async (role, pid) => { const token = crypto.randomBytes(24).toString('hex'); await db.run('INSERT INTO sessions(token,role,player_id) VALUES(?,?,?)', token, role, pid || null); return token; };
const getGame = id => db.get('SELECT * FROM games WHERE id=?', id);

const tries = new Map();
app.post('/api/login', async (req, res) => {
  const ip = req.headers['cf-connecting-ip'] || req.ip; const t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 10 * 60e3) { t.n = 0; t.at = Date.now(); }
  if (t.n >= 10) return res.status(429).json({ error: 'too_many' });
  const pin = String(req.body.pin || '').trim();
  if (pin && checkPin(pin, await getS('manager_pin_hash'))) return res.json({ token: await newSession('manager'), role: 'manager' });
  const p = pin && await db.get('SELECT * FROM players WHERE pin=?', pin);
  if (p) return res.json({ token: await newSession('player', p.id), role: 'player', playerId: p.id });
  t.n++; tries.set(ip, t); res.status(401).json({ error: 'bad_pin' });
});
app.post('/api/join', async (req, res) => {
  const { invite, name, nickname, position, age, can_gk } = req.body;
  if (String(invite || '').trim().toUpperCase() !== await getS('invite_code')) return res.status(401).json({ error: 'bad_invite' });
  if (!name) return res.status(400).json({ error: 'name' });
  const pin = await uniquePin();
  const r = await db.get('INSERT INTO players(name,nickname,position,age,can_gk,pin) VALUES(?,?,?,?,?,?) RETURNING id', name, nickname || name.split(' ')[0], position || 'CM', +age || null, can_gk ? 1 : 0, pin);
  res.json({ token: await newSession('player', r.id), role: 'player', playerId: r.id, pin });
});
app.post('/api/logout', auth, async (req, res) => { await db.run('DELETE FROM sessions WHERE token=?', req.user.token); res.json({ ok: 1 }); });
app.get('/api/me', auth, (req, res) => res.json({ role: req.user.role, playerId: req.user.player_id }));
app.get('/api/config', auth, async (req, res) => res.json({ capacity: +(await getS('capacity')), invite: req.user.role === 'manager' ? await getS('invite_code') : undefined }));
app.put('/api/config', mgr, async (req, res) => {
  if (req.body.capacity) await setS('capacity', Math.max(2, +req.body.capacity));
  if (req.body.newInvite) await setS('invite_code', 'PELADA-' + crypto.randomBytes(2).toString('hex').toUpperCase());
  if (req.body.managerPin && /^\d{4,8}$/.test(req.body.managerPin)) await setS('manager_pin_hash', hashPin(req.body.managerPin));
  res.json({ capacity: +(await getS('capacity')), invite: await getS('invite_code') });
});

// players
app.get('/api/players', auth, async (req, res) => {
  const form = await allTimeForm();
  const list = (await db.all('SELECT * FROM players ORDER BY name')).map(p => {
    const o = publicPlayer(p, form); if (req.user.role === 'manager') o.pin = p.pin; return o; });
  res.json(list);
});
const PF = ['name', 'nickname', 'photo', 'position', 'can_gk', 'age', 'atk', 'def', 'str', 'skl', 'lang'];
const SELF_F = ['name', 'nickname', 'photo', 'position', 'age', 'lang'];
const clampR = v => Math.max(1, Math.min(99, Math.round(+v || 60)));
function cleanBody(b, fields) {
  const o = {};
  for (const f of fields) if (b[f] !== undefined) o[f] = ['atk', 'def', 'str', 'skl'].includes(f) ? clampR(b[f]) : f === 'can_gk' ? (b[f] ? 1 : 0) : f === 'age' ? (+b[f] || null) : b[f];
  if (o.photo && (typeof o.photo !== 'string' || o.photo.length > 400000 || !(o.photo.startsWith('data:image/') || o.photo === ''))) delete o.photo;
  return o;
}
app.post('/api/players', mgr, async (req, res) => {
  const o = cleanBody(req.body, PF); if (!o.name) return res.status(400).json({ error: 'name' });
  o.pin = await uniquePin();
  const k = Object.keys(o);
  const r = await db.get(`INSERT INTO players(${k.join(',')}) VALUES(${k.map(() => '?').join(',')}) RETURNING id`, ...k.map(x => o[x]));
  res.json({ id: r.id, pin: o.pin });
});
app.put('/api/players/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const isMgr = req.user.role === 'manager';
  if (!isMgr && req.user.player_id !== id) return res.status(403).json({ error: 'forbidden' });
  const o = cleanBody(req.body, isMgr ? PF : SELF_F);
  const k = Object.keys(o); if (!k.length) return res.json({ ok: 1 });
  await db.run(`UPDATE players SET ${k.map(x => x + '=?').join(',')} WHERE id=?`, ...k.map(x => o[x]), id);
  res.json({ ok: 1 });
});
app.post('/api/players/:id/pin', mgr, async (req, res) => {
  const pin = await uniquePin(); await db.run('UPDATE players SET pin=? WHERE id=?', pin, +req.params.id);
  await db.run('DELETE FROM sessions WHERE player_id=?', +req.params.id); res.json({ pin });
});
const deletePlayers = ids => db.tx(async t => {
  for (const tb of ['attendance', 'game_stats', 'sessions']) await t.run(`DELETE FROM ${tb} WHERE player_id = ANY(?::int[])`, ids);
  await t.run('DELETE FROM players WHERE id = ANY(?::int[])', ids);
});
app.delete('/api/players/demo', mgr, async (req, res) => {
  const ids = (await db.all('SELECT id FROM players WHERE is_demo=1')).map(r => r.id); await deletePlayers(ids);
  // drop result data of games that now have no stats
  await db.run(`UPDATE games SET status='open', teams_json=NULL, matches_json=NULL, mvp_id=NULL WHERE id NOT IN (SELECT DISTINCT game_id FROM game_stats)`);
  await db.run(`DELETE FROM games WHERE date < ? AND id NOT IN (SELECT DISTINCT game_id FROM game_stats)`, nextThursday());
  res.json({ deleted: ids.length });
});
app.delete('/api/players/:id', mgr, async (req, res) => { await deletePlayers([+req.params.id]); res.json({ ok: 1 }); });
app.get('/api/players/:id/profile', auth, async (req, res) => {
  const p = await db.get('SELECT * FROM players WHERE id=?', +req.params.id); if (!p) return res.status(404).json({ error: 'nf' });
  const season = req.query.season || localParts().date.slice(0, 4);
  const o = publicPlayer(p, await allTimeForm());
  if (req.user.role === 'manager' || req.user.player_id === p.id) o.pin = req.user.role === 'manager' ? p.pin : undefined;
  res.json({ player: o, season: (await seasonStats(season))[p.id] || null, achievements: await achievements(p.id) });
});

// games
async function gameView(g, user) {
  const att = await db.all(`SELECT a.player_id, a.status, a.at FROM attendance a WHERE game_id=? ORDER BY a.at, a.seq`, g.id);
  const stats = await db.all('SELECT game_id,player_id,team,is_gk,goals,assists,saves,rating,wins,draws,losses,clean_sheets,score FROM game_stats WHERE game_id=?', g.id);
  return { ...g, teams: g.teams_json ? JSON.parse(g.teams_json) : null, matches: g.matches_json ? JSON.parse(g.matches_json) : [],
    teams_json: undefined, matches_json: undefined, attendance: att, confirmed: att.filter(a => a.status === 'in').map(a => a.player_id), stats,
    myStatus: user.player_id ? (att.find(a => a.player_id === user.player_id)?.status || null) : null };
}
app.get('/api/games/current', auth, async (req, res) => res.json(await gameView(await ensureGame(), req.user)));
app.get('/api/games', auth, async (req, res) => { await ensureGame(); res.json(await db.all('SELECT id,date,status FROM games ORDER BY date DESC LIMIT 60')); });
app.get('/api/games/:id', auth, async (req, res) => { const g = await getGame(+req.params.id); g ? res.json(await gameView(g, req.user)) : res.status(404).json({}); });
app.put('/api/games/:id', mgr, async (req, res) => { if (req.body.capacity) await db.run('UPDATE games SET capacity=? WHERE id=?', Math.max(2, +req.body.capacity), +req.params.id); res.json({ ok: 1 }); });
app.post('/api/games/:id/attend', auth, async (req, res) => {
  const g = await getGame(+req.params.id); if (!g) return res.status(404).json({});
  const pid = req.user.role === 'manager' ? +req.body.playerId : req.user.player_id;
  if (!pid) return res.status(400).json({ error: 'player' });
  if (g.status === 'done' && req.user.role !== 'manager') return res.status(400).json({ error: 'closed' });
  const status = req.body.status === 'in' ? 'in' : 'out';
  if (status === 'in') {
    const n = (await db.get(`SELECT COUNT(*) n FROM attendance WHERE game_id=? AND status='in' AND player_id<>?`, g.id, pid)).n;
    if (n >= g.capacity) return res.status(400).json({ error: 'full' });
    await db.run(`INSERT INTO attendance(game_id,player_id,status) VALUES(?,?,'in') ON CONFLICT(game_id,player_id) DO UPDATE SET status='in', at=CASE WHEN attendance.status='in' THEN attendance.at ELSE ${db.NOW} END`, g.id, pid);
  } else await db.run(`INSERT INTO attendance(game_id,player_id,status) VALUES(?,?,'out') ON CONFLICT(game_id,player_id) DO UPDATE SET status='out'`, g.id, pid);
  res.json(await gameView(await getGame(g.id), req.user));
});
app.post('/api/games/:id/teams', mgr, async (req, res) => {
  const g = await getGame(+req.params.id); if (!g) return res.status(404).json({});
  const form = await allTimeForm();
  const players = (await db.all(`SELECT p.* FROM attendance a JOIN players p ON p.id=a.player_id WHERE a.game_id=? AND a.status='in' ORDER BY a.at, a.seq`, g.id)).map(p => publicPlayer(p, form));
  if (players.length < 4) return res.status(400).json({ error: 'not_enough' });
  const t = generateTeams(players, { teamSize: +req.body.teamSize, nTeams: +req.body.nTeams || undefined });
  const slim = { teamSize: t.teamSize, warnings: t.warnings, bench: t.bench.map(p => p.id),
    teams: t.teams.map(x => ({ gk: x.gk.id, forcedGK: !!x.gk.forcedGK, players: x.players.map(p => p.id) })) };
  await db.run('UPDATE games SET teams_json=? WHERE id=?', JSON.stringify(slim), g.id);
  res.json(slim);
});
app.put('/api/games/:id/teams', mgr, async (req, res) => {
  const b = req.body; if (!b || !Array.isArray(b.teams)) return res.status(400).json({});
  await db.run('UPDATE games SET teams_json=? WHERE id=?', JSON.stringify(b), +req.params.id); res.json(b);
});
app.post('/api/games/:id/result', mgr, async (req, res) => {
  const g = await getGame(+req.params.id); if (!g) return res.status(404).json({});
  const teams = g.teams_json && JSON.parse(g.teams_json); if (!teams) return res.status(400).json({ error: 'no_teams' });
  const matches = (req.body.matches || []).filter(m => m.a !== m.b && m.sa !== '' && m.sb !== '').map(m => ({ a: +m.a, b: +m.b, sa: +m.sa, sb: +m.sb }));
  const per = {}; // team idx -> {w,d,l,cs}
  teams.teams.forEach((_, i) => per[i] = { w: 0, d: 0, l: 0, cs: 0 });
  for (const m of matches) {
    if (m.sa > m.sb) { per[m.a].w++; per[m.b].l++; } else if (m.sa < m.sb) { per[m.b].w++; per[m.a].l++; } else { per[m.a].d++; per[m.b].d++; }
    if (m.sb === 0) per[m.a].cs++; if (m.sa === 0) per[m.b].cs++;
  }
  const input = Object.fromEntries((req.body.stats || []).map(s => [s.player_id, s]));
  await db.tx(async t => {
    await t.run('DELETE FROM game_stats WHERE game_id=?', g.id);
    let best = null;
    for (const [i, tm] of teams.teams.entries()) for (const pid of [tm.gk, ...tm.players]) {
      const s = input[pid] || {};
      const r = { goals: +s.goals || 0, assists: +s.assists || 0, saves: +s.saves || 0, rating: s.rating ? Math.max(1, Math.min(10, +s.rating)) : null,
        is_gk: pid === tm.gk ? 1 : 0, wins: per[i].w, draws: per[i].d, losses: per[i].l, clean_sheets: per[i].cs };
      r.score = Math.round(matchScore(r) * 100) / 100;
      await t.run(`INSERT INTO game_stats(game_id,player_id,team,is_gk,goals,assists,saves,rating,wins,draws,losses,clean_sheets,score)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, g.id, pid, i, r.is_gk, r.goals, r.assists, r.saves, r.rating, r.wins, r.draws, r.losses, r.clean_sheets, r.score);
      if (!best || r.score > best.score || (r.score === best.score && r.goals > best.goals)) best = { ...r, pid };
    }
    const mvp = req.body.mvp_id ? +req.body.mvp_id : best?.pid;
    await t.run(`UPDATE games SET status='done', matches_json=?, mvp_id=? WHERE id=?`, JSON.stringify(matches), mvp ?? null, g.id);
  });
  res.json(await gameView(await getGame(g.id), req.user));
});
app.post('/api/games/:id/reopen', mgr, async (req, res) => {
  await db.run(`UPDATE games SET status='open' WHERE id=?`, +req.params.id); await db.run('DELETE FROM game_stats WHERE game_id=?', +req.params.id); res.json({ ok: 1 });
});

// ranking
app.get('/api/seasons', auth, async (req, res) => {
  const y = (await db.all(`SELECT DISTINCT substr(date,1,4) y FROM games ORDER BY y DESC`)).map(r => r.y);
  const c = localParts().date.slice(0, 4); if (!y.includes(c)) y.unshift(c); res.json(y);
});
app.get('/api/ranking', auth, async (req, res) => {
  const season = req.query.season || localParts().date.slice(0, 4), crit = req.query.criteria || 'spm';
  const st = await seasonStats(season), form = await allTimeForm();
  const list = (await db.all('SELECT * FROM players')).map(p => ({ ...publicPlayer(p, form), stats: st[p.id] || null }))
    .filter(p => p.stats && (p.stats.games || p.stats.attendance))
    .map(p => ({ ...p, value: crit === 'attendance' ? (p.stats.attendance || 0) : (p.stats[crit] ?? 0) }))
    .sort((a, b) => b.value - a.value || (b.stats.spm || 0) - (a.stats.spm || 0));
  res.json(list);
});

app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res, f) => { if (f.endsWith('sw.js') || f.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server' }); });

init().then(() => app.listen(PORT, () => console.log('Pelada on :' + PORT)))
  .catch(e => { console.error('startup failed:', e.message); process.exit(1); });

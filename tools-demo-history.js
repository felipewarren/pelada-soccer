// Creates 3 past demo games with results via the API (so ranking/profile have data). Run once.
require('dotenv').config({ path: process.env.ENV_FILE || __dirname + '/.env', quiet: true });
const fs = require('fs'); const db = require('./db');
const BASE = 'http://localhost:' + (process.env.PORT || 8787);
const pin = process.env.MANAGER_PIN || fs.readFileSync(__dirname + '/MANAGER_PIN.txt', 'utf8').trim();
let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
(async () => {
  const H = tok => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok });
  const { token } = await (await fetch(BASE + '/api/login', { method: 'POST', headers: H(''), body: JSON.stringify({ pin }) })).json();
  const call = async (p, m = 'GET', b) => (await fetch(BASE + '/api' + p, { method: m, headers: H(token), body: b && JSON.stringify(b) })).json();
  const cur = await call('/games/current');
  const players = await call('/players');
  for (let w = 3; w >= 1; w--) {
    const d = new Date(cur.date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * w); const date = d.toISOString().slice(0, 10);
    await db.run('INSERT INTO games(date,capacity) VALUES(?,32) ON CONFLICT(date) DO NOTHING', date);
    const g = await db.get('SELECT id FROM games WHERE date=?', date);
    const who = players.filter(() => rnd() < 0.85);
    for (const p of who) await call(`/games/${g.id}/attend`, 'POST', { status: 'in', playerId: p.id });
    const T = await call(`/games/${g.id}/teams`, 'POST', { teamSize: 8 });
    const n = T.teams.length, matches = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) matches.push({ a: i, b: j, sa: Math.floor(rnd() * 4), sb: Math.floor(rnd() * 4) });
    const stats = T.teams.flatMap(t => [t.gk, ...t.players].map(pid => ({ player_id: pid, goals: pid === t.gk ? 0 : Math.floor(rnd() ** 2 * 4), assists: Math.floor(rnd() ** 2 * 3), saves: pid === t.gk ? Math.floor(3 + rnd() * 8) : 0, rating: Math.round(5 + rnd() * 4) })));
    await call(`/games/${g.id}/result`, 'POST', { matches, stats });
    console.log('game', date, 'players', who.length, 'teams', n);
  }
  // confirm 30 for upcoming game and generate teams
  for (const p of players) await call(`/games/${cur.id}/attend`, 'POST', { status: 'in', playerId: p.id });
  const T = await call(`/games/${cur.id}/teams`, 'POST', { teamSize: 8 });
  console.log('upcoming', cur.date, 'teams', T.teams.length, 'bench', T.bench.length);
  await db.pool.end();
})();

const puppeteer = require('puppeteer-core'); const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8787';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  require('dotenv').config({ quiet: true });
  const pin = process.env.MANAGER_PIN || fs.readFileSync(__dirname + '/MANAGER_PIN.txt', 'utf8').trim();
  const login = await (await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })).json();
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE + '/#/login'); await p.evaluate(() => localStorage.clear()); await p.reload(); await new Promise(r => setTimeout(r, 800));
  await p.screenshot({ path: 'screens/0-login.png' });
  const players = await (await fetch(BASE + '/api/players', { headers: { Authorization: 'Bearer ' + login.token } })).json();
  const pl = players.find(x => x.nickname === 'Tico') || players[0];
  const shot = async (hash, file, fn, full) => { await p.goto(BASE + '/' + hash); await p.reload({ waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 900)); if (fn) { await p.evaluate(fn); await new Promise(r => setTimeout(r, 800)); } await p.screenshot({ path: 'screens/' + file, fullPage: !!full }); };
  // player view of game page
  const pr = await (await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pl.pin }) })).json();
  await p.evaluate(r => { localStorage.token = r.token; localStorage.role = r.role; localStorage.pid = r.playerId; localStorage.lang = 'pt'; }, pr);
  await shot('#/game', '1-game-info.png');
  await shot('#/game', '1b-game-info-full.png', null, true);
  await shot('#/me', '4-profile-card.png');
  await shot('#/me', '4b-profile-full.png', null, true);
  await shot('#/ranking', '3-ranking.png');
  await shot('#/game', '2b-game-stats-tab.png', () => { S.tab = 'statistics'; route(); });
  // manager
  await p.evaluate(r => { localStorage.token = r.token; localStorage.role = r.role; localStorage.removeItem('pid'); }, login);
  await shot('#/game', '2-teams.png', () => { S.tab = 'players'; route(); });
  await shot('#/game', '2a-teams-full.png', () => { S.tab = 'players'; route(); }, true);
  await shot('#/game', '5-manager-game.png', () => { S.tab = 'info'; route(); });
  await shot('#/game', '6-enter-result.png', () => { S.tab = 'info'; route().then(() => openResult()); });
  await shot('#/roster', '7-roster-manager.png');
  await p.evaluate(() => localStorage.lang = 'en'); await shot('#/ranking', '3b-ranking-en.png');
  await p.evaluate(() => localStorage.lang = 'fr'); await shot('#/game', '1c-game-fr.png', () => { S.tab = 'info'; route(); });
  await p.evaluate(() => localStorage.lang = 'pt');
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();

// API smoke + permission tests against a running server
const fs = require('fs'); const B = 'http://localhost:' + (process.env.PORT || 8787) + '/api';
const pin = process.env.MANAGER_PIN || fs.readFileSync(__dirname + '/../MANAGER_PIN.txt', 'utf8').trim();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const req = async (p, tok, m = 'GET', b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b && JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
(async () => {
  ok((await req('/players')).s === 401, 'unauthenticated blocked');
  ok((await req('/login', null, 'POST', { pin: '0000000' })).s === 401, 'wrong PIN rejected');
  const M = (await req('/login', null, 'POST', { pin })).j.token; ok(!!M, 'manager login');
  const ps = (await req('/players', M)).j; ok(ps.length >= 30 && ps[0].pin, 'manager sees players + PINs');
  const P = (await req('/login', null, 'POST', { pin: ps[5].pin })).j; ok(P.role === 'player', 'player login with PIN');
  const pl = (await req('/players', P.token)).j; ok(!pl[0].pin, 'player cannot see PINs');
  ok((await req('/players/' + ps[6].id, P.token, 'PUT', { name: 'x' })).s === 403, 'player cannot edit others');
  await req('/players/' + P.playerId, P.token, 'PUT', { nickname: 'Tester', atk: 99 });
  const me = (await req('/players/' + P.playerId + '/profile', P.token)).j.player; ok(me.nickname === 'Tester' && me.atk !== 99, 'player edits own profile but not ratings');
  await req('/players/' + P.playerId, M, 'PUT', { nickname: ps[5].nickname });
  const g = (await req('/games/current', P.token)).j; ok(/^\d{4}-\d{2}-\d{2}$/.test(g.date) && new Date(g.date + 'T12:00:00Z').getUTCDay() === 4, 'current game is a Thursday: ' + g.date);
  ok((await req(`/games/${g.id}/teams`, P.token, 'POST', {})).s === 403, 'player cannot generate teams');
  ok((await req(`/games/${g.id}/result`, P.token, 'POST', {})).s === 403, 'player cannot enter results');
  let r = await req(`/games/${g.id}/attend`, P.token, 'POST', { status: 'out' }); ok(r.j.myStatus === 'out', 'player cancels attendance');
  r = await req(`/games/${g.id}/attend`, P.token, 'POST', { status: 'in' }); ok(r.j.myStatus === 'in', 'player confirms attendance');
  const inv = (await req('/config', M)).j.invite;
  ok((await req('/join', null, 'POST', { invite: 'NOPE', name: 'X' })).s === 401, 'bad invite rejected');
  const J = (await req('/join', null, 'POST', { invite: inv, name: 'Test Joiner', position: 'ST' })).j; ok(J.pin && J.token, 'join with invite gives PIN');
  ok((await req('/players/' + J.playerId, M, 'DELETE')).s === 200, 'manager deletes player');
  const rk = (await req('/ranking?criteria=goals&season=' + g.date.slice(0, 4), P.token)).j; ok(rk.length > 0 && rk[0].value >= rk[rk.length - 1].value, 'ranking sorted by goals');
  for (const c of ['spm', 'assists', 'wins', 'saves', 'attendance']) ok((await req('/ranking?criteria=' + c, P.token)).s === 200, 'ranking ' + c);
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();

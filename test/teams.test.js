const assert = require('assert');
const { generateTeams, overall } = require('../teams');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const r = (a, b) => Math.round(a + rnd() * (b - a));
function mk(n, gk) { return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), can_gk: i < gk, atk: r(35, 90), def: r(35, 90), str: r(40, 90), skl: r(40, 90), games: r(0, 12), spm: 5 + rnd() * 4 })); }
let fails = 0; const log = [];
function check(name, players, opts, expect) {
  try {
    const res = generateTeams(players, opts);
    const all = res.teams.flatMap(t => [t.gk.id, ...t.players.map(p => p.id)]).concat(res.bench.map(p => p.id));
    assert.strictEqual(new Set(all).size, players.length, 'every player exactly once');
    assert.strictEqual(all.length, players.length);
    res.teams.forEach(t => { assert.ok(t.gk, 'has keeper'); assert.ok(t.players.length + 1 <= res.teamSize, 'size <= ' + res.teamSize); });
    if (expect.n) assert.strictEqual(res.teams.length, expect.n, 'team count');
    const sizes = res.teams.map(t => t.players.length + 1);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'sizes differ by <=1: ' + sizes);
    const gkFlag = res.teams.filter(t => t.gk.can_gk).length;
    if (expect.realGK != null) assert.strictEqual(gkFlag, expect.realGK, 'real keepers');
    if (expect.forced != null) assert.strictEqual(res.teams.filter(t => t.gk.forcedGK).length, expect.forced, 'forced keepers flagged');
    const avgs = res.teams.map(t => t.avg), spread = Math.max(...avgs) - Math.min(...avgs);
    if (expect.maxSpread) assert.ok(spread <= expect.maxSpread, 'avg spread ' + spread.toFixed(2) + ' > ' + expect.maxSpread);
    log.push(`PASS ${name}: sizes=${sizes} avgs=${avgs.join('/')} totals=${res.teams.map(t => t.total).join('/')} spread=${spread.toFixed(2)} bench=${res.bench.length} forcedGK=${res.teams.filter(t => t.gk.forcedGK).length}`);
  } catch (e) { fails++; log.push(`FAIL ${name}: ${e.message}`); }
}
// main scenario requested
for (let k = 0; k < 20; k++) check(`30p/4GK size8 run${k}`, mk(30, 4), { teamSize: 8 }, { n: 4, realGK: 4, forced: 0, maxSpread: 1.5 });
check('30p/4GK size7 4 teams', mk(30, 4), { teamSize: 7, nTeams: 4 }, { n: 4, realGK: 4, maxSpread: 1.5 });
check('30p/2GK size8 (forced keepers)', mk(30, 2), { teamSize: 8 }, { n: 4, realGK: 2, forced: 2 });
check('30p/6GK size8 (extra GKs outfield)', mk(30, 6), { teamSize: 8 }, { n: 4, realGK: 4 });
check('16p/0GK size8', mk(16, 0), { teamSize: 8 }, { n: 2, forced: 2 });
check('32p/4GK size8 full', mk(32, 4), { teamSize: 8 }, { n: 4, maxSpread: 1.5 });
check('20p/3GK size7', mk(20, 3), { teamSize: 7 }, { n: 3 });
check('10p/1GK size8', mk(10, 1), { teamSize: 8 }, { n: 2 });
// forced keepers are the lowest-rated outfielders
{ const ps = mk(30, 2); const res = generateTeams(ps, { teamSize: 8 }); const forced = res.teams.filter(t => t.gk.forcedGK).map(t => t.gk.s);
  const outfield = res.teams.flatMap(t => t.players).filter(p => !p.can_gk).map(p => p.s);
  const ok = forced.every(f => outfield.filter(o => o < f).length <= 0 + res.bench.length);
  log.push((ok ? 'PASS' : 'FAIL') + ' forced keepers are lowest-rated outfielders: ' + forced); if (!ok) fails++; }
console.log(log.join('\n')); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);

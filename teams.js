// Team generator: one keeper per team, snake draft + swap optimisation.
function overall(p) { return Math.round((p.atk + p.def + p.str + p.skl) / 4); }
// strength = overall blended with score-per-match (0-10 scale -> x10)
function strength(p) {
  const ov = overall(p);
  if (!p.games || p.spm == null) return ov;
  const w = Math.min(p.games, 10) / 10 * 0.4; // up to 40% weight on form
  return Math.round((ov * (1 - w) + p.spm * 10 * w) * 10) / 10;
}
function generateTeams(players, opts = {}) {
  const size = opts.teamSize === 7 ? 7 : 8;
  const ps = players.map(p => ({ ...p, s: p.s != null ? p.s : strength(p) }));
  let n = opts.nTeams || Math.max(2, Math.round(ps.length / size));
  while (n > 2 && n * (size - 1) > ps.length + 0) n--; // need enough for at least size-1 per team
  n = Math.max(2, Math.min(n, Math.floor(ps.length / 2)));
  const slots = Math.min(ps.length, n * size);
  // bench: last confirmed beyond slots (rotation fairness), ps assumed in confirmation order
  const playing = ps.slice(0, slots), bench = ps.slice(slots);
  // keepers
  const gks = playing.filter(p => p.can_gk).sort((a, b) => b.s - a.s);
  let keepers = gks.slice(0, n).map(p => ({ ...p, forcedGK: false }));
  let rest = playing.filter(p => !keepers.find(k => k.id === p.id));
  const warnings = [];
  if (keepers.length < n) {
    const need = n - keepers.length;
    rest.sort((a, b) => a.s - b.s);
    const forced = rest.splice(0, need).map(p => ({ ...p, forcedGK: true }));
    keepers = keepers.concat(forced);
    warnings.push({ code: 'forcedGK', players: forced.map(p => p.id) });
  }
  // extra GK-flagged players beyond n play outfield (already in rest)
  const teams = Array.from({ length: n }, (_, i) => ({ idx: i, gk: null, players: [] }));
  keepers.sort((a, b) => b.s - a.s).forEach((k, i) => (teams[i].gk = k));
  // snake: start with team that has weakest keeper
  const order = teams.slice().sort((a, b) => a.gk.s - b.gk.s);
  rest.sort((a, b) => b.s - a.s);
  let fwd = true, i = 0;
  for (const p of rest) {
    order[i].players.push(p);
    if (fwd) { if (i === n - 1) fwd = false; else i++; }
    else { if (i === 0) fwd = true; else i--; }
    // skip full teams
    let guard = 0;
    while (order[i].players.length >= size - 1 && guard++ < n * 2) {
      if (fwd) { if (i === n - 1) fwd = false; else i++; } else { if (i === 0) fwd = true; else i--; }
    }
  }
  optimise(teams);
  return { teams: teams.map(summarise), bench, warnings, teamSize: size };
}
const tot = t => t.gk.s + t.players.reduce((a, p) => a + p.s, 0);
const avg = t => tot(t) / (t.players.length + 1);
function spread(teams) { const v = teams.map(avg); return Math.max(...v) - Math.min(...v); }
function optimise(teams) {
  let best = spread(teams), improved = true, iter = 0;
  while (improved && iter++ < 500) {
    improved = false;
    for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) {
      const A = teams[a].players, B = teams[b].players;
      for (let x = 0; x < A.length; x++) for (let y = 0; y < B.length; y++) {
        [A[x], B[y]] = [B[y], A[x]];
        const s = spread(teams);
        if (s < best - 1e-9) { best = s; improved = true; } else [A[x], B[y]] = [B[y], A[x]];
      }
      // keeper swap
      [teams[a].gk, teams[b].gk] = [teams[b].gk, teams[a].gk];
      const s = spread(teams);
      if (s < best - 1e-9) { best = s; improved = true; } else [teams[a].gk, teams[b].gk] = [teams[b].gk, teams[a].gk];
    }
  }
}
function summarise(t) {
  const total = Math.round(tot(t) * 10) / 10;
  return { idx: t.idx, gk: t.gk, players: t.players, total, avg: Math.round(avg(t) * 10) / 10 };
}
module.exports = { generateTeams, strength, overall, summarise, avg };

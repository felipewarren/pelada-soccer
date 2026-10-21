'use strict';
const S = { token: localStorage.token, role: localStorage.role, pid: +localStorage.pid || null, lang: localStorage.lang || 'pt', T: {}, players: [], pmap: {}, tab: 'info', sel: null };
const POS = ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
const GROUP = { name: 'Soccer 2026 (Pelada)', venue: 'Stade Chauveau', addr: '7200 Bd de l\'Ormière, Québec, QC G2C 1C1', time: '22:00 - 23:00', price: 20, monthly: 115 };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k, v = {}) => (S.T[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const isM = () => S.role === 'manager';
function toast(m) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = m; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
async function api(path, opt = {}) {
  const r = await fetch('/api' + path, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login' && path !== '/join') { logout(true); throw new Error('auth'); }
  if (!r.ok) { toast(t('err_' + (j.error || 'generic'))); throw new Error(j.error); }
  return j;
}
async function loadLang(l) { S.lang = l; localStorage.lang = l; S.T = await fetch('/i18n/' + l + '.json').then(r => r.json()); document.documentElement.lang = l; }
function avatar(p) {
  if (p?.photo) return p.photo;
  const n = (p?.nickname || p?.name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const h = ((p?.id || 1) * 47) % 360;
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${h},35%,28%)"/><text x="50" y="62" font-family="Arial" font-weight="bold" font-size="38" fill="#fff" text-anchor="middle">${esc(n)}</text></svg>`);
}
const posB = p => `<span class="badge ${p.position === 'GK' ? 'gk' : ''}">${esc(p.position)}</span>`;
const langSel = () => `<select class="inline" onchange="setLang(this.value)">${['pt', 'en', 'fr'].map(l => `<option value="${l}" ${S.lang === l ? 'selected' : ''}>${l.toUpperCase()}</option>`).join('')}</select>`;
async function setLang(l) { await loadLang(l); if (S.pid && !isM()) api('/players/' + S.pid, { method: 'PUT', body: { lang: l } }).catch(() => {}); route(); }
function fmtDate(d) { return new Date(d + 'T12:00:00').toLocaleDateString({ pt: 'pt-BR', en: 'en-CA', fr: 'fr-CA' }[S.lang], { weekday: 'long', day: 'numeric', month: 'long' }); }
const money = n => new Intl.NumberFormat({ pt: 'pt-BR', en: 'en-CA', fr: 'fr-CA' }[S.lang], { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
function logout(silent) { if (!silent && S.token) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token } }); S.token = S.role = S.pid = null; localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('pid'); location.hash = '#/login'; route(); }
async function loadPlayers() { S.players = await api('/players'); S.pmap = Object.fromEntries(S.players.map(p => [p.id, p])); }

// ---------- login / join
function viewLogin() {
  $('#nav').classList.add('hide');
  $('#app').innerHTML = `<div class="login"><div class="box"><div style="position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px">${langSel()}</div>
    <h1 style="font-size:30px">${GROUP.name}</h1><div class="m b" style="margin:6px 0 20px">${t('indoor')} • 8x8 • ${GROUP.venue}</div>
    <label>${t('pin')}</label><div style="position:relative"><input id="pin" name="pelada-pin" type="tel" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="16" placeholder="••••" style="-webkit-text-security:disc;padding-right:48px"><button type="button" id="pineye" aria-label="show/hide PIN" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;font-size:20px;color:inherit;cursor:pointer">👁</button></div>
    <button class="pill" style="width:100%;margin:16px 0 8px" onclick="doLogin()">${t('login')}</button>
    <button class="pill ghost" style="width:100%;margin:0" onclick="viewJoin()">${t('join_with_invite')}</button>
    <p class="m center mt">${t('login_help')}</p></div></div>`;
  $('#pin').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  $('#pineye').onclick = () => { const i = $('#pin'), s = i.style.webkitTextSecurity === 'none'; i.style.webkitTextSecurity = s ? 'disc' : 'none'; $('#pineye').textContent = s ? '👁' : '🙈'; };
}
const normPin = v => String(v || '').normalize('NFKC').replace(/\p{Nd}/gu, d => { const c = d.codePointAt(0); for (const z of [0x30,0x660,0x6F0,0x7C0,0x966,0x9E6,0xFF10]) if (c >= z && c < z + 10) return String(c - z); return d; }).replace(/[^0-9]/g, '');
async function doLogin() { try { const r = await api('/login', { method: 'POST', body: { pin: normPin($('#pin').value) } }); saveSession(r); } catch (e) {} }
function saveSession(r) { S.token = r.token; S.role = r.role; S.pid = r.playerId || null; localStorage.token = r.token; localStorage.role = r.role; if (S.pid) localStorage.pid = S.pid; location.hash = '#/game'; route(); }
function viewJoin() {
  const code = new URLSearchParams(location.search).get('invite') || '';
  $('#app').innerHTML = `<div class="login"><div class="box"><h1>${t('join_title')}</h1>
    <label>${t('invite_code')}</label><input id="jinv" value="${esc(code)}" autocapitalize="characters">
    <label>${t('full_name')}</label><input id="jname"><label>${t('nickname')}</label><input id="jnick">
    <div class="grid"><div><label>${t('position')}</label><select id="jpos">${POS.map(p => `<option>${p}</option>`).join('')}</select></div>
    <div><label>${t('age')}</label><input id="jage" type="number" inputmode="numeric"></div></div>
    <label class="flex"><input type="checkbox" id="jgk" style="width:auto"> ${t('can_gk')}</label>
    <button class="pill" style="width:100%;margin:16px 0 8px" onclick="doJoin()">${t('join')}</button>
    <button class="pill ghost" style="width:100%;margin:0" onclick="viewLogin()">${t('back')}</button></div></div>`;
}
async function doJoin() {
  try { const r = await api('/join', { method: 'POST', body: { invite: $('#jinv').value, name: $('#jname').value, nickname: $('#jnick').value, position: $('#jpos').value, age: $('#jage').value, can_gk: $('#jgk').checked } });
    alert(t('your_pin_is', { pin: r.pin })); saveSession(r); } catch (e) {}
}

// ---------- nav
function nav(active) {
  const items = [['game', '⚽', t('nav_game')], ['ranking', '🏆', t('nav_ranking')], ['roster', '👥', t('nav_players')], ['me', '👤', t('nav_profile')], ['settings', '⚙️', t('nav_settings')]];
  const n = $('#nav'); n.classList.remove('hide');
  n.innerHTML = items.map(([k, i, l]) => `<button class="${active === k ? 'on' : ''}" onclick="location.hash='#/${k}'"><span>${i}</span>${l}</button>`).join('');
}

// ---------- game
async function viewGame(id) {
  nav('game');
  const [g, games] = await Promise.all([api(id ? '/games/' + id : '/games/current'), api('/games'), loadPlayers()]);
  S.game = g;
  const conf = g.confirmed.length, cap = g.capacity, pct = Math.min(100, conf / cap * 100);
  const ages = S.players.map(p => p.age).filter(Boolean);
  let btn = '';
  if (isM()) btn = g.status === 'done' ? `<button class="pill ghost" onclick="openResult()">${t('edit_result')}</button>` : `<button class="pill" onclick="openResult()">${t('enter_result')}</button>`;
  else if (g.status !== 'done') btn = g.myStatus === 'in' ? `<button class="pill ghost" onclick="attend('out')">${t('cancel_attendance')}</button>` : `<button class="pill" onclick="attend('in')" ${conf >= cap ? 'disabled' : ''}>${conf >= cap ? t('full') : t('confirm_attendance')}</button>`;
  const org = S.players.find(p => false);
  const tabs = ['info', 'players', 'statistics'];
  let body = '';
  if (S.tab === 'info') body = `
    <div class="card"><div class="row"><div class="ico">📅</div><div class="grow"><div class="b">${(d => d[0].toUpperCase() + d.slice(1))(fmtDate(g.date))}</div><div class="m">${GROUP.time}${g.status === 'done' ? ' • ' + t('finished') : ''}</div></div>
      <select class="inline" onchange="location.hash='#/game/'+this.value">${games.map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${x.date.slice(5)}${x.status === 'done' ? ' ✓' : ''}</option>`).join('')}</select></div>
    <a class="row" style="color:#fff" target="_blank" href="https://maps.google.com/?q=${encodeURIComponent(GROUP.venue + ', ' + GROUP.addr)}"><div class="ico">📍</div><div class="grow"><div class="b">${GROUP.venue}</div><div class="m">${GROUP.addr}</div></div><span style="color:var(--lime)">›</span></a></div>
    <div class="card"><div class="flex between"><div class="b">${t('n_confirmed', { n: conf })}</div><div class="m">${t('slots_left', { n: Math.max(0, cap - conf) })}</div></div><div class="prog"><i style="width:${pct}%"></i></div>
      ${g.myStatus === 'in' ? `<div class="m mt" style="color:var(--lime)">✓ ${t('you_are_in')}</div>` : ''}</div>
    <div class="card"><div class="row"><div class="ico">⭐</div><div class="grow"><div class="m">${t('organizer')}</div><div class="b">${t('manager')}</div></div></div></div>
    <div class="card"><div class="grid">
      <div class="cell"><div class="m">${t('game_style')}</div><div class="b">${t('indoor')} 8x8</div></div>
      <div class="cell"><div class="m">${t('style')}</div><div class="b">${t('male')}</div></div>
      <div class="cell"><div class="m">${t('price')}</div><div class="b">${money(GROUP.price)} / ${t('game')}</div></div>
      <div class="cell"><div class="m">${t('monthly_price')}</div><div class="b">${money(GROUP.monthly)} / ${t('month')}</div></div>
      <div class="cell"><div class="m">${t('intensity')}</div><div class="b">${t('fun')}</div></div>
      <div class="cell"><div class="m">${t('age')}</div><div class="b">30 - 60</div></div></div></div>
    ${isM() ? `<div class="card flex between"><div><div class="b">${t('capacity')}</div><div class="m">${t('capacity_help')}</div></div><input class="num" type="number" value="${cap}" onchange="api('/games/${g.id}',{method:'PUT',body:{capacity:this.value}}).then(()=>route())"></div>` : ''}`;
  else if (S.tab === 'players') body = playersTab(g);
  else body = await statsTab(g);
  $('#app').innerHTML = `<div class="hero"><div class="lang">${langSel()}</div><div class="ht"><h1>${GROUP.name}</h1><div class="sub">${t('indoor')} • 8x8</div></div></div>
    <div class="tabs">${tabs.map(k => `<button class="${S.tab === k ? 'on' : ''}" onclick="S.tab='${k}';route()">${t('tab_' + k).toUpperCase()}</button>`).join('')}</div>${body}${btn}`;
}
async function attend(st, pid) { try { await api('/games/' + S.game.id + '/attend', { method: 'POST', body: { status: st, playerId: pid } }); toast(st === 'in' ? t('confirmed_toast') : t('cancelled_toast')); route(); } catch (e) {} }
function pRow(p, extra = '') { return `<div class="li"><img class="av" src="${avatar(p)}"><div class="grow"><div class="b ell">${esc(p.nickname || p.name)} ${posB(p)} ${p.can_gk && p.position !== 'GK' ? '<span class="badge gk">GK✓</span>' : ''}</div><div class="m ell">${esc(p.name)}</div></div>${extra}</div>`; }
function playersTab(g) {
  const conf = g.confirmed.map(id => S.pmap[id]).filter(Boolean);
  let h = '';
  if (g.teams) h += teamsHtml(g);
  if (isM()) h += `<div class="card"><div class="b">${t('team_generator')}</div><div class="grid mt">
      <div><label>${t('players_per_team')}</label><select id="tsize"><option value="8" ${g.teams?.teamSize !== 7 ? 'selected' : ''}>8 (${t('incl_gk')})</option><option value="7" ${g.teams?.teamSize === 7 ? 'selected' : ''}>7 (${t('incl_gk')})</option></select></div>
      <div><label>${t('n_teams')}</label><select id="nteams"><option value="">${t('auto')}</option>${[2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></div></div>
      <button class="btn mt" style="width:100%" onclick="genTeams()">${g.teams ? '🔄 ' + t('regenerate') : '⚡ ' + t('generate_teams')}</button></div>`;
  h += `<div class="card"><div class="b">${t('n_confirmed', { n: conf.length })}</div><div class="list">${conf.map(p => pRow(p, isM() ? `<button class="btn r sm" onclick="attend('out',${p.id})">✕</button>` : '')).join('') || `<div class="m mt">${t('nobody_yet')}</div>`}</div></div>`;
  if (isM()) { const others = S.players.filter(p => !g.confirmed.includes(p.id));
    h += `<div class="card"><div class="b">${t('add_attendance')}</div><div class="list">${others.map(p => pRow(p, `<button class="btn sm" onclick="attend('in',${p.id})">+</button>`)).join('')}</div></div>`; }
  return h;
}
function strength(p) { return p.strength ?? p.overall; }
function teamsHtml(g) {
  const T = g.teams, names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const colors = ['#B8F400', '#4fc3f7', '#ff8a65', '#ce93d8', '#fff176', '#80cbc4'];
  const tp = (pid, ti, role) => { const p = S.pmap[pid]; if (!p) return ''; const sel = S.sel && S.sel.pid === pid;
    return `<div class="tp ${sel ? 'sel' : ''}" ${isM() ? `draggable="true" ondragstart="dragS(event,${pid},'${ti}','${role}')" ondragover="event.preventDefault()" ondrop="dropS(event,${pid},'${ti}','${role}')" onclick="pick(${pid},'${ti}','${role}')"` : ''}>
      <img class="av" src="${avatar(p)}"><div class="grow ell"><b>${esc(p.nickname || p.name)}</b> ${role === 'gk' ? `<span class="badge gk">GK</span>${T.teams[ti]?.forcedGK ? ` <span class="badge warn">${t('forced_gk')}</span>` : ''}` : posB(p)}</div><div class="m">${Math.round(strength(p))}</div></div>`; };
  const stats = T.teams.map(x => { const ps = [x.gk, ...x.players].map(id => S.pmap[id]).filter(Boolean); const tot = ps.reduce((a, p) => a + strength(p), 0); return { tot: Math.round(tot), avg: (tot / (ps.length || 1)).toFixed(1), n: ps.length }; });
  let h = `<div class="pad" style="padding-bottom:0"><div class="flex between"><h3>${t('teams')}</h3>${isM() ? `<span class="m">${t('tap_to_swap')}</span>` : ''}</div>`;
  if (T.warnings?.some(w => w.code === 'forcedGK')) h += `<div class="m mt" style="color:var(--red)">⚠ ${t('forced_gk_warning')}</div>`;
  h += `</div>`;
  T.teams.forEach((x, i) => { h += `<div class="card team" style="border-left-color:${colors[i]}"><div class="hd"><div class="b">${t('team')} ${names[i]} <span class="m">(${stats[i].n})</span></div><div class="m">${t('total')} <b style="color:#fff">${stats[i].tot}</b> • ${t('avg')} <b style="color:${colors[i]}">${stats[i].avg}</b></div></div>
    ${tp(x.gk, i, 'gk')}${x.players.map(pid => tp(pid, i, 'p')).join('')}</div>`; });
  if (T.bench?.length || isM()) h += `<div class="card"><div class="b">🔁 ${t('bench')}</div><div class="m">${t('bench_help')}</div>${(T.bench || []).map(pid => tp(pid, 'bench', 'p')).join('') || `<div class="m mt">—</div>`}
    ${isM() && S.sel ? `<button class="btn g sm mt" onclick="toBench()">${t('move_to_bench')}</button>` : ''}</div>`;
  return h;
}
function locate(T, ti, role, pid) { if (ti === 'bench') return [T.bench, T.bench.indexOf(pid)]; const tm = T.teams[+ti]; if (role === 'gk') return [tm, 'gk']; return [tm.players, tm.players.indexOf(pid)]; }
async function swapPlayers(a, b) {
  const T = S.game.teams; const [ca, ka] = locate(T, a.ti, a.role, a.pid), [cb, kb] = locate(T, b.ti, b.role, b.pid);
  ca[ka] = b.pid; cb[kb] = a.pid;
  if (a.role === 'gk') T.teams[+a.ti].forcedGK = !S.pmap[b.pid]?.can_gk;
  if (b.role === 'gk') T.teams[+b.ti].forcedGK = !S.pmap[a.pid]?.can_gk;
  S.sel = null; await api('/games/' + S.game.id + '/teams', { method: 'PUT', body: T }); route();
}
function pick(pid, ti, role) { if (!S.sel) { S.sel = { pid, ti, role }; route(); return; } if (S.sel.pid === pid) { S.sel = null; route(); return; } swapPlayers(S.sel, { pid, ti, role }); }
function dragS(e, pid, ti, role) { e.dataTransfer.setData('text', JSON.stringify({ pid, ti, role })); }
function dropS(e, pid, ti, role) { e.preventDefault(); const a = JSON.parse(e.dataTransfer.getData('text')); if (a.pid !== pid) swapPlayers(a, { pid, ti, role }); }
async function toBench() { const a = S.sel; if (!a || a.ti === 'bench' || a.role === 'gk') { toast(t('cant_bench_gk')); return; } const T = S.game.teams; const arr = T.teams[+a.ti].players; arr.splice(arr.indexOf(a.pid), 1); T.bench.push(a.pid); S.sel = null; await api('/games/' + S.game.id + '/teams', { method: 'PUT', body: T }); route(); }
async function genTeams() { try { await api('/games/' + S.game.id + '/teams', { method: 'POST', body: { teamSize: $('#tsize').value, nTeams: $('#nteams').value } }); S.sel = null; toast(t('teams_ready')); route(); } catch (e) {} }

async function statsTab(g) {
  if (g.status !== 'done') {
    const season = g.date.slice(0, 4); const r = await api('/ranking?criteria=spm&season=' + season);
    return `<div class="card"><div class="m">${t('no_result_yet')}</div></div><div class="card"><div class="b">${t('season_leaders', { s: season })}</div><div class="list">${r.slice(0, 10).map((p, i) => rankRow(p, i, p.stats.spm?.toFixed(2) ?? '-')).join('') || `<div class="m mt">—</div>`}</div></div>`;
  }
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const mvp = S.pmap[g.mvp_id];
  let h = `<div class="card"><div class="b">${t('results')}</div>${g.matches.map(m => `<div class="flex between row"><b>${t('team')} ${names[m.a]}</b><span class="score" style="font-size:22px">${m.sa} - ${m.sb}</span><b>${t('team')} ${names[m.b]}</b></div>`).join('') || '<div class="m">—</div>'}</div>`;
  if (mvp) h += `<div class="card flex"><img class="av" src="${avatar(mvp)}"><div class="grow"><div class="m">🏆 MVP</div><div class="b">${esc(mvp.nickname || mvp.name)}</div></div></div>`;
  const st = g.stats.slice().sort((a, b) => b.score - a.score);
  h += `<div class="card"><div class="flex between"><div class="b">${t('player_stats')}</div><div class="m">⚽ 🅰️ 🧤 ★</div></div><div class="list">${st.map(s => { const p = S.pmap[s.player_id]; return p ? `<div class="li" onclick="location.hash='#/player/${p.id}'"><img class="av" src="${avatar(p)}"><div class="grow ell"><b>${esc(p.nickname || p.name)}</b> <span class="m">${t('team')} ${names[s.team]}</span></div><div class="m">${s.goals} · ${s.assists} · ${s.saves}</div><div class="score">${s.score.toFixed(1)}</div></div>` : ''; }).join('')}</div></div>`;
  return h;
}
function openResult() {
  const g = S.game; if (!g.teams) { toast(t('generate_first')); S.tab = 'players'; route(); return; }
  const names = ['A', 'B', 'C', 'D', 'E', 'F'], n = g.teams.teams.length;
  const ex = Object.fromEntries(g.stats.map(s => [s.player_id, s]));
  const pairs = g.matches.length ? g.matches : (() => { const a = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) a.push({ a: i, b: j, sa: '', sb: '' }); return n === 2 ? a : a.slice(0, Math.max(n, 2)); })();
  const opt = sel => names.slice(0, n).map((x, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${x}</option>`).join('');
  const mrow = m => `<div class="flex mrow mt"><select class="inline ma">${opt(m.a)}</select><input class="num sa" type="number" inputmode="numeric" value="${m.sa}"><span>×</span><input class="num sb" type="number" inputmode="numeric" value="${m.sb}"><select class="inline mb">${opt(m.b)}</select><button class="btn r sm" onclick="this.parentNode.remove()">✕</button></div>`;
  window._mrow = mrow;
  const prow = (pid, ti, gk) => { const p = S.pmap[pid]; const s = ex[pid] || {}; if (!p) return '';
    return `<div class="li prow" data-pid="${pid}"><img class="av" style="width:32px;height:32px" src="${avatar(p)}"><div class="grow ell"><b>${esc(p.nickname || p.name)}</b>${gk ? ' <span class="badge gk">GK</span>' : ''}</div>
      <input class="num g" style="width:44px" type="number" inputmode="numeric" placeholder="⚽" value="${s.goals || ''}"><input class="num a" style="width:44px" type="number" inputmode="numeric" placeholder="🅰️" value="${s.assists || ''}"><input class="num s" style="width:44px" type="number" inputmode="numeric" placeholder="🧤" value="${s.saves || ''}"><input class="num r" style="width:44px" type="number" inputmode="decimal" min="1" max="10" placeholder="★" value="${s.rating || ''}"></div>`; };
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet"><div class="flex between"><h2>${t('enter_result')}</h2><button class="btn g sm" onclick="this.closest('.modal').remove()">✕</button></div>
    <label>${t('matches')}</label><div id="mrows">${pairs.map(mrow).join('')}</div><button class="btn g sm mt" onclick="document.getElementById('mrows').insertAdjacentHTML('beforeend',_mrow({a:0,b:1,sa:'',sb:''}))">+ ${t('add_match')}</button>
    <label class="mt">${t('per_player')} (⚽ ${t('goals')} · 🅰️ ${t('assists')} · 🧤 ${t('saves')} · ★ ${t('rating_1_10')})</label>
    ${g.teams.teams.map((x, i) => `<div class="b mt">${t('team')} ${names[i]}</div><div class="list">${prow(x.gk, i, 1)}${x.players.map(pid => prow(pid, i, 0)).join('')}</div>`).join('')}
    <label>MVP</label><select id="mvp"><option value="">${t('auto_mvp')}</option>${g.teams.teams.flatMap(x => [x.gk, ...x.players]).map(pid => `<option value="${pid}" ${g.mvp_id === pid ? 'selected' : ''}>${esc(S.pmap[pid]?.nickname || '')}</option>`).join('')}</select>
    <button class="pill" style="width:100%;margin:16px 0 0" onclick="saveResult()">${t('save_result')}</button></div>`;
  document.body.appendChild(m);
}
async function saveResult() {
  const matches = [...document.querySelectorAll('.mrow')].map(r => ({ a: +r.querySelector('.ma').value, b: +r.querySelector('.mb').value, sa: r.querySelector('.sa').value, sb: r.querySelector('.sb').value }));
  const stats = [...document.querySelectorAll('.prow')].map(r => ({ player_id: +r.dataset.pid, goals: r.querySelector('.g').value, assists: r.querySelector('.a').value, saves: r.querySelector('.s').value, rating: r.querySelector('.r').value }));
  try { await api('/games/' + S.game.id + '/result', { method: 'POST', body: { matches, stats, mvp_id: $('#mvp').value || null } }); document.querySelector('.modal')?.remove(); toast(t('result_saved')); S.tab = 'statistics'; route(); } catch (e) {}
}

// ---------- ranking
const CRIT = ['spm', 'goals', 'assists', 'wins', 'saves', 'attendance'];
function rankRow(p, i, val) { return `<div class="li" onclick="location.hash='#/player/${p.id}'"><div class="rank">${i + 1}</div><img class="av" src="${avatar(p)}"><div class="grow"><div class="b ell">${esc(p.nickname || p.name)} ${posB(p)}</div><div class="m ell">${esc(p.name)}</div></div><div class="score">${val}</div></div>`; }
async function viewRanking() {
  nav('ranking');
  S.crit ||= 'spm';
  const seasons = await api('/seasons'); S.season ||= seasons[0];
  const list = await api(`/ranking?criteria=${S.crit}&season=${S.season}`);
  const fmt = p => S.crit === 'spm' ? (p.value ? (+p.value).toFixed(2) : '-') : p.value;
  const pc = (p, k, medal) => p ? `<div class="pc ${k}" onclick="location.hash='#/player/${p.id}'"><span class="pos">${posB(p)}</span><div class="medal">${medal}</div><img src="${avatar(p)}"><div class="nm ell">${esc(p.nickname || p.name)}</div><div class="v">${fmt(p)}</div></div>` : '<div class="pc" style="visibility:hidden"></div>';
  $('#app').innerHTML = `<div class="topbar"><h2>${t('ranking')}</h2>${langSel()}</div>
    <div class="flex pad" style="padding-top:0"><select onchange="S.crit=this.value;route()">${CRIT.map(c => `<option value="${c}" ${S.crit === c ? 'selected' : ''}>${t('crit_' + c)}</option>`).join('')}</select>
    <select style="width:120px" onchange="S.season=this.value;route()">${seasons.map(s => `<option ${S.season == s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    ${list.length ? `<div class="podium">${pc(list[1], 'p2', '🥈')}${pc(list[0], 'p1', '🥇')}${pc(list[2], 'p3', '🥉')}</div>` : ''}
    <div class="card"><div class="flex between m"><span>${t('player')}</span><span>${t('crit_' + S.crit)}</span></div><div class="list">${list.map((p, i) => rankRow(p, i, fmt(p))).join('') || `<div class="m mt">${t('no_data')}</div>`}</div></div>`;
}

// ---------- roster
async function viewRoster() {
  nav('roster'); await loadPlayers();
  const demo = S.players.filter(p => p.is_demo).length;
  $('#app').innerHTML = `<div class="topbar"><h2>${t('players')} (${S.players.length})</h2>${isM() ? `<button class="btn" onclick="editPlayer()">+ ${t('add_player')}</button>` : langSel()}</div>
    ${isM() && demo ? `<div class="card flex between"><div class="m">${t('demo_players', { n: demo })}</div><button class="btn r sm" onclick="delDemo()">${t('delete_demo')}</button></div>` : ''}
    <div class="card"><div class="list">${S.players.map(p => `<div class="li" onclick="location.hash='#/player/${p.id}'"><img class="av" src="${avatar(p)}"><div class="grow"><div class="b ell">${esc(p.nickname || p.name)} ${posB(p)} ${p.can_gk && p.position !== 'GK' ? '<span class="badge gk">GK✓</span>' : ''}</div><div class="m ell">${esc(p.name)}${isM() ? ' • PIN ' + esc(p.pin) : ''}</div></div><div class="score">${p.overall}</div></div>`).join('')}</div></div>`;
}
async function delDemo() { if (!confirm(t('confirm_delete_demo'))) return; const r = await api('/players/demo', { method: 'DELETE' }); toast(t('deleted_n', { n: r.deleted })); route(); }
function resizeImg(file) { return new Promise(res => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'), s = 320; c.width = c.height = s; const x = c.getContext('2d'); const m = Math.min(img.width, img.height); x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s); res(c.toDataURL('image/jpeg', .82)); }; img.src = URL.createObjectURL(file); }); }
function editPlayer(id) {
  const p = id ? S.pmap[id] : { position: 'CM', atk: 60, def: 60, str: 60, skl: 60, can_gk: false };
  const self = !isM();
  const m = document.createElement('div'); m.className = 'modal'; let photo = p.photo || '';
  const rt = k => `<div><label>${k.toUpperCase()} <b id="v${k}" style="color:#fff">${p[k]}</b></label><input type="range" min="1" max="99" value="${p[k]}" id="f${k}" oninput="v${k}.textContent=this.value" style="padding:0;border:0;accent-color:#B8F400"></div>`;
  m.innerHTML = `<div class="sheet"><div class="flex between"><h2>${id ? t('edit_player') : t('add_player')}</h2><button class="btn g sm" onclick="this.closest('.modal').remove()">✕</button></div>
    <div class="flex mt"><img id="fph" class="av" style="width:72px;height:72px" src="${avatar(p)}"><label class="btn g" style="margin:0;color:#fff">📷 ${t('photo')}<input type="file" accept="image/*" id="ffile" class="hide"></label>${photo ? `<button class="btn r sm" id="fdelph">${t('remove')}</button>` : ''}</div>
    <label>${t('full_name')}</label><input id="fname" value="${esc(p.name)}"><label>${t('nickname')}</label><input id="fnick" value="${esc(p.nickname)}">
    <div class="grid"><div><label>${t('position')}</label><select id="fpos">${POS.map(x => `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label>${t('age')}</label><input id="fage" type="number" value="${p.age || ''}"></div></div>
    ${self ? '' : `<label class="flex"><input type="checkbox" id="fgk" style="width:auto" ${p.can_gk ? 'checked' : ''}> ${t('can_gk')}</label><div class="grid">${['atk', 'def', 'str', 'skl'].map(rt).join('')}</div>`}
    <button class="pill" style="width:100%;margin:16px 0 0" id="fsave">${t('save')}</button></div>`;
  document.body.appendChild(m);
  $('#ffile').onchange = async e => { photo = await resizeImg(e.target.files[0]); $('#fph').src = photo; };
  if ($('#fdelph')) $('#fdelph').onclick = () => { photo = ''; $('#fph').src = avatar({ ...p, photo: '' }); };
  $('#fsave').onclick = async () => {
    const b = { name: $('#fname').value, nickname: $('#fnick').value, position: $('#fpos').value, age: $('#fage').value, photo };
    if (!self) Object.assign(b, { can_gk: $('#fgk').checked, atk: $('#fatk').value, def: $('#fdef').value, str: $('#fstr').value, skl: $('#fskl').value });
    try { const r = await api(id ? '/players/' + id : '/players', { method: id ? 'PUT' : 'POST', body: b }); m.remove(); if (!id && r.pin) alert(t('new_player_pin', { pin: r.pin })); toast(t('saved')); route(); } catch (e) {}
  };
}

// ---------- profile
async function viewProfile(id) {
  nav(id === S.pid ? 'me' : 'roster');
  if (!id) { $('#app').innerHTML = `<div class="topbar"><h2>${t('profile')}</h2>${langSel()}</div><div class="card"><div class="b">${t('manager')}</div><div class="m">${t('manager_no_profile')}</div></div>`; return; }
  if (!S.players.length) await loadPlayers();
  const { player: p, season: s, achievements: A } = await api('/players/' + id + '/profile');
  S.prof = p;
  const canEdit = isM() || S.pid === p.id;
  $('#app').innerHTML = `<div class="topbar"><button class="btn g sm" onclick="history.back()">‹</button><h2>${t('profile')}</h2>${canEdit ? `<button class="btn g sm" onclick="editPlayer(${p.id})">✏️ ${t('edit')}</button>` : '<span></span>'}</div>
    <div class="fut" id="fut"><div class="ovr">${p.overall}</div><div class="ps">${esc(p.position)}</div><img src="${avatar(p)}"><div class="nm">${esc(p.nickname || p.name)}</div>
    <div class="rt"><div>${p.atk}<span>ATK</span></div><div>${p.str}<span>STR</span></div><div>${p.def}<span>DEF</span></div><div>${p.skl}<span>SKL</span></div></div></div>
    <button class="pill" style="width:auto;padding:15px 28px;margin:0 auto 8px" onclick="shareCard()">📤 ${t('share_card')}</button>
    <div class="card"><div class="flex between"><div class="b">${t('season_stats')} ${new Date().getFullYear()}</div><div class="m">${s?.games || 0} ${t('games')} • ${t('spm_short')} ${s?.spm?.toFixed?.(2) ?? '-'}</div></div>
      <div class="stats3 mt"><div><div class="n">${s?.goals || 0}</div><div class="m">${t('goals')}</div></div><div><div class="n">${s?.assists || 0}</div><div class="m">${t('assists')}</div></div><div><div class="n">${s?.saves || 0}</div><div class="m">${t('saves')}</div></div></div>
      <div class="stats3 mt"><div><div class="n" style="font-size:18px;color:#fff">${s?.wins || 0}</div><div class="m">${t('wins')}</div></div><div><div class="n" style="font-size:18px;color:#fff">${s?.mvps || 0}</div><div class="m">MVP</div></div><div><div class="n" style="font-size:18px;color:#fff">${s?.attendance || 0}</div><div class="m">${t('crit_attendance')}</div></div></div></div>
    <div class="card"><div class="b" style="margin-bottom:10px">${t('achievements')}</div><div class="ach">${A.map(a => `<div class="${a.got ? '' : 'off'}"><b>${a.icon}</b>${t('ach_' + a.key)}</div>`).join('')}</div></div>
    <div class="card"><div class="b">${t('about')}</div><div class="row"><div class="grow m">${t('full_name')}</div><b>${esc(p.name)}</b></div><div class="row"><div class="grow m">${t('age')}</div><b>${p.age || '-'}</b></div><div class="row"><div class="grow m">${t('position')}</div><b>${esc(p.position)}${p.can_gk ? ' • GK✓' : ''}</b></div>
      ${isM() ? `<div class="row"><div class="grow m">PIN</div><b>${esc(p.pin)}</b><button class="btn g sm" onclick="resetPin(${p.id})">${t('reset')}</button></div>` : ''}</div>
    ${isM() ? `<button class="pill danger" onclick="delPlayer(${p.id})">${t('delete_player')}</button>` : ''}`;
}
async function resetPin(id) { if (!confirm(t('confirm_reset_pin'))) return; const r = await api('/players/' + id + '/pin', { method: 'POST' }); alert(t('new_player_pin', { pin: r.pin })); route(); }
async function delPlayer(id) { if (!confirm(t('confirm_delete'))) return; await api('/players/' + id, { method: 'DELETE' }); location.hash = '#/roster'; }
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
async function shareCard() {
  const p = S.prof, W = 600, H = 840, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  x.beginPath(); x.moveTo(0, 50); x.lineTo(60, 0); x.lineTo(W - 60, 0); x.lineTo(W, 50); x.lineTo(W, H - 110); x.lineTo(W / 2, H); x.lineTo(0, H - 110); x.closePath();
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#fff4b5'); g.addColorStop(.45, '#e7c24f'); g.addColorStop(1, '#b8901f'); x.fillStyle = g; x.fill();
  x.fillStyle = '#3b2a00'; x.font = '900 110px Arial'; x.fillText(p.overall, 50, 160); x.font = '900 44px Arial'; x.fillText(p.position, 60, 215);
  const img = await loadImg(avatar(p));
  if (img) { x.save(); x.beginPath(); x.arc(390, 210, 150, 0, Math.PI * 2); x.clip(); x.drawImage(img, 240, 60, 300, 300); x.restore(); }
  x.textAlign = 'center'; x.font = '900 52px Arial'; x.fillText((p.nickname || p.name).toUpperCase(), W / 2, 450);
  x.fillRect(80, 475, W - 160, 2);
  x.font = '900 48px Arial'; x.textAlign = 'left';
  [[p.atk, 'ATK', 110, 560], [p.str, 'STR', 340, 560], [p.def, 'DEF', 110, 640], [p.skl, 'SKL', 340, 640]].forEach(([v, l, X, Y]) => { x.font = '900 48px Arial'; x.fillText(v, X, Y); x.font = '600 40px Arial'; x.fillText(l, X + 75, Y); });
  x.textAlign = 'center'; x.font = '700 24px Arial'; x.fillText(GROUP.name, W / 2, 730);
  c.toBlob(async b => {
    const f = new File([b], 'pelada-card.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: GROUP.name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'pelada-card.png'; a.click();
  }, 'image/png');
}

// ---------- settings
async function viewSettings() {
  nav('settings');
  const cfg = await api('/config');
  const link = location.origin + '/?invite=' + encodeURIComponent(cfg.invite || '') + '#/join';
  $('#app').innerHTML = `<div class="topbar"><h2>${t('nav_settings')}</h2><span></span></div>
    <div class="card flex between"><div class="b">${t('language')}</div>${langSel()}</div>
    <div class="card"><div class="b">${t('install_app')}</div><div class="m mt">${t('install_help')}</div></div>
    ${isM() ? `<div class="card"><div class="b">${t('invite_players')}</div><div class="m mt">${t('invite_help')}</div>
      <div class="flex mt"><input readonly value="${esc(cfg.invite)}"><button class="btn g" onclick="api('/config',{method:'PUT',body:{newInvite:1}}).then(route)">🔄</button></div>
      <div class="flex mt"><input readonly value="${esc(link)}" id="ilink"><button class="btn" onclick="navigator.clipboard?.writeText(ilink.value);toast('✓')">${t('copy')}</button></div></div>
      <div class="card flex between"><div><div class="b">${t('default_capacity')}</div></div><input class="num" type="number" value="${cfg.capacity}" onchange="api('/config',{method:'PUT',body:{capacity:this.value}}).then(()=>toast('✓'))"></div>
      <div class="card"><div class="b">${t('change_manager_pin')}</div><div class="flex mt"><input id="npin" type="password" inputmode="numeric" placeholder="4-8"><button class="btn" onclick="api('/config',{method:'PUT',body:{managerPin:npin.value}}).then(()=>toast('✓'))">${t('save')}</button></div></div>` : ''}
    <button class="pill ghost" onclick="logout()">${t('logout')}</button>`;
}

// ---------- router
async function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (!S.token) { if (h[0] === 'join') viewJoin(); else viewLogin(); return; }
  try {
    if (h[0] === 'ranking') await viewRanking();
    else if (h[0] === 'roster') await viewRoster();
    else if (h[0] === 'player') await viewProfile(+h[1]);
    else if (h[0] === 'me') await viewProfile(S.pid);
    else if (h[0] === 'settings') await viewSettings();
    else { if (h[0] !== 'game') S.tab = S.tab || 'info'; await viewGame(h[1]); }
  } catch (e) { console.error(e); }
  if (h.join('/') !== S.lastRoute) window.scrollTo(0, 0); S.lastRoute = h.join('/');
}
window.addEventListener('hashchange', () => { S.sel = null; route(); });
(async () => {
  if (!localStorage.lang) localStorage.lang = 'pt';
  await loadLang(localStorage.lang);
  if (new URLSearchParams(location.search).get('invite') && !S.token) location.hash = '#/join';
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
})();

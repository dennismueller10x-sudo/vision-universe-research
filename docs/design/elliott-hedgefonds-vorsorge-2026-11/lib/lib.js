(function(){'use strict';
const de = (v, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v)) + ' %';
const last = a => a[a.length - 1];
const ic = (id, s = 20) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
const hud = (id, s = 44, r = 12) => `<span class="hud" style="width:${s}px;height:${s}px;border-radius:${r}px">${ic(id, s)}</span>`;
const NAMES = { NVDA: 'NVIDIA', AMD: 'Advanced Micro Devices', MU: 'Micron Technology', AAPL: 'Apple', MSFT: 'Microsoft', ADI: 'Analog Devices', TXN: 'Texas Instruments', SPY: 'S&P 500', AMAT: 'Applied Materials', QCOM: 'Qualcomm', AVGO: 'Broadcom', TSM: 'TSMC', META: 'Meta Platforms', GOOGL: 'Alphabet', AMZN: 'Amazon' };
const WHAT = { NVDA: 'Chips für KI und Grafik', AMD: 'Prozessoren und Grafikchips', MU: 'Speicherchips', AAPL: 'iPhone, Mac und App Store', MSFT: 'Windows, Office und Azure', ADI: 'Analogchips', TXN: 'Analog- und Embedded-Chips', AMAT: 'Maschinen für die Chipfertigung', QCOM: 'Chips für Smartphones', AVGO: 'Netzwerk- und KI-Chips', TSM: 'Auftragsfertiger für Chips', META: 'Facebook, Instagram, WhatsApp', GOOGL: 'Google, YouTube, Cloud', AMZN: 'Onlinehandel und AWS' };
const down = (a, n) => { const s = a.length / n; const o = []; for (let i = 0; i < n; i++) o.push(a[Math.floor(i * s)]); o.push(a[a.length - 2], last(a)); return o; };
const S = Object.assign({ NVDA: down(D.nvda, 50) }, D.s);
const day = t => (last(S[t]) / S[t][S[t].length - 2] - 1) * 100;
const px = t => last(S[t]);

/* ---------- Der eine Chart ---------- */
let gid = 0;
function chart(a, o = {}) {
  const w = o.w || 354, h = o.h || 170, top = 10, bot = 10;
  const zones = o.zones || [];
  let mn = Math.min(...a), mx = Math.max(...a);
  zones.forEach(z => { mn = Math.min(mn, z[0]); mx = Math.max(mx, z[1]); });
  const r = (mx - mn) || 1; mn -= r * .04; mx += r * .04;
  const X = i => i * (w - 6) / (a.length - 1), Y = v => top + (h - top - bot) * (1 - (v - mn) / (mx - mn));
  const d = a.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const id = 'g' + (++gid), ink = o.ink || 'var(--a-ink)';
  let s = `<svg width="${w}" height="${h + (o.axis ? 18 : 0)}" viewBox="0 0 ${w} ${h + (o.axis ? 18 : 0)}" aria-hidden="true" style="display:block;overflow:visible"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8f531" stop-opacity=".55"/><stop offset="1" stop-color="#c8f531" stop-opacity="0"/></linearGradient></defs>`;
  zones.forEach(z => { s += `<rect x="0" width="${w}" y="${Y(z[1]).toFixed(1)}" height="${(Y(z[0]) - Y(z[1])).toFixed(1)}" fill="${z[2] === 'l' ? '#c8f531' : 'var(--a-line)'}" opacity="${z[2] === 'l' ? .35 : .9}"/>` + (z[3] ? `<text x="6" y="${(Y(z[1]) + 13).toFixed(1)}" font-size="10.5" font-weight="700" fill="var(--a-mute)" font-family="Inter,sans-serif">${z[3]}</text>` : ''); });
  if (o.grid !== false) for (let i = 1; i < 4; i++) s += `<line x1="0" x2="${w}" y1="${(top + (h - top - bot) * i / 4).toFixed(1)}" y2="${(top + (h - top - bot) * i / 4).toFixed(1)}" stroke="var(--a-line)" stroke-width="1"/>`;
  if (o.base !== false) s += `<line x1="0" x2="${w}" y1="${Y(a[0]).toFixed(1)}" y2="${Y(a[0]).toFixed(1)}" stroke="var(--a-mute)" stroke-width="1" stroke-dasharray="2 4" opacity=".7"/>`;
  s += `<path d="${d} L${X(a.length - 1).toFixed(1)} ${h} L0 ${h}Z" fill="url(#${id})"/>`;
  (o.lines || []).forEach(L => { const pts = L.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean); s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--a-mute)" stroke-width="1.4" stroke-dasharray="5 4"/>`; });
  s += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  (o.marks || []).forEach(m => { s += `<circle cx="${X(m[0]).toFixed(1)}" cy="${Y(a[m[0]]).toFixed(1)}" r="9" fill="${ink}"/><text x="${X(m[0]).toFixed(1)}" y="${(Y(a[m[0]]) + 3.6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="900" fill="var(--a-bg)" font-family="Inter,sans-serif">${m[1]}</text>`; });
  s += `<circle cx="${X(a.length - 1).toFixed(1)}" cy="${Y(last(a)).toFixed(1)}" r="5.5" fill="#c8f531" stroke="${ink}" stroke-width="2.4"/>`;
  if (o.axis) s += `<text x="0" y="${h + 15}" font-size="11" fill="var(--a-mute)" font-family="Inter,sans-serif">${o.axis[0]}</text><text x="${w}" y="${h + 15}" text-anchor="end" font-size="11" fill="var(--a-mute)" font-family="Inter,sans-serif">${o.axis[1]}</text>`;
  return s + '</svg>';
}
const mini = (t, w = 74, h = 32) => chart(S[t], { w, h, grid: false, base: false });
const tf = (on = '1J') => `<div class="seg" style="margin-top:10px">${['1T', '1W', '1M', '1J', '5J', 'Max'].map(x => `<span class="${x === on ? 'on' : ''}">${x}</span>`).join('')}</div>`;
const chg = (v, lg) => `<span class="chg ${v >= 0 ? 'up' : 'dn'}${lg ? ' big' : ''}">${v >= 0 ? '▲' : '▼'} ${pc(v)}</span>`;
const vd = (k, t) => `<span class="vd ${k}">${{ s: '▲', m: '◆', w: '▼', o: '○' }[k]} ${t}</span>`;
const help = t => `<div class="help"><i>?</i><span>${t}</span></div>`;
const lg = (t, xl) => `<span class="lg${xl ? ' xl' : ''}">${t}</span>`;
const row = (t, extra) => `<div class="lr">${lg(t)}<div class="n"><b>${NAMES[t]}</b><span>${extra || WHAT[t] || t}</span></div>${mini(t)}<div class="p"><span class="num">${de(px(t))} $</span>${chg(day(t))}</div></div>`;
const SMA = (a, n) => a.map((v, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n);
const navbar = (left, right = []) => `<div class="nav"><div style="display:flex;align-items:center;gap:8px">${left ? `<span class="ic">${ic('i-back', 19)}</span><b class="sm">${left}</b>` : ''}</div><div style="display:flex;gap:8px">${right.map(r => `<span class="ic">${ic(r, 19)}</span>`).join('')}</div></div>`;
const search = (t = 'Aktie, Thema oder Frage …') => `<div style="display:flex;align-items:center;gap:10px;height:48px;border-radius:999px;background:var(--a-card);padding:0 6px 0 16px;color:var(--a-mute);font-weight:600;font-size:14.5px">${ic('i-search', 18)}<span style="flex:1">${t}</span><span style="width:36px;height:36px;border-radius:50%;background:var(--lime);color:#000;display:grid;place-items:center">${ic('i-spark', 18)}</span></div>`;
const LENS = ['Überblick', 'Chart', 'Zahlen', 'Faktoren', 'Methoden', 'Wellen', 'Investoren'];
const LICON = { 'Überblick': 'discover', Chart: 'technical', Zahlen: 'fundamental', Faktoren: 'quant', Methoden: 'supertrader', Wellen: 'elliott', Investoren: 'hedgefonds' };
const lensbar = on => { const i = LENS.indexOf(on); const order = LENS.slice(Math.max(0, i - 1)); return `<div class="lens">${order.map(l => `<span class="${l === on ? 'on' : ''}">${ic(LICON[l], 17)}${l}</span>`).join('')}</div>`; };
const supp = [194, 198, 'l', 'Unterstützung 194–198'], resi = [207, 217, 'g', 'Widerstand 207–217'];
const bars = (data, o = {}) => { const w = o.w || 354, h = o.h || 150; const mx = Math.max(...data.map(d => d[1])); const bw = w / data.length; return `<svg width="${w}" height="${h + 18}" aria-hidden="true" style="display:block">${data.map((d, i) => { const bh = Math.max(2, d[1] / mx * h); return `<rect x="${(i * bw + 3).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${i === data.length - 1 ? '#c8f531' : 'var(--a-ink)'}"/>` + (i % 2 === (data.length - 1) % 2 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${h + 14}" text-anchor="middle" font-size="10.5" fill="var(--a-mute)" font-family="Inter,sans-serif">${String(d[0]).slice(2)}</text>` : ''); }).join('')}</svg>`; };
Object.keys(D.names||{}).forEach(k=>{NAMES[k]=NAMES[k]||D.names[k];});Object.keys(D.what||{}).forEach(k=>{if(D.what[k]&&!WHAT[k])WHAT[k]=D.what[k];});
/* ---------- Navigation V3: Kopfzeile, Produkt-Leiste, Menü, Aktienkopf ---------- */
const WORLDS = {
  discover: { name: 'Discover', icon: 'discover', claim: 'Aktien entdecken' },
  quant: { name: 'Quant', icon: 'quant', claim: 'Faktoren je Aktie' },
  technical: { name: 'Technical', icon: 'technical', claim: 'Charts und Muster' },
  fundamental: { name: 'Fundamental', icon: 'fundamental', claim: 'Zahlen aus SEC-Berichten' },
  elliott: { name: 'Elliott', icon: 'elliott', claim: 'Wellenstruktur' },
  supertrader: { name: 'Supertrader', icon: 'supertrader', claim: 'Methoden der Profis' },
  hedgefonds: { name: 'Hedgefonds', icon: 'hedgefonds', claim: 'Was Investoren halten' },
  screener: { name: 'Screener', icon: 'screener', claim: 'Eigene Filter' },
  vorsorge: { name: 'Vorsorge', icon: 'vorsorge', claim: 'Sparplan und Rente' },
  mein: { name: 'Mein Bereich', icon: 'i-person', claim: 'Watchlist und Konto' },
  start: { name: 'Vision Universe', icon: 'layers', claim: '' }
};
/* Produkt-Leiste je Welt: [Icon, Label]. Erster Eintrag = Startseite der Welt, letzter = Menü (global). */
const DOCKS = {
  discover: [['discover', 'Discover'], ['i-globe', 'Welten'], ['i-target', 'Strategien'], ['i-swipe', 'Swipen']],
  quant: [['quant', 'Quant'], ['i-filter', 'Screener'], ['i-target', 'Strategien'], ['i-list', 'Aktien']],
  technical: [['technical', 'Technical'], ['i-filter', 'Screener'], ['i-line', 'Chart'], ['i-shapes', 'Muster']],
  fundamental: [['fundamental', 'Fundamental'], ['i-bars', 'Ranglisten'], ['i-grid', 'Branchen'], ['i-book', 'Methodik']],
  elliott: [['elliott', 'Elliott'], ['i-wave', 'Welle 3'], ['i-new', 'Neu'], ['i-book', 'Methodik']],
  supertrader: [['supertrader', 'Supertrader'], ['i-grid', 'Methoden'], ['i-signal', 'Signale'], ['i-bars', 'Backtests']],
  hedgefonds: [['hedgefonds', 'Hedgefonds'], ['i-person', 'Investoren'], ['i-list', 'Aktien'], ['i-signal', 'Smart Money']],
  screener: [['screener', 'Screener'], ['i-plus', 'Filter'], ['i-list', 'Treffer'], ['i-bookmark', 'Gespeichert']],
  vorsorge: [['vorsorge', 'Vorsorge'], ['i-target', 'Planer'], ['i-grid', 'ETFs'], ['i-pie', 'Portfolio']],
  mein: [['i-person', 'Mein Bereich'], ['i-heart', 'Watchlist'], ['i-bookmark', 'Gespeichert'], ['i-gear', 'Konto']]
};
const DOCK = (world, active = 0) => { const items = DOCKS[world] || DOCKS.discover; return `<div class="dock">${items.map(([i, l], k) => k === 0 ? `<div class="d0${active === 0 ? ' on' : ''}">${ic(i, 20)}<span>${l}</span></div>` : `<div class="${active === k ? 'on' : ''}">${ic(i, 21)}<span>${l}</span></div>`).join('')}<div class="${active === 'menu' ? 'on' : ''}">${ic('i-menu', 21)}<span>Menü</span></div></div>`; };
/* Kopfzeile: links die Welt (Icon + Name), rechts Suche, Atlas, Profil. */
const HDR = (world, o = {}) => { const w = WORLDS[world] || WORLDS.start; return `<div class="hdr${o.dk ? ' dk' : ''}"><div class="hl">${world === 'start' || !world ? `<img src="img/vu-logo.png" alt="" class="hlogo">` : `${hud(w.icon, 30, 9)}<b>${w.name}</b>`}</div><div class="hr"><span class="hb">${ic('i-search', 18)}</span><span class="atl">${ic('i-spark', 16)}Atlas</span><span class="hb av">DM</span></div></div>`; };
/* Perspektiven einer Aktie: eine Zeile, Text mit kleinem Icon. Ersetzt die 9er-Icon-Leiste „Analysewelten“. */
const PERSP = [['Überblick', 'discover', 'discover'], ['Chart', 'technical', 'technical'], ['Zahlen', 'fundamental', 'fundamental'], ['Faktoren', 'quant', 'quant'], ['Methoden', 'supertrader', 'supertrader'], ['Wellen', 'elliott', 'elliott'], ['Investoren', 'hedgefonds', 'hedgefonds']];
const perspbar = on => { const i = Math.max(0, PERSP.findIndex(p => p[0] === on)); const order = PERSP.slice(Math.max(0, i - 1)).concat(PERSP.slice(0, Math.max(0, i - 1))); return `<div class="persp">${order.map(([l, icn]) => `<span class="${l === on ? 'on' : ''}">${ic(icn, 15)}${l}</span>`).join('')}</div>`; };
const NV = { t: 'NVDA', name: 'NVIDIA', what: 'Chips für KI und Grafik', p: 204.64, d: -4.2217, eur: '183,17 €', date: 'Fr. 30.10.' };
/* Kopf jeder Aktienseite, in allen Welten gleich. */
const STOCK = (on, o = {}) => { const s = o.s || NV; return `<div class="stk"><div class="stk1"><span class="hb">${ic('i-back', 18)}</span>${lg(s.t)}<div class="stkn"><b>${s.name}</b><span>${s.t} · ${s.what}</span></div><span class="hb">${ic('i-heart', 18)}</span></div><div class="stk2"><span class="num stkp">${de(s.p)} $</span>${chg(s.d, 1)}<span class="mu xs b" style="margin-left:auto;text-align:right">Schluss ${s.date}<br>≈ ${s.eur}</span></div>${o.nopersp ? '' : perspbar(on)}</div>`; };
const toggle = on => `<span class="tgl${on ? ' on' : ''}"><i></i></span>`;
const pill = (t, k = '') => `<span class="chip ${k}" style="height:30px;font-size:12.5px">${t}</span>`;
const sect = (t, a) => `<div class="st">${t}${a ? `<a>${a}</a>` : ''}</div>`;
const kv = (rows) => `<div class="card">${rows.map(([k, v]) => `<div class="kv"><span class="sm b">${k}</span><span class="bb num">${v}</span></div>`).join('')}</div>`;
const tile = (label, value, sub) => `<div class="card" style="padding:12px"><div class="mu xs b">${label}</div><div class="bb num" style="font-size:20px;margin-top:3px">${value}</div>${sub ? `<div class="mu xs" style="margin-top:2px">${sub}</div>` : ''}</div>`;
const navcard = (icon, t, s, right = '') => `<div class="card" style="display:flex;gap:12px;align-items:center;padding:12px">${icon.startsWith('i-') ? `<span class="hud" style="width:42px;height:42px">${ic(icon, 21)}</span>` : hud(icon, 42)}<div style="flex:1;min-width:0"><div class="bb">${t}</div>${s ? `<div class="mu sm">${s}</div>` : ''}</div>${right || ic('i-next', 18)}</div>`;
const intro = (world, title, lead) => { const w = WORLDS[world]; return `<div style="margin-top:4px"><div class="ltag">${w ? w.name : ''}</div><div class="lt" style="margin-top:2px">${title}</div>${lead ? `<p class="mu" style="margin-top:8px;font-size:15.5px">${lead}</p>` : ''}</div>`; };
const S2 = t => (S[t] ? row(t) : '');

/* ---------- Registry ---------- */
const VU = window.VU = window.VU || {};
VU.screens = VU.screens || {};
VU.slides = VU.slides || [];
/* Ein Screen: {world, dock: Index|'menu'|false, hdr: true|false, dk, h: Höhe in px (>= 844, lange Seiten scrollen im Rahmen), body, overlay, nopad} */
VU.screen = (id, o) => { VU.screens[id] = o; };
/* Eine Folie: {t:'page', id, world, title, route, newRoute, now: Aufnahme-ID, neu: [[screenId, Beschriftung]], spec: {aufbau:[], komponenten:[], daten:[], weg:[]}} */
VU.slide = s => VU.slides.push(s);
VU.chapter = c => VU.slides.push(Object.assign({ t: 'chapter' }, c));
Object.assign(VU, { de, pc, last, ic, hud, chart, mini, tf, chg, vd, help, lg, row, SMA, navbar, search, bars, S, D, NAMES, WHAT, day, px, down, supp, resi, WORLDS, DOCKS, DOCK, HDR, perspbar, PERSP, STOCK, NV, toggle, pill, sect, kv, tile, navcard, intro, S2 });

})();

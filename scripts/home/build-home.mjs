// Erzeugt /index.html aus scripts/home/index.template.html.
//
// Alle Werte in den Produktabbildungen der Startseite kommen aus den
// committeten Produktdaten - Kurse, Fundamentaldaten, Technik, Elliott,
// Faktoren, Supertrader-Signale und Discover-Rankings. Der Workflow
// "Startseite: Werte der Produktabbildungen" fuehrt das Skript nach den
// Datenlaeufen aus; die Seite zeigt deshalb kein Datum, sondern immer den
// letzten veroeffentlichten Stand.
//
// Aufruf: node scripts/home/build-home.mjs [--out=pfad/index.html]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const outArg = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const read = p => readFileSync(new URL(p, root), 'utf8');
const json = p => JSON.parse(read(p));
const gz = p => JSON.parse(gunzipSync(readFileSync(new URL(p, root))));
const has = p => existsSync(new URL(p, root));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Zahlen im deutschen Format
const de = (n, d = 1) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (r, d = 1) => de(r * 100, d) + ' %';
const signed = (r, d = 1) => (r >= 0 ? '+' : '−') + pct(Math.abs(r), d);
const usd = n => de(n, 2) + ' $';
const f1 = n => n.toFixed(1);

// Quellen je Ticker (Schluessel ueber die Anfangsbuchstaben wie in den Shards)
const shard = t => t.slice(0, 2);
const techCache = {}, factorCache = {};
const tech = t => {
  const k = shard(t);
  techCache[k] ??= has(`quant/data/product/technical-signals-v1/${k}.json.gz`) ? gz(`quant/data/product/technical-signals-v1/${k}.json.gz`) : { instruments: {} };
  return techCache[k].instruments[t] || null;
};
const factors = t => {
  const k = shard(t);
  factorCache[k] ??= has(`quant/data/product/factor-evidence-v1/${k}.json.gz`) ? gz(`quant/data/product/factor-evidence-v1/${k}.json.gz`) : { securities: {} };
  return factorCache[k].securities[t] || null;
};
const stock = t => json(`discover/data/stocks/US_REAL/${t}.json`);
const metric = (s, k) => s.metrics?.[k] ?? null;

// Begriffe
const TREND = { BULLISH: 'bullisch', BEARISH: 'bärisch', NEUTRAL: 'neutral' };
const STRATEGY = { DARVAS_BOX: 'Darvas Boxes', DONCHIAN_TURTLE: 'Donchian / Turtle', MOMENTUM_BREAKOUT: 'Momentum Breakout',
  WEINSTEIN_STAGE: 'Weinstein Stages', MINERVINI_VCP: 'Minervini VCP', CANSLIM: 'CAN SLIM' };
const STATE = { ACTIVE: ['Aktiv', 'on'], ENTRY_READY: ['Einstieg bereit', 'ready'], SETUP: ['Setup', 'ready'], WATCH: ['Watch', ''], DISCOVERED: ['Entdeckt', ''] };
const FACTOR = { profitability: 'Profitabilität', growth: 'Wachstum', risk: 'Risiko-Score', momentum: 'Momentum', value: 'Bewertung', quality: 'Qualität', revisions: 'Revisionen' };

// Elliott kommt aus dem Chartbild (Technical Intelligence v3, Elliott 3.2.2) - dieselbe Aussage wie auf der
// Chartbild-Seite, nicht mehr aus der V1-Engine in technical-signals-v1. Enthaelt sich die Engine (bei den
// meisten Titeln), gibt es keine Wellenangabe und keine Wellenpunkte im Chart.
const tiCache = {};
const tiKey = t => (String(t).toUpperCase() + '_').slice(0, 2).replace(/[^A-Z0-9._-]/g, '_');
const ti = t => {
  const k = tiKey(t), p = `quant/data/technical-intelligence/v3/shards/${k}.json.gz`;
  tiCache[k] ??= has(p) ? gz(p) : { instruments: {} };
  return tiCache[k].instruments[t] || null;
};
const elliottOf = t => {
  const E = ti(t)?.pro?.elliott, p = E?.primary;
  if (!p || !E.applicability || E.applicability.abstain) return { short: 'offen', long: 'keine belastbare Zählung', waves: [] };
  const lab = p.complete ? 'abgeschlossen' : 'Welle ' + (p.currentWave?.label ?? '?');
  return { short: lab, long: lab + (p.patternName ? ' · ' + p.patternName.replace(/ \(.*\)$/, '') : ''), waves: p.waves || [] };
};
const trendOf = b => ({ dir: b?.trend?.direction || 'NEUTRAL', score: b?.trend?.trendScore ?? null });

// ---------- Hauptchart: NVIDIA, Technik und Elliott ----------
const MAIN = 'NVDA';
const nvda = tech(MAIN), b = nvda.bundle, close = nvda.bars.close, ts = nvda.bars.timestamps;
const setup = b.tradeSetup || {};
const inv = setup.analysisInvalidation?.price ?? null;
const tgt = (setup.targets || []).at(-1) || null;
const ent = setup.entry || null;
const levels = [...close, inv, tgt?.zoneHigh, tgt?.zoneLow].filter(v => v != null);
// Preisachse: auf 20er-Stufen gerundet, damit Raster und Beschriftung passen
const BOT = Math.floor(Math.min(...levels) * 0.97 / 20) * 20, TOP = Math.ceil(Math.max(...levels) * 1.01 / 20) * 20;
const W = 600, H = 260;
const x = k => k / (close.length - 1) * W, y = v => (TOP - v) / (TOP - BOT) * H;
const path = a => a.map((v, k) => v == null ? null : `${f1(x(k))} ${f1(y(v))}`).filter(Boolean).map((p, k) => (k ? 'L' : 'M') + p).join(' ');
const grid = [], gridLabels = [];
for (let v = BOT; v <= TOP; v += 20) { grid.push(`M0 ${f1(y(v))}H600`); gridLabels.push(`<text x="608" y="${f1(y(v) + 4)}">${v}</text>`); }

const waves = elliottOf(MAIN).waves.filter(w => ts.includes(w.fromTime) && ts.includes(w.toTime));
const pts = waves.length ? [[waves[0].fromTime, waves[0].fromPrice, '0'], ...waves.map(w => [w.toTime, w.toPrice, w.label])] : [];
const waveNodes = pts.map(([d, p, l], i) => {
  const px = x(ts.indexOf(d)), py = y(p);
  const below = i === 0 ? (pts[1] && pts[1][1] > p) : pts[i - 1][1] > p;
  const lx = Math.min(Math.max(px, 12), W - 12), ly = below ? py + 20 : py - 12;
  return `<g class="wn" style="--i:${i}"><circle cx="${f1(px)}" cy="${f1(py)}" r="4" fill="#0b0d10" stroke="#f4f5f1" stroke-width="1.6"/><text x="${f1(lx)}" y="${f1(ly)}" text-anchor="middle" fill="#f4f5f1" font-size="13" font-weight="900" font-family="Inter,sans-serif">(${esc(l)})</text></g>`;
}).join('');
const zones = [
  tgt ? `<rect x="0" y="${f1(y(tgt.zoneHigh))}" width="600" height="${f1(y(tgt.zoneLow) - y(tgt.zoneHigh))}" fill="rgba(200,245,49,.14)" stroke="rgba(200,245,49,.55)" stroke-dasharray="4 4"/><text x="8" y="${f1(y(tgt.zoneLow) + 13)}" fill="#c8f531" font-size="10.5" font-weight="800" font-family="Inter,sans-serif">ZIELZONE ${de(tgt.zoneLow, 0)}–${de(tgt.zoneHigh, 0)}</text>` : '',
  ent ? `<rect x="0" y="${f1(y(ent.zoneHigh))}" width="600" height="${f1(y(ent.zoneLow) - y(ent.zoneHigh))}" fill="rgba(255,255,255,.06)"/>` : '',
  inv != null ? `<path d="M0 ${f1(y(inv))}H600" stroke="#f0675c" stroke-width="1.4" stroke-dasharray="6 5"/><text x="8" y="${f1(y(inv) + 14)}" fill="#f0675c" font-size="10.5" font-weight="800" font-family="Inter,sans-serif">INVALIDIERUNG ${de(inv, 0)}</text>` : '',
].join('');
// Inhalt des Charts: einmal als Symbol (fuer <use>), einmal direkt im Hero,
// wo die Intro-Animation die Linie zeichnet und die Elliott-Punkte einblendet.
const wavePath = pts.map(([d, p], i) => (i ? 'L' : 'M') + f1(x(ts.indexOf(d))) + ' ' + f1(y(p))).join(' ');
const chartBody = [
  `<g stroke="rgba(255,255,255,.07)" stroke-width="1"><path d="${grid.join('')}"/></g>`,
  `<g fill="#8a9099" font-size="10" font-family="Inter,sans-serif" font-weight="600">${gridLabels.join('')}</g>`,
  `<g class="c-zones">${zones}</g>`,
  `<path class="c-area" d="${path(close)} L${W} ${H} L0 ${H}Z" fill="url(#nvda-fill)"/>`,
  `<path class="c-s200" d="${path(b.chartSeries.sma200)}" fill="none" stroke="#6f7680" stroke-width="1.4" pathLength="1"/>`,
  `<path class="c-s50" d="${path(b.chartSeries.sma50)}" fill="none" stroke="#e9e3c9" stroke-width="1.3" stroke-opacity=".7" pathLength="1"/>`,
  `<path class="c-close" d="${path(close)}" fill="none" stroke="#c8f531" stroke-width="2.2" stroke-linejoin="round" pathLength="1"/>`,
  `<path class="c-wave" d="${wavePath}" fill="none" stroke="#f4f5f1" stroke-width="1.3" stroke-dasharray="3 4"/>`,
  `<g class="c-nodes">${waveNodes}</g>`,
].join('\n    ');

// ---------- NVIDIA: Aktienseite ----------
const s = stock(MAIN), gzNvda = s.geschaeftszahlen || {};
const nvdaEll = elliottOf(MAIN), nvdaTrend = trendOf(b);
const f = b.featuresAtCutoff || {};
const aboveBoth = f.sma50 && f.sma200 && close.at(-1) > f.sma50 && close.at(-1) > f.sma200;
const badges = (s.badges || []).slice(0, 2).map(x => `<span>${esc(x.label)}${x.id === 'marketLeader' && x.detail ? ' · ' + esc(x.detail) : ''}</span>`).join('');

// ---------- Supertrader ----------
const sig = json('supertrader/data/signals.json');
const CAND = ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'META', 'AVGO', 'GOOGL', 'TSLA'];
const signalRows = [];
for (const t of CAND) {
  for (const e of sig.bySymbol?.[t] || []) {
    if (!STATE[e.state] || !STRATEGY[e.strategyId]) continue;
    const open = (sig.strategies?.[e.strategyId]?.open || []).find(o => o.id === e.id);
    const lv = open?.levels || {};
    const detail = lv.boxTop && lv.boxBottom ? `Box ${de(lv.boxBottom, 2)} – ${de(lv.boxTop, 2)} $`
      : lv.trigger ? `Auslöser ${de(lv.trigger, 2)} $${lv.invalidation ? ' · Invalidierung ' + de(lv.invalidation, 2) + ' $' : ''}` : 'Beobachtung';
    signalRows.push({ t, rank: Object.keys(STATE).indexOf(e.state), html: `<div class="sig"><span class="t"><i>${t}</i></span><div><b>${STRATEGY[e.strategyId]}</b><small>${detail}</small></div><span class="state ${STATE[e.state][1]}">${STATE[e.state][0]}</span></div>` });
  }
}
signalRows.sort((a, c) => a.rank - c.rank);
const firstSignal = signalRows.find(r => r.t === MAIN);
const nvdaSignal = (sig.bySymbol?.[MAIN] || []).find(e => STATE[e.state] && STRATEGY[e.strategyId]);

// ---------- Screener: Wachstum mit Marge ----------
const screen = CAND.map(t => { const st = stock(t); return { t, name: st.companyName.replace(/ Class [A-Z]$/, ''), g: metric(st, 'f_revenueGrowthTTM'), m: metric(st, 'f_netMargin'), pe: metric(st, 'f_pe') }; })
  .filter(r => r.g > 0.10 && r.m > 0.10 && r.pe > 0 && r.pe < 50).sort((a, c) => c.g - a.g).slice(0, 6);
const gMax = Math.max(...screen.map(r => r.g));
const screenerRows = screen.map(r => `<tr><td><span class="t"><i>${r.t}</i>${esc(r.name)}</span></td><td><span class="bar"><i style="width:${Math.max(6, Math.round(r.g / gMax * 100))}%"></i></span> ${pct(r.g)}</td><td class="hide-s">${pct(r.m)}</td><td>${de(r.pe)}</td></tr>`).join('\n              ');

// ---------- Sparklines (letzte 66 Handelstage) ----------
const spark = t => {
  const c = tech(t)?.bars?.close?.slice(-66);
  if (!c || c.length < 10) return null;
  const mn = Math.min(...c), mx = Math.max(...c);
  return { d: c.map((v, k) => (k ? 'L' : 'M') + f1(k / (c.length - 1) * 60) + ' ' + f1(2 + (mx - v) / (mx - mn || 1) * 20)).join(''), chg: c.at(-1) / c[0] - 1 };
};

// ---------- Discover: staerkste Aktien im Thema KI ----------
const ki = json('discover/data/rows/US_REAL/thema-ki.json');
const kiRows = ki.cards.slice(0, 4).map((c, i) => {
  const sp = spark(c.symbol);
  const chg = sp ? `<svg class="spk" viewBox="0 0 60 24"><path d="${sp.d}"/></svg> <span class="${sp.chg >= 0 ? 'up' : 'down'}">${signed(sp.chg)}</span>` : '';
  return `<tr><td>#${c.rankingReason?.rank ?? i + 1}</td><td><span class="t"><i>${c.symbol}</i>${esc(c.companyName.replace(/ Class [A-Z]$/, ''))}</span></td><td>${chg}</td></tr>`;
}).join('\n                ');

// ---------- Watchlist im Smartphone ----------
const watch = ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'META'].map(t => {
  const st = stock(t), bt = tech(t)?.bundle, sp = spark(t), e = elliottOf(t), tr = trendOf(bt);
  const note = e.short !== 'offen' && t === MAIN ? e.long.split(' · ')[0] : 'Trend ' + (TREND[tr.dir] || 'neutral');
  return `<div class="app-row"><span class="app-logo">${t}</span><div><b>${esc(st.companyName.replace(/ Class [A-Z]$/, ''))}</b><small>${usd(st.price.value)} · ${note}</small></div>${sp ? `<svg viewBox="0 0 60 24"><path d="${sp.d}" fill="none" stroke="#c8f531" stroke-width="2"/></svg>` : ''}</div>`;
}).join('\n            ');

// ---------- Quant: Faktor-DNA ----------
const fx = factors(MAIN)?.factors || {};
const factorRows = Object.entries(fx).filter(([k, v]) => FACTOR[k] && typeof v?.score === 'number')
  .sort((a, c) => c[1].score - a[1].score).slice(0, 6)
  .map(([k, v]) => `<div class="fx"><span>${FACTOR[k]}</span><span class="fbar"><i style="width:${f1(v.score)}%"></i></span><b>${Math.round(v.score)}</b></div>`).join('\n            ');

// ---------- Discover: Unternehmensentwicklung NVIDIA (SEC, Geschaeftsjahre) ----------
const JOURNEY_TRACKS = [['revenue', 'Umsatz'], ['net_income', 'Gewinn'], ['operating_cash_flow', 'Cashflow']];
const tracks = s.fundamentals?.journey?.tracks || {};
const journey = JOURNEY_TRACKS.map(([id, label]) => ({ id, label, rows: (Array.isArray(tracks[id]) ? tracks[id] : []).filter(r => Number.isFinite(r.v)).map(r => ({ fy: r.fy, v: r.v })) }))
  .filter(t => t.rows.length >= 3);
const bn = v => de(v / 1e9) + ' Mrd. $';
const growthText = rows => { const a = rows[0].v, z = rows.at(-1).v; return a > 0 ? (z >= a ? '+' : '−') + de(Math.abs(z / a - 1) * 100, 0) + ' %' : '–'; };
const j0 = journey[0];
const jMax = Math.max(...j0.rows.map(r => r.v));
const journeyBars = j0.rows.map((r, i) => `<button class="jbar${i === j0.rows.length - 1 ? ' on' : ''}" type="button" role="listitem" style="--h:${Math.max(1.5, r.v / jMax * 100).toFixed(1)}%;--i:${i}" data-i="${i}" aria-label="GJ ${r.fy}: ${bn(r.v)}"><i></i><span>${String(r.fy).slice(2)}</span></button>`).join('');

// ---------- Discover: Swipe-Feed (Thema KI) ----------
// Ticker statt Firmenlogos: die Logo-Ablage erlaubt keine Nutzung in Werbung.
const swipeRow = json('discover/data/rows/US_REAL/thema-ki.json');
const perf12 = c => { const p = (c.performancePath || []); const a = p.find(x => x.label === '12M'), z = p.find(x => x.label === 'heute');
  return a && z && a.value > 0 ? z.value / a.value - 1 : null; };
const pathSpark = c => { const p = (c.performancePath || []).map(x => x.value).filter(Number.isFinite); if (p.length < 3) return '';
  const mn = Math.min(...p), mx = Math.max(...p); return p.map((v, k) => (k ? 'L' : 'M') + f1(k / (p.length - 1) * 120) + ' ' + f1(4 + (mx - v) / (mx - mn || 1) * 32)).join(''); };
const swipeCards = swipeRow.cards.slice(0, 8).map((c, i) => {
  const chg = c.changePercent?.value, y = perf12(c), badge = (c.badges || [])[0];
  return `<article class="card" style="--k:${i}" data-k="${i}"><div class="card-top"><span class="tk">${esc(c.symbol)}</span>${badge ? `<span class="cbadge">${esc(badge.label)}</span>` : ''}</div>`
    + `<b class="cname">${esc(c.companyName.replace(/ Class [A-Z]$/, ''))}</b><small class="cwhat">${esc(c.was || c.sector || '')}</small>`
    + `<div class="card-px"><b>${usd(c.price.value)}</b>${Number.isFinite(chg) ? `<em class="${chg >= 0 ? 'up' : 'down'}">${signed(chg / 100, 2)}</em>` : ''}</div>`
    + `<svg class="cspark" viewBox="0 0 120 40" preserveAspectRatio="none"><path d="${pathSpark(c)}"/></svg>`
    + `<div class="card-meta"><span>Rang #${c.rankingReason?.rank ?? i + 1} im Thema KI</span>${y != null ? `<b class="${y >= 0 ? 'up' : 'down'}">${signed(y)} <small>12 M.</small></b>` : ''}</div>`
    + `<span class="stamp like">MERKEN</span><span class="stamp nope">WEITER</span></article>`;
}).join('');

// ---------- Discover: Themenwelten als laufende Reihen ----------
const themeCtx = { VUDiscover: {} }; themeCtx.globalThis = themeCtx; themeCtx.window = themeCtx;
runInNewContext(read('discover/themes.js'), themeCtx);
const worlds = (themeCtx.VUDiscover.Views?.Themes?.all || []).filter(t => t.photo).map(t => {
  let count = null; try { if (t.rowId && has(`discover/data/rows/US_REAL/${t.rowId}.json`)) count = json(`discover/data/rows/US_REAL/${t.rowId}.json`).cards.length; } catch (e) { /* ohne Zahl */ }
  return `<a class="world" href="/discover/#/welten" tabindex="-1"><img src="${t.photo.replace('/assets/themen/', '/assets/home/worlds/')}" alt="" loading="lazy" decoding="async"><span><small>${esc(t.short)}${count ? ' · ' + count + ' Aktien' : ''}</small>${esc(t.title)}</span></a>`;
});
const third = Math.ceil(worlds.length / 3);
const worldRows = [0, 1, 2].map(r => { const part = worlds.slice(r * third, (r + 1) * third);
  return `<div class="world-row${r === 1 ? ' rev' : ''}"><div class="world-track">${part.join('')}${part.join('').replace(/<a class="world"/g, '<a class="world" aria-hidden="true"')}</div></div>`; }).join('\n        ');

const values = {
  HUD_SYMBOLS: read('scripts/home/hud-symbols.html').trimEnd(),
  CHART_BODY: chartBody,
  SWIPE_CARDS: swipeCards, WORLD_ROWS: worldRows,
  JOURNEY_TABS: journey.map((t, i) => `<button type="button" role="tab" data-track="${t.id}" aria-selected="${i === 0}">${t.label}</button>`).join(''),
  JOURNEY_FROM: bn(j0.rows[0].v), JOURNEY_FROM_YEAR: 'GJ ' + j0.rows[0].fy,
  JOURNEY_TO: bn(j0.rows.at(-1).v), JOURNEY_TO_YEAR: 'GJ ' + j0.rows.at(-1).fy,
  JOURNEY_GROWTH: growthText(j0.rows), JOURNEY_SPAN: (j0.rows.at(-1).fy - j0.rows[0].fy) + ' Jahre',
  JOURNEY_BARS: journeyBars,
  JOURNEY_JSON: JSON.stringify(journey).replace(/</g, '\\u003c'),
  NVDA_PRICE: usd(s.price.value), NVDA_CHG: signed(s.changePercent.value / 100, 2), NVDA_CHG_CLASS: s.changePercent.value >= 0 ? 'up' : 'down',
  NVDA_WHAT: esc(s.was || 'Chips für KI und Grafik'), NVDA_BADGES: badges,
  NVDA_REV: de(gzNvda.umsatzTTM / 1000) + ' Mrd. $', NVDA_REV_G: signed(gzNvda.umsatzWachstum, 1),
  NVDA_MARGIN: pct(metric(s, 'f_netMargin')), NVDA_PE: de(metric(s, 'f_pe')),
  NVDA_WAVE_SHORT: nvdaEll.short === 'offen' ? 'offen' : nvdaEll.short, NVDA_WAVE_LONG: nvdaEll.long,
  NVDA_TREND: nvdaTrend.score != null ? de(nvdaTrend.score) : '–', NVDA_TREND_DIR: TREND[nvdaTrend.dir] || 'neutral',
  NVDA_TREND_DIR_CAP: (t => t[0].toUpperCase() + t.slice(1))(TREND[nvdaTrend.dir] || 'neutral'),
  NVDA_TREND_CLASS: nvdaTrend.dir === 'BULLISH' ? 'up' : nvdaTrend.dir === 'BEARISH' ? 'down' : '',
  NVDA_TREND_NOTE: aboveBoth ? 'über SMA 50 &amp; 200' : 'Bezug SMA 50 &amp; 200',
  NVDA_RSI: f.rsi14 != null ? de(f.rsi14) : '–',
  NVDA_SIGNAL: nvdaSignal ? STRATEGY[nvdaSignal.strategyId] : 'Keine Setups',
  NVDA_SIGNAL_STATE: nvdaSignal ? STATE[nvdaSignal.state][0].toLowerCase() : 'beobachtet',
  SIGNAL_ROWS: (signalRows.length ? signalRows.slice(0, 5).map(r => r.html) : ['<div class="sig"><div><b>Derzeit keine Setups</b><small>bei den großen Namen</small></div></div>']).join('\n            '),
  SCREENER_ROWS: screenerRows, KI_ROWS: kiRows, WATCH_ROWS: watch, FACTOR_ROWS: factorRows,
};

const out = read('scripts/home/index.template.html').replace(/%%([A-Z0-9_]+)%%/g, (m, k) => {
  if (!(k in values)) throw new Error('Unbekannter Platzhalter ' + m);
  return values[k];
});
const target = outArg ? new URL(outArg, 'file://' + process.cwd() + '/') : new URL('index.html', root);
writeFileSync(target, out);
console.log(`Startseite geschrieben · Kurse ${b.dataCutoff} · Elliott ${pts.map(p => p[2]).join(',') || '–'} · Signale ${signalRows.length} · Screener ${screen.length}${firstSignal ? '' : ''}`);

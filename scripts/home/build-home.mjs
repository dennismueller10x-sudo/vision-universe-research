// Erzeugt /index.html aus scripts/home/index.template.html (Startseite, Mockup E01 „Vision Universe Redesign“).
//
// Alle Werte kommen aus den committeten Produktdaten: Kurs und Kursverlauf (Discover-Aktie, Technical-Bündel),
// Urteile aus vorhandenen Einstufungen (Fundamental-Gesundheit, Quant-Faktorstufen, Technical-Trend),
// Umsatzreihe aus den SEC-Daten, Swipe-Karte und Themenwelten aus Discover. Die Seite rechnet nichts neu
// und bildet keine eigenen Urteile: sie zeigt die Einstufung, die das jeweilige Produkt veröffentlicht.
// Der Pro-Preis steht nie im Code (Preisseite /preise/ liest GET /v1/plans).
//
// Aufruf: node scripts/home/build-home.mjs [--out=pfad/index.html]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { cancelLinkItem } from './cancel-link.mjs';

const root = new URL('../../', import.meta.url);
const outArg = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const read = p => readFileSync(new URL(p, root), 'utf8');
const json = p => JSON.parse(read(p));
const gz = p => JSON.parse(gunzipSync(readFileSync(new URL(p, root))));
const has = p => existsSync(new URL(p, root));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const de = (n, d = 1) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const f1 = n => n.toFixed(1);
const usd = n => de(n, 2) + ' $';
const dateDe = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
const shortDe = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4);
const cleanName = n => String(n || '').replace(/ Class [A-Z]$/, '').replace(/ Corp(oration)?\.?$| Inc\.?$/, '');

const shard = t => t.slice(0, 2);
const techCache = {}, factorCache = {};
const tech = t => {
  const k = shard(t), p = `quant/data/product/technical-signals-v1/${k}.json.gz`;
  techCache[k] ??= has(p) ? gz(p) : { instruments: {} };
  return techCache[k].instruments[t] || null;
};
const factorShard = t => {
  const k = shard(t), p = `quant/data/product/factor-evidence-v1/${k}.json.gz`;
  factorCache[k] ??= has(p) ? gz(p) : { securities: {}, bandSemantics: null };
  return factorCache[k];
};
const stock = t => json(`discover/data/stocks/US_REAL/${t}.json`);

/* C07 Kursbewegung und C08 Urteil (assets/site-navigation.css). */
const chg = (v, big) => `<span class="vu-chg${v < 0 ? ' vu-chg--down' : ''}${big ? ' vu-chg--big' : ''}">${(v >= 0 ? '+' : '−') + de(Math.abs(v), 2)} %</span>`;
const VERDICT = { strong: 'vu-verdict--strong', mid: 'vu-verdict--mid', weak: 'vu-verdict--weak', none: 'vu-verdict--none' };
const verdict = (k, t) => `<span class="vu-verdict ${VERDICT[k]}">${esc(t)}</span>`;
const icon = id => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/product-icons.svg#${id}"/></svg>`;

// ---------- Live-Karte NVIDIA ----------
const MAIN = 'NVDA';
const s = stock(MAIN), t = tech(MAIN);
const close = t.bars.close.slice(-252), ts = t.bars.timestamps.slice(-252);

/* C06 Der eine Chart: schwarze Linie, neongrüne Fläche, gestrichelte Startlinie, Punkt am Ende. */
function chartSvg(a, w = 354, h = 150) {
  const mn = Math.min(...a), mx = Math.max(...a), r = (mx - mn) || 1, lo = mn - r * .04, hi = mx + r * .04;
  const X = i => i * (w - 8) / (a.length - 1), Y = v => 6 + (h - 12) * (1 - (v - lo) / (hi - lo));
  const d = a.map((v, i) => (i ? 'L' : 'M') + f1(X(i)) + ' ' + f1(Y(v))).join(' ');
  const grid = [1, 2, 3].map(i => `<line x1="0" x2="${w}" y1="${f1(6 + (h - 12) * i / 4)}" y2="${f1(6 + (h - 12) * i / 4)}"/>`).join('');
  return `<svg class="vu-onechart" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="g-live" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8f531" stop-opacity=".55"/><stop offset="1" stop-color="#c8f531" stop-opacity="0"/></linearGradient></defs>`
    + `<g class="grid">${grid}</g><line class="base" x1="0" x2="${w}" y1="${f1(Y(a[0]))}" y2="${f1(Y(a[0]))}"/>`
    + `<path d="${d} L${f1(X(a.length - 1))} ${h} L0 ${h}Z" fill="url(#g-live)"/><path class="line" d="${d}"/>`
    + `<circle class="dot" cx="${f1(X(a.length - 1))}" cy="${f1(Y(a.at(-1)))}" r="5"/></svg>`;
}

/* Urteile aus vorhandenen Einstufungen. Fehlt eine, steht dort ehrlich „Keine Aussage“. */
const health = (s.fundamentals?.health?.categories || []).find(c => c.id === 'growth');
const gradeKind = g => /Sehr stark|^Stark|Sehr solide/.test(g || '') ? 'strong' : /Solide|Mittel|Durchschnitt/.test(g || '') ? 'mid' : g ? 'weak' : 'none';
const gz0 = s.geschaeftszahlen || {};
const revG = Number.isFinite(gz0.umsatzWachstum) ? (gz0.umsatzWachstum >= 0 ? '+' : '−') + de(Math.abs(gz0.umsatzWachstum) * 100, 0) + ' % in 12 Monaten' : 'Umsatzwachstum fehlt';
const fs0 = factorShard(MAIN), fsec = fs0.securities[MAIN];
const bands = fs0.bandSemantics?.bands || [{ min: 90, label: 'Sehr stark' }, { min: 75, label: 'Stark' }, { min: 45, label: 'Durchschnittlich' }, { min: 25, label: 'Schwach' }, { min: 0, label: 'Sehr schwach' }];
const bandOf = pos => bands.slice().sort((a, b) => b.min - a.min).find(b => pos >= b.min);
const rated = Object.values(fsec?.factors || {}).filter(f => f.state === 'AVAILABLE' && Number.isFinite(f.position));
const strongN = rated.filter(f => f.position >= 75).length, weakN = rated.filter(f => f.position < 45).length;
const factorVerdict = !rated.length ? ['none', 'Keine Aussage'] : strongN * 2 > rated.length ? ['strong', 'Überwiegend stark'] : weakN * 2 > rated.length ? ['weak', 'Überwiegend schwach'] : ['mid', 'Gemischt'];
const trend = t.bundle?.trend?.direction;
const TREND = { BULLISH: ['strong', 'Aufwärtstrend', 'Trend steigend'], BEARISH: ['weak', 'Abwärtstrend', 'Trend fallend'], NEUTRAL: ['mid', 'Seitwärts', 'kein klarer Trend'] };
const tr = TREND[trend] || ['none', 'Keine Aussage', 'Trend nicht bestimmt'];
const verdictRows = [
  ['fundamental', 'Geschäft', revG, gradeKind(health?.grade), health?.grade || 'Keine Aussage'],
  ['quant', 'Eigenschaften', rated.length ? `${strongN} von ${rated.length} stark` : 'nicht bewertet', factorVerdict[0], factorVerdict[1]],
  ['technical', 'Chart', tr[2], tr[0], tr[1]]
].map(([i, n, sub, k, label]) => `<li><span class="vu-hud" style="--vu-hud:36px">${icon(i)}</span><span class="v-name"><b>${n}</b><small>${esc(sub)}</small></span>${verdict(k, label)}</li>`).join('');

// ---------- Sieben Blickwinkel (Perspektiven-Leiste N5) ----------
const PERSPECTIVES = [
  ['discover', 'Überblick', 'Alles auf einen Blick', `/discover/#/s/US_REAL/${MAIN}`],
  ['technical', 'Chart', 'Trend, Unterstützung, Widerstand', `/technical/#/chart/${MAIN}`],
  ['fundamental', 'Zahlen', 'Umsatz, Gewinn, Cashflow seit 2015', `/fundamental/#/${MAIN}`],
  ['quant', 'Faktoren', 'Wachstum, Qualität, Risiko …', `/quant/#/aktie/${MAIN}`],
  ['supertrader', 'Methoden', 'Regeln berühmter Trader', `/supertrader/stock/${MAIN}/`],
  ['elliott', 'Wellen', 'Wellenstruktur im Kurs, experimentell', `/elliott/#/${MAIN}`],
  ['hedgefonds', 'Investoren', 'Wer die Aktie hält', '/hedgefonds/#/aktien']
].map(([i, n, d, h]) => `<li><a href="${h}"><span class="vu-hud" style="--vu-hud:32px">${icon(i)}</span><b>${n}</b><span>${d}</span></a></li>`).join('');

// ---------- Fundamental: Umsatz je Geschäftsjahr (SEC) ----------
const rev = (s.fundamentals?.journey?.tracks?.revenue || []).filter(r => Number.isFinite(r.v));
const bn = v => de(v / 1e9) + ' Mrd. $';
const rMax = Math.max(...rev.map(r => r.v));
const journeyBars = rev.map((r, i) => `<span class="b${i === rev.length - 1 ? ' on' : ''}" style="--h:${Math.max(2, r.v / rMax * 100).toFixed(1)}%"><i></i>${i % 2 === (rev.length - 1) % 2 ? `<small>${String(r.fy).slice(2)}</small>` : ''}</span>`).join('');

// ---------- Discover: Swipe-Karte und Themenwelten ----------
const ki = json('discover/data/rows/US_REAL/thema-ki.json');
const card = ki.cards[0], badge = (card.badges || [])[0];
const swipeCard = `<a class="vu-box vu-box--ink swipe" href="/discover/#/einzeln/US_REAL"><span class="swipe-top"><span class="vu-logo-tile swipe-logo">${esc(card.symbol)}</span>${badge ? `<span class="tag-lime">${esc(badge.label)}</span>` : ''}</span>`
  + `<b class="swipe-name">${esc(cleanName(card.companyName))}</b><small>${esc(card.was || card.sector || '')}</small>`
  + `<span class="swipe-px"><b>${usd(card.price.value)}</b>${Number.isFinite(card.changePercent?.value) ? chg(card.changePercent.value) : ''}</span></a>`;
const themeCtx = { VUDiscover: {} }; themeCtx.globalThis = themeCtx; themeCtx.window = themeCtx;
runInNewContext(read('discover/themes.js'), themeCtx);
const themes = (themeCtx.VUDiscover.Views?.Themes?.all || []).filter(x => x.photo);
const pick = ['kuenstliche-intelligenz', 'halbleiter-chips', 'raumfahrt'];
const shown = pick.map(k => themes.find(x => x.photo.includes(k))).filter(Boolean);
const worldTiles = (shown.length === 3 ? shown : themes.slice(0, 3)).map(x => `<a class="world" href="/discover/#/welten"><img src="${x.photo.replace('/assets/themen/', '/assets/home/worlds/')}" alt="" loading="lazy" decoding="async" width="240" height="300"><span>${esc(x.short || x.title)}</span></a>`).join('');

// ---------- Neun Welten ----------
const NINE = [['discover', 'Discover', 'Aktien entdecken', '/discover/'], ['quant', 'Quant', 'Faktoren je Aktie', '/quant/'], ['technical', 'Technical', 'Charts und Muster', '/technical/'],
  ['fundamental', 'Fundamental', 'Zahlen aus SEC-Berichten', '/fundamental/'], ['supertrader', 'Supertrader', 'Methoden der Profis', '/supertrader/'], ['hedgefonds', 'Hedgefonds', 'Was Investoren halten', '/hedgefonds/'],
  ['elliott', 'Elliott', 'Wellenstruktur', '/elliott/'], ['screener', 'Screener', 'Eigene Filter', '/screener/'], ['vorsorge', 'Vorsorge', 'Sparplan und Rente', '/vorsorge/']]
  .map(([i, n, c, h]) => `<a class="vu-box" href="${h}"><span class="vu-hud" style="--vu-hud:38px">${icon(i)}</span><b>${n}</b><small>${c}</small></a>`).join('');

const asOf = s.asOf || t.bundle?.dataCutoff;
const values = {
  NVDA: MAIN, NVDA_NAME: esc(cleanName(s.companyName) || 'NVIDIA'), NVDA_WHAT: esc(s.was || ''),
  NVDA_PRICE: usd(s.price.value), NVDA_CHG: chg(s.changePercent.value, true),
  NVDA_DATE: dateDe(asOf), NVDA_DATE_SHORT: shortDe(asOf),
  NVDA_CHART: chartSvg(close), CHART_FROM: shortDe(ts[0]), CHART_TO: shortDe(ts.at(-1)),
  NVDA_VERDICTS: verdictRows, PERSPECTIVES,
  JOURNEY_SPAN: String(rev.length), JOURNEY_RANGE: `GJ ${rev[0].fy}–${rev.at(-1).fy}`,
  JOURNEY_FROM: bn(rev[0].v), JOURNEY_FROM_YEAR: 'GJ ' + rev[0].fy, JOURNEY_TO: bn(rev.at(-1).v), JOURNEY_TO_YEAR: 'GJ ' + rev.at(-1).fy,
  JOURNEY_BARS: journeyBars,
  SWIPE_CARD: swipeCard, WORLD_TILES: worldTiles, WORLD_COUNT: String(themes.length),
  NINE_WORLDS: NINE,
  CANCEL_LINK: cancelLinkItem(read('konto/config.js')),
};

const out = read('scripts/home/index.template.html').replace(/%%([A-Z0-9_]+)%%/g, (m, k) => {
  if (!(k in values)) throw new Error('Unbekannter Platzhalter ' + m);
  return values[k];
});
const target = outArg ? new URL(outArg, 'file://' + process.cwd() + '/') : new URL('index.html', root);
writeFileSync(target, out);
console.log(`Startseite geschrieben · Kurse ${asOf} · Urteile ${health?.grade || '–'} / ${factorVerdict[1]} / ${tr[1]} · Umsatz ${rev.length} GJ · Swipe ${card.symbol}`);

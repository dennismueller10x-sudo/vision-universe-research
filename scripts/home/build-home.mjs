// Erzeugt /index.html aus scripts/home/index.template.html (Startseite im Aussehen von App-Konzept 2, Owner 14.11.2026:
// dunkle Kopfkachel, Kacheln, Leisten, Grafiken, Tiefe im Fenster, „Weiter“-Karte; nur Darstellung).
//
// Alle Werte kommen aus den committeten Produktdaten: Kurs und Kursverlauf (Discover-Aktie, Technical-Bündel),
// Urteile aus vorhandenen Einstufungen (Fundamental-Gesundheit, Quant-Faktorstufen, Technical-Trend),
// Umsatzreihe aus den SEC-Daten, Swipe-Karte und Themenwelten aus Discover. Die Seite rechnet nichts neu
// und bildet keine eigenen Urteile: sie zeigt die Einstufung, die das jeweilige Produkt veröffentlicht.
// Der Pro-Preis steht nie im Code (Preisseite /preise/ liest GET /v1/plans).
//
// Aufruf: node scripts/home/build-home.mjs [--out=pfad/index.html] [--data=verzeichnis]
//   --data: Wurzel der DATEN (quant/data/..., discover/data/..., discover/logos/index.json); Standard ist das Repository.
//   Der Test gegen die Generatorlogik nutzt damit eingefrorene Daten (core/tests/fixtures/home-data), nicht den Tagesstand.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { cancelLinkItem } from './cancel-link.mjs';

/* Gemeinsame Bausteine (assets/vu-ui.js, UMD): dieselben Markup-Helfer wie auf jeder Seite. */
const VUUI = createRequire(import.meta.url)('../../assets/vu-ui.js');

const root = new URL('../../', import.meta.url);
const outArg = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const dataArg = process.argv.find(a => a.startsWith('--data='))?.slice(7);
const dataRoot = dataArg ? new URL(dataArg.replace(/\/?$/, '/'), 'file://' + process.cwd() + '/') : root;
const read = p => readFileSync(new URL(p, root), 'utf8');
const json = p => JSON.parse(read(p));
const gz = p => JSON.parse(gunzipSync(readFileSync(new URL(p, dataRoot))));
const has = p => existsSync(new URL(p, dataRoot));
const dataJson = p => JSON.parse(readFileSync(new URL(p, dataRoot), 'utf8'));
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
const stock = t => dataJson(`discover/data/stocks/US_REAL/${t}.json`);

/* C07 Kursbewegung und C08 Urteil aus assets/vu-ui.js (Pille mit ▲/▼/◆/○ im Markup, keine eigenen Klassen). */
const chg = (v, big) => VUUI.chg(v, { big });
const verdict = (k, t) => VUUI.verdict(k, t);

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
].map(([i, n, sub, k, label]) => `<li>${VUUI.hud(i, 38, 12)}<span class="v-name"><b>${n}</b><small>${esc(sub)}</small></span>${verdict(k, label)}</li>`).join('');

// ---------- Sieben Blickwinkel (Perspektiven-Leiste N5 in der Aktienkarte; die Liste mit Erklärung öffnet sich im Fenster) ----------
const PERSPECTIVE_LIST = [
  ['discover', 'Überblick', 'Alles auf einen Blick', `/discover/#/s/US_REAL/${MAIN}`],
  ['technical', 'Chart', 'Trend, Unterstützung, Widerstand', `/technical/#/chart/${MAIN}`],
  ['fundamental', 'Zahlen', 'Umsatz, Gewinn, Cashflow seit 2015', `/fundamental/#/${MAIN}`],
  ['quant', 'Faktoren', 'Wachstum, Qualität, Risiko …', `/quant/#/aktie/${MAIN}`],
  ['supertrader', 'Methoden', 'Regeln berühmter Trader', `/supertrader/stock/${MAIN}/`],
  ['elliott', 'Wellen', 'Wellenstruktur im Kurs, experimentell', `/elliott/#/${MAIN}`],
  ['hedgefonds', 'Investoren', 'Wer die Aktie hält', '/hedgefonds/#/aktien']
];
/* C12 Navigationskarte je Blickwinkel: Symbol, Name, ein Satz, Pfeil. */
const PERSPECTIVES = PERSPECTIVE_LIST.map(([i, n, d, h]) => VUUI.navcard({ icon: i, title: n, sub: d, href: h })).join('');

// ---------- Fundamental: Umsatz je Geschäftsjahr (SEC) ----------
const rev = (s.fundamentals?.journey?.tracks?.revenue || []).filter(r => Number.isFinite(r.v));
const bn = v => de(v / 1e9) + ' Mrd. $';
/* C17 Säulen aus assets/vu-ui.js: letzte Säule neongrün, jedes zweite Jahr beschriftet. */
const journeyBars = VUUI.bars(rev.map(r => [String(r.fy), r.v]), { label: `Umsatz je Geschäftsjahr, GJ ${rev[0]?.fy} bis GJ ${rev.at(-1)?.fy}` });

// ---------- Discover: Swipe-Karte und Themenwelten ----------
const ki = dataJson('discover/data/rows/US_REAL/thema-ki.json');
const card = ki.cards[0], badge = (card.badges || [])[0];
/* Firmenlogo zur Bauzeit aus discover/logos/index.json (kein Nachladen im Browser nötig; ohne Eintrag bleibt das Kürzel). */
const logoIndex = (() => { try { return JSON.parse(readFileSync(new URL('discover/logos/index.json', dataRoot), 'utf8')).files || {}; } catch { return {}; } })();
const logoOpt = (t) => logoIndex[t] ? { src: '/discover/logos/' + logoIndex[t] } : { logo: false };
/* Antippbare Kachel (immer dunkel): Logo, Etikett, Name, Kurs, Bewegung; die Kreise ✕ ♡ zeigen die Wischrichtung (nur Bild). */
const swipeCard = VUUI.tap(`<span class="swipe-top">${VUUI.logo(card.symbol, { ...logoOpt(card.symbol), xl: true })}<span class="swipe-actions" aria-hidden="true"><i>✕</i><i class="lime">♡</i></span></span>`
  + `${badge ? `<span class="swipe-tag"><span class="tag-lime">${esc(badge.label)}</span></span>` : ''}<b class="swipe-name">${esc(cleanName(card.companyName))}</b><small>${esc([card.symbol, card.was || card.sector].filter(Boolean).join(' · '))}</small>`
  + `<span class="swipe-px"><b>${usd(card.price.value)}</b>${Number.isFinite(card.changePercent?.value) ? chg(card.changePercent.value) : ''}</span>`,
  { href: '/discover/#/einzeln/US_REAL', tone: 'night', cls: 'swipe' });
const themeCtx = { VUDiscover: {} }; themeCtx.globalThis = themeCtx; themeCtx.window = themeCtx;
runInNewContext(read('discover/themes.js'), themeCtx);
// Themenkacheln mit Symbol statt Bild (Owner 14.11.2026): Baustein .vu-theme, Symbol aus assets/theme-icons.svg (id = Slug).
const themes = themeCtx.VUDiscover.Views?.Themes?.all || [];
const pick = ['kuenstliche-intelligenz', 'halbleiter-chips', 'raumfahrt'];
const shown = pick.map(k => themes.find(x => x.slug === k)).filter(Boolean);
const worldTiles = (shown.length === 3 ? shown : themes.slice(0, 3)).map(x => `<a class="vu-theme" href="/discover/#/welten">${VUUI.themeHud(x.slug, 64, 19)}<span class="vu-theme__copy"><b>${esc(x.short || x.title)}</b></span></a>`).join('');

// ---------- Neun Welten ----------
/* \u00ad ist ein weiches Trennzeichen: das lange Wort bricht in der schmalen Kachel an der richtigen Stelle, der Text bleibt derselbe. */
const NINE = [['discover', 'Discover', 'Aktien entdecken', '/discover/'], ['quant', 'Quant', 'Faktoren je Aktie', '/quant/'], ['technical', 'Technical', 'Charts und Muster', '/technical/'],
  ['fundamental', 'Fundamental', 'Zahlen aus Unternehmens\u00adberichten', '/fundamental/'], ['supertrader', 'Supertrader', 'Methoden der Profis', '/supertrader/'], ['hedgefonds', 'Hedgefonds', 'Was Investoren halten', '/hedgefonds/'],
  ['elliott', 'Elliott', 'Wellenstruktur', '/elliott/'], ['screener', 'Screener', 'Eigene Filter', '/screener/'], ['vorsorge', 'Vorsorge', 'Sparplan und Rente', '/vorsorge/']]
  .map(([i, n, c, h]) => VUUI.tap(`${VUUI.hud(i, 40, 13)}<b>${n}</b><small>${c}</small>`, { href: h })).join('');

// ---------- Zahlenreihe der Kopfkachel und „Weiter“-Karte am Seitenende (Texte wie bisher, nur die Form ist neu) ----------
const BAND = VUUI.stats([['6.000+', 'US-Aktien'], ['9', 'Welten in einer App'], ['12 J.', 'Zahlen je Aktie aus Unternehmens\u00adberichten'], ['7.000+', 'ETFs für deine Vorsorge']]
  .map(([value, label]) => ({ value, label, tone: 'lime' })), { label: 'Vision Universe in Zahlen' });
const NEXT = VUUI.next({ eyebrow: 'Bereit für deinen Start?', title: 'Kostenlos starten', sub: 'In zwei Minuten eingerichtet.', href: '/konto/registrieren/?plan=free' });

const asOf = s.asOf || t.bundle?.dataCutoff;
const values = {
  NVDA: MAIN, NVDA_NAME: esc(cleanName(s.companyName) || 'NVIDIA'), NVDA_WHAT: esc(s.was || ''),
  NVDA_PRICE: usd(s.price.value), NVDA_CHG: chg(s.changePercent.value, true),
  NVDA_DATE: dateDe(asOf), NVDA_DATE_SHORT: shortDe(asOf),
  NVDA_CHART: chartSvg(close), CHART_FROM: shortDe(ts[0]), CHART_TO: shortDe(ts.at(-1)),
  NVDA_LOGO: VUUI.logo(MAIN, { ...logoOpt(MAIN), xl: true }), NVDA_VERDICTS: verdictRows, PERSPECTIVES, PERSP_COUNT: String(PERSPECTIVE_LIST.length), PERSP_BAR: VUUI.persp(MAIN, { active: 'discover' }),
  REVENUE_HELP: VUUI.help('Umsatz ist alles Geld, das die Firma mit ihren Produkten einnimmt, bevor Kosten abgezogen sind.'),
  JOURNEY_SPAN: String(rev.length), JOURNEY_RANGE: `GJ ${rev[0].fy}–${rev.at(-1).fy}`,
  JOURNEY_FROM: bn(rev[0].v), JOURNEY_FROM_YEAR: 'GJ ' + rev[0].fy, JOURNEY_TO: bn(rev.at(-1).v), JOURNEY_TO_YEAR: 'GJ ' + rev.at(-1).fy,
  JOURNEY_BARS: journeyBars,
  SWIPE_CARD: swipeCard, WORLD_TILES: worldTiles, WORLD_COUNT: String(themes.length),
  NINE_WORLDS: NINE, BAND, NEXT,
  CANCEL_LINK: cancelLinkItem(read('konto/config.js')),
};

const out = read('scripts/home/index.template.html').replace(/%%([A-Z0-9_]+)%%/g, (m, k) => {
  if (!(k in values)) throw new Error('Unbekannter Platzhalter ' + m);
  return values[k];
});
const target = outArg ? new URL(outArg, 'file://' + process.cwd() + '/') : new URL('index.html', root);
writeFileSync(target, out);
console.log(`Startseite geschrieben · Kurse ${asOf} · Urteile ${health?.grade || '–'} / ${factorVerdict[1]} / ${tr[1]} · Umsatz ${rev.length} GJ · Swipe ${card.symbol}`);

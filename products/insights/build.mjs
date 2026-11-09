// Insights: baut aus products/insights/artikel/*.json und products/insights/reports.json die statischen Seiten.
//   node products/insights/build.mjs           schreibt insights/ (mit insights/reports/)
//   node products/insights/build.mjs --check   prüft nur, ob alles aktuell ist (Exit 1 sonst)
//   node products/insights/build.mjs --out <ordner>   schreibt in einen anderen Ordner (Tests)
//
// Erzeugt: /insights/ (Übersicht mit Artikeln und Reports), /insights/<slug>/ (Artikel mit JSON-LD),
// /insights/artikel.json (Liste für andere Seiten), /insights/feed.xml (RSS), /insights/sitemap.xml, /insights/reports/ (Reports; die Reports selbst liegen unter /reports/<id>/).
// Daten je Artikel sind eingefroren (products/insights/snapshot.mjs); dieser Build liest keine Produktdaten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const outArg = argv.indexOf('--out');
const out = outArg >= 0 ? path.resolve(argv[outArg + 1]) : root;
const SITE = 'https://research.visionuniverse.de';
const LEGAL = JSON.parse(fs.readFileSync(path.join(root, 'assets/legal-notices.json'), 'utf8'));

export function loadArtikel(dir = path.join(here, 'artikel')) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.slug < b.slug ? -1 : 1));
}
export const loadReports = () => JSON.parse(fs.readFileSync(path.join(here, 'reports.json'), 'utf8')).reports;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const de = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 0) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v * 100), d) + '&nbsp;%');
const usd = (v) => (v >= 1e12 ? de(v / 1e12, 2) + '&nbsp;Bio.&nbsp;$' : v >= 1e9 ? de(v / 1e9, 1) + '&nbsp;Mrd.&nbsp;$' : de(v / 1e6, 0) + '&nbsp;Mio.&nbsp;$');
const datumDE = (iso) => iso.split('-').reverse().join('.');
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const datumLang = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d}. ${MONATE[m - 1]} ${y}`; };
const ttm = (s) => (s ? s.replace(/FY(\d{4})Q(\d)/, 'Q$2 des Geschäftsjahres $1') : 'k. A.');
const TREND = { BULLISH: 'aufwärts', BEARISH: 'abwärts', MIXED: 'gemischt' };
const ART = { added: 'aufgestockt', reduced: 'reduziert', new: 'neu eingestiegen', verkauft: 'verkauft', gehalten: 'gehalten' };
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const lesezeit = (a) => Math.max(2, Math.round(a.abschnitte.map((s) => textOf(s.html)).join(' ').split(' ').length / 200));
const ICON = {
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Kurslinie als statisches SVG (Fläche + Linie, Achsen-Stützwerte). Daten: eingefrorene Serie des Artikels.
function chart(serie) {
  const W = 640, H = 200, pl = 8, pr = 52, pt = 12, pb = 26;
  const v = serie.map((p) => p[1]), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const x = (i) => pl + (i / (serie.length - 1)) * (W - pl - pr), y = (val) => pt + (1 - (val - lo) / span) * (H - pt - pb);
  const line = serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const area = `${line}L${x(serie.length - 1).toFixed(1)},${H - pb}L${pl},${H - pb}Z`;
  const ticks = [hi, (hi + lo) / 2, lo].map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="g"/><text x="${W - pr + 6}" y="${(y(t) + 4).toFixed(1)}">${de(t, 0)}</text>`).join('');
  const last = serie.at(-1);
  return `<svg class="in-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kursverlauf der letzten ${serie.length} Handelstage, zuletzt ${de(last[1], 2)} Dollar">${ticks}<path d="${area}" class="a"/><path d="${line}" class="l"/><circle cx="${x(serie.length - 1).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="4.5" class="d"/><text x="${pl}" y="${H - 6}">${datumDE(serie[0][0])}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${datumDE(last[0])}</text></svg>`;
}

function datenBox(t, a) {
  const d = a.daten.aktien[t], f = d.fonds;
  const rows = [
    [`Schlusskurs ${datumDE(d.kursStand)}`, de(d.kurs, 2) + '&nbsp;$'], ['12 Monate', pct(d.r12m)], ['Abstand zum 52-Wochen-Hoch', pct(d.abstandHoch)],
    ['Marktwert', usd(d.marktwert)], ['Umsatz (letzte 4 Quartale)', usd(d.umsatzTTM)], ['Umsatzwachstum', pct(d.wachstum)],
    ['Nettomarge', d.nettomarge == null ? '–' : (d.nettomarge < 0 ? '−' : '') + de(Math.abs(d.nettomarge * 100), 0) + '&nbsp;%'], [d.kgv == null ? 'KUV' : 'KGV', d.kgv == null ? de(d.kuv, 1) : de(d.kgv, 1)],
    ['Trend laut Technik-Engine', TREND[d.trend] || '–'],
  ];
  const fondsHtml = f ? `<div class="in-fonds"><b>Große Fonds (13F, Stand ${datumDE(f.stichtag)})</b><p>${de(f.anzahl)} Fonds halten die Aktie · ${de(f.kaeufer)} haben aufgestockt oder sind neu eingestiegen · ${de(f.verkaeufer)} haben reduziert oder verkauft</p><ul>${f.genannt.map((g) => `<li><span>${esc(g.name)}</span><em>${ART[g.art] || esc(g.art)}${g.d != null && g.art !== 'new' ? ' (' + pct(g.d / 100) + ')' : ''}</em></li>`).join('')}</ul></div>` : '';
  return `<aside class="in-daten vu-box" aria-label="Vision-Universe-Daten zu ${esc(d.name)}">
  <div class="in-daten-kopf">${d.logo ? `<img src="${d.logo}" alt="" width="40" height="40">` : ''}<div><b>${esc(d.name)}</b><span>${t} · Vision-Universe-Daten</span></div><span class="in-pill">VU-Daten</span></div>
  ${chart(d.serie)}
  <dl class="in-fakten">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
  <div class="in-health"><b>Gesundheitscheck</b><div>${d.gesundheit.map(([k, v]) => `<span><i>${k}</i>${esc(v)}</span>`).join('')}</div></div>
  ${fondsHtml}
  <p class="in-klein">Kurse bis ${datumDE(d.kursStand)}, Geschäftszahlen aus SEC-Meldungen bis ${ttm(d.ttmBis)}. Fondsdaten: Pflichtmeldungen an die SEC (Angabe Dritter). Eingefroren am Erscheinungstag.</p>
  <div class="in-links"><a class="in-btn in-btn--ink" href="/aktie/${t}">${esc(d.name.split(' ')[0])} live in Vision Universe${ICON.next}</a><a class="in-btn" href="/aktie/${t}?p=zahlen">Fundamentaldaten</a><a class="in-btn" href="/aktie/${t}?p=chart">Chart</a><a class="in-btn" href="/aktie/${t}?p=investoren">Fonds</a></div>
</aside>`;
}

const appBox = (a) => `<section class="in-app vu-box vu-box--lime" aria-label="Über Vision Universe">
  <span class="in-kicker">Vision Universe</span>
  <h2>Jede Aktie. Jeden Tag. In Klartext.</h2>
  <p>Vision Universe ist eine Analyse-Software für Aktien. Jeden Abend rechnen wir über 5.600 US-Aktien nach festen Regeln durch: Kurse, Geschäftszahlen aus SEC-Meldungen, Charttechnik und was große Fonds gemeldet haben. Keine Meinungen, keine Empfehlungen, nur nachvollziehbare Daten.</p>
  <div class="in-links"><a class="in-btn in-btn--ink" href="/aktie/${a.ticker[0]}">Alle Daten zu ${esc(a.daten.aktien[a.ticker[0]].name.split(' ')[0])}${ICON.next}</a><a class="in-btn" href="/">Was Vision Universe kann</a></div>
  <p class="in-klein">App bald im App Store und bei Google Play · Instagram und TikTok: @app.visionuniverse</p>
</section>`;

function head({ title, description, canonical, image, type = 'website', extra = '', css = '/insights/insights.css' }) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Vision Universe">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${canonical}">
${image ? `<meta property="og:image" content="${SITE}${image}">\n<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="alternate" type="application/rss+xml" title="Vision Universe Insights" href="/insights/feed.xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site-navigation.css">
<link rel="stylesheet" href="/assets/vu-ui.css">
<script>(function(){var w="light";try{var v=localStorage.getItem("vu-discover-theme-v1");if(v==="light"||v==="dark")w=v;else if(matchMedia("(prefers-color-scheme: dark)").matches)w="dark";}catch(e){}var h=document.documentElement;h.setAttribute("data-theme",w);h.setAttribute("data-theme-mode",w);var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",w==="dark"?"#08080a":"#ffffff");})();</script>
<link rel="stylesheet" href="${css}">
${extra}</head>
<body class="in-body vu-ui"><vu-navigation theme="light" theme-switch no-preview></vu-navigation><script>document.querySelector("vu-navigation").setAttribute("theme",document.documentElement.getAttribute("data-theme")||"light");</script><script src="/assets/site-navigation.js"></script>
`;
}
const tabs = (aktiv) => `<nav class="in-tabs" aria-label="Insights"><a href="/insights/"${aktiv === 'artikel' ? ' aria-current="page"' : ''}>Artikel</a><a href="/insights/reports/"${aktiv === 'reports' ? ' aria-current="page"' : ''}>Reports</a></nav>`;
const fuss = `<footer class="in-fuss"><p>${esc(LEGAL.notices.editorial.text)}</p><p><a href="${LEGAL.links.methodik}">Methodik, Quellen und Interessen</a> · <a href="${LEGAL.links.risikohinweise}">Risikohinweise</a> · <a href="${LEGAL.links.impressum}">Impressum</a> · <a href="/insights/feed.xml">RSS</a></p></footer>
</body>
</html>
`;

function artikelSeite(a) {
  const url = `/insights/${a.slug}/`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.seoTitel || a.titel, description: a.teaser,
    image: [SITE + a.bild.src], datePublished: `${a.datum}T13:00:00+01:00`, dateModified: `${a.datum}T13:00:00+01:00`,
    inLanguage: 'de-DE', mainEntityOfPage: SITE + url, keywords: a.tags.join(', '),
    author: { '@type': 'Organization', name: 'Redaktion Vision Universe', url: SITE + '/' },
    publisher: { '@type': 'Organization', name: 'Vision Universe', logo: { '@type': 'ImageObject', url: SITE + '/assets/vision-universe-logo-web.png' } },
    about: a.ticker.map((t) => ({ '@type': 'Corporation', name: a.daten.aktien[t].name, tickerSymbol: t })),
  };
  const extra = `<meta property="article:published_time" content="${a.datum}T13:00:00+01:00">\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n`;
  const body = a.abschnitte.map((s, i) => {
    let h = (s.h ? `<h2>${esc(s.h)}</h2>` : '') + s.html;
    if (s.daten) h = (s.h ? `<h2>${esc(s.h)}</h2>` : '') + datenBox(s.daten, a) + s.html;
    if (i === 2 && a.zitat) h += `<blockquote class="in-zitat"><p>„${esc(a.zitat.text)}“</p><cite>${esc(a.zitat.von)}</cite></blockquote>`;
    return h;
  }).join('\n');
  return head({ title: `${a.seoTitel || a.titel} · Vision Universe`, description: a.teaser, canonical: url, image: a.bild.src, type: 'article', extra }) + `<main id="in-main" class="in-wrap in-artikel">
${tabs('artikel')}
<article>
<header class="in-kopf">
  <p class="in-meta"><span class="in-pill">${esc(a.rubrik)}</span><time datetime="${a.datum}">${datumLang(a.datum)}</time><span>·</span><span>${lesezeit(a)} Min. Lesezeit</span></p>
  <h1>${esc(a.titel)}</h1>
  <p class="in-lead">${esc(a.unterzeile)}</p>
  <figure class="in-bild"><img src="${a.bild.src}" alt="${esc(a.bild.alt)}" width="1600" height="900" fetchpriority="high">${a.bild.ki ? '<figcaption>KI-Bild</figcaption>' : ''}</figure>
  <p class="in-autor">Redaktion Vision Universe · Stand ${esc(a.stand)}</p>
</header>
<div class="in-text">
${body}
${a.termine?.length ? `<section class="in-termine"><h2>Termine</h2><ul>${a.termine.map(([d, t]) => `<li><b>${esc(d)}</b><span>${esc(t)}</span></li>`).join('')}</ul></section>` : ''}
${appBox(a)}
<section class="in-quellen"><h2>Quellen</h2><ol>${a.quellen.map((q) => `<li>${esc(q.medium)}: <a href="${esc(q.url)}" rel="noopener">${esc(q.titel)}</a>, ${esc(q.datum)}</li>`).join('')}</ol>
<p class="in-klein">Zitate aus englischen Quellen sind übersetzt. Kurse, Kennzahlen und Fondsdaten im Kasten stammen aus Vision Universe (Stand siehe Kasten). ${esc(LEGAL.notices.thirdParty.text)} Mit KI-Unterstützung recherchiert und geschrieben, von der Redaktion geprüft.</p></section>
</div>
</article>
${weitere(a)}
</main>
` + fuss;
}

let ALLE = [];
const karte = (a, gross = false) => `<a class="in-karte${gross ? ' in-karte--gross' : ''}" href="/insights/${a.slug}/"><span class="in-karte-bild"><img src="${a.bild.src}" alt="" loading="${gross ? 'eager' : 'lazy'}" width="1600" height="900"></span><span class="in-karte-text"><span class="in-meta"><span class="in-pill">${esc(a.rubrik)}</span><time datetime="${a.datum}">${datumDE(a.datum)}</time></span><b>${esc(a.titel)}</b><span class="in-karte-teaser">${esc(a.teaser)}</span></span></a>`;
const weitere = (a) => { const w = ALLE.filter((x) => x.slug !== a.slug).slice(0, 3); return w.length ? `<section class="in-weitere"><h2>Weitere Insights</h2><div class="in-raster">${w.map((x) => karte(x)).join('')}</div></section>` : ''; };
const reportKarte = (r) => `<a class="in-report" href="${esc(r.href)}"><span class="in-report-kopf"><span class="in-pill">${esc(r.art)}</span><time datetime="${r.datum}">${datumDE(r.datum)}</time></span><b>${esc(r.titel)}</b><span>${esc(r.text)}</span><em>Report öffnen${ICON.next}</em></a>`;

function uebersicht(artikel, reports) {
  const [erst, ...rest] = artikel;
  return head({ title: 'Insights · Tagesthemen und Reports · Vision Universe', description: 'Tagesthemen von der Börse, recherchiert und mit den Daten von Vision Universe eingeordnet: Kurse, Geschäftszahlen, Charttechnik und große Fonds. Dazu Aktienreports.', canonical: '/insights/', image: erst?.bild.src }) + `<main id="in-main" class="in-wrap">
${tabs('artikel')}
<header class="in-hub"><span class="in-kicker">Insights</span><h1>Was die Börse heute bewegt. Und was die Daten dazu sagen.</h1><p class="in-lead">Jeden Tag ein bis zwei Themen: recherchiert, eingeordnet und mit Kursen, Geschäftszahlen und Fondsdaten aus Vision Universe unterlegt.</p></header>
${erst ? karte(erst, true) : '<p>Noch keine Artikel.</p>'}
${rest.length ? `<section><h2 class="in-h2">Neueste Artikel</h2><div class="in-raster">${rest.map((a) => karte(a)).join('')}</div></section>` : ''}
<section id="reports"><div class="in-h2-zeile"><h2 class="in-h2">Reports</h2><a href="/insights/reports/">Alle Reports${ICON.next}</a></div><div class="in-raster">${reports.slice(0, 3).map(reportKarte).join('')}</div></section>
</main>
` + fuss;
}

function reportsSeite(reports) {
  return head({ title: 'Reports · Aktienreports von Vision Universe', description: 'Aktienreports von Vision Universe: einzelne Unternehmen ausführlich, mit Geschäftsmodell, Zahlen und Daten.', canonical: '/insights/reports/' }) + `<main id="in-main" class="in-wrap">
${tabs('reports')}
<header class="in-hub"><span class="in-kicker">Reports</span><h1>Aktienreports</h1><p class="in-lead">Ein Unternehmen ausführlich: Geschäftsmodell, Zahlen, Bewertung im Vergleich und was die Daten von Vision Universe zeigen. Neue Reports erscheinen hier und unter Insights.</p></header>
<div class="in-raster">${reports.map(reportKarte).join('')}</div>
</main>
` + fuss;
}

const xml = (s) => esc(s).replace(/'/g, '&apos;');
const rfc822 = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString();
function feed(artikel) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Vision Universe Insights</title>
<link>${SITE}/insights/</link>
<atom:link href="${SITE}/insights/feed.xml" rel="self" type="application/rss+xml"/>
<description>Tagesthemen von der Börse, eingeordnet mit den Daten von Vision Universe.</description>
<language>de-de</language>
${artikel.map((a) => `<item><title>${xml(a.titel)}</title><link>${SITE}/insights/${a.slug}/</link><guid>${SITE}/insights/${a.slug}/</guid><pubDate>${rfc822(a.datum)}</pubDate><description>${xml(a.teaser)}</description></item>`).join('\n')}
</channel>
</rss>
`;
}
function sitemap(artikel) {
  const urls = [['/insights/', artikel[0]?.datum], ['/insights/reports/', null], ...artikel.map((a) => [`/insights/${a.slug}/`, a.datum])];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `<url><loc>${SITE}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

export function build() {
  const artikel = loadArtikel(), reports = loadReports();
  ALLE = artikel;
  const files = {
    'insights/index.html': uebersicht(artikel, reports),
    'insights/reports/index.html': reportsSeite(reports),
    'insights/feed.xml': feed(artikel),
    'insights/sitemap.xml': sitemap(artikel),
    'insights/artikel.json': JSON.stringify({ schema: 'vu-insights-1', note: 'Erzeugt von products/insights/build.mjs', artikel: artikel.map(({ slug, datum, rubrik, titel, teaser, ticker, bild }) => ({ slug, datum, rubrik, titel, teaser, ticker, bild: bild.src, href: `/insights/${slug}/` })) }, null, 1) + '\n',
  };
  for (const a of artikel) files[`insights/${a.slug}/index.html`] = artikelSeite(a);
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = build(), stale = [];
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(out, rel), now = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (now === text) continue;
    stale.push(rel);
    if (!check) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
  }
  if (check && stale.length) { console.error('Veraltet (node products/insights/build.mjs): ' + stale.join(', ')); process.exit(1); }
  console.log(`${Object.keys(files).length} Dateien · ${check ? 'geprüft' : stale.length ? 'geschrieben: ' + stale.length : 'unverändert'}`);
}

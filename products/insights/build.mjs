// Insights: baut aus products/insights/artikel/*.json und products/insights/reports.json die statischen Seiten.
//   node products/insights/build.mjs           schreibt insights/ (mit insights/reports/)
//   node products/insights/build.mjs --check   prüft nur, ob alles aktuell ist (Exit 1 sonst)
//   node products/insights/build.mjs --out <ordner>   schreibt in einen anderen Ordner (Tests)
//
// Erzeugt: /insights/ (Übersicht), /insights/<slug>/ (Artikel mit JSON-LD), /insights/magazin/ und /insights/magazin/nr-<NN>/
// (Aktienmagazin, Inhalt aus products/insights/magazin.json), /insights/reports/, /insights/artikel.json, /insights/feed.xml, /insights/sitemap.xml.
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
export const loadMagazin = () => JSON.parse(fs.readFileSync(path.join(here, 'magazin.json'), 'utf8')).ausgaben;

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

// Ton einer Note aus dem Gesundheitscheck: stark = Neongrün, schwach = Schwarz (Design-Regel: Plus grün, Minus schwarz)
const TON = (v) => (/sehr stark|^stark|solide/i.test(v) ? 'plus' : /negativ|belastet|schwach/i.test(v) ? 'minus' : 'neutral');
const pill = (v, txt) => `<span class="in-vpill ${v >= 0 ? 'plus' : 'minus'}">${txt}</span>`;
const prozent = (v) => (v == null ? '–' : (v < 0 ? '−' : '') + de(Math.abs(v * 100), 0) + '&nbsp;%');

// "So zeigt Vision Universe <Aktie>": Kennzahlen-Kacheln, echte App-Screens vom Erscheinungstag, Gesundheitscheck, 13F.
function datenBox(t, a) {
  const d = a.daten.aktien[t], f = d.fonds, kurz = esc(d.name.split(' ')[0].replace(/,$/, ''));
  const kacheln = [
    [`Schlusskurs ${datumDE(d.kursStand).slice(0, 6)}`, de(d.kurs, 2) + '&nbsp;$', d.r12m == null ? '' : pill(d.r12m, pct(d.r12m) + ' in 12&nbsp;Monaten'), 'gross'],
    ['Abstand zum 52-Wochen-Hoch', pct(d.abstandHoch), ''],
    ['Marktwert', usd(d.marktwert), ''],
    ['Umsatz, letzte 4 Quartale', usd(d.umsatzTTM), d.wachstum == null ? '' : pill(d.wachstum, pct(d.wachstum))],
    ['Nettomarge', prozent(d.nettomarge), ''],
    [d.kgv == null ? 'KUV (Kurs-Umsatz)' : 'KGV', d.kgv == null ? de(d.kuv, 1) : de(d.kgv, 1), d.kgv == null ? '<em>KGV entfällt: Verlust</em>' : ''],
    ['Trend laut Technik-Engine', TREND[d.trend] || '–', ''],
  ];
  const screens = (a.appScreens?.[t] || []).map((s) => `<a class="in-phone" href="${s.href}"><span class="in-phone-rahmen"><img src="${s.src}" alt="${esc(s.label)}-Ansicht von ${esc(d.name)} in der Vision-Universe-App" loading="eager" decoding="async" width="390" height="844"></span><b>${esc(s.label)}</b><span>${esc(s.text)}</span></a>`).join('');
  const anteil = f ? Math.round((f.kaeufer / Math.max(1, f.kaeufer + f.verkaeufer)) * 100) : 0;
  const fondsHtml = f ? `<div class="in-vu-fonds"><b class="in-vu-label">Große Fonds · 13F zum ${datumDE(f.stichtag)}</b>
    <p><strong>${de(f.anzahl)}</strong> Fonds halten ${kurz}</p>
    <div class="in-balken" role="img" aria-label="${de(f.kaeufer)} haben aufgestockt oder sind neu eingestiegen, ${de(f.verkaeufer)} haben reduziert oder verkauft"><i style="width:${anteil}%"></i></div>
    <div class="in-balken-text"><span>${de(f.kaeufer)} mehr oder neu</span><span>${de(f.verkaeufer)} weniger oder raus</span></div>
    <ul>${f.genannt.slice(0, 4).map((g) => `<li><span>${esc(g.name)}</span><em class="${g.art === 'verkauft' || g.art === 'reduced' ? 'minus' : 'plus'}">${ART[g.art] || esc(g.art)}</em></li>`).join('')}</ul></div>` : '';
  return `<section class="in-vu" aria-label="So zeigt Vision Universe ${esc(d.name)}">
  <header class="in-vu-kopf">${d.logo ? `<img src="${d.logo}" alt="" width="48" height="48">` : ''}<div><span class="in-kicker">Aus der App</span><b>So zeigt Vision Universe ${kurz}</b><span>${t} · Stand ${datumDE(d.kursStand)} · eingefroren am Erscheinungstag</span></div></header>
  <div class="in-vu-kacheln">${kacheln.map(([k, v, z, g]) => `<div class="in-kachel${g ? ' in-kachel--gross' : ''}"><span>${k}</span><b>${v}</b>${z}</div>`).join('')}</div>
  ${screens ? `<div class="in-phones">${screens}</div>` : ''}
  <div class="in-vu-zeile">
    <div class="in-vu-health"><b class="in-vu-label">Gesundheitscheck</b><div>${d.gesundheit.map(([k, v]) => `<span class="${TON(v)}"><i>${k}</i>${esc(v)}</span>`).join('')}</div></div>
    ${fondsHtml}
  </div>
  <div class="in-vu-fuss"><a class="in-btn in-btn--lime" href="/aktie/${t}">${kurz} live in Vision Universe${ICON.next}</a><p class="in-klein">Kurse bis ${datumDE(d.kursStand)}, Geschäftszahlen aus SEC-Meldungen bis ${ttm(d.ttmBis)}. Fondsdaten: Pflichtmeldungen an die SEC (Angabe Dritter). Die App zeigt den aktuellen Stand.</p></div>
</section>`;
}

// Bild im Text: groß über die Spalte oder als Porträt neben dem Text; Bildnachweis immer sichtbar
const figur = (b) => `<figure class="in-figur${b.stil === 'portrait' ? ' in-figur--portrait' : ''}"><img src="${b.src}" alt="${esc(b.alt)}" loading="lazy"><figcaption>${b.text ? esc(b.text) + ' · ' : ''}Bild: ${esc(b.quelle)}</figcaption></figure>`;
// Prüfvermerk: "redaktion" = vom Owner gelesen; "automatisch" = Tageslauf, der Owner liest nach und gibt Korrekturen.
// Owner-Entscheidung 10.11.2026: kein KI-Hinweis am Text; die Redaktion (Owner) liest jeden Artikel und trägt die
// redaktionelle Verantwortung. KI-Bilder behalten ihre Bildzeile „KI-Bild“.
// Ohne redaktionelle Verantwortung muss KI-erzeugter Text erkennbar sein (Art. 50 Abs. 4 KI-Verordnung).
const PRUEFVERMERK = {
  redaktion: '',
  automatisch: '',
};
// Aufmacher: Pressebild oder, ohne passendes Bild (bild.typ "app"), drei App-Screens der ersten Aktie auf Neongrün
const aufmacher = (a) => (a.bild.typ === 'app'
  ? `<figure class="in-bild in-bild--app" aria-label="${esc(a.bild.alt)}">${(a.appScreens?.[a.ticker[0]] || []).map((s) => `<img src="${s.src}" alt="${esc(s.label)}-Ansicht in der Vision-Universe-App" width="390" height="844">`).join('')}<figcaption>Vision-Universe-App</figcaption></figure>`
  : `<figure class="in-bild"><img src="${a.bild.src}" alt="${esc(a.bild.alt)}" width="1600" height="900" fetchpriority="high"><figcaption>${nachweis(a.bild)}</figcaption></figure>`);
const bildSrc = (a) => (a.bild.typ === 'app' ? a.appScreens?.[a.ticker[0]]?.[0]?.src : a.bild.src);
const nachweis = (b) => (b.ki ? 'KI-Bild' : `Bild: ${esc(b.quelle)}`);

const appBox = (a) => `<section class="in-app vu-box vu-box--lime" aria-label="Über Vision Universe">
  <span class="in-kicker">Vision Universe</span>
  <h2>Jede Aktie. Jeden Tag. In Klartext.</h2>
  <p>Vision Universe ist eine Analyse-Software für Aktien. Jeden Abend rechnen wir über 5.600 US-Aktien nach festen Regeln durch: Kurse, Geschäftszahlen aus SEC-Meldungen, Charttechnik und was große Fonds gemeldet haben. Keine Meinungen, keine Empfehlungen, nur nachvollziehbare Daten.</p>
  <div class="in-links"><a class="in-btn in-btn--ink" href="/aktie/${a.ticker[0]}">Alle Daten zu ${esc(a.daten.aktien[a.ticker[0]].name.split(' ')[0])}${ICON.next}</a><a class="in-btn" href="/">Was Vision Universe kann</a></div>
  <p class="in-klein">App bald im App Store und bei Google Play · Instagram und TikTok: @app.visionuniverse</p>
</section>`;

// Teilen-Bild der Übersicht (Owner 12.11.2026): fest statt des Bilds des neuesten Artikels.
const TEILBILD = '/insights/img/insights-teilen.jpg';
function head({ title, description, canonical, image, type = 'website', extra = '', css = '/insights/insights.css' }) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${SITE}${canonical}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Vision Universe">
<meta property="og:locale" content="de_DE">
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
const TABS = [['artikel', 'Artikel', '/insights/'], ['magazin', 'Aktienmagazin', '/insights/magazin/'], ['reports', 'Reports', '/insights/reports/']];
const tabs = (aktiv) => `<nav class="in-tabs" aria-label="Insights">${TABS.map(([id, label, href]) => `<a href="${href}"${aktiv === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
const fuss = `<footer class="in-fuss"><p>${esc(LEGAL.notices.editorial.text)}</p><p><a href="${LEGAL.links.methodik}">Methodik, Quellen und Interessen</a> · <a href="/insights/feed.xml">RSS</a></p></footer>
</body>
</html>
`;

function artikelSeite(a) {
  const url = `/insights/${a.slug}/`;
  const iso = `${a.datum}T${a.zeit || '13:00'}:00+01:00`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.seoTitel || a.titel, description: a.teaser,
    image: [SITE + bildSrc(a)], datePublished: iso, dateModified: iso, articleSection: a.rubrik, isAccessibleForFree: true,
    inLanguage: 'de-DE', mainEntityOfPage: SITE + url, keywords: a.tags.join(', '),
    author: { '@type': 'Organization', name: 'Redaktion Vision Universe', url: SITE + '/' },
    publisher: { '@type': 'Organization', name: 'Vision Universe', logo: { '@type': 'ImageObject', url: SITE + '/assets/vision-universe-logo-web.png' } },
    about: a.ticker.map((t) => ({ '@type': 'Corporation', name: a.daten.aktien[t].name, tickerSymbol: t })),
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Vision Universe', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Insights', item: SITE + '/insights/' },
    { '@type': 'ListItem', position: 3, name: a.titel, item: SITE + url }] };
  const ldTag = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
  const extra = `<meta property="article:published_time" content="${iso}">\n<meta property="article:section" content="${esc(a.rubrik)}">\n${a.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`).join('\n')}\n${ldTag(ld)}\n${ldTag(crumbs)}\n`;
  const body = a.abschnitte.map((s, i) => {
    const kopf = s.h ? `<h2>${esc(s.h)}</h2>` : '';
    let h = s.daten ? kopf + s.html + datenBox(s.daten, a) : kopf + (s.bild?.stil === 'portrait' ? figur(s.bild) : '') + s.html + (s.bild && s.bild.stil !== 'portrait' ? figur(s.bild) : '');
    if (i === 2 && a.zitat) h += `<blockquote class="in-zitat"><p>„${esc(a.zitat.text)}“</p><cite>${esc(a.zitat.von)}</cite></blockquote>`;
    return h;
  }).join('\n');
  return head({ title: `${a.seoTitel || a.titel} · Vision Universe`, description: a.teaser, canonical: url, image: bildSrc(a), type: 'article', extra }) + `<main id="in-main" class="in-wrap in-artikel">
${tabs('artikel')}
<article>
<header class="in-kopf">
  <p class="in-meta"><span class="in-pill">${esc(a.rubrik)}</span><time datetime="${a.datum}">${datumLang(a.datum)}</time><span>·</span><span>${lesezeit(a)} Min. Lesezeit</span></p>
  <h1>${esc(a.titel)}</h1>
  <p class="in-lead">${esc(a.unterzeile)}</p>
  ${aufmacher(a)}
  <p class="in-autor">Redaktion Vision Universe · Stand ${esc(a.stand)}</p>
</header>
<div class="in-text">
${body}
${a.termine?.length ? `<section class="in-termine"><h2>Termine</h2><ul>${a.termine.map(([d, t]) => `<li><b>${esc(d)}</b><span>${esc(t)}</span></li>`).join('')}</ul></section>` : ''}
${appBox(a)}
<section class="in-quellen"><h2>Quellen</h2><ol>${a.quellen.map((q) => `<li>${esc(q.medium)}: <a href="${esc(q.url)}" rel="noopener">${esc(q.titel)}</a>, ${esc(q.datum)}</li>`).join('')}</ol>
<p class="in-klein">Zitate aus englischen Quellen sind übersetzt. Kurse, Kennzahlen und Fondsdaten im Kasten stammen aus Vision Universe (Stand siehe Kasten). ${esc(LEGAL.notices.thirdParty.text)} ${PRUEFVERMERK[a.pruefung || 'redaktion']}</p></section>
</div>
</article>
${weitere(a)}
</main>
` + fuss;
}

let ALLE = [];
const karte = (a, gross = false) => `<a class="in-karte${gross ? ' in-karte--gross' : ''}" href="/insights/${a.slug}/"><span class="in-karte-bild${a.bild.typ === 'app' ? ' in-karte-bild--app' : ''}"><img src="${bildSrc(a)}" alt="" loading="${gross ? 'eager' : 'lazy'}" width="1600" height="900"></span><span class="in-karte-text"><span class="in-meta"><span class="in-pill">${esc(a.rubrik)}</span><time datetime="${a.datum}">${datumDE(a.datum)}</time></span><b>${esc(a.titel)}</b><span class="in-karte-teaser">${esc(a.teaser)}</span></span></a>`;
const weitere = (a) => { const w = ALLE.filter((x) => x.slug !== a.slug).slice(0, 3); return w.length ? `<section class="in-weitere"><h2>Weitere Insights</h2><div class="in-raster">${w.map((x) => karte(x)).join('')}</div></section>` : ''; };
const reportKarte = (r) => `<a class="in-report" href="${esc(r.href)}"><span class="in-report-kopf"><span class="in-pill">${esc(r.art)}</span><time datetime="${r.datum}">${datumDE(r.datum)}</time></span><b>${esc(r.titel)}</b><span>${esc(r.text)}</span><em>Report öffnen${ICON.next}</em></a>`;

function uebersicht(artikel, reports) {
  const [erst, ...rest] = artikel;
  return head({ title: 'Insights · Tagesthemen, Aktienmagazin und Reports · Vision Universe', description: 'Tagesthemen von der Börse, recherchiert und mit den Daten von Vision Universe eingeordnet: Kurse, Geschäftszahlen, Charttechnik und große Fonds. Dazu jede Woche das Aktienmagazin.', canonical: '/insights/', image: TEILBILD }) + `<main id="in-main" class="in-wrap">
${tabs('artikel')}
<header class="in-hub"><span class="in-kicker">Insights</span><h1>Was die Börse heute bewegt. Und was die Daten dazu sagen.</h1><p class="in-lead">Jeden Tag ein bis zwei Themen: recherchiert, eingeordnet und mit Kursen, Geschäftszahlen und Fondsdaten aus Vision Universe unterlegt.</p></header>
${erst ? karte(erst, true) : '<p>Noch keine Artikel.</p>'}
${rest.length ? `<section><h2 class="in-h2">Neueste Artikel</h2><div class="in-raster">${rest.map((a) => karte(a)).join('')}</div></section>` : ''}
${magazinTeaser(LOADED.magazin[0])}
${reports.filter((r) => r.seiten).slice(0, 1).map(reportTeaser).join('')}
${reports.filter((r) => !r.seiten).length ? `<section id="reports"><div class="in-h2-zeile"><h2 class="in-h2">Reports</h2><a href="/insights/reports/">Alle Reports${ICON.next}</a></div><div class="in-raster">${reports.filter((r) => !r.seiten).slice(0, 3).map(reportKarte).join('')}</div></section>` : ''}
</main>
` + fuss;
}

// Aktienreports mit Seiten (aus dem Heft-System): Leseseite wie beim Magazin plus Kurzfassung als Text
const reportPdf = (r) => `${r.href}${r.pdf}`;
const reportTeaser = (r) => `<section class="in-heft-teaser"><a href="${esc(r.href)}"><img src="${esc(r.href)}cover.jpg" alt="Titelseite ${esc(r.titel)}" width="560" height="792" loading="lazy"></a><div><span class="in-kicker">${esc(r.art)} · Nr. ${r.nr}</span><h2>${esc(r.titel)}</h2><p>${esc(r.text)}</p><p class="in-klein">${datumLang(r.datum)} · ${r.seiten} Seiten</p><div class="in-links"><a class="in-btn in-btn--ink" href="${esc(r.href)}">Online lesen${ICON.next}</a><a class="in-btn" href="${esc(reportPdf(r))}" download>PDF laden (${r.pdfMB} MB)</a></div></div></section>`;
function reportSeite(r) {
  const nr = (n) => String(n).padStart(2, '0');
  const seiten = Array.from({ length: r.seiten }, (_, i) => `<img id="s${nr(i + 1)}" src="${r.href}seiten/s${nr(i + 1)}.jpg" alt="Seite ${i + 1}" width="1100" height="1556" loading="${i < 2 ? 'eager' : 'lazy'}">`).join('\n');
  return head({ title: `${r.art}: ${r.titel} · Vision Universe`, description: r.text, canonical: r.href, image: r.href + 'cover.jpg' }) + `<main id="in-main" class="in-wrap">
${tabs('reports')}
<header class="in-heft-kopf"><span class="in-kicker">${esc(r.art)} · Nr. ${r.nr} · ${datumLang(r.datum)}</span><h1>${esc(r.titel)}</h1><p class="in-lead">${esc(r.unterzeile)}</p><div class="in-links"><a class="in-btn in-btn--ink" href="#s01">Lesen${ICON.next}</a><a class="in-btn" href="${esc(reportPdf(r))}" download>PDF laden (${r.pdfMB} MB)</a></div></header>
<nav class="in-heft-inhalt" aria-label="Inhalt"><b class="in-vu-label">Inhalt</b><ol>${r.inhalt.map(([s, rubrik, titel]) => `<li><a href="#s${nr(s)}"><span>${nr(s)}</span><em>${esc(rubrik)}</em>${esc(titel)}</a></li>`).join('')}</ol></nav>
<div class="in-heft-seiten">
${seiten}
</div>
<section class="in-heft-kurz"><h2 class="in-h2">Kurzfassung</h2>${r.kurzfassung.map((p) => `<p>${esc(p)}</p>`).join('')}</section>
<p class="in-klein">Keine Anlageberatung. Der Report nennt keine Kursziele und gibt keine Empfehlung. Bilder aus Grand Theft Auto VI: Rockstar Games.</p>
</main>
` + fuss;
}

function reportsSeite(reports) {
  return head({ title: 'Reports · Aktienreports von Vision Universe', description: 'Aktienreports von Vision Universe: einzelne Unternehmen ausführlich, mit Geschäftsmodell, Zahlen und Daten.', canonical: '/insights/reports/', image: TEILBILD }) + `<main id="in-main" class="in-wrap">
${tabs('reports')}
<header class="in-hub"><span class="in-kicker">Reports</span><h1>Aktienreports</h1><p class="in-lead">Ein Unternehmen ausführlich: Geschäftsmodell, Zahlen, Bewertung im Vergleich und was die Daten von Vision Universe zeigen. Neue Reports erscheinen hier.</p></header>
${reports.length ? `${reports.filter((r) => r.seiten).map(reportTeaser).join('')}<div class="in-raster">${reports.filter((r) => !r.seiten).map(reportKarte).join('')}</div>` : `<div class="in-leer vu-box"><b>Der erste Aktienreport ist in Arbeit.</b><p>Bis dahin: jeden Tag neue Artikel unter Insights und jede Woche das Aktienmagazin.</p><div class="in-links"><a class="in-btn in-btn--ink" href="/insights/magazin/">Zum Aktienmagazin${ICON.next}</a><a class="in-btn" href="/insights/">Zu den Artikeln</a></div></div>`}
</main>
` + fuss;
}

// Aktienmagazin: Übersicht aller Ausgaben und je Ausgabe eine Leseseite (Seitenbilder untereinander, PDF zum Laden)
let LOADED = { magazin: [] };
const heftUrl = (h) => `/insights/magazin/nr-${h.nr}/`;
const magazinTeaser = (h) => (h ? `<section class="in-heft-teaser"><a href="${heftUrl(h)}"><img src="${heftUrl(h)}cover.jpg" alt="Titelseite Aktienmagazin Nr. ${h.nr}" width="560" height="792" loading="lazy"></a><div><span class="in-kicker">Aktienmagazin · Nr. ${h.nr}</span><h2>${esc(h.titel)}</h2><p>${esc(h.unterzeile)}</p><p class="in-klein">${datumLang(h.datum)} · ${h.seiten} Seiten · KW ${h.kw}</p><div class="in-links"><a class="in-btn in-btn--ink" href="${heftUrl(h)}">Online lesen${ICON.next}</a><a class="in-btn" href="${heftUrl(h)}vision-universe-aktienmagazin-${h.nr}.pdf" download>PDF laden (${h.pdfMB} MB)</a></div></div></section>` : '');

function magazinUebersicht(hefte) {
  return head({ title: 'Aktienmagazin · Vision Universe', description: 'Das Vision Universe Aktienmagazin: jede Woche die wichtigsten Börsenthemen, eingeordnet mit Kursen, Geschäftszahlen und Fondsdaten. Online lesen oder als PDF laden.', canonical: '/insights/magazin/', image: hefte[0] ? heftUrl(hefte[0]) + 'cover.jpg' : null }) + `<main id="in-main" class="in-wrap">
${tabs('magazin')}
<header class="in-hub"><span class="in-kicker">Aktienmagazin</span><h1>Jede Woche das Heft zur Börse.</h1><p class="in-lead">Titelthema, Einzelanalysen, Berichtssaison, Hedgefonds, Charts und Termine: recherchiert und mit den Daten von Vision Universe unterlegt. Online lesen oder als PDF laden.</p></header>
${magazinTeaser(hefte[0])}
${hefte.length > 1 ? `<section><h2 class="in-h2">Frühere Ausgaben</h2><div class="in-hefte">${hefte.slice(1).map((h) => `<a href="${heftUrl(h)}"><img src="${heftUrl(h)}cover.jpg" alt="" loading="lazy" width="560" height="792"><b>Nr. ${h.nr} · ${esc(h.titel)}</b><span>${datumDE(h.datum)}</span></a>`).join('')}</div></section>` : ''}
</main>
` + fuss;
}

function heftSeite(h) {
  const nr = (n) => String(n).padStart(2, '0');
  const seiten = Array.from({ length: h.seiten }, (_, i) => `<img id="s${nr(i + 1)}" src="${heftUrl(h)}seiten/s${nr(i + 1)}.jpg" alt="Seite ${i + 1}" width="1100" height="1556" loading="${i < 2 ? 'eager' : 'lazy'}">`).join('\n');
  return head({ title: `Aktienmagazin Nr. ${h.nr}: ${h.titel} · Vision Universe`, description: h.unterzeile, canonical: heftUrl(h), image: heftUrl(h) + 'cover.jpg' }) + `<main id="in-main" class="in-wrap">
${tabs('magazin')}
<header class="in-heft-kopf"><span class="in-kicker">Aktienmagazin · Nr. ${h.nr} · ${datumLang(h.datum)}</span><h1>${esc(h.titel)}</h1><p class="in-lead">${esc(h.unterzeile)}</p><div class="in-links"><a class="in-btn in-btn--ink" href="#s01">Lesen${ICON.next}</a><a class="in-btn" href="${heftUrl(h)}vision-universe-aktienmagazin-${h.nr}.pdf" download>PDF laden (${h.pdfMB} MB)</a></div></header>
<nav class="in-heft-inhalt" aria-label="Inhalt"><b class="in-vu-label">Inhalt</b><ol>${h.inhalt.map(([s, rubrik, titel]) => `<li><a href="#s${nr(s)}"><span>${nr(s)}</span><em>${esc(rubrik)}</em>${esc(titel)}</a></li>`).join('')}</ol></nav>
<div class="in-heft-seiten">
${seiten}
</div>
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
function sitemap(artikel, hefte, reports = []) {
  const urls = [['/insights/', artikel[0]?.datum], ['/insights/magazin/', hefte[0]?.datum], ...hefte.map((h) => [heftUrl(h), h.datum]), ['/insights/reports/', reports[0]?.datum ?? null], ...reports.filter((r) => r.seiten).map((r) => [r.href, r.datum]), ...artikel.map((a) => [`/insights/${a.slug}/`, a.datum])];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `<url><loc>${SITE}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

export function build() {
  const artikel = loadArtikel(), reports = loadReports(), hefte = loadMagazin();
  ALLE = artikel; LOADED = { magazin: hefte };
  const files = {
    'insights/index.html': uebersicht(artikel, reports),
    'insights/reports/index.html': reportsSeite(reports),
    'insights/feed.xml': feed(artikel),
    'insights/sitemap.xml': sitemap(artikel, hefte, reports),
    'insights/magazin/index.html': magazinUebersicht(hefte),
    'insights/artikel.json': JSON.stringify({ schema: 'vu-insights-1', note: 'Erzeugt von products/insights/build.mjs', artikel: artikel.map(({ slug, datum, rubrik, titel, teaser, ticker, bild }) => ({ slug, datum, rubrik, titel, teaser, ticker, bild: bild.typ === 'app' ? null : bild.src, href: `/insights/${slug}/` })), magazin: hefte.map(({ nr, datum, kw, titel, seiten }) => ({ nr, datum, kw, titel, seiten, cover: `/insights/magazin/nr-${nr}/cover.jpg`, href: `/insights/magazin/nr-${nr}/` })), reports: reports.map(({ datum, art, titel, href }) => ({ datum, art, titel, href })) }, null, 1) + '\n',
  };
  for (const a of artikel) files[`insights/${a.slug}/index.html`] = artikelSeite(a);
  for (const h of hefte) files[`insights/magazin/nr-${h.nr}/index.html`] = heftSeite(h);
  for (const r of reports.filter((x) => x.seiten)) files[`${r.href.slice(1)}index.html`] = reportSeite(r);
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

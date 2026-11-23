// Insights: baut aus products/insights/artikel/*.json und products/insights/reports.json die statischen Seiten.
//   node products/insights/build.mjs           schreibt insights/ (mit insights/reports/)
//   node products/insights/build.mjs --check   prüft nur, ob alles aktuell ist (Exit 1 sonst)
//   node products/insights/build.mjs --out <ordner>   schreibt in einen anderen Ordner (Tests)
//
// Erzeugt: /insights/ (Übersicht: Aufmacher, Bühnen für Aktienmagazin und Aktienreport, Artikel), /insights/<slug>/ (Artikel mit JSON-LD), /insights/magazin/ und /insights/magazin/nr-<NN>/
// (Aktienmagazin, Inhalt aus products/insights/magazin.json), /insights/reports/, /insights/artikel.json, /insights/feed.xml, /insights/sitemap.xml.
// Daten je Artikel sind eingefroren (products/insights/snapshot.mjs); dieser Build liest keine Produktdaten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const outArg = argv.indexOf('--out');
const out = outArg >= 0 ? path.resolve(argv[outArg + 1]) : root;
const SITE = 'https://research.visionuniverse.de';
const LEGAL = JSON.parse(fs.readFileSync(path.join(root, 'assets/legal-notices.json'), 'utf8'));
// App-Konzept 2 (Owner 14.11.2026): gemeinsame Bausteine aus assets/vu-ui.js (Zahlenreihe, Schiene, „Weiter“-Karte).
// Der Erzeuger schreibt ihr HTML fest in die Seiten; die Seiten bleiben ohne JavaScript lesbar.
const VUUI = createRequire(import.meta.url)('../../assets/vu-ui.js');
const DISCOVER = JSON.parse(fs.readFileSync(path.join(root, 'products/discover/module.json'), 'utf8')).navigation;

export function loadArtikel(dir = path.join(here, 'artikel')) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.slug < b.slug ? -1 : 1));
}
export const loadReports = () => JSON.parse(fs.readFileSync(path.join(here, 'reports.json'), 'utf8')).reports;
export const loadMagazin = () => JSON.parse(fs.readFileSync(path.join(here, 'magazin.json'), 'utf8')).ausgaben;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const de = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 0) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v * 100), d) + '&nbsp;%');
const usd = (v) => (v == null ? '–' : v >= 1e12 ? de(v / 1e12, 2) + '&nbsp;Bio.&nbsp;$' : v >= 1e9 ? de(v / 1e9, 1) + '&nbsp;Mrd.&nbsp;$' : de(v / 1e6, 0) + '&nbsp;Mio.&nbsp;$');
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
  // Symbol „insights“ der Produktfamilie (assets/site-navigation.js), für die Report-Kachel des Prototyps
  heft: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="13" height="16" rx="2.2"/><path d="M16.5 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0"/><path fill="currentColor" stroke="none" opacity=".28" d="M6.5 7.5h7v4h-7z"/><path d="M6.5 7.5h7v4h-7z"/><path opacity=".45" d="M6.5 14.5h7M6.5 17h4.5"/></g></svg>',
};

// Ton einer Note aus dem Gesundheitscheck: stark = Neongrün, schwach = Schwarz (Design-Regel: Plus grün, Minus schwarz)
const TON = (v) => (/sehr stark|^stark|solide/i.test(v) ? 'plus' : /negativ|belastet|schwach/i.test(v) ? 'minus' : 'neutral');
const pill = (v, txt) => `<span class="in-vpill ${v >= 0 ? 'plus' : 'minus'}">${txt}</span>`;
const prozent = (v) => (v == null ? '–' : (v < 0 ? '−' : '') + de(Math.abs(v * 100), 0) + '&nbsp;%');

// "So zeigt Vision Universe <Aktie>": Kennzahlen-Kacheln, echte App-Screens vom Erscheinungstag, Gesundheitscheck, 13F.
function datenBox(t, a) {
  const d = a.daten.aktien[t], f = d.fonds, kurz = esc(d.name.split(' ')[0].replace(/,$/, ''));
  // Junge Notierungen (z. B. Börsengang im laufenden Jahr): Abstand zum Hoch aus der eingefrorenen Kursreihe seit dem
  // ersten Handelstag; Kacheln ohne Wert entfallen, statt Striche zu zeigen.
  const jung = d.abstandHoch == null && d.serie?.length >= 20;
  const hoch = jung ? d.kurs / Math.max(...d.serie.map((x) => x[1])) - 1 : d.abstandHoch;
  const kacheln = [
    [`Schlusskurs ${datumDE(d.kursStand).slice(0, 6)}`, de(d.kurs, 2) + '&nbsp;$', d.r12m == null ? '' : pill(d.r12m, pct(d.r12m) + ' in 12&nbsp;Monaten'), 'gross'],
    [jung ? `Abstand zum Hoch seit ${datumDE(d.serie[0][0]).slice(0, 6)}` : 'Abstand zum 52-Wochen-Hoch', hoch == null ? null : pct(hoch), ''],
    ['Marktwert', d.marktwert == null ? null : usd(d.marktwert), ''],
    ['Umsatz, letzte 4 Quartale', d.umsatzTTM == null ? null : usd(d.umsatzTTM), d.wachstum == null ? '' : pill(d.wachstum, pct(d.wachstum))],
    ['Nettomarge', d.nettomarge == null ? null : prozent(d.nettomarge), ''],
    d.kgv == null && d.kuv == null ? ['KGV', null, '']
      : [d.kgv == null ? 'KUV (Kurs-Umsatz)' : 'KGV', d.kgv == null ? de(d.kuv, 1) : de(d.kgv, 1), d.kgv == null ? '<em>KGV entfällt: Verlust</em>' : ''],
    ['Trend laut Technik-Engine', TREND[d.trend] || null, ''],
  ].filter(([, v]) => v != null);
  const ohneZahlen = d.umsatzTTM == null && d.kgv == null && d.kuv == null;
  const screens = (a.appScreens?.[t] || []).map((s) => `<a class="in-phone" href="${s.href}"><span class="in-phone-rahmen"><img src="${s.src}" alt="${esc(s.label)}-Ansicht von ${esc(d.name)} in der Vision-Universe-App" loading="eager" decoding="async" width="390" height="844"></span><b>${esc(s.label)}</b><span>${esc(s.text)}</span></a>`).join('');
  const anteil = f ? Math.round((f.kaeufer / Math.max(1, f.kaeufer + f.verkaeufer)) * 100) : 0;
  const fondsHtml = f ? `<div class="in-vu-fonds"><b class="in-vu-label">Große Fonds · 13F zum ${datumDE(f.stichtag)}</b>
    <p><strong>${de(f.anzahl)}</strong> Fonds halten ${kurz}</p>
    <div class="in-balken" role="img" aria-label="${de(f.kaeufer)} haben aufgestockt oder sind neu eingestiegen, ${de(f.verkaeufer)} haben reduziert oder verkauft"><i style="width:${anteil}%"></i></div>
    <div class="in-balken-text"><span>${de(f.kaeufer)} mehr oder neu</span><span>${de(f.verkaeufer)} weniger oder raus</span></div>
    <ul>${f.genannt.slice(0, 4).map((g) => `<li><span>${esc(g.name)}</span><em class="${g.art === 'verkauft' || g.art === 'reduced' ? 'minus' : 'plus'}">${ART[g.art] || esc(g.art)}</em></li>`).join('')}</ul></div>` : '';
  return `<section class="in-vu" aria-label="So zeigt Vision Universe ${esc(d.name)}">
  <header class="in-vu-kopf">${d.logo ? `<img src="${d.logo}" alt="" width="48" height="48">` : ''}<div><span class="in-kicker">Aus der App</span><b>So zeigt Vision Universe ${kurz}</b><span>${t} · Stand ${datumDE(d.kursStand)} · eingefroren am Erscheinungstag</span></div></header>
  <div class="in-vu-kacheln${kacheln.length <= 4 ? ' in-vu-kacheln--wenig' : ''}"${kacheln.length <= 4 ? ` style="--in-n:${kacheln.length - 1}"` : ''}>${kacheln.map(([k, v, z, g]) => `<div class="in-kachel${g ? ' in-kachel--gross' : ''}"><span>${k}</span><b>${v}</b>${z}</div>`).join('')}</div>
  ${screens ? `<div class="in-phones">${screens}</div>` : ''}
  <div class="in-vu-zeile">
    ${d.gesundheit.length ? `<div class="in-vu-health"><b class="in-vu-label">Gesundheitscheck</b><div>${d.gesundheit.map(([k, v]) => `<span class="${TON(v)}"><i>${k}</i>${esc(v)}</span>`).join('')}</div></div>` : ''}
    ${fondsHtml}
  </div>
  <div class="in-vu-fuss"><a class="vu-btn vu-btn--sm" href="/aktie/#/${t}">${kurz} live in Vision Universe${ICON.next}</a><p class="in-klein">Kurse bis ${datumDE(d.kursStand)}${d.ttmBis ? `, Geschäftszahlen aus SEC-Meldungen bis ${ttm(d.ttmBis)}` : ''}.${ohneZahlen ? ' Für Umsatz, Marge und Bewertung über vier Quartale liegen noch nicht genug SEC-Meldungen vor.' : ''} Fondsdaten: Pflichtmeldungen an die SEC (Angabe Dritter). Die App zeigt den aktuellen Stand.</p></div>
</section>`;
}

// Bild im Text: groß über die Spalte oder als Porträt neben dem Text; Bildnachweis immer sichtbar
const figur = (b) => `<figure class="in-figur${b.stil === 'portrait' ? ' in-figur--portrait' : ''}"><img src="${b.src}" alt="${esc(b.alt)}" loading="lazy"><figcaption>${b.text ? esc(b.text) + ' · ' : ''}Bild: ${esc(b.quelle)}</figcaption></figure>`;
// Diagramm im Artikel (Owner 18.11.2026: Zahlen im Text bekommen ein Diagramm). Statisches HTML, kein Skript.
//   "diagramm": { "titel": "...", "art": "saeulen" | "balken", "einheit": "Mrd. $", "quelle": "...", "hinweis": "...",
//                 "werte": [["Q3 25", 57.0], ["Q3 26", 115.8, true]] }   (true = hervorgehoben, Neongrün)
// Säulen für Zeitreihen (nur Werte >= 0), Balken für Vergleiche (negative Werte als dunkler Balken mit Minus).
const zahl = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
function diagramm(g) {
  const max = Math.max(...g.werte.map(([, v]) => Math.abs(v))) || 1;
  const d = g.werte.some(([, v]) => !Number.isInteger(v)) ? 1 : 0; // eine Nachkommastelle für alle, sobald ein Wert eine hat
  const z = (v) => zahl(v, d);
  const kopf = `<figcaption class="in-dia-kopf"><b>${esc(g.titel)}</b>${g.einheit ? `<span>${esc(g.einheit)}</span>` : ''}</figcaption>`;
  const fuss = `<p class="in-dia-fuss">${g.hinweis ? esc(g.hinweis) + ' · ' : ''}Quelle: ${esc(g.quelle)}</p>`;
  const label = `${esc(g.titel)} (${g.werte.map(([k, v]) => `${k}: ${z(v)}`).join(', ')}${g.einheit ? ' ' + g.einheit : ''})`;
  if (g.art === 'balken') {
    return `<figure class="in-dia in-dia--balken" role="img" aria-label="${esc(label)}">${kopf}<div class="in-dia-zeilen">${g.werte.map(([k, v, hi]) => `<div class="in-dia-zeile"><span>${esc(k)}</span><i class="${hi ? 'hi' : v < 0 ? 'minus' : ''}" style="width:${Math.max(1.5, (Math.abs(v) / max) * 100).toFixed(1)}%"></i><b>${z(v)}</b></div>`).join('')}</div>${fuss}</figure>`;
  }
  return `<figure class="in-dia in-dia--saeulen" role="img" aria-label="${esc(label)}">${kopf}<div class="in-dia-saeulen">${g.werte.map(([k, v, hi]) => `<div class="in-dia-saeule"><b>${z(v)}</b><i class="${hi ? 'hi' : ''}" style="height:${Math.max(2, (Math.max(0, v) / max) * 100).toFixed(1)}%"></i><span>${esc(k)}</span></div>`).join('')}</div>${fuss}</figure>`;
}
const diagramme = (s) => [].concat(s.diagramm || []).map(diagramm).join('');

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
// Bildgröße aus dem JPEG-Kopf (ohne Abhängigkeiten). Für www zählt nur ein Querformat 16:9 (News-Bühne, Kacheln):
// ist der Aufmacher anders geschnitten, nimmt www das erste passende Bild aus dem Artikel, sonst keins (Owner 23.11.2026).
export function bildGroesse(file) {
  let b; try { b = fs.readFileSync(file); } catch { return null; }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}
// Neue Aufmacher: genau 16:9 ab 1600 px (Test IN-20). Für www genügt ein Querformat zwischen 3:2 und 2:1 ab 900 px;
// hochkante oder quadratische Bilder würden auf der Bühne zu einem herangezoomten Ausschnitt.
export const istQuer = (s, minW = 1600) => !!s && s.w >= minW && Math.abs(s.w / s.h / (16 / 9) - 1) < 0.02;
const fuerWww = (s) => !!s && s.w >= 900 && s.w / s.h >= 1.45 && s.w / s.h <= 2.05;
const bildQuer = (a) => {
  const kandidaten = [a.bild.typ === 'app' ? null : a.bild.src, ...a.abschnitte.flatMap((x) => [].concat(x.bild || []).map((y) => y && y.src))].filter(Boolean);
  return kandidaten.find((src) => fuerWww(bildGroesse(path.join(root, src)))) || null;
};
// Firma für www (News-Seite, „Nach Aktien“): aus dem Artikel ("firma"), sonst der Name der ersten Aktie ohne Zusätze.
const kurzName = (daten, t) => String(daten?.aktien?.[t]?.name || t).replace(/\s*\(.*\)$/, '').replace(/\s+(Class [A-Z]|Inc\.?|Corp\.?|Corporation|Holdings|Ltd\.?|plc|N\.V\.)(\s.*)?$/i, '').trim();
const bildSrc = (a) => (a.bild.typ === 'app' ? a.appScreens?.[a.ticker[0]]?.[0]?.src : a.bild.src);
const nachweis = (b) => (b.ki ? 'KI-Bild' : `Bild: ${esc(b.quelle)}`);

const appBox = (a) => `<section class="in-app vu-box vu-box--lime" aria-label="Über Vision Universe">
  <span class="in-kicker">Vision Universe</span>
  <h2>Jede Aktie. Jeden Tag. In Klartext.</h2>
  <p>Vision Universe ist eine Analyse-Software für Aktien. Jeden Abend rechnen wir über 5.600 US-Aktien nach festen Regeln durch: Kurse, Geschäftszahlen aus SEC-Meldungen, Charttechnik und was große Fonds gemeldet haben. Keine Meinungen, keine Empfehlungen, nur nachvollziehbare Daten.</p>
  <div class="in-links"><a class="vu-btn vu-btn--sm vu-btn--ink" href="/aktie/#/${a.ticker[0]}">Alle Daten zu ${esc(a.daten.aktien[a.ticker[0]].name.split(' ')[0])}${ICON.next}</a><a class="vu-btn vu-btn--sm vu-btn--line" href="/">Was Vision Universe kann</a></div>
  <p class="in-klein">App bald im App Store und bei Google Play · Instagram und TikTok: @app.visionuniverse</p>
</section>`;

// Teilen-Bild der Übersicht (Owner 12.11.2026): fest statt des Bilds des neuesten Artikels.
const TEILBILD = '/insights/img/insights-teilen.jpg';
const CSS_MARKE = 'app-konzept-3';
// App-Konzept 2 (Prototyp #news, Owner 14./15.11.2026): jede Insights-Seite zeigt ihre Reiter im Inhalt (data-vu-tabs="inhalt");
// Startseite und Artikel beginnen mit dem randlosen Titelbild unter dem durchsichtigen Kopf (data-vu-bleed).
function head({ title, description, canonical, image, type = 'website', extra = '', bleed = false, css = `/insights/insights.css?v=${CSS_MARKE}` }) {
  return `<!DOCTYPE html>
<html lang="de" data-vu-tabs="inhalt"${bleed ? ' data-vu-bleed' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#08080a">
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
<link rel="stylesheet" href="/assets/vu-ui.css?v=${VUUI.VERSION}">
<script>(function(){var w="dark";try{var v=localStorage.getItem("vu-discover-theme-v1");if(v==="dark"||v==="light")w=v;}catch(e){}var h=document.documentElement;h.setAttribute("data-theme",w);h.setAttribute("data-theme-mode",w);var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",w==="dark"?"#08080a":"#ffffff");})();</script>
<link rel="stylesheet" href="${css}">
${extra}</head>
<body class="in-body vu-ui"><vu-navigation theme="light" theme-switch no-preview></vu-navigation><script>document.querySelector("vu-navigation").setAttribute("theme",document.documentElement.getAttribute("data-theme")||"light");</script><script src="/assets/site-navigation.js"></script><script>if(window.VUNavigation)window.VUNavigation.dock({});</script><script>if(window.VUNavigation)window.VUNavigation.hinweis("editorial");</script>
<script src="/insights/news.js?v=${CSS_MARKE}" defer></script>
`;
}
// Reiter im Inhalt (Prototyp „tabs2“: Heute · Magazin · Kurz erklärt · Reports). Auf der Startseite springen sie zu ihren
// Abschnitten (news.js markiert den sichtbaren), auf den übrigen Seiten führen sie zur Startseite bzw. zur Übersicht.
const TABS = [['heute', 'Heute', '/insights/', '#heute'], ['magazin', 'Magazin', '/insights/magazin/', '#magazin'], ['kurz', 'Kurz erklärt', '/insights/#kurz', '#kurz'], ['reports', 'Reports', '/insights/reports/', '#reports']];
const tabs = (aktiv, start = false) => `<nav class="in-tabs" aria-label="News">${TABS.map(([id, label, href, anker]) => `<a class="in-tab${aktiv === id ? ' on' : ''}" href="${start ? anker : href}"${aktiv === id ? ' aria-current="page"' : ''}${start ? ` data-in-tab="${id}"` : ''}>${label}</a>`).join('')}</nav>`;
// Seitenende wie im Prototyp („end“): „Daten & Hinweise“ öffnet das Fenster des Kopfes (news.js), ohne Skript die Methodik
const ende = `<div class="in-end"><a class="in-lk" href="${LEGAL.links.methodik}" data-in-hinweise>Daten &amp; Hinweise</a></div>`;
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
    let h = s.daten ? kopf + s.html + diagramme(s) + datenBox(s.daten, a) : kopf + (s.bild?.stil === 'portrait' ? figur(s.bild) : '') + s.html + diagramme(s) + (s.bild && s.bild.stil !== 'portrait' ? figur(s.bild) : '');
    if (i === 2 && a.zitat) h += `<blockquote class="in-zitat"><p>„${esc(a.zitat.text)}“</p><cite>${esc(a.zitat.von)}</cite></blockquote>`;
    return h;
  }).join('\n');
  // Rahmen des Prototyps (wie das Titelbild der News-Startseite): Bild randlos unter dem durchsichtigen Kopf, Rubrik, Titel,
  // Aktien mit Tagesbewegung und Lesezeit darauf; darunter die Reiter, Unterzeile und Stand, dann der Text.
  return head({ title: `${a.seoTitel || a.titel} · Vision Universe`, description: a.teaser, canonical: url, image: bildSrc(a), type: 'article', extra, bleed: true }) + `<main id="in-main" class="in-wrap in-artikel">
<article>
<header class="in-kopf">
  <div class="in-held in-held--artikel">${aufmacher(a)}<span class="in-held-schatten"></span>
  <div class="in-held-text"><p class="in-p in-p--sm">${esc(a.rubrik)} · <time datetime="${a.datum}">${datumLang(a.datum)}</time></p><h1>${esc(a.titel)}</h1><div class="in-held-tk">${a.ticker.map((t) => tkLink(a, t)).join('')}<span class="in-min">${lesezeit(a)} Min. Lesezeit</span></div></div></div>
  ${tabs('heute')}
  <p class="in-lead">${esc(a.unterzeile)}</p>
  <div class="in-kopf-fuss"><p class="in-autor">Redaktion Vision Universe · Stand ${esc(a.stand)}</p></div>
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
${weiterHeft()}
${ende}
</main>
` + fuss;
}

let ALLE = [];
// Aktien eines Artikels: Logo (eingefroren im Artikel) und Kürzel; auf der Artikelseite führen sie zur Aktie
const aktien = (a, link = false) => `<span class="in-tk">${a.ticker.map((t) => { const logo = a.daten?.aktien?.[t]?.logo, innen = `${logo ? `<img src="${logo}" alt="" width="20" height="20" loading="lazy">` : ''}${esc(t)}`; return link ? `<a class="in-tk-i" href="/aktie/#/${t}">${innen}</a>` : `<span class="in-tk-i">${innen}</span>`; }).join('')}</span>`;
const kartenBild = (a, gross = false) => `<span class="in-karte-bild${a.bild.typ === 'app' ? ' in-karte-bild--app' : ''}"><img src="${bildSrc(a)}" alt="" loading="${gross ? 'eager' : 'lazy'}"${gross ? ' fetchpriority="high"' : ''} width="1600" height="900"></span>`;
// Karte: Bild, Rubrik, Datum, Titel, Teaser, Aktien. In der Übersicht am Telefon eine Zeile mit Bild links, sonst Bild oben.
const karte = (a) => `<a class="in-karte" href="/insights/${a.slug}/">${kartenBild(a)}<span class="in-karte-text"><span class="in-meta"><span class="in-pill in-pill--still">${esc(a.rubrik)}</span><time datetime="${a.datum}">${datumDE(a.datum)}</time></span><b>${esc(a.titel)}</b><span class="in-karte-teaser">${esc(a.teaser)}</span>${aktien(a)}</span></a>`;
// Der neueste Artikel füllt den ersten Bildschirm: Bild randlos, Titel darauf, Teaser darunter
const aufmacherKarte = (a) => `<a class="in-top" href="/insights/${a.slug}/">${kartenBild(a, true)}<span class="in-top-text"><span class="in-meta"><span class="in-pill">${esc(a.rubrik)}</span><time datetime="${a.datum}">${datumDE(a.datum)}</time></span><b>${esc(a.titel)}</b>${aktien(a)}</span><span class="in-karte-teaser">${esc(a.teaser)}</span></a>`;
const weitere = (a) => { const w = ALLE.filter((x) => x.slug !== a.slug).slice(0, 3); return w.length ? `<section class="in-weitere">${sh('Weitere Artikel', 'Alle', '/insights/')}${w.map(zeile).join('')}</section>` : ''; };
const reportKarte = (r) => `<a class="in-report vu-night" href="${esc(r.href)}"><span class="in-report-kopf"><span class="in-pill">${esc(r.art)}</span><time datetime="${r.datum}">${datumDE(r.datum)}</time></span><b>${esc(r.titel)}</b><span>${esc(r.text)}</span><em>Report öffnen${ICON.next}</em></a>`;

// Bühne für Aktienmagazin und Aktienreport (Owner 14.11.2026: beide gingen unter): Titelseite groß, Nummer, Titel,
// Zahlenreihe (Seiten, Woche oder Nummer, PDF-Größe) und die zwei Knöpfe. „gross“ = Kopf einer eigenen Seite (h1),
// „breit“ = allein in der Zeile (Übersicht Aktienmagazin und Reports); sonst stehen zwei Bühnen nebeneinander.
function buehne({ ton, gross = false, breit = false, href, lesen, cover, alt, kicker, titel, text, fakten, pdf, pdfMB }) {
  const tag = gross ? 'header' : 'section', h = gross ? 'h1' : 'h2';
  return `<${tag} class="in-buehne in-buehne--${ton}${ton === 'nacht' ? ' vu-night' : ''}${gross ? ' in-buehne--gross' : breit ? ' in-buehne--breit' : ''}">
<a class="in-buehne-cover" href="${esc(href)}"><img src="${esc(cover)}" alt="${esc(alt)}" width="560" height="792" loading="${gross ? 'eager' : 'lazy'}"></a>
<span class="in-kicker">${kicker}</span>
<${h}>${esc(titel)}</${h}>
<p class="in-buehne-sub">${esc(text)}</p>
${VUUI.stats(fakten)}
<div class="in-links"><a class="vu-btn vu-btn--sm${ton === 'lime' ? ' vu-btn--ink' : ''}" href="${esc(href)}">${lesen}${ICON.next}</a><a class="vu-btn vu-btn--sm vu-btn--line" href="${esc(pdf)}" download>PDF laden (${pdfMB} MB)</a></div>
</${tag}>`;
}
// „Weiter“-Karte am Seitenende (VUUI.next): vom Artikel zum Heft, vom Heft zum Report und zurück
const weiterHeft = () => { const h = LOADED.magazin[0]; return h ? VUUI.next({ title: `Aktienmagazin Nr. ${h.nr}: ${h.titel}`, sub: `${h.seiten} Seiten · KW ${h.kw}`, href: heftUrl(h) }) : ''; };
const weiterReport = () => { const r = LOADED.reports.find((x) => x.seiten); return r ? VUUI.next({ title: `${r.art} Nr. ${r.nr}: ${r.titel}`, sub: `${r.seiten} Seiten · ${datumLang(r.datum)}`, href: r.href }) : weiterHeft(); };

/* ───────── News-Start nach Prototyp „App-Konzept 2“ (#news, Owner 14./15.11.2026: „1:1 wie im Prototyp“)
   Aufbau wie p2.js V.news: Titelbild 470 px mit Tagesthema (der neueste Artikel), Reiter Heute · Magazin · Kurz erklärt · Reports,
   drei Artikelzeilen, Aktienmagazin mit Lesefortschritt, „Kurz erklärt in 30 Sekunden“ (Erklärvideos aus
   willkommen/config/stories.json), „Zu deinen Aktien“ (news.js, nur mit Watchlist), Aktienreports, dann zusätzlich alle
   weiteren Artikel, „Weiter“ und „Daten & Hinweise“. Tagesbewegungen setzt news.js aus der veröffentlichten Tagesreihe
   (quant/engines/published-close.js#dayChange); ohne Skript bleiben Logo und Kürzel stehen. */
const STORIES = JSON.parse(fs.readFileSync(path.join(root, 'willkommen/config/stories.json'), 'utf8')).stories;
const kurzDatum = (iso) => datumDE(iso).slice(0, 6);
const name = (a, t) => (a.daten?.aktien?.[t]?.name || t).replace(/,$/, '');
// Logo-Kachel des Prototyps (.lg.s): eingefrorenes Logo des Artikels, sonst das Kürzel; dahinter die Tagesbewegung (news.js)
const tkLink = (a, t, gross = false) => { const logo = a.daten?.aktien?.[t]?.logo; return `<a class="in-tkl" href="/aktie/#/${t}" data-vu-stock="${t}" data-vu-stock-name="${esc(name(a, t))}" aria-label="${esc(name(a, t))} (${t})"><span class="in-lg${gross ? '' : ''}">${logo ? `<img src="${logo}" alt="" width="34" height="34" loading="lazy">` : `<b>${t}</b>`}</span><span class="in-chg" data-in-chg="${t}"></span></a>`; };
const artBild = (a) => (a.bild.typ === 'app' ? `<span class="in-art-bild in-art-bild--app"><img src="${bildSrc(a)}" alt="" loading="lazy" width="390" height="844"></span>` : `<span class="in-art-bild"><img src="${bildSrc(a)}" alt="" loading="lazy" width="1600" height="900"></span>`);
// Artikelzeile (Prototyp „art“): Bild 104 px, Rubrik, Titel, Logos mit Tagesbewegung; dazu das Datum wie die Lesezeit im Titelbild
const zeile = (a) => `<div class="in-art" data-in-tk="${a.ticker.join(' ')}">${artBild(a)}<div class="in-art-text"><span class="in-p in-p--dk in-p--sm">${esc(a.rubrik)}</span><a class="in-art-a" href="/insights/${a.slug}/">${esc(a.titel)}</a><div class="in-art-tk">${a.ticker.map((t) => tkLink(a, t)).join('')}<time class="in-zeit" datetime="${a.datum}">${kurzDatum(a.datum)}</time></div></div></div>`;
const sh = (titel, mehr = '', href = '', id = '') => `<div class="in-sh"${id ? ` id="${id}"` : ''}><h2>${titel}</h2>${mehr ? `<a href="${href}">${mehr} ›</a>` : ''}</div>`;
const held = (a) => `<section class="in-held" aria-label="Tagesthema">
${a.bild.typ === 'app' ? `<span class="in-held-bild in-held-bild--app"><img src="${bildSrc(a)}" alt="" fetchpriority="high" width="390" height="844"></span>` : `<img class="in-held-bild" src="${a.bild.src}" alt="${esc(a.bild.alt)}" fetchpriority="high" width="1600" height="900">`}<span class="in-held-schatten"></span>
<div class="in-held-text"><span class="in-p in-p--sm">${esc(a.rubrik)} · <time datetime="${a.datum}" data-in-tag>${kurzDatum(a.datum)}</time></span><h1><a class="in-dehn" href="/insights/${a.slug}/">${esc(a.titel)}</a></h1><div class="in-held-tk">${a.ticker.map((t) => tkLink(a, t)).join('')}<span class="in-min">${lesezeit(a)} Min.</span></div></div>
</section>`;
// Kachel für Heft oder Report (Prototyp: Aktienmagazin-Kachel mit Titelseite 136 × 192, Pille, Titel, Zeile, Fortschritt, Knopf)
const heftKachel = ({ href, cover, alt, pill, titel, zeile: z, seiten }) => `<a class="in-heft" href="${esc(href)}" data-in-lesen="${esc(href)}" data-in-seiten="${seiten}"><img src="${esc(cover)}" alt="${esc(alt)}" width="136" height="192" loading="lazy"><span class="in-heft-text"><span class="in-p in-p--sm">${pill}</span><b class="in-heft-titel">${esc(titel)}</b><span class="in-heft-zeile">${z}</span><span class="in-bar" hidden><i></i></span><span class="in-heft-seite" hidden></span><span class="in-btn">Lesen</span></span></a>`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// Erklärvideo (Prototyp „vid“): Hochformat 150 × 240, Startknopf, Titel und Dauer. Ohne Skript öffnet der Link das Video.
const video = (s) => { const v = s.slides.find((x) => x.type === 'video'); return v ? `<a class="in-vid" href="${v.src}" data-in-vid="${v.src}" data-in-poster="${v.poster}" data-in-titel="${esc(s.product)}: ${esc(s.tagline)}"><img src="${s.thumb}" alt="" loading="lazy" width="640" height="400"><span class="in-vid-schatten"></span><span class="in-vid-start" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l14 8-14 8z"/></svg></span><span class="in-vid-text"><b>${esc(s.tagline.replace(/\.$/, ''))}</b><span>${esc(s.product)} · ${mmss(v.duration)}</span></span></a>` : ''; };

function uebersicht(artikel, reports) {
  const [erst, ...rest] = artikel, heute = rest.slice(0, 3), weitere = rest.slice(3), heft = LOADED.magazin[0];
  const mitSeiten = reports.filter((r) => r.seiten), ohneSeiten = reports.filter((r) => !r.seiten);
  // Erklärvideos der Module in der Reihenfolge von stories.json; der allgemeine Einblick („start“) steht am Ende
  const videos = [...STORIES.filter((s) => s.id !== 'start'), ...STORIES.filter((s) => s.id === 'start')].map(video).filter(Boolean);
  return head({ title: 'Insights · Tagesthemen, Aktienmagazin und Reports · Vision Universe', description: 'Tagesthemen von der Börse, recherchiert und mit den Daten von Vision Universe eingeordnet: Kurse, Geschäftszahlen, Charttechnik und große Fonds. Dazu jede Woche das Aktienmagazin.', canonical: '/insights/', image: TEILBILD, bleed: !!erst }) + `<main id="in-main" class="in-news">
${erst ? held(erst) : '<h1 class="in-px">Insights</h1><p class="in-px">Noch keine Artikel.</p>'}
${tabs('heute', true)}
<section id="heute" class="in-px" aria-label="Heute">${heute.map(zeile).join('')}</section>
${heft ? `<section id="magazin">${sh('Aktienmagazin', 'Alle Ausgaben', '/insights/magazin/')}<div class="in-px">${heftKachel({ href: heftUrl(heft), cover: `${heftUrl(heft)}cover.jpg`, alt: `Titelseite Aktienmagazin Nr. ${heft.nr}`, pill: `Nr. ${heft.nr} · KW ${heft.kw}`, titel: heft.titel, zeile: `${heft.seiten} Seiten · erscheint wöchentlich`, seiten: heft.seiten })}</div></section>` : ''}
${videos.length ? `<section id="kurz">${sh('Kurz erklärt in 30 Sekunden')}<div class="in-rail" role="list">${videos.map((v) => `<div role="listitem">${v}</div>`).join('')}</div></section>` : ''}
<section id="deine" hidden>${sh('Zu deinen Aktien')}<div class="in-px" data-in-deine></div></section>
<section id="reports">${sh('Aktienreports', reports.length ? 'Alle Reports' : '', '/insights/reports/')}<div class="in-px in-reports">${mitSeiten.map((r) => heftKachel({ href: r.href, cover: `${r.href}cover.jpg`, alt: `Titelseite ${r.titel}`, pill: `Nr. ${r.nr} · ${kurzDatum(r.datum)}`, titel: r.titel, zeile: `${r.seiten} Seiten · ${esc(r.art)}`, seiten: r.seiten })).join('')}${ohneSeiten.map((r) => `<a class="in-leerkachel" href="${esc(r.href)}"><span class="in-hud" aria-hidden="true">${ICON.heft}</span><span><b>${esc(r.titel)}</b><span>${esc(r.text)}</span></span></a>`).join('')}${reports.length ? '' : `<div class="in-leerkachel"><span class="in-hud" aria-hidden="true">${ICON.heft}</span><span><b>Der erste Report ist in Arbeit</b><span>Tiefe Analysen einzelner Firmen, als Heft zum Blättern.</span></span></div>`}</div></section>
${weitere.length ? `<section id="weitere">${sh('Weitere Artikel')}<div class="in-px">${weitere.map(zeile).join('')}</div></section>` : ''}
${erst ? `<template id="in-held-zeile">${zeile(erst)}</template>` : ''}
<p class="in-ueber in-px">Was die Börse heute bewegt. Und was die Daten dazu sagen: jeden Tag ein bis zwei Themen, recherchiert, eingeordnet und mit Kursen, Geschäftszahlen und Fondsdaten aus Vision Universe unterlegt.</p>
<div class="in-px">${VUUI.next({ title: DISCOVER.label, sub: DISCOVER.claim, href: DISCOVER.href })}</div>
${ende}
</main>
` + fuss;
}

// Seiten eines Hefts oder Reports: Inhalt als Schiene mit den Seitenbildern, darunter alle Seiten zum Lesen
const nn = (n) => String(n).padStart(2, '0');
const heftInhalt = (basis, inhalt) => `<nav class="in-heft-inhalt" aria-label="Inhalt"><b class="in-vu-label">Inhalt</b>${VUUI.rail(inhalt.map(([s, rubrik, titel]) => `<a class="in-seite" href="#s${nn(s)}"><span class="in-seite-bild"><img src="${basis}seiten/s${nn(s)}.jpg" alt="" width="1100" height="1556" loading="lazy"><span>${nn(s)}</span></span><em>${esc(rubrik)}</em><b>${esc(titel)}</b></a>`), { label: 'Inhalt', width: 132 })}</nav>`;
const heftSeiten = (basis, anzahl) => `<div class="in-heft-seiten">
${Array.from({ length: anzahl }, (_, i) => `<img id="s${nn(i + 1)}" src="${basis}seiten/s${nn(i + 1)}.jpg" alt="Seite ${i + 1}" width="1100" height="1556" loading="${i < 2 ? 'eager' : 'lazy'}">`).join('\n')}
</div>`;

// Aktienreports mit Seiten (aus dem Heft-System): Leseseite wie beim Magazin plus Kurzfassung als Text
const reportPdf = (r) => `${r.href}${r.pdf}`;
const reportFakten = (r) => [{ value: r.seiten, label: 'Seiten' }, { value: `Nr. ${r.nr}`, label: datumLang(r.datum) }, { value: `${r.pdfMB} MB`, label: 'PDF' }];
const reportTeaser = (r, breit = false) => buehne({ ton: 'lime', breit, href: r.href, lesen: 'Online lesen', cover: `${r.href}cover.jpg`, alt: `Titelseite ${r.titel}`, kicker: `${esc(r.art)} · Nr. ${r.nr}`, titel: r.titel, text: r.text, fakten: reportFakten(r), pdf: reportPdf(r), pdfMB: r.pdfMB });
function reportSeite(r) {
  return head({ title: `${r.art}: ${r.titel} · Vision Universe`, description: r.text, canonical: r.href, image: r.href + 'cover.jpg' }) + `<main id="in-main" class="in-wrap in-heftseite">
${tabs('reports')}
${buehne({ ton: 'lime', gross: true, href: '#s01', lesen: 'Lesen', cover: `${r.href}cover.jpg`, alt: `Titelseite ${r.titel}`, kicker: `${esc(r.art)} · Nr. ${r.nr} · ${datumLang(r.datum)}`, titel: r.titel, text: r.unterzeile, fakten: reportFakten(r), pdf: reportPdf(r), pdfMB: r.pdfMB })}
${heftInhalt(r.href, r.inhalt)}
${heftSeiten(r.href, r.seiten)}
<section class="in-heft-kurz"><h2 class="in-h2">Kurzfassung</h2>${r.kurzfassung.map((p) => `<p>${esc(p)}</p>`).join('')}</section>
<p class="in-klein">Keine Anlageberatung. Der Report nennt keine Kursziele und gibt keine Empfehlung. Bilder aus Grand Theft Auto VI: Rockstar Games.</p>
${weiterHeft()}
${ende}
</main>
` + fuss;
}

function reportsSeite(reports) {
  const ohneSeiten = reports.filter((r) => !r.seiten);
  return head({ title: 'Reports · Aktienreports von Vision Universe', description: 'Aktienreports von Vision Universe: einzelne Unternehmen ausführlich, mit Geschäftsmodell, Zahlen und Daten.', canonical: '/insights/reports/', image: TEILBILD }) + `<main id="in-main" class="in-wrap">
${tabs('reports')}
<header class="in-hub"><span class="in-kicker">Reports</span><h1>Aktienreports</h1><p class="in-lead">Ein Unternehmen ausführlich: Geschäftsmodell, Zahlen, Bewertung im Vergleich und was die Daten von Vision Universe zeigen. Neue Reports erscheinen hier.</p></header>
${reports.length ? `${reports.filter((r) => r.seiten).map((r) => reportTeaser(r, true)).join('\n')}${ohneSeiten.length ? `<div class="in-raster in-raster--karten">${ohneSeiten.map(reportKarte).join('')}</div>` : ''}` : `<div class="in-leer vu-box"><b>Der erste Aktienreport ist in Arbeit.</b><p>Bis dahin: jeden Tag neue Artikel unter Insights und jede Woche das Aktienmagazin.</p><div class="in-links"><a class="vu-btn vu-btn--sm vu-btn--ink" href="/insights/magazin/">Zum Aktienmagazin${ICON.next}</a><a class="vu-btn vu-btn--sm vu-btn--line" href="/insights/">Zu den Artikeln</a></div></div>`}
${weiterHeft()}
${ende}
</main>
` + fuss;
}

// Aktienmagazin: Übersicht aller Ausgaben und je Ausgabe eine Leseseite (Seitenbilder untereinander, PDF zum Laden)
let LOADED = { magazin: [], reports: [] };
const heftUrl = (h) => `/insights/magazin/nr-${h.nr}/`;
const heftPdf = (h) => `${heftUrl(h)}vision-universe-aktienmagazin-${h.nr}.pdf`;
const heftFakten = (h) => [{ value: h.seiten, label: 'Seiten', tone: 'lime' }, { value: `KW ${h.kw}`, label: datumLang(h.datum) }, { value: `${h.pdfMB} MB`, label: 'PDF' }];
const magazinTeaser = (h, breit = false) => (h ? buehne({ ton: 'nacht', breit, href: heftUrl(h), lesen: 'Online lesen', cover: `${heftUrl(h)}cover.jpg`, alt: `Titelseite Aktienmagazin Nr. ${h.nr}`, kicker: `Aktienmagazin · Nr. ${h.nr}`, titel: h.titel, text: h.unterzeile, fakten: heftFakten(h), pdf: heftPdf(h), pdfMB: h.pdfMB }) : '');

function magazinUebersicht(hefte) {
  return head({ title: 'Aktienmagazin · Vision Universe', description: 'Das Vision Universe Aktienmagazin: jede Woche die wichtigsten Börsenthemen, eingeordnet mit Kursen, Geschäftszahlen und Fondsdaten. Online lesen oder als PDF laden.', canonical: '/insights/magazin/', image: hefte[0] ? heftUrl(hefte[0]) + 'cover.jpg' : null }) + `<main id="in-main" class="in-wrap">
${tabs('magazin')}
<header class="in-hub"><span class="in-kicker">Aktienmagazin</span><h1>Jede Woche das Heft zur Börse.</h1><p class="in-lead">Titelthema, Einzelanalysen, Berichtssaison, Hedgefonds, Charts und Termine: recherchiert und mit den Daten von Vision Universe unterlegt. Online lesen oder als PDF laden.</p></header>
${magazinTeaser(hefte[0], true)}
${hefte.length > 1 ? `<section><h2 class="in-h2">Frühere Ausgaben</h2><div class="in-hefte">${hefte.slice(1).map((h) => `<a href="${heftUrl(h)}"><img src="${heftUrl(h)}cover.jpg" alt="" loading="lazy" width="560" height="792"><b>Nr. ${h.nr} · ${esc(h.titel)}</b><span>${datumDE(h.datum)}</span></a>`).join('')}</div></section>` : ''}
${weiterReport()}
${ende}
</main>
` + fuss;
}

function heftSeite(h) {
  return head({ title: `Aktienmagazin Nr. ${h.nr}: ${h.titel} · Vision Universe`, description: h.unterzeile, canonical: heftUrl(h), image: heftUrl(h) + 'cover.jpg' }) + `<main id="in-main" class="in-wrap in-heftseite">
${tabs('magazin')}
${buehne({ ton: 'nacht', gross: true, href: '#s01', lesen: 'Lesen', cover: `${heftUrl(h)}cover.jpg`, alt: `Titelseite Aktienmagazin Nr. ${h.nr}`, kicker: `Aktienmagazin · Nr. ${h.nr} · ${datumLang(h.datum)}`, titel: h.titel, text: h.unterzeile, fakten: heftFakten(h), pdf: heftPdf(h), pdfMB: h.pdfMB })}
${heftInhalt(heftUrl(h), h.inhalt)}
${heftSeiten(heftUrl(h), h.seiten)}
${weiterReport()}
${ende}
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
  ALLE = artikel; LOADED = { magazin: hefte, reports };
  const files = {
    'insights/index.html': uebersicht(artikel, reports),
    'insights/reports/index.html': reportsSeite(reports),
    'insights/feed.xml': feed(artikel),
    'insights/sitemap.xml': sitemap(artikel, hefte, reports),
    'insights/magazin/index.html': magazinUebersicht(hefte),
    'insights/artikel.json': JSON.stringify({ schema: 'vu-insights-1', note: 'Erzeugt von products/insights/build.mjs', artikel: artikel.map((a) => { const { slug, datum, rubrik, titel, teaser, ticker, firma, themen, bild, daten } = a; return ({ slug, datum, rubrik, titel, teaser, ticker, firma: firma || { ticker: ticker[0], name: kurzName(daten, ticker[0]) }, themen: themen || [], bild: bild.typ === 'app' ? null : bild.src, bildQuer: bildQuer(a), href: `/insights/${slug}/` }); }), magazin: hefte.map(({ nr, datum, kw, titel, seiten }) => ({ nr, datum, kw, titel, seiten, cover: `/insights/magazin/nr-${nr}/cover.jpg`, href: `/insights/magazin/nr-${nr}/` })), reports: reports.map(({ datum, art, titel, href }) => ({ datum, art, titel, href })) }, null, 1) + '\n',
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
  // www.visionuniverse.de zeigt Artikel, Heft und Report fest in der Seite: im selben Lauf auffrischen
  // (landing/ gehört mit in denselben Commit; scripts/website/www-news.mjs).
  if (out === root) {
    const { syncWww } = await import('../../scripts/website/www-news.mjs');
    const www = syncWww({ check });
    if (check && www.length) { console.error('www veraltet (node scripts/website/www-news.mjs): ' + www.join(', ')); process.exit(1); }
    if (www.length) console.log(`www: ${check ? 'geprüft' : 'aufgefrischt: ' + www.length}`);
  }
}

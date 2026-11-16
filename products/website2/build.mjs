/* Vision Universe · Website („Website-Mock-up 3“, Owner-Freigaben 14.11.2026): hell, app-artig, bewegt.
   Ein Erzeuger, zwei Ziele:

     research  Vorschau im geschützten Bereich research.visionuniverse.de/website2/ (Passwortmaske, noindex).
     www       die öffentliche Seite www.visionuniverse.de. Der Erzeuger schreibt die Seiten und alle nötigen Dateien als
               committete Dateien nach landing/ (Cloudflare Pages baut nur aus landing/, landing/scripts/build.mjs).

   17 Seiten je Ziel: Start, App, zwölf Modulseiten, News, Aktienmagazin, Fragen.

   Regeln (products/website2/README.md): App noch nicht verfügbar, daher kein Link in die App oder in einen Store; Store-
   Knöpfe in Farbe, ohne Link, mit „Bald verfügbar“. Keine Preise. Wortwahl nach docs/legal/WORTWAHL.md. Farben nur
   Schwarz, Weiß, Grau und Neongrün (kein Dunkelgrün). Auf www: keine Anfrage an eine andere Adresse (keine Schriften,
   Einbettungen oder Laufzeit-Abrufe von research); Artikel, Heft und Report kommen deshalb beim Bauen aus dem
   committeten Auszug landing/site/insights.json. Rechtstexte und das Anmeldeformular (landing/newsletter-form.html)
   werden wörtlich übernommen, nie hier geändert.

     node products/website2/build.mjs                  schreibt website2/<seite>/index.html (research)
     node products/website2/build.mjs --out DIR        dasselbe nach DIR (Tests)
     node products/website2/build.mjs --target www     frischt den Insights-Auszug und die Dateien unter landing/site/
                                                       auf und schreibt die www-Seiten nach landing/
     node products/website2/build.mjs --target www --out DIR   schreibt nur die www-Seiten nach DIR (Tests, ohne Auffrischen)

   website2/site.css, website2/site.js, website2/img/ und website2/vid/ sind Handarbeit. landing/site/ ist deren Kopie
   für www und gehört diesem Erzeuger. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASE = "/website2/";
export const WWW = "https://www.visionuniverse.de/";
export const RESEARCH = "https://research.visionuniverse.de";
export const NEWSLETTER = `${WWW}#newsletter`;
export const KONTAKT = "https://konto.visionuniverse.de/kontakt";
export const EMAIL = "mailto:info@visionuniverse.de";
/* Social Media nur Instagram und TikTok (docs/publishing/HANDBUCH.md). */
export const SOCIAL = [
  ["instagram", "Instagram", "https://www.instagram.com/app.visionuniverse/"],
  ["tiktok", "TikTok", "https://www.tiktok.com/@app.visionuniverse"]
];
/* Heft, das die Vorschau ohne JavaScript zeigt (website2/site.js setzt dort das neueste ein). www nimmt das Heft aus dem Auszug. */
export const HEFT = { nr: "01", datum: "09.11.2026", titel: "Die KI-Bremse", seiten: 30, href: "/insights/magazin/nr-01/", blick: [2, 3, 5, 8, 12, 17, 20, 24] };
const BLICK = [2, 3, 5, 8, 12, 17, 20, 24];
/* Aktienreport, den die Vorschau ohne JavaScript zeigt (site.js setzt einen neueren ein). www nimmt ihn aus dem Auszug.
   Nur was der Report wirklich enthält: Nummer, Datum, Titel, Seitenzahl, Titelbild, Seiten, PDF. */
export const REPORT = { nr: "01", datum: "12.11.2026", titel: "Take-Two Interactive: Alles auf Vice City", seiten: 20, href: "/insights/reports/take-two-gta-6/", pdf: "aktienreport-01-take-two.pdf", blick: [2, 4, 5, 6, 7, 8] };
const REPORT_BLICK = [2, 4, 5, 6, 7, 8];
const LANDING = join(ROOT, "landing");
const SITE = join(LANDING, "site");
export const SNAPSHOT = join(SITE, "insights.json");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nn = (n) => String(n).padStart(2, "0");
const datum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
/* Platzhalter für den Weg zur Wurzel der www-Seite; je Seite durch ./, ../ oder ../../ ersetzt (relative Adressen,
   damit der Bau auch unter einem Unterpfad und in den Prüfungen von landing/ funktioniert). */
const R = "@@R@@";

/* ---------- Inhalte ---------- */
/* Texte aus der Website-Vorschau /website/ (products/website/build.mjs), Fakten aus dem Datenbestand (Mock-up 3).
   Wortwahl nach docs/legal/WORTWAHL.md: beschreiben statt auffordern, keine Empfehlung, keine Signale. */
export const MODULES = [
  { id: "discover", name: "Discover", group: "Entdecken", color: "c-lime", q: "Was bewegt die Börse heute?", shot: "app-discover.jpg", video: "discover",
    lead: "Der Einstieg in den Markt: die größten Bewegungen des Tages, Themenwelten von KI bis Raumfahrt und jede Aktie auf einer Seite erklärt.",
    facts: [["54", "Themenwelten"], ["24", "Reihen mit fester Regel"], ["5.699", "US-Aktien"]] },
  { id: "screener", name: "Screener", group: "Entdecken", color: "c-alt", q: "Welche Aktien erfüllen meine Bedingungen?", shot: "app-screener.jpg", video: "screener",
    lead: "Aus über 6.000 US-Aktien die eigene Auswahl filtern. Kennzahlen stellst du als Satz ein, das Ergebnis steht sofort da.",
    facts: [["171", "Kriterien"], ["6.000+", "US-Aktien"], ["1 Satz", "statt Formular"]] },
  { id: "atlas", name: "Vision Universe KI", group: "Entdecken", color: "c-ink", q: "Frag in deinen Worten.", shot: "app-atlas.jpg", video: "atlas", icon: "layers",
    lead: "Stell deine Frage so, wie du sie einem Freund stellen würdest. Die KI antwortet mit den Daten der App und nennt die Quelle.",
    facts: [["Beta", "Stand heute"], ["Sprache", "oder Text"], ["Quelle", "zu jeder Zahl"]] },
  { id: "fundamental", name: "Fundamental", group: "Verstehen", color: "c-soft", q: "Verdient die Firma wirklich Geld?", shot: "app-fundamental.jpg", video: "fundamental",
    lead: "Umsatz, Gewinn und Cashflow über viele Jahre, direkt aus den Pflichtberichten an die US-Börsenaufsicht SEC.",
    facts: [["60", "Kennzahlen"], ["12 Jahre", "Geschäftszahlen"], ["SEC", "als Quelle"]] },
  { id: "quant", name: "Quant", group: "Verstehen", color: "c-ink", q: "Wie gut ist die Aktie im Vergleich?", shot: "app-quant.jpg", video: "quant",
    lead: "Eigenschaften je Aktie, jeden Tag gegen alle US-Aktien gemessen, von 0 bis 100. 86 heißt: besser als 86 von 100 US-Aktien.",
    facts: [["0–100", "je Eigenschaft"], ["8", "Anlagestile"], ["täglich", "neu gerechnet"]] },
  { id: "technical", name: "Technical", group: "Verstehen", color: "c-wht", q: "Was zeigt der Chart?", shot: "app-technical.jpg", video: "technical",
    lead: "Der Chart in Worten: Trend, wichtige Linien und bekannte Muster, verständlich beschrieben statt nur gezeichnet.",
    facts: [["24", "Formationen"], ["92", "Indikatoren"], ["5.641", "Aktien"]] },
  { id: "elliott", name: "Elliott", group: "Verstehen", color: "c-alt", q: "In welcher Welle steht der Kurs?", shot: "app-elliott.webp", video: "elliott",
    lead: "Märkte bewegen sich in Wellen. Elliott zeigt die Wellenstruktur, aber nur dort, wo sich die Wellen sauber zählen lassen.",
    facts: [["Wochen", "als Basis"], ["nur", "wenn zählbar"], ["kein", "Kursziel"]] },
  { id: "supertrader", name: "Supertrader", group: "Methoden", color: "c-ink", q: "Nach welchen Regeln handeln bekannte Trader?", shot: "app-supertrader.jpg", video: "supertrader",
    lead: "13 Methoden bekannter Trader als feste Regeln, jeden Handelstag auf alle US-Aktien angewendet. Du siehst, welche Aktie welche Regel erfüllt.",
    facts: [["13", "Methoden"], ["täglich", "angewendet"], ["0 €", "echtes Geld im Musterdepot"]] },
  { id: "hedgefonds", name: "Hedgefonds", group: "Methoden", color: "c-soft", q: "Was haben große Fonds gemeldet?", shot: "app-hedgefonds.jpg", video: "hedgefonds",
    lead: "Was Warren Buffett und andere große Investoren in ihren Pflichtmeldungen an die SEC (13F) angeben, übersichtlich je Fonds und je Aktie.",
    facts: [["920", "Melder"], ["119", "Star-Investoren"], ["13F", "als Quelle"]] },
  { id: "portfolios", name: "Portfolios", group: "Methoden", color: "c-wht", q: "Halten Musterdepots ihre Regeln?", shot: "app-portfolios.webp", video: null,
    lead: "Musterdepots ohne echtes Geld, die den Regeln von Supertrader und Quant folgen. Jede Aufnahme und Abgabe ist offen nachvollziehbar.",
    facts: [["14", "Musterdepots"], ["offen", "jede Aufnahme und Abgabe"], ["0 €", "echtes Geld"]] },
  { id: "vorsorge", name: "Vorsorge", group: "Vorsorgen", color: "c-lime", q: "Was wird aus meiner Rente?", shot: "app-vorsorge.webp", video: "vorsorge",
    lead: "Die eigene Altersvorsorge einfach durchrechnen: Sparplan ab 10 € im Monat, ETFs in einem Satz erklärt, Förderung und Rentenlücke.",
    facts: [["10 €", "Sparplan ab"], ["7.000+", "ETFs"], ["2027", "Förderung"]] },
  /* Dritter Fakt im Mock-up: „Reports · in Arbeit“. Der erste Aktienreport ist seit 12.11.2026 erschienen, daher neutral. */
  { id: "insights", name: "Insights", group: "Lesen", color: "c-alt", q: "Was steckt hinter den Schlagzeilen?", shot: "app-news.jpg", video: null,
    lead: "Jeden Werktag neue Artikel zu Aktien und Themen, dazu das Aktienmagazin und ausführliche Aktienreports.",
    facts: [["werktags", "neue Artikel"], ["wöchentlich", "Aktienmagazin"], ["Reports", "ausführlich"]] }
];
const MOD = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const NUMS = [["6.000+", "US-Aktien"], ["7.000+", "ETFs"], ["12 Jahre", "Geschäftszahlen"], ["13", "Methoden bekannter Trader"], ["54", "Themenwelten"]];
const FAQ = [
  ["Was ist Vision Universe?", "Eine Analyse-App für Aktien, ETFs und Vorsorge. Elf Bereiche arbeiten mit denselben Daten und erklären jede Zahl in klaren Worten, vom ersten Sparplan bis zur Profi-Analyse."],
  ["Wann kommt die App?", "Bald, für iPhone und Android. Wer sich einträgt, erfährt als Erstes vom Start."],
  ["Ist das eine Anlageberatung?", "Nein. Vision Universe ist Analyse-Software: Die Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich. Es gibt keine Kauf- oder Verkaufsempfehlungen und keine Kursziele."],
  ["Woher kommen die Daten?", "Geschäftszahlen aus den Pflichtberichten an die US-Börsenaufsicht SEC, Tageskurse von einem Marktdatenanbieter, Fondsbestände aus 13F-Meldungen. Jede Zahl steht mit Datum."],
  ["Kann ich bei Vision Universe Aktien kaufen?", "Nein. Vision Universe ist kein Broker. Gekauft wird bei deiner Bank oder deinem Broker. Vision Universe hilft dir zu verstehen, was in einer Aktie steckt."],
  ["Was kostet die App?", "Zum Start ist Vision Universe kostenlos. Bevor sich daran etwas ändert, sagen wir es rechtzeitig."],
  ["Auf welchen Geräten läuft Vision Universe?", "Auf iPhone und Android, dazu im Browser auf Tablet und Desktop. Merkliste, Filter und Sparplan sind in deinem Konto auf allen Geräten gleich."]
];
const NAV = [["app", "Die App", "app/"], ["news", "News", "news/"], ["magazin", "Aktienmagazin", "magazin/"], ["faq", "Fragen", "faq/"]];
export const PAGES = ["", "app/", ...MODULES.map((m) => `module/${m.id}/`), "news/", "magazin/", "faq/"];
const CTA = "Zum Start benachrichtigen";

/* ---------- Symbole (eigene Zeichnungen, einfarbig, im Strich der Seite) ---------- */
const stroke = (s, w, body) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const I = {
  chev: stroke(14, 2.8, '<path d="M9 5l7 7-7 7"/>'),
  down: stroke(12, 3, '<path d="M5 9l7 7 7-7"/>'),
  menu: stroke(20, 2.6, '<path d="M4 7h16M4 12h16M4 17h16"/>').replace("<svg ", '<svg class="mo" '),
  close: stroke(20, 2.6, '<path d="M6 6l12 12M18 6L6 18"/>').replace("<svg ", '<svg class="mx" '),
  spark: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>',
  play: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l14 8-14 8z"/></svg>',
  instagram: stroke(24, 2, '<rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" stroke="none"/>'),
  tiktok: stroke(24, 2.2, '<path d="M14 3v11.6a3.6 3.6 0 1 1-3.6-3.6"/><path d="M14 3c.3 2.7 2 4.5 4.8 4.8"/>')
};

function legal() {
  const j = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
  return { text: j.notices.footer.text, links: j.links };
}
/* Anmeldeformular von www, wörtlich (Felder, Einwilligung vu-newsletter-v1, Zustände). landing/scripts/build.mjs schaltet es je nach Freigabe. */
const FORM = () => readFileSync(join(LANDING, "newsletter-form.html"), "utf8").trim();
export function loadSnapshot() { return JSON.parse(readFileSync(SNAPSHOT, "utf8")); }

/* Erklärvideo eines Moduls: aktuelle Fassung aus willkommen/config/stories.json (eine Quelle; neue Fassung = neuer Dateiname). */
const STORY_FILMS = new Map(JSON.parse(readFileSync(join(ROOT, "willkommen/config/stories.json"), "utf8")).stories
  .map((s) => [s.id, (s.slides.find((x) => x.type === "video") || {}).src]).filter(([, src]) => src));
export const storyFilm = (id) => STORY_FILMS.get(id) || `/assets/stories/${id}-v1.mp4`;

/* ---------- Ziele ---------- */
const TARGETS = {
  research: {
    www: false, root: BASE, css: `${BASE}site.css`, js: `${BASE}site.js`, img: `${BASE}img/`, vid: `${BASE}vid/app.mp4`,
    icons: "/assets/product-icons.svg", font: "/assets/fonts/inter-latin.woff2", badge: "/website/img/",
    film: (id) => storyFilm(id), favicon: "/assets/icons/icon-192.png", touch: "/assets/icons/apple-touch-icon.png",
    newsletter: NEWSLETTER, origin: `${RESEARCH}${BASE}`, robots: "noindex,nofollow", producer: "products/website2/build.mjs"
  },
  www: {
    www: true, root: R, css: `${R}site/site.css`, js: `${R}site/site.js`, img: `${R}site/img/`, vid: `${R}site/vid/app.mp4`,
    icons: `${R}site/product-icons.svg`, font: `${R}assets/fonts/inter-latin.woff2`, badge: `${R}site/img/`,
    film: (id) => `${R}partner/media/${id}.mp4`, favicon: `${R}assets/icon-192.png`, touch: `${R}assets/apple-touch-icon.png`,
    newsletter: `${R}#newsletter`, origin: WWW, robots: "noindex, nofollow", producer: "products/website2/build.mjs --target www"
  }
};

function site(c, data) {
  const L = legal();
  const page_ = (p) => `${c.root}${p}`;
  const modHref = (id) => page_(`module/${id}/`);
  const ic = (id, s = 20) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="${c.icons}#${id}"/></svg>`;
  const micon = (m, s = 26) => ic(m.icon || m.id, s);
  /* Heft für Titelbild, Kennzeichen-Grafik, Heftblock und Magazin-Seite. */
  const heft = c.www
    ? { ...data.heft, datum: datum(data.heft.datum), blick: data.heft.blick, cover: `${c.img}${data.heft.cover}`, seite: (n) => `${c.img}heft-${data.heft.nr}-s${nn(n)}.jpg`, pdf: data.heft.pdf }
    : { ...HEFT, cover: `${HEFT.href}cover.jpg`, seite: (n) => `${HEFT.href}seiten/s${nn(n)}.jpg`, pdf: `${HEFT.href}vision-universe-aktienmagazin-${HEFT.nr}.pdf` };
  const live = (attr) => (c.www ? "" : ` ${attr}`);
  /* Aktienreport für die Bühne auf der News-Seite, die Startseite und den Blick in den Report (auf www kann er fehlen). */
  const report = c.www
    ? (data.report && data.report.cover ? { ...data.report, datum: datum(data.report.datum), cover: `${c.img}${data.report.cover}`, seite: (n) => `${c.img}report-${data.report.nr}-s${nn(n)}.jpg`, lesen: data.report.href } : null)
    : { ...REPORT, cover: `${REPORT.href}cover.jpg`, seite: (n) => `${REPORT.href}seiten/s${nn(n)}.jpg`, lesen: REPORT.href, pdf: `${REPORT.href}${REPORT.pdf}` };
  /* Kleine WebP-Fassung zuerst, wenn es sie gibt (products/website2/bilder.py), das Original als Rückfall. */
  const has = (name) => existsSync(join(ROOT, "website2/img", name));
  const pic = (webp, img) => (webp && has(webp) ? `<picture><source type="image/webp" srcset="${c.img}${webp}">${img}</picture>` : img);

  /* Kennzeichen-Grafiken je Modul (SVG und HTML, bewegt; rein schmückend). --ac ist Schwarz, auf dunklen Kacheln Neongrün. */
  const G = {
    discover: `<svg width="130" height="130" viewBox="0 0 130 130" fill="none" stroke="currentColor" stroke-width="2"><circle cx="65" cy="65" r="60" opacity=".25"/><circle cx="65" cy="65" r="40" opacity=".25"/><circle cx="65" cy="65" r="20" opacity=".25"/><g class="a-spin"><path d="M65 65L65 5A60 60 0 0 1 117 35z" fill="var(--ac)" stroke="none" opacity=".35"/><path d="M65 65V5" stroke="var(--ac)" stroke-width="3"/><circle cx="65" cy="65" r="60" stroke="none"/></g><circle class="a-blink" cx="92" cy="44" r="5" fill="var(--ac)" stroke="none"/><circle class="a-blink" cx="40" cy="86" r="4" fill="var(--ac)" stroke="none" style="animation-delay:.6s"/></svg>`,
    screener: `<div style="font-weight:900;font-size:17px;line-height:1.9;letter-spacing:-.02em">Aktien, die<br><span class="a-blink" style="background:var(--ac);color:#fff;border-radius:8px;padding:3px 9px;white-space:nowrap">gut verdienen</span><br>und <span class="a-blink" style="background:var(--ac);color:#fff;border-radius:8px;padding:3px 9px;white-space:nowrap;animation-delay:.7s">günstig</span> sind</div>`,
    atlas: `<div style="width:100%;background:rgba(255,255,255,.1);border-radius:99px;padding:13px 18px;font-weight:700;display:flex;align-items:center;gap:10px"><span style="color:var(--ac)">${I.spark}</span><span class="a-type">günstige KI-Aktien mit Gewinn</span></div>`,
    fundamental: `<svg width="170" height="110" viewBox="0 0 170 110">${[14, 18, 26, 32, 38, 46, 70, 104].map((h, i) => `<rect class="a-grow" x="${i * 21 + 2}" y="${110 - h}" width="15" height="${h}" rx="5" fill="${i === 7 ? "var(--ac)" : "currentColor"}" opacity="${i === 7 ? 1 : 0.28}" style="animation-delay:${(i * 0.09).toFixed(2)}s"/>`).join("")}</svg>`,
    quant: `<svg width="130" height="130" viewBox="0 0 130 130" fill="none"><polygon points="65,6 116,35 116,95 65,124 14,95 14,35" stroke="currentColor" opacity=".3" stroke-width="2"/><polygon points="65,36 91,50 91,80 65,94 39,80 39,50" stroke="currentColor" opacity=".2" stroke-width="2"/><polygon fill="var(--ac)" fill-opacity=".4" stroke="var(--ac)" stroke-width="3" stroke-linejoin="round" points="65,8 108,40 88,78 65,96 34,84 22,40"><animate attributeName="points" dur="4s" repeatCount="indefinite" values="65,8 108,40 88,78 65,96 34,84 22,40;65,30 112,36 110,92 65,112 24,90 40,50;65,8 108,40 88,78 65,96 34,84 22,40"/></polygon></svg>`,
    technical: `<svg width="190" height="100" viewBox="0 0 190 100" fill="none"><rect x="0" y="62" width="190" height="20" rx="4" fill="var(--ac)" opacity=".28"/><path class="a-draw" style="--len:420" d="M4 86 26 60 44 74 70 40 92 58 118 22 140 44 162 14 186 30" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle class="a-blink" cx="186" cy="30" r="6" fill="var(--ac)"/></svg>`,
    elliott: `<svg width="190" height="100" viewBox="0 0 190 100" fill="none"><path class="a-draw" style="--len:420" d="M6 90 40 50 62 70 108 14 132 44 182 6" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>${[[40, 50, 1], [62, 70, 2], [108, 14, 3], [132, 44, 4], [182, 6, 5]].map(([x, y, n]) => `<circle cx="${x}" cy="${y}" r="9" fill="var(--ac)"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="900" fill="#fff" font-family="Inter,sans-serif">${n}</text>`).join("")}</svg>`,
    supertrader: `<div style="width:100%;display:flex;flex-direction:column;gap:7px;align-items:flex-start">${[[100, "rgba(255,255,255,.18)"], [62, "#fff"], [34, "var(--ac)"]].map(([w, col], i) => `<i class="a-growx" style="display:block;height:24px;border-radius:9px;width:${w}%;background:${col};animation-delay:${(i * 0.2).toFixed(1)}s"></i>`).join("")}</div>`,
    hedgefonds: `<div style="width:100%"><div style="display:flex;height:26px;border-radius:13px;overflow:hidden;gap:3px"><i class="a-growx" style="display:block;width:56%;background:var(--ac)"></i><i style="display:block;flex:1;background:currentColor;opacity:.25"></i></div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:800;margin-top:8px"><span>aufgestockt</span><span style="opacity:.75">verkauft</span></div></div>`,
    portfolios: `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px;width:100%">${Array.from({ length: 12 }, (_, i) => `<i${i < 7 ? ' class="a-blink"' : ""} style="display:block;height:26px;border-radius:8px;background:${i < 7 ? "var(--ac)" : "currentColor"};opacity:${i < 7 ? 1 : 0.15};animation-delay:${(i * 0.15).toFixed(2)}s"></i>`).join("")}</div>`,
    vorsorge: `<svg width="190" height="100" viewBox="0 0 190 100" fill="none"><path d="M4 92C60 88 120 70 186 8V96H4z" fill="var(--ac)" opacity=".22"/><path class="a-draw" style="--len:300" d="M4 92C60 88 120 70 186 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle class="a-blink" cx="186" cy="8" r="7" fill="var(--ac)"/></svg>`,
    insights: `<div style="position:relative;width:120px;height:120px">${[-14, -4, 7].map((r, i) => `<img src="${c.img}heft-blatt-${i + 1}.webp" alt="" width="84" height="119" loading="lazy" decoding="async" style="position:absolute;left:${18 + i * 4}px;top:0;width:84px;border-radius:6px;transform:rotate(${r}deg);box-shadow:0 8px 20px rgba(0,0,0,.25)">`).join("")}</div>`
  };

  /* ---------- Bausteine ---------- */
  const soon = `<span class="soon"><i></i>App bald verfügbar</span>`;
  /* Der eine Aufruf führt zur Anmeldung: auf www zum Formular der Startseite, in der Vorschau zur Anmeldung auf www
     (Brevo nimmt nur Anfragen von der eigenen Domain an). */
  const cta = (cls = "", t = CTA) => `<a class="cta${cls ? " " + cls : ""}" href="${c.newsletter}">${t} ${I.chev}</a>`;
  const SHOT = (src) => (src.endsWith(".webp") ? [585, 1266] : [780, 1688]);
  /* App-Ansicht im Geräterahmen. Oberhalb der Falz (lazy = false) lädt sie sofort und mit Vorrang: Sie ist dort das größte Bild. */
  const dev = (src, w, alt, cls = "", lazy = true) => `<div class="dev w${w}${cls ? " " + cls : ""}">${pic(src.endsWith(".jpg") ? src.replace(/\.jpg$/, "-600.webp") : null, `<img src="${c.img}${src}" alt="${esc(alt)}" width="${SHOT(src)[0]}" height="${SHOT(src)[1]}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`)}</div>`;
  const tile = (m, big) => `<a class="t ${m.color}${big ? " w2" : ""} rv" href="${modHref(m.id)}"><span class="go">${I.chev}</span><div class="fl g12"><div class="icb">${micon(m)}</div><b class="tn">${m.name}</b></div><div class="gfx" aria-hidden="true">${G[m.id]}</div><div class="q">${m.q}</div></a>`;
  /* Original-Knöpfe von Apple und Google (Dateien von /website/, unverändert, in Farbe). Bis zum Start ohne Link. */
  const badges = `<div class="badges"><img class="badge" src="${c.badge}badge-apple.svg" alt="Laden im App Store" width="120" height="40"><img class="badge" src="${c.badge}badge-google.png" alt="Jetzt bei Google Play" width="646" height="192"><span>Bald verfügbar</span></div>`;
  const rail = (items, label, cls = "") => `<div class="rail${cls}" tabindex="0" role="group" aria-label="${esc(label)}">${items.map(([s, n]) => `<figure>${dev(s, 250, `${n} in der App`)}<figcaption>${n}</figcaption></figure>`).join("")}</div>`;
  const cover = (alt, lazy = true) => pic(`heft-${heft.nr}-cover.webp`, `<img src="${heft.cover}" alt="${esc(alt)}" width="560" height="793"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async"${live("data-mag-img")}>`);
  const reportCover = (alt, lazy = true) => pic(`report-${report.nr}-cover.webp`, `<img src="${report.cover}" alt="${esc(alt)}" width="560" height="793"${lazy ? ' loading="lazy"' : ""} decoding="async"${live("data-rep-img")}>`);
  /* Seiten aus Heft oder Report als Schiene zum seitlichen Blättern. */
  const seiten = (o, art, name, label, attr) => `<div class="rail mid" tabindex="0" role="group" aria-label="${esc(label)}">${o.blick.map((n) => pic(`${art}-${o.nr}-s${nn(n)}.webp`, `<img class="pg" src="${o.seite(n)}" alt="${esc(name)} Nr. ${o.nr}, Seite ${n}" width="1100" height="1556" loading="lazy" decoding="async"${live(`${attr}="${n}"`)}>`)).join("")}</div>`;
  const facts = (items) => `<ul class="fx">${items.map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join("")}</ul>`;
  const eb = (t) => `<div class="eb acc">${t}</div>`;
  /* Instagram und TikTok: schlichte Links mit Namen, keine Einbettung, keine Anfrage an Dritte. */
  const social = () => `<div class="soc">${SOCIAL.map(([k, n, u]) => `<a class="sc" href="${u}" rel="noopener" target="_blank" aria-label="Vision Universe auf ${n} (@app.visionuniverse), öffnet in neuem Tab" title="${n}">${I[k]}</a>`).join("")}</div>`;

  /* Abschluss jeder Seite. Auf der Startseite von www steht hier das Anmeldeformular, sonst der Knopf dorthin. */
  const finalText = "Eine E-Mail, sobald Vision Universe im App Store und bei Google Play steht.";
  const final = `<section class="sec" id="dabei"><div class="w"><div class="fin rv"><span class="pill">App bald verfügbar · zum Start kostenlos</span><h2 class="H1">Sei beim Start dabei.</h2><p class="p">${finalText}</p>${cta()}<p class="s">${c.www ? "Anmeldung mit E-Mail-Bestätigung, Abmeldung jederzeit." : "Anmeldung auf www.visionuniverse.de · Bestätigung per E-Mail, Abmeldung jederzeit."}</p>${badges}</div></div></section>`;
  const arrow = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol></svg>';
  const signup = () => `${arrow}<section class="sec" id="newsletter" aria-labelledby="newsletter-title" tabindex="-1"><div class="w"><div class="fin"><span class="pill">App bald verfügbar · zum Start kostenlos</span><h2 class="H1" id="newsletter-title">Sei beim Start dabei.</h2><p class="p">${finalText} Dazu News zur App und neue Research-Inhalte per E-Mail.</p>
${FORM()}
${badges}</div></div></section>`;

  const megaCol = (groups) => groups.map((g) => `<div class="eb">${g}</div>${MODULES.filter((m) => m.group === g).map((m) => `<a class="mi" href="${modHref(m.id)}"><div class="icb">${micon(m)}</div><div><b>${m.name}</b><span>${m.q}</span></div></a>`).join("")}`).join("");
  /* Rechtliches im Menü: der Pflichtsatz aus assets/legal-notices.json steht repo-weit nur im Menü (nav#site-panel,
     core/tests/legal-notices-frontend.test.mjs). Links: in der Vorschau die von research, auf www die eigenen Seiten. */
  const legalLinks = c.www
    ? [["Impressum", page_("impressum/")], ["Datenschutz", page_("datenschutz/")], ["Kontaktformular", KONTAKT], ["E-Mail", EMAIL]]
    : [["Impressum", L.links.impressum], ["Kontakt", L.links.kontakt], ["Datenschutz", L.links.datenschutz], ["Nutzungsbedingungen", L.links.bedingungen], ["Risikohinweise", L.links.risikohinweise], ["Datenquellen und Methodik", "/infos/#quellen"]];
  function header(active) {
    const on = (k) => (active === k ? ' aria-current="page"' : "");
    const cls = (k) => (active === k ? " on" : "");
    /* Menü oben (Owner 14.11.2026): am Rechner die Einträge in der Leiste, auf dem Telefon Wortmarke links und rechts der
       Knopf „Menü“. Er öffnet die Menüfläche über die ganze Höhe (Seiten, Aufruf, Module, Rechtliches, Social). Ohne
       JavaScript öffnet der Sprung zu #mega dieselbe Fläche (CSS :target), „Menü schließen“ führt zurück zum Inhalt. */
    return `<a class="skip" href="#inhalt">Zum Inhalt</a>
<header class="nav" id="nav"><div class="bar"><a class="brand" href="${page_("")}"${on("start")} aria-label="Vision Universe Startseite">VISION UNIVERSE®</a>
<nav class="nls" aria-label="Hauptmenü"><a class="nl${cls("module")}" href="${page_("app/")}#bereiche" data-mega aria-controls="mega" aria-expanded="false">Module ${I.down}</a>${NAV.map(([k, n, h]) => `<a class="nl${cls(k)}" href="${page_(h)}"${on(k)}>${n}</a>`).join("")}</nav>
<div class="sp"></div>${soon}${cta("s", "Benachrichtigen")}<a class="mbtn" href="#mega" data-mega aria-controls="mega" aria-expanded="false">${I.menu}${I.close}<span>Menü</span></a></div>
<div class="mega" id="mega"><nav class="mg" id="site-panel" aria-label="Menü: Seiten, Module und Rechtliches"><div class="mnav">${[["start", "Start", ""], ...NAV].map(([k, n, h]) => `<a class="ml${cls(k)}" href="${page_(h)}"${on(k)}>${n} ${I.chev}</a>`).join("")}${cta("l")}</div><h2 class="mhd">Module</h2><div>${megaCol(["Entdecken"])}</div><div>${megaCol(["Verstehen"])}</div><div>${megaCol(["Methoden"])}</div><div>${megaCol(["Vorsorgen", "Lesen"])}<a class="mi app" href="${page_("app/")}"><div class="icb">${ic("layers", 26)}</div><div><b>Die App</b><span>Alle Bereiche auf einen Blick</span></div></a></div>
<div class="mlegal"><h2>Rechtliches &amp; Infos</h2><p>${esc(L.text)}</p><ul>${legalLinks.map(([n, h]) => `<li><a href="${h}">${n}</a></li>`).join("")}</ul>${social()}</div><a class="mclose" href="#inhalt" data-mega-close>Menü schließen</a></nav></div></header>`;
  }

  /* Fuß wie auf der heutigen Startseite von www: Impressum, Datenschutz, Kontaktformular, E-Mail; dazu Instagram und TikTok. */
  function footer() {
    const cols = [
      ["Produkt", [["Alle elf Bereiche", `${page_("app/")}#bereiche`], ["Für wen", `${page_("")}#fuer-wen`], ["App", page_("app/")]]],
      ["Insights", [["Artikel", page_("news/")], ["Aktienmagazin", page_("magazin/")], ["Aktienreports", `${page_("news/")}#reports`]]],
      ["Vertrauen", [...(c.www ? [] : [["Daten und Methodik", "/infos/#quellen"]]), ["Häufige Fragen", page_("faq/")], ["Kontakt", KONTAKT], ...(c.www ? [] : [["Rechtliches &amp; Infos", "/infos/"]])]]
    ];
    const www = (p) => (c.www ? page_(p) : `${WWW}${p}`);
    return `<footer class="foot"><div class="w"><div class="cols"><div class="about"><a class="brand" href="${page_("")}">VISION UNIVERSE®</a><p>Die Analyse-App für Aktien, ETFs und Vorsorge. Klarheit statt Lärm.</p>${social()}</div>
${cols.map(([t, l]) => `<div><h2>${t}</h2><ul>${l.map(([n, h]) => `<li><a href="${h}">${n}</a></li>`).join("")}</ul></div>`).join("\n")}</div>
<div class="legal"><span>© 2026 Vision Universe®</span><nav class="lnav" aria-label="Rechtliches und Kontakt"><a href="${www("impressum/")}">Impressum</a><a href="${www("datenschutz/")}">Datenschutz</a><a href="${KONTAKT}">Kontaktformular</a><a href="${EMAIL}">E-Mail</a></nav></div></div></footer>`;
  }

  /* Statt der Leiste unten: ein einziger Aufruf am unteren Rand des Telefons. site.js zeigt ihn erst, wenn der Knopf im
     Kopf der Seite aus dem Fenster gescrollt ist, und nimmt ihn weg, solange derselbe Aufruf, die Anmeldung oder der Fuß
     zu sehen sind. Ohne JavaScript bleibt er unsichtbar. */
  const stick = `<div class="stk" data-stick><a class="cta" href="${c.newsletter}">${CTA} ${I.chev}</a></div>`;

  function page({ path, title, desc, active, body, main = "", close = final, form = false, preload = "" }) {
    const url = `${c.origin}${path}`;
    /* www: gleiche Kopfangaben wie die bisherige Startseite (robots wie dort; landing/scripts/build.mjs stellt bei
       Produktionsfreigabe auf index um und setzt Content-Security-Policy und Versionsmarken). */
    const head = c.www
      ? `<meta name="theme-color" content="#ffffff">
  <meta name="vu-navigation" content="none">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${c.robots}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="de_DE">
  <meta property="og:site_name" content="Vision Universe">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${WWW}assets/social-preview.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Vision Universe: Die Börse ist laut. Wir bringen Ordnung hinein. App bald verfügbar.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${WWW}assets/social-preview.png">
  <link rel="icon" href="${c.favicon}" type="image/png">
  <link rel="apple-touch-icon" href="${c.touch}">
  <link rel="preload" href="${c.font}" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${c.css}">
  <script src="${c.js}" defer></script>${form ? `\n  <script src="${R}newsletter.js" defer></script>` : ""}`
      : `<meta name="robots" content="${c.robots}">
<meta name="theme-color" content="#ffffff">
<meta name="vu-navigation" content="none">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Vision Universe">
<meta property="og:locale" content="de_DE">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="icon" type="image/png" href="${c.favicon}">
<link rel="apple-touch-icon" href="${c.touch}">
<link rel="preload" href="${c.font}" as="font" type="font/woff2" crossorigin>${preload ? "\n" + preload : ""}
<link rel="stylesheet" href="${c.css}">
<script src="${c.js}" defer></script>`;
    const html = `<!doctype html>
<html lang="de">
<head>
${c.www ? "  " : ""}<meta charset="utf-8">
${c.www ? "  " : ""}<meta name="viewport" content="width=device-width,initial-scale=1">
${c.www ? "  " : ""}${head}
</head>
<body>
<!-- Erzeugt von ${c.producer}. Nicht von Hand ändern. -->
${header(active)}
<main id="inhalt"${main}>
${body}
${close}
</main>
${footer()}
${stick}
</body>
</html>
`;
    const depth = path.split("/").filter(Boolean).length;
    return html.replaceAll(R, depth ? "../".repeat(depth) : "./");
  }

  /* ---------- Kopfbild: Text links, Bühne mit kreisenden Modul-Symbolen und App-Film rechts ---------- */
  const orbit = (r, ids, dur, rev) => `<div class="orb2" style="width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px;animation-duration:${dur}s${rev ? ";animation-direction:reverse" : ""}">${ids.map((id, i) => { const a = Math.round((360 / ids.length) * i * 100) / 100; return `<div class="pl" style="transform:rotate(${a}deg) translate(${r}px) rotate(${-a}deg)"><div class="icb pc" style="animation-duration:${dur}s${rev ? "" : ";animation-direction:reverse"}">${ic(id, 26)}</div></div>`; }).join("")}</div>`;
  /* Der Film zeigt das freigegebene App-Konzept. Er läuft ohne Ton; site.js startet ihn, wenn er sichtbar ist und
     der Nutzer Bewegung nicht reduziert hat. Ohne JavaScript bleibt das Standbild stehen. */
  const stage = `<div class="stg"><div aria-hidden="true"><div class="orb"></div>${orbit(296, ["discover", "fundamental", "supertrader", "elliott", "vorsorge", "insights", "screener"], 70)}${orbit(214, ["quant", "technical", "hedgefonds", "portfolios", "layers"], 50, 1)}</div><div class="dev"><video poster="${c.img}app-poster.jpg" width="520" height="1126" muted loop playsinline preload="none" data-autoplay aria-label="Die App von Vision Universe in Bewegung"><source src="${c.vid}" type="video/mp4"></video></div>
<div class="fc a"><div class="eb">Quant · Beispiel NVIDIA</div><div class="fl g12"><b class="n">99</b><div><b>Verdient gut</b><div class="track"><i class="a-growx"></i></div></div></div></div>
<div class="fc b"><div class="eb">Supertrader</div><div class="n">13 Methoden</div><div class="s">täglich auf alle US-Aktien</div></div></div>`;
  const hero = (h, sub, extra = "") => `<div class="heroX"><div class="w split"><div><span class="soon"><i></i>App bald verfügbar · zum Start kostenlos</span><h1 class="H1">${h}</h1><p class="ld">${sub}</p><div class="fl g12 wr acts">${cta()}${extra}</div>${badges}</div>${stage}</div></div>`;

  /* ---------- Insights: in der Vorschau füllt site.js die Plätze, auf www steht der Auszug fest in der Seite ---------- */
  /* Neuester Artikel als Karte auf der Startseite. */
  const artImg = (a, lazy = true) => (a.bild ? `<img src="${c.img}${a.bild}" alt="" width="${a.w}" height="${a.h}"${lazy ? ' loading="lazy"' : ""} decoding="async">` : "");
  const teaser = () => (c.www
    ? `<a class="art rv" href="${data.artikel[0].href}">${artImg(data.artikel[0])}<div><span class="pill l">Neuester Artikel · ${datum(data.artikel[0].datum)}</span><h3 class="H3">${esc(data.artikel[0].titel)}</h3></div></a>`
    : `<a class="art rv" href="/insights/" data-live-artikel><div><span class="pill l">Neuester Artikel</span><h3 class="H3">Zu den neuesten Artikeln</h3></div></a>`);
  const feed = () => {
    if (!c.www) return `<a class="art lead rv" href="/insights/" data-feed-lead><div class="cap"><span class="pill l">Insights</span><h3 class="H2">Zu den neuesten Artikeln</h3></div></a>
<div class="bento c3 feed" data-feed="5" data-feed-skip="1"></div>`;
    const [top, ...rest] = data.artikel;
    const cards = rest.slice(0, 5);
    return `<a class="art lead rv" href="${top.href}">${artImg(top)}<div class="cap"><span class="pill l">${esc(top.rubrik)} · ${datum(top.datum)}</span><h3 class="H2">${esc(top.titel)}</h3></div></a>
<div class="bento c3 feed">${cards.map((a, i) => `<a class="art${i === 3 && cards.length > 4 ? " big" : ""} rv" href="${a.href}">${artImg(a)}<div><span class="pill${a.rubrik === "Tagesthema" ? " l" : ""}">${esc(a.rubrik)}</span><h3 class="H3">${esc(a.titel)}</h3><div class="dt">${datum(a.datum)}</div></div></a>`).join("")}</div>`;
  };
  /* Zwei Bühnen, damit Heft und Report nicht neben den Artikeln untergehen: jede mit großem Titelbild und klarem Knopf. */
  const magStage = () => `<article class="stage c-ink rv"${live(`data-mag="${heft.nr}"`)}><div class="stx"><span class="pill l">Aktienmagazin · jede Woche</span><h2 class="H2"><span${live("data-mag-nr")}>Nr. ${heft.nr}</span><br><span${live("data-mag-titel")}>${esc(heft.titel)}</span></h2><p class="sub">Das Heft zur Börsenwoche, online lesen oder als PDF.</p>${facts([[`<span${live("data-mag-seiten")}>${heft.seiten}</span>`, "Seiten"], ["0 €", "zum Start"], ["1 ×", "pro Woche"]])}<div class="fl g12 wr"><a class="cta l" href="${page_("magazin/")}">Heft ansehen ${I.chev}</a><a class="cta g" href="${heft.pdf}"${live("data-mag-pdf")}>PDF</a></div></div><div class="cov">${cover(`Titelseite Aktienmagazin Nr. ${heft.nr}`, false)}</div></article>`;
  const repStage = () => (report
    ? `<article class="stage c-lime rv" id="reports"${live(`data-live-report="${REPORT.href}"`)}><div class="stx"><span class="pill"${live("data-rep-kopf")}>Aktienreport · Nr. ${report.nr} · ${report.datum}</span><h2 class="H2"${live("data-rep-titel")}>${esc(report.titel)}</h2><p class="sub">Eine Firma, ein Heft. Online lesen oder als PDF.</p>${facts([[`<span${live("data-rep-seiten")}>${report.seiten}</span>`, "Seiten"]])}<div class="fl g12 wr"><a class="cta" href="${report.lesen}"${live("data-rep-link")}>Report lesen ${I.chev}</a><a class="cta o" href="${report.pdf}"${live("data-rep-pdf")}>PDF</a></div></div><div class="cov r">${reportCover(`Titelseite Aktienreport Nr. ${report.nr}: ${report.titel}`, false)}</div></article>`
    : c.www && data.report
      ? `<article class="stage c-lime rv" id="reports"><div class="stx"><span class="pill">Aktienreport · ${datum(data.report.datum)}</span><h2 class="H2">${esc(data.report.titel)}</h2><p class="sub">Eine Firma, ein Heft.</p><div class="fl g12 wr"><a class="cta" href="${data.report.href}">Report lesen ${I.chev}</a></div></div></article>`
      : `<article class="stage c-soft rv" id="reports"><div class="stx"><span class="pill">Aktienreports</span><h2 class="H2">Eine Firma, ein Heft.</h2><p class="sub">Der erste Aktienreport ist in Arbeit.</p></div></article>`);
  /* Kleine Fassungen für die Startseite. */
  const miniMag = () => `<a class="t c-ink mini rv"${live(`data-mag="${heft.nr}"`)} href="${page_("magazin/")}"><div class="cov s">${cover(`Titelseite Aktienmagazin Nr. ${heft.nr}`)}</div><div><span class="pill l">Aktienmagazin</span><h3 class="H3"><span${live("data-mag-nr")}>Nr. ${heft.nr}</span> · <span${live("data-mag-titel")}>${esc(heft.titel)}</span></h3><span class="more2">Heft ansehen ${I.chev}</span></div></a>`;
  const miniRep = () => (report
    ? `<a class="t c-lime mini rv"${live(`data-live-report="${REPORT.href}"`)} href="${page_("news/")}#reports"><div class="cov s r">${reportCover(`Titelseite Aktienreport Nr. ${report.nr}`)}</div><div><span class="pill">Aktienreport</span><h3 class="H3"${live("data-rep-titel")}>${esc(report.titel)}</h3><span class="more2">Report ansehen ${I.chev}</span></div></a>`
    : `<a class="t c-soft mini rv" href="${page_("news/")}#reports"><div><span class="pill">Aktienreports</span><h3 class="H3">Eine Firma, ein Heft.</h3></div></a>`);
  const insightsHome = c.www ? `${RESEARCH}/insights/` : "/insights/";
  /* Überschrift des Hefts: erstes Wort schlicht, der Rest auf Neongrün (bei einem Wort alles). */
  const heftTitel = () => { const [a, ...b] = heft.titel.split(" "); return b.length ? `${esc(a)} <span class="hl">${esc(b.join(" "))}</span>` : `<span class="hl">${esc(a)}</span>`; };
  /* ---------- Start ---------- */
  function start() {
    const mq = NUMS.map(([n, t]) => `<b>${n}</b> ${t} &nbsp;·&nbsp; `).join("");
    const body = `${hero('Die Börse ist laut. Wir bringen <span class="hl">Ordnung</span> hinein.', "Die Analyse-App für Aktien, ETFs und Vorsorge. Jede Zahl mit Quelle und einem Satz, der sie erklärt.", `<a class="cta o" href="${page_("app/")}">App ansehen</a>`)}
<div class="mq"><div><span>${mq}</span>${`<span aria-hidden="true">${mq}</span>`.repeat(3)}</div></div>
<section class="sec"><div class="w">${eb("Elf Bereiche, ein Konto")}<h2 class="H2 head">Was willst du wissen?</h2><div class="bento">${MODULES.map((m, i) => tile(m, [0, 4, 7, 11].includes(i))).join("")}</div></div></section>
<section class="sec t0"><div class="w"><div class="blk split rv"><div class="duo">${dev("app-aktie.jpg", 240, "NVIDIA in der App")}${dev("app-module.jpg", 240, "NVIDIA: Analyse aus allen Modulen", "hide-m")}</div><div>${eb("Der Beweis · NVIDIA")}<h2 class="H2" style="margin:10px 0 14px">Eine Aktie. Sieben Blickwinkel.</h2><p class="ld">Andere Apps zeigen dir den Kurs. Vision Universe zeigt, was dahinter steckt, und sagt es in einem Satz.</p><div class="chips">${[["Zahlen", "„Wächst stark und verdient sehr gut.“"], ["Faktoren", "Verdient besser als 99 % aller US-Aktien."], ["Chart", "„Abwärtstrend“, mit Zonen laut Methode."]].map(([k, v]) => `<div class="chipq"><div class="eb">${k}</div><b>${v}</b></div>`).join("")}</div><p class="note">Beispiel NVIDIA, Datenstand 12.11.2026. Keine Anlageberatung, keine Empfehlung.</p></div></div></div></section>
<section style="padding-bottom:70px"><div class="w">${eb("Die App")}<h2 class="H2" style="margin:10px 0 18px">Wisch dich durch.</h2></div>${rail([["app-home.jpg", "Home"], ["app-discover.jpg", "Discover"], ["app-quant.jpg", "Quant"], ["app-supertrader.jpg", "Supertrader"], ["app-technical.jpg", "Technical"], ["app-fundamental.jpg", "Fundamental"], ["app-hedgefonds.jpg", "Hedgefonds"], ["app-news.jpg", "News"]], "Ansichten der App, seitlich blättern")}</section>
<section class="sec t20" id="insights"><div class="w"><div class="hrow"><div>${eb("Insights")}<h2 class="H2" style="margin:10px 0 14px">Immer das Neueste vorn.</h2><p class="ld">Jeden Werktag neue Artikel, jede Woche das Aktienmagazin, dazu ausführliche Aktienreports.</p></div><div class="fl g12 wr"><a class="cta" href="${page_("news/")}">Zu den News ${I.chev}</a><a class="cta o" href="${page_("magazin/")}">Aktienmagazin</a></div></div><div class="trio">${teaser()}${miniMag()}${miniRep()}</div></div></section>
<section class="sec t0"><div class="w">${eb("Unsere Haltung")}<h2 class="H2 head">Daten statt Meinung.</h2><div class="bento">${[["Jede Zahl mit Quelle", "c-alt"], ["Jede Zahl erklärt", "c-soft"], ["Keine Empfehlung", "c-ink"], ["Keine Provision", "c-lime"]].map(([t, col], i) => `<div class="t ${col} h190 end rv"><div class="num" aria-hidden="true" data-n="0${i + 1}"></div><h3 class="H3 b">${t}</h3></div>`).join("")}</div></div></section>
<section class="sec t0" id="fuer-wen"><div class="w">${eb("Für wen")}<h2 class="H2 head">Wo stehst du gerade?</h2><div class="bento k1">${[["Sparplan ab 10 €", "„Ich fange gerade an.“", ["vorsorge", "discover", "fundamental"]], ["Privatanleger", "„Ich will meine Aktien verstehen.“", ["discover", "quant", "screener"]], ["Trader", "„Ich arbeite mit Charts und festen Regeln.“", ["technical", "supertrader", "elliott"]], ["Profi-Investoren", "„Ich will Tiefe: SEC-Daten, 13F, Backtests.“", ["fundamental", "hedgefonds", "quant"]]].map(([k, q, a]) => `<div class="t c-wht h230 rv"><div class="eb">${k}</div><h3 class="H3" style="margin-top:10px;font-size:26px;flex:1">${q}</h3><div class="fl g8">${a.map((id) => `<a class="icb" href="${modHref(id)}" aria-label="${MOD[id].name}" title="${MOD[id].name}">${ic(id, 24)}</a>`).join("")}</div></div>`).join("")}</div>
<div class="bento c3 links"><a class="t c-ink h0 rv" href="${page_("app/")}"><h3 class="H3 b">So sieht die App aus</h3><p class="q" style="margin-top:6px">Alle Bereiche im Überblick.</p></a><a class="t c-alt h0 rv" href="${page_("faq/")}"><h3 class="H3 b">Häufige Fragen</h3><p class="q" style="margin-top:6px">Gut zu wissen.</p></a><a class="t c-soft h0 rv" href="${page_("news/")}"><h3 class="H3 b">News</h3><p class="q" style="margin-top:6px">Jeden Werktag neu.</p></a></div></div></section>`;
    return page({ path: "", title: "Vision Universe · Die Börse ist laut. Wir bringen Ordnung hinein.", desc: "Die Analyse-App für Aktien, ETFs und Vorsorge: jede Aktie aus sieben Blickwinkeln, jede Zahl mit Quelle und einem Satz, der sie erklärt. Bald für iPhone und Android.", active: "start", body, close: c.www ? signup() : final, form: c.www });
  }

  /* ---------- App ---------- */
  function app() {
    const body = `${hero('Eine App. <span class="hl">Jedes Gerät.</span>', "Vision Universe kommt für iPhone und Android und läuft im Browser auf Tablet und Desktop. Ein Konto, dieselbe Merkliste.")}
<section class="sec"><div class="w">${eb("Bis zum Start")}<h2 class="H2 head">Drei Schritte, dann bist du dabei.</h2><div class="bento c3">${[["1", "E-Mail eintragen", "Auf www.visionuniverse.de. Mehr brauchen wir nicht.", "c-lime"], ["2", "Bestätigen", "Ein Klick auf den Link in der Bestätigungsmail.", "c-alt"], ["3", "Bescheid bekommen", "Zum Start kommt eine E-Mail mit dem Link zur App.", "c-ink"]].map(([n, t, s, col]) => `<div class="t ${col} rv"><div class="step" aria-hidden="true">${n}</div><h3 class="H3 b">${t}</h3><p class="q${col === "c-lime" ? " k" : ""}" style="margin-top:6px">${s}</p></div>`).join("")}</div></div></section>
<section style="padding-bottom:80px"><div class="w"><h2 class="H2" style="margin-bottom:18px">Klein fürs Sofa. Groß fürs Durchleuchten.</h2><p class="ld">Auf dem iPhone eine Spalte mit Leiste unten. Auf Tablet und Desktop die volle Breite für Charts, Listen und Filter.</p></div>${rail([["app-home.jpg", "Home"], ["app-universe.jpg", "Alle Module"], ["app-discover.jpg", "Discover"], ["app-aktie.jpg", "Die Aktie"], ["app-module.jpg", "Alle Module an der Aktie"], ["app-quant.jpg", "Quant"], ["app-supertrader.jpg", "Supertrader"], ["app-ich.jpg", "Ich"]], "Ansichten der App, seitlich blättern", " mt20")}</section>
<section class="sec t0" id="bereiche"><div class="w">${eb("Alle Bereiche")}<h2 class="H2 head">Elf Bereiche, ein Konto.</h2><div class="bento">${MODULES.map((m) => tile(m)).join("")}</div></div></section>`;
    return page({ path: "app/", title: "App · Vision Universe", desc: "Vision Universe kommt als App für iPhone und Android. App bald verfügbar.", active: "app", body });
  }

  /* ---------- Modulseite ---------- */
  function modulPage(m) {
    const others = MODULES.filter((x) => x.group === m.group && x.id !== m.id).concat(MODULES.filter((x) => x.group !== m.group)).slice(0, 4);
    const film = m.video
      ? `<section class="sec"><div class="w split"><div class="rv">${eb("In 30 Sekunden erklärt")}<h2 class="H2" style="margin:10px 0 14px">${m.name} im Video.</h2><p class="ld">Jeder Bereich hat einen kurzen Film. Ton an, zurücklehnen.</p></div><div class="vidw"><div class="vid rv" data-vid><video poster="${c.img}p-${m.video}.jpg" width="720" height="1280" controls playsinline preload="none" aria-label="${esc(m.name)} in 30 Sekunden erklärt"><source src="${c.film(m.video)}" type="video/mp4"></video><button type="button" class="play" hidden aria-label="${esc(m.name)} im Video abspielen">${I.play}</button></div></div></div></section>`
      : '<div class="gap60"></div>';
    const body = `<div class="w ptop40"><div class="mh ${m.color}"><div class="split"><div><div class="fl g12"><div class="icb xl">${micon(m, 36)}</div><div><div class="grp">${m.group}</div><b class="mname">${m.name}</b></div></div><h1 class="H1${Math.max(...m.q.split(/\s+/).map((w) => w.length)) >= 12 ? " lw" : ""}">${m.q}</h1><p class="mlead">${m.lead}</p><div class="fl g12 wr acts">${cta(m.color === "c-ink" ? "l" : "")}</div><div class="msoon">App bald verfügbar</div></div><div class="mvis"><div class="gfx hide-m" aria-hidden="true">${G[m.id]}</div>${dev(m.shot, 270, `${m.name} in der App`, "", false)}</div></div></div>
<div class="bento c3 facts">${m.facts.map(([a, b], i) => `<div class="t ${["c-alt", "c-wht", "c-soft"][i]} h170 end rv"><div class="fact${a.length >= 10 ? " sm" : ""}">${a}</div><b>${b}</b></div>`).join("")}</div></div>
${film}
<section class="sec t0"><div class="w"><h2 class="H2" style="margin-bottom:28px">Passt dazu.</h2><div class="bento">${others.map((x) => tile(x)).join("")}</div></div></section>`;
    return page({ path: `module/${m.id}/`, title: `${m.name} · Vision Universe`, desc: `${m.q} ${m.lead}`, active: "module", body });
  }

  /* ---------- News ---------- */
  function news() {
    const body = `<div class="w ptop"><div class="fl g12 wr">${soon}<span class="pill l">Insights sind schon online</span></div><h1 class="H1" style="margin-top:20px">Was die Börse <span class="hl">heute</span> bewegt.</h1><p class="ld" style="margin-top:18px">Und was die Daten dazu sagen. Jeden Tag ein bis zwei Themen, recherchiert und mit Zahlen aus Vision Universe unterlegt.</p>
<div class="fl g8 wr tabs"><a class="pill" href="#artikel">Artikel</a><a class="pill o" href="${page_("magazin/")}">Aktienmagazin</a><a class="pill o" href="#reports">Aktienreports</a></div>
<div class="stages">${magStage()}${repStage()}</div></div>
<section class="sec" id="artikel"><div class="w">${eb("Artikel")}<h2 class="H2 head">Jeden Werktag neu.</h2>${feed()}
<p class="more"><a class="cta o s" href="${insightsHome}">Alle Artikel ${I.chev}</a></p></div></section>
${report ? `<section style="padding:0 0 40px" id="report-blick"><div class="w">${eb("Blick in den Report")}<h2 class="H2" style="margin:10px 0 8px">Eine Firma, ein Heft.</h2></div>${seiten(report, "report", "Aktienreport", "Seiten aus dem Aktienreport, seitlich blättern", "data-rep-seite")}</section>` : ""}`;
    return page({ path: "news/", title: "News · Vision Universe", desc: "Neue Artikel an jedem Werktag, das Aktienmagazin und Aktienreports von Vision Universe.", active: "news", body, preload: c.www ? "" : '<link rel="preload" href="/insights/artikel.json" as="fetch" crossorigin="anonymous">' });
  }

  /* ---------- Aktienmagazin: zeigt das Heft und führt zur echten Ausgabe unter /insights/magazin/ ---------- */
  function magazin() {
    const lesen = c.www ? heft.href : HEFT.href;
    const body = `<div class="w ptop40"><div class="mh c-ink"><div class="split"><div><span class="pill l"${live("data-mag-kopf")}>Aktienmagazin · Nr. ${heft.nr} · ${heft.datum}</span><h1 class="H1 big"${live("data-mag-h1")}>${heftTitel()}</h1><p class="mtext">Das Heft zur Börsenwoche. <span${live("data-mag-seiten")}>${heft.seiten}</span> Seiten, online lesen oder als PDF.</p><div class="fl g12 wr" style="margin-top:28px"><a class="cta l" href="${lesen}"${live("data-mag-link")}>Heft lesen ${I.chev}</a><a class="cta g" href="${heft.pdf}"${live("data-mag-pdf")}>PDF</a></div><div class="stats">${[[`<span${live("data-mag-seiten")}>${heft.seiten}</span>`, "Seiten"], ["1 ×", "pro Woche"], ["0 €", "zum Start"]].map(([a, b]) => `<div><div>${a}</div><b>${b}</b></div>`).join("")}</div></div><div class="cov x">${cover(`Titelseite Aktienmagazin Nr. ${heft.nr}`, false)}</div></div></div></div>
<section style="padding:70px 0 40px"><div class="w">${eb("Blick ins Heft")}<h2 class="H2" style="margin:10px 0 8px">Blättern.</h2></div>${seiten(heft, "heft", "Aktienmagazin", "Seiten aus dem Heft, seitlich blättern", "data-mag-seite")}</section>
<section class="sec t20"><div class="w"><div class="bento c3"><a class="t c-lime rv" href="${page_("news/")}"><div class="icb">${ic("insights", 26)}</div><div class="sp"></div><h3 class="H3 b">Artikel</h3><p class="q k">Jeden Werktag neu.</p></a><div class="t c-alt rv"><div class="icb">${ic("insights", 26)}</div><div class="sp"></div><h3 class="H3 b">Nächste Ausgabe</h3><p class="q">Erscheint wöchentlich.</p></div><a class="t c-soft rv" href="${page_("news/")}#reports"><div class="icb">${ic("insights", 26)}</div><div class="sp"></div><h3 class="H3 b">Aktienreports</h3><p class="q">Ausführliche Analysen einzelner Firmen.</p></a></div></div></section>`;
    return page({ path: "magazin/", title: "Aktienmagazin · Vision Universe", desc: "Das Aktienmagazin von Vision Universe: das Heft zur Börsenwoche, online lesen oder als PDF.", active: "magazin", body, main: c.www ? "" : ` data-mag="${HEFT.nr}"` });
  }

  /* ---------- Fragen ---------- */
  function faq() {
    const body = `<div class="w ptop">${soon}<h1 class="H1" style="margin-top:20px">Gut zu <span class="hl">wissen.</span></h1><div class="split faqs"><div>${FAQ.map(([q, a], i) => `<details class="faq"${i < 4 ? " open" : ""}><summary><span>${q}</span><span class="pm" aria-hidden="true">+</span></summary><p>${a}</p></details>`).join("")}</div><div class="col g16 side"><div class="t c-lime h0"><h2 class="H3 b">Frage nicht dabei?</h2><p class="q k">Schreib uns über das Kontaktformular.</p><a class="cta s" href="${KONTAKT}">Schreib uns ${I.chev}</a></div><a class="t c-ink h0" href="${page_("app/")}"><h2 class="H3 b">So sieht die App aus</h2><p class="q">Alle Bereiche im Überblick.</p></a></div></div></div>`;
    return page({ path: "faq/", title: "Häufige Fragen · Vision Universe", desc: "Antworten auf die häufigsten Fragen zu Vision Universe.", active: "faq", body });
  }

  return new Map([
    ["index.html", start()], ["app/index.html", app()],
    ...MODULES.map((m) => [`module/${m.id}/index.html`, modulPage(m)]),
    ["news/index.html", news()], ["magazin/index.html", magazin()], ["faq/index.html", faq()]
  ]);
}

/* Vorschau auf research (Standard). */
export function buildSite() { return site(TARGETS.research, null); }
/* www aus dem committeten Auszug (landing/site/insights.json) oder aus einem übergebenen. */
export function buildWww(data = loadSnapshot()) { return site(TARGETS.www, data); }

/* ---------- www: Auszug und Dateien unter landing/site/ auffrischen ---------- */
/* Maße eines JPEG (für width/height im HTML). */
function jpegSize(file) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`Kein JPEG mit Maßen: ${file}`);
}
/* Nur öffentlich lesbare Insights-Adressen (research liefert /insights/ ohne Passwortmaske aus, scripts/access-gate/build.mjs PUBLIC_PREFIXES). */
const publicInsights = (href) => /^\/insights\/[a-z0-9\-/._]+$/i.test(href || "");
export function makeSnapshot() {
  const liste = JSON.parse(readFileSync(join(ROOT, "insights/artikel.json"), "utf8"));
  const artikel = liste.artikel.filter((a) => publicInsights(a.href)).slice(0, 6).map((a) => {
    const bild = publicInsights(a.bild) && /\.jpe?g$/i.test(a.bild) && existsSync(join(ROOT, a.bild)) ? a.bild : null;
    const [w, h] = bild ? jpegSize(join(ROOT, bild)) : [0, 0];
    return { titel: a.titel, rubrik: a.rubrik, datum: a.datum, href: `${RESEARCH}${a.href}`, quelle: bild, bild: bild ? `news-${basename(bild)}` : null, w, h };
  });
  if (!artikel.length) throw new Error("insights/artikel.json enthält keinen Artikel.");
  const h = liste.magazin.find((x) => publicInsights(x.href) && /^\d{2,3}$/.test(x.nr));
  if (!h) throw new Error("insights/artikel.json enthält kein Heft.");
  const blick = BLICK.filter((n) => n <= h.seiten && existsSync(join(ROOT, h.href, `seiten/s${nn(n)}.jpg`)));
  const heft = { nr: h.nr, datum: h.datum, titel: h.titel, seiten: h.seiten, href: `${RESEARCH}${h.href}`, pdf: `${RESEARCH}${h.href}vision-universe-aktienmagazin-${h.nr}.pdf`, quelle: h.href, cover: `heft-${h.nr}-cover.jpg`, blick };
  /* Report: artikel.json nennt Titel, Datum und Adresse; Nummer, Seitenzahl und PDF stehen in products/insights/reports.json. */
  const r = (liste.reports || []).find((x) => publicInsights(x.href));
  const voll = r && JSON.parse(readFileSync(join(ROOT, "products/insights/reports.json"), "utf8")).reports.find((x) => x.href === r.href && x.seiten && x.pdf && /^\d{2,3}$/.test(x.nr || ""));
  const report = !r ? null : voll && existsSync(join(ROOT, r.href, "cover.jpg"))
    ? { nr: voll.nr, titel: r.titel, datum: r.datum, seiten: voll.seiten, href: `${RESEARCH}${r.href}`, pdf: `${RESEARCH}${r.href}${voll.pdf}`, quelle: r.href, cover: `report-${voll.nr}-cover.jpg`, blick: REPORT_BLICK.filter((n) => n <= voll.seiten && existsSync(join(ROOT, r.href, `seiten/s${nn(n)}.jpg`))) }
    : { titel: r.titel, datum: r.datum, href: `${RESEARCH}${r.href}` };
  return { schema: "vu-website-insights-1", note: "Auszug aus insights/artikel.json für www.visionuniverse.de. Erzeugt von products/website2/build.mjs --target www, nicht von Hand ändern.", stand: artikel[0].datum, artikel, heft, report };
}
/* Was unter landing/site/ liegen muss: Ziel → Quelle im Repo. */
export function wwwAssets(snapshot) {
  const files = new Map();
  for (const f of readdirSync(join(ROOT, "website2/img"))) files.set(`img/${f}`, `website2/img/${f}`);
  files.set("vid/app.mp4", "website2/vid/app.mp4");
  files.set("img/badge-apple.svg", "website/img/badge-apple.svg");
  files.set("img/badge-google.png", "website/img/badge-google.png");
  files.set("product-icons.svg", "assets/product-icons.svg");
  for (const a of snapshot.artikel) if (a.bild) files.set(`img/${a.bild}`, a.quelle.replace(/^\//, ""));
  const q = snapshot.heft.quelle.replace(/^\//, "");
  files.set(`img/${snapshot.heft.cover}`, `${q}cover.jpg`);
  for (const n of snapshot.heft.blick) files.set(`img/heft-${snapshot.heft.nr}-s${nn(n)}.jpg`, `${q}seiten/s${nn(n)}.jpg`);
  if (snapshot.report && snapshot.report.cover) {
    const rq = snapshot.report.quelle.replace(/^\//, "");
    files.set(`img/${snapshot.report.cover}`, `${rq}cover.jpg`);
    for (const n of snapshot.report.blick) files.set(`img/report-${snapshot.report.nr}-s${nn(n)}.jpg`, `${rq}seiten/s${nn(n)}.jpg`);
  }
  return files;
}
/* site.css und site.js für www: dieselben Dateien, nur die Schrift-Adresse relativ und ohne den Laufzeit-Abruf der Insights-Liste. */
export function wwwCss() { return readFileSync(join(ROOT, "website2/site.css"), "utf8").replace("url(/assets/fonts/inter-latin.woff2)", "url(../assets/fonts/inter-latin.woff2)"); }
export function wwwJs() { return readFileSync(join(ROOT, "website2/site.js"), "utf8").replace(/\n {2}\/\* LIVE:START[\s\S]*?LIVE:END \*\/\n/, "\n"); }
export function syncWww() {
  const snapshot = makeSnapshot();
  const files = wwwAssets(snapshot);
  for (const dir of ["img", "vid"]) {
    mkdirSync(join(SITE, dir), { recursive: true });
    for (const f of readdirSync(join(SITE, dir))) if (!files.has(`${dir}/${f}`)) rmSync(join(SITE, dir, f));
  }
  for (const [to, from] of files) copyFileSync(join(ROOT, from), join(SITE, to));
  writeFileSync(join(SITE, "site.css"), wwwCss());
  writeFileSync(join(SITE, "site.js"), wwwJs());
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1) + "\n");
  /* Liste für landing/scripts/build.mjs und die Prüfungen in landing/ (dort ist nur landing/ ausgecheckt). */
  writeFileSync(join(SITE, "pages.json"), JSON.stringify({ schema: "vu-website-pages-1", note: "Erzeugt von products/website2/build.mjs --target www, nicht von Hand ändern.", pages: PAGES, modules: MODULES.map((m) => ({ id: m.id, name: m.name, video: m.video })), social: SOCIAL.map(([, , u]) => u), notice: legal().text, files: [...files.keys(), "site.css", "site.js", "product-icons.svg", "insights.json", "pages.json"].filter((v, i, a) => a.indexOf(v) === i).sort() }, null, 1) + "\n");
  return snapshot;
}

/* www vollständig auffrischen: Auszug, Dateien unter landing/site/ und die 17 Seiten. Gibt die geänderten Seiten zurück.
   Auch products/insights/build.mjs ruft das nach jedem Bau auf, damit ein neuer Artikel, ein neues Heft oder ein neuer
   Report im selben Commit auf www erscheint (Wächter: Test W2-14). */
export function writeWww() {
  const pages = buildWww(syncWww()), changed = [];
  for (const [p, html] of pages) {
    const file = join(LANDING, p);
    if (existsSync(file) && readFileSync(file, "utf8") === html) continue;
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, html); changed.push(`landing/${p}`);
  }
  return { pages: pages.size, changed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const target = arg("--target") || "research", out = arg("--out");
  if (!["research", "www"].includes(target)) throw new Error("Ziel: research oder www.");
  if (target === "www" && !out) {
    const r = writeWww();
    console.log(`website2 (www): ${r.pages} Seiten nach ${LANDING}, geändert: ${r.changed.length}`);
  } else {
    const pages = target === "www" ? buildWww(loadSnapshot()) : buildSite();
    const dir = out || join(ROOT, "website2");
    for (const [p, html] of pages) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), html); }
    console.log(`website2 (${target}): ${pages.size} Seiten nach ${dir}`);
  }
}

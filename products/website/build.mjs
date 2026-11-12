/* Vision Universe · Website (Kino-Variante K1, Owner 12.11.2026).
   Baut die öffentliche Produktseite mit allen Unterseiten als statisches HTML nach /website/.
   Vorschau zuerst im geschützten Bereich research.visionuniverse.de/website/ (Passwortmaske beim Ausrollen,
   noindex); der spätere Umzug auf www.visionuniverse.de ist ein eigener Schritt.

   Regeln (Owner 12.11.2026): App noch nicht verfügbar, daher nirgends ein Link in die App, überall
   „App bald verfügbar“ und Newsletter. Social Media nur Instagram und TikTok. Preise ausgeblendet.
   Wortwahl nach docs/legal/WORTWAHL.md, Pflichtsatz aus assets/legal-notices.json.

     node products/website/build.mjs              schreibt website/<seite>/index.html
     node products/website/build.mjs --out DIR    schreibt nach DIR (Tests)

   Bilder, site.css und site.js liegen von Hand unter website/ und werden hier nicht erzeugt. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "/website/";
const NEWSLETTER = "https://www.visionuniverse.de/#newsletter";
export const SOCIAL = [
  ["instagram", "Instagram", "https://www.instagram.com/app.visionuniverse/"],
  ["tiktok", "TikTok", "https://www.tiktok.com/@app.visionuniverse"]
];
const MEDIA = "/landing/partner/media/";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ---------- Symbole ---------- */
const GLYPH = {
  mail: '<path d="M3 6.5h18v11H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m3.5 7 8.5 6.5L20.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  apple: '<path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8C7 7.2 5.6 8.1 4.8 9.5c-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.3 2.8 2.3s1.6-.7 3-.7 1.8.7 3 .7 2-1.1 2.7-2.2c.9-1.3 1.2-2.5 1.2-2.6 0 0-2.3-.9-2.3-3.6zM14.2 5.7c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.8 1 .1 2.1-.5 2.8-1.3z"/>',
  gplay: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M5 3.5v17l9-8.5zM5 3.5l12 7-3 2M5 20.5l12-7-3-1.5"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/>',
  tiktok: '<path fill="currentColor" d="M16.6 3h-3v12.1a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a5.7 5.7 0 1 0 4.8 5.6V9.2a7 7 0 0 0 3.9 1.2V7.3A4 4 0 0 1 16.6 3z"/>',
  spark: '<path fill="currentColor" d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5zM18.5 15c.2 1.8 1.1 2.7 2.9 2.9-1.8.2-2.7 1.1-2.9 2.9-.2-1.8-1.1-2.7-2.9-2.9 1.8-.2 2.7-1.1 2.9-2.9z"/>',
  book: '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1v13c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1zM12 6.5v13"/>',
  users: '<circle cx="9" cy="8.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.6c1.8.6 3 2.2 3.5 4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9 12 2.2 2.2L15.5 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="4" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="13" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="7" height="7" rx="2" fill="currentColor"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  help: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/>'
};
const g = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[n]}</svg>`;
/* Modul-Symbole aus dem zentralen Sprite der App (assets/product-icons.svg); AI Atlas hat dort keins. */
const mi = (id) => (id === "atlas" ? g("spark") : `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/product-icons.svg#${id}"/></svg>`);
const ico = (id, cls = "") => `<span class="ico${cls ? " " + cls : ""}">${mi(id)}</span>`;

/* ---------- Inhalte ---------- */
/* Fragen und Texte nach docs/legal/WORTWAHL.md: beschreiben statt auffordern, keine Empfehlung, keine Signale. */
export const MODULES = [
  { id: "discover", name: "Discover", q: "Was bewegt die Börse heute?", step: "finden", shot: "discover", video: "discover",
    lead: "Der Einstieg in den Markt: die größten Bewegungen des Tages, Themenwelten von KI bis Raumfahrt und jede Aktie auf einer Seite erklärt.",
    points: ["Größte Anstiege und Rückgänge des Tages, mit dem Grund in einem Satz", "Themenwelten: KI, Halbleiter, Raumfahrt, Energie und viele mehr", "Jede Aktie mit Steckbrief: Was macht die Firma, wie lief der Kurs?"] },
  { id: "screener", name: "Screener", q: "Welche Aktien erfüllen meine Filter?", step: "finden", shot: null, video: "screener",
    lead: "Aus über 6.000 US-Aktien die eigene Auswahl filtern. Kennzahlen stellst du als Satz ein, das Ergebnis steht sofort da.",
    points: ["Filter als Satz: „Umsatzwachstum über 20 % und KGV unter 30“", "Über 6.000 US-Aktien, jeden Handelstag neu berechnet", "Filter speichern und später wieder aufrufen"] },
  { id: "quant", name: "Quant", q: "Wie gut ist die Aktie im Vergleich?", step: "pruefen", shot: "nvda-quant", video: "quant",
    lead: "Sieben Eigenschaften je Aktie, jeden Tag gegen alle US-Aktien gemessen, von 0 bis 100. 86 heißt: besser als 86 von 100 US-Aktien.",
    points: ["Verdient gut, wächst, Zahlen solide, Kurs läuft, günstig, ruhiger Kurs, Analysten", "Jede Zahl mit einem Satz Erklärung", "Bewusst keine Gesamtnote: Quant beschreibt, es bewertet nicht für dich"] },
  { id: "fundamental", name: "Fundamental", q: "Verdient die Firma wirklich Geld?", step: "pruefen", shot: "nvda-fundamental", video: "fundamental",
    lead: "Umsatz, Gewinn und Cashflow über viele Jahre, direkt aus den Pflichtberichten an die US-Börsenaufsicht SEC.",
    points: ["Das Geschäft in einem Satz: wächst es, verdient es?", "Umsatz, Gewinn, Cashflow und Marge als Balken über die Jahre", "Börsenwert, KGV und Vergleich mit dem Markt"] },
  { id: "technical", name: "Technical", q: "Was zeigt der Chart?", step: "chart", shot: "nvda-technical", video: "technical",
    lead: "Der Chart in Worten: Trend, wichtige Linien und bekannte Muster, verständlich beschrieben statt nur gezeichnet.",
    points: ["Trend und 200-Tage-Linie auf einen Blick", "Bekannte Chartmuster, nach festen Regeln erkannt", "Jedes Muster mit Datum und Erklärung"] },
  { id: "elliott", name: "Elliott", q: "In welcher Welle steht der Kurs?", step: "chart", shot: "nvda-elliott", video: "elliott",
    lead: "Märkte bewegen sich in Wellen. Elliott zeigt die Wellenstruktur, aber nur dort, wo sich die Wellen sauber zählen lassen.",
    points: ["Wellenzählung nach den Regeln von R. N. Elliott", "Ehrlich: keine Zählung, wenn die Struktur unklar ist", "Zonen laut Methode, ohne Kursziel"] },
  { id: "supertrader", name: "Supertrader", q: "Nach welchen Regeln handeln bekannte Trader?", step: "lernen", shot: "supertrader", video: "supertrader",
    lead: "13 Methoden bekannter Trader als feste Regeln, jeden Handelstag auf alle US-Aktien angewendet. Du siehst, welche Aktie welche Regel erfüllt.",
    points: ["13 Methoden, von Minervini bis Weinstein", "Täglich geprüft: welche Aktien die Regeln erfüllen", "Backtests als Forschung, nicht zertifiziert"] },
  { id: "hedgefonds", name: "Hedgefonds", q: "Was haben große Fonds gemeldet?", step: "lernen", shot: "hedgefonds", video: "hedgefonds",
    lead: "Was Warren Buffett und andere große Investoren in ihren Pflichtmeldungen an die SEC (13F) angeben, übersichtlich je Fonds und je Aktie.",
    points: ["Gemeldete Depots bekannter Investoren", "Welche Fonds eine Aktie halten und wie sich das verändert hat", "Mit Meldedatum: 13F-Meldungen kommen mit Verzögerung"] },
  { id: "portfolios", name: "Portfolios", q: "Halten Musterdepots ihre Regeln?", step: "lernen", shot: "portfolios", video: null,
    lead: "Musterdepots ohne echtes Geld, die den Regeln von Supertrader und Quant folgen. Jede Aufnahme und Abgabe ist offen nachvollziehbar.",
    points: ["Rechenmodell, kein echtes Geld", "Jede Aufnahme und Abgabe mit Datum und Regel", "Vergleich mit dem S&P 500, als Forschung beschriftet"] },
  { id: "vorsorge", name: "Vorsorge", q: "Was wird aus meiner Rente?", step: "planen", shot: "vorsorge", video: "vorsorge",
    lead: "Die eigene Altersvorsorge einfach durchrechnen: Sparplan ab 10 € im Monat, ETFs in einem Satz erklärt, Förderung und Rentenlücke.",
    points: ["Sparplan-Rechner: was aus 10, 50 oder 200 € im Monat werden kann", "ETFs verstehen: Kosten, Inhalt, Anbieter", "Förderung und Rentenlücke in klaren Zahlen"] },
  { id: "insights", name: "Insights", q: "Was steckt hinter den Schlagzeilen?", step: "planen", shot: "insights", video: null,
    lead: "Jeden Werktag neue Artikel zu Aktien und Themen, dazu das Aktienmagazin und ausführliche Aktienreports.",
    points: ["Tagesartikel zu großen Werten und Nebenwerten", "Das Aktienmagazin", "Aktienreports"] },
  { id: "atlas", name: "AI Atlas", q: "Frag in deinen Worten.", step: "planen", shot: null, video: "atlas",
    lead: "Stell deine Frage so, wie du sie einem Freund stellen würdest. Atlas antwortet mit den Daten der App und nennt die Quelle.",
    points: ["Fragen in eigenen Worten", "Antworten aus den Daten der App, mit Quelle und Datum", "Keine Anlageberatung, keine Empfehlung"] }
];
const MOD = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const modHref = (id) => (id === "insights" ? `${BASE}insights/` : `${BASE}funktionen/${id}/`);
const STEPS = [
  ["finden", "Schritt 1 · Finden", "Die richtigen Aktien finden."],
  ["pruefen", "Schritt 2 · Prüfen", "Verstehen, was in einer Aktie steckt."],
  ["chart", "Schritt 3 · Chart lesen", "Den Kursverlauf einordnen."],
  ["lernen", "Schritt 4 · Lernen", "Von bekannten Investoren und Methoden lernen."],
  ["planen", "Schritt 5 · Planen und lesen", "Fragen stellen, Vorsorge planen, Hintergründe lesen."]
];
const PERSONAS = [
  { id: "sparplan", icon: "vorsorge", title: "Sparplan ab 10 €", who: "Du willst anfangen und verstehen, was du kaufst.", mods: ["vorsorge", "discover", "fundamental"],
    text: "Du brauchst kein Fachwissen. Vision Universe erklärt in einfachen Worten, was ein ETF ist, was er kostet und was aus einem kleinen Sparplan über die Jahre werden kann." },
  { id: "privatanleger", icon: "discover", title: "Privatanleger", who: "Du hast ein Depot und willst deine Aktien besser verstehen.", mods: ["discover", "quant", "screener"],
    text: "Jede Aktie auf einer Seite: Was macht die Firma, verdient sie Geld, wie schneidet sie im Vergleich ab? Mit eigenen Filtern findest du Aktien, die deine Bedingungen erfüllen." },
  { id: "trader", icon: "technical", title: "Trader", who: "Du arbeitest mit Charts, Mustern und festen Regeln.", mods: ["technical", "supertrader", "elliott"],
    text: "Chartmuster nach festen Regeln, 13 Methoden bekannter Trader und Elliott-Wellen, jeden Handelstag auf alle US-Aktien angewendet. Ohne Kursziele, mit Datum und Regelversion." },
  { id: "profis", icon: "hedgefonds", title: "Profi-Investoren", who: "Du willst Tiefe: SEC-Daten, 13F, Backtests.", mods: ["hedgefonds", "quant", "fundamental"],
    text: "Zahlen direkt aus den SEC-Berichten, 13F-Meldungen großer Fonds, Faktoren gegen das ganze US-Universum und Backtests mit offener Methodik." }
];
const VIDEOS = [
  ["start", "Vision Universe in 30 Sekunden", "Start"], ["discover", "Discover in 30 Sekunden", "Discover"], ["screener", "Screener in 30 Sekunden", "Screener"],
  ["quant", "Quant in 30 Sekunden", "Quant"], ["fundamental", "Fundamental in 30 Sekunden", "Fundamental"], ["technical", "Technical in 30 Sekunden", "Technical"],
  ["elliott", "Elliott in 30 Sekunden", "Elliott"], ["supertrader", "Supertrader in 30 Sekunden", "Supertrader"], ["hedgefonds", "Hedgefonds in 30 Sekunden", "Hedgefonds"],
  ["vorsorge", "Vorsorge in 30 Sekunden", "Vorsorge"], ["atlas", "AI Atlas in 30 Sekunden", "AI Atlas"]
];
const FAQ = [
  ["Was ist Vision Universe?", "Eine Analyse-App für Aktien, ETFs und Vorsorge. Elf Module arbeiten auf einer gemeinsamen Datenbasis und erklären jede Zahl in klaren Worten, vom ersten Sparplan bis zur Profi-Analyse."],
  ["Wann kommt die App?", "Bald, für iPhone und Android. Wer den Newsletter abonniert, erfährt als Erstes vom Start."],
  ["Ist das eine Anlageberatung?", "Nein. Vision Universe ist eine Software zur Analyse von Aktien. Die Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich. Es gibt keine Kauf- oder Verkaufsempfehlungen und keine Kursziele."],
  ["Woher kommen die Daten?", "Geschäftszahlen aus den Pflichtberichten an die US-Börsenaufsicht SEC, Tageskurse von einem Marktdatenanbieter, Fondsbestände aus 13F-Meldungen. Jede Zahl steht mit Datum."],
  ["Kann ich bei Vision Universe Aktien kaufen?", "Nein. Vision Universe ist kein Broker. Gekauft wird bei deiner Bank oder deinem Broker. Vision Universe hilft dir zu verstehen, was in einer Aktie steckt."],
  ["Was kostet die App?", "Zum Start ist Vision Universe kostenlos. Bevor sich daran etwas ändert, sagen wir es rechtzeitig."],
  ["Auf welchen Geräten läuft Vision Universe?", "Auf iPhone und Android, dazu im Browser auf Tablet und Desktop. Merkliste, Filter und Sparplan sind in deinem Konto auf allen Geräten gleich."]
];
const NAV = [["Funktionen", "funktionen/"], ["Für wen", "fuer-wen/"], ["Insights", "insights/"], ["Videos", "videos/"], ["Über uns", "ueber-uns/"]];

function legal() {
  const j = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
  return { text: j.notices.footer.text, links: j.links };
}

/* ---------- Bausteine ---------- */
const soon = (ink) => `<span class="soon${ink ? " ink" : ""}"><i></i>App bald verfügbar</span>`;
const badges = () => `<div class="badges" aria-label="App bald verfügbar"><span class="badge">${g("apple")}<span><small>Bald im</small><b>App Store</b></span></span><span class="badge">${g("gplay")}<span><small>Bald bei</small><b>Google Play</b></span></span></div>`;
const nlBtn = (label = "Newsletter abonnieren", cls = "") => `<a class="btn${cls ? " " + cls : ""}" href="${NEWSLETTER}">${g("mail")} ${label}</a>`;
const phone = (shot, alt, cls = "") => `<div class="phone${cls ? " " + cls : ""}"><img src="${BASE}img/app-${shot}.webp" alt="${esc(alt)}" width="585" height="1266" loading="lazy" decoding="async"></div>`;
const videoBtn = (id, label, cls = "btn ghost") => `<button type="button" class="${cls}" data-video="${MEDIA}${id}.mp4" data-poster="${MEDIA}${id}.jpg">${g("play")} ${label}</button>`;
const soc = () => `<div class="soc">${SOCIAL.map(([i, n, u]) => `<a href="${u}" rel="noopener" target="_blank" aria-label="${n}">${g(i)}</a>`).join("")}</div>`;

function header(active) {
  return `<a class="skip" href="#inhalt">Zum Inhalt</a>
<header class="hdr"><div class="wrap"><a class="logo" href="${BASE}" aria-label="Vision Universe Startseite"><img src="${BASE}img/logo-hell.png" alt="Vision Universe" width="844" height="71"></a>
<nav class="nav" aria-label="Hauptmenü">${NAV.map(([n, h]) => `<a href="${BASE}${h}"${active === h ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
<div class="right">${soon()}${nlBtn("Newsletter", "sm")}<button class="burger" type="button" data-menu="open" aria-controls="menu" aria-expanded="false" aria-label="Menü öffnen">${g("menu")}</button></div></div></header>
<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menü"><div class="top"><a class="logo" href="${BASE}"><img src="${BASE}img/logo-hell.png" alt="Vision Universe" width="844" height="71"></a><button class="burger" type="button" data-menu="close" aria-label="Menü schließen" style="display:grid">${g("close")}</button></div>
<nav aria-label="Menü">${[["Start", ""], ...NAV, ["Daten und Methodik", "daten/"], ["App", "app/"], ["Häufige Fragen", "faq/"], ["Kontakt", "kontakt/"]].map(([n, h]) => `<a href="${BASE}${h}">${n}<span>→</span></a>`).join("")}</nav>
<div class="bottom">${nlBtn()}<div style="display:flex;justify-content:center">${soon()}</div>${soc()}</div></div>`;
}

function footer() {
  const L = legal();
  const cols = [
    ["Produkt", [["Funktionen", `${BASE}funktionen/`], ["Für wen", `${BASE}fuer-wen/`], ["Videos", `${BASE}videos/`], ["App (bald)", `${BASE}app/`], ["Newsletter", NEWSLETTER]]],
    ["Module", [...["discover", "quant", "fundamental", "technical", "vorsorge"].map((id) => [MOD[id].name, modHref(id)]), ["Alle 11 Module", `${BASE}funktionen/`]]],
    ["Wissen", [["Insights", `${BASE}insights/`], ["Aktienmagazin", "/insights/magazin/"], ["Aktienreports", "/insights/reports/"], ["Daten und Methodik", `${BASE}daten/`], ["Häufige Fragen", `${BASE}faq/`]]],
    ["Unternehmen", [["Über uns", `${BASE}ueber-uns/`], ["Kontakt", `${BASE}kontakt/`], ["Impressum", L.links.impressum], ["Datenschutz", L.links.datenschutz], ["Nutzungsbedingungen", L.links.bedingungen], ["Risikohinweise", L.links.risikohinweise]]]
  ];
  return `<footer class="foot"><div class="wrap"><div class="cols"><div class="brand"><a class="logo" href="${BASE}"><img src="${BASE}img/logo-hell.png" alt="Vision Universe" width="844" height="71"></a><p>Die Analyse-App für Aktien, ETFs und Vorsorge. Bald für iPhone und Android.</p>${soc()}</div>
${cols.map(([t, l]) => `<div><h4>${t}</h4><ul>${l.map(([n, h]) => `<li><a href="${h}">${n}</a></li>`).join("")}</ul></div>`).join("\n")}</div>
<div class="legal"><p>${esc(L.text)}</p><p>© 2026 Vision Universe®</p></div></div></footer>`;
}

const nlBlock = () => `<section><div class="wrap"><div class="nl" id="newsletter"><div><div class="kick ink">App bald verfügbar</div><div class="h2">App-Start nicht verpassen.</div><p>Trag dich in den Newsletter ein und erfahre als Erstes, wann Vision Universe im App Store und bei Google Play startet. Dazu neue Research-Inhalte per E-Mail.</p></div><div class="act">${nlBtn("Newsletter abonnieren", "ink")}<small>Anmeldung auf www.visionuniverse.de · Bestätigung per E-Mail, Abmeldung jederzeit.</small></div></div></div></section>`;
const trust = () => `<section><div class="wrap trust">${[["Daten statt Meinung", "Zahlen aus den Pflichtberichten an die SEC und echte Tageskurse."], ["Täglich aktuell", "Jede Zahl mit Datum, an jedem Handelstag neu berechnet."], ["Verständlich", "Jede Bewertung in einem Satz erklärt."], ["Keine Empfehlung", "Wir zeigen, was die Daten sagen. Entscheiden tust du."]].map(([t, s]) => `<div><b>${t}</b><p>${s}</p></div>`).join("")}</div></section>`;
const modGrid = () => `<div class="mods">${MODULES.map((m) => `<a class="mod${m.id === "atlas" ? " atlas" : ""}" href="${modHref(m.id)}">${ico(m.id)}<b>${m.name}</b><span class="q">${m.q}</span></a>`).join("")}</div>`;
const strip = (ids) => `<div class="strip">${ids.map((id) => { const m = MOD[id]; return `<a href="${modHref(id)}">${phone(m.shot, `${m.name} in der App`, "sm")}<div class="cap"><b>${m.name}</b><div>${m.q}</div></div></a>`; }).join("")}</div>`;
const nextMods = (skip) => `<div class="next">${MODULES.filter((m) => m.id !== skip).map((m) => `<a href="${modHref(m.id)}">${ico(m.id)}${m.name}</a>`).join("")}</div>`;

/* Unterseiten prominent auf der Startseite (Owner 12.11.2026: „gehen unten in der Fußzeile unter“). */
const EXPLORE = [
  { href: "funktionen/", tag: "Funktionen", title: "Alle elf Module im Überblick", text: "Von Discover bis Vorsorge: welche Frage jedes Modul beantwortet und wie es aussieht.", img: null, icons: true, big: true },
  { href: "insights/", tag: "Insights", title: "Artikel, Aktienmagazin und Reports", text: "Jeden Werktag neue Artikel zu Aktien und Themen.", img: null, lime: true },
  { href: "fuer-wen/", tag: "Für wen", title: "Vom ersten Sparplan bis zum Profi", text: "Vier Wege in die App, je nachdem, wo du stehst.", img: "kino-saal.webp" },
  { href: "videos/", tag: "Videos", title: "Jedes Modul in 30 Sekunden", text: "Kurze Erklärvideos zu allen Modulen.", img: null, poster: "start" },
  { href: "daten/", tag: "Daten und Methodik", title: "Woher jede Zahl kommt", text: "SEC-Berichte, Tageskurse, 13F-Meldungen. Keine Zahl ohne Quelle.", img: "kino-podium.webp" }
];
function exploreCards() {
  return `<div class="explore">${EXPLORE.map((x) => {
    const bg = x.img ? `<img src="${BASE}img/${x.img}" alt="" loading="lazy">` : x.poster ? `<img src="${MEDIA}${x.poster}.jpg" alt="" loading="lazy">` : "";
    const ics = x.lime ? `<div class="ics">${ico("insights")}</div>` : x.icons ? `<div class="ics">${MODULES.map((m) => ico(m.id)).join("")}</div>` : "";
    return `<a class="xcard${x.big ? " big" : ""}${x.lime ? " lime" : ""}" href="${BASE}${x.href}">${bg}${ics}<span class="tag">${x.tag}</span><b>${x.title}</b><p>${x.text}</p><span class="go">Ansehen →</span></a>`;
  }).join("")}</div>`;
}

function page({ path, title, desc, active, body, player }) {
  const url = `https://research.visionuniverse.de${BASE}${path}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#000000">
<meta name="vu-navigation" content="none">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Vision Universe">
<meta property="og:locale" content="de_DE">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}site.css">
<script src="${BASE}site.js" defer></script>
</head>
<body>
<!-- Erzeugt von products/website/build.mjs. Nicht von Hand ändern. -->
${header(active)}
<main id="inhalt">
${body}
</main>
${footer()}
${player ? `<dialog class="player" id="player" aria-label="Video"><button type="button" aria-label="Video schließen">×</button><video controls playsinline preload="none"></video></dialog>` : ""}
</body>
</html>
`;
}

/* ---------- Startseite (K1) ---------- */
function home() {
  const feature = (id, title, text, flip) => { const m = MOD[id]; return `<div class="feature${flip ? " flip" : ""}"><div class="txt"><div class="kick">${m.name}</div><div class="h2">${title}</div><p class="lead">${text}</p><div class="row" style="margin-top:22px"><a class="btn ghost sm" href="${modHref(id)}">Mehr zu ${m.name} →</a></div></div><div class="media">${phone(m.shot, `${m.name} am Beispiel NVIDIA`)}</div></div>`; };
  const body = `<div class="hero"><img src="${BASE}img/kino-hero.webp" alt="" width="900" height="1600" fetchpriority="high">
<div class="wrap"><div class="txt"><div class="kick">Vision Universe · Die Analyse-App</div><h1 class="h1">Die Börse ist laut.<br>Wir bringen <span class="lime">Ordnung</span> hinein.</h1>
<p class="lead">Die Analyse-App für Aktien, ETFs und Vorsorge: elf Module auf einer Datenbasis, jede Zahl erklärt. Bald für iPhone und Android.</p>
${badges()}
<div class="row">${nlBtn()}${videoBtn("start", "Film ansehen · 0:30")}</div>
<div class="soonrow">${soon()}</div></div></div></div>

<section style="padding-top:8px"><div class="wrap"><nav class="quick" aria-label="Schnellzugriff">${[["grid", "Funktionen", "funktionen/"], ["book", "Insights", "insights/"], ["users", "Für wen", "fuer-wen/"], ["film", "Videos", "videos/"], ["shield", "Daten und Methodik", "daten/"], ["phone", "App", "app/"], ["help", "Häufige Fragen", "faq/"]].map(([i, n, h]) => `<a href="${BASE}${h}">${g(i)}${n}</a>`).join("")}</nav></div></section>

<section><div class="wrap"><div class="kick">Elf Module, eine App</div><div class="sec-head"><h2 class="h2">Jedes Modul beantwortet eine Frage.</h2><a class="more" href="${BASE}funktionen/">Alle Funktionen →</a></div>${modGrid()}</div></section>

<section style="padding-top:0"><div class="wrap">
${feature("fundamental", "Verdient die Firma wirklich Geld?", "Umsatz, Gewinn und Cashflow über die Jahre, direkt aus den Pflichtberichten an die US-Börsenaufsicht. Beispiel NVIDIA: Umsatz +83 % in 12 Monaten, von 100 $ Umsatz bleiben 63,66 $ Gewinn.")}
${feature("quant", "Wie gut ist die Aktie im Vergleich?", "Sieben Eigenschaften, jeden Tag gegen alle US-Aktien gemessen, von 0 bis 100. NVIDIA verdient besser als 99 % aller US-Aktien, liegt bei soliden Zahlen aber nur im Mittelfeld.", 1)}
<p class="small mute" style="margin-top:26px">Beispiel NVIDIA, Datenstand 11.11.2026. Keine Anlageberatung, keine Empfehlung.</p>
</div></section>

<section><div class="wrap"><div class="kick">Und so sehen die anderen Module aus</div>${strip(["discover", "technical", "supertrader", "hedgefonds", "portfolios", "vorsorge", "insights"])}</div></section>

<section><div class="wrap"><div class="kick">Mehr entdecken</div><div class="sec-head"><h2 class="h2">Alles über Vision Universe.</h2></div>${exploreCards()}</div></section>

${trust()}
${nlBlock()}`;
  return page({ path: "", title: "Vision Universe – Die Börse ist laut. Wir bringen Ordnung hinein.", desc: "Die Analyse-App für Aktien, ETFs und Vorsorge: elf Module auf einer Datenbasis, jede Zahl erklärt. Bald für iPhone und Android.", active: "", body, player: 1 });
}

/* ---------- Funktionen ---------- */
function funktionen() {
  const body = `<div class="wrap"><div class="phero"><div class="kick">Funktionen</div><h1 class="h1">Elf Module. Eine Datenbasis.</h1><p class="lead">Vision Universe begleitet dich von der ersten Idee bis zum Verständnis einer Aktie. Jedes Modul beantwortet eine Frage, alle rechnen mit denselben Daten.</p></div>
${modGrid()}
${STEPS.map(([k, kick, t]) => { const ms = MODULES.filter((m) => m.step === k); return `<div class="phase"><div class="kick">${kick}</div><h2 class="h3">${t}</h2><div class="cards${ms.length === 2 ? " c2" : ""}">${ms.map((m) => `<a class="card" href="${modHref(m.id)}">${ico(m.id)}<b>${m.name}</b><p>${m.lead}</p><span class="go">Mehr erfahren →</span></a>`).join("")}</div></div>`; }).join("")}
</div>${nlBlock()}`;
  return page({ path: "funktionen/", title: "Funktionen · Vision Universe", desc: "Elf Module auf einer Datenbasis: Discover, Screener, Quant, Fundamental, Technical, Elliott, Supertrader, Hedgefonds, Portfolios, Vorsorge, Insights und AI Atlas.", active: "funktionen/", body });
}

function modulPage(m) {
  const media = m.shot ? phone(m.shot, `${m.name} in der App`) : `<button type="button" class="vid" style="width:300px" data-video="${MEDIA}${m.video}.mp4" data-poster="${MEDIA}${m.video}.jpg"><div class="th"><img src="${MEDIA}${m.video}.jpg" alt="${esc(m.name)} im Video" loading="lazy"><i>${g("play")}</i><s>0:30</s></div><b>${m.name} in 30 Sekunden</b></button>`;
  const vid = m.video && m.shot ? `<div class="vbig"><button type="button" class="vid" data-video="${MEDIA}${m.video}.mp4" data-poster="${MEDIA}${m.video}.jpg"><div class="th"><img src="${MEDIA}${m.video}.jpg" alt="" loading="lazy"><i>${g("play")}</i><s>0:30</s></div><b>${m.name} in 30 Sekunden</b></button><div><div class="kick">Video</div><h2 class="h3" style="margin-top:12px">${m.name}, kurz erklärt.</h2><p class="lead">Ein kurzer Film zeigt, wie das Modul arbeitet und was du auf einen Blick siehst.</p></div></div>` : "";
  const extra = {
    fundamental: `<div class="example"><div><div class="kick">Beispiel NVIDIA · 11.11.2026</div><h2 class="h3">Wächst stark und verdient sehr gut.</h2><p>Umsatz +83 % in 12 Monaten. Von 100 $ Umsatz bleiben 63,66 $ Gewinn. Umsatz im Geschäftsjahr 2026: 216 Mrd. $.</p><p class="small mute">Keine Empfehlung: Fundamental beschreibt die Geschäftszahlen aus den Pflichtberichten.</p></div><div style="display:flex;justify-content:center">${phone("nvda-fundamental", "Fundamental NVIDIA", "sm")}</div></div>`,
    quant: `<div class="example"><div><div class="kick">Beispiel NVIDIA · 11.11.2026</div><h2 class="h3">Verdient besser als 99 % aller US-Aktien.</h2><p>Verdient gut 99, wächst 86, ruhiger Kurs 83, günstig 62, Kurs läuft 53, Zahlen solide 44. Die Werte vergleichen NVIDIA mit rund 5.600 bewerteten US-Aktien.</p><p class="small mute">Keine Empfehlung: Quant beschreibt Eigenschaften im Vergleich zu allen US-Aktien. Eine Gesamtnote gibt es bewusst nicht.</p></div><div style="display:flex;justify-content:center">${phone("nvda-quant", "Quant NVIDIA", "sm")}</div></div>`,
    vorsorge: `<div class="example"><div><div class="kick">Sparplan</div><h2 class="h3">Mit 10 € im Monat anfangen.</h2><p>Betrag wählen, sehen, was daraus werden kann, den ETF in einem Satz verstehen. Eingerichtet wird der Sparplan bei deiner Bank oder deinem Broker.</p><p class="small mute">Rechenbeispiele beruhen auf Annahmen und sind keine Prognose.</p></div><div style="display:flex;justify-content:center">${phone("vorsorge-plan", "Sparplan in der App", "sm")}</div></div>`,
    supertrader: `<p class="note">Backtests der Methoden sind Forschung, nicht zertifiziert. Frühere und simulierte Ergebnisse sind kein verlässlicher Hinweis auf die Zukunft.</p>`,
    portfolios: `<p class="note">Rechenmodell, kein echtes Geld. Frühere und simulierte Ergebnisse sind kein verlässlicher Hinweis auf die Zukunft.</p>`,
    hedgefonds: `<p class="note">13F-Meldungen sind Angaben der Fonds an die SEC und erscheinen bis zu 45 Tage nach Quartalsende.</p>`
  }[m.id] || "";
  const body = `<div class="wrap"><div class="phero split"><div><nav class="crumb" aria-label="Pfad"><a href="${BASE}funktionen/">Funktionen</a><span>/</span><span>${m.name}</span></nav>${ico(m.id, "lg")}<div class="kick" style="margin-top:18px">Modul · ${m.name}</div><h1 class="h1">${m.q}</h1><p class="lead">${m.lead}</p><div class="row" style="margin-top:24px">${nlBtn()}${m.video ? videoBtn(m.video, "Video · 0:30") : ""}</div></div><div style="display:flex;justify-content:center">${media}</div></div>
<section><div class="kick">Was du siehst</div><div class="steps">${m.points.map((p, i) => `<div class="step"><em>${i + 1}</em><p style="color:#fff;font-weight:700;font-size:17px;margin-top:12px">${p}</p></div>`).join("")}</div>${extra}</section>
${vid ? `<section>${vid}</section>` : ""}
<section><div class="kick">Weitere Module</div>${nextMods(m.id)}</section></div>
${nlBlock()}`;
  return page({ path: `funktionen/${m.id}/`, title: `${m.name} · ${m.q} · Vision Universe`, desc: m.lead, active: "funktionen/", body, player: !!m.video });
}

/* ---------- Für wen ---------- */
function fuerWen() {
  const body = `<div class="wrap"><div class="phero"><div class="kick">Für wen</div><h1 class="h1">Vom ersten Sparplan bis zum Profi.</h1><p class="lead">Einsteiger sehen zuerst die Antwort, Profis zuerst die Daten. Dieselbe App, vier Wege hinein.</p></div>
${PERSONAS.map((p, i) => `<section id="${p.id}"><div class="example" style="margin-top:0;${i % 2 ? "" : ""}"><div>${ico(p.icon, "lg")}<div class="kick" style="margin-top:18px">${p.title}</div><h2 class="h3">${p.who}</h2><p>${p.text}</p><div class="next">${p.mods.map((id) => `<a href="${modHref(id)}">${ico(id)}${MOD[id].name}</a>`).join("")}</div></div><div style="display:flex;justify-content:center">${phone(MOD[p.mods[0]].shot, `${MOD[p.mods[0]].name} in der App`, "sm")}</div></div></section>`).join("")}
<section><div class="card lime" style="padding:28px"><b style="font-size:26px">Auch für Gruppen</b><p>Vereine, Investmentclubs und Unternehmen: eine gemeinsame Datenbasis für jede Diskussion. Schreib uns über die <a href="${BASE}kontakt/" style="text-decoration:underline">Kontaktseite</a>.</p></div></section></div>
${nlBlock()}`;
  return page({ path: "fuer-wen/", title: "Für wen · Vision Universe", desc: "Vom ersten 10-€-Sparplan bis zum Profi-Investor: vier Wege in Vision Universe.", active: "fuer-wen/", body });
}

/* ---------- Videos ---------- */
function videos() {
  const v = ([id, t, tag]) => `<button type="button" class="vid" data-video="${MEDIA}${id}.mp4" data-poster="${MEDIA}${id}.jpg"><div class="th"><img src="${MEDIA}${id}.jpg" alt="" loading="lazy"><i>${g("play")}</i><s>0:30</s></div><b>${t}</b><span>${tag}</span></button>`;
  const body = `<div class="wrap"><div class="phero"><div class="kick">Videos</div><h1 class="h1">Jedes Modul in 30 Sekunden erklärt.</h1><p class="lead">Kurze Filme zu allen Modulen. Neue Reels erscheinen regelmäßig auf Instagram und TikTok.</p><div style="margin-top:20px">${soc()}</div></div>
<div class="vbig">${v(VIDEOS[0])}<div><div class="kick">Zum Start</div><h2 class="h2" style="margin-top:12px">Vision Universe in 30 Sekunden.</h2><p class="lead">Was die App kann und wie die elf Module zusammenarbeiten.</p></div></div>
<section><div class="kick">Die Module</div><div class="vids">${VIDEOS.slice(1).map(v).join("")}</div></section></div>
${nlBlock()}`;
  return page({ path: "videos/", title: "Videos · Vision Universe", desc: "Jedes Modul von Vision Universe in 30 Sekunden erklärt.", active: "videos/", body, player: 1 });
}

/* ---------- Insights ---------- */
function insights() {
  const body = `<div class="wrap"><div class="phero split"><div><div class="kick">Insights</div><h1 class="h1">Was steckt hinter den Schlagzeilen?</h1><p class="lead">Jeden Werktag neue Artikel zu großen Werten, Nebenwerten und Zukunftsthemen. Dazu das Aktienmagazin und ausführliche Aktienreports.</p></div><div style="display:flex;justify-content:center">${phone("insights", "Insights in der App")}</div></div>
<section><div class="kick">Neu</div><div class="sec-head"><h2 class="h2">Die neuesten Artikel.</h2><a class="more" href="/insights/">Alle Artikel →</a></div><div class="feed" data-feed="6"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div></section>
<section><div class="kick">Mehr lesen</div><div class="cards c2"><a class="card" href="/insights/magazin/">${ico("insights")}<b>Aktienmagazin</b><p>Das Heft mit den Themen der Woche: ausgewählte Aktien, Hintergründe und Zahlen, geprüft vor dem Erscheinen.</p><span class="go">Zum Aktienmagazin →</span></a><a class="card" href="/insights/reports/">${ico("fundamental")}<b>Aktienreports</b><p>Ausführliche Reports zu einzelnen Aktien: Geschäft, Zahlen, Bewertung und Risiken auf einen Blick.</p><span class="go">Zu den Reports →</span></a></div>
<p class="note">Artikel, Magazin und Reports beschreiben Unternehmen und Zahlen. Sie sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung.</p></section></div>
${nlBlock()}`;
  return page({ path: "insights/", title: "Insights · Artikel, Aktienmagazin und Reports · Vision Universe", desc: "Jeden Werktag neue Artikel zu Aktien und Themen, dazu das Aktienmagazin und Aktienreports.", active: "insights/", body });
}

/* ---------- App (bald) ---------- */
function app() {
  const body = `<div class="wrap"><div class="phero split"><div><div class="kick">App</div><h1 class="h1">Bald im App Store und bei Google Play.</h1><p class="lead">Vision Universe kommt als App für iPhone und Android. Bis dahin: Newsletter abonnieren, dann erfährst du als Erstes vom Start.</p><div style="margin-top:24px">${badges()}</div><div class="row" style="margin-top:14px">${nlBtn()}${soon()}</div></div><div class="duo" style="display:flex;justify-content:center;gap:18px;align-items:flex-end">${phone("nvda-ueberblick", "Aktienseite NVIDIA in der App", "sm")}${phone("discover", "Discover in der App")}</div></div>
<section><div class="kick">In drei Schritten zum App-Start</div><div class="steps">${[["Newsletter abonnieren", "Auf www.visionuniverse.de mit deiner E-Mail-Adresse."], ["E-Mail bestätigen", "Ein Klick auf den Link in der Bestätigungsmail."], ["Als Erstes Bescheid bekommen", "Zum Start kommt eine E-Mail mit dem Link zur App."]].map(([t, s], i) => `<div class="step"><em>${i + 1}</em><b>${t}</b><p>${s}</p></div>`).join("")}</div></section>
<section><div class="kick">Eine App, jedes Gerät</div><div class="cards c4">${[["iPhone", "Bald im App Store."], ["Android", "Bald bei Google Play."], ["Tablet", "Zwei Spalten: Liste links, Aktie rechts."], ["Desktop", "Volle Breite für Charts und Filter."]].map(([t, s]) => `<div class="card"><b>${t}</b><p>${s}</p></div>`).join("")}</div></section></div>
${nlBlock()}`;
  return page({ path: "app/", title: "App bald verfügbar · Vision Universe", desc: "Vision Universe kommt bald in den App Store und zu Google Play.", active: "", body });
}

/* ---------- Daten und Methodik ---------- */
function daten() {
  const body = `<div class="wrap"><div class="phero"><div class="kick">Daten und Methodik</div><h1 class="h1">Woher jede Zahl kommt.</h1><p class="lead">Keine Zahl ohne Quelle und Datum. Fehlt etwas, sagen wir es, statt etwas zu erfinden.</p></div>
<div class="cards c2">${[["fundamental", "SEC-Berichte", "Umsatz, Gewinn, Bilanz und Cashflow aus den Pflichtberichten an die US-Börsenaufsicht (10-K, 10-Q)."], ["technical", "Tageskurse", "Schlusskurse eines Marktdatenanbieters, split-bereinigt, nach jedem US-Handelstag aktualisiert."], ["hedgefonds", "13F-Meldungen", "Gemeldete Bestände großer Fonds, vierteljährlich und mit Verzögerung."], ["vorsorge", "ETF-Daten", "Kosten, Bestände und Anbieter aus Primärquellen der Fondsgesellschaften und Börsen."]].map(([i, t, s]) => `<div class="card">${ico(i)}<b>${t}</b><p>${s}</p></div>`).join("")}</div>
<section><div class="kick">So rechnen wir</div><dl class="kv"><dt>Feste Regeln</dt><dd>Alle Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich.</dd><dt>Mit Datum</dt><dd>Jede Zahl trägt ihren Datenstand. Veraltete Daten werden markiert.</dd><dt>Vergleich statt Urteil</dt><dd>Quant vergleicht eine Aktie mit allen US-Aktien. Eine Gesamtnote gibt es bewusst nicht.</dd><dt>Forschung</dt><dd>Backtests heißen „Forschung, nicht zertifiziert“ und nennen Zeitraum, Kosten und Vergleich.</dd></dl></section>
<section><div class="card" style="padding:28px"><b style="font-size:24px">Was wir nicht tun</b><ul style="list-style:none;display:grid;gap:8px;margin-top:6px;color:#cfcfcf">${["Keine Kauf- oder Verkaufsempfehlungen", "Keine Kursziele", "Keine Provisionen von Banken oder Brokern", "Keine erfundenen Zahlen"].map((t) => `<li>✓ ${t}</li>`).join("")}</ul></div></section></div>
${nlBlock()}`;
  return page({ path: "daten/", title: "Daten und Methodik · Vision Universe", desc: "Woher jede Zahl in Vision Universe kommt: SEC-Berichte, Tageskurse, 13F-Meldungen und ETF-Daten.", active: "", body });
}

/* ---------- Über uns, Kontakt, FAQ ---------- */
function ueberUns() {
  const body = `<div class="wrap"><div class="phero split"><div><div class="kick">Über uns</div><h1 class="h1">Wir machen Investieren verständlich.</h1><p class="lead">Profi-Werkzeuge waren lange teuer und schwer zu lesen. Vision Universe bringt Daten und Methoden der Profis zu allen, die investieren: vom ersten Sparplan bis zum Fondsmanager.</p></div><div><img src="${BASE}img/kino-saal.webp" alt="" style="border-radius:28px;width:100%;max-height:560px;object-fit:cover" loading="lazy"></div></div>
<section><div class="cards c4">${[["Verständlich", "Jede Zahl mit einem Satz erklärt."], ["Ehrlich", "Keine Empfehlungen, keine Kursziele."], ["Unabhängig", "Keine Provisionen von Banken oder Brokern."], ["Nachprüfbar", "Jede Zahl mit Quelle und Datum."]].map(([t, s]) => `<div class="card"><b>${t}</b><p>${s}</p></div>`).join("")}</div></section>
<section><div class="kick">Folgen</div><h2 class="h3" style="margin-top:12px">Neue Reels auf Instagram und TikTok.</h2><div style="margin-top:18px">${soc()}</div></section></div>
${nlBlock()}`;
  return page({ path: "ueber-uns/", title: "Über uns · Vision Universe", desc: "Vision Universe macht Investieren verständlich: Daten und Methoden der Profis für alle.", active: "ueber-uns/", body });
}
function kontakt() {
  const L = legal();
  const body = `<div class="wrap"><div class="phero"><div class="kick">Kontakt</div><h1 class="h1">Schreib uns.</h1><p class="lead">Fragen zur App, zu den Daten oder für Gruppen und Vereine: Wir antworten so schnell wie möglich.</p></div>
<div class="cards c2"><a class="card" href="${L.links.kontakt}">${g("mail").replace("<svg", '<svg style="width:28px;height:28px;color:#c8f531"')}<b>Kontaktformular</b><p>Über das Kontaktformular von Vision Universe.</p><span class="go">Zum Kontaktformular →</span></a><div class="card"><b>Social Media</b><p>Instagram und TikTok: @app.visionuniverse</p>${soc()}</div></div></div>
${nlBlock()}`;
  return page({ path: "kontakt/", title: "Kontakt · Vision Universe", desc: "Kontakt zu Vision Universe.", active: "", body });
}
function faq() {
  const body = `<div class="wrap"><div class="phero"><div class="kick">Häufige Fragen</div><h1 class="h1">Gut zu wissen.</h1></div><div class="faq">${FAQ.map(([q, a], i) => `<details${i ? "" : " open"}><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></div>
${nlBlock()}`;
  return page({ path: "faq/", title: "Häufige Fragen · Vision Universe", desc: "Antworten auf häufige Fragen zu Vision Universe.", active: "", body });
}

/* ---------- Ausgabe ---------- */
export function buildSite() {
  const out = [
    ["index.html", home()], ["funktionen/index.html", funktionen()],
    ...MODULES.filter((m) => m.id !== "insights").map((m) => [`funktionen/${m.id}/index.html`, modulPage(m)]),
    ["fuer-wen/index.html", fuerWen()], ["videos/index.html", videos()], ["insights/index.html", insights()],
    ["app/index.html", app()], ["daten/index.html", daten()], ["ueber-uns/index.html", ueberUns()],
    ["kontakt/index.html", kontakt()], ["faq/index.html", faq()]
  ];
  return new Map(out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--out");
  const dir = i > 0 ? process.argv[i + 1] : join(ROOT, "website");
  for (const [p, html] of buildSite()) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), html); }
  console.log(`website: ${buildSite().size} Seiten nach ${dir}`);
}

/* Vision Universe · Website (Startseite „Das Plakat“, Gestaltung „Bühne und Beweis“, Owner 13.11.2026).
   Baut die öffentliche Produktseite mit allen Unterseiten als statisches HTML nach /website/.
   Vorschau zuerst im geschützten Bereich research.visionuniverse.de/website/ (Passwortmaske beim Ausrollen,
   noindex); der spätere Umzug auf www.visionuniverse.de ist ein eigener Schritt.

   Regeln (Owner 12.11. und 13.11.2026): App noch nicht verfügbar, daher nirgends ein Link in die App oder in
   einen Store. Die Original-Knöpfe von Apple und Google stehen als Bild mit „Bald verfügbar“ daneben. Der eine
   Aufruf ist „Zum Start benachrichtigen“ (Anmeldung auf www). Social Media nur Instagram und TikTok. Preise
   ausgeblendet. Wortwahl nach docs/legal/WORTWAHL.md, Pflichtsatz aus assets/legal-notices.json.

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
  { id: "screener", name: "Screener", q: "Welche Aktien erfüllen meine Bedingungen?", step: "finden", shot: null, video: "screener",
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
  ["Was ist Vision Universe?", "Eine Analyse-App für Aktien, ETFs und Vorsorge. Elf Bereiche arbeiten mit denselben Daten und erklären jede Zahl in klaren Worten, vom ersten Sparplan bis zur Profi-Analyse."],
  ["Wann kommt die App?", "Bald, für iPhone und Android. Wer sich einträgt, erfährt als Erstes vom Start."],
  ["Ist das eine Anlageberatung?", "Nein. Vision Universe ist Analyse-Software: Die Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich. Es gibt keine Kauf- oder Verkaufsempfehlungen und keine Kursziele."],
  ["Woher kommen die Daten?", "Geschäftszahlen aus den Pflichtberichten an die US-Börsenaufsicht SEC, Tageskurse von einem Marktdatenanbieter, Fondsbestände aus 13F-Meldungen. Jede Zahl steht mit Datum."],
  ["Kann ich bei Vision Universe Aktien kaufen?", "Nein. Vision Universe ist kein Broker. Gekauft wird bei deiner Bank oder deinem Broker. Vision Universe hilft dir zu verstehen, was in einer Aktie steckt."],
  ["Was kostet die App?", "Zum Start ist Vision Universe kostenlos. Bevor sich daran etwas ändert, sagen wir es rechtzeitig."],
  ["Auf welchen Geräten läuft Vision Universe?", "Auf iPhone und Android, dazu im Browser auf Tablet und Desktop. Merkliste, Filter und Sparplan sind in deinem Konto auf allen Geräten gleich."]
];
const NAV = [["Produkt", "funktionen/"], ["Insights", "insights/"], ["Für wen", "fuer-wen/"], ["Videos", "videos/"], ["Über uns", "ueber-uns/"]];

function legal() {
  const j = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
  return { text: j.notices.footer.text, links: j.links };
}

/* Vier Absichten ordnen die elf Bereiche (statt einer Schrittfolge). */
const GROUPS = [
  ["entdecken", "Entdecken", "Du suchst Ideen und willst wissen, was heute los ist.", ["discover", "screener", "atlas"]],
  ["verstehen", "Verstehen", "Du hast eine Aktie im Blick und willst sie durchleuchten.", ["fundamental", "quant", "technical", "elliott"]],
  ["methoden", "Methoden", "Du willst sehen, wie Profis und ihre Regeln arbeiten.", ["supertrader", "hedgefonds", "portfolios"]],
  ["vorsorgen", "Vorsorgen", "Du willst langfristig sparen und wissen, wohin das führt.", ["vorsorge"]]
];
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([, n, , ids]) => ids.map((id) => [id, n])));
/* „Ehrlich gesagt“: was der Bereich bewusst nicht ist (Wortwahl nach docs/legal/WORTWAHL.md). */
const HONEST = {
  discover: ["Die Reihenfolge entsteht aus Regeln.", "Was oben steht, hat sich am stärksten bewegt. Eine Wertung der Aktie ist das nicht, und die Regeln sind für alle gleich."],
  screener: ["Der Screener zeigt, was zu deinem Filter passt.", "Eine Bestenliste ist das nicht. Welche Bedingungen zählen, legst du fest."],
  quant: ["Quant beschreibt. Es bewertet nicht für dich.", "Die Balken sagen, wo eine Aktie im Vergleich steht. Eine Gesamtnote gibt es bewusst nicht."],
  fundamental: ["Fehlt eine Zahl, steht dort „keine Daten“.", "Fundamental zeigt, was in den Pflichtberichten steht. Geschätzt oder aufgefüllt wird nichts."],
  technical: ["Eine Zone ist keine Prognose.", "Technical beschreibt, was der Kurs getan hat und wo eine Regel greift. Wohin der Kurs geht, sagt es nicht."],
  elliott: ["Wellen sind eine Lesart, kein Messwert.", "Elliott zählt nur, wo die Struktur klar ist. Ist sie es nicht, steht das dort."],
  supertrader: ["Forschung, nicht zertifiziert.", "Ein Regel-Ergebnis ist keine Empfehlung. Supertrader zeigt, was eine Methode misst, nicht, was du tun sollst."],
  hedgefonds: ["Meldungen zeigen die Vergangenheit.", "13F-Meldungen kommen mit Verzögerung. Du siehst, was Fonds vor Monaten hielten, mit dem Datum groß darüber."],
  portfolios: ["Rechenmodell, kein echtes Geld.", "Die Musterdepots folgen nur ihrer Regel. Eine Wertentwicklung erscheint erst, wenn sie belastbar ist."],
  vorsorge: ["Eine Rechnung ist keine Zusage.", "Vorsorge rechnet mit Annahmen und zeigt drei Beispiele. Vision Universe verkauft keine Produkte."],
  atlas: ["Atlas rät nicht.", "Er antwortet nur aus den Daten der App und nennt die Quelle. Fehlen Daten, sagt er das."]
};
const NUMS = [["6.000+", "US-Aktien, täglich neu gerechnet"], ["7.000+", "ETFs für die Vorsorge"], ["12 Jahre", "Geschäftszahlen je Aktie"], ["13", "Methoden bekannter Trader"], ["54", "Themenwelten"]];

/* ---------- Bausteine ---------- */
const CTA = "Zum Start benachrichtigen";
const ic = (id) => mi(id).replace("<svg", '<svg class="ic"');
const hud = (id) => `<span class="hud">${mi(id)}</span>`;
const nlBtn = (cls = "", arrow = " →") => `<a class="btn${cls ? " " + cls : ""}" href="${NEWSLETTER}">${CTA}${arrow}</a>`;
/* Original-Knöpfe von Apple und Google (deutsche Fassung, unverändert). Bis zum Start ohne Link (Test WEB-3). */
const badges = (note = true) => `<div class="badges"><img src="${BASE}img/badge-apple.svg" alt="Laden im App Store" width="120" height="40"><img src="${BASE}img/badge-google.png" alt="Jetzt bei Google Play" width="175" height="52">${note ? `<span><i class="dot"></i>Bald verfügbar</span>` : ""}</div>`;
const pill = () => `<span class="pill"><i class="dot"></i>App bald verfügbar · zum Start kostenlos</span>`;
const phone = (shot, alt) => `<div class="ph"><img src="${BASE}img/app-${shot}.webp" alt="${esc(alt)}" width="585" height="1266" loading="lazy" decoding="async"></div>`;
const film = (id, label) => `<button type="button" class="film" data-video="${MEDIA}${id}.mp4" data-poster="${MEDIA}${id}.jpg" aria-label="${esc(label)} abspielen"><img src="${MEDIA}${id}.jpg" alt="" loading="lazy"><i>${g("play")}</i><s>0:30</s></button>`;
const follow = () => `<div class="follow">${SOCIAL.map(([i, n, u]) => `<a href="${u}" rel="noopener" target="_blank">${g(i)}<div>${n}<br><span>@app.visionuniverse</span></div></a>`).join("")}</div>`;
const subhero = ({ kick, h1, lead, extra = "", side = "", crumb = "" }) => `<section class="k subhero${side ? "" : " solo"}"><div class="w"><div class="stack">${crumb}<span class="kick">${kick}</span><h1 class="h1">${h1}</h1><p class="lead">${lead}</p>${extra}</div>${side}</div></section>`;
const stand = (items) => `<div class="stand">${items.map(([t, s]) => `<div><b>${t}</b><span>${s}</span></div>`).join("")}</div>`;
const pts = (items) => `<ul class="pts" style="width:100%">${items.map(([t, s], i) => `<li><i>${i + 1}</i><div><b>${t}</b><span>${s}</span></div></li>`).join("")}</ul>`;

function header(active) {
  const L = legal();
  const logo = `<a class="logo" href="${BASE}" aria-label="Vision Universe Startseite"><img src="${BASE}img/logo-hell.png" alt="Vision Universe" width="844" height="71"></a>`;
  return `<a class="skip" href="#inhalt">Zum Inhalt</a>
<header class="top"><div class="w">${logo}
<nav aria-label="Hauptmenü">${NAV.map(([n, h]) => `<a href="${BASE}${h}"${active === h ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
<div class="r"><a class="btn" href="${NEWSLETTER}"><span class="l">${CTA}</span><span class="s">Benachrichtigen</span></a><button class="burger" type="button" data-menu="open" aria-controls="menu" aria-expanded="false" aria-label="Menü öffnen">${g("menu")}</button></div></div></header>
<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menü"><div class="mtop">${logo}<button class="burger" type="button" data-menu="close" aria-label="Menü schließen">${g("close")}</button></div>
<nav id="site-panel" aria-label="Menü">${[["Start", ""], ...NAV, ["App", "app/"], ["Daten und Methodik", "daten/"], ["Häufige Fragen", "faq/"], ["Kontakt", "kontakt/"]].map(([n, h]) => `<a href="${BASE}${h}">${n}<span>→</span></a>`).join("")}
<div class="bottom">${nlBtn()}${pill()}${badges(false)}${follow()}</div>
<div class="legal-menu"><h4>Rechtliches &amp; Infos</h4><p>${esc(L.text)}</p><ul>${[["Impressum", "impressum"], ["Kontakt", "kontakt"], ["Datenschutz", "datenschutz"], ["Nutzungsbedingungen", "bedingungen"], ["Risikohinweise", "risikohinweise"]].map(([n, k]) => `<li><a href="${L.links[k]}">${n}</a></li>`).join("")}<li><a href="/infos/#quellen">Datenquellen und Methodik</a></li></ul></div></nav></div>`;
}

function footer() {
  const cols = [
    ["Produkt", [["Alle elf Bereiche", `${BASE}funktionen/`], ["Für wen", `${BASE}fuer-wen/`], ["App", `${BASE}app/`], ["Videos", `${BASE}videos/`]]],
    ["Insights", [["Artikel", `${BASE}insights/`], ["Aktienmagazin", "/insights/magazin/"], ["Aktienreports", "/insights/reports/"]]],
    ["Vertrauen", [["Daten und Methodik", `${BASE}daten/`], ["Häufige Fragen", `${BASE}faq/`], ["Über uns", `${BASE}ueber-uns/`], ["Kontakt", `${BASE}kontakt/`]]],
    ["Folgen", [...SOCIAL.map(([, n, u]) => [n, u]), ["Rechtliches &amp; Infos", "/infos/"]]]
  ];
  return `<footer class="foot"><div class="w"><div class="cols"><div><a class="logo" href="${BASE}"><img src="${BASE}img/logo-hell.png" alt="Vision Universe" width="844" height="71"></a><p>Die Analyse-App für Aktien, ETFs und Vorsorge. Klarheit statt Lärm.</p>${badges(false)}</div>
${cols.map(([t, l]) => `<div><h4>${t}</h4><ul>${l.map(([n, h]) => `<li><a href="${h}"${/^https:/.test(h) ? ' rel="noopener" target="_blank"' : ""}>${n}</a></li>`).join("")}</ul></div>`).join("\n")}</div>
<p class="legal">© 2026 Vision Universe® · Pflichthinweise und Rechtstexte im Menü unter „Rechtliches &amp; Infos“.</p></div></footer>`;
}

/* Abschluss jeder Seite: die eine grüne Fläche. Die Anmeldung läuft über www (Brevo nimmt nur die eigene Domain an). */
const end = () => `<section class="sec lime end" id="start"><div class="w"><div class="stack"><span class="kick">App bald verfügbar · zum Start kostenlos</span><h2 class="h2">Sei beim Start dabei.</h2><p class="lead">Eine E-Mail, sobald Vision Universe im App Store und bei Google Play steht. Dazu neue Insights, wenn du magst.</p></div>
<div class="form">${nlBtn("d")}<p class="fine" style="color:#1d2700">Anmeldung auf www.visionuniverse.de · Bestätigung per E-Mail, Abmeldung jederzeit.</p>${badges(false)}</div></div></section>`;

function page({ path, title, desc, active, body, player }) {
  const url = `https://research.visionuniverse.de${BASE}${path}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
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
${end()}
</main>
${footer()}
${player ? `<dialog class="player" id="player" aria-label="Video"><button type="button" aria-label="Video schließen">×</button><video controls playsinline preload="none"></video></dialog>` : ""}
</body>
</html>
`;
}

/* ---------- Gemeinsame Abschnitte ---------- */
const VIEWS = [["discover", "Überblick"], ["technical", "Chart"], ["fundamental", "Zahlen"], ["quant", "Faktoren"], ["supertrader", "Methoden"], ["elliott", "Wellen"], ["hedgefonds", "Investoren"]];
const seven = () => `<section class="sec"><div class="w"><div class="head two"><div class="stack"><span class="kick">Der Beweis · NVIDIA, Schluss 11.11.2026</span><h2 class="h2">Eine Aktie.<br>Sieben Blickwinkel.</h2></div><p class="lead">Andere Apps zeigen dir den Kurs. Vision Universe zeigt, was dahinter steckt, und sagt es in einem Satz.</p></div>
<div class="tabs">${VIEWS.map(([id, n]) => `<a href="${modHref(id)}">${ic(id)}${n}</a>`).join("")}</div>
<div class="trio"><figure>${phone("nvda-fundamental", "NVIDIA in Fundamental")}<figcaption><b>Zahlen</b><span>„Wächst stark und verdient sehr gut.“</span></figcaption></figure><figure>${phone("nvda-quant", "NVIDIA in Quant")}<figcaption><b>Faktoren</b><span>Verdient besser als 99 % aller US-Aktien.</span></figcaption></figure><figure>${phone("nvda-technical", "NVIDIA in Technical")}<figcaption><b>Chart</b><span>„Abwärtstrend“, mit Zonen laut Methode.</span></figcaption></figure></div>
<p class="stage-note">Beispiel NVIDIA, Datenstand 11.11.2026. Keine Anlageberatung, keine Empfehlung.</p></div></section>`;
const want = () => `<section class="sec g"><div class="w"><div class="head"><span class="kick">Elf Bereiche, ein Konto</span><h2 class="h2">Was willst du wissen?</h2></div>
<div class="int">${GROUPS.map(([, n, t, ids]) => `<div><h3>${n}</h3><p>${t}</p>${ids.map((id) => `<a href="${modHref(id)}">${ic(id)}<div><b>${MOD[id].name}</b><span>${MOD[id].q}</span></div></a>`).join("")}</div>`).join("")}</div></div></section>`;
/* Insights live: site.js füllt die drei Plätze aus /insights/artikel.json (neuester Artikel, neuestes Heft, neuester Report). */
const live = () => `<section class="sec k"><div class="w"><div class="head two"><div class="stack"><span class="livetag"><i class="dot"></i>Aktualisiert sich selbst<span data-live-stand></span></span><h2 class="h2">Insights: immer das Neueste vorn.</h2></div><p class="lead">Jeden Werktag neue Artikel, jede Woche das Aktienmagazin, dazu ausführliche Aktienreports. Was neu erscheint, rückt von selbst an die erste Stelle.</p></div>
<div class="live3" data-live>
<a class="lv big" href="/insights/" data-live-artikel><div class="b"><span class="slot">Neuester Artikel</span><p class="wait">Lädt …</p></div></a>
<a class="lv" href="/insights/magazin/" data-live-magazin><div class="b"><span class="slot">Neuestes Aktienmagazin</span><h3>Das Heft zur Börsenwoche</h3><u>Zum Aktienmagazin →</u></div></a>
<a class="lv rep" href="/insights/reports/" data-live-report><div class="b"><span class="slot">Neuester Aktienreport</span><h3>Der erste Aktienreport ist in Arbeit.</h3><u>Zu den Reports →</u></div></a>
</div>
<div class="ticker" data-live-davor hidden><span class="slot">Davor erschienen</span></div>
<div class="cta" style="margin-top:28px"><a class="txt" href="${BASE}insights/">Alle Insights →</a></div></div></section>`;

/* ---------- Startseite (Idee 5 „Das Plakat“, Owner 13.11.2026; wenig Text, bewegte Module, Owner 13.11. abends) ---------- */
/* Das Kernmodul: eine Aktie, sieben Blickwinkel, je ein Satz und das echte App-Bild. site.js schaltet durch (data-core).
   Alle Angaben sind die der App vom 11.11.2026 (NVIDIA); Methoden und Wellen beschreiben nur, was der Bereich tut. */
const CORE = [
  { id: "discover", tab: "Überblick", shot: "nvda-ueberblick", say: "Alles zu einer Aktie. Auf einer Seite.",
    vis: `<div class="cv-price"><b>173,73 $</b><span class="chg">▲ +2,87 %</span></div>`, note: "NVIDIA · Schluss 11.11.2026" },
  { id: "fundamental", tab: "Zahlen", shot: "nvda-fundamental", say: "„Wächst stark und verdient sehr gut.“",
    vis: `<div class="cv-split"><i style="--v:63.66%"></i></div>`, note: "Von 100 $ Umsatz bleiben 63,66 $ Gewinn" },
  { id: "quant", tab: "Faktoren", shot: "nvda-quant", say: "Verdient besser als 99 % aller US-Aktien.",
    vis: `<div class="cv-bars">${[["Verdient gut", 99], ["Wächst", 86], ["Zahlen solide", 44]].map(([n, v]) => `<div><span>${n}</span><u><s style="--v:${v}%"${v >= 80 ? ' class="h"' : ""}></s></u><b>${v}</b></div>`).join("")}</div>`, note: "0 bis 100 · 50 ist die Mitte aller US-Aktien" },
  { id: "technical", tab: "Chart", shot: "nvda-technical", say: "„Abwärtstrend.“",
    vis: `<div class="cv-line"><span>200-Tage-Linie</span><i></i></div>`, note: "Der Kurs liegt 15,0 % unter der 200-Tage-Linie" },
  { id: "supertrader", tab: "Methoden", shot: "nvda-supertrader", say: "13 Methoden bekannter Trader. Jeden Tag geprüft.",
    vis: `<div class="cv-dots">${Array.from({ length: 13 }, (_, k) => `<i style="--d:${k}"></i>`).join("")}</div>`, note: "Feste Regeln · Forschung, nicht zertifiziert" },
  { id: "elliott", tab: "Wellen", shot: "nvda-elliott", say: "Wellen. Nur wo sie sich sauber zählen lassen.",
    vis: `<svg class="cv-wave" viewBox="0 0 320 90" aria-hidden="true"><path d="M4 78 62 40 104 58 186 12 232 36 316 6" pathLength="1"/></svg>`, note: "Schema einer Wellenzählung" },
  { id: "hedgefonds", tab: "Investoren", shot: "nvda-hedgefonds", say: "413 Hedgefonds halten die Aktie.",
    vis: `<div class="cv-count"><b>413</b><span>darunter 34 Star-Investoren</span></div>`, note: "13F-Meldungen · Q2 2026" }
];
const core = () => `<section class="k core" id="kern" data-core><div class="w"><div class="core-head"><span class="kick">Das können wir · Beispiel NVIDIA</span><h2 class="h2">Eine Aktie.<br>Sieben <em class="hl">Blickwinkel.</em></h2></div>
<div class="core-stage"><div class="core-say">${CORE.map((c, i) => `<div class="cs${i ? "" : " on"}" data-core-panel><span class="cs-tab">${ic(c.id)}${c.tab}</span><p class="cs-say">${c.say}</p><div class="cs-vis">${c.vis}</div><span class="cs-note">${c.note}</span></div>`).join("")}</div>
<div class="core-phone"><div class="ph">${CORE.map((c, i) => `<img${i ? "" : ' class="on"'} data-core-shot src="${BASE}img/app-${c.shot}.webp" alt="NVIDIA in der App: ${c.tab}" width="585" height="1266"${i ? ' loading="lazy"' : ""} decoding="async">`).join("")}</div></div></div>
<div class="core-tabs" role="tablist" aria-label="Sieben Blickwinkel">${CORE.map((c, i) => `<button type="button" role="tab" aria-selected="${i ? "false" : "true"}" data-core-tab>${ic(c.id)}<span>${c.tab}</span></button>`).join("")}</div>
<div class="core-more">${CORE.map((c) => `<a href="${modHref(c.id)}">${MOD[c.id].name}</a>`).join("")}</div></div></section>`;
const TILE_NOTE = { entdecken: "Was ist heute los?", verstehen: "Was steckt in der Aktie?", methoden: "Wie arbeiten Profis?", vorsorgen: "Was wird aus meiner Rente?" };
const tiles = () => `<section class="sec g"><div class="w"><div class="head"><h2 class="h2">Was willst du wissen?</h2></div>
<div class="tiles">${GROUPS.map(([id, n, , ids], k) => `<div class="tile${k === 1 ? " dark" : ""}"><a class="tile-h" href="${BASE}funktionen/#${id}"><h3>${n}</h3><p>${TILE_NOTE[id]}</p></a><div class="tile-i">${ids.map((m) => `<a href="${modHref(m)}">${hud(m)}<span>${MOD[m].name}</span></a>`).join("")}</div></div>`).join("")}</div></div></section>`;
const filmrow = () => `<section class="sec k"><div class="w"><div class="head two"><h2 class="h2">Jeder Bereich in<br><em class="hl">30 Sekunden.</em></h2><div class="cta"><a class="txt" href="${BASE}videos/">Alle Filme →</a></div></div>
<div class="films">${[["start", "Vision Universe"], ["quant", "Quant"], ["fundamental", "Fundamental"], ["supertrader", "Supertrader"], ["discover", "Discover"]].map(([id, n]) => film(id, `${n} in 30 Sekunden`)).join("")}</div></div></section>`;
const liveShort = () => live().replace(/<p class="lead">Jeden Werktag[^<]*<\/p>/, `<div class="cta"><a class="txt" href="${BASE}insights/">Alle Insights →</a></div>`).replace(/<div class="cta" style="margin-top:28px"><a class="txt" href="[^"]*">Alle Insights →<\/a><\/div>/, "").replace("Insights: immer das Neueste vorn.", "Heute neu.");
function home() {
  const body = `<section class="k h5x"><div class="poster"><img src="${BASE}img/kino-hero.webp" alt="Zwei Dirigenten vor einem Orchester im Konzertsaal" width="900" height="1600" fetchpriority="high"></div><div class="w"><div class="stack">${pill()}<h1 class="h1">Die Börse<br>ist laut.<br>Wir bringen<br><em class="hl">Ordnung</em><br>hinein.</h1><p class="lead">Jede Aktie aus sieben Blickwinkeln. Jede Zahl in einem Satz.</p><div class="cta">${nlBtn()}</div>${badges()}</div></div></section>
${core()}
<section class="k numband"><div class="w"><div class="nums">${NUMS.map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join("")}</div></div></section>
${tiles()}
${liveShort()}
${filmrow()}
<section class="sec"><div class="w"><ul class="nots lt"><li><s>Keine</s> Empfehlungen</li><li><s>Keine</s> Kursziele</li><li><s>Keine</s> Provisionen</li><li><s>Keine</s> erfundenen Zahlen</li></ul>
<div class="cta" style="margin-top:32px"><a class="txt" href="${BASE}daten/">Woher die Zahlen kommen →</a><a class="txt" href="${BASE}fuer-wen/">Für wen ist das? →</a></div></div></section>`;
  return page({ path: "", title: "Vision Universe · Die Börse ist laut. Wir bringen Ordnung hinein.", desc: "Die Analyse-App für Aktien, ETFs und Vorsorge: jede Aktie aus sieben Blickwinkeln, jede Zahl mit Quelle und einem Satz, der sie erklärt. Bald für iPhone und Android.", active: "", body, player: 1 });
}

/* ---------- Produkt (Übersicht) ---------- */
function funktionen() {
  const body = `${subhero({ kick: "Das Produkt", h1: 'Was willst du<br><em class="hl">wissen?</em>', lead: "Elf Bereiche, ein Konto, dieselben Daten. Du musst kein Werkzeug lernen. Such dir die Frage aus, die du gerade hast." })}
<section style="padding-block:clamp(40px,5vw,72px)"><div class="w">${GROUPS.map(([id, n, t, ids]) => `<div class="grp" id="${id}"><div class="stack" style="gap:10px"><h2 class="h2" style="font-size:clamp(32px,4vw,56px)">${n}</h2><p class="lead" style="font-size:17px">${t}</p></div><div class="rows">${ids.map((m) => `<a href="${modHref(m)}">${hud(m)}<b>${MOD[m].name}</b><div class="q">${MOD[m].q}<small>${MOD[m].lead}</small></div><u>→</u></a>`).join("")}</div></div>`).join("")}
<div class="grp"><div class="stack" style="gap:10px"><h2 class="h2" style="font-size:clamp(32px,4vw,56px)">Lesen</h2><p class="lead" style="font-size:17px">Du willst wissen, was hinter den Schlagzeilen steckt.</p></div><div class="rows"><a href="${modHref("insights")}">${hud("insights")}<b>Insights</b><div class="q">${MOD.insights.q}<small>${MOD.insights.lead}</small></div><u>→</u></a></div></div></div></section>`;
  return page({ path: "funktionen/", title: "Produkt · Vision Universe", desc: "Elf Bereiche, ein Konto: von Discover bis Vorsorge. Jeder Bereich beantwortet eine Frage.", active: "funktionen/", body });
}

/* ---------- Bereichsseite ---------- */
const QUANT_PROFIL = [["Verdient gut", 99, "Sehr stark"], ["Wächst", 86, "Stark"], ["Ruhiger Kurs", 83, "Stark"], ["Günstig", 62, "Mittel"], ["Kurs läuft", 53, "Mittel"], ["Zahlen solide", 44, "Schwach"]];
function modulPage(m) {
  const grp = GROUP_OF[m.id];
  const note = (n, t) => `<div class="note"><i>${n}</i><b>${t}</b></div>`;
  const others = MODULES.filter((x) => x.id !== m.id && x.id !== "insights");
  const same = others.filter((x) => GROUP_OF[x.id] === grp), rest = others.filter((x) => GROUP_OF[x.id] !== grp);
  const next = [...same, ...rest].slice(0, 3);
  const side = m.shot ? phone(m.shot, `${m.name} auf dem iPhone`) : m.video ? `<div style="max-width:280px;justify-self:center;width:100%">${film(m.video, `${m.name} in 30 Sekunden`)}</div>` : "";
  const read = m.shot
    ? `<div class="read"><div class="col">${note("01", m.points[0])}${note("02", m.points[1])}</div>${phone(m.shot, `${m.name} in der App`)}<div class="col">${note("03", m.points[2])}<div class="note"><i>Dazu</i><b>Jede Zahl mit Datum</b><span>Du siehst immer, von wann der Stand ist.</span></div></div></div>`
    : `<div class="read noshot">${m.points.map((p, i) => note("0" + (i + 1), p)).join("")}</div>`;
  const example = m.id === "quant" ? `<section class="sec g"><div class="w example"><div class="stack"><span class="kick">Beispiel NVIDIA · Datenstand 11.11.2026</span><h2 class="h2">Verdient besser als 99 % aller US-Aktien.</h2><p class="lead">Und liegt bei soliden Zahlen trotzdem nur im Mittelfeld. Genau diesen Unterschied macht Quant sichtbar.</p><p class="fine">Rang unter rund 5.600 bewerteten US-Aktien. Keine Empfehlung.</p></div>
<div class="bars">${QUANT_PROFIL.map(([n, v, t]) => `<div class="bar"><span>${n}</span><u><s${v >= 80 ? ' class="h"' : ""} style="width:${v}%"></s></u><b>${v}</b><em>${t}</em></div>`).join("")}</div></div></section>` : "";
  const [hTitle, hText] = HONEST[m.id];
  const honest = `<section class="sec k"><div class="w${m.video && m.shot ? " honest" : ""}">${m.video && m.shot ? film(m.video, `${m.name} in 30 Sekunden`) : ""}<div class="stack"><span class="kick">Ehrlich gesagt</span><h2 class="h2">${hTitle}</h2><p class="lead">${hText}</p></div></div></section>`;
  const body = `<section class="k subhero${side ? "" : " solo"}"><div class="w"><div class="stack"><span class="crumb"><a href="${BASE}funktionen/">Produkt</a> / ${grp} / <b>${m.name}</b></span><div style="display:flex;gap:14px;align-items:center;font-weight:900;font-size:22px">${hud(m.id)}${m.name}</div><h1 class="h1" style="font-size:clamp(42px,6.6vw,96px)">${m.q}</h1><p class="lead">${m.lead}</p><div class="cta">${nlBtn()}${m.video && m.shot ? `<button type="button" class="txt" data-video="${MEDIA}${m.video}.mp4" data-poster="${MEDIA}${m.video}.jpg">▶ ${m.name} in 30 Sekunden</button>` : ""}</div></div>${side}</div></section>
<section class="sec"><div class="w"><div class="head"><span class="kick">So liest du ${m.name}</span><h2 class="h2">Drei Dinge reichen.</h2></div>${read}</div></section>
${example}${honest}
<section class="sec"><div class="w"><div class="head"><span class="kick">Dieselbe Aktie, nächste Frage</span><h2 class="h2">Und weiter?</h2></div><div class="next">${next.map((x) => `<a href="${modHref(x.id)}"><small>${ic(x.id)}${x.name}</small><b>${x.q}</b></a>`).join("")}</div></div></section>`;
  return page({ path: `funktionen/${m.id}/`, title: `${m.name} · Vision Universe`, desc: `${m.q} ${m.lead}`, active: "funktionen/", body, player: !!m.video });
}

/* ---------- Für wen ---------- */
const VOICE = { sparplan: "Ich fange gerade an.", privatanleger: "Ich habe ein Depot und will meine Aktien verstehen.", trader: "Ich arbeite mit Charts, Mustern und festen Regeln.", profis: "Ich will Tiefe: SEC-Daten, 13F, Backtests." };
function fuerWen() {
  const body = `${subhero({ kick: "Für wen", h1: 'Wo stehst du<br><em class="hl">gerade?</em>', lead: "Einsteiger sehen zuerst die Antwort, Profis zuerst die Daten. Dieselbe App, vier Wege hinein.", extra: `<div class="tabs">${PERSONAS.map((p) => `<a href="#${p.id}">${p.title}</a>`).join("")}</div>` })}
<section style="padding-block:clamp(24px,3vw,40px) clamp(48px,6vw,88px)"><div class="w">${PERSONAS.map((p) => `<div class="who" id="${p.id}"><div class="stack"><span class="kick">${p.title}</span><h2 class="h2">„${VOICE[p.id]}“</h2><p class="lead">${p.text}</p><div><span class="fine">Dein Weg durch die App</span><div class="path">${p.mods.map((id, i) => `${i ? "<u>→</u>" : ""}<a href="${modHref(id)}"><span>${ic(id)}${MOD[id].name}</span></a>`).join("")}</div></div></div>${phone(MOD[p.mods[0]].shot || "discover", p.title)}</div>`).join("")}
<div class="who" style="grid-template-columns:1fr"><div class="stack"><span class="kick">Auch für Gruppen</span><h2 class="h3">Vereine, Investmentclubs und Unternehmen</h2><p class="lead">Eine gemeinsame Datenbasis für jede Diskussion. <a class="txt" href="${BASE}kontakt/" style="font-size:inherit">Schreib uns →</a></p></div></div></div></section>`;
  return page({ path: "fuer-wen/", title: "Für wen · Vision Universe", desc: "Vom ersten Sparplan bis zum Profi: vier Wege in dieselbe App.", active: "fuer-wen/", body });
}

/* ---------- Videos ---------- */
function videos() {
  const body = `<section class="k subhero solo"><div class="w feat">${film("start", VIDEOS[0][1])}<div class="stack"><span class="kick">Videos · Der Film zum Start</span><h1 class="h1">Vision Universe in <em class="hl">30 Sekunden.</em></h1><p class="lead">Was die App kann und wie die elf Bereiche zusammenarbeiten. Danach: jeder Bereich in einem eigenen Kurzfilm. Neue Reels erscheinen auf Instagram und TikTok.</p>${follow()}</div></div></section>
<section class="sec k" style="padding-top:0"><div class="w"><div class="head"><span class="kick">Jeder Bereich in 30 Sekunden</span><h2 class="h2">Zehn Kurzfilme.</h2></div><div class="vgrid">${VIDEOS.slice(1).map(([id, t, tag]) => `<figure>${film(id, t)}<figcaption>${tag}<span>${MOD[id].q}</span></figcaption></figure>`).join("")}</div></div></section>`;
  return page({ path: "videos/", title: "Videos · Vision Universe", desc: "Vision Universe und jeder Bereich in 30 Sekunden erklärt.", active: "videos/", body, player: 1 });
}

/* ---------- Insights ---------- */
function insights() {
  const body = `${subhero({ kick: "Insights · frei lesbar", h1: 'Was steckt hinter den <em class="hl">Schlagzeilen?</em>', lead: "Jeden Werktag neue Artikel zu großen Werten, Nebenwerten und Zukunftsthemen, jede Woche das Aktienmagazin. Jeder Text ist mit den Daten aus Vision Universe unterlegt.", extra: `<div class="tabs"><a class="on" href="#artikel">Artikel</a><a href="#magazin">Aktienmagazin</a><a href="#reports">Aktienreports</a></div>` })}
<section class="sec w-light" id="artikel"><div class="w"><div class="head"><span class="livetag dk"><i class="dot"></i>Aktualisiert sich selbst<span data-live-stand></span></span></div><div class="news"><a class="lead-a" href="/insights/" data-feed-lead><p class="fine">Lädt …</p></a><div class="alist" data-feed="5" data-feed-skip="1"></div></div><div class="cta" style="margin-top:28px"><a class="txt" href="/insights/">Alle Artikel →</a></div></div></section>
<section class="sec lime" id="magazin"><div class="w duo"><a href="/insights/magazin/" data-mag-cover style="max-width:360px;width:100%;justify-self:center"></a><div class="stack"><span class="kick">Aktienmagazin · jede Woche</span><h2 class="h2">Das Heft zur Börsenwoche.</h2><p class="lead">Titelthema, Einzelanalysen, Berichtssaison, Hedgefonds, Charts und Termine. <span data-mag-text></span></p><div class="cta"><a class="btn d" href="/insights/magazin/" data-mag-link>Zum Aktienmagazin →</a></div></div></div></section>
<section class="sec" id="reports"><div class="w duo"><div class="stack"><span class="kick">Aktienreports</span><h2 class="h2">Ein Unternehmen. Ausführlich.</h2>${pts([["Geschäftsmodell", "Womit die Firma Geld verdient, in klaren Worten."], ["Zahlen und Bewertung", "Im Vergleich mit Branche und Markt, jede Zahl mit Quelle."], ["Alle Blickwinkel", "Faktoren, Chart, Zahlen und Fonds zur selben Aktie."]])}<a class="txt" href="/insights/reports/">Zu den Reports →</a></div><div style="max-width:280px;justify-self:center;width:100%">${phone("insights", "Insights auf dem iPhone")}</div></div></section>
<section class="sec g" style="padding-block:28px"><div class="w"><p class="fine">Artikel, Magazin und Reports beschreiben Unternehmen und Zahlen. Sie sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung.</p></div></section>`;
  return page({ path: "insights/", title: "Insights · Vision Universe", desc: "Neue Artikel an jedem Werktag, das Aktienmagazin und Aktienreports von Vision Universe.", active: "insights/", body });
}

/* ---------- App ---------- */
function app() {
  const body = `${subhero({ kick: "Die App", h1: 'Eine App.<br><em class="hl">Jedes Gerät.</em>', lead: "Vision Universe kommt für iPhone und Android und läuft im Browser auf Tablet und Desktop. Ein Konto, dieselbe Merkliste.", extra: `${badges()}${nlBtn()}`, side: phone("discover", "Vision Universe auf dem iPhone") })}
<section class="sec"><div class="w"><div class="head"><span class="kick">Bis zum Start</span><h2 class="h2">Drei Schritte, dann bist du dabei.</h2></div>${stand([["1 · E-Mail eintragen", "Auf www.visionuniverse.de. Mehr brauchen wir nicht."], ["2 · Bestätigen", "Ein Klick auf den Link in der Bestätigungsmail."], ["3 · Bescheid bekommen", "Zum Start kommt eine E-Mail mit dem Link zur App."], ["Bis dahin", "Insights lesen und uns auf Instagram und TikTok folgen."]])}</div></section>
<section class="sec g"><div class="w duo"><div class="stack"><span class="kick">Auf jedem Gerät</span><h2 class="h2">Klein fürs Sofa. Groß fürs Durchleuchten.</h2><p class="lead">Auf dem iPhone eine Spalte mit Leiste unten. Auf Tablet und Desktop die volle Breite für Charts, Listen und Filter.</p></div><div class="vis"><div class="br"><img src="${BASE}img/app-quant-desktop.webp" alt="Quant am Desktop" width="1440" height="900" loading="lazy"></div>${phone("quant", "Quant auf dem iPhone")}</div></div></section>`;
  return page({ path: "app/", title: "App · Vision Universe", desc: "Vision Universe kommt als App für iPhone und Android. App bald verfügbar.", active: "", body });
}

/* ---------- Daten und Methodik ---------- */
function daten() {
  const rows = [["SEC-Berichte", "Umsatz, Gewinn, Bilanz und Cashflow aus den Pflichtberichten an die US-Börsenaufsicht (10-K, 10-Q)", "mit jedem neuen Bericht"], ["Tageskurse", "Schlusskurse eines Marktdatenanbieters, um Aktiensplits bereinigt", "nach jedem US-Handelstag"], ["13F-Meldungen", "Gemeldete Bestände großer Fonds", "vierteljährlich, mit Verzögerung"], ["ETF-Daten", "Kosten, Bestände und Anbieter aus den Quellen der Fondsgesellschaften und Börsen", "laufend"]];
  const body = `${subhero({ kick: "Daten und Methodik", h1: 'Woher jede<br><em class="hl">Zahl kommt.</em>', lead: "Keine Zahl ohne Quelle und Datum. Fehlt etwas, sagen wir es, statt es zu erfinden." })}
<section class="sec"><div class="w"><div class="head"><span class="kick">Vier Quellen</span><h2 class="h2">Das steckt in der App.</h2></div><div class="scroll"><table class="tbl"><thead><tr><th>Quelle</th><th>Was wir daraus lesen</th><th>Wie oft</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="cta" style="margin-top:28px"><a class="txt" href="/infos/#quellen">Alle Quellen und Lizenzen →</a></div></div></section>
<section class="sec g"><div class="w"><div class="head"><span class="kick">So rechnen wir</span><h2 class="h2">Vier Regeln für jede Auswertung.</h2></div>${stand([["Feste Regeln", "Alle Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich."], ["Mit Datum", "Jede Zahl trägt ihren Datenstand. Veraltete Daten sind markiert."], ["Vergleich statt Urteil", "Quant vergleicht eine Aktie mit allen US-Aktien. Eine Gesamtnote gibt es bewusst nicht."], ["Forschung", "Backtests heißen „Forschung, nicht zertifiziert“ und nennen Zeitraum, Kosten und Vergleich."]])}</div></section>
<section class="sec k"><div class="w"><div class="head"><span class="kick">Was wir nicht tun</span></div><ul class="nots"><li><s>Keine</s> Kauf- oder Verkaufsempfehlungen</li><li><s>Keine</s> Kursziele</li><li><s>Keine</s> Provisionen von Banken oder Brokern</li><li><s>Keine</s> erfundenen Zahlen</li></ul></div></section>`;
  return page({ path: "daten/", title: "Daten und Methodik · Vision Universe", desc: "Woher die Zahlen von Vision Universe kommen: SEC-Berichte, Tageskurse, 13F-Meldungen. Keine Empfehlungen.", active: "", body });
}

/* ---------- Über uns ---------- */
function ueberUns() {
  const body = `<section class="k subhero solo"><div class="w"><div class="stack"><span class="kick">Über uns</span><h1 class="h1">Wir machen Investieren <em class="hl">verständlich.</em></h1><p class="lead">Profi-Werkzeuge waren lange teuer und schwer zu lesen. Vision Universe bringt die Daten und Methoden der Profis zu allen, die investieren.</p></div><div class="wide"><img src="${BASE}img/kino-saal.webp" alt="Orchester im Konzertsaal" width="900" height="1600" loading="lazy"></div></div></section>
<section class="sec"><div class="w story"><div class="stack"><span class="kick">Warum es uns gibt</span><h2 class="h3">Die Idee hinter dem Dirigenten</h2></div><div><p>An der Börse reden alle gleichzeitig: Schlagzeilen, Tipps, Meinungen. Ein Orchester ohne Dirigent klingt genauso.</p><p>Vision Universe gibt nicht den Ton vor. Wir ordnen, was da ist: Pflichtberichte, Kurse, Meldungen der großen Fonds. Jede Zahl bekommt ihren Platz, ihre Quelle und einen Satz, der sie erklärt.</p><p>Was du daraus machst, entscheidest du.</p></div></div></section>
<section class="sec g"><div class="w"><div class="head"><span class="kick">Wofür wir stehen</span><h2 class="h2">Vier Versprechen.</h2></div>${stand([["Verständlich", "Jede Zahl mit einem Satz erklärt."], ["Ehrlich", "Keine Empfehlungen, keine Kursziele."], ["Unabhängig", "Keine Provisionen von Banken oder Brokern."], ["Nachprüfbar", "Jede Zahl mit Quelle und Datum."]])}</div></section>
<section class="sec k"><div class="w"><div class="head"><span class="kick">Folgen</span><h2 class="h2">Neue Reels auf Instagram und TikTok.</h2></div>${follow()}</div></section>`;
  return page({ path: "ueber-uns/", title: "Über uns · Vision Universe", desc: "Vision Universe macht Investieren verständlich: Daten und Methoden der Profis für alle.", active: "ueber-uns/", body });
}

/* ---------- Kontakt, Fragen ---------- */
function kontakt() {
  const L = legal();
  const body = `${subhero({ kick: "Kontakt", h1: 'Schreib <em class="hl">uns.</em>', lead: "Fragen zur App, zu den Daten oder für Gruppen und Vereine. Wir antworten so schnell wie möglich." })}
<section class="sec"><div class="w contact"><div class="stack"><h2 class="h2">Am schnellsten über das Formular.</h2><p class="lead">Das Kontaktformular liegt im Konto-Bereich von Vision Universe. Du brauchst dafür kein Konto.</p><a class="btn d" href="${L.links.kontakt}">Zum Kontaktformular →</a></div>
<div class="side"><a href="${BASE}faq/">${g("help")}<div><b>Häufige Fragen</b><span>Vielleicht steht die Antwort schon da.</span></div></a>${SOCIAL.map(([i, n, u]) => `<a href="${u}" rel="noopener" target="_blank">${g(i)}<div><b>${n}</b><span>@app.visionuniverse</span></div></a>`).join("")}<a href="${L.links.kontakt}">${g("users")}<div><b>Für Gruppen</b><span>Vereine, Investmentclubs und Unternehmen.</span></div></a></div></div></section>`;
  return page({ path: "kontakt/", title: "Kontakt · Vision Universe", desc: "Kontakt zu Vision Universe.", active: "", body });
}
function faq() {
  const body = `${subhero({ kick: "Häufige Fragen", h1: 'Gut zu <em class="hl">wissen.</em>', lead: "Die vier Fragen, die fast jeder stellt, sind schon aufgeklappt." })}
<section class="sec"><div class="w faq"><aside><a class="on" href="${BASE}faq/">Alle Fragen</a><a href="${BASE}app/">Zur App</a><a href="${BASE}daten/">Zu den Daten</a><a href="${BASE}kontakt/">Kontakt</a></aside><div class="qa">${FAQ.map(([q, a], i) => `<details${i < 4 ? " open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("")}<p class="fine" style="padding-top:28px">Frage nicht dabei? <a class="txt" href="${BASE}kontakt/" style="font-size:15px">Schreib uns →</a></p></div></div></section>`;
  return page({ path: "faq/", title: "Häufige Fragen · Vision Universe", desc: "Antworten auf die häufigsten Fragen zu Vision Universe.", active: "", body });
}

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

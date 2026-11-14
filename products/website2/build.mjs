/* Vision Universe · Website 2 („Website-Mock-up 3“, Owner-Freigabe 14.11.2026): hell, app-artig, bewegt.
   Baut die Vorschau mit allen Unterseiten als statisches HTML nach /website2/: Start, App, zwölf Modulseiten,
   News, Aktienmagazin, Fragen. Vorschau im geschützten Bereich research.visionuniverse.de/website2/
   (Passwortmaske beim Ausrollen, noindex); der Umzug auf www.visionuniverse.de ist ein eigener Schritt.

   Regeln wie bei /website/ (products/website/README.md): App noch nicht verfügbar, daher kein Link in die App oder
   in einen Store. Der eine Aufruf ist „Zum Start benachrichtigen“ und führt zur Anmeldung auf www. Preise
   ausgeblendet. Wortwahl nach docs/legal/WORTWAHL.md, Pflichtsatz und Rechtslinks aus assets/legal-notices.json im
   Menü unter „Rechtliches & Infos“.

     node products/website2/build.mjs              schreibt website2/<seite>/index.html
     node products/website2/build.mjs --out DIR    schreibt nach DIR (Tests)

   website2/site.css, website2/site.js, website2/img/ und website2/vid/ sind Handarbeit und werden hier nicht erzeugt. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASE = "/website2/";
export const NEWSLETTER = "https://www.visionuniverse.de/#newsletter";
const IMG = `${BASE}img/`;
const STORIES = "/assets/stories/";
/* Heft, das die Seiten ohne JavaScript zeigen. site.js setzt das neueste Heft aus /insights/artikel.json ein. */
export const HEFT = { nr: "01", datum: "09.11.2026", titel: "Die KI-Bremse", seiten: 30, href: "/insights/magazin/nr-01/", blick: [2, 3, 5, 8, 12, 17, 20, 24] };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nn = (n) => String(n).padStart(2, "0");

/* ---------- Symbole ---------- */
/* Modul-Symbole aus dem zentralen Sprite der App (assets/product-icons.svg). */
const ic = (id, s = 20) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="/assets/product-icons.svg#${id}"/></svg>`;
const I = {
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  down: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
  spark: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>',
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/></svg>',
  play: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l14 8-14 8z"/></svg>'
};

/* ---------- Kennzeichen-Grafiken je Modul (SVG und HTML, bewegt; rein schmückend) ---------- */
const G = {
  discover: `<svg width="130" height="130" viewBox="0 0 130 130" fill="none" stroke="currentColor" stroke-width="2"><circle cx="65" cy="65" r="60" opacity=".25"/><circle cx="65" cy="65" r="40" opacity=".25"/><circle cx="65" cy="65" r="20" opacity=".25"/><g class="a-spin"><path d="M65 65L65 5A60 60 0 0 1 117 35z" fill="var(--ac)" stroke="none" opacity=".35"/><path d="M65 65V5" stroke="var(--ac)" stroke-width="3"/><circle cx="65" cy="65" r="60" stroke="none"/></g><circle class="a-blink" cx="92" cy="44" r="5" fill="var(--ac)" stroke="none"/><circle class="a-blink" cx="40" cy="86" r="4" fill="var(--ac)" stroke="none" style="animation-delay:.6s"/></svg>`,
  screener: `<div style="font-weight:900;font-size:17px;line-height:1.9;letter-spacing:-.02em">Aktien, die<br><span class="a-blink" style="background:var(--ac);color:#fff;border-radius:8px;padding:3px 9px;white-space:nowrap">gut verdienen</span><br>und <span class="a-blink" style="background:var(--ac);color:#fff;border-radius:8px;padding:3px 9px;white-space:nowrap;animation-delay:.7s">günstig</span> sind</div>`,
  atlas: `<div style="width:100%;background:rgba(255,255,255,.1);border-radius:99px;padding:13px 18px;font-weight:700;display:flex;align-items:center;gap:10px"><span style="color:var(--ac)">${I.spark}</span><span class="a-type">günstige KI-Aktien mit Gewinn</span></div>`,
  fundamental: `<svg width="170" height="110" viewBox="0 0 170 110">${[14, 18, 26, 32, 38, 46, 70, 104].map((h, i) => `<rect class="a-grow" x="${i * 21 + 2}" y="${110 - h}" width="15" height="${h}" rx="5" fill="${i === 7 ? "var(--ac)" : "currentColor"}" opacity="${i === 7 ? 1 : 0.28}" style="animation-delay:${(i * 0.09).toFixed(2)}s"/>`).join("")}</svg>`,
  quant: `<svg width="130" height="130" viewBox="0 0 130 130" fill="none"><polygon points="65,6 116,35 116,95 65,124 14,95 14,35" stroke="currentColor" opacity=".3" stroke-width="2"/><polygon points="65,36 91,50 91,80 65,94 39,80 39,50" stroke="currentColor" opacity=".2" stroke-width="2"/><polygon fill="var(--ac)" fill-opacity=".4" stroke="var(--ac)" stroke-width="3" stroke-linejoin="round" points="65,8 108,40 88,78 65,96 34,84 22,40"><animate attributeName="points" dur="4s" repeatCount="indefinite" values="65,8 108,40 88,78 65,96 34,84 22,40;65,30 112,36 110,92 65,112 24,90 40,50;65,8 108,40 88,78 65,96 34,84 22,40"/></polygon></svg>`,
  technical: `<svg width="190" height="100" viewBox="0 0 190 100" fill="none"><rect x="0" y="62" width="190" height="20" rx="4" fill="var(--ac)" opacity=".28"/><path class="a-draw" style="--len:420" d="M4 86 26 60 44 74 70 40 92 58 118 22 140 44 162 14 186 30" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle class="a-blink" cx="186" cy="30" r="6" fill="var(--ac)"/></svg>`,
  elliott: `<svg width="190" height="100" viewBox="0 0 190 100" fill="none"><path class="a-draw" style="--len:420" d="M6 90 40 50 62 70 108 14 132 44 182 6" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>${[[40, 50, 1], [62, 70, 2], [108, 14, 3], [132, 44, 4], [182, 6, 5]].map(([x, y, n]) => `<circle cx="${x}" cy="${y}" r="9" fill="var(--ac)"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="900" fill="#fff" font-family="Inter,sans-serif">${n}</text>`).join("")}</svg>`,
  supertrader: `<div style="width:100%;display:flex;flex-direction:column;gap:7px;align-items:flex-start">${[[100, "rgba(255,255,255,.18)"], [62, "#fff"], [34, "var(--ac)"]].map(([w, c], i) => `<i class="a-growx" style="display:block;height:24px;border-radius:9px;width:${w}%;background:${c};animation-delay:${(i * 0.2).toFixed(1)}s"></i>`).join("")}</div>`,
  hedgefonds: `<div style="width:100%"><div style="display:flex;height:26px;border-radius:13px;overflow:hidden;gap:3px"><i class="a-growx" style="display:block;width:56%;background:var(--ac)"></i><i style="display:block;flex:1;background:currentColor;opacity:.25"></i></div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:800;margin-top:8px"><span>aufgestockt</span><span style="opacity:.55">verkauft</span></div></div>`,
  portfolios: `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px;width:100%">${Array.from({ length: 12 }, (_, i) => `<i${i < 7 ? ' class="a-blink"' : ""} style="display:block;height:26px;border-radius:8px;background:${i < 7 ? "var(--ac)" : "currentColor"};opacity:${i < 7 ? 1 : 0.15};animation-delay:${(i * 0.15).toFixed(2)}s"></i>`).join("")}</div>`,
  vorsorge: `<svg width="190" height="100" viewBox="0 0 190 100" fill="none"><path d="M4 92C60 88 120 70 186 8V96H4z" fill="var(--ac)" opacity=".22"/><path class="a-draw" style="--len:300" d="M4 92C60 88 120 70 186 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle class="a-blink" cx="186" cy="8" r="7" fill="var(--ac)"/></svg>`,
  insights: `<div style="position:relative;width:120px;height:120px">${[[-14, `${HEFT.href}seiten/s02.jpg`, 119, ""], [-4, `${HEFT.href}seiten/s05.jpg`, 119, ""], [7, `${HEFT.href}cover.jpg`, 119, " data-mag-img"]].map(([r, src, h, live], i) => `<img src="${src}" alt="" width="84" height="${h}" loading="lazy" decoding="async"${live} style="position:absolute;left:${18 + i * 4}px;top:0;width:84px;border-radius:6px;transform:rotate(${r}deg);box-shadow:0 8px 20px rgba(0,0,0,.25)">`).join("")}</div>`
};

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
  { id: "atlas", name: "AI Atlas", group: "Entdecken", color: "c-ink", q: "Frag in deinen Worten.", shot: "app-atlas.jpg", video: "atlas", icon: "layers",
    lead: "Stell deine Frage so, wie du sie einem Freund stellen würdest. Atlas antwortet mit den Daten der App und nennt die Quelle.",
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
const GROUPS = ["Entdecken", "Verstehen", "Methoden", "Vorsorgen", "Lesen"];
const modHref = (id) => `${BASE}module/${id}/`;
const micon = (m, s = 26) => ic(m.icon || m.id, s);
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

function legal() {
  const j = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
  return { text: j.notices.footer.text, links: j.links };
}

/* ---------- Bausteine ---------- */
const CTA = "Zum Start benachrichtigen";
const soon = `<span class="soon"><i></i>App bald verfügbar</span>`;
/* Der eine Aufruf: Anmeldung auf www (Brevo nimmt nur Anfragen von der eigenen Domain an), wie auf /website/. */
const cta = (cls = "", t = CTA) => `<a class="cta${cls ? " " + cls : ""}" href="${NEWSLETTER}">${t} ${I.chev}</a>`;
const SHOT = (src) => (src.endsWith(".webp") ? [585, 1266] : [780, 1688]);
const dev = (src, w, alt, cls = "") => `<div class="dev w${w}${cls ? " " + cls : ""}"><img src="${IMG}${src}" alt="${esc(alt)}" width="${SHOT(src)[0]}" height="${SHOT(src)[1]}" loading="lazy" decoding="async"></div>`;
const tile = (m, big) => `<a class="t ${m.color}${big ? " w2" : ""} rv" href="${modHref(m.id)}"><span class="go">${I.chev}</span><div class="fl g12"><div class="icb">${micon(m)}</div><b class="tn">${m.name}</b></div><div class="gfx" aria-hidden="true">${G[m.id]}</div><div class="q">${m.q}</div></a>`;
/* Original-Knöpfe von Apple und Google (Dateien von /website/, unverändert, in Farbe). Bis zum Start ohne Link. */
const badges = `<div class="badges"><img class="badge" src="/website/img/badge-apple.svg" alt="Laden im App Store" width="120" height="40"><img class="badge" src="/website/img/badge-google.png" alt="Jetzt bei Google Play" width="646" height="192"><span>Bald verfügbar</span></div>`;
const rail = (items, label, cls = "") => `<div class="rail${cls}" tabindex="0" role="group" aria-label="${esc(label)}">${items.map(([s, n]) => `<figure>${dev(s, 250, `${n} in der App`)}<figcaption>${n}</figcaption></figure>`).join("")}</div>`;
const cover = (alt) => `<img src="${HEFT.href}cover.jpg" alt="${esc(alt)}" width="560" height="793" loading="lazy" decoding="async" data-mag-img>`;

/* Abschluss jeder Seite. Statt des E-Mail-Felds aus dem Mock-up der Knopf zur Anmeldung auf www, wie auf /website/. */
const final = `<section class="sec" id="dabei"><div class="w"><div class="fin rv"><span class="pill">App bald verfügbar · zum Start kostenlos</span><h2 class="H1">Sei beim Start dabei.</h2><p class="p">Eine E-Mail, sobald Vision Universe im App Store und bei Google Play steht.</p>${cta()}<p class="s">Anmeldung auf www.visionuniverse.de · Bestätigung per E-Mail, Abmeldung jederzeit.</p>${badges}</div></div></section>`;

const megaCol = (groups) => groups.map((g) => `<div class="eb">${g}</div>${MODULES.filter((m) => m.group === g).map((m) => `<a class="mi" href="${modHref(m.id)}"><div class="icb">${micon(m)}</div><div><b>${m.name}</b><span>${m.q}</span></div></a>`).join("")}`).join("");
function header(active) {
  const L = legal();
  const on = (k) => (active === k ? ' aria-current="page"' : "");
  const cls = (k) => (active === k ? " on" : "");
  const links = [["Impressum", "impressum"], ["Kontakt", "kontakt"], ["Datenschutz", "datenschutz"], ["Nutzungsbedingungen", "bedingungen"], ["Risikohinweise", "risikohinweise"]];
  return `<a class="skip" href="#inhalt">Zum Inhalt</a>
<header class="nav" id="nav"><div class="bar"><a class="brand" href="${BASE}"${on("start")} aria-label="Vision Universe Startseite">VISION UNIVERSE®</a>
<nav class="nls" aria-label="Hauptmenü"><a class="nl${cls("module")}" href="${BASE}app/#bereiche" data-mega aria-controls="mega" aria-expanded="false">Module ${I.down}</a>${NAV.map(([k, n, h]) => `<a class="nl${cls(k)}" href="${BASE}${h}"${on(k)}>${n}</a>`).join("")}</nav>
<div class="sp"></div>${soon}${cta("s", "Benachrichtigen")}</div>
<div class="mega" id="mega"><nav class="mg" id="site-panel" aria-label="Module und Rechtliches"><div>${megaCol(["Entdecken"])}</div><div>${megaCol(["Verstehen"])}</div><div>${megaCol(["Methoden"])}</div><div>${megaCol(["Vorsorgen", "Lesen"])}<a class="mi app" href="${BASE}app/"><div class="icb">${ic("layers", 26)}</div><div><b>Die App</b><span>Alle Bereiche auf einen Blick</span></div></a></div>
<div class="mlegal"><h2>Rechtliches &amp; Infos</h2><p>${esc(L.text)}</p><ul>${links.map(([n, k]) => `<li><a href="${L.links[k]}">${n}</a></li>`).join("")}<li><a href="/infos/#quellen">Datenquellen und Methodik</a></li></ul></div></nav></div></header>`;
}

function footer() {
  const L = legal();
  const cols = [
    ["Produkt", [["Alle elf Bereiche", `${BASE}app/#bereiche`], ["Für wen", `${BASE}#fuer-wen`], ["App", `${BASE}app/`]]],
    ["Insights", [["Artikel", `${BASE}news/`], ["Aktienmagazin", `${BASE}magazin/`], ["Aktienreports", `${BASE}news/#reports`]]],
    ["Vertrauen", [["Daten und Methodik", "/infos/#quellen"], ["Häufige Fragen", `${BASE}faq/`], ["Kontakt", L.links.kontakt], ["Rechtliches &amp; Infos", "/infos/"]]]
  ];
  return `<footer class="foot"><div class="w"><div class="cols"><div class="about"><a class="brand" href="${BASE}">VISION UNIVERSE®</a><p>Die Analyse-App für Aktien, ETFs und Vorsorge. Klarheit statt Lärm.</p></div>
${cols.map(([t, l]) => `<div><h2>${t}</h2><ul>${l.map(([n, h]) => `<li><a href="${h}">${n}</a></li>`).join("")}</ul></div>`).join("\n")}</div>
<p class="legal">© 2026 Vision Universe® · Pflichthinweise und Rechtstexte im Menü unter „Rechtliches &amp; Infos“.</p></div></footer>`;
}

/* Leiste unten auf dem iPhone. „Module“ öffnet das Menü (site.js); ohne JavaScript führt der Link zur Übersicht der Bereiche. */
function dock(active, page) {
  const item = (k, href, icon, label, extra = "") => `<a href="${href}"${active === k ? ' class="on"' : ""}${page === k && k !== "module" ? ' aria-current="page"' : ""}${extra}>${icon}${label}</a>`;
  return `<nav class="dock" aria-label="Schnellzugriff">${item("start", BASE, I.home, "Start")}${item("module", `${BASE}app/#bereiche`, ic("layers", 20), "Module", ' data-mega aria-controls="mega" aria-expanded="false"')}${item("app", `${BASE}app/`, ic("chartbild", 20), "App")}${item("news", `${BASE}news/`, ic("insights", 20), "News")}${item("faq", `${BASE}faq/`, '<b aria-hidden="true">?</b>', "Fragen")}</nav>`;
}

function page({ path, title, desc, active, dockActive, body, main = "" }) {
  const url = `https://research.visionuniverse.de${BASE}${path}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
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
<link rel="icon" type="image/png" href="/assets/icons/icon-192.png">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}site.css">
<script src="${BASE}site.js" defer></script>
</head>
<body>
<!-- Erzeugt von products/website2/build.mjs. Nicht von Hand ändern. -->
${header(active)}
<main id="inhalt"${main}>
${body}
${final}
</main>
${footer()}
${dock(dockActive || active, active)}
</body>
</html>
`;
}

/* ---------- Kopfbild: Text links, Bühne mit kreisenden Modul-Symbolen und App-Film rechts ---------- */
const orbit = (r, ids, dur, rev) => `<div class="orb2" style="width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px;animation-duration:${dur}s${rev ? ";animation-direction:reverse" : ""}">${ids.map((id, i) => { const a = Math.round((360 / ids.length) * i * 100) / 100; return `<div class="pl" style="transform:rotate(${a}deg) translate(${r}px) rotate(${-a}deg)"><div class="icb pc" style="animation-duration:${dur}s${rev ? "" : ";animation-direction:reverse"}">${ic(id, 26)}</div></div>`; }).join("")}</div>`;
/* Der Film zeigt das freigegebene App-Konzept. Er läuft ohne Ton; site.js startet ihn, wenn er sichtbar ist und
   der Nutzer Bewegung nicht reduziert hat. Ohne JavaScript bleibt das Standbild stehen. */
const stage = `<div class="stg"><div aria-hidden="true"><div class="orb"></div>${orbit(296, ["discover", "fundamental", "supertrader", "elliott", "vorsorge", "insights", "screener"], 70)}${orbit(214, ["quant", "technical", "hedgefonds", "portfolios", "layers"], 50, 1)}</div><div class="dev"><video poster="${IMG}app-poster.jpg" width="520" height="1126" muted loop playsinline preload="none" data-autoplay aria-label="Die App von Vision Universe in Bewegung"><source src="${BASE}vid/app.mp4" type="video/mp4"></video></div>
<div class="fc a"><div class="eb">Quant · Beispiel NVIDIA</div><div class="fl g12"><b class="n">99</b><div><b>Verdient gut</b><div class="track"><i class="a-growx"></i></div></div></div></div>
<div class="fc b"><div class="eb">Supertrader</div><div class="n">13 Methoden</div><div class="s">täglich auf alle US-Aktien</div></div></div>`;
const hero = (h, sub, extra = "") => `<div class="heroX"><div class="w split"><div><span class="soon"><i></i>App bald verfügbar · zum Start kostenlos</span><h1 class="H1">${h}</h1><p class="ld">${sub}</p><div class="fl g12 wr acts">${cta()}${extra}</div>${badges}</div>${stage}</div></div>`;

/* ---------- Start ---------- */
function start() {
  const mq = NUMS.map(([n, t]) => `<b>${n}</b> ${t} &nbsp;·&nbsp; `).join("");
  const body = `${hero('Die Börse ist laut. Wir bringen <span class="hl">Ordnung</span> hinein.', "Die Analyse-App für Aktien, ETFs und Vorsorge. Jede Zahl mit Quelle und einem Satz, der sie erklärt.", `<a class="cta o" href="${BASE}app/">App ansehen</a>`)}
<div class="mq"><div><span>${mq}</span>${`<span aria-hidden="true">${mq}</span>`.repeat(3)}</div></div>
<section class="sec"><div class="w"><div class="eb">Elf Bereiche, ein Konto</div><h2 class="H2 head">Was willst du wissen?</h2><div class="bento">${MODULES.map((m, i) => tile(m, [0, 4, 7, 11].includes(i))).join("")}</div></div></section>
<section class="sec t0"><div class="w"><div class="blk split rv"><div class="duo">${dev("app-aktie.jpg", 240, "NVIDIA in der App")}${dev("app-module.jpg", 240, "NVIDIA: Analyse aus allen Modulen", "hide-m")}</div><div><div class="eb">Der Beweis · NVIDIA</div><h2 class="H2" style="margin:10px 0 14px">Eine Aktie. Sieben Blickwinkel.</h2><p class="ld">Andere Apps zeigen dir den Kurs. Vision Universe zeigt, was dahinter steckt, und sagt es in einem Satz.</p><div class="chips">${[["Zahlen", "„Wächst stark und verdient sehr gut.“"], ["Faktoren", "Verdient besser als 99 % aller US-Aktien."], ["Chart", "„Abwärtstrend“, mit Zonen laut Methode."]].map(([k, v]) => `<div class="chipq"><div class="eb">${k}</div><b>${v}</b></div>`).join("")}</div><p class="note">Beispiel NVIDIA, Datenstand 12.11.2026. Keine Anlageberatung, keine Empfehlung.</p></div></div></div></section>
<section style="padding-bottom:70px"><div class="w"><div class="eb">Die App</div><h2 class="H2" style="margin:10px 0 18px">Wisch dich durch.</h2></div>${rail([["app-home.jpg", "Home"], ["app-discover.jpg", "Discover"], ["app-quant.jpg", "Quant"], ["app-supertrader.jpg", "Supertrader"], ["app-technical.jpg", "Technical"], ["app-fundamental.jpg", "Fundamental"], ["app-hedgefonds.jpg", "Hedgefonds"], ["app-news.jpg", "News"]], "Ansichten der App, seitlich blättern")}</section>
<section class="sec t20"><div class="w split"><div class="rv"><div class="eb">Insights</div><h2 class="H2" style="margin:10px 0 14px">Immer das Neueste vorn.</h2><p class="ld">Jeden Werktag neue Artikel, jede Woche das Aktienmagazin, dazu ausführliche Aktienreports.</p><div class="fl g12 wr" style="margin-top:24px"><a class="cta" href="${BASE}news/">Zu den News ${I.chev}</a><a class="cta o" href="${BASE}magazin/">Aktienmagazin</a></div><a class="lv" href="/insights/" data-live-artikel><span class="eb">Neuester Artikel</span><b>Zu den neuesten Artikeln</b></a></div><a class="cov rv" href="${BASE}magazin/">${cover(`Aktienmagazin Nr. ${HEFT.nr}`)}</a></div></section>
<section class="sec t0"><div class="w"><div class="eb">Unsere Haltung</div><h2 class="H2 head">Daten statt Meinung.</h2><div class="bento">${[["Jede Zahl mit Quelle", "c-alt"], ["Jede Zahl erklärt", "c-soft"], ["Keine Empfehlung", "c-ink"], ["Keine Provision", "c-lime"]].map(([t, c], i) => `<div class="t ${c} h190 end rv"><div class="num" aria-hidden="true">0${i + 1}</div><h3 class="H3 b">${t}</h3></div>`).join("")}</div></div></section>
<section class="sec t0" id="fuer-wen"><div class="w"><div class="eb">Für wen</div><h2 class="H2 head">Wo stehst du gerade?</h2><div class="bento k1">${[["Sparplan ab 10 €", "„Ich fange gerade an.“", ["vorsorge", "discover", "fundamental"]], ["Privatanleger", "„Ich will meine Aktien verstehen.“", ["discover", "quant", "screener"]], ["Trader", "„Ich arbeite mit Charts und festen Regeln.“", ["technical", "supertrader", "elliott"]], ["Profi-Investoren", "„Ich will Tiefe: SEC-Daten, 13F, Backtests.“", ["fundamental", "hedgefonds", "quant"]]].map(([k, q, a]) => `<div class="t c-wht h230 rv"><div class="eb">${k}</div><h3 class="H3" style="margin-top:10px;font-size:26px;flex:1">${q}</h3><div class="fl g8">${a.map((id) => `<a class="icb" href="${modHref(id)}" aria-label="${MOD[id].name}" title="${MOD[id].name}">${ic(id, 24)}</a>`).join("")}</div></div>`).join("")}</div></div></section>`;
  return page({ path: "", title: "Vision Universe · Die Börse ist laut. Wir bringen Ordnung hinein.", desc: "Die Analyse-App für Aktien, ETFs und Vorsorge: jede Aktie aus sieben Blickwinkeln, jede Zahl mit Quelle und einem Satz, der sie erklärt. Bald für iPhone und Android.", active: "start", body });
}

/* ---------- App ---------- */
function app() {
  const body = `${hero('Eine App. <span class="hl">Jedes Gerät.</span>', "Vision Universe kommt für iPhone und Android und läuft im Browser auf Tablet und Desktop. Ein Konto, dieselbe Merkliste.")}
<section class="sec"><div class="w"><div class="eb">Bis zum Start</div><h2 class="H2 head">Drei Schritte, dann bist du dabei.</h2><div class="bento c3">${[["1", "E-Mail eintragen", "Auf www.visionuniverse.de. Mehr brauchen wir nicht.", "c-lime"], ["2", "Bestätigen", "Ein Klick auf den Link in der Bestätigungsmail.", "c-alt"], ["3", "Bescheid bekommen", "Zum Start kommt eine E-Mail mit dem Link zur App.", "c-ink"]].map(([n, t, s, c]) => `<div class="t ${c} rv"><div class="step" aria-hidden="true">${n}</div><h3 class="H3 b">${t}</h3><p class="q${c === "c-lime" ? " k" : ""}" style="margin-top:6px">${s}</p></div>`).join("")}</div></div></section>
<section style="padding-bottom:80px"><div class="w"><h2 class="H2" style="margin-bottom:18px">Klein fürs Sofa. Groß fürs Durchleuchten.</h2><p class="ld">Auf dem iPhone eine Spalte mit Leiste unten. Auf Tablet und Desktop die volle Breite für Charts, Listen und Filter.</p></div>${rail([["app-home.jpg", "Home"], ["app-universe.jpg", "Alle Module"], ["app-discover.jpg", "Discover"], ["app-aktie.jpg", "Die Aktie"], ["app-module.jpg", "Alle Module an der Aktie"], ["app-quant.jpg", "Quant"], ["app-supertrader.jpg", "Supertrader"], ["app-ich.jpg", "Ich"]], "Ansichten der App, seitlich blättern", " mt20")}</section>
<section class="sec t0" id="bereiche"><div class="w"><div class="eb">Alle Bereiche</div><h2 class="H2 head">Elf Bereiche, ein Konto.</h2><div class="bento">${MODULES.map((m) => tile(m)).join("")}</div></div></section>`;
  return page({ path: "app/", title: "App · Vision Universe", desc: "Vision Universe kommt als App für iPhone und Android. App bald verfügbar.", active: "app", body });
}

/* ---------- Modulseite ---------- */
function modulPage(m) {
  const others = MODULES.filter((x) => x.group === m.group && x.id !== m.id).concat(MODULES.filter((x) => x.group !== m.group)).slice(0, 4);
  const film = m.video
    ? `<section class="sec"><div class="w split"><div class="rv"><div class="eb">In 30 Sekunden erklärt</div><h2 class="H2" style="margin:10px 0 14px">${m.name} im Video.</h2><p class="ld">Jeder Bereich hat einen kurzen Film. Ton an, zurücklehnen.</p></div><div class="vidw"><div class="vid rv" data-vid><video poster="${IMG}p-${m.video}.jpg" width="720" height="1280" controls playsinline preload="none" aria-label="${esc(m.name)} in 30 Sekunden erklärt"><source src="${STORIES}${m.video}-v1.mp4" type="video/mp4"></video><button type="button" class="play" hidden aria-label="${esc(m.name)} im Video abspielen">${I.play}</button></div></div></div></section>`
    : '<div class="gap60"></div>';
  const body = `<div class="w ptop40"><div class="mh ${m.color}"><div class="split"><div><div class="fl g12"><div class="icb xl">${micon(m, 36)}</div><div><div class="grp">${m.group}</div><b class="mname">${m.name}</b></div></div><h1 class="H1">${m.q}</h1><p class="mlead">${m.lead}</p><div class="fl g12 wr acts">${cta(m.color === "c-ink" ? "l" : "")}</div><div class="msoon">App bald verfügbar</div></div><div class="mvis"><div class="gfx hide-m" aria-hidden="true">${G[m.id]}</div>${dev(m.shot, 270, `${m.name} in der App`).replace(' loading="lazy"', "")}</div></div></div>
<div class="bento c3 facts">${m.facts.map(([a, b], i) => `<div class="t ${["c-alt", "c-wht", "c-soft"][i]} h170 end rv"><div class="fact">${a}</div><b>${b}</b></div>`).join("")}</div></div>
${film}
<section class="sec t0"><div class="w"><h2 class="H2" style="margin-bottom:28px">Passt dazu.</h2><div class="bento">${others.map((x) => tile(x)).join("")}</div></div></section>`;
  return page({ path: `module/${m.id}/`, title: `${m.name} · Vision Universe`, desc: `${m.q} ${m.lead}`, active: "module", body });
}

/* ---------- News: die Artikel kommen bei jedem Aufruf aus /insights/artikel.json (site.js) ---------- */
const heftBlock = () => `<a class="blk split rv" href="${BASE}magazin/"><div class="cov">${cover(`Aktienmagazin Nr. ${HEFT.nr}`)}</div><div><span class="pill l">Aktienmagazin · jede Woche</span><h2 class="H2" style="margin:16px 0 12px"><span data-mag-nr>Nr. ${HEFT.nr}</span><br><span data-mag-titel>${HEFT.titel}</span></h2><p class="ld">Das Heft zur Börsenwoche. <span data-mag-seiten>${HEFT.seiten}</span> Seiten, online lesen oder als PDF.</p><span class="cta l" style="margin-top:24px">Heft ansehen ${I.chev}</span></div></a>`;
function news() {
  const body = `<div class="w ptop"><div class="fl g12 wr">${soon}<span class="pill l">Insights sind schon online</span></div><h1 class="H1" style="margin-top:20px">Was die Börse <span class="hl">heute</span> bewegt.</h1><p class="ld" style="margin-top:18px">Und was die Daten dazu sagen. Jeden Tag ein bis zwei Themen, recherchiert und mit Zahlen aus Vision Universe unterlegt.</p>
<div class="fl g8 wr tabs"><a class="pill" href="#artikel">Artikel</a><a class="pill o" href="${BASE}magazin/">Aktienmagazin</a><a class="pill o" href="#reports">Aktienreports</a></div>
<div id="artikel"><a class="art lead rv" href="/insights/" data-feed-lead><div class="cap"><span class="pill l">Insights</span><h2 class="H2">Zu den neuesten Artikeln</h2></div></a>
<div class="bento c3 feed" data-feed="5" data-feed-skip="1"></div>
<p class="more"><a class="cta o s" href="/insights/">Alle Artikel ${I.chev}</a></p></div></div>
<section class="sec"><div class="w">${heftBlock()}</div></section>
<section class="sec t0" id="reports"><div class="w"><div class="eb">Aktienreports</div><h2 class="H2" style="margin:10px 0 24px">Eine Firma, ein Heft.</h2><div class="t c-soft rep rv" data-live-report><div><div class="eb" data-live-report-kopf hidden></div><h3 class="H3" data-live-report-titel>Ausführliche Analysen einzelner Firmen.</h3></div><a class="cta s" href="/insights/reports/" data-live-report-link>Zu den Reports ${I.chev}</a></div></div></section>`;
  return page({ path: "news/", title: "News · Vision Universe", desc: "Neue Artikel an jedem Werktag, das Aktienmagazin und Aktienreports von Vision Universe.", active: "news", body });
}

/* ---------- Aktienmagazin: zeigt Heft Nr. 01 und führt zur echten Ausgabe unter /insights/magazin/ ---------- */
function magazin() {
  const body = `<div class="w ptop40"><div class="mh c-ink"><div class="split"><div><span class="pill l" data-mag-kopf>Aktienmagazin · Nr. ${HEFT.nr} · ${HEFT.datum}</span><h1 class="H1" style="margin-top:22px;font-size:clamp(46px,7.6vw,108px)" data-mag-h1>Die <span class="hl" style="color:var(--ink)">KI-Bremse</span></h1><p style="font-size:22px;color:#b9bec5;margin-top:18px;max-width:480px">Das Heft zur Börsenwoche. <span data-mag-seiten>${HEFT.seiten}</span> Seiten, online lesen oder als PDF.</p><div class="fl g12 wr" style="margin-top:28px"><a class="cta l" href="${HEFT.href}" data-mag-link>Heft lesen ${I.chev}</a><a class="cta g" href="${HEFT.href}vision-universe-aktienmagazin-${HEFT.nr}.pdf" data-mag-pdf>PDF</a></div><div class="stats">${[[`<span data-mag-seiten>${HEFT.seiten}</span>`, "Seiten"], ["1 ×", "pro Woche"], ["0 €", "zum Start"]].map(([a, b]) => `<div><div>${a}</div><b>${b}</b></div>`).join("")}</div></div><div class="cov x">${cover(`Titelseite Aktienmagazin Nr. ${HEFT.nr}`).replace(' loading="lazy"', "")}</div></div></div></div>
<section style="padding:70px 0 40px"><div class="w"><div class="eb">Blick ins Heft</div><h2 class="H2" style="margin:10px 0 8px">Blättern.</h2></div><div class="rail mid" tabindex="0" role="group" aria-label="Seiten aus dem Heft, seitlich blättern">${HEFT.blick.map((n) => `<img class="pg" src="${HEFT.href}seiten/s${nn(n)}.jpg" alt="Aktienmagazin Nr. ${HEFT.nr}, Seite ${n}" width="1100" height="1556" loading="lazy" decoding="async" data-mag-seite="${n}">`).join("")}</div></section>
<section class="sec t20"><div class="w"><div class="bento c3"><a class="t c-lime rv" href="${BASE}news/"><div class="icb">${ic("insights", 26)}</div><div class="sp"></div><h3 class="H3 b">Artikel</h3><p class="q k">Jeden Werktag neu.</p></a><div class="t c-alt rv"><div class="icb">${ic("insights", 26)}</div><div class="sp"></div><h3 class="H3 b">Nächste Ausgabe</h3><p class="q">Erscheint wöchentlich.</p></div><a class="t c-soft rv" href="${BASE}news/#reports"><div class="icb">${ic("insights", 26)}</div><div class="sp"></div><h3 class="H3 b">Aktienreports</h3><p class="q">Ausführliche Analysen einzelner Firmen.</p></a></div></div></section>`;
  return page({ path: "magazin/", title: "Aktienmagazin · Vision Universe", desc: "Das Aktienmagazin von Vision Universe: das Heft zur Börsenwoche, online lesen oder als PDF.", active: "magazin", dockActive: "news", body, main: ` data-mag="${HEFT.nr}"` });
}

/* ---------- Fragen ---------- */
function faq() {
  const L = legal();
  const body = `<div class="w ptop">${soon}<h1 class="H1" style="margin-top:20px">Gut zu <span class="hl">wissen.</span></h1><div class="split faqs"><div>${FAQ.map(([q, a], i) => `<details class="faq"${i < 4 ? " open" : ""}><summary><span>${q}</span><span class="pm" aria-hidden="true">+</span></summary><p>${a}</p></details>`).join("")}</div><div class="col g16 side"><div class="t c-lime h0"><h2 class="H3 b">Frage nicht dabei?</h2><p class="q k">Schreib uns über das Kontaktformular.</p><a class="cta s" href="${L.links.kontakt}">Schreib uns ${I.chev}</a></div><a class="t c-ink h0" href="${BASE}app/"><h2 class="H3 b">So sieht die App aus</h2><p class="q">Alle Bereiche im Überblick.</p></a></div></div></div>`;
  return page({ path: "faq/", title: "Häufige Fragen · Vision Universe", desc: "Antworten auf die häufigsten Fragen zu Vision Universe.", active: "faq", body });
}

export function buildSite() {
  return new Map([
    ["index.html", start()], ["app/index.html", app()],
    ...MODULES.map((m) => [`module/${m.id}/index.html`, modulPage(m)]),
    ["news/index.html", news()], ["magazin/index.html", magazin()], ["faq/index.html", faq()]
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--out");
  const dir = i > 0 ? process.argv[i + 1] : join(ROOT, "website2");
  const site = buildSite();
  for (const [p, html] of site) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), html); }
  console.log(`website2: ${site.size} Seiten nach ${dir}`);
}

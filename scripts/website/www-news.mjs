// www.visionuniverse.de: hält News, Aktienmagazin und Aktienreport auf der Website aktuell.
//
// Die Seiten unter landing/ (index.html, news/index.html, magazin/, report/) sind Handarbeit. Nur die Bereiche zwischen
// <!--NEWS:x--> und <!--/NEWS:x--> gehören diesem Skript: es füllt sie aus insights/artikel.json und
// products/insights/reports.json und kopiert die nötigen Bilder nach landing/web/img/news/.
// www lädt nichts von anderen Adressen nach; deshalb steht der Stand fest in der Seite.
// Aktienmagazin und Aktienreport gibt es auf www nur als Vorschau (Owner 17.11.2026): Titel, ein paar
// verschwommene Seiten, Inhalt und „Bald in der App“. Kein PDF, kein Link auf die volle Online-Fassung.
//
//   node scripts/website/www-news.mjs           schreibt landing/ neu (wenn sich etwas geändert hat)
//   node scripts/website/www-news.mjs --check   prüft nur (Exit 1, wenn www einen älteren Stand zeigt)
//
// products/insights/build.mjs ruft syncWww() nach jedem Bau auf: ein neuer Artikel, ein neues Heft oder
// ein neuer Report erscheint damit im selben Commit auf www (Cloudflare Pages baut landing/ dann neu).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LANDING = path.join(ROOT, "landing");
const IMG = path.join(LANDING, "web/img/news");
const RESEARCH = "https://research.visionuniverse.de";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
const nn = (n) => String(n).padStart(2, "0");
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h14M12.5 6l6 6-6 6"/></svg>';
const ext = (p) => path.extname(p).toLowerCase() || ".jpg";
const slug = (s) => s.replace(/^\/|\/$/g, "").split("/").pop();

/** Liest den Insights-Stand und legt fest, welche Bilder www braucht (Ziel → Quelle). */
export function readState() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, "insights/artikel.json"), "utf8"));
  const reportsMeta = JSON.parse(fs.readFileSync(path.join(ROOT, "products/insights/reports.json"), "utf8")).reports || [];
  const hefteMeta = JSON.parse(fs.readFileSync(path.join(ROOT, "products/insights/magazin.json"), "utf8")).ausgaben || [];
  const files = new Map();
  const add = (name, from) => { if (fs.existsSync(path.join(ROOT, from))) { files.set(name, from); return name; } return null; };
  // Nur Bilder im Querformat 16:9 (bildQuer, products/insights/build.mjs); sonst kein Bild statt eines verzerrten Ausschnitts.
  const artikel = list.artikel.map((a) => ({ ...a, img: a.bildQuer ? add(`art-${a.slug}${ext(a.bildQuer)}`, a.bildQuer.replace(/^\//, "")) : null }));
  if (!artikel.length) throw new Error("insights/artikel.json enthält keinen Artikel.");
  const h = list.magazin && list.magazin[0];
  if (!h) throw new Error("insights/artikel.json enthält kein Heft.");
  const hq = h.href.replace(/^\//, "");
  const hm = hefteMeta.find((x) => x.nr === h.nr) || {};
  const heft = { ...h, unterzeile: hm.unterzeile || "", inhalt: hm.inhalt || [], cover: add(`mag-${h.nr}-cover.jpg`, (h.cover || `/${hq}cover.jpg`).replace(/^\//, "")),
    pages: [5, 3, 2].map((n) => add(`mag-${h.nr}-s${nn(n)}.jpg`, `${hq}seiten/s${nn(n)}.jpg`)).filter(Boolean),
    preview: [2, 5, 6, 8].map((n) => add(`mag-${h.nr}-s${nn(n)}.jpg`, `${hq}seiten/s${nn(n)}.jpg`)).filter(Boolean) };
  const r = list.reports && list.reports[0];
  let report = null;
  if (r) {
    const meta = reportsMeta.find((x) => x.href === r.href) || {};
    const rq = r.href.replace(/^\//, ""), id = slug(r.href);
    report = { ...r, nr: meta.nr || "01", seiten: meta.seiten || "", inhalt: (meta.inhalt || []).slice(0, 5), alles: meta.inhalt || [], text: meta.text || "", unterzeile: meta.unterzeile || "",
      preview: [2, 3].map((n) => add(`rep-${id}-s${nn(n)}.jpg`, `${rq}seiten/s${nn(n)}.jpg`)).filter(Boolean),
      cover: add(`rep-${id}-cover.jpg`, `${rq}cover.jpg`), pages: [3, 2, 2].map((n) => add(`rep-${id}-s${nn(n)}.jpg`, `${rq}seiten/s${nn(n)}.jpg`)).filter(Boolean) };
  }
  return { artikel, heft, report, files };
}

const link = (href) => RESEARCH + href;
const img = (R, name, alt = "", extra = "") => name ? `<img src="${R}web/img/news/${name}" alt="${esc(alt)}"${extra}>` : "";


const ICON_APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8C7 7.4 5.6 8.3 4.8 9.7c-1.6 2.8-.4 6.9 1.2 9.1.8 1.1 1.7 2.3 2.8 2.3 1.1 0 1.6-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.3-.9-2.1-3.7zM14.2 5.8c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.6 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z"/></svg>';
const ICON_ANDROID = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 9.5l1.7-2.9a.4.4 0 0 0-.7-.4l-1.7 3a10.6 10.6 0 0 0-9.8 0l-1.7-3a.4.4 0 0 0-.7.4l1.7 2.9A9.6 9.6 0 0 0 2 17.2h20a9.6 9.6 0 0 0-4.4-7.7zM7.4 14.4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm9.2 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';
const soon = (R) => `<p class="soon"><span class="os">${ICON_APPLE}${ICON_ANDROID}</span>Bald in der App verfügbar</p>`;
const storesBlock = (R) => `<div class="stores"><div class="b"><img src="${R}web/img/badge-apple.svg" alt="Laden im App Store (bald verfügbar)" width="120" height="40"><img src="${R}web/img/badge-google.png" alt="Jetzt bei Google Play (bald verfügbar)" width="646" height="192"></div><p class="cap"><b>Bald im App Store und bei Google Play</b>Zum Start kostenlos</p></div>`;
const cta = (R) => `<div class="pvcta"><a class="btn" href="${R}#newsletter"><span>Zum Start benachrichtigen</span><span class="dot">${ARROW}</span></a></div>`;

// Unterseiten (Owner 22.11.2026): das Inhaltsverzeichnis zeigt sechs Themen, der Rest klappt auf.
const tocShort = (toc) => { const li = toc.match(/<li>[\s\S]*?<\/li>/g) || [];
  return li.length <= 6 ? `<ol class="pvtoc">${toc}</ol>` : `<ol class="pvtoc">${li.slice(0, 6).join("")}</ol><details class="pvmore"><summary>Alle ${li.length} Themen anzeigen</summary><ol class="pvtoc" start="7">${li.slice(6).join("")}</ol></details>`; };
/** Vorschau-Seite für Heft oder Report: Titel, Erklärung, verschwommene Seiten, Inhalt, „Bald in der App“. */
function preview(R, { kicker, h1, lead, about, titel, unterzeile, cover, coverAlt, pages, inhalt, what }) {
  const stack = `<div class="m3 pvm" aria-hidden="true">${pages.slice(0, 3).map((p, i) => `<span class="pg p${i + 1}">${img(R, p)}</span>`).join("")}<span class="cv">${img(R, cover)}<i class="shine"></i></span></div>`;
  const toc = inhalt.map(([p, r, t]) => `<li><b>S. ${esc(p)}</b><span><small>${esc(r)}</small>${esc(t)}</span></li>`).join("");
  const peek = pages.map((p) => `<figure class="pvp">${img(R, p)}<figcaption>Ganz lesen in der App</figcaption></figure>`).join("");
  return `<section class="ahero pvhero" data-hero><div>${soon(R)}<p class="k pvk">${esc(kicker)}</p><h1>${h1}</h1><p class="t">${esc(lead)}</p>${cta(R)}${storesBlock(R)}</div>`
    + `<div class="pvcover">${stack}<p class="pvnow"><small>Aktuelle Ausgabe</small><b>${esc(titel)}</b></p></div></section>`
    + `<section class="full pvabout"><h2>Was ist das?</h2><div class="pvgrid"><div><p class="t">${esc(about)}</p><ul class="pvwhat">${what.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
    + `<div class="pvissue"><span class="k">Aktuelle Ausgabe</span><h3>${esc(titel)}</h3>${unterzeile ? `<p>${esc(unterzeile)}</p>` : ""}</div></div></section>`
    + `<section class="full"><h2>Ein Blick hinein</h2><p class="t pvnote">Hier siehst du nur eine Vorschau. Lesen kannst du ${esc(coverAlt)} bald in der App.</p><div class="pvpeek">${peek}</div></section>`
    + (toc ? `<section class="full"><h2>Das steht drin</h2>${tocShort(toc)}</section>` : "")
    + `<section class="full pvend"><div class="pvbox">${soon(R)}<h2>Bald in der App.</h2><p class="t">Trag dich ein, dann sagen wir dir Bescheid, sobald die App da ist.</p>${cta(R)}${storesBlock(R)}</div></section>`;
}

/** Inhalt der Bereiche je Seite. */
export function regions(state) {
  const { artikel, heft, report } = state, a0 = artikel[0];
  // Startseite (Owner 22.11.2026): Aktienmagazin und Aktienreport als eigener Abschnitt über den News,
  // darunter die News-Bühne: großer Aufmacher (wechselt im Browser, web/home.js) und eine Reihe „Neu bei Vision Universe“.
  const pubs = (R) => {
    const card = (cls, href, cover, alt, k, t, e) => `<a class="pub${cls}" href="${R}${href}"><span class="pub-c">${img(R, cover, alt, ' loading="lazy"')}</span><span class="pub-t"><small>${k}</small><b>${esc(t)}</b><em>${e}</em><i>Reinschauen →</i></span></a>`;
    const mag = card("", "magazin/", heft.cover, `Titel des Aktienmagazins, KW ${heft.kw}`, "Aktienmagazin · jede Woche", heft.titel, `Ausgabe KW ${esc(heft.kw)} · ${esc(heft.seiten)} Seiten`);
    const rep = report ? card(" dk", "report/", report.cover, `Titel des Aktienreports: ${report.titel}`, "Aktienreport · eine Aktie im Detail", report.titel, `Nr. ${esc(report.nr)}${report.seiten ? ` · ${esc(report.seiten)} Seiten` : ""}`) : "";
    return `<div class="pubs-g">${mag}${rep}</div>`;
  };
  const vwCard = (R, x) => `<a class="vw-card" href="${link(x.href)}">${x.img ? `<img src="${R}web/img/news/${x.img}" alt="" loading="lazy">` : ""}<span><small>${esc(x.rubrik)} · ${dmy(x.datum)}</small><b>${esc(x.titel)}</b><em>${esc(x.teaser)}</em></span></a>`;
  const tv = (R, all = `${R}news/`) => `<div class="vw-bill">${a0.img ? `<img class="bg" src="${R}web/img/news/${a0.img}" alt="">` : ""}<div class="w"><p class="vw-tag">${esc(a0.rubrik)} · ${dmy(a0.datum)}</p><h2>${esc(a0.titel)}</h2><p>${esc(a0.teaser)}</p>`
    + `<div class="vw-bbtn"><a class="p" href="${link(a0.href)}">▶ Jetzt lesen</a><a class="s" href="${all}">Alle News</a></div></div></div>`
    + `<div class="vw-rows"><div class="vw-row"><div class="vw-rh w"><h3>Neu bei Vision Universe</h3><span class="vw-rh-r"><a href="${all}">Alle News</a><span class="vw-arr"><button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button></span></span></div>`
    + `<div class="vw-track">${artikel.slice(1, 15).map((x) => vwCard(R, x)).join("")}</div></div></div>`;
  // News-Seite „Top Shelf“ (Owner 22.11.2026, nach Apple TV): oben die fünf neuesten Artikel zum Wischen, darunter alle
  // weiteren nach Datum, dann „Nach Aktien“ und „Nach Themen“ (Felder firma/themen der Artikel) und Magazin/Report.
  // Bilder füllen ihren Rahmen im Format 16:9; Artikelbilder sind 16:9 mit mindestens 1600 px (products/insights/tests).
  const topShelf = (R) => {
    const pic = (x, lazy = true) => x.img ? `<img src="${R}web/img/news/${x.img}" alt=""${lazy ? ' loading="lazy"' : ""}>` : '<span class="ts-noimg"></span>';
    const meta = (x) => `${dmy(x.datum)} · ${esc(x.rubrik)}`;
    const card = (x) => `<a class="ts-c" data-tk="${esc(x.firma?.ticker || "")}" data-th="${esc((x.themen || []).join("|"))}" href="${link(x.href)}"><span class="ts-im">${pic(x)}</span><small>${meta(x)}</small><b>${esc(x.titel)}</b></a>`;
    const arrows = '<span class="ts-arr"><button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button></span>';
    const shelf = (id, h, inner, cls = "") => `<section class="ts-shelf${cls}"${id ? ` id="${id}"` : ""}><div class="w ts-sh"><h2>${h} <span aria-hidden="true">›</span></h2>${arrows}</div><div class="ts-track">${inner}</div></section>`;
    const hero = artikel.slice(0, 5), rest = artikel.slice(5);
    const slides = hero.map((x, i) => `<div class="ts-sl${i ? "" : " on"}"${i ? ' aria-hidden="true"' : ""}><div class="ts-art">${pic(x, i > 0)}</div><div class="ts-tx"><div class="w"><div>`
      + `<p class="ts-k">${esc(x.rubrik)} · ${dmy(x.datum)}</p><h2>${esc(x.titel)}</h2><p class="ts-p">${esc(x.teaser)}</p>`
      + `<div class="ts-btns"><a class="ts-b1" href="${link(x.href)}"${i ? ' tabindex="-1"' : ""}>▶ Jetzt lesen</a><a class="ts-b2" href="#neueste"${i ? ' tabindex="-1"' : ""}>Alle Artikel</a></div></div></div></div></div>`).join("");
    const dots = hero.map((x, i) => `<button type="button" aria-label="Artikel ${i + 1} von ${hero.length}"><i></i></button>`).join("");
    const count = (keyOf) => { const m = new Map(); for (const x of artikel) for (const k of keyOf(x)) m.set(k, (m.get(k) || 0) + 1); return m; };
    const fc = count((x) => (x.firma ? [x.firma.ticker] : [])), names = new Map(artikel.filter((x) => x.firma).map((x) => [x.firma.ticker, x.firma.name]));
    const firms = [...fc.keys()].sort((a, b) => fc.get(b) - fc.get(a) || names.get(a).localeCompare(names.get(b), "de"));
    const tc = count((x) => x.themen || []), themes = [...tc.keys()].filter((t) => tc.get(t) >= 2).sort((a, b) => tc.get(b) - tc.get(a) || a.localeCompare(b, "de"));
    const n = (k) => `${k} Artikel`;
    const longest = (s) => Math.max(...s.split(/\s+/).map((w) => w.length));
    const fsize = (s) => Math.min(14, Math.floor(130 / Math.max(6, longest(s))));
    const firmItems = firms.map((t) => `<button class="ts-f" type="button" data-k="${esc(t)}"><span style="font-size:${fsize(names.get(t))}px">${esc(names.get(t))}</span><small>${n(fc.get(t))}</small></button>`).join("");
    const themeItems = themes.map((t) => `<button class="ts-t" type="button" data-k="${esc(t)}"><b>${esc(t)}</b><small>${n(tc.get(t))}</small></button>`).join("");
    const all = artikel.map(card).join("");
    const pick = (kind, h, items, label) => `<section class="ts-shelf ts-pick" data-kind="${kind}"><div class="w ts-sh"><h2>${h} <span aria-hidden="true">›</span></h2></div>`
      + `<div class="ts-track ts-chips">${items}</div><div class="w ts-sh ts-ph"><h3>${label}</h3>${arrows}</div><div class="ts-track ts-res">${all}</div></section>`;
    const pub = (href, cover, k, t) => cover ? `<a class="ts-p2" href="${R}${href}"><span class="ts-im">${img(R, cover, "", ' loading="lazy"')}</span><small>${k}</small><b>${esc(t)}</b></a>` : "";
    const pubs = pub("magazin/", heft.cover, `Aktienmagazin · KW ${esc(heft.kw)}`, heft.titel) + (report ? pub("report/", report.cover, "Aktienreport", report.titel) : "");
    return `<section class="ts-hero" aria-roledescription="Karussell" aria-label="Die neuesten Artikel">${slides}<div class="ts-dots"><div class="w">${dots}</div></div></section>`
      + shelf("neueste", "Neueste Artikel", rest.map(card).join(""))
      + (firms.length ? pick("tk", "Nach Aktien", firmItems, "Artikel zur Aktie") : "")
      + (themes.length ? pick("th", "Nach Themen", themeItems, "Artikel zum Thema") : "")
      + shelf("", "Zum Durchblättern", pubs, " ts-pubs")
      + `<p class="w ts-stand">Stand ${dmy(a0.datum)} · ${artikel.length} Artikel</p>`;
  };
  return {
    "index.html": { pubs: pubs("./"), tv: tv("./") },
    "magazin/index.html": { page: preview("../", { kicker: `Aktienmagazin · Nr. ${heft.nr} · KW ${heft.kw}`, h1: "Das <mark>Aktienmagazin.</mark>",
      lead: `Jede Woche ein neues Heft: was an der Börse los war, einfach erklärt. ${heft.seiten} Seiten zum Durchblättern.`,
      about: "Das Aktienmagazin ist unser Wochenheft. Es fasst die Börsenwoche zusammen und erklärt die wichtigsten Aktien in einfachen Sätzen, mit Bildern und Charts.",
      what: ["Das Titelthema der Woche, ausführlich erklärt", "Aktien, die besonders stark gestiegen oder gefallen sind", "Was die großen Anleger gekauft und verkauft haben", "Chart der Woche, Termine und Quick-Check"],
      titel: heft.titel, unterzeile: heft.unterzeile, cover: heft.cover, coverAlt: "das ganze Heft", pages: heft.preview, inhalt: heft.inhalt }) },
    ...(report ? { "report/index.html": { page: preview("../", { kicker: `${report.art} · Nr. ${report.nr}${report.seiten ? ` · ${report.seiten} Seiten` : ""}`, h1: "Der <mark>Aktienreport.</mark>",
      lead: `Eine Aktie, ganz genau: ${report.seiten || "Viele"} Seiten über eine Firma, ihr Geschäft und ihre Zahlen.`,
      about: "Der Aktienreport nimmt sich eine einzige Firma vor: Wie verdient sie ihr Geld? Was sagen die Zahlen? Was spricht für die Aktie, was dagegen? Alles einfach erklärt.",
      what: ["Die Firma und ihr Geschäft", "Umsatz, Gewinn und Bewertung über viele Jahre", "Chart und was die großen Anleger tun", "Was für die Aktie spricht und was dagegen"],
      titel: report.titel, unterzeile: report.unterzeile, cover: report.cover, coverAlt: "den ganzen Report", pages: report.preview, inhalt: report.alles }) } } : {}),
    // News-Seite (Owner 17.11.2026): nur Artikel; Magazin und Aktienreports haben eigene Seiten im Menü.
    // Großer gestalteter Kopf steht fest in news/index.html (kein Tagesbild oben); hier nur die Artikel als kleine Kacheln.
    "news/index.html": { page: topShelf("../") }
  };
}

function fill(html, name, parts, file) {
  for (const [k, v] of Object.entries(parts)) {
    const re = new RegExp(`<!--NEWS:${k}-->[\\s\\S]*?<!--/NEWS:${k}-->`);
    if (!re.test(html)) throw new Error(`${file}: Marke <!--NEWS:${k}--> fehlt`);
    html = html.replace(re, () => `<!--NEWS:${k}-->${v}<!--/NEWS:${k}-->`);
  }
  return html;
}

/** Bringt landing/ auf den Insights-Stand. check: nichts schreiben, nur melden. Gibt die veralteten Dateien zurück. */
export function syncWww({ check = false } = {}) {
  const state = readState(), stale = [];
  for (const [page, parts] of Object.entries(regions(state))) {
    const file = path.join(LANDING, page), now = fs.readFileSync(file, "utf8"), next = fill(now, page, parts, `landing/${page}`);
    if (now !== next) { stale.push(`landing/${page}`); if (!check) fs.writeFileSync(file, next); }
  }
  fs.mkdirSync(IMG, { recursive: true });
  for (const f of fs.readdirSync(IMG)) if (!state.files.has(f)) { stale.push(`landing/web/img/news/${f}`); if (!check) fs.rmSync(path.join(IMG, f)); }
  for (const [to, from] of state.files) {
    const dest = path.join(IMG, to), src = fs.readFileSync(path.join(ROOT, from));
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(src)) continue;
    stale.push(`landing/web/img/news/${to}`); if (!check) fs.writeFileSync(dest, src);
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check"), stale = syncWww({ check });
  if (check && stale.length) { console.error("www zeigt einen älteren Insights-Stand (node scripts/website/www-news.mjs): " + stale.join(", ")); process.exit(1); }
  console.log(`www-news: ${check ? "geprüft" : stale.length ? "geschrieben: " + stale.length : "unverändert"}`);
}

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
const HERO_ARTICLES = 8;

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
  const artikel = list.artikel.map((a) => ({ ...a, img: a.bild ? add(`art-${a.slug}${ext(a.bild)}`, a.bild.replace(/^\//, "")) : null }));
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

function heftCard(R, h, id = "") {
  const pages = h.pages.map((p, i) => `<span class="pg p${i + 1}">${img(R, p)}</span>`).join("");
  return `<a class="magf"${id ? ` id="${id}"` : ""} href="${R}magazin/"><div class="mtext"><span class="k">Aktienmagazin · Nr. ${esc(h.nr)} · KW ${esc(h.kw)}</span>`
    + `<h3>${esc(h.titel)}</h3><p>Das Wochenheft: ${esc(h.seiten)} Seiten, jede Woche neu. Bald in der App.</p>`
    + `<span class="btn"><span>Vorschau ansehen</span><span class="dot">${ARROW}</span></span></div>`
    + `<div class="m3" aria-hidden="true">${pages}<span class="cv">${img(R, h.cover)}<i class="shine"></i></span></div></a>`;
}
function reportCard(R, r, id = "") {
  if (!r) return "";
  const toc = r.inhalt.map(([p, , t]) => `<li><b>S. ${esc(p)}</b>${esc(t)}</li>`).join("");
  const pages = r.pages.map((p, i) => `<span class="pg p${i + 1}">${img(R, p)}</span>`).join("");
  return `<a class="magf repv"${id ? ` id="${id}"` : ""} href="${R}report/"><div class="mtext"><span class="k">${esc(r.art)} · Nr. ${esc(r.nr)}${r.seiten ? ` · ${esc(r.seiten)} Seiten` : ""}</span>`
    + `<h3>${esc(r.titel)}</h3>${toc ? `<ol class="toc">${toc}</ol>` : ""}`
    + `<span class="btn"><span>Vorschau ansehen</span><span class="dot">${ARROW}</span></span></div>`
    + `<div class="m3" aria-hidden="true">${pages}<span class="cv">${img(R, r.cover)}<i class="shine"></i></span></div></a>`;
}
const lead = (R, a) => `<a class="lead-n" href="${link(a.href)}">${img(R, a.img)}<span class="nmeta"><span class="pill up">${esc(a.rubrik)}</span><span>${dmy(a.datum)}</span></span><h3>${esc(a.titel)}</h3><p>${esc(a.teaser)}</p></a>`;
const box = (R, a, teaser = false) => `<a class="box" href="${link(a.href)}">${a.img ? `<img class="pic" src="${R}web/img/news/${a.img}" alt="" loading="lazy">` : ""}<span class="k">${esc(a.rubrik)} · ${dmy(a.datum)}</span><h3>${esc(a.titel)}</h3>${teaser ? `<p class="mute">${esc(a.teaser)}</p>` : ""}</a>`;
const stand = (a) => `<p class="nstand"><span class="live"><i aria-hidden="true"></i>Stand ${dmy(a.datum)}</span></p>`;

const ICON_APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8C7 7.4 5.6 8.3 4.8 9.7c-1.6 2.8-.4 6.9 1.2 9.1.8 1.1 1.7 2.3 2.8 2.3 1.1 0 1.6-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.3-.9-2.1-3.7zM14.2 5.8c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.6 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z"/></svg>';
const ICON_ANDROID = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 9.5l1.7-2.9a.4.4 0 0 0-.7-.4l-1.7 3a10.6 10.6 0 0 0-9.8 0l-1.7-3a.4.4 0 0 0-.7.4l1.7 2.9A9.6 9.6 0 0 0 2 17.2h20a9.6 9.6 0 0 0-4.4-7.7zM7.4 14.4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm9.2 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';
const soon = (R) => `<p class="soon"><span class="os">${ICON_APPLE}${ICON_ANDROID}</span>Bald in der App verfügbar</p>`;
const storesBlock = (R) => `<div class="stores"><div class="b"><img src="${R}web/img/badge-apple.svg" alt="Laden im App Store (bald verfügbar)" width="120" height="40"><img src="${R}web/img/badge-google.png" alt="Jetzt bei Google Play (bald verfügbar)" width="646" height="192"></div><p class="cap"><b>Bald im App Store und bei Google Play</b>Zum Start kostenlos</p></div>`;
const cta = (R) => `<div class="pvcta"><a class="btn" href="${R}#newsletter"><span>Zum Start benachrichtigen</span><span class="dot">${ARROW}</span></a></div>`;

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
    + (toc ? `<section class="full"><h2>Das steht drin</h2><ol class="pvtoc">${toc}</ol></section>` : "")
    + `<section class="full pvend"><div class="pvbox">${soon(R)}<h2>Bald in der App.</h2><p class="t">Trag dich ein, dann sagen wir dir Bescheid, sobald die App da ist.</p>${cta(R)}${storesBlock(R)}</div></section>`;
}

/** Inhalt der Bereiche je Seite. */
export function regions(state) {
  const { artikel, heft, report } = state, a0 = artikel[0];
  const hero = (R) => {
    const cards = artikel.slice(0, HERO_ARTICLES).map((x) => `<a class="hlc" href="${link(x.href)}">${x.img ? `<img src="${R}web/img/news/${x.img}" alt="" loading="lazy">` : ""}<span><small>${esc(x.rubrik)} · ${dmy(x.datum)}</small><b>${esc(x.titel)}</b></span></a>`).join("");
    const mag = `<a class="hlm" href="${R}magazin/">${img(R, heft.cover, "Titel des aktuellen Aktienmagazins")}<span><small>Aktienmagazin · KW ${esc(heft.kw)}</small><b>${esc(heft.titel)}</b><em>${esc(heft.seiten)} Seiten</em></span></a>`;
    const rep = report ? `<a class="hlm" href="${R}report/">${img(R, report.cover, "Titel des aktuellen Aktienreports")}<span><small>${esc(report.art)} · Nr. ${esc(report.nr)}</small><b>${esc(report.titel)}</b>${report.seiten ? `<em>${esc(report.seiten)} Seiten</em>` : ""}</span></a>` : "";
    return `<div class="hlnews">${cards}</div><div class="hlfix">${mag}${rep}</div>`;
  };
  // Startseite (Owner 17.11.2026): kompakt, viele kleine Kacheln statt großer Karten. Die News-Seite bleibt groß.
  const tile = (R, x) => `<a class="ntile" href="${link(x.href)}">${x.img ? `<img src="${R}web/img/news/${x.img}" alt="" loading="lazy">` : "<span class=\"noimg\"></span>"}<span class="k">${esc(x.rubrik)} · ${dmy(x.datum)}</span><b>${esc(x.titel)}</b></a>`;
  const compact = (R) => `<div class="ncompact"><div class="nfix">${hero(R).split('<div class="hlfix">')[1].replace(/<\/div>$/, "")}</div>`
    + `<div class="ntiles">${artikel.slice(0, 8).map((x) => tile(R, x)).join("")}</div></div>`;
  const grid = (R, n, ids) => `<div class="newsgrid">${lead(R, a0)}${heftCard(R, heft, ids ? "magazin" : "")}${reportCard(R, report, ids ? "report" : "")}<div class="n3">${artikel.slice(1, 1 + n).map((x) => box(R, x)).join("")}</div></div>`;
  return {
    "index.html": { hero: hero("./"), start: stand(a0) + compact("./") },
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
    "news/index.html": { page: `<section class="full nfirst">${stand(a0)}${grid("../", 3, true)}</section><section class="full"><h2>Alle Artikel</h2><div class="alist">${artikel.map((x) => box("../", x, true)).join("")}</div></section>` }
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

// www.visionuniverse.de: hält News, Aktienmagazin und Aktienreport auf der Website aktuell.
//
// Die Seiten unter landing/ (index.html, news/index.html) sind Handarbeit. Nur die Bereiche zwischen
// <!--NEWS:x--> und <!--/NEWS:x--> gehören diesem Skript: es füllt sie aus insights/artikel.json und
// products/insights/reports.json und kopiert die nötigen Bilder nach landing/web/img/news/.
// www lädt nichts von anderen Adressen nach; deshalb steht der Stand fest in der Seite.
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
  const files = new Map();
  const add = (name, from) => { if (fs.existsSync(path.join(ROOT, from))) { files.set(name, from); return name; } return null; };
  const artikel = list.artikel.map((a) => ({ ...a, img: a.bild ? add(`art-${a.slug}${ext(a.bild)}`, a.bild.replace(/^\//, "")) : null }));
  if (!artikel.length) throw new Error("insights/artikel.json enthält keinen Artikel.");
  const h = list.magazin && list.magazin[0];
  if (!h) throw new Error("insights/artikel.json enthält kein Heft.");
  const hq = h.href.replace(/^\//, "");
  const heft = { ...h, cover: add(`mag-${h.nr}-cover.jpg`, (h.cover || `/${hq}cover.jpg`).replace(/^\//, "")),
    pages: [5, 3, 2].map((n) => add(`mag-${h.nr}-s${nn(n)}.jpg`, `${hq}seiten/s${nn(n)}.jpg`)).filter(Boolean) };
  const r = list.reports && list.reports[0];
  let report = null;
  if (r) {
    const meta = reportsMeta.find((x) => x.href === r.href) || {};
    const rq = r.href.replace(/^\//, ""), id = slug(r.href);
    report = { ...r, nr: meta.nr || "01", seiten: meta.seiten || "", inhalt: (meta.inhalt || []).slice(0, 5),
      cover: add(`rep-${id}-cover.jpg`, `${rq}cover.jpg`), pages: [3, 2, 2].map((n) => add(`rep-${id}-s${nn(n)}.jpg`, `${rq}seiten/s${nn(n)}.jpg`)).filter(Boolean) };
  }
  return { artikel, heft, report, files };
}

const link = (href) => RESEARCH + href;
const img = (R, name, alt = "", extra = "") => name ? `<img src="${R}web/img/news/${name}" alt="${esc(alt)}"${extra}>` : "";

function heftCard(R, h, id = "") {
  const pages = h.pages.map((p, i) => `<span class="pg p${i + 1}">${img(R, p)}</span>`).join("");
  return `<a class="magf"${id ? ` id="${id}"` : ""} href="${link(h.href)}"><div class="mtext"><span class="k">Aktienmagazin · Nr. ${esc(h.nr)} · KW ${esc(h.kw)}</span>`
    + `<h3>${esc(h.titel)}</h3><p>Das Wochenheft: ${esc(h.seiten)} Seiten, jede Woche neu. Als PDF und zum Blättern.</p>`
    + `<span class="btn"><span>Heft öffnen</span><span class="dot">${ARROW}</span></span></div>`
    + `<div class="m3" aria-hidden="true">${pages}<span class="cv">${img(R, h.cover)}<i class="shine"></i></span></div></a>`;
}
function reportCard(R, r, id = "") {
  if (!r) return "";
  const toc = r.inhalt.map(([p, , t]) => `<li><b>S. ${esc(p)}</b>${esc(t)}</li>`).join("");
  const pages = r.pages.map((p, i) => `<span class="pg p${i + 1}">${img(R, p)}</span>`).join("");
  return `<a class="magf repv"${id ? ` id="${id}"` : ""} href="${link(r.href)}"><div class="mtext"><span class="k">${esc(r.art)} · Nr. ${esc(r.nr)}${r.seiten ? ` · ${esc(r.seiten)} Seiten` : ""}</span>`
    + `<h3>${esc(r.titel)}</h3>${toc ? `<ol class="toc">${toc}</ol>` : ""}`
    + `<span class="btn"><span>Report öffnen</span><span class="dot">${ARROW}</span></span></div>`
    + `<div class="m3" aria-hidden="true">${pages}<span class="cv">${img(R, r.cover)}<i class="shine"></i></span></div></a>`;
}
const lead = (R, a) => `<a class="lead-n" href="${link(a.href)}">${img(R, a.img)}<span class="nmeta"><span class="pill up">${esc(a.rubrik)}</span><span>${dmy(a.datum)}</span></span><h3>${esc(a.titel)}</h3><p>${esc(a.teaser)}</p></a>`;
const box = (R, a, teaser = false) => `<a class="box" href="${link(a.href)}">${a.img ? `<img class="pic" src="${R}web/img/news/${a.img}" alt="" loading="lazy">` : ""}<span class="k">${esc(a.rubrik)} · ${dmy(a.datum)}</span><h3>${esc(a.titel)}</h3>${teaser ? `<p class="mute">${esc(a.teaser)}</p>` : ""}</a>`;
const stand = (a) => `<p class="nstand"><span class="live"><i aria-hidden="true"></i>Stand ${dmy(a.datum)}</span></p>`;

/** Inhalt der Bereiche je Seite. */
export function regions(state) {
  const { artikel, heft, report } = state, a0 = artikel[0];
  const hero = (R) => {
    const cards = artikel.slice(0, HERO_ARTICLES).map((x) => `<a class="hlc" href="${link(x.href)}">${x.img ? `<img src="${R}web/img/news/${x.img}" alt="" loading="lazy">` : ""}<span><small>${esc(x.rubrik)} · ${dmy(x.datum)}</small><b>${esc(x.titel)}</b></span></a>`).join("");
    const mag = `<a class="hlm" href="${link(heft.href)}">${img(R, heft.cover, "Titel des aktuellen Aktienmagazins")}<span><small>Aktienmagazin · KW ${esc(heft.kw)}</small><b>${esc(heft.titel)}</b><em>${esc(heft.seiten)} Seiten</em></span></a>`;
    const rep = report ? `<a class="hlm" href="${link(report.href)}">${img(R, report.cover, "Titel des aktuellen Aktienreports")}<span><small>${esc(report.art)} · Nr. ${esc(report.nr)}</small><b>${esc(report.titel)}</b>${report.seiten ? `<em>${esc(report.seiten)} Seiten</em>` : ""}</span></a>` : "";
    return `<div class="hlnews">${cards}</div><div class="hlfix">${mag}${rep}</div>`;
  };
  const grid = (R, n, ids) => `<div class="newsgrid">${lead(R, a0)}${heftCard(R, heft, ids ? "magazin" : "")}${reportCard(R, report, ids ? "report" : "")}<div class="n3">${artikel.slice(1, 1 + n).map((x) => box(R, x)).join("")}</div></div>`;
  return {
    "index.html": { hero: hero("./"), start: stand(a0) + grid("./", 3, false) },
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

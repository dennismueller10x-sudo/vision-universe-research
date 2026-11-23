// www.visionuniverse.de/news/<slug>/ – die Insights-Artikel zum Lesen im Browser, ohne App und ohne Konto.
//
// Warum es diese Seiten gibt (Owner 23.11.2026): Die News standen bisher nur unter research.visionuniverse.de.
// Das ist der Bereich der App. Wer die App nicht nutzt, soll den Artikel trotzdem lesen können. Deshalb baut
// scripts/website/www-news.mjs aus denselben Artikeldaten (products/insights/artikel/*.json) zusätzlich eine
// eigenständige Seite je Artikel unter landing/news/<slug>/.
//
// Regeln dieser Seiten:
// - Kein Abo, kein Konto, kein Skript aus der App. Nur das, was die Website ohnehin lädt.
// - Nichts von fremden Adressen: jedes Bild liegt als Kopie unter landing/web/img/news/ (wie der Aufmacher).
// - Rahmen (Kopf, Menü, Fuß) kommt aus landing/news/index.html, damit Website und Artikel nie auseinanderlaufen.
// - Der Text ist derselbe wie in der App; die Kurskästen zeigen denselben eingefrorenen Stand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WWW = "https://www.visionuniverse.de";
const RESEARCH = "https://research.visionuniverse.de";
const LEGAL = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/legal-notices.json"), "utf8"));

const R = "../../"; // Seite liegt unter /news/<slug>/
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const de = (v, d = 0) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + de(Math.abs(v * 100), d) + " %");
const usd = (v) => (v == null ? "–" : v >= 1e12 ? de(v / 1e12, 2) + " Bio. $" : v >= 1e9 ? de(v / 1e9, 1) + " Mrd. $" : de(v / 1e6, 0) + " Mio. $");
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const datumLang = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d}. ${MONATE[m - 1]} ${y}`; };
const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? iso.split("-").reverse().join(".") : iso || "");
const ext = (p) => path.extname(p).toLowerCase() || ".jpg";
const text = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const lesezeit = (a) => Math.max(2, Math.round(a.abschnitte.map((s) => text(s.html)).join(" ").split(" ").length / 200));
const TREND = { BULLISH: "aufwärts", BEARISH: "abwärts", MIXED: "gemischt" };
const TON = (v) => (/sehr stark|^stark|solide/i.test(v) ? "plus" : /negativ|belastet|schwach/i.test(v) ? "minus" : "neutral");
const PRUEFVERMERK = {
  automatisch: "Dieser Artikel wurde automatisch erstellt und vor der Veröffentlichung gegen die genannten Quellen geprüft.",
  redaktion: "Dieser Artikel wurde redaktionell erstellt und geprüft.",
};

/** Dateiname einer Bildkopie unter landing/web/img/news/. */
export const bildName = (slug, rolle, src) => `art-${slug}-${rolle}${ext(src)}`;

/** Welche Bilder dieser Artikel auf www braucht: Dateiname → Pfad im Repo.
    aufName: Der Aufmacher liegt für die News-Übersicht oft schon als art-<slug>.jpg dort; dann keine zweite Kopie. */
export function artikelDateien(a, aufName = null) {
  const files = new Map();
  const add = (name, from) => { const p = from.replace(/^\//, ""); if (fs.existsSync(path.join(ROOT, p))) { files.set(name, p); return name; } return null; };
  if (!aufName && a.bild?.src) add(bildName(a.slug, "auf", a.bild.src), a.bild.src);
  a.abschnitte.forEach((s, i) => { if (s.bild?.src) add(bildName(a.slug, "b" + i, s.bild.src), s.bild.src); });
  for (const t of a.ticker) { const logo = a.daten?.aktien?.[t]?.logo; if (logo) add(`logo-${t}${ext(logo)}`, logo); }
  return files;
}

/* ---------- Bausteine ---------- */


const figur = (a, dateien, s, i) => {
  const name = s.bild && bildName(a.slug, "b" + i, s.bild.src);
  if (!name || !dateien.has(name)) return "";
  return `<figure class="na-fig"><img src="${R}web/img/news/${name}" alt="${esc(s.bild.alt)}" loading="lazy">`
    + `<figcaption>${s.bild.text ? esc(s.bild.text) + " · " : ""}${s.bild.ki ? "KI-Bild" : "Bild: " + esc(s.bild.quelle)}</figcaption></figure>`;
};

const zahlDE = (v, d = 1) => (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Diagramm wie in der App: Säulen für Zeitreihen, Balken für Vergleiche. Rein statisches HTML. */
function diagramm(g) {
  const max = Math.max(...g.werte.map(([, v]) => Math.abs(v))) || 1;
  const d = g.werte.some(([, v]) => !Number.isInteger(v)) ? 1 : 0;
  const z = (v) => zahlDE(v, d);
  const kopf = `<figcaption class="na-dia-k"><b>${esc(g.titel)}</b>${g.einheit ? `<span>${esc(g.einheit)}</span>` : ""}</figcaption>`;
  const fuss = `<p class="na-dia-f">${g.hinweis ? esc(g.hinweis) + " · " : ""}${g.quelle ? "Quelle: " + esc(g.quelle) : ""}</p>`;
  const label = `${g.titel}${g.einheit ? ` (${g.einheit})` : ""}: ` + g.werte.map(([k, v]) => `${k} ${z(v)}`).join(", ");
  if (g.art === "saeulen") {
    return `<figure class="na-dia na-dia--saeulen" role="img" aria-label="${esc(label)}">${kopf}<div class="na-dia-s">`
      + g.werte.map(([k, v, hi]) => `<div class="na-dia-sp"><b>${z(v)}</b><i class="${hi ? "hi" : ""}" style="height:${Math.max(3, (Math.abs(v) / max) * 100).toFixed(1)}%"></i><span>${esc(k)}</span></div>`).join("")
      + `</div>${fuss}</figure>`;
  }
  return `<figure class="na-dia na-dia--balken" role="img" aria-label="${esc(label)}">${kopf}<div class="na-dia-z">`
    + g.werte.map(([k, v, hi]) => `<div class="na-dia-r"><span>${esc(k)}</span><i class="${hi ? "hi" : v < 0 ? "minus" : ""}" style="width:${Math.max(1.5, (Math.abs(v) / max) * 100).toFixed(1)}%"></i><b>${z(v)}</b></div>`).join("")
    + `</div>${fuss}</figure>`;
}
const diagramme = (s) => [].concat(s.diagramm || []).map(diagramm).join("");

/** Kursverlauf als kleine Linie (aus der eingefrorenen Reihe des Artikels). */
function linie(serie) {
  if (!Array.isArray(serie) || serie.length < 10) return "";
  const p = serie.slice(-180).map(([, v]) => v);
  const lo = Math.min(...p), hi = Math.max(...p), spanne = hi - lo || 1;
  const pts = p.map((v, i) => `${((i / (p.length - 1)) * 100).toFixed(2)},${(30 - ((v - lo) / spanne) * 28 - 1).toFixed(2)}`).join(" ");
  const auf = p[p.length - 1] >= p[0];
  return `<svg class="na-line" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${auf ? "#13a05c" : "#d2334a"}" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

/** Der Kurskasten: dieselben Zahlen wie in der App, eingefroren zum Stand des Artikels. */
function datenKasten(a, dateien, t) {
  const k = a.daten?.aktien?.[t];
  if (!k) return "";
  const logoName = `logo-${t}${ext(k.logo || ".png")}`, logo = dateien.has(logoName) ? logoName : null;
  const kachel = (l, v, cls = "") => (v == null || v === "" ? "" : `<div class="na-kachel ${cls}"><small>${esc(l)}</small><b>${v}</b></div>`);
  const kacheln = [
    kachel("Kurs", `${de(k.kurs, 2)} $`),
    kachel("1 Monat", pct(k.r1m), k.r1m >= 0 ? "plus" : "minus"),
    kachel("12 Monate", pct(k.r12m), k.r12m >= 0 ? "plus" : "minus"),
    kachel("Abstand zum Hoch", pct(k.abstandHoch), "minus"),
    kachel("Börsenwert", usd(k.marktwert)),
    kachel("Umsatz (12 Monate)", usd(k.umsatzTTM)),
    kachel("Kurs-Gewinn-Verhältnis", k.kgv == null ? null : de(k.kgv, 1)),
    kachel("Kurs-Umsatz-Verhältnis", k.kuv == null ? null : de(k.kuv, 1)),
    kachel("Nettomarge", k.nettomarge == null ? null : pct(k.nettomarge, 0), k.nettomarge >= 0 ? "" : "minus"),
    kachel("Trend", TREND[k.trend] || null),
  ].filter(Boolean).join("");
  const gesund = (k.gesundheit || []).map(([l, v]) => `<span class="na-chip ${TON(v)}">${esc(l)}: ${esc(v)}</span>`).join("");
  return `<aside class="na-daten" aria-label="Zahlen zu ${esc(k.name || t)}">
<div class="na-daten-k">${logo ? `<img src="${R}web/img/news/${logo}" alt="" width="34" height="34" loading="lazy">` : ""}<div><b>${esc(k.name || t)}</b><small>${esc(t)} · Kurs vom ${dmy(k.kursStand)}</small></div></div>
${linie(k.serie)}
<div class="na-kacheln">${kacheln}</div>
${gesund ? `<div class="na-chips">${gesund}</div>` : ""}
<p class="na-daten-f">Zahlen aus Vision Universe, eingefroren zum Stand dieses Artikels. Geschäftszahlen aus den Meldungen an die US-Börsenaufsicht.</p>
<a class="na-cta" href="${RESEARCH}/aktie/#/${esc(t)}">${esc(k.name || t)} in Vision Universe ansehen <span aria-hidden="true">→</span></a>
</aside>`;
}

/** Links im Artikeltext zeigen auf www, nicht in die App. */
const textUmschreiben = (html) => String(html).replace(/href="\/insights\/([a-z0-9-]+)\/"/g, 'href="../$1/"');

/* ---------- Seite ---------- */

export function artikelSeite(a, { alle = [], shell, aufName = null }) {
  const dateien = artikelDateien(a, aufName);
  const eigen = a.bild?.src ? bildName(a.slug, "auf", a.bild.src) : null;
  const auf = aufName || (eigen && dateien.has(eigen) ? eigen : null);
  const url = `${WWW}/news/${a.slug}/`;
  const iso = `${a.datum}T${a.zeit || "12:00"}:00+01:00`;
  const ld = {
    "@context": "https://schema.org", "@type": "NewsArticle", headline: a.seoTitel || a.titel, description: a.teaser,
    image: auf ? [`${WWW}/web/img/news/${auf}`] : undefined, datePublished: iso, dateModified: iso, articleSection: a.rubrik,
    isAccessibleForFree: true, inLanguage: "de-DE", mainEntityOfPage: url, keywords: (a.tags || []).join(", "),
    author: { "@type": "Organization", name: "Redaktion Vision Universe", url: WWW + "/" },
    publisher: { "@type": "Organization", name: "Vision Universe", logo: { "@type": "ImageObject", url: `${WWW}/assets/vision-universe-logo-web.png` } },
  };
  const koerper = a.abschnitte.map((s, i) => {
    const kopf = s.h ? `<h2>${esc(s.h)}</h2>` : "";
    let h = s.daten
      ? kopf + textUmschreiben(s.html) + diagramme(s) + datenKasten(a, dateien, s.daten)
      : kopf + (s.bild?.stil === "portrait" ? figur(a, dateien, s, i) : "") + textUmschreiben(s.html) + diagramme(s) + (s.bild && s.bild.stil !== "portrait" ? figur(a, dateien, s, i) : "");
    if (i === 2 && a.zitat) h += `<blockquote class="na-zitat"><p>„${esc(a.zitat.text)}“</p><cite>${esc(a.zitat.von)}</cite></blockquote>`;
    return h;
  }).join("\n");
  const weitere = alle.filter((x) => x.slug !== a.slug).slice(0, 3).map((x) => `<a class="na-w-c" href="../${x.slug}/">`
    + `${x.img ? `<span class="na-w-b"><img src="${R}web/img/news/${x.img}" alt="" loading="lazy"></span>` : ""}`
    + `<span><small>${esc(x.rubrik)} · ${dmy(x.datum)}</small><b>${esc(x.titel)}</b></span></a>`).join("");
  const head = `<!doctype html>
<html lang="de" class="vw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.seoTitel || a.titel)} · Vision Universe</title>
<meta name="description" content="${esc(a.teaser)}">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${url}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Vision Universe">
<meta property="og:title" content="${esc(a.titel)}">
<meta property="og:description" content="${esc(a.teaser)}">
${auf ? `<meta property="og:image" content="${WWW}/web/img/news/${auf}">\n<meta property="og:image:alt" content="${esc(a.bild.alt)}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
<meta property="article:published_time" content="${iso}">
<meta property="article:section" content="${esc(a.rubrik)}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${R}assets/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="${R}assets/apple-touch-icon.png">
<link rel="preload" href="${R}assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${R}web/site.css"><link rel="stylesheet" href="${R}web/sub.css"><link rel="stylesheet" href="${R}web/news-artikel.css">
<script src="${R}web/site.js" defer></script>
<script src="${R}web/consent.js" defer></script>
<meta name="vu-ga" content="">
<link rel="stylesheet" href="/assets/site-navigation.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
`;
  const main = `<main id="inhalt" class="na">
<article class="na-art">
<div class="w na-top"><a class="na-back" href="../">← Alle News</a></div>
<header class="na-kopf w">
  <p class="na-k">${esc(a.rubrik)} · <time datetime="${a.datum}">${datumLang(a.datum)}</time></p>
  <h1>${esc(a.titel)}</h1>
  <p class="na-lead">${esc(a.unterzeile)}</p>
  <p class="na-by">Redaktion Vision Universe · Stand ${esc(a.stand)} · ${lesezeit(a)} Min. Lesezeit</p>
</header>
${auf ? `<figure class="na-auf"><div class="w"><img src="${R}web/img/news/${auf}" alt="${esc(a.bild.alt)}" width="1600" height="900" fetchpriority="high"><figcaption>${a.bild.ki ? "KI-Bild" : "Bild: " + esc(a.bild.quelle)}</figcaption></div></figure>` : ""}
<div class="w na-text">
${koerper}
${a.termine?.length ? `<section class="na-termine"><h2>Termine</h2><ul>${a.termine.map(([d, t]) => `<li><b>${esc(d)}</b><span>${esc(t)}</span></li>`).join("")}</ul></section>` : ""}
<section class="na-quellen"><h2>Quellen</h2><ol>${(a.quellen || []).map((q) => `<li>${esc(q.medium)}: <a href="${esc(q.url)}" rel="noopener nofollow" target="_blank">${esc(q.titel)}</a>, ${esc(q.datum)}</li>`).join("")}</ol>
<p class="na-klein">Zitate aus englischen Quellen sind übersetzt. Kurse, Kennzahlen und Fondsdaten im Kasten stammen aus Vision Universe (Stand siehe Kasten). ${esc(LEGAL.notices.thirdParty.text)} ${PRUEFVERMERK[a.pruefung || "redaktion"]}</p></section>
<section class="na-app"><div class="na-app-i"><p class="na-app-k">Vision Universe</p><h2>Diese Aktie mit allen Zahlen</h2>
<p>Kurs, Bewertung, Geschäftszahlen, Chart und was große Fonds tun: In Vision Universe steht zu jeder Aktie dieselbe Analyse, auf der dieser Artikel aufbaut.</p>
<p class="na-app-b"><a class="btn" href="${RESEARCH}/insights/${a.slug}/"><span>Artikel in Vision Universe öffnen</span><span class="dot">→</span></a> <a class="na-app-l" href="${R}#newsletter">Zum Start der App benachrichtigen</a></p></div></section>
</div>
</article>
${weitere ? `<section class="na-weiter"><div class="w"><h2>Weitere News</h2><div class="na-w-g">${weitere}</div></div></section>` : ""}
<p class="w na-hinweis">${esc(LEGAL.notices.editorial.text)}</p>
</main>
`;
  return head + shell.top + main + shell.bottom;
}

/** Kopf (Menü, Symbole) und Fuß der Website aus landing/news/index.html, mit Pfaden ab der Wurzel. */
export function leseShell(file = path.join(ROOT, "landing/news/index.html")) {
  const html = fs.readFileSync(file, "utf8");
  const bodyAnfang = html.indexOf("<body");
  const sprite = html.indexOf('<svg width="0"');
  const main = html.indexOf("<main");
  const mainEnde = html.indexOf("</main>");
  if (bodyAnfang < 0 || sprite < 0 || main < 0 || mainEnde < 0) throw new Error("landing/news/index.html: Rahmen nicht gefunden");
  const wurzel = (s) => s.replace(/(["'])\.\.\//g, "$1../../");
  // „News“ bleibt im Menü als aktueller Punkt markiert: ein Artikel gehört dorthin.
  return { top: wurzel(html.slice(bodyAnfang, main)), bottom: wurzel(html.slice(mainEnde + "</main>".length)) };
}

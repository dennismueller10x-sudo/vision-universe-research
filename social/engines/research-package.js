/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/research-package.js

   DIE DUENNE RECHERCHE-SCHICHT (Owner-Auftrag "WORK OWNS THE POST",
   29.09., §5/§24)

   Sammelt, ENTSCHEIDET NICHTS. Diese Schicht liefert ChatGPT Work
   mehrere aktuelle Storys samt Quellen, Zeitpunkt und — soweit die
   Quelle ihn herausgibt — echtem Artikeltext. Story-Auswahl, Angle,
   Hook, Caption, Bildidee und Carousel-Dramaturgie gehoeren Work.

   Der reale Befund, der sie noetig machte (vu-web-15e2974b16c8dc4c-
   20260929): Work bekam nur Titel und einen RSS-Teaser. Mit zwei Saetzen
   Rohmaterial laesst sich eine Story nicht verstehen — die Hook blieb
   eine Verdichtung der Headline.

   Die Rangfolge unten sortiert nur, welche Storys ins Paket passen
   (Aktualitaet, Belegdichte). Sie waehlt keine aus.
   ========================================================================= */
"use strict";

const WebResearch = require("./web-research.js");

function text(v) { return String(v === null || v === undefined ? "" : v); }

const ENTITAETEN = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"",
  "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&#8217;": "’", "&#8216;": "‘",
  "&#8220;": "“", "&#8221;": "”", "&#8211;": "–", "&#8212;": "—", "&rsquo;": "’",
  "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&ndash;": "–", "&mdash;": "—" };

function entitaetenAufloesen(s) {
  return text(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => (m.toLowerCase() in ENTITAETEN ? ENTITAETEN[m.toLowerCase()] : m));
}

function ohneTags(s) {
  return entitaetenAufloesen(text(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/* Absaetze, die fast jede Nachrichtenseite um den Artikel legt. */
const RAUSCHEN = /(cookie|subscribe|newsletter|sign up|sign in|log in|all rights reserved|advertisement|read more|click here|follow us|share this|©|javascript)/i;

function metaBeschreibung(html) {
  const s = text(html);
  const og = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(s) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i.exec(s);
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(s) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(s);
  return ohneTags((og && og[1]) || (meta && meta[1]) || "");
}

/**
 * Der lesbare Artikeltext aus einer Nachrichtenseite. Heuristisch: die
 * <p>-Absaetze ausserhalb von Skripten, Navigation und Fusszeile, ohne
 * die ueblichen Randabsaetze. Liefert "" statt zu raten, wenn nichts
 * Artikelhaftes da ist (Paywall, Bot-Sperre, reine Skriptseite).
 */
function artikelText(html, maxZeichen) {
  const max = maxZeichen || 3500;
  const bereinigt = text(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, " ");
  const absaetze = [];
  const re = /<p[\s>][\s\S]*?<\/p>/gi;
  let t;
  while ((t = re.exec(bereinigt)) !== null) {
    const satz = ohneTags(t[0]);
    if (satz.length < 50 || RAUSCHEN.test(satz)) continue;
    if (absaetze.indexOf(satz) !== -1) continue;
    absaetze.push(satz);
  }
  let ergebnis = "";
  for (const a of absaetze) {
    if ((ergebnis + " " + a).length > max) break;
    ergebnis = ergebnis ? ergebnis + "\n\n" + a : a;
  }
  return ergebnis;
}

function normalisiereTitel(t) {
  return text(t).toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ").replace(/\s+/g, " ").trim();
}

/* Dieselbe Meldung erscheint oft in zwei Feeds mit leicht anderem Titel. */
function aehnlich(a, b) {
  const wa = new Set(normalisiereTitel(a).split(" ").filter((w) => w.length > 3));
  const wb = new Set(normalisiereTitel(b).split(" ").filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return false;
  let gemeinsam = 0;
  wa.forEach((w) => { if (wb.has(w)) gemeinsam += 1; });
  return gemeinsam / Math.min(wa.size, wb.size) >= 0.6;
}

/**
 * Die Kandidatenliste fuer das Paket: aktuell, dedupliziert, ohne bereits
 * behandelte Links, begrenzt. KEINE Auswahl einer Story.
 *
 * @param items  RSS-Items (rss-parse.js)
 * @param options.now, .fensterStunden, .max, .bereitsBehandelt (Links)
 */
function kandidaten(items, options) {
  options = options || {};
  const max = options.max || 10;
  const behandelt = new Set((options.bereitsBehandelt || []).map(text));
  const bewertet = WebResearch.waehleStory(items, {
    now: options.now, fensterStunden: options.fensterStunden || 48 });
  if (!bewertet.ok) return [];
  const liste = [];
  for (const k of bewertet.kandidaten) {
    const it = k.item;
    if (!text(it.link) || behandelt.has(text(it.link))) continue;
    if (liste.some((x) => aehnlich(x.item.title, it.title))) continue;
    liste.push(k);
    if (liste.length >= max) break;
  }
  return liste.map((k, i) => ({
    id: "s" + (i + 1),
    title: ohneTags(k.item.title),
    source: text(k.item.source),
    url: text(k.item.link),
    published_at: k.item.publishedAt,
    age_hours: Math.round(k.item.ageHours * 10) / 10,
    description: ohneTags(k.item.description),
    extracted_numbers: k.fakten.map((f) => ({ value: f.value, unit: f.unit, sentence: f.statement }))
  }));
}

/** Fuegt den abgerufenen Artikeltext an eine Story an. */
function mitArtikel(story, abruf) {
  const html = abruf && abruf.ok ? abruf.html : "";
  const excerpt = artikelText(html);
  const meta = metaBeschreibung(html);
  return Object.assign({}, story, {
    article_excerpt: excerpt || null,
    article_meta_description: meta || null,
    article_fetch: {
      ok: !!(abruf && abruf.ok),
      status: abruf ? abruf.status : null,
      excerpt_chars: excerpt.length,
      note: excerpt ? null : "Kein Artikeltext lesbar (Paywall, Bot-Sperre oder Skriptseite) - nur Titel/Teaser."
    }
  });
}

module.exports = { artikelText, metaBeschreibung, ohneTags, aehnlich, kandidaten, mitArtikel };

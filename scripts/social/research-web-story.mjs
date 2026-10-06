#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/research-web-story.mjs

   WEB-FIRST CONTENT RESEARCH — DER NETZSEITIGE TEIL (Owner-Direktive
   "DIRECT CREATIVE GOLDEN PATH — FINAL GO/NO-GO", 23.09.)

   Holt aktuelle Meldungen von oeffentlichen, schluessellosen Nachrichten-
   Feeds, waehlt daraus die staerkste Story (social/engines/web-research.js
   macht die eigentliche Auswahl/Hook-Bildung, rein und ohne Netz) und
   schreibt das Ergebnis nach social/data/web-story-selection.json.

   KEIN QUANT, KEIN DISCOVERY, KEIN OPPORTUNITY SLATE. Dieses Skript
   kennt quant/ nicht und liest es nicht.

   FAIL CLOSED: findet sich keine aktuelle, grounded Story, entsteht
   KEINE Datei mit erfundenem Inhalt — das Skript beendet sich mit
   Exit 4 (begruendete Verweigerung, kein Ausfall) und schreibt einen
   Befund statt eines Ergebnisses.

   Ausfuehren:
     node scripts/social/research-web-story.mjs
     node scripts/social/research-web-story.mjs --write
     node scripts/social/research-web-story.mjs --thema-freitext "AMD" --write
   ========================================================================= */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WebResearch = require(join(ROOT, "social/engines/web-research.js"));
const RssParse = require(join(ROOT, "social/engines/rss-parse.js"));

/* -------------------------------------------------------------------
   DIE QUELLENLISTE

   Oeffentliche, schluessellose RSS-Feeds etablierter Wirtschafts-/
   Finanzmedien (§4 der Direktive). Kein internes VU-System, kein
   Quant-Datenanbieter. Ein einzelner nicht erreichbarer Feed ist kein
   Abbruchgrund — er liefert einfach 0 Items und wird uebersprungen;
   erst wenn ALLE Quellen 0 Items liefern, gibt es keine Auswahl. */
export const QUELLEN = [
  { name: "MarketWatch Top Stories", url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
  { name: "CNBC Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "Investing.com News", url: "https://www.investing.com/rss/news.rss" },
  { name: "Seeking Alpha Market Currents", url: "https://seekingalpha.com/market_currents.xml" },
  { name: "Nasdaq Markets", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" }
];

export async function holeFeed(quelle, options) {
  options = options || {};
  const timeoutMs = options.timeoutMs || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(quelle.url, {
      signal: controller.signal,
      headers: { "user-agent": "VisionUniverseSocial/1.0 (+https://visionuniverse.de)" }
    });
    if (!resp.ok) {
      return { quelle: quelle.name, ok: false, grund: "HTTP_" + resp.status, items: [] };
    }
    const xml = await resp.text();
    const items = RssParse.parseRss(xml, quelle.name);
    return { quelle: quelle.name, ok: true, items };
  } catch (err) {
    return { quelle: quelle.name, ok: false, grund: String((err && err.message) || err), items: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function holeAlleFeeds(quellen, options) {
  const ergebnisse = await Promise.all(quellen.map((q) => holeFeed(q, options)));
  const alleItems = [];
  ergebnisse.forEach((e) => { if (e.ok) alleItems.push(...e.items); });
  return { ergebnisse, items: alleItems };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const THEMA_FREITEXT = arg("thema-freitext", null);
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");
  const FENSTER_STUNDEN = Number(arg("fenster-stunden", "72"));

  console.log("VISION UNIVERSE SOCIAL — Web Research");
  console.log("Zeitpunkt: " + NOW);
  console.log("Fenster:   " + FENSTER_STUNDEN + "h");
  if (THEMA_FREITEXT) console.log("Thema:     \"" + THEMA_FREITEXT + "\" (POST ZU THEMA)");
  console.log("");

  const { ergebnisse, items } = await holeAlleFeeds(QUELLEN, {});
  console.log("--- QUELLEN ---");
  for (const e of ergebnisse) {
    console.log("  " + e.quelle.padEnd(28) +
      (e.ok ? e.items.length + " Item(s)" : "NICHT ERREICHBAR (" + e.grund + ")"));
  }
  console.log("\nInsgesamt " + items.length + " Item(s) aus " +
    ergebnisse.filter((e) => e.ok).length + " von " + ergebnisse.length + " Quelle(n).");

  if (!items.length) {
    console.error("\nKEINE_QUELLE_ERREICHBAR: keine der " + QUELLEN.length +
      " Quellen lieferte ein Item. Keine Themenwahl entsteht.");
    process.exit(4);
  }

  const auswahl = WebResearch.waehle(items, {
    now: NOW, fensterStunden: FENSTER_STUNDEN,
    themaFilter: THEMA_FREITEXT || undefined
  });

  if (!auswahl.ok) {
    console.error("\n" + auswahl.grund + ": " + auswahl.erklaerung);
    process.exit(4);
  }

  console.log("\n--- GEWAEHLTE STORY ---");
  console.log("Titel:    " + auswahl.story.title);
  console.log("Quelle:   " + auswahl.story.source);
  console.log("Datum:    " + auswahl.story.publishedAt);
  console.log("Score:    " + auswahl.storyScore.toFixed(1) + "/10");
  console.log(auswahl.storyErklaerung);
  console.log("\n--- HOOK-WETTBEWERB ---");
  console.log(auswahl.hookErklaerung);
  for (const k of auswahl.hookKandidaten) {
    console.log("  " + k.archetyp.padEnd(10) + k.punkte.toFixed(1).padStart(5) + "  " + k.text);
  }
  console.log("\nGewaehlter Hook: \"" + auswahl.hook + "\"");
  console.log("\n--- CAPTION ---");
  console.log(auswahl.caption);
  console.log("\n--- HASHTAGS ---");
  console.log(auswahl.hashtagSatz + " " + auswahl.hashtags.map((t) => "#" + t).join(" "));
  console.log("\n--- BILDMOTIV ---");
  console.log(auswahl.motiv.instruction);
  console.log("\ncontent_id: " + auswahl.contentId);

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  const ausgabe = { selectedAt: NOW, thema: THEMA_FREITEXT || null,
    quellenBefund: ergebnisse.map((e) => ({ quelle: e.quelle, ok: e.ok,
      anzahl: e.items.length, grund: e.grund || null })),
    ...auswahl };
  const zielDir = join(ROOT, DATA_DIR);
  mkdirSync(zielDir, { recursive: true });
  const zielPfad = join(zielDir, "web-story-selection.json");
  writeFileSync(zielPfad, JSON.stringify(ausgabe, null, 2) + "\n");
  console.log("\nGeschrieben: " + join(DATA_DIR, "web-story-selection.json"));
}

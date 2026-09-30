#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/build-research-package.mjs

   DAS RECHERCHEPAKET FUER EINEN WORK-JOB (Owner-Auftrag "WORK OWNS THE
   POST", 29.09., §5/§24)

   Laeuft auf dem GitHub-Runner (dort gibt es Netz). Holt die aktuellen
   Meldungen der oeffentlichen, schluessellosen Feeds, nimmt die frischsten
   und belegdichtesten Storys, ruft zu jeder den Originalartikel ab und
   schreibt alles nach social/data/research-package.json.

   Es waehlt KEINE Story, baut KEINEN Hook, keine Caption, kein Motiv.
   Das alles entscheidet ChatGPT Work in einem einzigen Auftrag.

   Ausfuehren:
     node scripts/social/build-research-package.mjs
     node scripts/social/build-research-package.mjs --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { QUELLEN, holeAlleFeeds } from "./research-web-story.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Research = require(join(ROOT, "social/engines/research-package.js"));

/* Deutschsprachige Wirtschaftsquellen zusaetzlich - ein nicht erreichbarer
   Feed liefert 0 Items und wird uebersprungen, wie bei den anderen. */
export const ZUSATZ_QUELLEN = [
  { name: "tagesschau Wirtschaft", url: "https://www.tagesschau.de/wirtschaft/index~rss2.xml" },
  { name: "Handelsblatt Finanzen", url: "https://www.handelsblatt.com/contentexport/feed/finanzen" }
];

export const PAKET_DATEI = "research-package.json";

/** Alle Links, die bereits in einem Beitrag oder Auftrag steckten. */
export function bereitsBehandelt(root) {
  const links = new Set();
  const kandidaten = join(root, "social/data/publish-candidates");
  if (existsSync(kandidaten)) {
    for (const f of readdirSync(kandidaten)) {
      if (!f.endsWith(".json") || f.endsWith(".request.json")) continue;
      try {
        const k = JSON.parse(readFileSync(join(kandidaten, f), "utf8"));
        const ws = k.provenance && k.provenance.webStory;
        if (ws && ws.link) links.add(ws.link);
        for (const s of ((k.presentation && k.presentation.sources) || [])) {
          if (s && s.url) links.add(s.url);
        }
      } catch { /* ein unlesbarer Kandidat ist hier kein Grund abzubrechen */ }
    }
  }
  const auftraege = join(root, "authoring/requests");
  if (existsSync(auftraege)) {
    for (const d of readdirSync(auftraege)) {
      for (const datei of ["authoring-brief.json", "authoring-result.json"]) {
        const p = join(auftraege, d, datei);
        if (!existsSync(p)) continue;
        try {
          const j = JSON.parse(readFileSync(p, "utf8"));
          if (j.source_story && j.source_story.link) links.add(j.source_story.link);
          for (const s of (j.sources || [])) if (s && s.url) links.add(s.url);
        } catch { /* s.o. */ }
      }
    }
  }
  return Array.from(links);
}

export async function holeArtikel(url, options) {
  const timeoutMs = (options && options.timeoutMs) || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; VisionUniverseSocial/1.0; +https://visionuniverse.de)",
        "accept": "text/html,application/xhtml+xml" } });
    const html = resp.ok ? await resp.text() : "";
    return { ok: resp.ok, status: resp.status, html };
  } catch (err) {
    return { ok: false, status: String((err && err.message) || err).slice(0, 80), html: "" };
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");
  const MAX = Number(arg("max", "10"));

  console.log("VISION UNIVERSE SOCIAL — Recherchepaket fuer einen Work-Job");
  const quellen = QUELLEN.concat(ZUSATZ_QUELLEN);
  const { ergebnisse, items } = await holeAlleFeeds(quellen, {});
  for (const e of ergebnisse) {
    console.log("  " + e.quelle.padEnd(30) + (e.ok ? e.items.length + " Item(s)" : "NICHT ERREICHBAR (" + e.grund + ")"));
  }

  const behandelt = bereitsBehandelt(ROOT);
  const liste = Research.kandidaten(items, { now: NOW, fensterStunden: 48, max: MAX,
    bereitsBehandelt: behandelt });
  if (!liste.length) {
    console.error("\nKEINE_AKTUELLEN_STORYS: kein Feed lieferte eine frische, noch nicht " +
      "behandelte Meldung. Es entsteht kein Auftrag.");
    process.exit(4);
  }

  const abrufe = await Promise.all(liste.map((s) => holeArtikel(s.url)));
  const stories = liste.map((s, i) => Research.mitArtikel(s, abrufe[i]));
  for (const s of stories) {
    console.log("  " + s.id + " " + (s.article_fetch.excerpt_chars ? "Artikel " +
      s.article_fetch.excerpt_chars + " Z." : "nur Teaser") + "  " + s.title.slice(0, 90));
  }

  const paket = {
    generated_at: NOW,
    note: "Startmaterial, keine Vorauswahl. Die Reihenfolge sortiert nur nach Frische " +
      "und Belegdichte - welche Story erzaehlt wird, entscheidet der Creative Agent.",
    feeds_checked: ergebnisse.map((e) => ({ source: e.quelle, ok: e.ok, items: e.items.length })),
    stories,
    already_covered_urls: behandelt
  };

  if (!WRITE) { console.log("\n(Kein --write: es wurde nichts geschrieben.)"); process.exit(0); }
  mkdirSync(join(ROOT, DATA_DIR), { recursive: true });
  writeFileSync(join(ROOT, DATA_DIR, PAKET_DATEI), JSON.stringify(paket, null, 2) + "\n");
  console.log("\nGeschrieben: " + join(DATA_DIR, PAKET_DATEI) + " (" + stories.length + " Storys)");
}

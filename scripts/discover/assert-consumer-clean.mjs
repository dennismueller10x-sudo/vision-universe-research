#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — assert-consumer-clean.mjs

   ZWEI DINGE, DIE IN EINER CONSUMER-OBERFLAECHE NICHTS ZU SUCHEN HABEN

   §18  "Development Preview" - site-wide, nicht nur auf Discover.
        Eine Plakette, die einmal irgendwo stehenbleibt, macht aus einem
        Produkt einen Entwurf.

   §14  Anbieter- und Methodiktexte direkt unter Consumer-Modulen.
        Sie gehoeren auf "Daten & Quellen", an EINE Stelle. Wer unter
        jeder Kennzahl liest, woher sie kommt, liest irgendwann nichts
        mehr.

   WAS GEPRUEFT WIRD UND WAS NICHT

   Geprueft wird, was ein Besucher SIEHT: die ausgelieferten Seiten und
   die Texte, die die Oberflaechenmodule erzeugen. Nicht geprueft wird
   Quelltext, der ueber diese Dinge SPRICHT - Kommentare, Dokumentation
   und die Quellenseite selbst duerfen die Woerter enthalten, und sie
   muessen es sogar.

   Die Trennung ist der ganze Trick: eine Pruefung, die bei jedem
   Kommentar anschlaegt, wird nach dem dritten Fehlalarm abgeschaltet.
   ========================================================================= */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");

/* Die ausgelieferten Seiten: alles, was ein Browser oeffnen kann - seit
   der Freigabe vom 18.09.2026 der ganze Baum, nicht mehr eine Auswahl.
   Die Plakette darf nirgends mehr stehen, also muss auch ueberall
   gesucht werden. */
const SEITEN_WURZELN = ["."];
const SEITEN = /\.html$/i;

/* Die Oberflaechenmodule, die Text fuer den Nutzer erzeugen. Fuer §18
   zaehlt jedes davon; fuer §14 nur die von Discover (siehe unten). */
const UI_DATEIEN = ["discover/app.js", "discover/ui", "discover/engines",
                    "assets/site-navigation.js", "quant/ui"];

/* §18: die Plakette. */
const PLAKETTE = /Development\s+Preview/i;

/* WELCHE SEITEN ZUR CONSUMER PRODUCTION EXPERIENCE GEHOEREN

   Discover ist das Produkt, das abgenommen wird. Die Plakette darf dort
   nicht stehen, und das ist eine harte Bedingung.

   Bis zum 17.09.2026 galt das nur fuer Discover; der Rest der Seite -
   Quant-Werkzeuge, Dashboards, Magazin, Academy - trug die Plakette
   weiter, und dieses Skript hat den Unterschied gezaehlt und benannt,
   statt ihn stillschweigend zu entscheiden.

   Am 18.09.2026 hat der Owner entschieden: die Kennzeichnung
   verschwindet aus der GESAMTEN sichtbaren Consumer-Erfahrung. Damit ist
   §18 keine Frage der Flaeche mehr - jeder Fund ist ein Befund. Interne
   Entwicklungs- und QA-Metadaten (quant/config/development-preview.json,
   Berichte, Kommentare) bleiben ausdruecklich erlaubt: sie stehen in
   Daten und im Quelltext, nicht auf dem Bildschirm. */
function istConsumer() { return true; }

/* §14: Anbieter- und Methodiknamen. Auf der Quellenseite erlaubt, im
   uebrigen Consumer-Text nicht. */
const ANBIETER = /\b(Tiingo|IEX|EDGAR|XBRL|Polygon|Finnhub|Alpha\s?Vantage|companyfacts|Twelve\s?Data|EODHD)\b/;

/* Wo die Anbieter stehen DUERFEN - die eine Stelle, auf die alles
   verweist, und der Quelltext, der sie aufbaut. */
const QUELLEN_AUSNAHMEN = [
  "discover/ui/daten.js",        /* die Seite "Daten & Quellen" selbst */
  "discover/quellen.html",
  "discover/data"                /* Payloads: publishBasis, Herkunftsfelder */
];

function gehe(rel, filter) {
  const voll = join(root, rel);
  if (!existsSync(voll)) return [];
  if (statSync(voll).isFile()) return filter(voll) ? [voll] : [];
  const out = [];
  (function rein(d) {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".git" || e === "data") continue;
      const f = join(d, e);
      if (statSync(f).isDirectory()) rein(f);
      else if (filter(f)) out.push(f);
    }
  })(voll);
  return out;
}

const seiten = SEITEN_WURZELN.reduce((a, r) => a.concat(gehe(r, (f) => SEITEN.test(f))), []);
const uiDateien = UI_DATEIEN.reduce((a, r) => a.concat(gehe(r, (f) => /\.(js|mjs)$/i.test(f))), []);

/* §14: ein Anbietername in PROSA ist etwas anderes als einer in einer
   Kennung. "sec_edgar:companyfacts" und "TIINGO_IEX_LEVEL6" sind
   maschinenlesbare Herkunftsangaben - sie stehen in Datenfeldern, nicht
   in Saetzen, und der Owner hat genau diese Form ausdruecklich als
   interne Kennzeichnung bestaetigt. Gesucht wird, was jemand LIEST. */
function istKennung(t) {
  return /^[A-Za-z0-9_:\-.\/]+$/.test(t.trim()) && !/\s/.test(t.trim());
}

const funde = { developmentPreview: [], developmentPreviewAusserhalbConsumer: [],
                anbieterImConsumerText: [] };

/* §14 gilt weiter nur fuer die Consumer-Flaeche: in den Quant-Werkzeugen
   ist ein Anbietername eine Fachangabe, kein Bruch im Erlebnis. */
function istDiscover(rel) { return /^discover\//.test(rel); }

/* ---- §18: die Plakette, in jeder ausgelieferten Seite -------------- */
for (const datei of seiten) {
  const text = readFileSync(datei, "utf8");
  const m = PLAKETTE.exec(text);
  if (m) {
    const rel = relative(root, datei);
    const eintrag = { file: rel, line: text.slice(0, m.index).split("\n").length,
                      context: text.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, " ") };
    (istConsumer(rel) ? funde.developmentPreview : funde.developmentPreviewAusserhalbConsumer).push(eintrag);
  }
}

/* Und in den Modulen, die Text erzeugen - dort allerdings nur in
   Zeichenketten, nicht in Kommentaren. */
function zeichenkettenOhneKommentare(text) {
  /* Grob, aber fuer diesen Zweck genau genug: Zeilenkommentare und
     Blockkommentare heraus, danach nur noch das, was in Anfuehrungs-
     zeichen steht. */
  const ohne = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const treffer = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(ohne)) !== null) treffer.push({ text: m[1] !== undefined ? m[1] : m[2], index: m.index });
  return treffer;
}

for (const datei of uiDateien) {
  const rel = relative(root, datei);
  const text = readFileSync(datei, "utf8");
  const strings = zeichenkettenOhneKommentare(text);
  for (const s of strings) {
    if (PLAKETTE.test(s.text)) {
      const eintrag = { file: rel, line: text.slice(0, s.index).split("\n").length,
                        context: s.text.slice(0, 80) };
      /* Seit dem 18.09.2026 gibt es keine Flaeche mehr, auf der die
         Plakette erlaubt waere - auch die gemeinsame Navigation baut sie
         nicht mehr. Jeder Fund in einem Modul, das Text erzeugt, ist ein
         Befund. */
      (istConsumer(rel) ? funde.developmentPreview : funde.developmentPreviewAusserhalbConsumer).push(eintrag);
    }
    if (!istDiscover(rel)) continue;
    if (QUELLEN_AUSNAHMEN.some((a) => rel.startsWith(a))) continue;
    if (istKennung(s.text)) continue;
    if (ANBIETER.test(s.text)) {
      funde.anbieterImConsumerText.push({ file: rel, line: text.slice(0, s.index).split("\n").length,
                                          context: s.text.slice(0, 100) });
    }
  }
}

const bericht = {
  schemaVersion: "consumer-clean-1.1.0",
  auftrag: "Owner 17.09.2026 §14 (Quellen an einer Stelle) und §18 (keine Development Preview); Owner 18.09.2026 Entscheidung 1: §18 gilt site-wide fuer die gesamte sichtbare Consumer-Erfahrung",
  checkedAt: new Date().toISOString(),
  scanned: { pages: seiten.length, uiModules: uiDateien.length },
  scope: "Ausgelieferte Seiten und die Module, die Consumer-Text erzeugen. Kommentare und " +
         "Dokumentation sind ausgenommen - sie sprechen ueber die Sache, sie zeigen sie nicht.",
  sourcesPage: QUELLEN_AUSNAHMEN,
  findings: funde,
  ownerDecision: {
    entschieden: "18.09.2026",
    frage: "Soll die Plakette 'Development Preview' auch ausserhalb von Discover verschwinden?",
    antwort: "Ja - site-wide aus der sichtbaren Consumer-Erfahrung. Interne Entwicklungs- und " +
             "QA-Metadaten bleiben bestehen.",
    umgesetzt: "assets/site-navigation.js baut die Plakette nicht mehr; das Attribut no-preview " +
               "bleibt zulaessig und wirkungslos. Diese Pruefung sucht seitdem im ganzen Baum."
  },
  verdict: (funde.developmentPreview.length === 0 &&
            funde.developmentPreviewAusserhalbConsumer.length === 0 &&
            funde.anbieterImConsumerText.length === 0)
    ? "PASS" : "FAIL"
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "consumer-clean.json"), JSON.stringify(bericht, null, 2) + "\n");

console.log("Consumer-Oberflaeche, zwei Pruefungen:");
console.log("");
console.log("  " + seiten.length + " ausgelieferte Seiten, " + uiDateien.length + " Oberflaechenmodule");
console.log("");
console.log("  §18 'Development Preview' site-wide: " + (funde.developmentPreview.length || "nirgends"));
for (const f of funde.developmentPreview) console.log("      " + f.file + ":" + f.line + "  " + f.context);
console.log("  §14 Anbieternamen im Consumer-Text: " + (funde.anbieterImConsumerText.length || "keiner"));
for (const f of funde.anbieterImConsumerText) console.log("      " + f.file + ":" + f.line + "  " + f.context);
console.log("");
console.log("URTEIL: " + bericht.verdict);
if (bericht.verdict !== "PASS") process.exit(1);

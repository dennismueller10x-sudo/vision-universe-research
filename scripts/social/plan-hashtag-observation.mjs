/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/plan-hashtag-observation.mjs

   WAS SOLL BEOBACHTET WERDEN - UND WAS AUSDRUECKLICH NICHT

   Leitet den Plan aus dem Content Universe ab und prueft ihn gegen den
   30-Hashtag-Rahmen. Bricht ab, statt ihn still zu ueberschreiten.

   Ausfuehren:
     node scripts/social/plan-hashtag-observation.mjs --max-new 8 --out tmp/observe
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { baueSlate } from "./build-opportunity-slate.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Portfolio = require(join(ROOT, "social/engines/hashtag-portfolio.js"));

export const PORTFOLIO_DATEI = "social/data/hashtag-portfolio.json";

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

export function planeBeobachtung(options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const bestand = readJson(join(ROOT, PORTFOLIO_DATEI), { hashtags: {} });
  const slate = baueSlate();

  return Portfolio.plan({
    topics: slate.topics,
    /* Der Kern liefert die Zeitreihe. Er steht in der Konfiguration,
       weil er eine Owner-Groesse ist - nicht, weil er sich nicht
       ableiten liesse. */
    coreHashtags: options.core ||
      ["aktien", "boerse", "etf", "finanzbildung", "geldanlage"],
    state: bestand.hashtags || {},
    now,
    maxNewPerRun: options.maxNew === undefined ? 8 : options.maxNew
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const OUT = arg("out", null);
  const p = planeBeobachtung({ maxNew: Number(arg("max-new", 8)) });

  console.log("VISION UNIVERSE SOCIAL — Hashtag-Beobachtungsplan\n");
  console.log(p.explanation + "\n");
  console.log("Neu zu oeffnen (kostet je einen Platz):");
  p.newQueries.forEach((q) => console.log("  " + q.role.padEnd(12) + "#" + q.hashtag));
  console.log("\nKostenlose Auffrischung (Fenster offen): " +
    (p.refresh.map((r) => "#" + r.hashtag).join(" ") || "—"));
  if (p.retiredAsEmpty.length) {
    console.log("\nAusgemustert, weil leer beobachtet: " +
      p.retiredAsEmpty.map((r) => "#" + r.hashtag).join(" "));
  }

  /* Die harte Zusage. Ein Plan, der den Rahmen sprengen wuerde, laeuft
     nicht - er bricht ab und sagt warum. */
  if (!p.withinLimit) {
    console.error("\nDer Plan wuerde den 30-Hashtag-Rahmen ueberschreiten. " +
      "Es wird nichts abgefragt.");
    process.exit(3);
  }

  /* Abgefragt wird BEIDES: das Neue kostet Plaetze, die Auffrischung
     nicht - und ohne sie entstuende keine Zeitreihe. */
  const abzufragen = p.newQueries.concat(p.refresh).map((x) => x.hashtag);
  if (OUT) {
    mkdirSync(join(ROOT, OUT), { recursive: true });
    writeFileSync(join(ROOT, OUT, "tags.txt"), abzufragen.slice(0, 10).join(","));
    writeFileSync(join(ROOT, OUT, "plan.json"), JSON.stringify(p, null, 2) + "\n");
    console.log("\nGeschrieben: " + join(OUT, "tags.txt") + " (" +
      Math.min(abzufragen.length, 10) + " Hashtags - der Worker nimmt " +
      "hoechstens zehn je Anfrage, weil jeder zwei ausgehende Aufrufe kostet)");
  }
}

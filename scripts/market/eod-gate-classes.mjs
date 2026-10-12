/* =========================================================================
   VISION UNIVERSE — eod-gate-classes.mjs

   WELCHE TESTDATEI GEHOERT IN WELCHES GATE?

   Gate A (vor dem Abruf) prueft den CODE, der gleich die Daten baut. Bis
   10/2026 lief dort die ganze Suite - 270 Dateien. Gemessen 15.09.-12.10.:
   von 19 geplanten Nachtlaeufen scheiterten 13, acht davon in Gate A bzw.
   der alten Suite an Tests, die entweder
     - Code pruefen, den der Marktlauf gar nicht ausfuehrt (ti-ui,
       total-return-verification, canonical-total-return, secrets ...), oder
     - den eingecheckten, vom Vorabend ERZEUGTEN Datenstand lesen
       (return-series Golden Five, scale-gate SG1, market-signal-contract,
       product-services ...).
   Der zweite Fall ist eine Schleife: der Lauf von gestern schreibt die
   Daten, an denen der Lauf von heute in Gate A scheitert - und weil nichts
   mehr abgerufen wird, bleibt der Stand stehen, bis ein Mensch eingreift.

   Die Einteilung ist deshalb jetzt abgeleitet statt aufgezaehlt:

     PIPELINE   die transitive Importhuelle aller Skripte, die der Job
                `refresh` aufruft (node scripts/...).
     A          Testdateien, die etwas aus der Huelle importieren UND keinen
                erzeugten Datenstand lesen (quant/data, discover/data, ...).
                Das sind Code-Regressionen des Erzeugers auf Fixtures.
     B          unveraendert: die benannten Datenvertraege, nach dem Abruf
                auf den NEUEN Daten (rot = keine Veroeffentlichung).
     C          alles ausser B, nach dem Commit (nicht blockierend).

   Nichts wird uebersprungen: jede Datei, die nicht in A steht, laeuft in C
   (oder B) auf den frischen Daten. Wer eine Datei ausdruecklich anders
   einordnen will, traegt sie in quant/config/eod-publish-gates.json unter
   PRE_FETCH_CODE_REGRESSION.alsoBlocking bzw. neverBlocking ein - mit
   Begruendung.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

/* Erzeugte Datenstaende (Erzeuger laut core/registry/domains.json). Ein
   Test, der daraus liest, misst den Bestand, nicht den Code. */
export const DATA_READ_PATTERN =
  /["'`](?:\.\.?\/)*(?:quant|discover|supertrader|social|screener)\/data\b|["'](?:quant|discover|supertrader|social|screener)["']\s*,\s*["']data["']|["'`](?:\.\.\/)+data\//;

export function expandSuites(root, suites) {
  const out = [];
  for (const pattern of suites) {
    const m = /^(.*)\/\*(\.[\w.]+)$/.exec(pattern);
    if (!m) throw new Error("Muster nicht unterstuetzt: " + pattern);
    const dir = join(root, m[1]);
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir).filter((x) => x.endsWith(m[2])).sort()) out.push(m[1] + "/" + n);
  }
  return out;
}

/* Lokale Abhaengigkeiten einer Datei: relative Importe/Requires,
   join(root, "a", "b.js")-Pfade und repo-relative Pfad-Literale. */
export function localDeps(root, file) {
  const abs = join(root, file);
  if (!existsSync(abs)) return [];
  const src = readFileSync(abs, "utf8");
  const out = new Set();
  const add = (p) => {
    const a = resolve(root, p);
    if (/\.(m?js|cjs)$/.test(a) && existsSync(a)) out.add(relative(root, a));
  };
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) add(join(dirname(file), m[1]));
  for (const m of src.matchAll(/join\(\s*[\w.]+\s*,((?:\s*["'][^"']+["']\s*,?)+)\)/g)) {
    const teile = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
    const p = teile.join("/");
    if (/\.(m?js|cjs)$/.test(p)) {
      add(p);
      /* join(here, "..", "x.js") relativ zur Datei */
      add(join(dirname(file), p));
    }
  }
  for (const m of src.matchAll(/["']((?:quant|scripts|discover|core|screener|supertrader)\/[\w\/.-]+\.(?:m?js|cjs))["']/g)) add(m[1]);
  return [...out];
}

/* Einstiegspunkte: jedes `node scripts/...` im genannten Job. */
export function workflowEntrypoints(root, workflowFile, job) {
  const text = readFileSync(join(root, workflowFile), "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((l) => new RegExp("^  " + job + ":\\s*$").test(l));
  if (start < 0) throw new Error("Job " + job + " fehlt in " + workflowFile);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^  [\w-]+:\s*$/.test(lines[i])) { end = i; break; }
  const body = lines.slice(start, end).join("\n");
  return [...new Set([...body.matchAll(/node\s+((?:scripts|quant|discover)\/[\w\/.-]+\.m?js)/g)].map((m) => m[1]))];
}

export function closure(root, entrypoints) {
  const seen = new Set();
  const stack = entrypoints.slice();
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !existsSync(join(root, f))) continue;
    seen.add(f);
    for (const d of localDeps(root, f)) stack.push(d);
  }
  return seen;
}

export function readsGeneratedData(root, file) {
  return DATA_READ_PATTERN.test(readFileSync(join(root, file), "utf8"));
}

/**
 * @returns {{pre:string[], integrity:string[], observability:string[], all:string[],
 *            pipeline:string[], reasons:Map<string,string>}}
 */
export function classify(root, man) {
  const all = expandSuites(root, man.suites);
  const integrity = man.classes.POST_FETCH_DATA_INTEGRITY.files.slice();
  const missing = integrity.filter((f) => !all.includes(f));
  if (missing.length) throw new Error("POST_FETCH_DATA_INTEGRITY nennt Dateien ausserhalb der Suiten: " + missing.join(", "));
  const a = man.classes.PRE_FETCH_CODE_REGRESSION || {};
  const p = a.pipeline || {};
  const entries = Array.isArray(p.entrypoints) ? p.entrypoints.slice()
                : workflowEntrypoints(root, p.workflow || ".github/workflows/market-data-refresh.yml", p.job || "refresh");
  const huelle = closure(root, entries);
  const also = new Set(a.alsoBlocking || []), never = new Set(a.neverBlocking || []);
  for (const f of [...also, ...never]) if (!all.includes(f)) throw new Error("PRE_FETCH_CODE_REGRESSION nennt Datei ausserhalb der Suiten: " + f);
  const reasons = new Map();
  const pre = [];
  for (const f of all) {
    let r;
    if (integrity.includes(f)) r = "B: Datenvertrag, prueft die neuen Daten nach dem Abruf";
    else if (never.has(f)) r = "C: ausdruecklich nicht blockierend (Manifest)";
    else if (also.has(f)) r = "A: ausdruecklich blockierend (Manifest)";
    else if (!localDeps(root, f).some((d) => huelle.has(d))) r = "C: prueft keinen Code des Marktlaufs";
    else if (readsGeneratedData(root, f)) r = "C: liest den erzeugten Datenstand, nicht nur Code";
    else r = "A: Code des Marktlaufs auf Fixtures";
    reasons.set(f, r);
    if (r.startsWith("A:")) pre.push(f);
  }
  return { pre, integrity, observability: all.filter((f) => !integrity.includes(f)), all,
           pipeline: [...huelle].sort(), entrypoints: entries, reasons };
}

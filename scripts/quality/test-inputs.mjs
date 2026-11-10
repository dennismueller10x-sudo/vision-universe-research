/* =========================================================================
   VISION UNIVERSE — scripts/quality/test-inputs.mjs

   WOVON LEBEN UNSERE TESTS?

   Rote Tests sollen nur kommen, wenn Code kaputt ist, nicht weil sich
   taeglich Marktdaten aendern (Audit 10.11.2026: OR14, model-depots, OV6/9/11,
   PF-8, vu2-chart, n-home). Dieses Modul findet Tests, die Produktionsartefakte
   unter quant/data, discover/data, supertrader/data, social/data, technical/data
   oder core/data LESEN, und schaetzt, wie fest ihre Erwartungen sind.

   Verwendet von
     - core/tests/test-inputs.test.mjs  (Vertragstest: kein neuer Live-Leser)
     - dieser Datei als CLI:  node scripts/quality/test-inputs.mjs --doc docs/quality/TESTARTEN.md

   Die Erkennung ist eine Heuristik (Text, kein AST). Sie ist absichtlich grob
   und lieber zu streng: ein Fehlalarm kostet eine Zeile Begruendung in
   core/registry/test-input-allowlist.json, ein Fehlgriff kostet einen roten
   Tag.
   ========================================================================= */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TEST_DIRS = ["core/tests", "quant/tests", "discover/tests", "scripts/supertrader/tests", "screener/tests", "technical/tests"];
export const EXTRA_FILES = ["scripts/vu2/browser-qa.mjs", "scripts/discover/browser-qa.mjs"];
export const DATA_DIRS = ["quant", "discover", "supertrader", "social", "technical", "core"];

/* "/quant/data/..." direkt nach dem Anfuehrungszeichen ist ein URL-Literal (Testeingabe), kein Dateizugriff. */
const LIVE_RE = new RegExp(
  "(?<![\"'`]/)\\b(?:" + DATA_DIRS.join("|") + ")/data\\b"
  + "|[\"'`](?:" + DATA_DIRS.join("|") + ")[\"'`]\\s*,\\s*[\"'`]data[\"'`]"
);
const READ_RE = /readFileSync|readFile\(|readJson|loadJson|readJSON|JSON\.parse|readdirSync|statSync|existsSync|\bimport\(|\brequire\(/;
const TICKER_RE = /["'`](?:NVDA|AAPL|MSFT|AMZN|GOOGL?|META|TSLA|AVGO|SAP|ASML|NFLX|AMD|JPM|V|KO|BRK[.-]B)["'`]/;
const DATE_RE = /["'`]20\d\d-\d\d-\d\d/;
const ASSERT_RE = /\b(?:assert(?:\.\w+)?|expect)\s*\(/;
const NUM_RE = /(?:equal|deepEqual|strictEqual)\s*\([^)]*,\s*-?\d+(?:\.\d+)?\s*[,)]|length\s*,\s*\d+|\.length\s*(?:===|>=|<=|>|<)\s*\d{2,}/;
const NOW_RE = /Date\.now\(|new Date\(\)|\btoday\b/;
const FRESH_RE = /updated_?at|generated_?at|asOf|as_of|stale|fresh|Frische|veraltet/i;

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) {
    if (n === "fixtures" || n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.(mjs|js)$/.test(n)) out.push(relative(ROOT, p));
  }
}

export function listTestFiles(root = ROOT) {
  const out = [];
  for (const d of TEST_DIRS) walk(join(root, d), out);
  const prod = join(root, "products");
  if (existsSync(prod)) for (const p of readdirSync(prod)) walk(join(prod, p, "tests"), out);
  for (const f of EXTRA_FILES) if (existsSync(join(root, f))) out.push(f);
  /* Der Waechter selbst nennt die Datenpfade nur als Testeingabe. */
  return out.filter((f) => f !== "core/tests/test-inputs.test.mjs").sort();
}

const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

/** Ergebnis je Datei, oder null wenn kein Produktionsartefakt gelesen wird. */
export function scanFile(root, file) {
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  const refs = [];
  lines.forEach((l, i) => { if (!isComment(l) && LIVE_RE.test(l)) refs.push(i + 1); });
  if (!refs.length) return null;
  const body = lines.filter((l) => !isComment(l));
  const reads = body.some((l) => READ_RE.test(l));
  let dates = 0, tickers = 0, nums = 0, firstFix = 0;
  lines.forEach((l, i) => {
    if (isComment(l) || !ASSERT_RE.test(l)) return;
    const d = DATE_RE.test(l), t = TICKER_RE.test(l), n = NUM_RE.test(l);
    if (d || t || n) { if (!firstFix) firstFix = i + 1; }
    dates += d; tickers += t; nums += n;
  });
  const signals = dates + tickers + nums;
  const nowDep = body.some((l) => NOW_RE.test(l));
  const fresh = body.some((l) => FRESH_RE.test(l));
  /* Gewichtung: Datum und Ticker in einer Erwartung sind die typischen Tagesbrecher (OR14, OV6, PF-8, vu2-chart);
     reine Zaehlungen sind laut, deshalb erst ab 5 Treffern ein Hinweis. */
  const score = 2 * dates + 2 * tickers + (nums >= 5 ? 1 : 0) + (nowDep && fresh ? 2 : 0);
  let art = "Regel/Vertrag";
  if (reads && nowDep && fresh) art = "Datenzustand";
  else if (reads && score >= 2) art = "Regel (feste Werte)";
  let risiko = "NIEDRIG";
  if (!reads) risiko = "KEIN LESEN";
  else if (score >= 5) risiko = "HOCH";
  else if (score >= 2) risiko = "MITTEL";
  return { file, line: refs[0], refs: refs.length, reads, art, risiko, score, dates, tickers, nums, firstFix };
}

export function scanAll(root = ROOT) {
  return listTestFiles(root).map((f) => scanFile(root, f)).filter(Boolean);
}

export function renderTable(rows) {
  const rank = { HOCH: 0, MITTEL: 1, NIEDRIG: 2, "KEIN LESEN": 3 };
  const sorted = [...rows].sort((a, b) => rank[a.risiko] - rank[b.risiko] || a.file.localeCompare(b.file));
  const head = "| Testdatei | Zeile | Art | Risiko | feste Erwartungen (Datum/Ticker/Zahl) |\n|---|---|---|---|---|\n";
  return head + sorted.map((r) =>
    `| \`${r.file}\` | ${r.line}${r.firstFix && r.firstFix !== r.line ? " (Erwartung ab " + r.firstFix + ")" : ""} | ${r.art} | ${r.risiko} | ${r.dates}/${r.tickers}/${r.nums} |`).join("\n") + "\n";
}

export const REGISTRY = "core/registry/test-input-allowlist.json";
export const loadRegistry = (root = ROOT) => JSON.parse(readFileSync(join(root, REGISTRY), "utf8"));

/** docs/quality/TESTARTEN.md: Inventur aus Registry (Kategorie, Grund) und Scan (Zeile, Risiko). */
export function renderDoc(rows, reg) {
  const by = Object.fromEntries(rows.map((r) => [r.file, r]));
  const rank = { "datenzustand-offen": 0, "fixture-offen": 1, "schema-vertrag": 2 };
  const es = [...reg.eintraege].sort((a, b) => rank[a.kategorie] - rank[b.kategorie] || a.file.localeCompare(b.file));
  const n = (k) => es.filter((e) => e.kategorie === k).length;
  let t = `# Testarten: wovon leben unsere Tests?

Stand 10.11.2026 (Strang S). **Diese Datei ist erzeugt:** \`node scripts/quality/test-inputs.mjs --doc docs/quality/TESTARTEN.md\`, nicht von Hand aendern.

Rote Tests sollen nur kommen, wenn Code kaputt ist, nicht weil sich taeglich Marktdaten aendern. Ausloeser waren OR14, model-depots, OV6/OV9/OV11, PF-8, vu2-chart, n-home (#1769–#1776).

## Regeln

1. **Regressions- und Rechentests** lesen eingefrorene echte Kopien unter \`<produkt>/tests/fixtures/\` (Quell-Commit in der README daneben). Die Assertions bleiben gleich streng.
2. **Zustandspruefungen** (Frische, Schema, Plausibilitaet des heutigen Standes) gehoeren in \`scripts/core/data-quality.mjs\` bzw. den Freshness-Monitor. Dort alarmieren sie und blockieren keinen Code-PR (CLAUDE.md).
3. **Zustaende wie INSUFFICIENT_SAMPLE, fehlende Daten, zurueckgehaltene Evidenz** bekommen je einen Fixture-Test mit eigener Eingabe (\`quant/tests/evidence-states.test.mjs\`), nie einen Ticker, der heute zufaellig in diesem Zustand ist.
4. **Rueckfallschutz:** \`core/tests/test-inputs.test.mjs\` verbietet neue Tests, die Live-Artefakte lesen, ausser mit Eintrag samt Grund in \`${REGISTRY}\`. Die Liste darf nur kleiner werden.

## Messung

Die Liste stammt aus zwei Quellen: Text-Scan (\`scripts/quality/test-inputs.mjs\`, liefert Zeile und Risiko-Schaetzung) und Laufzeitmessung (\`scripts/quality/test-input-tracer.mjs\`: \`TRACE_LOG=/pfad/trace.jsonl node --test --import ./scripts/quality/test-input-tracer.mjs "quant/tests/*.test.mjs"\` protokolliert jede geoeffnete Datei unter den Datenordnern). Eintraege mit \`dynamisch\` liest der Test ueber einen Helfer, den der Text-Scan nicht sieht. Alle Suiten waren bei der Messung gruen (8.826 Tests).

**Art** ist die Kategorie aus der Registry; **Risiko** die Schaetzung des Scans: HOCH = Datum/Ticker/Frische in den Erwartungen einer Datei, die Live-Daten liest. Das ist eine Pruefliste, kein Urteil; ein Treffer kann in einem ganz anderen Test der Datei liegen.

## Stand

| Kategorie | Anzahl |
|---|---|
| datenzustand-offen (Ziel: Datenqualitaet) | ${n("datenzustand-offen")} |
| fixture-offen (Ziel: eingefrorene Kopie) | ${n("fixture-offen")} |
| schema-vertrag (darf lesen) | ${n("schema-vertrag")} |

Bereits umgestellt: \`discover/tests/market-detail.test.mjs\` und \`core/tests/chart-standard.test.mjs\` (Fixtures mit Quell-Commit), neu: \`quant/tests/evidence-states.test.mjs\`.

## UI-geschuetzte Skripte

\`scripts/vu2/browser-qa.mjs\` und \`scripts/discover/browser-qa.mjs\` stehen unter UI-Schutz (\`docs/quality/ui-protection-revisions.json\`). Sie stehen in der Inventur, sind aber nicht umgestellt; eine Aenderung braucht eine Revision mit Owner-Freigabe.

## Inventur

| Testdatei | Zeile | Art | Risiko | liest |
|---|---|---|---|---|
`;
  for (const e of es) {
    const r = by[e.file];
    t += `| \`${e.file}\` | ${r && r.reads ? r.line : "–"} | ${e.kategorie}${e.dynamisch ? " (dyn.)" : ""} | ${r ? r.risiko : "unbekannt"} | ${(e.liest || []).join(", ") || "–"} |\n`;
  }
  return t;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = scanAll();
  const i = process.argv.indexOf("--out"), d = process.argv.indexOf("--doc");
  if (d > 0) writeFileSync(process.argv[d + 1], renderDoc(rows, loadRegistry()));
  else if (i > 0) writeFileSync(process.argv[i + 1], renderTable(rows));
  else process.stdout.write(renderTable(rows));
}

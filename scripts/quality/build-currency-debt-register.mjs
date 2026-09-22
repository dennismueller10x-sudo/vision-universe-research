/* =========================================================================
   VISION UNIVERSE — build-currency-debt-register.mjs   (Currency Layer, O-6)

   DAS SCHULDENBUCH DER FEST VERDRAHTETEN WAEHRUNG.

   Der Regression Guard zaehlt 68 Stellen in 20 Produktdateien, an denen
   ein Waehrungssymbol oder eine Waehrungsentscheidung im Code steht. Der
   Owner-Entscheid O-6 ist an dieser Stelle ausdruecklich: NICHT blind
   ersetzen. Erst klassifizieren, dann gezielt migrieren.

   Der Grund ist nicht Vorsicht um ihrer selbst willen. Ein pauschales
   Ersetzen wuerde drei verschiedene Dinge gleich behandeln:

     einen Kurs, der EUR zeigen muss,
     eine Prozentzahl, die niemals ein Waehrungszeichen tragen darf,
     und eine bewusste Angabe in Originalwaehrung.

   Das Dritte ist kein Schaden, sondern eine Aussage - und wer sie
   automatisch umstellt, macht aus einer richtigen Anzeige eine falsche.

   DIE FUENF KLASSEN

     A MONETARY_DISPLAY            muss den Currency Contract konsumieren
     B PERCENTAGE_OR_RATIO         niemals FX-Konvertierung
     C STATIC_COPY                 Fliesstext, Beispiel, Ueberschrift
     D TEST_FIXTURE                nur aendern, wenn der Vertrag es verlangt
     E INTENTIONAL_NATIVE_CURRENCY darf bleiben, braucht aber eine
                                   dokumentierte Begruendung

   WIE KLASSIFIZIERT WIRD

   Aus dem Umfeld der Zeile, nicht aus ihrem Pfad. Eine Datei kann alle
   fuenf Klassen enthalten. Wo die Merkmale nicht ausreichen, lautet die
   Klasse UNCLASSIFIED - und das ist ein Arbeitsauftrag, keine Diagnose.
   Eine automatische Einordnung, die sich sicher gibt, wo sie raet, waere
   derselbe Fehler wie eine automatische Umstellung.

   Ausfuehren:
     node scripts/quality/build-currency-debt-register.mjs
     node scripts/quality/build-currency-debt-register.mjs --publish
     node scripts/quality/build-currency-debt-register.mjs --class=A
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCAN_DIRS, EXEMPT, EXTENSIONS, HARDCODED_CURRENCY,
  RATIO_MARKERS, MONETARY_MARKERS, NUMERIC_FORMATTING, TEST_MARKERS, INTENTIONAL_MARKERS,
  codeLines
} from "./currency-debt-patterns.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const PUBLISH = flags.has("--publish");
const classFilter = (args.find((a) => a.startsWith("--class=")) || "").slice("--class=".length) || null;

const OUT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx", "currency-debt-register.json")
  : resolve(ROOT, ".market-cache", "currency", "currency-debt-register.json");

/* Eine Zeile, die eine Zahl formatiert UND ein Waehrungszeichen anhaengt,
   ist eine Geldanzeige - unabhaengig davon, ob ein Kennzahlname darin
   vorkommt. */
function classify(line, file) {
  const inTestPath = /\/tests?\//.test(file) || /\.test\.|\.spec\./.test(file);
  if (inTestPath || TEST_MARKERS.test(line)) {
    return { klass: "D", label: "TEST_FIXTURE",
             action: "Nur aendern, wenn der Vertrag es verlangt.",
             confidence: inTestPath ? "HIGH" : "MEDIUM" };
  }
  if (RATIO_MARKERS.test(line)) {
    return { klass: "B", label: "PERCENTAGE_OR_RATIO",
             action: "Niemals FX-Konvertierung. Formatierung ueber money-format.formatPercent/formatMultiple.",
             confidence: "HIGH" };
  }
  if (INTENTIONAL_MARKERS.test(line)) {
    return { klass: "E", label: "INTENTIONAL_NATIVE_CURRENCY",
             action: "Darf bleiben. Semantik im Code dokumentieren, damit sie nicht spaeter als Schuld gelesen wird.",
             confidence: "MEDIUM" };
  }
  /* Der strukturelle Nachweis vor dem namentlichen: die Formatierer in
     discover/ui/surfaces.js heissen fmt(v, unit) und nennen keine
     Kennzahl. Sie waren deshalb alle UNCLASSIFIED, obwohl sie die
     eindeutigsten Faelle im ganzen Register sind. */
  if (NUMERIC_FORMATTING.test(line)) {
    return { klass: "A", label: "MONETARY_DISPLAY",
             action: "Muss den Currency Contract konsumieren (layer.money/price/metric, money-format).",
             confidence: "HIGH" };
  }
  if (MONETARY_MARKERS.test(line)) {
    return { klass: "A", label: "MONETARY_DISPLAY",
             action: "Muss den Currency Contract konsumieren (layer.money/price/metric, money-format).",
             confidence: "MEDIUM" };
  }
  const hasInterpolation = /\$\{|\+\s*[a-zA-Z_$]/.test(line);
  const wordy = (line.match(/[A-Za-zÄÖÜäöüß]{4,}/g) || []).length >= 6;
  if (!hasInterpolation && wordy) {
    return { klass: "C", label: "STATIC_COPY",
             action: "Pruefen, ob der Text eine dynamische Waehrung braucht. Oft nein.",
             confidence: "MEDIUM" };
  }
  return { klass: "UNCLASSIFIED", label: "UNCLASSIFIED",
           action: "Von Hand ansehen. Die Merkmale reichen nicht; eine geratene Klasse waere schlimmer als keine.",
           confidence: "NONE" };
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (["node_modules", "data", "fixtures", ".git"].includes(entry)) continue;
      walk(full, out);
    } else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const entries = [];
for (const file of SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (EXEMPT.some((frag) => rel.includes(frag))) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }

  for (const { line, text: code } of codeLines(text)) {
    const rule = HARDCODED_CURRENCY.find((r) => r.re.test(code));
    if (!rule) continue;
    const c = classify(code, rel);
    entries.push({
      file: rel, line, rule: rule.id,
      class: c.klass, label: c.label, action: c.action, confidence: c.confidence,
      text: code.slice(0, 160)
    });
  }
}

const byClass = {};
const byFile = {};
for (const e of entries) {
  byClass[e.class] = (byClass[e.class] || 0) + 1;
  byFile[e.file] = byFile[e.file] || {};
  byFile[e.file][e.class] = (byFile[e.file][e.class] || 0) + 1;
}

/* Die Migrationsreihenfolge. Klasse A zuerst und nach Dateien geordnet:
   eine Datei einmal anzufassen ist billiger und sicherer als dieselbe
   Datei dreimal. */
const migrationOrder = Object.entries(byFile)
  .map(([file, counts]) => ({ file, monetary: counts.A || 0, total: Object.values(counts).reduce((a, b) => a + b, 0), counts }))
  .filter((f) => f.monetary > 0)
  .sort((a, b) => b.monetary - a.monetary);

const report = {
  schema: "vu-currency-debt-register-1.0.0",
  generatedAtUtc: new Date().toISOString(),
  note: "Erst klassifizieren, dann migrieren (O-6). Klasse A ist die einzige, die den Currency " +
        "Contract konsumieren MUSS. B darf ihn nie konsumieren. E ist kein Schaden, sondern eine Aussage.",
  classes: {
    A: { label: "MONETARY_DISPLAY", rule: "muss Currency Contract konsumieren" },
    B: { label: "PERCENTAGE_OR_RATIO", rule: "niemals FX-Konvertierung" },
    C: { label: "STATIC_COPY", rule: "pruefen, ob dynamische Waehrung erforderlich" },
    D: { label: "TEST_FIXTURE", rule: "nur aendern, wenn der Vertrag es verlangt" },
    E: { label: "INTENTIONAL_NATIVE_CURRENCY", rule: "darf bleiben, Semantik dokumentieren" },
    UNCLASSIFIED: { label: "UNCLASSIFIED", rule: "von Hand ansehen" }
  },
  total: entries.length,
  byClass,
  filesAffected: Object.keys(byFile).length,
  migrationOrder,
  entries: classFilter ? entries.filter((e) => e.class === classFilter) : entries
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log("CURRENCY DEBT REGISTER (O-6)\n");
console.log(`  ${entries.length} Stellen in ${Object.keys(byFile).length} Dateien\n`);
for (const [klass, spec] of Object.entries(report.classes)) {
  const n = byClass[klass] || 0;
  if (!n) continue;
  console.log(`  ${klass.padEnd(14)} ${String(n).padStart(3)}  ${spec.label.padEnd(28)} ${spec.rule}`);
}
console.log(`\n  Migrationsreihenfolge (Klasse A zuerst, je Datei gebuendelt):`);
for (const f of migrationOrder.slice(0, 12)) {
  console.log(`    ${String(f.monetary).padStart(2)}x A  ${f.file}`);
}
if (classFilter) {
  console.log(`\n  Klasse ${classFilter}:`);
  for (const e of report.entries.slice(0, 40)) {
    console.log(`    ${e.file}:${e.line}  [${e.confidence}]`);
    console.log(`      ${e.text}`);
  }
}
console.log(`\nRegister: ${OUT}`);

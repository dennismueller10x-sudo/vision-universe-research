/* =========================================================================
   VISION UNIVERSE — assert-no-local-fx.mjs   (Currency Layer V1, §29, §49)

   DER REGRESSION GUARD: KEIN PRODUKT RECHNET SELBST UM.

   Ein zentraler Currency Layer haelt genau so lange, wie niemand daneben
   eine eigene Zeile schreibt. Die Zeile entsteht nicht aus Boswilligkeit,
   sondern aus Eile: eine Karte braucht einen EUR-Wert, der Layer ist
   gerade nicht eingebunden, `* 0.85` ist schneller als ein Import. Drei
   Monate spaeter steht 0.85 immer noch dort, und niemand weiss, warum
   diese eine Karte andere Zahlen zeigt.

   Dieses Skript findet solche Zeilen, bevor sie eingehen.

   DREI BEFUNDARTEN, ZWEI HAERTEGRADE

   1. FX-ARITHMETIK ausserhalb des Core - bricht den Lauf ab.
      usdToEur(), ein lokal gehaltener exchangeRate, wechselkurs =.
      Diese Muster sind eindeutig: sie haben keine zweite Lesart.

   2. VERDAECHTIGE KONSTANTEN - gezaehlt, nicht abgebrochen. Eine
      Multiplikation mit einer Zahl in der Groessenordnung eines
      Wechselkurses auf einer Zeile mit Waehrungsbezug.

      Warum das KEIN Abbruch ist, obwohl es verlockend waere: der erste
      Entwurf dieser Regel meldete dashboard/app.js:24 und
      dashboard/index_legacy_v63.html:497. Dort steht `close * 1.015` -
      eine Szenariogrenze von anderthalb Prozent, formatiert mit einer
      Funktion namens usd(). Jedes Merkmal einer FX-Umrechnung, und
      trotzdem keine. Ein Guard, der zwei Fehlalarme je Lauf erzeugt,
      wird nach dem dritten Lauf uebergangen und schuetzt dann nichts
      mehr. Ein Zaehler mit Grundlinie schuetzt weniger scharf, aber
      dauerhaft.

   3. FEST VERDRAHTETE WAEHRUNGSSYMBOLE in Produktcode - das ist der
      Bestand, den der Currency Layer ersetzt. Ebenfalls gezaehlt und
      gegen eine Grundlinie gehalten. Die Zahl darf sinken und nicht
      steigen. So wandert die Formatierung Stueck fuer Stueck in
      money-format.js, ohne Grossmigration (§30).

   Warum die Grundlinie und nicht sofort null: es gibt heute ueber ein
   Dutzend solcher Stellen in Discover, Quant-UI und vu2. Sie alle in
   diesem Auftrag anzufassen hiesse, Oberflaechen zu aendern, die
   ausdruecklich nicht Teil dieses Auftrags sind (§28, §48). Der Guard
   haelt den Stand fest, statt ihn zu ignorieren.

   Ausfuehren:
     node scripts/quality/assert-no-local-fx.mjs
     node scripts/quality/assert-no-local-fx.mjs --update-baseline
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCAN_DIRS, EXEMPT, EXTENSIONS,
  FX_MATH, FX_SUSPECT, CURRENCY_CONTEXT, HARDCODED_CURRENCY,
  codeLines
} from "./currency-debt-patterns.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = join(root, "quant", "config", "currency-formatting-baseline.json");
const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update-baseline");

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "data" || entry === "fixtures" || entry === ".git") continue;
      walk(full, out);
    } else if (EXTENSIONS.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function isExempt(rel) {
  return EXEMPT.some((frag) => rel.includes(frag));
}

const files = SCAN_DIRS.flatMap((d) => walk(join(root, d)));
const violations = [];
const suspects = [];
const formatting = [];

for (const file of files) {
  const rel = relative(root, file).split("\\").join("/");
  if (isExempt(rel)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }

  /* Kommentare sind kein Code - auch nicht ihre Fortsetzungszeilen.
     codeLines() fuehrt den Blockzustand mit; die Fassung ohne ihn hat
     die Schlusszeile eines erklaerenden Kommentars als Waehrungsschuld
     gezaehlt. */
  for (const { line, text: code } of codeLines(text)) {
    for (const rule of FX_MATH) {
      if (rule.re.test(code)) {
        violations.push({ file: rel, line, rule: rule.id, why: rule.why, text: code.slice(0, 160) });
      }
    }
    for (const rule of FX_SUSPECT) {
      if (!rule.re.test(code)) continue;
      if (rule.requiresCurrencyContext && !CURRENCY_CONTEXT.test(code)) continue;
      suspects.push({ file: rel, line, rule: rule.id, why: rule.why, text: code.slice(0, 160) });
    }
    for (const rule of HARDCODED_CURRENCY) {
      if (rule.re.test(code)) {
        formatting.push({ file: rel, line, rule: rule.id, text: code.slice(0, 160) });
        break;
      }
    }
  }
}

const byFile = {};
for (const f of formatting) byFile[f.file] = (byFile[f.file] || 0) + 1;
const suspectsByFile = {};
for (const f of suspects) suspectsByFile[f.file] = (suspectsByFile[f.file] || 0) + 1;

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify({
    schema: "vu-currency-formatting-baseline-1.0.0",
    note: "Stellen mit fest verdrahteter Waehrungsdarstellung, die der Currency Layer nach und nach uebernimmt. " +
          "Die Zahl je Datei darf sinken und nicht steigen. Neue Dateien mit solchen Stellen sind ein Fehlschlag.",
    updatedAt: new Date().toISOString().slice(0, 10),
    total: formatting.length,
    byFile,
    suspectTotal: suspects.length,
    suspectsByFile
  }, null, 2) + "\n");
  console.log(`Grundlinie geschrieben: ${formatting.length} Formatierungsstellen in ${Object.keys(byFile).length} Dateien, ` +
    `${suspects.length} verdaechtige Konstanten in ${Object.keys(suspectsByFile).length} Dateien.`);
  process.exit(0);
}

let failed = false;

if (violations.length) {
  failed = true;
  console.error(`\nFX-Arithmetik ausserhalb des Currency Core — ${violations.length} Fund(e):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.text}`);
    console.error(`    -> ${v.why}\n`);
  }
  console.error("  Der Weg: quant/engines/fx/currency-contract.js einbinden und layer.money()/layer.price()/layer.metric() benutzen.\n");
} else {
  console.log("Keine FX-Arithmetik ausserhalb von quant/engines/fx/. ");
}

if (!existsSync(BASELINE)) {
  console.error(`Grundlinie fehlt (${relative(root, BASELINE)}). Einmalig erzeugen: --update-baseline`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const regressions = [];
function compare(actual, allowedMap, label) {
  for (const [file, count] of Object.entries(actual)) {
    const allowed = (allowedMap || {})[file];
    if (allowed === undefined) {
      regressions.push(`${file}: ${count} neue ${label} — diese Datei stand nicht in der Grundlinie.`);
    } else if (count > allowed) {
      regressions.push(`${file}: ${count} ${label}, erlaubt sind ${allowed}.`);
    }
  }
}
compare(byFile, baseline.byFile, "Stelle(n) mit fest verdrahteter Waehrung");
compare(suspectsByFile, baseline.suspectsByFile, "verdaechtige Konstante(n)");

if (regressions.length) {
  failed = true;
  console.error(`\nWaehrungsdarstellung ist gewachsen statt geschrumpft:\n`);
  for (const r of regressions) console.error("  " + r);
  console.error("\n  Neue Betraege werden ueber quant/engines/fx/money-format.js formatiert, nicht von Hand.\n");
} else {
  const improved = baseline.total - formatting.length;
  console.log(`Waehrungsdarstellung: ${formatting.length} verbliebene Stellen (Grundlinie ${baseline.total}` +
    (improved > 0 ? `, ${improved} bereits abgebaut` : "") + ").");
  console.log(`Verdaechtige Konstanten: ${suspects.length} (Grundlinie ${baseline.suspectTotal ?? 0}).`);
}

process.exit(failed ? 1 : 0);

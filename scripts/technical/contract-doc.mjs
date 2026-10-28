#!/usr/bin/env node
/* Erzeugt die Spaltentabelle in docs/technical/DATA_CONTRACT.md aus quant/engines/technical/screener-contract.js.
   node scripts/technical/contract-doc.mjs          schreibt die Tabelle zwischen die Marken
   node scripts/technical/contract-doc.mjs --check  Exit 1, wenn die Doku nicht zum Vertrag passt (Test) */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const C = require(join(root, "quant/engines/technical/screener-contract.js"));
export const DOC = join(root, "docs/technical/DATA_CONTRACT.md");
const START = "<!-- contract:columns:start -->", END = "<!-- contract:columns:end -->";

const fmt = (x) => (x === Infinity ? "∞" : x === -Infinity ? "−∞" : String(x).replace("-", "−").replace(".", ","));
function rangeText(s) {
  if (s.values) return s.values.join(", ");
  if (!s.range) return s.type === "num" || s.type === "pct" ? "endlich" : "";
  return fmt(s.range[0]) + " … " + fmt(s.range[1]);
}

export function table() {
  const spec = C.columns(), rows = Object.keys(spec).sort();
  const lines = ["| Spalte | Typ | null | Werte | Bedeutung |", "|---|---|---|---|---|"];
  for (const k of rows) {
    const s = spec[k];
    const type = s.type + (s.integer ? " (ganzzahlig)" : "") + (s.window ? ", Prüfraum `" + s.window + "`" : "");
    const label = String(s.label || "").replace(/\|/g, "/") + (s.optional ? " (optional)" : "");
    lines.push("| `" + k + "` | " + type + " | " + (s.nullable ? "ja" : "nein") + " | " + rangeText(s).replace(/\|/g, "/") + " | " + label + " |");
  }
  return START + "\n" + C.CONTRACT_VERSION + ", " + rows.length + " Spalten.\n\n" + lines.join("\n") + "\n" + END;
}

export function render(text) {
  const i = text.indexOf(START), j = text.indexOf(END);
  if (i < 0 || j < 0) throw new Error("Marken fehlen in DATA_CONTRACT.md");
  return text.slice(0, i) + table() + text.slice(j + END.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = readFileSync(DOC, "utf8"), next = render(text);
  if (process.argv.includes("--check")) {
    if (next !== text) { console.error("DATA_CONTRACT.md passt nicht zum Vertrag: node scripts/technical/contract-doc.mjs"); process.exit(1); }
    console.log("DATA_CONTRACT.md aktuell");
  } else { writeFileSync(DOC, next); console.log("DATA_CONTRACT.md geschrieben"); }
}

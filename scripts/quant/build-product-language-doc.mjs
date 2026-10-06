#!/usr/bin/env node
/* =========================================================================
   Generate docs/VU_QUANT_2_PRODUCT_LANGUAGE.md from the dictionary.

   The document is not written by hand. A hand-written copy of a dictionary
   is a second dictionary, and two dictionaries disagree within a month -
   usually in the direction of whichever one somebody remembered to update.
   A test regenerates this file and compares it with what is committed, so
   a drift fails the build rather than reaching a reader.

   Run with --check to verify instead of write.
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Language = require(join(ROOT, "quant/engines/product-language.js"));
const dictionary = JSON.parse(readFileSync(join(ROOT, "quant/methodology/product-language-v1.json"), "utf8"));
const OUT = join(ROOT, "docs/VU_QUANT_2_PRODUCT_LANGUAGE.md");

const cell = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function render() {
  const validation = Language.validate();
  if (!validation.valid) throw new Error("the dictionary is incomplete: " + validation.errors.join("; "));

  const out = [];
  out.push("# Vision Universe® Quant 2.0 — Product Language Dictionary");
  out.push("");
  out.push("`" + dictionary.methodologyVersion + "` · Quelle: `quant/methodology/product-language-v1.json` · Zugriff:");
  out.push("`quant/engines/product-language.js`");
  out.push("");
  out.push("> **Diese Datei wird erzeugt.** `node scripts/quant/build-product-language-doc.mjs`.");
  out.push("> Änderungen gehören in die JSON-Quelle; ein Test vergleicht beide und schlägt bei Abweichung fehl.");
  out.push("");
  out.push(dictionary.purpose);
  out.push("");
  out.push(dictionary.singleSource);
  out.push("");

  out.push("## Die vier Ebenen");
  out.push("");
  out.push("| Ebene | Name | Regel |");
  out.push("|---|---|---|");
  for (const layer of dictionary.layers) {
    out.push("| `" + layer.id + "` | " + cell(layer.label) + " | " + cell(layer.rule) + " |");
  }
  out.push("");

  out.push("## Sprachregeln");
  out.push("");
  for (const rule of dictionary.rules) out.push("- " + rule);
  out.push("");

  for (const category of dictionary.categories) {
    out.push("## " + category.label);
    out.push("");
    for (const term of category.terms) {
      out.push("### " + term.userLabel);
      out.push("");
      out.push("| Feld | Inhalt |");
      out.push("|---|---|");
      out.push("| Interner Begriff | `" + cell(term.internal) + "` |");
      out.push("| Schlüssel | `" + term.id + "` |");
      out.push("| **User Label** | **" + cell(term.userLabel) + "** |");
      if (term.question) out.push("| Als Frage | " + cell(term.question) + " |");
      out.push("| Erklärung für Einsteiger | " + cell(term.beginner) + " |");
      out.push("| Professional Label | " + cell(term.professionalLabel) + " |");
      out.push("| Tooltip | " + cell(term.tooltip) + " |");
      out.push("| Negativer Zustand | " + cell(term.negative) + " |");
      out.push("| Nicht verfügbar | " + cell(term.unavailable) + " |");
      out.push("");
    }
  }

  out.push("## Begriffe, die nicht an den Anfang gehören");
  out.push("");
  out.push(dictionary.forbiddenNote);
  out.push("");
  for (const entry of dictionary.forbiddenInPrimaryCopy) out.push("- `" + entry + "`");
  out.push("");
  out.push("Ein Test prüft `vu2/experience.js` gegen diese Liste: keiner dieser Begriffe darf in einer");
  out.push("Überschrift, einem Eyebrow, einem Chip oder einem Badge stehen.");
  out.push("");

  return out.join("\n");
}

const markdown = render();
if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== markdown) {
    process.stderr.write("docs/VU_QUANT_2_PRODUCT_LANGUAGE.md is out of date; run build-product-language-doc.mjs\n");
    process.exit(1);
  }
  process.stdout.write("product language doc is in sync\n");
} else {
  writeFileSync(OUT, markdown);
  process.stdout.write("wrote docs/VU_QUANT_2_PRODUCT_LANGUAGE.md · " +
    dictionary.categories.reduce((sum, c) => sum + c.terms.length, 0) + " Begriffe in " +
    dictionary.categories.length + " Kategorien\n");
}

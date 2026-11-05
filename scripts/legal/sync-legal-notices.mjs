#!/usr/bin/env node
/* Pflicht-Hinweise (assets/legal-notices.json, Strang F) ins Frontend übernehmen.
   Die Texte stehen nur in der JSON-Datei. Dieses Skript schreibt einen erzeugten Block in
   assets/vu-ui.js (VUUI.legal(key) für Atlas, Backtests, Musterdepots …) und in
   assets/site-navigation.js (einheitlicher Seitenfuß). Angezeigt wird nur, wenn die Datei
   legalApproved: true trägt (Owner + Anwalt, docs/accounts/RECHTLICHE_ABNAHME.md A15).
   Aufruf: node scripts/legal/sync-legal-notices.mjs [--check]   (--check: nur prüfen, Exit 1 bei Abweichung) */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LINK_LABEL = { risikohinweise: "Risikohinweise", marHinweise: "Hinweise nach MAR", impressum: "Impressum", bedingungen: "Nutzungsbedingungen" };
const BEGIN = "/* VU-LEGAL:BEGIN – erzeugt aus assets/legal-notices.json (scripts/legal/sync-legal-notices.mjs), nicht von Hand ändern */";
const END = "/* VU-LEGAL:END */";

export function legalData(src) {
  const d = typeof src === "string" ? JSON.parse(src) : src;
  const links = (keys) => (keys || []).filter((k) => d.links[k]).map((k) => [LINK_LABEL[k] || k, d.links[k]]);
  const notices = {};
  for (const [k, n] of Object.entries(d.notices)) notices[k] = { text: n.text, label: n.label || null, required: n.required || null, links: links(n.links) };
  return { approved: d.legalApproved === true, version: d.version, notices };
}
export function block(data, indent) {
  return BEGIN + "\n" + indent + "var LEGAL = " + JSON.stringify(data) + ";\n" + indent + END;
}
function replaceBlock(src, data, file) {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error(file + ": Block VU-LEGAL fehlt");
  const lineStart = src.lastIndexOf("\n", a) + 1, indent = src.slice(lineStart, a);
  return src.slice(0, a) + block(data, indent) + src.slice(b + END.length);
}
export const TARGETS = ["assets/vu-ui.js", "assets/site-navigation.js"];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const data = legalData(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
  let bad = 0;
  for (const f of TARGETS) {
    const p = join(ROOT, f), src = readFileSync(p, "utf8"), next = replaceBlock(src, data, f);
    if (next === src) continue;
    if (check) { console.error(f + ": Pflicht-Hinweise weichen von assets/legal-notices.json ab (node scripts/legal/sync-legal-notices.mjs)"); bad++; }
    else { writeFileSync(p, next); console.log("aktualisiert: " + f); }
  }
  process.exit(bad ? 1 : 0);
}

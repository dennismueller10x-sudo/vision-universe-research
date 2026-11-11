#!/usr/bin/env node
/* Pflicht-Hinweise (assets/legal-notices.json, Strang F) ins Frontend übernehmen.
   Die Texte stehen nur in der JSON-Datei. Dieses Skript schreibt einen erzeugten Block in
   assets/vu-ui.js (VUUI.legal(key) für Atlas, Backtests, Musterdepots …) und in
   assets/site-navigation.js (Menü „Rechtliches & Infos“). Angezeigt wird nur, wenn die Datei
   legalApproved: true trägt (Owner + Anwalt, docs/accounts/RECHTLICHE_ABNAHME.md A15).
   Aufruf: node scripts/legal/sync-legal-notices.mjs [--check]   (--check: nur prüfen, Exit 1 bei Abweichung) */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LINK_LABEL = { risikohinweise: "Risikohinweise", methodik: "Methodik, Quellen und Interessen", datenschutz: "Datenschutz", impressum: "Impressum", kontakt: "Kontakt", bedingungen: "Nutzungsbedingungen", kuendigen: "Verträge hier kündigen", widerrufen: "Vertrag widerrufen", quellen: "Datenquellen & Methodik" };
const BEGIN = "/* VU-LEGAL:BEGIN – erzeugt aus assets/legal-notices.json (scripts/legal/sync-legal-notices.mjs), nicht von Hand ändern */";
const END = "/* VU-LEGAL:END */";

export function legalData(src) {
  const d = typeof src === "string" ? JSON.parse(src) : src;
  const links = (keys) => (keys || []).filter((k) => d.links[k]).map((k) => [LINK_LABEL[k] || k, d.links[k]]);
  const notices = {};
  for (const [k, n] of Object.entries(d.notices)) notices[k] = { text: n.text, label: n.label || null, required: n.required || null, links: links(n.links) };
  /* Pflicht-Links der App (appLinks.always): immer sichtbar im Menü, unabhängig von der Freigabe der Hinweistexte –
     es sind nur Links auf die Rechtstexte der Webseite (Plan §11). */
  const appLinks = ((d.appLinks && d.appLinks.always) || []).filter((l) => d.links[l.key]).map((l) => [l.label || LINK_LABEL[l.key] || l.key, d.links[l.key]]);
  /* Owner-Entscheidung 07.11.2026: In der App ersetzt das Menü „Rechtliches & Infos“ den Seitenfuß (notices.footer.app = "menu"). */
  const menuTitle = (d.appLinks && d.appLinks.menuTitle) || "Rechtliches";
  const footerInApp = !(d.notices.footer && d.notices.footer.app === "menu");
  const footerOnWeb = !(d.notices.footer && d.notices.footer.web === "menu");
  return { approved: d.legalApproved === true, version: d.version, notices, appLinks, menuTitle, footerInApp, footerOnWeb };
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

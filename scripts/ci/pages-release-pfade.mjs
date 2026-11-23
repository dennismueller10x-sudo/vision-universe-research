#!/usr/bin/env node
/* Loest ein Merge mit diesen Dateien pages-release aus (push auf main)? Liest den push-Pfadfilter DIREKT aus
   .github/workflows/pages-release.yml (eine Quelle, keine Kopie) und wendet ihn an wie GitHub: Reihenfolge zaehlt, ein spaeterer Eintrag
   (positiv oder mit "!") entscheidet; "*" = ohne "/", "**" = auch "/". Genutzt von pages-frei.sh (Boersenfenster, Steuerung 23.11.2026).
   Aufruf: node pages-release-pfade.mjs [workflow-datei] < dateiliste  -> Zeile "ja <n>" bzw. "nein 0", danach bis zu 5 ausloesende Pfade. */
import { readFileSync } from "node:fs";

/** push.paths aus dem Workflow-Text (nur der Block `push:` -> `paths:`, Kommentarzeilen ignoriert). */
export function leseFilter(yaml) {
  const zeilen = yaml.split("\n");
  let i = zeilen.findIndex((l) => /^  push:\s*$/.test(l));
  if (i < 0) throw new Error("push: nicht gefunden");
  const out = [];
  let inPaths = false;
  for (i += 1; i < zeilen.length && (/^\s{3,}/.test(zeilen[i]) || /^\s*(#.*)?$/.test(zeilen[i])); i++) {
    const l = zeilen[i];
    if (/^\s*#/.test(l) || /^\s*$/.test(l)) continue;
    if (/^    paths:\s*$/.test(l)) { inPaths = true; continue; }
    if (inPaths) { const m = l.match(/^      - '([^']+)'\s*(#.*)?$/) || l.match(/^      - "([^"]+)"\s*(#.*)?$/); if (m) out.push(m[1]); else if (/^    \S/.test(l)) break; }
    else if (/^    \S/.test(l)) inPaths = false;
  }
  if (!out.length) throw new Error("push.paths leer");
  return out;
}

const regex = (muster) => new RegExp("^" + muster.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, "\u0003").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*")
  .replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*").replace(/\u0003/g, "[^/]") + "$");

/** true, wenn der Pfad den Filter besteht (der letzte passende Eintrag entscheidet). */
export function passiert(pfad, filter) {
  let ok = false;
  for (const m of filter) { const neg = m.startsWith("!"); if (regex(neg ? m.slice(1) : m).test(pfad)) ok = !neg; }
  return ok;
}
export const ausloesende = (dateien, filter) => dateien.filter((p) => passiert(p, filter));

/** Boersenfenster: Mo-Fr 13:30 <= UTC < 21:00 (Steuerung 23.11.2026). */
export function imBoersenfenster(d) {
  const tag = d.getUTCDay(); const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  return tag >= 1 && tag <= 5 && min >= 13 * 60 + 30 && min < 21 * 60;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const datei = process.argv[2] || new URL("../../.github/workflows/pages-release.yml", import.meta.url).pathname;
  const dateien = readFileSync(0, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const a = ausloesende(dateien, leseFilter(readFileSync(datei, "utf8")));
  console.log(a.length ? `ja ${a.length}` : "nein 0"); for (const p of a.slice(0, 5)) console.log(p);
}

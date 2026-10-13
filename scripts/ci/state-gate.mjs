#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — state-gate.mjs

   ZUSTANDSTESTS: VERBINDLICH, ABER NICHT FUER JEDEN PR

   core/tests/state/*.test.mjs prueft nicht Code, sondern ob die ERZEUGTEN
   Daten zweier unabhaengiger Produkte zueinander passen (z. B. jedes
   Supertrader-Signal hat eine Discover-Seite). Beide Erzeuger laufen auf
   eigenen Zeitplaenen; nach einer Universumsaenderung des Nachtlaufs steht
   das andere Produkt bis zu seinem eigenen Lauf auf dem Vortag. Das ist ein
   Datenbefund. Ein PR, der weder Code noch Daten dieser Produkte beruehrt,
   hat ihn nicht verursacht und kann ihn nicht beheben.

   Beobachtet am 13.10.2026: der Zeitplanlauf von supertrader-signals.yml kam
   in 15 von 15 Faellen zwischen 323 und 428 Minuten zu spaet; ein
   Discover-PR (#637) stand Stunden rot wegen eines entfallenen Titels (QRVO)
   im Supertrader-Stand.

   Regeln:
     rot auf main / Zeitplan / Dispatch / --strict   immer Exit 1 (verbindlich)
     rot im PR, der einen Eingang beruehrt            Exit 1 (der PR ist beteiligt)
     rot im PR ohne beruehrten Eingang                Warnung + Zusammenfassung
                                                      mit Erzeuger und Abhilfe,
                                                      Exit 0 (Datenbefund)
     Git-Fehler beim Ermitteln der Aenderungen        gilt als "beruehrt" (nie
                                                      still "0 Dateien")
     Test ohne Eintrag im Manifest                    gilt als streng (immer)

   Nichts wird gelockert: die Assertions stehen unveraendert in den Tests,
   dieselben Tests laufen unveraendert; entschieden wird nur, ob ein
   Datenbefund einen fremden PR blockiert.

   Aufruf: node scripts/ci/state-gate.mjs --event=<name> [--base=<sha> --head=<sha>]
             [--changed=<datei>] [--dir=core/tests/state] [--strict]
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ** = beliebig viele Ebenen, * = innerhalb einer Ebene. */
export function globToRegExp(glob) {
  let r = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") { r += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else r += "[^/]*";
    } else r += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + r + "$");
}
export const beruehrt = (dateien, globs) => dateien.filter((f) => globs.some((g) => globToRegExp(g).test(f)));

/* Entscheidung ohne Nebenwirkung (testbar). */
export function entscheide({ event, strict, rot, geaendert, manifestEintrag }) {
  if (!rot) return { exit: 0, art: "gruen" };
  if (strict || event !== "pull_request") return { exit: 1, art: "streng", grund: strict ? "--strict" : "Ereignis " + event };
  if (!manifestEintrag) return { exit: 1, art: "streng", grund: "Test ohne Eintrag im Manifest" };
  if (geaendert === null) return { exit: 1, art: "beteiligt", grund: "Aenderungen nicht ermittelbar", beruehrt: [] };
  const hit = beruehrt(geaendert, manifestEintrag.blockingWhenPrTouches || []);
  if (hit.length) return { exit: 1, art: "beteiligt", grund: "der PR beruehrt Eingaenge des Tests", beruehrt: hit };
  return { exit: 0, art: "datenbefund", grund: "der PR beruehrt keinen Eingang des Tests", beruehrt: [] };
}

function geaenderteDateien(args) {
  if (args.changed) {
    if (!existsSync(args.changed)) return null;
    return readFileSync(args.changed, "utf8").split("\n").map((z) => z.trim()).filter(Boolean);
  }
  if (!args.base || !args.head) return null;
  const r = spawnSync("git", ["diff", "--name-only", args.base + "..." + args.head], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split("\n").map((z) => z.trim()).filter(Boolean);
}

function fuehreAus(datei) {
  /* Kind-Lauf ohne den Kontext eines eventuellen Eltern-Testlaufs (sonst meldet node --test nichts). */
  const env = Object.assign({}, process.env); delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ["--test", datei], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env });
  const rot = r.status !== 0;
  const namen = (r.stdout.match(/^not ok \d+ - .*$/gm) || []).map((z) => z.replace(/^not ok \d+ - /, ""));
  const meldungen = (r.stdout.match(/^\s+(?:\+\s+)?'[^'\n]+'$/gm) || []).map((z) => z.trim().replace(/^\+\s*/, "")).slice(0, 8);
  return { rot, namen, meldungen, ausgabe: r.stdout + r.stderr };
}

export async function main(argv, env) {
  const args = {};
  for (const a of argv) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }
  const dir = resolve(ROOT, args.dir || "core/tests/state");
  const event = args.event || env.GITHUB_EVENT_NAME || "unbekannt";
  const strict = !!args.strict;
  const manifestPfad = join(dir, "manifest.json");
  const manifest = existsSync(manifestPfad) ? JSON.parse(readFileSync(manifestPfad, "utf8")) : { tests: [] };
  const dateien = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).sort() : [];
  const zeilen = ["### Zustandstests (Querverträge über erzeugte Daten)", "", "| Test | Ergebnis | Einordnung |", "|---|---|---|"];
  let geaendert; /* erst bei Bedarf ermitteln */
  let exit = 0;
  for (const datei of dateien) {
    const eintrag = (manifest.tests || []).find((t) => t.file === datei) || null;
    const res = fuehreAus(join(dir, datei));
    if (res.rot && geaendert === undefined && event === "pull_request" && !strict) geaendert = geaenderteDateien(args);
    const urteil = entscheide({ event, strict, rot: res.rot, geaendert: geaendert === undefined ? null : geaendert, manifestEintrag: eintrag });
    if (urteil.exit) exit = 1;
    const titel = eintrag ? eintrag.title : datei;
    zeilen.push("| " + titel + " | " + (res.rot ? "ROT" : "grün") + " | " + (res.rot ? urteil.art + " - " + urteil.grund : "-") + " |");
    if (res.rot) {
      const was = (res.namen.concat(res.meldungen)).slice(0, 8).join("; ");
      const wer = eintrag ? (eintrag.producers || []).join(" · ") : "unbekannt";
      if (urteil.art === "datenbefund") {
        console.log("::warning title=Zustandstest rot (Datenbefund, nicht dieser PR)::" + titel + " - " + was + " | Erzeuger: " + wer + " | Abhilfe: " + (eintrag.remedy || "-"));
        zeilen.push("", "Datenbefund, nicht dieser PR: " + was, "Erzeuger: " + wer, "Abhilfe: " + (eintrag.remedy || "-"));
      } else {
        console.log("::error title=Zustandstest rot::" + titel + " - " + was + " (" + urteil.grund + (urteil.beruehrt && urteil.beruehrt.length ? ": " + urteil.beruehrt.slice(0, 5).join(", ") : "") + ")");
        console.log(res.ausgabe.split("\n").slice(-60).join("\n"));
      }
    }
  }
  if (!dateien.length) zeilen.push("| (keine Zustandstests) | - | - |");
  const text = zeilen.join("\n") + "\n";
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, text); } catch { /* ohne Summary */ } }
  return exit;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).then((c) => process.exit(c));
}

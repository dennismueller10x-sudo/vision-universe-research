#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — run-realtime-tests.mjs

   Fuehrt die Testreihen des Realtime-Pfads aus und hinterlaesst eine
   Marke, auf die sich das Deployment-Tor berufen kann.

   Warum eine Marke und nicht "der Schritt davor war gruen": ein
   Workflow-Schritt, der gruen war, hinterlaesst nichts, was ein
   spaeterer Lauf pruefen koennte. Eine Marke mit Zeitstempel schon - und
   das Tor lehnt sie ab, wenn sie zu alt ist.

   Geprueft wird ausdruecklich der RUECKFALL (Abnahmepunkt
   REALTIME_FALLBACK): Abriss der Anbieterverbindung, Ablehnung durch
   den Budgetwaechter, erschoepftes Kontingent, geschlossene Boerse,
   unerreichbarer Worker. Jeder dieser Faelle hat einen Test, und jeder
   endet damit, dass der Browser den Snapshot-Pfad behaelt.
   ========================================================================= */

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");

/* Die Reihen, die den Realtime-Pfad tragen. Die Muster sind dieselben,
   die die CI sonst benutzt. */
const REIHEN = [
  { name: "subscription-manager", muster: "quant/tests/subscription-manager.test.mjs" },
  { name: "free-budget", muster: "quant/tests/free-budget.test.mjs" },
  { name: "worker/vu-live", muster: "worker/tests/vu-live.test.mjs" },
  { name: "discover/live-stream", muster: "discover/tests/live-stream.test.mjs" },
  { name: "discover/live-hub", muster: "discover/tests/live-hub.test.mjs" },
  /* Die bestehenden Reihen des Realtime-Stacks. Sie sind nicht neu, und
     genau deshalb stehen sie hier: der Bauauftrag verlangt, dass sie
     erhalten bleiben (§16 "Bestehende Realtime-Tests erhalten"). Ein Tor,
     das nur die neuen Tests prueft, merkt nicht, wenn die alten fallen. */
  { name: "realtime-engine", muster: "quant/tests/realtime-engine.test.mjs" },
  { name: "realtime-integration", muster: "quant/tests/realtime-integration.test.mjs" },
  { name: "realtime-sessions", muster: "quant/tests/realtime-sessions.test.mjs" },
  { name: "realtime-capability", muster: "quant/tests/realtime-capability.test.mjs" },
  { name: "realtime-matrix", muster: "quant/tests/realtime-matrix.test.mjs" },
  { name: "tiingo-wiring", muster: "quant/tests/verify-tiingo-realtime-wiring.test.mjs" }
];

const ergebnisse = [];
let gesamt = 0, fehler = 0;

for (const r of REIHEN) {
  const lauf = spawnSync(process.execPath, ["--test", r.muster], { cwd: root, encoding: "utf8" });
  const text = (lauf.stdout || "") + (lauf.stderr || "");
  const zahl = (feld) => {
    const m = new RegExp("^# " + feld + " (\\d+)$", "m").exec(text);
    return m ? parseInt(m[1], 10) : null;
  };
  const tests = zahl("tests"), pass = zahl("pass"), fail = zahl("fail");
  const ok = lauf.status === 0 && fail === 0 && tests !== null && tests > 0;
  ergebnisse.push({ suite: r.name, pattern: r.muster, tests, pass, fail, exitCode: lauf.status, ok });
  if (tests) gesamt += tests;
  if (fail) fehler += fail;
  console.log("  " + (ok ? "ok    " : "FEHLT ") + r.name.padEnd(24) +
              (tests === null ? "keine Ausgabe" : tests + " Tests, " + fail + " Fehler"));
  if (!ok) console.log(text.split("\n").filter((z) => /^not ok|^# fail|Error/.test(z)).slice(0, 5).join("\n"));
}

const alleGruen = ergebnisse.every((e) => e.ok);
const marke = {
  schemaVersion: "vu-live-tests-1.0.0",
  checkedAt: new Date().toISOString(),
  allPassed: alleGruen,
  total: gesamt,
  failed: fehler,
  suites: ergebnisse,
  covers: [
    "Abriss der Anbieterverbindung (VL-13, LS-8)",
    "Ablehnung durch den Budgetwaechter (VL-20, LS-9)",
    "erschoepftes Kontingent mit Rueckfall (VL-21, LS-10)",
    "geschlossene Boerse: Wochenende, Feiertag, Nacht (VL-15, VL-16, LS-5)",
    "unerreichbarer Worker: Client verhaelt sich wie ohne Strom (LS-1, LS-8)",
    "Referenzzaehlung: 100 Zuschauer = 1 Abonnement (VL-3)",
    "Nachlauf und Rueckkehr ohne neuen Verbindungsaufbau (VL-8, VL-9)",
    "kein Schluessel in Nachricht, Zustandsbericht oder Protokoll (VL-27, VL-31)"
  ]
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "vu-live-tests-passed.json"), JSON.stringify(marke, null, 2) + "\n");

console.log("");
console.log((alleGruen ? "GRUEN: " : "ROT: ") + gesamt + " Tests, " + fehler + " Fehler");
if (!alleGruen) process.exit(1);

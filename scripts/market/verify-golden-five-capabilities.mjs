/* =========================================================================
   VISION UNIVERSE — verify-golden-five-capabilities.mjs   (Phase 5)

   Misst, was der bestehende Tiingo-Zugang fuer JEDEN der fuenf Golden-Five-
   Titel tatsaechlich liefert - Kursendpunkt, Intraday, Extended Hours,
   WebSocket - statt es zu behaupten. Ruft dafuer ausschliesslich das
   bestehende, bereits laufzeitgeprueft und schluessel-/kursfreie Skript
   scripts/market/verify-tiingo-realtime.mjs einmal je Titel auf
   (VU_VERIFY_SYMBOL) - keine zweite Messlogik, keine neue Architektur.

   WebSocket-Verbindungsaufbau (--with-stream) ist eine Konto-, keine
   Symbolfaehigkeit; sie wird deshalb nur einmal (am ersten Titel) geprueft,
   um nicht fuenfmal ~45 Sekunden zu warten. Das steht im Bericht, nicht nur
   im Code.

   Ausfuehren (nur mit Zugang):
     TIINGO_API_KEY=... node scripts/market/verify-golden-five-capabilities.mjs
   ========================================================================= */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REALTIME_SCRIPT = join(root, "scripts", "market", "verify-tiingo-realtime.mjs");
const REALTIME_OUT = join(root, "quant", "data", "market", "tiingo-realtime-verification.json");
const CAP_DIR = join(root, "quant", "data", "market", "golden-preview", "capabilities");

const GOLDEN_FIVE = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"];

/* Dieselbe Schluessel-/Kurs-Gegenprobe wie in .github/workflows/
   tiingo-verify.yml's Echtzeit-Job, hier als Funktion statt fuenfmal als
   Copy-Paste-YAML-Schritt. Wirft, statt weiterzuschreiben - ein Bericht mit
   Kurs oder Schluessel darf nicht committet werden, egal aus welchem Lauf. */
function assertScrubbed(file) {
  const raw = readFileSync(file, "utf8");
  const key = process.env.TIINGO_API_KEY;
  if (key && key.length >= 8 && raw.includes(key)) {
    throw new Error(file + ": enthaelt den Zugangsschluessel.");
  }
  if (/[?&]token=/i.test(raw)) throw new Error(file + ": enthaelt eine Anfrage-URL mit Token.");
  const report = JSON.parse(raw);
  const verboten = ["price", "last", "close", "open", "high", "low", "bid", "ask"];
  const treffer = [];
  (function walk(v, p) {
    if (!v || typeof v !== "object") return;
    Object.keys(v).forEach((k) => {
      if (verboten.indexOf(k.toLowerCase()) !== -1) treffer.push(p + "." + k);
      walk(v[k], p + "." + k);
    });
  })(report, "$");
  if (treffer.length) throw new Error(file + ": Kursfelder gefunden: " + treffer.join(", "));
}

mkdirSync(CAP_DIR, { recursive: true });

const perTicker = {};
for (let i = 0; i < GOLDEN_FIVE.length; i++) {
  const ticker = GOLDEN_FIVE[i];
  const withStream = i === 0; // Konto-, nicht Symbolfaehigkeit - siehe Kopf-Kommentar
  console.log("\n=== " + ticker + (withStream ? " (inkl. WebSocket-Verbindungsaufbau)" : "") + " ===");
  const args = [REALTIME_SCRIPT, "--json"];
  if (withStream) args.push("--with-stream");
  try {
    execFileSync(process.execPath, args, {
      cwd: root,
      env: Object.assign({}, process.env, { VU_VERIFY_SYMBOL: ticker }),
      stdio: "inherit"
    });
  } catch (err) {
    console.error("Lauf fuer " + ticker + " beendete sich mit Fehler: " + err.message);
  }

  if (existsSync(REALTIME_OUT)) {
    const dest = join(CAP_DIR, ticker + ".json");
    copyFileSync(REALTIME_OUT, dest);
    assertScrubbed(dest);
    const report = JSON.parse(readFileSync(dest, "utf8"));
    perTicker[ticker] = {
      symbol: report.symbol || ticker,
      generatedAt: report.generatedAt || new Date().toISOString(),
      webSocketTested: withStream,
      confirmedCapabilities: report.confirmedCapabilities,
      refutedCapabilities: report.refutedCapabilities,
      unknownCapabilities: report.unknownCapabilities,
      findings: report.findings
    };
    /* REALTIME_OUT ist der geteilte, globale Pfad, den verify-tiingo-
       realtime.mjs fuer JEDES Konto schreibt (tiingo-verify.yml's eigener
       realtime-Job liest ihn absichtlich nur als Artefakt, committet ihn
       nie - siehe dessen Kopf-Kommentar "Er veroeffentlicht nichts").
       Stehen liesse ihn hier wuerde das Ergebnis EINES Titels (zuletzt
       XOM) so aussehen, als sei es eine Kontoaussage, und Tiingo.
       freePlanCapabilities() (ohne Report-Override) wuerde sie global
       fuer die gesamte Anwendung uebernehmen - nicht nur fuer die Golden
       Five. Nach dem Kopieren in die eigene, titelbezogene Datei wird er
       deshalb wieder entfernt. */
    unlinkSync(REALTIME_OUT);
  } else {
    perTicker[ticker] = { symbol: ticker, webSocketTested: withStream, findings: null,
      note: "Kein Bericht erzeugt (siehe Konsolenausgabe oben)." };
  }
}

const summary = {
  generatedAtUtc: new Date().toISOString(),
  note: "Kapazitaetsmessung fuer die Golden-Five-Titel gegen den bestehenden Tiingo-Zugang. Enthaelt " +
        "ausschliesslich Abstaende in Sekunden, Anzahlen und Aussagen - keine Kurse, kein Schluessel " +
        "(uebernommen von verify-tiingo-realtime.mjs). WebSocket-Verbindungsaufbau wurde nur fuer den " +
        "ersten Titel geprueft (Konto-, nicht Symbolfaehigkeit).",
  source: "scripts/market/verify-tiingo-realtime.mjs, einmal je Titel",
  tickers: GOLDEN_FIVE,
  perTicker
};
const summaryFile = join(CAP_DIR, "summary.json");
writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + "\n");
assertScrubbed(summaryFile);
console.log("\nZusammenfassung: " + summaryFile.replace(root + "/", ""));

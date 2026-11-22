/* Core · Boersenregister (core/exchanges.js, Steuerung 21.11.2026): eine Quelle fuer US-Handelsplaetze.
   EX-1  die Leser der Stamm-, Eignungs-, Company-Master- und Frische-Kette lesen ihre Sicht aus dem Register
   EX-2  keine neue Boersentabelle ausserhalb des Registers (bestehende Ausnahmen sind benannt und begruendet)
   EX-3  die Browser-Lader laden das Register vor den Engines
   EX-4  Register in sich stimmig (jede Familie hat eine SEC-Schreibweise, regulaere Plaetze haben einen MIC) */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const E = require("../exchanges.js");

test("EX-1 · Stamm, Company Master, Klassifikation und Frische lesen aus dem Register", async () => {
  const SM = require("../../quant/engines/us-security-master.js");
  const CM = require("../../quant/engines/company-master.js");
  const IC = require("../../quant/engines/instrument-classification.js");
  const FR = require("../../quant/engines/technical/ti/data-freshness.js");
  assert.deepEqual({ ...SM.US_PRIMARY_EXCHANGES }, { ...E.regularTable() });
  assert.deepEqual({ ...CM.PRIMARY_EXCHANGES }, { ...E.micTable() });
  assert.deepEqual({ ...IC.US_EXCHANGES }, { ...E.countryTable() });
  assert.deepEqual({ ...IC.OTC_EXCHANGES }, { ...E.otcTable() });
  for (const code of Object.keys(E.VENUES)) assert.equal(FR.calendarFor(code), E.isRegular(code) ? "US_EQUITY" : "WEEKDAYS", code);
  /* Skript-Leser (Expansion, Freigabeliste): Familien aus dem Register, keine eigene Tabelle */
  for (const f of ["scripts/market/expand-us-universe.mjs", "scripts/market/build-security-master-approval-list.mjs"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.match(src, /core\/exchanges\.js/, f);
  }
  const { autoRejectReason } = await import("../../scripts/market/expand-us-universe.mjs");
  const sec = new Map([["ABC", { exchange: "TXSE", cik: 1 }]]);
  assert.equal(autoRejectReason({ ticker: "ABC", exchange: "TXSE" }, sec, null), null, "TXSE: Anbieter und SEC dieselbe Familie");
  const { secCheck } = await import("../../scripts/market/build-security-master-approval-list.mjs");
  assert.equal(secCheck({ exchange: "TXSE", active_status: "ACTIVE", instrument_type: "EQUITY_COMMON" }, "ABC", sec).status, "CONFIRMS");
});

/* Bestehende Tabellen ausserhalb des Registers, je mit Grund. Eine NEUE Datei mit einer Boersentabelle laesst EX-2 rot werden:
   ein neuer Platz ist eine Zeile in core/exchanges.js. */
const FROZEN_RESEARCH = /^scripts\/(quant\/(v[0-9][0-9a-z-]*|research)\/|quant\/run-v[0-9]|research\/|technical\/s4\/|supertrader\/(validation|probe)\/)/;
const ALLOWED = {
  "scripts/market/build-company-names.mjs": "Namensschicht; die Datei fuehrt die SEC-Kontaktangabe, Umstellung durch die Steuerung",
  "scripts/market/apply-exchange-directory.mjs": "Kuerzel des Nasdaq-Trader-Verzeichnisses (N, A, P, Z, V, M), keine Platzliste",
  "scripts/market/tiingo2-refresh.mjs": "Kuerzel des Nasdaq-Trader-Verzeichnisses in Tiingo-Schreibweise (A -> AMEX)",
  "scripts/market/select-gate-universe.mjs": "Auswahl der Gate-Stichproben (GATE_100/500/2000), eingefrorene Methodik",
  "scripts/market/build-validation-sources.mjs": "Beschreibungstext der Fama-French-Faktoren, keine Tabelle",
  "scripts/universe/scale-test.mjs": "synthetischer Skalentest mit erfundenen Plaetzen",
  "quant/engines/research-delisted-series.cjs": "Forschung: delistete Reihen, an die Forschungs-Population gebunden",
  "quant/api/europe-readiness.js": "Europa: US-MICs als Ausschluss (Europa-Bindung darf kein US-Platz sein)",
  "scripts/supertrader/europe-readiness.mjs": "Europa: US-MICs als Ausschluss",
  "scripts/marketstack/europe-analytics-series.mjs": "Europa (Marketstack): US-MICs als Ausschluss",
  "scripts/marketstack/europe-live-actions-review.mjs": "Europa (Marketstack): US-MICs als Ausschluss",
  "scripts/marketstack/europe-live-semantics-review.mjs": "Europa (Marketstack): US-MICs als Ausschluss",
  "scripts/marketstack/europe-quality.mjs": "Europa (Marketstack): US-MICs als Ausschluss",
  "scripts/company_intelligence/distribution.py": "Python (Company Intelligence): Schreibweisen-Abgleich, liest keine UMD-Datei",
  "scripts/company_intelligence/news_sitemap.py": "Python (Company Intelligence): Schreibweisen-Abgleich, liest keine UMD-Datei",
  "workers/vu-ask/src/catalog.mjs": "Ask-Katalog: Beispielwerte fuer ein Feld, keine Entscheidung"
};
const CODES = ["NASDAQ", "NYSE", "AMEX", "BATS", "TXSE", "NYSE ARCA", "NYSE MKT", "NYSE AMERICAN", "IEX", "CBOE", "OTCMKTS", "PINK", "ARCX", "XNAS", "XNYS"];
const HIT = new RegExp("[\"']?(" + CODES.join("|") + ")[\"']?\\s*[:,\\]})]", "g");
const ROOTS = ["scripts", "core", "quant/engines", "quant/api", "quant/app", "discover", "technical", "screener", "supertrader", "workers", "products", "assets", "server"];

function tables() {
  const out = new Map();
  const walk = (d) => {
    let es; try { es = readdirSync(d); } catch { return; }
    for (const e of es) {
      const p = join(d, e), rel = relative(ROOT, p);
      if (/(^|\/)(node_modules|data|fixtures|tests|\.git)(\/|$)/.test(rel)) continue;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(m?js|cjs|py)$/.test(e)) continue;
      readFileSync(p, "utf8").split("\n").forEach((l, i) => {
        if (new Set([...l.matchAll(HIT)].map((m) => m[1])).size >= 3) out.set(rel, (out.get(rel) || []).concat(i + 1));
      });
    }
  };
  ROOTS.forEach((r) => walk(join(ROOT, r)));
  return out;
}

test("EX-2 · keine neue Boersentabelle ausserhalb von core/exchanges.js", () => {
  const found = tables();
  const neu = [...found.keys()].filter((f) => f !== "core/exchanges.js" && !ALLOWED[f] && !FROZEN_RESEARCH.test(f));
  assert.deepEqual(neu, [], "Boersentabelle ausserhalb des Registers (Platz in core/exchanges.js eintragen): " + neu.map((f) => f + ":" + found.get(f).join(",")).join("; "));
  for (const f of ["quant/engines/us-security-master.js", "quant/engines/company-master.js", "quant/engines/instrument-classification.js",
                   "quant/engines/technical/ti/data-freshness.js", "scripts/market/expand-us-universe.mjs", "scripts/market/build-security-master-approval-list.mjs"])
    assert.ok(!found.has(f), "umgestellter Leser fuehrt wieder eine eigene Tabelle: " + f);
  const stale = Object.keys(ALLOWED).filter((f) => !found.has(f));
  assert.deepEqual(stale, [], "Ausnahme ohne Tabelle (aus ALLOWED streichen)");
});

test("EX-3 · Browser-Lader laden das Register vor der Klassifikation", () => {
  for (const f of ["quant/index.html", "discover/index.html", "technical/app.js"]) {
    const s = readFileSync(join(ROOT, f), "utf8"), a = s.indexOf("/core/exchanges.js"), b = s.indexOf("/quant/engines/instrument-classification.js");
    assert.ok(a > 0 && b > a, f);
  }
});

test("EX-4 · Register in sich stimmig", () => {
  for (const [code, v] of Object.entries(E.VENUES)) {
    assert.equal(code, code.toUpperCase().trim(), code);
    assert.ok(E.FAMILIES[v.family], code + ": Familie " + v.family);
    assert.equal(v.otc, !v.regular, code);
    if (v.regular) assert.match(v.mic, /^[A-Z]{4}$/, code + ": regulaerer Platz ohne MIC");
    else assert.equal(v.mic, null, code);
  }
  assert.ok(E.sameVenue("AMEX", "NYSE MKT") && E.sameVenue("nyse american", "AMEX") && !E.sameVenue("NYSE", "NYSE AMERICAN") && !E.sameVenue("NYSE", "NYSE ARCA"));
  assert.ok(E.isRegular("TXSE") && E.isOtc("PINK") && !E.isRegular("LSE") && E.venue("LSE") === null);
});

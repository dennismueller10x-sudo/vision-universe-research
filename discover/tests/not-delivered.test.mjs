/* Produkttitel ohne Discover-Karte nach Grund (scripts/discover/not-delivered.mjs) und die Zahlen im Meta. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ohneKarte } from "../../scripts/discover/not-delivered.mjs";

test("Gruende: Instrument, Identitaet, gesperrter Faktorlauf, fehlende Reihe, geliefert zaehlt nicht", () => {
  const securities = [
    { ticker: "AAA" }, { ticker: "BBB-P-A", consumer: false, instrumentType: "PREFERRED" }, { ticker: "CCC", identityStatus: "IDENTITY_QUARANTINED" },
    { ticker: "APD" }, { ticker: "OLD" }, { ticker: "NOS" }, { ticker: "NEU" }, { ticker: "ZZW", consumer: false, instrumentType: "WARRANT" }
  ];
  const r = ohneKarte({ securities, delivered: new Set(["AAA"]), factorTickers: new Set(["AAA"]),
    skipped: [{ ticker: "APD", reason: "FAIL", message: "unexplained_adjustment_step" }, { ticker: "OLD", reason: "FAIL", message: "stale_last_bar" },
              { ticker: "NOS", reason: "SOURCE_MISSING", message: "Keine Kursreihe in der Arbeitsablage." }] });
  assert.equal(r.total, 7);
  assert.deepEqual(r.byReason, { IDENTITY_QUARANTINED: 1, INSTRUMENT_PREFERRED: 1, INSTRUMENT_WARRANT: 1,
    "KEINE_FAKTORZEILE:SOURCE_MISSING": 1, "KEINE_FAKTORZEILE:NICHT_BERECHNET": 1, "KEINE_FAKTORZEILE:stale_last_bar": 1, "KEINE_FAKTORZEILE:unexplained_adjustment_step": 1 });
  assert.deepEqual(r.tickers["KEINE_FAKTORZEILE:unexplained_adjustment_step"], ["APD"]);
  assert.ok(!Object.keys(r.tickers).some((k) => k.startsWith("INSTRUMENT_")), "keine Tickerlisten fuer Instrumentzeilen");
});

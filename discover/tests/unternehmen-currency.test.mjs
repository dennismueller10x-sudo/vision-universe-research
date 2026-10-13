/* =========================================================================
   KEIN KGV AUS DOLLARKURS UND GEWINN IN FREMDWAEHRUNG.

   Der Befund vom 13.10.2026 (Master-Audit): Unternehmen.ausConsumerBundle
   teilte den US-Dollar-Kurs durch den Gewinn je Aktie in der
   Berichtswaehrung. 207 Titel mit Berichten in EUR, BRL, CLP ... trugen ein
   KGV mit Status CALCULATED - ASML 70,83, ABEV 3,27, AKO-A 0,08 -, und die
   Einordnung "Bewertung" der Discover-Aktie rechnete damit. Die Bewertung
   des Builds (shareBasis) hielt dieselben Titel laengst zurueck
   (NON_USD_REPORTING). Dieselbe Rechnung steckte in der Dividendenrendite.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const U = require("../engines/unternehmen.js");
const E = require("../engines/einordnung.js");

/* Ein Geschaeftsjahr, Werte in der Waehrung `cur`. */
function modell(cur) {
  const row = (v) => [{ fy: 2025, v, end: "2025-12-31" }];
  return {
    years: [2025], asOf: "2026-10-05", ttm: {}, quarterly: {},
    annual: { revenue: row(32e9), net_income: row(9.6e9), eps_diluted: row(24.5),
              shares_outstanding: row(3.9e8), dividends_paid: row(-2.5e9) },
    units: { revenue: cur, net_income: cur, eps_diluted: cur + "/shares", shares_outstanding: "shares", dividends_paid: cur }
  };
}

test("Berichtswaehrung EUR: kein KGV, keine Dividendenrendite, der Grund steht dran", () => {
  const g = U.ausConsumerBundle(modell("EUR"), { preis: 1735.2, preisStatus: "CALCULATED" });
  assert.equal(g.status, "CALCULATED", "Umsatz und Gewinn bleiben - nur die Verhaeltnisse fallen weg");
  assert.equal(g.berichtswaehrung, "EUR");
  assert.equal(g.kgv, null);
  assert.equal(g.kgvStatus, "NON_USD_REPORTING");
  assert.equal(g.dividendenRendite, null);
  assert.equal(g.dividendenRenditeStatus, "NON_USD_REPORTING");
  assert.equal(g.umsatzTTM, 32000);
  assert.equal(g.marge, 0.3, "eine Marge ist waehrungsfrei und bleibt");
});

test("Berichtswaehrung USD: KGV und Dividendenrendite wie bisher", () => {
  const g = U.ausConsumerBundle(modell("USD"), { preis: 245, preisStatus: "CALCULATED" });
  assert.equal("berichtswaehrung" in g, false, "US-Titel bleiben unveraendert");
  assert.equal(g.kgvStatus, "CALCULATED");
  assert.equal(g.kgv, 10);
  assert.equal(g.dividendenRenditeStatus, "CALCULATED");
  assert.equal(g.dividendenRendite, Math.round(2.5e9 / (245 * 3.9e8) * 1e4) / 1e4);
});

test("uneinheitliche Einheiten: jede Abweichung von USD haelt das KGV zurueck", () => {
  /* SBS, VIPS, KB: EPS als "USD/shares" getaggt, Gewinn in BRL, CNY, KRW. */
  const sbs = modell("BRL"); sbs.units.eps_diluted = "USD/shares";
  const a = U.ausConsumerBundle(sbs, { preis: 25, preisStatus: "CALCULATED" });
  assert.equal(a.kgvStatus, "NON_USD_REPORTING");
  assert.equal(a.berichtswaehrung, "BRL");
  /* VRNS: EPS als "AFN/shares" getaggt, Gewinn und Umsatz in USD. ELE: EPS in CAD. */
  const vrns = modell("USD"); vrns.units.eps_diluted = "AFN/shares";
  const b = U.ausConsumerBundle(vrns, { preis: 25, preisStatus: "CALCULATED" });
  assert.equal(b.kgvStatus, "NON_USD_REPORTING");
  assert.equal("berichtswaehrung" in b, false, "die Seite behauptet keine Berichtswaehrung AFN");
  const zeile = E.ueberblick({ metrics: {}, geschaeftszahlen: b }).zeilen.filter((z) => z.id === "bewertung")[0];
  assert.match(zeile.fehlt, /uneinheitlich/);
  assert.equal(/AFN/.test(zeile.fehlt), false);
});

test("ohne Kurs bleibt der bisherige Grund", () => {
  assert.equal(U.ausConsumerBundle(modell("EUR"), { preisStatus: "WITHHELD_REDISTRIBUTION" }).kgvStatus, "WITHHELD_REDISTRIBUTION");
  assert.equal(U.ausConsumerBundle(modell("USD"), {}).kgvStatus, "SOURCE_MISSING");
});

test("die Berichtswaehrung kommt aus dem Bundle, nicht aus einer Annahme", () => {
  assert.equal(U.berichtswaehrung(modell("BRL")), "BRL");
  assert.equal(U.berichtswaehrung({ units: { eps_diluted: "AFN/shares", net_income: "USD" } }), "USD");
  assert.equal(U.berichtswaehrung({ units: { revenue: "EUR" } }), "EUR");
  assert.equal(U.berichtswaehrung({ units: {} }), null);
});

test("die Einordnung sagt, warum keine Bewertung steht - nicht 'keine Gewinnzahlen'", () => {
  const g = U.ausConsumerBundle(modell("EUR"), { preis: 1735.2, preisStatus: "CALCULATED" });
  const zeile = E.ueberblick({ metrics: {}, geschaeftszahlen: g }).zeilen.filter((z) => z.id === "bewertung")[0];
  assert.equal(zeile.wert, null);
  assert.match(zeile.fehlt, /in EUR/);
  assert.equal(/keine Gewinnzahlen/.test(zeile.fehlt), false);
});

test("ausgelieferte Discover-Daten: kein KGV aus einer Fremdwaehrung", () => {
  /* Datenebene: der eingecheckte Stand, den der Erzeuger mit dieser Engine
     gebaut hat. Fehlt der Baum (Teil-Checkout), gibt es nichts zu pruefen. */
  const dir = new URL("../data/stocks/US_REAL/", import.meta.url);
  if (!existsSync(dir)) return;
  const falsch = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const d = JSON.parse(readFileSync(new URL(f, dir), "utf8")), g = d.geschaeftszahlen;
    if (!g || g.quelle !== "SEC_CONSUMER") continue;
    const units = (d.fundamentals && d.fundamentals.units) || {};
    const fremd = [units.eps_diluted, units.net_income, units.revenue].map((e) => e ? String(e).split("/")[0] : "USD").filter((w) => w !== "USD");
    if (fremd.length && (g.kgvStatus === "CALCULATED" || g.dividendenRenditeStatus === "CALCULATED")) falsch.push(f + " " + fremd.join("/"));
  }
  assert.deepEqual(falsch.slice(0, 10), [], falsch.length + " Titel mit Verhaeltnis aus Fremdwaehrung");
});

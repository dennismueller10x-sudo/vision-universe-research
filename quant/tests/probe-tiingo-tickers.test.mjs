// Tiingo-Abruf fuer Tickerwechsel und Anbieterluecken (scripts/market/probe-tiingo-tickers.mjs): Eingabe streng,
// Ausgabe nur Metadaten und Zaehlungen - kein Kurs im Bericht. Ohne Netz.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTickers, summarize, MAX_TICKERS } from "../../scripts/market/probe-tiingo-tickers.mjs";

test("Tickerliste: Komma oder Leerzeichen, gross, eindeutig; ungueltig, leer oder zu lang bricht ab", () => {
  assert.deepEqual(parseTickers("txcp, TCBI  tcbi"), ["TXCP", "TCBI"]);
  assert.deepEqual(parseTickers("BRK.B,MAA-P-I"), ["BRK.B", "MAA-P-I"]);
  assert.throws(() => parseTickers(""), /KEINE_TICKER/);
  assert.throws(() => parseTickers("TXCP;rm -rf"), /UNGUELTIGE_TICKER/);
  assert.throws(() => parseTickers(Array.from({ length: MAX_TICKERS + 1 }, (_, i) => "T" + i).join(",")), /ZU_VIELE_TICKER/);
});

test("Bericht: Metadaten und Zaehlungen, nie ein Kurs", () => {
  const meta = { status: 200, body: { name: "Texas Capital Bancshares", exchangeCode: "TXSE", startDate: "2026-11-09", endDate: "2026-11-16", ticker: "txcp" } };
  const prices = { status: 200, body: [{ date: "2026-11-10T00:00:00.000Z", close: 101.5, adjClose: 101.5 }, { date: "2026-11-09T00:00:00.000Z", close: 100 }] };
  const s = summarize("TXCP", meta, prices);
  assert.deepEqual(s, { ticker: "TXCP", known: true, metaStatus: 200, pricesStatus: 200, name: "Texas Capital Bancshares", exchange: "TXSE",
    startDate: "2026-11-09", endDate: "2026-11-16", bars: 2, firstSession: "2026-11-09", lastSession: "2026-11-10" });
  assert.equal(JSON.stringify(s).includes("101.5"), false);
  const unbekannt = summarize("TCBI", { status: 404, body: { detail: "Not found." } }, { status: 404, body: null });
  assert.equal(unbekannt.known, false);
  assert.equal(unbekannt.bars, 0);
  assert.equal(unbekannt.lastSession, null);
});

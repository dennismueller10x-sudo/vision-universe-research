// Elliott-Neustart Schritt 6 (22.11.2026): Wochenausblick-Karten aus dem Chartbild-Produkt (keine Rechnung, keine Veroeffentlichung).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readingOf, cardSvg, captionOf, wrap, priceDe } from "../../scripts/technical/elliott-outlook/build-cards.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const p = {
  symbol: "SPY", asOf: "2026-11-20", price: { close: 689.81 }, market: { name: "S&P 500", via: "SPDR S&P 500 ETF (SPY)", source: { attribution: "Daten: Tiingo" } },
  pro: { elliott: { clarityLevel: "HIGH", applicability: { abstain: true, level: "LOW" }, primary: { pattern: "FLAT", complete: false, currentWave: { label: "C", direction: "DOWN" } } } },
  scenarios: [{ kind: "PRIMARY", direction: "BULLISH" }],
  chart: { timestamps: ["2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20"], close: [700, 720, 705, 689.81] },
  overlays: { waves: { primary: [{ label: "A", time: "2026-10-30", price: 700 }, { label: "B", time: "2026-11-06", price: 720 }, { label: "C", time: "2026-11-20", price: 689.81 }] },
    zones: [{ scenario: "PRIMARY", kind: "ENTRY", low: 670, high: 680 }, { scenario: "PRIMARY", kind: "TARGET", order: 1, low: 760, high: 770 }],
    invalidations: [{ scenario: "PRIMARY", price: 634, direction: "below" }], projectedPaths: [{ scenario: "PRIMARY", points: [{ price: 689.81 }, { price: 675 }, { price: 765 }] }] }
};

test("EA-1 · Hook folgt dem Plan: laufende Welle gegen den Plan heißt „danach aufwärts?“", () => {
  const r = readingOf(p);
  assert.equal(r.hook, "S&P 500: Welle C läuft – danach aufwärts?");
  assert.equal(r.grade, "D");
  assert.equal(r.invTxt, "ungültig bei Wochenschluss unter 634,00 $");
  assert.equal(priceDe(84510), "84.510 $");
  assert.deepEqual(wrap("eins zwei drei vier", 9), ["eins zwei", "drei vier"]);
});

test("EA-2 · Karte und Bildtext: keine Kursziele, Zone laut Methode, Modell-Hinweis, Quelle im Bildtext", () => {
  const r = readingOf(p), svg = cardSvg(p, r), cap = captionOf(p, r);
  assert.match(svg, /^<svg /);
  assert.match(svg, /Zone laut Methode/);
  assert.match(svg, /Modell, keine Prognose/);
  assert.doesNotMatch(svg + cap, /Kursziel|Zielzone|Ziel 1|Kaufzone|Empfehlung für|Rendite/i, "Wortwahl (docs/legal/WORTWAHL.md)");
  assert.doesNotMatch(svg, /760|770/, "TARGET-Zonen erscheinen nicht als Zahl");
  assert.match(cap, /Modell, keine Prognose, keine Anlageberatung\. Quelle: SPDR S&P 500 ETF \(SPY\) · Tiingo, Wochenschluss 20\.11\.2026\./);
  assert.ok(cap.length <= 2200);
  const js = readFileSync(join(ROOT, "scripts/technical/elliott-outlook/build-cards.mjs"), "utf8");
  assert.doesNotMatch(js, /fetch\(|api\.heygen|graph\.facebook|instagram/i, "kein Anbieteraufruf, keine Veröffentlichung");
});

/* DQ-PX-5 (Aktienseite = letzter Schlusskurs der Reihe) war am 12.10.2026
   rot: GROM schliesst bei 0,000001 $, die Reihe veroeffentlicht das ueber
   PublishedClose.roundClose, die Aktienseite rundete selbst auf vier
   Nachkommastellen und zeigte 0. Eine Preiswahrheit (ADR-002): die Seite
   uebernimmt die Rundung der Reihe. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PublishedClose = require(join(root, "quant", "engines", "published-close.js"));
const GROM = join(root, "discover", "data", "stocks", "US_REAL", "GROM.json");

test("der Build rundet den Seitenkurs ueber PublishedClose.roundClose, nicht auf feste Nachkommastellen", () => {
  const src = readFileSync(join(root, "scripts", "discover", "build-discover-data.mjs"), "utf8");
  const i = src.indexOf("price: kursCloses");
  assert.ok(i > 0, "Kursfeld im Build nicht gefunden");
  const zeile = src.slice(i, src.indexOf("changePercent:", i));
  assert.ok(zeile.includes("PublishedClose.roundClose("), "Seitenkurs ohne die Rundung der Reihe");
  assert.ok(!/round\(kursCloses/.test(zeile), "Seitenkurs rundet wieder selbst");
});

test("ein positiver Sub-Cent-Kurs bleibt in der Rundung positiv und bitgleich (GROM 0,000001)", () => {
  assert.equal(PublishedClose.roundClose(0.000001), 0.000001);
  assert.equal(PublishedClose.roundClose(0.00004), 0.00004);
});

test("GROM: Aktienseite zeigt den letzten Schluss der Reihe, nicht 0", { skip: !existsSync(GROM) }, () => {
  const seite = JSON.parse(readFileSync(GROM, "utf8"));
  const reihe = JSON.parse(readFileSync(join(root, "quant", "data", "market", "discover-series", "ref_GROM.json"), "utf8"));
  const letzter = reihe.points[reihe.points.length - 1][1];
  assert.ok(letzter > 0);
  assert.equal(seite.price.value, letzter);
});

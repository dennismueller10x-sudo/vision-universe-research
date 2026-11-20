/* Neu an der Boerse: nur Quartale, kein Geschaeftsjahr, keine zwoelf Monate (Steuerung 18.11.2026, SpaceX/SPCX).
   Das juengste Quartal wird als Quartal gezeigt - nie als Zwoelfmonatswert, nie mit einem KGV. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const U = require("../engines/unternehmen.js");

const q = (fy, fp, end, v) => ({ fy, fp, end, v });
function modell(extra) {
  return Object.assign({
    years: [], asOf: "2026-11-16", ttm: {}, annual: {},
    quarterly: {
      revenue: [q(2025, "Q2", "2025-06-30", 4071e6), q(2025, "Q3", "2025-09-30", 5576e6), q(2026, "Q2", "2026-06-30", 7814e6), q(2026, "Q3", "2026-09-30", 14575e6)],
      net_income: [q(2025, "Q2", "2025-06-30", -1008e6), q(2025, "Q3", "2025-09-30", -1054e6), q(2026, "Q2", "2026-06-30", -541e6), q(2026, "Q3", "2026-09-30", 4404e6)]
    },
    units: { revenue: "USD", net_income: "USD" }
  }, extra || {});
}

test("nur Quartale: Status QUARTER_ONLY, Quartal beschriftet, kein TTM, kein KGV", () => {
  const g = U.ausConsumerBundle(modell(), { preis: 141.7, preisStatus: "CALCULATED" });
  assert.equal(g.status, "QUARTER_ONLY");
  assert.deepEqual(g.quartal, { fy: 2026, fp: "Q3", end: "2026-09-30" });
  assert.equal(g.umsatzQuartal, 14575);
  assert.equal(g.gewinnQuartal, 4404);
  assert.equal(g.umsatzTTM, null);
  assert.equal(g.gewinnTTM, null);
  assert.equal(g.kgv, null);
  assert.equal(g.kgvStatus, "SOURCE_MISSING");
  assert.ok(Math.abs(g.umsatzWachstumQuartal - (14575 / 5576 - 1)) < 1e-3, "Vorjahresquartal verglichen");
  assert.equal(g.gewinnWachstumQuartal, null, "Verlust im Vorjahresquartal: keine Wachstumsrate");
});

test("ohne Vorjahresquartal: Quartal ja, Wachstum null", () => {
  const m = modell(); m.quarterly.revenue = m.quarterly.revenue.slice(2);
  const g = U.ausConsumerBundle(m, {});
  assert.equal(g.status, "QUARTER_ONLY");
  assert.equal(g.umsatzWachstumQuartal, null);
});

test("ohne Quartale und Jahre: SOURCE_MISSING wie bisher", () => {
  const g = U.ausConsumerBundle({ years: [], quarterly: {}, ttm: {}, annual: {} }, {});
  assert.equal(g.status, "SOURCE_MISSING");
});

test("Quartal ohne passendes Ergebnis: SOURCE_MISSING, nichts erfunden", () => {
  const m = modell(); m.quarterly.net_income = [];
  assert.equal(U.ausConsumerBundle(m, {}).status, "SOURCE_MISSING");
});

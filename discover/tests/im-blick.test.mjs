/* =========================================================================
   IM BLICK (discover/engines/im-blick.js)

   IB1  Ein frisches Ereignis schlaegt Dauerstaerke ohne Ereignis
   IB2  Wer jeden Tag ein neues Schlusshoch macht, bleibt (kein Abzug)
   IB3  Ohne neues Ereignis: Abzug je Sitzung seit dem letzten Ereignis,
        gedeckelt - keine Sperre
   IB4  Tagesbewegung und Volumen zaehlen nur aufwaerts und im Trend
   IB5  Keine Auffuellung unter der Mindestschwelle; zwei je Sektor
   IB6  Vielfalt der Signalprofile ohne Pflichtkategorie
   IB7  Fonds, SPACs, nicht darstellbare und nicht qualifizierte Titel sind
        nicht zulaessig
   IB8  Schlusshoch: nur Daten bis asOf, Mindesthistorie
   IB9  Ereignisalter aus der Tagesreihe bis asOf (kein Look-ahead,
        zustandslos)
   IB10 Gruende widersprechen ihrer Zahl nicht; deterministisch
   IB11 Die Methodik ist die Quelle der Gewichte
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ImBlick = require("../engines/im-blick.js");
const METHODOLOGY = JSON.parse(readFileSync(new URL("../methodology/discover-v1.json", import.meta.url), "utf8"));
const CFG = METHODOLOGY.imBlick;

function titel(symbol, o = {}) {
  return {
    symbol, sector: o.sector || "Technology", companyName: o.name === undefined ? symbol + " Corp" : o.name,
    instrumentType: o.type || "EQUITY_COMMON", hasPriceSeries: o.series !== false, recognitionTier: o.tier || null,
    discoveryEligible: o.eligible !== false, qualification: { strongest: o.qualified !== false, avgDollarVolume20d: 5e7 },
    changePercent: { value: (o.r1d === undefined ? 0.005 : o.r1d) * 100 },
    closingHigh52w: o.closeHigh === true, eventAge: o.age === undefined ? (o.closeHigh ? 0 : null) : o.age,
    signals: { new52WeekHigh: o.touched === true || o.closeHigh === true, breakout: o.breakout === true },
    rawValues: { volumeSpikeRatio: o.vol === undefined ? 1 : o.vol, volatility20d: o.vola === undefined ? 0.3 : o.vola,
                 newHigh52w: o.touched === true || o.closeHigh === true,
                 priceAboveSMA50: o.trend !== false, priceAboveSMA200: o.trend !== false },
    metrics: { relativeStrength1M: o.rs1m === undefined ? 0 : o.rs1m, momentumAcceleration: o.accel === undefined ? 0 : o.accel,
               leadershipPercentile: o.lead === undefined ? 50 : o.lead }
  };
}
/* Ein Universum mit genug Breite, damit das RS-Perzentil Sinn ergibt. */
function universum(extra) {
  const basis = [];
  for (let i = 0; i < 100; i++) basis.push(titel("B" + i, { sector: "S" + (i % 7), rs1m: -0.1 + i * 0.002, lead: i, r1d: 0, qualified: false }));
  return basis.concat(extra);
}
const rate = (stocks, opts = {}) => ImBlick.rate(stocks, Object.assign({ config: CFG }, opts));
const auswahl = (rated) => ImBlick.select([...rated.values()].filter((e) => e.admissible), { config: CFG }).map((e) => e.inputs.symbol);

test("IB1 · Ein frisches Ereignis schlaegt Dauerstaerke ohne Ereignis", () => {
  const r = rate(universum([
    titel("DAUER", { lead: 100, rs1m: 0.05, r1d: -0.02 }),
    titel("HOCH", { lead: 70, closeHigh: true, vol: 2.4, r1d: 0.03, rs1m: 0.08, sector: "Health Care" })
  ]));
  assert.ok(r.get("HOCH").result.score > r.get("DAUER").result.score);
  assert.ok(r.get("HOCH").result.freshEvent);
  assert.equal(r.get("DAUER").result.freshEvent, false);
  assert.equal(r.get("HOCH").result.profile, "highs");
  /* Leadership traegt hoechstens 30 Punkte. */
  assert.ok(r.get("DAUER").result.score <= 30 + 10 + 2 + 1e-9);
});

test("IB2 · Wer jeden Tag ein neues Schlusshoch macht, bleibt - kein Abzug, keine Hoechstdauer", () => {
  const r = rate(universum([titel("STAR", { lead: 99, closeHigh: true, vol: 1.8, r1d: 0.012, rs1m: 0.1, age: 0 })]));
  assert.equal(r.get("STAR").result.freshEvent, true);
  assert.equal(r.get("STAR").result.damping, 0);
  assert.ok(auswahl(r).includes("STAR"));
});

test("IB3 · Ohne neues Ereignis: Abzug je Sitzung seit dem letzten Ereignis, gedeckelt - keine Sperre", () => {
  const mk = (age) => rate(universum([titel("ALT", { lead: 100, touched: true, rs1m: 0.12, accel: 0.1, r1d: 0.004, age })])).get("ALT").result;
  const per = CFG.damping.perSession, max = CFG.damping.max;
  const r1 = mk(1), r2 = mk(2), r9 = mk(9), rNie = mk(undefined);
  assert.equal(r1.damping, per);
  assert.equal(r2.damping, 2 * per);
  assert.equal(r9.damping, Math.min(max, 9 * per));
  assert.equal(rNie.damping, max, "kein Ereignis im Fenster = voller Abzug");
  assert.ok(Math.abs((r1.score - r2.score) - per) < 1e-6);
  assert.ok(r9.score > 0, "Abzug ist keine Sperre");
});

test("IB4 · Tagesbewegung und Volumen zaehlen nur aufwaerts und im Trend; Spitzen ueber 3 sigma bringen nichts mehr", () => {
  const r = rate(universum([
    titel("AUF", { r1d: 0.05, vol: 3, vola: 0.3 }),
    titel("AB", { r1d: -0.05, vol: 3, vola: 0.3 }),
    titel("GEGENTREND", { r1d: 0.05, vol: 3, vola: 0.3, trend: false }),
    titel("SPITZE3", { r1d: 0.3 * 3 / Math.sqrt(252), vola: 0.3 }),
    titel("SPITZE9", { r1d: 0.3 * 9 / Math.sqrt(252), vola: 0.3 })
  ]));
  const ids = (s) => r.get(s).result.components.map((c) => c.id);
  assert.ok(ids("AUF").includes("dayMove") && ids("AUF").includes("volume"));
  assert.ok(!ids("AB").includes("dayMove") && !ids("AB").includes("volume"));
  assert.ok(!ids("GEGENTREND").includes("dayMove") && !ids("GEGENTREND").includes("volume"));
  const pts = (s) => (r.get(s).result.components.find((c) => c.id === "dayMove") || {}).points;
  assert.equal(pts("SPITZE3"), pts("SPITZE9"), "gedeckelt bei 3 sigma");
});

test("IB5 · Keine Auffuellung unter der Mindestschwelle; hoechstens zwei je Sektor", () => {
  const schwach = rate(universum([titel("W1", { lead: 60 }), titel("W2", { lead: 70 })]));
  assert.deepEqual(auswahl(schwach), [], "nichts unter " + CFG.minScore);
  const stark = rate(universum([1, 2, 3, 4].map((i) => titel("T" + i, { sector: "Energy", closeHigh: true, breakout: true, vol: 3, r1d: 0.03, lead: 95 }))));
  assert.equal(auswahl(stark).length, 2);
});

test("IB6 · Vielfalt der Signalprofile: bei knappem Abstand kommt ein anderes Profil zum Zug, ein schwacher Kandidat nicht", () => {
  const r = rate(universum([
    titel("H1", { sector: "A", closeHigh: true, r1d: 0.01, lead: 90 }),
    titel("H2", { sector: "B", closeHigh: true, r1d: 0.01, lead: 89 }),
    titel("H3", { sector: "C", closeHigh: true, r1d: 0.01, lead: 88 }),
    titel("BO", { sector: "D", breakout: true, vol: 2.5, r1d: 0.015, lead: 80 })
  ]));
  const sel = auswahl(r);
  assert.ok(sel.indexOf("BO") >= 0 && sel.indexOf("BO") < sel.indexOf("H3"), sel.join(","));
  const profile = new Set(sel.map((s) => r.get(s).result.profile));
  assert.ok(profile.has("highs") && profile.has("breakout"));
});

test("IB7 · Zulaessig sind nur darstellbare, qualifizierte Unternehmen - keine Fonds, SPACs, Trusts", () => {
  const ev = { closeHigh: true, breakout: true, vol: 3, r1d: 0.03, lead: 95 };
  const r = rate(universum([
    titel("ETF1", Object.assign({ name: "GQG US Equity ETF" }, ev)),
    titel("FUND", Object.assign({ name: "Nuveen Municipal Income Fund" }, ev)),
    titel("SPAC1", Object.assign({ type: "SPAC" }, ev)),
    titel("TRU", Object.assign({ type: "TRUST" }, ev)),
    titel("OHNE", Object.assign({ series: false }, ev)),
    titel("NAMENLOS", Object.assign({ name: null }, ev)),
    titel("ILLIQ", Object.assign({ qualified: false }, ev)),
    titel("FIRMA", Object.assign({ name: "Trust Company of America", sector: "Financials" }, ev))
  ]));
  for (const s of ["ETF1", "FUND", "SPAC1", "TRU", "OHNE", "NAMENLOS", "ILLIQ"]) assert.equal(r.get(s).admissible, false, s);
  assert.equal(r.get("FIRMA").admissible, true);
  assert.deepEqual(auswahl(r), ["FIRMA"]);
});

test("IB8 · Schlusshoch: nur Schluesse bis asOf, ueber jedem der vorherigen 251, mindestens 200 vorhanden", () => {
  const pts = []; const d0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 260; i++) pts.push([new Date(d0 + i * 864e5).toISOString().slice(0, 10), 100 + Math.sin(i / 9) * 5]);
  const asOf = pts[259][0];
  pts[259][1] = 106;
  assert.equal(ImBlick.closingHigh(pts, asOf), true);
  /* Ein spaeterer, hoeherer Schluss darf das Urteil von asOf nicht aendern. */
  const mitZukunft = pts.concat([["2099-01-01", 999]]);
  assert.equal(ImBlick.closingHigh(mitZukunft, asOf), true);
  pts[259][1] = 104.9;
  assert.equal(ImBlick.closingHigh(pts, asOf), false);
  assert.equal(ImBlick.closingHigh(pts.slice(-150), asOf), null, "zu wenig Historie");
  assert.equal(ImBlick.closingHigh(pts, "2030-01-01"), null, "kein Schluss an asOf");
});

test("IB9 · Ereignisalter: nur Schluesse bis asOf, Schlusshoch oder Aufwaertstag >= 2 sigma, sonst das Fenster", () => {
  const pts = []; const d0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 260; i++) pts.push([new Date(d0 + i * 864e5).toISOString().slice(0, 10), 100 + (i % 2 ? 0.2 : -0.2)]);
  const tag = (i) => pts[i][0];
  /* Kein Ereignis: Fenster. */
  assert.equal(ImBlick.eventAge(pts, tag(259)), CFG.damping.window);
  /* Schlusshoch vor drei Sitzungen. */
  const mitHoch = pts.map((p) => p.slice()); mitHoch[256][1] = 101;
  assert.equal(ImBlick.eventAge(mitHoch, tag(259)), 3);
  assert.equal(ImBlick.eventAge(mitHoch, tag(256)), 0);
  /* Ein Ereignis NACH asOf zaehlt nicht. */
  assert.equal(ImBlick.eventAge(mitHoch, tag(255)), CFG.damping.window);
  /* Starker Aufwaertstag ohne Hoch (unter dem frueheren Maximum) zaehlt auch. */
  const mitSprung = pts.map((p) => p.slice()); mitSprung[100][1] = 130; mitSprung[258][1] = 103;
  assert.equal(ImBlick.eventAge(mitSprung, tag(259)), 1);
});

test("IB10 · Gruende widersprechen ihrer Zahl nicht; dieselbe Eingabe ergibt dieselbe Auswahl", () => {
  const stocks = universum([
    titel("A", { closeHigh: true, vol: 2.5, r1d: 0.04, lead: 92, sector: "X" }),
    titel("B", { breakout: true, vol: 3.1, r1d: 0.02, lead: 85, sector: "Y" }),
    titel("C", { touched: true, r1d: -0.01, lead: 99, rs1m: 0.2, sector: "Z" })
  ]);
  const a = auswahl(rate(stocks)), b = auswahl(rate(stocks));
  assert.deepEqual(a, b);
  const r = rate(stocks);
  for (const s of a) {
    const e = r.get(s);
    for (const g of ImBlick.reasons(e)) {
      if (g.id === "dayMove") assert.ok(e.inputs.return1D > 0 && /^\+/.test(g.value), s + " " + g.value);
      if (g.id === "volume") assert.ok(e.inputs.return1D >= 0);
      assert.doesNotMatch(g.value, /NaN|undefined/);
    }
    assert.ok(ImBlick.reasons(e).length <= 3);
  }
  assert.ok(!r.get("C").result.components.some((c) => c.id === "dayMove" || c.id === "volume"), "Minustag ohne Bewegungs-/Volumenpunkte");
});

test("IB11 · Die Methodik ist die Quelle der Gewichte (Ereignis vor Fuehrerschaft)", () => {
  assert.ok(CFG.weights.event > CFG.weights.persistent, "Ereignisse muessen staerker zaehlen");
  assert.equal(CFG.weights.event + CFG.weights.persistent, 1);
  const eff = ImBlick.config(CFG);
  for (const k of Object.keys(CFG.points)) assert.equal(eff.points[k], CFG.points[k], k);
  assert.ok(Math.max(...Object.values(eff.recognitionTieBreak)) <= 2, "Bekanntheit nur als Gleichstandsbrecher");
  assert.equal(METHODOLOGY.rows[0].id, "im-blick");
  assert.equal(METHODOLOGY.rows[0].sort, "imBlickScore");
});

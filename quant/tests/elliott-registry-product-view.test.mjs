/* Elliott Registry 1.1 — Kundenprodukt-Sicht und Betriebssicherheit:
   gleiche Elliott-Ausgabe wie das veroeffentlichte Chartbild (Byte-Gleichheit), Sperre bei Abweichung,
   Produkt-Zeitebene (Tagesanalyse fuer Tagestitel), Nachholen fehlender Wochen, Abdeckungs-Sperre, Pruefung. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Reg = await import(join(ROOT, "scripts/technical/elliott-registry/register.mjs"));
const PV = await import(join(ROOT, "scripts/technical/elliott-registry/product-view.mjs"));
const Ver = await import(join(ROOT, "scripts/technical/elliott-registry/verify.mjs"));
const Led = await import(join(ROOT, "scripts/technical/elliott-registry/ledger.mjs"));
const { weeklySeriesFromPoints, readJson } = await import(join(ROOT, "scripts/technical/lib/ti-data.mjs"));
const { analyzeProduct } = await import(join(ROOT, "scripts/technical/lib/ti-product.mjs"));
const Build = await import(join(ROOT, "scripts/technical/build-technical-intelligence.mjs"));
const LONG = join(ROOT, "quant/data/market/discover-series-long");
const PJV = (await import(join(ROOT, "scripts/technical/lib/ti-projection.mjs"))).PROJECTION_VERSION;
const V3 = join(ROOT, "quant/data/technical-intelligence/v3");

/* until: Reihen auf einen festen Datenstand kuerzen, damit Tests mit Wochengrenzen nicht vom Alter der Daten abhaengen */
function weeklyDir(ids, until) {
  const w = mkdtempSync(join(tmpdir(), "pv-w-"));
  for (const id of ids) {
    if (!until) { copyFileSync(join(LONG, id + ".json"), join(w, id + ".json")); continue; }
    const x = readJson(join(LONG, id + ".json"));
    writeFileSync(join(w, id + ".json"), JSON.stringify({ ...x, points: x.points.filter((p) => p[0] <= until) }));
  }
  return w;
}

test("M11-P1 Registry-Produktsicht = veroeffentlichtes Chartbild, Byte fuer Byte (Woche und Tag)", async () => {
  const r = await Reg.checkProductIdentity({ productInputDir: LONG, identitySymbols: ["AA", "AAL", "XOM"], workers: 3 });
  assert.equal(r.ok, true, JSON.stringify(r.differences));
  assert.equal(r.compared, 3); assert.equal(r.identical, 3);
});

test("M11-P2 Produktsicht nutzt die Produktfunktion: gekuerzte Woche = analyzeProduct mit Produkt-Optionen", () => {
  const pub = PV.publishedProduct(), ctx = PV.productContext(pub, null);
  const x = readJson(join(LONG, "ref_AA.json")), F = "2026-09-25";
  const used = x.points.filter((p) => p[0] <= F);
  const mine = PV.productElliottAt("ref_AA", used, "AA", F, ctx, pub);
  const s = weeklySeriesFromPoints(used, "AA"), out = analyzeProduct(s, Build.productOpts("weekly", ctx.C, "AA"));
  assert.equal(mine.tf, "1W"); assert.equal(mine.d, used[used.length - 1][0]);
  assert.equal(mine.view.sha, PV.elliottSha(Build.slim(out.res).pro.elliott));
  assert.equal(mine.view.key, out.res.methods.elliott.primary ? out.res.methods.elliott.primary.persistenceKey : null);
  /* Tagestitel des Produkts werden auf der Tagesreihe analysiert */
  assert.equal(PV.productTimeframe("XOM", ctx, pub).tf, "1D");
  assert.equal(PV.productTimeframe("AA", ctx, pub).tf, "1W");
});

test("M11-P3 Abweichung vom veroeffentlichten Produkt → nichts registriert", async () => {
  const pubDir = mkdtempSync(join(tmpdir(), "pv-pub-")); mkdirSync(join(pubDir, "shards"));
  copyFileSync(join(V3, "meta.json"), join(pubDir, "meta.json")); copyFileSync(join(V3, "index.json.gz"), join(pubDir, "index.json.gz"));
  const sh = JSON.parse(gunzipSync(readFileSync(join(V3, "shards", "AA.json.gz"))).toString());
  sh.instruments.AA.pro.elliott.primary.pattern = "MANIPULIERT";
  writeFileSync(join(pubDir, "shards", "AA.json.gz"), gzipSync(Buffer.from(JSON.stringify(sh))));
  const id = await Reg.checkProductIdentity({ productInputDir: LONG, identitySymbols: ["AA"], workers: 1, publishedDir: pubDir });
  assert.equal(id.ok, false); assert.equal(id.different, 1);
  const w = weeklyDir(["ref_AA"]), reg = mkdtempSync(join(tmpdir(), "pv-r-"));
  await assert.rejects(Reg.register({ weeklyDir: w, registry: reg, week: "2026-09-25", workers: 1, identity: id }), /Produkt-Identitaet nicht bestaetigt/);
  assert.equal(existsSync(join(reg, "ledger.jsonl")), false);
  assert.equal(readdirSync(join(reg, "snapshots")).length, 0);
  /* keine vergleichbaren Titel ist ebenfalls keine Bestaetigung */
  assert.equal(PV.summarizeIdentity([{ s: "X", status: "NO_INPUT" }], PV.publishedProduct(), { workDir: null }).ok, false);
});

test("M11-P4 Produkt-Kohorten, Nachholen fehlender Wochen, Abdeckungs-Sperre, Pruefung", async () => {
  const w = weeklyDir(["ref_AA", "ref_AACG", "ref_ABBV", "ref_ABT", "ref_XOM"], "2026-10-01"), reg = mkdtempSync(join(tmpdir(), "pv-r-"));
  const identity = await Reg.checkProductIdentity({ productInputDir: LONG, identitySymbols: ["AA"], workers: 1 });
  const r1 = await Reg.register({ weeklyDir: w, registry: reg, week: "2026-09-11", workers: 3, identity });
  assert.equal(r1.analysed, 5); assert.equal(r1.productAnalysed, 5);
  /* Nachholen: 18.09. und 25.09. fehlen; 02.10. ist mit diesen Daten (Stand 01.10.) nicht abgedeckt → Abdeckungs-Sperre */
  assert.deepEqual(Reg.pendingWeeks(Led.readLedger(reg), "2026-10-07", 5), ["2026-09-18", "2026-09-25", "2026-10-02"]);
  const r2 = await Reg.register({ weeklyDir: w, registry: reg, asOf: "2026-10-07", maxWeeks: 3, workers: 3, identity });
  assert.deepEqual(r2.catchUp.map((x) => x.week), ["2026-09-18", "2026-09-25"]);
  assert.equal(r2.incomplete, true); assert.equal(r2.failedWeek, "2026-10-02"); assert.match(r2.error, /Abdeckung zu gering/);
  const L = Led.readLedger(reg), runs = L.filter((e) => e.type === "RUN");
  assert.deepEqual(runs.map((e) => e.week), ["2026-09-11", "2026-09-18", "2026-09-25"]);
  assert.deepEqual(runs[0].payload.views, ["STATELESS_ENGINE", "CUSTOMER_PRODUCT"]);
  assert.equal(runs[0].payload.productView.initialStockRun, true); assert.equal(runs[1].payload.productView.initialStockRun, false);
  assert.equal(runs[0].payload.productView.timeframes["1D"], 1);           // XOM: Tagesanalyse wie im Produkt
  assert.ok(runs[1].payload.registrationLagDays > 7);
  const pe = L.filter((e) => e.type === "EVENT" && e.payload.view === "CUSTOMER_PRODUCT");
  for (const e of pe) { assert.match(e.payload.cohort, /^CUSTOMER_PRODUCT_(SETUP|PRIMARY_UNDISPLAYED)$/); assert.equal(e.payload.productElliottSha.length, 32); }
  /* Registry 1.2.0: neue Kundenprodukt-Ereignisse tragen die eingefrorene Projektionsthese (elliott-projection-1.0.0) */
  assert.ok(pe.length > 0, "mindestens ein Produkt-Ereignis");
  for (const e of pe) { assert.equal(e.payload.projectionEngine, PJV); assert.equal(e.payload.projectionThesis.version, PJV); assert.ok("thesis" in e.payload.projectionThesis); }
  assert.equal(runs[0].payload.code.projection, PJV);
  const snap = gunzipSync(readFileSync(join(reg, "snapshots", "2026-09-11.jsonl.gz"))).toString().split("\n").map((l) => JSON.parse(l));
  assert.equal(snap.find((u) => u.s === "ref_XOM").pv.tf, "1D");
  assert.equal(Ver.verifyRegistry(reg).ok, true);
  /* Ein Lauf mit Produktsicht ohne bestaetigte Identitaet faellt in der Pruefung auf */
  const bad = mkdtempSync(join(tmpdir(), "pv-bad-"));
  Led.append(bad, [], [{ type: "RUN", id: "RUN-x", week: "2026-09-11", recordedAt: "t", payload: { views: ["CUSTOMER_PRODUCT"], productView: { identity: { ok: false } }, snapshot: { file: "snapshots/none" } } }]);
  const v = Ver.verifyRegistry(bad); assert.equal(v.ok, false); assert.ok(v.errors.some((e) => /Produkt-Identitaet/.test(e)));
});

test("M11-P5 Registry 1.3.0: angezeigte Motiv-Alternative (Welle 3) wird als eigene Kohorte eingefroren; Forschungskohorte meldet Sichtbarkeit wahrheitsgemäß", async () => {
  const w = weeklyDir(["ref_SE", "ref_VTEX", "ref_BCE", "ref_COLM", "ref_CE", "ref_AA"], "2026-10-01"), reg = mkdtempSync(join(tmpdir(), "pv-m-"));
  const identity = await Reg.checkProductIdentity({ productInputDir: LONG, identitySymbols: ["AA"], workers: 1 });
  await Reg.register({ weeklyDir: w, registry: reg, week: "2026-09-25", workers: 2, identity });
  const L = Led.readLedger(reg), run = L.find((e) => e.type === "RUN");
  assert.equal(run.payload.code.registry, Reg.REGISTRY_VERSION); assert.equal(run.payload.code.projection, PJV);
  const mv = L.filter((e) => e.type === "EVENT" && e.payload.cohort === "CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE");
  assert.ok(mv.length >= 1, "mindestens eine angezeigte Motiv-Alternative registriert");
  assert.ok(!mv.some((e) => e.payload.symbol === "ref_SE"), "SE: Kandidat verletzt die Grad-Konsistenz (G2) → nicht angezeigt, nicht registriert");
  for (const e of mv) {
    const th = e.payload.projectionThesis.thesis;
    assert.equal(e.payload.interpretation, "ALTERNATIVE"); assert.equal(th.source, "MOTIVE_ALTERNATIVE"); assert.equal(th.type, "WAVE_3");
    assert.ok(th.zones.length >= 1 && th.invalidation && th.confirmation); assert.equal(e.payload.projectionEngine, PJV);
    assert.ok(e.payload.persistenceKey !== (e.payload.primaryShownAs || ""), "nie die Primärzählung");
  }
  for (const e of L.filter((x) => x.type === "EVENT" && x.payload.cohort === "RESEARCH_ONLY_INTERNAL_WAVE3")) assert.equal(typeof e.payload.productVisible, "boolean");
  assert.equal(Ver.verifyRegistry(reg).ok, true);
});

test("M11-P6 Registry 1.4.0: angezeigte Explore-Lesarten als eigene Kohorte eingefroren (Rolle, Rang, verfehlte Leitplanken, Zonen, Versionen); Kette bleibt gültig", async () => {
  const w = weeklyDir(["ref_VTEX", "ref_PLTR", "ref_AA"], "2026-10-01"), reg = mkdtempSync(join(tmpdir(), "pv-x-"));
  const identity = await Reg.checkProductIdentity({ productInputDir: LONG, identitySymbols: ["AA"], workers: 1 });
  await Reg.register({ weeklyDir: w, registry: reg, week: "2026-09-25", workers: 2, identity });
  const L = Led.readLedger(reg), run = L.find((e) => e.type === "RUN");
  assert.equal(Reg.REGISTRY_VERSION, "elliott-registry-1.4.0"); assert.equal(run.payload.code.registry, Reg.REGISTRY_VERSION);
  const ex = L.filter((e) => e.type === "EVENT" && e.payload.cohort === "CUSTOMER_PRODUCT_EXPLORE_ELLIOTT");
  assert.ok(ex.length >= 1, "mindestens eine angezeigte Explore-Lesart registriert");
  const perSymbol = {};
  for (const e of ex) {
    const p = e.payload, th = p.projectionThesis.thesis;
    perSymbol[p.symbol] = (perSymbol[p.symbol] || 0) + 1;
    assert.equal(p.role, "EXPLORE"); assert.equal(th.source, "EXPLORE"); assert.equal(p.hardRules, "PASSED");
    assert.ok(Array.isArray(p.failedGates) && p.failedGates.length >= 1 && p.failedGates.every((g) => /^G[2-5]$/.test(g)));
    assert.ok(Number.isInteger(p.rank) && p.poolSize > p.rank && (p.rank + 1) / p.poolSize <= 0.5);
    assert.ok(th.zones.length >= 1 && th.invalidation && th.invalidation.price > 0);
    assert.equal(p.versions.projection, PJV); assert.equal(p.versions.visibility, "EXPLORE_ELLIOTT_1.0.0"); assert.ok(p.versions.engine && p.versions.ruleSet);
    assert.ok(/^CLEAN/.test(p.dataQuality.status)); assert.ok(p.waveType && p.degree);
    assert.equal(p.initialStock, true, "erster Lauf mit Explore = Bestand");
  }
  assert.ok(Object.values(perSymbol).every((n) => n <= 3), "höchstens drei je Titel");
  assert.equal(Ver.verifyRegistry(reg).ok, true);
});

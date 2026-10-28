/* Belegte Split-Ergaenzungen (quant/config/split-evidence-supplements.json), gelesen NUR in
   quant/engines/return-series.js#splitFactors (ADR-002: eine Ableitung). Erster und einziger Eintrag:
   PZZA 2:1 als Aktiendividende, Stichtag 2013-12-12, verteilt 2013-12-27, Ex-Tag 2013-12-30 - der
   splitFactor des Anbieters fuehrt ihn nicht, die Wochenreihe springt 89,95 -> 46,08. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { splitAdjustedCloses } from "../../scripts/market/publish-discover-series.mjs";
import { correctedDoc, dividePublished } from "../../scripts/market/split-supplement-effect.mjs";

const require = createRequire(import.meta.url);
const RS = require("../engines/return-series.js");
const S = require("../engines/split-evidence-supplements.js");
const Identity = require("../../core/identity.js");
const Sampling = require("../engines/series-sampling.js");
const PublishedClose = require("../engines/published-close.js");
const CA = require("../engines/corporate-action-evidence.js");
const Adapter = require("../engines/weekly-real-adapter.cjs");
const ROOT = new URL("../../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("quant/config/split-evidence-supplements.json", ROOT), "utf8"));
const PZZA = config.entries[0];
const ID = Identity.securityIdForTicker("PZZA");

/* Handelstage (Mo-Fr, ohne 25.12. und 1.1.) von a bis b. */
function sessions(a, b) {
  const out = [];
  for (let d = new Date(a + "T00:00:00Z"); d <= new Date(b + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10), w = d.getUTCDay();
    if (w >= 1 && w <= 5 && !s.endsWith("-12-25") && !s.endsWith("-01-01")) out.push(s);
  }
  return out;
}
/* Rohbalken wie beim Anbieter: vor dem Ex-Tag Kurse um 90, ab dem Ex-Tag um 46, splitFactor ueberall 1. */
function pzzaBars(extra = {}) {
  return sessions("2013-11-04", "2014-01-31").map((date, i) => ({
    date, close: date < "2013-12-30" ? 89 + (i % 3) * 0.105 : 45.5 + (i % 3) * 0.095, splitFactor: 1, ...(extra[date] || {})
  }));
}

test("Datei: gueltig, versioniert, nur der PZZA-Eintrag, securityId aus core/identity.js", () => {
  assert.deepEqual(S.validate(config, Identity), { valid: true, errors: [] });
  assert.equal(config.schemaVersion, S.SCHEMA);
  assert.equal(config.entries.length, 1);
  assert.equal(PZZA.securityId, ID);
  assert.equal(PZZA.ratio, 2);
  assert.deepEqual([PZZA.recordDate, PZZA.payableDate, PZZA.exDate], ["2013-12-12", "2013-12-27", "2013-12-30"]);
  assert.ok(PZZA.evidence.some((d) => d.accession === "0001157523-13-005314" && /ex99_1\.htm$/.test(d.url)));
  for (const d of PZZA.evidence) {
    assert.match(d.sha256, /^[0-9a-f]{64}$/);
    assert.ok(d.url.includes("/" + d.accession.replace(/-/g, "") + "/"), "URL gehoert zur Accession");
    assert.match(d.quote, /December 12, 2013/);
    assert.match(d.quote, /December 27, 2013/);
  }
  /* Ex-Tag nach FINRA/UPC 11140(b)(2): erster Geschaeftstag nach dem Zahltag (Fr -> Mo). */
  assert.equal(new Date(PZZA.payableDate + "T00:00:00Z").getUTCDay(), 5);
  assert.equal(new Date(PZZA.exDate + "T00:00:00Z").getUTCDay(), 1);
  assert.match(config.exDateRule.quote, /first business day following the payable date/);
});

test("Schema: unvollstaendige oder falsche Eintraege werden abgewiesen, index() wirft", () => {
  const bad = (patch) => S.validate({ ...config, entries: [{ ...PZZA, ...patch }] }, Identity);
  const ev = (patch) => bad({ evidence: [{ ...PZZA.evidence[0], ...patch }] });
  assert.equal(bad({ ratio: 1 }).valid, false);
  assert.equal(bad({ ratio: 0 }).valid, false);
  assert.equal(bad({ exDate: "2013-12-28" }).valid, false, "Samstag");
  assert.equal(bad({ exDate: "2013-12-27" }).valid, false, "nicht nach dem Zahltag");
  assert.equal(bad({ exDate: "2014-01-06" }).valid, false, "zu weit nach dem Zahltag");
  assert.equal(bad({ securityId: "ref_PZZA_X" }).errors.includes("SECURITY_ID_NOT_FROM_IDENTITY:0"), true);
  assert.equal(bad({ verifiedAt: "2013-12-01" }).valid, false);
  assert.equal(bad({ evidence: [] }).valid, false);
  assert.equal(ev({ accession: "0001157523-13-5314" }).valid, false);
  assert.equal(ev({ sha256: "abc" }).valid, false);
  assert.equal(ev({ quote: "kurz" }).valid, false);
  assert.equal(ev({ url: "https://example.com/a.htm" }).valid, false);
  assert.equal(ev({ url: PZZA.evidence[1].url }).errors.some((e) => e.startsWith("URL_NOT_OF_ACCESSION")), true);
  assert.equal(S.validate({ ...config, entries: [PZZA, { ...PZZA, id: "PZZA-DOPPELT" }] }).valid, false, "dasselbe Ereignis zweimal");
  assert.equal(S.validate({ ...config, schemaVersion: "x" }).valid, false);
  assert.throws(() => S.index({ ...config, entries: [{ ...PZZA, ratio: -2 }] }), /SPLIT_EVIDENCE_SUPPLEMENTS_INVALID/);
});

test("ohne securityId ist splitFactors bitgleich zur Fassung davor (Golden-Reihen und PZZA-Fixture)", () => {
  const vorher = (bars) => { const f = new Array(bars.length); let c = 1; for (let i = bars.length - 1; i >= 0; i--) { f[i] = c; const sf = bars[i].splitFactor; if (Number.isFinite(sf) && sf > 0 && sf !== 1) c *= sf; } return f; };
  const dir = new URL("quant/data/market/golden-preview/daily/", ROOT);
  for (const file of readdirSync(dir)) {
    const bars = JSON.parse(readFileSync(new URL(file, dir), "utf8")).bars;
    assert.deepEqual(RS.splitFactors(bars), vorher(bars), file);
    assert.deepEqual(RS.splitFactors(bars, { securityId: "ref_" + file.replace(/\.json$/, "") }), vorher(bars), "kein Eintrag -> keine Wirkung: " + file);
  }
  assert.deepEqual(RS.splitFactors(pzzaBars()), vorher(pzzaBars()));
  assert.deepEqual(RS.splitFactors(pzzaBars(), { securityId: "ref_MSFT" }), vorher(pzzaBars()), "andere ID: keine Wirkung");
});

test("PZZA: Faktor 2 vor dem Ex-Tag, 1 ab dem Ex-Tag - zusammen mit fruehen Anbieter-Splits", () => {
  const bars = [{ date: "2006-01-13", close: 60, splitFactor: 1 }, { date: "2006-01-17", close: 30, splitFactor: 2 }].concat(pzzaBars());
  const f = RS.splitFactors(bars, { securityId: ID });
  const ex = bars.findIndex((b) => b.date === "2013-12-30");
  assert.equal(f[0], 4, "2006 (2) x 2013 (2)");
  assert.equal(f[1], 2, "ab dem 2006er Ex-Tag nur noch 2013");
  assert.ok(f.slice(2, ex).every((v) => v === 2));
  assert.ok(f.slice(ex).every((v) => v === 1));
  const adj = RS.splitAdjustedColumn(bars, "close", { securityId: ID });
  assert.ok(Math.abs(adj[ex] / adj[ex - 1] - 1) < 0.1, "kein Sprung mehr am Ex-Tag");
  assert.deepEqual(RS.splitAdjusted(bars, { securityId: ID }), adj);
  const items = RS.appliedSupplements(bars, { securityId: ID });
  assert.deepEqual(items.map((x) => [x.id, x.status, x.index, x.accession]), [[PZZA.id, "APPLIED", ex, "0001157523-13-005314"]]);
});

test("Schutz gegen doppelte Bereinigung: Anbieter-Split innerhalb von 5 Sitzungen -> nicht angewandt", () => {
  const s = sessions("2013-11-04", "2014-01-31"), ex = s.indexOf("2013-12-30");
  for (const off of [-5, -1, 0, 1, 5]) {
    const bars = pzzaBars({ [s[ex + off]]: { splitFactor: 2 } });
    assert.deepEqual(RS.appliedSupplements(bars, { securityId: ID }).map((x) => x.reason), ["PROVIDER_SPLIT_NEARBY"], "Abstand " + off);
    assert.deepEqual(RS.splitFactors(bars, { securityId: ID }), RS.splitFactors(bars), "nur der Anbieter wirkt, Abstand " + off);
  }
  for (const off of [-6, 6]) {
    const bars = pzzaBars({ [s[ex + off]]: { splitFactor: 1.05 } });
    assert.equal(RS.appliedSupplements(bars, { securityId: ID })[0].status, "APPLIED", "Abstand " + off);
  }
});

test("Schutz: kein Balken am Ex-Tag oder kein Sprung im Rohschluss -> nicht angewandt", () => {
  const ohne = pzzaBars().filter((b) => b.date !== "2013-12-30");
  assert.equal(RS.appliedSupplements(ohne, { securityId: ID })[0].reason, "NO_BAR_ON_EX_DATE");
  assert.deepEqual(RS.splitFactors(ohne, { securityId: ID }), RS.splitFactors(ohne));
  const spaeter = pzzaBars().filter((b) => b.date >= "2013-12-30");
  assert.equal(RS.appliedSupplements(spaeter, { securityId: ID })[0].reason, "NO_BAR_ON_EX_DATE", "Reihe beginnt am Ex-Tag");
  /* Anbieter hat den Rohschluss schon bereinigt (kein Sprung): eine Ergaenzung wuerde halbieren -> nicht angewandt. */
  const bereinigt = pzzaBars().map((b) => (b.date < "2013-12-30" ? { ...b, close: b.close / 2 } : b));
  assert.equal(RS.appliedSupplements(bereinigt, { securityId: ID })[0].reason, "NO_RAW_JUMP");
  assert.deepEqual(RS.splitFactors(bereinigt, { securityId: ID }), RS.splitFactors(bereinigt));
});

test("Herausgeber-Komposition: Tagesbalken -> Wochenschluss -> Cent; vor dem Ex-Tag genau halbiert, danach unveraendert", () => {
  const bars = pzzaBars();
  const roh = Sampling.weeklyPoints(splitAdjustedCloses(bars).map((b) => [b.date, b.close])).map((p) => [p[0], PublishedClose.roundClose(p[1])]);
  const neu = Sampling.weeklyPoints(splitAdjustedCloses(bars, ID).map((b) => [b.date, b.close])).map((p) => [p[0], PublishedClose.roundClose(p[1])]);
  assert.equal(neu.length, roh.length);
  neu.forEach(([d, v], i) => {
    if (d < "2013-12-30") {
      const raw = bars.filter((b) => b.date <= d).at(-1).close;
      assert.equal(v, PublishedClose.roundClose(raw / 2), d);
      const n = dividePublished(roh[i][1], 2);
      assert.ok(v >= n.lo && v <= n.hi, "liegt im Rundungsband der committeten Rechnung: " + d);
    } else assert.equal(v, roh[i][1], d);
  });
  /* Beleg der Kapitalmassnahmen: ohne Ergaenzung ein ungeklaerter Ein-Tages-Sprung, mit ihr sauber und benannt. */
  const daily = (id) => splitAdjustedCloses(bars, id);
  const vorher = CA.evidence(daily(), roh, bars);
  assert.equal(vorher.moves.length, 1);
  assert.equal(CA.resolve([{ time: vorher.moves[0].week }], vorher).items[0].reason, "SINGLE_DAY_SPLIT_SIZED_JUMP");
  assert.equal("supplemented" in vorher, false, "ohne Ergaenzung bytegleiches Dokument");
  const nachher = CA.evidence(daily(ID), neu, bars, RS.appliedSupplements(bars, { securityId: ID }));
  assert.deepEqual(nachher.moves, []);
  assert.deepEqual(nachher.splits, [["2013-12-30", 2]]);
  assert.deepEqual(nachher.supplemented, [{ date: "2013-12-30", factor: 2, id: PZZA.id, accession: "0001157523-13-005314", source: "SEC_FILING_SUPPLEMENT" }]);
});

test("Herausgeber-Quelltext: lange und kurze Reihe reichen die securityId an splitFactors durch", () => {
  const lang = readFileSync(new URL("scripts/market/publish-long-series.mjs", ROOT), "utf8");
  assert.match(lang, /splitAdjustedCloses\(aktuell, s\.securityId\)/);
  assert.match(lang, /CorporateActions\.evidence\(closes, points, aktuell, ergaenzt\)/);
  const kurz = readFileSync(new URL("scripts/market/publish-discover-series.mjs", ROOT), "utf8");
  assert.match(kurz, /splitAdjustedCloses\(bars, security && security\.securityId\)/);
  assert.match(kurz, /ReturnSeries\.splitFactors\(bars, securityId \? \{ securityId \} : undefined\)/);
});

test("committete PZZA-Wochenreihe: korrigierte Kopie besteht den Wochen-Adapter, die heutige nicht", () => {
  const text = readFileSync(new URL("quant/data/market/discover-series-long/" + ID + ".json", ROOT), "utf8");
  const doc = JSON.parse(text);
  const loader = Adapter.createLoader(new URL(".", ROOT).pathname);
  assert.throws(() => loader(ID, text), /CORPORATE_ACTION_UNRESOLVED.*SINGLE_DAY_SPLIT_SIZED_JUMP/);
  const { doc: neu, unresolvedMoves } = correctedDoc(doc, PZZA);
  assert.deepEqual(unresolvedMoves, []);
  assert.equal(loader(ID, JSON.stringify(neu)).corporateActionQuality.status, "CLEAN");
  const i = doc.points.findIndex((p) => p[0] === "2014-01-03");
  assert.equal(doc.points[i - 1][1], 89.95);
  assert.deepEqual(neu.points.slice(i), doc.points.slice(i), "ab der Ex-Woche unveraendert");
  doc.points.slice(0, i).forEach(([d, v], k) => assert.ok(Math.abs(neu.points[k][1] - v / 2) <= 0.0050001, d));
});

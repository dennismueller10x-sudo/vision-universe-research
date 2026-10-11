/* Eigentuemer-Signale aus SEC EDGAR (quant/engines/ownership-signals.js,
   scripts/market/build-ownership-signals.mjs): Datumsformate, Formular-
   namen, 13F-Einheiten, Zeitpunkt nach Einreichungsdatum, Cluster-Kaeufe,
   CUSIP-/Ticker-Zuordnung, Schedule-13D/G-Gegenstand, Form-4-XML und ein
   vollstaendiger Lauf des Erzeugers auf synthetischen Fixtures - ohne Netz. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const E = require(join(root, "quant/engines/ownership-signals.js"));
const B = await import("../../scripts/market/build-ownership-signals.mjs");
const FIX = join(root, "quant/tests/fixtures/ownership");
const d = E.dayOf;

function tx(f, t, c, owner, bits, extra) {
  return Object.assign({ f: d(f), t: d(t), c, sh: 100, v: 1000, os: [owner], rs: [bits], p: false, a: false }, extra || {});
}

test("OS1 · SEC-Datumsformate werden zu ISO, Unlesbares zu null", () => {
  assert.equal(E.parseSecDate("31-MAR-2024"), "2024-03-31");
  assert.equal(E.parseSecDate("02-feb-2024"), "2024-02-02");
  assert.equal(E.parseSecDate("2024-03-31"), "2024-03-31");
  assert.equal(E.parseSecDate("20240331"), "2024-03-31");
  assert.equal(E.parseSecDate("3/31/2024"), "2024-03-31");
  assert.equal(E.parseSecDate("31-FOO-2024"), null);
  assert.equal(E.parseSecDate("2023-02-30"), null);
  assert.equal(E.parseSecDate("15-JAN-0024"), null, "Tippfehler im Jahr (im echten Datensatz gesehen)");
  assert.equal(E.dayOf("24-01-15"), null);
  assert.equal(E.clusterBuy([{ f: d("2024-03-01"), t: NaN, c: "P", os: ["A"], rs: [E.REL.OFFICER] }], d("2024-03-31")).flag, false);
  assert.equal(E.parseSecDate(""), null);
  assert.equal(E.isoOf(E.dayOf("2024-02-29")), "2024-02-29");
});

test("OS2 · Formularnamen: SC 13D/13G alt und SCHEDULE 13D/13G neu; 4/A ist Aenderung", () => {
  assert.deepEqual(E.scheduleForm("SC 13D"), { kind: "13D", amendment: false });
  assert.deepEqual(E.scheduleForm("SC 13G/A"), { kind: "13G", amendment: true });
  assert.deepEqual(E.scheduleForm("SCHEDULE 13D/A"), { kind: "13D", amendment: true });
  assert.deepEqual(E.scheduleForm("SCHEDULE 13G"), { kind: "13G", amendment: false });
  assert.equal(E.scheduleForm("SC 13E3"), null);
  assert.equal(E.scheduleForm("SC TO-T"), null);
  assert.deepEqual(E.insiderDocType("4"), { form: "4", amendment: false });
  assert.deepEqual(E.insiderDocType("4/A"), { form: "4", amendment: true });
  assert.equal(E.insiderDocType("3"), null);
  assert.equal(E.classifyRelationship("Director,TenPercentOwner"), E.REL.DIRECTOR | E.REL.TEN_PCT);
  assert.equal(E.classifyRelationship("Officer"), E.REL.OFFICER);
  assert.equal(E.isInsider(E.classifyRelationship("Other")), false);
});

test("OS3 · 13F-Wert: bis 02.01.2023 Tausend USD, ab 03.01.2023 USD - mit Plausibilitaetspruefung", () => {
  assert.equal(E.thirteenFValueUnit("2022-11-14", 0.05).unit, "THOUSANDS");
  assert.equal(E.thirteenFValueUnit("2023-01-02", null).unit, "THOUSANDS");
  assert.equal(E.thirteenFValueUnit("2023-01-03", null).unit, "DOLLARS");
  assert.equal(E.thirteenFValueUnit("2024-02-10", 52).unit, "DOLLARS");
  const late = E.thirteenFValueUnit("2024-02-10", 0.01);
  assert.equal(late.unit, "THOUSANDS", "nicht umgestellte Einreichung nach 2023");
  assert.equal(late.basis, "IMPLIED_PER_SHARE_OVERRIDE");
  assert.equal(E.thirteenFValueUnit("2021-05-10", 120).unit, "DOLLARS", "zu frueh umgestellte Einreichung");
  assert.equal(E.valueToUsd(20, "THOUSANDS"), 20000);
  assert.equal(E.valueToUsd(20, "DOLLARS"), 20);
});

test("OS3b · 13F-Meldung gilt nur vollstaendig als gemeldet (vertraulich, abgeschnitten)", () => {
  assert.equal(E.thirteenFFilingComplete({ rows: 33063, tableEntryTotal: 33063, confidentialOmitted: false }), true);
  /* JPMorgan Q1 2026: Original traegt 378 von 33 063 Zeilen, Bestaende stehen in der RESTATEMENT-Aenderung */
  assert.equal(E.thirteenFFilingComplete({ rows: 378, tableEntryTotal: 33063, confidentialOmitted: false }), false);
  /* Norges Bank: vertraulich, Bestaende ausgelassen */
  assert.equal(E.thirteenFFilingComplete({ rows: 1, tableEntryTotal: 1507, confidentialOmitted: true }), false);
  assert.equal(E.thirteenFFilingComplete({ rows: 950, tableEntryTotal: 1000 }), true, "Universumsfilter und Optionen: 90 % genuegen");
  assert.equal(E.thirteenFFilingComplete({ rows: 5 }), true, "ohne Summenseite wie bisher");
  assert.equal(E.thirteenFFilingComplete(null), false);
});

test("OS4 · Datensatzfenster und 13F-Quartal nach 45-Tage-Frist", () => {
  assert.deepEqual(E.datasetWindow("2024q1_form345.zip"), { start: "2024-01-01", end: "2024-03-31", kind: "insider" });
  assert.deepEqual(E.datasetWindow("2023q4_form13f.zip"), { start: "2023-10-01", end: "2023-12-31", kind: "13f" });
  assert.deepEqual(E.datasetWindow("01mar2024-31may2024_form13f.zip"), { start: "2024-03-01", end: "2024-05-31", kind: "13f" });
  assert.equal(E.datasetWindow("readme.htm"), null);
  assert.equal(E.thirteenFPeriodAt(d("2024-02-14")), "2023-12-31");
  assert.equal(E.thirteenFPeriodAt(d("2024-02-13")), "2023-09-30");
  assert.equal(E.thirteenFPeriodAt(d("2024-05-15")), "2024-03-31");
  assert.deepEqual(E.monthEnds("2024-01-01", "2024-03-31"), ["2024-01-31", "2024-02-29", "2024-03-31"]);
});

test("OS5 · Zeitpunkt: eine Einreichung nach D ist an D unsichtbar, auch bei frueherer Transaktion", () => {
  const txs = E.sortTransactions([
    tx("2024-02-02", "2024-01-30", "P", "A", E.REL.OFFICER),
    tx("2024-01-10", "2024-01-09", "P", "B", E.REL.DIRECTOR)
  ]);
  const jan = E.insiderSnapshot(txs, d("2024-01-31"));
  assert.equal(jan.ib90, 1, "nur B ist am 31.01. eingereicht");
  assert.equal(jan.ibo90, 0);
  const feb = E.insiderSnapshot(txs, d("2024-02-02"));
  assert.equal(feb.ib90, 2);
  assert.equal(feb.ibo90, 1);
  /* Schedule und 13F folgen derselben Regel. */
  const sch = [{ f: d("2024-02-01"), k: "13D", a: false, filers: ["X"], acc: "1" }];
  assert.equal(E.scheduleSnapshot(sch, d("2024-01-31")).d13n, 0);
  assert.equal(E.scheduleSnapshot(sch, d("2024-02-01")).d13n, 1);
  const curr = { positions: [{ m: 1, sh: 10, v: 100, f: d("2024-02-10") }], filedDay: new Map([[1, d("2024-02-10")]]) };
  assert.equal(E.thirteenFSnapshot(curr, { positions: [] }, d("2024-02-09")).fh, 0);
  assert.equal(E.thirteenFSnapshot(curr, { positions: [] }, d("2024-02-10")).fh, 1);
});

test("OS6 · Cluster-Kauf: >= 3 verschiedene Insider innerhalb von 30 Tagen", () => {
  const O = E.REL.OFFICER, D = E.REL.DIRECTOR;
  const three = E.sortTransactions([tx("2024-03-01", "2024-02-01", "P", "A", O), tx("2024-03-02", "2024-02-15", "P", "B", D), tx("2024-03-03", "2024-03-01", "P", "C", D)]);
  assert.equal(E.clusterBuy(three, d("2024-03-31")).flag, true);
  assert.equal(E.insiderSnapshot(three, d("2024-03-31")).cb, 1);
  const spread = E.sortTransactions([tx("2024-03-01", "2024-02-01", "P", "A", O), tx("2024-03-02", "2024-02-15", "P", "B", D), tx("2024-03-03", "2024-03-02", "P", "C", D)]);
  assert.equal(E.clusterBuy(spread, d("2024-03-31")).flag, false, "30 Tage auseinander ist kein Cluster");
  const same = E.sortTransactions([tx("2024-03-01", "2024-02-01", "P", "A", O), tx("2024-03-02", "2024-02-05", "P", "A", O), tx("2024-03-03", "2024-02-06", "P", "A", O)]);
  assert.equal(E.clusterBuy(same, d("2024-03-31")).flag, false, "derselbe Insider dreimal");
  const other = E.sortTransactions([tx("2024-03-01", "2024-02-01", "P", "A", O), tx("2024-03-02", "2024-02-05", "P", "B", D), tx("2024-03-03", "2024-02-06", "P", "C", E.REL.OTHER)]);
  assert.equal(E.clusterBuy(other, d("2024-03-31")).flag, false, "Rolle 'Other' ist kein Insider");
  const sells = E.sortTransactions([tx("2024-03-01", "2024-02-01", "S", "A", O), tx("2024-03-02", "2024-02-05", "S", "B", D), tx("2024-03-03", "2024-02-06", "S", "C", D)]);
  assert.equal(E.clusterBuy(sells, d("2024-03-31")).flag, false);
  assert.equal(E.clusterBuy(three, d("2024-03-02")).flag, false, "die dritte Meldung ist am 02.03. noch nicht eingereicht");
  assert.equal(E.clusterBuy(three, d("2024-06-15")).flag, false, "Meldungen aelter als 90 Tage");
});

test("OS7 · Insider-Kennzahlen: Plan-Verkaeufe, Rollen, Aenderungen, Nettoaktien in %", () => {
  const txs = E.sortTransactions([
    tx("2024-03-01", "2024-02-28", "P", "A", E.REL.OFFICER, { sh: 1000, v: 10000 }),
    tx("2024-03-02", "2024-02-28", "P", "B", E.REL.DIRECTOR | E.REL.TEN_PCT, { sh: 500, v: 5000, p: true }),
    tx("2024-03-03", "2024-03-01", "S", "A", E.REL.OFFICER, { sh: 2000, v: 30000, p: true }),
    tx("2024-03-04", "2024-03-01", "S", "C", E.REL.DIRECTOR, { sh: 100, v: 2000 }),
    tx("2024-03-05", "2024-02-28", "P", "A", E.REL.OFFICER, { sh: 1000, v: 10000, a: true })
  ]);
  const s = E.insiderSnapshot(txs, d("2024-03-31"), { sharesBase: 100000 });
  assert.equal(s.ib90, 2); assert.equal(s.ibo90, 1); assert.equal(s.ibd90, 1); assert.equal(s.ibt90, 1);
  assert.equal(s.ibx90, 1, "Planverkaeufer B zaehlt nicht als Kaeufer ohne Plan");
  assert.equal(s.is90, 2);
  assert.equal(s.bv90, 15000, "die Aenderung (a) zaehlt nicht doppelt");
  assert.equal(s.sv90, 32000); assert.equal(s.svx90, 2000);
  assert.equal(s.nbv90, -17000);
  assert.equal(s.nsh90, -600);
  assert.equal(s.nsp90, -0.6);
  assert.equal(E.insiderSnapshot(txs, d("2024-03-31")).nsp90, null, "ohne Aktienbasis keine Prozentzahl");
});

test("OS8 · CUSIP -> Ticker: wiederverwendetes Kuerzel abgelehnt, Tickerwechsel gefolgt, Mehrdeutiges verworfen", () => {
  const obs = new Map();
  const add = (cusip, sym, first, last) => { const m = obs.get(cusip) || obs.set(cusip, new Map()).get(cusip); m.set(sym, { first, last }); };
  add("30303M102", "FB", "2016-01-04", "2022-06-08");
  add("30303M102", "META", "2022-06-09", "2026-09-30");
  add("99999Z101", "CCC", "2016-01-04", "2018-05-01");
  add("12345C101", "CCC", "2021-01-04", "2026-09-15");
  add("12345C200", "CCC", "2016-01-04", "2019-12-31");
  add("084670702", "BRK.B", "2016-01-04", "2026-09-30");
  const r = E.mapCusipsToTickers(obs, ["META", "CCC", "BRK.B", "BRKB"]);
  assert.equal(r.map.get("30303M102"), "META");
  assert.equal(r.map.get("12345C101"), "CCC");
  assert.equal(r.map.get("12345C200"), "CCC", "aelterer CUSIP derselben Emittentennummer");
  assert.equal(r.map.has("99999Z101"), false, "anderer Emittent unter demselben Kuerzel");
  assert.equal(r.map.has("084670702"), false, "BRK.B und BRKB sind nicht unterscheidbar");
  assert.equal(r.ambiguousSymbols, 1);
  assert.equal(E.normalizeCusip("0000a101"), "00000A101");
  assert.equal(E.normalizeCusip("xx"), null);
});

test("OS9 · Schedule 13D/13G: Gegenstand aus den Indexzeilen", () => {
  const U = new Set(["0000000001", "0000000002", "0000000900"]);
  const P = (cik, name) => ({ cik, name });
  const r1 = E.resolveScheduleSubject("0000000777-24-000001", [P("0000000002", "BBB"), P("0000000777", "ACTIVIST")], U, new Map());
  assert.deepEqual(r1, { status: "RESOLVED", subjectCik: "0000000002", filers: ["ACTIVIST"] });
  const r2 = E.resolveScheduleSubject("0000000900-24-000005", [P("0000000001", "AAA"), P("0000000900", "FUND")], U, new Map());
  assert.equal(r2.subjectCik, "0000000001", "wer selbst einreicht, ist der Meldende");
  const r3 = E.resolveScheduleSubject("0000000900-24-000006", [P("0000004242", "NOT LISTED"), P("0000000900", "FUND")], U, new Map());
  assert.equal(r3.status, "FILER_ONLY", "ein Verwalter im Universum ist nicht der Gegenstand");
  const r4 = E.resolveScheduleSubject("0000950123-24-000200", [P("0000000001", "AAA"), P("0000000002", "BBB")], U, new Map());
  assert.equal(r4.status, "AMBIGUOUS");
  const r5 = E.resolveScheduleSubject("0000950123-24-000300", [P("0000000001", "AAA"), P("0000000900", "FUND")], U, new Map([["0000000900", 400], ["0000000001", 2]]));
  assert.equal(r5.subjectCik, "0000000001", "Vielmelder ist Verwalter, nicht Gegenstand");
  assert.equal(E.resolveScheduleSubject("x", [P("0000000777", "A")], U, new Map()).status, "NOT_IN_UNIVERSE");
});

test("OS10 · Form-4-XML: Emittent, Rolle, Transaktion, 10b5-1 ueber Fussnote und Kontrollkaestchen", () => {
  const txt = readFileSync(join(FIX, "source/filings/0000001005-24-000009.txt"), "utf8");
  const doc = E.parseForm4Xml(txt);
  assert.equal(doc.issuerCik, "0000000001");
  assert.equal(doc.aff10b5One, false);
  assert.equal(doc.owners.length, 1);
  assert.equal(doc.owners[0].bits, E.REL.DIRECTOR);
  assert.equal(doc.owners[0].name, "SMITH ANNA");
  assert.deepEqual(doc.transactions, [{ code: "P", date: "2024-07-08", shares: 300, price: 15, ad: "A", plan: false }]);
  const plan = txt.replace("&amp; not under a plan.", "under a Rule 10b5-1 trading plan.");
  assert.equal(E.parseForm4Xml(plan).transactions[0].plan, true);
  const box = txt.replace("<aff10b5One>0</aff10b5One>", "<aff10b5One>true</aff10b5One>");
  assert.equal(E.parseForm4Xml(box).transactions[0].plan, true);
  assert.equal(E.parseForm4Xml("<html>kein XML</html>"), null);
  const rec = B.compactForm4(doc, "2024-07-10");
  assert.deepEqual(rec.x, [["P", d("2024-07-08"), 300, 4500, 0]]);
});

test("OS11 · 13F: abgeglichenes Panel (neu, aufgeloest, aufgestockt, reduziert)", () => {
  const f = d("2024-02-01");
  const curr = { positions: [{ m: 1, sh: 150, v: 1, f }, { m: 3, sh: 70, v: 1, f }, { m: 4, sh: 200, v: 1, f }, { m: 6, sh: 5, v: 1, f }],
    filedDay: new Map([[1, f], [2, f], [3, f], [4, f], [6, f]]) };
  const prev = { positions: [{ m: 1, sh: 100, v: 1, f: f - 90 }, { m: 2, sh: 50, v: 1, f: f - 90 }, { m: 6, sh: 10, v: 1, f: f - 90 }, { m: 7, sh: 40, v: 1, f: f - 90 }],
    filedDay: new Map([[1, f - 90], [2, f - 90], [4, f - 90], [6, f - 90], [7, f - 90]]) };
  const s = E.thirteenFSnapshot(curr, prev, d("2024-02-29"), { sharesBase: 1000 });
  assert.equal(s.fh, 4); assert.equal(s.fhp, 4);
  assert.equal(s.fnew, 1, "Verwalter 4 meldete das Vorquartal ohne Position; 3 meldete gar nicht");
  assert.equal(s.fexit, 1, "Verwalter 2 meldete ohne Position; 7 hat noch nicht gemeldet");
  assert.equal(s.finc, 1); assert.equal(s.fdec, 1);
  assert.equal(s.fdsh, 50 + 200 - 50 - 5);
  assert.equal(s.fio, 42.5);
  assert.deepEqual(s.topNew, [{ manager: 4, shares: 200, valueUsd: 1 }]);
});

test("OS12 · EDGAR-Master-Index wird gelesen", () => {
  const rows = B.parseMasterIndex(readFileSync(join(FIX, "source/index/2024-QTR1.idx"), "latin1"));
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[1], { cik: "0000000002", name: "BBB INC", form: "SC 13D", date: "2024-02-12", file: "edgar/data/2/0000000777-24-000001.txt", acc: "0000000777-24-000001" });
});

async function runFixtureBuild(extra) {
  const tmp = mkdtempSync(join(tmpdir(), "own-"));
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("kein Netz im Test"); };
  try {
    const manifest = await B.build(Object.assign({
      sourceDir: join(FIX, "source"), universeFile: join(FIX, "universe.json"), consumerDir: join(FIX, "consumer"),
      since: "2024-01", asOf: "2024-07-31", out: join(tmp, "out"), cache: join(tmp, "cache"), generatedAt: "2024-07-31T00:00:00Z"
    }, extra || {}));
    const read = (p) => JSON.parse(gunzipSync(readFileSync(join(tmp, "out", p))));
    return { tmp, manifest, read, calls };
  } finally { globalThis.fetch = realFetch; }
}
const col = (row, name) => row[B.HISTORY_COLUMNS.indexOf(name)];

test("OS13 · Erzeuger auf Fixtures: Zeitpunkt, Cluster, 13F-Einheit, Zuordnung - ohne Netz", async () => {
  const { tmp, manifest, read, calls } = await runFixtureBuild();
  try {
    assert.equal(calls, 0, "kein einziger Netzaufruf");
    assert.equal(manifest.source, "SEC_EDGAR");
    assert.equal(manifest.history.firstMonth, "2024-01-31");
    assert.equal(manifest.history.lastMonth, "2024-06-30");
    assert.equal(manifest.coverage.insider.coverageEnd, "2024-06-30");
    assert.equal(manifest.coverage.insider.form4GapFill.complete, true);
    assert.equal(manifest.coverage.schedules.ambiguous, 1);
    assert.equal(manifest.coverage.thirteenF.duplicateOriginals, 1);
    assert.equal(manifest.coverage.thirteenF.restatementsSkipped, 1);
    assert.equal(manifest.coverage.thirteenF.duplicateAccessions, 1);
    assert.equal(manifest.coverage.thirteenF.unitOverrides, 1);
    const h = read("history/AA.json.gz");
    assert.deepEqual(h.columns, B.HISTORY_COLUMNS);
    const aaa = h.issuers.AAA;
    assert.equal(aaa.from, "2024-01-31");
    const [jan, feb, mar] = aaa.rows;
    assert.equal(col(jan, "ib90"), 0, "Kauf vom 30.01., eingereicht am 02.02.: am 31.01. unsichtbar");
    assert.equal(col(feb, "ib90"), 2);
    assert.equal(col(feb, "cb"), 0);
    assert.equal(col(mar, "ib90"), 3, "Rolle 'Other' zaehlt nicht");
    assert.equal(col(mar, "cb"), 1, "drei Insider innerhalb von 28 Tagen");
    assert.equal(col(mar, "bv90"), 38000, "4/A wird nicht doppelt gezaehlt");
    assert.equal(col(mar, "sv90"), 65000);
    assert.equal(col(mar, "svx90"), 0, "Verkauf mit 10b5-1-Fussnote");
    assert.equal(col(mar, "nsp90"), -0.15);
    assert.equal(col(feb, "g13n"), 1);
    assert.equal(col(mar, "g13a"), 1);
    assert.equal(col(mar, "d13n"), 0, "mehrdeutige Meldung (AAA und BBB) wird verworfen");
    assert.equal(col(jan, "fp"), "2023-Q3");
    assert.equal(col(jan, "fhp"), null, "ohne geladenes Vorquartal kein Vergleich");
    assert.equal(col(feb, "fp"), "2023-Q4");
    assert.equal(col(feb, "fh"), 3); assert.equal(col(feb, "fhp"), 2);
    assert.equal(col(feb, "fnew"), 1); assert.equal(col(feb, "fexit"), 1); assert.equal(col(feb, "finc"), 1);
    assert.equal(col(feb, "fsh"), 4200); assert.equal(col(feb, "fdsh"), 2000);
    assert.equal(col(feb, "fval"), 42000, "Tausender-Meldung nach 2023 wird erkannt und umgerechnet");
    assert.equal(col(feb, "fio"), 0.42);
    const bbb = read("history/BB.json.gz").issuers.BBB.rows;
    assert.equal(col(bbb[0], "fsh"), 2100, "PRN-Zeilen und Optionen zaehlen nicht");
    assert.equal(col(bbb[1], "d13n"), 1);
    assert.equal(col(bbb[4], "svx90"), 0, "Plan-Kontrollkaestchen AFF10B5ONE");
    const cur = read("current/AA.json.gz");
    assert.equal(cur.asOf, "2024-07-31");
    const a = cur.issuers.AAA;
    assert.equal(a.securityId, "ref_AAA");
    assert.equal(a.insider.ib90, 1, "Form-4-Luecke aus der Einzeleinreichung gefuellt");
    assert.equal(a.insider.ib180, 3);
    assert.equal(a.insider.topBuyers[0].name, "SMITH ANNA");
    assert.equal(a.institutions.period, "2024-03-31");
    assert.equal(a.institutions.fh, 2);
    assert.equal(manifest.coverage.insider.implausibleValuesNulled, 1);
    const cccMar = read("history/CC.json.gz").issuers.CCC.rows[2];
    assert.equal(col(cccMar, "ib90"), 1, "der Kauf zaehlt als Insider-Kauf ...");
    assert.equal(col(cccMar, "bv90"), 0, "... aber ein Preis von 2,27 Mio. USD je Aktie traegt keinen Wert");
    const ccc = read("current/CC.json.gz").issuers.CCC;
    assert.equal(ccc.institutions, null, "alter CUSIP eines anderen Emittenten unter 'CCC' wird nicht zugeordnet");
    assert.equal(ccc.schedules.d13n, 1, "neuer Formularname SCHEDULE 13D");
    assert.equal(ccc.schedules.recent[0].filers[0], "ACTIVIST PARTNERS LP");
    assert.ok(!existsSync(join(tmp, "out", "current", "FU.json.gz")), "Verwalter ohne eigene Signale erscheint nicht");
    /* Kein Kursniveau, keine Rohzeilen im Ergebnis. */
    for (const dir of ["current", "history"]) for (const f of readdirSync(join(tmp, "out", dir))) {
      const s = JSON.stringify(read(join(dir, f)));
      assert.ok(!/"(price|close|open|high|low)"\s*:/i.test(s), dir + "/" + f + " traegt ein Kursfeld");
      assert.equal(read(join(dir, f)).source, "SEC_EDGAR");
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("OS14 · Unvollstaendige Form-4-Luecke wird ausgewiesen, nicht verschwiegen", async () => {
  const { tmp, manifest, read } = await runFixtureBuild({ form4Max: 0 });
  try {
    assert.equal(manifest.coverage.insider.form4GapFill.complete, false);
    assert.equal(manifest.coverage.insider.form4GapFill.needed, 1);
    const a = read("current/AA.json.gz").issuers.AAA;
    assert.equal(a.insider.complete, false);
    assert.equal(a.insider.ib90, 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("OS15 · Die Monatsreihe ist deterministisch (gleiche Eingaben, gleiche Bytes)", async () => {
  const r1 = await runFixtureBuild();
  const r2 = await runFixtureBuild();
  try {
    for (const f of readdirSync(join(r1.tmp, "out", "history"))) {
      assert.ok(readFileSync(join(r1.tmp, "out", "history", f)).equals(readFileSync(join(r2.tmp, "out", "history", f))), f);
    }
  } finally { rmSync(r1.tmp, { recursive: true, force: true }); rmSync(r2.tmp, { recursive: true, force: true }); }
});

test("OS16 · ZIP-Pfad (System-unzip) liefert dasselbe wie das Verzeichnis", async (t) => {
  try { execFileSync("zip", ["-v"], { stdio: "ignore" }); execFileSync("unzip", ["-v"], { stdio: "ignore" }); }
  catch { t.skip("zip/unzip nicht vorhanden"); return; }
  const tmp = mkdtempSync(join(tmpdir(), "ownzip-"));
  try {
    const dir = join(FIX, "source/insider/2024q1_form345");
    const zip = join(tmp, "2024q1_form345.zip");
    execFileSync("zip", ["-q", "-j", zip, ...readdirSync(dir).map((f) => join(dir, f))]);
    const a = await B.extractInsiderDataset({ dir });
    const b = await B.extractInsiderDataset({ zip });
    assert.deepEqual(b, a);
    assert.equal(Object.keys(a.accessions).length, 10);
    assert.equal(a.stats.amendmentsSkipped, 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("OS17 · SEC-Zugang: User-Agent mit Kontaktadresse ist Pflicht", () => {
  assert.throws(() => B.createSecClient({ userAgent: "anonymous" }), /Kontaktadresse/);
  assert.ok(B.createSecClient({ userAgent: B.DEFAULT_UA }));
  assert.match(B.DEFAULT_UA, /@visionuniverse\.de/);
});

test("OS18 · Netzpfad gegen eine SEC-Attrappe: Seiten, ZIPs, master.gz, Einzeleinreichung, User-Agent", async (t) => {
  try { execFileSync("zip", ["-v"], { stdio: "ignore" }); } catch { t.skip("zip nicht vorhanden"); return; }
  const { gzipSync } = await import("node:zlib");
  const { mkdirSync, copyFileSync } = await import("node:fs");
  const tmp = mkdtempSync(join(tmpdir(), "ownnet-"));
  try {
    const S = join(FIX, "source");
    mkdirSync(join(tmp, "zips"), { recursive: true });
    const zipOf = (dir, name) => { const z = join(tmp, "zips", name); execFileSync("zip", ["-q", "-j", z, ...readdirSync(dir).map((f) => join(dir, f))]); return readFileSync(z); };
    const routes = new Map();
    for (const n of readdirSync(join(S, "insider"))) routes.set(B.BASES.insider + n + ".zip", zipOf(join(S, "insider", n), n + ".zip"));
    for (const n of readdirSync(join(S, "13f"))) routes.set(B.BASES.thirteenF + n + ".zip", zipOf(join(S, "13f", n), n + ".zip"));
    for (const n of readdirSync(join(S, "ftd"))) {
      const dir = join(tmp, "ftd-" + n); mkdirSync(dir, { recursive: true }); copyFileSync(join(S, "ftd", n), join(dir, n));
      routes.set(B.BASES.ftd + n.replace(".txt", ".zip"), zipOf(dir, n.replace(".txt", ".zip")));
    }
    routes.set(B.BASES.fullIndex + "2024/QTR1/master.gz", gzipSync(readFileSync(join(S, "index/2024-QTR1.idx"))));
    routes.set(B.BASES.fullIndex + "2024/QTR3/master.idx", readFileSync(join(S, "index/2024-QTR3.idx")));
    routes.set(B.BASES.archives + "edgar/data/1/0000001005-24-000009.txt", readFileSync(join(S, "filings/0000001005-24-000009.txt")));
    /* Die 13F-Seite nennt die rollierende Datei relativ; die Insider-Seite nichts (Rueckfall auf konstruierte Namen). */
    routes.set(B.PAGES.thirteenF, Buffer.from('<a href="/files/structureddata/data/form-13f-data-sets/01mar2024-31may2024_form13f.zip">x</a>'));
    routes.set(B.PAGES.insider, Buffer.from("<html></html>"));
    routes.set(B.PAGES.ftd, Buffer.from("<html></html>"));
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, ua: init.headers["User-Agent"] });
      const body = routes.get(url);
      return body ? new Response(body, { status: 200 }) : new Response("nf", { status: 404 });
    };
    const client = B.createSecClient({ userAgent: "Test test@example.org", fetchImpl, unthrottled: true });
    const opts = (out) => ({ client, universeFile: join(FIX, "universe.json"), consumerDir: join(FIX, "consumer"), since: "2024-01", asOf: "2024-07-31",
      out: join(tmp, out), cache: join(tmp, "cache"), work: join(tmp, "work") });
    const m = await B.build(opts("out"));
    assert.ok(seen.every((s) => s.ua === "Test test@example.org"), "jede Anfrage traegt den User-Agent");
    assert.equal(m.coverage.insider.datasets, 2);
    assert.equal(m.coverage.thirteenF.datasets, 3, "zwei konstruierte, eine von der Seite");
    assert.equal(m.coverage.insider.form4GapFill.fetched, 1);
    assert.equal(m.coverage.schedules.resolved, 4);
    assert.equal(m.coverage.cusipMap.cusips, 3);
    assert.equal(m.access.requests, seen.length);
    const read = (p) => JSON.parse(gunzipSync(readFileSync(join(tmp, "out", p))));
    const fix = await runFixtureBuild();
    try {
      for (const dir of ["history", "current"]) for (const f of readdirSync(join(fix.tmp, "out", dir))) {
        assert.deepEqual(read(join(dir, f)).issuers, fix.read(join(dir, f)).issuers, dir + "/" + f + ": Netz- und Verzeichnispfad gleich");
      }
    } finally { rmSync(fix.tmp, { recursive: true, force: true }); }
    /* Zweiter Lauf: abgeschlossene Datensaetze und die Form-4-Einreichung kommen aus dem Cache. */
    const before = seen.length;
    const m2 = await B.build(opts("out2"));
    const again = seen.slice(before).map((s) => s.url);
    assert.ok(!again.some((u) => /2024q[12]_form345\.zip$/.test(u)), "vorhandene Insider-Datensaetze aus dem Cache");
    assert.ok(!again.some((u) => u.endsWith("2024/QTR1/master.gz")), "abgeschlossenes Indexquartal aus dem Cache");
    assert.ok(again.some((u) => u.endsWith("2024/QTR3/master.idx")), "laufendes Quartal wird neu gelesen");
    assert.ok(!again.some((u) => u.includes("0000001005-24-000009")), "Form 4 aus dem Cache");
    assert.equal(m2.coverage.insider.form4GapFill.cached, 1);
    assert.ok(!existsSync(join(tmp, "work")), "Arbeitsverzeichnis wird aufgeraeumt");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

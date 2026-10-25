/* Produktwelt Technical: Oberflaechenmodell, Seitenverdrahtung, Datensatzvertrag.
   Laeuft in technical-ci.yml; tests/ wird nicht ausgeliefert (build-release.mjs#permitted). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const M = require(join(root, "technical/engine/model.js"));
const Q = require(join(root, "quant/engines/technical/technical-query.js"));

test("Routen: Start, Screener, Gespeichert, Chart Studio, Signale, Methodik, unbekannt", () => {
  assert.equal(M.parseRoute("").view, "home");
  assert.equal(M.parseRoute("#/").view, "home");
  assert.deepEqual(M.parseRoute("#/screener?muster=dreieck&tf=1W"), { view: "screener", tab: "build", params: { muster: "dreieck", tf: "1W" } });
  assert.equal(M.parseRoute("#/screener/gespeichert").tab, "saved");
  assert.deepEqual(M.parseRoute("#/chart/brk-b"), { view: "chart", ticker: "BRK-B", tab: "chart", params: {} });
  assert.equal(M.parseRoute("#/chart/NVDA/signale").tab, "signals");
  assert.equal(M.parseRoute("#/chart/<script>").ticker, null, "ungueltiges Kuerzel wird nicht verwendet");
  assert.equal(M.parseRoute("#/methodik").view, "method");
  assert.equal(M.parseRoute("#/irgendwas").view, "notfound");
  assert.equal(M.chartHref("BRK-B"), "#/chart/BRK-B");
  assert.deepEqual(M.technicalPaths("BRK-B"), ["/quant/data/product/technical-signals-v1/by-ticker/BRK-B.json.gz", "/quant/data/product/technical-signals-v1/BR.json.gz"]);
  assert.equal(M.technicalShard("A"), "A_", "Scherbe wie quant/api/product-services.js#technicalShard");
});

test("Screener-Zustand: Adresse <-> Zustand <-> gueltige Abfrage", () => {
  const st = M.stateFromParams({ muster: "dreieck,breakout,unbekannt", trend: "sma200,hoch52", vol: "1", rsi: "60", logik: "oder", sort: "relVol", bestaetigt: "1" });
  assert.deepEqual(st.patterns, ["dreieck", "breakout"], "unbekannte Werte fallen weg");
  assert.equal(M.paramsFromState(st), "muster=dreieck,breakout&bestaetigt=1&trend=sma200,hoch52&vol=1&rsi=60&logik=oder&sort=relVol");
  const { query, dropped } = M.queryFromState(st);
  assert.ok(Q.validate(query).ok, JSON.stringify(Q.validate(query).errors));
  assert.equal(query.logic, "OR");
  assert.deepEqual(query.groups[0].filters[0], { field: "formationConfirmed", op: "in", value: ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE", "RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"] });
  assert.deepEqual(dropped, []);
  /* Woche: Tagesfelder entfallen sichtbar statt still. */
  const w = M.queryFromState(M.stateFromParams({ tf: "1W", muster: "dreieck", trend: "sma200,rs", vol: "1" }));
  assert.ok(Q.validate(w.query).ok);
  assert.deepEqual(w.query.groups.map((g) => g.filters[0].field), ["aboveSma200"]);
  assert.equal(w.dropped.length, 3);
  assert.equal(M.stateFromParams({ rsi: "150" }).rsiMax, null, "RSI-Grenze ausserhalb 0..100 wird ignoriert");
});

test("Filter-Pills verweisen nur auf Katalogwerte", () => {
  for (const p of M.PATTERN_PILLS) for (const t of p.types) assert.ok(Q.FORMATION_TYPES[t], p.id + ": " + t);
  for (const p of M.TREND_PILLS) assert.ok(Q.field(p.field) && Q.field(p.field).kind === "bool", p.id);
});

test("Gespeicherte Suchstrategien: lokal, begrenzt, robust gegen kaputten Speicher", () => {
  const mem = {}, storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  assert.deepEqual(M.loadScreens(storage), []);
  assert.ok(M.saveScreen(storage, "Dreiecke", "muster=dreieck", Date.UTC(2026, 9, 25)).ok);
  const list = M.loadScreens(storage);
  assert.equal(list.length, 1);
  assert.equal(list[0].params, "muster=dreieck");
  assert.ok(M.deleteScreen(storage, list[0].id));
  assert.deepEqual(M.loadScreens(storage), []);
  mem[M.STORE_KEY] = "{kaputt";
  assert.deepEqual(M.loadScreens(storage), []);
  assert.deepEqual(M.loadScreens(null), []);
  const locked = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.equal(M.saveScreen(locked, "x", "", 1).ok, false);
});

test("Befunde: Formationen mit Zustand, Indikatoren nur aus vorhandenen Werten", () => {
  const analysis = { formations: [{ id: "A", name: "Symmetrisches Dreieck", family: "TRIANGLE", direction: "BULLISH", state: "CONFIRMED", detectedAt: "2026-10-01", confirmedAt: "2026-10-20", levels: { breakout: 210.5, invalidation: 190 } }] };
  const f = M.findings(analysis, { sma200: 200, sma50: 220, rsi14: 72.3 }, 212.2);
  assert.equal(f[0].badge, "Bestätigt");
  assert.match(f[0].text, /Bestätigt am 20\.10\.2026\. Ausbruchsniveau 210,50 \$\. Ungültig unter 190,00 \$\./);
  assert.deepEqual(f.map((x) => x.id), ["A", "sma200", "cross", "rsi"], "ohne Volumenwert keine Volumenkarte");
  assert.equal(f.find((x) => x.id === "rsi").badge, "Überkauft");
  assert.equal(M.findings(null, {}, null).length, 0);
  assert.equal(M.hitSentence({ formations: [["RANGE_BREAKOUT", "CONFIRMED", "2026-10-22"], ["SYMMETRICAL_TRIANGLE", "DETECTED", "2026-10-12"]] }, ["SYMMETRICAL_TRIANGLE"]),
    "Symmetrisches Dreieck: in Bildung, erkannt am 12.10.2026.", "die gesuchte Formation zuerst");
});

test("Seite: Skripte existieren, Engines in Abhaengigkeitsreihenfolge, keine eigene Identitaetsbildung, keine Demo-Daten", () => {
  const html = readFileSync(join(root, "technical/index.html"), "utf8"), app = readFileSync(join(root, "technical/app.js"), "utf8");
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(existsSync(join(root, src)), src);
  assert.ok(html.indexOf("/core/identity.js") < html.indexOf("/core/stock-context.js"));
  assert.match(html, /<vu-navigation[^>]*theme-switch/);
  const engines = [...app.matchAll(/"(\/quant\/engines\/[^"]+\.js)"/g)].map((m) => m[1]);
  assert.ok(engines.length >= 10);
  for (const e of engines) assert.ok(existsSync(join(root, e)), e);
  const order = (name) => engines.findIndex((e) => e.endsWith(name));
  assert.ok(order("/hash.js") < order("feature-store.js") && order("elliott/patterns.js") < order("elliott-v2.js") && order("ti/context.js") < order("formations.js"));
  for (const file of ["technical/app.js", "technical/engine/model.js", "technical/ui/chart.js"]) {
    const src = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(src, /"ref_"\s*\+/, file + ": securityId nur ueber core/identity.js (ADR-001)");
    assert.doesNotMatch(src, /Math\.random\(\)\s*\*|mock|demo/i, file + ": keine Zufalls- oder Demo-Werte");
  }
  /* Kein Score-Feld; "Setup-Score" erscheint nur in der Methodik als ausdrueckliche Verneinung. */
  assert.doesNotMatch(app, /setupScore|opportunityScore|\.score\b/, "kein undokumentierter Score");
  assert.equal(app.split("Setup-Score").length - 1, 1);
  assert.match(app, /Es gibt keinen Setup-Score/);
});

test("Datensatz: Spalten gleich lang, Zaehler stimmen, jede Vorlage auswertbar", () => {
  const art = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "technical/data/meta.json"), "utf8"));
  assert.equal(art.schemaVersion, "vu-technical-screener-1.0.0");
  assert.equal(art.count, meta.counts.rows);
  assert.equal(art.asOf, meta.asOf);
  for (const [k, col] of Object.entries(art.cols)) assert.equal(col.length, art.count, k);
  const ds = Q.createDataset(art);
  for (const f of Q.FIELDS) for (const tf of f.tfs) assert.ok(ds.column(Q.columnKey(f.id, tf)), "Spalte fehlt: " + Q.columnKey(f.id, tf));
  for (const p of Q.PRESETS) { const r = Q.evaluate(ds, p.query); assert.ok(!r.error && r.count >= 0, p.id); }
  /* Keine erfundenen Werte: jeder Treffer hat einen echten Schlusskurs und ein Datum. */
  art.cols.close.forEach((c, i) => assert.ok(c > 0 && /^\d{4}-\d{2}-\d{2}$/.test(art.cols.asOf[i]), art.cols.s[i]));
  assert.ok(art.cols.s.includes("BRK-B") && art.cols.sid[art.cols.s.indexOf("BRK-B")] === "ref_BRK_B", "Identitaet ueber core/identity.js");
});

test("Tests liegen nicht in ausgelieferten Pfaden; Daten nur unter technical/data", () => {
  const files = readdirSync(join(root, "technical"), { recursive: true }).map(String);
  assert.ok(files.every((f) => !/\.test\.m?js$/.test(f) || f.startsWith("tests")));
  assert.deepEqual(readdirSync(join(root, "technical/data")).sort(), ["index-v1.json", "meta.json", "screener-v1.json"]);
});

test("Release-Stempel: jede verlinkte Datei der Technical-Seite traegt den Hash ihrer Bytes (offene Tabs holen neuen Code)", async () => {
  const { mkdtemp, mkdir, copyFile, readFile: rf, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { createHash } = await import("node:crypto");
  const R = await import(join(root, "scripts/vu2/release-id.mjs"));
  assert.ok(R.STAMP_ONLY.includes("technical"));
  const dir = await mkdtemp(join(tmpdir(), "tc-stamp-"));
  try {
    const html = readFileSync(join(root, "technical/index.html"), "utf8");
    const linked = [...html.matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css))"/g)].map((m) => m[1]);
    assert.ok(linked.includes("technical/app.js") && linked.includes("technical/technical.css"));
    for (const f of ["technical/index.html", ...linked]) { await mkdir(dirname(join(dir, f)), { recursive: true }); await copyFile(join(root, f), join(dir, f)); }
    const report = await R.stampTrees(dir, ["technical"]);
    assert.deepEqual(report, { pages: 1, changed: 1 });
    const out = await rf(join(dir, "technical/index.html"), "utf8");
    for (const f of linked) {
      const digest = createHash("sha256").update(readFileSync(join(root, f))).digest("hex").slice(0, 16);
      assert.ok(out.includes("/" + f + "?v=" + digest), f);
    }
    assert.doesNotMatch(out, /vu-release/, "kein Meta-Tag, kein Waechter");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Index fuer Startseite und Chart Studio: deckungsgleich mit dem Datensatz, ein Bruchteil der Groesse", () => {
  const art = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8"));
  const raw = readFileSync(join(root, "technical/data/index-v1.json"), "utf8"), ix = JSON.parse(raw);
  assert.equal(ix.schemaVersion, M.INDEX_SCHEMA);
  assert.deepEqual(ix, M.homeIndex(art), "Erzeuger und Rueckfall im Browser rechnen gleich");
  assert.deepEqual(ix.s, art.cols.s);
  assert.equal(ix.asOf, art.asOf);
  const ds = Q.createDataset(art);
  for (const p of Q.PRESETS) assert.equal(ix.presets[p.id], Q.evaluate(ds, p.query).count, p.id);
  for (const id of M.FOCUS.concat(M.RANKS)) assert.ok(Q.PRESETS.some((p) => p.id === id), id);
  assert.ok(ix.focusUnion > 0 && ix.focusUnion <= ix.count);
  assert.ok(raw.length * 10 < readFileSync(join(root, "technical/data/screener-v1.json")).length, "Index unter 10 % des Datensatzes");
  const app = readFileSync(join(root, "technical/app.js"), "utf8");
  assert.match(app, /function viewHome[\s\S]*?loadIndex\(\)/, "Startseite laedt den Index");
  const html = readFileSync(join(root, "technical/index.html"), "utf8");
  assert.doesNotMatch(html, /preload[^>]*screener-v1/, "der volle Datensatz wird nicht auf jeder Route vorgeladen");
});

test("Datenqualitaet: Kurssprung-Verdacht ist ein Datum oder null, Zaehler in meta.json stimmt", () => {
  const art = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "technical/data/meta.json"), "utf8"));
  const col = art.cols.suspectJumpAt;
  assert.equal(col.length, art.count);
  col.forEach((v, i) => assert.ok(v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= art.cols.asOf[i]), art.cols.s[i]));
  assert.equal(col.filter(Boolean).length, meta.counts.suspectJump60);
  assert.match(readFileSync(join(root, "technical/app.js"), "utf8"), /Kurssprung prüfen/);
});

test("Filter-Baukasten: Abfrage <-> Baukasten verlustfrei, Prozent-Eingabe, Standardzeilen fuer jedes Feld", () => {
  const QT = require(join(root, "quant/engines/technical/query-text.js"));
  const q = { timeframe: "1D", logic: "OR", groups: [{ op: "AND", filters: [{ field: "rsi14", op: "between", value: 30, value2: 50 }, { field: "formationActive", op: "in", value: ["DOUBLE_BOTTOM"] }] }, { op: "AND", filters: [{ field: "distSma200", op: "gt", value: -0.05 }] }] };
  const b = M.builderFromQuery(q);
  assert.equal(b.groups.length, 2);
  const back = Q.validate(M.queryFromBuilder(b)).query;
  assert.deepEqual(back.groups.map((g) => g.filters.map(({ id, ...f }) => f)), q.groups.map((g) => g.filters));
  assert.ok(QT.parse(QT.toText(back)).ok, "Baukasten -> kanonischer Text -> Parser");
  assert.equal(M.parseFieldInput("distSma200", "-5,5"), -0.055);
  assert.equal(M.formatFieldInput("distSma200", -0.055), "-5,5");
  assert.ok(Number.isNaN(M.parseFieldInput("rsi14", "abc")));
  for (const f of Q.FIELDS) { const r = M.defaultRow(f.id); assert.ok(Q.validate({ timeframe: f.tfs[0], groups: [{ filters: [r] }] }).ok, f.id); }
  /* Mehrere UND-Gruppen werden zu einer (UND bindet ohnehin). */
  assert.equal(M.builderFromQuery({ timeframe: "1W", logic: "AND", groups: [{ filters: [{ field: "aboveSma200", op: "is", value: true }] }, { filters: [{ field: "rsi14", op: "gt", value: 50 }] }] }).groups.length, 1);
});

test("Gespeicherte Suchstrategien: umbenennen, exportieren, importieren (validiert, ohne Dubletten)", () => {
  const mem = {}, st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const a = M.saveScreen(st, "RSI tief", "q=" + encodeURIComponent("rsi14 < 30"), 1000);
  M.saveScreen(st, "Breakout", "preset=breakout", 2000);
  assert.ok(M.updateScreen(st, a.id, { name: "  RSI unter 30  " }, 3000));
  const one = M.loadScreens(st).find((x) => x.id === a.id);
  assert.equal(one.name, "RSI unter 30"); assert.ok(one.updatedAt);
  assert.equal(M.updateScreen(st, "gibt-es-nicht", { name: "x" }), false);
  const exp = M.exportScreens(st);
  const mem2 = {}, st2 = { getItem: (k) => mem2[k] ?? null, setItem: (k, v) => { mem2[k] = v; } };
  assert.deepEqual(M.importScreens(st2, exp, 5000), { ok: true, added: 2, skipped: 0 });
  assert.deepEqual(M.importScreens(st2, exp, 6000), { ok: true, added: 0, skipped: 2 }, "keine Dubletten");
  const bad = JSON.stringify({ format: "vu-technical-screens-1", screens: [{ name: "x", params: "evil=1" }, { name: "", params: "preset=trend" }] });
  assert.deepEqual(M.importScreens(st2, bad, 7000), { ok: true, added: 0, skipped: 2 }, "unbekannte Parameter und leere Namen");
  assert.equal(M.importScreens(st2, "{kaputt").error, "KEIN_JSON");
  assert.equal(M.importScreens(st2, JSON.stringify({ screens: [] })).error, "FORMAT");
});

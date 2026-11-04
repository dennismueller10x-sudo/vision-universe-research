/* Chart Studio: "Diese Aktie in Quant und Supertrader" (technical/engine/world-context.js).
   Prueft, dass Technical nur liest: Stufen und Satz aus der Quant-Engine, Zustands-, Stufen- und Statusnamen aus den
   Supertrader-Artefakten, keine Zahl, keine Gesamtnote, kein "freigegeben" ohne Beleg. Die Pruefungen gegen echte
   Artefakte waehlen ihre Titel aus den Daten selbst, damit ein neuer Datenlauf sie nicht bricht. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WC = require(join(root, "technical/engine/world-context.js"));
const FE = require(join(root, "quant/engines/factor-evidence.js"));
const M = require(join(root, "technical/engine/model.js"));
const Identity = require(join(root, "core/identity.js"));
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const gz = (p) => JSON.parse(gunzipSync(readFileSync(join(root, p))).toString("utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));

function quantShardWith(predicate) {
  for (const key of ["NV", "AA", "MS", "AM", "GO"]) {
    const p = "quant/data/product/factor-evidence-v1/" + key + ".json.gz";
    if (!existsSync(join(root, p))) continue;
    const shard = gz(p);
    const t = Object.keys(shard.securities).find((k) => predicate(shard.securities[k]));
    if (t) return { shard, key, t };
  }
  return null;
}

test("Pfade: Quant-Scherbe wie Quant (technicalShard), Research-Scherbe ueber core/identity.js", () => {
  const P = WC.paths("BRK-B", { quant: M.technicalShard("BRK-B"), sf: Identity.shardKey("BRK-B") });
  assert.equal(P.quant, "/quant/data/product/factor-evidence-v1/BR.json.gz");
  assert.equal(P.supertrader, "/supertrader/data/stock/BRK-B.json");
  assert.equal(P.sfShard, "/supertrader/data/sf-candidates/ticker/BR.json");
  assert.equal(WC.paths("A", { sf: Identity.shardKey("A") }).sfShard, "/supertrader/data/sf-candidates/ticker/A_.json");
  assert.equal(WC.paths("NVDA").sfShard, null, "ohne Schluessel keine geratene Adresse");
});

test("Quant: Stufen und Satz unveraendert aus der Quant-Engine, keine Zahl, keine Gesamtnote", () => {
  const hit = quantShardWith((r) => Object.values(r.factors || {}).filter((f) => f.state === "AVAILABLE").length >= 3);
  assert.ok(hit, "keine Quant-Scherbe mit bewerteten Titeln");
  const { shard, key, t } = hit;
  const q = WC.quant(shard, key, t, FE);
  assert.equal(q.state, "AVAILABLE");
  const rec = FE.hydrate(shard.securities[t], shard);
  assert.equal(q.sentence, FE.summarySentence(rec));
  const expected = FE.ordered(rec).filter((f) => f.state === "AVAILABLE" && f.band).map((f) => ({ id: f.id, label: f.label, band: f.band, bandLabel: f.bandLabel }));
  assert.deepEqual(q.factors, expected);
  assert.ok(q.factors.length >= 1);
  assert.equal(q.missing + FE.ordered(rec).filter((f) => f.state === "AVAILABLE").length, 7);
  assert.equal(q.publication.compositeAllowed, false);
  assert.equal(q.publication.rankingAllowed, false);
  assert.doesNotMatch(JSON.stringify(q), /"score"|"position"|"rank"/, "Technical gibt keine Quant-Zahl weiter");
});

test("Quant: Vertragsbruch, fehlender Titel und Veroeffentlichungsregel fuehren zu keiner Angabe", () => {
  const { shard, key, t } = quantShardWith(() => true);
  assert.equal(WC.quant(shard, key, "ZZZZZZ", FE).reason, "NOT_COVERED");
  assert.equal(WC.quant(shard, key === "NV" ? "AA" : "NV", t, FE).reason, "INVALID_ARTIFACT", "falsche Scherbe");
  assert.equal(WC.quant(null, key, t, FE).reason, "SOURCE_MISSING");
  assert.equal(WC.quant(shard, key, t, null).reason, "ENGINE_MISSING");
  const opened = clone(shard); opened.publication.compositeAllowed = true;
  assert.equal(WC.quant(opened, key, t, FE).reason, "INVALID_ARTIFACT", "eine freigeschaltete Gesamtnote ist nicht dieser Vertrag");
  const leaked = clone(shard); leaked.securities[t].quantScore = 81;
  assert.equal(WC.quant(leaked, key, t, FE).reason, "PUBLICATION_GATE_VIOLATED");
});

/* ------------------------------------------------------------ Supertrader */
const registry = json("supertrader/data/registry-core.json");
const build = json("supertrader/data/build.json");

test("Supertrader: echte Aktienseiten, Zustandsnamen aus registry.lifecycle.labels, Protokoll nur gezaehlt", () => {
  let checked = 0, withCurrent = 0;
  for (const T of build.slices.stock) {
    const slice = json("supertrader/data/stock/" + T + ".json");
    const s = WC.supertrader(slice, registry, T);
    assert.equal(s.state, "AVAILABLE", T);
    const rows = slice.bySymbol[T] || [];
    assert.equal(s.current.length + s.history, rows.length, T);
    assert.equal(s.history, rows.filter((r) => WC.FINAL.includes(r.state)).length, T);
    for (const c of s.current) {
      const strat = registry.strategies.find((x) => x.strategy_id === c.strategyId);
      assert.ok(strat, c.strategyId);
      assert.equal(c.name, strat.world_name);
      const allowed = c.state === "PARTIAL_CHECK" ? [strat.evidence.presentationLabel] : [registry.lifecycle.labels[c.state], "Modellbeobachtung", strat.watchlist_label].filter(Boolean);
      assert.ok(allowed.includes(c.stateLabel), T + " " + c.state + " -> " + c.stateLabel);
      if (strat.evidence) assert.equal(c.presentationLabel, strat.evidence.presentationLabel);
      withCurrent++;
    }
    checked++;
  }
  assert.ok(checked >= 100 && withCurrent >= 1, "Stichprobe zu klein: " + checked + "/" + withCurrent);
});

function syntheticSlice(T, strategyId, state, extra) {
  return { schema: "supertrader-signals-1.0.0", symbol: T, bySymbol: { [T]: [{ strategyId, id: "X:1", state }] },
    strategies: { [strategyId]: { lastProcessed: "2026-11-02", open: [Object.assign({ id: "X:1", state, transitions: [{ state, date: "2026-10-30" }] }, extra || {})], closed: [] } } };
}

test("Supertrader: wartendes Setup einer Forschungsstrategie heisst Modellbeobachtung, nie Einstieg vorbereitet", () => {
  const research = registry.strategies.find((s) => s.evidence && s.evidence.presentation === "RESEARCH");
  assert.ok(research);
  for (const state of ["SETUP", "ENTRY_READY"]) {
    const s = WC.supertrader(syntheticSlice("TEST", research.strategy_id, state), registry, "TEST");
    assert.equal(s.current[0].stateLabel, "Modellbeobachtung");
    assert.equal(s.current[0].since, "2026-10-30");
    assert.equal(s.lastProcessed, "2026-11-02");
  }
  const active = WC.supertrader(syntheticSlice("TEST", research.strategy_id, "ACTIVE"), registry, "TEST");
  assert.equal(active.current[0].stateLabel, registry.lifecycle.labels.ACTIVE);
  /* Beobachtungsliste einer nicht forschenden Strategie: deren eigener Name. */
  const reg2 = clone(registry), w = reg2.strategies.find((s) => s.strategy_id === research.strategy_id);
  w.evidence.presentation = "CURRENT"; w.pending_semantics = "WATCHLIST"; w.watchlist_label = "Beobachtung · Test";
  assert.equal(WC.supertrader(syntheticSlice("TEST", w.strategy_id, "SETUP"), reg2, "TEST").current[0].stateLabel, "Beobachtung · Test");
});

test("Supertrader: ohne Seite, fremdes Kuerzel oder ohne Registry keine Angabe", () => {
  const T = build.slices.stock[0], slice = json("supertrader/data/stock/" + T + ".json");
  assert.equal(WC.supertrader(null, registry, T).reason, "NOT_COVERED");
  assert.equal(WC.supertrader(slice, registry, T === "AAPL" ? "MSFT" : "AAPL").reason, "INVALID_ARTIFACT");
  assert.equal(WC.supertrader(slice, null, T).reason, "REGISTRY_MISSING");
  assert.equal(WC.supertrader(slice, { schema: "anders" }, T).reason, "REGISTRY_MISSING");
});

/* ------------------------------------------------- quellentreue Research */
const summary = json("supertrader/data/sf-candidates/summary.json");

test("Research: Stufennamen aus summary.stageLabels, Methodennamen aus summary.strategies, Status ohne Freigabe", () => {
  const shardKey = summary.tickerShards.find((k) => existsSync(join(root, "supertrader/data/sf-candidates/ticker/" + k + ".json")));
  const shard = json("supertrader/data/sf-candidates/ticker/" + shardKey + ".json");
  const T = shard.views[0].ticker;
  assert.equal(Identity.shardKey(T), shardKey, "Scherbe ueber core/identity.js");
  const r = WC.research(summary, shard, T, summary.nextSession);
  assert.equal(r.state, "AVAILABLE");
  assert.equal(r.asOf, summary.asOf);
  assert.equal(r.views.length, shard.views.filter((v) => v.ticker === T).length);
  for (const v of r.views) {
    assert.equal(v.stageLabel, summary.stageLabels[v.stage].name);
    assert.equal(v.name, summary.strategies.find((s) => s.strategyId === v.strategyId).name);
  }
  /* Kein Text behauptet eine Freigabe: jeder Statuscode erscheint mit seinem Wortlaut oder unveraendert. */
  const st = summary.status;
  assert.deepEqual(r.status, [st.certification, st.liveReadiness].filter(Boolean).map((c) => WC.STATUS_TXT[c] || c));
  for (const line of r.status) assert.doesNotMatch(line, /^(zertifiziert|freigegeben)/);
  if (/^LOCKED/.test(st.validatedTradeSignal || "")) assert.equal(r.locked, summary.stageLabels.VALIDATED_TRADE_SIGNAL ? summary.stageLabels.VALIDATED_TRADE_SIGNAL.name : "VALIDATED_TRADE_SIGNAL");
});

test("Research: \"nicht aktuell\" nach derselben Regel wie sf-research.js#stale, unbekannte Codes bleiben sichtbar", () => {
  const s = { schema: "supertrader-sf8-candidates-1.0.0", asOf: "2026-10-30", nextSession: "2026-11-02", stageLabels: {}, strategies: [], status: { certification: "NEUER_CODE", liveReadiness: "LIVE_NOT_APPROVED" } };
  assert.equal(WC.research(s, null, "NVDA", "2026-11-02").stale, false, "am Tag der naechsten Sitzung noch aktuell");
  assert.equal(WC.research(s, null, "NVDA", "2026-11-03").stale, true);
  assert.deepEqual(WC.research(s, null, "NVDA", "2026-11-03").status, ["NEUER_CODE", "nicht für den Live-Betrieb freigegeben"]);
  assert.deepEqual(WC.research(s, null, "NVDA", "2026-11-03").views, [], "Scherbe nicht gelistet: keine Methode erkennt die Aktie");
  assert.equal(WC.research(null, null, "NVDA", "2026-11-03").reason, "SOURCE_MISSING");
  assert.equal(WC.research(s, { schema: "anders" }, "NVDA", "2026-11-03").reason, "INVALID_ARTIFACT");
  const sfSrc = readFileSync(join(root, "supertrader/assets/sf-research.js"), "utf8");
  assert.match(sfSrc, /function stale\(sum\) \{ return !!\(sum && sum\.nextSession && new Date\(\)\.toISOString\(\)\.slice\(0, 10\) > String\(sum\.nextSession\)\.slice\(0, 10\)\); \}/,
    "Regel in Supertrader geaendert: world-context.js#stale nachziehen");
});

test("Seite: Modul eingebunden, Abschnitt im Chart Studio und in Signale, keine eigene Identitaet und keine Quant-Zahl", () => {
  const html = readFileSync(join(root, "technical/index.html"), "utf8"), app = readFileSync(join(root, "technical/app.js"), "utf8");
  assert.ok(html.indexOf("/technical/engine/model.js") < html.indexOf("/technical/engine/world-context.js") && html.indexOf("/technical/engine/world-context.js") < html.indexOf("/technical/app.js"));
  assert.match(app, /"\/quant\/engines\/factor-evidence\.js"/, "Quant-Stufen ueber die Quant-Engine");
  assert.match(app, /worlds: worlds/);
  assert.match(app, /renderSignals\(body, [^)]*worlds\)/);
  assert.match(app, /SCX\.href\(SCX\.fromUs\(T\), product\)/, "Adressen ueber core/stock-context.js");
  const wc = readFileSync(join(root, "technical/engine/world-context.js"), "utf8");
  assert.doesNotMatch(wc, /"ref_"\s*\+/);
  assert.doesNotMatch(wc, /Math\.random|mock|demo/i);
});

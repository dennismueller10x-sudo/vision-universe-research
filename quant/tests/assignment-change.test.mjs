/* =========================================================================
   EINE REGEL, DREI LESER.

   §20 sagt: Screening-Regel = Signal-Regel = Alarm-Regel = Strategie-Regel.
   Bisher stand das als Absicht im Vertrag. Pruefbar wird es an dem Punkt, an
   dem zwei Leser dasselbe sagen muessen: der Zuordnungswechsel, den der
   Strategie-Index veroeffentlicht, und der Wechsel, den der Alarm-Vertrag
   ueber dasselbe Praedikat ausrechnet.

   Gemessen am 25.09.2026 zwischen den veroeffentlichten Staenden 2026-09-23
   und 2026-09-24: 37 Wechsel, 36 betroffene Titel von 6.437 - und ueber
   6.357 vergleichbare Titel keine einzige Abweichung zwischen Engine und
   Alarm-Vertrag, bei identischem predicateHash.

   Zwei Ehrlichkeiten haengen daran:

     1. Ein Titel, der im vorigen Stand fehlt, wechselt NICHT. Sonst waere
        jeder neu aufgenommene Titel ein "neu erfuellt", das nie gemessen
        wurde.
     2. Ein Wechsel ist eine Beobachtung zwischen zwei VEROEFFENTLICHTEN
        Staenden - kein Ereignis von heute. Die Oberflaeche muss das sagen,
        nicht nur der Kommentar hier.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url).pathname;
const StrategyMatch = require(join(root, "quant/engines/strategy-match.js"));
const Rules = require(join(root, "quant/engines/rule-contract.js"));
const Alerts = require(join(root, "quant/api/alert-rule-contract.js"));
const Query = require(join(root, "quant/engines/query.js"));
const Service = require(join(root, "quant/api/product-services.js"));
const Policy = require(join(root, "quant/engines/display-policy.js"));
const contract = JSON.parse(readFileSync(join(root, "quant/methodology/strategy-profiles-v1.json"), "utf8"));

const HIST = join(root, "quant/data/product/factor-evidence-history");
function hydrate(payload) {
  const fields = payload.fields || [];
  return Object.keys(payload.rows || {}).map((ticker) => {
    const row = { ticker }, values = payload.rows[ticker];
    fields.forEach((field, i) => { row[field] = values[i]; });
    return row;
  });
}
function reihe() {
  const index = JSON.parse(readFileSync(join(HIST, "index.json"), "utf8"));
  return ((index.series || {})[contract.evidenceMethodologyVersion] || []).slice().sort();
}
function snapshot(datum) {
  return hydrate(JSON.parse(gunzipSync(readFileSync(
    join(HIST, contract.evidenceMethodologyVersion, datum + ".json.gz"))).toString("utf8")));
}

/* ------------------------------------------- 1. Die Gegenprobe zu §20 */

test("the published assignment change is what the alert contract computes", () => {
  const dates = reihe();
  if (dates.length < 2) return;   /* Vor dem zweiten Stand gibt es nichts zu vergleichen. */
  const alt = snapshot(dates.at(-2)), neu = snapshot(dates.at(-1));
  const transitions = StrategyMatch.assignmentTransitions(contract, alt, neu);
  const altIndex = new Map(alt.map((row) => [row.ticker, row]));

  let geprueft = 0, wechsel = 0;
  for (const entry of transitions) {
    const profile = contract.profiles.find((p) => p.profileId === entry.profileId);
    const predicate = Rules.create({ universe: StrategyMatch.UNIVERSE,
      filters: StrategyMatch.screenQuery(profile).filters });
    const alert = Alerts.create({ alertId: entry.profileId, predicate });
    /* Derselbe Hash auf beiden Seiten - sonst sind es zwei Regeln mit einem
       Namen, und der ganze Vergleich darunter beweist nichts. */
    assert.equal(alert.predicateHash, entry.predicateHash,
      "der Alarm-Vertrag und die Zuordnung tragen fuer " + entry.profileId + " verschiedene Hashes");

    const rein = new Set(entry.entered), raus = new Set(entry.exited);
    for (const row of neu) {
      const davor = altIndex.get(row.ticker);
      if (!davor) {
        assert.equal(rein.has(row.ticker), false,
          row.ticker + " fehlt im vorigen Stand und darf nicht als Wechsel gelten");
        continue;
      }
      geprueft += 1;
      const ausVertrag = Alerts.evaluate(alert, davor, row, { observedAt: dates.at(-1) });
      const code = ausVertrag ? ausVertrag.transition : null;
      const veroeffentlicht = rein.has(row.ticker) ? "ENTERED" : raus.has(row.ticker) ? "EXITED" : null;
      assert.equal(code, veroeffentlicht,
        row.ticker + " / " + entry.profileId + ": Alarm-Vertrag " + code + ", veroeffentlicht " + veroeffentlicht);
      if (veroeffentlicht) wechsel += 1;
    }
  }
  assert.ok(geprueft > 1000, "zu wenige Titel verglichen: " + geprueft);
  assert.ok(wechsel > 0, "ueber zwei Staende wurde kein einziger Wechsel gefunden - das waere verdaechtig");
});

test("a title missing from the previous snapshot is not a transition", () => {
  const filters = StrategyMatch.screenQuery(contract.profiles[0]).filters;
  const feld = filters[0].field;
  const passend = { ticker: "AAA" }, unpassend = { ticker: "BBB" };
  passend[feld] = 100; unpassend[feld] = 0;
  /* NEU ist nur im jetzigen Stand und erfuellt das Profil. Ohne die
     Vergleichbarkeitsregel waere das ein "neu erfuellt", das niemand
     gemessen hat. */
  const neu = { ticker: "NEU" }; neu[feld] = 100;
  const transitions = StrategyMatch.assignmentTransitions(contract, [passend, unpassend],
    [passend, unpassend, neu]);
  const erste = transitions[0];
  assert.equal(erste.entered.includes("NEU"), false);
  assert.equal(erste.exited.includes("NEU"), false);
  assert.equal(erste.notComparable, 1);
});

test("the change is symmetric with what the predicate says today", () => {
  const dates = reihe();
  if (dates.length < 2) return;
  const alt = snapshot(dates.at(-2)), neu = snapshot(dates.at(-1));
  const transitions = StrategyMatch.assignmentTransitions(contract, alt, neu);
  const neuIndex = new Map(neu.map((row) => [row.ticker, row]));
  for (const entry of transitions) {
    const profile = contract.profiles.find((p) => p.profileId === entry.profileId);
    const filters = StrategyMatch.screenQuery(profile).filters;
    /* Wer neu erfuellt, muss heute erfuellen. Wer nicht mehr erfuellt, darf
       heute nicht erfuellen. Eine Wechselliste, die dem heutigen Zustand
       widerspricht, waere schlimmer als keine. */
    for (const ticker of entry.entered) {
      assert.equal(Query.matches(neuIndex.get(ticker), filters), true,
        ticker + " gilt als neu erfuellt, erfuellt " + entry.profileId + " heute aber nicht");
    }
    for (const ticker of entry.exited) {
      assert.equal(Query.matches(neuIndex.get(ticker), filters), false,
        ticker + " gilt als nicht mehr erfuellt, erfuellt " + entry.profileId + " heute aber doch");
    }
  }
});

/* --------------------- 1b. Was verglichen wird, steht am Artefakt */

test("the index names which two things it compares, because they are not two snapshots", () => {
  /* Die eine Seite ist der eingefrorene Snapshot des from-Tages. Die andere
     ist die Tabelle, die der Index HEUTE veroeffentlicht - dieselbe, aus der
     die Mitgliederlisten stammen. Gemessen am 25.09.2026 unterscheiden sich
     3.144 von 6.437 Zeilen zwischen dem veroeffentlichten 09-24-Snapshot und
     der heutigen Neuberechnung, weil Faktoren Perzentile sind. Wer die
     Wechsel aus zwei Snapshot-Dateien nachrechnet, bekommt eine andere Zahl -
     und soll wissen, warum. */
  const index = JSON.parse(gunzipSync(readFileSync(
    join(root, "quant/data/product/strategy-index-v1.json.gz"))).toString("utf8"));
  const hist = index.historicalEvidence;
  if (hist.state !== "AVAILABLE") return;
  assert.equal(hist.toBasis, "CURRENT_PUBLISHED_TABLE");
  assert.match(hist.transitionNote, /heute veroeffentlicht/);
  assert.match(hist.transitionNote, /recomputationDrift/);
  /* Und die Abweichung ist wirklich ausgewiesen, nicht nur erwaehnt. */
  const factors = JSON.parse(readFileSync(
    join(root, "quant/data/product/factor-evidence-v1/summary.json"), "utf8"));
  const drift = factors.snapshotHistory && factors.snapshotHistory.recomputationDrift;
  if (drift) {
    assert.ok(Number.isFinite(drift.rowsDiffering) && Number.isFinite(drift.rowsTotal));
    assert.ok(drift.publishedHash && drift.recomputedHash);
  }
});

/* ------------------------------------------- 2. Der veroeffentlichte Index */

test("the strategy index publishes the transitions next to the persistence", () => {
  const index = JSON.parse(gunzipSync(readFileSync(
    join(root, "quant/data/product/strategy-index-v1.json.gz"))).toString("utf8"));
  const hist = index.historicalEvidence;
  if (hist.state !== "AVAILABLE") return;
  assert.ok(Array.isArray(hist.transitions), "der Index fuehrt keine Wechselliste");
  assert.equal(hist.transitions.length, index.profiles.length);
  /* Quote und Namen muessen dieselbe Rechnung sein. stillMatching zaehlt
     die Gebliebenen, exited die Gegangenen - zusammen die Vergleichbaren. */
  const quote = new Map(hist.profiles.map((p) => [p.profileId, p]));
  for (const entry of hist.transitions) {
    const p = quote.get(entry.profileId);
    assert.ok(p, "kein Bestaendigkeitseintrag zu " + entry.profileId);
    assert.equal(p.stillMatching + entry.exited.length, p.comparable,
      entry.profileId + ": " + p.stillMatching + " geblieben + " + entry.exited.length +
      " gegangen ergibt nicht " + p.comparable + " vergleichbare");
  }
  assert.match(hist.transitionNote, new RegExp(hist.from));
  assert.match(hist.transitionNote, new RegExp(hist.to));
});

/* ------------------------------------------- 3. Der Dienst und die Sprache */

function api() {
  return Service.create({
    loadJSON: async (path) => JSON.parse(readFileSync(join(root, path.slice(1)), "utf8")),
    loadCompressedJSON: async (path) => JSON.parse(gunzipSync(readFileSync(join(root, path.slice(1))))),
    displayPolicy: Policy, queryEngine: require(join(root, "quant/engines/query.js"))
  });
}

test("the service answers all three cases, and a change names its two dates", async () => {
  const index = JSON.parse(gunzipSync(readFileSync(
    join(root, "quant/data/product/strategy-index-v1.json.gz"))).toString("utf8"));
  const hist = index.historicalEvidence;
  if (hist.state !== "AVAILABLE") return;
  const service = api();

  const bewegt = (hist.transitions.find((t) => t.exited.length) || {}).exited?.[0]
    || (hist.transitions.find((t) => t.entered.length) || {}).entered?.[0];
  assert.ok(bewegt, "kein gewechselter Titel im Index");
  const change = await service.getAssignmentChange(bewegt);
  assert.equal(change.state, "CHANGED");
  assert.equal(change.from, hist.from);
  assert.equal(change.to, hist.to);
  assert.ok(change.entered.length + change.exited.length > 0);
  for (const entry of [...change.entered, ...change.exited]) {
    assert.ok(entry.label && entry.label !== entry.profileId,
      "der Wechsel nennt einen internen Profilnamen statt seines Labels: " + entry.profileId);
    assert.match(entry.predicateHash, /^rule_[0-9a-f]{16}$/);
  }
  /* Und was er NICHT ist, steht an den Daten und nicht nur im Text. */
  assert.deepEqual(change.isNot, ["EVENT_TODAY", "FORECAST", "RETURN", "SIGNAL"]);

  const alleBewegten = new Set(hist.transitions.flatMap((t) => [...t.entered, ...t.exited]));
  const ruhig = index.profiles.flatMap((p) => p.tickers || []).find((t) => !alleBewegten.has(t));
  assert.ok(ruhig, "kein unveraenderter Titel gefunden");
  const ohne = await service.getAssignmentChange(ruhig);
  assert.equal(ohne.state, "NO_CHANGE", "ein unveraenderter Titel muss 'nichts geaendert' sagen, nicht schweigen");
  assert.equal(await service.getAssignmentChange("nicht valide"), null);
});

/* Die Zeile ausgefuehrt und nicht nur gelesen: el() wird durch ein Doppel
   ersetzt, das Klasse und Text festhaelt. Geprueft wird der Satz. */
function surfaceLine() {
  const source = readFileSync(join(root, "vu2/experience.js"), "utf8");
  const von = source.indexOf("function assignmentChangeLine("), bis = source.indexOf("function strategyMatchSection(", von);
  assert.ok(von > 0 && bis > von, "die Wechselzeile steht nicht mehr in experience.js");
  const el = (tag, attrs) => ({ tag, ...attrs });
  return new Function("el", source.slice(von, bis) + "\nreturn assignmentChangeLine;")(el);
}

test("all three cases reach the reader in plain words", () => {
  const line = surfaceLine();
  const label = (id, l) => ({ profileId: id, label: l, predicateHash: "rule_0000000000000000" });
  /* Nichts geaendert ist eine Antwort und steht ausdruecklich da. */
  const ruhig = line({ state: "NO_CHANGE", from: "2026-09-23", to: "2026-09-24", entered: [], exited: [] });
  assert.match(ruhig.text, /nichts geändert/);
  assert.match(ruhig.text, /2026-09-23/);
  assert.match(ruhig.text, /2026-09-24/);
  /* Rein, raus, und beides zusammen - jeweils mit dem Profilnamen, den ein
     Leser kennt, nie mit der internen Kennung. */
  const rein = line({ state: "CHANGED", from: "2026-09-23", to: "2026-09-24",
    entered: [label("momentum-leader", "Momentum Leader")], exited: [] });
  assert.match(rein.text, /neu erfüllt: Momentum Leader/);
  assert.equal(/momentum-leader/.test(rein.text), false, "die interne Kennung steht im Satz");
  const raus = line({ state: "CHANGED", from: "2026-09-23", to: "2026-09-24",
    entered: [], exited: [label("garp", "GARP")] });
  assert.match(raus.text, /nicht mehr erfüllt: GARP/);
  const beides = line({ state: "CHANGED", from: "2026-09-23", to: "2026-09-24",
    entered: [label("garp", "GARP")], exited: [label("momentum-leader", "Momentum Leader")] });
  assert.match(beides.text, /neu erfüllt: GARP/);
  assert.match(beides.text, /nicht mehr erfüllt: Momentum Leader/);
  /* Und in jedem Fall der Satz, der sagt, was es nicht ist. */
  for (const zeile of [rein, raus, beides]) assert.match(zeile.text, /kein Ereignis von heute/);
  /* Ohne Auskunft keine Zeile: vor dem zweiten veroeffentlichten Stand. */
  assert.equal(line(null), null);
  assert.equal(line({ state: "PENDING" }), null);
});

test("the surface sentence names the two published states and calls itself no event", () => {
  const source = readFileSync(join(root, "vu2/experience.js"), "utf8");
  const von = source.indexOf("function assignmentChangeLine(");
  const bis = source.indexOf("function strategyMatchSection(", von);
  assert.ok(von > 0 && bis > von, "die Wechselzeile steht nicht mehr in experience.js");
  const block = source.slice(von, bis);
  /* Beide Staende im Satz - "seit gestern" ohne Datum liest sich wie ein
     Ereignis von heute. */
  assert.match(block, /change\.from/);
  assert.match(block, /change\.to/);
  assert.match(block, /kein Ereignis von heute/);
  assert.match(block, /keine Prognose/);
  /* Kein roher Zustand im Satz. */
  assert.equal(/'[^']*\b(ENTERED|EXITED|CHANGED|NO_CHANGE)\b[^']*'/.test(block.replace(/change\.state!?==?='(CHANGED|NO_CHANGE)'/g, "")), false,
    "ein roher Zustandsname steht im Satz");
});

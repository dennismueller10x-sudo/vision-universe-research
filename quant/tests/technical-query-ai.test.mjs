/* Suche in Worten mit Sprachmodell: nur Mock-Antworten, kein Netzwerk. Die Query-Engine bleibt die einzige ausfuehrende Instanz. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AI = require("../engines/technical/query-ai.js");
const QT = require("../engines/technical/query-text.js");
const gold = JSON.parse(readFileSync(new URL("./fixtures/technical-query-gold.json", import.meta.url), "utf8"));
const q = (filters, tf) => ({ timeframe: tf || "1D", logic: "AND", groups: [{ op: "AND", filters }] });

test("KI-Suche: standardmaessig aus - kein Anbieteraufruf, regelbasiertes Ergebnis", async () => {
  let called = 0;
  const s = AI.createSearch({ provider: () => { called++; return {}; } });
  const r = await s.search("RSI unter 40 über der SMA 200");
  assert.equal(called, 0); assert.equal(r.source, "rules"); assert.equal(r.status, "REVIEW");
  assert.equal(r.issues[0].code, "DISABLED"); assert.equal(r.canonical, QT.parse("RSI unter 40 über der SMA 200").canonical);
  const none = await AI.createSearch().search("RSI unter 40");
  assert.equal(none.status, "OK"); assert.deepEqual(none.issues, []);
  assert.equal(AI.DEFAULTS.enabled, false);
});

test("KI-Suche: gueltige Antwort, die dem Regelparser entspricht, ist OK", async () => {
  const text = "RSI unter 40 und Abstand zum 52-Wochen-Hoch über -5 %";
  const s = AI.createSearch({ config: { enabled: true }, provider: (req) => {
    assert.equal(req.input, text); assert.ok(req.schema.properties.query); assert.ok(req.maxOutputTokens <= 800);
    return Promise.resolve(JSON.stringify({ query: q([{ field: "rsi14", op: "lt", value: 40 }, { field: "distHigh52w", op: "gt", value: -0.05 }]), unmapped: [] }));
  } });
  const r = await s.search(text);
  assert.equal(r.source, "model"); assert.equal(r.status, "OK"); assert.equal(r.canonical, QT.parse(text).canonical);
});

test("KI-Suche: erfundenes Feld oder Operator wird abgelehnt und nicht ausgefuehrt (Rueckfall Regeln)", async () => {
  for (const bad of [q([{ field: "peRatio", op: "lt", value: 15 }]), q([{ field: "rsi14", op: "is", value: true }]), q([{ field: "formationConfirmed", op: "in", value: ["CUP_AND_HANDLE_X"] }])]) {
    const r = AI.interpret("KGV unter 15", { query: bad, unmapped: [] });
    assert.equal(r.status, "REJECTED"); assert.equal(r.query, null); assert.equal(r.issues[0].code, "INVALID");
  }
  const s = AI.createSearch({ config: { enabled: true }, provider: async () => ({ query: q([{ field: "peRatio", op: "lt", value: 15 }]), unmapped: [] }) });
  const r = await s.search("KGV unter 15");
  assert.equal(r.source, "rules"); assert.equal(r.issues[0].code, "MODEL_REJECTED"); assert.equal(r.model.status, "REJECTED");
});

test("KI-Suche: angenommene Schwelle wird sichtbar (nicht erfunden und still)", () => {
  const r = AI.interpret("günstige Einstiegschance", { query: q([{ field: "rsi14", op: "lt", value: 30 }]), unmapped: [] });
  assert.equal(r.status, "REVIEW"); assert.ok(r.issues.some((i) => i.code === "ASSUMED_THRESHOLD"));
  const ok = AI.interpret("RSI unter 30", { query: q([{ field: "rsi14", op: "lt", value: 30 }]), unmapped: [] });
  assert.ok(!ok.issues.some((i) => i.code === "ASSUMED_THRESHOLD"));
  const pct = AI.interpret("höchstens 5 % unter dem 52-Wochen-Hoch", { query: q([{ field: "distHigh52w", op: "gte", value: -0.05 }]), unmapped: [] });
  assert.ok(!pct.issues.some((i) => i.code === "ASSUMED_THRESHOLD"), "Prozent als Anteil gilt als genannt");
  const term = AI.interpret("überverkauft", { query: q([{ field: "rsi14", op: "lt", value: 30 }]), unmapped: [] });
  assert.equal(term.status, "OK", "fest definierter Begriff des Regelparsers ist keine Annahme");
  const other = AI.interpret("überverkauft", { query: q([{ field: "rsi14", op: "lt", value: 25 }]), unmapped: [] });
  assert.ok(other.issues.some((i) => i.code === "ASSUMED_THRESHOLD"), "abweichende Schwelle zum Begriff bleibt Annahme");
});

test("KI-Suche: Mehrdeutigkeit und Abweichung vom Regelparser werden gemeldet", () => {
  const r = AI.interpret("Aufwärtstrend mit hohem Volumen", { query: q([{ field: "aboveSma200", op: "is", value: true }]), unmapped: ["Aufwärtstrend"] });
  assert.equal(r.status, "REVIEW"); assert.equal(r.issues.find((i) => i.code === "UNMAPPED").text, "Aufwärtstrend");
  const d = AI.interpret("über der SMA 200", { query: q([{ field: "aboveSma50", op: "is", value: true }]), unmapped: [] });
  assert.ok(d.issues.some((i) => i.code === "DIFFERS_FROM_RULES"));
});

test("KI-Suche: kaputte Antwort, Zeitueberschreitung, Anbieterfehler, Budget und Laenge fallen sicher auf Regeln zurueck", async () => {
  const mal = await AI.createSearch({ config: { enabled: true }, provider: async () => "{nicht json" }).search("RSI unter 40");
  assert.equal(mal.source, "rules"); assert.equal(mal.issues[0].code, "MODEL_REJECTED"); assert.equal(mal.query.groups[0].filters[0].field, "rsi14");
  const slow = await AI.createSearch({ config: { enabled: true, timeoutMs: 20 }, provider: () => new Promise(() => {}) }).search("RSI unter 40");
  assert.equal(slow.issues[0].code, "TIMEOUT");
  const err = await AI.createSearch({ config: { enabled: true }, provider: () => Promise.reject(new Error("503")) }).search("RSI unter 40");
  assert.equal(err.issues[0].code, "PROVIDER_ERROR");
  let n = 0; const s = AI.createSearch({ config: { enabled: true, maxCalls: 2 }, provider: async () => { n++; return { query: q([{ field: "rsi14", op: "lt", value: 40 }]), unmapped: [] }; } });
  await s.search("RSI unter 40"); await s.search("RSI unter 40"); const third = await s.search("RSI unter 40");
  assert.equal(n, 2); assert.equal(third.issues[0].code, "BUDGET"); assert.equal(s.calls(), 2);
  const long = await AI.createSearch({ config: { enabled: true }, provider: async () => { throw new Error("darf nicht"); } }).search("RSI unter 40 ".repeat(40));
  assert.equal(long.issues[0].code, "TOO_LONG");
});

test("KI-Suche: Gold-Set mit Mock-Modell - abbildbare Saetze OK, nicht abbildbare nie still", () => {
  let ok = 0, silent = 0;
  for (const c of gold.cases) {
    const rules = QT.parse(c.q);
    if (c.expect) {
      const r = AI.interpret(c.q, { query: rules.query, unmapped: [] }); // Mock: Modell antwortet wie der Parser
      if (r.status === "OK") ok++;
    } else {
      const r = AI.interpret(c.q, { query: rules.query, unmapped: rules.unknown }); // Mock: Modell meldet Nicht-Abbildbares
      if (r.status === "OK") silent++;
    }
  }
  assert.equal(ok, gold.cases.filter((c) => c.expect).length);
  assert.equal(silent, 0);
});

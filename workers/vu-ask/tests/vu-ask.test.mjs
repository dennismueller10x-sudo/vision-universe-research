/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/tests/vu-ask.test.mjs

   Aus Pappe sind nur der Speicher des Durable Object und die Anthropic-
   API. Tor, Budget, Uebersetzung und Validierung laufen im Original.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { AskGate, cleanQuestion, cacheText } from "../src/gate.mjs";
import worker from "../src/index.mjs";
import { admit, costOf, limitsFrom, worstCase } from "../src/budget.mjs";
import { translate, statusOf } from "../src/translate.mjs";
import { OUTPUT_SCHEMA, FIELD_IDS, SYSTEM_PROMPT } from "../src/catalog.mjs";
import { buildRequest } from "../src/claude.mjs";

function memoryStorage() {
  const m = new Map();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    map: m,
    async get(k) { return Array.isArray(k) ? new Map(k.filter((x) => m.has(x)).map((x) => [x, clone(m.get(x))])) : clone(m.get(k)); },
    async put(k, v) { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, clone(b)); else m.set(k, clone(v)); },
    async delete(k) { for (const x of [].concat(k)) m.delete(x); },
    async list({ prefix = "", limit = Infinity, reverse = false } = {}) {
      let keys = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      if (reverse) keys.reverse();
      return new Map(keys.slice(0, limit).map((k) => [k, clone(m.get(k))]));
    },
  };
}

const MINERVINI_ANSWER = {
  kind: "screen", understood: "Aktien auf neuem 52-Wochen-Hoch mit 300 Mio. bis 2 Mrd. $ Marktkapitalisierung im Minervini-Raster.",
  filters: [
    { field: "newHigh52w", op: "is", value: null, value2: null, values: [], flag: true },
    { field: "marketCap", op: "between", value: 3e8, value2: 2e9, values: [], flag: null },
  ],
  tickers: [], show: ["qualityFactor", "growthFactor", "momentumFactor", "valueFactor"],
  supertrader: { strategy: "MINERVINI_VCP", mode: "require" },
  sort: { field: "marketCap", dir: "desc" }, limit: 25,
  missing: [{ wish: "Quant-Gesamtscore", type: "withheld" }], notes: [],
};

function anthropic(output, { status = 200, stop = "end_turn", usage = { input_tokens: 5000, output_tokens: 300 } } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (status !== 200) return new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status });
    return new Response(JSON.stringify({ stop_reason: stop, usage, content: [{ type: "text", text: JSON.stringify(output) }] }), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

const ENV = { VU_ASK_ENABLED: "true", ANTHROPIC_API_KEY: "sk-test", VU_ASK_ADMIN_KEY: "admin-geheim" };

function makeGate(env = ENV, fetchImpl = anthropic(MINERVINI_ANSWER), now = Date.parse("2026-09-29T12:00:00Z")) {
  const storage = memoryStorage();
  const clock = { t: now };
  const gate = new AskGate({ storage }, env, { fetchImpl, now: () => clock.t });
  return { gate, storage, fetchImpl, clock };
}

function ask(gate, question, { ip = "1.2.3.4", clientId = "client-aaaaaaaa", token } = {}) {
  return gate.fetch(new Request("https://gate/ask", {
    method: "POST", headers: { "x-vu-ip": ip },
    body: JSON.stringify({ question, clientId, turnstileToken: token }),
  })).then(async (r) => ({ status: r.status, body: await r.json() }));
}

/* ------------------------------------------------------------ Katalog */

test("Das Antwortschema kennt nur freigegebene Screener-Felder", () => {
  assert.ok(FIELD_IDS.includes("newHigh52w"));
  assert.ok(FIELD_IDS.includes("fcfGrowth"));
  assert.ok(!FIELD_IDS.includes("quantScore"), "der zurueckgehaltene Gesamtscore darf nicht filterbar sein");
  assert.match(SYSTEM_PROMPT, /quantScore \| /, "als nicht verfuegbar benannt, damit er als Luecke gemeldet wird");
  const json = JSON.stringify(OUTPUT_SCHEMA);
  assert.ok(!/minimum|maximum|minLength|maxLength/.test(json), "Structured Outputs kennen keine Zahlengrenzen");
});

test("Die Anfrage an Anthropic ist Haiku mit erzwungenem Schema und ohne Schluessel im Text", () => {
  const req = buildRequest({ model: "claude-haiku-4-5", question: "Test", maxOutputTokens: 1200 });
  assert.equal(req.model, "claude-haiku-4-5");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.equal(req.max_tokens, 1200);
  assert.ok(!("thinking" in req));
});

/* ---------------------------------------------------------- Uebersetzung */

test("Die Minervini-Beispielfrage wird zu einer gueltigen Screener-Abfrage", () => {
  const r = translate(MINERVINI_ANSWER);
  const f = r.query.groups[0].filters;
  assert.deepEqual(f.map((x) => [x.field, x.op, x.value, x.value2]), [["newHigh52w", "is", true, null], ["marketCap", "between", 3e8, 2e9]]);
  assert.deepEqual(r.supertrader, { strategy: "MINERVINI_VCP", mode: "require" });
  assert.equal(statusOf(r), "partial", "Quant-Gesamtscore fehlt -> teilweise beantwortet");
});

test("Ungueltige Filter werden weggelassen und benannt, nicht repariert", () => {
  const r = translate({ ...MINERVINI_ANSWER, filters: [{ field: "pe", op: "in", value: null, value2: null, values: ["x"], flag: null },
    { field: "marketCap", op: "gt", value: null, value2: null, values: [], flag: null }] });
  assert.equal(r.query.groups[0].filters.length, 0);
  assert.deepEqual(r.dropped, ["pe", "marketCap"]);
  assert.ok(r.notes.some((n) => n.includes("pe")));
});

test("Einzelwertfrage: Ticker werden geprueft, Luecken fuehren zu 'gap'", () => {
  const stock = translate({ ...MINERVINI_ANSWER, kind: "stock", filters: [], tickers: ["nvda", "<script>"], show: ["fcfGrowth"], supertrader: { strategy: "NONE", mode: "none" }, missing: [] });
  assert.deepEqual(stock.tickers, ["NVDA"]);
  assert.equal(stock.query, null);
  assert.equal(statusOf(stock), "ok");
  const gap = translate({ ...MINERVINI_ANSWER, kind: "stock", filters: [], tickers: [], show: [], missing: [{ wish: "Insiderkaeufe", type: "field" }] });
  assert.equal(statusOf(gap), "gap");
});

test("Fuellwoerter und Satzzeichen teilen sich einen Cache-Eintrag", () => {
  assert.equal(cacheText("Äh, zeig mir bitte mal Aktien auf 52W-Hoch!"), cacheText("zeig mir Aktien auf 52W-Hoch"));
  assert.notEqual(cacheText("KGV unter 15"), cacheText("KGV unter 1.5"));
  assert.equal(cleanQuestion("  a  "), null);
  assert.equal(cleanQuestion("x".repeat(401)), null);
});

/* ---------------------------------------------------------------- Budget */

test("Kosten: echte Token nach Haiku-Preisen, unbekanntes Modell ohne Preis", () => {
  assert.equal(costOf("claude-haiku-4-5", { input_tokens: 1e6, output_tokens: 0 }), 1);
  assert.equal(costOf("claude-haiku-4-5", { input_tokens: 0, output_tokens: 1e6 }), 5);
  assert.equal(costOf("claude-opus-5-5", { input_tokens: 1 }), null);
  assert.equal(worstCase("claude-opus-5-5", 100, 100), null);
});

test("admit: jede Grenze greift fuer sich", () => {
  const limits = limitsFrom({ ...ENV, VU_ASK_MONTHLY_USD: "1", VU_ASK_TOTAL_USD: "2", VU_ASK_GLOBAL_DAILY: "5" });
  const base = { limits, reserve: 0.01, user: { llm: 0 }, day: { llm: 0 }, month: { usd: 0 }, total: { usd: 0 } };
  assert.deepEqual(admit(base), { ok: true });
  assert.equal(admit({ ...base, user: { llm: 1 } }).reason, "USER_DAILY_LIMIT");
  assert.equal(admit({ ...base, day: { llm: 5 } }).reason, "GLOBAL_DAILY_LIMIT");
  assert.equal(admit({ ...base, month: { usd: 0.995 } }).reason, "MONTHLY_BUDGET");
  assert.equal(admit({ ...base, total: { usd: 1.995 } }).reason, "TOTAL_BUDGET");
  assert.equal(admit({ ...base, reserve: null }).reason, "UNPRICED_MODEL");
  assert.equal(admit({ ...base, limits: limitsFrom({}) }).reason, "DISABLED", "ohne ausdrueckliches Einschalten aus");
});

/* ------------------------------------------------------------------ Tor */

test("Eine Frage pro Nutzer und Tag; die zweite erreicht Anthropic nicht", async () => {
  const { gate, fetchImpl } = makeGate();
  const a = await ask(gate, "Welche Aktien stehen auf einem neuen Jahreshoch und passen zu Minervini?");
  assert.equal(a.status, 200);
  assert.equal(a.body.source, "claude");
  assert.equal(a.body.quota.remainingToday, 0);
  const b = await ask(gate, "Und welche Tech-Aktien haben eine hohe Marge?");
  assert.equal(b.status, 429);
  assert.equal(b.body.reason, "USER_DAILY_LIMIT");
  assert.equal(fetchImpl.calls.length, 1);
});

test("Neue Browserkennung am selben Anschluss hilft nicht - neuer Tag schon", async () => {
  const { gate, clock } = makeGate();
  await ask(gate, "Frage eins zu Aktien");
  const sameIp = await ask(gate, "Frage zwei zu Aktien", { clientId: "client-bbbbbbbb" });
  assert.equal(sameIp.body.reason, "USER_DAILY_LIMIT");
  clock.t += 864e5;
  const tomorrow = await ask(gate, "Frage zwei zu Aktien", { clientId: "client-bbbbbbbb" });
  assert.equal(tomorrow.status, 200);
});

test("Dieselbe Frage (anders geschrieben) kommt aus dem Cache: kostenlos, ohne Kontingent", async () => {
  const { gate, fetchImpl } = makeGate();
  await ask(gate, "Zeig mir Aktien auf 52-Wochen-Hoch", { ip: "1.1.1.1" });
  const again = await ask(gate, "äh zeig mir bitte Aktien auf 52-Wochen-Hoch!", { ip: "2.2.2.2", clientId: "client-cccccccc" });
  assert.equal(again.body.source, "cache");
  assert.equal(again.body.quota.remainingToday, 1);
  assert.equal(fetchImpl.calls.length, 1);
});

test("Monatsbudget: die Reservierung des schlechtesten Falls sperrt vor dem Aufruf", async () => {
  const env = { ...ENV, VU_ASK_MONTHLY_USD: "0.02", VU_ASK_PER_USER_DAILY: "100" };
  const { gate, fetchImpl, storage } = makeGate(env, anthropic(MINERVINI_ANSWER, { usage: { input_tokens: 5000, output_tokens: 1200 } }));
  let refused = null;
  for (let i = 0; i < 10 && !refused; i++) {
    const r = await ask(gate, "Frage Nummer " + i + " zu Aktien");
    if (r.status !== 200) refused = r;
  }
  assert.equal(refused.body.reason, "MONTHLY_BUDGET");
  const month = storage.map.get("m:2026-09");
  assert.ok(month.usd <= 0.02, "gebucht " + month.usd + " liegt nicht ueber der Grenze");
  assert.ok(fetchImpl.calls.length >= 1 && fetchImpl.calls.length < 10);
});

test("Gleichzeitige Fragen koennen die Grenze nicht gemeinsam ueberschreiten", async () => {
  const env = { ...ENV, VU_ASK_GLOBAL_DAILY: "3", VU_ASK_PER_USER_DAILY: "100" };
  const { gate, fetchImpl } = makeGate(env);
  const all = await Promise.all(Array.from({ length: 8 }, (_, i) => ask(gate, "Parallele Frage " + i, { ip: "9.9.9." + i })));
  assert.equal(all.filter((r) => r.status === 200).length, 3);
  assert.equal(fetchImpl.calls.length, 3);
});

test("Anthropic-Fehler: keine Kosten, Kontingent zurueck, Tagesgrenze bleibt belastet", async () => {
  const { gate, storage } = makeGate(ENV, anthropic(null, { status: 529 }));
  const r = await ask(gate, "Welche Aktien sind guenstig bewertet?");
  assert.equal(r.status, 502);
  assert.equal(r.body.quota.remainingToday, 1);
  assert.equal(storage.map.get("m:2026-09").usd, 0);
  assert.equal(storage.map.get("d:2026-09-29").llm, 1);
});

test("Ohne Schalter, ohne Schluessel: keine Anfrage hinaus", async () => {
  for (const env of [{ ...ENV, VU_ASK_ENABLED: "false" }, { ...ENV, ANTHROPIC_API_KEY: "" }]) {
    const { gate, fetchImpl } = makeGate(env);
    const r = await ask(gate, "Irgendeine Frage zu Aktien");
    assert.notEqual(r.status, 200);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test("Bot-Pruefung: ohne gueltiges Turnstile-Token geht nichts an Anthropic", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.includes("turnstile")) return new Response(JSON.stringify({ success: false }));
    return anthropic(MINERVINI_ANSWER)(url, init);
  };
  const { gate, storage } = makeGate({ ...ENV, TURNSTILE_SECRET: "ts" }, fetchImpl);
  const r = await ask(gate, "Frage ohne Token zu Aktien", { token: "falsch" });
  assert.equal(r.body.reason, "BOT_CHECK");
  assert.ok(!calls.some((u) => u.includes("anthropic")));
  assert.equal(storage.map.get("m:2026-09"), undefined, "nichts reserviert");
});

test("Dauerfeuer von einem Anschluss wird auch fuer Cache-Treffer gebremst", async () => {
  const { gate } = makeGate({ ...ENV, VU_ASK_REQUESTS_PER_IP_DAILY: "3" });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await ask(gate, "Zeig mir Aktien auf 52-Wochen-Hoch")).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test("Es wird keine IP-Adresse gespeichert", async () => {
  const { gate, storage } = makeGate();
  await ask(gate, "Welche Aktien haben starkes Momentum?", { ip: "203.0.113.77" });
  assert.ok(![...storage.map.keys()].some((k) => k.includes("203.0.113.77")));
  assert.ok(!JSON.stringify([...storage.map.values()]).includes("203.0.113.77"));
});

/* ------------------------------------------------------------- Lernen */

test("Lernbericht: fehlende Daten nach Haeufigkeit, nicht verstandene Fragen", async () => {
  const gapAnswer = { ...MINERVINI_ANSWER, kind: "stock", filters: [], tickers: [], show: [], supertrader: { strategy: "NONE", mode: "none" },
    missing: [{ wish: "Insiderkaeufe", type: "field" }] };
  const { gate } = makeGate({ ...ENV, VU_ASK_PER_USER_DAILY: "100" }, anthropic(gapAnswer));
  await ask(gate, "Wo haben Insider zuletzt gekauft?");
  await ask(gate, "Bei welchen Firmen kaufen die Chefs selbst Aktien?");
  const report = await gate.report(50);
  assert.equal(report.missingData[0].wish, "Insiderkaeufe");
  assert.equal(report.missingData[0].count, 2);
  assert.equal(report.missingData[0].examples.length, 2);
  assert.equal(report.byStatus.gap, 2);
  assert.equal(report.notUnderstood.length, 2);
  assert.ok(report.spend.totalUsd > 0);
});

/* ---------------------------------------------------------- Eingang */

function fakeEnv(env = ENV) {
  const { gate } = makeGate(env);
  return { ...env, VU_ASK_GATE: { idFromName: () => "id", get: () => ({ fetch: (u, init) => gate.fetch(new Request(u, init)) }) } };
}

test("Eingang: fremde Herkunft und fehlender Admin-Key werden abgewiesen", async () => {
  const env = fakeEnv();
  const foreign = await worker.fetch(new Request("https://ask.example/v1/ask", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }), env);
  assert.equal(foreign.status, 403);
  const report = await worker.fetch(new Request("https://ask.example/v1/admin/report", { headers: { authorization: "Bearer falsch" } }), env);
  assert.equal(report.status, 401);
  const ok = await worker.fetch(new Request("https://ask.example/v1/admin/report", { headers: { authorization: "Bearer admin-geheim" } }), env);
  assert.equal(ok.status, 200);
  const big = await worker.fetch(new Request("https://ask.example/v1/ask", { method: "POST", headers: { origin: "https://research.visionuniverse.de" }, body: "x".repeat(5000) }), env);
  assert.equal(big.status, 413);
});

test("Eingang: eigene Seite bekommt Antwort mit CORS-Kopf", async () => {
  const env = fakeEnv();
  const r = await worker.fetch(new Request("https://ask.example/v1/ask", {
    method: "POST", headers: { origin: "https://research.visionuniverse.de", "cf-connecting-ip": "5.5.5.5" },
    body: JSON.stringify({ question: "Welche Aktien stehen auf einem Jahreshoch?", clientId: "client-dddddddd" }),
  }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://research.visionuniverse.de");
  const body = await r.json();
  assert.equal(body.result.kind, "screen");
});

test("Ohne eingerichtetes Salz erzeugt das Tor selbst eines und behaelt es", async () => {
  const { gate, storage } = makeGate();
  await ask(gate, "Erste Frage zu Aktien");
  const salt = storage.map.get("salt");
  assert.match(salt, /^[0-9a-f]{64}$/);
  await ask(gate, "Zweite Frage zu Aktien", { ip: "8.8.8.8", clientId: "client-eeeeeeee" });
  assert.equal(storage.map.get("salt"), salt);
});

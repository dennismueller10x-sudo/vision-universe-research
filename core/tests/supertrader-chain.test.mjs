/* Core · Supertrader nach dem Nachtlauf: scripts/ci/supertrader-chain.mjs

   Die Kette: Nachtlauf (refresh -> materialize -> freshness-contract) ->
   Stufe `supertrader` -> workflow_dispatch von supertrader-signals.yml.
   Der Monitor prueft das Ergebnis. Hermetisch: Wegwerf-Verzeichnisse und ein
   lokaler HTTP-Server statt der GitHub-API. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHAIN = join(ROOT, "scripts", "ci", "supertrader-chain.mjs");
const { planDispatch, assessChain, CONFIG } = await import(CHAIN);
const lies = (rel) => readFileSync(join(ROOT, rel), "utf8");

const EING = { spyTo: "2026-10-13", regimeAsOf: "2026-10-13", healthSession: "2026-10-13" };
const GUT = { QUANT_CURRENT: "PASS", PRODUCT_MATERIALIZATION_CURRENT: "CURRENT", MARKET_STORE_CURRENT: "CURRENT", LATEST_PRODUCT_ASOF: "2026-10-13", LATEST_MARKET_SESSION: "2026-10-13" };

test("SC1 · Anstoss: nur bei validierten, vollstaendig veroeffentlichten Daten - und nur wenn noetig", () => {
  const plan = (o) => planDispatch(Object.assign({ pipeline: GUT, basisAsOf: "2026-10-13", supertraderAsOf: "2026-10-12", runs: [], inputs: EING, deadRefs: [], universeOk: true }, o));
  assert.equal(plan({}).action, "DISPATCH");
  /* nicht validiert: nie anstossen */
  for (const [name, o] of [
    ["kein Bericht", { pipeline: null }],
    ["QUANT_CURRENT nicht PASS", { pipeline: Object.assign({}, GUT, { QUANT_CURRENT: "FAIL" }) }],
    ["Produkt nicht aktuell", { pipeline: Object.assign({}, GUT, { PRODUCT_MATERIALIZATION_CURRENT: "STALE" }) }],
    ["Ablage nicht aktuell", { pipeline: Object.assign({}, GUT, { MARKET_STORE_CURRENT: "STALE" }) }],
    ["Produkt hinter der Sitzung", { pipeline: Object.assign({}, GUT, { LATEST_PRODUCT_ASOF: "2026-10-12" }), basisAsOf: "2026-10-12" }],
    ["Discover-Basis verschieden", { basisAsOf: "2026-10-12" }],
    ["Basis fehlt", { basisAsOf: null }]
  ]) {
    const p = plan(o);
    assert.equal(p.action, "REFUSE", name);
    assert.ok(["NO_PIPELINE_REPORT", "DATA_NOT_VALIDATED"].includes(p.reason), name);
  }
  /* Eingaben des Builds (Benchmark, Regime, Boersenstatus) muessen denselben Stichtag tragen: der Build kuerzt einen alten SPY still */
  for (const [name, eing] of [["SPY alt", { ...EING, spyTo: "2026-10-12" }], ["Regime alt", { ...EING, regimeAsOf: "2026-10-12" }], ["Status alt", { ...EING, healthSession: "2026-10-12" }], ["SPY fehlt", { ...EING, spyTo: null }], ["gar nichts", undefined]]) {
    const p = plan({ inputs: eing });
    assert.equal(p.action, "REFUSE", name); assert.equal(p.reason, "INPUT_NOT_CURRENT", name);
  }
  assert.equal(plan({ universeOk: false }).reason, "DATA_NOT_VALIDATED", "Discover-Aktienindex nicht lesbar");
  /* nicht noetig */
  assert.equal(plan({ supertraderAsOf: "2026-10-13" }).reason, "UP_TO_DATE");
  /* Universum hat sich nach dem Lauf geaendert (toter Verweis): Neubau heilt, auch bei gleichem Stichtag */
  const heil = plan({ supertraderAsOf: "2026-10-13", deadRefs: ["QRVO"] });
  assert.equal(heil.action, "DISPATCH"); assert.equal(heil.reason, "DEAD_TICKER_REFS");
  assert.equal(plan({ supertraderAsOf: "2026-10-13", deadRefs: ["QRVO"], runs: [{ status: "queued" }] }).reason, "ALREADY_QUEUED", "auch hier kein Doppellauf");
  assert.equal(plan({ supertraderAsOf: "2026-10-14" }).reason, "UP_TO_DATE", "nie rueckwaerts, auch nicht bei spaeterem Stand");
  /* kein Doppellauf: ein wartender Lauf liest beim Start den aktuellen Stand */
  for (const status of CONFIG.waitingStates) assert.equal(plan({ runs: [{ status }] }).reason, "ALREADY_QUEUED", status);
  /* ein laufender Lauf kann auf altem Stand begonnen haben: dahinter einreihen (Concurrency-Gruppe serialisiert) */
  assert.equal(plan({ runs: [{ status: "in_progress" }] }).reason, "DISPATCH_BEHIND_RUNNING");
  assert.equal(plan({ runs: [{ status: "completed", conclusion: "failure" }] }).action, "DISPATCH", "ein frueher gescheiterter Lauf ist kein Grund zu warten");
});

test("SC2 · Monitor: Stichtag gegen die Produktdaten, Zeitstufen, tote Ticker-Verweise", () => {
  const nowMs = Date.parse("2026-10-14T06:00:00Z");
  const basis = (minAlt) => ({ asOf: "2026-10-13", generatedAt: new Date(nowMs - minAlt * 60000).toISOString() });
  const eval_ = (o) => assessChain(Object.assign({ nowMs, pipeline: GUT, basis: basis(60), supertraderAsOf: "2026-10-12", symbols: ["AAA", "BBB"], universe: new Set(["AAA", "BBB"]), unavailable: [], lastRun: null }, o));
  assert.equal(eval_({}).level, "OK", "die Kette laeuft noch (60 Min.)");
  assert.equal(eval_({ basis: basis(CONFIG.lateMin + 1) }).findings[0].code, "SUPERTRADER_LATE");
  assert.equal(eval_({ basis: basis(CONFIG.lateMin + 1) }).level, "WARN");
  const stale = eval_({ basis: basis(CONFIG.staleMin + 1) });
  assert.equal(stale.level, "FAIL");
  assert.equal(stale.findings[0].code, "SUPERTRADER_STALE");
  assert.equal(eval_({ supertraderAsOf: "2026-10-13", basis: basis(2000) }).level, "OK", "aktuell: kein Alter schadet");
  /* Wochenende/Feiertag: Produktstand = Freitag, Supertrader = Freitag -> still, egal wie alt */
  assert.equal(eval_({ pipeline: Object.assign({}, GUT, { LATEST_PRODUCT_ASOF: "2026-10-09", LATEST_MARKET_SESSION: "2026-10-09" }), basis: { asOf: "2026-10-09", generatedAt: "2026-10-10T02:00:00Z" }, supertraderAsOf: "2026-10-09" }).level, "OK");
  /* Daten nicht vollstaendig validiert: Supertrader kann nichts dafuer, kein Zeit-Befund */
  assert.equal(eval_({ pipeline: Object.assign({}, GUT, { QUANT_CURRENT: "FAIL" }), basis: basis(2000) }).level, "OK");
  assert.equal(eval_({ pipeline: null }).findings[0].code, "NO_PIPELINE_REPORT");
  /* der Fall QRVO: Signal-Titel ohne Seite */
  const tot = eval_({ symbols: ["AAA", "QRVO"], universe: new Set(["AAA"]) });
  assert.deepEqual(tot.tot, ["QRVO"]);
  assert.equal(tot.level, "WARN", "Supertrader steht noch zurueck: der naechste Lauf weist QRVO aus");
  assert.equal(tot.findings[0].code, "DEAD_TICKER_REFS");
  const aktuellTot = eval_({ symbols: ["AAA", "QRVO"], universe: new Set(["AAA"]), supertraderAsOf: "2026-10-13" });
  assert.equal(aktuellTot.level, "FAIL", "Supertrader ist aktuell, der Build haette QRVO ausweisen muessen");
  /* ausgewiesen = bewusster Fallback (LOGI): kein Befund; wieder im Universum: veralteter Ausweis */
  assert.equal(eval_({ symbols: ["AAA", "LOGI"], universe: new Set(["AAA"]), unavailable: ["LOGI"] }).level, "OK");
  const alt = eval_({ symbols: ["AAA", "LOGI"], universe: new Set(["AAA", "LOGI"]), unavailable: ["LOGI"] });
  assert.equal(alt.findings[0].code, "STALE_UNAVAILABLE_MARK");
  assert.equal(alt.level, "WARN");
});

/* --------------------------------------------------------------- Ende-zu-Ende */
function fixture({ metaAsOf = "2026-10-13", metaGen = "2026-10-14T02:28:00Z", stAsOf = "2026-10-12", symbols = ["AAA", "BBB"], index = ["AAA", "BBB"], unavailable = [], eing = EING } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-stchain-"));
  for (const d of ["discover/data/stock-index", "supertrader/data"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "discover/data/meta.json"), JSON.stringify({ universes: [{ universeId: "US_REAL", asOf: metaAsOf, generatedAt: metaGen }] }));
  writeFileSync(join(dir, "discover/data/stock-index/US_REAL.json"), JSON.stringify({ symbols: index }));
  writeFileSync(join(dir, "supertrader/data/build.json"), JSON.stringify({ asOf: stAsOf }));
  writeFileSync(join(dir, "supertrader/data/signals.json"), JSON.stringify({ bySymbol: Object.fromEntries(symbols.map((s) => [s, {}])), discoverAvailability: { unavailable } }));
  writeFileSync(join(dir, "pipeline.json"), JSON.stringify(GUT));
  for (const d of ["quant/data/market/multi-asset/series", "quant/data/product", "quant/data/market/freshness"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "quant/data/market/multi-asset/series/SPY.json"), JSON.stringify({ to: eing.spyTo, points: [] }));
  writeFileSync(join(dir, "quant/data/product/market-regime-v1.json"), JSON.stringify({ asOf: eing.regimeAsOf }));
  writeFileSync(join(dir, "quant/data/market/freshness/health.json"), JSON.stringify({ market: { lastCompletedSession: eing.healthSession } }));
  return dir;
}
function lauf(args, env = {}) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [CHAIN, ...args], { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", GITHUB_REF_NAME: "main", SUPERTRADER_CHAIN_POLL_MS: "20" }, env) });
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
    c.on("close", (code) => res({ code, out }));
  });
}
/* Mini-GitHub: GET runs / POST dispatches. */
function githubMock({ queued = false, postStatus = 204, postFolge = null, running = false, runsStatus = 200 } = {}) {
  const posts = []; let gepostet = false;
  const server = createServer((req, res) => {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.method === "POST") {
        posts.push({ url: req.url, body: JSON.parse(body || "{}"), auth: req.headers.authorization });
        const st = postFolge ? postFolge[Math.min(posts.length - 1, postFolge.length - 1)] : postStatus;
        gepostet = st === 204; res.statusCode = st; return res.end(st === 204 ? "" : '{"message":"Workflow does not have workflow_dispatch trigger"}');
      }
      if (runsStatus !== 200 && !gepostet) { res.statusCode = runsStatus; return res.end("{}"); }
      const runs = [];
      if (running) runs.push({ status: "in_progress", event: "schedule", created_at: new Date(Date.now() - 600000).toISOString(), html_url: "http://run/laeuft" });
      if (queued) runs.push({ status: "queued", event: "workflow_dispatch", created_at: new Date().toISOString(), html_url: "http://run/queued" });
      if (gepostet) runs.push({ status: "in_progress", event: "workflow_dispatch", created_at: new Date().toISOString(), html_url: "http://run/neu" });
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ workflow_runs: runs }));
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, posts, url: "http://127.0.0.1:" + server.address().port })));
}

test("SC3 · dispatch gegen eine Mini-GitHub-API: genau ein Anstoss, kein Doppellauf, Fehler werden gemeldet", async () => {
  const dir = fixture();
  const ausgabe = join(dir, "output.txt");
  try {
    /* 1) alles gut: genau ein POST mit ref main, der neue Lauf wird sichtbar */
    let gh = await githubMock();
    let r = await lauf(["dispatch", "--root=" + dir, "--pipeline=" + join(dir, "pipeline.json")], { GITHUB_API_URL: gh.url });
    gh.server.close();
    assert.equal(r.code, 0, r.out);
    assert.equal(gh.posts.length, 1);
    assert.match(gh.posts[0].url, /\/repos\/o\/r\/actions\/workflows\/supertrader-signals\.yml\/dispatches$/);
    assert.deepEqual(gh.posts[0].body, { ref: "main" });
    assert.equal(gh.posts[0].auth, "Bearer t");
    assert.match(r.out, /Dispatch gesendet \(204\)/);
    assert.match(r.out, /http:\/\/run\/neu/);
    /* 2) ein Lauf wartet schon: kein POST */
    gh = await githubMock({ queued: true });
    r = await lauf(["dispatch", "--root=" + dir, "--pipeline=" + join(dir, "pipeline.json")], { GITHUB_API_URL: gh.url });
    gh.server.close();
    assert.equal(r.code, 0, r.out);
    assert.equal(gh.posts.length, 0, "kein konkurrierender Lauf");
    assert.match(r.out, /ALREADY_QUEUED/);
    /* 3) Supertrader schon aktuell: kein POST */
    const aktuell = fixture({ stAsOf: "2026-10-13" });
    gh = await githubMock();
    r = await lauf(["dispatch", "--root=" + aktuell, "--pipeline=" + join(aktuell, "pipeline.json")], { GITHUB_API_URL: gh.url });
    gh.server.close(); rmSync(aktuell, { recursive: true, force: true });
    assert.equal(r.code, 0); assert.equal(gh.posts.length, 0); assert.match(r.out, /UP_TO_DATE/);
    /* 4) Daten nicht validiert: Exit 1, kein POST, Detail fuer den Alarm */
    writeFileSync(join(dir, "pipeline-rot.json"), JSON.stringify(Object.assign({}, GUT, { QUANT_CURRENT: "FAIL" })));
    gh = await githubMock();
    r = await lauf(["dispatch", "--root=" + dir, "--pipeline=" + join(dir, "pipeline-rot.json")], { GITHUB_API_URL: gh.url, GITHUB_OUTPUT: ausgabe });
    gh.server.close();
    assert.equal(r.code, 1, r.out);
    assert.equal(gh.posts.length, 0, "nie auf unvalidierten Daten");
    assert.match(r.out, /::error title=Supertrader-Kette::DATA_NOT_VALIDATED/);
    assert.match(readFileSync(ausgabe, "utf8"), /^detail=DATA_NOT_VALIDATED: /m);
    /* 5) GitHub weist den Dispatch ab: Exit 1 + Detail (Nachtlauf bleibt davon unberuehrt, der Job ist continue-on-error) */
    gh = await githubMock({ postStatus: 422 });
    r = await lauf(["dispatch", "--root=" + dir, "--pipeline=" + join(dir, "pipeline.json")], { GITHUB_API_URL: gh.url, GITHUB_OUTPUT: ausgabe });
    gh.server.close();
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Dispatch abgewiesen: HTTP 422/);
    /* 6) Trockenlauf: nie ein POST */
    gh = await githubMock();
    r = await lauf(["dispatch", "--dry-run", "--root=" + dir, "--pipeline=" + join(dir, "pipeline.json")], { GITHUB_API_URL: gh.url });
    gh.server.close();
    assert.equal(r.code, 0); assert.equal(gh.posts.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SC4 · check (CLI): Exit-Codes und Annotationen; Netzfehler der Laufabfrage ist kein Befund", async () => {
  const stale = fixture({ metaGen: "2026-10-13T20:00:00Z" });     /* 10 h vor 06:00 */
  const ok = fixture({ stAsOf: "2026-10-13" });
  const tot = fixture({ symbols: ["AAA", "QRVO"], index: ["AAA"], stAsOf: "2026-10-13" });
  try {
    const args = (d, extra = []) => ["check", "--root=" + d, "--pipeline=" + join(d, "pipeline.json"), "--now=2026-10-14T06:00:00Z", "--no-api", ...extra];
    let r = await lauf(args(ok, ["--strict"]));
    assert.equal(r.code, 0, r.out); assert.match(r.out, /Supertrader-Aktualitaet: OK/);
    r = await lauf(args(stale, ["--strict"]));
    assert.equal(r.code, 2, r.out); assert.match(r.out, /::error title=Supertrader SUPERTRADER_STALE::/);
    r = await lauf(args(stale));
    assert.equal(r.code, 0, "ohne --strict nur Bericht");
    r = await lauf(args(tot, ["--strict"]));
    assert.equal(r.code, 2, r.out); assert.match(r.out, /DEAD_TICKER_REFS.*QRVO/);
    r = await lauf(["check", "--root=" + ok, "--pipeline=" + join(ok, "pipeline.json"), "--now=2026-10-14T06:00:00Z", "--strict"], { GITHUB_API_URL: "http://127.0.0.1:9" });
    assert.equal(r.code, 0, "unerreichbare API: kein Alarm durch den Pruefer"); assert.match(r.out, /Laeufe nicht lesbar/);
    r = await lauf(["check", "--now=morgen", "--no-api"]);
    assert.equal(r.code, 2);
  } finally { for (const d of [stale, ok, tot]) rmSync(d, { recursive: true, force: true }); }
});

test("SC5 · Verdrahtung: eigene Stufe nach allen Pruefungen, entkoppelt, Zeitplan-Rueckfall und Supertrader-Workflow unveraendert", () => {
  const wf = lies(".github/workflows/market-data-refresh.yml");
  const i = wf.indexOf("\n  supertrader:\n");
  assert.ok(i > 0);
  const job = wf.slice(i, wf.indexOf("\n  # ===", i + 10));
  assert.match(job, /needs: \[refresh, materialize, freshness-contract\]/);
  for (const n of ["refresh", "materialize", "freshness-contract"]) assert.match(job, new RegExp("needs\\." + n + "\\.result == 'success'"), n);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /github\.event_name != 'push'/);
  /* kleinste Rechte: lesen + Actions schreiben (fuer den Dispatch), kein contents: write */
  assert.match(job, /permissions:\s*\n\s+contents: read\s*\n\s+actions: write/);
  assert.doesNotMatch(job, /contents: write/);
  /* keine Job-Concurrency (Verdraengung = cancelled = roter Nachtlauf) */
  assert.doesNotMatch(job, /\n    concurrency:/);
  /* Nachtlauf bleibt gruen: jeder Schritt continue-on-error + Limit */
  const schritte = job.split("\n      - ").slice(1);
  assert.equal(schritte.length, 3);
  for (const s of schritte) { assert.match(s, /continue-on-error: true/); assert.match(s, /timeout-minutes: \d+/); }
  assert.match(job, /node scripts\/ci\/supertrader-chain\.mjs dispatch/);
  assert.doesNotMatch(job, /TIINGO|MARKETSTACK/i);
  assert.doesNotMatch(job, /\$\{\{\s*inputs\./);
  /* der Alarm sieht nur den ANSTOSS */
  assert.match(wf, /RESULT_SUPERTRADER: \$\{\{ needs\.supertrader\.result == 'failure' && 'failure'/);
  assert.match(wf, /needs: \[refresh, materialize, freshness-contract, imblick, supertrader\]/);
  /* Supertrader-Workflow unveraendert: Zeitplan-Rueckfall + manueller Start, Concurrency, Integritaetstests vor dem Commit */
  const st = lies(".github/workflows/supertrader-signals.yml");
  assert.match(st, /cron: '17 6 \* \* 2-6'/);
  assert.match(st, /workflow_dispatch:/);
  assert.match(st, /group: supertrader-signals\s*\n\s+cancel-in-progress: false/);
  assert.ok(st.indexOf('node --test "scripts/supertrader/tests/*.test.mjs"') < st.indexOf("commit-and-push.sh"), "Tests vor dem Commit");
  /* Monitor im Freshness-Monitor */
  const fm = lies(".github/workflows/freshness-monitor.yml");
  assert.match(fm, /\n  supertrader:\n/);
  assert.match(fm, /node scripts\/ci\/supertrader-chain\.mjs check --strict/);
});

test("SC6 · Alarm-Zuordnung des Anstosses: Jobfehler/Zeitablauf/Dispatch-Fehler rot, sonst nicht", async () => {
  const wf = lies(".github/workflows/market-data-refresh.yml");
  const ausdruck = wf.match(/RESULT_SUPERTRADER: \$\{\{ (.+) \}\}/)[1];
  const bewerte = (result, ergebnis) => new Function("needs", "return (" + ausdruck + ");")({ supertrader: { result, outputs: { ergebnis } } });
  const { auswerten } = await import(join(ROOT, "scripts", "ci", "pipeline-alarm.mjs"));
  const zustand = (r) => auswerten({ RESULT_REFRESH: "success", RESULT_MATERIALIZE: "success", RESULT_FRESHNESS: "success", RESULT_SUPERTRADER: r }).zustand;
  for (const [result, ergebnis, erwartet, rot] of [["success", "success", "success", "gruen"], ["success", "failure", "failure", "rot"], ["failure", "", "failure", "rot"], ["skipped", "", "skipped", "gruen"], ["cancelled", "", "skipped", "gruen"]]) {
    assert.equal(bewerte(result, ergebnis), erwartet, result + "/" + ergebnis);
    assert.equal(zustand(erwartet), rot);
  }
});

test("SC7 · Isolation: das Skript liest nur, fasst keine Signallogik an und ruft keinen Datenanbieter", () => {
  const code = lies("scripts/ci/supertrader-chain.mjs");
  const ohneKommentare = code.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(ohneKommentare, /writeFileSync|renameSync|unlinkSync|rmSync/, "kein Schreiben in den Baum");
  assert.doesNotMatch(ohneKommentare, /TIINGO|MARKETSTACK|api\.tiingo|marketstack/i);
  assert.doesNotMatch(ohneKommentare, /scripts\/supertrader|supertrader\/engine|build\.mjs/, "keine Signallogik");
  /* Aufrufe nach aussen: ausschliesslich die GitHub-API des eigenen Repositorys */
  assert.equal((ohneKommentare.match(/fetch\(/g) || []).length, 1);
  assert.match(ohneKommentare, /GITHUB_API_URL/);
});

test("SC8 · Anstoss unter Last: laufender Lauf, 5xx-Wiederholung, Laeufe-API tot, Universum geaendert, Eingaben alt", async () => {
  const dir = fixture();
  const p = ["--root=" + dir, "--pipeline=" + join(dir, "pipeline.json")];
  const ausgabe = join(dir, "out.txt");
  try {
    /* laeuft schon ein Lauf (altes Datenfenster): dahinter einreihen */
    let gh = await githubMock({ running: true });
    let r = await lauf(["dispatch", ...p], { GITHUB_API_URL: gh.url }); gh.server.close();
    assert.equal(r.code, 0, r.out); assert.equal(gh.posts.length, 1); assert.match(r.out, /DISPATCH_BEHIND_RUNNING/);
    /* 503, 503, dann 204: drei Versuche, ein Erfolg */
    gh = await githubMock({ postFolge: [503, 503, 204] });
    r = await lauf(["dispatch", ...p], { GITHUB_API_URL: gh.url }); gh.server.close();
    assert.equal(r.code, 0, r.out); assert.equal(gh.posts.length, 3);
    /* dauerhaft 503: nach drei Versuchen Exit 1 mit Detail fuer den Alarm */
    gh = await githubMock({ postStatus: 503 });
    r = await lauf(["dispatch", ...p], { GITHUB_API_URL: gh.url, GITHUB_OUTPUT: ausgabe }); gh.server.close();
    assert.equal(r.code, 1, r.out); assert.equal(gh.posts.length, 3);
    assert.match(readFileSync(ausgabe, "utf8"), /^detail=Dispatch abgewiesen: HTTP 503/m);
    /* 4xx ist endgueltig: genau ein Versuch */
    gh = await githubMock({ postStatus: 403 });
    r = await lauf(["dispatch", ...p], { GITHUB_API_URL: gh.url }); gh.server.close();
    assert.equal(r.code, 1); assert.equal(gh.posts.length, 1);
    /* Server nicht erreichbar: Netzfehler -> Exit 1 mit Detail (nie eine Ausnahme ohne Erklaerung) */
    writeFileSync(ausgabe, "");
    r = await lauf(["dispatch", ...p], { GITHUB_API_URL: "http://127.0.0.1:9", GITHUB_OUTPUT: ausgabe });
    assert.equal(r.code, 1, r.out); assert.match(readFileSync(ausgabe, "utf8"), /^detail=Dispatch nicht erreichbar/m);
    /* Laeufe-Abfrage scheitert: Warnung, es wird trotzdem geplant und angestossen */
    gh = await githubMock({ runsStatus: 500 });
    r = await lauf(["dispatch", ...p], { GITHUB_API_URL: gh.url }); gh.server.close();
    assert.equal(r.code, 0, r.out); assert.equal(gh.posts.length, 1); assert.match(r.out, /Warteschlange unbekannt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  /* Universum hat sich bei GLEICHEM Stichtag geaendert: toter Verweis -> Neubau */
  const tot = fixture({ stAsOf: "2026-10-13", symbols: ["AAA", "QRVO"], index: ["AAA"] });
  try {
    const gh = await githubMock();
    const r = await lauf(["dispatch", "--root=" + tot, "--pipeline=" + join(tot, "pipeline.json")], { GITHUB_API_URL: gh.url }); gh.server.close();
    assert.equal(r.code, 0, r.out); assert.equal(gh.posts.length, 1); assert.match(r.out, /DEAD_TICKER_REFS/);
  } finally { rmSync(tot, { recursive: true, force: true }); }
  /* Eingaben des Builds noch alt (SPY): kein Anstoss, Alarm-Detail */
  const alt = fixture({ eing: { spyTo: "2026-10-12", regimeAsOf: "2026-10-13", healthSession: "2026-10-13" } });
  try {
    const gh = await githubMock();
    const a = join(alt, "o.txt");
    const r = await lauf(["dispatch", "--root=" + alt, "--pipeline=" + join(alt, "pipeline.json")], { GITHUB_API_URL: gh.url, GITHUB_OUTPUT: a }); gh.server.close();
    assert.equal(r.code, 1, r.out); assert.equal(gh.posts.length, 0, "nie auf einem veralteten Benchmark");
    assert.match(readFileSync(a, "utf8"), /^detail=INPUT_NOT_CURRENT: .*SPY 2026-10-12/m);
  } finally { rmSync(alt, { recursive: true, force: true }); }
  /* Aktienindex fehlt: nicht validiert, kein Anstoss */
  const ohne = fixture();
  try {
    rmSync(join(ohne, "discover/data/stock-index/US_REAL.json"));
    const gh = await githubMock();
    const r = await lauf(["dispatch", "--root=" + ohne, "--pipeline=" + join(ohne, "pipeline.json")], { GITHUB_API_URL: gh.url }); gh.server.close();
    assert.equal(r.code, 1); assert.equal(gh.posts.length, 0); assert.match(r.out, /Aktienindex nicht lesbar/);
  } finally { rmSync(ohne, { recursive: true, force: true }); }
});

test("SC9 · Monitor: fehlender Stand/Index ist ein eigener Befund (kein Fehlalarm auf alle Titel), gescheiterter oder laufender Lauf", () => {
  const nowMs = Date.parse("2026-10-14T20:00:00Z");
  const basis = { asOf: "2026-10-13", generatedAt: "2026-10-14T02:28:00Z" };        /* 17,5 h alt */
  const bas = (o) => assessChain(Object.assign({ nowMs, pipeline: GUT, basis, supertraderAsOf: "2026-10-12", symbols: ["AAA"], universe: new Set(["AAA"]), unavailable: [], lastRun: null }, o));
  const codes = (r) => r.findings.map((f) => f.code);
  assert.ok(codes(bas({ supertraderAsOf: null })).includes("NO_STATE"));
  const keinIndex = bas({ universe: null, supertraderAsOf: "2026-10-13" });
  assert.deepEqual(codes(keinIndex), ["NO_UNIVERSE"]);
  assert.equal(keinIndex.level, "WARN", "ein unlesbarer Index macht nicht alle Signal-Titel zu toten Verweisen");
  /* gescheiterter Lauf wird benannt */
  const fail = bas({ lastRun: { event: "schedule", createdAt: "2026-10-14T13:00:00Z", conclusion: "failure", status: "completed", url: "http://run/1" } });
  assert.ok(codes(fail).includes("SUPERTRADER_RUN_FAILED")); assert.ok(codes(fail).includes("SUPERTRADER_STALE")); assert.equal(fail.level, "FAIL");
  /* ein Lauf laeuft/wartet gerade: nur WARN (der Rueckfall steht in der Warteschlange) */
  for (const status of ["queued", "in_progress"]) {
    const r = bas({ lastRun: { event: "schedule", createdAt: "2026-10-14T19:55:00Z", status, conclusion: null } });
    assert.equal(r.level, "WARN", status); assert.ok(!codes(r).includes("SUPERTRADER_STALE"), status);
  }
});

test("SC10 · Freshness-Monitor: Ergebnis des Supertrader-Jobs landet im Alarm (Issue), nicht nur in einem roten Lauf", () => {
  const fm = lies(".github/workflows/freshness-monitor.yml");
  assert.match(fm, /alarm:\n\s+needs: \[monitor, produktstand, supertrader\]/);
  assert.match(fm, /RESULT_SUPERTRADER: \$\{\{ needs\.supertrader\.result \}\}/);
});

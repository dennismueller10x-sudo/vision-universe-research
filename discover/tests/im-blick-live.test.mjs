/* =========================================================================
   IM BLICK INTRADAY (scripts/discover/build-im-blick-live.mjs)

   LV1  Laufende Sitzung: Auswahl aus 5-Minuten-Kursen, sauber getrennt von
        Schlusskurs-Signalen (kein Schlusshoch, kein Ausbruch, kein Volumen)
   LV2  Nur zeitlich passende Daten: veraltete Snapshots und ein fremder
        Vortagesschluss fallen heraus; Basis = Vorsitzung, sonst EOD_STALE
   LV3  Nach dem Abendlauf gilt die Schlusskurs-Auswahl (EOD_CURRENT);
        ohne Snapshots NO_INTRADAY; ohne Ereignis NO_EVENTS
   LV4  Client: ersetzt die EOD-Auswahl nur bei LIVE, gleicher Basis,
        >= 3 Titeln und frischem Stand
   LV5  Workflow nach ADR-005, Pages-Auslieferung, Register
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "discover", "build-im-blick-live.mjs");
const Identity = require(join(ROOT, "core", "identity.js"));

const SESSION = "2026-10-14", VORHER = "2026-10-13";
const NOW = "2026-10-14T16:05:00Z"; /* 12:05 New York */

function basisEintrag(s, o = {}) {
  return Object.assign({ s, sec: o.sec || "Technology", tier: null, lp: 80, rs: 85, acc: 0.02, vol: 0.02, trend: true, age: 3, hi: 110, close: 100, eod: 50 }, o);
}
function snapshot(s, o = {}) {
  const pts = o.points || [["09:30", 100.5], ["10:00", 104], ["11:00", 112], ["11:55", o.last || 111]];
  return { schemaVersion: "intraday-snapshot-1.0.0", symbol: s, securityId: Identity.securityIdForTicker(s), sessionDate: o.session || SESSION,
           asOf: o.asOf || "2026-10-14T15:55:00.000Z", asOfLocal: o.asOfLocal || "11:55", previousClose: o.prev === undefined ? 100 : o.prev,
           points: pts };
}
function detail(s, sec) {
  return { symbol: s, companyName: s + " Inc", sector: sec || "Technology", signals: {}, metrics: { leadershipPercentile: 80 }, metricStatus: {},
           badges: [], plain: { story: "Story " + s }, priceSeries: { status: "CALCULATED" }, asOf: VORHER };
}
function fixture({ basisAsOf = VORHER, stocks = [], snaps = [], details = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-imblick-live-"));
  mkdirSync(join(dir, "discover", "data", "im-blick"), { recursive: true });
  mkdirSync(join(dir, "discover", "data", "stocks", "US_REAL"), { recursive: true });
  writeFileSync(join(dir, "discover", "data", "im-blick", "basis-US_REAL.json"), JSON.stringify({ asOf: basisAsOf, stocks }));
  for (const b of (details || stocks)) writeFileSync(join(dir, "discover", "data", "stocks", "US_REAL", b.s + ".json"), JSON.stringify(detail(b.s, b.sec)));
  for (const sn of snaps) {
    const d = join(dir, "quant", "data", "market", "intraday", sn.sessionDate);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, sn.securityId + ".json"), JSON.stringify(sn));
  }
  const out = join(dir, "out.json");
  const run = (now = NOW) => {
    const r = spawnSync(process.execPath, [SCRIPT, "--data-root", dir, "--out", out, "--now", now], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(readFileSync(out, "utf8"));
  };
  return { dir, run };
}

test("LV1 · laufende Sitzung: Auswahl aus 5-Minuten-Kursen, ohne Schlusskurs-Signale", () => {
  const stocks = [basisEintrag("AAA", { sec: "A" }), basisEintrag("BBB", { sec: "B", hi: 130 }), basisEintrag("CCC", { sec: "C" }),
                  basisEintrag("DDD", { sec: "D", trend: false })];
  const f = fixture({ stocks, snaps: [snapshot("AAA"), snapshot("BBB", { last: 104, points: [["09:30", 101], ["11:55", 104]] }),
                                      snapshot("CCC", { last: 98, points: [["09:30", 99], ["11:55", 98]] }), snapshot("DDD")] });
  try {
    const l = f.run();
    assert.equal(l.status, "LIVE", l.reason);
    assert.equal(l.basis, "INTRADAY");
    assert.equal(l.sessionDate, SESSION);
    assert.equal(l.eodAsOf, VORHER);
    assert.equal(l.asOfLocal, "11:55");
    const a = l.stocks.find((c) => c.symbol === "AAA");
    assert.ok(a, "AAA (ueber dem Schlusshoch, +11 % im Trend) fehlt");
    assert.equal(a.imBlick.basis, "INTRADAY");
    assert.equal(a.imBlick.asOfLocal, "11:55");
    const ids = a.imBlick.components.map((c) => c.id);
    for (const verboten of ["closeAtHigh", "breakout", "volume"]) assert.ok(!ids.includes(verboten), verboten);
    assert.ok(ids.includes("touchedHigh") && ids.includes("dayMove"));
    assert.equal(a.headline.kicker, "JAHRESHOCH IM TAGESVERLAUF");
    assert.ok(a.reasons.some((r) => r.value === "über dem 52-Wochen-Schlusshoch"));
    assert.ok(a.reasons.some((r) => r.label === "heute bisher" && r.value === "+11,0 %"));
    assert.equal(a.live.changePercent, 11);
    /* CCC liegt im Minus, DDD ohne Trend: keine Bewegungspunkte. */
    assert.ok(!l.stocks.some((c) => c.symbol === "CCC"));
    const d = l.stocks.find((c) => c.symbol === "DDD");
    if (d) assert.ok(!d.imBlick.components.some((c) => c.id === "dayMove"));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("LV2 · nur zeitlich passende Daten: veraltete Snapshots und fremder Vortagesschluss fallen heraus; Basis muss die Vorsitzung sein", () => {
  const stocks = [basisEintrag("NEU", { sec: "A" }), basisEintrag("ALT", { sec: "B" }), basisEintrag("SPLIT", { sec: "C" })];
  const f = fixture({ stocks, snaps: [snapshot("NEU"), snapshot("ALT", { asOf: "2026-10-14T14:30:00.000Z", asOfLocal: "10:30" }),
                                      snapshot("SPLIT", { prev: 50 })] });
  try {
    const l = f.run();
    assert.deepEqual(l.stocks.map((c) => c.symbol), ["NEU"]);
    assert.equal(l.coverage.withSnapshot, 3);
    assert.equal(l.coverage.stale, 2);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
  const g = fixture({ basisAsOf: "2026-10-09", stocks: [basisEintrag("NEU")], snaps: [snapshot("NEU")] });
  try {
    const l = g.run();
    assert.equal(l.status, "EOD_STALE");
    assert.deepEqual(l.stocks, []);
  } finally { rmSync(g.dir, { recursive: true, force: true }); }
});

test("LV3 · nach dem Abendlauf gilt die Schlusskurs-Auswahl; ohne Snapshots oder Ereignis keine Auswahl", () => {
  const f = fixture({ basisAsOf: SESSION, stocks: [basisEintrag("NEU")], snaps: [snapshot("NEU")] });
  try { assert.equal(f.run("2026-10-14T23:30:00Z").status, "EOD_CURRENT"); } finally { rmSync(f.dir, { recursive: true, force: true }); }
  /* Samstag: juengste Sitzung (Fr 16.10.) liegt mehrere Sitzungen hinter der Basis 13.10. */
  const w = fixture({ stocks: [basisEintrag("NEU")], snaps: [snapshot("NEU")] });
  try { assert.equal(w.run("2026-10-17T15:00:00Z").status, "EOD_STALE"); } finally { rmSync(w.dir, { recursive: true, force: true }); }
  const n = fixture({ stocks: [basisEintrag("NEU")], snaps: [] });
  try { assert.equal(n.run().status, "NO_INTRADAY"); } finally { rmSync(n.dir, { recursive: true, force: true }); }
  const e = fixture({ stocks: [basisEintrag("RUHIG", { lp: 40, rs: 50, acc: 0, age: 20 })],
                      snaps: [snapshot("RUHIG", { last: 100.2, points: [["09:30", 100.1], ["11:55", 100.2]] })] });
  try {
    const l = e.run();
    assert.equal(l.status, "NO_EVENTS");
    assert.deepEqual(l.stocks, []);
  } finally { rmSync(e.dir, { recursive: true, force: true }); }
});

test("LV4 · Client: ersetzt die EOD-Auswahl nur bei LIVE, gleicher Basis, >= 3 Titeln und frischem Stand", async () => {
  const lauf = async (live, cardsAsOf = VORHER) => {
    const D = {};
    let ersetzt = null;
    const view = { isConnected: true, className: "v2-spotlight", dataset: { surface: "hero" }, replaceWith(n) { ersetzt = n; } };
    const window = { VUDiscover: D, QuantShell: { el() { return {}; } } };
    const fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(live) });
    vm.runInNewContext(readFileSync(join(ROOT, "discover", "ui", "featured.js"), "utf8"), { window, Date, fetch, Math });
    let gerendert = 0;
    const render = (surface) => { gerendert++; return gerendert === 1 ? view : { dataset: {}, className: "", cards: surface.cards }; };
    D.Featured.live({ cards: [{ symbol: "EOD", asOf: cardsAsOf }] }, { universeId: "US_REAL" }, render);
    await new Promise((r) => setTimeout(r, 10));
    return ersetzt;
  };
  const frisch = new Date().toISOString();
  const drei = [{ symbol: "A" }, { symbol: "B" }, { symbol: "C" }];
  const ok = await lauf({ status: "LIVE", eodAsOf: VORHER, generatedAt: frisch, stocks: drei });
  assert.ok(ok && ok.cards.length === 3 && ok.dataset.basis === "intraday" && ok.dataset.surface === "hero");
  /* Die beendete Sitzung wird gezeigt, aber nie als "intraday" gekennzeichnet. */
  const zu = await lauf({ status: "SESSION_CLOSED", eodAsOf: VORHER, generatedAt: frisch, stocks: drei });
  assert.ok(zu && zu.dataset.basis === "close-unconfirmed");
  assert.equal(await lauf({ status: "EOD_CURRENT", eodAsOf: VORHER, generatedAt: frisch, stocks: drei }), null);
  assert.equal(await lauf({ status: "LIVE", eodAsOf: "2026-10-12", generatedAt: frisch, stocks: drei }), null, "andere Basis");
  assert.equal(await lauf({ status: "LIVE", eodAsOf: VORHER, generatedAt: frisch, stocks: drei.slice(0, 2) }), null, "zu wenige");
  assert.equal(await lauf({ status: "LIVE", eodAsOf: VORHER, generatedAt: new Date(Date.now() - 4 * 3600000).toISOString(), stocks: drei }), null, "zu alt");
});

test("LV5 · Workflow nach ADR-005, Auslieferung ueber Pages, Eintrag im Register, Artefakt vorhanden", () => {
  const wf = readFileSync(join(ROOT, ".github", "workflows", "discover-im-blick-live.yml"), "utf8");
  assert.match(wf, /ref: \$\{\{ github\.ref \}\}/);
  assert.match(wf, /scripts\/ci\/push-with-retry\.sh/);
  assert.match(wf, /group: discover-im-blick-live-\$\{\{ github\.ref_name \}\}/);
  /* ADR-005: Workflow-Eingaben nur ueber env:, nie im Shell-Text. */
  for (const z of wf.split("\n").filter((l) => /\$\{\{[^}]*inputs\./.test(l) && !/^\s*#/.test(l))) {
    assert.match(z, /^\s+[A-Z_]+: \$\{\{/, "inputs ausserhalb einer env-Zeile: " + z.trim());
  }
  assert.match(wf, /git add discover\/live\n/, "schreibt nur discover/live");
  assert.doesNotMatch(wf, /TIINGO|secrets\./, "keine Anbieteranfrage, kein Schluessel");
  const name = wf.match(/^name:\s*(.+)$/m)[1];
  assert.ok(readFileSync(join(ROOT, ".github", "workflows", "pages-release.yml"), "utf8").includes(`- "${name}"`));
  const reg = JSON.parse(readFileSync(join(ROOT, "core", "registry", "domains.json"), "utf8"));
  const d = reg.domains.find((x) => x.id === "discoverImBlickLive");
  assert.ok(d && d.workflow === "discover-im-blick-live.yml" && d.producer === "scripts/discover/build-im-blick-live.mjs");
  assert.ok(existsSync(join(ROOT, d.artifact.slice(1))));
});

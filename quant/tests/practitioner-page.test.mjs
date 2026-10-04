/* Interne Praktiker-Referenzseite (quant/research/elliott-practitioners/).
   PRACTITIONER REFERENCE — keine objektive Wahrheit; die Seite ist INTERN.
   Geprüft wird:
     1. Skripte der Seite sind syntaktisch gültig (node --check bzw. new Function für Inline-Skripte),
     2. Pflicht-Kennzeichnungen (noindex, INTERN, „keine objektive Wahrheit“) und Blindmodus als Standard,
     3. die Formularlogik erzeugt JSONL-Zeilen, die die Pflichtfelder des Schemas practitioner-reference-1.0.0 erfüllen,
        Warnungen für LOW / LLM_DRAFT_UNREVIEWED, Stichtag nie nach der Veröffentlichung, Duplikaterkennung, Diff,
     4. (falls Playwright vorhanden) im echten Browser: leerer Zustand, Erfassen → Export, Blindmodus mit Sperre,
        blinde Zweitextraktion mit Feld-Diff. Ohne Playwright wird dieser Teil übersprungen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "quant/research/elliott-practitioners");
const HTML = readFileSync(join(DIR, "index.html"), "utf8");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "quant/data/technical-intelligence/practitioner-v1/schema/practitioner-reference-1.0.0.json"), "utf8"));
const require = createRequire(import.meta.url);
const Core = require(join(DIR, "reference-core.js"));

/* Unabhängige Pflichtfeldprüfung (nicht der Validator der Seite). */
function requiredMissing(rec) {
  const miss = [];
  for (const k of SCHEMA.required) if (!(k in rec)) miss.push(k);
  for (const [obj, sub] of [["publication", "publication"], ["instrument", "instrument"], ["extraction", "extraction"]])
    for (const k of SCHEMA.properties[sub].required) if (!rec[obj] || !(k in rec[obj])) miss.push(obj + "." + k);
  if (!Array.isArray(rec.evidence) || rec.evidence.length < 1) miss.push("evidence[min 1]");
  for (const e of rec.evidence || []) for (const k of SCHEMA.properties.evidence.items.required) if (!(k in e)) miss.push("evidence." + k);
  for (const k of Object.keys(rec)) if (!(k in SCHEMA.properties)) miss.push("extra:" + k);
  for (const [k, spec] of Object.entries(SCHEMA.properties)) if (spec.enum && k in rec && !spec.enum.includes(rec[k])) miss.push("enum:" + k);
  if (!new RegExp(SCHEMA.properties.referenceId.pattern).test(rec.referenceId)) miss.push("pattern:referenceId");
  return miss;
}

const SAMPLE = {
  sourceId: "test-source", sourceType: "YOUTUBE", sourceUrl: "https://example.org/video/123", localDateTime: "2024-03-12T18:00", timezone: "Europe/Berlin", precision: "MINUTE",
  timestampBasis: "Plattform-Metadaten", edited: "NO", asShown: "S&P 500 Cash", instrumentType: "INDEX_CASH", priceAdjustment: "UNADJUSTED", vuSymbol: "SPY",
  mappingQuality: "PROXY_DIFFERENT_INSTRUMENT", levelScale: "0,1", timeframe: "1D", elliottSchool: "PRACTITIONER_SPECIFIC",
  pPattern: "IMPULSE", pFamily: "MOTIVE", pDegreeLabel: "(iii)", pDegreeRank: "1", pCurrentWave: "(iii)", pRole: "MOTIVE", pState: "DEVELOPING",
  alternatives: [{ pattern: "ZIGZAG", currentWave: "B", directionalBias: "DOWN", trigger: "4950", note: "" }], directionalBias: "UP",
  targetZones: [{ low: "5300", high: "5400", label: "Ziel" }], invPrice: "4950", invDirection: "below", invBasis: "CLOSE",
  summary: "Eigene Kurzfassung: Aufwärtsimpuls, Welle drei läuft.", confidence: "HIGH", method: "HUMAN_FROM_PRIMARY", extractor: "TEST-EXT1",
  evidence: [{ field: "primary", locator: "03:15", note: "Zählung im Chart sichtbar" }], status: "TEST_FIXTURE"
};
function sampleRecord(over) {
  const st = Object.assign({}, SAMPLE, over || {});
  st.timestamp = Core.localToIso(st.localDateTime, st.timezone);
  st.analysisCutoff = Core.computeCutoff({ timestamp: st.timestamp, precision: st.precision, timezone: st.timezone, market: "US_EQUITY", timeframe: st.timeframe }).date;
  return Core.buildRecord(st);
}

test("Skripte der Seite sind syntaktisch gültig", () => {
  const srcs = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.includes("reference-core.js") && srcs.includes("practitioners.js"), "Seite lädt Kern und App");
  for (const s of srcs) {
    assert.ok(!/^(https?:)?\/\//.test(s), "keine externen Skripte: " + s);
    const file = s.startsWith("/") ? join(ROOT, s) : join(DIR, s);   // /quant/ui/shell.js: gemeinsame Shell (Abnahmetest §94)
    assert.ok(existsSync(file), "Skript vorhanden: " + s);
    const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(r.status, 0, s + ": " + r.stderr);
  }
  const inline = [...HTML.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const code of inline) assert.doesNotThrow(() => new Function(code));
  assert.ok(!/<link[^>]+href="https?:/.test(HTML), "keine externen Stylesheets");
});

test("Kennzeichnung: noindex, INTERN, keine objektive Wahrheit, Blindmodus als Standard", () => {
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(HTML, /INTERN/);
  assert.match(HTML, /PRACTITIONER REFERENCE — keine objektive Wahrheit/);
  assert.match(HTML, /nicht für Kunden/);
  assert.match(HTML, /<input type="checkbox" id="t-blind" checked>/, "Blindmodus-Schalter standardmäßig an");
  assert.match(HTML, /<div class="card pr hidden" id="pr-panel" data-blind="locked" hidden><\/div>/, "Praktiker-Panel startet verborgen und leer");
  const js = readFileSync(join(DIR, "practitioners.js"), "utf8");
  assert.match(js, /VU-Analyse sperren/);
  assert.match(js, /blind: true/, "Startzustand blind");
  assert.ok(!/\.innerHTML\s*=/.test(js), "kein innerHTML");
  assert.ok(!/(Trefferquote|hit.?rate)[^"]*rank/i.test(js.replace(/Keine Trefferquoten, keine Rankings/g, "")), "keine Ranking-Anzeige");
});

test("Formularzeile erfüllt die Pflichtfelder des Schemas und ist eine JSONL-Zeile", () => {
  const rec = sampleRecord();
  const line = Core.toJsonlLine(rec);
  assert.ok(!line.includes("\n"), "eine Zeile");
  const back = JSON.parse(line);
  assert.deepEqual(requiredMissing(back), []);
  assert.deepEqual(Core.validateSchema(SCHEMA, back), []);
  const v = Core.validateRecord(SCHEMA, back, { cutoffClose: 510 });
  assert.deepEqual(v.errors, []);
  assert.equal(back.publication.timestamp, "2024-03-12T18:00:00+01:00");
  assert.equal(back.analysisCutoff, "2024-03-11", "13:00 New York ist vor Handelsschluss → Vortag");
  assert.equal(back.instrument.levelScale, 0.1);
  assert.match(back.referenceId, /^pr_test-source_spy_20240312_[0-9a-f]{6}_v1$/);
  assert.equal(back.caseId, "test-source|SPY|2024-03-12|s1");
});

test("Protokollwarnungen: LOW nicht benchmarkfähig, LLM_DRAFT_UNREVIEWED zählt nie, Pflichtfelder fehlen", () => {
  const low = Core.validateRecord(SCHEMA, sampleRecord({ confidence: "LOW", status: "CANDIDATE" }), {});
  assert.ok(low.ok && !low.benchmarkEligible);
  assert.ok(low.warnings.some((w) => /nicht benchmarkfähig/.test(w)));
  const llm = Core.validateRecord(SCHEMA, sampleRecord({ method: "LLM_DRAFT_UNREVIEWED" }), {});
  assert.ok(llm.warnings.some((w) => /zählt nie/.test(w)) && !llm.benchmarkEligible);
  assert.ok(!Core.validateRecord(SCHEMA, sampleRecord({ method: "LLM_DRAFT_UNREVIEWED", status: "INCLUDED" }), {}).ok);
  const empty = Core.validateRecord(SCHEMA, Core.buildRecord({}), {});
  assert.ok(!empty.ok && empty.errors.length > 5);
  const long = Core.validateRecord(SCHEMA, sampleRecord({ summary: "x".repeat(401) }), {});
  assert.ok(!long.ok);
  const plaus = Core.validateRecord(SCHEMA, sampleRecord({ invPrice: "9950" }), { cutoffClose: 510 });
  assert.ok(plaus.warnings.some((w) => /±60 %/.test(w)), "Niveau außerhalb ±60 % wird gemeldet");
});

test("Stichtag: letzter Schluss strikt vor der Veröffentlichung; deckungsgleich mit cutoff.mjs (falls vorhanden)", async () => {
  const cutoffPath = join(ROOT, "scripts/technical/practitioner/cutoff.mjs");
  const ref = existsSync(cutoffPath) ? await import(cutoffPath) : null;
  const tzs = ["Europe/Berlin", "America/New_York", "UTC", "Asia/Tokyo"];
  let n = 0;
  for (let d = 0; d < 40; d++) for (const hh of ["00:30", "09:00", "15:59", "16:00", "17:45", "23:59"]) for (const tz of tzs) for (const prec of ["MINUTE", "HOUR", "DAY"]) for (const market of Object.keys(Core.MARKETS)) for (const tf of ["1D", "1W"]) {
    const date = Core.addDays("2024-01-01", d * 5), ts = Core.localToIso(date + "T" + hh, tz);
    const c = Core.computeCutoff({ timestamp: ts, precision: prec, timezone: tz, market, timeframe: tf });
    assert.ok(c.date && c.date <= ts.slice(0, 10), ts + " " + prec + " " + market + " → " + c.date);
    if (prec === "DAY") assert.ok(c.date < ts.slice(0, 10));
    const mk = Core.MARKETS[market], close = mk.closeH === 24 ? Date.parse(Core.addDays(c.dailyDate, 1) + "T00:00:00Z") : Core.zonedToUtc(c.dailyDate, mk.closeH, mk.closeM, mk.tz);
    assert.ok(close < Date.parse(ts), "Schluss des Stichtags liegt vor der Veröffentlichung: " + ts + " " + market);
    if (ref) {
      const r = ref.computeAnalysisCutoff({ timestamp: ts, timestampPrecision: prec, timezone: tz }, market);
      const want = tf === "1W" ? ref.lastCompleteWeekEnd(r.analysisCutoff, market) : r.analysisCutoff;
      assert.equal(c.date, want, "wie cutoff.mjs: " + ts + " " + prec + " " + market + " " + tf); n++;
    }
  }
  if (ref) assert.ok(n > 1000);
});

test("Import: Duplikat, Konflikt, Kollision caseId/URL, Zweitextraktion; Diff der Doppelextraktion", () => {
  const a = sampleRecord();
  assert.equal(Core.classifyImport(a, [a]).kind, "DUPLICATE");
  assert.equal(Core.classifyImport(Object.assign({}, a, { directionalBias: "DOWN" }), [a]).kind, "CONFLICT");
  assert.equal(Core.classifyImport(Object.assign({}, a, { referenceId: "pr_other" }), [a]).kind, "COLLISION_CASE");
  assert.equal(Core.classifyImport(Object.assign({}, a, { referenceId: "pr_other", caseId: "x|y|z|s1", sourceUrl: "https://www.example.org/video/123/" }), [a]).kind, "COLLISION_URL");
  const b = Core.buildRecord(Object.assign({}, SAMPLE, { timestamp: a.publication.timestamp, analysisCutoff: a.analysisCutoff, caseId: a.caseId, secondPassOf: a.referenceId, extractor: "TEST-EXT2", pCurrentWave: "iii", invPrice: "4900" }));
  assert.equal(b.referenceId, a.referenceId + "-p2");
  assert.equal(b.status, "EXCLUDED");
  assert.deepEqual(Core.validateRecord(SCHEMA, b, { firstPass: a }).errors, []);
  assert.ok(Core.validateRecord(SCHEMA, Core.buildRecord(Object.assign({}, SAMPLE, { timestamp: a.publication.timestamp, analysisCutoff: a.analysisCutoff, caseId: a.caseId, secondPassOf: a.referenceId })), { firstPass: a }).errors.some((e) => /anderen Person/.test(e)));
  assert.equal(Core.classifyImport(b, [a]).kind, "SECOND_PASS");
  const d = Core.diffRecords(a, b);
  const row = (f) => d.rows.find((r) => r.field === f).status;
  assert.equal(row("primary.currentWave"), "CLOSE");
  assert.equal(row("invalidation.price"), "DIFF");
  assert.equal(row("primary.pattern"), "EQUAL");
  const p = Core.parseJsonl(Core.toJsonl([a, b]) + "{kaputt\n");
  assert.equal(p.records.length, 2); assert.equal(p.errors.length, 1);
  assert.deepEqual(Core.buildRecord(Core.recordToState(a)), a, "Bearbeiten → Speichern ist verlustfrei");
});

/* ---------------------------------------------------------------- Browser (optional) */
function loadPlaywright() { for (const p of ["playwright", "/opt/node-tools/node_modules/playwright"]) { try { return require(p); } catch (e) { /* weiter */ } } return null; }
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jsonl": "application/x-ndjson" };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); createReadStream(file).pipe(rsp);
    });
    srv.listen(0, "127.0.0.1", () => res(srv));
  });
}

test("Browser: leerer Zustand, Erfassen → Export, Blindmodus mit Sperre, Zweitextraktion mit Diff", { timeout: 120000 }, async (t) => {
  const pw = loadPlaywright();
  if (!pw) { t.skip("Playwright nicht verfügbar"); return; }
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) { t.skip("Chromium nicht startbar: " + e.message); return; }
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/quant/research/elliott-practitioners/";
  const shots = process.env.PRACTITIONER_SCREENSHOT_DIR || null;
  const errors = [];
  try {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(base);
      await page.waitForSelector("body[data-ready='1']");
      // Ohne Referenzen: ehrlicher leerer Zustand, kein horizontales Scrollen
      assert.match(await page.textContent("#empty-state"), /manuell über „Referenz erfassen“/);
      assert.ok(await page.isVisible("#empty-state"));
      assert.equal(await page.isVisible("#pr-panel"), false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, "kein horizontales Scrollen bei " + vp.width + "px (" + overflow + ")");
      if (shots) await page.screenshot({ path: join(shots, "practitioner-empty-" + vp.width + ".png"), fullPage: true });
      await ctx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept());
    await page.goto(base);
    await page.waitForSelector("body[data-ready='1']");
    await page.fill("#t-code", "TEST-EXT1"); await page.press("#t-code", "Tab");
    await page.click("#tab-capture");
    const sel = (id, v) => page.selectOption("#cap-" + id, v);
    const fill = (id, v) => page.fill("#cap-" + id, v);
    await sel("sourceSel", "__other"); await fill("sourceOther", "test-source"); await sel("sourceType", "YOUTUBE"); await fill("sourceUrl", "https://example.org/video/123");
    await fill("localDateTime", "2024-03-12T18:00"); await fill("timezone", "Europe/Berlin"); await sel("precision", "MINUTE"); await fill("timestampBasis", "Plattform-Metadaten");
    await fill("asShown", "SPY"); await sel("instrumentType", "ETF"); await fill("vuSymbol", "SPY"); await sel("mappingQuality", "EXACT"); await sel("timeframe", "1D");
    await sel("elliottSchool", "CLASSICAL"); await sel("pPattern", "IMPULSE"); await fill("pCurrentWave", "3"); await sel("pRole", "MOTIVE"); await sel("pState", "DEVELOPING");
    await sel("directionalBias", "UP"); await fill("invPrice", "495"); await sel("invDirection", "below"); await sel("invBasis", "CLOSE");
    await page.click("#cap-targetZones-add");
    await page.fill("#cap-targetZones [data-k=low]", "530"); await page.fill("#cap-targetZones [data-k=high]", "540");
    await fill("summary", "Eigene Kurzfassung ohne Zitat.");
    await page.selectOption("#cap-evidence [data-k=field]", "primary"); await page.fill("#cap-evidence [data-k=locator]", "03:15"); await page.fill("#cap-evidence [data-k=note]", "Zählung sichtbar");
    await sel("confidence", "LOW"); await sel("status", "TEST_FIXTURE");
    await page.waitForFunction(() => /SPY/.test(document.getElementById("cap-cutrule").dataset.series || ""));
    await page.evaluate(() => window.__practitionerPage.form("cap").check());
    assert.match(await page.textContent("#cap-checks"), /nicht benchmarkfähig/);
    assert.equal(await page.inputValue("#cap-analysisCutoff"), "2024-03-11");
    assert.match(await page.textContent("#cap-counter"), /^30 \/ 400/);
    if (shots) await page.screenshot({ path: join(shots, "practitioner-form-1280.png"), fullPage: true });
    await page.click("#cap-save");
    assert.match(await page.textContent("#t-msg"), /Lokal gespeichert/);
    const jsonl = await page.evaluate(() => window.__practitionerPage.exportJsonl());
    const lines = jsonl.trim().split("\n");
    assert.equal(lines.length, 1);
    const rec = JSON.parse(lines[0]);
    assert.deepEqual(requiredMissing(rec), []);
    assert.deepEqual(Core.validateSchema(SCHEMA, rec), []);
    assert.equal(rec.extraction.extractor, "TEST-EXT1");

    // Import derselben Zeile → Duplikat
    const rep = await page.evaluate((t) => window.__practitionerPage.importJsonl(t, "test", false), jsonl);
    assert.equal(rep[0].kind, "DUPLICATE"); assert.equal(rep[0].action, "übersprungen");

    // Blindmodus: Praktiker-Panel erst nach Anzeige + Sperre der VU-Analyse
    await page.click("#tab-compare");
    await page.waitForSelector("#btn-show-vu");
    assert.equal(await page.isVisible("#pr-panel"), false, "Praktiker-Panel im Blindmodus verborgen");
    assert.equal(await page.getAttribute("#pr-panel", "data-blind"), "locked");
    assert.ok(await page.isDisabled("#btn-lock"), "Sperren erst nach Anzeige der VU-Analyse");
    await page.click("#btn-show-vu");
    await page.waitForSelector("#vu-panel dl", { timeout: 60000 });
    assert.match(await page.textContent("#vu-panel"), /elliott-3\.2\.2/);
    assert.equal(await page.isVisible("#pr-panel"), false);
    await page.click("#btn-lock");
    await page.waitForSelector("#pr-panel:not([hidden])");
    assert.match(await page.textContent("#pr-panel"), /keine objektive Wahrheit/);
    assert.ok(await page.isVisible("#disagree-panel"));
    const log = await page.evaluate(() => window.__practitionerPage.auditLog().map((e) => e.action));
    assert.ok(log.includes("VU_SHOWN") && log.includes("LOCK_VU") && log.includes("PRACTITIONER_SHOWN"));
    assert.ok(log.indexOf("LOCK_VU") < log.indexOf("PRACTITIONER_SHOWN"));
    await page.click("#btn-outcome");
    await page.waitForSelector("#outcome-body dl");
    if (shots) await page.screenshot({ path: join(shots, "practitioner-compare-1280.png"), fullPage: true });

    // Blinde Zweitextraktion mit anderem Code
    await page.fill("#t-code", "TEST-EXT2"); await page.press("#t-code", "Tab");
    await page.click("#tab-second");
    await page.selectOption("#sp-case", rec.referenceId);
    await page.click("#sp-start");
    await page.waitForSelector("#sp-form");
    assert.equal(await page.inputValue("#sp-pCurrentWave"), "", "Erstwerte nicht sichtbar");
    const s2 = (id, v) => page.selectOption("#sp-" + id, v), f2 = (id, v) => page.fill("#sp-" + id, v);
    await f2("localDateTime", "2024-03-12T18:00"); await f2("timezone", "Europe/Berlin"); await s2("precision", "MINUTE"); await f2("timestampBasis", "Plattform-Metadaten");
    await f2("asShown", "SPY"); await s2("instrumentType", "ETF"); await f2("vuSymbol", "SPY"); await s2("mappingQuality", "EXACT"); await s2("timeframe", "1D");
    await s2("elliottSchool", "CLASSICAL"); await s2("pPattern", "IMPULSE"); await f2("pCurrentWave", "5"); await s2("directionalBias", "UP");
    await f2("invPrice", "490"); await s2("invDirection", "below");
    await page.selectOption("#sp-evidence [data-k=field]", "primary"); await page.fill("#sp-evidence [data-k=note]", "Zählung sichtbar");
    await s2("confidence", "MEDIUM");
    await page.click("#sp-save");
    await page.waitForSelector("#diff-card");
    const diffText = await page.textContent("#diff-card");
    assert.match(diffText, /primary\.currentWave/);
    assert.match(diffText, /abweichend/);
    if (shots) { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(shots, "practitioner-diff-390.png"), fullPage: true }); }
    const all = await page.evaluate(() => window.__practitionerPage.locals().map((x) => x.record));
    const p2 = all.find((r) => r.referenceId === rec.referenceId + "-p2");
    assert.ok(p2 && p2.status === "EXCLUDED");
    assert.equal(all.find((r) => r.referenceId === rec.referenceId).extraction.secondPass, p2.referenceId);
    assert.deepEqual(requiredMissing(p2), []);
    await ctx.close();
    assert.deepEqual(errors, [], "keine Laufzeitfehler");
  } finally {
    await browser.close();
    srv.close();
  }
});

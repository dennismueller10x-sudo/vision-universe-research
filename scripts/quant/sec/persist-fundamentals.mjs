/* =========================================================================
   VISION UNIVERSE — persist-fundamentals.mjs

   Die dauerhafte Ablage der Fundamentalschicht.

   WARUM ES DIESE DATEI GIBT

   Der Faktenspeicher (quant/data/sec/facts, 5.437 normalisierte
   Factbooks mit jeder Beobachtung, ihrem Einreichungsdatum, ihrer
   Akzessionsnummer, Waehrung, Qualitaet und Restatement-Kette) lag bis
   hierher an genau EINEM Ort: im GitHub-Actions-Cache. Der Cache wird
   nach sieben Tagen ohne Zugriff verdraengt und teilt sich 10 GB mit
   allem anderen. Ein Bestand, der nur dort liegt, ist nicht
   persistiert - er ist geparkt.

   WAS SIE TUT

   Sie legt jede Store-Datei BYTE-GLEICH als Objekt unter
   v1/sec/fundamentals/facts/<cik>.json.gz ab, mit einem Index, der je
   Objekt die sha256 traegt. Ein zweiter Lauf schreibt nur, was sich
   geaendert hat: ein Lauf ohne Aenderung kostet keinen Schreibvorgang.

   WAS SIE NICHT TUT

   Sie fasst v1/tiingo/... nicht an. Nicht "wir haben es nicht getan",
   sondern "es ist nachgewiesen": ein Zeuge um den Treiber wirft bei
   jedem Schluessel ausserhalb des eigenen Praefixes. Der Kursstore
   bleibt unveraendert, und das Skript kann es gar nicht anders.

   Sie erfindet keine zweite Speicherarchitektur: derselbe S3-Treiber,
   dieselbe Nullkosten-Haertung, dasselbe Index-Muster wie die
   Kurshistorie. Gegen ein Verzeichnis laeuft sie mit dem fs-Treiber -
   die Bauart-Kontrolle, die beweist, dass sie nichts ueber den Dienst
   annimmt.
   ========================================================================= */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { createBudget } = require(join(root, "quant", "engines", "zero-cost-guard.js"));

export const VERSION = "fundamentals-store-1.0.0";
export const PREFIX = "v1/sec/fundamentals";
export const FACTS_PREFIX = PREFIX + "/facts/";
export const INDEX_KEY = PREFIX + "/_index.json.gz";
export const MANIFEST_KEY = PREFIX + "/_manifest.json";
/* Der Processing State des taeglichen Laufs. Er liegt im Repository
   (lesbar) und hier (dauerhaft): ein gescheiterter Commit-Schritt darf
   nicht vergessen, welche Filings schon verarbeitet sind. */
const DAILY_STATE_KEY = PREFIX + "/_daily-state.json";
const DAILY_STATE_PATH = join(root, "quant", "data", "fundamentals", "daily", "state.json");

const FACT_DIR = process.env.SEC_FACT_DIR || join(root, "quant", "data", "sec", "facts");
const RELOAD_DIR = process.env.SEC_RELOAD_DIR || join(root, ".sec-reload", "facts");
const REPORT_PATH = join(root, "quant", "data", "fundamentals", "persistence.json");

function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }

/* ------------------------------------------------------------- Der Zeuge

   Jeder Zugriff wird mitgeschrieben, und jeder Schluessel ausserhalb
   des eigenen Praefixes wirft. Die Zusage "der Kursstore bleibt
   unveraendert" haengt damit nicht an der Sorgfalt dieses Skripts. */
export function witness(driver, allowedPrefix, log) {
  const guard = (op, key) => {
    if (key && !String(key).startsWith(allowedPrefix)) {
      throw new Error("PERSIST_TOUCHED_FOREIGN_KEY: " + op + " " + key +
                      " liegt ausserhalb von '" + allowedPrefix + "'.");
    }
    log.push({ op, key: key || "(bucket)" });
  };
  return {
    kind: driver.kind, endpoint: driver.endpoint, bucket: driver.bucket,
    async put(k, b, o) { guard("PUT", k); return driver.put(k, b, o); },
    async get(k) { guard("GET", k); return driver.get(k); },
    async head(k) { guard("HEAD", k); return driver.head(k); },
    async list(p) { guard("LIST", p); return driver.list(p); }
  };
}

export async function makeDriver(opts) {
  if (opts.fsRoot) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    return createFsDriver(opts.fsRoot);
  }
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  return createS3DriverFromEnv(process.env);
}

/* --------------------------------------------------------- Lokaler Bestand */
/* Der Bestand wird NICHT in den Speicher geladen. 5.437 Factbooks zu
   je 400 KB waeren zwei Gigabyte im Heap - der zweite Produktivlauf ist
   an genau dieser Bauart gestorben. Hier wird je Datei die sha256
   gerechnet und der Puffer sofort losgelassen; gelesen wird erst
   wieder, wenn geschrieben wird - und dann eine Datei nach der anderen. */
export function localFacts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{10}\.json\.gz$/.test(f))
    .sort()
    .map((f) => {
      const file = join(dir, f);
      const buf = readFileSync(file);
      const entry = { cik: f.slice(0, 10), file, bytes: buf.length, sha256: sha256(buf) };
      Object.defineProperty(entry, "buf", { get: () => readFileSync(file), enumerable: false });
      return entry;
    });
}

/* Was ein Factbook fuer den Index hergibt - OHNE es zu halten. Das
   Dokument wird einmal gelesen, und was der Index braucht, ist klein:
   Version, Spanne, Waehrung, Zaehlungen. */
export function summarize(doc) {
  const timelines = (doc.factbook && doc.factbook.timelines) || [];
  let first = null, last = null, annual = 0, quarterly = 0, observations = 0;
  const currencies = new Set();
  for (const t of timelines) {
    const obs = t.observations || [];
    observations += obs.length;
    if (t.fiscal_period === "FY") annual++; else quarterly++;
    for (const o of obs) {
      if (o.period_end) {
        if (!first || o.period_end < first) first = o.period_end;
        if (!last || o.period_end > last) last = o.period_end;
      }
      const u = o.unit || "";
      if (/^[A-Z]{3}$/.test(u)) currencies.add(u);
      else if (u.endsWith("/shares") && /^[A-Z]{3}$/.test(u.split("/")[0])) currencies.add(u.split("/")[0]);
    }
  }
  const q = (doc.quality && doc.quality.summary) || {};
  return {
    normalizationLogic: doc.versions && doc.versions.normalization_logic,
    mappingVersion: doc.versions && doc.versions.metric_registry && doc.versions.metric_registry.mapping_version,
    formula: doc.versions && doc.versions.formula,
    timelines: timelines.length, annualTimelines: annual, quarterlyTimelines: quarterly,
    observations, firstPeriodEnd: first, lastPeriodEnd: last,
    currencies: [...currencies].sort(),
    filings: (doc.filing_index || []).length,
    qualityFindings: q.total || 0,
    latestForm: doc.latest_filing && doc.latest_filing.form
  };
}

async function readIndex(driver, budget) {
  budget.consumeClassB(1, "GET " + INDEX_KEY);
  const buf = await driver.get(INDEX_KEY);
  if (!buf) return { version: VERSION, objects: {} };
  return JSON.parse(gunzipSync(buf).toString("utf8"));
}

/* ------------------------------------------------------------------ PUSH */
/* Wie viele Objekte gleichzeitig unterwegs sind. Ein Lauf, der alle
   5.437 Factbooks neu normalisiert hat, schreibt alle 5.437 - eines
   nach dem anderen dauerte ueber vierzig Minuten, und die Zeit ging
   nicht in die Leitung, sondern ins Warten auf jede einzelne Antwort.
   Acht parallel ist weit unter dem, was R2 vertraegt, und weit ueber
   dem, was der Runner braucht. */
export const PARALLEL_UPLOADS = Math.max(1, Number(process.env.VU_PERSIST_PARALLEL || 8));

export async function push(driver, { facts, dryRun, log, parallel = PARALLEL_UPLOADS }) {
  /* main() reicht als `log` das Zeugenprotokoll durch - ein Array, keine
     Funktion. Lauf 34760939310 starb daran nach genau 500 Objekten:
     "log is not a function". Der Test hatte 23 Objekte und kein log. */
  const say = typeof log === "function" ? log : () => {};
  const changed = [];
  const budget = createBudget({ classAOperations: facts.length + 2, classBOperations: 2 });
  const index = await readIndex(driver, budget);
  const objects = Object.assign({}, index.objects || {});
  let unchanged = 0, bytesUploaded = 0;

  const pending = facts.filter((f) => {
    const known = objects[f.cik];
    if (known && known.sha256 === f.sha256) { unchanged++; budget.noteSkippedWrite(); return false; }
    return true;
  });

  /* Jedes Objekt wird genau einmal gelesen, zusammengefasst und
     geschrieben; der Index bekommt seinen Eintrag erst, wenn das PUT
     zurueck ist. Ein Fehler bricht den Lauf ab - dann traegt der Index
     im Speicher noch den alten Stand, und der naechste Lauf schreibt
     genau die Objekte nach, deren sha256 dort fehlt. */
  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const f = pending[next++];
      const key = FACTS_PREFIX + f.cik + ".json.gz";
      const buf = f.buf;
      const summary = summarize(JSON.parse(gunzipSync(buf).toString("utf8")));
      if (!dryRun) {
        budget.consumeClassA(1, "PUT " + key);
        await driver.put(key, buf, {
          contentType: "application/gzip",
          metadata: { sha256: f.sha256, cik: f.cik, normalization: summary.normalizationLogic || "" }
        });
        budget.noteUpload(f.bytes);
      }
      bytesUploaded += f.bytes;
      objects[f.cik] = Object.assign({ key, bytes: f.bytes, sha256: f.sha256,
                                       persistedAt: new Date().toISOString() }, summary);
      changed.push(f.cik);
      if (changed.length % 500 === 0) say(`  ${changed.length}/${pending.length} geschrieben`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, pending.length) }, worker));
  changed.sort();

  const payload = {
    version: VERSION, prefix: PREFIX, generatedAt: new Date().toISOString(),
    objectCount: Object.keys(objects).length, objects
  };
  if (!dryRun && changed.length) {
    const buf = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
    budget.consumeClassA(1, "PUT " + INDEX_KEY);
    await driver.put(INDEX_KEY, buf, { contentType: "application/json" });
    budget.consumeClassA(1, "PUT " + MANIFEST_KEY);
    await driver.put(MANIFEST_KEY, Buffer.from(JSON.stringify({
      version: VERSION, generatedAt: payload.generatedAt, objectCount: payload.objectCount,
      changedThisRun: changed.length, unchangedThisRun: unchanged,
      note: "Faktenspeicher der SEC-Fundamentalschicht, byte-gleich mit " +
            "quant/data/sec/facts. Der Index traegt je Objekt die sha256; ein Lauf " +
            "ohne Aenderung schreibt nichts."
    }, null, 2)), { contentType: "application/json" });
  }
  return { changed: changed.length, unchanged, total: facts.length, bytesUploaded,
           objectCount: payload.objectCount, spent: budget.spent, index: payload };
}

/* ---------------------------------------------------------------- RELOAD

   Zurueckladen heisst nicht "die Datei existiert". Es heisst: das
   Objekt kommt aus dem Speicher, hat dieselbe sha256 wie der lokale
   Stand, laesst sich entpacken und parsen, und traegt jedes Feld, das
   der Vertrag verlangt. Was hier PASS sagt, ist gelesen, nicht
   angenommen. */
const REQUIRED_TOP = ["cik", "versions", "factbook", "quality", "filing_index", "profile"];
/* Die Akzessionsnummer steht in der Provenienz der Beobachtung, nicht
   auf ihrer obersten Ebene - so serialisiert restatements.py sie. Die
   erste Fassung suchte sie oben und erklaerte damit jede der 8.444
   Beobachtungen von Apple fuer PIT-unvollstaendig, obwohl jede eine
   trug. Ein Pruefer, der das Schema nicht kennt, prueft nichts. */
const REQUIRED_OBS = ["value", "unit", "filed", "period_end"];
const pitComplete = (o) =>
  REQUIRED_OBS.every((k) => o[k] !== undefined && o[k] !== null) &&
  !!(o.provenance && o.provenance.accession);

export async function reload(driver, { ciks, localByCik, outDir, log }) {
  const budget = createBudget({ classBOperations: ciks.length + 1 });
  const results = [];
  mkdirSync(outDir, { recursive: true });
  for (const cik of ciks) {
    const key = FACTS_PREFIX + cik + ".json.gz";
    budget.consumeClassB(1, "GET " + key);
    const buf = await driver.get(key);
    const r = { cik, key, found: !!buf };
    if (!buf) { results.push(r); continue; }
    r.bytes = buf.length;
    r.sha256 = sha256(buf);
    r.sha256MatchesLocal = localByCik[cik] ? localByCik[cik].sha256 === r.sha256 : null;
    let doc;
    try { doc = JSON.parse(gunzipSync(buf).toString("utf8")); r.parsed = true; }
    catch (e) { r.parsed = false; r.error = String(e.message); results.push(r); continue; }
    r.missingTopLevel = REQUIRED_TOP.filter((k) => !(k in doc));
    const obs = [];
    for (const t of (doc.factbook && doc.factbook.timelines) || []) for (const o of t.observations || []) obs.push(o);
    r.observations = obs.length;
    r.observationsMissingPitFields = obs.filter((o) => !pitComplete(o)).length;
    r.summary = summarize(doc);
    r.hasAnnual = r.summary.annualTimelines > 0;
    r.hasQuarterly = r.summary.quarterlyTimelines > 0;
    r.hasRestatementMetadata = ((doc.factbook && doc.factbook.timelines) || []).some((t) => "restated" in t);
    r.hasQualityStates = !!(doc.quality && doc.quality.summary);
    r.hasNormalizationVersion = !!(doc.versions && doc.versions.normalization_logic);
    writeFileSync(join(outDir, cik + ".json.gz"), buf);
    r.pass = r.parsed && r.sha256MatchesLocal !== false && r.missingTopLevel.length === 0 &&
             r.observationsMissingPitFields === 0 && r.hasAnnual && r.hasQualityStates &&
             r.hasNormalizationVersion && r.hasRestatementMetadata;
    results.push(r);
  }
  return { results, spent: budget.spent };
}

/* --------------------------------------------------------------- RESTORE

   Der lokale Speicher ist ein Cache. Faellt er weg (Actions-Cache nach
   sieben Tagen verdraengt, neuer Runner), kommt er aus R2 zurueck -
   Objekt fuer Objekt, nur was fehlt oder abweicht. Das ist der Grund,
   warum der Normalbetrieb keinen Full Backfill mehr braucht. */
export async function restore(driver, { localDir, log, parallel = PARALLEL_UPLOADS }) {
  const say = typeof log === "function" ? log : () => {};
  const budget = createBudget({ classBOperations: 200000 });
  const index = await readIndex(driver, budget);
  const objects = index.objects || {};
  mkdirSync(localDir, { recursive: true });
  const local = Object.fromEntries(localFacts(localDir).map((f) => [f.cik, f]));
  const pending = Object.values(objects).filter((o) => {
    const have = local[o.key.slice(FACTS_PREFIX.length, -".json.gz".length)];
    return !have || have.sha256 !== o.sha256;
  });
  let restored = 0, mismatched = 0, next = 0;
  async function worker() {
    while (next < pending.length) {
      const o = pending[next++];
      const cik = o.key.slice(FACTS_PREFIX.length, -".json.gz".length);
      budget.consumeClassB(1, "GET " + o.key);
      const buf = await driver.get(o.key);
      if (!buf) { mismatched++; continue; }
      if (sha256(buf) !== o.sha256) { mismatched++; continue; }
      writeFileSync(join(localDir, cik + ".json.gz"), buf);
      budget.noteDownload ? budget.noteDownload(buf.length) : null;
      restored++;
      if (restored % 500 === 0) say(`  ${restored}/${pending.length} wiederhergestellt`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, pending.length) }, worker));
  return { indexObjects: Object.keys(objects).length, alreadyLocal: Object.keys(objects).length - pending.length,
           restored, mismatched, spent: budget.spent };
}

/* ------------------------------------------------------------------ MAIN */
function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : dflt;
}
const has = (name) => process.argv.includes(name);

async function main() {
  const fsRoot = arg("--fs", null);
  const dryRun = has("--dry-run");
  const doPush = has("--push");
  const reloadCiks = (arg("--reload", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const doRestore = has("--restore");
  const touched = [];
  const raw = await makeDriver({ fsRoot });
  const driver = witness(raw, PREFIX + "/", touched);

  console.log("Vision Universe — dauerhafte Fundamentalablage\n");
  console.log(`  Treiber:  ${driver.kind}  ${driver.endpoint}${driver.bucket ? "/" + driver.bucket : ""}`);
  console.log(`  Praefix:  ${PREFIX}/   (nur hier, der Zeuge wirft sonst)`);

  const facts = localFacts(FACT_DIR);
  console.log(`  Lokal:    ${facts.length} Factbooks unter ${FACT_DIR}`);
  /* Push und Reload laufen im Workflow als zwei Aufrufe. Der zweite
     darf den Bericht des ersten nicht ueberschreiben - sonst steht nach
     der Abnahme kein PERSISTED_* mehr im Bericht, und genau das ist
     passiert. Was dieser Aufruf nicht selbst misst, bleibt stehen. */
  const previous = existsSync(REPORT_PATH) ? JSON.parse(readFileSync(REPORT_PATH, "utf8")) : {};
  const report = { version: VERSION, generatedAt: new Date().toISOString(), driver: driver.kind,
                   endpointKind: fsRoot ? "fs" : "s3", prefix: PREFIX, localFactbooks: facts.length };
  if (!doPush && previous.push) { report.push = previous.push; report.persisted = previous.persisted; }
  if (!reloadCiks.length && previous.reload) report.reload = previous.reload;
  if (!doRestore && previous.restore) report.restore = previous.restore;

  if (doRestore) {
    const r = await restore(driver, { localDir: FACT_DIR, log: (m) => console.log(m) });
    console.log(`\n  RESTORE: ${r.restored} wiederhergestellt, ${r.alreadyLocal} schon lokal, ` +
                `${r.mismatched} nicht lesbar, ${r.indexObjects} Objekte im Index`);
    report.restore = r;
    if (r.mismatched > 0) { console.error("  FEHLER: nicht alle Objekte aus R2 lesbar."); process.exitCode = 1; }
  }

  if (doPush && !dryRun && existsSync(DAILY_STATE_PATH)) {
    const buf = readFileSync(DAILY_STATE_PATH);
    await driver.put(DAILY_STATE_KEY, buf, { contentType: "application/json" });
    report.dailyState = { key: DAILY_STATE_KEY, bytes: buf.length, pushed: true };
    console.log(`  Daily-State nach ${DAILY_STATE_KEY} (${buf.length} B)`);
  }
  if (doRestore && !existsSync(DAILY_STATE_PATH)) {
    const buf = await driver.get(DAILY_STATE_KEY);
    if (buf) {
      mkdirSync(dirname(DAILY_STATE_PATH), { recursive: true });
      writeFileSync(DAILY_STATE_PATH, buf);
      report.dailyState = { key: DAILY_STATE_KEY, bytes: buf.length, restored: true };
      console.log(`  Daily-State aus ${DAILY_STATE_KEY} wiederhergestellt (${buf.length} B)`);
    }
  }

  if (doPush) {
    const r = await push(driver, { facts, dryRun, log: touched });
    console.log(`\n  PUSH${dryRun ? " (Probelauf)" : ""}: ${r.changed} geschrieben, ${r.unchanged} unveraendert, ` +
                `${r.objectCount} Objekte im Index, ${(r.bytesUploaded / 1048576).toFixed(1)} MB`);
    report.push = { changed: r.changed, unchanged: r.unchanged, objectCount: r.objectCount,
                    bytesUploaded: r.bytesUploaded, dryRun, spent: r.spent };
    const idx = r.index.objects;
    report.persisted = {
      PERSISTED_ISSUERS: Object.keys(idx).length,
      PERSISTED_ANNUAL_HISTORIES: Object.values(idx).filter((o) => o.annualTimelines > 0).length,
      PERSISTED_QUARTERLY_HISTORIES: Object.values(idx).filter((o) => o.quarterlyTimelines > 0).length,
      PERSISTED_PIT_HISTORIES: Object.values(idx).filter((o) => o.observations > 0).length,
      PERSISTED_METADATA: Object.values(idx).filter((o) => o.filings > 0 && o.normalizationLogic).length,
      PERSISTED_STORAGE_BYTES: Object.values(idx).reduce((a, o) => a + (o.bytes || 0), 0),
      PERSISTENCE_LOCATION: (fsRoot ? "fs:" + fsRoot : "r2:" + (driver.bucket || "?")) + "/" + PREFIX + "/",
      byNormalizationVersion: Object.values(idx).reduce((a, o) => { a[o.normalizationLogic || "?"] = (a[o.normalizationLogic || "?"] || 0) + 1; return a; }, {}),
      currencies: Object.values(idx).reduce((a, o) => { for (const c of o.currencies || []) a[c] = (a[c] || 0) + 1; return a; }, {})
    };
  }

  if (reloadCiks.length) {
    const localByCik = Object.fromEntries(facts.map((f) => [f.cik, f]));
    const r = await reload(driver, { ciks: reloadCiks, localByCik, outDir: RELOAD_DIR, log: touched });
    console.log(`\n  RELOAD: ${r.results.length} angefragt`);
    for (const x of r.results) {
      console.log(`    ${x.cik}  ${x.pass ? "PASS" : "FAIL"}  ${x.found ? x.bytes + " B" : "nicht gefunden"}` +
                  (x.summary ? `  ${x.summary.annualTimelines} Jahres-/${x.summary.quarterlyTimelines} Quartalsreihen, ` +
                               `${x.summary.observations} Beobachtungen, ${x.summary.firstPeriodEnd}..${x.summary.lastPeriodEnd}, ` +
                               `${(x.summary.currencies || []).join("+") || "-"}, v${x.summary.normalizationLogic}` : ""));
    }
    report.reload = { requested: reloadCiks.length, passed: r.results.filter((x) => x.pass).length,
                      results: r.results.map(({ cik, key, found, bytes, sha256, sha256MatchesLocal, parsed,
                                                  missingTopLevel, observations, observationsMissingPitFields,
                                                  hasAnnual, hasQuarterly, hasRestatementMetadata, hasQualityStates,
                                                  hasNormalizationVersion, pass, summary }) =>
                        ({ cik, key, found, bytes, sha256, sha256MatchesLocal, parsed, missingTopLevel, observations,
                           observationsMissingPitFields, hasAnnual, hasQuarterly, hasRestatementMetadata,
                           hasQualityStates, hasNormalizationVersion, pass, summary })),
                      reloadDir: RELOAD_DIR, spent: r.spent };
  }

  report.witness = {
    allowedPrefix: PREFIX + "/",
    touchedKeys: touched.length,
    keysOutsidePrefix: touched.filter((t) => t.key !== "(bucket)" && !t.key.startsWith(PREFIX + "/")).length,
    priceStoreUntouched: true,
    note: "Der Zeuge um den Treiber wirft bei jedem Schluessel ausserhalb von " + PREFIX +
          "/. Dass hier 0 steht, ist deshalb kein Zaehlergebnis, sondern eine Eigenschaft: " +
          "das Skript KANN v1/tiingo/ nicht anfassen."
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(`\n  ${REPORT_PATH.replace(root + "/", "")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error("\n  FEHLER: " + e.message); process.exit(1); });
}

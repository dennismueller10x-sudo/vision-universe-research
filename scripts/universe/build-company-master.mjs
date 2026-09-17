/* =========================================================================
   VISION UNIVERSE — build-company-master.mjs

   Baut den kanonischen Company Master und schreibt ihn in Scherben.

   WAS DIESES SKRIPT LOEST

   Bis hierher hatte jede Oberflaeche ihr eigenes Universum, und das
   groesste davon hatte 498 Titel - nicht weil der Anbieter nicht mehr
   liefert (er liefert 108.573 Zeilen), sondern weil
   `scripts/market/build-market-factors.mjs` Einzelzeilen nur bis 500
   Titel ins Repository schreibt und `build-discover-data.mjs` genau diese
   Datei liest. Der Umweg ist damit vorbei: Discover, Suche und
   Aktienseite loesen ab jetzt gegen den Master auf, und der Master kennt,
   was der Anbieter kennt.

   QUELLEN, in dieser Reihenfolge

     1. Das vollstaendige Anbieterverzeichnis aus der Arbeitsablage
        (.market-cache/tiingo/universe/universe.json). Das ist der
        Normalfall im CI-Lauf mit Anbieterzugang.
     2. Die bereits ausgelieferten Gate-Universen unter
        quant/data/market/scale/. Das ist der Offline-Fall: ohne
        Anbieterzugang laesst sich das Verzeichnis nicht neu ziehen, und
        eine erfundene Liste waere schlimmer als eine kleinere.

   Welche Quelle gegriffen hat, steht im Manifest - nicht im Log.

   AUSLIEFERUNG

   Aufgenommen wird alles (§9, §11). Ausgeliefert wird, was
   quant/config/company-master.json unter `publish` erlaubt - eine
   Lizenzgrenze, keine Groessengrenze. Der vollstaendige Master geht in
   die Arbeitsablage.

   Ausfuehren:
     node scripts/universe/build-company-master.mjs
     node scripts/universe/build-company-master.mjs --from-directory <datei>
     node scripts/universe/build-company-master.mjs --dry-run
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const Master = require(join(root, "quant", "engines", "company-master.js"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

/* Ein absoluter Pfad bleibt absolut. join(root, "/tmp/x") ergibt
   "<root>/tmp/x" - die Datei landet dann im Repository statt dort, wo sie
   hin sollte. Gefunden hat das ein Test, der in ein Verzeichnis unter
   /tmp schreiben wollte und dabei das Arbeitsverzeichnis verschmutzt hat. */
function pfad(p) { return p.startsWith("/") ? p : join(root, p); }
const has = (name) => argv.indexOf(name) >= 0;

const CONFIG = readJSON(join(root, "quant", "config", "company-master.json"));
const TODAY = arg("--today", new Date().toISOString().slice(0, 10));
const DRY_RUN = has("--dry-run");
const OUT_ROOT = pfad(arg("--out", CONFIG.storage.root));
const WORK_ROOT = pfad(arg("--work-dir", CONFIG.storage.workingDir));
const INSTRUMENT_DIR = join(OUT_ROOT, "instruments");

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJSON(p, data) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  return Buffer.byteLength(JSON.stringify(data));
}

/* ------------------------------------------------------------- Firmennamen

   Die Tickerliste des Anbieters traegt keinen Namen. Die Namen, die es im
   Repository gibt, kommen aus vier Quellen unterschiedlicher Guete; die
   Reihenfolge ist die Rangfolge. Was keine Quelle kennt, bleibt leer und
   traegt companyNameStatus = SOURCE_MISSING. Ein aus dem Ticker
   abgeleiteter Name waere eine Erfindung. */
function buildNameMap() {
  const map = new Map();
  const merke = (ticker, name, quelle) => {
    if (!ticker || !name) return;
    const t = String(ticker).toUpperCase();
    if (map.has(t)) return;
    map.set(t, { name: String(name).trim(), source: quelle });
  };

  for (const file of ["market-universe.json", "tiingo-universe.json"]) {
    const p = join(root, "quant", "config", file);
    if (!existsSync(p)) continue;
    for (const s of readJSON(p).securities || []) merke(s.ticker, s.name, "quant/config/" + file);
  }

  const dash = join(root, "dashboard", "config", "universe.json");
  if (existsSync(dash)) {
    const cfg = readJSON(dash);
    for (const s of [].concat(cfg.stocks || [], cfg.benchmarks || [])) {
      merke(s.ticker || s.symbol, s.name || s.company, "dashboard/config/universe.json");
    }
  }

  const secIndex = join(root, "quant", "data", "sec", "inspector_index.json");
  if (existsSync(secIndex)) {
    for (const c of readJSON(secIndex).companies || []) {
      merke(c.ticker, titelSchreibweise(c.name), "quant/data/sec/inspector_index.json");
    }
  }

  const kuratiert = join(root, "discover", "config", "company-names.json");
  if (existsSync(kuratiert)) {
    for (const [ticker, name] of Object.entries(readJSON(kuratiert).names || {})) {
      merke(ticker, name, "discover/config/company-names.json");
    }
  }

  /* Die SEC zuletzt - aber mit Abstand die breiteste Quelle. Sie fuehrt
     den Namen JEDES US-Einreichers, nicht nur der kuratierten Titel, und
     sie ist oeffentlich und kostenlos (§32). Zuletzt, weil ihre
     Schreibweise Versalien ist: wo eine gepflegte Schreibweise vorliegt,
     gewinnt die. Wo keine vorliegt, ist "NVIDIA Corp" unendlich viel
     besser als gar kein Name - ohne ihn findet die Suche nach dem
     Unternehmen nichts (§17). */
  const cikMapFile = join(root, "quant", "data", "universe", "cik-map.json");
  if (existsSync(cikMapFile)) {
    const cm = readJSON(cikMapFile);
    if (cm.status === "OK" || cm.status === "FROM_CACHE") {
      for (const [ticker, row] of Object.entries(cm.byTicker || {})) {
        merke(ticker, titelSchreibweise(row.name), "sec:company_tickers");
      }
    }
  }
  return map;
}

/* Kuerzel -> CIK, aus demselben Artefakt. Getrennt vom Namen, weil eine
   CIK auch dann gilt, wenn der Name aus einer besseren Quelle kommt. */
function buildCikMap() {
  const map = new Map();
  const ambiguous = new Map();
  let secStatus = "ABSENT", secGeneratedAt = null, secReason =
    "quant/data/universe/cik-map.json fehlt. scripts/universe/build-cik-map.mjs baut sie.";

  const file = join(root, "quant", "data", "universe", "cik-map.json");
  if (existsSync(file)) {
    const cm = readJSON(file);
    secStatus = cm.status;
    secGeneratedAt = cm.generatedAt || null;
    if (cm.status === "OK" || cm.status === "FROM_CACHE") {
      secReason = null;
      for (const [ticker, row] of Object.entries(cm.byTicker || {})) {
        /* Ein ambiger Eintrag bekommt KEINE CIK. Er wird gefuehrt, damit
           er in der Bilanz auftaucht - geraten wird nicht (§3). */
        if (row.status === "AMBIGUOUS" || !row.cik) {
          ambiguous.set(ticker, { candidates: row.candidates || [], source: "sec:" + row.source });
          continue;
        }
        map.set(ticker, { cik: row.cik, exchange: row.exchange || null,
                          source: "sec:" + row.source, confidence: "HIGH" });
      }
    } else {
      secReason = cm.reason || "SEC-Verzeichnis nicht abrufbar.";
    }
  }

  /* Die handgepflegten CIKs aus quant/config/sec-universe.json.

     Sie stehen NEBEN der SEC-Zuordnung, nicht darunter: der Eintrag fuer
     XOM traegt `cik_authority: "config"` samt belegter Begruendung, weil
     der Ticker inzwischen auf eine neue Holding zeigt, die Historie aber
     beim alten CIK liegt. Genau diese Regel fuehrt auch scripts/quant/
     cli.py, und zwei verschiedene Antworten auf dieselbe Frage waeren
     schlimmer als keine.

     Ohne erklaerte Uebersteuerung gewinnt die SEC. */
  const cfgFile = join(root, "quant", "config", "sec-universe.json");
  let declared = 0, overrides = 0;
  if (existsSync(cfgFile)) {
    for (const c of readJSON(cfgFile).companies || []) {
      if (!c.ticker || !c.cik) continue;
      const ticker = String(c.ticker).toUpperCase();
      const cik = String(c.cik).replace(/\D/g, "").padStart(10, "0");
      const erklaert = c.cik_authority === "config" &&
                       String(c.cik_authority_reason || "").trim().length >= 40;
      if (map.has(ticker) && !erklaert) continue;
      if (map.has(ticker) && erklaert) overrides++;
      map.set(ticker, { cik, exchange: null,
                        source: erklaert ? "config:sec-universe(declaredOverride)"
                                         : "config:sec-universe",
                        confidence: erklaert ? "HIGH" : "MEDIUM" });
      ambiguous.delete(ticker);
      declared++;
    }
  }

  return { map, ambiguous, status: secStatus, generatedAt: secGeneratedAt, reason: secReason,
           declared, overrides };
}

/** "MERCK & CO INC" -> "Merck & Co Inc". Mehr wird nicht versucht. */
function titelSchreibweise(name) {
  if (!name || name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s&/(-])([a-z])/g, (m, vor, b) => vor + b.toUpperCase());
}

/* ----------------------------------------------------------------- Quellen */

function loadProviderDirectory() {
  const explicit = arg("--from-directory", null);
  const candidates = explicit
    ? [explicit]
    : [join(root, ".market-cache", "tiingo", "universe", "universe.json"),
       join(WORK_ROOT, "provider-directory.json")];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const payload = readJSON(p);
    const entries = payload.entries || payload.rows || [];
    if (!entries.length) continue;
    return {
      kind: "PROVIDER_DIRECTORY",
      file: p.replace(root + "/", ""),
      generatedAt: payload.generatedAt || null,
      providerSource: payload.source || null,
      rows: entries.map((e) => ({
        ticker: e.ticker || e.providerSymbol || e.symbol,
        exchange: e.exchange,
        assetType: e.assetType,
        currency: e.currency || e.priceCurrency,
        startDate: e.startDate,
        endDate: e.endDate,
        name: e.name || e.company || null,
        active: typeof e.active === "boolean" ? e.active : undefined,
        securityId: e.securityId || null,
        provider: e.provider || "tiingo"
      })),
      complete: true
    };
  }
  return null;
}

/* Offline-Ersatz: die bereits ausgelieferten Gate-Universen. Sie sind ein
   ECHTER Auszug aus demselben Anbieterverzeichnis (universeSource steht
   in jeder Datei) - kein Ersatzdatensatz. Was fehlt, ist der Rest des
   Verzeichnisses, und genau das steht danach im Manifest. */
function loadCommittedGateUniverses() {
  const dir = join(root, "quant", "data", "market", "scale");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^universe-.*\.json$/.test(f)).sort();
  if (!files.length) return null;

  const byTicker = new Map();
  const provenance = [];
  let providerRows = null, providerGeneratedAt = null;

  for (const f of files) {
    const payload = readJSON(join(dir, f));
    provenance.push({ file: "quant/data/market/scale/" + f, gate: payload.gate,
                      securities: (payload.securities || []).length });
    if (payload.universeSource && payload.universeSource.rows) {
      providerRows = Math.max(providerRows || 0, payload.universeSource.rows);
      providerGeneratedAt = payload.universeSource.generatedAt || providerGeneratedAt;
    }
    for (const s of payload.securities || []) {
      const key = String(s.ticker).toUpperCase() + "@" + String(s.exchange || "").toUpperCase();
      if (byTicker.has(key)) continue;
      byTicker.set(key, {
        ticker: s.ticker,
        exchange: s.exchange,
        assetType: s.assetType || "Stock",
        currency: s.currency,
        startDate: s.startDate,
        endDate: s.endDate || null,
        name: s.company || s.name || null,
        active: typeof s.active === "boolean" ? s.active : undefined,
        securityId: s.securityId || null,
        provider: s.provider || "tiingo"
      });
    }
  }

  return {
    kind: "COMMITTED_GATE_UNIVERSES",
    file: provenance.map((p) => p.file).join(", "),
    generatedAt: providerGeneratedAt,
    providerSource: { rows: providerRows,
                      note: "Zeilenzahl des Anbieterverzeichnisses, aus dem diese Auszuege stammen." },
    provenance,
    rows: Array.from(byTicker.values()),
    complete: false,
    incompleteReason:
      "Das vollstaendige Anbieterverzeichnis liegt in der Arbeitsablage (.market-cache) und " +
      "wird nicht mit dem Repository ausgeliefert. Ohne Anbieterzugang laesst es sich nicht neu " +
      "ziehen. Aufgenommen ist deshalb der bereits ausgelieferte Auszug - ein echter Auszug " +
      "derselben Quelle, aber nicht das Ganze. Mit gesetztem TIINGO_API_KEY holt " +
      "scripts/market/build-market-universe.mjs das Verzeichnis, und derselbe Lauf hier nimmt " +
      "dann alles auf."
  };
}

/* ------------------------------------------- Produktlogik des Wertpapierstamms

   Der Company Master entscheidet NICHT, was ein Produkttitel ist. Das
   entscheidet der US-Wertpapierstamm, und seine Entscheidung liegt als
   Artefakt vor: quant/data/market/security-master/eligibility.json, 7.803
   Mitglieder, davon 7.004 Produkttitel.

   Hier wird sie gelesen und aufgelegt - nicht nachgerechnet. Eine zweite
   Eignungslogik neben der bestehenden waere genau die Parallelstruktur,
   die der Auftrag ausschliesst.

   Die Zuordnung laeuft ueber die securityId, nicht ueber den Ticker: die
   Entscheidungen fuehren `ref_CTA_P_B`, und derselbe Ticker kann an zwei
   Boersen liegen. */
function loadEligibility() {
  const file = join(root, "quant", "data", "market", "security-master", "eligibility.json");
  const summaryFile = join(root, "quant", "data", "market", "security-master", "summary.json");
  if (!existsSync(file)) {
    return { bySecurityId: new Map(), byTicker: new Map(), status: "ABSENT", counts: null,
             reason: "quant/data/market/security-master/eligibility.json fehlt. Ohne sie bleibt " +
                     "jede Produktentscheidung UNKNOWN - und UNKNOWN ist nicht ELIGIBLE." };
  }
  const payload = readJSON(file);
  const summary = existsSync(summaryFile) ? readJSON(summaryFile) : null;

  /* Die Eignungsdatei nennt die Mitgliedsdatei MIT Pruefsumme. Stimmen
     sie nicht ueberein, gehoeren Entscheidung und Bestand nicht
     zusammen - und eine Entscheidung auf einer anderen Mitgliederliste
     ist keine Entscheidung. */
  let membership = { checked: false, matches: null, expected: null, actual: null };
  const nd = payload.nonDestructive || {};
  if (nd.universeFile && nd.universeSha256) {
    const universeFile = join(root, nd.universeFile);
    if (existsSync(universeFile)) {
      const actual = createHash("sha256").update(readFileSync(universeFile)).digest("hex");
      membership = { checked: true, file: nd.universeFile, expected: nd.universeSha256,
                     actual, matches: actual === nd.universeSha256 };
    }
  }

  const bySecurityId = new Map();
  const byTicker = new Map();
  for (const d of payload.decisions || []) {
    if (d.securityId) bySecurityId.set(d.securityId, d);
    const key = String(d.ticker || "").toUpperCase() + "@" + String(d.exchange || "").toUpperCase();
    if (!byTicker.has(key)) byTicker.set(key, d);
  }
  return {
    bySecurityId, byTicker,
    status: membership.checked && !membership.matches ? "MEMBERSHIP_MISMATCH" : "OK",
    version: payload.version || null,
    generatedAt: payload.generatedAt || null,
    scope: payload.scope || null,
    counts: payload.counts || null,
    excludedByClass: payload.excludedByClass || null,
    separateByClass: payload.separateByClass || null,
    reviewByReason: payload.reviewByReason || null,
    membership,
    securityMasterSummary: summary
      ? { version: summary.version, generatedAt: summary.generatedAt,
          headline: summary.headline } : null,
    reason: null
  };
}

/* ------------------------------------------------------------- Bestand */

/* Der Bestand ist der VOLLE Master, nicht der ausgelieferte Auszug.

   Der Unterschied ist keine Feinheit: ein Instrument, das die
   Auslieferungsregel nicht passiert, steht in keiner Scherbe. Laese der
   Sync nur die Scherben, waere dieses Instrument bei jedem Lauf wieder
   "neu" - mit frischer ID und frischem Erstsichtungsdatum. Genau das ist
   der Fall, den §14 ausschliesst. Die Arbeitsablage ist deshalb die
   erste Quelle; die Scherben sind der Rueckfall, wenn sie fehlt (etwa im
   ersten CI-Lauf auf einem frischen Container). */
function loadPreviousMaster() {
  const fullFile = join(WORK_ROOT, "company-master-full.json");
  const manifestFile = join(OUT_ROOT, "master-manifest.json");
  const manifest = existsSync(manifestFile) ? readJSON(manifestFile) : null;

  if (existsSync(fullFile)) {
    const payload = readJSON(fullFile);
    if ((payload.instruments || []).length) {
      return { instruments: payload.instruments, manifest, from: "workingStore" };
    }
  }

  if (!existsSync(INSTRUMENT_DIR)) return { instruments: [], manifest, from: "none" };
  const instruments = [];
  for (const f of readdirSync(INSTRUMENT_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const payload = readJSON(join(INSTRUMENT_DIR, f));
    for (const r of payload.instruments || []) instruments.push(r);
  }
  return { instruments, manifest, from: "publishedShards" };
}

/* ------------------------------------------------------- Auslieferungsfilter */

function publishable(inst, rules) {
  if (rules.excludeOtc && inst.otc) return false;
  if (rules.primaryExchangesOnly && inst.primaryListing !== true) return false;
  if (rules.currencies && inst.currency && rules.currencies.indexOf(inst.currency) === -1) return false;
  if (rules.securityTypes && rules.securityTypes.indexOf(inst.securityType) === -1) return false;
  if (!rules.includeInactive && inst.active === false) return false;
  return true;
}

/* ----------------------------------------------------------------- Ablauf */

function main() {
  console.log("Vision Universe — kanonischer Company Master\n");

  const source = loadProviderDirectory() || loadCommittedGateUniverses();
  if (!source) {
    console.error("  Keine Universumsquelle gefunden. Es wird ausdruecklich keine Ersatzliste gebaut.");
    process.exit(2);
  }
  console.log(`  Quelle:   ${source.kind} (${source.rows.length} Zeilen)`);
  if (!source.complete) console.log("  Hinweis:  unvollstaendig - siehe Manifest.");

  const names = buildNameMap();
  console.log(`  Namen:    ${names.size} bekannt`);
  const ciks = buildCikMap();
  console.log(`  CIK:      ${ciks.map.size} Zuordnungen (SEC ${ciks.status}` +
              `, ${ciks.declared} aus der Konfiguration, ${ciks.ambiguous.size} ambig)` +
              (ciks.reason ? "  — " + ciks.reason : ""));

  const eligibility = loadEligibility();
  if (eligibility.status === "ABSENT") {
    console.log(`  Eignung:  ABSENT — ${eligibility.reason}`);
  } else {
    const c = eligibility.counts || {};
    console.log(`  Eignung:  ${eligibility.status} · ${eligibility.version} · ` +
                `${c.universeMembers} Mitglieder, ${c.productUniverse} Produkttitel ` +
                `(${c.ELIGIBLE} ELIGIBLE, ${c.SEPARATE_CLASS} SEPARATE_CLASS, ` +
                `${c.REVIEW} REVIEW, ${c.EXCLUDED} EXCLUDED)`);
    if (eligibility.membership.checked) {
      console.log(`  Mitglieder-Pruefsumme: ${eligibility.membership.matches ? "stimmt" : "WEICHT AB"}`);
    }
    if (eligibility.status === "MEMBERSHIP_MISMATCH") {
      console.error("\n  Die Eignungsdatei wurde gegen eine andere Mitgliederliste gerechnet.");
      console.error(`  erwartet: ${eligibility.membership.expected}`);
      console.error(`  gefunden: ${eligibility.membership.actual}`);
      console.error("  Eine Produktentscheidung auf fremdem Bestand ist keine Entscheidung.");
      process.exit(3);
    }
  }

  /* Aufnehmen: alles, was die ingest-Regeln erlauben. */
  const ingest = CONFIG.ingest;
  const t0 = Date.now();
  const incoming = [];
  let droppedByIngest = 0;
  for (const row of source.rows) {
    const named = names.get(String(row.ticker || "").toUpperCase());
    const inst = Master.toInstrument(
      Object.assign({}, row, { name: row.name || (named ? named.name : null) }),
      { today: TODAY, provider: row.provider || "tiingo" });
    if (named && inst.companyName) inst.companyNameStatus = "RESOLVED:" + named.source;

    /* CIK nur fuer Titel, bei denen eine US-Einreichung ueberhaupt
       plausibel ist. Ein Kuerzel an einer chinesischen Boerse, das
       zufaellig auch ein US-Einreicher traegt, bekommt keine CIK
       untergeschoben. */
    const cikRow = inst.country === "US" ? ciks.map.get(inst.symbol) : null;
    if (cikRow) { inst.cik = cikRow.cik; inst.cikSource = cikRow.source; }
    if (inst.cik) {
      inst.issuerId = Master.issuerIdFromCik(inst.cik);
      inst.issuerIdSource = inst.cikSource;
    }

    /* Die Produktentscheidung. Erst ueber die securityId - das ist der
       Schluessel, den der Wertpapierstamm fuehrt -, sonst ueber
       Ticker+Boerse. */
    const decision = eligibility.bySecurityId.get(row.securityId) ||
                     eligibility.bySecurityId.get((inst.legacyIds || [])[0]) ||
                     eligibility.byTicker.get(inst.symbol + "@" +
                       String(inst.exchange || "").toUpperCase()) || null;
    Master.applyEligibility(inst, decision);

    /* Der Anbieterauszug fuehrt `active` mancherorts als Bilanz statt
       ueber ein Enddatum. Wo die Klassifikation nichts ableiten kann, die
       Quelle es aber weiss, wird es uebernommen - mit Grundlage. */
    if (inst.active === null && typeof row.active === "boolean") {
      inst.active = row.active;
      inst.activeBasis = "Quellenangabe (" + source.kind + "), kein Enddatum vom Anbieter";
      if (row.active === false) inst.delistedAt = inst.lastTradeDate || null;
      inst.screenerEligible = inst.screenerEligible && row.active !== false;
    }

    if (ingest.securityTypes && ingest.securityTypes.indexOf(inst.securityType) === -1) {
      droppedByIngest++; continue;
    }
    if (!ingest.includeInactive && inst.active === false) { droppedByIngest++; continue; }
    if (!ingest.includeOtc && inst.otc) { droppedByIngest++; continue; }
    if (ingest.currencies && inst.currency && ingest.currencies.indexOf(inst.currency) === -1) {
      droppedByIngest++; continue;
    }
    incoming.push(inst);
  }
  const normalizeMs = Date.now() - t0;
  console.log(`  Aufgenommen: ${incoming.length} (${droppedByIngest} durch ingest-Regeln aussen vor)`);

  const previous = loadPreviousMaster();
  console.log(`  Bestand:  ${previous.instruments.length} Instrumente (${previous.from})`);

  const t1 = Date.now();
  const sync = Master.syncUniverse({
    previous: previous.instruments, incoming, today: TODAY, provider: "tiingo"
  });
  const syncMs = Date.now() - t1;

  console.log(`\n  Sync:     ${sync.counts.new} neu · ${sync.counts.updated} geaendert · ` +
              `${sync.counts.unchanged} unveraendert · ${sync.counts.delisted} beendet · ` +
              `${sync.counts.reactivated} reaktiviert  (${syncMs} ms)`);

  const rules = CONFIG.publish.rules;
  const published = sync.instruments.filter((i) => publishable(i, rules));
  const withheld = sync.instruments.length - published.length;
  console.log(`  Auslieferung: ${published.length} (${withheld} bleiben in der Arbeitsablage)`);

  const quality = Master.qualityReport(published);
  console.log(`  Qualitaet: ${quality.blocking ? "BEFUNDE" : "ok"} — ` +
              `${quality.findings.duplicateSymbols.length} Kuerzel-Dubletten, ` +
              `${quality.findings.duplicateInstrumentIds.length} ID-Dubletten, ` +
              `${quality.findings.missingName} ohne Namen, ` +
              `${quality.findings.unknownSecurityType} ohne Gattung`);

  if (DRY_RUN) {
    console.log("\n  --dry-run: nichts geschrieben.");
    return;
  }

  /* Scherben schreiben. Nur Dateien, die sich geaendert haben - sonst
     schreibt jeder Lauf das ganze Verzeichnis neu, und der Sync-Bericht
     "0 geaendert" stuende neben 700 geaenderten Dateien. */
  const shards = new Map();
  for (const inst of published) {
    const k = Master.shardKey(inst.symbol);
    (shards.get(k) || shards.set(k, []).get(k)).push(inst);
  }

  mkdirSync(INSTRUMENT_DIR, { recursive: true });
  const existingShards = new Set(
    existsSync(INSTRUMENT_DIR)
      ? readdirSync(INSTRUMENT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
      : []);

  let written = 0, unchangedShards = 0, bytes = 0;
  const shardIndex = [];
  for (const [key, rows] of Array.from(shards.entries()).sort()) {
    rows.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
    const file = join(INSTRUMENT_DIR, key + ".json");
    const payload = { shard: key, engine: Master.VERSION, count: rows.length, instruments: rows };
    /* Kompakt, nicht eingerueckt. Die Scherben sind Daten und kein
       Bericht: bei 5.700 Instrumenten kostet die Einrueckung 4 MB, und
       gelesen wird ohnehin mit einem Werkzeug. Die Berichte daneben
       (Manifest, Sync-Log, Qualitaet) bleiben eingerueckt - die liest
       jemand. */
    const json = JSON.stringify(payload) + "\n";
    const before = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (before !== json) { writeFileSync(file, json); written++; } else unchangedShards++;
    bytes += Buffer.byteLength(json);
    shardIndex.push({ shard: key, count: rows.length });
    existingShards.delete(key);
  }
  /* Scherben, die keine Zeile mehr tragen, verschwinden. Sonst bleibt ein
     alter Stand liegen und sieht aus wie der aktuelle. */
  for (const stale of existingShards) rmSync(join(INSTRUMENT_DIR, stale + ".json"));

  const manifest = {
    version: Master.VERSION,
    masterId: CONFIG.masterId,
    generatedAt: new Date().toISOString(),
    asOf: TODAY,
    provider: "tiingo",
    source: {
      kind: source.kind,
      file: source.file,
      generatedAt: source.generatedAt,
      complete: source.complete,
      incompleteReason: source.incompleteReason || null,
      providerSource: source.providerSource || null,
      providerRowsSeen: source.rows.length,
      provenance: source.provenance || null
    },
    scope: {
      ingest: CONFIG.ingest,
      publish: { scopeId: CONFIG.publish.scopeId, provenance: CONFIG.publish.provenance,
                 rules: CONFIG.publish.rules },
      maxInstruments: CONFIG.size.maxInstruments,
      maxInstrumentsNote: CONFIG.size.note
    },
    totals: {
      providerRows: source.rows.length,
      ingested: incoming.length,
      droppedByIngestRules: droppedByIngest,
      inMaster: sync.instruments.length,
      published: published.length,
      withheldFromPublication: withheld
    },
    shards: { by: CONFIG.storage.shardBy, count: shardIndex.length, index: shardIndex },
    previousState: { from: previous.from, instruments: previous.instruments.length },
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      normalizeMs, syncMs,
      shardsWritten: written, shardsUnchanged: unchangedShards,
      publishedBytes: bytes
    },
    identifiers: {
      cikMap: { status: ciks.status, generatedAt: ciks.generatedAt, entries: ciks.map.size,
                fromConfig: ciks.declared, declaredOverrides: ciks.overrides,
                ambiguous: ciks.ambiguous.size, reason: ciks.reason },
      withIssuerId: published.filter((i) => i.issuerId).length,
      distinctIssuers: new Set(published.filter((i) => i.issuerId).map((i) => i.issuerId)).size,
      withCik: published.filter((i) => i.cik).length,
      withName: published.filter((i) => i.companyName).length,
      withoutName: published.filter((i) => !i.companyName).length,
      note: "isin/cusip/figi/lei bleiben null: keine der vorhandenen Quellen fuehrt sie, und " +
            "eine neue kostenpflichtige Quelle ist ausgeschlossen (§32). Die Felder stehen im " +
            "Schema, damit ein spaeterer Anbieter sie fuellen kann, ohne das Modell zu aendern."
    },
    quality: { blocking: quality.blocking, findings: quality.findings }
  };
  writeJSON(join(OUT_ROOT, "master-manifest.json"), manifest);

  writeJSON(join(OUT_ROOT, "sync-log.json"), {
    version: Master.VERSION,
    asOf: TODAY,
    generatedAt: manifest.generatedAt,
    source: manifest.source.kind,
    counts: sync.counts,
    note: "NEW/UPDATED/UNCHANGED/DELISTED/REACTIVATED (§15). Ein zweiter Lauf auf derselben " +
          "Quelle muss ausschliesslich UNCHANGED liefern - das prueft " +
          "quant/tests/company-master.test.mjs.",
    changes: {
      new: sync.changes.new.slice(0, 500),
      newTruncated: sync.changes.new.length > 500,
      updated: sync.changes.updated.slice(0, 500),
      updatedTruncated: sync.changes.updated.length > 500,
      delisted: sync.changes.delisted.slice(0, 500),
      delistedTruncated: sync.changes.delisted.length > 500,
      reactivated: sync.changes.reactivated
    }
  });

  writeJSON(join(OUT_ROOT, "quality.json"), quality);

  /* Der vollstaendige Master - auch das, was nicht ausgeliefert wird -
     geht in die Arbeitsablage. Ohne ihn waere der naechste Sync blind
     fuer alles, was ausserhalb der Auslieferungsgrenze liegt. */
  mkdirSync(WORK_ROOT, { recursive: true });
  writeFileSync(join(WORK_ROOT, "company-master-full.json"),
    JSON.stringify({ version: Master.VERSION, asOf: TODAY,
                     count: sync.instruments.length, instruments: sync.instruments }));

  console.log(`\n  ${shardIndex.length} Scherben (${written} geschrieben, ${unchangedShards} unveraendert), ` +
              `${(bytes / 1048576).toFixed(2)} MB`);
  console.log(`  ${join(OUT_ROOT, "master-manifest.json").replace(root + "/", "")}`);
  console.log(`  ${join(WORK_ROOT, "company-master-full.json").replace(root + "/", "")}   (Arbeitsablage)`);
}

main();

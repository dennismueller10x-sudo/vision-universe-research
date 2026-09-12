/* =========================================================================
   EMITTENTENSTAMM — eine Gesellschaft ist kein Papier (§3, §15)

   Der Fehler, den dieser Test verhindert, ist unsichtbar: wenn
   Fundamentaldaten am Instrument haengen statt am Emittenten, bekommt
   Alphabet zwei Jahresabschluesse, jede Kennzahl wird doppelt gezaehlt,
   und jede Coverage-Aussage ist zu hoch. Man merkt es erst, wenn jemand
   Emittenten zaehlt und Papiere bekommt.

   Geprueft wird ohne Netz: sec.gov ist aus der Bauumgebung nicht
   erreichbar (403 am Egress-Proxy), und ein Test, der nur im CI laufen
   kann, prueft nichts, solange er nicht laeuft. Die CIK-Zuordnung wird
   deshalb als Datei untergeschoben.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require("../engines/company-master.js");

const MASTER_DIR = join(root, "quant", "data", "universe", "instruments");
const vorhanden = existsSync(MASTER_DIR);
function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

function instrumente() {
  const out = [];
  for (const f of readdirSync(MASTER_DIR).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(MASTER_DIR, f)).instruments || []) out.push(r);
  }
  return out;
}

/** Eine CIK-Zuordnung im Format von build-cik-map.mjs. */
function schreibeMap(byTicker) {
  const dir = mkdtempSync(join(tmpdir(), "vu-issuer-"));
  const p = join(dir, "cik-map.json");
  writeFileSync(p, JSON.stringify({
    schemaVersion: 1, generatedAt: new Date().toISOString(), status: "OK",
    source: "sec.gov", totals: { tickers: Object.keys(byTicker).length }, byTicker
  }));
  return { dir, p };
}

function baue(cikMapPfad) {
  const dir = mkdtempSync(join(tmpdir(), "vu-issuer-out-"));
  /* ACHTUNG: der Emittentenbau schreibt in die ECHTE Ablage unter
     quant/data/universe/. Der Kommentar hier behauptete frueher das
     Gegenteil. Harmlos ist das nur, weil die Tests im Pruefjob laufen,
     der nichts committet - der Backfill baut den Stand in einem eigenen
     Job frisch. Wer diese Suite lokal laufen laesst, hat danach
     geaenderte Artefakte im Arbeitsbaum. */
  execFileSync(process.execPath, [
    join(root, "scripts", "universe", "build-issuer-master.mjs"),
    "--cik-map", cikMapPfad
  ], { cwd: root, stdio: "pipe", env: Object.assign({}, process.env) });
  return {
    manifest: readJSON(join(root, "quant", "data", "universe", "issuer-manifest.json")),
    resolution: readJSON(join(root, "quant", "data", "universe", "cik-resolution.json")),
    issuers: ladeEmittenten()
  };
}

function ladeEmittenten() {
  const dir = join(root, "quant", "data", "universe", "issuers");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(dir, f)).issuers || []) out.push(r);
  }
  return out;
}

/* ------------------------------------------------------------ Identitaet */

test("die Emittenten-ID kommt aus der CIK, nicht aus dem Namen", () => {
  assert.equal(Master.issuerIdFromCik("0001652044"), "iss_cik_0001652044");
  assert.equal(Master.issuerIdFromCik(null), null);
});

/* Eine CIK, die im echten Master nicht vorkommt.
   Die erste Fassung nahm 0001652044 - Alphabets echte CIK - als
   "synthetisch". Das ging gut, solange der Master fast keine CIKs
   trug. Seit dem Backfill traegt er 5.481, darunter Alphabets, und der
   Test bekam drei Kuerzel statt zwei: seine zwei plus das echte. Ein
   Testwert, den die Produktionsdaten auch fuehren koennen, ist kein
   Testwert. */
const SYNTHETISCHE_CIK = "0009999901";

test("zwei Aktienklassen desselben Emittenten sind EIN Emittent", { skip: !vorhanden }, () => {
  const alle = instrumente();
  /* Zwei Titel, fuer die der Master selbst KEINE CIK kennt. Die CIK am
     Instrument gewinnt bewusst ueber die Zuordnungsdatei - sie traegt
     ihre Herkunft, einschliesslich erklaerter Uebersteuerungen. Wer
     hier Titel mit CIK nimmt, prueft nicht die Zusammenfuehrung,
     sondern diese Vorrangregel. */
  const zwei = alle.filter((i) => i.productEligibility === "ELIGIBLE" && !i.cik).slice(0, 2);
  assert.equal(zwei.length, 2, "keine zwei Titel ohne CIK im Master");
  const byTicker = {};
  /* Dieselbe CIK fuer beide - so wie GOOGL und GOOG. */
  for (const i of zwei) {
    byTicker[i.symbol] = { cik: SYNTHETISCHE_CIK, name: "Synthetic Multi Class Inc",
                           exchange: "Nasdaq", source: "company_tickers", status: "RESOLVED" };
  }
  const { p } = schreibeMap(byTicker);
  const r = baue(p);
  const iss = r.issuers.find((x) => x.cik === SYNTHETISCHE_CIK);
  assert.ok(iss, "kein Emittent fuer die geteilte CIK");
  assert.deepEqual([...iss.tickers].sort(), zwei.map((i) => i.symbol).sort(),
                   "genau die beiden Kuerzel gehoeren an diesen Emittenten");
  assert.equal(r.issuers.filter((x) => x.cik === SYNTHETISCHE_CIK).length, 1,
               "und zwar an genau einen");
  /* Keine feste Zahl: der Master traegt seine eigenen CIKs bei, und wie
     viele das sind, entscheidet der letzte Backfill. Geprueft wird die
     Regel - die beiden hier sind aufgeloest und keiner geht verloren. */
  assert.ok(r.manifest.totals.CIK_RESOLVED >= 2,
            `nur ${r.manifest.totals.CIK_RESOLVED} aufgeloest`);
});

test("ein ambiger Eintrag bekommt keine Emittenten-ID", { skip: !vorhanden }, () => {
  const alle = instrumente();
  const kandidat = alle.find((i) => !i.cik && i.productEligibility === "ELIGIBLE");
  const byTicker = {};
  byTicker[kandidat.symbol] = {
    cik: null, name: null, exchange: null, status: "AMBIGUOUS",
    source: "company_tickers+company_tickers_exchange",
    candidates: ["0000111111", "0000222222"]
  };
  const { p } = schreibeMap(byTicker);
  const r = baue(p);
  assert.equal(r.resolution.totals.CIK_AMBIGUOUS, 1);
  assert.ok(r.resolution.ambiguous.some((a) => a.symbol === kandidat.symbol));
  assert.equal(r.issuers.some((x) => x.tickers.includes(kandidat.symbol)), false,
               "ein ambiger Titel darf keinen Emittenten erzeugen");
});

test("unaufgeloest und ambig sind zwei verschiedene Zustaende", { skip: !vorhanden }, () => {
  const { p } = schreibeMap({});
  const r = baue(p);
  const t = r.resolution.totals;
  assert.equal(t.CIK_AMBIGUOUS, 0);
  /* Die erste Fassung verlangte hier >7000 unaufgeloest: eine leere
     Zuordnung, also loest nichts auf. Das stimmte, solange der Master
     keine eigenen CIKs trug. Er behaelt sie aber bewusst - sonst wuerde
     ein fehlgeschlagener SEC-Abruf den ganzen Bestand entwerten.
     Geprueft wird deshalb die Regel, nicht der Stand: ohne Zuordnung
     ist genau das unaufgeloest, was im Master keine CIK hat. */
  const ohneCik = instrumente().filter((i) => !i.cik).length;
  assert.equal(t.CIK_UNRESOLVED, ohneCik,
               "ohne Zuordnung ist unaufgeloest, was der Master selbst nicht kennt");
  assert.ok(t.CIK_UNRESOLVED > 0, "ein Universum ganz ohne Luecke waere verdaechtig");
  assert.equal(t.CIK_RESOLVED + t.CIK_UNRESOLVED + t.CIK_AMBIGUOUS, t.instruments,
               "die drei Zustaende muessen alle Instrumente abdecken");
});

test("mit einer vollstaendigen Zuordnung entstehen tausende Emittenten",
     { skip: !vorhanden }, () => {
  const alle = instrumente().filter((i) => Master.inProductUniverse(i));
  const byTicker = {};
  alle.slice(0, 3000).forEach((i, n) => {
    byTicker[i.symbol] = { cik: String(2000000 + n).padStart(10, "0"),
                           name: i.symbol + " Synthetic Corp", exchange: "Nasdaq",
                           source: "company_tickers", status: "RESOLVED" };
  });
  const { p } = schreibeMap(byTicker);
  const r = baue(p);
  assert.ok(r.manifest.totals.issuers > 2900,
            `nur ${r.manifest.totals.issuers} Emittenten - die Aufloesung greift nicht`);
  assert.ok(r.manifest.totals.issuersInProductUniverse > 2900);
  /* Jeder Emittent traegt mindestens ein Mitglied, und kein Mitglied
     haengt an zwei Emittenten. */
  const mitglieder = new Set();
  for (const iss of r.issuers) {
    assert.ok(iss.memberCount >= 1);
    for (const m of iss.members) {
      assert.equal(mitglieder.has(m), false, `Mitglied ${m} haengt an zwei Emittenten`);
      mitglieder.add(m);
    }
  }
});

test("ein Emittent ohne Geschaeftszahlen sagt das, statt das Feld wegzulassen",
     { skip: !vorhanden }, () => {
  const { p } = schreibeMap({});
  const r = baue(p);
  assert.ok(r.issuers.length > 0);
  for (const iss of r.issuers) {
    assert.equal(iss.fundamentals.status, "NOT_INGESTED");
    assert.equal(iss.fundamentals.annualPeriods, 0);
    assert.equal(iss.fundamentals.firstPeriodEnd, null);
  }
});

test("die erklaerte CIK-Uebersteuerung ueberlebt", { skip: !vorhanden }, () => {
  /* XOM: der Ticker zeigt bei der SEC auf eine neue Holding, die
     Fundamentalhistorie liegt beim alten CIK. Die Konfiguration
     uebersteuert das mit belegter Begruendung - und diese Uebersteuerung
     darf eine spaetere SEC-Zuordnung nicht stillschweigend kippen. */
  const cfg = readJSON(join(root, "quant", "config", "sec-universe.json"));
  const xom = cfg.companies.find((c) => c.ticker === "XOM");
  assert.equal(xom.cik_authority, "config");
  assert.ok(xom.cik_authority_reason.length >= 40);

  const { p } = schreibeMap({ XOM: { cik: "0002115436", name: "ExxonMobil Holdings Corp",
                                     exchange: "NYSE", source: "company_tickers",
                                     status: "RESOLVED" } });
  const r = baue(p);
  const iss = r.issuers.find((x) => x.tickers.includes("XOM"));
  assert.ok(iss, "XOM hat keinen Emittenten");
  assert.equal(iss.cik, "0000034088",
               "die erklaerte Uebersteuerung wurde von der SEC-Zuordnung gekippt");
});

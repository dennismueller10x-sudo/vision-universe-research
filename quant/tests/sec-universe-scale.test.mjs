/* =========================================================================
   SEC-UNIVERSUM — der Weg von fuenf Titeln auf das ganze US-Universum

   Der Grund fuer die fuenf war nie die Pipeline. Sie traegt Checkpoints,
   Wiederaufnahme, Fehlerschlange und Ratenbegrenzung. Es waren fuenf,
   weil quant/config/sec-universe.json fuenf fuehrt - ein
   Validierungssatz, kein Produktuniversum.

   Dieser Test prueft genau den Weg, der daraus ein Universum macht, und
   zwar OHNE sec.gov: die CIK-Zuordnung wird als Datei untergeschoben.
   Das ist keine Bequemlichkeit - sec.gov ist aus der Bauumgebung nicht
   erreichbar, und ein Test, der nur im CI laufen kann, prueft nichts,
   solange er nicht laeuft.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASTER_DIR = join(root, "quant", "data", "universe", "instruments");
const vorhanden = existsSync(MASTER_DIR);
function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

function masterSymbols(n) {
  const out = [];
  for (const f of readdirSync(MASTER_DIR).filter((f) => f.endsWith(".json")).sort()) {
    for (const r of readJSON(join(MASTER_DIR, f)).instruments || []) {
      if (r.country === "US" && r.securityType === "COMMON_STOCK") out.push(r.symbol);
      if (out.length >= n) return out;
    }
  }
  return out;
}

/** Eine CIK-Zuordnung im Format von scripts/universe/build-cik-map.mjs. */
function cikMapFuer(symbols) {
  const byTicker = {};
  symbols.forEach((s, i) => {
    byTicker[s] = { cik: String(1000000 + i).padStart(10, "0"),
                    name: s + " Test Corporation", exchange: "Nasdaq",
                    source: "company_tickers" };
  });
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), status: "OK",
           source: "sec.gov", totals: { tickers: symbols.length }, byTicker };
}

function baue(cikMapPfad, extraArgs) {
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-universe-"));
  const out = join(dir, "sec-universe.json");
  execFileSync(process.execPath, [
    join(root, "scripts", "universe", "build-sec-universe.mjs"),
    "--cik-map", cikMapPfad, "--out", out
  ].concat(extraArgs || []), { cwd: root, stdio: "pipe" });
  return readJSON(out);
}

test("ohne CIK-Zuordnung bleibt es beim Validierungssatz - und sagt das",
     { skip: !vorhanden }, () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-leer-"));
  const leer = join(dir, "cik-map.json");
  writeFileSync(leer, JSON.stringify({ status: "UNAVAILABLE", byTicker: {} }));
  const payload = baue(leer);
  assert.equal(payload.companies.length, 5);
  assert.ok(payload.companies.every((c) => c.role === "validation"));
  assert.equal(payload.sources.cikMap.status, "UNAVAILABLE");
  assert.equal(payload.totals.excluded.noCik > 5000, true,
               "die Zahl der Titel ohne CIK gehoert in den Bericht, nicht ins Log");
});

test("mit CIK-Zuordnung waechst das SEC-Universum weit ueber die fuenf",
     { skip: !vorhanden }, () => {
  const symbols = masterSymbols(1200);
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-map-"));
  const mapPfad = join(dir, "cik-map.json");
  writeFileSync(mapPfad, JSON.stringify(cikMapFuer(symbols)));

  const payload = baue(mapPfad);
  assert.ok(payload.companies.length > 1000,
            `nur ${payload.companies.length} Emittenten - die Erweiterung greift nicht`);
  assert.equal(payload.generated, true);
  assert.equal(payload.limit, null, "ohne --max gibt es keine Obergrenze (§6)");
});

test("der Validierungssatz steht an erster Stelle - auch im grossen Universum",
     { skip: !vorhanden }, () => {
  const symbols = masterSymbols(1200);
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-order-"));
  const mapPfad = join(dir, "cik-map.json");
  writeFileSync(mapPfad, JSON.stringify(cikMapFuer(symbols)));
  const payload = baue(mapPfad);

  const validation = readJSON(join(root, "quant", "config", "sec-universe.json"));
  const ersten = payload.companies.slice(0, validation.companies.length).map((c) => c.ticker);
  assert.deepEqual(ersten, validation.companies.map((c) => c.ticker));
  /* Und ihre Begruendung bleibt erhalten - auch die deklarierte
     CIK-Uebersteuerung von XOM, die sonst beim naechsten Lauf stillschweigend
     verschwaende. */
  const xom = payload.companies.find((c) => c.ticker === "XOM");
  assert.equal(xom.cik_authority, "config");
  assert.ok(xom.cik_authority_reason.length > 40);
});

test("ein begrenzter Lauf holt zuerst, was heute jemand aufschlaegt",
     { skip: !vorhanden }, () => {
  const symbols = masterSymbols(1200);
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-limit-"));
  const mapPfad = join(dir, "cik-map.json");
  writeFileSync(mapPfad, JSON.stringify(cikMapFuer(symbols)));
  const payload = baue(mapPfad, ["--max", "60"]);

  assert.equal(payload.companies.length, 60);
  assert.equal(payload.limit, 60);
  const rollen = payload.companies.map((c) => c.role);
  assert.equal(rollen.filter((r) => r === "validation").length, 5);
  assert.ok(rollen.filter((r) => r === "deliveredStockPage").length > 0,
            "nach dem Validierungssatz kommen die Titel mit Aktienseite");
  /* Die Reihenfolge ist monoton: keine Rolle taucht nach einer
     spaeteren wieder auf. */
  const rang = { validation: 0, deliveredStockPage: 1, universe: 2 };
  for (let i = 1; i < rollen.length; i++) {
    assert.ok(rang[rollen[i]] >= rang[rollen[i - 1]],
              `Reihenfolge bricht bei ${i}: ${rollen[i - 1]} -> ${rollen[i]}`);
  }
});

test("dieselbe CIK wird nicht zweimal geholt, und kein Kuerzel geht verloren",
     { skip: !vorhanden }, () => {
  const symbols = masterSymbols(400);
  const map = cikMapFuer(symbols);
  /* Zwei Aktienklassen desselben Emittenten: dieselbe CIK, zwei Kuerzel. */
  map.byTicker[symbols[1]].cik = map.byTicker[symbols[0]].cik;
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-dup-"));
  const mapPfad = join(dir, "cik-map.json");
  writeFileSync(mapPfad, JSON.stringify(map));
  const payload = baue(mapPfad);

  const ciks = payload.companies.filter((c) => c.role !== "validation").map((c) => c.cik);
  assert.equal(new Set(ciks).size, ciks.length, "eine CIK wuerde zweimal abgefragt");
  const gefuehrt = payload.companies.find((c) => c.cik === map.byTicker[symbols[0]].cik);
  assert.ok(gefuehrt.alsoTickers && gefuehrt.alsoTickers.includes(symbols[1]),
            "das zweite Kuerzel muss am Emittenten stehen, nicht verschwinden");
});

test("das Anfragebudget steht im Artefakt, nicht in einer Annahme",
     { skip: !vorhanden }, () => {
  const symbols = masterSymbols(600);
  const dir = mkdtempSync(join(tmpdir(), "vu-sec-budget-"));
  const mapPfad = join(dir, "cik-map.json");
  writeFileSync(mapPfad, JSON.stringify(cikMapFuer(symbols)));
  const payload = baue(mapPfad);

  const b = payload.requestBudget;
  assert.equal(b.submissionsRequests, payload.companies.length);
  assert.equal(b.companyFactsRequests, payload.companies.length);
  assert.equal(b.companyFactsRequestsWithBulk, 1,
               "der Sammelweg ist EINE Anfrage - das ist der ganze Punkt von §25");
  assert.match(b.rateLimit, /5 Anfragen/);
});

test("ETFs und Fonds kommen gar nicht erst ins SEC-Universum",
     { skip: !vorhanden }, () => {
  const payload = readJSON(join(root, "quant", "data", "universe", "sec-universe.json"));
  assert.ok(payload.totals.excluded.wrongType >= 0);
  /* Sie einzureihen hiesse, fuer jeden von ihnen eine Anfrage zu stellen,
     die sicher leer zurueckkommt. */
  assert.match(payload.description, /Validierungssatz/);
});

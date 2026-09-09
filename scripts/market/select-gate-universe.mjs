/* =========================================================================
   VISION UNIVERSE — select-gate-universe.mjs   (Tiingo Commercial, §8, §9)

   Waehlt das Aktienuniversum fuer ein Scale Gate.

   Zwei verschiedene Verfahren, und der Unterschied ist beabsichtigt:

     GATE_100      kuratiert (quant/config/gate-100-seed.json).
                   Grund: §9 verlangt Sektor-Diversifikation, und die
                   Tickerliste des Anbieters traegt keinen Sektor. Eine
                   Verteilung ueber neun Sektoren laesst sich aus Daten,
                   die keinen Sektor kennen, nicht ziehen. Sie zu
                   behaupten waere schlimmer als sie zu kuratieren.

     GATE_500+     regelbasiert aus dem Anbieteruniversum.
                   Ab hier ist Diversifikation kein Auswahlkriterium mehr,
                   sondern ein Messwert: 500 Titel nach Historienlaenge
                   sind breit genug, dass eine Handverlesung nur noch
                   Willkuer waere.

   NESTUNG: Jedes groessere Gate enthaelt das kleinere vollstaendig. Ohne
   diese Eigenschaft waere ein Vergleich zwischen zwei Gates kein
   Vergleich - eine Verschlechterung koennte auch daran liegen, dass ganz
   andere Titel drin sind.

   Ausfuehren:
     node scripts/market/select-gate-universe.mjs --gate GATE_100
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));
const SEED = JSON.parse(readFileSync(join(root, "quant", "config", "gate-100-seed.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "GATE_100");
const UNIVERSE_FILE = arg("--universe",
  join(root, SCALE.storage.workingDir, "tiingo", "universe", "universe.json"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "scale"));

/* Handelsplaetze, die fuer ein Aktien-Gate in Frage kommen. OTC bleibt
   draussen: dort ist die Datenlage systematisch duenner, und ein Gate,
   das an OTC-Titeln scheitert, sagt nichts ueber die Pipeline. Das ist
   eine Auswahl und kein Werturteil - die Titel bleiben im Universum. */
const PRIMARY_EXCHANGES = new Set([
  "NASDAQ", "NYSE", "NYSE ARCA", "NYSE MKT", "NYSE AMERICAN", "AMEX", "BATS"
]);

export function ruleBasedCandidates(entries, opts) {
  opts = opts || {};
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const minYears = opts.minHistoryYears === undefined ? 3 : opts.minHistoryYears;
  const cutoff = new Date(Date.parse(today + "T00:00:00Z"));
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - minYears);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return entries
    .filter((e) => e.screenerEligible === true)
    .filter((e) => !e.otc)
    .filter((e) => PRIMARY_EXCHANGES.has(String(e.exchange || "").toUpperCase()))
    .filter((e) => !e.currency || e.currency === "USD")
    .filter((e) => e.active !== false)
    /* Ein Titel ohne startDate ist nicht ausgeschlossen - er ist
       ungeprueft. Er landet hinter allen belegten Titeln, nicht vor
       ihnen. */
    .filter((e) => !e.startDate || e.startDate <= cutoffStr)
    .sort((a, b) => {
      const as = a.startDate || "9999-99-99";
      const bs = b.startDate || "9999-99-99";
      if (as !== bs) return as < bs ? -1 : 1;
      return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
    });
}

/** Kuratierte Auswahl gegen das echte Universum aufloesen. */
export function resolveSeed(seed, byTicker) {
  const picked = [];
  const unresolved = [];
  const substitutions = [];

  for (const [sector, spec] of Object.entries(seed.sectors)) {
    let taken = 0;
    const queue = spec.tickers.concat(spec.alternates || []);
    for (const ticker of queue) {
      if (taken >= spec.target) break;
      const entry = byTicker.get(ticker);
      if (!entry) {
        if (spec.tickers.includes(ticker)) unresolved.push({ sector, ticker, reason: "notInProviderUniverse" });
        continue;
      }
      if (!entry.screenerEligible) {
        if (spec.tickers.includes(ticker)) {
          unresolved.push({ sector, ticker, reason: "notScreenerEligible",
                            instrumentType: entry.instrumentType, active: entry.active });
        }
        continue;
      }
      if (!spec.tickers.includes(ticker)) {
        substitutions.push({ sector, replacement: ticker });
      }
      picked.push(Object.assign({}, entry, {
        sector: sector,
        /* Woher der Sektor stammt. Ohne diese Angabe liest sich eine
           kuratierte Zuordnung wie eine Anbieterangabe. */
        sectorStatus: "CURATED",
        selection: spec.tickers.includes(ticker) ? "seed" : "alternate"
      }));
      taken++;
    }
    if (taken < spec.target) {
      unresolved.push({ sector, ticker: null, reason: "sectorUnderfilled",
                        got: taken, target: spec.target });
    }
  }
  return { picked, unresolved, substitutions };
}

function main() {
  const gateSpec = SCALE.gates.find((g) => g.id === GATE);
  if (!gateSpec) {
    console.error(`Unbekanntes Gate '${GATE}'. Bekannt: ${SCALE.gates.map((g) => g.id).join(", ")}`);
    process.exit(2);
  }
  if (!existsSync(UNIVERSE_FILE)) {
    console.error(`Kein Universum unter ${UNIVERSE_FILE}.`);
    console.error("Zuerst: node scripts/market/build-market-universe.mjs");
    process.exit(1);
  }

  const universe = JSON.parse(readFileSync(UNIVERSE_FILE, "utf8"));
  const entries = universe.entries || [];
  const byTicker = new Map(entries.map((e) => [e.ticker, e]));
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Vision Universe — Gate-Universum ${GATE}\n`);
  console.log(`  Anbieteruniversum: ${entries.length} Zeilen`);

  let selected = [];
  let method, notes = [], unresolved = [], substitutions = [];

  if (GATE === "CANARY") {
    method = "CANARY_SET";
    selected = SCALE.canary.symbols.map((t) => {
      const e = byTicker.get(t);
      return e ? Object.assign({}, e, { sector: null, sectorStatus: "SOURCE_MISSING", selection: "canary" })
               : { ticker: t, provider: "tiingo", providerSymbol: t, screenerEligible: null,
                   selection: "canary", resolved: false };
    });
  } else if (GATE === "GATE_100") {
    method = "CURATED_SEED_RESOLVED_AGAINST_PROVIDER_UNIVERSE";
    const r = resolveSeed(SEED, byTicker);
    selected = r.picked; unresolved = r.unresolved; substitutions = r.substitutions;
  } else {
    method = "RULE_BASED_FROM_PROVIDER_UNIVERSE";
    /* Nestung: das vorherige Gate zuerst, dann auffuellen. */
    const order = SCALE.gates.map((g) => g.id);
    const previous = order[order.indexOf(GATE) - 1];
    const previousFile = join(OUT_DIR, `universe-${previous}.json`);
    const seen = new Set();
    if (existsSync(previousFile)) {
      const prev = JSON.parse(readFileSync(previousFile, "utf8"));
      for (const e of prev.securities || []) {
        const live = byTicker.get(e.ticker);
        selected.push(Object.assign({}, live || e, {
          sector: e.sector || null, sectorStatus: e.sectorStatus || "SOURCE_MISSING",
          selection: "inheritedFrom:" + previous
        }));
        seen.add(e.ticker);
      }
      notes.push(`${seen.size} Titel aus ${previous} uebernommen (Gates sind geschachtelt).`);
    } else {
      notes.push(`Kein vorheriges Gate unter ${previousFile} - ${GATE} wird ohne Nestung gezogen. ` +
                 `Der Vergleich zum kleineren Gate ist damit eingeschraenkt.`);
    }

    const candidates = ruleBasedCandidates(entries, { today });
    for (const c of candidates) {
      if (gateSpec.size !== null && selected.length >= gateSpec.size) break;
      if (seen.has(c.ticker)) continue;
      selected.push(Object.assign({}, c, { selection: "ruleBased" }));
      seen.add(c.ticker);
    }
    notes.push(`${candidates.length} regelbasierte Kandidaten im Anbieteruniversum.`);
    if (gateSpec.size !== null && selected.length < gateSpec.size) {
      notes.push(`Nur ${selected.length} von ${gateSpec.size} Titeln erreichbar. Das Gate laeuft ` +
                 `mit der kleineren Zahl und meldet sie - es wird nicht aufgefuellt.`);
    }
  }

  const bySector = {};
  selected.forEach((s) => { const k = s.sector || "UNKNOWN"; bySector[k] = (bySector[k] || 0) + 1; });
  const byExchange = {};
  selected.forEach((s) => { const k = s.exchange || "UNKNOWN"; byExchange[k] = (byExchange[k] || 0) + 1; });

  const payload = {
    generatedAt: new Date().toISOString(),
    gate: GATE,
    targetSize: gateSpec.size,
    actualSize: selected.length,
    method: method,
    provider: "tiingo",
    universeSource: {
      file: UNIVERSE_FILE.replace(root + "/", ""),
      generatedAt: universe.generatedAt || null,
      rows: entries.length
    },
    canary: SCALE.canary.symbols,
    canaryIncluded: SCALE.canary.symbols.filter((t) => selected.some((s) => s.ticker === t)),
    bySector, byExchange,
    unresolved, substitutions, notes,
    securities: selected.map((s) => ({
      securityId: "ref_" + String(s.ticker).replace(/[^A-Z0-9]/gi, "_"),
      ticker: s.ticker,
      company: s.company || null,
      exchange: s.exchange || null,
      country: s.country || null,
      currency: s.currency || null,
      assetType: s.assetType || null,
      instrumentType: s.instrumentType || null,
      active: s.active === undefined ? null : s.active,
      providerSymbol: s.providerSymbol || s.ticker,
      provider: "tiingo",
      sector: s.sector || null,
      sectorStatus: s.sectorStatus || "SOURCE_MISSING",
      industry: null,
      industryStatus: "SOURCE_MISSING",
      startDate: s.startDate || null,
      selection: s.selection
    }))
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `universe-${GATE}.json`);
  writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n");

  console.log(`  Verfahren:  ${method}`);
  console.log(`  Ausgewaehlt: ${selected.length}` + (gateSpec.size ? ` von ${gateSpec.size}` : " (offene Groesse)"));
  console.log(`  Canary drin: ${payload.canaryIncluded.join(", ") || "keine"}`);
  if (Object.keys(bySector).length > 1 || !bySector.UNKNOWN) {
    console.log("  Sektoren:");
    Object.keys(bySector).sort().forEach((s) => console.log(`    ${s.padEnd(24)} ${bySector[s]}`));
  }
  if (unresolved.length) {
    console.log(`  Nicht aufgeloest: ${unresolved.length}`);
    unresolved.slice(0, 10).forEach((u) => console.log(`    ${(u.ticker || "-").padEnd(8)} ${u.reason}`));
  }
  console.log(`\n  ${outFile.replace(root + "/", "")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

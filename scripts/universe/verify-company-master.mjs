/* =========================================================================
   VISION UNIVERSE — verify-company-master.mjs   (§45, §46)

   Prueft den ausgelieferten Company Master gegen sich selbst und gegen
   das, was vor ihm da war.

   Die Pruefungen sind nicht "ist die Datei da", sondern die Fragen, deren
   falsche Antwort man erst Wochen spaeter merkt: zwei Instrumente unter
   einer ID, ein Titel im Suchindex, den es im Master nicht gibt, eine
   Aktienseite aus dem Bestand, die nach der Erweiterung nicht mehr
   aufloest.

   Rueckgabewert 1 bei Befund. Gedacht fuer CI.

   Ausfuehren: node scripts/universe/verify-company-master.mjs
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const Master = require(join(root, "quant", "engines", "company-master.js"));

const CONFIG = JSON.parse(readFileSync(join(root, "quant", "config", "company-master.json"), "utf8"));
const OUT_ROOT = join(root, CONFIG.storage.root);
const INSTRUMENT_DIR = join(OUT_ROOT, "instruments");
const SEARCH_DIR = join(OUT_ROOT, "search");

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

const failures = [];
const passes = [];
function check(name, ok, detail) {
  if (ok) { passes.push(name); console.log(`  ok    ${name}`); }
  else { failures.push({ name, detail }); console.log(`  FEHL  ${name}\n        ${detail}`); }
}

function main() {
  console.log("Vision Universe — Pruefung des Company Master\n");

  check("Master vorhanden", existsSync(INSTRUMENT_DIR),
        "quant/data/universe/instruments fehlt");
  if (!existsSync(INSTRUMENT_DIR)) { finish(); return; }

  const manifest = readJSON(join(OUT_ROOT, "master-manifest.json"));
  const instruments = [];
  const shardFiles = readdirSync(INSTRUMENT_DIR).filter((f) => f.endsWith(".json")).sort();
  for (const f of shardFiles) {
    const payload = readJSON(join(INSTRUMENT_DIR, f));
    check("Scherbe " + f + ": Zahl stimmt mit Inhalt",
          payload.count === (payload.instruments || []).length,
          `count=${payload.count}, instruments=${(payload.instruments || []).length}`);
    for (const r of payload.instruments || []) {
      check_shardMatches(r, payload.shard);
      instruments.push(r);
    }
  }

  function check_shardMatches(inst, shard) {
    if (Master.shardKey(inst.symbol) !== shard) {
      failures.push({ name: "Scherbenzuordnung", detail: `${inst.symbol} liegt in ${shard}` });
    }
  }

  console.log("");
  check("Manifest zaehlt dieselben Instrumente wie die Scherben",
        manifest.totals.published === instruments.length,
        `manifest=${manifest.totals.published}, Scherben=${instruments.length}`);

  check("Keine Zielgroesse im Master hinterlegt",
        manifest.scope.maxInstruments === null,
        `maxInstruments=${manifest.scope.maxInstruments}`);

  /* --------------------------------------------------- Identitaet (§8) */
  const byId = new Map();
  let dupIds = 0;
  for (const i of instruments) {
    if (byId.has(i.instrumentId)) dupIds++;
    byId.set(i.instrumentId, i);
  }
  check("Instrument-IDs sind eindeutig", dupIds === 0, `${dupIds} Dubletten`);
  check("Jedes Instrument hat eine ID im erwarteten Format",
        instruments.every((i) => /^vu_[0-9a-f]{14}$/.test(i.instrumentId)),
        "mindestens eine ID passt nicht auf vu_<14 hex>");
  check("Kein Instrument benutzt den Ticker als ID",
        instruments.every((i) => i.instrumentId !== i.symbol &&
                                 i.instrumentId !== "ref_" + i.symbol),
        "mindestens eine ID ist der Ticker");

  /* ID muss reproduzierbar sein: dieselben Koordinaten, dieselbe ID. */
  const remint = instruments.filter((i) =>
    Master.mintInstrumentId({ provider: "tiingo", exchange: i.exchange, symbol: i.symbol },
                            i.generation || 0) !== i.instrumentId);
  check("IDs sind aus den Anbieterkoordinaten reproduzierbar", remint.length === 0,
        `${remint.length} IDs lassen sich nicht nachrechnen (z.B. ${remint.slice(0, 3).map((r) => r.symbol).join(", ")})`);

  /* -------------------------------------------------- Auslieferung (§32) */
  const rules = CONFIG.publish.rules;
  const outOfScope = instruments.filter((i) => {
    if (rules.excludeOtc && i.otc) return true;
    if (rules.primaryExchangesOnly && i.primaryListing !== true) return true;
    if (rules.currencies && i.currency && rules.currencies.indexOf(i.currency) === -1) return true;
    if (rules.securityTypes && rules.securityTypes.indexOf(i.securityType) === -1) return true;
    return false;
  });
  check("Ausgeliefert wird nur, was die Auslieferungsregel erlaubt", outOfScope.length === 0,
        `${outOfScope.length} ausserhalb (z.B. ${outOfScope.slice(0, 3).map((r) => r.symbol + "@" + r.exchange).join(", ")})`);

  /* ------------------------------ Produktlogik des Wertpapierstamms (§1)

     Der Company Master konsumiert die bestehende Eignungsentscheidung.
     Geprueft wird deshalb nicht, ob sie richtig ist - das entscheidet
     der Wertpapierstamm -, sondern ob sie VOLLSTAENDIG und UNVERAENDERT
     ankommt. Eine zurueckgedrehte Ausschlussentscheidung waere der
     schlimmste denkbare Befund: sie faellt niemandem auf. */
  const eligFile = join(root, "quant", "data", "market", "security-master", "eligibility.json");
  if (existsSync(eligFile)) {
    const elig = readJSON(eligFile);
    const erwartet = elig.counts;

    check("Die Mitgliederliste, gegen die entschieden wurde, ist die hier vorliegende",
          (() => {
            const nd = elig.nonDestructive || {};
            if (!nd.universeFile || !nd.universeSha256) return false;
            const f = join(root, nd.universeFile);
            if (!existsSync(f)) return false;
            return createHash("sha256").update(readFileSync(f)).digest("hex") === nd.universeSha256;
          })(),
          "Pruefsumme der Mitgliedsdatei weicht ab");

    const byMember = new Map();
    for (const i of instruments) {
      const m = i.masterMemberId || i.instrumentId;
      if (!byMember.has(m)) byMember.set(m, i);
    }
    const zaehle = (e) => Array.from(byMember.values())
      .filter((i) => i.productEligibility === e).length;

    check("Jedes ausgelieferte Instrument traegt eine Produktentscheidung",
          instruments.every((i) => i.productEligibility && i.productEligibility !== "UNKNOWN"),
          `${instruments.filter((i) => !i.productEligibility || i.productEligibility === "UNKNOWN").length} ohne Entscheidung`);

    check(`Mitgliederzahl stimmt mit dem Wertpapierstamm ueberein (${erwartet.universeMembers})`,
          byMember.size === erwartet.universeMembers,
          `${byMember.size} statt ${erwartet.universeMembers}`);

    for (const [feld, name] of [["ELIGIBLE", "ELIGIBLE"], ["SEPARATE_CLASS", "SEPARATE_CLASS"],
                                ["REVIEW", "REVIEW"], ["EXCLUDED", "EXCLUDED"]]) {
      check(`${name} unveraendert uebernommen (${erwartet[feld]})`,
            zaehle(feld) === erwartet[feld], `${zaehle(feld)} statt ${erwartet[feld]}`);
    }

    check(`Produktuniversum unveraendert (${erwartet.productUniverse})`,
          zaehle("ELIGIBLE") + zaehle("SEPARATE_CLASS") + zaehle("REVIEW") === erwartet.productUniverse,
          "die Summe der drei Produktklassen weicht ab");

    /* Die Ausgeschlossenen bleiben IM Master. Sie zu entfernen waere
       bequem und wuerde die Bilanz schoener machen - und genau deshalb
       steht die Pruefung hier. */
    check("Die 799 bestaetigten Nicht-Aktien stehen weiterhin im Master",
          zaehle("EXCLUDED") === erwartet.EXCLUDED && zaehle("EXCLUDED") > 0,
          `${zaehle("EXCLUDED")} EXCLUDED im Master`);

    /* Mehrere Listings eines Mitglieds sind erlaubt - aber sie muessen
       dieselbe Entscheidung tragen. */
    const uneins = [];
    const proMitglied = new Map();
    for (const i of instruments) {
      const m = i.masterMemberId;
      if (!m) continue;
      if (!proMitglied.has(m)) proMitglied.set(m, i.productEligibility);
      else if (proMitglied.get(m) !== i.productEligibility) uneins.push(m);
    }
    check("Zwei Listings desselben Mitglieds tragen dieselbe Entscheidung",
          uneins.length === 0, `uneins: ${uneins.slice(0, 5).join(", ")}`);
  } else {
    check("Eignungsdatei des Wertpapierstamms vorhanden", false,
          "quant/data/market/security-master/eligibility.json fehlt");
  }

  /* ------------------------------------------------ Datenqualitaet (§45) */
  const quality = Master.qualityReport(instruments);
  check("Keine blockierenden Qualitaetsbefunde", !quality.blocking,
        JSON.stringify({
          duplicateSymbols: quality.findings.duplicateSymbols.length,
          duplicateProviderIds: quality.findings.duplicateProviderIds.length,
          invalidCik: quality.findings.invalidCik.length
        }));
  check("Keine Gattung UNKNOWN in der Auslieferung",
        quality.findings.unknownSecurityType === 0,
        `${quality.findings.unknownSecurityType} Instrumente ohne bestimmbare Gattung`);
  check("Delistete Titel bleiben im Master (§11)",
        rules.includeInactive === true,
        "publish.rules.includeInactive ist false - Historie ginge verloren");

  /* ------------------------------------------------------ Suchindex (§18) */
  if (existsSync(join(SEARCH_DIR, "manifest.json"))) {
    const sm = readJSON(join(SEARCH_DIR, "manifest.json"));
    const symEntries = new Map();
    for (const s of sm.sym) {
      for (const e of readJSON(join(SEARCH_DIR, "sym", s.shard + ".json")).entries) {
        symEntries.set(e.i, e);
      }
    }
    check("Suchindex kennt jedes Instrument des Masters",
          symEntries.size === instruments.length,
          `Index=${symEntries.size}, Master=${instruments.length}`);
    check("Kein Suchtreffer ohne Instrument im Master",
          Array.from(symEntries.keys()).every((id) => byId.has(id)),
          "der Index fuehrt IDs, die der Master nicht kennt");

    let nameEntriesWithoutName = 0;
    for (const s of sm.name) {
      for (const e of readJSON(join(SEARCH_DIR, "name", s.shard + ".json")).entries) {
        if (!e.n) nameEntriesWithoutName++;
      }
    }
    check("Der Namensindex enthaelt nur Titel mit Namen", nameEntriesWithoutName === 0,
          `${nameEntriesWithoutName} Eintraege ohne Namen`);

    /* Eine Suche, die gegen die alten 498 noch funktioniert hat, muss
       weiter funktionieren - und eine, die vorher nichts fand, soll jetzt
       etwas finden. */
    const nvda = Master.rankMatches(
      readJSON(join(SEARCH_DIR, "sym", "NV.json")).entries, "NVDA", 5);
    check("Suche nach NVDA trifft NVDA zuerst",
          nvda.length > 0 && nvda[0].s === "NVDA", JSON.stringify(nvda.slice(0, 2)));
  } else {
    check("Suchindex vorhanden", false, "quant/data/universe/search/manifest.json fehlt");
  }

  /* ------------------------------ Bestandsvertraeglichkeit (§41, §42) */
  const oldStockDir = join(root, "discover", "data", "stocks", "US_REAL");
  if (existsSync(oldStockDir)) {
    const bySymbol = new Map();
    for (const i of instruments) {
      const k = String(i.symbol).toUpperCase();
      if (!bySymbol.has(k)) bySymbol.set(k, i);
    }
    const old = readdirSync(oldStockDir).filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, "").toUpperCase());
    const missing = old.filter((s) => !bySymbol.has(s));
    check(`Alle ${old.length} bestehenden Aktienseiten loesen im Master auf`,
          missing.length === 0, `fehlen: ${missing.slice(0, 10).join(", ")}`);

    /* Der Alias wird NICHT aus dem Kuerzel gebastelt, sondern aus dem
       ausgelieferten Payload gelesen. Sonst prueft der Test die eigene
       Annahme statt den Bestand: BRK-A liegt dort als "ref_BRK_A". */
    const legacyIndex = new Map();
    for (const i of instruments) for (const a of i.legacyIds || []) legacyIndex.set(a, i);
    const missingLegacy = [];
    const missingId = [];
    for (const f of readdirSync(oldStockDir).filter((f) => f.endsWith(".json"))) {
      const payload = readJSON(join(oldStockDir, f));
      const id = payload.securityId || (payload.stock && payload.stock.securityId) || null;
      /* Eine Seite ohne securityId ueberspringen hiesse: der Test prueft
         nichts und meldet trotzdem "ok". Sie zaehlt deshalb als Befund. */
      if (!id) { missingId.push(f.replace(/\.json$/, "")); continue; }
      if (!legacyIndex.has(id)) missingLegacy.push(f.replace(/\.json$/, "") + " -> " + id);
    }
    check("Jede bestehende Aktienseite traegt ihre securityId",
          missingId.length === 0,
          `${missingId.length} ohne securityId (z.B. ${missingId.slice(0, 5).join(", ")})`);
    check("Die bestehenden securityIds (ref_*) bleiben als Alias aufloesbar",
          missingLegacy.length === 0, `fehlen: ${missingLegacy.slice(0, 10).join(", ")}`);

    /* Und die neue Kennung ebenso: eine Seite ohne instrumentId waere
       eine Seite ausserhalb des Masters. */
    const ohneInstrumentId = [];
    for (const f of readdirSync(oldStockDir).filter((f) => f.endsWith(".json"))) {
      const payload = readJSON(join(oldStockDir, f));
      if (!payload.instrumentId) ohneInstrumentId.push(f.replace(/\.json$/, ""));
      else if (!byId.has(payload.instrumentId)) {
        ohneInstrumentId.push(f.replace(/\.json$/, "") + " (unbekannte ID)");
      }
    }
    check("Jede bestehende Aktienseite traegt eine instrumentId aus dem Master",
          ohneInstrumentId.length === 0,
          `${ohneInstrumentId.length} ohne gueltige instrumentId (z.B. ${ohneInstrumentId.slice(0, 5).join(", ")})`);
  }

  /* -------------------------------------------- Faehigkeitsbilanz (§30) */
  const capFile = join(OUT_ROOT, "capability-summary.json");
  if (existsSync(capFile)) {
    const caps = readJSON(capFile);
    check("Faehigkeitsbilanz zaehlt dieselben Instrumente",
          caps.instruments === instruments.length,
          `${caps.instruments} vs ${instruments.length}`);
    check("Keine Faehigkeit wird oefter ausgewiesen als es Instrumente gibt",
          Object.values(caps.counts).every((c) => c.DELIVERED <= instruments.length &&
                                                  c.PROVIDER_VERIFIED <= instruments.length),
          "eine Faehigkeitszahl liegt ueber der Instrumentenzahl");
    check("HAS_ANALYSTS bleibt unbelegt (§32 - keine lizenzpflichtige Quelle)",
          caps.counts.HAS_ANALYSTS.DELIVERED === 0 && caps.counts.HAS_ANALYSTS.PROVIDER_VERIFIED === 0,
          JSON.stringify(caps.counts.HAS_ANALYSTS));
  }

  /* ----------------------------------------------- Deckungsbericht (§43) */
  const covFile = join(OUT_ROOT, "coverage-report.json");
  if (existsSync(covFile)) {
    const cov = readJSON(covFile);
    check("Deckungsbericht zaehlt dieselben Instrumente",
          cov.totals.TOTAL_IN_COMPANY_MASTER === instruments.length,
          `${cov.totals.TOTAL_IN_COMPANY_MASTER} vs ${instruments.length}`);
    check("Deckungsbericht nennt den Stand vorher",
          cov.before && cov.before.TOTAL_IN_COMPANY_MASTER === 498,
          "before fehlt oder nennt nicht 498");
    const t = cov.totals;
    check("Gattungssummen ergeben die Gesamtzahl",
          t.TOTAL_COMMON_STOCKS + t.TOTAL_ADRS + t.TOTAL_ETFS + t.TOTAL_ETNS + t.TOTAL_FUNDS +
          t.TOTAL_PREFERRED + t.TOTAL_WARRANTS + t.TOTAL_OTHER + t.TOTAL_UNKNOWN_TYPE ===
          t.TOTAL_IN_COMPANY_MASTER,
          "die Gattungen summieren sich nicht auf die Gesamtzahl");
    check("Aktiv + inaktiv + unbekannt ergibt die Gesamtzahl",
          t.TOTAL_ACTIVE + t.TOTAL_INACTIVE + t.TOTAL_ACTIVE_UNKNOWN === t.TOTAL_IN_COMPANY_MASTER,
          "die Aktivitaetszahlen summieren sich nicht");
    check("Ausgelieferter Kursverlauf ist nicht groesser als der belegte",
          t.TOTAL_WITH_DELIVERED_PRICE_HISTORY <= t.TOTAL_WITH_PROVIDER_PRICE_HISTORY,
          `${t.TOTAL_WITH_DELIVERED_PRICE_HISTORY} > ${t.TOTAL_WITH_PROVIDER_PRICE_HISTORY}`);
  }

  finish();
}

function finish() {
  console.log(`\n  ${passes.length} bestanden, ${failures.length} Befunde`);
  if (failures.length) {
    console.log("\n  Befunde:");
    failures.forEach((f) => console.log(`    - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main();

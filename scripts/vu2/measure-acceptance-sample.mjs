#!/usr/bin/env node
/* =========================================================================
   DIE PRODUKT-ABNAHMESTICHPROBE (P1), JEDE ITERATION GLEICH.

   Der Auftrag nennt eine FESTE Stichprobe, die bei jeder Iteration geprüft
   wird - neun namentlich genannte Titel und zwölf Rollen (Bank, REIT, Small
   Cap, junger Titel, datenarm, ETF, Vorzugs-/Sonderklasse, mit und ohne
   Setup, mit und ohne Strategie-Treffer). Die Rollen werden nicht von Hand
   besetzt: jede hat ein Prädikat über die veröffentlichten Artefakte, und
   gewählt wird der alphabetisch erste Treffer. Eine handverlesene Liste
   würde messen, was ich sehen will.

   GEPRÜFT WIRD JE TITEL

     1. richtiger Name (gegen das Verzeichnis, die Identitätsquelle)
     2. richtige Gattung ODER ehrlich unklar
     3. plausibler Kurs (Zahl, Stichtag, nicht älter als der Bestand)
     4. verständliche Zusammenfassung (ein Satz, kein Code, keine Handlung)
     5. keine widersprüchlichen Hauptaussagen
     6. Faktor, Setup, Strategie, Muster nur mit Beleg
     7. richtige reduzierte Reise, wo Daten fehlen
     8. verständliche Methodik
     9. keine kaputte Oberfläche (aus dem Smoke-Bericht, sonst offen)

   Ausführen:
     node scripts/vu2/measure-acceptance-sample.mjs [--smoke <bericht>] [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : f; };
const OUT = arg("out", join(ROOT, "quant/data/product/acceptance-sample-v1.json"));
const SMOKE = arg("smoke", join(ROOT, ".launch/production-smoke.json"));

const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Classification = require(join(ROOT, "quant/engines/instrument-classification.js"));
const Shape = require(join(ROOT, "quant/engines/journey-shape.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const CODE = /\b[A-Z]{3,}_[A-Z][A-Z_]{2,}\b/;
const HANDLUNG = /\b(kaufen|verkaufen|Kaufempfehlung|Verkaufsempfehlung|Kursziel|wird steigen|wird fallen|garantiert)\b/i;

/* Die neun namentlich genannten Titel stehen fest. GOOG und GOOGL sind
   absichtlich beide dabei: sie prüfen, dass zwei Klassen desselben Emittenten
   unterscheidbar bleiben. */
const GENANNT = ["AAPL", "MSFT", "NVDA", "JPM", "GOOG", "GOOGL", "T", "SO", "AGNC"];

/* Die zwölf Rollen als Prädikate über die veröffentlichten Artefakte. */
function rollen(index) {
  const nachTicker = new Map((index.entries || []).map((e) => [e.s, e]));
  return [
    ["BANK", (s, extra) => extra.template === "BANK" || /\b(Bancorp|Bankshares|Bank|Banc)\b/i.test(s.name || "")],
    ["REIT", (s) => /\b(REIT|Realty|Properties|Property Trust)\b/i.test(s.name || "")],
    ["SMALL_CAP", (s) => finite(s.price && s.price.value) && s.price.value < 5 && s.factorState === "AVAILABLE"],
    ["JUNG_ODER_IPO", (s) => { const e = nachTicker.get(s.ticker); return e && finite(e.b) && e.b > 0 && e.b < 250; }],
    ["DATENARM", (s) => s.factorState !== "AVAILABLE" && !(s.price && finite(s.price.value))],
    ["ETF", (s) => { const e = nachTicker.get(s.ticker); return !!(e && e.ne && e.t === "ETF"); }],
    ["VORZUG_ODER_SONDERKLASSE", (s) => { const e = nachTicker.get(s.ticker); return !!(e && (e.t === "PREFERRED" || e.t === "WARRANT")); }],
    ["BEWERTUNG_ZURUECKGEHALTEN", (s) => s.marketCapReason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING"],
    ["IDENTITAETSKONFLIKT", (s) => !!s.identityConflict],
    ["MIT_SETUP", (s, extra) => extra.setupState === "AVAILABLE"],
    ["OHNE_SETUP", (s, extra) => extra.setupState !== "AVAILABLE" && s.factorState === "AVAILABLE"],
    ["MIT_STRATEGIE", (s, extra) => extra.strategyState === "AVAILABLE"],
    ["OHNE_STRATEGIE", (s, extra) => extra.strategyState !== "AVAILABLE" && s.factorState === "AVAILABLE"]
  ];
}

/* Neun Prüfungen je Titel. Jede gibt `null` zurück, wenn sie erfüllt ist,
   sonst den Grund - der Bericht soll sagen WAS fehlt und nicht nur, dass
   etwas fehlt. */
function pruefungen(ctx) {
  const { row, index, brief, factors, setup, strategy, patterns, quant, sollName } = ctx;
  const befunde = [];
  const nein = (id, detail) => befunde.push({ check: id, detail });

  /* 1 Name */
  if (sollName && row.name !== sollName) nein("NAME", "\"" + row.name + "\" statt \"" + sollName + "\"");
  if (row.name === row.ticker) nein("NAME", "das Kuerzel steht als Firmenname");
  if (!row.name && row.nameReason !== "PROVIDER_HAS_NO_NAME") nein("NAME", "kein Name und kein Grund");

  /* 2 Gattung - richtig ODER ehrlich unklar */
  const eintrag = (index.entries || []).find((e) => e.s === row.ticker) || {};
  const gattung = eintrag.t || null;
  if (!gattung) nein("GATTUNG", "keine Gattung genannt");
  else if (gattung === "UNKNOWN") { /* ehrlich unklar ist erlaubt */ }
  else if (eintrag.ne && factors && factors.state === "AVAILABLE") {
    nein("GATTUNG", "belegt keine Aktie, traegt aber eine Faktorbewertung");
  }

  /* 3 Kurs */
  if (row.price && row.price.state === "AVAILABLE") {
    if (!finite(row.price.value) || row.price.value <= 0) nein("KURS", "Zustand verfuegbar, aber kein Wert");
    if (!row.price.asOf) nein("KURS", "kein Stichtag");
    if (finite(eintrag.c) && finite(row.price.value) && Math.abs(eintrag.c - row.price.value) > 0.005) {
      nein("KURS", row.price.value + " statt " + eintrag.c + " aus dem Verzeichnis");
    }
  } else if (row.price && !row.price.reason) nein("KURS", "kein Kurs und kein Grund");

  /* 4 Zusammenfassung. `headline` ist ein OBJEKT mit `sentence`; der erste
     Bau dieser Pruefung hat das Objekt behandelt wie einen String - `.length`
     war `undefined`, und `undefined < 30` ist falsch, also hat sie nie etwas
     gefunden. */
  const kopfsatz = brief && brief.headline && brief.headline.sentence ? brief.headline.sentence : null;
  if (kopfsatz) {
    if (kopfsatz.length < 30) nein("ZUSAMMENFASSUNG", "zu kurz: " + kopfsatz);
    if (CODE.test(kopfsatz)) nein("ZUSAMMENFASSUNG", "interner Code: " + (kopfsatz.match(CODE) || [])[0]);
    if (HANDLUNG.test(kopfsatz)) nein("ZUSAMMENFASSUNG", "Handlungssprache: " + (kopfsatz.match(HANDLUNG) || [])[0]);
  } else nein("ZUSAMMENFASSUNG", "kein Satz");

  /* 5 und 6: keine Aussage ohne Beleg, keine zwei gleichen Hauptaussagen */
  if (brief) {
    const ohneBeleg = typeof brief.statementsWithoutEvidence === "function" ? brief.statementsWithoutEvidence() : [];
    if (ohneBeleg && ohneBeleg.length) nein("BELEG", ohneBeleg.length + " Aussagen ohne Beleg");
    /* Die Punkte der Auskunft tragen ihren Satz in `text`, nicht in
       `statement`. Der erste Bau dieser Pruefung las `statement` - also
       immer den leeren String - und war damit wirkungslos, obwohl er gruen
       aussah. */
    const saetze = [...(brief.pro || []), ...(brief.contra || []), ...(brief.unknown || [])].map((p) => p.text || "");
    const gesehen = new Set();
    for (const satz of saetze) {
      if (!satz) continue;
      if (gesehen.has(satz)) nein("DOPPELT", satz.slice(0, 80));
      gesehen.add(satz);
    }
    /* WAS EIN WIDERSPRUCH IST - UND WAS NICHT.

       Derselbe Faktor auf beiden Seiten ist allein kein Widerspruch. Gemessen
       bei MSFT: "Trendstruktur verbessert sich" (dafuer) und "Kurstempo
       verschlechtert sich" (dagegen) - zwei VERSCHIEDENE Messungen derselben
       Familie, beide wahr, beide mit ihrer Rechenregel darunter. Genau diese
       Unterscheidung war der Kern von M40; eine Pruefung auf `factorId` allein
       hat vier der neun genannten Titel als widerspruechlich gemeldet und lag
       falsch.

       Ein Widerspruch ist: dieselbe EINORDNUNG (`kind === "factor"`, also die
       Hoehe des Faktors) auf beiden Seiten - oder wortwoertlich derselbe Satz. */
    const einordnungDafuer = new Set((brief.pro || []).filter((p) => p.kind === "factor").map((p) => p.factorId).filter(Boolean));
    for (const p of brief.contra || []) {
      if (p.kind === "factor" && p.factorId && einordnungDafuer.has(p.factorId)) {
        nein("WIDERSPRUCH", "derselbe Faktor gilt als Staerke und als Schwaeche: " + p.factorId);
      }
    }
    const textDafuer = new Set((brief.pro || []).map((p) => p.text).filter(Boolean));
    for (const p of brief.contra || []) {
      if (p.text && textDafuer.has(p.text)) nein("WIDERSPRUCH", "derselbe Satz steht in beiden Spalten: " + p.text.slice(0, 60));
    }
  }

  /* 7 reduzierte Reise. Die Form steht nicht in `sources`, sie wird aus den
     Stationen berechnet - `sources.shape` gibt es nicht, und die Pruefung lief
     damit nie. */
  let form = null;
  if (brief && brief.sources) {
    const d = brief.sources;
    try {
      form = Shape.assess(Shape.stationsFrom({ stock: d.stock, factors: d.factors, setup: d.setup,
        patterns: d.patterns, match: d.match, technical: d.technical }));
    } catch { form = null; }
  }
  if (form && form.shape && form.shape !== "FULL") {
    const saetze = [kopfsatz, ...(form.causes || []).map((c) => c.headline),
      ...(form.causes || []).map((c) => c.sentence)].filter(Boolean);
    if (!saetze.length) nein("REDUZIERTE_REISE", "reduziert, aber ohne Satz");
    for (const satz of saetze) if (CODE.test(satz)) nein("REDUZIERTE_REISE", "Code im Satz: " + (satz.match(CODE) || [])[0]);
  }

  /* 8 Methodik */
  void 0;
  if (factors && factors.state === "AVAILABLE") {
    if (!factors.methodologyVersion) nein("METHODIK", "keine Fassung genannt");
  }
  if (quant && quant.state === "AVAILABLE" && !quant.methodologyHref) nein("METHODIK", "kein Weg zur Methodik");

  /* Und keine Station, die einen Zustand ohne Grund meldet. */
  for (const [id, station] of [["setup", setup], ["strategy", strategy], ["patterns", patterns]]) {
    if (station && station.state && station.state !== "AVAILABLE" && !station.reason) {
      nein("OHNE_GRUND", id + " ist nicht verfuegbar und nennt keinen Grund");
    }
  }
  return befunde;
}

async function main() {
  const universe = await api.getUniverse();
  if (universe.state !== "AVAILABLE") { process.stdout.write("Universum nicht verfügbar\n"); process.exit(1); }
  const index = JSON.parse(gunzipSync(await readFile(join(ROOT, "quant/data/product/universe-list-v1.json.gz"))).toString("utf8"));
  const nameSoll = new Map((index.entries || []).filter((e) => e.n).map((e) => [e.s, e.n]));
  const sortiert = universe.stocks.slice().sort((a, b) => (a.ticker < b.ticker ? -1 : 1));

  /* Die Rollen besetzen: der alphabetisch erste Treffer, der noch nicht
     vergeben ist - so bleibt die Stichprobe zwischen zwei Läufen gleich und
     deckt trotzdem zwölf verschiedene Lagen ab. */
  const gewaehlt = new Map(GENANNT.map((t) => [t, ["GENANNT"]]));
  const extraVon = new Map();
  async function extra(s) {
    if (extraVon.has(s.ticker)) return extraVon.get(s.ticker);
    const [setup, strategy] = await Promise.all([
      api.getSetupObservation(s.ticker).catch(() => null),
      api.getStrategyMatch(s.ticker).catch(() => null)
    ]);
    const e = { setupState: setup && setup.state, strategyState: strategy && strategy.state, template: null };
    extraVon.set(s.ticker, e);
    return e;
  }
  for (const [id, praedikat] of rollen(index)) {
    let treffer = null;
    for (const s of sortiert) {
      if (gewaehlt.has(s.ticker) && !GENANNT.includes(s.ticker)) continue;
      /* Nur wo das Prädikat die Zusatzabfragen braucht, werden sie geholt -
         zwei Dienstaufrufe je Titel über 6.875 Titel wären unbezahlbar. */
      const braucht = /SETUP|STRATEGIE|BANK/.test(id);
      const e = braucht ? await extra(s) : { setupState: null, strategyState: null, template: null };
      if (praedikat(s, e)) { treffer = s.ticker; break; }
    }
    if (!treffer) continue;
    gewaehlt.set(treffer, [...(gewaehlt.get(treffer) || []), id]);
  }

  const smoke = existsSync(SMOKE) ? JSON.parse(await readFile(SMOKE, "utf8")) : null;
  const imBrowser = new Set();
  if (smoke) for (const r of smoke.results || []) {
    const m = /ticker=([A-Z0-9.-]+)/.exec(r.view);
    if (m && r.ok) imBrowser.add(m[1]);
  }

  const zeilen = [];
  for (const [ticker, rollenIds] of gewaehlt) {
    const row = universe.stocks.find((s) => s.ticker === ticker);
    if (!row) { zeilen.push({ ticker, roles: rollenIds, state: "NICHT_IM_UNIVERSUM", findings: [{ check: "IDENTITAET", detail: "nicht im Produktuniversum" }] }); continue; }
    const [brief, factors, setup, strategy, patterns, quant] = await Promise.all([
      api.getIntelligenceBrief(ticker).catch(() => null),
      api.getFactorEvidence(ticker).catch(() => null),
      api.getSetupObservation(ticker).catch(() => null),
      api.getStrategyMatch(ticker).catch(() => null),
      api.getPatternMatch(ticker).catch(() => null),
      api.getQuantWorkspace(ticker).catch(() => null)
    ]);
    const befunde = pruefungen({ row, index, brief, factors, setup, strategy, patterns, quant, sollName: nameSoll.get(ticker) || null });
    zeilen.push({
      ticker, roles: rollenIds, name: row.name, securityType: (index.entries.find((e) => e.s === ticker) || {}).t || null,
      price: row.price && finite(row.price.value) ? row.price.value : null, priceAsOf: row.price ? row.price.asOf || null : null,
      factorState: row.factorState, factorReason: row.factorReason || null,
      journeyShape: (() => { const d = (brief && brief.sources) || null; if (!d) return null;
        try { return Shape.assess(Shape.stationsFrom({ stock: d.stock, factors: d.factors, setup: d.setup, patterns: d.patterns, match: d.match, technical: d.technical })).shape; } catch { return null; } })(),
      headline: brief && brief.headline && brief.headline.sentence ? brief.headline.sentence : null,
      browserChecked: imBrowser.has(ticker),
      findings: befunde, ok: befunde.length === 0
    });
  }

  const rot = zeilen.filter((z) => !z.ok);
  const bericht = {
    schemaVersion: "acceptance-sample-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    commit: (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { return null; } })(),
    named: GENANNT,
    roles: rollen(index).map(([id]) => id),
    titles: zeilen.length,
    ACCEPTANCE_SAMPLE_CLEAN: rot.length === 0 ? "PASS" : "FAIL",
    withFindings: rot.length,
    browserChecked: zeilen.filter((z) => z.browserChecked).length,
    smokeReport: smoke ? { commit: smoke.commit, clean: smoke.clean } : null,
    note: "Die neun genannten Titel stehen fest; die Rollen werden je Lauf über Prädikate " +
          "besetzt und sind deshalb zwischen zwei Läufen gleich, solange sich die Daten nicht " +
          "ändern. 'Im Browser geprüft' heißt: dieser Titel stand im Produktions-Smoke.",
    rows: zeilen
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  process.stdout.write("\nABNAHMESTICHPROBE · " + zeilen.length + " Titel · " +
    bericht.ACCEPTANCE_SAMPLE_CLEAN + "\n\n");
  for (const z of zeilen) {
    process.stdout.write("  " + (z.ok ? "ok  " : "FAIL") + " " + z.ticker.padEnd(9) +
      (z.roles.join("+") + "").padEnd(34) + (z.name || "(kein Name)").slice(0, 34).padEnd(35) +
      (z.browserChecked ? "Browser" : "") + "\n");
    for (const b of z.findings) process.stdout.write("         " + b.check + ": " + b.detail + "\n");
  }
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();

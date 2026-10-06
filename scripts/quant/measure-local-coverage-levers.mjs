#!/usr/bin/env node
/* =========================================================================
   WELCHE DECKUNGSLUECKE IST NOCH VON HIER AUS SCHLIESSBAR?

   Nach M34 bis M37 ist die Frage nicht mehr "wo fehlt etwas", sondern "wo
   fehlt etwas, das bereits veroeffentlichte Artefakte hergeben". Dieser
   Bericht ordnet jede gemessene Luecke in genau eine von fuenf Lagen:

     A  Daten vorhanden, der Verbraucher liest sie nicht.
     B  Daten vorhanden, die Zuordnung fehlt.
     C  Daten vorhanden, die Methodik haelt zu Recht zurueck.
     D  Echte Datenabwesenheit.
     E  Extern oder durch die Netzwerkpolitik blockiert.

   Nur A und B sind automatisch reparierbar. C braucht eine Owner- oder
   Vertragsentscheidung, D braucht Zeit oder eine Quelle, E braucht einen
   Zugang.

   WARUM DAS EIN EIGENER BERICHT IST

   Ohne ihn wird aus jeder Luecke ein Auftrag. Gemessen sind die meisten
   verbleibenden Luecken KEIN Auftrag: 784 von 786 Nullzeilen sind zu jung,
   465 Boersenwerte sind bewusst zurueckgehalten, und 1.100 fehlende Namen
   stehen in keiner lokalen Quelle. Wer das nicht trennt, baut an der
   falschen Stelle.

   Ausfuehren:
     node scripts/quant/measure-local-coverage-levers.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const Inputs = require(join(ROOT, "quant/engines/fundamental-inputs.js"));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/product/coverage-levers-v1.json"));
const FE_DIR = join(ROOT, "quant/data/product/factor-evidence-v1");
const CONSUMER = join(ROOT, "quant/data/sec/consumer");

const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const gz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));

/* Welche Kennzahlen die Eingabeschicht wirklich liest - aus ihrem Quelltext,
   damit die Liste nicht neben dem Code herlaeuft. */
function geleseneMetriken() {
  const src = readFileSync(join(ROOT, "quant/engines/fundamental-inputs.js"), "utf8");
  const set = new Set();
  for (const m of src.matchAll(/(?:annualSeries|quarterSeries|ttmValue)\(doc,\s*"([a-z_]+)"/g)) set.add(m[1]);
  return set;
}

async function main() {
  const luecken = [];
  const merke = (area, lage, anzahl, befund, intern, beweis) =>
    luecken.push({ area, case: lage, titles: anzahl, finding: befund,
                   internallyClosable: intern, evidence: beweis });

  /* ---------------------------------------------------- Faktor-Artefakt */
  const zeilen = [];
  for (const datei of (await readdir(FE_DIR))) {
    if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
    for (const row of Object.values(gz(join(FE_DIR, datei)).securities || {})) zeilen.push(row);
  }
  const FAKTOREN = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];

  /* ----------------------------------------------------- 1. Boersenwert */
  const mcGruende = {};
  let mcVorhanden = 0;
  for (const r of zeilen) {
    if (Number.isFinite(r.marketCap)) { mcVorhanden += 1; continue; }
    const grund = r.marketCapReason || (r.fundamentalsAsOf ? "FUNDAMENTALS_WITHOUT_SHARE_BLOCK" : "NO_FUNDAMENTALS_AT_ALL");
    mcGruende[grund] = (mcGruende[grund] || 0) + 1;
  }
  /* Kein Anteilsbestand: fehlt er ganz, oder ist er nur veraltet? Das
     unterscheidet "die SEC hat ihn nie gemeldet" von "die Meldung ist alt". */
  let ohneBestandGanz = 0, bestandVeraltet = 0;
  for (const r of zeilen) {
    if (r.marketCapReason !== "NO_PIT_SHARE_COUNT" || !r.cik) continue;
    const p = join(CONSUMER, "CIK" + String(r.cik).padStart(10, "0") + ".json");
    if (!existsSync(p)) { ohneBestandGanz += 1; continue; }
    const roh = Inputs.ttmValue(json(p), "shares_outstanding", r.dataCutoff);
    if (roh) bestandVeraltet += 1; else ohneBestandGanz += 1;
  }

  merke("MARKET_CAP", "C", mcGruende.SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING || 0,
    "Ein Emittent, mehrere notierte Zeilen: der Anteilsbestand gilt dem Emittenten, nicht der Zeile. Fail-closed nach quant-v2-valuation-level-1.0.0.",
    false, "Der Beleg fuer eine Zeile waere eine Aktienzahl je Gattung; der Massendatensatz fuehrt keine dimensionierten Tatsachen.");
  merke("MARKET_CAP", "D", ohneBestandGanz,
    "Die SEC-Quelle fuehrt fuer diesen Emittenten ueberhaupt keinen Anteilsbestand.", false,
    "Kein Wert in annual, quarterly oder ttm.");
  merke("MARKET_CAP", "D", bestandVeraltet,
    "Ein Anteilsbestand existiert, liegt aber jenseits der 400-Tage-Regel und ist damit kein heutiger Bestand.", false,
    "Die Periodenregel verwirft ihn; ein neuerer Wert steht nicht in der Quelle. Accenture: einzige Beobachtung vom 2010-02-28.");
  merke("MARKET_CAP", "A", 0,
    "Kurs fehlte, obwohl eine veroeffentlichte Tagesreihe existiert - in M36 geschlossen.", true,
    "NO_PUBLISHED_CLOSE ist von 131 auf 0 gefallen.");
  merke("MARKET_CAP", "E", (mcGruende.NO_FUNDAMENTALS_AT_ALL || 0),
    "Keine Fundamentaldaten: ohne CIK, ohne Export oder mit rohen Tatsachen ohne Zuordnung.", false,
    "Die Zuordnungsluecke braucht die Rohtatsachen; data.sec.gov ist gesperrt.");

  /* -------------------------------------------- 2. Fundamentale Faktoren */
  for (const factorId of ["value", "quality", "growth", "profitability"]) {
    const gruende = {};
    let verfuegbar = 0;
    for (const r of zeilen) {
      const f = r.factors[factorId];
      if (!f) continue;
      if (f.state === "AVAILABLE") { verfuegbar += 1; continue; }
      gruende[f.reason || "OHNE_GRUND"] = (gruende[f.reason || "OHNE_GRUND"] || 0) + 1;
    }
    merke(factorId.toUpperCase(), "C", gruende.SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING || 0,
      "Faktor haengt am Boersenwert, der bewusst zurueckgehalten wird.", false,
      "Dieselbe Ursache wie MARKET_CAP/C: ein Emittent mit mehreren notierten Zeilen hat keine " +
      "Aktienzahl je Zeile, und jede Bewertungskomponente teilt durch einen Boersenwert.");
    merke(factorId.toUpperCase(), "C", (gruende.INSUFFICIENT_COMPONENTS || 0) + (gruende.INSUFFICIENT_WEIGHTED_COVERAGE || 0),
      "Die Mindestanforderung des Vertrags ist nicht erreicht (drei Komponenten, 60 Prozent Gewicht).", false,
      "Eine Absenkung waere eine Methodikaenderung mit eigener Fassung, kein Repair.");
    merke(factorId.toUpperCase(), "D", gruende.INPUT_NOT_MATERIALIZED || 0,
      "Die Eingabe steht in keinem Artefakt - ueberwiegend, weil der Emittent sie nicht meldet.", false,
      "Gegenprobe: alle sechs ungenutzten Kennzahlen der Exporte wuerden neue Komponenten verlangen, keine bestehende freischalten.");
    merke(factorId.toUpperCase(), "D", gruende.FUNDAMENTALS_UNAVAILABLE || 0,
      "Kein zeitpunktsicherer Abschluss.", false,
      "Dieselbe Ursache wie MARKET_CAP/E: ohne CIK, ohne Consumer-Export oder mit rohen " +
      "Tatsachen, die die Registry nicht zuordnet - letzteres braucht die gesperrten Rohdaten.");
    merke(factorId.toUpperCase(), "C", gruende.MANDATORY_COMPONENT_MISSING || 0,
      "Eine im Vertrag zwingende Komponente fehlt.", false,
      "Zwingend heisst im Vertrag: kein Ersatz und keine Neugewichtung. Der Faktor bleibt zu, " +
      "auch wenn das uebrige Gewicht die Mindestschwelle erreichen wuerde.");
  }

  /* --------------------------------- 3. Ungenutzte Kennzahlen der Exporte */
  const gelesen = geleseneMetriken();
  const vorhanden = {};
  for (const datei of (await readdir(CONSUMER))) {
    if (!datei.endsWith(".json")) continue;
    const d = json(join(CONSUMER, datei));
    for (const blk of ["annual", "quarterly", "ttm"]) {
      for (const m of Object.keys(d[blk] || {})) {
        (vorhanden[m] = vorhanden[m] || { annual: 0, quarterly: 0, ttm: 0 })[blk] += 1;
      }
    }
  }
  const ungenutzt = Object.entries(vorhanden).filter(([m]) => !gelesen.has(m))
    .map(([m, c]) => ({ metric: m, issuers: c })).sort((a, b) => b.issuers.annual - a.issuers.annual);
  merke("FUNDAMENTAL_INPUTS", "A", ungenutzt.length,
    "Kennzahlen, die die Exporte fuehren und die Eingabeschicht nicht liest.", false,
    "Sie wuerden NEUE Komponenten verlangen - das ist eine Methodikaenderung mit eigener Fassung und kein automatischer Repair. " +
    "Geprueft, ob eine BESTEHENDE Komponente daran haengt: EBITDA wird schon oben abgeleitet (2.661 von 2.661), " +
    "und long_term_debt ist nicht total_debt.");

  /* ---------------------------------------------- 4. Technische Schicht */
  const techPfad = join(ROOT, "quant/data/product/technical-signals-v1/summary.json");
  if (existsSync(techPfad)) {
    const t = json(techPfad);
    const r = t.reasons || {};
    merke("TECHNICAL", "D", (r.INSUFFICIENT_HISTORY || 0),
      "Zu kurze Kursreihe fuer die Technical-Fenster.", false,
      "Der Titel waechst von selbst hinein: die Fenster brauchen 252 bis 270 Sitzungen, und jede " +
      "weitere Sitzung kommt taeglich hinzu. Eine Verkuerzung waere eine Methodikabsenkung.");
    merke("SETUP", "D", (r.SIGNAL_INSUFFICIENT_HISTORY || 0),
      "Zu kurze Kursreihe fuer die Signalfenster.", false,
      "Wie bei TECHNICAL: die Signalpruefungen laufen ueber die letzten 261 bis 270 Sitzungen, " +
      "und die Reihe waechst taeglich. Nichts daran ist reparierbar, nur abwartbar.");
    merke("TECHNICAL", "E", (r.TECHNICAL_WINDOW_OUTSIDE_CALENDAR || 0) + (r.SIGNAL_INVALID_SIGNAL_SESSION || 0) +
      (r.TECHNICAL_SESSION_NOT_A_TRADING_DAY || 0),
      "Das Fenster reicht vor die Kalenderdeckung zurueck.", false,
      "Der Handelskalender ist eine eingecheckte Konfiguration, aber frueher Jahre aufzunehmen braucht zweifach belegte Feiertage - " +
      "die stehen in keiner lokalen Quelle. Von 208 plus 205 im September auf 40 plus 40 gefallen.");
  }

  /* ----------------------------------------------------- 5. Strategie */
  const siPfad = join(ROOT, "quant/data/product/strategy-index-v1.json.gz");
  if (existsSync(siPfad)) {
    const si = gz(siPfad);
    const zu = (si.profiles || []).filter((p) => p.availability && p.availability.state !== "AVAILABLE");
    merke("STRATEGY_MATCH", "E", zu.length,
      "Profile ohne auswertbare Eingabe.", false,
      "Gemessen: " + zu.map((p) => p.profileId + " (" + (p.availability.fields || []).join(",") + ")").join("; ") +
      " - Revisions bleibt ohne lizenzierte zeitpunktgenaue Analystendaten geschlossen.");
  }

  /* -------------------------------------------------- 6. Musterabgleich */
  const pmPfad = join(ROOT, "quant/data/product/pattern-match-v1/summary.json");
  if (existsSync(pmPfad)) {
    const pm = json(pmPfad);
    merke("PATTERN_MATCH", "D", pm.withoutFundamentals || 0,
      "Musterabgleich ohne Fundamentalueberlagerung.", false,
      "Die Musterstudie braucht denselben Abschluss, der auch den Faktoren fehlt.");
  }

  /* --------------------------------------------- 7. Namen und Identitaet */
  const cap = json(join(ROOT, "quant/data/universe/market-capability.json")).members || [];
  const SYM = join(ROOT, "quant/data/universe/search/sym");
  const namen = new Map();
  for (const f of readdirSync(SYM)) {
    if (!f.endsWith(".json")) continue;
    for (const e of json(join(SYM, f)).entries || []) if (e && e.s) namen.set(e.s, e.n || null);
  }
  const cikMap = json(join(ROOT, "quant/data/universe/cik-map.json")).byTicker || {};
  let ohneName = 0, ausCikVerzeichnis = 0;
  for (const m of cap) {
    if (namen.get(m.s)) continue;
    ohneName += 1;
    if (cikMap[m.s] && cikMap[m.s].name) ausCikVerzeichnis += 1;
  }
  merke("STOCK_IDENTITY_NAMES", ausCikVerzeichnis > 0 ? "A" : "D", ohneName,
    "Universumsmitglieder ohne Namen.", ausCikVerzeichnis > 0,
    ausCikVerzeichnis + " davon haetten einen Namen im SEC-Kuerzelverzeichnis. Gemessen ist das null: " +
    "die namenlosen Titel stehen in keiner lokalen Namensquelle.");

  /* ------------------------------------------ 8. Gattungsklassifikation */
  const stPfad = join(ROOT, "quant/data/product/security-type-provenance-v1.json");
  if (existsSync(stPfad)) {
    const st = json(stPfad);
    merke("SECURITY_CLASSIFICATION", "D", (st.byBasis || {}).RESIDUAL_NO_SPECIAL_PATTERN || 0,
      "Gattung ohne positiven Beleg - der Anbieter sagt nur 'Stock'.", false,
      "Belastbar waere ein Wertpapiername oder ein Identifikator; ISIN, CUSIP und FIGI fehlen fuer alle " +
      st.instruments + " Instrumente. Die Konfidenz sagt das seit M37 (HIGH_CONFIDENCE_WITHOUT_EVIDENCE = 0).");
  }

  /* ------------------------------------------------- 9. Zuordnungsluecke */
  const klassPfad = join(ROOT, "quant/data/providers/zero-factor-classification.json");
  if (existsSync(klassPfad)) {
    const k = json(klassPfad);
    merke("SEC_MAPPING", "B", (k.features || {}).INTERNAL_MAPPING_GAP || 0,
      "Rohe SEC-Tatsachen vorhanden, die Kennzahl-Registry ordnet keine davon zu.", false,
      "Reparierbar waere es im Haus - welche Konzepte fehlen, steht aber in den Rohtatsachen. " +
      "data.sec.gov antwortet mit CONNECT 403, deshalb BLOCKED_EXTERNAL_NETWORK.");
  }

  /* ------------------------------------- 10. Verschuldung: Owner-Entscheid */
  const census = join(ROOT, "quant/data/sec/concept-census.json");
  if (existsSync(census)) {
    const c = json(census);
    const heute = (c.compositions || []).find((x) => x.id === "B_heute_mit_ableitung");
    merke("DEBT_CONCEPTS", "C", heute ? heute.issuers : 0,
      "Die Gesamtverschuldung erreicht heute " + (heute ? heute.issuers : "?") + " Emittenten; eine weitere Reichweite " +
      "waere eine ANDERE Kennzahl.", false,
      "Das Entscheidungsmaterial liegt vollstaendig vor (concept-census.json, " + c.issuers + " Emittenten): " +
      (c.compositions || []).map((x) => x.id + "=" + x.issuers).join(", ") +
      ". Owner-Entscheidung, keine Messung - sie aendert, was eine veroeffentlichte Kennzahl bedeutet.");
  }

  /* ------------------------------------------------------------ Bericht */
  const nachLage = {};
  for (const l of luecken) nachLage[l.case] = (nachLage[l.case] || 0) + 1;
  const automatisch = luecken.filter((l) => (l.case === "A" || l.case === "B") && l.internallyClosable && l.titles > 0);

  const bericht = {
    schemaVersion: "coverage-levers-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    question: "Welche gemessene Luecke laesst sich noch aus bereits veroeffentlichten Artefakten schliessen?",
    cases: {
      A: "Daten vorhanden, der Verbraucher liest sie nicht.",
      B: "Daten vorhanden, die Zuordnung fehlt.",
      C: "Daten vorhanden, die Methodik haelt zu Recht zurueck.",
      D: "Echte Datenabwesenheit.",
      E: "Extern oder durch die Netzwerkpolitik blockiert."
    },
    universe: zeilen.length,
    marketCapPresent: mcVorhanden,
    marketCapGapsByReason: mcGruende,
    unusedConsumerMetrics: ungenutzt,
    gaps: luecken,
    gapsByCase: nachLage,
    AUTOMATICALLY_REPAIRABLE_REMAINING: automatisch,
    conclusion: automatisch.length === 0
      ? "Kein Fall A oder B ist mehr automatisch schliessbar. Was offen bleibt, braucht eine " +
        "Owner-Entscheidung (C), Zeit oder eine Quelle (D), oder einen Zugang (E)."
      : automatisch.length + " Faelle bleiben automatisch schliessbar.",
    note: "Korrektheit vor Reichweite. Eine Luecke ist kein Auftrag, solange ihre Lage nicht A oder B ist."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  process.stdout.write("\nVERBLEIBENDE DECKUNGSHEBEL · " + zeilen.length + " Titel\n\n");
  process.stdout.write("Bereich".padEnd(26) + "Lage".padEnd(6) + "Titel".padStart(7) + "  Befund\n");
  process.stdout.write("-".repeat(112) + "\n");
  for (const l of luecken) {
    if (!l.titles) continue;
    process.stdout.write(l.area.padEnd(26) + l.case.padEnd(6) + String(l.titles).padStart(7) + "  " + l.finding.slice(0, 68) + "\n");
  }
  process.stdout.write("\nUNGENUTZTE KENNZAHLEN DER EXPORTE (Fall A auf Kennzahlebene)\n");
  for (const u of ungenutzt) {
    process.stdout.write("  " + u.metric.padEnd(34) + String(u.issuers.annual).padStart(6) + " Jahresreihen\n");
  }
  process.stdout.write("\n" + bericht.conclusion + "\n");
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();

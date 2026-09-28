#!/usr/bin/env node
/* =========================================================================
   PUBLIC_BETA_LAUNCH_READY — DIE ZWÖLF P0-GATES, GEMESSEN.

   Ab dem 28.09.2026 ist das Ziel nicht Vollständigkeit, sondern ein
   veröffentlichungsfähiges Produkt. Diese Messung ist der Ersatz für die
   Frage „sind wir fertig?": jedes der zwölf Gates ist PASS, FAIL oder
   NOT_MEASURED, und jedes FAIL nennt seine Fälle.

   WAS SIE NICHT TUT

   Sie schätzt nichts. Vier Gates (Mobil, Desktop, Navigation, Fehlerbilder)
   sind nur im Browser gegen das GEBAUTE Release entscheidbar; dafür liest sie
   den Bericht des Produktions-Smokes und verlangt, dass er zum aktuellen
   Commit gehört. Fehlt er oder ist er älter, steht das Gate auf
   NOT_MEASURED - und NOT_MEASURED ist für einen Launch kein PASS.
   Gate 12 verlangt ebenso einen echten Suite-Bericht.

   WARUM ÜBER ALLE TITEL UND NICHT ÜBER EINE STICHPROBE

   In M40 hat eine 20er-Stichprobe einen Fehler übersehen, der 743 Titel
   betraf. Alles, was bezahlbar über das ganze Produktuniversum messbar ist,
   wird über das ganze Produktuniversum gemessen. Wo das nicht bezahlbar ist
   (die Auskunft je Titel), steht die Stichprobengröße im Bericht.

   Ausführen:
     node scripts/vu2/measure-launch-readiness.mjs \
       [--smoke <bericht.json>] [--suite <bericht.json>] \
       [--release <verzeichnis>] [--brief-sample 500] [--out <pfad>]
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

const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Shape = require(join(ROOT, "quant/engines/journey-shape.js"));
const Brief = require(join(ROOT, "quant/engines/intelligence-brief.js"));
const Master = require(join(ROOT, "quant/engines/company-master.js"));
const Fundamentals = require(join(ROOT, "quant/engines/fundamental-inputs.js"));

const SCHEMA = "launch-readiness-1.0.0";
const OUT = arg("out", join(ROOT, "quant/data/product/launch-readiness-v1.json"));
const SMOKE = arg("smoke", join(ROOT, ".launch/production-smoke.json"));
const SUITE = arg("suite", join(ROOT, ".launch/test-suite.json"));
const RELEASE = arg("release", null);
const BRIEF_SAMPLE = parseInt(arg("brief-sample", "500"), 10);

const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

const HEAD = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { return null; } })();

/* WANN EIN BERICHT NOCH GILT.

   Ein Bericht muss nicht auf HEAD entstanden sein - er muss nur auf einem
   Stand entstanden sein, an dem sich seither nichts Relevantes geaendert hat.
   Der strengere Vergleich (nur HEAD) macht das Gate einmalig: sobald der
   Bericht selbst eingecheckt ist, waere er "veraltet" und das Gate offen,
   obwohl niemand Code angefasst hat. Geprueft wird deshalb: ist der Commit
   ein Vorfahre von HEAD, und hat sich seither eine der Dateien geaendert, auf
   die der Bericht sich bezieht? Ein unsauberer Arbeitsbaum an diesen Pfaden
   zaehlt ebenso als Aenderung. */
/* Relevant ist, was das AUSGELIEFERTE Produkt aendert: die Engines, der
   Dienst, die Oberflaeche, die Methodikdateien und die Artefakte, die sie
   lesen. Die Bau- und Messskripte stehen bewusst NICHT hier: ein geaendertes
   Skript aendert das Produkt erst, wenn es gelaufen ist - und dann hat sich
   sein Artefakt geaendert, das hier steht. Nimmt man sie mit auf, macht jedes
   neue Messskript einen tadellosen Browser-Smoke ungueltig. */
const RELEVANT = ["quant/engines", "quant/api", "vu2", "quant/methodology", "quant/data/product", "quant/data/universe", "quant/data/market"];
/* Drei Dateien unter `quant/data/product` sind MESSERGEBNISSE und werden vom
   Produkt nie gelesen. Sie muessen ausgenommen werden, sonst macht der
   Launch-Bericht, sobald er eingecheckt ist, den Suite- und den Smoke-Beleg
   ungueltig, den er selbst enthaelt - eine Katze, die ihren Schwanz jagt. */
const BERICHTSDATEIEN = new Set([
  "quant/data/product/launch-readiness-v1.json",
  "quant/data/product/acceptance-sample-v1.json",
  "quant/data/product/intelligence-coherence-v1.json"
]);
function berichtGilt(bericht) {
  if (!bericht || !bericht.commit) return { ok: false, reason: "OHNE_COMMIT" };
  if (!HEAD) return { ok: false, reason: "OHNE_GIT" };
  if (bericht.commit === HEAD) return { ok: true, reason: "AUF_HEAD", changed: [] };
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", bericht.commit, HEAD], { cwd: ROOT });
  } catch { return { ok: false, reason: "KEIN_VORFAHRE_VON_HEAD" }; }
  const geaendert = execFileSync("git", ["diff", "--name-only", bericht.commit + "..HEAD", "--", ...RELEVANT], { cwd: ROOT })
    .toString().trim().split("\n").filter(Boolean);
  const offen = execFileSync("git", ["status", "--porcelain", "--", ...RELEVANT], { cwd: ROOT })
    .toString().trim().split("\n").filter(Boolean).map((z) => z.slice(3));
  const alle = [...new Set([...geaendert, ...offen])].filter((pfad) => !BERICHTSDATEIEN.has(pfad));
  return alle.length
    ? { ok: false, reason: "SEITHER_GEAENDERT", changed: alle.slice(0, 10), changedCount: alle.length }
    : { ok: true, reason: "VORFAHRE_OHNE_AENDERUNG", changed: [] };
}
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const lesen = async (p) => (existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : null);
const entpacken = (p) => JSON.parse(gunzipSync(require("node:fs").readFileSync(join(ROOT, p))).toString("utf8"));

/* Ein Gate ist ein Urteil mit Belegen. `cases` sind die Fälle, an denen ein
   FAIL nachprüfbar ist - abgeschnitten, damit der Bericht lesbar bleibt, mit
   der vollen Zahl daneben. */
function gate(id, title, ok, facts, cases) {
  const faelle = cases || [];
  return {
    id, title,
    status: ok === null ? "NOT_MEASURED" : ok ? "PASS" : "FAIL",
    facts: facts || {},
    caseCount: faelle.length,
    cases: faelle.slice(0, 25)
  };
}

/* Interne Codes und Handlungssprache - die zwei Dinge, die in einem
   Nutzersatz nie stehen dürfen. §81 und das Sprachverzeichnis. */
const CODE = /\b[A-Z]{3,}_[A-Z][A-Z_]{2,}\b/;
const HANDLUNG = /\b(kaufen|verkaufen|Kaufempfehlung|Verkaufsempfehlung|Kursziel|wird steigen|wird fallen|garantiert)\b/i;

async function main() {
  const gates = [];
  const universe = await api.getUniverse();
  if (universe.state !== "AVAILABLE") {
    process.stdout.write("Universum nicht verfügbar: " + universe.state + "\n");
    process.exit(1);
  }
  const titel = universe.stocks;
  const sprache = JSON.parse(await readFile(join(ROOT, "quant/methodology/product-language-v1.json"), "utf8"));

  /* Das Verzeichnis ist die Identitäts- und Kursquelle. Beide Gates unten
     vergleichen GEGEN dieses Artefakt und nicht die Flächen gegeneinander:
     zwei Flächen, die aus derselben Zeile lesen, bestätigen sich gegenseitig
     auch dann, wenn die Zeile falsch ist. */
  const verzeichnis = entpacken("quant/data/product/universe-list-v1.json.gz");
  const nachTicker = new Map((verzeichnis.entries || []).map((e) => [e.s, e]));

  /* ---------------------------------------------------------------- 1 */
  const namensbericht = await lesen(join(ROOT, "quant/data/product/naming-contract-v1.json"));
  const identitaet = [];
  let ohneNamen = 0, tickerAlsName = 0;
  for (const s of titel) {
    const eintrag = nachTicker.get(s.ticker);
    const soll = eintrag && eintrag.n ? eintrag.n : null;
    if (!s.name) { ohneNamen += 1; continue; }
    if (s.name === s.ticker) { tickerAlsName += 1; identitaet.push({ ticker: s.ticker, surface: "LISTE", shown: s.name, expected: soll, kind: "TICKER_ALS_NAME" }); continue; }
    if (soll && s.name !== soll) identitaet.push({ ticker: s.ticker, surface: "LISTE", shown: s.name, expected: soll, kind: "ABWEICHUNG" });
  }
  /* Und die anderen Flächen, die einen Namen veröffentlichen. Die Liste war
     nie die einzige: die Quant-Ansicht trug bis hierher den Panelnamen in
     Versalien. */
  const flaechen = [
    ["AKTIENSEITE", (t) => api.getStockIntelligence(t)],
    ["QUANT", (t) => api.getQuantWorkspace(t)],
    ["TECHNIK", (t) => api.getTechnicalWorkspace(t)]
  ];
  const namensProbe = titel.filter((_, i) => i % 7 === 0);
  for (const [flaeche, hole] of flaechen) {
    for (const s of namensProbe) {
      const soll = (nachTicker.get(s.ticker) || {}).n || null;
      if (!soll) continue;
      const d = await hole(s.ticker).catch(() => null);
      if (!d || !d.name) continue;
      if (d.name !== soll) identitaet.push({ ticker: s.ticker, surface: flaeche, shown: d.name, expected: soll, kind: "ABWEICHUNG" });
    }
  }
  const partitionOk = !!namensbericht &&
    Object.values(namensbericht.partitionCounts || {}).reduce((a, b) => a + b, 0) === namensbericht.deviatingAcrossLevels;
  gates.push(gate("IDENTITY_CORRECTNESS", "Jede Fläche nennt denselben, belegten Namen",
    identitaet.length === 0 && tickerAlsName === 0 && partitionOk &&
    !!namensbericht && namensbericht.contractVersion === "company-naming-1.0.0",
    {
      titles: titel.length, surfacesChecked: 1 + flaechen.length,
      surfaceSample: namensProbe.length,
      contractVersion: namensbericht ? namensbericht.contractVersion : null,
      partitionAddsUp: partitionOk,
      identityConflicts: namensbericht ? namensbericht.IDENTITY_CONFLICT_COUNT : null,
      withoutName: ohneNamen, tickerAsName: tickerAlsName,
      deviations: identitaet.length
    }, identitaet));

  /* ---------------------------------------------------------------- 2 */
  const typbericht = await lesen(join(ROOT, "quant/data/product/security-type-safety-v1.json"));
  /* "Belegt keine Aktie" ist EINE Definition, und sie steht in der
     Gattungsmessung. Sie hier aus dem Verzeichnis neu herzuleiten war der
     erste Bau dieses Gates - und er zaehlte 1.417 Faelle, weil das
     Verzeichnis die Gattung ohne ihren Beleggrad fuehrt: eine aus einem
     schwachen Hinweis abgeleitete Gattung waere damit wie ein Beleg
     behandelt worden. Gelesen wird deshalb die veroeffentlichte Liste. */
  const belegt = new Set((typbericht && typbericht.provenNonEquity && typbericht.provenNonEquity.tickers) || []);
  const belegteGattung = (typbericht && typbericht.provenNonEquity && typbericht.provenNonEquity.byTicker) || {};
  const screenerTypen = Object.keys(Master.SCREENER_TYPES);
  const gattung = [];
  for (const s of titel) {
    if (!belegt.has(s.ticker)) continue;
    const eintrag = nachTicker.get(s.ticker) || {};
    /* Ein Papier ohne Aktiencharakter darf keine Aktienaussage tragen. Kurs,
       Kursverlauf und Suche bleiben - deshalb wird der Kurs hier NICHT
       geprüft. */
    if (s.factorState === "AVAILABLE") gattung.push({ ticker: s.ticker, type: eintrag.t || null, kind: "LISTE_BEHAUPTET_FAKTOREN", detail: "factorState=AVAILABLE" });
    if (s.capabilities && s.capabilities.factors === true) gattung.push({ ticker: s.ticker, type: eintrag.t || null, kind: "LISTE_BEHAUPTET_FAKTOR_FAEHIGKEIT", detail: "capabilities.factors=true" });
    if (s.marketCap && finite(s.marketCap.value)) {
      gattung.push({ ticker: s.ticker, type: eintrag.t || null, kind: "BOERSENWERT", detail: String(s.marketCap.value) });
    }
  }
  const gattungsProbe = titel.filter((s) => belegt.has(s.ticker)).filter((_, i) => i % 3 === 0);
  for (const s of gattungsProbe) {
    const ev = await api.getFactorEvidence(s.ticker).catch(() => null);
    if (ev && ev.state === "AVAILABLE") gattung.push({ ticker: s.ticker, kind: "FAKTOREN_AUF_DER_SEITE", detail: "getFactorEvidence=AVAILABLE" });
    const st = await api.getStrategyMatch(s.ticker).catch(() => null);
    if (st && st.state === "AVAILABLE") gattung.push({ ticker: s.ticker, kind: "STRATEGIE_TREFFER", detail: "getStrategyMatch=AVAILABLE" });
  }
  const restOk = !!typbericht && Object.entries(typbericht.residual || {})
    .filter(([k]) => k !== "note").every(([, v]) => v === 0);
  gates.push(gate("SECURITY_TYPE_SAFETY", "Kein Aktienurteil über ein Papier, das keine Aktie ist",
    gattung.length === 0 && restOk && !!typbericht && typbericht.STOCK_SCREENER_REMAINING === 0,
    {
      provenNonEquity: belegt.size, checkedOnPage: gattungsProbe.length,
      screenerTypes: screenerTypen,
      byType: (typbericht && typbericht.provenNonEquity && typbericht.provenNonEquity.byType) || null,
      reclassified: typbericht ? typbericht.ETF_RECLASSIFIED : null,
      screenerRemaining: typbericht ? typbericht.STOCK_SCREENER_REMAINING : null,
      residualAllZero: restOk,
      ambiguousUntouched: typbericht ? typbericht.AMBIGUOUS_NOT_CHANGED : null,
      violations: gattung.length
    }, gattung));

  /* ---------------------------------------------------------------- 3 */
  const heute = new Date();
  const alter = (d) => (d ? Math.round((heute - new Date(d)) / 86400000) : null);
  /* DIE VIER STUFEN, MIT IHREN ECHTEN NAMEN.

     Der erste Bau dieses Gates hat zwei Namen geraten
     (`vu2-product-materialize.yml`, `pages-deploy.yml`) - beide gibt es
     nicht, und das Gate stand trotzdem auf PASS, weil es nur verlangte, dass
     IRGENDEIN Zeitplan existiert. Eine Stufe, deren Datei fehlt, muss das
     Gate schliessen; sonst prueft es die Kette nicht, sondern ihre
     Anwesenheit. */
  const STUFEN = [
    ["REFRESH", "market-data-refresh.yml"],
    ["STORE", "history-store-sync.yml"],
    ["MATERIALIZATION", "product-intelligence-materialization.yml"],
    ["DEPLOY", "pages-release.yml"]
  ];
  const zeitplan = [];
  for (const [stufe, datei] of STUFEN) {
    const pfad = join(ROOT, ".github/workflows", datei);
    if (!existsSync(pfad)) { zeitplan.push({ stage: stufe, workflow: datei, exists: false, automatic: false }); continue; }
    const text = await readFile(pfad, "utf8");
    const scheduled = /^\s*schedule:/m.test(text);
    const onPush = /^\s*push:/m.test(text);
    const nachAnderem = /^\s*workflow_run:/m.test(text);
    zeitplan.push({
      stage: stufe, workflow: datei, exists: true,
      scheduled, onPush, chainedOnOtherRun: nachAnderem,
      dispatch: /workflow_dispatch/.test(text),
      /* "Ohne Hand" heisst: ein Zeitplan, ein Push oder ein vorangehender
         Lauf loest sie aus. Nur `workflow_dispatch` ist eine Hand. */
      automatic: scheduled || onPush || nachAnderem
    });
  }
  const kette = {
    priceAsOf: verzeichnis.coverage && verzeichnis.coverage.asOf ? verzeichnis.coverage.asOf : (titel[0] && titel[0].price ? titel[0].price.asOf : null),
    listGeneratedAt: verzeichnis.generatedAt || null,
    universeAsOf: titel[0] ? titel[0].asOf : null
  };
  kette.priceAgeDays = alter(kette.priceAsOf);
  kette.listAgeDays = alter(kette.listGeneratedAt);
  /* Die Kette darf nicht rückwärts laufen: eine Materialisierung, die ÄLTER
     ist als der Kurs, den sie veröffentlicht, wäre ein stiller Rückstand. */
  const ketteVorwaerts = kette.priceAgeDays === null || kette.listAgeDays === null ||
    kette.listAgeDays <= kette.priceAgeDays;
  const fehlend = zeitplan.filter((z) => !z.exists);
  /* Der Anfang der Kette braucht einen Zeitplan - sonst laeuft sie nie an.
     Die Stufe STORE ist ein Hebel und darf von Hand bleiben: der Refresh
     schiebt seine Ergebnisse selbst in die Ablage (siehe MERGED_2026-09-25). */
  const beginnt = zeitplan.some((z) => z.stage === "REFRESH" && z.scheduled);
  const vonHand = zeitplan.filter((z) => z.exists && !z.automatic && z.stage !== "STORE");
  const befunde = [];
  for (const z of fehlend) befunde.push({ kind: "STUFE_FEHLT", detail: z.stage + " (" + z.workflow + ")" });
  for (const z of vonHand) befunde.push({ kind: "NUR_VON_HAND", detail: z.stage + " (" + z.workflow + ")" });
  if (!beginnt) befunde.push({ kind: "OHNE_ZEITPLAN", detail: "die Kette hat keinen Anfang ohne Hand" });
  if (!ketteVorwaerts) befunde.push({ kind: "KETTE_RUECKWAERTS", detail: JSON.stringify(kette) });
  if (kette.priceAgeDays === null || kette.priceAgeDays > 10) {
    befunde.push({ kind: "KURS_ZU_ALT", detail: String(kette.priceAgeDays) + " Tage" });
  }
  gates.push(gate("DATA_FRESHNESS", "Zeitplan, Ablage, Materialisierung und Auslieferung greifen ohne Hand",
    befunde.length === 0,
    { stages: zeitplan, chain: kette, chainForward: ketteVorwaerts, startsOnSchedule: beginnt,
      note: "Ein Kursstand älter als zehn Tage ist für eine Public Beta kein aktueller Kurs. " +
            "STORE darf ein Hebel bleiben: der Refresh schiebt seine Ergebnisse selbst in die Ablage." },
    befunde));

  /* ---------------------------------------------------------------- 4 */
  const kurse = [];
  let ohneKurs = 0;
  for (const s of titel) {
    const e = nachTicker.get(s.ticker);
    const gezeigt = s.price && finite(s.price.value) ? s.price.value : null;
    const soll = e && finite(e.c) ? e.c : null;
    if (gezeigt === null && soll === null) { ohneKurs += 1; continue; }
    if (gezeigt === null || soll === null) {
      kurse.push({ ticker: s.ticker, kind: "EINE_SEITE_OHNE_KURS", shown: gezeigt, expected: soll });
      continue;
    }
    if (Math.abs(gezeigt - soll) > 0.005) kurse.push({ ticker: s.ticker, kind: "ABWEICHUNG", shown: gezeigt, expected: soll });
    if (e.d && s.price.asOf && e.d !== s.price.asOf) kurse.push({ ticker: s.ticker, kind: "DATUM", shown: s.price.asOf, expected: e.d });
  }
  /* Und der Kurs der Aktienseite gegen dieselbe Quelle, über eine Probe -
     die Kopfzahl ist die Zahl, an der ein Leser zuerst zweifelt. */
  const kursProbe = titel.filter((_, i) => i % 7 === 0);
  for (const s of kursProbe) {
    const e = nachTicker.get(s.ticker);
    if (!e || !finite(e.c)) continue;
    const seite = await api.getStockIntelligence(s.ticker).catch(() => null);
    const gezeigt = seite && seite.price && finite(seite.price.value) ? seite.price.value : null;
    if (gezeigt !== null && Math.abs(gezeigt - e.c) > 0.005) {
      kurse.push({ ticker: s.ticker, kind: "SEITE_ABWEICHUNG", shown: gezeigt, expected: e.c });
    }
  }
  gates.push(gate("PRICE_CONSISTENCY", "Derselbe Kurs mit demselben Stichtag auf jeder Fläche",
    kurse.length === 0,
    { titles: titel.length, pageSample: kursProbe.length, withoutPriceOnBoth: ohneKurs, deviations: kurse.length },
    kurse));

  /* ---------------------------------------------------------------- 5 */
  const WITHHELD = ["SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING"];
  const zurueck = titel.filter((s) => WITHHELD.indexOf(s.marketCapReason) >= 0);
  const bewertung = [];
  for (const s of zurueck) {
    /* Das Verzeichnis fuehrt KEINEN Boersenwert - `b` sind Faktor-Handelstage
       und `v` der Zurueckhaltungsgrund. Der erste Bau dieses Gates hat `b`
       fuer einen Boersenwert gelesen und daraus 465 Verstoesse gemeldet, von
       denen keiner existierte. Geprueft wird deshalb das Feld, das den Wert
       wirklich traegt. */
    if (s.marketCap && finite(s.marketCap.value)) bewertung.push({ ticker: s.ticker, kind: "BOERSENWERT_IN_DER_LISTE", detail: String(s.marketCap.value) });
    const w = await api.getQuantWorkspace(s.ticker).catch(() => null);
    if (!w || w.state !== "AVAILABLE") continue;
    for (const familie of w.families || []) {
      for (const m of familie.metrics || familie.components || []) {
        const id = m.id || m.key || "";
        if (Fundamentals.MARKET_CAP_DEPENDENT_PRODUCT_METRICS.indexOf(id) < 0) continue;
        if (m.value && finite(m.value.value)) {
          bewertung.push({ ticker: s.ticker, kind: "KENNZAHL_TROTZ_ZURUECKHALTUNG", detail: id + "=" + m.value.value });
        } else if (finite(m.value)) {
          bewertung.push({ ticker: s.ticker, kind: "KENNZAHL_TROTZ_ZURUECKHALTUNG", detail: id + "=" + m.value });
        }
      }
    }
  }
  gates.push(gate("VALUATION_SAFETY", "Eine zurückgehaltene Bewertung bleibt auf jeder Fläche zurückgehalten",
    bewertung.length === 0,
    { withheldTitles: zurueck.length, reasons: WITHHELD,
      metricsGuarded: Fundamentals.MARKET_CAP_DEPENDENT_PRODUCT_METRICS,
      violations: bewertung.length },
    bewertung));

  /* ---------------------------------------------------------------- 6 */
  const sprachfehler = [];
  /* Das Sprachverzeichnis regelt UNSERE Worte. Der Name eines Unternehmens
     ist keine Formulierung, die wir waehlen: "Advanced Health Intelligence"
     und "Equus Total Return, Inc." heissen so, und ein Titel unter falschem
     Namen waere der schwerere Fehler. Der erste Bau dieses Gates hat acht
     solche Namen als Sprachverstoss gemeldet - das war eine falsche Messung,
     kein Befund. Interner Code und Handlungssprache werden im Namen weiter
     geprueft: beides koennte dort nur aus unserem Code stammen. */
  const primaer = (ticker, feld, text) => {
    if (!text || typeof text !== "string") return;
    if (feld !== "name") {
      for (const wort of sprache.forbiddenInPrimaryCopy) {
        if (text.includes(wort)) sprachfehler.push({ ticker, field: feld, kind: "VERBOTENER_BEGRIFF", detail: wort, text: text.slice(0, 120) });
      }
    }
    if (CODE.test(text)) sprachfehler.push({ ticker, field: feld, kind: "INTERNER_CODE", detail: (text.match(CODE) || [])[0], text: text.slice(0, 120) });
    if (HANDLUNG.test(text)) sprachfehler.push({ ticker, field: feld, kind: "HANDLUNGSSPRACHE", detail: (text.match(HANDLUNG) || [])[0], text: text.slice(0, 120) });
  };
  for (const s of titel) primaer(s.ticker, "name", s.name);
  const schritt = Math.max(1, Math.floor(titel.length / BRIEF_SAMPLE));
  const briefProbe = titel.filter((_, i) => i % schritt === 0).slice(0, BRIEF_SAMPLE);
  let ohneBeleg = 0, mitAuskunft = 0, mitDreiGruppen = 0, methodikSichtbar = 0;
  const reduziert = [], fehlerbilder = [];
  for (const s of briefProbe) {
    const brief = await api.getIntelligenceBrief(s.ticker).catch(() => null);
    if (!brief) continue;
    if (brief.headline) { mitAuskunft += 1; primaer(s.ticker, "headline", brief.headline); }
    for (const gruppe of ["pro", "contra", "unknown"]) {
      for (const p of brief[gruppe] || []) primaer(s.ticker, gruppe, p.statement || p.text || "");
    }
    if ((brief.pro || []).length && (brief.contra || []).length && (brief.unknown || []).length) mitDreiGruppen += 1;
    const leer = typeof brief.statementsWithoutEvidence === "function" ? brief.statementsWithoutEvidence() : (brief.statementsWithoutEvidence || []);
    if (leer && leer.length) { ohneBeleg += 1; sprachfehler.push({ ticker: s.ticker, field: "evidence", kind: "AUSSAGE_OHNE_BELEG", detail: String(leer.length) }); }
    if (brief.methodologySwitch) methodikSichtbar += 1;
    /* Gate 10 in derselben Runde: ein datenarmer Titel muss REDUZIERT
       aussehen und nicht kaputt. */
    const form = brief.sources && brief.sources.shape ? brief.sources.shape : null;
    if (form && form.shape && form.shape !== "FULL") {
      reduziert.push(s.ticker);
      const saetze = [form.headline, form.sentence, form.outlook].filter(Boolean);
      if (!saetze.length) fehlerbilder.push({ ticker: s.ticker, kind: "KEIN_SATZ", detail: form.shape });
      for (const satz of saetze) if (CODE.test(satz)) fehlerbilder.push({ ticker: s.ticker, kind: "CODE_IM_SATZ", detail: (satz.match(CODE) || [])[0] });
    }
  }
  gates.push(gate("PRODUCT_LANGUAGE", "Kein interner Code, kein verbotener Begriff, keine Handlungssprache",
    sprachfehler.length === 0,
    { namesChecked: titel.length, briefSample: briefProbe.length,
      briefsWithHeadline: mitAuskunft, briefsWithAllThreeGroups: mitDreiGruppen,
      statementsWithoutEvidence: ohneBeleg,
      forbiddenTerms: sprache.forbiddenInPrimaryCopy.length,
      violations: sprachfehler.length },
    sprachfehler));

  /* ---------------------------------------------------------- 7 und 8 */
  const smoke = await lesen(SMOKE);
  const smokeGeltung = berichtGilt(smoke);
  const smokeFrisch = smokeGeltung.ok;
  for (const [id, breite, titelText] of [
    ["MOBILE_390", "390", "Mobil 390 px: kein Überlauf, eine Überschrift, Inhalt vorhanden"],
    ["DESKTOP_1440", "1440", "Desktop 1440 px: kein Überlauf, eine Überschrift, Inhalt vorhanden"]
  ]) {
    if (!smokeFrisch) {
      gates.push(gate(id, titelText, null,
        { smokeReport: SMOKE, exists: !!smoke, reportCommit: smoke ? smoke.commit : null, head: HEAD,
          validity: smokeGeltung,
          note: "Nur im Browser gegen das gebaute Release entscheidbar. Ohne passenden Smoke-Bericht kein Urteil." }));
      continue;
    }
    const w = (smoke.byWidth || {})[breite] || null;
    gates.push(gate(id, titelText, !!w && w.failures === 0 && w.overflow === 0 && w.withoutSingleH1 === 0 && w.recovered === 0,
      { width: Number(breite), ...(w || {}), views: smoke.views, release: smoke.release,
        commit: smoke.commit, validity: smokeGeltung },
      w ? (smoke.results || []).filter((r) => String(r.width) === breite && !r.ok).map((r) => ({ view: r.view, findings: r.findings })) : []));
  }

  /* ---------------------------------------------------------------- 9 */
  const frontend = await readFile(join(ROOT, "vu2/experience.js"), "utf8");
  /* Welche Ansichten es gibt, steht an ZWEI Stellen: in der Zulassungsmenge
     am Anfang von render() (die teils aus `nav` kommt, also nicht als
     Literal dort steht) und in den Zweigen darunter. Der erste Bau dieses
     Gates las nur die erste und meldete discover, research, markets und
     portfolio als unbekannt, obwohl jede einen eigenen Zweig hat. Gelesen
     werden deshalb beide. */
  const router = frontend.slice(frontend.indexOf("async function render(){"));
  const bekannt = new Set([
    ...(router.slice(0, 900).match(/'[a-z]+'/g) || []).map((x) => x.slice(1, -1)),
    ...(router.match(/view==='([a-z]+)'/g) || []).map((x) => x.slice(8, -1)),
    ...(frontend.match(/nav\s*=\s*\[[^\]]*\]/) || [""])[0].split("'").filter((x) => /^[a-z]+$/.test(x))
  ]);
  const navZiele = new Set((frontend.match(/href\('([a-z]+)'/g) || []).map((s) => s.slice(6, -1)));
  const totLinks = [];
  for (const ziel of navZiele) if (!bekannt.has(ziel)) totLinks.push({ kind: "UNBEKANNTE_ANSICHT", detail: ziel });
  const basis = RELEASE || ROOT;
  for (const pfad of new Set((frontend.match(/'\/[a-z0-9_/.-]+\/'/g) || []).map((s) => s.slice(1, -1)))) {
    const datei = join(basis, pfad.replace(/^\//, ""), "index.html");
    if (!existsSync(datei)) totLinks.push({ kind: "TOTER_PFAD", detail: pfad, checkedIn: basis === ROOT ? "REPOSITORY" : "RELEASE" });
  }
  /* Der statische Teil ist die Substanz; der Smoke liefert den Laufzeitteil
     (eine Ansicht, die in eine Wiederherstellung fällt, ist ein toter Weg).
     Ohne frischen Smoke fehlt dieser Teil - dann ist das Gate offen und
     nicht bestanden. */
  const wiederhergestellt = smokeFrisch
    ? Object.values(smoke.byWidth || {}).reduce((a, b) => a + (b.recovered || 0), 0) : null;
  const navUrteil = totLinks.length > 0 ? false
    : wiederhergestellt === null ? null
      : wiederhergestellt === 0;
  gates.push(gate("NAVIGATION", "Kein primärer Verweis führt ins Leere", navUrteil,
    { viewTargets: navZiele.size, knownViews: bekannt.size,
      absolutePathsChecked: new Set((frontend.match(/'\/[a-z0-9_/.-]+\/'/g) || [])).size,
      checkedAgainst: basis === ROOT ? "REPOSITORY" : "RELEASE",
      smokeRecovered: wiederhergestellt,
      note: basis === ROOT ? "Gegen das Repository geprüft. Ein Release liefert nur, was `git ls-files` kennt - mit --release wird gegen die Auslieferung geprüft." : null,
      deadLinks: totLinks.length },
    totLinks));

  /* --------------------------------------------------------------- 10 */
  gates.push(gate("ERROR_STATES", "Ein datenarmer Titel sieht reduziert aus, nicht kaputt",
    fehlerbilder.length === 0,
    { briefSample: briefProbe.length, reducedInSample: reduziert.length,
      violations: fehlerbilder.length,
      note: "Geprüft wird: jede reduzierte Reise trägt einen Nutzersatz, und in diesem Satz steht kein interner Code." },
    fehlerbilder));

  /* --------------------------------------------------------------- 11 */
  const methodik = [];
  for (const datei of ["quant-v1.json", "quant-v2.json", "backtest-v1.json", "product-language-v1.json"]) {
    const pfad = join(ROOT, "quant/methodology", datei);
    if (!existsSync(pfad)) { methodik.push({ kind: "FEHLT", detail: datei }); continue; }
    const doc = JSON.parse(await readFile(pfad, "utf8"));
    if (!doc.schemaVersion && !doc.methodologyVersion && !doc.version) methodik.push({ kind: "OHNE_FASSUNG", detail: datei });
  }
  if (!existsSync(join(basis, "quant/methodology/index.html"))) methodik.push({ kind: "SEITE_FEHLT", detail: "/quant/methodology/" });
  gates.push(gate("METHODOLOGY_TRANSPARENCY", "Jede Methodik ist benannt, versioniert und erreichbar",
    methodik.length === 0,
    { documents: 4, methodologySwitchVisibleInSample: methodikSichtbar,
      briefSample: briefProbe.length, violations: methodik.length }, methodik));

  /* --------------------------------------------------------------- 12 */
  const suite = await lesen(SUITE);
  const suiteGeltung = berichtGilt(suite);
  const suiteFrisch = suiteGeltung.ok;
  gates.push(gate("REGRESSION_GUARDS", "Die Suite läuft grün und deckt die Launch-Regeln ab",
    !suiteFrisch ? null : suite.fail === 0 && suite.pass > 1500,
    suiteFrisch
      ? { tests: suite.tests, pass: suite.pass, fail: suite.fail, files: suite.files || null,
          commit: suite.commit, validity: suiteGeltung }
      : { suiteReport: SUITE, exists: !!suite, reportCommit: suite ? suite.commit : null, head: HEAD,
          validity: suiteGeltung,
          note: "Ein Suite-Ergebnis von einem Stand, an dem sich seither Code oder Artefakte " +
                "geaendert haben, ist fuer dieses Gate kein Beleg." },
    suiteFrisch && suite.failures ? suite.failures : []));

  /* ------------------------------------------------------- P1: ERLEBNIS */
  /* Der Auftrag verlangt, dass ein neuer Nutzer auf der ersten Bildschirmhoehe
     sechs Dinge versteht. Fuenf davon sind Text und hier pruefbar; die sechste
     Frage - steht es WIRKLICH oben - ist eine Layoutfrage und steht im Smoke
     (`AUSKUNFT_ZU_TIEF`, `AUSKUNFT_NACH_CHART`). */
  const erlebnis = [];
  const erlebnisProbe = ["AAPL", "NVDA", "JPM", "AA", "WSBCO", "ACAA"];
  let mitAllem = 0;
  for (const ticker of erlebnisProbe) {
    const brief = await api.getIntelligenceBrief(ticker).catch(() => null);
    if (!brief) { erlebnis.push({ ticker, kind: "KEINE_AUSKUNFT" }); continue; }
    const fehlt = [];
    if (!brief.headline) fehlt.push("wieStark");
    if (!(brief.pro || []).length && !(brief.contra || []).length) fehlt.push("wasSprichtDafuerDagegen");
    if (!brief.setup) fehlt.push("gibtEsSetup");
    /* "Was aendert sich?" steht nicht in einer eigenen Quelle: die
       Auskunft traegt Veraenderungen als Punkt mit `kind === "change"` in
       dieselben zwei Spalten (so war M40 gebaut). Der erste Bau dieses
       Gates suchte `sources.change` - ein Feld, das es nie gab - und meldete
       deshalb alle sechs Titel als unbeantwortet. */
    const punkte = [...(brief.pro || []), ...(brief.contra || []), ...(brief.unknown || [])];
    if (!punkte.some((p) => p.kind === "change")) fehlt.push("wasAendertSich");
    if (fehlt.length) erlebnis.push({ ticker, kind: "UNBEANTWORTET", detail: fehlt.join(",") });
    else mitAllem += 1;
  }
  const smokeAuskunft = smokeFrisch
    ? (smoke.results || []).filter((r) => (r.findings || []).some((f) => /AUSKUNFT|KOPFSATZ|GRUPPEN|SETUPFRAGE/.test(f)))
    : null;
  gates.push(gate("RELEASE_EXPERIENCE", "P1 · Die erste Bildschirmhoehe beantwortet die Einsteigerfragen",
    smokeAuskunft === null ? null : erlebnis.length === 0 && smokeAuskunft.length === 0,
    { sample: erlebnisProbe, answeringAll: mitAllem,
      progressiveDisclosure: "Bedeutung → Erklaerung → Evidenz → Methodik",
      smokeFindings: smokeAuskunft ? smokeAuskunft.length : null,
      note: "Die Lage im Bildschirm prueft der Smoke gegen das gebaute Release; ohne ihn bleibt das offen." },
    erlebnis.concat(smokeAuskunft ? smokeAuskunft.map((r) => ({ kind: "SMOKE", detail: r.view + ": " + r.findings.join(" ") })) : [])));

  /* ------------------------------------------------------- P1: HYGIENE */
  const hygiene = [];
  const seitenQuelle = frontend + "\n" + await readFile(join(ROOT, "vu2/index.html"), "utf8");
  const verlangt = [
    ["BETA_MARKIERUNG", /Entwicklungsvorschau|Preview|Beta/],
    ["DISCLAIMER", /Keine Anlageempfehlung/],
    ["QUELLENHINWEIS", /SEC EDGAR/],
    ["ANBIETERHINWEIS", /Tiingo/],
    ["METHODIKSEITE", /\/quant\/methodology\//],
    ["AKTUALITAET", /Kursstand/]
  ];
  for (const [id, muster] of verlangt) if (!muster.test(seitenQuelle)) hygiene.push({ kind: "FEHLT", detail: id });
  /* Kein Geheimnis und keine interne Fehlersuche im ausgelieferten Skript.
     Geprueft wird das RELEASE, nicht der Quelltext - im Release liegt, was
     der Browser bekommt. */
  const gebaut = join(basis, "vu2/experience.js");
  if (existsSync(gebaut)) {
    const text = await readFile(gebaut, "utf8");
    for (const [id, muster] of [
      ["SCHLUESSEL", /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}/i],
      ["BEARER", /Bearer\s+[A-Za-z0-9._\-]{20,}/],
      ["FEHLERSUCHE", /console\.(debug|trace)\(/],
      ["PLATZHALTER", /\bTODO\b|\bFIXME\b|\bXXX\b/]
    ]) if (muster.test(text)) hygiene.push({ kind: id, detail: (text.match(muster) || [])[0].slice(0, 60) });
  } else hygiene.push({ kind: "RELEASE_NICHT_GEPRUEFT", detail: "kein gebautes Skript unter " + gebaut });
  /* Ueberwachung und ein reproduzierbarer Weg nach draussen. */
  const wacht = ["freshness-monitor.yml", "vu2-browser-qa.yml"].filter((d) => existsSync(join(ROOT, ".github/workflows", d)));
  if (!wacht.length) hygiene.push({ kind: "FEHLT", detail: "UEBERWACHUNG" });
  gates.push(gate("PUBLIC_BETA_HYGIENE", "P1 · Kennzeichnung, Quellen, Aktualitaet, keine Geheimnisse",
    hygiene.length === 0,
    { required: verlangt.map(([id]) => id), monitoring: wacht,
      releaseChecked: existsSync(gebaut) ? gebaut.replace(ROOT + "/", "") : null,
      violations: hygiene.length }, hygiene));

  /* ------------------------------------------------------------ Urteil */
  const fail = gates.filter((g) => g.status === "FAIL");
  const offen = gates.filter((g) => g.status === "NOT_MEASURED");
  const bericht = {
    schemaVersion: SCHEMA,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    commit: HEAD,
    northStar: "PUBLIC_BETA_LAUNCH_READY",
    ordering: "Korrektheit > Coverage · Vertrauen > Vollständigkeit · Launch Readiness > Feature-Tiefe",
    universe: titel.length,
    briefSample: briefProbe.length,
    PUBLIC_BETA_LAUNCH_READY: fail.length === 0 && offen.length === 0 ? "PASS" : "FAIL",
    p0Gates: 12,
    p1Checks: gates.length - 12,
    gatesTotal: gates.length,
    gatesPassed: gates.filter((g) => g.status === "PASS").length,
    gatesFailed: fail.length,
    gatesNotMeasured: offen.length,
    blocking: fail.map((g) => g.id).concat(offen.map((g) => g.id)),
    gates,
    note: "NOT_MEASURED ist kein PASS. Vier Gates sind nur im Browser gegen das gebaute " +
          "Release entscheidbar, eines nur mit einem echten Suite-Lauf; ohne diese Belege " +
          "bleibt der Launch zu."
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  process.stdout.write("\nPUBLIC BETA LAUNCH READINESS · " + SCHEMA + " · " + titel.length + " Titel\n\n");
  for (const g of gates) {
    const marke = g.status === "PASS" ? "PASS" : g.status === "FAIL" ? "FAIL" : "OFFEN";
    process.stdout.write("  " + marke.padEnd(6) + g.id.padEnd(28) + g.title + "\n");
    if (g.status !== "PASS") {
      if (g.caseCount) process.stdout.write("         " + g.caseCount + " Fälle · z. B. " + JSON.stringify(g.cases[0]) + "\n");
      else process.stdout.write("         " + (g.facts.note || JSON.stringify(g.facts).slice(0, 150)) + "\n");
    }
  }
  process.stdout.write("\n  PUBLIC_BETA_LAUNCH_READY = " + bericht.PUBLIC_BETA_LAUNCH_READY +
    " · " + bericht.gatesPassed + " PASS · " + bericht.gatesFailed + " FAIL · " + bericht.gatesNotMeasured + " offen\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();

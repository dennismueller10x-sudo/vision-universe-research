/* =========================================================================
   VISION UNIVERSE — assert-universe-quality.mjs   (§13 der Nacharbeit)

   DIE PRUEFUNGEN, DIE NUR UEBER DAS GANZE UNIVERSUM GEHEN

   market-quality.js prueft je Titel: unmoegliche OHLC, doppelte Bars,
   Zukunftsbars, Spruenge. Das ist gruendlich - und blind fuer alles, was
   erst im Vergleich vieler Titel sichtbar wird:

     zwei Titel mit derselben securityId
     zwei Zeilen mit demselben Ticker
     ein Feld, das bei 4.000 Titeln ploetzlich leer ist
     ein Titel, dessen letzte Bar drei Wochen vor allen anderen liegt
     ein Analysebuendel, das fuer einen abgerufenen Titel fehlt
     eine relative Staerke, die auf einem spaeteren Vergleichsdatum steht
       als der Titel selbst

   Jeder dieser Fehler laesst jeden einzelnen Titel sauber aussehen. Genau
   deshalb braucht es diese Ebene.

   WAS ALS BEFUND ZAEHLT

   ERROR haelt an. WARNING steht im Bericht und laesst durch - eine
   Warnung, die anhaelt, wird nach dem dritten Mal weggeschaltet, und dann
   haelt auch der Fehler nicht mehr an.

   Ausfuehren:
     node scripts/market/assert-universe-quality.mjs --gate FULL_UNIVERSE
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "FULL_UNIVERSE");
const SCALE_DIR = arg("--scale-dir", join(root, "quant", "data", "market", "scale"));
const FACTOR_DIR = arg("--factor-dir", join(root, "quant", "data", "market", "factors"));
const TECH_DIR = arg("--tech-dir", join(root, "quant", "data", "technical", "scale"));
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "health"));
/* Wie weit darf das letzte Datum eines Titels vom Feld abweichen, bevor
   es ein Befund ist? In Handelstagen. Ein delisteter oder ausgesetzter
   Titel ist kein Datenfehler - eine ganze Gruppe, die zurueckfaellt,
   sehr wohl. */
const MAX_DATE_SPREAD_DAYS = parseInt(arg("--max-date-spread", "5"), 10) || 5;
/* Ab welchem Anteil leerer Werte ist ein Feld "explodiert"? Ein Feld,
   das bei einem Titel fehlt, ist ein Einzelfall. Eines, das bei der
   Haelfte fehlt, ist ein Defekt in der Rechnung. */
const NULL_EXPLOSION_RATE = parseFloat(arg("--null-explosion-rate", "0.5")) || 0.5;

const befunde = [];
function fehler(pruefung, text, mehr) {
  befunde.push(Object.assign({ severity: "ERROR", check: pruefung, message: text }, mehr || {}));
}
function warnung(pruefung, text, mehr) {
  befunde.push(Object.assign({ severity: "WARNING", check: pruefung, message: text }, mehr || {}));
}

function lies(datei) {
  if (!existsSync(datei)) return null;
  try { return JSON.parse(readFileSync(datei, "utf8")); }
  catch (err) { return { __unlesbar: (err && err.message) || "unbekannt" }; }
}

const gate = lies(join(SCALE_DIR, `gate-${GATE}.json`));
const universum = lies(join(SCALE_DIR, `universe-${GATE}.json`));
const faktoren = lies(join(FACTOR_DIR, `factors-${GATE}-summary.json`));
const technical = lies(join(TECH_DIR, `technical-coverage-${GATE}.json`));

const geprueft = [];

/* ------------------------------------------------- 0. Ist etwas da? */

if (!gate || gate.__unlesbar) {
  fehler("gateReport", `Kein lesbarer Gate-Bericht fuer ${GATE}.` +
    (gate && gate.__unlesbar ? ` (${gate.__unlesbar})` : ""));
} else if (gate.verdict === "ASSESSED") {
  /* Eine Bewertung hat nichts geladen. Ihre Titel zu pruefen hiesse,
     ueber einen Bestand zu urteilen, den es nicht gibt. */
  console.log(`\n  ${GATE} wurde nur bewertet (verdict ASSESSED). Es gibt keinen Bestand ` +
              "zu pruefen - die Universumspruefung entfaellt.\n");
  schreibe({ status: "SKIPPED", reason: "gateAssessedOnly" });
  process.exit(0);
}

/* -------------------------------- 1. Doppelte Titel, Tickerkollision */

if (universum && !universum.__unlesbar && Array.isArray(universum.securities)) {
  geprueft.push("duplicateSecurities", "tickerCollisions");
  const nachId = new Map();
  const nachTicker = new Map();
  for (const s of universum.securities) {
    if (!nachId.has(s.securityId)) nachId.set(s.securityId, []);
    nachId.get(s.securityId).push(s.ticker);
    const t = String(s.ticker || "").toUpperCase();
    if (!nachTicker.has(t)) nachTicker.set(t, []);
    nachTicker.get(t).push(s.securityId);
  }
  const doppelteIds = [...nachId.entries()].filter(([, v]) => v.length > 1);
  if (doppelteIds.length) {
    fehler("duplicateSecurities",
      `${doppelteIds.length} securityId(s) kommen mehrfach vor. Der Bestand eines Titels ` +
      "wuerde dann von zwei Zeilen beschrieben - und die zweite ueberschriebe die erste.",
      { examples: doppelteIds.slice(0, 5).map(([id, t]) => `${id}: ${t.join(", ")}`) });
  }
  /* Zwei securityIds mit demselben Ticker sind nicht automatisch falsch
     (dieselbe Aktie an zwei Boersen), aber sie sind immer eine Frage:
     welche Reihe gewinnt im Screener? */
  const kollisionen = [...nachTicker.entries()].filter(([, v]) => v.length > 1);
  if (kollisionen.length) {
    warnung("tickerCollisions",
      `${kollisionen.length} Ticker zeigen auf mehr als eine securityId. Im Screener ` +
      "entscheidet dann die Reihenfolge, welche Reihe gewinnt.",
      { examples: kollisionen.slice(0, 5).map(([t, ids]) => `${t}: ${ids.join(", ")}`) });
  }
}

/* --------------------------- 2. Zahlen, die keine Zahlen sein duerfen */

/* JSON kennt weder NaN noch Infinity - beide werden beim Schreiben zu
   null. Im ausgelieferten Bericht ist also nicht die Zahl das Problem,
   sondern das null AN EINER STELLE, DIE SICH BERECHNET NENNT. Genau das
   ist die stille Null aus §30, und sie ist hier zu finden. */
function suchNichtZahlen(wert, pfad, treffer) {
  if (wert === null || wert === undefined) return;
  if (typeof wert === "number") {
    if (!Number.isFinite(wert)) treffer.push(`${pfad} = ${wert}`);
    return;
  }
  if (Array.isArray(wert)) {
    for (let i = 0; i < wert.length && treffer.length < 20; i++) {
      suchNichtZahlen(wert[i], `${pfad}[${i}]`, treffer);
    }
    return;
  }
  if (typeof wert === "object") {
    for (const k of Object.keys(wert)) {
      if (treffer.length >= 20) return;
      suchNichtZahlen(wert[k], pfad ? `${pfad}.${k}` : k, treffer);
    }
  }
}

geprueft.push("nonFiniteNumbers");
for (const [name, inhalt] of [["gate", gate], ["factors", faktoren], ["technical", technical]]) {
  if (!inhalt || inhalt.__unlesbar) continue;
  const treffer = [];
  suchNichtZahlen(inhalt, "", treffer);
  if (treffer.length) {
    fehler("nonFiniteNumbers", `${name}: ${treffer.length} nicht-endliche Zahl(en) im Bericht.`,
      { examples: treffer.slice(0, 5) });
  }
}

/* -------------------------------------------- 3. Explodierte Leerwerte */

if (faktoren && !faktoren.__unlesbar && faktoren.coverage && faktoren.coverage.fieldCoverage) {
  geprueft.push("nullExplosion");
  const berechnet = faktoren.coverage.computed || 0;
  const verdaechtig = [];
  for (const [feld, stand] of Object.entries(faktoren.coverage.fieldCoverage)) {
    const gesamt = Object.values(stand).reduce((a, b) => a + b, 0);
    if (!gesamt) continue;
    const fehlend = gesamt - (stand.CALCULATED || 0);
    if (fehlend / gesamt > NULL_EXPLOSION_RATE) {
      verdaechtig.push({ feld, calculated: stand.CALCULATED || 0, of: gesamt,
                         missingRate: Math.round(fehlend / gesamt * 100) / 100, breakdown: stand });
    }
  }
  if (verdaechtig.length) {
    /* Ein einzelner Titel ohne Wert ist ein Einzelfall. Ein Feld, das
       bei der Mehrheit fehlt, ist ein Defekt in der Rechnung - und er
       faellt nur auf, wenn jemand ueber alle Titel zaehlt. */
    warnung("nullExplosion",
      `${verdaechtig.length} Faktorfeld(er) fehlen bei mehr als ` +
      `${Math.round(NULL_EXPLOSION_RATE * 100)} % der ${berechnet} gerechneten Titel.`,
      { fields: verdaechtig });
  }
}

/* ------------------------------------------------- 4. Datumsausrichtung */

if (gate && !gate.__unlesbar && gate.perSymbol) {
  geprueft.push("dateAlignment");
  const abstaende = [];
  let ohneDatum = 0;
  for (const [ticker, zeile] of Object.entries(gate.perSymbol)) {
    if (zeile.status === "UNAVAILABLE") continue;
    if (zeile.staleTradingDays === undefined || zeile.staleTradingDays === null) { ohneDatum++; continue; }
    if (zeile.staleTradingDays > MAX_DATE_SPREAD_DAYS) {
      abstaende.push({ ticker, staleTradingDays: zeile.staleTradingDays });
    }
  }
  if (abstaende.length) {
    /* Einzelne zurueckliegende Titel sind normal (ausgesetzt, delistet).
       Ein grosser Anteil ist ein Abrufproblem und keine Marktlage. */
    const anteil = abstaende.length / Math.max(1, gate.accounting.resolved);
    const text = `${abstaende.length} Titel liegen mehr als ${MAX_DATE_SPREAD_DAYS} Handelstage ` +
                 `hinter dem Feld (${Math.round(anteil * 1000) / 10} % der aufgeloesten).`;
    if (anteil > 0.05) fehler("dateAlignment", text, { examples: abstaende.slice(0, 10) });
    else warnung("dateAlignment", text, { examples: abstaende.slice(0, 10) });
  }
  if (ohneDatum) {
    warnung("dateAlignment", `${ohneDatum} aufgeloeste Titel tragen keine Angabe zum Rueckstand.`);
  }
}

/* ------------------------------- 5. Analysebuendel fuer jeden Titel? */

if (gate && !gate.__unlesbar && technical && !technical.__unlesbar) {
  geprueft.push("technicalBundles");
  const abgerufen = gate.accounting.resolved || 0;
  const faecher = technical.coverage || {};
  const facherSumme = Object.values(faecher).reduce((a, b) => a + b, 0);
  /* Die eigentliche Frage: hat JEDER angeforderte Titel einen Zustand?
     Ein Titel ohne Fach ist eine stille Luecke (§30) - er sieht im
     Bericht aus, als haette es ihn nie gegeben.

     Nicht dieselbe Frage ist "wie viele wurden analysiert": `evaluated`
     zaehlt nur READY/PARTIAL/FAILED, weil ein Titel mit zu kurzer
     Historie gar nicht erst durch die Engine geht. Beide Zahlen
     duerfen auseinanderliegen - und tun es. */
  if (technical.requested && facherSumme !== technical.requested) {
    fehler("technicalBundles",
      `${technical.requested} Titel angefordert, aber ${facherSumme} in den Faechern. ` +
      "Die Differenz sind Titel ohne jeden Zustand.",
      { requested: technical.requested, buckets: faecher });
  }
  if (technical.evaluated > facherSumme) {
    fehler("technicalBundles",
      `Technical meldet ${technical.evaluated} analysierte Titel, hat aber nur ` +
      `${facherSumme} Faecher gefuellt.`);
  }
  if (abgerufen && technical.evaluated > abgerufen) {
    fehler("technicalBundles",
      `Technical hat ${technical.evaluated} Titel analysiert, das Gate aber nur ` +
      `${abgerufen} aufgeloest.`);
  }
}

/* ------------------------------ 6. Ausrichtung der relativen Staerke */

if (faktoren && !faktoren.__unlesbar && faktoren.benchmark) {
  geprueft.push("relativeStrengthAlignment");
  const b = faktoren.benchmark;
  if (!b.bars || b.bars <= 0) {
    fehler("relativeStrengthAlignment",
      "Der Vergleichsmassstab traegt keine Bars. Jede relative Staerke waere dann leer - " +
      "und ein leeres Feld sieht aus wie ein schwacher Titel.");
  }
  const rs = faktoren.coverage && faktoren.coverage.fieldCoverage &&
             faktoren.coverage.fieldCoverage.relativeStrength12M;
  if (rs) {
    const gesamt = Object.values(rs).reduce((a, b2) => a + b2, 0);
    if (gesamt && (rs.SOURCE_MISSING || 0) === gesamt) {
      fehler("relativeStrengthAlignment",
        "Kein einziger Titel hat eine relative Staerke. Der Massstab fehlt oder passt " +
        "zeitlich zu keinem Titel.");
    }
  }
}

/* -------------------------------- 7. Stimmt die Bilanz mit sich selbst? */

if (gate && !gate.__unlesbar && gate.accounting) {
  geprueft.push("accountingConsistency");
  const a = gate.accounting;
  const summe = (a.success || 0) + (a.warning || 0) + (a.fail || 0) + (a.unavailable || 0);
  if (summe !== a.requested) {
    fehler("accountingConsistency",
      `Die Faecher zaehlen ${summe} Titel, angefordert waren ${a.requested}. ` +
      "Ein Titel ist in keinem Fach oder in zweien.");
  }
  if (gate.historyCoverage && gate.historyCoverage.covered > a.resolved) {
    fehler("accountingConsistency",
      `Mehr Titel mit Historie (${gate.historyCoverage.covered}) als aufgeloeste (${a.resolved}).`);
  }
  /* Und die wichtigste Selbstauskunft: ist der Lauf ueberhaupt fertig? */
  if (gate.resumable && gate.resumable.status === "RESUMABLE") {
    warnung("runCompleteness",
      `Der Lauf ist unvollstaendig: ${gate.resumable.pending} Titel offen ` +
      `(Ursache ${gate.resumable.cause}). Die Universumspruefung urteilt ueber das, was da ist.`);
  }
}

/* --------------------------------------------------------- Ergebnis */

const fehlerZahl = befunde.filter((b) => b.severity === "ERROR").length;
const warnZahl = befunde.filter((b) => b.severity === "WARNING").length;
const status = fehlerZahl ? "FAILED" : warnZahl ? "PASSED_WITH_WARNINGS" : "PASSED";

console.log("\nVision Universe — Universumsweite Qualitaetspruefung\n");
console.log(`  Gate:        ${GATE}`);
console.log(`  Pruefungen:  ${[...new Set(geprueft)].join(", ") || "keine (nichts zu pruefen)"}`);
console.log(`  Befunde:     ${fehlerZahl} Fehler, ${warnZahl} Warnung(en)`);
for (const b of befunde) console.log(`    [${b.severity}] ${b.check}: ${b.message}`);
console.log(`\n  ERGEBNIS: ${status}\n`);

schreibe({
  status,
  gate: GATE,
  checksRun: [...new Set(geprueft)],
  errors: fehlerZahl,
  warnings: warnZahl,
  findings: befunde
});

function schreibe(inhalt) {
  mkdirSync(OUT_DIR, { recursive: true });
  const datei = join(OUT_DIR, `universe-quality-${GATE}.json`);
  writeFileSync(datei, JSON.stringify(Object.assign({
    generatedAt: new Date().toISOString(),
    note: "Pruefungen, die erst ueber viele Titel sichtbar werden. Je Titel prueft " +
          "market-quality.js; beide zusammen ergeben das Urteil.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null
    },
    thresholds: { maxDateSpreadTradingDays: MAX_DATE_SPREAD_DAYS,
                  nullExplosionRate: NULL_EXPLOSION_RATE }
  }, inhalt), null, 2) + "\n");
  console.log(`  ${datei.replace(root + "/", "")}\n`);
}

if (fehlerZahl) process.exit(1);

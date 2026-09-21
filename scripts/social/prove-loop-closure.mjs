/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/prove-loop-closure.mjs

   DER NACHWEIS, DASS DER KREISLAUF WIRKLICH ZURUECKFUEHRT

   -------------------------------------------------------------------------
   WAS HIER BEWIESEN WERDEN SOLL — UND WAS NICHT
   -------------------------------------------------------------------------

   Gruene Unit-Tests beweisen, dass Engines tun, was ihre Tests sagen.
   Sie beweisen NICHT, dass gemessene Leistung eine spaetere Entscheidung
   erreicht. Genau das ist aber die Frage: laeuft der Kreislauf zurueck,
   oder dreht er sich nur schnell vorwaerts?

   Dieses Skript ruft deshalb den ECHTEN Zyklus als Unterprozess auf —
   zweimal, gegen verschiedene Datenstaende. Eine Nachbildung des Loops
   wuerde nur beweisen, dass die Nachbildung funktioniert.

     Lauf A:  ohne Leistungsdaten          -> Entscheidung A
     dazwischen: Evidenz trifft ein
     Lauf B:  mit Leistungsdaten           -> Entscheidung B

   Geschlossen ist der Loop, wenn B sich von A unterscheidet UND der
   Unterschied auf die Evidenz zurueckfuehrbar ist.

   -------------------------------------------------------------------------
   ZWEI DURCHGAENGE, WEIL ES ZWEI FRAGEN SIND
   -------------------------------------------------------------------------

   `--evidence real`  nimmt social/data/performance.json, also die
   tatsaechlich gemessenen Zahlen des einen realen Beitrags. Damit laesst
   sich zeigen, was echte Evidenz heute bewirkt — und das ist, ehrlich
   gesagt, wenig: n=1 traegt keine Formatempfehlung. Der Loop schliesst
   sich hier ueber den Pfad "zu duenne Datenlage -> weiter erkunden",
   und das ist die RICHTIGE Schlussfolgerung aus n=1, nicht ein Mangel.

   `--evidence simulated`  legt einen Datensatz an, der breit genug ist,
   damit die Schwellen der Learning Engine ueberhaupt greifen. Damit wird
   der Ausbeutungspfad gezeigt: eine belastbare Beobachtung veraendert
   die Strategie, und die naechste Entscheidung faellt anders aus.

   Die simulierten Zahlen sind ueberall als SIMULATED gekennzeichnet und
   landen NIE in social/data. Sie beweisen den Mechanismus, nicht die
   Welt. Wer sie mit Messung verwechselt, hat das Gegenteil von dem
   getan, wofuer dieses Projekt gebaut ist (§11).

   Ausfuehren:
     node scripts/social/prove-loop-closure.mjs --evidence real
     node scripts/social/prove-loop-closure.mjs --evidence simulated
     node scripts/social/prove-loop-closure.mjs --evidence simulated --out social/data
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";


import { ausgabePfad } from "../quality/out-path.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const EvidenceRegime = require(join(ROOT, "social/engines/evidence-regime.js"));
import { eintraegeAusLeistung } from "./backfill-account-memory.mjs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const EVIDENCE = arg("--evidence", "real");
const OUT = arg("--out", null);
const NOW = arg("--now", new Date().toISOString());

/* Im Arbeitsbereich, nicht unter /tmp: der Zyklus loest seine Pfade
   gegen ROOT auf, und `path.join(ROOT, "/tmp/...")` setzt nicht zurueck,
   sondern haengt an. Derselbe Fehler hat in diesem Projekt schon einmal
   ein Artefakt verschwinden lassen. tmp/ steht in .gitignore. */
const ARBEIT_REL = join("tmp", "loop-proof-" + process.pid);
const ARBEIT = join(ROOT, ARBEIT_REL);

/**
 * Ein Zyklus.
 *
 * `nachDaten` schreibt das Ergebnis in den DATENORDNER zurueck statt in
 * einen eigenen Ausgabeordner. Genau so laeuft es in der Produktion:
 * dort ist `--out` derselbe Ordner wie `--data` (social/data), und das
 * Gedaechtnis des einen Laufs ist die Ausgangslage des naechsten.
 *
 * Ohne diesen Rueckschreibschritt bliebe die Messung in einem
 * Ausgabeordner liegen, den nie wieder jemand liest — und der zweite
 * Lauf entschiede erneut ohne Wissen.
 */
function zyklus(datenDir, marke, nachDaten) {
  const ausgabeRel = nachDaten ? datenDir : join(ARBEIT_REL, marke);
  const ausgabe = join(ROOT, ausgabeRel);
  mkdirSync(ausgabe, { recursive: true });
  execFileSync(process.execPath, [
    join(ROOT, "scripts/social/run-social-cycle.mjs"),
    "--provider", "mock", "--data", datenDir, "--out", ausgabeRel, "--now", NOW
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(readFileSync(join(ausgabe, "cycle-report.json"), "utf8"));
}

/**
 * Ein Gedaechtnis mit genug Beitraegen, damit die Schwellen greifen.
 *
 * Jeder Eintrag traegt `performanceProvenance.source = "SIMULATED"`.
 * Das ist keine Formalie: es ist der Unterschied zwischen einem Beweis
 * und einer Faelschung.
 */
function simuliertesGedaechtnis() {
  const eintraege = [];
  /* Beide Archetypen sind fuer diese Gelegenheiten ZULAESSIG — das ist
     der Punkt. Evidenz ueber ein Format, das ohnehin nicht in Frage
     kommt, koennte die Entscheidung gar nicht erreichen, und der
     Nachweis waere wertlos.

     DATA_STORY ist die Wahl, die ohne Wissen faellt (erstes
     zulaessiges, am seltensten genutzt). OPPORTUNITY_RISK laeuft in
     dieser Simulation deutlich besser. Greift der Lernpfad, muss die
     Entscheidung kippen — und genau das ist die Behauptung, die hier
     ueberprueft wird.

     HIER STAND FRUEHER EXPLAIN_THE_MOVE ALS DAS SCHWAECHERE FORMAT.
     Das war richtig, solange der Zyklus aus Kurssignalen einzelne
     Titel baute. Seit er seine Themen ueber die Content Ladder aus
     der Platte nimmt, tragen sie keinen ANLASS im Sinne der
     Strategie - eine Auswahlregel ist ein Kriterium, kein Ereignis -
     und EXPLAIN_THE_MOVE ist damit gar nicht mehr zulaessig.

     Der Nachweis lief weiter durch und verglich zwei Laeufe, die
     BEIDE DATA_STORY waehlten: die Evidenz konnte die Entscheidung
     nicht erreichen, weil das bessere Format nie zur Wahl stand.
     Damit das nicht noch einmal unbemerkt passiert, prueft dieses
     Skript jetzt nach, ob beide simulierten Formate im Lauf
     ueberhaupt zulaessig waren (`zulaessigeFormate`), und bricht
     sonst ab.

     Ob der Effekt die Signifikanzschwelle passiert, entscheidet die
     Learning Engine und nicht dieses Skript. */
  const muster = [
    ["OPPORTUNITY_RISK", [78, 82, 75, 85, 80, 79, 83, 77]],
    ["DATA_STORY", [41, 38, 45, 36, 43, 40, 39, 44]]
  ];
  let i = 0;
  for (const [archetype, werte] of muster) {
    for (const wert of werte) {
      i += 1;
      eintraege.push({
        publicationId: "sim_pub_" + i, packageId: "sim_pkg_" + i,
        publishedAt: new Date(Date.parse(NOW) - i * 86400000).toISOString(),
        platform: "instagram", topic: "Simuliertes Thema " + i, entities: [],
        archetype, visualType: "STATIC_IMAGE",
        hook: "Simulierter Hook " + i, caption: "", cta: null,
        performance: wert,
        performanceProvenance: {
          source: "SIMULATED",
          warning: "Diese Zahl wurde NICHT gemessen. Sie dient ausschliesslich dem " +
                   "Nachweis, dass der Lernpfad traegt, und darf nie als Evidenz " +
                   "ueber die Wirklichkeit zitiert werden."
        },
        lineage: { origin: "SIMULATED_BACKFILL", signalIds: [], opportunityId: null,
                   strategyVersion: "strategy_initial", decidedMode: null }
      });
    }
  }
  return eintraege;
}

function entscheidungsbild(bericht) {
  return {
    strategyVersion: bericht.learning.strategyAfter,
    strategyChanged: bericht.learning.strategyChanged,
    /* Gemessen und bewertbar getrennt. Bei n=1 ist der Unterschied der
       ganze Befund: es WURDE gemessen, die Zahl traegt nur noch keine
       Aussage. Wer beides als "0 Datenpunkte" zusammenfasst, kann
       "nichts gemessen" nicht von "zu wenig gemessen" unterscheiden. */
    evidenceState: bericht.learning.evidenceState,
    measuredPosts: bericht.learning.measuredPosts,
    dataPoints: bericht.learning.dataPoints,
    baselineSufficient: bericht.learning.baselineSufficient,
    observations: bericht.learning.observations.length,
    belastbar: bericht.learning.observations.filter((o) => o.sufficient).length,
    formatwissen: Object.keys(bericht.learning.archetypeKnowledge || {}).length,
    /* Das eigentliche Beweisstueck: welches Format wurde gewaehlt, und
       mit welcher Begruendung. */
    formate: (bericht.shadowDecisions || []).map((d) => d.archetype),
    visuals: (bericht.shadowDecisions || []).map((d) => d.visualType),
    /* Die Stunde ist eine Entscheidung wie jede andere — und die
       einzige, die fremde Bestandsbeitraege ohne Uebersetzung belegen
       koennen: Instagram meldet den Zeitstempel, die Strategie waehlt
       eine Stunde. Kein Vokabular dazwischen. */
    stunden: (bericht.shadowDecisions || []).map((d) => d.plannedHourUtc),
    zeitquelle: (bericht.shadowDecisions || []).map((d) => d.timingSource),
    zeitwissen: Object.keys((bericht.learning && bericht.learning.timingKnowledge) || {}).length,
    begruendung: (bericht.packages || []).length ? bericht.packages[0].archetype : null
  };
}

/* ------------------------------------------------------------------ Lauf */
/* -------------------------------------------------------------------------
   JEDER STAND BRAUCHT SEINE EIGENE PLATTE

   Der Zyklus nimmt seine Gelegenheiten seit der Content Ladder aus
   der Platte. Ein Stand ohne Platte hat keine Themen - und dieser
   Nachweis wuerde dann nicht die Kreislauf-Schliessung messen,
   sondern eine fehlende Datei.

   Gebaut mit dem Zeitpunkt DIESES Laufs, damit der Zyklus ihr Alter
   gegen dieselbe Uhr misst. Geschrieben wird nur in den Stand.
   ------------------------------------------------------------------------- */
function platteNach(verzeichnis) {
  execFileSync(process.execPath,
    [join(ROOT, "scripts/social/build-opportunity-slate.mjs"), "--now", NOW,
     "--out", verzeichnis], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] });
}

mkdirSync(ARBEIT, { recursive: true });

/* Lauf A: unbeschriebener Zustand. Keine Leistungsdaten, kein Gedaechtnis. */
const dirA = join(ARBEIT, "stand-a");
mkdirSync(dirA, { recursive: true });
copyFileSync(join(ROOT, "social/data/signals.json"), join(dirA, "signals.json"));
platteNach(dirA);

console.log("VISION UNIVERSE SOCIAL — Nachweis der Kreislauf-Schliessung");
console.log("Evidenz: " + EVIDENCE.toUpperCase());
console.log("");
/* -------------------------------------------------------------------------
   WARUM JEDER ZUSTAND ZWEIMAL LAEUFT

   Ein Zyklus ENTSCHEIDET in Schritt 3 und MISST in Schritt 8. Eine
   Messung, die waehrend eines Laufs eintrifft, erreicht die Entscheidung
   dieses Laufs also nicht mehr — sie wird am Ende ins Gedaechtnis
   geschrieben und wirkt beim naechsten Mal.

   Das ist kein Mangel, sondern die Zeit: eine Entscheidung kann nur
   benutzen, was bei ihr schon bekannt war. Ein Nachweis, der nur einmal
   laeuft, koennte deshalb NIE eine geaenderte Entscheidung zeigen — und
   wuerde daraus faelschlich schliessen, der Lernpfad trage nicht.

   Beide Zustaende laufen deshalb zweimal, und verglichen werden die
   jeweils ZWEITEN Laeufe. Zweimal, nicht nur B zweimal: sonst waere die
   Zahl der Laeufe ein zweiter Unterschied zwischen den Zustaenden, und
   der Nachweis haette zwei Ursachen fuer ein Ergebnis.
   ------------------------------------------------------------------- */
console.log("LAUF A — ohne Leistungsdaten (zwei Zyklen)");
zyklus(join(ARBEIT_REL, "stand-a"), "lauf-a1", true);
const berichtA = zyklus(join(ARBEIT_REL, "stand-a"), "lauf-a2");
const A = entscheidungsbild(berichtA);

/* -------------------------------------------------------------------
   WAR DAS BESSERE FORMAT UEBERHAUPT ZUR WAHL?

   Ein Nachweis, dessen simuliertes Spitzenformat fuer die Themen des
   Laufs unzulaessig ist, vergleicht zwei identische Entscheidungen und
   nennt das Ergebnis "kein Lerneffekt". Er misst dann die Vorlage,
   nicht den Lernpfad.

   Deshalb wird die Annahme hier zur Messung: beide simulierten
   Formate muessen in den zulaessigen Kandidaten von Lauf A vorkommen.
   ------------------------------------------------------------------- */
if (EVIDENCE === "simulated") {
  const zulaessigeFormate = new Set();
  for (const p of berichtA.packages || []) {
    /* Im BERICHT steht die Liste direkt am Paket - die Projektion hat
       sie aus der Entscheidung herausgezogen. Der erste Anlauf las
       hier `p.strategyDecision.archetypeCandidates`, also die Form im
       Arbeitsspeicher, und fand nichts: der Nachweis brach ab und
       meldete "zulaessig waren: keine", obwohl fuenf Formate zur Wahl
       standen. Eine Pruefung, die am falschen Feld sucht, ist eine
       Pruefung, die immer Alarm schlaegt. */
    for (const k of (p.archetypeCandidates || [])) {
      if (k && k.archetype) zulaessigeFormate.add(k.archetype);
    }
  }
  const simuliert = simuliertesGedaechtnis()
    .map((e) => e.archetype)
    .filter((a, i, alle) => alle.indexOf(a) === i);
  const fehlend = simuliert.filter((a) => !zulaessigeFormate.has(a));
  if (!zulaessigeFormate.size || fehlend.length) {
    console.error("\nDie Simulation traegt Formate, die dieser Lauf gar nicht " +
      "waehlen kann: " + (fehlend.join(", ") || "(kein Paket entstanden)") + ".");
    console.error("Zulaessig waren: " + ([...zulaessigeFormate].join(", ") || "keine") + ".");
    console.error("Ein Vergleich waere wertlos - die Evidenz koennte die " +
      "Entscheidung nicht erreichen. Der Nachweis bricht hier ab, statt " +
      "ein Ergebnis zu melden, das nichts bedeutet.");
    process.exit(2);
  }
}

/* Dazwischen: die Evidenz trifft ein. */
const dirB = join(ARBEIT, "stand-b");
mkdirSync(dirB, { recursive: true });
copyFileSync(join(ROOT, "social/data/signals.json"), join(dirB, "signals.json"));
platteNach(dirB);

let evidenzHerkunft;
if (EVIDENCE === "simulated") {
  writeFileSync(join(dirB, "content-memory.json"),
    JSON.stringify({ generatedAt: NOW, entries: simuliertesGedaechtnis() }, null, 2) + "\n");
  evidenzHerkunft = "SIMULIERT — 16 Eintraege, ausdruecklich als SIMULATED markiert";
} else {
  const perf = join(ROOT, "social/data/performance.json");
  if (!existsSync(perf)) {
    console.error("\nsocial/data/performance.json fehlt.");
    console.error("Ohne gemessene Zahlen ist mit --evidence real nichts zu beweisen.");
    console.error("Der Actions-Lauf pflegt sie ein; bis dahin: --evidence simulated.");
    process.exit(2);
  }
  copyFileSync(perf, join(dirB, "performance.json"));
  const p = JSON.parse(readFileSync(perf, "utf8"));

  /* Die gemessenen Beitraege muessen im Gedaechtnis stehen, sonst gibt es
     nichts, woran die Zahlen haften koennten.

     Gebaut werden sie von `backfill-account-memory.mjs` — derselben
     Regel, die auch den Betrieb fuellt. Sie hier ein zweites Mal
     hinzuschreiben waere die Einladung, dass Nachweis und Betrieb
     auseinanderlaufen; dann misst der Nachweis etwas, das es so nicht
     gibt. Was dort eingetragen wird und was ausdruecklich nicht, steht
     im Kopf jenes Skripts. */
  writeFileSync(join(dirB, "content-memory.json"), JSON.stringify({
    generatedAt: NOW,
    entries: eintraegeAusLeistung(p, {})
  }, null, 2) + "\n");

  evidenzHerkunft = "GEMESSEN — " + (p.measured || 0) + " Beitrag/Beitraege von Instagram";
}

console.log("\nEVIDENZ TRIFFT EIN: " + evidenzHerkunft);
console.log("\nLAUF B — mit Leistungsdaten (zwei Zyklen: messen, dann entscheiden)");
zyklus(join(ARBEIT_REL, "stand-b"), "lauf-b1", true);
const berichtB = zyklus(join(ARBEIT_REL, "stand-b"), "lauf-b2");
const B = entscheidungsbild(berichtB);

/* ---------------------------------------------------------- Der Vergleich */
console.log("\n" + "=".repeat(64));
console.log("VERGLEICH");
console.log("=".repeat(64));
const zeile = (label, a, b) => console.log(
  label.padEnd(26) + String(a).padEnd(18) + String(b) + (String(a) !== String(b) ? "   <-- anders" : ""));
zeile("Evidenzzustand", A.evidenceState, B.evidenceState);
zeile("gemessene Beitraege", A.measuredPosts, B.measuredPosts);
zeile("davon bewertbar", A.dataPoints, B.dataPoints);
zeile("Vergleichsbasis reicht", A.baselineSufficient, B.baselineSufficient);
zeile("Formatwissen", A.formatwissen, B.formatwissen);
zeile("Beobachtungen", A.observations, B.observations);
zeile("davon belastbar", A.belastbar, B.belastbar);
zeile("Strategie-Version", A.strategyVersion, B.strategyVersion);
zeile("Strategie geaendert", A.strategyChanged, B.strategyChanged);
zeile("gewaehlte Formate", A.formate.join(","), B.formate.join(","));
zeile("gewaehlte Visuals", A.visuals.join(","), B.visuals.join(","));

const unterschiede = Object.keys(A).filter((k) =>
  JSON.stringify(A[k]) !== JSON.stringify(B[k]));

/* -------------------------------------------------------------------------
   DAS URTEIL — GESTAFFELT
   -------------------------------------------------------------------------

   "Irgendetwas hat sich geaendert" ist ein zu schwaches Kriterium. Eine
   hochgezaehlte Kennzahl waere auch ein Unterschied und bewiese nichts.

   Unterschieden wird deshalb, WAS sich geaendert hat:

     CLOSED_DECISION  Die inhaltliche Entscheidung selbst ist eine andere.
                      Das ist die Behauptung der Definition of Done.

     CLOSED_STATE     Die Evidenz ist angekommen und hat den Wissensstand
                      veraendert, die Entscheidung aber (richtigerweise)
                      nicht. Bei n=1 ist genau das das korrekte Verhalten:
                      eine Formatempfehlung aus einem einzigen Beitrag
                      waere Rauschen mit Nachkommastellen.

     NOT_CLOSED       Die Evidenz hat gar nichts erreicht.

   CLOSED_STATE als CLOSED_DECISION auszugeben waere die bequemste Luege
   dieses ganzen Projekts. */
const entscheidungGeaendert =
  JSON.stringify(A.formate) !== JSON.stringify(B.formate) ||
  JSON.stringify(A.visuals) !== JSON.stringify(B.visuals) ||
  JSON.stringify(A.stunden) !== JSON.stringify(B.stunden) ||
  JSON.stringify(A.zeitquelle) !== JSON.stringify(B.zeitquelle) ||
  A.strategyVersion !== B.strategyVersion;
const zustandGeaendert = unterschiede.length > 0;

const urteil = entscheidungGeaendert ? "CLOSED_DECISION"
             : zustandGeaendert ? "CLOSED_STATE" : "NOT_CLOSED";

console.log("");
console.log("URTEIL: " + urteil);
if (urteil === "CLOSED_DECISION") {
  console.log("Die inhaltliche Entscheidung selbst ist eine andere — der Loop fuehrt");
  console.log("nachweisbar zurueck bis in die naechste Content-Entscheidung.");
  console.log("Unterschiedlich in " + unterschiede.length + " Merkmal(en): " + unterschiede.join(", ") + ".");
} else if (urteil === "CLOSED_STATE") {
  console.log("Die Evidenz ist angekommen (" + unterschiede.join(", ") + "),");
  console.log("die Entscheidung blieb gleich. Bei dieser Stichprobengroesse ist das");
  console.log("die RICHTIGE Folgerung und kein Mangel: aus " + B.measuredPosts +
              " Beitrag/Beitraegen");
  console.log("laesst sich keine Formatempfehlung ableiten. Weiter erkunden.");
} else {
  console.log("Die Evidenz hat nichts erreicht — auch den Wissensstand nicht.");
}
console.log("Signale, Code und Konfiguration waren in beiden Laeufen identisch.");

const geschlossen = urteil !== "NOT_CLOSED";

const nachweis = {
  generatedAt: NOW,
  evidence: EVIDENCE,
  evidenceOrigin: evidenzHerkunft,
  simulated: EVIDENCE === "simulated",
  runA: A, runB: B,
  differences: unterschiede,
  verdict: urteil,
  decisionChanged: entscheidungGeaendert,
  closed: geschlossen,
  note: EVIDENCE === "simulated"
    ? "Die Zahlen in Lauf B waren SIMULIERT und als solche markiert. Bewiesen ist " +
      "der Mechanismus, nicht eine Aussage ueber die Wirklichkeit."
    : "Die Zahlen in Lauf B waren gemessen. Bei n=1 ist die richtige Folgerung " +
      "'weiter erkunden' — die Schliessung zeigt sich am Evidenzzustand, nicht an " +
      "einer Formatempfehlung."
};

if (OUT) {
  const dir = ausgabePfad(ROOT, OUT);
  mkdirSync(dir, { recursive: true });
  const name = "loop-closure-" + EVIDENCE + ".json";
  writeFileSync(join(dir, name), JSON.stringify(nachweis, null, 2) + "\n");
  console.log("\nGeschrieben: " + OUT + "/" + name);
}

rmSync(ARBEIT, { recursive: true, force: true });
process.exitCode = geschlossen ? 0 : 1;

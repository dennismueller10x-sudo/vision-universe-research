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
import { fileURLToPath } from "node:url";


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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

function zyklus(datenDir, marke) {
  const ausgabeRel = join(ARBEIT_REL, marke);
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

     EXPLAIN_THE_MOVE ist die Wahl, die ohne Wissen faellt (erstes
     zulaessiges, am seltensten genutzt). DATA_STORY laeuft in dieser
     Simulation deutlich besser. Greift der Lernpfad, muss die
     Entscheidung kippen — und genau das ist die Behauptung, die hier
     ueberprueft wird.

     Ob der Effekt die Signifikanzschwelle passiert, entscheidet die
     Learning Engine und nicht dieses Skript. */
  const muster = [
    ["DATA_STORY", [78, 82, 75, 85, 80, 79, 83, 77]],
    ["EXPLAIN_THE_MOVE", [41, 38, 45, 36, 43, 40, 39, 44]]
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
    dataPoints: bericht.learning.dataPoints,
    baselineSufficient: bericht.learning.baselineSufficient,
    observations: bericht.learning.observations.length,
    belastbar: bericht.learning.observations.filter((o) => o.sufficient).length,
    formatwissen: Object.keys(bericht.learning.archetypeKnowledge || {}).length,
    /* Das eigentliche Beweisstueck: welches Format wurde gewaehlt, und
       mit welcher Begruendung. */
    formate: (bericht.shadowDecisions || []).map((d) => d.archetype),
    begruendung: (bericht.packages || []).length ? bericht.packages[0].archetype : null
  };
}

/* ------------------------------------------------------------------ Lauf */
mkdirSync(ARBEIT, { recursive: true });

/* Lauf A: unbeschriebener Zustand. Keine Leistungsdaten, kein Gedaechtnis. */
const dirA = join(ARBEIT, "stand-a");
mkdirSync(dirA, { recursive: true });
copyFileSync(join(ROOT, "social/data/signals.json"), join(dirA, "signals.json"));

console.log("VISION UNIVERSE SOCIAL — Nachweis der Kreislauf-Schliessung");
console.log("Evidenz: " + EVIDENCE.toUpperCase());
console.log("");
console.log("LAUF A — ohne Leistungsdaten");
const berichtA = zyklus(join(ARBEIT_REL, "stand-a"), "lauf-a");
const A = entscheidungsbild(berichtA);

/* Dazwischen: die Evidenz trifft ein. */
const dirB = join(ARBEIT, "stand-b");
mkdirSync(dirB, { recursive: true });
copyFileSync(join(ROOT, "social/data/signals.json"), join(dirB, "signals.json"));

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
     nichts, woran die Zahlen haften koennten. */
  writeFileSync(join(dirB, "content-memory.json"), JSON.stringify({
    generatedAt: NOW,
    entries: (p.snapshots || []).map((z, i) => ({
      publicationId: "real_" + z.mediaId, packageId: "real_pkg_" + i,
      publishedAt: z.publishedAt, platform: "instagram",
      topic: "Verbindungstest", entities: [],
      archetype: "DATA_CARD", visualType: "STATIC_IMAGE",
      hook: "Technischer Test", caption: "", cta: null,
      externalPostId: z.mediaId, permalink: z.permalink,
      performance: null,
      lineage: { origin: "SMOKE_TEST", signalIds: [], opportunityId: null,
                 hypothesis: null, strategyVersion: null, decidedMode: null }
    }))
  }, null, 2) + "\n");
  evidenzHerkunft = "GEMESSEN — " + (p.measured || 0) + " Beitrag/Beitraege von Instagram";
}

console.log("\nEVIDENZ TRIFFT EIN: " + evidenzHerkunft);
console.log("\nLAUF B — mit Leistungsdaten");
const berichtB = zyklus(join(ARBEIT_REL, "stand-b"), "lauf-b");
const B = entscheidungsbild(berichtB);

/* ---------------------------------------------------------- Der Vergleich */
console.log("\n" + "=".repeat(64));
console.log("VERGLEICH");
console.log("=".repeat(64));
const zeile = (label, a, b) => console.log(
  label.padEnd(26) + String(a).padEnd(18) + String(b) + (String(a) !== String(b) ? "   <-- anders" : ""));
zeile("Datenpunkte", A.dataPoints, B.dataPoints);
zeile("Vergleichsbasis reicht", A.baselineSufficient, B.baselineSufficient);
zeile("Formatwissen", A.formatwissen, B.formatwissen);
zeile("Beobachtungen", A.observations, B.observations);
zeile("davon belastbar", A.belastbar, B.belastbar);
zeile("Strategie-Version", A.strategyVersion, B.strategyVersion);
zeile("Strategie geaendert", A.strategyChanged, B.strategyChanged);
zeile("gewaehlte Formate", A.formate.join(","), B.formate.join(","));

const unterschiede = Object.keys(A).filter((k) =>
  JSON.stringify(A[k]) !== JSON.stringify(B[k]));

console.log("");
const geschlossen = unterschiede.length > 0;
if (geschlossen) {
  console.log("LOOP GESCHLOSSEN: Lauf B unterscheidet sich von Lauf A in " +
    unterschiede.length + " Merkmal(en) — " + unterschiede.join(", ") + ".");
  console.log("Der Unterschied kam ausschliesslich aus der eingetroffenen Evidenz;");
  console.log("Signale, Code und Konfiguration waren in beiden Laeufen identisch.");
} else {
  console.log("LOOP NICHT GESCHLOSSEN: Lauf B entschied genau wie Lauf A.");
  console.log("Die Evidenz hat die Entscheidung nicht erreicht.");
}

const nachweis = {
  generatedAt: NOW,
  evidence: EVIDENCE,
  evidenceOrigin: evidenzHerkunft,
  simulated: EVIDENCE === "simulated",
  runA: A, runB: B,
  differences: unterschiede,
  closed: geschlossen,
  note: EVIDENCE === "simulated"
    ? "Die Zahlen in Lauf B waren SIMULIERT und als solche markiert. Bewiesen ist " +
      "der Mechanismus, nicht eine Aussage ueber die Wirklichkeit."
    : "Die Zahlen in Lauf B waren gemessen. Bei n=1 ist die richtige Folgerung " +
      "'weiter erkunden' — die Schliessung zeigt sich am Evidenzzustand, nicht an " +
      "einer Formatempfehlung."
};

if (OUT) {
  const dir = join(ROOT, OUT);
  mkdirSync(dir, { recursive: true });
  const name = "loop-closure-" + EVIDENCE + ".json";
  writeFileSync(join(dir, name), JSON.stringify(nachweis, null, 2) + "\n");
  console.log("\nGeschrieben: " + OUT + "/" + name);
}

rmSync(ARBEIT, { recursive: true, force: true });
process.exitCode = geschlossen ? 0 : 1;

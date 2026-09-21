/* =========================================================================
   VISION UNIVERSE SOCIAL — DIE ANGRIFFE AUF DEN ORCHESTRATOR (AO1–AO12)

   §43/§44.

   -------------------------------------------------------------------------
   EIN ANDERER ANGREIFER ALS IM APPROVAL CENTER
   -------------------------------------------------------------------------

   Die Angriffe in workers/.../approval-adversarial.test.mjs kommen aus
   dem Netz: jemand ruft eine Adresse auf, die ihm nicht gehoert. Hier
   ist der Angreifer etwas anderes, und er ist haeufiger - eine
   KAPUTTE ODER MANIPULIERTE ZUSTANDSDATEI.

   Der Orchestrator entscheidet aus Dateien: dem Job-Register, der
   Lease, dem Zyklusbericht, der Platte. Jede dieser Dateien kann
   fehlen, halb geschrieben sein, aus einem abgestuerzten Lauf
   stammen oder eine Uhrzeit tragen, die nicht stimmt. Die Frage
   dieser Datei lautet: welche dieser Lagen macht das System
   GROSSZUEGIGER, als es sein darf?

   Grosszuegig heisst hier konkret: ein zweiter Creative Job, ein
   zweiter Lauf, ein leerer Tag, der als gerechtfertigt durchgeht,
   oder eine Lernempfehlung ohne Datenbasis.

   ALLE ZWOELF FAELLE SIND GEMESSEN. Jeder ist an der jeweiligen Engine
   ausprobiert worden, bevor er hier stand; vier davon haben beim
   ersten Versuch durchgelassen, und die Korrektur steht im Kommentar
   des betroffenen Falls.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Lease = require("../engines/run-lease.js");
const Kadenz = require("../engines/content-cadence.js");
const NoPost = require("../engines/no-post.js");
const Leiter = require("../engines/content-ladder.js");
const Frequenz = require("../engines/frequency-learning.js");
const KADENZ_CONFIG = JSON.parse(
  readFileSync(join(ROOT, "social/config/cadence.json"), "utf8"));

const JETZT = "2026-09-21T12:00:00Z";
const LAGE = { now: JETZT, candidatesToday: [], lastCandidateAt: null,
               activeApprovalQueue: 0, openCreativeJobs: 0 };

function kadenz(ueberschreiben) {
  return Kadenz.entscheide(Object.assign({}, LAGE, ueberschreiben), KADENZ_CONFIG);
}

/* =========================================================================
   ANGRIFF 1: ZWEI LAEUFE GLEICHZEITIG
   ========================================================================= */

test("AO1 · Angriff: eine Lease mit einem Zeitpunkt aus der Zukunft", () => {
  /* GEMESSEN, NICHT AUSGEDACHT. Beim ersten Versuch antwortete die
     Engine woertlich:

       "Ein anderer Lauf arbeitet seit -38015280 Minuten (fremd)."

     darfArbeiten war false, wartetBis stand auf 2099. Eine einzige
     falsche Zeile in einer Datei haette den Orchestrator fuer
     73 Jahre stillgelegt - und die Erklaerung haette danebengestanden,
     ohne dass jemand sie liest.

     Ein negatives Alter heisst nicht "arbeitet noch". */
  const r = Lease.pruefe({ runId: "fremd", takenAt: "2099-01-01T00:00:00Z" },
    { now: JETZT, runId: "jetzt" });
  assert.equal(r.darfArbeiten, true, r.erklaerung);
  assert.equal(r.unglaubwuerdig, true);
  assert.match(r.erklaerung, /Zukunft/);
});

test("AO2 · Und ein kleiner Uhrversatz sperrt trotzdem", () => {
  /* Die Gegenrichtung: waere jede negative Zahl "unglaubwuerdig",
     koennte man die Lease mit einer um Sekunden vorgestellten Uhr
     umgehen. Innerhalb der Toleranz gilt sie. */
  const gleich = new Date(Date.parse(JETZT) + 60 * 1000).toISOString();
  const r = Lease.pruefe({ runId: "fremd", takenAt: gleich },
    { now: JETZT, runId: "jetzt" });
  assert.equal(r.darfArbeiten, false, "Ein Uhrversatz von einer Minute hob die Lease auf");
  assert.equal(r.grund, Lease.GRUND.LAUF_AKTIV);
  /* Und die Zahl im Satz ist keine negative. */
  assert.ok(!/-\d/.test(r.erklaerung), "Der Satz nennt ein negatives Alter: " + r.erklaerung);
});

test("AO3 · Angriff: die Lease verlaengert ihre eigene Gueltigkeit", () => {
  /* Stuende die Ablaufdauer IN der Datei und wuerde von dort gelesen,
     koennte eine Lease sich selbst unsterblich machen. Sie kommt aus
     den Optionen des Pruefenden. */
  const r = Lease.pruefe(
    { runId: "fremd", takenAt: "2026-09-21T00:00:00Z", ablaufMinuten: 999999 },
    { now: JETZT, runId: "jetzt" });
  assert.equal(r.darfArbeiten, true,
    "Die Lease hat ihre eigene Gueltigkeit verlaengert");
});

/* =========================================================================
   ANGRIFF 2: EIN ZWEITER CREATIVE JOB
   ========================================================================= */

test("AO4 · Angriff: die Zahl offener Jobs unlesbar machen", () => {
  /* DER TEUERSTE DER ZWOELF FAELLE, und er hat beim ersten Versuch
     durchgelassen.

     `zahl(z.openCreativeJobs, 0)` machte aus jedem unbrauchbaren Wert
     eine 0, und 0 offene Jobs heisst: bau einen neuen. Die Obergrenze
     MAX_OPEN_CREATIVE_JOBS = 1 war damit genau dann aufgehoben, wenn
     niemand nachzaehlen konnte. */
  for (const wert of [null, "", "zwei", NaN]) {
    const r = kadenz({ openCreativeJobs: wert });
    assert.equal(r.darfErzeugen, false,
      "Ein Job-Stand von " + String(wert) + " liess einen neuen Job zu");
    assert.equal(r.grund, Kadenz.GRUND.CREATIVE_JOB_COUNT_UNKNOWN);
  }
});

test("AO5 · Und Null bleibt Null", () => {
  /* Die Gegenrichtung: waere jeder Wert "unbekannt", entstuende nie
     wieder ein Beitrag - ein Tor, das immer im Weg steht, ist auch
     keines. */
  assert.equal(kadenz({ openCreativeJobs: 0 }).darfErzeugen, true);
  assert.equal(Kadenz.ganzeZahlOderNull(0), 0);
  assert.equal(Kadenz.ganzeZahlOderNull(null), null);
  assert.equal(Kadenz.ganzeZahlOderNull(undefined), 0,
    "Ein Aufrufer, der diese Groesse gar nicht nennt, wird nicht angehalten");
});

test("AO6 · Angriff: das Job-Register loeschen statt es zu leeren", () => {
  /* Ein fehlendes Register heisst wirklich: keine offenen Jobs. Ein
     VORHANDENES, aber unlesbares heisst: unbekannt. Das echte Skript
     muss die beiden unterscheiden - hier wird es dazu gebracht. */
  /* Ausserhalb des Repositories (§42): ein Test, der zum Pruefen in den
     Baum schreibt, kann die Isolation nicht mehr beweisen, die er
     pruefen soll. */
  const D = mkdtempSync(join(tmpdir(), "vu-jobs-"));
  const lauf = (inhalt) => {
    rmSync(D, { recursive: true, force: true });
    mkdirSync(D, { recursive: true });
    if (inhalt !== null) writeFileSync(join(D, "creative-jobs.json"), inhalt);
    const { execFileSync } = require("node:child_process");
    return execFileSync("node", ["-e", `
      process.argv = [process.argv[0], "x", "--data", ${JSON.stringify(D)}];
      const m = await import(${JSON.stringify(join(ROOT, "scripts/social/run-orchestrator.mjs"))});
      const z = m.zustand({ now: ${JSON.stringify(JETZT)} });
      console.log(JSON.stringify(z.openCreativeJobs));
    `], { encoding: "utf8", cwd: ROOT }).trim();
  };
  try {
    assert.equal(lauf(null), "0", "Ein fehlendes Register ist nicht unbekannt");
    assert.equal(lauf("{ kein json"), "null",
      "Ein unlesbares Register wurde als 'keine offenen Jobs' gelesen");
    assert.equal(lauf(JSON.stringify(
      { jobs: [{ state: "CREATIVE_JOB_REQUESTED" }] })), "1");
  } finally {
    rmSync(D, { recursive: true, force: true });
  }
});

/* =========================================================================
   ANGRIFF 3: EIN LEERER TAG, DER SICH SELBST RECHTFERTIGT
   ========================================================================= */

test("AO7 · Angriff: 'alles gefragt' behaupten, ohne alles gefragt zu haben", () => {
  /* Auch dieser Fall hat beim ersten Versuch durchgelassen.

     `vollstaendigGesucht` las nur `nichtGefragt` - ein Feld, das der
     Suchende ueber sich selbst schreibt. Ein Bericht mit
     `nichtGefragt: []` und `fallbackDepthReached: 2` behauptete damit,
     neun Stufen geprueft zu haben, waehrend zwei liefen. Genau diese
     Behauptung macht aus NO_POST_UNEXPLAINED ein NO_POST_JUSTIFIED. */
  const gelogen = { nichtGefragt: [], fallbackDepthReached: 2,
                    familiesConsidered: ["NEWS_NOW"], familiesConsideredCount: 1,
                    gefunden: [], rejectionReasons: {} };
  assert.equal(NoPost.vollstaendigGesucht(gelogen), false,
    "Eine Selbstauskunft hat als vollstaendige Suche gegolten");

  const echt = Object.assign({}, gelogen, { fallbackDepthReached: NoPost.letzteStufe() });
  assert.equal(NoPost.vollstaendigGesucht(echt), true);
});

test("AO8 · Die Zahl der Stufen kommt aus der Leiter, nicht aus no-post.js", () => {
  /* Eine zweite Stufenzahl waere ein zweiter Begriff von "alle
     Stufen": verschiebt jemand die Leiter, muss die Pruefung
     mitgehen. */
  const hoechste = Leiter.LEITER
    .reduce((m, s) => Math.max(m, Number(s.stufe) || 0), 0);
  assert.equal(NoPost.letzteStufe(), hoechste);
  assert.equal(NoPost.vollstaendigGesucht(
    { nichtGefragt: [], fallbackDepthReached: hoechste - 1 }), false);
});

test("AO9 · Angriff: einen erfundenen Grund fuer den leeren Tag einsetzen", () => {
  const r = NoPost.beurteile({
    erzeugt: 0,
    kadenz: { darfErzeugen: false, grund: "HEUTE_KEINE_LUST" },
    leiter: null, ablehnungen: []
  });
  assert.equal(r.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
  assert.match(r.erklaerung, /erfundenen|Unbekannter Grund/);
});

test("AO10 · Angriff: ein fehlendes Marktsignal als Tagesabschluss ausgeben", () => {
  /* Vision Universe hat fuenf Content Families. Dass heute keine
     Kursbewegung traegt, beendet den Tag nicht - sonst waere die
     ganze Leiter dekorativ.

     DIESER TEST HIELT ZUERST AUS DEM FALSCHEN GRUND. Er prueffte nur
     `zulaessig === false`. Die vier NIE_ALLEIN-Gruende stehen aber gar
     nicht in GRUND, und "unbekannter Grund" ergibt ebenfalls false -
     der Test waere also auch dann gruen geblieben, wenn man NIE_ALLEIN
     ersatzlos loescht. Eine Gegenprobe hat genau das gezeigt.

     Der Unterschied ist nicht akademisch: er entscheidet, WELCHEN
     SATZ der Owner im No-Post-Nachweis liest. "Ein fehlendes
     Marktsignal verlangt, weitere Familien zu pruefen" ist eine
     Auskunft ueber das System. "Unbekannter Grund" ist eine ueber den
     Bericht. Geprueft wird deshalb der Satz. */
  for (const grund of Kadenz.NIE_ALLEIN) {
    const p = Kadenz.grundZulaessig(grund);
    assert.equal(p.zulaessig, false, grund + " durfte einen Tag beenden");
    assert.match(p.erklaerung, /breites Content/,
      grund + " wurde nur als unbekannt abgewiesen, nicht als nie-allein: " +
      p.erklaerung);
    assert.ok(!/Unbekannter Grund/.test(p.erklaerung),
      grund + " faellt durch die falsche Tuer");
  }

  /* Und die Liste ist nicht leer - eine leere Liste erfuellt jede
     Schleife darueber. */
  assert.ok(Kadenz.NIE_ALLEIN.length >= 4);
});

/* =========================================================================
   ANGRIFF 4: EINE EMPFEHLUNG OHNE DATEN
   ========================================================================= */

test("AO11 · Angriff: eine Empfehlung mit vier Beitraegen erzwingen", () => {
  /* Vier Tage mit je zwei Beitraegen sind zu wenig fuer eine Aussage
     ueber zweite Beitraege. Eine Engine, die daraus eine Empfehlung
     macht, verkauft Rauschen als Lernen. */
  const eintraege = [];
  for (let t = 1; t <= 4; t += 1) {
    eintraege.push({ publishedAt: "2026-09-0" + t + "T08:00:00Z",
      performance: 70, ordinalDesTages: 1 });
    eintraege.push({ publishedAt: "2026-09-0" + t + "T17:00:00Z",
      performance: 20, ordinalDesTages: 2 });
  }
  const z = Frequenz.zustand(eintraege, { now: JETZT });
  const zweiter = z.beobachtungen.find((x) => x.id === "zweiter-beitrag");
  assert.equal(zweiter.befund, Frequenz.BEFUND.INSUFFICIENT_SAMPLE,
    "Vier Tage haben fuer eine Assoziation gereicht");
  assert.ok(zweiter.sampleSize < Frequenz.MINDEST_STICHPROBE);
  assert.match(zweiter.nichtGesagt, /erfunden|Beides/,
    "Der Befund sagt nicht, was er NICHT sagt");
});

test("AO12 · Angriff: nicht gemessene Beitraege als Nullleistung einschleusen", () => {
  /* GEMESSEN: dieser Fehler war im Betrieb. `Number(null) === 0` machte
     aus siebzehn Beitraegen, von denen drei nie gemessen wurden, eine
     Durchschnittsleistung von 41.4 statt 50.3 - und daraus eine
     "Assoziation" von 9.3 Punkten, die es nicht gab.

     Wer die Leistungsfelder entfernt, darf das Ergebnis nicht nach
     unten ziehen koennen; er darf nur die Stichprobe verkleinern. */
  const gemessen = [];
  for (let t = 1; t <= 6; t += 1) {
    gemessen.push({ publishedAt: "2026-09-0" + t + "T08:00:00Z",
      performance: 60, ordinalDesTages: 1 });
  }
  const ohne = [7, 8, 9].map((t) => ({
    publishedAt: "2026-09-0" + t + "T08:00:00Z",
    performance: null, ordinalDesTages: 1
  }));

  const nur = Frequenz.zustand(gemessen, { now: JETZT });
  const beide = Frequenz.zustand(gemessen.concat(ohne), { now: JETZT });

  assert.equal(nur.werte.leistungErsterDesTages.value, 60);
  assert.equal(beide.werte.leistungErsterDesTages.value, 60,
    "Drei ungemessene Beitraege haben den Durchschnitt auf " +
    beide.werte.leistungErsterDesTages.value + " gezogen");
  assert.equal(beide.werte.leistungErsterDesTages.sampleSize, 6,
    "Ungemessene Beitraege zaehlen in der Stichprobe mit");
});

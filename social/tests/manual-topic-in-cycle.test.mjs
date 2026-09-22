/* =========================================================================
   VU SOCIAL — POST ZU THEMA im Zyklus (MT1–MT11)

   manual-mode.js nennt POST ZU THEMA (§30) ausdruecklich: "der Owner
   nennt das Thema STATT DER GELEGENHEITSBEWERTUNG". Bis zu diesem
   Auftrag steuerte der genannte Text trotzdem nur den Creative-Job-
   Dispatch (run-orchestrator.mjs::creativeBedarf) - DIESER Kandidat,
   der Zyklus, wertete unveraendert die normale Leiter aus. Ein realer
   Produktionslauf mit thema="Halbleiter NVDA" oeffnete deshalb einen
   Creative-Job-Request-PR, aber der Kandidat in der Warteschlange blieb
   ein anderes, laddergewaehltes Thema - "Halbleiter NVDA" erreichte den
   Owner nie.

   Der Owner kann zwei Arten von Text nennen: ein einzelnes Instrument
   ("Halbleiter NVDA", gegen das technische Bundle geprueft) oder eine
   Platten-Ueberschrift ("Staerkste Aktien im Dow Jones" - eine
   Rangliste ohne einzelnes Bundle, dafuer bereits redaktionell
   kuratiert, PR #168). themaVomOwner() prueft die Platte zuerst.

   Diese Tests fahren den echten Zyklus als Unterprozess (wie
   loop-closure.test.mjs) gegen echte Daten, die ohnehin im Repository
   liegen (das NVDA-Bundle) oder ein realer Lauf baut (die Platte) -
   keine Nachbildung, die nur sich selbst beweist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { themaDesOwners } from "../../scripts/social/run-orchestrator.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = "2026-09-22T13:00:00Z";

const ZYKLUS = readFileSync(new URL("../../scripts/social/run-social-cycle.mjs",
  import.meta.url), "utf8");

function platz(name) {
  const rel = join("tmp", "mt-" + name + "-" + process.pid);
  mkdirSync(join(ROOT, rel), { recursive: true });
  execFileSync(process.execPath, [join(ROOT, "scripts/social/build-opportunity-slate.mjs"),
    "--now", NOW, "--out", rel], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] });
  return rel;
}

function themenDerPlatte(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel, "opportunity-slate.json"), "utf8")).topics || [];
}

function zyklus(datenRel, extraArgs) {
  const args = [join(ROOT, "scripts/social/run-social-cycle.mjs"),
    "--provider", "mock", "--data", datenRel, "--out", datenRel, "--now", NOW,
    ...(extraArgs || [])];
  const aus = execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  return { aus, bericht: JSON.parse(readFileSync(join(ROOT, datenRel, "cycle-report.json"), "utf8")) };
}

/* -------------------------------------------------------------- Verdrahtung */

test("MT1 · Das Flag existiert und wird geparst", () => {
  assert.match(ZYKLUS, /const THEMA_FREITEXT = arg\("--thema-freitext", null\)/);
});

test("MT2 · Ein Owner-Thema ersetzt leiter.gefunden, nicht ergaenzt es", () => {
  assert.match(ZYKLUS, /leiter\.gefunden = \[ownerThema\.thema\]/,
    "Owner-Thema muss die Ladder-Auswahl ERSETZEN (§30: \"statt der Gelegenheitsbewertung\")");
});

test("MT3 · Ohne hinreichende Evidenz bleibt die Ladder-Auswahl unveraendert", () => {
  const block = ZYKLUS.slice(ZYKLUS.indexOf("if (THEMA_FREITEXT) {"),
    ZYKLUS.indexOf("if (THEMA_FREITEXT) {") + 700);
  assert.match(block, /ownerThema\.ok/,
    "Ohne ok:true darf leiter.gefunden nicht angefasst werden");
});

test("MT3b · Die Platte wird vor dem Instrument geprueft", () => {
  const fn = ZYKLUS.slice(ZYKLUS.indexOf("function themaVomOwner"),
    ZYKLUS.indexOf("function themaAusBundle"));
  assert.ok(fn.indexOf("titelTreffer") < fn.indexOf("symbolAus"),
    "Ein Plattentitel muss vor der Ticker-Erkennung gewonnen haben");
});

/* --------------------------------------------------- Der echte Unterprozess */

test("MT4 · POST ZU THEMA NVDA ersetzt die Leiter durch genau ein Thema", () => {
  const rel = platz("real");
  try {
    const { aus, bericht } = zyklus(rel, ["--thema-freitext", "Halbleiter NVDA"]);
    assert.match(aus, /Owner-Thema:\s+"Halbleiter NVDA" ersetzt die Gelegenheitsbewertung/);
    assert.match(aus, /Herkunft BUNDLE/);
    assert.equal(bericht.opportunities.length, 1,
      "Genau ein Thema - der Owner ersetzt die Auswahl, er erweitert sie nicht");
    assert.match(bericht.opportunities[0].topic, /^NVDA/);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT5 · Das ersetzte Thema traegt keinen internen Begriff aus AudienceFrame.INTERN_NICHT_IM_HOOK", () => {
  /* Der negative Referenzfall dieses Auftrags in neuer Form: ein
     erster Anlauf reichte die volle SCORE-Dimension durch und wurde
     [AUDIENCE_SEPARATION] verworfen ("Technical Opportunity Score" /
     "ATR" / "Trendwert" im oeffentlichen Text). Dieser Test haelt die
     Filterung als Regression fest - unabhaengig davon, ob das Paket
     am Ende auch EVIDENCE_SUFFICIENCY besteht (das ist MT9). */
  const rel = platz("jargon");
  try {
    const { aus } = zyklus(rel, ["--thema-freitext", "Halbleiter NVDA"]);
    assert.doesNotMatch(aus, /AUDIENCE_SEPARATION/,
      "Kein interner Begriff darf AUDIENCE_SEPARATION erneut ausloesen");
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT6 · Weder Plattentitel noch Instrument erkannt - die Ladder-Auswahl bleibt unveraendert", () => {
  const rel = platz("unknown");
  try {
    const { aus, bericht } = zyklus(rel, ["--thema-freitext", "irgendein Satz ohne Symbol"]);
    assert.match(aus, /Owner-Thema:\s+"irgendein Satz ohne Symbol" ohne hinreichende Evidenz/);
    assert.ok(bericht.opportunities.length > 1,
      "Ohne erkennbares Thema bleibt die normale Leiter-Auswahl in Kraft");
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT7 · Ohne --thema-freitext verhaelt sich der Zyklus wie zuvor", () => {
  const rel = platz("plain");
  try {
    const { aus, bericht } = zyklus(rel, []);
    assert.doesNotMatch(aus, /Owner-Thema:/);
    assert.ok(bericht.opportunities.length > 1);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT8 · Eine Platten-Ueberschrift ersetzt die Leiter durch genau dieses eine, bereits kuratierte Thema", () => {
  /* Eine Rangliste hat kein einzelnes technisches Bundle - der Weg
     ueber themaAusBundle() waere hier strukturell unmoeglich. Die
     Platte traegt das Thema bereits fertig (PR #168: subtitle/
     question), deshalb keine Filterung noetig wie bei MT4/MT5. */
  const rel = platz("titel");
  try {
    const themen = themenDerPlatte(rel);
    const kandidat = themen.find((t) => t.family === "RANKING" && t.title !== "Comeback?");
    assert.ok(kandidat, "Die Platte muss mindestens eine zweite RANKING-Ueberschrift tragen");

    const { aus, bericht } = zyklus(rel, ["--thema-freitext", kandidat.title]);
    assert.match(aus, /Herkunft PLATTE/);
    assert.equal(bericht.opportunities.length, 1);
    assert.equal(bericht.opportunities[0].topic, kandidat.title);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT9 · Eine Ablehnung ist kein Absturz - der Lauf schreibt trotzdem einen vollstaendigen Bericht", () => {
  /* Ein bloses Kurssymbol ohne redaktionelle Kuratierung (kein
     Discover-Row-Subtitle, keine Autoren-Einordnung) kann eine
     spaetere Qualitaetsschwelle ehrlich verfehlen - zum Beispiel
     EVIDENCE_SUFFICIENCY's Verlangen nach einer Einordnung ohne
     Entitaet und ohne Zahl (fromTopicEvidence()). Dieser Test
     verlangt nicht DASS das passiert (das haengt am Stand des realen
     Bundles und darf sich mit besserer Kuratierung aendern) - er
     verlangt nur, dass ein Verwurf sauber gemeldet wird, den Lauf
     nicht abbricht und nichts erfindet, um ihn zu vermeiden. */
  const rel = platz("honest");
  try {
    const { aus, bericht } = zyklus(rel, ["--thema-freitext", "Halbleiter NVDA"]);
    assert.equal(bericht.opportunities.length, 1);
    assert.ok(existsSync(join(ROOT, rel, "cycle-report.json")));
    const paketErzeugt = bericht.packages.length + (bericht.rejections || []).length;
    assert.ok(paketErzeugt >= 1, "Das eine Thema muss beurteilt worden sein - erzeugt oder verworfen");
    assert.doesNotMatch(aus, /Error|Traceback|undefined ist keine Funktion/);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------
   DIE ANDERE HAELFTE: run-orchestrator.mjs::themaDesOwners()

   run-social-cycle.mjs baut den Kandidaten aus einer Platten-
   Ueberschrift (MT8) - aber run-orchestrator.mjs entscheidet VORHER,
   ob der Auftrag ueberhaupt als ausfuehrbar gilt (kWirksam). Ein
   realer Produktionslauf mit thema="Staerkste Aktien im Dow Jones"
   zeigte: themaDesOwners() kannte nur Instrumente, meldete
   KEIN_INSTRUMENT_ERKANNT fuer die Ueberschrift, und kWirksam liess
   die Warteschlangensperre deshalb bestehen - VORBEREITEN wurde
   uebersprungen, obwohl run-social-cycle.mjs die Ueberschrift laengst
   verarbeiten konnte. Ohne diese Haelfte war MT8 folgenlos: der Bau-
   Weg funktionierte, aber der Auftrag erreichte ihn nie.
   ------------------------------------------------------------------- */

test("MT10 · themaDesOwners() erkennt eine Platten-Ueberschrift als ausfuehrbaren Auftrag", () => {
  const rel = platz("orch-titel");
  try {
    const themen = themenDerPlatte(rel);
    const kandidat = themen.find((t) => t.family === "RANKING" && t.title !== "Comeback?");
    assert.ok(kandidat, "Die Platte muss mindestens eine zweite RANKING-Ueberschrift tragen");

    const ergebnis = themaDesOwners(kandidat.title, ROOT, themen);
    assert.equal(ergebnis.ok, true);
    assert.equal(ergebnis.thema.herkunft, "PLATTE");
    assert.equal(ergebnis.thema.symbol, null,
      "Eine Rangliste hat kein einzelnes Instrument - kein Creative-Job-Dispatch dafuer");
    assert.equal(ergebnis.thema.topic, kandidat.title);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT11 · Ohne Platten-Treffer faellt themaDesOwners() weiter auf die Ticker-Erkennung zurueck", () => {
  /* Regression: die neue Pruefung darf den bestehenden, laengst
     produktiv genutzten Instrument-Pfad nicht verdraengen. */
  const ergebnis = themaDesOwners("Halbleiter NVDA", ROOT, []);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.thema.herkunft, "OWNER");
  assert.equal(ergebnis.thema.symbol, "NVDA");
});

test("MT11b · Weder Platte noch Instrument erkannt - ausdruecklich nicht ausfuehrbar", () => {
  const ergebnis = themaDesOwners("irgendein Satz ohne jede Bedeutung", ROOT, []);
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "KEIN_INSTRUMENT_ERKANNT");
});

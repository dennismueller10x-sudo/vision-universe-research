/* =========================================================================
   VU SOCIAL — POST ZU THEMA im Zyklus (MT1–MT8)

   manual-mode.js nennt POST ZU THEMA (§30) ausdruecklich: "der Owner
   nennt das Thema STATT DER GELEGENHEITSBEWERTUNG". Bis zu diesem
   Auftrag steuerte das genannte Symbol trotzdem nur den Creative-Job-
   Dispatch (run-orchestrator.mjs::creativeBedarf) - DIESER Kandidat,
   der Zyklus, wertete unveraendert die normale Leiter aus. Ein realer
   Produktionslauf mit thema="Halbleiter NVDA" oeffnete deshalb einen
   Creative-Job-Request-PR, aber der Kandidat in der Warteschlange blieb
   ein anderes, laddergewaehltes Thema - "Halbleiter NVDA" erreichte den
   Owner nie.

   Diese Tests fahren den echten Zyklus als Unterprozess (wie
   loop-closure.test.mjs) gegen das reale NVDA-Bundle, das ohnehin im
   Repository liegt - keine Nachbildung, die nur sich selbst beweist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

function zyklus(datenRel, extraArgs) {
  const args = [join(ROOT, "scripts/social/run-social-cycle.mjs"),
    "--provider", "mock", "--data", datenRel, "--out", datenRel, "--now", NOW,
    ...(extraArgs || [])];
  const aus = execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  return { aus, bericht: JSON.parse(readFileSync(join(ROOT, datenRel, "cycle-report.json"), "utf8")) };
}

/* -------------------------------------------------------------- Verdrahtung */

test("MT1 · Das Flag existiert und wird geparst", () => {
  assert.match(ZYKLUS, /const THEMA_SYMBOL = arg\("--thema-symbol", null\)/);
});

test("MT2 · Ein Owner-Thema ersetzt leiter.gefunden, nicht ergaenzt es", () => {
  assert.match(ZYKLUS, /leiter\.gefunden = \[ownerThema\.thema\]/,
    "Owner-Thema muss die Ladder-Auswahl ERSETZEN (§30: \"statt der Gelegenheitsbewertung\")");
});

test("MT3 · Ohne hinreichende Evidenz bleibt die Ladder-Auswahl unveraendert", () => {
  const block = ZYKLUS.slice(ZYKLUS.indexOf("if (THEMA_SYMBOL) {"),
    ZYKLUS.indexOf("if (THEMA_SYMBOL) {") + 700);
  assert.match(block, /ownerThema\.ok/,
    "Ohne ok:true darf leiter.gefunden nicht angefasst werden");
});

/* --------------------------------------------------- Der echte Unterprozess */

test("MT4 · POST ZU THEMA NVDA ersetzt die Leiter durch genau ein Thema", () => {
  const rel = platz("real");
  try {
    const { aus, bericht } = zyklus(rel, ["--thema-symbol", "NVDA"]);
    assert.match(aus, /Owner-Thema:\s+NVDA ersetzt die Gelegenheitsbewertung/);
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
     am Ende auch EVIDENCE_SUFFICIENCY besteht (das ist MT6/MT7). */
  const rel = platz("jargon");
  try {
    const { aus } = zyklus(rel, ["--thema-symbol", "NVDA"]);
    assert.doesNotMatch(aus, /AUDIENCE_SEPARATION/,
      "Kein interner Begriff darf AUDIENCE_SEPARATION erneut ausloesen");
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT6 · Ein unbekanntes Symbol faellt sicher auf die Ladder-Auswahl zurueck - nichts wird erfunden", () => {
  const rel = platz("unknown");
  try {
    const { aus, bericht } = zyklus(rel, ["--thema-symbol", "ZZZZ_KEIN_SYMBOL"]);
    assert.match(aus, /Owner-Thema:\s+ZZZZ_KEIN_SYMBOL ohne hinreichende Evidenz/);
    assert.ok(bericht.opportunities.length > 1,
      "Ohne Bundle zu ZZZZ_KEIN_SYMBOL bleibt die normale Leiter-Auswahl in Kraft");
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT7 · Ohne --thema-symbol verhaelt sich der Zyklus wie zuvor", () => {
  const rel = platz("plain");
  try {
    const { aus, bericht } = zyklus(rel, []);
    assert.doesNotMatch(aus, /Owner-Thema:/);
    assert.ok(bericht.opportunities.length > 1);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

test("MT8 · Eine Ablehnung ist kein Absturz - der Lauf schreibt trotzdem einen vollstaendigen Bericht", () => {
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
    const { aus, bericht } = zyklus(rel, ["--thema-symbol", "NVDA"]);
    assert.equal(bericht.opportunities.length, 1);
    assert.ok(existsSync(join(ROOT, rel, "cycle-report.json")));
    const paketErzeugt = bericht.packages.length + (bericht.rejections || []).length;
    assert.ok(paketErzeugt >= 1, "Das eine Thema muss beurteilt worden sein - erzeugt oder verworfen");
    assert.doesNotMatch(aus, /Error|Traceback|undefined ist keine Funktion/);
  } finally {
    rmSync(join(ROOT, rel), { recursive: true, force: true });
  }
});

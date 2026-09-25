/* =========================================================================
   HISTORISCHE EVIDENZ EINES STILS: gemessen, nicht konstant verneint.

   Im Strategie-Index stand `historicalEvidence` als Konstante
   (UNAVAILABLE / FACTOR_HISTORY_NOT_AVAILABLE). Am Tag, an dem sie
   geschrieben wurde, war sie richtig; sie waere auch dann noch dagestanden,
   wenn die Snapshot-Reihe laengst gewachsen ist, weil eine Konstante nicht
   nachsieht.

   Was zwei veroeffentlichte Snapshots hergeben, ist die Bestaendigkeit der
   Zuordnung - und ausdruecklich keine Rendite, keine Trefferquote und kein
   Backtest. Genau diese Grenze halten die Tests hier fest.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const StrategyMatch = require("../engines/strategy-match.js");
const ROOT = new URL("../../", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("quant/methodology/strategy-profiles-v1.json", ROOT), "utf8"));
const index = JSON.parse(gunzipSync(readFileSync(new URL("quant/data/product/strategy-index-v1.json.gz", ROOT))).toString("utf8"));

/* Eine Zeile, die das Momentum-Profil erfuellt oder eben nicht. Die
   Schwellen stehen im Vertrag; hier werden sie nicht abgeschrieben, sondern
   durch klare Extreme ueber- oder unterschritten. */
function row(ticker, value) {
  const out = { ticker };
  for (const profile of contract.profiles) {
    for (const condition of profile.conditions) out[condition.field] = value;
  }
  return out;
}

test("the published index measures its history instead of denying it by constant", () => {
  const hist = index.historicalEvidence;
  assert.ok(hist, "der Index fuehrt kein Feld historicalEvidence");
  assert.ok(["AVAILABLE", "PENDING_HISTORY", "UNAVAILABLE"].includes(hist.state));
  if (hist.state === "PENDING_HISTORY") {
    /* Der Abstand gehoert dazu. Ein "noch nicht" ohne Zahl ist eine
       Vertroestung, keine Auskunft. */
    assert.equal(hist.reason, "FACTOR_HISTORY_TOO_SHORT");
    assert.equal(typeof hist.published, "number");
    assert.equal(hist.required, 2);
    assert.equal(hist.missing, hist.required - hist.published);
    assert.ok(Array.isArray(hist.publishedDates));
    assert.equal(hist.publishedDates.length, hist.published);
    /* Und die Version, damit niemand zwei Methodikversionen zusammenzaehlt. */
    assert.match(hist.methodologyVersion, /^vu-factor-evidence-/);
  }
  if (hist.state === "AVAILABLE") {
    assert.equal(hist.kind, "ASSIGNMENT_PERSISTENCE");
    assert.deepEqual(hist.isNot, ["RETURN", "HIT_RATE", "BACKTEST", "PROBABILITY"]);
    assert.ok(hist.from < hist.to);
  }
});

test("persistence counts what stayed, and does not count what left the universe", () => {
  /* Drei Titel erfuellen alles, einer davon faellt im jetzigen Bestand weg,
     einer erfuellt es nicht mehr. Die Quote darf den Weggefallenen nicht
     als Abgang zaehlen - er wurde nicht gemessen. */
  const previous = [row("BLEIBT", 99), row("KIPPT", 99), row("WEG", 99)];
  const current = [row("BLEIBT", 99), row("KIPPT", 1)];
  const persistence = StrategyMatch.assignmentPersistence(contract, previous, current);
  const momentum = persistence.find((entry) => entry.profileId === "momentum-leader");
  assert.equal(momentum.previousMembers, 3);
  assert.equal(momentum.notInCurrentUniverse, 1);
  assert.equal(momentum.comparable, 2);
  assert.equal(momentum.stillMatching, 1);
  assert.equal(momentum.persistence, 0.5);
});

test("a profile nobody matched before has no persistence, and does not get a zero", () => {
  /* Null von null ist nicht null Prozent. Eine Quote ohne Grundmenge waere
     eine erfundene Zahl. */
  const persistence = StrategyMatch.assignmentPersistence(contract, [row("A", 1)], [row("A", 1)]);
  for (const entry of persistence) {
    if (entry.comparable === 0) assert.equal(entry.persistence, null);
  }
});

test("the same predicate decides membership then and now", () => {
  /* Der Punkt, an dem eine zweite Formulierung sich raechen wuerde: die
     Bestaendigkeit muss mit demselben Praedikat gerechnet werden wie die
     Zuordnung. Hier geprueft, indem dieselbe Zeile beide Seiten bildet -
     dann muss jede Quote genau 1 sein. */
  const rows = [row("A", 99), row("B", 99)];
  for (const entry of StrategyMatch.assignmentPersistence(contract, rows, rows)) {
    if (entry.comparable) assert.equal(entry.persistence, 1);
  }
});

test("the builder reads the snapshot index and refuses to mix methodology versions", () => {
  const source = readFileSync(new URL("scripts/quant/build-strategy-index.mjs", ROOT), "utf8");
  assert.match(source, /factor-evidence-history/);
  assert.match(source, /FACTOR_HISTORY_VERSION_MISMATCH/);
  assert.match(source, /StrategyMatch\.assignmentPersistence\(contract, altRows, currentRows\)/);
  /* Die andere Haelfte derselben Rechnung - die Namen zur Quote - kommt aus
     derselben Engine und nicht aus einer zweiten Formulierung. */
  assert.match(source, /StrategyMatch\.assignmentTransitions\(contract, altRows, currentRows\)/);
  /* Die Konstante ist weg, nicht danebengestellt. */
  assert.equal(/historicalEvidence: \{ state: "UNAVAILABLE", reason: "FACTOR_HISTORY_NOT_AVAILABLE" \}/.test(source), false);
});

test("the profile contract names the evidence version it is actually read against", () => {
  /* Der Befund vom 25.09.2026: der Vertrag deklarierte
     vu-factor-evidence-1.0.0, gerechnet wurde gegen 2.0.0, und die
     Aktienseite schrieb dem Leser die 1.0.0 hin. Nichts verglich die
     beiden Angaben, deshalb fiel es nicht auf. */
  const screening = JSON.parse(gunzipSync(readFileSync(
    new URL("quant/data/product/factor-evidence-v1/screening.json.gz", ROOT))).toString("utf8"));
  assert.equal(contract.evidenceMethodologyVersion, screening.methodologyVersion);
  assert.equal(index.evidenceMethodologyVersion, screening.methodologyVersion);
  assert.equal(StrategyMatch.METHODOLOGY_VERSION, contract.methodologyVersion);
  /* Und die Aenderung ist versioniert, nicht still: die Fassung nennt, was
     sich geaendert hat, was NICHT, und wo die gemessene Wirkung steht. */
  const entry = (contract.versionHistory || []).find((v) => v.version === contract.methodologyVersion);
  assert.ok(entry, "die aktuelle Fassung steht nicht in der Versionshistorie");
  assert.match(entry.changed, /Nur die gelesene Evidenzversion/);
  assert.match(entry.measuredImpact, /methodology-change-v1\.json#STRATEGY_IMPACT/);
  /* Der Nachweis existiert auch wirklich. */
  const change = JSON.parse(readFileSync(new URL("quant/data/product/methodology-change-v1.json", ROOT), "utf8"));
  for (const profile of contract.profiles) {
    if (profile.profileId === "earnings-revision-leader") continue;   /* faellt fail-closed aus */
    assert.ok(change.STRATEGY_IMPACT[profile.profileId],
      profile.profileId + " hat keine gemessene Wirkung");
  }
});

test("the builder refuses to publish a version claim it cannot back", () => {
  const source = readFileSync(new URL("scripts/quant/build-strategy-index.mjs", ROOT), "utf8");
  assert.match(source, /EVIDENCE_METHODOLOGY_VERSION_MISMATCH/);
  assert.match(source, /contract\.evidenceMethodologyVersion !== screening\.methodologyVersion/);
  /* Abbruch, nicht Warnung: ein veroeffentlichter Index mit falscher
     Versionsangabe ist schlimmer als keiner. */
  assert.match(source, /throw new Error\("EVIDENCE_METHODOLOGY_VERSION_MISMATCH/);
});

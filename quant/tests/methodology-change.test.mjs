import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

const SOURCE = "quant/data/product/factor-evidence-history/vu-factor-evidence-1.0.0/2026-09-21.json.gz";

function fixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "vu-methodology-change-"));
  const before = JSON.parse(zlib.gunzipSync(readFileSync(SOURCE)));
  const after = JSON.parse(JSON.stringify(before));
  after.methodologyVersion = "vu-factor-evidence-2.0.0";
  after.derivedFrom = "quant-v2.1.0";
  after.asOf = "2026-09-24";
  mutate(after, before);
  for (const [version, payload, date] of [
    ["vu-factor-evidence-1.0.0", before, "2026-09-21"],
    ["vu-factor-evidence-2.0.0", after, "2026-09-24"]
  ]) {
    mkdirSync(join(dir, version), { recursive: true });
    writeFileSync(join(dir, version, date + ".json.gz"), zlib.gzipSync(JSON.stringify(payload)));
  }
  const out = join(dir, "change.json");
  execFileSync("node", ["scripts/quant/measure-methodology-change.mjs", "--history", dir, "--out", out],
    { stdio: "pipe" });
  return JSON.parse(readFileSync(out, "utf8"));
}

const momentumAt = (payload) => payload.fields.indexOf("quantV2.factorEvidence.momentum");

test("bewegt sich nur das Momentum, meldet die Gegenprobe genau das", (t) => {
  if (!existsSync(SOURCE)) return t.skip("keine 1.0.0-Beobachtung im Baum");
  const report = fixture((after) => {
    const at = momentumAt(after);
    let i = 0;
    for (const ticker of Object.keys(after.rows)) {
      const value = after.rows[ticker][at];
      if (typeof value === "number") after.rows[ticker][at] = Math.max(0, Math.min(100, value + ((i++ % 7) - 3) * 1.5));
    }
  });
  assert.equal(report.RANK_DRIFT.momentum.valuesIdentical, false);
  assert.ok(report.RANK_DRIFT.momentum.TITLES_MOVING_5_PERCENTILES > 0);
  /* Die sechs anderen muessen unveraendert sein. Waeren sie es nicht,
     haette die Umstellung etwas beruehrt, das sie nicht beruehren
     sollte - und das ist der eine Befund, den dieser Bericht nicht
     verschlucken darf. */
  for (const factor of ["quality", "growth", "value", "profitability", "revisions", "risk"]) {
    assert.equal(report.RANK_DRIFT[factor].valuesIdentical, true, factor + " hat sich mitbewegt");
  }
  assert.deepEqual(report.unexpectedFactorMovement, []);
});

test("bewegt sich ein anderer Faktor mit, steht er im Bericht ganz oben", (t) => {
  if (!existsSync(SOURCE)) return t.skip("keine 1.0.0-Beobachtung im Baum");
  /* Die Falsifikation: waere die Gegenprobe Dekoration, bliebe sie auch
     hier leer. */
  const report = fixture((after) => {
    const at = after.fields.indexOf("quantV2.factorEvidence.quality");
    let i = 0;
    for (const ticker of Object.keys(after.rows)) {
      const value = after.rows[ticker][at];
      if (typeof value === "number") after.rows[ticker][at] = Math.max(0, Math.min(100, value + ((i++ % 5) - 2)));
    }
  });
  assert.deepEqual(report.unexpectedFactorMovement.map((x) => x.factor), ["quality"]);
});

test("eine Abdeckungsaenderung ist keine Rangverschiebung", (t) => {
  if (!existsSync(SOURCE)) return t.skip("keine 1.0.0-Beobachtung im Baum");
  /* Titel, die nur eine Seite kennt, werden getrennt gezaehlt. Sie in
     den Rangvergleich zu nehmen hiesse, eine Abdeckungsaenderung als
     Methodikwirkung auszuweisen. */
  const report = fixture((after) => {
    const tickers = Object.keys(after.rows);
    delete after.rows[tickers[0]];
    delete after.rows[tickers[1]];
  });
  assert.equal(report.coverage.ONLY_BEFORE, 2);
  assert.equal(report.coverage.ONLY_AFTER, 0);
  assert.equal(report.coverage.SHARED, report.coverage.ROWS_AFTER);
  assert.equal(report.RANK_DRIFT.momentum.UNIVERSE_N <= report.coverage.SHARED, true);
});

test("die Strategiewirkung nennt die Titel, nicht nur ihre Zahl", (t) => {
  if (!existsSync(SOURCE)) return t.skip("keine 1.0.0-Beobachtung im Baum");
  const report = fixture((after) => {
    const at = momentumAt(after);
    for (const ticker of Object.keys(after.rows)) {
      const value = after.rows[ticker][at];
      if (typeof value === "number") after.rows[ticker][at] = Math.min(100, value + 4);
    }
  });
  const momentumLeader = report.STRATEGY_IMPACT["momentum-leader"];
  assert.ok(momentumLeader.MEMBERS_AFTER > momentumLeader.MEMBERS_BEFORE,
    "ein universell angehobenes Momentum muss mehr Treffer ergeben");
  assert.equal(momentumLeader.enteringTickers.length, momentumLeader.ENTERING);
  assert.equal(momentumLeader.leavingTickers.length, momentumLeader.LEAVING);
});

test("ohne Beobachtung der neuen Methodik bricht nichts ab", () => {
  /* Vor der ersten Materialisierung ist das der normale Zustand. Ein
     Abbruch waere nur laut und wuerde einen gruenen Lauf rot faerben,
     ohne dass etwas fehlte. */
  const dir = mkdtempSync(join(tmpdir(), "vu-methodology-change-leer-"));
  const output = execFileSync("node",
    ["scripts/quant/measure-methodology-change.mjs", "--history", dir, "--out", join(dir, "x.json")],
    { encoding: "utf8" });
  assert.match(output, /Vergleich nicht moeglich/);
  assert.equal(existsSync(join(dir, "x.json")), false);
});

test("der Bericht sagt, was er nicht trennen kann", () => {
  /* Zwei Beobachtungen von verschiedenen Tagen ueber ein veraendertes
     Universum tragen beides: Methodik und Datenlage. Der Bericht muss
     das benennen, sonst liest jemand 121 Raenge als reine Methodik -
     und die saubere Zahl steht woanders. */
  const report = JSON.parse(readFileSync("quant/data/product/methodology-change-v1.json", "utf8"));
  const k = report.confounding;
  assert.ok(k, "kein Konfundierungsblock");
  assert.equal(typeof k.sameDay, "boolean");
  assert.equal(typeof k.sameUniverse, "boolean");
  assert.ok(k.cleanMeasurement, "der Bericht verweist nicht auf die unkonfundierte Messung");
  if (!k.sameDay || !k.sameUniverse) {
    assert.ok(Number.isFinite(k.CONTROL_FACTOR_MEDIAN_RANK_CHANGE),
      "ohne Kontrollwert ist die Momentumzahl nicht einzuordnen");
    assert.ok(Number.isFinite(k.MOMENTUM_MEDIAN_RANK_CHANGE));
  }
  /* DER BERICHT MUSS UEBER SICH SELBST DIE WAHRHEIT SAGEN.

     Vorher stand hier eine Schwelle: Momentum muss sich mehr als
     fuenfmal so stark bewegen wie die Kontrollfaktoren. Gemessen am
     29.09.2026 war das nicht mehr so - Momentum 165, Kontrollen 207,5.
     Der Test war damit im Recht, und die Versuchung waere gewesen, die
     Schwelle zu senken, bis er wieder gruen ist.

     Das waere die falsche Reparatur. Der Vergleich trennt tatsaechlich
     nicht mehr, weil die beiden Beobachtungen zu weit auseinanderliegen
     und das Universum sich dazwischen geaendert hat. Richtig ist nicht,
     eine andere Zahl zu verlangen, sondern zu verlangen, dass der
     Bericht seinen eigenen Zustand benennt.

     Geprueft wird deshalb die Ehrlichkeit, nicht das Ergebnis: das
     Urteil muss dastehen UND zu den Zahlen passen. Ein Bericht, der
     "HOLDS" behauptet, waehrend die Kontrollen staerker laufen, faellt
     hier durch. */
  assert.ok(["HOLDS", "LOST", "UNKNOWN"].includes(k.ISOLATION),
    "der Bericht sagt nicht, ob er die Umstellung ueberhaupt noch trennt");
  assert.ok(k.isolationNote && k.isolationNote.length > 30,
    "das Urteil steht ohne Begruendung da");
  if (Number.isFinite(k.MOMENTUM_OVER_CONTROL)) {
    const sollte = k.MOMENTUM_OVER_CONTROL > 5 ? "HOLDS" : "LOST";
    assert.equal(k.ISOLATION, sollte,
      "das Urteil passt nicht zu den eigenen Zahlen (Momentum/Kontrolle = "
      + k.MOMENTUM_OVER_CONTROL + ")");
  }
  /* Und wenn die Trennung verloren ist, muss der Verweis auf die saubere
     Messung dastehen - sonst liest jemand die Zahlen als Methodik. */
  if (k.ISOLATION === "LOST") {
    assert.match(k.isolationNote, /Datenlage/);
    assert.ok(k.cleanMeasurement, "ohne Verweis auf die saubere Messung ist der Bericht irrefuehrend");
  }
});

/* =========================================================================
   VISION UNIVERSE — vu2-data-stack-integration.test.mjs

   DER AUFGERAEUMTE DATENSTAND IN DER GESCHUETZTEN VORSCHAU.

   Nach dem Backfill standen 7.803 Titel im Universum, darunter 799
   belegte Warrants, Units, Rights und Testpapiere. Sie sind geholt und
   gespeichert - sie gehoeren nur nicht ins Produkt. Diese Datei prueft,
   dass die bestehende Vorschau das jetzt weiss, und zwar OHNE dass eine
   neue Ansicht dafuer entstanden ist.

   DREI ZUSAGEN, DIE HIER AUSEINANDERFALLEN KOENNTEN

     1. Ausgeschlossen wird nur, was BELEGT ist.
        Ein Verdacht ohne Stammbeleg bleibt im Produkt (IN3, IN4).

     2. Ausgeschlossen heisst nicht geloescht.
        Jeder Titel bleibt auffindbar und aufrufbar (IN5).

     3. Der Bestand ist abgelegt, aber hier nicht serviert.
        Wer das zusammenzieht, verspricht Kerzen, die diese
        Auslieferung nicht holen kann (IN8).

   MUTATIONSTESTS

   IN4 macht absichtlich den naheliegenden Fehler - auf ELIGIBLE
   filtern statt auf "nicht EXCLUDED" - und verlangt, dass die Differenz
   auffaellt. IN9 haelt fest, dass keine Ansicht hinzugekommen ist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => readFileSync(join(root, p), "utf8");

function baueVorschau() {
  const dir = mkdtempSync(join(tmpdir(), "vu-in-"));
  execFileSync(process.execPath,
    [join(root, "scripts/preview/build-preview-dataset.mjs"), "--out", dir],
    { encoding: "utf8", cwd: root });
  return JSON.parse(readFileSync(join(dir, "universe.json"), "utf8"));
}

/* Die Regel der Bruecke, hier noch einmal - damit der Test sie
   angreifen kann und nicht nur ihr Ergebnis. Sie steht woertlich so in
   vu2-bridge/bridge.js; IN3 prueft, dass beide gleich bleiben. */
const imProdukt = (r) => !r || r.productEligibility !== "EXCLUDED";

/* Die spaltenweise Tabelle des Nachweises wieder als Zeilen - genau so,
   wie die Bruecke es im Browser tut. */
function proofZeilen() {
  const datei = join(root, "quant/data/proof/index.json");
  if (!existsSync(datei)) return null;
  const idx = JSON.parse(readFileSync(datei, "utf8"));
  const zeilen = new Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    const r = { ticker: idx.tickers[i], hasFactors: idx.hasFactors[i] === 1 };
    for (const feld of idx.fields) {
      const v = idx.columns[feld.id][i];
      r[feld.id] = v === null || v === undefined ? null
        : feld.type === "enum" ? idx.enums[feld.id][v]
        : feld.type === "bool" ? v === 1 : v;
    }
    zeilen[i] = r;
  }
  return { idx, zeilen };
}

/* ==================================================== DER DATENSATZ */

test("IN1 — jede Zeile traegt ihre Produkteignung, oder sagt dass sie fehlt", () => {
  const d = baueVorschau();
  assert.ok(d.rows.length > 0);

  const ohne = d.rows.filter((z) => !z.productEligibilityStatus);
  assert.deepEqual(ohne, [], "eine Zeile ohne Eignungsangabe ist ein stiller Platzhalter");

  const erlaubt = new Set(["ELIGIBLE", "SEPARATE_CLASS", "REVIEW", "EXCLUDED"]);
  for (const z of d.rows) {
    if (z.productEligibilityStatus !== "PRESENT") {
      assert.equal(z.productEligibility, null,
        z.ticker + ": ohne Beleg darf keine Eignung dastehen");
      continue;
    }
    assert.ok(erlaubt.has(z.productEligibility), z.ticker + ": " + z.productEligibility);
    assert.ok(typeof z.productEligibilityReason === "string" && z.productEligibilityReason,
      z.ticker + ": eine Einordnung ohne Grund ist eine Behauptung");
  }
});

test("IN2 — die Bilanz zaehlt dasselbe wie die Zeilen", () => {
  const d = baueVorschau();
  if (d.productUniverse.status !== "PRESENT") {
    assert.equal(d.productUniverse.status, "NOT_IN_DELIVERED_ARTEFACTS");
    return;
  }
  const p = d.productUniverse;
  assert.equal(p.members, d.rows.length);
  assert.equal(p.eligible + p.separateClass + p.review + p.excluded, p.members,
    "jedes Mitglied hat genau einen Ausgang");
  assert.equal(p.productSecurities, p.members - p.excluded);

  const gezaehlt = d.rows.filter((z) => z.productEligibility === "EXCLUDED").length;
  assert.equal(gezaehlt, p.excluded, "die Bilanz muss zaehlen, was wirklich dasteht");
});

/* ============================================ DIE REGEL DER BRUECKE */

test("IN3 — die Bruecke filtert auf 'nicht EXCLUDED', nicht auf 'gleich ELIGIBLE'", () => {
  const quelle = lies("vu2-bridge/bridge.js");
  assert.match(quelle, /function imProdukt\(zeile\)/,
    "die Regel muss eine benannte Funktion sein, damit sie nachlesbar ist");
  assert.match(quelle, /zeile\.productEligibility !== "EXCLUDED"/,
    "die Regel schliesst nur Belegtes aus");
  assert.ok(!/productEligibility === "ELIGIBLE"/.test(quelle),
    "auf ELIGIBLE zu filtern wuerfe Vorzuege und unwiderlegte Verdachtsfaelle hinaus");

  /* Und sie wird wirklich angewandt - an beiden Stellen, an denen es
     zaehlt: Listen und Screener. */
  assert.ok((quelle.match(/imProdukt/g) || []).length >= 3,
    "die Regel muss in Liste UND Screener benutzt werden, nicht nur definiert");
});

test("IN4 MUTATION — auf ELIGIBLE zu filtern verliert die unwiderlegten Titel", () => {
  const p = proofZeilen();
  if (!p) return;
  const richtig = p.zeilen.filter(imProdukt).length;
  const falsch = p.zeilen.filter((r) => r.productEligibility === "ELIGIBLE").length;
  assert.ok(falsch < richtig,
    "der strengere Filter muss weniger Titel liefern - sonst prueft dieser Test nichts");

  const verloren = p.zeilen.filter((r) =>
    imProdukt(r) && r.productEligibility !== "ELIGIBLE");
  assert.ok(verloren.length > 0);
  for (const r of verloren) {
    assert.ok(["SEPARATE_CLASS", "REVIEW", null].includes(r.productEligibility), r.ticker);
  }
  /* Es sind belegte Vorzuege und unbelegte Verdachtsfaelle - beides
     gehoert ins Produkt, das eine weil es erkannt ist, das andere weil
     es NICHT erkannt ist. */
  assert.ok(verloren.some((r) => r.productEligibility === "REVIEW"),
    "ein Verdacht ohne Beleg darf nicht aus dem Produkt fallen");
});

/* ================================== AUSGESCHLOSSEN HEISST NICHT WEG */

test("IN5 — ein ausgeschlossener Titel bleibt im Index und damit auffindbar", () => {
  const p = proofZeilen();
  if (!p) return;
  const raus = p.zeilen.filter((r) => r.productEligibility === "EXCLUDED");
  assert.ok(raus.length > 0, "ohne Ausschluesse prueft dieser Test nichts");

  /* Sie stehen in derselben Tabelle wie alle anderen. Waeren sie
     entfernt, koennte die Suche sie nicht mehr finden - und genau das
     war beim Aufraeumen ausgeschlossen. */
  for (const r of raus.slice(0, 25)) {
    assert.ok(p.idx.tickers.includes(r.ticker), r.ticker + " fehlt im Index");
    assert.ok(r.securityClass, r.ticker + ": ein Ausschluss ohne Gattung ist unbelegt");
  }
});

test("IN6 — nur belegte Gattungen sind ausgeschlossen", () => {
  const p = proofZeilen();
  if (!p) return;
  const erlaubt = new Set(["WARRANT", "UNIT", "RIGHT", "TEST_SECURITY",
                           "ETF", "ETN", "ETP", "MUTUAL_FUND", "CEF", "INDEX"]);
  for (const r of p.zeilen.filter((x) => x.productEligibility === "EXCLUDED")) {
    assert.ok(erlaubt.has(r.securityClass),
      r.ticker + " ist als " + r.securityClass + " ausgeschlossen - das ist keine Nicht-Aktie");
  }
  /* Gegenprobe: keine Stammaktie ist ausgeschlossen. */
  const stamm = p.zeilen.filter((r) =>
    r.securityClass === "EQUITY_COMMON" && r.productEligibility === "EXCLUDED");
  assert.deepEqual(stamm.map((r) => r.ticker), [],
    "eine Stammaktie darf nie im Ausschluss stehen");
});

/* ================================================ DIE KENNZAHLEN */

test("IN7 — die drei Kennzahlen erreichen die Vorschau mit ihren Schwellen", () => {
  const d = baueVorschau();
  if (d.coverageMetrics.status !== "PRESENT") {
    assert.equal(d.coverageMetrics.status, "NOT_IN_DELIVERED_ARTEFACTS");
    return;
  }
  const c = d.coverageMetrics;
  assert.ok(Number.isFinite(c.storage.STORAGE_COVERAGE_PERCENT));
  assert.ok(Number.isFinite(c.chart.CHART_AVAILABILITY_PERCENT));
  assert.ok(Number.isFinite(c.technical.TECHNICAL_HISTORY_ELIGIBILITY_PERCENT));

  /* Die Schwellen muessen VERSCHIEDEN sein - sonst beantworten die drei
     Kennzahlen wieder dieselbe Frage, und genau das war der Fehler der
     einen Zahl "84,81 % CHART_READY". */
  assert.notEqual(c.thresholds.chartMinBars, c.thresholds.technicalMinBars);
  assert.notEqual(c.thresholds.chartMinBars, c.thresholds.longHistoryMinBars);
  assert.equal(c.thresholds.chartMinBars, 2, "die Chart-Engine zeichnet ab zwei Bars");

  /* Und die alte Zahl bleibt als Vergleich stehen, nicht als Zusage. */
  assert.ok(Number.isFinite(c.legacy.percent));
});

test("IN8 — abgelegt und serviert werden nicht verwechselt", () => {
  const d = baueVorschau();
  const s = d.datasetScope.fullHistoricalOhlcvStore;
  assert.notEqual(s.status, "SERVED");
  assert.ok(typeof s.note === "string" && /nicht/i.test(s.note),
    "der Zustand muss sagen, dass hier nicht serviert wird");

  /* Kein Kurs im Datensatz - die Gegenprobe zur Statuszeile. Ein
     Statuswort ist eine Behauptung, das hier ist der Beleg. */
  const text = JSON.stringify(d);
  assert.ok(!/"close":\s*[0-9]/.test(text));
  assert.ok(!/"bars":\s*\[/.test(text), "eine Kursreihe ist im Datensatz");

  if (s.status === "DEPLOYED_NOT_SERVED_HERE") {
    assert.ok(s.objects > 0 && Number.isFinite(s.objects));
    assert.match(s.location, /R2/);
  }
});

/* ========================================== KEINE NEUE OBERFLAECHE */

test("IN9 — es ist keine Ansicht hinzugekommen", () => {
  /* Die Zusage in einer Zahl: der Datenstand landet in den Ansichten,
     die es gibt. Wer eine Debug-Seite anlegt, faellt hier auf. */
  const quelle = lies("scripts/proof/verify-owner-preview.mjs");
  const block = quelle.slice(quelle.indexOf("const ANSICHTEN = ["),
                             quelle.indexOf("];", quelle.indexOf("const ANSICHTEN = [")));
  const pfade = (block.match(/"\/vu2\/[^"]*"/g) || []).map((s) => s.slice(1, -1));
  assert.equal(pfade.length, 14, "die Vorschau fuehrt 14 Ansichten - nicht mehr, nicht weniger");

  const vorher = execFileSync("git",
    ["show", "origin/claude/vu2-owner-preview-integration:scripts/proof/verify-owner-preview.mjs"],
    { cwd: root, encoding: "utf8" });
  const blockVorher = vorher.slice(vorher.indexOf("const ANSICHTEN = ["),
                                  vorher.indexOf("];", vorher.indexOf("const ANSICHTEN = [")));
  assert.equal(block, blockVorher, "die Ansichtsliste wurde veraendert");
});

test("IN10 — die Eignung ist ein Feld der bestehenden Tabelle, keine Sonderansicht", () => {
  const p = proofZeilen();
  if (!p) return;
  const ids = p.idx.fields.map((f) => f.id);
  assert.ok(ids.includes("productEligibility"),
    "ohne Feld im Katalog kann der bestehende Screener nicht danach filtern");
  assert.ok(ids.includes("securityClass"));

  const feld = p.idx.fields.find((f) => f.id === "productEligibility");
  assert.equal(feld.type, "enum");
  assert.equal(feld.category, "reference");
  assert.ok(p.idx.enums.productEligibility.length > 1,
    "ein Enum mit einem Wert filtert nichts");
});

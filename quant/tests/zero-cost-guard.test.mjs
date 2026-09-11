/* =========================================================================
   VISION UNIVERSE — zero-cost-guard.test.mjs

   Die Nullkostenschranke.

   Eine Kostenschranke, die noch nie ausgeloest hat, ist keine bewiesene
   Schranke. Diese Datei laesst sie deshalb gegen JEDE Grenze einzeln
   anlaufen - Speicher, Class A, Class B - und verlangt jedes Mal
   ZERO_COST_GUARD_BLOCKED.

   Und sie prueft die Richtung, die teurer ist als ein Fehlalarm: dass
   ein Lauf, der die Grenze reisst, NICHT trotzdem schreibt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const { createS3Driver } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));

/* ============================================================ GRENZEN */

test("ZC01 die Sicherheitsgrenzen liegen unter den Freigrenzen", () => {
  assert.ok(Guard.SAFETY_CEILING.storageBytes < Guard.FREE_TIER.storageBytes);
  assert.ok(Guard.SAFETY_CEILING.classAOperations < Guard.FREE_TIER.classAOperations);
  assert.ok(Guard.SAFETY_CEILING.classBOperations < Guard.FREE_TIER.classBOperations);
  /* Die vom Eigentuemer vorgegebenen Zahlen, damit eine stille Aenderung
     auffaellt. */
  assert.equal(Guard.SAFETY_CEILING.storageBytes, 8.0e9);
  assert.equal(Guard.SAFETY_CEILING.classAOperations, 750000);
  assert.equal(Guard.SAFETY_CEILING.classBOperations, 7500000);
  assert.equal(Guard.FREE_TIER.storageBytes, 10e9);
  assert.equal(Guard.FREE_TIER.classAOperations, 1000000);
  assert.equal(Guard.FREE_TIER.classBOperations, 10000000);
});

test("ZC02 LIST zaehlt als Class A, nicht als Class B", () => {
  /* Wer LIST als Lesevorgang einplant, verschaetzt sich beim
     Wiederaufbau genau an der Stelle, die weh tut. */
  const e = Guard.estimateOperations({ kind: "REINDEX", listPages: 8, objectHeads: 7800 });
  assert.equal(e.classAOperations, 8);
  assert.equal(e.classBOperations, 7800);
});

/* ============================================= JEDE GRENZE LOEST AUS */

function verdictFor(estimate, usage, currentStorageBytes) {
  return Guard.evaluate({
    operation: "TEST", estimate: Guard.estimateOperations(estimate),
    usage: usage || Guard.emptyUsage("2026-09"),
    currentStorageBytes: currentStorageBytes || 0
  });
}

test("ZC10 Speicher ueber der Grenze blockiert", () => {
  const ok = verdictFor({ objectWrites: 10, bytesDelta: 7.0e9 });
  assert.equal(ok.verdict, Guard.ALLOWED);

  const blocked = verdictFor({ objectWrites: 10, bytesDelta: 8.1e9 });
  assert.equal(blocked.verdict, Guard.BLOCKED);
  assert.deepEqual(blocked.exceeded, ["STORAGE"]);
  assert.equal(blocked.ownerDecisionRequired, true);
  assert.equal(blocked.PROJECTED_STORAGE_BYTES, 8.1e9);
});

test("ZC11 Class A ueber der Grenze blockiert", () => {
  const blocked = verdictFor({ objectWrites: 750000 });
  assert.equal(blocked.verdict, Guard.BLOCKED);
  assert.deepEqual(blocked.exceeded, ["CLASS_A"]);
  assert.equal(blocked.ESTIMATED_CLASS_A, 750000);
});

test("ZC12 Class B ueber der Grenze blockiert", () => {
  const blocked = verdictFor({ objectReads: 7500000 });
  assert.equal(blocked.verdict, Guard.BLOCKED);
  assert.deepEqual(blocked.exceeded, ["CLASS_B"]);
});

test("ZC13 der Stand des Monats zaehlt mit - nicht nur der neue Lauf", () => {
  /* Der Fall, den eine Rechnung ohne Zustand nie faengt: jeder einzelne
     Lauf ist harmlos, der siebte reisst die Grenze. */
  const usage = Guard.applyUsage(Guard.emptyUsage("2026-09"),
                                 { classAOperations: 740000 });
  const alone = verdictFor({ objectWrites: 20000 });
  assert.equal(alone.verdict, Guard.ALLOWED, "fuer sich genommen harmlos");

  const withHistory = verdictFor({ objectWrites: 20000 }, usage);
  assert.equal(withHistory.verdict, Guard.BLOCKED);
  assert.deepEqual(withHistory.exceeded, ["CLASS_A"]);
});

test("ZC14 mehrere Grenzen zugleich werden alle genannt", () => {
  const blocked = verdictFor({ objectWrites: 800000, objectReads: 8000000, bytesDelta: 9e9 });
  assert.equal(blocked.verdict, Guard.BLOCKED);
  assert.deepEqual(blocked.exceeded.sort(), ["CLASS_A", "CLASS_B", "STORAGE"]);
  assert.ok(/CLASS_A/.test(blocked.reason) && /STORAGE/.test(blocked.reason));
});

test("ZC15 der Buchfuehrungsvorrat wird dem Plan zugeschlagen, nicht der Grenze abgezogen", () => {
  /* Sonst saehe ein Bericht so aus, als waere mehr frei, als der
     naechste Lauf vorfindet. */
  const v = verdictFor({ objectWrites: 1000 });
  const classA = v.limits.find((l) => l.id === "CLASS_A");
  assert.equal(classA.projected, 1000 + Guard.BOOKKEEPING_RESERVE.classA);
  assert.equal(classA.ceiling, Guard.SAFETY_CEILING.classAOperations);
});

/* ================================================== NUTZUNGSZUSTAND */

test("ZC20 Speicher ist ein Stand, Operationen sind eine Summe", () => {
  let s = Guard.emptyUsage("2026-09");
  s = Guard.applyUsage(s, { classAOperations: 100, storageBytes: 1e9 });
  s = Guard.applyUsage(s, { classAOperations: 100, storageBytes: 1.2e9 });
  assert.equal(s.classAOperations, 200, "Operationen summieren sich");
  assert.equal(s.storageBytes, 1.2e9, "Speicher wird gesetzt, nicht addiert");
});

test("ZC21 der Monatsschluessel wechselt mit dem Monat", () => {
  assert.equal(Guard.monthKey("2026-09-30T23:59:59Z"), "2026-09");
  assert.equal(Guard.monthKey("2026-10-01T00:00:00Z"), "2026-10");
});

/* ========================================================= BUDGET */

test("ZC30 ein erschoepftes Budget wirft, statt zu warnen", () => {
  const b = Guard.createBudget({ classAOperations: 3, classBOperations: 2 });
  b.consumeClassA(1); b.consumeClassA(1); b.consumeClassA(1);
  assert.throws(() => b.consumeClassA(1), new RegExp(Guard.BLOCKED));
  b.consumeClassB(1); b.consumeClassB(1);
  assert.throws(() => b.consumeClassB(1), new RegExp(Guard.BLOCKED));
});

test("ZC31 das Budget zaehlt uebersprungene Schreibvorgaenge getrennt", () => {
  const b = Guard.createBudget({ classAOperations: 10, classBOperations: 10 });
  b.noteSkippedWrite(); b.noteSkippedWrite();
  assert.equal(b.spent.writesSkipped, 2);
  assert.equal(b.spent.classA, 0, "was nicht geschrieben wurde, kostet nichts");
});

/* ======================================== KEINE KOSTENPFLICHTIGEN WEGE */

test("ZC40 der Treiber sperrt alles, was Geld kosten kann", () => {
  const d = createS3Driver({ endpoint: "https://x.example", bucket: "b",
                             accessKeyId: "k", secretAccessKey: "s" });
  const forbidden = [
    ["Speicherklasse", "PUT", {}, { "x-amz-storage-class": "STANDARD_IA" }],
    ["Object Lock", "PUT", {}, { "x-amz-object-lock-mode": "GOVERNANCE" }],
    ["KMS", "PUT", {}, { "x-amz-server-side-encryption-aws-kms-key-id": "abc" }],
    ["Aufbewahrung", "GET", { lifecycle: "" }, {}],
    ["Versionierung", "GET", { versioning: "" }, {}],
    ["Replikation", "GET", { replication: "" }, {}],
    ["Inventar", "GET", { inventory: "" }, {}],
    ["Data Catalog", "GET", { catalog: "" }, {}],
    ["Loeschen", "DELETE", {}, {}]
  ];
  for (const [name, method, query, headers] of forbidden) {
    assert.throws(() => d.assertZeroCostSafe(method, query, headers, "v1/tiingo/daily/US/AAPL.json.zst"),
                  /ZERO_COST_GUARD_BLOCKED/, name + " muss gesperrt sein");
  }
  /* Und der normale Betrieb laeuft weiter. */
  d.assertZeroCostSafe("GET", { "list-type": "2", prefix: "v1/", "max-keys": "1000" }, {});
  d.assertZeroCostSafe("PUT", {}, { "content-type": "application/json", "x-amz-meta-ticker": "AAPL" });
  d.assertZeroCostSafe("HEAD", {}, {});
});

/* ======================================== DER ECHTE 7.800er-BACKFILL */

test("ZC50 der geplante 7.800er-Backfill bleibt unter allen Grenzen", () => {
  const SYMBOLS = 7800;
  const est = Guard.estimateOperations({
    kind: "BACKFILL",
    objectWrites: SYMBOLS, objectHeads: SYMBOLS, objectReads: SYMBOLS,
    listPages: Math.ceil(SYMBOLS / 1000),
    indexWrites: Math.ceil(SYMBOLS / 100),
    bytesDelta: Math.round(SYMBOLS * 4085 * 40.7)
  });
  const v = Guard.evaluate({ operation: "FULL_BACKFILL_7800", estimate: est,
                             usage: Guard.emptyUsage("2026-09"), currentStorageBytes: 0 });
  assert.equal(v.verdict, Guard.ALLOWED);
  assert.ok(v.PROJECTED_STORAGE_BYTES < Guard.SAFETY_CEILING.storageBytes);
  assert.ok(v.PROJECTED_STORAGE_BYTES > 1.2e9 && v.PROJECTED_STORAGE_BYTES < 1.4e9,
            "rund 1,3 GB - faellt die Messung, faellt diese Zusicherung auf");
  assert.ok(v.PROJECTED_FREE_TIER_USAGE_PERCENT < 20);
});

test("ZC51 taegliche Aktualisierung einen Monat lang bleibt unter der Grenze", () => {
  /* 30 Tage a 7.800 Titel. Die Rechnung, die entscheidet, ob der
     Dauerbetrieb kostenfrei bleibt - und nicht nur der erste Lauf. */
  let usage = Guard.emptyUsage("2026-09");
  let lastVerdict = null;
  for (let day = 0; day < 30; day++) {
    const est = Guard.estimateOperations({
      kind: "DAILY_UPDATE", objectWrites: 7800, objectHeads: 7800, objectReads: 7800,
      indexWrites: 1, bytesDelta: Math.round(7800 * 40.7)
    });
    lastVerdict = Guard.evaluate({ operation: "DAILY_UPDATE", estimate: est, usage,
                                   currentStorageBytes: 1.3e9 + day * 7800 * 40.7 });
    assert.equal(lastVerdict.verdict, Guard.ALLOWED, "Tag " + (day + 1));
    usage = Guard.applyUsage(usage, {
      classAOperations: est.classAOperations, classBOperations: est.classBOperations,
      storageBytes: lastVerdict.PROJECTED_STORAGE_BYTES
    });
  }
  assert.ok(usage.classAOperations < Guard.SAFETY_CEILING.classAOperations,
            `Class A nach 30 Tagen: ${usage.classAOperations}`);
  assert.ok(usage.classBOperations < Guard.SAFETY_CEILING.classBOperations);
});

test("ZC52 taegliche Aktualisierung fuer ein VIELFACHES Universum loest aus", () => {
  /* Der Ausbau auf US + Europa + Deutschland + ETFs. Die Schranke soll
     ihn melden, BEVOR jemand ihn startet - das ist ihr Zweck. */
  let usage = Guard.emptyUsage("2026-09");
  const SYMBOLS = 60000;
  let blockedOnDay = null;
  for (let day = 0; day < 30 && blockedOnDay === null; day++) {
    const est = Guard.estimateOperations({
      kind: "DAILY_UPDATE", objectWrites: SYMBOLS, objectHeads: SYMBOLS,
      objectReads: SYMBOLS, indexWrites: 1, bytesDelta: SYMBOLS * 40
    });
    const v = Guard.evaluate({ operation: "DAILY_UPDATE", estimate: est, usage,
                               currentStorageBytes: 6e9 });
    if (v.verdict === Guard.BLOCKED) { blockedOnDay = day + 1; break; }
    usage = Guard.applyUsage(usage, { classAOperations: est.classAOperations,
                                      classBOperations: est.classBOperations });
  }
  assert.ok(blockedOnDay !== null, "bei 60.000 Titeln muss die Schranke im Monat ausloesen");
  assert.ok(blockedOnDay > 1, "und nicht schon am ersten Tag");
});

test("ZC41 Loeschen geht nur unter einem Nachweis-Praefix - nie in die Produktion", () => {
  const base = { endpoint: "https://x.example", bucket: "b",
                 accessKeyId: "k", secretAccessKey: "s" };

  /* Ohne Freischaltung: gesperrt, auch unter verify/. */
  const plain = createS3Driver(base);
  assert.equal(plain.deletePrefix, null);
  assert.throws(() => plain.assertZeroCostSafe("DELETE", {}, {}, "verify/v1/x"),
                /ZERO_COST_GUARD_BLOCKED/);

  /* Mit Freischaltung: nur unter dem genannten Praefix. */
  const scoped = createS3Driver(Object.assign({}, base, { allowDeleteUnderPrefix: "verify/v1/" }));
  scoped.assertZeroCostSafe("DELETE", {}, {}, "verify/v1/tiingo/daily/VERIFY/AAPL.json.zst");
  for (const key of [
    "v1/tiingo/daily/US/AAPL.json.zst",
    "v1/_usage/tiingo-US-2026-09.json",
    "v1/tiingo/daily/US/_index.json.zst",
    "",
    "verify2/v1/x"
  ]) {
    assert.throws(() => scoped.assertZeroCostSafe("DELETE", {}, {}, key),
                  /ZERO_COST_GUARD_BLOCKED/, "DELETE auf '" + key + "' muss scheitern");
  }

  /* Und die Freischaltung laesst sich nicht auf die Produktion richten:
     der Praefix MUSS das Wort "verify" enthalten. Kein Tippfehler macht
     aus v1/tiingo/... einen Pfad mit "verify" darin. */
  for (const bad of ["v1/", "/", "v1/tiingo/", "prod/"]) {
    assert.throws(() => createS3Driver(Object.assign({}, base, { allowDeleteUnderPrefix: bad })),
                  /ZERO_COST_GUARD_BLOCKED/, "Praefix '" + bad + "' darf nicht angenommen werden");
  }

  /* Ein leerer Praefix ist keine Freischaltung auf alles, sondern gar
     keine: er faellt auf null zurueck, und damit bleibt DELETE gesperrt.
     Die sichere Auslegung - und die einzige, die man nicht versehentlich
     als "ueberall erlaubt" lesen kann. */
  const empty = createS3Driver(Object.assign({}, base, { allowDeleteUnderPrefix: "" }));
  assert.equal(empty.deletePrefix, null);
  assert.throws(() => empty.assertZeroCostSafe("DELETE", {}, {}, "verify/v1/x"),
                /ZERO_COST_GUARD_BLOCKED/);
});

/* =========================================================================
   VU SOCIAL — KANONISCHE CONTRACTS (§37, §38)

   Diese Datei prueft die Vertraege, auf denen alles andere steht: die
   Entitaeten, den Ereignis-Umschlag und den Idempotenzschluessel.

   Der wichtigste Test hier ist C7: derselbe Sachverhalt erzeugt denselben
   Schluessel, auch wenn der Payload zusaetzliche Felder traegt. Waere das
   nicht so, wuerde jeder Wiederholungslauf zu einem "neuen" Ereignis — und
   der Doppel-Post waere nur eine Frage der Zeit.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Schema = require("../engines/schema.js");
const Events = require("../engines/events.js");

test("C1 · Ein unbekannter Publikationszustand wird abgelehnt", () => {
  assert.throws(() => Schema.publication({
    publicationId: "p1", providerId: "mock", idempotencyKey: "k1", state: "FLIEGT_GERADE"
  }), /publication.state/);
});

test("C2 · Der Lebenszyklus erlaubt nur die vorgesehenen Uebergaenge", () => {
  const T = Schema.PUBLICATION_TRANSITIONS;
  /* Jeder Zustand ist erreichbar und jeder Zielzustand ist ein bekannter. */
  for (const [from, targets] of Object.entries(T)) {
    for (const to of targets) {
      assert.ok(Schema.PUBLICATION_STATES.includes(to), `${from} -> ${to}: unbekannter Zielzustand`);
    }
  }
  /* ARCHIVED ist Endzustand. */
  assert.deepEqual(T.ARCHIVED, []);
  /* Aus PUBLISHED fuehrt kein Weg zurueck in die Veroeffentlichung — sonst
     waere ein zweiter Post einen Uebergang entfernt. */
  assert.ok(!T.PUBLISHED.includes("PUBLISHING"));
  assert.ok(!T.PUBLISHED.includes("READY"));
  assert.ok(!T.PUBLISHED.includes("RETRY"));
});

test("C3 · Fehlende Kennzahlen sind null und nicht null-komma-nichts", () => {
  const snap = Schema.metricSnapshot({
    snapshotId: "s1", publicationId: "p1", providerId: "mock",
    metrics: { impressions: 100 }
  });
  assert.equal(snap.metrics.impressions, 100);
  /* Die entscheidende Zeile: nicht gemeldet heisst null. */
  assert.equal(snap.metrics.saves, null);
  assert.notEqual(snap.metrics.saves, 0);
  for (const m of Schema.CANONICAL_METRICS) {
    assert.ok(m in snap.metrics, `${m} fehlt im kanonischen Satz`);
  }
});

test("C4 · Eine Entitaet mit einem Tokenfeld wird nicht gebaut", () => {
  assert.throws(() => Schema.socialAccount({
    accountId: "a1", providerId: "meta", accessToken: "EAAgeheim"
  }), /verbotenes Feld/);
  assert.throws(() => Schema.assertNoSecrets({ a: { b: { client_secret: "x" } } }, "test"),
    /verbotenes Feld/);
});

test("C5 · Ein sourceRef ohne Zustand gilt als UNAVAILABLE, nicht als geprueft", () => {
  const ref = Schema.sourceRef({ source: "vu.technical" });
  assert.equal(ref.state, "UNAVAILABLE");
  assert.equal(ref.value, null);
  assert.equal(ref.freshnessSeconds, null);
});

test("C6 · Jeder Ereignistyp hat Identitaetsfelder, und ein fehlendes bricht ab", () => {
  for (const type of Events.EVENT_TYPES) {
    assert.ok(Array.isArray(Events.IDENTITY_FIELDS[type]) && Events.IDENTITY_FIELDS[type].length > 0,
      `${type} ohne Identitaetsfelder`);
  }
  assert.throws(() => Events.envelope("TREND_DETECTED", {}), /Identitaetsfeld/);
  assert.throws(() => Events.envelope("GIBT_ES_NICHT", { x: 1 }), /unbekannter Ereignistyp/);
});

test("C7 · Derselbe Sachverhalt erzeugt denselben Ereignisschluessel — auch mit Zusatzfeldern", () => {
  const a = Events.envelope("CONTENT_OPPORTUNITY_CREATED", { opportunityId: "o1" },
    { producedBy: "lauf-1", occurredAt: "2026-09-15T06:00:00Z" });
  const b = Events.envelope("CONTENT_OPPORTUNITY_CREATED",
    { opportunityId: "o1", diagnose: "zusaetzliches Feld", score: 81 },
    { producedBy: "lauf-2", occurredAt: "2026-09-15T18:00:00Z" });
  assert.equal(a.eventId, b.eventId,
    "Ein Diagnosefeld darf aus einer Wiederholung kein neues Ereignis machen");

  const c = Events.envelope("CONTENT_OPPORTUNITY_CREATED", { opportunityId: "o2" });
  assert.notEqual(a.eventId, c.eventId);
});

test("C8 · Das Protokoll nimmt ein Ereignis genau einmal an", () => {
  const ledger = Events.createLedger();
  const e = Events.envelope("METRICS_UPDATED",
    { publicationId: "p1", capturedAt: "2026-09-15T12:00:00Z" });
  assert.equal(ledger.accept(e), true);
  assert.equal(ledger.accept(e), false);
  assert.equal(ledger.size(), 1);

  /* Ein anderer Erfassungszeitpunkt ist ein anderes Ereignis — bei
     Metriken ist die Zeit Teil der Sache. */
  const later = Events.envelope("METRICS_UPDATED",
    { publicationId: "p1", capturedAt: "2026-09-16T12:00:00Z" });
  assert.equal(ledger.accept(later), true);
});

test("C9 · Der Idempotenzschluessel haengt am Inhalt, nicht am Versuch", () => {
  const spec = { providerId: "meta", accountId: "meta:123", packageId: "pkg_1", scheduledFor: null };
  const first = Events.publicationIdempotencyKey(spec);
  const retry = Events.publicationIdempotencyKey(spec);
  assert.equal(first, retry, "Ein Retry muss denselben Schluessel erzeugen, sonst ist er kein Retry");

  /* Anderer Zeitpunkt = Absicht, nicht Unfall. */
  const scheduled = Events.publicationIdempotencyKey(
    Object.assign({}, spec, { scheduledFor: "2026-09-16T07:00:00Z" }));
  assert.notEqual(first, scheduled);

  /* Anderes Konto = anderer Beitrag. */
  const otherAccount = Events.publicationIdempotencyKey(
    Object.assign({}, spec, { accountId: "meta:999" }));
  assert.notEqual(first, otherAccount);

  assert.throws(() => Events.publicationIdempotencyKey({ providerId: "meta" }), /ohne accountId/);
});

test("C10 · Ein Content Package fuehrt seine Belege mit", () => {
  const pkg = Schema.contentPackage({
    packageId: "pkg1", topic: "T",
    claims: [{ text: "12 %", numeric: 12, source: { source: "vu.quant", state: "VERIFIED" } }]
  });
  assert.equal(pkg.claims.length, 1);
  assert.equal(pkg.claims[0].source.state, "VERIFIED");
  assert.throws(() => Schema.contentPackage({
    packageId: "pkg2", topic: "T", claims: [{ numeric: 1 }]
  }), /claim.text/);
});

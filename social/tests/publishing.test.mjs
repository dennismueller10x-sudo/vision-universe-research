/* =========================================================================
   VU SOCIAL — PUBLISHING, IDEMPOTENZ, RETRY, KILL SWITCH
   (§15, §33, §43 "Publishing", "Idempotency", "Retries",
    "Duplicate protection", "Kill switch")

   Der teuerste Fehler dieses Systems ist der doppelte Beitrag. Die Tests
   PB4 bis PB8 stellen die Betriebsvorgaenge nach, aus denen er
   tatsaechlich entsteht — nicht die, die man sich ausdenkt:

     PB4  zwei Planungen desselben Inhalts
     PB5  ein zweiter Aufruf nach erfolgreicher Veroeffentlichung
     PB6  ein Lauf, der abbricht, waehrend ein anderer schon sendet
     PB7  ein Retry nach einer Ratenbegrenzung
     PB8  ein Lauf, der den Zustand aus einem Artefakt neu laedt
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Publishing = require("../engines/publishing.js");
const Provider = require("../engines/provider.js");
const KillSwitch = require("../engines/kill-switch.js");
const AuditLog = require("../engines/audit-log.js");
const Schema = require("../engines/schema.js");
const { createMockProvider } = require("../providers/mock/adapter.js");

const ISO = "2026-09-15T12:00:00Z";
const MEDIA = { type: "IMAGE", url: "https://example.invalid/bild.jpg", caption: "Text" };

const OPEN = KillSwitch.fromConfig({
  gates: {
    GLOBAL_AUTOPUBLISH: { enabled: true, reason: "Test.", changedAt: "2026-09-15" },
    PROVIDER_MOCK: { enabled: true, reason: "Test.", changedAt: "2026-09-15" }
  }
});
const CLOSED = KillSwitch.fromConfig({
  gates: { GLOBAL_AUTOPUBLISH: { enabled: false, reason: "Nicht freigegeben." } }
});

function setup(options = {}) {
  const registry = Provider.createRegistry();
  const mock = createMockProvider({ now: options.now || (() => new Date(ISO)), ...options.mock });
  registry.register(mock);
  const auditLog = AuditLog.createLog();
  const orchestrator = Publishing.createOrchestrator({
    registry, killSwitch: options.killSwitch || OPEN, auditLog,
    now: options.now || (() => new Date(ISO)),
    publications: options.publications
  });
  return { registry, mock, auditLog, orchestrator };
}

function ready(orchestrator, spec = {}) {
  const { publication } = orchestrator.intend(Object.assign({
    packageId: "pkg_1", providerId: "mock", accountId: "mock_account_1"
  }, spec));
  orchestrator.transition(publication.publicationId, "DRAFT");
  orchestrator.transition(publication.publicationId, "VALIDATED");
  orchestrator.transition(publication.publicationId, "READY");
  return publication;
}

test("PB1 · Der Kill Switch ist die erste Frage, nicht die letzte", async () => {
  const { orchestrator, mock } = setup({ killSwitch: CLOSED });
  const pub = ready(orchestrator);
  const res = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "killSwitch");
  assert.equal(res.blockedBy, "GLOBAL_AUTOPUBLISH");
  assert.equal(mock.__postCount(), 0, "Bei geschlossenem Schalter geht nichts hinaus");
  assert.equal(orchestrator.get(pub.publicationId).state, "READY", "Der Zustand bleibt unveraendert");
});

test("PB2 · Ein fehlender Schaltereintrag bedeutet AUS", () => {
  const switchWithoutProvider = KillSwitch.fromConfig({
    gates: { GLOBAL_AUTOPUBLISH: { enabled: true, reason: "an" } }
  });
  const res = switchWithoutProvider.allows("neuerprovider", "publish");
  assert.equal(res.allowed, false);
  assert.equal(res.blockedBy, "PROVIDER_NEUERPROVIDER");
  assert.match(res.reason, /abgeschaltet/);
});

test("PB3 · Kommentieren und Loeschen brauchen eigene Schalter", () => {
  assert.equal(OPEN.allows("mock", "publish").allowed, true);
  assert.equal(OPEN.allows("mock", "comment").allowed, false);
  assert.equal(OPEN.allows("mock", "delete").allowed, false);
  assert.throws(() => OPEN.allows("mock", "hackenUndSchlagen"), /unbekannte Handlung/);
});

test("PB4 · Zweimal dieselbe Planung ergibt eine Veroeffentlichung", () => {
  const { orchestrator } = setup();
  const a = orchestrator.intend({ packageId: "pkg_1", providerId: "mock", accountId: "acc" });
  const b = orchestrator.intend({ packageId: "pkg_1", providerId: "mock", accountId: "acc" });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.publication.publicationId, b.publication.publicationId);
  assert.equal(orchestrator.all().length, 1);

  /* Ein anderer Termin ist eine andere Absicht. */
  const c = orchestrator.intend({ packageId: "pkg_1", providerId: "mock", accountId: "acc",
                                  scheduledFor: "2026-09-16T07:00:00Z" });
  assert.equal(c.created, true);
  assert.equal(orchestrator.all().length, 2);
});

test("PB5 · Ein zweiter Aufruf nach Erfolg erzeugt keinen zweiten Beitrag", async () => {
  const { orchestrator, mock } = setup();
  const pub = ready(orchestrator);
  const first = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(first.ok, true);
  assert.equal(first.publication.state, "PUBLISHED");

  const second = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyPublished, true);
  assert.equal(mock.__postCount(), 1);
});

test("PB6 · Ein laufender Versuch wird von einem zweiten Lauf nicht angefasst", async () => {
  const { orchestrator, mock } = setup();
  const pub = ready(orchestrator);

  /* Zustand nachstellen: ein anderer Lauf hat die Marke gesetzt und ist
     noch nicht fertig. */
  const live = orchestrator.get(pub.publicationId);
  live.state = "PUBLISHING";
  live.attempts.push(Schema.publicationAttempt({
    attemptId: "att_fremd", startedAt: ISO, outcome: "pending"
  }));

  const res = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "inFlight");
  assert.equal(mock.__postCount(), 0);
  assert.match(res.message, /fasst sie nicht an/);
});

test("PB6b · Eine verwaiste Marke wird nach dem Zeitfenster uebernommen", async () => {
  let clock = Date.parse(ISO);
  const { orchestrator, mock } = setup({ now: () => new Date(clock) });
  const pub = ready(orchestrator);
  const live = orchestrator.get(pub.publicationId);
  live.state = "PUBLISHING";
  live.attempts.push(Schema.publicationAttempt({
    attemptId: "att_verwaist", startedAt: new Date(clock).toISOString(), outcome: "pending"
  }));

  assert.equal(orchestrator.isStaleInFlight(live), false);
  clock += (Publishing.IN_FLIGHT_TIMEOUT_SECONDS + 60) * 1000;
  assert.equal(orchestrator.isStaleInFlight(live), true);
  assert.ok(orchestrator.due(new Date(clock).toISOString()).some(
    (p) => p.publicationId === pub.publicationId));

  const res = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(res.ok, true);
  assert.equal(mock.__postCount(), 1);
});

test("PB7 · Ein Retry nach Ratenbegrenzung veroeffentlicht nicht zweimal", async () => {
  const { orchestrator, mock } = setup();
  const pub = ready(orchestrator);

  /* Erster Versuch geht durch — der Provider hat ihn gespeichert. */
  const first = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(first.ok, true);

  /* Der Orchestrator "vergisst" den Erfolg (Lauf abgebrochen vor dem
     Schreiben des Zustands) und startet neu aus READY. */
  const forgotten = Publishing.createOrchestrator({
    registry: setupRegistryWith(mock), killSwitch: OPEN,
    auditLog: AuditLog.createLog(), now: () => new Date(ISO),
    publications: [Schema.publication({
      publicationId: pub.publicationId, packageId: pub.packageId,
      providerId: "mock", accountId: pub.accountId,
      state: "READY", idempotencyKey: pub.idempotencyKey
    })]
  });
  mock.__setFailMode("rateLimit");
  const limited = await forgotten.publish(pub.publicationId, MEDIA);
  /* Trotz Ratenbegrenzung: der Provider erkennt den Schluessel, weil die
     Idempotenzpruefung VOR dem preflight steht. */
  assert.equal(limited.ok, true);
  assert.equal(limited.deduplicated, true);
  assert.equal(mock.__postCount(), 1, "Der Provider darf keinen zweiten Beitrag angelegt haben");
});

function setupRegistryWith(mock) {
  const registry = Provider.createRegistry();
  registry.register(mock);
  return registry;
}

test("PB8 · Der Zustand ueberlebt das Neuladen aus einem Artefakt", async () => {
  const { orchestrator, mock } = setup();
  const pub = ready(orchestrator);
  await orchestrator.publish(pub.publicationId, MEDIA);

  /* So kommt der Zustand im naechsten Workflow-Lauf zurueck: als JSON. */
  const persisted = JSON.parse(JSON.stringify(orchestrator.all()));
  const next = Publishing.createOrchestrator({
    registry: setupRegistryWith(mock), killSwitch: OPEN,
    auditLog: AuditLog.createLog(), now: () => new Date(ISO),
    publications: persisted
  });
  assert.equal(next.byIdempotencyKey(pub.idempotencyKey).state, "PUBLISHED");
  const again = next.intend({ packageId: pub.packageId, providerId: "mock", accountId: pub.accountId });
  assert.equal(again.created, false);
  assert.equal(mock.__postCount(), 1);
});

test("PB9 · Unerlaubte Zustandsuebergaenge finden nicht statt", () => {
  const { orchestrator } = setup();
  const pub = ready(orchestrator);
  const back = orchestrator.transition(pub.publicationId, "IDEA");
  assert.equal(back.ok, false);
  assert.match(back.reason, /nicht vorgesehen/);
  assert.equal(orchestrator.get(pub.publicationId).state, "READY");

  assert.equal(Publishing.canTransition("PUBLISHED", "PUBLISHING"), false);
  assert.equal(Publishing.canTransition("ARCHIVED", "DRAFT"), false);
  assert.equal(Publishing.canTransition("FAILED", "RETRY"), true);
});

test("PB10 · Ein nicht wiederholbarer Fehler wird nicht wiederholt", async () => {
  const { orchestrator, mock } = setup();
  const pub = ready(orchestrator);
  mock.__expireToken();
  const res = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "tokenExpired");
  assert.equal(res.retryable, false);

  const retry = orchestrator.scheduleRetry(pub.publicationId);
  assert.equal(retry.ok, false);
  assert.match(retry.reason, /Hier entscheidet ein Mensch/);
});

test("PB11 · Ein wiederholbarer Fehler bekommt wachsenden Abstand und eine Obergrenze", async () => {
  const { orchestrator, mock } = setup();
  const pub = ready(orchestrator);
  mock.__setFailMode("outage");

  const seen = [];
  for (let i = 0; i < Publishing.MAX_ATTEMPTS; i++) {
    const res = await orchestrator.publish(pub.publicationId, MEDIA);
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true);
    seen.push(res.retryAfterSeconds);
    const retry = orchestrator.scheduleRetry(pub.publicationId);
    if (i < Publishing.MAX_ATTEMPTS - 1) assert.equal(retry.ok, true);
    else assert.match(retry.reason, /Versuchsgrenze/);
  }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] >= seen[i - 1], "Der Abstand darf nicht schrumpfen");
  }
  const exhausted = await orchestrator.publish(pub.publicationId, MEDIA);
  assert.equal(exhausted.reason, "attemptsExhausted");
  assert.equal(mock.__postCount(), 0);
});

test("PB12 · Das Auditprotokoll traegt jede Entscheidung und kein Geheimnis", async () => {
  const { orchestrator, auditLog, mock } = setup();
  const pub = ready(orchestrator);
  await orchestrator.publish(pub.publicationId, MEDIA);

  const entries = auditLog.entries();
  assert.ok(entries.length >= 5);
  const publishEntry = entries.find((e) => e.decision === "publication.publish" && e.result === "succeeded");
  assert.ok(publishEntry, "Der Erfolgsfall gehoert ins Protokoll, nicht nur der Fehlerfall");
  assert.ok(publishEntry.inputs.includes(pub.packageId));
  assert.equal(publishEntry.provider, "mock");
  assert.ok(publishEntry.timestamp);

  const serialized = JSON.stringify(entries);
  for (const forbidden of ["EAA", "access_token", "client_secret"]) {
    if (serialized.includes(forbidden)) {
      assert.ok(serialized.includes("[redacted]"), `${forbidden} ungeschwaerzt im Protokoll`);
    }
  }
});

test("PB13 · Faellige Veroeffentlichungen werden nach Zustand und Termin bestimmt", () => {
  const { orchestrator } = setup();
  const a = ready(orchestrator, { packageId: "pkg_a" });
  const b = ready(orchestrator, { packageId: "pkg_b", scheduledFor: "2026-09-20T07:00:00Z" });
  orchestrator.transition(b.publicationId, "SCHEDULED", { scheduledFor: "2026-09-20T07:00:00Z" });

  const dueNow = orchestrator.due(ISO).map((p) => p.publicationId);
  assert.ok(dueNow.includes(a.publicationId));
  assert.ok(!dueNow.includes(b.publicationId), "Ein Termin in der Zukunft ist nicht faellig");

  const dueLater = orchestrator.due("2026-09-20T08:00:00Z").map((p) => p.publicationId);
  assert.ok(dueLater.includes(b.publicationId));
});

test("PB14 · Eine Veroeffentlichung aus einem falschen Zustand wird abgelehnt", async () => {
  const { orchestrator, mock } = setup();
  const { publication } = orchestrator.intend({
    packageId: "pkg_x", providerId: "mock", accountId: "acc" });
  const res = await orchestrator.publish(publication.publicationId, MEDIA);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "wrongState");
  assert.equal(mock.__postCount(), 0);
});

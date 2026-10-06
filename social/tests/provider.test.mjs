/* =========================================================================
   VU SOCIAL — PROVIDER-ABSTRAKTION, CAPABILITIES UND FEHLERLAGEN
   (§8, §43 "Provider capabilities", "Provider outage", "Rate limits", §44)

   Die Tests hier beantworten drei Fragen:

     Haelt die Registry ihren Vertrag?         (P1-P3)
     Bleibt "ungeprueft" ungeprueft?           (P4-P6)
     Verhaelt sich ein Ausfall wie ein Zustand — und nicht wie ein Absturz?
                                               (P8-P12)
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Provider = require("../engines/provider.js");
const Capabilities = require("../engines/capabilities.js");
const { createMockProvider, mockCapabilities } = require("../providers/mock/adapter.js");

const ISO = "2026-09-15T12:00:00Z";
const at = (offsetMs = 0) => () => new Date(Date.parse(ISO) + offsetMs);

test("P1 · Die Registry nimmt nur Adapter an, die ihre Interfaces erfuellen", () => {
  const registry = Provider.createRegistry();
  const broken = {
    providerId: "kaputt",
    interfaces: ["SocialPublishProvider"],
    capabilities: mockCapabilities(),
    publish() {}, healthCheck() {}
    /* validateMedia und getPublishStatus fehlen */
  };
  assert.throws(() => registry.register(broken), /validateMedia/);
});

test("P2 · Ein Adapter ohne Capability-Deklaration wird abgelehnt", () => {
  const registry = Provider.createRegistry();
  assert.throws(() => registry.register({
    providerId: "x", interfaces: ["SocialAuthProvider"],
    getAuthorizationUrl() {}, exchangeCode() {}, refreshToken() {}, revoke() {},
    getAccounts() {}, getPermissions() {}, healthCheck() {}
  }), /keine Capability-Deklaration/);
});

test("P3 · Der Mock-Provider erfuellt alle vier Interfaces", () => {
  const registry = Provider.createRegistry();
  registry.register(createMockProvider({ now: at() }));
  for (const name of Object.keys(Provider.INTERFACES)) {
    assert.deepEqual(registry.implementing(name), ["mock"], `${name} nicht erfuellt`);
  }
});

test("P4 · Eine nicht deklarierte Faehigkeit bleibt null — nicht UNAVAILABLE", () => {
  const declaration = Capabilities.declare("test", { publish: { publishImage: "SUPPORTED" } });
  assert.equal(Capabilities.lookup(declaration, "publish", "publishImage"), "SUPPORTED");
  assert.equal(Capabilities.lookup(declaration, "publish", "publishStory"), null);
  assert.equal(Capabilities.unknown(declaration, "publish", "publishStory"), true);
  assert.equal(Capabilities.explicitlyUnavailable(declaration, "publish", "publishStory"), false,
    "Ungeprueft darf nie zu 'nicht vorhanden' werden (MEDIUM-5-Lehre)");
});

test("P5 · Nur SUPPORTED ist ein Ja; PARTIALLY_SUPPORTED ist benutzbar, aber kein Ja", () => {
  const d = mockCapabilities();
  assert.equal(Capabilities.supports(d, "publish", "publishImage"), true);
  assert.equal(Capabilities.supports(d, "publish", "publishCarousel"), false);
  assert.equal(Capabilities.usable(d, "publish", "publishCarousel"), true);
  assert.equal(Capabilities.usable(d, "publish", "publishStory"), false);
});

test("P6 · capabilityMissing unterscheidet 'kann nicht' von 'ungeprueft'", () => {
  const d = mockCapabilities();
  const missing = Capabilities.capabilityMissing(d, "publish", "publishStory");
  assert.equal(missing.reason, "capabilityMissing");
  assert.equal(missing.data, null);

  const unknown = Capabilities.capabilityMissing(Capabilities.declare("x", {}), "publish", "publishStory");
  assert.equal(unknown.reason, "capabilityUnknown");
  assert.match(unknown.message, /kein Nein/);
});

test("P7 · Ein Vendor-Feld in einem kanonischen Objekt wird gefunden", () => {
  const leaked = { publication: { externalPostId: "1", ig_id: "17841", nested: [{ creation_id: "c" }] } };
  const hits = Provider.findVendorLeakage(leaked);
  assert.ok(hits.includes("publication.ig_id"));
  assert.ok(hits.some((h) => h.includes("creation_id")));

  /* providerMetrics ist die eine erlaubte Insel (§17). */
  assert.deepEqual(
    Provider.findVendorLeakage({ snapshot: { providerMetrics: { media_type: "IMAGE", plays: 1 } } }),
    []);
});

test("P8 · Ein Ausfall ist ein Zustand, kein geworfener Fehler", async () => {
  const mock = createMockProvider({ now: at(), failMode: "outage" });
  const res = await mock.getPostMetrics("egal");
  assert.equal(res.available, false);
  assert.equal(res.reason, "providerOutage");
  assert.equal(res.retryable, true);
  assert.ok(res.retryAfterSeconds > 0);

  const health = await mock.healthCheck();
  assert.equal(health.status, "unavailable");
});

test("P9 · Ein Adapter, der wirft, macht die Gesamtabfrage nicht kaputt", async () => {
  const registry = Provider.createRegistry();
  registry.register(createMockProvider({ now: at() }));
  registry.register({
    providerId: "explodiert",
    interfaces: ["SocialAnalyticsProvider"],
    capabilities: mockCapabilities(),
    getPostMetrics() {}, getAccountMetrics() {},
    healthCheck() { throw new Error("Bumm"); }
  });
  const all = await registry.healthAll();
  assert.equal(all.length, 2);
  const broken = all.find((h) => h.provider === "explodiert");
  assert.equal(broken.status, "unavailable");
  assert.match(broken.message, /healthCheck\(\) hat einen Fehler geworfen/);
  /* Der gesunde Provider bleibt gesund — §33: ein Providerfehler blockiert
     nicht das Gesamtsystem. */
  assert.equal(all.find((h) => h.provider === "mock").status, "ok");
});

test("P10 · Die Ratenbegrenzung wird VORHER erkannt und nennt die Wartezeit", async () => {
  const mock = createMockProvider({ now: at(), rateLimit: { max: 2, windowSeconds: 60 } });
  const publish = await mock.publish({ idempotencyKey: "k1", media: { type: "IMAGE", url: "https://a/b.jpg" } });
  assert.equal(publish.available, true);

  await mock.getAccounts();
  const limited = await mock.getAccounts();
  assert.equal(limited.available, false);
  assert.equal(limited.reason, "rateLimited");
  assert.ok(limited.retryAfterSeconds > 0 && limited.retryAfterSeconds <= 60);
});

test("P11 · Ein abgelaufenes Token ist nicht wiederholbar", async () => {
  const mock = createMockProvider({ now: at() });
  mock.__expireToken();
  const res = await mock.getAccounts();
  assert.equal(res.reason, "tokenExpired");
  assert.equal(res.retryable, false, "Warten macht ein abgelaufenes Token nicht gueltig");

  const refreshed = await mock.refreshToken();
  assert.equal(refreshed.available, true);
  assert.equal((await mock.getAccounts()).available, true);
});

test("P12 · Ein entzogenes Recht meldet sich als solches", async () => {
  const mock = createMockProvider({ now: at() });
  await mock.revoke();
  const res = await mock.getAccounts();
  assert.equal(res.reason, "permissionRevoked");
  assert.equal((await mock.healthCheck()).status, "degraded");
});

test("P13 · Ungueltige Medien werden vor dem Aufruf abgelehnt", async () => {
  const mock = createMockProvider({ now: at() });
  const carousel = mock.validateMedia({ type: "CAROUSEL", url: "https://a/b.jpg", items: [1] });
  assert.equal(carousel.available, false);
  assert.match(carousel.message, /2 bis 10/);

  const story = mock.validateMedia({ type: "STORY", url: "https://a/b.jpg" });
  assert.equal(story.available, false);

  const res = await mock.publish({ idempotencyKey: "k", media: { type: "STORY", url: "https://a/b.jpg" } });
  assert.equal(res.available, false);
  assert.equal(mock.__postCount(), 0, "Ein ungueltiges Medium darf keinen Beitrag erzeugen");
});

test("P14 · Kommentartexte heissen untrustedText und nicht text", async () => {
  const mock = createMockProvider({ now: at() });
  await mock.publish({ idempotencyKey: "k", media: { type: "IMAGE", url: "https://a/b.jpg" } });
  const post = await mock.publish({ idempotencyKey: "k", media: { type: "IMAGE", url: "https://a/b.jpg" } });
  const comments = await mock.getComments(post.data.externalPostId);
  assert.equal(comments.available, true);
  for (const c of comments.data) {
    assert.ok("untrustedText" in c, "Der Feldname ist die Warnung (§50)");
    assert.ok(!("text" in c));
  }
});

test("P15 · Die Capability-Abdeckung zeigt, wie viel tatsaechlich geprueft ist", () => {
  const coverage = Capabilities.coverage(mockCapabilities());
  assert.equal(coverage.declared + coverage.unknown, coverage.total);
  assert.ok(coverage.total > 30);
  assert.ok(coverage.ratio >= 0 && coverage.ratio <= 1);
});

test("P16 · Eine unbekannte Faehigkeit in einer Deklaration ist ein Tippfehler, kein Feature", () => {
  assert.throws(() => Capabilities.declare("x", { publish: { publishHologram: "SUPPORTED" } }),
    /unbekannte Faehigkeit/);
  assert.throws(() => Capabilities.declare("x", { publish: { publishImage: "VIELLEICHT" } }),
    /unbekannter Unterstuetzungsgrad/);
});

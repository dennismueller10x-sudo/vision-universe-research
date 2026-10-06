/* =========================================================================
   VU SOCIAL — DER GESCHLOSSENE KREISLAUF (§2, §25, §53, §54)

   §53 sagt, woran dieser Build gemessen wird: nicht daran, dass Instagram
   verbunden ist, sondern daran, dass eine Architektur existiert, die den
   vollstaendigen Loop traegt —

       SIGNAL -> ENTSCHEIDUNG -> CONTENT -> VEROEFFENTLICHUNG
              -> LEISTUNG -> LERNEN -> NAECHSTE ENTSCHEIDUNG

   — und dass der erste reale Provider ihn durchlaufen kann.

   Diese Datei ist der Nachweis. Sie laeuft gegen den Mock, weil ein Test
   gegen Instagram etwas veroeffentlichen wuerde. Was sie beweist, ist
   trotzdem das Entscheidende: die Contracts passen aneinander, und die
   Rueckkopplung schliesst sich — die Messung des ersten Beitrags
   veraendert nachweisbar die Entscheidung ueber den zweiten.

   Der Kill Switch ist fuer diesen Test geoeffnet. Genau deshalb steht in
   E1 die Gegenprobe: mit der AUSGELIEFERTEN Konfiguration geht nichts
   hinaus.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Signals     = require("../engines/signals.js");
const Opportunity = require("../engines/opportunity.js");
const Strategy    = require("../engines/strategy.js");
const Content     = require("../engines/content.js");
const Memory      = require("../engines/memory.js");
const Fatigue     = require("../engines/fatigue.js");
const Publishing  = require("../engines/publishing.js");
const Analytics   = require("../engines/analytics.js");
const Performance = require("../engines/performance.js");
const Learning    = require("../engines/learning.js");
const Explain     = require("../engines/explain.js");
const Events      = require("../engines/events.js");
const KillSwitch  = require("../engines/kill-switch.js");
const AuditLog    = require("../engines/audit-log.js");
const ProviderCore= require("../engines/provider.js");
const { createMockProvider } = require("../providers/mock/adapter.js");

const NOW = "2026-09-15T12:00:00Z";

const TEST_SWITCH = KillSwitch.fromConfig({
  gates: {
    GLOBAL_AUTOPUBLISH: { enabled: true, reason: "Nur im Test.", changedAt: "2026-09-15" },
    PROVIDER_MOCK: { enabled: true, reason: "Nur im Test.", changedAt: "2026-09-15" }
  }
});

test("E1 · GEGENPROBE: mit der ausgelieferten Konfiguration geht nichts hinaus", () => {
  const shipped = KillSwitch.fromConfig(
    JSON.parse(readFileSync(join(ROOT, "social/config/kill-switch.json"), "utf8")));
  for (const provider of ["meta", "mock", "facebook", "linkedin", "tiktok", "x", "youtube"]) {
    assert.equal(shipped.allows(provider, "publish").allowed, false,
      `${provider} duerfte veroeffentlichen — das ist im ausgelieferten Zustand ein Fehler`);
  }
});

test("E2 · Der vollstaendige Kreislauf laeuft und schliesst sich", async () => {
  /* ---------------------------------------------------- 1. SIGNAL */
  const signalResult = Signals.fromInternalEvent({
    type: "NEW_52W_HIGH", entity: "NVDA", metric: "52-Wochen-Hoch",
    value: "184,20", unit: "USD", observedAt: "2026-09-15T11:00:00Z",
    source: "vu.technical", provider: "tiingo", state: "VERIFIED", strength: 0.85
  }, { now: NOW });
  assert.equal(signalResult.ok, true);

  const events = Events.createLedger();
  assert.equal(events.accept(Events.envelope("TREND_DETECTED",
    { signalId: signalResult.signal.signalId }, { producedBy: "loop-test" })), true);

  /* ----------------------------------------------- 2. GELEGENHEIT */
  const memory = Memory.createMemory([]);
  const opportunityScore = Opportunity.score({
    trendScore: null,                      /* keine externe Trendquelle — ehrlich null */
    vuSignalStrength: signalResult.internal.strength,
    audienceInterest: null,                /* noch keine Publikumsdaten */
    historicalPerformance: null,
    historicalSampleSize: 0,
    platformFit: 0.85,
    hoursSinceTrigger: 1,
    contentGap: 1,
    brandFit: 0.9
  }, {
    /* Hinter einem Quant-Signal steht kein Magazinstueck und kein
       Report: `editorialBasis` ist hier nicht ungemessen, sondern nicht
       anwendbar. Dieselbe Aussage trifft der Zyklus - haette der Test
       sie nicht getroffen, pruefte er einen anderen Fall als den
       produktiven. */
    notApplicable: ["editorialBasis"],
    /* Aus demselben Grund steht hier auch `externalInterest`: der
       Zyklus erklaert es als systemisch unmessbar, solange keine
       externe Quelle angebunden ist. Nicht unanwendbar - unbeantwortet. */
    systemicallyUnavailable: ["externalInterest"]
  });
  assert.equal(opportunityScore.available, true, opportunityScore.explanation);
  assert.equal(opportunityScore.proposable, true);
  /* Was fehlt, wird benannt und nicht kaschiert. */
  assert.ok(opportunityScore.missing.some((m) => m.dimension === "trend"));

  /* ------------------------------------------------- 3. STRATEGIE */
  const strategyDecision = Strategy.decide({
    opportunityId: "opp_loop_1",
    timeSensitivity: signalResult.internal.timeSensitivity,
    hasNumbers: true, platform: "instagram",
    /* Die Praemisse kommt aus dem Signal und nicht aus der Luft: ein
       52-Wochen-Hoch handelt von einer Kennzahl zu einem Wertpapier.
       Ohne diese Angabe passt kein Archetyp — das ist die vorsichtige
       Lesart und beabsichtigt: lieber kein Beitrag als ein falsch
       etikettierter. */
    premise: signalResult.internal.premise,
    hasCause: signalResult.internal.hasCause
  }, { archetypeKnowledge: {}, recentArchetypeUsage: {}, timingKnowledge: null },
     { currentHour: 12 });
  assert.equal(strategyDecision.decidable, true);
  assert.ok(strategyDecision.archetype);

  /* --------------------------------------------------- 4. CONTENT */
  const contentResult = Content.run({
    opportunity: { opportunityId: "opp_loop_1", topic: "NVDA 52-Wochen-Hoch",
                   entities: ["NVDA"], platform: "instagram" },
    sources: [{
      source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: "2026-09-15T11:00:00Z"
    }],
    strategyDecision,
    visualAvailability: { timeSeries: true, keyNumber: true },
    writer: Content.createTemplateWriter()
  }, { now: NOW, timeSensitivity: "TIMELY" });

  assert.equal(contentResult.ok, true, contentResult.explanation);
  const pkg = contentResult.package;
  assert.equal(pkg.validation.factCheck.passed, true);
  assert.equal(pkg.validation.brandCheck.passed, true);

  /* ------------------------------------------------ 5. WIEDERHOLUNG */
  const fatigue = Fatigue.check({
    topic: pkg.topic, entities: ["NVDA"], archetype: pkg.archetype,
    visualType: pkg.visualType, hook: pkg.hook, caption: pkg.caption
  }, memory, { now: NOW });
  assert.equal(fatigue.passed, true, "Der erste Beitrag kann keine Wiederholung sein");

  /* -------------------------------------------- 6. VEROEFFENTLICHUNG */
  const registry = ProviderCore.createRegistry();
  const mock = createMockProvider({ now: () => new Date(NOW) });
  registry.register(mock);
  const auditLog = AuditLog.createLog();
  const orchestrator = Publishing.createOrchestrator({
    registry, killSwitch: TEST_SWITCH, auditLog, now: () => new Date(NOW)
  });

  const intent = orchestrator.intend({
    packageId: pkg.packageId, providerId: "mock", accountId: "mock_account_1",
    autonomyLevel: 4, strategyVersion: strategyDecision.parametersVersion
  });
  orchestrator.transition(intent.publication.publicationId, "DRAFT");
  orchestrator.transition(intent.publication.publicationId, "VALIDATED");
  orchestrator.transition(intent.publication.publicationId, "READY");

  const published = await orchestrator.publish(intent.publication.publicationId,
    { type: "IMAGE", url: "https://example.invalid/chart.jpg", caption: pkg.caption },
    { producedBy: "loop-test" });
  assert.equal(published.ok, true, published.message);
  assert.equal(published.publication.state, "PUBLISHED");
  assert.ok(published.publication.externalPostId);
  assert.equal(mock.__postCount(), 1);

  /* ------------------------------------------------- 7. MESSUNG */
  const raw = await mock.getPostMetrics(published.publication.externalPostId);
  assert.equal(raw.available, true);
  const snapshot = Analytics.snapshot({
    publicationId: published.publication.publicationId,
    providerId: "mock",
    capturedAt: NOW,
    providerMetrics: raw.data.providerMetrics
  }, { now: NOW });
  assert.equal(snapshot.state, "VERIFIED");
  assert.ok(snapshot.metrics.impressions > 0);
  /* Die Originalwerte bleiben erhalten (§17). */
  assert.deepEqual(snapshot.providerMetrics, raw.data.providerMetrics);

  /* ---------------------------------------------- 8. BEWERTUNG */
  /* Ohne Vergleichsbasis gibt es keinen Score — auch hier nicht. */
  const noBaseline = Performance.score(snapshot, Performance.buildBaseline([]), {});
  assert.equal(noBaseline.available, false);

  /* Mit Basis (aus frueheren Beitraegen) schon. */
  const history = [];
  for (let i = 0; i < 8; i++) {
    history.push({ metrics: { reach: 3000 + i * 40, impressions: 4200, likes: 160, comments: 22,
                              shares: 26, saves: 55, engagementRate: 0.065, followersGained: 9,
                              completionRate: null } });
  }
  const baseline = Performance.buildBaseline(history);
  const performance = Performance.score(snapshot, baseline, {
    brandFitScore: pkg.validation.brandCheck.score / 100,
    qualityScore: 0.8, sentiment: 0.75, strategicValue: 0.6
  });
  assert.equal(performance.available, true, performance.explanation);
  assert.ok(performance.score >= 0 && performance.score <= 100);

  /* ------------------------------------------------ 9. GEDAECHTNIS */
  memory.add({
    publicationId: published.publication.publicationId,
    packageId: pkg.packageId, publishedAt: NOW, platform: "instagram",
    topic: pkg.topic, entities: ["NVDA"], archetype: pkg.archetype,
    visualType: pkg.visualType, hook: pkg.hook, caption: pkg.caption,
    performance: performance.score
  });
  assert.equal(memory.size(), 1);

  /* ------------------------------------------------- 10. LERNEN */
  const observations = Learning.observe("archetype",
    [{ value: pkg.archetype, performanceScore: performance.score }], { now: NOW });
  assert.equal(observations[0].sufficient, false,
    "Aus EINEM Beitrag lernt dieses System nichts — das ist der ganze Punkt von §19");
  const update = Learning.proposeStrategyUpdate({ versionId: "v0", parameters: {} },
    observations, { now: NOW });
  assert.equal(update.changed, false);
  assert.match(update.explanation, /keine belastbar/);

  /* ------------------------------ 11. DIE RUECKKOPPLUNG SCHLIESST SICH */
  /* Derselbe Beitrag ein zweites Mal: jetzt greift das Gedaechtnis. */
  const secondFatigue = Fatigue.check({
    topic: pkg.topic, entities: ["NVDA"], archetype: pkg.archetype,
    visualType: pkg.visualType, hook: pkg.hook, caption: pkg.caption
  }, memory, { now: "2026-09-15T18:00:00Z" });
  assert.equal(secondFatigue.passed, false,
    "Die Messung des ersten Beitrags muss die Entscheidung ueber den zweiten aendern — " +
    "genau das ist der geschlossene Kreislauf aus §25");

  /* Und die Gelegenheit selbst faellt: der Content Gap ist geschlossen. */
  const secondOpportunity = Opportunity.score({
    trendScore: null, vuSignalStrength: signalResult.internal.strength,
    audienceInterest: null, historicalPerformance: null, historicalSampleSize: 0,
    platformFit: 0.85, hoursSinceTrigger: 7, contentGap: 0, brandFit: 0.9
  });
  assert.ok(secondOpportunity.score < opportunityScore.score,
    "Ein gerade behandeltes Thema muss schlechter bewertet werden");

  /* ------------------------------------------------ 12. ERKLAERUNG */
  const explanation = Explain.whyThisPost({
    package: pkg, trend: { available: false },
    opportunity: opportunityScore, strategy: strategyDecision,
    fact: pkg.validation.factCheck, brand: pkg.validation.brandCheck,
    fatigue, visual: contentResult.visual
  });
  assert.ok(explanation.sections.some((s) => s.id === "against"));
  assert.ok(explanation.prose.length > 100);

  /* ------------------------------------------------- 13. AUDIT */
  const entries = auditLog.entries();
  assert.ok(entries.some((e) => e.decision === "publication.publish" && e.result === "succeeded"));
  assert.ok(entries.every((e) => e.timestamp && e.decision));
});

test("E3 · Ein zweiter Lauf desselben Zyklus veroeffentlicht nicht erneut", async () => {
  const registry = ProviderCore.createRegistry();
  const mock = createMockProvider({ now: () => new Date(NOW) });
  registry.register(mock);

  let publications = [];
  /* Drei Laeufe, wie sie in einem Workflow hintereinander stattfinden —
     jeder mit frischem Orchestrator, Zustand nur ueber das Artefakt. */
  for (let run = 0; run < 3; run++) {
    const orchestrator = Publishing.createOrchestrator({
      registry, killSwitch: TEST_SWITCH, auditLog: AuditLog.createLog(),
      now: () => new Date(NOW),
      publications: JSON.parse(JSON.stringify(publications))
    });
    const intent = orchestrator.intend({
      packageId: "pkg_stabil", providerId: "mock", accountId: "mock_account_1" });
    if (intent.created) {
      orchestrator.transition(intent.publication.publicationId, "DRAFT");
      orchestrator.transition(intent.publication.publicationId, "VALIDATED");
      orchestrator.transition(intent.publication.publicationId, "READY");
    }
    await orchestrator.publish(intent.publication.publicationId,
      { type: "IMAGE", url: "https://example.invalid/a.jpg", caption: "Text" });
    publications = orchestrator.all();
  }

  assert.equal(mock.__postCount(), 1, "Drei Laeufe, ein Beitrag");
  assert.equal(publications.length, 1);
  assert.equal(publications[0].state, "PUBLISHED");
});

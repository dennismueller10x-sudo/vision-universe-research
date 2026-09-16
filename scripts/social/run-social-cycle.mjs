/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/run-social-cycle.mjs

   DER KREISLAUF ALS EIN LAUF (§2, §54)

     SIGNALE -> GELEGENHEITEN -> STRATEGIE -> CONTENT -> VALIDIERUNG
             -> TERMINIERUNG -> VEROEFFENTLICHUNG -> MESSUNG -> LERNEN

   Dieses Skript ist der Orchestrator aus §39 — kein Agent mit einem
   Mega-Prompt, sondern die Reihenfolge, in der die Engines einander
   ihre Contracts uebergeben.

   -------------------------------------------------------------------------
   WAS ES TUT UND WAS NICHT
   -------------------------------------------------------------------------

   Es VEROEFFENTLICHT NICHTS, solange der Kill Switch aus ist und die
   wirksame Autonomiestufe unter 4 liegt. Beides ist heute der Fall, und
   beides prueft das Skript selbst — nicht der Aufrufer.

   Mit `--provider mock` laeuft der vollstaendige Pfad inklusive
   "Veroeffentlichung" gegen den Mock. Das ist der Nachweis aus §53: der
   Kreislauf traegt, und der erste Provider kann ihn durchlaufen.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     node scripts/social/run-social-cycle.mjs               Trockenlauf
     node scripts/social/run-social-cycle.mjs --provider mock
     node scripts/social/run-social-cycle.mjs --out social/data

   Ohne `--out` wird nichts geschrieben. Ein Lauf, der ungefragt
   Artefakte anlegt, ist im Zweifel der Lauf, der die Produktionsdaten
   ueberschreibt (MASTER §31.10).
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Schema       = require(join(ROOT, "social/engines/schema.js"));
const StrategyMemory = require(join(ROOT, "social/engines/strategy-memory.js"));
const Signals      = require(join(ROOT, "social/engines/signals.js"));
const TrendScore   = require(join(ROOT, "social/engines/trend-score.js"));
const Opportunity  = require(join(ROOT, "social/engines/opportunity.js"));
const Strategy     = require(join(ROOT, "social/engines/strategy.js"));
const Content      = require(join(ROOT, "social/engines/content.js"));
const Memory       = require(join(ROOT, "social/engines/memory.js"));
const Fatigue      = require(join(ROOT, "social/engines/fatigue.js"));
const Publishing   = require(join(ROOT, "social/engines/publishing.js"));
const Analytics    = require(join(ROOT, "social/engines/analytics.js"));
const Performance  = require(join(ROOT, "social/engines/performance.js"));
const Learning     = require(join(ROOT, "social/engines/learning.js"));
const Experiments  = require(join(ROOT, "social/engines/experiments.js"));
const EvidenceRegime = require(join(ROOT, "social/engines/evidence-regime.js"));
const Explain      = require(join(ROOT, "social/engines/explain.js"));
const Health       = require(join(ROOT, "social/engines/health.js"));
const Autonomy     = require(join(ROOT, "social/engines/autonomy.js"));
const KillSwitch   = require(join(ROOT, "social/engines/kill-switch.js"));
const AuditLog     = require(join(ROOT, "social/engines/audit-log.js"));
const ProviderCore = require(join(ROOT, "social/engines/provider.js"));
const Capabilities = require(join(ROOT, "social/engines/capabilities.js"));
const Brand        = require(join(ROOT, "social/engines/brand.js"));

/* ---------------------------------------------------------------- CLI */
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const flag = (name) => argv.includes(name);

const PROVIDER_ID = arg("--provider", null);
const OUT_DIR = arg("--out", null);
const NOW = arg("--now", new Date().toISOString());

/* Woher gelesen wird. Getrennt von --out, weil der Nachweis der
   Kreislauf-Schliessung zwei Laeufe gegen verschiedene Staende
   braucht, ohne die Produktionsdaten anzufassen. */
const DATA_DIR = arg("--data", "social/data");
const D = (name) => join(ROOT, DATA_DIR, name);
const VERBOSE = flag("--verbose");

const log = (...parts) => console.log(...parts);
const detail = (...parts) => { if (VERBOSE) console.log("   ", ...parts); };

/* ------------------------------------------------------ Konfiguration */
function readJson(relativePath, fallback) {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

const killSwitchConfig = readJson("social/config/kill-switch.json", { gates: {} });
const autonomyConfig = readJson("social/config/autonomy.json", { desiredLevel: 0 });
const killSwitch = KillSwitch.fromConfig(killSwitchConfig);
const auditLog = AuditLog.createLog();
const now = () => new Date(NOW);

/* ----------------------------------------------------------- Provider */
function buildRegistry() {
  const registry = ProviderCore.createRegistry();
  if (PROVIDER_ID === "mock") {
    const { createMockProvider } = require(join(ROOT, "social/providers/mock/adapter.js"));
    registry.register(createMockProvider({ now }));
  } else if (PROVIDER_ID === "meta") {
    const Meta = require(join(ROOT, "social/providers/meta/adapter.js"));
    registry.register(Meta.createMetaProvider({
      /* Die Werte kommen aus der Umgebung und werden NIE ausgegeben. */
      appId: process.env[Meta.SECRET_NAMES.appId] || null,
      appSecret: process.env[Meta.SECRET_NAMES.appSecret] || null,
      tokenProvider: () => process.env[Meta.SECRET_NAMES.accessToken] || null,
      now
    }));
  }
  return registry;
}

/* =====================================================================
   STUFE 1 — SIGNALE
   ===================================================================== */

/**
 * Liest interne VU-Ereignisse.
 *
 * HEUTE: aus einer Datei, die ein eigener Lauf erzeugt
 * (scripts/social/collect-vu-signals.mjs). Dieses Skript erfindet keine
 * Ereignisse und liest die VU-Artefakte nicht selbst — die Trennung ist
 * Absicht: ein Lauf, der sammelt UND entscheidet, laesst sich nicht
 * einzeln pruefen.
 */
function loadSignals() {
  const file = D("signals.json");
  if (!existsSync(file)) {
    return { signals: [], internal: {}, reason:
      "Keine Signaldatei vorhanden (social/data/signals.json). " +
      "Erzeugen mit: node scripts/social/collect-vu-signals.mjs --out social/data" };
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const signals = [];
  const internal = {};
  const rejected = [];

  for (const event of raw.events || []) {
    const res = Signals.fromInternalEvent(event, { now: NOW });
    if (!res.ok) { rejected.push({ event: event.type, reason: res.reason }); continue; }
    signals.push(res.signal);
    internal[res.signal.signalId] = res.internal;
  }
  for (const external of raw.externalSignals || []) {
    const res = Signals.fromExternalSignal(external, { now: NOW });
    if (!res.ok) { rejected.push({ event: external.topic, reason: res.reason }); continue; }
    signals.push(res.signal);
  }
  return { signals, internal, rejected, generatedAt: raw.generatedAt || null, reason: null };
}

/* =====================================================================
   STUFE 2 — GELEGENHEITEN
   ===================================================================== */

/**
 * Plattformpassung — eine MESSUNG, keine Schaetzung.
 *
 * Sie fragt den Adapter, was er kann, und das Signal, was es braucht.
 * Ein Beitrag, der ein Diagramm tragen soll, braucht publishImage; ein
 * Provider ohne diese Faehigkeit ist keine Plattform fuer diesen Beitrag.
 *
 * Ohne registrierten Provider gibt es KEINE Zahl — dann ist die Passung
 * unbekannt und nicht "mittel".
 */
function measurePlatformFit(registry, providerId) {
  if (!providerId || !registry.has(providerId)) return null;
  const caps = registry.get(providerId).capabilities;
  /* Die Faehigkeiten, die ein VU-Beitrag im Kern braucht. */
  const needed = ["publishImage", "publishCarousel", "altText"];
  const scores = needed.map((cap) => {
    if (Capabilities.supports(caps, "publish", cap)) return 1;
    if (Capabilities.usable(caps, "publish", cap)) return 0.6;
    if (Capabilities.unknown(caps, "publish", cap)) return null;
    return 0;
  });
  const known = scores.filter((s) => s !== null);
  if (known.length === 0) return null;
  /* Analytics zaehlt mit: eine Plattform, deren Wirkung wir nicht messen
     koennen, passt schlechter zu einem lernenden System. */
  const analytics = Capabilities.supports(caps, "analytics", "postInsights") ? 1
                  : (Capabilities.usable(caps, "analytics", "postInsights") ? 0.6 : 0);
  const publishFit = known.reduce((a, b) => a + b, 0) / known.length;
  return Math.round((0.7 * publishFit + 0.3 * analytics) * 100) / 100;
}

/**
 * Markenpassung auf Themenebene — ebenfalls eine Messung.
 *
 * Sie prueft das THEMA gegen das Markenregister, bevor ein Text
 * existiert. Ein Thema, das sich nur im Casino-Register erzaehlen laesst,
 * soll gar nicht erst in die Content-Pipeline.
 */
function measureBrandFit(topic, entities) {
  const probe = [topic].concat(entities || []).join(" ");
  const check = Brand.check({ hook: "", caption: probe, thesis: "" });
  /* Der Brand-Score ist 0..100 und hier nur so weit belastbar, wie ein
     Thema ohne Text es zulaesst — deshalb gedeckelt, nicht durchgereicht. */
  const blocking = check.blocking.filter((b) => !b.id.startsWith("unfulfilled") &&
                                                b.id !== "hook-without-body");
  if (blocking.length > 0) return 0;
  return Math.min(0.9, check.score / 100);
}

/**
 * Was aus gemessener Leistung ueber Formate bekannt ist.
 *
 * -------------------------------------------------------------------------
 * WARUM NUR GEMESSENE EINTRAEGE ZAEHLEN
 * -------------------------------------------------------------------------
 *
 * Ein Beitrag ohne Leistungsdaten ist fuer diese Frage kein Datenpunkt,
 * sondern eine Leerstelle. Wer ihn mitzaehlt, verwaessert den Mittelwert
 * mit einer Null, die nie gemessen wurde — und erzeugt damit genau die
 * Sorte Zahl, die spaeter als Beleg zitiert wird.
 *
 * Die Stichprobengroesse reist deshalb mit: die Strategie-Engine
 * entscheidet selbst, ab wann sie eine Zahl fuer belastbar haelt
 * (`minimumSampleForExploit`). Diese Funktion urteilt nicht, sie zaehlt.
 */
function buildArchetypeKnowledge(memory) {
  const nach = Object.create(null);

  for (const e of memory.all()) {
    if (!e.archetype) continue;
    const p = e.performance;
    /* `null` heisst ungemessen. Nur eine Zahl ist eine Zahl. */
    if (p === null || p === undefined || !Number.isFinite(Number(p))) continue;
    (nach[e.archetype] = nach[e.archetype] || []).push(Number(p));
  }

  const wissen = Object.create(null);
  for (const [archetype, werte] of Object.entries(nach)) {
    wissen[archetype] = {
      mean: werte.reduce((a, b) => a + b, 0) / werte.length,
      sampleSize: werte.length
    };
  }
  return wissen;
}

function buildOpportunities(signals, internal, memory, registry, providerId) {
  const clusters = Signals.cluster(signals);
  const out = [];

  for (const cluster of clusters) {
    const primary = signals.find((s) => cluster.signalIds.includes(s.signalId));
    const meta = internal[primary.signalId] || {};

    /* Der externe Trend Score. Er darf fehlen — dann traegt die
       Gelegenheit das interne Signal allein (Opportunity: requiresAnyOf). */
    const externalSignal = signals.find(
      (s) => cluster.signalIds.includes(s.signalId) && s.signalClass === "SOCIAL");
    const trend = externalSignal
      ? TrendScore.score(externalSignal, {
          marketRelevance: null, vuRelevance: null, audienceFit: null, brandRisk: null,
          daysSinceOwnCoverage: memory.daysSinceTopic(cluster.topic, NOW),
          ownPostsOnTopic: memory.countTopic(cluster.topic, 14, NOW)
        }, { now: NOW })
      : { available: false, score: null,
          explanation: "Kein externes Social-Signal zu diesem Thema — die Quelle ist nicht angebunden." };

    const comparable = memory.comparablePerformance({ archetype: null, platform: "instagram" });
    const daysSince = memory.daysSinceTopic(cluster.topic, NOW);

    const score = Opportunity.score({
      trendScore: trend.score,
      vuSignalStrength: meta.strength,
      /* Publikumsinteresse braucht Publikumssignale. Die Quelle ist nicht
         angebunden — also null und nicht 0.5 (§45). */
      audienceInterest: null,
      historicalPerformance: comparable.mean === null ? null : comparable.mean / 100,
      historicalSampleSize: comparable.sampleSize,
      platformFit: measurePlatformFit(registry, providerId),
      hoursSinceTrigger: primary.observedAt
        ? (Date.parse(NOW) - Date.parse(primary.observedAt)) / 3600000 : null,
      contentGap: daysSince === null ? 1 : Math.min(1, daysSince / 30),
      brandFit: measureBrandFit(cluster.topic, cluster.entities)
    });

    out.push({
      opportunity: Schema.contentOpportunity({
        opportunityId: "opp_" + cluster.key.toLowerCase().replace(/[^a-z0-9]/g, "") + "_" +
                        String(NOW).slice(0, 10),
        createdAt: NOW,
        topic: cluster.topic,
        entities: cluster.entities,
        signalIds: cluster.signalIds,
        score: score.score,
        components: {},
        timeSensitivity: meta.timeSensitivity || "TIMELY",
        provenance: cluster.provenance,
        explanation: score.explanation
      }),
      score,
      trend,
      internal: meta,
      cluster
    });
  }
  return out;
}

/* =====================================================================
   DER LAUF
   ===================================================================== */

async function main() {
  log("VISION UNIVERSE SOCIAL — Zyklus");
  log("Zeitpunkt:", NOW);
  log("Provider: ", PROVIDER_ID || "(keiner — Trockenlauf)");
  log("");

  const componentStates = {};
  const registry = buildRegistry();

  /* ---------------------------------------------------- 0. Zustand */
  const providerHealth = await registry.healthAll();
  for (const health of providerHealth) {
    const state = health.status === "ok" ? "PASS"
                : health.status === "degraded" ? "WARNING"
                : health.status === "not_configured" ? "UNAVAILABLE" : "FAIL";
    for (const component of ["providers.auth", "providers.publishing",
                             "providers.analytics", "providers.audience"]) {
      componentStates[component] = {
        state, dataSource: health.provider, lastSuccessAt: health.lastSuccessAt,
        failureMode: state === "PASS" ? null : health.message,
        nextAction: health.missing && health.missing.length
          ? "Fehlende Secrets hinterlegen: " + health.missing.join(", ")
          : null
      };
    }
    log("Provider " + health.provider + ": " + health.status +
        (health.missing && health.missing.length ? "  (fehlt: " + health.missing.join(", ") + ")" : ""));
  }
  componentStates.killSwitch = { lastSuccessAt: NOW, dataSource: "social/config/kill-switch.json" };

  /* ---------------------------------------------------- 1. Signale */
  const signalData = loadSignals();
  if (signalData.reason) {
    log("\nSignale: KEINE — " + signalData.reason);
    componentStates["signals.internal"] = { lastSuccessAt: null, failureMode: signalData.reason };
  } else {
    log("\nSignale: " + signalData.signals.length +
        (signalData.rejected.length ? "  (" + signalData.rejected.length + " abgewiesen)" : ""));
    for (const r of signalData.rejected || []) detail("abgewiesen:", r.event, "—", r.reason);
    componentStates["signals.internal"] = {
      lastSuccessAt: signalData.signals.length ? (signalData.generatedAt || NOW) : null,
      dataSource: "social/data/signals.json",
      failureMode: signalData.signals.length ? null : "Die Datei enthaelt keine verwertbaren Ereignisse."
    };
  }
  /* Nicht angebundene Quellen melden sich selbst (§45). */
  for (const id of Object.keys(Signals.PLANNED_SOURCES)) {
    if (!componentStates[id]) {
      const status = Signals.plannedSourceStatus(id);
      componentStates[id] = { state: "UNAVAILABLE", failureMode: status.failureMode,
                              nextAction: status.nextAction };
    }
  }

  /* -------------------------------------------- 2. Gedaechtnis laden */
  const memoryFile = D("content-memory.json");
  const memory = Memory.createMemory(
    existsSync(memoryFile) ? JSON.parse(readFileSync(memoryFile, "utf8")).entries || [] : []);
  log("Gedaechtnis: " + memory.size() + " frueherer Beitrag/Beitraege");

  /* ------------------------------ 2b. Strategie-Gedaechtnis laden

     Bis hierher begann jeder Lauf bei den Startwerten. Was der
     vorherige Lauf gelernt hatte, war weg. Ab jetzt kommt es von der
     Platte — das ist die Stelle, an der aus der Schleife ein Kreis
     wird. */
  const strategyFile = D("strategy-memory.json");
  const strategyMemory = StrategyMemory.createStrategyMemory(
    existsSync(strategyFile) ? JSON.parse(readFileSync(strategyFile, "utf8")) : null,
    { now: NOW });
  const activeStrategy = strategyMemory.current();
  log("Strategie:   " + activeStrategy.versionId + " (Kette: " + strategyMemory.size() +
      ", Beobachtungen: " + strategyMemory.observations().length + ")");

  /* Was aus gemessener Leistung ueber Formate bekannt ist. Bis eben
     stand hier eine leere Menge — und damit konnte keine Messung je
     eine Entscheidung erreichen. */
  const archetypeKnowledge = buildArchetypeKnowledge(memory);
  const gemessen = Object.keys(archetypeKnowledge).length;
  log("Formatwissen: " + (gemessen
    ? gemessen + " Format(e) mit gemessener Leistung"
    : "keines — noch kein Beitrag mit Leistungsdaten"));

  /* ------------------------------------------------ 3. Gelegenheiten */
  const candidates = buildOpportunities(signalData.signals, signalData.internal, memory,
                                        registry, PROVIDER_ID || "mock");
  const proposable = candidates.filter((c) => c.score.proposable);
  log("\nGelegenheiten: " + candidates.length + " geprueft, " + proposable.length + " vorschlagsfaehig");
  for (const c of candidates) detail(c.opportunity.topic, "—", c.score.explanation);

  componentStates["intelligence.trend"] = {
    state: candidates.some((c) => c.trend.available) ? "PASS" : "UNAVAILABLE",
    failureMode: candidates.some((c) => c.trend.available) ? null
      : "Keine externe Trendquelle angebunden; der Trend Score enthaelt sich (§45).",
    lastSuccessAt: candidates.some((c) => c.trend.available) ? NOW : null
  };
  componentStates["intelligence.opportunity"] = {
    lastSuccessAt: candidates.length ? NOW : null,
    failureMode: candidates.length ? null : "Keine Signale, also keine Gelegenheiten."
  };

  /* --------------------------------------- 4. Strategie und Content */
  const packages = [];
  const rejections = [];

  for (const candidate of Opportunity.prioritize(
      proposable.map((c) => Object.assign({}, c.score, { topic: c.opportunity.topic, ref: c })),
      { limit: 5, maxPerTopic: 1 })) {
    const c = candidate.ref;
    const opportunity = c.opportunity;

    const strategyDecision = Strategy.decide({
      opportunityId: opportunity.opportunityId,
      timeSensitivity: opportunity.timeSensitivity,
      hasNumbers: c.internal.hasNumbers === true,
      platform: "instagram"
    }, {
      /* DER RUECKKANAL. Hier stand eine leere Menge — deshalb konnte
         keine Messung je eine Entscheidung erreichen, egal wie viel
         gemessen wurde. */
      archetypeKnowledge,
      recentArchetypeUsage: memory.distribution("archetype", 30, NOW),
      timingKnowledge: null
    }, {
      currentHour: new Date(NOW).getUTCHours(),
      /* Und hier die gelernten Parameter. Ohne sie waere die
         Versionskette ein Archiv ohne Wirkung. */
      parameters: activeStrategy.parameters || {}
    });

    if (!strategyDecision.decidable) {
      rejections.push({ topic: opportunity.topic, stage: "STRATEGY", reason: strategyDecision.explanation });
      continue;
    }

    const sources = opportunity.provenance.map((p) => ({
      source: p.source, provider: p.provider, entity: p.entity, metric: p.metric,
      value: p.value, unit: p.unit, state: p.state, observedAt: p.observedAt
    }));

    const result = Content.run({
      opportunity, sources, strategyDecision,
      visualAvailability: { timeSeries: false, keyNumber: sources.some((s) => s.value !== null) },
      recentVisuals: Object.keys(memory.distribution("visualType", 14, NOW)),
      writer: Content.createTemplateWriter()
    }, { now: NOW, timeSensitivity: opportunity.timeSensitivity });

    if (!result.ok) {
      rejections.push({ topic: opportunity.topic, stage: result.failedStage, reason: result.explanation });
      continue;
    }

    /* Die Wiederholungssperre laeuft NACH der Pipeline: sie braucht den
       fertigen Text, um Aehnlichkeit zu messen. */
    const fatigue = Fatigue.check({
      topic: result.package.topic, entities: opportunity.entities,
      archetype: result.package.archetype, visualType: result.package.visualType,
      hook: result.package.hook, caption: result.package.caption
    }, memory, { now: NOW });

    if (!fatigue.passed) {
      rejections.push({ topic: opportunity.topic, stage: "FATIGUE", reason: fatigue.explanation });
      continue;
    }
    result.package.validation.fatigueCheck = { passed: true, explanation: fatigue.explanation };

    packages.push({ candidate: c, strategyDecision, result, fatigue });
  }

  log("\nContent: " + packages.length + " Paket(e) erzeugt, " + rejections.length + " verworfen");
  for (const r of rejections) log("   verworfen [" + r.stage + "] " + r.topic + ": " + r.reason);

  componentStates["content.pipeline"] = {
    lastSuccessAt: packages.length ? NOW : null,
    failureMode: packages.length ? null
      : (candidates.length ? "Alle Kandidaten sind an einer Pruefstufe gescheitert." : "Keine Kandidaten.")
  };
  componentStates["content.validation"] = {
    lastSuccessAt: packages.length ? NOW : null,
    failureMode: packages.length ? null : "Keine Pakete zu pruefen."
  };
  componentStates.scheduler = { lastSuccessAt: packages.length ? NOW : null,
    failureMode: packages.length ? null : "Nichts zu terminieren." };
  componentStates.queue = { lastSuccessAt: NOW };

  /* ------------------------------------------ 5. Autonomie und Gate */
  const matrix = Health.buildMatrix(componentStates, { now: NOW });
  const readiness = Health.toAutonomyReadiness(matrix, {
    rollbackPresent: true,      /* learning.rollback() ist implementiert und getestet */
    learningValidated: false,
    experimentsValidated: false
  });
  const autonomy = Autonomy.effectiveLevel(autonomyConfig.desiredLevel || 0, readiness);

  log("\nSystemzustand: " + matrix.overall);
  log("Autonomie:     " + autonomy.explanation);

  /* ------------------------------------------ 6. Veroeffentlichung */
  const publicationsFile = D("publications.json");
  const orchestrator = Publishing.createOrchestrator({
    registry, killSwitch, auditLog, now,
    publications: existsSync(publicationsFile)
      ? JSON.parse(readFileSync(publicationsFile, "utf8")).publications || [] : []
  });

  const published = [];
  for (const entry of packages) {
    const pkg = entry.result.package;
    const providerId = PROVIDER_ID || "mock";
    const accountId = providerId === "mock" ? "mock_account_1"
                    : (process.env.META_IG_ACCOUNT_ID ? "meta:" + process.env.META_IG_ACCOUNT_ID : null);

    if (!accountId) {
      log("   " + pkg.topic + ": kein Zielkonto — es wird nichts veroeffentlicht.");
      continue;
    }

    const intent = orchestrator.intend({
      packageId: pkg.packageId, providerId, accountId,
      scheduledFor: null, autonomyLevel: autonomy.effective,
      strategyVersion: entry.strategyDecision.parametersVersion
    });
    if (!intent.created) {
      log("   " + pkg.topic + ": bereits geplant (" + intent.reason + ")");
      continue;
    }
    orchestrator.transition(intent.publication.publicationId, "DRAFT");
    orchestrator.transition(intent.publication.publicationId, "VALIDATED");
    orchestrator.transition(intent.publication.publicationId, "READY");

    const gate = killSwitch.allows(providerId, "publish");
    const mayPublish = gate.allowed && Autonomy.allowsUnattendedPublish(autonomy.effective);

    if (!mayPublish) {
      log("   " + pkg.topic + ": bleibt in READY — " +
          (!gate.allowed ? gate.reason : "Autonomiestufe " + autonomy.effective + " genuegt nicht."));
      auditLog.record({
        decision: "cycle.hold", inputs: [pkg.packageId], provider: providerId, result: "blocked",
        autonomyLevel: autonomy.effective,
        reason: !gate.allowed ? gate.reason : "Autonomiestufe zu niedrig fuer unbeaufsichtigtes Posten."
      });
      continue;
    }

    const media = { type: "IMAGE", url: pkg.assets[0] || "https://example.invalid/platzhalter.jpg",
                    caption: pkg.caption };
    const res = await orchestrator.publish(intent.publication.publicationId, media,
      { producedBy: "run-social-cycle" });
    log("   " + pkg.topic + ": " + (res.ok ? "veroeffentlicht" : "fehlgeschlagen — " + res.message));
    if (res.ok) published.push({ publication: res.publication, package: pkg });
  }

  /* ------------------------------------------------ 7. Erklaerungen */
  log("\n--- WARUM DIESE BEITRAEGE ---");
  for (const entry of packages) {
    const explanation = Explain.whyThisPost({
      package: entry.result.package,
      trend: entry.candidate.trend,
      opportunity: entry.candidate.score,
      strategy: entry.strategyDecision,
      fact: entry.result.package.validation.factCheck,
      brand: entry.result.package.validation.brandCheck,
      fatigue: entry.fatigue,
      visual: entry.result.visual,
      autonomy,
      killSwitch: killSwitch.allows(PROVIDER_ID || "mock", "publish")
    });
    log("\n" + entry.result.package.topic);
    log("  " + explanation.summary);
    for (const section of explanation.sections) log("  " + section.title + ": " + section.text);
  }

  /* ================================================================
     8. MESSEN  —  der Rueckweg beginnt

     Bis hierher lief der Kreislauf vorwaerts und haette das auch
     getan, wenn nie etwas gemessen worden waere. Ab hier kommen
     Zahlen ins Spiel, die tatsaechlich erhoben wurden.
     ================================================================ */
  const perfFile = D("performance.json");
  const perfData = existsSync(perfFile)
    ? JSON.parse(readFileSync(perfFile, "utf8")) : null;

  const alleZeilen = perfData ? (perfData.snapshots || []) : [];
  const snapshots = alleZeilen.map((z) => z.snapshot)
    .filter((x) => x && x.state !== "UNAVAILABLE");

  /* Welche Zieldimensionen die Datenlage HEUTE traegt — je Medientyp.
     Ein Reel gegen Reels, ein Bild gegen Bilder: ein gemeinsamer Median
     waere eine Zahl, die keinen von beiden beschreibt. */
  const befund = EvidenceRegime.assess(alleZeilen, { now: NOW });

  log("\n--- MESSEN ---");
  if (!perfData) {
    log("Keine Leistungsdaten (social/data/performance.json fehlt).");
    log("Der Kreislauf laeuft vorwaerts, aber er kommt nicht zurueck.");
  } else {
    log("Gemessene Beitraege: " + snapshots.length + " von " + (perfData.requested || 0));
    log("Evidenzregime:       " + befund.regime + "  (Stichprobe " + befund.sampleSize +
        (befund.unusable ? ", " + befund.unusable + " nicht messbar" : "") + ")");
    for (const [kohorte, k] of Object.entries(befund.cohorts)) {
      log("  " + kohorte.padEnd(9) + k.regime.padEnd(10) + "n=" + String(k.sampleSize).padEnd(4) +
          "aktiv: " + (k.activeDimensions.join(", ") || "(keine)"));
      for (const e of k.excludedDimensions) detail("  aus:", e.dimension, "[" + e.state + "]", e.reason);
    }
  }

  /* Gemessene Leistung an die Gedaechtniseintraege heften. Zuordnung
     ueber die Plattformkennung — sie ist die einzige Klammer zwischen
     einem Beitrag und seinen Zahlen.

     Bewertet wird mit der Methodik SEINER Kohorte. Und jede Bewertung
     traegt ihr Regime mit sich: ein Wert aus BOOTSTRAP ist nicht mit
     einem aus MATURE vergleichbar, das sind verschiedene Groessen mit
     demselben Namen. */
  let zugeordnet = 0;
  let bewertet = 0;
  for (const z of alleZeilen) {
    const treffer = memory.all().filter((e) => e.externalPostId === z.mediaId);
    if (!treffer.length) continue;

    const kohorte = EvidenceRegime.cohortFor(z);
    const k = befund.cohorts[kohorte];
    const bewertung = k
      ? Performance.score(z.snapshot, k.baseline, z.context || {}, { methodology: k.methodology })
      : { available: false, explanation: "Keine Kohorte fuer diesen Medientyp." };

    for (const e of treffer) {
      e.performance = bewertung.available ? bewertung.score : null;
      e.performanceRegime = k ? k.regime : null;
      e.performanceCohort = kohorte;
      e.performanceProvenance = {
        source: "instagram.graph", snapshotId: z.snapshot.snapshotId,
        state: z.snapshot.state, scored: bewertung.available,
        regime: k ? k.regime : null,
        methodologyVersion: k ? k.methodology.version : null,
        activeDimensions: k ? k.activeDimensions.slice() : [],
        reason: bewertung.available ? null : bewertung.explanation
      };
      zugeordnet += 1;
      if (bewertung.available) bewertet += 1;
    }
  }
  if (perfData) {
    log("Zugeordnet:          " + zugeordnet + " Gedaechtniseintrag/-eintraege, " +
        bewertet + " bewertet");
  }

  /* ================================================================
     9. LERNEN  —  aus Zahlen werden Beobachtungen

     Eine Beobachtung ist noch keine Erkenntnis. Sie traegt ihre
     Stichprobengroesse und ihr Konfidenzintervall mit sich, und die
     Learning Engine entscheidet, ob daraus etwas folgen darf.
     ================================================================ */
  log("\n--- LERNEN ---");
  /* NUR innerhalb eines Regimes vergleichen. Ein Score aus BOOTSTRAP und
     einer aus MATURE messen verschiedene Dinge; sie in einen Mittelwert
     zu werfen, erzeugt eine Zahl, die nichts beschreibt — und die wie
     eine Verbesserung aussaehe, sobald das Regime wechselt. */
  const aktivesRegime = befund.regime;
  const alleBewerteten = memory.all()
    .filter((e) => e.performance !== null && e.performance !== undefined);
  const andereRegime = alleBewerteten.filter((e) =>
    e.performanceRegime && e.performanceRegime !== aktivesRegime).length;

  const lernzeilen = alleBewerteten
    .filter((e) => !e.performanceRegime || e.performanceRegime === aktivesRegime)
    .map((e) => ({ archetype: e.archetype, visualType: e.visualType,
                   performanceScore: e.performance }));

  const beobachtungen = [];
  for (const dimension of ["archetype", "visualType"]) {
    const zeilen = lernzeilen.map((r) => ({ value: r[dimension], performanceScore: r.performanceScore }));
    /* observe() liefert die Beobachtungen direkt als Liste und in
       kanonischer Form — samt observationId. Sie hier neu zu bauen
       haette die Kennung ueberschrieben, und damit haette dieselbe
       Beobachtung bei jedem Lauf als neu gegolten. */
    for (const o of Learning.observe(dimension, zeilen, {}) || []) {
      beobachtungen.push(Schema.learningObservation(o));
    }
  }

  /* Den Massstab festhalten, bevor die Beobachtungen entstehen. Eine
     Beobachtung ohne bekanntes Regime laesst sich spaeter nicht
     einordnen. */
  const regimeEintrag = strategyMemory.recordEvidence(befund.record);
  if (regimeEintrag.changed) log("Evidenzregime festgehalten: " + regimeEintrag.reason);

  const neueBeobachtungen = strategyMemory.recordObservations(beobachtungen);
  log("Gemessen:       " + snapshots.length + " Beitrag/Beitraege");
  log("Bewertbar:      " + lernzeilen.length + " (Regime " + aktivesRegime + ")");
  if (andereRegime) {
    log("                " + andereRegime + " aus einem anderen Regime bleiben draussen — " +
        "verschiedene Groessen mit demselben Namen.");
  }
  if (snapshots.length && !lernzeilen.length) {
    /* Den GRUND nennen und nicht den naechstliegenden raten. Eine
       fehlende Vergleichsbasis und zu duenn belegte Kennzahlen sehen im
       Ergebnis gleich aus und verlangen voellig verschiedene
       Antworten. */
    log("                gemessen, aber nicht bewertbar — das ist etwas anderes als ungemessen.");
    /* Den Grund je Kohorte nennen, nicht einen fuer alle: eine Kohorte
       kann an der Vergleichsbasis scheitern und die andere an der
       Abdeckung, und die beiden verlangen verschiedene Antworten. */
    for (const [kohorte, k] of Object.entries(befund.cohorts)) {
      const beispiel = (alleZeilen.filter((z) => EvidenceRegime.cohortFor(z) === kohorte &&
        z.snapshot && z.snapshot.state !== "UNAVAILABLE")[0] || {}).snapshot;
      const warum = beispiel
        ? Performance.score(beispiel, k.baseline, {}, { methodology: k.methodology })
        : null;
      log("                " + kohorte + ": " +
          ((warum && warum.explanation) || k.baseline.reason));
    }
  }
  log("Beobachtungen:  " + beobachtungen.length + " (davon neu: " + neueBeobachtungen + ")");
  for (const o of beobachtungen) {
    detail(o.dimension + "=" + o.value + ": n=" + o.sampleSize +
           (o.sufficient ? "  BELASTBAR" : "  nicht belastbar") + " — " + o.note);
  }
  if (!beobachtungen.length) {
    log("Keine Beobachtung moeglich — es gibt noch keine gemessenen Beitraege.");
  }

  /* ================================================================
     9b. EXPERIMENTIEREN  —  Erkundung mit einer Frage

     Erkundung ohne Hypothese ist Variation: man aendert etwas, sieht
     eine Zahl und weiss hinterher nicht, woran es lag. Ein Experiment
     legt die Frage VOR dem Ergebnis fest — eine Variable, eine
     Kontrolle, eine Stichprobe, die nicht nachtraeglich waechst, bis
     das Ergebnis gefaellt.

     Angelegt wird nur, wenn die Datenlage duenn ist. Wo bereits
     belastbares Wissen liegt, waere ein Experiment die teure Art,
     Bekanntes zu bestaetigen.
     ================================================================ */
  const expFile = D("experiments.json");
  const experiments = existsSync(expFile)
    ? (JSON.parse(readFileSync(expFile, "utf8")).experiments || []) : [];

  log("\n--- EXPERIMENTIEREN ---");

  /* Gemessene Ergebnisse in die Arme laufender Experimente eintragen.
     Zuerst — sonst entscheidet unten ein Experiment ueber Daten, die
     der Lauf gerade selbst mitgebracht hat. */
  let eingetragen = 0;
  for (const exp of experiments) {
    if (exp.state === "DECIDED" || exp.state === "ABANDONED") continue;
    for (const e of memory.all()) {
      if (e.performance === null || e.performance === undefined) continue;
      const wert = e[exp.variable];
      if (wert === undefined || wert === null) continue;
      const arm = String(wert) === exp.control ? "control"
                : String(wert) === exp.variant ? "variant" : null;
      if (!arm) continue;
      /* Derselbe Beitrag darf nicht zweimal zaehlen. */
      const kennung = e.publicationId || e.packageId;
      exp._gezaehlt = exp._gezaehlt || [];
      if (exp._gezaehlt.includes(kennung)) continue;
      exp._gezaehlt.push(kennung);
      Experiments.record(exp, arm, e.performance);
      eingetragen += 1;
    }
  }

  /* Auswerten, was reif ist. */
  const entschieden = [];
  for (const exp of experiments) {
    if (exp.state === "DECIDED" || exp.state === "ABANDONED") continue;
    const res = Experiments.evaluate(exp, {});
    if (res.decided) {
      exp.state = "DECIDED";
      exp.decision = res;
      entschieden.push({ experimentId: exp.experimentId, hypothesis: exp.hypothesis,
                         explanation: res.explanation });
    }
  }

  /* Neue Experimente nur bei duenner Datenlage. */
  const offeneVariablen = experiments
    .filter((e) => e.state !== "DECIDED" && e.state !== "ABANDONED")
    .map((e) => e.variable);

  for (const entry of packages) {
    const d = entry.strategyDecision;
    if (d.mode !== "EXPLORE") continue;
    if (offeneVariablen.includes("archetype")) break;

    const gewaehlt = entry.result.package.archetype;
    const kandidaten = (d.archetypeCandidates || [])
      .filter((c) => c.archetype !== gewaehlt);
    if (!kandidaten.length) break;
    const kontrolle = kandidaten.sort((a, b) => b.sampleSize - a.sampleSize)[0].archetype;

    const res = Experiments.declare({
      hypothesis: "Der Archetyp " + gewaehlt + " erreicht eine hoehere Leistung als " +
        kontrolle + " bei vergleichbaren Anlaessen.",
      variable: "archetype",
      control: kontrolle,
      variant: gewaehlt,
      plannedSamplePerArm: 8
    }, { now: NOW });

    if (res.ok) {
      experiments.push(res.experiment);
      offeneVariablen.push("archetype");
      log("Neu angelegt: " + res.explanation);
    } else {
      detail("nicht angenommen:", res.explanation);
    }
    break;
  }

  const laufend = experiments.filter((e) => e.state !== "DECIDED" && e.state !== "ABANDONED");
  log("Laufend: " + laufend.length + " | Ergebnisse eingetragen: " + eingetragen +
      " | entschieden: " + entschieden.length);
  for (const e of laufend) {
    detail(e.variable + ": " + e.variant + " gegen " + e.control +
      "  (" + e.observations.control.length + "/" + e.plannedSamplePerArm + " Kontrolle, " +
      e.observations.variant.length + "/" + e.plannedSamplePerArm + " Variante)");
  }
  for (const e of entschieden) detail("entschieden:", e.explanation);
  /* Der interne Zaehler gehoert nicht ins Artefakt. */
  for (const e of experiments) delete e._gezaehlt;

  /* ================================================================
     10. ANPASSEN  —  und zwar nur, wenn die Evidenz es traegt

     Der haeufigste Ausgang ist "keine Aenderung". Das ist kein
     Fehler, sondern das Verhalten, das kleine Stichproben verdienen.
     ================================================================ */
  log("\n--- ANPASSEN ---");
  const vorschlag = Learning.proposeStrategyUpdate(
    activeStrategy, strategyMemory.observations(), {});
  const uebernahme = strategyMemory.apply(vorschlag, { now: NOW });

  log("Strategie vorher:  " + activeStrategy.versionId);
  log("Strategie nachher: " + strategyMemory.current().versionId +
      (uebernahme.committed ? "  (NEUE VERSION)" : "  (unveraendert)"));
  log(uebernahme.reason || vorschlag.explanation || "");
  for (const b of vorschlag.blocked || []) detail("blockiert:", b.reason);

  /* ================================================================
     11. DIE SCHATTEN-ENTSCHEIDUNG

     Der Loop soll beweisen, dass er entscheiden KANN, ohne zu
     veroeffentlichen. Jedes Paket bekommt deshalb einen Eintrag:
     "Ich wuerde Thema X mit Hook Y als Format Z um T veroeffentlichen."

     Er geht ins Gedaechtnis mit `performance: null` — ungemessen, weil
     ungesendet. Das ist wichtiger, als es klingt: eine Schatten-
     Entscheidung, die als Null in die Formatstatistik einginge, wuerde
     das System glauben lassen, das Format habe versagt.
     ================================================================ */
  const shadowDecisions = packages.map((entry) => {
    const pkg = entry.result.package;
    const d = entry.strategyDecision;
    return {
      decidedAt: NOW,
      packageId: pkg.packageId,
      topic: pkg.topic,
      archetype: pkg.archetype,
      visualType: pkg.visualType,
      hook: pkg.hook,
      plannedHourUtc: d.timingHour,
      mode: d.mode,
      modeReason: d.modeReason,
      strategyVersion: activeStrategy.versionId,
      wouldPublish: true,
      published: false,
      withheldBecause: "Shadow-Modus: GLOBAL_AUTOPUBLISH ist aus. " +
        "Der Loop entscheidet, er sendet nicht."
    };
  });

  for (const d of shadowDecisions) {
    const pkg = packages.find((e) => e.result.package.packageId === d.packageId).result.package;
    memory.add({
      publicationId: null, packageId: pkg.packageId, publishedAt: null,
      platform: "instagram", topic: pkg.topic, entities: pkg.entities || [],
      archetype: pkg.archetype, visualType: pkg.visualType,
      hook: pkg.hook, caption: pkg.caption, cta: pkg.cta || null,
      /* Ungemessen, weil ungesendet. Nicht 0. */
      performance: null,
      lineage: {
        origin: "SHADOW_CYCLE",
        signalIds: pkg.signalIds || [],
        opportunityId: pkg.opportunityId || null,
        strategyVersion: activeStrategy.versionId,
        decidedMode: d.mode
      }
    });
  }
  log("\nSchatten-Entscheidungen: " + shadowDecisions.length +
      " (entschieden, nicht gesendet)");

  /* ---------------------------------------------------- 8. Artefakte */
  const report = {
    generatedAt: NOW,
    provider: PROVIDER_ID,
    health: matrix,
    autonomy,
    signals: signalData.signals.length,
    opportunities: candidates.map((c) => ({
      opportunityId: c.opportunity.opportunityId, topic: c.opportunity.topic,
      score: c.score.score, proposable: c.score.proposable, explanation: c.score.explanation
    })),
    packages: packages.map((p) => ({
      packageId: p.result.package.packageId, topic: p.result.package.topic,
      archetype: p.result.package.archetype, visualType: p.result.package.visualType,
      hook: p.result.package.hook
    })),
    rejections,
    published: published.map((p) => ({
      publicationId: p.publication.publicationId, state: p.publication.state,
      externalPostId: p.publication.externalPostId
    })),
    auditEntries: auditLog.size(),

    /* Der Rueckweg im Bericht. Ohne diese Felder liesse sich von aussen
       nicht unterscheiden, ob der Loop geschlossen ist oder nur schnell
       vorwaerts laeuft. */
    learning: {
      /* Drei verschiedene Zahlen, die leicht zu einer verschmelzen —
         und dann ist "nichts gemessen" nicht mehr von "gemessen, aber
         noch nicht bewertbar" zu unterscheiden. Genau diese Verwechslung
         laesst spaeter jemanden nach einem Fehler suchen, wo eine
         Stichprobe einfach zu klein ist. */
      measuredPosts: snapshots.length,
      /* Die Vergleichsbasis gibt es jetzt je Kohorte. "Reicht sie" ist
         damit keine einzelne Wahrheit mehr — und so steht es auch da. */
      baselineSufficient: Object.values(befund.cohorts).length > 0 &&
        Object.values(befund.cohorts).every((k) => k.baseline.sufficient),
      baselineReason: Object.entries(befund.cohorts)
        .map(([c, k]) => c + ": " + k.baseline.reason).join(" | ") || "Keine Kohorte.",
      evidenceRegime: befund.regime,
      evidenceRecord: befund.record,
      regimeChanged: regimeEintrag.changed === true,
      regimeReason: regimeEintrag.reason,
      crossRegimeExcluded: andereRegime,
      scoreablePosts: lernzeilen.length,
      dataPoints: lernzeilen.length,
      evidenceState: snapshots.length === 0
        ? "NICHTS_GEMESSEN"
        : (lernzeilen.length === 0 ? "GEMESSEN_NICHT_BEWERTBAR" : "BEWERTBAR"),
      observations: beobachtungen.map((o) => ({
        dimension: o.dimension, value: o.value, sampleSize: o.sampleSize,
        sufficient: o.sufficient, note: o.note
      })),
      strategyBefore: activeStrategy.versionId,
      strategyAfter: strategyMemory.current().versionId,
      strategyChanged: uebernahme.committed === true,
      strategyReason: uebernahme.reason || vorschlag.explanation || null,
      archetypeKnowledge
    },
    experiments: {
      running: laufend.length,
      recorded: eingetragen,
      decided: entschieden,
      open: laufend.map((e) => ({ experimentId: e.experimentId, variable: e.variable,
        hypothesis: e.hypothesis, control: e.control, variant: e.variant,
        counts: { control: e.observations.control.length, variant: e.observations.variant.length },
        needed: e.plannedSamplePerArm }))
    },
    shadowDecisions
  };

  if (OUT_DIR) {
    const dir = join(ROOT, OUT_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cycle-report.json"), JSON.stringify(report, null, 2) + "\n");
    writeFileSync(join(dir, "publications.json"),
      JSON.stringify({ generatedAt: NOW, publications: orchestrator.all() }, null, 2) + "\n");
    writeFileSync(join(dir, "audit-log.json"),
      JSON.stringify({ generatedAt: NOW, entries: auditLog.entries() }, null, 2) + "\n");
    writeFileSync(join(dir, "health.json"), JSON.stringify(matrix, null, 2) + "\n");

    /* Das Gedaechtnis und die Strategiekette. Ohne diese zwei Zeilen
       beginnt der naechste Lauf wieder von vorn — und der Kreislauf
       waere eine Schleife, die sich nur schnell dreht. */
    writeFileSync(join(dir, "content-memory.json"),
      JSON.stringify({ generatedAt: NOW, entries: memory.all() }, null, 2) + "\n");
    writeFileSync(join(dir, "strategy-memory.json"),
      JSON.stringify(strategyMemory.snapshot({ now: NOW }), null, 2) + "\n");
    writeFileSync(join(dir, "experiments.json"),
      JSON.stringify({ generatedAt: NOW, experiments }, null, 2) + "\n");
    writeFileSync(join(dir, "shadow-decisions.json"),
      JSON.stringify({ generatedAt: NOW, strategyVersion: activeStrategy.versionId,
        decisions: shadowDecisions }, null, 2) + "\n");
    log("\nGeschrieben nach " + OUT_DIR + "/");
  } else {
    log("\n(Kein --out: es wurde nichts geschrieben.)");
  }

  log("\nZusammenfassung: " + report.signals + " Signale, " + report.opportunities.length +
      " Gelegenheiten, " + report.packages.length + " Pakete, " + report.published.length +
      " veroeffentlicht, Systemzustand " + matrix.overall + ", Autonomie " + autonomy.effective + ".");
}

main().catch((err) => {
  /* Ein Fehler hier ist ein Baufehler, kein Betriebszustand — er soll
     den Lauf rot machen. Die Meldung wird gekuerzt, damit ein Stacktrace
     keine Umgebungswerte mitschleppt. */
  console.error("Zyklus abgebrochen:", String(err && err.message).slice(0, 400));
  process.exitCode = 1;
});

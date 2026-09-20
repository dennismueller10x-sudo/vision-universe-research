/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/rank-social-opportunities.mjs

   DER BEWEIS: EIN QUANT-SIGNAL GEWINNT NICHT MEHR AUTOMATISCH

   Dieser Lauf erzeugt keinen Beitrag, keinen Kandidaten und keine
   Work-Ausfuehrung. Er laesst Themen aus mehreren Content Families
   gegeneinander antreten und zeigt, was dabei herauskommt.

   Gemessen wird nur, was real vorliegt. Was fehlt, bleibt UNAVAILABLE
   und wird als solches ausgewiesen - eine erfundene Zahl waere hier
   besonders teuer, weil die Rangfolge auf ihr beruhte.

   Ausfuehren:
     node scripts/social/rank-social-opportunities.mjs
     node scripts/social/rank-social-opportunities.mjs --out social/data
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { baueSlate } from "./build-opportunity-slate.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Opportunity = require(join(ROOT, "social/engines/opportunity.js"));
const Social = require(join(ROOT, "social/engines/social-opportunity.js"));
const Brand = require(join(ROOT, "social/engines/brand.js"));
const Audience = require(join(ROOT, "social/engines/audience-frame.js"));
const Memory = require(join(ROOT, "social/engines/memory.js"));
const Registry = require(join(ROOT, "social/engines/source-registry.js"));
const OwnPerf = require(join(ROOT, "social/engines/own-performance.js"));
const Learning = require(join(ROOT, "social/engines/learning.js"));

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

const NAMEN = readJson(join(ROOT, "discover/config/company-names.json"), { names: {} }).names || {};

/* -------------------------------------------------------------------
   WAS SICH WIRKLICH MESSEN LAESST

   Jede Dimension hier kommt aus einer Datei im Repository. Keine
   Schaetzung, kein Vorgabewert, kein "0.5, damit das Feld gefuellt
   aussieht".
   ------------------------------------------------------------------- */
function messe(topic, kontext) {
  const m = {};

  /* Markenpassung: aus brand.js, derselben Rechnung wie im Zyklus. */
  m.brandFit = Brand.topicFit(topic.title || "", topic.entities);

  /* Luecke im eigenen Bestand: wann wurde diese Familie zuletzt
     behandelt? Ohne Historie ist die Luecke maximal - das ist gemessen
     und nicht geschaetzt. */
  const zuletzt = kontext.history.filter((h) => h.family === topic.family);
  m.contentGap = zuletzt.length === 0 ? 1
    : Math.min(1, (Date.parse(kontext.now) - Date.parse(zuletzt[0].at)) / (30 * 86400000));

  /* Aktualitaet des Anlasses: aus dem Stand der Quelldatei. */
  m.hoursSinceTrigger = topic.asOf
    ? (Date.parse(kontext.now) - Date.parse(topic.asOf)) / 3600000 : null;

  /* Plattformpassung braucht einen angebundenen Provider. Keiner da,
     also null - nicht 0 und nicht 0.5. */
  m.platformFit = kontext.providerConfigured ? kontext.platformFit : null;

  /* Der gemessene Anlass eines Quant-Themas. Kein Trend-Provider
     angebunden, also bleibt trendScore null - das VU-Signal aber ist
     real gemessen und steht im Ereignis. */
  m.vuSignalStrength = typeof topic.signalStrength === "number"
    ? topic.signalStrength : null;
  m.trendScore = null;

  /* -------------------------------------------------------------------
     DIESER KOMMENTAR STIMMTE EINMAL

     Hier stand: "brauchen Daten, die es erst nach dem ersten
     veroeffentlichten Beitrag gibt". Es GIBT sie inzwischen - 25
     gemessene Bestandsbeitraege liegen im Gedaechtnis. Die Null war
     keine Messung mehr, sondern eine veraltete Annahme, die sich als
     Messung ausgab.

     Gerechnet wird mit derselben Engine wie im Zyklus. Zwei Rechenwege
     waeren zwei Wahrheiten. */
  const vergleichbar = kontext.memory
    ? kontext.memory.comparablePerformance({ archetype: null, platform: "instagram" })
    : { sampleSize: 0, mean: null };
  m.historicalPerformance = vergleichbar.mean === null ? null : vergleichbar.mean / 100;
  m.historicalSampleSize = vergleichbar.sampleSize;

  /* Publikumsinteresse bleibt null, und das ist diesmal kein
     Versehen: gemessene Reichweite sagt, wie ein BEITRAG lief - nicht,
     ob das Publikum nach DIESEM THEMA fragt. Aus der einen Groesse die
     andere zu machen, waere genau die Verwechslung, gegen die
     `externalInterest` als eigene Dimension steht. */
  m.audienceInterest = null;

  return m;
}

/**
 * Die Messzeilen aus einer performance.json.
 *
 * Exportiert, weil die eine Eigenschaft, auf die es ankommt, pruefbar
 * sein muss: eine Datei MIT Inhalt, aus der keine bekannte Liste zu
 * lesen ist, ist ein BEFUND und keine Null. Genau das ist hier einmal
 * schiefgegangen - und ein `|| []` hat es zugedeckt.
 */
export const LEISTUNGSLISTEN = ["snapshots", "entries", "measurements"];

export function leseLeistung(perf) {
  const source = perf
    ? LEISTUNGSLISTEN.find((k) => Array.isArray(perf[k])) || null : null;
  if (perf && !source) {
    throw new Error("performance.json enthaelt keine der bekannten Listen (" +
      LEISTUNGSLISTEN.join(", ") + "), sondern: " + Object.keys(perf).join(", ") +
      ". Das als 0 Messungen zu lesen waere dieselbe Verwechslung, die " +
      "diese Pruefung verhindern soll.");
  }
  const zeilen = source ? perf[source] : [];
  /* Gemessen heisst nicht reif. Der Zyklus unterscheidet das; hier
     genuegt das mitgelieferte Fenster, das dieselbe Rechnung traegt. */
  const measured = zeilen.filter((z) =>
    z && z.snapshot ? z.snapshot.state !== "UNAVAILABLE" : true);
  const mature = measured.filter((z) =>
    (z.window || (z.snapshot || {}).window) === "MATURE");
  return { source, measured, mature };
}

export function dryRun(options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const slate = baueSlate();

  const memory = readJson(join(ROOT, "social/data/content-memory.json"), { entries: [] });
  const history = (memory.entries || [])
    .filter((e) => e.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .map((e) => ({ family: e.contentFamily || null, at: e.publishedAt }));

  /* -------------------------------------------------------------------
     ZWEI VERSCHIEDENE DINGE, DIE BEIDE "platformFit = null" ERGEBEN

     (1) Wir wissen nicht, ob der Worker erreichbar ist - diesem Lauf
         fehlen die Zugangsdaten. Das sagt NICHTS ueber die
         Meta-Verbindung.
     (2) Selbst bei bestehender Verbindung fehlt die
         PLATTFORM-PASSUNGS-INTELLIGENZ: welches Format bei DIESEM
         Publikum traegt, weiss man erst aus gemessenen Beitraegen.
         Im Repository liegen 0 Messungen.

     Frueher habe ich daraus "der Meta-Provider ist nicht konfiguriert"
     gemacht - eine Aussage ueber die Verbindung, die aus dem Fehlen
     eigener Zugangsdaten gar nicht folgt. Beides wird jetzt getrennt
     benannt. */
  const meta = readJson(join(ROOT, "social/data/meta-connection.json"), null);
  const metaVerbindung = (meta && meta.connected === true) ? "CONNECTED"
    : (meta && meta.connected === null) ? "UNKNOWN_FROM_THIS_RUN"
    : "NOT_CONNECTED";
  /* -------------------------------------------------------------------
     DER SECHSTE FALL DERSELBEN SORTE

     Hier stand `perf.entries || perf.measurements`. Die Datei heisst
     ihre Liste `snapshots`. Beide Namen gehen ins Leere, das `|| []`
     faengt es auf, und heraus kommt 0.

     Es waren nicht 0. Es waren 25 gemessene Beitraege, eingepflegt vom
     Workflow-Lauf eine halbe Stunde zuvor. Die Folge war keine
     Kleinigkeit: `providerConfigured` wurde false, `platformFit` galt
     als systemisch unmessbar, und der Lauf meldete
     PLATFORM_FIT_INTELLIGENCE_UNAVAILABLE - waehrend die Daten im
     Repository lagen.

     Dasselbe Muster wie bei `roh.signals`/`events` und bei
     `cost`/`runningCost`: ein Schluesselname wird von Hand abgeschrieben,
     ein Vorgabewert faengt den Fehlgriff auf, und "unbekannt" wird als
     "null" gespeichert.

     Die Lehre steckt jetzt im Code: eine Datei MIT Inhalt, aus der
     keine bekannte Liste zu lesen ist, ist ein Befund und keine Null. */
  const perf = readJson(join(ROOT, "social/data/performance.json"), null);
  const gelesen = leseLeistung(perf);
  const listenName = gelesen.source;
  const gemessen = gelesen.measured;
  const reif = gelesen.mature;
  const messungen = gemessen.length;
  /* Plattformpassung ist gemessenes Wissen, nicht ein Verbindungsstatus -
     und halbgewachsene Zahlen sind noch kein Wissen. */
  const providerConfigured = reif.length > 0;

  const kontext = { now, history, providerConfigured, platformFit: null,
    memory: Memory.createMemory(memory.entries || []) };

  /* -------------------------------------------------------------------
     DIE ZWEITE EVIDENZKLASSE — GETRENNT GEFUEHRT

     Alles oberhalb misst UNS: unsere Belege, unsere Historie, unsere
     Marke. Was jetzt dazukommt, misst DIE ANDEREN, und es wird nicht
     vermischt.

     Der Grund ist nicht Ordnungsliebe. Fremde Aufmerksamkeit in
     `audienceInterest` einzurechnen hiesse behaupten, dass unser
     Publikum etwas will, weil irgendwer darueber spricht. Das erste
     ist eine Wirkung, das zweite eine Haeufigkeit.

     Zugeordnet wird ueber die Hashtags, unter denen tatsaechlich
     beobachtet wurde - das Portfolio fuehrt zu jedem Hashtag, zu
     welchen Themen er gehoert. Eine Zuordnung ueber Textaehnlichkeit
     waere eine Erfindung, und eine Erfindung ist hier schlimmer als
     eine Luecke.
     ------------------------------------------------------------------- */
  /* -----------------------------------------------------------------
     ERST FRAGEN, OB EINE QUELLE UEBERHAUPT AN IST

     Ohne diese Frage liest der Lauf eine leere Beobachtungsdatei und
     meldet "keine Beobachtungen" - richtig und irrefuehrend zugleich.
     Niemand hat gesucht. */
  const quellen = Registry.status(
    readJson(join(ROOT, "social/data/external-sources.json"), null));
  const externZustand = Registry.dimensionZustand(
    readJson(join(ROOT, "social/data/external-sources.json"), null),
    "externalInterest");

  const extBestand = readJson(join(ROOT, "social/data/external-observations.json"),
    { observations: [] });
  const beobachtungen = externZustand.state === "NOT_ACTIVE"
    ? [] : (extBestand.observations || []);
  const portfolio = readJson(join(ROOT, "social/data/hashtag-portfolio.json"),
    { hashtags: {} }).hashtags || {};

  const hashtagsJeThema = {};
  Object.keys(portfolio).forEach((h) => {
    (portfolio[h].topicMapping || []).forEach((tid) => {
      hashtagsJeThema[tid] = hashtagsJeThema[tid] || [];
      if (hashtagsJeThema[tid].indexOf(h) === -1) hashtagsJeThema[tid].push(h);
    });
  });
  slate.topics.forEach((t) => {
    t.observedHashtags = hashtagsJeThema[t.topicId] || [];
  });

  /* -----------------------------------------------------------------
     DIE EIGENE LEISTUNG IST JETZT DIE EINZIGE EVIDENZKLASSE

     Also wird sie je Dimension ausgewiesen, samt Abdeckung. Eine
     Dimension mit 0 % Abdeckung ist keine schlechte Dimension - sie
     wurde nicht mitgeschrieben, und das ist ein anderer Satz. */
  const eigenLeistung = OwnPerf.auswerten(memory.entries || [],
    { observe: Learning.observe });
  const modus = OwnPerf.exploreExploit(eigenLeistung, {});

  const signale = {};
  for (const t of slate.topics) signale[t.topicId] = messe(t, kontext);

  /* Was fehlt, weil das SYSTEM jung ist - nicht, weil das Thema
     schlecht waere. Ohne diese Unterscheidung entstuende ein
     Stillstand: bewerten erst mit Publikumsdaten, Publikumsdaten erst
     durchs Veroeffentlichen. */
  /* Systemisch fehlt nur noch, was das System wirklich nicht wissen
     kann. `historicalPerformance` gehoert seit den ersten gemessenen
     Beitraegen nicht mehr pauschal dazu - wer sie weiter als
     systemisch fehlend fuehrte, verschenkte 0.12 Gewicht an eine
     Luecke, die keine mehr ist. */
  const historieMessbar = kontext.memory.comparablePerformance(
    { archetype: null, platform: "instagram" }).sampleSize >= 5;
  const systemisch = ["audienceInterest"]
    .concat(historieMessbar ? [] : ["historicalPerformance"])
    .concat(providerConfigured ? [] : ["platformFit"]);

  const rang = Social.rank(slate.topics, {
    scorer: (eingang, opts) => Opportunity.score(eingang,
      /* Die systemischen Luecken beider Klassen treffen sich hier -
         und `rank()` bringt `externalInterest` selbst mit, wenn es
         nichts zu messen gab. Zusammengefuehrt statt ueberschrieben:
         ein `Object.assign` haette die eine Liste durch die andere
         ersetzt und die Luecke stillschweigend zur Themenluecke
         gemacht. */
      Object.assign({}, opts, {
        systemicallyUnavailable: systemisch
          .concat(opts.systemicallyUnavailable || [])
      })),
    history, signals: signale,
    externalObservations: beobachtungen,
    sourceState: externZustand
  });

  /* Audience Framing gehoert VOR das Authoring - also auch vor jede
     Aussage darueber, was aus einer Gelegenheit werden koennte. */
  const mitRahmen = rang.ranked.map((b) => Object.assign({}, b, {
    audienceFrame: Audience.frame(b.topic, { names: NAMEN }),
    /* Wie belegt ist dieses Thema wirklich? Ein Slate-Eintrag ohne
       eigene Belege kann keinen Brief tragen. */
    evidenceCoverage: {
      statements: (b.topic.evidence || []).length,
      sufficient: b.topic.evidenceSufficient === true,
      rejectedValues: b.topic.evidenceRejected,
      storyPotential: (b.topic.evidence || []).length >= 5 ? "TRAEGT_EIGENE_GESCHICHTE"
        : (b.topic.evidence || []).length > 0 ? "NUR_MIT_ERGAENZUNG"
        : "KEINE_EIGENEN_BELEGE"
    }
  }));

  return {
    generatedAt: now,
    purpose: "NORTH_STAR_SHIFT_PROOF",
    metaConnectionFromThisRun: metaVerbindung,
    ownPerformanceMeasurements: messungen,
    /* Der Zustand der externen Sensoren - einmal, nicht je Thema. */
    externalIntelligence: rang.externalIntelligence ||
      (externZustand.state === "NOT_ACTIVE"
        ? Registry.NO_ACTIVE_EXTERNAL_SOURCE : "ACTIVE"),
    externalSources: quellen.sensors.map((x) => ({ id: x.id, state: x.state,
      dormant: x.dormant, reason: x.reason })),
    /* Die eigene Leistung je Lerndimension, samt Abdeckung. Die
       Abdeckung ist Teil des Befunds: eine Dimension, die niemand
       mitgeschrieben hat, ist nicht schlecht. */
    ownPerformanceEvidence: {
      measuredEntries: eigenLeistung.dimensions.length
        ? eigenLeistung.dimensions[0].measured : 0,
      /* Warum die uebrigen fehlen - gezaehlt, nicht geraten. */
      unmeasuredReasons: eigenLeistung.dimensions.length
        ? eigenLeistung.dimensions[0].unmeasuredReasons : [],
      evaluableDimensions: eigenLeistung.evaluableCount,
      dimensionsWithFinding: eigenLeistung.withFindingCount,
      dimensions: eigenLeistung.dimensions.map((d) => ({
        dimension: d.dimension, coverage: d.coverage,
        evaluable: d.evaluable, sufficient: d.sufficient.length })),
      predictsPerformance: false
    },
    exploreExploit: {
      mode: modus.mode,
      exploit: modus.exploit,
      exploreCount: modus.explore.length,
      explanation: modus.explanation
    },
    /* -----------------------------------------------------------------
       ZWEI KLASSEN, GETRENNT AUSGEWIESEN

       Sie stehen nebeneinander und nicht in einer Summe. Wer sie
       addieren wollte, muesste erst sagen, wie viele fremde Beitraege
       eine eigene Messung wert sind - und diese Zahl gibt es nicht. */
    evidenceClasses: {
      own: {
        label: "OWN PERFORMANCE",
        measurements: messungen,
        mature: reif.length,
        source: listenName,
        dimensions: ["audienceInterest", "historicalPerformance", "platformFit"],
        measurable: ["historicalPerformance", "platformFit"]
          .filter((d) => systemisch.indexOf(d) === -1),
        note: "Gemessen an eigenen Beitraegen. Was davon systemisch leer " +
          "bleibt, ist keine Aussage ueber ein Thema."
      },
      external: {
        label: "EXTERNAL SOCIAL INTELLIGENCE",
        /* Der Zustand steht VOR der Zahl. Eine 0 neben einem
           eingeschalteten Sensor heisst etwas voellig anderes als
           neben einem abgeschalteten. */
        state: externZustand.state === "NOT_ACTIVE"
          ? Registry.NO_ACTIVE_EXTERNAL_SOURCE : "ACTIVE",
        carriesWeight: externZustand.carriesWeight !== false,
        sensors: quellen.sensors.map((x) => ({ id: x.id, state: x.state })),
        observations: beobachtungen.length,
        hashtagsObserved: Object.keys(portfolio).length,
        topicsWithObservedHashtags: slate.topics
          .filter((t) => (t.observedHashtags || []).length).length,
        dimensions: ["externalInterest"],
        note: "Abstrahierte Muster fremder Beitraege. Traegt keinen " +
          "fremden Text und kein fremdes Bild, und ist ein Faktor - " +
          "kein Veroeffentlichungsrecht."
      },
      combinedButNotMerged: true,
      /* Das Gewicht der externen Dimension ist nur dann eines, wenn
         eine Quelle laeuft. Sonst waere es ein Abzug fuer eine
         Entscheidung. */
      weights: externZustand.state === "NOT_ACTIVE"
        ? { audienceInterest: 0.14, externalInterest: "NOT_APPLIED" }
        : { audienceInterest: 0.14, externalInterest: 0.08 }
    },
    publishes: false,
    slateSize: slate.topics.length,
    ranked: mitRahmen,
    rejected: rang.rejected,
    families: rang.families,
    familyCount: rang.familyCount,
    unavailableDimensions: [
      { dimension: "audienceInterest",
        reason: "Gemessen ist, wie BEITRAEGE liefen - nicht, ob das " +
          "Publikum nach einem THEMA fragt. Diese Frage beantwortet " +
          "keine Reichweitenzahl." },
      { dimension: "historicalPerformance",
        reason: historieMessbar ? null
          : "Weniger als 5 vergleichbare Beitraege mit Ergebnis." },
      { dimension: "platformFit",
        code: "PLATFORM_FIT_INTELLIGENCE_UNAVAILABLE",
        reason: providerConfigured ? null
          : "Keine REIFEN Messungen (" + messungen + " gemessen, " +
            reif.length + " reif). Welches Format bei diesem Publikum traegt, ist " +
            "damit ungemessen - das ist KEINE Aussage ueber die " +
            "Meta-Verbindung (Status von hier aus: " + metaVerbindung + ")." }
    ].filter((d) => d.reason),
    predictsPerformance: false
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  const OUT = i === -1 ? null : args[i + 1];
  const r = dryRun();

  console.log("VISION UNIVERSE SOCIAL — Social Opportunity Dry Run");
  console.log("Zweck: " + r.purpose + " — kein Beitrag, kein Kandidat, keine Work-Ausfuehrung\n");
  console.log("Themen im Slate: " + r.slateSize +
    " | bewertbar: " + r.ranked.length + " | Familien: " + r.familyCount);
  console.log("Familienverteilung: " + JSON.stringify(r.families) + "\n");

  const top = r.ranked.slice(0, Number(args[args.indexOf("--top") + 1]) || 5);
  top.forEach((b, n) => {
    const t = b.topic;
    const a = b.audienceFrame;
    console.log("=".repeat(70));
    console.log("[" + (n + 1) + "] " + (t.title || t.topicId) + "   Score " + b.score);
    console.log("    Content Family : " + t.family);
    console.log("    Entity Type    : " + t.entityType +
      " (" + (t.entities.length === 0 ? "ohne Entitaet" : t.entities.length) + ")");
    console.log("    Source         : " + t.sources.join(", "));
    console.log("    Entstand aus   : " + (b.derivedFrom || "keinem Marktsignal"));
    console.log("    Evidence       : " + (t.evidenceRefs.join(", ") || "—"));
    console.log("    Evidence Cover.: " + b.evidenceCoverage.statements + " Belege, " +
      (b.evidenceCoverage.sufficient ? "ausreichend" : "nicht ausreichend") +
      (b.evidenceCoverage.rejectedValues
        ? ", " + b.evidenceCoverage.rejectedValues + " Werte zurueckgewiesen" : ""));
    console.log("    Story Potential: " + b.evidenceCoverage.storyPotential);
    console.log("    --- Audience Framing ---");
    console.log("    Fuer wen       : " + a.targetAudience);
    console.log("    Vorwissen      : " + a.assumedKnowledge);
    console.log("    Warum jetzt    : " + a.whyNow);
    console.log("    Warum wichtig  : " + a.whyCare);
    console.log("    Kernfrage      : " + a.coreQuestion);
    console.log("    Klarnamen      : " + (a.publicEntityNames.join(", ") || "—"));
    console.log("    Nicht im Hook  : " + (a.internalTermsNotSuitableForHook.join(", ") || "—"));
    console.log("    Rahmen-Basis   : " + a.basis);
    if (a.findings.length) {
      a.findings.forEach((f) => console.log("    ! " + f.id + ": " + f.message));
    }
    console.log("    --- Vorschlaege (keine Prognose) ---");
    console.log("    Hook Strategy  : " + a.suggestedHookStrategy);
    console.log("    Visual Strategy: " + a.suggestedVisualStrategy);
    console.log("    Explore/Exploit: " + (b.saturation.measured
      ? (b.saturation.value > 0.4 ? "EXPLORE (Familie gesaettigt)" : "EXPLOIT")
      : "EXPLORE (keine Historie — nichts zu bestaetigen)"));
    console.log("    --- Faktoren ---");
    b.drivers.slice(0, 3).forEach((d) => console.log("      + " + (d.label || d.dimension) +
      ": " + (d.explanation || "")));
    console.log("    Extern         : " + (b.externalInterest
      ? (b.externalInterest.available
          ? Math.round(b.externalInterest.value * 100) + " % Anteil (" +
            b.externalInterest.sample + " Beobachtungen) — Haeufigkeit, keine Wirkung"
          : b.externalInterest.explanation)
      : "—"));
    console.log("    Saettigung     : " + b.saturation.explanation);
    console.log("    Nicht anwendbar: " + b.notApplicable.join(", "));
    console.log("    Ungemessen     : " + b.missing.map((x) =>
      x.dimension + (x.cause === "NOT_ACTIVATED" ? " (NOT_ACTIVE)"
        : x.cause === "SYSTEMICALLY_UNAVAILABLE" ? " (systemisch)" : "")).join(", "));
  });

  console.log("=".repeat(70));

  console.log("\n--- ZWEI EVIDENZKLASSEN, GETRENNT GEFUEHRT ---");
  const ec = r.evidenceClasses;
  console.log("  " + ec.own.label.padEnd(30) + ec.own.measurements +
    " eigene Messungen (" + ec.own.mature + " reif), Gewicht " +
    ec.weights.audienceInterest + " (audienceInterest)");
  if (ec.external.state === "NO_ACTIVE_EXTERNAL_SOURCE") {
    console.log("  " + ec.external.label.padEnd(30) + "NOT_ACTIVE");
    ec.external.sensors.forEach((x) =>
      console.log("      " + x.id.padEnd(32) + x.state));
    console.log("      Kein Gewicht, kein Abzug. Eine abgeschaltete Quelle " +
      "ist keine Messung mit dem Ergebnis null.");
  } else {
    console.log("  " + ec.external.label.padEnd(30) + ec.external.observations +
      " externe Beobachtungen aus " + ec.external.hashtagsObserved +
      " Hashtags, Gewicht " + ec.weights.externalInterest);
  }
  if (ec.external.state !== "NO_ACTIVE_EXTERNAL_SOURCE") {
    console.log("  Themen mit beobachteten Hashtags: " +
      ec.external.topicsWithObservedHashtags + " von " + r.slateSize);
    const mitExtern = r.ranked.filter((b) => b.externalInterest &&
      b.externalInterest.available);
    console.log("  Themen, bei denen externes Interesse MESSBAR war: " +
      mitExtern.length);
  }
  console.log("  Beide Klassen stehen NEBENEINANDER, nie in einer Summe: wer " +
    "sie addieren");
  console.log("  wollte, muesste sagen, wie viele fremde Beitraege eine " +
    "eigene Messung wert sind.");

  console.log("\n--- OWN PERFORMANCE EVIDENCE (je Lerndimension) ---");
  const op = r.ownPerformanceEvidence;
  console.log("  " + op.measuredEntries + " gemessene Beitraege, " +
    op.evaluableDimensions + " von " + op.dimensions.length +
    " Dimensionen auswertbar, " + op.dimensionsWithFinding + " mit Befund.");
  (op.unmeasuredReasons || []).forEach((u) => console.log("    " +
    String(u.count).padStart(3) + " ohne Messwert: " + u.reason));
  op.dimensions.forEach((d) => console.log("    " + d.dimension.padEnd(19) +
    String(Math.round(d.coverage * 100)).padStart(3) + " % Abdeckung   " +
    (d.evaluable ? (d.sufficient ? d.sufficient + " belastbar" : "kein belastbarer Befund")
                 : "nicht mitgeschrieben")));

  console.log("\n--- EXPLORE / EXPLOIT ---");
  console.log("  Modus: " + r.exploreExploit.mode);
  console.log("  " + r.exploreExploit.explanation);
  r.exploreExploit.exploit.forEach((e) => console.log("    EXPLOIT " +
    e.dimension + ": " + e.values.map((v) => v.value).join(", ")));

  console.log("\n--- WAS NICHT GEMESSEN WERDEN KANN ---");
  r.unavailableDimensions.forEach((d) =>
    console.log("  " + d.dimension + ": " + d.reason));
  /* "Bei n=0" stand hier fest verdrahtet und stimmte, solange nichts
     gemessen war. Inzwischen gibt es Messungen, und ein Satz, der das
     Gegenteil behauptet, ist schlimmer als keiner. */
  console.log("\nKeine dieser Zahlen ist eine Leistungsprognose. " +
    "predictsPerformance = " + r.predictsPerformance + ".");
  console.log("Stichprobe: " + r.evidenceClasses.own.mature +
    " reife eigene Messungen, " + r.evidenceClasses.external.observations +
    " externe Beobachtungen. Eine Rangfolge sagt, worueber zu sprechen");
  console.log("sich lohnen KOENNTE - nicht, was funktionieren wird.");

  if (r.rejected.length) {
    console.log("\n--- NICHT BEWERTBAR (" + r.rejected.length + ") ---");
    const gruende = {};
    r.rejected.forEach((b) => {
      const g = b.explanation || "unbekannt";
      gruende[g] = (gruende[g] || 0) + 1;
    });
    Object.keys(gruende).forEach((g) => console.log("  " + gruende[g] + "x " + g));
  }

  if (OUT) {
    const ziel = join(ROOT, OUT, "social-opportunity-dryrun.json");
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, JSON.stringify(r, null, 2) + "\n");
    console.log("\nGeschrieben: " + join(OUT, "social-opportunity-dryrun.json"));
  }
}

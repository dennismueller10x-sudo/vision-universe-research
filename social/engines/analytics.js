/* =========================================================================
   VISION UNIVERSE SOCIAL — analytics.js
   KANONISCHES ANALYTICS-MODELL (§17)

   Jede Plattform zaehlt anders. "Views" bei TikTok, "plays" bei Instagram,
   "impressions" bei LinkedIn — teils dasselbe, teils nicht, und nirgends
   steht dabei, was gemeint ist.

   DREI REGELN

   1. WAS EINE PLATTFORM NICHT MELDET, BLEIBT null.
      Nicht 0. Ein Beitrag ohne gemeldete Saves hat nicht null Saves —
      er hat keine gemeldeten Saves. Die Learning Engine wuerde aus der 0
      lernen, dass dieses Format nicht gespeichert wird.

   2. DIE ORIGINALWERTE BLEIBEN ERHALTEN.
      Die Normalisierung kann falsch sein. Wenn sie es ist, muss sie sich
      korrigieren lassen — und das geht nur, wenn die Rohwerte noch da
      sind. Eine Normalisierung ohne Rohdaten ist ein Datenverlust mit
      Zwischenschritt.

   3. EIN UNBEKANNTES FELD IST EIN BEFUND, KEIN MUELL.
      Aendert eine Plattform ihr Schema, taucht ein neuer Feldname auf.
      Wer ihn stillschweigend verwirft, merkt monatelang nichts. Diese
      Datei meldet ihn (§44: provider schema change).

   ABGELEITETE KENNZAHLEN

   engagementRate wird gerechnet, nicht uebernommen — Plattformen rechnen
   sie unterschiedlich (mal auf Reach, mal auf Impressions, mal auf
   Follower). Eine uebernommene Rate ist zwischen zwei Plattformen nicht
   vergleichbar, und Vergleichbarkeit ist der einzige Zweck dieser Datei.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;

  /* Abbildung Plattformfeld -> kanonische Kennzahl. Je Provider getrennt,
     weil derselbe Name auf zwei Plattformen zwei Dinge heissen kann. */
  var MAPPINGS = {
    meta: {
      impressions: "impressions",
      reach: "reach",
      likes: "likes",
      like_count: "likes",
      comments: "comments",
      comments_count: "comments",
      saved: "saves",
      shares: "shares",
      plays: "views",
      video_views: "views",
      ig_reels_video_view_total_time: "watchTimeSeconds",
      profile_views: "profileVisits",
      follower_count: null,            /* Kontokennzahl, nicht Beitragskennzahl */
      total_interactions: null,        /* wird selbst gerechnet, siehe unten */
      website_clicks: "clicks"
    },
    mock: {
      impressions: "impressions",
      reach: "reach",
      like_count: "likes",
      comments_count: "comments",
      saved: "saves",
      shares: "shares",
      plays: "views"
    }
  };

  /* Felder, die bewusst NICHT kanonisch werden. Sie tauchen nicht in der
     Liste der unbekannten Felder auf — sonst waere jeder Lauf ein Befund. */
  var IGNORED = {
    meta: ["total_interactions", "follower_count", "id", "name", "period", "title", "description"],
    mock: []
  };

  function fail(m) { throw new Error("VUSocialAnalytics: " + m); }

  /**
   * Normalisiert einen Provider-Rohsatz.
   *
   * @returns {
   *   metrics,            kanonisch, fehlende Werte null
   *   providerMetrics,    unveraendert
   *   unknownFields,      Befund fuer §44
   *   coverage            wie viele kanonische Kennzahlen belegt sind
   * }
   */
  function normalize(providerId, providerMetrics, options) {
    options = options || {};
    var mapping = MAPPINGS[providerId];
    if (!mapping) fail("keine Kennzahlenzuordnung fuer Provider '" + providerId + "'");
    providerMetrics = providerMetrics || {};

    var metrics = {};
    Schema.CANONICAL_METRICS.forEach(function (m) { metrics[m] = null; });

    var unknownFields = [];
    var ignored = IGNORED[providerId] || [];

    Object.keys(providerMetrics).forEach(function (key) {
      if (!(key in mapping)) {
        if (ignored.indexOf(key) === -1) unknownFields.push(key);
        return;
      }
      var target = mapping[key];
      if (target === null) return;   /* bekannt und bewusst nicht kanonisch */
      var value = Schema.numberOrNull(providerMetrics[key]);
      /* Zwei Rohfelder koennen auf dasselbe Ziel zeigen (likes/like_count).
         Der erste belegte Wert gewinnt; ein zweiter widersprechender Wert
         ist ein Befund und kein stiller Ueberschreiber. */
      if (metrics[target] === null) metrics[target] = value;
      else if (value !== null && value !== metrics[target]) {
        unknownFields.push(key + " (widerspricht bereits gesetztem " + target + ")");
      }
    });

    /* Abgeleitet: engagementRate auf Reach, ersatzweise auf Impressions.
       Die Bezugsgroesse wird MITGETEILT — eine Rate ohne Nenner ist
       keine Rate. */
    var interactions = ["likes", "comments", "shares", "saves"]
      .map(function (m) { return metrics[m]; })
      .filter(function (v) { return v !== null; });

    var base = metrics.reach !== null ? metrics.reach
             : (metrics.impressions !== null ? metrics.impressions : null);
    var baseName = metrics.reach !== null ? "reach"
                 : (metrics.impressions !== null ? "impressions" : null);

    var engagementBasis = null;
    if (interactions.length > 0 && base !== null && base > 0) {
      var sum = interactions.reduce(function (a, b) { return a + b; }, 0);
      metrics.engagementRate = Math.round((sum / base) * 100000) / 100000;
      engagementBasis = {
        base: baseName, baseValue: base, interactionSum: sum,
        /* Welche Bestandteile fehlten — sonst sieht eine Rate aus drei
           von vier Bestandteilen aus wie eine aus vier. */
        includedMetrics: ["likes", "comments", "shares", "saves"]
          .filter(function (m) { return metrics[m] !== null; }),
        missingMetrics: ["likes", "comments", "shares", "saves"]
          .filter(function (m) { return metrics[m] === null; })
      };
    }

    /* completionRate aus Watchtime und Laenge — nur wenn beides da ist. */
    if (metrics.watchTimeSeconds !== null && options.videoLengthSeconds &&
        metrics.views !== null && metrics.views > 0) {
      var avgWatch = metrics.watchTimeSeconds / metrics.views;
      metrics.completionRate = Math.round((avgWatch / options.videoLengthSeconds) * 10000) / 10000;
    }

    var declared = Schema.CANONICAL_METRICS.filter(function (m) { return metrics[m] !== null; });

    return {
      metrics: metrics,
      providerMetrics: providerMetrics,
      unknownFields: unknownFields,
      engagementBasis: engagementBasis,
      coverage: {
        declared: declared.length,
        total: Schema.CANONICAL_METRICS.length,
        ratio: Math.round((declared.length / Schema.CANONICAL_METRICS.length) * 1000) / 1000,
        missing: Schema.CANONICAL_METRICS.filter(function (m) { return metrics[m] === null; })
      },
      /* Ein Schema-Wechsel ist ein Betriebsereignis, kein Logeintrag. */
      schemaChangeSuspected: unknownFields.length > 0
    };
  }

  /**
   * Baut einen Schnappschuss. Der Zustand (§27) haengt vom Alter ab:
   * Kennzahlen, die seit zwei Tagen nicht aktualisiert wurden, sind
   * nicht falsch, aber auch nicht aktuell.
   */
  function snapshot(spec, options) {
    options = options || {};
    spec = spec || {};
    var normalized = normalize(spec.providerId, spec.providerMetrics, options);
    var nowMs = options.now ? new Date(options.now).getTime() : Date.now();
    var ageHours = spec.capturedAt ? (nowMs - Date.parse(spec.capturedAt)) / 3600000 : null;
    var staleAfter = options.staleAfterHours || 48;

    var state = "VERIFIED";
    if (normalized.coverage.declared === 0) state = "UNAVAILABLE";
    else if (ageHours === null) state = "STALE";
    else if (ageHours > staleAfter) state = "STALE";

    return Schema.metricSnapshot({
      snapshotId: spec.snapshotId || (String(spec.publicationId) + "@" + String(spec.capturedAt)),
      publicationId: spec.publicationId,
      providerId: spec.providerId,
      capturedAt: spec.capturedAt,
      ageHours: ageHours,
      metrics: normalized.metrics,
      providerMetrics: normalized.providerMetrics,
      state: state
    });
  }

  /**
   * Entwicklung zwischen zwei Schnappschuessen. Kennzahlen, die in einem
   * der beiden fehlen, ergeben keinen Zuwachs — sie ergeben null.
   */
  function delta(earlier, later) {
    var out = {};
    Schema.CANONICAL_METRICS.forEach(function (m) {
      var a = earlier && earlier.metrics ? earlier.metrics[m] : null;
      var b = later && later.metrics ? later.metrics[m] : null;
      out[m] = (a === null || b === null) ? null : b - a;
    });
    return out;
  }

  var api = {
    MAPPINGS: MAPPINGS,
    IGNORED: IGNORED,
    normalize: normalize,
    snapshot: snapshot,
    delta: delta
  };

  if (isNode) module.exports = api;
  else global.VUSocialAnalytics = api;
})(typeof window !== "undefined" ? window : globalThis);

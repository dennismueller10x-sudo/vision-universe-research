/* =========================================================================
   vision-universe-social — src/capabilities.js
   CAPABILITIES AUS TATSAECHLICH ERTEILTEN RECHTEN (§2.12, §2.13)

   -------------------------------------------------------------------------
   DER UNTERSCHIED ZU social/engines/capabilities.js
   -------------------------------------------------------------------------

   Die Deklaration im Repository sagt, was die Graph API LAUT DOKUMENTATION
   kann. Sie traegt deshalb `verifiedAt: null` — eine begruendete Erwartung,
   kein Nachweis.

   Diese Datei sagt, was DIESE VERBINDUNG kann. Sie liest die tatsaechlich
   erteilten Rechte und leitet daraus ab, welche Faehigkeit wirklich zur
   Verfuegung steht.

   Das ist der Unterschied, auf den es im Betrieb ankommt: Ein Nutzer kann
   im Meta-Dialog einzelne Rechte abwaehlen. Die App fragt sechs an und
   bekommt vier. Ohne diese Ableitung wuerde das System Insights fuer
   verfuegbar halten, bis der erste Abruf fehlschlaegt — und der Fehler
   saehe aus wie ein Ausfall, nicht wie ein fehlendes Recht.

   -------------------------------------------------------------------------
   DREI ZUSTAENDE, NICHT ZWEI
   -------------------------------------------------------------------------

   SUPPORTED            Recht erteilt, Faehigkeit nutzbar
   UNAVAILABLE          Recht nicht erteilt — ausdruecklich geprueft
   null                 nicht ableitbar (bleibt ungeprueft)

   `null` wird nicht zu `UNAVAILABLE` verkuerzt. Eine Faehigkeit, ueber die
   die Rechteliste nichts aussagt, ist nicht "nicht vorhanden" — sie ist
   ungeprueft, und das ist eine andere Aussage (MEDIUM-5-Lehre).
   ========================================================================= */

/* Welches Recht welche Faehigkeit traegt. Eine Faehigkeit, die hier nicht
   steht, bleibt `null` — sie laesst sich aus Rechten nicht ableiten. */
const PERMISSION_CAPABILITIES = {
  instagram_content_publish: {
    publish: ["publishImage", "publishCarousel", "publishVideo", "publishReel", "altText"]
  },
  instagram_manage_insights: {
    analytics: ["postInsights", "accountInsights", "audienceDemographics",
                "storyInsights", "videoRetention", "followerTimeseries"]
  },
  instagram_manage_comments: {
    audience: ["readComments", "replyComments", "hideComments"]
  },
  instagram_basic: {
    audience: ["readMentions"]
  }
};

/* Rechte, ohne die die Verbindung als Ganzes nicht arbeitsfaehig ist. */
const ESSENTIAL_SCOPES = ["instagram_basic", "pages_show_list"];

/* Faehigkeiten, die unabhaengig von Rechten feststehen — sie sind
   Eigenschaften der API und keine Frage der Erlaubnis. */
const FIXED = {
  publish: {
    publishStory: null,               /* ungeprueft, kontotypabhaengig */
    publishText: "UNAVAILABLE",       /* Instagram kennt keinen reinen Textbeitrag */
    scheduledPublish: "UNAVAILABLE",  /* die Plattform terminiert nicht selbst */
    idempotencyToken: "UNAVAILABLE",  /* die Graph API kennt keinen */
    location: "PARTIALLY_SUPPORTED",
    userTags: "PARTIALLY_SUPPORTED",
    productTags: null,
    deletePost: "PARTIALLY_SUPPORTED",
    editCaption: "PARTIALLY_SUPPORTED"
  },
  analytics: {
    historicalInsights: "PARTIALLY_SUPPORTED",  /* erst ab Verbindungszeitpunkt */
    realtimeInsights: "UNAVAILABLE"
  },
  audience: {
    readDirectMessages: null
  },
  auth: {
    oauth: "SUPPORTED",
    serverSideTokenExchange: "SUPPORTED",   /* im Worker: erfuellt */
    longLivedToken: "SUPPORTED",
    tokenRefresh: "SUPPORTED",
    tokenRevocation: "PARTIALLY_SUPPORTED",
    permissionIntrospection: "SUPPORTED",
    multiAccount: "SUPPORTED"
  },
  webhook: {
    signatureVerification: "SUPPORTED",
    webhookSubscription: "MANUAL_REQUIRED",
    commentEvents: "MANUAL_REQUIRED",
    mentionEvents: "MANUAL_REQUIRED"
  }
};

/**
 * Leitet die Faehigkeiten dieser Verbindung ab.
 *
 * @param granted  Liste tatsaechlich erteilter Rechte
 * @param requested Liste angefragter Rechte
 */
export function deriveCapabilities(granted, requested = []) {
  const grantedSet = new Set(granted || []);
  const sets = { auth: {}, publish: {}, analytics: {}, audience: {}, webhook: {} };

  /* 1. Feste Faehigkeiten. */
  for (const [setName, entries] of Object.entries(FIXED)) {
    for (const [capability, level] of Object.entries(entries)) sets[setName][capability] = level;
  }

  /* 2. Rechteabhaengige Faehigkeiten. Ein Recht, das ANGEFRAGT und NICHT
        erteilt wurde, ergibt ein geprueftes UNAVAILABLE. Ein Recht, das
        gar nicht angefragt wurde, laesst die Faehigkeit ungeprueft. */
  for (const [permission, mapping] of Object.entries(PERMISSION_CAPABILITIES)) {
    const isGranted = grantedSet.has(permission);
    const wasRequested = (requested || []).includes(permission);
    for (const [setName, capabilities] of Object.entries(mapping)) {
      for (const capability of capabilities) {
        if (isGranted) sets[setName][capability] = "SUPPORTED";
        else if (wasRequested) sets[setName][capability] = "UNAVAILABLE";
        else if (!(capability in sets[setName])) sets[setName][capability] = null;
      }
    }
  }

  const missingEssential = ESSENTIAL_SCOPES.filter((scope) => !grantedSet.has(scope));
  const missingRequested = (requested || []).filter((scope) => !grantedSet.has(scope));

  return {
    derivedFrom: "grantedPermissions",
    granted: [...grantedSet],
    requested: requested || [],
    missing: missingRequested,
    missingEssential,
    operational: missingEssential.length === 0,
    sets,
    explanation: buildExplanation(grantedSet, missingRequested, missingEssential)
  };
}

function buildExplanation(grantedSet, missing, missingEssential) {
  if (missingEssential.length) {
    return "Die Verbindung ist nicht arbeitsfaehig: es fehlen die Grundrechte " +
      missingEssential.join(", ") + ". Ohne sie laesst sich nicht einmal das Konto aufloesen.";
  }
  const parts = [];
  parts.push(grantedSet.size + " Recht(e) erteilt.");
  parts.push(grantedSet.has("instagram_content_publish")
    ? "Veroeffentlichung ist moeglich."
    : "Veroeffentlichung ist NICHT moeglich (instagram_content_publish fehlt).");
  parts.push(grantedSet.has("instagram_manage_insights")
    ? "Kennzahlen sind lesbar."
    : "Kennzahlen sind NICHT lesbar (instagram_manage_insights fehlt).");
  if (missing.length) {
    parts.push("Nicht erteilt wurden: " + missing.join(", ") +
      ". Die davon abhaengigen Faehigkeiten sind geprueft nicht verfuegbar — " +
      "das ist kein Ausfall, sondern eine Entscheidung im Meta-Dialog.");
  }
  return parts.join(" ");
}

/**
 * Die Frage, die das Quality Gate META_CONNECTED beantwortet haben will.
 */
export function assessConnection(capabilities) {
  const checks = [
    { id: "accountResolved", label: "Instagram-Professional-Konto aufgeloest" },
    { id: "publishCapability", label: "Publishing-Faehigkeit nachgewiesen",
      ok: capabilities.sets.publish.publishImage === "SUPPORTED" },
    { id: "insightsCapability", label: "Insights-Faehigkeit nachgewiesen",
      ok: capabilities.sets.analytics.accountInsights === "SUPPORTED" },
    { id: "commentsCapability", label: "Kommentarzugriff",
      ok: capabilities.sets.audience.readComments === "SUPPORTED" }
  ];
  return checks;
}

export { PERMISSION_CAPABILITIES, ESSENTIAL_SCOPES };

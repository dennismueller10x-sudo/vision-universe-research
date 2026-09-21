/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/hard-invariants.js

   FUENF SAETZE, DIE WAHR SEIN MUESSEN (§45)

   -------------------------------------------------------------------------
   WARUM SIE NICHT EINFACH DASTEHEN DUERFEN
   -------------------------------------------------------------------------

   In scripts/social/production-readiness.mjs stand woertlich:

       OWNER_PUBLISHING_GATE: { active: true, trace: ... }

   `true`, hingeschrieben. Kein Messwert, keine Quelle, keine
   Moeglichkeit, dass es jemals `false` ergibt. Eine Zusicherung, die
   sich selbst erfuellt - und die genau dann noch `true` meldet, wenn
   das Tor ausgebaut wurde.

   Diese Datei MISST stattdessen. Jede Invariante nennt:

     wert      was tatsaechlich gefunden wurde
     quelle    wo es steht - Datei, Feld, Funktion
     erfuellt  ob es der Vorgabe entspricht
     beleg     der Satz, der beides verbindet

   Und wo etwas NICHT messbar ist, steht das - nicht `true`.

   -------------------------------------------------------------------------
   WAS "GEMESSEN" HIER HEISST
   -------------------------------------------------------------------------

   Nicht: "in einer Datei steht eine Zahl". Eine Konfiguration, die
   niemand liest, ist keine Invariante. Wo es geht, wird deshalb das
   VERHALTEN gefragt: die Kadenz-Engine wird mit einem offenen Creative
   Job aufgerufen und muss ablehnen; der Publish-Pfad wird ohne
   Freigabe aufgerufen und muss ablehnen.

   Ein Schalter, der dasteht und nichts bewirkt, faellt damit auf.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Kadenz = isNode ? require("./content-cadence.js") : global.VUSocialContentCadence;

  var SOLL = {
    MAX_OPEN_CREATIVE_JOBS: 1,
    GLOBAL_AUTOPUBLISH: false,
    VU_SOCIAL_AUTOPUBLISH: false,
    OWNER_PUBLISHING_GATE: true,
    EXTERNAL_SOCIAL_SOURCES_ACTIVE: 0
  };

  function befund(id, erfuellt, wert, quelle, beleg) {
    return { id: id, erfuellt: erfuellt === true, wert: wert,
             soll: SOLL[id], quelle: quelle, beleg: beleg };
  }

  /* -------------------------------------------------------------------
     1. HOECHSTENS EIN OFFENER CREATIVE JOB

     Gefragt wird die Kadenz-Engine selbst: mit EINEM offenen Job muss
     sie ablehnen. Damit haengt die Invariante am Verhalten und nicht
     an einer Zahl in einer Konfiguration, die vielleicht niemand
     liest.

     Zusaetzlich wird der tatsaechliche Bestand gezaehlt - eine Regel,
     die gilt, und ein Zustand, der sie verletzt, sind zwei
     verschiedene Befunde.
     ------------------------------------------------------------------- */
  function creativeJobs(offeneJobs, config) {
    var mitJob = Kadenz.entscheide({
      now: "2026-01-01T12:00:00Z", candidatesToday: [], lastCandidateAt: null,
      activeApprovalQueue: 0, openCreativeJobs: 1
    }, config);
    var regelGilt = mitJob.darfErzeugen === false &&
      mitJob.grund === Kadenz.GRUND.CREATIVE_JOB_IN_FLIGHT;

    var n = Number(offeneJobs);
    var bestandOk = !Number.isFinite(n) || n <= SOLL.MAX_OPEN_CREATIVE_JOBS;

    return befund("MAX_OPEN_CREATIVE_JOBS", regelGilt && bestandOk,
      Number.isFinite(n) ? n : null,
      "content-cadence.entscheide(openCreativeJobs: 1)",
      regelGilt
        ? "Die Kadenz lehnt bei einem offenen Job ab" +
          (Number.isFinite(n) ? "; im Bestand sind " + n + "." : ".")
        : "Die Kadenz laesst bei einem offenen Job weiterlaufen.");
  }

  /* 2. Der globale Autopublish-Schalter. Er steht in kill-switch.json
        unter `gates` - NICHT in autonomy.json, wo ein frueherer
        Pruefer ihn gesucht und pflichtgemaess nicht gefunden hat. */
  function globalAutopublish(killSwitch) {
    var gates = (killSwitch && killSwitch.gates) || {};
    var g = gates.GLOBAL_AUTOPUBLISH;
    var an = g && (g.enabled === true || g.value === true || g === true);
    var gefunden = g !== undefined && g !== null;
    return befund("GLOBAL_AUTOPUBLISH", gefunden && !an,
      gefunden ? !!an : null,
      "social/config/kill-switch.json#gates.GLOBAL_AUTOPUBLISH",
      gefunden
        ? (an ? "Der globale Schalter steht AN." : "Der globale Schalter steht aus.")
        : "Der Schalter steht nicht in kill-switch.json — und eine " +
          "Invariante ueber einen Schalter, den es nicht gibt, ist keine.");
  }

  /* -------------------------------------------------------------------
     3. DER WORKER-SCHALTER

     Er ist eine Umgebungsvariable und steht in keiner Datei des
     Repositories - ein frueherer Pruefer hat ihn deshalb in
     autonomy.json gesucht und "nicht gefunden" gemeldet, was wie ein
     Mangel aussah und keiner war.

     Messbar ist hier zweierlei, und beides wird gemessen:
       - dass die WORKER-KONFIGURATION ihn nicht einschaltet
       - dass der Worker ausschliesslich den genauen Wert "on" als
         Einschaltung liest (alles andere, auch "true" und "1", ist aus)
     ------------------------------------------------------------------- */
  function workerAutopublish(wranglerText, workerQuelle) {
    var gesetzt = /VU_SOCIAL_AUTOPUBLISH\s*=\s*["']?on["']?/i.test(String(wranglerText || ""));
    var strikt = /VU_SOCIAL_AUTOPUBLISH[^\n]*\)\s*\.toLowerCase\(\)\s*===\s*"on"/
      .test(String(workerQuelle || "").replace(/\s+/g, " ").replace(/ \./g, "."))
      || /toLowerCase\(\)\s*===\s*"on"/.test(String(workerQuelle || ""));
    return befund("VU_SOCIAL_AUTOPUBLISH", !gesetzt && strikt, gesetzt,
      "wrangler.toml + workers/.../index.js",
      gesetzt
        ? "Die Worker-Konfiguration schaltet Autopublish ein."
        : (strikt
            ? "Nicht konfiguriert, und der Worker akzeptiert nur den exakten Wert \"on\"."
            : "Nicht konfiguriert — aber der Worker prueft den Wert nicht strikt."));
  }

  /* -------------------------------------------------------------------
     4. DAS OWNER-TOR

     Nicht "true", sondern: der Publish-Pfad wird OHNE Freigabe
     aufgerufen und muss ablehnen. `pruefer` ist die echte Funktion;
     diese Engine kennt sie nicht und bewertet nur ihr Ergebnis.
     ------------------------------------------------------------------- */
  /* -----------------------------------------------------------------
     EINE ABLEHNUNG IST NOCH KEIN TOR

     Die erste Fassung fragte nur: wurde abgelehnt? Eine Gegenprobe hat
     sie widerlegt. Baut man im Worker die Abdruckpruefung aus, stirbt
     die Anfrage trotzdem - eine Stufe spaeter, am Bild, das es nicht
     gibt. Die Antwort lautet dann `imageUnreachable`, `published` ist
     `false`, und die alte Pruefung meldete `OK`.

     Das Tor war ausgebaut und die Messung sagte, es haelt.

     Deshalb wird hier nicht mehr gefragt, OB abgelehnt wurde, sondern
     WOMIT. Jede der beiden Fragen hat genau eine Antwort, die vom Tor
     kommt:

       im Betrieb              publishingDisabled
       mit falschem Abdruck    approvalMismatch

     Jede andere Ablehnung - imageUnreachable, notConnected, notFound,
     contentIdRequired - heisst: die Anfrage ist vor oder hinter dem Tor
     gescheitert. Das ist keine Messung des Tors, und es wird auch nicht
     als eine gemeldet.
     ----------------------------------------------------------------- */
  var TOR_GRUND = {
    betrieb: "publishingDisabled",
    falscherAbdruck: "approvalMismatch"
  };

  var ANTWORT = {
    TOR_HIELT: "TOR_HIELT",
    DURCHGELASSEN: "DURCHGELASSEN",
    ANDERER_GRUND: "ANDERER_GRUND",
    NICHT_GEFRAGT: "NICHT_GEFRAGT"
  };

  function beurteileAntwort(e, erwarteterGrund) {
    if (e === undefined || e === null) return { art: ANTWORT.NICHT_GEFRAGT, grund: null };
    var x = e || {};
    var grund = x.error ? String(x.error) : null;
    var abgelehnt = x.published === false || x.ok === false ||
      (typeof x.status === "number" && x.status >= 400);
    if (!abgelehnt) return { art: ANTWORT.DURCHGELASSEN, grund: grund };
    if (grund === erwarteterGrund) return { art: ANTWORT.TOR_HIELT, grund: grund };
    return { art: ANTWORT.ANDERER_GRUND, grund: grund || "ohne Angabe" };
  }

  function ownerTor(imBetrieb, mitFalschemAbdruck) {
    var a = beurteileAntwort(imBetrieb, TOR_GRUND.betrieb);
    var b = beurteileAntwort(mitFalschemAbdruck, TOR_GRUND.falscherAbdruck);

    /* -----------------------------------------------------------------
       ZWEI AUSSAGEN, UND KEINE ERSETZT DIE ANDERE

       A haengt am Schalter - das ist keine Schwaeche der Pruefung,
       sondern die Bauart des Tors, und sie steht deshalb im Beleg.
       B nicht: mit eingeschaltetem Schalter kann nur noch der Abdruck
       einen nachtraeglich geaenderten Inhalt aufhalten.

       Wurde B gar nicht gefragt, ist das KEIN Bestehen. Eine
       Invariante, die nur ihre bequeme Haelfte prueft, ist halb
       geprueft - und wird als solche gemeldet. */
    var gehalten = a.art === ANTWORT.TOR_HIELT && b.art === ANTWORT.TOR_HIELT;
    var gemessen = a.art !== ANTWORT.NICHT_GEFRAGT && b.art !== ANTWORT.NICHT_GEFRAGT &&
      a.art !== ANTWORT.ANDERER_GRUND && b.art !== ANTWORT.ANDERER_GRUND;

    var beleg;
    if (a.art === ANTWORT.NICHT_GEFRAGT || b.art === ANTWORT.NICHT_GEFRAGT) {
      beleg = "Nur " + (a.art === ANTWORT.NICHT_GEFRAGT ? "der falsche Abdruck" : "der Betrieb") +
        " wurde gefragt. Beide Haelften gehoeren zur Aussage; eine allein ist " +
        "nicht gemessen.";
    } else if (a.art === ANTWORT.DURCHGELASSEN) {
      beleg = "Der Publish-Pfad hat im Betrieb OHNE Freigabe veroeffentlicht.";
    } else if (b.art === ANTWORT.DURCHGELASSEN) {
      beleg = "Im Betrieb abgelehnt — ABER mit eingeschaltetem Schalter ging ein " +
        "Inhalt mit falschem Abdruck durch.";
    } else if (a.art === ANTWORT.ANDERER_GRUND || b.art === ANTWORT.ANDERER_GRUND) {
      var welche = [];
      if (a.art === ANTWORT.ANDERER_GRUND) {
        welche.push("im Betrieb kam \"" + a.grund + "\" statt \"" + TOR_GRUND.betrieb + "\"");
      }
      if (b.art === ANTWORT.ANDERER_GRUND) {
        welche.push("beim falschen Abdruck kam \"" + b.grund + "\" statt \"" +
          TOR_GRUND.falscherAbdruck + "\"");
      }
      beleg = "Abgelehnt, aber nicht vom Tor: " + welche.join("; ") + ". Die Anfrage " +
        "ist vor oder hinter dem Tor gescheitert — das Tor selbst wurde dabei nicht " +
        "geprueft und gilt als ungemessen.";
    } else {
      beleg = "Im Betrieb (Schalter aus, keine Freigabe) abgelehnt: " + a.grund +
        ". Und mit eingeschaltetem Schalter haelt der Inhaltsabdruck: " + b.grund + ".";
    }

    return befund("OWNER_PUBLISHING_GATE", gehalten,
      gemessen ? gehalten : null,
      "Publish-Pfad, zweimal gefragt (Betrieb + falscher Abdruck), auf den " +
      "jeweiligen Tor-Grund geprueft",
      beleg);
  }

  /* 5. Aktive externe Quellen. Aus der Registry, nicht gezaehlt. */
  function externeQuellen(registryStatus) {
    var s = registryStatus || {};
    var n = Number(s.activeCount);
    var bekannt = Number.isFinite(n);
    return befund("EXTERNAL_SOCIAL_SOURCES_ACTIVE",
      bekannt && n === SOLL.EXTERNAL_SOCIAL_SOURCES_ACTIVE,
      bekannt ? n : null, "source-registry.status().activeCount",
      bekannt
        ? (n === 0 ? "Keine externe Quelle ist aktiviert."
                   : n + " externe Quelle(n) sind aktiv.")
        : "Die Registry nennt keine Zahl — unbekannt ist nicht null.");
  }

  /** Alle fuenf zusammen. */
  function alle(eingabe) {
    var e = eingabe || {};
    var liste = [
      creativeJobs(e.openCreativeJobs, e.cadenceConfig),
      globalAutopublish(e.killSwitch),
      workerAutopublish(e.wrangler, e.workerSource),
      ownerTor(e.publishOhneFreigabe, e.publishMitFalschemAbdruck),
      externeQuellen(e.registryStatus)
    ];
    var verletzt = liste.filter(function (b) { return !b.erfuellt; });
    return {
      invarianten: liste,
      verletzt: verletzt.map(function (b) { return b.id; }),
      ok: verletzt.length === 0,
      erklaerung: verletzt.length === 0
        ? "Alle fuenf harten Invarianten gemessen und erfuellt."
        : verletzt.length + " Invariante(n) verletzt: " +
          verletzt.map(function (b) { return b.id + " (" + b.beleg + ")"; }).join("; ")
    };
  }

  var api = {
    SOLL: SOLL,
    creativeJobs: creativeJobs,
    globalAutopublish: globalAutopublish,
    workerAutopublish: workerAutopublish,
    TOR_GRUND: TOR_GRUND,
    ANTWORT: ANTWORT,
    ownerTor: ownerTor,
    externeQuellen: externeQuellen,
    alle: alle
  };

  if (isNode) module.exports = api;
  else global.VUSocialHardInvariants = api;
})(typeof window !== "undefined" ? window : globalThis);

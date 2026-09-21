/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/approval-projection.js

   WAS DER OWNER VOR DER FREIGABE SIEHT

   -------------------------------------------------------------------------
   DIESE DATEI ENTSCHEIDET NICHT, WER IN DER SCHLANGE STEHT
   -------------------------------------------------------------------------

   Sie BEKOMMT die Schlange. `owner-decision.warteschlange()` hat sie
   berechnet, und dieselbe Antwort geht an den Orchestrator und an das
   Approval Center.

   Das ist der Kern der Anforderung und kein Architekturgeschmack. Als
   der Reifebericht einmal selbst nachzaehlte - Dateien im Ordner statt
   Zustaende in der Maschine -, meldete er sechs wartende Beitraege, und
   es waren null: drei abgeloest, drei auf einem Haltegrund. Beide
   Zahlen waren "richtig gerechnet"; nur beantwortete die eine eine
   andere Frage.

   Deshalb zaehlt hier nichts. `activeCount` wird uebernommen, nicht
   ermittelt. Wer diese Datei aendert und dabei `.length` schreibt,
   baut den zweiten Rechenweg zurueck, den es schon einmal gab.

   -------------------------------------------------------------------------
   WAS SIE TUT
   -------------------------------------------------------------------------

   Aus jedem AKTIVEN Kandidaten macht sie zwei Dinge:

     payload    Was veroeffentlicht WUERDE. Nichts daneben, nichts
                davon abgeleitet. Die Vorschau IST die Sendung.

     anzeige    Was der Owner zur Entscheidung braucht: Thema, Hook,
                Familie, Format, Strategien, Zeit, Evidenz, Gueteprobe -
                und die drei Warum-Fragen.

   -------------------------------------------------------------------------
   DIE REGEL UEBER DIE BEGRUENDUNGEN
   -------------------------------------------------------------------------

   NUR VORHANDENE PROVENANCE. KEINE NACHTRAEGLICHE BEGRUENDUNG.

   Jedes Feld nennt seine Herkunft mit. Fehlt die Herkunft, steht dort
   NICHT_IN_DER_PROVENANCE - und nicht ein plausibler Satz.

   Der Unterschied ist nicht akademisch. Eine erfundene Begruendung
   liest sich genau wie eine echte, und der Owner entscheidet auf
   ihrer Grundlage ueber etwas Oeffentliches. Eine Luecke, die sich als
   Luecke zeigt, kostet Vertrauen; eine Luecke, die sich als Antwort
   tarnt, kostet die Entscheidung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Der Wert, den ein Feld traegt, dessen Herkunft fehlt. Ein eigener
     Marker und nicht null: null sieht aus wie "nichts", und "wir wissen
     es nicht" ist etwas anderes als "es ist nichts". */
  var FEHLT = "NICHT_IN_DER_PROVENANCE";

  var VERSION = "approval-projection-v1";

  /** Ein Wert mit seiner Herkunft. */
  function feld(wert, herkunft) {
    var leer = wert === undefined || wert === null || wert === "";
    return {
      value: leer ? null : wert,
      basis: leer ? FEHLT : String(herkunft)
    };
  }

  function pfad(objekt, weg) {
    var teile = String(weg).split(".");
    var akt = objekt;
    for (var i = 0; i < teile.length; i++) {
      if (akt === null || akt === undefined) return undefined;
      akt = akt[teile[i]];
    }
    return akt;
  }

  /** Ein Feld aus einem Pfad - und der Pfad ist zugleich die Herkunft. */
  function aus(kandidat, weg) {
    return feld(pfad(kandidat, weg), weg);
  }

  /* -----------------------------------------------------------------
     DIE DREI WARUM-FRAGEN

     Sie stehen nicht als Prosa in der Projektion, sondern als
     Zusammenstellung dessen, was die Pipeline tatsaechlich
     aufgeschrieben hat. Die Oberflaeche setzt daraus Saetze; die
     Substanz kommt von hier.
     ----------------------------------------------------------------- */

  function warumThema(k) {
    return {
      /* Die Erklaerung der Gelegenheit: Score und wichtigster Grund. */
      erklaerung: aus(k, "presentation.reason"),
      score: aus(k, "presentation.opportunityScore"),
      /* Wogegen sie sich durchgesetzt hat. Eine Auswahl ohne die
         Unterlegenen ist eine Behauptung ueber eine Rangfolge. */
      alternativen: feld(pfad(k, "presentation.alternatives"),
        "presentation.alternatives"),
      evidenz: feld(pfad(k, "provenance.signalIds"), "provenance.signalIds"),
      gelegenheit: aus(k, "provenance.opportunityId")
    };
  }

  function warumEinstieg(k) {
    return {
      erklaerung: aus(k, "presentation.authoring.reason"),
      muster: aus(k, "presentation.authoring.pattern"),
      autor: aus(k, "presentation.authoring.authorId"),
      geprueft: aus(k, "presentation.authoring.considered"),
      bestanden: aus(k, "presentation.authoring.passed"),
      /* Eine redaktionelle Nachbesserung ist Teil der Herkunft des
         Textes und darf nicht verschwinden, nur weil sie selten ist. */
      korrektur: aus(k, "presentation.authoring.editorialCorrection.reason")
    };
  }

  function warumVisual(k) {
    var r = pfad(k, "provenance.visualDirection");
    return {
      /* Die Bildidee - der Satz, der sagt, was das Bild zeigen soll
         und warum gerade das. */
      kernidee: feld(r && r.coreIdea, "provenance.visualDirection.coreIdea"),
      /* Was auf einem Telefon zuerst ankommen muss. */
      blickpunkt: feld(r && r.mobileFocalPoint,
        "provenance.visualDirection.mobileFocalPoint"),
      /* Woraus die Richtung abgeleitet wurde. Eine Begruendung, die
         ihre eigene Herkunft mitbringt. */
      ableitung: feld(r && r.derivation && r.derivation.explanation,
        "provenance.visualDirection.derivation.explanation"),
      spannung: feld(r && r.derivation && r.derivation.tension
        && r.derivation.tension.kind,
        "provenance.visualDirection.derivation.tension.kind"),
      mussZeigen: feld(r && r.mustShow, "provenance.visualDirection.mustShow"),
      darfNichtZeigen: feld(r && r.mustNotShow,
        "provenance.visualDirection.mustNotShow"),
      herkunft: aus(k, "presentation.visualOrigin"),
      strategie: aus(k, "provenance.visual.strategy")
    };
  }

  /* -----------------------------------------------------------------
     DIE GUETEPRUEFUNG

     `applicable: false` ist KEIN Bestehen und kein Durchfallen. Es
     heisst: diese Pruefung misst Text auf einer Flaeche, und dieses
     Bild traegt laut Brief keinen. Die drei Faelle duerfen in der
     Anzeige nicht zu zweien verschmelzen.
     ----------------------------------------------------------------- */
  function guete(k) {
    var q = pfad(k, "presentation.visualQuality");
    if (!q) return { zustand: FEHLT, score: null, erklaerung: null, warnungen: [] };
    if (q.applicable === false) {
      return {
        zustand: "NICHT_ANWENDBAR",
        score: null,
        erklaerung: q.explanation || null,
        warnungen: []
      };
    }
    return {
      zustand: q.passed === false ? "NICHT_BESTANDEN" : "BESTANDEN",
      score: typeof q.score === "number" ? q.score : null,
      erklaerung: q.explanation || null,
      warnungen: Array.isArray(q.warnings) ? q.warnings.slice() : []
    };
  }

  /* -------------------------------------------------------------------
     DER BILDZUSTAND AM EINTRAG

     Er kommt vom Messenden (publish-approval-queue.mjs) und wird hier
     nur weitergereicht. Diese Engine misst nichts — sie hat kein Netz
     und soll auch keines bekommen.
     ------------------------------------------------------------------- */
  function bildzustand(k) {
    var a = (k && k.assetDelivery) || null;
    var adresse = pfad(k, "content.imageUrl") || null;
    if (!a || typeof a !== "object" || !a.zustand) {
      return {
        zustand: "ASSET_REACHABILITY_UNVERIFIED",
        grund: "NOT_ASKED",
        erreichbar: false,
        url: null,
        satz: "Ob das Bild erreichbar ist, wurde zu dieser Uebertragung " +
          "nicht gemessen."
      };
    }
    /* ---------------------------------------------------------------
       GEMESSEN WURDE EINE ADRESSE, NICHT EIN KANDIDAT

       Zwischen Messung und Anzeige kann das Bild ausgetauscht worden
       sein - eine neue Fassung, ein anderer Zuschnitt, ein anderer
       Dateiname. Das Urteil gehoert zu der Adresse, die abgerufen
       wurde, und zu keiner anderen. Passt sie nicht zu dem, was
       veroeffentlicht wuerde, ist DIESES Bild ungeprueft: die
       Vorschau waere sonst ein anderes Asset als die Sendung.
       --------------------------------------------------------------- */
    if (!a.url || a.url !== adresse) {
      return {
        zustand: "ASSET_REACHABILITY_UNVERIFIED",
        grund: a.url ? "MEASURED_ANOTHER_URL" : "MEASUREMENT_WITHOUT_URL",
        erreichbar: false,
        url: a.url || null,
        satz: "Gemessen wurde nicht das Bild, das hier veroeffentlicht " +
          "wuerde. Fuer dieses Bild liegt keine Pruefung vor.",
        gemessenAm: a.gemessenAm || null
      };
    }
    return {
      zustand: a.zustand,
      grund: a.grund || null,
      /* Nicht das mitgelieferte Flag glauben: es ergibt sich aus dem
         Zustand, und zwei Quellen fuer dieselbe Aussage koennen
         auseinanderlaufen. */
      erreichbar: a.zustand === "ASSET_PUBLICLY_REACHABLE",
      url: a.url,
      satz: a.satz || null,
      gemessenAm: a.gemessenAm || null,

      /* -----------------------------------------------------------------
         DER ABDRUCK REIST MIT BIS ZUR SENDUNG

         Auch hier stand eine von Hand gepflegte Feldliste, und auch hier
         fiel der Abdruck heraus. Zweimal dieselbe Stelle, zweimal
         dasselbe verlorene Feld - deshalb steht es jetzt an beiden.

         Der Worker braucht ihn: er ist die EINZIGE Groesse, an der sich
         unmittelbar vor der Sendung pruefen laesst, ob hinter der
         Adresse noch dasselbe Bild liegt wie bei der Freigabe. `null`
         heisst NICHT GEMESSEN und sperrt die Freigabe - nicht "passt
         schon". */
      sha256: a.sha256 || null,
      bytes: a.bytes === undefined ? null : a.bytes,
      dimensions: a.dimensions || null
    };
  }

  /* -------------------------------------------------------------------
     DIE BESTANDTEILE — NUR, WENN SIE ZUM SENDETEXT GEHOEREN

     `presentation.hashtags` gibt es in diesem Bestand ZWEIMAL, mit
     zwei Bedeutungen:

       aeltere Kandidaten  eine abgeleitete Liste, die NIE in der
                           Caption stand - drei feste Tags unter jedem
                           Beitrag, die nirgends hingingen.
       neue Kandidaten     die Tags, die im Sendetext stehen, zusammen
                           mit `captionBase`, aus dem er entstand.

     Sie sehen gleich aus. Die alte Liste anzuzeigen hiesse, dem Owner
     Tags zu zeigen, die der Beitrag nicht traegt - und danach zu
     fragen, ob er das freigibt.

     `captionBase` unterscheidet die beiden: es wird ausschliesslich
     auf dem neuen Weg geschrieben, zusammen mit der Caption, aus
     derselben Ableitung. Ohne ihn gibt es hier keine Tags - nicht
     weil sie fehlen, sondern weil sie nicht zum Text gehoeren.
     ------------------------------------------------------------------- */
  function textteile(k) {
    var basis = pfad(k, "presentation.captionBase");
    var hat = typeof basis === "string" && basis.trim().length > 0;
    return {
      captionBase: hat ? basis : null,
      hashtags: hat && Array.isArray(pfad(k, "presentation.hashtags"))
        ? pfad(k, "presentation.hashtags").slice() : [],
      hashtagSatz: hat ? (pfad(k, "presentation.hashtagSatz") || null) : null
    };
  }

  /** Ein Kandidat als das, was der Owner sieht - und als das, was ginge. */
  function eintrag(k) {
    return {
      candidateId: k.candidateId || null,
      version: typeof k.version === "number" ? k.version : null,
      state: k.state || null,
      createdAt: k.createdAt || null,

      /* -------------------------------------------------------------
         VORSCHAU IST SENDUNG

         Genau die drei Werte, die spaeter an Meta gehen, und der
         Abdruck darueber. Kein zweiter Vorschautext, kein ersatzweise
         gerendertes Bild: sonst gibt der Owner etwas frei, das er
         nicht gesehen hat, und sieht etwas, das er nicht freigibt. */
      payload: {
        contentId: pfad(k, "content.contentId") || null,
        imageUrl: pfad(k, "content.imageUrl") || null,
        /* Das ist der FINAL_PUBLIC_TEXT: Caption, Leerzeile, Hashtags.
           Es gibt keinen zweiten Text — die Tags stehen HIER drin und
           nicht daneben, sonst liesse sich die Tagliste nach der
           Freigabe tauschen, waehrend der Abdruck weiter stimmt. */
        caption: pfad(k, "content.caption") === undefined
          ? null : pfad(k, "content.caption")
      },
      contentHash: k.contentHash || null,

      /* -------------------------------------------------------------
         DIE BESTANDTEILE — ZUM ZEIGEN, NICHT ZUM SENDEN

         Der Owner soll Text und Tags getrennt lesen koennen. Gesendet
         wird trotzdem nur `payload.caption`. Beide stammen aus
         derselben Ableitung; ein Test rechnet nach, dass
         finalerText(captionBase, hashtags) wieder payload.caption
         ergibt — sonst zeigte die Seite eine Zusammensetzung, die es
         so nie gab. */
      text: textteile(k),

      /* -------------------------------------------------------------
         KOMMT DAS BILD AN? (§4/§5/§6)

         Gemessen wird dort, wo es messbar ist: im Lauf, der die
         Schlange uebertraegt — der erreicht research.visionuniverse.de.
         Der Worker zeigt nur, was ihm gesagt wurde, und sperrt die
         Freigabe, solange es nicht ERREICHBAR heisst.

         Fehlt die Angabe ganz, ist das UNGEPRUEFT und nicht "in
         Ordnung": eine aeltere Uebertragung kennt das Feld nicht, und
         auch dann darf niemand etwas freigeben, dessen Bild niemand
         gesehen hat. */
      asset: bildzustand(k),

      anzeige: {
        thema: aus(k, "presentation.topic"),
        hook: aus(k, "presentation.hook"),
        familie: feld(pfad(k, "provenance.audienceFrame.family"),
          "provenance.audienceFrame.family"),
        familieBasis: feld(pfad(k, "provenance.audienceFrame.familyBasis"),
          "provenance.audienceFrame.familyBasis"),
        kernfrage: feld(pfad(k, "provenance.audienceFrame.coreQuestion"),
          "provenance.audienceFrame.coreQuestion"),
        format: aus(k, "presentation.mediaFormat"),
        bildform: aus(k, "presentation.visualType"),
        /* Die Erzaehlrichtung: welcher Archetyp diesen Beitrag traegt. */
        storyRichtung: aus(k, "provenance.archetype"),
        hookStrategie: aus(k, "presentation.authoring.pattern"),
        visualStrategie: aus(k, "provenance.visual.strategy"),
        /* Erkunden oder Ausnutzen - und warum. */
        modus: aus(k, "presentation.mode"),
        modusGrund: aus(k, "presentation.modeReason"),
        geplanteStundeUtc: aus(k, "presentation.plannedHourUtc"),
        zeitGrund: aus(k, "presentation.timingReason"),
        strategieVersion: aus(k, "presentation.strategyVersion")
      },

      guete: guete(k),

      warum: {
        thema: warumThema(k),
        einstieg: warumEinstieg(k),
        visual: warumVisual(k)
      }
    };
  }

  /**
   * Die Projektion.
   *
   * @param schlange  das Ergebnis von OwnerDecision.warteschlange()
   * @param nachId    { candidateId: vollstaendiger Kandidat }
   * @param options   { now }
   *
   * Ein aktiver Kandidat, zu dem kein vollstaendiger Datensatz
   * vorliegt, wird NICHT stillschweigend weggelassen: er steht unter
   * `unresolved`, und `complete` ist dann falsch. Ein Beitrag, der aus
   * der Schlange verschwindet, weil eine Datei fehlte, waere ein
   * Beitrag, den niemand mehr sieht und niemand vermisst.
   */
  function projiziere(schlange, nachId, options) {
    var o = options || {};
    var s = schlange || {};
    var karte = nachId || {};

    var eintraege = [];
    var offen = [];

    (s.active || []).forEach(function (zeile) {
      var id = zeile && zeile.candidateId;
      var k = id ? karte[id] : null;
      if (!k) { offen.push({ candidateId: id || null, reason: "KANDIDAT_NICHT_GELESEN" }); return; }
      eintraege.push(eintrag(k));
    });

    return {
      version: VERSION,
      generatedAt: o.now || new Date().toISOString(),

      /* UEBERNOMMEN, NICHT GEZAEHLT. Siehe den Kopf dieser Datei. */
      activeCount: s.activeCount,
      source: "owner-decision.warteschlange",
      countedFiles: s.countedFiles === true,
      explanation: s.explanation || null,

      items: eintraege,
      unresolved: offen,
      /* Die Projektion beschreibt sich selbst als vollstaendig oder
         nicht. Der Leser muss es nicht aus zwei Laengen erschliessen. */
      complete: offen.length === 0 && eintraege.length === s.activeCount,

      /* Was NICHT wartet, mit Grund. Der Owner sieht es nicht; wer den
         Betrieb prueft, schon - und findet dann nicht nur eine Null. */
      /* -----------------------------------------------------------------
         WAS DER LAUF INHALTLICH GETAN HAT (§16/§39–§41)

         Die Warteschlange sagt, was WARTET. Sie sagt nichts darueber,
         warum heute nichts wartet - und genau das ist die Frage, die
         ein Owner vor einer leeren Seite stellt.

         DURCHGEREICHT, NICHT GERECHNET. Der Nachweis entsteht in
         no-post.js aus der Kadenzentscheidung und dem Suchnachweis des
         Zyklus. Ihn hier noch einmal herzuleiten waere eine zweite
         Wahrheit ueber denselben Tag; diese Datei uebernimmt ihn
         unveraendert oder laesst ihn null.

         `null` heisst "nicht uebertragen" und NICHT "nichts
         passiert" - die Oberflaeche muss den Unterschied zeigen
         koennen, genau wie bei der Schlange selbst. */
      contentStatus: o.contentStatus || null,

      held: (s.held || []).slice(),
      decided: (s.decided || []).slice(),
      unknown: (s.unknown || []).slice(),
      total: s.total
    };
  }

  var api = {
    VERSION: VERSION,
    FEHLT: FEHLT,
    feld: feld,
    eintrag: eintrag,
    guete: guete,
    warumThema: warumThema,
    warumEinstieg: warumEinstieg,
    warumVisual: warumVisual,
    projiziere: projiziere
  };

  if (isNode) module.exports = api;
  else global.VUSocialApprovalProjection = api;
})(typeof window !== "undefined" ? window : globalThis);

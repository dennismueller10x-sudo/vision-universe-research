/* =========================================================================
   VISION UNIVERSE SOCIAL — Der Transport eines Binaerassets

   -------------------------------------------------------------------------
   ZWEI DINGE, DIE NICHTS MITEINANDER ZU TUN HABEN
   -------------------------------------------------------------------------

   PR 106 hat beides zugleich gezeigt:

     Der Agent hat ein Bild ERZEUGT.   Text, Caption, Visual Brief und
                                       Ergebnisdokument waren einwandfrei.
     Das Bild ist nicht ANGEKOMMEN.    Die Chunk-Kette brach bei Offset
                                       416.983, die Datei endete auf exakt
                                       768 KiB plus zwoelf Bytes.

   Wer das zusammenwirft, lernt Unsinn: dass diese Hook schlecht sei, dass
   diese Visual Strategy nicht funktioniere, dass die Evidenz schwach war.
   Nichts davon hat mit einem abgerissenen Dateitransfer zu tun.

   Deshalb ein eigener Fehlertyp, der ausdruecklich KEIN Inhaltsurteil ist.

   -------------------------------------------------------------------------
   COMPLETED IST NICHT COMPLETED
   -------------------------------------------------------------------------

   Das Ergebnisdokument aus PR 106 trug:

       processing.status = "completed"

   waehrend das Asset im selben Commit beschaedigt war. Der Agent hat nicht
   gelogen - er hat berichtet, was er von seiner Seite sehen konnte.

   Nur ist das nicht dieselbe Frage. Was der Agent meldet, ist eine Aussage
   ueber SEINEN Lauf. Was Vision Universe braucht, ist eine Aussage ueber
   das, was tatsaechlich im Repository liegt. Die zweite Aussage kann nur
   treffen, wer nachgesehen hat.

     AGENT_REPORTED_COMPLETED   der Agent sagt, er sei fertig
     VU_VERIFIED_COMPLETED      wir haben nachgesehen und es stimmt

   Das erste darf nie das zweite ersetzen.

   -------------------------------------------------------------------------
   DIE KETTE, DIE ERFUELLT SEIN MUSS
   -------------------------------------------------------------------------

   Ein Creative Package ist fuer Vision Universe nur dann vollstaendig,
   wenn ALLES davon zutrifft - nicht das meiste:

     RESULT JSON VALID           das Dokument ist lesbar und konform
     IDENTITIES VALID            Kennungen nachgerechnet, nicht geglaubt
     ASSET EXISTS                die Datei liegt am vereinbarten Ort
     MIME VALID                  ihr Inhalt ist das, was sie zu sein behauptet
     IMAGE STRUCTURE VALID       die Chunk-Kette laeuft von vorn bis IEND
     DIMENSIONS VALID            Breite und Hoehe wie angekuendigt
     BYTE SIZE VALID             die Groesse stimmt mit der Ankuendigung
     SHA256 MATCH                Byte fuer Byte derselbe Inhalt
     FRESH GITHUB READBACK VALID neu gelesen vom finalen Commit

   Erst danach VU_VERIFIED_COMPLETED.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Integrity = isNode ? require("./asset-integrity.js") : global.VUSocialAssetIntegrity;

  /* Der eigene Fehlertyp. Er beschreibt den WEG, nicht den INHALT. */
  var TRANSPORT_FEHLER = "ASSET_TRANSPORT_INTEGRITY_FAILED";

  /* Die Pflichtpruefungen in der Reihenfolge, in der sie Sinn ergeben:
     erst ob etwas da ist, dann was es ist, dann ob es ganz ist, dann ob
     es das angekuendigte ist. */
  var PRUEFUNGEN = [
    "resultJsonValid", "identitiesValid", "assetExists", "mimeValid",
    "imageStructureValid", "dimensionsValid", "byteSizeValid",
    "sha256Match", "freshReadbackValid"
  ];

  /**
   * Prueft ein zurueckgelesenes Asset gegen das, was das Ergebnis
   * ankuendigt.
   *
   * `gelesen` ist der FRISCH vom finalen Commit geholte Inhalt - nicht
   * der, den wir vor dem Schreiben in der Hand hatten. Genau darin liegt
   * der Sinn: zwischen dem, was wir schicken wollten, und dem, was
   * ankommt, liegt der Transport.
   */
  function verifyTransfer(gelesen, angekuendigt, options) {
    options = options || {};
    var a = angekuendigt || {};
    var befunde = [];
    var bestanden = {};

    function pruefe(name, ok, meldung) {
      bestanden[name] = ok === true;
      if (!ok) befunde.push({ check: name, message: meldung });
      return ok === true;
    }

    if (!pruefe("assetExists", !!(gelesen && gelesen.length),
        "Unter " + (a.asset_path || "dem angegebenen Pfad") + " liegt nichts.")) {
      return abschluss(bestanden, befunde, null);
    }

    var mime = Integrity.detectMime(gelesen);
    pruefe("mimeValid", !a.mime_type || mime === a.mime_type,
      "Der Inhalt ist " + mime + ", angekuendigt war " + a.mime_type + ".");

    var struktur = Integrity.structure(gelesen, mime);
    pruefe("imageStructureValid", struktur.ok,
      "Die innere Struktur bricht: " + struktur.reason + ".");

    var masse = Integrity.dimensions(gelesen, mime) || {};
    pruefe("dimensionsValid",
      (!a.width || masse.width === a.width) && (!a.height || masse.height === a.height),
      "Abmessungen " + masse.width + "x" + masse.height + ", angekuendigt " +
      a.width + "x" + a.height + ".");

    /* Die Groesse ist nur pruefbar, wenn sie angekuendigt wurde. Fehlt
       die Angabe, ist das ein Befund ueber den Vertrag und keiner ueber
       die Datei - deshalb kein stilles Bestehen. */
    if (a.byte_size === undefined || a.byte_size === null) {
      bestanden.byteSizeValid = null;
    } else {
      pruefe("byteSizeValid", gelesen.length === a.byte_size,
        "Die Datei hat " + gelesen.length + " Bytes, angekuendigt waren " +
        a.byte_size + " (Differenz " + (gelesen.length - a.byte_size) + ").");
    }

    var hash = Integrity.sha256(gelesen);
    pruefe("sha256Match", !a.asset_sha256 || hash === a.asset_sha256,
      "SHA-256 ist " + hash + ", angekuendigt war " + a.asset_sha256 + ".");

    pruefe("freshReadbackValid", options.freshReadback === true,
      "Der Inhalt wurde nicht frisch vom finalen Commit gelesen. Eine " +
      "Pruefung gegen den Puffer, aus dem geschrieben wurde, prueft den " +
      "Transport nicht.");

    return abschluss(bestanden, befunde, {
      mimeType: mime, byteSize: gelesen.length, sha256: hash,
      width: masse.width || null, height: masse.height || null,
      structure: struktur
    });
  }

  function abschluss(bestanden, befunde, gemessen) {
    var ok = befunde.length === 0;
    return {
      ok: ok,
      state: ok ? "TRANSFER_VERIFIED" : TRANSPORT_FEHLER,
      failureType: ok ? null : TRANSPORT_FEHLER,
      /* Ausdruecklich: das hier ist KEIN Urteil ueber Hook, Visual
         Strategy, Evidenz oder Autor. Ein abgerissener Dateitransfer
         sagt ueber den Inhalt nichts. */
      contentJudgement: false,
      checks: bestanden,
      findings: befunde,
      measured: gemessen,
      explanation: ok
        ? "Das zurueckgelesene Asset stimmt in Typ, Struktur, Abmessungen, " +
          "Groesse und Hash mit der Ankuendigung ueberein."
        : befunde.map(function (f) { return f.check + ": " + f.message; }).join(" ")
    };
  }

  /**
   * Der kanonische Abschluss eines Creative Package.
   *
   * `agentStatus` ist, was der Agent MELDET. Es fliesst in den Bericht
   * ein und entscheidet nichts.
   */
  function verifyCompletion(spec) {
    spec = spec || {};
    var checks = Object.assign({}, (spec.transfer && spec.transfer.checks) || {});
    checks.resultJsonValid = spec.resultJsonValid === true;
    checks.identitiesValid = spec.identitiesValid === true;

    var offen = PRUEFUNGEN.filter(function (p) { return checks[p] !== true; });

    return {
      agentReportedCompleted: String(spec.agentStatus || "").toLowerCase() === "completed",
      vuVerifiedCompleted: offen.length === 0,
      checks: checks,
      missing: offen,
      failureType: offen.length === 0 ? null
        : ((spec.transfer && spec.transfer.failureType) || null),
      explanation: offen.length === 0
        ? "Alle neun Pflichtpruefungen bestanden. VU_VERIFIED_COMPLETED."
        : "Offen: " + offen.join(", ") + ". Der Agent meldet \"" +
          (spec.agentStatus || "—") + "\" - das ist eine Aussage ueber seinen " +
          "Lauf und keine ueber das, was im Repository liegt."
    };
  }

  var api = {
    TRANSPORT_FEHLER: TRANSPORT_FEHLER,
    PRUEFUNGEN: PRUEFUNGEN,
    verifyTransfer: verifyTransfer,
    verifyCompletion: verifyCompletion
  };

  if (isNode) module.exports = api;
  else global.VUSocialAssetTransport = api;
})(typeof window !== "undefined" ? window : globalThis);

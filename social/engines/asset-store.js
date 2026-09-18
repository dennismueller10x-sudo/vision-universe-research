/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/asset-store.js

   WO EIN BINAERASSET HINGEHOERT — UND WIE ES DORT ANKOMMT

   -------------------------------------------------------------------------
   DIE ARBEITSTEILUNG
   -------------------------------------------------------------------------

     GitHub        Vertraege, Briefs, Result JSON, Provenance, Code,
                   Strategie. Alles, was man liest, vergleicht und
                   begruendet. Source of Truth.

     VU Storage    Das Binaerasset selbst. Ein 1,9-MB-PNG in der
                   Git-Historie ist fuer immer dort - jeder Klon traegt
                   es mit, auch wenn der Beitrag nie erschienen ist.

     Content       Ein stabiler Verweis samt SHA-256, Groesse,
       Object      Abmessungen, MIME und Herkunft. Nicht die Bytes.

   Der Speicher ist nicht neu: scripts/market/storage/s3-driver.mjs
   spricht S3 in reinem Node und laeuft in der Quant-Historie
   produktiv, gegen dieselben Zugangsdaten (VU_HISTORY_S3_*), die als
   Repository-Secrets bereits gesetzt sind. Kein neuer Dienst, keine
   neuen laufenden Kosten, keine Owner-Eskalation.

   -------------------------------------------------------------------------
   ERZEUGUNG UND TRANSPORT SIND ZWEI LEBENSLAeUFE
   -------------------------------------------------------------------------

   Das ist der Kern. Ein Creative Agent, der ein gueltiges Bild erzeugt
   hat, hat seine Arbeit getan - auch wenn die Datei unterwegs zerbricht.
   Die beiden Zustaende duerfen nie zusammenfallen:

     IMAGE_GENERATION_SUCCESS    das Bild existiert und ist gueltig
     IMAGE_TRANSPORT_SUCCESS     es liegt unversehrt bei uns

   Faellt das zweite aus, wird das ERSTE nicht wiederholt. Ein neuer
   Lauf kostet eine begrenzte Ressource, erzeugt ein ANDERES Bild und
   wirft eine erbrachte Leistung weg. Wiederholt wird der Transport.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var Transport = isNode ? require("./asset-transport.js")
    : global.VUSocialAssetTransport;

  /* Die Lebenslaeufe, getrennt gefuehrt. */
  var ERZEUGUNG = ["IMAGE_NOT_REQUESTED", "IMAGE_GENERATION_REQUESTED",
    "IMAGE_GENERATION_SUCCESS", "IMAGE_GENERATION_FAILED"];

  var TRANSPORT = ["ASSET_NOT_TRANSFERRED", "ASSET_HANDED_OFF",
    "ASSET_INGESTED", "ASSET_STORED", "ASSET_VERIFIED",
    "ASSET_TRANSPORT_INTEGRITY_FAILED"];

  /* -------------------------------------------------------------------
     WAS EIN TRANSPORTFEHLER NIEMALS IST

     Ein abgerissener Dateitransfer sagt ueber Hook, Visual Strategy,
     Evidenz oder Autor nichts. Ihn als Inhaltsfehler zu lernen hiesse,
     dem System beizubringen, dass FUTURE_TECH schlecht laeuft - weil
     einmal eine Leitung abbrach.
     ------------------------------------------------------------------- */
  var NIEMALS = ["CONTENT_FAILED", "HOOK_FAILED", "VISUAL_STRATEGY_FAILED",
    "EVIDENCE_FAILED"];

  /**
   * Der Speicherort eines Assets.
   *
   * Aus der IDENTITAET, nicht aus einem Zaehler und nicht aus der Zeit:
   * derselbe Inhalt landet an derselben Stelle, und ein zweiter
   * Transport desselben Assets ueberschreibt sich selbst statt eine
   * zweite Kopie anzulegen.
   */
  function key(spec) {
    spec = spec || {};
    var sha = String(spec.sha256 || "");
    if (!/^[0-9a-f]{64}$/.test(sha)) {
      throw new Error("VUSocialAssetStore: ein Speicherort ohne SHA-256 " +
        "waere nicht wiederfindbar.");
    }
    var endung = ({ "image/png": "png", "image/jpeg": "jpg" })[spec.mime] || "bin";
    /* Zwei Ebenen, damit ein Bucket-Listing lesbar bleibt. */
    return "social/assets/" + sha.slice(0, 2) + "/" + sha + "." + endung;
  }

  /**
   * Der Verweis, der ins Content Object wandert.
   *
   * Absichtlich OHNE die Bytes und ohne eine erratene oeffentliche URL:
   * ob und unter welcher Adresse ein Asset oeffentlich erreichbar ist,
   * entscheidet die Infrastruktur und nicht diese Datei. Wer eine URL
   * braucht, bekommt sie von dort - erfunden wird keine.
   */
  function reference(spec) {
    spec = spec || {};
    return {
      storage: "VU_OBJECT_STORAGE",
      key: key(spec),
      sha256: spec.sha256,
      byteSize: spec.byteSize === undefined ? null : spec.byteSize,
      mime: spec.mime || null,
      width: spec.width || null,
      height: spec.height || null,
      /* Woher es stammt - damit ein Asset nie herkunftslos wird. */
      provenance: {
        contentId: spec.contentId || null,
        visualVariantId: spec.visualVariantId || null,
        briefRevision: spec.briefRevision || null,
        generator: spec.generator || null,
        generatedAt: spec.generatedAt || null
      }
    };
  }

  /**
   * Die Aufnahme in den VU-Speicher.
   *
   * `gelesen`       die Bytes, FRISCH von der Quelle gelesen
   * `angekuendigt`  was der Erzeuger ueber sie behauptet
   * `readback`      liest zurueck, was gespeichert wurde
   *
   * Der Vertrag ist derselbe wie beim GitHub-Weg - asset-transport.js
   * prueft, diese Datei entscheidet nur, wohin es geht. Zwei
   * Pruefungen mit zwei Meinungen waeren zwei Wahrheiten.
   */
  function ingest(gelesen, angekuendigt, options) {
    options = options || {};
    var befund = Transport.verifyTransfer(gelesen, angekuendigt,
      { freshReadback: options.freshReadback === true,
        readback: options.readback });

    if (!befund.ok) {
      return {
        ok: false,
        generation: "IMAGE_GENERATION_SUCCESS",
        transport: "ASSET_TRANSPORT_INTEGRITY_FAILED",
        failureType: Transport.TRANSPORT_FEHLER,
        /* Woertlich mitgeschrieben, weil die Verwechslung teuer waere. */
        contentJudgement: false,
        mustNotLearnAs: NIEMALS,
        regenerate: false,
        verification: befund,
        explanation: "Das Asset kam beschaedigt an. Der Creative Agent hat " +
          "seine Arbeit getan - wiederholt wird der TRANSPORT, nicht die " +
          "Erzeugung. " + befund.explanation
      };
    }

    return {
      ok: true,
      generation: "IMAGE_GENERATION_SUCCESS",
      transport: "ASSET_VERIFIED",
      failureType: null,
      contentJudgement: false,
      regenerate: false,
      reference: reference({
        sha256: befund.measured.sha256,
        byteSize: befund.measured.byteSize,
        mime: befund.measured.mimeType,
        width: befund.measured.width,
        height: befund.measured.height,
        contentId: options.contentId,
        visualVariantId: options.visualVariantId,
        briefRevision: options.briefRevision,
        generator: options.generator,
        generatedAt: options.generatedAt
      }),
      verification: befund,
      explanation: "Aufgenommen und verifiziert."
    };
  }

  /**
   * Darf ein neuer Creative-Lauf entstehen?
   *
   * Die Antwort ist fast immer nein. Nur wenn die QUELLE selbst weg ist,
   * gibt es nichts mehr zu uebertragen - und dann ist es ein neuer
   * versionierter Vorgang und kein stiller Retry.
   */
  function needsRegeneration(zustand) {
    zustand = zustand || {};
    if (zustand.generation !== "IMAGE_GENERATION_SUCCESS") {
      return { regenerate: true, reason: "noValidSource",
        message: "Es gibt kein gueltig erzeugtes Bild. Hier faengt ein " +
          "Creative-Lauf tatsaechlich von vorn an." };
    }
    if (zustand.sourceAvailable === false) {
      return { regenerate: true, reason: "sourceGone",
        message: "Das erzeugte Asset ist technisch nicht mehr erreichbar. " +
          "Damit gibt es nichts zu uebertragen. Das ist ein NEUER " +
          "versionierter Creative-Vorgang - kein stiller zweiter Versuch " +
          "unter derselben Kennung." };
    }
    return { regenerate: false, reason: "transportOnly",
      message: "Das Bild existiert und ist gueltig. Zu wiederholen ist der " +
        "Transport. Ein neuer Creative-Lauf kostete eine begrenzte " +
        "Ressource, erzeugte ein ANDERES Bild und wuerfe eine erbrachte " +
        "Leistung weg." };
  }

  var api = {
    ERZEUGUNG: ERZEUGUNG, TRANSPORT: TRANSPORT, NIEMALS: NIEMALS,
    key: key, reference: reference, ingest: ingest,
    needsRegeneration: needsRegeneration
  };

  if (isNode) module.exports = api;
  else global.VUSocialAssetStore = api;
})(typeof window !== "undefined" ? window : globalThis);

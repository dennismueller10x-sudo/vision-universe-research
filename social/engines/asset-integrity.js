/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/asset-integrity.js

   EIN HALBES BILD SIEHT AUS WIE EIN BILD

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Im realen Bildproof des Creative Agents entstand beim ersten
   Schreibversuch ein VERKUERZTER Bildtransfer. Ein korrigierter Commit
   ersetzte ihn.

   Das ist kein Schoenheitsfehler. Eine abgeschnittene Datei hat die
   richtige Signatur, die richtige Kopfzeile, die richtigen Abmessungen
   im Header — und sie ist trotzdem kaputt. Jede Pruefung, die nur vorn
   hinsieht, sagt "in Ordnung".

   Bemerkbar macht sich das erst bei Meta: der Container wird abgelehnt,
   NACHDEM der Anspruch angemeldet ist. Danach weiss niemand ohne
   nachzusehen, ob ein Beitrag entstanden ist.

   -------------------------------------------------------------------------
   DESHALB WIRD DAS ENDE GEPRUEFT
   -------------------------------------------------------------------------

   Ein PNG endet mit einem IEND-Chunk, ein JPEG mit FF D9. Beides steht
   am DATEIENDE, und beides fehlt genau dann, wenn der Transfer abbrach.
   Das ist die einzige Pruefung, die einen abgeschnittenen Transfer
   sicher findet, ohne das Bild zu dekodieren.

   -------------------------------------------------------------------------
   UND DESHALB WIRD ZURUECKGELESEN
   -------------------------------------------------------------------------

   Geprueft wird nicht, was der Erzeuger BEHAUPTET, sondern was am Ziel
   ANKOMMT. Ein Ergebnis mit Binaerasset darf erst dann `COMPLETED`
   heissen, wenn die Datei vom endgueltigen Commit frisch gelesen und
   erneut verglichen wurde.

   Scheitert der Vergleich, ist der Zustand `RECOVERY_REQUIRED` — nicht
   "wird schon". Ein stiller Force-Update-Pfad wuerde die Herkunft
   loeschen, und die Herkunft ist bei einem oeffentlichen Beitrag das
   Einzige, was spaeter die Frage beantwortet, was eigentlich gesendet
   wurde.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var nodeCrypto = isNode ? require("crypto") : null;

  /* Die Zustaende eines Creative Results mit Binaerasset. Die Reihenfolge
     ist der Vertrag: `COMPLETED` gibt es nur nach `READBACK_VERIFIED`. */
  var STATES = ["PENDING", "GENERATED", "COMMITTED", "READBACK_VERIFIED",
                "COMPLETED", "RECOVERY_REQUIRED"];

  var SIGNATURES = [
    { mime: "image/png",  magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
    { mime: "image/jpeg", magic: [0xFF, 0xD8, 0xFF] },
    { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] }   /* RIFF; WEBP folgt bei 8 */
  ];

  function startsWith(buf, magic) {
    if (!buf || buf.length < magic.length) return false;
    for (var i = 0; i < magic.length; i += 1) if (buf[i] !== magic[i]) return false;
    return true;
  }

  /** Der Typ aus den BYTES, nicht aus der Dateiendung. */
  function detectMime(buf) {
    for (var i = 0; i < SIGNATURES.length; i += 1) {
      if (startsWith(buf, SIGNATURES[i].magic)) {
        if (SIGNATURES[i].mime === "image/webp") {
          if (buf.length < 12) return null;
          var tag = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
          return tag === "WEBP" ? "image/webp" : null;
        }
        return SIGNATURES[i].mime;
      }
    }
    return null;
  }

  /**
   * Ist die Datei VOLLSTAENDIG?
   *
   * Die Frage, die der Proof aufgeworfen hat. Ein abgeschnittener
   * Transfer hat einen intakten Anfang; nur das Ende fehlt.
   */
  function isComplete(buf, mime) {
    if (!buf || !buf.length) return { ok: false, reason: "leer" };

    if (mime === "image/png") {
      /* Der letzte Chunk eines PNG ist IEND: 4 Byte Laenge (0), "IEND",
         4 Byte CRC. Er steht immer am Dateiende. */
      if (buf.length < 12) return { ok: false, reason: "zu kurz fuer einen IEND-Chunk" };
      var iend = buf.slice(buf.length - 8, buf.length - 4);
      var typ = String.fromCharCode(iend[0], iend[1], iend[2], iend[3]);
      return typ === "IEND"
        ? { ok: true, reason: null }
        : { ok: false, reason: "kein IEND am Dateiende — der Transfer brach ab" };
    }

    if (mime === "image/jpeg") {
      if (buf.length < 4) return { ok: false, reason: "zu kurz" };
      var ok = buf[buf.length - 2] === 0xFF && buf[buf.length - 1] === 0xD9;
      return ok
        ? { ok: true, reason: null }
        : { ok: false, reason: "kein EOI (FF D9) am Dateiende — der Transfer brach ab" };
    }

    if (mime === "image/webp") {
      /* Die RIFF-Laenge steht im Header und muss zur Dateigroesse
         passen. Ein abgeschnittenes WEBP verraet sich daran. */
      if (buf.length < 12) return { ok: false, reason: "zu kurz" };
      var riff = buf.readUInt32LE ? buf.readUInt32LE(4)
        : (buf[4] | (buf[5] << 8) | (buf[6] << 16) | (buf[7] << 24));
      var erwartet = riff + 8;
      return buf.length >= erwartet
        ? { ok: true, reason: null }
        : { ok: false, reason: "RIFF nennt " + erwartet + " Bytes, vorhanden sind " +
            buf.length + " — der Transfer brach ab" };
    }

    return { ok: false, reason: "unbekannter Typ, Vollstaendigkeit nicht pruefbar" };
  }

  /** Abmessungen aus den Bytes. */
  function dimensions(buf, mime) {
    if (mime === "image/png") {
      if (buf.length < 24) return { width: null, height: null };
      return {
        width: (buf[16] << 24 | buf[17] << 16 | buf[18] << 8 | buf[19]) >>> 0,
        height: (buf[20] << 24 | buf[21] << 16 | buf[22] << 8 | buf[23]) >>> 0
      };
    }

    if (mime === "image/jpeg") {
      for (var i = 2; i < buf.length - 9; ) {
        if (buf[i] !== 0xFF) { i += 1; continue; }
        var marker = buf[i + 1];
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 &&
            marker !== 0xC8 && marker !== 0xCC) {
          return { width: (buf[i + 7] << 8) | buf[i + 8],
                   height: (buf[i + 5] << 8) | buf[i + 6] };
        }
        i += 2 + ((buf[i + 2] << 8) | buf[i + 3]);
      }
      return { width: null, height: null };
    }

    if (mime === "image/webp") {
      /* Nur das einfache VP8L/VP8X-Format; der Rest waere ein Decoder. */
      if (buf.length > 30 && String.fromCharCode(buf[12], buf[13], buf[14]) === "VP8") {
        if (buf[15] === 0x58) {  /* VP8X */
          return {
            width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
            height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
          };
        }
      }
      return { width: null, height: null };
    }

    return { width: null, height: null };
  }

  function sha256(buf) {
    if (!nodeCrypto) throw new Error("VUSocialAssetIntegrity: nur unter Node.");
    return nodeCrypto.createHash("sha256").update(buf).digest("hex");
  }

  /**
   * Prueft eine Datei gegen das, was ueber sie behauptet wird.
   *
   * @param buf       die tatsaechlichen Bytes
   * @param declared  { asset_sha256, mime_type, width, height, bytes }
   */
  function verify(buf, declared) {
    declared = declared || {};
    var befunde = [];

    var mime = detectMime(buf);
    if (!mime) {
      befunde.push({ id: "unknownType",
        message: "Die Bytes gehoeren zu keinem bekannten Bildformat." });
    }

    var vollstaendig = isComplete(buf, mime);
    if (!vollstaendig.ok) {
      befunde.push({ id: "truncated",
        message: "Die Datei ist unvollstaendig: " + vollstaendig.reason + "." });
    }

    var masse = dimensions(buf, mime);
    var hash = sha256(buf);

    if (declared.mime_type && mime && declared.mime_type !== mime) {
      befunde.push({ id: "mimeMismatch",
        message: "Angegeben " + declared.mime_type + ", tatsaechlich " + mime + "." });
    }
    if (declared.asset_sha256 &&
        String(declared.asset_sha256).toLowerCase() !== hash) {
      befunde.push({ id: "hashMismatch",
        message: "Der Hash stimmt nicht: angegeben " +
          String(declared.asset_sha256).slice(0, 16) + "..., tatsaechlich " +
          hash.slice(0, 16) + "..." });
    }
    if (declared.width && masse.width && Number(declared.width) !== masse.width) {
      befunde.push({ id: "widthMismatch",
        message: "Breite angegeben " + declared.width + ", tatsaechlich " + masse.width + "." });
    }
    if (declared.height && masse.height && Number(declared.height) !== masse.height) {
      befunde.push({ id: "heightMismatch",
        message: "Hoehe angegeben " + declared.height + ", tatsaechlich " + masse.height + "." });
    }
    if (declared.bytes && Number(declared.bytes) !== buf.length) {
      befunde.push({ id: "sizeMismatch",
        message: "Groesse angegeben " + declared.bytes + ", tatsaechlich " + buf.length + "." });
    }

    return {
      ok: befunde.length === 0,
      actual: { mime_type: mime, width: masse.width, height: masse.height,
                asset_sha256: hash, bytes: buf.length },
      complete: vollstaendig.ok,
      findings: befunde,
      explanation: befunde.length === 0
        ? "Vollstaendig und wie angegeben: " + mime + ", " + masse.width + "x" +
          masse.height + ", " + buf.length + " Bytes."
        : befunde.length + " Abweichung(en): " +
          befunde.map(function (b) { return b.id; }).join(", ") + "."
    };
  }

  /**
   * Der Zustandsuebergang nach dem Ruecklesen.
   *
   * Es gibt genau zwei Ausgaenge, und "wird schon" ist keiner davon.
   */
  function settle(readback, options) {
    options = options || {};
    if (readback && readback.ok) {
      return {
        state: "COMPLETED",
        recoverable: false,
        explanation: "Vom endgueltigen Commit zurueckgelesen und geprueft. " +
          readback.explanation
      };
    }
    return {
      state: "RECOVERY_REQUIRED",
      recoverable: true,
      /* Was zu tun ist, steht dabei — und was NICHT zu tun ist. */
      explanation: "Das zurueckgelesene Asset weicht ab: " +
        ((readback && readback.explanation) || "kein Befund") +
        " Der Zustand bleibt RECOVERY_REQUIRED. Ein stiller Force-Update wuerde " +
        "die Herkunft loeschen; eine Neuerzeugung braucht eine neue Brief-Revision " +
        "und damit neue Varianten-Kennungen.",
      requiredAction: options.requiredAction ||
        "Neue Brief-Revision erzeugen und den Creative Agent erneut anstossen. " +
        "Das alte Ergebnis bleibt als gescheiterter Versuch erhalten."
    };
  }

  var api = {
    STATES: STATES,
    detectMime: detectMime,
    isComplete: isComplete,
    dimensions: dimensions,
    sha256: sha256,
    verify: verify,
    settle: settle
  };

  if (isNode) module.exports = api;
  else global.VUSocialAssetIntegrity = api;
})(typeof window !== "undefined" ? window : globalThis);

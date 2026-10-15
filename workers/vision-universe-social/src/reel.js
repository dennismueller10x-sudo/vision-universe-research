/* =========================================================================
   VISION UNIVERSE SOCIAL — workers/vision-universe-social/src/reel.js

   REELS: DAS VIDEO MESSEN, BEVOR ES FREIGEGEBEN ODER GESENDET WIRD

   Ein Bild laesst sich im Worker komplett lesen und hashen. Ein Reel nicht:
   bis zu 300 MB passen nicht in den Speicher eines Workers. Der Abdruck eines
   Videos ist deshalb ein TEILABDRUCK: SHA-256 ueber die ersten 64 KiB, die
   letzten 64 KiB und die Dateigroesse. Er faengt das, was in der Praxis
   passiert (Datei ersetzt, neu gerendert, abgeschnitten, anderer Host-Inhalt),
   und er ist ehrlich benannt - es ist kein Vollabdruck.

   Was NICHT geprueft wird: Dauer, Seitenverhaeltnis, Codec. Das liegt im
   moov-Block und wird erst bei Meta gelesen; Meta meldet es im Container-
   Status (ERROR) - NACH dem Anlegen, aber VOR der Veroeffentlichung.
   ========================================================================= */

export const REEL_DEFAULT_MAX_BYTES = 300 * 1024 * 1024;
export const REEL_MIN_BYTES = 10 * 1024;
export const REEL_CAPTION_MAX = 2200;
const CHUNK = 64 * 1024;
const TYPES = /^video\/(mp4|quicktime)(\s*;|$)/i;

function fail(reason, message, extra) {
  return Object.assign({ ok: false, reason, message }, extra || {});
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Liest hoechstens n Bytes. Ignoriert ein Host den Range-Kopf und schickt die
   ganze Datei, wird der Strom nach n Bytes abgebrochen - nie das ganze Video. */
async function liesBis(res, n) {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const teile = [];
    let summe = 0;
    while (summe < n) {
      const { done, value } = await reader.read();
      if (done) break;
      teile.push(value);
      summe += value.byteLength;
    }
    try { await reader.cancel(); } catch (err) { /* schon zu */ }
    const out = new Uint8Array(Math.min(summe, n));
    let pos = 0;
    for (const t of teile) {
      const rest = out.length - pos;
      if (rest <= 0) break;
      out.set(t.subarray(0, rest), pos);
      pos += Math.min(t.byteLength, rest);
    }
    return out;
  }
  const all = new Uint8Array(await res.arrayBuffer());
  return all.subarray(0, n);
}

function gesamtgroesse(res) {
  const cr = String(res.headers.get("content-range") || "");
  const m = cr.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

export function httpsOhneZugang(videoUrl) {
  let u;
  try { u = new URL(String(videoUrl)); } catch (err) { return false; }
  return u.protocol === "https:" && !u.username && !u.password;
}

/**
 * Misst ein Video unter einer Adresse. Nur GET mit Range, nie die ganze Datei.
 *
 * @returns { ok, sizeBytes, contentType, partialSha256 } oder { ok:false, reason, message }
 */
export async function measureVideo(videoUrl, fetchImpl, options = {}) {
  const holen = fetchImpl || fetch;
  const maxBytes = Number(options.maxBytes) || REEL_DEFAULT_MAX_BYTES;
  if (!httpsOhneZugang(videoUrl)) {
    return fail("videoUrlInvalid", "Die Videoadresse muss https sein und ohne Zugangsdaten in der Adresse.");
  }

  let kopf;
  try {
    kopf = await holen(videoUrl, { method: "GET", headers: { range: "bytes=0-" + (CHUNK - 1) } });
  } catch (err) {
    return fail("videoUnreachable", "Die Videoadresse ist nicht erreichbar: " + String(err && err.message).slice(0, 120));
  }
  if (kopf.status !== 206 && kopf.status !== 200) {
    return fail("videoUnreachable", "Die Videoadresse antwortet mit HTTP " + kopf.status + ".");
  }
  const typ = String(kopf.headers.get("content-type") || "");
  if (!TYPES.test(typ)) {
    try { await kopf.body?.cancel?.(); } catch (err) { /* egal */ }
    return fail("videoNotMp4", "Die Videoadresse liefert `" + (typ || "keinen Inhaltstyp") +
      "`. Reels brauchen MP4 oder MOV (H.264/AAC).");
  }
  const groesse = kopf.status === 206 ? gesamtgroesse(kopf)
    : Number(kopf.headers.get("content-length")) || null;
  if (kopf.status === 200) {
    /* Der Host kennt keinen Range: ein Teilabdruck vom Ende ist unmoeglich. */
    try { await kopf.body?.cancel?.(); } catch (err) { /* egal */ }
    return fail("rangeUnsupported", "Der Host unterstuetzt keine Range-Anfragen. Ohne sie laesst sich das " +
      "Video nicht ohne vollstaendigen Download fingerabdrucken.");
  }
  if (!groesse) return fail("videoSizeUnknown", "Die Dateigroesse ist nicht ermittelbar.");
  if (groesse < REEL_MIN_BYTES) return fail("videoTooSmall", "Die Datei ist mit " + groesse + " Bytes zu klein fuer ein Video.");
  if (groesse > maxBytes) {
    return fail("videoTooLarge", "Die Datei ist " + groesse + " Bytes gross; erlaubt sind hoechstens " + maxBytes + ".");
  }

  const anfang = await liesBis(kopf, CHUNK);
  /* ISO-BMFF: Bytes 4..8 = "ftyp". MP4 und MOV beginnen so. */
  const ftyp = String.fromCharCode(anfang[4] || 0, anfang[5] || 0, anfang[6] || 0, anfang[7] || 0);
  if (ftyp !== "ftyp") {
    return fail("videoNotMp4Bytes", "Der Inhaltstyp sagt Video, die Bytes fangen nicht wie MP4/MOV an.");
  }

  let ende;
  try {
    const t = await holen(videoUrl, { method: "GET", headers: { range: "bytes=-" + CHUNK } });
    if (t.status !== 206) {
      try { await t.body?.cancel?.(); } catch (err) { /* egal */ }
      return fail("rangeUnsupported", "Der Host beantwortet das Dateiende nicht als Teilinhalt (HTTP " + t.status + ").");
    }
    if (gesamtgroesse(t) !== groesse) {
      return fail("videoSizeChanged", "Die Dateigroesse hat sich waehrend der Messung geaendert.");
    }
    ende = await liesBis(t, CHUNK);
  } catch (err) {
    return fail("videoUnreachable", "Das Dateiende ist nicht lesbar: " + String(err && err.message).slice(0, 120));
  }

  const buf = new Uint8Array(anfang.length + ende.length + 24);
  buf.set(anfang, 0);
  buf.set(ende, anfang.length);
  buf.set(new TextEncoder().encode("|size:" + groesse), anfang.length + ende.length);
  return { ok: true, sizeBytes: groesse, contentType: typ.split(";")[0].trim().toLowerCase(),
    partialSha256: await sha256Hex(buf.subarray(0, anfang.length + ende.length + ("|size:" + groesse).length)) };
}

/** Misst erneut und haelt das Ergebnis gegen das, was der Owner gesehen hat. */
export async function pruefeVideo(videoUrl, fetchImpl, erwartet, options = {}) {
  const m = await measureVideo(videoUrl, fetchImpl, options);
  if (!m.ok) return m;
  const soll = erwartet || {};
  if (!soll.sha256 || !soll.sizeBytes) {
    return fail("videoFingerprintRequired", "Fuer ein Reel gibt es keine Freigabe ohne Groesse und Teilabdruck " +
      "des Videos. Es wird nichts gesendet.");
  }
  if (Number(soll.sizeBytes) !== m.sizeBytes) {
    return fail("videoSizeChanged", "Unter der Adresse liegt jetzt eine Datei anderer Groesse als bei der Freigabe. " +
      "Es wird nichts gesendet.", { expectedSizeBytes: Number(soll.sizeBytes), actualSizeBytes: m.sizeBytes });
  }
  if (String(soll.sha256).toLowerCase() !== m.partialSha256) {
    return fail("videoFingerprintMismatch", "Unter der Adresse liegt jetzt ein ANDERES Video als bei der Freigabe. " +
      "Es wird nichts gesendet.", { expectedSha256: String(soll.sha256).toLowerCase(), actualSha256: m.partialSha256 });
  }
  return m;
}

/* =========================================================================
   VISION UNIVERSE QUANT — hash.js

   Deterministische Hash- und Zufallsprimitive. Ohne externe Abhaengigkeit,
   lauffaehig in Browser und Node, bitgleiches Ergebnis in beiden.

   Warum eigener Hash statt crypto.subtle: crypto.subtle ist asynchron und im
   Browser nur unter https/localhost verfuegbar. Der Reproduction Hash eines
   Backtests (§44) muss synchron, offline und in jeder Umgebung identisch
   berechenbar sein. FNV-1a ueber eine kanonisch sortierte JSON-Darstellung
   erfuellt das. Es ist bewusst KEIN kryptographischer Hash — er dient der
   Reproduzierbarkeit und Auditierbarkeit, nicht der Manipulationssicherheit.
   ========================================================================= */
(function (global) {
  "use strict";

  /* Kanonische Serialisierung: Objekt-Keys sortiert, damit die Reihenfolge
     der Felder das Ergebnis nicht veraendert. Zahlen werden ueber
     Number.prototype.toString normalisiert (-0 -> "0"). */
  function canonical(value) {
    if (value === null || value === undefined) return "null";
    var t = typeof value;
    if (t === "number") return Number.isFinite(value) ? String(value === 0 ? 0 : value) : "null";
    if (t === "boolean") return value ? "true" : "false";
    if (t === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (t === "object") {
      var keys = Object.keys(value).filter(function (k) { return value[k] !== undefined; }).sort();
      return "{" + keys.map(function (k) {
        return JSON.stringify(k) + ":" + canonical(value[k]);
      }).join(",") + "}";
    }
    return "null";
  }

  /* FNV-1a 32 bit, zweifach mit unterschiedlichem Offset Basis fuer 64 Bit
     Ausgabe. Ausgabe als 16 Hex-Zeichen. */
  function fnv1a(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function pad8(n) {
    var s = (n >>> 0).toString(16);
    return "00000000".slice(s.length) + s;
  }

  /** Stabiler Hash beliebiger JSON-artiger Werte. 16 Hex-Zeichen. */
  function hashValue(value) {
    var s = canonical(value);
    return pad8(fnv1a(s, 0x811c9dc5)) + pad8(fnv1a(s, 0x9e3779b9));
  }

  /** Hash mit sprechendem Praefix, z.B. "bt_3f9a...". */
  function prefixedHash(prefix, value) {
    return prefix + "_" + hashValue(value);
  }

  /** 32-bit Seed aus einem String — Einstieg in die PRNG-Kette. */
  function seedFromString(str) {
    return fnv1a(String(str), 0x811c9dc5) >>> 0;
  }

  /* Mulberry32: schneller, deterministischer PRNG mit 32-Bit-Zustand.
     Gleicher Seed -> exakt gleiche Sequenz in jeder JS-Engine. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Standardnormalverteilte Zufallszahl (Box-Muller) aus einem PRNG. */
  function gaussian(rand) {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  var api = {
    canonical: canonical,
    hashValue: hashValue,
    prefixedHash: prefixedHash,
    seedFromString: seedFromString,
    mulberry32: mulberry32,
    gaussian: gaussian
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUHash = api;
})(typeof window !== "undefined" ? window : globalThis);

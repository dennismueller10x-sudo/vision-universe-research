/* =========================================================================
   VISION UNIVERSE QUANT — engines/regime-tile.js

   Die Marktlage-Kachel der Startseite (Bogen, Lagewort, Satz, Verlauf) als REINE Funktion: regime-Dokument
   (market-regime-v1.json) rein, HTML-Text raus. Kein DOM, kein Abruf, keine neue Rechnung. EINE Quelle fuer die App
   (quant/app/pages.js#home) und den Release-Bau (scripts/vu2/quant-home-preview.mjs, Vorschau vor dem Buendel).
   Der Text ist Byte fuer Byte der, den pages.js bisher selbst gebaut hat (Golden: quant/tests/fixtures/regime-tile).
   UMD: globalThis + module.exports.
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuantRegimeTile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var REGIME = { BROAD_WEAKNESS: "Breite Schwäche", BROAD_STRENGTH: "Breite Stärke", NARROW_LEADERSHIP: "Schmale Führung", MIXED: "Gemischte Lage" };
  /* wie VUUI.esc (assets/vu-ui.js) und X.dateDe (quant/app/ui.js); Gleichheit prueft der Test. */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function dateDe(iso) {
    if (!iso) return "–";
    var p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso);
  }
  /* Bogen wie im Prototyp (gauge(pct, 260)): Halbkreis, Spur dunkel, Anteil neongrün. */
  function gauge(pct, w) {
    var r = w / 2 - 12, c = Math.PI * r, p = Math.max(0, Math.min(100, pct)), d = "M12 " + w / 2 + "A" + r + " " + r + " 0 0 1 " + (w - 12) + " " + w / 2;
    return '<svg class="qp-gauge" width="' + w + '" height="' + (w / 2 + 8) + '" viewBox="0 0 ' + w + " " + (w / 2 + 8) + '" aria-hidden="true"><path class="qp-gauge-t" d="' + d + '" fill="none" stroke-width="14" stroke-linecap="round"/>' +
      '<path class="qp-gauge-v" d="' + d + '" fill="none" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(1) + '"/></svg>';
  }
  /* Verlaufsfläche wie im Prototyp (line(..., {fill:true, dot:false})): nur aus veröffentlichten Beobachtungen. */
  function line(vals, w, h) {
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), n = vals.length;
    var xy = vals.map(function (v, i) { return [(i / (n - 1)) * w, h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8)]; });
    var d = xy.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    return '<svg class="qp-line" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" width="100%" height="' + h + '" aria-hidden="true"><defs><linearGradient id="qp-lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8f531" stop-opacity=".38"/><stop offset="1" stop-color="#c8f531" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + "L" + w + " " + h + "L0 " + h + 'Z" fill="url(#qp-lg)"/><path class="qp-line-s" d="' + d + '" fill="none" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  }
  function days(a, b) { var x = Date.parse(a + "T12:00:00Z"), y = Date.parse(b + "T12:00:00Z"); return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : null; }
  function pct(share) { return Math.round(share * 100) + " %"; }

  /** Inhalt von #qp-heute (regimeHost.innerHTML) oder null, wenn die Kachel entfaellt. */
  function hostHtml(regime) {
    var html = null;
    if (regime && regime.state === "AVAILABLE") {
      var mm = {}; (regime.measures || []).forEach(function (x) { mm[x.id] = x; });
      var above = mm.above200 && typeof mm.above200.share === "number" ? mm.above200.share : null;
      var seen = mm.above200 && typeof mm.above200.observed === "number" ? mm.above200.observed : null, lage = REGIME[regime.regime] || "Marktlage";
      var pts = regime.history && regime.history.measure === "above200" && Array.isArray(regime.history.points) ? regime.history.points.filter(function (p) { return p && typeof p.share === "number" && /^\d{4}-\d{2}-\d{2}$/.test(p.asOf || "") && p.asOf <= regime.asOf; }) : [];
      if (above != null && pts.length && pts[pts.length - 1].asOf !== regime.asOf) pts = pts.concat([{ asOf: regime.asOf, share: above }]);
      var first = pts.length >= 2 ? pts[0] : null, ago = first ? days(first.asOf, regime.asOf) : null;
      var since = first && ago > 0 ? " · vor " + ago + " Tagen " + (Math.round(first.share * 100) === Math.round(above * 100) ? "ebenfalls " : "noch ") + pct(first.share) : "";
      var sheetBody = '<b class="qp-sh-lage">' + esc(lage) + '</b><p class="qp-sm qp-mut" style="margin:2px 0 0">' + (regime.asOf ? "Stand " + esc(dateDe(regime.asOf)) : "") + (seen != null ? " · " + seen.toLocaleString("de-DE") + " Aktien" : "") + "</p>" +
        (above != null ? '<div class="qp-gwrap qp-gwrap--sheet">' + gauge(above * 100, 280) + '<span class="qp-num qp-gnum" style="font-size:50px">' + pct(above) + '</span></div><p class="qp-sm qp-sec" style="text-align:center;margin:4px 0 0">der US-Aktien liegen über ihrer 200-Tage-Linie</p>' : "") +
        (regime.measures || []).filter(function (x) { return typeof x.share === "number" && x.id !== "above200"; }).map(function (x) {
          return '<div class="qp-ms qk2-measure"><div class="qp-ms-h"><b>' + esc(x.label) + "</b><b>" + pct(x.share) + '</b></div><div class="qp-bar" style="height:10px"><i style="width:' + Math.round(x.share * 100) + '%"></i></div></div>'; }).join("") +
        (regime.matchedRule && regime.matchedRule.plain ? '<div class="qp-tile qp-ms-rule"><span class="qp-eb">Warum „' + esc(lage) + "“</span><p class=\"qp-sm\" style=\"margin:8px 0 0\">" + esc(regime.matchedRule.plain) + "</p></div>" : "") +
        '<p class="qp-xs qp-mut" style="margin:12px 0 0">Zustand heute, keine Prognose.' + (pts.length >= 2 ? " Der Verlauf zeigt den Anteil, wie er an " + pts.length + " Stichtagen veröffentlicht wurde." : "") + '</p><a class="qp-btn" href="/quant/markt/">Marktdaten: Herkunft und Stand</a>';
      html = '<button type="button" class="qp-tile qp-tap qp-markt qk2-regime" aria-haspopup="dialog" data-vu-pop="qk2-regime-tpl" aria-label="' + esc("Marktlage: " + lage + (above != null ? ", " + pct(above) + " über der 200-Tage-Linie" : "") + since + ". Alle Maße öffnen") + '">' +
        '<span class="qp-eb">Marktlage' + (seen != null ? " · " + seen.toLocaleString("de-DE") + " Aktien" : "") + "</span>" +
        (above != null ? '<span class="qp-gwrap vu-gauge">' + gauge(above * 100, 260) + '<span class="qp-num qp-gnum">' + pct(above) + "</span></span>" : "") +
        '<b class="qp-lage">' + esc(lage) + "</b>" + (above != null ? '<span class="qp-sm qp-mut qp-b7">über der 200-Tage-Linie' + esc(since) + "</span>" : "") +
        (pts.length >= 2 ? '<span class="qp-mline">' + line(pts.map(function (p) { return p.share; }), 402, 56) + "</span>" : "") + "</button>" +
        '<template id="qk2-regime-tpl"><div class="qp-sheet">' + sheetBody + "</div></template>";
    }
    return html;
  }
  return { REGIME: REGIME, esc: esc, dateDe: dateDe, gauge: gauge, line: line, days: days, pct: pct, hostHtml: hostHtml };
});

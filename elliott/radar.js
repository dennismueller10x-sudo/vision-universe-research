/* VISION UNIVERSE ELLIOTT — radar.js. Startseite (Owner 23.11.2026): „Elliott-Alarme“ und „Wochen-Radar“ aus der Lieferansicht
   elliott-home.json (Felder events und radar, scripts/technical/elliott-home/home.mjs#eventsOf, #radarOf). Rechnet nichts: Zonen,
   Kursziele und Rückenwind stehen so im Produkt; hier entstehen nur Worte, Prozentabstand und Reihenfolge der Anzeige.
   Wortwahl wie im Großen Bild (elliott/bigpicture.js, Schalter elliott/config/kursmarken.json). */
(function (global) {
  "use strict";
  var EV = { ENTRY_REACHED: [null, "ek-pill"], TARGET_REACHED: [null, "ek-pill"], INVALIDATED: ["Zählung ungültig", "ek-pill ek-pill--wh"], RECOUNT: ["Neue Lesart", "ek-pill ek-pill--wh"] };
  var RW = { UP: "Rückenwind aufwärts", DOWN: "Rückenwind abwärts", MIXED: "Rückenwind gemischt" };
  function num(v) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: v < 100 ? 2 : 0 }) : "–"; }
  function pct(v) { var p = Math.round(v * 100); return (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p) + " %"; }
  function words() { var B = global.VUElliottBig; return B && B.WORDS ? B.WORDS[B.mode ? B.mode() : "zonen"] || B.WORDS.zonen : { target: "Zielzone der Methode", entry: "Zone laut Methode" }; }
  function radar(host, o) {
    var M = o.M, el = o.el, sh = o.sh, h = o.home || {}, R = h.radar, E = h.events, W = words();
    if (E && E.length) {
      host.append(sh("Elliott-Alarme"), el("p", { class: "ek-sub ek-sm ek-mut", text: "Was seit dem letzten Lauf passiert ist: Zone erreicht, Ziel erreicht, Zählung ungültig." }),
        el("div", { class: "ek-rail", role: "list", "aria-label": "Elliott-Alarme" }, E.slice(0, 12).map(function (e) {
          var k = EV[e.type] || [e.type, "ek-pill"]; if (!k[0]) k = [(e.type === "ENTRY_REACHED" ? W.entry.replace(" laut Methode", "") : W.target) + " erreicht", k[1]];
          return el("a", { class: "el-cr ek-tile ek-tap ek-nc", role: "listitem", href: M.detailHref(e.t), dataset: { symbol: e.t }, "aria-label": [e.n, k[0]].join(", ") }, [
            el("span", { class: "ek-nc-h" }, [el("span", { class: "ek-f1" }, [el("b", { class: "ek-b8", text: e.n }), el("span", { class: "ek-xs ek-mut", text: e.t + " · " + M.dateDe(e.asOf) })]),
              el("span", { class: k[1] + " ek-pill--sm", text: k[0] })]),
            el("span", { class: "ek-xs ek-mut ek-nc-i", text: e.zone ? (e.wave || "") + " " + num(e.zone[0]) + "–" + num(e.zone[1]) + " $ · Schluss " + num(e.close) + " $" : e.type === "INVALIDATED" ? "Schluss " + num(e.close) + " $ jenseits der Marke " + num(e.level) + " $ – Neuzählung" : e.text })]);
        })));
    }
    if (R && R.rows && R.rows.length) {
      host.append(sh("Wochen-Radar"), el("p", { class: "ek-sub ek-sm ek-mut", text: R.count.toLocaleString("de-DE") + (R.count === 1 ? " Wert liegt" : " Werte liegen") + " gerade in der " + W.entry + " der Zählung von oben. Zuerst die mit Rückenwind in Richtung des nächsten Ziels." }),
        el("div", { class: "ek-rail", role: "list", "aria-label": "Wochen-Radar" }, R.rows.slice(0, 16).map(function (r) {
          var up = r.dir === "UP";
          return el("a", { class: "el-cr ek-tile ek-tap ek-nc", role: "listitem", href: M.detailHref(r.t), dataset: { symbol: r.t }, "aria-label": [r.n, "Welle " + r.ew, W.entry + " " + num(r.e[0]) + " bis " + num(r.e[1]), W.target + " " + num(r.t1[0]) + " bis " + num(r.t1[1]), r.rw ? RW[r.rw] : ""].filter(Boolean).join(", ") }, [
            el("span", { class: "ek-nc-h" }, [el("span", { class: "ek-f1" }, [el("b", { class: "ek-b8", text: r.n }), el("span", { class: "ek-xs ek-mut", text: "Welle " + r.ew + " in der Zone " + num(r.e[0]) + "–" + num(r.e[1]) + " $" })]),
              r.rw ? el("span", { class: "ek-pill ek-pill--sm" + (r.rwOk ? "" : " ek-pill--wh"), text: r.rwOk ? "Rückenwind" : "Gegenwind" }) : null]),
            el("span", { class: "ek-nc-f" }, [el("span", { class: "ek-xs ek-b7", text: (up ? "▲ " : "▼ ") + W.target + " " + r.tw + " " + num(r.t1[0]) + "–" + num(r.t1[1]) + " $ (" + pct(r.dist) + ")" })])]);
        })));
    }
  }
  global.VUElliottRadar = radar;
  if (typeof module !== "undefined" && module.exports) module.exports = { radar: radar, EV: EV };
})(typeof globalThis !== "undefined" ? globalThis : this);

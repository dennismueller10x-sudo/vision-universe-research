/* =========================================================================
   VISION UNIVERSE — assets/atlas-sheet.js        Atlas auf jeder Aktie

   Konzept docs/design/mein-bereich-2026-11 (Folie AX03, Screen a-sheet): Der Atlas-Knopf der Kopfzeile
   öffnet auf einer Aktienseite ein Sheet „Atlas zu <Name>“ mit Eingabe und drei Fragen zur Aktie.
   Die Aktie geht als Kontext in die Frage; beantwortet wird auf /ask/ wie jede andere Frage
   (Übersetzung und Rechnung unverändert). Das Sheet speichert nichts und sendet selbst nichts.

   Welche Aktie: der Aktienkopf trägt data-vu-stock (Kürzel) und data-vu-stock-name
   (assets/stock-navigator.js#head und assets/vu-ui.js#stockHead).
   Geladen von assets/site-navigation.js beim ersten Tipp auf „Atlas“ einer Aktienseite.

   UMD: Browser globalThis.VUAtlasSheet, Node module.exports (Tests).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUAtlasSheet = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  /* Drei Fragen zur Aktie, die Atlas heute vollständig beantwortet (Umsatz aus SEC-Berichten, Marge, Chartbild). */
  var QUESTIONS = [
    ["Wie hat sich der Umsatz entwickelt?", "Wie hat sich der Umsatz bei {n} entwickelt?"],
    ["Wie hoch ist die Marge?", "Wie hoch ist die Marge bei {n}?"],
    ["Was sagt der Chart?", "Was sagt der Chart bei {n}?"]
  ];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clean(n) { return String(n || "").replace(/,? (Inc|Corp|Corporation|Ltd|Limited|plc|N\.V\.|S\.A\.|AG|SE|Holdings?|Co)\.?$/i, "").replace(/ Class [A-Z]$/, "").trim(); }

  /** Die Aktie der Seite aus dem Aktienkopf; null, wenn die Seite keine Aktie zeigt. */
  function stockOf(doc) {
    var el = doc && doc.querySelector && doc.querySelector("[data-vu-stock]");
    var t = el && String(el.getAttribute("data-vu-stock") || "").trim().toUpperCase();
    if (!t || !/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(t)) return null;
    return { ticker: t, name: clean(el.getAttribute("data-vu-stock-name")) || t };
  }
  /** Frage mit der Aktie als Kontext: steht die Aktie nicht schon darin, wird sie angehängt. */
  function question(text, stock) {
    var q = String(text || "").replace(/\s+/g, " ").trim().slice(0, 360);
    if (!q || !stock) return q;
    var has = new RegExp("\\b(" + stock.ticker.replace(/[.\-]/g, "\\$&") + "|" + stock.name.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\b", "i").test(q);
    return has ? q : q.replace(/[?.!]*$/, "") + " (" + stock.name + ", " + stock.ticker + ")?";
  }
  /** Adresse der Antwort: /ask/ mit der Frage; go=1 stellt sie dort sofort. */
  function href(text, stock) { return "/ask/?q=" + encodeURIComponent(question(text, stock)) + "&go=1"; }

  var SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M12 3.2c.5 3.9 2.3 6.2 6.4 6.8-4.1.6-5.9 2.9-6.4 6.8-.5-3.9-2.3-6.2-6.4-6.8 4.1-.6 5.9-2.9 6.4-6.8z"/><path fill="currentColor" d="M18.6 14.6c.2 1.6.9 2.5 2.6 2.8-1.7.3-2.4 1.2-2.6 2.8-.2-1.6-.9-2.5-2.6-2.8 1.7-.3 2.4-1.2 2.6-2.8z"/></svg>';
  var NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
  var X = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  /** Markup des Sheets (rein, für Tests). */
  function html(stock) {
    var n = esc(stock.name);
    return '<div class="vu-as-back" data-vu-atlas-sheet><div class="vu-as" role="dialog" aria-modal="true" aria-labelledby="vu-as-t"><div class="vu-as-grab" aria-hidden="true"></div>' +
      '<div class="vu-as-h"><span class="vu-as-ic">' + SPARK + '</span><b id="vu-as-t">Atlas zu ' + n + '</b><button type="button" class="vu-as-x" data-vu-as-close aria-label="Schließen">' + X + "</button></div>" +
      '<form class="vu-as-ask"><label class="vu-as-vh" for="vu-as-q">Frage zu ' + n + '</label><textarea id="vu-as-q" rows="2" maxlength="300" placeholder="Frag etwas zu ' + n + ' …"></textarea>' +
      '<div class="vu-as-f"><span>bezieht sich auf diese Aktie</span><button type="submit" class="vu-as-go" aria-label="Frage stellen">' + NEXT + "</button></div></form>" +
      '<div class="vu-as-chips">' + QUESTIONS.map(function (q) {
        return '<a class="vu-as-chip" href="' + esc(href(q[1].replace("{n}", stock.name), stock)) + '">' + esc(q[0]) + "</a>";
      }).join("") + "</div>" +
      '<p class="vu-as-fine">Atlas übersetzt die Frage, Vision Universe rechnet. Keine Anlageberatung.</p></div></div>';
  }
  var CSS = ".vu-as-back{position:fixed;inset:0;z-index:2147483000;background:rgb(0 0 0/.45);display:flex;align-items:flex-end;justify-content:center;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}" +
    ".vu-as{width:100%;max-width:560px;max-height:88dvh;overflow:auto;box-sizing:border-box;border-radius:30px 30px 0 0;background:#fff;color:#000;padding:10px 18px calc(28px + env(safe-area-inset-bottom))}" +
    ":root[data-theme=dark] .vu-as{background:#000;color:#fff}" +
    ".vu-as *{box-sizing:border-box}.vu-as-grab{width:40px;height:5px;border-radius:9px;background:#e9e9e9;margin:0 auto 14px}:root[data-theme=dark] .vu-as-grab{background:#262626}" +
    ".vu-as-h{display:flex;align-items:center;gap:10px}.vu-as-h b{flex:1;font-size:16px;font-weight:800}.vu-as-ic{display:grid}" +
    ".vu-as-x{width:44px;height:44px;border:0;border-radius:50%;background:#f4f4f4;color:inherit;display:grid;place-items:center;cursor:pointer}:root[data-theme=dark] .vu-as-x{background:#151515}" +
    ".vu-as-ask{margin-top:10px;border:2px solid currentColor;border-radius:22px;padding:14px 14px 10px}" +
    ".vu-as-ask textarea{display:block;width:100%;min-height:44px;margin:0;padding:0;border:0!important;background:transparent!important;color:inherit;font-family:inherit;font-size:16px;font-weight:700;line-height:1.4;resize:none;outline:none!important;box-shadow:none!important}" +
    ".vu-as-ask textarea::placeholder{color:#6e6e6e}:root[data-theme=dark] .vu-as-ask textarea::placeholder{color:#9b9b9b}" +
    ".vu-as-f{display:flex;align-items:center;gap:8px}.vu-as-f span{flex:1;font-size:12px;font-weight:600;color:#6e6e6e}:root[data-theme=dark] .vu-as-f span{color:#9b9b9b}" +
    ".vu-as-go{width:44px;height:44px;border:0;border-radius:50%;background:#c8f531;color:#000;display:grid;place-items:center;cursor:pointer}" +
    ".vu-as-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}" +
    ".vu-as-chip{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:999px;background:#f4f4f4;color:inherit;font-size:13px;font-weight:700;text-decoration:none}:root[data-theme=dark] .vu-as-chip{background:#151515}" +
    ".vu-as-fine{margin:12px 0 0;font-size:11.5px;color:#6e6e6e}:root[data-theme=dark] .vu-as-fine{color:#9b9b9b}" +
    ".vu-as-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}" +
    ".vu-as-x:focus-visible,.vu-as-go:focus-visible,.vu-as-chip:focus-visible{outline:2px solid #4f6b00;outline-offset:2px}:root[data-theme=dark] .vu-as :focus-visible{outline-color:#c8f531}";

  /** Öffnet das Sheet für die Aktie der Seite. Liefert false, wenn die Seite keine Aktie zeigt (dann gilt der normale Link). */
  function open(doc, opener) {
    var d = doc || root.document, stock = stockOf(d);
    if (!stock) return false;
    if (!d.getElementById("vu-as-css")) { var st = d.createElement("style"); st.id = "vu-as-css"; st.textContent = CSS; d.head.appendChild(st); }
    var old = d.querySelector("[data-vu-atlas-sheet]"); if (old) old.remove();
    var t = d.createElement("template"); t.innerHTML = html(stock);
    var back = t.content.firstChild; d.body.appendChild(back);
    var input = back.querySelector("textarea");
    function close() { back.remove(); d.removeEventListener("keydown", onKey); if (opener && opener.focus) opener.focus(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    back.addEventListener("click", function (e) { if (e.target === back || e.target.closest("[data-vu-as-close]")) close(); });
    d.addEventListener("keydown", onKey);
    back.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (input.value.trim().length < 3) { input.focus(); return; }
      root.location.assign(href(input.value, stock));
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); back.querySelector("form").requestSubmit(); } });
    input.focus();
    return true;
  }
  return Object.freeze({ QUESTIONS: QUESTIONS, stockOf: stockOf, question: question, href: href, html: html, open: open });
});

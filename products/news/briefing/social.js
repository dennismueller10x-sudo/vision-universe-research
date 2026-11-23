/* =========================================================================
   MARKTBRIEFING – INSTAGRAM-KARUSSELL (Owner 23.11.2026)

   Aus einer Ausgabe (engine.js) sechs Slides 1080×1350 im Stil der Freigabe
   vom 23.11.: Hook, Thema des Tages, Bewertung, Marktbreite, Ausblick,
   Schluss mit echten Bildschirmen. Werbliche Grafik: KEIN Kleingedrucktes
   auf den Slides (Owner 23.11.2026); Quellen, Datenstand und Hinweis stehen
   in der Caption. Hervorhebungen mit Abstand (keine Überlappung der Zeilen).
   Wortwahl beschreibend (docs/legal/WORTWAHL.md). Rendern: social.mjs.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var CSS = "\n@font-face{font-family:Inter;src:url(__FONT__) format(\"woff2\");font-weight:100 900}\n*{box-sizing:border-box}body{margin:0;font-family:Inter,sans-serif}\n.s{width:1080px;height:1350px;position:relative;overflow:hidden;padding:90px 84px;display:flex;flex-direction:column}\n.l{background:#c8f531;color:#000}.w{background:#fff;color:#000}.k{background:#000;color:#fff}\n.top{display:flex;justify-content:space-between;font-size:24px;font-weight:900;letter-spacing:.14em}.top span{opacity:.55;font-weight:800}\n.n{position:absolute;right:84px;bottom:70px;font-size:24px;font-weight:800;opacity:.5}\n.foot{position:absolute;left:84px;bottom:70px;font-size:22px;font-weight:900;letter-spacing:.04em}\nh1{font-size:112px;line-height:1.08;letter-spacing:-.055em;margin:0;font-weight:900}\nh2{font-size:80px;line-height:1.12;letter-spacing:-.05em;margin:0 0 26px;font-weight:900}\nmark{background:#000;color:#c8f531;padding:.02em .14em .06em;border-radius:.12em;line-height:1;display:inline;box-decoration-break:clone;-webkit-box-decoration-break:clone}\n.k mark{background:#c8f531;color:#000}\n.say{font-size:36px;line-height:1.3;font-weight:600;opacity:.8;margin:0}\n.kick{display:inline-flex;align-self:flex-start;background:#000;color:#fff;border-radius:999px;padding:10px 22px;font-size:24px;font-weight:800;margin-bottom:34px}\n.k .kick{background:#c8f531;color:#000}\n.big{font-size:300px;font-weight:900;letter-spacing:-.07em;line-height:.85;margin:10px 0 20px}\n.swipe{margin-top:auto;display:flex;align-items:center;gap:18px;font-size:32px;font-weight:900}.swipe b{width:84px;height:84px;border-radius:50%;background:#000;color:#c8f531;display:grid;place-items:center;font-size:44px}\n.r{display:grid;grid-template-columns:96px 1fr auto;align-items:center;gap:22px;padding:18px 0;border-bottom:1px solid #2a2a2a}\n.lg{width:96px;height:96px;border-radius:24px;background:#1c1c1c;display:grid;place-items:center;font-size:24px;font-weight:900}\n.nm b{display:block;font-size:38px}.nm small{font-size:26px;opacity:.6}\n.rsi{font-size:44px;font-weight:900;background:#c8f531;color:#000;border-radius:999px;padding:8px 26px}\n.k2{display:grid;gap:100px;margin-top:40px}.k{}\n.kk{}\n.kgv .k{display:grid;grid-template-columns:150px 1fr 250px;align-items:center;gap:22px;background:none;color:#000;padding:0}\n.kgv .k b{font-size:46px}.kgv .k span{font-size:38px;font-weight:800;text-align:right}.kgv .k em{font-style:normal;background:#c8f531;padding:0 8px;border-radius:8px}\n.tr{position:relative;height:22px;background:#eee;border-radius:9px}.tr i{position:absolute;top:0;height:22px;background:#000;border-radius:9px}\n.tr s,.tr u{position:absolute;top:-10px;width:42px;height:42px;margin-left:-21px;border-radius:50%;border:5px solid #000}.tr s{background:#fff}.tr u{background:#c8f531}\n.leg{display:flex;gap:30px;font-size:26px;font-weight:700;margin-top:30px;opacity:.75}.leg i{display:inline-block;width:22px;height:22px;border-radius:50%;border:4px solid #000;margin-right:10px;vertical-align:-3px}\n.dots{display:grid;grid-template-columns:repeat(10,1fr);gap:16px;margin:40px 0 30px;width:640px}.dots i{aspect-ratio:1;border-radius:50%;background:#2c2c2c}.dots i.on{background:#c8f531}\n.ag{display:grid;gap:18px;margin-top:10px}.d{display:grid;grid-template-columns:150px 1fr;gap:22px;align-items:start}\n.dh{background:#000;color:#c8f531;border-radius:26px;padding:18px 0;text-align:center}.dh b{display:block;font-size:44px}.dh span{font-size:22px;font-weight:800;color:#fff}\n.it{background:rgba(0,0,0,.07);border-radius:22px;padding:18px 24px;font-size:30px;font-weight:800;line-height:1.25}.it small{display:block;font-size:22px;font-weight:700;opacity:.65;margin-top:4px}\n.cta{margin-top:auto;display:grid;gap:22px}.url{font-size:46px;font-weight:900;background:#c8f531;color:#000;border-radius:24px;padding:26px 30px}\n.icons{display:flex;gap:30px;font-size:30px;font-weight:800}\n.hint{font-size:20px;opacity:.55;margin-top:20px}\n";
  var WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var WK = { Montag: "MO", Dienstag: "DI", Mittwoch: "MI", Donnerstag: "DO", Freitag: "FR" };
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function num(x, d) { return Math.abs(x).toFixed(d == null ? 1 : d).replace(".", ","); }
  function dmy(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "."; }
  /* Letztes Wort (oder die letzten zwei kurzen) markieren; Zahlen und Kürzel bleiben ohne Umbruch. */
  function marked(t) {
    var w = String(t).replace(/\.$/, "").split(" "), k = w.length > 3 && w[w.length - 1].length < 7 ? 2 : 1;
    return esc(w.slice(0, w.length - k).join(" ")).replace(/S&amp;P 500/g, "S&amp;P&nbsp;500") + " <mark>" + esc(w.slice(-k).join(" ")) + ".</mark>";
  }
  var NAMES = { NVDA: "Nvidia", MSFT: "Microsoft", AAPL: "Apple", AMZN: "Amazon", META: "Meta", AVGO: "Broadcom", GOOGL: "Alphabet", ORCL: "Oracle" };
  /* Hook und Unterzeile je Thema (Stil der Freigabe 23.11.: Zahl, Zielgruppe „du“, Spannung). */
  var HOOK = {
    ueberverkauft: function (n) { return [n + " Aktien aus dem S&P 500 sind überverkauft", "Erholung oder Falle? 4 Dinge für deine Börsenwoche."]; },
    ueberkauft: function (n) { return [n + " Aktien aus dem S&P 500 sind heiß gelaufen", "Wie weit trägt die Rally? 4 Dinge für deine Börsenwoche."]; },
    momentum: function (n) { return [n + " Aktien aus dem S&P 500 auf neuem Jahreshoch", "Wer jetzt vorne liegt. 4 Dinge für deine Börsenwoche."]; },
    "neue-tiefs": function (n) { return [n + " Aktien aus dem S&P 500 auf neuem Jahrestief", "Wo es weiter abwärts geht. 4 Dinge für deine Börsenwoche."]; }
  };
  function valTitle(t) { return t.replace(/^([A-Z]+): KGV seit dem Kurshoch/, function (_, k) { return (NAMES[k] || k) + "s KGV hat sich seit dem Hoch"; }); }
  function top(label, i, n) { return '<div class="top">' + esc(label) + "<span>" + i + "/" + n + "</span></div>"; }

  function slides(b, o) {
    o = o || {};
    var C = {}; b.cards.forEach(function (c) { C[c.id] = c; });
    var topics = b.cards.filter(function (c) { return c.topic; });
    var out = [];
    // 1 Hook: stärkstes Thema des Tages, sonst die Schlagzeile der Ausgabe
    var t0 = topics[0];
    var cnt = t0 && t0.stat ? t0.stat.value : null, hk = t0 && HOOK[t0.topic] && cnt ? HOOK[t0.topic](cnt) : [t0 ? t0.title : C.overview.title, "Was das für deine Börsenwoche heißt. 4 Dinge in Folien."];
    out.push({ bg: "l", html: '<div style="margin-top:120px"><h1>' + marked(hk[0]) + '</h1><p class="say" style="margin-top:44px;font-size:44px;font-weight:800">' +
      esc(o.sub || hk[1]) + '</p></div><div class="swipe"><b>→</b>Wischen</div>', label: "VISION UNIVERSE · MARKTBRIEFING" });
    // 2 Thema des Tages als Liste
    if (t0) {
      var rows = (t0.bars ? t0.bars.rows : (t0.groups[0] || { rows: [] }).rows).slice(0, 5);
      var unit = t0.groups ? "%" : t0.bars.unit;
      var v = function (x) { return unit === "%" ? (x > 0 ? "+" : x < 0 ? "−" : "") + num(x, 1) + " %" : unit === "x" ? num(x, 1) + "×" : num(x, 0); };
      out.push({ bg: "k", label: t0.kicker.replace(/^Thema · /, "").toUpperCase(), html: '<div style="margin-top:70px"><span class="kick">' + esc(t0.kicker.replace(/^Thema · /, "")) + "</span><h2>" + marked(t0.title) + "</h2>" +
        '<p class="say" style="font-size:30px">' + esc(t0.sub.split(". ").slice(0, 2).join(". ").replace(/\.?$/, ".")) + '</p></div><div style="margin-top:40px">' +
        rows.map(function (r) { return '<div class="r"><span class="lg">' + esc(r.label.slice(0, 4)) + '</span><span class="nm"><b>' + esc(r.label) + "</b><small>" + esc(String(r.sub || "").split(" · ")[0]) + '</small></span><span class="rsi">' + v(r.value) + "</span></div>"; }).join("") + "</div>" });
    }
    // 3 Bewertung (KI-Riesen, KGV am Hoch und heute)
    if (C.valuation) {
      var vr = C.valuation.columns.rows.slice(0, 4), mx = Math.max.apply(null, vr.map(function (r) { return Math.max(r.values[0], r.values[1]); })) * 1.06;
      out.push({ bg: "w", label: "BEWERTUNG", html: '<div style="margin-top:70px"><span class="kick">Kurs geteilt durch Gewinn</span><h2>' + marked(valTitle(C.valuation.title)) + "</h2>" +
        '<p class="say" style="font-size:32px">Bewertung am 12-Monats-Hoch im Vergleich zu heute. Grundlage: Gewinne der letzten vier Quartale.</p></div><div class="kgv k2" style="margin-top:110px">' +
        vr.map(function (r) { var a = r.values[0], c = r.values[1]; return '<div class="k"><b>' + esc(r.label) + '</b><div class="tr"><i style="left:' + (Math.min(a, c) / mx * 100).toFixed(1) + "%;width:" + (Math.abs(a - c) / mx * 100).toFixed(1) + '%"></i><s style="left:' + (a / mx * 100).toFixed(1) + '%"></s><u style="left:' + (c / mx * 100).toFixed(1) + '%"></u></div><span>' + num(a, a % 1 ? 1 : 0) + " → <em>" + num(c, c % 1 ? 1 : 0) + "</em></span></div>"; }).join("") +
        '</div><div class="leg" style="margin-top:70px"><span><i style="background:#fff"></i>am 12-Monats-Hoch</span><span><i style="background:#c8f531"></i>am ' + dmy(b.session) + "</span></div>" });
    }
    // 4 Marktbreite
    var a50 = C.picture && C.picture.textStats.filter(function (s) { return s.label === "Marktbreite"; })[0];
    if (a50) {
      var p = Math.round(a50.value), dots = "";
      for (var k = 0; k < 100; k++) dots += '<i class="' + (k < p ? "on" : "") + '"></i>';
      out.push({ bg: "k", label: "MARKTBREITE", html: '<div style="margin-top:70px"><span class="kick">Unser Marktbild</span><h2>' + (p < 50 ? "Nur " : "") + "<mark>" + p + " von 100</mark> Aktien über der 50‑Tage‑Linie.</h2></div>" +
        '<div class="dots">' + dots + '</div><p class="say" style="font-size:32px">' + (p < 40 ? "Die Mehrheit der US-Aktien steckt im Abwärtstrend. Eine Erholung muss erst zeigen, ob sie breit getragen wird." : p > 60 ? "Der Anstieg ist breit getragen: Die Mehrheit der US-Aktien liegt im Aufwärtstrend." : "Der Markt ist gespalten: Etwa die Hälfte der Aktien liegt über ihrem Trend.") + "</p>" });
    }
    // 5 Ausblick
    if (C.agenda) {
      var days = C.agenda.agenda.days.slice(0, 3);
      out.push({ bg: "l", label: "AUSBLICK", html: '<div style="margin-top:60px"><h2>Das bewegt <mark>die nächsten Tage.</mark></h2></div><div class="ag">' +
        days.map(function (d) { var it = d.items.slice(0, 2); return '<div class="d"><div class="dh"><b>' + (WK[d.weekday] || d.weekday.slice(0, 2).toUpperCase()) + "</b><span>" + dmy(d.date) + '</span></div><div style="display:grid;gap:12px">' +
          it.map(function (x) { return '<div class="it">' + esc(x.label) + "<small>" + esc([x.kind === "zahlen" ? "Quartalszahlen" : null, x.time, x.sub].filter(Boolean).join(" · ")) + "</small></div>"; }).join("") + "</div></div>"; }).join("") + "</div>" });
    }
    // 6 Schluss mit echten Bildschirmen
    var sc = o.screens || [];
    var fan = sc.length >= 3 ? '<div style="position:relative;height:430px;margin-top:30px"><img src="' + sc[1] + '" style="position:absolute;left:150px;top:50px;width:185px;border-radius:26px;transform:rotate(-8deg);box-shadow:0 0 0 3px #333"><img src="' + sc[2] + '" style="position:absolute;right:150px;top:50px;width:185px;border-radius:26px;transform:rotate(8deg);box-shadow:0 0 0 3px #333"><img src="' + sc[0] + '" style="position:absolute;left:50%;margin-left:-100px;top:0;width:200px;border-radius:28px;z-index:2;box-shadow:0 30px 60px -20px rgba(200,245,49,.35),0 0 0 3px #c8f531"></div>' : "";
    out.push({ bg: "k", label: "VISION UNIVERSE", html: '<div style="margin-top:60px"><h2>Der Börsentag als <mark>Story.</mark></h2><p class="say">Das ganze Marktbriefing mit allen Szenen, Ausblick und PDF.</p></div>' + fan +
      '<div class="cta"><div class="url">visionuniverse.de/marktbriefing</div><div class="icons"><span>↗ Teilen</span><span>⌑ Speichern</span><span>＋ Folgen</span></div></div>' });
    var n = out.length;
    return out.map(function (s, i) { return '<section class="s ' + s.bg + '" id="s' + (i + 1) + '">' + top(s.label, i + 1, n) + s.html + "</section>"; });
  }

  function html(b, o) { o = o || {}; return "<!doctype html><meta charset=utf-8><style>" + CSS.replace("__FONT__", o.font || "") + "</style>" + slides(b, o).join("\n"); }

  function caption(b) {
    var C = {}; b.cards.forEach(function (c) { C[c.id] = c; });
    var t0 = b.cards.filter(function (c) { return c.topic; })[0], lines = [];
    var d = new Date(b.session + "T12:00:00Z"), day = WD[d.getUTCDay()] + ", " + dmy(b.session) + b.session.slice(0, 4);
    var cnt = t0 && t0.stat ? t0.stat.value : null, hk = t0 && HOOK[t0.topic] && cnt ? HOOK[t0.topic](cnt) : [t0 ? t0.title : C.overview.title, ""];
    lines.push(hk[0] + "." + (hk[1] ? " " + hk[1].split(".")[0] + "." : "") + " 👇", "");
    lines.push("Der Börsentag vom " + day + " in Folien:");
    if (t0) lines.push("📉 " + t0.title + (t0.bars && t0.bars.rows[0] ? " – vorne " + t0.bars.rows[0].label : ""));
    if (C.valuation) lines.push("💡 " + valTitle(C.valuation.title));
    var a50 = C.picture && C.picture.textStats.filter(function (s) { return s.label === "Marktbreite"; })[0];
    if (a50) lines.push("🔎 " + Math.round(a50.value) + " von 100 US-Aktien liegen über ihrer 50-Tage-Linie");
    if (C.agenda) lines.push("📅 Als Nächstes: " + C.agenda.agenda.days.slice(0, 3).map(function (dd) { return dd.weekday + " " + dd.items[0].label; }).join("; "));
    lines.push("", "Das ganze Marktbriefing mit allen Szenen, Ausblick und PDF: visionuniverse.de/marktbriefing (Link in Bio)", "", "Speichern, wenn du die Woche im Blick behalten willst.", "");
    lines.push("Daten: Börsenschluss " + dmy(b.session) + b.session.slice(0, 4) + ", eigene Auswertung (Technical, SEC-Daten, Marktbreite)" + (C.agenda ? "; Termine laut Unternehmen und Behörden" : "") + ". Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.", "");
    lines.push("#Börse #Aktien #Marktbriefing #Investieren #Finanzen #Wallstreet #SP500 #VisionUniverse");
    return lines.join("\n") + "\n";
  }

  var api = { slides: slides, html: html, caption: caption, marked: marked, valTitle: valTitle };
  if (isNode) module.exports = api;
  else global.VUMarketBriefingSocial = api;
})(typeof window !== "undefined" ? window : globalThis);

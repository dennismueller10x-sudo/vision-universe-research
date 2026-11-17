/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine/chart-explain.js
   „CHART ERKLÄREN“: DER CHART IN ACHT EINFACHEN SCHRITTEN

   Fuer Menschen ohne Chartwissen: Ein Tipp, und die Chart-Seite geht Schritt
   fuer Schritt durch Richtung, Phase, EMA-Linienbuendel, Staerke im Vergleich,
   Boden und Decke, Fibonacci, Schwung und Chartmuster. Je Schritt ein Satz in Alltagssprache,
   ein „Was heißt das?“ und die passende Ebene im Chart.

   Diese Datei rechnet NICHTS Neues. Sie formuliert Werte, die schon da sind:
     Richtung     featuresAtCutoff.sma200 und chartSeries.sma200 (Steigung ueber 21 Handelstage)
     Phase        ti/dow-trend.js#weinsteinStage (Vier-Phasen-Modell, 150-Tage-Linie)
     Linien       ema-cluster.js#calculate (GMMA 3–15 / 30–60, docs/technical/EMA_CLUSTER.md):
                  letzte Zeile (Trend, Anordnung, Dynamik) und juengstes Ereignis der letzten 5 Balken
     Staerke      rsRank der Aktien-Scherbe (screen-row.js#rankRs, 6 Monate)
     Boden/Decke  ti/levels.js#supportResistance (naechste Zonen)
     Fibonacci    ti/levels.js#fibOfSwing am letzten grossen Schwung (Regel unten)
     Schwung      featuresAtCutoff.rsi14
     Muster       formations.js#analyzeAt (aktive Formation)
   Darstellungsregel Fibonacci (vorab festgelegt, keine Auswahl „schoener“ Swings):
     Skala scale-3 der TI-Pivots, sonst scale-2; Schwung = letzter bestaetigter Pivot
     bis zum laufenden Pivot, ohne laufenden Pivot die letzten zwei bestaetigten.
   Keine Prognose, keine Empfehlung, kein Score. Ampeln beschreiben den Zustand.

   Browser: globalThis.VUTechnical.ChartExplain; Node: module.exports.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "technical-chart-explain-1.1.0";
  var EMA_EVENT_BARS = 5;
  var FIB_RATIOS = [0.382, 0.5, 0.618];
  var FIB_SCALES = ["scale-3", "scale-2"];
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function num(v, d) { return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function usd(v) { return num(v, v < 1000 ? 2 : 0) + "\u00a0$"; }
  function pct(v) { return num(Math.abs(v) * 100, Math.abs(v) < 0.1 ? 1 : 0) + "\u00a0%"; }
  function month(iso) { return iso ? MONTHS[+iso.slice(5, 7) - 1] + " " + iso.slice(0, 4) : ""; }

  /** Letzter grosser Schwung fuer Fibonacci (Regel im Kopf). ctx = ti/context.js#at, Lv = ti/levels.js. */
  function fibSwing(ctx, Lv) {
    if (!ctx || !ctx.view || !Lv) return null;
    for (var i = 0; i < FIB_SCALES.length; i++) {
      var v = ctx.view(FIB_SCALES[i]); if (!v || !v.confirmed || !v.confirmed.length) continue;
      var c = v.confirmed, a, b, developing = false;
      if (v.developing) { a = c[c.length - 1]; b = v.developing; developing = true; }
      else if (c.length >= 2) { a = c[c.length - 2]; b = c[c.length - 1]; }
      else continue;
      if (!isNum(a.pivotPrice) || !isNum(b.pivotPrice) || a.pivotPrice === b.pivotPrice) continue;
      var levels = Lv.fibOfSwing(a.pivotPrice, b.pivotPrice, FIB_SCALES[i]).filter(function (l) {
        return l.kind === "RETRACEMENT" && FIB_RATIOS.indexOf(l.ratio) >= 0;
      }).map(function (l) { return { ratio: l.ratio, price: l.price }; });
      return { scale: FIB_SCALES[i], developing: developing, up: b.pivotPrice > a.pivotPrice,
        from: { price: a.pivotPrice, time: String(a.pivotTime).slice(0, 10) }, to: { price: b.pivotPrice, time: String(b.pivotTime).slice(0, 10) }, levels: levels };
    }
    return null;
  }

  function step(id, title, text, meaning, tone, layer, short) {
    return { id: id, title: title, text: text, meaning: meaning, tone: tone || "none", layer: layer || null, short: short || null };
  }

  /* 1 · Richtung: 200-Tage-Linie, Lage und Steigung. */
  function richtung(X) {
    var c = X.close, s = X.sma200, past = X.sma200Past;
    var meaning = "Die 200-Tage-Linie ist der Durchschnittskurs der letzten 200 Handelstage, also grob eines Jahres. Profis schauen zuerst auf sie: Liegt der Kurs darüber und steigt die Linie, zeigt der große Trend nach oben.";
    if (!isNum(c) || !isNum(s)) return step("richtung", "Wohin läuft die Aktie?", "Für die 200-Tage-Linie ist die Kurshistorie zu kurz.", meaning, "none", "avg");
    var above = c > s, d = c / s - 1, rising = isNum(past) ? s > past : null;
    var where = "Der Kurs liegt " + pct(d) + (above ? " über" : " unter") + " der 200-Tage-Linie";
    if (above && rising !== false) return step("richtung", "Wohin läuft die Aktie?", where + (rising ? ", und die Linie steigt. Das ist ein Aufwärtstrend." : "."), meaning, "strong", "avg", "Aufwärtstrend");
    if (!above && rising !== true) return step("richtung", "Wohin läuft die Aktie?", where + (rising === false ? ", und die Linie fällt. Das ist ein Abwärtstrend." : "."), meaning, "weak", "avg", "Abwärtstrend");
    if (above) return step("richtung", "Wohin läuft die Aktie?", where + ", aber die Linie fällt noch. Der Trend könnte drehen, entschieden ist das noch nicht.", meaning, "mid", "avg", "Trend dreht vielleicht nach oben");
    if (d > -0.05) return step("richtung", "Wohin läuft die Aktie?", where + ", die Linie steigt aber noch. Der Aufwärtstrend hat einen Kratzer.", meaning, "mid", "avg", "Aufwärtstrend mit Kratzer");
    return step("richtung", "Wohin läuft die Aktie?", where + ". Die Linie steigt zwar noch, aber der Aufwärtstrend ist deutlich angeschlagen.", meaning, "weak", "avg", "Aufwärtstrend angeschlagen");
  }

  /* 2 · Phase: Vier-Phasen-Modell an der 150-Tage-Linie (ti/dow-trend.js#weinsteinStage). */
  var PHASE = {
    1: ["Phase 1 von 4: Bodenbildung. Nach dem Fallen tritt die Aktie auf der Stelle, die 150-Tage-Linie wird flach.", "mid", "Phase 1: Bodenbildung"],
    2: ["Phase 2 von 4: Anstieg. Der Kurs läuft über der steigenden 150-Tage-Linie.", "strong", "Phase 2: Anstieg"],
    3: ["Phase 3 von 4: Gipfelbildung. Nach dem Anstieg geht der Aktie die Puste aus, die 150-Tage-Linie wird flach.", "mid", "Phase 3: Gipfelbildung"],
    4: ["Phase 4 von 4: Abstieg. Der Kurs läuft unter der fallenden 150-Tage-Linie.", "weak", "Phase 4: Abstieg"]
  };
  function phase(X) {
    var meaning = "Ein bekanntes Modell aus den 1980ern teilt den Weg einer Aktie in vier Phasen: Boden, Anstieg, Gipfel, Abstieg. Gemessen wird an der 150-Tage-Linie (rund 30 Wochen) und daran, ob sie steigt, fällt oder flach ist.";
    var p = X.stage && PHASE[X.stage.stage];
    if (!p) return step("phase", "In welcher Phase steckt sie?", "Die Phase lässt sich gerade nicht eindeutig bestimmen.", meaning, "none", "stage");
    return step("phase", "In welcher Phase steckt sie?", p[0], meaning, p[1], "stage", p[2]);
  }

  /* 3 · Linienbuendel: EMA-Cluster (schnell 3–15, langsam 30–60 Tage). */
  function dayMonth(iso) { return iso ? +iso.slice(8, 10) + "." + +iso.slice(5, 7) + "." : ""; }
  var EMA_EVENT = {
    PULLBACK_FAST: function (e) { return "Am " + dayMonth(e.date) + " ist der Kurs in das schnelle Bündel " + (e.direction === "DOWN" ? "hochgelaufen." : "zurückgefallen."); },
    PULLBACK_SLOW: function (e) { return "Am " + dayMonth(e.date) + " ist der Kurs bis in das langsame Bündel " + (e.direction === "DOWN" ? "hochgelaufen." : "zurückgefallen."); },
    RESUME_UP: function (e) { return "Am " + dayMonth(e.date) + " hat er sich wieder nach oben abgesetzt."; },
    RESUME_DOWN: function (e) { return "Am " + dayMonth(e.date) + " hat er sich wieder nach unten abgesetzt."; },
    COMPRESSION_BREAKOUT_UP: function (e) { return "Am " + dayMonth(e.date) + " ist der Kurs aus der engen Phase nach oben ausgebrochen."; },
    COMPRESSION_BREAKOUT_DOWN: function (e) { return "Am " + dayMonth(e.date) + " ist der Kurs aus der engen Phase nach unten ausgebrochen."; },
    DOWN_TO_UP: function (e) { return "Am " + dayMonth(e.date) + " haben die Bündel von abwärts auf aufwärts gedreht."; },
    UP_TO_DOWN: function (e) { return "Am " + dayMonth(e.date) + " haben die Bündel von aufwärts auf abwärts gedreht."; }
  };
  function linien(X) {
    var meaning = "Zwölf gleitende Durchschnitte (EMA) in zwei Bündeln: Die sechs schnellen (3 bis 15 Tage) zeigen, was kurzfristige Trader tun, die sechs langsamen (30 bis 60 Tage) zeigen die Anleger mit längerem Atem. Liegen alle schnellen über allen langsamen und steigen beide, sind sich beide Gruppen einig. Eng beieinander heißt: unentschlossen. Auffächern heißt: Die Bewegung nimmt Fahrt auf. Wie gut diese Lesart in der Vergangenheit war, wertet Vision Universe in einer eigenen Studie aus.";
    var e = X.ema, title = "Ziehen kurze und lange Linien an einem Strang?";
    if (!e || !e.trend) return step("linien", title, "Für die Linienbündel ist die Kurshistorie noch zu kurz.", meaning, "none", "ema");
    var text, tone, short = null;
    if (e.trend === "UP") { text = "Alle schnellen Linien liegen über allen langsamen, und beide Bündel steigen. Kurz- und langfristige Anleger ziehen an einem Strang nach oben."; tone = "strong"; short = "Linien einig nach oben"; }
    else if (e.trend === "DOWN") { text = "Alle schnellen Linien liegen unter allen langsamen, und beide Bündel fallen. Kurz- und langfristige Anleger ziehen an einem Strang nach unten."; tone = "weak"; short = "Linien einig nach unten"; }
    else if (e.trend === "SIDEWAYS") { text = "Alle Linien liegen eng beieinander und laufen flach. Der Markt ist unentschlossen; danach kann eine größere Bewegung folgen, die Richtung ist offen."; tone = "mid"; }
    else if (e.arrangement === "BULLISH") { text = "Die schnellen Linien liegen noch über den langsamen, aber nicht beide Bündel steigen. Der Aufwärtstrend verliert an Tempo."; tone = "mid"; }
    else if (e.arrangement === "BEARISH") { text = "Die schnellen Linien liegen noch unter den langsamen, aber nicht beide Bündel fallen. Der Abwärtsdruck lässt nach."; tone = "mid"; }
    else { text = "Schnelle und langsame Linien laufen durcheinander. Der Trend ist im Wechsel, eine klare Richtung fehlt."; tone = "mid"; }
    if (e.dynamics === "EXPANSION" && (e.trend === "UP" || e.trend === "DOWN")) text += " Die Bündel fächern gerade auf: Die Bewegung nimmt Fahrt auf.";
    else if (e.dynamics === "COMPRESSION" && e.trend !== "SIDEWAYS") text += " Die Bündel ziehen sich gerade eng zusammen.";
    if (e.event && EMA_EVENT[e.event.type]) text += " " + EMA_EVENT[e.event.type](e.event);
    return step("linien", title, text, meaning, tone, "ema", short);
  }

  /* Juengstes erklaertes Ereignis der letzten EMA_EVENT_BARS Balken aus einem ema-cluster.js-Ergebnis. */
  function emaSummary(result) {
    var rows = result && result.rows || [], last = rows[rows.length - 1];
    if (!last || last.quality !== "READY") return null;
    var since = rows.length > EMA_EVENT_BARS ? rows[rows.length - EMA_EVENT_BARS].date : rows[0].date;
    var ev = (result.events || []).filter(function (x) { return x.date >= since && EMA_EVENT[x.type]; });
    return { trend: last.trend, arrangement: last.arrangement, dynamics: last.dynamics, event: ev.length ? { type: ev[ev.length - 1].type, direction: ev[ev.length - 1].direction, date: ev[ev.length - 1].date } : null };
  }

  /* 4 · Staerke im Vergleich: RS-Rang 0..100 ueber 6 Monate. */
  function staerke(X) {
    var meaning = "Wir vergleichen die Kursentwicklung der letzten 6 Monate mit allen aktuellen US-Aktien in Vision Universe. 100 heißt: die stärkste, 0: die schwächste. Viele Trader schauen bevorzugt auf Aktien, die stärker laufen als der Rest.";
    var r = X.rsRank;
    if (!isNum(r)) return step("staerke", "Stärker oder schwächer als andere?", "Für den Vergleich mit anderen Aktien fehlt gerade ein aktueller Wert.", meaning, "none", null);
    var k = Math.round(r);
    if (k >= 50) return step("staerke", "Stärker oder schwächer als andere?", "In den letzten 6 Monaten lief die Aktie besser als " + k + " von 100 Aktien.", meaning, k >= 70 ? "strong" : "mid", null, "besser als " + k + " von 100 Aktien");
    return step("staerke", "Stärker oder schwächer als andere?", "In den letzten 6 Monaten lief die Aktie schlechter als " + (100 - k) + " von 100 Aktien.", meaning, k < 30 ? "weak" : "mid", null, "schlechter als " + (100 - k) + " von 100 Aktien");
  }

  /* 5 · Boden und Decke: naechste Unterstuetzungs- und Widerstandszone. */
  function zonen(X) {
    var meaning = "Boden (Unterstützung) und Decke (Widerstand) sind Preisbereiche, an denen der Kurs früher gedreht hat. Viele Anleger merken sich solche Preise, deshalb reagiert der Kurs dort öfter erneut, muss er aber nicht. Bricht er durch, wird aus einer Decke oft ein neuer Boden.";
    var c = X.close, S = X.support, R = X.resistance, parts = [], short = null;
    function z(x) { return usd(x.zoneLow).replace("\u00a0$", "") + "–" + usd(x.zoneHigh); }
    function has(x, k) { return (x.kinds || []).indexOf(k) >= 0; }
    if (S && isNum(c)) parts.push("Boden bei " + z(S) + " (" + pct(c / S.zoneHigh - 1) + " unter dem Kurs): " + (has(S, "LOW_52W") && !(S.touches > 0) ? "Hier liegt das Jahrestief." : "Hier wurde der Kurs schon aufgefangen."));
    if (R && isNum(c)) parts.push("Decke bei " + z(R) + " (" + pct(R.zoneLow / c - 1) + " über dem Kurs): " + (has(R, "HIGH_52W") && !(R.touches > 0) ? "Hier liegt das Jahreshoch." : "Hier wurde er gebremst."));
    if (!parts.length) return step("zonen", "Wo ist der Boden, wo die Decke?", "Gerade liegt keine klare Zone in der Nähe des Kurses.", meaning, "none", "zones");
    var dS = S ? c / S.zoneHigh - 1 : Infinity, dR = R ? R.zoneLow / c - 1 : Infinity;
    if (Math.min(dS, dR) <= 0.05) short = dR <= dS ? "Kurs nah an der Decke" : "Kurs nah am Boden";
    return step("zonen", "Wo ist der Boden, wo die Decke?", parts.join(" "), meaning, "none", "zones", short);
  }

  /* 6 · Fibonacci am letzten grossen Schwung. */
  function fibonacci(X) {
    var meaning = "Fibonacci ist bei Tradern sehr beliebt: Man misst eine große Bewegung und teilt sie bei 38,2 %, 50 % und 61,8 %. Ehrlich gesagt: In unserer Auswertung von über 300.000 Gegenbewegungen drehte der Kurs an diesen Marken nicht öfter als knapp daneben. Nimm sie als grobe Orientierung, nicht als Zauberlinie.";
    var f = X.fib, c = X.close;
    if (!f || !f.levels || !f.levels.length) return step("fibonacci", "Wie weit geht ein Rücksetzer? (Fibonacci)", "Gerade gibt es keinen klar abgeschlossenen großen Schwung zum Messen.", meaning, "none", "fib");
    var marks = f.levels.map(function (l) { return num(l.ratio * 100, l.ratio === 0.5 ? 0 : 1) + "\u00a0% bei " + usd(l.price); }).join(", ");
    var span = f.to.price - f.from.price, back = isNum(c) ? (f.to.price - c) / span : null;
    var text = (f.up ? "Der letzte große Anstieg ging von " : "Der letzte große Rückgang ging von ") + usd(f.from.price) + " (" + month(f.from.time) + ") auf " + usd(f.to.price) + " (" + month(f.to.time) + "). " +
      (f.up ? "Die Fibonacci-Marken für einen Rücksetzer liegen bei " : "Die Fibonacci-Marken für eine Erholung liegen bei ") + marks + ".";
    if (isNum(back)) {
      if (back <= 0) text += f.up ? " Der Kurs steht gerade am oberen Ende des Anstiegs." : " Der Kurs steht gerade am unteren Ende des Rückgangs.";
      else if (back < 1) text += f.up ? " Bisher hat die Aktie " + pct(back) + " des Anstiegs wieder abgegeben." : " Bisher hat die Aktie " + pct(back) + " des Rückgangs wieder aufgeholt.";
      else text += f.up ? " Der Kurs ist inzwischen unter den Anfang des Anstiegs gefallen." : " Der Kurs ist inzwischen über den Anfang des Rückgangs gestiegen.";
    }
    return step("fibonacci", "Wie weit geht ein Rücksetzer? (Fibonacci)", text, meaning, "none", "fib");
  }

  /* 7 · Schwung: RSI 14 in Worten. */
  function schwung(X) {
    var meaning = "Schwung heißt: wie kräftig der Kurs zuletzt gestiegen oder gefallen ist. Fachleute messen das mit dem RSI von 0 bis 100. Über 70 gilt als „überkauft“ (sehr schnell gestiegen), unter 30 als „überverkauft“ (sehr schnell gefallen).";
    var r = X.rsi;
    if (!isNum(r)) return step("schwung", "Wie viel Schwung hat die Aktie?", "Für den Schwung fehlt ein Wert.", meaning, "none", null);
    var t = " (RSI " + num(r, 0) + ")";
    if (r >= 70) return step("schwung", "Wie viel Schwung hat die Aktie?", "Sehr viel Schwung: Die Aktie ist zuletzt sehr schnell gestiegen" + t + ", sie gilt als „überkauft“. Nach so einem Lauf kann eine Verschnaufpause folgen, muss aber nicht.", meaning, "strong", null, "„überkauft“");
    if (r >= 55) return step("schwung", "Wie viel Schwung hat die Aktie?", "Guter Schwung: Die Aktie ist zuletzt eher gestiegen" + t + ".", meaning, "strong", null);
    if (r > 45) return step("schwung", "Wie viel Schwung hat die Aktie?", "Ausgeglichen: weder viel Schwung nach oben noch nach unten" + t + ".", meaning, "mid", null);
    if (r > 30) return step("schwung", "Wie viel Schwung hat die Aktie?", "Wenig Schwung: Die Aktie ist zuletzt eher gefallen" + t + ".", meaning, "weak", null);
    return step("schwung", "Wie viel Schwung hat die Aktie?", "Die Aktie ist zuletzt sehr schnell gefallen" + t + ", sie gilt als „überverkauft“. Danach kann eine Gegenbewegung folgen, muss aber nicht.", meaning, "weak", null, "„überverkauft“");
  }

  /* 8 · Chartmuster: juengste aktive Formation (Name und Satz liefert die Ansicht). */
  function muster(X) {
    var meaning = "Chartmuster sind wiederkehrende Formen im Kursverlauf, zum Beispiel Dreiecke, Flaggen oder Doppelböden. Unsere Regeln erkennen sie automatisch und zeichnen sie ein. Auf der Seite „Muster“ steht, welche Muster sich in der Vergangenheit messbar abgehoben haben und welche nicht.";
    var f = X.formation;
    if (!f) return step("muster", "Gibt es ein bekanntes Chartmuster?", "Gerade ist kein Chartmuster aktiv. Das ist normal: Meistens gibt es keins.", meaning, "none", "trend");
    var dir = f.direction > 0 ? "deutet nach oben" : f.direction < 0 ? "deutet nach unten" : "Richtung offen";
    var text = f.name + (f.confirmed ? " (bestätigt)" : " (erkannt)") + ". " + (f.sentence ? f.sentence + " " : "") + "Laut Regel: " + dir + ".";
    return step("muster", "Gibt es ein bekanntes Chartmuster?", text, meaning, f.direction > 0 ? "strong" : f.direction < 0 ? "weak" : "none", "trend", f.name);
  }

  /**
   * X: { close, sma200, sma200Past, stage, ema, rsRank, support, resistance, fib, rsi, formation }
   *   ema: emaSummary(ema-cluster.js#calculate(...)) oder null
   *   formation: { name, sentence, direction (-1|0|1), confirmed } oder null
   * Rueckgabe: { version, headline, steps[], note }
   */
  function explain(X) {
    X = X || {};
    var steps = [richtung(X), phase(X), linien(X), staerke(X), zonen(X), fibonacci(X), schwung(X), muster(X)];
    steps.forEach(function (s, i) { s.n = i + 1; });
    var shorts = ["richtung", "staerke", "zonen"].map(function (id) { return steps.filter(function (s) { return s.id === id; })[0].short; }).filter(Boolean);
    var headline = shorts.length ? shorts.join(" · ") : null;
    return { version: VERSION, headline: headline, steps: steps,
      note: "Das ist eine Beschreibung des Charts, keine Vorhersage und keine Handlungsempfehlung." };
  }

  var api = { VERSION: VERSION, FIB_RATIOS: FIB_RATIOS, FIB_SCALES: FIB_SCALES, EMA_EVENT_BARS: EMA_EVENT_BARS, explain: explain, fibSwing: fibSwing, emaSummary: emaSummary };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ChartExplain = api; }
})(typeof window !== "undefined" ? window : globalThis);

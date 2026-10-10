/* =========================================================================
   DIE FRONTEND-TRANSFORMATION, ALS REGRESSION FESTGEHALTEN.

   Jede Regel hier stammt aus einer Messung am 28.09.2026 und nicht aus
   einer Meinung. Wo eine Zahl im Kommentar steht, ist sie gemessen; ohne
   sie liest sich eine Schwelle in einem Jahr wie eine Willkür und wird
   "vereinfacht".

   Was hier NICHT geprüft wird: wie die Seite aussieht. Das entscheidet der
   Browser-Lauf gegen das gebaute Release. Hier stehen die Verträge, die
   auch ohne Browser falsch sein können - und die beim Umbau schon einmal
   falsch WAREN.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die Oberflaechen-
   Vertraege werden jetzt an quant/index.html und quant/app/*.js geprueft
   (vu2/experience.js und vu2/index.html als App sind entfernt; vu2/ ist nur
   noch eine Weiterleitung nach /quant/). Wo moeglich am Verhalten: ui.js,
   pages.js und die reinen Routenfunktionen aus app.js werden in einer
   vm-Sandbox geladen, view-model.js per require(). Die Engine-Tests (2)
   sind unveraendert.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const HistoricalCases = require(join(ROOT, "quant/engines/historical-cases.js"));
const PatternResearch = require(join(ROOT, "quant/engines/pattern-research.js"));
const VM = require(join(ROOT, "quant/app/view-model.js"));
const src = (p) => readFileSync(join(ROOT, p), "utf8");
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const shell = src("quant/index.html");
const uiSrc = src("quant/app/ui.js");
const pagesSrc = src("quant/app/pages.js");
const appSrc = src("quant/app/app.js");
const stockSrc = src("quant/app/page-stock.js");

/* ui.js und pages.js greifen beim Laden auf kein DOM zu - in einer Sandbox
   mit einem Platzhalter fuer QuantShell.el liefern sie ihre echten Tabellen
   (NAV, routes, QUESTIONS). */
const sandbox = { QuantShell: { el() { return {}; } }, VUQuantViewModel: VM, URLSearchParams };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(uiSrc, sandbox);
vm.runInContext(pagesSrc, sandbox);
const QX = sandbox.QX, QXPages = sandbox.QXPages;
/* Werte aus der Sandbox stammen aus einem anderen Realm; fuer deepEqual
   werden sie als reine Daten uebernommen. */
const daten = (x) => JSON.parse(JSON.stringify(x));
/* legacyRoute und parse sind reine Funktionen; app.js selbst startet beim
   Laden die Shell. Deshalb werden genau diese beiden Funktionen aus der
   Quelle geschnitten und ausgefuehrt. */
const routing = (() => {
  const von = appSrc.indexOf("function legacyRoute(");
  const bis = appSrc.indexOf("var SECTION");
  assert.ok(von > 0 && bis > von, "legacyRoute/parse in quant/app/app.js nicht gefunden");
  return new Function(appSrc.slice(von, bis) + "; return { legacyRoute: legacyRoute, parse: parse };")();
})();
function abschnitt(text, von, bis) {
  const a = text.indexOf(von);
  assert.ok(a >= 0, "Abschnitt nicht gefunden: " + von);
  const b = bis ? text.indexOf(bis, a + von.length) : -1;
  return text.slice(a, b > a ? b : undefined);
}

function bundle(ticker) {
  const key = (ticker + "_").slice(0, 2);
  return JSON.parse(gunzipSync(readFileSync(join(ROOT, "quant/data/product/pattern-match-v1/" + key + ".json.gz"))));
}
function bars(ticker) {
  const raw = JSON.parse(readFileSync(join(ROOT, "quant/data/market/discover-series-long/ref_" + ticker + ".json"), "utf8"));
  return (raw.points || []).map(([date, close]) => ({ date, close }));
}
function assess(ticker) {
  const b = bundle(ticker);
  return HistoricalCases.assess({
    bars: bars(ticker),
    vocabulary: HistoricalCases.vocabulary(b),
    holds: (b.instruments[ticker] || {}).holds || []
  });
}

/* ---------------------------------------------------------------- 1 */
/* UI-Vereinheitlichung 10/2026: die Bereiche von Quant stehen in der
   gemeinsamen Produkt-Leiste der Vision-Universe-Shell (PRODUCTS in
   assets/site-navigation.js). Quant baut keine eigene Leiste mehr. */
const navSource = src("assets/site-navigation.js");
const navBox = { HTMLElement: class {}, URLSearchParams, customElements: { define() {} } };
vm.runInNewContext(navSource.replace(/\}\)\(\);\s*$/, "globalThis.__p = PRODUCTS;})();"), navBox);
const QUANT_DOCK = navBox.__p.find((p) => p.id === "quant");

test("Die Quant-Navigation führt genau die vier Hauptbereiche plus das globale Menü", () => {
  const items = daten(QUANT_DOCK.items.map(([id, label, href, , name]) => [id, label, href, name || null]));
  /* Erster Eintrag = Produktname (nie "Home"), dann Screener, Strategien, Aktien. */
  assert.deepEqual(items, [
    ["quant", "Quant", "/quant/#/", null], ["screener", "Screener", "/quant/#/screener", "Quant Screener"],
    ["strategien", "Strategien", "/quant/#/strategien", null], ["aktien", "Aktien", "/quant/#/aktien", null]
  ]);
  /* Jeder Bereich fuehrt auf eine Route, die der Router kennt. */
  for (const [, label, href] of QUANT_DOCK.items) {
    assert.notEqual(routing.parse(href.replace(/^\/quant\//, "")).view, "notfound", label + " fuehrt ins Leere: " + href);
  }
  /* Methodik bleibt erreichbar - als sekundaerer Bereich im Fuss und im Hero. */
  assert.match(appSrc, /el\("a", \{ href: "#\/methodik", text: "Methodik" \}\)/);
  assert.match(pagesSrc, /X\.btn\("Warum kann ich dem vertrauen\?", X\.routes\.method\(\)/);
  /* Keine zweite, abweichende Navigation: Quant baut keine eigene Leiste. */
  assert.doesNotMatch(ohneKommentare(appSrc), /v2-dock|qx-tabbar|qx-nav|q-top/, "Quant baut wieder eine eigene Bereichsleiste");
  /* Der Router meldet den aktiven Bereich an die gemeinsame Leiste. */
  assert.match(appSrc, /global\.VUNavigation\.dock\(\{ active:/);
});

test("Kein fremdes Produkt steht in der Quant-Navigation", () => {
  /* Discover, Research und Markets sind andere Produkte, Portfolio ist
     ausdrücklich nicht Teil dieser Transformation. Sie standen alle vier
     in der alten Leiste. */
  const text = JSON.stringify(QUANT_DOCK.items).toLowerCase();
  for (const fremd of ["discover", "research", "markets", "portfolio"]) {
    assert.ok(!text.includes(fremd), fremd + " gehört nicht in die Quant-Navigation");
  }
  /* Und alle Bereiche bleiben innerhalb von Quant (Hash-Routen unter /quant/). */
  for (const [, label, href] of QUANT_DOCK.items) assert.match(href, /^\/quant\/#\//, label + " verlaesst Quant: " + href);
});

test("Die Navigationsänderung hat keine Ansicht entfernt", () => {
  /* GEMESSEN: als die Liste der gültigen Ansichten aus `nav` abgeleitet
     wurde, lieferten /vu2/?view=portfolio, =discover, =markets und
     =research nach dem Navigationsumbau "Diese Ansicht wurde nicht
     gefunden". Eine Leiste zu kürzen hatte Funktionen abgeschaltet.

     Frontend-Rebuild: die alten Ansichten (?view=...) werden in
     quant/app/app.js legacyRoute() EINMAL auf eine neue Route abgebildet.
     Jede alte Ansicht - mit und ohne Ticker - muss auf eine Route fuehren,
     die parse() kennt; keine darf auf "nicht gefunden" fallen. */
  for (const bestand of ["home", "screener", "strategies", "stocks", "explain", "stock",
    "technical", "elliott", "quant", "fundamentals", "compare", "watchlist", "signals",
    "radar", "atlas", "portfolio", "markets", "discover", "research"]) {
    for (const suche of ["?view=" + bestand, "?view=" + bestand + "&ticker=AAPL"]) {
      const ziel = routing.legacyRoute(suche);
      assert.ok(typeof ziel === "string" && ziel.startsWith("#/"), "Ansicht " + bestand + " hat kein Ziel: " + ziel);
      assert.notEqual(routing.parse(ziel).view, "notfound", "Ansicht " + bestand + " ist nicht mehr erreichbar (" + suche + " -> " + ziel + ")");
    }
  }
  /* Eine Aktienansicht mit Ticker landet auf der Aktie, nicht nur im Bereich. */
  assert.equal(routing.parse(routing.legacyRoute("?view=stock&ticker=NVDA")).ticker, "NVDA");
  assert.equal(routing.parse(routing.legacyRoute("?view=technical&ticker=NVDA")).view, "technik");
  assert.equal(routing.parse(routing.legacyRoute("?view=fundamentals&ticker=NVDA")).view, "zahlen");
  /* Die Weiterleitung von /vu2/ reicht Suche und Hash durch - sonst kaeme
     die alte Ansicht nie bei legacyRoute an. */
  assert.match(src("vu2/index.html"), /location\.replace\("\/quant\/"\s*\+\s*location\.search\s*\+\s*location\.hash\)/);
  /* Jede Ansicht, die parse() liefert, hat im Router einen Fall. */
  const router = abschnitt(appSrc, "async function route(", "document.addEventListener(\"click\"");
  for (const view of ["home", "screener", "strategien", "aktien", "aktie", "technik", "zahlen", "vergleich", "methodik"]) {
    assert.match(router, new RegExp('case "' + view + '":'), "der Router behandelt " + view + " nicht");
  }
  /* Die Routen werden nicht aus der Navigation abgeleitet. */
  assert.ok(!/NAV/.test(abschnitt(appSrc, "function legacyRoute(", "var SECTION")),
    "die Routen duerfen nicht wieder aus der Navigation abgeleitet werden");
});

/* ---------------------------------------------------------------- 2 */
test("Die Vergleichsfall-Engine rechnet mit der Studien-Engine, nicht mit einer zweiten", () => {
  /* 1.1.0 (01.10.2026): 1-Monats-Fenster und weitere Lesarten derselben
     Faelle - die Rechnung bleibt die der Studien-Engine. */
  assert.equal(HistoricalCases.VERSION, "historical-cases-1.1.0");
  const quelle = readFileSync(join(ROOT, "quant/engines/historical-cases.js"), "utf8");
  for (const fn of ["featuresAt", "outcomeAfter", "runningMaxOf"]) {
    assert.ok(quelle.includes("PatternResearch." + fn),
      fn + " muss aus pattern-research kommen - eine eigene Kopie wäre eine zweite Methodik");
  }
  /* Keine eigene Merkmalsberechnung: taucht eines der Studienmerkmale als
     eigene Formel auf, ist die Engine auseinandergelaufen. */
  assert.ok(!/function\s+featuresAt/.test(quelle));
  assert.ok(PatternResearch.METHODOLOGY_VERSION, "die Studienversion muss lesbar sein");
});

test("Unter zehn abgeschlossenen Fällen entsteht keine Kennzahl", () => {
  /* GEMESSEN: NVDA hat für die heute geltende Kurslage 3 Phasen, davon
     genau EINE mit abgeschlossenem Zwölf-Monats-Fenster. Das Mockup zeigte
     an dieser Stelle "+12,8 % in 8 von 10 Fällen" - für diesen Titel nicht
     belegbar. */
  /* Der Fall kommt aus den Daten, nicht aus einem festen Symbol: hier stand
     NVDA, bis die Materialisierung vom 03.10.2026 NVDA neue Musterzustaende
     gab (seitdem mindestens zehn abgeschlossene Faelle). Gesucht wird der
     erste Titel mit verfuegbarer Rueckschau unter der Schwelle - NVDA zuerst. */
  const { readdirSync, existsSync } = require("node:fs");
  const kandidaten = ["NVDA"].concat(readdirSync(join(ROOT, "quant/data/product/pattern-match-v1"))
    .filter((f) => /^[A-Z0-9_-]{2}\.json\.gz$/.test(f)).sort()
    .flatMap((f) => Object.keys(JSON.parse(gunzipSync(readFileSync(join(ROOT, "quant/data/product/pattern-match-v1", f)))).instruments || {}).sort()));
  let nvda = null;
  for (const t of kandidaten) {
    if (!existsSync(join(ROOT, "quant/data/market/discover-series-long/ref_" + t + ".json"))) continue;
    const r = assess(t);
    if (r.state === "AVAILABLE" && r.episodes > 0 && r.episodes < HistoricalCases.MIN_EPISODES) { nvda = r; break; }
  }
  assert.ok(nvda, "kein Titel mit Rueckschau unter der Schwelle gefunden");
  assert.equal(nvda.state, "AVAILABLE");
  assert.ok(nvda.episodes < HistoricalCases.MIN_EPISODES, "der Fall soll unter der Schwelle liegen");
  for (const h of Object.values(nvda.horizons)) {
    if (h.sufficient) continue;
    assert.equal(h.medianReturn, null, "unter der Schwelle darf kein Median im Objekt stehen");
    assert.equal(h.positive, null);
    assert.equal(h.medianDrawdown, null);
    assert.equal(h.lastCaseDate, null, "ohne Verteilung auch kein Einzelfall");
    /* 1.1.0: auch die neuen Lesarten bleiben unter der Schwelle leer. */
    for (const k of ["positiveShare", "meanReturn", "worstReturn", "bestReturn", "quartiles", "worstDrawdown", "medianMaxGain", "chanceRisk", "distribution"])
      assert.equal(h[k], null, k + " darf unter der Schwelle nicht im Objekt stehen");
    assert.equal(h.evidence, "WITHHELD");
  }
  assert.equal(nvda.measured, false);
});

test("Über der Schwelle entsteht eine vollständige Verteilung", () => {
  /* GEMESSEN an AAPL: 32 Phasen seit 1990, 29 mit abgeschlossenem
     Zwölf-Monats-Fenster. */
  const aapl = assess("AAPL");
  const m12 = aapl.horizons.m12;
  assert.ok(m12.completed >= HistoricalCases.MIN_EPISODES);
  assert.equal(m12.sufficient, true);
  assert.ok(Number.isFinite(m12.medianReturn));
  assert.ok(Number.isInteger(m12.positive) && m12.positive <= m12.completed);
  assert.match(m12.lastCaseDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(aapl.measured, true);
  /* 1.1.0: die weiteren Lesarten stehen auf denselben Faellen. */
  assert.ok(Math.abs(m12.positiveShare - m12.positive / m12.completed) < 1e-12, "Anteil im Plus = positive / abgeschlossene Faelle");
  assert.equal(m12.distribution.reduce((n, b) => n + b.count, 0), m12.completed, "die Verteilung zaehlt jeden Fall genau einmal");
  assert.ok(m12.worstDrawdown <= m12.medianDrawdown && m12.worstReturn <= m12.quartiles[0] && m12.quartiles[2] <= m12.bestReturn);
  assert.ok(m12.chanceRisk === null || m12.chanceRisk > 0);
  assert.ok(["BROAD", "THIN"].includes(m12.evidence));
  assert.equal(m12.evidence, m12.completed >= HistoricalCases.BROAD_EPISODES ? "BROAD" : "THIN");
});

test("Zusammenhängende Trefferwochen zählen als ein Fall", () => {
  /* GEMESSEN: ohne diese Bündelung zeigte ACGL 945 Treffer; als Fälle
     gezählt sind es 28. Die ungebündelte Zahl misst Dauer, nicht Häufigkeit. */
  const acgl = assess("ACGL");
  assert.ok(acgl.rawWeeks > acgl.episodes * 5,
    "ACGL muss deutlich mehr Trefferwochen als Fälle haben");
  assert.ok(acgl.episodes < 100, "Fälle dürfen nicht die Trefferwochen sein");
});

test("Nur Kursbedingungen - fundamentale Begriffe gehen nicht ein", () => {
  /* Fundamentale Begriffe bräuchten Point-in-Time-Fundamentaldaten je
     Vergangenheitswoche. Die gibt es je Titel nicht; sie hier trotzdem zu
     prüfen hiesse, die heutige Geschäftslage in die Vergangenheit zu
     schreiben. */
  const b = bundle("NVDA");
  const vocab = HistoricalCases.vocabulary(b);
  const holds = b.instruments.NVDA.holds;
  const fundamental = holds.filter((h) => vocab[h] && vocab[h].family === "FUNDAMENTAL");
  assert.ok(fundamental.length > 0, "NVDA muss fundamentale Begriffe erfüllen");
  const nvda = assess("NVDA");
  for (const id of fundamental) assert.ok(!nvda.conditions.includes(id), id + " darf nicht eingehen");
  assert.equal(nvda.level, "SAME_STOCK_PRICE_CONDITIONS");
});

test("Die Gegenwart ist kein Vergleichsfall", () => {
  /* Die letzte Woche der Reihe hat ihren Ausgang noch vor sich. Zählte sie
     mit, entstünde ein Fall, dessen Ergebnis niemand kennt. */
  const aapl = assess("AAPL");
  assert.ok(aapl.lastEpisodeDate < aapl.to, "die letzte Phase darf nicht die letzte Woche sein");
});

test("Die genannten Grenzen bleiben an der Zahl", () => {
  const aapl = assess("AAPL");
  assert.ok(aapl.limits.length >= 4);
  const text = aapl.limits.join(" ");
  for (const wort of ["Woche", "überlapp", "Kursbedingungen", "Ausschüttungen"]) {
    assert.ok(text.includes(wort), "Grenze fehlt: " + wort);
  }
});

/* ---------------------------------------------------------------- 3 */
test("Die Fläche verspricht keine Zukunft", async () => {
  /* Prognosesprache in der Primärkopie der neuen Bereiche. Die Suche läuft
     über den Abschnitt der Vergleichsfälle, wo die Versuchung am grössten
     ist. Frontend-Rebuild: historischeFaelleSection ist ersetzt durch
     replaySection() in quant/app/page-stock.js und replayView() im View
     Model; geprueft werden beide - die Quelle und die tatsaechlich
     erzeugten Saetze fuer echte Titel. */
  const VERBOTEN = ["wird wahrscheinlich", "dürfte steigen", "Prognose:", "Kursziel"];
  /* "Prognose:" ist als Ankuendigung verboten; die Absage "keine Prognose:"
     (replayView().isNot) ist das Gegenteil und bleibt erlaubt. */
  const enthaelt = (text, verboten) => verboten === "Prognose:"
    ? /(?<![Kk]eine )Prognose:/.test(text) : text.includes(verboten);
  const quelle = abschnitt(stockSrc, "function replaySection(", "function technicalSection(");
  const vmQuelle = abschnitt(src("quant/app/view-model.js"), "function replayView(", "function num0(");
  for (const verboten of VERBOTEN) {
    assert.ok(!enthaelt(quelle, verboten), "Prognosesprache in replaySection: " + verboten);
    assert.ok(!enthaelt(vmQuelle, verboten), "Prognosesprache in replayView: " + verboten);
  }
  const Service = require(join(ROOT, "quant/api/product-services.js"));
  const api = Service.create({
    loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
    loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
    displayPolicy: require(join(ROOT, "quant/engines/display-policy.js")), queryEngine: require(join(ROOT, "quant/engines/query.js"))
  });
  for (const t of ["AAPL", "NVDA"]) {
    const r = VM.replayView(await api.getHistoricalCases(t), await api.getIntelligenceBrief(t), await api.getPatternMatch(t));
    const text = JSON.stringify(r);
    for (const verboten of VERBOTEN) assert.ok(!enthaelt(text, verboten), t + ": Prognosesprache im Replay: " + verboten);
    assert.match(r.isNot, /keine Prognose/, t + ": die Abgrenzung zur Prognose fehlt");
    /* Unter der Schwelle steht keine Zahl auf der Flaeche. */
    const eigen = r.levels.find((l) => l.id === "SAME_STOCK");
    for (const h of eigen.horizons) if (!h.sufficient) assert.equal(h.median, null, t + ": Median unter der Schwelle");
  }
  /* Die Frage über die Vergangenheit muss dastehen - als Titel des Abschnitts. */
  assert.match(stockSrc, /X\.section\("Was geschah früher in ähnlichen Situationen\?"[^\n]*replaySection\(/,
    "die Frage über die Vergangenheit muss über dem Replay stehen");
});

test("Die Engine ist im Shell geladen, und zwar nach der Studie", () => {
  /* Frontend-Rebuild: der Shell ist jetzt quant/index.html. */
  const studie = shell.indexOf("pattern-research.js");
  const faelle = shell.indexOf("historical-cases.js");
  assert.ok(faelle > 0, "historical-cases.js fehlt im Shell");
  assert.ok(studie > 0 && studie < faelle,
    "historical-cases liest VUPatternResearch beim Laden und muss danach kommen");
  /* Und das View Model, das die Faelle liest, kommt nach beiden Engines. */
  const viewModel = shell.indexOf("/quant/app/view-model.js");
  assert.ok(viewModel > faelle, "view-model.js muss nach den Engines geladen werden");
});

test("Der einfache Screener behauptet keine Kriterien, die es nicht gibt", () => {
  /* Der Screener führt keine Felder für Grösse und Region. Eine Marke, die
     nichts filtert, wäre eine Lüge in Gestalt eines Knopfes.

     Frontend-Rebuild: die Kriterien-Knoepfe (EINFACHE_KRITERIEN) sind durch
     Fragen ersetzt (quant/app/pages.js QUESTIONS). Es gibt keinen Knopf fuer
     Groesse oder Region mehr, deshalb auch keinen Satz, der ihn als
     "noch kein Kriterium" entschuldigt - stattdessen wird geprueft, dass
     JEDE Frage auf einer echten Datenquelle steht und keine eine Groesse-
     oder Regionsauswahl verspricht. */
  const Workspace = require(join(ROOT, "quant/api/screener-workspace.js"));
  const felder = new Set(Workspace.methodologies.flatMap((m) => m.fields.map((f) => f.id)));
  const fragen = QXPages.QUESTIONS;
  assert.ok(fragen.length > 0);
  for (const q of fragen) {
    const quellen = (q.factors ? 1 : 0) + (q.setups ? 1 : 0) + (q.high ? 1 : 0);
    assert.equal(quellen, 1, "Frage " + q.id + " hat keine (oder mehrere) Datenquellen");
    for (const id of q.factors || []) {
      assert.ok(felder.has("quantV2.factorEvidence." + id), "Kriterium " + id + " hat kein Screener-Feld");
    }
    const text = q.title + " " + q.hint + " " + q.sentence;
    assert.ok(!/Größe|Grösse|Region|Marktkapitalisierung|Land\b/.test(text),
      "Frage " + q.id + " verspricht ein Kriterium, das es nicht gibt: " + text);
  }
  /* Die Faktor-Fragen filtern wirklich auf genau diese Felder. */
  const faktor = abschnitt(pagesSrc, "async function factorHits(", "async function setupHits(");
  /* Konzept-Design: der Screener hat einen Wertebereich (min/max). Die
     Fragen setzen ihn auf SIMPLE_THRESHOLD..100 - "stark" bleibt dieselbe
     Schwelle, gefiltert wird weiterhin auf genau diese Felder. */
  assert.match(faktor, /factors\.map\(function \(id\) \{ return \{ field: FIELD\(id\), operator: "gte", value: min/);
  const einfach = abschnitt(pagesSrc, "async function screener(", "async function factorHits(");
  assert.match(einfach, /sel\.min = SIMPLE_THRESHOLD; sel\.max = 100;/, "eine Frage setzt die Schwelle nicht auf SIMPLE_THRESHOLD");
  /* Keine Marke fuer ein Kriterium, das es nicht gibt - auch nicht als Faktor-Chip. */
  assert.ok(!/label: "(Größe|Grösse|Region|Marktkapitalisierung)"/.test(einfach + pagesSrc.slice(pagesSrc.indexOf("FILTER_CHIPS"), pagesSrc.indexOf("FILTER_CHIPS") + 1500)),
    "der Screener zeigt eine Marke fuer ein Kriterium, das es nicht gibt");
  assert.match(pagesSrc, /var FIELD = function \(id\) \{ return "quantV2\.factorEvidence\." \+ id; \}/);
});

test("Strategien zeigen keine erfundene Trefferquote", () => {
  /* Frontend-Rebuild: strategieKarte/strategyPage sind ersetzt durch
     strategies()/strategyDetail() in quant/app/pages.js und
     strategySection() in quant/app/page-stock.js. */
  const uebersicht = abschnitt(pagesSrc, "async function strategies(", "async function strategyDetail(");
  const detail = abschnitt(pagesSrc, "async function strategyDetail(", "/* ============================================================== AKTIEN");
  const aufAktie = abschnitt(stockSrc, "function strategySection(", "function replaySection(");
  assert.ok(/keine Erfolgs- oder Trefferquote/i.test(uebersicht),
    "die Strategie-Uebersicht muss ausdrücklich von einer Trefferquote abgegrenzt sein");
  assert.ok(/keine Erfolgs- oder Trefferquote/i.test(detail),
    "die Strategie-Seite muss ausdrücklich von einer Trefferquote abgegrenzt sein");
  assert.ok(/keine Trefferquote/i.test(aufAktie),
    "der Strategy Match auf der Aktienseite muss ausdrücklich von einer Trefferquote abgegrenzt sein");
  for (const [name, teil] of [["strategies", uebersicht], ["strategyDetail", detail], ["strategySection", aufAktie]]) {
    assert.ok(!/Trefferquote:\s*"/.test(teil) && !/Trefferquote:\s*'/.test(teil), name + ": keine Trefferquote als Wert");
    assert.ok(!/Erfolgsquote:\s*["']|hitRate|winRate/.test(teil), name + ": keine Erfolgsquote als Wert");
  }
});

test("Die Aktienseite sagt, warum es keine Gesamtnote gibt", () => {
  /* Der Entwurf zeigte an dieser Stelle "Quant Score 91/100". Den gibt es
     nicht - nicht weil er fehlt, sondern weil er abgelehnt ist. Ein Leser,
     der die grosse Zahl sucht, verdient den Grund dort, wo er sie sucht.

     Frontend-Rebuild: die Stelle, an der die grosse Zahl gesucht wird, ist
     die "Quant-Einordnung" (verdictCard in quant/app/page-stock.js). */
  const karte = abschnitt(stockSrc, "function verdictCard(", "function setupSection(");
  assert.ok(/Eine Gesamtnote gibt es bewusst nicht|Es gibt bewusst keine Gesamtnote/.test(karte),
    "die Absage an die Gesamtnote fehlt auf der Aktienseite");
  assert.ok(/Zielkonflikt/.test(karte), "der Grund muss dabeistehen, nicht nur die Absage");
  /* Das View Model bildet keine Gesamtzahl: die Einordnung ist eine
     Zaehlung, keine Punktzahl. */
  const f = (id, score) => ({ id, state: "AVAILABLE", score, band: VM.band(score) });
  const o = VM.overall([f("quality", 95), f("growth", 80), f("momentum", 50), f("value", 20)]);
  for (const k of Object.keys(o)) assert.ok(!/score|note|gesamt/i.test(k), "Gesamtwert im View Model: " + k);
  /* Und sie darf nicht doch irgendwo in der Oberflaeche auftauchen. Geprueft
     wird der Code OHNE Kommentare - der Satz, der die Absage begruendet,
     nennt den abgelehnten Namen naturgemaess selbst, und daran darf diese
     Pruefung nicht scheitern. */
  for (const datei of ["ui.js", "pages.js", "page-stock.js", "page-tools.js", "page-method.js", "app.js", "view-model.js", "chart.js"]) {
    assert.ok(!/Quant Score/.test(ohneKommentare(src("quant/app/" + datei))),
      "'Quant Score' als Gesamtnote darf nicht in der Oberflaeche stehen (" + datei + ")");
  }
  assert.ok(!/Quant Score/.test(shell), "'Quant Score' im Shell");
});

test("Der Einstieg einer Setup-Regel landet nicht in einer zugeklappten Flaeche", () => {
  /* Von der Startseite fuehrt "Bestaetigte Setups" in den Screener, um
     genau dieses Ergebnis zu sehen. Eine mechanische Ersetzung hatte die
     Zeile in den Profi-Aufklapper mitgenommen.

     Frontend-Rebuild: der Einstieg ist #/screener?frage=setups; das Ergebnis
     steht im einfachen Screener direkt auf der Seite (main), nicht in einem
     Aufklapper (X.more). */
  const home = abschnitt(pagesSrc, "async function home(", "/* ============================================================ SCREENER");
  assert.match(home, /X\.routes\.screener\("frage=setups"\)/, "die Startseite fuehrt nicht zu den Setups");
  assert.ok(QXPages.QUESTIONS.some((q) => q.id === "setups" && q.setups), "die Frage nach Setups fehlt");
  assert.equal(routing.parse(QX.routes.screener("frage=setups")).view, "screener");
  assert.equal(routing.parse(QX.routes.screener("frage=setups")).pro, false, "Setups landen im Profi-Modus");
  const einfach = abschnitt(pagesSrc, "async function screener(", "async function factorHits(");
  assert.match(einfach, /params\.get\("frage"\)/, "die Frage aus der Adresse wird nicht gelesen");
  assert.match(einfach, /main\.append\([^;]*\blist, panel, sentence, results\)/, "das Ergebnis gehoert auf die Seite, nicht in den Aufklapper");
  assert.ok(!/X\.more\(/.test(einfach), "im einfachen Screener liegt das Ergebnis in einem Aufklapper");
});

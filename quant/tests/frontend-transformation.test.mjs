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
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const HistoricalCases = require(join(ROOT, "quant/engines/historical-cases.js"));
const PatternResearch = require(join(ROOT, "quant/engines/pattern-research.js"));
const experience = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
const shell = readFileSync(join(ROOT, "vu2/index.html"), "utf8");

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
test("Die Quant-Navigation führt genau die fünf Bereiche", () => {
  const match = experience.match(/const nav=(\[\[.*?\]\]);/);
  assert.ok(match, "nav-Liste nicht gefunden");
  const ids = [...match[1].matchAll(/\['([a-z]+)','([^']+)'\]/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(ids, [
    ["home", "Home"], ["screener", "Screener"], ["strategies", "Strategien"],
    ["stocks", "Aktien"], ["explain", "Methodik"]
  ]);
});

test("Kein fremdes Produkt steht in der Quant-Navigation", () => {
  const match = experience.match(/const nav=(\[\[.*?\]\]);/)[1];
  /* Discover, Research und Markets sind andere Produkte, Portfolio ist
     ausdrücklich nicht Teil dieser Transformation. Sie standen alle vier
     in der alten Leiste. */
  for (const fremd of ["discover", "research", "markets", "portfolio"]) {
    assert.ok(!match.includes("'" + fremd + "'"), fremd + " gehört nicht in die Quant-Navigation");
  }
});

test("Die Navigationsänderung hat keine Ansicht entfernt", () => {
  /* GEMESSEN: als die Liste der gültigen Ansichten aus `nav` abgeleitet
     wurde, lieferten /vu2/?view=portfolio, =discover, =markets und
     =research nach dem Navigationsumbau "Diese Ansicht wurde nicht
     gefunden". Eine Leiste zu kürzen hatte Funktionen abgeschaltet. */
  const match = experience.match(/const GUELTIGE_ANSICHTEN=new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, "Ansichtsliste nicht gefunden");
  const views = [...match[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  for (const bestand of ["home", "screener", "strategies", "stocks", "explain", "stock",
    "technical", "elliott", "quant", "fundamentals", "compare", "watchlist", "signals",
    "radar", "atlas", "portfolio", "markets", "discover", "research"]) {
    assert.ok(views.includes(bestand), "Ansicht " + bestand + " ist nicht mehr erreichbar");
  }
  assert.ok(!/GUELTIGE_ANSICHTEN=new Set\(\[\.\.\.nav/.test(experience),
    "die Ansichtsliste darf nicht wieder aus der Navigation abgeleitet werden");
});

/* ---------------------------------------------------------------- 2 */
test("Die Vergleichsfall-Engine rechnet mit der Studien-Engine, nicht mit einer zweiten", () => {
  assert.equal(HistoricalCases.VERSION, "historical-cases-1.0.0");
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
  const nvda = assess("NVDA");
  assert.equal(nvda.state, "AVAILABLE");
  assert.ok(nvda.episodes < HistoricalCases.MIN_EPISODES, "NVDA soll unter der Schwelle liegen");
  for (const h of Object.values(nvda.horizons)) {
    if (h.sufficient) continue;
    assert.equal(h.medianReturn, null, "unter der Schwelle darf kein Median im Objekt stehen");
    assert.equal(h.positive, null);
    assert.equal(h.medianDrawdown, null);
    assert.equal(h.lastCaseDate, null, "ohne Verteilung auch kein Einzelfall");
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
test("Die Fläche verspricht keine Zukunft", () => {
  /* Prognosesprache in der Primärkopie der neuen Bereiche. Die Suche läuft
     über den Abschnitt der Vergleichsfälle, wo die Versuchung am grössten
     ist. */
  const von = experience.indexOf("function historischeFaelleSection");
  const bis = experience.indexOf("const BEDINGUNG_KLARTEXT");
  assert.ok(von > 0 && bis > von);
  const abschnitt = experience.slice(von, bis);
  for (const verboten of ["wird wahrscheinlich", "dürfte steigen", "Prognose:", "Kursziel"]) {
    assert.ok(!abschnitt.includes(verboten), "Prognosesprache gefunden: " + verboten);
  }
  assert.ok(abschnitt.includes("Was geschah danach?"), "die Frage über die Vergangenheit muss dastehen");
});

test("Die Engine ist im Shell geladen, und zwar nach der Studie", () => {
  const studie = shell.indexOf("pattern-research.js");
  const faelle = shell.indexOf("historical-cases.js");
  assert.ok(faelle > 0, "historical-cases.js fehlt im Shell");
  assert.ok(studie > 0 && studie < faelle,
    "historical-cases liest VUPatternResearch beim Laden und muss danach kommen");
});

test("Der einfache Screener behauptet keine Kriterien, die es nicht gibt", () => {
  /* Der Screener führt keine Felder für Grösse und Region. Eine Marke, die
     nichts filtert, wäre eine Lüge in Gestalt eines Knopfes. */
  const von = experience.indexOf("const EINFACHE_KRITERIEN=");
  const bis = experience.indexOf("async function screenPage");
  const abschnitt = experience.slice(von, bis);
  assert.ok(abschnitt.includes("Größe und Region sind noch keine Kriterien"),
    "die fehlenden Kriterien müssen benannt sein");
  const Workspace = require(join(ROOT, "quant/api/screener-workspace.js"));
  const felder = new Set(Workspace.methodologies.flatMap((m) => m.fields.map((f) => f.id)));
  for (const m of abschnitt.matchAll(/\['([a-z]+)','([^']+)'/g)) {
    assert.ok(felder.has("quantV2.factorEvidence." + m[1]),
      "Kriterium " + m[1] + " hat kein Screener-Feld");
  }
});

test("Strategien zeigen keine erfundene Trefferquote", () => {
  const von = experience.indexOf("function strategieKarte");
  const bis = experience.indexOf("async function strategyPage");
  const abschnitt = experience.slice(von, bis);
  assert.ok(abschnitt.includes("KEINE Erfolgs- oder Trefferquote"),
    "die Beständigkeit muss ausdrücklich von einer Trefferquote abgegrenzt sein");
  assert.ok(!/Trefferquote:\s*'/.test(abschnitt), "keine Trefferquote als Wert");
});

/* Aktienseite: Aussage -> Beweis -> Tiefe (Owner-Auftrag "Progressive
   Disclosure", 07.10.2026).

   Gemessen bei 390 px vor dem Umbau (NVDA, scripts/quant/measure-stock-ux.mjs):
   2.133 gerenderte Woerter, 40 Karten, 24 Fachbegriffe, die Setup-Marken
   erst nach 314 Woertern, Signal gegen Markt erst nach 719 Woertern und
   4.851 px. Die Seite zeigte Ebene 1, 2 und 3 gleichzeitig.

   Diese Vertraege halten fest, was an die Stelle getreten ist - an der
   Quelle und am Verhalten der Bausteine, nicht am heutigen Datenstand:

     1 Aussage vor Methodik
     2 ein Signal steht immer mit dem Markt daneben
     3 die Vertrauens-Pruefliste ist standardmaessig zu
     4 Faktoren: die erste Ebene ist eine Zeile, kein Absatz
     5 die Setup-Marken stehen auf der ersten Ebene (Antwort oben)
     6 keine Rohcodes, keine nackten Trefferquoten
     7 keine erfundene Gesamtnote
     8 keine versteckten Datenlimits
     9 jede Tiefe einen Tipp entfernt
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const VMODEL = require("../app/view-model.js");

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const stock = read("quant/app/page-stock.js");
const evidenceSrc = read("quant/app/page-evidence.js");
const css = read("quant/app/app.css");
const slice = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, "fehlt: " + a); const j = src.indexOf(b, i + a.length); return src.slice(i, j > i ? j : undefined); };
const render = slice(stock, "async function render(", "global.QXStock");

/* Kleine DOM-Attrappe (wie evidence-experience.test.mjs). */
function node(tag, attrs, kids) {
  const n = { tag, attrs: attrs || {}, children: [], listeners: {}, _text: (attrs && attrs.text) || "" };
  n.addEventListener = (k, f) => { n.listeners[k] = f; };
  Object.defineProperty(n, "textContent", { get: () => n._text, set: (v) => { n._text = v; } });
  [].concat(kids || []).forEach((k) => { if (k != null && k !== false) n.children.push(k); });
  return n;
}
const text = (n) => (n == null ? "" : typeof n === "string" ? n : [n._text, ...n.children.map(text)].join(" ")).replace(/\s+/g, " ").trim();
const all = (n, pred, out = []) => { if (n && typeof n === "object") { if (pred(n)) out.push(n); n.children.forEach((c) => all(c, pred, out)); } return out; };
const cls = (n) => String(n.attrs.class || "");
const sandbox = { QX: { el: node, dateDe: (d) => d }, localStorage: { getItem: () => null, setItem: () => {} }, VUQuantViewModel: VMODEL };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(evidenceSrc.replace(/\}\)\(typeof window !== "undefined" \? window : globalThis\);\s*$/, "})(globalThis);"), sandbox);
const E = sandbox.QXEvidence;
const study = (over) => ({ state: "AVAILABLE", trust: "LIMITED", n: 56493, effectiveN: 11047, positiveShare: 0.583, basePositiveShare: 0.569,
  deltaPositiveShare: 0.014, deltaCi: [0.004, 0.024], edgeOutOfSample: false, median: 0.04, typicalDrawdown: -0.16, returnType: "TOTAL_RETURN",
  openChecks: ["oos", "survivorship"], checkedIds: ["benchmark", "independence", "lookahead", "oos", "returnBasis", "sample", "survivorship"], ...over });
const stockEvidence = (over) => E.signalEvidence(study(over), { stock: true, label: "„Neues 52-Wochen-Hoch“ am 06.10.2026" });

test("1 Aussage vor Methodik: die Seite beginnt mit drei Antworten, dann Setup, Evidenz, Faktoren, Mehr", () => {
  const chartAt = render.indexOf("layout.append(chart.node);");
  const answersAt = render.indexOf("layout.append(verdictCard(vm, nowHost, [setupAnswerHost, evidenceAnswerHost,");
  assert.ok(chartAt > 0 && answersAt > chartAt, "die drei Antworten stehen nicht direkt hinter dem Chart");
  const order = ['"setup"))', '"historie"))', '"einordnung"))', '"mehr"))'].map((m) => render.indexOf(m));
  assert.ok(order.every((at, i) => at > answersAt && (i === 0 || at > order[i - 1])), "Reihenfolge Setup, Evidenz, Faktoren, Mehr verletzt: " + order.join(","));
  /* Methodik liegt in jedem Kapitel einen Tipp tiefer. */
  const setupCard = slice(stock, "function renderSetupCard(", "/* \"Was ist jetzt wichtig?\"");
  assert.match(setupCard, /drill\("Wie wird das berechnet\?", how\)/, "Setup-Methodik nicht hinter einem Tipp");
  const up = slice(setupCard, "kids.push(priceStrip(", "host.replaceChildren(el(\"div\", { class: \"q-setup\" }, kids));\n  }");
  assert.ok(up.indexOf("q-rr") < up.indexOf("q-setup-answers") && up.indexOf("q-setup-answers") < up.indexOf("q-missing") && up.indexOf("q-missing") < up.indexOf("q-drills"),
    "Setup: Strecke, Chance/Risiko, Antworten, was fehlt, dann die Drilldowns");
  const card = slice(stock, "function factorCard(", "function conditions(");
  assert.ok(card.indexOf("X.pill(") < card.indexOf('X.more("Rohdaten und Berechnung"'), "Faktor: Rohdaten vor der Aussage");
});

test("2 ein Signal steht immer mit dem Markt daneben - als Balken, mit Differenz und Einordnung", () => {
  const n = stockEvidence();
  const bars = all(n, (x) => /(^| )q-ev-bar( |$)/.test(cls(x)));
  assert.equal(bars.length, 2, "Signal und Markt als zwei Balken");
  assert.match(text(bars[1]), /^Markt 56,9 %$/);
  const verdict = text(all(n, (x) => cls(x) === "q-ev-verdict")[0]);
  assert.equal(verdict, "Kleiner historischer Vorteil +1,4 Pp gegenüber dem Markt");
  /* Die Kennzahlen stehen als Zahl mit Wort, nicht als Satz. */
  const kpis = all(n, (x) => cls(x) === "q-ev-kpis")[0];
  assert.deepEqual(kpis.children.map(text), ["56.493 Fälle", "+4 % typisches Ergebnis", "−16 % typ. Rückgang zwischendurch"]);
  /* Auch oben auf der Seite: die Antwortkarte zeigt Signal UND Markt. */
  const answer = slice(stock, "function evidenceAnswer(", "function verdictCard(");
  assert.match(answer, /class: "is-signal"[\s\S]{0,400}class: "is-base"/, "die Antwortkarte zeigt das Signal ohne den Markt");
});

test("3 Vertrauen: die Stufe steht offen da, die Pruefliste ist zu", () => {
  const n = stockEvidence();
  assert.match(text(all(n, (x) => /q-ev-trustline/.test(cls(x)))[0]), /^Vertrauen eingeschränkt /);
  const drills = all(n, (x) => /q-drills/.test(cls(x)))[0].children;
  assert.equal(drills.length, 4, "hoechstens vier Drilldowns");
  assert.ok(drills.every((d) => d.tag === "details"));
  assert.deepEqual(drills.map((d) => text(d.children[0])), ["Warum eingeschränkt?", "Wie viele Fälle?", "Wie groß war das Risiko?", "Wie wurde getestet?"]);
  assert.ok(drills.every((d) => !d.attrs.open), "ein Drilldown ist von Anfang an offen");
  const checklist = all(n, (x) => cls(x) === "q-ev-trust")[0];
  assert.ok(checklist && all(drills[0], (x) => x === checklist).length === 1, "die Pruefliste steht nicht im Drilldown 'Warum ...?'");
  /* Fachbegriffe stehen erst in der Tiefe. */
  const top = text({ children: n.children.filter((c) => !/q-drills/.test(cls(c))), _text: "" });
  for (const term of ["Out-of-Sample", "Walk-Forward", "Survivorship", "Look-Ahead", "Point-in-Time", "Base Rate"]) assert.ok(!top.includes(term), term + " in der ersten Ebene");
});

test("4 Faktoren: die erste Ebene ist eine Zeile - Name, Wert, Balken, Stufe, Position; kein Absatz", () => {
  const card = slice(stock, "function factorCard(", "function conditions(");
  const summary = slice(card, 'd.append(el("summary"', "var body =");
  for (const prose of ["f.why", "f.missingText", "f.measures", "f.reference"]) assert.ok(!summary.includes(prose), prose + " steht in der ersten Ebene");
  for (const part of ["q-frow-name", "q-frow-score", "q-frow-bar", "X.pill(f.word || f.label", "positionWord"]) assert.ok(summary.includes(part) || card.includes(part), part + " fehlt");
  /* Wert und Stufe getrennt (factor-band-2.0.0): die Stufe kommt aus der
     Position, die Position steht als eigene Angabe daneben. */
  assert.match(stock, /function positionWord\(f\)[\s\S]*?f\.rank\.share/);
  /* Ebene 2: Warum (+/-) aus den staerksten und schwaechsten Kennzahlen. */
  assert.match(card, /f\.drivers\.up[\s\S]*f\.drivers\.down/);
  /* Die Faktorzeilen stehen in der Reihenfolge des Kanons, nicht nach Wert sortiert. */
  assert.match(render, /vm\.factors\.map\(function \(f\) \{ return factorCard\(f, ticker,/);
  assert.ok(!/\.sort\(function \(a, b\) \{ return b\.score - a\.score/.test(render), "Faktoren nach Wert sortiert");
});

test("4b Position: Top-Angabe und 'hoeher als' folgen der gezaehlten Position", () => {
  const run = new Function("f", slice(stock, "function positionWord(f) {", "function driverLine(").replace(/^function positionWord\(f\) \{/, "").replace(/\}\s*$/, ""));
  assert.equal(run({ rank: { share: 0.98 } }), "Top 2 %");
  assert.equal(run({ rank: { share: 0.999 } }), "Top 1 %");
  assert.equal(run({ rank: { share: 0.5 } }), "Top 50 %");
  assert.equal(run({ rank: { share: 0.27 } }), "höher als 27 %");
  assert.equal(run({ rank: null }), null);
});

test("5 Setup: Zustand und Marken stehen in der Antwort oben, ohne erst ins Kapitel zu scrollen", () => {
  const answer = slice(stock, "function setupAnswer(", "function priceStrip(");
  for (const w of ['"Interessant"', '"Ungültig"', '"Ziel 1"', "answerTitle(F.status)", '"Bestätigung: "']) assert.ok(answer.includes(w), w + " fehlt in der Setup-Antwort");
  /* Eine Ableitung fuer Antwort und Karte, nicht zwei. */
  assert.match(answer, /var F = setupFacts\(vm, ws\)/);
  assert.match(slice(stock, "function renderSetupCard(", "/* \"Was ist jetzt wichtig?\""), /var F = setupFacts\(vm, ws\)/);
  /* Die Karte zeigt hoechstens vier Antworten. */
  const card = slice(stock, "function renderSetupCard(", "/* \"Was ist jetzt wichtig?\"");
  const rows = slice(card, '} else {\n      kids.push(priceStrip(', "/* Was fehlt zur naechsten Stufe");
  assert.equal((rows.match(/answerRow\(/g) || []).length, 4);
});

test("5b Die Bestaetigungsregel in Alltagssprache - nur Wortwahl, der Wortlaut bleibt erreichbar", () => {
  const engine = read("quant/engines/technical/scenario-engine.js");
  const map = slice(stock, "var TRIGGER_PLAIN = {", "};");
  /* Jeder uebersetzte Satz ist ein Satz, den die Engine wirklich schreibt. */
  for (const m of map.matchAll(/^\s*"([^"]+)": \[/gm)) assert.ok(engine.includes(m[1]), "kein Satz der Szenario-Engine: " + m[1]);
  assert.match(slice(stock, "function renderSetupCard(", "/* \"Was ist jetzt wichtig?\""), /Bestätigungsregel des Szenarios im Wortlaut: „" \+ sc\.confirmation/);
});

test("6 keine Rohcodes und keine nackten Trefferquoten in der Evidenz der Aktienseite", () => {
  for (const trust of ["LIMITED", "NOT_READY", "USABLE", "ROBUST"]) {
    const t = text(stockEvidence({ trust }));
    assert.ok(!/\b[A-Z]{3,}_[A-Z_]{2,}\b|undefined|NaN/.test(t), trust + ": " + t);
    assert.match(t, /Markt/);
  }
  const t = text(stockEvidence({ deltaPositiveShare: -0.03, deltaCi: [-0.05, -0.01], positiveShare: 0.539 }));
  assert.match(t, /Historisch schwächer als der Markt −3,0 Pp gegenüber dem Markt/);
});

test("7 keine erfundene Gesamtnote", () => {
  assert.match(render, /Eine Gesamtnote gibt es bewusst nicht/);
  assert.ok(!/reduce\(function \(a, f\)[\s\S]{0,80}f\.score/.test(stock), "die Seite rechnet aus Faktorwerten einen Gesamtwert");
  assert.ok(!/Gesamtnote:|Gesamtscore|Quant-Score/.test(stock.replace(/Eine Gesamtnote gibt es bewusst nicht/g, "")));
});

test("8 keine versteckten Datenlimits", () => {
  /* Ein Faktor ohne Werte im ganzen Markt bleibt als Zeile stehen und
     wird unter "Daten und Grenzen" genannt - gezaehlt, nicht benannt. */
  assert.match(render, /var marketEmpty = vm\.factors\.filter\(function \(f\) \{ return f\.state !== "AVAILABLE" && dist && Array\.isArray\(dist\[f\.id\]\) && dist\[f\.id\]\.length === 0; \}\)/);
  assert.match(render, /marketEmpty\.forEach\(function \(f\) \{ gapNodes\.push/);
  assert.ok(!/id === "revisions"|"Erwartungstrend/.test(stock), "der heute leere Faktor steht als Name im Code");
  /* Fehlt einer Aktie Wesentliches, stehen die Grenzen offen - nicht im Aufklapper. */
  assert.match(render, /var thin = !hasFactors \|\| \(shape\.shape && shape\.shape !== "FULL"\);/);
  assert.match(render, /if \(!thin\) folds\.push\(fold\("grenzen"[\s\S]{0,400}else bodyHost\.append\(limits\);/);
  /* Was noch nicht getestet ist, steht im Kopf des Aufklappers. */
  assert.match(stock, /X\.more\("Noch ohne Test: " \+ closed\.map/);
  /* Die Zeile "Mehr" sagt, wie viele Luecken darin benannt sind. */
  assert.match(render, /gapNodes\.length \+ " Lücke"/);
});

test("9 jede Tiefe einen Tipp entfernt: Mehr ist eine Liste aus Aufklappern, die Abschnitte entstehen sofort", () => {
  const more = slice(render, "function fold(", "var links =");
  assert.match(more, /el\("details", \{ class: "q-fold", id: "mehr-" \+ id \}/);
  for (const id of ["dafuer", "radar", "veraenderung", "strategie", "technik", "zahlen", "news"]) assert.ok(more.includes('fold("' + id + '"'), "Mehr ohne " + id);
  /* Ein Sprung auf ein Ziel in einem zugeklappten Bereich klappt ihn auf. */
  assert.match(read("quant/app/app.js"), /closest\("details"\)[\s\S]{0,160}up\.open = true/);
  /* Die Abschnitts-Ueberschrift steht im Kopf der Zeile, nicht zweimal. */
  assert.match(css, /\.q-fold>\.qx-section>\.q-sec-head>h2\{display:none\}/);
});

test("Tabs: Jetzt, Setup, Evidenz, Faktoren, Mehr", () => {
  assert.match(render, /\[\["einordnung-kurz", "Jetzt"\], \["setup", "Setup"\], \["historie", "Evidenz"\], \["einordnung", hasFactors && o\.rated > 0 \? "Faktoren" : null\], \["mehr", "Mehr"\]\]/);
});

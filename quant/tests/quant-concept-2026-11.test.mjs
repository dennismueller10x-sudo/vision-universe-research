/* Konzept Quant „Ein Profil je Aktie“ (docs/design/quant-2026-11/HANDOVER.md): Oberflächen-Verträge, die ohne Browser prüfbar sind. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
const APP = readdirSync("quant/app").filter((f) => f.endsWith(".js")).map((f) => "quant/app/" + f);

/* Natives append/replaceChildren schreibt null als Text „null“ (Screener-Treffer, Vergleich, 08.11.2026). Jede Liste mit
   möglichen Lücken geht über QX.fill / QX.add, die null überspringen. Geprüft: Argumente auf oberster Ebene mit „… : null“. */
function nullArgs(src) {
  const out = [], re = /\.(append|replaceChildren|prepend|after|before)\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1, str = null, top = "";
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (str) { if (c === "\\") { i++; continue; } if (c === str) str = null; continue; }
      if (c === '"' || c === "'" || c === "`") { str = c; continue; }
      if ("([{".includes(c)) depth++; else if (")]}".includes(c)) depth--;
      if (depth === 1) top += c;
    }
    if (/:\s*null\s*(,|$)/.test(top.trim())) out.push(src.slice(0, m.index).split("\n").length);
  }
  return out;
}

test("Entscheidung 9: kein „null“ als Text – append/replaceChildren bekommen keine null-Kinder", () => {
  const hits = APP.flatMap((f) => nullArgs(read(f)).map((l) => f + ":" + l));
  assert.deepEqual(hits, [], "QX.fill(host, …) bzw. QX.add(host, …) statt host.replaceChildren(…, x ? y : null)");
  assert.equal(nullArgs("a.append(x, y ? z : null)").length, 1, "die Prüfung erkennt den Fall");
});

function loadQX() {
  const g = { QuantShell: { el: () => null } };
  new Function("window", read("quant/app/ui.js"))(g);
  return g.QX;
}

test("QX.fill/QX.add überspringen null, false und leere Texte", () => {
  const X = loadQX(), got = [];
  X.fill({ replaceChildren: (...k) => got.push(k) }, "a", null, false, "", "b");
  X.add({ append: (...k) => got.push(k) }, null, "c");
  assert.deepEqual(got, [["a", "b"], ["c"]]);
});

test("Entscheidung 5: QX.say übersetzt Ziel-Begriffe aus den Daten, ohne die Aussage zu ändern", () => {
  const X = loadQX();
  assert.equal(X.say("Ähnliche Lagen erreichten Zielzone 1 in 33 % der Fälle"), "Ähnliche Lagen erreichten Marke 1 der Methode in 33 % der Fälle");
  assert.equal(X.say("Erste Zielzone der technischen Auswertung erreicht (Tageshoch)"), "Erste Marke der Methode der technischen Auswertung erreicht (Tageshoch)");
  assert.equal(X.say("Stop-Loss unter der Einstiegszone"), "Ungültig-Marke laut Methode unter der Zone laut Methode");
  assert.equal(X.say(null), null);
  assert.equal(X.say("Kurs 12,5 %"), "Kurs 12,5 %");
});

test("Entscheidung 7: Aktienkopf in Dollar, Euro klein daneben (gleicher Wert wie in Discover)", () => {
  const stock = read("quant/app/page-stock.js");
  assert.match(stock, /function withEuro\(usd, shown\)/);
  assert.doesNotMatch(stock, /headApi\.setPrice\(CS\.displayHead\(/, "der Kopf zeigt nicht den umgerechneten Kurs als Hauptwert");
  const nav = read("assets/stock-navigator.js");
  assert.match(nav, /vu-shead-alt/);
});

test("Entscheidung 10: kein Rot in den Quant-Stilen", () => {
  for (const f of ["quant/app/app.css", "quant/app/stock.css", "quant/app/chartbild.css"]) assert.doesNotMatch(read(f), /255,\s*107,\s*94|#ff6b5e|#b3261a|#9c1f14/i, f);
});

/* ---------------------------------------------------------------- PR 2 · Profil-Baustein (Entscheidungen 1 und 2) */
import { createRequire } from "node:module";
const requireC = createRequire(import.meta.url);
const UI = requireC("../../assets/vu-ui.js");
const VMq = requireC("../app/view-model.js");

test("Profil: sieben Eigenschaften, ein Wort je Eigenschaft, gleich in VUUI und View-Model", () => {
  const P = UI.PROFILE;
  assert.deepEqual(P.keys, ["profitability", "growth", "quality", "momentum", "value", "risk", "revisions"]);
  assert.deepEqual(P.keys.map((k) => P.label[k]), ["Verdient gut", "Ist gewachsen", "Gewinn gedeckt & stabil", "Kurs lief gut", "Preis im Branchenvergleich", "Ruhig für die Branche", "Analysten"]);
  assert.deepEqual(VMq.PROFILE_ORDER, P.keys, "Anzeige-Reihenfolge im View-Model = Profil");
  for (const k of P.keys) assert.equal(VMq.FACTORS[k].name, P.label[k], "VM-Name " + k);
});

test("Profil: Stufen-Grenzen Sehr schwach < 25 ≤ Schwach < 45 ≤ Mittel < 75 ≤ Stark < 90 ≤ Sehr stark", () => {
  const s = UI.PROFILE.stage;
  assert.deepEqual([0, 24.9, 25, 44.9, 45, 74.9, 75, 89.9, 90, 100].map(s),
    ["Sehr schwach", "Sehr schwach", "Schwach", "Schwach", "Mittel", "Mittel", "Stark", "Stark", "Sehr stark", "Sehr stark"]);
  assert.equal(s(null), "Keine Daten"); assert.equal(s(undefined), "Keine Daten"); assert.equal(s(NaN), "Keine Daten");
  assert.deepEqual(UI.PROFILE.marks, [25, 45, 75, 90]);
  assert.equal(UI.PROFILE.strong(74.9), false); assert.equal(UI.PROFILE.strong(75), true);
});

test("Profil klein: sechs Säulen ohne Analysten, stark neongrün, fehlend gestrichelt, Werte im Screenreader-Text", () => {
  const svg = UI.profileMini({ profitability: 99, growth: 86, quality: 43, momentum: 62, value: null, risk: 84, revisions: null });
  assert.equal((svg.match(/<rect/g) || []).length, 6);
  assert.equal((svg.match(/class="is-hi"/g) || []).length, 3, "99, 86, 84 sind stark");
  assert.equal((svg.match(/class="is-na"/g) || []).length, 1, "Preis im Branchenvergleich fehlt");
  assert.match(svg, /aria-label="Profil: Verdient gut 99, Ist gewachsen 86, Gewinn gedeckt &amp; stabil 43, Kurs lief gut 62, Preis im Branchenvergleich keine Daten, Ruhig für die Branche 84"/);
  assert.doesNotMatch(svg, /Analysten/);
});

test("Profil groß: sieben Zeilen mit Zahl und Stufe, fehlend „–“ mit „Keine Daten“ und Grund; keine Gesamtnote", () => {
  const html = UI.profileFull({ profitability: 99, growth: 86, quality: 43, momentum: 62, value: 59, risk: 84, revisions: null }, { why: { revisions: "Keine lizenzierte Quelle" } });
  assert.equal((html.match(/class="vu-pf-r/g) || []).length, 7);
  assert.match(html, /Verdient gut<\/span>.*?<b class="vu-num">99<\/b><span class="vu-pf-s">Sehr stark/);
  assert.match(html, /data-key="revisions"/); assert.match(html, /is-na" role="listitem" title="Keine lizenzierte Quelle"/);
  assert.match(html, /<b class="vu-num">–<\/b><span class="vu-pf-s">Keine Daten/);
  assert.equal((html.match(/<em style="left:(25|45|75|90)%"><\/em>/g) || []).length, 28, "vier Stufen-Marken je Zeile");
  assert.doesNotMatch(html, /Gesamt|null|undefined|NaN/);
  assert.match(UI.profileLegend(), /Verdient gut.*Ist gewachsen.*Gewinn gedeckt &amp; stabil.*Kurs lief gut.*Preis im Branchenvergleich.*Ruhig für die Branche/);
});

test("Profil: Werte aus Screening-Zeile und Faktoren; kein „N von M Faktoren“ mehr", () => {
  assert.deepEqual(VMq.profileValues({ "quantV2.factorEvidence.growth": 12, "quantV2.factorEvidence.risk": null }),
    { quality: null, growth: 12, momentum: null, value: null, profitability: null, revisions: null, risk: null });
  assert.deepEqual(VMq.profileValues([{ id: "value", state: "AVAILABLE", score: 70 }, { id: "risk", state: "UNAVAILABLE", score: 5 }]).value, 70);
  const src = read("quant/app/view-model.js") + read("quant/app/pages.js") + read("quant/app/page-method.js");
  assert.doesNotMatch(src, /Faktoren stark"|Die sechs Fragen|Plus eine siebte/);
});

/* ---------------------------------------------------------------- PR 3 · Meldungen (Entscheidung 3) */
function loadApp() {
  const g = { document: { addEventListener() {} }, location: { hash: "", search: "", pathname: "/quant/" }, history: {}, addEventListener() {} };
  const src = read("quant/app/app.js"), i = src.indexOf("  /* Alte Namen → neue Namen"), j = src.indexOf("  function parse(hash) {");
  return new Function(src.slice(i, j) + "; return { renamed: renamed, RENAMED: RENAMED };")();
}
test("Weiterleitung: alte Radar-Adressen führen mit ihren Parametern zu #/meldungen", () => {
  const { renamed } = loadApp();
  assert.equal(renamed("#/radar"), "#/meldungen");
  assert.equal(renamed("#/radar?filter=setups"), "#/meldungen?filter=setups");
  assert.equal(renamed("#/radar?filter=strategien&beobachtet=1"), "#/meldungen?filter=stile&beobachtet=1");
  const app = read("quant/app/app.js");
  assert.match(app, /case "meldungen": r\.view = "radar"; break;/);
  assert.match(app, /case "radar": r\.view = "renamed"; break;/);
  assert.match(app, /if \(r\.view === "renamed"\) \{ global\.location\.replace\(renamed\(location\.hash\)\); return; \}/, "ohne Verlaufseintrag");
  assert.match(read("quant/app/ui.js"), /radar: function \(q\) \{ return "#\/meldungen"/, "alle Links zeigen auf die neue Adresse");
  assert.match(read("quant/ui/legacy-redirect.js"), /return APP \+ "#\/meldungen";/);
});

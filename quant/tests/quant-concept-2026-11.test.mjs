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

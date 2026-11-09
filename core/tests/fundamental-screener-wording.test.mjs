/* Konzept „Fundamental + Screener: Verstehen. Finden.“ (docs/design/fundamental-screener-2026-11/HANDOVER.md), PR 1.
   Wortwahl (docs/legal/WORTWAHL.md, assets/legal-notices.json → wording[].avoid) in Fundamental und Screener,
   Entscheidung 3 (keine Kursziele) und Entscheidung 5 (gleiche Wörter = gleiche Regel). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const legal = JSON.parse(readFileSync("assets/legal-notices.json", "utf8"));

/* Begriffe aus wording[].avoid: Klammern (Erläuterung) entfernt, an Komma und Schrägstrich getrennt.
   Ausgenommen sind Teile, die allein kein Begriff sind oder in Fachwörtern vorkommen; sie stehen hier mit Grund. */
const NOT_A_TERM = {
  "2": "Rest von „Ziel 1/2“",
  "Ziel 1": "nur zusammen mit „Ziel 2“ eine Handlungsmarke; „Ziel 1“ kommt in Fundamental und Screener nicht vor",
  Chance: "nur als „Chance/Risiko“ gemeint, eigener Begriff unten",
  Risiko: "Faktor „Risiko“ (Quant) ist ein Fachwort, nur „Chance/Risiko“ ist verboten",
  Signal: "MACD-Signallinie ist ein Fachwort; „Kaufsignal“, „Live-Signal“ bleiben verboten",
  sicher: "steckt in „unsicher“, „Sicherheit“; die Zusage „sicher“ prüft die Liste unten als Wendung",
  kaufen: "Einstufungen der Analysten (Angabe Dritter) heißen „Kaufen“; die Felder prüft screener/tests/engine.test.mjs",
  verkaufen: "wie „kaufen“"
};
const TERMS = [];
for (const w of legal.wording) for (const part of w.avoid.replace(/\([^)]*\)/g, "").split(/[,/]/)) {
  const t = part.replace(/[„“"]/g, "").trim();
  if (t && !(t in NOT_A_TERM)) TERMS.push(t);
}
/* Entscheidungen 3 und 5 des Konzepts */
TERMS.push("Chance/Risiko", "100 % sicher", "zu dir passen", "Warum passt", "Interessante Bewertung");

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "data" || f === "tests") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) ? [p] : [];
  });
}
/* Sichtbarer Text: Kommentare zählen nicht. Verneinungen („keine Empfehlung“, „keine Kaufempfehlung“) sind die geforderte Einordnung. */
function visible(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"\\])\/\/.*$/gm, "$1").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\bkeine?\s+(Anlage|Kauf|Handlungs)?empfehlung/gi, "");
}
const FILES = [...walk("fundamental"), ...walk("screener")];

test("Wortwahl: kein wording[].avoid-Begriff im sichtbaren Text von Fundamental und Screener", () => {
  assert.ok(TERMS.includes("Kaufempfehlung") && TERMS.includes("passt zu dir") && TERMS.includes("unterbewertet"), "Begriffe aus legal-notices.json gelesen");
  assert.ok(FILES.includes("fundamental/app.js") && FILES.includes("screener/app.js"));
  const hits = [];
  for (const f of FILES) {
    const src = visible(readFileSync(f, "utf8"));
    for (const t of TERMS) {
      const re = new RegExp("(^|[^\\p{L}])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}])", "giu");
      let m;
      /* „Kursziel (eigene Werte)“ ist verboten; das gesperrte Screener-Kriterium nennt ein Kursziel Dritter (Test unten). */
      if (t === "Kursziel" && f === "screener/engine/fields.js") continue;
      while ((m = re.exec(src))) hits.push(f + ": „" + t + "“ … " + src.slice(Math.max(0, m.index - 30), m.index + t.length + 30).replace(/\s+/g, " "));
    }
  }
  assert.deepEqual(hits, []);
});

test("Entscheidung 5: Startseite des Screeners fragt „Was suchst du?“, Treffer „Erfüllt deinen Filter“", () => {
  const app = readFileSync("screener/app.js", "utf8");
  assert.match(app, /'Was suchst du\?'/);
  assert.match(app, /'Erfüllt deinen Filter/);
  const C = require("../../fundamental/engine/catalog.js");
  assert.equal(C.RANKINGS.filter((r) => r.id === "bewertung")[0].title, "Niedrigste Bewertung (KGV)");
});

test("Entscheidung 3: Fundamental zeigt Analysten-Einstufungen ohne Kursziele", () => {
  const app = visible(readFileSync("fundamental/app.js", "utf8"));
  assert.doesNotMatch(app, /\ba\.target\b|\btg\.mean\b|targetMean|Kursziel/);
  assert.match(app, /Analystenkonsens \(Angabe Dritter\)/);
  for (const f of walk("fundamental")) assert.doesNotMatch(visible(readFileSync(f, "utf8")), /Kursziel/, f);
  /* Der Screener führt das Kursziel nur als gesperrtes Kriterium ohne Datenquelle (kein Wert wird je gezeigt);
     die Abfrage-Gleichheit (core/tests/query-engine-universe.test.mjs) hält das Feld fest. */
  const F = require("../../screener/engine/fields.js");
  assert.deepEqual(F.FIELDS.filter((f) => /kursziel/i.test(f.label)).map((f) => [f.id, f.available]), [["priceTargetUpside", false]]);
});

/* Gleiche Wörter bedeuten überall dieselbe Regel: Satz-Bausteine, fertige Ideen und Fundamental-Ranglisten. */
test("Entscheidung 5: ein Begriff, eine Regel (Satz, fertige Ideen, Ranglisten)", () => {
  const V = require("../../screener/engine/vocab.js");
  const C = require("../../fundamental/engine/catalog.js");
  const has = (fs, f) => fs.some((g) => V.sameFilter(g, f));
  let checked = 0;
  for (const p of V.PROPS) for (const t of V.TERMS) if (t.re.test(p.word)) { assert.ok(V.sameFilter(p.f, t.f), "Satz „" + p.word + "“"); checked++; }
  for (const i of V.IDEAS) for (const t of V.TERMS) if (t.re.test(i.title)) { assert.ok(has(i.fs, t.f), "Idee „" + i.title + "“ braucht " + JSON.stringify(t.f)); checked++; }
  assert.ok(checked >= 8, "Wörterbuch greift (" + checked + ")");
  for (const t of V.TERMS) assert.ok(V.PROPS.some((p) => t.re.test(p.word)) || V.IDEAS.some((i) => t.re.test(i.title)), "Begriff " + t.re + " ungenutzt");
  /* „gut verdienen“ = Nettomarge über 15 % in Satz und Idee; die Idee mit Nettomarge über 0 % heißt „Profitabel“. */
  assert.equal(V.PROPS.filter((p) => p.word === "gut verdienen")[0].sub, "Nettomarge über 15 %");
  const prof = V.IDEAS.filter((i) => i.title === "Profitabel")[0];
  assert.deepEqual(prof.fs, [{ field: "netMargin", op: "gt", value: 0 }]);
  assert.ok(!V.IDEAS.some((i) => /verdienen geld/i.test(i.title)), "„Verdienen Geld“ heißt jetzt „Profitabel“");
  /* Fundamental-Ranglisten: „Profitable …“ setzt ebenfalls Nettomarge über 0 % voraus. */
  const rk = C.RANKINGS.filter((r) => /profitab/i.test(r.title));
  assert.ok(rk.length >= 1);
  for (const r of rk) {
    assert.equal(r.filter({ roic: 0.3, netMargin: -0.01 }), false, r.title + ": Verlust schließt aus");
    assert.equal(r.filter({ roic: 0.3, netMargin: 0.01 }), true, r.title + ": Gewinn reicht");
  }
});

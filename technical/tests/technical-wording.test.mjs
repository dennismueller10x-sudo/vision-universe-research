/* Konzept „Der Chart in drei Sätzen“ (docs/design/technical-2026-11/HANDOVER.md), PR 1 · Wörter.
   Entscheidung 1: „Befund“ ist das eine Wort für alles, was die Regeln finden; „Signal“ und „Setup“ verschwinden aus der Oberfläche.
   Entscheidung 2: Richtung in Worten („deutet nach oben/unten“, „Richtung offen“) statt bullisch/bärisch/Aufwärts/Abwärts.
   Entscheidung 3: Alltagssprache im Fließtext (200-Tage-Linie, Schwung, Handel in Worten), durchgehend du.
   Wortwahl: kein Begriff aus assets/legal-notices.json → wording[].avoid im sichtbaren Text von technical/**. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const legal = JSON.parse(readFileSync("assets/legal-notices.json", "utf8"));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "data" || f === "tests") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) ? [p] : [];
  });
}
const FILES = walk("technical");

/* Sichtbarer Text = Zeichenkettenliterale nach Entfernen der Kommentare (HTML: Text außerhalb der Tags).
   Bezeichner, Routen und CSS-Klassen („signals“, „tc-signal“) sind klein geschrieben und zählen nicht. */
function strings(src, file) {
  if (file.endsWith(".html")) return [src.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")];
  const out = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"\\])\/\/.*$/gm, "$1");
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}
/* Verneinungen sind die geforderte Einordnung („keine Handlungsempfehlung“, „kein Kauf- oder Verkaufssignal“). */
const neg = (s) => s.replace(/\bkeine?\s+(Anlage|Kauf|Handlungs)?empfehlung(en)?/gi, "").replace(/\bkeine?\s+Kauf- oder Verkaufssignale?/gi, "");

const NOT_A_TERM = {
  "2": "Rest von „Ziel 1/2“",
  "Ziel 1": "nur zusammen mit „Ziel 2“ eine Handlungsmarke",
  Chance: "nur als „Chance/Risiko“ verboten",
  Risiko: "Fachwort (Schwankung und Risiko); nur „Chance/Risiko“ ist verboten",
  Signal: "eigener Test unten (MACD-Signallinie ist ein Fachwort)",
  sicher: "steckt in „unsicher“; die Zusage prüft die Wendung „100 % sicher“",
  kaufen: "Fachwort im Zusammenhang „überkauft“ zählt nicht (Wortgrenze), eigenständig verboten",
  verkaufen: "wie „kaufen“"
};
const TERMS = [];
for (const w of legal.wording) for (const part of w.avoid.replace(/\([^)]*\)/g, "").split(/[,/]/)) {
  const t = part.replace(/[„“"]/g, "").trim();
  if (t && !(t in NOT_A_TERM)) TERMS.push(t);
}
TERMS.push("Chance/Risiko", "100 % sicher", "kaufen", "verkaufen");
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hitsOf(re, filter) {
  const hits = [];
  for (const f of FILES) for (const s of strings(readFileSync(f, "utf8"), f)) {
    const v = neg(s);
    if (filter && !filter(f, v)) continue;
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = r.exec(v))) hits.push(f + ": „" + m[0] + "“ … " + v.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30));
  }
  return hits;
}

test("Wortwahl: kein wording[].avoid-Begriff im sichtbaren Text von Technical", () => {
  assert.ok(TERMS.includes("Kaufempfehlung") && TERMS.includes("Einstiegszone") && TERMS.includes("Live-Signal"));
  assert.ok(FILES.includes("technical/app.js") && FILES.includes("technical/engine/model.js"));
  const hits = [];
  for (const t of TERMS) hits.push(...hitsOf(new RegExp("(^|[^\\p{L}])" + esc(t) + "(?![\\p{L}])", "iu")));
  assert.deepEqual(hits, []);
});

test("Entscheidung 1: kein „Signal“, „Signale“ oder „Setup“ in der Oberfläche (MACD-Signallinie bleibt Fachwort)", () => {
  assert.deepEqual(hitsOf(/(^|[^\p{L}])(Signal|Signale|Signals|Signalen|Modellsignal|Setups?)(?![\p{L}])/u), []);
});

test("Entscheidung 2: kein bullisch/bärisch, keine Richtung „Aufwärts/Abwärts“ als Etikett", () => {
  assert.deepEqual(hitsOf(/(^|[^\p{L}])(bullisch|bärisch|baerisch)\p{L}*/iu), []);
  assert.deepEqual(hitsOf(/^[▲▼◆]?\s*(Aufwärts|Abwärts|Bullisch|Bärisch|Neutral)$/u), []);
});

test("Entscheidung 3: du statt Sie (keine Anrede in der Höflichkeitsform)", () => {
  /* „Sie“ am Satzanfang meint die Treffer, Zonen usw. (3. Person); die Anrede steht mitten im Satz oder als Aufforderung. */
  assert.deepEqual(hitsOf(/[\p{Ll},]\s+(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?![\p{L}])|(Wählen|Geben|Klicken|Nutzen|Öffnen|Prüfen|Speichern|Tippen|Lesen|Sehen) Sie\b/u), []);
});

test("Entscheidungen 2 und 3: Befunde in Alltagssprache mit Richtung in Worten", () => {
  globalThis.VUTechnical = globalThis.VUTechnical || {};
  require("../../core/query-engine.js");
  require("../../quant/engines/technical/technical-query.js");
  const M = require("../engine/model.js");
  assert.equal(M.directionWords(1), "deutet nach oben");
  assert.equal(M.directionWords(-1), "deutet nach unten");
  assert.equal(M.directionWords(0), "Richtung offen");
  assert.equal(M.volumeWords(1.95), "fast doppelt so viel Handel wie üblich");
  assert.equal(M.volumeWords(1.0), "Handel wie üblich");
  assert.equal(M.momentumWords(30.8), "zuletzt eher gefallen");
  assert.equal(M.momentumWords(29), "zuletzt stark gefallen");
  assert.equal(M.plain("Bullische Flagge"), "Flagge steigend");
  assert.equal(M.plain("Bärischer Wimpel"), "Wimpel fallend");
  assert.equal(M.plain("Bullisches Kerzenmuster am Stichtag"), "Kerzenmuster nach oben am Stichtag");
  const f = M.findings({ formations: [] }, { sma200: 204.67, sma50: 219.81, rsi14: 30.8, relativeVolume: 1.95 }, 186.64);
  const by = Object.fromEntries(f.map((x) => [x.id, x]));
  assert.equal(by.sma200.title, "Kurs unter der 200-Tage-Linie");
  assert.equal(by.sma200.text, "186,64 $ zu 204,67 $ (−8,8 %).");
  assert.equal(by.cross.title, "50-Tage-Linie über der 200-Tage-Linie");
  assert.equal(by.sma200.badge, "deutet nach unten");
  assert.equal(by.volume.title, "Fast doppelt so viel Handel wie üblich");
  for (const x of f) assert.doesNotMatch(x.title + " " + x.text, /\bSMA\b|Bullisch|Bärisch|Median/, x.id);
});

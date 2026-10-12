/* Explore Highlights (alle) und Candidate Explorer (nur Profi): statische Absicherung der Seite quant/app/page-chartbild.js.
   Das Verhalten im Browser (Viewports, Chart-Umschaltung) wird in der Abnahme mit Playwright geprueft; hier steht, was sich nicht still aendern darf. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../app/page-chartbild.js", import.meta.url), "utf8");
const body = (name) => { const i = src.indexOf("function " + name + "("); assert.ok(i >= 0, name); const j = src.indexOf("\n  function ", i + 10); return src.slice(i, j < 0 ? undefined : j); };

test("UI-1 · Highlights stehen in der Kundenkarte, der Candidate Explorer nur in der Fachansicht", () => {
  assert.ok(/highlightSection\(/.test(body("projectionCard")), "Kundenkarte zeigt Highlights");
  assert.ok(!/candidateSection\(/.test(body("projectionCard")), "Kundenkarte zeigt keinen Candidate Explorer");
  assert.ok(/candidateSection\(/.test(body("projectionPro")), "Fachansicht zeigt den Candidate Explorer");
  assert.ok(/exploreC = ex && pro \?/.test(body("pickProjection")), "Kandidaten werden ausserhalb von Profi nicht einmal ausgewaehlt");
});

test("UI-2 · Beschriftung: Highlight explorativ und nicht als reguläre Alternative freigegeben; Candidate Explorer nachrangig und eingeklappt", () => {
  const hl = body("highlightCard"), cs = body("candidateSection"), cc = body("candidateCard");
  assert.ok(/Explorative Elliott-Chance/.test(hl) && /Regelkonforme alternative Lesart/.test(hl) && /Nicht als reguläre Alternative freigegeben/.test(hl));
  assert.ok(/Rang im Pool, keine Wahrscheinlichkeit/.test(hl), "Rang nie als Wahrscheinlichkeit");
  assert.ok(/el\("details"/.test(cs) && /Weitere technische Elliott-Lesarten/.test(cs) && /nachrangig/.test(cs) && !/\bopen\b\s*:/.test(cs), "eingeklappt, nachrangig, technisch");
  assert.ok(/Kein Highlight, weil/.test(cc) && /nachrangig/.test(cc));
});

test("UI-3 · Chart-Umschaltung getrennt: xh: für Highlights, xc: für Candidate Explorer, mit eigenem Hinweis", () => {
  assert.ok(/onChart\("xh:" \+ i\)/.test(body("highlightCard")));
  assert.ok(/onChart\("xc:" \+ i\)/.test(body("candidateCard")));
  assert.ok(/candidateNote/.test(src) && /nachrangig, kein Highlight/.test(src));
  assert.ok(/pjT\.role === "EXPLORE_HIGHLIGHT"/.test(src) && /pjT\.role === "EXPLORE_CANDIDATE"/.test(src));
});

test("UI-4 · Keine Reste der breiten Explore-Ebene und keine Wahrscheinlichkeits-/Empfehlungssprache in den neuen Texten", () => {
  assert.ok(!/exploreSection|exploreCard|explore:/.test(src));
  const txt = [body("highlightSection"), body("highlightCard"), body("candidateSection"), body("candidateCard")].join("\n");
  assert.ok(!/Kaufen|Strong Buy|High Confidence|Expected Return|Likely Target|Trefferquote/i.test(txt));
});

/* Konzept Elliott, Hedgefonds, Vorsorge (docs/design/elliott-hedgefonds-vorsorge-2026-11/HANDOVER.md), Wortwahl.
   Kein Begriff aus assets/legal-notices.json → wording[].avoid im sichtbaren Text der umgebauten Welten; dazu je Welt die Wörter, die das
   Konzept streicht (Elliott: keine Ziele und Handlungssätze, kein eigener „Technischer Ausblick“). Hedgefonds und Vorsorge kommen mit ihren PRs dazu. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const legal = JSON.parse(readFileSync("assets/legal-notices.json", "utf8"));
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "data" || f === "tests" || f === "img") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) ? [p] : [];
  });
}
/* Sichtbarer Text = Zeichenkettenliterale nach Entfernen der Kommentare (HTML: Text außerhalb der Tags). */
function strings(src, file) {
  if (file.endsWith(".html")) return [src.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")];
  const out = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"\\])\/\/.*$/gm, "$1");
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
/* Verneinungen sind die geforderte Einordnung („keine Anlageempfehlung“, „Beispiele, keine Empfehlung“). */
const neg = (s) => s.replace(/\bkeine?\s+(Anlage|Kauf|Handlungs)?empfehlung(en)?/gi, "").replace(/\bkein(e|en)?\s+Kursziel(e)?/gi, "").replace(/\bkeine?\s+Kauf- oder Verkaufs(signale?|empfehlung)/gi, "");
const NOT_A_TERM = {
  "2": "Rest von „Ziel 1/2“", "Ziel 1": "eigener Test je Welt", Chance: "nur als „Chance/Risiko“ verboten", Risiko: "Fachwort; nur „Chance/Risiko“ ist verboten",
  Signal: "eigener Test je Welt", sicher: "steckt in „unsicher“, „Sicherheit“ (Zählung) ist Fachwort; geprüft wird „100 % sicher“",
  kaufen: "Ereignisse Dritter („Fonds haben gekauft“, 13F) sind erlaubt (WORTWAHL.md)", verkaufen: "wie „kaufen“",
  "Kauf / Verkauf": "Ereignisse Dritter (13F, Form 4)", "Kauf": "wie oben", "Verkauf": "wie oben"
};
const TERMS = [];
for (const w of legal.wording) for (const part of w.avoid.replace(/\([^)]*\)/g, "").split(/[,/]/)) {
  const t = part.replace(/[„“"…]/g, "").trim();
  if (t && !(t in NOT_A_TERM)) TERMS.push(t);
}
TERMS.push("Chance/Risiko", "100 % sicher");
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hitsOf(files, re) {
  const hits = [];
  for (const f of files) for (const s of strings(readFileSync(f, "utf8"), f)) {
    const v = neg(s), r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = r.exec(v))) hits.push(f + ": „" + m[0] + "“ … " + v.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30));
  }
  return hits;
}
const avoidHits = (files) => TERMS.flatMap((t) => hitsOf(files, new RegExp("(^|[^\\p{L}])" + esc(t) + "(?![\\p{L}])", "iu")));

const ELLIOTT = walk("elliott");
test("Elliott: kein wording[].avoid-Begriff im sichtbaren Text", () => {
  assert.ok(ELLIOTT.includes("elliott/app.js") && ELLIOTT.includes("elliott/engine/home-model.js"));
  assert.ok(TERMS.includes("Kaufempfehlung") && TERMS.includes("Kursziel"));
  assert.deepEqual(avoidHits(ELLIOTT), []);
});
test("Elliott: keine Ziele, keine Handlungssätze, kein zweiter technischer Ausblick (Entscheidung 4)", () => {
  assert.deepEqual(hitsOf(ELLIOTT, /Zielbereich|Ziel\s*[12]\b|Zone\s*[12]\b|abwarten|Technischer Ausblick|Welche Wellen laufen gerade/iu), []);
});

const HEDGE = walk("hedgefonds");
const hedgeSrc = readFileSync("hedgefonds/app.js", "utf8");
test("Hedgefonds: kein wording[].avoid-Begriff, kein „Smart Money“ im sichtbaren Text (Entscheidung 7)", () => {
  assert.ok(HEDGE.includes("hedgefonds/app.js"));
  assert.deepEqual(avoidHits(HEDGE), []);
  assert.deepEqual(hitsOf(HEDGE, /Smart Money|Smart-Money/u), []);
  for (const f of ["products/hedgefonds/module.json", "assets/site-navigation.js", "core/registry/modules.json"]) assert.doesNotMatch(readFileSync(f, "utf8"), /Smart Money/, f);
});
test("Hedgefonds: Leiste „Gruppen-Käufe“, alte Adresse #/smart-money leitet weiter", () => {
  assert.match(hedgeSrc, /if \(page === "smart-money"\) \{ location\.replace\(parts\[1\] === "einstiege" \? "#\/gruppen-kaeufe" : "#\/gruppen-kaeufe\/insider"\); return; \}/);
  assert.match(hedgeSrc, /intro\("Gruppen-Käufe", "Viele Fonds, gleiche Aktie\. "/);
  assert.match(readFileSync("assets/site-navigation.js", "utf8"), /\['gruppen','Gruppen-Käufe','\/hedgefonds\/#\/gruppen-kaeufe','signals'\]/);
});
test("Hedgefonds: Quartalsband auf dem Start (gezeigt · gemeldet bis · nächste Meldungen, Entscheidung 6)", () => {
  const home = hedgeSrc.slice(hedgeSrc.indexOf("function renderHome() {"), hedgeSrc.indexOf("function mvRow("));
  assert.match(home, /qband\(\)/);
  for (const t of ['col("Gezeigt"', 'col("Gemeldet bis"', 'col("Nächste Meldungen"', '"Depots am "', '"45 Tage später"']) assert.ok(hedgeSrc.includes(t), t);
  const pd = new Function(hedgeSrc.match(/function periodDeadline[\s\S]*?\n  \}\n/)[0] + "return periodDeadline;")();
  const d = (x) => x.toISOString().slice(5, 10);
  assert.equal(pd("2026-06-30").getMonth(), 7); assert.equal(pd("2026-06-30").getDate(), 14);
  assert.equal(pd("2026-03-31").getMonth(), 4); assert.equal(pd("2026-12-31").getFullYear(), 2027);
  assert.match(hedgeSrc, /function otherQ\(f\)/, "Karten mit anderem Quartal sagen es");
  void d;
});
test("Hedgefonds: Fondsnamen aufbereitet, Rohname bleibt in Quellen (Entscheidung 10)", () => {
  const fn = new Function(hedgeSrc.match(/function prettyIssuer[\s\S]*?\n  \}\n/)[0] + hedgeSrc.match(/function fundName[\s\S]*?\n  \}\n/)[0] + "return fundName;")();
  assert.equal(fn("Builder Investment Group Inc /adv"), "Builder Investment Group");
  assert.equal(fn("Pershing Square Capital Management"), "Pershing Square");
  assert.equal(fn("Fisher Asset Management"), "Fisher Asset Management");
  assert.equal(fn("Geode Capital Management, Llc"), "Geode Capital Management");
  assert.equal(fn("BlackRock, Inc."), "BlackRock");
  assert.match(hedgeSrc, /d\.secName/, "SEC-Name bleibt in der Meldung sichtbar");
});

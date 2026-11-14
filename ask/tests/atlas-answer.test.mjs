/* Vision Universe — ask/tests/atlas-answer.test.mjs
   Atlas-Antwort nach dem Konzept mein-bereich-2026-11 (Screens a-home, a-screen, a-answer):
   Regel-Chips aus der Übersetzung, Screener-Link mit genau diesen Regeln, „Erklären“ aus der SEC-Jahresreihe. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { translate } from "../../workers/vu-ask/src/translate.mjs";

const require = createRequire(import.meta.url);
const Ask = require("../engine.js");

const find = translate({ kind: "screen", understood: "Kleine Firmen, günstig, ohne Netto-Schulden", tickers: [], show: ["pe", "marketCap", "netCash"], sort: { field: "pe", dir: "asc" }, limit: 25, missing: [], notes: [],
  filters: [{ field: "marketCap", op: "between", value: 3e8, value2: 2e9, values: [], flag: null }, { field: "pe", op: "lt", value: 15, value2: null, values: [], flag: null },
    { field: "netCash", op: "gt", value: 0, value2: null, values: [], flag: null }],
  supertrader: { strategy: "NONE", mode: "none" } });

test("Finden: je Regel ein Chip, „alle drei“, Screener-Link trägt genau die Regeln", () => {
  const rules = Ask.rules(find);
  assert.equal(rules.length, 3);
  assert.ok(rules.every((r) => r.kind === "filter" && r.text && r.id));
  assert.match(rules.map((r) => r.text).join(" | "), /KGV/);
  assert.equal(Ask.allOf(rules.length), "alle drei");
  assert.equal(Ask.allOf(1), "die Regel");
  const url = Ask.screenerUrl(find);
  assert.match(url, /^\/screener\/\?/);
  for (const f of ["marketCap%3Abetween%3A300000000%3A2000000000", "pe%3Alt%3A15", "netCash%3Agt%3A0"]) assert.ok(url.includes(f), f);
  const withMethod = translate({ kind: "screen", understood: "", tickers: [], show: [], limit: 25, missing: [], notes: [], filters: [], supertrader: { strategy: "WEINSTEIN_STAGE", mode: "require" } });
  assert.deepEqual(Ask.rules(withMethod).map((r) => r.kind), ["strategy"]);
});

test("Erklären: Jahresreihe aus den SEC-Berichten der Aktiendatei, letzter Wert zum Vorjahr", () => {
  const file = { fundamentals: { asOf: "2026-11-08", journey: { tracks: { free_cash_flow: [2021, 2022, 2023, 2024, 2025, 2026].map((fy, i) => ({ fy, v: [1, 8.1, 3.8, 27.0, 60.9, 96.7][i] * 1e9 })) } } } };
  assert.equal(Ask.secTrack(["fcfGrowth", "pe"]), "free_cash_flow");
  assert.equal(Ask.secTrack(["pe"]), null);
  const e = Ask.explain(file, "free_cash_flow", 4);
  assert.deepEqual([e.fromFy, e.toFy, e.bars.length, e.label], [2023, 2026, 4, "Free Cashflow"]);
  assert.ok(Math.abs(e.lastChange - (96.7 / 60.9 - 1)) < 1e-12);
  assert.match(e.formula, /operativer Cashflow − Investitionen/);
  assert.equal(Ask.explain({ fundamentals: { journey: { tracks: {} } } }, "free_cash_flow"), null, "ohne Reihe keine erfundene Antwort");
  assert.equal(Ask.explain(file, "free_cash_flow", 4).asOf, "2026-11-08");
});

test("Seite: ein Status-Satz, Was Atlas kann, Oft gefragt, Grenzen in einem „?“, Knöpfe der Antwort", () => {
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  for (const s of ["Frag Vision Universe.", "Was Atlas kann", "Oft gefragt", "Finden", "Vergleichen", "Erklären", "So hat Atlas übersetzt", "So hat Atlas gerechnet", "im Screener", "Regel ändern", "Weiter fragen", "keine Empfehlung"]) assert.ok(src.includes(s), s);
  assert.match(src, /href: Ask\.screenerUrl\(r\)/, "Alle N im Screener über das vorhandene screenerUrl");
  assert.doesNotMatch(src, /Noch gesperrt'\)\)|Atlas fragt diese Welten|Probier zum Beispiel|ak-trust/, "zwei Zustände, Welten-Kacheln und Hinweisblöcke entfallen");
  assert.match(src, /U\.q\(/, "Grenzen in einem „?“");
  const legal = JSON.parse(readFileSync(new URL("../../assets/legal-notices.json", import.meta.url), "utf8"));
  const visible = (src.match(/'[^'\n]*'/g) || []).filter((x) => !/^'\//.test(x)).join(" ") /* Pfade zählen nicht */.replace(/\bkeine?n? [\wäöüß-]+( oder [\wäöüß-]+)?/gi, " ").replace(/kaufen oder verkaufen sollst/g, "").toLowerCase();
  const avoid = legal.wording.flatMap((w) => String(w.avoid || "").replace(/\([^)]*\)/g, "").split(/,| \/ /)).map((a) => a.trim().toLowerCase()).filter((a) => a.length > 3);
  for (const a of avoid) assert.ok(!visible.includes(a), "vermeiden: " + a);
});

/* App-Konzept 2 (Owner 14.11.2026): nur Darstellung. Bausteine aus assets/vu-ui.js statt eigener; der Frageweg bleibt, wie er war. */
test("Darstellung App-Konzept 2: Schiene und Kacheln am Start, neongrüne Übersetzungskarte, Gerüst beim Laden, „Weiter“-Karte; Frageweg unverändert", () => {
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8"), css = readFileSync(new URL("../ask.css", import.meta.url), "utf8"), html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const UI = require("../../assets/vu-ui.js");
  assert.match(src, /U\.rail\(CAN\.map\(/, "„Was Atlas kann“ als Schiene");
  assert.match(src, /U\.tap\([^\n]*\n?[^\n]*cls: 'ak-can-card', attrs: \{ 'data-ak-ask': c\.q \}/, "Kachel je Beispiel");
  assert.match(src, /cls: 'ak-often-q', attrs: \{ 'data-ak-ask': q \}/, "„Oft gefragt“ als Kacheln");
  assert.match(src, /if \(b && startEl\.contains\(b\)\) ask\(b\.getAttribute\('data-ak-ask'\), true\)/, "Kacheln stellen die Frage über ask(q, true) wie zuvor");
  assert.match(src, /class: 'ak-ans ak-ans--lime'/, "Übersetzung als neongrüne Karte");
  assert.ok(src.indexOf("class: 'ak-count'") < src.indexOf("class: 'ak-rcs' }, rules.map"), "die große Zahl steht vor den Regeln");
  assert.match(src, /U\.skeleton\('rows'\)/, "Laden zeigt das Gerüst der Antwort");
  const screener = JSON.parse(readFileSync(new URL("../../products/screener/module.json", import.meta.url), "utf8")).navigation;
  assert.ok(src.includes(`U.next({ title: '${screener.label}', sub: '${screener.claim}', href: '${screener.href}' })`), "„Weiter“-Karte mit Name und Satz aus dem Steckbrief des Screeners");
  /* Frageweg: genau ein Aufruf je Endpunkt, Beispiele und feste Fragen wörtlich wie zuvor */
  assert.equal((src.match(/fetch\(ENDPOINT \+ '\/v1\/ask'/g) || []).length, 1);
  assert.equal((src.match(/fetch\(ENDPOINT \+ '\/v1\/quota/g) || []).length, 1);
  for (const q of ["Kleine Firmen, günstig, ohne Schulden", "NVIDIA gegen AMD und Broadcom", "Wie stark ist der Free Cashflow bei NVIDIA gewachsen?", "Welche Aktien stehen auf einem neuen Jahreshoch?", "Welche Aktien stehen im Weinstein-Stage-2?", "Wie hoch ist die Marge bei Apple?"]) assert.ok(src.includes(`'${q}'`), q);
  /* Farben: nur Schwarz, Weiß, Graustufen, Neongrün und das Nachtschwarz der Bausteine */
  for (const hex of css.match(/#[0-9a-f]{3,8}\b/gi) || []) {
    const h = hex.slice(1).toLowerCase(), full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    assert.ok(full === "c8f531" || full === "0e1013" || (full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6)), "Farbe außerhalb der Palette: " + hex);
  }
  assert.ok(html.includes(`/assets/vu-ui.css?v=${UI.VERSION}`) && html.includes(`/assets/vu-ui.js?v=${UI.VERSION}`), "Marke der Bausteine");
  assert.match(html, /<vu-navigation menu-only no-dock/, "Vollbild-Werkzeug ohne Dock, wie zuvor");
});

// Discover · Aktienseite nach dem Redesign 2027 (D09): Darstellungsregeln des Überblicks (discover/ui/overview.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const O = require("../ui/overview.js");

test("OV1 Kurs-Urteil: ab +5 % stärker, ab −5 % schwächer, sonst seitwärts, ohne Wert keins", () => {
  assert.deepEqual(O.kursUrteil(-0.134826), ["weak", "Etwas schwächer"]);
  assert.deepEqual(O.kursUrteil(0.05), ["strong", "Etwas stärker"]);
  assert.deepEqual(O.kursUrteil(0.01), ["mid", "Seitwärts"]);
  assert.equal(O.kursUrteil(null), null);
});

test("OV2 Bewertung folgt der ausgelieferten Stufe gegen den Marktmedian", () => {
  assert.deepEqual(O.bewertungsUrteil({ relative: { stufe: "mittel" } }), ["mid", "Wie der Markt"]);
  assert.deepEqual(O.bewertungsUrteil({ relative: { stufe: "hoch" } }), ["weak", "Teurer als der Markt"]);
  assert.equal(O.bewertungsUrteil({}), null);
});

test("OV3 Noten der Gesundheit auf die vier Urteile (C08)", () => {
  assert.equal(O.gradeKind("Sehr stark"), "strong");
  assert.equal(O.gradeKind("Solide"), "mid");
  assert.equal(O.gradeKind("Rückläufig"), "weak");
});

test("OV4 Reihentitel lesbar, Abkürzungen bleiben groß", () => {
  assert.equal(O.titleCase("STÄRKSTE AKTIEN IM NASDAQ-100"), "Stärkste Aktien im NASDAQ-100");
  assert.equal(O.titleCase("HALBLEITER & CHIPS"), "Halbleiter & Chips");
  assert.equal(O.titleCase("KÜNSTLICHE INTELLIGENZ"), "Künstliche Intelligenz");
});

test("OV5 Aktienroute lädt Bausteine, Überblick und Stil; nur Weiß/Schwarz/Neongrün im Überblick", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const s of ["/assets/vu-chart.js", "/assets/vu-ui.js", "/discover/ui/overview.js", "/assets/vu-ui.css", "/discover/ui/overview.css"]) assert.ok(html.includes(s), s);
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  for (const c of css.match(/#[0-9a-f]{3,8}\b/gi) || []) assert.ok(["#c8f531", "#000", "#fff", "#f4f4f4", "#e9e9e9", "#6e6e6e", "#c4281c"].includes(c.toLowerCase()), c); // #c4281c: Minus-Pille im Aktienkopf (BAUKASTEN Regel 1, Ausnahme Owner 06.11.2026)
});

/* Konzept „Reihe für Reihe“, PR 5 (Folien AX01–AX05): die Aktie als Titelseite. Geprüft an der ausgelieferten NVIDIA-Datei,
   eingefroren vom Stand vor dem Marktlauf 666625e416 (09.11.2026): die Tests nennen echte Werte (23 % unter dem Hoch, −4,4 %
   in 12 Monaten, Platz 2, +12 Reihen), und die täglich neu gebaute discover/data/stocks/US_REAL/NVDA.json änderte sie
   mit jedem Marktlauf - OV6, OV9 und OV11 wurden rot, ohne dass sich discover/ui/overview.js geändert hatte. */
const NVDA = JSON.parse(readFileSync(new URL("./fixtures/NVDA-2026-11-09.json", import.meta.url), "utf8"));
globalThis.VUUI = require("../../assets/vu-ui.js");
globalThis.VUDiscover = globalThis.VUDiscover || {};
globalThis.VUDiscover.Einordnung = require("../engines/einordnung.js");
const OV = require("../ui/overview.js");

test("OV6 Story in drei Sätzen statt „In einem Satz“ und „Auf einen Blick“, ohne „dafür/dagegen“", () => {
  const html = OV.story(NVDA);
  assert.match(html, /Die Story in drei Sätzen/);
  assert.equal((html.match(/dv3-story-r/g) || []).length, 3, "Geschäft, Kurs, Bewertung");
  for (const l of ["Geschäft", "Kurs", "Bewertung"]) assert.match(html, new RegExp(">" + l + "<"));
  assert.match(html, /Der Kurs liegt 23\s%\sunter dem Hoch der letzten 12 Monate\./);
  assert.doesNotMatch(html, /In einem Satz|Auf einen Blick|dafür|dagegen/);
  assert.deepEqual(OV.hochUrteil(-0.23), ["weak", "Schwächer"]);
  assert.deepEqual(OV.hochUrteil(-0.02), ["strong", "Nah am Hoch"]);
  assert.equal(OV.hochUrteil(null), null);
});

test("OV7 sieben Kapitel in der Reihenfolge der Präsentation, „Stärken und Schwächen laut Kennzahlen“", () => {
  const ks = OV.kapitelListe(NVDA, "US_REAL");
  assert.deepEqual(ks.map((k) => k[0]), ["kurs", "firma", "geschaeft", "gesund", "teuer", "waage", "indizes"]);
  assert.equal(ks[5][1], "Stärken und Schwächen laut Kennzahlen");
  assert.match(ks[2][2], /^Umsatz .+ im GJ 2026$/, "Betrag über den zentralen Formatter (quant/engines/fx/money-format.js)");
  const alles = ks.map((k) => k[1] + k[2] + k[4]).join("");
  assert.doesNotMatch(alles, /Was dafür spricht|was dagegen|aria-label="dafür"|Günstiger bewertet/);
});

test("OV8 Kapitel öffnen als Fenster von unten (Owner 15.11.2026); kein Aufklappen, kein Gerätegedächtnis mehr", () => {
  const src = readFileSync(new URL("../ui/overview.js", import.meta.url), "utf8");
  assert.match(src, /<button type="button" class="dv3-ep" data-ch="' \+ k\[0\] \+ '" aria-haspopup="dialog">/, "Kapitel ist ein Knopf, der ein Fenster öffnet");
  assert.match(src, /U\(\)\.sheet\(SHEET_ID, k\[1\]/, "Fenstertitel ist der Kapiteltitel, Inhalt der unveränderte Abschnitt");
  assert.match(src, /U\(\)\.openSheet\(el\)/);
  assert.doesNotMatch(src, /<details class="dv3-ep"|localStorage\.setItem\(OPEN_KEY|addEventListener\("toggle"/, "kein Aufklappen an Ort und Stelle, nichts wird gemerkt");
  assert.match(src, /removeItem\(OPEN_KEY\)/, "das alte Gedächtnis wird vom Gerät entfernt");
  assert.match(src, /addEventListener\("hashchange", fensterZu\)/, "ein Seitenwechsel schließt das Fenster");
});

test("OV9 ein Jahreswert: alle 12-Monats-Angaben der Titelseite sind derselbe Dollar-Wert, Kopf in Dollar mit Euro daneben", () => {
  const ks = OV.kapitelListe(NVDA, "US_REAL");
  const werte = new Set(((ks.map((k) => k[2] + k[4]).join(" ") + OV.story(NVDA)).match(/[−+]\d+,\d\s%(?=\sin 12 Monaten)/g) || []).map((w) => w.replace(/\s/g, " ")));
  assert.deepEqual([...werte], ["−4,4 %"]);
  const detail = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
  assert.match(detail, /var dollarKopf = state\.detail\.region !== "EUROPE"/);
  assert.match(detail, /dx-chart-hero-eur/);
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  assert.match(css, /dx-chart-hero-preis>\.down\{background:#c4281c;color:#fff\}/, "Minus rot (#c4281c, Owner 11.11.2026)");
  assert.match(css, /dx-chart-hero-preis>\.up\{background:#c8f531/, "Plus neongruen");
  /* Klickentwurf 17.11.2026: Kurs und Pille in einer Zeile (bricht schmal um), darunter „Schluss …“, darunter die Veränderung im
     Zeitraum; der Euro-Wert steht als Pille unter den Zeitraum-Knöpfen, neben Hoch und Tief der letzten 12 Monate. */
  assert.match(css, /dx-chart-hero\.dx-chart-hero--c04\{display:flex;flex-direction:column/, "Kursblock untereinander");
  assert.match(css, /dx-chart-hero--c04 \.dx-chart-hero-preis\{display:flex;flex-wrap:wrap/, "Kurs und Pille brechen schmal um");
  assert.doesNotMatch(css, /grid-template-columns:subgrid/, "kein Raster mehr neben dem Kurs");
  assert.match(detail, /dx-chart-hero-zr num/, "Veränderung im Zeitraum über dem Chart");
  assert.match(detail, /var hoch = Math\.max\.apply\(null, jahr\)[\s\S]{0,160}"Hoch 12 Mon\. " \+ alsAngezeigt\(hoch, waehrung\)/, "Hoch/Tief aus der gezeichneten Tagesreihe");
  assert.match(css, /\.dx-chart-pills\{order:2;/, "Pillen unter den Zeitraum-Knöpfen");
});

test("OV10 „Weiter in …“ nur mit Herkunft aus einer Reihe (Adress-Zusatz ?reihe=)", () => {
  const orig = globalThis.location;
  globalThis.location = { hash: "#/s/US_REAL/NVDA" };
  assert.equal(OV.reiheAusAdresse(), null);
  globalThis.location = { hash: "#/s/US_REAL/NVDA?reihe=langfristige-compounder" };
  assert.equal(OV.reiheAusAdresse(), "langfristige-compounder");
  globalThis.location = { hash: "#/s/US_REAL/NVDA?reihe=<x>" };
  assert.equal(OV.reiheAusAdresse(), null);
  globalThis.location = orig;
  const src = readFileSync(new URL("../ui/overview.js", import.meta.url), "utf8");
  assert.match(src, /if \(!id \|\| !UI \|\| !R\(\)\) return;/, "ohne Herkunft keine Leiste und keine Endkarte");
});

test("OV11 Platzierung (Klickentwurf 17.11.2026): Ring mit bestem Platz, Titel, Indizes mit Gewicht, +N Reihen", () => {
  const html = OV.etiketten(NVDA, "US_REAL");
  assert.match(html, /^<a class="dv3-platz" href="[^"]+">/, "Karte führt in die Reihe");
  assert.match(html, /class="vu-ring"[^>]*aria-label="Platz 2 von /);
  assert.match(html, /<b>Platz 2 · [^<]+<\/b>/);
  assert.match(html, /S&amp;P 500 · 6,9 %|S&P 500 · 6,9 %/);
  assert.match(html, /\+12 Reihen/);
  const one = OV.etiketten({ ...NVDA, memberships: NVDA.memberships.filter((x) => x.rowId !== "sector-leaders").slice(0, 2) }, "US_REAL");
  assert.match(one, /\+1 Reihe</, "Einzahl");
});

test("OV12 Aktienkopf C04 (Klickentwurf 17.11.2026): Kurs, Tagesbewegung, darunter Schluss; Chart ohne Kursachse, Datum nur an den Enden", async () => {
  const vm = await import("node:vm");
  class N { constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.textContent = ""; } setAttribute(k, v) { this.attrs[k] = String(v); } appendChild(c) { this.children.push(c); return c; } }
  const context = vm.createContext({ document: { createElementNS: (_ns, tag) => new N(tag) } });
  context.window = context;
  vm.runInContext(readFileSync(new URL("../ui/microchart.js", import.meta.url), "utf8"), context);
  const pts = [["2025-11-05", 190], ["2026-03-01", 170], ["2026-08-01", 230], ["2026-11-06", 186.64]];
  const svg = context.VUDiscover.MicroChart.renderRange(pts, { width: 358, height: 176, range: "1Y", compact: true });
  const texts = (cls) => svg.children.filter((c) => c.tag === "text" && (c.attrs.class || "").split(" ").includes(cls)).map((c) => c.textContent);
  assert.deepEqual(texts("dx-range-axis"), [], "keine Kursachse");
  assert.deepEqual(texts("dx-range-date"), ["05.11.25", "06.11.26"]);
  const voll = context.VUDiscover.MicroChart.renderRange(pts, { width: 358, height: 176, range: "1Y" });
  assert.ok(voll.children.some((c) => (c.attrs.class || "").includes("dx-range-axis")), "ohne compact bleibt die Kursachse");
  const detail = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
  assert.match(detail, /dx-chart-hero dx-chart-hero--c04/);
  assert.match(detail, /compact: !!dollarKopf/);
  assert.match(detail, /title: "zum Vortagesschluss"/, "die Pille ist die Tagesbewegung");
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  assert.match(css, /dx-chart-hero--c04 \.dx-chart-hero-preis>b\{font-size:clamp\(40px,13\.4vw,52px\)/, "Kurs groß wie im Klickentwurf (52 px)");
  assert.match(css, /vu-shead-watch\{display:none\}/, "ein Merken-Knopf im Kopf (Herz), kein zweites Lesezeichen");
});

test("OV13 Überblick startet mit 1J wie im Mockup (auch bei offener Börse); 1T trägt denselben Kopf C04 in Dollar", () => {
  const detail = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
  assert.match(detail, /if \(state\.intraday && !\(loaded && ueberblickUS\(state\)\)\) state\.range = "1D";/);
  assert.match(detail, /ueberblickUS\(state\) && leiste\.some\(function \(r\) \{ return r\.id === "1Y" && r\.available; \}\)\) \{\s*state\.rangeStarted = true; state\.range = "1Y";/);
  const intraday = detail.slice(detail.indexOf("function zeichneIntraday"), detail.indexOf("function staleSatzAusZustand") > 0 ? detail.indexOf("function staleSatzAusZustand") : undefined);
  assert.match(intraday, /dx-chart-hero dx-chart-hero--c04", "data-range": "1D"/);
  assert.match(intraday, /umgerechnet = \{ snap: snapNativ, waehrung: "USD" \}/, "1T im Überblick in Dollar");
});

test("OV14 App-Konzept 2: Story als drei Kacheln mit Grafik aus den Werten der Aktiendatei; ein Tipp öffnet das Kapitel", () => {
  const html = OV.story(NVDA);
  assert.match(html, /class="vu-rail" role="list"/, "Schiene aus dem gemeinsamen Baukasten (VUUI.rail)");
  assert.deepEqual((html.match(/data-ch="[a-z]+"/g) || []), ['data-ch="geschaeft"', 'data-ch="kurs"', 'data-ch="teuer"'], "jede Kachel nennt ihr Kapitel");
  /* Geschäft: Umsatz je Geschäftsjahr als Säulen, die höchste ist 100 % (keine erfundenen Werte) */
  const rev = NVDA.fundamentals.journey.tracks.revenue.filter((x) => Number.isFinite(x.v)).slice(-10), mx = Math.max(...rev.map((x) => x.v));
  const bars = (html.match(/dv3-sg--bars"[^>]*>(.*?)<\/span>/)[1].match(/height:(\d+)%/g) || []).map((x) => Number(x.match(/\d+/)[0]));
  assert.deepEqual(bars, rev.map((x) => Math.max(4, Math.round(Math.max(0, x.v) / mx * 100))));
  /* Kurs: Lage in der Jahresspanne (jahresspanne.position) */
  const p = Math.round(Math.max(0, Math.min(1, NVDA.jahresspanne.position)) * 100);
  assert.match(html, new RegExp('dv3-sg-bar"><i style="width:' + p + '%"></i><b style="left:' + p + '%"></b>'));
  /* Bewertung: KGV und Marktmedian wie im Kapitel „Ist … teuer?“ */
  const v = NVDA.fundamentals.valuation, de = (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  assert.match(html, new RegExp("dv3-sg--pe.*<b>" + de(v.pe.value) + "</b>.*<b>" + de(v.relative.peMedian) + "</b>"));
  const src = readFileSync(new URL("../ui/overview.js", import.meta.url), "utf8");
  assert.match(src, /closest\("\.dv3-ep\[data-ch\], \.dv3-story-r\[data-ch\]"\)[\s\S]{0,260}kapitelFenster\(k, d\)/, "Tipp öffnet das Kapitel als Fenster (Owner 15.11.2026)");
  assert.match(src, /U\(\)\.q\(ks\.length \+ " Kapitel, ein Tipp öffnet eines als Fenster\. Zusammen das, was die Seite bisher untereinander zeigte\."/, "der Satz zu den Kapiteln bleibt erreichbar (hinter „?“)");
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  assert.match(css, /\.dx-range-chart\{height:var\(--dv3-chart-h,184px\)\}/, "Charthöhe wächst mit dem Bildschirm, nie unter 184 px");
  assert.match(css, /max-width:760px\)\{\s*body\.dv2 \.dv2-stock \.dx-chart:has\(\.dx-chart-hero--c04\) \.dx-range-chart-wrap,[^{]*\{margin-inline:-16px\}/, "Chart bis an den Bildschirmrand");
});

test("OV15 Story „Geschäft“ folgt dem Fundamental-Urteil (Klickentwurf 17.11.2026): Regel aus fundamental/app.js#business gelesen", () => {
  const src = readFileSync(new URL("../../fundamental/app.js", import.meta.url), "utf8");
  const obj = (name) => { const i = src.indexOf(name + " = "); return new Function("return " + src.slice(i + name.length + 3, src.indexOf(";", i)))(); };
  assert.deepEqual(OV.F_GRADE, obj("var GRADE_KIND")); assert.deepEqual(OV.F_GROW, obj("var GROW_TXT")); assert.deepEqual(OV.F_PROF, obj("var PROF_TXT"));
  const body = src.slice(src.indexOf("  function business(raw) {"), src.indexOf("  function ttmGrowth"));
  const business = new Function("GRADE_KIND", "GROW_TXT", "PROF_TXT", body + "; return business;")(OV.F_GRADE, OV.F_GROW, OV.F_PROF);
  const raw = (g, p) => ({ fundamentals: { health: { available: true, categories: [{ id: "growth", grade: g }, { id: "profitability", grade: p }] } } });
  for (const [g, p] of [["Stark", "Negativ"], ["Sehr stark", "Solide"], ["Rückläufig", "Sehr stark"], ["Flach", "Knapp"]]) assert.deepEqual(OV.businessVerdict(raw(g, p)), business(raw(g, p)), g + "/" + p);
  /* TTWO 13.11.2026: Wachstum „Stark“, Nettomarge „Negativ“ – Fundamental sagt „▼ Negativ / Wächst und macht Verlust“, die Story-Kachel ebenso. */
  const ttwo = { ...NVDA, fundamentals: { ...NVDA.fundamentals, health: { available: true, categories: [{ id: "growth", grade: "Stark" }, { id: "profitability", grade: "Negativ" }] } } };
  const html = OV.story(ttwo);
  assert.match(html, /<b class="dv3-st-w" data-verdict="weak">Negativ<\/b>/);
  assert.match(html, /<span class="dv3-st-p">Wächst und macht Verlust\. /);
  assert.doesNotMatch(html, /data-verdict="strong">Stark</);
});

test("OV16 Klickentwurf 17.11.2026: Kapitel ohne Bildchen, „Steht in N Reihen“, „Mehr wie …“ und „Gleiches Thema“ mit 12 Monaten", () => {
  const src = readFileSync(new URL("../ui/overview.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /dv3-thumb/, "Kapitel: Nummer im Kreis, keine Bildchen");
  assert.match(src, /U\(\)\.sect\("Steht in " \+ \(m\.length === 1 \? "einer Reihe" : m\.length \+ " Reihen"\)/);
  assert.match(src, /return "Mehr wie " \+ kurz\(d\);/);
  assert.match(src, /return "Gleiches Thema"; \}, function \(d\) \{ var th = themeOf\(d\); return \(th \? th\.title \+ " · " : ""\) \+ "12 Monate"; \}/);
  const page = readFileSync(new URL("../detail.js", import.meta.url), "utf8");
  assert.match(page, /head\.others\.place\(page\);/, "andere Module nach „Alle Kennzahlen“ und „Daten & Methodik“");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8"), html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(app, /if\(parts\[0\]==='s'\)H\.setAttribute\('data-vu-tabs','inhalt'\)/, "Aktienseite ohne Reiterzeile des Rahmens");
  assert.match(html, /else if\(\/\^#\\\/\?s\\\/\/\.test\(location\.hash\)\)h\.setAttribute\("data-vu-tabs","inhalt"\)/, "schon vor dem ersten Zeichnen");
});

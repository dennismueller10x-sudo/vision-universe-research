// Bausteine C04–C20 (assets/vu-ui.js, assets/vu-ui.css) und C06 im Kleinformat (assets/vu-chart.js#sparkline).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const U = require("../../assets/vu-ui.js");
const C = require("../../assets/vu-chart.js");
const css = readFileSync(new URL("../../assets/vu-ui.css", import.meta.url), "utf8");
const nav = readFileSync(new URL("../../assets/site-navigation.css", import.meta.url), "utf8");

test("UI1 C07: Plus neongrüne Pille ▲, Minus schwarze Pille ▼, fehlend „–“", () => {
  assert.match(U.chg(3.12), /class="vu-chg"[^>]*>.*▲.*\+3,12 %/);
  assert.match(U.chg(-4.22), /vu-chg--down.*▼.*−4,22 %/);
  assert.match(U.chg(null), /vu-chg--flat">–</);
});

test("UI2 C08: vier Urteile, Unbekanntes wird „Keine Aussage“", () => {
  for (const [k, t] of [["strong", "Stark"], ["mid", "Mittel"], ["weak", "Schwach"], ["none", "Keine Aussage"]]) assert.match(U.verdict(k), new RegExp(`vu-verdict--${k}.*${t}`));
  assert.match(U.verdict("bogus"), /vu-verdict--none/);
  assert.match(U.verdict("strong", "Sehr stark"), /Sehr stark/);
});

test("UI3 Eingaben werden maskiert", () => {
  const h = U.tile("<u>", "<script>", "\"x\"") + U.help("<img src=x>") + U.stockRow({ ticker: "<T>", name: "<n>" });
  assert.doesNotMatch(h, /<script>|<img|<u>|<T>|<n>/);
});

test("UI4 C04/C05: ohne Kurs kein Kursblock, Perspektiven-Adressen nach N5", () => {
  assert.doesNotMatch(U.stockHead({ ticker: "NVDA", name: "NVIDIA" }), /vu-stockhead__price/);
  const h = U.stockHead({ ticker: "NVDA", name: "NVIDIA", price: 204.64, currency: "USD", changePct: -4.22 }, { active: "quant" });
  assert.match(h, /204,64 \$/);
  assert.match(h, /href="\/quant\/#\/aktie\/NVDA" data-world="quant" aria-current="page"/);
  assert.equal(U.perspectiveHref("technical", "nvda"), "/technical/#/chart/NVDA");
  assert.equal(U.perspectiveHref("supertrader", "NVDA"), "/supertrader/stock/NVDA/");
  assert.equal(U.perspectiveHref("hedgefonds", "NVDA", { cusip: "67066G104" }), "/hedgefonds/#/aktie/67066G104");
  // Die aktive Perspektive steht vorn, die davor liegende links daneben (Mockup).
  const order = [...U.persp("NVDA", { active: "quant" }).matchAll(/data-world="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(order.slice(0, 2), ["fundamental", "quant"]);
  assert.equal(order.length, 7);
});

test("UI5 C06: eine Zeitleiste, Kleinformat ohne erfundene Punkte", () => {
  assert.deepEqual([...C.RANGES], ["1T", "1W", "1M", "1J", "5J", "Max"]);
  assert.equal(C.sparkline([1]), "");
  assert.equal(C.sparkline([1, NaN]), "");
  const s = C.sparkline([1, 2, 3]);
  assert.match(s, /stroke="currentColor"/);
  assert.match(s, /#c8f531/);
  assert.match(U.ranges("1J"), /aria-pressed="true">1J</);
  assert.deepEqual([...U.ranges().matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]), [...C.RANGES], "VUUI und VUChart nennen dieselbe Zeitleiste");
  assert.match(U.stockRow({ ticker: "A", chart: C.sparkline([1, 2, 3]) }), /vu-lrow__mini/);
  assert.doesNotMatch(U.stockRow({ ticker: "A" }), /vu-lrow__mini/);
});

test("UI6 Regel 1: nur Weiß, Schwarz, Neongrün und Graustufen in den Bausteinen", () => {
  const colors = new Set((css.match(/#[0-9a-f]{3,8}\b/gi) || []).map(c => c.toLowerCase()));
  const allowed = new Set(["#fff", "#ffffff", "#000", "#000000", "#c8f531", "#f4f4f4", "#e9e9e9", "#6e6e6e", "#151515", "#262626", "#9b9b9b", "#0e1013", "#4f6b00"]);
  for (const c of colors) assert.ok(allowed.has(c), `Farbe ${c} ist nicht erlaubt`);
});

test("UI6b Etikett auf der Tintenfläche: mindestens 4,5:1 in hell und dunkel, ohne neue Farbe", () => {
  const rule = css.match(/\n:where\(\.vu-box--ink\) \.vu-ltag\{([^}]*)\}/);
  assert.ok(rule, "Regel :where(.vu-box--ink) .vu-ltag fehlt");
  assert.ok(css.indexOf(":where(.vu-box--ink) .vu-ltag{") > css.indexOf("\n.vu-ltag{"), "steht nach der Grundregel .vu-ltag und gewinnt bei gleichem Gewicht");
  assert.doesNotMatch(css, /(^|[\n},])\.vu-box--ink \.vu-ltag\{/, "nie mit dem Gewicht zweier Klassen: sonst dämpft sie zusammen mit den Regeln der Produkte");
  assert.doesNotMatch(rule[1], /var\(--vu-mute\)|#[0-9a-f]{3,8}/i, "kein fester Grauton: das Etikett folgt der Schriftfarbe der Fläche");
  const mix = rule[1].match(/color-mix\(in srgb,currentColor (\d+)%,transparent\)/);
  assert.ok(mix, "gedämpft über color-mix aus currentColor");
  assert.match(rule[1], /color:inherit;color:color-mix/, "Rückfall ohne color-mix: volle Schriftfarbe der Fläche");
  const a = Number(mix[1]) / 100, lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const ratio = (fg, bg) => { const m = a * fg + (1 - a) * bg, l1 = lin(m), l2 = lin(bg); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  // hell: weiße Schrift auf schwarzer Fläche; dunkel: schwarze Schrift auf weißer Fläche (--vu-ink/--vu-inv)
  assert.ok(ratio(1, 0) >= 4.5, "hell " + ratio(1, 0).toFixed(2));
  assert.ok(ratio(0, 1) >= 4.5, "dunkel " + ratio(0, 1).toFixed(2));
  console.log("UI6b Kontrast hell " + ratio(1, 0).toFixed(2) + ":1, dunkel " + ratio(0, 1).toFixed(2) + ":1");
  /* Keine doppelte Dämpfung: jede Regel eines Produkts, die ein Etikett über opacity dämpft, setzt auch die Farbe und wiegt
     mindestens zwei Klassen - sie ersetzt die Regel oben also ganz (Quant lädt app.css vor vu-ui.css). */
  const walk = (dir, out = []) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith(".") || ["node_modules", "docs", "data"].includes(e.name)) continue; const f = dir + "/" + e.name; if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".css")) out.push(f); } return out; };
  const root = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
  let geprueft = 0;
  for (const f of walk(root)) for (const m of readFileSync(f, "utf8").matchAll(/([^{}]*\.vu-ltag[^{}]*)\{([^}]*opacity[^}]*)\}/g)) {
    geprueft++;
    assert.match(m[2], /(^|;)\s*color:/, f + ": " + m[1].trim() + " dämpft über opacity, ohne die Farbe zu setzen");
    for (const sel of m[1].split(",").filter((x) => x.includes(".vu-ltag"))) assert.ok((sel.replace(/:where\([^)]*\)/g, "").match(/\.[a-zA-Z_-]/g) || []).length >= 2, f + ": " + sel.trim() + " wiegt weniger als zwei Klassen");
  }
  assert.ok(geprueft >= 5, "Regeln der Produkte gefunden: " + geprueft);
});

test("UI7 Regel 1: keine Kursfarben Rot/Grün in den gemeinsamen Tokens", () => {
  const root = nav.slice(nav.indexOf("--vu-up"), nav.indexOf("--vu-gutter"));
  assert.doesNotMatch(root, /#1a7330|#b8281f|#5cc850|#e4382f/);
  assert.doesNotMatch(nav, /--vu-up:#5cc850|--vu-down:#ff6b5e/);
});

test("UI8 Bausteine C04–C20 liegen nicht in der Navigationsdatei", () => {
  assert.doesNotMatch(nav, /\.vu-verdict|\.vu-stockhead|\.vu-lrow|\.vu-navcard/);
  for (const k of ["vu-stockhead", "vu-persp", "vu-chg", "vu-verdict", "vu-help", "vu-lrow", "vu-tile", "vu-navcard", "vu-sect", "vu-seg", "vu-switch", "vu-sheet-ui", "vu-meter", "vu-bars", "vu-blank", "vu-pro", "vu-find"]) assert.ok(css.includes("." + k), k);
});

test('E5 screenreader labels preserve integer counts, percentages and percentage points',()=>{
 assert.equal(U.movementLabel('+15'),'Plus 15');
 assert.equal(U.movementLabel('−29'),'Minus 29');
 assert.equal(U.movementLabel('▲ +45,7 % p. a.'),'Plus 45,7 Prozent pro Jahr');
 assert.equal(U.movementLabel('▼ −1,2 Pp.'),'Minus 1,2 Prozentpunkte');
 assert.equal(U.movementLabel('–'),'Keine Angabe');
});

// App-Konzept 2 (Owner-Freigabe 14.11.2026): Kachel, Schiene, Grafiken, „Weiter“-Karte, Fenster.
test("K1 Bausteine des App-Konzepts 2: Markup, Maskierung und leere Werte", () => {
  for (const k of ["tap", "stat", "stats", "rail", "ring", "gauge", "delta", "diverge", "heat", "radar", "next", "popup", "bindPops"]) assert.equal(typeof U[k], "function", k);
  for (const k of ["vu-tap", "vu-stat", "vu-stats", "vu-rail", "vu-ring", "vu-gauge", "vu-delta", "vu-div", "vu-heat", "vu-radar", "vu-next", "vu-sheet-grab", "vu-night"]) assert.ok(css.includes("." + k), k);
  assert.match(U.tap("<b>x</b>", { href: "/quant/" }), /^<a class="vu-tap" href="\/quant\/"><b>x<\/b><\/a>$/);
  assert.match(U.tap("", { pop: "t1", popTitle: 'A"B' }), /^<button class="vu-tap" type="button" aria-haspopup="dialog" data-vu-pop="t1" data-vu-pop-title="A&quot;B">/);
  assert.match(U.stat(null, "<neu>", { href: "#/x" }), /vu-stat__v vu-num">–<\/b><span class="vu-stat__l">&lt;neu&gt;/);
  assert.match(U.stats([{ value: "37 %", label: "über der Linie", tone: "lime" }]), /role="list"><div role="listitem" class="is-lime"><b class="vu-num">37 %<\/b>/);
  assert.equal((U.rail(["a", "b"], { label: "Stile" }).match(/role="listitem"/g) || []).length, 2);
  assert.match(U.next({ title: "Supertrader", href: "/supertrader/" }), /^<a class="vu-next" href="\/supertrader\/">.*>Weiter<\/span><b>Supertrader<\/b>/);
});
test("K2 Grafiken zeichnen nur übergebene Werte", () => {
  assert.match(U.ring(71), /aria-label="Anteil 71 %"/);
  assert.doesNotMatch(U.ring(null), /is-on/, "ohne Wert kein Bogen");
  assert.match(U.ring(null), />–<\/b>/);
  assert.match(U.gauge(36.6, { text: "37 %", label: "Anteil über der 200-Tage-Linie" }), /aria-label="Anteil über der 200-Tage-Linie 37 %".*<b class="vu-num">37 %<\/b>/);
  assert.doesNotMatch(U.gauge(undefined), /is-on/);
  assert.match(U.delta(71, 53, { label: "Kurs lief gut" }), /class="vu-delta is-down" role="img" aria-label="Kurs lief gut: von 71 auf 53"/);
  assert.match(U.delta(66, 78), /is-up.*width:66%.*left:66%;width:12%/);
  assert.equal(U.delta(null, 5), "", "ohne Vorher-Wert keine Grafik");
  const d = U.diverge([{ label: "A", value: 1.4 }, { label: "B", value: -0.7 }, { label: "C", value: null }]);
  assert.equal((d.match(/role="listitem"/g) || []).length, 2, "Zeilen ohne Wert entfallen");
  assert.match(d, /is-up" style="width:50\.0%".*\+1,4.*is-down" style="width:25\.0%".*−0,7/);
  assert.equal(U.diverge([]), "");
  const h = U.heat([{ label: "NVDA" }, { label: "AMD" }], [{ label: "Verdient gut", values: [99, null], hrefs: ["#/aktie/NVDA"] }]);
  assert.match(h, /<a class="vu-heat__c vu-num is-hi" role="cell" style="--a:100" href="#\/aktie\/NVDA">99<\/a><span class="vu-heat__c vu-num is-na" role="cell" style="--a:0">–<\/span>/);
  assert.equal(U.radar([1, 2]), "", "ein Netz braucht mindestens drei Achsen");
  assert.match(U.radar([99, 86, null], { names: ["A", "B", "C"], label: "Profil" }), /aria-label="Profil: A 99, B 86, C –"/);
});
test("K3 Fenster: Griff, Dialogrolle, Fokusfalle und Sperre stehen im gemeinsamen Baustein", () => {
  const js = readFileSync(new URL("../../assets/vu-ui.js", import.meta.url), "utf8");
  assert.match(U.sheet("s1", "Titel", ""), /class="vu-sheet-ui" role="dialog" aria-modal="true" tabindex="-1" aria-label="Titel"/);
  for (const k of ["vu-sheet-grab", "vu-sheet-open", 'e.key === "Escape"', 'e.key !== "Tab"', "__vuReturn", "vu-sheet-close"]) assert.ok(js.includes(k), k);
  assert.match(css, /html\.vu-sheet-open\{overflow:hidden\}/);
  assert.match(css, /@media\(min-width:761px\)\{\s*\.vu-sheet-backdrop:not\(\.vu-gesture-sheet\)\{align-items:center/);
});

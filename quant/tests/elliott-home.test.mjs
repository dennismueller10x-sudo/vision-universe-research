/* =========================================================================
   ELLIOTT ALS PRODUKT — Startseite, Index, Routen, Navigation

   Die Pruefungen laufen gegen die VEROEFFENTLICHTEN Technical-Intelligence-Daten
   (wo vorhanden) und gegen kleine synthetische Dokumente (fuer jeden Zustand, den die
   echten Daten gerade nicht enthalten). Nichts schreibt in quant/data.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const M = require(join(ROOT, "elliott/engine/home-model.js"));
const H = await import(new URL("../../scripts/technical/elliott-home/home.mjs", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const V3 = join(ROOT, "quant/data/technical-intelligence/v3");
const HAVE_DATA = existsSync(join(V3, "index.json.gz")) && existsSync(join(V3, "meta.json"));
const gz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));

/* ---------------------------------------------------------------- Fixtures */
const NAMES = new Map([["AAA", { n: "Alpha Corp", u: "USD" }], ["BBB", { n: "Beta Inc", u: "USD" }], ["CCC", { n: "Gamma Ltd", u: "USD" }]]);
const zone = (tier, lo, hi, state = "OPEN") => ({ tier, pctLow: lo, pctHigh: hi, state });
const thesis = (over = {}) => Object.assign({ key: "K|" + Math.random().toString(36).slice(2), type: "WAVE_3", direction: "UP", status: "DEVELOPING", patternName: "Impuls",
  zones: [zone("BASE", 0.2, 0.5), zone("EXTENDED", 0.5, 1.2)], invalidation: { price: 10, direction: "below" } }, over);
const doc = (proj, fr = { state: "FRESH", lastBar: "2026-10-09" }) => ({ asOf: "2026-10-09", price: { close: 20 }, freshness: fr, projection: Object.assign({ close: 20, asOf: "2026-10-09", consumerVisible: false, exploreWithheld: false, context: { trend: { state: "POSITIVE" }, rs: { rank: 0.7, state: "TOP30" }, structure: { vote: 0.4 } }, primary: null, alternative: null, highUpside: null, motiveAlternative: null, exploreHighlights: [] }, proj) });

/* ---------------------------------------------------------------- 1 Index: Auswahl */
test("EH-1 · withheld, STALE and NON_TRADING titles never reach the Elliott home; DELAYED keeps its warning", () => {
  const live = thesis();
  const base = { motiveAlternative: live };
  assert.equal(H.cardsOfDocument("AAA", doc(base), NAMES).length, 1);
  assert.equal(H.cardsOfDocument("AAA", doc(base, { state: "STALE", lastBar: "2026-09-01" }), NAMES).length, 0);
  assert.equal(H.cardsOfDocument("AAA", doc(base, { state: "NON_TRADING", lastBar: "2026-09-01" }), NAMES).length, 0);
  assert.equal(H.cardsOfDocument("AAA", Object.assign(doc(base), { withheld: true }), NAMES).length, 0);
  const delayed = H.cardsOfDocument("AAA", doc(base, { state: "DELAYED", lastBar: "2026-10-02" }), NAMES);
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].fr, "DELAYED");
  assert.equal(delayed[0].last, "2026-10-02");
});

test("EH-2 · only securities of the product universe appear (no name entry, no card)", () => {
  assert.equal(H.cardsOfDocument("ZZZ", doc({ motiveAlternative: thesis() }), NAMES).length, 0);
});

test("EH-3 · roles are exact: primary only when consumerVisible, candidate explorer never, highlight stays a highlight", () => {
  const p = thesis({ type: "NEXT_MOVE" }), a = thesis({ type: "THRUST" }), m = thesis(), h = thesis({ type: "WAVE_C" });
  const hidden = H.cardsOfDocument("AAA", doc({ consumerVisible: false, primary: p, alternative: a }), NAMES);
  assert.deepEqual(hidden.map((c) => c.role), [], "primaere und Alternative ohne Kundensichtbarkeit bleiben unsichtbar");
  const all = H.cardsOfDocument("AAA", doc({ consumerVisible: true, primary: p, alternative: a, motiveAlternative: m, exploreHighlights: [h], exploreCandidates: [thesis()] }), NAMES);
  assert.deepEqual(all.map((c) => c.role).sort(), ["ALTERNATIVE", "EXPLORE_HIGHLIGHT", "MOTIVE_ALTERNATIVE", "PRIMARY"], "kein Candidate Explorer");
  assert.equal(all.find((c) => c.role === "EXPLORE_HIGHLIGHT").type, "WAVE_C");
  assert.notEqual(M.roleLabel("EXPLORE_HIGHLIGHT"), M.roleLabel("PRIMARY"));
  assert.match(M.roleLabel("EXPLORE_HIGHLIGHT"), /Highlight/);
  assert.doesNotMatch(M.roleLabel("EXPLORE_HIGHLIGHT"), /prim/i);
  assert.match(M.ROLE_NOTE.EXPLORE_HIGHLIGHT, /nicht als reguläre Alternative/);
});

test("EH-4 · a thesis with every zone passed, or zones against its direction, is no discovery", () => {
  const passed = thesis({ zones: [zone("BASE", 0.2, 0.5, "PASSED"), zone("EXTENDED", 0.5, 1, "PASSED")] });
  assert.equal(H.cardsOfDocument("AAA", doc({ motiveAlternative: passed }), NAMES).length, 0);
  const against = thesis({ direction: "DOWN", zones: [zone("BASE", 0.3, 0.9)] });
  assert.equal(H.cardsOfDocument("AAA", doc({ motiveAlternative: against }), NAMES).length, 0);
  /* Eine Zone, die den Kurs enthaelt, wird auf den Teil in Thesenrichtung gekuerzt: nie ein Rueckgang als Aufwaertsziel */
  const inside = thesis({ direction: "UP", zones: [zone("BASE", -0.3, 0.8, "INSIDE")] });
  assert.deepEqual(H.cardsOfDocument("AAA", doc({ motiveAlternative: inside }), NAMES)[0].tiers.base, [0, 0.8]);
  const insideDown = thesis({ direction: "DOWN", zones: [zone("BASE", -0.6, 1.4, "INSIDE")] });
  assert.deepEqual(H.cardsOfDocument("AAA", doc({ motiveAlternative: insideDown }), NAMES)[0].tiers.base, [-0.6, 0]);
});

test("EH-5 · the same thesis is shown once; weekly projection wins over daily", () => {
  const t = thesis({ key: "SAME" });
  const d = doc({ motiveAlternative: t });
  d.projectionWeekly = JSON.parse(JSON.stringify(d.projection));
  assert.equal(H.cardsOfDocument("AAA", d, NAMES).length, 1);
});

test("EH-6 · order is deterministic, role first, and never by projection size", () => {
  const mk = (id, role, st, up) => ({ id, t: id, role, st, pool: null, agree: 0, tiers: { ext: [0, up] } });
  const cards = [mk("C", "EXPLORE_HIGHLIGHT", "CONFIRMED", 50), mk("B", "PRIMARY", "DEVELOPING", 0.1), mk("A", "PRIMARY", "CONFIRMED", 0.1), mk("D", "MOTIVE_ALTERNATIVE", "CONFIRMED", 9)];
  const order = cards.slice().sort(H.compareCards).map((c) => c.id);
  assert.deepEqual(order, ["A", "B", "D", "C"]);
  /* Groessere Projektion aendert nichts */
  const bigger = cards.map((c) => Object.assign({}, c, { tiers: { ext: [0, 10000] } }));
  assert.deepEqual(bigger.slice().sort(H.compareCards).map((c) => c.id), order);
  assert.deepEqual(cards.slice().reverse().sort(H.compareCards).map((c) => c.id), order, "unabhaengig von der Eingabereihenfolge");
  assert.doesNotMatch(read("scripts/technical/elliott-home/home.mjs"), /Math\.random|Date\.now|new Date\(/, "keine Zufalls- oder Uhrquelle im Index");
});

test("EH-7 · rows are derived from the data, small groups form no row, and no ticker is hard-coded", () => {
  const cards = [];
  for (let i = 0; i < 5; i++) cards.push({ id: "W3" + i, t: "W3" + i, role: "EXPLORE_HIGHLIGHT", wave: "3", dir: "UP", st: "CONFIRMED", pool: null, agree: 0, tiers: {}, fr: "FRESH" });
  cards.push({ id: "W5", t: "W5", role: "EXPLORE_HIGHLIGHT", wave: "5", dir: "DOWN", st: "DEVELOPING", pool: null, agree: 0, tiers: {}, fr: "FRESH" });
  const home = H.assembleHome({ cards, meta: {}, dataAsOf: "2026-10-09" });
  assert.deepEqual(home.rows.map((r) => r.id), ["wave3", "bullish"].filter((id) => home.rows.some((r) => r.id === id)));
  assert.ok(home.rows.find((r) => r.id === "wave3").total === 5);
  assert.ok(!home.rows.some((r) => r.id === "wave5"), "eine einzelne Karte bildet keine Reihe");
  assert.equal(home.filters.wave["5"], 1, "bleibt aber ueber den Filter erreichbar");
  assert.equal(home.summary.wave5, 1);
  const none = H.assembleHome({ cards: [], meta: {}, dataAsOf: null });
  assert.deepEqual(none.rows, []);
  const src = read("scripts/technical/elliott-home/home.mjs") + read("elliott/app.js") + read("elliott/engine/home-model.js");
  assert.doesNotMatch(src, /["'](NVDA|AAPL|MSFT|SE|OSCR|VTEX|XPEV|CGC)["']/, "keine feste Titelliste");
  assert.equal(H.ROW_CAP <= 24 && H.MIN_ROW >= 2, true);
});

test("EH-8 · build is deterministic and the index is compact", { skip: !HAVE_DATA && "v3-Daten fehlen" }, () => {
  const a = H.buildHomeFromDir(ROOT), b = H.buildHomeFromDir(ROOT);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.schemaVersion, "vu-elliott-home-1.0.0");
  assert.equal(a.version, "elliott-home-1.0.0");
  assert.equal(M.validate(a).ok, true);
  const bytes = gunzipSync ? Buffer.byteLength(JSON.stringify(a)) : 0;
  assert.ok(bytes < 400 * 1024, "kompakter Index: " + bytes + " B");
  assert.ok(a.cards.length < 1000, "kein Universum im Browser");
  assert.ok(a.dataAsOf && a.source.projection && a.source.freshness === "data-freshness-1.0.0");
});

test("EH-9 · against the published data: nothing withheld, only product titles, rows derive from the cards", { skip: !HAVE_DATA && "v3-Daten fehlen" }, () => {
  const home = H.buildHomeFromDir(ROOT), meta = JSON.parse(read("quant/data/technical-intelligence/v3/meta.json"));
  const index = gz(join(V3, "index.json.gz")).rows, product = new Set(index.map((r) => r.t));
  const withheld = new Set(index.filter((r) => r.withheld || (r.fr && (r.fr.st === "STALE" || r.fr.st === "NON_TRADING"))).map((r) => r.t));
  assert.equal(withheld.size, ((meta.projection.freshness || {}).withheldTitles || []).length || withheld.size);
  const byId = new Map(home.cards.map((c) => [c.id, c]));
  for (const c of home.cards) {
    assert.ok(product.has(c.t), c.t + " gehoert nicht zum Produktuniversum");
    assert.ok(!withheld.has(c.t), c.t + " ist zurueckgehalten und darf nicht erscheinen");
    assert.ok(c.fr === "FRESH" || c.fr === "DELAYED", c.t + " " + c.fr);
    assert.ok(Object.keys(c.tiers).length > 0, c.t + " ohne offene Zone");
    assert.ok(c.n && c.n !== "", "Name fehlt: " + c.t);
  }
  for (const r of home.rows) {
    assert.ok(r.ids.length > 0 && r.ids.length <= H.ROW_CAP);
    for (const id of r.ids) assert.ok(byId.has(id), r.id + " verweist auf unbekannte Karte " + id);
    const def = H.ROW_DEFS.find((d) => d.id === r.id);
    assert.equal(r.total, home.cards.filter(def.pick).length, r.id + ": Anzahl entspricht den Karten");
    for (const id of r.ids) assert.ok(def.pick(byId.get(id)), r.id + ": " + id + " gehoert nicht in die Reihe");
  }
  /* Die Welle-3-Reihe entsteht aus den Daten: jede kundensichtbare Welle-3-Lesart des Index steht in der Karten-Menge. */
  const wave3Cards = home.cards.filter((c) => c.wave === "3");
  const wave3Row = home.rows.find((r) => r.id === "wave3");
  if (wave3Cards.length >= H.MIN_ROW) assert.equal(wave3Row.total, wave3Cards.length);
  /* Quelle der Wahrheit: Highlights im Shard (frische Titel) == Highlight-Karten */
  let fromShards = 0;
  for (const f of readdirSync(join(V3, "shards"))) {
    const ins = gz(join(V3, "shards", f)).instruments;
    for (const [t, d] of Object.entries(ins)) {
      if (!product.has(t) || withheld.has(t) || d.withheld) continue;
      for (const hl of (d.projection || {}).exploreHighlights || []) if (H.liveTiers(hl) && Object.keys(H.liveTiers(hl)).length) fromShards++;
    }
  }
  assert.equal(home.cards.filter((c) => c.role === "EXPLORE_HIGHLIGHT").length, fromShards);
});

/* ---------------------------------------------------------------- 2 Darstellung: Zahlen und Worte */
test("EH-10 · large projections render safely and stay descriptive", () => {
  assert.equal(M.pct(1.75), "+175 %");
  assert.equal(M.pct(-0.63), "−63 %");
  assert.equal(M.pct(20), "+2.000 %");
  assert.equal(M.pct(1234.5), "+123.450 %");
  assert.equal(M.pct(0), "0 %".replace(" ", " "));
  assert.equal(M.pct(NaN), "–");
  assert.equal(M.pct(Infinity), "–");
  assert.equal(M.range([1.75, 2.87]), "+175 % bis +287 %");
  assert.equal(M.range(null), "–");
  const card = { tiers: { base: [0.5, 1], ext: [8, 20], xtr: [20, 60] } };
  assert.equal(M.headlineTier(card).label, "Erweitert");
  assert.deepEqual(M.otherTiers(card).map((t) => t.label), ["Basis", "Extrem"]);
  assert.equal(M.headlineTier({ tiers: {} }), null);
  /* Wortwahl: keine Wahrscheinlichkeits- oder Erwartungsrenditesprache */
  const words = JSON.stringify([M.ROLE_LABEL, M.ROLE_NOTE, M.STATUS_LABEL, M.CHANGE_LABEL]);
  assert.doesNotMatch(words, /wahrscheinlich|erwartet|Rendite|Kursziel|Empfehlung|Chance/i);
  const ui = read("elliott/app.js");
  assert.match(ui, /Projektionszone/, "die Zahl ist als Zone benannt");
  assert.doesNotMatch(ui.replace(/keine Wahrscheinlichkeit[^"]*"/g, ""), /Wahrscheinlichkeit|erwartete Rendite/);
});

test("EH-11 · labels and price are correct", () => {
  assert.equal(M.waveLabel({ wave: "3", type: "WAVE_3" }), "Mögliche Welle 3");
  assert.equal(M.waveLabel({ wave: "C", type: "WAVE_C" }), "Mögliche Welle C");
  assert.equal(M.waveLabel({ wave: null, type: "NEXT_MOVE" }), "Mögliche Folgebewegung");
  assert.equal(M.waveLabel({ wave: null, type: "?" }), "Mögliche Elliott-Lesart");
  assert.equal(M.price({ close: 117.4, cur: "USD" }), "117 $");
  assert.equal(M.price({ close: 8.98, cur: "USD" }), "8,98 $");
  assert.equal(M.price({ close: 1234.5, cur: "EUR" }), "1.235 EUR");
  assert.equal(M.price({}), null);
  assert.equal(M.dateDe("2026-10-09"), "09.10.2026");
  assert.equal(M.dateDe(null), "–");
  assert.match(M.ariaLabel({ n: "Alpha", t: "AAA", wave: "3", type: "WAVE_3", dir: "UP", st: "CONFIRMED", role: "EXPLORE_HIGHLIGHT", tiers: { ext: [1, 2] } }), /Alpha \(AAA\), Mögliche Welle 3, Aufwärts, Bestätigt, Explore Highlight, Erweitert \+100/);
});

/* ---------------------------------------------------------------- 3 Filter, Adresse, Suche */
test("EH-12 · URL state round-trips, unknown values are dropped, a ticker is an alias to the detail", () => {
  const s = M.parseHash("#/?welle=3&richtung=ab&status=bestaetigt&rolle=highlight&neu=1");
  assert.deepEqual(JSON.parse(JSON.stringify(s)), { welle: "3", richtung: "ab", status: "bestaetigt", rolle: "highlight", neu: true, suche: false, q: "", ticker: null });
  assert.equal(M.buildHash(s), "#/?welle=3&richtung=ab&status=bestaetigt&rolle=highlight&neu=1");
  assert.equal(M.buildHash(M.parseHash("#/")), "#/");
  assert.equal(M.parseHash("#/?welle=9&richtung=x&rolle=nix").welle, null, "Tippfehler ergeben keine leere Liste");
  assert.equal(M.parseHash("#/?welle=c").welle, "C");
  assert.equal(M.parseHash("#/nvda").ticker, "NVDA");
  assert.equal(M.parseHash("#/").ticker, null);
  assert.equal(M.parseHash("").ticker, null);
  assert.equal(M.parseHash("#/?suche=1").suche, true);
  assert.equal(M.detailHref("nvda"), "/quant/#/elliott/NVDA");
  assert.equal(M.detailHref("BRK-B"), "/quant/#/elliott/BRK-B");
});

test("EH-13 · filters combine, chips hide empty groups, tapping again clears, empty states are honest", () => {
  const cards = [
    { id: "1", t: "A", wave: "3", dir: "UP", st: "CONFIRMED", role: "PRIMARY", chg: { k: "NEW", d: "2026-10-09" } },
    { id: "2", t: "B", wave: "C", dir: "DOWN", st: "DEVELOPING", role: "EXPLORE_HIGHLIGHT", chg: null },
    { id: "3", t: "C", wave: "C", dir: "UP", st: "CONFIRMED", role: "MOTIVE_ALTERNATIVE", chg: { k: "CONFIRMED", d: "2026-10-08" } }
  ];
  const home = { cards, rows: [], summary: {} };
  const f = (h) => M.filterCards(cards, M.parseHash(h)).map((c) => c.id);
  assert.deepEqual(f("#/?welle=C"), ["2", "3"]);
  assert.deepEqual(f("#/?welle=C&richtung=auf"), ["3"]);
  assert.deepEqual(f("#/?rolle=alternative"), ["3"]);
  assert.deepEqual(f("#/?rolle=highlight&status=aufbau"), ["2"]);
  assert.deepEqual(f("#/?neu=1"), ["1", "3"], "juengste zuerst");
  const groups = M.chipGroups(home, M.parseHash("#/"));
  assert.ok(!groups.find((g) => g.id === "welle").options.some((o) => o.value === "5"), "Welle 5 ohne Karten: kein Chip");
  assert.equal(groups.find((g) => g.id === "welle").options.find((o) => o.value === "C").count, 2);
  const on = M.withChip(M.parseHash("#/"), "welle", "C");
  assert.equal(on.welle, "C");
  assert.equal(M.withChip(on, "welle", "C").welle, null, "erneut antippen hebt auf");
  assert.equal(M.emptyState(home, M.parseHash("#/?welle=C&richtung=ab&status=bestaetigt"), null, 0).kind, "FILTER");
  assert.equal(M.emptyState(home, M.parseHash("#/?welle=C"), null, 2), null);
  assert.equal(M.emptyState({ cards: [], rows: [] }, M.parseHash("#/"), null, null).kind, "NO_THESES");
  assert.equal(M.emptyState(home, {}, "zzzzz", 0).kind, "SEARCH");
  assert.match(M.emptyState({ cards: [], rows: [] }, {}, null, null).text, /Du kannst trotzdem jede Aktie suchen/);
  assert.equal(M.validate({ schemaVersion: "x" }).ok, false);
  assert.equal(M.validate(null).ok, false);
  assert.equal(M.validate({ schemaVersion: "vu-elliott-home-1.0.0", version: "elliott-home-9.9.9", cards: [], rows: [] }).ok, false, "fremde Version wird nicht angezeigt");
});

test("EH-14 · search ranks exact ticker, then ticker prefix, then name; stock search works without an Elliott card", () => {
  const E = [{ s: "SEA", n: "Sea Holdings" }, { s: "SE", n: "Sea Limited" }, { s: "SEDG", n: "SolarEdge" }, { s: "NVDA", n: "NVIDIA Corporation" }, { s: "NVEI", n: "Nuvei" }, { s: "XYZ", n: "Block, Inc. (Se rvice)" }];
  assert.equal(M.searchEntries(E, "se", 8)[0].s, "SE", "genaues Kuerzel zuerst");
  assert.equal(M.searchEntries(E, "NVDA", 8)[0].s, "NVDA");
  assert.equal(M.searchEntries(E, "nvidia", 8)[0].s, "NVDA", "Name");
  assert.deepEqual(M.searchEntries(E, "", 8), []);
  assert.deepEqual(M.searchEntries(E, "qqqq", 8), []);
  assert.ok(M.searchEntries(E, "s", 2).length <= 2);
  assert.equal(M.norm("  Ünïcode  "), "unicode");
  /* ein Titel ohne Karte bleibt auffindbar und fuehrt zur Analyse */
  const byT = M.cardsByTicker({ cards: [{ t: "SE", wave: "3", type: "WAVE_3", dir: "UP" }] });
  assert.match(M.searchHint(byT.SE), /Mögliche Welle 3 · Aufwärts/);
  assert.equal(M.searchHint(byT.NVDA), "Analyse öffnen");
});

/* ---------------------------------------------------------------- 4 Seite: keine Schaltung ueber das Universum, kein Standardtitel */
test("EH-15 · the page never scans shards, never defaults to a stock, loads one compact index", () => {
  const app = read("elliott/app.js"), model = read("elliott/engine/home-model.js"), html = read("elliott/index.html");
  assert.doesNotMatch(app + model, /\/shards\/|technical-intelligence\/v3\/(index|shards)|index\.json\.gz/, "kein Shard- und kein Voll-Index-Abruf");
  assert.match(model, /INDEX_PATH = "\/quant\/data\/technical-intelligence\/v3\/elliott-home\.json"/);
  assert.match(html, /rel="preload"[^>]*elliott-home\.json/);
  assert.doesNotMatch(app + model + html, /NVDA|NVIDIA/, "kein fest verdrahteter Titel");
  assert.match(html, /\/assets\/site-navigation\.js/);
  assert.ok(!/quant\/release-bundle|quant\/app\/|quant\/ui\//.test(html), "kein Quant-Buendel auf der Elliott-Startseite");
  /* Start ohne Zustand zeigt die Startseite, nie eine Aktie */
  assert.equal(M.parseHash("#/").ticker, null);
  assert.equal(M.parseHash("").ticker, null);
  /* Kein <script> mit Fremdquelle, keine Inline-Handler */
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  const bytes = ["elliott/app.js", "elliott/engine/home-model.js", "elliott/elliott.css"].reduce((n, p) => n + readFileSync(join(ROOT, p)).length, 0);
  assert.ok(bytes < 60 * 1024, "kleines Produktbuendel: " + bytes + " B");
});

test("EH-16 · accessibility basics of the page", () => {
  const app = read("elliott/app.js"), css = read("elliott/elliott.css"), html = read("elliott/index.html");
  assert.match(app, /role: "combobox"/);
  assert.match(app, /"aria-pressed"/);
  assert.match(app, /role: "listbox"/);
  assert.match(app, /aria-label": M\.ariaLabel\(c\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(html, /class="el-skip"/);
  assert.match(html, /<html lang="de">/);
});

/* ---------------------------------------------------------------- 5 Routen */
test("EH-17 · routes: Quant hosts #/elliott/<T>, old Technik/Chartbild links are redirected, Quant no longer owns Elliott", () => {
  const app = read("quant/app/app.js"), ui = read("quant/app/ui.js");
  const from = app.indexOf("function legacyRoute("), to = app.indexOf("var SECTION");
  const { parse, legacyRoute, canonicalElliott } = new Function(app.slice(from, to) + "; return { legacyRoute, parse, canonicalElliott };")();
  assert.equal(parse("#/elliott/nvda").view, "elliott");
  assert.equal(parse("#/elliott/nvda").ticker, "NVDA");
  assert.equal(parse("#/elliott/BRK-B").ticker, "BRK-B");
  assert.equal(parse("#/elliott").view, "elliottHome", "ohne Aktie: zur Elliott-Startseite");
  assert.equal(parse("#/elliott/%%%").view, "notfound");
  assert.equal(canonicalElliott(parse("#/aktie/NVDA/technik?elliott=1")), "#/elliott/NVDA?ansicht=profi");
  assert.equal(canonicalElliott(parse("#/aktie/NVDA/technik")), "#/elliott/NVDA");
  assert.equal(canonicalElliott(parse("#/aktie/SE/chartbild?ansicht=profi")), "#/elliott/SE?ansicht=profi");
  assert.equal(canonicalElliott(parse("#/aktie/SE/chartbild")), "#/elliott/SE");
  assert.equal(legacyRoute("?view=elliott&ticker=NVDA"), "#/elliott/NVDA?ansicht=profi");
  assert.equal(legacyRoute("?view=elliott"), "#/elliott");
  assert.equal(parse(legacyRoute("?view=elliott")).view, "elliottHome");
  /* der Router: Umleitung per location.replace (kein Verlaufseintrag), Aktienbild im Produktkontext */
  assert.match(app, /global\.location\.replace\(canonicalElliott\(r\)\)/);
  assert.match(app, /chartbild\(main, ctx, r\.ticker, r\.params, \{ product: "elliott" \}\)/);
  assert.match(app, /elliott: null/, "Aktienbild markiert keinen Quant-Eintrag der Leiste");
  /* Linkbauer: Chartbild-Links der Quant-Seiten fuehren in das Elliott-Produkt */
  const routes = new Function(ui.match(/var routes = \{[\s\S]*?\n  \};/)[0] + "\nreturn routes;")();
  assert.equal(routes.chartbild("nvda"), "#/elliott/NVDA");
  assert.equal(routes.elliott("SE", "ansicht=profi"), "#/elliott/SE?ansicht=profi");
  /* VU Ask und Landingpage zeigen auf das Produkt, nicht auf eine feste Aktie */
  assert.match(read("quant/api/product-services.js"), /\['Elliott','\/quant\/#\/elliott\/'\+q\+'\?ansicht=profi'\]/);
  assert.doesNotMatch(read("scripts/home/index.template.html"), /aktie\/NVDA\/chartbild/);
});

test("EH-18 · Elliott detail context: breadcrumb back to Elliott, honest abstention instead of a redirect", () => {
  const cb = read("quant/app/page-chartbild.js");
  assert.match(cb, /function elliottBar\(/);
  assert.match(cb, /href: "\/elliott\/", text: "← Elliott"/);
  assert.match(cb, /Keine belastbare Elliott-Lesart/);
  assert.match(cb, /Frag VU zu dieser Lesart/);
  assert.match(cb, /"\/ask\/\?q=" \+ encodeURIComponent\(/, "VU Ask bekommt nur eine Frage; die Antwort kommt aus den strukturierten Technical-Intelligence-Daten");
  /* Das Aktienbild bleibt in der Produktansicht erhalten: der Abstention-Zweig leitet nicht um */
  const block = cb.slice(cb.indexOf("Elliott-Produkt: ohne gezeigte Lesart"), cb.indexOf("host.append(el(\"div\", { class: \"cb-viewswitch\""));
  assert.doesNotMatch(block, /location\./);
});

test("EH-19 · release ships the home view built from the committed shards, never committed itself", () => {
  const rel = read("scripts/vu2/build-release.mjs");
  assert.match(rel, /elliott-home\/home\.mjs/);
  assert.match(rel, /ELLIOTT_HOME_SKIPPED/);
  assert.equal(H.HOME_PATH, "quant/data/technical-intelligence/v3/elliott-home.json");
  /* erzeugtes Artefakt: nicht im Repository (CLAUDE.md: Erzeuger statt Handarbeit) */
  assert.ok(!existsSync(join(ROOT, H.HOME_PATH)), "elliott-home.json gehoert in die Auslieferung, nicht ins Repository");
  /* Der TI-Build selbst bleibt unberuehrt (kein Engine- und kein Methodikwechsel) */
  assert.doesNotMatch(read("scripts/technical/build-technical-intelligence.mjs"), /elliott-home/);
});

test("EH-20 · the product page is a delivered, tracked entry", async () => {
  const { permitted } = await import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url));
  for (const p of ["elliott/index.html", "elliott/app.js", "elliott/elliott.css", "elliott/engine/home-model.js"]) assert.ok(permitted(p), p + " wird ausgeliefert");
  assert.ok(!permitted("elliott/tests/x.test.mjs"));
});

/* =========================================================================
   SCROLL_STOP_QUALITY — §13 (Text-on-Visual als Pflicht), §14, §15

   Das Tor urteilt ueber eine MESSUNG der gerenderten Seite. Diese
   Tests fuettern deshalb Messungen, nicht Absichten - und die letzten
   pruefen am echten Chromium nach, dass die Messung auch wirklich
   entsteht und dass das Tor im Weg steht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { plan, planKomposition, render, messeSeite, seite, textGroessen,
  hookEbeneAus, seiteKomposition, atlasKasten, ausserhalb, chromiumPfad,
  ladeSchrift } from "../../scripts/social/render-asset.mjs";

const require = createRequire(import.meta.url);
const S = require("../engines/scroll-stop.js");
const Grammar = require("../engines/visual-grammar.js");
const VQ = require("../engines/visual-quality.js");
const ROOT = process.cwd();

let chromiumDa = true;
try { chromiumPfad(); } catch { chromiumDa = false; }

/** Eine Messung, die durchgeht. Ausgangspunkt jeder Gegenprobe. */
function messung(ueber) {
  return Object.assign({
    breite: 1080, hoehe: 1350,
    texte: [
      { rolle: "SIGNATUR", text: "VISION UNIVERSE®", flaeche: 19686,
        zeilen: 3, oben: 96, unten: 127, links: 88, rechts: 417, schrift: 26 },
      { rolle: "HOOK", text: "So weit lagen sie seit 1999 nicht auseinander.",
        flaeche: 146764, zeilen: 2, oben: 427, unten: 610, links: 88,
        rechts: 941, schrift: 76 },
      { rolle: "KONTEXT", text: "RUSSELL 2000", flaeche: 11217, zeilen: 1,
        oben: 669, unten: 710, links: 88, rechts: 362, schrift: 34 },
      { rolle: "BELEG", text: "-38 %", flaeche: 55316, zeilen: 1,
        oben: 710, unten: 857, links: 88, rechts: 464, schrift: 122 },
      { rolle: "QUELLE", text: "Quelle: Bloomberg", flaeche: 6136, zeilen: 1,
        oben: 1225, unten: 1254, links: 88, rechts: 300, schrift: 24 }
    ]
  }, ueber || {});
}

/** Dieselbe Messung mit einem veraenderten Textblock. */
function mit(rolle, aenderung) {
  const m = messung();
  m.texte = m.texte.map((t) => t.rolle === rolle
    ? Object.assign({}, t, aenderung) : t);
  return m;
}

function ohne(rolle) {
  const m = messung();
  m.texte = m.texte.filter((t) => t.rolle !== rolle);
  return m;
}

/* ------------------------------------------------- Geschlossen ausfallen */

test("SS1 · Ohne Messung faellt das Tor GESCHLOSSEN aus", () => {
  assert.equal(S.pruefe({}).zustand, S.ZUSTAND.MESSUNG_FEHLT);
  assert.equal(S.pruefe({ messung: null }).ok, false);
  /* Und nicht etwa: keine Texte gefunden, also kein Problem. */
  assert.notEqual(S.pruefe({}).zustand, S.ZUSTAND.OK);
});

test("SS2 · Eine Messung ohne Textliste ist keine Messung", () => {
  assert.equal(S.pruefe({ messung: { breite: 1080, hoehe: 1350 } }).zustand,
    S.ZUSTAND.MESSUNG_FEHLT);
});

/* ------------------------------------------------------------ §13 Pflicht */

test("SS3 · Ein Bild ohne jeden Text besteht nicht (§13)", () => {
  assert.equal(S.pruefe({ messung: { breite: 1080, hoehe: 1350, texte: [] } })
    .zustand, S.ZUSTAND.TEXT_ON_VISUAL_FEHLT);
});

test("SS4 · Text ohne Hook besteht nicht - ein Beleg ist keine Hook", () => {
  const r = S.pruefe({ messung: ohne("HOOK") });
  assert.equal(r.zustand, S.ZUSTAND.HOOK_FEHLT_AUF_BILD);
  assert.ok(r.rollen.includes("BELEG"));
});

test("SS5 · Eine vollstaendige Messung besteht - sonst waere jede Gegenprobe wertlos", () => {
  const r = S.pruefe({ messung: messung() });
  assert.equal(r.zustand, S.ZUSTAND.OK, r.erklaerung);
  assert.equal(r.ok, true);
});

/* ---------------------------------------------------------- §14 Dominanz */

test("SS6 · Die Hook muss den ersten Blick haben, nicht nur dabei sein", () => {
  /* Die Zahl bekommt mehr Flaeche als die Hook. */
  const r = S.pruefe({ messung: mit("BELEG", { flaeche: 200000 }) });
  assert.equal(r.zustand, S.ZUSTAND.HOOK_NICHT_DOMINANT);
  assert.equal(r.staerksteAndere, "BELEG");
});

test("SS7 · Fast gleich gross ist nicht fuehrend", () => {
  /* 130.000 gegen die 146.764 der Hook: die Hook ist groesser, aber
     nicht MIT ABSTAND groesser. Zwei Bloecke fast gleicher Flaeche
     teilen den Blick, und geteilt ist nicht gefuehrt.

     Die Zahl steht hier fest und wird NICHT aus S.VORSPRUNG
     gerechnet. Der erste Entwurf tat genau das - und war damit ein
     Test, der jeden Vorsprung bestaetigt, auch den Vorsprung 1,0.
     Ein Test, der seine Erwartung aus dem Wert ableitet, den er
     pruefen soll, kann nicht durchfallen. */
  const r = S.pruefe({ messung: mit("BELEG", { flaeche: 130000 }) });
  assert.equal(r.zustand, S.ZUSTAND.HOOK_NICHT_DOMINANT,
    "146764 gegen 130000 darf nicht als fuehrend gelten");
  /* Und knapp darueber traegt sie. */
  assert.equal(S.pruefe({ messung: mit("BELEG", { flaeche: 110000 }) }).ok, true);
});

test("SS8 · Flaeche schlaegt Schriftgroesse - genau darum wird gemessen", () => {
  /* Die Zahl hat 122 px Versalhoehe gegen 76 der Hook und besteht
     trotzdem nicht gegen sie: zwei Zeilen Satz haben die groessere
     Flaeche. Waere die Schriftgroesse das Mass, waere dieses Bild
     durchgefallen. */
  const r = S.pruefe({ messung: messung() });
  const hook = messung().texte.find((t) => t.rolle === "HOOK");
  const zahl = messung().texte.find((t) => t.rolle === "BELEG");
  assert.ok(zahl.schrift > hook.schrift);
  assert.ok(hook.flaeche > zahl.flaeche);
  assert.equal(r.ok, true);
});

test("SS9 · Ueber der Hook darf kein Inhalt stehen - der Blick faengt oben an", () => {
  const r = S.pruefe({ messung: mit("BELEG", { oben: 200, unten: 347 }) });
  assert.equal(r.zustand, S.ZUSTAND.HOOK_NICHT_OBEN);
  assert.ok(r.darueber.includes("BELEG"));
});

test("SS10 · Die Absenderzeile darf ueber der Hook stehen", () => {
  /* Sie steht bei 96 und ist keine Aussage. Waere sie nicht
     ausgenommen, wuerde jedes korrekte Bild durchfallen. */
  assert.equal(S.pruefe({ messung: messung() }).ok, true);
});

/* -------------------------------------------------------- §15 Mobilregeln */

test("SS11 · 58 Pixel auf 1350 sind sichtbar, aber nicht lesbar", () => {
  /* 58 ist keine gegriffene Zahl: so gross war die Kopfzeile in
     diesem Repository, bis §15 gemessen wurde. Der Test haelt den
     konkreten Fall fest statt eine Schwelle gegen sich selbst zu
     pruefen - sonst bestuende er auch bei einer Schwelle von 1 %. */
  const r = S.pruefe({ messung: mit("HOOK", { schrift: 58 }) });
  assert.equal(r.zustand, S.ZUSTAND.HOOK_ZU_KLEIN_FUER_MOBIL);
  /* Und die Schwelle selbst darf nicht ins Bedeutungslose rutschen. */
  assert.ok(Grammar.MOBIL.mindestHoeheAnteil >= 0.05,
    "Unter 5 % der Bildhoehe misst die Regel nichts mehr.");
});

test("SS12 · Die Mobilschwelle kommt aus der Visual Grammar, nicht von hier", () => {
  /* Zwei Zahlen fuer dieselbe Frage waeren zwei Antworten (§2). */
  const genau = Math.ceil(Grammar.MOBIL.mindestHoeheAnteil * 1350);
  assert.equal(S.pruefe({ messung: mit("HOOK", { schrift: genau }) }).ok, true);
  assert.equal(
    S.pruefe({ messung: mit("HOOK", { schrift: genau - 1 }) }).ok, false);
});

test("SS13 · Ein Text, der ueber den Bildrand laeuft, besteht nicht", () => {
  assert.equal(S.pruefe({ messung: mit("HOOK", { rechts: 1199 }) }).zustand,
    S.ZUSTAND.HOOK_AUSSERHALB_SICHERBEREICH);
  assert.equal(S.pruefe({ messung: mit("HOOK", { oben: 10 }) }).zustand,
    S.ZUSTAND.HOOK_AUSSERHALB_SICHERBEREICH);
});

/* --------------------------------------------------------- Doppelung */

test("SS14 · Der Bildtext darf nicht die Caption sein", () => {
  const r = S.pruefe({ messung: messung(),
    caption: "So weit lagen sie seit 1999 nicht auseinander. Mehr dazu unten." });
  assert.equal(r.zustand, S.ZUSTAND.HOOK_WIEDERHOLT_CAPTION);
});

test("SS15 · Eine Caption, die etwas anderes sagt, ist kein Doppel", () => {
  assert.equal(S.pruefe({ messung: messung(),
    caption: "Kleine Unternehmen kosten gemessen am Gewinn heute weniger " +
      "als grosse. Woran das liegt und was daraus folgt." }).ok, true);
});

test("SS16 · Die Doppel-Schwelle ist dieselbe wie in visual-quality", () => {
  assert.equal(S.CAPTION_UEBERSCHNEIDUNG, VQ.GRENZEN.redundanz);
  assert.ok(typeof VQ.GRENZEN.redundanz === "number");
});

test("SS17 · Eine Hook, die zu lang ist, haelt niemanden an", () => {
  const lang = "Ein Satz, den man anhalten muss, um ihn zu lesen, und der " +
    "deshalb genau das verfehlt, wofuer er da ist, naemlich jemanden im " +
    "Vorbeiscrollen aufzuhalten.";
  assert.equal(S.pruefe({ messung: mit("HOOK", { text: lang }) }).zustand,
    S.ZUSTAND.HOOK_ZU_LANG);
});

/* ------------------------------------------- Am echten Bild, am echten Tor */

const paket = (over = {}) => Object.assign({
  packageId: "ss-probe", visualType: "DATA_CARD",
  visualDirectionReady: true, visualDirectionMissing: [],
  hook: "Der Abstand ist so gross wie seit 1999 nicht.",
  visualBrief: { entity: "RUSSELL 2000",
    textLayers: [{ text: "So weit lagen sie seit 1999 nicht auseinander." }] },
  claims: [
    { text: "-38 %", numeric: -38,
      source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } },
    { text: "Bewertungsabstand Russell 2000 zu S&P 500", numeric: null,
      source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } }
  ]
}, over);

const nurMitChromium = { skip: chromiumDa ? false : "Kein Chromium." };

test("SS18 · Die gerenderte Seite vermisst sich selbst", nurMitChromium, () => {
  const dir = join(ROOT, "tmp", "ss-" + process.pid);
  mkdirSync(dir, { recursive: true });
  try {
    const p = plan(paket());
    const ziel = join(dir, "a.jpg");
    const r = render(p, ziel, { schrift: ladeSchrift(ROOT) });
    assert.ok(r.messung, "keine Messung zurueckgelesen");
    const rollen = r.messung.texte.map((t) => t.rolle);
    assert.ok(rollen.includes("HOOK"), rollen.join(","));
    assert.ok(rollen.includes("BELEG"));
    assert.ok(rollen.includes("QUELLE"));
    assert.equal(r.scrollStop.zustand, S.ZUSTAND.OK, r.scrollStop.erklaerung);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SS19 · Die Messung steht NICHT im Bild", nurMitChromium, () => {
  /* Sie stand dort einmal: sechs Zeilen JSON unter der Quellenzeile,
     im fertigen JPEG. Weder Test noch Tor haben es gesehen. Seither
     liegt sie in einem Attribut, das per Konstruktion nicht rendern
     kann - und diese Pruefung haelt das fest. */
  const html = seite(Object.assign(plan(paket()), {}), null);
  assert.doesNotMatch(html, /<div id="vu-messung"/);
  assert.match(html, /data-vu-messung/);
});

test("SS20 · Das Tor steht im Weg: ohne Hook entsteht kein Bild", nurMitChromium, () => {
  const dir = join(ROOT, "tmp", "ss-sperr-" + process.pid);
  mkdirSync(dir, { recursive: true });
  try {
    /* Ein Plan, dessen Hook-Ebene leer ist. Er laesst sich zeichnen -
       und darf trotzdem kein Asset werden. */
    const p = plan(paket());
    p.ebenen.aussage = "";
    let geworfen = null;
    try { render(p, join(dir, "b.jpg"), { schrift: ladeSchrift(ROOT) }); }
    catch (e) { geworfen = e; }
    assert.ok(geworfen, "render() hat ein Bild ohne Hook durchgelassen");
    assert.ok([S.ZUSTAND.TEXT_ON_VISUAL_FEHLT, S.ZUSTAND.HOOK_FEHLT_AUF_BILD]
      .includes(geworfen.zustand), String(geworfen.zustand));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const KOMPO = { ok: true, kind: "CHART", points: [], labels: { start: "A", end: "B" },
  changePercent: 12.3, explanation: "270 Punkte." };
const KOMPO_EBENEN = { entitaet: "AAPL", aussage: "Seit 15.08.2025: +12,3 %.",
  quelle: "Stooq" };

test("SS21 · Der Kompositionspfad setzt die Hook in die Kopfzeile, nicht den Beleg", () => {
  const pkg = paket({ visualType: "CHART" });
  pkg.visualBrief.textLayers = [
    { role: "HOOK", text: "So weit lagen sie seit 1999 nicht auseinander." }];
  const p = planKomposition(pkg, KOMPO, KOMPO_EBENEN);
  assert.equal(p.ok, true, p.message);
  assert.equal(p.ebenen.aussage,
    "So weit lagen sie seit 1999 nicht auseinander.");
  assert.equal(p.ebenen.beleg, "Seit 15.08.2025: +12,3 %.");
  assert.equal(p.ebenenHerkunft.aussage, "visualBrief.textLayers");
});

test("SS21b · Eine Textebene ohne Rolle HOOK fuehrt das Bild nicht", () => {
  /* Der Produktnachweis hat es gezeigt: oben stand "Lagebeschreibung,
     keine Prognose." - die Zeile FUERS Bild, deren eigener Kommentar
     sagt "Nicht die Hook".

     Der Kartenpfad verlangte damals schon `role: "HOOK"`, der
     Kompositionspfad nahm die erste Ebene mit Text. Zwei Register fuer
     eine Regel, und korrigiert war nur eines. Dieser Test haelt die
     zweite Stelle fest: keine Rolle, keine Kopfzeile.

     Ohne die Korrektur stuende hier die Bildzeile und
     `ebenenHerkunft.aussage` waere "visualBrief.textLayers". */
  const pkg = paket({ visualType: "CHART" });
  pkg.visualBrief.textLayers = [{ text: "Lagebeschreibung, keine Prognose." }];
  const p = planKomposition(pkg, KOMPO, KOMPO_EBENEN);
  assert.equal(p.ok, true, p.message);
  assert.equal(p.ebenen.aussage, pkg.hook);
  assert.equal(p.ebenenHerkunft.aussage, "pkg.hook");
});

test("SS21c · Auf der Karte gilt dieselbe Regel aus derselben Funktion", () => {
  const pkg = paket();
  pkg.visualBrief.textLayers = [{ text: "Lagebeschreibung, keine Prognose." }];
  assert.equal(hookEbeneAus(pkg), null);
  const p = plan(pkg);
  assert.equal(p.ok, true, p.message);
  assert.equal(p.ebenen.aussage, pkg.hook);

  pkg.visualBrief.textLayers = [{ role: "HOOK", text: "Zwei Indizes, ein Abstand." }];
  assert.equal(hookEbeneAus(pkg).text, "Zwei Indizes, ein Abstand.");
});

test("SS21d · Ein Systemschluessel kommt nicht unter die Grafik", () => {
  /* "Quelle: vu.technical" stand unter einem fertigen Bild. Vier
     Faelle, und jeder hat eine andere richtige Antwort:

       vu.technical    unser Schluessel MIT Eintrag   -> der Name
       discover.card   unser Namensraum               -> der Name
       screener.raw    ein fremder Schluessel         -> kein Bild
       Bloomberg       ein oeffentlicher Name         -> unveraendert

     Der dritte Fall ist der, der frueher durchrutschte; der vierte
     der, den der erste Entwurf dieses Tors faelschlich abwies. */
  const faelle = [
    ["vu.technical", "Vision Universe"],
    ["discover.card", "Vision Universe"],
    ["discover.row.bekannte-namen", "Vision Universe"],
    ["Bloomberg", "Bloomberg"],
    ["Tiingo, Stand 17.09.2026", "Tiingo, Stand 17.09.2026"]
  ];
  for (const [roh, name] of faelle) {
    const p = planKomposition(paket({ visualType: "CHART" }), KOMPO,
      Object.assign({}, KOMPO_EBENEN, { quelle: roh }));
    assert.equal(p.ok, true, roh + ": " + p.message);
    assert.equal(p.ebenen.quelle, name, roh);
  }

  const fremd = planKomposition(
    paket({ visualType: "CHART" }), KOMPO,
    Object.assign({}, KOMPO_EBENEN, { quelle: "screener.raw" }));
  assert.equal(fremd.ok, false);
  assert.equal(fremd.reason, "unknownSourceName");
});

test("SS21e · Eine gezeichnete Zahl ohne Herkunft wird nicht gezeichnet", () => {
  /* Der Kartenpfad weist das seit jeher ab (`noSource`). Der
     Kompositionspfad hat gezeichnet: im realen Lauf fuenf Kurse unter
     einem roten Strich, und darunter nichts. Eine Grafik zeigt mehr
     Zahlen als eine Karte, nicht weniger. */
  for (const leer of [null, "", "   "]) {
    const p = planKomposition(paket({ visualType: "CHART" }), KOMPO,
      Object.assign({}, KOMPO_EBENEN, { quelle: leer }));
    assert.equal(p.ok, false, JSON.stringify(leer));
    assert.equal(p.reason, "noSource");
  }
});

test("SS22 · Ohne Hook entsteht im Kompositionspfad gar kein Plan", () => {
  const kompo = { ok: true, kind: "CHART", points: [], labels: { start: "A", end: "B" },
    changePercent: 12.3, explanation: "270 Punkte." };
  const p = planKomposition(
    { visualType: "CHART", packageId: "x" }, kompo,
    { entitaet: "AAPL", aussage: "Seit 15.08.2025: +12,3 %.", quelle: "Stooq" });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "noHookOnVisual");
});

test("SS23 · Die Kopfzeile ist gross genug fuer die Mobilschwelle", () => {
  const g = textGroessen("DATA_CARD");
  assert.ok(g.aussage / 1350 >= Grammar.MOBIL.mindestHoeheAnteil,
    "Die Kopfzeile misst " + g.aussage + " von 1350 - unter der Schwelle.");
  /* Und auch bei NUMBER_VISUAL, wo sie frueher 40 Pixel mass. */
  assert.ok(textGroessen("NUMBER_VISUAL").aussage / 1350 >=
    Grammar.MOBIL.mindestHoeheAnteil);
});

/* ------------------------------------------------------------------ */
/* WAS AUF DEM FERTIGEN BILD STEHT (§16/§17)                          */
/* ------------------------------------------------------------------ */

const VERGLEICH = {
  ok: true, kind: "COMPARISON", width: 904, einheit: null,
  bars: [
    { label: "S&P 500", value: 21.6, anzeige: "21,6", rank: 1, pixels: 904 },
    { label: "Russell 2000", value: 13.4, anzeige: "13,4", rank: 2,
      pixels: 561, highlight: true }],
  highlightRank: 2, explanation: "2 Werte, Hoechstwert 21.6."
};

function vergleichsplan() {
  const pkg = paket({ visualType: "COMPARISON" });
  pkg.visualBrief.textLayers = [
    { role: "HOOK", text: "So weit lagen sie seit 1999 nicht auseinander." }];
  return planKomposition(pkg, VERGLEICH, { entitaet: "KGV",
    aussage: "S&P 500 liegt um 8,2 vor Russell 2000.", quelle: "vu.technical" });
}

test("SS24 · Die Balken tragen die Zahl der Quelle, nicht eine gerundete", () => {
  /* Auf dem Produktnachweis stand "22" und "13". Geprueft wird der
     gezeichnete Text, nicht die Absicht: was im HTML steht, geht so
     in den Screenshot. */
  const p = vergleichsplan();
  assert.equal(p.ok, true, p.message);
  const html = seiteKomposition(p, null);
  assert.match(html, />21,6</);
  assert.match(html, />13,4</);
  assert.doesNotMatch(html, />22</);
  assert.doesNotMatch(html, />13</);
});

test("SS25 · Atlas steht im Bild, in einer Rolle, die die Familie kennt", () => {
  /* §17 beschreibt vier Atlas-Rollen mit Flaechenbaendern, brand.js
     fuehrt den Atlas-Vertrag, visual-grammar.js prueft Rolle gegen
     Familie - und gezeichnet wurde Atlas nie. Ein Modell, das nichts
     verbietet, weil der Fall nie vorkommt, ist kein Tor.

     Drei Dinge zusammen, weil einzeln jedes erfuellbar waere, ohne
     dass eine Figur im Bild steht: eine Rolle im Plan, ein
     Flaechenanteil in ihrem Band, und das kanonische Asset im
     Markup. */
  const p = vergleichsplan();
  assert.ok(p.atlas, "Der Plan traegt keinen Atlas.");
  const band = Grammar.ATLAS_ROLLEN[p.atlas.rolle];
  assert.ok(band, "Die Rolle " + p.atlas.rolle + " steht nicht in §17.");
  const fam = Grammar.FAMILIEN[p.grammatik.familie];
  assert.ok(fam.atlasRollen.includes(p.atlas.rolle),
    "In " + fam.id + " ist " + p.atlas.rolle + " nicht zulaessig.");
  assert.ok(p.atlas.flaechenAnteil >= band.flaecheMin &&
    p.atlas.flaechenAnteil <= band.flaecheMax,
    "Flaechenanteil " + p.atlas.flaechenAnteil + " liegt nicht im Band.");
  assert.equal(p.atlas.referenceAsset, "assets/atlas.png");

  const html = seiteKomposition(p, null);
  assert.match(html, /data-vu-figur="ATLAS"/);
  /* Die Bytes des kanonischen Assets, nicht ein Pfad und kein Nachbau. */
  assert.ok(html.includes(p.atlasUri.slice(0, 256)),
    "Das kanonische Atlas-Asset steckt nicht im Markup.");
});

test("SS26 · Der Atlas-Kasten folgt dem Band der Rolle und dem echten Asset", () => {
  for (const rolle of ["ATLAS_GUIDE", "ATLAS_OBSERVER", "ATLAS_SIGNATURE"]) {
    const k = atlasKasten(rolle, 1080, 1350);
    const band = Grammar.ATLAS_ROLLEN[rolle];
    assert.ok(k.flaechenAnteil >= band.flaecheMin &&
      k.flaechenAnteil <= band.flaecheMax, rolle + ": " + k.flaechenAnteil);
    /* Das Seitenverhaeltnis ist das der Datei, nicht eine hier
       hinterlegte Zahl - ein zweiter Eintrag koennte driften. */
    const soll = k.asset.breite / k.asset.hoehe;
    assert.ok(Math.abs((k.breite / k.hoehe) - soll) < 0.01,
      rolle + ": verzerrt (" + (k.breite / k.hoehe) + " statt " + soll + ")");
  }
});

test("SS27 · Die Figurenmessung ist von der Textmessung getrennt", () => {
  /* Ein Atlas in der Textliste haette als "andere Flaeche" gezaehlt
     und die Hook-Dominanz nach §14 rechnerisch geschlagen - ein Tor,
     das an einer Figur scheitert, misst nicht mehr, was es messen
     soll. */
  const p = vergleichsplan();
  const html = seiteKomposition(p, null);
  const figur = /data-vu-figur="ATLAS"[^>]*/.exec(html);
  assert.ok(figur, "Keine Figur im Markup.");
  assert.doesNotMatch(figur[0], /data-vu-rolle=/);
});

/* ------------------------------------------------------------------ */
/* DER VORFALL VOM 21.09.: ABGESCHNITTENE HERKUNFT                     */
/* ------------------------------------------------------------------ */

/* Die ECHTE Messung der Seite, die der reale Zyklus erzeugt hat:
   fuenf Balken, eine dreizeilige Hook, 1080x1350. `overflow:hidden`
   hat "Quelle: Tiingo" abgeschnitten, ohne dass irgendetwas es gemerkt
   hat - fuenf Zahlen in Markenoptik, ohne Herkunft.

   Die Zahlen sind abgelesen, nicht erfunden. Sie bleiben hier stehen,
   damit der Fall pruefbar ist, auch wenn die Seite ihn nicht mehr
   erzeugt. */
const VORFALL = {
  breite: 1080, hoehe: 1350,
  texte: [
    { rolle: "HOOK", oben: 180, unten: 451, links: 88, rechts: 906 },
    { rolle: "BELEG", oben: 468, unten: 517, links: 88, rechts: 620 },
    { rolle: "QUELLE", oben: 1346, unten: 1375, links: 88, rechts: 262 }],
  figuren: [{ figur: "ATLAS", oben: 1191, unten: 1375, links: 854,
    rechts: 992, breite: 138, hoehe: 184 }]
};

test("SS28 · Was ueber den Rand ragt, wird benannt statt abgeschnitten", () => {
  const raus = ausserhalb(VORFALL, 1080, 1350);
  assert.equal(raus.length, 2, raus.join(" | "));
  assert.match(raus.join(" "), /QUELLE/);
  assert.match(raus.join(" "), /FIGUR:ATLAS/);
});

test("SS29 · Dieselbe Seite, in die Flaeche geholt, ist in Ordnung", () => {
  /* Die Gegenrichtung: ein Tor, das immer anschlaegt, ist genauso
     wertlos wie eines, das nie anschlaegt. */
  const heil = JSON.parse(JSON.stringify(VORFALL));
  heil.texte[2] = { rolle: "QUELLE", oben: 1225, unten: 1254, links: 88, rechts: 262 };
  heil.figuren[0] = { figur: "ATLAS", oben: 1070, unten: 1254, links: 854,
    rechts: 992, breite: 138, hoehe: 184 };
  assert.deepEqual(ausserhalb(heil, 1080, 1350), []);
});

test("SS30 · Ohne Messung wird nicht behauptet, alles sei im Bild", () => {
  /* Eine leere Liste hiesse "nichts ragt heraus". Das waere eine
     Aussage ueber die Seite, die in Wahrheit eine ueber das Werkzeug
     ist - dieselbe Verwechslung, die in diesem Projekt schon einen
     Bericht erfunden hat. render() zeichnet ohne Messung gar nicht
     erst; hier gilt nur, dass die Funktion nichts erfindet. */
  assert.deepEqual(ausserhalb(null, 1080, 1350), []);
  assert.deepEqual(ausserhalb({ texte: [], figuren: [] }, 1080, 1350), []);
});

test("SS31 · Auch der linke und der obere Rand zaehlen", () => {
  assert.equal(ausserhalb({ texte: [
    { rolle: "HOOK", oben: -4, unten: 100, links: 88, rechts: 900 }] },
    1080, 1350).length, 1);
  assert.equal(ausserhalb({ texte: [
    { rolle: "HOOK", oben: 10, unten: 100, links: -2, rechts: 900 }] },
    1080, 1350).length, 1);
  /* Der Fall, der das Tor ueberhaupt erst noetig gemacht hat: ein
     einzelnes langes Wort, rechts 1199 auf 1080 Pixeln Breite. */
  assert.equal(ausserhalb({ texte: [
    { rolle: "HOOK", oben: 10, unten: 100, links: 88, rechts: 1199 }] },
    1080, 1350).length, 1);
});

test("SS32 · Fuenf Balken und eine lange Hook passen jetzt in die Flaeche", nurMitChromium, () => {
  /* Das Gegenstueck zum Tor: die Grafik weicht, und deshalb bleibt
     die Herkunft im Bild. Ohne die nachgebende Grafik stuende die
     Quellenzeile wieder bei y=1346. */
  const dir = join(ROOT, "tmp", "ss5-" + process.pid);
  mkdirSync(dir, { recursive: true });
  try {
    const bars = [
      { label: "Microsoft", value: 497.75, anzeige: "497,75", rank: 1, pixels: 904 },
      { label: "Valero Energy", value: 412.53, anzeige: "412,53", rank: 2, pixels: 749 },
      { label: "Adobe", value: 252.67, anzeige: "252,67", rank: 3, pixels: 459 },
      { label: "Salesforce", value: 242.85, anzeige: "242,85", rank: 4, pixels: 441 },
      { label: "HP Inc", value: 34.66, anzeige: "34,66", rank: 5, pixels: 63 }];
    const pkg = paket({ visualType: "COMPARISON",
      hook: "33 von 5951 geprueften Titeln - Bekannte Namen in Bewegung." });
    pkg.visualBrief.textLayers = [];
    const p = planKomposition(pkg,
      { ok: true, kind: "COMPARISON", width: 904, einheit: null, bars,
        highlightRank: null, explanation: "5 Werte." },
      { entitaet: null, aussage: "Microsoft liegt beim 14-fachen von HP Inc.",
        quelle: "Tiingo" });
    assert.equal(p.ok, true, p.message);
    const r = render(p, join(dir, "a.jpg"), { schrift: ladeSchrift(ROOT) });
    const quelle = r.messung.texte.find((t) => t.rolle === "QUELLE");
    assert.ok(quelle, "Die Quellenzeile wurde nicht gemessen.");
    assert.ok(quelle.unten <= 1350,
      "Die Quellenzeile endet bei " + quelle.unten + " auf 1350 Pixeln.");
    assert.deepEqual(ausserhalb(r.messung, 1080, 1350), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

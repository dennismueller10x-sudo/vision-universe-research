/* =========================================================================
   VISUAL GRAMMAR — §16 (Familien), §17 (Atlas-Rollen), §19 (Variation)

   Diese Tests pruefen nicht, ob die Namen im Quelltext stehen. Sie
   pruefen, ob die Grammatik URTEILT: ob jede Failure Condition einen
   Entwurf wirklich abweist, ob eine fehlende Messung geschlossen
   ausfaellt statt still zu bestehen, und ob das Tor im Produktionsweg
   steht statt daneben.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const G = require("../engines/visual-grammar.js");
const VI = require("../engines/visual-intelligence.js");
const VC = require("../engines/visual-composition.js");

const SECHS = ["CINEMATIC_STORY", "DATA_EDITORIAL", "RANKING",
  "COMPARISON", "EXPLAINER", "MAGAZINE_REPORT"];

/** Ein Entwurf, der durchgeht. Ausgangspunkt jeder Gegenprobe. */
function guterEntwurf(ueber) {
  return Object.assign({
    form: "CHART",
    dominantesElement: "TEXT",
    textElemente: [
      { rolle: "HOOK", text: "So weit lagen sie seit 1999 nicht auseinander.",
        rang: 1, hoeheAnteil: 0.072, imSicherenBereich: true },
      { rolle: "BELEG", text: "-38 %", rang: 2, hoeheAnteil: 0.05,
        imSicherenBereich: true },
      { rolle: "KONTEXT", text: "Russell 2000 zu S&P 500", rang: 3,
        hoeheAnteil: 0.03, imSicherenBereich: true },
      { rolle: "QUELLE", text: "Bloomberg", rang: 4, hoeheAnteil: 0.018,
        imSicherenBereich: true },
      { rolle: "SIGNATUR", text: "VISION UNIVERSE", rang: 9,
        hoeheAnteil: 0.019, imSicherenBereich: true }
    ],
    atlas: { rolle: "ATLAS_OBSERVER", flaechenAnteil: 0.06,
      traegtAussage: false, vorDaten: false },
    akzente: [{ bedeutung: "RICHTUNG" }]
  }, ueber || {});
}

function ids(spec, familie) {
  return G.pruefe(familie || "DATA_EDITORIAL", spec).verstoesse
    .map((v) => v.id);
}

/* ------------------------------------------------------- §16 Struktur */

test("VG1 · Sechs Familien, und jede traegt alle acht Bestandteile aus §16", () => {
  assert.deepEqual(G.FAMILIEN_IDS.slice().sort(), SECHS.slice().sort());
  for (const id of SECHS) {
    const f = G.FAMILIEN[id];
    for (const teil of ["zweck", "storytypen", "formen", "atlasRollen",
      "textHierarchie", "visualHierarchie", "akzente", "mobil", "fehlerbilder"]) {
      const v = f[teil];
      assert.ok(v !== null && v !== undefined && v !== "",
        id + " hat kein " + teil);
      if (Array.isArray(v)) assert.ok(v.length > 0, id + "." + teil + " ist leer");
    }
  }
});

test("VG2 · Keine Familie erfindet eine Bildform - alle stammen aus visual-intelligence", () => {
  for (const id of SECHS) {
    for (const form of G.FAMILIEN[id].formen) {
      assert.ok(VI.FORMEN[form],
        id + " fuehrt die Form " + form + ", die es in FORMEN nicht gibt. " +
        "Das waere eine zweite Formliste.");
    }
  }
});

test("VG3 · §17: vier Atlas-Rollen, und ihre Flaechenbaender ueberlappen nicht", () => {
  const rollen = ["ATLAS_HERO", "ATLAS_GUIDE", "ATLAS_OBSERVER", "ATLAS_SIGNATURE"];
  assert.deepEqual(Object.keys(G.ATLAS_ROLLEN).sort(), rollen.slice().sort());
  const sortiert = rollen.map((r) => G.ATLAS_ROLLEN[r])
    .sort((a, b) => a.flaecheMin - b.flaecheMin);
  for (let i = 1; i < sortiert.length; i++) {
    assert.ok(sortiert[i].flaecheMin > sortiert[i - 1].flaecheMax,
      "Die Baender von " + sortiert[i - 1].id + " und " + sortiert[i].id +
      " ueberlappen - dann ist die Rolle aus der Groesse nicht ablesbar.");
  }
  /* Nur HERO darf die Aussage tragen. Sonst waere §12 offen. */
  assert.equal(
    rollen.filter((r) => G.ATLAS_ROLLEN[r].traegtAussage).join(","),
    "ATLAS_HERO");
});

test("VG4 · Ein leerer Entwurf faellt in JEDER Familie durch", () => {
  for (const id of SECHS) {
    const r = G.pruefe(id, {});
    assert.equal(r.ok, false, id + " laesst einen leeren Entwurf durch");
    assert.ok(r.verstoesse.length >= 2);
  }
});

test("VG5 · Ein vollstaendiger Entwurf geht durch - sonst waere jede Gegenprobe wertlos", () => {
  const r = G.pruefe("DATA_EDITORIAL", guterEntwurf());
  assert.equal(r.ok, true, r.erklaerung);
  assert.equal(r.familie, "DATA_EDITORIAL");
});

test("VG6 · Eine unbekannte Familie ist kein stiller Durchlauf", () => {
  const r = G.pruefe("IRGENDWAS", guterEntwurf());
  assert.equal(r.ok, false);
  assert.deepEqual(r.verstoesse.map((v) => v.id), ["UNBEKANNTE_FAMILIE"]);
});

/* ------------------------------------------------- §13 Text auf Bild */

test("VG7 · Ein Bild ohne Text faellt durch (§13)", () => {
  assert.ok(ids(guterEntwurf({ textElemente: [] }))
    .includes("KEIN_TEXT_AUF_BILD"));
});

test("VG8 · Text ohne Hook ist kein bestandenes Text-on-Visual", () => {
  const ohneHook = guterEntwurf().textElemente
    .filter((t) => t.rolle !== "HOOK");
  const raus = ids(guterEntwurf({ textElemente: ohneHook }));
  assert.ok(raus.includes("KEINE_HOOK_AUF_BILD"), raus.join(","));
});

test("VG9 · Ein Bild, dessen groesstes Element kein Text ist, faellt durch", () => {
  assert.ok(ids(guterEntwurf({ dominantesElement: "SZENE" }))
    .includes("DOMINANTES_ELEMENT_IST_NICHT_TEXT"));
});

/* --------------------------------------------------- §15 Mobilregeln */

test("VG10 · Eine fehlende Texthoehe faellt GESCHLOSSEN aus, nicht bestanden", () => {
  const e = guterEntwurf().textElemente.map((t) =>
    t.rolle === "HOOK" ? Object.assign({}, t, { hoeheAnteil: null }) : t);
  const raus = ids(guterEntwurf({ textElemente: e }));
  assert.ok(raus.includes("FUEHRENDER_TEXT_UNGEMESSEN"),
    "Ungemessen muss durchfallen - sonst ist die Mobilregel durch " +
    "Weglassen zu bestehen. Gemeldet: " + raus.join(","));
});

test("VG11 · Ein fuehrender Text unter der Mobilschwelle faellt durch", () => {
  const knappDrunter = G.MOBIL.mindestHoeheAnteil - 0.001;
  const e = guterEntwurf().textElemente.map((t) =>
    t.rolle === "HOOK" ? Object.assign({}, t, { hoeheAnteil: knappDrunter }) : t);
  assert.ok(ids(guterEntwurf({ textElemente: e }))
    .includes("FUEHRENDER_TEXT_ZU_KLEIN"));
});

test("VG12 · Text im ueberdeckten Randbereich faellt durch", () => {
  const e = guterEntwurf().textElemente.map((t) =>
    t.rolle === "QUELLE" ? Object.assign({}, t, { imSicherenBereich: false }) : t);
  assert.ok(ids(guterEntwurf({ textElemente: e }))
    .includes("TEXT_AUSSERHALB_SICHERBEREICH"));
});

test("VG13 · Ein Textelement ohne Rang macht die Hierarchie zur Absicht", () => {
  const e = guterEntwurf().textElemente.map((t) =>
    t.rolle === "BELEG" ? Object.assign({}, t, { rang: null }) : t);
  assert.ok(ids(guterEntwurf({ textElemente: e })).includes("TEXT_OHNE_RANG"));
});

test("VG14 · Eine verletzte Rangfolge wird benannt", () => {
  /* QUELLE ueber HOOK: in DATA_EDITORIAL steht HOOK an erster Stelle. */
  const e = guterEntwurf().textElemente.map((t) => {
    if (t.rolle === "QUELLE") return Object.assign({}, t, { rang: 0 });
    return t;
  });
  assert.ok(ids(guterEntwurf({ textElemente: e }))
    .includes("TEXT_HIERARCHIE_VERLETZT"));
});

/* ------------------------------------------------- §17 Atlas-Rollen */

test("VG15 · Atlas ohne Rolle ist Atlas als Dekoration", () => {
  assert.ok(ids(guterEntwurf({ atlas: { flaechenAnteil: 0.06 } }))
    .includes("ATLAS_OHNE_ROLLE"));
});

test("VG16 · Eine Rolle ohne gemessenen Flaechenanteil ist eine Behauptung", () => {
  assert.ok(ids(guterEntwurf({ atlas: { rolle: "ATLAS_OBSERVER" } }))
    .includes("ATLAS_FLAECHE_UNGEMESSEN"));
});

test("VG17 · Eine Signatur, die ein Viertel des Bildes einnimmt, ist keine", () => {
  assert.ok(ids(guterEntwurf({
    atlas: { rolle: "ATLAS_SIGNATURE", flaechenAnteil: 0.25 } }))
    .includes("ATLAS_FLAECHE_VERFEHLT_ROLLE"));
});

test("VG18 · Atlas traegt die Aussage nur als HERO", () => {
  assert.ok(ids(guterEntwurf({
    atlas: { rolle: "ATLAS_OBSERVER", flaechenAnteil: 0.06, traegtAussage: true } }))
    .includes("ATLAS_TRAEGT_AUSSAGE_OHNE_HERO"));
});

test("VG19 · Atlas verdeckt die Daten nicht, ausser als HERO", () => {
  assert.ok(ids(guterEntwurf({
    atlas: { rolle: "ATLAS_OBSERVER", flaechenAnteil: 0.06, vorDaten: true } }))
    .includes("ATLAS_VERDECKT_DATEN"));
});

test("VG20 · In DATA_EDITORIAL kann Atlas nicht HERO sein - er stuende vor dem Beleg", () => {
  assert.ok(ids(guterEntwurf({
    atlas: { rolle: "ATLAS_HERO", flaechenAnteil: 0.4, traegtAussage: true } }))
    .includes("ATLAS_ROLLE_PASST_NICHT_ZUR_FAMILIE"));
});

/* ----------------------------------------------------- Akzentlogik */

test("VG21 · Ein Akzent ohne Bedeutung ist Dekoration und faellt durch", () => {
  assert.ok(ids(guterEntwurf({ akzente: [{ bedeutung: "SIEHT_GUT_AUS" }] }))
    .includes("AKZENT_OHNE_BEDEUTUNG"));
});

test("VG22 · Mehr als drei Akzente heben nichts mehr hervor", () => {
  const viele = Array.from({ length: G.AKZENT_HOECHSTZAHL + 1 },
    () => ({ bedeutung: "EXTREM" }));
  assert.ok(ids(guterEntwurf({ akzente: viele })).includes("ZU_VIELE_AKZENTE"));
});

test("VG23 · Ein Akzent, den die Familie nicht fuehrt, wird benannt", () => {
  /* SCHWELLE gehoert nicht zur Akzentlogik von RANKING. */
  const raus = G.pruefe("RANKING", guterEntwurf({
    form: "COMPARISON", eintraege: 4,
    akzente: [{ bedeutung: "SCHWELLE" }] })).verstoesse.map((v) => v.id);
  assert.ok(raus.includes("AKZENT_PASST_NICHT_ZUR_FAMILIE"), raus.join(","));
});

/* -------------------------------------------------------- Form/Familie */

test("VG24 · Eine Form, die die Familie nicht fuehrt, faellt durch", () => {
  assert.ok(ids(guterEntwurf({ form: "CAROUSEL" }))
    .includes("FORM_PASST_NICHT_ZUR_FAMILIE"));
});

test("VG25 · Eine Form, die es nirgends gibt, wird als solche benannt", () => {
  assert.ok(ids(guterEntwurf({ form: "NEONWUERFEL" }))
    .includes("UNBEKANNTE_FORM"));
});

test("VG26 · Fehlende Form ist ein Befund, keine stille Annahme", () => {
  assert.ok(ids(guterEntwurf({ form: null })).includes("KEINE_FORM"));
});

/* ------------------------------------------------------ Familienwahl */

test("VG27 · Die Wahl schliesst aus, bevor sie waehlt: eine Zahl ist keine Rangliste", () => {
  const w = G.waehleFamilie({ form: "DATA_CARD", eintraege: 1,
    textElemente: guterEntwurf().textElemente });
  assert.equal(w.familie, "DATA_EDITORIAL", w.grund);
});

test("VG28 · Drei geordnete Eintraege ergeben RANKING, zwei COMPARISON", () => {
  const basis = { form: "COMPARISON", gleicheAchse: true,
    textElemente: guterEntwurf().textElemente };
  assert.equal(G.waehleFamilie(Object.assign({ eintraege: 5 }, basis)).familie,
    "RANKING");
  assert.equal(G.waehleFamilie(Object.assign({ eintraege: 2 }, basis)).familie,
    "COMPARISON");
});

test("VG29 · Echte Mehrdeutigkeit wird gemeldet, nicht stillschweigend aufgeloest", () => {
  const w = G.waehleFamilie({ form: "MIXED" });
  assert.equal(w.familie, null);
  assert.ok(Array.isArray(w.mehrdeutig) && w.mehrdeutig.length >= 2, w.grund);
});

test("VG30 · Ohne Form entsteht keine Familie", () => {
  assert.equal(G.waehleFamilie({}).familie, null);
});

/* --------------------------------------------------- §19 Feed-Variation */

function beitrag(ueber) {
  return Object.assign({ familie: "DATA_EDITORIAL", form: "CHART",
    atlasRolle: "ATLAS_SIGNATURE", dominantesTextRolle: "HOOK",
    akzente: ["RICHTUNG"], farbwelt: "VU" }, ueber || {});
}

test("VG31 · Ein zu kleines Fenster ist UNGEPRUEFT und nicht bestanden", () => {
  const r = G.feedVariation(Array.from({ length: G.FENSTER_MINDEST - 1 },
    () => beitrag()));
  assert.equal(r.zustand, "UNGEPRUEFT");
  assert.notEqual(r.zustand, "VIELFAELTIG");
});

test("VG32 · Acht gleich gebaute Beitraege sind ein Kollaps (§19)", () => {
  const r = G.feedVariation(Array.from({ length: 8 }, () => beitrag()));
  assert.equal(r.zustand, "KOLLABIERT");
  assert.ok(r.kollabiert.includes("familie"), r.erklaerung);
});

test("VG33 · Ein wirklich gemischter Feed kollabiert nicht", () => {
  const f = ["CINEMATIC_STORY", "DATA_EDITORIAL", "RANKING",
    "COMPARISON", "EXPLAINER", "MAGAZINE_REPORT"];
  const formen = ["ATLAS", "CHART", "DATA_CARD", "NUMBER_VISUAL",
    "CAROUSEL", "MIXED"];
  const rollen = ["ATLAS_HERO", "ATLAS_SIGNATURE", "ATLAS_OBSERVER",
    "ATLAS_SIGNATURE", "ATLAS_GUIDE", "ATLAS_OBSERVER"];
  const akz = [["SUBJEKT"], ["RICHTUNG"], ["EXTREM"], ["EXTREM", "SUBJEKT"],
    ["SCHWELLE"], ["SUBJEKT"]];
  const dom = ["HOOK", "BELEG", "HOOK", "BELEG", "HOOK", "HOOK"];
  const farben = ["VU", "VU_HELL", "VU", "VU_HELL", "VU", "VU_HELL"];
  const feed = f.map((familie, i) => beitrag({ familie, form: formen[i],
    atlasRolle: rollen[i], akzente: akz[i], dominantesTextRolle: dom[i],
    farbwelt: farben[i] }));
  const r = G.feedVariation(feed);
  assert.equal(r.zustand, "VIELFAELTIG", r.erklaerung);
});

test("VG34 · Eine Dimension, zu der nichts erfasst ist, gilt als UNGEPRUEFT", () => {
  const feed = Array.from({ length: 8 }, (_, i) =>
    beitrag({ familie: SECHS[i % 6], form: null,
      atlasRolle: ["ATLAS_HERO", "ATLAS_GUIDE"][i % 2],
      dominantesTextRolle: ["HOOK", "BELEG"][i % 2],
      akzente: [["SUBJEKT"], ["EXTREM"]][i % 2],
      farbwelt: ["VU", "VU_HELL"][i % 2] }));
  const r = G.feedVariation(feed);
  const form = r.dimensionen.find((d) => d.id === "form");
  assert.equal(form.zustand, "UNGEPRUEFT");
});

/* ---------------------------------------- Ableitung aus dem Render-Plan */

test("VG35 · ausRenderPlan liest den Plan und erfindet keine Hoehe", () => {
  const ohneGroessen = { visualType: "DATA_CARD", breite: 1080, hoehe: 1350,
    ebenen: { aussage: "Ein Satz", zahl: "76", quelle: "Stooq" } };
  const spec = G.ausRenderPlan(ohneGroessen);
  assert.ok(spec.textElemente.every((t) => t.hoeheAnteil === null),
    "Ohne textGroessen darf keine Hoehe entstehen.");
  assert.ok(ids(spec).includes("FUEHRENDER_TEXT_UNGEMESSEN"));
});

test("VG36 · Ein aus Daten gerechneter Satz ist ein BELEG und keine Hook", () => {
  const plan = { visualType: "CHART", breite: 1080, hoehe: 1350,
    ebenen: { aussage: "Seit 15.08.2025: +12,3 %.", entitaet: "AAPL",
      quelle: "Stooq" },
    ebenenHerkunft: { aussage: "komposition" },
    textGroessen: { marke: 26, entitaet: 34, zahl: 122, zahlText: 32,
      aussage: 58, quelle: 24 } };
  const spec = G.ausRenderPlan(plan);
  const rollen = spec.textElemente.map((t) => t.rolle);
  assert.ok(!rollen.includes("HOOK"),
    "Ein gerechneter Satz darf nicht als Hook gelten - sonst besteht " +
    "§13 sich selbst.");
  assert.ok(ids(spec).includes("KEINE_HOOK_AUF_BILD"));
});

test("VG37 · Aus der Hook stammender Text gilt als Hook", () => {
  const plan = { visualType: "CHART", breite: 1080, hoehe: 1350,
    ebenen: { aussage: "So weit lagen sie seit 1999 nicht auseinander." },
    ebenenHerkunft: { aussage: "pkg.hook" },
    textGroessen: { marke: 26, aussage: 100 } };
  const spec = G.ausRenderPlan(plan);
  assert.ok(spec.textElemente.some((t) => t.rolle === "HOOK"));
});

test("VG38 · Das dominante Textelement wird gerechnet, nicht angenommen", () => {
  const plan = { visualType: "NUMBER_VISUAL", breite: 1080, hoehe: 1350,
    ebenen: { aussage: "Ein Satz", zahl: "76", quelle: "Stooq" },
    ebenenHerkunft: { aussage: "pkg.hook" },
    textGroessen: { marke: 26, zahl: 190, aussage: 40, quelle: 24 } };
  const spec = G.ausRenderPlan(plan);
  assert.equal(spec.dominantesTextFeld, "zahl");
  assert.equal(spec.dominantesTextRolle, "BELEG");
});

test("VG39 · Die Flaeche kommt aus der Komposition, nicht aus einer zweiten Angabe", () => {
  assert.equal(G.FLAECHE, VC.FLAECHE);
});

/* ------------------------------------------- Das Tor steht im Weg (§16) */

const RENDERER = readFileSync("scripts/social/render-asset.mjs", "utf8");
const OHNE_KOMMENTARE = RENDERER
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("VG40 · Der Renderer ruft die Grammatik auf - in BEIDEN Bildwegen", () => {
  assert.match(OHNE_KOMMENTARE, /VisualGrammar\s*\.\s*ausRenderPlan/);
  const aufrufe = OHNE_KOMMENTARE.match(/grammatikBefund\s*\(/g) || [];
  assert.ok(aufrufe.length >= 3,
    "Erwartet: die Funktion selbst und je ein Aufruf in plan() und " +
    "planKomposition(). Gefunden: " + aufrufe.length);
});

test("VG41 · Die Schriftgroessen stehen genau einmal im Renderer", () => {
  /* Zwei Kopien derselben Zahlen driften, und dann prueft die
     Grammatik ein Bild, das es nicht gibt. */
  const treffer = OHNE_KOMMENTARE.match(/NUMBER_VISUAL"\s*\?\s*190/g) || [];
  assert.equal(treffer.length, 1,
    "Die Groessentabelle darf nur an einer Stelle stehen.");
  assert.match(OHNE_KOMMENTARE, /textGroessen\s*:\s*textGroessen\(/);
});

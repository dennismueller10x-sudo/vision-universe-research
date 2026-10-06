/* =========================================================================
   WAS DER SMOKE NICHT ANSCHAUT, VERFAELLT.

   Dreimal an einem Tag dasselbe Muster:

     M26  Der Smoke kannte nur NVDA, AAPL und JPM - also nur Titel, bei denen
          alles da ist. Ein Stapel Absagen auf datenarmen Seiten konnte
          deshalb nicht auffallen.
     M28  Er prüfte die Uebersicht nur auf Fehlerfreiheit. Sie zeigte 5 von
          6.875 Kursen und keinen einzigen Namen.
     M29  Er prüfte den Screener nur auf Fehlerfreiheit. Der lieferte 50
          richtige Treffer und zeigte in jeder Zeile einen Strich.

   Am 26.09.2026 gemessen: von 19 Ansichten im Router standen 12 in der Liste
   des Smoke. atlas, discover, elliott, markets, portfolio und research liefen
   ungeprueft mit - und in genau dieser Luecke lagen die Befunde.

   Diese Datei haelt zwei Dinge, die eine neue Ansicht nicht mehr entkommen
   lassen:
     1. Jede Ansicht des Routers steht in der Liste des Smoke.
     2. Der Smoke hat einen Inhaltsboden - eine Seite, die nur ihre
        Ueberschrift setzt, faellt durch.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
/* Das Frontend ist seit dem 30.09.2026 die Hash-App unter /quant/
   (quant/app/*.js). vu2/experience.js gibt es nicht mehr. */
const app = readFileSync(join(ROOT, "quant/app/app.js"), "utf8");
const pages = readFileSync(join(ROOT, "quant/app/pages.js"), "utf8");
const method = readFileSync(join(ROOT, "quant/app/page-method.js"), "utf8");
const profiles = JSON.parse(readFileSync(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8")).profiles;
const smoke = readFileSync(join(ROOT, "scripts/vu2/production-smoke.mjs"), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/* Die Routen, die der Router kennt - aus dem Quelltext gelesen (die
   `case`-Zweige von parse()), damit eine neue Route hier automatisch
   auftaucht und nicht von Hand nachgetragen werden muss. */
function routerRoutes() {
  const quelle = ohneKommentare(app);
  const parse = quelle.slice(quelle.indexOf("function parse("), quelle.indexOf("var SECTION"));
  return [...new Set((parse.match(/case "([a-z]+)":/g) || []).map((m) => m.split('"')[1]))].sort();
}
function smokeList() {
  return smoke.slice(smoke.indexOf("const VIEWS="), smoke.indexOf("];", smoke.indexOf("const VIEWS=")));
}
const idsAus = (quelle, anker) => {
  const teil = quelle.slice(quelle.indexOf(anker), quelle.indexOf("];", quelle.indexOf(anker)));
  return (teil.match(/\bid: "([a-z-]+)"/g) || []).map((m) => m.split('"')[1]);
};

test("every route the router can render is in the smoke's list", () => {
  const router = routerRoutes(), liste = smokeList();
  assert.ok(router.length >= 6, "nur " + router.length + " Routen gefunden - liest dieser Test noch das Richtige?");
  const fehlen = router.filter((r) => !liste.includes("#/" + r));
  assert.deepEqual(fehlen, [],
    "diese Routen prueft der Smoke nicht: " + fehlen.join(", ") +
    " - und was er nicht anschaut, verfaellt (gemessen: M26, M28, M29)");
  /* Die Startseite steht als '/quant/#/' in der Liste. */
  assert.ok(liste.includes("'/quant/#/'"), "die Startseite fehlt");
  /* Und die Unterrouten, die eigene Seiten sind. */
  for (const unter of ["#/screener/profi", "/technik", "/zahlen", "#/vergleich/", "#/aktie/ZZZZZ"]) {
    assert.ok(liste.includes(unter), "der Smoke prueft " + unter + " nicht");
  }
});

test("every screener question, methodology topic and strategy is in the smoke's list", () => {
  const liste = smokeList();
  const fragen = idsAus(pages, "var QUESTIONS");
  const themen = idsAus(method, "var TOPICS");
  assert.ok(fragen.length >= 5, "nur " + fragen.length + " Fragen gefunden");
  assert.ok(themen.length >= 5, "nur " + themen.length + " Themen gefunden");
  assert.ok(profiles.length >= 5, "nur " + profiles.length + " Strategien gefunden");
  const fehlen = [
    ...fragen.filter((id) => !liste.includes("#/screener?frage=" + id + "'")).map((id) => "frage=" + id),
    ...themen.filter((id) => !liste.includes("#/methodik/" + id + "'")).map((id) => "methodik/" + id),
    ...profiles.map((p) => p.profileId).filter((id) => !liste.includes("#/strategien/" + id + "'")).map((id) => "strategien/" + id)
  ];
  assert.deepEqual(fehlen, [], "der Smoke prueft nicht: " + fehlen.join(", "));
  /* Die Zahl der Fragen, die der Smoke auf der Seite erwartet, ist die der Quelle. */
  assert.match(ohneKommentare(smoke), new RegExp("fragen\\.length!==" + fragen.length + "\\)"),
    "der Smoke erwartet eine andere Zahl von Fragen als pages.js anbietet");
});

test("old addresses are checked for landing on their new route", () => {
  const quelle = ohneKommentare(smoke);
  assert.match(quelle, /'\/vu2\/\?view=stock&ticker=NVDA':'\/quant\/#\/aktie\/NVDA'/);
  assert.match(quelle, /'\/quant\/\?view=screener':'\/quant\/#\/screener'/);
  assert.match(quelle, /bad\.push\('UMLEITUNG:'/);
  /* Und die Ruecktaste fuehrt zurueck. */
  assert.match(quelle, /page\.goBack\(\)/);
  assert.match(quelle, /page\.goForward\(\)/);
  /* Gewartet wird auf die fertige Route, nicht auf die Uhr. */
  assert.match(quelle, /data-ready|dataset\.ready==='true'/);
});

test("the smoke has a content floor, so a page that renders only its heading fails", () => {
  const quelle = ohneKommentare(smoke);
  assert.match(quelle, /text\.length<\d+\)bad\.push\('ZU_WENIG_INHALT/,
    "der Inhaltsboden fehlt - eine leere Ansicht gilt wieder als gesund");
  /* Der Boden muss ueber dem liegen, was eine Seite aus Titel und
     Untertitel allein erzeugt (gemessen: 54 Zeichen bei einer Ansicht, die
     nur ihre Ueberschrift setzt), und unter der duennsten berechtigten
     Ansicht (in der neuen App die Methodik "Versionen" mit 425 Zeichen;
     vorher die leere Depot-Ansicht mit 562). */
  const boden = Number((quelle.match(/text\.length<(\d+)\)bad\.push\('ZU_WENIG_INHALT/) || [])[1]);
  assert.ok(boden >= 200 && boden <= 420,
    "der Inhaltsboden von " + boden + " Zeichen liegt nicht zwischen 'nur Ueberschrift' und der duennsten echten Ansicht");
});

test("the content checks that found the two defects are still in place", () => {
  const ohneKommentare = smoke.replace(/\/\*[\s\S]*?\*\//g, "");
  /* Die Hauptkopie wird in der neuen App an den qx-Klassen gelesen:
     `.eyebrow` allein traefe `qx-eyebrow` nicht und liesse jede Dachzeile
     ungeprueft. */
  assert.match(ohneKommentare, /\[class\*=eyebrow\]/);
  assert.match(ohneKommentare, /bad\.push\('FORBIDDEN:'/);
  /* M28: die Uebersicht muss Kurse UND Namen zeigen. */
  assert.match(ohneKommentare, /KURSE=/);
  assert.match(ohneKommentare, /NAMEN=/);
  /* M29: der Screener darf keine leeren Zeilen und kein `undefined` zeigen. */
  assert.match(ohneKommentare, /LEERE_ZEILEN=/);
  assert.match(ohneKommentare, /UNDEFINED_IM_SATZ/);
  /* M26: die verdichtete Reise braucht Gruppen und Bereiche. */
  assert.match(ohneKommentare, /VERDICHTUNG_FEHLT/);
  assert.match(ohneKommentare, /BEREICHE_FEHLEN/);
  /* M27: die Kopfzahl eines Titels ausserhalb des Panels. */
  assert.match(ohneKommentare, /KEIN_KURS/);
  assert.match(ohneKommentare, /KEIN_KURSDATUM/);
  /* Und die datenarmen Titel stehen weiter in der Liste. */
  for (const ticker of ["ACAA", "EDVA", "AHT-P-D"]) {
    assert.ok(smoke.includes(ticker), "der gemessene Fall " + ticker + " ist aus dem Smoke verschwunden");
  }
});

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
const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
const smoke = readFileSync(join(ROOT, "scripts/vu2/production-smoke.mjs"), "utf8");

/* Die Ansichten, die der Router kennt - aus dem Quelltext gelesen, damit eine
   neue Ansicht hier automatisch auftaucht und nicht von Hand nachgetragen
   werden muss. */
function routerViews() {
  const ohneKommentare = seite.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...new Set((ohneKommentare.match(/view===?'[a-z]+'/g) || []).map((m) => m.split("'")[1]))].sort();
}
function smokeViews() {
  const liste = smoke.slice(smoke.indexOf("const VIEWS="), smoke.indexOf("];", smoke.indexOf("const VIEWS=")));
  const genannt = new Set((liste.match(/view=([a-z]+)/g) || []).map((m) => m.split("=")[1]));
  /* Die Einstiegsseite steht als '/vu2/' in der Liste, nicht als view=home. */
  if (/'\/vu2\/'/.test(liste)) genannt.add("home");
  return [...genannt].sort();
}

test("every view the router can render is in the smoke's list", () => {
  const router = routerViews(), imSmoke = smokeViews();
  assert.ok(router.length >= 15, "nur " + router.length + " Ansichten gefunden - liest dieser Test noch das Richtige?");
  const fehlen = router.filter((v) => !imSmoke.includes(v));
  assert.deepEqual(fehlen, [],
    "diese Ansichten prueft der Smoke nicht: " + fehlen.join(", ") +
    " - und was er nicht anschaut, verfaellt (gemessen: M26, M28, M29)");
});

test("the smoke has a content floor, so a page that renders only its heading fails", () => {
  const ohneKommentare = smoke.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(ohneKommentare, /text\.length<\d+\)bad\.push\('ZU_WENIG_INHALT/,
    "der Inhaltsboden fehlt - eine leere Ansicht gilt wieder als gesund");
  /* Der Boden muss ueber dem liegen, was eine Seite aus Titel und
     Untertitel allein erzeugt (gemessen: 54 Zeichen bei einer Ansicht, die
     nur ihre Ueberschrift setzt), und unter der duennsten berechtigten
     Ansicht (die leere Depot-Ansicht mit 562 Zeichen). */
  const boden = Number((ohneKommentare.match(/text\.length<(\d+)\)bad\.push\('ZU_WENIG_INHALT/) || [])[1]);
  assert.ok(boden >= 200 && boden <= 560,
    "der Inhaltsboden von " + boden + " Zeichen liegt nicht zwischen 'nur Ueberschrift' und der duennsten echten Ansicht");
});

test("the content checks that found the two defects are still in place", () => {
  const ohneKommentare = smoke.replace(/\/\*[\s\S]*?\*\//g, "");
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

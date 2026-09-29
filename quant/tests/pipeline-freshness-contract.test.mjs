/* =========================================================================
   DIE FEHLERKLASSE, DIE VIER TAGE LANG NIEMAND GESEHEN HAT

   Am 29.09.2026 lief `market-data-refresh` gruen durch und veroeffentlichte
   frische Tageskurse. Der Stichtag, den das Frontend liest, stand
   trotzdem seit dem 25.09. Grund: die Produkt-Materialisierung war ein
   zweiter Workflow hinter `workflow_run` - und der hat auf main NIE
   gefeuert. Beide Laeufe, die es je gab, waren von Hand gestartet.

   Ein roter Lauf alarmiert. Hier war jede Nacht alles gruen.

   Diese Tests halten zwei Dinge fest:

   1. EIN GRUENER MARKTLAUF MIT NEUER ABLAGE-SITZUNG, ABER UNVERAENDERTEM
      PRODUKTSTAND, IST KEIN GESUNDER GESAMTZUSTAND. Das ist die
      Fehlerklasse selbst, als Zusicherung.

   2. DIE MATERIALISIERUNG HAENGT PER `needs` IN DER KANONISCHEN KETTE.
      Wird sie dort entfernt, wird dieser Test rot - und nicht erst der
      naechste Nutzer, der einen vier Tage alten Kurs sieht.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Fresh = await import(join(ROOT, "scripts/quant/measure-pipeline-freshness.mjs"));

const REFRESH = join(ROOT, ".github/workflows/market-data-refresh.yml");
const MATERIALIZE = join(ROOT, ".github/workflows/product-intelligence-materialization.yml");

/* ---------------------------------------------------------------------
   1. DIE FEHLERKLASSE
   --------------------------------------------------------------------- */

test("neue Ablage-Sitzung bei altem Produktstand ist KEIN gesunder Zustand", () => {
  /* Genau die Lage vom 29.09.: die Ablage traegt den 28., das Produkt
     noch den 25. Ein Bericht, der das PASS nennt, waere der Fehler. */
  const sitzung = Fresh.letzteSitzung(new Date("2026-09-29T04:00:00Z"));
  assert.equal(sitzung, "2026-09-28", "die letzte abgeschlossene Sitzung ist der Montag");

  const storeLag = Fresh.sitzungenZwischen("2026-09-28", sitzung);
  const productLag = Fresh.sitzungenZwischen("2026-09-25", sitzung);
  assert.equal(storeLag, 0, "die Ablage ist aktuell");
  assert.equal(productLag, 1, "das Produkt liegt eine Handelssitzung zurueck");

  /* Und die Ableitung daraus muss FAIL sein, nicht PASS. */
  const gesund = storeLag === 0 && productLag === 0;
  assert.equal(gesund, false,
    "ein aktueller Store bei altem Produktstand darf nicht als gesund gelten");
});

test("der Rueckstand zaehlt Handelssitzungen, nicht Kalendertage", () => {
  /* Der Grund, warum der Waechter am Wochenende schweigen darf: vom
     Freitag auf den Montag liegt EINE Sitzung, nicht drei Tage. */
  assert.equal(Fresh.sitzungenZwischen("2026-09-25", "2026-09-28"), 1,
    "Freitag auf Montag ist eine Sitzung");
  assert.equal(Fresh.sitzungenZwischen("2026-09-28", "2026-09-28"), 0);
});

test("am Wochenende bleibt die letzte abgeschlossene Sitzung der Freitag", () => {
  /* Samstagmittag darf kein Alarm sein. Ein Waechter, der jedes
     Wochenende schreit, wird abgeschaltet - und dann fehlt er, wenn es
     zaehlt. */
  const samstag = Fresh.letzteSitzung(new Date("2026-09-26T16:00:00Z"));
  assert.equal(samstag, "2026-09-25", "am Samstag ist der Freitag die letzte Sitzung");
});

test("ein unbekannter Stichtag ist kein PASS", () => {
  /* Wo ein Wert fehlt, sagt der Vertrag UNKNOWN. Wer UNKNOWN als
     bestanden liest, baut sich denselben blinden Fleck neu. */
  assert.equal(Fresh.sitzungenZwischen(null, "2026-09-28"), null);
  assert.equal(Fresh.sitzungenZwischen("2026-09-28", null), null);
});

/* ---------------------------------------------------------------------
   2. DIE KETTE
   --------------------------------------------------------------------- */

test("die Materialisierung haengt per needs in der kanonischen Kette", () => {
  const yml = readFileSync(REFRESH, "utf8");
  assert.match(yml, /^\s{2}materialize:/m,
    "der Marktlauf hat keine Materialisierungs-Stufe mehr - die Kette ist offen");
  assert.match(yml, /needs:\s*refresh/,
    "die Materialisierung haengt nicht mehr am Marktlauf");
  assert.match(yml, /uses:\s*\.\/\.github\/workflows\/product-intelligence-materialization\.yml/,
    "die Stufe ruft die Materialisierung nicht mehr auf");
});

test("die Kette braucht keinen PAT und keinen externen Ausloeser", () => {
  /* Der Owner-Entscheid ist ausdruecklich: keine PAT-Loesung, kein
     Secret nur zum Starten der naechsten Stufe. */
  const yml = readFileSync(REFRESH, "utf8");
  assert.doesNotMatch(yml, /secrets\.(PAT|GH_PAT|PERSONAL_ACCESS_TOKEN|WORKFLOW_TOKEN)/,
    "die Kette greift zu einem persoenlichen Token - das war ausgeschlossen");
  assert.doesNotMatch(yml, /api\.github\.com\/repos\/[^\s]*\/dispatches/,
    "die Kette startet den naechsten Schritt ueber die API statt ueber needs");
});

test("der Freshness-Contract faellt zu, statt nur zu berichten", () => {
  const yml = readFileSync(REFRESH, "utf8");
  assert.match(yml, /^\s{2}freshness-contract:/m, "die Fail-Closed-Stufe fehlt");
  assert.match(yml, /measure-pipeline-freshness\.mjs --strict/,
    "der Vertrag laeuft ohne --strict - dann ist er eine Notiz, keine Sperre");
  assert.match(yml, /P0_DATA_PIPELINE_FROZEN/,
    "der Fehlerfall traegt keinen Namen, nach dem man suchen kann");
  /* Und er muss auch dann laufen, wenn die Materialisierung rot war -
     sonst schweigt er genau im Ernstfall. */
  assert.match(yml, /needs:\s*\[refresh,\s*materialize\]/);
  assert.match(yml, /if:\s*always\(\)\s*&&\s*needs\.refresh\.result\s*==\s*'success'/);
});

test("die Materialisierung ist aufrufbar und idempotent", () => {
  const yml = readFileSync(MATERIALIZE, "utf8");
  assert.match(yml, /^\s{2}workflow_call:/m,
    "die Stufe ist nicht aufrufbar - dann kann die Kette sie nicht einhaengen");
  assert.match(yml, /github\.event_name == 'workflow_call'/,
    "der Job laesst den Aufruf aus der Kette nicht zu");
  assert.match(yml, /id: noetig/, "die Idempotenz-Stufe fehlt");
  assert.match(yml, /noop=true/,
    "es gibt keinen sauberen No-Op - ein Wiederholungslauf kostet dann eine Stunde umsonst");
  /* Die schweren Schritte muessen wirklich an der Bedingung haengen. */
  const bedingt = (yml.match(/if: steps\.noetig\.outputs\.noop != 'true'/g) || []).length;
  assert.ok(bedingt >= 15,
    "nur " + bedingt + " Schritte haengen am No-Op - die Idempotenz greift nicht durch");
});

test("der alte workflow_run-Pfad darf bleiben, aber nichts mehr tragen", () => {
  /* Er bleibt als zweiter Guertel stehen. Sollte er je feuern, macht die
     Idempotenz daraus einen No-Op statt einer zweiten Materialisierung.
     Was NICHT sein darf: dass die Kette wieder allein auf ihm ruht. */
  const refresh = readFileSync(REFRESH, "utf8");
  assert.match(refresh, /uses:\s*\.\/\.github\/workflows\/product-intelligence-materialization\.yml/,
    "ohne den direkten Aufruf haengt alles wieder an workflow_run - genau der Fehler von vorher");
});

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
import { decide } from "../../scripts/quant/materialization-decision.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Fresh = await import(join(ROOT, "scripts/quant/measure-pipeline-freshness.mjs"));

const REFRESH = join(ROOT, ".github/workflows/market-data-refresh.yml");
const MATERIALIZE = join(ROOT, ".github/workflows/product-intelligence-materialization.yml");
const MONITOR = join(ROOT, ".github/workflows/freshness-monitor.yml");

/* ---------------------------------------------------------------------
   HILFSMITTEL FUER DIE ZEITACHSE DES WAECHTERS

   Gemessen an den echten planmaessigen Laeufen von market-data-refresh:
   nominal 22:30, tatsaechlich gefeuert 22:40 bis 02:11 UTC (GitHub
   verzoegert geplante Laeufe), Refresh 90 min, Materialisierung 19 min,
   Vertrag 2 min. Spaetestes beobachtetes Ende also gegen 03:45 UTC -
   gut fuenf Stunden nach dem nominalen Start.

   Der Waechter braucht Reserve darauf, sonst misst er mitten in die
   Kette. SIEBEN STUNDEN ist die Untergrenze, die dieser Test verlangt.
   --------------------------------------------------------------------- */

const KETTENBUDGET_MINUTEN = 7 * 60;

/** Die `- cron: '...'`-Zeilen eines Workflows, in Reihenfolge. */
function cronZeilen(yml) {
  return [...yml.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

/** Der `if:`-Block eines Jobs, bis zum naechsten Schluessel auf Job-Ebene. */
function jobBedingung(yml, job) {
  const ab = yml.indexOf("\n  " + job + ":");
  if (ab < 0) return null;
  const rest = yml.slice(ab);
  const m = rest.match(/\n    if:\s*>-?\s*\n((?:\s{6}.*\n)+)/);
  return m ? m[1] : (rest.match(/\n    if:\s*(.*)/) || [null, null])[1];
}

/** Minute, Stunde und Wochentage eines 5-Feld-Crons (nur `M H * * DOW`). */
function cronTeile(cron) {
  const [min, std, dom, mon, dow] = cron.trim().split(/\s+/);
  assert.equal(dom, "*", "dieser Test versteht nur `M H * * DOW`: " + cron);
  assert.equal(mon, "*", "dieser Test versteht nur `M H * * DOW`: " + cron);
  const tage = new Set();
  for (const teil of dow.split(",")) {
    if (teil === "*") { for (let d = 0; d < 7; d++) tage.add(d); continue; }
    const spanne = teil.match(/^(\d)-(\d)$/);
    if (spanne) { for (let d = +spanne[1]; d <= +spanne[2]; d++) tage.add(d % 7); }
    else tage.add(+teil % 7);
  }
  return { min: +min, std: +std, tage };
}

/** Alle Feuerzeitpunkte eines Crons in einem Fenster von `tage` Tagen. */
function feuerzeiten(cron, start, tage = 14) {
  const { min, std, tage: dow } = cronTeile(cron);
  const aus = [];
  for (let i = 0; i < tage; i++) {
    const t = new Date(Date.UTC(
      start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i, std, min, 0));
    if (dow.has(t.getUTCDay())) aus.push(t);
  }
  return aus;
}

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
  /* In einem aufgerufenen Workflow ist github.event_name das Ereignis des
     AUFRUFERS - 'workflow_call' kommt dort nie vor. Lauf 36655067686
     (30.09.2026): Marktlauf gruen, Materialisierung "skipped". Der Aufruf
     wird deshalb ueber eine Eingabe erkannt, die der Aufrufer setzt. */
  assert.match(yml, /^\s{4}inputs:\s*\n\s{6}orchestrated:\s*\n\s{8}type: boolean/m,
    "die Stufe hat keine Eingabe, an der sie den Aufruf aus der Kette erkennt");
  const jobIf = (yml.match(/^\s{2}materialize:\s*\n\s{4}if: >-\n((?:\s{6}.*\n)+)/m) || [])[1] || "";
  assert.match(jobIf, /inputs\.orchestrated == true/,
    "der Job laesst den Aufruf aus der Kette nicht zu");
  assert.doesNotMatch(jobIf, /github\.event_name == 'workflow_call'/,
    "github.event_name ist im aufgerufenen Workflow nie 'workflow_call' - diese Bedingung ist tot");
  const refresh = readFileSync(REFRESH, "utf8");
  assert.match(refresh, /product-intelligence-materialization\.yml\s*\n\s+with:\s*\n\s+orchestrated: true/,
    "der Aufrufer setzt die Kennung nicht");
  /* Die Idempotenz-Stufe muss den Stand lesen, den der Marktlauf gerade
     gepusht hat - nicht den ausloesenden Commit (Lauf 36952507489). */
  const job = yml.slice(yml.search(/^\s{2}materialize:/m));
  const checkout = (job.match(/uses: actions\/checkout@v4\s*\n\s+with:\s*\n((?:\s{10}.*\n)+)/) || [])[1] || "";
  assert.match(checkout, /ref: \$\{\{ github\.ref \}\}/,
    "die Materialisierung checkt den ausloesenden Commit aus und sieht den frischen Ablagestand nicht");
  assert.ok(job.indexOf("actions/checkout@v4") < job.indexOf("id: noetig"), "die Idempotenz-Stufe laeuft vor dem Checkout");
  assert.match(yml, /id: noetig/, "die Idempotenz-Stufe fehlt");
  /* Erzwingen nur beim manuellen Start - nie aus der Kette oder dem Zeitplan. */
  assert.match(yml, /workflow_dispatch:\s*\n\s+inputs:\s*\n(?:\s+#.*\n)*\s+force:\s*\n/, "kein manuelles Erzwingen nach einem Methodik-Wechsel");
  assert.match(yml, /github\.event_name == 'workflow_dispatch' && inputs\.force == true/,
    "force muss an den manuellen Start gebunden sein, sonst ist die Kette nicht mehr idempotent");
  // Der No-Op entsteht in scripts/quant/materialization-decision.mjs und
  // landet ueber $GITHUB_OUTPUT im Schritt - nicht nur als Wort im Kommentar.
  assert.match(yml, /materialization-decision\.mjs[^\n]*\\\s*\n[^\n]*>> "\$GITHUB_OUTPUT"/,
    "die No-Op-Entscheidung erreicht den Schritt nicht");
  assert.deepEqual(decide({ store: "2026-10-02", product: "2026-10-02" }), { noop: true, reason: "UP_TO_DATE" },
    "es gibt keinen sauberen No-Op - ein Wiederholungslauf kostet dann eine Stunde umsonst");
  /* Die schweren Schritte muessen wirklich an der Bedingung haengen. */
  const bedingt = (yml.match(/if: steps\.noetig\.outputs\.noop != 'true'/g) || []).length;
  assert.ok(bedingt >= 15,
    "nur " + bedingt + " Schritte haengen am No-Op - die Idempotenz greift nicht durch");
});

/* ---------------------------------------------------------------------
   3. DER WAECHTER DARF NICHT MITTEN IN DIE KETTE MESSEN
   --------------------------------------------------------------------- */

test("kein Waechter-Slot liegt im Laufzeitfenster der Kette", () => {
  /* Der Fehler, den dieser Test vor seinem ersten Feuern gefunden hat:
     `produktstand` erbte vier Cron-Zeiten des Monitors, und eine davon
     (23:15) liegt im Laufzeitfenster der Kette, die er ueberwacht. Er
     haette jede Werktagsnacht P0_DATA_PIPELINE_FROZEN gemeldet, waehrend
     alles in Ordnung ist - und ein Waechter, der jede Nacht schreit,
     wird abgeschaltet.

     Dieser Test leitet die Regel her statt sie zu behaupten: er nimmt die
     Cron-Zeilen, die der Job wirklich annimmt, rechnet fuer jeden
     Feuerzeitpunkt den erwarteten Stichtag aus und prueft, ob die Kette
     fuer diesen Stichtag ueberhaupt Zeit hatte, fertig zu werden. */

  const monitor = readFileSync(MONITOR, "utf8");
  const bedingung = jobBedingung(monitor, "produktstand");
  assert.ok(bedingung, "der Job `produktstand` hat keine Bedingung mehr");

  /* Welcher Slot ist ausgenommen? Genau die, die die Bedingung
     ausdruecklich ausschliesst. */
  const ausgenommen = new Set(
    [...bedingung.matchAll(/github\.event\.schedule\s*!=\s*'([^']+)'/g)].map((m) => m[1]));

  const angenommen = cronZeilen(monitor).filter((c) => !ausgenommen.has(c));
  assert.ok(angenommen.length > 0, "der Waechter nimmt keinen Slot mehr an - dann prueft er nie");

  /* Wann startet die Kette? Aus ihrem eigenen Cron, nicht aus einer
     Annahme. */
  const kette = cronZeilen(readFileSync(REFRESH, "utf8"));
  assert.equal(kette.length, 1, "die Kette hat " + kette.length + " Zeitplaene - dieser Test erwartet einen");
  const kettenStart = cronTeile(kette[0]);

  const verstoesse = [];
  for (const cron of angenommen) {
    for (const zeit of feuerzeiten(cron, new Date(Date.UTC(2026, 8, 28)))) {
      const stichtag = Fresh.letzteSitzung(zeit);
      if (!stichtag) continue;

      /* Die Kette fuer diesen Stichtag startet am Abend des Stichtags. */
      const [j, m, t] = stichtag.split("-").map(Number);
      const start = Date.UTC(j, m - 1, t, kettenStart.std, kettenStart.min, 0);
      const reserve = (zeit.getTime() - start) / 60000;

      if (reserve < KETTENBUDGET_MINUTEN) {
        verstoesse.push(
          cron + " feuert " + zeit.toISOString().slice(0, 16) +
          " und erwartet den Stichtag " + stichtag + " - die Kette dafuer startet erst " +
          new Date(start).toISOString().slice(0, 16) +
          " (" + Math.round(reserve) + " min Reserve, " + KETTENBUDGET_MINUTEN + " verlangt)");
      }
    }
  }

  assert.deepEqual(verstoesse, [],
    "Waechter-Slots im Laufzeitfenster der Kette:\n  " + verstoesse.join("\n  "));
});

test("der Waechter prueft ueberhaupt noch, und zwar nach der Kette", () => {
  /* Die Gegenprobe zum Test oben: man koennte ihn gruen machen, indem man
     jeden Slot ausnimmt. Dann prueft nie jemand. Mindestens ein
     angenommener Slot muss nach dem Ende der Kette liegen. */
  const monitor = readFileSync(MONITOR, "utf8");
  const bedingung = jobBedingung(monitor, "produktstand");
  const ausgenommen = new Set(
    [...bedingung.matchAll(/github\.event\.schedule\s*!=\s*'([^']+)'/g)].map((m) => m[1]));
  const angenommen = cronZeilen(monitor).filter((c) => !ausgenommen.has(c));

  /* Und der Wochenrhythmus muss halten: jede Handelssitzung braucht
     danach mindestens eine Pruefung. Die Kette laeuft Mo-Fr; also muss
     fuer jeden dieser Abende ein Waechter-Slot folgen. */
  const geprueft = new Set();
  for (const cron of angenommen) {
    for (const zeit of feuerzeiten(cron, new Date(Date.UTC(2026, 8, 28)), 10)) {
      const stichtag = Fresh.letzteSitzung(zeit);
      if (stichtag) geprueft.add(stichtag);
    }
  }
  assert.ok(geprueft.size >= 5,
    "nur " + geprueft.size + " Stichtage werden in zehn Tagen ueberhaupt geprueft: " +
    [...geprueft].join(", "));
  assert.match(bedingung, /github\.event_name == 'schedule'/,
    "der Waechter laeuft nicht mehr planmaessig - dann haengt er an einem Menschen");
});

test("der alte workflow_run-Pfad darf bleiben, aber nichts mehr tragen", () => {
  /* Er bleibt als zweiter Guertel stehen. Sollte er je feuern, macht die
     Idempotenz daraus einen No-Op statt einer zweiten Materialisierung.
     Was NICHT sein darf: dass die Kette wieder allein auf ihm ruht. */
  const refresh = readFileSync(REFRESH, "utf8");
  assert.match(refresh, /uses:\s*\.\/\.github\/workflows\/product-intelligence-materialization\.yml/,
    "ohne den direkten Aufruf haengt alles wieder an workflow_run - genau der Fehler von vorher");
});

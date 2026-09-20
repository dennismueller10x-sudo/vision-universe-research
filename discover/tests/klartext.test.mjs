/* =========================================================================
   Die Übersetzungsschicht.

   Was hier geprüft wird, sind keine Formulierungen, sondern Zusagen: dass
   jede Karte eine Aussage trägt, dass keine Aussage ihrer eigenen Zahl
   widerspricht, dass aus denselben Zahlen derselbe Satz entsteht - und
   dass die Vereinfachung nichts behauptet, was die Kennzahl nicht hergibt.

   Der letzte Punkt ist der wichtigste. "Stärker als 100 % der Aktien" ist
   kein Rundungsfehler, sondern eine Unmöglichkeit; "Über zwölf Monate im
   Plus" über einer Karte mit -19,6 % ist keine Ungenauigkeit, sondern eine
   falsche Auskunft. Beides ist in dieser Fassung vorgekommen, beides steht
   jetzt hier.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const K = require(join(root, "discover", "engines", "klartext.js"));

function titel(over) {
  return Object.assign({
    symbol: "TEST", companyName: "Test AG",
    signals: { new52WeekHigh: false, nearHigh: false, marketLeader: false,
               momentumLeader: false, relativeStrengthLeader: false, breakout: false,
               trendIntact: false, sectorLeader: false },
    metrics: { return1M: 0.02, return3M: 0.05, return6M: 0.1, return12M: 0.2,
               distanceTo52wHigh: -0.2, distanceTo52wLow: 0.4,
               leadershipPercentile: 50, relativeStrengthPercentile: 50,
               momentumPercentile: 50, volatility252d: 0.3, maxDrawdown252d: -0.1,
               trendAlignment: 0.5 }
  }, over || {});
}

test("jede Karte trägt eine Aussage - auch die unauffällige", () => {
  const flach = titel({ metrics: Object.assign(titel().metrics, { return12M: -0.05 }) });
  const k = K.karte(flach, {});
  assert.ok(k.story, "ein Titel ohne Signal bleibt ohne Satz");
  assert.match(k.story, /Stand vor einem Jahr/);
});

test("keine Aussage widerspricht ihrer eigenen Zahl", () => {
  /* Der Fall aus der Praxis: ein Titel mit positiver Zwölfmonatsrendite
     steht in einer Reihe, die über drei Monate spricht - und dort ist er
     im Minus. */
  const s = titel({ metrics: Object.assign(titel().metrics, { return12M: 0.11, return3M: -0.196 }) });
  const k = K.karte(s, { rowId: "breakout-watch" });
  assert.equal(k.zahl.quelle, "return3M");
  assert.ok(k.zahl.roh < 0);
  /* Erlaubt ist der Satz, der das Minus benennt ("Zuletzt schwächer,
     über zwölf Monate im Plus") - verboten ist der, der es verschweigt. */
  assert.match(k.story, /^Zuletzt schwächer/, k.story);
});

test("die Zahl stammt aus dem Zeitraum, über den die Reihe spricht", () => {
  const s = titel({ signals: Object.assign(titel().signals, { momentumLeader: true }) });
  assert.equal(K.karte(s, { rowId: "momentum-leaders" }).zahl.quelle, "return6M");
  assert.equal(K.karte(s, { rowId: "breakout-watch" }).zahl.quelle, "return3M");
  assert.equal(K.karte(s, {}).zahl.quelle, "return6M", "ohne Reihe bestimmt die Geschichte");
});

test("niemand ist stärker als 100 % der Aktien", () => {
  assert.equal(K.staerkerAls(100), "Stärker als fast alle Aktien");
  assert.equal(K.staerkerAls(99.7), "Stärker als fast alle Aktien");
  assert.equal(K.staerkerAls(96), "Stärker als 96\u00a0% der Aktien");
  assert.equal(K.staerkerAls(null), null);
});

test("derselbe Titel ergibt denselben Satz - jedes Mal", () => {
  const s = titel({ signals: Object.assign(titel().signals, { marketLeader: true }) });
  const a = K.karte(s, { rowId: "market-leaders" });
  const b = K.karte(JSON.parse(JSON.stringify(s)), { rowId: "market-leaders" });
  assert.deepEqual(a, b);
});

test("der Zusatz wiederholt die Überschrift nicht", () => {
  const s = titel({ signals: Object.assign(titel().signals, { new52WeekHigh: true }) });
  const k = K.karte(s, {});
  assert.match(k.story, /höchsten Stand/);
  assert.ok(!/Jahreshoch$/.test(k.zusatz || ""),
    "Zusatz wiederholt die Aussage: " + k.zusatz);
});

test("Prozent wird deutsch geschrieben und nicht scheingenau", () => {
  /* Vor dem Prozentzeichen steht ein geschuetztes Leerzeichen - so
     schreibt man es im Deutschen, und so bricht die Zahl nie um. */
  assert.equal(K.prozent(1.495307), "+150\u00a0%");
  assert.equal(K.prozent(0.0421), "+4,2\u00a0%");
  assert.equal(K.prozent(-0.196), "−19,6\u00a0%");
  assert.equal(K.prozent(0.2, false), "20\u00a0%");
  assert.equal(K.prozent(null), null);
});

test("die Begründung bleibt ein Satz und nennt ihre Zahlen", () => {
  const s = titel({ signals: Object.assign(titel().signals, { new52WeekHigh: true }),
                    metrics: Object.assign(titel().metrics,
                      { return12M: 1.5, leadershipPercentile: 99.4, distanceTo52wHigh: 0 }) });
  const satz = K.begruendung(s);
  assert.equal((satz.match(/\./g) || []).length, 1, "mehr als ein Satz: " + satz);
  assert.match(satz, /150\s%/);
  assert.ok(!/99,4|100\s%/.test(satz), "Perzentil ungerundet oder bei 100: " + satz);
});

test("ein Titel ohne Bewegung bekommt keinen zusammengesetzten Satz", () => {
  const s = titel({ discoveryEligible: false,
                    metrics: Object.assign(titel().metrics,
                      { return12M: 0, return6M: 0, return3M: 0, return1M: 0 }) });
  assert.equal(K.begruendung(s), "Zurzeit keine Kursbewegung.");
});

test("die Plaketten tragen Worte, keine Kürzel", () => {
  for (const id of ["new52WeekHigh", "marketLeader", "relativeStrengthLeader", "breakout"]) {
    const p = K.plakette(id);
    assert.ok(p && p.label, id + " hat keine Beschriftung");
    assert.ok(!/^(RS|NEW|MARKET|BREAKOUT)/.test(p.label), id + ": " + p.label);
    assert.ok(/[a-zäöü]/.test(p.label), id + " ist kein Wort: " + p.label);
  }
});

test("die Zeitachse lässt aus, was nicht vorliegt", () => {
  const s = titel({ metrics: { return12M: 0.2, return1M: null } });
  const achse = K.zeitachse(s);
  assert.deepEqual(achse.map((e) => e.key), ["return12M"]);
  assert.equal(K.zeitachse({ metrics: {} }).length, 0);
});

test("die Jahresspanne beschreibt die Lage in Worten", () => {
  const oben = K.jahresspanne(titel({ metrics: Object.assign(titel().metrics,
    { distanceTo52wHigh: -0.001, distanceTo52wLow: 0.9 }) }));
  assert.ok(oben.position > 0.99);
  assert.match(oben.satz, /höchsten Punkt/);
  const mitte = K.jahresspanne(titel({ metrics: Object.assign(titel().metrics,
    { distanceTo52wHigh: -0.25, distanceTo52wLow: 0.25 }) }));
  assert.ok(mitte.position > 0.4 && mitte.position < 0.6);
  assert.match(mitte.satz, /unter dem höchsten/);
});

/* ------------------------------------------------------- Ausgelieferte Daten */

test("keine ausgelieferte Karte bleibt ohne Aussage", () => {
  const basis = join(root, "discover", "data", "rows");
  let geprueft = 0;
  for (const universum of readdirSync(basis)) {
    for (const datei of readdirSync(join(basis, universum))) {
      const row = JSON.parse(readFileSync(join(basis, universum, datei), "utf8"));
      for (const card of row.cards || []) {
        assert.ok(card.plain && card.plain.story,
          `${universum}/${datei}: ${card.symbol} ohne Aussage`);
        geprueft++;
      }
    }
  }
  assert.ok(geprueft > 100, "zu wenige Karten geprueft: " + geprueft);
});

test("keine ausgelieferte Karte behauptet Stärke über einer Minuszahl", () => {
  const basis = join(root, "discover", "data", "rows");
  /* Ein Satz, der das Minus selbst benennt, ist kein Widerspruch. */
  const stark = /(stärksten|Marktführ|Aufwärtstrend|im Plus|davon|Aufwind|Bewegung)/;
  const benennt = /^(Zuletzt schwächer|Etwas unter|Deutlich unter|Nach schwachen)/;
  for (const universum of readdirSync(basis)) {
    for (const datei of readdirSync(join(basis, universum))) {
      const row = JSON.parse(readFileSync(join(basis, universum, datei), "utf8"));
      for (const card of row.cards || []) {
        const p = card.plain;
        if (!p || !p.zahl || p.zahl.roh >= 0) continue;
        assert.ok(!stark.test(p.story) || benennt.test(p.story),
          `${universum}/${datei}: ${card.symbol} "${p.story}" über ${p.zahl.wert}`);
      }
    }
  }
});

test("auf den Karten der Startseite steht kein Fachkürzel mehr", () => {
  /* Die Prüfung gilt der AUSLIEFERUNG, nicht dem Stylesheet: was im
     Payload steht, kann die Oberfläche zeigen. Score, Perzentil, RS und
     Multiplikatoren gehören auf die Aktienseite - in der Beschriftung
     einer Karte haben sie nichts zu suchen. */
  const basis = join(root, "discover", "data", "rows");
  const verboten = /\b(RS|RVOL|Score|Perzentil|Leadership|Momentum Score|[0-9.,]+x)\b/;
  for (const universum of readdirSync(basis)) {
    for (const datei of readdirSync(join(basis, universum))) {
      const row = JSON.parse(readFileSync(join(basis, universum, datei), "utf8"));
      for (const card of row.cards || []) {
        const texte = [card.plain && card.plain.story, card.plain && card.plain.zusatz]
          .concat((card.badges || []).map((b) => b.label))
          .filter(Boolean);
        for (const t of texte) {
          assert.ok(!verboten.test(t), `${universum}/${datei}: ${card.symbol} zeigt "${t}"`);
        }
      }
    }
  }
});

/* ---------------------------------------------------------------------
   Fundamentale Geschichten (SEC-Kennzahlen f_*).
   --------------------------------------------------------------------- */
function jung(over) {
  /* Ein junger Titel: Abschluesse vorhanden, aber keine Zwoelfmonatsrendite. */
  return Object.assign({
    symbol: "JUNG", companyName: "Junge AG",
    signals: { new52WeekHigh: false, nearHigh: false, marketLeader: false, momentumLeader: false,
               relativeStrengthLeader: false, breakout: false, compounder: false, turnaround: false, netCash: true },
    metrics: { return12M: null, return6M: null, return3M: 0.02, return1M: 0.01,
               f_revenueGrowth3y: 0.23, f_netMargin: 0.12, f_fcfMargin: 0.18 }
  }, over || {});
}

test("fundamentale Reihe: der Satz sagt, warum der Titel in der Reihe ist - mit der Zahl der Reihe", () => {
  const k = K.karte(jung(), { rowId: "umsatz-waechst-stark" });
  assert.equal(k.storyId, "fUmsatzStark");
  assert.match(k.story, /Umsatz wächst seit drei Jahren/);
  assert.equal(k.zahl.quelle, "f_revenueGrowth3y");
  assert.equal(k.zahl.roh, 0.23);
  assert.match(k.zahl.label, /Umsatz p\. a\./);
  const c = K.karte(jung(), { rowId: "cashflow-maschinen" });
  assert.equal(c.storyId, "fCashflowMaschine"); assert.equal(c.zahl.quelle, "f_fcfMargin");
});

test("ohne Kursgeschichte sprechen die Abschluesse - auch auf einer Kursreihe", () => {
  const k = K.karte(jung(), { rowId: "momentum-leaders" });
  assert.ok(k.story, "ein junger Titel mit Abschluessen bleibt nicht ohne Aussage");
  assert.equal(k.storyId, "fUmsatzStark");
  assert.equal(k.zahl.quelle, "f_revenueGrowth3y", "die Zahl gehoert zum Satz");
});

test("auf einer Kursreihe steht der Kurs vor den Abschluessen", () => {
  const s = jung({ metrics: { return12M: 0.4, return6M: 0.2, return3M: 0.1, return1M: 0.05, f_revenueGrowth3y: 0.23, f_netMargin: 0.12 } });
  const k = K.karte(s, { rowId: "momentum-leaders" });
  assert.ok(!/^f/.test(k.storyId), "Kursgeschichte zuerst: " + k.storyId);
  assert.equal(k.zahl.quelle, "return6M");
});

test("fundamentale Reihe: derselbe wahre Satz steht nicht sechsmal untereinander", () => {
  const liste = [1, 2, 3, 4, 5, 6].map((i) => jung({ symbol: "J" + i }));
  const texte = K.reihe(liste, "umsatz-waechst-stark");
  const ids = texte.map((t) => t.storyId);
  assert.ok(texte.every((t) => t.story), "jede Karte traegt einen Satz");
  for (const id of new Set(ids)) assert.ok(ids.filter((x) => x === id).length <= K.MAX_JE_REIHE, id);
});

test("keine fundamentale Geschichte behauptet Staerke ueber einer negativen Zahl", () => {
  const s = jung({ metrics: { f_revenueGrowth3y: -0.2, f_netMargin: -0.05 }, signals: { netCash: false } });
  const k = K.karte(s, { rowId: "umsatz-waechst-stark" });
  assert.equal(k.storyId, "fVerlust"); assert.equal(k.zahl.quelle, "f_netMargin");
  for (const g of K.FUNDAMENTAL_GESCHICHTEN) assert.ok(g.id && typeof g.wenn === "function" && typeof g.satz === "function");
});

/* Die Fussnote des Tagesverlaufs: STALE hat zwei Gruende und braucht zwei
   Saetze. Gefunden an der Widerrufs-Aufnahme vom 17.09.2026, wo das
   Etikett richtig "Heute · Stand 13:20 · nicht aktuell" sagte und die
   Fussnote darunter behauptete, der Stand sei nicht vom letzten
   Handelstag - und im selben Satz den heutigen Tag als erwartet nannte.

   Geprueft wird die Quelle, weil die Fussnote im Browser entsteht: der
   Satz fuer den stehen gebliebenen Lauf darf die Tagesbehauptung nicht
   enthalten. Den Nachweis am laufenden Produkt fuehrt
   scripts/discover/browser-qa-realtime.mjs ("fussnoteStimmt"). */
test("stehen gebliebener Lauf und aeltere Sitzung sind zwei verschiedene Saetze", () => {
  const code = readFileSync(join(root, "discover", "ui", "detail.js"), "utf8");
  const fn = code.slice(code.indexOf("function staleSatz("));
  const koerper = fn.slice(0, fn.indexOf("\n  }") + 4);
  assert.ok(koerper.includes("runningSessionStaleAsOf"), "der Grund entscheidet den Satz");
  const zweige = koerper.split("runningSessionStaleAsOf")[1];
  const laufend = zweige.slice(0, zweige.indexOf("return \" · dieser Stand"));
  assert.ok(!laufend.includes("nicht der letzte Handelstag"),
            "ein Stand vom laufenden Tag darf nicht als anderer Handelstag beschrieben werden");
  assert.ok(laufend.includes("laufenden Handelstag"), "er sagt stattdessen, dass der Lauf stehen blieb");
  assert.ok(koerper.includes("expectedSessionDate"), "der andere Grund nennt weiter die erwartete Sitzung");
});

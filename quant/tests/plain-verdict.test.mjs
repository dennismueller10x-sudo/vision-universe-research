/* =========================================================================
   DAS KLARTEXT-URTEIL

   Diese Tests halten drei Dinge fest, die man sonst nur an einem
   unzufriedenen Nutzer wieder lernt.

   1. Die Zaehlzeile darf der Stufe nicht widersprechen. Gemessen an AAME
      stand "Ueberwiegend schwach" ueber "Stark in 1 von 6 geprueften
      Punkten" - beide Zahlen richtig, zusammen ein Raetsel.

   2. Der Nenner zaehlt nur, was bewertet ist. Ein Nenner, der Faktoren
      ohne Wert mitzaehlt, waere eine stille Abwertung jedes Titels mit
      Datenluecken - und das sind die kleinen.

   3. Es gibt keine Gesamtnote. Wenn jemand spaeter eine einbaut, soll
      dieser Test brechen und nicht die Produktdoku still falsch werden.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die beiden
   Oberflaechen-Tests am Ende lesen jetzt quant/app/ui.js (X.more) bzw.
   quant/app/pages.js (home) statt vu2/experience.js; der Aufklapper wird
   am Verhalten geprueft. Die Pruefung von scripts/vu2/production-smoke.mjs
   ist unveraendert.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Evidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const Verdict = require(join(ROOT, "quant/engines/plain-verdict.js"));

/** Ein Datensatz mit genau diesen Faktorwerten. Die Fixtur setzt die
    Position gleich dem Wert (factor-band-2.0.0: die Stufe kommt aus der
    Position); so bleiben die Faelle lesbar. */
function titel(werte) {
  const factors = {};
  for (const [id, score] of Object.entries(werte)) {
    factors[id] = score === null
      ? { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null }
      : { state: "AVAILABLE", score, position: score };
  }
  return { factors };
}

test("die Zählzeile trägt die Stufe und widerspricht ihr nie", () => {
  /* Der gemessene Fall: eine Staerke, vier Schwaechen. */
  const u = Verdict.urteil(titel({ quality: 20, growth: 15, momentum: 22, value: 92, profitability: 18, risk: 20 }));
  assert.equal(u.ton, "schwach", "fünf schwache gegen eine starke ist kein gutes Bild");
  assert.match(u.zaehlsatz, /^Schwach in/, "die Zeile darf bei schwachem Urteil nicht mit Stark beginnen: " + u.zaehlsatz);
});

test("die Zählzeile beginnt nur bei gutem Urteil mit Stark", () => {
  const u = Verdict.urteil(titel({ quality: 92, growth: 88, momentum: 80, value: 50, profitability: 85, risk: 50 }));
  assert.equal(u.ton, "gut");
  assert.match(u.zaehlsatz, /^Stark in 4 von 6/);
});

test("ein gemischtes Bild nennt beide Seiten", () => {
  const u = Verdict.urteil(titel({ quality: 92, growth: 88, momentum: 10, value: 12, profitability: 50, risk: 50 }));
  assert.equal(u.stufeId, "GEMISCHT");
  assert.match(u.zaehlsatz, /2 stark, 2 schwach von 6/);
});

test("der Nenner zählt nur bewertete Punkte, und die Lücke steht daneben", () => {
  const u = Verdict.urteil(titel({ quality: 92, growth: 88, momentum: null, value: null, profitability: null, risk: null, revisions: null }));
  assert.equal(u.bewertet, 2);
  assert.match(u.zaehlsatz, /von 2 geprüften Punkten/, "der Nenner darf die fehlenden nicht mitzählen");
  assert.equal(u.luecke, 5);
  assert.match(u.luecketext, /5 Punkte lassen sich nicht prüfen/);
});

test("ohne einen einzigen bewerteten Faktor wird kein Urteil erfunden", () => {
  const u = Verdict.urteil(titel({ quality: null, growth: null, momentum: null, value: null, profitability: null, risk: null, revisions: null }));
  assert.equal(u.stufeId, "KEINE_DATEN");
  assert.equal(u.ton, "unbekannt");
  assert.equal(u.gruende.length, 0, "ohne Daten gibt es auch keine Gründe");
});

test("liegt alles im Mittelfeld, ist das die Aussage und keine Leerstelle", () => {
  const u = Verdict.urteil(titel({ quality: 50, growth: 55, momentum: 60, value: 50, profitability: 52, risk: 58 }));
  assert.equal(u.stufeId, "GEMISCHT");
  assert.equal(u.gruende.length, 1);
  assert.match(u.gruende[0].text, /Nichts sticht heraus/);
});

test("die Gründe wechseln zwischen Stärke und Schwäche", () => {
  /* Drei Staerken und zwei Schwaechen: wer nur drei Zeilen liest, soll
     beide Seiten gesehen haben. Eine Liste aus drei Staerken waere
     Werbung. */
  const u = Verdict.urteil(titel({ quality: 95, growth: 92, momentum: 88, value: 10, profitability: 12, risk: 50 }));
  assert.equal(u.gruende[0].art, "plus");
  assert.equal(u.gruende[1].art, "minus");
  assert.equal(u.gruende[2].art, "plus");
  assert.equal(u.gruende[3].art, "minus");
});

test("beide Eingabeformen liefern dasselbe Urteil", () => {
  /* Die Engine-Seite reicht den Rohdatensatz, die Produktschnittstelle
     das bereits sortierte Array. Wer nur eine Form annimmt, liefert auf
     der Aktienseite stumm keine Daten". */
  const record = titel({ quality: 92, growth: 88, momentum: 30, value: 20, profitability: 85, risk: 50 });
  const a = Verdict.urteil(record);
  const b = Verdict.urteil({ factors: Evidence.ordered(record) });
  const c = Verdict.urteil(Evidence.ordered(record));
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test("es gibt keine Gesamtnote – und das bleibt so", () => {
  const u = Verdict.urteil(titel({ quality: 92, growth: 88, momentum: 80, value: 50, profitability: 85, risk: 50 }));
  for (const key of ["score", "gesamtnote", "punkte", "rating", "note"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(u, key), false,
      "das Urteil trägt das Feld " + key + " – eine Zahl, die alles verrechnet, verbirgt den Zielkonflikt");
  }
  const quelle = readFileSync(join(ROOT, "quant/engines/plain-verdict.js"), "utf8");
  assert.match(quelle, /\/100|Gesamtnote/, "die Ablehnung der Gesamtnote muss im Code begründet stehen");
});

test("jeder bewertete Faktor hat einen Küchentisch-Satz", () => {
  for (const id of Evidence.FACTOR_ORDER) {
    const k = Verdict.KLARTEXT[id];
    if (!k) continue;                       /* revisions darf fehlen, solange es keinen Satz braucht */
    assert.ok(k.hoch && k.tief, id + " hat keinen Satz für beide Richtungen");
    for (const satz of [k.hoch, k.tief]) {
      assert.ok(satz.split(" ").length <= 7, id + ": " + satz + " ist keine Zeile, das ist ein Absatz");
      assert.doesNotMatch(satz, /kaufen|verkaufen|solltest|empfehl/i, id + ": " + satz + " ist Handlungssprache");
    }
  }
});

test("über echte Titel entsteht nie ein Widerspruch", () => {
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  if (!existsSync(dir)) return;
  const dateien = readdirSync(dir).filter((f) => f.endsWith(".json.gz") && !f.startsWith("screening")).slice(0, 4);
  let n = 0;
  for (const f of dateien) {
    const j = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
    for (const r of Object.values(j.instruments || j.securities || {})) {
      const u = Verdict.urteil(r);
      n++;
      if (u.ton === "schwach") assert.doesNotMatch(u.zaehlsatz, /^Stark/, "Widerspruch bei einem echten Titel");
      if (u.ton === "gut") assert.doesNotMatch(u.zaehlsatz, /^Schwach/, "Widerspruch bei einem echten Titel");
      assert.ok(u.bewertet <= u.gesamt, "mehr bewertete als vorhandene Faktoren");
      assert.ok(u.gruende.length <= 4, "mehr als vier Gründe sind keine Antwort mehr");
    }
  }
  assert.ok(n > 100, "die Stichprobe ist zu klein, um etwas zu belegen: " + n);
});

test("der Aufklapper baut seinen Inhalt erst beim Oeffnen, aber er baut ihn", () => {
  /* `mehr` haelt die Tiefe zurueck, bis jemand sie will. Genau das ist
     die Stelle, an der ein Umbau still etwas verlieren kann: ein
     Aufklapper, der nie fuellt, sieht aus wie ein Aufklapper, der leer
     ist. Der Produktions-Smoke oeffnet deshalb alle <details> der
     Aktienseite und prueft danach ALLE Zeilen - dieser Test haelt fest,
     dass er das auch weiterhin tut. */
  const smoke = readFileSync(join(ROOT, "scripts/vu2/production-smoke.mjs"), "utf8");
  assert.match(smoke, /node\.open\s*=\s*true/,
    "der Smoke oeffnet die Aufklapper nicht mehr - zugeklappte Tiefe bliebe ungeprueft");
  assert.match(smoke, /ZU_WENIGE_ZEILEN/, "die Schwelle fuer eine leer aussehende Liste fehlt");
  assert.match(smoke, /zeilen\.length<20/,
    "die Schwelle wurde gesenkt, statt den Smoke aufklappen zu lassen");

  /* Frontend-Rebuild: der Aufklapper ist X.more(title, build, opts) in
     quant/app/ui.js. Er wird hier am Verhalten geprueft - mit einem
     minimalen Knoten-Ersatz fuer QuantShell.el. */
  const quelle = readFileSync(join(ROOT, "quant/app/ui.js"), "utf8");
  assert.match(quelle, /function more\(title, build, opts\)/, "der Aufklapper fehlt");
  function knoten(tag, attrs, kids) {
    const n = { tag, attrs: attrs || {}, kids: [], listeners: {}, open: false };
    n.append = (...xs) => { xs.forEach((x) => { if (x) n.kids.push(x); }); };
    n.addEventListener = (typ, fn) => { (n.listeners[typ] = n.listeners[typ] || []).push(fn); };
    n.fire = (typ) => (n.listeners[typ] || []).forEach((fn) => fn());
    (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach((k) => { if (k) n.kids.push(k); });
    return n;
  }
  const sandbox = { QuantShell: { el: knoten } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(quelle, sandbox);
  let gebaut = 0;
  const d = sandbox.QX.more("Mehr", () => { gebaut++; return [knoten("p", {}, []), knoten("p", {}, [])]; });
  assert.equal(d.tag, "details", "der Aufklapper ist kein <details>");
  assert.equal(gebaut, 0, "der Inhalt wird gebaut, bevor jemand aufklappt");
  const body = d.kids.find((k) => k.attrs && k.attrs.class === "qx-more-body");
  assert.ok(body, "der Aufklapper hat keinen Inhaltsbereich");
  d.open = true; d.fire("toggle");
  assert.equal(gebaut, 1, "der Inhalt wird nicht mehr beim Oeffnen gebaut - dann ist er entweder immer da oder nie");
  assert.equal(body.kids.length, 2, "der Aufklapper oeffnet sich, bleibt aber leer");
  d.open = false; d.fire("toggle"); d.open = true; d.fire("toggle");
  assert.equal(gebaut, 1, "der Inhalt wird bei jedem Oeffnen neu gebaut");
  assert.equal(body.kids.length, 2);
  /* Ein offen gestarteter Aufklapper ist sofort gefuellt. */
  let sofort = 0;
  sandbox.QX.more("Offen", () => { sofort++; return knoten("p", {}, []); }, { open: true });
  assert.equal(sofort, 1, "ein offen gestarteter Aufklapper ist leer");
});

test("die Startseite fuehrt mit einer Antwort, nicht mit einer Erklaerung", () => {
  /* Frontend-Rebuild: die Startseite ist home() in quant/app/pages.js; der
     erste Bildschirm ist .qx-hero, die Wege sind die Tueren (doors()). Das
     Versprechen lautet jetzt "Aktien verstehen – mit nachvollziehbaren
     Gründen." (neue Formulierung des Rebuilds; geprueft wird, dass der
     erste Bildschirm mit dem Versprechen "Aktien verstehen" als h1 fuehrt
     und die Suche - die Antwort - gleich darunter anbietet). */
  const quelle = readFileSync(join(ROOT, "quant/app/pages.js"), "utf8");
  const kopf = quelle.slice(quelle.indexOf("async function home("), quelle.indexOf("/* ============================================================ SCREENER"));
  assert.ok(kopf.length > 200, "die Startseite ist nicht auffindbar");
  /* Discover-Angleichung (30.09.2026): der erste Bildschirm ist Discovers
     Intro (header.v2-intro, zusaetzlich .qx-hero), die Tueren sind
     Discovers v2-world-door. */
  /* Konzept-Design (Owner, 30.09.2026, Tafel "Quant Home & Einstieg"):
     der erste Bildschirm ist der Globus-Hero (q-hero) mit der Frage "Was
     möchtest du heute analysieren?" und der Suche direkt darunter. Die
     Absicht bleibt: zuerst die Antwort (Suche), keine Erklaerung. */
  const header = kopf.match(/el\("header", \{ class: "([^"]+)"/);
  assert.ok(header, "die Startseite hat keinen ersten Bildschirm mehr");
  for (const cls of ["q-hero", "v2-intro", "qx-intro", "qx-hero", "vu-product-hero", "vu-hero-fidelity"]) assert.ok(header[1].split(/\s+/).includes(cls), "Hero ohne " + cls);
  const heroAt = header.index;
  assert.ok(heroAt > 0, "die Startseite hat keinen ersten Bildschirm mehr");
  const hero = kopf.slice(heroAt, kopf.indexOf("]));", heroAt));
  assert.ok(hero.length > 50, "die Startseite hat keinen ersten Bildschirm mehr");
  /* Produktpositionierung (Owner, 04.10.2026): die Frage wird zum Claim -
     der erste Bildschirm sagt, was Quant ist (docs/VU_QUANT_PRODUCT_POSITIONING.md). */
  const heading = hero.match(/el\("h1", \{ class: "([^"]+)", text: HERO_TITLE \}/);
  assert.ok(heading, "das Versprechen der Startseite ist verschwunden");
  for (const cls of ["q-claim", "vu-product-title", "vu-hero-headline"]) assert.ok(heading[1].split(/\s+/).includes(cls), "Hero-Überschrift ohne " + cls);
  assert.match(hero, /text: CLAIM \}/, "der vollständige Claim mit Marktvergleich fehlt");
  assert.match(hero, /onclick: ctx\.openSearch/, "der erste Bildschirm bietet keine Antwort an (Suche)");
  assert.ok(heroAt < kopf.indexOf("doors(["), "die Startseite fuehrt mit den Wegen statt mit dem Versprechen");
  /* Eine feste, kleine Zahl von Wegen - keine Auswahlwand. Vereinbart
     waren drei; der Frontend-Rebuild-Auftrag des Owners (30.09.2026, Teil 2
     "R. HOME") legt ausdruecklich VIER fest: Aktie analysieren, Quant
     Screener, Strategien, Aktuelle Setups. Die Pruefung bleibt exakt - ein
     fuenfter Weg waere wieder eine Entscheidung. */
  const tueren = kopf.slice(kopf.indexOf("doors(["), kopf.indexOf("])]));", kopf.indexOf("doors([")));
  const wege = (tueren.match(/\{ kicker: "/g) || []).length;
  assert.equal(wege, 4, "die Startseite bietet " + wege + " Wege an, vier sind vereinbart (Owner-Auftrag R)");
  for (const ziel of ["X.routes.stocks()", "X.routes.screener()", "X.routes.strategies()", 'X.routes.screener("frage=setups")'])
    assert.ok(tueren.includes(ziel), "der vereinbarte Weg fehlt: " + ziel);
});

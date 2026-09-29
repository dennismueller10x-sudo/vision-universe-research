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
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Evidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const Verdict = require(join(ROOT, "quant/engines/plain-verdict.js"));

/** Ein Datensatz mit genau diesen Faktorwerten. */
function titel(werte) {
  const factors = {};
  for (const [id, score] of Object.entries(werte)) {
    factors[id] = score === null
      ? { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null }
      : { state: "AVAILABLE", score };
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

  const quelle = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  assert.match(quelle, /function mehr\(titel,bauen,offen\)/, "der Aufklapper fehlt");
  assert.match(quelle, /addEventListener\('toggle'/,
    "der Inhalt wird nicht mehr beim Oeffnen gebaut - dann ist er entweder immer da oder nie");
});

test("die Startseite fuehrt mit einer Antwort, nicht mit einer Erklaerung", () => {
  const quelle = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  const kopf = quelle.slice(quelle.indexOf("async function homePage(){"), quelle.indexOf("function weg("));
  assert.ok(kopf.length > 200, "die Startseite ist nicht auffindbar");
  assert.match(kopf, /q-hero/, "die Startseite hat keinen ersten Bildschirm mehr");
  assert.match(kopf, /Aktien verstehen, ohne Vorwissen/,
    "das Versprechen der Startseite ist verschwunden");
  /* Drei Wege, nicht mehr. Ein vierter waere wieder eine Entscheidung. */
  const wege = (kopf.match(/weg\('/g) || []).length;
  assert.equal(wege, 3, "die Startseite bietet " + wege + " Wege an, drei sind vereinbart");
});

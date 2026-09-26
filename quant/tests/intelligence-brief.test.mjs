/* =========================================================================
   DIE EINE AUSKUNFT MUSS ZUSAMMENPASSEN.

   Gemessen am 26.09.2026, bevor dieses Modul existierte:

     743 Titel trugen den Satz „X ist mit schwach die klarste Stärke."
     266 der 465 Titel mit zurückgehaltener Bewertung zeigten trotzdem ein
         Kurs-Gewinn- und ein Kurs-Umsatz-Verhältnis.
      95 von 120 Titeln hatten dieselbe Eigenschaft in beiden Spalten -
         die Lage dagegen, ihre Richtung dafür.

   Gehalten werden hier nicht die Zahlen - die sollen sich bewegen -, sondern
   dass keine dieser drei Formen wiederkehren kann: eine Stärke ist an ihr
   Band gebunden, eine Aussage trägt ihren Beleg, und eine Geschichte steht
   in einer Spalte. Geprüft an den echten Artefakten, nicht an Attrappen:
   eine Attrappe kann nicht zeigen, dass der Bestand die Regel erfüllt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Brief = require(join(ROOT, "quant/engines/intelligence-brief.js"));
const FactorEvidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const ChangeEngine = require(join(ROOT, "quant/engines/change-engine.js"));
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

/* Eine Auswahl, die beide Enden abdeckt: ein starker Titel, eine Bank mit
   eigener Vorlage, ein bestätigtes Setup, ein Multi-Class-Titel mit
   zurückgehaltener Bewertung, ein zu junger Titel. */
const PROBE = ["NVDA", "AAPL", "WSBCO", "GOOGL", "JPM", "RILYN", "WBD", "AACO", "AACG"];

test("eine Stärke liegt über dem Mittelfeld - sonst heisst sie nicht so", () => {
  /* Der Fehler in Worten: die höchste von fünf schwachen Eigenschaften ist
     nicht die „klarste Stärke". Die Grenze ist deshalb das Band, und beide
     Module lesen dieselbe Liste. */
  assert.deepEqual(Brief.STRENGTH_BANDS, FactorEvidence.STRENGTH_BANDS);
  assert.deepEqual(Brief.WEAKNESS_BANDS, FactorEvidence.WEAKNESS_BANDS);
  const baender = FactorEvidence.BANDS.map((b) => b.id);
  for (const id of Brief.STRENGTH_BANDS.concat(Brief.WEAKNESS_BANDS)) {
    assert.ok(baender.includes(id), "kein Band der Methodik: " + id);
  }
  /* NEUTRAL gehört in keine der beiden - genau diese Lücke war der Fehler. */
  assert.equal(Brief.STRENGTH_BANDS.includes("NEUTRAL"), false);
  assert.equal(Brief.WEAKNESS_BANDS.includes("NEUTRAL"), false);
});

test("kein Titel des Bestands nennt eine schwache Eigenschaft eine Stärke", () => {
  /* Über den GANZEN Bestand, nicht über eine Stichprobe: der Satz stand bei
     743 von 6.441 Titeln, und eine Stichprobe von zwanzig hätte ihn mit
     Glück nicht getroffen. */
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  if (!existsSync(dir)) return;
  let geprueft = 0, verstoesse = [];
  for (const datei of readdirSync(dir)) {
    if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(dir, datei))).toString("utf8"));
    for (const [ticker, src] of Object.entries(shard.securities || {})) {
      const rec = FactorEvidence.hydrate(src, shard);
      const factors = FactorEvidence.ordered(rec);
      const kopf = Brief.headline(factors, null, null);
      geprueft += 1;
      for (const id of kopf.strengths) {
        const f = factors.find((x) => x.id === id);
        if (!f || FactorEvidence.STRENGTH_BANDS.indexOf(f.band) < 0) verstoesse.push(ticker + "/" + id + "/" + (f && f.band));
      }
      for (const id of kopf.weaknesses) {
        const f = factors.find((x) => x.id === id);
        if (!f || FactorEvidence.WEAKNESS_BANDS.indexOf(f.band) < 0) verstoesse.push(ticker + "/" + id + "/" + (f && f.band));
      }
      /* Und der alte Satz selbst kommt in der Faktor-Engine nicht mehr vor. */
      const satz = FactorEvidence.summarySentence(rec);
      if (/ist mit (sehr )?schwach die klarste Stärke/.test(satz)) verstoesse.push(ticker + ": " + satz);
    }
  }
  assert.ok(geprueft > 1000, "nur " + geprueft + " Titel geprüft");
  assert.deepEqual(verstoesse.slice(0, 5), [], verstoesse.length + " Verstösse von " + geprueft + " Titeln");
});

test("jede Veränderung kennt ihre Eigenschaft - eine neue fällt nicht lautlos durch", () => {
  /* Die Zuordnung Veränderung → Eigenschaft ist Darstellung und keine
     Methodik. Genau deshalb muss sie vollständig bleiben: eine Veränderung
     ohne Eintrag landete sonst in beiden Spalten, ohne dass es auffällt. */
  const src = readFileSync(join(ROOT, "quant/engines/change-engine.js"), "utf8");
  const tabelle = src.slice(src.indexOf("var MEANING = {"), src.indexOf("\n  };", src.indexOf("var MEANING = {")));
  const ids = [...tabelle.matchAll(/^    ([a-zA-Z]+): \{/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 10, "nur " + ids.length + " Veränderungen in der Engine gefunden");
  const bekannt = readFileSync(join(ROOT, "quant/engines/intelligence-brief.js"), "utf8");
  const zuordnung = bekannt.slice(bekannt.indexOf("var CHANGE_FACTOR = {"), bekannt.indexOf("\n  };", bekannt.indexOf("var CHANGE_FACTOR = {")));
  for (const id of ids) {
    assert.ok(new RegExp("\\b" + id + ":").test(zuordnung), "keine Zuordnung für die Veränderung '" + id + "'");
  }
  /* Und jede zugeordnete Eigenschaft ist eine der sieben. */
  for (const treffer of zuordnung.matchAll(/([a-zA-Z]+): "([a-z]+)"/g)) {
    assert.ok(FactorEvidence.FACTOR_ORDER.includes(treffer[2]),
      "unbekannte Eigenschaft in der Zuordnung: " + treffer[2] + " (bei " + treffer[1] + ")");
  }
  assert.ok(ChangeEngine, "die Veränderungs-Engine ist nicht ladbar");
});

test("jede Aussage der Auskunft trägt ihren Beleg", async () => {
  for (const ticker of PROBE) {
    const b = await api.getIntelligenceBrief(ticker);
    assert.equal(b.state, "AVAILABLE", ticker + ": keine Auskunft");
    assert.deepEqual(Brief.statementsWithoutEvidence(b), [], ticker + ": Aussage ohne Beleg");
    for (const key of ["pro", "contra", "unknown"]) {
      for (const e of b[key]) {
        assert.ok(e.text && e.text.length > 3, ticker + "/" + key + ": Aussage ohne Text");
        for (const q of e.evidence) {
          assert.ok(q.source && q.field, ticker + "/" + key + ": Beleg ohne Quelle oder Feld");
        }
      }
    }
  }
});

test("eine Geschichte steht in einer Spalte, nicht in zwei", async () => {
  /* Der gemessene Fall: „Eine schwache Kursentwicklung" dagegen und
     „Kurstempo verbessert sich" dafür - bei 95 von 120 Titeln. Beide Sätze
     sind wahr; als zwei Spalteneinträge lesen sie sich wie ein Widerspruch.
     Die Richtung steht deshalb NEBEN der Lage. */
  for (const ticker of PROBE) {
    const b = await api.getIntelligenceBrief(ticker);
    const lage = { pro: new Set(), contra: new Set() };
    for (const key of ["pro", "contra"]) {
      for (const e of b[key]) if (e.kind === "factor" && e.factorId) lage[key].add(e.factorId);
    }
    for (const key of ["pro", "contra"]) {
      const gegen = key === "pro" ? "contra" : "pro";
      for (const e of b[key]) {
        if (e.kind !== "change" || !e.factorId) continue;
        assert.equal(lage[gegen].has(e.factorId), false,
          ticker + ": '" + e.text + "' steht in der Gegenspalte zu seiner Eigenschaft");
      }
      /* Und höchstens eine Veränderung je Eigenschaft und Spalte. */
      const gesehen = new Set();
      for (const e of b[key]) {
        if (e.kind !== "change" || !e.factorId) continue;
        assert.equal(gesehen.has(e.factorId), false, ticker + "/" + key + ": zweite Veränderung für " + e.factorId);
        gesehen.add(e.factorId);
      }
    }
    /* Dieselbe Messung nie auf beiden Seiten. */
    const kennung = (e) => e.kind + ":" + (e.itemId || e.factorId || "");
    const proSchluessel = new Set(b.pro.filter((e) => e.factorId || e.itemId).map(kennung));
    for (const e of b.contra) {
      if (!(e.factorId || e.itemId)) continue;
      assert.equal(proSchluessel.has(kennung(e)), false, ticker + ": " + kennung(e) + " steht auf beiden Seiten");
    }
  }
});

test("ein Mustervergleich ist entweder ein Befund oder eine Lücke, nie beides", async () => {
  for (const ticker of PROBE) {
    const b = await api.getIntelligenceBrief(ticker);
    const alsLuecke = b.unknown.some((e) => e.kind === "pattern");
    const hatBefund = ["AVAILABLE", "NO_PATTERN_HOLDS"].includes(b.pattern.state);
    assert.equal(alsLuecke && hatBefund, false,
      ticker + ": Musterlage " + b.pattern.state + " und gleichzeitig als nicht bewertbar geführt");
    if (b.pattern.state === "AVAILABLE") {
      assert.ok(b.pattern.sentence, ticker + ": Musterlage ohne Satz");
      assert.ok(["UP", "DOWN", "BALANCED"].includes(b.pattern.direction), ticker + ": keine Richtung");
      assert.ok(Number.isFinite(b.pattern.asymmetry), ticker + ": keine Asymmetrie");
      assert.ok(b.pattern.sample > 0, ticker + ": Asymmetrie ohne Stichprobe");
      assert.ok(Number.isFinite(b.pattern.robust), ticker + ": keine Belastbarkeit");
      /* Chance nie ohne Kehrseite - die Regel des Wörterbuchs, hier als
         Struktur und nicht als Konvention. */
      assert.ok(b.pattern.upside && b.pattern.downside, ticker + ": nur eine Seite");
      assert.ok(b.pattern.caveat, ticker + ": kein Vorbehalt");
    }
  }
});

test("das Setup beantwortet vier Fragen, und wo es eine nicht kann, sagt es warum", async () => {
  let entscheidbar = 0;
  for (const ticker of PROBE) {
    const b = await api.getIntelligenceBrief(ticker);
    const s = b.setup;
    if (s.state === "UNAVAILABLE") { assert.ok(s.reason, ticker + ": Absage ohne Grund"); continue; }
    assert.ok(s.sentence, ticker + ": Zustand ohne Satz");
    assert.ok(s.label && !/[A-Z_]{4,}/.test(s.label), ticker + ": interner Code als Etikett");
    assert.ok(s.why, ticker + ": kein Warum");
    /* Beide Antworten stehen immer da - entweder mit Bedingungen oder mit
       einem Grund, warum es keine gibt. Eine leere Liste ist die falsche
       Antwort auf eine offene Frage. */
    assert.ok(s.next && s.next.sentence, ticker + ": keine nächste Stufe");
    assert.ok(s.next.open.length || s.next.reason, ticker + ": nächste Stufe ohne Bedingung und ohne Grund");
    assert.ok(s.invalidation && s.invalidation.sentence, ticker + ": keine Aussage zum Ende des Zustands");
    assert.ok(s.invalidation.conditions.length || s.invalidation.reason,
      ticker + ": Ende ohne Bedingung und ohne Grund");
    if (["WATCH", "SETUP_FORMING", "CONFIRMED"].includes(s.state)) {
      entscheidbar += 1;
      assert.ok(s.invalidation.conditions.length > 0,
        ticker + ": entscheidbarer Zustand ohne erfüllte Bedingung, die ihn trägt");
    }
    /* Kein Kursziel, keine Einstiegsregel - im Modell und nicht in einer
       Bildunterschrift. */
    assert.deepEqual(s.isNot, ["KURSZIEL", "EINSTIEGSREGEL", "PROGNOSE"]);
  }
  assert.ok(entscheidbar > 0, "die Probe enthält keinen entscheidbaren Setup-Zustand");
});

test("die Kaskade ordnet vom stärkeren zum schwächeren Zustand - sonst zeigt die Seite die falsche Richtung", () => {
  /* Die Auskunft nennt als „nächste Stufe" die Regel mit früherem Vorrang.
     Dass früherer Vorrang in der entscheidbaren Stufe den STÄRKEREN Zustand
     bedeutet, ist eine Eigenschaft dieser Zuordnung und keine allgemeine
     Wahrheit. Sie wird deshalb geprüft und nicht angenommen: ändert die
     Methodik das, fällt dieser Fall - und nicht der Leser. */
  const pfad = join(ROOT, "quant/methodology/setup-state-v1.json");
  if (!existsSync(pfad)) return;
  const methodik = JSON.parse(readFileSync(pfad, "utf8"));
  const ordnung = {};
  for (const regel of methodik.stateMapping.cascade.rules) {
    if (regel.tier !== "POINT_IN_TIME" || regel.always === true) continue;
    if (ordnung[regel.state] === undefined || regel.order < ordnung[regel.state]) ordnung[regel.state] = regel.order;
  }
  const erwartet = ["CONFIRMED", "SETUP_FORMING", "WATCH"];
  const vorhanden = erwartet.filter((s) => ordnung[s] !== undefined);
  assert.ok(vorhanden.length >= 2, "zu wenige entscheidbare Zustände zum Prüfen");
  for (let i = 1; i < vorhanden.length; i += 1) {
    assert.ok(ordnung[vorhanden[i - 1]] < ordnung[vorhanden[i]],
      vorhanden[i - 1] + " (" + ordnung[vorhanden[i - 1]] + ") muss vor " +
      vorhanden[i] + " (" + ordnung[vorhanden[i]] + ") entscheiden");
  }
});

test("der Anlagestil steht als Satz da, mit dem was erfüllt ist und was fehlt", async () => {
  let mitStil = 0, nurNaechster = 0;
  for (const ticker of PROBE) {
    const b = await api.getIntelligenceBrief(ticker);
    if (b.strategy.state !== "AVAILABLE") { assert.ok(b.strategy.reason, ticker + ": Absage ohne Grund"); continue; }
    assert.ok(b.strategy.sentence, ticker + ": kein Satz");
    assert.equal(/[A-Z_]{5,}/.test(b.strategy.sentence), false, ticker + ": interner Code im Satz");
    assert.ok(b.strategy.label, ticker + ": kein Stilname");
    assert.ok(b.strategy.fulfils.length + b.strategy.missing.length + b.strategy.blocking.length > 0,
      ticker + ": keine Bedingung genannt");
    /* Nicht messbar zählt weder als erfüllt noch als verletzt - und steht
       getrennt, weil es der Grund für eine schlechtere Passung ist. */
    for (const c of b.strategy.blocking) assert.ok(c.label, ticker + ": nicht messbare Bedingung ohne Bezeichnung");
    if (b.strategy.nearest) { nurNaechster += 1; assert.match(b.strategy.sentence, /Am nächsten kommt/); }
    else { mitStil += 1; assert.match(b.strategy.sentence, /Am ehesten passt/); }
  }
  assert.ok(mitStil > 0, "kein Titel der Probe passt zu einem Stil");
  assert.ok(nurNaechster > 0, "kein Titel der Probe zeigt den nächstliegenden Stil");
});

test("die Auskunft sagt, welche Methodik gilt - für jeden Titel mit eigener Vorlage", async () => {
  const bank = await api.getIntelligenceBrief("WSBCO");
  assert.equal(bank.methodologySwitch.active, true, "die Bankvorlage wird nicht genannt");
  assert.ok(bank.methodologySwitch.version, "die Vorlage nennt keine Fassung");
  assert.ok(bank.methodologySwitch.label, "die Vorlage nennt keine Grundlage");
  const generisch = await api.getIntelligenceBrief("AAPL");
  assert.equal(generisch.methodologySwitch.active, false, "ein generischer Titel behauptet eine Vorlage");
});

test("die Auskunft ist ausdrücklich keine Prognose und kein Gesamtscore", async () => {
  const b = await api.getIntelligenceBrief("NVDA");
  assert.deepEqual(b.isNot, ["PROGNOSE", "EMPFEHLUNG", "KURSZIEL", "GESAMTSCORE"]);
  /* Und kein Satz der Auskunft nennt einen Kauf, einen Verkauf oder eine
     Erwartung - §81 gilt auch für eine Zusammenfassung. */
  const saetze = [b.headline.sentence, b.setup.sentence, b.strategy.sentence, b.pattern.sentence]
    .concat(b.pro.map((e) => e.text), b.contra.map((e) => e.text), b.unknown.map((e) => e.text))
    .filter(Boolean);
  for (const satz of saetze) {
    assert.equal(/\b(kaufen|verkaufen|Kaufempfehlung|Verkaufsempfehlung|wird steigen|wird fallen|Kursziel)\b/i.test(satz),
      false, "Handlungs- oder Prognosesprache: " + satz);
  }
});

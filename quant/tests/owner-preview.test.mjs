/* =========================================================================
   VISION UNIVERSE — owner-preview.test.mjs

   DIE INTEGRATIONSVORSCHAU FUER DEN EIGENTUEMER

   Dieser Zweig fuehrt zusammen, was in mehreren Zweigen parallel
   entstanden ist: die VU2-Oberflaeche von Astra/Codex und das
   ausgelieferte Universum. Er ist eine AGGREGATION, keine neue Quelle
   der Wahrheit - und genau das muss pruefbar bleiben:

     OP1  Welche fremden Dateien fasst dieser Zweig an? Genau eine, und
          nur um zwei Zeilen zu ergaenzen.
     OP2  Die Bruecke umhuellt die Dienste, sie ersetzt sie nicht.
     OP3  Der Zugangsschluessel bleibt auf der Serverseite.
     OP4  Beide Serverfunktionen halten die Freigabeliste ein.
     OP5  Anteile werden zu Prozent - und Fehlendes bleibt fehlend.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => readFileSync(join(root, p), "utf8");

/* Die Zweige, aus denen gemergt wurde. Aus ihnen stammende Dateien sind
   fremdes Eigentum - unveraendert zu lassen ist die ganze Zusage. */
/* Die Spitze zuerst: vu2-signals-workspace enthaelt portfolio,
   strategy und alles davor. eod-gates liegt daneben. */
const FREMDE_ZWEIGE = ["origin/workstream/vu2-signals-workspace", "origin/workstream/vu2-eod-gates"];

function blob(ref, datei) {
  try {
    return execFileSync("git", ["rev-parse", `${ref}:${datei}`],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (err) { return null; }
}

test("OP1 — genau eine fremde Datei wurde angefasst, und nur additiv", () => {
  let dateien = [];
  try {
    /* FREMD ist nicht "alles, was anders ist" - dieser Zweig traegt auch
       eigene, aeltere Arbeit. Fremd ist, was der VU2-Zweig GEGENUEBER
       MAIN einbringt: seine Dateien. Der erste Versuch verglich stumpf
       zwei Baeume und meldete .gitignore als fremdes Eigentum. */
    dateien = execFileSync("git", ["diff", "--name-only", "origin/main", FREMDE_ZWEIGE[0]],
      { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch (err) { return; }        /* ohne die Zweige gibt es nichts zu vergleichen */

  const fremdUndVeraendert = dateien.filter((f) => {
    const dort = blob(FREMDE_ZWEIGE[0], f);
    return dort !== null && dort !== blob("HEAD", f);
  });

  assert.deepEqual(fremdUndVeraendert, ["vu2/index.html"],
    "diese Vorschau darf genau eine fremde Datei anfassen - die Einstiegsseite, " +
    "und dort nur die zwei Zeilen der Bruecke");

  /* Und die Aenderung ist wirklich additiv: alles Bisherige steht noch
     da, dazu die beiden Bruecken-Zeilen. */
  const vorher = execFileSync("git", ["show", `${FREMDE_ZWEIGE[0]}:vu2/index.html`],
    { cwd: root, encoding: "utf8" });
  const jetzt = lies("vu2/index.html");
  const ergaenzt = ['<script src="/vu2-bridge/bridge.js"></script>',
                    '<script src="/vu2-bridge/experience.js"></script>',
                    '<link rel="stylesheet" href="/vu2-bridge/bridge.css">'];
  let rest = jetzt;
  for (const teil of ergaenzt) {
    assert.ok(rest.includes(teil), `${teil} fehlt in vu2/index.html`);
    rest = rest.replace(teil, "");
  }
  assert.equal(rest, vorher, "an vu2/index.html wurde mehr geaendert als die Bruecken-Zeilen");

  /* Die Reihenfolge entscheidet ueber die Wirkung: die Dienste-Bruecke
     MUSS vor experience.js stehen, die Oberflaechen-Bruecke danach. */
  assert.ok(jetzt.indexOf('/vu2-bridge/bridge.js') < jetzt.indexOf('src="experience.js"'),
    "bridge.js muss vor experience.js geladen werden, sonst umhuellt es nichts");
  assert.ok(jetzt.indexOf('/vu2-bridge/experience.js') > jetzt.indexOf('src="experience.js"'),
    "der Oberflaechenteil braucht das fertige DOM und gehoert dahinter");
});

test("OP2 — die Bruecke umhuellt die Dienste, sie ersetzt sie nicht", () => {
  const quelle = lies("vu2-bridge/bridge.js");
  assert.match(quelle, /var Basis = g\.VUProductServices;/,
    "ohne den bestehenden Dienst gibt es nichts zu umhuellen");
  assert.match(quelle, /dienste = Basis\.create\(optionen\)/,
    "der bestehende Dienst muss weiter erzeugt und benutzt werden");
  assert.match(quelle, /Object\.assign\(\{\}, dienste,/,
    "alles Nicht-Ueberschriebene muss unveraendert durchgereicht werden");
  assert.match(quelle, /g\.VUProductServices = \{ create: create, base: Basis \}/,
    "die urspruengliche Fassung muss erreichbar bleiben");

  /* Und die fremden Dateien bleiben frei von Bruecken-Wissen: nichts
     unter quant/api/ darf die Bruecke kennen. */
  for (const datei of ["quant/api/product-services.js", "vu2/experience.js"]) {
    assert.ok(!/VUBridge|vu2-bridge/.test(lies(datei)),
      `${datei} weiss von der Bruecke - dann ist es keine Umhuellung mehr`);
  }
});

test("OP3 — der Zugangsschluessel bleibt auf der Serverseite", () => {
  /* Gelesen wird der Schluessel an genau einer Stelle. Diese Pruefung
     stand frueher auf jeder der beiden Funktionen; seit beide durch
     dieselbe Grenze gehen, waere das eine Forderung nach doppeltem
     Zugriff - also nach mehr Stellen, an denen er entweichen kann. */
  assert.match(lies("api/_scope.js"), /process\.env\.TIINGO_API_KEY/,
    "die gemeinsame Grenze liest den Schluessel nicht aus der Umgebung");

  for (const datei of ["api/realtime.js", "api/intraday.js"]) {
    const quelle = lies(datei);
    assert.ok(!/process\.env/.test(quelle),
      `${datei} greift an der Grenze vorbei auf die Umgebung zu`);

    /* WOHIN der Schluessel geht, ist die ganze Frage - nicht, ob er
       ueberhaupt benutzt wird. Der erste Versuch verbot jede Uebergabe
       und schlug deshalb am Anbieter-Handschlag selbst an, also an der
       einen Stelle, an der der Schluessel hingehoert.

       Geprueft wird jetzt jede einzelne Fundstelle: erlaubt sind die
       Zuweisung, die Pruefung "fehlt er?" und der Weg zum Anbieter.
       Alles andere - eine Antwort, ein Protokoll - faellt auf. */
    const stellen = quelle.split("\n")
      .map((zeile, i) => ({ zeile: zeile.trim(), nr: i + 1 }))
      .filter((z) => /\bkey\b/.test(z.zeile) && !z.zeile.startsWith("*") && !z.zeile.startsWith("/*"));
    const erlaubt = [
      /^const key = Scope\.schluessel\(\);$/,
      /^if \(!key\) \{$/,
      /^authorization: key,$/,
      /^headers: \{ Authorization: `Token \$\{key\}`/
    ];
    const unerlaubt = stellen.filter((z) => !erlaubt.some((re) => re.test(z.zeile)));
    assert.deepEqual(unerlaubt.map((z) => `${datei}:${z.nr} ${z.zeile}`), [],
      `${datei} benutzt den Schluessel an einer Stelle, die nicht der Anbieterzugang ist`);
  }
  /* Und im Browser-Teil kommt er gar nicht vor. */
  for (const datei of ["vu2-bridge/bridge.js", "vu2-bridge/experience.js"]) {
    assert.ok(!/TIINGO_API_KEY|token|Token /.test(lies(datei)),
      `${datei} spricht ueber Zugangsmittel - im Browser hat das nichts zu suchen`);
  }
});

test("OP4 — beide Serverfunktionen halten die Grenze des Produktuniversums ein", async () => {
  /* DIESE PRUEFUNG HAT IHRE GRENZE GEWECHSELT.

     Sie stand einmal auf development-preview.json - der Liste der fuenf
     Titel, mit denen der Workstream angefangen hat. Die Liste ist keine
     Produktgrenze mehr; sie war nur das, was zuerst fertig war. Die
     Grenze kommt jetzt aus dem Eignungslauf, und der kennt rund
     siebentausend Titel statt fuenf. Geprueft wird weiterhin dasselbe:
     dass es ueberhaupt eine Grenze gibt und die Funktion sie einhaelt. */
  const verzeichnis = JSON.parse(lies("quant/data/market/realtime/product-symbols.json"));
  const imUniversum = verzeichnis.symbols.ELIGIBLE[0];
  assert.ok(imUniversum, "ohne Produktuniversum darf nichts laufen");

  const { default: intraday } = await import(join(root, "api", "intraday.js"));

  /* Ein Name, den es nicht gibt. */
  const unbekannt = await fake(intraday, "/api/intraday?ticker=ZZZZZZ");
  assert.equal(unbekannt.body.state, "SYMBOL_NOT_SUPPORTED",
    "ein Titel ausserhalb des Produktuniversums darf keine Kurse bekommen");

  /* Und ein Papier, das es gibt und das trotzdem nicht dazugehoert.
     Der Unterschied ist kein Wortspiel: "kenne ich nicht" und "gehoert
     nicht ins Produkt" sind zwei verschiedene Auskuenfte, und wer sie
     zusammenwirft, kann spaeter nicht sagen, welche von beiden gemeint
     war. Welches Papier das ist, entscheidet der Eignungslauf - hier
     steht kein Name. */
  const ausgeschlossen = (verzeichnis.excluded.WARRANT || [])[0];
  assert.ok(ausgeschlossen, "ohne ausgeschlossene Papiere ist diese Pruefung blind");
  const nichtGeeignet = await fake(intraday, `/api/intraday?ticker=${ausgeschlossen}`);
  assert.equal(nichtGeeignet.body.state, "NOT_ELIGIBLE",
    "ein ausgeschlossenes Papier ist etwas anderes als ein unbekanntes");

  /* Mit einem Titel des Universums, aber ohne Schluessel: die Antwort
     muss den Grund nennen und darf nicht so aussehen, als sei der Code
     kaputt. */
  const alt = process.env.TIINGO_API_KEY;
  delete process.env.TIINGO_API_KEY;
  try {
    const zweite = await fake(intraday, `/api/intraday?ticker=${imUniversum}`);
    assert.equal(zweite.body.state, "NOT_CONFIGURED");
    assert.match(zweite.body.remedy, /TIINGO_API_KEY/);
  } finally { if (alt !== undefined) process.env.TIINGO_API_KEY = alt; }

  /* Der Strom antwortet als Ereignisstrom, nicht als JSON-Fehler. */
  const strom = lies("api/realtime.js");
  assert.match(strom, /text\/event-stream/);
  assert.match(strom, /Scope\.pruefe\(/,
    "auch der Strom fragt die gemeinsame Grenze, nicht eine eigene Liste");
  assert.match(strom, /priceTypeConfirmed: false/,
    "solange die Kursart unbestaetigt ist, darf nichts anderes behauptet werden");

  /* Geprueft wird die BESCHRIFTUNG, nicht der Fliesstext. Der erste
     Versuch verbot die Zeichenkette "letzter Handelskurs" ueberall - und
     schlug an dem Satz an, der genau erklaert, dass sie NICHT behauptet
     wird. Ein Test, der die Begruendung verbietet, macht den Code
     schlechter. */
  /* Die Beschriftung steht in der Umfangsentscheidung, nicht im Code -
     damit sie an einer Stelle geaendert wird und nicht an dreien. Der
     Code muss sie mitschicken, und sie muss neutral bleiben. */
  const semantik = JSON.parse(lies("quant/config/realtime-preview-scope.json")).priceSemantics;
  assert.equal(semantik.priceTypeConfirmed, false);
  assert.equal(semantik.label, "Kursaktualisierung");
  assert.match(strom, /priceLabel:/, "die Beschriftung muss im Strom mitgeschickt werden");
  assert.match(strom, /"Kursaktualisierung"/,
    "auch ohne lesbare Umfangsentscheidung muss die neutrale Beschriftung greifen");
  const beschriftungen = strom.match(/(?:priceLabel|label|kind):\s*"[^"]*"/g) || [];
  const behauptend = beschriftungen.filter((b) => /handelskurs|last trade/i.test(b));
  assert.deepEqual(behauptend, [], "eine unbestaetigte Kursart darf nicht als Handelskurs beschriftet werden");

  /* Und die Oberflaeche haelt sich daran. */
  const anzeige = lies("vu2-bridge/experience.js");
  assert.match(anzeige, /Kursaktualisierung/);
  assert.ok(!/(?:text|textContent)[^\n]*letzter Handelskurs/i.test(anzeige),
    "die Anzeige darf keinen Handelskurs behaupten");
});

/* Ein Antwortobjekt, wie es die Plattform uebergibt - klein genug, um
   die Funktion echt auszufuehren statt sie zu beschreiben. */
function fake(handler, url) {
  return new Promise((fertig) => {
    const kopfzeilen = {};
    let inhalt = "";
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { kopfzeilen[k] = v; },
      write: (t) => { inhalt += t; },
      end: (t) => { if (t) inhalt += t; fertig({ status: res.statusCode, headers: kopfzeilen,
        body: inhalt ? JSON.parse(inhalt) : null, raw: inhalt }); }
    };
    handler({ url, on: () => {} }, res);
  });
}

test("OP5 — Anteile werden zu Prozent, Fehlendes bleibt fehlend", async () => {
  /* Die Bruecke laeuft im Browser. Hier laeuft sie in einer kleinen
     Attrappe: dieselbe Datei, gefuetterte Daten, gepruefte Ausgabe. Ein
     Test, der nur den Quelltext liest, wuerde die Umrechnung nicht
     sehen - und genau dort sitzt der Fehler, der aus 8 Prozent ein
     Achtel Prozent macht. */
  const g = {};
  g.window = g;
  g.VUProductServices = {
    create: () => ({
      getUniverse: async () => ({ state: "UNAVAILABLE", stocks: [] }),
      getStockIntelligence: async () => ({ state: "UNAVAILABLE" }),
      getQuantWorkspace: async () => ({ state: "UNAVAILABLE" }),
      getMarketIntelligence: async () => ({ state: "UNAVAILABLE" }),
      getDiscover: async () => ({ collections: [] }),
      getRecipes: () => [],
      screen: async () => ({ state: "UNAVAILABLE" }),
      workspaces: (t) => [{ label: "Chart", href: "/quant/stock/?ticker=" + t }]
    })
  };
  const kontext = createContext(g);
  runInContext(lies("vu2-bridge/bridge.js"), kontext);

  const daten = {
    "/quant/data/proof/meta.json": { shards: 1, asOf: "2026-09-09", gate: "FULL_UNIVERSE",
      fieldStatusTemplates: [{}] },
    "/quant/data/proof/index.json": {
      count: 2, withFactors: 2, shards: 1, tickers: ["AAA", "BBB"], hasFactors: [1, 1],
      fields: [
        { id: "exchange", type: "enum", category: "reference" },
        { id: "sector", type: "enum", category: "reference" },
        { id: "returns.6M", type: "number", unit: "pct", category: "momentum" },
        { id: "distanceToSMA200", type: "number", unit: "pct", category: "trend" },
        { id: "distanceToSMA50", type: "number", unit: "pct", category: "trend" },
        { id: "maxDrawdown252d", type: "number", unit: "pct", category: "risk" },
        { id: "avgVolume20d", type: "number", unit: "count", category: "volume" }
      ],
      enums: { exchange: ["NYSE"], sector: ["Technology"] },
      columns: {
        exchange: [0, 0], sector: [0, null],
        "returns.6M": [0.0797, null], distanceToSMA200: [-0.034, null],
        distanceToSMA50: [0.1518, null], maxDrawdown252d: [-0.6458, null],
        avgVolume20d: [1000, 5]
      }
    },
    "/quant/config/development-preview.json": { scope: ["AAA"] }
  };
  const api = g.VUProductServices.create({
    loadJSON: async (pfad) => {
      if (!(pfad in daten)) throw new Error("unbekannt: " + pfad);
      return JSON.parse(JSON.stringify(daten[pfad]));
    },
    displayPolicy: {}, queryEngine: { execute: () => ({ rows: [] }) }
  });

  const universum = await api.getUniverse();
  assert.equal(universum.state, "AVAILABLE");
  assert.equal(universum.fullUniverse.securities, 2);

  const aaa = universum.stocks.find((s) => s.ticker === "AAA");
  assert.ok(aaa, "der Titel muss in der Liste stehen");
  /* 0,0797 ist ein ANTEIL. In der Oberflaeche steht Prozent. */
  assert.ok(Math.abs(aaa.momentum6m.value - 7.97) < 0.001,
    `Anteil nicht in Prozent umgerechnet: ${aaa.momentum6m.value}`);
  assert.equal(aaa.momentum6m.unit, "percent");
  assert.ok(Math.abs(aaa.above200.value - -3.4) < 0.001);
  assert.ok(Math.abs(aaa.drawdown.value - -64.58) < 0.001);

  /* Kursniveaus bleiben zurueckgehalten - und zwar als Zustand, nicht
     als Null. */
  assert.equal(aaa.price.value, null);
  assert.equal(aaa.price.state, "SOURCE_MISSING");

  /* Fundamentaldaten gibt es fuer dieses Universum nicht. Eine Null
     waere hier eine Aussage, die niemand gemacht hat. */
  for (const feld of ["revenueGrowth", "operatingMargin", "fcfMargin", "roic"]) {
    assert.equal(aaa[feld].value, null, `${feld} traegt einen erfundenen Wert`);
    assert.equal(aaa[feld].state, "SOURCE_MISSING");
  }

  /* Und ein Titel ohne Faktoren traegt nichts Gerechnetes. */
  const bbb = universum.stocks.find((s) => s.ticker === "BBB");
  if (bbb) {
    assert.equal(bbb.momentum6m.value, null);
    assert.equal(bbb.momentum6m.state, "SOURCE_MISSING");
  }

  /* Der fehlende Firmenname wird nicht durch den Ticker ersetzt. */
  assert.ok(!/^AAA$/.test(aaa.name), "der Ticker darf nicht als Firmenname auftreten");
  assert.match(aaa.name, /NYSE/);
});

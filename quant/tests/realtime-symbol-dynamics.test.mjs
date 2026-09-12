/* =========================================================================
   VISION UNIVERSE — realtime-symbol-dynamics.test.mjs

   INTRADAY UND ECHTZEIT GELTEN FUER DAS GANZE PRODUKTUNIVERSUM.

   Der Workstream hat mit fuenf freigegebenen Titeln angefangen, und
   genau das steckte im Code: eine Liste mit fuenf Namen, gegen die jeder
   Aufruf geprueft wurde. Solche Listen wachsen nicht mit - sie werden
   vergessen und dann als Produktgrenze missverstanden.

   Diese Tests halten fest, was seitdem gilt:

     RS1  Im produktiven Pfad steht kein Ticker.
     RS2  Die Grenze kommt aus dem Eignungslauf - nachgerechnet.
     RS3  Der Browser kennt weder Schluessel noch Anbieteradresse.
     RS4  Jede Verbindung endet mit ihrem Aufruf; es gibt keinen
          Zustand, der ihn ueberlebt.
     RS5  Dieselbe Zeile zweimal ist keine zweite Bewegung.
     RS6  Boerse geschlossen ist kein kaputter Strom.
     RS7  Die Zustaende der Intraday-Funktion bleiben auseinander.
     RS8  Es wird kein Kurs erfunden - weder im Server noch im Browser.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const lies = (p) => readFileSync(join(root, p), "utf8");

/* Die produktiven Dateien dieses Workstreams. Was hier drinsteht, laeuft
   fuer jeden Nutzer - im Gegensatz zu Testfixtures und Messskripten. */
const SERVER = ["api/_scope.js", "api/intraday.js", "api/realtime.js"];
const BROWSER = ["vu2-bridge/bridge.js", "vu2-bridge/experience.js"];
const PRODUKTIV = SERVER.concat(BROWSER);

/* Kommentare sind Erklaerung, kein Verhalten. Ein Test, der sie
   mitprueft, verbietet am Ende die Begruendung - das ist in diesem
   Repository schon einmal passiert. */
function ohneKommentare(quelle) {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const verzeichnis = JSON.parse(lies("quant/data/market/realtime/product-symbols.json"));

test("RS1 — im produktiven Pfad steht kein Ticker und keine Symbolliste", () => {
  /* Testfixtures duerfen Ticker nennen; der produktive Pfad nicht. */
  const FIXTURE_TICKER = ["AAPL", "NVDA", "MSFT", "JPM", "XOM", "TSLA", "ORCL"];
  const VERBOTENE_NAMEN = /\b(GOLDEN_FIVE|goldenFive|allowedSymbols|ALLOWED_SYMBOLS|SYMBOL_WHITELIST|whitelist|erlaubteTitel|freigabeListe)\b/;

  for (const datei of PRODUKTIV) {
    const code = ohneKommentare(lies(datei));

    assert.ok(!VERBOTENE_NAMEN.test(code),
      `${datei} fuehrt eine eigene Symbolliste - die Grenze gehoert in den Eignungslauf`);

    for (const t of FIXTURE_TICKER) {
      const alsLiteral = new RegExp(`["'\`]${t}["'\`]`);
      assert.ok(!alsLiteral.test(code),
        `${datei} nennt den Ticker ${t} im Code - damit haengt Verhalten an einem Namen`);
    }

    /* Und keine Gleichheitsvergleiche gegen irgendein Symbol des
       Universums: das faengt auch Ticker, an die hier niemand denkt.

       Geprueft wird die linke Seite, nicht die rechte. Der erste Anlauf
       verglich nur den Zeichenkettenwert - und schlug bei `phase === "PRE"`
       an, weil PRE zufaellig auch ein Ticker ist. Ein Test, der die
       Vorboerse verbietet, hat die Frage nicht verstanden: es geht nicht
       darum, welches Wort dasteht, sondern worueber es etwas aussagt. */
    const TRAEGT_SYMBOL = /^(ticker|tickers?Param|symbol|sym|titel|t|roh|rohTicker)$/i;
    const treffer = [];
    const vergleiche = code.match(/([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*===\s*["'`]([A-Z0-9.-]{1,6})["'`]/g) || [];
    for (const v of vergleiche) {
      const teile = v.match(/([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*===\s*["'`]([A-Z0-9.-]{1,6})["'`]/);
      const links = teile[1].split(".").pop();
      if (TRAEGT_SYMBOL.test(links)) treffer.push(v.trim());
    }
    assert.deepEqual(treffer, [],
      `${datei} verzweigt anhand eines einzelnen Symbols: ${treffer.join(", ")}`);

    /* Eine Liste aus lauter Titeln des Universums ist eine Freigabeliste,
       egal wie die Variable heisst. Reihenfolgen wie ["1D","5D"] sind
       keine - deshalb wird gegen das Verzeichnis geprueft, nicht gegen
       die Schreibweise. */
    const listen = code.match(/\[\s*["'`][A-Z0-9.-]{1,6}["'`]\s*(?:,\s*["'`][A-Z0-9.-]{1,6}["'`]\s*)+\]/g) || [];
    for (const liste of listen) {
      const namen = (liste.match(/["'`]([A-Z0-9.-]{1,6})["'`]/g) || [])
        .map((n) => n.slice(1, -1));
      const ausUniversum = namen.filter((n) => verzeichnis.symbols.ELIGIBLE.includes(n));
      assert.notEqual(ausUniversum.length, namen.length,
        `${datei} fuehrt eine feste Titelliste: ${liste}`);
    }
  }
});

test("RS2 — die Grenze kommt aus dem Eignungslauf, nachgerechnet", () => {
  const scope = JSON.parse(lies("quant/config/realtime-preview-scope.json"));
  assert.equal(scope.scopeSource.index, "quant/data/market/realtime/product-symbols.json");
  assert.equal(scope.scopeSource.origin, "quant/data/market/security-master/eligibility.json");
  assert.equal(scope.delivery, "PROTECTED_PREVIEW_ONLY");

  /* Das Verzeichnis ist eine Projektion - und muss es bleiben. */
  const rohQuelle = readFileSync(join(root, verzeichnis.source.file));
  assert.equal(createHash("sha256").update(rohQuelle).digest("hex"), verzeichnis.source.sha256,
    "das Verzeichnis stammt nicht mehr aus dieser Quelle - neu bauen");

  const quelle = JSON.parse(rohQuelle.toString("utf8"));
  const erlaubt = new Set(scope.allowedEligibility);
  let produkt = 0, ausgeschlossen = 0;
  for (const e of quelle.decisions) {
    if (erlaubt.has(e.product_eligibility)) produkt++;
    else if (e.product_eligibility === "EXCLUDED") ausgeschlossen++;
  }
  assert.equal(verzeichnis.counts.productUniverse, produkt,
    "die Zahl im Verzeichnis stimmt nicht mit der Quelle ueberein");
  assert.equal(verzeichnis.counts.EXCLUDED, ausgeschlossen);
  assert.equal(quelle.counts.productUniverse, produkt,
    "die Quelle selbst zaehlt anders als ihre eigenen Entscheidungen");
  assert.ok(produkt > 5000, `nur ${produkt} Titel - das Universum ist zusammengeschrumpft`);

  /* Und die ausgeschlossenen Klassen bleiben ausgeschlossen. */
  for (const klasse of ["WARRANT", "UNIT", "RIGHT", "TEST_SECURITY"]) {
    assert.ok((verzeichnis.excluded[klasse] || []).length > 0,
      `${klasse} taucht nicht mehr unter den ausgeschlossenen Papieren auf`);
    for (const t of verzeichnis.excluded[klasse].slice(0, 3)) {
      assert.ok(!verzeichnis.symbols.ELIGIBLE.includes(t),
        `${t} ist ${klasse} und trotzdem im Produktuniversum`);
    }
  }
});

test("RS3 — der Browser kennt weder Schluessel noch Anbieteradresse", () => {
  for (const datei of BROWSER) {
    const code = lies(datei);
    assert.ok(!/TIINGO_API_KEY|Token\s+[0-9a-f]{8}|authorization/i.test(code),
      `${datei} spricht ueber Zugangsmittel`);
    assert.ok(!/api\.tiingo\.com|wss:\/\//.test(code),
      `${datei} kennt die Anbieteradresse - der Browser darf nie direkt dorthin`);
  }
  /* Und serverseitig geht der Schluessel nur an den Anbieter. */
  for (const datei of SERVER) {
    const code = lies(datei);
    assert.ok(!/console\.(log|error|warn)\([^)]*key/.test(code), `${datei} protokolliert den Schluessel`);
  }
  const scopeCode = lies("api/_scope.js");
  assert.match(scopeCode, /process\.env\.TIINGO_API_KEY \|\| ""\)\.trim\(\)/,
    "der Schluessel wird nur an einer Stelle gelesen - und getrimmt");
  /* Und nur dort. Die frueheste Fassung verbot den blossen Namen
     TIINGO_API_KEY in intraday.js - und traf damit den Hinweistext, der
     dem Betreiber sagt, welche Variable er setzen muss. Verboten ist der
     Zugriff, nicht das Wort. */
  for (const datei of SERVER) {
    if (datei === "api/_scope.js") continue;
    assert.ok(!/process\.env/.test(ohneKommentare(lies(datei))),
      `${datei} liest die Umgebung selbst statt ueber die gemeinsame Grenze`);
  }
});

test("RS4 — jede Verbindung endet mit ihrem Aufruf", () => {
  const code = lies("api/realtime.js");
  const ohne = ohneKommentare(code);

  assert.match(ohne, /req\.on\("close"/, "ohne diesen Pfad haelt jede weggeblaetterte Aktie eine Anbieterverbindung");
  assert.match(ohne, /req\.on\("aborted"/);
  assert.match(ohne, /socket\.close\(\)/);
  assert.match(ohne, /clearTimeout\(uhr\)[\s\S]*clearInterval\(puls\)|clearInterval\(puls\)[\s\S]*clearTimeout\(uhr\)/,
    "Zeitgeber muessen beim Schliessen weg - sonst laufen sie weiter");

  /* Kein Zustand ausserhalb des Aufrufs: keine Registry, kein Cache von
     Sockets, kein Intervall auf Modulebene. */
  const moduleebene = ohne.slice(0, ohne.indexOf("module.exports = async function handler"));
  assert.ok(!/new\s+Map\(|new\s+Set\(|setInterval\(/.test(moduleebene),
    "auf Modulebene darf nichts stehen, das einen Aufruf ueberlebt");

  /* Und die Zahl der Symbole je Verbindung ist begrenzt - 7.004
     Dauerabonnements sind ausdruecklich nicht das Ziel. */
  const scope = JSON.parse(lies("quant/config/realtime-preview-scope.json"));
  assert.ok(scope.realtime.onDemand === true);
  assert.ok(scope.realtime.maxSymbolsPerConnection >= 1 && scope.realtime.maxSymbolsPerConnection <= 10,
    "eine Verbindung abonniert eine Handvoll Titel, nicht das Universum");
  assert.match(ohne, /slice\(0, grenze\)/, "die Grenze muss auch angewandt werden");

  /* Im Browser: nie zwei Verbindungen fuer denselben Titel. */
  const browser = ohneKommentare(lies("vu2-bridge/experience.js"));
  assert.match(browser, /function stromStarten\(\)\s*\{\s*stromBeenden\(/,
    "vor dem Verbinden muss die alte Verbindung geschlossen werden");
  assert.match(browser, /pagehide/, "beim Verlassen der Seite muss der Strom enden");
});

test("RS5 — dieselbe Zeile zweimal ist keine zweite Bewegung", async () => {
  const { ereignisse } = await stromLauf({
    tickers: "AAPL",
    nachrichten: [
      { messageType: "I", response: { message: "Success" } },
      /* zweimal exakt dieselbe Handelszeile */
      { messageType: "A", data: ["T", "2026-09-14T13:30:00.000Z", 0, "AAPL", 0, 0, 0, 0, 0, 231.5, 100] },
      { messageType: "A", data: ["T", "2026-09-14T13:30:00.000Z", 0, "AAPL", 0, 0, 0, 0, 0, 231.5, 100] },
      /* und eine echte zweite Bewegung */
      { messageType: "A", data: ["T", "2026-09-14T13:30:01.000Z", 0, "AAPL", 0, 0, 0, 0, 0, 231.6, 50] }
    ]
  });
  const ticks = ereignisse.filter((e) => e.event === "tick");
  assert.equal(ticks.length, 2, "die Wiederholung haette nicht gezeichnet werden duerfen");
  const summary = ereignisse.find((e) => e.event === "summary");
  assert.equal(summary.data.updates, 2);
  assert.equal(summary.data.duplicates, 1);
  assert.equal(summary.data.perSymbol.AAPL.updates, 2);
  assert.equal(summary.data.perSymbol.AAPL.duplicates, 1);
  assert.equal(summary.data.subscribed, true);
});

test("RS6 — Boerse geschlossen ist kein kaputter Strom", () => {
  const Scope = require(join(root, "api", "_scope.js"));
  assert.equal(Scope.verdictFor({ connected: true, updates: 0, expectsUpdates: false }),
    "MARKET_CLOSED_NO_TICKS_EXPECTED");
  assert.equal(Scope.verdictFor({ connected: true, updates: 0, expectsUpdates: true }),
    "CONNECTED_NO_TICKS");
  assert.equal(Scope.verdictFor({ connected: true, updates: 3, expectsUpdates: true }),
    "TICKS_OBSERVED");
  assert.equal(Scope.verdictFor({ connected: true, updates: 3, expectsUpdates: false }),
    "TICKS_OBSERVED", "ein Tick ausserhalb der Sitzung ist immer noch ein Tick");
  assert.equal(Scope.verdictFor({ connected: false, updates: 0, expectsUpdates: true }),
    "NOT_CONNECTED");

  /* Und die Oberflaeche verbindet bei geschlossener Boerse nicht endlos neu. */
  const browser = ohneKommentare(lies("vu2-bridge/experience.js"));
  assert.match(browser, /MARKET_CLOSED_NO_TICKS_EXPECTED[\s\S]{0,400}?return;/,
    "bei geschlossener Boerse darf nicht in einer Schleife neu verbunden werden");
});

test("RS7 — die Zustaende der Intraday-Funktion bleiben auseinander", async () => {
  const faelle = [
    { name: "Bars vorhanden", ticker: verzeichnis.symbols.ELIGIBLE[0],
      antwort: { ok: true, json: [{ date: "2026-09-11T13:30:00.000Z", open: 1, high: 2, low: 1, close: 1.5, volume: 10 }] },
      erwartet: "INTRADAY_AVAILABLE" },
    { name: "keine Bars", ticker: verzeichnis.symbols.ELIGIBLE[1],
      antwort: { ok: true, json: [] }, erwartet: "INTRADAY_UNAVAILABLE" },
    { name: "Anbieter kennt das Symbol nicht", ticker: verzeichnis.symbols.ELIGIBLE[2],
      antwort: { ok: false, status: 404, text: "Not found" }, erwartet: "INTRADAY_UNAVAILABLE" },
    { name: "Anbieter lehnt ab", ticker: verzeichnis.symbols.ELIGIBLE[3],
      antwort: { ok: false, status: 500, text: "boom" }, erwartet: "PROVIDER_UNAVAILABLE" },
    { name: "ausgeschlossenes Papier", ticker: verzeichnis.excluded.WARRANT[0],
      antwort: null, erwartet: "NOT_ELIGIBLE" },
    { name: "unbekanntes Symbol", ticker: "ZZZZZZ", antwort: null, erwartet: "SYMBOL_NOT_SUPPORTED" }
  ];

  for (const fall of faelle) {
    const antwort = await intradayLauf(fall.ticker, fall.antwort);
    assert.equal(antwort.body.state, fall.erwartet, `${fall.name} (${fall.ticker})`);
    assert.ok(antwort.body.marketStatus, `${fall.name}: der Marktzustand fehlt in der Antwort`);
    if (fall.erwartet === "INTRADAY_AVAILABLE") {
      assert.equal(antwort.body.barCount, 1);
      assert.equal(antwort.body.bars.length, 1, "es darf keine Bar dazuerfunden werden");
    }
    if (fall.erwartet === "NOT_ELIGIBLE") {
      assert.equal(antwort.body.instrumentClass, "WARRANT");
    }

    /* KEIN TAGESVERLAUF IST KEINE ABGESCHALTETE ECHTZEIT.

       Das sind zwei Auskuenfte, und sie fallen auseinander: ein Titel
       kann beim Anbieter keine Intraday-Reihe haben und trotzdem
       gehandelt werden. Wer daraus "Echtzeit nicht verfuegbar" macht,
       sagt dem Nutzer etwas Falsches ueber seinen Titel. */
    if (["INTRADAY_AVAILABLE", "INTRADAY_UNAVAILABLE"].includes(fall.erwartet)) {
      assert.equal(antwort.body.realtime, "REALTIME_AVAILABLE",
        `${fall.name}: ein Titel des Universums bleibt echtzeitfaehig, auch ohne Bars`);
    }
  }
});

test("RS8b — eine Quote ist kein Kurs und bewegt den Chart nicht", async () => {
  /* Der Anbieter schickt weit mehr Quotes als Abschluesse. Die erste
     Fassung hat ihnen einen Kurs gegeben - die Mitte zwischen Geld und
     Brief, notfalls selbst gerechnet - und den in dieselbe Kerze
     geschrieben wie echte Abschluesse. Zu diesem Kurs hat nie jemand
     gehandelt.

     Gemessen wird deshalb an der Wirkung, nicht am Quelltext: eine
     Quote darf gezaehlt werden, aber sie darf keinen Tick erzeugen. */
  const { ereignisse } = await stromLauf({
    tickers: "AAPL",
    nachrichten: [
      { messageType: "I", response: { message: "Success" } },
      { messageType: "A", data: ["Q", "2026-09-14T13:30:00.000Z", 0, "AAPL", 0, 231.4, 231.45, 231.5, 0, 0, 0] },
      { messageType: "A", data: ["Q", "2026-09-14T13:30:00.500Z", 0, "AAPL", 0, 231.4, 231.46, 231.5, 0, 0, 0] },
      { messageType: "A", data: ["T", "2026-09-14T13:30:01.000Z", 0, "AAPL", 0, 0, 0, 0, 0, 231.6, 50] }
    ]
  });
  const ticks = ereignisse.filter((e) => e.event === "tick");
  assert.equal(ticks.length, 1, "nur der Abschluss darf ein Kursereignis sein");
  assert.equal(ticks[0].data.price, 231.6);
  assert.equal(ticks[0].data.kind, "TRADE");

  /* Und nirgends taucht die gerechnete Mitte auf. */
  const mitte = (231.4 + 231.5) / 2;
  const alleKurse = ticks.map((t) => t.data.price);
  assert.ok(!alleKurse.includes(mitte) && !alleKurse.includes(231.45),
    "die Mitte zwischen Geld und Brief ist kein beobachteter Kurs");

  const summary = ereignisse.find((e) => e.event === "summary");
  assert.equal(summary.data.updates, 1);
  assert.equal(summary.data.quotes, 2, "die Quotes belegen den laufenden Strom und werden gezaehlt");
});

test("RS8 — es wird kein Kurs erfunden", () => {
  for (const datei of PRODUKTIV) {
    const code = ohneKommentare(lies(datei));
    assert.ok(!/Math\.random/.test(code), `${datei} erzeugt Zufallszahlen`);
  }
  /* Der Browser schreibt den gemeldeten Kurs - nicht einen gerechneten. */
  const browser = ohneKommentare(lies("vu2-bridge/experience.js"));
  assert.match(browser, /letzte\.close = tick\.price;/,
    "der letzte Punkt muss der gemeldete Kurs sein");
  assert.ok(!/interpol|glaett|smooth/i.test(browser), "es wird nichts zwischen zwei Kurse gerechnet");
  /* Und der Server deutet nur, was der Anbieter schickt. */
  const server = ohneKommentare(lies("api/realtime.js"));
  assert.match(server, /if \(preis === null\) return null;/,
    "ohne Kurs entsteht kein Tick");
  assert.ok(!/priceTypeConfirmed: true/.test(server),
    "die Kursart ist nicht bestaetigt - das darf nirgends behauptet werden");
  assert.ok(!/\(bid \+ ask\) \/ 2|\(geld \+ brief\) \/ 2/.test(server),
    "eine selbst gerechnete Mitte ist kein beobachteter Kurs");
});

/* ------------------------------------------------------------ Werkzeug */

/** Fuehrt api/realtime.js mit einem Attrappen-Socket aus. */
async function stromLauf({ tickers, nachrichten }) {
  const echterSocket = globalThis.WebSocket;
  const ereignisse = [];
  let zuhoerer = {};

  globalThis.WebSocket = class {
    constructor() {
      setTimeout(() => {
        (zuhoerer.open || []).forEach((f) => f());
        for (const n of nachrichten) {
          (zuhoerer.message || []).forEach((f) => f({ data: JSON.stringify(n) }));
        }
        (zuhoerer.close || []).forEach((f) => f());
      }, 5);
    }
    addEventListener(art, fn) { (zuhoerer[art] || (zuhoerer[art] = [])).push(fn); }
    send() {}
    close() {}
  };
  const alt = process.env.TIINGO_API_KEY;
  process.env.TIINGO_API_KEY = "fixture-key-not-a-real-token";

  try {
    const handler = require(join(root, "api", "realtime.js"));
    await new Promise((fertig) => {
      const res = {
        statusCode: 200, setHeader() {},
        write(text) {
          const art = (text.match(/^event: (.+)$/m) || [])[1];
          const roh = (text.match(/^data: (.+)$/m) || [])[1];
          if (art && roh) ereignisse.push({ event: art, data: JSON.parse(roh) });
        },
        end() { fertig(); }
      };
      handler({ url: `/api/realtime?tickers=${tickers}`, on() {} }, res);
    });
  } finally {
    globalThis.WebSocket = echterSocket;
    if (alt === undefined) delete process.env.TIINGO_API_KEY; else process.env.TIINGO_API_KEY = alt;
    zuhoerer = {};
  }
  return { ereignisse };
}

/** Fuehrt api/intraday.js mit einer Attrappe fuer fetch aus. */
async function intradayLauf(ticker, antwort) {
  const echtesFetch = globalThis.fetch;
  const alt = process.env.TIINGO_API_KEY;
  process.env.TIINGO_API_KEY = "fixture-key-not-a-real-token";
  if (antwort) {
    globalThis.fetch = async () => ({
      ok: antwort.ok, status: antwort.status || 200,
      json: async () => antwort.json,
      text: async () => antwort.text || ""
    });
  } else {
    globalThis.fetch = async () => { throw new Error("es haette gar nicht abgerufen werden duerfen"); };
  }
  try {
    const handler = require(join(root, "api", "intraday.js"));
    return await new Promise((fertig) => {
      let inhalt = "";
      const res = {
        statusCode: 200, setHeader() {}, write(t) { inhalt += t; },
        end(t) { if (t) inhalt += t; fertig({ status: res.statusCode, body: JSON.parse(inhalt) }); }
      };
      handler({ url: `/api/intraday?ticker=${encodeURIComponent(ticker)}`, on() {} }, res);
    });
  } finally {
    globalThis.fetch = echtesFetch;
    if (alt === undefined) delete process.env.TIINGO_API_KEY; else process.env.TIINGO_API_KEY = alt;
  }
}

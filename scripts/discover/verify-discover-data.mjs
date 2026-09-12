/* =========================================================================
   VISION UNIVERSE DISCOVER — verify-discover-data.mjs

   Stimmen die ausgelieferten Discover-Payloads mit den Engines ueberein?

   Dieselbe Rolle wie scripts/quant/verify-quant-data.mjs fuer den
   Quant-Kern: das Build-Skript rechnet, dieses Skript rechnet NACH und
   widerspricht, wenn etwas nicht zusammenpasst. Ein Datenstand, der
   stillschweigend von seiner Methodik abweicht, ist schlimmer als ein
   fehlender - er sieht gerechnet aus.

   Geprueft wird:

     1. Vertrag        jeder Datensatz erfuellt den Discover-Contract
     2. Nachrechnung   Leadership-, Momentum- und RS-Score aus den
                       ausgelieferten Rohwerten ergeben denselben Wert
     3. Sortierung     jede Zeile ist tatsaechlich nach ihrem Schluessel sortiert
     4. Signale        jedes Signal hat die Kennzahl, aus der es entsteht
     5. Redistribution im realen Universum steht kein absolutes Kursniveau,
                       ausser fuer die ausdruecklich freigegebenen Titel
     6. Verweise       jede Karte fuehrt auf eine vorhandene Detailseite

   Ausfuehren: node scripts/discover/verify-discover-data.mjs
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");

const Contract = require(join(root, "discover", "engines", "contract.js"));
const Klartext = require(join(root, "discover", "engines", "klartext.js"));
const Scoring = require(join(root, "discover", "engines", "scoring.js"));
const High52w = require(join(root, "discover", "engines", "high52w.js"));
const DisplayPolicy = require(join(root, "quant", "engines", "display-policy.js"));
const METHODOLOGY = require(join(root, "discover", "methodology", "discover-v1.json"));

const PREVIEW = JSON.parse(readFileSync(join(root, "quant", "config", "development-preview.json"), "utf8"));
const GATES = DisplayPolicy.gatesFromConfig(
  JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8")));
DisplayPolicy.declareFromConfig(PREVIEW);

const problems = [];
let checks = 0;

function check(condition, message) {
  checks++;
  if (!condition) problems.push(message);
}
function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

if (!existsSync(join(DATA, "meta.json"))) {
  console.error("discover/data/meta.json fehlt. Erst 'node scripts/discover/build-discover-data.mjs' ausfuehren.");
  process.exit(1);
}

const meta = readJSON(join(DATA, "meta.json"));
console.log("Vision Universe DISCOVER — Nachrechnung\n");
console.log(`  Modul ${meta.moduleVersion}, Methodik ${meta.methodologyVersion}\n`);

check(meta.methodologyVersion === METHODOLOGY.methodologyVersion,
  "meta.json traegt eine andere Methodikversion als discover/methodology/discover-v1.json");
check(meta.contractVersion === Contract.CONTRACT_VERSION,
  "meta.json traegt eine andere Contract-Version als die Engine");

/* Die Titel, fuer die eine Kursanzeige ausdruecklich freigegeben ist. */
const previewScope = new Set();
for (const grant of PREVIEW.grants || []) {
  for (const ticker of grant.developmentPreviewScope || []) {
    const verdict = DisplayPolicy.check({
      providerId: grant.providerId, dataClass: "marketData",
      audience: "development_preview", form: "raw", gates: GATES, ticker: ticker
    });
    if (verdict.allowed) previewScope.add(ticker);
  }
}

/* Absolute Kursgroessen, die im realen Universum nicht auftauchen duerfen. */
const FORBIDDEN_LEVEL_FIELDS = ["high52w", "low52w", "sma20", "sma50", "sma100", "sma200",
                                "previous52WeekHigh", "previous52WeekLow", "lastClose"];

function scanForLevels(node, path, universeKind, symbol) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanForLevels(v, path + "[" + i + "]", universeKind, symbol));
    return;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (FORBIDDEN_LEVEL_FIELDS.indexOf(key) !== -1 && isNum(value) && universeKind === "real" &&
        !previewScope.has(symbol)) {
      problems.push(`Redistribution: ${path}.${key} liefert ein absolutes Kursniveau fuer ${symbol}`);
    }
    scanForLevels(value, path + "." + key, universeKind, symbol);
  }
}

for (const universe of meta.universes) {
  const id = universe.universeId;
  const rows = readdirSync(join(DATA, "rows", id)).filter((n) => n.endsWith(".json"));
  console.log(`  ${id}: ${universe.securities} Titel, ${rows.length} Zeilen, ${universe.detailPages} Detailseiten`);

  const detailFiles = new Set(readdirSync(join(DATA, "stocks", id)));
  const rowConfigs = new Map(METHODOLOGY.rows.map((r) => [r.id, r]));

  for (const file of rows) {
    const row = readJSON(join(DATA, "rows", id, file));
    const config = rowConfigs.get(row.rowId);
    const cards = row.rowId === "sector-leaders"
      ? row.sectors.reduce((acc, s) => acc.concat(s.cards), [])
      : row.cards;

    /* Der Klartext der ganzen Reihe, aus der AUSGELIEFERTEN Reihenfolge
       nachgerechnet. Die Begrenzung "derselbe Satz hoechstens zweimal"
       haengt an der Reihe, nicht an der einzelnen Karte - eine Karte fuer
       sich allein liesse sich gar nicht pruefen. */
    const nachgerechnet = row.rowId === "sector-leaders"
      ? [] : Klartext.reihe(cards, row.rowId);

    check(row.universeId === id, `${file}: falsche universeId`);
    check(row.methodologyVersion === METHODOLOGY.methodologyVersion,
      `${file}: abweichende Methodikversion`);

    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      const card = cards[cardIndex];
      /* Zwei Kartenformen sind zulaessig: die volle Karte der Reihen und
         die schlanke Verweiskachel der Sektoren (Contract.toMiniCard), die
         bewusst weder Signale noch Kursreihe traegt. Geprueft wird beides
         nach denselben Regeln - nur eben das, was jeweils vorhanden ist. */
      const mini = !card.signals;
      const stock = Contract.normalizeStock(Object.assign({}, card, {
        dataMode: card.dataMode, universeId: id
      }));
      try {
        Contract.assertStock(stock);
      } catch (err) {
        problems.push(`${file}/${card.symbol}: ${err.message}`);
      }
      check(detailFiles.has(card.symbol + ".json"),
        `${file}: ${card.symbol} hat keine Detailseite`);

      /* Ein Kurs im realen Universum ohne ausdrueckliche Freigabe ist der
         Fehler, den dieses Skript verhindern soll. */
      if (universe.kind === "real" && isNum(card.price && card.price.value)) {
        check(previewScope.has(card.symbol),
          `${file}: ${card.symbol} liefert einen Kurs ohne Freigabe in der Anzeigerichtlinie`);
      }
      if (universe.kind === "real" && Array.isArray(card.sparkline)) {
        check(previewScope.has(card.symbol),
          `${file}: ${card.symbol} liefert eine Kursreihe ohne Freigabe`);
      }
      for (const key of ["leadershipPercentile", "momentumPercentile", "relativeStrengthPercentile"]) {
        const v = card.metrics[key];
        check(!isNum(v) || (v >= 0 && v <= 100), `${file}: ${card.symbol} hat ${key} ausserhalb 0..100`);
      }
      if (mini) continue;
      /* Signale ohne ihre Kennzahl. */
      if (card.signals.breakout) {
        check(isNum(card.metrics.breakoutScore) || isNum(card.metrics.volumeSpikeRatio),
          `${file}: ${card.symbol} meldet Breakout ohne Volumenkennzahl`);
      }
      if (card.signals.marketLeader) {
        check(isNum(card.metrics.leadershipPercentile) && card.metrics.leadershipPercentile >= 90,
          `${file}: ${card.symbol} traegt MARKET LEADER unterhalb des Perzentils 90`);
      }

      /* Der Klartext wird nachgerechnet wie jede andere Zahl.

         Ein Satz auf einer Karte ist eine Aussage ueber ein Wertpapier -
         er gehoert genauso geprueft wie der Wert, aus dem er entsteht.
         Geprueft wird dreierlei: dass ueberhaupt einer da ist, dass er
         sich aus denselben Kennzahlen erneut ergibt, und dass er seiner
         eigenen Zahl nicht widerspricht. */
      const erneut = nachgerechnet[cardIndex] || {};
      check(!!card.plain, `${file}: ${card.symbol} hat keinen Klartext`);
      if (card.plain) {
        check(card.plain.story === erneut.story,
          `${file}: ${card.symbol} Klartext "${card.plain.story}" != nachgerechnet "${erneut.story}"`);
        check(JSON.stringify(card.plain.zahl) === JSON.stringify(erneut.zahl),
          `${file}: ${card.symbol} Klartext-Zahl weicht ab`);
        check(card.plain.zusatz === erneut.zusatz,
          `${file}: ${card.symbol} Klartext-Zusatz weicht ab`);
        check(!!card.plain.story,
          `${file}: ${card.symbol} traegt eine Karte ohne Aussage`);
        if (card.plain.zahl && isNum(card.plain.zahl.roh)) {
          check(Math.abs(card.plain.zahl.roh - card.metrics[card.plain.zahl.quelle]) < 1e-9,
            `${file}: ${card.symbol} Klartext-Zahl stammt nicht aus der genannten Kennzahl`);
        }
      }
    }

    /* Sortierung. */
    if (config && row.cards && row.cards.length > 1) {
      for (let i = 1; i < row.cards.length; i++) {
        const prev = row.cards[i - 1], cur = row.cards[i];
        if (config.signalFirst) {
          const a = prev.signals[config.signalFirst] === true;
          const b = cur.signals[config.signalFirst] === true;
          if (a !== b) { check(a, `${file}: Signaltraeger stehen nicht vorn`); continue; }
        }
        const av = prev.metrics[config.sort], bv = cur.metrics[config.sort];
        if (!isNum(av) || !isNum(bv)) continue;
        check(config.direction === "asc" ? av <= bv : av >= bv,
          `${file}: nicht nach ${config.sort} sortiert (${prev.symbol} vor ${cur.symbol})`);
      }
    }
  }

  /* Detailseiten: Scores nachrechnen. */
  let recomputed = 0;
  for (const file of detailFiles) {
    const detail = readJSON(join(DATA, "stocks", id, file));
    scanForLevels(detail.metrics, `stocks/${id}/${file}:metrics`, universe.kind, detail.symbol);
    scanForLevels(detail.high52w, `stocks/${id}/${file}:high52w`, universe.kind, detail.symbol);
    scanForLevels(detail.rawValues, `stocks/${id}/${file}:rawValues`, universe.kind, detail.symbol);

    const metrics = Object.assign({}, detail.metrics);
    const erneut = {
      leadership: Scoring.composite(METHODOLOGY.leadershipScore, metrics),
      momentum: Scoring.composite(METHODOLOGY.momentumScore, metrics),
      relativeStrength: Scoring.composite(METHODOLOGY.relativeStrengthScore, metrics)
    };
    for (const key of Object.keys(erneut)) {
      const geliefert = detail.scores[key];
      const neu = erneut[key];
      check(geliefert.status === neu.status,
        `${file}: ${key} Status ${geliefert.status} != nachgerechnet ${neu.status}`);
      if (isNum(geliefert.score) && isNum(neu.score)) {
        check(Math.abs(geliefert.score - neu.score) < 1e-4,
          `${file}: ${key} ${geliefert.score} != nachgerechnet ${neu.score}`);
      }
    }

    /* 52-Wochen-Zustand aus dem ausgelieferten Abstand. */
    if (isNum(detail.metrics.distanceTo52wHigh)) {
      const erwartet = High52w.fromDistance(detail.metrics.distanceTo52wHigh,
        detail.metrics.distanceTo52wLow,
        Object.assign({ touchedHigh: detail.rawValues && detail.rawValues.newHigh52w === true },
                      METHODOLOGY.high52w));
      check(erwartet.state === detail.high52w.state,
        `${file}: 52-Wochen-Zustand ${detail.high52w.state} != nachgerechnet ${erwartet.state}`);
      check(detail.signals.new52WeekHigh === erwartet.isNew52WeekHigh ||
            detail.discoveryEligible === false,
        `${file}: Hochsignal passt nicht zum nachgerechneten Zustand`);
    }
    recomputed++;
  }
  console.log(`           ${recomputed} Detailseiten nachgerechnet`);
}

console.log(`\n  ${checks} Pruefungen ausgefuehrt.`);
if (problems.length) {
  console.error(`\n  ${problems.length} Abweichungen:\n`);
  problems.slice(0, 40).forEach((p) => console.error("   - " + p));
  if (problems.length > 40) console.error(`   … und ${problems.length - 40} weitere`);
  process.exit(1);
}
console.log("  Keine Abweichung. Daten und Engines stimmen ueberein.\n");

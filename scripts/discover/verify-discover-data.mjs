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
const Relevance = require(join(root, "discover", "engines", "relevance.js"));
const RECOGNITION = JSON.parse(readFileSync(join(root, "discover", "config", "company-recognition.json"), "utf8")).companies || {};
const THEMES = JSON.parse(readFileSync(join(root, "discover", "config", "themes.json"), "utf8"));
/* Dieselbe Reihenliste wie im Build: Methodik plus Themen. */
const ROWS = METHODOLOGY.rows.concat((THEMES.themes || []).map((t) => ({
  id: "thema-" + t.id, title: t.title, sort: "leadershipScore", direction: "desc",
  filter: "thema", tickers: t.tickers, theme: t.id
})));

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
/* Der Umfang, in dem reale Kursreihen ausgeliefert werden duerfen:
   dieselbe Aufloesung wie im Hygiene-Guard (Tickerliste oder Universum). */
const { resolveScope } = await import(join(root, "scripts", "market", "preview-scope.mjs"));
const seriesScope = resolveScope(root, PREVIEW).tickers;
const previewScope = new Set();
/* Oeffentliche Freigabe (Grant mit publicRawDisplayAllowed + Grundlage):
   dann gilt der ganze aufgeloeste Umfang. Sonst je Titel die enge
   Development-Preview-Erlaubnis. */
const oeffentlich = DisplayPolicy.check({ providerId: "tiingo", dataClass: "marketData",
                                          audience: "public", form: "raw", gates: GATES });
if (oeffentlich.allowed) for (const t of seriesScope) previewScope.add(t);
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
  const rowConfigs = new Map(ROWS.map((r) => [r.id, r]));

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

    /* V4 §17-22: Rangbegruendung, Index-Herkunft, Qualifikation, Margenband. */
    if (row.rowId !== "sector-leaders" && config) {
      let letzter = null;
      cards.forEach((c, i) => {
        const rr = c.rankingReason;
        check(rr && rr.rowId === row.rowId && rr.rank === i + 1, `${file}: ${c.symbol} ohne passende rankingReason (Rang ${i + 1})`);
        if (rr && rr.of !== undefined) check(rr.of >= cards.length, `${file}: rankingReason.of kleiner als die Reihe`);
        if (rr && isNum(rr.sortValue) && letzter !== null && !config.signalFirst) {
          check(config.direction === "asc" ? rr.sortValue >= letzter : rr.sortValue <= letzter,
            `${file}: ${c.symbol} Sortierwert ${rr.sortValue} bricht die Reihenfolge (${config.direction})`);
        }
        if (rr && isNum(rr.sortValue)) letzter = rr.sortValue;
        if (config.filter === "strongest" || config.filter === "indexMember" || config.qualify === true) {
          check(c.qualification && c.qualification.strongest === true, `${file}: ${c.symbol} steht ohne Qualifikation in einer "staerkste"-Reihe`);
        }
        if (config.indexId) {
          check(Array.isArray(c.indexMemberships) && c.indexMemberships.indexOf(config.indexId) !== -1,
            `${file}: ${c.symbol} ist laut Karte kein Mitglied von ${config.indexId}`);
        }
        /* Kein Titel traegt eine Marge ausserhalb des Plausibilitaetsbands
           auf eine Karte (V4 §22). */
        for (const k of ["f_netMargin", "f_fcfMargin"]) {
          if (isNum(c.metrics[k])) check(Math.abs(c.metrics[k]) <= 1.5, `${file}: ${c.symbol} ${k} = ${c.metrics[k]} ausserhalb des Plausibilitaetsbands`);
        }
        if (isNum(c.metrics.f_marginExpansion3y)) check(Math.abs(c.metrics.f_marginExpansion3y) <= 100, `${file}: ${c.symbol} f_marginExpansion3y = ${c.metrics.f_marginExpansion3y} pp`);
      });
      if (config.indexId) {
        check(!cards.length || (row.index && row.index.indexId === config.indexId && /^\d{4}-\d{2}-\d{2}$/.test(String(row.index.asOf))),
          `${file}: Index-Reihe ohne Herkunft (index.asOf)`);
        const memberFile = join(root, "quant", "data", "market", "index-membership", config.indexId + ".json");
        if (cards.length && existsSync(memberFile)) {
          const mitglieder = new Set(readJSON(memberFile).members.map((m) => m.symbol));
          cards.forEach((c) => check(mitglieder.has(c.symbol), `${file}: ${c.symbol} steht nicht im Bestand ${config.indexId}`));
        }
      }
    }

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
      /* Chart Truth Contract (V3): eine Karte darf nur zeichnen, was sie
         belegt tragen darf. */
      const ps = card.priceSeries;
      if (ps) {
        const punkte = Array.isArray(ps.points) ? ps.points.length : 0;
        if (ps.status === "CALCULATED") {
          /* Karten tragen einen Verweis, keine Punkte: die Reihe liegt in
             discover/data/series/ und muss dort existieren, mit Punkten,
             Herkunft und Stand. */
          check(punkte === 0, `${file}: ${card.symbol} traegt Punkte auf der Karte statt eines Verweises`);
          /* Zwei zulaessige Ablagen: der Series-Store des Builds oder die
             kanonische kompakte Reihe (quant/data/market/discover-series/). */
          const kanonisch = typeof ps.path === "string" && ps.path.startsWith("/quant/data/market/discover-series/");
          check(typeof ps.path === "string" && (kanonisch || ps.path.startsWith("/discover/data/series/" + id + "/")),
            `${file}: ${card.symbol} priceSeries ohne Verweis auf den Series-Store`);
          const seriesFile = kanonisch ? join(root, ps.path.slice(1)) : join(DATA, "series", id, card.symbol + ".json");
          check(existsSync(seriesFile), `${file}: ${card.symbol} Verweis ohne Datei ${seriesFile}`);
          if (existsSync(seriesFile)) {
            const reihe = readJSON(seriesFile);
            check(Array.isArray(reihe.points) && reihe.points.length >= 5 && !!reihe.source && !!reihe.asOf,
              `${file}: ${card.symbol} Reihe ohne Punkte/Herkunft/Stand`);
            check(reihe.source === ps.source && reihe.asOf === ps.asOf,
              `${file}: ${card.symbol} Verweis und Reihe widersprechen sich`);
          }
          check(!!ps.source && !!ps.asOf, `${file}: ${card.symbol} priceSeries ohne Herkunft/Stand`);
          if (universe.kind === "real") {
            check(seriesScope.has(card.symbol),
              `${file}: ${card.symbol} traegt eine Micro-Kursreihe ohne Freigabe`);
          }
        } else {
          check(punkte === 0 && !ps.ranges && !ps.path,
            `${file}: ${card.symbol} priceSeries ${ps.status} traegt trotzdem Punkte oder Verweis`);
        }
      }
      /* Themenreihen: nur, was in der Themenliste steht. */
      if (config && config.filter === "thema") {
        check(config.tickers.indexOf(card.symbol) !== -1,
          `${file}: ${card.symbol} steht nicht in der Themenliste ${config.theme}`);
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

  /* Series-Store: jede Datei traegt Punkte, Herkunft, Stand - und im
     realen Universum nur Titel aus dem freigegebenen Umfang. */
  const seriesDir = join(DATA, "series", id);
  let seriesFiles = 0;
  if (existsSync(seriesDir)) {
    for (const file of readdirSync(seriesDir).filter((n) => n.endsWith(".json"))) {
      const reihe = readJSON(join(seriesDir, file));
      seriesFiles++;
      check(reihe.status === "CALCULATED" && Array.isArray(reihe.points) && reihe.points.length >= 5,
        `series/${id}/${file}: keine Punkte`);
      check(!!reihe.source && !!reihe.asOf && !!reihe.priceSeriesType, `series/${id}/${file}: ohne Herkunft`);
      check(reihe.points.every((p) => Array.isArray(p) && typeof p[0] === "string" && isNum(p[1])),
        `series/${id}/${file}: Punkte nicht [datum, schluss]`);
      if (universe.kind === "real") {
        check(seriesScope.has(reihe.symbol), `series/${id}/${file}: reale Reihe ausserhalb des Umfangs`);
      }
    }
  }
  console.log(`           ${seriesFiles} Kursreihen im Series-Store geprueft`);

  /* Startseite (V3): jede Karte einer Surface muss in ihrer Reihe stehen -
     die Discovery-Reihenfolge darf umsortieren, nie aufnehmen. Und die
     Diversity-Regeln muessen halten. */
  const homeFiles = readdirSync(join(DATA, "home")).filter((n) => n.startsWith(id) && n.endsWith(".json"))
    .sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1));
  const surfaces = [];
  for (const file of homeFiles) {
    const teil = readJSON(join(DATA, "home", file));
    check(teil.methodologyVersion === METHODOLOGY.methodologyVersion, `home/${file}: abweichende Methodikversion`);
    surfaces.push(...(teil.surfaces || []));
  }
  const fuehrt = {}, auftritte = {};
  for (const s of surfaces) {
    const cards = s.cards || [];
    if (s.rowId && s.rowId !== "sector-leaders") {
      const row = readJSON(join(DATA, "rows", id, s.rowId + ".json"));
      const erlaubt = new Set(row.cards.map((c) => c.symbol));
      cards.forEach((c) => check(erlaubt.has(c.symbol),
        `home ${s.id}: ${c.symbol} steht nicht in der Reihe ${s.rowId} (Relevanz hat aufgenommen statt sortiert)`));
      if (s.type === "ranking") {
        check(JSON.stringify(cards.map((c) => c.symbol)) ===
              JSON.stringify(row.cards.slice(0, cards.length).map((c) => c.symbol)),
          `home ${s.id}: nummerierte Rangliste weicht von der Reihe ab`);
      }
      const ordered = Relevance.discoveryOrder(row.cards, { recognition: RECOGNITION }).cards.map((c) => c.symbol);
      if (s.type !== "ranking" && s.type !== "featured-card") {
        const gezeigt = cards.map((c) => c.symbol);
        const rest = ordered.filter((x) => gezeigt.indexOf(x) !== -1);
        check(JSON.stringify(rest) === JSON.stringify(gezeigt),
          `home ${s.id}: Reihenfolge ist nicht die Discovery-Reihenfolge (Diversity darf nur entfernen)`);
      }
    }
    cards.forEach((c, i) => {
      check(detailFiles.has(c.symbol + ".json"), `home ${s.id}: ${c.symbol} ohne Detailseite`);
      auftritte[c.symbol] = (auftritte[c.symbol] || 0) + 1;
      /* Kurze Reihen (bis sechs Treffer) zeigen, was sie haben - sie
         werden nicht gekuerzt und zaehlen deshalb auch nicht als
         Anfuehren. Dieselbe Ausnahme wie in relevance.js. */
      const kurz = s.type !== "featured-card" && cards.length <= 6 && (!isNum(s.total) || s.total <= 6);
      /* Nummerierte Ranglisten zaehlen nicht als "Anfuehren".
       *
       * Die Diversity-Regel darf nur ENTFERNEN, und an einer Rangliste
       * darf sie gar nichts: "TOP 10 zeigt die echte Rangliste,
       * ungefiltert" ist eine eigene Zusage. Wer an drei Ranglisten oben
       * steht, steht dort, weil die Zahlen es sagen - das ist die
       * Aussage des Tages und kein Gestaltungsfehler.
       *
       * Am 18.09.2026 fiel der Verifier deshalb ueber VLO: nach dem
       * EOD-Nachlauf stand der Titel im 99,97. Perzentil und fuehrte drei
       * Ranglisten an. Die Engine konnte das nicht verhindern, ohne eine
       * andere Zusage zu brechen - eine Pruefung, die etwas verlangt, das
       * der Vertrag verbietet, ist keine Pruefung.
       *
       * Was bleibt: redaktionelle Reihen (row, theme, featured-card)
       * duerfen hoechstens zweimal von demselben Titel angefuehrt werden,
       * und die Gesamtpraesenz bleibt gedeckelt. */
      const rangliste = s.type === "ranking";
      if (i < 2 && s.type !== "hero" && !kurz && !rangliste) {
        fuehrt[c.symbol] = (fuehrt[c.symbol] || 0) + 1;
      }
      if (universe.kind === "real" && c.priceSeries && c.priceSeries.status === "CALCULATED") {
        check(seriesScope.has(c.symbol), `home ${s.id}: ${c.symbol} zeichnet ohne Freigabe`);
      }
    });
  }
  Object.keys(fuehrt).forEach((sym) => {
    if (fuehrt[sym] > 1) {
      const karte = surfaces.flatMap((s) => s.cards || []).find((c) => c.symbol === sym);
      const p = karte && karte.metrics && karte.metrics.leadershipPercentile;
      check(fuehrt[sym] <= 2 && isNum(p) && p >= 99,
        `home: ${sym} fuehrt ${fuehrt[sym]} redaktionelle Reihen an (Perzentil ${p})`);
    }
  });
  Object.keys(auftritte).forEach((sym) => {
    /* Hero + Rangliste + zwei Reihen sind das Maximum, das die Regel
       (zwei Auftritte, reine Surfaces zaehlen mit) zulaesst. */
    check(auftritte[sym] <= 4, `home: ${sym} erscheint ${auftritte[sym]} Mal`);
  });
  console.log(`           ${surfaces.length} Surfaces der Startseite geprueft`);

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

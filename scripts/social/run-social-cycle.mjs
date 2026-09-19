/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/run-social-cycle.mjs

   DER KREISLAUF ALS EIN LAUF (§2, §54)

     SIGNALE -> GELEGENHEITEN -> STRATEGIE -> CONTENT -> VALIDIERUNG
             -> TERMINIERUNG -> VEROEFFENTLICHUNG -> MESSUNG -> LERNEN

   Dieses Skript ist der Orchestrator aus §39 — kein Agent mit einem
   Mega-Prompt, sondern die Reihenfolge, in der die Engines einander
   ihre Contracts uebergeben.

   -------------------------------------------------------------------------
   WAS ES TUT UND WAS NICHT
   -------------------------------------------------------------------------

   Es VEROEFFENTLICHT NICHTS, solange der Kill Switch aus ist und die
   wirksame Autonomiestufe unter 4 liegt. Beides ist heute der Fall, und
   beides prueft das Skript selbst — nicht der Aufrufer.

   Mit `--provider mock` laeuft der vollstaendige Pfad inklusive
   "Veroeffentlichung" gegen den Mock. Das ist der Nachweis aus §53: der
   Kreislauf traegt, und der erste Provider kann ihn durchlaufen.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     node scripts/social/run-social-cycle.mjs               Trockenlauf
     node scripts/social/run-social-cycle.mjs --provider mock
     node scripts/social/run-social-cycle.mjs --out social/data

   Ohne `--out` wird nichts geschrieben. Ein Lauf, der ungefragt
   Artefakte anlegt, ist im Zweifel der Lauf, der die Produktionsdaten
   ueberschreibt (MASTER §31.10).
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Schema       = require(join(ROOT, "social/engines/schema.js"));
const StrategyMemory = require(join(ROOT, "social/engines/strategy-memory.js"));
const Signals      = require(join(ROOT, "social/engines/signals.js"));
const TrendScore   = require(join(ROOT, "social/engines/trend-score.js"));
const Opportunity  = require(join(ROOT, "social/engines/opportunity.js"));
const Strategy     = require(join(ROOT, "social/engines/strategy.js"));
const Content      = require(join(ROOT, "social/engines/content.js"));
const VisualComposition = require(join(ROOT, "social/engines/visual-composition.js"));
const Memory       = require(join(ROOT, "social/engines/memory.js"));
const Fatigue      = require(join(ROOT, "social/engines/fatigue.js"));
const Publishing   = require(join(ROOT, "social/engines/publishing.js"));
const Analytics    = require(join(ROOT, "social/engines/analytics.js"));
const Performance  = require(join(ROOT, "social/engines/performance.js"));
const Learning     = require(join(ROOT, "social/engines/learning.js"));
const Experiments  = require(join(ROOT, "social/engines/experiments.js"));
const EvidenceRegime = require(join(ROOT, "social/engines/evidence-regime.js"));
const MessFenster  = require(join(ROOT, "social/engines/measurement-window.js"));
const Explain      = require(join(ROOT, "social/engines/explain.js"));
const Health       = require(join(ROOT, "social/engines/health.js"));
const Autonomy     = require(join(ROOT, "social/engines/autonomy.js"));
const KillSwitch   = require(join(ROOT, "social/engines/kill-switch.js"));
const AuditLog     = require(join(ROOT, "social/engines/audit-log.js"));
const ProviderCore = require(join(ROOT, "social/engines/provider.js"));
const Capabilities = require(join(ROOT, "social/engines/capabilities.js"));
const Brand        = require(join(ROOT, "social/engines/brand.js"));
const Authoring    = require(join(ROOT, "social/engines/authoring.js"));
const ContentBrief = require(join(ROOT, "social/engines/content-brief.js"));
const EvidencePackage = require(join(ROOT, "social/engines/evidence-package.js"));
const AutorVorlage = require(join(ROOT, "social/providers/authoring/template/adapter.js"));
const AutorModell  = require(join(ROOT, "social/providers/authoring/model/adapter.js"));
const AutorChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Lifecycle    = require(join(ROOT, "social/engines/provider-lifecycle.js"));
const CreativeContract = require(join(ROOT, "social/engines/creative-contract.js"));
const AudienceFit  = require(join(ROOT, "social/engines/audience-fit.js"));

/* -------------------------------------------------------------------
   KLARNAMEN — EINE QUELLE, NICHT ZWEI

   discover/config/company-names.json ist kuratierte redaktionelle
   Metadata und liegt ohnehin im Repository. Eine zweite Liste hier
   ginge irgendwann dagegen auseinander, und das Tor meldete Namen,
   die es nicht gibt.
   ------------------------------------------------------------------- */
const FIRMENNAMEN = (() => {
  const pfad = join(ROOT, "discover/config/company-names.json");
  if (!existsSync(pfad)) return {};
  try { return JSON.parse(readFileSync(pfad, "utf8")).names || {}; }
  catch { return {}; }
})();
const InvocationLedger = require(join(ROOT, "social/engines/invocation-ledger.js"));

/* Der Bild-Renderer ist ein ES-Modul und kein UMD-Engine — er ruft
   Chromium und gehoert deshalb nicht in die Browser-Ladbarkeit der
   Engines. */
import * as AssetRenderer from "./render-asset.mjs";
import * as VisualDaten from "./visual-data.mjs";


/* ---------------------------------------------------------------- CLI */
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const flag = (name) => argv.includes(name);

/* Zeichnen ist ausdruecklich anzufordern. Ein Trockenlauf, der
   Binaerdateien ins Repository schreibt, ist kein Trockenlauf. */
const RENDER = flag("--render");

/* Die Domain steht in CNAME und sonst nirgends. Sie hier ein zweites
   Mal hinzuschreiben hiesse, zwei Wahrheiten ueber eine Adresse zu
   haben — und die falsche faellt erst auf, wenn Meta das Bild nicht
   abholen kann. */
const SITE_BASE = "https://" + readFileSync(join(ROOT, "CNAME"), "utf8").trim();
/* Wo die Bilder liegen — und zugleich der Pfad, unter dem sie
   oeffentlich sind. Eine Verschiebung aendert beides zusammen; zwei
   getrennte Angaben waeren die Gelegenheit, eine Datei unter einer
   Adresse anzukuendigen, an der sie nicht liegt. */
const ASSET_DIR = arg("--asset-dir", "assets/social").replace(/^\/+|\/+$/g, "");
if (!ASSET_DIR.startsWith("assets/")) {
  /* Nur was unter assets/ liegt, wird von GitHub Pages ausgeliefert.
     Ein Bild anderswo bekaeme eine Adresse, unter der nichts liegt —
     und Meta lehnte den Container ab, nachdem der Anspruch angemeldet
     ist. Fuer Testlaeufe ist das in Ordnung; stillschweigend waere es
     das nicht. */
  console.log("[hinweis] --asset-dir " + ASSET_DIR + " liegt nicht unter assets/. " +
    "Die erzeugten Bildadressen sind oeffentlich NICHT erreichbar.");
}

const PROVIDER_ID = arg("--provider", null);
const OUT_DIR = arg("--out", null);
const NOW = arg("--now", new Date().toISOString());

/* Woher gelesen wird. Getrennt von --out, weil der Nachweis der
   Kreislauf-Schliessung zwei Laeufe gegen verschiedene Staende
   braucht, ohne die Produktionsdaten anzufassen. */
const DATA_DIR = arg("--data", "social/data");
const D = (name) => join(ROOT, DATA_DIR, name);
const VERBOSE = flag("--verbose");

const log = (...parts) => console.log(...parts);
const detail = (...parts) => { if (VERBOSE) console.log("   ", ...parts); };

/* ------------------------------------------------------ Konfiguration */
function readJson(relativePath, fallback) {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

const FENSTER_CONFIG = readJson("social/config/measurement-windows.json", null);
const killSwitchConfig = readJson("social/config/kill-switch.json", { gates: {} });
const autonomyConfig = readJson("social/config/autonomy.json", { desiredLevel: 0 });
const killSwitch = KillSwitch.fromConfig(killSwitchConfig);
const auditLog = AuditLog.createLog();
const now = () => new Date(NOW);

/* ----------------------------------------------------------- Provider */
function buildRegistry() {
  const registry = ProviderCore.createRegistry();
  if (PROVIDER_ID === "mock") {
    const { createMockProvider } = require(join(ROOT, "social/providers/mock/adapter.js"));
    registry.register(createMockProvider({ now }));
  } else if (PROVIDER_ID === "meta") {
    const Meta = require(join(ROOT, "social/providers/meta/adapter.js"));
    registry.register(Meta.createMetaProvider({
      /* Die Werte kommen aus der Umgebung und werden NIE ausgegeben. */
      appId: process.env[Meta.SECRET_NAMES.appId] || null,
      appSecret: process.env[Meta.SECRET_NAMES.appSecret] || null,
      tokenProvider: () => process.env[Meta.SECRET_NAMES.accessToken] || null,
      now
    }));
  }
  return registry;
}

/* =====================================================================
   STUFE 1 — SIGNALE
   ===================================================================== */

/**
 * Liest interne VU-Ereignisse.
 *
 * HEUTE: aus einer Datei, die ein eigener Lauf erzeugt
 * (scripts/social/collect-vu-signals.mjs). Dieses Skript erfindet keine
 * Ereignisse und liest die VU-Artefakte nicht selbst — die Trennung ist
 * Absicht: ein Lauf, der sammelt UND entscheidet, laesst sich nicht
 * einzeln pruefen.
 */
function loadSignals() {
  const file = D("signals.json");
  if (!existsSync(file)) {
    return { signals: [], internal: {}, reason:
      "Keine Signaldatei vorhanden (social/data/signals.json). " +
      "Erzeugen mit: node scripts/social/collect-vu-signals.mjs --out social/data" };
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const signals = [];
  const internal = {};
  const rejected = [];

  for (const event of raw.events || []) {
    const res = Signals.fromInternalEvent(event, { now: NOW });
    if (!res.ok) { rejected.push({ event: event.type, reason: res.reason }); continue; }
    signals.push(res.signal);
    internal[res.signal.signalId] = res.internal;
  }
  for (const external of raw.externalSignals || []) {
    const res = Signals.fromExternalSignal(external, { now: NOW });
    if (!res.ok) { rejected.push({ event: external.topic, reason: res.reason }); continue; }
    signals.push(res.signal);
  }
  return { signals, internal, rejected, generatedAt: raw.generatedAt || null, reason: null };
}

/* =====================================================================
   STUFE 2 — GELEGENHEITEN
   ===================================================================== */

/**
 * Plattformpassung — eine MESSUNG, keine Schaetzung.
 *
 * Sie fragt den Adapter, was er kann, und das Signal, was es braucht.
 * Ein Beitrag, der ein Diagramm tragen soll, braucht publishImage; ein
 * Provider ohne diese Faehigkeit ist keine Plattform fuer diesen Beitrag.
 *
 * Ohne registrierten Provider gibt es KEINE Zahl — dann ist die Passung
 * unbekannt und nicht "mittel".
 */
function measurePlatformFit(registry, providerId) {
  if (!providerId || !registry.has(providerId)) return null;
  const caps = registry.get(providerId).capabilities;
  /* Die Faehigkeiten, die ein VU-Beitrag im Kern braucht. */
  const needed = ["publishImage", "publishCarousel", "altText"];
  const scores = needed.map((cap) => {
    if (Capabilities.supports(caps, "publish", cap)) return 1;
    if (Capabilities.usable(caps, "publish", cap)) return 0.6;
    if (Capabilities.unknown(caps, "publish", cap)) return null;
    return 0;
  });
  const known = scores.filter((s) => s !== null);
  if (known.length === 0) return null;
  /* Analytics zaehlt mit: eine Plattform, deren Wirkung wir nicht messen
     koennen, passt schlechter zu einem lernenden System. */
  const analytics = Capabilities.supports(caps, "analytics", "postInsights") ? 1
                  : (Capabilities.usable(caps, "analytics", "postInsights") ? 0.6 : 0);
  const publishFit = known.reduce((a, b) => a + b, 0) / known.length;
  return Math.round((0.7 * publishFit + 0.3 * analytics) * 100) / 100;
}

/**
 * Markenpassung auf Themenebene — ebenfalls eine Messung.
 *
 * Sie prueft das THEMA gegen das Markenregister, bevor ein Text
 * existiert. Ein Thema, das sich nur im Casino-Register erzaehlen laesst,
 * soll gar nicht erst in die Content-Pipeline.
 */
/* Delegiert an brand.js. Hier stand die Rechnung selbst - und war fuer
   die Gelegenheitsbewertung unerreichbar, weil ein Import dieses
   Skripts den ganzen Lauf ausfuehrt. Zwei Rechenwege fuer dieselbe
   Frage waeren zwei Wahrheiten. */
function measureBrandFit(topic, entities) {
  return Brand.topicFit(topic, entities);
}

/**
 * Was aus gemessener Leistung ueber Formate bekannt ist.
 *
 * -------------------------------------------------------------------------
 * WARUM NUR GEMESSENE EINTRAEGE ZAEHLEN
 * -------------------------------------------------------------------------
 *
 * Ein Beitrag ohne Leistungsdaten ist fuer diese Frage kein Datenpunkt,
 * sondern eine Leerstelle. Wer ihn mitzaehlt, verwaessert den Mittelwert
 * mit einer Null, die nie gemessen wurde — und erzeugt damit genau die
 * Sorte Zahl, die spaeter als Beleg zitiert wird.
 *
 * Die Stichprobengroesse reist deshalb mit: die Strategie-Engine
 * entscheidet selbst, ab wann sie eine Zahl fuer belastbar haelt
 * (`minimumSampleForExploit`). Diese Funktion urteilt nicht, sie zaehlt.
 */
function buildArchetypeKnowledge(memory) {
  const nach = Object.create(null);

  for (const e of memory.all()) {
    if (!e.archetype) continue;
    const p = e.performance;
    /* `null` heisst ungemessen. Nur eine Zahl ist eine Zahl. */
    if (p === null || p === undefined || !Number.isFinite(Number(p))) continue;
    (nach[e.archetype] = nach[e.archetype] || []).push(Number(p));
  }

  const wissen = Object.create(null);
  for (const [archetype, werte] of Object.entries(nach)) {
    wissen[archetype] = {
      mean: werte.reduce((a, b) => a + b, 0) / werte.length,
      sampleSize: werte.length
    };
  }
  return wissen;
}

/**
 * Das gemessene Zeitfenster.
 *
 * -------------------------------------------------------------------------
 * DER LETZTE DURCHTRENNTE DRAHT
 * -------------------------------------------------------------------------
 *
 * `Strategy.selectTiming` kann gemessene Stunden verarbeiten, seit es die
 * Funktion gibt. Uebergeben wurde ihr `null`. Damit war der Rueckweg auf
 * dieser Dimension nicht etwa zu duenn belegt — er war gar nicht
 * angeschlossen, und kein Messwert haette daran je etwas geaendert.
 *
 * Die Stunde ist die EINZIGE Eigenschaft fremder Bestandsbeitraege, die
 * ohne jede Uebersetzung sowohl gemessen als auch entschieden wird:
 * Instagram meldet den Zeitstempel, und die Strategie waehlt eine
 * Stunde. Kein Vokabular dazwischen, also auch keine Annahme dazwischen.
 *
 * Diese Funktion zaehlt und mittelt. Ob eine Stunde belastbar ist,
 * entscheidet `selectTiming` anhand von `minimumSampleForExploit` — hier
 * wird nichts gefiltert und nichts beschoenigt.
 */
function buildTimingKnowledge(memory) {
  const nach = Object.create(null);

  for (const e of memory.all()) {
    if (!e.publishedAt) continue;
    const p = e.performance;
    if (p === null || p === undefined || !Number.isFinite(Number(p))) continue;
    const stunde = new Date(e.publishedAt).getUTCHours();
    if (!Number.isFinite(stunde)) continue;
    (nach[stunde] = nach[stunde] || []).push(Number(p));
  }

  const stuendlich = Object.create(null);
  for (const [stunde, werte] of Object.entries(nach)) {
    stuendlich[stunde] = {
      mean: werte.reduce((a, b) => a + b, 0) / werte.length,
      sampleSize: werte.length
    };
  }
  return Object.keys(stuendlich).length ? { hourly: stuendlich } : null;
}

/* =====================================================================
   DIE AUTOREN

   Reihenfolge ist Absicht: der Creative Agent zuerst, dann das Modell,
   dann die Vorlage als Rueckfall. Wer nichts liefert, wird
   uebersprungen — ein abwesender Autor ist kein Fehler, sondern der
   Normalfall bei einem asynchronen Provider.

   -------------------------------------------------------------------
   DER TRANSPORT DES CREATIVE AGENTS

   Der Agent schreibt sein Ergebnis auf einen eigenen Request-Branch.
   Dieser Zyklus liest NICHT ueber das Netz: er liest Dateien im
   Arbeitsverzeichnis. Dazwischen steht scripts/social/ingest-creative.mjs
   — das holt das Ergebnis, prueft Kennungen und Asset und legt es
   erst dann hier ab.

   Die Trennung ist keine Umstaendlichkeit. Ein Zyklus, der waehrend
   der Inhaltserzeugung ins Netz greift, ist nicht mehr
   reproduzierbar, und ein ungeprueftes Ergebnis waere schon im
   Kandidaten, bevor irgendein Tor es gesehen haette.
   ===================================================================== */
const CREATIVE_TRANSPORT = {
  readResult: function (contentId) {
    const pfad = join(ROOT, "authoring/requests", String(contentId), "authoring-result.json");
    if (!existsSync(pfad)) return null;
    return JSON.parse(readFileSync(pfad, "utf8"));
  },
  readAsset: function (relPfad) {
    const pfad = join(ROOT, String(relPfad));
    if (!existsSync(pfad)) return null;
    return readFileSync(pfad);
  },
  /* Roh, nicht geparst: der Blob-SHA haengt an den Bytes. Wer das
     Objekt neu serialisiert, bekommt einen anderen Hash und damit
     andere Varianten-Kennungen als die, die der Agent vorgerechnet
     bekommen hat. */
  /* Die redaktionelle Korrektur liegt NEBEN dem Ergebnis, nicht darin.
     Das Ergebnis des Agenten bleibt damit das, was er geliefert hat. */
  readCorrection: function (contentId) {
    const pfad = join(ROOT, "authoring/requests", String(contentId),
      "vu-editorial-correction.json");
    if (!existsSync(pfad)) return null;
    return JSON.parse(readFileSync(pfad, "utf8"));
  },
  readBriefRaw: function (contentId) {
    const pfad = join(ROOT, "authoring/requests", String(contentId), "authoring-brief.json");
    if (!existsSync(pfad)) return null;
    return readFileSync(pfad);
  }
};

/* -------------------------------------------------------------------
   WAS DER EXTERNE ANBIETER GERADE TUT — SOWEIT SICHTBAR

   PR 101 meldete sechsmal STARTED und lieferte nie. Der Zyklus lief
   weiter, weil der Autor `pending` meldet und die Vorlage einspringt —
   aber im Bericht stand davon nichts. Ein Anbieter, der seit Stunden
   schweigt, sah genauso aus wie einer, der gerade erst angefangen hat.

   Der Zustand wird deshalb aus dem Ledger bestimmt und genannt. Er
   aendert am Lauf nichts: STALE_NO_RESULT blockiert ausdruecklich
   nicht. Er macht nur sichtbar, woran man sonst vorbeiliest.
   ------------------------------------------------------------------- */
/**
 * Die juengste Fassung eines Content Objects.
 *
 * Fassungen heissen <content_id>-rev1, -rev2, ... Eine hoehere Nummer
 * ist juenger; gezaehlt wird numerisch und nicht als Text, sonst laege
 * rev10 vor rev2.
 *
 * Genommen wird nur eine Fassung mit ERGEBNIS. Eine ausgeloeste, aber
 * noch nicht gelieferte Revision darf die Vorfassung nicht verdraengen -
 * sonst faellt der Inhalt waehrend eines laufenden Auftrags auf den
 * Vorlagen-Autor zurueck und das Ergebnis der Vorfassung waere
 * unerreichbar.
 */
export function juengsteFassung(basis, wurzel) {
  if (!basis) return basis;
  const ordner = join(wurzel || ROOT, "authoring/requests");
  if (!existsSync(ordner)) return basis;

  let beste = basis, besteNr = 0;
  for (const name of readdirSync(ordner)) {
    const t = new RegExp("^" + basis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "-rev(\\d+)$").exec(name);
    if (!t) continue;
    if (!existsSync(join(ordner, name, "authoring-result.json"))) continue;
    const nr = parseInt(t[1], 10);
    if (nr > besteNr) { besteNr = nr; beste = name; }
  }
  return beste;
}

function creativeZustand(contentId, nowIso) {
  if (!contentId) return null;

  const briefPfad = join(ROOT, "authoring/requests", String(contentId),
    "authoring-brief.json");
  if (!existsSync(briefPfad)) return null;

  let schluessel = null;
  let brief = null;
  try {
    const roh = readFileSync(briefPfad);
    brief = JSON.parse(String(roh));
    schluessel = AutorChatGptWork.processingKey(brief.brief_id, contentId,
      AutorChatGptWork.blobSha(roh), brief.schema_version || "1.0");
  } catch (err) { return null; }

  const ledgerRoh = readJson("social/data/creative-invocations.json", { entries: [] });
  const alle = (ledgerRoh.entries || []).filter((e) =>
    e.processingKey === schluessel && e.observed === true);

  const zeiten = alle.map((e) => e.at).filter(Boolean).sort();
  const ergebnisPfad = join(ROOT, "authoring/requests", String(contentId),
    "authoring-result.json");

  /* -------------------------------------------------------------------
     "WARTET" UEBER ETWAS, DAS FERTIG IST

     Hier stand nur `resultPresent`. Der Zustand blieb damit bei
     RESULT_AVAILABLE stehen - der Bericht meldete "wartet", waehrend
     der Autor dasselbe Ergebnis im selben Lauf bereits geprueft,
     angenommen und verarbeitet hatte.

     `classify` kennt `verified` und `resultInvalid` laengst; gefuellt
     hat sie niemand. Ein Zustandsraum, der den Fall ausdruecken kann
     und nicht gefragt wird, ist so gut wie keiner.

     Geprueft wird mit DENSELBEN Funktionen, die auch der Autor
     benutzt. Eine zweite, eigene Pruefung koennte zu einem anderen
     Schluss kommen als die, die tatsaechlich entscheidet - und dann
     wuesste der Bericht etwas, das nicht stimmt.
     ------------------------------------------------------------------- */
  let geprueft = null;
  if (existsSync(ergebnisPfad)) {
    try {
      const ergebnis = JSON.parse(readFileSync(ergebnisPfad, "utf8"));
      const vertrag = CreativeContract.validateResult(ergebnis, brief);
      if (!vertrag.ok) {
        geprueft = { ok: false, reason: vertrag.explanation };
      } else if (vertrag.requestType === CreativeContract.TEXT_REVISION) {
        /* Bei einer Revision ist das fehlende Bild die Erfuellung. Das
           geerbte wurde beim Ingest gegen seine Identitaet geprueft. */
        geprueft = { ok: true, reason: null };
      } else {
        const assets = AutorChatGptWork.verifyAssets(ergebnis, (pfad) => {
          const voll = join(ROOT, String(pfad));
          return existsSync(voll) ? readFileSync(voll) : null;
        });
        geprueft = { ok: assets.ok, reason: assets.ok ? null : assets.explanation };
      }
    } catch (err) {
      /* WESSEN FEHLER IST DAS?

         Hier stand `ok: false` - und damit meldete der Bericht
         RESULT_INVALID, ein Urteil UEBER DAS ERGEBNIS DES AGENTEN. Der
         erste Lauf tat genau das, weil eine Abhaengigkeit fehlte:
         meine eigene kaputte Zeile erschien als "der Agent hat
         schlecht geliefert".

         Ein defektes JSON ist ein Befund ueber das Ergebnis. Ein
         ReferenceError ist einer ueber uns. Wer beides in denselben
         Zustand wirft, bekommt eine falsche Erklaerung - und sucht
         beim naechsten Mal an der falschen Stelle. */
      const ueberUns = err instanceof ReferenceError ||
        err instanceof TypeError;
      if (ueberUns) throw err;
      geprueft = { ok: false, reason: "Ergebnis nicht lesbar: " + err.message };
    }
  }

  const z = Lifecycle.classify({
    startedCount: alle.filter((e) => e.state === "IN_FLIGHT").length,
    firstActivityAt: zeiten.length ? zeiten[0] : null,
    lastActivityAt: zeiten.length ? zeiten[zeiten.length - 1] : null,
    resultPresent: existsSync(ergebnisPfad),
    verified: geprueft ? geprueft.ok === true : undefined,
    resultInvalid: geprueft ? geprueft.ok === false : undefined,
    reason: geprueft ? geprueft.reason : undefined
  }, { now: nowIso });

  return Object.assign({ contentId, processingKey: schluessel,
    deliveryIds: Array.from(new Set(alle.map((e) => e.deliveryId).filter(Boolean))) }, z);
}

const autorenRegistry = Authoring.createRegistry();
autorenRegistry.register(AutorChatGptWork.createChatGptWorkAuthor({
  transport: CREATIVE_TRANSPORT,
  variants: 4
}));
autorenRegistry.register(AutorModell.createModelAuthor({
  /* Kein Client. Das Anbinden kostet laufend Geld und ist eine
     Owner-Entscheidung, keine Implementierungsfrage. */
  client: null,
  modelId: null
}));
autorenRegistry.register(AutorVorlage.createTemplateAuthor({}));
const AUTOR_REIHENFOLGE = ["chatgpt-work", "model", "template"];

/**
 * Ein Schreiber, der die bereits gewaehlte Variante durchreicht.
 *
 * `content.js` ruft einen Schreiber fuer These, Hook und Entwurf. Die
 * Autorenschicht hat diese Entscheidung schon getroffen; dieser Schimmer
 * gibt sie weiter, damit die Tore in `content.js` dieselbe Fassung
 * sehen, die gewonnen hat — und nicht eine neu erzeugte.
 */
function schreiberAus(variante) {
  return {
    thesis: function (opportunity, researchData) {
      var f = researchData.facts[0];
      if (!f) return null;
      return (f.entity ? f.entity + ": " : "") + f.metric + " steht bei " +
             String(f.value) + (f.unit ? " " + f.unit : "") +
             ". Das ist eine Lagebeschreibung, keine Prognose.";
    },
    hook: function () { return variante.hook; },
    structure: function () {
      return { beats: [
        { id: "observation", note: "Was gemessen wurde" },
        { id: "limit", note: "Was die Zahl nicht sagt" },
        { id: "relevance", note: "Warum wir sie zeigen" }
      ] };
    },
    visualLine: function () { return variante.visualLine; },
    draft: function () {
      return {
        caption: variante.caption,
        cta: variante.cta,
        hashtags: variante.hashtags,
        claims: variante.claims
      };
    }
  };
}

/**
 * Was ueber Textmuster bekannt ist.
 *
 * Dieselbe Bauart wie `buildArchetypeKnowledge`: zaehlen und mitteln,
 * nicht urteilen. Ob eine Zahl belastbar ist, entscheidet die
 * Mindeststichprobe in der Auswahl.
 */
function buildPatternKnowledge(memory, nowIso) {
  const nach = Object.create(null);
  const nutzung = Object.create(null);
  const grenze = Date.parse(nowIso) - 30 * 86400000;

  for (const e of memory.all()) {
    const muster = e.authoringPattern || (e.lineage && e.lineage.authoringPattern) || null;
    if (!muster) continue;

    if (e.publishedAt && Date.parse(e.publishedAt) >= grenze) {
      nutzung[muster] = (nutzung[muster] || 0) + 1;
    }
    const p = e.performance;
    if (p === null || p === undefined || !Number.isFinite(Number(p))) continue;
    (nach[muster] = nach[muster] || []).push(Number(p));
  }

  const knowledge = Object.create(null);
  for (const [muster, werte] of Object.entries(nach)) {
    knowledge[muster] = {
      mean: werte.reduce((a, b) => a + b, 0) / werte.length,
      sampleSize: werte.length
    };
  }

  /* Was davon in den Brief gehoert: die Muster, die sich als wirksam
     gezeigt haben — als Hinweis, nicht als Vorschrift. Ein Autor, der
     bloss kopiert, lernt nichts. */
  const bewaehrt = Object.entries(knowledge)
    .filter(([, k]) => k.sampleSize >= 5)
    .sort((a, b) => b[1].mean - a[1].mean)
    .slice(0, 3)
    .map(([m]) => m);

  return {
    knowledge, usage: nutzung,
    brief: {
      hookPatterns: bewaehrt,
      note: bewaehrt.length
        ? "Diese Muster haben gemessen getragen. Sie sind ein Hinweis, keine Vorschrift."
        : "Noch keine gemessene Praeferenz. Erkundung ist hier die richtige Wahl."
    }
  };
}

/**
 * Das Evidenzpaket zu einer Gelegenheit.
 *
 * Es liest das technische Bundle der Quant-Schicht und rechnet NICHTS
 * nach. Wo dort UNAVAILABLE steht, steht hier UNAVAILABLE.
 */
function ladeEvidenzPaket(sources, nowIso) {
  const mitEntitaet = (sources || []).find((s) => s && s.entity);
  if (!mitEntitaet) {
    return { ok: false, message: "Keine Entitaet in der Herkunft — kein Bundle ladbar." };
  }

  const pfad = join(ROOT, "quant/data/technical/instruments",
    String(mitEntitaet.entity).toUpperCase() + ".json");
  if (!existsSync(pfad)) {
    return { ok: false, message: "Kein technisches Bundle fuer " + mitEntitaet.entity + "." };
  }

  let roh;
  try { roh = JSON.parse(readFileSync(pfad, "utf8")); }
  catch (err) { return { ok: false, message: "Bundle unlesbar: " + err.message }; }

  return EvidencePackage.fromTechnicalBundle(roh.bundle, {
    entity: mitEntitaet.entity,
    source: mitEntitaet.source || (roh.bundle && roh.bundle.source) || null,
    sourceRevision: roh.sourceRevision || null,
    now: nowIso
  });
}

function buildOpportunities(signals, internal, memory, registry, providerId) {
  const clusters = Signals.cluster(signals);
  const out = [];

  for (const cluster of clusters) {
    const primary = signals.find((s) => cluster.signalIds.includes(s.signalId));
    const meta = internal[primary.signalId] || {};

    /* Der externe Trend Score. Er darf fehlen — dann traegt die
       Gelegenheit das interne Signal allein (Opportunity: requiresAnyOf). */
    const externalSignal = signals.find(
      (s) => cluster.signalIds.includes(s.signalId) && s.signalClass === "SOCIAL");
    const trend = externalSignal
      ? TrendScore.score(externalSignal, {
          marketRelevance: null, vuRelevance: null, audienceFit: null, brandRisk: null,
          daysSinceOwnCoverage: memory.daysSinceTopic(cluster.topic, NOW),
          ownPostsOnTopic: memory.countTopic(cluster.topic, 14, NOW)
        }, { now: NOW })
      : { available: false, score: null,
          explanation: "Kein externes Social-Signal zu diesem Thema — die Quelle ist nicht angebunden." };

    const comparable = memory.comparablePerformance({ archetype: null, platform: "instagram" });
    const daysSince = memory.daysSinceTopic(cluster.topic, NOW);

    const score = Opportunity.score({
      trendScore: trend.score,
      vuSignalStrength: meta.strength,
      /* Publikumsinteresse braucht Publikumssignale. Die Quelle ist nicht
         angebunden — also null und nicht 0.5 (§45). */
      audienceInterest: null,
      historicalPerformance: comparable.mean === null ? null : comparable.mean / 100,
      historicalSampleSize: comparable.sampleSize,
      platformFit: measurePlatformFit(registry, providerId),
      hoursSinceTrigger: primary.observedAt
        ? (Date.parse(NOW) - Date.parse(primary.observedAt)) / 3600000 : null,
      contentGap: daysSince === null ? 1 : Math.min(1, daysSince / 30),
      brandFit: measureBrandFit(cluster.topic, cluster.entities)
    }, {
      /* Hinter einem 52-Wochen-Hoch steht kein Magazinstueck und kein
         Report. `editorialBasis` ist hier nicht UNGEMESSEN, sondern
         NICHT ANWENDBAR - und als Luecke gezaehlt wuerde es die
         Abdeckung druecken und Signalgelegenheiten schlechter stellen,
         ohne dass sich an ihnen etwas geaendert haette. */
      notApplicable: ["editorialBasis"],
      /* `externalInterest` ist hier NICHT unanwendbar - ob ausserhalb
         ueber dieses Thema gesprochen wird, ist eine sinnvolle Frage
         auch fuer ein Kurssignal. Sie ist unbeantwortbar, solange keine
         externe Quelle angebunden ist. Als Luecke des THEMAS gezaehlt
         haette die neue Dimension jede bestehende Gelegenheit unter die
         Mindestabdeckung gedrueckt - ohne dass sich an einer von ihnen
         etwas geaendert haette. */
      systemicallyUnavailable: ["externalInterest"]
    });

    out.push({
      opportunity: Schema.contentOpportunity({
        opportunityId: "opp_" + cluster.key.toLowerCase().replace(/[^a-z0-9]/g, "") + "_" +
                        String(NOW).slice(0, 10),
        createdAt: NOW,
        topic: cluster.topic,
        entities: cluster.entities,
        signalIds: cluster.signalIds,
        score: score.score,
        components: {},
        timeSensitivity: meta.timeSensitivity || "TIMELY",
        provenance: cluster.provenance,
        explanation: score.explanation
      }),
      score,
      trend,
      internal: meta,
      cluster
    });
  }
  return out;
}

/* =====================================================================
   DER LAUF
   ===================================================================== */

async function main() {
  log("VISION UNIVERSE SOCIAL — Zyklus");
  log("Zeitpunkt:", NOW);
  log("Provider: ", PROVIDER_ID || "(keiner — Trockenlauf)");
  log("");

  const componentStates = {};
  const registry = buildRegistry();

  /* ---------------------------------------------------- 0. Zustand */
  const providerHealth = await registry.healthAll();
  for (const health of providerHealth) {
    const state = health.status === "ok" ? "PASS"
                : health.status === "degraded" ? "WARNING"
                : health.status === "not_configured" ? "UNAVAILABLE" : "FAIL";
    for (const component of ["providers.auth", "providers.publishing",
                             "providers.analytics", "providers.audience"]) {
      componentStates[component] = {
        state, dataSource: health.provider, lastSuccessAt: health.lastSuccessAt,
        failureMode: state === "PASS" ? null : health.message,
        nextAction: health.missing && health.missing.length
          ? "Fehlende Secrets hinterlegen: " + health.missing.join(", ")
          : null
      };
    }
    log("Provider " + health.provider + ": " + health.status +
        (health.missing && health.missing.length ? "  (fehlt: " + health.missing.join(", ") + ")" : ""));
  }
  componentStates.killSwitch = { lastSuccessAt: NOW, dataSource: "social/config/kill-switch.json" };

  /* ---------------------------------------------------- 1. Signale */
  const signalData = loadSignals();
  if (signalData.reason) {
    log("\nSignale: KEINE — " + signalData.reason);
    componentStates["signals.internal"] = { lastSuccessAt: null, failureMode: signalData.reason };
  } else {
    log("\nSignale: " + signalData.signals.length +
        (signalData.rejected.length ? "  (" + signalData.rejected.length + " abgewiesen)" : ""));
    for (const r of signalData.rejected || []) detail("abgewiesen:", r.event, "—", r.reason);
    componentStates["signals.internal"] = {
      lastSuccessAt: signalData.signals.length ? (signalData.generatedAt || NOW) : null,
      dataSource: "social/data/signals.json",
      failureMode: signalData.signals.length ? null : "Die Datei enthaelt keine verwertbaren Ereignisse."
    };
  }
  /* Nicht angebundene Quellen melden sich selbst (§45). */
  for (const id of Object.keys(Signals.PLANNED_SOURCES)) {
    if (!componentStates[id]) {
      const status = Signals.plannedSourceStatus(id);
      componentStates[id] = { state: "UNAVAILABLE", failureMode: status.failureMode,
                              nextAction: status.nextAction };
    }
  }

  /* -------------------------------------------- 2. Gedaechtnis laden */
  const memoryFile = D("content-memory.json");
  const memory = Memory.createMemory(
    existsSync(memoryFile) ? JSON.parse(readFileSync(memoryFile, "utf8")).entries || [] : []);
  log("Gedaechtnis: " + memory.size() + " frueherer Beitrag/Beitraege");

  /* ------------------------------ 2b. Strategie-Gedaechtnis laden

     Bis hierher begann jeder Lauf bei den Startwerten. Was der
     vorherige Lauf gelernt hatte, war weg. Ab jetzt kommt es von der
     Platte — das ist die Stelle, an der aus der Schleife ein Kreis
     wird. */
  const strategyFile = D("strategy-memory.json");
  const strategyMemory = StrategyMemory.createStrategyMemory(
    existsSync(strategyFile) ? JSON.parse(readFileSync(strategyFile, "utf8")) : null,
    { now: NOW });
  const activeStrategy = strategyMemory.current();
  log("Strategie:   " + activeStrategy.versionId + " (Kette: " + strategyMemory.size() +
      ", Beobachtungen: " + strategyMemory.observations().length + ")");

  /* Was aus gemessener Leistung ueber Formate bekannt ist. Bis eben
     stand hier eine leere Menge — und damit konnte keine Messung je
     eine Entscheidung erreichen. */
  const archetypeKnowledge = buildArchetypeKnowledge(memory);
  const timingKnowledge = buildTimingKnowledge(memory);
  const musterWissen = buildPatternKnowledge(memory, NOW);
  const gemessen = Object.keys(archetypeKnowledge).length;
  log("Formatwissen: " + (gemessen
    ? gemessen + " Format(e) mit gemessener Leistung"
    : "keines — noch kein Beitrag mit Leistungsdaten"));

  const stunden = timingKnowledge ? Object.entries(timingKnowledge.hourly) : [];
  if (stunden.length) {
    const groesste = stunden.reduce((a, b) => (b[1].sampleSize > a[1].sampleSize ? b : a));
    log("Zeitwissen:   " + stunden.length + " Stunde(n) mit gemessener Leistung, " +
        "groesste Stichprobe n=" + groesste[1].sampleSize + " um " + groesste[0] + ":00 UTC");
  } else {
    log("Zeitwissen:   keines — kein Beitrag mit Zeitstempel und Leistung");
  }

  /* ------------------------------------------------ 3. Gelegenheiten */
  const creativeZustaende = [];
  const candidates = buildOpportunities(signalData.signals, signalData.internal, memory,
                                        registry, PROVIDER_ID || "mock");
  const proposable = candidates.filter((c) => c.score.proposable);
  log("\nGelegenheiten: " + candidates.length + " geprueft, " + proposable.length + " vorschlagsfaehig");
  for (const c of candidates) detail(c.opportunity.topic, "—", c.score.explanation);

  componentStates["intelligence.trend"] = {
    state: candidates.some((c) => c.trend.available) ? "PASS" : "UNAVAILABLE",
    failureMode: candidates.some((c) => c.trend.available) ? null
      : "Keine externe Trendquelle angebunden; der Trend Score enthaelt sich (§45).",
    lastSuccessAt: candidates.some((c) => c.trend.available) ? NOW : null
  };
  componentStates["intelligence.opportunity"] = {
    lastSuccessAt: candidates.length ? NOW : null,
    failureMode: candidates.length ? null : "Keine Signale, also keine Gelegenheiten."
  };

  /* --------------------------------------- 4. Strategie und Content */
  const packages = [];
  const rejections = [];
  /* Die Datenlage je Thema - fuer den Zeichenschritt weiter unten. */
  const bildDatenlage = {};

  /* -------------------------------------------------------------------
     DIE VERGLEICHSGRUPPE DES LAUFS

     Ein Vergleich braucht etwas zu vergleichen, und im Lauf stehen die
     anderen Gelegenheiten ohnehin nebeneinander. Sie sind die ehrliche
     Gruppe: dieselbe Messung, derselbe Stichtag, dieselbe Methode.
     Eine von woanders zusammengesuchte Gruppe waere ein Vergleich
     ueber Aepfel und Birnen mit einer Achse.
     ------------------------------------------------------------------- */
  const vergleichsgruppe = proposable.map((x) => ({
    label: VisualDaten.symbolAus(x.opportunity.topic) || x.opportunity.topic,
    value: Math.round(x.score && x.score.score || 0)
  })).filter((x) => x.label && x.value > 0);

  for (const candidate of Opportunity.prioritize(
      proposable.map((c) => Object.assign({}, c.score, { topic: c.opportunity.topic, ref: c })),
      { limit: 5, maxPerTopic: 1 })) {
    const c = candidate.ref;
    const opportunity = c.opportunity;

    const strategyDecision = Strategy.decide({
      opportunityId: opportunity.opportunityId,
      timeSensitivity: opportunity.timeSensitivity,
      hasNumbers: c.internal.hasNumbers === true,
      /* Bringt das Ereignis einen Anlass mit, oder nur einen Zustand?
         Ein technischer Score beschreibt eine Lage, und die Lage ist
         nicht ihr eigener Grund. */
      hasCause: c.internal.hasCause === true,
      /* Wovon der Anlass handelt. Ohne diese Angabe waere ein Kurs-Score
         als FUTURE_TECHNOLOGY zulaessig. */
      premise: c.internal.premise || null,
      platform: "instagram"
    }, {
      /* DER RUECKKANAL. Hier stand eine leere Menge — deshalb konnte
         keine Messung je eine Entscheidung erreichen, egal wie viel
         gemessen wurde. */
      archetypeKnowledge,
      recentArchetypeUsage: memory.distribution("archetype", 30, NOW),
      timingKnowledge
    }, {
      currentHour: new Date(NOW).getUTCHours(),
      /* Und hier die gelernten Parameter. Ohne sie waere die
         Versionskette ein Archiv ohne Wirkung. */
      parameters: activeStrategy.parameters || {}
    });

    if (!strategyDecision.decidable) {
      rejections.push({ topic: opportunity.topic, stage: "STRATEGY", reason: strategyDecision.explanation });
      continue;
    }

    const sources = opportunity.provenance.map((p) => ({
      source: p.source, provider: p.provider, entity: p.entity, metric: p.metric,
      value: p.value, unit: p.unit, state: p.state, observedAt: p.observedAt
    }));

    /* ================================================================
       DAS EVIDENZPAKET

       Die Herkunft eines Signals nennt eine Zahl. Das technische Bundle
       dahinter nennt zwei Dutzend — Band, Beitraege je Familie,
       Trendbelege, Momentum ueber vier Horizonte, Volatilitaetsregime,
       Datengrundlage und den Satz, dass der Score keine
       Wahrscheinlichkeit ist.

       Der erste Kandidat sagte "76", weil nur "76" mitgenommen wurde.
       ================================================================ */
    const evidenzPaket = ladeEvidenzPaket(sources, NOW);
    const evidenzSaetze = evidenzPaket && evidenzPaket.ok
      ? evidenzPaket.evidence.map((e) => ({
          source: e.source, provider: null, entity: e.entity, metric: e.metric,
          value: e.value, unit: e.unit, state: e.state, observedAt: e.observedAt,
          statement: e.statement, pointer: e.pointer, dimension: e.dimension }))
      : sources;

    /* Ein hoher Score ist nicht automatisch veroeffentlichungswuerdig. */
    const hinreichend = evidenzPaket && evidenzPaket.ok
      ? EvidencePackage.assessSufficiency(evidenzPaket)
      : { sufficient: false, explanation:
          "Kein Evidenzpaket: " + ((evidenzPaket && evidenzPaket.message) ||
            "kein technisches Bundle zum Titel gefunden."), reasons: [] };

    if (!hinreichend.sufficient) {
      rejections.push({ topic: opportunity.topic, stage: "EVIDENCE_SUFFICIENCY",
        reason: hinreichend.explanation });
      continue;
    }

    /* ================================================================
       DIE AUTORENSCHICHT

       Sie ersetzt in `content.js` genau eine Stufe: die, in der Text
       entsteht. Alles davor (Recherche, Belege) und alles danach
       (Faktenpruefung, Marke, Muedigkeit) bleibt, wie es war — eine
       zweite Content-Pipeline waere zwei Wahrheiten ueber denselben
       Beitrag.

       Der Autor bekommt den Brief und liefert Varianten; die Auswahl
       trifft die Bewertung. Was gewinnt, reicht `content.js` als
       Schreiber durch, damit dessen Tore es noch einmal sehen. Zweimal
       geprueft ist hier kein Aufwand, sondern die Reihenfolge: die
       Autorenschicht prueft die VARIANTE, content.js das PAKET.
       ================================================================ */
    const brief = ContentBrief.build({
      opportunity: {
        opportunityId: opportunity.opportunityId,
        topic: opportunity.topic,
        premise: c.internal.premise || null,
        hasCause: c.internal.hasCause === true,
        timeSensitivity: opportunity.timeSensitivity
      },
      strategyDecision: {
        archetype: strategyDecision.archetype,
        mode: strategyDecision.mode,
        strategyVersion: activeStrategy.versionId
      },
      visual: { visualType: null },
      /* Die Klarnamen reisen mit dem Brief: der Autor soll "Exxon
         Mobil" schreiben koennen, ohne selbst eine Tickerliste zu
         fuehren. Fehlt ein Name, bleibt das Kuerzel stehen - erfunden
         wird keiner. */
      entityNames: FIRMENNAMEN,
      evidence: evidenzSaetze,
      learned: musterWissen.brief,
      platform: "instagram",
      now: NOW
    });

    /* Die Kennung, unter der ein Creative Result zu diesem Inhalt
       laege. Sie wird hier genauso gerechnet wie beim Stellen der
       Anfrage — aus derselben Funktion, damit die beiden Seiten nicht
       driften koennen. */
    const basisContentId = (evidenzPaket && evidenzPaket.ok)
      ? EvidencePackage.contentIdFor(evidenzPaket.entity, evidenzPaket.asOf)
      : null;

    /* -----------------------------------------------------------------
       DIE JUENGSTE FASSUNG GEWINNT

       Eine redaktionelle Ueberarbeitung bekommt eine eigene Kennung
       (<content_id>-rev1), damit sie den Brief der Vorfassung nicht
       ueberschreibt - sonst waere die Kennung weg, unter der das
       verifizierte Bild wiedergefunden wird.

       Der Preis dafuer ist, dass der Zyklus sie nicht mehr ueber die
       gerechnete Kennung findet. Er sieht deshalb nach, ob zu diesem
       Inhalt eine juengere Fassung vorliegt, und nimmt die. Keine
       Ratephase: es gibt sie oder nicht.
       ----------------------------------------------------------------- */
    const creativeContentId = juengsteFassung(basisContentId);

    const creativeLage = creativeZustand(creativeContentId, NOW);
    if (creativeLage) creativeZustaende.push(creativeLage);

    const geschrieben = Authoring.run(autorenRegistry, brief, {
      authors: AUTOR_REIHENFOLGE,
      contentId: creativeContentId,
      mode: strategyDecision.mode,
      patternKnowledge: musterWissen.knowledge,
      patternUsage: musterWissen.usage,
      gates: {
        brand: (v) => Brand.check({ hook: v.hook, caption: v.caption, cta: v.cta,
          hashtags: v.hashtags }),
        /* Die Klarnamen kommen aus der kuratierten Liste des
           Repositories. Ohne sie kann das Tor kein Kuerzel beanstanden
           - und tut es dann auch nicht, statt zu raten. */
        audience: (v) => AudienceFit.check({ hook: v.hook, caption: v.caption,
          names: FIRMENNAMEN })
      }
    });

    if (!geschrieben.selection.chosen) {
      rejections.push({ topic: opportunity.topic, stage: "AUTHORING",
        reason: geschrieben.selection.reason });
      continue;
    }

    const gewaehlteVariante = geschrieben.selection.chosen.variant;

    /* -----------------------------------------------------------------
       EINE EVIDENZ, NICHT ZWEI

       Der Brief entstand aus `evidenzSaetze` - 23 belegte Aussagen aus
       dem kanonischen Evidenzpaket, Quelle `tiingo`. Die Content-Pipeline
       bekam dagegen `sources`: EINEN Eintrag, Quelle `vu.technical`.

       Solange die Caption eine Zahl trug, fiel das nicht auf. Sobald der
       Creative Agent aus allen 23 Belegen schrieb, meldete die
       Faktenpruefung "eine spaetere Stufe hat Zahlen eingefuehrt, die die
       Recherche nicht kennt" - und hatte vollkommen recht. Zwei
       Evidenzmengen im selben Lauf sind genau der Zustand, den §39
       verhindern soll.

       Der Autor und die Faktenpruefung sehen jetzt dieselben Belege.
       Ohne Evidenzpaket bleibt es bei `sources` wie bisher.
       ----------------------------------------------------------------- */
    const rechercheBelege = (evidenzPaket && evidenzPaket.ok) ? evidenzSaetze : sources;

    /* -----------------------------------------------------------------
       DIE DATENLAGE ENTSCHEIDET MIT

       Hier stand `timeSeries: false` — eine feste Zusage, dass es
       keine Kursreihe gibt. Sie stimmte einmal und war seitdem falsch:
       270 Tagespunkte je Instrument liegen im Repository. Weil die
       Zusage fest war, konnte CHART nie gewaehlt werden, und mit ihm
       keine der datengetriebenen Formen.

       Jetzt wird nachgesehen statt behauptet. Was wirklich vorliegt,
       eroeffnet Bildformen, die aus den Daten DIESES Objekts entstehen
       und keinen externen Lauf kosten.
       ----------------------------------------------------------------- */
    const lage = VisualDaten.datenlage({
      topic: opportunity.topic,
      evidence: (evidenzPaket && evidenzPaket.ok) ? (evidenzPaket.evidence || []) : [],
      peers: vergleichsgruppe.map((v) => Object.assign({}, v, {
        highlight: v.label === VisualDaten.symbolAus(opportunity.topic) }))
    }, ROOT);
    bildDatenlage[opportunity.topic] = lage;

    const result = Content.run({
      opportunity, sources: rechercheBelege, strategyDecision,
      visualAvailability: Object.assign({}, lage.availability, {
        keyNumber: lage.availability.keyNumber ||
          rechercheBelege.some((s) => s.value !== null) }),
      recentVisuals: Object.keys(memory.distribution("visualType", 14, NOW)),
      writer: schreiberAus(gewaehlteVariante)
    }, { now: NOW, timeSensitivity: opportunity.timeSensitivity });

    if (!result.ok) {
      rejections.push({ topic: opportunity.topic, stage: result.failedStage, reason: result.explanation });
      continue;
    }

    /* -----------------------------------------------------------------
       DIE BILDFORM FOLGT DEM BILD

       Die Pipeline hat eine Bildform gewaehlt, weil sie eine Karte
       zeichnen wollte. Bringt der Autor ein geprueftes generatives
       Bild mit, wird keine Karte gezeichnet — und dann ist DATA_CARD
       eine Angabe ueber etwas, das niemand je gesehen hat.

       Sie steht in der Provenance, im Gedaechtnis und in der
       Kohortenbildung des Lernens. Dort falsch zu stehen heisst, dass
       spaeter die Leistung generativer Bilder der Kartenform
       zugeschrieben wird.
       ----------------------------------------------------------------- */
    if (geschrieben.production && geschrieben.production.asset) {
      result.package.visualType = "GENERATIVE";
    }

    /* Die Wiederholungssperre laeuft NACH der Pipeline: sie braucht den
       fertigen Text, um Aehnlichkeit zu messen. */
    const fatigue = Fatigue.check({
      topic: result.package.topic, entities: opportunity.entities,
      archetype: result.package.archetype, visualType: result.package.visualType,
      hook: result.package.hook, caption: result.package.caption
    }, memory, { now: NOW });

    if (!fatigue.passed) {
      rejections.push({ topic: opportunity.topic, stage: "FATIGUE", reason: fatigue.explanation });
      continue;
    }
    result.package.validation.fatigueCheck = { passed: true, explanation: fatigue.explanation };

    packages.push({ candidate: c, strategyDecision, result, fatigue,
      evidencePackage: evidenzPaket && evidenzPaket.ok ? {
        packageId: evidenzPaket.packageId,
        entity: evidenzPaket.entity,
        asOf: evidenzPaket.asOf,
        dimensions: evidenzPaket.dimensionsAvailable,
        statements: evidenzPaket.evidence.length,
        unavailable: evidenzPaket.unavailable,
        sufficiency: hinreichend
      } : null,
      /* Welche Variante gewonnen hat und wogegen. Ohne diese Angabe
         laesst sich spaeter nicht lernen, WAS gewirkt hat. */
      /* Was der Autor ausser Text mitgebracht hat: das geprueft
         zurueckgelesene Bildasset, die unverbindliche Empfehlung des
         Agenten, der Verarbeitungsnachweis. Ohne diese Zeile waere das
         Bild im letzten Schritt verschwunden. */
      production: geschrieben.production || null,
      authoring: {
        briefId: brief.briefId,
        authorId: gewaehlteVariante.authorId,
        /* Der Autor hat die Hooks geschrieben. Hat Vision Universe die
           Caption redaktionell ersetzt, steht das HIER und nicht nur in
           einer Datei nebenan - sonst weist der Kandidat einen Text als
           den des Agenten aus, den der Agent nie geschrieben hat. */
        editorialCorrection: gewaehlteVariante.editorialCorrection || null,
        textAuthor: gewaehlteVariante.editorialCorrection
          ? { hook: gewaehlteVariante.authorId,
              caption: gewaehlteVariante.editorialCorrection.by }
          : null,
        pattern: gewaehlteVariante.pattern,
        variantId: gewaehlteVariante.variantId,
        reason: geschrieben.selection.reason,
        /* -------------------------------------------------------------
           WELCHES KRITERIUM HAT TATSAECHLICH ENTSCHIEDEN

           Die Prosa-Begruendung nennt einen Kompositionswert. Ein
           Unterschied von wenigen Punkten darin ist eine Regel zur
           Aufloesung von GLEICHSTAENDEN - keine Leistungsprognose.
           Das laesst sich missverstehen, solange nur der Satz dasteht
           und nicht, welche Tore ueberhaupt unterschieden haben.

           Reale Performance-Learnings gibt es hier nicht: n=0. Was
           spaeter aus Messung dazukommt, gehoert an eine andere
           Stelle und nicht in diese Begruendung. */
        selectionCriteria: {
          brandScoreChosen: (geschrieben.selection.chosen || {}).brandScore ?? null,
          compositionScoreChosen: ((geschrieben.selection.chosen || {}).composition
            || {}).score ?? null,
          alternatives: geschrieben.selection.alternatives || [],
          discriminatedBy: (() => {
            const alt = geschrieben.selection.alternatives || [];
            const ch = geschrieben.selection.chosen || {};
            if (!alt.length) return ["einzige bestandene Variante"];
            const gleiche = alt.filter((a) => a.brandScore === ch.brandScore);
            return gleiche.length === alt.length
              ? ["composition (Gleichstand beim Markenwert)"]
              : ["brand", "composition"];
          })(),
          predictsPerformance: false,
          performanceLearnings: { sampleSize: 0,
            note: "Keine gemessene Leistung vorhanden. Die Auswahl beruht " +
              "ausschliesslich auf Toren, nicht auf Wirkung." }
        },
        considered: geschrieben.variants.length,
        passed: geschrieben.evaluated.filter((e) => e.passed).length,
        rejected: geschrieben.selection.rejected.map((r) => ({
          pattern: r.variant.pattern, reasons: r.reasons })),
        attempts: geschrieben.attempts
      } });
  }

  const autorenLage = autorenRegistry.usable();
  const namensBreite = Math.max(10,
    ...autorenLage.map((a) => String(a.authorId).length)) + 2;
  log("\nAutoren:");
  for (const a of autorenLage) {
    log("  " + a.authorId.padEnd(namensBreite) + (a.ok ? "einsatzbereit" : "nicht verfuegbar"));
    if (!a.ok) detail("   ", a.reason);
  }

  if (creativeZustaende.length) {
    log("\nCreative Provider:");
    for (const z of creativeZustaende) {
      log("  " + z.contentId + ": " + z.state +
        (z.blocking ? "  (wartet)" : "  (blockiert den Zyklus nicht)"));
      if (z.startedCount) {
        log("    " + z.startedCount + "x STARTED, zuletzt vor " +
          Math.round((z.ageSeconds || 0) / 60) + " min; Frist " +
          Math.round(z.lease.seconds / 60) + " min (" + z.lease.regime + ", n=" +
          z.lease.sampleSize + ")");
      }
      if (z.state === "STALE_NO_RESULT") {
        log("    Kein Content-Fehler und kein Leistungsurteil: der Anbieter hat im");
        log("    Beobachtungsfenster nichts Beobachtbares geliefert. Ob sein Lauf noch");
        log("    laeuft, kann diese Schnittstelle nicht sehen.");
      }
    }
  }

  log("\nContent: " + packages.length + " Paket(e) erzeugt, " + rejections.length + " verworfen");
  /* WER geschrieben hat, nicht nur DASS geschrieben wurde. Ohne diese
     Zeile laesst sich von aussen nicht unterscheiden, ob der Creative
     Agent geliefert hat oder ob still die Vorlage eingesprungen ist —
     und genau das ist der Unterschied, auf den es bei einem
     asynchronen Provider ankommt. */
  for (const pk of packages) {
    const a = pk.authoring || {};
    log("   " + (pk.result.package.topic || "?") + ": " +
      (a.authorId || "?") + " / " + (a.pattern || "?") +
      " (" + (a.passed || 0) + " von " + (a.considered || 0) + " Varianten bestanden)");
  }
  for (const r of rejections) log("   verworfen [" + r.stage + "] " + r.topic + ": " + r.reason);

  componentStates["content.pipeline"] = {
    lastSuccessAt: packages.length ? NOW : null,
    failureMode: packages.length ? null
      : (candidates.length ? "Alle Kandidaten sind an einer Pruefstufe gescheitert." : "Keine Kandidaten.")
  };
  componentStates["content.validation"] = {
    lastSuccessAt: packages.length ? NOW : null,
    failureMode: packages.length ? null : "Keine Pakete zu pruefen."
  };
  componentStates.scheduler = { lastSuccessAt: packages.length ? NOW : null,
    failureMode: packages.length ? null : "Nichts zu terminieren." };
  componentStates.queue = { lastSuccessAt: NOW };

  /* ------------------------------------------ 5. Autonomie und Gate */
  const matrix = Health.buildMatrix(componentStates, { now: NOW });
  const readiness = Health.toAutonomyReadiness(matrix, {
    rollbackPresent: true,      /* learning.rollback() ist implementiert und getestet */
    learningValidated: false,
    experimentsValidated: false
  });
  const autonomy = Autonomy.effectiveLevel(autonomyConfig.desiredLevel || 0, readiness);

  log("\nSystemzustand: " + matrix.overall);
  log("Autonomie:     " + autonomy.explanation);

  /* ------------------------------------------ 6. Veroeffentlichung */
  const publicationsFile = D("publications.json");
  const orchestrator = Publishing.createOrchestrator({
    registry, killSwitch, auditLog, now,
    publications: existsSync(publicationsFile)
      ? JSON.parse(readFileSync(publicationsFile, "utf8")).publications || [] : []
  });

  const published = [];
  for (const entry of packages) {
    const pkg = entry.result.package;
    const providerId = PROVIDER_ID || "mock";
    const accountId = providerId === "mock" ? "mock_account_1"
                    : (process.env.META_IG_ACCOUNT_ID ? "meta:" + process.env.META_IG_ACCOUNT_ID : null);

    if (!accountId) {
      log("   " + pkg.topic + ": kein Zielkonto — es wird nichts veroeffentlicht.");
      continue;
    }

    const intent = orchestrator.intend({
      packageId: pkg.packageId, providerId, accountId,
      scheduledFor: null, autonomyLevel: autonomy.effective,
      strategyVersion: entry.strategyDecision.parametersVersion
    });
    if (!intent.created) {
      log("   " + pkg.topic + ": bereits geplant (" + intent.reason + ")");
      continue;
    }
    orchestrator.transition(intent.publication.publicationId, "DRAFT");
    orchestrator.transition(intent.publication.publicationId, "VALIDATED");
    orchestrator.transition(intent.publication.publicationId, "READY");

    const gate = killSwitch.allows(providerId, "publish");
    const mayPublish = gate.allowed && Autonomy.allowsUnattendedPublish(autonomy.effective);

    if (!mayPublish) {
      log("   " + pkg.topic + ": bleibt in READY — " +
          (!gate.allowed ? gate.reason : "Autonomiestufe " + autonomy.effective + " genuegt nicht."));
      auditLog.record({
        decision: "cycle.hold", inputs: [pkg.packageId], provider: providerId, result: "blocked",
        autonomyLevel: autonomy.effective,
        reason: !gate.allowed ? gate.reason : "Autonomiestufe zu niedrig fuer unbeaufsichtigtes Posten."
      });
      continue;
    }

    const media = { type: "IMAGE", url: pkg.assets[0] || "https://example.invalid/platzhalter.jpg",
                    caption: pkg.caption };
    const res = await orchestrator.publish(intent.publication.publicationId, media,
      { producedBy: "run-social-cycle" });
    log("   " + pkg.topic + ": " + (res.ok ? "veroeffentlicht" : "fehlgeschlagen — " + res.message));
    if (res.ok) published.push({ publication: res.publication, package: pkg });
  }

  /* ------------------------------------------------ 7. Erklaerungen */
  log("\n--- WARUM DIESE BEITRAEGE ---");
  for (const entry of packages) {
    const explanation = Explain.whyThisPost({
      package: entry.result.package,
      trend: entry.candidate.trend,
      opportunity: entry.candidate.score,
      strategy: entry.strategyDecision,
      fact: entry.result.package.validation.factCheck,
      brand: entry.result.package.validation.brandCheck,
      fatigue: entry.fatigue,
      visual: entry.result.visual,
      autonomy,
      killSwitch: killSwitch.allows(PROVIDER_ID || "mock", "publish")
    });
    log("\n" + entry.result.package.topic);
    log("  " + explanation.summary);
    for (const section of explanation.sections) log("  " + section.title + ": " + section.text);
  }

  /* ================================================================
     8. MESSEN  —  der Rueckweg beginnt

     Bis hierher lief der Kreislauf vorwaerts und haette das auch
     getan, wenn nie etwas gemessen worden waere. Ab hier kommen
     Zahlen ins Spiel, die tatsaechlich erhoben wurden.
     ================================================================ */
  const perfFile = D("performance.json");
  const perfData = existsSync(perfFile)
    ? JSON.parse(readFileSync(perfFile, "utf8")) : null;

  const alleZeilen = perfData ? (perfData.snapshots || []) : [];

  /* ------------------------------------------------------------------
     REIF ODER NUR GEMESSEN

     Social-Performance entsteht ueber Zeit. Eine Reichweite nach zehn
     Minuten ist keine kleine Reichweite — sie ist noch keine. Die Zahl
     ist richtig; sie beantwortet nur eine andere Frage als die
     gestellte.

     Wer sie trotzdem ins Lernen laesst, vergleicht nicht Formate,
     sondern Messzeitpunkte: jeder frische Beitrag sieht schlechter aus
     als jeder aeltere, und das System schliesst daraus auf Formate,
     Uhrzeiten und Hooks.

     Gelernt wird deshalb NUR auf reifen Messungen. Die unreifen bleiben
     sichtbar — sie sind der Grund, warum die Stichprobe heute kleiner
     ist als die Zahl der Beitraege, und dieser Grund verschwindet nach
     ein paar Tagen von selbst.
     ------------------------------------------------------------------ */
  const gemesseneZeilen = alleZeilen.filter((z) =>
    z.snapshot && z.snapshot.state !== "UNAVAILABLE");
  /* Gerechnet, nicht nachgeschlagen. `ageHours` steht im Snapshot und
     ist das Alter der MESSUNG — nicht des Beitrags. Genau darauf kommt
     es an: ein Beitrag, der heute einen Monat alt ist, dessen einzige
     Messung aber nach vier Stunden genommen wurde, hat keine reife
     Messung. Er braucht eine neue, keine grosszuegigere Auslegung. */
  const reifeZeilen = gemesseneZeilen.filter((z) =>
    MessFenster.isMature(z.snapshot.ageHours, FENSTER_CONFIG));
  const unreif = gemesseneZeilen.length - reifeZeilen.length;

  const snapshots = reifeZeilen.map((z) => z.snapshot);

  /* Welche Zieldimensionen die Datenlage HEUTE traegt — je Medientyp.
     Ein Reel gegen Reels, ein Bild gegen Bilder: ein gemeinsamer Median
     waere eine Zahl, die keinen von beiden beschreibt.

     Auch das Regime sieht nur die reifen Zeilen: ein Median aus
     halbgewachsenen Zahlen waere eine Basis, gegen die jeder aeltere
     Beitrag gut aussieht. */
  const befund = EvidenceRegime.assess(reifeZeilen, { now: NOW });

  log("\n--- MESSEN ---");
  if (!perfData) {
    log("Keine Leistungsdaten (social/data/performance.json fehlt).");
    log("Der Kreislauf laeuft vorwaerts, aber er kommt nicht zurueck.");
  } else {
    log("Gemessene Beitraege: " + gemesseneZeilen.length + " von " + (perfData.requested || 0));
    if (unreif) {
      const naechste = gemesseneZeilen.filter((z) =>
        !MessFenster.isMature(z.snapshot.ageHours, FENSTER_CONFIG));
      log("Davon reif:          " + reifeZeilen.length + "  (" + unreif +
          " noch im Wachstum: " + naechste.map((z) => z.window || "?").join(", ") + ")");
      log("                     Unreife Zahlen sind nicht schlechte Zahlen — sie sind " +
          "noch keine. Sie gehen nicht ins Lernen.");
    }
    log("Evidenzregime:       " + befund.regime + "  (Stichprobe " + befund.sampleSize +
        (befund.unusable ? ", " + befund.unusable + " nicht messbar" : "") + ")");
    for (const [kohorte, k] of Object.entries(befund.cohorts)) {
      log("  " + kohorte.padEnd(9) + k.regime.padEnd(10) + "n=" + String(k.sampleSize).padEnd(4) +
          "aktiv: " + (k.activeDimensions.join(", ") || "(keine)"));
      for (const e of k.excludedDimensions) detail("  aus:", e.dimension, "[" + e.state + "]", e.reason);
    }
  }

  /* Gemessene Leistung an die Gedaechtniseintraege heften. Zuordnung
     ueber die Plattformkennung — sie ist die einzige Klammer zwischen
     einem Beitrag und seinen Zahlen.

     Bewertet wird mit der Methodik SEINER Kohorte. Und jede Bewertung
     traegt ihr Regime mit sich: ein Wert aus BOOTSTRAP ist nicht mit
     einem aus MATURE vergleichbar, das sind verschiedene Groessen mit
     demselben Namen. */
  let zugeordnet = 0;
  let bewertet = 0;
  for (const z of alleZeilen) {
    const treffer = memory.all().filter((e) => e.externalPostId === z.mediaId);
    if (!treffer.length) continue;

    const kohorte = EvidenceRegime.cohortFor(z);
    const k = befund.cohorts[kohorte];
    const bewertung = k
      ? Performance.score(z.snapshot, k.baseline, z.context || {}, { methodology: k.methodology })
      : { available: false, explanation: "Keine Kohorte fuer diesen Medientyp." };

    for (const e of treffer) {
      e.performance = bewertung.available ? bewertung.score : null;
      e.performanceRegime = k ? k.regime : null;
      e.performanceCohort = kohorte;
      e.performanceProvenance = {
        source: "instagram.graph", snapshotId: z.snapshot.snapshotId,
        state: z.snapshot.state, scored: bewertung.available,
        regime: k ? k.regime : null,
        methodologyVersion: k ? k.methodology.version : null,
        activeDimensions: k ? k.activeDimensions.slice() : [],
        reason: bewertung.available ? null : bewertung.explanation
      };
      zugeordnet += 1;
      if (bewertung.available) bewertet += 1;
    }
  }
  if (perfData) {
    log("Zugeordnet:          " + zugeordnet + " Gedaechtniseintrag/-eintraege, " +
        bewertet + " bewertet");
  }

  /* ================================================================
     9. LERNEN  —  aus Zahlen werden Beobachtungen

     Eine Beobachtung ist noch keine Erkenntnis. Sie traegt ihre
     Stichprobengroesse und ihr Konfidenzintervall mit sich, und die
     Learning Engine entscheidet, ob daraus etwas folgen darf.
     ================================================================ */
  log("\n--- LERNEN ---");
  /* NUR innerhalb eines Regimes vergleichen. Ein Score aus BOOTSTRAP und
     einer aus MATURE messen verschiedene Dinge; sie in einen Mittelwert
     zu werfen, erzeugt eine Zahl, die nichts beschreibt — und die wie
     eine Verbesserung aussaehe, sobald das Regime wechselt. */
  const aktivesRegime = befund.regime;
  const alleBewerteten = memory.all()
    .filter((e) => e.performance !== null && e.performance !== undefined);
  const andereRegime = alleBewerteten.filter((e) =>
    e.performanceRegime && e.performanceRegime !== aktivesRegime).length;

  const lernzeilen = alleBewerteten
    .filter((e) => !e.performanceRegime || e.performanceRegime === aktivesRegime)
    .map((e) => ({ archetype: e.archetype, visualType: e.visualType,
                   mediaFormat: e.mediaFormat, performanceScore: e.performance }));

  const beobachtungen = [];
  /* `mediaFormat` ist dabei, obwohl die Strategie dafuer (noch) keinen
     Parameter hat. Die Beobachtung entsteht trotzdem und wird von der
     Sicherheitsgrenze ausdruecklich gestoppt — mit Begruendung. Das ist
     der Unterschied zwischen "wir koennen es nicht messen" und "wir
     messen es, koennen aber noch nichts damit entscheiden". Die zweite
     Aussage ist eine Aufgabe; die erste waere eine Ausrede. */
  for (const dimension of ["archetype", "visualType", "mediaFormat"]) {
    const zeilen = lernzeilen.map((r) => ({ value: r[dimension], performanceScore: r.performanceScore }));
    /* observe() liefert die Beobachtungen direkt als Liste und in
       kanonischer Form — samt observationId. Sie hier neu zu bauen
       haette die Kennung ueberschrieben, und damit haette dieselbe
       Beobachtung bei jedem Lauf als neu gegolten. */
    for (const o of Learning.observe(dimension, zeilen, {}) || []) {
      beobachtungen.push(Schema.learningObservation(o));
    }
  }

  /* Den Massstab festhalten, bevor die Beobachtungen entstehen. Eine
     Beobachtung ohne bekanntes Regime laesst sich spaeter nicht
     einordnen. */
  const regimeEintrag = strategyMemory.recordEvidence(befund.record);
  if (regimeEintrag.changed) log("Evidenzregime festgehalten: " + regimeEintrag.reason);

  const neueBeobachtungen = strategyMemory.recordObservations(beobachtungen);
  log("Reif gemessen:  " + snapshots.length + " Beitrag/Beitraege" +
      (unreif ? "  (" + unreif + " noch im Wachstum, nicht im Lernen)" : ""));
  log("Bewertbar:      " + lernzeilen.length + " (Regime " + aktivesRegime + ")");
  if (andereRegime) {
    log("                " + andereRegime + " aus einem anderen Regime bleiben draussen — " +
        "verschiedene Groessen mit demselben Namen.");
  }
  if (snapshots.length && !lernzeilen.length) {
    /* Den GRUND nennen und nicht den naechstliegenden raten. Eine
       fehlende Vergleichsbasis und zu duenn belegte Kennzahlen sehen im
       Ergebnis gleich aus und verlangen voellig verschiedene
       Antworten. */
    log("                gemessen, aber nicht bewertbar — das ist etwas anderes als ungemessen.");
    /* Den Grund je Kohorte nennen, nicht einen fuer alle: eine Kohorte
       kann an der Vergleichsbasis scheitern und die andere an der
       Abdeckung, und die beiden verlangen verschiedene Antworten. */
    for (const [kohorte, k] of Object.entries(befund.cohorts)) {
      const beispiel = (alleZeilen.filter((z) => EvidenceRegime.cohortFor(z) === kohorte &&
        z.snapshot && z.snapshot.state !== "UNAVAILABLE")[0] || {}).snapshot;
      const warum = beispiel
        ? Performance.score(beispiel, k.baseline, {}, { methodology: k.methodology })
        : null;
      log("                " + kohorte + ": " +
          ((warum && warum.explanation) || k.baseline.reason));
    }
  }
  log("Beobachtungen:  " + beobachtungen.length + " (davon neu: " + neueBeobachtungen + ")");
  for (const o of beobachtungen) {
    detail(o.dimension + "=" + o.value + ": n=" + o.sampleSize +
           (o.sufficient ? "  BELASTBAR" : "  nicht belastbar") + " — " + o.note);
  }
  if (!beobachtungen.length) {
    /* DREI verschiedene Lagen sehen an dieser Stelle gleich aus und
       verlangen voellig verschiedene Antworten. Sie zusammenzufassen
       waere eine Aussage, die mehr behauptet als bekannt ist — und bei
       16 gemessenen Beitraegen waere "es gibt noch keine gemessenen
       Beitraege" schlicht falsch. */
    if (!snapshots.length && !gemesseneZeilen.length) {
      log("Keine Beobachtung moeglich — es wurde noch nichts gemessen.");
    } else if (!snapshots.length) {
      log("Keine Beobachtung moeglich: " + gemesseneZeilen.length + " Beitrag/Beitraege sind " +
          "gemessen, aber noch keiner ist reif. Das loest sich von selbst — der aelteste " +
          "braucht noch Zeit, nicht Code.");
    } else if (!lernzeilen.length) {
      log("Keine Beobachtung moeglich: " + snapshots.length + " reif gemessene " +
          "Beitraege sind keinem Gedaechtniseintrag zugeordnet. Es fehlen die Eintraege, " +
          "nicht die Zahlen — scripts/social/backfill-account-memory.mjs legt sie an.");
    } else {
      log("Keine Beobachtung moeglich: " + lernzeilen.length + " bewertbare Beitraege, " +
          "aber keine Dimension mit genug gleichartigen Faellen.");
    }
  }

  /* ================================================================
     9b. EXPERIMENTIEREN  —  Erkundung mit einer Frage

     Erkundung ohne Hypothese ist Variation: man aendert etwas, sieht
     eine Zahl und weiss hinterher nicht, woran es lag. Ein Experiment
     legt die Frage VOR dem Ergebnis fest — eine Variable, eine
     Kontrolle, eine Stichprobe, die nicht nachtraeglich waechst, bis
     das Ergebnis gefaellt.

     Angelegt wird nur, wenn die Datenlage duenn ist. Wo bereits
     belastbares Wissen liegt, waere ein Experiment die teure Art,
     Bekanntes zu bestaetigen.
     ================================================================ */
  const expFile = D("experiments.json");
  const experiments = existsSync(expFile)
    ? (JSON.parse(readFileSync(expFile, "utf8")).experiments || []) : [];

  log("\n--- EXPERIMENTIEREN ---");

  /* Gemessene Ergebnisse in die Arme laufender Experimente eintragen.
     Zuerst — sonst entscheidet unten ein Experiment ueber Daten, die
     der Lauf gerade selbst mitgebracht hat. */
  let eingetragen = 0;
  for (const exp of experiments) {
    if (exp.state === "DECIDED" || exp.state === "ABANDONED") continue;
    for (const e of memory.all()) {
      if (e.performance === null || e.performance === undefined) continue;
      const wert = e[exp.variable];
      if (wert === undefined || wert === null) continue;
      const arm = String(wert) === exp.control ? "control"
                : String(wert) === exp.variant ? "variant" : null;
      if (!arm) continue;
      /* Derselbe Beitrag darf nicht zweimal zaehlen. */
      const kennung = e.publicationId || e.packageId;
      exp._gezaehlt = exp._gezaehlt || [];
      if (exp._gezaehlt.includes(kennung)) continue;
      exp._gezaehlt.push(kennung);
      Experiments.record(exp, arm, e.performance);
      eingetragen += 1;
    }
  }

  /* Auswerten, was reif ist. */
  const entschieden = [];
  for (const exp of experiments) {
    if (exp.state === "DECIDED" || exp.state === "ABANDONED") continue;
    const res = Experiments.evaluate(exp, {});
    if (res.decided) {
      exp.state = "DECIDED";
      exp.decision = res;
      entschieden.push({ experimentId: exp.experimentId, hypothesis: exp.hypothesis,
                         explanation: res.explanation });
    }
  }

  /* Neue Experimente nur bei duenner Datenlage. */
  const offeneVariablen = experiments
    .filter((e) => e.state !== "DECIDED" && e.state !== "ABANDONED")
    .map((e) => e.variable);

  for (const entry of packages) {
    const d = entry.strategyDecision;
    if (d.mode !== "EXPLORE") continue;
    if (offeneVariablen.includes("archetype")) break;

    const gewaehlt = entry.result.package.archetype;
    const kandidaten = (d.archetypeCandidates || [])
      .filter((c) => c.archetype !== gewaehlt);
    if (!kandidaten.length) break;
    const kontrolle = kandidaten.sort((a, b) => b.sampleSize - a.sampleSize)[0].archetype;

    const res = Experiments.declare({
      hypothesis: "Der Archetyp " + gewaehlt + " erreicht eine hoehere Leistung als " +
        kontrolle + " bei vergleichbaren Anlaessen.",
      variable: "archetype",
      control: kontrolle,
      variant: gewaehlt,
      plannedSamplePerArm: 8
    }, { now: NOW });

    if (res.ok) {
      experiments.push(res.experiment);
      offeneVariablen.push("archetype");
      log("Neu angelegt: " + res.explanation);
    } else {
      detail("nicht angenommen:", res.explanation);
    }
    break;
  }

  const laufend = experiments.filter((e) => e.state !== "DECIDED" && e.state !== "ABANDONED");
  log("Laufend: " + laufend.length + " | Ergebnisse eingetragen: " + eingetragen +
      " | entschieden: " + entschieden.length);
  for (const e of laufend) {
    detail(e.variable + ": " + e.variant + " gegen " + e.control +
      "  (" + e.observations.control.length + "/" + e.plannedSamplePerArm + " Kontrolle, " +
      e.observations.variant.length + "/" + e.plannedSamplePerArm + " Variante)");
  }
  for (const e of entschieden) detail("entschieden:", e.explanation);
  /* Der interne Zaehler gehoert nicht ins Artefakt. */
  for (const e of experiments) delete e._gezaehlt;

  /* ================================================================
     10. ANPASSEN  —  und zwar nur, wenn die Evidenz es traegt

     Der haeufigste Ausgang ist "keine Aenderung". Das ist kein
     Fehler, sondern das Verhalten, das kleine Stichproben verdienen.
     ================================================================ */
  log("\n--- ANPASSEN ---");
  const vorschlag = Learning.proposeStrategyUpdate(
    activeStrategy, strategyMemory.observations(), {});
  const uebernahme = strategyMemory.apply(vorschlag, { now: NOW });

  log("Strategie vorher:  " + activeStrategy.versionId);
  log("Strategie nachher: " + strategyMemory.current().versionId +
      (uebernahme.committed ? "  (NEUE VERSION)" : "  (unveraendert)"));
  log(uebernahme.reason || vorschlag.explanation || "");
  for (const b of vorschlag.blocked || []) detail("blockiert:", b.reason);

  /* ================================================================
     11. DIE SCHATTEN-ENTSCHEIDUNG

     Der Loop soll beweisen, dass er entscheiden KANN, ohne zu
     veroeffentlichen. Jedes Paket bekommt deshalb einen Eintrag:
     "Ich wuerde Thema X mit Hook Y als Format Z um T veroeffentlichen."

     Er geht ins Gedaechtnis mit `performance: null` — ungemessen, weil
     ungesendet. Das ist wichtiger, als es klingt: eine Schatten-
     Entscheidung, die als Null in die Formatstatistik einginge, wuerde
     das System glauben lassen, das Format habe versagt.
     ================================================================ */
  const shadowDecisions = packages.map((entry) => {
    const pkg = entry.result.package;
    const d = entry.strategyDecision;
    return {
      decidedAt: NOW,
      packageId: pkg.packageId,
      topic: pkg.topic,
      archetype: pkg.archetype,
      visualType: pkg.visualType,
      hook: pkg.hook,
      /* Der Text, der hinausginge. Er gehoert in die Entscheidung und
         nicht nur ins Paket: wer spaeter fragt "was waere gesendet
         worden", fragt die Entscheidung. */
      caption: pkg.caption || null,
      hashtags: Array.isArray(pkg.hashtags) ? pkg.hashtags.slice() : [],
      /* Welches Textmuster gewonnen hat. Es reist mit der Entscheidung,
         damit die Attribution spaeter nicht auf einen Join angewiesen
         ist, den jemand vergessen kann. */
      authoringPattern: (entry.authoring && entry.authoring.pattern) || null,
      authoringAuthorId: (entry.authoring && entry.authoring.authorId) || null,
      authoring: entry.authoring || null,
      /* Die Herkunft gehoert an die Entscheidung, nicht in eine zweite
         Tabelle, die man dazu-joinen muss. Ein Join, den jemand
         vergessen kann, ist keine Kette. */
      opportunityId: entry.candidate.opportunity.opportunityId,
      signalIds: entry.candidate.opportunity.signalIds || [],
      plannedHourUtc: d.timingHour,
      timingSource: d.timingSource || null,
      timingReason: d.timingReason || null,
      mode: d.mode,
      modeReason: d.modeReason,
      strategyVersion: activeStrategy.versionId,
      wouldPublish: true,
      published: false,
      withheldBecause: "Shadow-Modus: GLOBAL_AUTOPUBLISH ist aus. " +
        "Der Loop entscheidet, er sendet nicht."
    };
  });

  /* Ein zweiter Lauf zum selben Zeitpunkt erzeugt dieselben Pakete mit
     denselben Kennungen. Sie erneut einzutragen waere kein zweiter
     Beitrag, sondern eine zweite Abschrift desselben — und sobald
     Eintraege eine Leistung tragen, zaehlte jede Abschrift mit.

     Geprueft wird die Paketkennung, nicht der Inhalt: sie ist ein Hash
     ueber den Inhalt, und zwei gleiche Inhalte SIND dieselbe
     Entscheidung. */
  const bekanntePakete = new Set(memory.all()
    .map((e) => e.packageId).filter(Boolean).map(String));

  let neueEintraege = 0;
  for (const d of shadowDecisions) {
    if (bekanntePakete.has(String(d.packageId))) continue;
    bekanntePakete.add(String(d.packageId));
    neueEintraege += 1;
    const pkg = packages.find((e) => e.result.package.packageId === d.packageId).result.package;
    memory.add({
      publicationId: null, packageId: pkg.packageId, publishedAt: null,
      platform: "instagram", topic: pkg.topic, entities: pkg.entities || [],
      archetype: pkg.archetype, visualType: pkg.visualType,
      hook: pkg.hook, caption: pkg.caption, cta: pkg.cta || null,
      authoringPattern: d.authoringPattern || null,
      authoringAuthorId: d.authoringAuthorId || null,
      /* Ungemessen, weil ungesendet. Nicht 0. */
      performance: null,
      lineage: {
        origin: "SHADOW_CYCLE",
        signalIds: pkg.signalIds || [],
        opportunityId: pkg.opportunityId || null,
        strategyVersion: activeStrategy.versionId,
        decidedMode: d.mode
      }
    });
  }
  log("\nSchatten-Entscheidungen: " + shadowDecisions.length +
      " (entschieden, nicht gesendet)" +
      (neueEintraege === shadowDecisions.length ? ""
        : "; " + (shadowDecisions.length - neueEintraege) + " davon standen schon im Gedaechtnis"));

  /* ================================================================
     11b. DIE FRACHT  —  waere dieser Beitrag ueberhaupt sendbar?

     Eine Schatten-Entscheidung, die sagt "ich wuerde X um T senden",
     behauptet damit, dass X sendbar WAERE. Ob das stimmt, entscheidet
     sich nicht an der Entscheidung, sondern am Material: der
     Veroeffentlichungspfad verlangt eine erreichbare JPEG-Adresse, und
     ohne Bild gibt es keine.

     Geplant wird deshalb hier, gezeichnet nur auf ausdrueckliche
     Anforderung (--render). Ein Trockenlauf, der Binaerdateien ins
     Repository schreibt, ist kein Trockenlauf.

     Der Unterschied zwischen "der Loop entscheidet" und "der Loop
     koennte senden" ist genau diese Stufe. Ohne sie faellt erst im
     Moment der Veroeffentlichung auf, dass die Fracht fehlt — und dann
     ist der Anspruch schon angemeldet.
     ================================================================ */
  /* Die Quellenzeile unter dem Bild. Aus der Datenreihe selbst, nicht
     erfunden und nicht aus einem Objekt zusammengestueckelt - der erste
     Versuch schrieb "Quelle: [object Object]" unter ein sonst fertiges
     Bild. */
  function quelleAus(lage) {
    if (!lage || !lage.series || !lage.series.source) return null;
    return lage.series.asOf
      ? lage.series.source + ", Stand " + VisualComposition.datumDe(lage.series.asOf)
      : lage.series.source;
  }

  log("\n--- FRACHT ---");
  let sendbar = 0;
  for (const d of shadowDecisions) {
    const eintrag = packages.find((e) => e.result.package.packageId === d.packageId);
    const pkg = eintrag.result.package;

    /* -----------------------------------------------------------------
       ZWEI WEGE ZU EINEM BILD

       Hat der Autor ein geprueftes Asset mitgebracht, ist das Bild
       schon da: erzeugt, committet, frisch zurueckgelesen. Dann wird
       es UEBERNOMMEN und nicht ersetzt.

       Sonst zeichnet der Zyklus seine Karte wie bisher.
       ----------------------------------------------------------------- */
    const mitgebracht = eintrag.production && eintrag.production.asset;

    /* -----------------------------------------------------------------
       DREI WEGE ZU EINEM BILD, UND NUR EINER KOSTET ETWAS

         uebernahme    der Agent hat eines geliefert und es ist geprueft
         komposition   aus den Daten DIESES Objekts gerechnet
         karte         die bisherige Zahl-mit-Aussage-Karte

       Die Komposition ist der Regelfall, sobald die Daten sie tragen:
       kein externer Lauf, kein Binaertransport, und fuer jedes Objekt
       ein anderes Bild.
       ----------------------------------------------------------------- */
    const lage = bildDatenlage[pkg.topic] || null;
    const kompo = (!mitgebracht && lage)
      ? VisualComposition.compose(pkg.visualType, lage.composition) : null;

    const bildplan = mitgebracht
      ? AssetRenderer.planUebernahme(pkg, eintrag.production.asset)
      : (kompo && kompo.ok
        ? AssetRenderer.planKomposition(pkg, kompo, {
            entitaet: lage.symbol || null,
            /* Die Grafik sagt etwas ueber SICH, nicht ueber den Hook.
               Der erste Versuch setzte den Hook darueber - und dann
               stand "65,3 Technical Opportunity Score" ueber einer
               Kurskurve. Zwei Aussagen, eine Flaeche, und der
               Betrachter muss raten, welche gilt. Genau dagegen gibt es
               visual-quality.js. */
            aussage: VisualComposition.aussage(kompo, lage.symbol),
            quelle: quelleAus(lage) })
        : AssetRenderer.plan(pkg, {}));

    d.asset = {
      plannable: bildplan.ok,
      visualType: bildplan.visualType || pkg.visualType || null,
      reason: bildplan.ok ? null : bildplan.reason,
      message: bildplan.ok ? null : bildplan.message,
      /* Die Adresse, unter der das Bild oeffentlich WAERE. Sie entsteht
         aus der Paketkennung, damit Anspruch, Datei und Adresse
         dieselbe Kennung tragen — drei Namen fuer denselben Beitrag
         waeren drei Gelegenheiten, sie auseinanderlaufen zu lassen. */
      imageUrl: bildplan.ok ? (SITE_BASE + "/" + ASSET_DIR + "/" + pkg.packageId + ".jpg") : null,
      /* Der Bildwert gehoert an die Entscheidung. Ein Bild, das sich
         zeichnen laesst, ist noch keines, das etwas sagt. */
      quality: bildplan.quality || (bildplan.ok ? null : (bildplan.quality || null)),
      /* Woher das Bild stammt. Ein uebernommenes und ein gezeichnetes
         Bild sind verschiedene Dinge, und der Unterschied gehoert in
         die Provenance und nicht in eine Fussnote. */
      origin: bildplan.modus === "uebernahme" ? "generative" : "rendered",
      sourceAsset: bildplan.modus === "uebernahme" ? {
        path: bildplan.quelle, sha256: bildplan.sha256,
        mimeType: bildplan.mimeType,
        variantId: (mitgebracht && mitgebracht.visual_variant_id) || null,
        strategy: (mitgebracht && mitgebracht.visual_strategy) || null
      } : null,
      rendered: false
    };

    if (!bildplan.ok) {
      log("  " + pkg.packageId + ": KEIN BILD — " + bildplan.reason);
      detail("   ", bildplan.message);
      continue;
    }
    sendbar += 1;

    if (RENDER) {
      try {
        const ziel = join(ROOT, ASSET_DIR, pkg.packageId + ".jpg");
        const befund = bildplan.modus === "uebernahme"
          ? AssetRenderer.uebernimm(bildplan, ziel, { root: ROOT })
          : AssetRenderer.render(bildplan, ziel,
              { schrift: AssetRenderer.ladeSchrift(ROOT) });
        d.asset.rendered = true;
        d.asset.bytes = befund.bytes;
        log("  " + pkg.packageId + ": " +
          (bildplan.modus === "uebernahme"
            ? "uebernommen aus " + bildplan.quelle + ", "
            : "gezeichnet, ") + befund.breite + "x" + befund.hoehe);
      } catch (err) {
        /* Ein gescheitertes Zeichnen macht den Plan nicht falsch — es
           macht den Beitrag heute nicht sendbar. Der Unterschied steht
           im Bericht. */
        d.asset.rendered = false;
        d.asset.renderError = String(err && err.message || err);
        sendbar -= 1;
        log("  " + pkg.packageId + ": ZEICHNEN GESCHEITERT — " + d.asset.renderError);
      }
    } else {
      log("  " + pkg.packageId + ": sendbar (" + d.asset.visualType + "), " +
        (bildplan.modus === "uebernahme" ? "nicht uebernommen" : "nicht gezeichnet"));
    }
  }
  for (const d of shadowDecisions) {
    const g = d.asset && d.asset.quality;
    if (!g) continue;
    /* Die Kartenpruefung misst Redundanz, Vollstaendigkeit und
       Lesbarkeit von TEXT. Ein generatives Bild traegt laut Brief
       keinen. "Nicht anwendbar" zu melden ist ehrlicher, als eine
       Punktzahl zu erfinden oder stillschweigend zu bestehen. */
    if (g.applicable === false) {
      detail(d.packageId + ": Bildwert nicht anwendbar — " + g.explanation);
      continue;
    }
    detail(d.packageId + ": Bildwert " + g.score +
      ((g.warnings || []).length ? ", " + g.warnings.length + " Hinweis(e)" : ""));
  }
  log("Sendbar: " + sendbar + " von " + shadowDecisions.length +
      (RENDER ? " (gezeichnet)" : " (nur geplant — --render zeichnet)"));

  /* ---------------------------------------------------- 8. Artefakte */
  const report = {
    generatedAt: NOW,
    provider: PROVIDER_ID,
    /* Der Zustand des externen Creative-Providers, soweit beobachtbar.
       Er gehoert in den Bericht und nicht nur auf die Konsole: wer den
       Lauf spaeter liest, soll sehen, ob die Vorlage eingesprungen ist
       und warum. */
    creativeProvider: creativeZustaende,
    health: matrix,
    autonomy,
    signals: signalData.signals.length,
    opportunities: candidates.map((c) => ({
      opportunityId: c.opportunity.opportunityId, topic: c.opportunity.topic,
      score: c.score.score, proposable: c.score.proposable, explanation: c.score.explanation,
      /* Die Signale, aus denen diese Gelegenheit entstand. Ohne sie
         bricht die Herkunftskette an ihrem Anfang ab — und der Anfang
         ist die Stelle, an der sich spaeter am wenigsten rekonstruieren
         laesst. */
      signalIds: c.opportunity.signalIds || []
    })),
    packages: packages.map((p) => ({
      packageId: p.result.package.packageId, topic: p.result.package.topic,
      opportunityId: p.candidate.opportunity.opportunityId,
      archetype: p.result.package.archetype, visualType: p.result.package.visualType,
      hook: p.result.package.hook,
      /* Wer geschrieben hat, welches Muster gewann und wogegen. */
      authoring: p.authoring || null
    })),
    rejections,
    published: published.map((p) => ({
      publicationId: p.publication.publicationId, state: p.publication.state,
      externalPostId: p.publication.externalPostId
    })),
    auditEntries: auditLog.size(),

    /* Der Rueckweg im Bericht. Ohne diese Felder liesse sich von aussen
       nicht unterscheiden, ob der Loop geschlossen ist oder nur schnell
       vorwaerts laeuft. */
    learning: {
      /* Drei verschiedene Zahlen, die leicht zu einer verschmelzen —
         und dann ist "nichts gemessen" nicht mehr von "gemessen, aber
         noch nicht bewertbar" zu unterscheiden. Genau diese Verwechslung
         laesst spaeter jemanden nach einem Fehler suchen, wo eine
         Stichprobe einfach zu klein ist. */
      measuredPosts: gemesseneZeilen.length,
      maturePosts: reifeZeilen.length,
      awaitingMaturity: unreif,
      /* Die Vergleichsbasis gibt es jetzt je Kohorte. "Reicht sie" ist
         damit keine einzelne Wahrheit mehr — und so steht es auch da. */
      baselineSufficient: Object.values(befund.cohorts).length > 0 &&
        Object.values(befund.cohorts).every((k) => k.baseline.sufficient),
      baselineReason: Object.entries(befund.cohorts)
        .map(([c, k]) => c + ": " + k.baseline.reason).join(" | ") || "Keine Kohorte.",
      evidenceRegime: befund.regime,
      evidenceRecord: befund.record,
      regimeChanged: regimeEintrag.changed === true,
      regimeReason: regimeEintrag.reason,
      crossRegimeExcluded: andereRegime,
      scoreablePosts: lernzeilen.length,
      dataPoints: lernzeilen.length,
      evidenceState: snapshots.length === 0
        ? "NICHTS_GEMESSEN"
        : (lernzeilen.length === 0 ? "GEMESSEN_NICHT_BEWERTBAR" : "BEWERTBAR"),
      observations: beobachtungen.map((o) => ({
        dimension: o.dimension, value: o.value, sampleSize: o.sampleSize,
        sufficient: o.sufficient, note: o.note
      })),
      strategyBefore: activeStrategy.versionId,
      strategyAfter: strategyMemory.current().versionId,
      strategyChanged: uebernahme.committed === true,
      strategyReason: uebernahme.reason || vorschlag.explanation || null,
      archetypeKnowledge,
      /* Das gemessene Zeitfenster gehoert in den Bericht, auch wenn es
         (noch) unter der Mindeststichprobe liegt. Sonst laesst sich
         "nicht gemessen" nicht von "gemessen, aber zu duenn" trennen —
         und das sind zwei voellig verschiedene Aufgaben. */
      timingKnowledge: timingKnowledge ? timingKnowledge.hourly : null
    },
    experiments: {
      running: laufend.length,
      recorded: eingetragen,
      decided: entschieden,
      open: laufend.map((e) => ({ experimentId: e.experimentId, variable: e.variable,
        hypothesis: e.hypothesis, control: e.control, variant: e.variant,
        counts: { control: e.observations.control.length, variant: e.observations.variant.length },
        needed: e.plannedSamplePerArm }))
    },
    shadowDecisions
  };

  if (OUT_DIR) {
    const dir = join(ROOT, OUT_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cycle-report.json"), JSON.stringify(report, null, 2) + "\n");
    writeFileSync(join(dir, "publications.json"),
      JSON.stringify({ generatedAt: NOW, publications: orchestrator.all() }, null, 2) + "\n");
    writeFileSync(join(dir, "audit-log.json"),
      JSON.stringify({ generatedAt: NOW, entries: auditLog.entries() }, null, 2) + "\n");
    writeFileSync(join(dir, "health.json"), JSON.stringify(matrix, null, 2) + "\n");

    /* Das Gedaechtnis und die Strategiekette. Ohne diese zwei Zeilen
       beginnt der naechste Lauf wieder von vorn — und der Kreislauf
       waere eine Schleife, die sich nur schnell dreht. */
    writeFileSync(join(dir, "content-memory.json"),
      JSON.stringify({ generatedAt: NOW, entries: memory.all() }, null, 2) + "\n");
    writeFileSync(join(dir, "strategy-memory.json"),
      JSON.stringify(strategyMemory.snapshot({ now: NOW }), null, 2) + "\n");
    writeFileSync(join(dir, "experiments.json"),
      JSON.stringify({ generatedAt: NOW, experiments }, null, 2) + "\n");
    writeFileSync(join(dir, "shadow-decisions.json"),
      JSON.stringify({ generatedAt: NOW, strategyVersion: activeStrategy.versionId,
        decisions: shadowDecisions }, null, 2) + "\n");
    log("\nGeschrieben nach " + OUT_DIR + "/");
  } else {
    log("\n(Kein --out: es wurde nichts geschrieben.)");
  }

  log("\nZusammenfassung: " + report.signals + " Signale, " + report.opportunities.length +
      " Gelegenheiten, " + report.packages.length + " Pakete, " + report.published.length +
      " veroeffentlicht, Systemzustand " + matrix.overall + ", Autonomie " + autonomy.effective + ".");
}

main().catch((err) => {
  /* Ein Fehler hier ist ein Baufehler, kein Betriebszustand — er soll
     den Lauf rot machen. Die Meldung wird gekuerzt, damit ein Stacktrace
     keine Umgebungswerte mitschleppt. */
  console.error("Zyklus abgebrochen:", String(err && err.message).slice(0, 400));
  if (process.env.VU_DEBUG) console.error(err && err.stack);
  process.exitCode = 1;
});

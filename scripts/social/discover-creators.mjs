/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/discover-creators.mjs

   ENTDECKEN, OHNE ZU BEWERTEN — UND OHNE ZU KOPIEREN

   Dieses Skript hat zwei Betriebsarten, und die erste braucht keinen
   Schluessel:

     PLANEN     leitet Suchphrasen aus dem Content Universe ab und
                rechnet die Einheiten aus. Laeuft immer.
     ENTDECKEN  ruft die YouTube Data API auf. Laeuft nur mit
                YOUTUBE_API_KEY.

   Die Trennung ist der Punkt: der offene Owner-Schritt ist EIN
   Schluessel, nicht ein Stapel Arbeit. Alles, was ohne ihn machbar ist,
   ist gemacht.

   -------------------------------------------------------------------------
   WAS AUS DER ANTWORT UEBERNOMMEN WIRD
   -------------------------------------------------------------------------

   Kanal-ID und Handle. Sonst nichts.

   Die Antwort der API traegt Titel, Beschreibungen und Vorschaubilder.
   Das sind fremde Werke (§5). Sie werden nicht gespeichert, nicht
   protokolliert und nicht in ein Artefakt geschrieben - `ernte()` liest
   genau zwei Felder heraus, und die Rohantwort wird danach verworfen.

   -------------------------------------------------------------------------
   DIE KNAPPE RESSOURCE IST EINE ANZAHL
   -------------------------------------------------------------------------

   Seit dem 2026-06-01 hat `search.list` einen eigenen Topf: 100
   Aufrufe je Tag, jeder kostet 1 darin, und er zieht nichts aus dem
   allgemeinen 10.000er-Kontingent. Detailabrufe sind damit praktisch
   frei; die Suchen sind gezaehlt.

   Wer heute nicht drankommt, kommt morgen dran - anders als beim
   Hashtag-Fenster, wo ein Platz eine Woche lang bindet. Deshalb darf
   die Kandidatenliste lang sein, und deshalb entscheidet ein
   Portfolio taeglich neu, statt eine Liste abzuarbeiten.

   -------------------------------------------------------------------------
   DER SCHLUESSEL STEHT NIE IN EINER ADRESSE
   -------------------------------------------------------------------------

   Google akzeptiert ihn in der Kopfzeile `X-goog-api-key`. Der
   Query-Parameter `?key=` waere bequemer und landete in jedem
   Protokoll, in jeder Fehlermeldung und in jedem Proxy-Log. Dieselbe
   Entscheidung wie beim Smoke-Publish.

   Ausfuehren:
     node scripts/social/discover-creators.mjs                  (nur planen)
     YOUTUBE_API_KEY=... node scripts/social/discover-creators.mjs --discover
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { baueSlate } from "./build-opportunity-slate.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Creator = require(join(ROOT, "social/engines/creator-universe.js"));
const YouTube = require(join(ROOT, "social/engines/youtube-source.js"));
const Portfolio = require(join(ROOT, "social/engines/youtube-query-portfolio.js"));

export const UNIVERSE_DATEI = "social/data/creator-universe.json";
export const PORTFOLIO_DATEI = "social/data/youtube-query-portfolio.json";
const API = "https://www.googleapis.com/youtube/v3";

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/**
 * Der Plan: welche Suchen heute laufen, und warum jede einzelne.
 *
 * Zwei Schichten, und sie gehoeren getrennt:
 *
 *   `youtube-source.js`          wie viele Aufrufe der Tag hergibt
 *   `youtube-query-portfolio.js` WER von ihnen welchen bekommt
 *
 * Die Kandidaten kommen aus dem Content Universe. Nirgends steht eine
 * feste Liste - das Portfolio entscheidet taeglich neu und lernt
 * dabei, welche Wiederholung sich lohnt.
 */
export function planeEntdeckung(options) {
  options = options || {};
  const slate = options.slate || baueSlate();
  const alle = Creator.suchbegriffe(slate.topics, options);

  const tag = YouTube.tagesplan({
    searches: options.searches,
    searchCallsUsedToday: options.searchCallsUsedToday || 0,
    unitsUsedToday: options.unitsUsedToday || 0,
    reserveSearchCalls: options.reserveSearchCalls,
    maxSearchesPerRun: options.maxSearchesPerRun
  });

  const bestand = options.state ||
    readJson(join(ROOT, PORTFOLIO_DATEI), { queries: {} }).queries || {};

  const auswahl = Portfolio.plan({
    candidates: alle,
    state: bestand,
    searchBudget: tag.search.planned,
    now: options.now,
    coreShare: options.coreShare,
    eventShare: options.eventShare
  });

  return {
    quota: tag,
    quotaCheck: YouTube.pruefungFaellig({ now: options.now }),
    portfolio: auswahl,
    queries: auswahl.selected,
    candidates: alle.length,
    /* Was DIESER Lauf ausgibt, in der Waehrung seines Topfes. Der
       Tagesplan nennt die Kapazitaet; das hier ist die Rechnung. */
    thisRunSearchCalls: auswahl.selected.length,
    blocked: auswahl.blockedByTerminalFailure === true,
    explanation: auswahl.blockedByTerminalFailure
      ? auswahl.explanation
      : alle.length + " Suchphrasen aus dem Content Universe. " +
        auswahl.explanation + " Kosten: " + auswahl.selected.length +
        " von " + tag.search.free + " freien Suchaufrufen (Tagesgrenze " +
        tag.search.dailyLimit + ", " + tag.search.reserve + " in Reserve). " +
        "Der allgemeine Topf bleibt davon unberuehrt - er traegt die " +
        "Detailabrufe, die je 1 von " + tag.general.free + " kosten."
  };
}

/**
 * Genau zwei Felder je Kanal. Der Rest der Antwort wird verworfen.
 *
 * Exportiert, weil diese Eigenschaft pruefbar sein muss: ein Test
 * haelt eine Antwort voller fremder Texte hin und durchsucht die
 * Ausgabe danach.
 */
export function ernte(antwort, kontext) {
  kontext = kontext || {};
  const gesehen = {};
  return ((antwort && antwort.items) || []).map(function (item) {
    const id = item && item.snippet && item.snippet.channelId
      ? item.snippet.channelId
      : (item && item.id && item.id.channelId) || (typeof item?.id === "string" ? item.id : null);
    if (!id || gesehen[id]) return null;
    gesehen[id] = true;
    /* Ein Handle ist eine Adresse - ohne ihn gibt es spaeter keinen
       Aufruf. Titel, Beschreibung und Vorschaubild bleiben, wo sie
       sind. */
    const handle = item && item.snippet && item.snippet.customUrl
      ? item.snippet.customUrl : null;
    return {
      creatorId: id,
      platform: "youtube",
      handle: handle,
      discoveredVia: "YOUTUBE_SEARCH",
      discoveredByQuery: kontext.query || null,
      topicIds: (kontext.topicIds || []).slice(),
      families: (kontext.families || []).slice()
    };
  }).filter(Boolean);
}

/**
 * Der kanonische Grund hinter einem HTTP-Fehler.
 *
 * Oberhalb dieser Funktion existiert kein Google-Statuscode mehr -
 * dieselbe Trennung wie im Worker fuer Meta. Das Portfolio entscheidet
 * anhand des Grundes, ob ein weiterer Lauf sinnvoll ist, und
 * `quotaExceeded` vergeht um Mitternacht, waehrend `keyInvalid` einen
 * Menschen braucht.
 */
export function grundAus(err) {
  const t = String((err && err.message) || err || "");
  if (/quotaExceeded|quota exceeded/i.test(t)) return "quotaExceeded";
  if (/API key not valid|keyInvalid|API_KEY_INVALID/i.test(t)) return "keyInvalid";
  if (/accessNotConfigured|has not been used in project|SERVICE_DISABLED/i.test(t)) {
    return "accessNotConfigured";
  }
  if (/HTTP 403/.test(t)) return "forbidden";
  if (/HTTP 5\d\d/.test(t)) return "providerOutage";
  return "providerError";
}

async function ruf(pfad, params, key) {
  const url = new URL(API + pfad);
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  /* Der Schluessel reist in der Kopfzeile, nie in der Adresse. */
  const res = await fetch(url, { headers: { "X-goog-api-key": key } });
  const text = await res.text();
  if (!res.ok) {
    /* Die Fehlermeldung von Google kann den Schluessel nicht enthalten -
       er stand nie in der Adresse. Trotzdem nur Status und Code. */
    let code = "";
    try { code = (JSON.parse(text).error || {}).status || ""; } catch { /* egal */ }
    throw new Error("YouTube " + pfad + " antwortet HTTP " + res.status +
      (code ? " (" + code + ")" : ""));
  }
  return JSON.parse(text);
}

export async function entdecke(options) {
  options = options || {};
  const key = options.apiKey || process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { ok: false, state: "AWAITING_OWNER_SOURCE", found: [],
      explanation: "Kein YOUTUBE_API_KEY. Das ist der offene " +
        "Owner-Schritt und kein Defekt." };
  }
  const plan = options.plan || planeEntdeckung(options);
  const gefunden = [];
  let verbraucht = 0;

  const laufErgebnisse = [];
  for (const q of plan.queries) {
    let antwort = null;
    try {
      antwort = await ruf("/search", {
        part: "snippet", type: "channel", maxResults: "10",
        relevanceLanguage: "de", q: q.query
      }, key);
    } catch (err) {
      /* Ein gescheiterter Aufruf ist KEINE Beobachtung von null
         Kanaelen. Er wird als Versuch festgehalten, mit Grund - und
         der naechste Plan entscheidet danach, ob weitergesucht wird. */
      laufErgebnisse.push(Object.assign({}, q,
        { ok: false, reason: grundAus(err), message: String(err.message || err) }));
      continue;
    }
    verbraucht += 1;                    /* ein Aufruf, nicht 100 Einheiten */
    const neue = ernte(antwort, q);
    neue.forEach((k) => gefunden.push(k));
    laufErgebnisse.push(Object.assign({}, q,
      { ok: true, channels: neue.length, newChannels: null }));
  }

  /* Nachsehen ist fast gratis: ein Aufruf fuer bis zu 50 Kanaele
     liefert die Handles, die die Suche nicht immer mitgibt. */
  const ohneHandle = gefunden.filter((k) => !k.handle).map((k) => k.creatorId);
  for (let i = 0; i < ohneHandle.length; i += 50) {
    const antwort = await ruf("/channels", {
      part: "snippet", id: ohneHandle.slice(i, i + 50).join(",")
    }, key);
    verbraucht += YouTube.KONTINGENT.costs["channels.list"];
    ((antwort && antwort.items) || []).forEach((item) => {
      const treffer = gefunden.find((k) => k.creatorId === item.id);
      if (treffer && item.snippet && item.snippet.customUrl) {
        treffer.handle = item.snippet.customUrl;
      }
    });
  }

  return { ok: true, state: "DISCOVERED", found: gefunden,
    searchCallsUsed: verbraucht,
    results: laufErgebnisse,
    explanation: gefunden.length + " Kanaele aus " + plan.queries.length +
      " Suchen, " + verbraucht + " von 100 Suchaufrufen des Tages " +
      "verbraucht. Keine Bewertung, keine uebernommenen Texte." };
}

export function schreibe(gefunden, options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const pfad = join(ROOT, UNIVERSE_DATEI);
  const vorher = readJson(pfad, null);
  const basis = vorher || Creator.universum([], { version: 0, createdAt: now });
  const vorherIds = new Set((basis.entries || []).map((e) => e.creatorId));
  const naechste = Creator.lernen(basis, options.observations || [],
    { now, discovered: gefunden });
  if (!naechste.ok) return { ok: false, universe: naechste };
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(naechste, null, 2) + "\n");

  /* -----------------------------------------------------------------
     NEU HEISST: WIR KANNTEN IHN NOCH NICHT

     Das Portfolio lernt an genau einer Groesse - bringt diese Suche
     noch NEUE Kanaele? Sie laesst sich nur hier bestimmen, weil nur
     hier der Bestand VOR dem Lauf bekannt ist. `entdecke()` weiss es
     nicht: dort ist jeder gefundene Kanal gleich neu.

     Deshalb wird `newChannels` in `entdecke()` bewusst als null
     zurueckgegeben und erst an dieser Stelle gefuellt. Eine Zahl, die
     dort schon dastuende, waere die Zahl der TREFFER und nicht die der
     Neuen - und das Portfolio haette nie etwas als ausgeschoepft
     erkannt. */
  let portfolioPfad = null;
  if (options.results) {
    const jeQuery = {};
    (gefunden || []).forEach((k) => {
      const q = k.discoveredByQuery;
      if (!q) return;
      jeQuery[q] = jeQuery[q] || { alle: 0, neue: 0 };
      jeQuery[q].alle += 1;
      if (!vorherIds.has(k.creatorId)) jeQuery[q].neue += 1;
    });
    const angereichert = options.results.map((r) => r.ok === false ? r
      : Object.assign({}, r, {
        channels: (jeQuery[r.query] || {}).alle || 0,
        newChannels: (jeQuery[r.query] || {}).neue || 0
      }));

    const pPfad = join(ROOT, PORTFOLIO_DATEI);
    const bestand = readJson(pPfad, { queries: {} }).queries || {};
    const fort = Portfolio.record(bestand, angereichert, now);
    const gelernt = Portfolio.lernen(fort, {
      maxCore: options.maxCore === undefined ? 8 : options.maxCore
    });
    writeFileSync(pPfad, JSON.stringify({
      generatedAt: now,
      coreSize: gelernt.coreSize,
      coreLimit: gelernt.coreLimit,
      lastChanges: gelernt.changes,
      queries: gelernt.state
    }, null, 2) + "\n");
    portfolioPfad = PORTFOLIO_DATEI;
  }

  return { ok: true, universe: naechste, path: UNIVERSE_DATEI,
    portfolioPath: portfolioPfad };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  /* Ohne Angabe entscheidet der Tagesplan, nicht eine Zahl im Skript. */
  const gewuenscht = arg("searches", null);
  const plan = planeEntdeckung(
    gewuenscht === null ? {} : { searches: Number(gewuenscht) });

  console.log("VISION UNIVERSE SOCIAL — Creator Discovery\n");
  console.log(plan.explanation + "\n");

  if (plan.portfolio.ownerActionRequired) {
    console.log("!!! OWNER-SCHRITT NOETIG !!!");
    console.log("    " + plan.portfolio.ownerActionRequired.what);
    console.log("");
  }

  plan.queries.forEach((q) => console.log("  " + q.role.padEnd(22) +
    q.query + "\n      " + q.reason));

  if (plan.quotaCheck.due) {
    console.log("\nKontingent: " + plan.quotaCheck.explanation);
  }

  if (args.includes("--discover")) {
    if (plan.blocked) {
      console.log("\nEs wird nichts gesucht - siehe oben.");
      process.exit(0);
    }
    const erg = await entdecke({ plan });
    console.log("\n" + erg.explanation);
    if (!erg.ok) process.exit(0);
    const w = schreibe(erg.found, { results: erg.results });
    console.log(w.ok
      ? "Geschrieben: " + w.path + " (Version " + w.universe.version + ")" +
        (w.portfolioPath ? ", " + w.portfolioPath : "")
      : "NICHT geschrieben - das Universum ist beanstandet: " +
        JSON.stringify(w.universe.violations));
    if (!w.ok) process.exit(4);
  } else {
    console.log("\nNur geplant. Mit --discover und YOUTUBE_API_KEY wird " +
      "tatsaechlich gesucht.");
  }
}

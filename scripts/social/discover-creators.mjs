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

export const UNIVERSE_DATEI = "social/data/creator-universe.json";
const API = "https://www.googleapis.com/youtube/v3";

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/**
 * Der Plan: welche Suchen, zu welchen Kosten.
 *
 * Suchen sind teuer (100 Einheiten), Nachsehen ist fast gratis (1).
 * Deshalb wenige Suchen und viele Detailabrufe darauf - die Form folgt
 * aus dem Kontingent, nicht aus einer Vorliebe.
 */
export function planeEntdeckung(options) {
  options = options || {};
  const slate = options.slate || baueSlate();
  const alle = Creator.suchbegriffe(slate.topics, options);
  const tag = YouTube.tagesplan({
    searches: options.searches === undefined ? 4 : options.searches,
    usedToday: options.usedToday || 0
  });
  return {
    quota: tag,
    quotaCheck: YouTube.pruefungFaellig({ now: options.now }),
    /* Mehr Phrasen als Suchen ist der Normalfall. Genommen werden die
       mit der groessten Reichweite im EIGENEN Programm - das ist keine
       Aussage ueber die Treffer, die es noch gar nicht gibt. */
    queries: alle.slice(0, tag.calls["search.list"]),
    candidates: alle.length,
    /* Der Tagesplan nennt die KAPAZITAET des Tages, nicht den
       Verbrauch dieses Laufs. Der Unterschied gehoert in den Satz:
       "8600 Detailabrufe" neben vier Suchen zu lesen, waere eine
       Zahl, die niemand ausgibt. */
    thisRunCost: tag.calls["search.list"] * YouTube.KONTINGENT.costs["search.list"],
    explanation: alle.length + " Suchphrasen aus dem Content Universe, " +
      tag.calls["search.list"] + " davon laufen heute - das kostet " +
      (tag.calls["search.list"] * YouTube.KONTINGENT.costs["search.list"]) +
      " von " + tag.free + " freien Einheiten. Der Rest des Tages bleibt " +
      "fuer Detailabrufe, die je 1 kosten: Suchen ist teuer, Nachsehen " +
      "fast gratis."
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

  for (const q of plan.queries) {
    const antwort = await ruf("/search", {
      part: "snippet", type: "channel", maxResults: "10",
      relevanceLanguage: "de", q: q.query
    }, key);
    verbraucht += YouTube.KONTINGENT.costs["search.list"];
    ernte(antwort, q).forEach((k) => gefunden.push(k));
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
    unitsUsed: verbraucht,
    explanation: gefunden.length + " Kanaele aus " + plan.queries.length +
      " Suchen, " + verbraucht + " Einheiten verbraucht. Keine Bewertung, " +
      "keine uebernommenen Texte." };
}

export function schreibe(gefunden, options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const pfad = join(ROOT, UNIVERSE_DATEI);
  const vorher = readJson(pfad, null);
  const basis = vorher || Creator.universum([], { version: 0, createdAt: now });
  const naechste = Creator.lernen(basis, options.observations || [],
    { now, discovered: gefunden });
  if (!naechste.ok) return { ok: false, universe: naechste };
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(naechste, null, 2) + "\n");
  return { ok: true, universe: naechste, path: UNIVERSE_DATEI };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const plan = planeEntdeckung({ searches: Number(
    args.indexOf("--searches") === -1 ? 4 : args[args.indexOf("--searches") + 1]) });

  console.log("VISION UNIVERSE SOCIAL — Creator Discovery\n");
  console.log(plan.explanation + "\n");
  plan.queries.forEach((q) => console.log("  " + String(q.topicIds.length).padStart(2) +
    " Themen  " + q.query));

  if (plan.quotaCheck.due) {
    console.log("\nKontingent: " + plan.quotaCheck.explanation);
  }

  if (args.includes("--discover")) {
    const erg = await entdecke({ plan });
    console.log("\n" + erg.explanation);
    if (!erg.ok) process.exit(0);
    const w = schreibe(erg.found, {});
    console.log(w.ok
      ? "Geschrieben: " + w.path + " (Version " + w.universe.version + ")"
      : "NICHT geschrieben - das Universum ist beanstandet: " +
        JSON.stringify(w.universe.violations));
    if (!w.ok) process.exit(4);
  } else {
    console.log("\nNur geplant. Mit --discover und YOUTUBE_API_KEY wird " +
      "tatsaechlich gesucht.");
  }
}

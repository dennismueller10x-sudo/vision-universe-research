/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/enrich-youtube-metrics.mjs

   DER TEURE WEG UND DER BILLIGE FUEHREN ZUM SELBEN ZIEL

   -------------------------------------------------------------------------
   WARUM DIESER SCHRITT UEBERHAUPT GEHT
   -------------------------------------------------------------------------

   Um zu erfahren, was ein Kanal zuletzt veroeffentlicht hat, gibt es
   zwei Wege:

     TEUER    `search.list` mit `channelId`. Kostet einen von hundert
              Suchaufrufen des Tages - je Kanal.
     BILLIG   `channels.list` liefert die Uploads-Playlist,
              `playlistItems.list` deren letzte Eintraege,
              `videos.list` die oeffentlichen Zahlen dazu. Drei
              Aufrufe, je 1 Einheit, aus einem Topf von 10.000.

   Vor der Quotenkorrektur sahen beide Wege gleich teuer aus - 100
   Einheiten gegen 3. Seit dem 2026-06-01 sind es verschiedene
   WAEHRUNGEN: der eine Weg kostet einen von hundert Plaetzen, der
   andere drei von zehntausend Einheiten. Hundert Kanaele anzureichern
   kostet auf dem billigen Weg 300 Einheiten und KEINEN einzigen
   Suchaufruf.

   Das ist der eigentliche Gewinn der Korrektur: die Anreicherung ist
   praktisch unbegrenzt, und die knappen Suchen bleiben dem
   vorbehalten, was nur eine Suche kann - etwas FINDEN, das wir noch
   nicht kennen.

   -------------------------------------------------------------------------
   WAS GESPEICHERT WIRD
   -------------------------------------------------------------------------

   Muster und Zahlen. Kein Titel, keine Beschreibung, kein Vorschaubild.

   Der Titel wird GELESEN, um den Hook-Archetyp zu bestimmen - genau
   wie eine Instagram-Caption, durch dieselbe Funktion, und er
   verlaesst sie nicht. Ein Feld, das es nicht gibt, kann niemand
   versehentlich fuellen.

   Ausfuehren:
     node scripts/social/enrich-youtube-metrics.mjs              (nur planen)
     YOUTUBE_API_KEY=... node scripts/social/enrich-youtube-metrics.mjs --run
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { grundAus, UNIVERSE_DATEI } from "./discover-creators.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const YouTube = require(join(ROOT, "social/engines/youtube-source.js"));
const Patterns = require(join(ROOT, "social/engines/external-patterns.js"));
const External = require(join(ROOT, "social/engines/external-intelligence.js"));

export const BEOBACHTUNGEN = "social/data/external-observations.json";
const API = "https://www.googleapis.com/youtube/v3";

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/**
 * Welche Kanaele diesmal drankommen — und was das kostet.
 *
 * Gerechnet wird in Einheiten des ALLGEMEINEN Topfes. Suchaufrufe
 * kommen hier nicht vor; das ist die Zusicherung dieses Schritts.
 */
export function planeAnreicherung(options) {
  options = options || {};
  const universum = options.universe ||
    readJson(join(ROOT, UNIVERSE_DATEI), { entries: [] });
  const eintraege = (universum.entries || []).filter(
    (e) => e.platform === "youtube" && e.state !== "RETIRED_NO_PROGRAM_RELEVANCE");

  const jeKanalVideos = options.videosPerChannel === undefined
    ? 5 : options.videosPerChannel;
  const tag = YouTube.tagesplan({
    searches: 0,
    unitsUsedToday: options.unitsUsedToday || 0
  });

  /* Drei Aufrufe je Kanal: Uploads-Playlist finden, Eintraege holen,
     Zahlen holen. Alle drei kosten 1 im allgemeinen Topf. */
  const jeKanal = 3;
  const bezahlbar = Math.floor(tag.general.free / jeKanal);
  const maxProLauf = options.maxChannelsPerRun === undefined
    ? 40 : options.maxChannelsPerRun;

  /* Wer am laengsten nicht angereichert wurde, zuerst. Eine Reihenfolge,
     keine Wertung. */
  const sortiert = eintraege.slice().sort((a, b) => {
    const la = a.lastEnrichedAt ? Date.parse(a.lastEnrichedAt) : 0;
    const lb = b.lastEnrichedAt ? Date.parse(b.lastEnrichedAt) : 0;
    return la - lb;
  });
  const gewaehlt = sortiert.slice(0, Math.min(maxProLauf, bezahlbar));

  return {
    channels: gewaehlt,
    candidates: eintraege.length,
    videosPerChannel: jeKanalVideos,
    unitsPerChannel: jeKanal,
    estimatedUnits: gewaehlt.length * jeKanal,
    /* Woertlich, weil es die Zusicherung dieses Schritts ist. */
    searchCallsUsed: 0,
    withinQuota: gewaehlt.length * jeKanal <= tag.general.free,
    explanation: gewaehlt.length + " von " + eintraege.length +
      " Kanaelen, je " + jeKanal + " Einheiten = " + (gewaehlt.length * jeKanal) +
      " von " + tag.general.free + " freien Einheiten im allgemeinen Topf. " +
      "KEIN Suchaufruf - die hundert des Tages bleiben dem vorbehalten, " +
      "was nur eine Suche kann: etwas finden, das wir noch nicht kennen."
  };
}

/**
 * Aus einem YouTube-Video wird dasselbe Muster wie aus einem
 * Instagram-Beitrag.
 *
 * Bewusst dieselbe Funktion: zwei Abstraktionswege waeren zwei
 * Musterbegriffe, und ein Vergleich zwischen den Plattformen waere
 * dann eine Rechnung ueber zwei verschiedene Dinge.
 *
 * Exportiert, weil die eine Eigenschaft pruefbar sein muss: der Titel
 * geht hinein und kommt nicht heraus.
 */
export function ausVideo(video, kontext) {
  kontext = kontext || {};
  const st = (video && video.statistics) || {};
  const zahl = (v) => (v === undefined || v === null ? null : Number(v));
  const muster = Patterns.ausMedium({
    /* Der Titel in der Rolle der Caption - gelesen, nicht gespeichert. */
    caption: (video && video.snippet && video.snippet.title) || "",
    media_type: "VIDEO",
    like_count: zahl(st.likeCount),
    comments_count: zahl(st.commentCount),
    timestamp: (video && video.snippet && video.snippet.publishedAt) || null
  });

  const o = External.observation({
    observationId: "ytobs_" + ((video && video.id) || Math.random().toString(36).slice(2)),
    sourceId: "youtube.data_api.videos",
    observedAt: kontext.now || null,
    topicCategory: kontext.topicCategory || null,
    hookArchetype: muster.hookArchetype,
    formatPattern: muster.formatPattern,
    visualPattern: muster.visualPattern,
    storyPattern: muster.storyPattern,
    engagementRelative: muster.engagementRelative,
    trendVelocity: null,
    provenance: { platform: "youtube", via: "videos.list",
      creatorId: kontext.creatorId || null,
      discoveredByQuery: kontext.discoveredByQuery || null,
      publishedAt: (video && video.snippet && video.snippet.publishedAt) || null }
  });

  const gueltig = External.validateObservation(o);
  if (!gueltig.ok) return null;

  return Object.assign({}, o, {
    platform: "youtube",
    publishedAt: (video && video.snippet && video.snippet.publishedAt) || null,
    /* Unbekannt bleibt null. Eine Null waere die Aussage "niemand hat
       reagiert" - YouTube laesst Likes und Kommentare abschaltbar, und
       dann fehlt die Zahl, statt null zu sein. */
    publicEngagement: {
      views: zahl(st.viewCount),
      likes: zahl(st.likeCount),
      comments: zahl(st.commentCount)
    }
  });
}

async function ruf(pfad, params, key) {
  const url = new URL(API + pfad);
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  const res = await fetch(url, { headers: { "X-goog-api-key": key } });
  const text = await res.text();
  if (!res.ok) {
    let code = "";
    try { code = (JSON.parse(text).error || {}).status || ""; } catch { /* egal */ }
    throw new Error("YouTube " + pfad + " antwortet HTTP " + res.status +
      (code ? " (" + code + ")" : ""));
  }
  return JSON.parse(text);
}

export async function reichereAn(options) {
  options = options || {};
  const key = options.apiKey || process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { ok: false, state: "AWAITING_OWNER_SOURCE", observations: [],
      explanation: "Kein YOUTUBE_API_KEY. Das ist der offene " +
        "Owner-Schritt und kein Defekt." };
  }
  const plan = options.plan || planeAnreicherung(options);
  const now = options.now || new Date().toISOString();
  const beobachtungen = [];
  const angereichert = [];
  const fehler = [];
  let einheiten = 0;

  for (const kanal of plan.channels) {
    try {
      const k = await ruf("/channels",
        { part: "contentDetails", id: kanal.creatorId }, key);
      einheiten += 1;
      const uploads = (((k.items || [])[0] || {}).contentDetails || {})
        .relatedPlaylists;
      if (!uploads || !uploads.uploads) {
        /* Kein Uploads-Playlist heisst: der Kanal hat nichts
           veroeffentlicht oder verbirgt es. Beides ist NICHT "null
           Beobachtungen" - es ist keine Beobachtung. */
        fehler.push({ creatorId: kanal.creatorId, reason: "noUploadsPlaylist" });
        continue;
      }

      const items = await ruf("/playlistItems",
        { part: "contentDetails", playlistId: uploads.uploads,
          maxResults: String(plan.videosPerChannel) }, key);
      einheiten += 1;
      const ids = ((items.items || [])
        .map((i) => (i.contentDetails || {}).videoId).filter(Boolean));
      if (!ids.length) {
        fehler.push({ creatorId: kanal.creatorId, reason: "noVideos" });
        continue;
      }

      const videos = await ruf("/videos",
        { part: "snippet,statistics", id: ids.join(",") }, key);
      einheiten += 1;

      let gezaehlt = 0;
      for (const v of videos.items || []) {
        const o = ausVideo(v, { now,
          creatorId: kanal.creatorId,
          discoveredByQuery: kanal.discoveredByQuery || null,
          topicCategory: (kanal.topicMapping || [])[0] || null });
        if (o) { beobachtungen.push(o); gezaehlt += 1; }
      }
      angereichert.push({ creatorId: kanal.creatorId, observations: gezaehlt });
    } catch (err) {
      const grund = grundAus(err);
      fehler.push({ creatorId: kanal.creatorId, reason: grund,
        message: String(err.message || err) });
      /* Ein erschoepftes Kontingent trifft alle weiteren genauso -
         weiterzumachen verbraucht nur Einheiten fuer Fehlermeldungen. */
      if (grund === "quotaExceeded" || grund === "keyInvalid") break;
    }
  }

  return { ok: true, observations: beobachtungen, enriched: angereichert,
    failures: fehler, unitsUsed: einheiten, searchCallsUsed: 0,
    explanation: beobachtungen.length + " Muster aus " + angereichert.length +
      " Kanaelen, " + einheiten + " Einheiten verbraucht, 0 Suchaufrufe. " +
      (fehler.length ? fehler.length + " Kanal/Kanaele ohne Ergebnis - als " +
        "Versuch festgehalten, nicht als Null. " : "") +
      "Kein Titel, keine Beschreibung, kein Vorschaubild gespeichert." };
}

export function schreibe(beobachtungen, options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const pfad = join(ROOT, BEOBACHTUNGEN);
  const alt = readJson(pfad, { observations: [] });
  /* Angehaengt, nicht ersetzt: die Zeitreihe IST das Ergebnis. */
  const neu = {
    generatedAt: now,
    usage: "PATTERN_OBSERVATION_ONLY",
    observations: (alt.observations || []).concat(beobachtungen)
  };
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(neu, null, 2) + "\n");
  return { ok: true, path: BEOBACHTUNGEN, total: neu.observations.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const plan = planeAnreicherung({});

  console.log("VISION UNIVERSE SOCIAL — YouTube Metric Enrichment\n");
  console.log(plan.explanation + "\n");

  if (args.includes("--run")) {
    const erg = await reichereAn({ plan });
    console.log(erg.explanation);
    if (!erg.ok) process.exit(0);
    if (erg.observations.length) {
      const w = schreibe(erg.observations, {});
      console.log("Geschrieben: " + w.path + " (" + w.total + " Beobachtungen gesamt)");
    }
  } else if (!plan.channels.length) {
    console.log("Nichts anzureichern - das Creator Watch Universe ist leer. " +
      "Das ist der Zustand vor dem ersten Discovery-Lauf, kein Fehler.");
  } else {
    console.log("Nur geplant. Mit --run und YOUTUBE_API_KEY wird " +
      "tatsaechlich abgerufen.");
  }
}

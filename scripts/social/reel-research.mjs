#!/usr/bin/env node
/* Reel-Recherche auswerten: macht aus dem Datensatz des Apify-Actors `apify/instagram-reel-scraper`
   vergleichbare Kennzahlen, Hook-/Format-Muster und eine kurze Zusammenfassung fuer Claude.

     node scripts/social/reel-research.mjs --in items.json [--out report.json] [--md]

   Rein lokal, kein Netz, keine Kosten. Es werden KEINE fremden Texte weitergegeben: von der Caption
   bleibt nur der Einstieg (Hook, max. 90 Zeichen) als Beleg fuer das Muster. Die Auswertung dient dazu,
   Themen, Einstiegsarten und Formate zu verstehen - nicht dazu, Inhalte zu uebernehmen. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const median = (a) => { const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!v.length) return null;
  const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const round = (x, d = 4) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export function hookOf(caption) {
  const first = String(caption || "").trim().split(/\n/)[0].trim();
  return first.length > 90 ? first.slice(0, 87) + "…" : first;
}

export function hookPattern(hook) {
  const h = String(hook || "");
  if (!h) return "kein-text";
  if (/\?/.test(h)) return "frage";
  if (/^\s*(\d+[.)]?|top\s*\d+|\d+\s+(gründe|fehler|aktien|tipps|dinge))/i.test(h) || /\b\d{1,3}\s?(%|prozent|mrd|mio)\b/i.test(h)) return "zahl";
  if (/^(warum|wieso|weshalb|wie|was|wann|wer)\b/i.test(h)) return "w-frage-aussage";
  if (/\b(nie|niemals|stop|achtung|fehler|warnung|vorsicht|geheimnis)\b/i.test(h)) return "warnung-kontrast";
  return "aussage";
}

export function durationBucket(s) {
  if (!Number.isFinite(s)) return "unbekannt";
  if (s < 15) return "<15s"; if (s < 30) return "15-30s"; if (s < 60) return "30-60s"; return "60s+";
}

export function normalize(item, now = Date.now()) {
  const plays = [item.videoPlayCount, item.videoViewCount].find((x) => Number.isFinite(x) && x > 0) ?? null;
  const likes = Number.isFinite(item.likesCount) && item.likesCount >= 0 ? item.likesCount : null;   // -1 = ausgeblendet
  const comments = Number.isFinite(item.commentsCount) && item.commentsCount >= 0 ? item.commentsCount : null;
  const ts = Date.parse(item.timestamp);
  const hook = hookOf(item.caption);
  const ageDays = Number.isFinite(ts) ? Math.max(0.5, (now - ts) / 86400000) : null;
  return {
    id: item.shortCode || item.id || null, url: item.url || null, owner: item.ownerUsername || null,
    postedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
    weekdayUtc: Number.isFinite(ts) ? new Date(ts).getUTCDay() : null, hourUtc: Number.isFinite(ts) ? new Date(ts).getUTCHours() : null,
    plays, likes, comments, durationSec: Number.isFinite(item.videoDuration) ? item.videoDuration : null,
    hook, hookPattern: hookPattern(hook), hashtags: Array.isArray(item.hashtags) ? item.hashtags.length : 0,
    captionLength: String(item.caption || "").length, pinned: item.isPinned === true,
    audio: item.musicInfo ? (item.musicInfo.uses_original_audio ? "original" : (item.musicInfo.song_name ? "lizenziert" : null)) : null,
    ageDays: round(ageDays, 1),
    engagementRate: plays && likes !== null ? round((likes + (comments || 0)) / plays) : null,
    commentsPer1kPlays: plays && comments !== null ? round(comments / plays * 1000, 2) : null,
    playsPerDay: plays && ageDays ? Math.round(plays / ageDays) : null
  };
}

export function analyse(items, options = {}) {
  const now = options.now || Date.now();
  const reels = (items || []).filter((i) => i && !i.error && (i.shortCode || i.id)).map((i) => normalize(i, now));
  const byOwner = {};
  for (const r of reels) (byOwner[r.owner || "?"] = byOwner[r.owner || "?"] || []).push(r);
  for (const [, list] of Object.entries(byOwner)) {
    const base = list.length >= 3 ? median(list.map((r) => r.plays)) : null;
    for (const r of list) r.outlierFactor = base && r.plays ? round(r.plays / base, 2) : null;   // Vielfaches des eigenen Mittelwerts
  }
  const gruppe = (key) => {
    const g = {};
    for (const r of reels) (g[r[key]] = g[r[key]] || []).push(r);
    return Object.entries(g).map(([name, list]) => ({ name, n: list.length,
      medianOutlier: round(median(list.map((r) => r.outlierFactor)), 2),
      medianEngagement: round(median(list.map((r) => r.engagementRate))),
      medianPlays: median(list.map((r) => r.plays)) })).sort((a, b) => (b.medianOutlier ?? -1) - (a.medianOutlier ?? -1));
  };
  for (const r of reels) r.durationBucket = durationBucket(r.durationSec);
  const n = reels.length;
  const vertrauen = n >= 30 ? "belastbar" : n >= 10 ? "grob" : "nur-beschreibend";
  return {
    n, vertrauen,
    hinweis: n < 10 ? "Zu wenige Reels fuer Vergleiche zwischen Mustern: Die Gruppen unten sind Beispiele, keine Aussagen." : null,
    medianPlays: median(reels.map((r) => r.plays)), medianEngagementRate: round(median(reels.map((r) => r.engagementRate))),
    top: [...reels].sort((a, b) => (b.outlierFactor ?? -1) - (a.outlierFactor ?? -1) || (b.plays ?? 0) - (a.plays ?? 0)).slice(0, 5)
      .map((r) => ({ url: r.url, owner: r.owner, plays: r.plays, outlierFactor: r.outlierFactor, engagementRate: r.engagementRate,
        durationSec: r.durationSec, hook: r.hook, hookPattern: r.hookPattern })),
    nachHookMuster: gruppe("hookPattern"), nachDauer: gruppe("durationBucket"), reels
  };
}

export function toMarkdown(a) {
  const L = [`# Reel-Recherche (${a.n} Reels, Aussagekraft: ${a.vertrauen})`];
  if (a.hinweis) L.push(`> ${a.hinweis}`);
  L.push(`Median Aufrufe: ${a.medianPlays ?? "—"} · Median Engagement-Rate: ${a.medianEngagementRate ?? "—"}`);
  L.push("", "## Spitzenreiter (Vielfaches des eigenen Profil-Medians)");
  for (const t of a.top) L.push(`- ${t.outlierFactor ?? "—"}× · ${t.plays ?? "—"} Aufrufe · ER ${t.engagementRate ?? "—"} · ${t.durationSec ?? "—"} s · ${t.hookPattern} · „${t.hook}“ — ${t.url}`);
  L.push("", "## Nach Einstiegsmuster");
  for (const g of a.nachHookMuster) L.push(`- ${g.name}: n=${g.n}, Median ${g.medianOutlier ?? "—"}×, ER ${g.medianEngagement ?? "—"}`);
  L.push("", "## Nach Dauer");
  for (const g of a.nachDauer) L.push(`- ${g.name}: n=${g.n}, Median ${g.medianOutlier ?? "—"}×, ER ${g.medianEngagement ?? "—"}`);
  return L.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  if (!opt("--in")) { console.error("Aufruf: reel-research.mjs --in items.json [--out report.json] [--md]"); process.exit(2); }
  const data = JSON.parse(readFileSync(opt("--in"), "utf8"));
  const report = analyse(Array.isArray(data) ? data : (data.items || []));
  if (opt("--out")) writeFileSync(opt("--out"), JSON.stringify(report, null, 2));
  console.log(argv.includes("--md") ? toMarkdown(report) : JSON.stringify(report, null, 2));
}

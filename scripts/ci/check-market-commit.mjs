#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — check-market-commit.mjs

   FRUEHWARNUNG: HAT DER MARKTDATEN-REFRESH DER LETZTEN SITZUNG VEROEFFENTLICHT?

   24.11.2026 (Lauf 45501514352): Der Abgleich der dauerhaften Ablage hing,
   Kurse und Faktoren kamen nicht auf main, Briefing und Screener standen auf
   dem Vortag. Ein haengender Lauf meldet nichts, solange er laeuft; die
   Pruefung fragt deshalb von aussen (Monitor, Wecker 00:35 UTC Di-Sa).

   Entscheidung (kein Boersenkalender noetig - ein beendeter Lauf zaehlt):
     gruen   der juengste Lauf von market-data-refresh.yml auf main seit dem
             Abendtakt ist beendet und success (an Feiertagen ohne Commit)
             ODER ein Commit "Marktdaten-Refresh:" liegt seit dem Start vor
     rot     kein Lauf seit dem Abendtakt (Wecker ausgefallen)
             Lauf beendet, aber nicht success
             Lauf laeuft noch und hat noch keinen Commit

   Eingaben: GITHUB_TOKEN, GITHUB_REPOSITORY (+ GITHUB_API_URL), JETZT
   (ISO, Tests), --out <Datei> fuer den Befundtext.
   Ausgabe: GITHUB_OUTPUT `ergebnis=success|failure`. Exit 0 immer: der
   Alarm ist der Bote (pipeline-alarm.mjs), nicht diese Pruefung.
   ========================================================================= */
import { appendFileSync, writeFileSync } from "node:fs";

const TAKT_STUNDE = 22, TAKT_MINUTE = 30;

/** Beginn des letzten Abendtakts (22:30 UTC) vor `jetzt`. */
export function abendtakt(jetzt) {
  const t = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate(), TAKT_STUNDE, TAKT_MINUTE));
  if (t.getTime() > jetzt.getTime()) t.setUTCDate(t.getUTCDate() - 1);
  return t;
}

/** runs: Laeufe von market-data-refresh.yml auf main (neueste zuerst); commits: Commits auf main seit dem Takt. */
export function beurteilen({ jetzt, runs, commits }) {
  const ab = abendtakt(jetzt);
  const seit = new Date(ab.getTime() - 5 * 60 * 1000);
  const lauf = (runs || []).find((r) => new Date(r.created_at) >= seit && r.event === "workflow_dispatch");
  if (!lauf) return { ergebnis: "failure", grund: `Kein Lauf von market-data-refresh.yml auf main seit ${ab.toISOString()} (Wecker ausgefallen?).` };
  const commit = (commits || []).find((c) => /^Marktdaten-Refresh:/.test((c.commit && c.commit.message) || "") &&
    new Date(c.commit.committer.date) >= new Date(lauf.created_at));
  const url = lauf.html_url;
  if (lauf.status === "completed") {
    if (lauf.conclusion === "success") return { ergebnis: "success", grund: `Lauf ${url} beendet (success).` };
    return { ergebnis: "failure", grund: `Lauf ${url} beendet mit ${lauf.conclusion}${commit ? ", die Kurse sind aber veroeffentlicht" : ", ohne Marktdaten-Commit"}.` };
  }
  if (commit) return { ergebnis: "success", grund: `Lauf ${url} laeuft noch, Marktdaten-Commit liegt vor (${commit.sha.slice(0, 9)}).` };
  const min = Math.round((jetzt - new Date(lauf.created_at)) / 60000);
  return { ergebnis: "failure", grund: `Lauf ${url} laeuft seit ${min} min (Status ${lauf.status}) und hat keinen Marktdaten-Commit auf main.` };
}

async function api(pfad) {
  const base = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  const res = await fetch(base + pfad, { headers: { authorization: "Bearer " + process.env.GITHUB_TOKEN,
    accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`GET ${pfad}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const jetzt = process.env.JETZT ? new Date(process.env.JETZT) : new Date();
  const repo = process.env.GITHUB_REPOSITORY;
  const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
  let urteil;
  try {
    const seit = new Date(abendtakt(jetzt).getTime() - 5 * 60 * 1000).toISOString();
    const runs = (await api(`/repos/${repo}/actions/workflows/market-data-refresh.yml/runs?branch=main&per_page=20`)).workflow_runs;
    const commits = await api(`/repos/${repo}/commits?sha=main&since=${encodeURIComponent(seit)}&per_page=100`);
    urteil = beurteilen({ jetzt, runs, commits });
  } catch (err) {
    urteil = { ergebnis: "failure", grund: "Pruefung nicht moeglich: " + String(err.message).slice(0, 200) };
  }
  console.log(`${urteil.ergebnis}: ${urteil.grund}`);
  if (out) writeFileSync(out, urteil.grund + "\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ergebnis=${urteil.ergebnis}\n`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) await main();

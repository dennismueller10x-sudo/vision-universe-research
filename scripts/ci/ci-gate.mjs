#!/usr/bin/env node
/* ci-gate: Sammel-Check ueber alle Workflow-Laeufe eines PR-Commits (Merge bei Gruen, RUNBOOK §14).
   Laeuft bei jedem PR, wartet auf alle anderen Workflow-Laeufe desselben Commits (auch noch wartende, die
   keine Jobs haben) und fasst sie zusammen. Pfadfilter-Workflows, die nicht starten, stehen nie in der Liste;
   uebersprungene Laeufe (skipped/neutral) zaehlen als bestanden.
   Eingabe nur ueber env: GITHUB_REPOSITORY, GH_TOKEN, GATE_SHA. Reine Entscheidung: evaluate() (getestet). */
const SELF = "ci-gate"; // Name des eigenen Workflows (ci-gate.yml)
const BAD = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);

/** runs: Workflow-Laeufe[] (name, status, conclusion). Liefert {state: wait|pass|fail, offen, rot}. */
export function evaluate(runs) {
  // Nur Actions-Workflowlaeufe: externe Checks (Vercel, Cloudflare Pages) haben eigene Ausfaelle und zaehlen nicht.
  // Je Name zaehlt nur der neueste Lauf (hoechste id): ein durch Concurrency abgebrochener Altlauf desselben Commits
  // oder ein Wiederholungslauf (ci-retry) ersetzt den alten Stand.
  const latest = new Map();
  for (const r of runs) { const k = r.name; if (!latest.has(k) || (r.id ?? 0) > (latest.get(k).id ?? 0)) latest.set(k, r); }
  runs = [...latest.values()];
  const others = runs.filter((r) => r.name !== SELF);
  const offen = others.filter((r) => r.status !== "completed").map((r) => r.name);
  const rot = others.filter((r) => r.status === "completed" && BAD.has(r.conclusion)).map((r) => `${r.name} (${r.conclusion})`);
  if (offen.length) return { state: "wait", offen, rot };
  if (rot.length) return { state: "fail", offen, rot };
  return { state: "pass", offen, rot, anzahl: others.length };
}

/** Workflow-Laeufe des PR-Commits. Ein noch wartender Lauf (queued) hat noch keine Jobs/Check-Runs: nur der Lauf selbst zeigt ihn. */
/* Sparsam mit dem Token-Limit (22.11.2026): die erste Seite wird bedingt abgefragt (ETag/If-None-Match); ein 304 zaehlt nicht
   gegen das Limit und liefert den Stand der letzten Antwort. Mehr als 100 Laeufe pro Commit sind selten, dann folgen Seiten wie bisher. */
const erste = { etag: null, runs: null };
export class RateLimited extends Error { constructor(wait) { super("rate limited"); this.wait = wait; } }
async function fetchRuns(repo, sha, token) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
    if (page === 1 && erste.etag) headers["if-none-match"] = erste.etag;
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100&page=${page}`, { headers });
    if (page === 1 && r.status === 304 && erste.runs) { out.push(...erste.runs); if (erste.runs.length < 100) break; continue; }
    if (r.status === 429 || (r.status === 403 && (r.headers.get("retry-after") || r.headers.get("x-ratelimit-remaining") === "0"))) {
      const ra = Number(r.headers.get("retry-after")), reset = Number(r.headers.get("x-ratelimit-reset"));
      throw new RateLimited(Math.min(600, ra > 0 ? ra : reset > 0 ? Math.max(30, reset - Math.floor(Date.now() / 1000) + 2) : 60));
    }
    if (!r.ok) throw new Error(`runs ${r.status}`);
    const j = await r.json();
    if (page === 1) { erste.etag = r.headers.get("etag"); erste.runs = j.workflow_runs; }
    out.push(...j.workflow_runs);
    if (j.workflow_runs.length < 100) break;
  }
  return out;
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GH_TOKEN: token, GATE_SHA: sha } = process.env;
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const limit = Date.now() + 80 * 60 * 1000;
  await sleep(Number(process.env.GATE_GRACE_S || 75)); // Workflows brauchen einige Sekunden, bis ihre Checks erscheinen
  let failSeenAt = null;
  let last = "";
  let takt = 20; // Sekunden; waechst auf 60, solange sich der Stand nicht aendert
  for (;;) {
    let res;
    try { res = evaluate(await fetchRuns(repo, sha, token)); }
    catch (e) {
      const wait = e instanceof RateLimited ? e.wait : 20;
      console.log(e instanceof RateLimited ? `Limit erreicht, warte ${wait}s` : `API-Fehler: ${e.message}, neuer Versuch`);
      if (Date.now() > limit) { console.log("ci-gate: Zeitlimit"); return 1; }
      await sleep(wait); continue;
    }
    if (res.state === "pass") { console.log(`ci-gate: ${res.anzahl} Pruefungen bestanden`); return 0; }
    if (res.state === "fail") {
      // Kurze Gnadenfrist: der Infrastruktur-Retry (ci-retry.yml) startet rote Jobs binnen Sekunden neu.
      failSeenAt ??= Date.now();
      if (Date.now() - failSeenAt > 4 * 60 * 1000) { console.log(`ci-gate ROT: ${res.rot.join(", ")}`); return 1; }
    } else failSeenAt = null;
    const line = `${res.state}: offen=${res.offen.length} rot=${res.rot.length}`;
    if (line !== last) { console.log(line, res.offen.slice(0, 8).join(", ")); last = line; takt = 20; }
    else takt = Math.min(60, Math.round(takt * 1.5));
    if (Date.now() > limit) { console.log("ci-gate: Zeitlimit"); return 1; }
    await sleep(takt);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c));

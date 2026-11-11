#!/usr/bin/env node
/* Infrastruktur-Retry: genau ein rerun-failed-jobs, wenn ein roter Job an bekannten
   Infrastruktur-Signaturen scheitert (DNS, Spiegel, Netz). Echte Testfehler bleiben rot.
   Eingabe nur ueber env: GITHUB_REPOSITORY, GH_TOKEN, RUN_ID, RUN_ATTEMPT. */
export const SIGNATUREN = [
  /Temporary failure resolving/i,
  /Could not resolve host/i,
  /Failed to fetch .*(archive\.ubuntu|azure\.archive)/i,
  /E: Unable to locate package/i,
  /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND registry\.npmjs/i,
  /socket hang up/i,
  /RPC failed; curl \d+|early EOF|The remote end hung up unexpectedly/i,
  /Unable to (?:download|access) .*(?:github\.com|actions)/i,
  /The runner has received a shutdown signal|lost communication with the server|runner.*(?:lost|OOM)/i,
  /Download failed|Failed to download|browserType\.launch.*(?:ENOTFOUND|ETIMEDOUT)/i,
  /429 Too Many Requests|502 Bad Gateway|503 Service Unavailable/i,
];
export const istInfrastruktur = (log) => SIGNATUREN.some((r) => r.test(log));

async function api(path, token, init = {}) {
  return fetch(`https://api.github.com${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", ...(init.headers || {}) }, redirect: "follow" });
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GH_TOKEN: token, RUN_ID: runId, RUN_ATTEMPT: attempt } = process.env;
  if (Number(attempt) > 1) { console.log("Schon ein Wiederholungslauf: kein weiterer Retry."); return 0; }
  const jobs = (await (await api(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, token)).json()).jobs || [];
  const rote = jobs.filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out");
  if (!rote.length) { console.log("Kein roter Job."); return 0; }
  for (const j of rote) {
    const r = await api(`/repos/${repo}/actions/jobs/${j.id}/logs`, token);
    const log = r.ok ? await r.text() : "";
    const failedStep = (j.steps || []).find((s) => s.conclusion === "failure");
    // Ein Job ohne lesbares Log, aber mit rotem Setup-Schritt (vor dem eigentlichen Test), gilt als Infrastruktur.
    const setup = failedStep && /^(Set up job|Initialize containers|Run actions\/checkout|Post )/i.test(failedStep.name);
    if (!istInfrastruktur(log) && !(log === "" && setup)) { console.log(`Job "${j.name}": echter Fehler, kein Retry.`); return 0; }
    console.log(`Job "${j.name}": Infrastruktur-Signatur.`);
  }
  const r = await api(`/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`, token, { method: "POST" });
  console.log(`rerun-failed-jobs: HTTP ${r.status}`);
  return r.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c));

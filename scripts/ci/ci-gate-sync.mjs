#!/usr/bin/env node
/* ci-gate-sync: ereignisgesteuerter Sammel-Check (Merge bei Gruen, RUNBOOK §14).

   WARUM (Steuerung 22.11.2026): Der bisherige ci-gate-Job (ci-gate.mjs) belegt einen Runner, solange er auf die anderen Pruefungen
   wartet (bis 85 min, je PR-Push): am 22.11. 20:00-22:45 UTC 296 von 1.250 Runner-Minuten (24 %), nur zum Warten, bei 144 wartenden
   Jobs und 20 laufenden. Hier wartet kein Job. Dieses Skript laeuft kurz:
     - mode "start":  beim PR-Ereignis, nach einer Gnadenfrist (Workflows brauchen Sekunden, bis ihre Laeufe erscheinen). Legt den
                      Check an (in_progress) oder entscheidet, wenn alles schon fertig ist (z. B. reiner Doku-PR ohne weitere Pruefung).
     - mode "event":  bei jedem Abschluss eines PR-Workflows (workflow_run). Liest die Laeufe des Commits, setzt den Check.
   Es ist dieselbe Entscheidung wie zuvor (evaluate() aus ci-gate.mjs: je Name zaehlt der neueste Lauf, skipped/neutral gelten als
   bestanden, offen = wartet, rot = faellt), nur ohne Schleife.

   FAIL-CLOSED: Gruen wird nur gesetzt, wenn zum Zeitpunkt der Entscheidung ALLE Actions-Laeufe dieses Commits (Ereignis pull_request)
   abgeschlossen und keiner rot ist. Nie gruen: bei API-Fehler (der Check bleibt, wie er war), ohne jeden Lauf ausserhalb des
   Start-Modus, vor Ablauf der Gnadenfrist. Ein Check, der nie entschieden wird, bleibt in_progress und blockiert das Mergen.
   Rot: nach einer Gnadenfrist fuer den Infrastruktur-Retry (ci-retry.yml startet rote Jobs binnen Sekunden neu): das Skript wartet
   dann einmal bis zum Ende der Frist (nur im roten Fall, hoechstens 4 min) und liest erneut.
   Eingabe nur ueber env: GITHUB_REPOSITORY, GH_TOKEN, GATE_SHA, GATE_MODE (start|event), GATE_NAME (Check-Name), RUN_URL,
   GATE_GRACE_S (start), GATE_SHADOW (1: Fehler beenden den Job nie rot). Reine Entscheidung: entscheide() (getestet). */
import { evaluate, RateLimited } from "./ci-gate.mjs";

/** Eigene Workflows des Gates: zaehlen nie als "andere Pruefung" (der alte wartet, der neue ist kurz). */
export const EIGENE = new Set(["ci-gate", "ci-gate-neu"]);
export const GRACE_MS = 90 * 1000; // frueheste Entscheidung nach dem ersten erschienenen Lauf
export const ROT_GRACE_MS = 4 * 60 * 1000; // wie bisher: ci-retry startet rote Jobs binnen Sekunden neu

const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : NaN; };

/**
 * @param runs   Workflow-Laeufe[] {id,name,status,conclusion,created_at,updated_at}
 * @param nowMs  Zeitpunkt der Entscheidung
 * @param mode   "start" (nach der Gnadenfrist, ein leerer Commit ist ein Doku-PR) oder "event" (nach einem Abschluss)
 * @param rotFrist  true: ein roter Lauf juenger als ROT_GRACE_MS wird noch nicht endgueltig (Retry koennte folgen)
 * @returns {aktion, status, conclusion, title, summary, abwartenMs?}
 *   aktion: "gruen" | "rot" | "offen" | "rotAbwarten"
 */
export function entscheide({ runs, nowMs, mode, rotFrist = true }) {
  const andere = (runs || []).filter((r) => !EIGENE.has(r.name));
  const res = evaluate(andere);
  const offen = (n) => ({ aktion: "offen", status: "in_progress", conclusion: null,
    title: `Wartet: ${n}`, summary: `Offen: ${res.offen.slice(0, 12).join(", ") || "-"}${res.rot.length ? `\nRot (Retry moeglich): ${res.rot.join(", ")}` : ""}` });
  if (res.state === "wait") return offen(`${res.offen.length} Pruefung(en) offen`);
  if (res.state === "fail") {
    const rotAm = Math.max(...andere.filter((r) => res.rot.some((x) => x.startsWith(r.name + " "))).map((r) => ms(r.updated_at) || 0));
    const alter = nowMs - rotAm;
    if (rotFrist && Number.isFinite(alter) && alter < ROT_GRACE_MS) {
      return { aktion: "rotAbwarten", status: "in_progress", conclusion: null, abwartenMs: ROT_GRACE_MS - alter + 5000,
        title: "Rot gesehen, warte auf Infrastruktur-Retry", summary: `Rot: ${res.rot.join(", ")}` };
    }
    return { aktion: "rot", status: "completed", conclusion: "failure", title: `Rot: ${res.rot.length} Pruefung(en)`, summary: `Rot: ${res.rot.join(", ")}` };
  }
  // pass
  const names = new Set(andere.map((r) => r.name));
  if (names.size === 0 && mode !== "start") return offen("keine Pruefung gefunden");
  if (names.size > 0 && mode !== "start") {
    const erster = Math.min(...andere.map((r) => ms(r.created_at)).filter(Number.isFinite));
    if (Number.isFinite(erster) && nowMs - erster < GRACE_MS) return offen("Gnadenfrist (weitere Laeufe koennen noch erscheinen)");
  }
  return { aktion: "gruen", status: "completed", conclusion: "success", title: `${names.size} Pruefung(en) bestanden`,
    summary: names.size ? `Bestanden: ${[...names].sort().slice(0, 25).join(", ")}` : "Keine weitere Pruefung ausgeloest (reiner Doku-PR)." };
}

/** Check-Run des Gates anlegen oder aktualisieren. api: {get(path), send(method, path, body)}.
    Nur eigene API-Checks werden aktualisiert: der Check-Run eines Actions-JOBS (details_url ".../job/<id>", z. B. vom frueheren wartenden
    ci-gate-Job) laesst sich mit dem Workflow-Token nicht aendern (403, 23.11.2026, #2312). Den ueberspringen wir, und scheitert das
    Aendern trotzdem (403/404/422), entsteht ein neuer Check-Run: "latest" und wait-gate.sh nehmen den mit der hoechsten ID. Fail-closed
    bleibt, denn ein neuer Check traegt nur dann success, wenn entscheide() gruen sagt. */
export async function setzeCheck({ api, repo, sha, name, entscheidung, detailsUrl }) {
  const liste = await api.get(`/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&filter=latest&per_page=10`);
  const eigene = (liste.check_runs || []).filter((c) => c.name === name && (!c.app || c.app.slug === "github-actions") && !/\/job\/\d+/.test(c.details_url || ""));
  const vorhanden = eigene.sort((a, b) => b.id - a.id)[0];
  const body = { name, head_sha: sha, status: entscheidung.status, output: { title: entscheidung.title.slice(0, 250), summary: entscheidung.summary.slice(0, 60000) } };
  if (detailsUrl) body.details_url = detailsUrl;
  if (entscheidung.status === "completed") body.conclusion = entscheidung.conclusion;
  // Ein abgeschlossener Check wird nicht auf in_progress zurueckgesetzt (die API erlaubt es nicht verlaesslich): neuer Eintrag, "latest" gilt.
  if (vorhanden && !(vorhanden.status === "completed" && entscheidung.status !== "completed")) {
    try { return await api.send("PATCH", `/repos/${repo}/check-runs/${vorhanden.id}`, body); }
    catch (e) { if (!/^(403|404|422) /.test(String(e.message))) throw e; }
  }
  return api.send("POST", `/repos/${repo}/check-runs`, body);
}

/** Actions-Laeufe des PR-Commits (Ereignis pull_request), wie ci-gate.mjs. */
export async function holeLaeufe(api, repo, sha) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const j = await api.get(`/repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100&page=${page}`);
    out.push(...(j.workflow_runs || []));
    if ((j.workflow_runs || []).length < 100) break;
  }
  return out;
}

export function apiClient(token) {
  const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" };
  const pruefe = async (r) => {
    if (r.status === 429 || (r.status === 403 && (r.headers.get("retry-after") || r.headers.get("x-ratelimit-remaining") === "0"))) {
      throw new RateLimited(Number(r.headers.get("retry-after")) || 60);
    }
    if (!r.ok) throw new Error(`${r.status} ${r.url.replace(/\?.*/, "")}`);
    return r.status === 204 ? {} : r.json();
  };
  return {
    get: async (path) => pruefe(await fetch(`https://api.github.com${path}`, { headers: h })),
    send: async (method, path, body) => pruefe(await fetch(`https://api.github.com${path}`, { method, headers: h, body: JSON.stringify(body) })),
  };
}

/** Ein Durchlauf: lesen, entscheiden (bei Rot mit Gnadenfrist einmal nachlesen), Check setzen. */
export async function sync({ api, repo, sha, name, mode, detailsUrl, jetzt = () => Date.now(), schlafen = (ms_) => new Promise((r) => setTimeout(r, ms_)), log = console.log }) {
  let e = entscheide({ runs: await holeLaeufe(api, repo, sha), nowMs: jetzt(), mode });
  if (e.aktion === "rotAbwarten") {
    log(`${name}: rot gesehen, warte ${Math.round(e.abwartenMs / 1000)} s auf einen Infrastruktur-Retry`);
    await setzeCheck({ api, repo, sha, name, entscheidung: e, detailsUrl });
    await schlafen(e.abwartenMs);
    e = entscheide({ runs: await holeLaeufe(api, repo, sha), nowMs: jetzt(), mode, rotFrist: false });
  }
  await setzeCheck({ api, repo, sha, name, entscheidung: e, detailsUrl });
  log(`${name}: ${e.aktion} (${e.title})`);
  return e;
}

async function main() {
  const { GITHUB_REPOSITORY: repo, GH_TOKEN: token, GATE_SHA: sha, GATE_MODE: mode = "event", GATE_NAME: name = "ci-gate", RUN_URL: detailsUrl } = process.env;
  const schatten = process.env.GATE_SHADOW === "1";
  if (!repo || !token || !/^[0-9a-f]{40}$/.test(sha || "") || !["start", "event"].includes(mode)) { console.error("ci-gate-sync: Eingabe unvollstaendig"); return schatten ? 0 : 2; }
  if (mode === "start") await new Promise((r) => setTimeout(r, Number(process.env.GATE_GRACE_S ?? 90) * 1000));
  try { await sync({ api: apiClient(token), repo, sha, name, mode, detailsUrl }); return 0; }
  catch (e) { console.error(`ci-gate-sync: ${e.message} (der Check bleibt, wie er war: nie gruen ohne Entscheidung)`); return schatten ? 0 : 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c));

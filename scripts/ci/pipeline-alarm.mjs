#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — pipeline-alarm.mjs

   EIN FEHLGESCHLAGENER DATENLAUF BLEIBT NICHT UNBEMERKT.

   15.09.-12.10.2026: 13 von 19 geplanten Marktdaten-Laeufen ohne
   Veroeffentlichung, Discover stand bis zu drei Sitzungen auf altem Stand.
   Gemeldet hat das nur die rote Farbe in der Actions-Liste, die niemand
   ansah. Dieses Skript macht daraus ein Issue, das Benachrichtigungen
   ausloest und offen bleibt, bis ein gruener Lauf es schliesst:

     rot    ein Issue "[<Quelle>] ..." mit Label `pipeline-alarm` oeffnen
            oder, wenn es schon offen ist, um diesen Lauf ergaenzen:
            Lauf, fehlgeschlagene Jobs und Schritte, rote Tests der Gates.
     gruen  ein offenes Issue dieser Quelle mit Verweis schliessen.

   Eingaben (Umgebung):
     ALARM_SOURCE       Kennung der Quelle, z. B. market-data-refresh
     ALARM_TITLE        Ueberschrift (optional)
     RESULT_<NAME>      Ergebnis je Job (success|failure|cancelled|skipped)
     GATE_DIR           Verzeichnis mit gate-*.json (run-eod-publish-gates --report)
     ALARM_DETAIL_FILE  Text, der unveraendert in den Bericht kommt (optional)
     GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL,
     GITHUB_API_URL     von Actions gesetzt
     ALARM_DRY_RUN=1    nichts schreiben, nur ausgeben (Tests, lokal)

   Exit 0 auch bei rotem Ergebnis: der Alarm ist der Bote, nicht der
   Befund. Exit 1 nur, wenn der Alarm selbst nicht zugestellt werden kann.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
const LABEL = "pipeline-alarm";
const ROT = new Set(["failure", "cancelled", "timed_out"]);

export function auswerten(vars) {
  const ergebnisse = Object.entries(vars)
    .filter(([k]) => k.startsWith("RESULT_"))
    .map(([k, v]) => ({ job: k.slice(7).toLowerCase(), result: String(v || "").trim() }))
    .filter((e) => e.result);
  const rot = ergebnisse.filter((e) => ROT.has(e.result));
  const gruen = !rot.length && ergebnisse.some((e) => e.result === "success");
  return { ergebnisse, rot, zustand: rot.length ? "rot" : gruen ? "gruen" : "unbestimmt" };
}

export function gateBerichte(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^gate-.*\.json$/.test(n)).sort().map((n) => {
    try { return JSON.parse(readFileSync(join(dir, n), "utf8")); } catch { return null; }
  }).filter(Boolean);
}

export function bericht({ quelle, auswertung, gates, schritte, detail, laufUrl, jetzt }) {
  const z = [];
  z.push(`**${auswertung.zustand === "rot" ? "ROT" : "GRUEN"}** · ${quelle} · Lauf ${laufUrl} · ${jetzt}`);
  z.push("");
  z.push("| Job | Ergebnis |", "|---|---|");
  for (const e of auswertung.ergebnisse) z.push(`| ${e.job} | ${e.result} |`);
  if (schritte.length) {
    z.push("", "Fehlgeschlagene Schritte:");
    for (const s of schritte) z.push(`- ${s.job} › ${s.step}`);
  }
  for (const g of gates) {
    if (!g.red && !(g.failures || []).length) continue;
    z.push("", `${g.class} (${g.blocking ? "blockierend" : "nicht blockierend"}): bestanden ${g.passed}, fehlgeschlagen ${g.failed}`);
    for (const f of (g.failures || []).slice(0, 25)) z.push(`- ${f.name}${f.location ? " (`" + f.location + "`)" : ""}`);
  }
  if (detail) z.push("", "```", detail.trim().slice(0, 6000), "```");
  return z.join("\n");
}

async function api(method, pfad, body) {
  const base = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  const res = await fetch(base + pfad, {
    method,
    headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json",
               "content-type": "application/json", "x-github-api-version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  const quelle = env.ALARM_SOURCE || "pipeline";
  const repo = env.GITHUB_REPOSITORY || "";
  const laufUrl = `${env.GITHUB_SERVER_URL || "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID || "?"}`;
  const auswertung = auswerten(env);
  const gates = gateBerichte(env.GATE_DIR);
  const detail = env.ALARM_DETAIL_FILE && existsSync(env.ALARM_DETAIL_FILE) ? readFileSync(env.ALARM_DETAIL_FILE, "utf8") : null;
  const trocken = env.ALARM_DRY_RUN === "1" || !env.GITHUB_TOKEN;
  const marke = `[${quelle}]`;
  const titel = `${marke} ${env.ALARM_TITLE || "Datenlauf fehlgeschlagen"}`;
  const beob = gates.filter((g) => !g.blocking && g.red);

  let schritte = [];
  if (!trocken && auswertung.zustand === "rot" && env.GITHUB_RUN_ID) {
    const jobs = await api("GET", `/repos/${repo}/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`);
    for (const j of (jobs.json && jobs.json.jobs) || []) {
      if (!ROT.has(j.conclusion)) continue;
      const s = (j.steps || []).filter((x) => ROT.has(x.conclusion));
      if (!s.length) schritte.push({ job: j.name, step: "(Job)" });
      for (const x of s) schritte.push({ job: j.name, step: x.name });
    }
  }
  const text = bericht({ quelle, auswertung, gates, schritte, detail, laufUrl, jetzt: new Date().toISOString() });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, "\n### Pipeline-Alarm\n\n" + text + "\n");
  console.log(text);

  const plan = [];
  if (trocken) {
    plan.push({ zustand: auswertung.zustand, titel, beobachtung: beob.length > 0 });
    console.log("ALARM_PLAN " + JSON.stringify(plan));
    return;
  }

  const offen = await api("GET", `/repos/${repo}/issues?state=open&labels=${LABEL}&per_page=100`);
  if (!offen.ok) throw new Error("Issues nicht lesbar: HTTP " + offen.status);
  const finde = (m) => (offen.json || []).find((i) => !i.pull_request && String(i.title).startsWith(m));
  const label = async () => { await api("POST", `/repos/${repo}/labels`, { name: LABEL, color: "d73a4a", description: "Automatischer Alarm: Datenpipeline rot oder veraltet" }); };

  async function melden(m, t, body) {
    const issue = finde(m);
    if (issue) {
      const r = await api("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body });
      if (!r.ok) throw new Error("Kommentar fehlgeschlagen: HTTP " + r.status);
      console.log(`Alarm ergaenzt: #${issue.number}`);
    } else {
      await label();
      const r = await api("POST", `/repos/${repo}/issues`, { title: t, labels: [LABEL],
        body: body + "\n\nDieses Issue schliesst der naechste gruene Lauf automatisch (scripts/ci/pipeline-alarm.mjs)." });
      if (!r.ok) throw new Error("Issue nicht angelegt: HTTP " + r.status);
      console.log(`Alarm geoeffnet: #${r.json && r.json.number}`);
    }
  }
  async function schliessen(m, body) {
    const issue = finde(m);
    if (!issue) return;
    await api("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body });
    const r = await api("PATCH", `/repos/${repo}/issues/${issue.number}`, { state: "closed", state_reason: "completed" });
    if (!r.ok) throw new Error("Schliessen fehlgeschlagen: HTTP " + r.status);
    console.log(`Alarm geschlossen: #${issue.number}`);
  }

  if (auswertung.zustand === "rot") await melden(marke, titel, text);
  else if (auswertung.zustand === "gruen") await schliessen(marke, `Behoben: gruener Lauf ${laufUrl}`);

  /* Nicht blockierende Befunde: eigenes Issue, damit sie den Hauptalarm
     nicht offen halten und trotzdem jemand sie sieht. */
  const bm = `[${quelle} · Beobachtung]`;
  if (beob.length) await melden(bm, `${bm} Tests nach der Veroeffentlichung rot (nicht blockierend)`, text);
  else if (gates.some((g) => !g.blocking)) await schliessen(bm, `Gate C wieder gruen: ${laufUrl}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("Pipeline-Alarm nicht zugestellt: " + e.message); process.exit(1); });
}

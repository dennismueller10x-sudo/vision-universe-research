/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/scripts/report-summary.mjs

   Kurzfassung des Admin-Berichts (/v1/admin/report) fuer das Actions-
   Protokoll: Zaehler, Grenzen, Schluessel vorhanden ja/nein und die
   Fehlercodes der letzten Fragen. NIE Fragetexte (Personenbezug moeglich),
   nie Schluessel.

     node workers/vu-ask/scripts/report-summary.mjs <report.json>
   ========================================================================= */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function summarize(report) {
  const r = report || {};
  const limits = r.limits || {};
  return {
    generatedAt: r.generatedAt || null,
    spend: r.spend || null,
    limits: {
      enabled: limits.enabled, model: limits.model, apiKeyPresent: limits.apiKeyPresent, botCheck: limits.botCheck,
      perUserDaily: limits.perUserDaily, globalDaily: limits.globalDaily, monthlyUsd: limits.monthlyUsd, totalUsd: limits.totalUsd,
    },
    logged: r.logged || 0,
    byStatus: r.byStatus || {},
    /* Nur Zeit, Status, Quelle und Fehlercode - der Fragetext bleibt weg. */
    recent: (r.recent || []).slice(0, 20).map((l) => ({ at: l.at, status: l.status, source: l.source })),
    errors: (r.notUnderstood || []).filter((l) => l.error).slice(0, 20).map((l) => ({ at: l.at, status: l.status, error: String(l.error).slice(0, 300) })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  console.log(JSON.stringify(summarize(report), null, 2));
}

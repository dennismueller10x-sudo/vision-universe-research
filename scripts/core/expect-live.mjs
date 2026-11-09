/* =========================================================================
   VISION UNIVERSE — scripts/core/expect-live.mjs

   Ist jede Datenart, die AN sein soll (domains.json, expectLive: true), auf
   der ausgelieferten Seite auch an?

     node scripts/core/expect-live.mjs --site=https://research.visionuniverse.de

   Exit 0: alle erwarteten Datenarten sind an (oder es gibt keine).
   Exit 1: mindestens eine ist abgeschaltet oder nicht lesbar.

   Anlass (08.11.2026): Ein Fail-closed-Rollback schloss das Company-
   Intelligence-Gate um 17:27 UTC. Die Seite lieferte danach index.json mit
   state DISABLED aus, NVDA zeigte kein Kapitel - und nichts meldete das:
   der Health-Lauf wertet ein geschlossenes Gate als "bewusst aus" (OFF), der
   Systemzustand als DISABLED. Dieser Check kennt die Absicht aus der
   Registry und laeuft im Freshness-Monitor; rot oeffnet dort das Alarm-Issue.
   Schreibt nichts.
   ========================================================================= */
import { args, makeLoader, loadEngines } from "./lib.mjs";

/** Rein: Domaenen mit expectLive gegen ihr geladenes Artefakt bewerten. */
export function checkExpectLive(registry, artifacts, Health, now = new Date()) {
  const rows = [];
  for (const d of registry.domains.filter((x) => x.expectLive === true)) {
    const r = Health.assessDomain(d, artifacts[d.artifact], { now, target: "site" });
    const off = r.status === "FAILED";
    rows.push({ id: d.id, label: d.label, artifact: d.artifact, ok: !off, status: r.status, reason: r.reason, warnings: r.warnings });
  }
  return { ok: rows.every((x) => x.ok), rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  if (!a.site) { console.error("--site=<URL> fehlt (geprueft wird die ausgelieferte Seite)"); process.exit(2); }
  const E = loadEngines();
  const load = makeLoader({ site: a.site });
  const artifacts = {};
  for (const d of E.registry.domains.filter((x) => x.expectLive === true)) {
    try { artifacts[d.artifact] = { ok: true, data: await load(d.artifact) }; }
    catch (e) { artifacts[d.artifact] = { ok: false, error: String(e && e.message || e) }; }
  }
  const res = checkExpectLive(E.registry, artifacts, E.Health);
  console.log("Erwartet AN (expectLive) auf " + a.site + ":");
  for (const r of res.rows) console.log(`  ${r.ok ? "OK    " : "AUS   "} ${r.label} (${r.artifact})${r.ok ? "" : " · " + r.reason + " · " + r.warnings.join("; ")}`);
  if (!res.ok) {
    console.log("\nBEFUND: mindestens eine Datenart ist live aus, obwohl sie an sein soll. Ursache im letzten Lauf ihres Erzeugers bzw. von pages-release suchen; bewusstes Abschalten traegt expectLive:false in core/registry/domains.json.");
    process.exit(1);
  }
}

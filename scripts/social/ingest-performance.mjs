/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/ingest-performance.mjs

   DER RUECKWEG DES KREISLAUFS BEGINNT HIER

   Der Kreislauf kann vorwaerts laufen, ohne je etwas gemessen zu haben:
   Signale, Gelegenheiten, Strategie, Content, Pruefung. Zurueck kommt er
   nur ueber Zahlen, die tatsaechlich erhoben wurden.

   Dieses Skript nimmt die Antwort von /social/meta/insights und macht
   daraus kanonische Kennzahl-Schnappschuesse (Schema.metricSnapshot).

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es ruft den Worker NICHT selbst auf. Der Admin-Schluessel gehoert in
   den Actions-Lauf und nicht in eine lokale Shell-Historie; ausserdem ist
   der Host aus der Arbeitsumgebung nicht erreichbar. Das Skript liest
   eine bereits geholte Antwort aus einer Datei. Damit ist es ausserdem
   ohne Netz testbar — was fuer ein Skript, das die Beweisgrundlage des
   Lernens erzeugt, kein Nebenaspekt ist.

   Ausfuehren:
     node scripts/social/ingest-performance.mjs --in antwort.json --out social/data
     node scripts/social/ingest-performance.mjs --in antwort.json          (Trockenlauf)
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Schema = require(join(ROOT, "social/engines/schema.js"));

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };

const IN = arg("in", null);
const OUT = arg("out", null);
const NOW = arg("now", new Date().toISOString());

/* -------------------------------------------------------------------------
   DIE UEBERSETZUNG
   -------------------------------------------------------------------------

   Instagram nennt seine Kennzahlen anders als das kanonische Schema. Die
   Zuordnung steht hier im Klartext und nicht verstreut im Code, weil sie
   die Stelle ist, an der ein stiller Fehler am teuersten waere: eine
   falsch zugeordnete Zahl wird spaeter als Evidenz zitiert.

   Was Instagram nicht liefert, bleibt `null`. Nicht 0 — das waere die
   Aussage "gemessen, und es war nichts". */
const ZUORDNUNG = {
  reach: "reach",
  views: "views",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saved",
  profileVisits: "profile_visits",
  followersGained: "follows"
};

/**
 * Die Interaktionsrate.
 *
 * Sie wird berechnet und nicht abgefragt, weil Instagram sie nicht
 * liefert — und die Basis ist die Reichweite, nicht die Followerzahl:
 * ein Beitrag, den 100 von 100 Erreichten mochten, hat nicht dieselbe
 * Rate wie einer, den 100 von 10.000 mochten. Ohne Reichweite gibt es
 * keine Rate; dann steht dort `null` und keine Schaetzung.
 */
function interaktionsrate(m) {
  const reach = m.reach;
  if (reach === null || reach === undefined || !(reach > 0)) return null;
  const teile = ["likes", "comments", "shares", "saved"]
    .map((k) => (typeof m[k] === "number" ? m[k] : null));
  if (teile.every((t) => t === null)) return null;
  const summe = teile.reduce((a, t) => a + (t || 0), 0);
  return Math.round((summe / reach) * 10000) / 10000;
}

export function snapshotAusBeitrag(post, options = {}) {
  const now = options.now || NOW;
  const roh = post.metrics || {};
  const gemessen = post.metrics !== null && post.metrics !== undefined;

  const metrics = {};
  for (const [kanonisch, instagram] of Object.entries(ZUORDNUNG)) {
    const wert = roh[instagram];
    metrics[kanonisch] = (wert === undefined || wert === null) ? null : Number(wert);
  }
  metrics.engagementRate = gemessen ? interaktionsrate(roh) : null;

  const veroeffentlicht = post.media && post.media.timestamp ? post.media.timestamp : null;
  const alterStunden = veroeffentlicht
    ? Math.round(((Date.parse(now) - Date.parse(veroeffentlicht)) / 3600000) * 10) / 10
    : null;

  /* Der Zustand sagt, was die Zahlen wert sind — nicht ob sie da sind.
     STALE statt VERIFIED, wenn der Beitrag so frisch ist, dass Instagram
     die Werte noch nachtraegt: eine Reichweite nach zehn Minuten ist
     keine Reichweite, sondern ein Zwischenstand. */
  let state = "UNAVAILABLE";
  if (gemessen) {
    state = (alterStunden !== null && alterStunden < (options.reifeStunden || 24))
      ? "STALE" : "VERIFIED";
  }

  return {
    snapshot: Schema.metricSnapshot({
      snapshotId: "snap_" + String(post.mediaId),
      publicationId: options.publicationId || ("ext_" + String(post.mediaId)),
      providerId: "meta",
      capturedAt: (post.provenance && post.provenance.fetchedAt) || now,
      ageHours: alterStunden,
      metrics,
      /* Die Originalzahlen bleiben erhalten: sie sind Beleg und
         Rueckfallebene, falls sich die Zuordnung oben als falsch
         erweist. Ohne sie waere eine Korrektur Datenverlust. */
      providerMetrics: roh,
      state
    }),
    mediaId: String(post.mediaId),
    permalink: (post.media && post.media.permalink) || null,
    publishedAt: veroeffentlicht,
    mediaType: (post.media && post.media.mediaType) || null,
    unanswered: post.unanswered || [],
    provenance: post.provenance || null,
    error: post.metricsError || null
  };
}

export function ingest(antwort, options = {}) {
  const posts = (antwort && antwort.posts) || [];
  const zeilen = posts.map((p) => snapshotAusBeitrag(p, options));
  return {
    generatedAt: options.now || NOW,
    account: antwort.account || null,
    accountId: antwort.accountId || null,
    requested: posts.length,
    measured: zeilen.filter((z) => z.snapshot.state !== "UNAVAILABLE").length,
    /* Was NICHT gemessen werden konnte, steht ausdruecklich da. Eine
       Liste, die nur Erfolge enthaelt, laesst den Rest verschwinden. */
    unmeasured: zeilen.filter((z) => z.snapshot.state === "UNAVAILABLE")
      .map((z) => ({ mediaId: z.mediaId, reason: z.error ? z.error.reason : "keine Zahlen" })),
    snapshots: zeilen
  };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!IN) {
    console.error("Kein --in. Erwartet wird die Antwort von /social/meta/insights als Datei.");
    process.exit(2);
  }
  if (!existsSync(IN)) { console.error("Datei nicht gefunden: " + IN); process.exit(2); }

  const antwort = JSON.parse(readFileSync(IN, "utf8"));
  const ergebnis = ingest(antwort, { now: NOW });

  console.log("VISION UNIVERSE SOCIAL — Performance-Ingestion");
  console.log("Konto:    @" + (ergebnis.account || "unbekannt"));
  console.log("Beitraege:", ergebnis.requested, "— davon gemessen:", ergebnis.measured);
  for (const z of ergebnis.snapshots) {
    const m = z.snapshot.metrics;
    console.log("  " + z.mediaId + "  [" + z.snapshot.state + "]  reach=" +
      (m.reach === null ? "—" : m.reach) +
      "  likes=" + (m.likes === null ? "—" : m.likes) +
      "  rate=" + (m.engagementRate === null ? "—" : m.engagementRate) +
      (z.unanswered.length ? "  ungemessen: " + z.unanswered.join(",") : ""));
  }
  for (const u of ergebnis.unmeasured) console.log("  NICHT gemessen: " + u.mediaId + " — " + u.reason);

  if (OUT) {
    const dir = join(ROOT, OUT);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "performance.json"), JSON.stringify(ergebnis, null, 2) + "\n");
    console.log("\nGeschrieben: " + OUT + "/performance.json");
  } else {
    console.log("\n(Kein --out: es wurde nichts geschrieben.)");
  }
}

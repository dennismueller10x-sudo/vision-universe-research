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
const MessFenster = require(join(ROOT, "social/engines/measurement-window.js"));

/* Die Fenstergrenzen stehen in der Konfiguration, weil sie eine Annahme
   ueber Instagram sind und keine Naturkonstante. */
const FENSTER_CONFIG = (function () {
  const pfad = join(ROOT, "social/config/measurement-windows.json");
  return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : null;
})();

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

  /* Verweildauer. Instagram meldet sie nur fuer Reels und in
     MILLISEKUNDEN; das kanonische Feld ist in Sekunden. Eine Zahl, die
     um den Faktor 1000 danebenliegt, faellt in einem Median nicht auf —
     sie verschiebt ihn nur. */
  const avgMs = roh.ig_reels_avg_watch_time;
  metrics.watchTimeSeconds = (typeof avgMs === "number")
    ? Math.round((avgMs / 1000) * 100) / 100 : null;

  /* completionRate bleibt null. Sie waere Verweildauer geteilt durch
     Videolaenge, und die Laenge liefert diese Abfrage nicht. Sie zu
     schaetzen hiesse, eine Quote zu erfinden, die anschliessend als
     Retention in die Strategie einginge. */
  metrics.completionRate = null;

  const veroeffentlicht = post.media && post.media.timestamp ? post.media.timestamp : null;
  const alterStunden = veroeffentlicht
    ? Math.round(((Date.parse(now) - Date.parse(veroeffentlicht)) / 3600000) * 10) / 10
    : null;

  /* Der Zustand sagt, was die Zahlen WERT sind — nicht ob sie da sind.

     Eine Reichweite nach zehn Minuten ist keine kleine Reichweite; sie
     ist noch keine Reichweite. Die Zahl ist richtig, sie beantwortet nur
     eine andere Frage als die gestellte. Deshalb entscheidet das
     Messfenster und nicht das Vorhandensein.

     VERIFIED heisst ab jetzt REIF. Eine Messung nach 25 Stunden galt
     frueher als verifiziert und waechst in Wahrheit noch. */
  const fenster = MessFenster.windowFor(alterStunden, FENSTER_CONFIG);

  let state = "UNAVAILABLE";
  if (gemessen) state = MessFenster.isMature(alterStunden, FENSTER_CONFIG) ? "VERIFIED" : "STALE";

  const snapshot = Schema.metricSnapshot({
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
    });

  /* Das Fenster gehoert an den Snapshot UND an die Zeile.

     An den Snapshot, weil er ohne sein Fenster nicht interpretierbar ist
     — eine Zahl ohne Alter ist eine Zahl ohne Bedeutung. An die Zeile,
     weil die Faelligkeit der naechsten Messung ueber die Zeilen laeuft
     und ein Feld, das man erst auspacken muss, irgendwann vergessen
     wird. `Schema.metricSnapshot` kennt das Feld nicht, deshalb steht es
     danach dort. */
  /* NUR das Fenster wird gespeichert, und auch das nur als Etikett: es
     sagt, WANN diese Messung genommen wurde. Die Frage "ist sie reif"
     wird nirgends gespeichert, sondern aus `ageHours` gerechnet.

     Ein gespeichertes `mature` waere eine Momentaufnahme einer sich
     bewegenden Eigenschaft — und damit von der Sekunde des Schreibens an
     potenziell falsch. Zwei Wahrheiten ueber dieselbe Frage sind hier
     besonders teuer: die eine steht in der Datei, die andere ergibt
     sich aus der Uhr, und sie widersprechen sich genau dann, wenn es
     darauf ankommt. */
  snapshot.window = fenster;

  return {
    snapshot,
    window: fenster,
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

/* =========================================================================
   DAS ZUSAMMENFUEHREN

   -------------------------------------------------------------------------
   WARUM EIN LAUF NICHT UEBERSCHREIBEN DARF
   -------------------------------------------------------------------------

   Am 16.09. um 17:59 wurden 16 Beitraege gemessen. Um 18:05 lief die
   Ingestion erneut, erreichte wegen des damals zu klein gerechneten
   Subrequest-Budgets nur 12 — und schrieb die Datei neu. Vier gemessene
   Beitraege waren weg. Nicht "veraltet": weg. Die Stichprobe des
   Evidenzregimes schrumpfte, ohne dass irgendwo ein Fehler auftrat.

   Gemessene Leistung ist Beleg, kein Zwischenstand. Ein Lauf, der
   weniger erreicht, ist ein schmalerer Blick auf dieselbe Welt — nicht
   eine neue Welt mit weniger Beitraegen. Deshalb wird zusammengefuehrt
   statt ersetzt.

   -------------------------------------------------------------------------
   WAS GEWINNT, UND WAS NICHT
   -------------------------------------------------------------------------

   Eine neue MESSUNG gewinnt immer: sie ist juenger. Ein neues
   SCHEITERN gewinnt nie gegen eine vorhandene Messung — dass die
   Abfrage heute misslang, macht die Zahl von gestern nicht falsch.

   Was bleibt, traegt sichtbar, dass es bleibt: `carriedOver`, der
   Zeitpunkt des letzten Versuchs und dessen Grund. `capturedAt` bleibt
   unveraendert der Zeitpunkt der urspruenglichen Messung. Eine
   uebernommene Zahl, die wie eine frische aussieht, waere eine
   Faelschung des Alters — und Alter ist in dieser Datei eine Aussage.
   ========================================================================= */

function istGemessen(zeile) {
  return zeile && zeile.snapshot && zeile.snapshot.state !== "UNAVAILABLE";
}

export function merge(bestand, neu, options = {}) {
  const jetzt = options.now || neu.generatedAt || NOW;
  const alt = new Map();
  for (const z of (bestand && bestand.snapshots) || []) alt.set(String(z.mediaId), z);

  const gesehen = new Set();
  const zeilen = [];
  let aufgefrischt = 0;
  let uebernommen = 0;

  for (const z of neu.snapshots || []) {
    const id = String(z.mediaId);
    gesehen.add(id);
    const vorher = alt.get(id);

    if (istGemessen(z)) {
      aufgefrischt += 1;
      /* DIE MESSREIHE.

         Frueher ersetzte die neue Messung die alte. Damit war die
         Wachstumskurve weg — und mit ihr die einzige Moeglichkeit,
         spaeter zu pruefen, ob die angenommenen Fenstergrenzen stimmen.
         Die Grenzen sind eine Annahme ueber Instagram; ohne Reihen
         bleibt sie fuer immer eine.

         Aufbewahrt wird je Fenster die letzte Messung. Zehn Messungen im
         selben Fenster sind zehnmal dieselbe Aussage; eine je Fenster
         ist die Kurve. */
      const reihe = (vorher && Array.isArray(vorher.history)) ? vorher.history.slice() : [];
      if (vorher && istGemessen(vorher) && vorher.snapshot.window) {
        const schonDa = reihe.some((h) => h.window === vorher.snapshot.window);
        if (!schonDa || vorher.snapshot.window === z.snapshot.window) {
          const ohneAltes = reihe.filter((h) => h.window !== vorher.snapshot.window);
          ohneAltes.push({
            window: vorher.snapshot.window,
            capturedAt: vorher.snapshot.capturedAt,
            ageHours: vorher.snapshot.ageHours,
            metrics: vorher.snapshot.metrics
          });
          reihe.length = 0;
          Array.prototype.push.apply(reihe, ohneAltes);
        }
      }
      reihe.sort((a, b) => (a.ageHours || 0) - (b.ageHours || 0));
      zeilen.push(Object.assign({}, z, { history: reihe }));
      continue;
    }

    if (vorher && istGemessen(vorher)) {
      /* Der Versuch misslang, die Messung bleibt. Warum er misslang,
         steht dabei — sonst waere spaeter nicht unterscheidbar, ob eine
         Zahl alt ist oder ob niemand mehr nachgesehen hat. */
      uebernommen += 1;
      zeilen.push(Object.assign({}, vorher, {
        carriedOver: true,
        lastAttemptAt: jetzt,
        lastAttemptReason: (z.error && z.error.reason) || "keine Zahlen"
      }));
      continue;
    }

    zeilen.push(z);
  }

  /* Beitraege, nach denen dieser Lauf gar nicht gefragt hat. Auch sie
     verschwinden nicht — ein kuerzeres Fenster ist kein Loeschgrund. */
  for (const [id, z] of alt) {
    if (gesehen.has(id)) continue;
    uebernommen += 1;
    zeilen.push(Object.assign({}, z, { carriedOver: true, notRequestedAt: jetzt }));
  }

  const gemessen = zeilen.filter(istGemessen);

  return Object.assign({}, neu, {
    generatedAt: jetzt,
    requested: zeilen.length,
    measured: gemessen.length,
    unmeasured: zeilen.filter((z) => !istGemessen(z))
      .map((z) => ({ mediaId: z.mediaId, reason: z.error ? z.error.reason : "keine Zahlen" })),
    /* Was DIESER Lauf geschafft hat, getrennt vom Gesamtbestand. Ohne
       diese Trennung liesse sich ein schrumpfender Lauf nicht mehr
       erkennen, sobald das Zusammenfuehren ihn kaschiert. */
    run: {
      at: jetzt,
      requested: (neu.snapshots || []).length,
      measured: aufgefrischt,
      carriedOver: uebernommen
    },
    snapshots: zeilen
  });
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
    const ziel = join(dir, "performance.json");

    /* Zusammenfuehren, nicht ersetzen. Ein Lauf, der weniger erreicht,
       darf die Messungen des vorigen nicht loeschen. */
    let bestand = null;
    if (existsSync(ziel)) {
      try { bestand = JSON.parse(readFileSync(ziel, "utf8")); }
      catch (err) {
        console.error("VORHANDENE DATEI UNLESBAR: " + err.message);
        console.error("Abbruch — lieber nichts schreiben als Messungen ueberschreiben.");
        process.exit(3);
      }
    }
    const zusammengefuehrt = bestand ? merge(bestand, ergebnis, { now: NOW }) : ergebnis;

    writeFileSync(ziel, JSON.stringify(zusammengefuehrt, null, 2) + "\n");
    if (bestand) {
      console.log("\nZusammengefuehrt mit dem Bestand:");
      console.log("  dieser Lauf:  " + zusammengefuehrt.run.measured + " gemessen von " +
        zusammengefuehrt.run.requested + " abgefragt");
      console.log("  uebernommen:  " + zusammengefuehrt.run.carriedOver + " aus frueheren Laeufen");
      console.log("  Bestand nun:  " + zusammengefuehrt.measured + " gemessen von " +
        zusammengefuehrt.requested);
    }
    console.log("\nGeschrieben: " + OUT + "/performance.json");
  } else {
    console.log("\n(Kein --out: es wurde nichts geschrieben.)");
  }
}

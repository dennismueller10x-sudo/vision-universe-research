/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/make-publish-candidate.mjs

   DER PUBLISH CANDIDATE

   Der Owner hat Controlled Live Learning freigegeben: das System waehlt,
   entwirft, rendert und terminiert — und legt genau einen fertigen
   Beitrag zur Entscheidung vor. Der Owner entscheidet APPROVE oder
   REJECT und sonst nichts.

   -------------------------------------------------------------------------
   GENAU EINER, NICHT VIER
   -------------------------------------------------------------------------

   Der Zyklus erzeugt mehrere Schatten-Entscheidungen. Sie alle
   vorzulegen hiesse, die Auswahl an den Owner zurueckzugeben — und
   genau die soll das System treffen. Vorgelegt wird der beste
   sendbare Kandidat, und die Begruendung sagt, warum er es ist.

   -------------------------------------------------------------------------
   DIE FREQUENZ IST TEIL DER AUSWAHL, NICHT EIN NACHGEDANKE
   -------------------------------------------------------------------------

   Es waere verfuehrerisch, viel zu senden: jede Veroeffentlichung ist
   ein Datenpunkt, und das System lernt an Datenpunkten. Genau davor hat
   der Owner gewarnt. Ein Konto, das plotzlich taeglich sendet, ist nicht
   dasselbe Konto mit mehr Daten — es ist ein anderes Konto, und die
   Stichprobe waere eine ueber dieses andere.

   Die Grenzen stehen in social/config/cadence.json, weil sie eine
   Owner-Entscheidung sind und keine technische Groesse.

   -------------------------------------------------------------------------
   WAS NICHT ERFUNDEN WIRD
   -------------------------------------------------------------------------

   Die erwartete Zielmetrik nennt eine METRIK, keinen Wert — solange es
   fuer die Kohorte keine Vergleichsbasis gibt, steht dort ausdruecklich
   "keine Erwartung". Eine Zahl hinzuschreiben, damit das Feld gefuellt
   aussieht, waere eine Prognose ohne Grundlage, und sie wuerde nach der
   Messung als "getroffen" oder "verfehlt" zitiert.

   Ausfuehren:
     node scripts/social/make-publish-candidate.mjs --data social/data
     node scripts/social/make-publish-candidate.mjs --data social/data --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ContentHash = require(join(ROOT, "social/engines/content-hash.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));

export const KANDIDATEN_DIR = "social/data/publish-candidates";

function readJson(pfad, fallback) {
  return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : fallback;
}

/**
 * Wie viele Beitraege gingen zuletzt aus der Pipeline hinaus?
 *
 * Gezaehlt werden NUR Pipeline-Beitraege. Die Bestandsbeitraege des
 * Owners sind seine Entscheidung und nicht die Frequenz des Systems; sie
 * mitzuzaehlen hiesse, dem System eine Zurueckhaltung zu verordnen, die
 * jemand anders bereits ausgeuebt hat — oder umgekehrt, ihm eine
 * Frequenz anzurechnen, die es nie hatte.
 */
export function frequenzbefund(eintraege, grenzen, nowIso) {
  const jetzt = Date.parse(nowIso);
  const ausPipeline = (eintraege || []).filter((e) =>
    e.publishedAt && e.lineage && e.lineage.origin &&
    e.lineage.origin !== "ORGANIC_PRE_EXISTING");

  const zeiten = ausPipeline.map((e) => Date.parse(e.publishedAt))
    .filter((t) => Number.isFinite(t)).sort((a, b) => b - a);

  const letzter = zeiten.length ? zeiten[0] : null;
  const stundenSeither = letzter === null ? null
    : Math.round(((jetzt - letzter) / 3600000) * 10) / 10;

  const in7 = zeiten.filter((t) => jetzt - t <= 7 * 86400000).length;
  const in30 = zeiten.filter((t) => jetzt - t <= 30 * 86400000).length;

  const gruende = [];
  if (stundenSeither !== null && stundenSeither < grenzen.minHoursBetweenPosts) {
    gruende.push("Der letzte Pipeline-Beitrag liegt " + stundenSeither + " Stunden zurueck; " +
      "der Mindestabstand ist " + grenzen.minHoursBetweenPosts + ".");
  }
  if (in7 >= grenzen.maxPostsPer7Days) {
    gruende.push(in7 + " Beitraege in sieben Tagen; die Grenze ist " +
      grenzen.maxPostsPer7Days + ".");
  }
  if (in30 >= grenzen.maxPostsPer30Days) {
    gruende.push(in30 + " Beitraege in dreissig Tagen; die Grenze ist " +
      grenzen.maxPostsPer30Days + ".");
  }

  return {
    erlaubt: gruende.length === 0,
    gruende,
    letzterPipelineBeitrag: letzter === null ? null : new Date(letzter).toISOString(),
    stundenSeither, in7Tagen: in7, in30Tagen: in30
  };
}

/**
 * Die erwartete primaere Zielmetrik.
 *
 * Sie folgt dem Evidenzregime: gemessen wird, was fuer diese Kohorte
 * ueberhaupt belegt ist. Gibt es fuer die Kohorte keine Vergleichsbasis,
 * steht das da — und keine Zahl.
 */
export function zielmetrik(befund, kohorte) {
  const k = (befund && befund.cohorts && befund.cohorts[kohorte]) || null;

  if (!k || !k.activeDimensions || !k.activeDimensions.length) {
    return {
      metric: "reach",
      baseline: null,
      expectation: null,
      note: "Fuer die Kohorte " + kohorte + " gibt es noch keine gemessene " +
        "Vergleichsbasis. Die Reichweite wird gemessen, aber es gibt nichts, " +
        "woran sie sich messen liesse — dieser Beitrag ist der Anfang der Basis."
    };
  }

  const primaer = k.activeDimensions.indexOf("reach") >= 0 ? "reach" : k.activeDimensions[0];
  const median = (k.baseline && k.baseline.medians && k.baseline.medians[primaer] !== undefined)
    ? k.baseline.medians[primaer] : null;

  return {
    metric: primaer,
    baseline: median,
    expectation: median === null ? null
      : "mindestens der Median der Kohorte (" + median + ")",
    note: "Aktive Zieldimensionen fuer " + kohorte + ": " + k.activeDimensions.join(", ") +
      ". Stichprobe n=" + (k.sampleSize === undefined ? "?" : k.sampleSize) + "."
  };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const DATA = arg("data", "social/data");
  const NOW = arg("now", new Date().toISOString());
  const D = (n) => join(ROOT, DATA, n);

  console.log("VISION UNIVERSE SOCIAL — Publish Candidate");
  console.log("Datenstand: " + DATA);

  const schatten = readJson(D("shadow-decisions.json"), null);
  const bericht = readJson(D("cycle-report.json"), null);
  if (!schatten || !bericht) {
    console.error("\nEs fehlt shadow-decisions.json oder cycle-report.json in " + DATA + ".");
    console.error("Erst den Zyklus laufen lassen — ohne Entscheidung gibt es keinen Kandidaten.");
    process.exit(2);
  }

  /* ------------------------------------------------------- Die Frequenz */
  const grenzen = readJson(join(ROOT, "social/config/cadence.json"), {
    minHoursBetweenPosts: 20, maxPostsPer7Days: 4, maxPostsPer30Days: 12 });
  const gedaechtnis = readJson(D("content-memory.json"), { entries: [] });
  const frequenz = frequenzbefund(gedaechtnis.entries || [], grenzen, NOW);

  console.log("\n--- FREQUENZ ---");
  console.log("Letzter Pipeline-Beitrag: " + (frequenz.letzterPipelineBeitrag || "keiner"));
  console.log("In 7 Tagen: " + frequenz.in7Tagen + " (max " + grenzen.maxPostsPer7Days + ")" +
    " | in 30 Tagen: " + frequenz.in30Tagen + " (max " + grenzen.maxPostsPer30Days + ")");
  if (!frequenz.erlaubt) {
    console.log("\nKEIN KANDIDAT — die Frequenzgrenze ist erreicht:");
    for (const g of frequenz.gruende) console.log("  " + g);
    console.log("\nDas ist kein Fehler. Mehr zu senden, um schneller Stichproben zu");
    console.log("sammeln, waere eine Veraenderung des Kontos und keine Messung an ihm.");
    process.exit(0);
  }

  /* -------------------------------------------------------- Die Auswahl */
  const sendbar = (schatten.decisions || []).filter((d) =>
    d.asset && d.asset.plannable && d.asset.rendered && d.asset.imageUrl);

  console.log("\n--- AUSWAHL ---");
  console.log("Entscheidungen: " + (schatten.decisions || []).length +
    " | mit fertiger Fracht: " + sendbar.length);

  if (!sendbar.length) {
    console.log("\nKEIN KANDIDAT — keine Entscheidung hat ein gezeichnetes Bild.");
    console.log("Der Zyklus zeichnet mit --render.");
    process.exit(0);
  }

  /* Die Gelegenheit entscheidet, nicht die Reihenfolge. Bei gleichem
     Score gewinnt die aeltere — sonst haengt die Auswahl an einer
     Sortierung, die niemand festgelegt hat. */
  const gelegenheiten = new Map((bericht.opportunities || []).map((o) => [o.opportunityId, o]));

  const bewertet = sendbar.map((d) => {
    /* Die Gelegenheit steht an der Entscheidung. Sie ueber den Bericht
       nachzuschlagen war ein Join, der stillschweigend nichts fand — und
       dann waren alle Scores 0 und die Auswahl fiel auf die
       Reihenfolge. */
    const o = d.opportunityId ? gelegenheiten.get(d.opportunityId) : null;
    return { entscheidung: d, opportunity: o || null, score: o ? o.score : null };
  });

  /* Eine Gelegenheit, die nicht einmal vorschlagsfaehig ist, wird auch
     nicht zur Freigabe vorgelegt. Die Freigabe ist kein Ersatz fuer eine
     Schwelle — sie ist eine Entscheidung ueber einen Beitrag, der die
     Schwellen bestanden hat. */
  const vorschlagsfaehig = bewertet.filter((x) => x.opportunity && x.opportunity.proposable);

  if (!vorschlagsfaehig.length) {
    console.log("\nKEIN KANDIDAT — keine der Gelegenheiten ist vorschlagsfaehig.");
    for (const x of bewertet) {
      console.log("  " + x.entscheidung.packageId + ": " +
        (x.opportunity ? "Score " + x.opportunity.score + " — " + x.opportunity.explanation
                       : "keine Gelegenheit zugeordnet"));
    }
    process.exit(0);
  }

  /* Hoechster Score gewinnt. Bei Gleichstand die Gelegenheit, die zuerst
     entstand — sonst haengt die Auswahl an einer Sortierung, die niemand
     festgelegt hat. */
  vorschlagsfaehig.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.opportunity.opportunityId).localeCompare(String(b.opportunity.opportunityId));
  });

  const gewaehlt = vorschlagsfaehig[0];
  const d = gewaehlt.entscheidung;

  const unterlegen = vorschlagsfaehig.slice(1)
    .map((x) => x.entscheidung.topic + " (" + x.score + ")");

  /* ------------------------------------------------------- Der Abdruck */
  const inhalt = {
    contentId: d.packageId,
    imageUrl: d.asset.imageUrl,
    caption: d.caption === undefined || d.caption === null ? "" : d.caption
  };
  const abdruck = ContentHash.contentHash(inhalt);

  const candidateId = "cand_" + NOW.slice(0, 10).replace(/-/g, "") + "_" +
    Hash.prefixedHash("c", { packageId: d.packageId, hash: abdruck }).slice(2, 10);

  const ziel = zielmetrik(bericht.learning && bericht.learning.evidenceRecord
    ? bericht.learning.evidenceRecord : null, "IMAGE");

  const kandidat = {
    candidateId,
    createdAt: NOW,
    state: "AWAITING_APPROVAL",

    /* Was oeffentlich wuerde — und nur das geht in den Abdruck. */
    content: inhalt,
    contentHash: abdruck,

    presentation: {
      topic: d.topic,
      hook: d.hook,
      caption: inhalt.caption,
      hashtags: d.hashtags || [],
      visualType: d.visualType,
      mediaFormat: "IMAGE",
      plannedHourUtc: d.plannedHourUtc,
      timingSource: d.timingSource,
      timingReason: d.timingReason,
      mode: d.mode,
      modeReason: d.modeReason,
      strategyVersion: d.strategyVersion,
      reason: gewaehlt.opportunity ? gewaehlt.opportunity.explanation : null,
      opportunityScore: gewaehlt.score,
      /* Wogegen er sich durchgesetzt hat. Eine Auswahl ohne die
         Unterlegenen ist eine Behauptung ueber eine Rangfolge, die
         niemand nachsehen kann. */
      alternatives: unterlegen,
      expectedPrimaryMetric: ziel
    },

    /* Die Kette, die dieser Beitrag spaeter tragen muss. Sie entsteht
       HIER und nicht nachtraeglich: nachtraeglich waere sie eine
       Rekonstruktion, und eine Rekonstruktion ist keine Herkunft. */
    provenance: {
      signalIds: d.signalIds || (gewaehlt.opportunity && gewaehlt.opportunity.signalIds) || [],
      opportunityId: d.opportunityId || null,
      strategyVersion: d.strategyVersion,
      archetype: d.archetype,
      hook: d.hook,
      mediaFormat: "IMAGE",
      visualType: d.visualType,
      caption: inhalt.caption,
      plannedHourUtc: d.plannedHourUtc,
      experimentId: d.experimentId || null,
      decidedMode: d.mode,
      approval: null,
      mediaId: null,
      measurements: [],
      learning: null
    },

    cadence: frequenz
  };

  console.log("Vorschlagsfaehig: " + vorschlagsfaehig.length + " von " + bewertet.length);
  console.log("Gewaehlt:  " + d.packageId + "  (Gelegenheitsscore " + gewaehlt.score + ")");
  if (unterlegen.length) console.log("Unterlegen: " + unterlegen.join(", "));
  console.log("\n--- KANDIDAT " + candidateId + " ---");
  console.log("Thema:      " + kandidat.presentation.topic);
  console.log("Hook:       " + kandidat.presentation.hook);
  console.log("Archetyp:   " + (kandidat.provenance.archetype || "—") +
    " | Visual: " + kandidat.presentation.visualType +
    " | Modus: " + kandidat.presentation.mode);
  console.log("Zeitpunkt:  " + kandidat.presentation.plannedHourUtc + ":00 UTC (" +
    kandidat.presentation.timingSource + ")");
  console.log("Zielmetrik: " + ziel.metric + " — " + (ziel.expectation || "keine Erwartung"));
  console.log("Bild:       " + inhalt.imageUrl);
  console.log("Abdruck:    " + abdruck);
  console.log("\nCaption:\n" + inhalt.caption);

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  const dir = join(ROOT, KANDIDATEN_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, candidateId + ".json"), JSON.stringify(kandidat, null, 2) + "\n");
  console.log("\nGeschrieben: " + KANDIDATEN_DIR + "/" + candidateId + ".json");
  console.log("Freigabe:    Workflow 'Social Publish Candidate' mit candidateId=" + candidateId);
}

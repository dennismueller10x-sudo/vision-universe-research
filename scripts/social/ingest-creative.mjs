/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/ingest-creative.mjs

   DAS EINLESEN DES CREATIVE RESULTS

   Die zweite Haelfte von request-creative.mjs. Der Agent hat auf dem
   Request-Branch geantwortet; dieses Skript holt die Antwort, PRUEFT
   sie und legt sie erst dann dorthin, wo der Zyklus sie findet.

   -------------------------------------------------------------------------
   WARUM NICHT DER ZYKLUS SELBST
   -------------------------------------------------------------------------

   Ein Zyklus, der waehrend der Inhaltserzeugung ins Netz greift, ist
   nicht mehr reproduzierbar: derselbe Stand liefert je nach Zeitpunkt
   ein anderes Ergebnis. Und ein ungeprueftes Ergebnis waere schon im
   Kandidaten, bevor ein Tor es gesehen haette.

   Das Netz gehoert deshalb hierher, das Rechnen in den Zyklus.

   -------------------------------------------------------------------------
   DIE REIHENFOLGE BEIM BILDASSET
   -------------------------------------------------------------------------

   Der Bildproof hat einen abgeschnittenen Transfer gezeigt, dessen
   Anfang intakt war. Ein PNG, das mit der richtigen Signatur beginnt,
   ist damit noch kein PNG.

   Geprueft wird deshalb am FRISCH ZURUECKGELESENEN Stand, und zwar
   Hash, Groesse, MIME, Abmessungen und Vollstaendigkeit — das Dateiende
   eingeschlossen. Erst danach gilt ein Ergebnis als COMPLETED.

   Ausfuehren:
     node scripts/social/ingest-creative.mjs --content-id vu-xom-20260911 --ref origin/authoring/request/vu-xom-20260911
     node scripts/social/ingest-creative.mjs --content-id vu-xom-20260911 --ref ... --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const AssetIntegrity = require(join(ROOT, "social/engines/asset-integrity.js"));
const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));
const Contract = require(join(ROOT, "social/engines/creative-contract.js"));
const Job = require(join(ROOT, "social/engines/creative-job.js"));
import { verify as pruefeRevision } from "./verify-revision-result.mjs";

export const LEDGER_DATEI = "social/data/creative-invocations.json";
/* Das Job-Register liegt daneben und wird beim Abschluss mitgezogen.
   Als Konstante und nicht als zusammengebauter Pfad: die erste Fassung
   schrieb `join(ROOT, DATEN, ...)` mit einem DATEN, das es in dieser
   Datei nie gab. `node --check` sieht so etwas nicht — es haette erst
   beim ersten echten Ingest geknallt, also genau dann, wenn ein
   Ergebnis vorliegt und niemand zusieht. */
export const JOB_REGISTER_DATEI = "social/data/creative-jobs.json";

/* ------------------------------------------------------------------ */
/* DER ZUGRIFF AUF DEN REQUEST-BRANCH                                  */
/*                                                                     */
/* Ueber git und nicht ueber eine API: der Branch liegt ohnehin im     */
/* Klon, git liefert die Bytes unveraendert, und ein Blob-SHA laesst   */
/* sich damit gegen dieselbe Quelle pruefen, aus der er stammt.        */
/* ------------------------------------------------------------------ */

/** Roher Dateiinhalt aus einem git-Ref. null, wenn es die Datei nicht gibt. */
export function zeigeDatei(ref, pfad, repoRoot) {
  try {
    return execFileSync("git", ["show", ref + ":" + pfad],
      { cwd: repoRoot || ROOT, maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) {
    return null;
  }
}

/** Der Blob-SHA, den git selbst fuer diese Datei fuehrt. */
export function blobShaImRef(ref, pfad, repoRoot) {
  try {
    const zeile = execFileSync("git", ["ls-tree", ref, "--", pfad],
      { cwd: repoRoot || ROOT, encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"] }).trim();
    const teile = zeile.split(/\s+/);
    return teile.length >= 3 ? teile[2] : null;
  } catch (err) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* DIE PRUEFUNG                                                        */
/* ------------------------------------------------------------------ */

/**
 * Liest und prueft ein Creative Result aus einem git-Ref.
 *
 * Gibt IMMER einen Bericht zurueck und wirft nicht: ein fehlendes
 * Ergebnis ist der Normalfall bei einem asynchronen Agenten, kein
 * Fehler.
 */
export function pruefeErgebnis(ref, contentId, options) {
  const repoRoot = (options && options.repoRoot) || ROOT;
  const verzeichnis = ChatGptWork.requestDir(contentId);
  const briefPfad = verzeichnis + "/authoring-brief.json";
  const ergebnisPfad = verzeichnis + "/authoring-result.json";

  const briefRoh = zeigeDatei(ref, briefPfad, repoRoot);
  if (!briefRoh) {
    return { ok: false, pending: false, state: "NO_BRIEF",
      explanation: "Im Ref " + ref + " liegt kein Brief unter " + briefPfad + "." };
  }

  const ergebnisRoh = zeigeDatei(ref, ergebnisPfad, repoRoot);
  if (!ergebnisRoh) {
    return { ok: false, pending: true, state: "PENDING",
      explanation: "Noch kein Ergebnis unter " + ergebnisPfad + ". Der Agent " +
        "arbeitet asynchron." };
  }

  /* Der SHA, gegen den die Kennungen zu rechnen sind: der, den git
     fuehrt — und zur Kontrolle der, den wir selbst aus den Bytes
     rechnen. Weichen sie ab, stimmt unsere Rechnung nicht, und das
     waere ein Befund ueber uns. */
  const shaVonGit = blobShaImRef(ref, briefPfad, repoRoot);
  const shaGerechnet = ChatGptWork.blobSha(briefRoh);
  if (shaVonGit && shaVonGit !== shaGerechnet) {
    return { ok: false, pending: false, state: "SHA_MISMATCH",
      explanation: "Der selbst gerechnete Blob-SHA (" + shaGerechnet + ") weicht von " +
        "dem ab, den git fuehrt (" + shaVonGit + ")." };
  }

  let brief, ergebnis;
  try { brief = JSON.parse(String(briefRoh)); }
  catch (err) {
    return { ok: false, pending: false, state: "BRIEF_UNREADABLE",
      explanation: "Der Brief ist kein gueltiges JSON: " + err.message };
  }
  try { ergebnis = JSON.parse(String(ergebnisRoh)); }
  catch (err) {
    return { ok: false, pending: false, state: "RESULT_UNREADABLE",
      explanation: "Das Ergebnis ist kein gueltiges JSON: " + err.message };
  }

  const geprueft = ChatGptWork.verifyResult(ergebnis, {
    briefId: brief.brief_id,
    contentId: contentId,
    briefBlobSha: shaGerechnet,
    hookType: brief.hook_strategy && brief.hook_strategy.hook_type
  });

  /* Die Assets: frisch aus dem Ref gelesen, nicht aus dem, was der
     Agent ueber sie behauptet. */
  const assets = ChatGptWork.verifyAssets(ergebnis, (pfad) => zeigeDatei(ref, pfad, repoRoot));

  /* -----------------------------------------------------------------
     TEXT_REVISION: DIE UMGEKEHRTE FRAGE

     `verifyAssets` laeuft ueber `visual_variants`. Bei einer
     TEXT_REVISION ist diese Liste LEER - und damit meldet der
     Transportvertrag `ok`, weil es nichts zu pruefen gab. Das ist ein
     Bestehen aus Mangel an Gegenstand, kein Nachweis.

     Schlimmer ist die andere Richtung: liefert der Agent entgegen dem
     Auftrag doch ein Bild, prueft `verifyAssets` es bereitwillig,
     `legeAb` schriebe es auf die Platte, und der Vertragsbruch waere
     nicht nur unbemerkt, sondern BELOHNT.

     Deshalb entscheidet bei einer TEXT_REVISION der Revisionsvertrag
     mit - und er faellt zu, wo der Transportvertrag durchwinkt. */
  const istRevision = brief.request_type === Contract.TEXT_REVISION;
  const revision = istRevision
    ? pruefeRevision(brief, ergebnis, {
        expectedProcessingKey: ChatGptWork.processingKey(
          brief.brief_id, contentId, shaGerechnet, ergebnis.schema_version),
        /* Das geerbte Asset liegt nicht im Request-Ref, sondern dort,
           wo der urspruengliche Lauf es abgelegt hat. Gelesen wird es
           vom Datentraeger. */
        readInheritedAsset: (pfad) => readFileSync(join(ROOT, pfad))
      })
    : null;

  const ok = geprueft.ok && assets.ok && (!istRevision || revision.ok);
  return {
    ok: ok,
    pending: false,
    state: ok ? "COMPLETED"
      : (istRevision && !revision.ok) ? "CONTRACT_MISMATCH"
      : (assets.state === "RECOVERY_REQUIRED" ? "RECOVERY_REQUIRED" : "REJECTED"),
    explanation: ok
      ? (istRevision
          ? "Ergebnis bestaetigt, Bild unveraendert geerbt."
          : "Ergebnis und Asset bestaetigt.")
      : [geprueft.ok ? null : "Ergebnis: " + geprueft.explanation,
         assets.ok ? null : "Asset: " + assets.explanation,
         (!istRevision || revision.ok) ? null : "Revision: " + revision.explanation
        ].filter(Boolean).join(" | "),
    requestType: brief.request_type || Contract.FULL_CREATIVE,
    revision: revision,
    briefBlobSha: shaGerechnet,
    briefId: brief.brief_id,
    processingKey: ChatGptWork.processingKey(brief.brief_id, contentId, shaGerechnet,
      ergebnis.schema_version),
    verification: geprueft,
    assets: assets,
    brief: brief,
    result: ergebnis,
    resultRaw: ergebnisRoh,
    briefRaw: briefRoh
  };
}

/* ------------------------------------------------------------------ */
/* DER RUECKWEG INS JOB-REGISTER                                       */
/* ------------------------------------------------------------------ */

/**
 * Zieht den Job-Registereintrag an den Abschluss nach, den das Ledger
 * gerade festgehalten hat.
 *
 * -------------------------------------------------------------------
 * WARUM DAS EINE EIGENE FUNKTION IST
 * -------------------------------------------------------------------
 *
 * Als Block in `main` war der Rueckweg nur ueber den Quelltext
 * pruefbar — und ein Test, der Quelltext liest, ueberlebt jede
 * Faelschung der Messung. Genau das hat die Gegenprobe gezeigt: den
 * Block entfernen und den Zustand direkt setzen fiel beides nur einem
 * Grep auf.
 *
 * Als Funktion laesst sie sich fahren und am Ergebnis messen.
 *
 * -------------------------------------------------------------------
 * WAS SIE TUT
 * -------------------------------------------------------------------
 *
 * Der Orchestrator zaehlt das JOB-REGISTER, wenn er
 * MAX_OPEN_CREATIVE_JOBS prueft. Dieses Skript schrieb bis dahin
 * ausschliesslich ins Ledger. Ein abgeschlossener Job blieb deshalb
 * auf CREATIVE_JOB_IN_FLIGHT stehen und blockierte den einen Slot —
 * einmal 51 Stunden lang, und ohne diese Funktion fuer immer: eine
 * Altersregel, die ihn freigaebe, gibt es nicht und soll es nicht
 * geben.
 *
 * Die Bruecke ist der processing_key. Er steht auf beiden Seiten und
 * verbindet sie eindeutig; ueber die content_id zu gehen waere
 * bequemer und falsch — zu einem Inhaltsobjekt gibt es mehrere
 * Anlaeufe.
 *
 * Gegangen wird ueber die Zustandsmaschine, nicht daran vorbei.
 *
 * @returns { ok, geaendert, befunde }
 */
export function registerNachziehen(bericht, options = {}) {
  const log = options.log || { log() {}, error() {} };
  const pfad = options.registerPfad
    ? (options.registerPfad.startsWith("/")
        ? options.registerPfad : join(ROOT, options.registerPfad))
    : join(ROOT, JOB_REGISTER_DATEI);

  if (!existsSync(pfad)) {
    return { ok: true, geaendert: false, befunde: [], grund: "keinRegister" };
  }

  let datei = null;
  try { datei = JSON.parse(readFileSync(pfad, "utf8")); }
  catch (err) { datei = null; }

  if (!datei) {
    /* Da, aber unlesbar. Nicht stillschweigend weitergehen: wer den
       Slot zaehlt, bekaeme eine Zahl, die niemand kennt. */
    log.error("\nWARNUNG: " + JOB_REGISTER_DATEI + " ist nicht lesbar. " +
      "Der Job-Zustand wurde NICHT abgeglichen.");
    return { ok: false, geaendert: false, befunde: [], grund: "registerUnlesbar" };
  }

  const art = bericht.state === "COMPLETED" ? "LEDGER_COMPLETED"
    : bericht.state === "REJECTED" ? "LEDGER_REJECTED" : null;
  if (!art) {
    return { ok: true, geaendert: false, befunde: [], grund: "keinAbschluss" };
  }

  const registry = Job.createRegistry(datei.jobs || []);
  const betroffen = (datei.jobs || [])
    .filter((j) => j.processingKey === bericht.processingKey);

  if (!betroffen.length) {
    log.log("\nKein Job-Registereintrag zu diesem Schluessel — nichts abzugleichen.");
    return { ok: true, geaendert: false, befunde: [], grund: "keinEintrag" };
  }

  const befunde = [];
  let geaendert = false;
  for (const j of betroffen) {
    const r = registry.reconcile(j.creativeJobId, art,
      { now: options.now, note: "ingest-creative" });
    befunde.push({ creativeJobId: j.creativeJobId, contentId: j.contentId,
      from: r.from || j.state, to: r.geaendert ? r.to : j.state,
      geaendert: !!r.geaendert, reason: r.reason });
    log.log("\nJob-Register: " + j.contentId + " " + (r.from || j.state) +
      (r.geaendert ? " -> " + r.to : " (unveraendert: " + r.reason + ")"));
    if (r.geaendert) geaendert = true;
  }

  if (geaendert) {
    writeFileSync(pfad, JSON.stringify(Object.assign({}, datei,
      { jobs: registry.all(), reconciledAt: options.now }), null, 2) + "\n");
    log.log("Job-Register fortgeschrieben: " + JOB_REGISTER_DATEI);
  }

  return { ok: true, geaendert, befunde };
}

/* ------------------------------------------------------------------ */
/* DAS ABLEGEN                                                         */
/* ------------------------------------------------------------------ */

/** Schreibt Ergebnis und Assets ins Arbeitsverzeichnis. Erst nach der Pruefung. */
export function legeAb(ref, contentId, bericht) {
  if (!bericht.ok) {
    throw new Error("legeAb: ein nicht bestaetigtes Ergebnis wird nicht abgelegt.");
  }
  const verzeichnis = join(ROOT, ChatGptWork.requestDir(contentId));
  mkdirSync(verzeichnis, { recursive: true });
  const geschrieben = [];

  const ziel = join(verzeichnis, "authoring-result.json");
  writeFileSync(ziel, bericht.resultRaw);
  geschrieben.push(ziel);

  /* Ein nicht bestaetigtes Ergebnis kommt hier ohnehin nicht an. Diese
     zweite Schranke steht trotzdem: der teuerste Fehler waere, ein
     vertragswidriges Bild auf die Platte zu schreiben, und eine
     Schranke, die nur mittelbar haelt, haelt bei der naechsten
     Umstellung vielleicht nicht mehr. */
  if (bericht.requestType === Contract.TEXT_REVISION &&
      (bericht.result.visual_variants || []).length) {
    throw new Error("legeAb: eine TEXT_REVISION legt keine Bilder ab.");
  }

  for (const v of (bericht.result.visual_variants || [])) {
    if (!v || !v.asset_path) continue;
    const bytes = zeigeDatei(ref, v.asset_path);
    if (!bytes) throw new Error("legeAb: Asset " + v.asset_path + " nicht im Ref.");

    /* Nach dem Schreiben noch einmal vom DATENTRAEGER lesen. Der
       Bildproof hat gezeigt, dass ein Transfer auf halbem Weg enden
       kann und der Anfang trotzdem stimmt. */
    const assetZiel = join(ROOT, v.asset_path);
    mkdirSync(dirname(assetZiel), { recursive: true });
    writeFileSync(assetZiel, bytes);

    const zurueck = readFileSync(assetZiel);
    const nachher = AssetIntegrity.verify(zurueck, {
      sha256: v.asset_sha256, mimeType: v.mime_type,
      width: v.width, height: v.height });
    if (!nachher.ok) {
      throw new Error("legeAb: das abgelegte Asset " + v.asset_path +
        " haelt der Rueckleseprobe nicht stand: " + nachher.explanation);
    }
    geschrieben.push(assetZiel);
  }

  return geschrieben;
}

/* ------------------------------------------------------------------ */
/* DAS LEDGER                                                          */
/* ------------------------------------------------------------------ */

export function ledgerLaden() {
  const pfad = join(ROOT, LEDGER_DATEI);
  const roh = existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : { entries: [] };
  const l = Ledger.createLedger(roh.entries || [], roh.latencyObservations || []);
  return { ledger: l, pfad: pfad };
}

/**
 * Wann wurde das Ergebnis committet?
 *
 * Nicht "jetzt": zwischen dem Commit des Agenten und unserem Einlesen
 * liegt beliebig viel Zeit. Eine Laufzeit, die unsere Reaktionszeit
 * mitmisst, misst den Anbieter nicht mehr.
 */
export function ergebnisZeitpunkt(ref, contentId, repoRoot) {
  const pfad = ChatGptWork.requestDir(contentId) + "/authoring-result.json";
  try {
    const aus = execFileSync("git",
      ["log", "-1", "--format=%cI", ref, "--", pfad],
      { cwd: repoRoot || ROOT, encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"] }).trim();
    return aus || null;
  } catch (err) {
    return null;
  }
}

/**
 * Traegt die gemessene Laufzeit nach, wenn ein Ergebnis bestaetigt ist.
 *
 * Ohne diesen Schritt bleibt die Frist fuer immer im BOOTSTRAP-Regime:
 * drei Stufen, von denen zwei unerreichbar sind, waeren keine Skala.
 */
export function laufzeitNachtragen(ledger, bericht, ref, options) {
  options = options || {};
  if (!bericht || !bericht.ok || !bericht.processingKey) return null;

  const eintraege = ledger.all().filter((e) =>
    e.processingKey === bericht.processingKey && e.observed === true);
  const zeiten = eintraege.map((e) => e.at).filter(Boolean).sort();
  if (!zeiten.length) return null;

  const letzteAktivitaet = zeiten[zeiten.length - 1];
  const fertig = options.resultAt ||
    ergebnisZeitpunkt(ref, bericht.result.content_id, options.repoRoot);
  if (!fertig) return null;

  const sekunden = (Date.parse(fertig) - Date.parse(letzteAktivitaet)) / 1000;
  return ledger.recordLatency({
    processingKey: bericht.processingKey,
    contentId: bericht.result.content_id,
    seconds: sekunden,
    startedAt: letzteAktivitaet,
    resultAt: fertig,
    source: "ingest"
  });
}

export function ledgerSchreiben(pfad, ledger, nowIso) {
  writeFileSync(pfad, JSON.stringify(ledger.snapshot({ now: nowIso }), null, 2) + "\n");
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const CONTENT_ID = String(arg("content-id", "")).trim();
  const REF = String(arg("ref", "")).trim() ||
    ("origin/authoring/request/" + CONTENT_ID);
  const NOW = arg("now", new Date().toISOString());

  if (!CONTENT_ID) { console.error("Kein --content-id."); process.exit(2); }

  console.log("VISION UNIVERSE SOCIAL — Creative Ingest");
  console.log("Inhalt: " + CONTENT_ID);
  console.log("Ref:    " + REF);

  const bericht = pruefeErgebnis(REF, CONTENT_ID);
  console.log("\nZustand: " + bericht.state);
  console.log(bericht.explanation);

  if (bericht.pending) {
    console.log("\nNichts zu tun. Der naechste Lauf findet es vor.");
    process.exit(0);
  }

  if (bericht.briefBlobSha) {
    console.log("\nBrief-Blob:    " + bericht.briefBlobSha);
    console.log("Processing Key: " + bericht.processingKey);
  }

  if (bericht.verification) {
    const v = bericht.verification;
    console.log("\n--- ERGEBNIS ---");
    console.log(v.ok ? "Kennungen und Grenzen bestaetigt."
                     : "Befunde:\n  " + (v.findings || []).map((f) =>
                         f.id + ": " + f.message).join("\n  "));
  }
  if (bericht.assets) {
    console.log("\n--- ASSET ---");
    /* Bei einer TEXT_REVISION meldet der Transportvertrag PENDING, weil
       es keine Bildvariante zu pruefen gab. Das ohne Einordnung
       hinzuschreiben liest sich wie eine offene Aufgabe - dabei ist
       genau das der erfuellte Auftrag. */
    console.log(bericht.assets.state + " — " + bericht.assets.explanation +
      (bericht.revision
        ? " Bei einer TEXT_REVISION ist das die Erfuellung, nicht ein Mangel."
        : ""));
  }
  if (bericht.revision) {
    const rv = bericht.revision;
    console.log("\n--- REVISIONSVERTRAG ---");
    console.log((rv.ok ? "Alle Pflichtpruefungen bestanden." : "CONTRACT_MISMATCH.") +
      " Geerbtes Asset: " +
      (rv.inheritedAsset.ok ? "unveraendert zurueckgelesen."
                            : rv.inheritedAsset.explanation));
    if (!rv.ok) {
      (rv.findings || []).forEach((f) =>
        console.error("  " + f.check + ": " + f.message));
    }
  }

  /* --------------------------------------------------------- Das Ledger */

  /* Nur drei Zustaende gehoeren ins Ledger, und zwei davon sind
     endgueltig. Ein fehlender Brief, ein unlesbares JSON oder eine
     Abweichung in unserer eigenen SHA-Rechnung sind Befunde ueber die
     Umgebung oder ueber uns — sie als REJECTED einzutragen wuerde den
     Schluessel dauerhaft verbrennen, obwohl der Agent nichts falsch
     gemacht hat. */
  const LEDGER_ZUSTAENDE = ["COMPLETED", "REJECTED", "RECOVERY_REQUIRED"];
  if (!bericht.processingKey || LEDGER_ZUSTAENDE.indexOf(bericht.state) === -1) {
    console.log("\nKein Ledger-Eintrag: " + bericht.state + " ist kein Befund ueber " +
      "das Ergebnis des Agenten.");
    process.exit(1);
  }

  const { ledger, pfad } = ledgerLaden();
  const vorher = ledger.get(bericht.processingKey);
  if (vorher && Ledger.TERMINAL.indexOf(vorher.state) !== -1) {
    console.log("\nDieser Schluessel ist bereits abgeschlossen (" + vorher.state +
      "). Ein fertiges Ergebnis wird nicht ueberschrieben.");
    process.exit(0);
  }

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(bericht.ok ? 0 : 1);
  }

  if (bericht.ok) {
    const dateien = legeAb(REF, CONTENT_ID, bericht);
    console.log("\nAbgelegt:");
    for (const d of dateien) console.log("  " + d.replace(ROOT + "/", ""));
  }

  /* Die Messung vor dem Eintrag: sie beschreibt denselben Vorgang und
     soll nicht an einem spaeteren Fehler verlorengehen. */
  const gemessen = laufzeitNachtragen(ledger, bericht, REF);
  if (gemessen && gemessen.written) {
    console.log("\nLaufzeit gemessen und aufgeschrieben. Die Frist waechst mit " +
      "den Daten, statt eine Konstante zu bleiben.");
  }

  ledger.record({
    processingKey: bericht.processingKey,
    state: bericht.state,
    at: NOW,
    contentId: CONTENT_ID,
    briefId: bericht.briefId,
    briefBlobSha: bericht.briefBlobSha,
    pullRequest: arg("pr", null) ? Number(arg("pr", null)) : null,
    observed: true,
    note: bericht.explanation
  });
  ledgerSchreiben(pfad, ledger, NOW);
  console.log("\nLedger fortgeschrieben: " + LEDGER_DATEI);

  /* -------------------------------------------------------------------
     UND DAS JOB-REGISTER — DER RUECKWEG, DER GEFEHLT HAT

     Bis hierher schrieb dieses Skript ausschliesslich ins Ledger. Der
     Orchestrator zaehlt aber das JOB-REGISTER, wenn er
     MAX_OPEN_CREATIVE_JOBS prueft. Ein abgeschlossener Job blieb dort
     auf CREATIVE_JOB_IN_FLIGHT stehen und blockierte den einen Slot —
     einmal 51 Stunden lang, und ohne diesen Block fuer immer: es gibt
     keine Altersregel, die ihn je freigaebe.

     Zwei Register fuer dieselbe Tatsache, und nur eines wurde
     fortgeschrieben. Die Bruecke ist der processing_key; er steht auf
     beiden Seiten und verbindet sie eindeutig.

     Gegangen wird ueber die Zustandsmaschine, nicht daran vorbei: der
     Job nimmt dieselben Uebergaenge, die er im Betrieb genommen
     haette, und jeder schreibt seine History. Ist er schon terminal,
     passiert nichts — auch kein zweiter History-Eintrag.
     ------------------------------------------------------------------- */
  registerNachziehen(bericht, { now: NOW, log: console });

  process.exit(bericht.ok ? 0 : 1);
}

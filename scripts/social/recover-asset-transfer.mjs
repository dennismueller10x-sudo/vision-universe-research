/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/recover-asset-transfer.mjs

   DIE WIEDERHOLUNG DES TRANSPORTS, NICHT DER ERZEUGUNG

   -------------------------------------------------------------------------
   WAS HIER WIEDERHOLT WIRD - UND WAS NICHT
   -------------------------------------------------------------------------

   PR 106 hat ein Bild ERZEUGT und nicht ZUGESTELLT. Text, Caption,
   Visual Brief und Ergebnisdokument waren einwandfrei; nur die Datei kam
   beschaedigt an.

   Den Creative Agent deswegen noch einmal laufen zu lassen, hiesse eine
   bereits geleistete Arbeit wegzuwerfen, weil ein Dateitransfer
   abgerissen ist. Es kostet einen Work-Aufruf, erzeugt ein ANDERES Bild
   und beantwortet die Frage nicht, ob der Transport funktioniert.

   Dieser Weg wiederholt deshalb nur den Transport.

   -------------------------------------------------------------------------
   KEIN FORCE-UPDATE
   -------------------------------------------------------------------------

   Der erste Bildproof brauchte einen Force-Update, um ein beschaedigtes
   Asset zu ersetzen. Als einmalige Rettung war das in Ordnung. Als
   Produktionspfad waere es das Gegenteil von Provenance: der Beweis, DASS
   etwas schiefging, verschwindet zusammen mit dem Schaden.

   Stattdessen:

     ASSET_TRANSFER_FAILED
       -> das beschaedigte Asset BLEIBT liegen, unter eigenem Namen
       -> ein neuer, unveraenderlicher Recovery-Commit legt die korrekte
          Fassung daneben
       -> frisches Ruecklesen vom finalen Commit
       -> erst dann VU_VERIFIED_COMPLETED

   Kein History-Rewrite. Wer spaeter fragt, was passiert ist, findet
   beide Fassungen und den Grund dazwischen.

   -------------------------------------------------------------------------
   WOHER DIE KORREKTE FASSUNG KOMMT
   -------------------------------------------------------------------------

   Aus einer Quelle, die selbst geprueft ist - eine lokale Datei, deren
   Hash zur Ankuendigung des Agenten passt. Gibt es keine solche Quelle,
   endet dieser Weg mit einem Nein. Ein Recovery, das sich seine Wahrheit
   selbst ausdenkt, ist kein Recovery.

   Ausfuehren:
     node scripts/social/recover-asset-transfer.mjs --content-id X --ref <git-ref>
     node scripts/social/recover-asset-transfer.mjs --content-id X --ref <git-ref> --source <datei> --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Transport = require(join(ROOT, "social/engines/asset-transport.js"));
const Integrity = require(join(ROOT, "social/engines/asset-integrity.js"));

/** Das beschaedigte Asset behaelt seinen Platz und bekommt einen Namen. */
export function quarantaenePfad(assetPfad, versuch) {
  const punkt = assetPfad.lastIndexOf(".");
  const stamm = punkt === -1 ? assetPfad : assetPfad.slice(0, punkt);
  const endung = punkt === -1 ? "" : assetPfad.slice(punkt);
  return stamm + ".failed-" + String(versuch).padStart(2, "0") + endung;
}

export function zeigeDatei(ref, pfad, repoRoot) {
  try {
    return execFileSync("git", ["show", ref + ":" + pfad],
      { cwd: repoRoot || ROOT, maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) { return null; }
}

/**
 * Was ist mit dem Asset dieses Ergebnisses los?
 *
 * Gibt immer einen Bericht zurueck; ein Nein ist ein Ergebnis.
 */
export function pruefeTransport(ref, contentId, options) {
  options = options || {};
  const wurzel = options.repoRoot || ROOT;
  const verzeichnis = ChatGptWork.requestDir(contentId);

  const ergebnisRoh = zeigeDatei(ref, verzeichnis + "/authoring-result.json", wurzel);
  if (!ergebnisRoh) {
    return { ok: false, reason: "noResult",
      explanation: "Unter " + verzeichnis + " liegt kein Ergebnis." };
  }

  let ergebnis;
  try { ergebnis = JSON.parse(String(ergebnisRoh)); }
  catch (err) {
    return { ok: false, reason: "resultUnreadable",
      explanation: "Das Ergebnis ist kein gueltiges JSON: " + err.message };
  }

  const variante = (ergebnis.visual_variants || [])[0];
  if (!variante || !variante.asset_path) {
    return { ok: false, reason: "noAsset",
      explanation: "Das Ergebnis nennt kein Bildasset." };
  }

  const bytes = zeigeDatei(ref, variante.asset_path, wurzel);
  const befund = Transport.verifyTransfer(bytes, variante, { freshReadback: true });

  return {
    ok: befund.ok, reason: befund.ok ? null : "transferFailed",
    transfer: befund, variant: variante, result: ergebnis,
    agentStatus: (ergebnis.processing || {}).status || null,
    completion: Transport.verifyCompletion({
      agentStatus: (ergebnis.processing || {}).status,
      resultJsonValid: true, identitiesValid: true, transfer: befund }),
    explanation: befund.explanation
  };
}

/**
 * Sucht eine geprueft korrekte Quelle fuer die Wiederherstellung.
 *
 * Die Quelle muss den Hash tragen, den der Agent angekuendigt hat -
 * sonst waere sie ein anderes Bild, und das Ergebnis wuerde etwas
 * behaupten, das nicht stimmt.
 */
export function pruefeQuelle(quellPfad, variante) {
  if (!existsSync(quellPfad)) {
    return { ok: false, reason: "sourceMissing",
      explanation: "Die Quelle " + quellPfad + " gibt es nicht." };
  }
  const bytes = readFileSync(quellPfad);
  const befund = Transport.verifyTransfer(bytes, variante, { freshReadback: false });

  /* Der frische Readback fehlt hier notwendigerweise - die Quelle liegt
     ja noch vor dem Schreiben. Alles andere muss stimmen. */
  const ohneReadback = befund.findings.filter((f) => f.check !== "freshReadbackValid");
  if (ohneReadback.length) {
    return { ok: false, reason: "sourceInvalid", findings: ohneReadback,
      explanation: "Die Quelle taugt nicht: " +
        ohneReadback.map((f) => f.check + ": " + f.message).join(" ") };
  }
  return { ok: true, reason: null, bytes: bytes, sha256: Integrity.sha256(bytes),
    explanation: "Die Quelle traegt den angekuendigten Hash und ist strukturell heil." };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const CONTENT_ID = String(arg("content-id", "")).trim();
  const REF = String(arg("ref", "")).trim() ||
    ("origin/authoring/request/" + CONTENT_ID);
  const QUELLE = arg("source", null);

  if (!CONTENT_ID) { console.error("Kein --content-id."); process.exit(2); }

  console.log("VISION UNIVERSE SOCIAL — Transport-Wiederherstellung");
  console.log("Inhalt: " + CONTENT_ID);
  console.log("Ref:    " + REF);

  const lage = pruefeTransport(REF, CONTENT_ID);
  console.log("\n--- LAGE ---");
  console.log(lage.explanation);
  if (lage.completion) {
    console.log("\nAGENT_REPORTED_COMPLETED  " + lage.completion.agentReportedCompleted);
    console.log("VU_VERIFIED_COMPLETED     " + lage.completion.vuVerifiedCompleted);
    if (lage.completion.missing.length) {
      console.log("Offen: " + lage.completion.missing.join(", "));
    }
  }

  if (lage.ok) {
    console.log("\nNichts wiederherzustellen: der Transport ist in Ordnung.");
    process.exit(0);
  }
  if (!lage.transfer) process.exit(3);

  console.log("\nFehlertyp: " + lage.transfer.failureType +
    "  (Inhaltsurteil: " + lage.transfer.contentJudgement + ")");
  console.log("Das beschaedigte Asset bleibt liegen als:");
  console.log("  " + quarantaenePfad(lage.variant.asset_path, 1));

  if (!QUELLE) {
    console.log("\nKeine --source angegeben. Ohne geprueft korrekte Quelle wird");
    console.log("nichts wiederhergestellt - ein Recovery, das sich seine Wahrheit");
    console.log("selbst ausdenkt, ist keines.");
    console.log("\nDer Creative Agent wird dafuer NICHT erneut aufgerufen: er hat");
    console.log("seine Arbeit geleistet, es ist der Transport, der scheiterte.");
    process.exit(4);
  }

  const quelle = pruefeQuelle(QUELLE, lage.variant);
  console.log("\n--- QUELLE ---");
  console.log(quelle.explanation);
  if (!quelle.ok) process.exit(5);

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    console.log("Mit --write entstuende EIN neuer Commit, der die korrekte Fassung");
    console.log("NEBEN die beschaedigte legt. Kein Force-Update, kein History-Rewrite.");
    process.exit(0);
  }

  const ziel = join(ROOT, lage.variant.asset_path);
  const quarantaene = join(ROOT, quarantaenePfad(lage.variant.asset_path, 1));
  mkdirSync(dirname(ziel), { recursive: true });

  const kaputt = zeigeDatei(REF, lage.variant.asset_path);
  if (kaputt) writeFileSync(quarantaene, kaputt);
  writeFileSync(ziel, quelle.bytes);

  /* Und noch einmal vom Datentraeger, bevor irgendetwas als gut gilt. */
  const nachher = Transport.verifyTransfer(readFileSync(ziel), lage.variant,
    { freshReadback: true });
  if (!nachher.ok) {
    console.error("\nDie abgelegte Fassung haelt der Rueckleseprobe nicht stand: " +
      nachher.explanation);
    process.exit(6);
  }

  console.log("\nAbgelegt:");
  console.log("  " + lage.variant.asset_path + "        (korrigiert)");
  console.log("  " + quarantaenePfad(lage.variant.asset_path, 1) + "  (beschaedigt, bleibt)");
  console.log("\nBeide Fassungen bleiben erhalten. Der Commit ist noch zu setzen -");
  console.log("diese Aufgabe schreibt Dateien und macht keine Geschichte.");
}

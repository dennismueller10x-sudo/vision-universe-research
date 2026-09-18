/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/store-asset.mjs

   DAS BINAERASSET IN DEN VU-EIGENEN SPEICHER

   -------------------------------------------------------------------------
   WARUM NICHT EINFACH IN GIT
   -------------------------------------------------------------------------

   Ein 1,9-MB-PNG in der Git-Historie ist fuer immer dort. Jeder Klon
   traegt es mit, auch wenn der Beitrag nie erschienen ist, und bei
   einem Bild pro Content Object waechst das Repository mit jedem Lauf.

   GitHub bleibt Source of Truth fuer alles, was man liest, vergleicht
   und begruendet: Vertraege, Briefs, Result JSON, Provenance, Code,
   Strategie. Das Binaerasset gehoert in einen Objektspeicher.

   -------------------------------------------------------------------------
   KEIN NEUER DIENST
   -------------------------------------------------------------------------

   scripts/market/storage/s3-driver.mjs spricht S3 in reinem Node und
   laeuft in der Quant-Historie produktiv - gegen dieselben
   Zugangsdaten (VU_HISTORY_S3_*), die als Repository-Secrets bereits
   gesetzt sind. Keine neue Infrastruktur, keine neuen laufenden Kosten,
   keine Owner-Eskalation.

   -------------------------------------------------------------------------
   HOCHGELADEN IST NICHT ANGEKOMMEN
   -------------------------------------------------------------------------

   Dieselbe Lehre wie beim GitHub-Weg, und aus demselben Anlass: PR 106
   meldete `completed` und lieferte ein beschaedigtes Asset. Nach dem
   Schreiben wird deshalb ZURUECKGELESEN - aus dem Speicher, nicht aus
   dem Puffer, aus dem geschrieben wurde. Eine Pruefung gegen den
   eigenen Puffer prueft nur, dass wir richtig abgeschrieben haben.

   Ausfuehren:
     node scripts/social/store-asset.mjs --content-id vu-xom-20260911
     node scripts/social/store-asset.mjs --content-id vu-xom-20260911 --write
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createS3DriverFromEnv } from "../market/storage/s3-driver.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Store = require(join(ROOT, "social/engines/asset-store.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));

export const NOETIGE_UMGEBUNG = [
  "VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET",
  "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"
];

/** Fehlt etwas, um ueberhaupt zu speichern? */
export function fehlendeUmgebung(env) {
  return NOETIGE_UMGEBUNG.filter((n) => !(env || {})[n]);
}

/**
 * Legt ein geprueftes Asset ab und liest es zurueck.
 *
 * `driver` wird uebergeben, damit der Weg ohne echten Speicher
 * pruefbar bleibt — ein Test, der ein Bild nach R2 laedt, ist kein
 * Test, sondern eine Rechnung.
 */
export async function ablegen(driver, bytes, angekuendigt, options = {}) {
  const schluessel = Store.key({
    sha256: angekuendigt.asset_sha256 || angekuendigt.sha256,
    mime: angekuendigt.mime_type || angekuendigt.mime
  });

  await driver.put(schluessel, bytes, {
    contentType: angekuendigt.mime_type || angekuendigt.mime,
    metadata: {
      "content-id": options.contentId || "",
      "visual-variant-id": angekuendigt.visual_variant_id || "",
      "sha256": angekuendigt.asset_sha256 || angekuendigt.sha256 || ""
    }
  });

  /* Frisch AUS DEM SPEICHER, nicht aus dem Puffer. */
  const zurueck = await driver.get(schluessel);
  const befund = Store.ingest(zurueck, angekuendigt, {
    freshReadback: true,
    contentId: options.contentId,
    visualVariantId: angekuendigt.visual_variant_id,
    generator: options.generator || "chatgpt-work"
  });

  return Object.assign({}, befund, { key: schluessel });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const CID = arg("content-id", null);
  const WRITE = args.includes("--write");

  if (!CID) { console.error("Kein --content-id."); process.exit(2); }

  const ergebnisPfad = join(ROOT, ChatGptWork.requestDir(CID), "authoring-result.json");
  if (!existsSync(ergebnisPfad)) {
    console.error("Kein Ergebnis unter " + ergebnisPfad + ".");
    process.exit(2);
  }
  const ergebnis = JSON.parse(readFileSync(ergebnisPfad, "utf8"));
  const variante = (ergebnis.visual_variants || [])[0];
  if (!variante) {
    console.error("Dieses Ergebnis traegt kein Visual — nichts zu speichern.");
    process.exit(0);
  }

  console.log("VISION UNIVERSE SOCIAL — Asset Storage");
  console.log("Inhalt:     " + CID);
  console.log("Asset:      " + variante.asset_path);
  console.log("Schluessel: " + Store.key({ sha256: variante.asset_sha256,
    mime: variante.mime_type }));

  const fehlt = fehlendeUmgebung(process.env);
  if (fehlt.length) {
    console.log("\n--- SPEICHER ---");
    console.log("Nicht konfiguriert. Es fehlen: " + fehlt.join(", "));
    console.log("Diese Secrets sind im Repository bereits gesetzt und werden");
    console.log("von der Quant-Historie benutzt; lokal liegen sie nicht vor.");
    console.log("\nDas ist kein Fehler dieses Laufs — es heisst, dass hier");
    console.log("nicht gespeichert werden kann. Erfunden wird nichts.");
    process.exit(0);
  }

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts hochgeladen.)");
    process.exit(0);
  }

  const bytes = readFileSync(join(ROOT, variante.asset_path));
  const driver = createS3DriverFromEnv(process.env);
  const befund = await ablegen(driver, bytes, variante, { contentId: CID });

  console.log("\n--- SPEICHER ---");
  console.log(befund.ok ? "Abgelegt und zurueckgelesen: " + befund.key
    : "FEHLGESCHLAGEN: " + befund.explanation);
  process.exit(befund.ok ? 0 : 6);
}

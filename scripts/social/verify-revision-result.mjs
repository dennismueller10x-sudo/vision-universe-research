/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-revision-result.mjs

   DIE VIERZEHN PFLICHTPRUEFUNGEN EINER TEXT_REVISION

   -------------------------------------------------------------------------
   WARUM EIGENE PRUEFUNGEN
   -------------------------------------------------------------------------

   Bei FULL_CREATIVE fragt der Transportvertrag: ist das Bild heil
   angekommen? Bei TEXT_REVISION lautet die Frage anders und fast
   umgekehrt: ist das Bild UNVERAENDERT GEBLIEBEN?

   Ein neues Bild ist hier kein Mehrwert, sondern der Vertragsbruch. Es
   kostet eine begrenzte Ressource UND macht die Wirkung des neuen
   Textes unmessbar, weil sich zwei Dinge zugleich geaendert haetten -
   und genau dafuer gibt es die Revision.

   -------------------------------------------------------------------------
   WAS EIN STILLER AUSTAUSCH ANRICHTET
   -------------------------------------------------------------------------

   Ein fehlendes Bild faellt auf. Ein VERTAUSCHTES nicht: der Kandidat
   sieht fertig aus, die Kennung stimmt formal, und erst die
   Leistungsmessung waere hinterher auf ein anderes Bild bezogen als
   der Text, den sie erklaeren soll. Deshalb wird nicht nur geprueft,
   DASS ein Bild da ist, sondern dass es DASSELBE ist - Kennung, Hash,
   Format und Masse einzeln.

   Ausfuehren:
     node scripts/social/verify-revision-result.mjs --content-id vu-xom-20260911-rev2
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Contract = require(join(ROOT, "social/engines/creative-contract.js"));
const Store = require(join(ROOT, "social/engines/asset-store.js"));

export const PRUEFUNGEN = [
  "requestTypeCorrect", "hookVariantsPresent", "captionPresent",
  "noCanonicalSelection", "publishingDenied", "processingCompleted",
  "processingKeyCorrect", "visualResolutionInherited",
  "visualVariantIdUnchanged", "assetHashUnchanged", "mimeUnchanged",
  "dimensionsUnchanged", "noNewVisualVariant", "noNewAssetPath"
];

/**
 * `brief` und `result` als Daten hinein, Befund heraus. Gelesen wird nur
 * ueber `options.readInheritedAsset` - so laesst sich diese Funktion
 * gegen erfundene Faelle pruefen und liest trotzdem echte Bytes.
 *
 * Dieser Leser ist PFLICHT und hat keinen Vorgabewert. Ohne ihn waere
 * das geerbte Asset ungeprueft, und ein Aufrufer, der ihn schlicht
 * vergisst, bekaeme ein stillschweigendes Bestanden - dieselbe
 * Defektklasse, gegen die die vierzehn Pruefungen ueberhaupt antreten.
 */
export function verify(brief, result, options = {}) {
  const b = brief || {};
  const r = result || {};
  const v = b.visual || {};
  const geerbt = r.inherited_visual || {};
  const varianten = Array.isArray(r.visual_variants) ? r.visual_variants : [];

  /* -----------------------------------------------------------------
     ZWEI SCHREIBWEISEN - EIN LESER

     Auftrag und Ergebnis duerfen die Erbfelder flach (`asset_sha256`)
     oder in der Quellsicht (`source_asset_sha256`) benennen. Gelesen
     wird das mit DEMSELBEN Helfer, den auch creative-contract.js
     benutzt.

     Eine zweite, eigene Normalisierung waere hier naheliegend und
     falsch: zwei Leser gehen irgendwann auseinander, und dann sagt
     der eine Pruefer "in Ordnung", waehrend der andere denselben Lauf
     zurueckweist. Genau dieser Widerspruch ist schon einmal
     aufgetreten - er kostete einen Kandidaten, der still auf den
     alten Report-Text zurueckfiel. */
  const gelesen = {};
  const feld = (flach) => {
    const wert = Contract.geerbtesFeld(geerbt, flach);
    if (wert === Contract.WIDERSPRUCH) {
      gelesen[flach] = { a: geerbt[flach], b: geerbt["source_" + flach] };
      return Contract.WIDERSPRUCH;
    }
    return wert;
  };

  const checks = {};
  const befunde = [];
  const pruefe = (name, ok, message) => {
    checks[name] = ok === true;
    if (ok !== true) befunde.push({ check: name, message });
    return ok === true;
  };

  pruefe("requestTypeCorrect", r.request_type === Contract.TEXT_REVISION,
    "request_type ist " + r.request_type + ", erwartet " + Contract.TEXT_REVISION + ".");
  pruefe("hookVariantsPresent",
    Array.isArray(r.hook_variants) && r.hook_variants.length > 0,
    "Keine Hook-Varianten - das war der ganze Auftrag.");
  pruefe("captionPresent", !!(r.caption && String(r.caption).trim()),
    "Keine Caption.");
  /* Eine EMPFEHLUNG darf der Agent aussprechen - sie ist redaktioneller
     Rat. Sie darf sich nur nicht zur Auswahl erklaeren. Deshalb reicht
     es nicht, `selected_hook` leer zu finden: die Auswahl koennte
     ebenso gut unter einem anderen Namen dastehen. */
  pruefe("noCanonicalSelection",
    (r.selected_hook === undefined || r.selected_hook === null) &&
    !(r.recommended_hook && r.recommended_hook.is_canonical_selection === true) &&
    !(r.processing && r.processing.canonical_hook_selected === true),
    "Die kanonische Auswahl trifft Vision Universe, nicht der Agent.");
  pruefe("publishingDenied", r.publishing_allowed === false,
    "publishing_allowed muss false sein.");
  pruefe("processingCompleted",
    r.processing && r.processing.status === "completed",
    "processing.status ist nicht completed.");
  pruefe("processingKeyCorrect",
    !options.expectedProcessingKey ||
    (r.processing && r.processing.processing_key === options.expectedProcessingKey),
    "Der Processing Key weicht ab: " +
    (r.processing && r.processing.processing_key) + ".");

  /* --- das Bild: unveraendert, nicht nur vorhanden ------------------- */
  pruefe("visualResolutionInherited", r.visual_resolution === "INHERITED",
    "visual_resolution ist " + r.visual_resolution + ", erwartet INHERITED.");
  pruefe("visualVariantIdUnchanged",
    feld("visual_variant_id") === v.source_visual_variant_id,
    "Andere Bildvariante als im Auftrag: " + String(feld("visual_variant_id")) + ".");
  pruefe("assetHashUnchanged",
    feld("asset_sha256") === v.source_asset_sha256,
    "Anderer Asset-Hash als im Auftrag.");
  /* MIME und Masse duerfen fehlen - dann gelten die des Auftrags. Was
     dasteht, muss aber stimmen: eine ANDERE Angabe ist ein Austausch. */
  pruefe("mimeUnchanged",
    feld("mime_type") === undefined || feld("mime_type") === v.source_mime_type,
    "Anderer MIME-Typ: " + String(feld("mime_type")) + ".");
  pruefe("dimensionsUnchanged",
    (feld("width") === undefined || feld("width") === v.source_width) &&
    (feld("height") === undefined || feld("height") === v.source_height),
    "Andere Abmessungen: " + String(feld("width")) + "x" + String(feld("height")) + ".");

  pruefe("noNewVisualVariant", varianten.length === 0,
    varianten.length + " neue visual_variants, obwohl regeneration_allowed " +
    "false ist. Das ist der Vertragsbruch - nicht das Fehlen eines Bildes.");
  pruefe("noNewAssetPath",
    !varianten.some((x) => x && x.asset_path &&
      x.asset_path !== v.source_asset_reference),
    "Ein neuer Asset-Pfad wurde geschrieben.");

  /* --------------------------------------------------------------- */
  /* DAS GEERBTE ASSET SELBST                                          */
  /* --------------------------------------------------------------- */
  /* Die vierzehn Pruefungen vergleichen, was das ERGEBNIS ueber das
     Bild BEHAUPTET, mit dem, was der AUFTRAG verlangt hat. Beide
     koennen uebereinstimmen, waehrend die Datei danebenliegt: sie
     gehoert keiner von beiden Seiten, sie liegt im Repository. Also
     wird sie zusaetzlich gelesen. */
  const erbe = (() => {
    if (typeof options.readInheritedAsset !== "function") {
      return { checked: false, ok: false,
        explanation: "Kein Leser fuer das geerbte Asset uebergeben - " +
          "es ist damit UNGEPRUEFT, nicht in Ordnung." };
    }
    let bytes = null;
    try { bytes = options.readInheritedAsset(v.source_asset_reference); }
    catch (err) {
      return { checked: true, ok: false,
        explanation: "Das geerbte Asset ist nicht lesbar: " +
          String((err && err.message) || err).slice(0, 160) };
    }
    const ein = Store.ingest(bytes, {
      asset_sha256: v.source_asset_sha256, byte_size: v.source_byte_size,
      mime_type: v.source_mime_type, width: v.source_width,
      height: v.source_height
    }, { freshReadback: true });
    return { checked: true, ok: ein.ok === true, explanation: ein.explanation,
      verification: ein.verification };
  })();
  if (!erbe.ok) befunde.push({ check: "inheritedAssetIntact", message: erbe.explanation });

  Object.keys(gelesen).forEach((k) => {
    befunde.push({ check: "inheritedFieldConflict",
      message: "Das Ergebnis nennt " + k + " zweimal und verschieden: " +
        String(gelesen[k].a) + " vs. " + String(gelesen[k].b) + "." });
  });

  const offen = PRUEFUNGEN.filter((p) => checks[p] !== true);
  return {
    ok: offen.length === 0 && erbe.ok === true,
    inheritedAsset: erbe,
    checks, missing: offen, findings: befunde,
    failureType: offen.length === 0 ? null : "CONTRACT_MISMATCH",
    /* Ein Vertragsverstoss sagt ueber Hook, Evidenz oder Bildstrategie
       nichts. Ihn als Inhaltsfehler zu lernen waere gelernter Unsinn. */
    contentJudgement: false,
    explanation: offen.length === 0
      ? (erbe.ok ? "Alle " + PRUEFUNGEN.length + " Pflichtpruefungen bestanden, " +
                   "das geerbte Asset liegt unveraendert da."
                 : "Die " + PRUEFUNGEN.length + " Pflichtpruefungen bestehen, aber " +
                   "das geerbte Asset selbst nicht: " + erbe.explanation)
      : "Offen: " + offen.join(", ") + "."
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const CID = arg("content-id", "vu-xom-20260911-rev2");

  const dir = join(ROOT, ChatGptWork.requestDir(CID));
  const briefPfad = join(dir, "authoring-brief.json");
  const ergebnisPfad = join(dir, "authoring-result.json");

  if (!existsSync(ergebnisPfad)) {
    console.log("Noch kein Ergebnis unter " + ergebnisPfad + ".");
    process.exit(7);
  }

  const roh = readFileSync(briefPfad);
  const brief = JSON.parse(roh);
  const ergebnis = JSON.parse(readFileSync(ergebnisPfad, "utf8"));
  const sha = ChatGptWork.blobSha(roh);
  const key = ChatGptWork.processingKey(brief.brief_id, CID, sha, "1.0");

  const befund = verify(brief, ergebnis, {
    expectedProcessingKey: key,
    /* Vom Datentraeger, nicht aus dem Puffer, aus dem geschrieben wurde. */
    readInheritedAsset: (pfad) => readFileSync(join(ROOT, pfad))
  });

  console.log("VISION UNIVERSE SOCIAL — TEXT_REVISION Contract");
  console.log("Inhalt: " + CID + "\n");
  PRUEFUNGEN.forEach((p) =>
    console.log((befund.checks[p] ? "  ok   " : "  FAIL ") + p));
  console.log((befund.inheritedAsset.ok ? "  ok   " : "  FAIL ") +
    "geerbtes Asset unveraendert");

  console.log("\n" + befund.explanation);
  if (!befund.ok) {
    befund.findings.forEach((f) => console.error("  " + f.check + ": " + f.message));
    console.error("\nCONTRACT_MISMATCH. Kein Kandidat auf einem vertragswidrigen Ergebnis.");
  }
  process.exit(befund.ok ? 0 : 8);
}

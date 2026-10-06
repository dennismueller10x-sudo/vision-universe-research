/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/check-asset-reachability.mjs

   LIEGT DAS BILD WIRKLICH DORT, WO DER KANDIDAT ES BEHAUPTET?

   -------------------------------------------------------------------------
   WOZU
   -------------------------------------------------------------------------

   Meta holt das Bild beim Veroeffentlichen SELBST ab. Eine Adresse, die
   nur im Kandidaten steht, genuegt nicht - unter ihr muss etwas liegen,
   und zwar dieses Bild.

   Bis hierher hat das niemand gefragt. run-social-cycle.mjs baut die
   Adresse aus der Paketkennung ("die Adresse, unter der das Bild
   oeffentlich WAERE"), und dabei blieb es.

   -------------------------------------------------------------------------
   WAS ES TUT UND WAS NICHT
   -------------------------------------------------------------------------

   Es fragt die Adresse per GET ab und legt die Antwort
   social/engines/asset-delivery.js vor. Es urteilt nicht selbst.

   Es veroeffentlicht nichts, gibt nichts frei, erzeugt kein Bild und
   verbraucht kein Work-Budget. Ein GET auf eine oeffentliche Adresse
   ist genau das, was Meta spaeter auch tut.

   -------------------------------------------------------------------------
   UNGEPRUEFT IST EIN ERGEBNIS
   -------------------------------------------------------------------------

   Aus einer Umgebung ohne Zugang zu research.visionuniverse.de kommt
   UNGEPRUEFT zurueck, nicht NICHT_ERREICHBAR. Der Unterschied ist die
   Lehre aus §45/§49: ein 403 des Egress-Proxy sieht aus wie ein 403 des
   Dienstes, und wer das verwechselt, bestaetigt oder verurteilt etwas,
   das er nie gesehen hat.

   Ausfuehren:
     node scripts/social/check-asset-reachability.mjs
     node scripts/social/check-asset-reachability.mjs --candidate cand_...
     node scripts/social/check-asset-reachability.mjs --json
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Delivery = require(join(ROOT, "social/engines/asset-delivery.js"));

const argv = process.argv.slice(2);
const JSON_AUS = argv.includes("--json");
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

const DATEN = arg("data", "social/data");
const KANDIDATEN = join(ROOT, DATEN, "publish-candidates");

/* Nur Kandidaten, die auf einen Menschen warten. Ein abgeloester oder
   entschiedener Kandidat blockiert nichts und wird nicht gefragt. */
const WARTET = ["AWAITING_APPROVAL"];

function lies(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function wartende() {
  if (!existsSync(KANDIDATEN)) return [];
  return readdirSync(KANDIDATEN)
    .filter((f) => f.endsWith(".json"))
    .map((f) => lies(join(KANDIDATEN, f)))
    .filter((c) => c && WARTET.includes(c.state || c.status));
}

/**
 * Die Adresse abfragen — und mitschreiben, WER geantwortet hat.
 *
 * `redirect: "manual"` ist Absicht: eine Umleitung auf eine Anmeldung
 * ist ein eigener Befund und darf nicht stillschweigend verfolgt
 * werden, bis am Ende ein 200 mit einer Loginseite steht.
 */
async function hole(url) {
  try {
    const antwort = await fetch(url, { method: "GET", redirect: "manual" });
    const headers = {};
    antwort.headers.forEach((v, k) => { headers[k] = v; });

    const typ = String(headers["content-type"] || "").toLowerCase();
    /* Nur bei einem Bildtyp die Bytes lesen. Eine Fehlerseite als
       Binaerpuffer zu behandeln bringt nichts ausser Speicher. */
    let bytes = null, koerperText = null;
    if (antwort.status === 200 && typ.startsWith("image/")) {
      bytes = Buffer.from(await antwort.arrayBuffer());
    } else {
      koerperText = await antwort.text().catch(() => "");
    }

    return {
      antwort: { status: antwort.status, headers, finalUrl: antwort.url || url },
      bytes, koerperText
    };
  } catch (err) {
    return { antwort: null, bytes: null, koerperText: null,
             fehler: String((err && err.message) || err) };
  }
}

/** Was der Kandidat ueber sein Bild behauptet. */
function erwartungAus(c) {
  const p = c.presentation || {};
  const q = p.visualQuality || {};
  const src = p.sourceAsset || (p.visualOrigin === "generative" ? p.asset : null) || {};
  return {
    sha256: src.sha256 || src.asset_sha256 || null,
    mimeType: src.mimeType || src.mime_type || null,
    width: q.width || null,
    height: q.height || null
  };
}

/* ------------------------------------------------------------------ Lauf */
const nurEiner = arg("candidate", null);
const liste = wartende().filter((c) => !nurEiner || c.candidateId === nurEiner);

const ergebnisse = [];
for (const c of liste) {
  const url = (c.content && c.content.imageUrl) || null;
  const geholt = url ? await hole(url) : { antwort: null, fehler: "keine Adresse" };
  const befund = Delivery.beurteile({
    url, antwort: geholt.antwort, bytes: geholt.bytes,
    koerperText: geholt.koerperText, fehler: geholt.fehler,
    erwartet: erwartungAus(c)
  });

  /* Zusaetzlich: liegt die Datei ueberhaupt im Repository? Das
     beantwortet die Ursachenfrage, die ein HTTP-Status offen laesst —
     404 sagt nicht, ob nie etwas da war oder etwas verschwunden ist. */
  const datei = url ? url.split("/").pop() : null;
  const imRepo = datei ? existsSync(join(ROOT, "assets/social", datei)) : false;

  ergebnisse.push({
    candidateId: c.candidateId, url, imRepo,
    zustand: befund.zustand, grund: befund.grund,
    erreichbar: befund.erreichbar, satz: befund.satz,
    status: befund.status ?? null, contentType: befund.contentType ?? null,
    bytes: befund.bytes ?? null, dimensions: befund.dimensions ?? null
  });
}

const alleErreichbar = ergebnisse.length > 0 && ergebnisse.every((r) => r.erreichbar);

if (JSON_AUS) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    ASSET_PUBLICLY_REACHABLE: alleErreichbar,
    waiting: ergebnisse.length,
    results: ergebnisse
  }, null, 2));
} else {
  console.log("VISION UNIVERSE SOCIAL — Erreichbarkeit der Publish-Assets\n");
  if (!ergebnisse.length) {
    console.log("  Kein Kandidat wartet auf Freigabe. Nichts zu pruefen.");
  }
  for (const r of ergebnisse) {
    const z = r.erreichbar ? "OK  " :
      (r.zustand === Delivery.ZUSTAND.UNGEPRUEFT ? "?   " : "FEHL");
    console.log("  " + z + " " + r.candidateId);
    console.log("       " + (r.url || "(keine Adresse)"));
    console.log("       " + r.zustand + (r.grund ? "  (" + r.grund + ")" : ""));
    console.log("       " + r.satz);
    console.log("       Datei im Repository: " + (r.imRepo ? "ja" : "NEIN"));
    console.log("");
  }
  console.log("ASSET_PUBLICLY_REACHABLE  " + (alleErreichbar ? "true" : "false"));
  console.log("\nUngeprueft zaehlt wie nicht erreichbar: die Freigabe bleibt");
  console.log("zu, solange niemand nachgesehen hat.");
}

/* Fail closed: alles ausser "alle erreichbar" endet mit einem Fehlercode. */
process.exit(alleErreichbar ? 0 : 1);

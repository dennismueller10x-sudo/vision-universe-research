/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/p0-regression.mjs

   DER VORFALL VOM 21.09.2026, ALS DAUERHAFTER VERTRAG (§26/§52)

   -------------------------------------------------------------------------
   WAS AN DIESEM TAG PASSIERT IST
   -------------------------------------------------------------------------

     Ein Candidate wurde erzeugt.
     Das Approval Center zeigte sein Bild nicht.
     Der Owner hat ihn testweise freigegeben.
     Instagram nahm den Beitrag an.
     Das Bild war auch dort nicht da.

   Ein oeffentlicher Beitrag ohne Bild, und niemand auf dem Weg dorthin
   hat widersprochen.

   -------------------------------------------------------------------------
   WARUM DIESE DATEI KEIN TEST IST, SONDERN EINE MESSUNG
   -------------------------------------------------------------------------

   Eine Testdatei beweist, dass der Vertrag zum Zeitpunkt des Testlaufs
   hielt. Diese Datei beweist ihn JETZT, im Reifebericht, und sie tut es,
   indem sie die ECHTEN Funktionen des Workers aufruft:

     pruefeFreigabe()   entscheidet ueber OWNER_CAN_APPROVE
     pruefeBild()       entscheidet, was an Meta gehen darf

   Eine Nachbildung haette die Nachbildung bewiesen. Genau diese
   Verwechslung - das Urteil einer Stelle fuer die Sache selbst zu
   nehmen - ist die Ursache des Vorfalls.

   -------------------------------------------------------------------------
   WAS BEWIESEN WERDEN MUSS
   -------------------------------------------------------------------------

     BROKEN_ASSET  ->  OWNER_CAN_APPROVE = false
                       PUBLISH            = unmoeglich

     VALID_ASSET   ->  Vorschau traegt
                       GENAU DIESELBEN Bytes gehen in den Publish-Pfad

   Nicht dieselbe URL. Nicht dieselbe Kennung. Nicht eine
   Erreichbarkeitsmessung von vorhin.

   Ausfuehren:
     node scripts/social/p0-regression.mjs
     node scripts/social/p0-regression.mjs --json
   ========================================================================= */
import { pruefeFreigabe } from "../../workers/vision-universe-social/src/approval.js";
import { __internals } from "../../workers/vision-universe-social/src/index.js";
import { contentHash } from "../../workers/vision-universe-social/src/redact.js";

const { pruefeBild } = __internals;

const ZUSTAND = { ERFUELLT: "ERFUELLT", NICHT_ERFUELLT: "NICHT_ERFUELLT" };

const BILD = "https://research.visionuniverse.de/assets/social/p0-20260921.jpg";
const INHALT = "pkg_p0_20260921";
const TEXT = "Der Beitrag, der am 21.09. ohne Bild hinausging.";

/* -------------------------------------------------------------------
   EIN ECHTES, MINIMALES JPEG

   Dieselbe Bauart wie im Worker-Harness - und ausdruecklich KEIN
   Import von dort: Testhilfsmittel gehoeren nicht in eine Messung, die
   im Reifebericht laeuft. Die Bytes sind hier so klein, dass sie sich
   lesen lassen.
   ------------------------------------------------------------------- */
function jpeg({ width = 1080, height = 1350, fuellung = 0 } = {}) {
  return new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xFF, height & 0xFF, (width >> 8) & 0xFF, width & 0xFF,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
    fuellung & 0xFF,
    0xFF, 0xD9
  ]);
}

async function abdruck(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------
   EIN ASSETHOST, DER SICH WIE EINER VERHAELT

   Der erste Entwurf lieferte die Bytes unabhaengig von der Methode.
   Damit hielt der Vertrag auch dann noch, wenn man pruefeBild auf HEAD
   zuruecksetzte - die Gegenprobe biss nicht, und der Nachweis haette
   einen Rueckfall in genau die Ursache des Vorfalls durchgelassen.

   Ein HEAD gibt Kopfdaten und keinen Koerper. Genau daran scheitert
   eine Pruefung, die die Bytes braucht - und genau das soll sie.
   ------------------------------------------------------------------- */
function antwortMit(bytes, { status = 200, typ = "image/jpeg" } = {}) {
  return async (_url, init) => {
    const methode = ((init && init.method) || "GET").toUpperCase();
    const koerperlos = methode === "HEAD";
    return {
      ok: status >= 200 && status < 300, status,
      headers: new Headers({ "content-type": typ,
        "content-length": String(bytes ? bytes.byteLength : 0) }),
      arrayBuffer: async () => {
        if (koerperlos) return new ArrayBuffer(0);
        return bytes
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          : new ArrayBuffer(0);
      }
    };
  };
}

/** Der Assethost antwortet gar nicht mit einem Bild. */
function antwortFehlt() {
  return async () => ({ ok: false, status: 404, headers: new Headers() });
}

/** Ein Schlangeneintrag, wie ihn die Uebertragung ablegt. */
async function eintrag(asset) {
  const payload = { contentId: INHALT, imageUrl: BILD, caption: TEXT };
  return {
    items: [{
      candidateId: "cand_p0_20260921",
      state: "AWAITING_APPROVAL",
      contentHash: await contentHash(payload),
      payload,
      asset
    }]
  };
}

const GEMESSEN = "2026-09-21T10:00:00Z";

/* ===================================================================
   DIE FAELLE
   =================================================================== */

async function faelle() {
  const gut = jpeg();
  const gutAbdruck = await abdruck(gut);
  const ausgetauscht = jpeg({ fuellung: 7 });
  const kleiner = jpeg({ width: 640, height: 640 });

  const ERREICHBAR = {
    zustand: "ASSET_PUBLICLY_REACHABLE", grund: null, erreichbar: true,
    url: BILD, satz: "Unter dieser Adresse liegt ein gueltiges Bild.",
    gemessenAm: GEMESSEN, sha256: gutAbdruck, bytes: gut.byteLength,
    dimensions: { width: 1080, height: 1350 }
  };

  const ergebnisse = [];

  /* ------------------------------------------------- BROKEN_ASSET */

  ergebnisse.push(await freigabeFall("BROKEN_ASSET_WEG",
    "Unter der Adresse liegt nichts. Genau die Lage vom 21.09.",
    Object.assign({}, ERREICHBAR, {
      zustand: "ASSET_NOT_REACHABLE", grund: "HTTP_404", erreichbar: false,
      satz: "Unter dieser Adresse liegt kein Bild." })));

  ergebnisse.push(await freigabeFall("BROKEN_ASSET_UNGEMESSEN",
    "Niemand hat nachgesehen. Ungeprueft ist kein 'in Ordnung'.",
    { zustand: "ASSET_REACHABILITY_UNVERIFIED", grund: "NOT_ASKED",
      erreichbar: false, url: BILD, satz: "Nicht gemessen.", gemessenAm: null }));

  ergebnisse.push(await freigabeFall("BROKEN_ASSET_OHNE_ABDRUCK",
    "Das Bild ist da - aber nichts belegt, dass es dasselbe ist.",
    (() => { const a = Object.assign({}, ERREICHBAR); delete a.sha256; return a; })()));

  ergebnisse.push(await freigabeFall("BROKEN_ASSET_ANDERE_ADRESSE",
    "Gemessen wurde ein anderes Bild als das, das hinausginge.",
    Object.assign({}, ERREICHBAR, { url: BILD.replace("p0-", "ein-anderes-") })));

  /* Und der Sendepfad selbst, unabhaengig von der Freigabe. */
  ergebnisse.push(await sendeFall("PUBLISH_ASSET_WEG",
    "Der Sendepfad holt selbst - und findet nichts.",
    antwortFehlt(), { sha256: gutAbdruck }, "imageUnreachable"));

  ergebnisse.push(await sendeFall("PUBLISH_ASSET_AUSGETAUSCHT",
    "Gleiche Adresse, andere Datei. Der Kern von §25.",
    antwortMit(ausgetauscht), { sha256: gutAbdruck }, "imageFingerprintMismatch"));

  ergebnisse.push(await sendeFall("PUBLISH_ASSET_ANDERE_MASSE",
    "Andere Masse als bei der Freigabe.",
    antwortMit(kleiner), { sha256: await abdruck(kleiner),
      dimensions: { width: 1080, height: 1350 } }, "imageDimensionsChanged"));

  ergebnisse.push(await sendeFall("PUBLISH_ASSET_KEINE_BILDBYTES",
    "Der Server sagt JPEG und liefert eine Fehlerseite.",
    antwortMit(new Uint8Array([0x3C, 0x21, 0x64, 0x6F])),
    { sha256: gutAbdruck }, "imageNotJpegBytes"));

  ergebnisse.push(await sendeFall("PUBLISH_ASSET_LEER",
    "Ein Inhaltstyp ohne Inhalt ist kein Bild.",
    antwortMit(null), { sha256: gutAbdruck }, "imageEmpty"));

  /* ------------------------------------------------- VALID_ASSET */

  const freigabe = await pruefeFreigabe(await eintrag(ERREICHBAR),
    "cand_p0_20260921", (await eintrag(ERREICHBAR)).items[0].contentHash);

  const sendung = await pruefeBild(BILD, antwortMit(gut), {
    sha256: gutAbdruck, dimensions: { width: 1080, height: 1350 } });

  /* DIE eigentliche Aussage von §52: was der Owner gesehen hat und was
     hinausgeht, sind DIESELBEN BYTES - nachgerechnet, nicht behauptet. */
  const gleich = freigabe.ok && sendung.ok &&
    sendung.sha256 === ERREICHBAR.sha256;

  ergebnisse.push({
    id: "VALID_ASSET_PREVIEW_IST_SENDUNG",
    beschreibung: "Gueltiges Bild: Vorschau traegt, und es gehen genau " +
      "dieselben Bytes hinaus.",
    erwartet: "freigebbar, und der Abdruck der Sendung ist der der Freigabe",
    gemessen: freigabe.ok
      ? (sendung.ok
          ? "freigebbar; Abdruck der Sendung " +
            (sendung.sha256 === ERREICHBAR.sha256 ? "IDENTISCH" : "ABWEICHEND")
          : "freigebbar, aber die Sendung scheitert: " + sendung.reason)
      : "nicht freigebbar: " + freigabe.zustand,
    zustand: gleich ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT
  });

  return ergebnisse;
}

/** Ein Fall, in dem der Owner NICHT freigeben koennen darf. */
async function freigabeFall(id, beschreibung, asset) {
  const schlange = await eintrag(asset);
  const hash = schlange.items[0].contentHash;
  const befund = await pruefeFreigabe(schlange, "cand_p0_20260921", hash);
  return {
    id, beschreibung,
    erwartet: "OWNER_CAN_APPROVE = false",
    gemessen: befund.ok ? "FREIGEBBAR (" + (befund.zustand || "ohne Zustand") + ")"
      : "gesperrt: " + befund.zustand,
    zustand: befund.ok ? ZUSTAND.NICHT_ERFUELLT : ZUSTAND.ERFUELLT
  };
}

/** Ein Fall, in dem nichts an Meta gehen darf. */
async function sendeFall(id, beschreibung, holen, erwartet, grund) {
  const b = await pruefeBild(BILD, holen, erwartet);
  return {
    id, beschreibung,
    erwartet: "PUBLISH unmoeglich (" + grund + ")",
    gemessen: b.ok ? "WUERDE SENDEN" : "gesperrt: " + b.reason,
    /* Nicht nur "es ging nicht": der GRUND muss stimmen. Ein Fall, der
       aus dem falschen Grund scheitert, belegt das Tor nicht, das er
       belegen soll. */
    zustand: (!b.ok && b.reason === grund) ? ZUSTAND.ERFUELLT
      : ZUSTAND.NICHT_ERFUELLT
  };
}

/* ===================================================================
   AUSGABE
   =================================================================== */

export async function p0Befund() {
  const f = await faelle();
  const offen = f.filter((x) => x.zustand !== ZUSTAND.ERFUELLT);
  return {
    id: "P0_ASSET_DELIVERY_20260921",
    vorfall: "21.09.2026 — Beitrag oeffentlich ohne ladbares Bild.",
    faelle: f,
    bestanden: offen.length === 0,
    offen: offen.map((x) => x.id),
    satz: offen.length === 0
      ? f.length + " Faelle geprueft, alle halten. Der Vorfall vom " +
        "21.09. ist an dieser Architektur nicht wiederholbar."
      : offen.length + " von " + f.length + " Faellen halten nicht: " +
        offen.map((x) => x.id).join(", ") + ". Der Vorfall ist wieder moeglich."
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await p0Befund();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(b, null, 2));
  } else {
    console.log("VISION UNIVERSE SOCIAL — P0-REGRESSION (§26/§52)\n");
    console.log("Vorfall: " + b.vorfall + "\n");
    for (const f of b.faelle) {
      console.log("  " + (f.zustand === "ERFUELLT" ? "+" : "x") + " " +
        f.id.padEnd(34) + f.zustand);
      console.log("      " + f.beschreibung);
      console.log("      erwartet: " + f.erwartet);
      console.log("      gemessen: " + f.gemessen);
    }
    console.log("\n" + b.satz);
  }
  process.exit(b.bestanden ? 0 : 1);
}

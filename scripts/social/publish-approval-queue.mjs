/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/publish-approval-queue.mjs

   DIE WARTESCHLANGE AUF DEM WEG ZUM TELEFON

   -------------------------------------------------------------------------
   WARUM EINE PROJEKTION UND KEINE ZWEITE QUELLE
   -------------------------------------------------------------------------

   Die Kandidaten liegen im Repository. Der Worker kann das Repository
   nicht lesen; er laeuft an einem Rand des Netzes, hat einen
   Schluessel-Wert-Speicher und sonst nichts.

   Also muss die Schlange zu ihm. Die Frage ist nur: als was.

   NICHT als eigene Logik im Worker. Der wuesste sonst selbst, was
   "wartet" bedeutet - und eine zweite Definition desselben Begriffs
   geht irgendwann auseinander. Das ist in diesem Projekt schon
   passiert: ein Bericht zaehlte Dateien im Ordner, die Maschine zaehlte
   Zustaende, und die Antworten waren sechs und null.

   Sondern als PROJEKTION: `owner-decision.warteschlange()` rechnet,
   `approval-projection.js` formt, dieses Skript traegt. Der Worker
   speichert und zeigt. Er entscheidet nichts ueber die Schlange, und
   deshalb kann er auch nichts anderes entscheiden als der Orchestrator.

   -------------------------------------------------------------------------
   WAS MITGEHT UND WAS NICHT
   -------------------------------------------------------------------------

   MIT: was veroeffentlicht wuerde (contentId, imageUrl, caption), der
   Abdruck darueber, und was der Owner zur Entscheidung braucht.

   NICHT: der ganze Kandidat. Kein Ledger, keine Bewertungslaeufe,
   keine Briefe, keine internen Kennungen ausser denen, die die
   Entscheidung braucht. Was nicht hinausgeht, kann nicht leaken.

   -------------------------------------------------------------------------
   DAS FENSTER, DAS ES GIBT
   -------------------------------------------------------------------------

   Zwischen zwei Uebertragungen kann sich im Repository etwas aendern -
   ein Kandidat wird abgeloest, ein Owner entscheidet an der Kommando-
   zeile. Die Projektion im Worker ist dann fuer eine Weile aelter als
   die Wahrheit.

   Das wird nicht versteckt, sondern datiert: `generatedAt` reist mit,
   und der Worker sagt, wie alt der Stand ist. Aufgefangen wird das
   Fenster nicht hier, sondern bei der Freigabe: dort wird der Abdruck
   gegen das nachgerechnet, was tatsaechlich gesendet wuerde, und ein
   veralteter Kandidat faellt durch - so wie er es an der Kommandozeile
   auch tut.

   Ausfuehren:
     node scripts/social/publish-approval-queue.mjs                # zeigen
     VU_SOCIAL_ADMIN_KEY=... node scripts/social/publish-approval-queue.mjs --write
     node scripts/social/publish-approval-queue.mjs --out /tmp/queue.json
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ausgabePfad } from "../quality/out-path.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));
const Projection = require(join(ROOT, "social/engines/approval-projection.js"));
const AssetDelivery = require(join(ROOT, "social/engines/asset-delivery.js"));
const ContentHash = require(join(ROOT, "social/engines/content-hash.js"));
const Hashtags = require(join(ROOT, "social/engines/hashtags.js"));
import { keinBeitragNachweis, zustand as orchestratorZustand, kadenz }
  from "./run-orchestrator.mjs";

const WORKER = process.env.VU_SOCIAL_WORKER_URL || "https://social.visionuniverse.de";

/** Liest alle Kandidaten eines Datenstands. */
export function leseKandidaten(verzeichnis) {
  if (!existsSync(verzeichnis)) return [];
  return readdirSync(verzeichnis)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      try { return JSON.parse(readFileSync(join(verzeichnis, f), "utf8")); }
      catch (err) { return { candidateId: f.replace(/\.json$/, ""), state: null, __unlesbar: true }; }
    });
}

/**
 * Die Bildadresse abfragen — genau so, wie Meta es spaeter tut.
 *
 * `redirect: "manual"`: eine Umleitung auf eine Anmeldung ist ein
 * eigener Befund und darf nicht verfolgt werden, bis am Ende ein 200
 * mit einer Loginseite steht.
 */
async function holeAsset(url) {
  if (!url) return { antwort: null, fehler: "keine Adresse" };
  try {
    const antwort = await fetch(url, { method: "GET", redirect: "manual" });
    const headers = {};
    antwort.headers.forEach((v, k) => { headers[k] = v; });
    const typ = String(headers["content-type"] || "").toLowerCase();
    let bytes = null, koerperText = null;
    if (antwort.status === 200 && typ.startsWith("image/")) {
      bytes = Buffer.from(await antwort.arrayBuffer());
    } else {
      koerperText = await antwort.text().catch(() => "");
    }
    return { antwort: { status: antwort.status, headers,
      finalUrl: antwort.url || url }, bytes, koerperText };
  } catch (err) {
    return { antwort: null, bytes: null, koerperText: null,
             fehler: String((err && err.message) || err) };
  }
}

/**
 * Baut die Projektion aus einem Kandidatenbestand.
 *
 * Der Abdruck wird NACHGERECHNET und nicht uebernommen. Zwischen dem
 * Erzeugen des Kandidaten und diesem Lauf liegt Zeit, und in dieser
 * Zeit ist die Datei eine Datei. Weicht der nachgerechnete Abdruck vom
 * eingetragenen ab, geht der Kandidat NICHT hinaus - er ist dann nicht
 * mehr der, ueber den entschieden werden sollte.
 */
export async function baue(kandidaten, options = {}) {
  const schlange = OwnerDecision.warteschlange(kandidaten);

  const nachId = {};
  const abweichend = [];

  for (const k of kandidaten) {
    const id = k && k.candidateId;
    if (!id) continue;
    /* Nur aktive Kandidaten werden nachgerechnet: fuer alles andere
       waere es eine Rechnung ohne Frage. */
    const aktiv = (schlange.active || []).some((z) => z.candidateId === id);
    if (!aktiv) continue;

    const frisch = ContentHash.contentHash({
      contentId: k.content && k.content.contentId,
      imageUrl: k.content && k.content.imageUrl,
      caption: k.content && k.content.caption
    });
    if (frisch !== k.contentHash) {
      abweichend.push({ candidateId: id, eingetragen: k.contentHash, nachgerechnet: frisch });
      continue;
    }
    nachId[id] = k;
  }

  /* -------------------------------------------------------------------
     KOMMT DAS BILD AN? (§4/§5)

     Meta holt das Bild beim Veroeffentlichen SELBST ab. Eine Adresse,
     die nur im Kandidaten steht, genuegt nicht.

     Gemessen wird HIER, weil hier das Netz ist: dieser Schritt laeuft
     im Orchestrator-Workflow und erreicht research.visionuniverse.de.
     Der Worker bekommt das Urteil und zeigt es; er misst nicht selbst
     — sonst gaebe es zwei Begriffe von "erreichbar".

     Ohne `--check-assets` (etwa in einem Test) wird nicht gemessen,
     und die Projektion traegt dann UNGEPRUEFT. Ungeprueft sperrt die
     Freigabe genauso wie unerreichbar; es liest sich nur anders. */
  if (options.pruefeAssets) {
    for (const id of Object.keys(nachId)) {
      const k = nachId[id];
      const url = k.content && k.content.imageUrl;
      const geholt = await holeAsset(url);
      const befund = AssetDelivery.beurteile({
        url,
        antwort: geholt.antwort, bytes: geholt.bytes,
        koerperText: geholt.koerperText, fehler: geholt.fehler
      });
      nachId[id] = Object.assign({}, k, {
        assetDelivery: {
          zustand: befund.zustand, grund: befund.grund,
          satz: befund.satz, gemessenAm: options.now || new Date().toISOString()
        }
      });
    }
  }

  /* -------------------------------------------------------------------
     DER INHALTLICHE STAND REIST MIT (§16/§39–§41)

     Er wird NICHT hier gerechnet: der Orchestrator hat ihn bereits,
     aus derselben Kadenzentscheidung und demselben Suchnachweis, die
     auch sein Bericht zeigt. Ein zweiter Rechenweg waere ein zweiter
     Stand, und der erste, der vom anderen abweicht, gewinnt per
     Zufall.

     Geht er nicht zu ermitteln, bleibt er null - und die Oberflaeche
     sagt dann "nicht uebertragen" statt "nichts passiert". */
  let inhalt = null;
  try {
    const z = orchestratorZustand({ now: options.now });
    inhalt = keinBeitragNachweis(z, kadenz(z));
  } catch (err) {
    inhalt = null;
  }

  const projektion = Projection.projiziere(schlange, nachId,
    { now: options.now, contentStatus: inhalt });

  /* -------------------------------------------------------------------
     EIN GRUND JE KANDIDAT, UND ZWAR DER RICHTIGE

     Ein abweichender Abdruck ist kein stilles Weglassen: der Beitrag
     darf nicht aus der Schlange verschwinden, ohne dass jemand
     erfaehrt, warum.

     Die Projektion sieht ihn aber ebenfalls als fehlend - er steht ja
     nicht in ihrer Karte - und traegt ihn als KANDIDAT_NICHT_GELESEN
     ein. Das ist unwahr: gelesen wurde er, und abgewiesen. Wuerden
     beide Eintraege stehenbleiben, zaehlte derselbe Kandidat zweimal
     als ungeloest, und einer der beiden Gruende schickte die Suche in
     die falsche Richtung - zu einer Datei, die es gibt.

     Deshalb wird ERSETZT und nicht ergaenzt.
     ------------------------------------------------------------------- */
  for (const a of abweichend) {
    const eintrag = {
      candidateId: a.candidateId,
      reason: "CONTENT_HASH_MISMATCH",
      detail: "Der Abdruck in der Datei passt nicht zu ihrem Inhalt. Der Kandidat " +
        "wurde nach seiner Erzeugung veraendert und geht nicht zur Freigabe."
    };
    const schon = projektion.unresolved.findIndex((u) => u.candidateId === a.candidateId);
    if (schon === -1) projektion.unresolved.push(eintrag);
    else projektion.unresolved[schon] = eintrag;
  }
  /* -------------------------------------------------------------------
     TEXT UND TAGS MUESSEN ZUSAMMEN DEN SENDETEXT ERGEBEN (§17)

     Der Worker weist eine Uebertragung zurueck, in der das nicht
     aufgeht - und zwar die GANZE, nicht den einen Eintrag. Dann saehe
     der Owner wegen eines Kandidaten einen alten Stand ohne alle
     anderen.

     Also wird es hier entschieden, wo ein einzelner Kandidat
     herausgenommen werden kann: derselbe Weg wie beim abweichenden
     Abdruck, derselbe Grund-je-Kandidat, dieselbe Sichtbarkeit.
     ------------------------------------------------------------------- */
  const passtNicht = [];
  projektion.items = projektion.items.filter((e) => {
    const t = e.text || {};
    const tags = Array.isArray(t.hashtags) ? t.hashtags : [];
    if (!tags.length) return true;
    if (typeof t.captionBase !== "string" || !t.captionBase.trim() ||
        Hashtags.finalerText(t.captionBase, tags) !== e.payload.caption) {
      passtNicht.push(e.candidateId);
      return false;
    }
    return true;
  });
  for (const id of passtNicht) {
    const eintrag = {
      candidateId: id,
      reason: "FINAL_TEXT_MISMATCH",
      detail: "Text und Hashtags ergeben zusammen nicht das, was gesendet " +
        "wuerde. Der Kandidat geht nicht zur Freigabe: der Owner saehe sonst " +
        "eine Aufteilung, die es nie gab."
    };
    const schon = projektion.unresolved.findIndex((u) => u.candidateId === id);
    if (schon === -1) projektion.unresolved.push(eintrag);
    else projektion.unresolved[schon] = eintrag;
  }

  projektion.complete = projektion.unresolved.length === 0
    && projektion.items.length === projektion.activeCount;

  return projektion;
}

/* ----------------------------------------------------------- Uebertragung */

export async function uebertrage(projektion, options = {}) {
  const key = options.adminKey || process.env.VU_SOCIAL_ADMIN_KEY;
  if (!key) {
    return { ok: false, state: "NO_ADMIN_KEY",
      explanation: "VU_SOCIAL_ADMIN_KEY fehlt. Ohne ihn nimmt der Worker nichts an." };
  }
  const basis = options.worker || WORKER;
  const hol = options.fetchImpl || fetch;

  let antwort;
  try {
    antwort = await hol(basis + "/social/approval/queue", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "content-type": "application/json"
      },
      body: JSON.stringify(projektion)
    });
  } catch (err) {
    return { ok: false, state: "NETWORK_ERROR", explanation: String(err && err.message) };
  }

  let koerper = null;
  try { koerper = JSON.parse(await antwort.text()); } catch (err) { koerper = null; }

  if (!antwort.ok) {
    return { ok: false, state: "REJECTED", status: antwort.status, body: koerper,
      explanation: "Der Worker hat die Projektion abgelehnt." };
  }
  return { ok: true, state: "STORED", status: antwort.status, body: koerper };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const DATA = arg("data", "social/data");
  const OUT = arg("out", null);

  const verzeichnis = join(ausgabePfad(ROOT, DATA), "publish-candidates");
  const kandidaten = leseKandidaten(verzeichnis);
  /* `--check-assets`: die Bildadressen wirklich abfragen. Im
     Orchestrator-Workflow ist das an; in einer Umgebung ohne Zugang
     bleibt es aus, und die Projektion sagt dann ehrlich UNGEPRUEFT. */
  const p = await baue(kandidaten, {
    now: arg("now", undefined),
    pruefeAssets: process.argv.includes("--check-assets")
  });

  console.log("VISION UNIVERSE SOCIAL — Approval Queue");
  console.log("Datenstand: " + verzeichnis);
  console.log("");
  console.log("Dateien gelesen:   " + kandidaten.length);
  console.log("ACTIVE_APPROVAL_QUEUE_COUNT: " + p.activeCount +
    "  (aus " + p.source + ", nicht aus dem Ordner)");
  console.log("Projiziert:        " + p.items.length);
  console.log("Vollstaendig:      " + (p.complete ? "ja" : "NEIN"));
  console.log("");
  console.log(p.explanation || "");

  if (p.unresolved.length) {
    console.log("\nNICHT UEBERTRAGBAR:");
    for (const u of p.unresolved) {
      console.log("  " + u.candidateId + " — " + u.reason);
      if (u.detail) console.log("    " + u.detail);
    }
  }

  for (const i of p.items) {
    console.log("\n  " + i.candidateId + "  " + (i.anzeige.thema.value || "—"));
    console.log("    Hook:     " + (i.anzeige.hook.value || "—"));
    console.log("    Familie:  " + (i.anzeige.familie.value || i.anzeige.familie.basis));
    console.log("    Visual:   " + (i.warum.visual.kernidee.value
      ? String(i.warum.visual.kernidee.value).slice(0, 80) + "…"
      : i.warum.visual.kernidee.basis));
    console.log("    Guete:    " + i.guete.zustand);
  }

  if (OUT) {
    const ziel = ausgabePfad(ROOT, OUT);
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, JSON.stringify(p, null, 2) + "\n");
    console.log("\nGeschrieben: " + ziel);
  }

  if (!WRITE) {
    console.log("\nNur gezeigt. Mit --write geht die Projektion an den Worker.");
    process.exit(0);
  }

  const ergebnis = await uebertrage(p);
  console.log("\nUebertragung: " + ergebnis.state);
  if (ergebnis.explanation) console.log("  " + ergebnis.explanation);
  if (!ergebnis.ok) process.exit(ergebnis.state === "NO_ADMIN_KEY" ? 4 : 1);
  console.log("  Der Worker haelt jetzt " + p.activeCount + " wartende(n) Beitrag/Beitraege.");
}

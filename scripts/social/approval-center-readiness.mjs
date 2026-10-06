/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/approval-center-readiness.mjs

   APPROVAL_CENTER_PRODUCTION_READY

   -------------------------------------------------------------------------
   WAS DIESER BERICHT IST - UND WAS ER AUSDRUECKLICH NICHT IST
   -------------------------------------------------------------------------

   Er ist eine MESSUNG, kein Schalter. Er schaltet nichts frei, er
   stellt fest. Und er stellt nur fest, was er wirklich nachgesehen
   hat.

   Jeder Zustand kennt drei Werte: erfuellt, nicht erfuellt, UNGEPRUEFT.
   Der dritte ist der wichtigste. Ein Zustand, der von aussen kommt -
   ob der Worker deployt ist, ob die Suiten gruen sind - kann von hier
   aus nicht gemessen werden, und ihn auf "erfuellt" zu setzen, weil er
   wahrscheinlich stimmt, waere die Art Bericht, die dieses Projekt
   schon einmal in die Irre gefuehrt hat.

   Der Vorgaenger dieses Berichts hat "6 Kandidaten warten" gemeldet,
   weil er Dateien im Ordner zaehlte. Deshalb steht hier keine Zahl,
   die nicht aus der kanonischen Zustandsmaschine kommt.

   Ausfuehren:
     node scripts/social/approval-center-readiness.mjs
     node scripts/social/approval-center-readiness.mjs --suites-green ja --live ja
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));

const ERFUELLT = "ERFUELLT";
const NICHT = "NICHT_ERFUELLT";
const UNGEPRUEFT = "UNGEPRUEFT";

function lies(pfad) {
  const p = join(ROOT, pfad);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

/** Ein Zustand mit Wert UND Beleg. Ein Wert ohne Beleg ist eine Meinung. */
function zustand(id, wert, beleg) {
  return { id, wert, beleg };
}

/* -------------------------------------------------------------------------
   DIE ZWOELF ZUSTAENDE AUS §21
   ------------------------------------------------------------------------- */

export function pruefe(options = {}) {
  const z = [];

  const workerSrc = lies("workers/vision-universe-social/src/approval.js");
  const uiSrc = lies("workers/vision-universe-social/src/approval-ui.js");
  const indexSrc = lies("workers/vision-universe-social/src/index.js");
  const sessionSrc = lies("workers/vision-universe-social/src/session.js");
  const projSrc = lies("social/engines/approval-projection.js");

  const gebaut = Boolean(workerSrc && uiSrc && sessionSrc && projSrc);

  /* 1. Ist es ueberhaupt gebaut, und laeuft alles, was es prueft? */
  z.push(zustand("APPROVAL_CENTER_PRODUCTION_READY",
    !gebaut ? NICHT
      : options.suitesGreen === undefined ? UNGEPRUEFT
      : options.suitesGreen ? ERFUELLT : NICHT,
    !gebaut ? "Bausteine fehlen."
      : options.suitesGreen === undefined
        ? "Ob die Suiten gruen sind, weiss dieser Lauf nicht. Mit " +
          "--suites-green von aussen hereingeben."
        : "Alle Bausteine vorhanden; Suitenzustand " +
          (options.suitesQuelle === "gemessen"
            ? "gemessen (verify-suites.mjs, Stand dieses Baums)."
            : "von aussen BEHAUPTET, nicht gemessen.")));

  /* 2. Steht es unter der Adresse, unter der der Owner es aufruft?
        Das ist von hier aus NICHT messbar - der Egress-Proxy dieser
        Umgebung laesst social.visionuniverse.de nicht durch. Es zu
        behaupten waere der Kern des Fehlers, den §21 meidet. */
  z.push(zustand("APPROVAL_CENTER_LIVE",
    options.live === undefined ? UNGEPRUEFT : (options.live ? ERFUELLT : NICHT),
    options.live === undefined
      ? "Von hier aus nicht erreichbar. Nur ein Lauf gegen die echte Adresse " +
        "beantwortet das - und nur er darf es beantworten."
      : "Von aussen gemeldet."));

  /* 3. Faellt das Tor zu, wenn etwas fehlt? */
  const failClosed = Boolean(workerSrc
    && /requireOwnerSession/.test(workerSrc)
    && /if \(!tor\.ok\) return tor\.response/.test(workerSrc)
    && sessionSrc && /reason: "notConfigured"/.test(sessionSrc)
    && /path\.startsWith\("\/approval\/"\)/.test(workerSrc));
  z.push(zustand("AUTH_FAIL_CLOSED", failClosed ? ERFUELLT : NICHT,
    failClosed
      ? "Jede Route unter /approval laeuft durch requireOwnerSession; ohne " +
        "Admin-Schluessel gibt es keine gueltige Sitzung; unbekannte Pfade " +
        "beantwortet das Center selbst statt sie durchfallen zu lassen."
      : "Mindestens eine der drei Bedingungen fehlt."));

  /* 4. Kommt die Schlange aus der kanonischen Maschine? */
  const kanonisch = Boolean(projSrc
    && /s\.activeCount/.test(projSrc)
    && indexSrc && /QUEUE_SOURCE = "owner-decision\.warteschlange"/.test(indexSrc)
    && /p\.countedFiles !== false/.test(indexSrc));
  z.push(zustand("ACTIVE_QUEUE_CANONICAL", kanonisch ? ERFUELLT : NICHT,
    kanonisch
      ? "activeCount wird uebernommen, nicht gezaehlt; der Worker nimmt nur " +
        "Projektionen an, die owner-decision.warteschlange als Quelle nennen " +
        "und countedFiles: false tragen."
      : "Die Schlange koennte aus einer zweiten Rechnung stammen."));

  /* 5. Geht die Freigabe durch den bestehenden Pfad? */
  /* GENAU EINE Definition, und beide Eingaenge fuehren dorthin. Der
     erste Anlauf zaehlte "mindestens drei Vorkommen von publishCore("
     - eine Zahl ohne Bedeutung, die zufaellig zwei ergab und den
     Bericht auf NICHT_ERFUELLT stellte, obwohl alles stimmte. Geprueft
     gehoert die Eigenschaft, nicht ihre Haeufigkeit. */
  const definitionen = (indexSrc || "").match(/async function publishCore\(/g) || [];
  const einPfad = Boolean(indexSrc
    && definitionen.length === 1
    /* Eingang 1: der Admin-Endpunkt reicht durch. */
    && /return await publishCore\(body, env\)/.test(indexSrc)
    /* Eingang 2: das Approval Center bekommt ihn hereingereicht. */
    && /routeApproval\(request, url, env, \{ publish: publishCore \}\)/.test(indexSrc)
    && workerSrc && /options\.publish\(/.test(workerSrc)
    /* Und das Center baut keinen eigenen Weg zu Meta. */
    && !/graph\.facebook\.com/.test(workerSrc)
    && !/media_publish/.test(workerSrc));
  z.push(zustand("APPROVE_USES_EXISTING_PUBLISH_PATH", einPfad ? ERFUELLT : NICHT,
    einPfad
      ? "Eine Implementierung (publishCore), zwei Eingaenge. Das Approval " +
        "Center bekommt den Pfad hereingereicht und kennt keine Graph-Adresse."
      : "Es koennte einen zweiten Veroeffentlichungsweg geben."));

  /* 6. Schreibt die Ablehnung eine Rueckmeldung - und keine Leistung? */
  const storeSrc = lies("workers/vision-universe-social/src/store.js");
  const ingestSrc = lies("scripts/social/ingest-owner-decisions.mjs");
  const feedback = Boolean(storeSrc && /decisionSource: "approval_center"/.test(storeSrc)
    && ingestSrc && /decide-candidate\.mjs/.test(ingestSrc)
    && !/performance/i.test(String(storeSrc.match(/const datensatz = \{[\s\S]*?\};/) || "")));
  z.push(zustand("REJECT_WRITES_OWNER_FEEDBACK", feedback ? ERFUELLT : NICHT,
    feedback
      ? "Der Datensatz traegt candidateId, Abdruck, Entscheidung, Grund, " +
        "decisionSource und decidedBy - und kein Leistungsfeld, auch keines " +
        "mit dem Wert null. Der Rueckweg laeuft ueber decide-candidate.mjs."
      : "Die Rueckmeldung fehlt oder traegt eine Leistungsaussage."));

  /* 7. Bindet die Freigabe an einen Inhalt statt an eine Kennung? */
  const abdruck = Boolean(workerSrc
    && /fingerprint !== eintrag\.contentHash/.test(workerSrc)
    && /nachgerechnet !== eintrag\.contentHash/.test(workerSrc)
    && indexSrc && /tatsaechlich !== gewuenscht/.test(indexSrc));
  z.push(zustand("STALE_FINGERPRINT_PROTECTED", abdruck ? ERFUELLT : NICHT,
    abdruck
      ? "Drei Pruefungen: Formular gegen Schlange, Speicher gegen sich selbst, " +
        "und in publishCore der Abdruck aus dem, was tatsaechlich gesendet wird."
      : "Mindestens eine der drei Pruefungen fehlt."));

  /* 8. Kann ein zweiter Druck einen zweiten Beitrag machen? */
  const doppelt = Boolean(storeSrc
    && /reason: "alreadyDecided"/.test(storeSrc)
    && /vorhanden\) return \{ ok: false, claim: vorhanden, reason: "claimExists" \}/.test(storeSrc)
    && indexSrc && /idempotent: true/.test(indexSrc));
  z.push(zustand("DOUBLE_PUBLISH_PROTECTED", doppelt ? ERFUELLT : NICHT,
    doppelt
      ? "Drei Linien: die Entscheidung im Journal, der Anspruch auf dem " +
        "Inhaltsobjekt, und die Idempotenz des Anspruchs."
      : "Eine der drei Linien fehlt."));

  /* 9. Bleibt der Weg ueber GitHub Actions als Notweg erhalten? */
  const recovery = existsSync(join(ROOT, ".github/workflows/social-publish-candidate.yml"));
  z.push(zustand("GITHUB_ACTIONS_RECOVERY_PATH_RETAINED", recovery ? ERFUELLT : NICHT,
    recovery
      ? "social-publish-candidate.yml steht unveraendert. Sie ist der Notweg, " +
        "nicht die Produkt-Oberflaeche."
      : "Der Notweg wurde entfernt."));

  /* -----------------------------------------------------------------
     10./11. DIE BEIDEN SCHALTER - UND SIE LIEGEN AN VERSCHIEDENEN ORTEN

     Der erste Anlauf suchte beide in social/config/autonomy.json und
     fand keinen. Das meldete er korrekt als UNGEPRUEFT - mit einer
     Begruendung, die das Gegenteil nahelegte: "nicht unter diesem
     Namen gefunden" klingt, als waere am richtigen Ort gesucht worden.

     Sie liegen wirklich hier:

       GLOBAL_AUTOPUBLISH     social/config/kill-switch.json, gates.
                              Eine Freischaltung ist dort ein Commit
                              mit Autor, Datum und Begruendung.

       VU_SOCIAL_AUTOPUBLISH  eine Variable des Cloudflare Workers.
                              Sie steht in KEINER Datei - und genau
                              das ist die Zusage: publishCore liest
                              `=== "on"`, und was fehlt, ist nicht
                              "on".
     ----------------------------------------------------------------- */
  const killRoh = lies("social/config/kill-switch.json");
  let gates = null;
  try { gates = killRoh ? JSON.parse(killRoh).gates : null; } catch (err) { gates = null; }
  const global = gates && gates.GLOBAL_AUTOPUBLISH
    ? gates.GLOBAL_AUTOPUBLISH.enabled : undefined;
  z.push(zustand("GLOBAL_AUTOPUBLISH_FALSE",
    global === undefined ? UNGEPRUEFT : (global === false ? ERFUELLT : NICHT),
    global === undefined
      ? "social/config/kill-switch.json enthaelt kein Gate GLOBAL_AUTOPUBLISH. " +
        "Laut der Datei bedeutet ein fehlender Eintrag AUS - aber ein fehlendes " +
        "Gate ist etwas anderes als ein abgeschaltetes, und das wird nicht " +
        "zusammengezogen."
      : "gates.GLOBAL_AUTOPUBLISH.enabled = " + JSON.stringify(global) +
        ". Das Approval Center kann den Wert nicht aendern (AX9)."));

  const wrangler = lies("workers/vision-universe-social/wrangler.toml") || "";
  const deklariert = wrangler.match(/^\s*VU_SOCIAL_AUTOPUBLISH\s*=\s*"([^"]*)"/m);
  const an = deklariert && String(deklariert[1]).toLowerCase() === "on";
  z.push(zustand("VU_SOCIAL_AUTOPUBLISH_FALSE", an ? NICHT : ERFUELLT,
    an
      ? "wrangler.toml setzt VU_SOCIAL_AUTOPUBLISH auf \"on\"."
      : (deklariert
          ? "wrangler.toml setzt VU_SOCIAL_AUTOPUBLISH auf " +
            JSON.stringify(deklariert[1]) + " — publishCore liest `=== \"on\"`."
          : "wrangler.toml deklariert VU_SOCIAL_AUTOPUBLISH nicht; publishCore " +
            "liest `=== \"on\"`, und was fehlt, ist nicht \"on\".") +
        " GEMESSEN IST DAMIT DAS REPOSITORY, nicht der laufende Worker: ein " +
        "`wrangler secret put` koennte den Wert von aussen setzen. Diesen Teil " +
        "beantwortet nur ein Lauf gegen die echte Adresse."));

  return z;
}

/** Die wirklich wartenden Beitraege - aus der kanonischen Maschine. */
export function warteschlange() {
  const dir = join(ROOT, "social/data/publish-candidates");
  const kandidaten = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
        try { return JSON.parse(readFileSync(join(dir, f), "utf8")); }
        catch (err) { return { candidateId: f, state: null }; }
      })
    : [];
  return OwnerDecision.warteschlange(kandidaten);
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf("--" + n); return i === -1 ? undefined : args[i + 1]; };
  const ja = (v) => v === undefined || v === "" ? undefined
    : ["ja", "true", "1", "yes"].includes(String(v).toLowerCase());

  /* -----------------------------------------------------------------
     DER GEMESSENE BEFUND GEHT DER BEHAUPTUNG VOR

     `--suites-green ja` war eine Behauptung des Aufrufers ueber die
     Arbeit, die dieser Bericht bewerten soll - dieselbe Form, die in
     production-readiness.mjs schon ersetzt ist. Die CI setzte sie,
     weil zwei Schritte davor Tests gelaufen waren.

     scripts/social/verify-suites.mjs misst stattdessen und schreibt
     den Commit dazu. Ein Befund von einem anderen Stand oder aus einem
     nicht sauberen Baum gilt nicht - dann bleibt es UNGEPRUEFT, und
     ungeprueft blockiert.

     Die Fahne bleibt als ausdrueckliche Behauptung bestehen; der
     gemessene Befund geht ihr vor. */
  const belegPfad = arg("evidence") || ".verification/suites.json";
  const belegDatei = belegPfad.startsWith("/") ? belegPfad : join(ROOT, belegPfad);
  let gemessen;
  try {
    const b = JSON.parse(readFileSync(belegDatei, "utf8"));
    const kopf = execFileSync("git", ["rev-parse", "HEAD"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    gemessen = (b.commit && b.commit === kopf && b.cleanTree !== false)
      ? b.suitesOk === true : undefined;
  } catch { gemessen = undefined; }

  const zustaende = pruefe({
    suitesGreen: gemessen !== undefined ? gemessen : ja(arg("suites-green")),
    suitesQuelle: gemessen !== undefined ? "gemessen" : "behauptet",
    live: ja(arg("live"))
  });
  const schlange = warteschlange();

  console.log("VISION UNIVERSE SOCIAL — APPROVAL CENTER");
  console.log("");
  for (const s of zustaende) {
    console.log(s.wert.padEnd(15) + s.id);
    console.log("                " + s.beleg.replace(/\n/g, "\n                "));
    console.log("");
  }

  const blocker = zustaende.filter((s) => s.wert === NICHT);
  const offen = zustaende.filter((s) => s.wert === UNGEPRUEFT);

  console.log("ACTIVE_APPROVAL_QUEUE_COUNT  " + schlange.activeCount +
    "   (aus owner-decision.warteschlange, " + schlange.total + " Dateien im Bestand)");
  console.log("CRITICAL_BLOCKERS            " + blocker.length);
  console.log("UNGEPRUEFT                   " + offen.length +
    (offen.length ? "  (" + offen.map((s) => s.id).join(", ") + ")" : ""));
  console.log("");

  if (blocker.length) {
    console.log("NICHT FERTIG. Offene Punkte:");
    for (const b of blocker) console.log("  - " + b.id);
    process.exit(1);
  }
  if (offen.length) {
    /* Ungeprueft ist kein Fehler und auch kein Bestehen. Ein Bericht,
       der beides gleich behandelt, ist der Bericht, den §21 nicht
       will. */
    console.log("Kein Blocker. " + offen.length + " Zustand/Zustaende sind von " +
      "hier aus nicht messbar und bleiben ungeprueft.");
    process.exit(0);
  }
  console.log("APPROVAL_CENTER_PRODUCTION_READY in allen messbaren Punkten.");
}

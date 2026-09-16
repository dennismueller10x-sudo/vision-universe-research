/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/dispatch-publications.mjs

   DAS LETZTE STUECK ZWISCHEN "WUERDE" UND "TUT"

   Der Zyklus entscheidet und zeichnet. Der Worker veroeffentlicht. Was
   fehlte, war das Stueck dazwischen: aus einer Schatten-Entscheidung
   eine Veroeffentlichungsabsicht machen, sie durch die Sperren fuehren
   und daraus genau EINE HTTP-Anfrage bilden.

   Solange dieses Stueck fehlt, ist "der Loop koennte senden" eine
   Behauptung. Mit ihm ist es eine Datei, in der die Anfrage steht.

   -------------------------------------------------------------------------
   TROCKEN IST DER NORMALFALL
   -------------------------------------------------------------------------

   Ohne `--send` wird NICHTS gesendet. Das Skript baut die Anfrage, legt
   sie hin und sagt, was passieren wuerde. Das ist keine Vorsichtsgeste,
   sondern der Betriebszustand dieses Projekts: GLOBAL_AUTOPUBLISH ist
   aus, und der Worker antwortet auf den Endpunkt mit 403, auch wenn
   jemand ihn ruft.

   -------------------------------------------------------------------------
   DIE SPERREN, IN DIESER REIHENFOLGE
   -------------------------------------------------------------------------

     Kill Switch        die Konfiguration im Repository
     Autonomiestufe     Veroeffentlichen verlangt Stufe 4
     Fracht             ein Bild, das existiert — nicht eines, das geplant ist
     Idempotenz         publishing.js, derselbe Schluessel wie im Zyklus
     --send + Bestaetigung   absichtlich unbequem
     der Worker selbst  VU_SOCIAL_AUTOPUBLISH, und der ist aus

   Jede davon kann allein nein sagen. Die letzte ist die, auf die es
   ankommt: sie liegt nicht in diesem Repository.

   Ausfuehren:
     node scripts/social/dispatch-publications.mjs --data social/data --account 1784140...
     node scripts/social/dispatch-publications.mjs --data social/data --account ... --send --confirm ...
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Publishing = require(join(ROOT, "social/engines/publishing.js"));
const Autonomy   = require(join(ROOT, "social/engines/autonomy.js"));
const KillSwitch = require(join(ROOT, "social/engines/kill-switch.js"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const flag = (name) => argv.includes("--" + name);

/* Absichtlich unbequem zu tippen. Ein Schalter, der sich versehentlich
   setzen laesst, ist keine Sperre. */
export const CONFIRM = "PUBLISH-FROM-PIPELINE";

export const PROVIDER = "meta";

function readJson(pfad, fallback) {
  return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : fallback;
}

/**
 * Baut aus einer Schatten-Entscheidung genau die Anfrage, die an
 * `POST /social/meta/publish` ginge.
 *
 * Der Inhaltsschluessel ist die PAKETKENNUNG. Dieselbe, die das Bild im
 * Dateinamen traegt und unter der der Worker seinen Anspruch anmeldet.
 * Ein eigener Schluessel an dieser Stelle waere ein vierter Name fuer
 * denselben Beitrag — und damit eine vierte Gelegenheit, dass zwei
 * davon auseinanderlaufen.
 */
export function baueAnfrage(entscheidung, paket) {
  /* Der Text kommt aus der ENTSCHEIDUNG, nicht aus dem Paket. Das Paket
     ist die Vorlage; die Entscheidung ist das, was tatsaechlich
     hinausginge — bei Plattformanpassung sind das zwei verschiedene
     Texte. Das Paket bleibt als Rueckfall fuer aeltere Staende. */
  const caption = (entscheidung.caption !== undefined && entscheidung.caption !== null)
    ? entscheidung.caption
    : ((paket && paket.caption) || null);

  return {
    method: "POST",
    path: "/social/meta/publish",
    body: {
      contentId: entscheidung.packageId,
      imageUrl: entscheidung.asset ? entscheidung.asset.imageUrl : null,
      caption
    }
  };
}

/**
 * Prueft eine Entscheidung gegen alles, was im Repository entscheidbar
 * ist. Was nur der Worker wissen kann (Verbindung, Allowlist, globaler
 * Schalter), wird hier NICHT geraten.
 */
export function pruefe(entscheidung, kontext) {
  const gruende = [];

  if (!kontext.killSwitchAllows) gruende.push("Kill Switch: Veroeffentlichen gesperrt.");
  if (!kontext.autonomyAllows) {
    gruende.push("Autonomiestufe " + kontext.autonomyEffective +
      " — Veroeffentlichen verlangt Stufe 4.");
  }
  if (!entscheidung.asset || !entscheidung.asset.plannable) {
    gruende.push("Keine Fracht: " +
      ((entscheidung.asset && entscheidung.asset.message) || "kein Bildplan."));
  } else if (!entscheidung.asset.rendered) {
    /* Geplant ist nicht gezeichnet. Eine Adresse anzukuendigen, unter
       der keine Datei liegt, laesst Meta den Container ablehnen —
       nachdem der Anspruch angemeldet ist. */
    gruende.push("Das Bild ist geplant, aber nicht gezeichnet. " +
      "Der Zyklus zeichnet mit --render.");
  } else if (!entscheidung.asset.imageUrl) {
    gruende.push("Keine Bildadresse.");
  }

  return { sendbar: gruende.length === 0, gruende };
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const DATA = arg("data", "social/data");
  const OUT = arg("out", DATA);
  const ACCOUNT = arg("account", null);
  const NOW = arg("now", new Date().toISOString());
  const SEND = flag("send");

  const D = (n) => join(ROOT, DATA, n);

  console.log("VISION UNIVERSE SOCIAL — Versand der Veroeffentlichungen");
  console.log("Datenstand: " + DATA);
  console.log("Modus:      " + (SEND ? "SENDEN (angefordert)" : "TROCKEN"));

  if (!ACCOUNT) {
    console.error("\nKein --account. Der Idempotenzschluessel haengt an der Kontokennung; " +
      "ohne sie waere er ein anderer Schluessel fuer denselben Beitrag.");
    console.error("Die Kennung nennt der Worker unter /social/meta/status.");
    process.exit(2);
  }

  const schatten = readJson(D("shadow-decisions.json"), null);
  if (!schatten) {
    console.error("\nKeine shadow-decisions.json in " + DATA + ". " +
      "Es gibt nichts zu versenden, weil nichts entschieden wurde.");
    process.exit(2);
  }
  const entscheidungen = schatten.decisions || [];
  const bericht = readJson(D("cycle-report.json"), { packages: [] });
  const pakete = new Map((bericht.packages || []).map((p) => [p.packageId, p]));

  /* Die Sperren, die im Repository stehen. */
  const killSwitch = KillSwitch.fromConfig(
    readJson(join(ROOT, "social/config/kill-switch.json"), { gates: {} }));
  const gate = killSwitch.allows(PROVIDER, "publish");
  const autonomyEffective = (bericht.autonomy && bericht.autonomy.effective) || 0;

  const kontext = {
    killSwitchAllows: gate.allowed,
    autonomyAllows: Autonomy.allowsUnattendedPublish(autonomyEffective),
    autonomyEffective
  };

  console.log("Kill Switch:  " + (gate.allowed ? "erlaubt" : "GESPERRT — " + gate.reason));
  console.log("Autonomie:    Stufe " + autonomyEffective +
    (kontext.autonomyAllows ? "" : " (Veroeffentlichen verlangt 4)"));

  /* Der Zustand frueherer Veroeffentlichungen — dieselbe Engine, dieselben
     Schluessel. Ein zweiter Idempotenzmechanismus hier waere ein zweites
     Gedaechtnis mit eigener Meinung. */
  const vorher = readJson(D("publications.json"), { publications: [] });
  const orchestrator = Publishing.createOrchestrator({
    publications: vorher.publications || [],
    now: () => new Date(NOW)
  });

  const anfragen = [];
  let gesperrt = 0;

  console.log("\n--- ENTSCHEIDUNGEN ---");
  for (const e of entscheidungen) {
    const befund = pruefe(e, kontext);
    const paket = pakete.get(e.packageId) || null;

    if (!befund.sendbar) {
      gesperrt += 1;
      console.log("  " + e.packageId + ": NEIN");
      for (const g of befund.gruende) console.log("      " + g);

      /* Die Anfrage wird trotzdem gebaut und hingelegt — aber KEINE
         Absicht angemeldet. Eine Absicht ist eine Zustandsaenderung; eine
         gesperrte Entscheidung darf keine erzeugen.

         Warum ueberhaupt: "gesperrt" sagt, dass nichts hinausgeht. Es
         sagt nicht, WAS hinausginge. Genau das ist aber die Frage, die
         der Owner vor einer Freigabe beantwortet haben will — und sie
         nachtraeglich zu beantworten hiesse, sie im Moment der Freigabe
         zu stellen. */
      anfragen.push({
        packageId: e.packageId,
        publicationId: null,
        idempotencyKey: null,
        plannedHourUtc: e.plannedHourUtc,
        blocked: true,
        blockedBy: befund.gruende,
        request: baueAnfrage(e, paket)
      });
      continue;
    }

    const absicht = orchestrator.intend({
      packageId: e.packageId,
      providerId: PROVIDER,
      accountId: ACCOUNT,
      scheduledFor: null,
      autonomyLevel: autonomyEffective,
      strategyVersion: e.strategyVersion || null
    });

    if (!absicht.created) {
      console.log("  " + e.packageId + ": bereits geplant (" +
        absicht.publication.publicationId + ") — " + absicht.reason);
      continue;
    }

    const anfrage = baueAnfrage(e, paket);
    anfragen.push({
      packageId: e.packageId,
      publicationId: absicht.publication.publicationId,
      idempotencyKey: absicht.publication.idempotencyKey,
      plannedHourUtc: e.plannedHourUtc,
      blocked: false,
      blockedBy: [],
      request: anfrage
    });
    console.log("  " + e.packageId + ": bereit");
    console.log("      POST " + anfrage.path + "  contentId=" + anfrage.body.contentId);
    console.log("      Bild: " + anfrage.body.imageUrl);
  }

  const bereit = anfragen.filter((a) => !a.blocked).length;
  console.log("\nBereit: " + bereit + " | gesperrt: " + gesperrt +
    " von " + entscheidungen.length);
  if (gesperrt) {
    console.log("Die gesperrten Anfragen stehen trotzdem im Plan — mit Grund. " +
      "Was hinausginge, ist vor einer Freigabe zu klaeren und nicht danach.");
  }

  if (SEND) {
    /* Auch hier wird nichts gesendet. Der Versandweg existiert bewusst
       noch nicht: er braucht den Admin-Schluessel, und der gehoert in
       den Actions-Lauf und nicht in eine lokale Shell-Historie. Diesen
       Schalter stillschweigend ins Leere laufen zu lassen waere
       schlimmer als ihn abzulehnen. */
    if (arg("confirm", null) !== CONFIRM) {
      console.error("\n--send ohne --confirm " + CONFIRM + ". Abgelehnt.");
      process.exit(3);
    }
    console.error("\n--send ist in diesem Skript NICHT implementiert, und das ist Absicht.");
    console.error("Der Aufruf braucht den Admin-Schluessel; der gehoert in den Actions-Lauf.");
    console.error("Ausserdem antwortet der Worker ohne VU_SOCIAL_AUTOPUBLISH=on mit 403.");
    console.error("Die Anfragen stehen in dispatch-plan.json und sind von dort aus sendbar.");
    process.exitCode = 4;
  }

  const ziel = join(ROOT, OUT);
  mkdirSync(ziel, { recursive: true });
  writeFileSync(join(ziel, "dispatch-plan.json"), JSON.stringify({
    generatedAt: NOW,
    account: ACCOUNT,
    provider: PROVIDER,
    sent: false,
    reason: "Trockenlauf. Es wurde nichts gesendet.",
    killSwitch: { allowed: gate.allowed, reason: gate.reason || null },
    autonomy: { effective: autonomyEffective, allowsPublish: kontext.autonomyAllows },
    requests: anfragen
  }, null, 2) + "\n");

  writeFileSync(join(ziel, "publications.json"), JSON.stringify({
    generatedAt: NOW, publications: orchestrator.all()
  }, null, 2) + "\n");

  console.log("\nGeschrieben: " + OUT + "/dispatch-plan.json");
}

/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/ingest-owner-decisions.mjs

   DIE ENTSCHEIDUNGEN DES OWNERS INS REPOSITORY

   -------------------------------------------------------------------------
   DER RUECKWEG
   -------------------------------------------------------------------------

   Der Owner entscheidet am Telefon. Der Worker haelt die Entscheidung
   fest, weil er nicht ins Repository schreiben kann. Dieses Skript holt
   sie ab und schickt sie durch den Weg, den es schon gibt:

     scripts/social/decide-candidate.mjs

   Nicht durch einen zweiten. Dort steht alles, was an einer
   Owner-Entscheidung haengt - der Zustandsuebergang durch die
   kanonische Maschine, der Schutz einer bereits getroffenen
   Entscheidung, und vor allem: dass ein Ablehnungsgrund eine
   Rueckmeldung ueber die AUSWAHL ist und keine ueber die WIRKUNG.

   Diese Datei ist ein Briefträger. Sie urteilt nicht.

   -------------------------------------------------------------------------
   QUITTIERT WIRD ERST DANACH
   -------------------------------------------------------------------------

   Und nur, was tatsaechlich angekommen ist. Zuerst zu quittieren und
   dann zu schreiben hiesse: ein Abbruch dazwischen verliert die
   Entscheidung, und niemand erfaehrt, dass es sie gab.

   Der umgekehrte Fall - geschrieben, nicht quittiert - kostet einen
   zweiten Versuch beim naechsten Lauf. Der findet den Kandidaten dann
   bereits entschieden vor, decide-candidate weigert sich, und die
   Quittung geht trotzdem hinaus. Also: zweimal derselbe Brief ist
   harmlos, ein verlorener nicht.

   -------------------------------------------------------------------------
   VEROEFFENTLICHT WIRD HIER NICHTS
   -------------------------------------------------------------------------

   Der Beitrag ist zum Zeitpunkt dieses Laufs laengst draussen - der
   Worker hat ihn gesendet, als der Owner den Knopf drueckte. Dieses
   Skript traegt nach, WAS entschieden wurde und was daraus wurde.

   Ausfuehren:
     node scripts/social/ingest-owner-decisions.mjs                  # zeigen
     VU_SOCIAL_ADMIN_KEY=... node scripts/social/ingest-owner-decisions.mjs --write
   ========================================================================= */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { ausgabePfad } from "../quality/out-path.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKER = process.env.VU_SOCIAL_WORKER_URL || "https://social.visionuniverse.de";

/** Holt die offenen Entscheidungen. */
export async function hole(options = {}) {
  const key = options.adminKey || process.env.VU_SOCIAL_ADMIN_KEY;
  if (!key) {
    return { ok: false, state: "NO_ADMIN_KEY", decisions: [],
      explanation: "VU_SOCIAL_ADMIN_KEY fehlt. Ohne ihn gibt der Worker nichts heraus." };
  }
  const hol = options.fetchImpl || fetch;
  try {
    const antwort = await hol((options.worker || WORKER) + "/social/approval/decisions", {
      headers: { Authorization: "Bearer " + key }
    });
    const text = await antwort.text();
    if (!antwort.ok) {
      return { ok: false, state: "REJECTED", decisions: [], status: antwort.status,
        explanation: "Der Worker hat die Abfrage abgelehnt." };
    }
    const koerper = JSON.parse(text);
    return { ok: true, state: "READ", decisions: koerper.decisions || [] };
  } catch (err) {
    return { ok: false, state: "NETWORK_ERROR", decisions: [],
      explanation: String(err && err.message) };
  }
}

/**
 * Die Aufrufe, die eine Entscheidung im Repository nachvollziehen.
 *
 * Getrennt von der Ausfuehrung, damit sie pruefbar sind, ohne dass
 * etwas geschrieben wird. Ein Skript, dessen einzige Beschreibung
 * seiner Wirkung die Wirkung selbst ist, laesst sich nicht testen.
 */
export function befehleFuer(d, options = {}) {
  const dir = options.dir || "social/data/publish-candidates";
  const basis = ["scripts/social/decide-candidate.mjs",
    "--candidate", String(d.candidateId), "--dir", dir,
    "--by", String(d.decidedBy || "owner")];

  if (d.decision === "REJECTED") {
    return [basis.concat(["--reject", "--reason", String(d.reason || ""),
      "--now", String(d.decidedAt || new Date().toISOString())])];
  }
  if (d.decision === "APPROVED") {
    const befehle = [basis.concat(["--approve",
      "--now", String(d.decidedAt || new Date().toISOString())])];
    /* Wurde er auch gesendet, gehoert die Medien-ID dazu. Sie ist der
       Beleg, an dem spaeter die Messung haengt - ohne sie liesse sich
       die Leistung dieses Beitrags nie zuordnen. */
    if (d.published && d.mediaId) {
      befehle.push({ art: "publication", decision: d });
    }
    return befehle;
  }
  /* Ein Zustand, den dieses Skript nicht kennt, wird NICHT geraten. */
  return null;
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const DATA = arg("data", "social/data");
  const DIR = join(DATA, "publish-candidates");

  console.log("VISION UNIVERSE SOCIAL — Owner-Entscheidungen abholen");
  console.log("Datenstand: " + DATA);
  console.log("");

  const gelesen = await hole();
  if (!gelesen.ok) {
    console.log("Nicht abgeholt: " + gelesen.state);
    if (gelesen.explanation) console.log("  " + gelesen.explanation);
    /* Kein Schluessel ist eine Antwort, kein Ausfall. */
    process.exit(gelesen.state === "NO_ADMIN_KEY" ? 4 : 1);
  }

  const offen = gelesen.decisions.filter((d) => !d.consumedAt);
  console.log("Offene Entscheidungen: " + offen.length);
  if (!offen.length) {
    console.log("Nichts zu uebernehmen.");
    process.exit(0);
  }

  const quittieren = [];
  for (const d of offen) {
    console.log("\n  " + d.candidateId + "  " + d.decision +
      (d.published ? "  (veroeffentlicht, " + d.mediaId + ")" : ""));
    if (d.reason) console.log("    Grund: " + d.reason);

    const befehle = befehleFuer(d, { dir: DIR });
    if (!befehle) {
      console.log("    UNBEKANNTER ZUSTAND — wird nicht geraten und nicht quittiert.");
      continue;
    }
    if (!WRITE) {
      for (const b of befehle) {
        console.log("    wuerde: " + (Array.isArray(b) ? "node " + b.join(" ") : b.art));
      }
      continue;
    }

    let gelungen = true;
    for (const b of befehle) {
      if (!Array.isArray(b)) {
        /* Die Medien-ID nachtragen. record-publication erwartet die
           Antwort des Workers als Datei - also wird genau die gebaut,
           aus dem, was das Journal festgehalten hat. */
        const tmp = join(ausgabePfad(ROOT, "tmp"), "publish-" + d.candidateId + ".json");
        try {
          writeFileSync(tmp, JSON.stringify({
            published: true, contentId: null, mediaId: d.mediaId,
            permalink: d.permalink, timestamp: d.publishedAt
          }, null, 2));
          execFileSync("node", ["scripts/social/record-publication.mjs",
            "--candidate", d.candidateId, "--response", tmp,
            "--data", DATA, "--write"], { cwd: ROOT, stdio: "inherit" });
        } catch (err) {
          console.log("    Medien-ID nicht nachgetragen: " + String(err && err.message));
          /* Das allein verhindert die Quittung NICHT: die Entscheidung
             selbst ist angekommen, und sie ist der Teil, der sonst
             verlorenginge. */
        }
        continue;
      }
      try {
        execFileSync("node", b, { cwd: ROOT, stdio: "inherit" });
      } catch (err) {
        const code = err && err.status;
        /* decide-candidate weigert sich bei einem bereits
           entschiedenen Kandidaten. Das ist die richtige Antwort auf
           einen zweiten Brief - und ein Grund zu quittieren, nicht
           einer, es zu lassen. */
        if (code === 3 || code === 2) {
          console.log("    Bereits entschieden — die Quittung geht trotzdem hinaus.");
        } else {
          console.log("    NICHT uebernommen (exit " + code + "). Keine Quittung.");
          gelungen = false;
        }
      }
    }
    if (gelungen) quittieren.push(d.candidateId);
  }

  if (!WRITE) {
    console.log("\nNur gezeigt. Mit --write wird uebernommen und quittiert.");
    process.exit(0);
  }
  if (!quittieren.length) {
    console.log("\nNichts zu quittieren.");
    process.exit(1);
  }

  const key = process.env.VU_SOCIAL_ADMIN_KEY;
  const antwort = await fetch(WORKER + "/social/approval/decisions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ acknowledge: quittieren })
  });
  const ergebnis = JSON.parse(await antwort.text());
  console.log("\nQuittiert: " + (ergebnis.acknowledged || []).join(", "));
  if ((ergebnis.unknown || []).length) {
    console.log("Unbekannt geblieben: " + ergebnis.unknown.join(", "));
  }
  console.log("Noch offen im Briefkasten: " + ergebnis.open);
}

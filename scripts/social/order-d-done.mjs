/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/order-d-done.mjs

   IST DIESER AUFTRAG FERTIG? (§49/§50)

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT UND WAS SIE NICHT IST
   -------------------------------------------------------------------------

   Sie MISST nichts selbst. Jede der zwoelf Bedingungen wird von einer
   Stelle beantwortet, die es schon gibt:

     hard-invariants.js        die fuenf harten Saetze (§45)
     .verification/suites.json  Suiten und Isolation, mit Stand (§46)
     production-readiness.mjs   die zwanzig benannten Zustaende
     git                        ob dieser Stand in main angekommen ist
     der deployte Worker        ob die neue Fassung wirklich antwortet

   Eine zweite Rechnung fuer eine Frage, die schon eine hat, waere
   genau der Fehler, den dieses Projekt inzwischen beim Namen nennt:
   der erste, der vom anderen abweicht, gewinnt per Zufall.

   -------------------------------------------------------------------------
   UNGEPRUEFT IST NICHT ERFUELLT
   -------------------------------------------------------------------------

   Zwei Bedingungen - das Deployment und der Betriebs-Smoke - lassen
   sich von hier aus nur beantworten, wenn der Worker erreichbar ist.
   Ist er es nicht, steht UNGEPRUEFT da, und der Auftrag gilt als nicht
   fertig. Nicht "wahrscheinlich in Ordnung".

   Das ist der ganze Zweck: ein Bericht, der bei fehlender Verbindung
   "fertig" sagt, beantwortet eine Frage, die er nicht gestellt hat.

   -------------------------------------------------------------------------
   WAS DIESES SKRIPT NICHT TUT
   -------------------------------------------------------------------------

   Es veroeffentlicht nichts, gibt nichts frei, stoesst keinen Lauf an
   und verbraucht kein Work-Budget. Gegen den Worker stellt es
   ausschliesslich LESENDE Anfragen.

   Ausfuehren:
     node scripts/social/order-d-done.mjs
     node scripts/social/order-d-done.mjs --json
     node scripts/social/order-d-done.mjs --worker https://social.visionuniverse.de
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Harte = require(join(ROOT, "social/engines/hard-invariants.js"));

const argv = process.argv.slice(2);
const JSON_AUS = argv.includes("--json");
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const WORKER = arg("worker", "https://social.visionuniverse.de");

const ZUSTAND = { ERFUELLT: "ERFUELLT", NICHT_ERFUELLT: "NICHT_ERFUELLT",
                  UNGEPRUEFT: "UNGEPRUEFT" };

function lies(p, f = null) {
  const voll = p.startsWith("/") ? p : join(ROOT, p);
  if (!existsSync(voll)) return f;
  try { return JSON.parse(readFileSync(voll, "utf8")); } catch { return f; }
}
function text(p) {
  const voll = join(ROOT, p);
  return existsSync(voll) ? readFileSync(voll, "utf8") : null;
}
function git(...a) {
  try {
    return execFileSync("git", a, { cwd: ROOT, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

/* ===================================================================
   DIE EINZELNEN BEFUNDE
   =================================================================== */

/** 1. Ein leerer Tag traegt einen Nachweis (§13-§16). */
function nachweispflicht() {
  const NoPost = require(join(ROOT, "social/engines/no-post.js"));
  /* Nicht "die Datei gibt es", sondern: erzeugt ein Lauf ohne Suche
     wirklich einen BEFUND statt einer Ausrede? */
  const ohneSuche = NoPost.beurteile({ erzeugt: 0, kadenz: null,
    leiter: null, ablehnungen: [] });
  const mitSuche = NoPost.beurteile({
    erzeugt: 0,
    kadenz: { darfErzeugen: false, grund: "NO_TOPIC_IN_ANY_FAMILY" },
    leiter: { nichtGefragt: [], fallbackDepthReached: NoPost.letzteStufe(),
      familiesConsidered: ["a"], familiesConsideredCount: 1, gefunden: [],
      rejectionReasons: { INSUFFICIENT_EVIDENCE: 3 } },
    ablehnungen: []
  });
  /* Und ist der Nachweis im Lauf verdrahtet, oder nur gebaut? */
  /* `/keinBeitragNachweis/` allein waere zu lax: es faengt auch
     `keinBeitragNachweisX`. Gefragt ist die Funktion, die es gibt,
     UND dass der Lauf sie aufruft. */
  const orchestrator = text("scripts/social/run-orchestrator.mjs") || "";
  const imLauf = /export function keinBeitragNachweis\s*\(/.test(orchestrator) &&
    /keinBeitragNachweis\s*\(/.test(
      (text("scripts/social/run-social-cycle.mjs") || "") + orchestrator
        .replace(/export function keinBeitragNachweis\s*\(/, ""));

  const ok = ohneSuche.zustand === NoPost.ZUSTAND.NO_POST_UNEXPLAINED &&
    mitSuche.zustand === NoPost.ZUSTAND.NO_POST_JUSTIFIED && imLauf;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Ohne Suche: " + ohneSuche.zustand + ". Mit voller Suche: " +
        mitSuche.zustand + ". Im Orchestrator verdrahtet: " + imLauf + "."
      : "Ohne Suche: " + ohneSuche.zustand + ", mit Suche: " +
        mitSuche.zustand + ", im Lauf: " + imLauf };
}

/** 2. JETZT PRUEFEN startet DENSELBEN Workflow wie der Zeitplan (§2-§5). */
function derselbeLauf() {
  const worker = text("workers/vision-universe-social/src/approval.js") || "";
  const m = worker.match(/WORKFLOW_DATEI\s*=\s*["']([^"']+)["']/);
  const datei = m ? m[1] : null;
  const vorhanden = datei ? existsSync(join(ROOT, ".github/workflows", datei)) : false;
  const hatZeitplan = vorhanden &&
    /^\s*schedule:/m.test(text(".github/workflows/" + datei) || "");
  const ok = !!(datei && vorhanden && hatZeitplan);
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Der Knopf stoesst " + datei + " an - dieselbe Datei, die auch " +
        "der Zeitplan startet."
      : "Der Knopf zeigt auf " + (datei || "nichts") + " (vorhanden: " +
        vorhanden + ", mit Zeitplan: " + hatZeitplan + ")" };
}

/** 3. Zwei Laeufe koennen nicht gleichzeitig produktiv werden (§27-§31). */
function keinZweiterLauf() {
  const Lease = require(join(ROOT, "social/engines/run-lease.js"));
  const jetzt = "2026-01-01T12:00:00Z";
  const fremd = Lease.pruefe({ runId: "zeitplan", takenAt: "2026-01-01T11:55:00Z" },
    { now: jetzt, runId: "owner" });
  const eigen = Lease.pruefe({ runId: "owner", takenAt: "2026-01-01T11:55:00Z" },
    { now: jetzt, runId: "owner" });
  const zukunft = Lease.pruefe({ runId: "x", takenAt: "2099-01-01T00:00:00Z" },
    { now: jetzt, runId: "owner" });
  /* Und der Workflow muss die produktiven Schritte daran haengen. */
  const wf = text(".github/workflows/social-orchestrator.yml") || "";
  const verdrahtet = /produktiv_erlaubt/.test(wf);

  const ok = fremd.darfArbeiten === false && eigen.darfArbeiten === true &&
    zukunft.darfArbeiten === true && verdrahtet;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "fremder Lauf sperrt (darfArbeiten=" + fremd.darfArbeiten +
        "), der eigene nicht (" + eigen.darfArbeiten + "), eine Lease aus " +
        "der Zukunft sperrt nicht fuer immer (" + zukunft.darfArbeiten +
        "); die produktiven Schritte haengen daran (" + verdrahtet + ")."
      : "fremd=" + fremd.darfArbeiten + " eigen=" + eigen.darfArbeiten +
        " zukunft=" + zukunft.darfArbeiten + " verdrahtet=" + verdrahtet };
}

/** 4. Frequency Learning behauptet nichts ohne Stichprobe (§22-§25). */
function lernenOhneBehauptung() {
  const F = require(join(ROOT, "social/engines/frequency-learning.js"));
  const wenige = [];
  for (let t = 1; t <= 4; t += 1) {
    wenige.push({ publishedAt: "2026-09-0" + t + "T08:00:00Z",
      performance: 70, ordinalDesTages: 1 });
    wenige.push({ publishedAt: "2026-09-0" + t + "T17:00:00Z",
      performance: 20, ordinalDesTages: 2 });
  }
  const z = F.zustand(wenige, { now: "2026-09-21T12:00:00Z" });
  const zweiter = (z.beobachtungen || []).find((b) => b.id === "zweiter-beitrag");
  const zurueckhaltend = zweiter && zweiter.befund === F.BEFUND.INSUFFICIENT_SAMPLE;
  /* Ungemessene Beitraege duerfen die Leistung nicht nach unten ziehen. */
  const gemessen = [];
  for (let t = 1; t <= 6; t += 1) {
    gemessen.push({ publishedAt: "2026-09-0" + t + "T08:00:00Z",
      performance: 60, ordinalDesTages: 1 });
  }
  const mitLuecken = gemessen.concat([7, 8, 9].map((t) => ({
    publishedAt: "2026-09-0" + t + "T08:00:00Z",
    performance: null, ordinalDesTages: 1 })));
  const a = F.zustand(gemessen, {}).werte.leistungErsterDesTages.value;
  const b = F.zustand(mitLuecken, {}).werte.leistungErsterDesTages.value;

  const ok = !!zurueckhaltend && a === b;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Unter " + F.MINDEST_STICHPROBE + " Faellen entsteht keine Empfehlung, " +
        "und ungemessene Beitraege zaehlen nicht als Nullleistung."
      : "Befund=" + (zweiter && zweiter.befund) + ", Leistung ohne/mit " +
        "Luecken: " + a + "/" + b };
}

/** 5.+6. Suiten und Isolation - der gemessene Befund mit Stand (§46). */
function ausBeleg(feld, satzBauer) {
  const beleg = lies(arg("evidence", ".verification/suites.json"));
  if (!beleg) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Kein Befund. node scripts/social/verify-suites.mjs erzeugt ihn." };
  }
  const kopf = git("rev-parse", "HEAD");
  if (!beleg.commit || !kopf || beleg.commit !== kopf) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Der Befund gehoert zu " + String(beleg.commit).slice(0, 10) +
        ", dieser Baum steht auf " + String(kopf).slice(0, 10) + "." };
  }
  if (beleg.cleanTree === false) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Gemessen in einem nicht sauberen Baum - der Befund gehoert " +
        "dann zu keinem Commit." };
  }
  return { zustand: beleg[feld] === true ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: satzBauer(beleg) + " (Stand " + beleg.commit.slice(0, 10) + ")" };
}

/* -------------------------------------------------------------------
   7. IST DIESER STAND IN MAIN ANGEKOMMEN? (§46)

   ABSTAMMUNG BEANTWORTET DAS NICHT.

   Der erste Anlauf fragte `git merge-base --is-ancestor HEAD main`.
   Dieses Repository merged aber mit SQUASH: aus fuenfzehn Commits wird
   auf main einer, und der traegt eine neue Kennung. Der Zweigstand ist
   danach KEIN Vorfahre von main - obwohl sein ganzer Inhalt dort liegt.

   Die Bedingung waere damit nach jedem korrekten Merge dieses
   Repositories `NICHT_ERFUELLT` gewesen: eine Invariante, die die
   eigene Merge-Konvention nicht erfuellen kann, ist keine Pruefung,
   sondern ein Dauerfehler.

   Gefragt wird deshalb nach dem INHALT: unterscheidet sich der Baum
   dieses Standes von dem auf main? Ist der Unterschied leer, ist
   dieser Stand angekommen - gleichgueltig, ueber welche Commit-Form.
   ------------------------------------------------------------------- */
function inMain() {
  const kopf = git("rev-parse", "HEAD");
  git("fetch", "origin", "main");
  const main = git("rev-parse", "origin/main");
  if (!kopf || !main) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Der Stand von main ist von hier aus nicht feststellbar." };
  }

  /* "main enthaelt main" ist keine Auskunft: laeuft dieser Bericht AUF
     main - etwa im Cloudflare-Workflow nach dem Merge -, beantwortet
     sich die Frage selbst. Die Antwort ist dann richtig und belegt
     nichts; der Satz sagt das. */
  if (kopf === main) {
    return { zustand: ZUSTAND.ERFUELLT,
      satz: "Dieser Stand IST main (" + kopf.slice(0, 10) + "). Von hier aus " +
        "beantwortet sich die Frage selbst — als Beleg fuer eine Integration " +
        "taugt sie nur von einem Zweig aus." };
  }

  const unterschied = git("diff", "--name-only", main, kopf);
  if (unterschied === null) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Der Vergleich mit main ist nicht zustande gekommen." };
  }
  const dateien = unterschied.split("\n").filter((z) => z.trim().length);
  return { zustand: dateien.length === 0 ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: dateien.length === 0
      ? "Inhaltsgleich mit main (" + main.slice(0, 10) + "): keine Datei " +
        "unterscheidet sich. Der Squash-Merge macht diesen Stand nicht zum " +
        "Vorfahren, aber sein Inhalt liegt dort."
      : dateien.length + " Datei(en) unterscheiden sich noch von main (" +
        main.slice(0, 10) + "), darunter " + dateien.slice(0, 3).join(", ") +
        ". Solange nur auf dem Zweig, ist nichts integriert." };
}

/* -------------------------------------------------------------------
   HAT DER WORKER GEANTWORTET, ODER NUR IRGENDWER?

   Der erste Anlauf fragte `/approval/run` ab, bekam 403 und meldete
   ERFUELLT: "die Adresse gibt es, und ein GET ohne Sitzung kommt nicht
   durch". Im Koerper stand aber

       "Host not in allowlist: social.visionuniverse.de."

   Das war der Egress-Proxy dieser Umgebung. Der Worker hat die
   Anfrage nie gesehen. Dieselbe Form wie das Owner-Tor in §45: eine
   Ablehnung, die richtig aussah und von der falschen Stelle kam.

   Beantwortet wird jetzt zuerst die Vorfrage. Eine Antwort von einem
   Cloudflare-Worker traegt `cf-ray` und `server: cloudflare`. Fehlt
   beides, ist die Antwort keine Auskunft ueber den Worker - und dann
   steht UNGEPRUEFT da, nicht ERFUELLT.
   ------------------------------------------------------------------- */
async function vomWorker(pfad, init) {
  let antwort;
  try {
    antwort = await fetch(WORKER + pfad, init);
  } catch (err) {
    return { erreicht: false, grund: "nicht erreichbar (" +
      String(err && err.message).slice(0, 60) + ")" };
  }
  const ray = antwort.headers.get("cf-ray");
  const server = String(antwort.headers.get("server") || "").toLowerCase();
  const koerper = await antwort.text();
  if (!ray && server !== "cloudflare") {
    return { erreicht: false, status: antwort.status, koerper,
      grund: "die Antwort kam nicht vom Worker (kein cf-ray, server=" +
        (server || "keiner") + "): " + koerper.slice(0, 80) };
  }
  return { erreicht: true, status: antwort.status, koerper,
    /* Der Nachweis selbst, nicht das Wort dafuer: wer im Satz
       "vom Worker" schreibt, ohne diese Kennung zu fuehren, behauptet
       wieder statt zu messen. */
    ray: ray || null, server: server || null };
}

/** 8. Die deployte Fassung kennt die neuen Wege (§47). */
async function deployt() {
  const a = await vomWorker("/approval/run", { method: "GET" });
  if (!a.erreicht) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Das Deployment laesst sich von hier aus nicht feststellen: " +
        a.grund + ". Von einer Umgebung aus, die den Worker nicht erreicht, " +
        "ist jede Antwort eine ueber den Weg dorthin." };
  }
  /* 404 heisst: die alte Fassung laeuft, die Adresse gibt es dort nicht.
     405/401/403 heissen: die Adresse gibt es, und sie laesst ein GET
     bzw. eine Anfrage ohne Sitzung nicht durch - genau richtig. */
  const kennt = a.status !== 404;
  const abgewiesen = a.status >= 400;
  return { zustand: kennt && abgewiesen ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: kennt
      ? (abgewiesen
          ? "/approval/run antwortet mit " + a.status + " [cf-ray " +
            (a.ray || "-") + ", server " + (a.server || "-") + "]: die " +
            "Adresse gibt es, und ein GET ohne Sitzung kommt nicht durch."
          : "/approval/run laesst ein GET ohne Sitzung durch (" + a.status + ").")
      : "/approval/run antwortet mit 404: die deployte Fassung ist aelter " +
        "als diese Aenderung." };
}

/** 9. Der Betriebs-Smoke, ohne zu veroeffentlichen (§48). */
async function smokeOhneVeroeffentlichung() {
  const wege = ["/social/status", "/approval"];
  const befunde = [];
  for (const pfad of wege) {
    const a = await vomWorker(pfad, { method: "GET" });
    if (!a.erreicht) {
      return { zustand: ZUSTAND.UNGEPRUEFT,
        satz: "Der Smoke hat nicht stattgefunden: " + a.grund +
          ". Ein Smoke, der den Worker nie erreicht, ist kein bestandener " +
          "Smoke - er ist keiner." };
    }
    befunde.push({ pfad, status: a.status, ray: a.ray, server: a.server,
      /* Kein Kandidateninhalt ohne Sitzung: weder Caption noch Bild
         noch eine Kandidatenkennung. */
      traegtInhalt: /cand_[A-Za-z0-9_.-]+/.test(a.koerper) ||
        /"caption"|imageUrl/.test(a.koerper) });
  }
  const undicht = befunde.filter((b) => b.traegtInhalt);
  const ok = undicht.length === 0 && befunde.every((b) => b.status < 500);
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? befunde.map((b) => b.pfad + " -> " + b.status + " [cf-ray " +
          (b.ray || "-") + "]").join(", ") +
        "; kein Kandidateninhalt ohne Sitzung, nichts veroeffentlicht."
      : (undicht.length
          ? "Kandidateninhalt ohne Sitzung sichtbar unter " +
            undicht.map((b) => b.pfad).join(", ")
          : befunde.map((b) => b.pfad + " -> " + b.status).join(", ")) };
}

/** 10.-12. Die drei Schalter aus dem Auftrag, gemessen (§45). */
function harteInvarianten() {
  let aus;
  try {
    aus = execFileSync("node", ["scripts/social/check-hard-invariants.mjs"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) { aus = String(err.stdout || ""); }
  const zeile = (id) => {
    const m = aus.match(new RegExp("(OK|FEHL)\\s+" + id + "\\s+ist\\s+(\\S+)"));
    return m ? { ok: m[1] === "OK", wert: m[2] } : null;
  };
  return {
    GLOBAL_AUTOPUBLISH: zeile("GLOBAL_AUTOPUBLISH"),
    VU_SOCIAL_AUTOPUBLISH: zeile("VU_SOCIAL_AUTOPUBLISH"),
    MAX_OPEN_CREATIVE_JOBS: zeile("MAX_OPEN_CREATIVE_JOBS"),
    OWNER_PUBLISHING_GATE: zeile("OWNER_PUBLISHING_GATE"),
    EXTERNAL_SOCIAL_SOURCES_ACTIVE: zeile("EXTERNAL_SOCIAL_SOURCES_ACTIVE")
  };
}

function ausSchalter(b, soll) {
  if (!b) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "check-hard-invariants.mjs hat dazu nichts gemeldet." };
  }
  return { zustand: b.ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: "gemessen: " + b.wert + " (soll " + soll + ")" };
}

/* ===================================================================
   DIE ZWOELF BEDINGUNGEN
   =================================================================== */

const schalter = harteInvarianten();

const BEDINGUNGEN = [
  { id: "NO_POST_JUSTIFIED_MIT_NACHWEIS", ref: "§13-§16", befund: nachweispflicht },
  { id: "MANUELLER_LAUF_IST_DERSELBE_LAUF", ref: "§2-§5", befund: derselbeLauf },
  { id: "KEIN_ZWEITER_PRODUKTIVER_LAUF", ref: "§27-§31", befund: keinZweiterLauf },
  { id: "FREQUENZLERNEN_OHNE_BEHAUPTUNG", ref: "§22-§25", befund: lernenOhneBehauptung },
  { id: "SUITEN_GRUEN", ref: "§46", befund: () => ausBeleg("suitesOk", (b) =>
      /* Uebersprungene Tests gehoeren in den Satz: "1369/1383" allein
         liest sich wie ein Mangel, und eine Luecke, die niemand nennt,
         faellt spaeter niemandem auf. */
      b.suites.map((r) => r.id + ": " + r.pass + "/" + r.tests +
        (r.skipped ? " (" + r.skipped + " uebersprungen)" : "")).join(", ")) },
  { id: "TEST_PRODUKTIONS_ISOLATION", ref: "§42", befund: () => ausBeleg("isolationOk",
      (b) => b.isolation.map((i) => i.id + ": " +
        (i.ok ? "unveraendert" : "VERAENDERT")).join(", ")) },
  { id: "IN_MAIN_INTEGRIERT", ref: "§46", befund: inMain },
  { id: "DEPLOYT", ref: "§47", befund: deployt },
  { id: "BETRIEBS_SMOKE_OHNE_VEROEFFENTLICHUNG", ref: "§48",
    befund: smokeOhneVeroeffentlichung },
  { id: "GLOBAL_AUTOPUBLISH_AUS", ref: "§45",
    befund: () => ausSchalter(schalter.GLOBAL_AUTOPUBLISH, "false") },
  { id: "VU_SOCIAL_AUTOPUBLISH_AUS", ref: "§45",
    befund: () => ausSchalter(schalter.VU_SOCIAL_AUTOPUBLISH, "false") },
  { id: "MAX_OPEN_CREATIVE_JOBS_IST_1", ref: "§45",
    befund: () => ausSchalter(schalter.MAX_OPEN_CREATIVE_JOBS, "1") }
];

/* ------------------------------------------------------------------ Lauf */
const ergebnisse = [];
for (const b of BEDINGUNGEN) {
  let r;
  try { r = await b.befund(); }
  catch (err) {
    r = { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Die Pruefung selbst ist gescheitert: " +
        String(err && err.message).slice(0, 120) };
  }
  ergebnisse.push({ id: b.id, ref: b.ref, ...r });
}

const offen = ergebnisse.filter((r) => r.zustand !== ZUSTAND.ERFUELLT);
const fertig = offen.length === 0;

if (JSON_AUS) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    commit: git("rev-parse", "HEAD"),
    worker: WORKER,
    ORDER_D_DONE: fertig,
    conditions: ergebnisse,
    open: offen.map((r) => r.id)
  }, null, 2));
} else {
  const Z = { ERFUELLT: "+", NICHT_ERFUELLT: "x", UNGEPRUEFT: "?" };
  console.log("VISION UNIVERSE SOCIAL — ORDER D, DEFINITION OF DONE\n");
  console.log("ORDER_D_DONE  " + (fertig ? "true" : "false"));
  console.log("OFFEN         " + offen.length + " von " + ergebnisse.length + "\n");
  for (const r of ergebnisse) {
    console.log("  " + Z[r.zustand] + " " + r.id.padEnd(38) + r.ref.padEnd(10) +
      r.zustand);
    console.log("      " + r.satz);
  }
  console.log("");
  console.log(fertig
    ? "Alle zwoelf Bedingungen gemessen und erfuellt."
    : "Offen: " + offen.map((r) => r.id + " (" + r.zustand + ")").join(", "));
  console.log("\nUNGEPRUEFT zaehlt wie nicht erfuellt. Keine Faehigkeit gilt als " +
    "aktiv,\nnur weil eine Datei existiert.");
}

process.exit(fertig ? 0 : 1);

/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/asset-hashtag-done.mjs

   DER BERICHT ZUM AUFTRAG "APPROVAL ASSET + HASHTAG PRODUCTION FIX"
   (§26 die gemessenen Zustaende, §27 die Definition of Done)

   -------------------------------------------------------------------------
   §26 IN EINEM SATZ
   -------------------------------------------------------------------------

       "Keine Faehigkeit als aktiv melden, nur weil Code existiert."

   Deshalb fragt dieses Skript nirgends, ob eine Datei da ist. Es
   RECHNET: es laesst die Hashtag-Engine ueber die echten Themen
   laufen und zaehlt, wie viele VERSCHIEDENE Tagmengen dabei
   herauskommen; es rendert die Karte des echten Kandidaten mit
   demselben Code, den der Worker deployt, und liest heraus, welche
   Bildadresse darin steht und ob ein Freigabeknopf da ist; es holt
   das Bild ab, statt seine Adresse zu betrachten.

   -------------------------------------------------------------------------
   UNGEPRUEFT IST NICHT ERFUELLT
   -------------------------------------------------------------------------

   Alles, was den Worker oder den Assethost braucht, kann von einer
   Umgebung ohne Zugang dorthin nicht beantwortet werden. Dann steht
   UNGEPRUEFT da - nicht "wahrscheinlich in Ordnung". Ein 403 des
   Egress-Proxy sieht aus wie ein 403 des Dienstes; wer das
   verwechselt, bestaetigt etwas, das er nie gesehen hat.

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es veroeffentlicht nichts, gibt nichts frei, erzeugt kein Bild,
   stoesst keinen Lauf an und verbraucht kein Work-Budget. Gegen den
   Worker stellt es ausschliesslich LESENDE Anfragen; gegen den
   Assethost genau die GET-Anfrage, die Meta beim Veroeffentlichen
   auch stellen wuerde.

   Ausfuehren:
     node scripts/social/asset-hashtag-done.mjs
     node scripts/social/asset-hashtag-done.mjs --json
     node scripts/social/asset-hashtag-done.mjs --worker https://social.visionuniverse.de
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Hashtags = require(join(ROOT, "social/engines/hashtags.js"));
const Leiter = require(join(ROOT, "social/engines/content-ladder.js"));
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));
const Projektion = require(join(ROOT, "social/engines/approval-projection.js"));

const { baue } = await import("./publish-approval-queue.mjs");
const { candidatePage } = await import(
  "../../workers/vision-universe-social/src/approval-ui.js");
const WorkerText = await import(
  "../../workers/vision-universe-social/src/public-text.js");

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
function quelle(p) {
  const voll = join(ROOT, p);
  return existsSync(voll) ? readFileSync(voll, "utf8") : null;
}
function git(...a) {
  try {
    return execFileSync("git", a, { cwd: ROOT, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

/* -------------------------------------------------------------------
   DIE EINE GRUNDLAGE: DIE ECHTE PROJEKTION, EINMAL GEBAUT

   Alles Weitere liest daraus. Zwei Rechenwege fuer denselben Stand
   waeren zwei Staende, und der erste, der vom anderen abweicht,
   gewinnt per Zufall.
   ------------------------------------------------------------------- */
const KANDIDATEN = join(ROOT, "social/data/publish-candidates");
function alleKandidaten() {
  if (!existsSync(KANDIDATEN)) return [];
  return readdirSync(KANDIDATEN).filter((f) => f.endsWith(".json"))
    .map((f) => lies(join(KANDIDATEN, f))).filter(Boolean);
}

const kandidaten = alleKandidaten();
/* Mit Messung: genau die GET-Anfrage, die Meta auch stellen wuerde. */
const projektion = await baue(kandidaten, { pruefeAssets: true });
const wartend = projektion.items[0] || null;

/* ===================================================================
   §26 — DIE GEMESSENEN ZUSTAENDE
   =================================================================== */

/** Hat der WORKER geantwortet, oder nur irgendwer dazwischen? */
async function vomWorker(pfad) {
  let antwort;
  try { antwort = await fetch(WORKER + pfad, { method: "GET" }); }
  catch (err) {
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
    ray: ray || null, server: server || null };
}

/* Die Karte des echten Kandidaten, gerendert mit dem Code, den der
   Worker deployt. Nicht nachgebaut: derselbe. */
function karteDesKandidaten() {
  if (!wartend) return null;
  const r = candidatePage(wartend, { nummer: 1, von: projektion.activeCount }, null);
  return r && typeof r.text === "function" ? r : null;
}
let karteHtml = null;
try {
  const r = karteDesKandidaten();
  karteHtml = r ? await r.text() : null;
} catch (err) { karteHtml = null; }

function ausKarte(regex) { return karteHtml ? regex.test(karteHtml) : null; }

/* ------------------------------------------------------------------ */

async function approvalCenterLive() {
  const a = await vomWorker("/approval");
  if (!a.erreicht) {
    return { wert: "UNGEPRUEFT", zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Von hier aus nicht feststellbar: " + a.grund };
  }
  const ok = a.status < 500;
  return { wert: ok ? "true" : "false",
    zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: "/approval antwortet mit " + a.status + " [cf-ray " + (a.ray || "-") +
      ", server " + (a.server || "-") + "]." };
}

function aktuellerKandidat() {
  if (!wartend) {
    return { wert: "KEINER", zustand: ZUSTAND.ERFUELLT,
      satz: "Kein Kandidat wartet auf Freigabe. Das ist ein Ergebnis, " +
        "kein Mangel." };
  }
  return { wert: wartend.candidateId, zustand: ZUSTAND.ERFUELLT,
    satz: (wartend.anzeige && wartend.anzeige.thema && wartend.anzeige.thema.value)
      || "ohne Thema" };
}

function assetErreichbar() {
  if (!wartend) {
    return { wert: "NICHT_ANWENDBAR", zustand: ZUSTAND.ERFUELLT,
      satz: "Kein wartender Kandidat, kein Bild zu pruefen." };
  }
  const a = wartend.asset;
  if (a.zustand === "ASSET_REACHABILITY_UNVERIFIED") {
    return { wert: "UNGEPRUEFT", zustand: ZUSTAND.UNGEPRUEFT, satz: a.satz };
  }
  return { wert: a.erreichbar ? "true" : "false",
    zustand: a.erreichbar ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: a.satz };
}

/* Vorschau IST Sendung: genau ein Bild auf der Karte, und zwar das,
   das veroeffentlicht wuerde. Gemessen am gerenderten HTML. */
function vorschauGleichSendung() {
  if (!wartend) {
    return { wert: "NICHT_ANWENDBAR", zustand: ZUSTAND.ERFUELLT,
      satz: "Kein wartender Kandidat." };
  }
  if (!karteHtml) {
    return { wert: "UNGEPRUEFT", zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Die Karte liess sich hier nicht rendern." };
  }
  const bilder = karteHtml.match(/<img[^>]+src="([^"]*)"/g) || [];
  const src = (karteHtml.match(/<img[^>]+src="([^"]*)"/) || [])[1] || null;
  const entschaerft = String(src || "").replace(/&amp;/g, "&");
  const gleich = entschaerft === wartend.payload.imageUrl;
  const platzhalter = /^data:/.test(entschaerft);
  const ok = bilder.length === 1 && gleich && !platzhalter;
  return { wert: ok ? "true" : "false",
    zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Genau ein Bild auf der Karte, unter der Adresse, die " +
        "veroeffentlicht wuerde. Kein Platzhalter."
      : bilder.length + " Bild(er); gezeigt: " + entschaerft.slice(0, 70) +
        ", gesendet wuerde: " + String(wartend.payload.imageUrl).slice(0, 70) };
}

/* ------------------------------------------------------------------
   HASHTAG_ENGINE_READY — gerechnet, nicht behauptet

   Die Frage ist nicht "gibt es die Engine", sondern: erzeugt sie fuer
   verschiedene Themen VERSCHIEDENE Tags? Eine Engine, die unter jeden
   Beitrag dieselben fuenf schreibt, ist genau das, was §10 verbietet -
   und sie wuerde jede Existenzpruefung bestehen.
   ------------------------------------------------------------------ */
function hashtagEngineBereit() {
  /* Der echte Themenbestand des Systems, so wie ihn die Opportunity
     Engine zuletzt hingelegt hat - nicht eine Liste fuer diesen
     Bericht. */
  const slate = lies("social/data/opportunity-slate.json");
  const themen = [];
  for (const t of (slate && slate.topics) || []) {
    if (!t) continue;
    themen.push({
      topic: t.title || t.topicId,
      entities: t.entities || [],
      entityType: t.entityType || null,
      family: t.family || null,
      question: t.question || null
    });
  }
  /* Faellt der Bestand aus, wird an den Familien der Leiter gemessen -
     eine Breite, die es unabhaengig vom Tagesstand gibt. */
  if (!themen.length) {
    for (const stufe of Leiter.LEITER) {
      for (const f of stufe.familien) {
        themen.push({ topic: f, entities: [], family: f, question: null });
      }
    }
  }

  const mengen = new Set();
  let maximal = 0, leer = 0;
  for (const t of themen) {
    let tags = [];
    try { tags = (Hashtags.ableiten(t) || {}).hashtags || []; } catch { tags = []; }
    if (!tags.length) leer += 1;
    maximal = Math.max(maximal, tags.length);
    mengen.add(tags.join(" "));
  }
  const verschieden = mengen.size;
  const ok = themen.length > 0 && verschieden > 1 && maximal <= Hashtags.MAX_HASHTAGS;
  return { wert: ok ? "true" : "false",
    zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: themen.length + " Themen ergeben " + verschieden +
      " verschiedene Tagmengen (hoechstens " + maximal + " Tags, Grenze " +
      Hashtags.MAX_HASHTAGS + "; " + leer + "-mal keine)." };
}

function tagsAmKandidaten() {
  if (!wartend) {
    return { wert: "NICHT_ANWENDBAR", zustand: ZUSTAND.ERFUELLT,
      satz: "Kein wartender Kandidat." };
  }
  const n = wartend.text.hashtags.length;
  /* Null ist erlaubt (§12) und wird nicht aufgefuellt. Es ist kein
     Mangel - aber es steht da, mit dem Grund, den der Kandidat
     mitbringt. */
  return { wert: String(n), zustand: ZUSTAND.ERFUELLT,
    satz: n
      ? wartend.text.hashtags.join(" ")
      : (wartend.text.hashtagSatz ||
         "Dieser Kandidat traegt keine Tags im Sendetext.") };
}

/* FINAL_PUBLIC_TEXT_READY: die Regel ist deterministisch UND auf
   beiden Seiten dieselbe. Gemessen an Faellen, nicht am Quelltext. */
function finalTextBereit() {
  const faelle = [
    ["Ein Satz.", ["#Eins", "#Zwei"]],
    ["Ein Satz.", []],
    ["", ["#Eins"]],
    ["Mehrzeilig.\n\nZweiter Absatz.", ["#Eins", "#Zwei", "#Drei"]],
    ["Rauten fehlen.", ["Eins"]],
    [null, null]
  ];
  const auseinander = faelle.filter(([b, t]) =>
    WorkerText.finalerText(b, t) !== Hashtags.finalerText(b, t));
  const gleicheGrenze = WorkerText.MAX_HASHTAGS === Hashtags.MAX_HASHTAGS;

  /* Deterministisch: zweimal dasselbe Ergebnis. */
  const zweimal = faelle.every(([b, t]) =>
    Hashtags.finalerText(b, t) === Hashtags.finalerText(b, t));

  /* Und am echten Kandidaten, falls er Tags traegt. */
  let amKandidaten = true;
  if (wartend && wartend.text.hashtags.length) {
    amKandidaten = Hashtags.finalerText(wartend.text.captionBase,
      wartend.text.hashtags) === wartend.payload.caption;
  }

  const ok = auseinander.length === 0 && gleicheGrenze && zweimal && amKandidaten;
  return { wert: ok ? "true" : "false",
    zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? faelle.length + " Faelle: Repository und Worker setzen denselben Text " +
        "zusammen, Grenze beidseits " + Hashtags.MAX_HASHTAGS + "."
      : auseinander.length + " Faelle laufen auseinander, Grenze gleich: " +
        gleicheGrenze + ", am Kandidaten: " + amKandidaten };
}

function warteschlange() {
  return { wert: String(projektion.activeCount), zustand: ZUSTAND.ERFUELLT,
    satz: "aus owner-decision.warteschlange (" +
      OwnerDecision.AKTIVE_WARTESCHLANGE.join(", ") + "), nicht aus dem Ordner; " +
      projektion.items.length + " uebertragbar, " + projektion.unresolved.length +
      " ungeloest." };
}

/* JETZT PRUEFEN: derselbe Workflow wie der Zeitplan - unveraendert. */
function manuellerLauf() {
  const app = quelle("workers/vision-universe-social/src/approval.js") || "";
  const m = app.match(/WORKFLOW_DATEI\s*=\s*["']([^"']+)["']/);
  const datei = m ? m[1] : null;
  const wf = datei ? quelle(".github/workflows/" + datei) : null;
  const hatZeitplan = wf ? /^\s*schedule:/m.test(wf) : false;
  const ok = !!(datei && wf && hatZeitplan);
  return { wert: ok ? "true" : "false",
    zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Der Knopf stoesst " + datei + " an — dieselbe Datei, die der " +
        "Zeitplan startet."
      : "Der Knopf zeigt auf " + (datei || "nichts") + "." };
}

function leiterBereit() {
  const familien = Leiter.alleFamilien ? Leiter.alleFamilien() : [];
  const stufen = (Leiter.LEITER || []).length;
  const ok = stufen >= 3 && familien.length >= 5;
  return { wert: ok ? "true" : "false",
    zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: stufen + " Stufen ueber " + familien.length + " Inhaltsfamilien." };
}

/* Die Schalter — gemessen von der Stelle, die sie schon misst. */
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
    OWNER_PUBLISHING_GATE: zeile("OWNER_PUBLISHING_GATE")
  };
}
const schalter = harteInvarianten();

function ausSchalter(b, soll) {
  if (!b) {
    return { wert: "UNGEPRUEFT", zustand: ZUSTAND.UNGEPRUEFT,
      satz: "check-hard-invariants.mjs hat dazu nichts gemeldet." };
  }
  return { wert: b.wert, zustand: b.ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: "gemessen: " + b.wert + " (soll " + soll + ")" };
}

/* ===================================================================
   §27 — DIE DEFINITION OF DONE
   =================================================================== */

/** Die Ursache ist erklaert UND behoben, nicht nur beschrieben (§2). */
function ursacheBehoben() {
  const wf = quelle(".github/workflows/social-orchestrator.yml") || "";
  /* Der eigentliche Befund: das gerenderte Bild landet in
     assets/social/, und `git add social/data/` hat es nie erfasst.
     Jeder Lauf warf sein Bild weg. */
  const festgeschrieben = /git add[^\n]*assets\/social/.test(wf);
  const imWaechter = /git status --porcelain[^\n]*assets\/social/.test(wf);
  const gemessen = /--check-assets/.test(wf);
  const ok = festgeschrieben && imWaechter && gemessen;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Der Lauf schreibt assets/social/ fest, der Waechter sieht dort hin, " +
        "und jedes wartende Bild wird abgerufen."
      : "festgeschrieben=" + festgeschrieben + " imWaechter=" + imWaechter +
        " gemessen=" + gemessen };
}

/** Die Freigabe ist gesperrt, solange das Bild nicht erreichbar ist (§6). */
function freigabeGesperrt() {
  if (!wartend) {
    return { zustand: ZUSTAND.ERFUELLT,
      satz: "Kein wartender Kandidat; nichts freizugeben." };
  }
  if (!karteHtml) {
    return { zustand: ZUSTAND.UNGEPRUEFT,
      satz: "Die Karte liess sich hier nicht rendern." };
  }
  const knopf = /action="\/approval\/[^"]+\/approve"/.test(karteHtml);
  const ablehnen = /action="\/approval\/[^"]+\/reject"/.test(karteHtml);
  const darf = wartend.asset.erreichbar === true;
  /* Beide Richtungen: kein Knopf ohne Erreichbarkeit, und keiner
     FEHLT, wenn sie da ist. Eine Sperre, die immer sperrt, ist keine. */
  const ok = knopf === darf && ablehnen;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? (darf
          ? "Das Bild ist erreichbar; der Freigabeknopf ist da."
          : "Das Bild ist nicht erreichbar; kein Freigabeknopf, Ablehnen " +
            "bleibt moeglich.")
      : "Knopf=" + knopf + " bei erreichbar=" + darf + ", ablehnbar=" + ablehnen };
}

/** Die Hashtags sind VOR der Freigabe sichtbar (§15/§16). */
function tagsSichtbar() {
  if (!wartend) {
    return { zustand: ZUSTAND.ERFUELLT, satz: "Kein wartender Kandidat." };
  }
  if (!karteHtml) {
    return { zustand: ZUSTAND.UNGEPRUEFT, satz: "Die Karte liess sich nicht rendern." };
  }
  const ueberschrift = /<h2>Hashtags<\/h2>/.test(karteHtml);
  const tags = wartend.text.hashtags;
  const alle = tags.every((t) => karteHtml.includes(t));
  const ok = ueberschrift && alle;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? (tags.length
          ? "Alle " + tags.length + " Tags stehen als eigener Block auf der Karte."
          : "Der Block ist da und sagt, warum keine Tags im Text stehen.")
      : "Ueberschrift=" + ueberschrift + ", alle Tags sichtbar=" + alle };
}

/** Der gezeigte Text IST der Sendetext (§3/§17). */
function vorschauGleichNutzlast() {
  if (!wartend) {
    return { zustand: ZUSTAND.ERFUELLT, satz: "Kein wartender Kandidat." };
  }
  if (!karteHtml) {
    return { zustand: ZUSTAND.UNGEPRUEFT, satz: "Die Karte liess sich nicht rendern." };
  }
  const m = karteHtml.match(/<p class="caption">([\s\S]*?)<\/p>/);
  const gezeigt = m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null;
  const ok = gezeigt !== null && gezeigt === wartend.payload.caption;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Der Textabsatz der Karte ist zeichengleich mit dem, was gesendet wuerde (" +
        wartend.payload.caption.length + " Zeichen)."
      : "Gezeigt " + (gezeigt === null ? "nichts" : gezeigt.length + " Zeichen") +
        ", gesendet wuerden " + wartend.payload.caption.length };
}

/** Der aktuelle Kandidat wurde NICHT veroeffentlicht (§18). */
function nichtVeroeffentlicht() {
  const belege = [];
  const ordner = join(ROOT, "social/data");
  for (const name of ["publish-log.json", "published.json", "social-published.json"]) {
    const d = lies(join(ordner, name));
    if (d) belege.push({ name, eintraege: Array.isArray(d) ? d.length
      : (Array.isArray(d.entries) ? d.entries.length : 0) });
  }
  /* Der belastbare Beleg ist der Zustand in der kanonischen Maschine:
     ein veroeffentlichter Kandidat waere nicht mehr AWAITING_APPROVAL. */
  const roh = kandidaten.find((k) => wartend && k.candidateId === wartend.candidateId);
  const zustand = roh ? (roh.state || roh.status) : null;
  const veroeffentlicht = kandidaten.filter((k) =>
    ["PUBLISHED", "PUBLISHING"].includes(k.state || k.status));
  const ok = !wartend || (zustand === "AWAITING_APPROVAL" &&
    !veroeffentlicht.some((k) => k.candidateId === wartend.candidateId));
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? (wartend
          ? wartend.candidateId + " steht auf " + zustand + "; kein Kandidat " +
            "im Bestand steht auf PUBLISHED."
          : "Kein wartender Kandidat, nichts veroeffentlicht.")
      : wartend.candidateId + " steht auf " + zustand };
}

/** Die Leiter ist unveraendert geblieben (§20). */
function leiterUnveraendert() {
  const basis = git("rev-parse", "origin/main");
  if (!basis) {
    return { zustand: ZUSTAND.UNGEPRUEFT, satz: "origin/main nicht feststellbar." };
  }
  const geaendert = (git("diff", "--name-only", basis, "HEAD") || "")
    .split("\n").filter((z) => z.trim().length);
  const beruehrt = geaendert.filter((f) =>
    /content-ladder\.js|ladder-in-cycle|content-cadence\.js/.test(f));
  return { zustand: beruehrt.length === 0 ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: beruehrt.length === 0
      ? "Keine Datei der Content Fallback Ladder unterscheidet sich von main."
      : "Beruehrt: " + beruehrt.join(", ") };
}

/** JETZT PRUEFEN ist unveraendert geblieben (§20). */
function manuellerLaufUnveraendert() {
  const basis = git("rev-parse", "origin/main");
  if (!basis) {
    return { zustand: ZUSTAND.UNGEPRUEFT, satz: "origin/main nicht feststellbar." };
  }
  const geaendert = (git("diff", "--name-only", basis, "HEAD") || "")
    .split("\n").filter((z) => z.trim().length);
  const beruehrt = geaendert.filter((f) => /run-lease\.js|manual-run/.test(f));
  const laeuft = manuellerLauf();
  const ok = beruehrt.length === 0 && laeuft.zustand === ZUSTAND.ERFUELLT;
  return { zustand: ok ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: ok
      ? "Unveraendert und funktionsfaehig: " + laeuft.satz
      : "Beruehrt: " + (beruehrt.join(", ") || "nichts") + "; " + laeuft.satz };
}

/** Suiten und Isolation — der gemessene Befund, an einen Stand gebunden. */
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
      satz: "Gemessen in einem nicht sauberen Baum." };
  }
  return { zustand: beleg[feld] === true ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: satzBauer(beleg) + " (Stand " + beleg.commit.slice(0, 10) + ")" };
}

function inMain() {
  const kopf = git("rev-parse", "HEAD");
  git("fetch", "origin", "main");
  const main = git("rev-parse", "origin/main");
  if (!kopf || !main) {
    return { zustand: ZUSTAND.UNGEPRUEFT, satz: "main ist nicht feststellbar." };
  }
  if (kopf === main) {
    return { zustand: ZUSTAND.ERFUELLT,
      satz: "Dieser Stand IST main (" + kopf.slice(0, 10) + ")." };
  }
  const dateien = (git("diff", "--name-only", main, kopf) || "")
    .split("\n").filter((z) => z.trim().length);
  return { zustand: dateien.length === 0 ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
    satz: dateien.length === 0
      ? "Inhaltsgleich mit main (" + main.slice(0, 10) + ")."
      : dateien.length + " Datei(en) unterscheiden sich noch von main." };
}

/** Der Production Smoke, lesend (§25). */
async function produktionsSmoke() {
  const wege = ["/approval", "/social/status"];
  const befunde = [];
  for (const pfad of wege) {
    const a = await vomWorker(pfad);
    if (!a.erreicht) {
      return { zustand: ZUSTAND.UNGEPRUEFT,
        satz: "Der Smoke hat nicht stattgefunden: " + a.grund +
          ". Ein Smoke, der den Worker nie erreicht, ist keiner." };
    }
    befunde.push({ pfad, status: a.status, ray: a.ray,
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

/* ===================================================================
   LAUF
   =================================================================== */

const ZUSTAENDE = [
  { id: "APPROVAL_CENTER_LIVE", befund: approvalCenterLive },
  { id: "CURRENT_CANDIDATE", befund: aktuellerKandidat },
  { id: "ASSET_PUBLICLY_REACHABLE", befund: assetErreichbar },
  { id: "ASSET_PREVIEW_EQUALS_PUBLISH_ASSET", befund: vorschauGleichSendung },
  { id: "HASHTAG_ENGINE_READY", befund: hashtagEngineBereit },
  { id: "HASHTAG_COUNT_CURRENT_CANDIDATE", befund: tagsAmKandidaten },
  { id: "FINAL_PUBLIC_TEXT_READY", befund: finalTextBereit },
  { id: "ACTIVE_APPROVAL_QUEUE_COUNT", befund: warteschlange },
  { id: "MANUAL_ORCHESTRATOR_RUN", befund: manuellerLauf },
  { id: "CONTENT_FALLBACK_LADDER_READY", befund: leiterBereit },
  { id: "MAX_OPEN_CREATIVE_JOBS",
    befund: () => ausSchalter(schalter.MAX_OPEN_CREATIVE_JOBS, "1") },
  { id: "OWNER_PUBLISHING_GATE",
    befund: () => ausSchalter(schalter.OWNER_PUBLISHING_GATE, "REQUIRED") },
  { id: "GLOBAL_AUTOPUBLISH",
    befund: () => ausSchalter(schalter.GLOBAL_AUTOPUBLISH, "false") },
  { id: "VU_SOCIAL_AUTOPUBLISH",
    befund: () => ausSchalter(schalter.VU_SOCIAL_AUTOPUBLISH, "false") }
];

const BEDINGUNGEN = [
  { id: "ASSET_ROOT_CAUSE_BEHOBEN", ref: "§2", befund: ursacheBehoben },
  { id: "ASSET_PREVIEW_PRODUCTION_SAFE", ref: "§3", befund: vorschauGleichSendung },
  { id: "FREIGABE_GESPERRT_OHNE_ERREICHBARKEIT", ref: "§6", befund: freigabeGesperrt },
  { id: "HASHTAGS_VISIBLE_BEFORE_APPROVAL", ref: "§15/§16", befund: tagsSichtbar },
  { id: "PREVIEW_EQUALS_PUBLISH_PAYLOAD", ref: "§17", befund: vorschauGleichNutzlast },
  { id: "HASHTAG_ENGINE_LIEFERT_BREITE", ref: "§10/§12", befund: hashtagEngineBereit },
  { id: "CURRENT_XOM_CANDIDATE_NOT_PUBLISHED", ref: "§18",
    befund: nichtVeroeffentlicht },
  { id: "CONTENT_FALLBACK_LADDER_UNCHANGED", ref: "§20", befund: leiterUnveraendert },
  { id: "MANUAL_ORCHESTRATOR_RUN_UNCHANGED", ref: "§20",
    befund: manuellerLaufUnveraendert },
  { id: "SUITEN_GRUEN", ref: "§21", befund: () => ausBeleg("suitesOk", (b) =>
      b.suites.map((r) => r.id + ": " + r.pass + "/" + r.tests +
        (r.skipped ? " (" + r.skipped + " uebersprungen)" : "")).join(", ")) },
  { id: "TEST_PRODUKTIONS_ISOLATION", ref: "§23", befund: () => ausBeleg("isolationOk",
      (b) => b.isolation.map((i) => i.id + ": " +
        (i.ok ? "unveraendert" : "VERAENDERT")).join(", ")) },
  { id: "IN_MAIN_INTEGRIERT", ref: "§24", befund: inMain },
  { id: "PRODUCTION_SMOKE_OHNE_VEROEFFENTLICHUNG", ref: "§25",
    befund: produktionsSmoke }
];

async function messen(liste) {
  const aus = [];
  for (const b of liste) {
    let r;
    try { r = await b.befund(); }
    catch (err) {
      r = { zustand: ZUSTAND.UNGEPRUEFT,
        satz: "Die Pruefung selbst ist gescheitert: " +
          String(err && err.message).slice(0, 140) };
    }
    aus.push({ id: b.id, ref: b.ref || null, ...r });
  }
  return aus;
}

const zustaende = await messen(ZUSTAENDE);
const bedingungen = await messen(BEDINGUNGEN);

/* -------------------------------------------------------------------
   CRITICAL_BLOCKERS

   Nicht "alles, was nicht gruen ist": UNGEPRUEFT aus einer Umgebung
   ohne Netz ist kein Betriebsproblem, sondern eine Grenze dieser
   Messung. Ein Blocker ist etwas, das GEMESSEN falsch steht.
   ------------------------------------------------------------------- */
const blocker = bedingungen.filter((b) => b.zustand === ZUSTAND.NICHT_ERFUELLT);
const ungeprueft = bedingungen.filter((b) => b.zustand === ZUSTAND.UNGEPRUEFT);
const fertig = blocker.length === 0 && ungeprueft.length === 0;

zustaende.push({ id: "CRITICAL_BLOCKERS", ref: "§26",
  wert: String(blocker.length),
  zustand: blocker.length === 0 ? ZUSTAND.ERFUELLT : ZUSTAND.NICHT_ERFUELLT,
  satz: blocker.length === 0
    ? (ungeprueft.length
        ? "Kein gemessener Blocker. " + ungeprueft.length + " Bedingung(en) " +
          "sind von hier aus ungeprueft und damit NICHT erfuellt."
        : "Kein gemessener Blocker.")
    : blocker.map((b) => b.id).join(", ") });

if (JSON_AUS) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    commit: git("rev-parse", "HEAD"),
    worker: WORKER,
    ORDER_DONE: fertig,
    states: zustaende,
    conditions: bedingungen,
    blockers: blocker.map((b) => b.id),
    unverified: ungeprueft.map((b) => b.id)
  }, null, 2));
} else {
  const Z = { ERFUELLT: "+", NICHT_ERFUELLT: "x", UNGEPRUEFT: "?" };
  console.log("VISION UNIVERSE SOCIAL — APPROVAL ASSET + HASHTAG PRODUCTION FIX\n");
  console.log("§26 GEMESSENE ZUSTAENDE\n");
  for (const r of zustaende) {
    console.log("  " + Z[r.zustand] + " " + r.id.padEnd(36) +
      String(r.wert === undefined ? r.zustand : r.wert));
    console.log("      " + r.satz);
  }
  console.log("\n§27 DEFINITION OF DONE\n");
  for (const r of bedingungen) {
    console.log("  " + Z[r.zustand] + " " + r.id.padEnd(42) +
      (r.ref || "").padEnd(10) + r.zustand);
    console.log("      " + r.satz);
  }
  console.log("\nORDER_DONE        " + (fertig ? "true" : "false"));
  console.log("CRITICAL_BLOCKERS " + blocker.length +
    (blocker.length ? "  (" + blocker.map((b) => b.id).join(", ") + ")" : ""));
  if (ungeprueft.length) {
    console.log("UNGEPRUEFT        " + ungeprueft.length + "  (" +
      ungeprueft.map((b) => b.id).join(", ") + ")");
    console.log("\nUngeprueft zaehlt nicht als erfuellt: aus einer Umgebung ohne");
    console.log("Zugang zum Worker ist jede Antwort eine ueber den Weg dorthin.");
  }
}

process.exit(fertig ? 0 : 1);

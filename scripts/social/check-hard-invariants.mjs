/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/check-hard-invariants.mjs

   DIE FUENF SAETZE, GEMESSEN (§45)

   Dieses Skript sammelt den echten Zustand ein und uebergibt ihn der
   Engine. Es urteilt nicht selbst - sonst gaebe es zwei Meinungen
   darueber, ob eine Invariante haelt.

   DER PUBLISH-PFAD WIRD WIRKLICH AUFGERUFEN. Ohne Freigabe, gegen den
   echten Worker-Code, mit einer Attrappe fuer KV und Netz. Er muss
   ablehnen. Ein Tor, das man nur behauptet, ist keins - und genau so
   stand es vorher im Bericht: `active: true`, hingeschrieben.

   ES WIRD NICHTS VEROEFFENTLICHT. Der Aufruf endet an der Ablehnung;
   kaeme er durch, waere das der Befund, und dann traegt die Attrappe
   dafuer Sorge, dass nichts nach aussen geht.

   Ausfuehren:
     node scripts/social/check-hard-invariants.mjs
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Invarianten = require(join(ROOT, "social/engines/hard-invariants.js"));
const Registry = require(join(ROOT, "social/engines/source-registry.js"));
const Job = require(join(ROOT, "social/engines/creative-job.js"));

function lies(pfad, fallback = null) {
  const p = join(ROOT, pfad);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}
function text(pfad) {
  const p = join(ROOT, pfad);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/* =========================================================================
   DER ECHTE PUBLISH-PFAD — ZWEIMAL GEFRAGT

   -------------------------------------------------------------------------
   WAS AM OWNER-TOR ZU MESSEN IST, UND WARUM EINE FRAGE NICHT REICHT
   -------------------------------------------------------------------------

   Im Worker steht das Tor als EINE Bedingung:

       if (!autopublish && !genehmigung) -> 403

   Das heisst: es ist das Komplement des globalen Schalters. Mit
   ausgeschaltetem Autopublish haelt es immer, mit eingeschaltetem nie.
   Wer es also nur einmal fragt, misst je nach Schalterstellung
   entweder eine Selbstverstaendlichkeit oder einen Fehlschlag - und in
   beiden Faellen nicht das, was er zu messen glaubt.

   Drei Anlaeufe brauchte es, bis diese Pruefung ueberhaupt am Tor
   ankam, und jeder Zwischenstand sah aus wie ein Erfolg:

     /social/publish        gibt es nicht -> "notFound", Tor "haelt"
     Schalter aus           -> "publishingDisabled", das ist der
                               Schalter und nicht das Tor
     ohne Verbindung        -> "notConnected", das ist die Anbindung

   Ein Waechter, der haelt, weil man ihn gar nicht erst gefragt hat.

   -------------------------------------------------------------------------
   DESHALB ZWEI FRAGEN
   -------------------------------------------------------------------------

     A) IM ECHTEN BETRIEB. Schalter aus, keine Freigabe: es darf nichts
        veroeffentlicht werden. Das ist die Aussage, die im Betrieb
        zaehlt - und sie haengt zugegebenermassen am Schalter.

     B) UNABHAENGIG VOM SCHALTER. Schalter AN, aber eine Freigabe mit
        FALSCHEM Inhaltsabdruck. Hier kann der Schalter nichts mehr
        retten: entweder der Abdruck wird geprueft, oder ein
        nachtraeglich geaenderter Inhalt geht mit einer alten Freigabe
        hinaus.

   Nur B misst eine Eigenschaft, die das Tor selbst hat. A sagt, was im
   Betrieb gilt. Beides steht im Ergebnis; keines ersetzt das andere.

   ES GEHT NICHTS HINAUS. `fetch` wirft in dieser Pruefung, KV ist eine
   Attrappe, und der echte Wert des Schalters wird getrennt gemessen.
   ========================================================================= */
async function publishPfad(env, koerper) {
  const worker = (await import(
    join(ROOT, "workers/vision-universe-social/src/index.js"))).default;
  const gespeichert = globalThis.fetch;
  const rufe = [];
  globalThis.fetch = async (u) => {
    rufe.push(String(u));
    throw new Error("Kein Netz in dieser Pruefung.");
  };
  try {
    const antwort = await worker.fetch(new Request(
      "https://social.visionuniverse.de/social/meta/publish", {
        method: "POST",
        headers: { "content-type": "application/json",
                   authorization: "Bearer " + env.VU_SOCIAL_ADMIN_KEY },
        body: JSON.stringify(koerper)
      }), env);
    let j = {};
    try { j = await antwort.json(); } catch { j = {}; }
    return { status: antwort.status, published: j.published === true,
             error: j.error || null, netzversuche: rufe.length };
  } finally {
    globalThis.fetch = gespeichert;
  }
}

/* Eine Umgebung, die antworten kann und sonst nichts. `verbunden`
   legt den Verbindungsdatensatz hinein, damit der Aufruf ueberhaupt
   bis zum Tor kommt - ohne ihn endet er vorher an der Anbindung. */
function pruefUmgebung({ autopublish, verbunden }) {
  const ablage = new Map();
  if (verbunden) {
    ablage.set("meta:connection:v1", JSON.stringify({
      igUserId: "0", igUsername: "pruefung", pageId: "0",
      accessToken: "kein-echtes-token", connectedAt: new Date().toISOString(),
      scopes: [], tokenType: "long_lived"
    }));
  }
  return {
    VU_SOCIAL_ADMIN_KEY: "p".repeat(48),
    ...(autopublish ? { VU_SOCIAL_AUTOPUBLISH: "on" } : {}),
    VU_SOCIAL_KV: {
      async get(k) { return ablage.has(k) ? ablage.get(k) : null; },
      async put(k, v) { ablage.set(k, String(v)); },
      async delete(k) { ablage.delete(k); },
      async list() { return { keys: [...ablage.keys()].map((name) => ({ name })),
        list_complete: true }; }
    }
  };
}

const INHALT = { contentId: "pruef_ohne_freigabe",
  imageUrl: "https://example.invalid/bild.jpg", caption: "Pruefung." };

/* A) Der echte Betrieb: Schalter aus, keine Freigabe. */
const imBetrieb = await publishPfad(
  pruefUmgebung({ autopublish: false, verbunden: true }), INHALT);

/* B) Schalterunabhaengig: Schalter an, Freigabe mit falschem Abdruck. */
const falscherAbdruck = await publishPfad(
  pruefUmgebung({ autopublish: true, verbunden: true }),
  Object.assign({}, INHALT, { approval: {
    approvedBy: "pruefung", approvedAt: new Date().toISOString(),
    contentHash: "0".repeat(64) } }));

const register = lies("social/data/creative-jobs.json", { jobs: [] });
const offeneJobs = ((register && register.jobs) || [])
  .filter((j) => Job.OFFEN.includes(j.state)).length;

const quellen = lies("social/data/external-sources.json", null);

const ergebnis = Invarianten.alle({
  openCreativeJobs: offeneJobs,
  cadenceConfig: lies("social/config/cadence.json", null),
  killSwitch: lies("social/config/kill-switch.json", null),
  wrangler: text("workers/vision-universe-social/wrangler.toml"),
  workerSource: text("workers/vision-universe-social/src/index.js"),
  publishOhneFreigabe: imBetrieb,
  publishMitFalschemAbdruck: falscherAbdruck,
  registryStatus: quellen ? Registry.status(quellen) : null
});

console.log("VISION UNIVERSE SOCIAL — HARTE INVARIANTEN (§45)\n");
for (const b of ergebnis.invarianten) {
  console.log((b.erfuellt ? "  OK   " : "  FEHL ") + b.id.padEnd(32) +
    "ist " + String(b.wert).padEnd(7) + " soll " + String(b.soll));
  console.log("         Quelle: " + b.quelle);
  console.log("         " + b.beleg);
}
console.log("\n" + ergebnis.erklaerung);

if (!ergebnis.ok) process.exit(1);

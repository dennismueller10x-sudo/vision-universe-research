#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — probe-cloudflare-scope.mjs

   WAS DARF DAS VORHANDENE TOKEN WIRKLICH?

   `wrangler whoami` hat am 17.09.2026 geantwortet - aber die Rechteliste
   nicht ausgegeben, sondern auf das Dashboard verwiesen. Das ist kein
   Zufall: die Liste kommt nur, wenn das Token selbst "User Details:Read"
   traegt. Fehlt das, sagt wrangler nichts ueber die Rechte, und wer die
   Stille als "keine Rechte" liest, liest sie falsch.

   Also wird gefragt, statt geschlossen. Vier Leseaufrufe gegen die
   Cloudflare-API, jeder einzelne ein GET:

     workers/scripts                      Workers lesbar?
     workers/durable_objects/namespaces   Durable Objects lesbar?
     workers/subdomain                    gibt es ein *.workers.dev?
     r2/buckets                           (zum Vergleich: R2 lesbar?)

   WAS DAS BEANTWORTET UND WAS NICHT

   Ein 200 auf workers/scripts belegt Leserecht an Workers. Es belegt
   NICHT das Schreibrecht - das liesse sich nur durch Schreiben zeigen,
   und geschrieben wird hier nichts. Cloudflares eigene Vorlage "Edit
   Cloudflare Workers" vergibt beides zusammen, ein reines R2-Token
   keines von beiden; ein 200 ist also ein starker Hinweis und wird im
   Bericht auch nur so genannt.

   Ein 403 dagegen ist eindeutig: dann fehlt das Recht, und ein Deployment
   waere ein Fehlschlag mit Ansage.

   KEINE WERTE IM BERICHT. Die Account-ID wird maskiert, bevor
   irgendetwas ausgegeben wird; aus Fehlermeldungen wird jede
   32-stellige Hexfolge geschnitten. Es wird nichts erzeugt, nichts
   geaendert, nichts ausgerollt.
   ========================================================================= */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");
const API = "https://api.cloudflare.com/client/v4";

const token = process.env.CLOUDFLARE_API_TOKEN || "";
let account = process.env.CLOUDFLARE_ACCOUNT_ID || "";

/* Die Account-ID kann aus dem bestehenden R2-Endpunkt kommen. Sie wird
   der Ablaufumgebung als Maske angemeldet, bevor sie benutzt wird. */
if (!account) {
  const m = /^https:\/\/([0-9a-f]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com\/?$/i
    .exec(String(process.env.VU_HISTORY_S3_ENDPOINT || "").trim());
  if (m) account = m[1];
}
if (account && process.env.GITHUB_ACTIONS === "true") console.log("::add-mask::" + account);

function entschaerfen(text) {
  return String(text || "").replace(/[0-9a-f]{32}/gi, "<maskiert>");
}

const PRUEFUNGEN = [
  { id: "workersScripts", pfad: "/accounts/" + account + "/workers/scripts",
    frage: "Workers lesbar?", zaehlt: true },
  { id: "durableObjects", pfad: "/accounts/" + account + "/workers/durable_objects/namespaces",
    frage: "Durable Objects lesbar?", zaehlt: true },
  { id: "workersSubdomain", pfad: "/accounts/" + account + "/workers/subdomain",
    frage: "gibt es ein *.workers.dev?", zaehlt: false },
  { id: "r2Buckets", pfad: "/accounts/" + account + "/r2/buckets",
    frage: "R2 lesbar (zum Vergleich)?", zaehlt: true },
  /* Fuer die Null-Euro-Zusage entscheidend, und zwar aus einem Grund,
     den der Kostenentwurf bisher nicht kannte: die Freigrenzen gelten
     JE KONTO, nicht je Worker. Laeuft dort schon etwas, teilt sich
     vu-live die 100.000 Anfragen mit ihm. */
  { id: "workersAccountSettings", pfad: "/accounts/" + account + "/workers/account-settings",
    frage: "Kontoeinstellungen (Tarif) lesbar?", zaehlt: false }
];

const bericht = {
  schemaVersion: "cloudflare-scope-probe-1.0.0",
  auftrag: "Owner-Update 17.09.2026: reicht das vorhandene Token fuer Workers und Durable Objects?",
  checkedAt: new Date().toISOString(),
  note: "Nur Leseaufrufe. Keine Werte, keine Account-ID, keine Namen - nur Status und Anzahlen.",
  environment: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  method: "GET gegen api.cloudflare.com/client/v4",
  caveat: "Ein 200 belegt Leserecht, nicht Schreibrecht. Geschrieben wird hier nichts.",
  accountIdAvailable: !!account,
  checks: [],
  verdict: null,
  consequence: null
};

if (!token || !account) {
  bericht.verdict = "UNKNOWN";
  bericht.consequence = !token
    ? "Kein CLOUDFLARE_API_TOKEN in dieser Umgebung - ausserhalb von Actions gibt es keine Secrets."
    : "Keine Account-ID - weder gesetzt noch aus dem R2-Endpunkt ableitbar.";
  schreibe();
} else {
  for (const p of PRUEFUNGEN) {
    const eintrag = { id: p.id, question: p.frage, status: null, ok: null, count: null,
                      cloudflareErrors: null, note: null };
    try {
      const r = await fetch(API + p.pfad, {
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }
      });
      eintrag.status = r.status;
      let k = null;
      try { k = await r.json(); } catch (e) { /* kein JSON */ }
      eintrag.ok = !!(k && k.success);
      if (k && Array.isArray(k.result) && p.zaehlt) eintrag.count = k.result.length;
      if (k && Array.isArray(k.errors) && k.errors.length) {
        /* Cloudflares Fehlercodes sind die eigentliche Auskunft: 9109
           heisst "dem Token fehlt dieses Recht", 10000 "nicht
           berechtigt". Sie tragen keine Geheimnisse - die Meldung wird
           trotzdem entschaerft. */
        eintrag.cloudflareErrors = k.errors.map((e) => ({ code: e.code, message: entschaerfen(e.message) }));
      }
    } catch (err) {
      eintrag.status = 0;
      eintrag.note = entschaerfen((err && err.message) || String(err));
    }
    bericht.checks.push(eintrag);
    console.log("  " + String(eintrag.status).padEnd(4) + (eintrag.ok ? "ok    " : "nein  ") +
                p.frage + (eintrag.count !== null ? "  (" + eintrag.count + ")" : "") +
                (eintrag.cloudflareErrors ? "  " + eintrag.cloudflareErrors.map((e) => e.code).join(",") : ""));
  }

  /* Was schon im Konto liegt, teilt sich die Freigrenze mit uns. */
  const einstellungen = bericht.checks.find((c) => c.id === "workersAccountSettings");
  const skripte = bericht.checks.find((c) => c.id === "workersScripts");
  bericht.sharedFreeTier = {
    existingWorkerScripts: skripte && skripte.count !== null ? skripte.count : null,
    note: "Die kostenlosen Kontingente gelten JE KONTO, nicht je Worker. Jeder Worker, der hier " +
          "schon laeuft, verbraucht aus denselben 100.000 Anfragen je Tag. Der Budgetwaechter von " +
          "vu-live sieht diesen Verbrauch nicht - er zaehlt nur den eigenen.",
    consequence: skripte && skripte.count ? "Es liegt bereits " + skripte.count +
                 " Worker-Skript im Konto. Die Reserve des Waechters (10.000 Anfragen) muss das " +
                 "abdecken, oder sie wird erhoeht." : "Kein weiterer Worker im Konto."
  };
  if (einstellungen) bericht.workersAccountSettingsReadable = !!einstellungen.ok;

  const workers = bericht.checks.find((c) => c.id === "workersScripts");
  const dos = bericht.checks.find((c) => c.id === "durableObjects");
  const r2 = bericht.checks.find((c) => c.id === "r2Buckets");

  if (workers.ok && dos.ok) {
    bericht.verdict = "WORKERS_READABLE";
    bericht.consequence =
      "Das vorhandene Token liest Workers UND Durable Objects. Ein reines R2-Token kann das nicht - " +
      "es ist also kein R2-Token, sondern ein Zugang mit Workers-Umfang. Ob es auch SCHREIBEN darf, " +
      "zeigt erst das Deployment selbst; Cloudflares Vorlage 'Edit Cloudflare Workers' vergibt Lesen " +
      "und Schreiben zusammen.";
  } else if (workers.ok && !dos.ok) {
    bericht.verdict = "WORKERS_ONLY";
    bericht.consequence =
      "Workers sind lesbar, Durable Objects nicht. Genau die aber traegt dieser Entwurf - ohne das " +
      "Recht an Durable Objects scheitert das Deployment.";
  } else if (r2 && r2.ok) {
    bericht.verdict = "R2_ONLY";
    bericht.consequence =
      "Das Token liest R2, aber keine Workers. Es wurde offenbar fuer die bestehende R2-Anbindung " +
      "angelegt. Fuer dieses Deployment reicht es nicht.";
  } else {
    bericht.verdict = "INSUFFICIENT";
    bericht.consequence = "Weder Workers noch R2 lesbar. Der Umfang des Tokens ist ein anderer.";
  }
  schreibe();
}

function schreibe() {
  mkdirSync(OUT_DIR, { recursive: true });
  const pfad = join(OUT_DIR, "cloudflare-scope-probe.json");
  writeFileSync(pfad, JSON.stringify(bericht, null, 2) + "\n");
  console.log("");
  console.log("URTEIL: " + bericht.verdict);
  console.log(bericht.consequence);
  console.log("Bericht: " + pfad.slice(root.length + 1));
}

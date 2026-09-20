#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — attach-live-domain.mjs

   DER BEVORZUGTE NAME, UND DIE GRENZE DARUM HERUM

   Owner-Auftrag 17.09.2026: "bevorzugt live.visionuniverse.de als
   Realtime-Endpunkt verwenden, sofern dies ohne Aenderung der
   bestehenden Research-Domain moeglich ist" und "research.visionuniverse.de
   auf GitHub Pages belassen".

   Beides zugleich ist moeglich, weil es zwei verschiedene Namen in
   derselben Zone sind. live.* entsteht neu; research.* wird nicht
   angefasst. Damit das keine Absichtserklaerung bleibt, steht es als
   Riegel im Code: dieses Skript schreibt AUSSCHLIESSLICH den Hostnamen
   live.visionuniverse.de. Jeder andere - und research.* zuerst - bricht
   den Lauf ab, bevor irgendetwas hinausgeht.

   ZWEI BETRIEBSARTEN

     ohne --apply   nur nachsehen: gibt es die Zone, gibt es den Namen
                    schon, waere der Schritt ueberhaupt moeglich
     mit --apply    den Namen anlegen (der einzige Schreibvorgang)

   Keine Werte im Protokoll. Zonen- und Konto-IDs werden maskiert.
   ========================================================================= */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");
const API = "https://api.cloudflare.com/client/v4";

/* Der EINZIGE Hostname, den dieses Skript schreiben darf. */
const ERLAUBTER_HOST = "live.visionuniverse.de";
const ZONE = "visionuniverse.de";
/* Was unter keinen Umstaenden angefasst wird. */
const TABU = ["research.visionuniverse.de", "visionuniverse.de", "www.visionuniverse.de"];

const APPLY = process.argv.includes("--apply");
const SERVICE = "vu-live";
const token = process.env.CLOUDFLARE_API_TOKEN || "";
let account = process.env.CLOUDFLARE_ACCOUNT_ID || "";
if (!account) {
  const m = /^https:\/\/([0-9a-f]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com\/?$/i
    .exec(String(process.env.VU_HISTORY_S3_ENDPOINT || "").trim());
  if (m) account = m[1];
}
if (account && process.env.GITHUB_ACTIONS === "true") console.log("::add-mask::" + account);

function entschaerfen(t) { return String(t || "").replace(/[0-9a-f]{32}/gi, "<maskiert>"); }

/* Der Riegel. Er steht vor jedem Schreibvorgang, nicht daneben. */
function pruefeHost(host) {
  if (host !== ERLAUBTER_HOST) {
    throw new Error("Dieses Skript schreibt nur " + ERLAUBTER_HOST + ", nie " + host + ".");
  }
  if (TABU.indexOf(host) !== -1) {
    throw new Error(host + " ist ausdruecklich tabu.");
  }
}

async function cf(pfad, init) {
  const r = await fetch(API + pfad, Object.assign({
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }
  }, init || {}));
  let k = null;
  try { k = await r.json(); } catch (e) { /* kein JSON */ }
  return { status: r.status, ok: !!(k && k.success), body: k };
}

const bericht = {
  schemaVersion: "vu-live-domain-1.0.0",
  auftrag: "Owner 17.09.2026: bevorzugt live.visionuniverse.de, research.* unberuehrt",
  checkedAt: new Date().toISOString(),
  hostname: ERLAUBTER_HOST,
  mode: APPLY ? "apply" : "inspect",
  guard: { onlyWrites: ERLAUBTER_HOST, neverTouches: TABU },
  zoneFound: false,
  alreadyAttached: false,
  applied: false,
  result: "UNKNOWN",
  reason: null,
  steps: []
};

function schritt(name, status, detail) {
  bericht.steps.push({ name, status, detail: detail === undefined ? null : detail });
  console.log("  " + String(status).padEnd(5) + name + (detail ? "  " + JSON.stringify(detail) : ""));
}

async function main() {
  pruefeHost(ERLAUBTER_HOST);        /* auch der Riegel selbst wird geprueft */
  if (!token || !account) {
    bericht.result = "UNKNOWN";
    bericht.reason = !token ? "noToken" : "noAccountId";
    return schreibe();
  }

  /* 1. Liegt die Zone ueberhaupt in diesem Konto? */
  const zonen = await cf("/zones?name=" + encodeURIComponent(ZONE));
  const zone = zonen.ok && Array.isArray(zonen.body.result) && zonen.body.result.length
    ? zonen.body.result[0] : null;
  bericht.zoneFound = !!zone;
  schritt("Zone " + ZONE + " im Konto?", zonen.status, { found: !!zone, status: zone ? zone.status : null });
  if (!zone) {
    bericht.result = "ZONE_NOT_AVAILABLE";
    bericht.reason = zonen.status === 403 ? "tokenLacksZoneRead" : "zoneNotInAccount";
    bericht.consequence = zonen.status === 403
      ? "Das Token darf Zonen nicht lesen. Der Worker bleibt unter seiner workers.dev-Adresse - " +
        "funktionsgleich, nur ohne den huebschen Namen."
      : "Die Zone " + ZONE + " liegt nicht in diesem Cloudflare-Konto. Ein Worker-Name darin laesst " +
        "sich von hier aus nicht anlegen; der Worker bleibt unter workers.dev.";
    return schreibe();
  }
  if (zone.id && process.env.GITHUB_ACTIONS === "true") console.log("::add-mask::" + zone.id);

  /* 2. Gibt es den Namen schon? Zweimal anlegen waere kein Fehler, aber
        eine Aenderung, die niemand gebeten hat. */
  const vorhanden = await cf("/accounts/" + account + "/workers/domains?hostname=" +
                             encodeURIComponent(ERLAUBTER_HOST));
  const treffer = vorhanden.ok && Array.isArray(vorhanden.body.result)
    ? vorhanden.body.result.find((d) => d.hostname === ERLAUBTER_HOST) : null;
  bericht.alreadyAttached = !!treffer;
  schritt("Name schon vergeben?", vorhanden.status,
          { attached: !!treffer, service: treffer ? treffer.service : null });

  if (treffer && treffer.service === SERVICE) {
    bericht.result = "ALREADY_ATTACHED";
    bericht.consequence = ERLAUBTER_HOST + " zeigt bereits auf " + SERVICE + ". Nichts zu tun.";
    return schreibe();
  }
  if (treffer) {
    bericht.result = "TAKEN_BY_OTHER_SERVICE";
    bericht.reason = "hostnameInUse";
    bericht.consequence = ERLAUBTER_HOST + " zeigt auf einen anderen Dienst. Das wird hier NICHT " +
                          "umgehaengt - ein bestehender Endpunkt gehoert nicht ungefragt jemand anderem.";
    return schreibe();
  }

  if (!APPLY) {
    bericht.result = "READY_TO_ATTACH";
    bericht.consequence = "Die Zone ist da, der Name frei. Mit --apply wuerde er angelegt.";
    return schreibe();
  }

  /* 3. Der einzige Schreibvorgang. */
  pruefeHost(ERLAUBTER_HOST);
  const anlegen = await cf("/accounts/" + account + "/workers/domains", {
    method: "PUT",
    body: JSON.stringify({ environment: "production", hostname: ERLAUBTER_HOST,
                           service: SERVICE, zone_id: zone.id })
  });
  schritt("Namen anlegen", anlegen.status,
          { ok: anlegen.ok, errors: anlegen.body && anlegen.body.errors
            ? anlegen.body.errors.map((e) => ({ code: e.code, message: entschaerfen(e.message) })) : null });
  bericht.applied = anlegen.ok;
  bericht.result = anlegen.ok ? "ATTACHED" : "ATTACH_FAILED";
  bericht.reason = anlegen.ok ? null : "cloudflareRejected";
  bericht.consequence = anlegen.ok
    ? "https://" + ERLAUBTER_HOST + " zeigt jetzt auf " + SERVICE + ". research.visionuniverse.de " +
      "wurde nicht angefasst und liegt weiter auf GitHub Pages."
    : "Cloudflare hat abgelehnt. Der Worker bleibt unter seiner workers.dev-Adresse - funktionsgleich, " +
      "nur ohne den huebschen Namen.";
  return schreibe();
}

function schreibe() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "vu-live-domain.json"), JSON.stringify(bericht, null, 2) + "\n");
  console.log("");
  console.log("ERGEBNIS: " + bericht.result + (bericht.reason ? " (" + bericht.reason + ")" : ""));
  if (bericht.consequence) console.log(bericht.consequence);
  return bericht;
}

main().catch((err) => {
  bericht.result = "ERROR";
  bericht.reason = entschaerfen(err && err.message);
  schreibe();
  process.exit(1);
});

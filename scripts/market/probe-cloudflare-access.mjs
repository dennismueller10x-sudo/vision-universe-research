#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — probe-cloudflare-access.mjs

   WAS SCHON DA IST, HERAUSFINDEN - OHNE ES ANZUFASSEN

   Der Owner hat am 17.09.2026 mitgeteilt, dass im Repository bereits ein
   Secret mit dem Praefix CLOUDFLARE_API_ liegt, dazu TIINGO_API_KEY und
   die VU_HISTORY_S3_*-Gruppe fuer die bestehende R2-Anbindung. Also wird
   nichts Neues erzeugt und nichts ersetzt. Erst wird nachgesehen.

   Drei Fragen, drei Antworten:

     1. Unter WELCHEM Namen liegt das Cloudflare-Secret?
        Im Repository steht es nirgends - kein Workflow liest heute ein
        CLOUDFLARE_*. Deshalb wird jeder plausible Name abgefragt und nur
        gemeldet, OB er gesetzt ist.

     2. Taugt es fuer dieses Deployment?
        Ein Token fuer R2 hat nicht automatisch die Rechte fuer Workers
        und Durable Objects. Das beantwortet `wrangler whoami` - und zwar
        aus der Sache heraus, nicht aus dem Namen.

     3. Laesst sich die Account-ID ableiten, statt sie anzufordern?
        Der R2-Endpunkt hat die Form https://<account>.r2.cloudflarestorage.com
        (scripts/market/storage/s3-driver.mjs, Zeile 121). Er liegt als
        VU_HISTORY_S3_ENDPOINT bereits vor. Wenn er diese Form hat, ist
        die Account-ID da und muss nicht erfragt werden.

   WAS DIESES SKRIPT NIEMALS TUT

   Einen Wert ausgeben. Nicht das Token, nicht den Endpunkt, nicht die
   Account-ID. Gemeldet werden Namen, Formen und Rechte. Die abgeleitete
   Account-ID wird der Ablaufumgebung ausdruecklich als Maske gemeldet
   (::add-mask::), damit sie auch dann nicht im Protokoll landet, wenn
   ein spaeterer Schritt sie unbedacht ausgibt.

   Es erzeugt auch nichts, ersetzt nichts, rotiert nichts und rollt
   nichts aus.
   ========================================================================= */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");

/* Die Namen, unter denen ein Cloudflare-Zugang ueblicherweise liegt.
   wrangler selbst liest die ersten beiden; die anderen sind verbreitete
   Eigenschreibweisen. */
const KANDIDATEN = [
  { name: "CLOUDFLARE_API_TOKEN", rolle: "Token, von wrangler direkt gelesen", bevorzugt: true },
  { name: "CLOUDFLARE_API_KEY", rolle: "Global API Key, braucht zusaetzlich CLOUDFLARE_EMAIL", bevorzugt: false },
  { name: "CLOUDFLARE_TOKEN", rolle: "Eigenschreibweise, muss umgehaengt werden", bevorzugt: false },
  { name: "CF_API_TOKEN", rolle: "Eigenschreibweise, muss umgehaengt werden", bevorzugt: false },
  { name: "CLOUDFLARE_API", rolle: "Eigenschreibweise, muss umgehaengt werden", bevorzugt: false },
  { name: "CLOUDFLARE_ACCOUNT_ID", rolle: "Account-ID, von wrangler direkt gelesen", bevorzugt: true },
  { name: "CLOUDFLARE_EMAIL", rolle: "nur zusammen mit einem Global API Key noetig", bevorzugt: false }
];

/**
 * Die Form eines Wertes, nicht der Wert.
 *
 * Ein Cloudflare API Token ist 40 Zeichen aus [A-Za-z0-9_-]; ein Global
 * API Key ist 37 Zeichen Hex. Die Unterscheidung entscheidet, ob
 * zusaetzlich eine E-Mail-Adresse noetig ist - und sie laesst sich
 * treffen, ohne den Wert zu nennen.
 */
function form(v) {
  if (!v) return null;
  const s = String(v);
  if (/^[0-9a-f]{37}$/.test(s)) return "globalApiKey";      /* 37 Hex */
  if (/^[0-9a-f]{32}$/.test(s)) return "accountIdOderHex32";
  if (/^[A-Za-z0-9_-]{40}$/.test(s)) return "apiToken";      /* 40 Zeichen */
  if (/@/.test(s)) return "email";
  return "unbekannt(" + s.length + " Zeichen)";
}

/* GitHub maskiert nur, was es als Secret kennt. Ein abgeleiteter Wert
   gehoert ausdruecklich angemeldet. */
function maskiere(wert) {
  if (wert && process.env.GITHUB_ACTIONS === "true") {
    console.log("::add-mask::" + wert);
  }
}

const bericht = {
  schemaVersion: "cloudflare-access-probe-1.0.0",
  auftrag: "Owner-Update 17.09.2026: vorhandene Secrets nutzen, keine neuen erzeugen",
  checkedAt: new Date().toISOString(),
  note: "Dieser Bericht enthaelt keine Werte. Nur Namen, Formen und Rechte.",
  secrets: [],
  accountId: { derivable: false, source: null, reason: null, form: null },
  verdict: null,
  missing: [],
  consequence: null
};

/* ---- 1. Welche Namen sind gesetzt? --------------------------------- */
let tokenName = null;
let tokenForm = null;
for (const k of KANDIDATEN) {
  const wert = process.env[k.name] || "";
  const gesetzt = wert.length > 0;
  bericht.secrets.push({ name: k.name, present: gesetzt, role: k.rolle,
                         form: gesetzt ? form(wert) : null });
  if (gesetzt && !tokenName && k.name !== "CLOUDFLARE_ACCOUNT_ID" && k.name !== "CLOUDFLARE_EMAIL") {
    tokenName = k.name;
    tokenForm = form(wert);
  }
}

/* ---- 2. Laesst sich die Account-ID ableiten? ------------------------ */
const endpunkt = process.env.VU_HISTORY_S3_ENDPOINT || "";
const direkt = process.env.CLOUDFLARE_ACCOUNT_ID || "";

if (direkt) {
  maskiere(direkt);
  bericht.accountId = { derivable: true, source: "CLOUDFLARE_ACCOUNT_ID", reason: null, form: form(direkt) };
} else if (endpunkt) {
  /* https://<32 Hex>.r2.cloudflarestorage.com, mit oder ohne
     Rechtsraum-Praefix (eu, fedramp). Alles andere - etwa eine eigene
     Domain vor dem Eimer - traegt die ID nicht, und dann wird sie auch
     nicht geraten. */
  const m = /^https:\/\/([0-9a-f]{32})\.(?:([a-z]+)\.)?r2\.cloudflarestorage\.com\/?$/i.exec(endpunkt.trim());
  if (m) {
    maskiere(m[1]);
    bericht.accountId = { derivable: true, source: "VU_HISTORY_S3_ENDPOINT",
                          jurisdiction: m[2] || null, reason: null, form: "accountIdOderHex32" };
    /* Fuer den naechsten Schritt im Workflow - als Ausgabe, nicht im Log. */
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(process.env.GITHUB_OUTPUT, "account_id=" + m[1] + "\n", { flag: "a" });
      writeFileSync(process.env.GITHUB_OUTPUT, "account_id_found=true\n", { flag: "a" });
    }
  } else {
    bericht.accountId = { derivable: false, source: "VU_HISTORY_S3_ENDPOINT",
                          reason: "endpointNotInAccountIdForm",
                          note: "Der Endpunkt hat nicht die Form https://<32 Hex>.r2.cloudflarestorage.com. " +
                                "Moeglich ist eine eigene Domain davor - dann traegt er die Account-ID nicht, " +
                                "und sie wird hier auch nicht geraten.", form: null };
  }
} else {
  bericht.accountId = { derivable: false, source: null, reason: "noEndpointAndNoAccountId", form: null };
}

/* ---- 3. Urteil ------------------------------------------------------ */
bericht.token = tokenName
  ? { foundAs: tokenName, form: tokenForm,
      usableDirectly: tokenName === "CLOUDFLARE_API_TOKEN",
      needsEmail: tokenForm === "globalApiKey",
      note: tokenName === "CLOUDFLARE_API_TOKEN"
        ? "wrangler liest diesen Namen von selbst."
        : "wrangler liest CLOUDFLARE_API_TOKEN. Dieses Secret muss im Workflow auf diesen Namen " +
          "gelegt werden - eine Zeile, kein neues Secret." }
  : { foundAs: null, form: null, usableDirectly: false, needsEmail: false,
      note: "Unter keinem der geprueften Namen liegt ein Cloudflare-Zugang." };

if (!tokenName) bericht.missing.push("ein Cloudflare-Zugang unter einem der geprueften Namen");
if (!bericht.accountId.derivable) bericht.missing.push("CLOUDFLARE_ACCOUNT_ID");
if (tokenForm === "globalApiKey" && !process.env.CLOUDFLARE_EMAIL) bericht.missing.push("CLOUDFLARE_EMAIL");

bericht.verdict = bericht.missing.length === 0 ? "READY_TO_CHECK_PERMISSIONS" : "INCOMPLETE";
bericht.consequence = bericht.missing.length === 0
  ? "Namen und Account-ID sind da. Ob die RECHTE des Tokens fuer Workers und Durable Objects reichen, " +
    "sagt der naechste Schritt (wrangler whoami) - der Name allein sagt es nicht."
  : "Es fehlt: " + bericht.missing.join(", ") + ".";

mkdirSync(OUT_DIR, { recursive: true });
const pfad = join(OUT_DIR, "cloudflare-access-probe.json");
writeFileSync(pfad, JSON.stringify(bericht, null, 2) + "\n");

console.log("Cloudflare-Zugang, was vorhanden ist (keine Werte):");
console.log("");
for (const s of bericht.secrets) {
  console.log("  " + (s.present ? "gesetzt " : "fehlt   ") + s.name.padEnd(24) +
              (s.form ? "[" + s.form + "] " : "") + s.role);
}
console.log("");
console.log("  Account-ID ableitbar: " + bericht.accountId.derivable +
            (bericht.accountId.source ? " (aus " + bericht.accountId.source + ")" : ""));
if (bericht.accountId.reason) console.log("    Grund: " + bericht.accountId.reason);
console.log("  Token gefunden als:   " + (bericht.token.foundAs || "—"));
console.log("");
console.log("URTEIL: " + bericht.verdict);
console.log(bericht.consequence);
console.log("Bericht: " + pfad.slice(root.length + 1));

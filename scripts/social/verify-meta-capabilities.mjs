/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-meta-capabilities.mjs

   DER LAUF, DER AUS EINER BEHAUPTUNG EINEN NACHWEIS MACHT

   social/providers/meta/adapter.js deklariert, was die Graph API kann.
   Diese Deklaration stammt aus der Dokumentation — sie ist eine
   begruendete Erwartung und KEIN Nachweis. Deshalb steht in ihr
   `verifiedAt: null`.

   Dieses Skript prueft die Deklaration gegen die echte API und traegt
   das Datum ein. Bis es einmal gelaufen ist, bleibt jede Zeile der
   Capability-Matrix ungeprueft — und die Matrix sagt das.

   -------------------------------------------------------------------------
   WARUM ES NICHT IN DER CI LAEUFT
   -------------------------------------------------------------------------

   Es braucht produktive Zugangsdaten. Eine CI, die ohne Meta-Zugang rot
   ist, prueft nicht unseren Code, sondern die Verfuegbarkeit von Meta
   (§43). Dieses Skript laeuft von Hand oder in einem eigenen,
   ausdruecklich angestossenen Workflow.

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es VEROEFFENTLICHT NICHTS. Es liest: Konto, Rechte, Faehigkeiten,
   Token-Ablauf. Der Publishing-Pfad laesst sich ohne einen echten
   Beitrag nicht pruefen — und ein echter Beitrag ist eine
   Owner-Entscheidung, kein Nebeneffekt eines Verifikationslaufs (§55).

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     export META_APP_ID=...          (Werte NIE in die Historie)
     export META_APP_SECRET=...
     export META_LONG_LIVED_TOKEN=...
     node scripts/social/verify-meta-capabilities.mjs

   Ohne Secrets endet der Lauf mit 0 und einem Statusbericht — dieselbe
   Eigenschaft wie scripts/market/fetch-market-data.mjs: ein fehlender
   Schluessel ist eine Konfigurationsfrage, kein Baufehler.
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { ausgabePfad } from "../quality/out-path.mjs";
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Meta = require(join(ROOT, "social/providers/meta/adapter.js"));
const Capabilities = require(join(ROOT, "social/engines/capabilities.js"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", null);

const appId = process.env[Meta.SECRET_NAMES.appId] || null;
const appSecret = process.env[Meta.SECRET_NAMES.appSecret] || null;
const token = process.env[Meta.SECRET_NAMES.accessToken] || null;

const provider = Meta.createMetaProvider({
  appId, appSecret, tokenProvider: () => token
});

const report = {
  generatedAt: new Date().toISOString(),
  provider: "meta",
  configured: Boolean(appId && appSecret && token),
  /* NUR die Namen. Niemals die Werte (§36). */
  secretNames: Meta.SECRET_NAMES,
  checks: [],
  capabilities: null,
  verdict: null
};

function record(name, result, note) {
  report.checks.push({ name, result, note: note || null });
  const mark = result === "PASS" ? "  ok  " : result === "SKIP" ? " skip " : " FAIL ";
  console.log("[" + mark + "] " + name + (note ? "  — " + note : ""));
}

async function main() {
  console.log("VISION UNIVERSE SOCIAL — Meta-Capability-Verifikation");
  console.log("Zeitpunkt:", report.generatedAt);
  console.log("");

  if (!report.configured) {
    const health = await provider.healthCheck();
    record("Konfiguration", "SKIP",
      "Es fehlen: " + health.missing.join(", ") + ". Das ist eine Owner-Handlung, kein Fehler.");
    report.verdict = "NOT_CONFIGURED";
    console.log("\nOhne Zugangsdaten laesst sich nichts verifizieren. Die Capability-Matrix " +
                "behaelt verifiedAt=null und sagt damit die Wahrheit ueber ihren Stand.");
    finish();
    return;
  }

  /* 1. Verbindung. */
  const health = await provider.healthCheck();
  if (health.status !== "ok") {
    record("Verbindung zur Graph API", "FAIL", health.message);
    report.verdict = "UNREACHABLE";
    finish();
    return;
  }
  record("Verbindung zur Graph API", "PASS");

  /* 2. Rechte. Sie entscheiden, was ueberhaupt moeglich ist. */
  const permissions = await provider.getPermissions();
  if (!permissions.available) {
    record("Rechteabfrage", "FAIL", permissions.message);
  } else {
    const granted = permissions.data.granted;
    const needed = ["instagram_basic", "instagram_content_publish",
                    "instagram_manage_insights", "pages_show_list"];
    const missing = needed.filter((p) => !granted.includes(p));
    record("Rechteabfrage", missing.length ? "FAIL" : "PASS",
      missing.length ? "Es fehlen: " + missing.join(", ") : granted.length + " Rechte erteilt");
    report.permissions = { granted, declined: permissions.data.declined, missing };
  }

  /* 3. Kontoaufloesung. */
  const accounts = await provider.getAccounts();
  if (!accounts.available) {
    record("Instagram-Professional-Konto", "FAIL", accounts.message);
  } else {
    record("Instagram-Professional-Konto", "PASS",
      accounts.data.length + " Konto/Konten: " +
      accounts.data.map((a) => a.username || a.externalId).join(", "));
    /* Die externalId ist oeffentlich und darf im Bericht stehen; sie ist
       kein Geheimnis, sondern eine Adresse. */
    report.accounts = accounts.data.map((a) => ({
      accountId: a.accountId, externalId: a.externalId,
      username: a.username, pageId: a.pageId, accountType: a.accountType
    }));
  }

  /* 4. Kennzahlen — lesend, ohne etwas zu erzeugen. */
  if (report.accounts && report.accounts.length) {
    const metrics = await provider.getAccountMetrics({ accountId: report.accounts[0].accountId });
    record("Kontokennzahlen", metrics.available ? "PASS" : "FAIL",
      metrics.available ? Object.keys(metrics.data.providerMetrics).join(", ") : metrics.message);
  } else {
    record("Kontokennzahlen", "SKIP", "Kein Konto aufgeloest.");
  }

  /* 5. Veroeffentlichung — ausdruecklich NICHT geprueft. */
  record("Veroeffentlichung", "SKIP",
    "Wird nicht geprueft. Eine Pruefung wuerde einen echten Beitrag erzeugen; das ist eine " +
    "Owner-Entscheidung und kein Nebeneffekt (§55).");

  report.capabilities = Capabilities.coverage(provider.capabilities);
  const failed = report.checks.filter((c) => c.result === "FAIL");
  report.verdict = failed.length === 0 ? "VERIFIED" : "INCOMPLETE";

  console.log("");
  if (failed.length === 0) {
    console.log("Ergebnis: VERIFIED. Die geprueften Faehigkeiten sind belegt.");
    console.log("NAECHSTER SCHRITT VON HAND: in social/providers/meta/adapter.js den Aufruf " +
                "metaCapabilities({ verifiedAt: \"" + report.generatedAt.slice(0, 10) + "\" }) setzen. " +
                "Das Datum wird bewusst nicht automatisch geschrieben — eine Verifikation, die " +
                "sich selbst bestaetigt, ist keine.");
  } else {
    console.log("Ergebnis: INCOMPLETE. " + failed.length + " Pruefung(en) fehlgeschlagen. " +
                "Die Capability-Matrix behaelt verifiedAt=null.");
  }
  finish();
}

function finish() {
  if (OUT_DIR) {
    const dir = ausgabePfad(ROOT, OUT_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "meta-verification.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("\nGeschrieben: " + OUT_DIR + "/meta-verification.json");
  }
}

main().catch((err) => {
  console.error("Verifikation abgebrochen:", String(err && err.message).slice(0, 300));
  process.exitCode = 1;
});

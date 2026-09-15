/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/preflight-worker.mjs

   PRUEFT VOR DEM DEPLOYMENT, WAS IM VORHANDENEN WORKER LIEGT

   Der Worker `vision-universe-social` wurde ausserhalb dieses Repositories
   angelegt. Ein `wrangler deploy` ersetzt den dort liegenden Code
   VOLLSTAENDIG und ohne Rueckfrage.

   Wenn dort bereits produktive Logik liegt, waere das ein Datenverlust,
   den niemand bemerkt — bis etwas nicht mehr funktioniert, das vorher
   funktioniert hat.

   Dieses Skript liest den aktuellen Stand ueber die Cloudflare-API und
   beantwortet drei Fragen:

     1. Existiert der Worker ueberhaupt?
     2. Was liegt dort (Groesse, Fingerabdruck, erste Zeilen)?
     3. Welche Bindungen und Secret-NAMEN sind gesetzt?

   Es aendert NICHTS. Es liest.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     export CLOUDFLARE_API_TOKEN=...      (Werte nie ins Repository)
     export CLOUDFLARE_ACCOUNT_ID=...
     node scripts/social/preflight-worker.mjs

   Ohne Zugangsdaten endet der Lauf mit 0 und einem Statusbericht —
   dieselbe Eigenschaft wie bei scripts/market/fetch-market-data.mjs: ein
   fehlender Zugang ist eine Konfigurationsfrage, kein Baufehler.

   Mit `--strict` endet er mit 1, wenn eine Pruefung offen bleibt. So
   laesst er sich vor einen Deploy-Schritt haengen.
   ========================================================================= */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* `--out` darf absolut sein. Ohne diese Zeile landet ein `/tmp/...` als
   `<repo>/tmp/...` im Arbeitsverzeichnis — also genau dort, wo ein
   Zwischenergebnis nicht hingehoert. */
function resolveOut(target) {
  return isAbsolute(target) ? target : join(ROOT, target);
}
const WORKER_NAME = "vision-universe-social";
const API = "https://api.cloudflare.com/client/v4";

const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", null);

const token = process.env.CLOUDFLARE_API_TOKEN || null;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || null;

const report = {
  generatedAt: new Date().toISOString(),
  worker: WORKER_NAME,
  credentialsPresent: Boolean(token && accountId),
  /* NUR Namen. Niemals Werte (§36). */
  expectedSecretNames: ["META_APP_ID", "META_APP_SECRET", "VU_SOCIAL_ADMIN_KEY", "META_WEBHOOK_SECRET"],
  checks: [],
  verdict: null
};

function record(name, result, note) {
  report.checks.push({ name, result, note: note || null });
  const mark = result === "PASS" ? "  ok  " : result === "SKIP" ? " skip " : result === "WARN" ? " warn " : " FAIL ";
  console.log(`[${mark}] ${name}${note ? "  — " + note : ""}`);
}

/* ------------------------------------------------------------------ */
/* Lokale Pruefungen — sie brauchen keinen Zugang                      */
/* ------------------------------------------------------------------ */

function checkLocalConfig() {
  const file = join(ROOT, "workers", WORKER_NAME, "wrangler.toml");
  if (!existsSync(file)) {
    record("wrangler.toml vorhanden", "FAIL", "Datei fehlt");
    return;
  }
  const source = readFileSync(file, "utf8");
  record("wrangler.toml vorhanden", "PASS");

  const placeholders = [];
  if (source.includes("REPLACE_WITH_KV_NAMESPACE_ID")) placeholders.push("KV-Namespace-ID");
  if (source.includes("REPLACE_WITH_WORKER_PUBLIC_URL")) placeholders.push("PUBLIC_BASE_URL");

  if (placeholders.length) {
    record("Konfiguration vollstaendig", "WARN",
      "Noch als Platzhalter: " + placeholders.join(", ") +
      ". Ein Deployment bricht damit ab — das ist Absicht.");
  } else {
    record("Konfiguration vollstaendig", "PASS");
  }

  /* Die wichtigste lokale Pruefung: keine Werte in der Konfiguration. */
  const suspicious = [
    /\bEA[A-Za-z0-9]{30,}/,
    /(META_APP_SECRET|VU_SOCIAL_ADMIN_KEY)\s*=\s*["'][^"']{8,}["']/
  ];
  const leak = suspicious.some((re) => re.test(source));
  record("Keine Secret-Werte in der Konfiguration", leak ? "FAIL" : "PASS",
    leak ? "In wrangler.toml steht etwas, das wie ein Wert aussieht." : null);

  if (!source.includes(`name = "${WORKER_NAME}"`)) {
    record("Zielname stimmt", "FAIL",
      `wrangler.toml zeigt nicht auf ${WORKER_NAME} — ein Deployment traefe den falschen Worker.`);
  } else {
    record("Zielname stimmt", "PASS", WORKER_NAME);
  }
}

/* ------------------------------------------------------------------ */
/* Cloudflare-API                                                      */
/* ------------------------------------------------------------------ */

async function api(path, init = {}) {
  const response = await fetch(API + path, Object.assign({
    headers: { authorization: `Bearer ${token}` }
  }, init));
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }
  return { status: response.status, ok: response.ok, body, text };
}

async function checkRemote() {
  const scriptPath = `/accounts/${accountId}/workers/scripts/${WORKER_NAME}`;

  const settings = await api(scriptPath + "/settings");
  if (settings.status === 404) {
    record("Worker existiert", "WARN",
      "Unter diesem Konto existiert kein Worker dieses Namens. Ein Deployment wuerde ihn NEU anlegen — " +
      "es kann also nichts ueberschrieben werden. Falls er existieren sollte: Konto-ID pruefen.");
    report.existing = { exists: false };
    return;
  }
  if (!settings.ok) {
    record("Worker existiert", "FAIL",
      `Cloudflare antwortet mit HTTP ${settings.status}. Token-Rechte pruefen ` +
      "(noetig: Account · Workers Scripts · Read).");
    return;
  }
  record("Worker existiert", "PASS");

  /* Bindungen und Secret-NAMEN. Cloudflare gibt fuer secret_text keine
     Werte zurueck — nur Namen und Typ. */
  const bindings = (settings.body && settings.body.result && settings.body.result.bindings) || [];
  const secretNames = bindings.filter((b) => b.type === "secret_text").map((b) => b.name);
  const kvBindings = bindings.filter((b) => b.type === "kv_namespace").map((b) => b.name);

  report.existing = {
    exists: true,
    bindingCount: bindings.length,
    secretNames,
    kvBindings,
    otherBindings: bindings
      .filter((b) => b.type !== "secret_text" && b.type !== "kv_namespace")
      .map((b) => ({ name: b.name, type: b.type }))
  };

  record("Hinterlegte Secrets (nur Namen)", secretNames.length ? "PASS" : "WARN",
    secretNames.length ? secretNames.join(", ") : "keine gefunden");

  for (const expected of ["META_APP_ID", "META_APP_SECRET"]) {
    record(`Secret ${expected} gesetzt`, secretNames.includes(expected) ? "PASS" : "FAIL",
      secretNames.includes(expected) ? null : "Fehlt — der OAuth-Flow kann ohne dieses Secret nicht laufen.");
  }
  record("Secret VU_SOCIAL_ADMIN_KEY gesetzt",
    secretNames.includes("VU_SOCIAL_ADMIN_KEY") ? "PASS" : "WARN",
    secretNames.includes("VU_SOCIAL_ADMIN_KEY")
      ? null
      : "Fehlt noch. Ohne ihn bleiben die Admin-Endpunkte geschlossen (503) — " +
        "der Worker laeuft, ist aber nicht bedienbar.");

  record("KV-Bindung VU_SOCIAL_KV vorhanden",
    kvBindings.includes("VU_SOCIAL_KV") ? "PASS" : "WARN",
    kvBindings.includes("VU_SOCIAL_KV")
      ? null
      : "Fehlt. Ohne KV kann die Verbindung nicht gespeichert werden.");

  /* DIE ENTSCHEIDENDE PRUEFUNG: was liegt dort an Code? */
  const current = await api(scriptPath, { headers: { authorization: `Bearer ${token}` } });
  if (current.ok && current.text) {
    const bytes = Buffer.byteLength(current.text, "utf8");
    const hash = createHash("sha256").update(current.text).digest("hex").slice(0, 16);
    report.existing.scriptBytes = bytes;
    report.existing.scriptSha256Prefix = hash;

    /* Erkennt der vorhandene Code sich selbst als unser Worker? */
    const looksLikeOurs = current.text.includes("vision-universe-social") &&
                          current.text.includes("/social/meta/callback");
    report.existing.looksLikeThisRepository = looksLikeOurs;

    if (bytes < 400) {
      record("Vorhandener Code", "PASS",
        `${bytes} Bytes (sha256 ${hash}) — das ist eine Platzhalter-Groesse. ` +
        "Ein Deployment ueberschreibt nichts von Wert.");
    } else if (looksLikeOurs) {
      record("Vorhandener Code", "PASS",
        `${bytes} Bytes (sha256 ${hash}) — stammt erkennbar aus diesem Repository. ` +
        "Ein Deployment ist eine Aktualisierung, kein Verlust.");
    } else {
      record("Vorhandener Code", "WARN",
        `${bytes} Bytes (sha256 ${hash}) — FREMDE Logik. Ein Deployment wuerde sie ` +
        "vollstaendig ersetzen. Vor dem Deploy sichern: " +
        `npx wrangler download ${WORKER_NAME}  (oder den Code aus dem Cloudflare-Dashboard kopieren).`);
    }
  } else {
    record("Vorhandener Code", "WARN",
      `Der Quelltext liess sich nicht lesen (HTTP ${current.status}). ` +
      "Vor dem Deploy im Cloudflare-Dashboard nachsehen, was dort liegt.");
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log("VISION UNIVERSE SOCIAL — Worker-Preflight");
  console.log("Ziel:", WORKER_NAME);
  console.log("");

  checkLocalConfig();

  if (!report.credentialsPresent) {
    record("Cloudflare-Zugang", "SKIP",
      "CLOUDFLARE_API_TOKEN und/oder CLOUDFLARE_ACCOUNT_ID fehlen. " +
      "Der vorhandene Worker konnte nicht geprueft werden.");
    console.log("\nOhne Zugang laesst sich nicht feststellen, was im Worker liegt. " +
      "\nVOR dem ersten Deployment aus diesem Repository muss dieser Lauf einmal mit Zugang " +
      "\nstattgefunden haben — sonst ist nicht auszuschliessen, dass produktive Logik " +
      "\nueberschrieben wird.");
  } else {
    try {
      await checkRemote();
    } catch (err) {
      record("Cloudflare-Zugang", "FAIL", String(err && err.message).slice(0, 160));
    }
  }

  const failed = report.checks.filter((c) => c.result === "FAIL");
  const warned = report.checks.filter((c) => c.result === "WARN" || c.result === "SKIP");
  report.verdict = failed.length ? "BLOCKED" : (warned.length ? "REVIEW" : "READY");

  console.log("");
  console.log("Ergebnis: " + report.verdict +
    (report.verdict === "READY" ? " — ein Deployment ist vorbereitet und ueberschreibt nichts Fremdes."
     : report.verdict === "REVIEW" ? " — offene Punkte oben pruefen, bevor deployt wird."
     : " — Deployment gesperrt."));

  if (OUT_DIR) {
    const dir = resolveOut(OUT_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "worker-preflight.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("Geschrieben: " + OUT_DIR + "/worker-preflight.json");
  }

  if (STRICT && report.verdict !== "READY") process.exitCode = 1;
}

main().catch((err) => {
  console.error("Preflight abgebrochen:", String(err && err.message).slice(0, 300));
  process.exitCode = 1;
});

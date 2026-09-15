/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/fetch-meta-status.mjs

   HOLT DEN VERBINDUNGSZUSTAND AUS DEM WORKER INS REPOSITORY

   -------------------------------------------------------------------------
   WARUM NICHT DIREKT AUS DEM BROWSER
   -------------------------------------------------------------------------

   Der Endpunkt /social/meta/status verlangt einen Admin-Schluessel. Wuerde
   das Command Center ihn direkt aufrufen, muesste der Schluessel im
   Browser liegen — und alles, was der Browser laedt, ist oeffentlich.

   Deshalb derselbe Weg wie ueberall sonst in diesem Repository: ein Lauf
   holt die Daten, schreibt ein Artefakt, und die Oberflaeche liest das
   Artefakt. Der Schluessel bleibt im GitHub-Actions-Secret.

   -------------------------------------------------------------------------
   WAS IM ARTEFAKT LANDET — UND WAS NICHT
   -------------------------------------------------------------------------

   Kein Token. Der Worker gibt keines heraus (social/data ist ausserdem
   committet und damit oeffentlich). Was ankommt, sind Kontokennung,
   Benutzername, erteilte Rechte, abgeleitete Faehigkeiten und der
   Gesundheitszustand.

   Zur Sicherheit prueft dieses Skript die Antwort NOCH EINMAL auf
   Tokenformen, bevor es sie schreibt. Ein Artefakt in der Git-Historie
   laesst sich nicht zurueckholen.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     export VU_SOCIAL_WORKER_URL=https://...
     export VU_SOCIAL_ADMIN_KEY=...
     node scripts/social/fetch-meta-status.mjs --out social/data

   Ohne Zugang endet der Lauf mit 0 und schreibt ein Artefakt, das den
   Zustand "nicht konfiguriert" ehrlich benennt (§45).
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* `--out` darf absolut sein. Ohne diese Zeile landet ein `/tmp/...` als
   `<repo>/tmp/...` im Arbeitsverzeichnis — also genau dort, wo ein
   Zwischenergebnis nicht hingehoert. */
function resolveOut(target) {
  return isAbsolute(target) ? target : join(ROOT, target);
}

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", null);
const WITH_VERIFY = argv.includes("--verify");

const workerUrl = (process.env.VU_SOCIAL_WORKER_URL || "").replace(/\/+$/, "");
const adminKey = process.env.VU_SOCIAL_ADMIN_KEY || null;

/* Dieselben Formen wie im Worker. Die Pruefung ist bewusst doppelt: der
   Worker schwaerzt, und dieses Skript schreibt nicht, was trotzdem
   durchkommt. */
const TOKEN_SHAPES = [
  /\bEA[A-Za-z0-9]{30,}/,
  /\bIG[A-Za-z0-9]{30,}/,
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/,
  /access_token=[^&\s"']{10,}/i
];

function containsTokenShape(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return TOKEN_SHAPES.some((re) => re.test(text));
}

async function call(path) {
  const response = await fetch(workerUrl + path, {
    headers: { authorization: `Bearer ${adminKey}` }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }
  return { status: response.status, ok: response.ok, body, text };
}

function artefact(extra) {
  return Object.assign({
    generatedAt: new Date().toISOString(),
    source: "worker:vision-universe-social",
    workerConfigured: Boolean(workerUrl && adminKey)
  }, extra);
}

async function main() {
  console.log("VISION UNIVERSE SOCIAL — Meta-Verbindungszustand");

  if (!workerUrl || !adminKey) {
    const missing = [];
    if (!workerUrl) missing.push("VU_SOCIAL_WORKER_URL");
    if (!adminKey) missing.push("VU_SOCIAL_ADMIN_KEY");
    console.log("Nicht konfiguriert. Es fehlen: " + missing.join(", "));
    console.log("Das ist eine Owner-Handlung, kein Fehler des Laufs.");
    return write(artefact({
      state: "not_configured",
      connected: false,
      missingConfiguration: missing,
      explanation: "Der Worker ist aus diesem Lauf nicht erreichbar, weil " + missing.join(" und ") +
        " fehlt. Ueber die Meta-Verbindung laesst sich damit nichts sagen — " +
        "weder dass sie besteht noch dass sie fehlt."
    }));
  }

  let status;
  try {
    status = await call("/social/meta/status");
  } catch (err) {
    console.log("Worker nicht erreichbar: " + String(err && err.message).slice(0, 160));
    return write(artefact({
      state: "unreachable", connected: false,
      explanation: "Der Worker antwortet nicht: " + String(err && err.message).slice(0, 160)
    }));
  }

  if (status.status === 401) {
    console.log("Der Admin-Schluessel wird abgelehnt.");
    return write(artefact({
      state: "unauthorized", connected: false,
      explanation: "Der Worker lehnt den Admin-Schluessel ab. VU_SOCIAL_ADMIN_KEY in den " +
        "GitHub-Secrets und im Worker muessen derselbe Wert sein."
    }));
  }
  if (!status.ok || !status.body) {
    console.log("Unerwartete Antwort: HTTP " + status.status);
    return write(artefact({
      state: "error", connected: false,
      explanation: "Der Worker antwortet mit HTTP " + status.status + "."
    }));
  }

  const connection = status.body.connection || {};
  console.log("Verbunden: " + (connection.connected ? "ja" : "nein"));
  if (connection.connected) {
    console.log("  Instagram: @" + (connection.instagramUsername || connection.instagramAccountId));
    console.log("  Rechte:    " + ((connection.permissions && connection.permissions.granted) || []).join(", "));
  }

  let verification = null;
  if (WITH_VERIFY && connection.connected) {
    const result = await call("/social/meta/verify");
    verification = result.body || { verdict: "ERROR", status: result.status };
    console.log("  Verifikation: " + (verification.verdict || "unbekannt"));
    for (const check of verification.checks || []) {
      console.log(`    [${check.result}] ${check.name}${check.note ? " — " + check.note : ""}`);
    }
  }

  return write(artefact({
    state: connection.connected ? (connection.state || "connected") : "not_connected",
    connected: Boolean(connection.connected),
    workerConfiguredFully: status.body.configured === true,
    missingConfiguration: status.body.missingConfiguration || [],
    apiVersion: status.body.apiVersion || null,
    connection,
    verification
  }));
}

function write(data) {
  /* DIE LETZTE SPERRE vor der Git-Historie. */
  if (containsTokenShape(data)) {
    console.error("\nABBRUCH: Die Antwort enthaelt etwas in Tokenform. Es wird NICHTS geschrieben.");
    console.error("Das ist kein Formatproblem — der Worker darf kein Token herausgeben. " +
                  "Vor dem naechsten Lauf pruefen, wo es herkommt.");
    process.exitCode = 1;
    return;
  }

  if (!OUT_DIR) {
    console.log("\n(Kein --out: es wurde nichts geschrieben.)");
    return;
  }
  const dir = resolveOut(OUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta-connection.json"), JSON.stringify(data, null, 2) + "\n");
  console.log("\nGeschrieben: " + OUT_DIR + "/meta-connection.json");
}

main().catch((err) => {
  console.error("Abgebrochen:", String(err && err.message).slice(0, 300));
  process.exitCode = 1;
});

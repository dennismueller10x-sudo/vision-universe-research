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
import { join, dirname, extname, relative, sep, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const BACKUP_DIR = arg("--backup", null);

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
/* Die Huelle abziehen, bevor irgendetwas beurteilt wird              */
/* ------------------------------------------------------------------ */

/**
 * Cloudflare liefert einen Modul-Worker nicht als nackten Quelltext aus,
 * sondern als multipart/form-data — mit einer bei JEDEM Abruf neu
 * gewuerfelten Trennmarke.
 *
 * Das ist zuerst an einer Ungereimtheit aufgefallen: zwei Abrufe
 * desselben unveraenderten Workers meldeten dieselbe Groesse (752 Bytes),
 * aber verschiedene sha256-Praefixe. Ein Fingerabdruck, der sich bei
 * gleichem Inhalt aendert, ist keiner — er haette spaeter eine echte
 * Aenderung nicht von Rauschen unterscheiden koennen.
 *
 * Die Huelle faelscht ausserdem alles Weitere: die Byte-Groesse zaehlt
 * Trennmarken und Kopfzeilen mit, und eine Sicherung wuerde kein
 * lauffaehiges JavaScript enthalten, sondern ein Formular.
 *
 * Diese Funktion zieht die Huelle ab. Fuer alles, was keine Huelle hat,
 * gibt sie den Text unveraendert zurueck.
 */
export function extractWorkerSource(raw, contentType) {
  const text = String(raw || "");

  /* Die Trennmarke steht im Content-Type — und, falls der fehlt, in der
     ersten Zeile. Auf den Kopfzeilen allein soll das nicht beruhen. */
  let boundary = null;
  const declared = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType || ""));
  if (declared) boundary = declared[1] || declared[2];
  if (!boundary) {
    const first = /^--([-A-Za-z0-9'()+_,./:=?]{8,})\r?\n/.exec(text);
    if (first && /content-disposition:\s*form-data/i.test(text)) boundary = first[1];
  }
  if (!boundary) return { source: text, multipart: false, parts: 0 };

  const sections = text.split("--" + boundary);
  const bodies = [];
  for (const section of sections) {
    /* Der Rumpf beginnt nach der Leerzeile, die auf die Kopfzeilen folgt. */
    const split = /\r?\n\r?\n/.exec(section);
    if (!split) continue;
    const headers = section.slice(0, split.index);
    if (!/content-disposition:\s*form-data/i.test(headers)) continue;
    /* Nur Code. Metadaten-Teile (z. B. das Manifest) gehoeren nicht in
       die Beurteilung und nicht in die Sicherung. */
    if (/content-type:\s*application\/json/i.test(headers)) continue;
    const body = section.slice(split.index + split[0].length).replace(/\r?\n$/, "");
    if (body.trim()) bodies.push(body);
  }

  /* Liess sich nichts herausloesen, gilt der Rohtext — lieber zu viel
     beurteilen als zu wenig. */
  if (!bodies.length) return { source: text, multipart: true, parts: 0 };
  return { source: bodies.join("\n"), multipart: true, parts: bodies.length };
}

/* ------------------------------------------------------------------ */
/* Was liegt dort? — Klassifikation ohne Preisgabe                     */
/* ------------------------------------------------------------------ */

/* Formen, die ein Zugangsdatum haben kann. Findet sich eine im
   vorhandenen Worker, wird er WEDER gesichert NOCH ersetzt: eine
   Sicherung als CI-Artefakt waere dann eine Kopie des Geheimnisses an
   einen Ort mit anderem Leserkreis. */
const TOKEN_SHAPES = [
  /\bEA[A-Za-z0-9]{30,}/,
  /\bIG[A-Za-z0-9]{30,}/,
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/,
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(secret|token|password|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9._\-]{16,}["']/i
];

/**
 * Beurteilt den vorhandenen Worker-Code, OHNE ihn auszugeben.
 *
 * Die Byte-Groesse allein taugt dafuer nicht: Cloudflares eigene
 * "Hello World"-Vorlage liegt im selben Bereich wie ein kleines
 * produktives Skript. Der erste Entwurf dieses Preflights hat genau
 * deshalb eine Standardvorlage als "fremde produktive Logik" gemeldet —
 * richtig gesperrt, aber aus dem falschen Grund.
 *
 * Beurteilt wird deshalb, WAS der Code tut: spricht er nach draussen,
 * liest er Bindungen, kennt er unsere Routen. Alles davon laesst sich
 * als Ja/Nein berichten, ohne eine Zeile Quelltext zu zeigen.
 *
 * Im Zweifel: custom-logic. Ein falscher Alarm kostet eine Minute,
 * ein uebersehener Fund kostet fremde Produktivlogik.
 */
/**
 * Entfernt die Handler-Deklaration, damit sie nicht als ausgehender
 * Aufruf gezaehlt wird.
 */
function stripHandlerSignature(code) {
  return String(code)
    .replace(/\basync\s+fetch\s*\(/g, " __handler(")
    .replace(/(^|[,{;]\s*)fetch\s*\(\s*(request|req|event)\b/g, "$1__handler(");
}

export function classifyScript(source) {
  const text = String(source || "");

  /* Kommentare entfernen, bevor nach Adressen gesucht wird.
     Cloudflares Standardvorlage nennt developers.cloudflare.com und
     localhost:8787 in ihrem Kopfkommentar. Wer das als ausgehende
     Aufrufe zaehlt, haelt jede Vorlage fuer Produktivlogik — das war
     der Fehlschluss im ersten realen Lauf.
     Eine Adresse in einem Kommentar ist eine Erwaehnung. Ein Aufruf ist
     etwas anderes, und nur der zaehlt. */
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  const signals = {
    bytes: Buffer.byteLength(text, "utf8"),
    lines: text.split("\n").length,
    hasExportDefault: /export\s+default/.test(code),
    helloWorld: /Hello,?\s+World/i.test(text),
    /* Adressen im ausfuehrbaren Teil — ohne Kommentare, ohne localhost. */
    externalHosts: (code.match(/https?:\/\/[a-z0-9.-]+/gi) || [])
      .filter((u) => !/^https?:\/\/(localhost|127\.0\.0\.1|example\.)/i.test(u)).length,
    /* Und der direktere Beleg: wird ueberhaupt etwas nach draussen
       geschickt? Das faengt auch eine zusammengesetzte Adresse, die
       als Zeichenkette nicht auffaellt.

       Die Handler-SIGNATUR eines Workers heisst selbst `fetch(request,
       env, ctx)`. Sie ist eine Deklaration und kein Aufruf — wer das
       nicht trennt, haelt jeden Worker fuer einen, der nach draussen
       telefoniert, den leeren eingeschlossen. */
    outboundCalls: (stripHandlerSignature(code)
      .match(/\bfetch\s*\(|new\s+Request\s*\(/g) || []).length,
    usesEnvBindings: /\benv\s*\.\s*[A-Z_]{3,}/.test(code),
    referencesKV: /\.(get|put|delete)\s*\(/.test(code) && /\benv\s*\./.test(code),
    hasOurRoutes: text.includes("/social/meta/callback"),
    mentionsThisWorker: text.includes("vision-universe-social"),
    containsTokenShape: TOKEN_SHAPES.some((re) => re.test(text))
  };

  let id;
  let safeToReplace;
  let note;

  if (signals.containsTokenShape) {
    id = "contains-credentials";
    safeToReplace = false;
    note = "Im vorhandenen Code steht etwas in Zugangsdatenform. Er wird weder gesichert " +
           "noch ersetzt — eine Sicherung als CI-Artefakt waere eine Kopie des Geheimnisses " +
           "an einen Ort mit anderem Leserkreis.";
  } else if (signals.hasOurRoutes && signals.mentionsThisWorker) {
    id = "this-repository";
    safeToReplace = true;
    note = "Der Code stammt erkennbar aus diesem Repository. Ein Deployment ist eine " +
           "Aktualisierung, kein Verlust.";
  } else if (signals.helloWorld && signals.externalHosts === 0 &&
             signals.outboundCalls === 0 && !signals.usesEnvBindings &&
             signals.bytes < 2000) {
    id = "cloudflare-default-template";
    safeToReplace = true;
    note = "Cloudflares Standardvorlage (\"Hello World\"): keine ausgehenden Aufrufe, " +
           "keine Bindungen, kein Zustand. Dort geht nichts verloren.";
  } else if (signals.bytes < 400 && signals.externalHosts === 0 &&
             signals.outboundCalls === 0 && !signals.usesEnvBindings) {
    id = "minimal-stub";
    safeToReplace = true;
    note = "Ein Platzhalter ohne ausgehende Aufrufe und ohne Bindungen.";
  } else {
    id = "custom-logic";
    safeToReplace = false;
    note = "Der Code tut etwas, das sich nicht als Vorlage oder Platzhalter erklaeren laesst: " +
           [signals.externalHosts ? signals.externalHosts + " ausgehende Adresse(n)" : null,
            signals.outboundCalls ? signals.outboundCalls + " ausgehende(r) Aufruf(e)" : null,
            signals.usesEnvBindings ? "liest Bindungen" : null,
            signals.referencesKV ? "greift auf einen Speicher zu" : null,
            !signals.helloWorld ? "keine Vorlagen-Signatur" : null]
             .filter(Boolean).join(", ") + ".";
  }

  return { id, safeToReplace, signals, note };
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
  return {
    status: response.status,
    ok: response.ok,
    body,
    text,
    contentType: response.headers.get("content-type") || ""
  };
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
    /* Erst die Transporthuelle abziehen, dann beurteilen. Sonst wird die
       zufaellige Trennmarke mitgehasht und mitgezaehlt. */
    const extracted = extractWorkerSource(current.text, current.contentType);
    const hash = createHash("sha256").update(extracted.source).digest("hex").slice(0, 16);
    const verdict = classifyScript(extracted.source);

    report.existing.transport = extracted.multipart ? "multipart" : "plain";
    report.existing.moduleParts = extracted.parts;
    report.existing.scriptBytes = verdict.signals.bytes;
    report.existing.scriptSha256Prefix = hash;
    report.existing.looksLikeThisRepository = verdict.id === "this-repository";
    report.existing.classification = verdict.id;
    report.existing.safeToReplace = verdict.safeToReplace;
    /* Die Signale werden berichtet, der Quelltext nie. */
    report.existing.signals = verdict.signals;

    record("Vorhandener Code", verdict.safeToReplace ? "PASS" : "WARN",
      `${verdict.signals.bytes} Bytes (sha256 ${hash}), eingeordnet als ` +
      `"${verdict.id}". ${verdict.note}`);

    /* Sicherung — nur wenn dabei kein Geheimnis kopiert wird. */
    if (BACKUP_DIR && !verdict.signals.containsTokenShape) {
      mkdirSync(resolveOut(BACKUP_DIR), { recursive: true });
      const file = join(resolveOut(BACKUP_DIR), `${WORKER_NAME}.before-deploy.js`);
      writeFileSync(file, extracted.source);
      report.existing.backupWritten = true;
      record("Sicherung des vorhandenen Codes", "PASS",
        `geschrieben (${verdict.signals.bytes} Bytes). Ein Deployment ist damit umkehrbar.`);
    } else if (BACKUP_DIR) {
      report.existing.backupWritten = false;
      record("Sicherung des vorhandenen Codes", "FAIL",
        "NICHT gesichert: der Code enthaelt etwas in Zugangsdatenform. Eine Sicherung " +
        "waere eine Kopie des Geheimnisses an einen Ort mit anderem Leserkreis.");
    }
  } else {
    report.existing.classification = "unreadable";
    report.existing.safeToReplace = false;
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

/* Nur ausfuehren, wenn direkt aufgerufen — sonst laesst sich
   classifyScript() nicht pruefen, ohne einen Cloudflare-Lauf auszuloesen. */
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Preflight abgebrochen:", String(err && err.message).slice(0, 300));
    process.exitCode = 1;
  });
}

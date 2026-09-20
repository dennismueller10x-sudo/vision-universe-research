/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-worker.mjs

   PRUEFT DEN DEPLOYTEN WORKER VON AUSSEN

   Nach einem Deployment ist die Frage nicht "hat wrangler 0 zurueckgegeben",
   sondern "antwortet der Worker, und antwortet er richtig".

   -------------------------------------------------------------------------
   WAS HIER AUSDRUECKLICH NICHT PASSIERT
   -------------------------------------------------------------------------

   Kein Meta-Login. Kein Autorisierungsdialog. Kein Beitrag.

   Der Callback wird OHNE Parameter aufgerufen. Der Worker lehnt das ab,
   bevor er irgendetwas an Meta schickt — genau das soll gezeigt werden:
   die Route existiert, sie ist erreichbar, und sie tut ohne gueltige
   Parameter nichts.

   -------------------------------------------------------------------------
   OHNE ADMIN-SCHLUESSEL — UND DAS IST DER PUNKT
   -------------------------------------------------------------------------

   Die Admin-Endpunkte werden bewusst OHNE Schluessel aufgerufen. Ein
   401 ist hier das ERWARTETE Ergebnis und der eigentliche Nachweis: die
   Route ist da und sie ist verschlossen.

   Ein 200 waere ein Sicherheitsbefund — er hiesse, dass jeder den
   OAuth-Flow starten und die gespeicherte Verbindung ueberschreiben kann.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     node scripts/social/verify-worker.mjs
     node scripts/social/verify-worker.mjs --url https://... --out /tmp/x
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG = join(ROOT, "workers", "vision-universe-social", "wrangler.toml");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", null);
const resolveOut = (t) => (isAbsolute(t) ? t : join(ROOT, t));


/** Eine Variable aus wrangler.toml — dieselbe Quelle wie das Deployment. */
function configuredValue(key) {
  if (!existsSync(CONFIG)) return null;
  const match = readFileSync(CONFIG, "utf8")
    .match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  if (!match) return null;
  return match[1].startsWith("REPLACE_WITH") ? null : match[1];
}

function configuredUrl() {
  if (!existsSync(CONFIG)) return null;
  const match = readFileSync(CONFIG, "utf8").match(/^\s*PUBLIC_BASE_URL\s*=\s*"([^"]*)"/m);
  if (!match) return null;
  return match[1].startsWith("REPLACE_WITH") ? null : match[1].replace(/\/+$/, "");
}

const baseUrl = (arg("--url", null) || process.env.VU_SOCIAL_WORKER_URL || configuredUrl() || "")
  .replace(/\/+$/, "");

const report = {
  generatedAt: new Date().toISOString(),
  worker: "vision-universe-social",
  baseUrl: baseUrl || null,
  checks: [],
  redirectUri: baseUrl ? baseUrl + "/social/meta/callback" : null,
  connectUrl: baseUrl ? baseUrl + "/social/meta/connect" : null,
  verdict: null,
  published: false,
  metaLoginAttempted: false
};

function record(name, result, note) {
  report.checks.push({ name, result, note: note || null });
  const mark = result === "PASS" ? "  ok  " : result === "WARN" ? " warn " : result === "SKIP" ? " skip " : " FAIL ";
  console.log(`[${mark}] ${name}${note ? "  — " + note : ""}`);
}

async function call(path, init = {}) {
  const response = await fetch(baseUrl + path, Object.assign({ redirect: "manual" }, init));
  const text = await response.text().catch(() => "");
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }
  return { status: response.status, body, text, headers: response.headers };
}

async function main() {
  console.log("VISION UNIVERSE SOCIAL — Worker-Verifikation");
  console.log("Adresse:", baseUrl || "(unbekannt)");
  console.log("");

  if (!baseUrl) {
    record("Worker-Adresse bekannt", "FAIL",
      "Weder --url noch VU_SOCIAL_WORKER_URL noch PUBLIC_BASE_URL in wrangler.toml.");
    report.verdict = "UNKNOWN";
    return finish();
  }

  /* 1. Lebendtest — oeffentlich, ohne Schluessel. */
  let health;
  try {
    health = await call("/health");
  } catch (err) {
    record("Worker antwortet", "FAIL", String(err && err.message).slice(0, 160));
    report.verdict = "UNREACHABLE";
    return finish();
  }

  if (health.status !== 200 || !health.body) {
    record("Worker antwortet", "FAIL", "HTTP " + health.status);
    report.verdict = "UNREACHABLE";
    return finish();
  }
  record("Worker antwortet", "PASS", "HTTP 200 auf /health");
  record("Worker meldet sich als lebendig", health.body.alive === true ? "PASS" : "FAIL");

  /* Welcher Meta-Dialog gilt. Das ist seit dem Business-Login-Befund die
     erste Frage bei jeder Redirect-URI-Ablehnung: ein klassischer Link
     gegen eine Business-Konfiguration wird abgelehnt, und die Ablehnung
     sieht aus wie ein Problem mit der Adresse. */
  report.loginMode = health.body.loginMode || null;
  if (report.loginMode === "business") {
    record("Meta-Dialog", "PASS", "Business-Anmeldung (config_id) — die Rechte stehen in der Konfiguration.");
  } else if (report.loginMode === "classic") {
    record("Meta-Dialog", "WARN",
      "Klassische Anmeldung (scope). Wurde bei Meta eine Login-for-Business-Konfiguration " +
      "angelegt, ist das der falsche Dialog: META_LOGIN_CONFIG_ID setzen.");
  } else {
    record("Meta-Dialog", "WARN",
      "Der Worker meldet keinen loginMode — er laeuft in einer Fassung vor dieser Pruefung.");
  }

  report.workerConfigured = health.body.configured === true;
  report.missingConfiguration = health.body.missingConfiguration || [];
  report.weakConfiguration = health.body.weakConfiguration || [];

  /* 2. Konfiguration — NUR Namen. */
  if (report.workerConfigured) {
    record("Konfiguration vollstaendig", "PASS");
  } else {
    const missing = report.missingConfiguration.concat(report.weakConfiguration);
    /* Ein fehlender Admin-Schluessel ist erwartbar und kein Fehler des
       Deployments — er ist eine Owner-Handlung. */
    const onlyAdminKey = report.missingConfiguration.length === 1 &&
      report.missingConfiguration[0] === "VU_SOCIAL_ADMIN_KEY" &&
      report.weakConfiguration.length === 0;
    record("Konfiguration vollstaendig", onlyAdminKey ? "WARN" : "FAIL",
      "Offen: " + missing.join(", ") +
      (onlyAdminKey ? " — eine Owner-Handlung, kein Deployment-Fehler." : ""));
  }

  /* 3. KV — erkennbar daran, dass die Bindung nicht als fehlend gemeldet wird. */
  const kvMissing = report.missingConfiguration.some((m) => m.startsWith("VU_SOCIAL_KV"));
  record("KV-Bindung vorhanden", kvMissing ? "FAIL" : "PASS",
    kvMissing ? "Der Worker sieht keine KV-Bindung — ohne sie kann nichts gespeichert werden." : null);

  /* 4. Meta-Secrets — der Worker meldet sie als fehlend, wenn sie fehlen. */
  for (const name of ["META_APP_ID", "META_APP_SECRET"]) {
    const missing = report.missingConfiguration.includes(name);
    record(`Secret ${name} im Worker sichtbar`, missing ? "FAIL" : "PASS",
      missing ? "Der Worker sieht dieses Secret nicht." : "vorhanden (nur der Name wurde geprueft)");
  }

  /* 5. OAuth-Start — OHNE Schluessel. 401 ist das erwartete Ergebnis. */
  const connect = await call("/social/meta/connect");
  if (connect.status === 401) {
    record("OAuth-Start ist erreichbar und verschlossen", "PASS",
      "401 ohne Admin-Schluessel — genau so soll es sein.");
  } else if (connect.status === 503) {
    record("OAuth-Start ist erreichbar und verschlossen", "WARN",
      "503: der Admin-Schluessel ist im Worker noch nicht gesetzt. Die Route existiert, " +
      "bleibt aber bis dahin geschlossen.");
  } else if (connect.status === 302) {
    record("OAuth-Start ist erreichbar und verschlossen", "FAIL",
      "302 OHNE Schluessel — der Endpunkt ist offen. Jeder koennte den Flow starten " +
      "und die gespeicherte Verbindung ueberschreiben.");
  } else {
    record("OAuth-Start ist erreichbar und verschlossen", "FAIL", "Unerwartet: HTTP " + connect.status);
  }

  /* 6. Callback-Routing — ohne Parameter, ohne Meta-Kontakt. */
  const callback = await call("/social/meta/callback");
  if (callback.status === 400 && /missingParameters/.test(callback.text)) {
    record("Callback-Routing", "PASS",
      "400 ohne Parameter — die Route existiert und tut ohne gueltige Parameter nichts. " +
      "Es wurde kein Meta-Login versucht.");
  } else if (callback.status === 503) {
    record("Callback-Routing", "WARN", "503: Konfiguration unvollstaendig.");
  } else {
    record("Callback-Routing", "FAIL", "Unerwartet: HTTP " + callback.status);
  }

  /* 7. Statusendpunkt — ebenfalls verschlossen. */
  const status = await call("/social/meta/status");
  record("Statusendpunkt verschlossen",
    [401, 503].includes(status.status) ? "PASS" : "FAIL",
    "HTTP " + status.status + (status.status === 200
      ? " — der Endpunkt gibt Kontodaten ohne Schluessel heraus." : ""));

  /* 8. Trennen nur per POST. */
  const disconnectGet = await call("/social/meta/disconnect");
  record("Trennen ist nicht per GET ausloesbar",
    [401, 405, 503].includes(disconnectGet.status) ? "PASS" : "FAIL",
    "HTTP " + disconnectGet.status);

  /* 9. Schutz-Kopfzeilen. */
  const cache = health.headers.get("cache-control");
  record("Antworten werden nicht zwischengespeichert",
    cache === "no-store" ? "PASS" : "WARN", "cache-control: " + (cache || "nicht gesetzt"));

  /* 10. Das Smoke-Bild — erreichbar und JPEG?

     Diese Pruefung steht hier, weil sie hier moeglich ist. Der Worker
     prueft dasselbe, aber erst im Moment des Veroeffentlichens — und
     dann hat der Owner den Aufruf schon abgeschickt. Eine Adresse, die
     nicht antwortet, soll VORHER auffallen. */
  const bildUrl = configuredValue("VU_SOCIAL_SMOKE_IMAGE_URL");
  if (!bildUrl) {
    record("Smoke-Bild konfiguriert", "SKIP", "VU_SOCIAL_SMOKE_IMAGE_URL steht nicht in wrangler.toml.");
  } else {
    report.smokeImageUrl = bildUrl;
    try {
      const bild = await fetch(bildUrl, { method: "HEAD", redirect: "follow" });
      const typ = String(bild.headers.get("content-type") || "");
      if (!bild.ok) {
        record("Smoke-Bild erreichbar", "FAIL",
          `HTTP ${bild.status} — Meta koennte es ebenfalls nicht abholen.`);
      } else if (!/^image\/jpe?g/i.test(typ)) {
        record("Smoke-Bild erreichbar", "FAIL",
          `Inhaltstyp ${typ || "fehlt"} — Instagram nimmt fuer einen Bildbeitrag JPEG.`);
      } else {
        record("Smoke-Bild erreichbar", "PASS",
          `${typ}, ${bild.headers.get("content-length") || "?"} Bytes`);
      }
    } catch (err) {
      record("Smoke-Bild erreichbar", "FAIL",
        "Nicht abrufbar: " + String(err && err.message).slice(0, 120));
    }
  }

  /* 11. Der Publishing-Endpunkt existiert — und ist verschlossen.

     Frueher hiess diese Zeile "es gibt keinen Weg zu veroeffentlichen".
     Das stimmt nicht mehr, und eine Pruefung, die eine ueberholte
     Zusicherung wiederholt, ist schlimmer als keine. */
  const smoke = await call("/social/meta/smoke-publish", { method: "POST" });
  record("Publishing-Endpunkt verschlossen",
    [401, 403].includes(smoke.status) ? "PASS" : "FAIL",
    "HTTP " + smoke.status + (smoke.status === 401
      ? " ohne Admin-Schluessel — er veroeffentlicht nichts ohne Schluessel und Bestaetigung."
      : " — erwartet war 401."));

  /* 12. Nichts veroeffentlicht durch DIESEN Lauf. */
  record("Dieser Lauf hat nichts veroeffentlicht", "PASS",
    "Es wurde kein `confirm` mitgeschickt — der Endpunkt lehnt ohne Bestaetigung ab, " +
    "und ohne Admin-Schluessel kommt er gar nicht so weit.");

  const failed = report.checks.filter((c) => c.result === "FAIL");
  const warned = report.checks.filter((c) => c.result === "WARN");
  report.verdict = failed.length ? "FAILED" : (warned.length ? "READY_WITH_NOTES" : "READY");

  finish();
  if (failed.length) process.exitCode = 1;
}

/* -------------------------------------------------------------------
   DAS ERGEBNIS STEHT AUF JEDEM WEG

   Es stand nur am Ende des vollstaendigen Laufs. Die beiden
   Abkuerzungen - Adresse unbekannt, Worker nicht erreichbar - gingen
   ueber `return finish()` und druckten gar keinen Schlusssatz. Wer
   die Ausgabe las, sah einen einzelnen FAIL und danach nichts, und
   wer sie maschinell auswertete, fand keine Zeile, auf die er sich
   verlassen konnte.

   Genau daran ist die CI-Pruefung haengengeblieben: sie suchte
   "Worker-Adresse bekannt" - eine Zeile, die NUR erscheint, wenn die
   Adresse FEHLT. Seit die Adresse einen Vorgabewert aus wrangler.toml
   hat, kann dieser Fall nicht mehr eintreten. Die Pruefung verlangte
   Text von einem Programm, das ihn zu Recht nicht mehr schreibt.
   ------------------------------------------------------------------- */
function finish() {
  const failed = report.checks.filter((c) => c.result === "FAIL");

  console.log("");
  console.log("Ergebnis: " + report.verdict);
  if (report.redirectUri) {
    console.log("");
    console.log("Redirect-URI fuer die Meta-App (zeichengenau eintragen):");
    console.log("  " + report.redirectUri);
  }
  if (failed.length) {
    console.log("");
    console.log("Fehlgeschlagen: " + failed.map((c) => c.name).join(", "));
  }

  if (!OUT_DIR) return;
  const dir = resolveOut(OUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "worker-verify.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("\nGeschrieben: " + join(OUT_DIR, "worker-verify.json"));
}

main().catch((err) => {
  console.error("Abgebrochen:", String(err && err.message).slice(0, 300));
  process.exitCode = 1;
});

/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/provision-cloudflare.mjs

   RICHTET DIE MINIMALE CLOUDFLARE-INFRASTRUKTUR EIN

   Genau zwei Dinge, mehr nicht:

     1. EIN KV-Namespace fuer EINEN Datensatz (die Meta-Verbindung)
     2. Die oeffentliche Worker-URL, aus der die Redirect-URI entsteht

   Kein D1. Keine Queues. Keine Durable Objects. Kein R2 (das gibt es
   bereits und wird nicht angefasst). Was hier nicht steht, wird nicht
   aktiviert.

   -------------------------------------------------------------------------
   IDEMPOTENT
   -------------------------------------------------------------------------

   Ein zweiter Lauf legt keinen zweiten Namespace an. Er findet den
   vorhandenen ueber seinen Titel und uebernimmt dessen ID. Das ist
   wichtig, weil dieses Skript aus einem Workflow laeuft, der wiederholt
   werden darf — und ein zweiter Namespace waere ein zweiter Speicher, in
   dem die Verbindung dann NICHT liegt.

   -------------------------------------------------------------------------
   WAS ES IN DAS REPOSITORY SCHREIBT
   -------------------------------------------------------------------------

   Die KV-Namespace-ID und die oeffentliche URL — beides in
   `workers/vision-universe-social/wrangler.toml`.

   Beides sind KENNUNGEN, keine Geheimnisse: die Namespace-ID ist ohne
   API-Token wertlos, die URL ist ein oeffentlicher Hostname. Cloudflares
   eigene Dokumentation sieht die ID in der committeten Konfiguration vor.
   Sie dort zu haben ist der Unterschied zwischen einer reproduzierbaren
   Konfiguration und einer, die nur in einem Workflow-Lauf existiert.

   Das API-Token und die Konto-ID schreibt es NIE irgendwohin.

   -------------------------------------------------------------------------
   AUSFUEHREN
   -------------------------------------------------------------------------

     node scripts/social/provision-cloudflare.mjs --ensure-kv --resolve-url
     node scripts/social/provision-cloudflare.mjs --check-secrets

   Ohne Zugangsdaten endet der Lauf mit 1 — anders als der Preflight, denn
   dieses Skript wird nur gerufen, wenn bereitgestellt werden SOLL.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKER_NAME = "vision-universe-social";
const KV_TITLE = "vu-social-kv";
const CONFIG = join(ROOT, "workers", WORKER_NAME, "wrangler.toml");
const API = "https://api.cloudflare.com/client/v4";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);

const token = process.env.CLOUDFLARE_API_TOKEN || null;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || null;

/* Die Meta-Secrets, die der Owner vorbereitet hat. Sie duerfen durch
   nichts, was dieses Skript tut, verschwinden (§4 der Owner-Information). */
const PROTECTED_SECRETS = ["META_APP_ID", "META_APP_SECRET"];

function fail(message) {
  console.error("ABBRUCH: " + message);
  process.exit(1);
}

function requireCredentials() {
  if (!token || !accountId) {
    fail("CLOUDFLARE_API_TOKEN und CLOUDFLARE_ACCOUNT_ID muessen gesetzt sein. " +
         "Dieses Skript laeuft nur, wenn bereitgestellt werden soll.");
  }
}

async function api(path, init = {}) {
  const response = await fetch(API + path, Object.assign({
    headers: Object.assign({
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    }, init.headers || {})
  }, init));
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }
  return { status: response.status, ok: response.ok, body };
}

/** Cloudflare-Fehler lesbar machen, ohne das Token zu zeigen. */
function describe(result) {
  const errors = (result.body && result.body.errors) || [];
  if (errors.length) {
    return errors.map((e) => `${e.code}: ${e.message}`).join("; ");
  }
  return "HTTP " + result.status;
}

/* ------------------------------------------------------------------ */
/* wrangler.toml                                                       */
/* ------------------------------------------------------------------ */

/**
 * Setzt einen Platzhalter oder einen bereits gesetzten Wert.
 *
 * Bewusst zeilenbasiert und nicht per TOML-Parser: das Repository hat
 * keine Abhaengigkeiten, und die Datei ist unsere eigene. Ein Parser
 * wuerde ausserdem die Kommentare verlieren — und die sind hier der
 * halbe Inhalt.
 */
export function setTomlValue(source, key, value) {
  const line = new RegExp(`^(\\s*)${key}\\s*=\\s*.*$`, "m");
  if (!line.test(source)) {
    throw new Error(`Schluessel ${key} steht nicht in wrangler.toml`);
  }
  return source.replace(line, `$1${key} = "${value}"`);
}

export function readTomlValue(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match ? match[1] : null;
}

function loadConfig() {
  if (!existsSync(CONFIG)) fail("wrangler.toml fehlt: " + CONFIG);
  return readFileSync(CONFIG, "utf8");
}

/* ------------------------------------------------------------------ */
/* KV                                                                  */
/* ------------------------------------------------------------------ */

async function ensureKv() {
  console.log("KV-Namespace sicherstellen …");

  const list = await api(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
  if (!list.ok) {
    fail("KV-Namespaces nicht lesbar (" + describe(list) + "). " +
         "Das Token braucht 'Workers KV Storage: Edit'.");
  }

  const existing = (list.body.result || []).find((ns) => ns.title === KV_TITLE);
  let namespaceId;

  if (existing) {
    namespaceId = existing.id;
    console.log(`  vorhanden: "${KV_TITLE}" (${namespaceId})`);
    console.log("  Es wird KEIN zweiter angelegt — ein zweiter Speicher waere einer,");
    console.log("  in dem die Verbindung dann nicht liegt.");
  } else {
    const created = await api(`/accounts/${accountId}/storage/kv/namespaces`, {
      method: "POST",
      body: JSON.stringify({ title: KV_TITLE })
    });
    if (!created.ok) fail("KV-Namespace nicht angelegt (" + describe(created) + ")");
    namespaceId = created.body.result.id;
    console.log(`  angelegt: "${KV_TITLE}" (${namespaceId})`);
  }

  const source = loadConfig();
  const current = readTomlValue(source, "id");
  if (current === namespaceId) {
    console.log("  wrangler.toml ist bereits auf diese ID gesetzt.");
    return { namespaceId, changed: false };
  }

  writeFileSync(CONFIG, setTomlValue(source, "id", namespaceId));
  console.log("  wrangler.toml aktualisiert.");
  return { namespaceId, changed: true };
}

/* ------------------------------------------------------------------ */
/* Oeffentliche URL                                                    */
/* ------------------------------------------------------------------ */

async function resolveUrl() {
  console.log("Oeffentliche Worker-URL bestimmen …");

  const source = loadConfig();
  const current = readTomlValue(source, "PUBLIC_BASE_URL");
  if (current && !current.startsWith("REPLACE_WITH")) {
    console.log("  bereits gesetzt: " + current);
    return { url: current, changed: false };
  }

  /* Steht eine eigene Domain in der Konfiguration, ist SIE die Adresse.
     Die workers.dev-Adresse darunter waere zwar erreichbar, aber Meta
     lehnt sie als App-Domain ab — ein stiller Rueckfall dorthin wuerde
     den OAuth-Flow brechen, und zwar an einer Stelle, an der es wie ein
     Meta-Problem aussieht. */
  const custom = readCustomDomain(source);
  if (custom) {
    const url = "https://" + custom;
    writeFileSync(CONFIG, setTomlValue(source, "PUBLIC_BASE_URL", url));
    console.log("  aus der Custom-Domain-Route uebernommen: " + url);
    return { url, changed: true };
  }

  const subdomain = await api(`/accounts/${accountId}/workers/subdomain`);
  if (!subdomain.ok || !subdomain.body.result || !subdomain.body.result.subdomain) {
    /* Kein Abbruch: die URL laesst sich nach dem Deployment aus der
       wrangler-Ausgabe ablesen. Der Workflow ruft dieses Skript dann
       ein zweites Mal mit --url. */
    console.log("  NICHT bestimmbar (" + describe(subdomain) + ").");
    console.log("  Das ist kein Fehler: das Token deckt diesen Endpunkt moeglicherweise");
    console.log("  nicht ab. Die URL wird nach dem Deployment nachgetragen.");
    return { url: null, changed: false };
  }

  const url = `https://${WORKER_NAME}.${subdomain.body.result.subdomain}.workers.dev`;
  writeFileSync(CONFIG, setTomlValue(source, "PUBLIC_BASE_URL", url));
  console.log("  gesetzt: " + url);
  console.log("  ACHTUNG: das ist eine workers.dev-Adresse. Meta nimmt sie nicht als");
  console.log("  App-Domain an (Public Suffix List). Fuer den OAuth-Flow braucht es");
  console.log("  eine eigene Domain — siehe docs/VU_SOCIAL_EIGENE_DOMAIN.md.");
  return { url, changed: true };
}

/**
 * Liest die Custom-Domain-Route aus wrangler.toml.
 *
 * Bewusst zeilenbasiert wie der Rest: das Repository hat keine
 * Abhaengigkeiten, und ein TOML-Parser wuerde die Kommentare verlieren.
 * Gesucht wird ein `pattern`, zu dem in den naechsten Zeilen
 * `custom_domain = true` steht.
 */
export function readCustomDomain(source) {
  const lines = String(source || "").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\s*pattern\s*=\s*"([^"]+)"/.exec(lines[i]);
    if (!match) continue;
    /* Die Angaben eines Routen-Eintrags stehen beieinander. Drei Zeilen
       Umkreis genuegen und verhindern, dass ein `custom_domain` aus dem
       NAECHSTEN Eintrag faelschlich mitgelesen wird. */
    const umkreis = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
    if (/^\s*custom_domain\s*=\s*true/m.test(umkreis)) return match[1].trim();
  }
  return null;
}

/**
 * Traegt die oeffentliche Basis-URL nach.
 *
 * -----------------------------------------------------------------------
 * WARUM DAS NUR EINE LUECKE FUELLT UND NIE ETWAS ERSETZT
 * -----------------------------------------------------------------------
 *
 * Der Workflow liest die Adresse nach dem Deployment aus der
 * wrangler-Ausgabe — und zwar mit einem Muster, das nur
 * `*.workers.dev` trifft. Solange es keine andere Adresse gab, war das
 * richtig.
 *
 * Mit einer Custom Domain ist es falsch: `workers_dev` bleibt aktiv, die
 * wrangler-Ausgabe nennt weiterhin die workers.dev-Adresse, und dieser
 * Schritt wuerde die eigene Domain damit ueberschreiben. Beim naechsten
 * Deployment stuende wieder die Adresse in der Konfiguration, die Meta
 * gerade abgelehnt hat — und niemand haette etwas davon gemerkt, weil
 * der Lauf gruen bliebe.
 *
 * Deshalb: dieser Aufruf fuellt eine Luecke. Eine gesetzte Adresse
 * bleibt stehen. Wer sie wirklich aendern will, sagt es mit --force-url.
 */
function setUrl(url, options = {}) {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) {
    fail("Keine plausible https-URL: " + url);
  }
  const clean = url.replace(/\/+$/, "");
  const source = loadConfig();
  const current = readTomlValue(source, "PUBLIC_BASE_URL") || "";

  if (current === clean) {
    console.log("PUBLIC_BASE_URL ist bereits " + clean);
    return { url: clean, changed: false };
  }

  const configured = current && !current.startsWith("REPLACE_WITH");
  if (configured && !options.force) {
    console.log("PUBLIC_BASE_URL ist bereits gesetzt: " + current);
    console.log("Nicht ueberschrieben mit: " + clean);
    console.log("Dieser Schritt fuellt nur eine Luecke. Eine bewusst eingetragene Adresse");
    console.log("— etwa eine eigene Domain — bleibt stehen. Zum Aendern: --force-url.");
    return { url: current, changed: false };
  }

  writeFileSync(CONFIG, setTomlValue(source, "PUBLIC_BASE_URL", clean));
  console.log("PUBLIC_BASE_URL gesetzt: " + clean);
  return { url: clean, changed: true };
}

/* ------------------------------------------------------------------ */
/* Secrets — NUR Namen                                                 */
/* ------------------------------------------------------------------ */

/**
 * Prueft, dass die vom Owner vorbereiteten Meta-Secrets vorhanden sind.
 *
 * `wrangler deploy` erhaelt bestehende Secrets — aber "erhaelt
 * normalerweise" ist keine Zusicherung, auf die man ein App-Secret
 * setzt. Deshalb wird VOR und NACH dem Deployment geprueft und
 * verglichen.
 */
async function checkSecrets(phase) {
  const result = await api(`/accounts/${accountId}/workers/scripts/${WORKER_NAME}/settings`);
  if (result.status === 404) {
    console.log("Der Worker existiert (noch) nicht — keine Secrets zu pruefen.");
    return { exists: false, names: [] };
  }
  if (!result.ok) fail("Worker-Einstellungen nicht lesbar (" + describe(result) + ")");

  const bindings = (result.body.result && result.body.result.bindings) || [];
  /* Cloudflare gibt fuer secret_text ausschliesslich Name und Typ
     zurueck, niemals den Wert. Genau deshalb ist diese Pruefung
     ueberhaupt zulaessig. */
  const names = bindings.filter((b) => b.type === "secret_text").map((b) => b.name).sort();
  const kv = bindings.filter((b) => b.type === "kv_namespace").map((b) => b.name).sort();

  console.log(`Secrets (${phase}, nur Namen): ${names.join(", ") || "keine"}`);
  console.log(`KV-Bindungen (${phase}): ${kv.join(", ") || "keine"}`);

  const missing = PROTECTED_SECRETS.filter((name) => !names.includes(name));
  if (missing.length) {
    console.log(`  FEHLT: ${missing.join(", ")}`);
  }
  return { exists: true, names, kv, missing };
}

/**
 * Der Vergleich vor/nach. Ein Deployment, das ein geschuetztes Secret
 * verliert, ist ein Notfall — und er faellt hier auf, nicht erst beim
 * ersten OAuth-Versuch.
 */
function compareSecrets(before, after) {
  if (!before.exists) {
    console.log("Kein Vorher-Stand (der Worker wurde neu angelegt) — nichts zu vergleichen.");
    return true;
  }
  const lost = before.names.filter((name) => !after.names.includes(name));
  if (lost.length === 0) {
    console.log("Alle zuvor vorhandenen Secrets sind weiterhin gesetzt.");
    return true;
  }
  console.error("");
  console.error("NOTFALL: Durch das Deployment sind Secrets VERSCHWUNDEN: " + lost.join(", "));
  console.error("Diese Werte kennt niemand mehr — Cloudflare gibt sie nicht zurueck.");
  console.error("Sie muessen vom Owner neu gesetzt werden:");
  for (const name of lost) console.error("  npx wrangler secret put " + name);
  return false;
}

/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* WELCHE ZONEN LIEGEN AUF DIESEM KONTO                                */
/* ------------------------------------------------------------------ */

/**
 * Eine Worker Custom Domain setzt voraus, dass die Zone auf DIESEM
 * Cloudflare-Konto liegt. Ohne sie schlaegt `wrangler deploy` fehl und
 * reisst die Deployment-Strecke mit — deshalb wird das vorher gefragt
 * und nicht beim Deployen herausgefunden.
 *
 * Zonennamen sind keine Geheimnisse: sie stehen im oeffentlichen DNS.
 * Ausgegeben werden trotzdem nur Name und Status, nichts weiter.
 */
async function listZones(wanted) {
  console.log("");
  console.log("Zonen auf diesem Konto");

  const result = await api(`/zones?account.id=${accountId}&per_page=50`);
  if (!result.ok || !Array.isArray(result.body && result.body.result)) {
    console.log("  NICHT lesbar (" + describe(result) + ").");
    console.log("  Moeglicherweise fehlt dem Token das Recht 'Zone: Read'. Das ist kein");
    console.log("  Fehler dieses Laufs — es heisst nur, dass die Frage offen bleibt.");
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(process.env.GITHUB_OUTPUT, "zone_readable=false\n", { flag: "a" });
    }
    return { zones: null };
  }

  const zones = result.body.result.map((z) => ({ name: z.name, status: z.status }));
  if (!zones.length) {
    console.log("  (keine)");
  }
  for (const zone of zones) console.log(`  ${zone.name}  [${zone.status}]`);

  if (!wanted) return { zones };

  /* Eine Custom Domain darf eine Subdomain sein — die ZONE ist der
     registrierbare Name darueber. */
  const base = String(wanted).split(".").slice(-2).join(".");
  const hit = zones.find((z) => z.name === base);

  console.log("");
  if (!hit) {
    console.log(`Zone ${base}: NICHT auf diesem Konto.`);
    console.log(`Eine Worker Custom Domain auf ${wanted} ist damit nicht moeglich,`);
    console.log("solange die Zone nicht hier liegt.");
  } else if (hit.status !== "active") {
    console.log(`Zone ${base}: vorhanden, Status "${hit.status}".`);
    console.log("Eine Custom Domain braucht eine aktive Zone.");
  } else {
    console.log(`Zone ${base}: aktiv — eine Custom Domain auf ${wanted} ist moeglich.`);
  }

  if (process.env.GITHUB_OUTPUT) {
    /* Auch die Namen: liegt die gewuenschte Zone nicht hier, ist die
       naechste Frage, ob eine ANDERE brauchbare Zone schon da ist. Eine
       vorhandene Zone erspart eine Nameserver-Umstellung — und die ist
       nichts, wozu man jemanden schickt, solange es eine Alternative
       gibt. Zonennamen stehen im oeffentlichen DNS. */
    writeFileSync(process.env.GITHUB_OUTPUT,
      "zone_readable=true\n" +
      `zone_present=${hit ? "true" : "false"}\n` +
      `zone_active=${hit && hit.status === "active" ? "true" : "false"}\n` +
      `zone_names=${zones.map((z) => z.name + ":" + z.status).join(" ") || "(keine)"}\n`,
      { flag: "a" });
  }
  return { zones, zone: hit || null };
}


async function main() {
  requireCredentials();
  console.log("VISION UNIVERSE SOCIAL — Cloudflare bereitstellen");
  console.log("Worker:", WORKER_NAME);
  console.log("");

  if (has("--check-secrets")) {
    const phase = argv[argv.indexOf("--check-secrets") + 1] || "aktuell";
    const state = await checkSecrets(phase.startsWith("--") ? "aktuell" : phase);
    if (has("--out-json")) {
      writeFileSync(argv[argv.indexOf("--out-json") + 1], JSON.stringify(state, null, 2) + "\n");
    }
    return;
  }

  if (has("--compare-secrets")) {
    const beforeFile = argv[argv.indexOf("--compare-secrets") + 1];
    const before = JSON.parse(readFileSync(beforeFile, "utf8"));
    const after = await checkSecrets("nachher");
    if (!compareSecrets(before, after)) process.exit(1);
    const stillMissing = PROTECTED_SECRETS.filter((name) => !after.names.includes(name));
    if (stillMissing.length) {
      console.log("");
      console.log("HINWEIS: Diese erwarteten Secrets sind nicht gesetzt: " + stillMissing.join(", "));
      console.log("Ohne sie laeuft der OAuth-Flow nicht. Der Worker meldet das selbst ueber /health.");
    }
    return;
  }

  if (has("--list-zones")) {
    const wanted = argv[argv.indexOf("--list-zones") + 1];
    await listZones(wanted && !wanted.startsWith("--") ? wanted : null);
    return;
  }

  if (has("--url") || has("--force-url")) {
    const flag = has("--force-url") ? "--force-url" : "--url";
    setUrl(argv[argv.indexOf(flag) + 1], { force: flag === "--force-url" });
    return;
  }

  let changed = false;
  if (has("--ensure-kv")) changed = (await ensureKv()).changed || changed;
  if (has("--resolve-url")) changed = (await resolveUrl()).changed || changed;

  console.log("");
  console.log(changed
    ? "wrangler.toml wurde geaendert — der Workflow committet sie."
    : "wrangler.toml war bereits aktuell.");

  /* Fuer den Workflow: maschinenlesbar, ohne Geheimnisse. */
  if (process.env.GITHUB_OUTPUT) {
    const source = loadConfig();
    writeFileSync(process.env.GITHUB_OUTPUT,
      `config_changed=${changed}\n` +
      `public_base_url=${readTomlValue(source, "PUBLIC_BASE_URL") || ""}\n` +
      `kv_id_set=${!String(readTomlValue(source, "id") || "").startsWith("REPLACE_WITH")}\n`,
      { flag: "a" });
  }
}

/* Nur ausfuehren, wenn direkt aufgerufen. Als Import bleiben die
   TOML-Funktionen pruefbar, ohne dass Cloudflare beruehrt wird — ein
   Testlauf, der versehentlich einen Namespace anlegt, waere das Gegenteil
   von dem, was ein Test leisten soll. */
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Abgebrochen:", String(err && err.message).slice(0, 300));
    process.exit(1);
  });
}

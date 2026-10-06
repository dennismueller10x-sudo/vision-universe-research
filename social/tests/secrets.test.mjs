/* =========================================================================
   VU SOCIAL — SCHLUESSEL-SICHERHEIT ALS TEST (§36, §50)

   Die Schwesterdatei zu quant/tests/secrets.test.mjs, mit denselben
   Regeln und einer zusaetzlichen Gefahr: Social-Tokens sind nicht nur
   Lesezugang zu Kursen, sondern SCHREIBZUGANG zu einem oeffentlichen
   Profil. Ein durchgesickertes Meta-Token erlaubt Fremden, im Namen von
   Vision Universe zu veroeffentlichen.

   Deshalb pruefen diese Tests nicht nur, ob ein Schluessel im Repository
   liegt, sondern auch, ob der Code ueberhaupt in der Lage waere, einen zu
   verlieren: kein Browser-Code mit Tokenzugriff, keine Seite, die einen
   Adapter einbindet, kein Protokoll ohne Schwaerzung.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AuditLog = require("../engines/audit-log.js");
const Meta = require("../providers/meta/adapter.js");
const Schema = require("../engines/schema.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOCIAL = join(ROOT, "social");
const SKIP_DIRS = [".git", "node_modules", "__pycache__", ".venv", "venv"];

function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (!extensions || extensions.includes(extname(full))) out.push(full);
  }
  return out;
}

const rel = (file) => relative(ROOT, file).split(sep).join("/");
const SOCIAL_FILES = walk(SOCIAL, [".js", ".mjs", ".json", ".html", ".css", ".md"]);

/* Platzhalter, die ausdruecklich keine Schluessel sind. Dieselbe Liste
   wie in quant/tests/secrets.test.mjs, aus demselben Grund: ein Test
   braucht einen Wert in Schluesselform, sonst prueft er nichts. Wer hier
   etwas ergaenzt, schwaecht die Pruefung. */
const PLACEHOLDERS = ["TESTKEY-", "DUMMY-", "BEISPIEL-", "PLATZHALTER-", "geheim-"];
const isPlaceholder = (value) => PLACEHOLDERS.some((p) => value.includes(p));

test("SS1 · Kein Zugangsdatum liegt im Social-Bereich", () => {
  const patterns = [
    { name: "Meta-Zugangstoken", re: /\bEA[A-Za-z0-9]{40,}/ },
    { name: "Instagram-Token", re: /\bIG[A-Za-z0-9]{40,}/ },
    { name: "apikey-Zuweisung mit Literal", re: /\bapi[_-]?key\b\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["']/i },
    { name: "token-Zuweisung mit Literal",
      re: /\b(access_token|refresh_token|app_secret|client_secret)\b\s*[:=]\s*["'][A-Za-z0-9._\-]{12,}["']/i },
    { name: "Bearer-Literal", re: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
    { name: "JWT", re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/ },
    { name: "privater Schluessel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
  ];

  assert.ok(SOCIAL_FILES.length > 15, `zu wenige Dateien geprueft (${SOCIAL_FILES.length})`);

  const hits = [];
  for (const file of SOCIAL_FILES) {
    const source = readFileSync(file, "utf8");
    for (const p of patterns) {
      const match = source.match(p.re);
      if (!match) continue;
      if (isPlaceholder(match[0])) continue;
      /* Keine Ausnahme fuer Testdateien. Tests, die einen Wert in
         Tokenform brauchen, SETZEN IHN ZUSAMMEN ("EAA" + "T".repeat(60))
         statt ihn hinzuschreiben. Das ist keine Umstaendlichkeit: ein
         Token-Literal in einer Testdatei ist von einem echten Token in
         einer Testdatei nicht zu unterscheiden — weder fuer diesen Test
         noch fuer einen Menschen im Review. */
      hits.push(`${rel(file)}: ${p.name}`);
    }
  }
  /* Der Fund selbst wird nie ausgegeben — sonst stuende ein echtes Token
     im Testprotokoll, das in der CI oeffentlich sein kann. */
  assert.deepEqual(hits, [], "Moegliche Zugangsdaten im Social-Bereich:\n  " + hits.join("\n  "));
});

test("SS2 · Kein Browser-Code des Social-Bereichs liest Umgebungsvariablen", () => {
  const forbidden = [/process\s*\.\s*env/, /import\s*\.\s*meta\s*\.\s*env/, /\bDeno\s*\.\s*env/];
  const browserFiles = walk(join(SOCIAL, "engines"), [".js"])
    .concat(walk(join(SOCIAL, "ui"), [".js"]))
    .concat(walk(SOCIAL, [".html"]));

  assert.ok(browserFiles.length > 10, `zu wenige Browser-Dateien geprueft (${browserFiles.length})`);
  for (const file of browserFiles) {
    const source = readFileSync(file, "utf8");
    for (const re of forbidden) {
      assert.ok(!re.test(source), `${rel(file)}: Zugriff auf Umgebungsvariablen im Browser-Code`);
    }
  }
});

test("SS3 · Die Adapter sind Node-only und werden von keiner Seite geladen", () => {
  for (const adapter of ["social/providers/meta/adapter.js", "social/providers/mock/adapter.js"]) {
    const file = join(ROOT, adapter);
    assert.ok(existsSync(file), `${adapter} fehlt`);
    const source = readFileSync(file, "utf8");
    assert.match(source, /require\(/, `${adapter} soll ausdruecklich Node-only sein`);
    assert.doesNotMatch(source, /global\.VU/, `${adapter} darf sich nicht global im Browser registrieren`);
  }
  for (const page of walk(SOCIAL, [".html"])) {
    const html = readFileSync(page, "utf8");
    assert.ok(!/social\/providers\//.test(html), `${rel(page)}: bindet Anbietercode ein`);
    assert.ok(!/scripts\/social\//.test(html), `${rel(page)}: bindet Abrufskripte ein`);
  }
});

test("SS4 · Kein ausgeliefertes JSON traegt ein Tokenfeld", () => {
  const jsonFiles = SOCIAL_FILES.filter((f) => extname(f) === ".json");
  assert.ok(jsonFiles.length >= 3, "zu wenige JSON-Dateien geprueft");
  for (const file of jsonFiles) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/"(access_token|refresh_token|app_secret|client_secret)"\s*:\s*"[^"]{8,}"/i.test(source),
      `${rel(file)}: Tokenfeld mit Wert`);
    assert.ok(!/"authorization"\s*:/i.test(source), `${rel(file)}: Authorization-Feld`);
  }
});

test("SS5 · Der Workflow reicht Schluessel nur ueber den secrets-Kontext weiter", () => {
  const workflow = join(ROOT, ".github", "workflows", "social-ci.yml");
  if (!existsSync(workflow)) return;   /* wird im selben Commit angelegt */
  const source = readFileSync(workflow, "utf8");
  const assignments = source.match(/^\s*[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*:\s*(.+)$/gm) || [];
  for (const line of assignments) {
    const value = line.split(":").slice(1).join(":").trim();
    if (!value || value === "|" || value === ">") continue;
    assert.match(value, /\$\{\{\s*(secrets\.|github\.token)/,
      `social-ci.yml: Zugangsdatum nicht aus dem secrets-Kontext: ${line.trim()}`);
  }
});

test("SS6 · Die CI laeuft OHNE Provider-Zugangsdaten durch", () => {
  const workflow = join(ROOT, ".github", "workflows", "social-ci.yml");
  if (!existsSync(workflow)) return;
  const source = readFileSync(workflow, "utf8");
  /* Der entscheidende Punkt: der Test-Schritt selbst darf kein Secret
     brauchen. Eine CI, die ohne Meta-Zugang rot ist, prueft nicht den
     Code, sondern die Verfuegbarkeit von Meta (§43). */
  assert.ok(!/META_APP_SECRET|META_LONG_LIVED_TOKEN/.test(source),
    "Die normale CI darf keine produktiven Zugangsdaten anfordern");
});

test("SS7 · Das Auditprotokoll schwaerzt Tokens in jeder Form", () => {
  const log = AuditLog.createLog();
  const token = "EAA" + "z".repeat(50);
  const entry = log.record({
    decision: "publish", provider: "meta", result: "failed",
    reason: "Invalid OAuth token " + token,
    detail: { access_token: token, nested: { authorization: "Bearer " + token },
              liste: [{ client_secret: "geheim-wert-hier" }] },
    output: { message: "Anfrage an ...access_token=" + token + "&x=1" }
  });

  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes(token), "Ein Token darf das Protokoll nie erreichen");
  assert.ok(!serialized.includes("geheim-wert-hier"));
  assert.ok(serialized.includes("[redacted]"));
  /* Auch der state und der OAuth-code sind schuetzenswert: mit ihnen
     laesst sich ein Tausch nachspielen. */
  const oauth = log.record({ decision: "oauth", detail: { code: "AQD123", state: "abc" } });
  assert.equal(oauth.detail.code, "[redacted]");
  assert.equal(oauth.detail.state, "[redacted]");
});

test("SS8 · Der Meta-Adapter gibt in keiner Antwort ein Token zurueck", async () => {
  const TOKEN = "EAA" + "q".repeat(60);
  const SECRET = "geheim-app-secret-wert";
  const provider = Meta.createMetaProvider({
    appId: "1", appSecret: SECRET, tokenProvider: () => TOKEN,
    now: () => new Date("2026-09-15T12:00:00Z"),
    fetchImpl: (url) => Promise.resolve({
      ok: false, status: 400,
      /* Der boesartige Fall: der Anbieter spiegelt Token und Anfrage zurueck. */
      text: () => Promise.resolve(JSON.stringify({
        error: { code: 190, message: "Invalid token " + TOKEN + " secret " + SECRET + " url " + url }
      }))
    })
  });

  const probes = [
    await provider.healthCheck(),
    await provider.getAccounts(),
    await provider.getPermissions(),
    await provider.getPostMetrics("1"),
    await provider.getComments("1"),
    await provider.refreshToken(),
    await provider.publish({ idempotencyKey: "k", accountId: "meta:1",
                             media: { type: "IMAGE", url: "https://a/b.jpg" } })
  ];
  for (const probe of probes) {
    const serialized = JSON.stringify(probe);
    assert.ok(!serialized.includes(TOKEN), "Token durchgereicht");
    assert.ok(!serialized.includes(SECRET), "App-Secret durchgereicht");
  }
});

test("SS9 · Kanonische Entitaeten koennen kein Tokenfeld tragen", () => {
  for (const field of Schema.FORBIDDEN_FIELDS) {
    const probe = {};
    probe[field] = "wert";
    assert.throws(() => Schema.assertNoSecrets(probe, "probe"), /verbotenes Feld/,
      `${field} wird nicht abgefangen`);
  }
});

test("SS10 · Die Secret-NAMEN sind dokumentiert, die Werte nirgends", () => {
  assert.deepEqual(Object.keys(Meta.SECRET_NAMES).sort(),
    ["accessToken", "appId", "appSecret", "instagramAccountId", "webhookSecret"]);
  for (const name of Object.values(Meta.SECRET_NAMES)) {
    assert.match(name, /^META_[A-Z_]+$/, `${name} folgt nicht der Namenskonvention`);
  }
  /* Kein Wert liegt in der Umgebung dieses Testlaufs — und der Test
     verlangt auch keinen. */
  const health = Meta.createMetaProvider({});
  assert.ok(health, "Der Provider muss auch ohne jede Konfiguration konstruierbar sein");
});

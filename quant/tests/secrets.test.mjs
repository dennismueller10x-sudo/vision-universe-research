/* =========================================================================
   PHASE 2 §13 — SCHLUESSEL-SICHERHEIT ALS TEST

   Die Vorgabe war eindeutig: ein privater API-Schluessel darf niemals im
   JavaScript-Bundle, im HTML, in committetem JSON oder im oeffentlichen
   GitHub-Repository landen. Diese Datei macht daraus eine Pruefung, die bei
   jedem Lauf durchlaeuft — nicht eine Regel, an die man sich erinnern muss.

   Vision Universe wird statisch von GitHub Pages ausgeliefert. Es gibt keine
   Serverlaufzeit, die einen Schluessel verbergen koennte. Alles, was der
   Browser laedt, ist oeffentlich lesbar. Daraus folgt die Architektur:
   Schluessel existieren ausschliesslich serverseitig (GitHub Action), und
   das Ergebnis des Abrufs — nicht der Zugang — wird ausgeliefert.

   Die Pruefungen sind bewusst breiter als das Frontend: sie decken
   quant/, providers/, scripts/, .github/workflows/ und die Wurzelseiten ab.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

/* Alles, was ausgeliefert oder committet wird. */
const REPO_FILES = walk(ROOT, [".js", ".mjs", ".cjs", ".json", ".html", ".css", ".yml", ".yaml", ".md", ".py"]);

/* Der Teil davon, den ein Browser tatsaechlich laedt. Hier gelten die
   schaerfsten Regeln: nicht einmal ein Zugriff auf process.env ist erlaubt,
   weil er die Absicht verraet, im Frontend an einen Schluessel zu kommen. */
const BROWSER_DIRS = ["quant/ui", "quant/api", "quant/backtests", "quant/screener",
                      "quant/strategien", "quant/methodik", "quant/ki", "quant/radar",
                      "quant/markt", "quant/status", "assets", "dashboard", "academy"];

function isBrowserFile(file) {
  const r = rel(file);
  if (r.startsWith("quant/tests/")) return false;
  if (r.startsWith("quant/engines/")) return true;          // laufen im Browser
  if (r.endsWith(".html")) return true;
  return BROWSER_DIRS.some((d) => r.startsWith(d + "/"));
}

/* ---------------------------------------------------------------------- */
test("S1 · Kein Anbieterschluessel liegt in irgendeiner committeten Datei", () => {
  // Formen echter Schluessel bekannter Anbieter und generischer Zuweisungen.
  const patterns = [
    { name: "apikey-Zuweisung mit Literal", re: /\bapi[_-]?key\b\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["']/i },
    { name: "apikey als URL-Parameter mit Wert", re: /[?&]apikey=(?!\$\{|\{\{|"\s*\+|["']?\s*$)[A-Za-z0-9_\-]{12,}/i },
    { name: "token-Zuweisung mit Literal", re: /\b(access_token|auth_token|secret_key|client_secret)\b\s*[:=]\s*["'][A-Za-z0-9._\-]{12,}["']/i },
    { name: "Bearer-Literal", re: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
    { name: "OpenAI-Schluessel", re: /\bsk-[A-Za-z0-9]{20,}/ },
    { name: "AWS-Zugriffsschluessel", re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: "GitHub-Token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
    { name: "Google-API-Schluessel", re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
    /* -----------------------------------------------------------------
       EIN UMSCHLAG IST NOCH KEIN SCHLUESSEL

       Diese Regel traf bisher die BEGIN-Zeile allein. Am 21.09. kam
       worker-waker/tests/waker.test.mjs dazu, und darin steht

         "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----"

       als absichtlich kaputte Eingabe: ein leerer Umschlag, mit dem
       der Test beweist, dass der Parser fail-closed abweist. Es ist
       kein Schluessel darin - es ist die Abwesenheit eines
       Schluessels, und die Pruefung hat sie als Fund gemeldet.

       Ein Pruefer, der richtigen Text abweist, ist in diesem Projekt
       eine eigene Fehlerfamilie, und ein Scanner, dem man nicht
       glaubt, wird ignoriert. Deshalb verlangt die Regel jetzt, was
       einen Schluessel ausmacht: Nutzlast zwischen den Zeilen. Ein
       echter PKCS#8-Schluessel bringt hunderte Base64-Zeichen mit,
       ein leerer Umschlag keines.
       ----------------------------------------------------------------- */
    { name: "privater Schluessel",
      re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,40}?[A-Za-z0-9+/=]{40,}/ }
  ];

  /* Platzhalter, die ausdruecklich keine Schluessel sind. Tests brauchen
     einen Wert, der die Form eines Schluessels hat — sonst pruefen sie
     nicht, was sie pruefen sollen. Erlaubt sind nur diese Praefixe, und
     sie sind so gewaehlt, dass kein echter Anbieterschluessel sie tragen
     kann: Twelve Data vergibt 32 Hex-Zeichen, EODHD und FMP alphanumerische
     Zeichenketten ohne Bindestrich-Praefix. Wer hier etwas ergaenzt,
     schwaecht die Pruefung — also nur mit demselben Argument. */
  const PLACEHOLDERS = ["TESTKEY-", "DUMMY-", "BEISPIEL-", "PLATZHALTER-", "geheim-"];
  const isPlaceholder = (value) => PLACEHOLDERS.some((p) => value.includes(p));

  assert.ok(REPO_FILES.length > 100, `zu wenige Dateien geprueft (${REPO_FILES.length})`);

  const hits = [];
  for (const file of REPO_FILES) {
    const source = readFileSync(file, "utf8");
    for (const p of patterns) {
      const match = source.match(p.re);
      if (!match) continue;
      if (isPlaceholder(match[0])) continue;
      hits.push(`${rel(file)}: ${p.name}`);
    }
  }
  // Der Fund selbst wird nie ausgegeben — sonst stuende ein echter Schluessel
  // im Testprotokoll, das in der CI oeffentlich sein kann.
  assert.deepEqual(hits, [], "Moegliche Zugangsdaten im Repository:\n  " + hits.join("\n  "));
});

/* ---------------------------------------------------------------------- */
test("S1b · Die Schluesselregel trifft Nutzlast, nicht den Umschlag", () => {
  /* Die Gegenprobe zu S1, in beide Richtungen. Ohne sie waere die
     Verschaerfung von "BEGIN-Zeile" auf "BEGIN-Zeile mit Nutzlast"
     eine Behauptung: niemand haette geprueft, ob ein echter
     Schluessel weiterhin auffaellt.

     DIE NUTZLAST WIRD HIER GEBAUT, NICHT HINGESCHRIEBEN. Der erste
     Entwurf setzte einen schluesselfoermigen Base64-Block als Literal
     in diese Datei - und S1 hat ihn gefunden, zu Recht: ein Scanner,
     der seine eigene Testdatei ausnimmt, hat einen blinden Fleck
     genau dort, wo jemand etwas verstecken wuerde.

     Also traegt die Datei kein Exemplar. Die Bytes sind eine
     fortlaufende Zahlenreihe, aus ihr entsteht zur Laufzeit ein
     Base64-Block, und nur der hat die Form. Geprueft wird die Form,
     nicht ein Geheimnis - es gibt keines. */
  const re = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,40}?[A-Za-z0-9+/=]{40,}/;
  const nutzlast = Buffer.from(
    Array.from({ length: 96 }, (_, i) => (i * 7 + 11) % 256)).toString("base64");

  for (const etikett of ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"]) {
    const pem = "-----BEGIN " + etikett + "-----\n" + nutzlast +
      "\n-----END " + etikett + "-----";
    assert.ok(re.test(pem), etikett + " mit Nutzlast faellt nicht auf.");
  }

  /* Und die leeren Umschlaege, an denen worker-waker beweist, dass
     sein Parser fail-closed abweist. Sie tragen nichts. */
  for (const leer of [
    "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----",
    "-----BEGIN PRIVATE KEY-----\n!!!nichtbase64!!!\n-----END PRIVATE KEY-----"
  ]) {
    assert.equal(re.test(leer), false, "Leerer Umschlag gilt als Fund.");
  }
});

/* ---------------------------------------------------------------------- */
test("S2 · Kein Browser-Code liest Umgebungsvariablen", () => {
  const forbidden = [
    /process\s*\.\s*env/,
    /import\s*\.\s*meta\s*\.\s*env/,
    /\bDeno\s*\.\s*env/,
    /globalThis\s*\.\s*__ENV/
  ];
  const browserFiles = REPO_FILES.filter(isBrowserFile)
    .filter((f) => [".js", ".html", ".css"].includes(extname(f)));

  assert.ok(browserFiles.length > 20, `zu wenige Browser-Dateien geprueft (${browserFiles.length})`);

  for (const file of browserFiles) {
    const source = readFileSync(file, "utf8");
    for (const re of forbidden) {
      assert.ok(!re.test(source), `${rel(file)}: Zugriff auf Umgebungsvariablen im Browser-Code (${re})`);
    }
  }
});

/* ---------------------------------------------------------------------- */
test("S3 · Der Anbieteradapter ist serverseitig und wird von keiner Seite geladen", () => {
  const adapter = join(ROOT, "providers", "twelve-data", "adapter.js");
  assert.ok(existsSync(adapter), "Adapter fehlt");

  // Der Adapter benutzt CommonJS-require und ist damit nicht browserfaehig —
  // das ist Absicht und keine Nachlaessigkeit.
  const source = readFileSync(adapter, "utf8");
  assert.match(source, /require\(/, "Adapter soll ausdruecklich Node-only sein");
  assert.doesNotMatch(source, /global\.VU/, "Adapter darf sich nicht global im Browser registrieren");

  // Keine HTML-Seite darf ihn einbinden.
  for (const page of walk(ROOT, [".html"])) {
    const html = readFileSync(page, "utf8");
    assert.ok(!/providers\//.test(html), `${rel(page)}: bindet Anbietercode ein`);
    assert.ok(!/scripts\/market\//.test(html), `${rel(page)}: bindet Abrufskripte ein`);
  }
});

/* ---------------------------------------------------------------------- */
test("S4 · Der Schluessel steht in keiner ausgelieferten JSON-Datei", () => {
  // Zusaetzlich zum Mustertest: der Adapter haengt den Schluessel als
  // URL-Parameter an. Wenn irgendetwas eine Anfrage-URL protokolliert und
  // ins JSON schreibt, faellt es hier auf.
  const jsonFiles = REPO_FILES.filter((f) => extname(f) === ".json");
  assert.ok(jsonFiles.length > 10, "zu wenige JSON-Dateien geprueft");

  for (const file of jsonFiles) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/api\.twelvedata\.com[^"']*apikey/i.test(source), `${rel(file)}: Anfrage-URL mit Schluessel`);
    assert.ok(!/"apikey"\s*:\s*"[^"]{8,}"/i.test(source), `${rel(file)}: apikey-Feld mit Wert`);
    assert.ok(!/"authorization"\s*:/i.test(source), `${rel(file)}: Authorization-Feld`);
  }
});

/* ---------------------------------------------------------------------- */
test("S5 · Workflows reichen Schluessel nur ueber die secrets-Kontexte weiter", () => {
  const workflows = walk(join(ROOT, ".github", "workflows"), [".yml", ".yaml"]);
  assert.ok(workflows.length > 0, "keine Workflows gefunden");

  for (const file of workflows) {
    const source = readFileSync(file, "utf8");
    // Jede Zuweisung an eine KEY/TOKEN/SECRET-Variable muss aus secrets. kommen.
    const assignments = source.match(/^\s*[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*:\s*(.+)$/gm) || [];
    for (const line of assignments) {
      const value = line.split(":").slice(1).join(":").trim();
      if (!value || value === "|" || value === ">") continue;
      // Erlaubt sind ausschliesslich der secrets-Kontext und das von GitHub
      // je Lauf erzeugte, kurzlebige github.token.
      assert.match(value, /\$\{\{\s*(secrets\.|github\.token)/,
        `${rel(file)}: Zugangsdatum nicht aus dem secrets-Kontext: ${line.trim()}`);
    }
  }
});

/* ---------------------------------------------------------------------- */
test("S6 · .gitignore deckt lokale Zugangsdateien ab", () => {
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  for (const entry of [".env", "*.key", "secrets.json"]) {
    assert.ok(ignore.split("\n").some((l) => l.trim() === entry),
      `.gitignore ohne Eintrag '${entry}'`);
  }
  // Die Vorlage ist ausdruecklich erlaubt und darf nicht versehentlich
  // mit ausgeschlossen werden.
  assert.ok(ignore.includes("!.env.example"), ".env.example muss committet bleiben");
  assert.ok(existsSync(join(ROOT, ".env.example")), ".env.example fehlt");
  const example = readFileSync(join(ROOT, ".env.example"), "utf8");
  for (const line of example.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const value = line.split("=").slice(1).join("=").trim();
    assert.ok(value === "" || /^(mock|hybrid|live)$/.test(value),
      `.env.example enthaelt einen Wert: ${line.trim()}`);
  }
});

/* ---------------------------------------------------------------------- */
test("S7 · Keine echte Zugangsdatei liegt im Arbeitsverzeichnis", () => {
  // Faengt den haeufigsten Unfall: eine lokal angelegte .env, die vor dem
  // .gitignore-Eintrag entstanden ist und darum weiterhin verfolgt wird.
  for (const name of [".env", ".env.local", ".env.production", "secrets.json"]) {
    const file = join(ROOT, name);
    if (!existsSync(file)) continue;
    // Existenz allein ist in Ordnung (ignoriert); Inhalt mit Werten nicht,
    // falls die Datei doch verfolgt wird.
    assert.fail(`${name} liegt im Repository-Wurzelverzeichnis — pruefen, ob sie verfolgt wird`);
  }
});

/* ---------------------------------------------------------------------- */
test("S8 · Der Adapter gibt den Schluessel in keiner Antwort zurueck", async () => {
  const { createTwelveDataProvider, freePlanCapabilities } = await import(
    "../../providers/twelve-data/adapter.js");
  const SymbolMapping = (await import("../engines/symbol-mapping.js")).default;

  const KEY = "geheim-1234567890-nicht-ausgeben";
  const registry = SymbolMapping.createRegistry([{
    securityId: "ref_TEST", providerId: "twelve-data", providerSymbol: "TEST",
    ticker: "TEST", mic: "XNAS", currency: "USD", confidence: "verified"
  }]);

  let seenUrl = null;
  const provider = createTwelveDataProvider({
    apiKey: KEY,
    capabilities: freePlanCapabilities(),
    symbolRegistry: registry,
    fetchImpl: (url) => {
      seenUrl = url;
      // Der boesartige Fall: der Anbieter spiegelt die Anfrage zurueck.
      return Promise.resolve({
        ok: false, status: 401,
        text: () => Promise.resolve(JSON.stringify({
          code: 401, status: "error",
          message: "Invalid API key: " + KEY + " (url " + url + ")"
        }))
      });
    },
    sleep: () => Promise.resolve()
  });

  const res = await provider.getDailyBars("ref_TEST", { outputsize: 10 });

  // Die URL traegt den Schluessel — das ist bei diesem Anbieter unvermeidlich.
  assert.ok(seenUrl && seenUrl.includes(KEY), "Testaufbau: Schluessel sollte in der URL stehen");

  // Die Antwort an den Aufrufer darf ihn nicht mehr enthalten.
  const serialized = JSON.stringify(res);
  assert.ok(!serialized.includes(KEY),
    "Der Adapter reicht den Schluessel aus einer Anbieterantwort durch");
  assert.equal(res.available, false);
  assert.equal(res.reason, "authError");

  // Auch Diagnose- und Statusausgaben bleiben frei davon.
  for (const probe of [provider.healthCheck(), provider.stats(), provider.quota()]) {
    assert.ok(!JSON.stringify(probe).includes(KEY), "Diagnoseausgabe enthaelt den Schluessel");
  }
});

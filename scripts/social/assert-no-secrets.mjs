/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/assert-no-secrets.mjs

   Der CI-Waechter. Die Schwesterdatei zu scripts/market/assert-no-secrets.mjs,
   mit derselben Aufgabe und einer schaerferen Lage:

   Ein Marktdaten-Schluessel gibt Lesezugriff auf Kurse. Ein Social-Token
   gibt SCHREIBZUGRIFF auf ein oeffentliches Profil. Wer es findet, kann im
   Namen von Vision Universe veroeffentlichen.

   Dieses Skript laeuft in der CI und bricht ab, wenn

     - etwas in Tokenform in einer ausgelieferten Datei liegt
     - ein Artefakt unter social/data ein Zugangsfeld traegt
     - eine HTML-Seite Adapter- oder Skriptcode einbindet
     - ein Anbieterfeld in einem kanonischen Artefakt auftaucht

   Der letzte Punkt ist kein Sicherheits-, sondern ein Architekturtest —
   er steht hier, weil er dieselbe Datei durchlaufen kann und weil ein
   durchlaessiger Adapter dieselbe Ursache hat wie ein durchgesickertes
   Token: irgendwo hat jemand die Schicht uebersprungen.

   Ausfuehren:
     node scripts/social/assert-no-secrets.mjs
   ========================================================================= */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Provider = require(join(ROOT, "social/engines/provider.js"));

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
const problems = [];

/* ------------------------------------------------------------------ */
/* 1. Zugangsdaten in Tokenform                                        */
/* ------------------------------------------------------------------ */

const TOKEN_PATTERNS = [
  { name: "Meta-Zugangstoken", re: /\bEA[A-Za-z0-9]{40,}/ },
  { name: "Instagram-Token", re: /\bIG[A-Za-z0-9]{40,}/ },
  { name: "Bearer-Literal", re: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/ },
  { name: "Tokenzuweisung mit Literal",
    re: /\b(access_token|refresh_token|app_secret|client_secret)\b\s*[:=]\s*["'][A-Za-z0-9._\-]{12,}["']/i },
  { name: "privater Schluessel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

const PLACEHOLDERS = ["TESTKEY-", "DUMMY-", "BEISPIEL-", "PLATZHALTER-", "geheim-"];

const scanned = walk(join(ROOT, "social"), [".js", ".mjs", ".json", ".html", ".css", ".md"])
  .concat(walk(join(ROOT, "scripts", "social"), [".mjs", ".js", ".json"]));

for (const file of scanned) {
  const source = readFileSync(file, "utf8");
  for (const pattern of TOKEN_PATTERNS) {
    const match = source.match(pattern.re);
    if (!match) continue;
    if (PLACEHOLDERS.some((p) => match[0].includes(p))) continue;
    /* Der Fund wird NIE ausgegeben — sonst stuende ein echtes Token im
       oeffentlichen CI-Protokoll. */
    problems.push(`${rel(file)}: ${pattern.name}`);
  }
}

/* ------------------------------------------------------------------ */
/* 2. Artefakte unter social/data                                      */
/* ------------------------------------------------------------------ */

const FORBIDDEN_JSON_FIELDS = /"(access_token|refresh_token|app_secret|client_secret|authorization|apiKey|api_key)"\s*:/i;

for (const file of walk(join(ROOT, "social", "data"), [".json"])) {
  const source = readFileSync(file, "utf8");
  if (FORBIDDEN_JSON_FIELDS.test(source)) problems.push(`${rel(file)}: Zugangsfeld in einem Artefakt`);
}

/* ------------------------------------------------------------------ */
/* 3. Keine Seite bindet Adapter oder Skripte ein                      */
/* ------------------------------------------------------------------ */

for (const page of walk(join(ROOT, "social"), [".html"])) {
  const html = readFileSync(page, "utf8");
  if (/social\/providers\//.test(html)) problems.push(`${rel(page)}: bindet Anbietercode ein`);
  if (/scripts\/social\//.test(html)) problems.push(`${rel(page)}: bindet Abrufskripte ein`);
  if (/process\s*\.\s*env/.test(html)) problems.push(`${rel(page)}: greift auf Umgebungsvariablen zu`);
}

/* ------------------------------------------------------------------ */
/* 4. Kein Anbieterfeld in einem kanonischen Artefakt                  */
/* ------------------------------------------------------------------ */

for (const file of walk(join(ROOT, "social", "data"), [".json"])) {
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); }
  catch (err) { problems.push(`${rel(file)}: kein gueltiges JSON`); continue; }
  const leaks = Provider.findVendorLeakage(data);
  for (const path of leaks) problems.push(`${rel(file)}: Anbieterfeld ${path} oberhalb der Adapterschicht`);
}

/* ------------------------------------------------------------------ */

console.log(`Geprueft: ${scanned.length} Dateien im Social-Bereich.`);

if (problems.length) {
  console.error("\nFUNDE:");
  for (const problem of problems) console.error("  " + problem);
  console.error("\nDer Lauf bricht ab. Ein Token in einer committeten Datei ist in der " +
                "Git-Historie und muss beim Anbieter widerrufen werden — nicht nur geloescht.");
  process.exit(1);
}

console.log("Keine Zugangsdaten, keine Anbieterbindung oberhalb der Adapterschicht.");

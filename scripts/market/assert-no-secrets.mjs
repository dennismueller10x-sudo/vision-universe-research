/* =========================================================================
   VISION UNIVERSE — assert-no-secrets.mjs   (Phase 2, §13)

   Letzte Verteidigungslinie vor dem Commit. Prueft die frisch geschriebenen
   Marktdatendateien darauf, dass kein Zugangsdatum in sie hineingeraten ist.

   Warum das noetig ist, obwohl das Skript den Schluessel nie schreibt:
   Anbieter spiegeln Anfrageparameter gelegentlich in Fehlerobjekten
   ("invalid apikey=...") oder in `meta`-Feldern zurueck. Der Schluessel steht
   bei Twelve Data in der URL. Ein einziges durchgereichtes Antwortfeld
   wuerde ihn in ein oeffentliches Repository und damit auf eine oeffentliche
   Website tragen. Diese Pruefung schlaegt dann fehl, bevor committet wird.

   Zwei unabhaengige Verfahren:
     1. Exakter Abgleich gegen den Wert der Umgebungsvariablen (falls gesetzt).
     2. Mustererkennung fuer schluesselartige Zeichenketten und Auth-Felder.

   Beendet sich mit Code 1, sobald etwas gefunden wird.
   ========================================================================= */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Der Regelfall: die frisch geschriebenen Marktdatendateien.

   --all prueft zusaetzlich alles, was ein Deployment anfasst oder
   ausliefert (Zero-Cost Realtime V1 §12: "Nach Deployment Secrets-Scan
   durchfuehren"). Der Worker-Quelltext gehoert ausdruecklich dazu: er
   ist die einzige Stelle im Repository, die einen Anbieterschluessel
   ueberhaupt in die Hand nimmt, und der darf dort nur als Name einer
   Umgebungsvariablen vorkommen - nie als Wert. */
const ALL = process.argv.includes("--all");
const TARGETS = ALL
  ? ["quant/data/market", "worker", "discover/data", "discover/ui", "discover/engines",
     "quant/config", "providers", ".github/workflows", "scripts/market"].map((r) => join(root, r))
  : [join(root, "quant", "data", "market")];

/* Umgebungsvariablen, deren Wert niemals in einer Datei stehen darf. */
const SECRET_ENV = ["TWELVE_DATA_API_KEY", "EODHD_API_KEY", "FMP_API_KEY",
                    "FINNHUB_API_KEY", "TIINGO_API_KEY", "POLYGON_API_KEY"];

/* Musterbasierte Erkennung, unabhaengig von der Umgebung.

   ZWEI LISTEN, UND DER UNTERSCHIED IST WICHTIG

   In einer Datendatei ist ein Feld "authorization" schon der Befund:
   dort hat kein Anmeldefeld etwas zu suchen. In Quelltext ist es das
   Gegenteil - jede Datei, die sich bei einem Anbieter anmeldet, muss
   das Wort enthalten. Ein Muster, das dort anschlaegt, wird nach dem
   dritten Fehlalarm abgeschaltet, und dann faengt es auch den echten
   Fall nicht mehr.

   Deshalb: in Daten das breite Netz, in Quelltext nur die Formen, die
   OHNE Kontext ein Geheimnis sind - und der Abgleich gegen die
   tatsaechlichen Werte aus der Umgebung, der ueberall gilt. */
const DATA_PATTERNS = [
  { name: "apikey-Parameter", re: /\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/i },
  { name: "token-Feld", re: /\b(access_token|auth_token|bearer)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/i },
  { name: "Authorization-Header", re: /"authorization"\s*:/i },
  { name: "Anbieter-URL mit Parametern", re: /https?:\/\/[^\s"']*[?&]apikey=/i },
  { name: "OpenAI-artiger Schluessel", re: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: "AWS-Zugriffsschluessel", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}/ },
  { name: "privater Schluessel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

/* Fuer Quelltext, Konfiguration und Workflows. Jede dieser Formen ist
   ein fest eingetragenes Geheimnis - ein Name einer Umgebungsvariablen
   sieht anders aus. */
const SOURCE_PATTERNS = [
  { name: "OpenAI-artiger Schluessel", re: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: "AWS-Zugriffsschluessel", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}/ },
  { name: "Cloudflare-artiges API-Token", re: /\b(CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/ },
  { name: "privater Schluessel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "fest eingetragener Authorization-Wert", re: /["']?[Aa]uthorization["']?\s*[:=]\s*["'](Token|Bearer)\s+[A-Za-z0-9._-]{12,}["']/ },
  { name: "fest eingetragener Schluesselwert", re: /\b(api[_-]?key|apiKey|apikey)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/ }
];

/* Welche Liste fuer welche Datei. */
const DATEN = /\.(json|ndjson|csv|tsv|txt|log)$/i;
function musterFuer(datei) { return DATEN.test(datei) ? DATA_PATTERNS : SOURCE_PATTERNS; }

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const secrets = SECRET_ENV
  .map((name) => ({ name, value: process.env[name] }))
  .filter((e) => e.value && e.value.length >= 8);

const files = TARGETS.reduce((a, t2) => a.concat(walk(t2)), []);
const findings = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const relative = file.slice(root.length + 1);

  for (const secret of secrets) {
    if (source.includes(secret.value)) {
      findings.push(`${relative}: enthaelt den Wert von ${secret.name}`);
    }
  }
  for (const pattern of musterFuer(file)) {
    const match = source.match(pattern.re);
    if (match) {
      /* Der Fund selbst wird NICHT ausgegeben — sonst stuende der Schluessel
         im Build-Log, das oft oeffentlich ist. Nur Datei und Musterart. */
      findings.push(`${relative}: Muster "${pattern.name}" bei Zeichen ${match.index}`);
    }
  }
}

console.log(`Schluesselpruefung: ${files.length} Datei(en) unter ` +
            TARGETS.map((t2) => t2.slice(root.length + 1)).join(", "));
console.log(`  Umgebungswerte im Abgleich: ${secrets.length}`);

if (findings.length) {
  console.error("\nABBRUCH — moegliche Zugangsdaten in auszuliefernden Dateien:");
  findings.forEach((f) => console.error("  " + f));
  console.error("\nDiese Dateien duerfen nicht committet werden.");
  process.exit(1);
}

console.log("  Keine Zugangsdaten gefunden.");

/* --record hinterlaesst eine Marke mit Zeitstempel. Das Deployment-Tor
   beruft sich darauf; ein Schritt, der einmal gruen war, hinterlaesst
   sonst nichts, was ein spaeterer Lauf pruefen koennte. */
if (process.argv.includes("--record")) {
  const zielDir = join(root, "quant", "data", "market", "commercial");
  mkdirSync(zielDir, { recursive: true });
  writeFileSync(join(zielDir, "secret-scan-passed.json"), JSON.stringify({
    schemaVersion: "secret-scan-1.0.0",
    checkedAt: new Date().toISOString(),
    clean: true,
    files: files.length,
    targets: TARGETS.map((t2) => t2.slice(root.length + 1)),
    envValuesCompared: secrets.length,
    note: "Kein Fund heisst: weder ein Wert aus der Umgebung noch ein schluesselartiges Muster. " +
          "Der Fund selbst wuerde nie ausgegeben - nur Datei und Musterart."
  }, null, 2) + "\n");
  console.log("  Marke geschrieben: quant/data/market/commercial/secret-scan-passed.json");
}

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
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TARGET = join(root, "quant", "data", "market");

/* Umgebungsvariablen, deren Wert niemals in einer Datei stehen darf. */
const SECRET_ENV = ["TWELVE_DATA_API_KEY", "EODHD_API_KEY", "FMP_API_KEY",
                    "FINNHUB_API_KEY", "TIINGO_API_KEY", "POLYGON_API_KEY"];

/* Musterbasierte Erkennung, unabhaengig von der Umgebung. */
const PATTERNS = [
  { name: "apikey-Parameter", re: /\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/i },
  { name: "token-Feld", re: /\b(access_token|auth_token|bearer)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/i },
  { name: "Authorization-Header", re: /"authorization"\s*:/i },
  { name: "Anbieter-URL mit Parametern", re: /https?:\/\/[^\s"']*[?&]apikey=/i },
  { name: "OpenAI-artiger Schluessel", re: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: "AWS-Zugriffsschluessel", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}/ },
  { name: "privater Schluessel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

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

const files = walk(TARGET);
const findings = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const relative = file.slice(root.length + 1);

  for (const secret of secrets) {
    if (source.includes(secret.value)) {
      findings.push(`${relative}: enthaelt den Wert von ${secret.name}`);
    }
  }
  for (const pattern of PATTERNS) {
    const match = source.match(pattern.re);
    if (match) {
      /* Der Fund selbst wird NICHT ausgegeben — sonst stuende der Schluessel
         im Build-Log, das oft oeffentlich ist. Nur Datei und Musterart. */
      findings.push(`${relative}: Muster "${pattern.name}" bei Zeichen ${match.index}`);
    }
  }
}

console.log(`Schluesselpruefung: ${files.length} Datei(en) unter quant/data/market`);
console.log(`  Umgebungswerte im Abgleich: ${secrets.length}`);

if (findings.length) {
  console.error("\nABBRUCH — moegliche Zugangsdaten in auszuliefernden Dateien:");
  findings.forEach((f) => console.error("  " + f));
  console.error("\nDiese Dateien duerfen nicht committet werden.");
  process.exit(1);
}

console.log("  Keine Zugangsdaten gefunden.");

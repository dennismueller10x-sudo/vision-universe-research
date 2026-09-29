#!/usr/bin/env node
/* =========================================================================
   DIE LETZTE STATION DER REISE HATTE KEINE SEITE.

   Gemessen am 26.09.2026: die Erklaerseite bietet als eine von drei Aktionen
   den Knopf „Methodik im Detail" mit dem Ziel /quant/methodology/. Dort
   liegen 18 Vertragsdateien - und keine index.html. Auf GitHub Pages ist ein
   Verzeichnis ohne Indexdatei ein 404; der Knopf fuehrte also ins Leere,
   waehrend die Reise „wie belastbar ist das alles" als ihre letzte Station
   fuehrt.

   Diese Datei baut die Seite aus genau den Vertraegen, die dort schon
   veroeffentlicht sind. Gemessen tragen alle 18 eine `methodologyVersion`,
   11 einen `purpose`, 10 ein `label` und einen `status`. Genau das steht auf
   der Seite - und wo ein Vertrag keinen Zweck nennt, sagt die Seite das,
   statt einen zu erfinden.

   WARUM EINE ERZEUGTE SEITE UND KEINE HANDGESCHRIEBENE

   Eine handgeschriebene Liste driftet: ein neuer Vertrag kommt dazu, die
   Seite nennt ihn nicht, und niemand merkt es. Diese Seite entsteht aus dem
   Verzeichnis selbst, und ein Test haelt, dass jede Vertragsdatei darauf
   vorkommt.

   DIE SPRACHREGEL GILT AUCH HIER

   Das Woerterbuch erlaubt interne Namen ausdruecklich in der Methodik-Ebene,
   aber „nie allein und nie zuerst". Deshalb traegt jede Ueberschrift den
   Nutzerbegriff, und der interne Name steht als Beisatz darunter. Ohne
   Nutzerbegriff im Woerterbuch nimmt die Seite den `label` des Vertrags und
   sonst den Dateinamen - sie erfindet keinen.

   Ausfuehren:
     node scripts/quant/build-methodology-index.mjs
   ========================================================================= */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Language = require(join(ROOT, "quant/engines/product-language.js"));
const DIR = join(ROOT, "quant/methodology");
const OUT = join(DIR, "index.html");

/* Welcher Wörterbuchbegriff zu welcher Vertragsdatei gehört. Nur
   Zuordnungen, die es wirklich gibt - geraten wird nichts, und ein fehlender
   Eintrag ist kein Fehler, sondern führt zum `label` des Vertrags. */
const BEGRIFF = {
  "factor-evidence-v1.json": "factorDna",
  "setup-state-v1.json": "setupState",
  "pattern-research-v1.json": "patternBalance",
  "pattern-research-fundamentals-v1.json": "patternBalance",
  "market-regime-v1.json": "marketRegime",
  "strategy-profiles-v1.json": "strategyMatch",
  "strategies-v1.json": "strategyMatch",
  "backtest-v1.json": "backtestTrustScore",
  "backtest-evidence-v1.json": "backtestTrustScore",
  "trust-score-v1.json": "backtestTrustScore",
  "technical-v1.json": "technicalIntelligence",
  "elliott-v1.json": "technicalIntelligence"
};

const escape = (value) => String(value == null ? "" : value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function nutzerbegriff(datei, contract) {
  const id = BEGRIFF[datei];
  if (id && Language.has(id)) return Language.label(id);
  /* DER `label` DES VERTRAGS TAUGT NICHT ALS UEBERSCHRIFT.
   *
   * Gemessen: zwei Vertraege heissen "VU Technical Intelligence V1" und
   * "VU Backtest Trust Score V1" - beide Namen stehen auf der Verbotsliste
   * der Hauptkopie, und der Produktions-Smoke hat die Seite dafuer
   * zurueckgewiesen. Zu Recht: das Woerterbuch erlaubt einen internen Namen
   * in der Methodik-Ebene, aber "nie allein und nie zuerst" - und eine
   * Ueberschrift ist zuerst. Der `label` steht deshalb unten in der
   * Beisatzzeile, wo er hingehoert, und die Ueberschrift kommt aus dem
   * Woerterbuch oder aus dem Dateinamen. */
  /* Aus dem Dateinamen ein lesbares Wort: "pit-fundamental-history-v1.json"
     wird "Pit fundamental history". Kein Ersatz für einen echten Namen, aber
     ehrlicher als eine erfundene Beschreibung. */
  return datei.replace(/-v\d+\.json$/, "").replace(/\.json$/, "")
    .replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function zweck(contract) {
  for (const key of ["purpose", "note", "description", "summary"]) {
    const value = contract && contract[key];
    if (typeof value === "string" && value.trim().length > 20) return value.trim();
  }
  return null;
}

async function main() {
  const dateien = (await readdir(DIR)).filter((n) => n.endsWith(".json")).sort();
  if (!dateien.length) throw new Error("NO_METHODOLOGY_CONTRACTS");

  const eintraege = [];
  for (const datei of dateien) {
    let contract = null;
    try { contract = JSON.parse(await readFile(join(DIR, datei), "utf8")); } catch { contract = null; }
    eintraege.push({
      datei,
      name: nutzerbegriff(datei, contract),
      intern: (contract && (contract.methodologyVersion || contract.schemaVersion)) || null,
      status: (contract && contract.status) || null,
      label: (contract && typeof contract.label === "string" && contract.label.trim()) || null,
      zweck: zweck(contract),
      lesbar: !!contract
    });
  }

  const mitZweck = eintraege.filter((e) => e.zweck).length;
  const heute = new Date().toISOString().slice(0, 10);

  const karten = eintraege.map((e) => `
   <article class="contract">
    <h2>${escape(e.name)}</h2>
    <p class="meta">${e.intern ? "Fassung " + escape(e.intern) : "Fassung nicht angegeben"}${
      e.status ? " · Status " + escape(e.status) : ""}${
      e.label && e.label !== e.name ? " · interner Name: " + escape(e.label) : ""}</p>
    <p>${e.zweck ? escape(e.zweck)
      : "Dieser Vertrag nennt keinen Zweck in Worten. Was er festlegt, steht in seinen Feldern."}</p>
    <p class="meta"><a href="./${escape(e.datei)}">${escape(e.datei)} ansehen</a></p>
   </article>`).join("");

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Methodik im Detail · Vision Universe®</title>
<style>
 :root{color-scheme:dark light;--bg:#0b0f14;--fg:#e8eef5;--muted:#9fb0c3;--line:#1e2a36;--card:#101720}
 @media (prefers-color-scheme:light){:root{--bg:#f7f9fc;--fg:#121a24;--muted:#53667a;--line:#dce4ee;--card:#fff}}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
 main{max-width:920px;margin:0 auto;padding:32px 16px 72px}
 .eyebrow{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
 h1{font-size:1.9rem;margin:.2em 0 .4em;line-height:1.25}
 .lead{color:var(--muted);margin:0 0 28px}
 .contract{border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:14px 0;background:var(--card)}
 .contract h2{font-size:1.1rem;margin:0 0 6px}
 .contract p{margin:0 0 8px}
 .meta{color:var(--muted);font-size:.9rem}
 a{color:inherit}
 .back{display:inline-block;margin-top:28px;padding:10px 16px;border:1px solid var(--line);border-radius:10px;text-decoration:none}
 @media (max-width:640px){main{padding:24px 16px 56px}h1{font-size:1.55rem}}
</style>
<!-- DIE GEMEINSAME NAVIGATION GEHOERT IN DIE VORLAGE, NICHT IN EINEN
     NACHTRAG.

     Gemessen nach dem Merge von M31: eine Automatik ("Integrate shared
     navigation on new pages") hat genau diese zwei Zeilen in die erzeugte
     Seite eingefuegt. Das war richtig - und beim naechsten
     Materialisierungslauf haette dieser Bauer sie wieder entfernt, weil er
     die Datei vollstaendig neu schreibt. Zwei Erzeuger fuer eine Datei sind
     ein Flattern, das niemandem auffaellt ausser dem Leser, der die
     Navigation mal hat und mal nicht. Deshalb steht sie jetzt hier. -->
<link rel="stylesheet" href="/assets/site-navigation.css">
</head>
<body><vu-navigation></vu-navigation><script src="/assets/site-navigation.js"></script>
<!-- §94: Jede Seite unter /quant/ bindet die gemeinsame Shell ein. Sie
     rendert das Banner, das synthetische Daten als solche kennzeichnet.
     Diese Seite zeigt keine Kurse - aber die Regel ist zu Recht
     kategorisch: wer hier spaeter eine Zahl hinzufuegt, soll sie nicht
     unbeschriftet ausliefern koennen. -->
<script src="/quant/ui/shell.js"></script>
<main>
 <span class="eyebrow">Vision Universe® · Preview</span>
 <h1>Methodik im Detail</h1>
 <p class="lead">Jede Aussage im Produkt hängt an einem Vertrag: er legt fest, was gemessen wird, ab
  wann es gilt und wann nichts gesagt wird. Hier stehen alle ${eintraege.length} Verträge, die diese
  Vorschau veröffentlicht — mit ihrer Fassung und dem Weg zur vollständigen Datei. ${mitZweck} von
  ${eintraege.length} nennen ihren Zweck in Worten; bei den übrigen steht er in den Feldern.</p>
${karten}
 <p class="meta">Erzeugt aus dem Verzeichnis <code>quant/methodology/</code> am ${heute}. Diese Seite
  beschreibt nichts, was nicht in den Verträgen steht, und ist keine Anlageempfehlung.</p>
 <a class="back" href="/vu2/?view=explain">Zurück zur Erklärseite</a>
</main>
</body>
</html>
`;

  await writeFile(OUT, html);
  process.stdout.write("Methodik-Seite · " + eintraege.length + " Verträge · " +
    mitZweck + " mit Zweck in Worten\n");
  for (const e of eintraege) {
    process.stdout.write("  " + e.datei.padEnd(38) + (e.intern || "-").padEnd(34) +
      (e.zweck ? "Zweck" : "nur Felder") + "\n");
  }
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();

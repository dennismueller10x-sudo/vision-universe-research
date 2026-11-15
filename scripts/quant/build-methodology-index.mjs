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
  "elliott-v1.json": "technicalIntelligence",
  "technical-intelligence-v2.json": "technicalIntelligence"
};

/* Feste Nutzerueberschriften fuer Vertraege ohne Woerterbuchbegriff. Vorher von Hand in index.html nachgetragen und beim
   naechsten Erzeugen verloren (Mission IV); jetzt hier, damit die erzeugte Seite sie behaelt. */
const UEBERSCHRIFT = {
  "technical-method-evidence.json": "Wie belastbar jede Chart-Methode ist"
};

const escape = (value) => String(value == null ? "" : value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function nutzerbegriff(datei, contract) {
  if (UEBERSCHRIFT[datei]) return UEBERSCHRIFT[datei];
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

  /* DARSTELLUNG NACH APP-KONZEPT 2 (Owner-Freigabe 14.11.2026, nur Darstellung)

     Dunkle Kopfkachel mit Zurück-Knopf und den zwei gemessenen Zahlen; der Erklärsatz steht einen Tipp entfernt im Fenster
     (Knopf „i“). Jeder Vertrag ist eine Kachel mit Nutzerbegriff, Fassung und Status; Zweck, interner Name und der Weg zur
     Datei öffnen sich im Fenster (VUUI.bindPops, Inhalt im <template> der Kachel). Ohne vu-ui.js klappt das Skript am
     Seitenende alle Inhalte an Ort und Stelle aus - es geht nichts verloren. Bausteine und Farben aus assets/vu-ui.css;
     lange Dateinamen und Fassungen brechen um (320 px ohne waagerechten Überlauf). */
  const U = require(join(ROOT, "assets/vu-ui.js"));
  const metaZeile = (e) => `${e.intern ? "Fassung " + escape(e.intern) : "Fassung nicht angegeben"}${
      e.status ? " · Status " + escape(e.status) : ""}${
      e.label && e.label !== e.name ? " · interner Name: " + escape(e.label) : ""}`;
  const karten = eintraege.map((e, i) => `
   <article class="contract vu-tap">
    <h2>${escape(e.name)}</h2>
    <p class="meta">${e.intern ? escape(e.intern) : "Fassung nicht angegeben"}</p>
    <p class="chips">${e.status ? `<span class="chip">${escape(e.status)}</span>` : ""}<span class="chip${e.zweck ? " chip--on" : ""}">${e.zweck ? "Zweck in Worten" : "nur Felder"}</span></p>
    <button type="button" class="open" aria-haspopup="dialog" data-vu-pop="mc-${i}" data-vu-pop-title="${escape(e.name)}"><span class="vu-visually-hidden">${escape(e.name)}: Zweck und Datei</span>${U.glyph("next", 16)}</button>
    <template id="mc-${i}">
     <p class="meta">${metaZeile(e)}</p>
     <p>${e.zweck ? escape(e.zweck)
      : "Dieser Vertrag nennt keinen Zweck in Worten. Was er festlegt, steht in seinen Feldern."}</p>
     <p><a class="vu-btn vu-btn--line file" href="./${escape(e.datei)}">${escape(e.datei)} ansehen</a></p>
    </template>
   </article>`).join("");

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#ffffff">
<!-- Farbschema vor dem ersten Bild: dieselbe gemerkte Wahl wie die Plattform-Navigation, Quant startet dunkel -->
<script>(function(){var w="dark";try{var v=localStorage.getItem("vu-discover-theme-v1");if(v==="dark"||v==="light")w=v;}catch(e){}var h=document.documentElement;h.setAttribute("data-theme",w);h.setAttribute("data-theme-mode",w);var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",w==="dark"?"#000000":"#ffffff");})();</script>
<title>Methodik im Detail · Vision Universe®</title>
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
<link rel="stylesheet" href="/assets/vu-ui.css?v=${U.VERSION}">
<style>
 /* Hell und Dunkel folgen dem Schalter der Plattform-Navigation (html[data-theme]); Farben nur aus assets/vu-ui.css:
    Weiß, Schwarz, Neongrün und drei Graustufen. */
 body{margin:0;background:var(--vu-bg,#fff)}
 main{max-width:1040px;margin:0 auto;padding:10px var(--vu-gutter,16px) 120px}
 html[data-vu-dock] main{padding-bottom:24px}
 .mh{border-radius:22px;padding:16px}
 :root:not([data-theme=dark]) .mh{background:#0e1013}
 .mh-top{display:flex;align-items:center;gap:10px}
 .mh-top .vu-ltag{flex:1;min-width:0}
 .mh .vu-round{width:40px;height:40px;background:#262626;color:#fff;font:900 16px/1 var(--vu-font)}
 .mh h1{margin:12px 0 0;font-size:34px;font-weight:900;letter-spacing:-.045em;line-height:1.02;text-wrap:balance}
 .mh .vu-stats{margin-top:14px;max-width:420px}
 .grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:14px}
 @media (min-width:640px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mh{padding:22px}.mh h1{font-size:44px}}
 @media (min-width:1000px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media (max-width:359px){.mh h1{font-size:29px}}
 .contract{position:relative;display:flex;flex-direction:column;min-width:0;padding:14px 44px 14px 14px;cursor:default}
 .contract h2{margin:0;font-size:16.5px;font-weight:900;letter-spacing:-.02em;line-height:1.2;overflow-wrap:anywhere}
 .meta{margin:4px 0 0;font-size:12px;line-height:1.4;color:var(--vu-mute);overflow-wrap:anywhere}
 .chips{display:flex;flex-wrap:wrap;gap:6px;margin:auto 0 0;padding-top:10px}
 .chip{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--vu-hair);font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--vu-mute);overflow-wrap:anywhere}
 .chip--on{box-shadow:none;background:var(--vu-lime);color:#000}
 .contract .open{position:absolute;inset:0;width:100%;min-height:0;padding:14px;border:0;border-radius:22px;background:none;color:var(--vu-mute);display:flex;justify-content:flex-end;align-items:flex-start;cursor:pointer}
 .contract .open:focus-visible{outline:2px solid var(--vu-focus-ring);outline-offset:2px}
 .contract--open{padding-right:14px}
 .contract--open .open{display:none}
 .vu-sheet-body .meta{margin:0 0 10px;font-size:13px}
 .vu-sheet-body p{margin:0 0 12px;overflow-wrap:anywhere}
 .file{max-width:100%;height:auto;min-height:44px;padding-block:10px;white-space:normal;overflow-wrap:anywhere;text-align:center}
 .note{margin:22px 0 0;font-size:12.5px;line-height:1.5;color:var(--vu-mute)}
 .note code{font-size:12px;overflow-wrap:anywhere}
</style>
</head>
<body><vu-navigation theme="dark" theme-switch no-preview></vu-navigation><script>document.querySelector("vu-navigation").setAttribute("theme",document.documentElement.getAttribute("data-theme")||"dark");</script><script src="/assets/site-navigation.js"></script>
<!-- §94: Jede Seite unter /quant/ bindet die gemeinsame Shell ein. Sie
     rendert das Banner, das synthetische Daten als solche kennzeichnet.
     Diese Seite zeigt keine Kurse - aber die Regel ist zu Recht
     kategorisch: wer hier spaeter eine Zahl hinzufuegt, soll sie nicht
     unbeschriftet ausliefern koennen. -->
<script src="/quant/ui/shell.js"></script>
<main class="vu-ui" id="m-main">
 <header class="mh vu-night">
  <div class="mh-top"><a class="vu-round" href="/quant/#/methodik" aria-label="Zurück zur Methodik">${U.glyph("back", 18)}</a><span class="vu-ltag">Vision Universe® · Preview</span>
   <button type="button" class="vu-round" aria-haspopup="dialog" aria-label="Was hier steht" data-vu-pop="m-lead" data-vu-pop-title="Methodik im Detail">i</button></div>
  <h1>Methodik im Detail</h1>
  ${U.stats([{ value: String(eintraege.length), label: "Verträge", tone: "lime" }, { value: String(mitZweck), label: "nennen ihren Zweck in Worten" }], { label: "Verträge dieser Vorschau" })}
  <template id="m-lead"><p class="lead">Jede Aussage im Produkt hängt an einem Vertrag: er legt fest, was gemessen wird, ab
  wann es gilt und wann nichts gesagt wird. Hier stehen alle ${eintraege.length} Verträge, die diese
  Vorschau veröffentlicht — mit ihrer Fassung und dem Weg zur vollständigen Datei. ${mitZweck} von
  ${eintraege.length} nennen ihren Zweck in Worten; bei den übrigen steht er in den Feldern.</p></template>
 </header>
 <div class="grid">${karten}
 </div>
 ${U.next({ eyebrow: "Quant", title: "Zurück zur Methodik", href: "/quant/#/methodik" })}
 <p class="note">Erzeugt aus dem Verzeichnis <code>quant/methodology/</code> am ${heute}. Diese Seite
  beschreibt nichts, was nicht in den Verträgen steht, und ist keine Anlageempfehlung.</p>
</main>
<script src="/assets/vu-ui.js?v=${U.VERSION}"></script>
<script>(function(){var m=document.getElementById("m-main"),U=window.VUUI;
 if(U&&U.bindPops&&U.popup){U.bindPops(m);return;}
 /* Ohne die Fenster-Bausteine (ältere vu-ui.js im Cache): alle Inhalte an Ort und Stelle zeigen. */
 Array.prototype.forEach.call(m.querySelectorAll("template"),function(t){var d=document.createElement("div");d.innerHTML=t.innerHTML;t.parentNode.insertBefore(d,t);if(t.parentNode.classList)t.parentNode.classList.add("contract--open");});
})();</script>
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

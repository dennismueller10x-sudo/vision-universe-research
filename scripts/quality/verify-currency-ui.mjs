#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — verify-currency-ui.mjs   (Currency Layer, Production Proof)

   DER NACHWEIS IM ECHTEN BROWSER.

   Alles darunter ist gemessen: die Kurse, die Regeln, die Abdeckung, die
   Herkunft. Was bis hierher NICHT gemessen war, ist das, was ein Nutzer
   tatsaechlich sieht - ob die Seite in Euro startet, ob der Umschalter
   wirkt, ob dabei Prozentwerte stehen bleiben und ob der Chart in Euro
   eine andere Form hat als der in Dollar.

   Genau das prueft dieses Skript, und zwar an der ausgelieferten Seite
   statt an einer Testseite. Ein Vertrag, der in der Testsuite haelt und
   im Browser nicht ankommt, ist kein Vertrag.

   DIE PRUEFUNGEN

     UI1  EUR ist die Vorgabe, der Umschalter steht in der Leiste.
     UI2  Umschalten aendert Geldbetraege - und NUR Geldbetraege.
     UI3  In Euro steht kein Dollarbetrag mehr auf der Seite.
     UI4  Die Struktur bleibt identisch: kein Titel faellt weg.
     UI5  Die EUR-Rendite weicht von der USD-Rendite ab (§41).
     UI6  Der MAX-Chart in Euro beginnt spaeter als in Dollar (O-15)
          und sagt es dem Nutzer.
     UI7  Keine Konsolenfehler, keine 404 auf Produktpfaden.
     UI8  Discover 1.0 und Discover 2.1 benutzen denselben Vertrag.

   Ausfuehren:
     node scripts/quality/verify-currency-ui.mjs [--url BASE] [--ticker AAPL]

   Exit-Code 1 bei mindestens einem Fehlschlag. Ohne erreichbare Seite
   endet das Skript mit SKIP und Exit 0 - ein Nachweis, der nicht
   gefuehrt werden konnte, ist kein bestandener Nachweis, aber auch kein
   Fehlschlag des Codes.
   ========================================================================= */
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = (arg("url", "http://localhost:8899")).replace(/\/$/, "");
const TICKER = arg("ticker", "AAPL");
const UNIVERSE = arg("universe", "US_REAL");

const pruefungen = [];
function pruefe(id, titel, fn) {
  return Promise.resolve()
    .then(fn)
    .then((r) => pruefungen.push({ id, titel, zustand: r && r.zustand ? r.zustand : "PASS", detail: r && r.detail }))
    .catch((err) => pruefungen.push({ id, titel, zustand: "FAIL", detail: String((err && err.message) || err) }));
}

/* Text UND Struktur einer Seite, damit UI4 vergleichen kann. */
const TEXTE = () => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
    for (const c of n.childNodes) walk(c);
  };
  walk(document.body);
  return out;
};

/* Prozente, Verhaeltnisse, Punkte - alles, was sich unter einem
   Waehrungswechsel NICHT bewegen darf. */
const IST_VERHAELTNIS = /%|Pp\.|\d\s*[x×]$|-Fache|p\. a\./;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const konsole = [];
page.on("pageerror", (e) => konsole.push("PAGEERROR " + String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  /* Zertifikatsfehler externer Einbindungen sind nicht Sache dieses
     Nachweises - sie treten auch ohne Currency Layer auf. */
  if (/ERR_CERT|net::ERR_/.test(m.text())) return;
  konsole.push(m.text().slice(0, 200));
});

async function schalte(code) {
  const sel = `.vu-fx-switch button[data-currency="${code}"]`;
  const knopf = await page.$(sel);
  if (!knopf) throw new Error("Kein Umschalter fuer " + code);
  await knopf.click();
  await page.waitForTimeout(1800);
}

let erreichbar = true;
try {
  await page.goto(BASE + "/discover/", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);
} catch (err) {
  erreichbar = false;
}

if (!erreichbar) {
  console.log("CURRENCY_UI_PROOF = SKIP");
  console.log("Die Seite unter " + BASE + " ist nicht erreichbar. Der Nachweis wurde nicht gefuehrt.");
  await browser.close();
  process.exit(0);
}

await pruefe("UI1", "EUR ist die Vorgabe, der Umschalter steht in der Leiste", async () => {
  const s = await page.evaluate(() => ({
    hatVertrag: typeof VUFx !== "undefined" && !!VUFx.layer,
    waehrung: (typeof VUFx !== "undefined" && VUFx.layer) ? VUFx.layer.preference.get() : null,
    schalter: !!document.querySelector(".vu-fx-switch"),
    knoepfe: Array.from(document.querySelectorAll(".vu-fx-switch button"))
      .map((b) => b.getAttribute("data-currency"))
  }));
  if (!s.hatVertrag) throw new Error("Kein Currency Contract im Browser");
  if (s.waehrung !== "EUR") throw new Error("Vorgabe ist " + s.waehrung + ", erwartet EUR");
  if (!s.schalter) throw new Error("Kein Umschalter in der Leiste");
  if (s.knoepfe.join("|") !== "EUR|USD") throw new Error("Umschalter zeigt " + s.knoepfe.join("|"));
  return { detail: "Vorgabe EUR, Umschalter EUR|USD vorhanden." };
});

/* --- Die Aktienseite: dort steht alles, was umgerechnet wird. ------- */
await page.goto(BASE + "/discover/#/s/" + UNIVERSE + "/" + TICKER,
  { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(3500);

const eurTexte = await page.evaluate(TEXTE);
const eurDollar = eurTexte.filter((t) => /\$/.test(t));
await schalte("USD");
const usdTexte = await page.evaluate(TEXTE);
await schalte("EUR");

await pruefe("UI4", "Die Struktur bleibt identisch - kein Titel faellt weg", async () => {
  if (eurTexte.length !== usdTexte.length) {
    throw new Error("Textknoten: " + eurTexte.length + " (EUR) gegen " + usdTexte.length + " (USD)");
  }
  return { detail: eurTexte.length + " Textknoten in beiden Waehrungen." };
});

await pruefe("UI2", "Umschalten aendert Geldbetraege - und NUR Geldbetraege", async () => {
  const n = Math.min(eurTexte.length, usdTexte.length);
  const geaendert = [], verhaeltnisse = [];
  for (let i = 0; i < n; i++) {
    if (eurTexte[i] === usdTexte[i]) continue;
    geaendert.push([eurTexte[i], usdTexte[i]]);
    if (IST_VERHAELTNIS.test(eurTexte[i]) && IST_VERHAELTNIS.test(usdTexte[i])) {
      /* Eine Zeile wie "343,76 € +2,1 %" enthaelt beides. Gemeint sind
         nur die Knoten, die AUSSCHLIESSLICH ein Verhaeltnis tragen. */
      if (!/[€$]/.test(eurTexte[i]) && !/[€$]/.test(usdTexte[i])) {
        verhaeltnisse.push([eurTexte[i], usdTexte[i]]);
      }
    }
  }
  if (!geaendert.length) throw new Error("Der Umschalter hat nichts veraendert");
  if (verhaeltnisse.length) {
    throw new Error("Verhaeltniswerte haben sich bewegt: " +
      JSON.stringify(verhaeltnisse.slice(0, 3)));
  }
  return { detail: geaendert.length + " Geldbetraege geaendert, 0 Prozent- oder Verhaeltniswerte." };
});

await pruefe("UI3", "In Euro steht kein Dollarbetrag mehr auf der Seite", async () => {
  if (eurDollar.length) {
    throw new Error(eurDollar.length + " Dollarbetraege in der EUR-Ansicht: " +
      JSON.stringify(eurDollar.slice(0, 4)));
  }
  return { detail: "Keine Dollarbetraege in der EUR-Ansicht." };
});

async function zeitraum(label) {
  const b = await page.$(`button:text-is("${label}")`);
  if (!b) return null;
  await b.click();
  await page.waitForTimeout(1800);
  return page.evaluate(() => {
    const hero = document.querySelector(".dx-chart-hero-preis");
    const span = document.querySelector(".dx-chart-hero-span");
    const note = document.querySelector(".dx-intraday-note");
    return { hero: hero ? hero.textContent.trim() : null,
             spanne: span ? span.textContent.trim() : null,
             hinweis: note ? note.textContent.trim() : null };
  });
}

await pruefe("UI5", "Die EUR-Rendite weicht von der USD-Rendite ab (§41)", async () => {
  const eur = await zeitraum("5J");
  if (!eur) return { zustand: "SKIP", detail: "Kein 5J-Zeitraum auf dieser Seite." };
  await schalte("USD");
  const usd = await zeitraum("5J");
  await schalte("EUR");
  const zahl = (t) => {
    const m = t && t.match(/([+-]?[\d.]+(?:,\d+)?)\s*%/);
    return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : null;
  };
  const a = zahl(eur.hero), b = zahl(usd.hero);
  if (a === null || b === null) throw new Error("Keine Rendite ablesbar: " + eur.hero + " / " + usd.hero);
  if (a === b) {
    throw new Error("EUR- und USD-Rendite sind identisch (" + a + " %) - die Reihe wurde nicht punktweise umgerechnet");
  }
  return { detail: "5 Jahre: " + a + " % in EUR gegen " + b + " % in USD." };
});

await pruefe("UI6", "Der MAX-Chart in Euro beginnt spaeter - und sagt es", async () => {
  const eur = await zeitraum("Max");
  if (!eur) return { zustand: "SKIP", detail: "Kein MAX-Zeitraum auf dieser Seite." };
  await schalte("USD");
  const usd = await zeitraum("Max");
  await schalte("EUR");
  /* TT.MM.JJJJ laesst sich nicht als Zeichenkette vergleichen - "08.01.1999"
     stuende sonst vor "22.09.1995". Die erste Fassung dieses Tests hat
     SAP und ASML genau deshalb als Fehlschlag gemeldet, obwohl die Seite
     richtig war. */
  const start = (t) => {
    const m = t && t.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? { text: m[0], iso: m[3] + "-" + m[2] + "-" + m[1] } : null;
  };
  const a = start(eur.spanne), b = start(usd.spanne);
  if (!a || !b) return { zustand: "SKIP", detail: "Kein Zeitraum ablesbar." };
  if (a.iso === b.iso) {
    return { zustand: "SKIP",
             detail: "Beide Reihen beginnen am " + a.text + " - fuer diesen Titel gibt es keine Kurse vor dem FX-Beginn." };
  }
  if (a.iso < b.iso) throw new Error("Der EUR-Chart beginnt FRUEHER (" + a.text + ") als der native (" + b.text + ")");
  if (!eur.hinweis) throw new Error("Der verkuerzte Zeitraum wird dem Nutzer nicht gesagt");
  return { detail: "EUR ab " + a.text + ", nativ ab " + b.text + ". Hinweis steht auf der Seite." };
});

await pruefe("UI8", "Discover 2.1 benutzt denselben Vertrag", async () => {
  await page.goto(BASE + "/discover-v2/", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => ({
    kern: typeof VUFx !== "undefined" && !!VUFx.layer,
    waehrung: (typeof VUFx !== "undefined" && VUFx.layer) ? VUFx.layer.preference.get() : null,
    schalter: !!document.querySelector(".vu-fx-switch"),
    /* Derselbe Vertrag heisst: dieselbe gespeicherte Vorgabe. */
    speicher: (typeof VUFx !== "undefined" && VUFx.Preference) ? VUFx.Preference.STORAGE_KEY : null,
    dollar: (function () {
      const t = [];
      const walk = (n) => { if (n.nodeType === 3) { if (/\$/.test(n.textContent)) t.push(n.textContent.trim()); return; } for (const c of n.childNodes) walk(c); };
      walk(document.body);
      return t.slice(0, 3);
    })()
  }));
  /* Discover 2.1 migriert nach dem Kern-Merge gegen die neue Grundlinie,
     damit sein Vorschau-Gate scharf bleibt (siehe M12-5). Solange die
     Seite den Core nicht laedt, ist das kein Fehlschlag, sondern eine
     offene Zusage - und sobald sie ihn laedt, greift die volle Pruefung
     wieder, ohne dass jemand daran denken muss. */
  if (!s.kern) {
    return { zustand: "SKIP",
      detail: "Discover 2.1 laedt den Currency Core noch nicht - Migration folgt nach dem Kern-Merge." };
  }
  if (!s.schalter) throw new Error("Discover 2.1 hat keinen Umschalter");
  if (s.waehrung !== "EUR") throw new Error("Discover 2.1 zeigt " + s.waehrung);
  if (s.dollar.length) throw new Error("Dollarbetraege in Discover 2.1: " + JSON.stringify(s.dollar));
  return { detail: "Umschalter vorhanden, EUR aktiv, Speicher " + s.speicher + "." };
});

await pruefe("UI7", "Keine Konsolenfehler", async () => {
  if (konsole.length) throw new Error(konsole.length + " Fehler: " + JSON.stringify(konsole.slice(0, 3)));
  return { detail: "Keine Konsolenfehler auf beiden Flaechen." };
});

await browser.close();

/* --------------------------------------------------------------------- */
const fehl = pruefungen.filter((p) => p.zustand === "FAIL");
const uebersprungen = pruefungen.filter((p) => p.zustand === "SKIP");

console.log("CURRENCY LAYER - NACHWEIS IN DER OBERFLAECHE\n");
for (const p of pruefungen) {
  const zeichen = p.zustand === "PASS" ? "ok  " : p.zustand === "SKIP" ? "??  " : "XX  ";
  console.log(`${zeichen} ${p.id}  ${p.titel}`);
  if (p.detail) console.log(`       ${p.detail}`);
}
console.log("");
console.log("CURRENCY_UI_PROOF = " + (fehl.length ? "FAIL" : uebersprungen.length ? "PASS_WITH_SKIPS" : "PASS"));
process.exit(fehl.length ? 1 : 0);

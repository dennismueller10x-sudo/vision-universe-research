/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/build-opportunity-slate.mjs

   DER BEWEIS, DASS DAS SYSTEM NICHT MEHR TICKER-FIRST DENKT

   -------------------------------------------------------------------------
   WAS DIESER LAUF IST UND WAS NICHT
   -------------------------------------------------------------------------

   Er erzeugt KEINE Veroeffentlichung und keinen Kandidaten. Er zeigt,
   welche Themen aus den BEREITS vorhandenen, kostenfrei verfuegbaren
   Vision-Universe-Daten entstehen koennen - ueber mehrere Content
   Families und Entitaetsarten hinweg.

   Vorher konnte das System genau eine Sorte Thema bilden:
   "Technisches Setup — <TICKER>". 12 Signaltypen, 10 davon an ein
   einzelnes Instrument gebunden, 0 thematisch.

   -------------------------------------------------------------------------
   UNAVAILABLE IST EINE ANTWORT
   -------------------------------------------------------------------------

   Wo keine realen Daten liegen, entsteht KEIN Thema. Kein Fixture,
   keine erfundene Opportunity, kein Platzhalter mit plausiblen Zahlen.

   Eine Kategorie, die leer bleibt, ist ein ehrlicher Befund ueber die
   Datenlage. Eine Kategorie, die mit erfundenen Daten gefuellt wird,
   ist eine Luege ueber die Datenlage - und sie faellt erst auf, wenn
   jemand den Inhalt veroeffentlicht.

   Ausfuehren:
     node scripts/social/build-opportunity-slate.mjs
     node scripts/social/build-opportunity-slate.mjs --out social/data
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { ausgabePfad } from "../quality/out-path.mjs";
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Universe = require(join(ROOT, "social/engines/content-universe.js"));
const DiscoverEvidence = require(join(ROOT, "social/engines/discover-evidence.js"));

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/* -------------------------------------------------------------------
   QUELLE 1 — VU DISCOVER: THEMATISCHE REIHEN

   Diese Reihen sind der staerkste Beleg dafuer, dass das breite
   Universum nicht erfunden werden muss: es liegt bereits im
   Repository. "CASHFLOW-MASCHINEN", "COMEBACK?", "BEKANNTE NAMEN IN
   BEWEGUNG" - und die Untertitel sind schon in Lesersprache
   geschrieben, nicht in Innensprache.

   Eine Reihe ist KEINE Einzelaktien-Story. Sie ist ein Ranking oder
   ein Vergleich ueber mehrere Titel - genau eine der Formen, die das
   alte Signalmodell gar nicht bilden konnte.
   ------------------------------------------------------------------- */
function ausDiscoverReihen() {
  const dir = join(ROOT, "discover/data/rows/US_REAL");
  if (!existsSync(dir)) {
    return { verfuegbar: false, grund: "Kein Discover-Reihenverzeichnis.", themen: [] };
  }
  const themen = [];
  for (const datei of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const r = readJson(join(dir, datei), null);
    if (!r || !r.title) continue;
    const karten = Array.isArray(r.cards) ? r.cards : [];
    /* Ohne Mitglieder traegt eine Reihe kein Ranking. Leer ist leer. */
    if (karten.length < 3) continue;

    const namen = karten.map((k) => k.companyName || k.symbol).filter(Boolean);

    /* -----------------------------------------------------------------
       DIE QUELLE BESTIMMT NICHT DIE FORM

       Der erste Entwurf gab ALLEN Discover-Reihen hart RANKING - und
       reproduzierte damit genau die Kopplung, die hier abgeschafft
       werden soll. "KUENSTLICHE INTELLIGENZ" und "ROBOTIK & AUTOMATION"
       sind Megatrend-Material, keine Bestenliste.

       Die Unterscheidung muss nicht erfunden werden: die Reihen tragen
       sie selbst. Wo `theme` gesetzt ist (ki, robotik, mobilitaet),
       geht es um ein THEMA; wo `rule` steht, um einen zahlenmaessigen
       Filter. Gelesen statt entschieden.
       ------------------------------------------------------------------- */
    const istThema = !!(r.theme && String(r.theme).trim());

    /* Die Reihe traegt nicht nur einen Titel, sondern Belege: ihre
       Auswahlregel, ihre Abdeckung und die Titel selbst. Ohne sie
       waere ein Slate-Eintrag nur eine Ueberschrift - und aus einer
       Ueberschrift entsteht kein Brief. */
    const ev = DiscoverEvidence.fromRow(r, { maxCompanies: 5 });
    themen.push(Universe.topic({
      family: istThema ? "MEGATREND" : "RANKING",
      entityType: "STOCK",
      entities: namen.slice(0, 10),
      sources: ["VU_DISCOVER"],
      slug: basename(datei, ".json"),
      title: r.title,
      question: r.subtitle || null,
      evidenceRefs: ["discover/data/rows/US_REAL/" + datei],
      evidence: ev.evidence,
      evidenceSufficient: ev.sufficient,
      evidenceRejected: ev.rejectedCount,
      timeSensitivity: "TIMELY",
      asOf: r.asOf || r.generatedAt || null,
      note: "Reihe mit " + karten.length + " Titeln, Stand " + (r.asOf || "unbekannt") +
        ". Form aus den Daten: " + (istThema
          ? "theme=\"" + r.theme + "\" -> MEGATREND"
          : "zahlenmaessiger Filter -> RANKING") + "."
    }));
  }
  return { verfuegbar: themen.length > 0, grund: null, themen };
}

/* -------------------------------------------------------------------
   QUELLE 2 — DAS MAGAZIN

   Ein Magazinstueck kann mehrere Social Stories tragen. Hier entsteht
   je Ausgabe EIN Thema; welche Geschichte daraus wird, entscheidet
   spaeter die Story-Auswahl.
   ------------------------------------------------------------------- */
function ausMagazin() {
  const dir = join(ROOT, "magazin");
  if (!existsSync(dir)) return { verfuegbar: false, grund: "Kein Magazinverzeichnis.", themen: [] };
  const themen = [];
  for (const ausgabe of readdirSync(dir).sort()) {
    const pfad = join(dir, ausgabe, "index.html");
    if (!existsSync(pfad)) continue;
    const html = readFileSync(pfad, "utf8");
    const titel = (/<title>([^<]+)<\/title>/i.exec(html) || [])[1];
    if (!titel) continue;
    themen.push(Universe.topic({
      family: "MAGAZINE_STORY",
      entityType: "NONE",
      sources: ["VU_MAGAZINE"],
      slug: "magazin-" + ausgabe,
      title: titel.trim(),
      evidenceRefs: ["magazin/" + ausgabe + "/index.html"],
      timeSensitivity: "TIMELY",
      note: "Eine Ausgabe kann mehrere Social Stories tragen."
    }));
  }
  return { verfuegbar: themen.length > 0, grund: null, themen };
}

/* -------------------------------------------------------------------
   QUELLE 3 — AKTIENREPORTS

   Ein Report ist KEINE festgelegte Form. Er kann eine Stock Story
   tragen, eine Education oder einen Vergleich. Welche daraus wird,
   entscheidet die Opportunity - nicht die Quelle.
   ------------------------------------------------------------------- */
function ausReports() {
  const dir = join(ROOT, "reports");
  if (!existsSync(dir)) return { verfuegbar: false, grund: "Kein Reportverzeichnis.", themen: [] };
  const namen = readJson(join(ROOT, "discover/config/company-names.json"), { names: {} }).names || {};
  const themen = [];
  for (const eintrag of readdirSync(dir).sort()) {
    const pfad = join(dir, eintrag, "index.html");
    if (!existsSync(pfad)) continue;
    const html = readFileSync(pfad, "utf8");
    const titel = (/<title>([^<]+)<\/title>/i.exec(html) || [])[1];
    const klar = namen[eintrag.toUpperCase()] || null;
    themen.push(Universe.topic({
      family: "REPORT_STORY",
      entityType: "STOCK",
      entities: [klar || eintrag],
      sources: ["VU_STOCK_REPORT"],
      slug: "report-" + eintrag,
      title: (titel || eintrag).trim(),
      evidenceRefs: ["reports/" + eintrag + "/index.html"],
      timeSensitivity: "EVERGREEN",
      note: klar ? null : "Kein Klarname zu \"" + eintrag + "\" bekannt - " +
        "das Audience-Tor wird das im Einstieg beanstanden."
    }));
  }
  return { verfuegbar: themen.length > 0, grund: null, themen };
}

/* -------------------------------------------------------------------
   QUELLE 4 — VU QUANT: EINZELWERTE

   Die bisher EINZIGE Quelle des Systems. Sie bleibt - als eine von
   mehreren, nicht als die eine.
   ------------------------------------------------------------------- */
function ausQuant() {
  const pfad = join(ROOT, "social/data/signals.json");
  const roh = readJson(pfad, null);
  /* -------------------------------------------------------------------
     DER SCHLUESSEL HEISST `events`, NICHT `signals`

     Der erste Entwurf las roh.signals - ein Feld, das es in dieser
     Datei nicht gibt. Ergebnis: "Keine aktuellen Quant-Signale", obwohl
     vier reale dastanden. Dieselbe Familie wie byte_size gegen
     asset_byte_size, diesmal in meinem eigenen Code.

     Gelesen werden beide Schreibweisen. Toleriert werden die NAMEN,
     nie die Werte. */
  const liste = roh && (Array.isArray(roh) ? roh : (roh.events || roh.signals));
  if (!liste || !liste.length) {
    return { verfuegbar: false,
      grund: "Keine aktuellen Quant-Ereignisse in social/data/signals.json.",
      themen: [] };
  }

  const namen = readJson(join(ROOT, "discover/config/company-names.json"), { names: {} }).names || {};
  const LABEL = {
    TECHNICAL_SETUP: "Technische Lage", NEW_52W_HIGH: "Neues Jahreshoch",
    NEW_52W_LOW: "Neues Jahrestief", MOMENTUM_SHIFT: "Momentum dreht",
    EARNINGS_RELEASE: "Geschaeftszahlen", QUANT_SCORE_JUMP: "Sprung im Score"
  };

  const themen = liste
    /* Nur veroeffentlichungsfaehige. Synthetische Instrumente sind als
       solche markiert - ein Beitrag darueber waere eine erfundene
       Marktaussage. */
    .filter((e) => e && e.state === "VERIFIED" && e.entity)
    .slice(0, 10)
    .map((e) => {
      const klar = namen[String(e.entity).toUpperCase()] || null;
      return Universe.topic({
        family: "STOCK_STORY",
        entityType: "STOCK",
        /* Klarname vor Kuerzel - sonst stolpert das Audience-Tor
           spaeter im Einstieg. */
        entities: [(klar || e.entity)],
        sources: ["VU_QUANT"],
        slug: "quant-" + String(e.type).toLowerCase() + "-" +
          String(e.entity).toLowerCase(),
        title: (LABEL[e.type] || e.type) + ": " + (klar || e.entity),
        question: null,
        evidenceRefs: ["social/data/signals.json#" +
          ((e.context && e.context.snapshotId) || e.type)],
        timeSensitivity: "TIMELY",
        asOf: e.observedAt || null,
        /* Die reale Signalstaerke reist mit. Ohne sie bleibt der Anlass
           eines Quant-Themas unbelegt - und das Thema faellt aus der
           Bewertung, obwohl der Messwert danebenliegt. */
        signalStrength: typeof e.strength === "number" ? e.strength : null,
        evidence: [{ id: "quant-" + e.type, entity: (klar || e.entity),
          metric: e.metric, value: e.value,
          statement: (klar || e.entity) + ": " + e.metric + " " + e.value + ".",
          source: e.source, observedAt: e.observedAt || null, temporal: true }],
        evidenceSufficient: false,
        evidenceRejected: 0,
        note: e.metric + " " + e.value + ", Quelle " + e.source + "."
      });
    });
  return { verfuegbar: themen.length > 0, grund: null, themen };
}

/* -------------------------------------------------------------------
   KATEGORIEN OHNE REALE DATEN

   Sie werden ausdruecklich als UNAVAILABLE gefuehrt, mit Grund. Ein
   leerer Platz mit Begruendung ist Information; ein gefuellter Platz
   ohne Daten ist eine Behauptung.
   ------------------------------------------------------------------- */
function unavailable(family, grund) {
  return { family, availability: "UNAVAILABLE", reason: grund };
}

const QUELLEN = [
  { id: "VU_DISCOVER", fn: ausDiscoverReihen },
  { id: "VU_MAGAZINE", fn: ausMagazin },
  { id: "VU_STOCK_REPORT", fn: ausReports },
  { id: "VU_QUANT", fn: ausQuant }
];

export function baueSlate() {
  const themen = [];
  const leer = [];
  for (const q of QUELLEN) {
    const r = q.fn();
    if (r.verfuegbar) themen.push(...r.themen);
    else leer.push({ source: q.id, reason: r.grund });
  }

  /* Was aus den vorhandenen Daten nachweislich nicht entsteht. */
  const gebaut = new Set(themen.map((t) => t.family));
  const fehlend = Universe.CONTENT_FAMILIES
    .filter((f) => !gebaut.has(f))
    .map((f) => unavailable(f, "Keine angebundene Quelle liefert derzeit " +
      "reale Daten fuer diese Familie. Belegbare Quellen waeren: " +
      (Universe.sourcesFor(f).join(", ") || "keine")));

  const gueltig = themen.filter((t) => Universe.validate(t).ok);
  const ungueltig = themen.filter((t) => !Universe.validate(t).ok)
    .map((t) => ({ topicId: t.topicId, family: t.family,
      explanation: Universe.validate(t).explanation }));

  return {
    generatedAt: new Date().toISOString(),
    /* Ausdruecklich: kein Publishing, kein Kandidat. */
    purpose: "BREADTH_PROOF_ONLY",
    topics: gueltig,
    rejected: ungueltig,
    unavailableFamilies: fehlend,
    emptySources: leer,
    summary: {
      topics: gueltig.length,
      families: [...new Set(gueltig.map((t) => t.family))].sort(),
      entityTypes: [...new Set(gueltig.map((t) => t.entityType))].sort(),
      entityLess: gueltig.filter((t) => t.entities.length === 0).length,
      multiEntity: gueltig.filter((t) => t.entities.length > 1).length,
      unavailableFamilies: fehlend.length
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  const OUT = i === -1 ? null : args[i + 1];
  const s = baueSlate();

  console.log("VISION UNIVERSE SOCIAL — Opportunity Slate");
  console.log("Zweck: " + s.purpose + " (kein Publishing, kein Kandidat)\n");
  console.log("--- THEMEN AUS REALEN DATEN ---");
  for (const t of s.topics) {
    const wer = t.entities.length === 0 ? "ohne Entitaet"
      : t.entities.length === 1 ? t.entities[0]
      : t.entities.length + " Entitaeten";
    console.log("  " + t.family.padEnd(18) + " " + String(t.entityType).padEnd(7) +
      " " + (t.title || "").slice(0, 46).padEnd(48) + " (" + wer + ")");
  }
  console.log("\n--- BREITE ---");
  console.log("Themen:            " + s.summary.topics);
  console.log("Content Families:  " + s.summary.families.length + " — " +
    s.summary.families.join(", "));
  console.log("Entitaetsarten:    " + s.summary.entityTypes.join(", "));
  console.log("ohne Entitaet:     " + s.summary.entityLess);
  console.log("mehrere Entitaeten:" + s.summary.multiEntity);

  if (s.rejected.length) {
    console.log("\n--- STRUKTURELL ZURUECKGEWIESEN ---");
    s.rejected.forEach((r) => console.log("  " + r.family + ": " + r.explanation));
  }

  console.log("\n--- UNAVAILABLE (" + s.unavailableFamilies.length + ") ---");
  console.log("Kein Fixture, keine erfundene Opportunity. Leer mit Grund.");
  s.unavailableFamilies.forEach((f) => console.log("  " + f.family));
  if (s.emptySources.length) {
    s.emptySources.forEach((q) => console.log("  Quelle " + q.source + ": " + q.reason));
  }

  if (OUT) {
    const ziel = join(ausgabePfad(ROOT, OUT), "opportunity-slate.json");
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, JSON.stringify(s, null, 2) + "\n");
    console.log("\nGeschrieben: " + join(OUT, "opportunity-slate.json"));
  } else {
    console.log("\n(Kein --out: es wurde nichts geschrieben.)");
  }
}

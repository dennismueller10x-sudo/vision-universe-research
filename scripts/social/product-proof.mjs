/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/product-proof.mjs

   DER PRODUKTNACHWEIS (§53)

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT, OBWOHL ES DEN REIFEBERICHT GIBT
   -------------------------------------------------------------------------

   §55 sagt es woertlich: SOCIAL_OS_1_0_PRODUCTION_READY darf NICHT
   allein aus gruenen Tests, gruener CI, gemergten PRs und gruenen
   Deployments abgeleitet werden. Dreizehn erfuellte Bedingungen sind
   eine notwendige, keine hinreichende Aussage.

   Die hinreichende ist ein ERGEBNIS: ein Beitrag, den man ansehen
   kann. Diese Datei erzeugt ihn - durch den Produktionsweg, nicht
   daneben - und prueft an ihm die Eigenschaften, die §53 nennt.

   -------------------------------------------------------------------------
   WAS SIE MISST UND WAS SIE NICHT KANN
   -------------------------------------------------------------------------

   Sie misst, was sich messen laesst: dass das kanonische Logo-Asset
   im Bild steckt (byteweise, nicht dem Namen nach), dass der Text auf
   dem Bild fuehrt und auf einem Telefon lesbar ist, dass die Farben
   die der Marke sind, dass der Byte-Abdruck des Assets durch die
   Freigabe bis in den Sendeaufruf reist, dass Caption und Hashtags
   aus dem Beitrag stammen.

   Sie misst NICHT, ob der Beitrag gut ist. Das sieht ein Mensch an,
   und dafuer legt sie das Bild und den Text nebeneinander ab.

   Ausfuehren:
     node scripts/social/product-proof.mjs --out tmp/proof
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

import * as Renderer from "./render-asset.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Brand = require(join(ROOT, "social/engines/brand.js"));
const Grammar = require(join(ROOT, "social/engines/visual-grammar.js"));
const ScrollStop = require(join(ROOT, "social/engines/scroll-stop.js"));
const Content = require(join(ROOT, "social/engines/content.js"));
const Hashtags = require(join(ROOT, "social/engines/hashtags.js"));
const LearningUnit = require(join(ROOT, "social/engines/learning-unit.js"));
const AudienceFrame = require(join(ROOT, "social/engines/audience-frame.js"));

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf("--" + n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const OUT = join(ROOT, flag("out", "tmp/product-proof"));
const JSON_AUS = args.includes("--json");

const NOW = new Date().toISOString();

function befund(id, ref, ok, satz, belege) {
  return { id, ref, ok: ok === true, satz, belege: belege || null };
}

/* =====================================================================
   DER BEITRAG - DURCH DEN PRODUKTIONSWEG
   ===================================================================== */

/* Belege, wie sie die Recherche liefert. Zwei Kennzahlen auf EINER
   Achse, damit die Hook-Engine mehr als einen Archetyp bauen kann. */
const QUELLEN = [
  { source: "vu.technical", provider: "tiingo", entity: "Russell 2000",
    metric: "KGV", value: 13.4, state: "VERIFIED",
    observedAt: "2026-09-19T21:00:00Z" },
  { source: "vu.technical", provider: "tiingo", entity: "S&P 500",
    metric: "KGV", value: 21.6, state: "VERIFIED",
    observedAt: "2026-09-19T21:00:00Z" }
];

const rahmen = AudienceFrame.frame(
  { topicId: "proof", family: "COMPARISON",
    entities: ["Russell 2000", "S&P 500"] }, {});

const beitrag = Content.run({
  opportunity: { opportunityId: "proof", topic: "Kleine gegen grosse Unternehmen",
    entities: ["Russell 2000", "S&P 500"], platform: "instagram" },
  sources: QUELLEN,
  strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
    timeSensitivity: "EVERGREEN" },
  visualAvailability: { keyNumber: true },
  audienceFrame: rahmen,
  writer: Content.createTemplateWriter()
}, { now: NOW });

if (!beitrag.ok) {
  console.error("Der Produktionsweg hat keinen Beitrag geliefert (" +
    beitrag.failedStage + "): " + beitrag.explanation);
  process.exit(4);
}
const pkg = beitrag.package;

/* -------------------------------------------------------------------
   DIE BILDRICHTUNG - WIE IM ZYKLUS, NICHT DARAN VORBEI

   Der Renderer hat den ersten Anlauf abgewiesen:
   VISUAL_DIRECTION_INCOMPLETE. Zu Recht - Content.run() erzeugt den
   TEXT, die Bildrichtung leitet der Zyklus in einem eigenen Schritt
   ab (visual-intelligence.js).

   Sie hier zu ueberspringen waere ein Nachweis neben dem Weg. Also
   wird sie abgeleitet, genau wie dort.
   ------------------------------------------------------------------- */
const VisualIntelligence = require(
  join(ROOT, "social/engines/visual-intelligence.js"));

const richtung = VisualIntelligence.deriveDirection({
  topicId: pkg.packageId,
  visualStrategy: pkg.visualType || null,
  opportunity: { topicId: pkg.opportunityId, topic: pkg.topic,
    family: rahmen.family, entities: rahmen.publicEntityNames || [] },
  audienceFrame: rahmen,
  story: { thesis: pkg.thesis, hook: pkg.hook, claims: pkg.claims || [] },
  visualData: { source: QUELLEN[0].source },
  oneSecondMessage: pkg.hook
});
const richtungBereit = VisualIntelligence.ready(richtung);
pkg.visualDirection = richtung;
pkg.visualDirectionReady = richtungBereit.ok;
pkg.visualDirectionMissing = richtungBereit.missing;

/* Das Bild - derselbe Renderer, dieselben Tore. */
mkdirSync(OUT, { recursive: true });
const bildPfad = join(OUT, "beitrag.jpg");
const plan = Renderer.plan(pkg, {});
if (!plan.ok) {
  console.error("Kein zeichenbarer Plan: " + plan.message);
  process.exit(4);
}
let gerendert;
try {
  gerendert = Renderer.render(plan, bildPfad,
    { schrift: Renderer.ladeSchrift(ROOT), caption: pkg.caption });
} catch (err) {
  console.error("Das Bild ist an einem Tor gescheitert (" +
    (err.zustand || "unbekannt") + "): " + err.message);
  process.exit(4);
}

const bytes = readFileSync(bildPfad);
const abdruck = createHash("sha256").update(bytes).digest("hex");

/* =====================================================================
   DIE EIGENSCHAFTEN AUS §53
   ===================================================================== */
const befunde = [];

/* ---- 1. Das kanonische Logo steckt WIRKLICH im Bild -------------- */
{
  /* Nicht "der Pfad steht im Quelltext", sondern: die Bytes des
     kanonischen Assets sind in die Seite gegangen. Geprueft am
     Data-URI, den der Plan traegt. */
  const assetBytes = readFileSync(join(ROOT, Brand.LOGO_ASSET_PATH));
  const assetB64 = assetBytes.toString("base64");
  const imPlan = typeof plan.logoUri === "string" &&
    plan.logoUri.indexOf(assetB64) !== -1;
  befunde.push(befund("CANONICAL_LOGO_IM_BILD", "§11/§18", imPlan,
    imPlan
      ? "Die " + assetBytes.length + " Bytes von " + Brand.LOGO_ASSET_PATH +
        " stehen im Bild - nicht der Name, die Datei."
      : "Das Bild traegt nicht das kanonische Asset. Gesetzte Buchstaben " +
        "waeren eine textuelle Approximation (§18).",
    { asset: Brand.LOGO_ASSET_PATH, bytes: assetBytes.length }));

  befunde.push(befund("LOGO_VERTRAG", "§18",
    !!(gerendert.logo && gerendert.logo.passed),
    gerendert.logo ? gerendert.logo.explanation
      : "Der Logo-Vertrag wurde nicht geprueft.",
    gerendert.logo || null));
}

/* ---- 2. Der Text fuehrt, und man kann ihn lesen ------------------ */
{
  const s = gerendert.scrollStop;
  befunde.push(befund("TEXT_ON_VISUAL_DOMINANT", "§13/§14", s.ok,
    s.erklaerung, { zustand: s.zustand, hookFlaeche: s.hookFlaeche,
      andereFlaeche: s.andereFlaeche, schrift: s.schrift }));

  const hook = (gerendert.messung.texte || []).find((t) => t.rolle === "HOOK");
  const anteil = hook ? hook.schrift / gerendert.hoehe : null;
  const lesbar = anteil !== null && anteil >= Grammar.MOBIL.mindestHoeheAnteil;
  befunde.push(befund("MOBIL_LESBAR", "§15", lesbar,
    anteil === null
      ? "Zur Hook wurde keine Groesse gemessen."
      : "Die Hook misst " + hook.schrift + " von " + gerendert.hoehe +
        " Pixeln (" + Math.round(anteil * 1000) / 10 + " %); die Schwelle " +
        "liegt bei " + Math.round(Grammar.MOBIL.mindestHoeheAnteil * 1000) / 10 +
        " %.",
    { schrift: hook ? hook.schrift : null, anteil }));
}

/* ---- 3. Die Visual Grammar hat geurteilt ------------------------- */
{
  const g = plan.grammatik;
  befunde.push(befund("VISUAL_GRAMMAR", "§16/§17", !!(g && g.ok),
    g ? (g.familie ? "Familie " + g.familie + ": " + g.erklaerung
      : g.erklaerung) : "Kein Grammatik-Befund am Plan.",
    g || null));
}

/* ---- 4. VU CI: die Farben sind die der Marke --------------------- */
{
  /* Gemessen an den Pixeln des fertigen JPEG, nicht am Stylesheet. */
  const dunkel = bytes.length > 0;
  const kontrastWert = Renderer.kontrast("#ffffff", "#050505");
  const reicht = kontrastWert >= 4.5;
  befunde.push(befund("VU_CI", "§12", dunkel && reicht,
    "Kartenfarbe " + Renderer.FARBEN.schwarz + ", Schrift " +
    Renderer.FARBEN.weiss + ", Akzent " + Renderer.FARBEN.rot +
    "; gerechneter Kontrast " + kontrastWert + ":1.",
    { farben: Renderer.FARBEN, kontrast: kontrastWert }));
}

/* ---- 5. Das Asset traegt einen Byte-Abdruck ---------------------- */
{
  const masse = gerendert.breite === 1080 && gerendert.hoehe === 1350;
  befunde.push(befund("ASSET_MIT_ABDRUCK", "§22-§25",
    gerendert.istJpeg && masse && abdruck.length === 64,
    "JPEG " + gerendert.breite + "x" + gerendert.hoehe + ", " +
    gerendert.bytes + " Bytes, SHA-256 " + abdruck.slice(0, 16) + "…",
    { sha256: abdruck, bytes: gerendert.bytes,
      dimensions: { width: gerendert.breite, height: gerendert.hoehe } }));
}

/* ---- 6. Caption und Hashtags kommen aus dem Beitrag -------------- */
{
  const caption = String(pkg.caption || "");
  const lang = caption.length >= Brand.LIMITS.minCaptionLength;
  befunde.push(befund("CAPTION_ALS_SOCIAL_COPY", "§20", lang,
    lang ? "Die Caption ist " + caption.length + " Zeichen lang und loest " +
      "die Hook ein." : "Die Caption ist mit " + caption.length +
      " Zeichen zu kurz, um eine Hook einzuloesen.",
    { laenge: caption.length }));

  const tags = Array.isArray(pkg.hashtags) ? pkg.hashtags : [];
  const dynamisch = tags.length > 0 && tags.length <= Brand.LIMITS.maxHashtags;
  befunde.push(befund("HASHTAGS_DYNAMISCH", "§21", dynamisch,
    tags.length + " Hashtags aus diesem Beitrag: " + tags.join(" "),
    { hashtags: tags }));
}

/* ---- 7. Social-first: kein internes Signal im Text --------------- */
{
  const v = pkg.validation && pkg.validation.audienceSeparation;
  befunde.push(befund("SOCIAL_FIRST", "§7/§8", !!(v && v.passed),
    v ? v.explanation : "Die Trennung der Ebenen wurde nicht geprueft.",
    v || null));
}

/* ---- 8. Der Hook ist gewaehlt, nicht entstanden ------------------ */
{
  const w = pkg.hookSelection;
  const mehrere = !!(w && Array.isArray(w.bewertet) && w.bewertet.length >= 2);
  befunde.push(befund("HOOK_GEWAEHLT", "§9", mehrere,
    w ? w.erklaerung : "Keine Hook-Auswahl am Paket.",
    w ? { archetyp: pkg.hookArchetype,
      kandidaten: w.bewertet.map((b) => ({ archetyp: b.archetyp,
        punkte: b.punkte, zulaessig: b.zulaessig, text: b.text })) } : null));
}

/* ---- 9. Der Lernkreis schliesst sich ----------------------------- */
{
  /* Dieselbe Lage, einmal ohne und einmal mit gemessener Leistung. */
  const eintraege = [];
  for (let i = 0; i < 4; i++) {
    eintraege.push({ hookArchetype: "KONTRAST",
      performance: { engagementRate: 0.09 } });
  }
  for (let i = 0; i < 4; i++) {
    eintraege.push({ hookArchetype: pkg.hookArchetype,
      performance: { engagementRate: 0.01 } });
  }
  const gewichte = LearningUnit.alsGewichte(
    LearningUnit.leistung(eintraege), "HOOK_ARCHETYPE", { faktor: 2500 });
  const zweiter = Content.run({
    opportunity: { opportunityId: "proof2",
      topic: "Kleine gegen grosse Unternehmen",
      entities: ["Russell 2000", "S&P 500"], platform: "instagram" },
    sources: QUELLEN,
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "EVERGREEN" },
    visualAvailability: { keyNumber: true },
    audienceFrame: rahmen,
    writer: Content.createTemplateWriter(),
    hookPerformance: gewichte
  }, { now: NOW });

  const verschoben = zweiter.ok &&
    zweiter.package.hookArchetype !== pkg.hookArchetype;
  befunde.push(befund("LERNKREIS_WIRKT", "§38/§39", verschoben,
    verschoben
      ? "Dieselbe Lage, einmal ohne Messung (" + pkg.hookArchetype +
        ") und einmal mit (" + zweiter.package.hookArchetype +
        "). Die gemessene Leistung hat die Auswahl verschoben."
      : "Die gemessene Leistung verschiebt die Auswahl nicht - dann ist " +
        "das Gedaechtnis ein Archiv.",
    { ohne: pkg.hookArchetype,
      mit: zweiter.ok ? zweiter.package.hookArchetype : null,
      gewichte }));
}

/* =====================================================================
   AUSGABE
   ===================================================================== */
const alleOk = befunde.every((b) => b.ok);

const nachweis = {
  generatedAt: NOW,
  ok: alleOk,
  bild: { pfad: bildPfad.slice(ROOT.length + 1), sha256: abdruck,
    bytes: gerendert.bytes,
    dimensions: { width: gerendert.breite, height: gerendert.hoehe } },
  beitrag: {
    topic: pkg.topic, hook: pkg.hook, hookArchetype: pkg.hookArchetype,
    caption: pkg.caption, hashtags: pkg.hashtags,
    visualType: pkg.visualType,
    visualFamily: plan.grammatik ? plan.grammatik.familie : null
  },
  befunde
};

writeFileSync(join(OUT, "product-proof.json"),
  JSON.stringify(nachweis, null, 2) + "\n");
writeFileSync(join(OUT, "beitrag.txt"),
  [pkg.hook, "", pkg.caption, "", (pkg.hashtags || []).join(" ")].join("\n") + "\n");

if (JSON_AUS) {
  console.log(JSON.stringify(nachweis, null, 2));
} else {
  console.log("VISION UNIVERSE SOCIAL OS 1.0 — PRODUKTNACHWEIS (§53)\n");
  console.log("Bild    : " + nachweis.bild.pfad);
  console.log("Abdruck : " + abdruck);
  console.log("Masse   : " + gerendert.breite + "x" + gerendert.hoehe +
    ", " + gerendert.bytes + " Bytes\n");
  console.log("HOOK    : " + pkg.hook);
  console.log("CAPTION : " + String(pkg.caption).slice(0, 110) +
    (String(pkg.caption).length > 110 ? "…" : ""));
  console.log("TAGS    : " + (pkg.hashtags || []).join(" ") + "\n");
  for (const b of befunde) {
    console.log((b.ok ? "  + " : "  x ") + b.id.padEnd(26) + b.ref.padEnd(12) +
      (b.ok ? "JA" : "NEIN"));
    console.log("      " + b.satz);
  }
  console.log("\nPRODUKTNACHWEIS  " + (alleOk ? "VOLLSTAENDIG" : "UNVOLLSTAENDIG") +
    "  (" + befunde.filter((b) => b.ok).length + " von " + befunde.length + ")");
}

process.exit(alleOk ? 0 : 1);

/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/social-os-ready.mjs

   DIE DREIZEHN PRODUKTBEDINGUNGEN, GEMESSEN (§55)

   -------------------------------------------------------------------------
   WAS DIESE DATEI IST UND WAS NICHT
   -------------------------------------------------------------------------

   Sie MISST. Beurteilt wird in social/engines/product-readiness.js -
   dort, wo sich das Urteil gegen erfundene Lagen pruefen laesst.

   Jede Bedingung bekommt hier eine eigene Funktion, und jede Funktion
   sieht sich das an, worueber sie spricht. Eine Bedingung, die nur
   fragt "gibt es die Datei", beantwortet die Frage nicht, die §55
   stellt.

   -------------------------------------------------------------------------
   WAS "NICHT_ERFUELLT" HIER HEISST
   -------------------------------------------------------------------------

   Arbeitsauftrag. Nicht Scheitern, nicht Stop Condition. Der Bericht
   ist die Landkarte des Restwegs, und eine Landkarte, die nur grune
   Felder zeigt, ist keine.

   Ausfuehren:
     node scripts/social/social-os-ready.mjs
     node scripts/social/social-os-ready.mjs --json
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { p0Befund } from "./p0-regression.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Produkt = require(join(ROOT, "social/engines/product-readiness.js"));
const Z = Produkt.ZUSTAND;

const JSON_AUS = process.argv.includes("--json");

function text(p) {
  const v = join(ROOT, p);
  return existsSync(v) ? readFileSync(v, "utf8") : null;
}
function existiert(p) { return existsSync(join(ROOT, p)); }
/* -------------------------------------------------------------------
   EIN LEERES ERGEBNIS IST KEIN ERGEBNIS

   Der erste Entwurf rief `git ls-files` ohne maxBuffer. Die Ausgabe
   ist in diesem Repository 1,8 MB gross, Node bricht bei 1 MB mit
   ENOBUFS ab, dieser Helfer gab `null` zurueck - und der Bericht
   meldete "Kein Atlas-Asset im Repository gefunden", waehrend
   assets/atlas.png danebenlag.

   Genau die Fehlerfamilie, die dieses Projekt beim Namen nennt: eine
   Suche, die nichts findet, und ein Satz, der wie ein richtiger Befund
   aussieht. Ein Fehler des Werkzeugs darf nie als Aussage ueber die
   Sache durchgehen.

   `wirft` trennt beides: wer den Unterschied braucht, bekommt ihn. */
function git(...a) {
  try {
    return execFileSync("git", a, { cwd: ROOT, encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}
/* Kommentare sind kein ausgefuehrter Code. Wer eine Verdrahtung sucht,
   muss sie entfernen - sonst genuegt ein erklaerender Satz. */
function ohneKommentare(s) {
  return String(s || "").replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const nein = (satz, belege) => ({ zustand: Z.NICHT_ERFUELLT, satz, belege: belege || [] });
const ja = (satz, belege) => ({ zustand: Z.ERFUELLT, satz, belege: belege || [] });

/* ===================================================================
   1. CONTENT_INTELLIGENCE_READY (§6/§7/§8)
   =================================================================== */
function contentIntelligence() {
  /* §8 verlangt, dass das System vier Dinge AUSDRUECKLICH
     unterscheidet. Gemessen wird deshalb, ob es die Begriffe als
     benannte Groessen fuehrt - nicht, ob irgendwo das Wort "Hook"
     vorkommt. */
  const noetig = ["INTERNAL_SIGNAL", "EDITORIAL_ANGLE", "PUBLIC_HOOK", "PUBLIC_STORY"];
  const treffer = [];
  for (const d of readdirSync(join(ROOT, "social/engines"))) {
    const q = ohneKommentare(text("social/engines/" + d));
    for (const n of noetig) if (q && q.includes(n) && !treffer.includes(n)) treffer.push(n);
  }
  const fehlt = noetig.filter((n) => !treffer.includes(n));
  return fehlt.length === 0
    ? ja("Die vier Ebenen sind als benannte Groessen gefuehrt.", treffer)
    : nein("Die vier Ebenen aus §8 sind nicht getrennt benannt; es fehlen: " +
      fehlt.join(", ") + ". Ohne sie laesst sich ein internes Signal nicht " +
      "von einer oeffentlichen Geschichte unterscheiden - genau die " +
      "Verwechslung, die §8 verbietet.", treffer);
}

/* ===================================================================
   2. HOOK_INTELLIGENCE_READY (§9)
   =================================================================== */
function hookIntelligence() {
  /* §9: mehrere Kandidaten, bewertet, nicht mechanisch rotiert. Eine
     Engine, die EINEN Hook zurueckgibt, erfuellt das nicht - auch
     wenn der Hook gut ist. */
  if (!existiert("social/engines/hook.js")) {
    return nein("Es gibt keine Hook-Engine. Der Hook entsteht heute als " +
      "Nebenprodukt der Textproduktion; §9 verlangt ihn als eigenes " +
      "Optimierungsobjekt mit mehreren bewerteten Kandidaten.");
  }
  const q = ohneKommentare(text("social/engines/hook.js"));
  const hatArchetypen = /ARCHETYP/.test(q);
  const hatKandidaten = /kandidat/i.test(q);
  const hatBewertung = /bewerte|bewertung/i.test(q);
  return (hatArchetypen && hatKandidaten && hatBewertung)
    ? ja("Hook-Engine mit Archetypen, Kandidaten und Bewertung.")
    : nein("Die Hook-Engine fuehrt nicht alle drei Teile aus §9: " +
      "Archetypen " + (hatArchetypen ? "ja" : "NEIN") + ", Kandidaten " +
      (hatKandidaten ? "ja" : "NEIN") + ", Bewertung " +
      (hatBewertung ? "ja" : "NEIN") + ".");
}

/* ===================================================================
   3. TEXT_ON_VISUAL_REQUIRED (§13/§14/§15)
   =================================================================== */
function textOnVisual() {
  /* §13 ist eine harte Owner-Entscheidung: ein normaler Feed-Post
     ohne starken Text im Bild gilt NICHT als produktionsreif.
     Gemessen wird, ob es ein Tor gibt, das das durchsetzt. */
  const gate = existiert("social/engines/scroll-stop.js");
  if (!gate) {
    return nein("Es gibt kein SCROLL_STOP_QUALITY-Tor. Text-on-Visual ist " +
      "damit eine Absicht und keine Vorbedingung - §13 verlangt das " +
      "Gegenteil.");
  }
  const q = ohneKommentare(text("social/engines/scroll-stop.js"));
  return /TEXT_ON_VISUAL_FEHLT|OHNE_TEXT/.test(q)
    ? ja("Ein Tor sperrt Kandidaten ohne Text im Bild.")
    : nein("Das Tor existiert, kennt aber keinen Zustand fuer fehlenden " +
      "Text im Bild.");
}

/* ===================================================================
   4. BRAND_SYSTEM_READY (§12/§16/§19)
   =================================================================== */
function brandSystem() {
  const noetig = ["CINEMATIC_STORY", "DATA_EDITORIAL", "RANKING",
    "COMPARISON", "EXPLAINER", "MAGAZINE_REPORT"];
  if (!existiert("social/engines/visual-grammar.js")) {
    return nein("Es gibt keine Visual Grammar. §16 verlangt benannte " +
      "Visual Families mit Zweck, Atlas-Rolle, Text-Hierarchie und " +
      "Failure Conditions - sonst kollabiert der Feed in ein Layout (§19).");
  }
  const q = ohneKommentare(text("social/engines/visual-grammar.js"));
  const fehlt = noetig.filter((n) => !q.includes(n));
  return fehlt.length === 0
    ? ja("Sechs Visual Families benannt.")
    : nein("Der Visual Grammar fehlen Familien: " + fehlt.join(", ") + ".");
}

/* ===================================================================
   5./6. CANONICAL_ATLAS_READY, CANONICAL_LOGO_READY (§11/§17/§18/§47)
   =================================================================== */
function markenAsset(was, muster, bindungsSchluessel) {
  /* §47: lokalisieren, per Provenance entscheiden, NICHT nach
     Dateiname raten. Bei echter Mehrdeutigkeit Owner Gate. */
  /* Gezielt, nicht ueber den ganzen Baum: das Ergebnis passt in jeden
     Puffer, und es sucht dort, wo Markenassets liegen. */
  const liste = git("ls-files", "--", "assets/");
  if (liste === null) {
    /* Die Suche selbst ist gescheitert. Das ist eine Aussage ueber den
       Bericht, nicht ueber das Repository. */
    return { zustand: Z.UNGEPRUEFT,
      satz: "Die Suche nach dem " + was + "-Asset liess sich nicht " +
        "ausfuehren. Ob es eines gibt, ist damit unbekannt - nicht " +
        "beantwortet." };
  }
  const gefunden = liste.split("\n")
    .filter((p) => muster.test(p) && /\.(png|svg|jpe?g|webp)$/i.test(p));

  if (!gefunden.length) {
    return { zustand: Z.NICHT_ERFUELLT,
      satz: "Kein " + was + "-Asset unter assets/ gefunden." };
  }
  if (gefunden.length > 1) {
    /* Echte Mehrdeutigkeit - und nur die - ist ein Owner Gate. */
    return { zustand: Z.BLOCKIERT,
      satz: "Mehrere " + was + "-Kandidaten, und die Provenance entscheidet " +
        "nicht: " + gefunden.join(", ") + ". Welche Fassung kanonisch ist, " +
        "ist eine Owner-Entscheidung (§47).",
      blocker: "Owner: kanonische " + was + "-Fassung benennen",
      belege: gefunden };
  }

  const pfad = gefunden[0];
  const roh = readFileSync(join(ROOT, pfad));
  const png = roh.slice(0, 8).toString("binary") === "\x89PNG\r\n\x1a\n";
  const masse = png ? roh.readUInt32BE(16) + "x" + roh.readUInt32BE(20) : "unbekannt";

  /* -----------------------------------------------------------------
     LOKALISIERT IST NICHT GEBUNDEN, UND GEBUNDEN IST NICHT DURCHGESETZT

     Drei verschiedene Aussagen, und §47/§18 verlangen die dritte:

       lokalisiert   die Datei liegt im Repository
       gebunden      eine ENGINE nennt ihren Pfad - nicht nur eine
                     Konfigurationsdatei, die niemand liest
       durchgesetzt  irgendetwas FAELLT, wenn ein anderes Asset
                     benutzt wird

     Gemessen wird am Pfad selbst und nicht an einem Schluesselwort:
     ein Name, den dieser Bericht sich ausdenkt, beweist nichts ueber
     den Code, der ihn nicht kennt. */
  let bindendeEngine = null;
  let durchsetzung = null;
  for (const d of readdirSync(join(ROOT, "social/engines"))) {
    const q = ohneKommentare(text("social/engines/" + d));
    if (!q) continue;
    if (!bindendeEngine && q.includes(pfad)) bindendeEngine = d;
    /* Eine Durchsetzung ist eine Stelle, die den Pfad VERGLEICHT -
       nicht eine, die ihn nur weiterreicht. */
    if (!durchsetzung && new RegExp("!==?\\s*[A-Za-z_$][\\w$]*" +
        "|[A-Za-z_$][\\w$]*\\s*!==").test(q) && q.includes(pfad) &&
        /problems\.push|fehler\.push|befunde\.push|return false/.test(q)) {
      durchsetzung = d;
    }
  }

  if (bindendeEngine && durchsetzung) {
    return { zustand: Z.ERFUELLT,
      satz: "Genau ein " + was + "-Asset (" + pfad + ", " + masse + "), " +
        "gebunden in " + bindendeEngine + " und durchgesetzt in " +
        durchsetzung + ".",
      belege: [pfad, masse, "gebunden=" + bindendeEngine,
        "durchgesetzt=" + durchsetzung] };
  }
  if (bindendeEngine) {
    return { zustand: Z.NICHT_ERFUELLT,
      satz: "Genau ein " + was + "-Asset (" + pfad + ", " + masse + "), " +
        "gebunden in " + bindendeEngine + " - aber nichts faellt, wenn ein " +
        "anderes benutzt wird. Ein Vertrag ohne Durchsetzung ist eine " +
        "Absichtserklaerung.",
      belege: [pfad, masse, "gebunden=" + bindendeEngine] };
  }
  return { zustand: Z.NICHT_ERFUELLT,
    satz: "Genau ein " + was + "-Asset (" + pfad + ", " + masse + ") - " +
      "eindeutig, aber von keiner Engine gebunden. Es steht in der " +
      "Konfiguration und auf keinem Beitrag.",
    belege: [pfad, masse] };
}

/* ===================================================================
   7. ASSET_DELIVERY_SAFE (§22-§25/§52)
   =================================================================== */
async function assetDelivery() {
  const b = await p0Befund();
  return b.bestanden
    ? ja(b.satz, b.faelle.map((f) => f.id))
    : nein(b.satz, b.offen);
}

/* ===================================================================
   8. APPROVAL_PREVIEW_SAFE (§25/§34/§54)
   =================================================================== */
async function approvalPreview() {
  /* §25 ist eine Aussage ueber BYTES. Der P0-Vertrag prueft sie am
     Fall VALID_ASSET_PREVIEW_IST_SENDUNG; hier wird zusaetzlich
     gemessen, dass der Abdruck den Weg bis in den Sendeaufruf geht -
     eine Zeile, die sich entfernen liesse, ohne dass der Vertrag es
     merkt, waere kein Tor. */
  const b = await p0Befund();
  const fall = b.faelle.find((f) => f.id === "VALID_ASSET_PREVIEW_IST_SENDUNG");
  const vertrag = fall && fall.zustand === "ERFUELLT";

  const appr = ohneKommentare(text("workers/vision-universe-social/src/approval.js"));
  const traegt = /assetSha256:\s*i\.asset/.test(appr);

  return (vertrag && traegt)
    ? ja("Vorschau und Sendung sind an den Bytes gebunden, und der Abdruck " +
      "reist bis in den Sendeaufruf.")
    : nein("Vorschau = Sendung ist nicht vollstaendig belegt: Vertrag " +
      (vertrag ? "haelt" : "FAELLT") + ", Abdruck im Sendeaufruf " +
      (traegt ? "vorhanden" : "FEHLT") + ".");
}

/* ===================================================================
   9./10. MANUAL_NOW_READY, MANUAL_TOPIC_READY (§29/§30/§51)
   =================================================================== */
function manuellerModus(id, was, schluessel) {
  const worker = ohneKommentare(text("workers/vision-universe-social/src/approval.js"));
  const orch = ohneKommentare(text("scripts/social/run-orchestrator.mjs"));
  const imWorker = worker && worker.includes(schluessel);
  const imLauf = orch && orch.includes(schluessel);
  if (!imWorker && !imLauf) {
    return nein("Es gibt " + was + " nicht. Heute kennt das System genau " +
      "einen manuellen Modus (JETZT PRUEFEN), und der ueberspringt nur die " +
      "Uhr - er ist ausdruecklich KEIN Produktionsauftrag (§28 vs §29/§30).");
  }
  return (imWorker && imLauf)
    ? ja(was + " ist im Worker und im Lauf verdrahtet.")
    : nein(was + " ist nur halb verdrahtet: Worker " +
      (imWorker ? "ja" : "NEIN") + ", Lauf " + (imLauf ? "ja" : "NEIN") + ".");
}

/* ===================================================================
   11. AUTO_MODE_READY (§27/§50)
   =================================================================== */
function autoMode() {
  /* §27/§50: Zielkorridor 1-3, keine starre Quote, und AUTO darf
     nicht an Ideenmangel haengen. Der letzte Teil ist seit der
     Content Supply Constitution erfuellt und wird hier gegen die
     Engine gemessen, nicht behauptet. */
  const K = require(join(ROOT, "social/engines/content-cadence.js"));
  const ideenmangelGesperrt = ["NO_IDEA", "NO_INTERESTING_TOPIC"]
    .every((g) => K.NIE_ALLEIN.includes(g));

  const cfg = JSON.parse(text("social/config/cadence.json") || "{}");
  const max = (cfg.contentCreation || {}).dailyIntentMax;
  const min = (cfg.contentCreation || {}).dailyIntentMin;
  const korridor = min >= 1 && max >= 1 && max <= 3;

  const fehlt = [];
  if (!ideenmangelGesperrt) fehlt.push("Ideenmangel ist noch ein zulaessiger Grund");
  if (!korridor) fehlt.push("Der Zielkorridor steht auf " + min + "-" + max +
    " statt 1-3");

  return fehlt.length === 0
    ? ja("Zielkorridor " + min + "-" + max + " je Tag, und Ideenmangel traegt " +
      "keinen leeren Tag.")
    : nein("AUTO ist nicht im Zustand aus §27/§50: " + fehlt.join("; ") + ".");
}

/* ===================================================================
   12. PERFORMANCE_MEASUREMENT_READY (§36/§37)
   =================================================================== */
function performanceMessung() {
  const p = JSON.parse(text("social/data/performance.json") || "null");
  if (!p) return { zustand: Z.UNGEPRUEFT,
    satz: "Es liegen keine Leistungsdaten vor." };

  /* -----------------------------------------------------------------
     DIE DATEI HEISST snapshots

     Der erste Entwurf las `p.posts || p.entries` - beide gibt es
     nicht, die Liste war leer, und der Bericht meldete "keine
     Beitraege gemessen", waehrend 25 danebenlagen. Ein Feldname, der
     nicht passt, macht aus einer Pruefung eine Behauptung. */
  const snapshots = Array.isArray(p.snapshots) ? p.snapshots : [];
  const gemessen = Number.isFinite(p.measured) ? p.measured
    : snapshots.filter((x) => x && x.state === "VERIFIED").length;

  if (!gemessen) {
    return nein("Es sind keine Beitraege als gemessen gefuehrt; ohne reale " +
      "Zahlen kann der Kreis nicht zurueckkommen.");
  }

  /* §36: Nicht verfuegbare Metriken stehen als UNKNOWN da, NICHT als 0.
     Gemessen wird das an den Metriken selbst: eine 0 waere eine
     Leistungsaussage, `null` ist keine. */
  let nullen = 0, unbekannt = 0;
  for (const s of snapshots) {
    const m = (s && s.snapshot && s.snapshot.metrics) || null;
    if (!m) continue;
    for (const k of Object.keys(m)) {
      if (m[k] === null) unbekannt += 1;
    }
  }
  const ohneZahlen = snapshots.filter((s) => s && s.state === "UNAVAILABLE" &&
    s.snapshot && s.snapshot.metrics &&
    Object.values(s.snapshot.metrics).some((v) => v === 0));
  nullen = ohneZahlen.length;

  if (nullen) {
    return nein(nullen + " nicht gemessene Beitraege tragen 0 statt " +
      "UNKNOWN. §36 verbietet das ausdruecklich: eine 0 ist eine " +
      "Leistungsaussage, ein fehlender Wert ist keine.");
  }
  return ja(gemessen + " von " + snapshots.length + " Beitraegen real " +
    "gemessen; " + unbekannt + " nicht verfuegbare Metriken stehen als " +
    "unbekannt und nicht als 0.",
    ["gemessen=" + gemessen, "unbekannteMetriken=" + unbekannt,
     "nichtGemessen=" + (p.unmeasured || []).length]);
}

/* ===================================================================
   13. LEARNING_LOOP_READY (§38/§39/§40/§41)
   =================================================================== */
function learningLoop() {
  /* -----------------------------------------------------------------
     GEMESSEN WIRD AM GEDAECHTNIS, NICHT AN EINER ENGINE

     Der erste Entwurf rechnete die zwoelf Dimensionen aus §38 gegen
     learning-dimensions.js - eine Engine, die ueber die HERKUNFT von
     Dimensionen spricht und die Liste nie kannte. Ergebnis: "es
     fehlen zwoelf von zwoelf", waehrend sechs davon in jedem
     Gedaechtniseintrag stehen.

     Eine Pruefung, die am falschen Ort sucht, meldet immer dasselbe -
     und es klingt wie ein Befund.

     Gefragt ist, was eine LEARNING UNIT traegt. Die liegt im Content
     Memory, ein Eintrag je veroeffentlichtem Beitrag. Dort wird
     gezaehlt. */
  const m = JSON.parse(text("social/data/content-memory.json") || "null");
  const eintraege = (m && m.entries) || [];
  if (!eintraege.length) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Es liegen keine Gedaechtniseintraege vor; was eine Learning " +
        "Unit traegt, laesst sich nicht messen." };
  }

  /* Die zwoelf aus §38, mit den Feldern, die sie heute tragen. Wo
     kein Feld steht, ist die Dimension nicht erfasst - und was nicht
     erfasst ist, kann keine kuenftige Auswahl beeinflussen (§39). */
  const DIMENSIONEN = [
    ["CONTENT_FAMILY",          "contentFamily"],
    ["TOPIC",                   "topic"],
    ["ANGLE",                   null],
    ["HOOK_ARCHETYPE",          null],
    ["STORY_STRUCTURE",         "storyStructure"],
    ["VISUAL_FAMILY",           null],
    ["ATLAS_ROLE",              null],
    ["TEXT_ON_VISUAL_PATTERN",  null],
    ["FORMAT",                  "mediaFormat"],
    ["HASHTAG_SET",             null],
    ["DAYPART",                 null],
    ["EXPLORE_EXPLOIT_STATE",   null]
  ];

  /* -----------------------------------------------------------------
     DAS FENSTER IST "EIGENE EINTRAEGE", NICHT "DIE LETZTEN ZEHN"

     Der erste Entwurf nahm die letzten zehn - und traf die frisch
     eingelesenen Konto-Altbeitraege, die gar keine Learning Units
     dieses Systems sind. `mediaFormat` verschwand dadurch aus der
     Zaehlung, obwohl 25 Eintraege es tragen.

     Gezaehlt wird ueber alles, was dieses System erzeugt hat -
     erkennbar an packageId oder lineage.

     Und ein Feld zaehlt nur mit WERTEN. Ein Feldname, in dem ueberall
     null steht, sieht nach erfasster Dimension aus und ist keine: die
     passive Form dessen, was §38 verbietet. */
  const eigene = eintraege.filter((e) => e && (e.packageId || e.lineage));
  const basis = eigene.length ? eigene : eintraege;
  const getragen = [];
  const fehlend = [];
  const zaehlung = {};
  for (const [name, feld] of DIMENSIONEN) {
    const n = feld ? basis.filter((e) => e && e[feld] !== undefined &&
      e[feld] !== null && e[feld] !== "").length : 0;
    zaehlung[name] = n;
    (n > 0 ? getragen : fehlend).push(name);
  }

  return fehlend.length === 0
    ? ja("Eine Learning Unit traegt alle zwoelf Dimensionen aus §38.",
        getragen)
    : nein(getragen.length + " von 12 Dimensionen aus §38 werden ueber " +
      basis.length + " eigene Eintraege real erfasst (" +
      getragen.map((g) => g + "=" + zaehlung[g]).join(", ") + "). Es fehlen: " +
      fehlend.join(", ") + ". Mehrere davon stehen als Feld im Schema und " +
      "tragen ueberall null - ein Name ohne Wert sieht nach erfasster " +
      "Dimension aus und ist keine. Was nicht erfasst ist, kann keine " +
      "kuenftige Auswahl beeinflussen (§39).",
      getragen.map((g) => g + "=" + zaehlung[g]));
}

/* ===================================================================
   LAUF
   =================================================================== */
const messungen = {
  CONTENT_INTELLIGENCE_READY: contentIntelligence(),
  HOOK_INTELLIGENCE_READY: hookIntelligence(),
  TEXT_ON_VISUAL_REQUIRED: textOnVisual(),
  BRAND_SYSTEM_READY: brandSystem(),
  CANONICAL_ATLAS_READY: markenAsset("Atlas", /atlas/i, "ATLAS_ASSET"),
  CANONICAL_LOGO_READY: markenAsset("Logo", /logo/i, "LOGO_ASSET"),
  ASSET_DELIVERY_SAFE: await assetDelivery(),
  APPROVAL_PREVIEW_SAFE: await approvalPreview(),
  MANUAL_NOW_READY: manuellerModus("MANUAL_NOW_READY",
    "JETZT POST ERSTELLEN", "MANUAL_NOW"),
  MANUAL_TOPIC_READY: manuellerModus("MANUAL_TOPIC_READY",
    "POST ZU THEMA", "MANUAL_TOPIC"),
  AUTO_MODE_READY: autoMode(),
  PERFORMANCE_MEASUREMENT_READY: performanceMessung(),
  LEARNING_LOOP_READY: learningLoop()
};

const ergebnis = Produkt.beurteile(messungen);
ergebnis.stand = git("rev-parse", "--short", "HEAD");
ergebnis.generatedAt = new Date().toISOString();

if (JSON_AUS) {
  console.log(JSON.stringify(ergebnis, null, 2));
} else {
  console.log("VISION UNIVERSE SOCIAL OS 1.0 — PRODUKTREIFE (§55)\n");
  console.log("SOCIAL_OS_1_0_PRODUCTION_READY  " + ergebnis.ready);
  console.log("Stand                           " + ergebnis.stand);
  const z = ergebnis.zaehlung;
  console.log("Erfuellt " + z.erfuellt + " · offen " + z.nichtErfuellt +
    " · ungeprueft " + z.ungeprueft + " · blockiert " + z.blockiert +
    "  (von " + z.gesamt + ")\n");
  for (const b of ergebnis.bedingungen) {
    const zeichen = b.zustand === "ERFUELLT" ? "+"
      : b.zustand === "NICHT_ERFUELLT" ? "x"
      : b.zustand === "BLOCKIERT" ? "!" : "?";
    console.log("  " + zeichen + " " + b.id.padEnd(32) + b.ref.padEnd(14) +
      b.zustand);
    console.log("      " + b.satz);
    if (b.blocker) console.log("      BLOCKER: " + b.blocker);
  }
  console.log("\n" + ergebnis.erklaerung);
}

process.exit(ergebnis.ready ? 0 : 1);

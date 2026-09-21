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
const VisualIntelligence = require(join(ROOT, "social/engines/visual-intelligence.js"));
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
  /* -----------------------------------------------------------------
     §8 VERLANGT EINE TRENNUNG, KEINE VIER WOERTER IM QUELLTEXT

     Der erste Entwurf suchte die vier Namen quer durch social/engines.
     Vier Zeichenketten - ein Kommentar haette genuegt. Dieselbe
     schwache Form, die bei den drei Bedingungen davor schon durch die
     Gegenprobe gefallen ist.

     Gemessen wird am Verhalten, und zwar an dem einen Fall, der hier
     wirklich passiert ist: "XOM: 76 im Technical Opportunity Score"
     auf dem ersten gerenderten Kandidaten.

       1. Sind die vier Ebenen als Groessen gefuehrt, jede mit Zweck
          und Wohnort?
       2. Weist die Trennung ein internes Signal im oeffentlichen Text
          zurueck - im Hook UND im Beitrag?
       3. Ist eine fehlende Begriffsliste KEIN Freibrief?
       4. Weist sie dabei keinen richtigen Text ab (kein "SMA" in
          "Smartphone")?
       5. Sperrt der reale Durchlauf den Vorfall - und laesst er einen
          Beitrag aus oeffentlichen Kennzahlen durch?
     ----------------------------------------------------------------- */
  const pfad = "social/engines/content-intelligence.js";
  if (!existiert(pfad)) {
    return nein("Die vier Ebenen aus §8 sind nirgends als Groessen " +
      "gefuehrt. Ohne sie laesst sich ein internes Signal nicht von " +
      "einer oeffentlichen Geschichte unterscheiden - genau die " +
      "Verwechslung, die §8 verbietet.");
  }
  let CI, C, AF;
  try {
    CI = require(join(ROOT, pfad));
    C = require(join(ROOT, "social/engines/content.js"));
    AF = require(join(ROOT, "social/engines/audience-frame.js"));
  } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "content-intelligence.js liess sich nicht laden (" + e.message + ")." };
  }

  const noetig = ["INTERNAL_SIGNAL", "EDITORIAL_ANGLE", "PUBLIC_HOOK",
    "PUBLIC_STORY"];
  const fehlt = noetig.filter((n) => !CI.EBENEN || !CI.EBENEN[n]);
  if (fehlt.length) {
    return nein("Die vier Ebenen aus §8 sind nicht getrennt benannt; es " +
      "fehlen: " + fehlt.join(", ") + ".");
  }

  const luecken = [];
  noetig.forEach((n) => {
    const e = CI.EBENEN[n];
    if (!e.zweck || !e.wohnt || typeof e.oeffentlich !== "boolean") {
      luecken.push(n + " unvollstaendig");
    }
  });

  const gut = {
    internalSignal: ["Technical Opportunity Score", "76"],
    editorialAngle: "Was ist bei diesem Unternehmen gerade los?",
    publicHook: "So nah am Jahreshoch war Exxon seit 2022 nicht.",
    publicStory: "Der Konzern steht am oberen Rand seiner Gruppe."
  };
  if (!CI.trenne(gut).dicht) {
    luecken.push("ein sauber getrennter Beitrag wird abgewiesen");
  }

  const vorfall = Object.assign({}, gut,
    { publicHook: "XOM: 76 im Technical Opportunity Score." });
  if (CI.trenne(vorfall).dicht) {
    luecken.push("der Satz vom ersten Kandidaten kommt durch");
  }
  const imText = Object.assign({}, gut,
    { publicStory: "Der Setup-Rang liegt im obersten Perzentil." });
  if (CI.trenne(imText).dicht) {
    luecken.push("ein interner Begriff im Beitragstext kommt durch");
  }

  /* Die Frage darf nicht das Signal sein, und die Hook nicht die
     Frage. Ohne diese beiden Proben blieb der Bericht gruen, waehrend
     die Tests rot wurden - die Gegenprobe hat es gezeigt. */
  const angleGleichSignal = CI.trenne(Object.assign({}, gut, {
    internalSignal: "Der Rang im Vergleich zur Gruppe ist hoch",
    editorialAngle: "Der Rang im Vergleich zur Gruppe ist hoch" }));
  if (!angleGleichSignal.verstoesse.some(
      (v) => v.id === CI.BEFUND.ANGLE_IST_DAS_SIGNAL)) {
    luecken.push("eine Frage, die nur das Signal umschreibt, faellt nicht auf");
  }
  const hookGleichFrage = CI.trenne(Object.assign({}, gut, {
    editorialAngle: "Was bedeutet das fuer mein Depot?",
    publicHook: "Was bedeutet das fuer mein Depot?" }));
  if (!hookGleichFrage.verstoesse.some(
      (v) => v.id === CI.BEFUND.HOOK_IST_DER_ANGLE)) {
    luecken.push("eine Hook, die nur die Kernfrage ist, faellt nicht auf");
  }

  /* Und eine fehlende Ebene muss benannt werden - getrennt von der
     Sperre, aber eben benannt. */
  const ohneFrage = CI.trenne(Object.assign({}, gut, { editorialAngle: "" }));
  if (ohneFrage.ok || !ohneFrage.dicht ||
      !ohneFrage.fehlendeEbenen.includes("EDITORIAL_ANGLE")) {
    luecken.push("eine fehlende Ebene wird nicht als solche gefuehrt");
  }

  /* Eine leere Liste darf kein Freibrief sein. */
  const ohneListe = CI.trenne(Object.assign({}, vorfall, { internalTerms: [] }));
  if (ohneListe.dicht) {
    luecken.push("eine fehlende Begriffsliste gilt als keine Einschraenkung");
  }

  /* Und kein Pruefer, der richtigen Text abweist. */
  if (CI.interneTreffer("Ein Smartphone mit SMS", ["SMA"]).length ||
      CI.interneTreffer("Attraktive Titel", ["ATR"]).length) {
    luecken.push("ein Kuerzel wird mitten im Wort gefunden");
  }
  if (!CI.interneTreffer("Eine Perzentilrechnung", ["Perzentil"]).length) {
    luecken.push("eine Zusammensetzung wird nicht gefunden");
  }

  /* Und der Produktionsweg. */
  if (!(C.STAGES || []).includes("AUDIENCE_SEPARATION")) {
    luecken.push("die Pipeline hat keine Stufe dafuer");
  }
  const NOW = "2026-09-16T10:00:00Z";
  const lauf = (quellen, rahmen) => C.run({
    opportunity: { opportunityId: "readiness", topic: "Probe",
      entities: ["NVDA"], platform: "instagram" },
    sources: quellen,
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { timeSeries: true, keyNumber: true },
    audienceFrame: rahmen || null,
    writer: C.createTemplateWriter()
  }, { now: NOW });

  let gesperrt = null, durch = null;
  try {
    gesperrt = lauf([{ source: "vu.technical", provider: "tiingo",
      entity: "NVDA", metric: "Technical Opportunity Score", value: 76,
      state: "VERIFIED", observedAt: NOW }],
      AF.frame({ topicId: "t", family: "STOCK_STORY", entities: ["NVDA"] },
        { names: { NVDA: "Nvidia" } }));
    durch = lauf([{ source: "vu.technical", provider: "tiingo",
      entity: "NVDA", metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: "2026-09-15T11:00:00Z" }], null);
  } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Der Probedurchlauf warf: " + e.message };
  }
  if (gesperrt.ok || gesperrt.failedStage !== "AUDIENCE_SEPARATION") {
    luecken.push("der reale Durchlauf sperrt den Vorfall nicht (endete in " +
      (gesperrt.failedStage || "keiner Stufe") + ")");
  }
  if (!durch.ok) {
    luecken.push("das Tor sperrt auch einen Beitrag aus oeffentlichen " +
      "Kennzahlen (" + durch.failedStage + ")");
  } else if (!durch.package.validation.audienceSeparation) {
    luecken.push("der Befund faellt beim Verpacken heraus");
  }

  if (luecken.length) {
    return nein("Die Ebenen aus §8 sind nicht wirksam getrennt: " +
      luecken.join("; ") + ".");
  }
  return ja("Vier benannte Ebenen mit Zweck und Wohnort, und ein Tor, das " +
    "sie trennt: der Satz vom ersten Kandidaten (\"XOM: 76 im Technical " +
    "Opportunity Score\") wird im realen Durchlauf gesperrt, ein Beitrag " +
    "aus oeffentlichen Kennzahlen geht durch, und \"SMA\" schlaegt in " +
    "\"Smartphone\" nicht an.");
}

/* ===================================================================
   2. HOOK_INTELLIGENCE_READY (§9)
   =================================================================== */
function hookIntelligence() {
  /* -----------------------------------------------------------------
     §9 VERLANGT EIN OPTIMIERUNGSOBJEKT, KEINE DATEI MIT DREI WOERTERN

     Der erste Entwurf suchte "ARCHETYP", "kandidat" und "bewerte" im
     Quelltext. Drei Zeichenketten - ein Kommentar haette genuegt.
     Dieselbe schwache Form, die bei BRAND_SYSTEM_READY und
     TEXT_ON_VISUAL_REQUIRED schon durch die Gegenprobe gefallen ist.

     Gemessen wird deshalb am Verhalten:
       1. Gibt es benannte Archetypen, und sagt jeder, was er braucht?
       2. Entsteht ohne Evidenz KEIN Kandidat - statt einem mit Luecke?
       3. Ergibt eine reiche Lage MEHRERE Kandidaten?
       4. Schliesst eine unbelegte Zahl aus, statt Punkte zu kosten?
       5. Ist die Wahl deterministisch (keine mechanische Rotation)?
       6. Verschiebt eine GEMESSENE Leistung die Wahl - und fliesst
          ohne Messung nichts ein?
       7. Laeuft das alles im Produktionsweg von content.js?
     ----------------------------------------------------------------- */
  const pfad = "social/engines/hook.js";
  if (!existiert(pfad)) {
    return nein("Es gibt keine Hook-Engine. Der Hook entsteht heute als " +
      "Nebenprodukt der Textproduktion; §9 verlangt ihn als eigenes " +
      "Optimierungsobjekt mit mehreren bewerteten Kandidaten.");
  }
  let H, C;
  try {
    H = require(join(ROOT, pfad));
    C = require(join(ROOT, "social/engines/content.js"));
  } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "hook.js liess sich nicht laden (" + e.message + ")." };
  }

  const luecken = [];

  const ids = H.ARCHETYP_IDS || [];
  if (ids.length < 5) luecken.push("nur " + ids.length + " Archetypen");
  ids.forEach((id) => {
    const a = H.ARCHETYPEN[id];
    if (!a.zweck || !a.risiko || !Array.isArray(a.braucht) || !a.braucht.length) {
      luecken.push(id + " unvollstaendig");
    }
    (a.braucht || []).forEach((b) => {
      if (typeof H.VORAUSSETZUNG[b] !== "function") {
        luecken.push(id + " verlangt '" + b + "' ohne Pruefung");
      }
    });
  });

  const leer = H.kandidaten({});
  if (leer.kandidaten.length) {
    luecken.push("ohne Evidenz entstehen " + leer.kandidaten.length +
      " Kandidaten - eine Schablone, die sich immer fuellen laesst");
  }

  const reich = {
    subjekt: "Russell 2000",
    kennzahl: { name: "Bewertungsabstand", wert: -38, einheit: "%" },
    extrem: { richtung: "weit auseinander", seit: "1999" },
    vergleich: { eines: "Russell 2000", wertEines: 13.4,
      anderes: "S&P 500", wertAnderes: 21.6, einheit: "KGV" },
    ursache: "kleine Unternehmen ziehen seit 2021 weniger Kapital an",
    bedeutung: "wer breit anlegt, haelt beide Seiten dieses Abstands"
  };
  const wahl = H.waehle(reich);
  if (!wahl.ok || wahl.bewertet.length < 3) {
    luecken.push("eine reiche Lage ergibt keine drei Kandidaten");
  }

  /* Eine unbelegte Zahl muss AUSSCHLIESSEN und nicht Punkte kosten. */
  const unbelegt = H.bewerte({ archetyp: "AUTOR", text: "91 % Abstand." },
    { subjekt: "Abstand",
      evidence: [{ statement: "Der Abstand liegt bei 38 %", value: 38 }] });
  if (unbelegt.zulaessig) {
    luecken.push("eine unbelegte Zahl ist zulaessig");
  } else if (!(unbelegt.punkte > 0)) {
    /* Wenn ein ausgeschlossener Kandidat auch noch null Punkte haette,
       liesse sich nicht unterscheiden, ob die Tuer oder die Rechnung
       ihn aufgehalten hat. */
    luecken.push("der Ausschluss ist von einer schlechten Bewertung nicht " +
      "zu unterscheiden");
  }

  /* Und die Tuer muss die WAHL binden, nicht nur ein Feld setzen.
     Die Gegenprobe hat es gezeigt: entfernt man den Filter in
     waehle(), bleibt `zulaessig: false` korrekt stehen - und der
     Kandidat gewinnt trotzdem. Ein Flag, das niemanden aufhaelt, ist
     kein Ausschluss. */
  const nurVerbotenes = H.waehle({ subjekt: "Russell 2000",
    ursache: "Geheimtipp aus dem Casino", bedeutung: "Jackpot" });
  if (nurVerbotenes.ok) {
    luecken.push("ein ausgeschlossener Kandidat wird trotzdem gewaehlt");
  }

  /* Deterministisch. */
  if (H.waehle(reich).gewaehlt.text !== H.waehle(reich).gewaehlt.text) {
    luecken.push("die Wahl ist nicht reproduzierbar");
  }

  /* Gemessene Leistung verschiebt - fehlende fliesst nicht ein. */
  const verlierer = wahl.ok ? wahl.bewertet
    .filter((b) => b.zulaessig && b.archetyp !== wahl.gewaehlt.archetyp)
    .sort((a, b) => a.punkte - b.punkte)[0] : null;
  if (verlierer) {
    const mit = H.waehle(Object.assign({}, reich,
      { leistung: { [verlierer.archetyp]: 100 } }));
    if (mit.gewaehlt.archetyp !== verlierer.archetyp) {
      luecken.push("eine gemessene Leistung verschiebt die Wahl nicht");
    }
  }
  if (wahl.ok && wahl.bewertet.some((b) => b.leistungGemessen ||
      b.teile.leistung !== undefined)) {
    luecken.push("ohne Messung fliesst trotzdem eine Leistung ein");
  }

  /* Und der Produktionsweg: ein echter Durchlauf muss den Archetyp und
     die unterlegenen Kandidaten mitfuehren. */
  let paket = null;
  try {
    const res = C.run({
      opportunity: { opportunityId: "readiness", topic: "KI-Rechenzentren",
        entities: ["NVDA"], platform: "instagram" },
      sources: [{ source: "vu.technical", provider: "tiingo", entity: "NVDA",
        metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
        state: "VERIFIED", observedAt: "2026-09-15T11:00:00Z" }],
      strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
        timeSensitivity: "TIMELY" },
      visualAvailability: { timeSeries: true, keyNumber: true },
      /* -------------------------------------------------------------
         EIN SCHREIBER, DESSEN CLAIMS DEN HOOK NICHT DECKEN

         Mit der Vorlage deckten sie ihn zufaellig mit ab - und dann
         konnte die Frage "ist die Zahl im Hook belegt" nicht mit Nein
         beantwortet werden. Die Gegenprobe hat es gezeigt: die
         Herkunft aus dem Kandidaten zu nehmen faerbte die Tests rot
         und diesen Bericht gruen.

         Jetzt bringt der Hook seinen Beleg selbst mit oder gar keinen.
         ------------------------------------------------------------- */
      writer: Object.assign(C.createTemplateWriter(), {
        draft: () => ({
          caption: "Kleine Unternehmen ziehen seit Jahren weniger Kapital " +
            "an, und das sieht man inzwischen an der Bewertung deutlich.",
          claims: [], cta: null, hashtags: [] })
      })
    }, { now: new Date().toISOString() });
    if (!res.ok) {
      return { zustand: Z.UNGEPRUEFT,
        satz: "Der Probedurchlauf endete in " + res.failedStage + ": " +
          res.explanation };
    }
    paket = res.package;
  } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Der Probedurchlauf warf: " + e.message };
  }
  if (!paket.hookArchetype || !paket.hookSelection) {
    luecken.push("der echte Durchlauf fuehrt den Archetyp nicht mit - die " +
      "Engine steht neben dem Weg");
  } else if (!(paket.hookSelection.bewertet || []).length ||
             paket.hookSelection.bewertet.length < 2) {
    luecken.push("im echten Durchlauf stand nur ein Kandidat zur Wahl");
  }

  /* -----------------------------------------------------------------
     UND JEDE ZAHL IM HOOK IST BELEGT

     Seit der Hook eigene Werte setzen kann, ist er belegpflichtig wie
     jeder andere Satz. Die Gegenprobe hat gezeigt, dass die Messung
     das brauchte: nimmt man die Herkunft aus dem Kandidaten, aus der
     Feldliste oder aus dem Claim-Nachtrag heraus, stand die Zahl
     unbelegt im Text - und dieser Bericht meldete weiter ERFUELLT.

     Gefragt wird an den Claims des fertigen Pakets, nicht am
     Zwischenstand.
     ----------------------------------------------------------------- */
  const hookZahlen = String(paket.hook || "").match(/\d+(?:[.,]\d+)?/g) || [];
  const belegt = (paket.claims || []).map((c) => String(c && c.text || ""));
  const offen = hookZahlen.filter(
    (z) => !belegt.some((t) => t.indexOf(z) !== -1));
  if (offen.length) {
    luecken.push("Zahlen im Hook ohne Beleg in den Claims: " +
      offen.join(", "));
  }

  if (luecken.length) {
    return nein("Der Hook ist noch kein Optimierungsobjekt: " +
      luecken.join("; ") + ".");
  }
  return ja(ids.length + " benannte Archetypen mit eigenen Voraussetzungen, " +
    wahl.bewertet.length + " bewertete Kandidaten aus einer reichen Lage, " +
    "unbelegte Zahlen schliessen aus statt Punkte zu kosten, die Wahl ist " +
    "reproduzierbar, und der echte Durchlauf waehlt " + paket.hookArchetype +
    " aus " + paket.hookSelection.bewertet.length + " Kandidaten - mit " +
    "Beleg fuer jede Zahl im Satz.");
}

/* ===================================================================
   3. TEXT_ON_VISUAL_REQUIRED (§13/§14/§15)
   =================================================================== */
async function textOnVisual() {
  /* -----------------------------------------------------------------
     §13 IST EINE OWNER-ENTSCHEIDUNG, ALSO WIRD SIE AM TOR GEMESSEN

     Der erste Entwurf suchte einen Zustandsnamen im Quelltext von
     scroll-stop.js. Dieselbe schwache Form wie bei BRAND_SYSTEM_READY:
     ein Name beweist keine Sperre. Die Gegenprobe dort hat es gezeigt,
     und sie gilt hier genauso.

     Gefragt wird deshalb am Verhalten:
       1. Weist das Tor ein Bild OHNE Text zurueck?
       2. Weist es ein Bild zurueck, dessen Text zwar da ist, aber
          nicht fuehrt (Beleg groesser als Hook)?
       3. Faellt es bei FEHLENDER Messung geschlossen aus?
       4. Laesst es ein korrektes Bild durch - sonst waere es kein
          Tor, sondern eine Mauer?
       5. Steht es im Produktionsweg: wirft render() bei einem Bild
          ohne Hook, statt es als Asset zurueckzugeben?
     ----------------------------------------------------------------- */
  const pfad = "social/engines/scroll-stop.js";
  if (!existiert(pfad)) {
    return nein("Es gibt kein SCROLL_STOP_QUALITY-Tor. Text-on-Visual ist " +
      "damit eine Absicht und keine Vorbedingung - §13 verlangt das " +
      "Gegenteil.");
  }
  let S;
  try { S = require(join(ROOT, pfad)); } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "scroll-stop.js liess sich nicht laden (" + e.message + ")." };
  }

  const gut = {
    breite: 1080, hoehe: 1350,
    texte: [
      { rolle: "SIGNATUR", text: "VISION UNIVERSE", flaeche: 19686,
        oben: 96, unten: 127, links: 88, rechts: 417, schrift: 26 },
      { rolle: "HOOK", text: "So weit lagen sie seit 1999 nicht auseinander.",
        flaeche: 146764, oben: 427, unten: 610, links: 88, rechts: 941,
        schrift: 76 },
      { rolle: "BELEG", text: "-38 %", flaeche: 55316, oben: 710,
        unten: 857, links: 88, rechts: 464, schrift: 122 }
    ]
  };
  const ohneText = { breite: 1080, hoehe: 1350, texte: [] };
  const belegFuehrt = { breite: 1080, hoehe: 1350,
    texte: gut.texte.map((t) => t.rolle === "BELEG"
      ? Object.assign({}, t, { flaeche: 300000 }) : t) };

  const luecken = [];
  const probe = (name, eingabe, sollDurch) => {
    let r;
    try { r = S.pruefe(eingabe); } catch (e) {
      luecken.push(name + " (wirft: " + e.message + ")"); return;
    }
    if (!!r.ok !== sollDurch) luecken.push(name + " (meldet " + r.zustand + ")");
  };
  probe("ein Bild ohne Text kommt durch", { messung: ohneText }, false);
  probe("ein Bild ohne fuehrende Hook kommt durch", { messung: belegFuehrt }, false);
  probe("eine fehlende Messung gilt als bestanden", {}, false);
  probe("ein korrektes Bild wird abgewiesen", { messung: gut }, true);
  if (luecken.length) {
    return nein("Das Tor urteilt nicht: " + luecken.join("; ") + ".");
  }

  /* Und im Produktionsweg. Ohne Chromium laesst sich das nicht
     entscheiden - dann ist es UNGEPRUEFT und nicht bestanden. */
  const R = await import("file://" + join(ROOT, "scripts/social/render-asset.mjs"));
  try { R.chromiumPfad(); } catch {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Das Tor urteilt richtig, aber ohne Chromium laesst sich " +
        "nicht pruefen, ob es im Produktionsweg steht." };
  }
  const entwurf = R.plan({
    packageId: "readiness-probe", visualType: "DATA_CARD",
    visualDirectionReady: true, visualDirectionMissing: [],
    hook: "Der Abstand ist so gross wie seit 1999 nicht.",
    visualBrief: { entity: "RUSSELL 2000",
      textLayers: [{ text: "So weit lagen sie seit 1999 nicht auseinander." }] },
    claims: [
      { text: "-38 %", numeric: -38,
        source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } },
      { text: "Bewertungsabstand Russell 2000 zu S&P 500", numeric: null,
        source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } }
    ]
  });
  if (!entwurf.ok) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Der Probeplan liess sich nicht zeichnen (" + entwurf.reason + ")." };
  }
  const ziel = join(ROOT, "tmp", "readiness-scrollstop.jpg");
  let echt = null, gesperrt = false;
  try {
    echt = R.render(entwurf, ziel, { schrift: R.ladeSchrift(ROOT) });
  } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Ein korrektes Bild liess sich nicht rendern (" + e.message + ")." };
  }
  /* Und derselbe Plan ohne Hook darf KEIN Asset ergeben. */
  const ohneHook = Object.assign({}, entwurf,
    { ebenen: Object.assign({}, entwurf.ebenen, { aussage: "" }) });
  try { R.render(ohneHook, ziel, { schrift: R.ladeSchrift(ROOT) }); }
  catch (e) { gesperrt = !!e.zustand; }
  try { require("node:fs").rmSync(ziel, { force: true }); } catch { /* egal */ }

  if (!echt.messung || !echt.scrollStop) {
    return nein("render() gibt ein Asset zurueck, ohne es vermessen und " +
      "beurteilt zu haben. Das Tor steht neben dem Weg.");
  }
  if (!gesperrt) {
    return nein("render() liefert auch ohne Hook ein Asset. §13 waere " +
      "damit eine Absicht - ein Tor, das nicht im Weg steht, ist kein Tor.");
  }
  return ja("Das Tor weist ein Bild ohne Text, ein Bild ohne fuehrende " +
    "Hook und eine fehlende Messung zurueck, laesst ein korrektes durch - " +
    "und render() gibt ohne Hook kein Asset heraus (gemessen: " +
    echt.scrollStop.hookFlaeche + " gegen " + echt.scrollStop.andereFlaeche +
    " Quadratpixel).");
}

/* ===================================================================
   4. BRAND_SYSTEM_READY (§12/§16/§19)
   =================================================================== */
async function brandSystem() {
  /* -----------------------------------------------------------------
     DREI FRAGEN, NICHT EINE

     Der erste Entwurf dieser Messung suchte sechs Namen im Quelltext.
     Das ist genau die Sorte Pruefung, die dieses Projekt schon
     mehrfach getaeuscht hat: sie trifft auf Wortlaut und nicht auf
     eine Messung. Sechs Zeichenketten in einer Datei beweisen keine
     Grammatik - eine Kommentarzeile mit den sechs Namen haette
     genuegt.

     Gefragt wird deshalb:
       1. Gibt es die sechs Familien ALS STRUKTUR, jede mit dem, was
          §16 nennt (Zweck, Storytypen, Atlas-Rolle, Text-Hierarchie,
          Visual-Hierarchie, Akzentlogik, Mobilregeln, Failure
          Conditions)?
       2. Sind die Failure Conditions AUSFUEHRBAR - also lehnt die
          Grammatik einen leeren Entwurf wirklich ab?
       3. Laeuft sie im PRODUKTIONSWEG mit, oder steht sie daneben?
          Ein Tor, das nicht im Weg steht, ist kein Tor.
     ----------------------------------------------------------------- */
  const pfad = "social/engines/visual-grammar.js";
  if (!existiert(pfad)) {
    return nein("Es gibt keine Visual Grammar. §16 verlangt benannte " +
      "Visual Families mit Zweck, Atlas-Rolle, Text-Hierarchie und " +
      "Failure Conditions - sonst kollabiert der Feed in ein Layout (§19).");
  }

  let G;
  try { G = require(join(ROOT, pfad)); } catch (e) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "social/engines/visual-grammar.js liess sich nicht laden (" +
        e.message + "). Ob es eine Grammatik gibt, ist damit unbekannt." };
  }

  const noetig = ["CINEMATIC_STORY", "DATA_EDITORIAL", "RANKING",
    "COMPARISON", "EXPLAINER", "MAGAZINE_REPORT"];
  const fehlt = noetig.filter((n) => !G.FAMILIEN || !G.FAMILIEN[n]);
  if (fehlt.length) {
    return nein("Der Visual Grammar fehlen Familien: " + fehlt.join(", ") + ".");
  }

  /* §16 nennt acht Bestandteile je Familie. Eine Familie, der einer
     fehlt, ist eine Ueberschrift. */
  const teile = ["zweck", "storytypen", "formen", "atlasRollen",
    "textHierarchie", "visualHierarchie", "akzente", "mobil", "fehlerbilder"];
  const luecken = [];
  noetig.forEach((n) => {
    const f = G.FAMILIEN[n];
    teile.forEach((t) => {
      const v = f[t];
      const leer = v === null || v === undefined || v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (leer) luecken.push(n + "." + t);
    });
    /* Die Formen muessen es in visual-intelligence.js geben. Eine
       Familie, die eine erfundene Form fuehrt, hat eine zweite
       Formliste aufgemacht (§2). */
    (f.formen || []).forEach((fo) => {
      if (!VisualIntelligence.FORMEN[fo]) luecken.push(n + ".formen:" + fo);
    });
    /* Ebenso die Atlas-Rollen: §17 nennt vier, nicht beliebig viele. */
    (f.atlasRollen || []).forEach((r) => {
      if (!G.ATLAS_ROLLEN[r]) luecken.push(n + ".atlasRollen:" + r);
    });
  });
  if (luecken.length) {
    return nein("Unvollstaendige Familien (§16): " + luecken.join(", ") + ".");
  }

  const rollen = ["ATLAS_HERO", "ATLAS_GUIDE", "ATLAS_OBSERVER", "ATLAS_SIGNATURE"];
  const rollenFehlt = rollen.filter((r) => !G.ATLAS_ROLLEN || !G.ATLAS_ROLLEN[r]);
  if (rollenFehlt.length) {
    return nein("§17 verlangt vier Atlas-Rollen, es fehlen: " +
      rollenFehlt.join(", ") + ".");
  }

  /* -----------------------------------------------------------------
     DIE BEDINGUNGEN MUESSEN LAUFEN, NICHT NUR DASTEHEN

     Der erste Entwurf fragte, ob `pruefe(familie, {})` durchfaellt.
     Die Gegenprobe hat ihn widerlegt: mit ausgeschalteten
     Fehlerbildern fiel der leere Entwurf weiter durch - an der
     Formpruefung, die daneben steht. Die Messung bestand also, waehrend
     KEINE einzige Failure Condition mehr lief.

     Gefragt wird deshalb nach der HERKUNFT der Befunde: jede Familie
     muss mindestens einen Verstoss aus ihrer EIGENEN Liste melden und
     mindestens einen aus der allgemeinen. Ein Entwurf mit einem Wert
     und einem Schritt loest in jeder der sechs etwas aus.
     ----------------------------------------------------------------- */
  const probe = { eintraege: 1, schritte: 1 };
  const allgemein = (G.ALLGEMEINE_FEHLERBILDER || []).map((f) => f.id);
  const stumpf = [];
  noetig.forEach((n) => {
    let raus;
    try { raus = G.pruefe(n, probe).verstoesse.map((v) => v.id); }
    catch (e) { stumpf.push(n + " (wirft: " + e.message + ")"); return; }
    const eigene = G.FAMILIEN[n].fehlerbilder.map((f) => f.id);
    if (!raus.some((id) => eigene.includes(id))) {
      stumpf.push(n + " (keine eigene Failure Condition greift)");
    }
    if (!raus.some((id) => allgemein.includes(id))) {
      stumpf.push(n + " (keine allgemeine Failure Condition greift)");
    }
  });
  if (stumpf.length) {
    return nein("Failure Conditions, die nie zutreffen, sind Kommentare: " +
      stumpf.join("; ") + ".");
  }

  /* §19: die Feed-Variation muss eine RECHNUNG sein. Ein Fenster aus
     lauter gleichen Beitraegen muss kollabieren, ein gemischtes nicht -
     sonst misst die Dimension nichts. */
  const gleich = Array.from({ length: 8 }, () => ({
    familie: "DATA_EDITORIAL", form: "CHART", atlasRolle: "ATLAS_SIGNATURE",
    dominantesTextRolle: "HOOK", akzente: ["RICHTUNG"], farbwelt: "VU" }));
  if (!G.feedVariation || G.feedVariation(gleich).zustand !== "KOLLABIERT") {
    return nein("§19 ist nicht gemessen: acht identisch gebaute Beitraege " +
      "gelten der Feed-Variation nicht als Kollaps.");
  }

  /* -----------------------------------------------------------------
     UND DER PRODUKTIONSWEG - GEMESSEN, NICHT GESUCHT

     Auch hier hat die Gegenprobe den ersten Entwurf widerlegt. Er
     suchte "VisualGrammar.ausRenderPlan" im Quelltext. Nimmt man den
     AUFRUF aus plan() heraus und laesst die Hilfsfunktion stehen,
     findet die Suche sie weiter - und die Messung meldete verdrahtet,
     waehrend kein einziges Bild mehr geprueft wurde.

     Eine definierte Funktion ist kein Tor. Gemessen wird deshalb an
     einem echten Plan: kommt ein Befund am Bild heraus oder nicht.
     ----------------------------------------------------------------- */
  const { plan } = await import(
    "file://" + join(ROOT, "scripts/social/render-asset.mjs"));
  const entwurf = plan({
    packageId: "readiness-probe", visualType: "DATA_CARD",
    visualDirectionReady: true, visualDirectionMissing: [],
    hook: "Der Abstand ist so gross wie seit 1999 nicht.",
    visualBrief: { entity: "RUSSELL 2000",
      textLayers: [{ text: "So weit lagen sie seit 1999 nicht auseinander." }] },
    claims: [
      { text: "-38 %", numeric: -38,
        source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } },
      { text: "Bewertungsabstand Russell 2000 zu S&P 500", numeric: null,
        source: { source: "Bloomberg", retrievedAt: "2026-09-16T10:00:00Z" } }
    ]
  });
  if (!entwurf || entwurf.ok !== true) {
    return { zustand: Z.UNGEPRUEFT,
      satz: "Der Probeplan liess sich nicht zeichnen (" +
        ((entwurf && entwurf.reason) || "unbekannt") + "). Ob die Grammatik " +
        "im Produktionsweg steht, ist damit ungeprueft." };
  }
  if (!entwurf.grammatik || !entwurf.grammatik.familie) {
    return nein("Die Visual Grammar steht neben dem Produktionsweg: ein " +
      "gezeichneter Plan traegt keinen Grammatik-Befund. Ein Tor, das " +
      "nicht im Weg steht, ist kein Tor.");
  }

  return ja("Sechs Visual Families mit je " + teile.length + " Bestandteilen " +
    "(§16), vier Atlas-Rollen (§17), greifende Failure Conditions, eine " +
    "rechnende Feed-Variation (§19) - und ein gezeichneter Plan traegt " +
    "den Befund (" + entwurf.grammatik.familie + ").");
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
  TEXT_ON_VISUAL_REQUIRED: await textOnVisual(),
  BRAND_SYSTEM_READY: await brandSystem(),
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

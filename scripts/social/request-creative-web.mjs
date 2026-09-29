#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/request-creative-web.mjs

   DER ANSTOSS AN DEN CREATIVE AGENT — FUER EINE WEB-STORY (Owner-
   Direktive "DIRECT CREATIVE GOLDEN PATH — FINAL GO/NO-GO", 23.09.)

   Spiegelbild von request-creative.mjs, aber ohne quant/: der Brief
   entsteht aus social/data/web-story-selection.json (von
   research-web-story.mjs geschrieben), nicht aus einem technischen
   Bundle. Ab hier ist der Weg IDENTISCH zum bestehenden: derselbe
   ChatGptWork-Adapter, dasselbe Ledger, dieselbe Kennungsformel, und
   dispatch-creative-job.mjs / open-creative-request.mjs werden
   UNVERAENDERT weiterbenutzt (beide sind bereits generisch auf
   contentId, siehe deren eigene Dateien).

   DEUTSCHER HOOK — OWNER-DIREKTIVE "WEB-FIRST + FULL-POST-GENERATION"
   (24.09.), §5.1: alle sichtbaren Texte im Post sind Deutsch. Die
   Quelle liefert den Hook oft englisch (z.B. Seeking Alpha Market
   Currents) — genau das war der reale Befund bei cand_20260924_d052c375
   ("10-year U.S. Treasury yield tops 5.1%..." unveraendert als Hook).
   web-research.js waehlt den Hook weiterhin deterministisch aus echtem
   Quelltext (Grounding, Anti-Halluzination) — aber als ENGLISCHES
   Belegmaterial (`grounding_hook_en`). Die deutsche Uebersetzung/
   Adaption liefert der Agent, grounded an denselben `evidence`-Belegen;
   der Text wird in Stufe B (render-asset.mjs, unveraendert) aufgesetzt.

   Ausfuehren:
     node scripts/social/request-creative-web.mjs
     node scripts/social/request-creative-web.mjs --write

   Ein bereits VERIFIED Ergebnis fuer denselben content_id erzwungen
   uebergehen (z.B. um eine Prompt-Aenderung real zu testen, waehrend
   dieselbe Story weiter die Top-Story ist):
     node scripts/social/request-creative-web.mjs --write \
       --force-attempt 2 --attempt-reason "Owner-Test der Fixes X/Y/Z"
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { hydrateVerifiedJob } from "./ingest-creative.mjs";
import { verifizierteJobsFuer, LEDGER_DATEI } from "./request-creative.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ContentBrief = require(join(ROOT, "social/engines/content-brief.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));
const Brand = require(join(ROOT, "social/engines/brand.js"));

export function baueEvidenzAusStory(auswahl) {
  return (auswahl.fakten || []).map(function (f, i) {
    return {
      entity: auswahl.thema || auswahl.story.title, metric: "Web-Beleg " + (i + 1),
      value: f.value, unit: f.unit || null, statement: f.statement, temporal: false,
      source: { source: auswahl.story.source, observedAt: auswahl.story.publishedAt,
        state: "PUBLISHED" }
    };
  });
}

/**
 * Darf ein Anlauf erzwungen werden, und mit welcher Nummer?
 *
 * Reine Entscheidung, kein I/O — testbar ohne Register, Brief oder
 * Netzwerk. Siehe die ausfuehrliche Begruendung am Aufrufer (CLI-Block
 * unten): ein erzwungener Anlauf ist eine explizite Entscheidung, kein
 * Automatismus, und braucht deshalb sowohl eine Nummer >= 2 als auch
 * eine Begruendung.
 */
export function entscheideErzwungenenAnlauf(forceAttemptRaw, attemptReason) {
  if (forceAttemptRaw === null || forceAttemptRaw === undefined) {
    return { ok: true, attempt: null, reason: null };
  }
  const anlauf = Number(forceAttemptRaw);
  if (!Number.isInteger(anlauf) || anlauf < 2) {
    return { ok: false, reason: "invalidAttempt",
      message: "--force-attempt muss eine ganze Zahl >= 2 sein " +
        "(Anlauf 1 ist der Standardweg und braucht diese Fahne nicht)." };
  }
  if (!attemptReason) {
    return { ok: false, reason: "missingReason",
      message: "--force-attempt verlangt --attempt-reason: ein erzwungener " +
        "Anlauf ist eine Entscheidung, keine Wiederholung, und die " +
        "Begruendung gehoert in den Brief (attempt_reason)." };
  }
  return { ok: true, attempt: anlauf, reason: attemptReason };
}

export function baueVuBrief(auswahl, options) {
  options = options || {};
  return ContentBrief.build({
    opportunity: { opportunityId: "opp_" + auswahl.contentId, topic: auswahl.story.title,
      premise: "WEB_STORY", hasCause: false, timeSensitivity: "TIMELY" },
    strategyDecision: { archetype: "WEB_STORY", mode: "EXPLORE",
      strategyVersion: options.strategyVersion || "strategy_initial" },
    visual: { visualType: auswahl.motiv.strategy },
    evidence: baueEvidenzAusStory(auswahl),
    platform: "instagram",
    now: options.now || new Date().toISOString()
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const DATA_DIR = arg("data", "social/data");
  const FORCE_ATTEMPT_RAW = arg("force-attempt", null);
  const ATTEMPT_REASON = arg("attempt-reason", null);

  /* ERZWUNGENER ANLAUF — EINE ENTSCHEIDUNG, KEIN AUTOMATISMUS.
     HYDRATE BEFORE REGENERATE gilt zu Recht als Standard: dieselbe
     Story soll nicht zweimal angefragt werden, nur weil ein Lauf sie
     erneut auswaehlt. Aber genau das macht einen echten Test von
     Prompt-Aenderungen unmoeglich, solange die Top-Story dieselbe
     bleibt — ein bereits VERIFIED Job wird immer wiederverwendet, egal
     wie sehr sich brandAssets.instruction seither geaendert hat.
     buildAgentBrief() kennt den Anlauf bereits als Parameter: er
     aendert die Bytes des Briefs und damit Blob-SHA und Processing
     Key, sodass ein zweiter Anlauf sauber ein eigener Vorgang ist.
     Hier wird dieser Weg nur ans CLI durchgereicht — kein neues
     Verfahren, sondern ein fehlender Zugang zu einem bestehenden. */
  const anlaufEntscheidung = entscheideErzwungenenAnlauf(FORCE_ATTEMPT_RAW, ATTEMPT_REASON);
  if (!anlaufEntscheidung.ok) {
    console.error(anlaufEntscheidung.message);
    process.exit(2);
  }
  const erzwungenerAnlauf = anlaufEntscheidung.attempt;

  const auswahlPfad = join(ROOT, DATA_DIR, "web-story-selection.json");
  if (!existsSync(auswahlPfad)) {
    console.error("Keine Web-Story-Auswahl unter " + join(DATA_DIR, "web-story-selection.json") +
      ". research-web-story.mjs --write laeuft vor diesem Skript.");
    process.exit(2);
  }
  const auswahl = JSON.parse(readFileSync(auswahlPfad, "utf8"));
  const contentId = auswahl.contentId;

  console.log("VISION UNIVERSE SOCIAL — Creative Request (Web-Story)");
  console.log("content_id: " + contentId);
  console.log("Story:      " + auswahl.story.title);
  console.log("Quelle:     " + auswahl.story.source + " (" + auswahl.story.publishedAt + ")");

  /* HYDRATE BEFORE REGENERATE — dieselbe Reihenfolge wie im Quant-Pfad:
     traegt das Register bereits ein VERIFIED Ergebnis zu genau dieser
     Story (derselbe Link, derselbe Tag -> dieselbe contentId), entsteht
     kein zweiter Brief. */
  const bestehendeVerified = verifizierteJobsFuer(contentId, ROOT);
  if (bestehendeVerified.length && erzwungenerAnlauf === null) {
    const jobEintrag = bestehendeVerified[bestehendeVerified.length - 1];
    console.log("\n--- VERIFIED CREATIVE IM REGISTER ---");
    console.log(jobEintrag.creativeJobId + " (" + jobEintrag.state + ")");
    const hydriert = hydrateVerifiedJob(contentId, jobEintrag);
    if (hydriert.ok) {
      console.log("REUSE_VERIFIED_CREATIVE: Ergebnis bereits vorhanden unter " +
        ChatGptWork.requestDir(contentId) + "/.");
      process.exit(0);
    }
    console.log("VERIFIED_RESULT_UNAVAILABLE: " + hydriert.explanation +
      " — es wird ein neuer Brief erzeugt.");
  } else if (bestehendeVerified.length) {
    const jobEintrag = bestehendeVerified[bestehendeVerified.length - 1];
    console.log("\n--- VERIFIED CREATIVE IM REGISTER ---");
    console.log(jobEintrag.creativeJobId + " (" + jobEintrag.state + ")");
    console.log("ERZWUNGENER ANLAUF " + erzwungenerAnlauf + " (" +
      ATTEMPT_REASON + "): die Wiederverwendung wird explizit uebersprungen.");
  }

  const vuBrief = baueVuBrief(auswahl, { now: NOW });

  const agentBrief = ChatGptWork.buildAgentBrief(vuBrief, {
    contentId, variants: 1,
    attempt: erzwungenerAnlauf || undefined,
    attemptReason: erzwungenerAnlauf ? ATTEMPT_REASON : undefined,
    hookType: "web_story_grounded_de",
    hookStrategyId: "vu-web-story-grounded-de-v1",
    /* =====================================================================
       OWNER-DIREKTIVE "CREATIVE QUALITY RESET" (29.09.): der reale Post
       "50.000 DOLLAR FUER EIN AUTO?" (vu-web-4e4d3aaef2a999a2-20260926,
       geliefert NACH dem visualStyle-Fix aus PR #256) erfuellte jede
       formale Regel dieses Briefs und war trotzdem kreativ schlecht -
       generisches Auto auf Preisschild, Hook ohne Aussage, Atlas wirkt
       aufgesetzt. Der Befund war nicht die Technik, sondern dass dieser
       Brief ChatGPT Work zu stark mikromanagt hat: ein erzwungener
       Universalstil (Flat-Comic-Poster), eine starre Farbwelt, starre
       Layout-Zonen (Atlas <=20% Breite, Logo oben links, Headline im
       oberen Drittel) und eine Hook, die mechanisch aus einem bereits
       algorithmisch vorgewaehlten Titel-Fragment UEBERSETZT statt aus
       der Story selbst ENTWICKELT wurde. Ab hier gilt: ChatGPT Work ist
       Creative Director, Social Editor und Visual Designer fuer diesen
       Post - nicht nur Bildgenerator. Pflicht bleibt ausschliesslich, was
       Grounding, Marke, Sprache, Format und Endergebnis-Qualitaet
       betrifft; die konkrete kreative Loesung (Bildidee, Hook-Formulierung,
       Komposition, Stil) liegt beim Agenten. ===================== */
    hookInstruction:
      "`grounding_hook_en` ist NICHT die zu uebersetzende Hook, sondern nur EIN " +
      "Signal unter mehreren - der Web-Research-Hook-Wettbewerb hat ihn algorithmisch " +
      "vorausgewaehlt, nicht redaktionell. Massgeblich sind `source_story` (Titel, " +
      "Beschreibung, Link) und `evidence` (die geprueften Fakten) als Grounding.\n\n" +
      "Deine Aufgabe, wie ein menschlicher Creative Director: verstehe zuerst selbst, " +
      "was an dieser Story wirklich passiert ist, warum sie fuer einen deutschen " +
      "Anleger interessant ist, was daran ueberraschend ist und welche Konsequenz " +
      "oder Spannung darin steckt. Entwickle DARAUS deine eigene, eigenstaendige " +
      "deutsche Hook - nicht als Uebersetzung von `grounding_hook_en` oder des " +
      "Original-Titels, sondern als deine redaktionelle Verdichtung der Story auf " +
      "den einen staerksten Punkt.\n\n" +
      "VERBOTENES DENKMUSTER: 'Artikel enthaelt eine grosse Zahl -> Hook = diese " +
      "Zahl als Frage verpackt' (Beispiel, das NICHT wiederholt werden soll: " +
      "'50.000 Dollar fuer ein Auto?' - eine isolierte Zahl ohne die eigentliche " +
      "Geschichte dahinter). Eine Zahl darf die Hook staerken, ersetzt aber nie die " +
      "Story.\n\n" +
      "Qualitaetsmassstab: kurz, sofort verstaendlich, macht neugierig, enthaelt " +
      "eine echte Aussage (keine woertliche Bandwurm-Uebersetzung des " +
      "Originaltitels), erzeugt emotionale oder intellektuelle Spannung, ist fuer " +
      "Anleger relevant, funktioniert auf einem Smartphone auf einen Blick. Die " +
      "Hook-Art waehlst du frei - starke Aussage, ueberraschende Zahl, Widerspruch, " +
      "Konsequenz, Frage, Warnsignal, historische Einordnung, ueberraschender " +
      "Vergleich, starke Beobachtung - kein festes Template wird erzwungen.\n\n" +
      "Nicht akzeptabel: interne Scores oder Screener-Sprache, technische " +
      "Systemformulierungen, ein unveraendert uebernommener englischer Quelltitel, " +
      "ein Satz, der zwei Vergleichspunkte in einer Aufzaehlung nennt statt EINEN " +
      "klaren Punkt zu setzen (z.B. nicht 'Von X bis Y: so Z'). Alle sichtbaren " +
      "Woerter Deutsch - Ausnahmen nur fuer Eigennamen, Ticker und Markennamen. " +
      "Jede Zahl und jede Tatsache ausschliesslich aus `evidence`/`source_story` - " +
      "nichts erfinden, keine Prognose.",
    visualStrategy: auswahl.motiv.strategy,
    /* `auswahl.motiv.instruction` (Themenwelt-Motivkatalog) wird hier BEWUSST NICHT
       mehr als Bildanweisung uebergeben: sie ist ein Oberbegriff-Motiv je Branche
       ("Automobil-Fertigungslinie" fuer Auto-Stories, "Serverreihen" fuer
       KI-Stories) - genau das Denkmuster, das Section 6 der Owner-Direktive als
       Fehler benennt. Die visuelle Idee soll aus der KONKRETEN Story entstehen,
       nicht aus der Branchen-Schublade. */
    visualInstruction:
      "Entwickle deine eigene visuelle Idee aus der Story selbst (`source_story`, " +
      "`evidence`) - nicht aus dem Branchen-Oberbegriff. Eine Auto-Story ist nicht " +
      "automatisch ein generisches Auto auf einem Preisschild, eine KI-Story nicht " +
      "automatisch blau leuchtende Server, eine Zins-Story nicht automatisch ein " +
      "Trading-Floor-Klischee. Finde die visuelle Metapher, die GENAU DIESE " +
      "Geschichte transportiert, keine austauschbare Branchen-Illustration. " +
      "Testfrage vor der Ausgabe: 'Wenn ich den Text entferne - erzaehlt das Bild " +
      "trotzdem noch diese Geschichte?' Wenn nein, verwirf das Motiv und entwickle " +
      "ein spezifischeres.",
    palette: [
      "Deine Wahl, passend zur Story und zum Ton dieses Posts - keine vorgeschriebene " +
        "Farbwelt fuer jeden Post.",
      "Vision Universe wirkt insgesamt hochwertig, redaktionell/editorial und " +
        "markensicher - vermeide grelle Stock-Werbefarben ohne Bezug zur Story.",
      "Eine dunkle, praemium Grundstimmung passt oft gut, ist aber keine Pflicht, " +
        "wenn die Story eine andere Bildsprache verlangt."
    ],
    visualStyle:
      "Kein vorgeschriebener Universalstil. Du entscheidest den Stil, der zu DIESER " +
      "Story am besten passt - solange das Ergebnis hochwertig, redaktionell wirkt " +
      "und wie aus einem Guss komponiert ist, kein Stockfoto und kein Finanz-News-" +
      "Thumbnail. Zwei Negativbeispiele, die beide real vom Owner abgelehnt wurden " +
      "und nicht wiederholt werden sollen: (1) photorealistisches, kinoreifes " +
      "3D-Rendering mit generischen Requisiten (Gebaeude, Flaggen, Banknoten) - " +
      "wirkt wie ein KI-Stockfoto, keine echte Bildidee; (2) ein zwanghaft immer " +
      "gleicher flacher Comic-/Vektor-Poster-Stil mit generischem Motiv - formal " +
      "korrekt, aber kreativ austauschbar und ohne echte Story. Beides ist eine " +
      "Klischeefalle, kein Zielstil. Der Zielstil ist eine bewusste, zur Story " +
      "passende kreative Entscheidung, kein wiederholtes Rezept.",
    visualComposition:
      "Portrait 4:5, randfuellend - komponiere EIN fertiges, veroeffentlichungsreifes " +
      "Markenbild, kein Rohbild fuer eine spaetere Ueberlagerung. Baue die deutsche " +
      "Hook direkt als Teil der Komposition ein (nicht als separat wirkende " +
      "Kopfzeile) - kurz, gross genug um auf einem Smartphone sofort lesbar zu sein, " +
      "aber die genaue Groesse, Position und Typografie liegen in deiner " +
      "gestalterischen Verantwortung, nicht in einer vorgegebenen Zone. Motiv, Hook " +
      "und Markenzeichen sollen wie EIN durchdachtes Design wirken, nicht wie " +
      "uebereinandergelegte Schichten.\n\n" +
      "Brand-Elemente: komponiere die exakte Vision-Universe-Logo-Datei (siehe " +
      "brand_assets.logo) und den exakten Atlas (siehe brand_assets.atlas) " +
      "unveraendert (nur skaliert/zugeschnitten/neu positioniert, nie neu gezeichnet " +
      "oder umstilisiert) so in die Komposition, dass sie natuerlich wirken und die " +
      "Bildidee nicht dominieren oder verdraengen - als wiedererkennbares " +
      "Markenzeichen und kleine, vertrauenswuerdige Praesenz, nicht als Hauptfigur " +
      "des Bildes. Eine bevorzugte, aber keine starre Pixel-Position: die " +
      "Gesamtkomposition hat Vorrang vor blindem Pixelgehorsam.",
    restrictions: ["Keine Kurse im Bild", "Keine Renditezahlen", "Kein Wasserzeichen",
      "Keine Prognose-Aussage im Bildtext", "Logo und Atlas exakt aus den " +
      "angegebenen Dateien uebernehmen, nicht neu zeichnen oder stilisieren",
      "Kein Diagramm, kein Dashboard, kein Bildschirmfoto, kein generischer " +
      "Boersenticker"],
    brandAssets: {
      logo: Brand.LOGO_ASSET_PATH || "assets/vision-universe-logo.png",
      atlas: Brand.ATLAS_ASSET_PATH,
      instruction: "Beide Dateien liegen unveraendert im selben Checkout wie dieser Brief. " +
        "Als Bildreferenz verwenden und unveraendert (nur skaliert) in die Szene " +
        "komponieren — keine Neuzeichnung, keine Farb- oder Stiltransformation " +
        "ausser Skalierung (§18: Logo nicht neu zeichnen oder textuell approximieren). " +
        /* GESICHTSTREUE (Owner-Test 26.09., vu-web-4e4d3aaef2a999a2-20260926):
           direkter Pixelvergleich mit dem Original-Asset zeigte ein leicht
           abweichendes Gesicht (Laecheln, Mundwinkel) trotz "exakt,
           unveraendert" — ein generatives Modell fuegt Referenzbilder nicht
           pixelgenau ein, sondern interpretiert sie neu. Der Owner hat
           entschieden: beim rein generativen Weg bleiben, aber die
           Gesichtstreue in der Anweisung so stark wie moeglich betonen. */
        "Atlas' Gesicht, Mimik und Proportionen muessen exakt dem Referenzbild " +
        "entsprechen — dasselbe Laecheln, dieselben Gesichtszuege, derselbe " +
        "Blick. Eine andere Pose, ein anderer Blickwinkel oder eine Handbewegung " +
        "sind erlaubt; eine veraenderte, neu interpretierte oder auch nur leicht " +
        "abweichende Mimik ist es nicht. " +
        /* DER FEHLENDE VERTRAG (gefunden 26.09., PR vu-web-787176986cf7f5d8-20260926):
           `brand_elements_announcement_required` stand als reine Kennzeichnung im
           Brief, ohne dass der Agent je erfuhr, WELCHE Form die Rueckmeldung haben
           muss. Er antwortete plausibel mit einer eigenen, beschreibenden Form
           (`{logo, atlas, integration}`) statt der drei Booleans, die verifyResult()
           unten tatsaechlich prueft — jedes Ergebnis fiel seither auf
           brandElementsIncomplete, obwohl Logo und Atlas nachweislich im Bild
           waren. Die Form steht jetzt woertlich im Brief, nicht nur im Pruefcode. */
        "Wichtig fuer die Rueckmeldung: gib pro Bildvariante zusaetzlich ein Feld " +
        "`brand_elements` mit GENAU diesen drei Boolean-Feldern zurueck: " +
        "`includes_logo`, `includes_atlas`, `includes_hook_text_de` — jedes nur " +
        "`true`, wenn das jeweilige Element tatsaechlich im fertigen Bild zu sehen " +
        "ist. Kein Freitext, keine anderen Feldnamen, keine Dateipfade an dieser " +
        "Stelle — nur diese drei Booleans."
    },
    requireBrandElementsAnnounced: true,
    width: 1080, height: 1350,
    objective: "Du bist Creative Director fuer Vision Universe. Erstelle aus der " +
      "folgenden aktuellen, oeffentlich recherchierten Finanz-/Boersenstory " +
      "eigenstaendig einen hochwertigen deutschen Social-Media-Post im Format 4:5. " +
      "Analysiere zuerst selbst: was ist die eigentliche Geschichte, warum ist sie " +
      "fuer Anleger interessant, was ist der staerkste Social Hook, welche visuelle " +
      "Idee erzaehlt diese Geschichte am besten? Entwickle daraus EIN vollstaendiges, " +
      "fertiges Creative: Motiv, deutscher Hook-Text, Logo und Atlas in einem Zug " +
      "komponiert — kein Diagramm, kein Dashboard, kein Bildschirmfoto, kein " +
      "generischer Boersenticker, kein Template, keine Datenkarte, und kein Rohbild " +
      "fuer eine spaetere Ueberlagerung. Nutze `evidence` und `source_story` " +
      "ausschliesslich als Grounding — erfinde keine Zahlen oder Tatsachen. Du hast " +
      "ausdrueckliche kreative Freiheit bei Bildidee, Perspektive, Komposition, " +
      "Typografie, visueller Metapher und Stil. Hook und Caption durchgehend auf " +
      "Deutsch. Ziel: ein Post, bei dem ein deutscher Anleger im Feed stoppt und " +
      "verstehen will, was hinter der Story steckt.",
    audience: "Anleger, die aktuelle Marktentwicklungen verfolgen"
  });
  agentBrief.grounding_hook_en = auswahl.hook;
  agentBrief.evidence = baueEvidenzAusStory(auswahl).map(function (e, i) {
    return { id: "ev" + (i + 1), statement: e.statement, value: e.value, unit: e.unit,
      entity: e.entity, metric: e.metric, source: e.source.source,
      observed_at: e.source.observedAt };
  });
  agentBrief.unavailable = [];
  agentBrief.evidence_package = { package_id: contentId, as_of: auswahl.story.publishedAt,
    methodology_version: "web-research-1.0", data_version: "web-research-1.0" };
  agentBrief.source_story = { title: auswahl.story.title, link: auswahl.story.link,
    description: auswahl.story.description || null, source: auswahl.story.source,
    publishedAt: auswahl.story.publishedAt };

  /* DIE QUALITAETSPRUEFUNG VOR AUSLIEFERUNG (Owner-Direktive "CREATIVE QUALITY
     RESET", 29.09., §12) — woertlich als Selbstpruefung an den Agenten
     weitergegeben, statt nur intern beim Owner im Approval Center zu leben. */
  agentBrief.self_check_before_delivery = [
    "Versteht ein deutscher Nutzer die Hook sofort?",
    "Erzaehlt die Hook die eigentliche Story — nicht nur eine isolierte Zahl?",
    "Passt das Motiv wirklich zu dieser konkreten Story?",
    "Wirken Bild, Text, Atlas und Logo wie EIN Design?",
    "Sieht das Ergebnis nach hochwertigem Finanz-/Editorial-Content aus?",
    "Wuerde dieses Creative zwischen professionellen Finanz-/Tech-Posts im Feed bestehen?",
    "Ist irgendeine Zahl oder Aussage erfunden?",
    "Ist die sichtbare Sprache durchgehend Deutsch?"
  ];

  /* DIE NEGATIVREFERENZ (§11): dokumentiert, nicht als Stilvorlage zum
     Nachahmen, sondern als Qualitaetsschwelle, die zu ueberbieten ist. */
  agentBrief.negative_reference = {
    example_content_id: "vu-web-4e4d3aaef2a999a2-20260926",
    example_hook: "50.000 DOLLAR FUER EIN AUTO?",
    why_rejected: [
      "Hook ohne eigentliche Aussage, nur eine isolierte Zahl aus dem Titel",
      "generisches Auto auf einem Preisschild statt einer story-eigenen Bildidee",
      "billige, zwanghaft flache Vektor-/Comic-Anmutung",
      "Atlas wirkt aufgesetzt statt natuerlich integriert",
      "Motiv erzaehlt keine konkrete Story",
      "kein hochwertiges Vision-Universe-Premiumgefuehl"
    ],
    note: "Nicht pixelgenau vermeiden, sondern das Qualitaetsniveau uebertreffen: " +
      "eine echte, story-eigene kreative Entscheidung statt eines austauschbaren Templates."
  };

  const inhalt = JSON.stringify(agentBrief, null, 2) + "\n";
  const sha = ChatGptWork.blobSha(inhalt);
  const key = ChatGptWork.processingKey(agentBrief.brief_id, contentId, sha, "1.0");
  const zielPfad = ChatGptWork.requestDir(contentId) + "/authoring-brief.json";

  console.log("\n--- REQUEST ---");
  console.log("brief_id:       " + agentBrief.brief_id);
  console.log("brief_blob_sha: " + sha);
  console.log("processing_key: " + key);
  console.log("Pfad:           " + zielPfad);

  const ledgerPfad = join(ROOT, LEDGER_DATEI);
  const bestand = existsSync(ledgerPfad) ? JSON.parse(readFileSync(ledgerPfad, "utf8")) : { entries: [] };
  const ledger = Ledger.createLedger(bestand.entries || []);
  const darf = ledger.mayInvoke(key, { now: NOW });

  console.log("\n--- LEDGER ---");
  if (!darf.ok) {
    console.error("KEIN ANSTOSS: " + darf.message);
    process.exit(4);
  }
  console.log("Frei. Kein frueherer Lauf zu diesem Schluessel.");

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  const abs = join(ROOT, zielPfad);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, inhalt);

  ledger.record({ processingKey: key, state: "REQUESTED", at: NOW, contentId,
    briefId: agentBrief.brief_id, briefBlobSha: sha,
    note: "Web-Story-Brief geschrieben nach " + zielPfad + ". PR folgt." });
  writeFileSync(ledgerPfad, JSON.stringify(ledger.snapshot({ now: NOW }), null, 2) + "\n");

  console.log("\nGeschrieben: " + zielPfad);
  console.log("Ledger:      " + LEDGER_DATEI + " (REQUESTED)");
  console.log("\nNaechster Schritt: dispatch-creative-job.mjs, dann open-creative-request.mjs " +
    "(beide unveraendert, contentId=" + contentId + ").");
}

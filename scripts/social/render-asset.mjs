/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/render-asset.mjs

   DIE LUECKE ZWISCHEN ENTSCHEIDUNG UND VEROEFFENTLICHUNG

   Der Zyklus entscheidet eine Bildform (`visualType`) und schreibt einen
   Bildbrief (`visualBrief`). Was er nicht hat, ist ein BILD. Der
   Veroeffentlichungspfad verlangt eine erreichbare JPEG-Adresse — ohne
   die ist der fertig gebaute Endpunkt ein Weg ohne Fracht.

   Dieses Skript schliesst genau diese Luecke.

   -------------------------------------------------------------------------
   WOHER DIE ZAHLEN KOMMEN — UND WOHER NICHT
   -------------------------------------------------------------------------

   NICHT aus dem Bildbrief. Der traegt absichtlich nur REFERENZEN
   ("marketCap@sec"), denn ein Brief mit Zahlen darin waere eine zweite
   Wahrheitsquelle, die irgendwann von der ersten abweicht.

   Sondern aus `package.claims`. Dort steht jede konkrete Zahl mit ihrem
   Beleg (§27, §28). Ein Beitrag, dessen Bild eine Zahl zeigt, die in
   keinem Claim steht, waere genau der Fall, den das ganze
   Provenance-Modell verhindern soll: eine erfundene Zahl in
   Markenoptik.

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es fuellt NICHTS mit Platzhaltern. Fehlt das Material fuer die
   gewaehlte Bildform, wird kein Bild erzeugt und der Grund genannt —
   dieselbe Regel, nach der `visual.js` die Form gar nicht erst waehlt.
   Ein Platzhalterbild waere ein Beitrag, der aussieht wie eine Messung.

   Es laedt NICHTS hoch und veroeffentlicht NICHTS. Es schreibt eine
   Datei ins Repository; oeffentlich wird sie erst durch den Deploy der
   Seite, und ein Beitrag daraus erst durch den Publishing-Endpunkt.

   Ausfuehren:
     node scripts/social/render-asset.mjs --package paket.json
     node scripts/social/render-asset.mjs --package paket.json --out-dir assets/social
     node scripts/social/render-asset.mjs --package paket.json --plan-only
   ========================================================================= */
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const VisualQuality = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/visual-quality.js"));
const VisualGrammar = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/visual-grammar.js"));
const ScrollStop = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/scroll-stop.js"));
const Brand = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/brand.js"));
/* Wie viele Stellen eine Zahl hat, rechnet die Komposition - die
   Balkenbeschriftung holt die Antwort von dort, statt sie ein zweites
   Mal zu bilden. */
/* Was innen bleibt und was nach draussen darf, entscheidet eine
   Engine - nicht der Renderer mit einer eigenen Regel. */
const ContentIntelligence = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/content-intelligence.js"));
const VisualComposition = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/visual-composition.js"));

/* Die Palette der Seite. Ein Beitrag in Fremdfarben waere kein
   Vision-Universe-Asset. */
export const FARBEN = {
  schwarz: "#050505",
  weiss:   "#ffffff",
  gedeckt: "#8a8a8a",
  linie:   "#1e1e1e",
  rot:     "#e5231f"
};

/* Welche Bildformen dieses Skript zeichnen kann. Der Rest ist nicht
   "irgendwie auch machbar", sondern ausdruecklich noch nicht gebaut —
   und wird benannt statt ersetzt. */
export const GEZEICHNET = ["DATA_CARD", "NUMBER_VISUAL", "MINIMAL_TYPOGRAPHY"];

export const NICHT_GEZEICHNET = {
  CHART:          "Ein Chart braucht eine Datenreihe und beschriftete Achsen. Beides ist " +
                  "mehr als eine Textebene; ein 'Chart' ohne Reihe waere eine Illustration.",
  MIXED:          "Setzt CHART voraus.",
  MOTION_GRAPHIC: "Bewegtbild. Dieses Skript zeichnet ein Einzelbild.",
  VIDEO:          "Bewegtbild. Dieses Skript zeichnet ein Einzelbild.",
  CAROUSEL:       "Mehrere Seiten. Der Veroeffentlichungspfad kann heute genau ein Bild.",
  ATLAS:          "Braucht das Markenasset und dessen Nutzungsregel.",
  COMPANY_VISUAL: "Braucht ein freigegebenes Asset des Unternehmens."
};

/* Die Hausschrift liegt IM Repository. Sie aus dem Netz zu laden hiesse,
   das Aussehen eines Beitrags an die Erreichbarkeit eines fremden
   Dienstes zu haengen — dasselbe Paket ergaebe mal ein Bild mit Inter,
   mal eines mit der systemeigenen Grotesk. Das waeren zwei verschiedene
   Bilder unter einer Kennung, und der Unterschied fiele erst im Konto
   auf. */
export const SCHRIFT_PFAD = "assets/fonts/inter-latin.woff2";

/* =====================================================================
   DAS LOGO IST EIN ASSET, KEIN GESETZTER TEXT (§11, §18, §44)

   Hier stand bis zuletzt:

       <div class="marke"><b>VISION UNIVERSE</b>&reg;</div>

   Also dieselben Buchstaben in Inter Bold. Das kanonische Zeichen ist
   eine eigene, geometrische Wortmarke - andere Buchstabenformen,
   andere Laufweite, anderes R im Kreis. Nebeneinandergelegt sind es
   zwei verschiedene Zeichen, und §18 nennt genau das beim Namen:
   "Logo nicht neu zeichnen oder textuell approximieren".

   Bitter daran: checkLogoUsage() steht seit diesem Auftrag in
   brand.js und haette das abgewiesen - nur hat es niemand gefragt.
   Ein Tor, das nicht im Weg steht, ist kein Tor, und diesmal stand es
   neben der einzigen Stelle, an der die Marke wirklich gezeichnet
   wird.

   Das Asset ist schwarz und die Karte ist schwarz. Dafuer gibt es
   jetzt genau eine, eng gefasste Transformation
   (`invert-monochrome`), und sie gilt nur fuer ein einfarbiges
   Zeichen. Geometrie, Proportion und Abstaende bleiben unberuehrt.
   ===================================================================== */
export const LOGO_PFAD = "assets/vision-universe-logo.png";

/* Die oeffentlichen Namen unserer Quellen. Sie stehen in
   visual-data.mjs und werden von dort uebernommen - ein zweiter
   Begriff davon, wie unsere Quellen heissen, waere einer zu viel. */
import { QUELLENNAME, QUELLEN_NAMENSRAUM } from "./visual-data.mjs";

/* Die Masse des kanonischen Assets. Sie stehen NICHT hier als Zahlen,
   sondern werden aus der Datei gelesen - eine zweite Angabe koennte
   driften, und dann prueft der Vertrag ein Logo, das es nicht gibt. */
export function logoMasse(root) {
  const pfad = join(root || process.cwd(), LOGO_PFAD);
  const d = readFileSync(pfad);
  /* PNG: IHDR steht immer an Byte 16..24. */
  return { breite: d.readUInt32BE(16), hoehe: d.readUInt32BE(20), bytes: d.length };
}

/* Wie breit das Logo auf der Karte steht: ein Viertel der Flaeche.
   Der Logo-Vertrag laesst 12 bis 40 Prozent zu; 24 liegt in der Mitte
   und ergibt bei 1080 Pixeln Breite eine Signatur von 260 Pixeln. */
export const LOGO_BREITEN_ANTEIL = 0.24;

export function logoKasten(breite, root) {
  const m = logoMasse(root);
  const bw = Math.round(breite * LOGO_BREITEN_ANTEIL);
  return { breite: bw, hoehe: Math.round(bw * (m.hoehe / m.breite)), asset: m };
}

/* Weiss auf #050505. Der Kontrast wird GERECHNET und nicht geschaetzt:
   relative Leuchtdichte nach WCAG, (L1+0.05)/(L2+0.05). */
function leuchtdichte(hex) {
  const k = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}
export function kontrast(a, b) {
  const l1 = leuchtdichte(a), l2 = leuchtdichte(b);
  const [hell, dunkel] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hell + 0.05) / (dunkel + 0.05)) * 100) / 100;
}

/** Das Logo als Data-URI, damit das Bild ohne Netz entsteht. */
export function logoDatenUri(root) {
  return "data:image/png;base64," +
    readFileSync(join(root || process.cwd(), LOGO_PFAD)).toString("base64");
}

/* =====================================================================
   ATLAS WIRD GEZEICHNET, NICHT NUR MODELLIERT

   §16/§17 beschreiben vier Atlas-Rollen mit Flaechenbaendern, brand.js
   fuehrt den Atlas-Vertrag, visual-grammar.js prueft Rolle gegen
   Familie - und auf keinem erzeugten Bild war Atlas je zu sehen. Das
   Modell war vollstaendig und ohne Produktionsweg: ein Vertrag ueber
   etwas, das nie stattfand.

   Aufgefallen ist es nicht in einem Test, sondern beim Ansehen des
   fertigen Bildes. Dasselbe Muster wie beim Logo, das als HTML-Text
   nachgebaut war: die Regel stand da, die einzige Stelle, an der
   gezeichnet wird, kannte sie nicht.

   Wie beim Logo gilt: das kanonische Asset, sonst nichts. Kein
   Textprompt, keine Neuzeichnung, keine Approximation. Erlaubt ist
   genau `scale` - die Figur wird kleiner, nicht anders.
   ===================================================================== */
export const ATLAS_PFAD = Brand.ATLAS_ASSET_PATH;

export function atlasMasse(root) {
  const d = readFileSync(join(root || process.cwd(), ATLAS_PFAD));
  return { breite: d.readUInt32BE(16), hoehe: d.readUInt32BE(20), bytes: d.length };
}

export function atlasDatenUri(root) {
  return "data:image/png;base64," +
    readFileSync(join(root || process.cwd(), ATLAS_PFAD)).toString("base64");
}

/* Welche Rolle der Renderer spielen kann.

   HERO ist ausgeschlossen: als HERO traegt Atlas die AUSSAGE des
   Bildes, und dieser Renderer zeichnet keine Szene - er setzt eine
   Figur an den Rand. Eine Rolle zu behaupten, die das Bild nicht
   einloest, waere genau der Dekorationsfall, den §12 ausschliesst.

   Die Reihenfolge ist eine Vorliebe, keine Rangfolge: anwesend und
   mitsehend, sonst als Absenderzeichen, sonst fuehrend. Was die
   gewaehlte Familie nicht zulaesst, kommt nicht vor. */
const ATLAS_ROLLEN_VORLIEBE = ["ATLAS_OBSERVER", "ATLAS_SIGNATURE", "ATLAS_GUIDE"];

/**
 * Der Atlas-Kasten zu einer Rolle: Pixel aus dem Flaechenband der
 * Rolle und dem Seitenverhaeltnis des ECHTEN Assets.
 *
 * Der angegebene Flaechenanteil wird aus den gerundeten Pixeln
 * zurueckgerechnet. Den beabsichtigten Anteil zu melden waere eine
 * Angabe ueber die Absicht und nicht ueber das Bild.
 */
export function atlasKasten(rolle, breite, hoehe, root) {
  const r = VisualGrammar.ATLAS_ROLLEN[rolle];
  if (!r) return null;
  const m = atlasMasse(root);
  const seite = m.breite / m.hoehe;
  const ziel = (r.flaecheMin + r.flaecheMax) / 2;
  const h = Math.round(Math.sqrt((ziel * breite * hoehe) / seite));
  const b = Math.round(h * seite);
  return { rolle, breite: b, hoehe: h,
    flaechenAnteil: (b * h) / (breite * hoehe), asset: m };
}

/* -------------------------------------------------------------------
   DIE SCHRIFTGROESSEN DES GEZEICHNETEN BILDES

   Sie sind kein Geschmack, sondern eine Eigenschaft des Bildes, die
   sich messen laesst - und die Visual Grammar misst sie. Deshalb
   stehen sie an EINEM Ort und reisen im Plan mit, statt im
   HTML-Template ein zweites Mal aufzutauchen.

   Die Werte in Pixel beziehen sich auf die Flaeche 1080x1350.
   ------------------------------------------------------------------- */
/* -------------------------------------------------------------------
   DIE SEITE VERMISST SICH SELBST

   Die Frage, die §13 stellt - was liest das Auge zuerst - laesst sich
   an Schriftgroessen nicht beantworten. Eine Zahl in 122 Pixeln hat
   die groessere Versalhoehe; ein Satz in 76 Pixeln ueber zwei Zeilen
   hat die dreifache FLAECHE. Gemessen sind es 39.793 gegen 114.356
   Quadratpixel.

   Geschaetzt werden muss das nicht. Der Browser, der das Bild ohnehin
   zeichnet, kennt jede Zeilenbox. Dieses Skript liest sie mit einer
   Range ueber den Textinhalt - also die wirkliche Flaeche der
   Schrift, nicht den Kasten des Elements, der bei einem Block-Element
   immer die volle Breite hat.

   Das Ergebnis landet in einem Element, das `--dump-dom` zurueckgibt.
   Kein Protokoll, kein zweiter Prozess: dieselbe Seite, aus der das
   JPEG entsteht.
   ------------------------------------------------------------------- */
export const MESS_SKRIPT = `<script>
(function(){
  function messen(){
    var out=[];
    var knoten=document.querySelectorAll("[data-vu-rolle]");
    for(var n=0;n<knoten.length;n++){
      var el=knoten[n];
      var rng=document.createRange(); rng.selectNodeContents(el);
      var k=rng.getClientRects();
      var flaeche=0,oben=null,unten=null,links=null,rechts=null;
      for(var i=0;i<k.length;i++){
        flaeche+=k[i].width*k[i].height;
        oben  =oben  ===null?k[i].top   :Math.min(oben,k[i].top);
        unten =unten ===null?k[i].bottom:Math.max(unten,k[i].bottom);
        links =links ===null?k[i].left  :Math.min(links,k[i].left);
        rechts=rechts===null?k[i].right :Math.max(rechts,k[i].right);
      }
      if(!k.length) continue;
      out.push({rolle:el.getAttribute("data-vu-rolle"),
        text:(el.textContent||"").trim(),
        zeilen:k.length,flaeche:Math.round(flaeche),
        oben:Math.round(oben),unten:Math.round(unten),
        links:Math.round(links),rechts:Math.round(rechts),
        schrift:Math.round(parseFloat(getComputedStyle(el).fontSize))});
    }
    /* In ein ATTRIBUT, nicht in ein Element. Der erste Entwurf schrieb
       die Zahlen in ein <div> - und sie standen im fertigen JPEG, unter
       der Quellenzeile, in sechs Zeilen Kleingedrucktem. Der Test sah es
       nicht, das Tor sah es nicht; sichtbar wurde es erst, als jemand
       das Bild ansah. Ein Attribut kann per Konstruktion nicht rendern,
       egal was ein spaeteres Stylesheet tut. */
    document.documentElement.setAttribute("data-vu-messung",JSON.stringify(out));
    /* Figuren getrennt von Text. Eine Figur hat keine Schriftgroesse
       und keine Zeilen; sie in dieselbe Liste zu legen hiesse, die
       Textmessung mit etwas zu fuellen, das kein Text ist. */
    var figuren=[];
    var f=document.querySelectorAll("[data-vu-figur]");
    for(var j=0;j<f.length;j++){
      var e2=f[j]; var r2=e2.getBoundingClientRect();
      if(!r2.width||!r2.height) continue;
      figuren.push({figur:e2.getAttribute("data-vu-figur"),
        rolle:e2.getAttribute("data-vu-atlas-rolle")||null,
        flaeche:Math.round(r2.width*r2.height),
        breite:Math.round(r2.width),hoehe:Math.round(r2.height),
        oben:Math.round(r2.top),unten:Math.round(r2.bottom),
        links:Math.round(r2.left),rechts:Math.round(r2.right)});
    }
    document.documentElement.setAttribute("data-vu-figuren",JSON.stringify(figuren));
  }
  /* -----------------------------------------------------------------
     NICHT WARTEN — MESSEN

     Zwei reale MANUAL_NOW-Laeufe (35711481190, 35713227403) haben
     gezeigt: unter --virtual-time-budget (messeSeite() faehrt
     --dump-dom genau so) kommt in der Chromium-Fassung des Runners
     WEDER document.fonts.ready NOCH ein setTimeout-Rueckfall jemals
     zum Zug - messen() lief in beiden Faellen nie, Atlas- wie
     Textmessung kamen leer zurueck. Ein erster Fix versuchte einen
     setTimeout-Rueckfall (lokal mit echtem Chromium nachgewiesen,
     dass er dort zuverlaessig feuert) - im Runner blieb der Befund
     trotzdem "nicht gemessen": setTimeout wird dort unter
     --dump-dom ebenso wenig getrieben wie ein haengendes Promise.

     Die Schrift ist als Base64-Data-URI eingebettet - kein Netzwerk,
     kein Warten noetig, um SIE zu laden. font-display:block versteckt
     waehrend der Blockphase nur das GEMALTE Bild (unsichtbare
     Tinte); das LAYOUT steht mit der Fallback-Schrift schon fest,
     und genau das misst getClientRects()/getBoundingClientRect() -
     nicht, was gerade gemalt wird. Ein Atlas-<img> mit fester
     width/height braucht ohnehin keine Schrift.

     Gemessen wird deshalb synchron, sobald das Skript laeuft - ohne
     jede Abhaengigkeit von einem Versprechen oder einem Timer, die
     beide in genau diesem Aufruf-Modus nicht zuverlaessig sind. */
  messen();
})();
<\/script>`;

/* ---------------------------------------------------------------------
   WELCHE TEXTEBENE DIE HOOK TRAEGT — EINMAL, NICHT ZWEIMAL

   Diese Regel stand zweimal im Haus: der Kartenpfad verlangte
   ausdruecklich `role: "HOOK"`, der Kompositionspfad nahm die erste
   Ebene, die irgendeinen Text trug. Beide Pfade zeichnen dieselbe
   Kopfzeile, und nur einer war korrigiert - auf dem gezeichneten Bild
   stand deshalb weiter "Lagebeschreibung, keine Prognose.", der
   Nachsatz einer These, gross und oben.

   Zwei Register fuer eine Tatsache: genau das Fehlerbild, das dieses
   Projekt schon bei den Lerndimensionen und beim Quellennamen hatte.
   Die Regel wohnt ab hier an einer Stelle.
   --------------------------------------------------------------------- */
export function hookEbeneAus(pkg) {
  const ebenen = (pkg && pkg.visualBrief && pkg.visualBrief.textLayers) || [];
  return ebenen.find((l) => l && l.text && String(l.text).trim() &&
    String(l.role || l.rolle || "").toUpperCase() === "HOOK") || null;
}

/* ---------------------------------------------------------------------
   DER SATZ, DER IM BILD EINE SEKUNDE LANG ZAEHLT — EINE HERLEITUNG

   plan() brauchte diesen Satz beim Zeichnen und leitete ihn inline her.
   visual-intelligence.js braucht denselben Satz VOR dem Zeichnen, als
   `oneSecondMessage` fuer die Visual-Direction-Ableitung - und bekam
   ihn nicht: run-social-cycle.mjs kannte nur die Herleitung fuer den
   Kompositionspfad (CHART/SCORE/PERFORMANCE/COMPARISON/RANKING) und
   fragte fuer den Kartenpfad (DATA_CARD/NUMBER_VISUAL/MINIMAL_
   TYPOGRAPHY) niemanden. Das Feld blieb leer, obwohl derselbe Satz
   hier laengst berechnet wird - dieselbe Fehlerfamilie wie beim
   Quellennamen zwei Funktionen weiter oben: zwei Register fuer eine
   Tatsache.

   Ab hier gibt es nur noch eines. plan() ruft es jetzt auch auf.
   --------------------------------------------------------------------- */
export function textOnVisualAussage(pkg) {
  const ebene = hookEbeneAus(pkg) || null;
  const text = String(
    (ebene && ebene.text) || pkg.hook || pkg.thesis || pkg.topic || "").trim();
  return {
    text: text || null,
    herkunft: (ebene && ebene.text) ? "visualBrief.textLayers"
      : pkg.hook ? "pkg.hook"
        : pkg.thesis ? "pkg.thesis"
          : pkg.topic ? "pkg.topic" : null
  };
}

/* ---------------------------------------------------------------------
   DER NAME EINER QUELLE IST KEIN SCHLUESSEL

   "Quelle: vu.technical" stand unter einer fertig gezeichneten
   Grafik. `vu.technical` ist unser Schluessel fuer eine Datenreihe,
   kein Name, den jemand kennt - ein interner Systembegriff auf einem
   oeffentlichen Bild.

   Der Kartenpfad bildete den Schluessel schon ab, der
   Kompositionspfad nicht. Statt die Abbildung ein zweites Mal
   einzusetzen, entscheidet ab hier EINE Funktion fuer beide Pfade.

   Zwei Schritte, und der zweite war der erste Entwurf nicht:

     1. Steht der Wert in QUELLENNAME, ist er einer UNSERER Schluessel
        und bekommt seinen oeffentlichen Namen.
     2. Sonst gilt er als Name - es sei denn, er hat die FORM eines
        Schluessels.

   Der erste Entwurf wies alles ab, was nicht im Register stand. Das
   war ein zu weit gebautes Tor: "Bloomberg" ist ein oeffentlicher
   Name und braucht keinen Eintrag, um einer zu sein. QUELLENNAME ist
   das Register unserer eigenen Schluessel, nicht das Verzeichnis aller
   Quellen der Welt - es dafuer zu halten, hat im Test drei richtige
   Bilder verhindert.

   Was ein Schluessel IST, entscheidet content-intelligence.js an
   seiner Form. Diese Frage gehoert dorthin, wo innen und aussen
   getrennt werden, und nicht ein zweites Mal hierher.
   --------------------------------------------------------------------- */
export function quellenName(roh) {
  const text = String(roh === null || roh === undefined ? "" : roh).trim();
  if (!text) return { ok: false, grund: "leer", name: null };
  if (QUELLENNAME[text]) return { ok: true, name: QUELLENNAME[text] };
  const raum = QUELLEN_NAMENSRAUM.find((r) => text.startsWith(r.praefix));
  if (raum) return { ok: true, name: raum.name };
  if (ContentIntelligence.istSystemschluessel(text)) {
    return { ok: false, grund: "systemschluessel", name: null };
  }
  return { ok: true, name: text };
}

/* ---------------------------------------------------------------------
   DIE FIGUR IM MARKUP - EINMAL FUER BEIDE VORLAGEN

   `data-vu-figur` und nicht `data-vu-rolle`: die Messung trennt Text
   von Figur. Ein Atlas in der Textmessung haette als "andere Flaeche"
   gezaehlt und die Hook-Dominanz nach §14 rechnerisch geschlagen -
   ein Tor, das an einer Figur scheitert, misst nicht mehr, was es
   messen soll.
   --------------------------------------------------------------------- */
function atlasBild(p) {
  const a = p && p.atlas;
  if (!a || !p.atlasUri) return "";
  return `<img class="atlas" alt="Atlas" data-vu-figur="ATLAS"
    data-vu-atlas-rolle="${a.rolle}"
    width="${a.breite}" height="${a.hoehe}"
    style="width:${a.breite}px;height:${a.hoehe}px" src="${p.atlasUri}">`;
}

export function textGroessen(visualType) {
  return {
    marke: 26,
    entitaet: 34,
    zahl: visualType === "NUMBER_VISUAL" ? 190 : 122,
    zahlText: 32,
    /* Die Kopfzeile traegt die Hook, und §15 verlangt, dass man sie auf
       einem Telefon LIEST und nicht nur sieht. Die Mobilschwelle der
       Visual Grammar liegt bei 5,5 % der Bildhoehe, also 74 Pixel bei
       1350. Vorher standen hier 58 (und 40 bei NUMBER_VISUAL) - beides
       darunter. */
    aussage: 76,
    beleg: 40,
    quelle: 24,
    /* Das Logo ist kein Schriftgrad, sondern ein Kasten. Er steht hier,
       weil die Vorlagen und der Logo-Vertrag dieselbe Angabe brauchen -
       zwei Kaesten waeren zwei Logos. */
    logo: logoKasten(1080)
  };
}

export function ladeSchrift(wurzel) {
  const pfad = resolve(join(wurzel || process.cwd(), SCHRIFT_PFAD));
  if (!existsSync(pfad)) {
    throw new Error("Hausschrift fehlt: " + SCHRIFT_PFAD + ". Ohne sie wuerde dasselbe " +
      "Paket ein anderes Bild ergeben — deshalb wird nicht gezeichnet.");
  }
  return readFileSync(pfad);
}

/* ----------------------------------------------------------------- Text */

function escape(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function quelleVon(c) {
  return (c && c.source && (c.source.source || c.source.name)) || null;
}

/**
 * Die erste belegte Zahl aus den Claims — samt ihrer Bezeichnung.
 *
 * Genommen wird die ERSTE, nicht die groesste. Eine Auswahl nach Wirkung
 * waere eine redaktionelle Entscheidung, die hier niemand getroffen hat,
 * und sie stuende in keinem Protokoll.
 *
 * -------------------------------------------------------------------------
 * WARUM DIE BEZEICHNUNG AUS EINEM ANDEREN CLAIM KOMMT
 * -------------------------------------------------------------------------
 *
 * Die Content-Engine legt einen Wert als ZWEI Belege ab: einen mit der
 * Zahl (`text: "76 %"`, `numeric: 76`) und einen mit der Bezeichnung
 * (`text: "Relative Staerke"`, `numeric: null`) — beide mit derselben
 * Quelle, weil auch eine Bezeichnung wie "52-Wochen-Hoch" belegpflichtig
 * ist.
 *
 * Wer nur den ersten liest, zeichnet eine Karte, auf der die Zahl
 * zweimal steht und nichts sagt: "76" ueber "76". Das ist schlimmer als
 * keine Karte, denn es sieht aus wie Daten.
 */
export function ersteBelegteZahl(pkg) {
  const claims = (pkg && pkg.claims) || [];

  for (const c of claims) {
    if (!c || c.numeric === null || c.numeric === undefined || c.numeric === "") continue;

    /* Der Anzeigewert ist `text`, nicht `numeric`: dort steht die
       Einheit. Eine Zahl ohne Einheit ist eine andere Aussage. */
    const wert = (c.text !== null && c.text !== undefined && String(c.text).trim())
      ? String(c.text).trim() : String(c.numeric);

    const quelle = quelleVon(c);
    const begleiter = claims.find((x) =>
      x && x !== c &&
      (x.numeric === null || x.numeric === undefined) &&
      String(x.text || "").trim() &&
      quelleVon(x) === quelle);

    const bezeichnung = begleiter ? String(begleiter.text).trim() : null;

    return { wert, bezeichnung, quelle };
  }
  return null;
}

/**
 * Der Plan — ohne Browser, ohne Dateisystem.
 *
 * Getrennt vom Zeichnen, damit die Frage "waere dieses Bild ueberhaupt
 * erzeugbar, und woraus bestuende es" beantwortbar ist, ohne ein
 * Chromium zu starten. Der Zyklus kann das im Schattenbetrieb mitlaufen
 * lassen; ein Test kann es ohne Browser pruefen.
 */
/* -------------------------------------------------------------------
   DIE GRAMMATIK URTEILT UEBER DAS, WAS WIRKLICH GEZEICHNET WIRD

   Sie bekommt den Plan - nicht eine Beschreibung daneben. Was der
   Plan nicht enthaelt, wird nicht ergaenzt; fehlt eine Angabe, faellt
   die zugehoerige Regel als ungemessen durch.

   Der Befund BLOCKIERT hier noch nicht. Das ist keine Nachlaessigkeit,
   sondern die Reihenfolge: der gezeichnete Kartenpfad hat heute keine
   eigene Hook-Ebene, der Satz auf dem Bild ist im Kompositionspfad aus
   Daten gerechnet. Ein Tor, das jedes reale Bild abweist, waere kein
   Qualitaetstor, sondern ein Stillstand. Der Befund wird deshalb
   GEMESSEN, benannt und mitgefuehrt - und die Sperre folgt mit der
   Hook-Ebene (§13/§15).
   ------------------------------------------------------------------- */
function grammatikSpec(entwurf) {
  return VisualGrammar.ausRenderPlan(entwurf, {
    /* Wie viele Werte das Bild wirklich zeigt. Die Karte zeigt genau
       einen, sobald sie eine Zahl traegt - und diese Eins ist es, die
       Rangliste und Vergleich ausschliesst. Ohne sie waere jede
       Datenkarte mehrdeutig. */
    eintraege: entwurf.komposition && Array.isArray(entwurf.komposition.bars)
      ? entwurf.komposition.bars.length
      /* Auch eine Zahl, die nur in der Kopfzeile steht, ist EINE Zahl.
         Gezaehlt wird, WOVON die Karte handelt - nicht, welcher Block
         gezeichnet wurde. Nach der Redundanzaufloesung stand hier
         sonst null, und die Familienwahl wurde wieder mehrdeutig. */
      : ((entwurf.ebenen && (entwurf.ebenen.zahl ||
          entwurf.ebenen.zahlWeggelassen)) ? 1 : null),
    gemesseneReihe: !!(entwurf.komposition &&
      Array.isArray(entwurf.komposition.points)),
    farbwelt: "VU_SCHWARZ_ROT",
    atlas: entwurf.atlas || null
  });
}

/* ---------------------------------------------------------------------
   WELCHE ROLLE ATLAS IN DIESEM BILD SPIELT

   Die Rolle haengt an der Familie - §17 sagt, welche Rollen zu
   welcher Familie passen. Die Familie wiederum wird aus dem Bild
   GEWAEHLT, und in diese Wahl geht Atlas nicht ein: waehleFamilie()
   entscheidet an den Gestaltmerkmalen, nicht an der Figur. Deshalb
   laesst sich erst die Familie bestimmen und dann die Rolle, ohne
   dass daraus ein Kreis wird.

   Passt keine der zeichenbaren Rollen zur Familie, bekommt das Bild
   KEINEN Atlas. Eine Figur in einer Rolle, die die Familie nicht
   kennt, waere schlimmer als keine Figur - visual-grammar.js weist
   sie als ATLAS_ROLLE_PASST_NICHT_ZUR_FAMILIE ab, und zu Recht.
   --------------------------------------------------------------------- */
function atlasPlan(entwurf) {
  const wahl = VisualGrammar.waehleFamilie(grammatikSpec(entwurf));
  const fam = wahl.familie ? VisualGrammar.FAMILIEN[wahl.familie] : null;
  if (!fam) return null;
  const rolle = ATLAS_ROLLEN_VORLIEBE
    .find((r) => (fam.atlasRollen || []).indexOf(r) !== -1);
  if (!rolle) return null;
  const kasten = atlasKasten(rolle, entwurf.breite, entwurf.hoehe);
  if (!kasten) return null;
  return {
    rolle,
    flaechenAnteil: kasten.flaechenAnteil,
    breite: kasten.breite, hoehe: kasten.hoehe,
    /* Die Figur steht neben der Quellenzeile, nicht ueber den Daten.
       Beides sind Tatsachen ueber die Seite, und die Grammatik fragt
       danach. */
    traegtAussage: false,
    vorDaten: false,
    referenceAsset: ATLAS_PFAD,
    transforms: ["scale"],
    familie: wahl.familie
  };
}

function grammatikBefund(entwurf, pkg) {
  const spec = grammatikSpec(entwurf);
  const wahl = VisualGrammar.waehleFamilie(spec);
  if (!wahl.familie) {
    return { familie: null, ok: false, wahlGrund: wahl.grund,
      mehrdeutig: wahl.mehrdeutig || null,
      verstoesse: [{ id: "KEINE_FAMILIE", satz: wahl.grund }],
      erklaerung: wahl.grund,
      dominantesTextRolle: spec.dominantesTextRolle,
      dominantesTextFeld: spec.dominantesTextFeld };
  }
  const urteil = VisualGrammar.pruefe(wahl.familie, spec);
  urteil.wahlGrund = wahl.grund;
  urteil.dominantesTextRolle = spec.dominantesTextRolle;
  urteil.dominantesTextFeld = spec.dominantesTextFeld;
  return urteil;
}

export function plan(pkg, options = {}) {
  const typ = (pkg && pkg.visualType) || null;

  if (!typ) {
    return { ok: false, reason: "noVisualType",
      message: "Das Paket nennt keine Bildform. Der Zyklus hat sich enthalten — " +
        "das ist eine Information und kein fehlender Parameter." };
  }
  if (NICHT_GEZEICHNET[typ]) {
    return { ok: false, reason: "notRenderable", visualType: typ,
      message: "Bildform " + typ + " wird von diesem Skript nicht gezeichnet. " +
        NICHT_GEZEICHNET[typ] };
  }
  if (GEZEICHNET.indexOf(typ) === -1) {
    return { ok: false, reason: "unknownVisualType", visualType: typ,
      message: "Unbekannte Bildform: " + typ + "." };
  }

  /* -------------------------------------------------------------------
     WAS IM BILD STEHT, UND WOHER ES KOMMT

     Zuerst die Textebene des Bildbriefs: das ist der vorgesehene Ort
     fuer das, was im BILD steht, und er ist nicht dasselbe wie die Hook.

     Die Hook ist der Einstieg fuer den Feed. Sie nennt Zahl und
     Kennzahl — beides zeigt die Karte schon gross. Der erste gerenderte
     Kandidat las deshalb:

         76
         Technical Opportunity Score
         XOM: 76 im Technical Opportunity Score.

     Dreimal dasselbe. Die Textebene traegt stattdessen den Satz, der die
     Zahl EINORDNET, und der steht nirgends sonst. Fehlt sie, bleibt die
     Hook als Rueckfall — ein doppelter Text ist immer noch besser als
     gar keiner.
     ------------------------------------------------------------------- */
  /* -------------------------------------------------------------------
     DIE KOPFZEILE IST DIE HOOK - NICHT IRGENDEINE TEXTEBENE

     Hier wurde jede Textebene des Bildbriefs genommen, die Text trug.
     Der Produktnachweis hat gezeigt, wohin das fuehrt: auf der Karte
     stand "Lagebeschreibung, keine Prognose." - der Nachsatz einer
     These, gross, oben, als Einstieg. Ein Satz, der nichts ueber den
     Gegenstand sagt und niemanden anhaelt.

     Die Ebene kam aus `writer.visualLine`, und deren eigener Kommentar
     sagt es woertlich: "Die Zeile FUERS BILD. Nicht die Hook." Sie als
     Hook zu setzen war eine Verwechslung, und SCROLL_STOP hat sie
     durchgelassen, weil dort ein Text in der Rolle HOOK stand - nicht,
     weil er aus der Hook stammte.

     Eine Textebene fuehrt jetzt nur, wenn sie sich ausdruecklich als
     Hook ausweist (`role: "HOOK"`). Sonst fuehrt `pkg.hook`, und die
     Zeile fuers Bild bleibt, was sie ist: ein Beleg eine Zeile tiefer.
     ------------------------------------------------------------------- */
  const ebenen_ = (pkg.visualBrief && pkg.visualBrief.textLayers) || [];
  const hookEbene_ = hookEbeneAus(pkg);
  const bildzeile = ebenen_.find((l) => l && l.text && String(l.text).trim() &&
    l !== hookEbene_);
  const einSekunde = textOnVisualAussage(pkg);
  const aussage = einSekunde.text || "";

  /* -------------------------------------------------------------------
     WOHER DER SATZ STAMMT, ENTSCHEIDET, WAS ER IST

     Derselbe Kasten auf dem Bild traegt je nach Herkunft eine andere
     Rolle: aus der Textebene oder aus der Hook ist er eine HOOK, aus
     These oder Thema ist er eine Ueberschrift, aus der Komposition
     gerechnet ist er ein BELEG.

     Die Visual Grammar fragt danach, und sie darf die Antwort nicht
     raten. Ein Satz, der als Hook GILT, ohne je einer gewesen zu
     sein, ist die bequemste Art, §13 zu bestehen, ohne ihm zu
     genuegen. */
  const aussageHerkunft = einSekunde.herkunft;
  /* Die Zeile fuers Bild bleibt erhalten - als Beleg, eine Zeile
     tiefer. Sie wegzuwerfen hiesse, eine Aussage zu verlieren, die
     nirgends sonst steht. */
  const belegzeile = bildzeile ? String(bildzeile.text).trim() : null;

  if (!aussage) {
    return { ok: false, reason: "noStatement", visualType: typ,
      message: "Weder Textebene noch Hook noch These noch Thema — es gibt nichts zu zeigen." };
  }

  /* Der Name gehoert auf die Karte. Eine Zahl ohne ihren Gegenstand ist
     eine Zahl ohne Aussage — und im Feed sieht man das Bild vor dem
     Text. */
  const entitaet = (pkg.visualBrief && pkg.visualBrief.entity)
    ? String(pkg.visualBrief.entity).trim() : null;

  const ebenen = { aussage, beleg: belegzeile, entitaet, zahl: null,
    zahlText: null, quelle: null };

  if (typ === "DATA_CARD" || typ === "NUMBER_VISUAL") {
    const zahl = ersteBelegteZahl(pkg);
    if (!zahl) {
      /* Dieselbe Regel wie in visual.js: keine Zahlform ohne Zahl. Eine
         Karte mit leerem Zahlenfeld waere ein Beitrag, der etwas
         behauptet, das er nicht hat. */
      return { ok: false, reason: "noNumericClaim", visualType: typ,
        message: "Bildform " + typ + " zeigt eine Zahl, und in den Claims steht keine mit " +
          "belegtem Wert. Ohne Beleg wird nichts gezeichnet." };
    }
    if (!zahl.quelle) {
      return { ok: false, reason: "noSource", visualType: typ,
        message: "Die Zahl " + zahl.wert + " hat keine Quelle. Eine Zahl in Markenoptik " +
          "ohne Herkunft ist genau das, was das Provenance-Modell verhindern soll." };
    }
    if (!zahl.bezeichnung || zahl.bezeichnung === zahl.wert) {
      /* "76" ueber "76". Eine Zahl ohne Namen ist keine Datenkarte,
         sondern eine Behauptung in Markenoptik — und sie sieht genau so
         aus wie eine belegte Aussage. */
      return { ok: false, reason: "noNumberContext", visualType: typ,
        message: "Zur Zahl " + zahl.wert + " gibt es keine Bezeichnung. " +
          "Eine Zahl, die nicht sagt, WOVON sie die Zahl ist, wird nicht gezeichnet." };
    }
    ebenen.zahl = zahl.wert;
    ebenen.zahlText = zahl.bezeichnung;
    /* "vu.technical" ist unser Schluessel, kein Quellenname. Auf der
       Karte stand er trotzdem - der Produktnachweis hat es gezeigt.
       Die Zuordnung gibt es seit jeher in visual-data.mjs; sie hier
       ein zweites Mal zu fuehren waere ein zweiter Begriff davon, wie
       unsere Quellen heissen. */
    const qn = quellenName(zahl.quelle);
    if (!qn.ok) {
      return { ok: false, reason: "unknownSourceName", visualType: typ,
        message: "'" + zahl.quelle + "' hat die Form eines " +
          "Systemschluessels und keinen Eintrag in QUELLENNAME. Einen " +
          "Schluessel ersatzweise abzudrucken hat 'Quelle: vu.technical' " +
          "auf ein fertiges Bild gebracht." };
    }
    ebenen.quelle = qn.name;

    /* -----------------------------------------------------------------
       WENN DIE KOPFZEILE DIE ZAHL SCHON SAGT

       Seit die Kopfzeile die HOOK traegt (§13) und nicht mehr eine
       beliebige Textebene, kann sie dasselbe sagen wie der Zahlenblock
       darunter. Beim Produktnachweis stand genau das auf der Karte:
       "13,4 KGV - Russell 2000." als Einstieg, und darunter noch
       einmal RUSSELL 2000 / 13,4 / KGV.

       Das ist die "dreimal dasselbe"-Karte, die dieses Projekt schon
       einmal hatte. visual-quality.js findet sie - und weist sie ab.
       Abweisen ist hier die falsche Antwort: die Hook ist richtig, die
       Zahl ist belegt, sie wird nur zweimal gezeigt.

       Also wird sie einmal gezeigt. Die Kopfzeile fuehrt (§13), der
       Zahlenblock weicht. Der Beleg geht nicht verloren - er steht im
       selben Satz, nur oben. Was weggelassen wurde, steht im Plan;
       stillschweigend etwas fallen zu lassen waere schlimmer als es
       zweimal zu zeigen.
       ----------------------------------------------------------------- */
    /* Dieselben zwei Fragen, die visual-quality.js stellt - nicht zwei
       neue. Die Zahl: steht sie woertlich im Satz? Die Bezeichnung:
       ueberschneidet sie sich mit ihm? Eine eigene Rechnung hier haette
       eine andere Antwort gegeben als das Tor eine Zeile spaeter, und
       dann haette der Plan genau das behoben, was danach trotzdem
       blockiert. */
    const zahlImText = VisualQuality.wiederholtZahl(aussage, zahl.wert);
    const labelDoppelt = zahl.bezeichnung
      ? VisualQuality.overlap(zahl.bezeichnung, aussage) >=
        VisualQuality.GRENZEN.redundanz : false;
    if (zahlImText || labelDoppelt) {
      ebenen.zahlWeggelassen = {
        wert: zahl.wert, bezeichnung: zahl.bezeichnung,
        zahlImText, labelDoppelt,
        grund: "Die Kopfzeile traegt dieselbe Angabe. Zweimal gezeigt " +
          "ist nicht zweimal so deutlich." };
      ebenen.zahl = null;
      ebenen.zahlText = null;
    }
  }

  var entwurf = {
    ok: true,
    visualType: typ,
    packageId: pkg.packageId || null,
    breite: Number(options.breite) || 1080,
    hoehe: Number(options.hoehe) || 1350,
    ebenen,
    ebenenHerkunft: { aussage: aussageHerkunft },
    textGroessen: textGroessen(typ),
    logoUri: logoDatenUri()
  };

  /* -------------------------------------------------------------------
     EIN TECHNISCH KORREKTES BILD IST NOCH KEIN VEROEFFENTLICHUNGSWUERDIGES

     Bis hierher wurde geprueft, ob sich die Karte ZEICHNEN laesst. Das
     ist eine andere Frage als die, ob sie etwas SAGT. Die erste
     gerenderte Karte war ein gueltiges JPEG in der richtigen Groesse mit
     der richtigen Schrift — und las dreimal dasselbe.
     ------------------------------------------------------------------- */
  /* Die Creative Direction kommt VOR der Erzeugung und reist im Paket
     mit. Hier wird sie nur noch gemeldet - der Befund heisst dann
     VISUAL_DIRECTION_INCOMPLETE und nicht "die Karte sagt nichts".
     Zwei verschiedene Ursachen unter einem Namen waeren genau die
     Verwechslung, gegen die §4 gebaut ist. */
  const guete = VisualQuality.check(entwurf, {
    hook: pkg.hook,
    directionReady: pkg.visualDirectionReady === true,
    directionMissing: pkg.visualDirectionMissing || []
  });
  entwurf.quality = guete;
  /* Atlas VOR dem Grammatik-Urteil: die Rolle ist eine Eigenschaft des
     Bildes, und die Grammatik soll sie pruefen, nicht erfahren. */
  entwurf.atlas = atlasPlan(entwurf);
  if (entwurf.atlas) entwurf.atlasUri = atlasDatenUri();
  entwurf.grammatik = grammatikBefund(entwurf, pkg);

  if (!guete.passed) {
    return { ok: false,
      /* Der Grund traegt den Fehlertyp des Tors, nicht einen
         Sammelnamen. */
      reason: guete.failureType === VisualQuality.VISUAL_DIRECTION_INCOMPLETE
        ? "visualDirection" : "visualQuality",
      failureType: guete.failureType,
      visualType: typ, quality: guete,
      message: guete.failureType === VisualQuality.VISUAL_DIRECTION_INCOMPLETE
        ? "Die Karte laesst sich zeichnen - aber es wurde nie gesagt, was sie " +
          "zeigen soll: " + guete.explanation
        : "Die Karte laesst sich zeichnen, sagt aber nichts: " + guete.explanation };
  }

  return entwurf;
}

/* -------------------------------------------------------------- Zeichnen */

export function seite(p, schriftDaten) {
  const font = schriftDaten
    ? `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${schriftDaten.toString("base64")}) format("woff2");font-weight:100 900;font-display:block}`
    : "";
  const familie = schriftDaten
    ? "Inter, system-ui, sans-serif"
    : "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  /* `schriftDaten === null` gibt es nur, wenn ein Aufrufer es
     ausdruecklich so will (Test ohne Schrift). Der Lauf unten holt die
     Schrift immer und bricht ab, wenn sie fehlt. */

  /* -------------------------------------------------------------------
     DIE ROLLEN STEHEN IM MARKUP

     `data-vu-rolle` ist nicht Dekoration: das Messskript findet die
     Textbloecke daran, und scroll-stop.js urteilt ueber die Rollen.
     Wer hier eine Rolle vergisst, bekommt kein stilles Durchwinken -
     der Block fehlt dann in der Messung, und das Tor faellt
     geschlossen aus. */
  const zahlBlock = p.ebenen.zahl ? `
    <div class="zahlblock">
      ${p.ebenen.entitaet ? `<div class="entitaet" data-vu-rolle="KONTEXT">${escape(p.ebenen.entitaet)}</div>` : ""}
      <div class="zahl" data-vu-rolle="BELEG">${escape(p.ebenen.zahl)}</div>
      ${p.ebenen.zahlText ? `<div class="zahltext" data-vu-rolle="BELEG">${escape(p.ebenen.zahlText)}</div>` : ""}
    </div>` : "";

  const quelle = p.ebenen.quelle
    ? `<div class="quelle" data-vu-rolle="QUELLE">Quelle: ${escape(p.ebenen.quelle)}</div>` : "";

  /* Die Zahl dominiert bei NUMBER_VISUAL, die Aussage bei den anderen.
     Das ist der ganze Unterschied zwischen den beiden Formen — und er
     steht hier als Zahl, nicht als Absicht.

     Die Groessen stehen im PLAN und nicht mehr hier. Der Grund ist
     nicht Ordnung, sondern Pruefbarkeit: die Visual Grammar fragt, wie
     hoch der fuehrende Text ist, und sie darf die Antwort nicht aus
     einer zweiten Kopie derselben Zahlen nehmen. Eine zweite Kopie
     driftet, und dann prueft das Tor ein Bild, das es nicht gibt. */
  const g = p.textGroessen || textGroessen(p.visualType);
  const zahlGroesse = g.zahl;
  /* Der Data-URI kommt aus dem Plan; nur wenn er fehlt (ein Test ohne
     Repositorywurzel), wird er hier geholt. */
  p = Object.assign({}, p, { logoUri: p.logoUri || logoDatenUri() });
  const aussageGroesse = g.aussage;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${font}
*{margin:0;padding:0;box-sizing:border-box}
/* Ein einzelnes langes Wort - ein Ticker, eine URL, ein
   hereingereichter Fremdtext - laeuft sonst ueber den Bildrand und
   wird abgeschnitten. Das faellt auf einem Screenshot auf und im
   Konto zu spaet. Das SCROLL_STOP-Tor hat genau diesen Fall
   gemessen: rechts 1199 auf einer 1080 Pixel breiten Flaeche. */
*{overflow-wrap:anywhere}
html,body{width:${p.breite}px;height:${p.hoehe}px;background:${FARBEN.schwarz};overflow:hidden}
body{font-family:${familie};color:${FARBEN.weiss};
  display:flex;flex-direction:column;justify-content:space-between;
  padding:96px 88px;-webkit-font-smoothing:antialiased}
/* Das kanonische Asset, nicht gesetzter Text (§18). Die Umkehrung ist
   die einzige erlaubte Transformation eines einfarbigen Zeichens:
   schwarz zu weiss, keine Geometrie. */
.marke{display:block;width:${g.logo.breite}px;height:${g.logo.hoehe}px;
  filter:invert(1)}
.mitte{display:flex;flex-direction:column;gap:20px}
.zahlblock{margin-top:38px}
.beleg{font-size:${g.beleg}px;line-height:1.3;font-weight:500;color:${FARBEN.gedeckt};margin-top:18px}
.entitaet{font-size:34px;font-weight:700;letter-spacing:.06em;color:${FARBEN.rot};
  text-transform:uppercase;margin-bottom:16px}
.zahl{font-size:${zahlGroesse}px;line-height:.95;font-weight:800;letter-spacing:-.03em;
  color:${FARBEN.weiss};font-variant-numeric:tabular-nums}
.zahltext{font-size:32px;line-height:1.35;color:${FARBEN.gedeckt};font-weight:500;margin-top:18px}
.aussage{font-size:${aussageGroesse}px;line-height:1.20;font-weight:700;letter-spacing:-.02em;
  max-width:17ch}
.fuss{display:flex;align-items:flex-end;justify-content:space-between;gap:32px}
.absender{display:flex;flex-direction:column;gap:18px}
.strich{height:3px;width:120px;background:${FARBEN.rot}}
.quelle{font-size:24px;color:${FARBEN.gedeckt};font-weight:500}
/* Atlas steht NEBEN der Quellenzeile, nicht ueber den Balken. Eine
   Figur, die den Beleg verdeckt, auf den sich der Beitrag beruft,
   heisst in der Grammatik ATLAS_VERDECKT_DATEN - und in einer Rolle,
   die nicht vor den Daten stehen darf, ist sie ein Verstoss und kein
   Layout. (Keine Backticks in diesem Kommentar: er steht in einem
   Template-Literal, und ein Backtick beendet es.) */
.atlas{display:block;flex:0 0 auto}
</style></head><body>
  <img class="marke" alt="VISION UNIVERSE" src="${p.logoUri || ""}">
  <div class="mitte">
    <div class="aussage" data-vu-rolle="${p.hookRolle || "HOOK"}">${escape(p.ebenen.aussage)}</div>
    ${p.ebenen.beleg ? `<div class="beleg" data-vu-rolle="BELEG">${escape(p.ebenen.beleg)}</div>` : ""}
    ${zahlBlock}
  </div>
  <div class="fuss">
    <div class="absender">
      <div class="strich"></div>
      ${quelle}
    </div>
    ${atlasBild(p)}
  </div>
  ${MESS_SKRIPT}
</body></html>`;
}

/**
 * Der Plan fuer eine gezeichnete Komposition.
 *
 * Unterschied zu `plan()`: dort entsteht eine Karte aus Zahl und
 * Aussage, hier eine Grafik aus den Daten des Objekts. Gemeinsam ist
 * beiden, dass ein Plan ohne tragfaehige Daten NICHT entsteht - das
 * Urteil faellt vor dem ersten Pixel.
 */
export function planKomposition(pkg, komposition, ebenen) {
  if (!komposition || !komposition.ok) {
    return { ok: false, reason: "noComposition",
      visualType: (pkg && pkg.visualType) || null,
      message: "Keine zeichenbare Komposition: " +
        ((komposition && komposition.explanation) || "keine uebergeben.") };
  }
  const e = ebenen || {};
  if (!e.aussage) {
    return { ok: false, reason: "noStatement",
      visualType: (pkg && pkg.visualType) || null,
      message: "Eine Grafik ohne Aussage laesst den Betrachter raten, was " +
        "er sieht. Die Zahlen sagen WAS, nicht WARUM es hier steht." };
  }

  /* -------------------------------------------------------------------
     DIE KOPFZEILE TRAEGT DIE HOOK, NICHT DEN GERECHNETEN SATZ

     Bis hierher stand ueber jeder gezeichneten Grafik das Ergebnis
     einer Rechnung: "Seit 15.08.2025: +12,3 %." Das ist ein BELEG. Er
     beantwortet eine Frage, die im Vorbeiscrollen niemand gestellt
     hat - und §13 verlangt genau die Frage, nicht ihre Antwort.

     Die Hook ruecke deshalb nach oben, der gerechnete Satz eine Zeile
     tiefer. Beide bleiben: der Beleg loest ein, was die Hook
     verspricht. Verschoben wird die Rangfolge, nicht der Inhalt - und
     ohne Hook entsteht kein Plan, statt dass ersatzweise der Beleg
     die Kopfzeile bekommt.
     ------------------------------------------------------------------- */
  const hookEbene = hookEbeneAus(pkg);
  const kopf = String((hookEbene && hookEbene.text) || (pkg && pkg.hook) || "").trim();
  if (!kopf) {
    return { ok: false, reason: "noHookOnVisual",
      visualType: (pkg && pkg.visualType) || komposition.kind,
      message: "Die Grafik traegt keinen Satz, der einen Grund zum " +
        "Anhalten gibt. §13 macht Text-on-Visual zur Vorbedingung: " +
        "der gerechnete Befund ist ein Beleg und keine Hook." };
  }
  /* Derselbe Satz zweimal waere kein Aufbau, sondern ein Doppel. */
  const beleg = (VisualQuality.overlap(kopf, e.aussage) >= 0.6)
    ? null : e.aussage;

  /* -------------------------------------------------------------------
     EINE GEZEICHNETE ZAHL OHNE HERKUNFT WIRD NICHT GEZEICHNET

     Der Kartenpfad weist das seit jeher ab: `noSource`, "eine Zahl in
     Markenoptik ohne Herkunft ist genau das, was das
     Provenance-Modell verhindern soll". Der Kompositionspfad hat es
     gezeichnet - im realen Lauf fuenf Kurse unter einem roten Strich,
     und darunter nichts.

     Dieselbe Regel gilt jetzt fuer beide Wege. Eine Grafik zeigt mehr
     Zahlen als eine Karte, nicht weniger.
     ------------------------------------------------------------------- */
  if (!String(e.quelle || "").trim()) {
    return { ok: false, reason: "noSource",
      visualType: (pkg && pkg.visualType) || komposition.kind,
      message: "Die Grafik zeigt " +
        ((komposition.bars && komposition.bars.length) ||
         (komposition.points && komposition.points.length) || "mehrere") +
        " Werte und nennt keine Quelle. Zahlen in Markenoptik ohne " +
        "Herkunft sind genau das, was das Provenance-Modell " +
        "verhindern soll." };
  }

  /* Dieselbe Pruefung wie im Kartenpfad - und aus demselben Grund. */
  const qn = quellenName(e.quelle);
  if (e.quelle && !qn.ok) {
    return { ok: false, reason: "unknownSourceName",
      visualType: (pkg && pkg.visualType) || komposition.kind,
      message: "'" + e.quelle + "' hat die Form eines Systemschluessels " +
        "und keinen Eintrag in QUELLENNAME. Ein Schluessel unter der " +
        "Grafik ist ein interner Systembegriff auf einem oeffentlichen " +
        "Bild." };
  }
  const entwurf = {
    ok: true,
    visualType: (pkg && pkg.visualType) || komposition.kind,
    modus: "komposition",
    breite: 1080, hoehe: 1350,
    komposition,
    ebenen: { entitaet: e.entitaet || null, aussage: kopf,
      beleg: beleg, quelle: qn.ok ? qn.name : null },
    textGroessen: textGroessen((pkg && pkg.visualType) || komposition.kind),
    logoUri: logoDatenUri(),
    ebenenHerkunft: {
      aussage: hookEbene ? "visualBrief.textLayers" : "pkg.hook",
      beleg: beleg ? "komposition" : null },
    explanation: komposition.kind + ": " + komposition.explanation
  };

  /* -------------------------------------------------------------------
     DERSELBE WEG DURCH DASSELBE TOR

     Dieser Pfad - der, den der reale Zyklus wirklich geht - lief bisher
     an VisualQuality.check() vorbei. Das Tor stand nur im Kartenpfad.
     Ein Tor, das der Produktionsweg umgeht, ist keines; genau dieser
     Befund hat visual-intelligence.js aus dem Abseits geholt, und er
     galt hier unbemerkt weiter.

     Der Befund ueber die Richtung heisst auch hier
     VISUAL_DIRECTION_INCOMPLETE und nicht "keine Komposition".
     ------------------------------------------------------------------- */
  const guete = VisualQuality.check(entwurf, {
    hook: (pkg && pkg.hook) || null,
    directionReady: !!pkg && pkg.visualDirectionReady === true,
    directionMissing: (pkg && pkg.visualDirectionMissing) || []
  });
  entwurf.quality = guete;
  /* Atlas VOR dem Grammatik-Urteil: die Rolle ist eine Eigenschaft des
     Bildes, und die Grammatik soll sie pruefen, nicht erfahren. */
  entwurf.atlas = atlasPlan(entwurf);
  if (entwurf.atlas) entwurf.atlasUri = atlasDatenUri();
  entwurf.grammatik = grammatikBefund(entwurf, pkg);

  if (!guete.passed) {
    const richtung = guete.failureType === VisualQuality.VISUAL_DIRECTION_INCOMPLETE;
    return { ok: false,
      reason: richtung ? "visualDirection" : "visualQuality",
      failureType: guete.failureType,
      visualType: entwurf.visualType, quality: guete,
      message: richtung
        ? "Die Grafik laesst sich zeichnen - aber es wurde nie gesagt, was sie " +
          "zeigen soll: " + guete.explanation
        : "Die Grafik laesst sich zeichnen, sagt aber nichts: " + guete.explanation };
  }

  return entwurf;
}

/* =====================================================================
   DIE GEZEICHNETEN KOMPOSITIONEN

   CHART, SCORE, PERFORMANCE und COMPARISON entstehen aus den Daten
   GENAU DIESES Content Objects — visual-composition.js rechnet das
   Layout, hier wird es gezeichnet. Kein externer Lauf, kein
   Binaertransport, und fuer jedes Objekt ein anderes Bild.
   ===================================================================== */

/** Die Achsenbeschriftung eines Werts, deutsch. */
function zahlDe(x, stellen = 1) {
  return Number(x).toFixed(stellen).replace(".", ",");
}

/* Wie viele Nachkommastellen die Werte einer Grafik wirklich tragen.
   Dieselbe Rechnung fuehrt visual-composition.js fuer den Satz unter
   der Grafik; sie wird von dort geholt, damit Balken und Satz nicht
   verschieden runden. */
const stellenAus = VisualComposition.stellenAus;

function svgChart(k) {
  const farbe = k.direction === "up" ? FARBEN.rot : FARBEN.gedeckt;
  return `<svg width="${k.width}" height="${k.height}" viewBox="0 0 ${k.width} ${k.height}"
    xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${farbe}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${farbe}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${k.area}" fill="url(#fl)"/>
    <path d="${k.path}" fill="none" stroke="${farbe}" stroke-width="5"
      stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${k.points[k.points.length - 1].x.toFixed(2)}"
      cy="${k.points[k.points.length - 1].y.toFixed(2)}" r="11" fill="${farbe}"/>
  </svg>`;
}

function svgBalken(k, opts = {}) {
  /* -------------------------------------------------------------------
     WENIGE BALKEN DUERFEN NICHT WIE EIN TABELLENAUSZUG AUSSEHEN

     Feste 74 Pixel pro Zeile: bei zehn Werten eine Grafik, bei zwei
     ein schmaler Streifen in einer sonst leeren Flaeche. Auf dem
     fertigen Bild sah der Vergleich zweier Indizes aus wie der Export
     einer Datenbank, nicht wie ein Beitrag.

     Die Zeilenhoehe folgt deshalb der Anzahl. Sie wird nicht frei
     gewaehlt, sondern aus einer Zielhoehe geteilt und in ein Band
     gezwungen - sonst wuerde ein einzelner Vergleich die halbe Seite
     einnehmen.
     ------------------------------------------------------------------- */
  const zeile = Math.max(70, Math.min(124, Math.round(560 / k.bars.length)));
  const dick = zeile >= 100 ? 18 : 10;
  const hoehe = k.bars.length * zeile;
  const balken = k.bars.map((b, i) => {
    const y = i * zeile;
    /* Gefuellt, was ueber dem Leitwert liegt oder hervorgehoben ist —
       die Farbe sagt dasselbe wie die Laenge, nur schneller. */
    const stark = opts.highlightAbove ? b.above : b.highlight;
    const farbe = stark ? FARBEN.rot : FARBEN.gedeckt;
    const x = b.from !== undefined ? b.from : 0;
    const breite = b.pixels;
    /* -----------------------------------------------------------------
       DIE ZAHL AM BALKEN IST DIE ZAHL DER QUELLE

       Hier stand `opts.stellen ?? 2`, und der Vergleich rief mit
       `stellen: 0` auf. Auf dem fertigen Bild wurden daraus "22" und
       "13" - aus 21,6 und 13,4. Eine gerundete Zahl ist eine andere
       Zahl, und sie stand unter dem Namen eines Gegenstands als
       dessen Wert.

       Vorrang hat die Schreibweise der Quelle ("184,20" ist nicht
       "184,2"); gibt es keine, entscheiden die Werte selbst, wie
       viele Stellen sie haben. Geraten wird nichts mehr.
       ----------------------------------------------------------------- */
    const wert = opts.prozent
      ? (b.value >= 0 ? "+" : "") + zahlDe(b.value) + " %"
      : (b.anzeige || zahlDe(b.value, opts.stellen ?? stellenAus(k.bars))) +
        (b.max ? " / " + b.max : "");
    return `
      <text x="0" y="${y + 24}" fill="${FARBEN.weiss}" font-size="27"
        font-weight="600">${escape(b.label)}</text>
      <text x="${k.width}" y="${y + 24}" fill="${FARBEN.gedeckt}" font-size="25"
        text-anchor="end" font-weight="500">${escape(wert)}</text>
      <rect x="0" y="${y + 38}" width="${k.width}" height="${dick}" rx="${dick / 2}"
        fill="#ffffff" fill-opacity="0.08"/>
      <rect x="${x.toFixed(2)}" y="${y + 38}" width="${Math.max(breite, 3).toFixed(2)}"
        height="${dick}" rx="${dick / 2}" fill="${farbe}"/>`;
  }).join("");

  const nulllinie = k.zeroX !== undefined
    ? `<line x1="${k.zeroX.toFixed(2)}" y1="0" x2="${k.zeroX.toFixed(2)}" y2="${hoehe}"
         stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>` : "";

  return `<svg width="${k.width}" height="${hoehe}" viewBox="0 0 ${k.width} ${hoehe}"
    xmlns="http://www.w3.org/2000/svg" style="display:block">${nulllinie}${balken}</svg>`;
}

/** Die Seite zu einer Komposition. */
export function seiteKomposition(p, schriftDaten) {
  const k = p.komposition;
  const font = schriftDaten
    ? `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${schriftDaten.toString("base64")}) format("woff2");font-weight:100 900;font-display:block}`
    : "";
  const familie = schriftDaten ? "Inter, system-ui, sans-serif"
    : "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  /* Aus dem Plan, nicht aus einer zweiten Tabelle hier. */
  const g2 = p.textGroessen || textGroessen(p.visualType);
  p = Object.assign({}, p, { logoUri: p.logoUri || logoDatenUri() });

  let grafik = "", achsen = "";
  if (k.kind === "CHART") {
    grafik = svgChart(k);
    achsen = `<div class="achsen"><span>${escape(k.labels.start)}</span>
      <span>${escape(k.labels.end)}</span></div>`;
  } else if (k.kind === "SCORE") {
    grafik = svgBalken(k, { highlightAbove: true, stellen: 2 });
  } else if (k.kind === "PERFORMANCE") {
    grafik = svgBalken(k, { prozent: true });
  } else if (k.kind === "COMPARISON") {
    /* Kein `stellen` mehr: der Vergleich rundete auf ganze Zahlen. */
    grafik = svgBalken(k);
  }

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${font}
*{margin:0;padding:0;box-sizing:border-box}
/* Ein einzelnes langes Wort - ein Ticker, eine URL, ein
   hereingereichter Fremdtext - laeuft sonst ueber den Bildrand und
   wird abgeschnitten. Das faellt auf einem Screenshot auf und im
   Konto zu spaet. Das SCROLL_STOP-Tor hat genau diesen Fall
   gemessen: rechts 1199 auf einer 1080 Pixel breiten Flaeche. */
*{overflow-wrap:anywhere}
html,body{width:${p.breite}px;height:${p.hoehe}px;background:${FARBEN.schwarz};overflow:hidden}
body{font-family:${familie};color:${FARBEN.weiss};
  display:flex;flex-direction:column;justify-content:space-between;
  padding:96px 88px;-webkit-font-smoothing:antialiased}
.marke{display:block;width:${g2.logo.breite}px;height:${g2.logo.hoehe}px;
  filter:invert(1)}
.kopf{margin-bottom:30px}
/* Die Hook fuehrt (§13). Die Kontextzeile stand als Ueberzeile
   darueber - der Blick betritt das Bild oben, und dort las man dann
   die Kennzahl statt des Satzes. Jetzt steht sie darunter. */
.entitaet{font-size:34px;font-weight:700;letter-spacing:.06em;color:${FARBEN.rot};
  text-transform:uppercase;margin-top:18px}
.titel{font-size:${g2.aussage}px;line-height:1.18;font-weight:700;letter-spacing:-.02em;max-width:17ch}
.beleg{font-size:${g2.beleg}px;line-height:1.3;font-weight:500;color:${FARBEN.gedeckt};margin-top:16px}
/* -------------------------------------------------------------------
   DIE GRAFIK WEICHT, NICHT DIE HERKUNFT

   Fuenf Balken und eine dreizeilige Hook ergaben zusammen 1375 Pixel
   auf einer 1350 Pixel hohen Flaeche. Gemessen wurde es erst, als
   jemand hinsah: "Quelle: Tiingo" stand bei y=1346 bis 1375 - unter
   dem Bildrand, von overflow:hidden stillschweigend abgeschnitten.
   Fuenf Zahlen in Markenoptik, ohne Herkunft. Genau das soll das
   Provenance-Modell verhindern.

   Die Grafik ist das Element, das nachgeben kann: ein SVG mit viewBox
   skaliert und bleibt lesbar. Die Quellenzeile kann nicht nachgeben -
   sie ist entweder da oder nicht.
   ------------------------------------------------------------------- */
.mitte{display:flex;flex-direction:column;gap:22px;flex:1 1 auto;min-height:0}
.grafik{flex:0 1 auto;min-height:0;display:flex;align-items:flex-start}
.grafik svg{width:100%;height:auto;max-height:100%}
.achsen{display:flex;justify-content:space-between;font-size:23px;color:${FARBEN.gedeckt};
  font-weight:500;margin-top:14px}
.fuss{display:flex;align-items:flex-end;justify-content:space-between;gap:32px}
.absender{display:flex;flex-direction:column;gap:18px}
.strich{height:3px;width:120px;background:${FARBEN.rot}}
.quelle{font-size:24px;color:${FARBEN.gedeckt};font-weight:500}
/* Siehe Kartenvorlage: die Figur steht neben dem Absender, nie ueber
   den Daten. */
.atlas{display:block;flex:0 0 auto}
</style></head><body>
  <img class="marke" alt="VISION UNIVERSE" src="${p.logoUri || ""}">
  <div class="mitte">
    <div class="kopf">
      <div class="titel" data-vu-rolle="${p.hookRolle || "HOOK"}">${escape(p.ebenen.aussage || "")}</div>
      ${p.ebenen.entitaet ? `<div class="entitaet" data-vu-rolle="KONTEXT">${escape(p.ebenen.entitaet)}</div>` : ""}
      ${p.ebenen.beleg ? `<div class="beleg" data-vu-rolle="BELEG">${escape(p.ebenen.beleg)}</div>` : ""}
    </div>
    <div class="grafik">${grafik}</div>
    ${achsen}
  </div>
  <div class="fuss">
    <div class="absender">
      <div class="strich"></div>
      ${p.ebenen.quelle ? `<div class="quelle" data-vu-rolle="QUELLE">Quelle: ${escape(p.ebenen.quelle)}</div>` : ""}
    </div>
    ${atlasBild(p)}
  </div>
  ${MESS_SKRIPT}
</body></html>`;
}

export function chromiumPfad() {
  const kandidaten = [
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
  ].filter(Boolean);
  const gefunden = kandidaten.find((x) => existsSync(x));
  if (!gefunden) throw new Error("Kein Chromium gefunden. CHROMIUM_PATH setzen.");
  return gefunden;
}

/** Liest Signatur und Groesse aus dem erzeugten JPEG zurueck. */
export function pruefeJpeg(pfad) {
  const roh = readFileSync(pfad);
  const istJpeg = roh[0] === 0xFF && roh[1] === 0xD8 && roh[2] === 0xFF;
  let breite = null, hoehe = null;
  for (let i = 2; i < roh.length - 9; ) {
    if (roh[i] !== 0xFF) { i += 1; continue; }
    const marker = roh[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      hoehe = roh.readUInt16BE(i + 5);
      breite = roh.readUInt16BE(i + 7);
      break;
    }
    i += 2 + roh.readUInt16BE(i + 2);
  }
  return { istJpeg, breite, hoehe, bytes: roh.length };
}

/**
 * Zeichnet den Plan.
 *
 * Zurueckgelesen statt angenommen: ein PNG mit falscher Endung faellt
 * sonst erst im Moment der Veroeffentlichung auf, und dann ist der
 * Anspruch schon angemeldet.
 */
/* -------------------------------------------------------------------
   DIE GEMESSENE SEITE ZURUECKLESEN

   Derselbe Chromium, dieselbe Datei, ein zweiter Lauf mit
   `--dump-dom`. Das Messskript in der Seite hat seine Zahlen bis
   dahin in `#vu-messung` geschrieben.

   Schlaegt das fehl, wird NICHTS zurueckgegeben - keine leere Liste.
   Eine leere Liste hiesse "kein Text auf dem Bild", und das waere
   eine Aussage ueber das Bild, die in Wahrheit eine Aussage ueber das
   Werkzeug ist. Genau diese Verwechslung hat in diesem Projekt schon
   einen Bericht erfunden.
   ------------------------------------------------------------------- */
export function messeSeite(htmlPfad, breite, hoehe) {
  /* -----------------------------------------------------------------
     DREI REALE LAEUFE SCHEITERTEN AN DERSELBEN MELDUNG, UND KEINER
     SAGTE WARUM

     "Atlas nicht gemessen" / "MESSUNG_FEHLT" blieb ueber drei
     verschiedene Fixversuche identisch (Promise, Promise+Timeout,
     synchron ohne jede Wartezeit) - ein starkes Indiz, dass die
     Ursache nicht im Timing lag, sondern hier: der catch-Block warf
     jede Information weg, mit der sich das je haette unterscheiden
     lassen. War es ein Chromium-Absturz (--dump-dom scheiterte), oder
     lief die Seite durch und das Attribut fehlte trotzdem?

     Bis eine echte Ursache gemessen ist, wird sie protokolliert -
     nicht geraten. Das Verhalten bei Erfolg bleibt unveraendert. */
  let dom;
  try {
    dom = execFileSync(chromiumPfad(), [
      "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--virtual-time-budget=5000",
      `--window-size=${breite},${hoehe}`,
      "--dump-dom", "file://" + htmlPfad
    ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    console.error("messeSeite: --dump-dom ist gescheitert. status=" +
      (err && err.status) + " signal=" + (err && err.signal) +
      " stderr=" + String((err && err.stderr) || "").slice(0, 2000));
    return null;
  }

  const treffer = /data-vu-messung="([^"]*)"/.exec(dom);
  if (!treffer) {
    /* Erste Runde der Diagnose zeigte: die Seite laedt (DOM-Laenge
       250KB+, die eingebettete Schrift kommt an), <script> kommt als
       Zeichenkette vor - aber weder das Attribut noch der Quelltext
       von messen() sind auffindbar. Das beantwortet nicht, OB das
       <script>-Element wirklich da ist oder wo genau es verloren
       geht - deshalb hier der naechste, praezisere Ausschnitt statt
       einer weiteren Vermutung. */
    const si = dom.search(/<script/i);
    console.error("messeSeite: --dump-dom lief durch, aber data-vu-messung " +
      "fehlt. DOM-Laenge=" + dom.length + " enthaelt <script>=" +
      (si !== -1) + " enthaelt messen(): " + /function\s+messen/i.test(dom) +
      " enthaelt data-vu-figur=" + dom.includes("data-vu-figur") +
      " enthaelt html-Tag=" + /<html[^>]*>/i.test(dom));
    if (si !== -1) {
      console.error("messeSeite: Ausschnitt um <script> (Position " + si +
        "): " + JSON.stringify(dom.slice(Math.max(0, si - 80), si + 300)));
    }
    console.error("messeSeite: Anfang des Dumps: " + JSON.stringify(dom.slice(0, 300)));
    console.error("messeSeite: Ende des Dumps: " + JSON.stringify(dom.slice(-300)));
    return null;
  }
  let texte;
  try { texte = JSON.parse(entkommen(treffer[1])); } catch (err) {
    console.error("messeSeite: data-vu-messung ist kein gueltiges JSON: " +
      (err && err.message));
    return null;
  }
  if (!Array.isArray(texte)) return null;

  /* Figuren fehlen duerfen - eine Seite ohne Atlas hat keine. Eine
     KAPUTTE Figurenliste darf aber nicht als "keine Figur" gelesen
     werden: das waere wieder unbekannt als leer. */
  let figuren = [];
  const tf = /data-vu-figuren="([^"]*)"/.exec(dom);
  if (tf) {
    try { figuren = JSON.parse(entkommen(tf[1])); } catch { return null; }
    if (!Array.isArray(figuren)) return null;
  }
  return { breite, hoehe, texte, figuren };
}

/**
 * Was von der gemessenen Seite ueber den Rand ragt.
 *
 * Eine eigene Funktion, weil sich der Fall in der Praxis kaum noch
 * herstellen laesst: die Grafik weicht, und zu langen Text weist
 * visual-quality.js schon vorher ab. Ein Tor, das man nicht ausloesen
 * kann, laesst sich auch nicht pruefen - und ungeprueft ist es eine
 * Behauptung.
 *
 * Geprueft wird es deshalb an der ECHTEN Messung des Vorfalls: fuenf
 * Balken, eine dreizeilige Hook, und "Quelle: Tiingo" bei y=1346..1375
 * auf einer 1350 Pixel hohen Seite.
 *
 * Ohne Messung gibt es NICHTS zurueck - eine leere Liste hiesse "alles
 * im Bild", und das waere eine Aussage ueber die Seite, die in
 * Wahrheit eine ueber das Werkzeug ist.
 */
export function ausserhalb(messung, breite, hoehe) {
  if (!messung) return [];
  const raus = [];
  const pruefe = (name, r) => {
    if (r.unten > hoehe || r.oben < 0 || r.rechts > breite || r.links < 0) {
      raus.push(name + " (" + r.links + "," + r.oben + ")-(" +
        r.rechts + "," + r.unten + ")");
    }
  };
  (messung.texte || []).forEach((t) => pruefe(t.rolle, t));
  (messung.figuren || []).forEach((f) => pruefe("FIGUR:" + f.figur, f));
  return raus;
}

/** Die DOM-Ausgabe ist HTML-kodiert; das JSON darin will es nicht sein. */
function entkommen(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function render(p, zielPfad, options = {}) {
  if (!p.ok) throw new Error("Kein zeichenbarer Plan: " + p.message);

  const arbeit = join(tmpdir(), `vu-asset-${process.pid}-${Date.now()}.html`);
  writeFileSync(arbeit, p.komposition
    ? seiteKomposition(p, options.schrift || null)
    : seite(p, options.schrift || null));
  mkdirSync(dirname(zielPfad), { recursive: true });

  execFileSync(chromiumPfad(), [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${p.breite},${p.hoehe}`,
    `--screenshot=${zielPfad}`,
    "file://" + arbeit
  ], { stdio: ["ignore", "ignore", "pipe"] });

  if (!existsSync(zielPfad)) throw new Error("Chromium hat keine Datei geschrieben.");

  const befund = pruefeJpeg(zielPfad);
  if (!befund.istJpeg) throw new Error("Die Ausgabe ist kein JPEG (Signatur passt nicht).");
  if (befund.breite !== p.breite || befund.hoehe !== p.hoehe) {
    throw new Error(`Erwartet ${p.breite}x${p.hoehe}, erhalten ${befund.breite}x${befund.hoehe}.`);
  }

  /* -----------------------------------------------------------------
     SCROLL_STOP_QUALITY — DAS TOR STEHT HIER, WEIL ES HIER MESSBAR IST

     §13 ist eine Owner-Entscheidung und kein Ratschlag: ein Feed-Post
     ohne starken Text im Bild ist nicht produktionsreif. Das Urteil
     braucht die gerenderte Seite - vorher gibt es keine Textflaechen,
     ueber die sich reden liesse. Also steht es hier, unmittelbar
     hinter dem Bild und vor jedem, der das Bild bekommt.

     `render()` wirft bereits, wenn die Ausgabe kein JPEG ist oder die
     Masse nicht stimmen. Ein Bild ohne fuehrenden Text gehoert in
     dieselbe Kategorie: es ist kein veroeffentlichungsfaehiges Asset.
     ----------------------------------------------------------------- */
  const messung = messeSeite(arbeit, p.breite, p.hoehe);
  const scrollStop = ScrollStop.pruefe({ messung, caption: options.caption || null });

  /* -----------------------------------------------------------------
     DER LOGO-VERTRAG, ENDLICH IM WEG (§11/§18)

     checkLogoUsage() stand in brand.js, mit sieben Pruefungen und elf
     Tests - und niemand hat es an der einzigen Stelle gefragt, an der
     die Marke wirklich gezeichnet wird. Die Karte trug deshalb bis
     zuletzt "VISION UNIVERSE" in Inter Bold, also genau die textuelle
     Approximation, die der Vertrag abweist.

     Ein Tor, das nicht im Weg steht, ist kein Tor. Jetzt steht es hier,
     mit den GEMESSENEN Groessen: dem Kasten aus derselben Tabelle, aus
     der die Vorlage ihn nimmt, und dem gerechneten Kontrast zwischen
     Zeichenfarbe und Untergrund.
     ----------------------------------------------------------------- */
  const logoKast = (p.textGroessen && p.textGroessen.logo) ||
    logoKasten(p.breite);
  const logoBefund = Brand.checkLogoUsage({
    referenceAsset: Brand.LOGO_ASSET_PATH,
    transforms: ["place", "scale-uniform", "invert-monochrome"],
    monochrom: true,
    generationMode: "asset-transform",
    canvas: { width: p.breite, height: p.hoehe },
    box: { x: 88, y: 96, width: logoKast.breite, height: logoKast.hoehe },
    /* Weiss auf der Kartenfarbe, nach WCAG gerechnet. Der Feldname ist
       der, den brand.js liest - ein danebenliegender Name waere eine
       Pruefung, die still nichts tut. */
    kontrast: kontrast(FARBEN.weiss, FARBEN.schwarz)
  });
  if (!logoBefund.passed) {
    const fehler = new Error("Logo-Vertrag nicht bestanden (§18): " +
      logoBefund.explanation);
    fehler.zustand = "LOGO_VERTRAG_VERLETZT";
    fehler.logo = logoBefund;
    throw fehler;
  }

  /* -----------------------------------------------------------------
     DER ATLAS-VERTRAG, AN DERSELBEN STELLE (§11/§17)

     Dieselbe Geschichte wie beim Logo, nur eine Figur weiter:
     checkAtlasUsage() stand seit dem Brand-Auftrag in brand.js, und
     die einzige Stelle, an der gezeichnet wird, hat nie gefragt -
     weil hier ueberhaupt kein Atlas gezeichnet wurde.

     Zusaetzlich wird die GEZEICHNETE Flaeche gegen das Band der
     erklaerten Rolle gehalten. Die Rolle zu melden und die Pixel
     nicht zu pruefen waere eine Angabe ueber die Absicht: eine
     Signatur, die ein Viertel des Bildes einnimmt, wuerde sich
     weiter Signatur nennen.
     ----------------------------------------------------------------- */
  let atlasBefund = null;
  if (p.atlas) {
    atlasBefund = Brand.checkAtlasUsage({
      referenceAsset: p.atlas.referenceAsset,
      generationMode: "asset-transform",
      transforms: p.atlas.transforms
    });
    const gemessen = ((messung && messung.figuren) || [])
      .find((f) => f && f.figur === "ATLAS");
    const band = VisualGrammar.ATLAS_ROLLEN[p.atlas.rolle];
    if (!gemessen) {
      atlasBefund = { passed: false, problems: ["Die Figur wurde auf der " +
        "Seite nicht gemessen. Ein Atlas im Plan, der im Bild fehlt, ist " +
        "eine Rolle ohne Figur."], explanation: "Atlas nicht gemessen." };
    } else if (band) {
      const anteil = gemessen.flaeche / (p.breite * p.hoehe);
      if (anteil < band.flaecheMin || anteil > band.flaecheMax) {
        atlasBefund = { passed: false, problems: ["Gemessen " +
          Math.round(anteil * 1000) / 10 + " % der Flaeche; " + p.atlas.rolle +
          " laesst " + Math.round(band.flaecheMin * 1000) / 10 + " bis " +
          Math.round(band.flaecheMax * 1000) / 10 + " % zu."],
          explanation: "Die gezeichnete Flaeche passt nicht zur Rolle." };
      } else {
        atlasBefund = Object.assign({}, atlasBefund,
          { gemessen, flaechenAnteil: anteil });
      }
    }
    if (!atlasBefund.passed) {
      const fehler = new Error("Atlas-Vertrag nicht bestanden (§17): " +
        atlasBefund.explanation);
      fehler.zustand = "ATLAS_VERTRAG_VERLETZT";
      fehler.atlas = atlasBefund;
      throw fehler;
    }
  }

  /* -----------------------------------------------------------------
     WAS AUSSERHALB DER FLAECHE LIEGT, IST NICHT AUF DEM BILD

     `overflow:hidden` schneidet ab, ohne etwas zu sagen. Beim realen
     Zyklus stand die Quellenzeile bei y=1346..1375 auf einer 1350
     Pixel hohen Seite: sie war im Markup, sie war im Plan, sie war im
     Bericht - und sie war nicht im Bild.

     Die Seite misst sich seit §13 selbst. Bis hierher wurde diese
     Messung nur nach der Hook gefragt. Jetzt wird sie gefragt, ob
     ueberhaupt etwas herausragt: jede gemessene Zeile und jede Figur
     gegen die vier Raender. Ein Tor, das nur EIN Element prueft, ist
     fuer alle anderen keines.
     ----------------------------------------------------------------- */
  const draussen = ausserhalb(messung, p.breite, p.hoehe);
  if (draussen.length) {
    const fehler = new Error("Teile der Seite liegen ausserhalb der " +
      p.breite + "x" + p.hoehe + " Flaeche und werden abgeschnitten: " +
      draussen.join(", ") + ".");
    fehler.zustand = "INHALT_AUSSERHALB_DER_FLAECHE";
    fehler.draussen = draussen;
    throw fehler;
  }

  if (!scrollStop.ok && options.scrollStopPruefen !== false) {
    const fehler = new Error("SCROLL_STOP_QUALITY nicht bestanden (" +
      scrollStop.zustand + "): " + scrollStop.erklaerung);
    fehler.zustand = scrollStop.zustand;
    fehler.scrollStop = scrollStop;
    throw fehler;
  }

  return Object.assign({ pfad: zielPfad }, befund,
    { messung, scrollStop, logo: logoBefund, atlas: atlasBefund });
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const flag = (n) => args.includes("--" + n);

  const PAKET = arg("package", null);
  const OUTDIR = arg("out-dir", "assets/social");
  const BREITE = Number(arg("width", 1080));
  const HOEHE = Number(arg("height", 1350));

  if (!PAKET) {
    console.error("Kein --package. Erwartet wird ein Content Package als Datei.");
    process.exit(2);
  }
  if (!existsSync(PAKET)) { console.error("Datei nicht gefunden: " + PAKET); process.exit(2); }

  const pkg = JSON.parse(readFileSync(PAKET, "utf8"));
  const p = plan(pkg, { breite: BREITE, hoehe: HOEHE });

  console.log("VISION UNIVERSE SOCIAL — Asset-Erzeugung");
  console.log("Paket:     " + (pkg.packageId || "(ohne Kennung)"));
  console.log("Bildform:  " + (pkg.visualType || "keine"));

  if (!p.ok) {
    /* Ein benannter Abbruch, kein Platzhalter. */
    console.log("\nKEIN BILD — " + p.reason);
    console.log(p.message);
    process.exit(3);
  }

  console.log("Aussage:   " + p.ebenen.aussage);
  if (p.ebenen.zahl) console.log("Zahl:      " + p.ebenen.zahl + "  (Quelle: " + p.ebenen.quelle + ")");

  if (flag("plan-only")) {
    console.log("\n(--plan-only: es wurde nichts gezeichnet.)");
    process.exit(0);
  }

  if (!p.packageId) {
    console.error("\nDas Paket hat keine Kennung. Der Dateiname waere nicht zuordenbar, " +
      "und der Veroeffentlichungsanspruch haengt an genau dieser Kennung.");
    process.exit(2);
  }

  const ziel = resolve(join(OUTDIR, p.packageId + ".jpg"));
  let schrift;
  try { schrift = ladeSchrift(process.cwd()); }
  catch (err) { console.error("\n" + err.message); process.exit(4); }

  const befund = render(p, ziel, { schrift });

  console.log("\n[ok] " + ziel);
  console.log("     " + befund.breite + "x" + befund.hoehe + ", " + statSync(ziel).size + " Bytes, JPEG");
}

/* =========================================================================
   DAS BILD, DAS SCHON EXISTIERT

   -------------------------------------------------------------------------
   WARUM UEBERNEHMEN UND NICHT ZEICHNEN
   -------------------------------------------------------------------------

   Der Creative Agent ist nicht nur Autor, sondern Visual Producer. Sein
   Bild wurde erzeugt, committet, frisch zurueckgelesen und gegen Hash,
   MIME und Abmessungen bestaetigt.

   Zeichnete der Zyklus daraufhin seine eigene Karte, waere dieses Bild
   im letzten Schritt verschwunden — und der Kandidat trueg ein Visual,
   das der Agent nie gemacht hat, waehrend sein geprueftes Asset
   ungenutzt im Request-Verzeichnis liegt.

   -------------------------------------------------------------------------
   WARUM UEBERHAUPT EINE UMWANDLUNG
   -------------------------------------------------------------------------

   Der Agent liefert PNG. Der Veroeffentlichungspfad verlangt JPEG —
   nicht als Geschmacksfrage: die Bild-Veroeffentlichung der Graph API
   nimmt JPEG. Ein PNG unter der Endung .jpg waere ein Fehler, der erst
   im Moment der Veroeffentlichung auffaellt, und dann ist der Anspruch
   schon angemeldet.

   Umgewandelt wird mit demselben Chromium, das die Karten zeichnet:
   eine Seite, die nur aus dem Bild besteht, aufgenommen in seiner
   eigenen Groesse. Keine zusaetzliche Abhaengigkeit, und dieselbe
   Rueckleseprobe wie beim Zeichnen.

   -------------------------------------------------------------------------
   WAS DABEI NICHT PASSIEREN DARF
   -------------------------------------------------------------------------

   Skalieren, Beschneiden, Nachschaerfen. Das Bild ist das Werk des
   Agenten; die Umwandlung ist ein Formatwechsel und keine Bearbeitung.
   Weicht die Groesse der Aufnahme von der des Originals ab, ist das ein
   Fehler und kein Rundungsproblem.
   ========================================================================= */

/** Der Bildplan fuer ein bereits vorhandenes, geprueftes Asset. */
export function planUebernahme(pkg, asset) {
  if (!asset || !asset.asset_path) {
    return { ok: false, reason: "noAsset",
      message: "Kein Asset zum Uebernehmen." };
  }
  /* ASSET_VERIFIED kommt aus asset-store.js und bedeutet dasselbe wie
     READBACK_VERIFIED: frisch zurueckgelesen und gegen die Ankuendigung
     geprueft. Die beiden Namen stammen aus zwei Schichten, die
     unabhaengig gewachsen sind - hier stehen sie nebeneinander, statt
     dass eine Schicht die andere umbenennt und dabei Daten umdeutet. */
  var VERIFIZIERT = ["READBACK_VERIFIED", "COMPLETED", "ASSET_VERIFIED"];
  if (VERIFIZIERT.indexOf(asset.state) === -1) {
    return { ok: false, reason: "assetNotVerified", visualType: "GENERATIVE",
      message: "Das Asset steht auf " + asset.state + ". Nur ein frisch " +
        "zurueckgelesenes Asset darf uebernommen werden." };
  }
  if (!asset.width || !asset.height) {
    return { ok: false, reason: "noDimensions", visualType: "GENERATIVE",
      message: "Das Asset nennt keine Abmessungen." };
  }
  return {
    ok: true,
    modus: "uebernahme",
    visualType: "GENERATIVE",
    quelle: asset.asset_path,
    breite: asset.width,
    hoehe: asset.height,
    sha256: asset.asset_sha256 || null,
    mimeType: asset.mime_type || null,
    /* Ein uebernommenes Bild hat keine Textebene, die sich pruefen
       liesse — es traegt laut Brief gar keinen Text. Die Bildguete der
       Karten ist hier deshalb nicht anwendbar, und das steht da, statt
       stillschweigend als "bestanden" zu gelten. */
    quality: { applicable: false,
      explanation: "Generatives Bild ohne Textebene. Die Kartenpruefung " +
        "misst Redundanz, Vollstaendigkeit und Lesbarkeit von Text und " +
        "trifft hier auf nichts." }
  };
}

/** Wandelt das vorhandene Asset nach JPEG und liest das Ergebnis zurueck. */
export function uebernimm(p, zielPfad, options = {}) {
  if (!p.ok || p.modus !== "uebernahme") {
    throw new Error("Kein uebernehmbarer Plan: " + (p.message || "unbekannt"));
  }
  const wurzel = options.root || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const quellPfad = join(wurzel, p.quelle);
  if (!existsSync(quellPfad)) {
    throw new Error("Das Asset liegt nicht unter " + p.quelle + ".");
  }

  /* Noch einmal am Datentraeger nachgesehen. Zwischen Pruefung und
     Uebernahme liegt ein Schreibvorgang, und ein abgeschnittener
     Transfer hat einen intakten Anfang. */
  const roh = readFileSync(quellPfad);
  if (p.sha256) {
    const ist = createHash("sha256").update(roh).digest("hex");
    if (ist !== p.sha256) {
      throw new Error("Das Asset auf dem Datentraeger hat den Hash " + ist +
        ", erwartet war " + p.sha256 + ".");
    }
  }

  const daten = "data:" + (p.mimeType || "image/png") + ";base64," + roh.toString("base64");
  const seiteHtml = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" +
    "html,body{margin:0;padding:0;background:#000;}" +
    "img{display:block;width:" + p.breite + "px;height:" + p.hoehe + "px;}" +
    "</style></head><body><img src=\"" + daten + "\"></body></html>";

  const arbeit = join(tmpdir(), `vu-uebernahme-${process.pid}-${Date.now()}.html`);
  writeFileSync(arbeit, seiteHtml);
  mkdirSync(dirname(zielPfad), { recursive: true });

  execFileSync(chromiumPfad(), [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${p.breite},${p.hoehe}`,
    `--screenshot=${zielPfad}`,
    "file://" + arbeit
  ], { stdio: ["ignore", "ignore", "pipe"] });

  if (!existsSync(zielPfad)) throw new Error("Chromium hat keine Datei geschrieben.");

  const befund = pruefeJpeg(zielPfad);
  if (!befund.istJpeg) throw new Error("Die Ausgabe ist kein JPEG (Signatur passt nicht).");
  if (befund.breite !== p.breite || befund.hoehe !== p.hoehe) {
    throw new Error(`Die Umwandlung hat die Groesse veraendert: erwartet ` +
      `${p.breite}x${p.hoehe}, erhalten ${befund.breite}x${befund.hoehe}. ` +
      `Ein Formatwechsel darf das Bild nicht bearbeiten.`);
  }
  return Object.assign({ pfad: zielPfad, modus: "uebernahme", quelle: p.quelle }, befund);
}

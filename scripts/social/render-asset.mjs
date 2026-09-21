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
  }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(messen);}
  else{messen();}
})();
<\/script>`;

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
    quelle: 24
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
function grammatikBefund(entwurf, pkg) {
  const spec = VisualGrammar.ausRenderPlan(entwurf, {
    /* Wie viele Werte das Bild wirklich zeigt. Die Karte zeigt genau
       einen, sobald sie eine Zahl traegt - und diese Eins ist es, die
       Rangliste und Vergleich ausschliesst. Ohne sie waere jede
       Datenkarte mehrdeutig. */
    eintraege: entwurf.komposition && Array.isArray(entwurf.komposition.bars)
      ? entwurf.komposition.bars.length
      : (entwurf.ebenen && entwurf.ebenen.zahl ? 1 : null),
    gemesseneReihe: !!(entwurf.komposition &&
      Array.isArray(entwurf.komposition.points)),
    farbwelt: "VU_SCHWARZ_ROT"
  });
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
  const ebene = ((pkg.visualBrief && pkg.visualBrief.textLayers) || [])
    .find((l) => l && l.text && String(l.text).trim());
  const aussage = String(
    (ebene && ebene.text) || pkg.hook || pkg.thesis || pkg.topic || "").trim();

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
  const aussageHerkunft = (ebene && ebene.text) ? "visualBrief.textLayers"
    : pkg.hook ? "pkg.hook"
      : pkg.thesis ? "pkg.thesis"
        : pkg.topic ? "pkg.topic" : null;

  if (!aussage) {
    return { ok: false, reason: "noStatement", visualType: typ,
      message: "Weder Textebene noch Hook noch These noch Thema — es gibt nichts zu zeigen." };
  }

  /* Der Name gehoert auf die Karte. Eine Zahl ohne ihren Gegenstand ist
     eine Zahl ohne Aussage — und im Feed sieht man das Bild vor dem
     Text. */
  const entitaet = (pkg.visualBrief && pkg.visualBrief.entity)
    ? String(pkg.visualBrief.entity).trim() : null;

  const ebenen = { aussage, entitaet, zahl: null, zahlText: null, quelle: null };

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
    ebenen.quelle = zahl.quelle;
  }

  var entwurf = {
    ok: true,
    visualType: typ,
    packageId: pkg.packageId || null,
    breite: Number(options.breite) || 1080,
    hoehe: Number(options.hoehe) || 1350,
    ebenen,
    ebenenHerkunft: { aussage: aussageHerkunft },
    textGroessen: textGroessen(typ)
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
.marke{font-size:26px;letter-spacing:.20em;text-transform:uppercase;color:${FARBEN.gedeckt};
  font-weight:600}
.marke b{color:${FARBEN.weiss};font-weight:700}
.mitte{display:flex;flex-direction:column;gap:20px}
.zahlblock{margin-top:38px}
.entitaet{font-size:34px;font-weight:700;letter-spacing:.06em;color:${FARBEN.rot};
  text-transform:uppercase;margin-bottom:16px}
.zahl{font-size:${zahlGroesse}px;line-height:.95;font-weight:800;letter-spacing:-.03em;
  color:${FARBEN.weiss};font-variant-numeric:tabular-nums}
.zahltext{font-size:32px;line-height:1.35;color:${FARBEN.gedeckt};font-weight:500;margin-top:18px}
.aussage{font-size:${aussageGroesse}px;line-height:1.20;font-weight:700;letter-spacing:-.02em;
  max-width:17ch}
.fuss{display:flex;flex-direction:column;gap:18px}
.strich{height:3px;width:120px;background:${FARBEN.rot}}
.quelle{font-size:24px;color:${FARBEN.gedeckt};font-weight:500}
</style></head><body>
  <div class="marke" data-vu-rolle="SIGNATUR"><b>VISION UNIVERSE</b>®</div>
  <div class="mitte">
    <div class="aussage" data-vu-rolle="${p.hookRolle || "HOOK"}">${escape(p.ebenen.aussage)}</div>
    ${zahlBlock}
  </div>
  <div class="fuss">
    <div class="strich"></div>
    ${quelle}
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
  const hookEbene = ((pkg && pkg.visualBrief && pkg.visualBrief.textLayers) || [])
    .find((l) => l && l.text && String(l.text).trim());
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
  const entwurf = {
    ok: true,
    visualType: (pkg && pkg.visualType) || komposition.kind,
    modus: "komposition",
    breite: 1080, hoehe: 1350,
    komposition,
    ebenen: { entitaet: e.entitaet || null, aussage: kopf,
      beleg: beleg, quelle: e.quelle || null },
    textGroessen: textGroessen((pkg && pkg.visualType) || komposition.kind),
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
  const zeile = 74;
  const hoehe = k.bars.length * zeile;
  const balken = k.bars.map((b, i) => {
    const y = i * zeile;
    /* Gefuellt, was ueber dem Leitwert liegt oder hervorgehoben ist —
       die Farbe sagt dasselbe wie die Laenge, nur schneller. */
    const stark = opts.highlightAbove ? b.above : b.highlight;
    const farbe = stark ? FARBEN.rot : FARBEN.gedeckt;
    const x = b.from !== undefined ? b.from : 0;
    const breite = b.pixels;
    const wert = opts.prozent
      ? (b.value >= 0 ? "+" : "") + zahlDe(b.value) + " %"
      : zahlDe(b.value, opts.stellen ?? 2) + (b.max ? " / " + b.max : "");
    return `
      <text x="0" y="${y + 24}" fill="${FARBEN.weiss}" font-size="27"
        font-weight="600">${escape(b.label)}</text>
      <text x="${k.width}" y="${y + 24}" fill="${FARBEN.gedeckt}" font-size="25"
        text-anchor="end" font-weight="500">${escape(wert)}</text>
      <rect x="0" y="${y + 38}" width="${k.width}" height="10" rx="5"
        fill="#ffffff" fill-opacity="0.08"/>
      <rect x="${x.toFixed(2)}" y="${y + 38}" width="${Math.max(breite, 3).toFixed(2)}"
        height="10" rx="5" fill="${farbe}"/>`;
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
    grafik = svgBalken(k, { stellen: 0 });
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
.marke{font-size:26px;letter-spacing:.20em;text-transform:uppercase;color:${FARBEN.gedeckt};font-weight:600}
.marke b{color:${FARBEN.weiss};font-weight:700}
.kopf{margin-bottom:30px}
.entitaet{font-size:34px;font-weight:700;letter-spacing:.06em;color:${FARBEN.rot};
  text-transform:uppercase;margin-bottom:14px}
.titel{font-size:${g2.aussage}px;line-height:1.18;font-weight:700;letter-spacing:-.02em;max-width:17ch}
.beleg{font-size:${g2.beleg}px;line-height:1.3;font-weight:500;color:${FARBEN.gedeckt};margin-top:16px}
.mitte{display:flex;flex-direction:column;gap:22px}
.achsen{display:flex;justify-content:space-between;font-size:23px;color:${FARBEN.gedeckt};
  font-weight:500;margin-top:14px}
.fuss{display:flex;flex-direction:column;gap:18px}
.strich{height:3px;width:120px;background:${FARBEN.rot}}
.quelle{font-size:24px;color:${FARBEN.gedeckt};font-weight:500}
</style></head><body>
  <div class="marke" data-vu-rolle="SIGNATUR"><b>VISION UNIVERSE</b>®</div>
  <div class="mitte">
    <div class="kopf">
      ${p.ebenen.entitaet ? `<div class="entitaet" data-vu-rolle="KONTEXT">${escape(p.ebenen.entitaet)}</div>` : ""}
      <div class="titel" data-vu-rolle="${p.hookRolle || "HOOK"}">${escape(p.ebenen.aussage || "")}</div>
      ${p.ebenen.beleg ? `<div class="beleg" data-vu-rolle="BELEG">${escape(p.ebenen.beleg)}</div>` : ""}
    </div>
    ${grafik}
    ${achsen}
  </div>
  <div class="fuss">
    <div class="strich"></div>
    ${p.ebenen.quelle ? `<div class="quelle" data-vu-rolle="QUELLE">Quelle: ${escape(p.ebenen.quelle)}</div>` : ""}
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
  let dom;
  try {
    dom = execFileSync(chromiumPfad(), [
      "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--virtual-time-budget=5000",
      `--window-size=${breite},${hoehe}`,
      "--dump-dom", "file://" + htmlPfad
    ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }

  const treffer = /data-vu-messung="([^"]*)"/.exec(dom);
  if (!treffer) return null;
  let texte;
  try { texte = JSON.parse(entkommen(treffer[1])); } catch { return null; }
  if (!Array.isArray(texte)) return null;
  return { breite, hoehe, texte };
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

  if (!scrollStop.ok && options.scrollStopPruefen !== false) {
    const fehler = new Error("SCROLL_STOP_QUALITY nicht bestanden (" +
      scrollStop.zustand + "): " + scrollStop.erklaerung);
    fehler.zustand = scrollStop.zustand;
    fehler.scrollStop = scrollStop;
    throw fehler;
  }

  return Object.assign({ pfad: zielPfad }, befund,
    { messung, scrollStop });
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

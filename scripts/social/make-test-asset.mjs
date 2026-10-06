/* =========================================================================
   VISION UNIVERSE SOCIAL — make-test-asset.mjs

   Erzeugt das Bild fuer den Publishing-Testbeitrag.

   Warum ueberhaupt ein eigenes Asset: das bisher verwendete Bild war ein
   Fallback-Vorschaubild der Nachrichtenseite. Es ist abstrakt, seine
   Herkunft ist im Repository nicht dokumentiert, und es sagt einem
   Betrachter nicht, was er da sieht. Ein Beitrag aus einem
   Unternehmenskonto sollte beides koennen: sich selbst erklaeren und
   nachweislich uns gehoeren.

   Warum ein Skript und keine hochgeladene Datei: so ist nachvollziehbar,
   woraus das Bild besteht. Farben, Groesse und Text stehen hier im
   Klartext; das Ergebnis laesst sich jederzeit identisch neu erzeugen.

   -------------------------------------------------------------------------
   ABHAENGIGKEITEN
   -------------------------------------------------------------------------

   Keine. Dieses Repository hat keinen Paketmanager-Stand, und dafuer
   einen einzufuehren waere ein groesserer Eingriff als das Bild wert ist.
   Gezeichnet wird mit dem Chromium, der ohnehin vorhanden ist, ueber
   seinen Schalter --screenshot. Er schreibt JPEG, wenn die Zieldatei so
   heisst — und JPEG ist genau das, was Instagram fuer einen Bildbeitrag
   annimmt.

   Die Hausschrift Inter wird, wenn erreichbar, einmal geladen und in die
   Seite eingebettet. Ist sie es nicht, faellt die Darstellung auf eine
   systemeigene Grotesk zurueck — das Skript sagt dann, dass es das getan
   hat, statt ein anderes Bild als dasselbe auszugeben.

   Ausfuehren:
     node scripts/social/make-test-asset.mjs
     node scripts/social/make-test-asset.mjs --out pfad.jpg --size 1080
     node scripts/social/make-test-asset.mjs --font /pfad/inter.woff2
   ========================================================================= */
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : args[i + 1];
}

const OUT  = resolve(arg("out", "assets/social/vu-social-publishing-test.jpg"));
const SIZE = Number(arg("size", 1080));
const FONT = arg("font", null);

/* Die Farben stammen aus index.html — dieselbe Palette wie die Seite.
   Ein Testbild in Fremdfarben waere kein Vision-Universe-Asset. */
const SCHWARZ = "#050505";   /* --black */
const WEISS   = "#ffffff";   /* --white */
const GEDECKT = "#8a8a8a";   /* zwischen --muted und --line */
const ROT     = "#e5231f";   /* --red, der einzige Akzent der Marke */

/* Die Aufschrift. Genau diese zwei Zeilen, nichts sonst. */
const ZEILE_1 = "VISION UNIVERSE";
const ZEICHEN = "®";
const ZEILE_2 = "Social Publishing Test";

/* -------------------------------------------------------------------------
   Schrift
   ------------------------------------------------------------------------- */
async function ladeInter() {
  if (FONT) {
    if (!existsSync(FONT)) throw new Error(`Schriftdatei nicht gefunden: ${FONT}`);
    return { daten: readFileSync(FONT), quelle: FONT };
  }
  try {
    /* Der Browser-Kennung wegen: ohne sie liefert Google Fonts das
       aeltere TTF-Format statt woff2. */
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
      { headers: { "user-agent": ua } }
    ).then((r) => (r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status))));

    /* Google liefert je Unicode-Bereich einen Block. Gebraucht wird der
       lateinische — erkennbar daran, dass er U+0041 abdeckt. Ihn ueber
       die Reihenfolge zu raten waere eine Annahme; hier wird gelesen. */
    const bloecke = css.split("@font-face").slice(1);
    const latein = bloecke.find((b) => /unicode-range:[^;]*U\+0000-00FF/i.test(b)) ||
                   bloecke[bloecke.length - 1];
    const url = (latein.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (!url) throw new Error("keine woff2-Adresse im CSS");

    const daten = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    return { daten, quelle: url };
  } catch (err) {
    return { daten: null, quelle: null, fehler: String(err && err.message || err) };
  }
}

/* -------------------------------------------------------------------------
   Die Seite
   ------------------------------------------------------------------------- */
function seite(schrift) {
  const eingebettet = schrift
    ? `@font-face{font-family:Inter;font-weight:100 900;font-display:block;
         src:url(data:font/woff2;base64,${schrift.toString("base64")}) format('woff2')}`
    : "";

  /* Alle Maße relativ zur Kantenlaenge: das Bild bleibt in jeder Groesse
     dasselbe Bild. */
  const e = (f) => (SIZE * f).toFixed(2) + "px";

  /* Ein sehr feines Rauschen ueber der Flaeche.

     Nicht als Gestaltung, sondern gegen Streifenbildung: der Verlauf
     geht von #141414 nach #050505, also ueber fuenfzehn Helligkeits-
     stufen auf rund 670 Pixel. Das sind ~45 Pixel je Stufe — auf einem
     Telefon sichtbare Ringe, und JPEG wie auch die Nachverdichtung
     durch Instagram verstaerken sie. Rauschen bricht die Stufenkanten
     auf; es ist die uebliche Antwort auf dieses Problem. */
  const rauschen = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/>` +
    `</filter><rect width='180' height='180' filter='url(%23n)'/></svg>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${eingebettet}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${SIZE}px;height:${SIZE}px}
body{
  background:${SCHWARZ};
  /* Eine sehr zurueckhaltende Aufhellung zur Mitte. Ohne sie wirkt eine
     grosse schwarze Flaeche im Instagram-Raster wie ein Ladefehler. */
  background-image:radial-gradient(ellipse 78% 62% at 50% 44%, #141414 0%, ${SCHWARZ} 72%);
  font-family:Inter,'Liberation Sans','DejaVu Sans',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  display:flex;align-items:center;justify-content:center;
}
.dither{
  position:fixed;inset:0;
  background-image:url("data:image/svg+xml;utf8,${rauschen}");
  background-size:${e(0.1667)} ${e(0.1667)};
  opacity:.035;
  pointer-events:none;
}
.mitte{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center}
.regel{width:${e(0.074)};height:${e(0.0028)};background:${ROT};margin-bottom:${e(0.072)}}
.wortmarke{
  color:${WEISS};
  font-size:${e(0.0735)};
  font-weight:700;
  letter-spacing:${e(0.0092)};
  /* Der Buchstabenabstand haengt rechts an — ohne Ausgleich sitzt die
     Zeile sichtbar links von der Mitte. */
  text-indent:${e(0.0092)};
  line-height:1;
  white-space:nowrap;
}
.marke{
  /* Hochgestellt und kleiner, wie in einer Wortmarke ueblich. Der Text
     bleibt derselbe — das ist Typografie, keine Aenderung der Aufschrift. */
  font-size:.34em;
  vertical-align:.86em;
  letter-spacing:0;
  margin-left:${e(0.004)};
}
.zeile2{
  color:${GEDECKT};
  font-size:${e(0.0315)};
  font-weight:400;
  letter-spacing:${e(0.0022)};
  text-indent:${e(0.0022)};
  margin-top:${e(0.045)};
  line-height:1;
  white-space:nowrap;
}
</style></head><body><div class="dither"></div><div class="mitte">
<div class="regel"></div>
<div class="wortmarke">${ZEILE_1}<span class="marke">${ZEICHEN}</span></div>
<div class="zeile2">${ZEILE_2}</div>
</div></body></html>`;
}

/* -------------------------------------------------------------------------
   Zeichnen
   ------------------------------------------------------------------------- */
function chromiumPfad() {
  const kandidaten = [
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
  ].filter(Boolean);
  const gefunden = kandidaten.find((p) => existsSync(p));
  if (!gefunden) {
    throw new Error("Kein Chromium gefunden. CHROMIUM_PATH setzen oder einen installieren.");
  }
  return gefunden;
}

const schrift = await ladeInter();
if (!schrift.daten) {
  console.log(`[hinweis] Inter nicht geladen (${schrift.fehler}) — systemeigene Grotesk.`);
} else {
  console.log(`[ok] Inter eingebettet (${schrift.daten.length} Bytes)`);
}

const arbeit = `${tmpdir()}/vu-test-asset-${process.pid}.html`;
writeFileSync(arbeit, seite(schrift.daten));
mkdirSync(dirname(OUT), { recursive: true });

execFileSync(chromiumPfad(), [
  "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  /* Ohne dies zeichnet der Browser mit der Geraeteaufloesung des Hosts
     und das Bild kaeme in einer anderen Groesse heraus als bestellt. */
  "--force-device-scale-factor=1",
  `--window-size=${SIZE},${SIZE}`,
  `--screenshot=${OUT}`,
  "file://" + arbeit
], { stdio: ["ignore", "ignore", "pipe"] });

if (!existsSync(OUT)) throw new Error("Chromium hat keine Datei geschrieben.");

/* Zurueckgelesen statt angenommen: ein JPEG beginnt mit FF D8 FF. Ein
   PNG mit falscher Endung wuerde Instagram ablehnen, und zwar erst im
   Moment der Veroeffentlichung. */
const roh = readFileSync(OUT);
const istJpeg = roh[0] === 0xFF && roh[1] === 0xD8 && roh[2] === 0xFF;
if (!istJpeg) throw new Error("Die Ausgabe ist kein JPEG (Signatur passt nicht).");

/* Groesse aus dem SOF-Segment lesen — dieselbe Pruefung, die auch ein
   Bildbetrachter machen wuerde. */
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

console.log(`[ok] ${OUT}`);
console.log(`     ${breite}x${hoehe}, ${statSync(OUT).size} Bytes, JPEG`);
if (breite !== SIZE || hoehe !== SIZE) {
  console.log(`[WARNUNG] erwartet waren ${SIZE}x${SIZE}`);
  process.exitCode = 1;
}

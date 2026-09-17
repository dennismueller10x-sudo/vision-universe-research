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
import { execFileSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";

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

  return {
    ok: true,
    visualType: typ,
    packageId: pkg.packageId || null,
    breite: Number(options.breite) || 1080,
    hoehe: Number(options.hoehe) || 1350,
    ebenen
  };
}

/* -------------------------------------------------------------- Zeichnen */

function seite(p, schriftDaten) {
  const font = schriftDaten
    ? `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${schriftDaten.toString("base64")}) format("woff2");font-weight:100 900;font-display:block}`
    : "";
  const familie = schriftDaten
    ? "Inter, system-ui, sans-serif"
    : "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  /* `schriftDaten === null` gibt es nur, wenn ein Aufrufer es
     ausdruecklich so will (Test ohne Schrift). Der Lauf unten holt die
     Schrift immer und bricht ab, wenn sie fehlt. */

  const zahlBlock = p.ebenen.zahl ? `
    <div class="zahlblock">
      ${p.ebenen.entitaet ? `<div class="entitaet">${escape(p.ebenen.entitaet)}</div>` : ""}
      <div class="zahl">${escape(p.ebenen.zahl)}</div>
      ${p.ebenen.zahlText ? `<div class="zahltext">${escape(p.ebenen.zahlText)}</div>` : ""}
    </div>` : "";

  const quelle = p.ebenen.quelle
    ? `<div class="quelle">Quelle: ${escape(p.ebenen.quelle)}</div>` : "";

  /* Die Zahl dominiert bei NUMBER_VISUAL, die Aussage bei den anderen.
     Das ist der ganze Unterschied zwischen den beiden Formen — und er
     steht hier als Zahl, nicht als Absicht. */
  const zahlGroesse = p.visualType === "NUMBER_VISUAL" ? 190 : 122;
  const aussageGroesse = p.visualType === "NUMBER_VISUAL" ? 40 : 58;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${font}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${p.breite}px;height:${p.hoehe}px;background:${FARBEN.schwarz};overflow:hidden}
body{font-family:${familie};color:${FARBEN.weiss};
  display:flex;flex-direction:column;justify-content:space-between;
  padding:96px 88px;-webkit-font-smoothing:antialiased}
.marke{font-size:26px;letter-spacing:.20em;text-transform:uppercase;color:${FARBEN.gedeckt};
  font-weight:600}
.marke b{color:${FARBEN.weiss};font-weight:700}
.mitte{display:flex;flex-direction:column;gap:20px}
.zahlblock{margin-bottom:34px}
.entitaet{font-size:34px;font-weight:700;letter-spacing:.06em;color:${FARBEN.rot};
  text-transform:uppercase;margin-bottom:16px}
.zahl{font-size:${zahlGroesse}px;line-height:.95;font-weight:800;letter-spacing:-.03em;
  color:${FARBEN.weiss};font-variant-numeric:tabular-nums}
.zahltext{font-size:32px;line-height:1.35;color:${FARBEN.gedeckt};font-weight:500;margin-top:18px}
.aussage{font-size:${aussageGroesse}px;line-height:1.24;font-weight:650;letter-spacing:-.015em;
  max-width:19ch}
.fuss{display:flex;flex-direction:column;gap:18px}
.strich{height:3px;width:120px;background:${FARBEN.rot}}
.quelle{font-size:24px;color:${FARBEN.gedeckt};font-weight:500}
</style></head><body>
  <div class="marke"><b>VISION UNIVERSE</b>®</div>
  <div class="mitte">
    ${zahlBlock}
    <div class="aussage">${escape(p.ebenen.aussage)}</div>
  </div>
  <div class="fuss">
    <div class="strich"></div>
    ${quelle}
  </div>
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
export function render(p, zielPfad, options = {}) {
  if (!p.ok) throw new Error("Kein zeichenbarer Plan: " + p.message);

  const arbeit = join(tmpdir(), `vu-asset-${process.pid}-${Date.now()}.html`);
  writeFileSync(arbeit, seite(p, options.schrift || null));
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
  return Object.assign({ pfad: zielPfad }, befund);
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

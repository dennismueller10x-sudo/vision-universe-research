/* =========================================================================
   VU SOCIAL — der Inhalt des Testbeitrags (IN1–IN12)

   Dieser Beitrag ist das einzige Artefakt des Projekts, das ein Fremder
   zu sehen bekommt. Der Owner hat Bild und Wortlaut einzeln freigegeben.
   Eine Freigabe, die nirgends festgehalten ist, ist beim naechsten
   Aufraeumen weg — also steht sie hier.

   Geprueft wird der Zustand, der DEPLOYT wird: wrangler.toml und die
   Datei, auf die sie zeigt. Nicht eine Kopie der Werte in dieser Datei.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, "..", "..");
const TOML = readFileSync(join(WURZEL, "workers/vision-universe-social/wrangler.toml"), "utf8");

function wert(name) {
  const m = TOML.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, "m"));
  return m ? m[1] : null;
}

const BILD_URL = wert("VU_SOCIAL_SMOKE_IMAGE_URL");
const CAPTION  = wert("VU_SOCIAL_SMOKE_CAPTION");

/* Der vom Owner freigegebene Wortlaut. Zeichen fuer Zeichen. */
const FREIGEGEBEN =
  "Technischer Test unserer Social-Infrastruktur. Dieser Beitrag dient " +
  "ausschließlich der Überprüfung des Publishing-Workflows.";

/* -------------------------------------------------------------------------
   Die Bildunterschrift
   ------------------------------------------------------------------------- */

test("IN1 — die Caption ist exakt der freigegebene Wortlaut", () => {
  assert.equal(CAPTION, FREIGEGEBEN);
});

test("IN2 — keine Hashtags", () => {
  assert.equal((CAPTION.match(/#/g) || []).length, 0,
    "Ein Hashtag traegt den Beitrag in fremde Feeds. Das war nicht freigegeben.");
});

test("IN3 — keine Erwaehnungen", () => {
  assert.equal((CAPTION.match(/@/g) || []).length, 0,
    "Eine Erwaehnung benachrichtigt ein fremdes Konto.");
});

test("IN4 — keine Verweise", () => {
  /* Instagram macht Links in der Caption ohnehin nicht klickbar. Sie
     stehen dann als roher Text da und laden zum Abtippen ein — bei einem
     Testbeitrag genau das Falsche. */
  assert.equal(/https?:\/\/|www\./i.test(CAPTION), false);
});

test("IN5 — Umlaute stehen ausgeschrieben, nicht als ue/oe/ae/ss", () => {
  /* Die uebrige Konfiguration ist bewusst ASCII. Diese eine Zeile ist es
     nicht, und das ist kein Versehen: sie wird oeffentlich gelesen.
     "ausschliesslich" auf dem Profil eines Unternehmens sieht aus wie ein
     Fehler — der Test haelt fest, dass die Umschrift nicht
     zurueckkommt. */
  assert.ok(CAPTION.includes("ß"), "das scharfe s fehlt");
  assert.ok(CAPTION.includes("Ü"), "das grosse U-Umlaut fehlt");
  assert.ok(CAPTION.includes("ü"), "das kleine u-Umlaut fehlt");
  assert.equal(/ausschliesslich|Ueberpruefung/i.test(CAPTION), false);
});

test("IN6 — die Caption bleibt unter dem Instagram-Limit", () => {
  assert.ok(CAPTION.length <= 2200, `${CAPTION.length} Zeichen`);
});

test("IN7 — die Caption ueberlebt die URL-Kodierung zur Graph API", () => {
  /* graph.js setzt die Parameter ueber URLSearchParams. Wenn der Wortlaut
     dort verlustfrei durchgeht, kommt bei Meta an, was hier steht. Sonst
     entstuende der Unterschied erst im veroeffentlichten Beitrag. */
  const p = new URLSearchParams();
  p.set("caption", CAPTION);
  assert.equal(new URLSearchParams(p.toString()).get("caption"), FREIGEGEBEN);
});

/* -------------------------------------------------------------------------
   Das Bild
   ------------------------------------------------------------------------- */

test("IN8 — das Bild ist ein eigenes Asset auf der eigenen Seite", () => {
  const u = new URL(BILD_URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.hostname, "research.visionuniverse.de");
  assert.match(u.pathname, /^\/assets\/social\//,
    "Das Test-Asset gehoert unter assets/social/, nicht zwischen die Bilder anderer Bereiche.");
});

test("IN9 — die Adresse und die Datei im Repository beschreiben dasselbe", () => {
  /* Die Adresse wird von GitHub Pages aus dem Default-Branch bedient.
     Zeigt sie auf einen Pfad, den es im Repository nicht gibt, faellt das
     sonst erst auf, wenn Meta das Bild abholen soll. */
  const pfad = join(WURZEL, new URL(BILD_URL).pathname.replace(/^\//, ""));
  assert.ok(existsSync(pfad), `Es gibt keine Datei ${pfad}`);
});

test("IN10 — die Datei ist tatsaechlich ein JPEG", () => {
  /* Nach der Signatur, nicht nach der Endung: eine PNG-Datei mit der
     Endung .jpg wuerde Instagram ablehnen, und zwar erst im Moment der
     Veroeffentlichung. */
  const roh = readFileSync(join(WURZEL, new URL(BILD_URL).pathname.replace(/^\//, "")));
  assert.equal(roh[0], 0xFF);
  assert.equal(roh[1], 0xD8);
  assert.equal(roh[2], 0xFF);
});

test("IN11 — das Seitenverhaeltnis liegt in dem, was Instagram annimmt", () => {
  const roh = readFileSync(join(WURZEL, new URL(BILD_URL).pathname.replace(/^\//, "")));
  let breite = null, hoehe = null;
  for (let i = 2; i < roh.length - 9; ) {
    if (roh[i] !== 0xFF) { i += 1; continue; }
    const m = roh[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      hoehe = roh.readUInt16BE(i + 5);
      breite = roh.readUInt16BE(i + 7);
      break;
    }
    i += 2 + roh.readUInt16BE(i + 2);
  }
  assert.ok(breite && hoehe, "Groesse nicht lesbar");

  /* Instagram nimmt fuer einen Bildbeitrag zwischen 4:5 (0.8) und 1.91:1
     und eine Breite von 320 bis 1440 px. Ausserhalb wird beschnitten oder
     abgelehnt — beides erfaehrt man sonst erst am veroeffentlichten
     Beitrag. */
  const verhaeltnis = breite / hoehe;
  assert.ok(verhaeltnis >= 0.8 && verhaeltnis <= 1.91,
    `Seitenverhaeltnis ${verhaeltnis.toFixed(3)} liegt ausserhalb von 0.8 bis 1.91`);
  assert.ok(breite >= 320 && breite <= 1440, `Breite ${breite} px`);
});

test("IN12 — das Vorschaubild der Nachrichtenseite wird nicht mehr verwendet", () => {
  /* Es war ein Fallback-Thumbnail: abstrakt, Herkunft im Repository nicht
     dokumentiert, und es sagte einem Betrachter nicht, was er sieht. Der
     Test haelt fest, dass der Rueckgriff darauf nicht unbemerkt
     zurueckkommt. */
  assert.equal(/news-small-caps|news-dax|news-us-tech/.test(BILD_URL), false);
});

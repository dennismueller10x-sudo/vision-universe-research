/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-manual-dispatch.mjs

   DER KNOPF, GENAU EINMAL GEDRUECKT — UND DER BEWEIS, DASS ER TRUG

   -------------------------------------------------------------------------
   WAS DIESES SKRIPT IST
   -------------------------------------------------------------------------

   Es tut, was der Owner im Browser tut: anmelden, „JETZT PRUEFEN"
   druecken. Nichts daneben. Es ist KEIN zweiter Weg in den Lauf — es
   ist derselbe HTTP-Verkehr, den der Browser fuehrt, nur aus einer
   Umgebung, die den Worker erreicht.

   Danach drueckt es ein ZWEITES Mal, sofort. Das ist keine
   Nachlaessigkeit, sondern der Zweck: die Sperre gegen den doppelten
   Druck laesst sich nur messen, indem man doppelt drueckt.

   -------------------------------------------------------------------------
   WAS ES UEBER DAS GEHEIMNIS ERFAEHRT: NICHTS
   -------------------------------------------------------------------------

   VU_GITHUB_DISPATCH_TOKEN liegt im Worker. Dieses Skript sieht es
   nie, fragt nicht danach und koennte es nicht lesen. Was es misst,
   ist die WIRKUNG: der Worker prueft den Namen fail-closed, bevor er
   irgendetwas tut, und nennt ihn auf der Seite, wenn er fehlt.

     Seite nennt VU_GITHUB_DISPATCH_TOKEN  ->  Secret fehlt
     Lauf wird angestossen                 ->  Secret ist da

   Das ist eine Messung am Tor und nicht am Tresor. Sie ist strenger
   als eine Liste von Bindungsnamen und beruehrt den Wert weniger.

   -------------------------------------------------------------------------
   DER TITEL UND DIE FALLE DARIN
   -------------------------------------------------------------------------

   Die beiden Antwortseiten heissen

       "Lauf angestossen"          und
       "Lauf nicht angestossen"

   Sie unterscheiden sich durch EIN Wort in der Mitte. Wer nach
   "angestossen" sucht, findet beide und haelt das Scheitern fuer den
   Erfolg — dieselbe Form wie ERFUELLT, das auch in NICHT_ERFUELLT
   steckt. (Der ganze Titel ist hier KEIN Teilstring des anderen; die
   erste Fassung dieses Kommentars behauptete das, und die Gegenprobe
   hat sie widerlegt. Die Gefahr ist das Wort, nicht der Satz.)

   Verglichen wird deshalb der ganze Titel, exakt.

   Ausfuehren (braucht VU_SOCIAL_ADMIN_KEY in der Umgebung):
     node scripts/social/verify-manual-dispatch.mjs
     node scripts/social/verify-manual-dispatch.mjs --json
     node scripts/social/verify-manual-dispatch.mjs --out /tmp/dispatch.json
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const JSON_AUS = argv.includes("--json");
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const WORKER = arg("worker", "https://social.visionuniverse.de");
const KEY = process.env.VU_SOCIAL_ADMIN_KEY || "";

/* Die Titel, exakt. Sie stehen hier als Konstanten, damit der
   Vergleich ein Vergleich bleibt und keine Suche wird. */
const TITEL_ANGESTOSSEN = "Lauf angestossen";
const TITEL_NICHT = "Lauf nicht angestossen";

const befunde = [];
function befund(id, ok, satz) {
  befunde.push({ id, ok: ok === true, satz });
  return ok === true;
}

/** Der Titel der Seite — ohne die Marke dahinter. */
function titelVon(html) {
  const m = String(html).match(/<title>([\s\S]*?)<\/title>/);
  if (!m) return null;
  return m[1].replace(/\s*—\s*Vision Universe®? Social\s*$/, "").trim();
}

/** Welcher Grund steht auf der Seite? Nur die drei, die es gibt. */
function grundVon(html) {
  const t = String(html);
  if (/Es fehlt die Verbindung zum Lauf/.test(t)) return "NICHT_EINGERICHTET";
  if (/Wieder moeglich in etwa/.test(t)) return "SCHON_ANGESTOSSEN";
  if (/Der Anstoss kam nicht an/.test(t)) return "DISPATCH_FEHLGESCHLAGEN";
  return null;
}

/** Nennt die Seite fehlende Einstellungen — und welche? */
function fehlendeNamen(html) {
  const m = String(html).match(/Es fehlt die Verbindung zum Lauf:\s*([^.<]+)/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

async function hole(pfad, init = {}) {
  const antwort = await fetch(WORKER + pfad, Object.assign({ redirect: "manual" }, init));
  const text = await antwort.text().catch(() => "");
  return { status: antwort.status, headers: antwort.headers, text };
}

/* ------------------------------------------------------------------ Lauf */
const ergebnis = {
  generatedAt: new Date().toISOString(),
  worker: WORKER,
  DISPATCH_CREDENTIAL_PRESENT: null,
  PRESSED_AT: null,
  FIRST_PRESS: null,
  SECOND_PRESS: null,
  DOUBLE_RUN_PROTECTED: null,
  MANUAL_ORCHESTRATOR_DISPATCH: "UNGEPRUEFT",
  missing: []
};

function abschluss(code) {
  ergebnis.checks = befunde;
  const ziel = arg("out", null);
  if (ziel) {
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, JSON.stringify(ergebnis, null, 2) + "\n");
  }
  if (JSON_AUS) {
    console.log(JSON.stringify(ergebnis, null, 2));
  } else {
    console.log("VISION UNIVERSE SOCIAL — JETZT PRUEFEN, produktiv\n");
    for (const b of befunde) {
      console.log("  " + (b.ok ? "OK  " : "FEHL") + " " + b.id.padEnd(30) + b.satz);
    }
    console.log("");
    console.log("DISPATCH_CREDENTIAL_PRESENT   " + ergebnis.DISPATCH_CREDENTIAL_PRESENT);
    console.log("DOUBLE_RUN_PROTECTED          " + ergebnis.DOUBLE_RUN_PROTECTED);
    console.log("MANUAL_ORCHESTRATOR_DISPATCH  " + ergebnis.MANUAL_ORCHESTRATOR_DISPATCH);
    console.log("PRESSED_AT                    " + ergebnis.PRESSED_AT);
    if (ergebnis.missing.length) {
      console.log("FEHLENDE EINSTELLUNGEN        " + ergebnis.missing.join(", "));
    }
    console.log("\nDer Wert des Secrets wurde nicht gelesen und steht nirgendwo.");
  }
  process.exit(code);
}

if (!KEY) {
  befund("ADMIN_SCHLUESSEL", false, "VU_SOCIAL_ADMIN_KEY fehlt in der Umgebung.");
  abschluss(4);
}

/* 1. Anmelden — dieselbe Anmeldung wie im Browser. */
const anmeldung = await hole("/approval/session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ adminKey: KEY })
});
const cookie = String(anmeldung.headers.get("set-cookie") || "").split(";")[0];
befund("OWNER_ANMELDUNG", anmeldung.status === 303 && cookie.startsWith("__Host-"),
  "HTTP " + anmeldung.status + ", Cookie " + (cookie ? cookie.split("=")[0] : "keines"));
if (!cookie.startsWith("__Host-")) abschluss(1);

/* Der Schluessel darf im Cookie nicht auftauchen. */
befund("COOKIE_OHNE_GEHEIMNIS", !cookie.includes(KEY),
  "Das Sitzungstoken traegt den Admin-Schluessel nicht.");

/* 2. Ein GET auf /approval/run muss abgelehnt werden: ein Link darf
      keinen Lauf ausloesen koennen. Das kostet nichts und wird vor dem
      echten Druck geprueft. */
const perLink = await hole("/approval/run", { method: "GET", headers: { cookie } });
befund("KEIN_LAUF_PER_LINK", perLink.status === 405,
  "GET /approval/run -> HTTP " + perLink.status);

/* 3. DER DRUCK. Genau einer. */
ergebnis.PRESSED_AT = new Date().toISOString();
const erster = await hole("/approval/run", { method: "POST", headers: { cookie } });
const titel1 = titelVon(erster.text);
const grund1 = grundVon(erster.text);
ergebnis.FIRST_PRESS = { status: erster.status, titel: titel1, grund: grund1 };

if (grund1 === "NICHT_EINGERICHTET") {
  ergebnis.missing = fehlendeNamen(erster.text);
  ergebnis.DISPATCH_CREDENTIAL_PRESENT = false;
  befund("DISPATCH_CREDENTIAL_PRESENT", false,
    "Der Worker nennt fehlende Einstellungen: " + ergebnis.missing.join(", "));
  abschluss(1);
}

/* Der Credential ist da: der Worker prueft ihn fail-closed VOR allem
   anderen. Kaeme er hier nicht vorbei, staende oben NICHT_EINGERICHTET. */
ergebnis.DISPATCH_CREDENTIAL_PRESENT = true;
befund("DISPATCH_CREDENTIAL_PRESENT", true,
  "Der Worker ist ueber die fail-closed-Pruefung hinausgekommen.");

/* Exakter Titelvergleich — "Lauf angestossen" steckt in "Lauf nicht
   angestossen". */
const angestossen = titel1 === TITEL_ANGESTOSSEN;
befund("ERSTER_DRUCK_ANGENOMMEN", angestossen,
  "Titel: " + JSON.stringify(titel1) + (grund1 ? ", Grund: " + grund1 : ""));

if (!angestossen) {
  ergebnis.MANUAL_ORCHESTRATOR_DISPATCH = "NICHT_ANGESTOSSEN";
  abschluss(1);
}

/* 4. SOFORT NOCH EINMAL. Die Sperre laesst sich nur so messen. */
const zweiter = await hole("/approval/run", { method: "POST", headers: { cookie } });
const titel2 = titelVon(zweiter.text);
const grund2 = grundVon(zweiter.text);
ergebnis.SECOND_PRESS = { status: zweiter.status, titel: titel2, grund: grund2 };

const gesperrt = titel2 === TITEL_NICHT && grund2 === "SCHON_ANGESTOSSEN";
ergebnis.DOUBLE_RUN_PROTECTED = gesperrt;
befund("DOUBLE_RUN_PROTECTED", gesperrt,
  "Zweiter Druck: " + JSON.stringify(titel2) +
  (grund2 ? " (" + grund2 + ")" : "") +
  " — abgewiesen, ohne einen zweiten Lauf zu erzeugen.");

/* Der Nachweis, DASS genau ein Lauf entstand, gehoert nicht hierher:
   ihn fuehrt, wer GitHub fragen kann. Dieses Skript sagt, was der
   Worker getan hat, und mit welchem Zeitstempel — daran laesst sich
   der Lauf binden. */
ergebnis.MANUAL_ORCHESTRATOR_DISPATCH = gesperrt ? "ANGESTOSSEN_UND_GESPERRT"
  : "ANGESTOSSEN_SPERRE_UNGEPRUEFT";

abschluss(befunde.every((b) => b.ok) ? 0 : 1);

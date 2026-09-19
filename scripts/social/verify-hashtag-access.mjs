/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-hashtag-access.mjs

   NACH DER AUTORISIERUNG: WAS HAT SICH TATSAECHLICH GEAENDERT?

   -------------------------------------------------------------------------
   WARUM DAS EIN EIGENER SCHRITT IST
   -------------------------------------------------------------------------

   Eine erneute Autorisierung sieht immer gleich aus: man klickt,
   Instagram sagt "fertig", und die Verbindung steht. Ob sie MEHR kann
   als vorher, sieht man daran nicht.

   Dieser Lauf misst es - und er misst auch, was NICHT kaputtgegangen
   sein darf. Eine Reautorisierung mit einer engeren Rechtemenge nimmt
   dem System das Veroeffentlichen weg, und das faellt sonst erst beim
   naechsten Beitrag auf.

   Geprueft wird:

     1. Verbindung und Zielkonto gegen die Allowlist
     2. Veroeffentlichen weiterhin moeglich (darf NICHT verloren gehen)
     3. Rechte des gespeicherten Tokens
     4. Ein Versuch gegen einen BEREITS GEOEFFNETEN Hashtag
     5. Daraus die Diagnose: fehlt ein RECHT oder eine FREISCHALTUNG?

   Schritt 4 kostet keinen der dreissig Plaetze: eine erneute Abfrage
   innerhalb des Sieben-Tage-Fensters zaehlt nicht noch einmal. Der
   Hashtag kommt aus dem Portfolio, nicht aus diesem Skript - was dort
   offen ist, weiss nur das Portfolio.

   Ausfuehren (Zugangsdaten aus der Umgebung):
     VU_SOCIAL_ADMIN_KEY=... node scripts/social/verify-hashtag-access.mjs
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Access = require(join(ROOT, "social/engines/hashtag-access.js"));
const Portfolio = require(join(ROOT, "social/engines/hashtag-portfolio.js"));

const PORTFOLIO_DATEI = "social/data/hashtag-portfolio.json";
/* Die Adresse ist oeffentlich und steht im DNS. Sie zum Geheimnis zu
   erklaeren, hat schon einmal einen bekannten Wert in einen fehlenden
   verwandelt. */
const WORKER = process.env.VU_SOCIAL_WORKER_URL || "https://social.visionuniverse.de";

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/**
 * Ein Hashtag, dessen Fenster NOCH OFFEN ist.
 *
 * Exportiert, weil die Eigenschaft pruefbar sein muss: dieser Lauf darf
 * keinen neuen Platz ausgeben. Gibt null zurueck, wenn keiner offen ist -
 * dann wird nicht probiert, statt einen Platz dafuer zu verbrennen.
 */
export function offenerHashtag(bestand, nowIso) {
  const eintraege = bestand || {};
  const offen = Object.keys(eintraege).filter((h) =>
    Portfolio.fensterZustand(eintraege[h], nowIso).state === "OPEN");
  if (!offen.length) return null;
  /* Der zuletzt geoeffnete hat das meiste Fenster uebrig. */
  offen.sort((a, b) =>
    Date.parse(eintraege[b].firstQueriedAt || 0) -
    Date.parse(eintraege[a].firstQueriedAt || 0));
  return offen[0];
}

async function hole(pfad, key) {
  const res = await fetch(WORKER + pfad, {
    headers: { Authorization: "Bearer " + key }
  });
  const text = await res.text();
  let daten = null;
  try { daten = JSON.parse(text); } catch { /* bleibt null */ }
  return { status: res.status, ok: res.ok, data: daten, raw: text };
}

export async function pruefe(options) {
  options = options || {};
  const key = options.adminKey || process.env.VU_SOCIAL_ADMIN_KEY;
  const now = options.now || new Date().toISOString();
  if (!key) {
    return { ok: false, state: "NO_ADMIN_KEY",
      explanation: "VU_SOCIAL_ADMIN_KEY fehlt. Ohne ihn antwortet der " +
        "Worker auf keinen der Pruefendpunkte. Das ist kein Befund ueber " +
        "die Verbindung." };
  }

  const bestand = readJson(join(ROOT, PORTFOLIO_DATEI), { hashtags: {} }).hashtags || {};
  const probeTag = options.probe || offenerHashtag(bestand, now);

  const status = await hole("/social/meta/status", key);
  if (!status.ok) {
    return { ok: false, state: "STATUS_UNREACHABLE", status: status.status,
      explanation: "Der Status-Endpunkt antwortet mit HTTP " + status.status +
        ". Ohne ihn ist nichts feststellbar - und das ist keine Aussage " +
        "ueber die Rechte." };
  }

  const verbindung = (status.data && status.data.connection) || {};
  const faehig = verbindung.capabilities || {};

  const cap = await hole("/social/meta/hashtag-capability" +
    (probeTag ? "?probe=" + encodeURIComponent(probeTag) : ""), key);

  /* -----------------------------------------------------------------
     404 HEISST HIER NICHT "KAPUTT", SONDERN "NOCH NICHT DRAUSSEN"

     Der Endpunkt existiert im Quelltext, seit diese Pruefung gebaut
     wurde. Draussen laeuft der Worker aber erst, wenn ihn der
     bestehende Deploy-Pfad ersetzt hat - und der verlangt seinerseits
     eine sichtbare Anforderung im Repository.

     Das als Fehlschlag zu melden, waere die alte Verwechslung in neuem
     Gewand: nicht vorhanden ist nicht dasselbe wie abgewiesen. */
  if (cap.status === 404) {
    return { ok: false, state: "ENDPOINT_NOT_DEPLOYED",
      account: verbindung.instagramUsername || null,
      connected: verbindung.connected === undefined ? null : verbindung.connected,
      canPublish: faehig.canPublish === undefined ? null : faehig.canPublish,
      explanation: "Der Worker draussen kennt /social/meta/hashtag-capability " +
        "noch nicht. Das ist kein Befund ueber Rechte - der Endpunkt ist " +
        "nur noch nicht ausgerollt. Der bestehende Deploy-Pfad " +
        "(social-cloudflare.yml, Anforderung ueber die Datei " +
        "workers/vision-universe-social/DEPLOY_REQUEST) bringt ihn " +
        "hinaus. Bis dahin ist die Ursache der abgewiesenen " +
        "Hashtag-Abfragen NICHT bestimmbar, und ein Owner-Schritt auf " +
        "Verdacht waere hier am teuersten." };
  }

  const befund = cap.ok && cap.data
    ? Access.diagnose({ grantedScopes: cap.data.grantedScopes,
        probe: cap.data.probe })
    : Access.diagnose({});

  return {
    ok: true,
    observedAt: now,
    account: verbindung.instagramUsername || null,
    /* §7: das Zielkonto gehoert erneut gegen die Allowlist geprueft -
       eine Reautorisierung kann ein ANDERES Konto verbinden. */
    allowlisted: verbindung.allowlisted === undefined ? null : verbindung.allowlisted,
    connected: verbindung.connected === undefined ? null : verbindung.connected,
    /* Darf nicht verloren gehen. */
    canPublish: faehig.canPublish === undefined ? null : faehig.canPublish,
    probeHashtag: probeTag,
    probeCostsNewSlot: false,
    grantedScopes: (cap.data && cap.data.grantedScopes) || null,
    scopeSource: (cap.data && cap.data.scopeSource) || null,
    diagnosis: befund,
    explanation: (probeTag
      ? "Versuch gegen #" + probeTag + " - ein bereits geoeffneter " +
        "Hashtag, der keinen neuen Platz kostet. "
      : "Kein offener Hashtag im Fenster: es wurde nichts probiert. Einen " +
        "neuen Platz nur fuer eine Fehlermeldung auszugeben, waere der " +
        "teuerste Test. ") + befund.explanation
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await pruefe({});
  console.log("VISION UNIVERSE SOCIAL — Hashtag-Zugriff nach der Autorisierung\n");

  if (!r.ok) {
    console.log(r.state + ": " + r.explanation);
    if (r.canPublish !== undefined && r.canPublish !== null) {
      console.log("\nVeroeffentlichen: " + r.canPublish +
        (r.canPublish === false ? "   <-- DAS DARF NICHT PASSIEREN" : ""));
    }
    /* Weder ein fehlender Schluessel noch ein nicht ausgerollter
       Endpunkt sind Fehler dieses Laufs. */
    const gutartig = ["NO_ADMIN_KEY", "ENDPOINT_NOT_DEPLOYED"];
    process.exit(gutartig.includes(r.state) ? 0 : 1);
  }

  console.log("Konto           : @" + (r.account || "unbekannt"));
  console.log("Verbunden       : " + r.connected);
  console.log("Auf Allowlist   : " + r.allowlisted);
  console.log("Veroeffentlichen: " + r.canPublish +
    (r.canPublish === false ? "   <-- DAS DARF NICHT PASSIEREN" : ""));
  console.log("Rechte gelesen  : " + (r.scopeSource || "—") +
    (r.grantedScopes ? " (" + r.grantedScopes.length + ")" : " (unbekannt)"));
  console.log("Probe-Hashtag   : " + (r.probeHashtag ? "#" + r.probeHashtag : "—") +
    "  (kostet keinen Platz)");
  console.log("\nDiagnose        : " + r.diagnosis.state);
  console.log(r.explanation);

  if (r.diagnosis.ownerActionRequired) {
    const a = r.diagnosis.ownerActionRequired;
    console.log("\n!!! OWNER-SCHRITT: " + a.kind + " !!!");
    console.log("    " + a.what);
    if (a.doNot) console.log("    NICHT: " + a.doNot);
    if (a.measure) console.log("    Zu messen: " + a.measure);
  }

  /* Ein verlorenes Veroeffentlichungsrecht ist der einzige Fall, der
     diesen Lauf rot macht. Alles andere ist ein Befund, kein Fehler. */
  if (r.canPublish === false) process.exit(2);
}

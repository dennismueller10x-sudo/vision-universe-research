/* =========================================================================
   VISION UNIVERSE — verify-request-limits.mjs

   WAS ERLAUBT DER COMMERCIAL-ZUGANG WIRKLICH?

   Vorgeschichte in einem Satz: der FULL_UNIVERSE-Lauf vom 2026-09-09
   endete nach exakt 5.000 Anfragen, 686 Titel blieben ungefragt, und der
   Bericht las sich wie ein Anbieterlimit. Es war keines. Die 5.000
   stammen aus COMMERCIAL_LIMITS.requestsPerHour - einer bewusst
   konservativen Zahl aus Phase 4A, die nie gemessen wurde und
   verified:false traegt.

   Dieses Skript sucht die staerkste Auskunft, die sich SICHER holen
   laesst, in dieser Reihenfolge:

     1. Kontoauskunft des Anbieters   (authentifiziert)
     2. Offizielle Dokumentation      (die Seite des Anbieters selbst)
     3. Antwortkoepfe                 (X-RateLimit-*, Retry-After)
     4. Beobachtung im echten Lauf    (was ohne Ablehnung durchging)

   WAS DIESES SKRIPT AUSDRUECKLICH NICHT TUT

   Es laeuft nicht gegen die Wand, um eine Grenze zu finden. Eine Decke
   durch Dagegenlaufen zu bestimmen hiesse, dem Anbieter absichtlich
   Missbrauchsverkehr zu schicken - fuer eine Zahl, die er auf Nachfrage
   nennt. Der Nachweis stellt darum eine zweistellige Zahl von Anfragen,
   nicht mehr.

   Und es erfindet nichts. Findet es keine Anbieteraussage, lautet das
   Ergebnis UNKNOWN / PROVIDER_CONFIRMATION_REQUIRED. Eine Sekundaerquelle
   im Netz, die "5.000 pro Stunde" behauptet, ist keine Messung und auch
   keine Zusage - sie geht als HEARSAY in den Bericht, wenn sie
   ueberhaupt hineingeht.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/verify-request-limits.mjs
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
/* Wie viele Anfragen darf der Nachweis stellen? Bewusst klein und
   bewusst einstellbar - aber nach oben gedeckelt, damit aus einem
   Nachweis nicht versehentlich ein Lasttest wird. */
const PROBES = Math.min(parseInt(arg("--probes", "12"), 10) || 12, 60);
const apiKey = process.env.TIINGO_API_KEY || null;

/* Kopfzeilen, die ueber Kontingente sprechen. Grosszuegig gefasst, weil
   die Schreibweise zwischen Anbietern wandert und ein uebersehener Kopf
   genau die Auskunft waere, die wir suchen. */
const QUOTA_HEADER = /^(x-)?(rate)?-?limit|^ratelimit|^retry-after|^x-quota|^x-usage/i;

/* Was NIE in den Bericht darf. Der Schluessel steht im
   Authorization-Kopf, den wir selbst senden - aber ein Anbieter kann ihn
   spiegeln, und ein Bericht, der ihn dann mitschreibt, waere ein Leck
   mit Zeitstempel (§2). */
function keinSchluessel(text) {
  if (!apiKey) return text;
  return String(text).split(apiKey).join("[ENTFERNT]");
}

function kopfzeilen(res) {
  const alle = {};
  const kontingent = {};
  try {
    res.headers.forEach((wert, name) => {
      const n = String(name).toLowerCase();
      if (n === "authorization" || n === "cookie" || n === "set-cookie") {
        alle[n] = "[NICHT MITGESCHRIEBEN]";
        return;
      }
      const v = keinSchluessel(String(wert)).slice(0, 200);
      alle[n] = v;
      if (QUOTA_HEADER.test(n)) kontingent[n] = v;
    });
  } catch (err) { /* Ein Client ohne forEach: dann eben ohne Koepfe. */ }
  return { alle, kontingent };
}

async function hole(url, opts) {
  const t = Date.now();
  try {
    const res = await fetch(url, opts || {});
    return { ok: true, status: res.status, latencyMs: Date.now() - t, res };
  } catch (err) {
    return { ok: false, status: null, latencyMs: Date.now() - t,
             error: keinSchluessel((err && err.message) || String(err)) };
  }
}

async function main() {
  console.log("\nVision Universe — Was erlaubt der Zugang wirklich?\n");

  const bericht = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    plan: "commercial",
    scope: "requestLimits",
    verificationLevel: apiKey ? "RUNTIME_VERIFIED" : "NOT_RUN",
    note: "Der Bericht sucht Anbieteraussagen. Er erzeugt keinen Missbrauchsverkehr und " +
          "bestimmt keine Decke durch Dagegenlaufen. Was er nicht findet, bleibt UNKNOWN.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null,
      probesAllowed: PROBES
    },

    /* Was IM CODE steht - und woher es kommt. Der Ausgangspunkt der
       ganzen Untersuchung. */
    configuredLimits: (() => {
      const l = Tiingo.commercialPlanCapabilities().limits;
      return {
        requestsPerMinute: l.requestsPerMinute,
        requestsPerHour: l.requestsPerHour,
        requestsPerDay: l.requestsPerDay,
        verified: l.verified,
        provenance: l.provenance,
        origin: "providers/tiingo/adapter.js, eingefuehrt in Phase 4A als konservative Annahme",
        note: "Diese Zahlen sind unser Budget. Sie sagen nichts darueber, was Tiingo erlaubt."
      };
    })(),

    evidence: [],
    requestsMade: 0,
    verdict: null
  };

  function beleg(quelle, rang, ergebnis) {
    bericht.evidence.push(Object.assign({ source: quelle, evidenceRank: rang }, ergebnis));
  }

  if (!apiKey) {
    console.log("  Kein TIINGO_API_KEY gesetzt. Es wird nichts abgerufen und nichts behauptet.");
    bericht.verdict = {
      status: "NOT_RUN",
      requestsPerHour: null,
      classification: "UNKNOWN",
      note: "Ohne Zugang keine Messung. Der Befund der Vorphase bleibt unveraendert."
    };
    schreibe(bericht);
    return;
  }

  const kopf = { Authorization: "Token " + apiKey, "Content-Type": "application/json" };

  /* ------------------------------------------------- 1. Kontoauskunft */

  /* Tiingo dokumentiert keinen Endpunkt, der das Kontingent des Kontos
     ausliefert. Gefragt wird trotzdem: ein 404 ist eine Auskunft ("gibt
     es nicht"), und die gehoert in den Bericht, damit die naechste
     Person nicht dieselbe Runde dreht. */
  for (const pfad of ["/api/test", "/account/usage", "/api/usage"]) {
    const r = await hole(BASE + pfad, { headers: kopf });
    bericht.requestsMade++;
    if (!r.ok) { beleg("accountEndpoint" + pfad, 1, { status: "ERROR", error: r.error }); continue; }
    const k = kopfzeilen(r.res);
    let rumpf = null;
    try { rumpf = keinSchluessel((await r.res.text()).slice(0, 400)); } catch (err) { rumpf = null; }
    beleg("accountEndpoint" + pfad, 1, {
      status: r.res.status === 200 ? "ANSWERED" : "ABSENT",
      httpStatus: r.res.status,
      quotaHeaders: Object.keys(k.kontingent).length ? k.kontingent : null,
      body: rumpf,
      interpretation: r.res.status === 200
        ? "Der Endpunkt antwortet. Ob er ein Kontingent nennt, steht in body/quotaHeaders."
        : "Kein solcher Endpunkt. Das Konto gibt sein Kontingent hier nicht preis."
    });
    console.log(`  ${pfad.padEnd(16)} HTTP ${r.res.status}` +
                (Object.keys(k.kontingent).length ? "  (Kontingentkoepfe vorhanden)" : ""));
  }

  /* --------------------------------------------------- 2. Dokumentation */

  /* Die Dokumentationsseite des Anbieters ist Rang 2: sie ist seine
     eigene Aussage, aber keine Zusage fuer DIESES Konto. */
  const doku = await hole("https://www.tiingo.com/documentation/general/overview");
  if (doku.ok && doku.res.status === 200) {
    let text = "";
    try { text = await doku.res.text(); } catch (err) { text = ""; }
    /* Nur nach Zahlen mit Kontingentbezug suchen - nicht die ganze Seite
       mitschreiben. Fremder Inhalt gehoert nicht in unsere Artefakte. */
    const treffer = [];
    const muster = /([\d,]{3,})\s*(requests?|calls?)\s*(per|\/)\s*(hour|hr|minute|min|day)/gi;
    let m;
    while ((m = muster.exec(text)) !== null && treffer.length < 10) {
      treffer.push(m[0].replace(/\s+/g, " ").trim());
    }
    beleg("officialDocumentation", 2, {
      status: treffer.length ? "STATEMENTS_FOUND" : "NO_STATEMENT_FOUND",
      url: "https://www.tiingo.com/documentation/general/overview",
      httpStatus: 200,
      statements: treffer,
      interpretation: treffer.length
        ? "Die Seite nennt Kontingente. Ob sie fuer DIESES Konto gelten, sagt sie damit nicht - " +
          "die oeffentliche Seite beschreibt Tarife, nicht Vertraege."
        : "Die abrufbare Seite nennt keine Zahl in dieser Form. Die Kontingente stehen " +
          "moeglicherweise hinter der Anmeldung."
    });
    console.log(`  Dokumentation     ${treffer.length} Kontingentaussage(n) gefunden`);
  } else {
    beleg("officialDocumentation", 2, {
      status: "UNREACHABLE",
      url: "https://www.tiingo.com/documentation/general/overview",
      httpStatus: doku.ok ? doku.res.status : null,
      error: doku.ok ? null : doku.error,
      interpretation: "Die Dokumentation war aus diesem Lauf nicht erreichbar. Kein Befund - " +
                      "ausdruecklich kein Gegenbefund."
    });
    console.log("  Dokumentation     nicht erreichbar");
  }

  /* ------------------------------------------------- 3. Antwortkoepfe */

  /* Echte Datenabrufe, weil nur sie die Koepfe tragen, die ein
     Datenabruf traegt. Wenige, an einem Titel, mit voller Auskunft
     darueber, was zurueckkam. */
  const koepfeGesehen = [];
  for (let i = 0; i < Math.min(PROBES, 5); i++) {
    const r = await hole(
      `${BASE}/tiingo/daily/AAPL/prices?startDate=2026-09-01&format=json&_=${i}`,
      { headers: kopf });
    bericht.requestsMade++;
    if (!r.ok) continue;
    const k = kopfzeilen(r.res);
    koepfeGesehen.push({ probe: i + 1, httpStatus: r.res.status,
                         quotaHeaders: Object.keys(k.kontingent).length ? k.kontingent : null,
                         headerNames: Object.keys(k.alle) });
    try { await r.res.text(); } catch (err) { /* Rumpf verwerfen, er wird nicht gebraucht. */ }
  }
  const mitKontingent = koepfeGesehen.filter((k) => k.quotaHeaders);
  beleg("responseHeaders", 3, {
    status: mitKontingent.length ? "QUOTA_HEADERS_PRESENT" : "NO_QUOTA_HEADERS",
    probes: koepfeGesehen.length,
    withQuotaHeaders: mitKontingent.length,
    quotaHeaders: mitKontingent.length ? mitKontingent[0].quotaHeaders : null,
    headerNamesSeen: koepfeGesehen.length ? koepfeGesehen[0].headerNames : [],
    interpretation: mitKontingent.length
      ? "Der Anbieter nennt sein Kontingent in den Antwortkoepfen. Das ist die belastbarste " +
        "Auskunft ohne Nachfrage - sie kommt von ihm und gilt fuer dieses Konto."
      : "Tiingo sendet keine Kontingentkoepfe. Es gibt damit keinen Weg, den Stand des Kontos " +
        "zu erfahren, ausser abzuwarten, ob eine Anfrage abgelehnt wird."
  });
  console.log(`  Antwortkoepfe     ${koepfeGesehen.length} Proben, ` +
              `${mitKontingent.length} mit Kontingentangabe`);

  /* -------------------------------------------- 4. Beobachtung im Lauf */

  /* Was die bisherigen Gate-Laeufe belegen: keine einzige Ablehnung des
     Anbieters. Das ist eine Untergrenze und keine Grenze - "mindestens
     so viel" ist etwas anderes als "genau so viel". */
  beleg("observedRuns", 4, {
    status: "LOWER_BOUND_ONLY",
    highestRequestsInOneHourWithoutRefusal: 5000,
    http429EverSeen: false,
    interpretation: "In den Laeufen GATE_100/500/2000 und FULL_UNIVERSE wurden bis zu 5.000 " +
      "Anfragen in einer Stunde gestellt, ohne dass Tiingo eine einzige abgelehnt haette. " +
      "Bei 5.000 hat UNSER Budget gestoppt, nicht der Anbieter. Belegt ist damit: die " +
      "tatsaechliche Grenze liegt bei mindestens 5.000/h. Wo genau, ist offen.",
    source: "quant/data/market/scale/gate-*.json, accounting.providerObserved"
  });

  /* ------------------------------------------------------------ Urteil */

  const kopfBeleg = bericht.evidence.find((e) => e.source === "responseHeaders");
  const kontoBeleg = bericht.evidence.find(
    (e) => String(e.source).startsWith("accountEndpoint") && e.quotaHeaders);

  if (kontoBeleg) {
    bericht.verdict = {
      status: "ACCOUNT_VERIFIED",
      classification: "ACCOUNT_VERIFIED",
      note: "Das Konto selbst nennt sein Kontingent. Siehe evidence[accountEndpoint].",
      quotaHeaders: kontoBeleg.quotaHeaders
    };
  } else if (kopfBeleg && kopfBeleg.status === "QUOTA_HEADERS_PRESENT") {
    bericht.verdict = {
      status: "PROVIDER_VERIFIED",
      classification: "PROVIDER_VERIFIED",
      note: "Der Anbieter sendet Kontingentkoepfe. Sie sind ab jetzt die Quelle, " +
            "nicht die Zahl im Code.",
      quotaHeaders: kopfBeleg.quotaHeaders
    };
  } else {
    bericht.verdict = {
      status: "UNKNOWN",
      classification: "PROVIDER_CONFIRMATION_REQUIRED",
      requestsPerHour: null,
      lowerBound: 5000,
      lowerBoundNote: "Mindestens 5.000/h gingen ohne Ablehnung durch. Das ist eine Untergrenze " +
                      "aus Beobachtung, keine Zusage.",
      note: "Tiingo nennt sein Kontingent weder in einem Kontoendpunkt noch in Antwortkoepfen. " +
            "Die tatsaechliche Grenze dieses Kontos ist damit UNBEKANNT und nur beim Anbieter " +
            "zu erfahren. Die 5.000 im Code bleiben SAFETY_CEILING - unsere Zahl. Sie darf " +
            "nirgends als Tiingos Limit auftreten.",
      nextStep: "Beim Anbieter nachfragen (Vertrag/Support). Bis dahin faehrt der Backfill " +
                "ueber Checkpoints und ein ausdrueckliches eigenes Budget."
    };
  }

  console.log(`\n  URTEIL: ${bericht.verdict.classification}`);
  if (bericht.verdict.lowerBound) {
    console.log(`  Untergrenze aus Beobachtung: ${bericht.verdict.lowerBound}/h ohne Ablehnung.`);
  }
  console.log(`  Gestellte Anfragen in diesem Nachweis: ${bericht.requestsMade}\n`);

  schreibe(bericht);
}

function schreibe(bericht) {
  mkdirSync(OUT_DIR, { recursive: true });
  const datei = join(OUT_DIR, "request-limits.json");
  writeFileSync(datei, JSON.stringify(bericht, null, 2));
  console.log(`  Bericht: ${datei}\n`);
}

main().catch((err) => {
  console.error("\n  ABBRUCH:", keinSchluessel((err && err.message) || String(err)));
  process.exit(1);
});

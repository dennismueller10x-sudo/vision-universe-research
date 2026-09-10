/* =========================================================================
   VISION UNIVERSE — verify-vercel-preview.mjs

   IST DIE VORSCHAU WIRKLICH ZU, UND ZEIGT SIE WIRKLICH ETWAS?

   Zwei Fragen, die nicht zusammenfallen duerfen. Eine Seite, die niemand
   oeffnen kann, ist geschuetzt und nutzlos. Eine Seite, die alles zeigt,
   ist nuetzlich und offen. Dieses Skript misst beides getrennt und mit
   verschiedenen Mitteln:

     OHNE Zugangsmittel   -> muss abgewiesen werden
     MIT  Zugangsmittel   -> muss die vollen 5.684 Titel zeigen

   WAS DER NACHWEIS *NICHT* ZEIGT

   Das Zugangsmittel hier ist Vercels Protection-Bypass-Token fuer
   Automaten. Es beweist, dass die Schutzschicht einen BERECHTIGTEN
   Aufrufer durchlaesst. Es beweist NICHT, dass die Anmeldung eines
   Menschen ueber Vercel-SSO funktioniert - das ist ein anderer Weg durch
   dieselbe Tuer. Der Bericht sagt das von sich aus; wer es verwechselt,
   behauptet einen Nachweis, den es nicht gibt.

   OHNE TOKEN laeuft trotzdem der wichtigste Teil: die Abweisung. Die
   braucht kein Geheimnis - sie ist genau der Fall "ein Fremder ruft auf".

   Ausfuehren (braucht offenes Netz - im Sandkasten ist die Domain
   gesperrt, also laeuft es in GitHub Actions):
     node scripts/site/verify-vercel-preview.mjs --base https://<projekt>.vercel.app
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const BASE = String(arg("--base", process.env.VERCEL_PREVIEW_URL || "")).replace(/\/$/, "");
const PAGES = String(arg("--pages", "https://research.visionuniverse.de")).replace(/\/$/, "");
const OUT = arg("--out", join(root, "quant", "data", "site"));
const TIMEOUT = parseInt(arg("--timeout", "30000"), 10) || 30000;

/* Das Token kommt NUR aus der Umgebung, nie von der Kommandozeile: ein
   Argument steht in der Prozessliste und im Ablaufprotokoll. */
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

if (!BASE) {
  console.error("\n  ABBRUCH: keine Vorschau-Adresse. --base oder VERCEL_PREVIEW_URL setzen.\n");
  process.exit(2);
}

/* Woran erkennt man Vercels Schutzschicht? An ihrer Abweisung. Sie
   antwortet mit 401 und einer Anmeldeseite, oder sie leitet auf
   vercel.com/sso um. Beides zaehlt; entscheidend ist, was NICHT kommt:
   unser Inhalt. */
const SCHUTZ_SPUREN = [
  /_vercel_sso_nonce/i,
  /Authentication Required/i,
  /vercel\.com\/sso/i,
  /Vercel Authentication/i,
  /Deployment Protection/i
];
/* Und das ist unser Inhalt - taucht davon etwas auf, ist die Tuer offen. */
const UNSER_INHALT = [
  /DERIVED_UNIVERSE/,
  /Full Universe/,
  /geschuetzte Vorschau/,
  /preview-universe/
];

const SCHLUESSELMUSTER = [
  { id: "tiingoTokenHeader", re: /Token\s+[0-9a-f]{32,}/i },
  { id: "apiKeyAssignment", re: /(api[_-]?key|apikey|secret|token|password)["'\s:=]+[A-Za-z0-9_\-]{24,}/i },
  { id: "tiingoEnvName", re: /TIINGO_API_KEY\s*[:=]\s*["'][^"']{8,}/i },
  { id: "bareHex40", re: /\b[0-9a-f]{40}\b/ }
];
const COMMIT_UMFELD = /(commit|sha|revision|version|build|integrity|hash)/i;

/* Das Bypass-Token ist selbst ein Geheimnis. Es darf in keiner Zeile
   dieses Berichts stehen - auch nicht gekuerzt. */
function entschaerfe(text) {
  if (!BYPASS) return text;
  return String(text).split(BYPASS).join("[BYPASS-TOKEN ENTFERNT]");
}

async function hole(url, { bypass = false, methode = "GET" } = {}) {
  const kopf = { "user-agent": "vision-universe-preview-verifier/1" };
  if (bypass && BYPASS) kopf["x-vercel-protection-bypass"] = BYPASS;
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      method: methode, headers: kopf, redirect: "manual", signal: ctl.signal
    });
    const typ = String(res.headers.get("content-type") || "");
    const koerper = /text|json|javascript|html/i.test(typ) || !typ
      ? await res.text().catch(() => "") : "";
    return {
      ok: true, status: res.status,
      location: res.headers.get("location") || null,
      contentType: typ, bytes: koerper.length, body: koerper,
      headers: {
        "x-vision-universe-dataset": res.headers.get("x-vision-universe-dataset") || null,
        "x-robots-tag": res.headers.get("x-robots-tag") || null,
        "cache-control": res.headers.get("cache-control") || null,
        "set-cookie": res.headers.get("set-cookie") ? "[gesetzt]" : null
      }
    };
  } catch (err) {
    return { ok: false, status: null, error: entschaerfe(String((err && err.message) || err)).slice(0, 200) };
  } finally { clearTimeout(uhr); }
}

function bewerteAbweisung(a) {
  if (!a.ok) return { blocked: null, reason: "Aufruf gescheitert: " + a.error };
  const inhaltDa = UNSER_INHALT.some((re) => re.test(a.body || ""));
  const schutzDa = SCHUTZ_SPUREN.some((re) => re.test(a.body || "")) ||
                   /vercel\.com\/sso/i.test(a.location || "");
  if (a.status === 401 || a.status === 403) {
    return { blocked: true, reason: `HTTP ${a.status}` + (schutzDa ? " mit Vercel-Anmeldeseite" : "") };
  }
  if (a.status >= 300 && a.status < 400 && schutzDa) {
    return { blocked: true, reason: `HTTP ${a.status} auf die Vercel-Anmeldung` };
  }
  if (a.status === 200 && inhaltDa) {
    return { blocked: false, reason: "HTTP 200 mit unserem Inhalt - die Vorschau ist OFFEN" };
  }
  if (a.status === 200) {
    /* 200 ohne unseren Inhalt: haeufig die Anmeldeseite selbst, die Vercel
       mit 401 ODER 200 ausliefert. Nur mit Schutzspur zaehlt es als zu. */
    return schutzDa
      ? { blocked: true, reason: "HTTP 200, aber die Vercel-Anmeldeseite statt unseres Inhalts" }
      : { blocked: null, reason: "HTTP 200 ohne erkennbaren Inhalt und ohne Schutzspur - unklar" };
  }
  if (a.status === 404) {
    return { blocked: null, reason: "HTTP 404 - der Pfad existiert nicht; das ist kein Schutznachweis" };
  }
  return { blocked: null, reason: `HTTP ${a.status} - nicht einzuordnen` };
}

function jetzt() { return new Date().toISOString(); }
function sha(text) { return createHash("sha256").update(text).digest("hex"); }

async function main() {
  console.log("\nVision Universe — Nachweis der geschuetzten Vorschau\n");
  console.log(`  Vorschau: ${BASE}`);
  console.log(`  Oeffentlich: ${PAGES}`);
  console.log(`  Zugangsmittel: ${BYPASS ? "Bypass-Token vorhanden" : "KEINES - nur die Abweisung wird geprueft"}\n`);

  const bericht = {
    generatedAt: jetzt(),
    previewBase: BASE,
    publicBase: PAGES,
    scope: "vercelProtectedPreview",
    note: "Prueft getrennt: (a) wird ein Aufruf OHNE Zugangsmittel abgewiesen, " +
          "(b) zeigt die Vorschau MIT Zugangsmittel den vollen abgeleiteten Datensatz, " +
          "(c) bleibt die oeffentliche Auslieferung unveraendert.",
    authenticationProofScope: BYPASS
      ? "Bypass-Token fuer Automaten. Belegt, dass die Schutzschicht einen BERECHTIGTEN " +
        "Aufrufer durchlaesst - NICHT, dass die SSO-Anmeldung eines Menschen funktioniert."
      : "Kein Zugangsmittel gesetzt. Der Zugang von innen wurde NICHT geprueft.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null
    },
    checks: [],
    secrets: { status: null, findings: [] },
    verdict: null
  };

  function pruefe(id, label, status, detail) {
    bericht.checks.push({ id, label, status, detail });
    const marke = status === "PASS" ? "OK  " : status === "FAIL" ? "FAIL" : "----";
    console.log(`  [${marke}] ${id.padEnd(6)} ${label}`);
    if (detail) console.log(`         ${entschaerfe(typeof detail === "string" ? detail : JSON.stringify(detail))}`);
  }

  /* ------------------------------------------------------------------
     V1 — OHNE Zugangsmittel muss alles zu sein.

     Drei Pfade, weil drei Dinge zu schuetzen sind: die Ansicht, der
     Datensatz und die Wurzel. Ein Schutz, der nur die HTML-Seite deckt
     und die JSON-Datei offen laesst, ist kein Schutz.
     ------------------------------------------------------------------ */
  const PFADE = [
    { id: "root", pfad: "/" },
    { id: "view", pfad: "/preview-universe/" },
    { id: "data", pfad: "/quant/data/preview/universe.json" }
  ];
  const abweisungen = [];
  for (const p of PFADE) {
    const a = await hole(BASE + p.pfad);
    const b = bewerteAbweisung(a);
    abweisungen.push({ path: p.pfad, status: a.status, blocked: b.blocked, reason: b.reason });
    console.log(`         ${p.pfad.padEnd(36)} ${String(a.status || "-").padStart(3)}  ${b.reason}`);
  }
  const offen = abweisungen.filter((a) => a.blocked === false);
  const unklar = abweisungen.filter((a) => a.blocked === null);
  pruefe("V1", "Ohne Zugangsmittel abgewiesen",
    offen.length ? "FAIL" : unklar.length ? "UNKNOWN" : "PASS",
    { paths: abweisungen });

  /* ------------------------------------------------------------------
     V2 bis V7 brauchen einen Weg hinein. Ohne Token wird hier NICHTS
     behauptet - ein uebersprungener Nachweis ist kein bestandener.
     ------------------------------------------------------------------ */
  let datensatz = null;
  if (!BYPASS) {
    for (const [id, label] of [
      ["V2", "Mit Zugangsmittel erreichbar"],
      ["V3", "Abgeleiteter Datensatz vollstaendig"],
      ["V4", "Titel ausserhalb der Golden Five auffindbar"],
      ["V5", "Screener mit echten Zaehlungen"],
      ["V6", "Einzeltitel oeffnet sich"],
      ["V7", "Mobil 390 px ohne Ueberlauf"]
    ]) pruefe(id, label, "SKIPPED", "kein VERCEL_AUTOMATION_BYPASS_SECRET gesetzt");
  } else {
    const a = await hole(BASE + "/preview-universe/", { bypass: true });
    const drin = a.ok && a.status === 200 && UNSER_INHALT.some((re) => re.test(a.body || ""));
    pruefe("V2", "Mit Zugangsmittel erreichbar", drin ? "PASS" : "FAIL",
      { status: a.status, bytes: a.bytes, headers: a.headers });

    const d = await hole(BASE + "/quant/data/preview/universe.json", { bypass: true });
    try { datensatz = JSON.parse(d.body || ""); } catch (err) { datensatz = null; }
    if (!datensatz) {
      pruefe("V3", "Abgeleiteter Datensatz vollstaendig", "FAIL",
        { status: d.status, note: "universe.json nicht lesbar" });
    } else {
      const u = datensatz.datasetScope || {};
      const text = JSON.stringify(datensatz);
      const kursDrin = /"price":\s*[0-9]|"close":\s*[0-9]|"bars":\s*\[/.test(text);
      const gut = datensatz.kind === "DERIVED_UNIVERSE" &&
                  (datensatz.rows || []).length === 5684 &&
                  u.fullHistoricalOhlcvStore && u.fullHistoricalOhlcvStore.status === "NOT_DEPLOYED" &&
                  !kursDrin;
      pruefe("V3", "Abgeleiteter Datensatz vollstaendig", gut ? "PASS" : "FAIL", {
        kind: datensatz.kind,
        securities: (datensatz.rows || []).length,
        derivedUniverse: u.derivedUniverse ? u.derivedUniverse.status : null,
        fullHistoricalOhlcvStore: u.fullHistoricalOhlcvStore ? u.fullHistoricalOhlcvStore.status : null,
        priceLevels: u.priceLevels ? u.priceLevels.status : null,
        priceDataPresent: kursDrin,
        datasetHeader: d.headers["x-vision-universe-dataset"]
      });

      /* V4 aus dem Datensatz selbst: welche Titel ausserhalb des Canary
         tragen belegte Werte? Die Ansicht wird gleich danach im Browser
         geprueft - hier zaehlt die Substanz. */
      const canary = new Set(["AAPL", "MSFT", "NVDA", "JPM", "XOM"]);
      const echt = (datensatz.rows || []).filter(
        (r) => !canary.has(r.ticker) && r.bars > 0 && r.historyFrom);
      /* Die Stichprobe soll BEIDES zeigen: bekannte Titel mit belegter
         Historie und bekannte Titel, die sauber durchliefen und deshalb
         keine eigene Zeile tragen. Wer nur die erste Sorte zeigt,
         erweckt den Eindruck einer Vollstaendigkeit, die es nicht gibt. */
      const stichprobe = ["ORCL", "KO", "CAT", "T", "PFE"]
        .map((t) => (datensatz.rows || []).find((r) => r.ticker === t))
        .filter(Boolean)
        .map((r) => ({ ticker: r.ticker, bars: r.bars, historyFrom: r.historyFrom,
                       dataQuality: r.dataQuality }));
      const gefunden = stichprobe.length;
      const mitHistorie = stichprobe.filter((r) => r.bars > 0).length;
      pruefe("V4", "Titel ausserhalb der Golden Five auffindbar",
        echt.length > 3000 && gefunden === 5 && mitHistorie >= 1 ? "PASS" : "FAIL",
        { beyondCanaryWithHistory: echt.length, sampleFound: gefunden,
          sampleWithItemisedHistory: mitHistorie, sample: stichprobe,
          note: "bars:null heisst NICHT unbekannt - der Titel lief sauber durch und " +
                "traegt keine eigene Qualitaetszeile (PASS_NOT_ITEMISED)." });

      /* Zwei Sorten Frage, und sie beweisen Verschiedenes:

           boolean  eine Zaehlung ueber das Universum  ("2.926 ueber SMA200")
           ranked   eine Rangliste, deren Namen im Artefakt gekuerzt sind

         Eine Rangfrage traegt bewusst kein `matched` - sie zaehlt nicht,
         sie ordnet. Ein Nachweis, der von allen 18 eine Zahl verlangt,
         wuerde einen richtigen Datensatz als falsch melden. Geprueft
         wird deshalb je Sorte, was sie tragen MUSS. */
      const fragen = datensatz.screenerQuestions || [];
      const zaehlend = fragen.filter((f) => f.kind === "boolean");
      const ordnend = fragen.filter((f) => f.kind === "ranked");
      const echteZaehlung = zaehlend.filter(
        (f) => typeof f.matched === "number" && f.evaluatedOf > 5000);
      const echteRangliste = ordnend.filter(
        (f) => Array.isArray(f.tickers) && f.tickers.length > 0 && f.evaluatedOf > 5000);
      const alleUeberUniversum = fragen.every((f) => f.evaluatedOf > 5000);
      /* Eine Rangfrage darf leer sein - aber nur AUSGEWIESEN leer. Eine
         leere Liste ohne Status rendert als nichts und liest sich wie
         "keine Treffer"; das ist die stille Null, die hier nirgends
         vorkommen darf. Jede Frage muss also entweder Inhalt tragen
         oder ihren Mangel benennen. */
      const stillLeer = fragen.filter(
        (f) => f.resultStatus !== "PRESENT" && f.resultStatus !== "NOT_IN_DELIVERED_ARTEFACTS");
      const ausgewiesenLeer = ordnend.filter(
        (f) => f.resultStatus === "NOT_IN_DELIVERED_ARTEFACTS" && f.resultStatusReason);
      pruefe("V5", "Screener mit echten Zaehlungen",
        fragen.length === 18 && alleUeberUniversum && !stillLeer.length &&
        echteZaehlung.length === zaehlend.length && zaehlend.length >= 9 &&
        echteRangliste.length + ausgewiesenLeer.length === ordnend.length ? "PASS" : "FAIL",
        { questions: fragen.length,
          countingQuestions: zaehlend.length, withRealCount: echteZaehlung.length,
          rankedQuestions: ordnend.length, withRealRanking: echteRangliste.length,
          rankedDeclaredMissing: ausgewiesenLeer.length, silentlyEmpty: stillLeer.length,
          rankingGap: ausgewiesenLeer.length
            ? "Die Rangfragen tragen keine Namen: die Faktorwerte je Titel fehlen in den " +
              "ausgelieferten Artefakten. Ausgewiesen, nicht als leere Liste getarnt."
            : null,
          evaluatedOf: fragen.length ? fragen[0].evaluatedOf : null,
          example: fragen.find((f) => f.id === "aboveSMA200")
            ? (({ id, matched, notEvaluable, evaluatedOf }) =>
                ({ id, matched, notEvaluable, evaluatedOf }))(
                  fragen.find((f) => f.id === "aboveSMA200"))
            : null });
    }

    /* V6/V7 brauchen einen Browser: die Ansicht holt ihre Daten nach.
       Ohne Playwright wird das ausgewiesen, nicht behauptet. */
    let chromium = null;
    try { ({ chromium } = await import("playwright")); } catch (err) { chromium = null; }
    if (!chromium) {
      pruefe("V6", "Einzeltitel oeffnet sich", "SKIPPED", "playwright nicht installiert");
      pruefe("V7", "Mobil 390 px ohne Ueberlauf", "SKIPPED", "playwright nicht installiert");
    } else {
      const pfad = process.env.PLAYWRIGHT_EXECUTABLE_PATH || null;
      const browser = await chromium.launch(pfad ? { executablePath: pfad } : {});
      try {
        /* Der Browser bekommt den Zugang ueber die Bypass-Cookie-Variante:
           einmal mit Token aufrufen, Vercel setzt die Cookie, danach
           traegt der Kontext sie weiter. */
        for (const ansicht of [
          { id: "desktop", width: 1440, height: 900, mobile: false },
          { id: "mobile390", width: 390, height: 844, mobile: true }
        ]) {
          const ctx = await browser.newContext({
            viewport: { width: ansicht.width, height: ansicht.height },
            isMobile: ansicht.mobile, hasTouch: ansicht.mobile,
            extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS,
                                "x-vercel-set-bypass-cookie": "true" }
          });
          const page = await ctx.newPage();
          const url = BASE + "/preview-universe/?ticker=ORCL";
          await page.goto(url, { waitUntil: "networkidle", timeout: TIMEOUT }).catch(() => {});
          const g = await page.evaluate(() => {
            const t = document.body ? document.body.innerText : "";
            const k = document.getElementById("titel");
            const d = document.documentElement;
            return {
              textLength: t.replace(/\s+/g, " ").trim().length,
              dataRows: document.querySelectorAll("tbody tr").length,
              screenerRows: document.querySelectorAll(".frage").length,
              detailVisible: !!(k && !k.hidden && /ORCL/.test(k.innerText || "")),
              detailText: k ? (k.innerText || "").replace(/\s+/g, " ").slice(0, 300) : "",
              treffer: (document.getElementById("treffer") || {}).textContent || "",
              overflowPx: Math.max(0, d.scrollWidth - d.clientWidth)
            };
          }).catch(() => null);

          if (ansicht.id === "desktop") {
            pruefe("V6", "Einzeltitel oeffnet sich",
              g && g.detailVisible && g.dataRows > 0 && g.screenerRows === 18 ? "PASS" : "FAIL",
              g || "keine Messung moeglich");
          } else {
            pruefe("V7", "Mobil 390 px ohne Ueberlauf",
              g && g.overflowPx <= 2 && g.dataRows > 0 ? "PASS" : "FAIL",
              g ? { overflowPx: g.overflowPx, dataRows: g.dataRows } : "keine Messung moeglich");
          }

          /* Schluesselsuche im wirklich ausgelieferten Inhalt. */
          const html = await page.content().catch(() => "");
          for (const muster of SCHLUESSELMUSTER) {
            const treffer = html.match(muster.re);
            if (!treffer) continue;
            if (muster.id === "bareHex40") {
              const i = html.indexOf(treffer[0]);
              if (COMMIT_UMFELD.test(html.slice(Math.max(0, i - 80), i + 80))) continue;
            }
            bericht.secrets.findings.push({
              viewport: ansicht.id, source: "/preview-universe/", pattern: muster.id,
              note: "Muster getroffen. Der Wert wird bewusst nicht aufgezeichnet."
            });
          }
          await ctx.close();
        }
      } finally { await browser.close(); }
    }
  }

  /* ------------------------------------------------------------------
     V8 — Kein Schluessel im ausgelieferten Datensatz.
     ------------------------------------------------------------------ */
  if (datensatz) {
    const text = JSON.stringify(datensatz);
    for (const muster of SCHLUESSELMUSTER) {
      const treffer = text.match(muster.re);
      if (!treffer) continue;
      if (muster.id === "bareHex40") {
        const i = text.indexOf(treffer[0]);
        if (COMMIT_UMFELD.test(text.slice(Math.max(0, i - 80), i + 80))) continue;
      }
      bericht.secrets.findings.push({ source: "universe.json", pattern: muster.id,
        note: "Muster getroffen. Der Wert wird bewusst nicht aufgezeichnet." });
    }
  }
  bericht.secrets.status = bericht.secrets.findings.length ? "EXPOSED" : "CLEAN";
  pruefe("V8", "Kein Schluessel im ausgelieferten Inhalt",
    bericht.secrets.status === "CLEAN" ? "PASS" : "FAIL",
    { findings: bericht.secrets.findings.length });

  /* ------------------------------------------------------------------
     V9 — Die oeffentliche Auslieferung ist unveraendert.

     Zwei Belege: (a) die Vorschaupfade existieren dort NICHT, (b) die
     oeffentlichen Seiten stimmen Byte fuer Byte mit dem ueberein, was im
     Repository steht.
     ------------------------------------------------------------------ */
  const nichtOeffentlich = [];
  for (const pfad of ["/preview-universe/", "/quant/data/preview/universe.json"]) {
    const a = await hole(PAGES + pfad);
    const da = a.ok && a.status === 200 && UNSER_INHALT.some((re) => re.test(a.body || ""));
    nichtOeffentlich.push({ path: pfad, status: a.status, leaked: da });
  }
  const geleakt = nichtOeffentlich.filter((n) => n.leaked);

  const vergleiche = [];
  for (const pfad of ["/quant/screener/app.js", "/quant/ranking/app.js", "/quant/data/securities.json"]) {
    const lokal = join(root, pfad.replace(/^\//, ""));
    if (!existsSync(lokal)) { vergleiche.push({ path: pfad, status: "NOT_IN_REPO" }); continue; }
    const a = await hole(PAGES + pfad);
    if (!a.ok || a.status !== 200) { vergleiche.push({ path: pfad, status: `HTTP ${a.status}` }); continue; }
    const gleich = sha(a.body) === sha(readFileSync(lokal, "utf8"));
    vergleiche.push({ path: pfad, status: gleich ? "IDENTICAL" : "DIFFERS" });
  }
  const abweichend = vergleiche.filter((v) => v.status === "DIFFERS");
  /* Ein Vergleich, der nichts vergleichen konnte, ist kein bestandener
     Vergleich. Genau diese Verwechslung hat schon einmal ein "PASSED"
     ueber eine Seite gesetzt, die nichts zeigte: erreichbar ist nicht
     geprueft. Ohne einen einzigen echten Abgleich bleibt V9 UNKNOWN. */
  const verglichen = vergleiche.filter(
    (v) => v.status === "IDENTICAL" || v.status === "DIFFERS");
  pruefe("V9", "Oeffentliche Auslieferung unveraendert",
    geleakt.length || abweichend.length ? "FAIL"
      : verglichen.length ? "PASS" : "UNKNOWN",
    { previewPathsOnPublicSite: nichtOeffentlich, fileComparison: vergleiche,
      filesActuallyCompared: verglichen.length,
      note: "DIFFERS kann auch heissen, dass Pages einen aelteren Stand ausliefert - " +
            "dann gegen den ausgelieferten Commit pruefen, nicht gegen HEAD." });

  /* ------------------------------------------------------------------
     Gesamturteil. PASS nur, wenn nichts uebersprungen wurde - sonst
     PARTIALLY_VERIFIED. Ein Nachweis, der die Haelfte auslaesst, heisst
     nicht "bestanden".
     ------------------------------------------------------------------ */
  const fehl = bericht.checks.filter((c) => c.status === "FAIL");
  const offenGeblieben = bericht.checks.filter((c) => c.status === "SKIPPED" || c.status === "UNKNOWN");
  bericht.verdict = {
    status: fehl.length ? "FAILED" : offenGeblieben.length ? "PARTIALLY_VERIFIED" : "PREVIEW_VERIFIED",
    meaning: fehl.length
      ? "Mindestens ein Nachweis ist gescheitert."
      : offenGeblieben.length
        ? "Was geprueft wurde, ist in Ordnung. Was uebersprungen wurde, ist NICHT belegt."
        : "Vorschau geschuetzt, Inhalt vollstaendig, oeffentliche Auslieferung unveraendert.",
    checksTotal: bericht.checks.length,
    failed: fehl.map((c) => c.id),
    unproven: offenGeblieben.map((c) => `${c.id}:${c.status}`),
    secrets: bericht.secrets.status,
    authenticationProofScope: bericht.authenticationProofScope
  };

  console.log(`\n  Nachweise: ${bericht.checks.length}, gescheitert: ${fehl.length}, ` +
              `nicht belegt: ${offenGeblieben.length}`);
  console.log(`  Schluessel: ${bericht.secrets.status}`);
  console.log(`\n  ERGEBNIS: ${bericht.verdict.status}\n`);

  mkdirSync(OUT, { recursive: true });
  const datei = join(OUT, "vercel-preview-verification.json");
  writeFileSync(datei, entschaerfe(JSON.stringify(bericht, null, 2)) + "\n");
  console.log(`  ${datei.replace(root + "/", "")}\n`);

  if (fehl.length) process.exit(1);
}

main().catch((err) => {
  console.error("\n  ABBRUCH:", entschaerfe(String((err && err.message) || err)));
  process.exit(1);
});

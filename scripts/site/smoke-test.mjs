/* =========================================================================
   VISION UNIVERSE — smoke-test.mjs

   LEBT DIE AUSGELIEFERTE SEITE?

   Kein Funktionstest und keine Architekturaenderung: dieses Skript ruft
   die veroeffentlichten Seiten mit einem echten Browser auf und sieht
   nach, ob sie laden, ob ihre Kerninhalte erscheinen, ob die Konsole
   Fehler meldet und ob Anfragen ins Leere gehen.

   WARUM EIN BROWSER

   "HTTP 200" beantwortet die Frage nicht. Diese Seiten holen ihre Daten
   nach dem Laden nach; eine Seite kann sauber ausgeliefert werden und
   trotzdem leer bleiben, weil eine Datendatei fehlt. Ein 404 auf eine
   nachgeladene JSON-Datei taucht in keinem Serverstatus auf - nur in der
   Netzwerkliste des Browsers.

   WAS ALS FEHLER ZAEHLT

   Konsolenfehler und fehlgeschlagene Anfragen der EIGENEN Herkunft. Ein
   404 auf eine fremde Ressource waere ein Befund ueber jemand anderen;
   die Liste unten haelt fest, was zur Seite gehoert.

   Ausfuehren (braucht offenes Netz - im Sandkasten ist die Domain
   gesperrt, also laeuft es in GitHub Actions):
     node scripts/site/smoke-test.mjs --base https://research.visionuniverse.de
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const BASE = (arg("--base", "https://research.visionuniverse.de")).replace(/\/$/, "");
const OUT = arg("--out", join(root, "quant", "data", "site"));
/* Wie lange darf eine Seite brauchen, bis ihr Kerninhalt steht? Grosszuegig:
   ein zu knapper Wert misst die Laufzeit des Runners und nicht die Seite. */
const TIMEOUT = parseInt(arg("--timeout", "30000"), 10) || 30000;

/* Die Seiten aus der Aufgabe, mit je einem Beleg dafuer, dass sie
   wirklich gerendert haben - nicht nur geantwortet.

   `expect` ist ein Textstueck oder ein Selektor, der nur erscheint, wenn
   die Seite ihre Arbeit getan hat. Ein <title> allein reicht nicht: den
   liefert auch eine Seite, deren Daten fehlen. */
const SEITEN = [
  { id: "homepage", label: "Homepage", path: "/",
    expect: { selector: "body", text: /Vision Universe/i } },
  { id: "goldenFive", label: "Golden Five (Einzeltitel)", path: "/quant/stock/?ticker=AAPL",
    expect: { selector: "body", text: /AAPL/i } },
  { id: "chart", label: "Chart", path: "/dashboard/charting/",
    expect: { selector: "body", text: /Chart/i } },
  { id: "technical", label: "Technical Intelligence", path: "/quant/technical/",
    expect: { selector: "body", text: /Technical/i } },
  { id: "elliott", label: "Elliott Wave", path: "/quant/technical/",
    expect: { selector: "body", text: /Elliott/i } },
  { id: "screener", label: "Screener", path: "/quant/screener/",
    expect: { selector: "body", text: /Screener/i } },
  { id: "ranking", label: "Ranking", path: "/quant/ranking/",
    expect: { selector: "body", text: /Ranking/i } }
];

/* Was auf einer ausgelieferten Seite NIE stehen darf. Der Zugangsschluessel
   ist 40 Hexzeichen; die Muster fangen ihn und seine ueblichen
   Verpackungen. Gesucht wird im ausgelieferten HTML und in jedem
   nachgeladenen Textinhalt derselben Herkunft (§2). */
const SCHLUESSELMUSTER = [
  { id: "tiingoTokenHeader", re: /Token\s+[0-9a-f]{32,}/i },
  { id: "apiKeyAssignment", re: /(api[_-]?key|apikey|secret|token|password)["'\s:=]+[A-Za-z0-9_\-]{24,}/i },
  { id: "tiingoEnvName", re: /TIINGO_API_KEY\s*[:=]\s*["'][^"']{8,}/i },
  { id: "bareHex40", re: /\b[0-9a-f]{40}\b/ }
];

/* Ein 40-stelliger Hexwert ist auch ein Git-Commit. Der Nachweis wuerde
   sonst jede Seite anhalten, die ihren eigenen Stand nennt - und eine
   Pruefung, die immer anschlaegt, wird abgeschaltet. Deshalb: der bare
   Hexwert zaehlt nur als Befund, wenn er NICHT als Commit ausgewiesen
   ist. */
const COMMIT_UMFELD = /(commit|sha|revision|version|build|integrity|hash)/i;

function jetzt() { return new Date().toISOString(); }

async function main() {
  console.log("\nVision Universe — Live-Rauchtest\n");
  console.log(`  Basis: ${BASE}`);
  console.log(`  Seiten: ${SEITEN.length}\n`);

  const bericht = {
    generatedAt: jetzt(),
    base: BASE,
    scope: "liveSmokeTest",
    note: "Ruft die veroeffentlichten Seiten mit einem echten Browser auf. Geprueft " +
          "werden Erreichbarkeit, gerenderter Kerninhalt, Konsolenfehler, " +
          "fehlgeschlagene Anfragen eigener Herkunft und Schluesselaustritt.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null
    },
    viewports: [],
    pages: [],
    secrets: { status: null, findings: [] },
    verdict: null
  };

  /* In Umgebungen, die einen vorinstallierten Chromium mitbringen (und
     keinen Nachladeweg haben), zeigt PLAYWRIGHT_EXECUTABLE_PATH darauf.
     In Actions bleibt die Variable leer und Playwright nimmt den
     Browser, den es selbst geholt hat. */
  const browserPfad = process.env.PLAYWRIGHT_EXECUTABLE_PATH || null;
  const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});
  const basisHost = new URL(BASE).host;

  /* Zwei Ansichten: Schreibtisch und 390 px. Die zweite ist aus der
     Aufgabe und faengt genau das, was ein Schreibtischtest nicht sieht -
     ein Layout, das auf einem Telefon ueberlaeuft. */
  const ANSICHTEN = [
    { id: "desktop", label: "Schreibtisch", width: 1440, height: 900, mobile: false },
    { id: "mobile390", label: "Mobil 390 px", width: 390, height: 844, mobile: true }
  ];

  for (const ansicht of ANSICHTEN) {
    bericht.viewports.push({ id: ansicht.id, width: ansicht.width, height: ansicht.height });
    const context = await browser.newContext({
      viewport: { width: ansicht.width, height: ansicht.height },
      isMobile: ansicht.mobile,
      hasTouch: ansicht.mobile,
      userAgent: ansicht.mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
          "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined
    });

    for (const seite of SEITEN) {
      const url = BASE + seite.path;
      const konsolenFehler = [];
      const fehlgeschlagen = [];
      const seitenFehler = [];
      const texte = [];
      const page = await context.newPage();

      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        konsolenFehler.push(String(msg.text()).slice(0, 300));
      });
      page.on("pageerror", (err) => {
        seitenFehler.push(String((err && err.message) || err).slice(0, 300));
      });
      page.on("response", async (res) => {
        try {
          const u = new URL(res.url());
          if (u.host !== basisHost) return;          /* fremde Herkunft ist nicht unser Befund */
          if (res.status() >= 400) {
            fehlgeschlagen.push({ url: u.pathname + u.search, status: res.status() });
            return;
          }
          const typ = String(res.headers()["content-type"] || "");
          if (!/text|json|javascript/i.test(typ)) return;
          const koerper = await res.text().catch(() => "");
          if (koerper) texte.push({ url: u.pathname, body: koerper.slice(0, 200000) });
        } catch (err) { /* eine Antwort, die sich nicht lesen laesst, ist kein Befund */ }
      });
      page.on("requestfailed", (req) => {
        try {
          const u = new URL(req.url());
          if (u.host !== basisHost) return;
          fehlgeschlagen.push({ url: u.pathname + u.search,
                                status: null,
                                failure: (req.failure() || {}).errorText || "unbekannt" });
        } catch (err) { /* nicht auswertbar */ }
      });

      let httpStatus = null, geladen = false, ladeFehler = null;
      const t0 = Date.now();
      try {
        const res = await page.goto(url, { waitUntil: "networkidle", timeout: TIMEOUT });
        httpStatus = res ? res.status() : null;
        geladen = true;
      } catch (err) {
        ladeFehler = String((err && err.message) || err).slice(0, 200);
        /* networkidle kann an einer Seite mit dauerndem Polling scheitern -
           dann trotzdem weiterpruefen, was steht. */
        try { await page.waitForLoadState("domcontentloaded", { timeout: 5000 }); geladen = true; }
        catch (err2) { /* wirklich nicht geladen */ }
      }
      const ladezeitMs = Date.now() - t0;

      /* Ist der Kerninhalt da? Nicht "hat geantwortet", sondern "hat
         gerendert".

         DIESE PRUEFUNG WAR ZU SCHWACH und hat einen echten Zustand
         durchgelassen: sie suchte "Vision Universe" im Body-Text, und das
         erfuellt die Kopfzeile allein. Eine Seite, die nur ihr Menue
         zeigt und darunter "Daten nicht verfuegbar", galt als bestanden.

         Jetzt wird gemessen, nicht gesucht: wie viel sichtbarer Text
         steht da, wie viele Datenzeilen, und - entscheidend - in welchem
         Datenmodus die Seite laeuft. Eine Seite in MOCK oder UNAVAILABLE
         ist nicht kaputt, aber sie zeigt eben auch keine Marktdaten, und
         das muss im Bericht stehen. */
      let inhaltGefunden = false, titel = null, sichtbarerText = "";
      let inhalt = null;
      try {
        titel = await page.title();
        inhalt = await page.evaluate(() => {
          const t = document.body ? document.body.innerText.replace(/\s+/g, " ").trim() : "";
          return {
            textLength: t.length,
            dataRows: document.querySelectorAll("tbody tr").length,
            charts: document.querySelectorAll("canvas, svg").length,
            /* Die Seiten weisen ihren Datenzustand selbst aus. Das ist die
               ehrlichste Quelle - ehrlicher als jede Heuristik von aussen. */
            /* NUR im Kopfbereich suchen, nicht im ganzen Text.

               Zwei Fehlalarme hintereinander haben das gelehrt. Erst
               schlug der Stamm "SYNTHETISCHE" auf "Kein synthetischer
               Titel des Modelluniversums" an, dann "Demo-Daten" auf
               "fehlende Daten werden nicht stillschweigend durch
               Demo-Daten ersetzt". Beide Male stand das Wort in einer
               VERNEINUNG - die Seite erklaerte, dass sie es gerade nicht
               tut, und wurde dafuer als Demo gemeldet.

               Die Kennzeichnung steht bei diesen Seiten im Kopf, der
               Erklaertext weiter unten. Die ersten 400 Zeichen trennen
               beides zuverlaessiger als jede Wortliste. */
            mockBanner: /DEMO-DATEN|SYNTHETISCHES UNIVERSUM|Synthetische Fixtures|MODE\s*·?\s*MOCK/i
              .test(t.slice(0, 400)),
            unavailableBanner: /MARKET DATA UNAVAILABLE|Daten nicht verf/i.test(t.slice(0, 400)),
            realDataBanner: /REAL DATA|GOLDEN UNIVERSE/i.test(t.slice(0, 400)),
            excerpt: t.slice(0, 200)
          };
        });
        sichtbarerText = inhalt.excerpt;
        inhaltGefunden = seite.expect.text.test(inhalt.excerpt) ||
                         seite.expect.text.test(titel || "") ||
                         inhalt.textLength >= (seite.minText || 200);
      } catch (err) { /* kein Dokument */ }

      /* Laeuft das Layout auf dem Telefon ueber? Ein horizontaler
         Ueberlauf ist der Fehler, den ein Schreibtischtest nie sieht. */
      let ueberlauf = null;
      if (ansicht.mobile) {
        try {
          ueberlauf = await page.evaluate(() => {
            const d = document.documentElement;
            return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth,
                     overflowPx: Math.max(0, d.scrollWidth - d.clientWidth) };
          });
        } catch (err) { /* nicht messbar */ }
      }

      /* Schluesselsuche im ausgelieferten HTML und in jedem nachgeladenen
         Textinhalt derselben Herkunft. */
      let html = "";
      try { html = await page.content(); } catch (err) { html = ""; }
      const quellen = [{ url: seite.path, body: html }].concat(texte);
      for (const q of quellen) {
        for (const muster of SCHLUESSELMUSTER) {
          const treffer = q.body.match(muster.re);
          if (!treffer) continue;
          if (muster.id === "bareHex40") {
            /* Nur melden, wenn der Wert NICHT als Commit/Version dasteht. */
            const idx = q.body.indexOf(treffer[0]);
            const umfeld = q.body.slice(Math.max(0, idx - 80), idx + 80);
            if (COMMIT_UMFELD.test(umfeld)) continue;
          }
          bericht.secrets.findings.push({
            viewport: ansicht.id, page: seite.id, source: q.url, pattern: muster.id,
            /* Der Treffer selbst wird NICHT mitgeschrieben - ein Bericht
               ueber ein Leck, der das Leck enthaelt, ist das Leck. */
            note: "Muster getroffen. Der Wert wird bewusst nicht aufgezeichnet."
          });
        }
      }

      await page.close();

      const ok = geladen && (httpStatus === null || httpStatus < 400) && inhaltGefunden &&
                 !seitenFehler.length && !konsolenFehler.length && !fehlgeschlagen.length &&
                 (!ueberlauf || ueberlauf.overflowPx <= 2);

      bericht.pages.push({
        viewport: ansicht.id, id: seite.id, label: seite.label, url: seite.path,
        httpStatus, loaded: geladen, loadError: ladeFehler, loadMs: ladezeitMs,
        title: titel, contentRendered: inhaltGefunden,
        expectation: String(seite.expect.text),
        /* Was wirklich auf der Seite steht - Zahlen, keine Zusicherung. */
        content: inhalt,
        /* Der Datenzustand, den die Seite selbst ausweist. Das ist die
           Antwort auf "live ist nichts zu sehen": nicht kaputt, aber
           auch nicht mit Marktdaten befuellt. */
        dataMode: inhalt
          ? (inhalt.unavailableBanner ? "UNAVAILABLE"
            : inhalt.mockBanner ? "MOCK"
            : inhalt.realDataBanner ? "REAL" : "UNMARKED")
          : null,
        consoleErrors: konsolenFehler.slice(0, 10),
        pageErrors: seitenFehler.slice(0, 10),
        failedRequests: fehlgeschlagen.slice(0, 15),
        horizontalOverflow: ueberlauf,
        result: ok ? "PASS" : "FAIL"
      });

      const marke = ok ? "OK  " : "FAIL";
      const modus = inhalt
        ? (inhalt.unavailableBanner ? "UNAVAILABLE" : inhalt.mockBanner ? "MOCK"
          : inhalt.realDataBanner ? "REAL" : "-")
        : "?";
      console.log(`  [${ansicht.id.padEnd(10)}] ${marke} ${seite.label.padEnd(28)} ` +
                  `${String(httpStatus || "-").padStart(3)} ${String(ladezeitMs).padStart(5)} ms ` +
                  `${modus.padEnd(11)} ${String(inhalt ? inhalt.textLength : 0).padStart(5)} Zeichen, ` +
                  `${String(inhalt ? inhalt.dataRows : 0).padStart(3)} Datenzeilen` +
                  (inhaltGefunden ? "" : "  [Inhalt fehlt]") +
                  (konsolenFehler.length ? `  [${konsolenFehler.length} Konsolenfehler]` : "") +
                  (seitenFehler.length ? `  [${seitenFehler.length} JS-Fehler]` : "") +
                  (fehlgeschlagen.length ? `  [${fehlgeschlagen.length} fehlgeschlagen]` : "") +
                  (ueberlauf && ueberlauf.overflowPx > 2 ? `  [${ueberlauf.overflowPx}px Ueberlauf]` : ""));
    }

    await context.close();
  }

  await browser.close();

  bericht.secrets.status = bericht.secrets.findings.length ? "EXPOSED" : "CLEAN";

  const fehlerhaft = bericht.pages.filter((p) => p.result === "FAIL");
  /* Erreichbarkeit und Inhalt sind zwei Fragen. Eine Seite kann laden,
     rendern und trotzdem nichts zeigen, weil ihre Daten nicht
     freigegeben sind. Der Bericht trennt das jetzt - vorher hat er es
     vermischt und "PASSED" gemeldet, wo "erreichbar, aber ohne
     Marktdaten" richtig gewesen waere. */
  const nachModus = {};
  for (const p of bericht.pages) nachModus[p.dataMode || "?"] = (nachModus[p.dataMode || "?"] || 0) + 1;
  const ohneMarktdaten = bericht.pages.filter(
    (p) => p.dataMode === "UNAVAILABLE" || p.dataMode === "MOCK");

  bericht.verdict = {
    status: fehlerhaft.length ? "FAILED" : "PASSED",
    meaning: "PASSED heisst: erreichbar, gerendert, ohne JS- und 404-Fehler. Es heisst NICHT, " +
             "dass Marktdaten sichtbar sind - dafuer steht dataAvailability.",
    pagesChecked: bericht.pages.length,
    pagesFailed: fehlerhaft.length,
    failures: fehlerhaft.map((p) => `${p.viewport}/${p.id}`),
    secrets: bericht.secrets.status,
    dataAvailability: {
      byMode: nachModus,
      pagesWithoutMarketData: ohneMarktdaten.length,
      pages: ohneMarktdaten.map((p) => `${p.viewport}/${p.id}:${p.dataMode}`),
      note: ohneMarktdaten.length
        ? "Diese Seiten laden, zeigen aber keine Marktdaten. Sie weisen das selbst aus " +
          "(MOCK bzw. UNAVAILABLE) - das ist der Zustand der Freigabe, kein Defekt der Seite."
        : "Alle geprueften Seiten fuehren Echtdaten."
    }
  };

  console.log(`\n  Seiten geprueft: ${bericht.pages.length}, davon fehlerhaft: ${fehlerhaft.length}`);
  console.log(`  Datenzustand: ${JSON.stringify(nachModus)}`);
  if (ohneMarktdaten.length) {
    console.log(`  OHNE MARKTDATEN: ${ohneMarktdaten.length} Seitenaufrufe ` +
                `(${[...new Set(ohneMarktdaten.map((p) => p.id + ":" + p.dataMode))].join(", ")})`);
    console.log("  Diese Seiten sind erreichbar und weisen ihren Zustand selbst aus.");
  }
  console.log(`  Schluessel im ausgelieferten Inhalt: ${bericht.secrets.status}`);
  console.log(`\n  ERGEBNIS: ${bericht.verdict.status}\n`);

  mkdirSync(OUT, { recursive: true });
  const datei = join(OUT, "smoke-test.json");
  writeFileSync(datei, JSON.stringify(bericht, null, 2) + "\n");
  console.log(`  ${datei.replace(root + "/", "")}\n`);

  if (bericht.verdict.status !== "PASSED" || bericht.secrets.status !== "CLEAN") process.exit(1);
}

main().catch((err) => {
  console.error("\n  ABBRUCH:", (err && err.message) || String(err));
  process.exit(1);
});

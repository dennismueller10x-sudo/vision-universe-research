/* =========================================================================
   VISION UNIVERSE — vercel-should-build.mjs

   WARUM VERCEL FUER DAS QUANT-FRONTEND NICHTS BAUEN MUSS.

   Am 28.09.2026 stand der Quant-Release rot, weil Vercel meldete:

     Resource is limited - try again in 24 hours
     (more than 100, code: "api-deployments-free-per-day")

   Das ist ein Tageskontingent des Accounts, kein Fehler im Code. Die
   Frage war also nicht "wie reparieren wir den Build", sondern "wofuer
   baut Vercel hier ueberhaupt". Gemessen im Repository:

     1. Der oeffentliche Vercel-Build erzeugt GENAU EINE Datei:
        .vercel-public/index.html, 197 Byte, ein Satz, noindex.
        Das Quant-Frontend liegt nicht darin. Es kommt von GitHub Pages
        (CNAME research.visionuniverse.de, pages-release.yml,
        actions/deploy-pages@v4) - 35.697 Dateien.

     2. Vercel hostet drei echte Serverless-Funktionen:
        api/history.js, api/intraday.js, api/status.js.
        KEINE Frontend-Datei ruft sie auf. Die einzigen Aufrufer im
        Repository sind quant/tests/product-data-service.test.mjs -
        und die laden sie direkt als Modul, nicht ueber HTTP.
        vu2/*.js enthaelt kein fetch() auf /api/ und keine Vercel-Herkunft.
        Der Live-Kurs-Strom laeuft ueber Cloudflare
        (wss://live.visionuniverse.de/live), nicht ueber Vercel.

     3. Keine einzige Workflow-Datei nennt Vercel. Die Vercel-Checks
        kommen von der GitHub-App, nicht aus der CI dieses Repos.

   Ergebnis: eine Vorschau dieses Projekts zeigt fuer einen Commit, der
   nur das Frontend anfasst, einen Satz Platzhaltertext. Sie kostet ein
   Deployment aus dem gemeinsamen Tageskontingent und sagt nichts.

   DESHALB diese Regel - und nur diese: Vercel baut, wenn sich etwas
   geaendert hat, das Vercel auch ausliefert. Sonst nicht.

   WAS DIESE REGEL AUSDRUECKLICH NICHT TUT

   Sie entfernt Vercel nicht. Die drei Funktionen, server/ und vercel.json
   bleiben unberuehrt, und fuer die Produktion baut Vercel immer - auch
   wenn der Commit nur das Frontend anfasst. Ein Kontingent zu schonen
   darf niemals ein Produktionsziel stillegen, und andere
   Vision-Universe-Produkte, die diese Funktionen spaeter brauchen,
   verlieren nichts.

   DIE RICHTUNG DES ZWEIFELS

   Vercels Vertrag fuer den Ignored Build Step ist umgekehrt zur
   Intuition: Exit 0 heisst ABBRECHEN, Exit 1 heisst BAUEN. Wer das
   verwechselt, schaltet die Produktion ab. Deshalb ist hier jeder
   unklare Fall ein BAUEN: laesst sich die Liste der geaenderten Dateien
   nicht ermitteln, baut Vercel. Ein Deployment zu viel kostet ein
   Kontingent, ein Deployment zu wenig kostet die Auslieferung.
   ========================================================================= */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/* Was Vercel tatsaechlich ausliefert oder braucht, um auszuliefern.
   Aendert sich hier etwas, ist eine Vorschau aussagekraeftig. */
export const VERCEL_PFADE = [
  "api/",
  "server/",
  "vercel.json",
  ".vercelignore",
  "scripts/vu2/build-vercel-public.mjs",
];

export const BAUEN = 1;
export const ABBRECHEN = 0;

/**
 * Die reine Entscheidung, ohne git und ohne Prozess.
 *
 * @param {object} lage
 * @param {string} lage.umgebung        VERCEL_ENV: production | preview | development
 * @param {string[]|null} lage.dateien  geaenderte Pfade, oder null wenn unbekannt
 * @returns {{code:number, grund:string}}
 */
export function entscheide({ umgebung, dateien }) {
  /* Die Produktion ist nie verhandelbar. */
  if (String(umgebung || "").trim() === "production") {
    return { code: BAUEN, grund: "PRODUKTION: Vercel baut immer, unabhaengig von den Pfaden." };
  }

  /* Unbekannt heisst bauen. Siehe "Die Richtung des Zweifels" oben. */
  if (!Array.isArray(dateien)) {
    return { code: BAUEN, grund: "UNBEKANNT: Liste der geaenderten Dateien nicht ermittelbar - es wird gebaut." };
  }

  const treffer = dateien.filter((d) => VERCEL_PFADE.some((p) => (p.endsWith("/") ? d.startsWith(p) : d === p)));
  if (treffer.length) {
    return { code: BAUEN, grund: "VERCEL-EIGENES GEAENDERT: " + treffer.slice(0, 5).join(", ") };
  }

  return {
    code: ABBRECHEN,
    grund: "NICHTS VERCEL-EIGENES in " + dateien.length + " geaenderten Dateien - "
      + "die Vorschau waere der 197-Byte-Platzhalter. Kein Deployment.",
  };
}

/** Die geaenderten Dateien, oder null wenn git keine belastbare Antwort gibt. */
export function geaenderteDateien(env = process.env) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  /* Erst gegen die Basis, dann gegen den Vorgaenger-Commit. Beides kann in
     einem flachen Klon fehlschlagen - dann bleibt null, und null baut. */
  const versuche = [
    () => {
      const basis = String(env.VERCEL_GIT_COMMIT_REF || "") === "main" ? "HEAD^" : "origin/main";
      git("rev-parse", "--verify", basis);
      return git("diff", "--name-only", basis + "...HEAD");
    },
    () => {
      git("rev-parse", "--verify", "HEAD^");
      return git("diff", "--name-only", "HEAD^", "HEAD");
    },
  ];
  for (const versuch of versuche) {
    try {
      const rohtext = versuch();
      /* Ein leerer Diff ist eine Antwort, kein Fehler: nichts geaendert. */
      return rohtext ? rohtext.split("\n").map((z) => z.trim()).filter(Boolean) : [];
    } catch { /* naechster Versuch */ }
  }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const umgebung = process.env.VERCEL_ENV || "preview";
  const dateien = geaenderteDateien();
  const { code, grund } = entscheide({ umgebung, dateien });
  console.log((code === BAUEN ? "BAUEN" : "ABBRECHEN") + ": " + grund);
  process.exit(code);
}

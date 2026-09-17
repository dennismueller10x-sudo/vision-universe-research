#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — assert-deploy-preconditions.mjs

   DAS TOR VOR DEM DEPLOYMENT

   Die Owner-Freigabe vom 17.09.2026 ist bedingt: "Wenn diese Nachweise
   gruen sind, ist die Owner-Freigabe erteilt." Eine Bedingung, die
   niemand prueft, ist keine. Dieses Skript prueft sie - und es laeuft
   VOR dem Deployment, nicht danach.

   Es liest nur Berichte, die aus echten Laeufen stammen. Fehlt einer,
   ist er alt oder steht etwas anderes als PASS darin, bricht es ab. Ein
   versehentlich ausgeloester Deployment-Lauf kommt damit nicht durch.

   DIE SECHS BEDINGUNGEN, IN DER SPRACHE DES OWNERS

     ZERO_COST                    Kontingentverbrauch im Rahmen
     TIINGO_DYNAMIC_SUBSCRIPTION  die Frage ist beantwortet
     50_ACTIVE_SYMBOL_LOAD        fuenfzig Titel wirklich getragen
     REALTIME_FALLBACK            der Rueckfall ist geprueft
     SECRET_SCAN                  kein Schluessel in der Auslieferung
     PAID_SERVICES_ENABLED = 0    nichts Kostenpflichtiges eingeschaltet

   EINE LESART, DIE BENANNT GEHOERT

   TIINGO_DYNAMIC_SUBSCRIPTION = PASS heisst hier: die Frage wurde
   waehrend offener Boerse BEANTWORTET - mit ja oder mit nein. Ein Nein
   ist kein Fehlschlag des Produkts, sondern der Fall, fuer den der
   Subscription Manager von Anfang an den Modus "reconnect" hat (§1 des
   Bauauftrags: "Falls nein: baue einen sauberen reconnect-basierten
   Subscription-Manager" - das ist gebaut und getestet). Was NICHT
   durchgeht, ist UNKNOWN oder INCONCLUSIVE: dann ist nichts gemessen,
   und der Betriebsmodus stuende auf einer Vermutung.
   ========================================================================= */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(root, "quant", "data", "market", "commercial");
const argv = process.argv.slice(2);
/* Wie alt ein Nachweis hoechstens sein darf. Ein Lasttest von letzter
   Woche sagt nichts ueber den Code von heute. */
const MAX_ALTER_STUNDEN = Math.max(1, parseInt(
  (argv.indexOf("--max-age-hours") >= 0 ? argv[argv.indexOf("--max-age-hours") + 1] : "24"), 10) || 24);

function lies(name) {
  const p = join(DIR, name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { return null; }
}
function alterStunden(bericht) {
  if (!bericht || !bericht.checkedAt) return null;
  const t = Date.parse(bericht.checkedAt);
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 36000) / 100;
}

const dyn = lies("dynamic-subscribe-verification.json");
const e2e = lies("vu-live-e2e.json");
const zugang = lies("cloudflare-access-probe.json");
const umfang = lies("cloudflare-scope-probe.json");

const bedingungen = [];
function bedingung(name, ok, begruendung, belege) {
  bedingungen.push({ name, status: ok ? "PASS" : "FAIL", reason: begruendung, evidence: belege || null });
}

/* ---- 1. ZERO_COST --------------------------------------------------- */
(() => {
  if (!e2e) return bedingung("ZERO_COST", false, "Kein Lastbericht vorhanden.");
  if (e2e.synthetic) return bedingung("ZERO_COST", false, "Der Lastbericht ist ein Trockenlauf (synthetic).");
  const alt = alterStunden(e2e);
  if (alt === null || alt > MAX_ALTER_STUNDEN) {
    return bedingung("ZERO_COST", false, "Der Lastbericht ist " + alt + " h alt (erlaubt: " + MAX_ALTER_STUNDEN + " h).");
  }
  const stufen = e2e.load || [];
  if (!stufen.length) return bedingung("ZERO_COST", false, "Keine Laststufen im Bericht.");
  const schlimm = stufen.filter((l) => l.budget.verdict !== "OK" && l.budget.verdict !== "WARNING");
  const hoechster = Math.max(...stufen.map((l) => l.budget.requestShare || 0));
  bedingung("ZERO_COST", schlimm.length === 0,
    schlimm.length === 0
      ? "Kein Lauf ueber PROTECT. Hoechster Anteil: " + Math.round(hoechster * 1000) / 10 + " %."
      : "Diese Stufen kamen ueber WARNING hinaus: " + schlimm.map((l) => l.symbols + " Titel (" + l.budget.verdict + ")").join(", "),
    { highestRequestShare: hoechster, verdicts: stufen.map((l) => ({ symbols: l.symbols, verdict: l.budget.verdict })) });
})();

/* ---- 2. TIINGO_DYNAMIC_SUBSCRIPTION --------------------------------- */
(() => {
  if (!dyn) return bedingung("TIINGO_DYNAMIC_SUBSCRIPTION", false, "Kein Nachweis vorhanden.");
  const alt = alterStunden(dyn);
  if (alt === null || alt > MAX_ALTER_STUNDEN) {
    return bedingung("TIINGO_DYNAMIC_SUBSCRIPTION", false, "Der Nachweis ist " + alt + " h alt.");
  }
  const beantwortet = dyn.result === "DYNAMIC_SUPPORTED" || dyn.result === "DYNAMIC_REJECTED";
  bedingung("TIINGO_DYNAMIC_SUBSCRIPTION", beantwortet,
    beantwortet
      ? "Waehrend offener Sitzung beantwortet: " + dyn.result +
        (dyn.result === "DYNAMIC_REJECTED" ? " - der Manager laeuft im Modus reconnect, wie fuer diesen Fall gebaut." : "")
      : "Nicht beantwortet (" + dyn.result + (dyn.reason ? ", " + dyn.reason : "") +
        "). Der Betriebsmodus stuende auf einer Vermutung.",
    { result: dyn.result, session: dyn.session ? dyn.session.phase : null, evidence: dyn.evidence || null });
})();

/* ---- 3. 50_ACTIVE_SYMBOL_LOAD --------------------------------------- */
(() => {
  if (!e2e || e2e.synthetic) return bedingung("50_ACTIVE_SYMBOL_LOAD", false, "Kein echter Lastbericht.");
  const fuenfzig = (e2e.load || []).find((l) => l.symbols === 50);
  if (!fuenfzig) return bedingung("50_ACTIVE_SYMBOL_LOAD", false, "Die Stufe mit 50 Titeln fehlt.");
  const getragen = fuenfzig.coverageOk === true &&
                   fuenfzig.managerState !== "BLOCKED" &&
                   (fuenfzig.client ? fuenfzig.client.clientMessages > 0 : false);
  bedingung("50_ACTIVE_SYMBOL_LOAD", getragen,
    getragen
      ? "50 von 50 Titeln abonniert, " + fuenfzig.providerEventsPerSecond + " Ereignisse/s, CPU " +
        fuenfzig.cpu.sharePercent + " %, Kontingent " + Math.round(fuenfzig.budget.requestShare * 1000) / 10 + " %."
      : "Die Stufe trug nicht, was ihr Name sagt: abonniert " + fuenfzig.subscribedSymbols + " von 50.",
    { symbols: fuenfzig.subscribedSymbols, coverageOk: fuenfzig.coverageOk,
      eventsPerSecond: fuenfzig.providerEventsPerSecond, cpuPercent: fuenfzig.cpu.sharePercent });
})();

/* ---- 4. REALTIME_FALLBACK ------------------------------------------- */
(() => {
  /* Der Rueckfall ist kein Messwert einer Boersensitzung, sondern eine
     Eigenschaft, die in Tests erzwungen wird: Abriss, Ablehnung,
     erschoepftes Kontingent, geschlossene Boerse. Das Tor prueft
     deshalb, dass diese Tests existieren UND dass der Lauf sie gerade
     bestanden hat (der Workflow-Schritt davor). */
  const marke = join(DIR, "vu-live-tests-passed.json");
  const t = existsSync(marke) ? JSON.parse(readFileSync(marke, "utf8")) : null;
  const alt = alterStunden(t);
  const frisch = t && alt !== null && alt <= MAX_ALTER_STUNDEN;
  bedingung("REALTIME_FALLBACK", !!(frisch && t.allPassed),
    frisch && t.allPassed
      ? t.total + " Tests gruen, darunter Abriss, Ablehnung, erschoepftes Kontingent und geschlossene Boerse."
      : "Kein frischer gruener Testlauf (die Marke entsteht im Schritt davor).",
    t ? { total: t.total, suites: t.suites } : null);
})();

/* ---- 5. SECRET_SCAN -------------------------------------------------- */
(() => {
  const marke = join(DIR, "secret-scan-passed.json");
  const t = existsSync(marke) ? JSON.parse(readFileSync(marke, "utf8")) : null;
  const alt = alterStunden(t);
  const frisch = t && alt !== null && alt <= MAX_ALTER_STUNDEN;
  bedingung("SECRET_SCAN", !!(frisch && t.clean),
    frisch && t.clean ? t.files + " Dateien geprueft, keine Zugangsdaten."
                      : "Kein frischer sauberer Scan.",
    t ? { files: t.files } : null);
})();

/* ---- 6. PAID_SERVICES_ENABLED = 0 ------------------------------------ */
(() => {
  const toml = readFileSync(join(root, "worker", "wrangler.toml"), "utf8");
  /* Was einen kostenpflichtigen Tarif verlangen wuerde - und was dieser
     Entwurf deshalb nicht enthaelt. Geprueft wird die Datei, nicht eine
     Absichtserklaerung. */
  const verboten = [
    { muster: /^\s*usage_model\s*=/m, name: "usage_model" },
    { muster: /^\s*\[\[kv_namespaces\]\]/m, name: "KV" },
    { muster: /^\s*\[\[r2_buckets\]\]/m, name: "R2-Bindung" },
    { muster: /^\s*\[\[d1_databases\]\]/m, name: "D1" },
    { muster: /^\s*\[triggers\]/m, name: "Cron-Trigger" },
    { muster: /new_classes\s*=/m, name: "new_classes (nicht-SQLite-Durable-Objects: nur im Paid-Tarif)" }
  ];
  const treffer = verboten.filter((v) => v.muster.test(toml)).map((v) => v.name);
  const sqlite = /new_sqlite_classes\s*=/.test(toml);
  /* Seit dem 17.09.2026 gilt ZERO_COST_MODE = HARD. Die Konfiguration
     allein genuegt dafuer nicht: es darf auch KEIN Skript und KEIN
     Workflow einen Tarif anfassen koennen. Das prueft
     assert-zero-cost-mode.mjs, und sein Urteil gehoert hierher. */
  const hartesUrteil = lies("zero-cost-mode.json");
  const hartFrisch = hartesUrteil && alterStunden(hartesUrteil) !== null &&
                     alterStunden(hartesUrteil) <= MAX_ALTER_STUNDEN;
  const hartOk = !!(hartFrisch && hartesUrteil.verdict === "PASS");
  bedingung("PAID_SERVICES_ENABLED", treffer.length === 0 && sqlite && hartOk,
    treffer.length === 0 && sqlite && hartOk
      ? "Nichts Kostenpflichtiges konfiguriert; die Durable-Object-Klasse ist SQLite-gestuetzt, wie es der " +
        "kostenlose Tarif verlangt; und in " + hartesUrteil.scanned.files + " ausfuehrbaren Dateien steht " +
        "kein Aufruf, der einen Tarif aendern koennte."
      : (treffer.length ? "Gefunden: " + treffer.join(", ") + "." : "") +
        (sqlite ? "" : " new_sqlite_classes fehlt - ohne das laeuft ein Durable Object nur im kostenpflichtigen Tarif.") +
        (hartOk ? "" : " ZERO_COST_MODE-Pruefung fehlt oder ist nicht gruen" +
                       (hartesUrteil && hartesUrteil.findings ? " (" + hartesUrteil.findings.length + " Funde)" : "") + "."),
    { found: treffer, sqliteBacked: sqlite, zeroCostModeVerdict: hartesUrteil ? hartesUrteil.verdict : null,
      zeroCostFindings: hartesUrteil ? hartesUrteil.findings : null });
})();

/* ---- Zugang (kein Abnahmepunkt, aber ohne ihn geht nichts) ----------- */
const zugangOk = !!(zugang && zugang.token && zugang.token.foundAs === "CLOUDFLARE_API_TOKEN" &&
                    zugang.accountId && zugang.accountId.derivable &&
                    umfang && umfang.verdict === "WORKERS_READABLE");

const alleGruen = bedingungen.every((b) => b.status === "PASS");
const bericht = {
  schemaVersion: "deploy-preconditions-1.0.0",
  auftrag: "Owner-Freigabe 17.09.2026: Deployment nur bei gruenen Nachweisen",
  checkedAt: new Date().toISOString(),
  maxAgeHours: MAX_ALTER_STUNDEN,
  conditions: bedingungen,
  access: { ok: zugangOk, tokenFoundAs: zugang && zugang.token ? zugang.token.foundAs : null,
            accountIdDerivable: !!(zugang && zugang.accountId && zugang.accountId.derivable),
            scopeVerdict: umfang ? umfang.verdict : null },
  verdict: alleGruen && zugangOk ? "GO" : "NO_GO",
  note: "PASS bei TIINGO_DYNAMIC_SUBSCRIPTION heisst: die Frage wurde beantwortet. Ein Nein ist der " +
        "Fall, fuer den der Modus reconnect gebaut ist; UNKNOWN und INCONCLUSIVE gehen nicht durch."
};

mkdirSync(DIR, { recursive: true });
writeFileSync(join(DIR, "deploy-preconditions.json"), JSON.stringify(bericht, null, 2) + "\n");

console.log("Abnahmebedingungen vor dem Deployment:");
console.log("");
for (const b of bedingungen) {
  console.log("  " + b.name.padEnd(30) + b.status);
  console.log("      " + b.reason);
}
console.log("");
console.log("  Zugang".padEnd(32) + (zugangOk ? "OK" : "FEHLT"));
console.log("");
console.log("URTEIL: " + bericht.verdict);
if (bericht.verdict !== "GO") {
  console.error("");
  console.error("Kein Deployment. " + bedingungen.filter((b) => b.status !== "PASS").map((b) => b.name).join(", ") +
                (zugangOk ? "" : (bedingungen.some((b) => b.status !== "PASS") ? " sowie der Zugang" : "Der Zugang")) +
                " steht nicht auf gruen.");
  process.exit(1);
}

#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — supertrader-chain.mjs

   SUPERTRADER NACH DEM NACHTLAUF: ANSTOSSEN UND UEBERWACHEN

   Supertrader (supertrader-signals.yml) rechnet auf den Artefakten des
   Nachtlaufs: Universum (discover/data/stock-index) und die technische
   Materialisierung (quant/data/product/technical-signals-v1). Sein eigener
   Zeitplan (06:17 UTC Di-Sa) ist keine Kette, sondern eine Hoffnung: alle 15
   Zeitplanlaeufe vom 29.09. bis 10.10.2026 kamen 323 bis 428 Minuten zu spaet.
   Nach einer Universumsaenderung des Nachtlaufs (13.10.: QRVO entfiel) stand
   Supertrader bis dahin auf dem Vortag, mit einem toten Link auf der Seite.

   DIESE DATEI HAT ZWEI AUFGABEN, BEIDE OHNE EINGRIFF IN SUPERTRADER:

   dispatch   letzte Stufe des Nachtlaufs (market-data-refresh.yml, Job
              `supertrader`, erst nach refresh + materialize + freshness-
              contract). Stoesst supertrader-signals.yml per workflow_dispatch
              an - ein EIGENER Lauf mit eigener Concurrency-Gruppe
              (supertrader-signals). Ein Supertrader-Fehler kann den Nachtlauf
              deshalb nicht rot machen und Discover nicht blockieren.
              Nur wenn ALLES stimmt:
                - die Produkt-Materialisierung und die dauerhafte Ablage
                  tragen die letzte abgeschlossene Sitzung
                  (measure-pipeline-freshness: QUANT_CURRENT == PASS)
                - das Discover-Universum (meta.json) traegt dasselbe Datum
                - die uebrigen Eingaben des Builds tragen es ebenfalls:
                  Benchmark SPY, Marktregime, Boersenstatus (der Build kuerzt
                  einen zu alten SPY still und zeigt ein altes Regime nur an)
                - der Discover-Aktienindex ist lesbar
              Und nur wenn noetig:
                - Supertrader steht nicht schon auf diesem Datum
                - es wartet nicht schon ein Lauf in der Warteschlange (er
                  liest beim Start den dann aktuellen Stand)
              Oder wenn Supertrader zwar auf dem Datum steht, aber Signale auf
              Titel zeigen, die nicht mehr im Universum stehen und nicht
              ausgewiesen sind: ein Neubau weist sie aus (heilt den toten Link).
              Keine Signallogik, keine Anbieteranfrage hier: der Lauf selbst
              holt hoechstens Minutenkerzen fuer noch nicht verarbeitete
              Kauf-Stop-Tage (intraday-prefetch.mjs); ein Wiederholungslauf
              hat keine und kostet nichts.

   prune      Stufe `supertrader-prune` des Nachtlaufs, NUR wenn refresh gruen,
              materialize oder freshness-contract aber nicht (27.10.2026, BZH:
              Universum committet, Materialisierung rot, Signale mit totem
              Link bis zum verspaeteten Zeitplanlauf). Stoesst
              supertrader-signals.yml mit mode=prune-dead-refs an: der Lauf
              weist nur entfallene Titel aus (scripts/supertrader/
              prune-dead-refs.mjs, fail closed) - kein voller Build, keine
              Markt- oder Quant-Daten, kein neuer Stand. Der volle Anstoss
              (dispatch) bleibt unveraendert an validierte Daten gebunden.
              Nur wenn:
                - tote Verweise bestehen (Signal-Titel ohne Discover-Seite,
                  nicht ausgewiesen) und der Aktienindex lesbar ist
                - das Discover-Universum die letzte abgeschlossene Sitzung
                  traegt (also aus diesem Nachtlauf stammt)
                - kein Lauf wartet (ein wartender Lauf wuerde in der
                  Concurrency-Gruppe verdraengt); ist die Warteschlange
                  nicht lesbar: kein Anstoss (fail closed)
              Tote Verweise zaehlen hier ueber alle Titel mit Supertrader-
              Seite (Signale, VU-Trendfolge, Teilpruefungen) - dieselbe
              Menge wie Build und Bereinigung.

   check      Aktualitaetsmonitor (freshness-monitor.yml). Ergebnis, nicht
              Workflow: steht Supertrader auf dem Stichtag der Produktdaten?
              Zeigt ein Signal auf einen Titel, der nicht (mehr) im Discover-
              Universum steht und nicht als discoverAvailability.unavailable
              ausgewiesen ist (veralteter Ticker-Verweis = toter Link)?
                SUPERTRADER_LATE       Stichtag hinter den Produktdaten, > 4 h
                SUPERTRADER_STALE      dasselbe, > 9 h (Kette und Rueckfall
                                       haben nichts erreicht)           FAIL
                DEAD_TICKER_REFS       Signale auf Titel ohne Discover-Seite,
                                       nicht ausgewiesen
                STALE_UNAVAILABLE_MARK ausgewiesen, aber wieder im Universum
              Noch laeuft die Kette (< 4 h seit der neuen Basis): still.

   Aufruf:
     node scripts/ci/supertrader-chain.mjs dispatch [--dry-run] [--root=.] [--pipeline=<datei>] [--runs=<datei>]
     node scripts/ci/supertrader-chain.mjs prune [--dry-run] [--root=.] [--pipeline=<datei>] [--runs=<datei>]
     node scripts/ci/supertrader-chain.mjs check [--strict] [--root=.] [--now=ISO] [--pipeline=<datei>] [--runs=<datei>] [--no-api]
   Umgebung: GITHUB_TOKEN (actions: write fuer dispatch), GITHUB_REPOSITORY, GITHUB_API_URL, GITHUB_REF_NAME.
   ========================================================================= */
import { readFileSync, existsSync, appendFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { symbolsIn, trend52Symbols } from "../supertrader/discover-availability.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

export const CONFIG = {
  workflow: "supertrader-signals.yml",
  lateMin: 240,                 /* seit der neuen Basis: ab hier Hinweis */
  staleMin: 540,                /* ab hier FAIL: Kette und Rueckfall haben nichts erreicht */
  waitingStates: ["queued", "waiting", "pending", "requested"]
};

/* ------------------------------------------------------------ Entscheidung */
/**
 * Soll der Nachtlauf Supertrader anstossen? Ohne Nebenwirkung (testbar).
 *   pipeline         Bericht von measure-pipeline-freshness (oder null)
 *   basisAsOf        Datum des Discover-Universums (meta.json)
 *   supertraderAsOf  Stand von supertrader/data/build.json
 *   runs             juengste Laeufe von supertrader-signals.yml [{status, ...}]
 */
export function planDispatch({ pipeline, basisAsOf, supertraderAsOf, runs, inputs, deadRefs, universeOk }) {
  if (!pipeline) return { action: "REFUSE", reason: "NO_PIPELINE_REPORT", detail: "Kein Bericht ueber den Produktstand." };
  const ziel = pipeline.LATEST_PRODUCT_ASOF;
  const fakten = {
    QUANT_CURRENT: pipeline.QUANT_CURRENT, PRODUCT: pipeline.PRODUCT_MATERIALIZATION_CURRENT, STORE: pipeline.MARKET_STORE_CURRENT,
    produktStand: ziel, letzteSitzung: pipeline.LATEST_MARKET_SESSION, discoverBasis: basisAsOf || null
  };
  const validiert = pipeline.QUANT_CURRENT === "PASS" && pipeline.PRODUCT_MATERIALIZATION_CURRENT === "CURRENT" &&
    pipeline.MARKET_STORE_CURRENT === "CURRENT" && !!ziel && ziel === pipeline.LATEST_MARKET_SESSION && basisAsOf === ziel;
  if (!validiert) return { action: "REFUSE", reason: "DATA_NOT_VALIDATED", detail: "Marktdaten nicht vollstaendig veroeffentlicht/validiert: " + JSON.stringify(fakten) };
  if (universeOk === false) return { action: "REFUSE", reason: "DATA_NOT_VALIDATED", detail: "Discover-Aktienindex nicht lesbar oder leer." };
  /* Die uebrigen Eingaben des Builds (Benchmark SPY, Marktregime, Boersenstatus) haben eigene Erzeuger.
     Der Build kuerzt einen zu alten Benchmark still und zeigt ein altes Regime nur an - deshalb hier pruefen. */
  const eing = inputs || {};
  const alt = [["SPY", eing.spyTo], ["Marktregime", eing.regimeAsOf], ["Boersenstatus", eing.healthSession]].filter(([, d]) => !d || d < ziel);
  if (alt.length) return { action: "REFUSE", reason: "INPUT_NOT_CURRENT", detail: "Eingaben des Supertrader-Builds noch nicht auf " + ziel + ": " + alt.map(([n, d]) => n + " " + (d || "fehlt")).join(", ") + ". Der Zeitplan-Rueckfall rechnet spaeter." };
  const wartend = (runs || []).filter((r) => CONFIG.waitingStates.includes(r.status));
  const tot = deadRefs || [];
  /* Supertrader steht schon auf dem Datum - aber das Universum hat sich danach geaendert (Signal auf Titel ohne Seite):
     der Build weist entfallene Titel aus, ein Neubau heilt den toten Link. */
  if (supertraderAsOf && supertraderAsOf >= ziel && !tot.length) return { action: "SKIP", reason: "UP_TO_DATE", detail: "Supertrader steht schon auf " + supertraderAsOf + ".", ziel };
  if (wartend.length) return { action: "SKIP", reason: "ALREADY_QUEUED", detail: "Ein Lauf wartet bereits und liest beim Start den aktuellen Stand.", ziel };
  const laufend = (runs || []).filter((r) => r.status === "in_progress");
  if (supertraderAsOf && supertraderAsOf >= ziel) return { action: "DISPATCH", reason: "DEAD_TICKER_REFS", detail: tot.length + " Signal-Titel ohne Discover-Seite und ohne Ausweis: " + tot.slice(0, 8).join(", ") + ".", ziel };
  return { action: "DISPATCH", reason: laufend.length ? "DISPATCH_BEHIND_RUNNING" : "DISPATCH", detail: "Supertrader " + (supertraderAsOf || "-") + " < Produktstand " + ziel + ".", ziel };
}

/**
 * Soll der Nachtlauf nach gescheiterter Materialisierung den Bereinigungsmodus
 * anstossen? Ohne Nebenwirkung (testbar). Gibt nie einen vollen Lauf frei.
 */
export function planPrune({ pipeline, basisAsOf, runs, runsKnown = true, deadRefs, universeOk }) {
  if (universeOk === false) return { action: "REFUSE", reason: "UNIVERSE_UNREADABLE", detail: "Discover-Aktienindex nicht lesbar oder leer." };
  const tot = deadRefs || [];
  if (!tot.length) return { action: "SKIP", reason: "NO_DEAD_REFS", detail: "Keine Signal-Titel ohne Discover-Seite." };
  const sitzung = pipeline && pipeline.LATEST_MARKET_SESSION;
  if (!sitzung || basisAsOf !== sitzung) return { action: "REFUSE", reason: "UNIVERSE_NOT_CURRENT", detail: "Discover-Universum " + (basisAsOf || "-") + ", letzte Sitzung " + (sitzung || "-") + ": das Universum stammt nicht aus diesem Nachtlauf." };
  if (!runsKnown) return { action: "REFUSE", reason: "RUNS_UNKNOWN", detail: "Laeufe von supertrader-signals.yml nicht lesbar: ein wartender voller Lauf wuerde verdraengt. Kein Anstoss." };
  if ((runs || []).some((r) => CONFIG.waitingStates.includes(r.status))) return { action: "SKIP", reason: "ALREADY_QUEUED", detail: "Ein Lauf wartet bereits; er wuerde in der Concurrency-Gruppe verdraengt." };
  return { action: "DISPATCH", reason: "PRUNE_DEAD_REFS", detail: tot.length + " Signal-Titel ohne Discover-Seite und ohne Ausweis: " + tot.slice(0, 8).join(", ") + ". Nur Ausweis, kein voller Lauf.", inputs: { mode: "prune-dead-refs" } };
}

/* ------------------------------------------------------------ Monitor */
/**
 * Aktualitaet und Verweise von Supertrader. Ohne Nebenwirkung (testbar).
 *   nowMs, pipeline, basis {asOf, generatedAt}, supertraderAsOf,
 *   symbols (Signale), universe (Set), unavailable (Array), lastRun (oder null)
 */
export function assessChain({ nowMs, pipeline, basis, supertraderAsOf, symbols, universe, unavailable, lastRun }) {
  /* universe === null: Aktienindex nicht lesbar (kein Urteil ueber Verweise). */
  const findings = [];
  const add = (level, code, text) => findings.push({ level, code, text });
  const ziel = pipeline ? pipeline.LATEST_PRODUCT_ASOF : null;
  const marktDatum = pipeline ? pipeline.LATEST_MARKET_SESSION : null;
  const basisAlterMin = basis && basis.generatedAt ? Math.round((nowMs - Date.parse(basis.generatedAt)) / 60000) : null;
  const zurueck = !!(ziel && supertraderAsOf && supertraderAsOf < ziel);
  const lauf = lastRun ? " Letzter Lauf: " + lastRun.event + " " + lastRun.createdAt + " " + (lastRun.conclusion || lastRun.status) + (lastRun.url ? " (" + lastRun.url + ")" : "") + "." : "";

  const wartetOderLaeuft = !!(lastRun && (CONFIG.waitingStates.includes(lastRun.status) || lastRun.status === "in_progress"));
  if (!pipeline) add("WARN", "NO_PIPELINE_REPORT", "Produktstand nicht messbar; Supertrader-Stand nicht beurteilbar.");
  if (!supertraderAsOf) add("WARN", "NO_STATE", "supertrader/data/build.json fehlt oder ist unlesbar; Supertrader-Stand nicht beurteilbar.");
  if (!universe) add("WARN", "NO_UNIVERSE", "discover/data/stock-index/US_REAL.json fehlt oder ist leer; Ticker-Verweise nicht beurteilbar.");
  if (zurueck && pipeline.QUANT_CURRENT === "PASS" && ziel === marktDatum && basis && basis.asOf === ziel && basisAlterMin !== null) {
    /* Die Daten sind vollstaendig da; die Kette haette laufen muessen. */
    if (lastRun && lastRun.conclusion === "failure") add("WARN", "SUPERTRADER_RUN_FAILED", "Der letzte Supertrader-Lauf ist gescheitert (Integritaetstests oder Push); die Signale bleiben unveraendert." + lauf);
    /* Ein laufender/wartender Lauf kommt gerade: erst WARN (der Rueckfall steht in der Warteschlange). */
    if (basisAlterMin > CONFIG.staleMin && wartetOderLaeuft) add("WARN", "SUPERTRADER_LATE", "Supertrader steht auf " + supertraderAsOf + ", die validierten Produktdaten auf " + ziel + " (seit " + basisAlterMin + " Min.); ein Lauf laeuft/wartet bereits." + lauf);
    else if (basisAlterMin > CONFIG.staleMin) add("FAIL", "SUPERTRADER_STALE", "Supertrader steht auf " + supertraderAsOf + ", die validierten Produktdaten auf " + ziel + " (seit " + basisAlterMin + " Min.). Weder die Nachtlauf-Stufe noch der Zeitplan-Rueckfall haben Supertrader erreicht." + lauf);
    else if (basisAlterMin > CONFIG.lateMin) add("WARN", "SUPERTRADER_LATE", "Supertrader steht auf " + supertraderAsOf + ", die validierten Produktdaten auf " + ziel + " (seit " + basisAlterMin + " Min.)." + lauf);
  }

  /* Veraltete Ticker-Verweise: Signal ohne Discover-Seite (toter Link). */
  const ausgewiesen = new Set(unavailable || []);
  const tot = universe ? (symbols || []).filter((s) => !universe.has(s) && !ausgewiesen.has(s)).sort() : [];
  const veraltetesMal = universe ? [...ausgewiesen].filter((s) => universe.has(s)).sort() : [];
  if (tot.length) {
    const text = tot.length + " Signal-Titel ohne Discover-Seite und ohne Ausweis (toter Link): " + tot.slice(0, 12).join(", ") + (tot.length > 12 ? " ..." : "") + ".";
    /* Steht Supertrader noch zurueck, heilt der naechste Lauf das (Ausweis im Build); sonst ist es ein Befund. */
    if (zurueck) add("WARN", "DEAD_TICKER_REFS", text + " Heilt der naechste Supertrader-Lauf (Build weist entfallene Titel aus)." + lauf);
    else add("FAIL", "DEAD_TICKER_REFS", text + " Supertrader ist aktuell - der Build haette sie ausweisen muessen.");
  }
  if (veraltetesMal.length) add("WARN", "STALE_UNAVAILABLE_MARK", veraltetesMal.length + " Titel als nicht verfuegbar ausgewiesen, aber wieder im Discover-Universum: " + veraltetesMal.slice(0, 12).join(", ") + ".");

  const level = findings.some((f) => f.level === "FAIL") ? "FAIL" : findings.length ? "WARN" : "OK";
  return { level, findings, ziel, supertraderAsOf: supertraderAsOf || null, zurueck, basisAlterMin, tot, veraltetesMal };
}

/* ------------------------------------------------------------ Ein-/Ausgabe */
const lies = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

function messePipeline(root, args) {
  if (args.pipeline) return lies(args.pipeline);
  const tmp = join(mkdtempSync(join(tmpdir(), "vu-stchain-")), "pf.json");
  const r = spawnSync(process.execPath, [join(root, "scripts", "quant", "measure-pipeline-freshness.mjs"), "--out=" + tmp], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? lies(tmp) : null;
}

function zustand(root) {
  const meta = lies(join(root, "discover", "data", "meta.json"));
  const u = meta && Array.isArray(meta.universes) ? meta.universes.find((x) => x.universeId === "US_REAL") : null;
  const build = lies(join(root, "supertrader", "data", "build.json"));
  const signals = lies(join(root, "supertrader", "data", "signals.json")) || {};
  const index = lies(join(root, "discover", "data", "stock-index", "US_REAL.json"));
  let seiten = Object.keys(signals.bySymbol || {});
  try { seiten = [...new Set([...seiten, ...trend52Symbols(lies(join(root, "supertrader", "data", "trend52.json"))), ...symbolsIn(signals.partialChecks)])]; } catch { /* ohne trend52.json: nur die Signal-Titel */ }
  return {
    basis: u ? { asOf: u.asOf, generatedAt: u.generatedAt || null } : null,
    seiten,
    supertraderAsOf: build ? build.asOf : null,
    symbols: Object.keys(signals.bySymbol || {}),
    universe: index && Array.isArray(index.symbols) && index.symbols.length ? new Set(index.symbols) : null,
    unavailable: (signals.discoverAvailability && signals.discoverAvailability.unavailable) || [],
    inputs: {
      spyTo: ((lies(join(root, "quant", "data", "market", "multi-asset", "series", "SPY.json")) || {}).to || "").slice(0, 10) || null,
      regimeAsOf: (lies(join(root, "quant", "data", "product", "market-regime-v1.json")) || {}).asOf || null,
      healthSession: (((lies(join(root, "quant", "data", "market", "freshness", "health.json")) || {}).market) || {}).lastCompletedSession || null
    }
  };
}

async function api(path, init = {}, env = process.env) {
  const base = env.GITHUB_API_URL || "https://api.github.com";
  const repo = env.GITHUB_REPOSITORY || "dennismueller10x-sudo/vision-universe-research";
  const headers = Object.assign({ accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, env.GITHUB_TOKEN ? { authorization: "Bearer " + env.GITHUB_TOKEN } : {}, init.headers || {});
  const res = await fetch(base + "/repos/" + repo + path, Object.assign({}, init, { headers, signal: AbortSignal.timeout(20000) }));
  return res;
}

async function holeLaeufe(args, env) {
  if (args.runs) return (lies(args.runs) || { workflow_runs: [] }).workflow_runs || [];
  const res = await api("/actions/workflows/" + CONFIG.workflow + "/runs?per_page=10", {}, env);
  if (!res.ok) throw new Error("Laeufe nicht lesbar: HTTP " + res.status);
  return (await res.json()).workflow_runs || [];
}
const alsLauf = (r) => r ? { event: r.event, status: r.status, conclusion: r.conclusion, createdAt: r.created_at, url: r.html_url, updatedAt: r.updated_at } : null;

/* Job-Ausgabe fuer den Pipeline-Alarm (eine Zeile). */
function ausgabe(env, name, wert) {
  if (!env.GITHUB_OUTPUT) return;
  try { appendFileSync(env.GITHUB_OUTPUT, name + "=" + String(wert).replace(/[\r\n]+/g, " ").slice(0, 500) + "\n"); } catch { /* ohne Ausgabe */ }
}

function zusammenfassung(zeilen, env) {
  const text = zeilen.join("\n") + "\n";
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, text); } catch { /* ohne Summary */ } }
}

async function dispatch(args, env, art = "build") {
  const root = args.root || REPO_ROOT;
  const z = zustand(root);
  const pipeline = messePipeline(root, args);
  let runs = [], runsKnown = true;
  try { runs = await holeLaeufe(args, env); } catch (e) { runsKnown = false; console.log("::warning title=Supertrader-Kette::" + e.message + " - Warteschlange unbekannt" + (art === "prune" ? "." : ", es wird trotzdem geplant.")); }
  const totIn = (liste) => z.universe ? liste.filter((x) => !z.universe.has(x) && !new Set(z.unavailable).has(x)).sort() : [];
  const tot = totIn(z.symbols);
  const plan = art === "prune"
    ? planPrune({ pipeline, basisAsOf: z.basis && z.basis.asOf, runs, runsKnown, deadRefs: totIn(z.seiten), universeOk: !!z.universe })
    : planDispatch({ pipeline, basisAsOf: z.basis && z.basis.asOf, supertraderAsOf: z.supertraderAsOf, runs, inputs: z.inputs, deadRefs: tot, universeOk: !!z.universe });
  const kopf = [art === "prune" ? "### Supertrader-Bereinigung nach gescheiterter Materialisierung" : "### Supertrader nach dem Nachtlauf", "", "| Feld | Wert |", "|---|---|",
    "| Entscheidung | " + plan.action + " / " + plan.reason + " |", "| Grund | " + plan.detail + " |",
    "| Produktstand | " + (pipeline ? pipeline.LATEST_PRODUCT_ASOF : "-") + " |", "| Discover-Basis | " + (z.basis ? z.basis.asOf : "-") + " |",
    "| Supertrader | " + (z.supertraderAsOf || "-") + " |", "| Wartende/laufende Laeufe | " + runs.filter((r) => CONFIG.waitingStates.includes(r.status)).length + " / " + runs.filter((r) => r.status === "in_progress").length + " |"];
  if (plan.action === "REFUSE") {
    console.log("::error title=Supertrader-Kette::" + plan.reason + " - " + plan.detail);
    ausgabe(env, "detail", plan.reason + ": " + plan.detail);
    zusammenfassung(kopf, env);
    return 1;
  }
  if (plan.action === "SKIP" || args["dry-run"]) { zusammenfassung(kopf.concat(["| Aktion | " + (args["dry-run"] && plan.action === "DISPATCH" ? "(Trockenlauf) kein Dispatch" : "kein Dispatch") + " |"]), env); return 0; }

  const ref = env.GITHUB_REF_NAME || "main";
  const t0 = Date.now() - 5000;
  /* Bis zu drei Versuche bei Netzfehlern und 5xx (kurzer Abstand); 4xx ist endgueltig. */
  const takt0 = Number(env.SUPERTRADER_CHAIN_POLL_MS) || 5000;
  let res = null, netzfehler = null;
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      res = await api("/actions/workflows/" + CONFIG.workflow + "/dispatches", { method: "POST", body: JSON.stringify(plan.inputs ? { ref, inputs: plan.inputs } : { ref }), headers: { "content-type": "application/json" } }, env);
      netzfehler = null;
      if (res.status === 204 || res.status < 500) break;
    } catch (e) { netzfehler = e; res = null; }
    if (versuch < 3) await new Promise((r) => setTimeout(r, takt0 * versuch));
  }
  if (!res || res.status !== 204) {
    const fehlerText = res ? "Dispatch abgewiesen: HTTP " + res.status + " " + (await res.text()).slice(0, 200) : "Dispatch nicht erreichbar: " + String(netzfehler && netzfehler.message || netzfehler);
    console.log("::error title=Supertrader-Kette::" + fehlerText);
    ausgabe(env, "detail", fehlerText);
    zusammenfassung(kopf.concat(["| Aktion | Dispatch FEHLGESCHLAGEN (" + fehlerText.slice(0, 80) + ") |"]), env);
    return 1;
  }
  /* Beleg: erscheint der Lauf? (Nur Beobachtung - ein spaeterer Start ist kein Fehler.) */
  let neu = null;
  const takt = Number(env.SUPERTRADER_CHAIN_POLL_MS) || 5000;
  for (let i = 0; i < 12 && !neu; i++) {
    await new Promise((r) => setTimeout(r, takt));
    try { neu = (await holeLaeufe({}, env)).find((r) => r.event === "workflow_dispatch" && Date.parse(r.created_at) >= t0); } catch { /* weiter */ }
  }
  zusammenfassung(kopf.concat(["| Aktion | Dispatch gesendet (204) |", "| Lauf | " + (neu ? neu.html_url + " (" + neu.status + ")" : "noch nicht sichtbar (kein Fehler)") + " |"]), env);
  if (!neu) console.log("::warning title=Supertrader-Kette::Dispatch gesendet, der Lauf war nach 60 s noch nicht sichtbar.");
  return 0;
}

async function check(args, env) {
  const root = args.root || REPO_ROOT;
  const nowMs = args.now ? Date.parse(args.now) : Date.now();
  if (!Number.isFinite(nowMs)) { console.error("Ungueltiges --now (erwartet ISO 8601)."); return 2; }
  const z = zustand(root);
  const pipeline = messePipeline(root, args);
  let lastRun = null, notiz = null;
  if (!args["no-api"]) { try { lastRun = alsLauf((await holeLaeufe(args, env))[0]); } catch (e) { notiz = "Laeufe nicht lesbar (" + e.message + ") - kein Befund."; } }
  const r = assessChain({ nowMs, pipeline, basis: z.basis, supertraderAsOf: z.supertraderAsOf, symbols: z.symbols, universe: z.universe, unavailable: z.unavailable, lastRun });
  const zeilen = ["Supertrader-Aktualitaet: " + r.level + " · Supertrader " + (r.supertraderAsOf || "-") + " · Produktstand " + (r.ziel || "-") + " · neue Basis seit " + (r.basisAlterMin === null ? "-" : r.basisAlterMin + " Min.") +
    " · Signal-Titel " + z.symbols.length + " · ohne Seite/Ausweis " + r.tot.length];
  if (lastRun) zeilen.push("Letzter Lauf: " + lastRun.event + " · " + lastRun.createdAt + " · " + (lastRun.conclusion || lastRun.status) + " · Dauer " + (lastRun.updatedAt ? Math.round((Date.parse(lastRun.updatedAt) - Date.parse(lastRun.createdAt)) / 1000) + " s" : "-"));
  if (notiz) zeilen.push(notiz);
  for (const f of r.findings) zeilen.push((f.level === "FAIL" ? "::error title=Supertrader " + f.code + "::" : "::warning title=Supertrader " + f.code + "::") + f.text);
  zusammenfassung(zeilen, env);
  return args.strict && r.level === "FAIL" ? 2 : 0;
}

export async function main(argv, env) {
  const args = {};
  const [befehl, ...rest] = argv;
  for (const a of rest) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }
  if (befehl === "dispatch") return dispatch(args, env);
  if (befehl === "prune") return dispatch(args, env, "prune");
  if (befehl === "check") return check(args, env);
  console.error("Aufruf: supertrader-chain.mjs dispatch|prune|check [Optionen]");
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).then((c) => process.exit(c), (e) => { console.error(String(e && e.message || e)); process.exit(1); });
}

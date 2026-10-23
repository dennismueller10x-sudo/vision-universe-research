/* =========================================================================
   VISION UNIVERSE — long-series-repair-plan.mjs

   WELCHE WOCHENREIHEN STEHEN NACH EINEM SPLIT AUF DEM FALSCHEN NIVEAU?

   Die Tagesreihe (discover-series, jede Nacht) traegt einen Split am
   naechsten Morgen nach; die Wochenreihe (discover-series-long) nur beim
   naechsten Lauf von long-series.yml. Dazwischen zeigen 5J und Max einen
   Sprung um den Splitfaktor an der Nahtstelle (series-sampling.js
   mergeWeeklyWithDaily), und der Supertrader-Wochenchart ein anderes
   Kursniveau als jede andere Ansicht. Gemessen am 22./23.10.2026: AMTD,
   CAPS, DKI, EHGO, FRGT, GP, MBRX, OBAI, REVB (Faktor 5 bis 60).

   Dieses Skript ist die Frage, nicht die Antwort: es liest NUR committete
   Reihen, vergleicht sie mit DQ-PX-4 (core/data-quality.js#compareDailyWeekly,
   identische Stichtage, Toleranz = Rundungseinheit) und nennt die Titel,
   deren Wochenreihe neu gebaut werden muss. Kein Anbieter, keine Ablage,
   kein Schreiben ins Repository.

     node scripts/market/long-series-repair-plan.mjs                  Bericht
     node scripts/market/long-series-repair-plan.mjs --only=AMTD,GP   nur diese Titel
     node scripts/market/long-series-repair-plan.mjs --strict         Exit 2 bei Befund
     node scripts/market/long-series-repair-plan.mjs --out=PFAD       Plan als JSON
     node scripts/market/long-series-repair-plan.mjs --github-output  tickers/count/overflow nach $GITHUB_OUTPUT

   Neu gebaut wird nur, was der Plan nennt. Nennt er mehr als --max Titel
   (Standard 40), ist das kein Split-Nachzug, sondern ein Systemfehler
   (Ablage veraltet, Basis gewechselt): dann baut der Reparaturlauf NICHTS
   und schlaegt Alarm, statt tausende Reihen umzuschreiben.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ausgabePfad } from "../quality/out-path.mjs";

const require = createRequire(import.meta.url);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DQ = require(join(REPO_ROOT, "core", "data-quality.js"));

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const hit = argv.find((a) => a.startsWith(name + "=")); return hit ? hit.slice(name.length + 1) : fallback; };
const flag = (name) => argv.includes(name);

const TICKER = /^[A-Z0-9.-]{1,12}$/;
const SERIES = join("quant", "data", "market", "discover-series");
const LONG = join("quant", "data", "market", "discover-series-long");

/** Reiner Plan ueber zwei Ordner. Exportiert fuer die Tests. */
export function buildPlan({ root, only = null, max = 40 }) {
  const dailyDir = join(root, SERIES), longDir = join(root, LONG);
  const files = existsSync(longDir) ? readdirSync(longDir).filter((n) => /^ref_.*\.json$/.test(n)).sort() : [];
  const affected = [], noOverlap = [];
  let checked = 0;
  for (const name of files) {
    const dailyPath = join(dailyDir, name);
    if (!existsSync(dailyPath)) continue;
    let weekly, daily;
    try { weekly = JSON.parse(readFileSync(join(longDir, name), "utf8")); daily = JSON.parse(readFileSync(dailyPath, "utf8")); }
    catch (e) { continue; }
    const ticker = String(weekly.ticker || daily.ticker || "");
    if (!TICKER.test(ticker) || weekly.securityId !== daily.securityId) continue;
    if (only && !only.has(ticker)) continue;
    checked++;
    const c = DQ.compareDailyWeekly(daily, weekly);
    if (c.status === "NO_OVERLAP") { noOverlap.push({ ticker, securityId: weekly.securityId, weeklyTo: weekly.to, dailyFrom: daily.from }); continue; }
    if (c.status !== "MISMATCH") continue;
    affected.push({ ticker, securityId: weekly.securityId, kind: c.kind, ratio: c.ratio, factor: c.factor,
      compared: c.compared, mismatched: c.mismatched, worst: c.worst, weeklyTo: weekly.to, dailyTo: daily.to });
  }
  const overflow = affected.length > max;
  return {
    schemaVersion: "long-series-repair-plan-1.0.0",
    rule: "DQ-PX-4",
    checked, max, overflow,
    affected,
    tickers: overflow ? [] : affected.map((a) => a.ticker),
    /* Nicht vergleichbar: die Wochenreihe endet vor dem Anfang der Tagesreihe. Ein Neubau
       heilt das nur, wenn die Ablage die Luecke fuellt - deshalb Bericht, kein Auftrag. */
    noOverlap
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = arg("--root", REPO_ROOT);
  const onlyArg = arg("--only", "");
  const only = onlyArg ? new Set(onlyArg.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)) : null;
  if (only && [...only].some((t) => !TICKER.test(t))) { console.error("Ungueltige Kuerzel-Liste."); process.exit(1); }
  const max = parseInt(arg("--max", "40"), 10);
  const plan = buildPlan({ root, only, max });

  console.log(`Wochenreihen gegen Tagesreihen (DQ-PX-4): ${plan.checked} geprueft, ${plan.affected.length} abweichend, ${plan.noOverlap.length} ohne Ueberlappung`);
  for (const a of plan.affected) {
    console.log(`  ${a.ticker.padEnd(8)} ${a.kind.padEnd(5)} x${a.ratio}${a.factor ? " (Faktor ~" + a.factor + ")" : ""}  ${a.mismatched}/${a.compared} Wochen · ` +
      `${a.worst.date}: Tag ${a.worst.daily} / Woche ${a.worst.weekly} · Woche bis ${a.weeklyTo}, Tag bis ${a.dailyTo}`);
  }
  if (plan.overflow) console.error(`::error::${plan.affected.length} Titel > --max=${max}: kein Split-Nachzug, sondern ein Systemfehler. Kein automatischer Neubau.`);

  const out = ausgabePfad(root, arg("--out", null));
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), ...plan }, null, 1) + "\n"); }
  if (flag("--github-output") && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tickers=${plan.tickers.join(",")}\ncount=${plan.affected.length}\noverflow=${plan.overflow}\n`);
  }
  if (flag("--strict") && plan.affected.length) process.exit(2);
}

/* =========================================================================
   VISION UNIVERSE — Taeglicher Lauf der Watchlist-Berichte.

     node scripts/accounts/run-watchlist-reports.mjs [--date=YYYY-MM-DD] [--dry-run]

   1. Quelldateien aus dem Repository lesen (siehe symbol-digest.mjs).
   2. Letzten Stand je Aktie aus symbol_snapshots holen, Digests bauen,
      symbol_digests und symbol_snapshots schreiben.
   3. Fuer jeden User mit faelligem Bericht und aktivem Abo: Tickers seiner
      Watchlists sammeln, Bericht in user_reports ablegen, optional per
      E-Mail (Resend) zustellen.

   --dry-run braucht keine Zugangsdaten: er liest nur die Dateien und meldet,
   wie viele Digests entstuenden. So prueft die CI die Quellen ohne Secrets.

   Umgebung: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
   VU_ACCOUNTS_ENABLED=true; fuer E-Mail zusaetzlich RESEND_API_KEY und
   VU_REPORT_EMAIL_FROM (z. B. "Vision Universe <berichte@visionuniverse.de>").
   ========================================================================= */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  buildDigests, snapshotState, composeReport, reportDue, reportWindowStart, renderReportEmail
} from "./symbol-digest.mjs";

const require = createRequire(import.meta.url);
const { accountsConfig } = require("../../server/accounts/config.js");
const { createSupabase } = require("../../server/accounts/supabase.js");
const { hasAccess } = require("../../server/accounts/access.js");

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const BATCH = 500;

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); } catch { return fallback; }
}

export async function loadSources(root = ROOT) {
  const fundDir = resolve(root, "hedgefonds/data/funds");
  const funds = [];
  for (const name of (await readdir(fundDir).catch(() => [])).filter((n) => n.endsWith(".json")).sort()) {
    try { funds.push(JSON.parse(await readFile(resolve(fundDir, name), "utf8"))); } catch { /* defekte Datei: auslassen */ }
  }
  return {
    news: await readJson("dashboard/data/news_feed.json"),
    scores: await readJson("dashboard/data/fundamental_scores.json"),
    ratings: await readJson("dashboard/data/analyst_ratings.json"),
    signals: await readJson("supertrader/data/signals.json"),
    funds
  };
}

function chunks(rows, size = BATCH) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function sendEmail({ apiKey, from, to, subject, html, text, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text })
  });
  if (!res.ok) throw new Error("EMAIL_FAILED:" + res.status);
}

export async function run({ date, dryRun = false, env = process.env, log = console.log } = {}) {
  const asOf = date || new Date().toISOString().slice(0, 10);
  const sources = await loadSources();

  if (dryRun) {
    const digests = buildDigests({ asOf, ...sources, previous: snapshotState(sources) });
    const first = buildDigests({ asOf, ...sources, previous: null });
    const state = snapshotState(sources);
    log(JSON.stringify({ mode: "DRY_RUN", asOf, snapshotTickers: Object.keys(state).length,
      digestsWithoutChanges: digests.length, digestsOnFirstRun: first.length,
      events: first.reduce((n, d) => n + d.items.length, 0) }));
    return { digests: first, state };
  }

  const config = accountsConfig(env);
  if (!config.supabaseReady) { log("NOT_CONFIGURED: VU_ACCOUNTS_ENABLED/SUPABASE_* fehlen - nichts zu tun."); return null; }
  const db = createSupabase({ url: config.supabaseUrl, anonKey: config.anonKey, serviceKey: config.serviceKey });

  // 1+2: Digests je Aktie
  const snapshots = await db.selectAll("symbol_snapshots", { select: "ticker,state,as_of", order: "ticker" });
  const previous = Object.fromEntries(snapshots.map((s) => [s.ticker, s.state]));
  const since = snapshots.reduce((max, s) => (s.as_of > max ? s.as_of : max), "") || null;
  let digests = [];
  if (since && since >= asOf) {
    // Wiederholungslauf: Die Staende sind schon von heute. Neu rechnen wuerde
    // gegen den heutigen Stand vergleichen und die Digests von heute leeren.
    log(`Digests fuer ${asOf} existieren bereits - nur Berichte.`);
  } else {
    digests = buildDigests({ asOf, since, ...sources, previous });
    for (const part of chunks(digests)) await db.upsert("symbol_digests", part, { onConflict: "ticker,digest_date" });
    const state = Object.entries(snapshotState(sources)).map(([ticker, s]) => ({ ticker, state: s, as_of: asOf }));
    for (const part of chunks(state)) await db.upsert("symbol_snapshots", part, { onConflict: "ticker" });
    log(`Digests: ${digests.length} Aktien mit Ereignissen, ${state.length} Staende gespeichert.`);
  }

  // 3: Berichte je User
  const profiles = (await db.selectAll("profiles", { select: "id,display_name,report_frequency,report_email", report_frequency: "neq.off", order: "id" }))
    .filter((p) => reportDue(p.report_frequency, asOf));
  if (!profiles.length) { log("Heute ist kein Bericht faellig."); return { digests: digests.length, reports: 0 }; }
  const entitlements = await db.selectAll("entitlements", { select: "user_id,entitlement,status,expires_at,grace_expires_at", entitlement: "eq.premium", order: "user_id" });
  const premium = new Set(entitlements.filter((e) => hasAccess(e)).map((e) => e.user_id));
  const items = await db.selectAll("watchlist_items", { select: "user_id,ticker", order: "user_id,ticker" });
  const tickersByUser = new Map();
  for (const i of items) (tickersByUser.get(i.user_id) || tickersByUser.set(i.user_id, new Set()).get(i.user_id)).add(i.ticker);

  const email = env.RESEND_API_KEY && env.VU_REPORT_EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.VU_REPORT_EMAIL_FROM } : null;
  const windowCache = new Map();
  let written = 0, mailed = 0, failed = 0;
  for (const profile of profiles) {
    const tickers = [...(tickersByUser.get(profile.id) || [])];
    if (!premium.has(profile.id) || !tickers.length) continue;
    const from = reportWindowStart(profile.report_frequency, asOf);
    if (!windowCache.has(from)) {
      windowCache.set(from, await db.selectAll("symbol_digests", { select: "ticker,digest_date,items", digest_date: "gte." + from, order: "ticker,digest_date" }));
    }
    const report = composeReport({ tickers, digests: windowCache.get(from), reportDate: asOf, frequency: profile.report_frequency });
    const [row] = await db.upsert("user_reports", [{ user_id: profile.id, report_date: asOf, frequency: report.frequency,
      tickers: report.tickers, items: report.items }], { onConflict: "user_id,report_date", ignoreDuplicates: true });
    if (!row) continue; // heute schon erstellt (Wiederholungslauf)
    written++;
    if (!email || !profile.report_email || report.empty) continue;
    try {
      const user = await db.getUserById(profile.id);
      if (!user || !user.email || !user.email_confirmed_at) continue;
      await sendEmail({ ...email, to: user.email, ...renderReportEmail(report, { displayName: profile.display_name }) });
      await db.update("user_reports", { id: "eq." + row.id }, { emailed_at: new Date().toISOString() });
      mailed++;
    } catch { failed++; }
  }
  log(`Berichte: ${written} erstellt, ${mailed} per E-Mail, ${failed} E-Mail-Fehler.`);
  if (failed && failed === written) throw new Error("ALL_EMAILS_FAILED");
  return { digests: digests.length, reports: written, mailed, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith("--" + name + "="))?.split("=")[1];
  const date = arg("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error("--date=YYYY-MM-DD"); process.exit(2); }
  run({ date, dryRun: process.argv.includes("--dry-run") }).catch((e) => { console.error(e.message); process.exit(1); });
}

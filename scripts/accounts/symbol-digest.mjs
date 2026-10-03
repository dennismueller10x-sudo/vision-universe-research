/* =========================================================================
   VISION UNIVERSE — Watchlist-Berichte: reine Logik, kein I/O.

   Pro Aktie (nicht pro User) entsteht taeglich ein "Digest": die Liste der
   Ereignisse seit dem letzten Lauf. Quellen, alle bereits im Repository:

     news        dashboard/data/news_feed.json            (items[].symbol)
     hedgefunds  hedgefonds/data/funds/*.json             (trades.new/added/reduced/sold)
     quant       dashboard/data/fundamental_scores.json   (Score-Aenderung ggue. letztem Stand)
     analysts    dashboard/data/analyst_ratings.json      (Konsens-Wechsel)
     signals     supertrader/data/signals.json            (Signalzustand je Strategie)

   Ein Bericht fuer einen User ist dann nur noch: Digests seiner Tickers
   zusammenfuehren. 10.000 User mit derselben Nvidia kosten eine Berechnung.

   Jedes Ereignis: { kind, ticker, title, detail, severity, source, url?, at }
   severity: "high" | "notable" | "info" - steuert die Reihenfolge.
   ========================================================================= */

export const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
const SEVERITY_ORDER = { high: 0, notable: 1, info: 2 };
const QUANT_FIELDS = [
  ["fundamental_score_beta", "VU Fundamental Score"],
  ["quality", "Quality"], ["growth", "Growth"], ["value", "Value"], ["risk", "Risk"]
];
const SIGNAL_LABELS = {
  SETUP: "Setup erkannt", ENTRY_READY: "Einstieg bereit", TRIGGERED: "Ausgelöst", ACTIVE: "Aktiv",
  WARNING: "Warnung", EXIT: "Ausstieg", CLOSED: "Geschlossen", INVALIDATED: "Ungültig"
};
const TRADE_LABELS = { new: "neu gekauft", added: "aufgestockt", reduced: "reduziert", sold: "komplett verkauft" };
const CONSENSUS_LABELS = { strong_buy: "Starker Kauf", buy: "Kauf", hold: "Halten", sell: "Verkauf", strong_sell: "Starker Verkauf" };

export function shiftDate(date, days) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const clean = (t) => (typeof t === "string" ? t.trim().toUpperCase() : "");
const valid = (t) => TICKER.test(t);

/* --------------------------------------------------------------- quellen */

export function newsEvents(feed, { asOf }) {
  const out = [];
  for (const item of Array.isArray(feed?.items) ? feed.items : []) {
    const ticker = clean(item?.symbol);
    if (!valid(ticker) || typeof item.title !== "string") continue;
    out.push({ kind: "news", ticker, title: item.title, detail: item.why_it_matters || item.summary || null,
      severity: "notable", source: item.source || null, url: item.source_url || null,
      at: item.published_at || feed.updated_at || asOf });
  }
  return out;
}

/* 13F-Trades bleiben ein Quartal lang in den Dateien stehen. Ein Ereignis
   sind sie nur einmal: wenn die Meldung nach dem letzten Lauf (`since`)
   eingereicht wurde. Ohne frueheren Lauf zaehlen die letzten 7 Tage. */
export function hedgeFundEvents(funds, { asOf, since = null, minValueUSD = 1_000_000 }) {
  const out = [];
  const from = since || shiftDate(asOf, -7);
  for (const fund of Array.isArray(funds) ? funds : []) {
    if (!fund || fund.stale || !fund.filedDate || !(fund.filedDate > from) || fund.filedDate > asOf) continue;
    for (const [status, label] of Object.entries(TRADE_LABELS)) {
      for (const trade of Array.isArray(fund.trades?.[status]) ? fund.trades[status] : []) {
        const ticker = clean(trade?.ticker);
        if (!valid(ticker) || trade.putCall) continue;
        const value = Number(trade.valueUSD || trade.prevValueUSD || 0);
        if (value < minValueUSD) continue;
        const who = fund.manager ? `${fund.name} (${fund.manager})` : fund.name;
        const pct = Number.isFinite(trade.deltaPct) ? ` (${trade.deltaPct > 0 ? "+" : ""}${trade.deltaPct.toFixed(1)} % Stück)` : "";
        out.push({ kind: "hedgefund", ticker, title: `${who} hat ${ticker} ${label}${status === "added" || status === "reduced" ? pct : ""}`,
          detail: `13F-Meldung für ${fund.reportDate || "das letzte Quartal"}, eingereicht ${fund.filedDate || "unbekannt"}.`,
          severity: status === "new" || status === "sold" ? "high" : "notable",
          source: "SEC 13F", url: null, at: fund.filedDate || asOf, fund: fund.slug || null, filing: fund.accession || null });
      }
    }
  }
  return out;
}

/* Aenderung eines Scores um mindestens `threshold` Punkte gegenueber dem letzten Lauf. */
export function quantEvents(scores, previous, { asOf, threshold = 5 }) {
  const out = [];
  for (const [rawTicker, now] of Object.entries(scores?.symbols || {})) {
    const ticker = clean(rawTicker), before = previous?.[ticker]?.quant;
    if (!valid(ticker) || !before || !now) continue;
    for (const [field, label] of QUANT_FIELDS) {
      const a = Number(before[field]), b = Number(now[field]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < threshold) continue;
      out.push({ kind: "quant", ticker, title: `${label} ${b > a ? "steigt" : "fällt"}: ${a} → ${b}`,
        detail: null, severity: field === "fundamental_score_beta" ? "high" : "notable",
        source: "Vision Universe Quant", url: null, at: now.data_as_of || asOf });
    }
  }
  return out;
}

export function analystEvents(ratings, previous, { asOf }) {
  const out = [];
  for (const [rawTicker, now] of Object.entries(ratings?.symbols || {})) {
    const ticker = clean(rawTicker), before = previous?.[ticker]?.consensus;
    const label = now?.consensus_label;
    if (!valid(ticker) || !label || !before || before === label) continue;
    out.push({ kind: "analysts", ticker,
      title: `Analystenkonsens: ${CONSENSUS_LABELS[before] || before} → ${CONSENSUS_LABELS[label] || label}`,
      detail: null, severity: "notable", source: ratings.provider || null, url: null, at: asOf });
  }
  return out;
}

export function signalEvents(signals, previous, { asOf }) {
  const out = [];
  // Erster Lauf: Jeder bestehende Zustand waere "neu". Erst ab dem zweiten Lauf melden.
  if (!previous || !Object.keys(previous).length) return out;
  for (const [rawTicker, list] of Object.entries(signals?.bySymbol || {})) {
    const ticker = clean(rawTicker);
    if (!valid(ticker) || !Array.isArray(list)) continue;
    const before = previous?.[ticker]?.signals || {};
    for (const s of list) {
      const known = Array.isArray(before[s.strategyId]) ? before[s.strategyId] : [];
      if (!s?.strategyId || !SIGNAL_LABELS[s.state] || known.includes(s.state)) continue;
      out.push({ kind: "signal", ticker, title: `${s.strategyId.replace(/_/g, " ")}: ${SIGNAL_LABELS[s.state]}`,
        detail: "Modellsignal einer regelbasierten Strategie-Nachbildung. Keine Anlageberatung.",
        severity: s.state === "ENTRY_READY" || s.state === "EXIT" || s.state === "WARNING" ? "high" : "info",
        source: "Vision Universe Supertrader", url: null, at: signals.asOf || asOf });
    }
  }
  return out;
}

/* Der Zustand, gegen den der naechste Lauf vergleicht. */
export function snapshotState({ scores, ratings, signals }) {
  const state = {};
  const at = (t) => (state[t] ||= {});
  for (const [t, s] of Object.entries(scores?.symbols || {})) if (valid(clean(t))) {
    at(clean(t)).quant = Object.fromEntries(QUANT_FIELDS.map(([f]) => [f, s?.[f] ?? null]));
  }
  for (const [t, r] of Object.entries(ratings?.symbols || {})) if (valid(clean(t)) && r?.consensus_label) {
    at(clean(t)).consensus = r.consensus_label;
  }
  for (const [t, list] of Object.entries(signals?.bySymbol || {})) if (valid(clean(t)) && Array.isArray(list)) {
    // Je Strategie die Menge der protokollierten Zustaende (ohne DISCOVERED/WATCH-Momentaufnahmen).
    const m = {};
    for (const s of list) if (s?.strategyId && SIGNAL_LABELS[s.state]) (m[s.strategyId] ||= []).push(s.state);
    for (const k of Object.keys(m)) m[k] = [...new Set(m[k])].sort();
    at(clean(t)).signals = m;
  }
  return state;
}

/* --------------------------------------------------------------- zusammenfuehren */

function sortEvents(a, b) {
  return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
    String(b.at || "").localeCompare(String(a.at || "")) || a.title.localeCompare(b.title);
}

export function buildDigests({ asOf, since = null, news, funds, scores, ratings, signals, previous }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || "")) throw new Error("INVALID_AS_OF");
  // Ohne vorherigen Stand gibt es keine Aenderung, nur einen Ausgangspunkt.
  const prev = previous && typeof previous === "object" ? previous : {};
  const events = [
    ...newsEvents(news, { asOf }),
    ...hedgeFundEvents(funds, { asOf, since }),
    ...quantEvents(scores, prev, { asOf }),
    ...analystEvents(ratings, prev, { asOf }),
    ...signalEvents(signals, prev, { asOf })
  ];
  const byTicker = new Map();
  for (const e of events) {
    const list = byTicker.get(e.ticker) || [];
    // Dubletten (gleiche Art, gleicher Titel) nur einmal.
    if (!list.some((x) => x.kind === e.kind && x.title === e.title)) list.push(e);
    byTicker.set(e.ticker, list);
  }
  return [...byTicker.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, items]) => ({ ticker, digest_date: asOf, items: items.sort(sortEvents) }));
}

/* Bericht eines Users: seine Tickers, Ereignisse aus den Digests seit `since`. */
export function composeReport({ tickers, digests, reportDate, frequency, maxItemsPerTicker = 8 }) {
  const wanted = [...new Set((tickers || []).map(clean).filter(valid))].sort();
  const sections = [];
  for (const ticker of wanted) {
    const items = [];
    for (const d of digests.filter((x) => x.ticker === ticker).sort((a, b) => b.digest_date.localeCompare(a.digest_date))) {
      for (const e of d.items) if (!items.some((x) => x.kind === e.kind && x.title === e.title)) items.push(e);
    }
    if (items.length) sections.push({ ticker, items: items.sort(sortEvents).slice(0, maxItemsPerTicker), more: Math.max(0, items.length - maxItemsPerTicker) });
  }
  return { report_date: reportDate, frequency, tickers: wanted, items: sections,
    empty: sections.length === 0, eventCount: sections.reduce((n, s) => n + s.items.length, 0) };
}

/* Ist heute fuer diese Frequenz ein Bericht faellig? Woechentlich = Montag. */
export function reportDue(frequency, date) {
  if (frequency === "daily") return true;
  if (frequency === "weekly") return new Date(date + "T00:00:00Z").getUTCDay() === 1;
  return false;
}

export function reportWindowStart(frequency, date) {
  return shiftDate(date, frequency === "weekly" ? -6 : 0);
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderReportEmail(report, { siteUrl = "https://research.visionuniverse.de", displayName = null } = {}) {
  const title = report.frequency === "weekly" ? "Dein Wochenbericht" : "Dein Tagesbericht";
  const subject = `${title} · ${report.eventCount} Ereignis${report.eventCount === 1 ? "" : "se"} auf deiner Watchlist`;
  const greeting = displayName ? `Hallo ${escapeHtml(displayName)},` : "Hallo,";
  const sections = report.items.map((s) => `<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(s.ticker)}</h2><ul style="padding-left:18px;margin:0">${
    s.items.map((e) => `<li style="margin:0 0 8px"><strong>${escapeHtml(e.title)}</strong>${e.detail ? `<br><span style="color:#555">${escapeHtml(e.detail)}</span>` : ""}${
      e.url && /^https:\/\//.test(e.url) ? ` <a href="${escapeHtml(e.url)}">Quelle</a>` : ""}</li>`).join("")}${
    s.more ? `<li style="color:#555">… und ${s.more} weitere</li>` : ""}</ul>`).join("");
  const html = `<!doctype html><html lang="de"><body style="font-family:system-ui,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px">
<p style="letter-spacing:.13em;font-weight:700;border-left:3px solid #d53240;padding-left:10px">VISION UNIVERSE</p>
<h1 style="font-size:22px">${title} vom ${escapeHtml(report.report_date)}</h1><p>${greeting}</p>
${report.empty ? "<p>Auf deiner Watchlist gab es im Berichtszeitraum keine neuen Ereignisse.</p>" : sections}
<p style="margin-top:32px"><a href="${escapeHtml(siteUrl)}/konto/">Bericht im Konto öffnen</a> · <a href="${escapeHtml(siteUrl)}/konto/#einstellungen">Berichte abbestellen</a></p>
<p style="font-size:12px;color:#666">Keine Anlageberatung. Alle Angaben ohne Gewähr; Modellsignale sind regelbasierte Nachbildungen und keine Kauf- oder Verkaufsempfehlung.</p>
</body></html>`;
  const text = [`${title} vom ${report.report_date}`, "",
    ...(report.empty ? ["Keine neuen Ereignisse auf deiner Watchlist."] :
      report.items.flatMap((s) => [s.ticker, ...s.items.map((e) => `- ${e.title}`), ""])),
    `Im Konto öffnen: ${siteUrl}/konto/`, "Keine Anlageberatung."].join("\n");
  return { subject, html, text };
}

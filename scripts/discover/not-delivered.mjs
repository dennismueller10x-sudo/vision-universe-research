/* Produkttitel ohne Discover-Karte nach Grund (Auftrag 22.11.2026). Reine Funktion, kein Abruf, keine Ableitung neuer Werte:
   sie benennt nur, warum ein Titel des Produktuniversums keine Karte bekommt (Regeln in build-discover-data.mjs):
   - INSTRUMENT_<TYP>      Consumer-Instrumentenpolitik (universe-source.mjs: Vorzugsaktien, Warrants, Rights, Units)
   - IDENTITY_QUARANTINED  Ticker-Wiederverwendung (quant/config/ticker-reuse-quarantine.json)
   - KEINE_FAKTORZEILE:<m> der Faktorlauf hat den Titel gesperrt (stale_last_bar, unexplained_adjustment_step, ...)
     oder keine Kursreihe gehabt (SOURCE_MISSING); Erzeuger ist der Faktorlauf (quant/data/market/factors), nicht Discover. */
export function ohneKarte({ securities, delivered, factorTickers, skipped }) {
  const grundVon = new Map((skipped || []).map((s) => [s.ticker, s.reason === "FAIL" ? s.message : s.reason]));
  const byReason = {}, tickers = {};
  let total = 0;
  for (const sec of securities) {
    if (delivered.has(sec.ticker)) continue;
    let g;
    if (sec.consumer === false) g = "INSTRUMENT_" + (sec.instrumentType || "UNKNOWN");
    else if (sec.identityStatus === "IDENTITY_QUARANTINED") g = "IDENTITY_QUARANTINED";
    else if (!factorTickers.has(sec.ticker)) g = "KEINE_FAKTORZEILE:" + (grundVon.get(sec.ticker) || "NICHT_BERECHNET");
    else g = "SONSTIGE";
    g = g.replace(/[^A-Za-z0-9_:]+/g, "_").replace(/_+$/, "");
    total++;
    byReason[g] = (byReason[g] || 0) + 1;
    /* Tickerlisten nur fuer Gruende, die Unternehmen betreffen (nicht fuer Vorzugs-/Warrant-Zeilen). */
    if (!g.startsWith("INSTRUMENT_")) (tickers[g] = tickers[g] || []).push(sec.ticker);
  }
  for (const k of Object.keys(tickers)) tickers[k].sort();
  return { total, byReason: Object.fromEntries(Object.keys(byReason).sort().map((k) => [k, byReason[k]])), tickers };
}

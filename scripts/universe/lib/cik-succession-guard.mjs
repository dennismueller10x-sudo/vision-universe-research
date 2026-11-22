/* =========================================================================
   VISION UNIVERSE — scripts/universe/lib/cik-succession-guard.mjs

   EINE NEUE NOTIERUNG AN EINEM BESTEHENDEN EMITTENTEN BRAUCHT EINEN BELEG
   (Steuerung 22.11.2026)

   Die SEC-Tickerliste ordnet einem neuen Kuerzel oft die CIK eines Emittenten
   zu, dessen altes Kuerzel noch im Produkt steht (Kuerzelwechsel, z. B.
   ANY -> DRK). Ohne Regel stuenden dann Vorgaenger und Nachfolger am selben
   issuerId - Company Intelligence liest das als Wachstum des Emittenten und
   blockiert den Refresh.

   Regel: Eine CIK, die im Produkt schon an einem anderen Kuerzel haengt,
   bekommt ein Produktkuerzel nur, wenn es im Nachfolge-Register
   (quant/config/ticker-successions.json) als Nachfolger eines dieser Kuerzel
   steht (retirePredecessor nicht false, gleiche CIK). Sonst bleibt die CIK
   leer (oder die bisherige CIK des Kuerzels stehen), der Eintrag heisst
   PENDING_SUCCESSION_EVIDENCE und traegt die neue CIK als Kandidaten. Das ist ein Alarm, kein Abbruch: sobald der Beleg im Register
   steht, bekommt der naechste Lauf die CIK, und Regel D in
   apply-ended-listings.mjs nimmt den Vorgaenger heraus.

   Bestehende Zuordnungen bleiben unberuehrt (Aktienklassen desselben
   Emittenten teilen sich die CIK, das ist kein Befund). Geprueft wird nur,
   was gegenueber der vorigen Zuordnung neu an eine CIK kommt.
   ========================================================================= */

export const PENDING = "PENDING_SUCCESSION_EVIDENCE";

/**
 * @param {object} args
 * @param {Map<string, object>} args.byTicker   neue Zuordnung (Kuerzel -> {cik, status, ...}); wird veraendert
 * @param {object|null} args.previous           voriger cik-map.json#byTicker (null: keine Pruefung moeglich)
 * @param {Iterable<string>} args.productTickers Kuerzel des Produktuniversums
 * @param {Array<object>} args.successions      Eintraege aus ticker-successions.json
 * @returns {{ checked: boolean, pending: object[], registered: object[] }}
 */
export function guardNewIssuerAttachments({ byTicker, previous, productTickers, successions }) {
  const product = new Set(Array.from(productTickers || [], (t) => String(t).toUpperCase()));
  if (!previous) return { checked: false, pending: [], registered: [] };

  const prevCik = (t) => {
    const r = previous[t];
    return r && r.cik && r.status !== "AMBIGUOUS" ? String(r.cik) : null;
  };
  const holders = new Map();
  for (const t of product) {
    const c = prevCik(t);
    if (!c) continue;
    if (!holders.has(c)) holders.set(c, new Set());
    holders.get(c).add(t);
  }

  const pending = [], registered = [];
  for (const t of Array.from(product).sort()) {
    const row = byTicker.get(t);
    if (!row || !row.cik || row.status !== "RESOLVED") continue;
    if (prevCik(t) === row.cik) continue;
    const others = Array.from(holders.get(row.cik) || []).filter((o) => o !== t).sort();
    if (!others.length) continue;
    const entry = (successions || []).find((e) =>
      String(e.toTicker || "").toUpperCase() === t &&
      others.includes(String(e.fromTicker || "").toUpperCase()) &&
      e.retirePredecessor !== false &&
      (!e.cik || String(e.cik).padStart(10, "0") === row.cik));
    if (entry) {
      registered.push({ ticker: t, cik: row.cik, predecessor: String(entry.fromTicker).toUpperCase(),
                        effective: entry.effective || null });
      continue;
    }
    /* Hatte das Kuerzel schon eine andere CIK (Kuerzel neu vergeben, z. B. nach einer Uebernahme), bleibt
       die bisherige stehen: bis zum Beleg aendert sich am Emittenten nichts, weder Zugang noch Abgang. */
    const kept = prevCik(t);
    pending.push({ ticker: t, cik: row.cik, heldBy: others, keptCik: kept });
    byTicker.set(t, Object.assign({}, row, {
      cik: kept, status: PENDING, candidates: [row.cik], heldBy: others
    }));
  }
  return { checked: true, pending, registered };
}

"""Unabhaengiges Ledger-Orakel (Strang U, Teil 2). Forschung, nicht zertifiziert.

Reine Python-Standardbibliothek, exakte Bruchrechnung (fractions.Fraction). Das Orakel liest KEINEN Code der Engines
(research-portfolio.cjs, backtest.mjs, simulator.mjs); es setzt die unten stehende Buchungsvorschrift selbst um und
loest die Sollbuchungen geschlossen statt per Bisektion. Zwei Modelle:

A. WEEKLY_LEDGER  (Vorschrift von research-portfolio.cjs / portfolio-backtest.cjs)
   Je Sitzung i, in dieser Reihenfolge:
   1. Ereignisse mit Wirkungstag i: SPLIT (Stueck * Verhaeltnis), CASH_DIVIDEND (Anspruch = Stueck zu Beginn der Sitzung * Betrag,
      Gutschrift am Zahltag; ohne Zahltag nur ausgewiesen, nie gebucht), TERMINAL_CASH (Stueck * Betrag am Wirkungstag, Titel endet).
   2. Faellige Forderungen werden Cash.
   3. Bewertung: E = Cash + offene Forderungen + Summe Stueck * Rohschluss.
   4. Gibt es ein Ziel fuer i: Nach-Handels-Wert A loest  A + r * Summe_k |w_k*A - V_k| = E,  r = (Gebuehr+Slippage)/10000.
      Je Titel Delta_k = w_k*A - V_k; Kosten |Delta_k|*Gebuehr und |Delta_k|*Slippage je Seite zusaetzlich zum Umsatz;
      Ziel 0 verkauft exakt die gehaltenen Stueck. Forderungen finanzieren keine Orders: Summe(w)*A <= E - Forderungen - Kosten.
   5. Wert der Sitzung = Cash + Forderungen + Summe Stueck * Rohschluss.

B. DAILY_EXEC  (Vorschrift von scripts/supertrader/engine/execution.mjs + simulator.mjs, Tagesbalken)
   Slippage steckt im Fillpreis, Gebuehr je Seite auf den Umsatz. Stop-Verkauf: min(Stop, Eroeffnung)*(1-Slip).
   NEXT_OPEN: Bestaetigung per Schluss, Einstieg zur naechsten Eroeffnung*(1+Slip); Eroeffnung <= Stop: kein Einstieg.
   BUY_STOP: Tageshoch > Trigger, Einstieg max(Eroeffnung, Trigger)*(1+Slip); Reihenfolge von Hoch und Tief im Balken ist
   nicht belegt: Schluss <= Stop -> sicher gestoppt, Tief <= Stop < Schluss -> AMBIGUOUS (zwei benannte Varianten).
"""
from fractions import Fraction as Fr


def fr(x):
    return x if isinstance(x, Fr) else Fr(str(x))


# ---------------------------------------------------------------- A. WEEKLY_LEDGER
def solve_post_trade_equity(E, V, w, r):
    """Loest A + r*sum|w_k*A - V_k| = E geschlossen ueber das Vorzeichenmuster der Deltas."""
    keys = sorted(set(V) | set(w))
    A = E
    for _ in range(64):
        s = {}
        for k in keys:
            d = fr(w.get(k, 0)) * A - V.get(k, Fr(0))
            s[k] = (d > 0) - (d < 0)
        num = E + r * sum(s[k] * V.get(k, Fr(0)) for k in keys)
        den = 1 + r * sum(s[k] * fr(w.get(k, 0)) for k in keys)
        nxt = num / den
        t = {k: ((fr(w.get(k, 0)) * nxt - V.get(k, Fr(0)) > 0) - (fr(w.get(k, 0)) * nxt - V.get(k, Fr(0)) < 0)) for k in keys}
        A = nxt
        if t == s:
            return A
    raise RuntimeError("Vorzeichenmuster konvergiert nicht")


def settle_weekly(case):
    fee = fr(case.get("fee_bps", 0)) / 10000
    slip = fr(case.get("slip_bps", 0)) / 10000
    r = fee + slip
    n = len(case["sessions"])
    close = {k: [fr(x) for x in v["close"]] for k, v in case["listings"].items()}
    cash = fr(case["initial"])
    units = {k: Fr(0) for k in close}
    receivables = []  # (pay_index, amount)
    not_stated = Fr(0)
    ended = set()
    equity, cashes, claims_rows = [], [], []
    trades = []
    fees = Fr(0)
    slippage = Fr(0)
    turnover = Fr(0)
    for i in range(n):
        for ev in [e for e in case.get("events", []) if e["index"] == i]:
            k = ev["listing"]
            if ev["type"] == "SPLIT":
                units[k] *= fr(ev["ratio"])
            elif ev["type"] == "CASH_DIVIDEND":
                claim = units[k] * fr(ev["amount"])
                if claim:
                    if ev.get("pay_index") is None:
                        not_stated += claim
                    else:
                        receivables.append((ev["pay_index"], claim))
            elif ev["type"] == "TERMINAL_CASH":
                claim = units[k] * fr(ev["amount"])
                if claim:
                    receivables.append((i, claim))
                units[k] = Fr(0)
                ended.add(k)
        cash += sum((a for p, a in receivables if p <= i), Fr(0))
        receivables = [(p, a) for p, a in receivables if p > i]
        claims = sum((a for _, a in receivables), Fr(0))
        V = {k: units[k] * close[k][i] for k in close if units[k] and k not in ended}
        E = cash + claims + sum(V.values(), Fr(0))
        tg = case.get("targets", {}).get(str(i))
        rejected = None
        if tg is not None:
            A = solve_post_trade_equity(E, V, tg, r)
            cost = r * sum(abs(fr(tg.get(k, 0)) * A - V.get(k, Fr(0))) for k in set(V) | set(tg))
            if sum(fr(x) for x in tg.values()) * A > (E - claims) - cost:
                rejected = "UNSETTLED_CASH_NOT_INVESTABLE"
            else:
                traded = Fr(0)
                for k in sorted(set(V) | set(tg)):
                    d = fr(tg.get(k, 0)) * A - V.get(k, Fr(0))
                    if d == 0:
                        continue
                    f = abs(d) * fee
                    s = abs(d) * slip
                    cash -= d + f + s
                    fees += f
                    slippage += s
                    traded += abs(d)
                    if fr(tg.get(k, 0)) == 0 and units[k]:
                        u = units[k]
                        units[k] = Fr(0)
                    else:
                        u = d / close[k][i]
                        units[k] += u
                    trades.append({"index": i, "listing": k, "side": "BUY" if d > 0 else "SELL", "notional": abs(d), "units": abs(u)})
                turnover += traded / (2 * E) if E > 0 else 0
        claims = sum((a for _, a in receivables), Fr(0))
        V = {k: units[k] * close[k][i] for k in close if units[k] and k not in ended}
        equity.append(cash + claims + sum(V.values(), Fr(0)))
        cashes.append(cash)
        claims_rows.append(claims)
        if rejected:
            return {"error": rejected, "index": i}
    path = [fr(case["initial"])] + equity
    peak, mdd = path[0], Fr(0)
    for v in path:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    return {"equity": equity, "cash": cashes, "receivables": claims_rows, "units": {k: u for k, u in units.items() if u},
            "fees": fees, "slippage": slippage, "turnover": turnover, "trades": trades, "not_stated": not_stated,
            "total_return": equity[-1] / fr(case["initial"]) - 1, "max_drawdown": mdd}


def spread_variants(equity_before, positions_value, cash, traded_notional, half_spread_bps, later_return):
    """Quantifiziert die Spread-Variante: proportionaler Abschlag auf den GESAMTEN Portfoliowert (portfolio-backtest.cjs)
    gegen eine Abbuchung nur vom Cash je Fill. Beide mindern den Wert am Handelstag um denselben Betrag; danach rechnet der
    Abschlag auch den Positionsanteil herunter. Rueckgabe: Wert nach einer Folge-Rendite der Positionen (Bruch)."""
    sp = fr(traded_notional) * fr(half_spread_bps) / 10000
    pv = fr(positions_value)
    c = fr(cash)
    total = c + pv
    factor = 1 - sp / total
    haircut = total * factor + pv * factor * fr(later_return)        # Wert nach Abschlag, Positionen skaliert
    per_fill = (c - sp) + pv + pv * fr(later_return)                  # Spread nur aus dem Cash
    return {"haircut": haircut, "per_fill": per_fill, "difference": per_fill - haircut}


# ---------------------------------------------------------------- B. DAILY_EXEC
def _px_buy(base, slip):
    return fr(base) * (1 + fr(slip) / 10000)


def _px_sell(base, slip):
    return fr(base) * (1 - fr(slip) / 10000)


def settle_daily(case):
    """Sollbuchung fuer einen Fall. Rueckgabe: dict mit outcome, entry, exit, flags."""
    b = [{k: fr(v) if k != "d" else v for k, v in x.items()} for x in case["bars"]]
    slip = case.get("slip_bps", 10)
    trig, stop = fr(case["trigger"]), fr(case["stop"])
    s0 = case["setup_idx"]
    mode = case["mode"]
    out = {"outcome": "NO_ENTRY", "entry": None, "exit": None, "ambiguous": False, "variants": {}}
    if mode == "NEXT_OPEN":
        c = next((t for t in range(s0 + 1, len(b)) if b[t]["c"] > trig), None)
        if c is None or c + 1 >= len(b):
            return out
        t = c + 1
        if b[t]["o"] <= stop:
            out["outcome"] = "INVALIDATED_OPEN_AT_OR_BELOW_STOP"
            return out
        out["entry"] = {"index": t, "price": _px_buy(b[t]["o"], slip)}
        out["outcome"] = "OPEN"
        for u in range(t, len(b)):
            if b[u]["l"] <= stop:
                out["exit"] = {"index": u, "price": _px_sell(min(stop, b[u]["o"]), slip), "gap": b[u]["o"] < stop and u > t}
                out["outcome"] = "STOPPED_SAME_BAR" if u == t else "STOPPED"
                break
        return out
    if mode == "BUY_STOP":
        t = next((t for t in range(s0 + 1, len(b)) if b[t]["h"] > trig), None)
        if t is None:
            return out
        fill = max(b[t]["o"], trig)
        out["entry"] = {"index": t, "price": _px_buy(fill, slip)}
        out["outcome"] = "OPEN"
        sure = b[t]["c"] <= stop
        maybe = (not sure) and b[t]["l"] <= stop
        # Verkaufspreis: der Stop wurde NACH dem Kauf durchschritten; vor dem Kauf lag nur ein Eroeffnungskurs unter dem Stop.
        px_strict = _px_sell(stop, slip)
        px_open = _px_sell(min(stop, b[t]["o"]), slip)   # Variante der Engine: Gap-Regel auf den Eroeffnungskurs des Einstiegstags
        if sure:
            out["exit"] = {"index": t, "price": px_open, "price_strict": px_strict}
            out["outcome"] = "STOPPED_SAME_BAR_CERTAIN"
        elif maybe:
            out["ambiguous"] = True
            out["variants"] = {"NEUTRAL": {"outcome": "OPEN"}, "PESSIMISTIC": {"outcome": "STOPPED_SAME_BAR_PESSIMISTIC", "price": px_open}}
        if out["exit"] is None and not maybe:
            for u in range(t + 1, len(b)):
                if b[u]["l"] <= stop:
                    out["exit"] = {"index": u, "price": _px_sell(min(stop, b[u]["o"]), slip), "gap": b[u]["o"] < stop}
                    out["outcome"] = "STOPPED"
                    break
        return out
    raise ValueError(mode)


def round_trip_net(entry_fill, exit_fill, fee_bps, slip_bps, form):
    """Netto-Rendite eines Round Trips in den vier Kostenformen der Repo-Ledger (Rohpreise ohne Slippage uebergeben):
    ADDITIVE_FEE (simulator.closeTrade), SLIPPAGE_AS_COST (research-portfolio), MULTIPLICATIVE (rotation-52w, source-faithful)."""
    p0, p1, f, s = fr(entry_fill), fr(exit_fill), fr(fee_bps) / 10000, fr(slip_bps) / 10000
    if form == "SLIPPAGE_AS_COST":
        r = f + s
        return p1 * (1 - r) / (p0 * (1 + r)) - 1
    if form == "MULTIPLICATIVE":
        return p1 * (1 - s) * (1 - f) / (p0 * (1 + s) * (1 + f)) - 1
    if form == "ADDITIVE_FEE":
        return p1 * (1 - s) / (p0 * (1 + s)) - 1 - 2 * f
    if form == "NO_FEE_IN_PORTFOLIO_CASH":
        return p1 * (1 - s) / (p0 * (1 + s)) - 1
    raise ValueError(form)

"""Synthetische OHLC-/Ereignisfaelle fuer das Ledger-Orakel (Strang U, Teil 2). Nur Fixtures, keine Produktionsdaten.

Jeder Fall nennt `declared`: Liste erwarteter Abweichungen zwischen Engine und Orakel, je {code, class, what}, Klasse
FEHLER | ERLAUBTE_VARIANTE | DATENMEHRDEUTIGKEIT. Eine beobachtete Abweichung ohne Erklaerung oder eine Erklaerung ohne beobachtete Abweichung
laesst den Test scheitern (Abweichungsmatrix im Supertrader-/Quant-Handover)."""

FEHLER, VARIANTE, MEHRDEUTIG = "FEHLER", "ERLAUBTE_VARIANTE", "DATENMEHRDEUTIGKEIT"
DATES = ["2024-01-%02d" % d for d in (5, 12, 19, 26)] + ["2024-02-%02d" % d for d in (2, 9, 16, 23)]


def weekly(cid, text, listings, targets, events=(), fee=0, slip=0, initial=1000, n=None, declared=()):
    n = n or max(len(v) for v in listings.values())
    return {"id": cid, "kind": "WEEKLY_LEDGER", "text": text, "fee_bps": fee, "slip_bps": slip, "initial": initial, "sessions": DATES[:n],
            "listings": {k: {"close": [str(x) for x in v]} for k, v in listings.items()}, "targets": {str(k): v for k, v in targets.items()},
            "events": list(events), "declared": list(declared)}


WEEKLY = [
    weekly("W01", "Kauf und Halten ohne Kosten", {"A": [100, 100, 110, 110]}, {1: {"A": 1}}),
    weekly("W02", "Vollinvestition mit Gebuehr 10 + Slippage 5 bps je Seite", {"A": [100, 100, 100, 120]}, {1: {"A": 1}}, fee=10, slip=5),
    weekly("W03", "Umschichtung A/B mit Kauf- und Verkaufsseite und Kosten", {"A": [100, 100, 120, 120, 120], "B": [50, 50, 50, 60, 60]},
           {1: {"A": "0.5", "B": "0.5"}, 3: {"A": "0.25", "B": "0.75"}}, fee=10, slip=10),
    weekly("W04", "Vollausstieg (Ziel 0) verkauft exakt die gehaltenen Stueck", {"A": [100, 100, 100, 90, 90], "B": [50, 50, 50, 50, 50]},
           {1: {"A": "0.5", "B": "0.5"}, 3: {"B": "0.5"}}, fee=5, slip=5),
    weekly("W05", "Bardividende: Anspruch aus Stueck zu Sitzungsbeginn, Forderung bis zum Zahltag", {"A": [100] * 6}, {1: {"A": "0.5"}}, fee=0, slip=0,
           events=[{"type": "CASH_DIVIDEND", "listing": "A", "index": 2, "amount": "1", "pay_index": 4}]),
    weekly("W06", "Kauf am Ex-Tag begruendet keinen Anspruch", {"A": [100] * 5}, {2: {"A": 1}},
           events=[{"type": "CASH_DIVIDEND", "listing": "A", "index": 2, "amount": "1", "pay_index": 3}]),
    weekly("W07", "Split 2:1 (Rohschluss halbiert): Stueck verdoppeln, Wert stetig", {"A": [100, 100, 100, 50, 50, 55]}, {1: {"A": 1}},
           events=[{"type": "SPLIT", "listing": "A", "index": 3, "ratio": "2"}]),
    weekly("W08", "Reverse Split 1:5", {"A": [10, 10, 10, 50, 50]}, {1: {"A": 1}}, events=[{"type": "SPLIT", "listing": "A", "index": 3, "ratio": "0.2"}]),
    weekly("W09", "Split ohne Bestand zum Ereignistag: kein Effekt, spaeterer Kauf zum Rohpreis", {"A": [100, 100, 50, 50, 50]}, {3: {"A": 1}},
           events=[{"type": "SPLIT", "listing": "A", "index": 2, "ratio": "2"}]),
    weekly("W10", "Delisting: TERMINAL_CASH 70 je Stueck (Wiedererloes 0,7 vom letzten Schluss 100), Titel endet", {"A": [100, 100, 100]}, {1: {"A": 1}}, n=5,
           events=[{"type": "TERMINAL_CASH", "listing": "A", "index": 3, "amount": "70"}]),
    weekly("W11", "Delisting mit Fortbestand B und Wiederanlage des Erloeses", {"A": [100, 100, 100], "B": [50, 50, 50, 50, 55, 55]},
           {1: {"A": "0.5", "B": "0.5"}, 4: {"B": 1}}, n=6, events=[{"type": "TERMINAL_CASH", "listing": "A", "index": 3, "amount": "80"}]),
    weekly("W12", "Dividende ohne Zahltag (NOT_STATED): nie gebucht, nur ausgewiesen", {"A": [100] * 5}, {1: {"A": "0.5"}},
           events=[{"type": "CASH_DIVIDEND", "listing": "A", "index": 2, "amount": "1", "pay_index": None}]),
    weekly("W13", "Teilinvestition (Summe der Gewichte 0,6) mit Kosten", {"A": [100, 100, 105, 105]}, {1: {"A": "0.6"}}, fee=10, slip=5),
    weekly("W14", "Offene Forderung finanziert keine Order: volle Investition am Folgeziel wird abgelehnt", {"A": [100] * 6},
           {1: {"A": 1}, 3: {"A": 1}}, events=[{"type": "CASH_DIVIDEND", "listing": "A", "index": 2, "amount": "2", "pay_index": 5}]),
]


def bars(rows):
    return [{"d": "2024-03-%02d" % (i + 1), "o": o, "h": h, "l": l, "c": c} for i, (o, h, l, c) in enumerate(rows)]


def daily(cid, text, mode, rows, trigger=100, stop=95, declared=(), **kw):
    return {"id": cid, "kind": "DAILY_EXEC", "text": text, "mode": mode, "bars": bars(rows), "setup_idx": 0, "trigger": trigger, "invalidation": 90,
            "stop": stop, "slip_bps": 10, "comm_bps": 1, "declared": list(declared), **kw}


D_OPEN_END = {"code": "OPEN_NOT_BOOKED", "class": FEHLER, "what": "am Fensterende offene Position wird von collectTrades verworfen (weder geschlossen noch bewertet)"}
D_AMBIG = {"code": "AMBIGUOUS_ORDER", "class": MEHRDEUTIG, "what": "Tagesbalken zeigen nicht, ob erst Kauf oder erst Stop kam; zwei benannte Varianten"}
SETUP = (99, 99.5, 98, 99)  # Balken 0: Setup, Schluss unter dem Trigger
DAILY = [
    daily("S01", "NEXT_OPEN: Bestaetigung per Schluss, Einstieg zur Eroeffnung ueber dem Trigger (Gap)", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (103, 105, 102, 104), (104, 106, 103, 105)], declared=[D_OPEN_END]),
    daily("S02", "NEXT_OPEN: Stop im Einstiegsbalken (Eroeffnung ueber Stop, Tief durch Stop)", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (100, 101, 94, 96), (96, 97, 95.5, 96)]),
    daily("S03", "NEXT_OPEN: Eroeffnung unter dem Stop -> kein Einstieg", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (94, 96, 93, 95)]),
    daily("S04", "NEXT_OPEN: Eroeffnung genau auf dem Stop -> kein Einstieg (Grenzfall)", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (95, 98, 94, 97)]),
    daily("S05", "NEXT_OPEN: Gap unter den Stop an einem spaeteren Tag -> Fill zur Eroeffnung", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (101, 103, 100, 102), (92, 93, 90, 91)]),
    daily("S06", "NEXT_OPEN: Tief genau auf dem Stop (<=) -> Stop gilt als ausgeloest", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (101, 103, 100, 102), (102, 103, 95, 99)]),
    daily("S07", "BUY_STOP: Eroeffnung ueber dem Trigger -> Fill zur Eroeffnung, nicht zum Trigger", "BUY_STOP",
          [SETUP, (103, 106, 102, 105), (105, 107, 104, 106)], declared=[D_OPEN_END]),
    daily("S08", "BUY_STOP: Trigger im Tagesverlauf -> Fill zum Trigger", "BUY_STOP",
          [SETUP, (98, 101, 97, 100.5), (100.5, 102, 99, 101)], declared=[D_OPEN_END]),
    daily("S09", "BUY_STOP: Schluss unter dem Stop -> Stop nach dem Kauf sicher durchschritten (Einstiegsbalken)", "BUY_STOP",
          [SETUP, (98, 101, 94, 94.5)]),
    daily("S10", "BUY_STOP: Hoch ueber Trigger, Tief unter Stop, Schluss darueber -> Reihenfolge nicht belegt", "BUY_STOP",
          [SETUP, (98, 101, 94, 99)], declared=[D_AMBIG, D_OPEN_END]),
    daily("S11", "BUY_STOP: Eroeffnung unter dem Stop, dann Trigger, Schluss unter Stop (Gap-Regel auf Eroeffnung des Einstiegstags)", "BUY_STOP",
          [SETUP, (93, 101, 92, 94)],
          declared=[{"code": "EXIT_PRICE", "class": VARIANTE, "what": "Engine verkauft zu min(Stop, Eroeffnung)=93; der Stop galt erst nach dem Kauf, belegbar ist der Stop (95). Konservativ."}]),
    daily("S12", "BUY_STOP: Hoch genau auf dem Trigger (nicht darueber) -> kein Einstieg", "BUY_STOP",
          [SETUP, (98, 100, 97, 99.5)]),
    daily("S13", "Delisting/Serienende: Position bleibt offen, Engine bucht sie nicht", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (101, 103, 100, 102)],
          declared=[{"code": "OPEN_NOT_BOOKED", "class": FEHLER, "what": "Position bei Delisting/Serienende bleibt offen und wird von collectTrades verworfen: Verluste fehlen (Survivorship)"}]),
    daily("S14", "Portfolio-Cash mit Gebuehr 1 bp je Seite: Einstieg 100, Ausstieg zur naechsten Eroeffnung ueber exit_close_above", "NEXT_OPEN",
          [SETUP, (100, 102, 99.5, 101), (100, 125, 99.5, 124), (121, 125, 120, 124), (120, 121, 119, 120)], exit_close_above=120, portfolio=True,
          declared=[{"code": "PORTFOLIO_FEE", "class": FEHLER, "what": "backtest.mjs#runPortfolio bucht keine Gebuehr (nur Slippage im Preis); closeTrade zieht 2 bps additiv vom Einzelertrag ab"}]),
]
CASES = WEEKLY + DAILY

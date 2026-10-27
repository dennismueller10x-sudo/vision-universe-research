# V9 – methodische Abnahme

Die V7-/V8-Abnahmen (Monte Carlo, OOS-Verwaltung, Walk-Forward, Marktregime) bleiben unverändert. V9 nimmt die drei offenen Erweiterungsmethoden jeweils in einem **eng benannten** Scope ab. Jede Abnahme stützt sich auf eine vor der Auswertung gespeicherte und gehashte Registrierung, eine unveränderte Engine und eine unabhängige Python-Nachrechnung.

## Parameter-Sensitivität – ACCEPTED_WITH_DEFINED_SCOPE

- **V8-Replay** auf aktuellem Main: alle 17 Bindungen unverändert, Plan-, Registrierungs-, Input- und Ergebnishash identisch (Holm 6/36 wie V8).
- **Registrierung** `5196adfe…` (2026-10-27T18:24Z, in Git ab Commit `101cfa8704`, also vor den Ergebnissen in `3c899889b5`): Diagnosen D1–D10, Kriterien C1–C6, Entscheidungsregel, Populationen, Endpunkte.
- **Populationen:** Rahmen 4.255 qualifizierte Listings mit modalem Wochenkalender; P1 = 1.000 per Hash-Seed (9.898 Ereignisse je Punkt), P2 = übrige 3.255 (31.913) als nicht unabhängige Replikation.
- **Diagnostik:** Politis–White-Blocklänge Median ~30 (max 45) ≤ 52; SE-Plateau Max/Min ≤ 1,12 über b = 39–104; stationärer und Moving-Block-Bootstrap sowie Newey–West(52) stimmen auf 0,88–1,00 überein; KPSS ≤ 0,20, CUSUM ≤ 0,84, Split-Wald p ≥ 0,045. C1–C6 je 36/36 auf P1 und P2.
- **Ergebnis:** Basis (13 W, 1 W Delay, 10+5 bp): P1 +3,37 % [1,57; 5,21], Holm-p 0,029; 25/36 Holm-Ablehnungen. Überschuss ggü. SPY: P1 +1,37 % (p 0,06), **0 Holm-Ablehnungen** – kein Vorteil.
- **Scope:** deskriptive Robustheit plus bedingte abhängigkeitsbewusste Kalenderblock-Inferenz (b = 52) für den Primärendpunkt von NEW_52W_HIGH auf P1/P2. **Ausgeschlossen:** V8-Trio (Stationarität auf 12/36 Punkten verletzt), Überschussendpunkt (klar instationär), andere Regeln/Zeiträume. Mischung ist nie beweisbar; Survivors; explorierte Historie.

## Event-Driven – ACCEPTED_WITH_DEFINED_SCOPE

- **Kategorie:** originale 8-K mit Item 2.02, keine 8-K/A (77 gezählt, nie Ereignis). Verfügbarkeit = SEC-Acceptance, auf 283/283 Stichproben-Headern exakt (submissions-API ist echtes UTC).
- **Population:** 2.730 Listings (aktuelle Common-Survivors, Ticker-Wiedervergabe-Schutz), 11.888 Ereignisse auf 267 Einstiegstagen, 23.680 Placebo-Kontrollen ohne eigene 8-K im Fenster.
- **Einstieg:** erster expliziter XNYS-Schluss strikt nach Acceptance (`runEventStudy` unverändert).
- **Primärendpunkt A1** (|AR| Ereignis − Kontrollen, h = 1): **+0,740 %**, Holm-p 3,5e-8, Block-Bootstrap [+0,29 %; +1,14 %]. Die Positivkontrolle ist nachgewiesen.
- **Grenzen offen benannt:** h20-Kontrollfenster in 1.0.0 zu kurz (post-hoc 1.1.0 beseitigt den Artefakt, bleibt sekundär); Bootstrap- und Clusterurteile divergieren bei h5/h20 (wenige Saisons). Der Pre-Entry-Betrag (6,9–7,4 % vs. ~2,3 % Kontrollen) zeigt: Next-close-Einstieg ist look-ahead-frei, aber spät. Nach dem Freeze war ein Teil-Trockenlauf sichtbar; die Regel blieb unverändert – offengelegt.
- **Scope:** Methode zur look-ahead-freien Datierung und Messung der Absolutreaktion am Folgetag. **Ausgeschlossen:** h > 1, Alpha/Drift, Earnings-Uhrzeit, Bestätigung. Prospektive Kohorte `REGISTERED_NOT_EVALUABLE` (Reife 2027-04-29).

## Portfolio-Rebalancing – ACCEPTED_WITH_DEFINED_SCOPE (Buchführungsmechanik)

- Bestehender `runPortfolio` unverändert, mit SEC-belegten Zahlungstagen (Forderung bis payDate nicht investierbar), belegten Splits (NVDA 4:1/10:1, WMT 3:1, paritätisch zu `splitFactors` ≤ 6,7e-16) und realen Terminalereignissen (CRNX bar, LBRDK → 0,236 CHTR).
- L1 MSFT+WMT 2015–2026: Gesamtrendite-CAGR 18,36 % vs. Kursrendite 16,64 %; 94 Dividenden.
- **Schutzwirkung belegt:** Bei 100 % Investitionsgrad wird der korrekte Lauf mit `UNSETTLED_CASH_NOT_INVESTABLE` abgewiesen; nur die verbotene Ex-Tag-Annahme liefe durch. Price-only lehnt Terminalereignisse ab.
- 22/22 Läufe exakt durch einen unabhängigen Decimal-Ledger in Python reproduziert (max. 8,7e-15).
- **Scope:** Buchführung von Cash, Drift, Kosten, Rebalancing, Dividendenforderungen bis zum belegten Zahlungstag, Splits, bar- und aktienbasiertem Terminalereignis. **Ausgeschlossen:** Spin-offs, ADS-/Mischgegenleistung, unbekannter Zahlungstag, historische Membership, jede Strategiezertifizierung. Die engere Lesart des Strangs („Methode insgesamt PARTIAL“) ist als Owner-Option dokumentiert.

## Normative Entscheidung

[Setup-Empfehlung 1.0.0](v9/setup-decision-recommendation-1.0.0.json): ISO-Wochenzähler (Vertrag 1.1.0) plus Pflicht zu wochengeclusterter Unsicherheit; der Monatszähler bleibt Auditfeld. Nicht genehmigt, nicht aktiviert.

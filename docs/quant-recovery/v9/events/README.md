# V9 Workstream D – Event-Driven: originale 8-K Item 2.02

Stand 27.10.2026, asOf 26.10.2026. Retrospektiv/explorativ, `NOT_CERTIFIED`, `productionApproved=false`.

## Regel (vor jedem Outcome registriert)

- [Registrierung 1.0.0](registration-retrospective-1.0.0.json), eingefroren 2026-10-27T18:20Z, also vor der ersten Outcome-Berechnung.
- Ereignis: originales Form 8-K (`form == "8-K"`), dessen `items` in den SEC-Submissions-JSON `2.02` enthalten. 8-K/A wird gezählt, ist aber nie ein Ereignis.
- Verfügbarkeitsuhr: SEC-Acceptance. Sie ist eine **Obergrenze** der öffentlichen Verfügbarkeit. Die Pressemitteilung kann früher erschienen sein.
- Einstieg: erster expliziter XNYS-Schlusskurs strikt nach der Acceptance (trading-session.js + market-calendar.json). Horizonte 1/5/20 Bars, Kosten 10+5 bps je Seite, Benchmark SPY.
- Engine `research-studies.cjs#runEventStudy`, unverändert.
- Kontrollen: k=2 Placebo-Listings je Ereignis, ausgewählt per Hash-Seed. Sie haben dieselbe Acceptance-Zeit, denselben Einstieg und kein Item-2.02-Filing im Ausschlussfenster.

## Herkunft des Acceptance-Zeitpunkts

[header-parity-1.0.0.json](header-parity-1.0.0.json) enthält eine geschichtete Zufallsstichprobe (Seed `V9-EVENTS-HEADER-PARITY-1`, 73 Schichten) aus 243 originalen 8-Ks und 40 8-K/A. Ergebnis: **283/283** stimmen mit dem SGML-Feld `<ACCEPTANCE-DATETIME>` (US Eastern) überein. Auch Accession, Formtyp, Filing-Datum und die Item-2.02-Angabe im Header stimmen in allen Fällen überein.

Das Feld `acceptanceDateTime` der Submissions ist **echte UTC**, keine als „Z“ markierte Eastern-Zeit. Die Stichprobe deckt beide Zeitregimes ab: EST-Monate (Nov–Mär) und EDT-Monate.

## Population

- 6.679 Daily-Reihen, davon 4.431 populationsfähig: EQUITY_COMMON, eligible, primär, NYSE/NASDAQ/AMEX und aktuell wöchentlich QUALIFIED.
- 4.237 dieser Listings sind über die aktuelle SEC-Tickerliste einer CIK zugeordnet; 4.125 Submissions wurden ohne Fehler abgerufen.
- Nach den Schutzregeln bleiben **2.730 Listings / 2.730 Emittenten**.
- Ausschlüsse:

  | Grund | Anzahl |
  |---|---|
  | Namensänderung im Fenster | 348 |
  | Exchange-Mismatch | 27 |
  | Zweitklasse derselben CIK | 100 |
  | Kein Item-2.02-Melder | 1.007 |
  | Datum außerhalb des Kalenders | 25 |
  | Ticker nicht in der SEC-Liste | 194 |

- Survivorship: Die Population besteht nur aus aktuellen Listings. Das Ergebnis gilt bedingt auf Überleben bis 26.10.2026.

## Ereignisse

| Kennzahl | Anzahl |
|---|---|
| Originale Item-2.02-8-Ks (geerntet) | 12.271 |
| Davon im Fenster | 11.919 |
| Same-Entry-Duplikate | 31 |
| **Ereignisse** | **11.888** auf 267 Einstiegstagen |
| Kontrollen | 23.680 (48 Ereignisse mit weniger als 2 Kandidaten) |
| Vor dem Fenster | 299 |
| Nach asOf, vor dem prospektiven Freeze | 53 |
| 8-K/A Item 2.02 | 77 |
| 8-K/A gesamt | 747 |

Nicht gereifte Fälle (IMMATURE) werden nicht verworfen:

| Horizont | Ereignisse IMMATURE | Ereignisse + Kontrollen | Volle Reife |
|---|---|---|---|
| h1 | 65 | 99 | 28.10. |
| h5 | 344 | 936 | 03.11. |
| h20 | 498 | 1.398 | 24.11.2026 |

Ledger mit Accession und Acceptance je Ereignis sowie den Kontrollen: [event-ledger-1.0.0.json.gz](event-ledger-1.0.0.json.gz).

## Ergebnisse 1.0.0 (registriert)

Tabellen und Daten: [results-retrospective-1.0.0.json](results-retrospective-1.0.0.json).

D = |AR_event| − mittleres |AR_control|, AR jeweils gegen SPY.

| Endpunkt | Mittelwert | 2-Wege-SE | Holm-p | Block-Bootstrap 95 % |
|---|---|---|---|---|
| A1 (D, 1 Bar) | +0,740 % | 0,128 % | 3,5e-8 | [+0,29 %, +1,14 %] |
| A5 | +0,715 % | 0,213 % | 0,0019 | [−0,21 %, +1,45 %] |
| A20 | **−1,73 %** | 0,506 % | 0,0019 | [−3,95 %, +0,09 %] |
| B1 (Netto-Excess) | −0,497 % | 0,085 % | 3,5e-8 | [−0,69 %, −0,35 %] |
| B5 | −0,679 % | 0,212 % | 0,0019 | [−1,44 %, +0,01 %] |
| B20 | −0,962 % | 0,243 % | 0,0003 | [−2,07 %, +0,06 %] |

**Positivkontrolle A1: DETECTED.** Mittleres |AR| am Folgetag: Ereignisse 3,12 %, Kontrollen 2,38 %.

Einordnung der übrigen Endpunkte:

- **B ist kein Ereigniseffekt.** B ist netto, enthält also 30 bps Roundtrip-Kosten. Die signierte Differenz Ereignis minus Kontrolle ist ≈ 0: h1 −0,11 % (SE 0,11 %), h5 +0,38 % (SE 0,20 %), h20 −0,29 % (SE 0,37 %). Das negative B spiegelt Kosten und die Drift der Population gegenüber SPY.
- **A20 < 0 ist ein Designfehler von 1.0.0.** Das Ausschlussfenster von ±10 Sitzungen ist kürzer als der Horizont von 20 Bars. Kontrollen tragen deshalb ihre eigene Ankündigung in den Bars 11–20.
- **Für h5 und h20 widerspricht der Bootstrap den Cluster-p.** Bei etwa vier Berichtssaisons sind die Zeitcluster faktisch wenige.

## Post-hoc-Sensitivität 1.1.0 (nach Sichtung von 1.0.0)

Die [Registrierung 1.1.0](registration-retrospective-1.1.0.json) ändert nur das Ausschlussfenster der Kontrollen auf [−10, +21] Sitzungen. Ergebnisse: [results-retrospective-1.1.0.json](results-retrospective-1.1.0.json).

| Endpunkt | Mittelwert | Holm-p | Bootstrap |
|---|---|---|---|
| A1 | +0,763 % | 3,1e-9 | [+0,31 %, +1,18 %] |
| A5 | +0,743 % | 0,0015 | [−0,18 %, +1,53 %] |
| A20 | −0,57 % | 0,21 | [−2,6 %, +1,3 %] |

Damit verschwindet der A20-Artefakt. 1.0.0 bleibt die registrierte Primäranalyse.

## Diagnose: Bewegung vor dem Einstieg

Gemessen wird vom letzten Schluss vor der Acceptance bis zum Einstiegsschluss, marktbereinigt; angegeben ist der mittlere Absolutwert.

| Bucket | Ereignisse | n | Kontrollen |
|---|---|---|---|
| PRE_OPEN | 6,90 % | 4.565 | 2,42 % |
| POST_CLOSE | 7,39 % | 6.762 | 2,30 % |
| REGULAR | 3,89 % | 508 | 2,38 % |

Die Kontrollzeile ist eine nachträglich ergänzte, deklarierte Diagnose.

Der Großteil der Reaktion liegt vor dem ersten zulässigen Einstieg. Next-Close nach Acceptance ist frei von Look-ahead, aber spät. Dass die Acceptance bei REGULAR-Filings innerhalb der Sitzung liegt, belegt keinen Zeitpunkt der Pressemitteilung.

## Cluster

- Die 20 größten Einstiegstage tragen 37 % der Ereignisse; das Maximum ist 373 an einem Tag.
- Gleicher Emittent mit überlappenden 20-Bar-Fenstern: 456 Paare.
- Jedes 20-Bar-Fenster überlappt Fenster anderer Einstiegstage.

## Unabhängige Parität

[parity-1.0.0.json](parity-1.0.0.json) und [parity-1.1.0.json](parity-1.1.0.json): **PASS**, 732.449 Vergleiche, 0 Abweichungen.

Die Python-Referenz (stdlib, zoneinfo) leitet alles erneut aus den Rohinputs ab:

- Schutzregeln, Ereignisse und Kontrollen
- Sitzungsschlüsse, Ein- und Ausstieg
- 104.271 beobachtete Renditezeilen
- Cluster-SE, Holm, Bootstrap und die Diagnose vor dem Einstieg

Das ist eine Rechenparität auf denselben Daten, kein unabhängiger Holdout.

## Prospektiv

[registration-prospective-1.0.0.json](registration-prospective-1.0.0.json) hat den Status **REGISTERED_NOT_EVALUABLE**. Kohorte: Acceptances nach 2026-10-27T18:25Z bis 31.03.2027. Volle Reife am 29.04.2027.

## Offenlegung

- Ein Pipeline-Probelauf auf einem Teil-Ledger (1.509 Emittenten) hat nach dem Freeze von 1.0.0 Outcomes angezeigt. Die Regel blieb danach unverändert.
- Nur die Kontroll-Diagnose vor dem Einstieg und die Post-hoc-Version 1.1.0 kamen später hinzu; beide sind ausgewiesen.
- Das Preisfenster wurde schon in V8 exploriert.

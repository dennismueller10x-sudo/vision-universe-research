# Supertrader — Datenstrecke zum ersten validierbaren Backtest (Stand 01.10.2026)

Ziel ist ein Backtest einer Kursstrategie, der die harten Gates bestehen kann: Survivorship, damaliges Universum, Kapitalmaßnahmen und Nutzungsrechte. Grundlage sind gemessene Belege aus dem Repository und ein kleiner Probeabruf mit dem bestehenden Zugang. Werte sind nur dort eingetragen, wo sie gemessen wurden.

## 1. Testuniversum — vorab festgelegt

| Variante | Braucht | Für die erste Strategie? |
|---|---|---|
| **A: alle an Tag D handelbaren US-Stammaktien** (Listing-Beginn ≤ D ≤ Listing-Ende), NYSE/NASDAQ/AMEX, USD | Listing-/Delisting-Daten je Wertpapier, Tageskurse bis zum letzten Handelstag | **ja** |
| B: historisches Indexuniversum (z. B. S&P 500 je Stichtag) | zeitlich korrekte Indexmitgliedschaft | nein |

Begründung für Variante A:
- Donchian/Turtle ist eine Kursmethode ohne Indexbezug. Variante A bildet ab, was ein Anleger am Tag D tatsächlich kaufen konnte.
- Indexhistorie wird deshalb nicht beschafft. Im Repository gibt es dafür keine Quelle: `quant/data/market/index-membership/history` hat zwei Stichtage aus ETF-Beständen, „keine offizielle Indexliste“.

Feste Filter (VU, vorab):
- Rohschluss (unbereinigt) ≥ 5 USD am Vortag. Damit fällt das Reverse-Split-Artefakt des Wochen-Pilots weg.
- Ø 20-Tage-Dollarumsatz aus Rohschluss × Volumen ≥ 5 Mio. USD.
- ≥ 252 Handelstage Historie im laufenden Listing.

## 2. Was vorhanden ist — Belege

| Baustein | Beleg | Befund |
|---|---|---|
| Listing-/Delisting-Daten | Tiingo `supported_tickers.zip` (Anfrage im bestehenden Abo) | 108.908 Zeilen, davon 39.402 mit Ende vor 2026; je Zeile `startDate`, `endDate`, `exchange`, `assetType`. Im Repository liegen nur 8.021 Basiszeilen; die Weitergabe der vollen Liste ist `LEGAL_REVIEW_REQUIRED`. |
| Kurse delisteter Titel | Probeabruf 01.10.2026, 21 zufällig gezogene delistete Listings ohne Kürzel-Neuvergabe | **21/21** liefern Tageskurse, **20/21** bis ≤ 7 Tage vor dem Listing-Ende. Ausnahme: WAG – Ende der Kursreihe 2014-12-30, die Liste nennt 2015-11-23. |
| Bekannte Ausstiege | TWX (Übernahme 06/2018), CELG (11/2019) | Kurse bis zum letzten Handelstag (Abstand 0 Tage). |
| Dividenden/Splits | Probeabruf | Alle 21 Reihen tragen `divCash` und `splitFactor`; dazu Rohkurs und bereinigter Kurs. |
| Gesamtrendite einheitlich? | `quant/data/providers/return-basis-universe-study.json` | `TOTAL_RETURN_NOT_UNIFORM`: 681 von 3.333 geprüften Titeln mit Abweichungen der bereinigten Spalte. **Folge:** Gesamtrendite selbst aus Rohschluss + `divCash` + `splitFactor` rechnen, nicht aus `adjClose`. |
| Neu vergebene Kürzel | Probeabruf, 6 zufällige Fälle + MON | **0/7** liefern die alte Historie. Der Abruf über das Kürzel gibt nur das neueste Listing zurück; Monsanto (MON bis 2018) ist so nicht abrufbar. |
| Delistings vor 2009 | Probeabruf (Pool je Zeitraum) | Ende 2001–2008: 1 auswählbares Listing, 2009–2016: 765, 2017–2025: 2.713. LEH (Lehman) und WM (Washington Mutual, alt) fehlen in der Liste. |
| Delisting-Renditen | – | Liefert die Quelle nicht. Nötig ist eine vorab festgelegte Annahme. |
| Stabile Kennung | Security Master | `canonical_id = tiingo:<EXCH>:<TICKER>:<startDate>` trennt Listings. Ein permaTicker-Abruf wurde nicht geprüft. |
| Nutzungsrechte | `quant/config/provider-profiles.json` | `OWNER_DECLARED_LICENSED` (2026-09-13), Vertragstext nicht im Repository; KI-Nutzung `UNKNOWN`. Veröffentlichung abgeleiteter Backtest-Kennzahlen ungeklärt. |

## 3. Was genau fehlt

1. **Kurshistorien der delisteten Listings 2010–2025**
   - Laut Pool rund 3.500 Listings ohne Kürzel-Neuvergabe; die Zahl je Jahr folgt in Abschnitt 6.
   - Quelle: bestehender Tiingo-Zugang. Ein Abruf je Listing liegt unter einem Tagesbudget des Marktlaufs (7.500).
2. **Alte Listings neu vergebener Kürzel**
   - Über das Kürzel nicht abrufbar.
   - Entweder liefert die Quelle sie über eine stabile Kennung (offen, Probe nötig), oder sie werden als dokumentierte Lücke gezählt.
3. **Delisting-Rendite**
   - Wird vorab festgelegt: Basis = letzter Schlusskurs. Zusätzlich eine Sensitivität mit −30 % für Listings, deren Ende nicht mit einer Übernahme belegt ist.
   - Ein Ergebnis gilt nur, wenn die Aussage unter beiden Annahmen hält.
4. **Owner-Entscheidung zu den Rechten**
   - Interne Backtests mit allen Listings.
   - Veröffentlichung abgeleiteter Kennzahlen (keine Kurse).

## 4. Zeitliche Korrektheit — Akzeptanztests

| Test | Kriterium |
|---|---|
| AT1 Abdeckung | ≥ 95 % der delisteten Listings im Testzeitraum haben Kurse bis ≤ 7 Tage vor dem Listing-Ende (Probe: 20/21 = 95 %). |
| AT2 Universum zum Stichtag | Universum(D) enthält nur Listings mit Beginn ≤ D ≤ Ende. Ein Unit-Test mit „vergifteten“ Zukunftsbalken schlägt an, wenn ein Signal Daten nach D liest. Die Titelzahl je Jahr wird ausgewiesen. |
| AT3 Kürzel-Neuvergabe | Jeder Kursbalken wird dem Listing zugeordnet, dessen Zeitraum ihn enthält. Nicht abrufbare Listings werden gezählt; ihr Anteil an den Universum-Tagen muss unter 5 % liegen, sonst gilt der Test als nicht validierbar. |
| AT4 Kapitalmaßnahmen | Die selbst gerechnete Gesamtrendite stimmt bei ≥ 98 % der Dividenden- und Split-Ereignisse mit der Quelle überein; abweichende Titel werden mit Anzahl ausgeschlossen. |
| AT5 Rohpreisfilter | Der 5-USD- und der Umsatzfilter nutzen Rohschluss und Volumen von D−1. Ein Test mit Reverse-Split-Reihe wird abgelehnt. |
| AT6 Delisting-Rendite | Beide vorab festgelegten Annahmen werden gerechnet und ausgewiesen. |
| AT7 Rechte | Owner-Freigabe dokumentiert, bevor Kennzahlen veröffentlicht werden. |
| AT8 Reproduzierbarkeit | Hash und Datum der Tickerliste, Regelversion, Kosten (0,10 % je Seite + Gap-Regel) und Seed werden im Ergebnis gespeichert. |

## 5. Erste validierbare Strategie

- **Strategie:** Donchian/Turtle System 1, Tagesbalken (live v1.1.0: 20/10, Stop 2N, Bestätigung per Schluss, Einstieg zur nächsten Eröffnung). Reine Kursmethode, keine Fundamentaldaten nötig.
- **Zeitraum:** 2010–2026.
  - Das sind über 16 Jahre mit den Rückgängen 2011, 2015/16, Q4 2018, 2020 und 2022.
  - Prüfplan: ≥ 10 Jahre, ≥ 2 Bärenmärkte, ≥ 300 Trades.
  - Vor 2009 ist die Delisting-Abdeckung der Quelle zu dünn.
- **Vergleich:** gleich gewichtetes Universum A inklusive delisteter Titel, und SPY mit Dividenden.

## 6. Abdeckung delisteter Listings je Jahr

Folgt aus der Auswertung der Tickerliste (`--list-stats`, nur Liste, keine Kursanfragen); siehe unten.

## 7. Bleibende Unsicherheiten

- Ob die Tickerliste alle Delistings ab 2010 enthält, ist mit der Liste allein nicht beweisbar. Ein Abgleich mit einer zweiten Quelle wäre kostenpflichtig und ist nicht beauftragt.
- Die Gründe der Delistings (Übernahme oder Insolvenz) sind unbekannt, daher die Sensitivität in AT6.
- OTC-Handel nach dem Delisting wird nicht abgebildet.
- Eine Ausführung zur Eröffnung mit 0,10 % ist eine Annahme, keine gemessene Ausführungsqualität.

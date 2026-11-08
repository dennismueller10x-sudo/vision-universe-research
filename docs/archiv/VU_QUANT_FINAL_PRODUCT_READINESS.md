# Vision Universe Quant – Final Product Readiness

Stand 05.10.2026 · Owner-Auftrag „Final Integrity, Commercial Readiness & Daily Product Loop“.
Jede Zahl hier ist gemessen; was erst nach einem Datenlauf messbar ist, steht als solches da.

## 1. P0/P1-Inventar

Quellen: Orchestrator-State, Launch-Report, Backtest-Zertifizierung, Positionierung, CI auf `main`,
Produktionsbefunde der letzten Läufe.

| # | Punkt | Klasse | Status |
|---|---|---|---|
| 1 | JPM-Börsenwert aus ausgegebenen statt ausstehenden Aktien (Registry-Rückfall `CommonStockSharesIssued`) | **P0** | behoben (market-cap-1.0.0, SEC-Mapping 1.6.0), Wirkung nach SEC-Lauf gemessen |
| 2 | Konzept-Herkunft der Aktienzahl fehlt in der Konsumschicht (DATA_CONTRACT_GAP) | **P1** | behoben (`ttm.concept`, `conceptsUsed`) |
| 3 | Bänder „sehr stark … schwach“: Quality erreicht „sehr stark“ nie | **P1 (Audit)** | Urteil C, Owner-Gate (siehe 7) |
| 4 | Gründe in der ersten Ebene mit internen Begriffen („Pipeline-Lauf“, „Setup-Engine“, „Point-in-Time“, „Base Rate“) | **P1 (Sprache)** | behoben |
| 5 | Radar zeigt zwei bereits gemeldete Ereignisse wie neue | P2 | behoben („Bereits gemeldet“) |
| 6 | Pages-Release `4a336e71` rot (Lieferkontrakt) | – | erledigt: Folgeläufe grün |
| 7 | 405 Emittenten mit einer Aktienzahl älter als 400 Tage | P2 | bereits verworfen (`periodAligned`, STALE_INSTANT_DAYS) |
| 8 | Deckblatt-Aktienzahl wird der letzten abgeschlossenen Periode zugeordnet (Deckblattdatum liegt danach) | P2 | dokumentiert, SEC-Logik 1.1.0 bewusst so |
| 9 | Fachsätze der Szenario-Engine nur auf der Radarkarte übersetzt | P2 | dokumentiert |
| 10 | `total_debt`-Konzeptzuordnung | Owner-Gate | offen (aus Launch-Report) |
| 11 | Zertifizierung 0 von 6 Backtest-Arten; Benachrichtigungen ohne Versand | POST_LAUNCH | bewusst |
| 12 | Börsenwert bei Emittenten, die nicht in USD berichten (ADR, 20-F/40-F): Stammaktien × ADS-Kurs, Gewinn in Fremdwährung ÷ Börsenwert in USD (CNF 0,36 → 3,0 Mrd; AMX 1.283 Mrd; BCH 3.888 Mrd) | **P1** | behoben (market-cap-1.1.0, `REPORTING_CURRENCY_NOT_LISTING_CURRENCY`) |
| 13 | META ohne Börsenwert: Mehrklassen-Emittent, gemeldet ist nur die Summe der Gattungen (NO_PIT_SHARE_COUNT) | P2 | bewusst zurückgehalten; Bestand je Gattung ist Arbeit in der SEC-Schicht |
| 14 | Qualitätskennzahlen (z. B. Eigenkapitalrendite) bei gemischten Einheiten eines Emittenten | P2 | Verhältnis innerhalb derselben Meldung; nicht am Börsenwert, dokumentiert |
| 15 | ADR, die in USD berichten: ADS-Verhältnis unbekannt, Börsenwert kann um das Verhältnis abweichen | P2 | kein lokaler Beleg für die Quote; dokumentiert |

Keine weiteren P0/P1 gefunden: Radar, Watchlist, Alerts, Frische, Performance und Datenschutz unten gemessen.

## 1a. Wirkung der Börsenwert-Korrektur (gemessen)

**market-cap-1.0.0** (nur ausstehende Aktien; Artefakt vorher `6d8028e` → nachher `572dead`):
MARKET_CAP_CHANGED 53 · MARKET_CAP_WITHHELD neu 17 (NO_PIT_SHARE_COUNT) · MARKET_CAP_ADDED 1 ·
VALUE_COVERAGE 2.591 → 2.584 · VALUE_CHANGED 74 · VALUE_WITHHELD 8.

| Titel | Börsenwert vorher → nachher | Value |
|---|---|---|
| JPM | 1.364,4 → 883,5 Mrd $ | 13 → 27 |
| IBM | 511 → 210 Mrd $ | |
| MCD | 385 → 164 Mrd $ | |
| COP | 286 → 152 Mrd $ | |
| AAPL, MSFT, NVDA, AMZN | unverändert | unverändert |
| GOOG, GOOGL, T, SO, AGNC | zurückgehalten (mehrere notierte Zeilen) | offen mit Grund |
| META | zurückgehalten (NO_PIT_SHARE_COUNT, Mehrklassen) | offen mit Grund |

Strategien: STRATEGY_MATCH_ADDED 5, REMOVED 4 (momentum-leader 208 → 209; garp 122 → 121, +2/−3;
value-momentum 183 → 184, +2/−1; übrige unverändert). Screener: kein Treffer mehr, der auf einem
Börsenwert aus ausgegebenen Aktien beruht (SHARE_COUNT_PROVENANCE_AUDIT: jüngster Wert „ausgegeben“ 0).

## 1b. Wirkung market-cap-1.1.0 – gleiche Währung (gemessen)

Artefakt vorher `572dead` → nachher `49c47ee` (erzwungene Materialisierung nach #442):
MARKET_CAP_WITHHELD neu 338, alle `REPORTING_CURRENCY_NOT_LISTING_CURRENCY` (lokale Vorhersage 338) ·
MARKET_CAP_CHANGED 0 · MARKET_CAP_ADDED 0 · VALUE_COVERAGE 2.584 → 2.566 · VALUE_CHANGED 92
(Perzentile verschieben sich, weil 338 verfälschte Werte aus der Vergleichsgruppe fallen) · VALUE_WITHHELD 18.

Zurückgehalten u. a.: CNF (vorher 3,0 Mrd statt ≈0,36), AMX (1.283 Mrd), BCH (3.888 Mrd), ASML, BABA –
je Emittent nach der Berichtswährung, keine Kürzel-Regel. Varonis (VRNS, eine Nebenkennzahl in AFN)
behält die Bewertung, weil nur die Bewertungseingaben zählen. Unverändert: JPM 883,5 Mrd/Value 27,
AAPL 50, MSFT 46, NVDA 59, AMZN 39; GOOG/GOOGL/T/SO/AGNC und META unverändert zurückgehalten.

Strategien: STRATEGY_MATCH_ADDED 2, REMOVED 3 (garp 121 → 120, −1; value-momentum 184 → 184, +2/−2;
übrige unverändert). Screener: kein Treffer beruht mehr auf einem Börsenwert in fremder Währung oder aus
ausgegebenen Aktien.

## 2. Bänder – BAND_SEMANTICS_VERDICT = C

Gemessen über 5.760 Titel (factor-evidence-v1, Stand 02.10.2026):

| Faktor | ≥ 90 „sehr stark“ | ≥ 75 | < 25 | p50 | p90 | p99 |
|---|---|---|---|---|---|---|
| Bilanz- & Ergebnisqualität | **0,0 %** | 2,0 % | 4,8 % | 52 | 68 | 76 |
| Wachstum | 1,9 % | 10,6 % | 9,7 % | 49 | 76 | 94 |
| Momentum | 3,7 % | 17,1 % | 17,4 % | 51 | 82 | 95 |
| Bewertung | 1,5 % | 12,7 % | 9,6 % | 52 | 78 | 91 |
| Risiko | 7,1 % | 25,5 % | 18,5 % | 55 | 87 | 98 |
| Profitabilität | 2,9 % | 17,1 % | 13,3 % | 52 | 81 | 93 |

Quality in allen vier Branchenvorlagen: ≥ 90 nie (generisch p99 77, Banken 74, REITs 75, Versicherer 76).

- **Scores sind keine Perzentile**, sondern gewichtete Mittel von Perzentil-Rängen der Kennzahlen
  (Referenz: das veröffentlichte Universum am Stichtag). Mitteln staucht zur Mitte – je mehr
  Kennzahlen, desto stärker (Quality).
- **Die Grenzen 90/75/45/25 stammen aus dem Vertrag (`ratingBands`) und tragen dort Perzentil-Labels**
  („Top 10%“, „Bottom quartile“) – gedacht für den Gesamtrang, der zurückgehalten ist.
  Auf Faktorebene sind dieselben Grenzen absolute Werte.
- **Die Oberfläche beschreibt das richtig** („feste Wertgrenzen … keine Anteile des Marktes; die
  Position im Markt ist eigens gezählt“); kein „Top 10 %“ ist für Faktoren sichtbar.
- **Urteil C:** Beschreibung (Vertragslabels) und Grenzen passen für Faktoren nicht zusammen, und die
  Wirkung ist je Faktor verschieden (Quality nie „sehr stark“, Risiko 7 %). Das ist kein eindeutiger Bug,
  sondern eine Methodikentscheidung → **Owner-Gate:** (a) absolute Grenzen behalten und
  Vertragslabels für Faktoren umbenennen, oder (b) Bänder je Faktor als Perzentil der
  Faktorverteilung. Nichts wurde neu kalibriert.

## 3. Qualitätslabel „Bilanz- & Ergebnisqualität“

| Titel | Vorlage | Wert | verwendete Kennzahlen |
|---|---|---|---|
| NVDA | generisch | 43 | Accruals, Eigenkapitalquote, FCF-positive Jahre, Margenstabilität |
| AAPL / MSFT | generisch | 62 / 62 | dto. |
| JPM / WFC | Banken | 55 / 54 | Eigenkapitalquote, ROA-Stabilität 5J, Gewinnjahre (+ Dividendendeckung) |
| O / PLD | REIT | 67 / 61 | Eigenkapitalquote, Dividendendeckung, ROA-Stabilität, Gewinnjahre |
| AGNC | REIT (Hypotheken) | 27 | dto. |
| MRNA / VRTX | generisch (Biotech) | 63 / 59 | generisch |
| RIVN / LCID | generisch (kaum Umsatz) | 38 / 17 | generisch (+ Nettoverschuldung) |

Das Label passt zu den Kennzahlen jeder Vorlage (Bilanz + Ergebnisqualität). Die Methodik-Seite
erklärt, warum eine sehr profitable Aktie hier schwach sein kann; die Branchenvorlage steht auf der
Aktienseite. Keine Änderung nötig.

## 4. Radar, Watchlist, Alerts (gemessen)

- **Radar** (Stand 02.10.2026, 689 Ereignisse): RADAR_DUPLICATES 0 (dedupeKey und Titel+Typ),
  RADAR_STALE 2 (bereits gemeldet, jetzt so gekennzeichnet), RADAR_METHOD_REBASE 0 sichtbar
  (Strategie 102, Faktor 117 … Übergänge als METHOD_REBASE unterdrückt, `userVisible:false`).
  RADAR_EVENTS_TRUE_NEW 687. Sortierung `radar-priority-1.0.0` offen gelegt; der historische
  Vorteil sortiert bewusst nicht (klein und neuere Daten nicht eindeutig).
- **Watchlist** (10 Titel: NVDA, AAPL, MSFT, JPM, GOOG, AMD, META, DXPE, WFC, O): WATCHED_EVENTS_TOTAL 4,
  RELEVANT 4, STALE 0, DUPLICATE 0; 9 Verlaufseinträge, 10 von 10 mit nächster Bedingung. Der Verlauf
  kommt aus dem Titel-Shard (Zustand, Verlauf, Ereignisse), nicht aus dem gefilterten Gesamtradar.
- **Alerts:** alle 21 Felder des Vertrags `quant-alert-event-3.0.0` an allen 689 Ereignissen,
  keine Nullwerte in dedupeKey, effectiveAt, detectedAt, validUntil (7 Tage), trustState.

## 5. Frische

LATEST_SESSION 02.10.2026 (Freitag; heute Montag vor Börsenbeginn) · STORE_ASOF / Faktoren 02.10.2026
(Lauf 03.10.) · PRODUCT_ASOF (Faktor-Evidenz, Setups, Radar) 02.10.2026 · BACKTEST_ASOF (Signalstudie)
Daten bis 02.10.2026, gerechnet 04.10. · DEPLOY_ASOF 05.10.2026 03:59 UTC (Produktion `49c47ee`,
Pages-Lauf 37261090748: Smoke über das gebaute und das zugangsgeprüfte Release grün).

**Performance (gebautes Release, gleiche Kompaktierung wie der Release-Lauf):** 8 von 8 Budgets ohne
Anhebung bestanden (Home 1,73 MB/21 Anfragen, Screener 6,47 MB/28, Aktie 5,52 MB/39), 88 Prüfungen,
0 Befunde, 76 Seiten ohne Barrierefreiheits-Verstoß.

## 6. Demo in 90 Sekunden

1. **Home** – Claim, vier Versprechen, „Heute bei Quant“: 102 neue Setups, 9 bestätigt,
   140 neue 52-Wochen-Hochs, 140 Aktien mit messbarem historischen Vorteil (Stand 02.10.).
2. **Radar** – Karte LQDT: „Setup bestätigt“, Einstieg, Ungültig-Marke, Bestätigungsbedingung.
3. **Aktie** NVDA – „Was ist jetzt wichtig?“: neues 52-Wochen-Hoch, Setup entsteht, 2 von 5 Bedingungen offen.
4. **Setup** – Interessant ab / Bestätigt, wenn / Ungültig unter / Zielzone, als Szenario.
5. **Historische Evidenz** – A: bei NVDA früher 70 % höher (beobachtet, ohne Markt);
   B: „Neues 52-Wochen-Hoch“ marktweit 58,3 % gegen Markt 56,9 % (+1,4 Pp).
6. **Base Rate** – Balken Signal gegen Markt, „kleiner historischer Vorteil, neuere Daten nicht eindeutig“.
7. **Trust** – Checkliste: Dividenden ✓, kein Blick in die Zukunft ✓, verschwundene Firmen ⚠ …
8. **Beobachten** – Stern; Quant verfolgt Setup-Wechsel, Evidenz, Strategie, Risiko.

## 7. Drei Nutzer

| | Nutzen | Risiko | Vertrauen | Nächste Aktion |
|---|---|---|---|---|
| Anfänger | Claim + „Was ist jetzt wichtig?“ | „Ungültig unter“, Rückgang zuerst als Satz | ein Wort (eingeschränkt) + ein Satz | Beobachten, Benachrichtigen |
| Ambitioniert | Verlauf je beobachteter Aktie, nächste Bedingung | Zielzone + Ungültig-Marke als Szenario | Checkliste mit offenen Punkten | Radar-Filter „beobachtet“ |
| Trader | Signal gegen Markt mit Band, unabhängige Fälle | Drawdown typisch/schwerster | Profi-Ebene: Zeitabschnitte, Prüfzeiträume, Parameter | Backtesting je Regel |

## 8. Vertriebsstory

- **Ein Satz:** Quant zeigt dir jeden Tag, bei welchen Aktien sich etwas verändert – und wie oft das
  früher besser lief als der Markt.
- **30 Sekunden:** Tausende Aktien, tausende Kennzahlen – aber was ist heute anders, und war so etwas
  früher überhaupt besonders? Quant prüft täglich über 6.000 US-Aktien nach festen Regeln, meldet
  jede Veränderung mit Auslöser und nächster Bedingung und vergleicht sie mit dem ganzen Markt in
  denselben Wochen. Und es sagt offen, wo die Evidenz endet.
- **2-Minuten-Demo:** der Ablauf in Abschnitt 6.
- **4 Versprechen:** Sehen, was heute neu ist · Verstehen, warum es zählt · Prüfen, ob es früher ein
  Vorteil war · Wissen, wie belastbar das ist.
- **5 Beweise:** (1) jede Trefferquote mit Markt-Quote derselben Wochen; (2) Dividenden eingerechnet
  (eigene Gesamtrendite); (3) kein Blick in die Zukunft, Setup-Stände exakt nachgerechnet (1.034
  geprüft, 0 Abweichungen); (4) Radar ohne Dubletten, Methodikwechsel nicht als Ereignis;
  (5) lieber kein Wert als ein falscher (Börsenwert, Mehrfachgattungen, Nicht-Aktien zurückgehalten).
- **5 Grenzen:** nichts zertifiziert; der größte gemessene Vorteil ist klein; verschwundene Unternehmen
  erst ab 2016 und nur als Vergleich; nur US-Aktien; Benachrichtigungen werden noch nicht versendet.

## 9. Premium-Hypothese (keine Preisentscheidung)

| Funktion | Premium-Signal | Begründung |
|---|---|---|
| Radar + Beobachten + Verlauf | hoch | täglicher Anlass, persönlich, nicht anderswo gratis |
| Historische Evidenz gegen den Markt | hoch | Alleinstellungsmerkmal, Beweis statt Behauptung |
| Backtesting je Regel (Profi-Ebene) | mittel–hoch | für Trader, erklärungsbedürftig |
| Benachrichtigungen | hoch, sobald Versand steht | heute nur Auswahl auf dem Gerät |
| Strategie-Treffer | mittel | gut für Einstieg, historisch noch nicht getestet |
| Screener | niedrig (Basis) | verbreitet, eher Einstiegsfunktion |

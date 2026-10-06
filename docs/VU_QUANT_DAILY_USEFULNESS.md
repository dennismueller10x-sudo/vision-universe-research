# Quant Daily Usefulness (01.10.2026)

Owner-Auftrag: Quant soll nicht nur analysieren, sondern täglich zeigen, welche Aktien jetzt interessant werden. Dazu gehört:
- warum sie interessant werden;
- welches Setup vorliegt und welche Bedingungen fehlen;
- wo Einstieg, Invalidation und Ziele liegen;
- was früher in derselben Lage geschah;
- wann sich ein Zustand ändert.

Ergebnis gemessen (`quant/data/product/decision-intelligence-v1.json`): **QUANT_DECISION_INTELLIGENCE = PASS**.

## 1. Was neu ist

| Baustein | Datei | Was er tut |
|---|---|---|
| Radar-Vertrag | `quant/engines/quant-radar.js` (quant-radar-1.0.0) | Ereignistypen, Alert-Event-Schema (quant-alert-event-1.0.0), offen gelegte Sortierregel (radar-priority-1.0.0), Lebenszyklus-Stufen |
| Radar-Build | `scripts/quant/build-quant-radar.mjs` | Ereignisse aus veröffentlichten Ständen, Karten, Setup-Lebenszyklus |
| Evidenz-Status | `scripts/quant/build-evidence-status.mjs` | Stand der vier Evidenzarten, Gates gemessen |
| Messung | `scripts/quant/measure-decision-intelligence.mjs` | Kennzahlen und Beispieltitel |
| Rückblick-Engine | `quant/engines/historical-cases.js` 1.1.0 | neu: 1 Monat, Anteil im Plus, Mittelwert, schlimmster Rückgang, Chance/Risiko, Verteilung, Evidenzstufe |
| Dienste | `getQuantRadar`, `getSetupLifecycle`, `getEvidenceStatus` | lesen nur die Artefakte und prüfen jedes Ereignis gegen den Alert-Vertrag |
| Oberfläche | Home, `#/radar`, Aktienseite, Methodik | siehe Abschnitt 4 |

Alle drei Schritte laufen täglich in `product-intelligence-materialization.yml`.

## 2. Radar: nur bestehende Engine-Zustände

Ein Ereignis ist immer der Unterschied zwischen zwei veröffentlichten Ständen derselben Engine. Einzige Ausnahme ist das 52-Wochen-Hoch; dort zählt der veröffentlichte Tageswert selbst.

| Typ | Quelle | Stand |
|---|---|---|
| SETUP_CONFIRMED, SETUP_NEW, SETUP_WEAKENED | setup-observation-history (letzte zwei Stichtage) | offen |
| SETUP_INVALIDATED | Pfadzustand der Setup-Engine | **geschlossen**: PATH_DEPENDENT_STATES_NOT_ACTIVATED; wird nicht aus eigener Rechnung ausgerufen |
| MOMENTUM_IMPROVED / _DETERIORATED, TREND_UP / _DOWN | technical-signals-v1 (ENTERED/EXITED) | offen |
| STRATEGY_MATCH_NEW / _LOST | strategy-index-v1 historicalEvidence | offen |
| FACTOR_CHANGED, RISK_RISING | factor-evidence-history: Stufenwechsel ab 3 Punkten; RISK_RISING ist der Abstieg des Risiko-Faktors | offen |
| NEW_52W_HIGH | market factors `newHigh52w` | offen |
| PATTERN_MATCH_NEW | pattern-match-v1 | **geschlossen**: Historie beginnt (`radar-history/pattern-holds/`); öffnet sich mit dem zweiten Stand |

**Sortierung.** Die Karten werden lexikografisch nach benannten Schlüsseln geordnet; der erste Unterschied entscheidet:
1. Ereignisart
2. Anzahl positiver Quellen
3. Setup-Reife
4. historische Evidenz
5. Datenvollständigkeit
6. Kürzel

Es gibt keine Gewichte und keine Gesamtnote.

**Unruhe.** 72 % der Setup-Wechsel kehren sich beim nächsten Stand um (202 von 281, Aktivierungs-Gate der Setup-Engine). Das steht auf der Radar-Seite.

**Alert-Vertrag.** Jedes Ereignis trägt `securityId`, `ticker`, `eventType`, `occurredAt`, `previousState`, `currentState`, `explanation`, `evidence` und `nextCondition`. Ein Verstoß bricht den Build ab. Die Zustellung ist `NOT_CONFIGURED`, Push, E-Mail und App sind also später anschließbar.

## 3. Vier Arten historischer Evidenz, getrennt

| Art | Stand | Grund / Gate |
|---|---|---|
| A Rückblick (dieselbe Aktie) | veröffentlicht | Zahlen ab 10 abgeschlossenen Fällen je Zeitraum, „breit“ ab 30. Abdeckung 6 Monate: 2.068 von 5.872 Titeln; breit: 627 |
| B Marktmuster | veröffentlicht | nur ROBUST-Befunde (Out-of-Sample-Lift > 1, Benjamini-Hochberg): 69 von 114 |
| C Strategie-Backtest | zurückgehalten | historische Index-Zugehörigkeit 2 Stichtage (nötig 24), keine Überlebenden-Kontrolle, keine Gesamtrendite, keine Indexreihe, kein auditierter Lauf |
| D Setup-Backtest | zurückgehalten | 4 Setup-Stichtage über 18 Tage (nötig 12 über 90), effektive Stichprobe 0 (nötig 30), Umkehranteil 72 % (nötig < 20 %), Methodik verbietet Ausgangszahlen bis zur Zertifizierung |

Kennzahlen: `BACKTEST_ELIGIBLE_RULES` = 69, `BACKTEST_WITHHELD_RULES` = 62 (45 nicht robuste Muster, 8 Strategieprofile, 9 Setup-Regeln).

## 4. Oberfläche

- **Home:** „Heute bei Quant“ steht direkt nach dem Hero:
  - Radar-Kennzahlen: neue Setups, bestätigte Setups, Aktien, die sich verbessern, Risiko steigt, neues 52-Wochen-Hoch, neu in einer Strategie;
  - die sechs vordersten Karten;
  - darunter die beobachteten Aktien.

  Danach folgen Quick Access und die Strategien.
- **`#/radar`:**
  - Filter: Setups, Strategien, Momentum & Trend, 52-Wochen-Hoch, Faktoren & Risiko, Beobachtet;
  - Sortierregel, Unruhe-Hinweis und Quellen mit Stichtag;
  - geschlossene Typen mit Grund.
- **Aktienseite** in der Reihenfolge des Auftrags:
  1. Kurs und Chart
  2. „Was ist jetzt wichtig?“ (Radar-Ereignisse, Setup seit wann, nächster Schritt, Rückblick in einem Satz)
  3. Setup & Trigger („Interessant ab“, „Bestätigt wenn“, „Ungültig unter“, Stop, Zielzonen, Chance/Risiko, was fehlt und was den Zustand trägt, Lebenszyklus-Leiste)
  4. Historisch getestet (Kacheln, Zeitstrahl Heute → 1 M → 3 M → 6 M → 12 M, Verteilung, Vertrauenskontext, Marktmuster, gemessener Backtest-Stand)
  5. Pro / Contra
  6. Faktoren und Veränderung
  7. Anlagestil
  8. Technik
  9. Daten und Grenzen

  Abwärtsszenarien zeigen „Ungültig über“ und keinen Einstieg.
- **Methodik:** „Acht Begriffe, sauber getrennt“ (Faktor, Veränderung, Setup, Anlagestil, Rückblick, Marktmuster, Backtest, Radar). Das Thema „Historical Replay & Muster“ zeigt die vier Evidenzarten mit ihren Gates.
- **Beobachten** ersetzt „Merken“. Die Watchlist bleibt ein Beobachtungs-, kein Portfolio-Produkt.

## 5. Messung (Stand 29.09.2026)

| Kennzahl | Wert |
|---|---|
| RADAR_EVENTS_TOTAL | 915 |
| SETUPS_TRACKED | 1.467 (Titel mit Setup-Stufe ≥ Beobachten) |
| SETUP_TRANSITIONS | 1.436 über 4 Stichtage, 226 zum letzten Stand |
| HISTORICAL_REPLAY_COVERAGE | 5.334 Titel mit Fällen, 2.068 mit Zahlen nach 6 Monaten |
| WATCHLIST_TRACKABLE_TITLES | 5.872 |
| ALERT_READY_EVENTS | 915 (0 Vertragsverstöße) |

Ereignisse nach Typ:

| Typ | Anzahl |
|---|---|
| neue Setups | 54 |
| bestätigte Setups | 5 |
| Setup nicht mehr erfüllt | 109 |
| neu in einer Strategie | 81 |
| Strategie verlassen | 19 |
| neues 52-Wochen-Hoch | 117 |
| Momentum verbessert | 127 |
| Momentum verschlechtert | 79 |
| über der langfristigen Linie | 57 |
| unter die langfristige Linie | 123 |
| Faktor-Stufenwechsel | 143 |
| Risiko steigt | 1 |

Stichprobe (über dieselben Dienste wie die Oberfläche):

| Titel | Art | Setup | Szenario-Marken | Rückblick |
|---|---|---|---|---|
| NVDA | Großwert | Setup entsteht | Einstieg 216–220, aufwärts | 3 Fälle, zurückgehalten |
| AAPL | Großwert | Setup entsteht | 317–320, aufwärts | 32 Fälle, breit |
| MSFT | Großwert | Beobachten | 419–434, aufwärts | 6 Fälle, zurückgehalten |
| JPM | Bank | Setup entsteht | 325–331, aufwärts | 58 Fälle, breit |
| GOOG | Großwert | kein Setup | – | 38 Fälle, breit |
| AMD | Großwert | Setup entsteht | 540–563, aufwärts | 11 Fälle, dünn |
| META | Großwert | Setup entsteht | 653–687, aufwärts | kein Vergleichsfall |
| DXPE | Small Cap | **Setup bestätigt** (Radar) | 184–186, aufwärts | 22 Fälle, dünn |
| ABCB | Regionalbank | kein Setup | Abwärtsszenario | 26 Fälle, dünn |
| O | REIT | kein Setup | Abwärtsszenario | 5 Fälle, zurückgehalten |
| CRWV | junge Aktie | kein Setup | – | nicht in der Musterabdeckung |
| AACI | datenarm | kein Setup | – | 1 Fall, zurückgehalten |
| SPY | ETF | nicht im Setup-Universum | – | – |

## 6. Grenzen

- Die Setup-Historie hat 4 Stichtage mit einer Lücke vom 10.09. bis 24.09. „Seit“ ist eine Untergrenze, wenn die Folge am ersten Stichtag beginnt.
- Die Pfadzustände (Trend läuft, Risiko steigt, Ungültig, Ausstieg) bleiben geschlossen, bis das Aktivierungs-Gate besteht.
- Der Produktstand liegt eine Sitzung hinter den Marktfaktoren. Das 52-Wochen-Hoch ist vom 29.09., die Setups sind vom 28.09.; jede Karte trägt ihr Datum.
- Discover ist unverändert. Es gibt kein neues Portfolio-Produkt, keine Orderausführung, keine neuen Faktoren und keine neuen Datenquellen.

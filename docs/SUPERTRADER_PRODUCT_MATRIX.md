# Supertrader — Produktmatrix (Stand 01.10.2026, Kursdaten bis 28.09.2026)

Ausgangslage vor dieser Runde:
- PR #315 (Ein-/Ausstiegsregeln) ist gemergt.
- Vier Methoden liefen live.
- CAN SLIM, Piotroski und Donchian/Turtle waren reine Namenskarten („Research in progress“) ohne Regeln, Daten oder Kandidaten.
- Die Backtest-Seite bestand fast nur aus gesperrten Kacheln.

## Matrix

**Spaltenlegende:**
- *Heute nutzbar* = Kunde sieht passende Aktien mit Begründung.
- *Ein/Aus* = vorbereitete, bestätigte und protokollierte Ein- und Ausstiege.
- *Historie* = historische Prüfung.

| Methode | Heute nutzbar | Ein/Aus | Historie | Mit vorhandenen Daten umsetzbar | Konkret fehlende Daten / Quellen |
|---|---|---|---|---|---|
| Momentum Breakout (Kullamägi, Daily) | ja (2 vorbereitet) | ja | nicht geprüft | ja | Opening-Range-Original braucht Intraday-Historie; Backtest: delistete Titel, damaliges Universum |
| Weinstein Stages | ja (2 vorbereitet) | ja | nicht geprüft | ja | Wochenvolumen nur ~1 Jahr; Sektorindizes |
| Darvas Boxes | ja (0 A, 157 B) | ja | nicht geprüft | ja | Pyramiding nicht simuliert; Backtest-Bausteine wie oben |
| Minervini VCP | ja (heute 0 Setups) | ja (Ausstieg nur VU-Hilfsregel) | nicht geprüft | ja | Minervinis Verkaufsregeln nicht mechanisch belegt |
| **Donchian / Turtle (neu)** | **ja (220 vorbereitet)** | **ja** | **explorativ (Wochen-Pilot)** | ja — reine Kursmethode | Unit-Sizing/Pyramiding nicht simuliert; Validierung braucht delistete Titel + damaliges Universum |
| **CAN SLIM (neu, Teilprüfung)** | **7 Teiltreffer** | nein | nicht geprüft | 5 von 7 Kriterien (C, A, N, L, M) | **I** fehlt (keine Fondsbestände je Aktie über Quartale); EPS-Historie split-inkonsistent → Nettogewinn als Ersatz; kein Basisausbruch gerechnet; Originalbuch nicht inhaltlich geprüft |
| **Piotroski F-Score (neu, Teilprüfung)** | **4 Kandidaten** | nein | nicht geprüft | 8 von 9 Signalen | Umlaufvermögen + kurzfristige Verbindlichkeiten (Liquiditätssignal); Erstmeldungen statt Restatements |
| Greenblatt Magic Formula | nein | nein | nicht geprüft | nein | Umlaufvermögen, kurzfristige Verbindlichkeiten, Sachanlagen (Return on Capital); PIT-Daten nur für 5 Titel |
| Kullamägi Episodic Pivot | nein (Namenskarte) | nein | — | nein | historische News-/Katalysator-Zeitstempel, Konsensschätzungen |
| Kullamägi Parabolic Short | nein (Namenskarte) | nein | — | nein | Borrow/Locate, Gebühren, Intraday-Ausführung |
| Weitere Market-Wizards-Modelle | nein (Namenskarte) | nein | — | nein | Quellen nicht gelesen |

Namenskarten erscheinen nur gesammelt unter „In Vorbereitung“. Sie werden nicht als Strategiewelt dargestellt.

## CAN SLIM je Kriterium

| Kriterium | Status | Quelle / Datenfeld | Heute erfüllt |
|---|---|---|---|
| C — Quartalsgewinn ≥ +25 % | prüfbar (Ersatz: Nettogewinn) | SEC `quarterly.net_income`, 8 Quartale | 686 von 2.179 (450 ohne Daten) |
| A — 3 Jahre Wachstum ≥ 25 % p. a. | prüfbar (Ersatz: Nettogewinn) | SEC `annual.net_income` | 144 von 2.419 |
| N — neues Hoch | nur Kursteil | 52-Wochen-Hoch | 914 von 2.629 |
| S — Angebot/Nachfrage | nur Anzeige | Aktienzahl, Volumen 20/50 | — |
| L — Marktführer | prüfbar (VU-RS, kein IBD-RS) | RS-Perzentil | 574 von 2.629 |
| I — Institutionen | **nicht prüfbar** | nur Top-100-Fonds, ein Quartal | — |
| M — Marktrichtung | prüfbar (Ersatz für Follow-Through-Days) | SPY-Tagesschlüsse | erfüllt |

Teiltreffer, die alle fünf prüfbaren Kriterien erfüllen: DELL, CHEF, DXCM, FTNT, ANET, BOW, PNTG.
Keiner dieser Teiltreffer ist ein CAN-SLIM-Signal.

## Drei getrennte Aussagen (Kundensprache)

Jede Methode zeigt drei getrennte Aussagen:
- **Regel:** Läuft live / Teilprüfung / Daten fehlen / In Vorbereitung.
- **Quellen:** zum Beispiel Original + VU-Umsetzung, Sekundärquellen + Ersatzgrößen, Ausstieg nicht belegt.
- **Historie:** Nicht geprüft / Explorativ getestet. „Validiert“ gibt es derzeit nicht.

Gate-Codes und Versionsnamen stehen nur in den Methodendetails.

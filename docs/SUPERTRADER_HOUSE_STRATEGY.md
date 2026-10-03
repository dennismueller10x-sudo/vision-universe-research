# VU Hausstrategie (HS1): Verfahren

Stand: 03.10.2026. Dieses Dokument beschreibt nur das Verfahren. Kennzahlen stehen hier nicht; sie liegen verschlüsselt auf dem Zweig `claude/vu-house-strategy-results`.

## Ziel

- Eine eigene Vision-Universe-Strategie als Modelldepot, die den S&P 500 inklusive Dividenden (SPY) schlägt.
- Die Messlatte gilt nach Kosten, mit delisteten Titeln und außerhalb der Daten, an denen die Strategie entwickelt wurde.
- Der Backtest ist nur die Hypothese. Nachweis ist erst der eingefrorene Vorwärtslauf, bei dem jede Monatsentscheidung vor der Ausführung mit Zeitstempel committet wird.

## Abgrenzung

| Ebene | Inhalt |
|---|---|
| Super Trader | Nachbau bekannter Trader-Methoden (Minervini, Darvas, Turtle, …) |
| Quant | Faktoren, Score, Screener, Strategy Lab für eigene Regeln |
| **Hausstrategie** | eine eigene, eingefrorene VU-Strategie mit Modelldepot |

Die Hausstrategie nutzt dieselbe Datenstrecke wie die Super-Trader-Validierung (`loadPitData`):
- Universum `US_PIT_2016_A` mit delisteten Listings;
- Gesamtrendite aus Rohschluss, Dividende und Split selbst gerechnet;
- SEC-Quartalswerte zum Datum der ersten Einreichung.

So bleibt es bei einer Datenstrecke und denselben Kontrollen.

## Ausgangslage (ehrlich)

- Alle bisher geprüften Super-Trader-Methoden blieben 2016–2026 ohne belegten Vorteil gegenüber SPY (DECISION-R11/R12).
- 2016–2026 dominierten große Technologiewerte. Gleichgewichtete Auswahlen hatten deshalb Gegenwind.
- Delistete Titel gibt es in der Quelle erst ab 2015/16 vollständig. Ein survivorship-freier Test ist damit nur für etwa zehn Jahre möglich.

## Protokoll

Festgelegt in `scripts/supertrader/house/PREREGISTRATION-HS1.json`, eingefroren vor dem ersten Lauf.

- **Faktoren:** nur aus der veröffentlichten Literatur, nicht an diesen Daten entwickelt:
  - Momentum 12-1;
  - Momentum je Volatilität;
  - niedrige Volatilität;
  - Nähe zum 52-Wochen-Hoch;
  - Gewinnüberraschung (SUE);
  - Umsatzwachstum.
- **Versuchsbudget:** 12 vorab benannte Versuche. Jeder gerechnete Versuch zählt für die Deflated Sharpe Ratio und die PBO.
- **Entwicklung 2016–2021:** Die Auswertung entfernt alle Kurs- und Fundamentaldaten nach dem 31.12.2021, bevor sie rechnet. Das ist eine Code-Sperre und durch einen Unit-Test geprüft.
- **Auswahl:** der Versuch mit der höchsten Information Ratio gegenüber SPY bei höchstens 300 % Umschlag pro Jahr.
- **Holdout 2022–2026:**
  - läuft genau einmal;
  - nur mit `FROZEN-HS1.json`, das die Hashes von Präregistrierung und Engine prüft;
  - der gewählte Versuch steht vorher fest und kann nachträglich nicht getauscht werden.
- **Kriterien H1–H5:**
  - Holdout-Überrendite unter −30 % Delisting-Annahme, mit doppelten Kosten und unter der Distress-Annahme;
  - positive Überrendite in der Entwicklung;
  - PBO < 0,5.

  „Statistisch belastbar“ heißt es erst bei einer Deflated Sharpe Ratio ≥ 0,95.
- **Kontrollen:**
  - gleichgewichtetes Universum;
  - 20 Zufallsauswahlen;
  - nur überlebende Titel (Größe des Survivorship-Effekts);
  - Abstimmung von Endwert und Positionen;
  - Look-ahead-Test mit vergifteten Zukunftsbalken.

## Ablauf

| Marke in der Commit-Nachricht (Zweig `claude/**`) | Lauf |
|---|---|
| `[house:dev-smoke]` | technischer Probelauf, 600 Reihen |
| `[house:dev]` | Entwicklungszeitraum, alle Reihen |
| `[house:holdout]` | Holdout, nur eingefroren |

Workflow: `.github/workflows/supertrader-house.yml`. Ergebnisse werden für zwei Schlüssel verschlüsselt:
- Eigentümer: `validation/results-public-key.pem`;
- Arbeitssitzung: `house/session-public-key.pem`.

Logs zeigen nur Zählwerte.

## Veröffentlichung

- Öffentlich erscheinen nur Entscheidungen ohne Kennzahlen, bis die Rechte an abgeleiteten Kennzahlen (Tiingo) geklärt sind.
- Ein späteres Modelldepot zeigt Positionen und Regeln nach dem Muster von VU Trendfolge 52W.
- Es ist eine regelbasierte Modellbeobachtung, keine Anlageempfehlung.

## Läufe

| Lauf | Ergebnis (ohne Kennzahlen) |
|---|---|
| dev-smoke (Run 37132495954, 600 Reihen) | Technisch bestanden: alle 12 Versuche und Kontrollen gerechnet, Endwert = Barmittel + Positionen (Abweichung 0), Entwicklungssperre aktiv (Zeitraum endet 2021-12-31). |

**Bekannte Eigenschaft (keine Regeländerung):** Die Vorlaufzeit beginnt am 02.01.2015; mit der Mindesthistorie von 273 Handelstagen ist zum ersten Stichtag (29.01.2016) noch kein Titel zulässig. Das Depot ist deshalb im Februar 2016 vollständig in bar, während SPY ab dem 29.01.2016 zählt. Der Effekt wirkt gegen die Strategie.

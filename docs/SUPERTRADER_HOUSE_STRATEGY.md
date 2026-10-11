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
| dev HS1 (Run 37132733753) | Alle 12 gleichgewichteten Versuche unter SPY → TESTED_NO_EDGE, Holdout nicht geöffnet (DECISION-HS1.json). |
| dev HS2 (Run 37134594360) | Überrendite stammt aus dem Größenersatz, nicht aus der Faktorneigung; PBO > 0,5 → TESTED_NO_EDGE, Holdout nicht geöffnet (DECISION-HS2.json). |
| SEC r13 (Run 37136875082) | Aktienanzahl zum Einreichungsdatum für 7 242 von 9 533 Listings (dei 6 724, Durchschnittsaktien 518); Grundlage für HS3. |
| HS3 dev (Run 37137161220), D1 (37139551895), D2 (37142173224) | Datenprüfung G0 jeweils verfehlt (ADR, Auslandsemittenten, falsch skalierte Aktienzahlen); Nachträge D1–D3 vor dem jeweils nächsten Lauf registriert. |
| HS3-D3 dev (Run 37144385411) | G0 bestanden; M03 gewählt und eingefroren (FROZEN-HS3-D3.json). Vorsprung klein, statistisch nicht belastbar. |
| **HS3-D3 Holdout (Run 37146984920)** | **TESTED_NO_EDGE**: im Holdout 2022–2026 praktisch gleichauf mit SPY. Holdout verbraucht. Kein Modelldepot (DECISION-HS3-D3-HOLDOUT.json). |

## Ergebnis und Lehren (Stand 03.10.2026)

- **Kein Versuch hat den S&P 500 belastbar geschlagen.** Das gilt für alle 43 gezählten Versuche, gleichgewichtet wie indexnah, auf echten Daten mit Delistings, nach Kosten.
- **Gleichgewichtete Faktorportfolios** lagen 2016–2021 deutlich hinter SPY. Ursache ist die Gewichtung gegen einen kapitalgewichteten Index.
- **Indexnahe Faktorneigung** bildet SPY sehr genau ab; der Faktorbeitrag liegt im Bereich von wenigen Zehntelprozent p. a. und ist von null nicht zu unterscheiden.
- **Datenqualität entscheidet:** Ohne Point-in-Time-Marktkapitalisierung entstehen scheinbare Vorsprünge (HS2), die allein aus dem Größenersatz stammen. Die Datenprüfung G0 hat drei Datenfehler gefunden, bevor ein Ergebnis zählte.
- **Offene Datenlücke:** Mehrgattungs-Emittenten ohne Aktienzahl in companyfacts (u. a. Alphabet, Berkshire, Visa, Mastercard).
- **Weiterer Weg:** Neue Hypothesen nur mit eigener Präregistrierung und Nachweis über einen eingefrorenen Vorwärtslauf, da der Holdout verbraucht ist.
| HS4 explorativ (Run 37182469897) | Volumenprofil verbessert die Auswahl gegenüber gleicher Regel ohne Volumen; gewählter Versuch über den Gesamtzeitraum vor SPY, aber nur dank 2024–2026 → EXPLORATORY_NO_EDGE (DECISION-HS4.json). |
| **HS4-V03 Test 2008–2015 (Run 37492427151)** | **OOS_NOT_CONFIRMED** (DECISION-HS4-OOS2008.json). Ohne SEC-Aktienzahlen vor 2009 war das Universum bis Mitte 2009 leer; das Depot war in der Finanzkrise zwangsweise in bar. Ab Juli 2009 liegt V03 hinter SPY, und dieselbe Regel ohne Volumen liegt vor V03. Der Volumenbeitrag aus HS4 wiederholt sich nicht. |

**Lehre aus dem Test 2008–2015:** Eine Überrendite, die aus einer Bargeldphase stammt, muss zuerst auf Datenverfügbarkeit geprüft werden. Künftige Präregistrierungen messen deshalb ab dem ersten investierten Monat oder verlangen eine Mindestbelegung des Universums.

# Blinder KI-Backtest 2016–2026: Bericht

**Forschung, nicht zertifiziert.** Protokoll [BLIND_PROTOKOLL.json](BLIND_PROTOKOLL.json) mit [Ergänzung 1](BLIND_ERGAENZUNG_1.json) (Prompt v2), Pakete `blind/packets.json` (Lauf 42228564599), Entscheidungen `blind/picks.json`, Auflösung im Lauf 42233759641. Zahlen nur versiegelt (`blind/blind-result.sealed.owner.json`). Das Repository enthält keine Rendite- oder Risikokennzahl.

## Ablauf

1. **Pakete:** 129 Monate, je 50 zufällig gezogene Kandidaten aus dem liquiden Universum, mit delisteten Titeln. Anonymisiert: kein Ticker, kein Name, kein Datum, keine Branche im Klartext. Kurse als 52-Wochen-Pfad relativ zum Markt, Kennzahlen als Dezile. Die Zuordnung liegt nur im privaten Eimer.
2. **Erkennungstest (vor den Entscheidungen): bestanden.** Geprüft wurden 20 Pakete mit zwei eigenen Subagenten. Das Jahr wurde in 20 % der Pakete exakt erraten (Grenze 25 %), der mittlere Jahresfehler lag bei 3,35 Jahren (Grenze mindestens 2,0), Firmen wurden in 0 von 1.000 Fällen erkannt (Grenze 2 %). Einschränkung: Marktphasen mit klarem Muster wie der Corona-Einbruch 2020 sind teilweise erkennbar.
3. **Entscheidungen:** 10 Subagenten im Claude-Abo, keine API, je 12 bis 13 Pakete. Alle 129 Antworten waren im ersten Versuch gültig, im Schnitt mit 10 Titeln (6 bis 14). Offenlegung: 3 der 10 Subagenten haben statt eines Einzelurteils je Paket eine selbst gewählte feste Bewertungsformel angewandt (Feld `method` in `picks.json`).
4. **Auflösung:** Ledger wie E3/H mit Kosten, Spread und Endwerten delisteter Titel, gegen die SPY-Gesamtrendite.

## Urteil

- **Das KI-Depot schlägt den S&P 500 nicht** (study.cjs#verdict: „schlägt nicht“, auch roh unter SPY). Mit DQ-K5 bleibt das Urteil gleich.
- **Gegen die Zufallsbasis**, also ein gleichgewichtetes Depot aller 50 Kandidaten desselben Monats, liegt die KI-Auswahl vorn. Der Vorsprung ist mit p ≈ 0,16 nicht signifikant.
- **Kosten:** Die monatliche Neuauswahl erzeugt einen sehr hohen Umschlag. Die Kosten fressen einen großen Teil des Vorsprungs gegenüber der Zufallsbasis.

## Bekannte Mängel

- Paket P25d4ee6191 (1 von 129) hat einen Ausreißer im Marktpfad (`blind/recognition.json`). Er bleibt nach Protokoll unverändert.
- Die Kandidaten werden aus dem ganzen liquiden Universum gezogen, also überwiegend aus kleinen Werten. SPY ist dagegen ein Großwerte-Index. Die Zufallsbasis zeigt diesen Unterschied.
- Wissen des Sprachmodells über die Marktgeschichte lässt sich nicht ganz ausschließen. Der Erkennungstest begrenzt es, beweist aber nicht, dass es fehlt.

## Vorwärts

Dieselbe Regel (Prompt v2, anonymes Paket) läuft unverändert als KI-Depot A ab dem 06.11.2026 (`ledger-A.jsonl`).

# Supertrader — interner Datentest mit delisteten Listings (Methode)

Stand: 01.10.2026. Dieses Dokument beschreibt nur das Verfahren. **Ergebnisse und Kennzahlen stehen hier nicht.** Das Repository ist öffentlich; sie liegen nur verschlüsselt vor (siehe „Ablage“).

## Zweck

- Ein historisch korrektes US-Aktienuniversum ab 2016, einschließlich der seitdem delisteten Listings.
- Darauf der erste belastbare Test der Donchian-Regel v1.1.0.
- Freigabe des Eigentümers vom 01.10.2026:
  - abgedeckt: Abruf, private Speicherung und interne Auswertung im bestehenden Tiingo-Abo;
  - nicht abgedeckt: ein neuer kostenpflichtiger Vertrag und die Veröffentlichung neuer Backtest-Kennzahlen.

## Festlegung vor dem Abruf

- Datei: `scripts/supertrader/validation/PREREGISTRATION.json`, committet vor der ersten Kursanfrage.
- Sie legt fest:
  - Universum und Zeitraum (2016-01-04 bis 2026-09-30);
  - Regeln, Kosten und Ausführung;
  - die Delisting-Szenarien S0, S1 und S2;
  - Vergleichsreihen, Akzeptanztests (AT1–AT8, R0–R4) und Kontrollen (C1–C5).
- Zwei Ergänzungen (A1, A2) entstanden nach der Teilmenge. Diese prüfte nur Identität und Qualität; zu diesem Zeitpunkt gab es noch keinen Vollabruf und keine Strategierechnung.
  - **A1:** Gehebelte und inverse Produkte, die die Quelle als Aktie führt, sind ausgeschlossen.
  - **A2:** Eine Kurslücke von mehr als 30 Tagen bricht die Reihe. Es gibt keine Rendite über eine Lücke hinweg; eine offene Position wird nach Szenario abgerechnet.

## Ablauf

| Schritt | Werkzeug | Ausgabe |
|---|---|---|
| Listentabelle aus der Tiingo-Tickerliste | `validation/lib.mjs buildListingTable` | Listing-ID `tiingo:BÖRSE:KÜRZEL:Start`. Börsenwechsel ergeben ein Listing; ein neu vergebenes Kürzel ergibt getrennte Listings. |
| Teilmenge | `fetch.mjs --mode subset` | frühe und späte Delistings, Übernahmen, Insolvenzen, neu vergebene Kürzel, aktive Listings ohne Speicherreihe |
| Vollabruf, fortsetzbar | `fetch.mjs --mode full` | Rohreihen im privaten Eimer (`tiingo-delisted`), Manifest je Listing |
| Auswertung | `analyze.mjs` | Qualität, Universum je Stichtag, Backtest S0/S1/S2, Sensitivitäten, Kontrollen |

### Abrufregeln

- **Tempo:** höchstens 50 Anfragen pro Minute.
- **Stopp:** bei 429, 401 oder 403, bei einem Limit-Hinweis und nach 5 Fehlern in Folge. Zwischen 21:30 und 00:30 UTC ruht der Abruf (Marktlauf).
- **Zero-Cost-Guard:** prüft die Summe der Nutzung beider Speicher-Namensräume.

## Identität

- Eine Reihe gehört genau einem Listing. Balken außerhalb des Listing-Fensters werden verworfen.
- **Neu vergebene Kürzel:** Tiingo liefert nur das neueste Listing; ein älteres Listing ist per Kürzel nicht abrufbar.
  - Das wird je Listing mit einem expliziten Datumsfenster geprüft.
  - Fällt die Prüfung negativ aus, wird das Listing als Lücke gezählt (AT3). Es wird nie mit der neuen Firma verbunden.
- **Doppelhistorien bei Kürzelwechseln:** Stimmt der letzte Balken einer Reihe nach Datum, Schluss und Volumen mit einem Balken einer anderen Reihe überein, wird sie nur einmal gezählt.

## Rechnung

- **Signale:** split-bereinigte Tagesbalken, eigene Rückrechnung aus `splitFactor`.
- **Kursgrenze:** 10 USD, geprüft auf dem Rohkurs (Adapter `rawPriceGate`). Alle anderen Regeln laufen unverändert über die Engine (`engine/simulator.mjs`, `strategies/donchian.mjs` v1.1.0).
- **Portfolio:** `runPortfolioTR` entspricht `runPortfolio` und rechnet zusätzlich:
  - Dividenden;
  - Kommission;
  - Positionsgröße zum Vortagesschluss;
  - Abrechnung delisteter Positionen nach Szenario.
- **Kontrolle C2:** Ohne diese Zusätze ist die Kurve identisch mit `runPortfolio`.

## Ablage

- **Rohreihen:** nur im privaten R2-Eimer, nie im Repository, in Logs oder in Artefakten.
- **Ergebnisse:**
  - werden mit RSA-OAEP-4096 und AES-256-GCM verschlüsselt;
  - der öffentliche Schlüssel liegt in `validation/results-public-key.pem`, der private nur beim Eigentümer bzw. in der Arbeitssitzung;
  - Ablageort ist der Zweig `claude/supertrader-validation-results`.
- **Logs:** enthalten nur Fortschrittszahlen.

## Öffentliche Seite

- Unverändert. Es werden keine neuen Rendite-, Trefferquoten- oder Trust-Score-Aussagen veröffentlicht.
- Discovery, Quant 2.0 und der Screener lesen nichts aus diesem Namensraum.

## Runde 6 (02.10.2026): Produktentscheidung, Evidenzstufen, weitere Methoden

### Präzisierung zum Donchian-Lauf

Zwei Zählungen werden getrennt:

- **Engine-Trades:** Jede Aktie wird einzeln und ohne Kapitalgrenze simuliert. Diese Zählung dient nur der Diagnose: Hat die Regel je Trade überhaupt einen Vorteil?
- **Portfolio-Trades:** Das sind die Trades, die im Zehn-Positionen-Portfolio tatsächlich ausgeführt wurden. Alle Rendite-, Rückgangs- und Vergleichskennzahlen beziehen sich nur hierauf.

Die Zahlen liegen verschlüsselt in `scripts/supertrader/validation/evidence-internal.sealed.json`.

**Geltungsbereich:** Die negative Beurteilung gilt nur für genau diese Kombination:

- Regelversion Donchian v1.1.0 auf Tagesbalken;
- Universum: US-Aktien einschließlich Delistings;
- Portfolio mit 10 Positionen und 0,5 % Risiko je Trade;
- Zeitraum 2016–2026.

Sie gilt nicht pauschal für andere Turtle-Varianten (Futures, Pyramiding, System 2), andere Zeiträume oder andere Strategien.

### Produktentscheidung

- **Donchian v1.1.0** erscheint öffentlich als „In Prüfung“ und wird als Forschung bzw. Modellbeobachtung geführt:
  - Neue Setups werden nicht als Einstiegschance hervorgehoben.
  - Protokoll und Modellpositionen laufen unverändert nach der gültigen Regelversion weiter.
- **Einstufung:** Die Änderung der Einstufung ist kein Marktsignal; sie erzeugt keinen Zustandswechsel im Ledger.
- **Öffentlicher Stand:** `scripts/supertrader/evidence.mjs` (`EVIDENCE_LEDGER`).
- **Begründung und Zahlen:** nur verschlüsselt.

### Evidenzstufen je Strategieversion

| Stufe | Bedeutung |
|---|---|
| Noch nicht geprüft | kein historischer Test der Version |
| In Prüfung | Test läuft oder Ergebnis nicht zur Veröffentlichung freigegeben |
| Geprüft, ohne überzeugenden Vorteil | vorab festgelegte Kriterien nicht erfüllt |
| Vorab festgelegte Kriterien erfüllt | R0–R4 erfüllt; kein Versprechen für künftige Ergebnisse |

- **Getrennte Angaben:** Quellenqualität (Originalregeln, Original + VU-Umsetzung, Sekundärquellen + VU, Teile nicht belegt) und Datenqualität (Kurse zum damaligen Stand; Fundamentaldaten nicht zum Stichtag; Pflichtdaten fehlen) stehen getrennt neben der Stufe.
- **Darstellung:**
  - „Aktuelle Setups“: Hervorhebung auf Startseite und in den Signalen.
  - „Forschung · Modellbeobachtung“: auffindbar, aber nicht hervorgehoben.
- **Veröffentlichungsregel:** Bis zur Klärung der Rechte an abgeleiteten Kennzahlen erscheint jede intern geprüfte Version öffentlich nur als „In Prüfung“. Der Test `r6.test.mjs` erzwingt das.

### Weitere Methoden

- **Präregistrierung:** `PREREGISTRATION-METHODS.json`, eingefroren vor jeder Rechnung dieser Methoden.
- **Geprüfte Versionen:** Momentum Breakout v1.1.0, Weinstein v1.1.0, Darvas v1.2.0 (primär alle Setups) und Minervini v1.1.0, jeweils als VU-Formalisierung.
- **Minervini:** Der Ausstieg (Schluss unter der 50-Tage-Linie) ist eine VU-Regel, keine geprüfte Originalregel.
- **Gleiche Grundlage wie Donchian:** Daten, Delisting-Szenarien, Kriterien R1–R4 und Kontrollen.
- **Ergebnisse:** nur verschlüsselt.

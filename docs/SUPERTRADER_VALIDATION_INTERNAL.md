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

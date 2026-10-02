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
- **Lauf:** Run 36968858290, `20261002T063136Z-analyze-methods.sealed.json` auf `claude/supertrader-validation-results`. Kontrollen C1, C2, C3m und AT5 bestanden.
- **Interne Einstufung:** Alle vier Versionen: „historisch geprüft ohne überzeugenden Vorteil“. Momentum, Weinstein und Darvas sind robust negativ. Minervini ist nicht belastbar: R1–R4 sind nicht erfüllt, und die Teilzeiträume widersprechen sich.
- **Einordnung:**
  - Momentum und Weinstein handeln regelgemäß selten; ihre Investitionsquote ist niedrig.
  - Bei Darvas zeigt die Kontrolle nur mit überlebenden Titeln einen deutlichen Survivorship-Effekt.
  - Kennzahlen stehen nur in der verschlüsselten Datei `evidence-internal.sealed.json`.
- **Produktentscheidung (02.10.2026):**
  - Alle Versionen sind öffentlich „In Prüfung“ und erscheinen als Forschung bzw. Modellbeobachtung.
  - Laufende Modellpositionen werden nach ihrer Regelversion weitergeführt.
  - Damit gibt es derzeit keine aktuelle Methode: Die Startseite zeigt den Beobachtungsmodus.
- **Geltungsbereich:** Die Aussage gilt jeweils nur für diese Regelversion, das Universum `US_PIT_2016_A`, das Zehn-Positionen-Portfolio und den Zeitraum 2016–2026. Eine geänderte Variante ist eine neue Hypothese mit eigener Präregistrierung.

## Runde 7 (02.10.2026): Ursachenanalyse und Regelversionen 2.0.0

### Diagnose der getesteten Versionen
- **Lauf:** Run 36985593528 (`diagnose-methods.mjs`), Ergebnisdatei `20261002T093425Z-diagnose-methods.sealed.json`.
- **Art des Laufs:** Keine Hypothese und keine neue Version. Die Vergleichsszenarien (SPY mit gleicher Investitionsquote, Gleichgewichtung, 1 % Risiko) dienen nur der Diagnose.
- **Ergebnis:** Alle fünf Versionen schneiden je Signal schlechter ab als SPY im selben Haltezeitraum. Die Ursachen im Detail stehen in `docs/SUPERTRADER_METHOD_FIDELITY.md`.

### Regelversionen 2.0.0
- **Festlegung:** `PREREGISTRATION-R7.json`, eingefroren vor dem Lauf.
- **Lauf:** Run 36990677933 (workflow_dispatch, Commit 843d12bf63), Ergebnisdatei `20261002T102719Z-analyze-r7.sealed.json`.
- **Abbruch und Neustart:** Ein erster Lauf (bbfab123c3) wurde in der Warteschlange abgebrochen, weil ein späterer Commit ohne Marke dieselbe Concurrency-Gruppe belegte. Seit dem Einfrieren haben sich die Engines nicht geändert.
- **Reproduzierbarkeit:** Die Versionen 1.x wurden im selben Lauf exakt reproduziert (gleiche Trades, gleiche Überrendite).
- **Ergebnis:** Alle vier Versionen 2.0.0 sind robust negativ. Intern sind sie als „geprüft, ohne überzeugenden Vorteil“ eingestuft, öffentlich als „In Prüfung“.
- **Kontrollen:** C1, C2, C3m und AT5 bestanden.
- **Ablage:** Kennzahlen nur in `evidence-internal.sealed.json`.
- **Live:** Die Versionen 2.0.0 laufen ab dem 02.10.2026 live, als Vorwärtsbeobachtung außerhalb der Stichprobe. Positionen der Version 1.x laufen nach ihren eigenen Regeln weiter.

## Runde 8 (02.10.2026): Volltext der Originalquellen, Kauf per Order am Ausbruch

### Quellenabruf
- **Weg:** Workflow-Modus `sources`, `fetch-sources.mjs`; Ergebnisdateien `*-sources-r8*.sealed.json`.
- **Gelesen:**
  - Kullamägi: Setups, FAQ, Episodic Pivots, Beispielcharts
  - Turtle-Regeln (PDF, 27 Seiten)
  - TIME 1959/1960 zu Darvas
  - Bulkowski und stageanalysis.net zu Weinstein
- **Ablage:** Texte nur verschlüsselt.
- **Befund der Kette:** steht in `docs/SUPERTRADER_METHOD_FIDELITY.md`.

### Läufe (je einmal, Protokoll vor dem Lauf eingefroren)

| Lauf | Protokoll | Inhalt | Run / Ergebnisdatei |
|---|---|---|---|
| r8-smoke | PREREGISTRATION-R8.json | technische Probe, 400 Reihen | 37006147514 |
| r8 | PREREGISTRATION-R8.json, -R8-TURTLE.json | Momentum 3.0.0, 3.0.0-P, Ablation 3.0.0-A, Referenz 2.0.0; Turtle 2.0.0, 2.0.0-P, Referenz 1.1.0; Beispielspur TSLA/NVDA | 37006651662 / `20261002T131609Z-analyze-r8.sealed.json` |
| r8b | PREREGISTRATION-R8B.json | Darvas 3.0.0/-P, Weinstein 3.0.0/-P, Referenzen 2.0.0; Momentum 3.0.0-C und Turtle 2.0.0-C mit sicherem Gleichtags-Ausstieg | 37011923139 / `20261002T140356Z-analyze-r8b.sealed.json` |
| r8c | PREREGISTRATION-R8C.json | Momentum 3.1.0/-P (Befund der TSLA-Beispielprüfung), Referenz 3.0.0-C | siehe unten |

**Abbrüche in der Warteschlange.** Der erste r8b-Lauf und der erste r8c-Lauf wurden in der Warteschlange abgebrochen. Ursache: Pushes
in dieselbe Concurrency-Gruppe, teils von anderen Zweigen. Beide wurden per workflow_dispatch neu gestartet. Die Engines waren
zwischen Einfrieren und Lauf unverändert; geändert hatten sich nur Produktdateien und Variantennamen.

**Nachtrag vor der Auswertung von r8.** Schließt der Einstiegstag auf oder unter dem Stop, wurde der Stop sicher durchschritten;
die neutrale Variante verbuchte diesen Fall zunächst nicht. Korrigiert in r8b, die Varianten -C.

### Ergebnis (qualitativ; Kennzahlen nur in `evidence-internal.sealed.json`)

**Reproduktion.**
- Momentum 2.0.0 in r8 ist identisch mit R7: gleiche Trades, gleiche Überrendite.
- Darvas 2.0.0 und Weinstein 2.0.0 in r8b reproduzieren R7.

**Keine neue Version erfüllt die Kriterien.** Alle sind intern als TESTED_NO_EDGE eingestuft, öffentlich als „In Prüfung“.

- **Momentum 3.0.0:**
  - Nicht robust: in 2016–2020 über SPY, in 2021–2026 deutlich darunter.
  - Die vorsichtige Variante ist robust negativ.
  - Die Gegenprobe 3.0.0-A (gleiche Regeln, alter Einstieg) trägt die Ursachenbehauptung **nicht**. 2021–2026 schnitt der Kauf-Stop je Trade schlechter ab als der alte Einstieg. Der Einstiegszeitpunkt erklärt die schwachen Ergebnisse also nicht.
- **Turtle 2.0.0:**
  - Robust negativ und deutlich schlechter als 1.1.0, obwohl die Signale je Trade fast gleich abschneiden.
  - Hinweis, keine bewiesene Ursache: Mit 1 % je N ist das Aktienportfolio fast immer voll investiert, in gleichgerichteten Ausbrüchen. Für gestreute Futures geschrieben, passt diese Größenregel nicht zu Einzelaktien.
  - Die Kontrolle C2 wich ab, weil sie das notionelle Konto nicht kannte. Sie ist für künftige Läufe angepasst. AT5 prüfte bei Kauf-Stop den falschen Tag; ebenfalls angepasst.
- **Darvas 3.0.0:**
  - Robust negativ.
  - Je Trade besser als 2.0.0. Die vorsichtige Variante verliert aber fast alles: Ein Stop 1 % unter der Kauforder liegt meist innerhalb der Tagesspanne, mit Tagesbalken ist das Ergebnis nicht bestimmbar.
  - Die Ursachenregel (neutral **und** vorsichtig besser) ist nicht erfüllt.
- **Weinstein 3.0.0:**
  - Robust negativ im Portfolio (geringe Investitionsquote).
  - Die Ursachenregel ist **erfüllt**: Neutral und vorsichtig schneidet 3.0.0 je Trade in beiden Teilzeiträumen besser ab als 2.0.0. Kauf-Stop und die Volumenregel nach dem Kauf erklären also einen Teil der Schwäche je Signal. Der Abstand zu SPY bleibt.

**Beispielprüfung (Regelidentität, keine Evidenz).**
- **NVDA:** Die 10-%-Gap-Regel ordnet alle drei Daten wie Kullamägi ein: 11.11.2016 EP, 10.02.2017 kein EP, 10.05.2017 EP.
- **TSLA:** 3.0.0 erkannte das Setup am 27.05.2020, verwarf es aber am 28.05. wegen zweier VU-Zusätze. Daraus entstand Version 3.1.0 (r8c).

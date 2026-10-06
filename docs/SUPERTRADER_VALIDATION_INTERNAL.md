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
| r8c | PREREGISTRATION-R8C.json | Momentum 3.1.0/-P (Befund der TSLA-Beispielprüfung), Referenz 3.0.0-C | 37017417965 / `20261002T144351Z-analyze-r8c.sealed.json` |

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
- **Momentum 3.1.0 (r8c):**
  - Fängt Kullamägis TSLA-Beispiel. Setup am 27.05.2020, am 28.05. gehalten. Kauf-Stop am 29.05. zu 55,70 (split-bereinigt), Stop am Tagestief 53,61. Ein Drittel am 04.06. verkauft, der Rest am 25.06. beim ersten Schluss unter der 10-Tage-Linie.
  - Einschränkung: Der Einstieg liegt eine Sitzung vor dem von Kullamägi markierten Ausbruchstag (01.06.), weil der Trigger (5-Tage-Hoch) am 29.05. knapp erreicht wurde.
  - Historisch weiter TESTED_NO_EDGE: geringfügig besser als 3.0.0, aber unter SPY; die vorsichtige Variante ist robust negativ.
  - 3.0.0-C wurde exakt reproduziert.
- **Live seit 02.10.2026:** Momentum 3.1.0, Turtle 2.0.0, Darvas 3.0.0, Weinstein 3.0.0, Minervini 2.0.0. Das ist Vorwärtsbeobachtung außerhalb der Stichprobe. Positionen älterer Versionen laufen nach ihren eigenen Regeln weiter.

## Runde 9 (02.10.2026): Reihenfolge am Kauf-Stop-Tag mit Minutenkursen

### Zugang (ohne neue Kosten)
- **Probe:** `intraday-probe.mjs`, Run 37027212417, 16 Fälle.
- **Verfügbarkeit:** Der bestehende Tiingo-Commercial-Zugang liefert historische **IEX-1-Minuten-Balken ab 2017**; 2016 ist leer.
  - Delistete Titel teils verfügbar (TWTR, ATVI, CELG ja; SIVB 404).
- **Qualität:** IEX ist ein Handelsplatz mit 1–3 % des Volumens. Tageshoch und -tief stimmen trotzdem meist auf 0,1 % mit dem konsolidierten Balken überein.
- **Rechte:** Nur interne, nicht anzeigende Nutzung. Auf der Website erscheinen keine Minutenwerte.

### Studie (PREREGISTRATION-R9-INTRADAY.json + Nachtrag vor dem Hauptlauf)
- **Lauf:** Run 37028625281, Ergebnisdatei `20261002T162821Z-intraday-study.sealed.json`.
- **Umfang:**
  - Momentum 3.1.0: Vollerhebung, 1 096 Einstiege 2017–2026.
  - Darvas, Turtle, Weinstein: geschichtete Hash-Stichproben.
  - Dazu 50 Split-Fälle; zusammen 1 821 Fälle.
- **Nachtrag vor dem Hauptlauf:**
  - IEX druckt bei kleinen Werten lückenhaft. Deshalb bestimmen Minuten nur die Reihenfolge, der Preis bleibt beim Tagesbalken-Modell.
  - Die Beispiel-Charts sind bis zum Veröffentlichungstag split-bereinigt.
- **Kontrollfälle:** „sicher“ (Schluss ≤ Stop) zu 100 % und „klar“ (fester Stop nicht erreicht) zu 99–100 % in Übereinstimmung. Die Methode trägt.
- **Strittige Tage, tatsächlicher Ausstieg am Kauftag** (neutral nimmt 0 % an, vorsichtig 100 %):
  - Momentum 64 %
  - Darvas 29 %
  - Turtle 63 % (betrifft unter 1 % der Turtle-Einstiege)
- **Momentum zusätzlich:**
  - Das Tagestief entstand in 46 % aller aufgelösten Kauftage **nach** dem Kauf. Der Stop „lows of the day“ zum Kaufzeitpunkt lag dann höher als das Tagestief, im Median 0,5 %.
  - Auch auf „klaren“ Tagen endete die Position zu 28 % am selben Tag.
  - Das Tagesbalken-Modell (Stop = Tagestief) ist für Kullamägi damit nicht nur unsicher, sondern systematisch zu günstig.
- **Ausschlüsse:**
  - Identitätsprüfung: Momentum 13 %, meist Auktions-Tiefs, an denen IEX nicht teilnimmt.
  - IEX-Hoch unter dem Trigger: 5 %.
  - Keine Daten: 1 %.
- **Rohdaten-Kontrollen:**
  - 45 von 50 Split-Fällen korrekt umgerechnet.
  - Gap-Tage: 265 von 313 stimmen zwischen IEX und Tagesbalken überein.
  - Bekannte Grenze: einzelne IEX-Drucke liegen knapp unter dem konsolidierten Tief (1 Fall).

### Beispielprüfung
- **AXON 09.01.2004 (unabhängig):**
  - 3.0.0 verfehlt den Tag: Setup endete am 08.01., danach Sperre.
  - **3.1.0 kauft genau am markierten Tag.** Das ist die einzige unabhängige Bestätigung der 3.1.0-Änderung.
- **MNKD 10.05.2013 (unabhängig):** Beide Versionen verfehlen den Tag. Am 09./10.05. lag der Kurs unter beiden Linien, und die 20-Tage-Linie stieg nach einer monatelangen Basis nicht. Keine Regeländerung.
- **TSLA:** 3.1.0 überschreitet den Trigger am 29.05.2020 erst um 15:55 ET, um 0,05 %. Kullamägis Ausbruch war der 01.06. (Gap). Das Beispiel diente der Entwicklung von 3.1.0 und zählt nicht als Bestätigung.

### Minutenaufgelöster Prüflauf r9b (PREREGISTRATION-R9B-RESOLVED.json)
- **Lauf:** Run 37041293109, Ergebnisdatei `20261002T184337Z-analyze-r9b.sealed.json`.
- **Erster Versuch:** Run 37034413841 brach ohne Ergebnis ab, weil der Minuten-Cache als Objekte zu groß für einen String war. Neu gestartet mit kompaktem Format und Sicherung je Durchgang; Protokoll und Engines unverändert.
- **Minutendaten:**
  - 19 712 Kauf-Stop-Tage im privaten Eimer. Durchgänge mit fehlenden Tagen: 17 898, dann 1, dann 0.
  - Aus Minuten entschieden: Momentum 72 % der Trades, Darvas 80 %.
  - Rest (2016, fehlende Daten, Identitätsprüfung) als Schranke: neutral (-I) bzw. vorsichtig (-IP).
- **Reproduktion:** Die Referenzen 3.1.0 (r8c) und Darvas 3.0.0 (r8b) sind exakt reproduziert.
- **Ergebnis:**
  - **Momentum 3.1.0:** Beide Schranken robust negativ, auch 2016–2020 unter SPY. Die Aussage aus R8 („nicht robust, 2016–2020 über SPY“) beruhte auf der zu günstigen Tagesbalken-Annahme und ist **korrigiert**.
  - **Darvas 3.0.0:** In beiden Schranken robust negativ. „Mit Tagesbalken nicht entscheidbar“ (R8) ist jetzt entschieden: kein Vorteil.
  - Die Ursachenregel für Darvas (3.0.0 je Trade besser als 2.0.0, neutral **und** vorsichtig) bleibt unerfüllt: Mit vorsichtigem Rückfall ist 2016–2020 schlechter.
- **Turtle und Weinstein:** nicht neu gerechnet. Strittige Tage betreffen bei Turtle unter 1 % der Einstiege, bei Weinstein keine; die R8-Aussagen bleiben.

### Folgen im Produkt
- **Live-Lauf:** `intraday-prefetch.mjs` lädt vor dem täglichen Strategie-Lauf IEX-Minuten nur für wartende Kauf-Stop-Setups, deren Tageshoch den Trigger erreichte. Der Simulator bestimmt daraus Stop und Gleichtags-Ausstieg.
  - Ins öffentliche Protokoll gehen nur Belegart und Entscheidung, keine Minutenwerte und keine Uhrzeit.
  - Ohne Minuten gilt die Tagesbalken-Annahme. Die Seite kennzeichnet sie als „angenommen“ bzw. „Reihenfolge offen“.
- **iPhone:** Jede Kauf-Stop-Ausführung trägt ihre Belegart. Bei offener Reihenfolge nennt der Hinweis den Befund der Minutenprüfung je Methode, qualitativ und ohne Kennzahlen.

### Nachtrag A4 (nach dem Hauptlauf): offizielle Eröffnung entscheidet den Gap

Bei der Durchsicht von Berichtsbeispielen (CBAY 19.01.2024) fiel auf: Die Minutenauflösung
entschied den Gap nach dem ersten IEX-Druck statt nach der offiziellen Eröffnung und nahm am
Gap-Tag das Tief der ersten Minute als „Tief bis zum Kauf" (Blick nach vorn). Korrektur und
Begründung: `PREREGISTRATION-R9-INTRADAY-AMENDMENT.json` → `A4_officialOpen`. Keine Schwelle
geändert. Studie und r9b laufen mit A4 erneut; die Ergebnisse vor A4 bleiben archiviert und
werden daneben berichtet.

**Studie nach A4** (Run 37051824868, `20261002T194226Z-intraday-study.sealed.json`; dieselben 1 821 Fälle):
- Strittige Tage, tatsächlicher Ausstieg am Kauftag: Momentum 63 % (vorher 64 %), Darvas 29 % (unverändert),
  Turtle 66 % (vorher 63 %). Kontrollfälle weiter 99–100 % in Übereinstimmung.
- Momentum: Tagestief nach dem Kauf in 48 % (vorher 46 %); Stop zum Kaufzeitpunkt im Median 0,35 % über dem
  Tagestief (vorher 0,5 %). Aufgelöst 891 statt 882 Fälle.
- 52 von 1 821 Einzelentscheidungen änderten sich; die Befunde je Methode (MOSTLY_EXIT / MOSTLY_HOLD) bleiben.
- Beispiele (AXON, MNKD, TSLA) unverändert.

**r9b nach A4** (Run 37051901456, `20261002T220429Z-analyze-r9b.sealed.json`; Vergleich mit Run 37041293109):
- Aus Minuten entschieden: Momentum 898 Trades (vorher 889), Darvas leicht mehr. Referenzen unverändert reproduziert.
- Momentum 3.1.0: beide Schranken weiter ROBUST_NEGATIVE; 2016–2020 bleibt in beiden Schranken unter SPY.
  Die R8-Korrektur („2016–2020 über SPY“ beruhte auf der Tagesbalken-Annahme) gilt unverändert.
- Darvas 3.0.0: beide Schranken weiter robust negativ; Ursachenregel weiter unerfüllt.
- Ergebnisse vor A4 bleiben als `#r9b`, nach A4 als `#r9b-a4` in `evidence-internal.sealed.json`.

## Runde 10 (03.10.2026): Mehrbörsen-Minuten, Splitfälle, Abdeckung der Ausschlüsse

### Tiingo-Endpunkt /tiingo/equity/intraday (Beta) – PREREGISTRATION-R10-VENUES.json
- Lauf 37093205098, Ergebnis `20261003T040901Z-venue-probe.sealed.json`; 258 Anfragen, nur bestehender Schlüssel.
- **Zugang:** Status 200 mit Minutenbalken (AAPL 03.06.2024: 390 Balken). Historie ab 2017; 2010, 2016 und NVDA 11.11.2016 leer.
- **Zeitraum/Zeitstempel:** UTC, 09:30–15:59 ET, keine Vor- und Nachbörse, Felder open/high/low/close, **kein Volumen**.
- **Kurse:** In 66 von 67 Fällen mit Daten beider Quellen sind Eröffnung, Hoch und Tief **identisch mit den IEX-Minuten**.
  Mit unserem Zugang liefert der Endpunkt also IEX-Werte ohne Volumen, keine konsolidierten Mehrbörsen-Minuten.
- **Folge (D1–D3):** abrufbar (D1), aber nicht konsolidiert (D2 nicht erfüllt: alle 30 Identitätsabweichungen,
  10 „IEX-Hoch unter Trigger“ und 12 „ohne Daten“ bleiben gleich). Kein Folgelauf; IEX bleibt die Minutenquelle.
  Reihenfolge von Kauf und Stop stimmt in allen 24 von beiden Quellen aufgelösten Fällen überein.
- **Splitbereinigung:** Beide Minutenquellen liefern Rohkurse (Tagesbalken roh passt, bereinigt nur über den Faktor).

### Die fünf nicht aufgelösten Splitfälle (R9)
Keiner scheiterte an der Splitumrechnung. Die Aussage „45 von 50 korrekt umgerechnet“ war ungenau:
- ETP 19.10.2018 (Darvas): letzter Handelstag vor der Fusion in ET, Tagesbalken ohne Spanne (O=H=L=C) – keine Minuten. Datenmerkmal des Delistings.
- DD 05.04.2019 (Turtle): keine IEX-Minuten unter dem alten Ticker nach der Fusion DowDuPont.
- SLGN 02.06.2017, NSP 19.12.2017 (Darvas): IEX-Hoch 0,25 % bzw. 0,7 % unter dem Trigger (Hoch nicht an IEX gehandelt).
- SEND 31.01.2019 (Darvas): Tief aus der Eröffnungsauktion (IEX 1,2 % höher), Identitätsprüfung greift.
In allen 45 aufgelösten Splitfällen stimmte der umgerechnete Tagesbalken auf 1 % mit den Minuten überein (Identitätsprüfung).

### Abdeckung der ausgeschlossenen Momentum-Fälle
Die R9-Schranken (neutral -I, vorsichtig -IP) decken die nicht aufgelösten Kauftage **nicht vollständig** ab: Auf
„klaren“ Tagen nehmen beide Schranken an, dass die Position hält; aufgelöste Fälle zeigen aber 28 % Gleichtags-Ausstiege
auch dort. Deshalb läuft die vorab definierte äußerste Schranke r10b (3.1.0-IX: jeder nicht aufgelöste Kauftag endet zum Tagesbalken-Stop).

### Fallprüfung großer Gewinner (PREREGISTRATION-R10-CASES.json) – Test unserer VU-Versionen
- **Auswahl (vor jeder Analyse eingefroren):** SMCI + je Startjahr 2017–2025 der größte Anstieg (≥ 300 % in ≤ 252 Sitzungen,
  investierbar am Start) unter weiter gelisteten und unter delisteten Titeln, verschiedene Branchen; je Gewinner ein
  Fehlkandidat, der am selben Stichtag gleich stark aussah (≥ 85 % des 52-Wochen-Hochs, RS ≥ 90) und danach mindestens die
  Hälfte verlor oder delistet wurde. Die Ranguebernächsten bilden eine versiegelte Prüfmenge.
- **Läufe:** Diagnose 37095761820, Prüfmenge 37098889344, Vollportfolio r10c 37098890648, Minervini-Diagnose r10m 37099039970.
- **Ursachen (19 Gewinner × 5 Methoden = 95 Fälle):** nie Kandidat 50, Kandidat ohne Einstieg 7, Einstieg ohne Platz im
  Portfolio 24, zu früh verkauft (< 25 % des Anstiegs) 14, erfasst 0. Fehlkandidaten (95): nie Kandidat 66, Preis/Liquidität 3,
  ohne Einstieg 10, ohne Platz 11, aufgenommen 5.
- **Je Methode (Gewinner):** Momentum: 12 nie Kandidat (Momentum-Perzentil 98, Basisregel), 7 zu früh verkauft (Stop am
  Tagestief, Teilverkauf nach Tagen). Weinstein: 19 nie Kandidat – 14 Gewinner waren schon in Stufe 2, die Engine sucht nur
  Stufe-1-Basen (Fortsetzungskäufe fehlen). Darvas: 10 ohne Platz, 6 nie Kandidat, 3 zu früh (Stop 1 % unter Kauf).
  Minervini: 11 nie Kandidat, 7 ohne Einstieg (Volumenregel, Bruch des Kontraktionstiefs), 1 ohne Platz. Turtle: 13 ohne
  Platz (Kapital), 4 zu früh, 2 nie Kandidat.
- **Unterscheidung:** Irgendeine Methode stieg in 17 von 19 Gewinnern ein, aber nur in 10 von 19 Fehlkandidaten – die
  Kandidatensuche unterscheidet. Verloren gehen die Gewinner danach im Portfolio und beim Ausstieg.
- **SMCI (Zeitlinie, intern):** ab Dezember 2022 RS über 90 und Gewinnwachstum je Aktie von 300–600 %. Darvas erkannte
  die Ausbrüche mehrfach (Nov. 2022 bis Juli 2023); aufgenommen wurden zwei Einstiege, beide am selben Tag ausgestoppt;
  der Einstieg vom 03.05.2023, der bis 23.06.2023 lief, bekam keinen Platz (Rang 7 von 18, alphabetisch). Turtle: 10 Einstiege,
  einer aufgenommen (am Folgetag ausgestoppt), die übrigen ohne Kapital. Minervini: an 215 Tagen Trend-Template-Kandidat,
  VCP-Regel ohne Treffer. Momentum: Basisregel nie erfüllt, erster Einstieg erst Juli 2024. Weinstein: nur Stufe 2, nie Kandidat.
- **Gefundene Fehler und Korrekturen (PREREGISTRATION-R10-FIXES.json):** Nicht-Aktien im Universum (U1, Datenfehler),
  Darvas-Kapazität (K1), alphabetische Platzvergabe (K3). K3 erfüllt die vorab festgelegte Regel an Prüfmenge und
  Vollportfolio für Momentum, Weinstein, Minervini und Darvas 3.0.1, nicht für Darvas 3.0.0. Turtle bleibt alphabetisch.
  Alle Urteile bleiben negativ; kein Vorteil belegt.

### Minervini: tatsächlicher Prozess gegen unsere VU-Version 2.0.0
- **Quellen:** Stockopedia-Interviews 2018, MarketWatch 2025, eigene Beiträge (Archiv), Audit-Seite 2021; Bücher nicht zugänglich.
- **Auswahl:** Trend Template, RS gegen den Markt, „earnings, sales and margins – and the chart“; Code ohne Gewinnfilter.
- **Exposition:** „progressive exposure“ (25–50 % Pilot, erhöhen bei Gewinnen); Code halbiert nur das Risiko nach Verlusten.
- **Einstieg:** Ausbruch über den Pivot, auch „cheat“-Einstiege; Code: Schluss über Pivot mit ≥ 1,4× Volumen, Kauf zur nächsten Eröffnung.
- **Stop/Verkauf:** Stop 8–10 % Obergrenze, Ø Verlust 4–5 %; verkauft in die Stärke, „trading around positions“; Code: Einstand ab 3R, 50-Tage-Linie.
- **Wettbewerb 2021:** Long und Short, Hebel, über 550 Titel, tausende Ausführungen; unsere VU-Version: nur Long, ohne Hebel, ≤ 10 Positionen.
- **Messung r10m (2016–2026, bereinigtes Universum):** Von 6,1 Mio. liquiden Aktientagen erfüllen 17 % das Trend Template;
  davon erkennt die VCP-Regel an 9,6 % eine Basis, der Volumenrückgang lässt 21 % davon übrig; die Ausbruchsvolumen-Regel
  verwirft 86 % der Einstiege (299 Trades in zehn Jahren, ohne die Regel 2 158). Ohne Volumenregel bleibt das Ergebnis
  negativ (nicht robust); ohne RS-Filter, ohne Volumenrückgang oder mit 25 % statt 30 % über dem Tief ebenfalls negativ.
- **Folgerung:** Unsere VU-Version handelt rund 30-mal im Jahr; Minervinis Ergebnis beruht auf Bausteinen, die sie nicht
  enthält (Gewinnfilter, Verkauf in die Stärke, Exposition, Short/Hebel, diskretionäre Basisbeurteilung). Eine quellennähere
  Version (Kauf am Pivot im Tagesverlauf, Gewinnfilter) braucht eine eigene Präregistrierung; Gewinnfilter derzeit nur für
  heute gelistete Firmen möglich (Survivorship).

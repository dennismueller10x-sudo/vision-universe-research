# VU PROVIDER DECISION MATRIX

Der Stand der Qualifikation, mit ausgewiesener Belegtiefe.

Erzeugt aus `quant/config/provider-profiles.json` durch
`node scripts/market/qualify-providers.mjs`.
**Recherchestand: 7. September 2026.**

---

## Die Tabelle

| Anbieter | Beste Rolle | PIT | Delisted | Restatements | Corp. Actions | Realtime | Fundamentals | Estimates | Lizenz | Entwicklungskosten | Kommerzielles Risiko | Qualifikation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Sharadar** | Research | **+** | ? | ? | ? | – | + | ? | offen | 0 USD nicht verfügbar | **hoch** | `PARTIALLY_QUALIFIED` |
| **Intrinio** | Research | ? | ? | ? | ? | ? | + | ? | offen | **0 USD (Sandbox, Dow 30)** | mittel | `PARTIALLY_QUALIFIED` |
| **Twelve Data** | Marktdaten | **–** | **–** | **–** | **–** | – | ? | ? | offen | 0 USD (Free) | niedrig | `PARTIALLY_QUALIFIED` |
| EODHD | – | ? | + * | ? | + | ? | + | ? | offen | nicht ermittelt | ? | `UNKNOWN` |
| FMP | – | ? | ? | ? | ? | ? | + | ? | offen | nicht ermittelt | ? | `UNKNOWN` |
| Polygon | – | ? | ? | ? | ? | + | ? | ? | offen | nicht ermittelt | ? | `UNKNOWN` |

**+** vorhanden / bestanden **–** widerlegt / nicht vorhanden **?** ohne Befund

\* EODHD mit erheblicher Einschränkung, siehe unten.

**Zur Laufzeit geprüfte Befunde: 0 von 15 je Anbieter.**

## Das Wichtigste zuerst

**Kein Anbieter besteht derzeit alle drei Gates. Kein einziger Befund ist zur
Laufzeit geprüft.**

Das ist kein Zwischenstand auf dem Weg zu einem Ergebnis — es *ist* das
Ergebnis dieser Phase. Was hier steht, sind Aussagen über Aussagen: was
Anbieter über sich schreiben, gefiltert durch Suchergebnisse. Für eine
Vertragsentscheidung reicht das nicht, und die Tabelle behauptet auch nicht,
dass es reicht.

Was diese Phase geleistet hat, ist etwas anderes: Es gibt jetzt einen Prüfstand,
der jeden Anbieter denselben Fragen aussetzt, und drei ausführbare Tests, die
über die Eignung entscheiden. Das Urteil fehlt noch — das Verfahren steht.

## Die Erhebungslage

Die Primärdokumentation war **nicht direkt abrufbar**: der Egress-Proxy dieser
Umgebung blockiert `sharadar.com`, `data.nasdaq.com`, `docs.intrinio.com` und
`intrinio.com`. Alle Befunde stammen aus Suchergebnissen.

Wo ein Suchergebnis Inhalt der anbietereigenen Dokumentationsseite wiedergibt,
ist er als `DOCUMENTATION_VERIFIED` eingestuft und trägt einen Vermerk zur
Abrufart. Wo er aus Vergleichsartikeln stammt, als `THIRD_PARTY_REPORTED`.
Nirgends steht `RUNTIME_VERIFIED`, und ein Test hält das fest.

---

## Sharadar

**Der derzeit stärkste Kandidat für PIT-Fundamentaldaten — und der mit dem
größten kommerziellen Risiko.**

### Was für ihn spricht

Die Architektur ist erkennbar für diesen Zweck gebaut. Die Trennung in
AR-Dimensionen (`ARQ`/`ARY`/`ART`, as-reported) und MR-Dimensionen
(`MRQ`/`MRY`/`MRT`, most-recent-reported) ist genau die Unterscheidung, um die
es geht:

> *The As-Reported dimensions present a point-in-time view with data
> time-indexed to the date of the form 10 regulatory filing to the SEC*

Jeder Datensatz trägt ein `datekey` — das Einreichungsdatum bei der SEC, nicht
den Zeitpunkt der Datenbankaktualisierung. **Damit ist Gate C bestanden.**

Delistete Titel sind ausdrücklich enthalten, und zwar mit Fundamentaldaten:
16 000+ Unternehmen einschließlich delisteter, Historie ab 1990. Die
Kursdatenbank nennt 25 000+ Ticker, davon rund 15 000 delistet.

### Warum Gate B trotzdem offen ist

Der Beleg für die Rekonstruierbarkeit des historischen Universums stammt aus
einer Sekundärquelle (`quantrocket.com`), nicht aus der Primärdokumentation.
Inhaltlich ist er konkret und glaubwürdig — aber ein Gate verlangt mindestens
Primärdokumentation, und diese Schwelle wurde nicht gesenkt, weil der Befund
plausibel klingt.

### Warum Gate A offen ist

Die Dimensionslogik ist dokumentiert. Was sie nicht belegt: ob die AR-Reihe bei
einer **echten Korrektur** tatsächlich zwei unterscheidbare Ausprägungen führt.
Das ist keine Dokumentationsfrage — das lässt sich nur an einem realen
Restatement-Fall prüfen. Eingestuft als `RUNTIME_VERIFICATION_REQUIRED`.

### Die Falle

Die AR-Dimensionen sind point-in-time, die MR-Dimensionen ausdrücklich nicht.
Ein Backtest, der versehentlich MR verwendet, sieht rückwirkend korrigierte
Zahlen — und nichts daran sieht falsch aus. Die Fähigkeit ist vorhanden, aber
falsch bedienbar. Ein Adapter muss die Dimension erzwingen, nicht anbieten.

### Das kommerzielle Risiko

> Professionelle Nutzer müssen Sharadar-Daten über Nasdaq Data Link beziehen.

Eine öffentliche Website ist mit hoher Wahrscheinlichkeit professionelle
Nutzung. Die recherchierten 29 bzw. 69 USD/Monat sind damit **vermutlich nicht
der zutreffende Tarif**. Der Preis über Nasdaq Data Link wurde nicht ermittelt.

Das ist der Unterschied zwischen „günstigster qualifizierter Kandidat" und
„unbekannte Größenordnung".

### Offen

Total-Return-Bereinigung der Kursreihen (SEP führt bereinigte Kurse — ob
Dividenden eingeschlossen sind, wurde nicht festgestellt), Kapitalmaßnahmen als
Einzelereignisse, sämtliche Lizenzfragen.

---

## Intrinio

**Der einzige Anbieter mit einem kostenlosen Zugang zu echten
Fundamentaldaten — und deshalb der praktisch nächste Schritt, unabhängig davon,
wer am Ende gewählt wird.**

### Der wichtigste Einzelbefund der ganzen Recherche

Die auffindbare „point-in-time"-Stelle bei Intrinio lautet:

> *Balance sheet data is available on a FY or QTR basis only due to its
> point-in-time nature.*

Das meint die **Bilanz als Stichtagsrechnung** — im Unterschied zur GuV, die
einen Zeitraum beschreibt. Es meint **nicht** die bitemporale Verfügbarkeit
einer Kennzahl. Derselbe Begriff für eine völlig andere Sache.

Wer diese Stelle als PIT-Beleg nimmt, qualifiziert den Anbieter auf einem
Missverständnis. `pointInTimeFundamentals` steht deshalb auf `UNKNOWN` mit
Vermerk, und ein Test hält den Vermerk fest.

Das ist ausdrücklich **kein** Vorwurf an Intrinio — der Satz ist in seinem
Kontext richtig. Es ist ein Befund über die Recherche.

### Was tatsächlich belegt ist

Ein eigener Filings-Endpunkt mit `filed_after`/`filed_before`-Filtern;
Fundamentaldaten sind über eine Filing-ID mit dem Filing verknüpft. Das ist ein
starkes Signal für Gate C, wenn auch nicht dasselbe wie ein Zeitstempel je
Kennzahl.

Für Gate A: ein `type`-Feld, das *restated* von *reported (original,
non-restated)* unterscheidet. Genau das Verlangte — aber dass ein Feld
existiert, sagt nichts darüber, ob die Originalreihe für die Vergangenheit
gefüllt ist. `RUNTIME_VERIFICATION_REQUIRED`.

### Die Historientiefe

Beginn 2007, vollständig ab 2008 — mit der XBRL-Pflicht der SEC. Rund 18 Jahre.

Das ist die härteste Einschränkung gegenüber Sharadar (ab 1990). Ein Backtest,
der einen vollständigen Zyklus einschließlich 2000 und 2008 abdecken soll,
kommt damit nicht aus. Für einen Zyklus ab 2008 reicht es.

### Der Sandbox-Zugang

Kostenlos, Abdeckung **Dow 30**. Damit sind **Gate A und Gate C ohne Kosten
prüfbar**. Gate B nicht: die Dow 30 sind per Definition Überlebende.

Das ist die genaue Grenze dessen, was ohne Geld erreichbar ist.

---

## Twelve Data

**Klar eingeordnet: Marktdatenanbieter, keine Evidenzquelle.**

Als einziger Anbieter in dieser Tabelle sind die Befunde nicht `UNKNOWN`,
sondern **widerlegt**. Das ist ein Fortschritt gegenüber Unwissen: Phase 2 hat
die Fähigkeiten deklariert und dokumentiert.

| | |
|---|---|
| PIT-Fundamentaldaten | `false` |
| Delistete Titel | `false` |
| Restatements | `false` |
| Kapitalmaßnahmen | `false` |
| Total-Return-Kurse | `false` |
| **Tageshistorie** | **`true`** |

`BACKTEST_EVIDENCE_PROVIDER: NOT_QUALIFIED` — und das ist kein Mangel. Die
Rolle, die der Anbieter im System hat, ist die Marktdatenrolle, und die erfüllt
er.

Die Kursreihen sind nach empirischem Befund `SPLIT_ADJUSTED`: gut genug für
Charts und Momentum, nicht für Renditeaussagen. Siehe
`VU_PRICE_ADJUSTMENT_SEMANTICS.md`.

**Es gibt derzeit keinen Anlass, ihn zu ersetzen.**

---

## EODHD

Ein Befund, der ihn für Backtests wahrscheinlich ausschließt, und zwar aus einem
Grund, den man leicht übersieht:

> Fundamentaldaten delisteter Unternehmen gibt es nur für Delistings **nach
> 2018**. Davor ausschließlich Kursdaten.

Ein Backtest über 2008 sähe die damaligen Insolvenzen also ohne
Fundamentaldaten — und damit, für eine fundamental auswählende Strategie, gar
nicht. Der Survivorship Bias bliebe für die interessantesten Jahre bestehen.

Das ist genau die Unterform von Gate B, die die Spezifikation ausdrücklich
benennt: Kursreihen ohne Fundamentaldaten reichen nicht.

Ansonsten: breite Abdeckung (150 000+ Ticker, global, einschließlich Europa),
Splits und Dividenden als eigene Datenklassen. Als **Marktdatenanbieter**
möglicherweise interessant, wenn das Universum über die USA hinauswächst.

---

## FMP und Polygon

Bewusst nur flach recherchiert.

**FMP** wird durchgängig für Fundamentaldaten und SEC-EDGAR-Nähe gelobt — alles
Sekundärquellen. Kein Befund zu PIT, Restatements oder delisteten Titeln.

**Polygon** ist erkennbar marktdatenstark (Tick-Daten, Intraday, WebSocket).
Als Nachfolger für die Marktdatenrolle denkbar, wenn Twelve Data an Grenzen
stößt — wozu es derzeit keinen Anlass gibt.

Ohne Befund zu Gate A und B wäre eine tiefere Preis- und Abdeckungsrecherche
verfrüht: Es hilft nichts, den Preis eines Anbieters zu kennen, dessen Eignung
offen ist.

---

## Die Empfehlung: mehrere Anbieter, nach Rolle getrennt

Ein einzelner Sieger wäre hier die falsche Antwort. Die Rollen stellen
verschiedene Fragen, und kein Anbieter beantwortet alle gut.

| Datenklasse | Kandidat | Status |
|---|---|---|
| **Marktdaten (Kurse)** | Twelve Data | angebunden, ausreichend |
| **PIT-Fundamentaldaten** | Sharadar | bester Kandidat, Lizenz offen |
| **Fundamentaldaten-Erprobung** | Intrinio (Sandbox) | kostenlos, nächster Schritt |
| **Analyst Estimates** | offen | nicht recherchiert |
| **Makrodaten** | offen | nicht recherchiert |
| **Nachrichten** | offen | nicht recherchiert |

Die letzten drei stehen bewusst leer. Sie wurden in dieser Phase nicht
untersucht, weil sie für keine offene Frage gebraucht werden — und eine
Empfehlung ohne Recherche wäre genau das, was §13 untersagt.

---

## Wie diese Tabelle besser wird

In der Reihenfolge ihres Nutzens:

1. **Intrinio-Sandbox anfragen und die Gate-Tests laufen lassen.** Kostet
   nichts, schließt zwei von drei Gates, und liefert die ersten
   `RUNTIME_VERIFIED`-Befunde des Projekts.

2. **Die Sharadar-Lizenzfrage klären.** Welcher Tarif gilt für eine öffentliche
   Website? Ohne diese Antwort ist jede Kostenrechnung gegenstandslos.

3. **Primärdokumentation direkt lesen**, sobald eine Umgebung ohne
   Egress-Beschränkung zur Verfügung steht. Das hebt mehrere Befunde von
   `THIRD_PARTY_REPORTED` auf `DOCUMENTATION_VERIFIED` und könnte Gate B bei
   Sharadar schließen.

4. **Erst dann** einen bezahlten Zugang. Welchen, steht in
   `VU_PHASE3_IMPLEMENTATION_REPORT.md`, Frage 8.

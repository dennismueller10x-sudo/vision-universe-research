# Vision Universe – Root-Cause-Audit der kanonischen Kursdaten

Stand: 17. Oktober 2026. Forensischer Diagnoseauftrag, **nicht zertifizierend**. Keine neue Corporate-Action-Heuristik, keine Schwellenänderung, keine Quarantäne-Regel, keine Strategieänderung, keine Änderung an `main` oder an bestehenden PRs.

Begleitdokument: [VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md](VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md). Artefakte: [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/). Lauf: Actions-Run 39053330565 sowie Nachläufe <!-- RERUNS -->.

## Kurzantwort

**Was ist kaputt?**
- **Der Hauptfehler ist ein gemeinsamer Fehler (Klasse C).**
  - Tiingo liefert bei einem Teil der Pennystocks einen Übernachtsprung von 10× bis 5.000× ohne Split-Faktor. Die bereinigte Spalte springt mit.
  - VUs kanonischer Kern 1.0.0 prüft einen fehlenden Split nur gegen genau diese Spalte. Er übernimmt den Sprung deshalb als Marktbewegung.
- **Beleg für die Provider-Seite.** An 674 von 707 untersuchten Ereignistagen (95,3 %) zeigt Tiingo in keiner der beiden Spalten ein Ereignis. An allen 272 Extremsprüngen aus V2/V3 ist es ebenso.
- **Wie viel davon unabhängig bestätigt ist.** Von 616 solchen Ereignissen im gültigen Tournament-Präfix (226 Segmente) belegt eine unabhängige Quelle (FINRA, SEC 8-K, SEC-Aktienzahl) nur 42 als nicht deklarierte Kapitalmaßnahme (37 Wertpapiere). 54 haben einen SEC-Gegenbeleg; die übrigen 520 sind ungeklärt oder ohne jeden Beleg.

**Wie groß ist der Fehler?**
- 304 von 8.995 Wertpapieren (3,4 %) gehören zu irgendeiner historischen Auffälligkeits-Population.
- Unabhängig bestätigt fehlerhaft sind 37 (0,41 %) im Tournament-Präfix.
- Betroffen sind 616 Renditetage, das sind 0,004 % der 14,37 Mio. Bars. Das Kursniveau ist bei 2,28 % der Bars verschoben (nach dem Ereignis).

**Wer verursacht ihn?**
- Primär der Provider: fehlende Kapitalmaßnahme in beiden Spalten.
- Sekundär VU: fehlende Schutzprüfung im Kern 1.0.0, nachgewiesen durch das deterministische Beispiel E5/E6.
- Unabhängig davon VU-Infrastrukturfehler im Backtest (A4, A5, A8). Sie sind belegt, aber nur in einem nie auf die sechs Methoden angewandten V4-Runner behoben.

**Wirkung auf Backtests:** siehe Begleitdokument. Kurz: `UNDERPERFORMANCE_REMAINS`; nur Turtle hängt an einem einzigen bestätigten Ereignis.

## 1. Ausgangslage: Zustand der PRs

Alle neun PRs sind offene Drafts, ungemergt und unverändert. #758 ist vom Owner eingefroren.

| PR | Branch-Head | Rolle für diesen Audit |
|---|---|---|
| #643 | `cc9ecb5b` | Kalibrierung V2; binary64-Cash-Defekt (B1) belegt; 52W-Abstimmungsfehler ursächlich ungeklärt |
| #677 | `98653c5d` | V3-Kalibrierung + Tournament (Run 38685897684, Freeze `V3-84caf2e84e560bec`); alle Kennzahlen versiegelt |
| #705 | `547d604d` | V4-Messschicht NOT_CERTIFIED, EW 0,145; Diagnose 0,992; Befunde A1–A14, R1–R17 |
| #709 / #712 | `8b766fa4` / `26e6cafa` | Bücher / Quellenakzeptanz; keine Kursdatenquelle |
| #721 | `eccc597d` | Kern 1.2.0; Root-Cause-Aussage „Tiingo verfehlt 23 Reverse-Splits in beiden Spalten“ |
| #722 | `75c6fd00` | forensische Klassen der 83 und 74 (D2 = 11) |
| #737 | `0d8e2755` | Vertrag 2.2.0, SEC-Evidenz, Partial Series; 272 Extremsprünge |
| #758 | `f8644cf1` | Protokoll 3.0.0 NOT_READY; FINRA; 272 = 21/4/53/194; R3-01..03 HIGH offen |

**Neuer Befund zur Reproduzierbarkeit.**
- Die Datenkopie, auf der #737 und #758 rechneten, ist nicht die der V3-/V4-Freezes.
  - Freeze: Fingerabdruck `318c051f…`, 9.408 Segmente, 14.374.702 Bars.
  - #737: `aea43179…` und `c8715919…`, je 9.407 Segmente.
  - #758 und dieser Audit: `b3ca8681…`, 9.407 Segmente, 14.371.749 Bars.
- Die eigenen PREPARE-Dateien beider PRs melden `sameCanonicalContentAsV4Freeze: false`. Der Text von #758 sagt dennoch, die Kopie „reproduziere den V4-Freeze“.
- Die R2-Ablage ist live, die Abweichung ist klein (−1 Segment, −0,02 % Bars).
- Folge: Die V2/V3-Populationen (272, 194) und alle heutigen Zahlen beziehen sich auf eine leicht andere Kopie als die 83/74 von #705/#721. Die Populationen selbst reproduzieren sich trotzdem exakt (83, 74, 11, 272).

## 2. Architektur der Kursdaten (Bestandsaufnahme, Abschnitt 3 des Auftrags)

Vollständig mit Dateien, Tests und Fehlerquellen: [`PRODUCT-DATA-LINEAGE.json`](data-quality/root-cause-audit/PRODUCT-DATA-LINEAGE.json) (Feld `layers`).

| # | Schicht | Kernbefund |
|---|---|---|
| 1 | Provider-Rohdaten | Tiingo `/tiingo/daily/{sym}/prices`: rohe OHLCV, adj*-Spalten, `divCash`, `splitFactor` je Bar (`providers/tiingo/adapter.js:504-527`). R2-Schlüssel sind **Ticker**, nicht securityIds (`history-store.js:49-57`). |
| 2 | Adjusted/Raw-Konvention | VU baut splitbereinigte Kurse selbst aus Rohkurs und Split-Faktor (ADR-002). Ausnahme: Quant-Faktoren lesen die Provider-Spalte (`market-factors.js:165-169,218-220`). |
| 3 | Corporate-Action-Ingestion | In Produktion gibt es keine eigene Quelle, nur die Felder je Bar. SEC und FINRA nur in #737/#758 (ungemergt). |
| 4 | Identität | `core/identity.js` ist die Norm, mit vier Inline-Nachbauten. Research-Segmente bilden `tiingo:EX:TICKER:START` und brechen an Lücken über 30 Tage. Kein Identitätsfehler unter den 83 (#722) nachgewiesen. |
| 5 | Kanonische Preise | Fünf Split-Implementierungen, alle mit derselben Geometrie (deterministisch geprüft, F1). Der Tiingo-Adapter rundet auf 4 Nachkommastellen. |
| 6 | Total Return | `canonical-total-return.js` 1.0.0; Arithmetik korrekt (E1–E4). Die Rohkurs-Splitprüfung läuft nur ohne Provider-adjClose (Zeilen 220-229): **Schutzlücke VU-01**. |
| 7 | Consumer-Adapter | Pfade je Produkt in `PRODUCT-DATA-LINEAGE.json`. Quant-Studien werfen ganze Reihen weg (R8). |
| 8 | Backtest-Engine | `runner-certified-v3` (Tournament). A4: Positionen ohne Bar unbegrenzt zum letzten Kurs. A5: Quarantäne-Termin vor `observedAt`. |
| 9 | Portfolio-Accounting | Datenquarantäne mit 0,7 abgerechnet wie ein Delisting (A5). Dust nicht wertbewusst (A8). binary64 behoben (B1). |
| 10 | Benchmark | SPY-TR aus derselben Kopie; IWM/QQQ/IWV fehlen. Die Produktion vergleicht nur Preisrenditen. |

**Der Research-Backtest-Pfad ist nicht der Produktpfad.**
- Das Tournament liest R2 (`tiingo`, `tiingo-delisted`) über `tournament/data.mjs`. Diese Datei existiert nur auf den PR-Branches.
- Discover, Screener, Technical und Supertrader-Produktion lesen `.market-cache` und die veröffentlichten Reihen.
- Ausnahme: `scripts/supertrader/house/live.mjs` liest R2 wie die Research-Seite.

## 3. Provider-Audit: Tiingo und Marketstack

Details: [`PROVIDER-COMPARISON-MATRIX.json`](data-quality/root-cause-audit/PROVIDER-COMPARISON-MATRIX.json).

- **Ein Vergleich Tiingo gegen Marketstack ist nicht möglich.**
  - Marketstack wird nur für Europa genutzt; US-Börsen sind im Code abgelehnt (`US_SCOPE_REFUSED`, `europe-quality.mjs:38`).
  - Es gibt keine US-Marketstack-Daten in der Ablage, also keine gemeinsamen Securities, Listings oder Tage.
- **Marketstack taugt nicht als Corporate-Action-Orakel.**
  - Alle 449 europäischen Split-Abfragen waren leer, und 40 Split/Dividend-Abfragen in Phase 2 lieferten 0 Ereignisse.
  - Bei den bereinigten Reihen sind 417 von 449 widersprüchlich.
  - Einen gemeinsamen Vorlieferanten dokumentiert das Repository nicht.
- **Plan und Rechte beruhen auf Eigentümer-Angaben.**
  - Tiingo: kommerziell laut Owner; Vertragstext nicht im Repo; Weitergabe vs. Anzeige offen.
  - Marketstack: 100.000 Anfragen/Monat laut Nutzer, `verifiedAccountPlan: false`.
- **Tiingo-Selbstkonsistenz.** adjClose gegen die eigenen Rohspalten: 98,7 % der 60.991 Dividenden- und Split-Ereignisse konsistent; 463 von 3.184 Wertpapieren mit mindestens einer Abweichung (`quant/data/providers/return-basis-universe-study.json`).
- **Provider-Ort der heutigen Ereignisse (707 Tage)**, bestimmt an Tiingos Rohkurs gegen adjClose am Ereignistag:

| Lage | Tage |
|---|---|
| kein Ereignis in beiden Tiingo-Spalten (adjClose springt mit) | 674 |
| teilweise Anpassung | 27 |
| Spalten widersprechen sich (adjClose stetig, Rohkurs springt, kein Split-Faktor) | 4 |
| deklarierter Split, adjClose stetig | 2 |

- **Minimaler Bedarf für Live-Abfragen.**
  - Tiingo: 0 zusätzliche Kosten (im Abo). Eine permaTicker-Prüfung der rund 245 Ereignis-Wertpapiere braucht ungefähr 245 Anfragen.
  - Marketstack: für US nicht im Scope; eine Ausweitung wäre eine Lizenz- und Planfrage.
  - **Hier wurde keine Live-Abfrage gemacht.**

## 4. Unabhängige Evidenz und Klassen

Quellen im Lauf:
- SEC 8-K/6-K-Ereignisse und FINRA OTC Daily List aus den zusammengeführten Eingaben von Run 39019906367: 70.395 SEC-Dokumente, 1 nicht lesbar.
- SEC-Aktienzahlen aus der Kopie.
- **Kein zweiter Preisanbieter.** Der Yahoo-Kanal aus #758 wurde nicht benutzt (Auftrag) und ist nicht im Runner reproduzierbar (#758 R3-01). Damit fehlen die Klassen `CORROBORATED_BY_SECOND_PROVIDER` und `GENUINE_PRICE_MOVE` (bestätigt) in diesem Lauf vollständig.

Census im gültigen Tournament-Präfix: 616 Ereignisse in 226 Segmenten.

| Klasse (Auftrag Abschnitt 5) | Ereignisse | davon Kanal |
|---|---|---|
| CONFIRMED_BY_INDEPENDENT_SOURCE | 42 | <!-- CHANNELS --> |
| CORROBORATED_BY_SECOND_PROVIDER | nicht gemessen | Vendor nicht benutzt |
| PROVIDER_DISAGREEMENT | 4 (+2 deklarierter Split ohne adj-Sprung) | Tiingo-Spalten untereinander |
| VU_TRANSFORMATION_DEFECT | 0 Ereignisse; Schutzlücke VU-01 und Accounting-Fehler A4/A5/A8 | Code |
| GENUINE_PRICE_MOVE (bestätigt) | 0 | ohne zweiten Anbieter nicht belegbar |
| INSUFFICIENT_EVIDENCE | 200 | kein Kanal deckt den Tag |
| UNRESOLVED | 320 | Kanäle vorhanden, keiner entscheidet |
| (Gegenbeleg gegen Split: SEC-Aktienzahl unverändert) | 54 | spricht für echte Bewegung oder Einheitenfehler |

## 5. Untersuchungspopulation: getrennte Zählebenen

Universum (Nenner): 9.407 Segmente/Listings, 8.995 Wertpapiere (securityId), 6.649 Unternehmen (CIK).

| Population | Zeilen | Segmente | Wertpapiere | Unternehmen (CIK) |
|---|---|---|---|---|
| V4: 83 Security-Months | 83 | 67 | 67 | 54 |
| V4: 74 Hochpreis-Fälle > 1e6 | 74 | 74 | 74 | 68 |
| D2: 11 „Defekte“ | 11 | 11 | 11 | 9 |
| V2/V3: 272 Extremsprünge | 272 | 202 | 159 | 103 |
| V3: Holds | 518 | 376 | 305 | 209 |
| V3: widersprüchliche Holds (SEC/Provider) | 69 | 60 | 60 | 59 |
| Tournament-Quarantänen | 521 | 521 | 403 | 279 |
| Census dieses Audits (Präfix) | 616 | 226 | 214 | 149 |
| davon unabhängig bestätigt | 42 | 37 | 37 | 37 |
| **Vereinigung aller Auffälligkeits-Populationen** | – | **355** | **304** | **231** |

Überschneidungen (Segmente):
- 83 ∩ 272 = 28; 83 ∩ Census = 42; 74 ∩ D2 = 11.
- 272 ∩ Census = 157; 272 ∩ Holds = 111.

Zusammengeführte Ereignistage (Segment|Tag, dedupliziert): **707**.
- nur Census: 369; Census+272: 178; nur 272 (außerhalb des Tournament-Präfixes): 64.
- 83-Leittag allein: 27; Census+83: 36; Census+272+83: 20; D2-Tage: 13.

Die **194 zuletzt ungeklärten** Fälle aus #758 beruhen auf Vendor-Labels; ohne Vendor sind von den 272 heute 19 SEC/FINRA-bestätigt und 253 ungeklärt. Eine Zuordnung zu den 194 ist ohne die versiegelten #758-Zeilen nicht möglich: **UNKNOWN**.

## 6. Ursachenklassifikation

### Die 83 Security-Months

Forensische Ursache nach #722 gegen unabhängigen Beleg am Leittag:

| #722-Ursache | Anzahl | unabhängig bestätigt | Gegenbeleg | ungeklärt | ohne Beleg |
|---|---|---|---|---|---|
| GENUINE_PRICE_MOVE | 40 | 11 | 5 | 18 | 6 |
| UNDECLARED_REVERSE_SPLIT | 23 | 11 | 1 | 8 | 3 |
| CURRENCY_OR_UNIT | 7 | 2 | 0 | 3 | 2 |
| PROVIDER_SPIKE | 4 | 0 | 0 | 2 | 2 |
| STALE_PRICE | 2 | 0 | 0 | 1 | 1 |
| DECLARED_SPLIT_INCONSISTENT | 1 | 1 | 0 | 0 | 0 |
| DECLARED_SPLIT_DATE_SHIFT | 1 | 1 | 0 | 0 | 0 |
| UNRESOLVED | 5 | 1 | 2 | 0 | 2 |

<!-- K83CHANNEL -->

Provider-Ort: Bei allen 23 „unerklärten Reverse-Splits“ zeigt Tiingo in keiner Spalte ein Ereignis. Die Aussage von #721 ist damit reproduziert.

**Die #722-Klasse „Defekt“ ist kein unabhängiger Beweis.** Von 23 „unerklärten Reverse-Splits“ sind 11 unabhängig bestätigt; 1 hat einen Gegenbeleg; 11 sind offen.

### Die 11 D2-Fälle

Ursachen:
- 8 nicht deklarierte Sprünge in der Historie
- 2 inkonsistente deklarierte Splits
- 1 ungeklärt

An ihren 10 Defekttagen:
- 2 unabhängig bestätigt (beide inkonsistente deklarierte Splits)
- 6 ungeklärt
- 2 ohne Beleg

Damit ist #758 bestätigt: Der Name „D2-Defekt“ ist forensisch, nicht unabhängig belegt.

### Primärursache, sekundärer Effekt, fehlende Schutzprüfung

| Klasse (Auftrag Abschnitt 7) | Belegte Fälle | Primärursache | Sekundärer Verarbeitungseffekt | Fehlende Schutzprüfung |
|---|---|---|---|---|
| A Provider-Defekt | 42 Ereignisse (37 Wertpapiere) mit unabhängig bestätigter, nicht deklarierter Kapitalmaßnahme; 6 Tage mit widersprüchlichen Tiingo-Spalten | Tiingo: Split-Faktor fehlt, adjClose springt mit | Kern übernimmt den Sprung | VU-01 |
| B VU-Defekt | Accounting/Engine A4, A5, A8 (alle Tournament-Läufe); Rundung im Tiingo-Adapter (4 Stellen); Look-ahead in V4-Sanity (R7/R16) | VU-Code | – | – |
| C Gemeinsamer Fehler | dieselben 42 Ereignisse wie A | Provider | VU validiert nicht unabhängig | VU-01 |
| D Echte Marktentwicklung | 0 bestätigt (kein zweiter Anbieter); 54 mit SEC-Gegenbeleg gegen Split | – | – | – |
| E Nicht entscheidbar | 520 Census-Ereignisse | – | – | – |

Bewusst keine Prozentquote „Provider gegen VU“: A und C sind dieselben Fälle, und B wirkt auf andere Mechanismen (Bewertung, Termine) als auf die Kursdaten.

## 7. VU-eigene Fehler (Abschnitt 8 des Auftrags)

Deterministische Beispiele: `scripts/research/price-root-cause/tests/deterministic-examples.test.mjs` (läuft gegen die Engines auf `main`).

| ID | Bereich | Bewertung | Status |
|---|---|---|---|
| VU-01 | Kern 1.0.0: Rohkurs-Splitprüfung nur ohne adjClose | fehlender Datenvertrag | **bestätigt** (E5 gegen E6) |
| VU-02 | A4: Positionen ohne Bar unbegrenzt bewertet | Bug im Code | **bestätigt** (V4-Befund; nur in runner-v4 behoben) |
| VU-03 | A5: Quarantäne-Termin vor `observedAt`; Faktor 0,7 auf Datenereignis | Bug (Look-ahead) + Modellannahme | **bestätigt** |
| VU-04 | B1 binary64 (behoben) / A8 Dust | Bug im Code | bestätigt |
| VU-05 | `daily-prices.mjs` verwirft ganze Reihen | Modellannahme mit Bias | bestätigt (#721 R8) |
| VU-06 | V4-Sanity Look-ahead (R7/R16) | Bug | bestätigt |
| VU-07 | Tiingo-Adapter rundet auf 4 Stellen | Bug, geringe Wirkung (nur Multi-Asset) | **bestätigt** (F1) |
| VU-08 | Fünf Split-Implementierungen | fehlender Vertrag (ADR-002) | **keine Abweichung** (F1) |
| VU-09 | Identität / Ticker-Schlüssel | fehlender Vertrag | kein Defekt nachgewiesen |
| VU-10 | Split-/Dividenden-/TR-Arithmetik, Timing | – | **korrekt** (E1–E4, E8) |
| VU-11 | Turtle-Unit-Stops (V41-F1) | Strategie-Fidelity, kein Datenfehler | offen (#712) |

Geprüft ohne neuen Befund: Forward- und Reverse-Split-Behandlung, Split+Dividende am selben Tag, deklarierter Split ohne Kurssprung, Dividenden-Reinvestition zum Schluss des Ex-Tags, Missing-Bar-Valuation (→ A4), synthetische Terminal-Bars (→ B2, behoben), Survivorship (Universum beobachtungsbasiert, A11).

## 8. Wie groß ist der Datenfehler?

| Kennzahl | Wert | Nenner |
|---|---|---|
| Wertpapiere gesamt | 8.995 | securityId |
| mit unabhängig bestätigtem Fehler (Präfix) | 37 (0,41 %) | 8.995 |
| mit irgendeiner Auffälligkeit (Vereinigung) | 304 (3,4 %) | 8.995 |
| nur ungeklärte Auffälligkeiten | ≤ 267 | Vereinigung − bestätigt |
| Security-Months (V4-Signatur) | 83 (0,017 %) | 493.362 EW-Security-Months der V4-Konstruktion |
| Renditetage mit Ereignis (Präfix) | 616 (0,004 %) | 14.371.749 Bars |
| Bars mit verschobenem Niveau nach dem Ereignis | 327.775 (2,28 %) | 14.371.749 |
| Bars hinter Quarantänen nicht genutzt | 401.827 (2,72 %) | 14.773.577 Ablage-Bars im Zeitraum |

Verteilung der 707 Ereignistage:
- **nach Kurs vor dem Sprung:** 570 unter 1 $, 60 bei 1–5 $, 39 bei 5–20 $, 20 bei 20–100 $, 18 ab 100 $.
- **nach Börse:** 539 NASDAQ, 80 NYSE MKT, 71 NYSE, 14 AMEX, 3 BATS.
- **nach Jahr:** Schwerpunkte 2018 (146), 2019 (100) und 2017 (74).

Ein Ereignis zählt einmal als Renditetag. Die Niveauverschiebung wird getrennt ausgewiesen und nicht als unabhängige Fehler gezählt.

## 9. Betroffenheit der Produktwelten

[`PRODUCT-DATA-LINEAGE.json`](data-quality/root-cause-audit/PRODUCT-DATA-LINEAGE.json)

| Produkt | Kursquelle | Kern | Abhängigkeit vom Fehler | nachweislich betroffen | eigener Fix |
|---|---|---|---|---|---|
| Supertrader Research | R2 über `tournament/data.mjs` | TR 1.0.0 | direkt | **ja**: V4-Kalibrierung, Tournament-Eingaben | ja (Gate A) |
| Quant-Studien | `.market-cache` → `daily-prices.mjs` | TR 1.0.0 | gleiche Schutzlücke; zusätzlich Ganzreihen-Verwurf | möglich, nicht gemessen | ja (je Studie) |
| Quant-Faktoren | `.market-cache` | Provider-adjClose | übernehmen den Provider-Sprung direkt | möglich | ja (Methodik-Sprung) |
| Supertrader Produktion | technical-signals, discover-series-long, SPY | keiner (geerbt) | indirekt über Technical/Discover | möglich | über Technical; `house/live.mjs` eigener Fix |
| Discover | discover-series(-long) | return-series | Anzeige: Sprung als echte Bewegung | möglich (Anzeige) | optional |
| Screener | discover-series | geerbt | nur Ereignisse im letzten Jahr | möglich | nein (fließt mit) |
| Technical | `.market-cache` | canonical-bars | SMA200/RS/Elliott sehen den Sprung | möglich | empfohlen |
| Vorsorge | Tiingo direkt (ETFs) | TR 1.0.0 | formal; ETFs selten betroffen | nicht beobachtet | nein |

Sicher nicht auf dem Research-Pfad: Discover Europe (Marketstack), SEC-Fundamentaldaten und die Methodikseiten.

## 10. Antworten auf die 20 Fragen

<!-- ANSWERS -->

## 11. Unabhängiger Review

<!-- REVIEW -->

## 12. Grenzen

- **Kein zweiter Preisanbieter.** Damit gibt es keine bestätigten echten Bewegungen; FINRA deckt nur OTC ab.
- **SEC-Aktienzahlen sind ein schwacher Kanal.** Quartalsweise, Fenster ±200 Tage, und ein deklarierter Split in der Nähe kann sie vortäuschen (Kanalauswertung in Abschnitt 4).
- **Die Datenkopie ist live** und nicht bitgleich mit den Freezes.
- **Einzelfälle, Ticker und Kurse sind nur an den Owner versiegelt** (`run-*/sealed/`).

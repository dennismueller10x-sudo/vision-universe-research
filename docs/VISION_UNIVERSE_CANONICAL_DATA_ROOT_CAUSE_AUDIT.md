# Vision Universe – Root-Cause-Audit der kanonischen Kursdaten

Stand: 18. Oktober 2026. Forensischer Diagnoseauftrag, **nicht zertifizierend**. Keine neue Corporate-Action-Heuristik, keine Schwellenänderung, keine Quarantäne-Regel, keine Strategieänderung, keine Änderung an `main` oder an bestehenden PRs.

Begleitdokument: [VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md](VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md). Artefakte: [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/).

Maßgeblicher Lauf: Actions-Run **39073148967** (Kopie `b3ca8681…`, in allen Jobs per `--expect-fingerprint` erzwungen). Der Vorlauf 39053330565 wurde vom unabhängigen Review geprüft; seine Zahlen sind durch den Nachlauf ersetzt.

## Kurzantwort

**Was ist nachweislich kaputt?**
- **Bestätigt ist wenig, offen ist viel.** Im gültigen Tournament-Präfix gibt es 616 Ereignistage mit einem rohen Übernachtsprung ≥ 10× ohne Split-Faktor oder einem Split-Rest ≥ 2×. Davon sind unter strenger Prüfung **28 Ereignisse (26 Wertpapiere)** unabhängig als nicht deklarierte Kapitalmaßnahme belegt. Das ist eine Untergrenze unter den verfügbaren Kanälen (Klasse C, gemeinsamer Fehler).
  - Strenge Prüfung heißt: Das angegebene Verhältnis erklärt den Sprung auf ±25 %, es gibt keinen SEC-Widerspruch, und kein deklarierter Split liegt innerhalb von 200 Tagen.
  - Die lockere Zählung des Vorlaufs (42 Ereignisse, 37 Wertpapiere) hielt dem Review nicht stand. Von den 42 bleiben 28; 7 haben ein Verhältnis, das den Sprung nicht erklärt; 6 sind durch einen nahen deklarierten Split verwechselbar; 1 widerspricht der SEC-Aktienzahl.
- **Die Mehrheit ist nicht entscheidbar (Klasse E).** 588 der 616 Ereignisse sind ungeklärt (320), ohne Beleg (200), mit Gegenbeleg gegen einen Split (54) oder strittig (14). Ob dahinter ein Provider-Fehler, eine echte Bewegung oder ein Einheitenfehler steckt, ist offen.

**Wer verursacht es?**
- **Provider und VU gemeinsam bei den bestätigten Fällen.** Tiingo fehlt der Split-Faktor in beiden Spalten. VUs Kern 1.0.0 prüft den Rohkurs-Sprung nur, wenn keine adjClose-Spalte existiert (Schutzlücke VU-01, deterministisch nachgewiesen mit E5/E6).
- **Der Provider-Ort ist kein Schuldbeleg.** An 674 von 707 Ereignistagen bewegen sich beide Tiingo-Spalten gemeinsam. Das sähe bei einer echten Kursbewegung genauso aus. Der Ort sagt nur, *wo* ein Defekt säße, *falls* es einer ist.
- **VU-eigene Infrastrukturfehler (A4, A5, A8)** betreffen die Backtest-Bewertung, nicht die Kursdaten. Sie sind nur in einem nie auf die sechs Methoden angewandten V4-Runner behoben.

**Wie groß ist es?**
- 26 von 8.995 Wertpapieren (0,29 %) sind streng bestätigt.
- 304 Wertpapiere (3,4 %) liegen in einer Ereignis-Population, 687 (7,6 %) einschließlich Holds und Quarantänen.
- 28 bestätigte Renditetage von 14,37 Mio. Bars; 11 bestätigte von 493.258 EW-Security-Months.

**Wirkung auf Backtests** (Begleitdokument): `UNDERPERFORMANCE_REMAINS`. Nur Turtle reagiert stark, und davon die Hälfte auf VU-Accounting-Fixes.

## 1. Ausgangslage: Zustand der PRs

Alle neun PRs sind offene Drafts, ungemergt und unverändert. #758 ist vom Owner eingefroren.

| PR | Branch-Head | Rolle für diesen Audit |
|---|---|---|
| #643 | `cc9ecb5b` | Kalibrierung V2; binary64-Cash-Defekt (B1) belegt; 52W-Abstimmungsfehler ursächlich ungeklärt |
| #677 | `98653c5d` | V3-Kalibrierung + Tournament (Run 38685897684, Freeze `V3-84caf2e84e560bec`); alle Kennzahlen versiegelt |
| #705 | `547d604d` | V4-Messschicht NOT_CERTIFIED, EW 0,145 (Run 38722939085); Diagnose 0,992 (Run 38724718674); Befunde A1–A14, R1–R17 |
| #709 / #712 | `8b766fa4` / `26e6cafa` | Bücher / Quellenakzeptanz; keine Kursdatenquelle |
| #721 | `eccc597d` | Kern 1.2.0; Aussage „Tiingo verfehlt 23 Reverse-Splits in beiden Spalten“ |
| #722 | `75c6fd00` | forensische Klassen der 83 und 74 (D2 = 11) |
| #737 | `0d8e2755` | Vertrag 2.2.0, SEC-Evidenz, Partial Series; 272 Extremsprünge |
| #758 | `f8644cf1` | Protokoll 3.0.0 NOT_READY; FINRA; 272 = 21/4/53/194; R3-01..03 HIGH offen |

**Befund zur Reproduzierbarkeit.**
- Die Datenkopie, auf der #737, #758 und dieser Audit rechnen, ist nicht die der V3-/V4-Freezes.
  - Freeze: `318c051f…`, 9.408 Segmente, 14.374.702 Bars.
  - #737: `aea43179…` und `c8715919…`, je 9.407 Segmente.
  - #758 und dieser Audit: `b3ca8681…`, 9.407 Segmente, 14.371.749 Bars.
- Die PREPARE-Dateien beider PRs melden `sameCanonicalContentAsV4Freeze: false`. Der Text von #758 sagt dennoch, die Kopie „reproduziere den V4-Freeze“.
- Die R2-Ablage ist live. Die Abweichung ist klein: −1 Segment, −2.953 Bars (−0,02 %).
- Die Populationen selbst reproduzieren sich trotzdem exakt (83, 74, 11, 272).

## 2. Architektur der Kursdaten

Vollständig mit Dateien, Tests und Fehlerquellen: [`PRODUCT-DATA-LINEAGE.json`](data-quality/root-cause-audit/PRODUCT-DATA-LINEAGE.json) (Feld `layers`).

| # | Schicht | Kernbefund |
|---|---|---|
| 1 | Provider-Rohdaten | Tiingo `/tiingo/daily/{sym}/prices`: rohe OHLCV, adj*-Spalten, `divCash`, `splitFactor` je Bar (`providers/tiingo/adapter.js:504-527`). R2-Schlüssel sind **Ticker**, nicht securityIds (`history-store.js:49-57`). |
| 2 | Adjusted/Raw-Konvention | VU baut splitbereinigte Kurse selbst aus Rohkurs und Split-Faktor (ADR-002). Ausnahme: Quant-Faktoren lesen die Provider-Spalte (`market-factors.js:165-169,218-220`). |
| 3 | Corporate-Action-Ingestion | In Produktion keine eigene Quelle, nur die Felder je Bar. SEC und FINRA nur in #737/#758 (ungemergt). |
| 4 | Identität | `core/identity.js` ist die Norm, mit vier Inline-Nachbauten. Research-Segmente `tiingo:EX:TICKER:START` brechen an Lücken über 30 Tage. Kein Identitätsfehler unter den 83 (#722). |
| 5 | Kanonische Preise | Fünf Split-Implementierungen mit derselben Geometrie (F1). Der Tiingo-Adapter rundet auf 4 Nachkommastellen. |
| 6 | Total Return | `canonical-total-return.js` 1.0.0; Arithmetik korrekt (E1–E4). Rohkurs-Splitprüfung nur ohne Provider-adjClose (Zeilen 220-229): **Schutzlücke VU-01**. |
| 7 | Consumer-Adapter | Pfade je Produkt in `PRODUCT-DATA-LINEAGE.json`. Quant-Studien werfen ganze Reihen weg (R8). |
| 8 | Backtest-Engine | `runner-certified-v3` (Tournament). A4: Positionen ohne Bar unbegrenzt zum letzten Kurs. A5: Quarantäne-Termin vor `observedAt`. |
| 9 | Portfolio-Accounting | Datenquarantäne mit Faktor 0,7 abgerechnet wie ein Delisting (A5). Dust nicht wertbewusst (A8). binary64 behoben (B1). |
| 10 | Benchmark | SPY-TR aus derselben Kopie; IWM/QQQ/IWV fehlen. Die Produktion vergleicht nur Preisrenditen. |

**Der Research-Backtest-Pfad ist nicht der Produktpfad.**
- Das Tournament liest R2 (`tiingo`, `tiingo-delisted`) über `tournament/data.mjs`. Die Datei existiert nur auf PR-Branches.
- Discover, Screener, Technical und Supertrader-Produktion lesen `.market-cache` und die veröffentlichten Reihen.
- Ausnahme: `scripts/supertrader/house/live.mjs` liest R2 wie die Research-Seite.

## 3. Provider-Audit: Tiingo und Marketstack

Details: [`PROVIDER-COMPARISON-MATRIX.json`](data-quality/root-cause-audit/PROVIDER-COMPARISON-MATRIX.json).

- **Tiingo gegen Marketstack ist nicht vergleichbar.**
  - Marketstack wird nur für Europa genutzt; US-Börsen sind im Code abgelehnt (`US_SCOPE_REFUSED`, `europe-quality.mjs:38`).
  - Es gibt keine US-Marketstack-Daten in der Ablage, also keine gemeinsamen Securities, Listings oder Tage.
- **Marketstack taugt nicht als Corporate-Action-Orakel.**
  - Alle 449 europäischen Split-Abfragen waren leer; 40 Split/Dividend-Abfragen in Phase 2 lieferten 0 Ereignisse.
  - 417 von 449 bereinigten Reihen sind widersprüchlich.
  - Einen gemeinsamen Vorlieferanten dokumentiert das Repository nicht.
- **Plan und Rechte beruhen auf Eigentümer-Angaben.**
  - Tiingo: kommerziell laut Owner; Vertragstext nicht im Repo; Weitergabe gegen Anzeige offen.
  - Marketstack: 100.000 Anfragen/Monat laut Nutzer, `verifiedAccountPlan: false`.
- **Tiingo-Selbstkonsistenz.** adjClose stimmt mit den eigenen Rohspalten bei 98,7 % der 60.991 Dividenden- und Split-Ereignisse überein. 463 von 3.184 Wertpapieren haben mindestens eine Abweichung (`quant/data/providers/return-basis-universe-study.json`).
- **Keine Live-Abfrage gemacht.** Eine permaTicker-Prüfung der rund 245 Ereignis-Wertpapiere bräuchte etwa 245 Metadaten-Anfragen im bestehenden Tiingo-Abo. Marketstack-US wäre eine Plan- und Lizenzfrage.

**Provider-Ort an den 707 zusammengeführten Ereignistagen** (eigene Basis: Tage). Er zeigt, wo ein Defekt säße, **falls** einer vorliegt. Er beweist keinen.

| Lage (Tiingo Rohkurs gegen adjClose am Tag) | Tage |
|---|---|
| kein Ereignis in beiden Spalten (adjClose springt mit) | 674 |
| teilweise Anpassung | 27 |
| Spalten widersprechen sich (adjClose stetig, Rohkurs springt, kein Split-Faktor) | 4 |
| deklarierter Split, adjClose stetig | 2 |

Nur die letzten beiden Zeilen (6 Tage) sind provider-intern widersprüchlich und damit ohne fremden Beleg als Provider-Inkonsistenz erkennbar. Sie werden getrennt von den bestätigten Kapitalmaßnahmen gezählt.

## 4. Unabhängige Evidenz und Klassen

**Quellen.**
- SEC 8-K/6-K und FINRA OTC Daily List aus den zusammengeführten Eingaben von Run 39019906367 (70.395 SEC-Dokumente, 1 nicht lesbar).
- SEC-Aktienzahlen aus der Kopie.
- **Kein zweiter Preisanbieter.** Der Yahoo-Kanal aus #758 wurde nicht benutzt (Auftrag) und ist nicht im Runner reproduzierbar (#758 R3-01).

**Abdeckung der Kanäle** (Ebene Segment, 9.407):

| Kanal | Abdeckung |
|---|---|
| CIK vorhanden | 7.352 |
| SEC-Aktienzahl-Zeilen | 7.108 |
| FINRA-Zeilen (nur Symbol im Listing-Fenster, kein Namensabgleich) | 851 |
| Ticker mit mehr als einem CIK | 0 |

Die bestätigten Zahlen sind deshalb **Untergrenzen unter den abgedeckten Kanälen**. Rund 22 % der Segmente haben keine CIK, FINRA deckt nur OTC ab, und das SEC-Fenster ist unvollständig.

**Census im gültigen Tournament-Präfix: 616 Ereignisse, 226 Segmente, 214 Ticker/securityIds.**

| Strenge Klasse | Ereignisse | Bedeutung |
|---|---|---|
| CONFIRMED_BY_INDEPENDENT_SOURCE | **28** (26 Wertpapiere) | Kanal belegt die Maßnahme, Verhältnis passt ±25 %, kein Widerspruch, kein naher deklarierter Split |
| RATIO_DOES_NOT_EXPLAIN_MOVE | 7 | Kanal nennt ein Verhältnis, das den Sprung nicht erklärt (Review IR-03) |
| CONFOUNDED_BY_DECLARED_SPLIT | 6 | nur SEC-Aktienzahl, deklarierter Split ≤ 200 Tage entfernt (IR-05) |
| CONFLICTING_INDEPENDENT_EVIDENCE | 1 | FINRA/8-K-Verhältnis, aber SEC-Aktienzahl unverändert (IR-04) |
| INDEPENDENT_EVIDENCE_AGAINST_SPLIT | 54 | SEC-Aktienzahl unverändert |
| INSUFFICIENT_EVIDENCE | 200 | kein Kanal deckt den Tag |
| UNRESOLVED | 320 | Kanäle vorhanden, keiner entscheidet |
| CORROBORATED_BY_SECOND_PROVIDER | nicht gemessen | kein zweiter Anbieter |
| GENUINE_PRICE_MOVE (bestätigt) | 0 | ohne zweiten Anbieter nicht belegbar |

**Kanäle der lockeren 42:** SEC 8-K 14, nur SEC-Aktienzahl 13, FINRA (nur Symbol) 9, nur SEC-Aktienzahl mit nahem deklariertem Split 6.

**Verhältnis-Test der 23 Ereignisse mit genanntem Verhältnis:** 15 erklären den Sprung auf ±25 %, 5 liegen zwischen 1,25× und 2×, 3 weichen um mehr als 2× ab.

**Warum strenger?** Der V3-Audit desselben Laufs fand 7 von 7 Normalisierungen, die FINRA/8-K gegen eine widersprechende Aktienzahl durchsetzten, falsch. Der lockere Test prüfte nur die Richtung des Verhältnisses (`explains(0,01; 2)` war wahr).

## 5. Untersuchungspopulation: getrennte Zählebenen

Universum (Nenner): 9.407 Segmente/Listings, 8.995 Ticker/securityIds, 6.649 Unternehmen (CIK). „securityId“ ist hier die ticker-abgeleitete Identität aus `core/identity.js`, kein permaTicker.

| Population | Zeilen | Ticker/securityIds |
|---|---|---|
| V4: 83 Security-Months | 83 | 67 |
| V4: 74 Hochpreis-Fälle > 1e6 | 74 | 74 |
| D2: 11 „Defekte“ | 11 | 11 |
| V2/V3: 272 Extremsprünge | 272 | 159 |
| V3: Holds | 518 | 305 |
| V3: widersprüchliche Holds (SEC/Provider) | 69 | 60 |
| Tournament-Quarantänen | 521 | 403 |
| Census dieses Audits (Präfix) | 616 | 214 |
| davon streng bestätigt | 28 | 26 |

| Vereinigung | Segmente | Ticker/securityIds | CIK |
|---|---|---|---|
| Ereignis-Populationen (83, 74, D2, 272, Census) | 355 | 304 | 231 |
| einschließlich Holds und Quarantänen (Schutzentscheidungen) | 837 | 687 | 503 |

**Überschneidungen (Segmente):**
- 83 ∩ 272 = 28; 83 ∩ Census = 42; 83 ∩ Census (bestätigt, locker) = 15
- 74 ∩ D2 = 11

**Zusammengeführte Ereignistage** (Segment|Tag, dedupliziert): **707**.
- nur Census 369; Census+272 178; nur 272 (außerhalb des Präfixes) 64.
- 83-Leittag allein 27; Census+83 36; Census+272+83 20; D2-Tage 13.

**Die 194 zuletzt ungeklärten Fälle aus #758** beruhen auf Vendor-Labels. Ohne Vendor sind von den 272 heute 19 SEC/FINRA-bestätigt und 253 ungeklärt. Eine Zuordnung zu den 194 ist ohne die versiegelten #758-Zeilen nicht möglich: **UNKNOWN**.

## 6. Ursachenklassifikation

### Die 83 Security-Months

Forensische Ursache nach #722 gegen strenge unabhängige Klasse am Leittag:

| #722-Ursache | Anzahl | streng bestätigt | Verhältnis passt nicht | verwechselbar | Gegenbeleg | ungeklärt | ohne Beleg |
|---|---|---|---|---|---|---|---|
| GENUINE_PRICE_MOVE | 40 | 1 | 1 | 9 | 5 | 18 | 6 |
| UNDECLARED_REVERSE_SPLIT | 23 | 7 | 4 | 0 | 1 | 8 | 3 |
| CURRENCY_OR_UNIT | 7 | 2 | 0 | 0 | 0 | 3 | 2 |
| PROVIDER_SPIKE | 4 | 0 | 0 | 0 | 0 | 2 | 2 |
| STALE_PRICE | 2 | 0 | 0 | 0 | 0 | 1 | 1 |
| DECLARED_SPLIT_INCONSISTENT | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| DECLARED_SPLIT_DATE_SHIFT | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| UNRESOLVED | 5 | 0 | 1 | 0 | 2 | 0 | 2 |
| **Summe** | **83** | **11** | **7** | **9** | **8** | **32** | **16** |

- **Die #722-Klasse „Defekt“ ist kein unabhängiger Beweis.** Von 23 „unerklärten Reverse-Splits“ sind 7 streng bestätigt.
- **Die #721-Aussage ist nur als Ort reproduziert.** Bei allen 23 zeigt Tiingo in keiner Spalte ein Ereignis. Belegt als Kapitalmaßnahme sind davon 7.
- **Richtung und Kursniveau der 83:** 78 Aufwärts-, 5 Abwärtssprünge. 50 Fälle hatten vor dem Sprung einen Rohkurs unter 1 $, 17 einen von 1–5 $, 16 einen von 5–20 $.

### Die 11 D2-Fälle

Ursachen:
- 8 nicht deklarierte Sprünge in der Historie
- 2 inkonsistente deklarierte Splits
- 1 ungeklärt

An ihren 10 Defekttagen:
- 2 unabhängig bestätigt (beide inkonsistente deklarierte Splits)
- 6 ungeklärt
- 2 ohne Beleg

Der Name „D2-Defekt“ ist forensisch, nicht unabhängig belegt (bestätigt #758).

### Primärursache, sekundärer Effekt, fehlende Schutzprüfung

| Klasse | Belegte Fälle | Primärursache | Sekundärer Verarbeitungseffekt | Fehlende Schutzprüfung |
|---|---|---|---|---|
| A Provider-Defekt | 28 Census-Ereignisse (26 Wertpapiere), streng bestätigt; Untergrenze | Tiingo: Split-Faktor fehlt, adjClose springt mit | Kern übernimmt den Sprung | VU-01 |
| (getrennt) Provider-interne Inkonsistenz | 6 Tage (4 Spalten widersprechen sich, 2 deklarierte Splits ohne adj-Sprung) | Tiingo | – | – |
| B VU-Defekt | Accounting/Engine A4, A5, A8 (alle Tournament-Läufe); Rundung im Tiingo-Adapter; Look-ahead in V4-Sanity (R7/R16) | VU-Code | – | – |
| C Gemeinsamer Fehler | dieselben 28 Ereignisse wie A | Provider | VU validiert nicht unabhängig | VU-01 |
| D Echte Marktentwicklung | 0 bestätigt; 54 mit SEC-Gegenbeleg gegen einen Split | – | – | – |
| E Nicht entscheidbar | 588 der 616 Census-Ereignisse | offen: Provider-Auslassung, echte Bewegung oder Einheitenfehler | – | – |

Bewusst keine Prozentquote „Provider gegen VU“. A und C sind dieselben Fälle, und B wirkt auf andere Mechanismen (Bewertung, Termine) als auf die Kursdaten.

## 7. VU-eigene Fehler

Deterministische Beispiele: `scripts/research/price-root-cause/tests/deterministic-examples.test.mjs` (läuft gegen die Engines auf `main`).

| ID | Bereich | Bewertung | Status |
|---|---|---|---|
| VU-01 | Kern 1.0.0: Rohkurs-Splitprüfung nur ohne adjClose | fehlender Datenvertrag | **bestätigt** (E5 gegen E6) |
| VU-02 | A4: Positionen ohne Bar unbegrenzt bewertet | Bug im Code | **bestätigt** (V4-Befund; nur in runner-v4 behoben) |
| VU-03 | A5: Quarantäne-Termin vor `observedAt`; Faktor 0,7 auf Datenereignis | Look-ahead-Bug + Modellannahme | **bestätigt**; 143 von 521 Terminen verschieben sich kausal |
| VU-04 | B1 binary64 (behoben) / A8 Dust | Bug im Code | bestätigt |
| VU-05 | `daily-prices.mjs` verwirft ganze Reihen | Modellannahme mit Bias | bestätigt (#721 R8) |
| VU-06 | V4-Sanity Look-ahead (R7/R16) | Bug | bestätigt |
| VU-07 | Tiingo-Adapter rundet auf 4 Stellen | Bug, geringe Wirkung (nur Multi-Asset) | **bestätigt** (F1) |
| VU-08 | Fünf Split-Implementierungen | fehlender Vertrag (ADR-002) | **keine Abweichung** (F1) |
| VU-09 | Identität / Ticker-Schlüssel | fehlender Vertrag | kein Defekt nachgewiesen |
| VU-10 | Split-/Dividenden-/TR-Arithmetik, Timing | – | **korrekt** (E1–E4, E8) |
| VU-11 | Turtle-Unit-Stops (V41-F1) | Strategie-Fidelity, kein Datenfehler | offen (#712) |

**Deterministisch geprüft ohne neuen Befund:**
- Forward- und Reverse-Split-Behandlung
- Split und Dividende am selben Tag
- deklarierter Split ohne Kurssprung
- Dividenden-Reinvestition zum Schluss des Ex-Tags
- Missing-Bar-Valuation (→ A4)
- synthetische Terminal-Bars (→ B2, behoben)

**Nicht gesucht:** TR-Sprünge ohne Rohkurssprung (|log TR| ≥ log 2 bei |log Roh| < log 1,25, ohne Dividende). Diese Klasse ist nur über E1–E10 und F1 deterministisch geprüft, nicht über die Daten gezählt (Review IR-12).

## 8. Wie groß ist der Datenfehler?

| Kennzahl | Wert | Nenner |
|---|---|---|
| Ticker/securityIds gesamt | 8.995 | – |
| streng bestätigt fehlerhaft (Präfix, Untergrenze) | 26 (0,29 %) | 8.995 |
| in einer Ereignis-Population | 304 (3,4 %) | 8.995 |
| einschließlich Holds und Quarantänen | 687 (7,6 %) | 8.995 |
| nur ungeklärte Auffälligkeiten | ≤ 278 | 304 − 26 |
| bestätigte Security-Months (V4-Signatur) | 11 (0,002 %) | 493.258 EW-Security-Months der V4-Konstruktion (berechnet im Lauf) |
| alle 83 Security-Months | 83 (0,017 %) | 493.258 |
| bestätigte Renditetage (Präfix) | 28 | 14.371.749 Bars |
| alle Census-Renditetage (Präfix) | 616 (0,004 %) | 14.371.749 |
| Bars mit verschobenem Niveau nach allen Census-Ereignissen | 327.775 (2,28 %) | 14.371.749 |
| Bars mit verschobenem Niveau nach bestätigten Ereignissen | UNKNOWN (nicht getrennt gezählt) | – |
| Bars hinter Quarantänen nicht genutzt | 401.827 (2,72 %) | 14.773.577 Ablage-Bars im Zeitraum |

**Verteilung der 707 Ereignistage:**
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

1. **Wie viele einzelne Aktien sind nachweislich betroffen?** 26 Ticker/securityIds, streng bestätigt im gültigen Tournament-Präfix. Das ist eine Untergrenze unter den abgedeckten Kanälen (lockere Zählung 37). Zusätzlich 2 D2-Fälle mit bestätigtem inkonsistentem deklariertem Split. Eine deduplizierte Gesamtzahl über alle Populationen mit strenger Klasse ist nicht berechnet: **UNKNOWN**.
2. **Wie viele haben nur ungeklärte Auffälligkeiten?** Höchstens 278 (304 in Ereignis-Populationen minus 26 bestätigte). Mit Holds und Quarantänen höchstens 661 (687 − 26).
3. **Wie viele Bars oder Monate sind nachweislich fehlerhaft?** 28 Renditetage und 11 Security-Months. Die davon ausgehende Niveauverschiebung in Bars ist nur für alle 616 Ereignisse gezählt (327.775), nicht für die bestätigten: **UNKNOWN**.
4. **Welcher Anteil des Universums ist betroffen?** Bestätigt 0,29 % der Wertpapiere, 0,002 % der EW-Security-Months, 0,0002 % der Bars. Auffällig 3,4 % der Wertpapiere, 7,6 % mit Holds und Quarantänen.
5. **Welche Fehler kommen nachweislich von Tiingo?**
   - 28 streng bestätigte, nicht deklarierte Kapitalmaßnahmen, die in beiden Spalten fehlen (Untergrenze).
   - 6 provider-intern widersprüchliche Tage.
   - Selbstkonsistenz: 463 von 3.184 Wertpapieren mit mindestens einer adjClose-Abweichung.
6. **Welche Fehler entstehen nachweislich bei Vision Universe?** VU-01 (Schutzlücke im Kern), A4, A5 (Look-ahead und Faktor 0,7), A8, VU-05 (Ganzreihen-Verwurf), VU-06 (Look-ahead V4-Sanity), VU-07 (Rundung). Arithmetik, Timing und Split-Geometrie sind korrekt.
7. **Welche Fehler sind kombinierte Provider-/VU-Probleme?** Dieselben 28 Ereignisse: Tiingo lässt den Split-Faktor aus, und VU-01 lässt den Sprung durch.
8. **Wie unterscheiden sich Tiingo und Marketstack?** Nicht messbar. Es gibt keine gemeinsamen US-Securities, -Listings oder -Tage. Marketstack liefert in Europa keine Splits (449/449 leer).
9. **Ist Yahoo unabhängiger oder genauer belegt?** **UNKNOWN.** Der Yahoo-Kanal aus #758 wurde auftragsgemäß nicht benutzt. Er ist im Runner nicht reproduzierbar (#758 R3-01), und seine Labels sind versiegelt.
10. **Wie viele Reverse Splits wurden falsch verarbeitet?** Mindestens 28 Ereignisse (26 Wertpapiere) im Präfix, alle als Marktbewegung durchgelassen. Von den 23 #722-„Reverse-Splits“ der 83 sind 7 streng bestätigt. Darüber hinaus **UNKNOWN**, weil 588 Ereignisse unentschieden sind.
11. **Wie viele echte Kursbewegungen wurden fälschlich gesperrt?** **UNKNOWN.** Ohne zweiten Preisanbieter ist keine Bewegung als echt bestätigt.
    - Obergrenze für das Original-Tournament: 63 Quarantänen „Corporate Action widersprochen“.
    - Für V3: 69 widersprüchliche Holds.
    - 54 Census-Ereignisse haben einen SEC-Gegenbeleg gegen einen Split, sind aber im Original nicht gesperrt.
12. **Wie stark beeinflussen diese Fehler die Kalibrierung?**
    - Bestätigte Korrekturen allein wirken praktisch nicht: EW 0,145 → 0,144–0,146; MOM-Spread 0,038 → 0,033; VAR-Spread −0,002 → −0,002.
    - Die Lücke schließt sich erst, wenn nicht bestätigte Fälle ausgeschlossen werden (0,963 bzw. 0,992).
    - Alle Varianten bleiben FAIL.
13. **Wie stark beeinflussen sie die sechs Methoden?**
    - Strenge Datenkorrekturen (C2 gegen B): 0,0 Punkte CAGR bei fünf Methoden. Bei Turtle +2,0 Punkte, und zwar aus einem einzigen Ereignis, das abgeschnitten wurde.
    - VU-Accounting-Fixes (B gegen A): Turtle +2,0, Weinstein −0,7, die übrigen ≤ 0,2.
14. **Ändern sich CAGR, Drawdown oder Rankings?**
    - CAGR: wie in Frage 13.
    - Drawdown: Turtle +3,8 und Weinstein +2,8 Punkte flacher.
    - Ränge: A → B tauschen 52W und Weinstein Rang 2/3 (CAGR) und 1/2 (Sharpe). C2 ändert gegenüber B keinen Rang. Drawdown-Ränge bleiben gleich.
    - Alle 54 Methode×Szenario-Zellen liegen unter SPY.
15. **Welche Produkte verwenden wirklich die betroffenen Datenpfade?**
    - Nachweislich: Supertrader Research (Tournament, V4-Kalibrierung) und `house/live.mjs`.
    - Möglich, nicht gemessen: Quant, Technical, Discover, Screener, Supertrader Produktion.
    - Nicht beobachtet: Vorsorge.
16. **Welche VU-Bugs sind zweifelsfrei nachgewiesen?** VU-01, A4, A5, A8, VU-06 und VU-07 (deterministisch oder per Code-Nachweis). VU-05 ist eine belegte Modellannahme mit Bias.
17. **Was bleibt mangels unabhängiger Quellen ungeklärt?**
    - 588 der 616 Census-Ereignisse
    - 253 der 272 Extremsprünge
    - 6 der 10 D2-Defekttage
    - 72 der 83 Security-Months
    - die Zuordnung der 194 aus #758
18. **Was zuerst beheben?** (Empfehlung, jeweils eigener PR mit Vorher/Nachher; hier nicht umgesetzt)
    1. A4/A5/A8 aus `runner-v4` in den Tournament-Runner übernehmen. Das ist die größte gemessene Wirkung (Turtle, Weinstein) und braucht keine neuen Daten.
    2. VU-01 schließen: Rohkurs-Sprung auch bei vorhandener adjClose prüfen und als Hold melden, nicht reparieren.
    3. Evidenzkanäle verbreitern: CIK-Lücke von 2.055 Segmenten schließen, permaTicker abgleichen.
19. **Was geht mit vorhandenen Daten und Budget?**
    - Die 15 streng bestätigten Ereignisse mit Verhältnis lassen sich wie deklarierte Splits normalisieren; die übrigen 13 bestätigten lassen sich nur sperren.
    - Die permaTicker-Prüfung (~245 Anfragen) passt ins bestehende Tiingo-Abo.
    - A4/A5/A8 brauchen keine Daten.
    - Für Marketstack-US, Yahoo oder einen zweiten US-Anbieter gibt es kein Budget.
20. **Minimaler nächster Schritt zurück zu den buchbasierten Strategien:**
    - Den Tournament-Runner auf die V4-Infrastruktur heben (Szenario B als neue Basis, eigener Supertrader-PR mit Vorher/Nachher).
    - Die unentschiedenen Ereignisse als Hold- und Sensitivitätsband mitführen.
    - Die Datenfehler erklären die Unterperformance nicht. Der Engpass sind Messinfrastruktur und Strategie-Fidelity, nicht die Kursdaten.

## 11. Unabhängiger Review

[`INDEPENDENT-REVIEW.json`](data-quality/root-cause-audit/INDEPENDENT-REVIEW.json). Ein getrennter, adversarialer Reviewer prüfte Lauf 39053330565 und beide Dokumente: 21 Befunde (4 HIGH, 13 MEDIUM, 4 LOW), 18 Aussagen ohne Beanstandung verifiziert.

| HIGH | Befund | Lösung |
|---|---|---|
| IR-01 | Provider-Ort als Beleg für die Provider-Seite dargestellt | Ort nur noch „falls Defekt“, eigene Tabelle (Abschnitt 3) |
| IR-02 | Schlagzeile ruht auf 42 von 616 Ereignissen | Schlagzeile: Mehrheit ist Klasse E; bestätigt nur 28 |
| IR-03 | Verhältnis-Test prüfte nur die Richtung | strenge Klasse mit ±25 %; Nachlauf 39073148967 |
| IR-04 | FINRA/8-K setzte widersprechende Aktienzahl außer Kraft | Klasse CONFLICTING; aus C2 ausgeschlossen |

**Status:**
- 19 Befunde gelöst.
- 1 teilweise gelöst: IR-05, Verwechslungsprüfung nur im selben Segment, nicht über alle Segmente derselben securityId/CIK.
- 1 offengelegt: IR-12, TR-only-Sprünge nicht gesucht.
- **Kein HIGH oder CRITICAL offen.**
- Die Lösungen hat der Autor auf dem Nachlauf geprüft. Ein zweiter unabhängiger Durchgang lief auf den fertigen Dokumenten (siehe `INDEPENDENT-REVIEW.json`, Feld `secondPass`).

## 12. Grenzen

- **Kein zweiter Preisanbieter.** Keine Bewegung ist als echt bestätigt; FINRA deckt nur OTC ab und gleicht nur das Symbol ab.
- **SEC-Aktienzahlen sind ein schwacher Kanal.** Sie sind quartalsweise und haben ein Fenster von ±200 Tagen. Ein deklarierter Split in anderen Segmenten derselben Firma kann sie weiter vortäuschen (IR-05, teilweise).
- **Die Datenkopie ist live** und nicht bitgleich mit den Freezes.
- **Der V3-PIT-Abnahmetest von #758 ist nicht bestanden.** Die V3-Holds hier sind ein Nachbau ohne Vendor, keine abgenommene Policy.
- **Frühere Zahlen in der Git-Historie.** Mittlere Differenz und Tracking Error des Vorlaufs sind aus den öffentlichen Dateien entfernt (IR-20), stehen aber noch in der Historie dieses Branches (Commit `bc8b6cb10`). Ob vor einem Merge gesquasht wird, entscheidet der Owner.
- **Einzelfälle, Ticker und Kurse sind nur an den Owner versiegelt** (`run-*/sealed/`).

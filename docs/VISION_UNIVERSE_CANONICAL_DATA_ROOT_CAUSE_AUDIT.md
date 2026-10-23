# Vision Universe – Root-Cause-Audit der kanonischen Kursdaten

Stand: 18. Oktober 2026. Forensischer Diagnoseauftrag, **nicht zertifizierend**. Keine neue Corporate-Action-Heuristik, keine Schwellenänderung, keine Quarantäne-Regel, keine Strategieänderung, keine Änderung an `main` oder an bestehenden PRs.

Abschlussbericht für Entscheider: [VISION_UNIVERSE_PRICE_AUDIT_FINAL_REPORT.md](VISION_UNIVERSE_PRICE_AUDIT_FINAL_REPORT.md). Backtest-Wirkung: [VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md](VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md). Artefakte: [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/).

**Maßgeblicher Lauf: Actions-Run 39100831867, Datenstand `862c4242…`.** Alle acht Jobs lasen nachweislich identische Eingaben (Abschnitt 2). Die Vorläufe 39053330565 und 39073148967 rechneten auf `b3ca8681…`. Diese Kopie ist nicht mehr herstellbar, ihre Zahlen gelten nur für diesen Stand und werden nicht als reproduziert ausgegeben.

## Kurzantwort

**Was ist nachweislich kaputt?**
- **17 Kapitalmaßnahmen in 17 Wertpapieren** fehlen in beiden Tiingo-Spalten und sind unabhängig und streng belegt.
  - Belegquellen: SEC 8-K (9), FINRA (6), SEC-Aktienzahl (2).
  - Streng heißt: das belegte Verhältnis oder die Änderung der Aktienzahl erklärt den Sprung auf ±25 %, es gibt keinen Widerspruch und keinen deklarierten Split in der Nähe.
  - 16 davon sind nicht deklarierte Reverse-Splits (Kurssprung aufwärts), 1 ist ein nicht deklarierter Forward-Split.
  - Das ist eine Untergrenze unter den verfügbaren Kanälen.
- **Die große Mehrheit ist nicht entscheidbar.** 599 der 616 Ereignistage im gültigen Tournament-Präfix sind ungeklärt, ohne Beleg, haben einen Gegenbeleg oder sind strittig. Ob dahinter ein Provider-Fehler, eine echte Bewegung oder ein Einheitenfehler steckt, ist **UNKNOWN**.

**Wer verursacht es?**
- **Bei den 17: Tiingo und VU gemeinsam.** Tiingo lässt den Split-Faktor aus. VUs Kern 1.0.0 prüft den Rohkurs-Sprung nur, wenn keine adjClose-Spalte existiert (Schutzlücke VU-01, deterministisch nachgewiesen).
- **VU-eigene Fehler im Backtest:** A4 (unbegrenzte Bewertung ohne Kurs), A5 (Look-ahead beim Quarantäne-Termin, Faktor 0,7) und A8 (Dust). Sie betreffen die Bewertung, nicht die Kursdaten.
- **Echte Marktbewegungen: 0 bestätigt**, weil kein zweiter Preisanbieter genutzt wurde.

**Wie groß ist es?**
- 17 von 8.994 Wertpapieren (0,19 %) sind bestätigt.
- 304 (3,4 %) liegen in einer Auffälligkeits-Population, 687 (7,6 %) einschließlich Holds und Quarantänen.
- 8 von 493.154 EW-Security-Months sind bestätigt fehlerhaft.

**Wirkung auf die sechs Methoden:** Die bestätigten Datenfehler ändern CAGR und Drawdown um **0,0 Punkte**. Die VU-Accounting-Fehler ändern Turtle um +2,0 und Weinstein um −0,7 Punkte CAGR. Alle Methoden bleiben unter SPY.

## 1. Ausgangslage

Alle neun Vor-PRs sind offene Drafts, ungemergt und unverändert. #758 ist vom Owner eingefroren.

| PR | Branch-Head | Rolle |
|---|---|---|
| #643 | `cc9ecb5b` | Kalibrierung V2; binary64-Cash-Defekt (B1) |
| #677 | `98653c5d` | V3-Kalibrierung + Tournament (Run 38685897684, Freeze `V3-84caf2e84e560bec`); Kennzahlen versiegelt |
| #705 | `547d604d` | V4-Messschicht NOT_CERTIFIED; EW 0,145 (Run 38722939085), Diagnose 0,992 (Run 38724718674); A1–A14 |
| #709 / #712 | `8b766fa4` / `26e6cafa` | Bücher / Quellenakzeptanz |
| #721 | `eccc597d` | Kern 1.2.0; „Tiingo verfehlt 23 Reverse-Splits in beiden Spalten“ |
| #722 | `75c6fd00` | forensische Klassen der 83 und 74 (D2 = 11) |
| #737 | `0d8e2755` | SEC-Evidenz, Partial Series; 272 Extremsprünge |
| #758 | `f8644cf1` | Protokoll 3.0.0 NOT_READY; FINRA; 272 = 21/4/53/194 |

## 2. Datenstände und Reproduzierbarkeit

[`DATA-STATE-COMPARISON.json`](data-quality/root-cause-audit/DATA-STATE-COMPARISON.json), erzeugt mit `scripts/research/price-root-cause/data-states.mjs` nur aus öffentlichen Capture-Belegen.

**Wie ein Capture entsteht.** Jeder Job baut ihn neu. Er liest rund 9.050 Tiingo-Historienobjekte und 9 Quellobjekte aus der privaten R2-Ablage, lädt Tiingos Liste unterstützter Ticker live herunter und setzt das heutige Datum als Stichtag. Danach wird der Capture gelöscht. Ein gemeinsamer Fingerabdruck allein beweist deshalb nicht, dass Jobs dieselben Daten sahen. Geprüft wurden alle Inhaltsbindungen jedes Jobs:
- Hash über alle Objekt-Hashes
- Quellobjekte
- Listing-Tabelle
- normalisierte Teil-Liste und normalisiertes Manifest
- normalisierte Eingaben

Rohe Manifest- und Teil-Hashes enthalten Zeitstempel und sind kein Inhaltsbeleg.

| Datenstand | Belege (Jobs) | alle Eingaben identisch | Segmente (gelesen / nutzbar) | Historienobjekte | Tiingo-Listingzeilen | CIK |
|---|---|---|---|---|---|---|
| `318c051f…` Freeze V3/V4, 15.10. | 2 | ja | 9.410 / 9.408 | 9.051 | 16.562 | 7.353 |
| `b3ca8681…` 17.10. (Läufe 39053330565, 39073148967) | 15 | ja | 9.409 / 9.407 | 9.050 | 16.566 | 7.352 |
| `d27efdd4…` 18.10. 01:53 (abgebrochener Lauf 39088073626) | 1 | – | 9.408 / 9.406 | 9.049 | 16.565 | 7.351 |
| **`862c4242…` 18.10. 05:31 (Lauf 39100831867)** | **8** | **ja** | 9.408 / 9.406 | 9.049 | 16.565 | 7.350 |

**Ursachen der Änderungen:**

| Schritt | R2-Objekte | Quellobjekte | Listing-Tabelle | Ursache |
|---|---|---|---|---|
| Freeze → `b3ca8681` | geändert | geändert | geändert | VU-Datenläufe zwischen 15. und 17.10. schrieben Provider-Daten in die Ablage (Beispiele: `market-data-refresh` 38987427690, `supertrader-house-live` 39008085244; nicht vollständig aufgezählt) und die Tiingo-Liste änderte sich |
| `b3ca8681` → `d27efdd4` | ein Objekt weniger | gleich | geändert | **belegt:** Tiingos Liste verlor eine Zeile (16.566 → 16.565). Kein VU-Lauf schrieb im Fenster in die Ablage (alle Läufe aller Branches geprüft). **Abgeleitet:** der Stichtag wechselte vom 17. auf den 18.10. |
| `d27efdd4` → `862c4242` | **gleich** | gleich | geändert | **belegt:** identische Ablage; nur der Inhalt von Tiingos Live-Liste änderte sich (eine CIK weniger) |

**Was sich trotz Drift nicht änderte:**
- 707 Ereignistage und ihr Provider-Ort
- die 83, 74, 11 und 272
- die Vereinigungen 304 und 687
- 2.200 Monate über +100 %
- die French-Varianten bis auf ±0,003
- alle CAGR-Deltas gegenüber dem Vorlauf bis auf ±0,1 Punkte

**Was sich nicht bestimmen lässt: UNKNOWN.** Welche Wertpapiere, Bars oder Kapitalmaßnahmen sich zwischen den Ständen inhaltlich änderten, geht aus den Belegen nicht hervor. Die Objekt-Hashes einzeln und die Captures selbst werden außerhalb des Runners nicht gespeichert.

**Snapshot: nicht angelegt.**
- Der S3-Treiber verbietet Versionierung und Object Lock (`s3-driver.mjs:165-182`), und kein Workflow bewahrt den Capture auf.
- Für Reproduzierbarkeit wären nötig:
  - ein an den Owner verschlüsselter Capture unter einem Write-once-Präfix
  - die archivierten Bytes der Tiingo-Liste
  - ein fester Stichtag (`V3_OBSERVED_AT`)
- Das ist eine Owner-Entscheidung für einen eigenen PR, kein Teil dieses Audits.

## 3. Architektur der Kursdaten

Vollständig: [`PRODUCT-DATA-LINEAGE.json`](data-quality/root-cause-audit/PRODUCT-DATA-LINEAGE.json).

| # | Schicht | Kernbefund |
|---|---|---|
| 1 | Provider-Rohdaten | Tiingo: rohe OHLCV, adj*-Spalten, `divCash`, `splitFactor` je Bar (`providers/tiingo/adapter.js:504-527`). R2-Schlüssel sind Ticker (`history-store.js:49-57`). |
| 2 | Adjusted/Raw | VU baut splitbereinigte Kurse selbst (ADR-002). Ausnahme: Quant-Faktoren lesen die Provider-Spalte. |
| 3 | Corporate Actions | In Produktion keine eigene Quelle; SEC und FINRA nur in #737/#758. |
| 4 | Identität | `core/identity.js`; Research-Segmente brechen an Lücken über 30 Tage. Kein Identitätsfehler nachgewiesen. |
| 5 | Kanonische Preise | Fünf Split-Implementierungen mit derselben Geometrie (F1). Adapter rundet auf 4 Stellen. |
| 6 | Total Return | `canonical-total-return.js` 1.0.0; Arithmetik korrekt (E1–E4). Rohkurs-Splitprüfung nur ohne adjClose: **VU-01**. |
| 7 | Consumer | Pfade je Produkt in der Lineage-Datei. Quant-Studien verwerfen ganze Reihen (R8). |
| 8 | Backtest-Engine | `runner-certified-v3`: A4, A5. |
| 9 | Accounting | Faktor 0,7 auf Datenquarantäne (A5), Dust (A8). binary64 behoben. |
| 10 | Benchmark | SPY-TR; IWM/QQQ/IWV fehlen. |

Der Research-Backtest-Pfad liest R2 über `tournament/data.mjs` (nur auf PR-Branches). Die Produkte lesen `.market-cache` und veröffentlichte Reihen. Ausnahme ist `scripts/supertrader/house/live.mjs`.

## 4. Provider-Audit

[`PROVIDER-COMPARISON-MATRIX.json`](data-quality/root-cause-audit/PROVIDER-COMPARISON-MATRIX.json)

- **Tiingo gegen Marketstack ist nicht vergleichbar.** Marketstack wird nur für Europa genutzt (`US_SCOPE_REFUSED`, `europe-quality.mjs:38`). Es gibt keine gemeinsamen US-Securities, -Listings oder -Tage.
- **Marketstack taugt nicht als Corporate-Action-Quelle.** Alle 449 europäischen Split-Abfragen waren leer.
- **Tiingo-Selbstkonsistenz:**
  - 98,7 % von 60.991 Dividenden- und Split-Ereignissen sind konsistent.
  - 463 von 3.184 Wertpapieren haben mindestens eine Abweichung.
  - An **4 Tagen** widersprechen sich Tiingos eigene Spalten (adjClose stetig, Rohkurs springt, kein Split-Faktor).
- **Tiingos Live-Liste unterstützter Ticker ändert sich zwischen Läufen** (Abschnitt 2). Sie ist eine Eingabe jedes Captures.
- **Keine Live-Abfrage, keine zusätzlichen Kosten.**

**Provider-Ort an den 707 Ereignistagen.** Er zeigt, wo ein Defekt säße, *falls* einer vorliegt. Er beweist keinen.

| Lage | Tage |
|---|---|
| kein Ereignis in beiden Spalten | 674 |
| teilweise Anpassung | 27 |
| Spalten widersprechen sich | 4 |
| deklarierter Split, adjClose stetig (korrektes Provider-Verhalten) | 2 |

## 5. Unabhängige Evidenz und Klassen

**Quellen:**
- SEC 8-K/6-K und FINRA OTC Daily List (Run 39019906367)
- SEC-Aktienzahlen aus der Kopie
- **Kein zweiter Preisanbieter.** Yahoo aus #758 wurde auftragsgemäß nicht benutzt.

**Abdeckung (Segmente, 9.406):**
- CIK: 7.350
- SEC-Aktienzahlen: 7.106
- FINRA: 851, nur Symbolabgleich im Listing-Fenster
- Ticker mit mehr als einem CIK: 0

**Census im gültigen Präfix: 616 Ereignisse in 226 Segmenten.**

| Strenge Klasse | Ereignisse | Bedeutung |
|---|---|---|
| CONFIRMED_BY_INDEPENDENT_SOURCE | **17** (17 Wertpapiere) | Kanal belegt die Maßnahme, Verhältnis oder Aktienzahl passt ±25 %, kein Widerspruch, kein naher deklarierter Split |
| RATIO_DOES_NOT_EXPLAIN_MOVE | 12 | genanntes Verhältnis oder Aktienzahl erklärt den Sprung nicht |
| CONFOUNDED_BY_DECLARED_SPLIT | 11 | nur Aktienzahl, und ein deklarierter Split (am Tag selbst oder ≤ 200 Tage) verändert sie ebenfalls |
| SHARE_RISE_SPLIT_OR_DILUTION | 1 | Kursfall mit steigender Aktienzahl: Split oder Verwässerung nicht unterscheidbar |
| CONFLICTING_INDEPENDENT_EVIDENCE | 1 | Verhältnis genannt, Aktienzahl unverändert |
| INDEPENDENT_EVIDENCE_AGAINST_SPLIT | 54 | SEC-Aktienzahl unverändert |
| INSUFFICIENT_EVIDENCE | 200 | kein Kanal deckt den Tag |
| UNRESOLVED | 320 | Kanäle vorhanden, keiner entscheidet |

**Die 17 im Einzelnen** (Richtung des Rohkurses am Ereignistag):
- 9 × SEC 8-K, aufwärts
- 5 × FINRA, aufwärts
- 1 × FINRA, abwärts
- 2 × SEC-Aktienzahl, aufwärts

Mit Verhältnis normalisierbar sind 15; 2 lassen sich nur sperren.

**Prüfgrößen:**
- Verhältnistest der 23 Ereignisse mit genanntem Verhältnis: 15 passen auf ±25 %, 5 liegen zwischen 1,25× und 2×, 3 weichen um mehr als 2× ab.
- Aktienzahl-Test der 19 Ereignisse, die nur über die Aktienzahl bestätigt sind: 4 passen, 3 liegen zwischen 1,25× und 2×, 12 weichen um mehr als 2× ab.

**Lockere Zählung zum Vergleich:** 42 Ereignisse in 37 Wertpapieren. Zwei unabhängige Reviews wiesen sie als zu weit zurück, weil sie Verhältnisse nur auf die Richtung prüfte.

## 6. Untersuchungspopulation

Universum (Nenner): 9.406 Segmente, 8.994 Ticker/securityIds, 6.648 Unternehmen (CIK).

| Population | Zeilen | Ticker/securityIds |
|---|---|---|
| V4: 83 Security-Months | 83 | 67 |
| V4: 74 Hochpreis-Fälle | 74 | 74 |
| D2: 11 „Defekte“ | 11 | 11 |
| V2/V3: 272 Extremsprünge | 272 | 159 |
| V3: Holds | 518 | 305 |
| Tournament-Quarantänen | 521 | 403 |
| Census (Präfix) | 616 | 214 |
| davon streng bestätigt | 17 | 17 |

| Vereinigung | Segmente | Ticker/securityIds | CIK |
|---|---|---|---|
| Ereignis-Populationen (83, 74, D2, 272, Census) | 355 | 304 | 231 |
| einschließlich Holds und Quarantänen | 837 | 687 | 503 |

**Ereignistage:** 707 zusammengeführte Tage (Segment|Tag, dedupliziert).

**Zeiträume:** Schwerpunkte 2018 (146), 2019 (100) und 2017 (74). Quarantänen konzentrieren sich auf 2016 (82) und 2026 (130; die Ursache des Ballungsjahres 2026 ist nicht einzeln untersucht).

**Kursniveau:** 570 der 707 Tage haben einen Rohkurs unter 1 $ vor dem Sprung.

**Welche Aktien konkret?** Ticker, Daten und Fälle stehen **nur an den Owner versiegelt** in [`run-39100831867/sealed/POPULATION-CASES.owner.sealed.json`](data-quality/root-cause-audit/run-39100831867/sealed/). Die Daten sind lizenzpflichtig, Einzelfälle werden nicht öffentlich gemacht. Entschlüsselung mit dem Owner-Schlüssel zu `scripts/supertrader/validation/results-public-key.pem`.

**Die 194 aus #758** beruhen auf versiegelten Vendor-Labels; ihre Zuordnung ist **UNKNOWN**.

## 7. Ursachenklassifikation

### Die 83 Security-Months

| #722-Ursache | Anzahl | streng bestätigt | Verhältnis passt nicht | verwechselbar | Gegenbeleg | ungeklärt | ohne Beleg |
|---|---|---|---|---|---|---|---|
| GENUINE_PRICE_MOVE | 40 | 0 | 1 | 10 | 5 | 18 | 6 |
| UNDECLARED_REVERSE_SPLIT | 23 | 6 | 5 | 0 | 1 | 8 | 3 |
| CURRENCY_OR_UNIT | 7 | 2 | 0 | 0 | 0 | 3 | 2 |
| PROVIDER_SPIKE | 4 | 0 | 0 | 0 | 0 | 2 | 2 |
| STALE_PRICE | 2 | 0 | 0 | 0 | 0 | 1 | 1 |
| DECLARED_SPLIT_INCONSISTENT | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| DECLARED_SPLIT_DATE_SHIFT | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| UNRESOLVED | 5 | 0 | 1 | 0 | 2 | 0 | 2 |
| **Summe** | **83** | **8** | **8** | **11** | **8** | **32** | **16** |

- Die forensische #722-Klasse „Defekt“ ist kein Beweis: Von 23 „unerklärten Reverse-Splits“ sind 6 streng bestätigt.
- Von den 55 Monaten mit nicht deklariertem Rohsprung gehen 52 aufwärts; 43 hatten vor dem Sprung einen Rohkurs unter 1 $.

### Die 11 D2-Fälle

An ihren 10 Defekttagen ist keiner streng bestätigt:
- 2 sind durch ihren eigenen deklarierten Split verwechselbar
- 6 sind ungeklärt
- 2 haben keinen Beleg

Alle 10 Tage liegen im Census; sie kommen also nicht zusätzlich hinzu.

### Ursachenklassen

| Klasse | Belegte Fälle | Primärursache | Fehlende Schutzprüfung |
|---|---|---|---|
| A Tiingo-Fehler | 17 nicht deklarierte Kapitalmaßnahmen (Untergrenze); 4 Tage mit widersprüchlichen Spalten | Split-Faktor fehlt in beiden Spalten | VU-01 |
| B VU-Fehler | A4, A5, A8 im Backtest-Accounting; Look-ahead V4-Sanity (VU-06); Rundung (VU-07); Ganzreihen-Verwurf (VU-05) | VU-Code | – |
| C gemeinsamer Fehler | dieselben 17 wie A | Provider | VU-01 |
| D echte Marktbewegung | 0 bestätigt; 54 mit SEC-Gegenbeleg gegen einen Split | – | – |
| E nicht entscheidbar | 599 der 616 Census-Ereignisse; 253 der 272; 75 der 83 | **UNKNOWN** | – |

Es gibt bewusst keine Prozentquote „Provider gegen VU“. A und C sind dieselben Fälle, und B wirkt auf einen anderen Mechanismus.

## 8. VU-eigene Fehler

Deterministische Beispiele: `scripts/research/price-root-cause/tests/deterministic-examples.test.mjs` (gegen `main`).

| ID | Bereich | Status |
|---|---|---|
| VU-01 | Kern 1.0.0: Rohkurs-Splitprüfung nur ohne adjClose | **bestätigt** (E5/E6) |
| VU-02 | A4: Positionen ohne Bar unbegrenzt bewertet | **bestätigt**; nur in runner-v4 behoben |
| VU-03 | A5: Quarantäne-Termin vor `observedAt`, Faktor 0,7 | **bestätigt**; 143 von 521 Terminen verschieben sich kausal |
| VU-04 | B1 binary64 (behoben) / A8 Dust | bestätigt |
| VU-05 | Ganzreihen-Verwurf in Quant-Studien | bestätigt (Modellannahme mit Bias) |
| VU-06 | V4-Sanity Look-ahead | bestätigt |
| VU-07 | Tiingo-Adapter rundet auf 4 Stellen | bestätigt (F1), geringe Wirkung |
| VU-08 | fünf Split-Implementierungen | keine Abweichung (F1) |
| VU-09 | Identität | kein Defekt nachgewiesen |
| VU-10 | Split-, Dividenden-, TR-Arithmetik | korrekt (E1–E4, E8) |
| VU-11 | Turtle-Unit-Stops | Strategie-Fidelity, offen (#712) |

**Nicht gesucht:** TR-Sprünge ohne Rohkurssprung. Sie sind nur deterministisch geprüft, nicht in den Daten gezählt.

## 9. Wie groß ist der Datenfehler?

| Kennzahl | Wert | Nenner |
|---|---|---|
| streng bestätigt fehlerhafte Wertpapiere | 17 (0,19 %) | 8.994 |
| in einer Ereignis-Population | 304 (3,4 %) | 8.994 |
| einschließlich Holds und Quarantänen | 687 (7,6 %) | 8.994 |
| nur ungeklärte Auffälligkeiten | ≤ 287 | 304 − 17 |
| bestätigte Security-Months | 8 (0,002 %) | 493.154 EW-Security-Months (im Lauf berechnet) |
| alle 83 Security-Months | 83 (0,017 %) | 493.154 |
| bestätigte Renditetage | 17 | 14.368.796 Bars |
| alle Census-Renditetage | 616 (0,004 %) | 14.368.796 |
| Bars mit verschobenem Niveau nach allen Census-Ereignissen | 327.775 (2,28 %) | 14.368.796 |
| … nach bestätigten Ereignissen | **UNKNOWN** (nicht getrennt gezählt) | – |
| Bars hinter Quarantänen | 401.827 (2,72 %) | 14.770.624 Ablage-Bars im Zeitraum |

## 10. Betroffenheit der Produktwelten

| Produkt | Kursquelle | Kern | nachweislich betroffen | eigener Fix |
|---|---|---|---|---|
| Supertrader Research | R2 über `tournament/data.mjs` | TR 1.0.0 | **ja** (V4-Kalibrierung, Tournament) | ja (Gate A) |
| Quant-Studien | `.market-cache` → `daily-prices.mjs` | TR 1.0.0 | möglich, nicht gemessen | ja |
| Quant-Faktoren | `.market-cache` | Provider-adjClose | möglich | ja |
| Supertrader Produktion | technical-signals, discover-series-long | geerbt | möglich; `house/live.mjs` liest R2 | über Technical |
| Discover | discover-series(-long) | return-series | möglich (Anzeige) | optional |
| Screener | discover-series | geerbt | möglich | nein |
| Technical | `.market-cache` | canonical-bars | möglich | empfohlen |
| Vorsorge | Tiingo direkt (ETFs) | TR 1.0.0 | nicht beobachtet | nein |

## 11. Antworten auf die 20 Fragen

1. **Nachweislich betroffene Aktien:** 17 (streng, Untergrenze); identitätsgenau nur versiegelt. Eine deduplizierte Gesamtzahl über alle Populationen ist **UNKNOWN**.
2. **Nur ungeklärte Auffälligkeiten:** höchstens 287; mit Holds und Quarantänen höchstens 670.
3. **Nachweislich fehlerhafte Bars oder Monate:** 17 Renditetage, 8 Security-Months. Die Niveauverschiebung nach den bestätigten Ereignissen ist **UNKNOWN**.
4. **Anteil am Universum:** 0,19 % der Wertpapiere bestätigt, 3,4 % auffällig, 7,6 % mit Holds und Quarantänen.
5. **Nachweislich von Tiingo:**
   - 17 ausgelassene Kapitalmaßnahmen
   - 4 Tage mit widersprüchlichen Spalten
   - 463 von 3.184 Wertpapieren mit Selbstinkonsistenz
   - die Live-Ticker-Liste ändert sich zwischen Läufen
6. **Nachweislich bei VU:** VU-01, A4, A5, A8, VU-05, VU-06, VU-07.
7. **Kombiniert:** die 17 (Tiingo-Auslassung plus VU-01).
8. **Tiingo gegen Marketstack:** nicht messbar; keine Überlappung.
9. **Yahoo:** **UNKNOWN**; auftragsgemäß nicht benutzt und nicht reproduzierbar.
10. **Falsch verarbeitete Reverse-Splits:** mindestens 16 (streng, nicht deklariert, aufwärts); darüber hinaus **UNKNOWN**.
11. **Fälschlich gesperrte echte Bewegungen:** **UNKNOWN**. Obergrenzen: 63 Quarantänen „Corporate Action widersprochen“ im Tournament, 69 widersprüchliche V3-Holds.
12. **Wirkung auf die Kalibrierung:**
    - Bestätigte Korrekturen allein ergeben 0,145 → 0,144.
    - Ohne die 75 nicht bestätigten der 83 Monate: 0,965; ohne alle 83: 0,992.
    - Alle Varianten bleiben FAIL.
13. **Wirkung auf die sechs Methoden:**
    - Bestätigte Datenkorrekturen: 0,0 Punkte.
    - VU-Fixes: Turtle +2,0, Weinstein −0,7, übrige ≤ 0,2.
14. **CAGR, Drawdown, Ränge:**
    - Ränge ändern sich nur durch die VU-Fixes (52W und Weinstein tauschen), nicht durch Datenkorrekturen.
    - Drawdown: Turtle +1,7 und Weinstein +2,8 Punkte flacher, beides durch die VU-Fixes.
15. **Produkte auf den betroffenen Pfaden:**
    - nachweislich: Supertrader Research und `house/live.mjs`
    - möglich: Quant, Technical, Discover, Screener, Supertrader Produktion
16. **Zweifelsfrei nachgewiesene VU-Bugs:** VU-01, A4, A5, A8, VU-06, VU-07.
17. **Mangels Quellen ungeklärt:**
    - 599 der 616 Census-Ereignisse
    - 253 der 272 Extremsprünge
    - 10 der 10 D2-Tage
    - 75 der 83 Security-Months
    - die 194 aus #758
18. **Zuerst beheben:**
    1. A4/A5/A8 in den Tournament-Runner übernehmen
    2. VU-01 als Hold-Signal schließen
    3. Captures reproduzierbar machen

    Jeweils eigener PR mit Vorher/Nachher; hier nicht umgesetzt.
19. **Mit vorhandenen Daten und Budget:**
    - 15 Ereignisse normalisieren, 2 sperren
    - permaTicker-Prüfung im bestehenden Tiingo-Abo (~245 Anfragen)
    - A4/A5/A8 brauchen keine Daten
20. **Minimaler nächster Schritt zu den buchbasierten Strategien:** Korrektur 1, also Szenario B als Messbasis, dann mit den Büchern beginnen. Details im [Abschlussbericht](VISION_UNIVERSE_PRICE_AUDIT_FINAL_REPORT.md).

## 12. Unabhängiger Review

[`INDEPENDENT-REVIEW.json`](data-quality/root-cause-audit/INDEPENDENT-REVIEW.json)

**Erster Durchgang** (Lauf 39053330565): 21 Befunde (4 HIGH).
- Hauptpunkte: Der Provider-Ort war als Schuldbeleg dargestellt, und der Verhältnistest prüfte nur die Richtung.
- Ergebnis: 19 gelöst, 1 teilweise, 1 offengelegt.

**Zweiter Durchgang** (Lauf 39073148967): 16 Befunde (3 HIGH), 24 Zahlen ohne Beanstandung verifiziert.
- Die HIGH-Befunde:
  - Aktienzahl-Bestätigungen prüften nur die Richtung.
  - Deklarierte Split-Reste bestätigten sich über ihren eigenen Split.
  - Der Turtle-Effekt hing an einer Aktienzahl-Erhöhung, die Split und Verwässerung nicht unterscheidet.
- Alle 16 sind gelöst und auf Lauf 39100831867 geprüft. Folge: Die bestätigte Menge sank von 28 auf 17 Ereignisse, und der Turtle-Dateneffekt fiel weg.

**Kein HIGH oder CRITICAL offen.** Ein dritter unabhängiger Durchgang auf dem Schlusslauf wurde nicht gemacht; die Prüfung dort stammt vom Autor.

## 13. Grenzen

- **Kein zweiter Preisanbieter.** Keine Bewegung ist als echt bestätigt. FINRA deckt nur OTC ab und gleicht nur das Symbol ab.
- **Die Datenkopie ist live und nicht aufbewahrt.** Frühere Stände sind nicht reproduzierbar; ihre Ergebnisse gelten nur für ihren Fingerabdruck.
- **Inhaltsänderungen zwischen Ständen sind auf Wertpapier-, Bar- und CA-Ebene UNKNOWN.**
- **Der V3-PIT-Abnahmetest von #758 ist nicht bestanden.** Die V3-Holds hier sind ein Nachbau.
- **Git-Historie:** Werte von mittlerer Differenz und Tracking Error stehen noch in der Historie dieses Branches (Commit `bc8b6cb10`). Ob gesquasht wird, entscheidet der Owner.
- **Einzelfälle, Ticker und Kurse sind nur an den Owner versiegelt.**

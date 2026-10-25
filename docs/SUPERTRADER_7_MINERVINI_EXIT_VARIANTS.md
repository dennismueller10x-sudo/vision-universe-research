# Supertrader 7.0 – Minervini: vorregistrierte Ausstiegsvarianten (Entscheidung E7-7)

Stand: 25. Oktober 2026. Zweig `claude/supertrader-7-minervini-exits`, aufgesetzt auf `origin/main` (`984ab9a`).

Alle Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED` und `MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST`. Nichts ist live, zertifiziert oder handelbar. Es gibt keine Orders, keine Brokeranbindung, keine UI-Änderung und keine neuen Datenabrufe. Öffentlich sind nur Zählungen und Hashes. Die Kennzahlen gehen versiegelt an den Owner (`L.encryptForOwner`). Keine Variante wird nach Ergebnis gewählt (E6).

## 1. Entscheidung E7-7 und Umsetzung

Wortlaut des Owners: „Minervini-Ausstiegsregeln dürfen als zusätzliche, vorregistrierte Forschungsvarianten entwickelt werden. Keine neue Variante als Originalregel oder verbindliche Referenz aktivieren. Keine Performanceoptimierung.“

| Vorgabe | Umsetzung |
|---|---|
| zusätzliche Forschungsvarianten | fünf Varianten im Register `sf7-minervini-exits-1.0.0` (`research/minervini-sf7-exits.mjs`), je SEPA und Power Play |
| vorregistriert | Register-Hash `df0379ae…` und sf7-Code-Hash `de6a4b9d…` im Commit `96a6910` gepinnt, **vor** dem ersten Lauf (Tests `SF7-EXIT-REGISTRY`, `SF7-MIN-RUNNER`) |
| keine Originalregel, keine Referenz | Status `SOURCE_DERIVED_RESEARCH_VARIANT`, `originalRule: false`, `reference: false`, `activated: false`, `sourceExact: false`; Vergleich immer gegen REF (`compareTo: 'REF'`) |
| keine Performanceoptimierung | ein fester Wert je Parameter, kein Raster, keine zweite Lesart einer Zahl; öffentlich nur Zählungen; Kennzahlen versiegelt |

## 2. Technischer Weg: gepinnte Engine unverändert

`research/minervini-execution.mjs` (4.0) hat keinen Ausstiegshaken. Die Datei steckt in gepinnten Fingerabdrücken:
- 4.0-Forschungscode `c834b227…`;
- sf5- und EP/PS-Code;
- SF6-PAPER-2027 1.1.0.

Sie bleibt deshalb unverändert. Ebenso unverändert sind `minervini-lifecycle.mjs` (Register `f13ea350…`), `minervini-sf7.mjs` (Register der Setup-Varianten `ce98c24f…`) und die Turtle-Engine `89fbcf86…`.

Neu ist `research/minervini-sf7-exit-execution.mjs`. Die Funktion `runMinerviniLifecycleWithExitRule` ist die 4.0-Funktion `runMinerviniLifecycle` Zeile für Zeile, mit genau drei Ergänzungen:
1. Beim Einstiegsfill wird der Regelzustand aus den Balken **vor** dem Einstieg gebildet.
2. Nach den REF-Schlussregeln eines Balkens (gehaltene Position und Einstiegsbalken) darf die Regel einen Ausstieg zur nächsten Eröffnung planen.
3. Die Ausführung zählt in `sf7ExitCounts`. Das REF-Feld `counts` behält seine Form.

Absicherung der Kopie:
- **Test** `SF7-EXIT-ENGINE-IDENTITY`: Ohne Regel sind Ledger, Trades, Kurve, Zähler, Ablehnungen und Abstimmung für jede registrierte 4.0-Konfiguration (`RUN_VARIANTS`) und beide Strategien identisch, auf einem synthetischen Universum mit Haltesitzung.
- **Laufgate:** Der Runner bricht mit `EXIT_ENGINE_COPY_NOT_REF` ab, wenn die Kopie ohne Regel den REF-Ledger-Hash oder den Trade-Hash nicht reproduziert.

Ausführungskonvention wie beim 4.0-MA50-Ausstieg: Signal am Schluss von k, nur aus den Balken 0..k. Ausführung zur nächsten ausführbaren Eröffnung (k + 1 oder später) über den unveränderten Verkaufspfad. Slippage, Kommission, Dust-Regel und research-v1-Abrechnung bleiben unverändert.

## 3. Die Varianten

Das Repository enthält keinen Buchtext. Die Regeln stützen sich auf die deutschen Paraphrasen und die `operationalForm` der Klassifikation (`evidence/MINERVINI-SF7-FINDINGS.json`, `…-CLASSIFICATION.json`). Paraphrasiert werden die indonesische (B12) und die vietnamesische (B03) Übersetzung, nie Minervinis englischer Wortlaut. B03 ist ein Bild-PDF mit OCR-Text, Ziffern sind dort OCR-empfindlich (`ocrDigits: true` an jeder B03-Schwelle). Die Originalstellen wurden für diesen Schritt nicht erneut gelesen.

| Variante | Fundstelle / Seite | Regel (ein fester Wert je Parameter) | Annahmen | Übersetzungszweifel |
|---|---|---|---|---|
| `EXIT-LARGEST-DECLINE-DAILY` | F7-B12-130-210 (B12 PDF 130), F7-B03-217-088 (B03 PDF 217) | voller Ausstieg zur nächsten Eröffnung nach dem ersten Tagesrückgang (Schluss zu Schluss, ab der Einstiegssitzung), der größer ist als jeder Tagesrückgang seit dem Stage-2-Start. Ohne Stage 2 am Setup gelten die REF-Ausstiege. | `MA-MIN7-STAGE2-START`, `-EXIT-NOT-EVALUABLE`, `-EXIT-PRECEDENCE`, `-EXIT-CATCH-UP` | nein. B12 sagt „in den meisten Fällen“; die Variante wendet die Regel in jedem bewertbaren Fall an. |
| `EXIT-LARGEST-DECLINE-WEEKLY` | F7-B03-217-088 (B03 PDF 217), B12 PDF 130 | voller Ausstieg nach dem ersten 5-Sitzungs-Schritt (verankert am Einstieg), dessen Rückgang größer ist als jeder 5-Sitzungs-Rückgang seit dem Stage-2-Start. Weniger als 4 Vorwochen oder keine Stage 2 am Setup: REF-Ausstiege. | `MA-MIN7-WEEKLY-STEP` und wie oben | nein. Die Klassifikation nennt Freitag-zu-Freitag; die Variante behält den 5-Sitzungs-Schritt der 1.3.0-Diagnose. |
| `EXIT-MA20-HALF` | F7-B03-047-016 (B03 PDF 47) | Hälfte zur nächsten Eröffnung nach dem ersten Schluss unter MA20 in den ersten 10 Sitzungen ab der Einstiegssitzung, einmal je Trade. Der Rest folgt Stop und Ausstiegspolitik der REF. | `MA-MIN7-POST-BREAKOUT-WINDOW` (10), `-EXIT-PRECEDENCE`, `-EXIT-CATCH-UP` | nein. Die Zusatzlesart „Schluss unter MA50 bei hohem Volumen“ gehört nicht zur Variante. |
| `EXIT-CLIMAX` | F7-B03-212-085 (B03 PDF 212) | voller Ausstieg nach einem Schluss mit ≥ 25 % Gewinn über 15 Sitzungen oder ≥ 70 % über 10 Sitzungen, dessen 15-Sitzungs-Gewinn der steilste seit dem Stage-2-Start ist. Ohne Stage 2 am Setup: REF-Ausstiege. | `MA-MIN7-CLIMAX-RUN`, `-CLIMAX-FRACTION`, `MA-MIN7-STAGE2-START`, `-EXIT-NOT-EVALUABLE` | nein (B03-OCR-Ziffern) |
| `EXIT-CLIMAX-UPCLOSES` | F7-B03-216-086 (B03 PDF 216) | voller Ausstieg nach einem Schluss, an dem die Aktie gestreckt ist (wie oben ≥ 25 % / 15 oder ≥ 70 % / 10) und mindestens 11 der letzten 15 Schlüsse Aufwärtsschlüsse waren | `MA-MIN7-CLIMAX-EXTENDED`, `-CLIMAX-FRACTION` | **ja.** S. 214 und S. 216 nennen widersprüchliche Zähler (6 in 10 bzw. 6–10 bei 2–3 Abtagen). Verwendet wird nur der Anteil von 70 %; der zweite Zähler, größter Auftag, größte Spanne, Exhaustion Gap und KGV-Verdopplung bleiben außen vor. |

Die Klimax-Regel steht in zwei getrennten Varianten. So bleibt der Übersetzungszweifel von F7-B03-216-086 in seiner eigenen Variante und vermischt sich nicht mit der Regel von S. 212.

### Gedruckte Zahlen und Modellannahmen

Gedruckte Zahlen (`SF7_EXIT_SOURCE_BOUNDS`):
- **Klimaxlauf (B03 PDF 212):** typisch +25–50 % in 1–3 Wochen, extrem +70–80 % in 5–10 Tagen. Verwendet wird der untere Gewinn über das obere Fensterende: 25 % über 15 Sitzungen, 70 % über 10 Sitzungen.
- **Auftage (B03 PDF 216):** mindestens 70 % Auftage in 7–15 Tagen. Verwendet werden 15 Sitzungen, also mindestens 11 von 15.
- **MA20 (B03 PDF 47):** Halbierung, Anteil 0,5.

Neue Modellannahmen (`SF7_EXIT_MODEL_ASSUMPTIONS`; keine ist eine Minervini-Regel):

| ID | Festlegung | Begründung |
|---|---|---|
| `MA-MIN7-EXIT-NOT-EVALUABLE` | Eine Regel, die den Stage-2-Start braucht, ist ohne bestandenes Trend Template 1–7 am Setup-Schluss nicht bewertbar; die Wochenregel auch nicht bei weniger als 4 Vorwochen. Dann gelten die REF-Ausstiege. | Die Quellen messen ab dem Stage-2-Start. Einen Start zu erfinden wäre eine neue Regel. |
| `MA-MIN7-EXIT-PRECEDENCE` | REF-Schlussregeln zuerst. Ein REF-Vollausstieg am selben Schluss bleibt, das Variantensignal zählt als unterdrückt. Ein Vollausstieg der Variante ersetzt einen geplanten REF-Teilausstieg. Der Ausstieg zur Eröffnung kommt vor dem Stop. | Ein Schritt nach dem anderen: Die Variante fügt einen Ausstieg hinzu und entfernt keinen REF-Ausstieg. |
| `MA-MIN7-EXIT-CATCH-UP` | Die Regel liest jeden Schluss ab der Einstiegssitzung der Reihe nach, auch Schlüsse von Sitzungen ohne ausführbare Eröffnung. Das Signal wird zur nächsten ausführbaren Eröffnung ausgeführt. | Ein Handelsstopp darf kein Signal verdecken und keinen späteren Schluss vorziehen. |
| `MA-MIN7-CLIMAX-RUN` | ≥ 25 % / 15 Sitzungen oder ≥ 70 % / 10 Sitzungen. Zusätzlich muss der 15-Sitzungs-Gewinn (Fenster ab dem Stage-2-Start) größer sein als jeder 15-Sitzungs-Gewinn seit Stage-2-Start + 15, mit mindestens einem Vergleichswert. | S. 212 nennt Spannen und „steilste Steigung“ ohne Maß. Der untere Gewinn über das obere Fensterende ist die am wenigsten strenge Lesart innerhalb der Quelle. |
| `MA-MIN7-CLIMAX-FRACTION` | Beide Klimaxregeln verkaufen alles. | Die Quelle sagt „einen Teil oder alles“ und druckt keinen Anteil. Jeder Teil wäre eine erfundene Zahl; „alles“ ist die einzige Lesart mit einer Menge aus der Quelle. |
| `MA-MIN7-CLIMAX-EXTENDED` | „Gestreckt“ heißt der Gewinnteil von `MA-MIN7-CLIMAX-RUN`; Auftage ≥ 11 von 15. | S. 216 setzt eine gestreckte Aktie voraus, ohne „gestreckt“ zu definieren. Das Klimaxmaß der Nachbarseite ist das eigene Maß der Quelle. |

Wiederverwendet und unverändert sind `MA-MIN7-STAGE2-START`, `MA-MIN7-WEEKLY-STEP` und `MA-MIN7-POST-BREAKOUT-WINDOW` aus `minervini-sf7.mjs`. Die Quelleninventur klassifiziert alle sechs neuen Annahmen (`CLASSIFICATION`). `E72_DISPOSITION` führt F7-B03-047-016, -212-085 und -216-086 jetzt als `IMPLEMENTED as research variant …`.

## 4. Vorregistrierung

| Gegenstand | Wert | Gepinnt in |
|---|---|---|
| Register `sf7-minervini-exits-1.0.0` | `df0379aee2827fa901ae8590017aaa3c082893837799aa64ea5812c079a9de79` | `tests/sf-sf7-minervini-exits.test.mjs` |
| sf7-Code (Runner 1.2.0, 4 Dateien) | `de6a4b9dd34088c74ec8f19a81157281b5e24a8f1eee9dce6254c340df144991` | `tests/sf-sf7-minervini.test.mjs` |
| 4.0-Forschungscode | `c834b227…` unverändert | `SF7-EXIT-FINGERPRINTS`, SF6-PAPER-2027 |
| 4.0-Register | `f13ea350…` unverändert | ebd. |
| Turtle-Engine | `89fbcf86…` unverändert | ebd. |
| SF6-PAPER-2027 1.1.0 | `e623b336…` unverändert | ebd. |
| Setup-Varianten 7.0 (`ALT-SEPA-*`) | `ce98c24f…` unverändert | ebd. |

Beide Hashes standen im Commit `96a6910`, bevor der Lauf gestartet wurde.

## 5. Lauf

Maßgeblicher Lauf ist [40185143571](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40185143571), Workflow `supertrader-validation.yml`, Modus `sf7-minervini`, auf `96a6910`. Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT`, Abrechnung `research-v1`, Runner `sf7-minervini-runner-1.2.0`.

Der Beleg (`receipt`) trägt diese Hashes:
- `researchCodeSha256` `c834b227…`;
- `variantRegistrySha256` `f13ea350…`;
- `sf7VariantRegistrySha256` `ce98c24f…`;
- `sf7CodeSha256` `de6a4b9d…`;
- `sf7ExitRegistrySha256` `df0379ae…`.

Alle fünf entsprechen den gepinnten Werten.

### Referenz und Identität

| Strategie | REF-Trades | REF-Ledger | gegen 4.0 | Engine-Kopie ohne Regel |
|---|---:|---|---|---|
| SEPA | 954 | `1ca5239107bd8bf1…` | **EQUAL** | Ledger und Trades EQUAL |
| Power Play | 1.007 | `877ceb333831fdcb…` | **EQUAL** | Ledger und Trades EQUAL |

Die bestehenden Setup-Varianten laufen unverändert mit 824 (`ALT-SEPA-FLAT-BASE`), 982 (`ALT-SEPA-TT6-25`) und 890 (`ALT-SEPA-RS-LINE`) Trades, gleich dem Lauf 40172178386.

### Vorher/Nachher je Variante (nur Zählungen)

`vsRef` vergleicht wie bei den bestehenden Varianten je Trade (Wertpapier und Einstiegstag). Ein Trade zählt dort als unverändert, wenn Ausstiegstag, Stückzahl und Ausstiegsgrund gleich sind. `vsRefSells` verlangt zusätzlich die gleiche Folge aller Verkäufe. Ein Halbverkauf mit gleichem Endausstieg zählt dort also als verändert. Die Spalten unten zeigen `vsRefSells`; bei allen Vollausstiegs-Varianten ist es gleich `vsRef`.

**SEPA (REF 954)**

| Variante | Trades | unverändert | verändert | entfallen | neu | Regelausstiege | bewertbar / nicht bewertbar | Ledger |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `EXIT-LARGEST-DECLINE-DAILY` | 1.744 | 20 | 671 | 263 | 1.053 | 1.148 (7 von REF-Ausstieg überdeckt) | 1.744 / 0 | `80bf1d57bc08…` |
| `EXIT-LARGEST-DECLINE-WEEKLY` | 1.060 | 105 | 612 | 237 | 343 | 151 (4 überdeckt) | 397 / 663 (< 4 Vorwochen) | `0f45773e42b4…` |
| `EXIT-MA20-HALF` | 1.076 | 56 | 683 | 215 | 337 | 380 Halbverkäufe | 1.076 / 0 | `a0bc09d06e4e…` |
| `EXIT-CLIMAX` | 1.069 | 133 | 614 | 207 | 322 | 76 | 1.069 / 0 | `7d2f0705f3d0…` |
| `EXIT-CLIMAX-UPCLOSES` | 1.079 | 138 | 605 | 211 | 336 | 64 | 1.079 / 0 | `afb724eb1eeb…` |

Bei `EXIT-MA20-HALF` ergibt `vsRef` 84 / 655 / 215 / 337.

**Power Play (REF 1.007)**

| Variante | Trades | unverändert | verändert | entfallen | neu | Regelausstiege | bewertbar / nicht bewertbar | Ledger |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `EXIT-LARGEST-DECLINE-DAILY` | 1.150 | 60 | 811 | 136 | 279 | 206 (1 überdeckt) | 517 / 633 (ohne Stage 2) | `3c5a611e65a5…` |
| `EXIT-LARGEST-DECLINE-WEEKLY` | 1.008 | 60 | 806 | 141 | 142 | 41 (1 überdeckt) | 175 / 562 ohne Stage 2, 271 < 4 Vorwochen | `d2281f1c03b1…` |
| `EXIT-MA20-HALF` | 1.014 | 90 | 816 | 101 | 108 | 30 Halbverkäufe | 1.014 / 0 | `c705e8ede93c…` |
| `EXIT-CLIMAX` | 1.098 | 76 | 788 | 143 | 234 | 117 | 500 / 598 (ohne Stage 2) | `66f5ad7c371c…` |
| `EXIT-CLIMAX-UPCLOSES` | 1.496 | 22 | 853 | 132 | 621 | 556 | 1.496 / 0 | `a025465bed8c…` |

Bei `EXIT-MA20-HALF` ergibt `vsRef` 91 / 815 / 101 / 108.

Die vollständigen Ausstiegs- und Verkaufsgründe je Variante stehen im öffentlichen Block des Laufs (`exitReasons`, `sellReasons`, `ruleCounts`).

### Lesart der Zählungen

- **Viele „veränderte“ Trades:** Die Regel trifft oft nur wenige Trades direkt. Das Portfolio ist aber pfadabhängig: Die Stückzahl folgt dem Eigenkapital des Vortags, es gibt höchstens 20 offene Positionen, und Barmittel werden früher frei. Deshalb ändern sich auch Stückzahlen und Einstiege von Trades, die die Regel nie auslöst. „Verändert“ heißt hier nicht „von der Regel ausgestiegen“. Wie viele Trades die Regel direkt beendet, zeigt die Spalte „Regelausstiege“.
- **Power Play ohne Stage 2:** In rund 600 Power-Play-Trades besteht am Setup kein Trend Template. Wie in der 1.3.0-Diagnose sind die Stage-2-Regeln dort nicht bewertbar, und die REF-Ausstiege gelten.
- **`EXIT-CLIMAX-UPCLOSES` bei Power Play:** 556 Regelausstiege. Ein Power Play folgt auf einen Anstieg von +100 % in höchstens 8 Wochen. Die Gewinnschwelle für „gestreckt“ (`MA-MIN7-CLIMAX-EXTENDED`) ist deshalb kurz nach dem Einstieg oft schon erfüllt, und die Regel greift dann allein über die Auftage. Das folgt aus der vorregistrierten Lesart. Sie wird nicht nachträglich geändert (siehe Abschnitt 7).

## 6. Was das Ergebnis nicht bedeutet

- **Keine Regeländerung:** Kein Vertrag (`contracts/minervini.mjs`) und keine Referenzregel ändert sich. Keine Minervini-Regel ist `SOURCE_EXACT`, keine wird angehoben.
- **Keine Referenzänderung:** REF SEPA und REF Power Play bleiben die 4.0-Referenzen. Die Ausstiegsvarianten sind nur Vergleichsläufe.
- **Keine Optimierung:** Jede Variante hat einen festen Wert je Parameter, festgelegt vor dem Lauf. Kein Wert wurde nach einem Ergebnis gewählt, keine Variante wird nach Ergebnis bevorzugt. Die Kennzahlen sind öffentlich weder berechnet noch verglichen.
- **Keine Zertifizierung:** Alles bleibt `DIAGNOSTIC_NOT_CERTIFIED`. Kein Live-Pfad, keine Orders, keine Produktoberfläche, kein Einfluss auf SF6-PAPER-2027.
- Abweichende Zählungen gegenüber REF zeigen nur, **dass** die Regel Trades verändert, nicht ob sie besser oder schlechter ist.

## 7. Grenzen und offene Punkte für den Owner

- Alle Schwellen stammen aus Übersetzungen. Die Klimax- und MA20-Schwellen kommen aus B03 (OCR). Die Klassifikation hielt fest, dass aus B03 bisher nur Diagnosen umgesetzt wurden. Hier werden B03-Zahlen erstmals handelsrelevant, aber nur in Forschungsvarianten.
- Die Wochenlesart nutzt 5-Sitzungs-Schritte statt Freitagsschlüssen (`MA-MIN7-WEEKLY-STEP`).
- **Owner-Frage zu `EXIT-CLIMAX-UPCLOSES`:** Bei Power Play greift die Lesart von „gestreckt“ oft schon kurz nach dem Einstieg (556 Ausstiege). Eine engere Lesart, etwa gestreckt erst ab dem Einstieg gemessen, wäre eine neue, eigene Vorregistrierung. Sie darf nicht als Korrektur dieser Variante nach Ergebnis entstehen.
- Die Kopie der 4.0-Ausführung ist eine bewusste Doppelung. Ändert sich die 4.0-Engine künftig, schlägt `SF7-EXIT-ENGINE-IDENTITY` oder das Laufgate an.

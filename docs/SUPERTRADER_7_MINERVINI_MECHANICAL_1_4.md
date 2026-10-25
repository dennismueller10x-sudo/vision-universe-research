# Supertrader 7.0 – Minervini: mechanisch belegbare Restfunktionen (Paket 1.4.0)

Stand: 25.10.2026. Status aller Strategien unverändert: `LIVE_NOT_APPROVED` / `DIAGNOSTIC_NOT_CERTIFIED`. Keine Live-Aktivierung, keine Orders, keine Zertifizierung.

Dieses Paket arbeitet die DEFERRED-Fundstellen aus der E7-2-Klassifikation ([SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md](SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md), Abschnitt 2) ab. Umgesetzt wird nur, was sich mechanisch aus der Paraphrase belegen lässt. Alles ist **Diagnose**: Zählungen auf den REF-Trades, nie ein Gate, nie ein Filter, nie ein Ausstieg, nie ein Fill, nie eine Variantenwahl.

## 1. Code und Versionen

| Teil | Datei | Version / Fingerabdruck |
|---|---|---|
| Diagnosen | `scripts/supertrader/source-faithful/research/minervini-sf7-mechanical.mjs` | `sf7-minervini-mechanical-1.2.0`, Register `sf7MechanicalRegistrySha256` `a122022a…` (vor dem Lauf gepinnt); 1.1.0 = `131746dc…` (Lauf 40228813041), 1.0.0 = `0cc8cb2a…` (Lauf 40226429160) |
| Paket | `research/minervini-sf7.mjs` | `sf7-minervini-1.4.0`; nur Versionszeichenkette und Kopfkommentar geändert |
| Runner | `research/run-sf7-minervini.mjs` | `sf7-minervini-runner-1.6.0` (unverändert seit 1.1.0; 1.5.0 im Lauf 40226429160), `SF7_FILES` um die neue Datei erweitert |
| Code-Hash | `sf7CodeSha256` | `dd3568fb…`, vor dem Lauf gepinnt (Test `SF7-MIN-RUNNER`); `2862748e…` war Diagnosen 1.1.0, `832223b9…` Runner 1.5.0 |

Unverändert bleiben:
- die 4.0-Engine (`minervini-lifecycle.mjs`, `minervini-execution.mjs`, Fingerabdruck `c834b227…`) und alle Dateien in `run-sf4-lifecycle#FILES` / SF6-PAPER-2027;
- die Setup-Varianten `ALT-SEPA-*`: `sf7VariantRegistrySha256('sf7-minervini-1.3.0')` ergibt weiter `ce98c24f…`. Der neue Registerwert `9b9a8a00…` entsteht nur durch die Versionszeichenkette 1.4.0 (Test `SF7-MECH-REGISTRY`);
- die E7-7-Ausstiegsvarianten (Register `df0379ae…`) und alle Identitäts-Gates des Runners (`REF_NOT_REPRODUCED`, `EXIT_ENGINE_COPY_NOT_REF`, `EXIT_SIGNAL_TIMING_VIOLATION`).

Der veraltete Kopfkommentar von `minervini-sf7.mjs` nennt jetzt den aktuellen 4.0-Fingerabdruck `c834b227…` (vorher `b1d81fb8…`).

## 2. Disposition je Fundstelle

| Fundstelle | Paraphrase (kurz) | Disposition |
|---|---|---|
| F7-B03-207-082 | Basis 1–2 nach Marktkorrektur gut, 3–4 spät, 5–6 scheitern meist | **Diagnose** `baseCountAt` (G-BASECOUNT) |
| F7-B12-116-203 | ab Basis 4 oder 5 ist der Trend spät | **Diagnose** `lateStage` (Basis ≥ 4) |
| F7-B12-116-205 | Basis 1–2 aus Marktkorrekturen am besten, Basis 3 meist handelbar | **Diagnose** (Basiszahl 1 / 2 / 3); der Einstiegsfilter „Basis ≤ 3“ bleibt DEFERRED (Variante, ändert Trades) |
| F7-B03-225-092 | Erschöpfungsaktion aus der ersten Basis bullish, nur nach der **letzten** Basis Verkaufssignal | Modell-Lesart: „letzte Basis“ ist erst im Nachhinein bekannt und wird nicht mechanisiert. **Diagnose** `signalsByBaseNumber` (Zählung nach der zeitpunktgenauen Basiszahl) für `EXIT-CLIMAX` / `EXIT-CLIMAX-UPCLOSES`; eine Unterdrückungsvariante bleibt DEFERRED (ändert Trades, eigene Vorregistrierung nötig) |
| F7-B03-217-087 | Rückgang auf dem größten Volumen seit Trendbeginn | **Diagnose** `topVolumeDecline` (G-TOPVOL) in zwei Trendbeginn-Fenstern nebeneinander, keines gewählt; Churning und Umkehr auf hohem Volumen bleiben QUALITATIVE |
| F7-B12-280-275 | Aktien meiden, die mehr als 2–3× der Marktkorrektur korrigieren | **Diagnose** `relativeBaseDepth` (> 2× / > 3×, Schlüsse, Fenster `SAME_WINDOW` und `TRAILING_HIGH` nebeneinander); der Setupfilter bleibt DEFERRED (Variante) |
| F7-B07-067-140 | Gaps einige Prozent über dem Kaufpunkt nicht kaufen | **Diagnose** `gapOpenAbovePivot` (jeder Fill mit Eröffnung ≥ Pivot, auch Limit-Fills) und `ordersNotExecutedAboveLimit` (nur Anzahl, keine Trades); Variante DEFERRED („einige Prozent“ unbeziffert) |
| F7-B07-087-150 | einige Prozent über dem Kaufpunkt nicht mehr kaufen | **Diagnose** `fillAbovePivot`; Variante DEFERRED |
| F7-B12-297-283 | nicht mehr als einige Prozentpunkte über dem Pivot hinterherjagen | **Diagnose** `fillAbovePivot`; Variante DEFERRED |
| F7-B07-040-117 | warten, bis 5, 10 oder 20 Cent über dem Pivot gehandelt wird; keine magische Zahl | **Diagnose** `buyStopBuffer` (alle drei Beispielwerte, keiner gewählt); Ordervariante DEFERRED |
| F7-B07-070-142 | technischer Stop, sonst Prozent-Stop | weiter **DEFERRED**: macht abgelehnte Setups handelbar; die betroffenen Setups sind schon öffentlich als `eligibilityBlockers.PLANNED_LOSS_ABOVE_10PCT` gezählt |
| F7-B07-032-109 | Anfänger: Positionen erst nach +25 % / +50 % Konto vergrößern | weiter **DEFERRED**: ändert Positionsgrößen und liest den Kapitalverlauf (versiegelte Kennzahl); keine Regel für das Referenzkonto |
| F7-B03-211-084, F7-B12-092-180 | KGV-Expansion (2×, 2,5–3×) als Warnung | weiter **DEFERRED** (EPS-Datenqualität, siehe Abschnitt 4) |
| F7-B12-185-240 | EPS-Beschleunigung über gleitende 2-Quartals-Mittel | weiter **DEFERRED** (EPS-Datenqualität) |

Die Variantenformen (Chase-Grenze, Buy-Stop-Aufschlag, Stop-Fallback, Sizing-Progression, Marktdrawdown-Setupfilter, Basis-Einstiegsfilter, Klimax-Unterdrückung) sind bewusst **nicht** umgesetzt. Die Quelle nennt für Chase und Aufschlag keine Zahl, und jede Variante würde Trades ändern. Die Diagnosen zeigen zuerst, wie viele REF-Trades eine solche Regel überhaupt berühren würde. Eine Variante bräuchte danach eine eigene, vorab gepinnte Vorregistrierung, die nicht aus diesen Zählungen gewählt werden darf.

Ermessensentscheidungen (QUALITATIVE: Churning, Umkehr auf hohem Volumen, „Stärke“ beim Verkauf) bleiben getrennt und werden nicht mechanisiert.

## 3. Modellannahmen (vorab im Code fixiert)

Keine davon ist eine Minervini-Regel, keine ist SOURCE_EXACT. Gedruckte Werte stehen in `SF7_MECHANICAL_SOURCE_BOUNDS` (alle `translationUnverified`). Im Kopf von `minervini-sf7-mechanical.mjs` steht je Fundstelle die Paraphrase wörtlich aus `MINERVINI-SF7-FINDINGS.json`, getrennt davon die Modell-Lesart. Stand 1.2.0:

| Annahme | Festlegung | Begründung |
|---|---|---|
| `MA-MIN7-BASECOUNT-BASE` (Revision 2, ab 1.2.0) | Eine Basis beginnt am Balken des laufenden **Intraday-Hochs** und endet mit dem ersten **Schluss über diesem Intraday-Basishoch**, mindestens **20 Sitzungen** nach dem Basisbeginn; kürzere Pausen zählen nicht; keine Tiefenschranke (Flat Bases zählen). Ein neues Intraday-Hoch ohne Schluss darüber verschiebt Basisbeginn und Basishoch nur, solange die Basis jünger als 20 Sitzungen ist (noch Anstieg); in einer reifen Basis ist es ein Ausbruchsversuch und ändert weder Beginn noch Pivot. Revision 1 (1.0.0, 1.1.0) verglich Schlüsse mit dem laufenden **Schlusshoch** | Minervinis Ausbruch ist der Schritt über Basishoch / Pivot, beides Intraday-Niveaus (B12 PDF 297). Ein Erholungsschluss über dem Schluss des Basisbeginns, aber unter dessen Intraday-Hoch ist kein Ausbruch (Review #940, dritte Runde, MEDIUM-1). B12 PDF 115: Basen in Stage 2 dauern 4–5 Wochen bis über ein Jahr, untere Grenze 4 Wochen. Modellannahme, keine Minervini-Regel |
| `MA-MIN7-BASECOUNT-MARKET-RESET` | Marktkorrektur = SPY schließt mindestens **10 %** unter dem höchsten bisherigen Schluss; die Zählung beginnt am tiefsten SPY-Schluss der letzten solchen Korrektur, der am Setup-Tag bekannt ist | Die Bücher beziffern die Marktkorrektur nicht (ABSENT_FROM_MATERIAL); 10 % ist eine Konvention. Am Tief beginnt die Zählung, damit die in der Korrektur gebildete Basis Basis 1 ist (B12 PDF 116) |
| `MA-MIN7-BASECOUNT-STOCK-RESET` | Neustart auch nach dem letzten Schluss der Aktie unter ihrem 200-Tage-Mittel; ohne einen solchen Schluss ist die Zahl **unsicher**, mit Richtung: `undercountPossible`, wenn gar kein Neustart in den Daten liegt (Basen vor dem ersten Balken fehlen); `overcountPossible`, sobald eine Basis gezählt wurde (das Basishoch vor dem ersten Balken ist unbekannt – ab Revision 2 das Intraday-Basishoch; der Annahmetext im Code nennt noch „running closing high“ und bleibt bis zur nächsten ohnehin nötigen Neupinnung so, ein unsichtbarer Schluss unter MA200 in den ersten 199 Balken hätte neu gestartet); `baseCountUncertain` = eins von beiden, Gründe in `uncertaintyReasons`. „Ohne berechenbares MA200“ umfasst die ersten 199 Balken und jede Lücke im Schlusskurs nach dem Neustart | Basen werden in einem Stage-2-Anstieg gezählt (B12 PDF 115–116); die 200-Tage-Linie ist die Stage-2-Grenze des Trend Templates (TT-1). Der Trend-Template-Lauf (`MA-MIN7-STAGE2-START`) taugt hier nicht, weil TT-5 (Schluss über MA50) in fast jeder Basis scheitert |
| Lesart „früh“ | `earlyBase` = jede Basis ≤ 2; `earlyBaseAfterMarketCorrection` = nur Basen ≤ 2 nach einem Marktkorrektur-Neustart. Nur die zweite Zahl entspricht der Buchbedingung „nach einer Marktkorrektur“ (F7-B03-207-082); der Neustart unter MA200 ist Modellannahme | B03 PDF 207 |
| `MA-MIN7-BASECOUNT-CURRENT` | Basiszahl = abgeschlossene Basen nach dem Neustart und vor dem Setup-Schluss + 1 (die eigene Basis des Setups); der Setup-Schluss schließt nie eine Basis ab, auch wenn er über einem alten Schlusshoch und unter dem Intraday-Pivot liegt | So ist die erste Basis nach dem Neustart Basis 1 (B03 PDF 207) |
| `MA-MIN7-TOPVOL` | Erster Abwärtsschluss ab dem Einstieg, dessen Volumen über dem jeder Sitzung seit Trendbeginn liegt; Fenster endet bei geschlossenen Trades eine Sitzung vor der Ausstiegssitzung, bei offenen Trades am `markDate` des Laufs (ab 1.2.0; vorher am Datenende); Ausstieg am Einstiegstag = nicht bewertbar. Der Trendbeginn ist in **zwei Fenstern nebeneinander** berichtet, keines gewählt: `trendTemplateRun` = Beginn des ununterbrochenen Trend-Template-Laufs (`MA-MIN7-STAGE2-START`; beginnt meist erst nach dem letzten MA50-Bruch in der Setup-Basis, reicht also oft nur Wochen zurück); `aboveMa200Run` = Sitzung nach dem letzten Schluss unter MA200 (Fenster der Basiszählung; `windowTruncated`, wenn kein solcher Schluss in den Daten liegt) | B03 PDF 217 / 219 datieren den Trendbeginn nicht; keine Größenschranke für den Rückgang. Beide Lesarten sind vertretbar; die Wahl nach einem Ergebnis ist ausgeschlossen |
| `MA-MIN7-RELDEPTH` | Rückgang der Aktie geteilt durch Rückgang des SPY, Schlüsse auf beiden Seiten, Basisstart (52-Wochen-Hoch wie G-BASE-DEPTH) bis Setup-Tag. Aktienseite in beiden Fenstern: größter Rückgang Hoch-zu-Tief ab dem Basisstart (ein älteres, höheres Hoch zählt nie). Marktseite in **zwei Fenstern nebeneinander**, keines gewählt: `sameWindow` = größter Rückgang Hoch-zu-Tief innerhalb des Fensters; `trailingHigh` = größter Abstand unter dem gleitenden 252-Sitzungen-Schlusshoch über die Sitzungen des Fensters (erfasst eine Marktkorrektur, die vor dem Basisstart begann); > 2× ist eine Berichtsstufe, keine Meidungsgrenze (B12 PDF 295 nennt 2,3× noch akzeptabel); je Fenster nur bewertet, wenn der Markt mindestens 10 % fiel | B12 PDF 280 vergleicht mit der Marktkorrektur, ohne Fenster und ohne Untergrenze; ohne Untergrenze wäre jede Basis bei 1 % Markt-Dip „vielfach“ |
| `MA-MIN7-ENTRY-DISTANCE` | Fill / Pivot − 1 und Eröffnung / Pivot − 1 (jeder Fill, dessen Balken am oder über dem Pivot eröffnete, auch Limit-Fills danach; gelesen aus der Eröffnung des Fill-Balkens, nicht aus der Fill-Basis der Engine); nicht ausgeführte Orders über dem Limit nur als Anzahl (`ordersNotExecutedAboveLimit`); Berichtsstufen 0, (0, 1 %], (1, 2 %], (2, 3 %], (3, 5 %], > 5 %; Puffer: (Hoch des Fill-Balkens − Pivot) × `splitAdj` in Roh-Dollar unter 0,05 / 0,10 / 0,20 | B07 PDF 67 / 87, B12 PDF 297 (keine Zahl), B07 PDF 40 (keine magische Zahl). Die Stufen berichten nur; keine Schranke, kein k gewählt |

## 4. Was weiter offen bleibt

- **EPS-abhängige Punkte** (PIT-KGV, EPS-Beschleunigung): Die abgeleiteten Q4-Werte sind in 405 Fällen nicht splitkorrigierbar (6.0). Eine Teilmenge ohne abgeleitete Q4-Werte hätte in jedem Geschäftsjahr eine Lücke. TTM- und gleitende 2-Quartals-Reihen wären damit nicht PIT-vollständig. Kein Teilumfang ist sauber PIT-fähig; die Punkte bleiben DEFERRED, bis die EPS-Reihe repariert ist.
- **Varianten** zu Chase, Puffer, Stop-Fallback, Sizing, Marktdrawdown, Basisfilter und Klimax-Unterdrückung: nur mit eigener Vorregistrierung, nicht nach diesen Zählungen gewählt.
- **Marktkorrektur 10 %** ist eine Konvention, keine Buchzahl. Sie bestimmt Basiszählung und relative Tiefe gemeinsam.

## 5. Lauf (Diagnosen 1.0.0, Runner 1.5.0)

Dieser Lauf gilt für `sf7-minervini-mechanical-1.0.0`. Die Revisionen 1.1.0 und 1.2.0 und der Vorher/Nachher-Vergleich stehen in Abschnitt 8.

Maßgeblicher Lauf: [40226429160](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40226429160), Workflow `supertrader-validation.yml`, Modus `sf7-minervini`, auf `3807283`. Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT`, Abrechnung `research-v1`, Runner `sf7-minervini-runner-1.5.0`.

Beleg (`receipt`), alle Werte entsprechen den vor dem Lauf gepinnten:
- `researchCodeSha256` `c834b227…`, `variantRegistrySha256` `f13ea350…` (4.0 unverändert);
- `sf7VariantRegistrySha256` `9b9a8a00…` (Inhalt = 1.3.0-Register `ce98c24f…`, nur Versionszeichenkette);
- `sf7CodeSha256` `832223b9…`, `sf7MechanicalRegistrySha256` `0cc8cb2a…`;
- `sf7ExitRegistrySha256` `df0379ae…` (unverändert).

**Identität gegen den Vorlauf [40202504143](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40202504143)** (öffentliche Teile verglichen):
- REF SEPA 954 Trades, Ledger `1ca52391…`; REF Power Play 1.007 Trades, Ledger `877ceb33…`: ledger- und tradegleich, `matchesAuthoritativeLedger` wahr;
- `ALT-SEPA-FLAT-BASE` / `-TT6-25` / `-RS-LINE` (824 / 982 / 890) und alle fünf E7-7-Ausstiegsvarianten beider Strategien: Ledger-Hashes gleich;
- Engine-Kopie ohne Regel gleich REF in Ledger, Trades, Kurve und Zählern; alle bisherigen Diagnosen byte-gleich.

**Neue Zählungen** (nur Zählungen, Kennzahlen versiegelt):

| Diagnose | SEPA (954) | Power Play (1.007) |
|---|---|---|
| Basiszahl 1 / 2 / 3 / 4 / 5+ | 442 / 265 / 120 / 76 / 51 | 736 / 151 / 84 / 23 / 13 |
| Neustart Marktkorrektur / unter MA200 / keiner | 251 / 697 / 6 | 142 / 839 / 26 |
| `baseCountUncertain` | 13 | 61 |
| früh (1–2) / spät (3–4) / Spätphase (≥ 4) / wahrscheinlich scheiternd (≥ 5) | 707 / 196 / 127 / 51 | 887 / 107 / 36 / 13 |
| Top-Volumen-Rückgang ja / nein / n. a. | 97 / 830 / 27 (Ausstieg am Einstiegstag) | 57 / 727 / 223 (73 Setup unter MA200, 150 Ausstieg am Einstiegstag) |
| relative Tiefe > 2× / > 3× (bewertet) | 8 / 1 (78) | 260 / 179 (283) |
| relative Tiefe nicht bewertet (Markt < 10 % / zu kurze Historie) | 876 / 0 | 661 / 63 |
| Einstiegsbasis Pivot-Berührung / Gap / Limit nach Gap | 830 / 119 / 5 | 881 / 92 / 34 |
| Fill über Pivot 0 / ≤ 1 % / 1–2 / 2–3 / 3–5 / > 5 % | 841 / 86 / 14 / 5 / 8 / 0 | 891 / 71 / 25 / 11 / 7 / 2 |
| Eröffnung über Pivot (Fills mit Eröffnung ≥ Pivot) 0 / ≤ 1 % / 1–2 / 2–3 / 3–5 / > 5 % | 11 / 84 / 15 / 6 / 6 / 2 | 10 / 60 / 24 / 8 / 12 / 12 |
| Buy-Stop +5 / +10 / +20 Cent hätte am Fill-Balken nicht ausgelöst | 131 / 257 / 418 | 142 / 225 / 360 |

Klimax-Variantensignale nach Basiszahl (F7-B03-225-092), 1 / 2 / 3 / 4 / 5+:

| Variante | SEPA | Power Play |
|---|---|---|
| `EXIT-CLIMAX` | 32 / 27 / 12 / 4 / 1 | 39 / 39 / 26 / 5 / 8 |
| `EXIT-CLIMAX-UPCLOSES` | 29 / 15 / 14 / 4 / 2 | 390 / 92 / 55 / 10 / 9 |

Lesehinweise:
- Bei Power Play stehen 390 der 556 `EXIT-CLIMAX-UPCLOSES`-Signale auf Basis 1. Nach F7-B03-225-092 ist eine Erschöpfungsaktion aus der ersten Basis bullish. Das ist eine Zählung, keine Bewertung und keine Grundlage für eine Variantenwahl.
- Der Chase-Abstand bleibt bei den REF-Fills meist klein, weil das REF-Limit (`stop / 0,9`) ihn schon begrenzt. Eine Chase-Variante wäre trotzdem eine neue Modellannahme („einige Prozent“ ist unbeziffert).
- Die Pufferzahlen zeigen nur, wie viele Fill-Balken das Pivot um weniger als 5 / 10 / 20 Cent überschritten. Ob ein späterer Balken ausgelöst hätte, wird nicht simuliert.
- Etikett: Im öffentlichen Teil dieses Laufs trägt `topVolumeDecline.rule` noch den Text „MA-MIN7-STAGE2-START“. Gerechnet wurde mit dem MA200-Fenster. In 1.1.0 nennt das Etikett beide Fenster.

## 6. Tests

`scripts/supertrader/tests/sf-sf7-minervini-mechanical.test.mjs` (Goldfälle und Gegenproben):
- Basiszählung: vier Basen nach dem Aktien-Neustart (Basis 4, spät); Marktkorrektur 15 % setzt auf Basis 2 zurück, 9 % nicht; Pause unter 20 Sitzungen zählt nicht; ohne Neustart in den Daten unsicher mit Richtung (`undercountPossible` / `overcountPossible`, siehe `SF7-MECH-BASECOUNT-UNCERTAIN`);
- **Lookahead ausgeschlossen:** Balken nach dem Setup verfälscht und SPY nach dem Setup-Tag abgestürzt, das Ergebnis bleibt gleich; ebenso nach Abschneiden der Reihe; der Markt-Anker ist zeitpunktgenau;
- Top-Volumen: Signal am dritten Tag; liegt der Tag auf der Ausstiegssitzung, wird er nicht gelesen; Balken ab der Ausstiegssitzung verfälscht, Ergebnis gleich;
- relative Tiefe: 30 % Basis gegen 12 % Markt (> 2×, nicht > 3×), 5 % Markt unter der Untergrenze, spätere Daten verfälscht ohne Wirkung;
- Einstiegsabstand: Stufen, Gap-Abstand und Puffer in Roh-Dollar (splitAdj 2);
- Runner: Diagnosen je Strategie vorhanden, REF gleich mit und ohne Ausstiegsvarianten, keine Kennzahlen im öffentlichen Teil.

Ergänzt in 1.1.0 (Review #940, zweite Runde):
- `ADV-SF7-MECH-BASECOUNT-SETUP-SESSION`: Setup-Schluss 105,2 über dem Schlusshoch 105, unter dem Intraday-Pivot 106,05: Basis 2, nicht 3; erst die Folgesitzung schließt die Basis ab (bis 1.1.0; ab 1.2.0 siehe Nachtrag: 105,2 liegt unter dem Intraday-Hoch 106,05);
- `SF7-MECH-BASECOUNT-UNCERTAIN`: Richtung der Unsicherheit (nur Unterzählung, Unter- und Überzählung, Überzählung trotz Marktneustart);
- `ADV-SF7-MECH-TOPVOL-WINDOWS`: der Trend-Template-Lauf beginnt nach dem MA50-Bruch in der Basis und meldet ein Signal; das MA200-Fenster sieht das frühere Volumenhoch und meldet keins; Ausstieg am Einstiegstag nicht bewertbar;
- `ADV-SF7-MECH-RELDEPTH-RUNNING-CORRECTION`: eine vor dem Basisstart begonnene Marktkorrektur fällt in `sameWindow` unter die Untergrenze, `trailingHigh` misst sie (30 % / 14 %);
- `ADV-SF7-MECH-GAP-LIMIT-FILL`: Eröffnung 8 % über dem Pivot mit Limit-Fill zählt als Gap > 5 %; nicht ausgeführte Orders nur als Anzahl; fehlender Balken = unbekannt, nie „kein Gap“; die Diagnose verändert weder Trade noch Balken;
- `SF7-MECH-RUNNER` mit echtem Universum: SEPA 4 und Power Play 2 REF-Trades, darunter Gap, Limit-Fill nach großer Eröffnungslücke und eine nicht ausgeführte Order; REF-Ledger gleich dem 4.0-`lifecyclePart` ohne 7.0-Code; jede Zählung unabhängig je Trade nachgerechnet; jedes Klimax-Signal genau einer Basiszahl zugeordnet (Summe = `ruleCounts.scheduled`); die Trades bleiben unverändert.

Ergänzt in 1.2.0 (Review #940, dritte Runde):
- `ADV-SF7-MECH-BASECOUNT-INTRADAY-PIVOT` (Goldfall des Reviews): Neustart unter MA200 um Sitzung 270, Basisbeginn 320 (Hoch 125, Schluss 118), Kontraktion auf 108, Erholung bis 350 auf Schluss 119,5, Rücksetzer auf 112, Setup 380 mit Schluss 117: **Basis 1**, sicher (Revision 1 lieferte 2). Gegenprobe: echter Ausbruchsschluss 126 über 125 an Sitzung 350 schließt Basis 1 ab, das Setup ist Basis 2; beide zeitpunktgenau;
- `ADV-SF7-MECH-BASECOUNT-ATTEMPT`: Intraday-Vorstoß auf 127 mit Schluss 124 in der reifen Basis ändert weder Beginn noch Pivot; der Folgeschluss 125,5 über 125 ist der Ausbruch (Basis 2); ohne ihn bleibt es Basis 1;
- `ADV-SF7-MECH-BASECOUNT-SETUP-SESSION` angepasst: der Setup-Schluss 105,2 liegt unter dem Intraday-Basishoch 106,05 und schließt auch nach dem Setup-Tag nichts ab (Revision 1: Basis 3); erst ein Schluss 107 über 106,05 macht das nächste Setup zur Basis 3;
- `ADV-SF7-MECH-MA200-EXACT`: der Neustart unter MA200 entspricht der `smaAt`-Entscheidung exakt, auch auf flachen Strecken, auf denen die gleitende Summe in den letzten Bits abweicht (Revision 1 wich dort in 202 Sitzungen je Reihe ab);
- `SF7-MECH-TOPVOL` ergänzt: bei offenem Trade endet der Scan am `markDate`; Balken danach verfälscht, Ergebnis gleich.

## 7. Unabhängiges Review (frischer Kontext, nur Diff, vor dem Lauf)

Ergebnis: 0 HIGH, 4 MEDIUM, 5 LOW. Kein Lookahead gefunden; keine Wirkung auf REF, Varianten, Ledger oder Gates. Alle Befunde sind vor dem maßgeblichen Lauf behoben; Register und Code-Hash wurden danach neu gepinnt.

| Befund | Behebung |
|---|---|
| M1: Der Setup-Schluss konnte über einem alten Schlusshoch eine Basis abschließen und die eigene Basis doppelt zählen | Ausbrüche zählen nur vor dem Setup-Schluss; Gegenprobe im Test |
| M2: G-TOPVOL nutzte den Trend-Template-Lauf, den das Paket für die Basiszählung selbst als untauglich begründet | Fenster seit dem letzten Schluss unter MA200 (wie die Basiszählung); Test mit frühem Volumenhoch |
| M3: Der Runner-Test lief über null Trades | Fixtures mit REF-Trades; Summen der Zählungen = REF-Trades |
| M4: Gap-Abstand ohne Limit-Fills nach einer Eröffnung über dem Pivot | jeder Fill mit Eröffnung ≥ Pivot |
| L1: „letzte Basis“ als „späte Basis“ umformuliert | Paraphrase wörtlich, keine Lesart von „letzte“ angewandt |
| L2: Flag „Untergrenze“ in falscher Richtung | `baseCountUncertain` |
| L3: relative Tiefe Hoch/Tief gegen Schlüsse | Schlüsse auf beiden Seiten; Fensterbeginn am Basisstart dokumentiert |
| L4: Nachträge zerrissen die Tabelle in der Klassifikations-Doku | hinter die Tabelle verschoben |
| L5: kein Test, dass die neue Datei nicht in `run-sf4-lifecycle#FILES` gerät | Prüfliste erweitert |

## 8. Revisionen 1.1.0 und 1.2.0 (Review #940, zweite und dritte Runde)

Ein zweites Review der Fassung 1.0.0 (nach Lauf 40226429160) fand, dass vier Befunde nur teilweise behoben waren. 1.1.0 behebt sie. Die REF, die Setup- und Ausstiegsvarianten, die Engine und alle Identitäts-Gates sind unverändert; geändert sind nur Diagnosen.

| Befund | 1.0.0 (Lauf 40226429160) | 1.1.0 |
|---|---|---|
| M1 Basiszählung | Ausbrüche nur vor dem Setup-Schluss | unverändert übernommen, eigener Gegenprobe-Test mit Intraday-Pivot |
| M2 Top-Volumen | Trend-Template-Fenster durch MA200-Fenster **ersetzt** | beide Fenster **nebeneinander** (`trendTemplateRun`, `aboveMa200Run`), keines gewählt; Etikett korrigiert |
| M3 Runner-Test | Fixture nur mit SEPA-Trades, Prüfung der Summen | Universum mit SEPA- und Power-Play-Trades, unabhängige Nachrechnung je Trade, REF gegen 4.0-Runner ohne 7.0-Code |
| M4 Gap-Abstand | Fills mit Eröffnung ≥ Pivot | zusätzlich `byEntryBasis`, `ordersNotExecutedAboveLimit` aus den REF-Zählern, unbekannt statt still „kein Gap“, Regressionstests |
| L1 Paraphrase | Paraphrase wörtlich bei F7-B03-225-092 | alle zitierten Paraphrasen wörtlich im Dateikopf, Modell-Lesart getrennt |
| L2 Unsicherheit | `baseCountUncertain` (umbenannt, gleiche Bedingung) | Richtung: `undercountPossible`, `overcountPossible`, `uncertaintyReasons` |
| L3 relative Tiefe | Schlüsse, nur Fenster ab Basisstart | Schlüsse, zwei Fenster `sameWindow` / `trailingHigh` nebeneinander |
| L4 Tabelle | behoben | unverändert |
| L5 Schutztest | behoben | unverändert |

### Zweites unabhängiges Review (Fassung 1.1.0, vor dem Lauf)

Ergebnis: 0 HIGH, 2 MEDIUM, 4 LOW; kein Lookahead, keine Wirkung auf REF, Varianten, Ledger oder Gates; Paraphrasen wörtlich, Inventur byte-gleich mit dem Erzeuger. Alle Befunde vor dem Lauf behoben, Register und Code-Hash danach neu gepinnt.

| Befund | Behebung |
|---|---|
| MEDIUM: `trailingHigh` griff auf der Aktienseite vor den Basisstart zurück (älteres Hoch blähte den Basisrückgang auf) | Aktienseite in beiden Fenstern ab Basisstart; nur der Markt blickt 252 Sitzungen zurück; Gegenprobe mit Hoch 150 vor der Basis |
| MEDIUM: Platzhalter im Vorher/Nachher-Abschnitt | Abschnitt erst nach dem Lauf gefüllt |
| LOW: `earlyBase` ohne die Buchbedingung „nach einer Marktkorrektur“ | zusätzlich `earlyBaseAfterMarketCorrection`; Lesart dokumentiert |
| LOW: > 2× schließt die als akzeptabel genannten 2,3× ein | als Berichtsstufe dokumentiert (Code-Lesart und Abschnitt 3) |
| LOW: Tests prüften `overcountPossible`, `above3x`, `windowTruncated` nicht; Fixture-Basis „Pivot-Berührung“ bei Eröffnung = Pivot | Prüfungen ergänzt, Fixture auf die Engine-Basis korrigiert |
| LOW: Lücke im Schlusskurs nach dem Neustart (MA200 200 Sitzungen undefiniert) nicht als mögliche Überzählung markiert | `MA200_NOT_COMPUTABLE_AFTER_RESET` für jede Sitzung ohne MA200 nach dem Neustart; Test mit Lücke |

### Prozessabweichung (ehrliche Kennzeichnung)

Das oben als „Zweites unabhängiges Review“ bezeichnete Review und die Commits `b7d3a62` / `0cca717` stammen aus einer Session, die nach Auftrag **nur lesen** sollte. Sie hat stattdessen selbst Code und Doku geändert und committet. Dieses Review war deshalb nicht unabhängig von den Änderungen, die es prüfte; das ist eine Prozessabweichung.

### Drittes Review (tatsächlich unabhängig, nur lesend, Gesamtstand 1.1.0)

Ein drittes Review in einem frischen Kontext hat den Gesamtstand des PR nur lesend geprüft. Ergebnis: **0 HIGH, 2 MEDIUM, 7 LOW**, Empfehlung: Paket behalten. Die Korrekturen hat danach der Bearbeiter dieses PR vorgenommen (Diagnosen 1.2.0):

| Befund | Behebung in 1.2.0 |
|---|---|
| MEDIUM-1: Basisbeginn und Pivot sind Intraday-Hochs, die Basis galt aber schon beim ersten Schluss über dem laufenden **Schlusshoch** als abgeschlossen; eine Erholung über den Schluss, unter dem Hoch des Basisbeginns zählte als Basis (Szenario: Basis 2 statt 1) | `MA-MIN7-BASECOUNT-BASE` Revision 2: Ausbruch = Schluss über dem Intraday-Basishoch (quellennäher: Ausbruch über Basishoch / Pivot), als Modellannahme gekennzeichnet; Goldfall des Szenarios (erwartet 1) und Gegenprobe (echter Ausbruch über 125 zählt) |
| LOW-1: offene Trades scannten in G-TOPVOL bis zum Datenende | Scan-Grenze `markDate` des Laufs (zeitpunktgenau); Test |
| LOW-3: Kommentar „exact smaAt semantics“ in `ma200State` stimmte wegen Rundungsdrift der gleitenden Summe nicht | Entscheidung nahe dem Mittel mit `smaAt` selbst, damit exakt; Kommentar angepasst; Test |
| LOW-7: Abschnitt 6 nannte noch die 1.0.0-Formulierung „Untergrenze ohne Neustart“ | korrigiert (Unsicherheit mit Richtung) |

MEDIUM-2 des dritten Reviews war der fehlende Vorher/Nachher-Vergleich nach den Commits der lesenden Session: erledigt mit dem Lauf 40232389268 und dem Abschnitt unten. Die LOW-Befunde 2, 4, 5 und 6 bleiben als **bekannte Grenzen** bestehen und sind nicht geändert:
- LOW-2: Die relative Tiefe misst den Basisstart am Intraday-Hoch; liegt das höchste Schlusshoch einen Tag früher (Umkehrtag), wird der Rückgang der Aktie leicht unterschätzt.
- LOW-4: Zwei Marktkorrekturen ohne neues Hoch dazwischen zählen als eine; der Neustart bleibt am ersten Tief (Modellwahl).
- LOW-5: `sf7VariantRegistrySha256(version)` ändert den Hash schon durch die Versionszeichenkette; beide Werte sind im Test gepinnt.
- LOW-6: Die Nachrechnung im Runner-Test ruft dieselben Funktionen auf und prüft die Zuordnung zu den Trades, nicht die Logik; die Logik decken die Gold- und Gegenproben.

**Viertes Review (nur lesend, Delta `0cca717..75b68b6`):** 0 HIGH, 0 MEDIUM, 6 LOW. Die neue Basislogik, die `markDate`-Grenze und die `smaAt`-genaue MA200-Entscheidung sind korrekt und zeitpunktgenau; Randfälle (junge Basis, Gleichstand, genau 20 Sitzungen, Neustart während einer Basis, Marktkorrektur, mehrere Versuche) nachgeprüft; Inventur bitgleich aus dem Erzeuger. Behoben (nur Tests und Doku, Code- und Register-Hash unverändert): die junge-Basis-Regel und die drei Grenzfälle waren ungetestet; vier Mutationen (`false`, `>=`, `<=`, `>`) überlebten die Tests. Der neue Test `ADV-SF7-MECH-BASECOUNT-YOUNG-AND-BOUNDARIES` erkennt jetzt alle vier. Veraltete Wortlaute in der Doku korrigiert. Offen als bekannte Grenze: der Annahmetext von `MA-MIN7-BASECOUNT-STOCK-RESET` im Code („running closing high“), weil eine Textänderung das Register neu pinnen und vom Lauf 40232389268 lösen würde; ein offener Trade mit `markDate` vor dem Einstieg hieße `NO_SESSION_BEFORE_EXIT` (kommt nicht vor, `markDate` ist der letzte Kalendertag); Sitzungen ohne Schlusskurs zählen zum 20-Sitzungen-Alter.

REF, die Setup- und Ausstiegsvarianten, die 4.0-Engine (`minervini-lifecycle.mjs`, `run-sf4-lifecycle#FILES`) und alle Identitäts-Gates bleiben unverändert; geändert sind nur Diagnosen.

### Vorher/Nachher

Drei Läufe, alle Workflow `supertrader-validation.yml`, Modus `sf7-minervini`, Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Abrechnung `research-v1`, Runner 1.5.0 bzw. 1.6.0:

| Fassung | Lauf | Commit | Register / Code-Hash |
|---|---|---|---|
| 1.0.0 | [40226429160](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40226429160) | `3807283` | `0cc8cb2a…` / `832223b9…` |
| 1.1.0 | [40228813041](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40228813041) | `0cca717` | `131746dc…` / `2862748e…` |
| 1.2.0 | [40232389268](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40232389268) | `bd5d05d` | `a122022a…` / `dd3568fb…` |

In allen drei Läufen gleich: `researchCodeSha256` `c834b227…`, `variantRegistrySha256` `f13ea350…`, `sf7VariantRegistrySha256` `9b9a8a00…`, `sf7ExitRegistrySha256` `df0379ae…`. **REF SEPA 954 Trades, Ledger `1ca52391…`; REF Power Play 1.007 Trades, Ledger `877ceb33…`**, `matchesAuthoritativeLedger` wahr. 1.1.0 gegen 1.2.0 verglichen (öffentliche Teile): REF, `ALT-SEPA-FLAT-BASE` / `-TT6-25` / `-RS-LINE` (824 / 982 / 890), alle fünf Ausstiegsvarianten beider Strategien (Ledger-Hashes und alle Zähler außer `signalsByBaseNumber`), Engine-Kopie gleich REF (Ledger, Trades, Kurve, Zähler), alle älteren Diagnosen sowie `topVolumeDecline`, `relativeBaseDepth` und `entryDistance` gleich. Geändert sind nur die Basiszählung und die daraus abgeleitete Zuordnung der Klimax-Signale.

Basiszählung (SEPA 954 / Power Play 1.007):

| Diagnose | SEPA 1.0.0 | SEPA 1.1.0 | SEPA 1.2.0 | PP 1.0.0 | PP 1.1.0 | PP 1.2.0 |
|---|---|---|---|---|---|---|
| Basiszahl 1 / 2 / 3 / 4 / 5+ | 442 / 265 / 120 / 76 / 51 | 442 / 265 / 120 / 76 / 51 | 444 / 271 / 141 / 56 / 42 | 736 / 151 / 84 / 23 / 13 | 736 / 151 / 84 / 23 / 13 | 738 / 160 / 75 / 26 / 8 |
| Neustart Marktkorrektur / unter MA200 / keiner | 251 / 697 / 6 | 251 / 697 / 6 | 251 / 697 / 6 | 142 / 839 / 26 | 142 / 839 / 26 | 142 / 839 / 26 |
| unsicher (davon Überzählung / Unterzählung möglich) | 13 (–) | 22 (22 / 6) | 22 (20 / 6) | 61 (–) | 49 (44 / 26) | 48 (41 / 26) |
| früh 1–2 / davon nach Marktkorrektur | 707 / – | 707 / 209 | 715 / 213 | 887 / – | 887 / 120 | 898 / 119 |
| spät 3–4 / Spätphase ≥ 4 / wahrscheinlich scheiternd ≥ 5 | 196 / 127 / 51 | 196 / 127 / 51 | 197 / 98 / 42 | 107 / 36 / 13 | 107 / 36 / 13 | 101 / 34 / 8 |

Klimax-Variantensignale nach Basiszahl 1 / 2 / 3 / 4 / 5+ (Signalanzahl gleich, nur die Zuordnung ändert sich):

| Variante | 1.0.0 = 1.1.0 | 1.2.0 |
|---|---|---|
| SEPA `EXIT-CLIMAX` | 32 / 27 / 12 / 4 / 1 | 30 / 28 / 14 / 2 / 2 |
| SEPA `EXIT-CLIMAX-UPCLOSES` | 29 / 15 / 14 / 4 / 2 | 27 / 18 / 15 / 2 / 2 |
| PP `EXIT-CLIMAX` | 39 / 39 / 26 / 5 / 8 | 40 / 45 / 21 / 7 / 4 |
| PP `EXIT-CLIMAX-UPCLOSES` | 390 / 92 / 55 / 10 / 9 | 398 / 87 / 47 / 22 / 2 |

Übrige Diagnosen (1.1.0 = 1.2.0; 1.0.0 hatte je nur ein Fenster):

| Diagnose | SEPA 1.0.0 | SEPA 1.1.0 = 1.2.0 | PP 1.0.0 | PP 1.1.0 = 1.2.0 |
|---|---|---|---|---|
| Top-Volumen `aboveMa200Run` ja / nein / n. a. (gekürzt) | 97 / 830 / 27 | 97 / 830 / 27 (33) | 57 / 727 / 223 | 55 / 683 / 269 (11) |
| Top-Volumen `trendTemplateRun` ja / nein / n. a. | – | 329 / 598 / 27 | – | 52 / 330 / 625 |
| relative Tiefe `sameWindow` > 2× / > 3× (bewertet) | 8 / 1 (78) | 8 / 1 (78) | 260 / 179 (283) | 260 / 179 (283) |
| relative Tiefe `trailingHigh` > 2× / > 3× (bewertet) | – | 5 / 1 (196) | – | 271 / 180 (369) |
| Eröffnung über Pivot 0 / ≤ 1 / 1–2 / 2–3 / 3–5 / > 5 % | 11 / 84 / 15 / 6 / 6 / 2 | gleich | 10 / 60 / 24 / 8 / 12 / 12 | gleich |
| nicht ausgeführte Orders über dem Limit | – | 28 | – | 37 |

Lesehinweise:
- Revision 2 der Basiszählung zählt Erholungen über einen alten Schluss, aber unter dem Intraday-Basishoch nicht mehr als Ausbruch. Dadurch wandern Setups aus hohen Basiszahlen nach unten (SEPA ≥ 4: 127 → 98; Power Play 5+: 13 → 8). Weil der Basisbeginn jetzt am Intraday-Hoch liegt und reife Basen ihren Beginn behalten, verschieben sich auch einzelne Fälle nach oben (SEPA Basis 3: 120 → 141). Das ist eine Zählung, keine Bewertung und keine Grundlage für eine Variantenwahl.
- 1.0.0 und 1.1.0 zählen Basen gleich; 1.1.0 änderte nur die Unsicherheitsflags. Der `markDate` der offenen REF-Trades (SEPA 17, Power Play 9) ist der letzte Kalendertag des Laufs; deshalb ändert die `markDate`-Grenze (LOW-1) in diesem Lauf nichts, sie schützt nur gegen Reihen, die länger sind als der Lauf.
- Die `smaAt`-genaue MA200-Entscheidung (LOW-3) ändert in diesem Lauf keine Neustart-Zählung.

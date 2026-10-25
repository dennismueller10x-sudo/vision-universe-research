# Supertrader 7.0 – Minervini: mechanisch belegbare Restfunktionen (Paket 1.4.0)

Stand: 25.10.2026. Status aller Strategien unverändert: `LIVE_NOT_APPROVED` / `DIAGNOSTIC_NOT_CERTIFIED`. Keine Live-Aktivierung, keine Orders, keine Zertifizierung.

Dieses Paket arbeitet die DEFERRED-Fundstellen aus der E7-2-Klassifikation ([SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md](SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md), Abschnitt 2) ab. Umgesetzt wird nur, was sich mechanisch aus der Paraphrase belegen lässt. Alles ist **Diagnose**: Zählungen auf den REF-Trades, nie ein Gate, nie ein Filter, nie ein Ausstieg, nie ein Fill, nie eine Variantenwahl.

## 1. Code und Versionen

| Teil | Datei | Version / Fingerabdruck |
|---|---|---|
| Diagnosen | `scripts/supertrader/source-faithful/research/minervini-sf7-mechanical.mjs` | `sf7-minervini-mechanical-1.0.0`, Register `sf7MechanicalRegistrySha256` `0cc8cb2a…` (vor dem Lauf gepinnt) |
| Paket | `research/minervini-sf7.mjs` | `sf7-minervini-1.4.0`; nur Versionszeichenkette und Kopfkommentar geändert |
| Runner | `research/run-sf7-minervini.mjs` | `sf7-minervini-runner-1.5.0`, `SF7_FILES` um die neue Datei erweitert |
| Code-Hash | `sf7CodeSha256` | vor dem Lauf gepinnt (Test `SF7-MIN-RUNNER`), Wert siehe Abschnitt 5 |

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
| F7-B03-225-092 | Erschöpfungsaktion aus Basis 1 bullish, nur nach später Basis Verkaufssignal | **Diagnose** `signalsByBaseNumber` für `EXIT-CLIMAX` / `EXIT-CLIMAX-UPCLOSES`; eine Unterdrückungsvariante bleibt DEFERRED (ändert Trades, eigene Vorregistrierung nötig) |
| F7-B03-217-087 | Rückgang auf dem größten Volumen seit Trendbeginn | **Diagnose** `topVolumeDecline` (G-TOPVOL); Churning und Umkehr auf hohem Volumen bleiben QUALITATIVE |
| F7-B12-280-275 | Aktien meiden, die mehr als 2–3× der Marktkorrektur korrigieren | **Diagnose** `relativeBaseDepth` (> 2× / > 3×); der Setupfilter bleibt DEFERRED (Variante) |
| F7-B07-067-140 | Gaps einige Prozent über dem Kaufpunkt nicht kaufen | **Diagnose** `gapOpenAbovePivot`; Variante DEFERRED („einige Prozent“ unbeziffert) |
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

Keine davon ist eine Minervini-Regel. Gedruckte Werte stehen in `SF7_MECHANICAL_SOURCE_BOUNDS` (alle `translationUnverified`).

| Annahme | Festlegung | Begründung |
|---|---|---|
| `MA-MIN7-BASECOUNT-BASE` | Eine Basis endet mit dem ersten Schluss über dem laufenden Schlusshoch, das mindestens **20 Sitzungen** vorher gesetzt wurde; kürzere Pausen zählen nicht; keine Tiefenschranke (Flat Bases zählen) | B12 PDF 115: Basen in Stage 2 dauern 4–5 Wochen bis über ein Jahr, untere Grenze 4 Wochen. Schlüsse auf beiden Seiten, weil ein Intraday-Hoch am Ausbruchsversuch die Basis sonst einen Tag vor dem Ausbruch neu starten würde |
| `MA-MIN7-BASECOUNT-MARKET-RESET` | Marktkorrektur = SPY schließt mindestens **10 %** unter dem höchsten bisherigen Schluss; die Zählung beginnt am tiefsten SPY-Schluss der letzten solchen Korrektur, der am Setup-Tag bekannt ist | Die Bücher beziffern die Marktkorrektur nicht (ABSENT_FROM_MATERIAL); 10 % ist eine Konvention. Am Tief beginnt die Zählung, damit die in der Korrektur gebildete Basis Basis 1 ist (B12 PDF 116) |
| `MA-MIN7-BASECOUNT-STOCK-RESET` | Neustart auch nach dem letzten Schluss der Aktie unter ihrem 200-Tage-Mittel; ohne einen solchen Schluss und ohne spätere Marktkorrektur ist die Zahl **unsicher** in beide Richtungen (`baseCountUncertain`: frühere Basen vor dem ersten Balken fehlen; ein unsichtbarer Schluss unter MA200 in den ersten 199 Balken hätte neu gestartet) | Basen werden in einem Stage-2-Anstieg gezählt (B12 PDF 115–116); die 200-Tage-Linie ist die Stage-2-Grenze des Trend Templates (TT-1). Der Trend-Template-Lauf (`MA-MIN7-STAGE2-START`) taugt hier nicht, weil TT-5 (Schluss über MA50) in fast jeder Basis scheitert |
| `MA-MIN7-BASECOUNT-CURRENT` | Basiszahl = abgeschlossene Basen nach dem Neustart und vor dem Setup-Schluss + 1 (die eigene Basis des Setups); der Setup-Schluss schließt nie eine Basis ab, auch wenn er über einem alten Schlusshoch und unter dem Intraday-Pivot liegt | So ist die erste Basis nach dem Neustart Basis 1 (B03 PDF 207) |
| `MA-MIN7-TOPVOL` | Erster Abwärtsschluss ab dem Einstieg, dessen Volumen über dem jeder Sitzung seit Trendbeginn liegt; Trendbeginn = Sitzung nach dem letzten Schluss unter MA200 vor dem Setup (dasselbe Fenster wie die Basiszählung); Fenster endet bei geschlossenen Trades eine Sitzung vor der Ausstiegssitzung; Setup-Schluss unter MA200 = nicht bewertbar | B03 PDF 217 / 219; keine Größenschranke für den Rückgang. Der Trend-Template-Lauf (`MA-MIN7-STAGE2-START`) würde das Fenster am letzten MA50-Bruch in der Setup-Basis enden lassen, „seit Trendbeginn“ schrumpfte auf wenige Wochen (Review M2) |
| `MA-MIN7-RELDEPTH` | größter Rückgang der Aktienschlüsse geteilt durch den größten Rückgang der SPY-Schlüsse, beide vom Basisstart (52-Wochen-Hoch wie G-BASE-DEPTH) bis zum Setup-Tag; Schlüsse auf beiden Seiten; das Marktfenster beginnt am Basisstart der Aktie, auch wenn die Marktkorrektur früher begann; nur bewertet, wenn der Markt mindestens 10 % fiel | B12 PDF 280 vergleicht mit der Marktkorrektur, ohne Fenster und ohne Untergrenze; ohne Untergrenze wäre jede Basis bei 1 % Markt-Dip „vielfach“ |
| `MA-MIN7-ENTRY-DISTANCE` | Fill / Pivot − 1 und Eröffnung / Pivot − 1 (jeder Fill, dessen Balken am oder über dem Pivot eröffnete, auch Limit-Fills danach) in Berichtsstufen 0, (0, 1 %], (1, 2 %], (2, 3 %], (3, 5 %], > 5 %; Puffer: (Hoch des Fill-Balkens − Pivot) × `splitAdj` in Roh-Dollar unter 0,05 / 0,10 / 0,20 | B07 PDF 67 / 87, B12 PDF 297 (keine Zahl), B07 PDF 40 (keine magische Zahl). Die Stufen berichten nur; keine Schranke, kein k gewählt |

## 4. Was weiter offen bleibt

- **EPS-abhängige Punkte** (PIT-KGV, EPS-Beschleunigung): Die abgeleiteten Q4-Werte sind in 405 Fällen nicht splitkorrigierbar (6.0). Eine Teilmenge ohne abgeleitete Q4-Werte hätte in jedem Geschäftsjahr eine Lücke. TTM- und gleitende 2-Quartals-Reihen wären damit nicht PIT-vollständig. Kein Teilumfang ist sauber PIT-fähig; die Punkte bleiben DEFERRED, bis die EPS-Reihe repariert ist.
- **Varianten** zu Chase, Puffer, Stop-Fallback, Sizing, Marktdrawdown, Basisfilter und Klimax-Unterdrückung: nur mit eigener Vorregistrierung, nicht nach diesen Zählungen gewählt.
- **Marktkorrektur 10 %** ist eine Konvention, keine Buchzahl. Sie bestimmt Basiszählung und relative Tiefe gemeinsam.

## 5. Lauf

Wird nach dem maßgeblichen Lauf ergänzt.

## 6. Tests

`scripts/supertrader/tests/sf-sf7-minervini-mechanical.test.mjs` (Goldfälle und Gegenproben):
- Basiszählung: vier Basen nach dem Aktien-Neustart (Basis 4, spät); Marktkorrektur 15 % setzt auf Basis 2 zurück, 9 % nicht; Pause unter 20 Sitzungen zählt nicht; Untergrenze ohne Neustart;
- **Lookahead ausgeschlossen:** Balken nach dem Setup verfälscht und SPY nach dem Setup-Tag abgestürzt, das Ergebnis bleibt gleich; ebenso nach Abschneiden der Reihe; der Markt-Anker ist zeitpunktgenau;
- Top-Volumen: Signal am dritten Tag; liegt der Tag auf der Ausstiegssitzung, wird er nicht gelesen; Balken ab der Ausstiegssitzung verfälscht, Ergebnis gleich;
- relative Tiefe: 30 % Basis gegen 12 % Markt (> 2×, nicht > 3×), 5 % Markt unter der Untergrenze, spätere Daten verfälscht ohne Wirkung;
- Einstiegsabstand: Stufen, Gap-Abstand und Puffer in Roh-Dollar (splitAdj 2);
- Runner: Diagnosen je Strategie vorhanden, REF gleich mit und ohne Ausstiegsvarianten, keine Kennzahlen im öffentlichen Teil.

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

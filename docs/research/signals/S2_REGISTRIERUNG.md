# E4 / S2 – Registrierung (vor dem ersten S2-Lauf, 05.11.2026)

Forschung, nicht zertifiziert. Ergänzt das unveränderte [S1-Protokoll](PROTOKOLL.md). Erkennung, Kandidaten, Ausführung, Kosten, Zählung, Statistik und Urteilsregeln gelten wörtlich weiter. Der Code ist `scripts/research/signals/study.mjs` (importiert). Die Pro-Titel-Schleife in `s2.mjs` ist Zeile für Zeile aus `study.mjs#run` übernommen. Paritätsnachweis: Auf den fünf S1-Titeln ergibt S2 alle 383 S1-Trades mit identischen Feldern und Zählern.

Nach diesem Commit wird die Registrierung nicht geändert. Abweichungen stehen nur im Ergebnisbericht.

## Was sich gegenüber S1 ändert (nur Daten und Benchmark)

1. **Universum:** Zufallsstichprobe von 1.000 Titeln, fester Seed 20261105, Datei [s2/sample.json](s2/sample.json).
   - Geschichtet im Verhältnis der Grundgesamtheiten: 6.265 heutige US-Stammaktien (`universe-ELIGIBLE_US_EQUITY.json`, `COMMON_STOCK`) und 1.675 qualifizierte delistete V13-Ketten (Register 1.0.0). Gezogen werden 789 heutige und 211 delistete Titel.
   - Ausgeschlossen sind 308 Vorzugsaktien, die das Universum als `COMMON_STOCK` führt. Erkannt werden sie am Tickermuster `-P(-|$)`, etwa `WFC-P-Y`. Der Ausschluss wurde vor dem ersten Lauf festgelegt.
   - Die Stichprobe hängt nur an committeten Listen, nicht an Ergebnissen.
   - Grund für die Stichprobe: Das volle Universum bräuchte rund 23 Mio. Engine-Aufrufe, rund 290 CPU-Stunden. Entscheidung der Steuerung am 05.11.2026.
2. **Kurse:** vollständige Tages-OHLC aus der kanonischen Historienablage (Tiingo, R2), delistete Titel aus dem Archivteil `v13-raw` im Kettenzeitraum. Splitnormierung unverändert über `return-series.js#splitFactors`. Titel mit weniger als 300 Balken oder ungültiger Historie werden gezählt, nicht gerechnet.
3. **Benchmark:** Der exakte SPY-Vergleich rechnet vom Open des Einstiegstags bis zum Schluss des Ausstiegstags, mit gleichen Kosten und normiert auf den Aktien-Risikoanteil. Das ist der von S1 für S2 verlangte echte Benchmark.
   - Quelle sind die SPY-Tagesbalken der Ablage.
   - Fehlen sie für einen Trade, ist der exakte Test der Familie blockiert (p = 1, wie im Protokoll).
   - Marktphase und SPY-Proxy bleiben wie in S1.
4. **Zeitraum:** Signale 2016-01-01 bis zum letzten verfügbaren Balken, wie in S1.
   - Die im S1-Protokoll für S2 genannten Jahre 2008–2015 werden **nicht** verwendet. Die Steuerung hat entschieden, sie für eine spätere, eigene Bestätigung unberührt zu halten.
   - S2 ist damit eine Erweiterung des Universums 2016–2026, keine Bestätigung auf unberührten Jahren. Eine S3 bleibt nach dem S1-Protokoll unzulässig, bis diese Bestätigung vorliegt.
5. **Veröffentlichung:** Im Repository stehen Methodik, Abdeckung (Fälle, Titel, Quartale je Familie) und Urteil. Kennzahlen und Trades gehen verschlüsselt an den Owner-Schlüssel `scripts/supertrader/validation/results-public-key.pem` (Owner-Entscheidung über die Steuerung).

## Unverändert

Die fünf Familien und die Erkennung, nächster Open, 60-Tage-Fenster, Kosten 10 + 10 bp, R und Netto-R, Halten derselben Aktie, Cluster-Bootstrap nach Quartalen (9.999 Ziehungen, Seed 20261105), Holm über 10 Hypothesen, Mindestabdeckung 100 Trades, 20 Aktien und 20 Quartale, die Urteilsregeln. Keine Parametersuche, kein zweiter Variantenlauf.

## Ergänzung 1 (05.11.2026, vor dem ersten Ergebnis): DQ-K5-Quarantäne

**Anlass:** Strang G hat in den Quant-Kursreihen um den Jahreswechsel 2022/23 Wochensprünge gefunden, die wie nicht bereinigte Reverse-Splits aussehen. Beispiele: KALA 194 → 1.907,5, VVOS 10,05 → 38,25, JSPR 4,83 → 14,8. Die Supertrader-Quarantäne DQ-K5 greift im Quant-Datenpfad nicht. Ein Fehler dieser Art schönt Long-Signale nach oben.

**Kein Ergebnis gesehen:** Die beiden ersten S2-Läufe brachen vor jedem Ergebnis ab, Lauf 42024768219 wegen Speichermangel, Lauf 42025838520 per Abbruch. Es gibt weder ein Teilergebnis noch eine Kennzahl.

**Regel (wie Supertrader DQ-K5):**
- Eine K5-Sitzung ist ein Tag, dessen splitbereinigter Schluss das Fünffache des Vortagsschlusses erreicht oder überschreitet oder auf ein Fünftel davon fällt oder darunter.
- Ein Trade gilt als betroffen, wenn eine K5-Sitzung zwischen 299 Sitzungen vor dem Signal und dem Ausstieg liegt. Das deckt das Erkennungsfenster von 300 Balken und das Haltefenster ab.
- Echte Kursvervielfachungen fallen ebenfalls darunter. Die Regel ist bewusst vorsichtig.

**Auswertung:**
- Primär, für das Urteil, zählen die Trades ohne K5-Berührung, mit Holm über die 10 Hypothesen.
- Die Auswertung mit allen Trades, so wie oben registriert, wird als Sensitivität mit eigenem Urteil ausgewiesen.
- Ausgeschlossene Trades und betroffene Titel werden gezählt.

Erkennung, Zählung und alle übrigen Regeln bleiben unverändert. Auf den fünf S1-Titeln gibt es keine K5-Sitzung, die Parität bleibt bestehen.

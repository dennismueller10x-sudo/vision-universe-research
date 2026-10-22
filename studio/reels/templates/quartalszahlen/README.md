# Vorlage „Quartalszahlen" (datengesteuert)

Für zeitkritische Zahlen-Reels (Beat oder Miss). `data.json` füllt die Grafiken (Urteil, Gewinn je Aktie, Umsatz mit Abweichung, drei Kennzahlen-Karten, Kurs). `script.txt` steht im Skript-DSL, `caption.txt` ist der Entwurf.

Stand: Tesla Q3 2026 als Beispiel (Fassung v1, **nicht veröffentlicht**, der Owner wollte den ARK-Kursziel-Teil nicht im Zahlen-Reel). Die Vorlage enthält keine Medien.

- `demo: true` in `data.json` blendet „DEMO-ZAHLEN" ein, vor der echten Produktion auf `false` setzen.
- Abweichung unter 0,05 % wird als „±0,0 %" gezeigt.
- Zahlen immer aus der Primärquelle prüfen. Konsens und Kurs weichen je nach Quelle ab. Aus Zeitgründen kam der Konsens aus Electrek/FactSet.
- `ret_pct` überschreibt die berechnete Rendite, damit Sprechtext und Grafik dieselbe Zahl zeigen.
- Szene 4 der Beispielvorlage zeigt ein ARK-Kursziel (optional). Der Owner mochte die Mischung nicht, für neue Zahlen-Reels weglassen oder durch eigene Aussagen aus dem Call ersetzen.

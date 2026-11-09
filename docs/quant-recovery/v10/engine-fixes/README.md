# V10 – vorbereitete Engine-Reparatur (nicht angewendet)

## research-portfolio: Rundungsreste beim vollständigen Verkauf

Befund (Strang STUDIES): Wird eine Position auf Zielgewicht 0 verkauft, rechnet die Engine `units = delta / price`. Bei großen Stückzahlen bleibt Rundungsstaub > 1e-12 (absolute Grenze) stehen; die nächste Bewertung scheitert mit `EXACT_PRICE_UNAVAILABLE` bzw. `NEGATIVE_UNITS`. Der V10-Strategielauf umgeht das mit Numeraire 1 (reine Skalierung, zurückgerechnet).

Reparatur: [research-portfolio-full-exit.diff](research-portfolio-full-exit.diff) – bei Zielgewicht 0 werden exakt die gehaltenen Stück verkauft und die Position gelöscht.

Nachweis (lokal, Patch temporär angewendet, danach zurückgesetzt):
- `node --test quant/tests/research-portfolio*.test.mjs quant/tests/v10-studies.test.mjs`: 29 bestanden, 1 erwartungsgemäß fehlgeschlagen – genau der Test `known engine limitation … float dust`, der den Fehler dokumentiert (er muss im Reparatur-PR in einen Regressionstest „kein Staub“ umgedreht werden).

Warum nicht in V10: Die Engine ist in V8/V9-Manifesten hashgebunden (Portfolio-Paritäten 22/22). Die Reparatur gehört in einen eigenen PR mit Vorher/Nachher der V9-Ledger (erwartet: Abweichungen höchstens in der letzten Gleitkommastelle) und erneuter Python-Parität.

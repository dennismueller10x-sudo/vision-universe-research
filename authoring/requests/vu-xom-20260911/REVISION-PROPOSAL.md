# Vorschlag: eine einzige Creative-Revision für `vu-xom-20260911`

**Status: VORSCHLAG. Nicht ausgelöst. Kein Work-Request erzeugt.**

Die vier vorhandenen Varianten bestehen die Creative-Quality-Rubrik
nicht (Bericht: `social/data/creative-quality/vu-xom-20260911.json`).
Dies ist die Instruktion, die ein einziger Revision-Request tragen
müsste. Sie braucht eine Owner-Freigabe, bevor irgendetwas davon
ausgeführt wird.

## Was gleich bleibt

- Dieselbe `content_id` `vu-xom-20260911`, dasselbe Evidence Package,
  dieselben 23 gebundenen Belege.
- **Keine neue Bildgenerierung.** Das mit allen neun Prüfungen
  verifizierte Asset aus Attempt 3 wird wiederverwendet
  (`assets/visual-01.png`, SHA-256 `a378d078…cc9e0b40`, 1122×1402).
  Die Revision betrifft ausschließlich Text.
- `publishing_allowed: false`. Keine Veröffentlichung, kein Merge.
- Unverändert verboten: Prognose, Empfehlung, Ursachenbehauptung.
  Pflichthinweis „Keine Anlageberatung." bleibt.

## Was neu verlangt wird

### 1. Der Hook trägt den gemessenen Bogen

Bisher fordert der Brief vier Varianten „innerhalb der Strategie
`value_first`" — also vier Wege, dieselbe Zahl voranzustellen. Genau
das haben wir bekommen. Neu:

> Jeder Hook muss ZWEI gemessene Werte gegeneinanderstellen: eine
> Stärke und den Wert, der trotz dieser Stärke nicht höher ausfällt.
> Beide Zahlen stehen im Hook selbst, verbunden durch ein Wort, das
> einen Gegensatz stiftet.

Aus der Evidenz ergibt sich der Bogen ohne Zutun:

| | Wert | Anteil |
|---|---|---|
| Leitwert | Score 76 von 100 | 76 % |
| Stärke | TREND_STRUCTURE 27,35 von 30 | 91 % |
| Bremse | VOLATILITY 5 von 10 | 50 % |
| Stütze (Lesersprache) | 12M-Entwicklung +47,6 % | — |

Die Frage, die daraus folgt und die belegt beantwortbar ist:
**Warum trotz dieser Trendstärke nur 76?**

Ausdrücklich: *keine* vorgegebene Hook-Zeile. Die Formulierung bleibt
Sache des Agenten, die Auswahl unter den Varianten Sache von VU.

### 2. Lesersprache statt Innensprache

Im öffentlichen Text nicht zulässig:

`TREND_STRUCTURE`, `PROJECTION_AUXILIARY`, `RELATIVE_STRENGTH`,
`STRONG_POSITIVE`, `MOMENTUM`/`VOLATILITY`/`VOLUME`/`SETUP` als
Bezeichner, „methodischer Setup-Rang", „Perzentil", `z=…`, `ATR`,
`SMA50`/`SMA200`, „X trägt Y von Z Punkten bei", „Trendwert",
„Handelstage".

Die Sachverhalte dürfen vorkommen — die Bezeichner nicht. „Die
Schwankungsbreite trägt nur die Hälfte bei" sagt dasselbe wie
„VOLATILITY 5 von 10 Punkten" und verlangt vom Leser nicht, unser
Datenmodell zu lernen.

### 3. Die Caption wählt aus, statt zu kopieren

Verwendet werden die fünf Belege der Story-Auswahl:

`score`, `score-contribution-trend_structure`,
`score-contribution-volatility`, `momentum-12m`, `score-meaning`

Die übrigen 18 Belege bleiben gebunden und werden vom Fact Check
weiter geprüft — sie gehören nur nicht in den öffentlichen Text.

Zahlendichte höchstens 12 je 100 Wörter (Datumsangaben und Skalen
zählen nicht mit). Die beanstandete Caption liegt bei 12,7.

### 4. Hook und Caption sagen Verschiedenes

Der erste Satz der Caption wiederholt nicht die Zahlen des Hooks. Zwei
Flächen, zwei Beiträge.

## Kosten

Eine Work-Ausführung. Keine Bildgenerierung. Kein weiterer Request,
auch nicht bei Misserfolg — ein zweiter Fehlschlag wäre ein Befund
über die Instruktion und nicht über den Agenten, und gehört dann
wieder vor den Owner.

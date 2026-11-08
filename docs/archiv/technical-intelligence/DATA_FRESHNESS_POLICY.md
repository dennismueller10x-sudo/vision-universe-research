# Datenstand-Richtlinie für kundensichtbare technische Thesen (data-freshness-1.0.0)

**Grundsatz:** Eine technisch gültige Elliott-These ist keine aktuelle Kundenthese, wenn die Kursreihe darunter wesentlich veraltet ist. Die Historie bleibt erhalten; altes Marktgeschehen wird nicht als aktuelle Information gezeigt.

Keine Änderung an Elliott-Regeln, Ranking, Kandidatenerzeugung, Explore-Kuratierung, Projektionsformeln, Register-Methodik oder Wertpapierstamm. Die Richtlinie ordnet die letzte Bar eines Titels dem Bezugstag zu und entscheidet nur über die **Sichtbarkeit**.

## Zustände

| Zustand | Bedingung (Handelstage zwischen letzter Bar und Bezugstag) | Kundensicht |
|---|---|---|
| `FRESH` | ≤ 1 | unverändert |
| `DELAYED` | 2 bis 5 | These bleibt; Hinweis „Kursdaten verzögert · letzter Stand TT.MM.JJJJ“ bzw. „Datenstand: TT.MM.JJJJ · verzögert“ |
| `STALE` | > 5 | laufende These zurückgehalten: „Analyse zurückgehalten – Die Kursreihe ist nicht aktuell genug für eine laufende technische These.“ |
| `NON_TRADING` | Wertpapierstamm: inaktiv/delisted, und nicht frisch | zurückgehalten, eigene Begründung („nicht mehr gehandelt“) |

Bezugstag = letzte abgeschlossene US-Handelssitzung (ab 22:00 UTC gilt die Sitzung als abgeschlossen); Build-Option `--reference` zum Nachrechnen. Zählung in **Handelstagen** nach dem NYSE-Kalender (Feiertage regelbasiert, `ti/data-freshness.js`), nicht in Kalendertagen; für unbekannte Börsen fällt sie auf Wochentage zurück.

### Schwellen und Begründung (Bestandsaufnahme 2026-10-12, Bezugstag 2026-10-09)

Die Altersverteilung der 5.035 Produkttitel ist zweigipflig: **4.979 Titel haben Alter 0**, danach bleibt nur ein Einzelfall bei 2 Handelstagen; die übrigen liegen bei 4 bis 41. Es gibt keine Häufung im Bereich 1 bis 3, die eine Schwelle verschieben würde. Die Grenze 5/6 liegt dagegen **nicht** in einer natürlichen Lücke (Alter 5: 6 Titel, 6: 4, 8: 4); sie ist eine Setzung, begründet mit der bestehenden Datenprüfung.

* `FRESH ≤ 1`: Das Produkt wird nach Börsenschluss gebaut; ein Handelstag Verzug ist die normale Veröffentlichungslage.
* `DELAYED ≤ 5`: gleiche Grenze wie die bestehende Datenprüfung (`quant/engines/market-quality.js`, `maxStaleTradingDays = 5`, Befund `stale_last_bar`); bis dahin fehlt der Wochenanalyse höchstens eine Wochenbar.
* Darüber beschreibt die Kursreihe eine abgeschlossene Vergangenheit.

Die Schwellen sind keine Ticker-Ausnahmen und nicht auf Beispiele abgestimmt (Test D-5).

## Wirkung im Produkt

* **Shard** eines zurückgehaltenen Titels: Kurs, Chart, Datenqualität, Historie und der Block `freshness` bleiben; Ausblick, Szenarien, Alerts, Elliott-Zählung, Projektion (Primär, Alternative, Motiv-Alternative, Explore Highlights, Candidate Explorer) sind durch einen ausdrücklichen Zustand `WITHHELD` ersetzt. Der Block `freshness` trägt die Kundentexte; jeder Verbraucher nutzt dieselben Worte.
* **Index** (`index.json.gz`): Zeile mit `withheld: 1`, `fr` (Zustand, Alter, letzte Bar, Grund) und ohne These. `fr` fehlt = `FRESH`.
* **Chartbild, Aktienseite, VU Ask** (`getChartbild`, `getChartbildLage`, `getChartbildAlternatives`, Satz im Chat): zurückgehaltene Titel werden nie als aktuell beschrieben; verzögerte tragen den Hinweis. Professioneller Modus: letzte Bar, Alter in Handelstagen, Einstufung, Grund.
* **Alerts** (`alerts.json`): kein Ereignis beim Zurückhalten und keines bei der Wiederaufnahme (neuer Ausgangszustand).
* **Screener**: zurückgehaltene Zeilen werden wie schon unveränderte Kursreihen ausgelassen.
* **Lebenszyklus** (`projection-theses.json`): Die vollständige These bleibt im Store; der Lebenszyklus wird weiter mit der echten Projektion geführt. Beim Zurückhalten wird **einmal** das Ereignis `WITHHELD_STALE_DATA` angehängt (Zustand, letzte Bar, Alter, Grund), bei frischen Daten `VISIBILITY_RESTORED`. Revisionen, Zustand und frühere Ereignisse bleiben unverändert (Test D-13).

## Systemischer Ausfall

Wären mehr als 20 % des Universums zurückgehalten, bricht der Build ab, bevor etwas geschrieben wird (Datenlage: Pipeline, Anbieter oder Eingang). Bewusste Läufe: `--allow-systemic-stale`. `--reference` wird auf das Format JJJJ-MM-TT geprüft. Der Anteil steht in `meta.projection.freshness.systemic`.

## Ursachen (nur was die Daten belegen)

| Code | Bedeutung | belegt |
|---|---|---|
| `SECURITY_INACTIVE` | Wertpapierstamm führt den Titel als inaktiv/delisted | ja |
| `NO_NEWER_BARS` | die Kursreihe wurde ≥ 5 Handelstage nach der letzten Bar vom Anbieter bezogen und enthält nichts Neueres (Übernahme, Aussetzung, Delisting oder Abdeckungslücke) | nein: Ursache nicht bestimmbar |
| `REFRESH_STOPPED` | die Reihe wird seit der letzten Bar nicht mehr aktualisiert | nein: Ursache nicht bestimmbar |

Bestandsaufnahme (`data/freshness-audit-2026-10-12.json`, Bezugstag 2026-10-09): 4.979 FRESH, 5 DELAYED, 48 STALE, 3 NON_TRADING; Ursachen aller 56 nicht frischen Titel: 3 belegt (inaktiv laut Stamm), 27 `NO_NEWER_BARS` und 26 `REFRESH_STOPPED` (beide nicht belegt, **zur Untersuchung ausgewiesen**). Daten- oder Pipeline-Probleme werden nicht stillschweigend unterdrückt: Die Liste steht im Audit, die Zähler in `meta.json` (`projection.freshness`).

## Register und Produktidentität

* Das Register führt die **Kundenprodukt-Sicht** nur für Titel, die der Kunde sieht. Für zurückgehaltene Titel entstehen keine neuen Produktereignisse.
* Offene Produktereignisse: Wird der Titel zurückgehalten, hängt der Lauf eine Revision `WITHHELD_STALE_DATA` an (Zustand, letzte Bar, Alter, Richtlinie); kehren frische Daten zurück, `VISIBILITY_RESTORED`. Je Ereignis höchstens ein Übergang je Zustandswechsel; das Ereignis selbst und alle früheren Einträge bleiben unverändert (Test M10-R8).
* **Identität von Produkt und Register** umfasst jetzt den Datenstand: letzte Bar, Zustand und Sichtbarkeit je Titel für **alle** Produkttitel (`compareFreshness`) sowie die Explore Highlights (`compareHighlights`). Hart abweichend (= „nichts registriert“) ist nur: verschiedene Sichtbarkeit bei gleicher letzter Bar, oder ein Produkttitel fehlt im Register. Ausnahme `TIMING`, gezählt und ausgewiesen: andere letzte Bar je Titel (das Register rechnet auf frisch gebauten Wochenreihen, das Produkt auf den committeten Langreihen) oder ein Produkt, das auf einem anderen Bezugstag als die registrierte Woche gebaut wurde. `verify.mjs` weist einen Lauf zurück, dessen Vergleich nicht bestanden ist. Solange das veröffentlichte Produkt noch ohne Richtlinie gebaut ist, ist der Datenstand-Vergleich „nicht anwendbar“.

## Dateien

* `quant/engines/technical/ti/data-freshness.js` – Richtlinie, Kalender, Klassifikation, Kundentexte
* `scripts/technical/lib/ti-freshness.mjs` – Build: Klassifikation, Zurückhalten, Zähler
* `scripts/technical/audit-data-freshness.mjs` – Bestandsaufnahme (nur lesend)
* Tests: `quant/tests/ti-data-freshness.test.mjs` (D-1 … D-16), `quant/tests/elliott-registry.test.mjs` (M10-R8, M10-R9)

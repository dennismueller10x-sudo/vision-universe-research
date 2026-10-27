# Suche in Worten – Offline-Bewertung (Audit B18)

Die spätere KI-gestützte technische Suche übersetzt einen Satz in eine geprüfte Abfrage (`technical-query.js`). Bevor ein Modell eingeschaltet wird, braucht es einen festen Maßstab. Er gilt für den regelbasierten Parser von heute und später gleichermaßen für die Modellantwort.

- **Gold-Set:** `quant/tests/fixtures/technical-query-gold.json`. Die Erwartungen sind von Hand formuliert und nicht aus der Parser-Ausgabe kopiert.
  - **80 abbildbare Sätze** mit erwarteter kanonischer Abfrage.
  - **14 nicht abbildbare Sätze** mit Grund: Ereignisse mit Zeitfenster, Zeitrahmen je Filter, Sektoren, Fundamentaldaten, fehlende Formationstypen, Kerzenmuster, Divergenzen, mehrdeutige Begriffe wie „Aufwärtstrend“ oder „nahe am Hoch“.
- **Bewertung:** `node scripts/technical/eval-query-text.mjs [--json] [--out=P]`. Gemessen werden:
  - der Anteil exakter Treffer;
  - Präzision und Vollständigkeit auf Filterebene;
  - **stille Fehlgriffe**: Ein nicht abbildbarer Satz liefert eine Abfrage, ohne Unbekanntes zu melden.
- **Test:** `quant/tests/technical-query-gold.test.mjs` verlangt 100 % exakte Treffer und 0 stille Fehlgriffe.

## Stand 26.10.2026 (`technical-query-text-1.4.0`)

| Kennzahl | Wert |
|---|---|
| exakte Treffer | 80/80 |
| Filter-Präzision / Vollständigkeit | 100 % / 100 % |
| stille Fehlgriffe | 0/14 |

Mit dem Gold-Set gefundene und behobene Lücken:
- „kleiner/größer“ ohne „als“;
- „Prozent“, „Dollar“ und „USD“ als Wort hinter einer Zahl;
- „Gap up“ und „Gap down“ mit Leerzeichen.

Bewusst **nicht** geraten werden Begriffe ohne genannte Schwelle oder mit mehreren Bedeutungen. Sie bleiben „nicht erkannt“ und stehen im Gold-Set unter `unsupported`.

## Regeln für die spätere Modellstufe

- Ein Modell bekommt dasselbe Gold-Set. Freigeschaltet wird es nur, wenn es mindestens gleich gut ist und 0 stille Fehlgriffe hat.
- Kosten: kein Aufruf ohne Owner-Freigabe (Workers-Deploy).
- Neue Felder oder Abfragearten bekommen zuerst Gold-Fälle (`expect`). Was nicht geht, kommt als `unsupported` hinein.

## Mehrzeitrahmen und Verneinung (`technical-query` 1.4.0, `query-text` 1.4.0, Audit B13)

- **Zeitrahmen je Filter:** Ein Filter kann `tf` tragen und überschreibt damit den Zeitrahmen der Abfrage. Gültig ist nur ein Zeitrahmen, für den das Feld existiert (`FIELD_NOT_AVAILABLE_FOR_TIMEFRAME`). In Worten: „Wochen-RSI über 50 und Tages-RSI unter 30“; kanonisch: `wochen-rsi14 > 50 und rsi14 < 30`.
- **Verneinte Formation:** Operator `nin` („keiner der Werte“). In Worten: „ohne Kurslücke“, „kein Doppeltop“; kanonisch: `nicht-formation:GAP_UP,GAP_DOWN`. Ein Titel ohne Formationsspalte bleibt unbekannt und wird im Trichter als fehlend gezählt; er zählt nicht als erfüllt.
- Das KI-Schema (`jsonSchema()`) bietet beides an. Der Filter-Baukasten trägt `tf` mit, damit eine geöffnete Abfrage nichts verliert.

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

## Modellstufe vorbereitet, standardmäßig aus (`technical-query-ai-1.0.0`, Completion 2.0 E / F5)

Die Query-Engine (`technical-query.js#validate/evaluate`) bleibt die **einzige ausführende Instanz**. Ein Sprachmodell darf nur einen Satz in das Abfrageformat übersetzen.

- **Modul:** `quant/engines/technical/query-ai.js` (UMD, kein Netzwerk). Der Anbieter wird als Funktion `provider(request) → Promise<Antwort>` hereingereicht.
  - Ohne `config.enabled === true` **und** ohne Anbieter gilt der regelbasierte Parser (`query-text.js`). Das ist der Normalfall heute.
- **Anfrage** (`buildRequest`):
  - Anweisung und Beispiele aus `query-text.js#contract()`;
  - Antwortschema `{ query: technical-query.jsonSchema(), unmapped: [...] }`: nur freigegebene Felder, Operatoren, Zeitrahmen und Werte;
  - Eingabe auf 300 Zeichen gekürzt, Ausgabe auf 800 Token begrenzt.
- **Prüfung jeder Antwort** (`interpret`):

  | Befund | Wirkung |
  |---|---|
  | `MALFORMED` / `INVALID` (unbekanntes Feld, Operator, Wert) | abgelehnt, **nicht ausgeführt**; Rückfall auf Regeln |
  | `ASSUMED_THRESHOLD` | Eine Zahl steht weder im Satz noch in der festen Definition eines erkannten Begriffs (z. B. „überverkauft“ = RSI 14 unter 30). Sie wird angezeigt und muss bestätigt oder geändert werden. |
  | `UNMAPPED` | Nicht abgebildete Teile, laut Modell oder Regelparser, werden angezeigt. |
  | `DIFFERS_FROM_RULES` | Der Regelparser versteht den Satz voll und kommt zu einer anderen Abfrage; beide werden gezeigt. |

  Status: `OK` (ausführbar), `REVIEW` (ausführbar, Hinweise sichtbar), `REJECTED` (nicht ausführbar).
- **Sicherer Rückfall** auf die Regeln mit Grund: `DISABLED`, `BUDGET` (Aufrufe je Sitzung, Standard 20), `TOO_LONG`, `TIMEOUT` (8 s), `PROVIDER_ERROR`, `MODEL_REJECTED`.
- **Oberfläche:** Die übersetzte Abfrage steht vor dem Ausführen in einem bearbeitbaren Feld (kanonische Schreibweise, Rundreise `parse(toText(q)) = q`). Sie wird beim Tippen geprüft und erst mit „Abfrage ausführen“ gestartet. Das gilt heute für die regelbasierte Übersetzung und später unverändert für die Modellstufe.
- **Tests:** `quant/tests/technical-query-ai.test.mjs`, nur Mock-Antworten:
  - standardmäßig aus, kein Aufruf;
  - gültige Antwort ist OK;
  - erfundenes Feld, Operator oder Formation wird abgelehnt;
  - angenommene Schwelle wird sichtbar, feste Begriffe nicht;
  - Mehrdeutigkeit und Abweichung werden gemeldet;
  - Rückfall bei kaputter Antwort, Zeitüberschreitung, Anbieterfehler, Budget und Länge;
  - Gold-Set mit Mock-Modell: 88/88 abbildbare OK, 0 nicht abbildbare still.

### Freischaltung (nicht ohne Owner-Freigabe)

Freigeschaltet wird erst, wenn alle Punkte entschieden sind:
1. **Anbieter und Modell.** Naheliegend ist der bestehende Worker `workers/vu-ask` (Anthropic, Budget-Kaskade `budget.mjs`: Gesamt-, Monats-, Tages- und Nutzergrenze, Reservierung des schlechtesten Falls, Erstattung bei Fehler, Turnstile). Er bekäme ein Technical-Werkzeug mit `responseSchema()` (Audit B19). Das ist eine Änderung am Worker, mit Deploy und Kosten.
2. **Kosten und Budget:** Monats- und Tagesgrenze für die Technical-Suche getrennt von „Frag Vision Universe“.
3. **Datenschutz:** Der Suchtext geht an den Anbieter. Das gehört in Hinweistext und Datenschutzerklärung.
4. **Qualität:** Gold-Set mit dem echten Modell, mindestens so gut wie der Parser, 0 stille Fehlgriffe (Regel oben).

Bis dahin lädt die Seite `query-ai.js` nicht (kein zusätzlicher Request). Die Oberfläche nutzt den regelbasierten Weg, der zugleich der Rückfall der Modellstufe ist.

# Technical → AI Atlas: Übergabe

Stand 31.10.2026. Owner-Entscheidung: **AI Atlas ist der zentrale KI-Assistent für ganz Vision Universe.** Technical bekommt keine eigene, zusätzliche kostenpflichtige KI-Suche, keine eigene KI-Oberfläche und keine eigene Anthropic-Anbindung.

> Die eigentliche Atlas-Anbindung wird im **separaten AI-Atlas-Projekt** umgesetzt. Dieses Dokument beschreibt nur, was Technical dafür bereitstellt und welche Regeln dabei gelten. Dieser Abschluss ändert nichts an `workers/vu-ask/` oder an anderen AI-Atlas-Komponenten.

## 1. Was AI Atlas von Technical nutzen kann

| Funktion | Quelle | Form |
|---|---|---|
| Universumsweiter technischer Screener (5.665 Titel, 83 Abfragefelder, Tag/Woche/Monat) | `quant/engines/technical/technical-query.js` + `technical/data/screener-v1.json` | UMD-Modul, spaltenbasierter Datensatz |
| 13 Strategie-Vorlagen mit Kriterien-Checkliste je Treffer (erfüllt / fast / unvollständig) | `technical/engine/templates.js` (`technical-templates-1.1.0`) | `evaluate(ds, template)`, `checklist(ds, template, ticker)` |
| Erklärung eines Chartbilds (Fakten, keine Rechnung durch die KI) | `quant/engines/technical/ti/ai-tools.js` (`ti-ai-tools-1.1.0`) | wird schon heute von `workers/vu-ask/src/catalog.mjs` importiert |
| Formationen mit Lebenszyklus (DETECTED / CONFIRMED / INVALIDATED), Tag und Woche | `formations.js` (`technical-formations-1.4.0`), `multi-timeframe.js#completedSeries` | Engine-Ausgabe und Screener-Spalten `formationActive`, `formationConfirmed` (`@1W`) |
| Satz → validierte Abfrage (regelbasiert, ohne Modell) | `quant/engines/technical/query-text.js` (`technical-query-text-1.9.0`) | `parse(text)`, `toText(query)` |
| Satz → validierte Abfrage (Modellstufe vorbereitet, aus) | `quant/engines/technical/query-ai.js` (`technical-query-ai-1.0.0`, #1182) | `buildRequest`, `interpret`, `createSearch` |

## 2. Verbindliche Engine und Schemas

- **Einzige ausführende Instanz:** `technical-query.js` (`technical-query-1.13.0`).
  - `validate(query)` → `{ ok, query, errors[] }`; Fehlercodes `UNKNOWN_FIELD`, `FIELD_NOT_AVAILABLE_FOR_TIMEFRAME`, `INVALID_OPERATOR`, `INVALID_VALUE`, `INVALID_VALUE2`, `TOO_MANY_GROUPS`, `TOO_MANY_FILTERS`, `INVALID_SORT`, `INVALID_LIMIT` …
  - `createDataset(artifact)`, `evaluate(ds, query)` → Treffer plus `funnel` (wie viele Titel nach jedem Filter übrig bleiben).
  - `jsonSchema()`: striktes Structured-Output-Schema `vu-technical-query-1` (nur freigegebene Felder, Operatoren, Zeitrahmen und Werte).
- **Abfrageformat:** `{ v:1, timeframe:"1D"|"1W"|"1M", logic:"AND"|"OR", groups:[{ op, filters:[{ field, op, value, value2?, tf? }] }], sort?, limit? }`
  - Operatoren: `gt gte lt lte between` (Zahlen), `is` (bool), `in nin` (Listen).
  - Prozentfelder als Anteil (5 % = 0,05).
- **Antwortformat der Modellstufe:** `query-ai.js#responseSchema()` = `{ query: jsonSchema(), unmapped: string[] }`.
- **Datenvertrag:** `technical-screener-contract-1.2.1` (`screener-contract.js`, [DATA_CONTRACT.md](DATA_CONTRACT.md)).
- **Dateien:**

  | Datei | Inhalt |
  |---|---|
  | `meta.json` | Stichtag, Versionen, Zählungen |
  | `screener-v1.json` | `vu-technical-screener-1.0.0`, 164 Spalten |
  | `spark-v1.json` | Mini-Kursverläufe |
  | `index-v1.json` | Vorlagen-Zähler |

## 3. Vom Satz zum validierten Filter

```
Nutzertext ──► (A) query-text.parse  ─────────────────────────────┐ regelbasiert, immer verfügbar, Rückfall
           └─► (B) Modell (Atlas) mit query-ai.buildRequest ──►  query-ai.interpret ──► technical-query.validate
                                                                       │
                       Befunde: INVALID/MALFORMED (abgelehnt) · ASSUMED_THRESHOLD · UNMAPPED · DIFFERS_FROM_RULES
                                                                       ▼
                         Nutzer sieht die kanonische Abfrage (query-text.toText), kann sie bearbeiten
                                                                       ▼
                                          technical-query.evaluate (einzige Rechnung)
```

1. Atlas schickt den Text mit `buildRequest(text)` an das Modell: Anweisung und Beispiele aus `query-text.js#contract()`, Schema aus `responseSchema()`, höchstens 300 Zeichen Eingabe und 800 Token Ausgabe.
2. `interpret(text, antwort)` prüft die Antwort:
   - **Abgelehnt** (`REJECTED`) werden unbekannte Felder, Operatoren, Formationen und Werte (`INVALID`) sowie Antworten, die keine Abfrage sind (`MALFORMED`). Sie werden nie ausgeführt; es greift der Rückfall auf die Regeln.
   - `ASSUMED_THRESHOLD`: Eine Zahl steht weder im Satz noch in der festen Definition eines erkannten Begriffs (z. B. „überverkauft“ = RSI 14 < 30). Sie muss sichtbar werden.
   - `UNMAPPED`: nicht abgebildete Satzteile, laut Modell oder laut Regelparser.
   - `DIFFERS_FROM_RULES`: Der Regelparser versteht den Satz vollständig und kommt zu einer anderen Abfrage.
3. Status `OK` (ausführbar), `REVIEW` (ausführbar, Hinweise **müssen** angezeigt werden) oder `REJECTED`.
4. Die Abfrage wird in kanonischer Schreibweise gezeigt und ist vor dem Ausführen bearbeitbar. Es gilt die Rundreise `parse(toText(q)) = q`.
5. Rückfall mit Grund: `DISABLED`, `BUDGET`, `TOO_LONG`, `TIMEOUT`, `PROVIDER_ERROR`, `MODEL_REJECTED` → `fromRules(text, grund)`.

## 4. Was zwingend erhalten bleiben muss

Jede Atlas-Antwort, die Technical-Treffer nennt, behält diese Angaben bei:

| Pflichtangabe | Spalte bzw. Quelle | Bedeutung |
|---|---|---|
| Stichtag | `meta.asOf`, Zeile `asOf`, `fresh` | Titel hinter dem Stichtag tragen „Kurs vom …“; Ereignisse sind dort `null` (unbekannt, nicht „nein“) |
| Eingefrorener Kurs | `frozenSince` | „Kurs unverändert seit …“; keine Kennzahlen, kein Treffer als Signal darstellen |
| Kurssprung-Kennzeichnung | `suspectJumpAt`, `suspectJumpFactor`, `suspectJumpStatus` | `SUSPECT` = Datenverdacht, `CONFIRMED` = belegter, nicht bereinigter Datenfehler; immer nennen, nie verschweigen |
| Volumen fehlt | `hasVolume` | Volumenfilter sind unbekannt |
| Wochenformationen | `formationActive@1W`, `formationConfirmed@1W`, `weeklyFormationBars` | nur abgeschlossene Wochen aus 270 Tagesbars; unter 26 Wochen `null` |
| Vorlagenstatus | `templates.checklist` | erfüllt / fast / unvollständig; „unvollständig“ heißt: ein Kriterium ist nicht entscheidbar |
| Evidenz | `formation-evidence.json`, `signal-evidence.json`, `docs/technical/S4_TEMPLATE_STUDY.md` | nur beschreibend; **kein nachgewiesener Handelsvorteil**; S4 ist `RESEARCH_LIMITED`, nicht als Rendite oder Trefferquote bewerben |

Dazu kommen die Hinweise aus `ti/ai-tools.js` (`RULE`, `DISCLAIMER`, `ELLIOTT_NOTE`): keine Prognose, keine Anlageberatung, keine ergänzten Zahlen.

## 5. Wiederverwendbare Module aus #1182

| Modul | wiederverwendbar | Anmerkung |
|---|---|---|
| `query-ai.js#responseSchema`, `buildRequest` | ja | Atlas schickt die Anfrage mit seinem eigenen Anbieter, Budget und Gate |
| `query-ai.js#interpret` | ja, **Pflicht** | das Prüftor jeder Modellantwort |
| `query-ai.js#fromRules`, `REASON_TEXT` | ja | Rückfall und Begründungstexte |
| `query-ai.js#createSearch` | optional | Ablaufsteuerung mit Obergrenzen; Atlas kann seine eigene Budget-Kaskade nehmen und `interpret` direkt aufrufen |
| `quant/tests/technical-query-ai.test.mjs` | ja | Mock-Tests als Vorlage für Atlas-Tests |
| Gold-Set `quant/tests/fixtures/technical-query-gold.json` | ja, **Pflicht** | 88 abbildbare und 12 nicht abbildbare Sätze |
| Oberfläche „Abfrage vor dem Ausführen bearbeitbar“ (`technical/app.js#queryEditor`) | als Muster | bleibt in Technical regelbasiert |

## 6. Schnittstellen, die für AI Atlas noch fehlen

1. **Technical-Werkzeug im Atlas-Katalog:** ein Tool `technical_screen` mit `responseSchema()`, das `interpret` aufruft und nur bei `OK`/`REVIEW` `evaluate` ausführt. Heute kennt `vu-ask` nur die 16 Felder von `screener/engine/fields.js`. (Audit B19; offen, Umsetzung im Atlas-Projekt.)
2. **Serverseitiger Datensatz-Zugriff:** Der Worker müsste `screener-v1.json` (1,1 MB gzip) laden und zwischenspeichern oder eine vorab reduzierte Spaltenauswahl bekommen. Eine solche Auswahl wäre ein neues Artefakt mit eigenem Vertrag.
3. **Vorlagen als Werkzeug:** `templates.evaluate`/`checklist` für „Welche Titel erfüllen …“.
4. **Kanonischer Link zurück in die Oberfläche:** `#/screener?q=<toText(query)>` bzw. `#/vorlagen/<id>` und `#/chart/<T>` (`model.js#chartHref`), damit der Nutzer das Ergebnis selbst prüft.
5. **Gold-Set gegen das echte Modell:** Atlas muss es bestehen, bevor das Technical-Werkzeug freigeschaltet wird (mindestens 88/88, 0 stille Fehlgriffe).

## 7. Tests und Sicherheitsbedingungen für die Integration

- **Gold-Set mit dem echten Modell:** 100 % der abbildbaren Sätze exakt, **0 stille Fehlgriffe** (nicht abbildbarer Satz ohne UNMAPPED). Messung mit `scripts/technical/eval-query-text.mjs` als Vorbild.
- **Keine Ausführung ohne `validate`:** Jede Modellantwort läuft durch `interpret`. Test: erfundenes Feld, erfundene Formation und Operator-Missbrauch werden abgelehnt (`technical-query-ai.test.mjs` Fall 3).
- **Angenommene Schwellen sichtbar:** Kein `ASSUMED_THRESHOLD` darf ohne Hinweis ausgeführt werden.
- **Qualitätskennzeichen in der Antwort:** Test, dass `suspectJumpStatus`, `frozenSince` und `fresh=false` in der Antwort genannt werden.
- **Keine Zahlen erfinden:** Antworten über Treffer nennen nur Werte aus dem Datensatz; Regel wie `ti/ai-tools.js#RULE`.
- **Kosten:**
  - Freischaltung nur mit Owner-Entscheidung zu Anbieter, Budget und Datenschutztext.
  - Obergrenzen je Nutzer, Tag und Monat und eine Reservierung des schlechtesten Falls nach dem Muster von `workers/vu-ask/src/budget.mjs`.
  - Bei Fehler und Zeitüberschreitung Rückfall auf die Regeln, nie stilles Scheitern.
- **Datenschutz:** Der Suchtext geht an den Modellanbieter. Das muss im Hinweistext und in der Datenschutzerklärung stehen.
- **Isolation:** Atlas-Tests schreiben keine Produktionsdaten (`scripts/quality/check-test-isolation.mjs`).
- **Mobil:** Eingabefelder mit 16 px, die übersetzte Abfrage sichtbar und bearbeitbar.

## 8. Was ausdrücklich nicht Teil dieser Übergabe ist

- Keine Änderung an `workers/vu-ask/` oder anderen Atlas-Komponenten.
- Keine Freischaltung, kein Anbieter und kein Deploy aus Technical heraus.
- Keine neue KI-Oberfläche in Technical. Die bestehende „Suche in Worten“ bleibt regelbasiert; die Seite lädt `query-ai.js` nicht.

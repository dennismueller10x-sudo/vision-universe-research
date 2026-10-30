# Technical – Strategie-Vorlagen: Architektur und Umsetzungsplan

**Stand:** 29.10.2026. Nur Planung, noch nichts umgesetzt.
**Owner-Auftrag:** nutzerfreundliche, vorgefertigte Vorlagen, z. B. Trendkriterien nach Minervini-Art, Dreiecksformationen und Trendfilter. Sie sollen den bestehenden Screener und die vorhandenen Daten nutzen.
**Leitplanken:**
- Keine neuen Fachmodelle und keine Strategieversprechen ohne Freigabe.
- Kein Anbieterabruf.
- Die Produktionsprüfung am 30.10. hat Vorrang.

## 1. Begriff

Eine **Vorlage** ist eine benannte, erklärte Kombination bestehender Screener-Filter.
- Sie sagt, **wonach** gesucht wird, und zeigt **je Titel, welche Kriterien erfüllt sind**.
- Sie sagt **nicht**, dass sich ein Kauf lohnt. Für die Ebenen gilt dieselbe Trennung wie bei der Evidenz (#1109):
  - Ereignis bzw. Zustand: was die Vorlage prüft;
  - historische Beobachtung: nur auf der Methodik-Seite und nur mit eigener Freigabe;
  - Handelsvorteil: wird nicht behauptet.

## 2. Was es schon gibt

| Baustein | Ort | Nutzen für Vorlagen |
|---|---|---|
| 8 Vorlagen (`PRESETS`) | `technical-query.js` | Grundgerüst vorhanden: id, Titel, Beschreibung, Abfrage, Sortierung. Startseite und Screener zeigen sie mit Trefferzahl (`index-v1.json`, `ix.presets`) |
| Abfrage-Engine | `technical-query.js#evaluate` | UND/ODER-Gruppen, Zeitrahmen je Filter (`tf`), Validierung, JSON-Schema. Liefert `funnel` (übrig nach jedem Filter), die Grundlage für die Kriterien-Checkliste |
| 73 Felder, 150 Spalten | Screener-Datensatz | alle Kriterien unten, außer den Lücken in §4 |
| Gespeicherte Strategien | `model.js#saveScreen`, Migration | „Vorlage anpassen und speichern“ ohne neues Format |
| Suche in Worten | `query-text.js` | Vorlagen können als Wortsuche-Ziel dienen (z. B. „Trendvorlage“) |
| Chart Studio | `FIELD_CHART`, E2E Zeile = Chart | jedes Kriterium ist im Chart darstellbar, gleiche Werte |
| Rule-Pack-Vertrag | `strategy-packs.js` | Regel: Eine **benannte Methode** (`origin: "NAMED_METHOD"`) braucht einen `legalReview`-Nachweis. Diese Regel gilt auch für Vorlagen |

**Trefferzahlen heute** (Stichtag 28.10., 5.659 Titel):

| Vorlage bzw. Abfrage | Treffer |
|---|---|
| Trendfolge | 525 |
| Dreiecksformationen (in Bildung) | 877 |
| Breakout | 847 |
| 52-Wochen-Hochs | 121 |
| 200-Wochen-Hochs | 165 |
| Flaggen/Wimpel | 57 |
| Volatilitätskontraktion | 91 |
| Über SMA 200 | 2.020 |

**Befund, der in jede Vorlage gehört:**
- Die Trendkombination unten mit vorhandenen Feldern trifft 852 Titel, mit „Kurs aktuell“ (`fresh`) nur 831.
- 21 Titel hinter dem Stichtag erfüllen Zustandsfelder mit ihrem letzten Kurs. Das ist nach AP1 gewollt, denn nur Ereignisfelder werden genullt.
- Vorlagen verlangen deshalb standardmäßig `fresh = true`.

## 3. Vorgeschlagene Vorlagen

### V1 „Etablierter Aufwärtstrend“ (Trendvorlage, 8 Kriterien)

Die Kriterien entsprechen der in der Literatur verbreiteten Trendvorlage, die Mark Minervini zugeschrieben wird.
- **Name und Quellenangabe** sind eine Owner- und Rechtsfrage (`strategy-packs.js`: benannte Methode nur mit `legalReview`).
- Vorschlag: neutraler Produktname und keine Namensnennung im Produkt, bis der Owner entscheidet.

| # | Kriterium | Feld heute | Lücke |
|---|---|---|---|
| 1 | Kurs über SMA 150 und SMA 200 | `aboveSma200` | SMA 150 fehlt (L1) |
| 2 | SMA 150 über SMA 200 | – | L1 |
| 3 | SMA 200 steigt seit mindestens einem Monat (21 Sitzungen) | – | L2 |
| 4 | SMA 50 über SMA 150 und SMA 200 | `sma50AboveSma200` | L1 |
| 5 | Kurs über SMA 50 | `aboveSma50` | – |
| 6 | Kurs mindestens 30 % über dem 52-Wochen-Tief | – | L3 (Wert im Feature-Store vorhanden, keine Spalte) |
| 7 | Kurs höchstens 25 % unter dem 52-Wochen-Hoch | `distHigh52w ≥ −25 %` | – |
| 8 | Relative Stärke im oberen Drittel des Universums (Rang ≥ 70) | `rs6m` (Überrendite ggü. SPY, kein Rang) | L4 |

**Ohne Fachmodell sofort möglich: V1a „Aufwärtstrend, vereinfacht (5 Kriterien)“.**
- Kriterien: 5 und 7, „Kurs über SMA 200“, „SMA 50 über SMA 200“, „RS 6 Monate > 0“, dazu `fresh`.
- Das ergibt heute 831 Treffer.
- Die Beschriftung muss sagen, dass es die vereinfachte Fassung ist.

### V2 „Dreiecksformationen“, in drei Ausprägungen

Alle Felder sind vorhanden.
- **„In Bildung“:** `formationActive` ∈ {symmetrisch, aufsteigend, absteigend} (877 Treffer).
- **„Ausbruch bestätigt“:** `formationConfirmed` ∈ dieselben Typen (525 Treffer).
  - **Befund 29.10.:** Davon sind 371 abwärts und nur 155 aufwärts ausgebrochen; ein Titel kann beides haben.
  - Eine Vorlage „Ausbruch bestätigt“ ohne Richtung würde also überwiegend Abwärtsausbrüche zeigen.
  - Die Richtung steht je Treffer in der Spalte `formations` (`UP`/`DOWN`), ist aber kein Filter.
  - Deshalb gibt es diese Ausprägung erst mit L5 (Filter nach Richtung) oder mit der Richtung sichtbar in Treffer und Checkliste.
- **„In Bildung, im Aufwärtstrend“:** zusätzlich `aboveSma200` (364 Treffer).

### V3 Trendfilter (Bausteine)

Alle Felder sind vorhanden.
- Kurzfristig: über EMA 20 und EMA 50.
- Mittelfristig: über SMA 50, SMA 50 über SMA 200.
- Langfristig auf Wochenbasis: über der 40-Wochen-Linie (`aboveSma200` mit `tf: "1W"`).
- Trendstärke: ADX > 25.

Trendfilter werden als **kombinierbare Bausteine** angeboten, die man vor eine andere Vorlage setzt. Beispiel: „Dreiecke + langfristiger Trend“.

### Bestehende Vorlagen

Breakout, 52-Wochen-Hoch, 200-Wochen-Hoch, Flaggen/Wimpel und Volatilitätskontraktion bekommen dieselbe Darstellung (Kriterien, Erklärung, Grenzen). Ihre Logik bleibt unverändert.

## 4. Notwendige Ergänzungen

### Fachmodell, eigener PR mit Vorher/Nachher, Freigabe nötig

| Lücke | Neues Feld | Rechnung | Daten |
|---|---|---|---|
| L1 | `aboveSma150`, `sma150AboveSma200`, `sma50AboveSma150` | SMA 150 auf den Tagesbars wie SMA 50/200 (`indicators.js`, TA-Lib-Referenz vorhanden) | 270 Tagesbars genügen |
| L2 | `sma200Rising21` (boolesch) und `sma200Slope21` (%) | SMA 200 heute gegen vor 21 Sitzungen | braucht 221 Bars, vorhanden; zu prüfen gegen die Vollhistorien-SMA der Materialisierung (eine Preiswahrheit) |
| L3 | `distLow52w` | `close / low52w − 1`; Wert existiert als `distanceTo52wLow` im Feature-Store | keine neue Rechnung |
| L4 | `rsRank` (Perzentil 0–100 im Universum) | Rang einer festgelegten RS-Größe über alle **aktuellen** Titel im Erzeuger | Definition ist eine Fachentscheidung: Rang von `rs6m` oder eine gewichtete 12-Monats-Größe. Vorschlag: Rang von `rs6m`, weil vorhanden und geprüft |
| L5 | `formationConfirmedUp` / `Down` | Richtung des bestätigten Ausbruchs als Filter | steht schon in der Spalte `formations` (Feld 5: `UP`/`DOWN`); nötig für V2 „Ausbruch bestätigt“ |

Alle Felder bekommen:
- Vertrag, DQ-Abdeckung (DQ-TW-2), Chart-Abbildung (`FIELD_CHART`) und eine E2E-Zeile.
- `null` für Titel hinter dem Stichtag, wo nötig.
- Die bestehenden 150 Spalten bleiben byte-gleich.

### Ohne Fachmodell (Produkt und Code, freigabepflichtig sind nur die Texte und die Auswahl)

1. **Vorlagen-Definition** (`technical-templates.js`, UMD) als Daten mit Version:
   - `{ id, version, title, summary, criteria: [{ id, label, filter, why }], sort, requires: [Felder], origin: "VU" | "NAMED_METHOD", limits }`;
   - `PRESETS` wird daraus erzeugt, alte Links `?preset=` bleiben gültig.
2. **Kriterien-Checkliste je Treffer:**
   - Jedes Kriterium wird einzeln gegen die Zeile ausgewertet (`evaluate` je Filter), etwa „7 von 8 erfüllt“.
   - Optional „fast erfüllt“, also genau ein Kriterium fehlt, mit dem Namen des fehlenden Kriteriums.
   - Dazu `funnel` als Erklärung, wo die Titel herausfallen.
3. **Darstellung** im bestehenden Screener und auf der Startseite, ohne Neugestaltung:
   - Karte mit Titel, Zweck in einem Satz, Trefferzahl;
   - Kriterienliste, aufklappbar;
   - „Anpassen“ übernimmt die Filter in den Baukasten; „Speichern“ nutzt `saveScreen`.
4. **Chart Studio:** Ein Treffer öffnet den Chart mit den Kriterien-Schichten der Vorlage, z. B. SMA 50/150/200 und das 52-Wochen-Band.
5. **Zähler** im Erzeuger (`ix.presets`) für alle Vorlagen. Das ist kein neues Artefakt, nur mehr Einträge im Index.

### Nach Freigabe, später

- **Historische Beobachtung je Vorlage** (Methodik-Seite, Verfahren wie SIGNAL_EVIDENCE.md):
  - nur beschreibend, gegen den Querschnitt, Bonferroni, Phasenstabilität;
  - eigene Freigabe.
- Ohne diese Freigabe zeigt keine Vorlage Renditen oder Trefferquoten.

## 5. Texte und Aussagen (Prüfliste für die Freigabe)

- Der Titel beschreibt den Zustand, z. B. „Etablierter Aufwärtstrend“, nicht ein Ergebnis wie „Gewinner von morgen“.
- Jede Vorlage hat den Abschnitt „Was die Vorlage nicht sagt“: kein Kaufsignal, keine Aussage über künftige Kurse, Kosten und Ausführung nicht berücksichtigt.
- Ein Kriterium wird als „erfüllt“, „nicht erfüllt“ oder „unbekannt“ (`null`) angezeigt; „unbekannt“ zählt nie als erfüllt.
- Benannte Methode: erst nach Owner- und Rechtsentscheid.
- Ein Test prüft die Sprache wie bei #1109: keine Signal-, Empfehlungs- oder Renditesprache.

## 6. Umsetzungsplan

| Paket | Inhalt | Freigabe | Abnahme |
|---|---|---|---|
| **S0** | Dieses Dokument | Owner liest, entscheidet die Fragen in §7 | – |
| **S1** | Vorlagen-Definition und Checkliste, V1a, V2, V3 und die bestehenden 8 mit Kriterien und Grenzen; nur vorhandene Felder | ja: Auswahl und Texte (keine Rechnung neu) | Test: jede Vorlage validiert, jedes Feld existiert im Zeitrahmen; Treffer = UND der Kriterien; Checkliste = Einzelauswertung; `fresh` Pflicht; Zähler = `evaluate`; Sprachtest; Budget < 100 ms für alle Vorlagen zusammen; Browser-QA 390/1280 px; alte `?preset=`-Links |
| **S2** | Fachmodell-PR L1–L5, Daten mit dem Erzeuger neu gebaut | ja: Fachmodell | Vorher/Nachher, 150 Spalten byte-gleich, TA-Lib-Referenz SMA 150, DQ-TW-2/5/7, E2E-Zeile, Füllraten |
| **S3** | V1 vollständig (8 Kriterien) auf S1 + S2 | ja: Name und Quellenangabe | wie S1, dazu Gegenprobe an 5 Titeln von Hand im Chart |
| **S4** | Historische Beobachtung je Vorlage auf der Methodik-Seite | ja: Produktaussage | wie #1109 |

Reihenfolge: S1 und S2 sind unabhängig und können parallel als PRs vorliegen. S3 braucht beide, S4 kommt zuletzt. Keines der Pakete berührt die Produktionsprüfung am 30.10. oder den Nachtlauf.

## 7. Owner-Entscheidungen (30.10.2026)

1. **S1-Umfang:** V1a, V2 (drei Ausprägungen), V3 (kombinierbare Trendfilter) und die acht bestehenden Vorlagen; keine weiteren. „Bestätigter Dreiecksausbruch“ erst, wenn die Richtung korrekt gefiltert oder eindeutig dargestellt ist. Umsetzung: Die Vorlage „Dreieck mit Ausbruch nach oben“ filtert die Richtung aus der Spalte `formations` (nur Formationen, die `formationConfirmed` meldet; Test: jedes bestätigte Dreieck hat eine Richtung, „nach oben“ nur bei bestätigtem Dreieck). Mit L5 wird das Kriterium ein Abfragefeld.
2. **V1-Name:** „Etablierter Aufwärtstrend“, ohne Namensnennung im Produkt und ohne Andeutung einer offiziellen Verbindung oder Zertifizierung (Sprachtest: kein „Minervini“, kein „IBD“).
3. **RS-Rang (L4):** Perzentilrang von `rs6m` über aktuelle, gültig auswertbare Aktien; Universum, Richtung, fehlende Werte und Rangdefinition werden im Fachmodell-PR exakt dokumentiert; keine Bezeichnung als IBD-RS.
4. **Fast erfüllt:** ja, genau ein tatsächlich nicht erfülltes Kriterium. Unbekannt (`null`) zählt weder als erfüllt noch als nicht erfüllt; Titel mit unbekannten Kriterien heißen ausdrücklich „unvollständig“. Umsetzung: „Fast erfüllt“ nur bei Vorlagen mit mindestens 3 Kriterien, sonst wäre fast jeder Titel „fast erfüllt“.

Auftrag: S1–S3 als zusammenhängendes Paket; S2 als getrennte Fachmodell-PRs zur Freigabe; S4 (historische Tests) braucht eine eigene Freigabe.

## 8. Umsetzungsstand

| Paket | Stand |
|---|---|
| S1 | umgesetzt (PR „Technical AP8 S1“): `technical/engine/templates.js`, Ansichten `#/vorlagen` und `#/vorlagen/<id>`, Kriterien-Checklisten (✓ / ✗ / ?), Trendfilter, Treffer nach „Erfüllt / Fast erfüllt / Unvollständig“, Speichern, „Im Screener anpassen“, Prüfleiste im Chart Studio (`?v=<Vorlage>`), Zählung im Index (`templates`, Schema 1.1.0) |
| S2 | L1–L5 vom Owner am 30.10. freigegeben und gemergt (#1144, #1145, #1147, #1149, #1150), je mit Neubau durch den Erzeuger; die bisherigen 150 Spalten blieben byte-gleich |
| S3 | gemergt (#1151): „Etablierter Aufwärtstrend“ mit 8 Kriterien; Stand 29.10.: 685 erfüllt, 440 fast erfüllt, 1 unvollständig; Nachrechnung 1.126/1.126 ohne Abweichung (STRATEGY_TEMPLATE_S3.md) |
| Datenqualität | DQ-TW-8 (#1155): kein vollständiger Vorlagen-Treffer auf einem Lunten-Tief (Owner-Auflage zu L3) |
| S4 | historische Prüfung, eigene Freigabe nötig |

## (Archiv) Fragen an den Owner vom 29.10.

1. **Auswahl für S1:** V1a, V2 (drei Ausprägungen), V3 als Bausteine und die 8 bestehenden Vorlagen. Kommen weitere hinzu, oder fallen welche weg?
2. **Name von V1:** neutral („Etablierter Aufwärtstrend“), mit Quellenangabe auf der Methodik-Seite, oder mit Namensnennung (Rechtsprüfung)?
3. **RS-Rang (L4):** Rang von `rs6m` (Vorschlag) oder eine eigene gewichtete 12-Monats-Größe (neues Fachmodell)?
4. **„Fast erfüllt“** (ein Kriterium fehlt) anzeigen: ja oder nein?

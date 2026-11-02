# Technical – Completion 2.0: Gesamtplan, Stand und Übergabe

Auftrag „VISION UNIVERSE – TECHNICAL COMPLETION 2.0“ (Owner, 30.10.2026). Stand dieses Dokuments: 30.10.2026, 23 Uhr UTC.

Die Completion-Matrix steht in [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md) §1, neu dazu Bereich **K**. Dieses Dokument enthält:
- Plan und Reihenfolge;
- den Stand je Teilauftrag;
- die echten Blocker;
- die Übergabe an die Frontend- und UX-Phase.

## A. Bestandsaufnahme und Plan

**Bestand am Start (main `4ef49c3`):**
- Technical ist produktiv: 5.661 Titel, 160 Spalten, 13 Vorlagen.
- Live-QA ist nachgewiesen (#1170/#1173), A1 und E3 sind ✔.
- Offen waren: Nachweis des Nachtlaufs #1168, GIBO (Option A/B), S4, Wochenchart (E4/D5), KI-Suche (F5) und weitere mobile Performance.

**Andere Sessions (30 offene PRs, keiner davon zu Technical):**

| Thema | PRs |
|---|---|
| Quant-Backtesting | #1169 Plan P0–P6, #1138 Vorschau, #1171, #1178 |
| Security Master | #1119, #1167, #1175 |
| Supertrader-Forschung | #632 … #1148 |
| Tiingo-Lizenzprüfung (Entwurf) | #1179 |

Konsequenz:
- Keine Änderung an Quant-Engines oder am Runner. S4 nutzt die vorhandenen Funktionen von außen.
- Keine Änderung am Security Master.
- Die Lizenzfrage wird aus #1179 übernommen, nicht parallel bearbeitet.

**Wiederverwendung statt Neubau:**

| Bedarf | wiederverwendet |
|---|---|
| Ausführung, Kosten, Benchmark, PIT (S4) | `quant/engines/research-studies.cjs#runEventStudy`, `inference`, `classifyRegimes`, `analyzeRegimes` |
| Mehrfachtests, Walk-Forward (S4) | `research-validation.cjs#holm`, `buildWalkForward`, `aggregateOos` |
| Population (S4) | `scripts/quant/research/research-population.cjs` (PRODUCT_DEFAULT) |
| Wochenbars (D) | `timeframe.js#aggregate` und die Regel für abgeschlossene Wochen aus `multi-timeframe.js` |
| Formationen (D) | `formations.js`, unverändert |
| KI-Suche (E) | `technical-query.js#validate/evaluate` als einzige ausführende Instanz; `query-text.js` als Rückfall |
| Kapitalmaßnahmen (B2) | `return-series.js#splitFactors`, `canonical-bars.js` (ADR-002); Muster von `split-evidence-supplements` |

**Reihenfolge und Abhängigkeiten:**

| Schritt | Inhalt | hängt ab von | Abnahme | Stand |
|---|---|---|---|---|
| 1 | B3 Option B: Kursprung-Kennzeichnung | #1177 (Register) | Verdacht und bestätigt getrennt, in Screener, Vorlage und Chart; keine Tickerregel; Vorher/Nachher | ✔ #1180 |
| 2 | B2 GIBO in der Marktdaten-Pipeline | #1177 | Bereinigung nur in der Pipeline, Schutz gegen Doppelbereinigung, Vorher/Nachher, keine Handänderung | ✔ gemergt #1181, Wirkung nach Nachtlauf |
| 3 | E KI-Suche vorbereitet | – | nur validierte Felder, Mehrdeutigkeit sichtbar, Rückfall, Kostengrenze, aus | ✔ #1182 |
| 4 | D Wochenkerzen und -formationen | – | echte OHLC, kausal, gleiche Definition in Screener und Chart, Lizenz geprüft | ✔ #1183 (kurzfristig), lange Historie zurückgehalten |
| 5 | B4 Mobile Performance | 4 (gleiche Dateien) | messbar schneller, keine Architekturänderung | ✔ #1184 |
| 6 | C S4 historische Tests | – | bestehende Engine, PIT, OOS, Holm, Phasen, Kosten, ehrliche Einstufung | ✔ gerechnet, Bericht S4_TEMPLATE_STUDY.md (PR dieses Pakets) |
| 7 | B1 Nachweis Nachtlauf und GIBO | Nachtlauf 31.10. | workflow_run, keine Doppelveröffentlichung, DQ grün, GIBO bereinigt | Kontrolltermine 31.10. 08:30 und 12:45 UTC |
| 8 | H Bericht und Übergabe | 1–7 | dieses Dokument | ✔ |

## B. Produktionsbetrieb und Datenqualität

- **B1 #1168 Nachtlauf:**
  - Gemergt am 30.10. (57a89d3).
  - Der erste reguläre Lauf ist die Nacht 30./31.10. Der Marktdaten-Refresh startet 22:30 UTC und bei GitHub erfahrungsgemäß 3–5 h später.
  - Kontrolltermine: 31.10. 08:30 UTC (workflow_run, Commit, DQ, keine Anbieterabrufe, GIBO) und 12:45 UTC (Zeitplan-Rückfall, keine doppelte Veröffentlichung).
  - **Noch nicht nachgewiesen.** So steht es auch hier, bis der Termin es belegt.
- **B2 GIBO:**
  - Konsolidierung 25:1, wirksam 29.06.2026, belegt durch SEC 6-K (Accession 0001493152-26-030060). Tiingo führt keinen Faktor (#1177).
  - Bereinigung in der Marktdaten-Pipeline (#1181) über `applyConfirmations`: Faktor 0,04 am Sprungtag 30.06.; Kurse und Ablage bleiben unverändert.
  - Schutzregeln: `PROVIDER_SPLIT_NEARBY`, `NO_RAW_JUMP`, `RESIDUAL_JUMP`, `NO_BAR_AFTER_EFFECTIVE_DATE`.
  - Vorher/Nachher (CORPORATE_ACTION_GIBO_2026.md §3a/§4):

    | | vorher | nachher |
    |---|---|---|
    | größter Tagesfaktor | 18,16 | 1,38 |
    | rs6m | 55,27 | 1,18 |
    | RS-Rang | 100 | 98,6 |
    | Vorlage „Etablierter Aufwärtstrend“ | erfüllt (Platz 1 von 685) | nicht erfüllt |

  - Wirksam ab den nächsten regulären Läufen (Materialisierung, Discover- und Wochenreihe).
- **B3 DQ-Kennzeichnung (#1180):**
  - Fenster 252 Bars: 54 → 181 Titel gekennzeichnet, 0 entfallen, 1 bestätigt (GIBO).
  - Darstellung: „Datenverdacht (Datum)“ und „Datenfehler bestätigt (Datum)“ in Trefferkarten und Vorlagen-Treffern, Hinweis im Chart Studio.
  - Gekennzeichnete Volltreffer: etablierter Aufwärtstrend 3 (GIBO, GRAL, AGIO), Trendfolge 8, Breakout 8.
  - GRAL und AGIO (×0,49, Split-Signatur) bleiben Verdacht, bis die Marktdaten-Domäne sie belegt. Es gibt keine pauschale Ausschlussregel (Option C nicht freigegeben).
- **B4 Mobile Performance (#1184):**
  - `spark` steht in der eigenen Datei `spark-v1.json`. Der Screener-Datensatz schrumpft von 1.445.921 auf 1.135.380 B gzip (−21,5 %).
  - Profil CPU ×4, 1,6 Mbit/s, lokal gemessen:
    - erste Vorlage im Nutzerpfad 4,78 → **3,00 s**;
    - kalter Direktaufruf 9,42 → **7,73 s** bis zu den Treffern;
    - Chart Studio unverändert (5,5 s).
  - Live-Messung nach dem Deploy mit `technical-live-qa.yml`.

## C. S4 – historische Tests der Vorlagen

Siehe [S4_TEMPLATE_STUDY.md](S4_TEMPLATE_STUDY.md): Architektur, Ergebnis je Vorlage und Horizont, Einstufung der statistischen Belastbarkeit, Grenzen.

**Einstufung insgesamt: `RESEARCH_LIMITED`, nicht zertifiziert, keine Renditewerbung.**
- Ergebnis (4.199 Titel, 1990–2026, Holm über 20 Tests): Die Gesamtwerte sind nach Holm meist signifikant, aber **ab 2016 (Prüfteil) liegt der Überschuss gegenüber dem SPY bei allen fünf Vorlagen bei null oder darunter**; im Walk-Forward ist der Mittelwert ≈ 0 (4–6 von 10 Faltungen positiv). Ein Vorteil zeigt sich nur in volatilen Phasen. Robusteste Vorlage: etablierter Aufwärtstrend (13 W, Prüfteil +0,10 %, Walk-Forward +0,39 %) – auch sie nicht belastbar.
- Testbar mit den vorhandenen Daten (Wochenschlüsse seit 1990) sind 5 der 13 Vorlagen als Wochen-Näherung.
- Die Formations-, Ausbruchs- und ADX-Vorlagen brauchen eine Tages-OHLC-Historie. Die liegt nur in der privaten R2-Ablage, und es gibt keine Delisting-Kohorte.

## D. Wochenkerzen und Wochenformationen

Siehe [WEEKLY_FORMATIONS.md](WEEKLY_FORMATIONS.md) (#1183):
- Wochenkerzen „1J·W“ und Wochenformationen im Screener aus abgeschlossenen Wochen, mit identischer Definition in Screener und Chart (Test).
- **Lizenz:** Kurzfristig gibt es keine neuen Daten. Die lange Wochen-OHLC (5J/Max) bleibt zurückgehalten, bis die Owner-Entscheidung zur Redistribution vorliegt. Entwurf der Prüfung: #1179, andere Session.

## E. KI-Suche

Siehe [AI_SEARCH_EVAL.md](AI_SEARCH_EVAL.md) (#1182):
- Vorbereitet, getestet mit Mock-Antworten, **standardmäßig aus**.
- Für die Freischaltung braucht es eine Owner-Entscheidung zu Anbieter (naheliegend der bestehende Worker `vu-ask` mit Budget-Kaskade), Kosten, Budget und Datenschutz.

## F. Tests und Nachweise dieses Zyklus

| Prüfung | Ergebnis |
|---|---|
| `node --test "technical/tests/*.test.mjs" "quant/tests/*.test.mjs"` (Stand #1183) | 3775/3775 |
| core + screener | 346/346 |
| Konten/Abos | nicht berührt |
| Technical browser-qa (390/360 px, hell/dunkel, Budgets) | 60/60 je PR |
| DQ-TW-1..8 | PASS |
| Isolation (`check-test-isolation.mjs`) | keine Produktionsdatei verändert, je PR |
| Datenvertrag | screen-row 1.12.0 → 1.14.0 (#1180, #1183), Vertrag 1.2.0 (#1184); je Schritt Vorher/Nachher, bestehende Spalten bytegleich |
| Live-QA nach Deploy | Live-QA 30.10. nachgewiesen (#1173); für #1180–#1184 nach dem nächsten Deploy über `technical-live-qa.yml` |

## G. Echte Blocker (Owner-Entscheidungen)

| Blocker | betrifft | Was fehlt |
|---|---|---|
| Lizenz für öffentliche Wochen-OHLC (Redistribution Tiingo) | D lange Historie (5J/Max) | Owner-Entscheidung; Prüfungsentwurf #1179 |
| Kosten und Anbieter für Modellaufrufe | E Freischaltung | Anbieter, Budget, Datenschutztext |
| Tages-OHLC-Historie und Delisting-Kohorte für Forschungsläufe | S4 für Formations-, Ausbruchs- und ADX-Vorlagen; Survivorship | Lauf mit R2-Zugriff (privat) und die V13-Delisted-Reihen; S4 als Produktaussage braucht eine eigene Freigabe (STRATEGY_TEMPLATES_PLAN.md S4) |
| GRAL, AGIO und weitere Verdachtsfälle | Datenqualität | Belege der Marktdaten-Domäne (SEC) je Fall; bis dahin Kennzeichnung „Verdacht“ |
| Zeitplan-Verspätung bei GitHub (Start 3–6 h zu spät) | Aktualität | Vorschlag im Readiness-Bericht §4 |

## H. Übergabe an die Frontend- und UX-Phase

**Daten** (Vertrag `technical-screener-contract-1.2.0`, DATA_CONTRACT.md):

| Datei | Inhalt | Ladezeitpunkt |
|---|---|---|
| `meta.json` | Stichtag, Versionen, Zählungen | zuerst |
| `index-v1.json` (60 KB) | Start und Vorlagen-Zähler | Start |
| `screener-v1.json` (1,14 MB gzip, 164 Spalten) | Filterdaten | erst bei Vorlage oder Screener; Vorladen im Leerlauf |
| `spark-v1.json` (0,33 MB gzip) | Mini-Linien | nach dem ersten Bild |
| `/quant/data/product/technical-signals-v1/by-ticker/<T>.json.gz` | Chart je Titel | Chart Studio |

**Neue Felder dieses Zyklus:**
- `suspectJumpAt`, `suspectJumpFactor`, `suspectJumpStatus`: Datenqualität. Sie sind kein Signal, müssen aber in jeder Trefferdarstellung sichtbar bleiben.
- `formationActive@1W`, `formationConfirmed@1W`, `weeklyFormationBars`.

**Regeln, die die neue Oberfläche einhalten muss:**
1. **Rechnen:** nur mit den UMD-Engines (`technical-query.js#evaluate`, `formations.js`, `multi-timeframe.js#completedSeries`). Keine zweite Logik im Frontend.
2. **Datenqualität:** Kennzeichnungen sind Pflicht. Das gilt für Verdacht und bestätigten Fehler, für „Kurs vom …“ und für „Kurs unverändert seit …“.
3. **Wochenansicht:** nur abgeschlossene Wochen. Die laufende Woche wird genannt, nicht gezeichnet.
4. **KI-Suche:**
   - Die übersetzte Abfrage ist vor dem Ausführen sichtbar und bearbeitbar.
   - Angenommene Schwellen und nicht erkannte Teile werden angezeigt.
   - Ohne Freischaltung gilt die regelbasierte Übersetzung.
5. **Evidenz und S4:** nur auf der Methodik-Seite, beschreibend, ohne Renditeversprechen. Eine Produktaussage zu S4 braucht eine eigene Freigabe.
6. **Mobil:** 16 px in Eingabefeldern (iOS-Zoom), kein horizontales Scrollen bei 360 px, Platz für spät geladene Inhalte reservieren.

**Messbare Ziele für die neue Oberfläche** (heutiger Stand im Mobilprofil):
- Vorlagenliste ≤ 1,7 s;
- erste Vorlage ≤ 3,0 s;
- Vorlagenwechsel ≤ 100 ms;
- Chart Studio ≤ 5,5 s.

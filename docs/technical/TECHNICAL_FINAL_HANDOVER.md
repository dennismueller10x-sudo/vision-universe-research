# Technical – Abschluss- und Übergabebericht

Stand 31.10.2026. Mit diesem Bericht ist die Technical-Entwicklungsphase abgeschlossen. Die AI-Atlas-Integration und die visuelle Frontend-Neugestaltung laufen in eigenen Projekten. Neue Fachmodelle, Lizenzfreigaben und Kostenaktivierungen sind gesonderte Owner-Entscheidungen.

Weitere Dokumente:
- Completion-Matrix: [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md) (Bereiche A–K)
- Plan und Stand der Completion 2.0: [TECHNICAL_COMPLETION_2_0.md](TECHNICAL_COMPLETION_2_0.md)
- KI-Übergabe: [AI_ATLAS_HANDOFF.md](AI_ATLAS_HANDOFF.md)

## 1. Produktive Funktionen (research.visionuniverse.de/technical/)

| Bereich | Umfang | Nachweis |
|---|---|---|
| Startseite und Vorlagen | 13 Strategie-Vorlagen mit Kriterien-Checkliste je Treffer (erfüllt / fast / unvollständig) | Live-QA aller 13 Vorlagen |
| Universumsweiter Screener | 5.665 Titel, 83 Abfragefelder, Tag/Woche/Monat, Gruppen und/oder, gespeicherte Strategien mit Migration | `technical-query.js`, Budget-Test (< 100 ms) |
| Suche in Worten | regelbasiert (`query-text.js`); übersetzte Abfrage vor dem Ausführen bearbeitbar | Gold-Set 88/88, 0 stille Fehlgriffe |
| Chart Studio | Tageschart mit 13 Schichten und 11 Unterfenstern, 31 Indikatoren, 24 Formationen mit Lebenszyklus, 27 Kerzenmuster; Bereich **1J·W** mit Wochenkerzen und Wochenformationen; 5J/Max als Wochenschlusslinie | Browser-QA 60/60, E2E Zeile ↔ Chart |
| Indikatoren | 92 im Katalog, alle gegen TA-Lib bzw. pandas-ta geprüft | B1/B2 |
| Datenqualität sichtbar | „Kurs vom …“, „Kurs unverändert seit …“, „ohne Volumen“, „Datenverdacht“ / „Datenfehler bestätigt“ | DQ-TW-1..8 |
| Evidenz (nur Methodik-Seite) | Formationen, Indikatoren, Kerzen beschreibend; S4-Studie als Forschungsbericht | H1–H4, S4_TEMPLATE_STUDY.md |

## 2. Gemergte PRs dieser Abschlussphase und Versionsstände

| PR | Inhalt |
|---|---|
| #1168 | technical-world per `workflow_run` nach dem Marktlauf, Zeitplan als Rückfall |
| #1177 | GIBO-Konsolidierung 25:1 belegt (SEC 6-K), Bestätigungsregister |
| #1180 | Kurssprung-Kennzeichnung Verdacht / bestätigt (screen-row 1.13.0) |
| #1181 | Bereinigung belegter Kapitalmaßnahmen in der Marktdaten-Pipeline (Status PIPELINE) |
| #1182 | KI-Suche vorbereitet, standardmäßig aus (`query-ai` 1.0.0) |
| #1183 | Wochenkerzen und Wochenformationen (screen-row 1.14.0, technical-query 1.13.0) |
| #1184 | Mini-Kursverlauf als eigene Datei (Vertrag 1.2.0), erste Vorlage mobil 4,78 → 3,00 s |
| #1185 | S4-Studie (RESEARCH_LIMITED), Completion-2.0-Plan |
| #1188 | Vertrag 1.2.1: Choppiness nach oben offen; Daten auf Stand 30.10. |

Davor (28.–30.10.): AP1–AP5, AP8 (S1–S3, L1–L5), DQ-TW-5/-8, Live-QA #1170/#1173, siehe TECHNICAL_WORLD_PROGRESS.md.

| Komponente | Version |
|---|---|
| Zeilenmodell | `technical-screen-row-1.14.0` |
| Abfrage | `technical-query-1.13.0` |
| Wortsuche | `technical-query-text-1.9.0` |
| KI-Vorbereitung | `technical-query-ai-1.0.0` (aus) |
| Datenvertrag | `technical-screener-contract-1.2.1` |
| Indikatoren | `technical-indicators-1.6.0` |
| Formationen | `technical-formations-1.4.0` |
| Mehrfach-Zeitrahmen | `technical-mtf-1.2.0` |
| Vorlagen | `technical-templates-1.1.0` |
| Kurssprünge | `technical-price-jumps-1.0.0` |
| S4-Studie | `technical-s4-template-study-1.0.0` |

## 3. Letzte CI- und Live-QA-Nachweise

| Prüfung | Ergebnis |
|---|---|
| `node --test "technical/tests/*.test.mjs" "quant/tests/technical-*.test.mjs"` (Stand #1188) | 520/520 |
| `node --test "quant/tests/*.test.mjs"` (Stand #1183) | 3.775/3.775 |
| Core | 300 Tests; 1 Fehler in DQ-SF8 (Supertrader-Datenstand), auf main identisch, nicht Technical |
| Technical browser-qa (390/360 px, hell/dunkel, Budgets) | 60/60 je PR |
| Datenvertrag / DQ | DQ-TW-1..8 PASS (5.665 Titel, Stand 30.10.); DATA_CONTRACT.md aus dem Vertrag erzeugt |
| Isolation | Tests schreiben keine Produktionsdaten (je PR) |
| Live-QA (`technical-live-qa.yml`, Zugang über bestehendes Secret, nur lesend) | grün nach jedem Pages-Deploy, zuletzt Lauf 41175504014 am 31.10. 06:10 UTC (Stand mit #1180–#1185) |
| Repo-CI der PRs | grün; Vercel rot nur wegen des Tageskontingents im kostenlosen Tarif (kein Codefehler; ausgeliefert wird über Cloudflare Pages) |

## 4. Datenqualität und Automatisierung (Stand 31.10.)

**Nachtlauf (#1168):**
- Der Marktdaten-Refresh lief erfolgreich: Kurse 03:14, Materialisierung 03:55, Lauf beendet 03:59 UTC.
- **Der `workflow_run`-Auslöser hat keinen technical-world-Lauf angelegt. Ursache offen.** Deshalb hält der tägliche Zeitplan-Rückfall Technical aktuell; er startet bei GitHub 5–6 h spät.
- Details: TECHNICAL_SCHEDULE.md, „Ergebnis der ersten Nacht“.

**Erzeuger:**
- Mit den Nachtdaten verweigerte er das Schreiben: Die Vertragsgrenze für Choppiness war falsch.
- Behoben mit #1188. Danach DQ-TW-1..8 PASS.

**GIBO (25:1, belegt durch SEC 6-K):** Die Bereinigung wirkt im regulären Lauf.

| | Wert |
|---|---|
| Materialisierung und Discover-Tagesreihe | bereinigt, größter Tagesfaktor 1,38 statt 18,16 |
| Screener | rs6m 1,58, RS-Rang 99,4, keine Kennzeichnung mehr |
| „Etablierter Aufwärtstrend“ | kein Volltreffer mehr, nur „fast“ |
| Wochenreihe | folgt mit dem nächsten Wochenlauf |
| DQ-PX-4 | meldet bis dahin die Abweichung Tag/Woche um Faktor 25 |

Nachweis: CORPORATE_ACTION_GIBO_2026.md §7.

**Kurssprung-Kennzeichnung:**
- 181 Titel gekennzeichnet, 0 bestätigt (GIBO ist bereinigt).
- **GRAL** (20.02.2026, ×0,4945, Volumen ×20,9): Volumen 50 Tage nach dem Sprung ≈ Volumen davor (Verhältnis 0,93). Ein 2:1-Split hätte es etwa verdoppelt. Wahrscheinlich eine echte Kursreaktion; ohne Beleg bleibt der Titel **Verdacht**.
- **AGIO** (19.11.2025, ×0,4911, Volumen ×30,9): Das Fenster aus 270 Tagesbars enthält kein Vorher-Volumen, ein Test ist nicht möglich. Er bleibt **Verdacht**.
- Die Kennzeichnung gilt für beide, eine Ausschlussregel gibt es nicht (Option C nicht freigegeben).
- Bekannte Grenze: Ein echter Kurssturz um etwa 50 % trägt dieselbe „Split-Signatur“ wie ein 2:1-Split. Deshalb heißt die Stufe „Verdacht“ und nicht „Fehler“.

**Weitere Datenstände:**
- Veraltete Titel: 319 (Kennzeichnung „Kurs vom …“).
- Eingefrorene Reihen: ohne Analysefelder.
- 82 Titel mit beendeter Reihe bei aktivem Stamm liegen in der Marktdaten-Domäne (A4, zurückgestellt).

## 5. Offene Lizenz- und Forschungsfragen

| Frage | Stand |
|---|---|
| Öffentliche Wochen-OHLC für 5J/Max | **zurückgehalten.** Neue öffentliche Kursreihe; Vertragstext fehlt im Repository. Die Tiingo-Prüfung (#1179) einer anderen Session ist ein Entwurf. Intern prüfbar (`completedSeries` auf der vollen Historie). |
| S4 belastbar machen | braucht Delistings (V13-Reihen, privat), historische Indexmitgliedschaft, Tages-OHLC aus R2, Gesamtrendite und eine bestätigende Registrierung mit Holdout (S4_TEMPLATE_STUDY.md §6) |
| Formations-, Ausbruchs- und ADX-Vorlagen historisch testen | nicht möglich ohne Tages-OHLC-Historie |
| Ursache `workflow_run` nicht ausgelöst | offen; Prüfung in der Workflow-Domäne |
| GRAL, AGIO und weitere Verdachtsfälle | SEC-Belege durch die Marktdaten-Domäne |

## 6. Ausdrücklich zurückgestellt

- Eigene KI-Suche in Technical (ersetzt durch AI Atlas, siehe §7).
- Wochenkerzen und Wochenformationen über 5J/Max (Lizenz).
- S4 als Produktaussage (eigene Freigabe, STRATEGY_TEMPLATES_PLAN.md S4).
- Pauschale Ausschlussregel für Datenverdacht (Option C).
- A4: beendete Reihen bei aktivem Stamm (Marktdaten-Domäne, kein zusätzlicher Anbieterabruf).
- Weitere Spezialindikatoren, seltene Muster und die übrigen 35 Kerzenmuster im Chart (P2).
- Aufteilung des Screener-Datensatzes in weitere Spaltengruppen (Vertragsänderung).

## 7. Übergabepunkte

**An AI Atlas** (Umsetzung im eigenen Atlas-Projekt; hier keine Änderung an `workers/vu-ask/`):
- Verbindliche Engine `technical-query.js` und das Schema `vu-technical-query-1`.
- Pflicht-Prüftor `query-ai.js#interpret`, Rückfall `query-text.js`.
- Pflicht-Qualitätskennzeichen (Stichtag, eingefroren, Kurssprung, ohne Volumen).
- Gold-Set als Abnahme.
- Fehlende Schnittstellen sind in AI_ATLAS_HANDOFF.md §6 beschrieben.

**An Frontend / UX:**
- Daten:

  | Datei | Größe | Ladezeitpunkt |
  |---|---|---|
  | `meta.json` | – | zuerst |
  | `index-v1.json` | 60 KB | Start |
  | `screener-v1.json` | 1,1 MB gzip, 164 Spalten | bei Vorlage oder Screener, Vorladen im Leerlauf |
  | `spark-v1.json` | 0,33 MB | nach dem ersten Bild |
  | Chartbündel je Titel | – | Chart Studio |

- Rechnen nur mit den UMD-Engines, keine zweite Logik.
- Qualitätskennzeichen sind Pflicht in jeder Trefferdarstellung.
- Wochenansicht nur mit abgeschlossenen Wochen.
- Evidenz und S4 nur beschreibend auf der Methodik-Seite.
- Mobil: 16 px in Eingabefeldern, kein horizontales Scrollen bei 360 px, Platz für spät geladene Inhalte reservieren.
- Zielwerte im Mobilprofil (heutiger Stand):
  - Vorlagenliste ≤ 1,7 s;
  - erste Vorlage ≤ 3,0 s;
  - Vorlagenwechsel ≤ 100 ms;
  - Chart Studio ≤ 5,5 s.
- Details: TECHNICAL_COMPLETION_2_0.md §H und TECHNICAL_READINESS_REPORT.md §6.

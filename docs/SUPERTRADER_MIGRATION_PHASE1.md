# Supertrader – Migration Phase 1: Wahrheit, Beschriftung, Versionskonsistenz

Stand: 5. Oktober 2026. Auftrag: „MERGE R14/R15 + MIGRATION PHASE 1“. Grundlage: R15 (`docs/SUPERTRADER_R15_CANONICAL_RECONSTRUCTION.md`).

**Phase 1 ist TRUTH + LABELING + VERSION CONSISTENCY, keine Strategieentwicklung.**
Es wurde keine Stop-, Entry-, Sizing-, Exposure- oder Ranking-Regel geändert, keine zusätzliche Fundamentaldaten-Prüfung aktiviert, keine
Turtle-Regel (Ready-Distance, Pending-Verfall) verändert, Minervini 3.0.0 nicht live geschaltet, keine neue Version erzeugt und kein historischer Backtest neu
gerechnet. Ein Test (M1-G) friert Versionen, Parameter und Portfolio-Konfiguration der Live-Engines ein; der Hash ist identisch mit dem Stand auf `main` vor Phase 1.

## 1. Merge R14/R15

| Schritt | Ergebnis |
|---|---|
| #433 (R14) | Status vor dem Merge geprüft (sauber, keine Konflikte, GitHub-Prüfungen grün); mit Merge-Commit gemergt (a3a1b9a). |
| #446 (R15) | Auf den neuen `main` gebracht (kein Konflikt, keine doppelten Commits), vollständige CI erneut gelaufen (core, gates, test, contract, marker grün), gemergt (3227035). Der rote Vercel-Status war das dokumentierte Deployment-Kontingent, kein Codefehler. |
| Nach beiden Merges | Tests auf `main`: 203/203 grün; R15-Artefakte (`R15-CANONICAL-RULES`, `R15-RULE-PROVENANCE`, `R15-FIDELITY-MATRIX`, `R15-STRATEGY-GAPS`, `R15-MIGRATION-PLAN`) und beide Berichte liegen auf `main`; Produktions-Smoke nach dem Merge grün. Keine Signale, kein Ledger verändert. |

## 2. Ehrliche Benennung: Produktklassen

| Strategie | Version | Name | Produktklasse | Replication-Anspruch |
|---|---|---|---|---|
| Momentum Breakout | 3.2.0 | VU Adaptation – Kullamägi Breakout | VU Adaptation | nein |
| Weinstein | 4.0.0 | VU Adaptation – Weinstein Stage Analysis | VU Adaptation | nein |
| Darvas | 3.0.2 | VU Adaptation – Darvas | VU Adaptation | nein |
| Minervini | 2.0.0 | VU Adaptation – Minervini | VU Adaptation | nein |
| Turtle | 2.0.2 | VU Equity Adaptation – Turtle Trading | VU Adaptation | nein |
| VU Trendfolge 52W | 1.0.0 | VU Native – Trendfolge 52W | VU Native | nein |

Keine Version erhält die Klasse REPLICATION. Die Namen stehen in `strategy_name` der Registry, im Seitentitel und in der Überschrift der Methodenseite; die
Methodenseite und die Methodenkarten zeigen zusätzlich ein Kennzeichen „VU Adaptation“ bzw. „VU Native“. Die Zeile „Originalgeber“ lautet z. B. „VU-Adaption nach
Stan Weinstein“.

## 3. Fidelity-Daten je Strategie

Jede Strategie trägt in `registry.json` (und `registry-core.json`) das Objekt `product`; die Herkunftsklassen und Produktklassen stehen als Tabellen im Registry-Kopf
(`provenanceClasses`, `productClasses`). Felder: `product_class`, `product_class_label`, `display_name`, `entry_fidelity`, `exit_fidelity`, `position_sizing_fidelity`,
`portfolio_fidelity`, `fundamental_fidelity`, `market_fidelity`, `risk_fidelity`, `replication_claim_allowed`, `hard_gate`. Quelle: `scripts/supertrader/fidelity/product-classes.mjs`
und `R15-FIDELITY-MATRIX.json`; ein Test (M1-C) prüft den Hard Gate. Die Methodenseite zeigt Produktklasse und Replikationshinweis sowie – eingeklappt – die Bereichswerte;
eine technische Verbraucherdarstellung wurde bewusst nicht gebaut.

## 4. Versionierte Methodik: Version-zu-Regel-Zuordnung

**Ursache (R15):** Die Registry führte Regeln früherer Versionen weiter (`legacy_only` war in der Oberfläche unsichtbar), zählte sie mit und leitete die Herkunft aus einem
einzigen Flag ab.

**Behoben in `scripts/supertrader/registry-p1.mjs`** (Overlay nach den Runden-Overlays):
- Jede Regel hat einen **Status**: `ACTIVE` (gilt in der laufenden Version, `active_in_version`), `LEGACY` (galt nur früher, `last_active_version`, Begründung) oder
  `NOT_IMPLEMENTED` (Regel des Traders, im Live-Code nicht umgesetzt – nur Referenz).
- Jede Strategie trägt `rule_versioning` mit `live_version`, `active_rule_ids`, `not_implemented_rule_ids` und `retired_rules` – die eindeutige Zuordnung der laufenden Version zu ihren Regeln.
- Regelkarte (Abschnitte und Randfälle) und DNA-Felder dürfen **keine** Legacy-Regel führen; die Prüfung `versionProblems()` läuft im Build (bricht ab) und im Test (M1-A).
- Zähler und Abschnittskennzeichen zählen nur aktive Regeln; Regeln früherer Versionen und nicht umgesetzte Originalregeln sind ausgenommen.
- Die Oberfläche zeigt aktive Regeln, getrennt die „Regeln des Traders, die diese Version nicht umsetzt“ und „Nicht mehr aktiv – Regeln früherer Versionen“ (mit „zuletzt gültig in v…“).
  Sie führt die Regelmengen nie mehr zusammen. Offene Positionen älterer Versionen laufen unverändert unter ihrer Regelversion weiter (`plans_by_version`).
- Die Herkunft je Regel ist ein explizites Feld (`provenance_class`, R15-Klassen; bei gemischten Regeln die strengste Klasse) statt eines abgeleiteten Flags. Technische Lebenszyklusregeln (`LC-*`)
  sind als `MECHANICS` markiert: Sie stehen in der Herkunftsliste, bestimmen aber nicht das Kennzeichen eines Abschnitts, solange er Methodenregeln enthält; die Zusammensetzung
  („Enthält: …“) bleibt sichtbar.

| Strategie | Version | aktive Regeln | nicht mehr aktiv | nicht umgesetzt |
|---|---|---|---|---|
| Kullamägi | 3.2.0 | 38 | 6 | 1 |
| Weinstein | 4.0.0 | 33 | 9 | 2 |
| Darvas | 3.0.2 | 40 | 3 | 1 |
| Minervini | 2.0.0 | 34 | 5 | 2 |
| Turtle | 2.0.2 | 33 | 4 | 3 |
| Trend52 | 1.0.0 | 13 | 0 | 0 |

**Behobene Versionierungsfehler (Auswahl):** Weinstein 4.0.0 führte WEIN-TRAIL-VU, WEIN-ST2-01, WEIN-VOL-01, WEIN-VOL-03 und WEIN-STOP-VU als gültig; Minervini zeigte MIN-LOW-01 (25 %) und
MIN-ENTRY-D1 (ohne Volumen) in der Karte statt MIN-LOW-02 (30 %) und MIN-ENTRY-D2; Darvas führte DAR-ENTRY-D1 als „Live“-Einstieg; Turtle führte DON-ENTRY-D1/DON-EXIT-01 („Tagesschluss“) als live;
Kullamägi zählte sechs Legacy-Regeln mit; `LC-MODEL-ENTRY` beschrieb nur den Einstieg zur nächsten Eröffnung, gilt aber auch für Kauf-Stop-Einstiege.

## 5. Methodenspezifische Korrekturen

- **Minervini 2.0.0:** Live verwendet keine SEPA-Fundamentallogik (weder Filter noch Anzeige). Dargestellt wird der genaue Stand: zeitpunktgenaue EPS und Umsatz vorhanden; weitere SEC-Fundamentaldaten
  vorhanden; Forschungsversion 3.0.0 nutzt Teile davon; Margen aus vorhandenen Daten ergänzbar; Analystenschätzungen, Überraschungen, institutionelle Eigentümer und ein belastbarer Branchenrang fehlen.
  Nirgends steht „bildet SEPA vollständig ab“ oder „besitzt keine Fundamentaldaten“ (Test M1-D). Das Ausbruchsvolumen 1,4× ist als Fremdregel (O’Neil-Konvention), der Ausstieg unter der 50-Tage-Linie als
  „Herkunft ungeklärt“ gekennzeichnet; der Einstand ab 3R ist Original.
- **Weinstein 4.0.0:** Es gibt keinen nachgezogenen Stop; die frühere Prozessbeschreibung ist korrigiert. Die Positionsgröße (0,5 % Risiko) ist als bisherige VU-Anpassung und Fremdregel (Kullamägi) gekennzeichnet; der
  Hauptausstieg als VU-Vereinfachung. Fehlendes Wochenvolumen gilt im Code als bestätigt – jetzt ausdrücklich als VU-Annahme beschrieben.
- **Darvas 3.0.2:** Strikt getrennt: Darvas-Original (Kauforder am Ausbruchspunkt, Stop knapp darunter, nachgezogener Stop, 5–6 Titel), TraderFox/NEO-DARVAS (Marktampel, Dreitagesbox, 100 %-seit-Tief) und VU-Adaption (1-%-Stop,
  Auswahl, 1/6-Kappe, A/B-Stufen); die 0,5 % Risiko sind eine Kullamägi-Zahl. VU Trendfolge 52W ist eigenständig („VU Native“).
- **Turtle 2.0.2:** Als VU Equity Adaptation des Futures-Systems dargestellt, nicht als Replikation. Dokumentiert: Ready-Distance 3 %, Setup-Distance 6 % und Verfall nach 10 Sitzungen sind VU-Regeln, durch die echte
  Turtle-Ausbrüche verloren gehen können; die alphabetische Signalauswahl entspricht nicht der Originalmethode (Stärke zuerst, Turtle Rules S. 29). Diese Regeln wurden **nicht** verändert.
- **Kullamägi 3.2.0:** Am nächsten am Original, trotzdem keine Replikation: nur das Breakout-Setup (als Tageschart-Variante) ist umgesetzt, Episodic Pivot und Parabolic Short fehlen, Margin fehlt, die diskretionäre
  Auswahl ist nicht reproduzierbar. Die Sperre (5 Sitzungen) ist VU-eigen; der Text „Danach keine Sperre“ war falsch und ist korrigiert.

## 6. Geprüft: alle 56 Aussagen aus R15

Je Aussage wurde Quelle → Herkunft der Regel → aktuelle Version → tatsächlicher Code geprüft. Ergebnis: **47 korrigiert**, 4 unverändert richtig, 5 im Inhalt richtig mit präzisierten Herkunftsklassen
(zusammen 56). Maschinenlesbar: `scripts/supertrader/fidelity/audit/phase1-statements.json`; ein Test (M1-H) stellt sicher, dass jede Aussage aufgelöst und hier aufgeführt ist und dass keine vorher abweichende
Aussage unkorrigiert blieb. Geänderte Dateien: `registry-p1.mjs`, `process-chain.mjs`, `fidelity.mjs`, `model-portfolio.mjs` (nur Anzeigetexte), `supertrader/assets/supertrader.js` und `.css`, `build.mjs`
(Produktdaten), `docs/SUPERTRADER_ENTRY_EXIT_RULES.md` (neu geschrieben), Hinweise in R13-, R14- und Methodentreue-Dokument.

| ID | Methode | R15-Schwere | Ergebnis | Ort | Auflösung |
|---|---|---|---|---|---|
| R15-T01 | Weinstein | HIGH | korrigiert | process-chain.mjs (Weinstein: Halten, Nachziehen des Stops, Anfangsstop, Ausstieg) | „Stop wöchentlich nachziehen“ entfernt; Halten nennt WEIN-VOL-04, das fehlende Nachziehen steht als eigener Schritt (fehlt). |
| R15-T02 | Weinstein | HIGH | korrigiert | process-chain.mjs (Weinstein: Kandidat) | Wochenvolumen ist kein Kandidatenfilter; RS und Marktfilter erst beim Kauf-Stop. |
| R15-T03 | Weinstein | MEDIUM | korrigiert | process-chain.mjs (Weinstein: Quelle, Einstieg, Halten, Ausstieg) | Klassen auf ORIGINAL_INTERPRETATION bzw. VU_FORMALIZATION; Buch nicht gelesen ausgewiesen. |
| R15-T04 | Weinstein | LOW | korrigiert | process-chain.mjs (Weinstein: Positionsgröße) | Fremdregel (Kullamägi, KK-RISK-01) benannt; keine Weinstein-Quelle. |
| R15-T05 | Weinstein | HIGH | korrigiert | registry-p1.mjs (Weinstein: Regelkarte „Halten“, Plan) | Kein nachgezogener Stop; innerer Widerspruch aufgehoben; WEIN-TRAIL-VU steht unter „nicht mehr aktiv“. |
| R15-T06 | Weinstein | MEDIUM | korrigiert | registry-p1.mjs (Weinstein: Kandidat) | 13-Wochen-RS entfernt; Fortsetzungsbasis und RS-Prüfung beim Kauf-Stop ergänzt. |
| R15-T07 | Weinstein | MEDIUM | korrigiert | registry-p1.mjs (Weinstein: Ungültig) | Ausbruch ohne Volumen macht ein Setup nicht ungültig. |
| R15-T08 | Weinstein | HIGH | korrigiert | registry-p1.mjs (WEIN-VOL-03 → LEGACY 2.0.0) | Regel gilt nicht für 4.0.0; Volumen wirkt nur nach dem Kauf (WEIN-VOL-04). |
| R15-T09 | Weinstein | MEDIUM | korrigiert | registry-p1.mjs (Version-zu-Regel-Zuordnung) | WEIN-ST2-01, WEIN-STOP-VU, WEIN-VOL-03 als LEGACY; Oberfläche trennt aktiv und nicht mehr aktiv. |
| R15-T10 | Weinstein | MEDIUM | korrigiert | registry-p1.mjs (Weinstein: DNA trailing_stop, volume_filters, market_regime, entry_trigger u. a.) | Alle DNA-Felder auf den Live-Code gebracht; Nachzieh-Stop als nicht umgesetzt. |
| R15-T11 | Weinstein | LOW | korrigiert | process-chain.mjs, registry-p1.mjs (WEIN-CONT-01) | Quelle einheitlich: Idee aus Checkliste von stageanalysis.net (Dritter), Formalisierung VU. |
| R15-T12 | Weinstein | LOW | korrigiert | docs/SUPERTRADER_AUDIT_R13.md | Fortsetzungskauf korrekt beschrieben (kein „Rücksetzer zur Ausbruchszone“). |
| R15-T13 | Weinstein | LOW | korrigiert | fidelity.mjs (Weinstein: neue Zeile Fortsetzungskauf) | Zeile ergänzt; Quelle Dritter, Zahlen VU. |
| R15-T14 | Weinstein | LOW | korrigiert | docs/SUPERTRADER_INDEPENDENT_AUDIT_R14.md | WEIN-VOL-04 als sekundär belegte Regel eingeordnet; Hauptausstieg ist die VU-Vereinfachung. |
| R15-T15 | Kullamägi | OK | Inhalt richtig, Klassen präzisiert | process-chain.mjs (Kullamägi) | Inhalt stimmte mit dem Code überein; Klassen auf R15-Taxonomie umgestellt (Kandidat VU_FORMALIZATION, Einstieg ORIGINAL_INTERPRETATION). |
| R15-T16 | Kullamägi | OK | Inhalt richtig, Klassen präzisiert | process-chain.mjs (Kullamägi: Positionsgröße) | Werte stimmten; Klasse ORIGINAL_INTERPRETATION (25 % ist das obere Ende der Spanne). |
| R15-T17 | Kullamägi | LOW | korrigiert | registry-p1.mjs (Kullamägi: Ungültig, KK-BO-COOLDOWN-00) | Sperre 5 Sitzungen nach Basistief-Bruch, Verfall und Trades benannt; nur nach Setup-Verlust ohne Trade keine Sperre. |
| R15-T18 | Kullamägi | MEDIUM | korrigiert | registry-p1.mjs (Version-zu-Regel-Zuordnung), supertrader.js | Legacy-Regeln aus Regelkarte, Zählern und aktiver Regelliste entfernt. |
| R15-T19 | Kullamägi | MEDIUM | korrigiert | registry-p1.mjs (Kullamägi: source_basis.note) | Kauf-Stop im Tagesverlauf, keine Gap-Regel. |
| R15-T20 | Kullamägi | LOW | korrigiert | registry-p1.mjs (Kullamägi: DNA entry_zone, gap_policy) | Keine Gap-Sperre seit 3.0.0. |
| R15-T21 | Kullamägi | MEDIUM | korrigiert | docs/SUPERTRADER_METHOD_FIDELITY.md | Als historischer Stand (Runde 7/8) gekennzeichnet; laufende Versionen genannt. |
| R15-T22 | Darvas | MEDIUM | korrigiert | process-chain.mjs (Darvas: Portfolioplatz, Marktampel) | Marktampel eigener Schritt, FOREIGN_RULE (TraderFox); Portfolioplatz VU_FORMALIZATION. |
| R15-T23 | Darvas | LOW | korrigiert | process-chain.mjs, model-portfolio.mjs (Darvas: Positionsgröße) | 0,5 % als Fremdregel (Kullamägi) benannt. |
| R15-T24 | Darvas | OK | unverändert richtig | process-chain.mjs (Darvas: Gewinnfilter) | Aussage „nicht umgesetzt“ bleibt unverändert richtig. |
| R15-T25 | Darvas | LOW | korrigiert | registry-p1.mjs (Darvas: Ausführung) | Marktampel (TraderFox), Höchstgewicht 1/6 und Titelzahl ergänzt. |
| R15-T26 | Darvas | MEDIUM | korrigiert | registry-p1.mjs (DAR-ENTRY-01, DNA entry_trigger/entry_zone) | Live ist DAR-ENTRY-BS (Kauf-Stop); DAR-ENTRY-D1 steht unter „nicht mehr aktiv“. |
| R15-T27 | Darvas | LOW | korrigiert | fidelity.mjs, registry-p1.mjs (Darvas: gaps) | Widerspruch aufgelöst: PIT-EPS/Umsatz liegen privat vor, sind nicht integriert. |
| R15-T28 | Darvas | LOW | korrigiert | fidelity.mjs (Darvas: Zeilen Marktampel, Portfolio-Rang, Positionsgröße) | Fehlende Herkunftszeilen ergänzt. |
| R15-T29 | Minervini | MEDIUM | korrigiert | process-chain.mjs (Minervini: Ausstieg) | Volumenbedingung genannt; Herkunft ungeklärt; Verkauf in die Stärke eigener Schritt (fehlt). |
| R15-T30 | Minervini | LOW | korrigiert | process-chain.mjs (Minervini: Halten) | Einstand ab 3R (MIN-BE-01) ergänzt, Klasse ORIGINAL. |
| R15-T31 | Minervini | OK | Inhalt richtig, Klassen präzisiert | process-chain.mjs (Minervini: Fundamentaldaten (SEPA)) | Aussage stimmte; ersetzt durch die genaue Darstellung des SEC-Datenstands (vorhanden/nicht genutzt/fehlend). |
| R15-T32 | Minervini | LOW | korrigiert | process-chain.mjs, docs/SUPERTRADER_AUDIT_R13.md, fidelity.mjs (Minervini: Positionsgröße) | 1,25 %, 25 % (original), Höchstzahl 10 und Halbierung (VU) einheitlich eingeordnet. |
| R15-T33 | Minervini | HIGH | korrigiert | registry-p1.mjs (Minervini: Kandidat, Bestätigung, plan.confirmRuleId) | 30 %-Variante (MIN-LOW-02) und MIN-ENTRY-D2 mit ≥ 1,4× Volumen. |
| R15-T34 | Minervini | MEDIUM | korrigiert | registry-p1.mjs (Minervini: Halten, Ausstieg) | Widerspruch aufgelöst; Ausstieg nicht mehr „Original“, sondern ungeklärt. |
| R15-T35 | Minervini | MEDIUM | korrigiert | registry-p1.mjs (Minervini: executable.note) | MIN-EXIT-02 (Herkunft ungeklärt) statt MIN-EXIT-VU-01. |
| R15-T36 | Minervini | MEDIUM | korrigiert | registry-p1.mjs (MIN-FUND-HYBRID) | Weder Filter noch Anzeige in Live 2.0.0; Regel als „nicht umgesetzt“ geführt. |
| R15-T37 | Minervini | MEDIUM | korrigiert | fidelity.mjs (Minervini: Fundamentaldaten, data.gaps) | Survivorship-Begründung entfernt; PIT-Daten vorhanden, nur Forschung 3.0.0. |
| R15-T38 | Minervini | LOW | korrigiert | registry-p1.mjs (Minervini: story) | Hinweis: Live-Modell nutzt SEPA nicht. |
| R15-T39 | Minervini | LOW | korrigiert | registry-p1.mjs (Minervini: DNA trailing_stop, regular_exit, position_sizing) | Auf MIN-EXIT-02, MIN-BE-01 und MIN-SIZE-01 (1,25 %) umgestellt. |
| R15-T40 | Minervini | OK | unverändert richtig | docs/SUPERTRADER_AUDIT_R13.md | Korrektur war richtig; unverändert. |
| R15-T41 | Turtle | MEDIUM | korrigiert | model-portfolio.mjs | „keine Rangregel in der Quelle“ ersetzt: Alphabet ist VU-eigen, die Quelle nennt den Stärke-Rang. |
| R15-T42 | Turtle | OK | Inhalt richtig, Klassen präzisiert | process-chain.mjs (Turtle) | Inhalt stimmte; VU-Lebenszyklus und Rang als VU-eigene Schritte ergänzt, Klassen R15. |
| R15-T43 | Turtle | MEDIUM | korrigiert | registry-p1.mjs (Version-zu-Regel-Zuordnung, Turtle) | DON-ENTRY-D1, DON-STOP-01, DON-EXIT-01 stehen unter „nicht mehr aktiv“; Live-Karte nutzt TUR-Regeln. |
| R15-T44 | Turtle | MEDIUM | korrigiert | registry-p1.mjs (Turtle: source_basis.note) | Keine Schluss-Bestätigung; Lebenszyklus, Alphabet und Portfolio als VU. |
| R15-T45 | Turtle | LOW | korrigiert | registry-p1.mjs (Turtle: DNA source_fidelity, position_sizing, scaling_in) | Unit-Größe wird simuliert; Aufstocken fehlt; Abweichungen vollständig. |
| R15-T46 | Turtle | LOW | korrigiert | registry-p1.mjs (Turtle: Kandidat) | Bis 6 % Abstand (VU), ≤ 3 % vorbereitet; 55-Tage-Hoch genannt. |
| R15-T47 | Turtle | LOW | korrigiert | docs/SUPERTRADER_METHOD_FIDELITY.md | R7-Matrix als „historisch, überholt“ gekennzeichnet. |
| R15-T48 | Trend52 | OK | Inhalt richtig, Klassen präzisiert | process-chain.mjs (Trend52) | Inhalt stimmte; TraderFox-Regeln als Fremdregel (TraderFox) statt „dokumentierte Variante“. |
| R15-T49 | Trend52 | MEDIUM | korrigiert | registry-p1.mjs (Herkunft aus Regelklassen), supertrader.js | Kennzeichen und Zähler aus R15-Klassen; TraderFox-Regeln nicht mehr „Original“. |
| R15-T50 | Trend52 | OK | unverändert richtig | process-chain.mjs, registry-r12.mjs, evidence.mjs | „TraderFox nicht reproduziert“ unverändert richtig. |
| R15-T51 | übergreifend | MEDIUM | korrigiert | supertrader.js (Startseite: Modellpositionen) | Einstiegsarten je Methode benannt; keine Behauptung „wie in den Originalquellen“. |
| R15-T52 | übergreifend | MEDIUM | korrigiert | supertrader.js (Beispiel-Teaser, Beispielseite) | Replay folgt der älteren Turtle-Version 1.1.0; Hinweis auf den Kauf-Stop der laufenden Version. |
| R15-T53 | übergreifend | HIGH | korrigiert | registry-p1.mjs, build.mjs, supertrader.js | Aktive, nicht umgesetzte und frühere Regeln getrennt; Zähler nur für aktive Regeln. |
| R15-T54 | übergreifend | HIGH | korrigiert | docs/SUPERTRADER_ENTRY_EXIT_RULES.md | Neu geschrieben für die laufenden Versionen (Kauf-Stop, Schlusskurs-Bestätigung nur Minervini). |
| R15-T55 | übergreifend | OK | korrigiert | model-portfolio.mjs (PORTFOLIO_SOURCE_TEXT), supertrader.js | Werte stimmten; Herkunft der Zahlen je Methode jetzt benannt (0,5 % = Kullamägi bei Weinstein/Darvas). |
| R15-T56 | übergreifend | OK | unverändert richtig | supertrader.js, registry*.mjs, process-chain.mjs, fidelity.mjs, evidence.mjs | Suche wiederholt (Test M1-H): nur verneinende Verwendungen. |

## 7. Tests

`scripts/supertrader/tests/phase1.test.mjs` (zusätzlich zu den 203 bestehenden):

| Test | Verhindert |
|---|---|
| M1-A, A2–A4 | **A** Alte Versionsregeln erscheinen bei der neuen Version als aktiv (inkl. synthetischer Gegenprobe und UI-Prüfung) |
| M1-B, B2–B4 | **B** Eine VU-Regel wird als Originalregel bezeichnet (Regelklassen, Abschnittskennzeichen, Prozesskette) |
| M1-C, C2, C3 | **C** REPLICATION_CLAIM_ALLOWED=true trotz LOW/UNKNOWN oder VU-eigenem Kernbereich (synthetisch: der Hard Gate schlägt an); Namen ohne „Replication“ |
| M1-D, D2 | **D** Minervini Live behauptet SEPA-Komponenten, die der Live-Code nicht nutzt; der exakte Datenstand ist dargestellt |
| M1-E | **E** Darvas erhält TraderFox-Regeln (Marktampel, Dreitagesbox, 100 %-Regel) oder VU-Zahlen (1 %) als Darvas-Original |
| M1-F, F2 | **F** Turtle Equity Adaptation wird als Original-Futures-Replikation dargestellt; VU-Lebenszyklus und Alphabet sind benannt |
| M1-G | Phase 1 verändert keine Strategie (Versionen, Parameter, Portfolio-Konfiguration eingefroren) |
| M1-H, H2 | Alle 56 Aussagen aufgelöst; Suche nach „Originalmethode“/„Replikation“/„reproduziert“ nur verneint |

Zusätzlich angepasst: `artifacts.test.mjs` (zulässige Herkunftswerte der Abschnitte), R15-R4 (reproduzierbare R15-Artefakte mit den neuen Produktnamen).

## 8. Produktions-QA

Vor dem Merge: Browser-QA (`scripts/supertrader/browser-qa.mjs`) auf 390 px und 1280 px gegen das aus dem Repository gebaute Release-Artefakt mit den neu erzeugten Registry-Daten – alle Supertrader-Routen ohne
Seiten- oder Konsolenfehler, ohne horizontalen Überlauf. Geprüft wurden Strategienamen, Versionsnummern, Methodik, Prozessketten, Tooltips (Herkunftsklassen), Kennzeichen, die Abschnitte „Was ist belegt?“ bzw. die
Regelkarten, ältere gegenüber aktuellen Versionen (Regelliste, Beispielseite). Ergebnisse: Abschnitt 9.

## 9. CI, Release, Produktions-Smoke

Wird nach dem Merge ergänzt (Abschlussnachweis).

## 10. Nicht Teil von Phase 1 (Stopp)

Keine Replication Engine, keine neuen Backtests, keine Performanceoptimierung, keine Phase 2. Der Migrationsplan (`R15-MIGRATION-PLAN.json`) bleibt unverändert; Phase 1 ist darin abgehakt.

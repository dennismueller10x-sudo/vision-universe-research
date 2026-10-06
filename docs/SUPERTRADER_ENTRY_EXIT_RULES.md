# Supertrader — Ein- und Ausstiegsregeln der laufenden Versionen

Stand: Migration Phase 1 (05.10.2026). Dieses Dokument beschreibt die **laufenden** Versionen:
Momentum Breakout 3.2.0, Weinstein 4.0.0, Darvas 3.0.2, Minervini 2.0.0, Turtle 2.0.2 und VU Trendfolge 52W 1.0.0.
Frühere Fassungen dieses Dokuments (Stand 30.09.2026, Versionen 1.1.0/1.2.0) sind überholt.

Maschinenlesbare Quelle: `rule_cards` und `rules` je Strategie in `scripts/supertrader/registry.mjs` samt Overlays
(ausgeliefert in `supertrader/data/registry.json`). Jede Regel trägt Status (aktiv / nicht mehr aktiv / nicht umgesetzt)
und eine Herkunftsklasse (`provenance_class`, Klassen aus `scripts/supertrader/fidelity/taxonomy.mjs`); die Herkunft wird nicht
mehr aus einem einzigen VU-Flag abgeleitet. Kein Modell ist backtest-validiert; nichts hier ist ein Beleg für Überlegenheit.

## Produktklassen (R15, Migration Phase 1)

| Strategie | Version | Produktklasse |
|---|---|---|
| VU Adaptation – Kullamägi Breakout | 3.2.0 | VU Adaptation |
| VU Adaptation – Weinstein Stage Analysis | 4.0.0 | VU Adaptation |
| VU Adaptation – Darvas | 3.0.2 | VU Adaptation |
| VU Adaptation – Minervini | 2.0.0 | VU Adaptation |
| VU Equity Adaptation – Turtle Trading | 2.0.2 | VU Adaptation (Aktien-Adaption des Futures-Systems) |
| VU Native – Trendfolge 52W | 1.0.0 | VU Native |

Keine laufende Version darf als **Replication** bezeichnet werden (`REPLICATION_CLAIM_ALLOWED = false`, siehe
`scripts/supertrader/fidelity/R15-FIDELITY-MATRIX.json`).

## Daten- und Zeitregel

Es liegen Tagesbalken vor (split-adjustiert); Intraday-Kurse fehlen. Zwei Einstiegsarten sind live:

| Einstiegsart | Methoden | Regel | Was passiert |
|---|---|---|---|
| Kauf-Stop im Tagesverlauf | Momentum, Weinstein, Darvas, Turtle | `LC-BUY-STOP`, `LC-MODEL-ENTRY` | Der Trigger steht seit dem Vortagesschluss fest. Steigt das Tageshoch darüber, gilt das Modell als gekauft – zum Trigger oder, bei Eröffnung darüber, zur Eröffnung, plus 10 bp Slippage. Das ist eine Tageschart-Annahme; ob der Stop am Einstiegstag hielt, zeigen Tagesbalken nicht (`LC-SAME-DAY`). |
| Schlusskurs-Bestätigung | Minervini | `LC-CONFIRM-CLOSE`, `LC-MODEL-ENTRY` | Einstieg gilt als bestätigt, wenn der Tagesschluss über dem Pivot liegt (mit ≥ 1,4× Volumen); Modelleinstieg zur Eröffnung des nächsten Handelstags, plus 10 bp Slippage. |

`LC-CONFIRM-CLOSE` ist für Momentum, Weinstein, Darvas und Turtle **nicht mehr aktiv** (galt bis Runde 7); sie stehen in der Regelliste unter
„Nicht mehr aktiv“.

| Weitere Regel | Regel-ID | Was passiert |
|---|---|---|
| Eröffnung unter Stop | `LC-OPEN-BELOW-STOP` | Kein Modelleinstieg, Setup bleibt protokolliert. |
| Stop | `LC-STOP-ORDER-ASSUMPTION` | Ruhende Stop-Order-**Annahme**: Tagestief ≤ Stop → Ausführung zum Stop, bei Eröffnung darunter zur Eröffnung. |
| Konflikt vor Einstieg | `LC-CONFLICT-01` | Invalidation und Bestätigung im selben Balken → Invalidation gewinnt. |
| Konflikt in Position | `LC-CONFLICT-02` | Stop vor Ausstiegsregel vor Warnung. Kein fixes Kursziel. |
| Fehlende Daten | `LC-DATA-GAP` | Keine Entscheidung, kein erfundener Kurs; offene Orders zur nächsten verfügbaren Eröffnung, markiert. |
| Regelversion | `LC-VERSION-RETIRED` | Wartende Setups der alten Version werden protokolliert beendet (nicht umgedeutet) und unter der neuen Version neu gesucht. Positionen laufen nur weiter, wenn die neue Version sie per `manageCompatible` übernimmt. |
| Sperre | `LC-COOLDOWN-01` | **VU-eigen, für alle Methoden:** 5 Sitzungen Sperre je Titel nach Abschluss oder Ungültigkeit (Momentum: keine Sperre nach einem Setup-Verlust ohne Trade). Keine Quelle der Methoden kennt diese Regel. |
| Eine Position je Titel | – | **VU-eigen:** kein Aufstocken, kein Pyramidisieren (Darvas, Minervini und Turtle kennen es). |

## Phasen (strikt getrennt)

| Phase | Interne Zustände | Bedeutung |
|---|---|---|
| Kandidat | DISCOVERED, WATCH | Momentaufnahme, nicht protokolliert |
| Einstieg vorbereitet | SETUP, ENTRY_READY | Trigger und Invalidation bekannt. „Nahe Trigger“ ist **kein** Einstieg. |
| Einstieg bestätigt | TRIGGERED | Nur bei Schlusskurs-Bestätigung (Minervini): Schluss über Trigger, Modelleinstieg steht zur nächsten Eröffnung aus. |
| Modellposition aktiv | ACTIVE | Einstieg erfasst (keine reale Order) |
| Warnung | WARNING | Position läuft, Warnregel ausgelöst |
| Ausstieg ausgelöst | EXIT | Ausstiegsregel ausgelöst |
| Geschlossen | CLOSED | vollständig geschlossen, Ergebnis im Ledger |
| Ungültig | INVALIDATED | Setup vor dem Modelleinstieg beendet |

## Tabelle je laufender Strategie

Herkunft: **O** Original · **L** Original mit VU-Lesart · **F** VU-Formalisierung · **E** VU-eigen · **X** Fremdregel · **?** Herkunft ungeklärt.

| Strategie (Version) | Einstieg | Anfangsstop | Ausstieg |
|---|---|---|---|
| Momentum Breakout (3.2.0) | Kauf-Stop über dem Hoch der letzten 5 Sitzungen (`KK-BO-ENTRY-ORH-D`, L; Original: Opening-Range-Hoch, nicht umgesetzt) | Tagestief des Einstiegstags, höchstens 1 ADR (`KK-BO-STOP-LOD`, `KK-BO-STOP-ADR`, O) | Nach 3 Sitzungen 1/3 verkaufen, Rest-Stop auf Einstand, sobald ein Schluss über dem Einstieg liegt (`KK-BO-SCALE-01` O, `KK-BO-BE-02` F); Rest bei Schluss unter der 10-Tage-Linie (`KK-BO-TRAIL-02`, O) |
| Weinstein Stage (4.0.0) | Kauf-Stop über dem höchsten Tageshoch der Basis (`WEIN-ENTRY-BS`, O, sekundär belegt); Markt und relative Stärke zum letzten Wochenschluss (`WEIN-MKT-01`, `WEIN-RS-02`, L); Fortsetzungsbasis in Stufe 2 (`WEIN-CONT-01`, F) | 2 % unter dem tiefsten Wochenschluss der Basis (`WEIN-STOP-01`, F) | Wochenschluss unter der 30-Wochen-Linie (`WEIN-EXIT-01`, F – VU-Vereinfachung); schwaches Ausbruchsvolumen → Verkauf beim ersten Gewinn (`WEIN-VOL-04`, L). **Kein nachgezogener Stop** (Weinstein: `WEIN-TRAIL-ORIG`, nicht umgesetzt) |
| Darvas Box (3.0.2) | Kauf-Stop über der Boxoberkante (`DAR-ENTRY-BS`, O); Box mit Dreitagesregel (`DAR-BOX-01/02`, X – TraderFox-Zuschreibung); Marktampel (`PORT-MARKET-200`, X – TraderFox) | 1 % unter der Kauforder (`DAR-STOP-03`, E – Zahl VU; Prinzip „knapp darunter“ original) | Stop mit jeder höheren bestätigten Box nachziehen (`DAR-STOP-01`, L); kein Pyramidisieren (`DAR-PYR-01`, nicht umgesetzt) |
| Minervini TT + VCP (2.0.0) | Schluss über dem Pivot bei ≥ 1,4× 50-Tage-Volumen (`MIN-ENTRY-D2`, X – O’Neil-Konvention), Kauf zur nächsten Eröffnung | Kontraktionstief, höchstens 10 % unter der Einstiegseröffnung (`MIN-STOP-01`, L) | Stop; Einstand ab 3 Anfangsrisiken Gewinn (`MIN-BE-01`, O); Schluss unter der 50-Tage-Linie mit überdurchschnittlichem Volumen (`MIN-EXIT-02`, **?** – keine Minervini-Fundstelle). Verkauf in die Stärke fehlt. **Keine SEPA-Fundamentaldaten** (weder Filter noch Anzeige) |
| Turtle Equity Adaptation (2.0.2) | Kauf-Stop über dem 20-Tage-Hoch (`TUR-ENTRY-S1-20`, O), Filter nach Gewinner-Ausbruch und 55-Tage-Failsafe (`TUR-S1-FILTER`, `TUR-FAILSAFE-55`, L). Aufnahme nur ≤ 6 % unter dem Ausbruchspunkt, Verfall nach 10 Sitzungen (`DON-NEAR-VU`, `DON-INV-02`, E) – **kann echte Ausbrüche verlieren** | 2N (`TUR-STOP-2N`, O) | 10-Tage-Tief im Tagesverlauf (`TUR-EXIT-S1-10D`, O). Kein Aufstocken, kein Short, keine Korrelationsgrenzen |
| VU Trendfolge 52W (1.0.0) | Monatsende; ≥ 100 % seit Tief, neues Hoch, Kurslücke ≥ 6 %, Marktampel (alle X – TraderFox) | kein Stop | Kein neues Hoch in 65 Handelstagen oder < 100 % seit Tief (X – TraderFox) |

Positionsgröße und Portfolio je Methode (Layer C): `scripts/supertrader/fidelity/portfolio-policy.mjs`. Dort ist je Feld die Herkunft ausgewiesen;
u. a. stammt die Zahl 0,5 % Risiko in Weinstein und Darvas aus Kullamägis Risikospanne (Fremdregel), und die Turtle-Auswahl gleichzeitiger Signale ist
alphabetisch (VU-eigen).

## Drei getrennte Aussagen je Variante

„Ausführbar“ heißt nur: jede Phase ist mechanisch definiert und läuft im Simulator. Es heißt **nicht**, dass die Regel dem Original treu ist, und
**nicht**, dass sie historisch funktioniert. Die Registry führt deshalb je Regelkarte drei getrennte Felder (`executable`, `source_basis`,
`historical_validation`).

| Variante | 1 · Technisch ausführbar | 2 · Quellenlage | 3 · Historische Validierung |
|---|---|---|---|
| Momentum Breakout | ja (Breakout-Setup; Episodic Pivot und Parabolic Short nicht umgesetzt) | Original-Prinzipien (Momentum, Stop, Teilverkauf, 10-Tage-Trailing) mit VU-Umsetzung; Quelle im Volltext gelesen | nicht validiert |
| Weinstein Stage | ja; Volumenregel nur ~1 Jahr prüfbar | Sekundärquellen, Buch nicht gelesen; Positionsgröße ist Fremdregel, Stop und Hauptausstieg sind VU | nicht validiert |
| Darvas Box | ja; Pyramiding nicht simuliert | TIME 1959/1960 im Volltext; Boxdefinition, 1-%-Stop und Qualitätsstufen VU; Marktampel und 0,5 % Risiko Fremdregeln | nicht validiert |
| Minervini TT + VCP | ja; SEPA und Verkauf in die Stärke fehlen | Trend Template belegt; VCP VU; Ausstieg bei 50-Tage-Linie ohne Fundstelle | nicht validiert |
| Turtle Equity | ja (System 1, long-only, ohne Aufstocken) | Turtle Rules im Volltext; Futures-System, hier auf Aktien adaptiert | nicht validiert |

Die historische Validierung wird im Build aus den gemessenen Datengates gesetzt, nicht von Hand; offen sind unter anderem Survivorship, historisches
Universum und Historienlänge.

## Darvas A/B

- **A-Kandidat** (vor dem Ausbruch): Regime nicht schwach, 6-Monats-Stärke Top 10 %, Box ≤ 12 %, Stop ≥ 4 % und ≥ 1 ADR. Volumen ist offen und zählt
  **nicht** gegen A.
- **A-Einstieg** (nach dem Ausbruch): zusätzlich Volumen am Bestätigungstag ≥ 1,5× des 50-Tage-Schnitts. Fehlt Volumen → **B-Einstieg**.
- **Regime-Sperre** `DAR-Q-REGIME`: Vision-Universe-Annahme (VU-eigen), **keine Darvas-Originalregel**, Quelle nur `SRC-INTERNAL-VU`, nicht
  backtest-geprüft.

## Ledger (append-only)

Jedes Signal ab „Einstieg vorbereitet“ trägt: `discovery {date, dataAsOf, ruleVersion, recordedAt, simulator}`, `levelHistory`, `transitions` (Zustand,
Datum, Datenstand, Regel, Regelversion, Materialisierungszeitpunkt, Preis und Preisbasis), nach dem Einstieg `entry`, `stopHistory`, `exits`, `result`.
Der Build prüft bei jedem Lauf (`assertAppendOnly`): kein Signal verschwindet, abgeschlossene Signale bleiben bytegleich, offene Signale dürfen ihr
Protokoll nur verlängern. Offene Positionen älterer Versionen laufen unter der Regelversion ihres Einstiegs weiter; Regeln früherer Versionen bleiben
dafür lesbar und sind in der Oberfläche als „nicht mehr aktiv“ gekennzeichnet.

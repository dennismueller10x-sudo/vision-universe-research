# Supertrader — Ein- und Ausstiegsregeln (Stand 30.09.2026, Daten bis 28.09.2026)

Maschinenlesbare Quelle: `rule_cards` je Strategie in `scripts/supertrader/registry.mjs`
(ausgeliefert in `supertrader/data/registry.json`). Die Herkunft je Abschnitt (Original / VU /
gemischt) wird aus den Regel-IDs abgeleitet und nicht von Hand behauptet. Kein Modell ist
backtest-validiert; nichts hier ist ein Beleg für Überlegenheit.

## Daten- und Zeitregel (für alle Live-Varianten)

Es liegen nur Tagesbalken vor (split-adjustiert, ~1 Jahr). Ob und zu welchem Kurs intraday über
einem Trigger gehandelt wurde, ist damit **nicht belegbar**. Deshalb:

| Schritt | Regel | Was passiert |
|---|---|---|
| Bestätigung | `LC-CONFIRM-CLOSE` | Einstieg gilt erst als bestätigt, wenn der **Tagesschluss** (Weinstein: **Wochenschluss**) über dem am Vortag bekannten Trigger liegt. Ein Hoch darüber ohne Schluss darüber ist keine Bestätigung. |
| Modelleinstieg | `LC-MODEL-ENTRY` | Zur **Eröffnung des nächsten Handelstags** + 10 bp Slippage. Nie zum idealen Triggerkurs. Keine reale Order. |
| Eröffnung unter Stop | `LC-OPEN-BELOW-STOP` | Kein Modelleinstieg, Setup bleibt protokolliert. |
| Stop | `LC-STOP-ORDER-ASSUMPTION` | Ruhende Stop-Order-**Annahme**: Tagestief ≤ Stop → Ausführung zum Stop, bei Eröffnung darunter zur Eröffnung. Je Ausstieg als Annahme gekennzeichnet. |
| Konflikt vor Einstieg | `LC-CONFLICT-01` | Invalidation und Bestätigung im selben Balken → Invalidation gewinnt. |
| Konflikt in Position | `LC-CONFLICT-02` | Stop vor Ausstiegsregel vor Warnung. Kein fixes Kursziel → keine Stop-/Ziel-Mehrdeutigkeit in einer Kerze. |
| Fehlende Daten | `LC-DATA-GAP` | Keine Entscheidung, kein erfundener Kurs; offene Orders zur nächsten verfügbaren Eröffnung, markiert. Titel ohne aktuelle Daten bleiben mit `dataStatus = NO_CURRENT_DATA` im Ledger. |
| Regelversion | `LC-VERSION-RETIRED` | Wartende Setups der alten Version werden protokolliert beendet (nicht umgedeutet) und unter der neuen Version auf demselben Datenstand neu gesucht (neue ID mit `:v<Version>`). Positionen laufen nur weiter, wenn die neue Version sie per `manageCompatible` übernimmt — sonst bricht der Build ab. |

## Phasen (strikt getrennt)

| Phase | Interne Zustände | Bedeutung |
|---|---|---|
| Kandidat | DISCOVERED, WATCH | Momentaufnahme, nicht protokolliert |
| Einstieg vorbereitet | SETUP, ENTRY_READY | Trigger und Invalidation bekannt. „Nahe Trigger“ (≤ 3 %) ist **kein** Einstieg. |
| Einstieg bestätigt | TRIGGERED | Schlusskurs über Trigger. Modelleinstieg steht zur nächsten Eröffnung aus. |
| Modellposition aktiv | ACTIVE | Einstieg zur Eröffnung erfasst (keine reale Order) |
| Warnung | WARNING | Position läuft, Warnregel ausgelöst |
| Ausstieg ausgelöst | EXIT | Ausstiegsregel ausgelöst, Ausführung zur nächsten Eröffnung |
| Geschlossen | CLOSED | vollständig geschlossen, Ergebnis im Ledger |
| Ungültig | INVALIDATED | Setup vor dem Modelleinstieg beendet |

`TRIGGERED → CLOSED` ist unzulässig: eine Bestätigung ist nie schon eine Position.

## Tabelle je aktiver Strategie

| Strategie (Version) | Einstieg bestätigt | Modelleinstieg | Invalidation (vor Einstieg) | Anfangsstop | Ausstieg | Vollständig |
|---|---|---|---|---|---|---|
| Momentum Breakout, Daily (1.1.0) | Tagesschluss > Hoch der vorherigen 5 Sitzungen (`KK-BO-ENTRY-D1`, VU) | nächste Eröffnung; > Trigger + 0,5 ADR → kein Einstieg (`KK-BO-GAP-01`, VU) | Schluss < Basistief (`KK-BO-INV-01`); 20 Sitzungen (`KK-BO-INV-02`) | Tief des Bestätigungstags, ≤ 1 ADR unter Eröffnung (`KK-BO-STOP-D1`, VU; Original `KK-BO-STOP-01`) | nach 3 Sitzungen ⅓ zur Eröffnung, Stop auf Einstand (`KK-BO-SCALE-01`, Original); Rest bei Schluss < 10-Tage-Linie (`KK-BO-TRAIL-01`, Original) | ja |
| Weinstein Stage 2, Woche (1.1.0) | Wochenschluss > Widerstand und ≥ 1,5× Wochenvolumen (`WEIN-ST2-01`, `WEIN-VOL-01`); Volumen fehlt → bestätigt, „nicht prüfbar“ (`WEIN-VOL-02`) | Eröffnung nach Wochenschluss, keine Gap-Sperre | Schluss < Basisstop (`WEIN-INV-01`); 60 Sitzungen (`WEIN-INV-02`) | 2 % unter tiefstem Wochenschluss der Basis (`WEIN-STOP-VU`) | Stop wöchentlich 2 % unter 30-Wochen-Linie (`WEIN-TRAIL-VU`); Wochenschluss < 30-Wochen-Linie (`WEIN-EXIT-01`, mehrfach belegt) | ja (Volumen nur ~1 Jahr prüfbar) |
| Darvas Box N3 (1.2.0) | Tagesschluss > Boxoberkante (`DAR-ENTRY-D1`, VU; Original `DAR-ENTRY-01` intraday) | nächste Eröffnung, keine Gap-Sperre, Gap wird ausgewiesen | Tagestief < Unterkante (`DAR-INV-01`); 30 Sitzungen (`DAR-INV-02`) | Boxunterkante (`DAR-STOP-01`) | nur nachgezogener Box-Stop (`DAR-STOP-01`) | ja (Pyramiding nicht simuliert) |
| Minervini TT + VCP (1.1.0) | Tagesschluss > Pivot (`MIN-ENTRY-D1`, VU) | nächste Eröffnung, keine Gap-Sperre | Schluss < Kontraktionstief (`MIN-INV-01`); 20 Sitzungen (`MIN-INV-02`) | Kontraktionstief, ≤ 10 % unter Eröffnung (`MIN-STOP-VU`) | Schluss < 50-Tage-Linie (`MIN-EXIT-VU-01`, **nur VU-Hilfsregel**) | **nein** — Minervinis Verkaufsregeln nicht mechanisch belegt |
| Greenblatt Magic Formula (1.0.0) | kein Kurs-Trigger: Rang EY + ROC (`GB-RANK-01`) | Rebalancing 20–30 Titel gleichgewichtet, gestaffelt (`GB-DIV-01`, `GB-POS-01`, `GB-STAGGER-01`) | — | kein Stop (Original) | nach ~1 Jahr ersetzen (`GB-EXIT-01`) | **inaktiv** bis ROC-Felder und PIT-Daten vorliegen |

## Darvas A/B (korrigiert)

- **A-Kandidat** (vor dem Ausbruch): Regime nicht schwach, 6-Monats-Stärke Top 10 %, Box ≤ 12 %,
  Stop ≥ 4 % und ≥ 1 ADR. Volumen ist offen und zählt **nicht** gegen A.
- **A-Einstieg** (nach Schluss über der Oberkante): zusätzlich Volumen am Bestätigungstag ≥ 1,5×
  des 50-Tage-Schnitts. Fehlt Volumen → **B-Einstieg**.
- **Regime-Sperre** `DAR-Q-REGIME`: Vision-Universe-Annahme (`VU_EXTENSION`), **keine
  Darvas-Originalregel**, Quelle nur `SRC-INTERNAL-VU`, nicht backtest-geprüft.
- Analyse der 157 B-Setups am 28.09.2026: **15** scheitern ausschließlich an der Regime-Sperre,
  **142** zusätzlich an weiteren Kriterien (Box zu weit: 112, Stärke unter Top 10 %: 98;
  Mehrfachnennung). Ohne Regime-Sperre gäbe es heute 15 A-Kandidaten — ein Hinweis, keine Evidenz.

## Ledger (append-only)

Jedes Signal ab „Einstieg vorbereitet“ trägt: `discovery {date, dataAsOf, ruleVersion,
recordedAt, simulator}`, `levelHistory` (jede Trigger-/Invalidation-Änderung), `transitions`
(Zustand, Datum, Datenstand, Regel, Regelversion, Materialisierungszeitpunkt, Preis und
Preisbasis), nach dem Einstieg `entry`, `stopHistory`, `exits`, `result`. Der Build prüft bei
jedem Lauf (`assertAppendOnly`): kein Signal verschwindet, abgeschlossene Signale bleiben
bytegleich, offene Signale dürfen ihr Protokoll nur verlängern.

Prüfung mit Beispielen und behobene Lücken:

1. **Ideale Trigger-Fills** (Einstieg zum Triggerkurs ohne Intraday-Beleg) → ersetzt durch
   Schluss-Bestätigung + Eröffnung.
2. **Signale ohne aktuelle Kursdaten fielen aus dem Ledger** → werden jetzt mit `dataStatus`
   übernommen.
3. **Keine Versionspolitik** → `LC-VERSION-RETIRED`; bei diesem Rollout wurden 2 Momentum-, 2
   Weinstein- und 157 Darvas-Setups der Vorversion protokolliert abgelöst und neu gesucht.
4. **Darvas-„A“ vor dem Ausbruch** war missverständlich → getrennte Phasen A-Kandidat / A-Einstieg.
5. **Regime-Sperre mit Darvas-Sekundärquelle belegt** → nur noch VU-Quelle.

## Echte Beispiele aus dem Ledger (keine erfundenen)

- **Kandidat:** `SVRN`, Momentum Breakout, 28.09.2026 — Momentum-Perzentil 100, Vorlauf erfüllt,
  aber keine enge Basis (`KK-BO-BASE-01` nicht erfüllt). Nicht protokolliert (Momentaufnahme).
- **Einstieg vorbereitet:** `MOMENTUM_BREAKOUT:FET:2026-09-28:v1.1.0` — nahe Trigger. Trigger
  85,30 (geplant, Tagesschluss darüber), Invalidation 74,26, Schluss 82,99 am 28.09.2026,
  Regelversion 1.1.0, materialisiert 2026-09-29T04:15Z.
- **Bestätigter Einstieg: keiner.** **Geschlossener Modelltrade: keiner.** Das Live-Protokoll
  läuft seit dem 28.09.2026, und seitdem liegt kein neuer Handelstag in den kanonischen Daten vor.

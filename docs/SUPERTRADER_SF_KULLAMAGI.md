# Supertrader – Kullamägi Breakout, Episodic Pivot, Parabolic Short, quellentreu (C08 / C09 / C10)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-6 (#789).

Code: `scripts/supertrader/source-faithful/methods/kullamagi.mjs`. Verträge: `contracts/kullamagi.mjs`. Tests: `tests/sf-kullamagi.test.mjs` (11).

## 1. Exakt umgesetzte HARD-Regeln (#709 W-KK3 / W-KKFAQ / W-KKEP, HIGH, geprüft)

| Regel | Umsetzung |
|---|---|
| KK-031 | ADR20 = Mittel von (Hoch/Tief − 1) × 100 über die 20 Sitzungen **vor** dem Tag |
| KK-012 (Breakout) | Stop = Tagestief; Abstand ≤ 1 × ADR, sonst **Ablehnung** (`REJECT_WIDE_STOP`). Der Stop wird nie enger gesetzt |
| KK-034 (EP) | Stop = Tagestief; Abstand höchstens 1,5 × ADR, sonst Ablehnung (eigene Familie, KK-C1) |
| KK-027 | Stop-Market: Lücke durch den Stop → Füllung zur Eröffnung |
| KK-001 | Übernacht höchstens 30 % des Eigenkapitals je Titel |

## 2. Methoden und Datenlage

| | Mechanisch | Manuell | Datenblockiert |
|---|---|---|---|
| Breakout (C08) | Tagesvariante (KK-011): Schluss über einem vom Reviewer gesetzten Level; Einstieg zum Schluss des Ausbruchstags, damit das endgültige Tagestief für KK-012 feststeht. Momentum-Perzentile 1/3/6 Monate **ordnen** die Review-Liste, ohne auszuschließen (KK-005, KK-048) | Setup-Qualität (KK-006–009, als Evidenz gemeldet), Ausbruchslevel, Teilverkauf und Nachzug (KK-013/014), Größe | Opening-Range-High-Einstieg (KK-010, optional) |
| Episodic Pivot (C09) | Gap-Evidenz (10 % als Referenz aus KK-015, kein Filter), vorherige Seitwärtsphase, Tagesvolumen, Stop-Prüfung KK-034 | Katalysator-Art (Reviewer) | Katalysator mit Zeitstempel, frühes Intraday-Volumen, ORH-Einstieg |
| Parabolic Short (C10) | Evidenz: Aufwärtsserie, Beschleunigung, Abstand zu 10/20DMA | Ziele, Teilgewinne | ORL / rote 5-Minuten-Kerze / VWAP, Tageshoch-Stop, Borrow/Locates |

Fehlende Intraday-, Katalysator- und Borrow-Daten werden **nicht simuliert**.

## 3. Behobene VU-Abweichungen (#709 VU-KK)

| VU Momentum Breakout 3.2.0 | Jetzt |
|---|---|
| Tagestief-Stop bei zu großem Abstand durch einen ADR-Clamp ersetzt | Ablehnung des Trades; der Stop bleibt das Tagestief (Test GC-KK-STOP-NO-CLAMP) |
| finales Tagestief für einen früheren Intraday-Einstieg | Tagesvariante mit Einstieg zum Schluss; Intraday ist `DATA_BLOCKED` |
| EP und Parabolic Short fehlten | eigene Verträge mit isolierten Komponenten |
| sechsfacher AND-Filter | Momentum nur als Reihenfolge; Prioritäten nach KK-048 als Review-Frage |

## 4. Status (abgeleitet)

| Methode | Status | Ausführung | Backtest |
|---|---|---|---|
| Breakout | `PARTIAL_MANUAL_REVIEW` | `MANUAL_REVIEW_SCREEN` | `NOT_READY` |
| Episodic Pivot | `PARTIAL_DATA_BLOCKED` | `COMPONENTS_ONLY_DATA_BLOCKED` | `NOT_READY` |
| Parabolic Short | `PARTIAL_DATA_BLOCKED` | `COMPONENTS_ONLY_DATA_BLOCKED` | `NOT_READY` |

Evidenzfenster (21/42/63/126/50 Sitzungen, 10-Sitzungen-Hälften) sind deklarierte Konventionen der Evidenz und nie Gates.

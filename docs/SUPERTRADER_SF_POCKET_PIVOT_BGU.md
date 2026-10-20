# Supertrader – Pocket Pivot und Buyable Gap-Up, quellentreu (C11 / C12)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-4 (#787).

Code: `scripts/supertrader/source-faithful/methods/morales-kacher.mjs`. Vertrag: `contracts/morales-kacher.mjs`. Tests: `tests/sf-morales-kacher.test.mjs` (13).

## 1. Mechanische Komponenten (#709, WEB_PRIMARY, HIGH, Originalwortlaut geprüft)

| Regel | Umsetzung | Status |
|---|---|---|
| MOKAPP-003 | Volumen des Kandidatentags **größer** als das höchste Down-Day-Volumen der 10 Vortage | SOURCE_EXACT |
| Down-Day / Up-Day | Schluss unter bzw. über dem Vortagesschluss; ohne Down-Day im Fenster kein Kandidat | SOURCE_DERIVED |
| MOKA12-004 | Gap = Eröffnung − Vortagesschluss ≥ 0,75 × ATR40 (einfaches Mittel der 40 Sitzungen **vor** dem Gap-Tag) | SOURCE_EXACT (Gap-Maß abgeleitet) |
| MOKA24-VOL | 150 % **des** Durchschnitts = Verhältnis ≥ 1,5 | SOURCE_EXACT |
| Mittelungsfenster des Volumens | #709 nennt es nicht; gezeigt wird das 50-Sitzungen-Verhältnis | SOURCE_AMBIGUOUS |
| MOKA24-MEGA | unter 1,5× kein Ausschluss, sondern `VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW` (MCD +47,09 %) | MANUAL_REVIEW_REQUIRED |
| MOKA12-007 | Gap-Tagestief als Risikoreferenz | MANUAL (Evidenz) |
| MOKA12-009 / MOKASTOP-002 | MA-Verletzung: Schluss unter MA, dann Unterschreitung des Tagestiefs am nächsten Tag (2012) bzw. an späteren Tagen (FAQ) – beide Lesarten gemeldet | SOURCE_AMBIGUOUS (MOKA-C2) |

Die Formulierung von 2012 (1,5× vs. 150 % über dem Durchschnitt, MOKA12-005, UNKNOWN/LOW) wird nicht verwendet (MOKA-C1).

## 2. Manuelle Ebene

Basis, Thema bzw. Fundamentals, Abstand zur 10DMA bzw. kritischen MA, V-Form, Wedging, Extension (MOKAPP-001/002/004/006–010), Megacap-Ausnahme, Exits und Größe entscheidet der Reviewer. Die Maschine meldet die Abstände zu 10/50/200DMA als Evidenz, nie als Ausschluss.

Ein bestandener Screen ist **keine Kaufentscheidung**: Status `MANUAL_REVIEW_REQUIRED`, `buyDeclarationAllowed=false`.

## 3. Status (abgeleitet)

Beide `PARTIAL_MANUAL_REVIEW`; Ausführung `MANUAL_REVIEW_SCREEN`; Backtest `NOT_READY`. Es gibt keine mechanische Exit-Regel, und feste Haltedauern wären erfunden; deshalb auch keine Komponentenstudie mit Renditen. Data Readiness: Pocket Pivot READY, BGU PARTIAL (PIT-Marktkapitalisierung, Intraday-Volumenprojektion).

## 4. Herkunft

Logik übernommen aus den V4.1-Komponenten von Draft-PR #712 (@ `26e6caf`), unverändert bis auf Regel-IDs, das als `SOURCE_AMBIGUOUS` deklarierte Volumenfenster und die MA-Verletzungs-Evidenz.

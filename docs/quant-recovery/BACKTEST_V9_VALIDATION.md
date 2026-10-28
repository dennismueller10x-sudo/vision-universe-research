# V9 – Validierung

## Trennung der Evidenzarten

| Art | V9 |
|---|---|
| Technische Rechenparität | Python-Referenzen je Strang (siehe unten) |
| Originalquellenparität | 283/283 8-K-Header, 56/56 API-Acceptance, 1.105/1.105 XBRL-Werte, 60/60 Dateihashes, 823 Identitätsquellhashes, Dividenden-Acceptance gegen SGML |
| Retrospektive Entwicklungsstudie | Sensitivität P1/P2, 8-K 1.0.0, Ledger L1–L3 |
| Robuste Sensitivitätsprüfung | Blocklängen 39–104, drei Bootstrap-Varianten, Newey–West, 8-K 1.1.0 (post-hoc, sekundär) |
| Unberührte Bestätigung | nur registriert: 8-K prospektiv, auswertbar ab 2027-04-29 |
| Produktzertifizierung | keine |

## Unabhängige Nachrechnungen (andere Implementierung, gleiche Daten)

| Strang | Prüfungen | Ergebnis |
|---|---|---|
| Sensitivität | 1.420.112 | PASS, max. rel. Abweichung 2e-11 |
| Event-Driven | 732.449 je Version | PASS, 0 Fehler |
| Portfolio | 22 Läufe | PASS, max. 8,7e-15 |
| Identität | 180/180 + 7/7 Entscheidungen, 823 Hashes, 116 Qualifikationen | PASS |
| Corporate Actions | 1.391 Ereignisse, 81 Qualifikationen | PASS (gleicher Autor, gleiche Regel) |
| SEC/PIT | FY-Zählungen, 904 Klassen, 1.105 Werte, 79 Urteile, 793 Paare | PASS |

## Tests und Isolation

- `node --test quant/tests/v9-*.test.mjs`: 10/10 bestanden.
- `node scripts/quality/check-test-isolation.mjs`: keine Produktionsdatei verändert.
- Diff gegen Main: keine Änderung unter `quant/engines`, `quant/data`, `discover/data`, `supertrader/data`, `social/data`, `technical/data`, `.github`.
- Weil V9 keine bestehende Engine und keinen bestehenden Test ändert, bleiben die vollständigen hashgebundenen V8-Regressionen gültig; die Remote-Quant-CI des PR prüft den integrierten Stand erneut.

## Ressourcen

4 CPU-Kerne, 15 GiB RAM, kein OOM. SEC: ca. 4.300 (Events), 2.900 (Portfolio), 2.700 (CA), Identität und ca. 430 Einzel- plus 2 Bulk-Abrufe (SEC/PIT, zusammen ≈ 3 GB privat) bei ≤ 2 Anfragen/s je Strang. Längster Einzellauf: Sensitivität ≈ 13 min. Keine kostenpflichtigen Abrufe.

## Grenzen

Rechenparität und Quellenparität ersetzen keinen unangetasteten Holdout. Mehrere Stränge haben Regeln nach Sicht auf Zwischenergebnisse verschärft oder Extraktionsfehler korrigiert; das ist in den jeweiligen Belegen offengelegt und der Grund, warum die Registry-Vorschläge nicht aktiviert wurden.

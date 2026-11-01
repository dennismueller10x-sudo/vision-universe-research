# Interne Backtest-Vorschau: erstmalige Aktivierung (Stand 01.11.2026)

Ziel ist die interne praktische Abnahme durch genau ein ausdrücklich berechtigtes Testkonto.
- Keine öffentliche Freischaltung.
- Keine Änderung an Quant-Produktgates.
- Keine Zertifizierung.

**Die Aktivierung braucht die abschließende Owner-Freigabe.** Dieser PR ist der Schalter und wird erst danach gemergt.

## 1. Voraussetzungen (alle erfüllt, bevor der Schalter umgelegt wird)

| Nr. | Voraussetzung | Prüfung |
|---|---|---|
| V1 | Backend #1215 auf `main`, Worker ausgerollt | Lauf „Konten — Produktion automatisch“ grün; `GET https://konto.visionuniverse.de/v1/admin/backtests` → 404 `PREVIEW_NOT_ACTIVATED` (geprüft am 01.11.) |
| V2 | Bundle aktuell (#1223) | `node scripts/quant/research/export-backtest-review-bundle.cjs --check` → `ok` |
| V3 | Seite #1216 auf `main` und über Pages ausgeliefert | `https://research.visionuniverse.de/konto/admin/backtests/` → 200, `noindex`, von keiner öffentlichen Seite verlinkt (Test in `konto/tests/backtest-review.test.mjs`) |
| V4 | Paket nicht öffentlich | `https://research.visionuniverse.de/workers/vu-account/data/backtest-review-bundle.json` → 404 (Release schließt `workers/*/data/` aus, #1215) |
| V5 | Rolle nur für das Testkonto | siehe 2; keine pauschale Vergabe |

## 2. Rolle für genau ein Testkonto

- **Was der Owner nennt:** die E-Mail-Adresse des berechtigten Testkontos. Das Konto muss bestätigt sein.
- **Wer vergibt:** der Owner, über den Datenbankzugang des Betriebs. Es gibt dafür keinen Workflow und keine Selbstvergabe, weil `user_roles` für Konten nur lesbar ist (SQL-Test `12_backtest_reviewer.sql`).

```sql
insert into public.user_roles (user_id, role)
select id, 'backtest_reviewer' from auth.users where lower(email) = lower('<E-Mail des Testkontos>')
on conflict do nothing;
-- Kontrolle: genau eine Zeile
select u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'backtest_reviewer';
```

## 3. Schalter

Mit diesem PR gilt in `workers/vu-account/wrangler.toml`, Abschnitt `[env.production.vars]`: `VU_BACKTEST_REVIEW_ENABLED = "true"`.
- Die Entwicklungs-Vorgabe `[vars]` bleibt `"false"`.
- Nach dem Merge rollt „Konten — Produktion automatisch“ den Worker aus. Der Schalter ist nicht zahlungsrelevant, deshalb gibt es keinen weiteren Freigabejob.

## 4. Zugriffskontrollen nach dem Ausrollen (prüfbar)

| Prüfung | Erwartung |
|---|---|
| `curl -i https://konto.visionuniverse.de/v1/admin/backtests` (ohne Sitzung) | **401** (statt bisher 404 `PREVIEW_NOT_ACTIVATED`): Schalter ein, Sitzung verlangt |
| Anmeldung mit einem Konto **ohne** Rolle, Seite öffnen | Meldung „keine Berechtigung“, keine Daten (403 `NOT_BACKTEST_REVIEWER`) |
| Anmeldung mit dem **Testkonto**, `https://research.visionuniverse.de/konto/admin/backtests/` | Übersicht der sechs Arten, Einordnung, Grenzen, „nicht zertifiziert“ |
| vorgerechnete Auswahl (z. B. Replay NVDA) | Ergebnis mit Kennzahlen, Benchmark, Kosten, Drawdown, Datenqualität, Population, Nachweisart |
| nicht vorgerechnete Auswahl | „nicht vorgerechnet“ (`NOT_PRECOMPUTED`), keine Rechnung |
| `POST /v1/admin/backtests/lookup` ohne CSRF-Kopf | 403 |
| öffentliche Navigation, Startseite, Quant | kein Link auf `/konto/admin/backtests/` |
| `…/workers/vu-account/data/backtest-review-bundle.json` | 404 |

## 5. Abschalten (jederzeit)

1. **Sofort, ohne Ausrollen:** die Rolle entziehen.
   ```sql
   delete from public.user_roles where role = 'backtest_reviewer';
   ```
   Danach antwortet der Worker allen Konten mit 403.
2. **Vollständig:** einen PR, der `VU_BACKTEST_REVIEW_ENABLED` in `[env.production.vars]` auf `"false"` setzt.
   - Nach dem Merge rollt die Automatik den Worker aus.
   - Danach antworten alle Routen mit 404 `PREVIEW_NOT_ACTIVATED`.

## 6. Grenzen

- Die Seite zeigt ausschließlich vorgerechnete, hashgebundene Katalogeinträge (Katalog-Generation 1, Security-Master-Generation 1.1.0).
- Alle Ergebnisse sind `NOT_CERTIFIED` und `productionApproved=false`.
- Nach einer Umstellung des Security Masters werden Katalog und Bundle als neue Generation neu gebaut. Bis dahin bricht der Export ab.

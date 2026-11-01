# Interne Backtest-Vorschau: erstmalige Aktivierung (Stand 01.11.2026)

Ziel ist die interne praktische Abnahme durch genau ein ausdrücklich berechtigtes Testkonto.
- Keine öffentliche Freischaltung.
- Keine Änderung an Quant-Produktgates.
- Keine Zertifizierung.

**Die Aktivierung braucht die abschließende Owner-Freigabe.** Dieser PR ist der Schalter und wird erst danach gemergt.

## 1. Voraussetzungen (alle erfüllt, bevor der Schalter umgelegt wird)

| Nr. | Voraussetzung | Prüfung |
|---|---|---|
| V1 | Backend #1215 auf `main`, Worker ausgerollt | **erfüllt** (01.11.): Konten-Automatik grün. Live: `GET https://konto.visionuniverse.de/v1/admin/backtests` → 404 `PREVIEW_NOT_ACTIVATED`, auch mit gefälschtem Token; POST mit fremder Herkunft → 403; PUT/DELETE → 405; alle `no-store` |
| V2 | Bundle aktuell (#1223) | **erfüllt**: `export-backtest-review-bundle.cjs --check` → `ok`, `bundleHash` `aefb5942…` |
| V3 | Seite #1216 auf `main` und ausgeliefert | **erfüllt**: `https://research.visionuniverse.de/konto/admin/backtests/` → 200, `noindex,nofollow`; Startseite, `/quant/` und `/konto/` enthalten keinen Link |
| V4 | Paket nicht öffentlich | **erfüllt** (live): `…/workers/vu-account/data/backtest-review-bundle.json` → 404, während `…/workers/vu-account/src/backtests.mjs` aus demselben Release 200 liefert |
| V5 | Rolle nur für das Testkonto | offen: der Owner nennt das Konto (Abschnitt 2) |
| V6 | Abnahmeprotokoll | **erfüllt**: `node scripts/account/backtest-review-acceptance.mjs` → 61 Prüfungen, 0 Fehler (Abschnitt 7) |

## 2. Rolle für genau ein Testkonto

**Benötigt wird ein einziges Konto in der Produktion (`konto.visionuniverse.de`):**
- registriert über `https://research.visionuniverse.de/konto/registrieren/`, E-Mail bestätigt (Free genügt, kein Abo);
- mit einer E-Mail-Adresse, die ausschließlich der Owner nutzt;
- empfohlen ist ein **eigenes Prüfkonto, nicht das Konto mit `pricing_admin`**: So sind die Rechte getrennt, und ein Entzug trifft nur die Vorschau.

**Vergabe:** durch den Owner über den Datenbankzugang des Betriebs. Es gibt keinen Workflow und keine Selbstvergabe, weil `user_roles` für Konten nur lesbar ist (SQL-Test `12_backtest_reviewer.sql`).

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

## 7. Praxistest: was die Vorschau heute kann und was geprüft ist

Das Abnahmeprotokoll `scripts/account/backtest-review-acceptance.mjs` spielt die echte Worker-Logik durch: ohne Netz, Supabase simuliert, Test `scripts/account/tests/backtest-review-acceptance.test.mjs`. Es läuft grün auf `main` und auf dem simulierten Folgestand 1.3.0.

| Bereich | Geprüft |
|---|---|
| Schalter aus | 404 `PREVIEW_NOT_ACTIVATED`, keine Daten, keine Rollenabfrage |
| Sitzung und Rolle | ohne Sitzung 401; ohne Rolle 403; `pricing_admin` und `billing_tester` 403; mit `backtest_reviewer` 200, `no-store` |
| sechs Arten | Replay, Pattern, Signal, Setup, Strategie, Faktor: alle im Menü und alle mit mindestens einer vorgerechneten Auswahl |
| 21 vorgerechnete Auswahlen | jede per GET und POST identisch; Zustand **20 A + 1 B** (Strategie-Profil, Eingaben fehlen); Nachweisart je Eintrag; nie zertifiziert |
| gültig, aber nicht vorgerechnet | je Art mindestens eine Variante (z. B. Kosten „ohne“) → `NOT_PRECOMPUTED`, „nicht vorgerechnet“, keine Rechnung |
| ungültige Kombinationen | 9 Fälle mit ihrem sicheren Code: `UNKNOWN_TEMPLATE`, `SELECTION_SCHEMA_UNKNOWN`, `COST_PRESET_UNKNOWN`, `RULES_ONLY_FOR_SIGNAL`, `FACTOR_ONLY_FOR_FACTOR_KIND`, `WINDOW_INVALID` (2×), `SELECTION_UNKNOWN_KEY`, `METHODS_OPTION_UNKNOWN` |
| Generation und Hash | Paket `NOT_CERTIFIED`, `productionApproved=false`, `publiclyActivated=false`; Security-Master-Generation `us-security-master-1.1.0` = Register (`26c82617…`); Katalog-Generation 1 `7ea6383e…` |
| Browser | Account-Browser-QA (Chromium und WebKit/iPhone, mobil hell/dunkel): ohne Rolle gesperrt, mit Rolle Übersicht, Grenzen, „nicht zertifiziert“, vorgerechnete Auswahl |

**Was der Owner im Praxistest selbst sieht** (nach den Schritten in 8):
- Übersicht der sechs Arten mit Zustand und Zertifizierungsstand;
- je vorgerechneter Auswahl Rendite, Risiko, Drawdown, Kosten, Benchmark, Datenqualität, Abdeckung, historische Population, Nachweisart und Grenzen;
- bei jeder anderen Kombination „nicht vorgerechnet“.

## 8. Einmalige Schritte zur internen Freischaltung

1. **Owner:** Testkonto nennen (bestätigte E-Mail, siehe 2).
2. **Owner, SQL:** Rolle `backtest_reviewer` für genau dieses Konto vergeben. Die Kontrolle muss genau eine Zeile zeigen.
3. **Owner:** diesen PR (#1227) freigeben. Merge, danach rollt „Konten — Produktion automatisch“ den Worker aus. Es gibt keinen weiteren Freigabejob, weil der Schalter nicht zahlungsrelevant ist.
4. **Prüfen** (Abschnitt 4):
   - ohne Sitzung 401;
   - Konto ohne Rolle 403;
   - Testkonto: `https://research.visionuniverse.de/konto/admin/backtests/`.
5. **Praxistest** wie in 7.
6. **Zurücknehmen nach Bedarf:** die Rolle sofort per SQL entziehen, oder den Schalter per PR auf `"false"` setzen.


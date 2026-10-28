# Produktion: was automatisch läuft, was der Owner freigibt

Stand 28.10.2026. Gilt für Konten und Abos (Supabase `qiytbnpoqvldsatpfkeh`, Worker `vu-account`, Stripe Live).
Bestehende Infrastruktur, keine neuen Schlüssel, keine neue Datenbank.

## Umgebungen

| Umgebung | Required reviewers | Branches | Secrets | Wofür |
|---|---|---|---|---|
| `account-auto` (neu) | keine | nur `main` | **nur** `VU_ACCOUNT_SUPABASE_DB_URL`, `VU_ACCOUNT_SUPABASE_PUBLISHABLE_KEY` | automatische Migrationen, Worker-Code, Preis-Eintrag nach Stripe-Freigabe, nächtliche Sicherung |
| `account-dev` | **Owner** (bleibt) | nur `main` | alle privilegierten Supabase- und Brevo-Zugänge (Secret Key, Access Token, SMTP), DB-URL | Secrets setzen, Supabase Auth, destruktive Datenbank, Testerrolle, Kündigungen |
| `account-production` | **Owner** (bleibt) | nur `main` | Stripe-Live-Schlüssel | Stripe-Produkte/-Preise, Stripe-Schlüssel, Freigabe zahlungsrelevanter Worker-Änderungen |

Die privilegierten Zugänge bleiben also hinter der Freigabe; die Automatik bekommt nur die zwei Werte, die sie braucht.
`scripts/account/tests/workflow-environments.test.mjs` prüft das in CI (läuft bei jeder Workflow-Änderung):
`account-auto` nur in vier benannten Jobs und nur mit diesen Secrets; jeder Job in `account-dev`/`account-production`
prüft die Owner-Freigabe seines Laufs zusätzlich selbst (fail closed, nur von `main`); privilegierte Konto-Secrets nie
ohne Umgebung; keine Konto-Umgebung in Workflows mit `pull_request_target`/`workflow_run`.

## Automatisch (ohne Freigabe)

„Konten — Produktion automatisch“ (`account-production-auto.yml`) nach jedem Merge nach `main`, der Migrationen oder
den Worker ändert:

1. **pruefen** – Tests, Produktionskonfiguration (lehnt `VU_CHECKOUT_ACCESS = "public"` ab), Bundle.
2. **migrationen** – `scripts/account/migrate-production.mjs`:
   - nur neue Dateien nach der letzten eingespielten Version;
   - statisch abgelehnt: DROP TABLE/SCHEMA/TYPE/COLUMN, TRUNCATE, DROP … CASCADE, RLS aus, Spaltentyp ändern,
     DELETE/UPDATE auf Kundentabellen, Rollen vergeben, Live-Preise oder Registrierung ändern;
   - **eine Transaktion (REPEATABLE READ) mit Integritätsprobe:** jede vorher vorhandene Zeile jeder Kundentabelle
     (`auth.users`, `auth.identities`, `billing.*`, `public.*` mit `user_id`) muss danach mit identischem Inhalt
     existieren (Zeilen-ID + Inhalts-Hash, neue Zeilen und Spalten erlaubt); RLS bleibt an; `anon`/`authenticated`
     bekommen keine neuen Rechte; Policies der Kundentabellen bleiben gleich; Testerrollen, Live-Preise und
     Registrierungsschalter bleiben gleich. Sonst wird **alles** zurückgerollt – auch bei verstecktem, dynamischem SQL.
3. **zahlungsfreigabe** – nur wenn seit dem letzten erfolgreichen Lauf zahlungsrelevanter Code geändert wurde
   (Abrechnungskern, Konfiguration, diese Automatik, oder eine Worker-Datei mit Stripe/Checkout/Abrechnung):
   Owner-Freigabe in `account-production`. Sonst läuft der Worker ohne Freigabe aus.
4. **worker** – Code und öffentliche Werte, **keine Secrets**. 5. **gesundheit** – `/v1/health`, `/v1/plans`.

## Nur mit ausdrücklicher Freigabe

| Aktion | Workflow | Umgebung |
|---|---|---|
| Stripe-Produkte, -Preise, Portal, Webhook | „Konten — Stripe Live einrichten (Produktion)“ | `account-production` (der Preis-Eintrag danach prüft dieselbe Freigabe) |
| Produktive Secrets | „Konten — Produktions-Secrets setzen (Freigabe)“ | Stripe: `account-production`, Supabase/Brevo: `account-dev` |
| Destruktive Datenbankoperationen | „Konten — Datenbank mit Freigabe“ (Eingabe `DESTRUKTIV`) | `account-dev` |
| Testerrolle für den Live-Checkout | „Konten — Testerrolle für den Live-Checkout vergeben“ | `account-dev` |
| Supabase-Auth-Einstellungen | „Konten — Supabase Auth einstellen (Produktion)“ | `account-dev` |
| Kündigungen von Hand bearbeiten | „Konten — Kündigungen“ | `account-dev` |
| Zahlungsrelevanter Worker-Code | „Konten — Produktion automatisch“, Job `zahlungsfreigabe` | `account-production` |

Stillgelegt: die Einmal-Läufe auf `ops/supabase-dev-migrations` und die Entwicklungs-Workflows
(`account-dev-setup.yml`, `account-deploy.yml`; das Projekt heißt historisch „vision-universe-dev“, deshalb wären sie
gegen die Produktion gelaufen). Wiederherstellbar aus der Git-Historie.

## Öffentliche Zahlungen: zwei unabhängige Freigaben des Owners

1. `VU_CHECKOUT_ACCESS = "public"` in `workers/vu-account/wrangler.toml` – per PR; die Automatik lehnt den Wert ab,
   und jede Änderung an `wrangler.toml` braucht ohnehin die Zahlungsfreigabe.
2. Am Stripe-Produkt **„Vision Universe Pro“** die Metadaten `vu_public_checkout = true` – **nur von Hand im
   Stripe-Dashboard**. Kein Workflow und kein Skript schreibt diesen Schlüssel (Test in `stripe-live-setup.test.mjs`);
   der Worker liest ihn bei jedem Checkout direkt bei Stripe.

Fehlt eins, antwortet der Checkout `403 CHECKOUT_NOT_OPEN`. Testkonten (Rolle `billing_tester`) brauchen Punkt 2 nicht.
Rücknahme: Metadaten im Dashboard löschen – wirkt sofort.

## Grenzen (bewusst benannt)

- Claude Code arbeitet in GitHub unter der Kennung des Owners. GitHub kann eine Freigabe über diesen Zugang nicht von
  einer Owner-Freigabe unterscheiden. Claude Code erteilt nie Freigaben; der Stripe-Schalter liegt deshalb außerhalb von GitHub.
- `CLOUDFLARE_API_TOKEN` und `BREVO_API_KEY` sind Repository-Secrets, die viele andere Workflows nutzen (auch auf
  `claude/**`-Branches). Wer Schreibrechte am Repository hat, könnte damit einen eigenen Workflow schreiben, der den
  Worker an allen Prüfungen vorbei ausrollt. Das schließt nur eine Verlagerung des Tokens in eine Umgebung
  (eigene Aufräumarbeit über rund 20 Workflows).
- Die tägliche Sicherung braucht noch den öffentlichen Empfängerschlüssel (`VU_ACCOUNT_BACKUP_AGE_RECIPIENT`); bis dahin
  bricht sie ab, ohne etwas unverschlüsselt zu speichern. Vor jeder Freigabe einer destruktiven Migration: Sicherung prüfen.

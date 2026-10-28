# Produktion: was automatisch läuft, was der Owner freigibt

Stand 28.10.2026. Gilt für Konten und Abos (Supabase `qiytbnpoqvldsatpfkeh`, Worker `vu-account`, Stripe Live).
Bestehende Infrastruktur, keine neuen Schlüssel, keine neue Datenbank.

## Einmalige GitHub-Einstellung (Owner)

Settings → Environments:

| Umgebung | Required reviewers | Deployment branches | Enthält |
|---|---|---|---|
| `account-dev` | **aus** (Haken entfernen) | **nur `main`** (`ops/supabase-dev-migrations` entfernen) | Supabase-DB-URL und -Schlüssel, Brevo-SMTP |
| `account-production` | **an: Owner** (unverändert) | **nur `main`** | Stripe-Live-Schlüssel; dient zugleich als Freigabe-Schalter für alle sensiblen Läufe |

Mehr ist nicht nötig. Claude Code kann Umgebungen nicht ändern (Administration) und erteilt **nie** selbst Freigaben.
Hinweis: Claude Code arbeitet in GitHub unter der Kennung des Owners; GitHub kann eine Freigabe über diesen Zugang
nicht von einer Freigabe des Owners unterscheiden. Deshalb hängt der kritischste Schritt (öffentliche Zahlungen)
zusätzlich an einem Schalter außerhalb von GitHub (siehe unten).

## Automatisch (ohne Freigabe)

| Was | Workflow | Sicherung |
|---|---|---|
| CI, Tests, Browser-QA | `account-ci.yml` u. a. | keine Zugangsdaten |
| Datenbank-Migrationen, **nicht destruktiv** | „Konten — Produktion automatisch“ (`account-production-auto.yml`), nach Merge nach `main` | `scripts/account/migrate-production.mjs`: nur neue Dateien nach der letzten eingespielten Version; statisch abgelehnt werden DROP TABLE/SCHEMA/TYPE/COLUMN, TRUNCATE, DROP … CASCADE, RLS aus, Spaltentyp-Änderung, DELETE/UPDATE auf Kundentabellen; alles in **einer Transaktion** mit Zählprobe aller Kundentabellen (`auth.users`, `billing.*`, `public.*` mit `user_id`) – sinkt eine Zahl, wird zurückgerollt |
| Worker-Code und öffentliche Konfiguration | dieselbe Workflow, Job `worker` | setzt **keine** Secrets; lehnt `VU_CHECKOUT_ACCESS = "public"` ab |

## Nur mit ausdrücklicher Freigabe (Required reviewers in `account-production`)

Jeder dieser Läufe hat einen Job `freigabe` in `account-production`; die Jobs mit Zugangsdaten aus `account-dev`
laufen erst danach und prüfen die Freigabe-Historie des Laufs zusätzlich selbst (fail closed, nur von `main`).

| Aktion | Workflow |
|---|---|
| Stripe-Produkte, -Preise, Portal, Webhook | „Konten — Stripe Live einrichten (Produktion)“ |
| Produktive Secrets (Supabase, Brevo, Stripe-Schlüssel) | „Konten — Produktions-Secrets setzen (Freigabe)“ |
| Destruktive Datenbankoperationen | „Konten — Datenbank mit Freigabe“ (zusätzlich Eingabe `DESTRUKTIV`) |
| Testerrolle für den Live-Checkout | „Konten — Testerrolle für den Live-Checkout vergeben“ |
| Supabase-Auth-Einstellungen | „Konten — Supabase Auth einstellen (Produktion)“ |
| Kündigungen von Hand bearbeiten | „Konten — Kündigungen“ (`account-cancellations.yml`) |
| Alt: Entwicklungs-Einrichtung, Entwicklungs-Deploy | `account-dev-setup.yml`, `account-deploy.yml` |

## Öffentliche Zahlungen: zwei unabhängige Schlüssel

Ein Checkout für jedes Konto braucht **beides**:

1. `VU_CHECKOUT_ACCESS = "public"` in `workers/vu-account/wrangler.toml` – nur per PR, und die automatische
   Auslieferung lehnt diesen Wert ab, bis die Prüfung bewusst geändert wird.
2. Am Stripe-Produkt **„Vision Universe Pro“** die Metadaten `vu_public_checkout = true` – **nur von Hand im
   Stripe-Dashboard** (Produkt → Metadaten). Kein Workflow und kein Skript schreibt diesen Schlüssel (Test:
   `stripe-live-setup.test.mjs`), und der Worker prüft ihn bei jedem Checkout direkt bei Stripe.

Fehlt einer, antwortet der Checkout `403 CHECKOUT_NOT_OPEN` (Protokoll `PUBLIC_CHECKOUT_NOT_RELEASED`). Testkonten
(Rolle `billing_tester`) brauchen den Stripe-Schlüssel nicht. Rücknahme: Metadaten im Dashboard löschen – wirkt sofort.

## Kundendaten löschen

Kein Workflow löscht Kundendaten ohne Freigabe. Automatische Migrationen können es nicht (Zählprobe), der
Kündigungsablauf führt nichts automatisch aus (`VU_CANCELLATION_AUTO_PROCESS = "false"`, vom Workflow erzwungen).
Ein Konto löscht nur dessen Inhaber selbst (`/v1/me/delete`, Passwortbestätigung).

# Konten und Abos – Produktion (eine Infrastruktur)

Owner-Entscheidung vom 26.10.2026: **keine getrennte Entwicklungs- und Produktionsinfrastruktur.** Das bestehende Supabase-Projekt
ist die Produktionsdatenbank, der Stripe-Live-Account der RAM Consulting UG die Abrechnung, der vorhandene Cloudflare-Account der
Betrieb. Dieses Dokument ersetzt LIVE_RELEASE.md Abschnitt B (`vision-universe-prod`, `account-prod`). Abschnitte A, C (ab Punkt 2)
und D gelten weiter.

## Bestandteile

| Teil | Produktion | Hinweis |
|---|---|---|
| Datenbank | Supabase `qiytbnpoqvldsatpfkeh` (Frankfurt, Free) | heißt historisch `vision-universe-dev`; 8 Migrationen, RLS, Tests 01–08 grün |
| API | Worker `vu-account` unter `https://konto.visionuniverse.de` | `wrangler.toml` `[env.production]`; **nicht** `account.visionuniverse.de` (Shopify-Kundenkonten) |
| Seiten | `/konto/` auf research.visionuniverse.de, hinter der Research-Passwortmaske | `konto/config.js` bleibt leer bis zur Freischaltung |
| Abrechnung | Stripe Live, Restricted Key `rk_live_` | Abrechnung aus, bis `STRIPE_LIVE_MODE_APPROVED = "true"` (eigener PR) |
| E-Mail | Brevo, Domain `visionuniverse.de` verifiziert und authentifiziert | Auth-Mails über Brevo-SMTP; Kündigungsbestätigungen über die Brevo-API |
| Sicherung | `account-backup.yml`, täglich, age-verschlüsselt | Free-Plan hat keine herunterladbaren Backups |

## Zugangsdaten (GitHub)

GitHub kann Umgebungen nicht umbenennen und Secrets nicht zwischen Umgebungen kopieren. Deshalb bleiben sie, wo sie sind; jeder
Job liest nur seine Umgebung und schreibt direkt in die Worker-Secrets.

| Ort | Inhalt | genutzt von |
|---|---|---|
| Umgebung `account-dev` (historischer Name, Produktionsdaten) | `VU_ACCOUNT_SUPABASE_DB_URL`, `…_PUBLISHABLE_KEY`, `…_SECRET_KEY`, `…_ACCESS_TOKEN`, Variable `VU_ACCOUNT_SUPABASE_URL` | Deploy (Job `supabase`), Stripe-Einrichtung (Preise eintragen), Einrichtungs-Workflow |
| Umgebung `account-production` | `VU_ACCOUNT_STRIPE_SECRET_KEY` (`rk_live_`) | Deploy (Job `stripe`), Stripe-Einrichtung |
| Repository | `CLOUDFLARE_API_TOKEN`, Variable `CLOUDFLARE_ACCOUNT_ID`, `BREVO_API_KEY` | alle Worker-Deploys |

Beide Umgebungen: *Required reviewers* = Owner, *Deployment branches* = `main` (zusätzlich `ops/supabase-dev-migrations`
für die Betriebsläufe). Jeder Job prüft die Freigabe zusätzlich selbst (fail closed).

## Abläufe

1. **Ausrollen** – Actions → „Konten — vu-account ausrollen (Produktion)“ → Run workflow (zwei Freigaben). Danach meldet
   `https://konto.visionuniverse.de/v1/health` `accounts: true`, `autoProcess: false`.
2. **Auth einstellen** – Repository-Variable `VU_ACCOUNT_API_ORIGIN = https://konto.visionuniverse.de`, dann „Konten —
   Entwicklungsumgebung einrichten“, Schritt `supabase` (erst Probelauf). Setzt Site-URL, Redirect `…/v1/auth/callback**`,
   E-Mail-Bestätigung, Passwortregeln, Hook „Before User Created“, deutsche Vorlagen und – mit
   `VU_ACCOUNT_BREVO_SMTP_LOGIN`/`…_SMTP_KEY` – SMTP über Brevo.
3. **Stripe** – „Konten — Stripe Live einrichten (Produktion)“: legt Produkte `vu_plus`/`vu_pro` und den Webhook an; das
   Geheimnis geht direkt in den Worker. Preise, Kundenportal und `plan_prices` erst mit der Repository-Variable
   `VU_ACCOUNT_LIVE_PRICES` (Owner-Entscheidung).
4. **Freischalten** (jeweils eigener PR, eigene Freigabe):
   - Abrechnung: `STRIPE_LIVE_MODE_APPROVED = "true"` in `[env.production.vars]`, ausrollen.
   - Seiten: `konto/config.js` → `{endpoint: 'https://konto.visionuniverse.de'}`.
   - Öffentliche Registrierung: `VU_REGISTRATION_ENABLED = "true"` **und** `update public.registration_gate set open = true`
     – erst wenn Bestätigungsmails nachweislich über Brevo ankommen.

## Schutz der Testpreise

`plan_prices` enthält vier Test-Platzhalter (`livemode = false`). Sie können im Livebetrieb nichts freischalten: `/v1/plans` zeigt
nur Preise passend zum Schlüsselmodus, der Checkout gleicht den Preis vorher mit Stripe ab, `billing_apply_subscription` lehnt
`LIVEMODE_MISMATCH` ab, und Live-Ereignisse werden ohne `STRIPE_LIVE_MODE_APPROVED` verworfen.

## Sicherung und Wiederherstellung

Einmalig: lokal `age-keygen -o vu-backup.key` (privater Schlüssel nur offline/Passwortmanager), den öffentlichen Teil `age1…` als
Repository-Variable `VU_ACCOUNT_BACKUP_AGE_RECIPIENT`, die Session-Pooler-URI als Repository-Secret `VU_ACCOUNT_BACKUP_DB_URL`.
Ohne Empfängerschlüssel sichert der Workflow nichts (nie unverschlüsselt).

Wiederherstellen: Artefakt laden, `age -d -i vu-backup.key vu-accounts-….dump.age > dump`, dann
`pg_restore --no-owner --data-only -d <URI> dump` (Schema über die Migrationen). Vorher immer in ein leeres Projekt testen.

## Grenzen des Free-Plans (bewusst in Kauf genommen)

- Keine herunterladbaren Backups, kein Point-in-Time-Recovery → eigene Sicherung oben (bis zu 24 h Datenverlust möglich).
- Pausierung nach 7 Tagen ohne Aktivität: der Worker-Cron (alle 10 min) fragt die Datenbank ab und hält sie aktiv.
- 500 MB Datenbank, 50.000 monatlich aktive Nutzer (Auth), kein Support-SLA.
- Leaked-Password-Schutz (HIBP) erst ab Pro.
- Wechsel auf Pro (25 $/Monat) jederzeit ohne Migration möglich.

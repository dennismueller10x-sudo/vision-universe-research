# Konten und Abos – Produktion (eine Infrastruktur)

Owner-Entscheidung vom 26.10.2026: **keine getrennte Entwicklungs- und Produktionsinfrastruktur.** Das bestehende Supabase-Projekt
ist die Produktionsdatenbank, der Stripe-Live-Account der RAM Consulting UG die Abrechnung, der vorhandene Cloudflare-Account der
Betrieb. Dieses Dokument ersetzt LIVE_RELEASE.md Abschnitt B (`vision-universe-prod`, `account-prod`). Abschnitte A, C (ab Punkt 2)
und D gelten weiter.

## Bestandteile

| Teil | Produktion | Hinweis |
|---|---|---|
| Datenbank | Supabase `qiytbnpoqvldsatpfkeh` (Frankfurt, Free) | heißt historisch `vision-universe-dev`; 10 Migrationen, RLS, Tests 01–10 grün |
| API | Worker `vu-account` unter `https://konto.visionuniverse.de` | `wrangler.toml` `[env.production]`; **nicht** `account.visionuniverse.de` (Shopify-Kundenkonten) |
| Seiten | `/konto/` auf research.visionuniverse.de, hinter der Research-Passwortmaske | `konto/config.js` bleibt leer bis zur Freischaltung |
| Abrechnung | Stripe Live, Restricted Key `rk_live_` | Live angebunden; Checkout nur für Konten mit Rolle `billing_tester` (`VU_CHECKOUT_ACCESS = "testers"`), siehe [TARIFE.md](TARIFE.md) |
| E-Mail | Brevo, Domain `visionuniverse.de` verifiziert und authentifiziert | Auth-Mails über Brevo-SMTP; Vertrags-, Kündigungs- und Widerrufsbestätigungen über die Brevo-API; Kontaktabgleich und Newsletter aus ([BREVO.md](BREVO.md)) |
| Rechtstexte, Kündigen, Widerrufen | `https://konto.visionuniverse.de/rechtliches/`, `/kuendigen`, `/widerrufen` (ohne Passwortmaske) | Entwürfe, [RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md) |
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

Ausrollen und nicht destruktive Migrationen laufen nach dem Merge automatisch; was eine Freigabe braucht, steht in
[FREIGABEN.md](FREIGABEN.md). Die Workflows unten sind die freigabepflichtigen Wege.

1. **Ausrollen** – Actions → „Konten — vu-account ausrollen (Produktion)“ → Run workflow (zwei Freigaben). Danach meldet
   `https://konto.visionuniverse.de/v1/health` `accounts: true`, `autoProcess: false`.
2. **Auth einstellen** – „Konten — Supabase Auth einstellen (Produktion)“ (erst Probelauf;
   `supabase-auth-config.mjs --production`, nur die feste Ref, ohne Projektabfrage). Setzt Site-URL, Redirect
   `https://konto.visionuniverse.de/v1/auth/callback**`, E-Mail-Bestätigung, Passwort ≥ 10 mit Groß/Klein/Ziffer, Hook
   „Before User Created“, deutsche Vorlagen (Registrierung, Passwort, E-Mail-Änderung) und – mit
   `VU_ACCOUNT_BREVO_SMTP_LOGIN`/`…_SMTP_KEY` in `account-dev` – SMTP über Brevo.
3. **Stripe** – „Konten — Stripe Live einrichten (Produktion)“ (erst Probelauf, dann zwei Freigaben): legt Produkt
   `vu_pro` „Vision Universe Pro“, den Monatspreis 1,00 EUR (Katalog im Code, `LIVE_CATALOG`), Kundenportal und Webhook an;
   Webhook-Geheimnis und Portal-ID gehen direkt in den Worker, `pro_month_live` in `plan_prices`.
4. **Öffentliche Registrierung** (Owner-Entscheidung 27.10.2026: jede gültige Adresse, **keine Positivliste**):
   - `VU_REGISTRATION_ENABLED = "true"` in `[env.production.vars]`; `VU_REGISTRATION_ALLOWLIST` bleibt leer (der Deploy prüft das).
   - Datenbank: `update public.registration_gate set open = true` – erst danach lässt der Hook „Before User Created“
     neue Konten zu. `registration_allowlist` bleibt leer.
   - Ein Konto entsteht erst nach bestätigter E-Mail (Supabase Auth, `mailer_autoconfirm = false`, Mails über Brevo-SMTP).
   - Schutz bleibt: Ratenbegrenzung im Worker (je Isolate und über alle Isolates mit `VU_ACCOUNT_LIMITER`), Grenzen von
     Supabase Auth (u. a. 30 Auth-Mails/Stunde), Passwortregeln, CSRF-Schutz, RLS auf allen Konto-Tabellen.
   - Zurück (geschlossen): `update public.registration_gate set open = false` wirkt sofort, ohne Ausrollen.
5. **Funktionsprüfung** – mit echten Konten, ohne eigene Testkonten-Infrastruktur: registrieren auf
   `/konto/registrieren/`, E-Mail bestätigen, anmelden, Watchlist aus Discover und Quant. Begleitend nur lesend:
   `/v1/health`, Zählungen und RLS in der Datenbank, Zustellereignisse bei Brevo.
6. **Abrechnung** (Owner-Entscheidung 28.10.2026): `STRIPE_LIVE_MODE_APPROVED = "true"`, `VU_CHECKOUT_ACCESS = "testers"`.
   Den Checkout nutzen nur Konten mit Rolle `billing_tester`; öffentlicher Pro-Checkout nur per eigenem Freigabe-PR
   (`"public"`, der Deploy-Workflow lehnt ihn bis dahin ab). Ablauf und Tarife: [TARIFE.md](TARIFE.md).

## Schutz der Testpreise

`plan_prices` enthält vier Test-Platzhalter (`livemode = false`). Sie können im Livebetrieb nichts freischalten: `/v1/plans` zeigt
nur Preise passend zum Schlüsselmodus, der Checkout gleicht den Preis vorher mit Stripe ab, `billing_apply_subscription` lehnt
`LIVEMODE_MISMATCH` ab, und Live-Ereignisse werden ohne `STRIPE_LIVE_MODE_APPROVED` verworfen.

## Sicherung und Wiederherstellung

Einmalig: lokal `age-keygen -o vu-backup.key` (privater Schlüssel nur offline/Passwortmanager), den öffentlichen Teil `age1…` als
Repository-Variable `VU_ACCOUNT_BACKUP_AGE_RECIPIENT`; die Datenbank-URL kommt aus der Umgebung `account-auto` ([FREIGABEN.md](FREIGABEN.md)).
Ohne Empfängerschlüssel sichert der Workflow nichts (nie unverschlüsselt).

Wiederherstellen: Artefakt laden, `age -d -i vu-backup.key vu-accounts-….dump.age > dump`, dann
`pg_restore --no-owner --data-only -d <URI> dump` (Schema über die Migrationen). Vorher immer in ein leeres Projekt testen.

## Grenzen des Free-Plans (bewusst in Kauf genommen)

- Keine herunterladbaren Backups, kein Point-in-Time-Recovery → eigene Sicherung oben (bis zu 24 h Datenverlust möglich).
- Pausierung nach 7 Tagen ohne Aktivität: der Worker-Cron (alle 10 min) fragt die Datenbank ab und hält sie aktiv.
- 500 MB Datenbank, 50.000 monatlich aktive Nutzer (Auth), kein Support-SLA.
- Leaked-Password-Schutz (HIBP) erst ab Pro.
- Wechsel auf Pro (25 $/Monat) jederzeit ohne Migration möglich.

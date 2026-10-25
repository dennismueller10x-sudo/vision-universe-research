# Konten und Abos – Einrichtung (Entwicklungsumgebung)

Was der Owner selbst tun muss, in dieser Reihenfolge. Keine Zugangsdaten ins Repository, in Issues oder in Chats; Werte nur in die
genannten Felder (Supabase, Stripe, Cloudflare, GitHub-Secrets). **Alles hier ist Testmodus und kostenlos.** Für Produktion: [LIVE_RELEASE.md](LIVE_RELEASE.md).

Architektur: [ACCOUNTS_AND_SUBSCRIPTIONS.md](ACCOUNTS_AND_SUBSCRIPTIONS.md).

## Supabase (Projekt `vision-universe-dev`)

**S1 – Projekt anlegen.** supabase.com → New project → Organisation „Vision Universe“, Name `vision-universe-dev`, Region **Central EU (Frankfurt)**,
Plan **Free**, starkes Datenbankpasswort (im Passwortmanager, nirgends sonst).

**S2 – Schema einspielen.** Entweder Supabase CLI (lokal):

```bash
supabase login
supabase link --project-ref <ref>          # <ref> aus der Projekt-URL
supabase db push                           # spielt supabase/migrations/* ein
psql "<Verbindungs-URL aus Settings → Database>" -f supabase/seed.sql   # Testpreise (Platzhalter, siehe T3)
```

oder im Dashboard → SQL Editor die fünf Dateien aus `supabase/migrations/` in Reihenfolge ausführen, danach `supabase/seed.sql`.
`supabase/local/platform-stub.sql` **nicht** ausführen (nur für Tests).

**S3 – Auth einstellen** (Authentication → …):

| Einstellung | Wert |
|---|---|
| Sign In / Providers → Email | an; **Confirm email: an**; Secure email change: an; Secure password change: an |
| Sign In / Providers → „Allow new users to sign up“ | **an** im Entwicklungsprojekt (der Worker schließt die Registrierung selbst über `VU_REGISTRATION_ENABLED`/Positivliste) |
| Password: Minimum length | 10; „Lowercase, uppercase letters and digits“ |
| Leaked password protection | an, falls im Plan verfügbar |
| URL Configuration → Site URL | `https://research.visionuniverse.de/konto/` |
| URL Configuration → Redirect URLs | `https://<worker-adresse>/v1/auth/callback**` (nach W2; später `https://account.visionuniverse.de/v1/auth/callback**`) |
| Rate Limits → „Forward client IP“ (`Sb-Forwarded-For`) | an; danach Worker-Variable `SUPABASE_FORWARD_CLIENT_IP=true` |
| Sessions | Refresh-Token-Rotation an (Standard), Reuse interval 10 s |
| JWT Keys | asymmetrischer Signaturschlüssel (ES256) aktiv – Standard bei neuen Projekten; der Worker prüft über JWKS |

**S4 – E-Mail-Versand (nach Brevo B1–B3).** Authentication → Emails → SMTP Settings → eigenes SMTP (Brevo: `smtp-relay.brevo.com`, Port 587, SMTP-Schlüssel aus
Brevo), Absender `konto@visionuniverse.de`. Ohne eigenes SMTP sendet Supabase nur **2 E-Mails pro Stunde**. Vorlagen „Confirm signup“ und „Reset
password“ auf Deutsch; der Link bleibt `{{ .ConfirmationURL }}`.

**S5 – API-Schlüssel.** Settings → API Keys: `sb_publishable_…` (öffentlich) und einen neuen **Secret Key** `sb_secret_…` „vu-account-worker“ anlegen.

**S6 – Supabase MCP für Claude Code (optional, nur Entwicklungsprojekt).** Erst nach S1, mit eigener Anmeldung des Owners:

```bash
claude mcp add --scope project --transport http supabase \
  "https://mcp.supabase.com/mcp?project_ref=<ref-des-dev-projekts>&read_only=true&features=database,docs"
claude /mcp   # supabase → Authenticate (Browser-Login, kein Token nötig)
```

Nur `project_ref` des **Entwicklungs**projekts, `read_only=true` als Standard; Schreibzugriff nur bewusst und befristet. Nie das Produktionsprojekt
verbinden. Manuelle Freigabe jedes Werkzeugaufrufs eingeschaltet lassen.

## Stripe (Testmodus)

**T1 – Konto.** dashboard.stripe.com → Konto anlegen bzw. vorhandenes nutzen; oben **„Testmodus“** (Sandbox). Für Testmodus ist keine
Unternehmensverifizierung nötig. Nichts im Live-Modus anlegen.

**T2 – Produkte und Preise (Testmodus).** Produkte „Vision Universe Plus“ und „Vision Universe Pro“, je ein Preis monatlich und jährlich,
EUR, wiederkehrend, **Preis inkl. Steuer** (Tax behavior: inclusive). Betragsvorschlag: 9,90/99 und 19,90/199 € (Owner-Entscheidung).

**T3 – Preis-IDs in Supabase.** SQL Editor im Entwicklungsprojekt:

```sql
update public.plan_prices set provider_price_id = 'price_…' where id = 'plus_month';
update public.plan_prices set provider_price_id = 'price_…' where id = 'plus_year';
update public.plan_prices set provider_price_id = 'price_…' where id = 'pro_month';
update public.plan_prices set provider_price_id = 'price_…' where id = 'pro_year';
```

**T4 – Zahlungsmethoden** (Settings → Payment methods, Testmodus): Karten, Apple Pay, Google Pay, Link, SEPA-Lastschrift, PayPal (für
wiederkehrende Zahlungen ggf. „Request access“). Code ändert sich dafür nicht.

**T5 – Kundenportal** (Settings → Billing → Customer portal): Rechnungen anzeigen, Zahlungsmethode ändern, Rechnungsadresse ändern,
**Abo wechseln** zwischen den vier Preisen (Proration: „Prorate“), **Kündigen: am Ende der Abrechnungsperiode**; Rückkehr-Link
`https://research.visionuniverse.de/konto/abo/`.

**T6 – Fehlgeschlagene Zahlungen** (Settings → Billing → Subscriptions and emails): Smart Retries an; nach allen Versuchen: Abo **als unbezahlt
markieren**; E-Mails an Kunden bei fehlgeschlagener Zahlung an.

**T7 – Schlüssel.** Developers → API keys → **Restricted key** „vu-account (test)“ mit Rechten: Customers Write, Checkout Sessions Write,
Customer portal Write, Subscriptions Write, Invoices Read, Prices Read. Ergebnis `rk_test_…`.

**T8 – Webhook** (nach W2): Developers → Webhooks → Endpoint `https://<worker-adresse>/v1/billing/webhook/stripe`, API-Version wie
`STRIPE_API_VERSION` (`2025-03-31.basil` oder neuer, der Adapter liest beide Formen), Ereignisse:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created|updated|deleted|paused|resumed|trial_will_end`,
`invoice.finalized|paid|payment_succeeded|payment_failed|payment_action_required|voided|marked_uncollectible`,
`charge.dispute.created`, `charge.refunded` (nur Alarm im Log). Signing secret `whsec_…` notieren.

## Cloudflare und DNS

**D1 – Subdomain.** Prüfen, ob die Zone `visionuniverse.de` in Cloudflare liegt (dort laufen bereits `live.visionuniverse.de` u. a.). Für die
Entwicklung reicht die `*.workers.dev`-Adresse – **aber** Safari und Firefox blockieren deren Cookies im Kontext von
`research.visionuniverse.de`. Testen dann mit Chrome oder direkt über `scripts/account/dev-server.mjs`. Für echte Tests auf allen Browsern:
in `workers/vu-account/wrangler.toml` die Zeile `routes = [{ pattern = "account-dev.visionuniverse.de", custom_domain = true }]` aktivieren
(Cloudflare legt DNS-Eintrag und Zertifikat selbst an).

**C3 – Ratenbegrenzung über alle Isolates (optional).** Block `[[ratelimits]]` in `wrangler.toml` einkommentieren, wenn das Konto Rate
Limiting Bindings anbietet. Ohne ihn greift die Begrenzung je Isolate plus die Auth-Grenzen von Supabase.

## Brevo (E-Mail, kostenloser Tarif)

Brevo ist bereits im Haus (Newsletter, `docs/brevo/`). Für Konten kommen **Transaktions-E-Mails** dazu: Bestätigungs- und Passwort-Links
(über Supabase-SMTP) und die **Kündigungsbestätigung nach § 312k BGB** (direkt vom Worker über die Brevo-API). Der kostenlose Tarif erlaubt
300 E-Mails pro Tag; kein Upgrade nötig.

**B1 – Domain authentifizieren.** Brevo → Senders, Domains & Dedicated IPs → Domains → `visionuniverse.de`: die angezeigten DNS-Einträge
(Brevo-Code, DKIM, DMARC) in der DNS-Zone eintragen und „Authenticate“ (laut `docs/brevo/README.md` ist die Domain registriert, aber noch
nicht authentifiziert). Ohne Authentifizierung landen E-Mails im Spam oder werden abgelehnt.

**B2 – Absender.** Senders → Add sender `konto@visionuniverse.de`, Name „Vision Universe“. Postfach muss Antworten empfangen können
(Kündigungsrückfragen landen dort).

**B3 – SMTP für Supabase Auth.** SMTP & API → SMTP: Login und SMTP-Schlüssel → in Supabase S4 eintragen (`smtp-relay.brevo.com`, Port 587,
Absender aus B2).

**B4 – API-Schlüssel für den Worker.** SMTP & API → API Keys → neuen Schlüssel „vu-account-transactional“ anlegen (eigener Schlüssel, nicht der
Newsletter-Schlüssel, damit er getrennt widerrufen werden kann) → GitHub-Secret `VU_ACCOUNT_BREVO_API_KEY`. Ohne diesen Schlüssel speichert
der Worker Kündigungen trotzdem, markiert sie aber als „Bestätigung nicht versendet“ (`confirmation_status = 'not_configured'`).

**B5 – Prüfen.** Nach W2: `GET <adresse>/v1/health` meldet `"mail": true`. Auf `/konto/kuendigen/` ohne Anmeldung eine Testkündigung mit einer
eigenen Adresse absenden → E-Mail „Eingangsbestätigung deiner Kündigung“ mit Bestätigungsnummer, Eingangszeitpunkt und Hinweis zum Vertragsende.

## GitHub (Umgebung `account-dev`)

**W1 – Umgebung.** Settings → Environments → New environment `account-dev`, „Required reviewers“: Owner.

| Art | Name | Wert |
|---|---|---|
| Secret | `VU_ACCOUNT_SUPABASE_SECRET_KEY` | `sb_secret_…` (S5) |
| Secret | `VU_ACCOUNT_STRIPE_SECRET_KEY` | `rk_test_…` (T7) |
| Secret | `VU_ACCOUNT_STRIPE_WEBHOOK_SECRET` | `whsec_…` (T8; beim ersten Lauf leer lassen → Abrechnung aus) |
| Secret (Repo) | `CLOUDFLARE_API_TOKEN` | liegt bereits vor |
| Variable | `VU_ACCOUNT_SUPABASE_URL` | `https://<ref>.supabase.co` |
| Secret | `VU_ACCOUNT_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (öffentlich, aber nach Repo-Regel nur über `secrets`) |
| Variable | `VU_ACCOUNT_API_ORIGIN` | nach W2: Worker-Adresse bzw. `https://account-dev.visionuniverse.de` |
| Variable | `VU_ACCOUNT_REGISTRATION_ALLOWLIST` | Test-Adressen, kommagetrennt |
| Variable | `VU_ACCOUNT_ALLOWED_ORIGINS` | optional, zusätzliche Test-Herkünfte (W3) |
| Secret | `VU_ACCOUNT_BREVO_API_KEY` | Brevo-API-Schlüssel (B4) |
| Variable | `VU_ACCOUNT_MAIL_SENDER` | `konto@visionuniverse.de` (B2) |

**W2 – Ausrollen.** Actions → „Konten — vu-account ausrollen (Entwicklung)“ → Run workflow. Der Lauf lehnt Live-Schlüssel ab. Adresse aus dem
Protokoll als `VU_ACCOUNT_API_ORIGIN` eintragen, Redirect-URL in Supabase (S3) und Webhook in Stripe (T8) setzen, `whsec_…` hinterlegen, Workflow
erneut starten. Prüfen: `GET <adresse>/v1/health` → `{"state":"OK","accounts":true}`.

**W3 – Seiten verbinden (nur für Tests).** In einem **Entwicklungs-Branch** (nicht `main`) `konto/config.js` auf
`{endpoint: '<adresse>'}` setzen und lokal mit `python3 -m http.server 8765` testen; dafür die Variable
`VU_ACCOUNT_ALLOWED_ORIGINS=http://localhost:8765` setzen und W2 erneut starten. Auf `main` bleibt der Endpunkt leer, bis die Live-Freigabe erfolgt.

## Testen im Entwicklungsprojekt

1. Mit einer Adresse der Positivliste registrieren, Bestätigungsmail öffnen, anmelden.
2. Tarif wählen, Stripe-Testkarte `4242 4242 4242 4242` (beliebiges künftiges Datum, beliebige Prüfziffer). SEPA-Test-IBAN `DE89370400440532013000`.
   Ablehnung: `4000 0000 0000 0341` (Zahlung scheitert nach Anlage → `past_due`).
3. `/konto/abo/`: Abo aktiv, Rechnung bezahlt; Kundenportal: Tarif wechseln, kündigen.
4. Webhooks zusätzlich mit der Stripe CLI auslösen: `stripe listen --forward-to <adresse>/v1/billing/webhook/stripe` und `stripe trigger invoice.payment_failed`.
   Für Verlängerungen und Ablauf: **Test Clocks** im Dashboard.
5. Abgleich: `node scripts/account/reconcile-stripe.mjs --dry-run` mit den Entwicklungswerten in der Umgebung.
6. Supabase SQL Editor: `select * from billing.payment_events order by id desc limit 20;` – keine `failed`.

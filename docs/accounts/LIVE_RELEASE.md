# Konten und Abos – Live-Freigabe

Nichts hiervon ist erledigt. Jeder Schritt braucht die **ausdrückliche Freigabe des Owners**; die Reihenfolge ist bindend. Vorher:
[SETUP.md](SETUP.md) vollständig im Entwicklungsprojekt durchgespielt, alle Punkte aus „Testen im Entwicklungsprojekt“ grün.

## A. Recht und Steuern (vor allem anderen)

- [ ] AGB/Nutzungsbedingungen, Widerrufsbelehrung inkl. Muster-Widerrufsformular, Datenschutzerklärung (Supabase, Cloudflare, Stripe, Brevo) veröffentlicht; `termsVersion` in `konto/konto.js` auf die veröffentlichte Version setzen.
- [ ] AV-Verträge/DPAs: Supabase, Cloudflare, Brevo; Stripe-Bedingungen akzeptiert.
- [ ] Kündigungsbutton dauerhaft erreichbar (Link in der globalen Shell/Fußzeile, eigener Shell-PR mit Shell-QA – O4). Die E-Mail-Bestätigung ist gebaut; sie braucht Brevo B1–B5 in Produktion; `billing.cancellation_requests` mit `confirmation_status <> 'sent'` muss leer sein.
- [ ] Checkout-Button-Beschriftung (§ 312j BGB) und Zustimmung zum vorzeitigen Leistungsbeginn geprüft; ggf. `STRIPE_CHECKOUT_REQUIRE_TERMS=true` mit hinterlegter AGB-URL im Stripe-Dashboard.
- [ ] Umsatzsteuer: nur DE oder Stripe Tax (OSS) entschieden; Preise brutto.

## B. Produktion getrennt aufbauen

- [ ] Supabase-Projekt `vision-universe-prod` (Frankfurt, **Pro-Plan** wegen Backups und ohne Pausieren), S2–S5 wie im Entwicklungsprojekt; `seed.sql` **nicht** einspielen – Live-Preise mit `livemode = true` per SQL anlegen.
- [ ] Stripe Live-Modus: Unternehmensverifizierung, Auszahlungskonto, Produkte/Preise, Zahlungsmethoden, Kundenportal, Retry-Regeln, Webhook auf `https://account.visionuniverse.de/v1/billing/webhook/stripe`, **Restricted Key** `rk_live_…`.
- [ ] DNS: `account.visionuniverse.de` als Custom Domain des Workers (`routes` in `wrangler.toml`).
- [ ] GitHub-Umgebung `account-prod` mit Pflicht-Review durch den Owner; eigener Produktions-Deploy-Workflow (Kopie von `account-deploy.yml`, Environment `account-prod`, Worker-Umgebung `[env.production]` mit `name = "vu-account"`, Entwicklung als `vu-account-dev`).

## C. Freischalten (eigener PR, nach Review)

1. `wrangler.toml` Produktion: `VU_ENVIRONMENT=production`, `VU_ACCOUNT_API_ORIGIN=https://account.visionuniverse.de`, `SUPABASE_FORWARD_CLIENT_IP=true`, **`STRIPE_LIVE_MODE_APPROVED=true`** (die einzige Stelle, die Live-Schlüssel zulässt).
2. Ausrollen über den Produktions-Workflow; `GET /v1/health`; `GET /v1/plans` zeigt `mode: live` und die Live-Preise.
3. Abgleich `reconcile-stripe.mjs --dry-run` gegen Produktion: 0 Fehler.
4. **Geschlossener Start:** `VU_REGISTRATION_ENABLED=false`, Positivliste mit 3–5 internen Konten; echte Zahlung mit eigener Karte, Kündigung, Erstattung im Dashboard.
5. `konto/config.js` → `{endpoint: 'https://account.visionuniverse.de'}` (eigener PR). Die Seiten liegen weiterhin hinter der Research-Passwortmaske.
6. Öffentliche Registrierung: `VU_REGISTRATION_ENABLED=true` – **eigene Freigabe**.

## D. Betrieb

- Täglich: `billing.payment_events` mit `status = 'failed'`, `billing.entitlement_conflicts`, `billing.cancellation_requests` mit `status = 'manual_review'` oder `confirmation_status <> 'sent'` (unverzüglich bearbeiten bzw. Bestätigung nachsenden), Log-Alarme `PAYMENT_DISPUTED`, `PRICE_MISMATCH`, `CANCELLATION_CONFIRMATION_NOT_SENT`.
- Geplanter Abgleich (`reconcile-stripe.mjs`) täglich als Workflow (O9).
- Vor jeder Migration: `supabase db dump`, Migration zuerst im Entwicklungsprojekt.
- Schlüsselrotation: Stripe Restricted Key und `whsec_` (zwei `v1`-Signaturen werden während der Rotation akzeptiert), Supabase Secret Key – jeweils neues Secret setzen, Workflow starten, alten Schlüssel widerrufen.
- Rückweg: `konto/config.js` leeren (Seiten sofort aus) bzw. `STRIPE_LIVE_MODE_APPROVED=false` (Abrechnung sofort 503, bestehende Abos laufen bei Stripe weiter, Webhooks werden nach Wiedereinschalten von Stripe nachgeliefert).

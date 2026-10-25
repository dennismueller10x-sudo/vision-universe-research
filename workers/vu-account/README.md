# vu-account

Konto- und Abo-API (Cloudflare Worker). Architektur: [docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md](../../docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md) ·
Einrichtung: [docs/accounts/SETUP.md](../../docs/accounts/SETUP.md) · Entscheidung: [ADR-006](../../docs/architecture/ADR-006-accounts-and-billing.md).

| Datei | Aufgabe |
|---|---|
| `src/index.mjs` | Router, Fehlerbehandlung (keine Upstream-Details an Clients) |
| `src/config.mjs` | Umgebung, Testmodus-Sperre, feste Rücksprungpfade |
| `src/http.mjs` | Antworten, CORS, Cookies, CSRF, Körpergrenzen |
| `src/jwt.mjs` | Supabase-Zugriffstoken (ES256/RS256 über JWKS) |
| `src/auth.mjs` | Sitzung, Login, Registrierung (PKCE), Passwort |
| `src/account.mjs` | Profil, Einstellungen, Abo-Übersicht, Export, Löschung |
| `src/billing.mjs` | Tarife, Checkout, Portal, Kündigung, Stripe-Webhook, `requireFeature` |
| `src/cancellation.mjs` | Kündigung § 312k: Eingang, Zuordnung, Ausführung, Postausgang, Cron-Überwachung (auch von `scripts/account/cancellations.mjs` genutzt) |
| `src/mail.mjs` | Brevo-Versand, Kündigungs- und Alarm-E-Mails |
| `src/providers/` | Stripe-Adapter (aktiv), Apple/Google (vorbereitet) |
| `src/supabase.mjs`, `src/stripe.mjs` | Clients ohne SDK |

```bash
node --test workers/vu-account/tests/unit.test.mjs                       # ohne Datenbank
PG_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  node --test workers/vu-account/tests/flows.test.mjs                    # Ende-zu-Ende
PG_TEST_URL=… node scripts/account/dev-server.mjs                        # http://localhost:8790/__dev/
```

Ausrollen nur über den Workflow „Konten — vu-account ausrollen (Entwicklung)“ (manuell, Live-Schlüssel werden abgelehnt). Echte
Entwicklungszugänge: [docs/accounts/DEV_ENVIRONMENT.md](../../docs/accounts/DEV_ENVIRONMENT.md). Cron alle 10 min: Postausgang, Fristen, Alarm.

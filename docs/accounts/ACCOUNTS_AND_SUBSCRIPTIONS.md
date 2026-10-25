# Konten und Abonnements – Architektur

**Stand:** 25.10.2026 · Branch `claude/vision-universe-auth-subscriptions-j5ewxe` · Entscheidung: [ADR-006](../architecture/ADR-006-accounts-and-billing.md)
Einrichtung: [SETUP.md](SETUP.md) · Live-Freigabe: [LIVE_RELEASE.md](LIVE_RELEASE.md)

**Zustand im Repository:** vollständig gebaut und getestet, **ausgeschaltet**. `konto/config.js` hat keinen Endpunkt, der Worker ist nicht ausgerollt,
die Registrierung ist geschlossen, Stripe-Live-Schlüssel werden abgelehnt. Es gibt keine Verbindung zu echten Konten oder Zahlungen.

---

## 1. Ausgangslage (Phase 1, gemessen im Repository)

| Thema | Befund | Folge |
|---|---|---|
| Hosting | GitHub Pages (`pages-release.yml`), statisch, kein App-Server | Konto-Logik kann nicht in Pages laufen; die Seiten unter `/konto/` sind statisch, die Logik liegt in einem Worker |
| Serverfunktionen | Vercel (`api/`, drei Funktionen, **Hobby-Plan: nicht für kommerzielle Nutzung**), Cloudflare Workers (`worker/`, `workers/vu-ask`, Social) mit Tests und Deploy-Workflows | **Cloudflare Worker** für Konten/Abrechnung (Free: 100.000 Anfragen/Tag, kommerziell erlaubt, gleiche Muster wie `vu-ask`) |
| Frontend | kein Framework, kein Bundler, UMD-Module, gemeinsame Shell `assets/site-navigation.{js,css}` mit `--vu-*`-Tokens, Hell/Dunkel über `vu-discover-theme-v1` | Kontoseiten nutzen die Shell **unverändert** und nur die vorhandenen Tokens; keine Bibliothek, kein Supabase-SDK im Browser |
| Abhängigkeiten | Node 22 ohne Pakete | Worker ohne SDK: Supabase (GoTrue, PostgREST) und Stripe per `fetch`, Kryptografie über Web Crypto |
| Zugangssperre | clientseitige Passwortmaske über **jede** HTML-Seite des Release (`scripts/access-gate/build.mjs`) | `/konto/` liegt automatisch hinter derselben Maske; nichts daran geändert |
| Nutzerdaten | nur `localStorage`; Schema vorbereitet: `core/contracts/user-data.schema.json` (Profil, Präferenzen, Watchlists, Entitlements `free/plus/pro`) | Datenbankmodell folgt diesem Schema |
| App-Weg | ADR-004: PWA → `/v1/`-API → Expo | Worker spricht Cookie (Web) **und** `Authorization: Bearer` (App) |
| Sicherheit | SECURITY_REVIEW: keine Live-Schlüssel im Code; Workflows mit `permissions`, gepinntem `wrangler@4.147.0` | gleiche Regeln für die neuen Workflows |

Produktwelten, Menüs, Charts, Datenpipelines, Designs und Deployments sind **nicht** verändert. Die globale Navigation enthält bewusst keinen Konto-Eintrag (Owner-Entscheidung vor dem Start).

## 2. Architektur

```
 research.visionuniverse.de (GitHub Pages, hinter der Research-Passwortmaske)
   /konto/  anmelden · registrieren · passwort · passwort-neu · (Übersicht)
            abo · tarife · einstellungen · kuendigen
   konto/account-api.js  fetch(credentials:"include", X-VU-Client: web) – hält KEIN Token
                │  HTTPS, gleiche Site (visionuniverse.de)
                ▼
 account.visionuniverse.de  (Cloudflare Worker workers/vu-account, Backend-for-Frontend)
   Sitzung: HttpOnly-Cookies __Host-vu_at / __Host-vu_rt (Secure, SameSite=Lax)
   CSRF: Origin-Positivliste + Pflichtkopf · JWT-Prüfung ES256 über JWKS
   /v1/auth/*  /v1/me*  /v1/plans  /v1/billing/*  /v1/entitlements/check
        │                         │                          │
        ▼                         ▼                          ▼
 Supabase Auth (GoTrue)    Supabase Postgres (RLS)     Stripe (Checkout, Portal,
 Identität, E-Mail,        Profile, Einstellungen,     Webhooks → /v1/billing/webhook/stripe)
 PKCE, Passwort-Reset      Rollen, Tarife, Abos,
                           Rechnungen, Ereignisse
```

**Warum ein Backend-for-Frontend statt Supabase-JS im Browser:** Kein Token in `localStorage` (XSS kann keine Sitzung stehlen), kein
Drittanbieter-Skript in den Seiten, ein Ursprung für CORS, und dieselbe API bedient später die App (Bearer). Supabase bleibt die zentrale
Identitätsverwaltung: Registrierung, Bestätigung, Passwort, Sitzungen, Tokens kommen ausschließlich aus Supabase Auth.

**Warum eine eigene Subdomain:** Cookies von `*.workers.dev` wären im Kontext von `research.visionuniverse.de` Drittanbieter-Cookies und
werden von Safari/Firefox blockiert. `account.visionuniverse.de` ist dieselbe Site → First-Party, `SameSite=Lax` funktioniert (DNS-Schritt D1).

### Abläufe

| Ablauf | Weg |
|---|---|
| Registrierung | `POST /v1/auth/signup` → Supabase `/signup` mit PKCE-Challenge; Prüfwert im HttpOnly-Cookie (1 h). Nur wenn `VU_REGISTRATION_ENABLED=true` oder Adresse auf der Positivliste. Gleiche Antwort für bestehende Adressen. |
| E-Mail-Bestätigung | Link → Supabase `/verify` → `account…/v1/auth/callback?flow=signup&code=…` → Code-Tausch mit Prüfwert → Sitzungs-Cookies → Weiterleitung auf **feste** Seite `/konto/?status=verified`. Anderes Gerät: Adresse ist bestätigt, Hinweis „bitte anmelden“. |
| Login | `POST /v1/auth/login` → Passwort-Grant → Cookies. Kein Token im Antworttext. Unbekannte Adresse und falsches Passwort antworten gleich. |
| Sitzung | Zugriffstoken max. 1 h, Erneuerung still über Refresh-Cookie (Supabase rotiert, alte Tokens sind wertlos), 30 Tage gleitend. |
| Passwort vergessen | `POST /v1/auth/recover` (immer 202) → Link → Callback `flow=recovery` → `/konto/passwort-neu/`. In den ersten 15 Minuten einer Recovery-Sitzung (`amr`) kein altes Passwort nötig, sonst Pflicht. |
| Checkout | `POST /v1/billing/checkout {price:"plus_month"}` → Preis aus `plan_prices` (nie vom Client) → bestehendes gültiges Abo? → 409 → Stripe-Kunde (idempotent, mit Nutzer verknüpft **bevor** bezahlt wird) → Checkout-Sitzung (Idempotenzschlüssel je Nutzer/Preis/10 min) → Weiterleitung nur zu `https://checkout.stripe.com`. |
| Zahlungsbestätigung | Webhook → Signatur (HMAC-SHA256, 300 s Toleranz, konstante Zeit) → Idempotenz (`billing_claim_event`) → **aktueller Zustand wird bei Stripe abgerufen** (Nutzlast nur Hinweis) → `billing_apply_subscription` (Kunde→Nutzer aus eigener Tabelle, Preis→Tarif, Modus, Reihenfolge). |
| Tarifwechsel, Zahlungsmethode, Adresse | Stripe Customer Portal (`POST /v1/billing/portal`) → Änderungen kommen als Webhook zurück. |
| Kündigung | Kündigungsbutton `/konto/kuendigen/`: angemeldet → `cancel_at_period_end` sofort bei Stripe + Eingangsbestätigung; ohne Anmeldung → Eingang in `billing.cancellation_requests` mit Bestätigungsnummer (§ 312k BGB). |
| Fehlgeschlagene Zahlung | Stripe `past_due` → Zugang bleibt bis Periodenende + 7 Tage (Stripe versucht erneut), `unpaid` → kein Zugang; Seite zeigt Hinweis „Zahlungsmethode aktualisieren“. |
| Rechnungen | `invoice.*`-Webhooks → `public.invoices` (nur https-Links von Stripe), Anzeige unter `/konto/abo/`. |
| Datenexport | `GET /v1/me/export` (Art. 15/20 DSGVO), JSON-Download. |
| Kontolöschung | Passwort + „LÖSCHEN“ → laufende Stripe-Abos **sofort** beenden → Löschnachweis (nur Hash) → Supabase-Admin-Löschung → Cascade: Profil, Einstellungen, Rollen, Watchlists; Abos/Rechnungen bleiben **pseudonym** (§ 147 AO, § 257 HGB). |

## 3. Datenmodell (Supabase, `supabase/migrations/`)

| Tabelle | Inhalt | Browser darf | Schutz |
|---|---|---|---|
| `public.profiles` | Anzeigename, Sprache | eigene Zeile lesen; `display_name`, `locale` ändern | RLS + Spaltenrechte |
| `public.user_settings` | Währung, Darstellung, Erfahrung, Benachrichtigungen (Standard aus), Marketing-Einwilligung (Standard aus) | eigene lesen/ändern (Positivliste der Spalten) | RLS + CHECK auf erlaubte Ereignisarten |
| `public.user_roles` | `user`, `admin` | eigene lesen | Schreiben nur Server; `is_admin()` als `security definer` |
| `public.plans`, `features`, `plan_features`, `plan_prices` | Tarifkatalog, Funktionen mit Grenzen, Preise je Anbieter | lesen (auch anonym) | kein Schreibrecht |
| `public.subscriptions` | anbieterunabhängiger Abozustand | eigene lesen | Schreiben nur über `billing_apply_subscription` |
| `public.invoices` | Rechnungen | eigene lesen | Schreiben nur über `billing_apply_invoice` |
| `public.watchlists`, `watchlist_items` | vorbereitet; `instrument_id ~ '^vu_[a-f0-9]+$'` (ADR-001) | eigene CRUD | Tarifgrenzen per Trigger **in der Datenbank** |
| `billing.customers` | Anbieter-Kunde ↔ Nutzer (1:1 je Anbieter) | – | Schema nicht freigegeben |
| `billing.payment_events` | Idempotenz, ohne Nutzlast | – | |
| `billing.entitlement_overrides` | manuelle Freigaben (Presse, Kulanz) | – | |
| `billing.account_deletions`, `billing.cancellation_requests` | Nachweise | – | |

Supabase vergibt im Schema `public` zunächst **alle** Rechte an `anon` und `authenticated`; die Migrationen nehmen sie zurück und vergeben nur
die Spaltenrechte oben. Die Tests laufen gegen genau diese Standardrechte (`supabase/local/platform-stub.sql`).

### Anbieterunabhängiges Abo-Modell (Phase 4)

| Begriff | Feld |
|---|---|
| Benutzer-ID | `auth.users.id` (einzige Identität) |
| Tarif-ID | `plans.id` – wird **nur** aus `plan_prices(provider, provider_price_id)` abgeleitet |
| Zahlungsanbieter | `billing_provider`: `stripe`, `apple`, `google`, `manual` |
| Externe Abo-ID | `subscriptions(provider, provider_subscription_id)` eindeutig |
| Status und Laufzeit | kanonischer Status (`incomplete … revoked`), `current_period_*`, `grace_until`, `cancel_at_period_end` |
| Funktionsberechtigungen | `effective_entitlements(user)`: **höchster** Tarif aus allen gültigen Abos und Freigaben, sonst `free` – genau ein Ergebnis |
| Zahlungsereignisse | `billing.payment_events(provider, provider_event_id)` |

Jeder Anbieter liefert nur einen normalisierten Schnappschuss (`workers/vu-account/src/providers/`). Stripe ist angeschlossen; Apple
(App Store Server Notifications V2) und Google (RTDN + `subscriptionsv2`) sind als Normalisierer mit Tests vorbereitet, die
Endpunkte antworten bis zur Signaturprüfung mit 501.

**Doppelabos:** (1) Checkout wird abgewiesen, solange irgendein Anbieter ein gültiges Abo meldet; (2) ein Kunde je Nutzer und Anbieter;
(3) Idempotenzschlüssel gegen Doppelklick; (4) tritt trotzdem ein zweites gültiges Abo auf (z. B. Web + App Store), wird es gespeichert,
im Log als `DUPLICATE_ENTITLING_SUBSCRIPTION` gemeldet und in `billing.entitlement_conflicts` gelistet – die Berechtigung bleibt eindeutig.
Erstattung bleibt eine menschliche Entscheidung.

**Zugangsregel** (eine Regel, in SQL `subscription_grants_access` und im Worker gleich, ein Test vergleicht 231 Fälle):
`active`/`trialing` bis Periodenende + 2 Tage (Webhook-Verzug) · `past_due`/`in_grace_period` bis `grace_until`, sonst Periodenende + 7 Tage · alles andere: kein Zugang.

### Tarife (Vorschlag, Owner-Entscheidung)

| | Free | Plus | Pro |
|---|---|---|---|
| Preis (brutto, Seed) | 0 € | 9,90 €/Monat · 99 €/Jahr | 19,90 €/Monat · 199 €/Jahr |
| Watchlists × Titel | 1 × 20 | 5 × 100 | 25 × 500 |
| AI-Atlas-Fragen/Tag | 3 | 20 | 100 |
| Quant-Screener ganzes Universum, Benachrichtigungen | – | ✓ | ✓ |
| Supertrader-Signale, CSV-Export | – | – | ✓ |

Die Funktionen sind Katalogeinträge. **Keine bestehende Produktwelt prüft sie heute**; Premium-Freischaltungen in Quant, Supertrader oder
Ask sind eigene, spätere PRs je Produkt (Gates aus `CLAUDE.md`).

## 4. Serverseitige Berechtigungsprüfung

Die Produktseiten sind statisch; was dort ausgeliefert wird, ist für jeden lesbar, der die Passwortmaske passiert. **Eine Premium-Funktion ist
deshalb erst geschützt, wenn ihre Daten über eine Serverfunktion kommen**, die prüft:

- im Worker: `requireFeature(ctx, 'export.csv')` (`src/billing.mjs`) → 402 `FEATURE_NOT_IN_PLAN`,
- als API: `GET /v1/entitlements/check?feature=…` (für andere Worker/Dienste mit dem Nutzer-JWT),
- in der Datenbank: Trigger wie `enforce_watchlist_limits` (Beispiel: Watchlist-Grenzen gelten auch, wenn jemand die API direkt anspricht).

Eine reine Ausblendung im Browser ist nur Darstellung, nie Schutz.

## 5. Sicherheit (Phase 6) – Nachweise

| Anforderung | Umsetzung | Beleg (Test) |
|---|---|---|
| Keine geheimen Schlüssel öffentlich | Secrets nur als Worker-Secret; Browser kennt nur den Worker-Endpunkt (nicht einmal den Supabase-Publishable-Key); Scanner `scripts/account/assert-no-billing-secrets.mjs` in CI | `unit: Geheimnis-Scanner` |
| Serverbasierte Premium-Prüfung | `effective_entitlements` in Postgres, `requireFeature` im Worker | `03_billing.sql`, `04_watchlists.sql`, `flows: Tarife, Checkout …` |
| Kein Zugriff auf fremde Nutzerdaten | RLS auf jeder Tabelle, Spaltenrechte, Supabase-Standardrechte zurückgenommen; Worker liest Nutzerdaten **mit dem JWT des Nutzers** | `01_accounts_rls.sql`, `flows: Profil … RLS`; Gegenprobe: Policy `using (true)` → Test rot |
| Sichere Weiterleitungen | Callback leitet nur auf feste Pfade; Login-`next` nur eigene Pfade; Zahlungsseiten nur `https://checkout|billing.stripe.com` | `flows: … kein offener Redirect`, `konto: Weiterleitung nur zu Stripe` |
| Sichere Authentifizierung | PKCE, HttpOnly/Secure/SameSite=Lax/`__Host-`, CSRF (Origin + Pflichtkopf), Refresh-Rotation, `alg:none`/HS256 abgelehnt, Aussteller/Audience/Rolle/Ablauf geprüft, Passwortregeln (10–72 Byte, 3 Klassen), Ratenbegrenzung | `unit: Zugriffstoken …`, `unit: Cookies …`, `flows: Sitzung …` |
| Webhook-Signatur | HMAC-SHA256 über Rohkörper, Toleranz 300 s, konstante Zeit, mehrere `v1` (Rotation) | `unit: Stripe-Signatur`, `flows: Webhook …`; Gegenprobe: Prüfung entfernt → 3 Tests rot |
| Manipulation des Zahlungsstatus | Client schreibt nie Status; Webhook-Nutzlast wird nicht übernommen, Zustand frisch von Stripe; Nutzer nur über verknüpften Kunden; Metadaten-Widerspruch → abgelehnt; unbekannter Preis → abgelehnt; Testmodus-Preis ≠ Live-Ereignis | `flows: … manipulierte Metadaten`, `03_billing.sql` |
| Doppelte Webhooks, Reihenfolge | `billing_claim_event` (process/duplicate/in_progress), `provider_state_at` | `03_billing.sql`, `flows: Webhook: doppelt …` |
| Datensparsamkeit, DSGVO | keine E-Mail außerhalb `auth.users`, keine Ereignis-Nutzlast, Benachrichtigungen/Marketing standardmäßig aus, Export, Löschung mit Pseudonymisierung der Buchhaltungsdaten | `flows: Datenexport und Kontolöschung` |
| Trennung Entwicklung/Produktion | zwei Supabase-Projekte, Stripe Test/Live, GitHub-Umgebung `account-dev`; Live-Schlüssel ohne `STRIPE_LIVE_MODE_APPROVED` → 503; Deploy-Workflow lehnt Live-Schlüssel ab | `unit: Konfiguration`, `flows: Live-Schlüssel ohne Freigabe` |
| Kein öffentlicher Registrierungsprozess | `VU_REGISTRATION_ENABLED=false` (Standard), Positivliste für Tests; Seiten ohne Endpunkt deaktiviert | `flows: Registrierung geschlossen …`, `konto: Konten sind im Repository AUS` |

Offene, bewusst nicht gelöste Punkte: siehe §9.

## 6. DSGVO

- **Rollen:** Vision Universe ist Verantwortlicher; Supabase, Cloudflare, Stripe (für Zahlungsdaten eigenständig verantwortlich bzw. Auftragsverarbeiter je nach Funktion) und der E-Mail-Versender (Brevo) brauchen AV-Verträge/DPA. Supabase-Region **EU (Frankfurt, `eu-central-1`)** wählen.
- **Gespeichert:** E-Mail, Passwort-Hash (Supabase), Anzeigename (optional), Einstellungen, Rollen, Abo-Zustand, Rechnungsmetadaten, Zeitpunkt der Bedingungszustimmung. **Nicht gespeichert:** Karten-/Kontodaten (nur bei Stripe), IP-Adressen (nur flüchtig für Ratenbegrenzung; Supabase-Auth-Logs nach dessen Aufbewahrung).
- **Rechte:** Auskunft/Übertragbarkeit (`/v1/me/export`), Berichtigung (Einstellungen), Löschung (`/v1/me/delete`), Widerspruch Marketing (Einstellung).
- **Aufbewahrung:** Rechnungen pseudonym 10 Jahre (§ 147 AO, § 257 HGB; Buchungsbelege seit 2025 8 Jahre – steuerlich prüfen). Kündigungseingänge: Nachweis, Löschfrist festlegen (Vorschlag 3 Jahre, Verjährung).
- **Datenschutzerklärung:** `landing/datenschutz/` steht auf „Entwurf“ und muss vor der Freigabe um Konto, Supabase, Cloudflare, Stripe, Brevo ergänzt werden.

## 7. Zahlungsmethoden in Deutschland (Stripe Checkout, Abo-Modus)

| Methode | Wiederkehrend über Stripe | Hinweis |
|---|---|---|
| Kreditkarte (Visa, Mastercard, Amex) | ja | Standard; 3-D Secure bei Erstzahlung |
| Apple Pay | ja | Wallet auf Kartenbasis; im Stripe-gehosteten Checkout ohne eigene Domain-Verifizierung |
| Google Pay | ja | wie Apple Pay |
| PayPal | ja, für Stripe-Konten in DE | **wiederkehrende Zahlungen brauchen ggf. eine Freigabe** im Dashboard; Gebühren stehen nicht auf der Stripe-Preisseite – vor Aktivierung prüfen |
| SEPA-Lastschrift | ja (Checkout, Abos, Portal) | 0,35 €/Zahlung; Bestätigung erst nach Tagen, Rückbuchung bis 8 Wochen → läuft über `invoice.payment_failed`/`past_due` |
| Klarna | Checkout-Abos möglich (je Land/Option) | nicht im Kundenportal |
| Link (Stripe) | ja | |
| giropay / Sofort | nein | eingestellt bzw. nicht für Abos |

Aktiviert werden Methoden **im Stripe-Dashboard** (dynamische Zahlungsmethoden), der Code legt keine fest.

## 8. Rechtliche Pflichtpunkte vor dem Start (Prüfung durch Rechtsberatung)

- **Kündigungsbutton § 312k BGB:** umgesetzt als `/konto/kuendigen/` (beschriftet „Verträge hier kündigen“ / „Jetzt kündigen“, auch ohne Anmeldung, sofortige Bestätigung mit Zeitpunkt und Nummer). **Offen:** (a) die Schaltfläche muss *ständig verfügbar* sein – das verlangt einen Link in Fußzeile/Menü aller Seiten, also eine Änderung der globalen Shell (Owner-Freigabe nötig); (b) die Bestätigung muss zusätzlich per **E-Mail** (dauerhafter Datenträger) erfolgen – braucht den E-Mail-Versand (Brevo, §9); (c) bei außerordentlicher Kündigung ein Feld für den Grund.
- **Button-Lösung § 312j BGB:** Der Bestell-Button liegt bei Stripe Checkout (Abo-Modus, deutsch „Abonnieren“). Rechtlich prüfen lassen; alternativ eingebetteter Checkout mit eigenem Button „zahlungspflichtig abonnieren“.
- **Widerrufsrecht** bei digitalen Inhalten/Dienstleistungen: Belehrung, Muster-Widerrufsformular, ggf. Zustimmung zum vorzeitigen Beginn (`consent_collection` – Schalter `STRIPE_CHECKOUT_REQUIRE_TERMS`).
- **AGB/Nutzungsbedingungen** existieren noch nicht (Registrierung verweist auf „Nutzungsbedingungen“ als Entwurf, `termsVersion: entwurf-2026-10`).
- **Preisangaben (PAngV):** Endpreise inkl. MwSt. – Beträge in `plan_prices` sind **brutto** zu pflegen.
- **Umsatzsteuer:** B2C-Digitalleistungen in andere EU-Länder: Steuersatz des Kundenlands (OSS) ab 10.000 € EU-Umsatz. Optionen: Stripe Tax (0,5 % je Transaktion) oder zunächst nur Deutschland. Steuerberatung.

## 9. Offene Punkte

| # | Punkt | Wer |
|---|---|---|
| O1 | Konten/Projekte anlegen, Schlüssel, DNS – [SETUP.md](SETUP.md) | Owner |
| O2 | E-Mail-Versand für Supabase Auth: eigenes SMTP (Brevo, im Haus) – der eingebaute Versand erlaubt nur **2 E-Mails/Stunde** | Owner (S4) |
| O3 | Kündigungsbestätigung per E-Mail und Abarbeitung der Kündigungseingänge ohne Anmeldung (Zuordnung zum Vertrag) | eigener PR, nach O2 |
| O4 | Link „Verträge hier kündigen“ und „Anmelden“ in der globalen Shell | Owner-Entscheidung, eigener Shell-PR (Shell-QA) |
| O5 | Rechtstexte: AGB, Widerruf, Datenschutzerklärung | Owner/Rechtsberatung |
| O6 | Apple/Google: Signaturprüfung und Endpunkte anschließen | eigener PR, wenn die App kommt |
| O7 | Premium-Durchsetzung in den Produkten (Daten über geprüfte Endpunkte) | je Produkt eigener PR |
| O8 | Admin-Oberfläche (Freigaben, Konflikte, Kündigungseingänge) – heute SQL im Supabase-Dashboard | später |
| O9 | Abgleich `reconcile-stripe.mjs` als geplanter Workflow (täglich) | mit Live-Freigabe |
| O10 | Prüfen, ob `visionuniverse.de` in Cloudflare liegt (für `account.`-Subdomain) | Owner (D1) |

## 10. Betriebskosten (Schätzung, Preise Stand Oktober 2026)

Quellen: supabase.com/pricing, stripe.com/de/pricing, developers.cloudflare.com/workers/platform/pricing.

| Posten | Free-Grenze | Bedarf Beta (≤ 500 Konten) | Bedarf 5.000 Konten | Kosten |
|---|---|---|---|---|
| Supabase | 50.000 MAU, 500 MB DB, 5 GB Egress, 2 aktive Projekte; **pausiert nach 1 Woche Inaktivität, keine Backups** | < 1 % der Grenzen | ~10 % MAU, < 50 MB | Entwicklung: **0 €**. Produktion mit zahlenden Kunden: **Pro, ab 25 $/Monat** (keine Pause, tägliche Backups 7 Tage) |
| Cloudflare Workers | 100.000 Anfragen/Tag, 10 ms CPU | ~5.000/Tag | ~50.000/Tag | **0 €** (ab Dauerlast > 100k/Tag: 5 $/Monat) |
| Stripe | keine Grundgebühr | | | je Zahlung: EWR-Karte 1,5 % + 0,25 €, SEPA 0,35 €, + **Billing 0,7 %**; optional Stripe Tax 0,5 % |
| E-Mail (Brevo) | 300 E-Mails/Tag | < 50/Tag | ~200/Tag | **0 €** |
| DNS / Subdomain | Cloudflare | | | 0 € (falls Zone bei Cloudflare) |

Beispiel je Zahlung (Plus): **monatlich 9,90 € per Karte ≈ 0,47 € (4,7 %)**, per SEPA ≈ 0,42 €; **jährlich 99 € per Karte ≈ 2,43 € (2,5 %)**.
Fixkosten: **0 €** in Entwicklung, **≈ 23–25 €/Monat** ab Produktion (Supabase Pro), solange die übrigen Free-Grenzen halten.

## 11. Tests

| Suite | Befehl | Inhalt |
|---|---|---|
| SQL (echtes PostgreSQL) | `PG_TEST_URL=… node scripts/account/sql-tests.mjs` | 4 Dateien: RLS, Spaltenrechte, Katalog, Abrechnungslogik, Idempotenz, Löschung, Watchlist-Grenzen |
| Worker, Einheit | `node --test workers/vu-account/tests/unit.test.mjs` | Signatur, JWT, Adapter, Konfiguration, Cookies, Eingaben, Scanner |
| Ende-zu-Ende | `PG_TEST_URL=… node --test workers/vu-account/tests/flows.test.mjs` | 17 Abläufe: Browser → Worker → simuliertes Supabase/Stripe → echtes PostgreSQL |
| Kontoseiten | `node --test konto/tests/*.test.mjs` | Client, Weiterleitungen, Seitenstruktur |
| Browser | `node scripts/account/dev-server.mjs` + `node scripts/account/browser-qa.mjs` | ganzer Weg in Chromium, Mobil hell/dunkel, Überlauf, 16-px-Eingaben, 44-px-Ziele |

Lokale Umgebung zum Durchklicken: `PG_TEST_URL=… node scripts/account/dev-server.mjs` → `http://localhost:8790/__dev/` (simuliertes Postfach,
Checkout mit „erfolgreich/abgelehnt“, Kundenportal mit Tarifwechsel, Zahlungsausfall, Kündigung; alle Ereignisse werden signiert zugestellt).
Ein PostgreSQL genügt: `docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17`.

## 12. Migrationen und Backup

- **Schema** liegt versioniert in `supabase/migrations/` (Supabase-CLI-Format). Einspielen: `supabase db push` gegen das Entwicklungsprojekt, nach Test gegen Produktion; nie Änderungen nur im Dashboard.
- **Backups:** Supabase Pro täglich (7 Tage); zusätzlich vor jeder Migration `supabase db dump` (verschlüsselt ablegen). Point-in-Time-Recovery als Zusatzoption ab Wachstum.
- **Wiederherstellung der Abozustände:** Stripe ist führend. `scripts/account/reconcile-stripe.mjs` spielt alle Abos über dieselbe Datenbankfunktion neu ein (Test: Datenverlust simuliert, Zustand vollständig wiederhergestellt, manipulierte/fremde Abos bleiben draußen).
- **Keine Finanz- oder Marktdaten in Supabase** (Auftragsgrenze): Kurse, Fundamentaldaten und Modelle bleiben in der bestehenden Pipeline.

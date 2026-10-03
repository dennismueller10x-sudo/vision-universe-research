# Vision Universe — Konten, Abo und Watchlist-Berichte

Stand: 2026-10-03 · Status: **vorbereitet, abgeschaltet** (`VU_ACCOUNTS_ENABLED` nicht gesetzt)

## Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Verkauf | **Nur App Store und Google Play** (In-App-Abo), angebunden über **RevenueCat** | Apple bzw. Google sind gegenüber dem Kunden der Verkäufer: Umsatzsteuer, Rechnungen, Erstattungen und Kündigung liegen beim Store. Kein Shopify-Abo, kein eigener Zahlungsdienst. |
| Web | Nur **Login**, kein Verkauf | Wer in der App abonniert, nutzt mit demselben Konto auch das Web. |
| Plan | **Ein Plan** „Premium“, monatlich und jährlich, **7 Tage gratis** (Store-Einführungsangebot) | Einfach. Weitere Pläne sind nur weitere Produkt-IDs auf dieselbe Freischaltung `premium`. |
| Konten und Daten | **Supabase** (EU-Region Frankfurt): Auth + Postgres mit Row-Level-Security | DSGVO, keine eigene Passwort-Verwaltung, Kosten 0 € (Entwicklung) bzw. ca. 25 $ pro Monat (Pro). |
| Server | Vercel-Funktionen `api/me.js`, `api/revenuecat-webhook.js`, `api/premium.js` | Laufen neben den bestehenden Product-Data-Funktionen. Ohne Konfiguration bleiben sie inert. |
| Berichte | Täglicher GitHub-Actions-Lauf; Ereignisse werden **pro Aktie** berechnet, nicht pro User | 10.000 User mit derselben Nvidia kosten eine Berechnung. |

## Architektur

```
 iPhone/Android-App ──(Kauf)──> App Store / Google Play ──> RevenueCat
        │                                                      │ Webhook
        │ Login (Supabase Auth)                                ▼
        ├──────────────> Supabase  <──(Service-Key)── /api/revenuecat-webhook
 Web /konto/ ──────────> (Auth, Postgres, RLS)                 holt Kundenstand von RevenueCat,
        │                     ▲                                schreibt public.entitlements
        │ Bearer-Token        │
        └──> /api/me, /api/premium ──(Service-Key)──┘
                              ▲
 GitHub Actions (täglich) ────┘  scripts/accounts/run-watchlist-reports.mjs
   News · 13F-Trades · Quant-Scores · Analystenkonsens · Supertrader-Signale
   → symbol_digests (je Aktie) → user_reports (je User) → E-Mail (Resend)
```

**Grundregel:** Jeder Zahlungsweg schreibt nur in **eine** Tabelle, `public.entitlements`. App und Web fragen nur: „Hat dieser User Premium?“ Kommt später ein weiterer Weg hinzu (z. B. Web-Kasse), ist das ein weiterer Webhook in dieselbe Tabelle, kein Umbau.

## Bestandteile im Repository

| Pfad | Inhalt |
|---|---|
| `supabase/migrations/20261003000000_accounts.sql` | Tabellen, Trigger, Row-Level-Security, `has_premium()`. Kann mehrfach ausgeführt werden. Wird nicht über GitHub Pages ausgeliefert. |
| `server/accounts/access.js` | Zugangsregel (identisch zu `has_premium()` in SQL) |
| `server/accounts/revenuecat.js` | Webhook-Prüfung, RevenueCat-Kundenstand → Freischaltung |
| `server/accounts/supabase.js` | Supabase-Client ohne Paketabhängigkeit |
| `server/accounts/http.js` | CORS für Web und Capacitor-App, Bearer-Token, JSON-Body |
| `api/me.js` | `GET`: Konto, Profil, Premium-Status · `DELETE`: Konto löschen |
| `api/revenuecat-webhook.js` | Abo-Ereignisse aus App Store und Google Play |
| `api/premium.js` | Premium-Dateien aus einem **privaten** R2-Bucket, nur mit aktivem Abo |
| `konto/` | Kontoseite: Anmelden, Registrieren, Passwort, Watchlists, Berichte, Einstellungen, Abo-Status, Konto löschen |
| `konto/auth-client.js` | Konto-Client für Web und die spätere App (Capacitor) |
| `scripts/accounts/symbol-digest.mjs` | Ereignisse je Aktie, Bericht je User, E-Mail-Vorlage (reine Logik) |
| `scripts/accounts/run-watchlist-reports.mjs` | Täglicher Lauf (`--dry-run` funktioniert ohne Zugangsdaten) |
| `scripts/accounts/tests/` | 28 Node-Tests sowie SQL-Prüfung der Sicherheitsregeln gegen echten Postgres |
| `.github/workflows/accounts-ci.yml` | CI für alles oben |
| `.github/workflows/accounts-reports.yml` | Täglicher Berichtslauf, aktiv erst mit Variable `VU_ACCOUNTS_ENABLED=true` |

## Datenmodell

| Tabelle | Wer liest | Wer schreibt |
|---|---|---|
| `profiles` | der User selbst | der User selbst (Name, Berichtsfrequenz, E-Mail ja/nein); wird bei der Registrierung automatisch angelegt |
| `watchlists`, `watchlist_items` | der User selbst | der User selbst; max. 20 Listen und 500 Werte je Liste; Tickerformat wie bei der bisherigen lokalen Watchlist |
| `entitlements` | der User selbst | **nur der Server** (RevenueCat-Webhook, Support) |
| `billing_events` | niemand außer dem Server | Webhook, Primärschlüssel = Event-ID → jedes Event wird nur einmal verarbeitet |
| `symbol_snapshots` | niemand außer dem Server | Berichtsjob, letzter Stand je Aktie zum Vergleich |
| `symbol_digests` | User **mit Premium** | Berichtsjob |
| `user_reports` | der User selbst (darf nur „gelesen“ setzen) | Berichtsjob |

Konto löschen (`DELETE /api/me` oder Supabase-Dashboard) entfernt per `ON DELETE CASCADE` alle Zeilen des Users (DSGVO Art. 17). **Ein laufendes Store-Abo wird dadurch nicht gekündigt**; das kann nur der Kunde in den Abo-Einstellungen von Apple bzw. Google. Die Kontoseite weist darauf hin.

### Abo-Status

| Status | Bedeutung | Zugang |
|---|---|---|
| `trial` | 7-Tage-Testphase | ja |
| `active` | bezahlt, verlängert sich | ja |
| `cancelled` | Verlängerung abgeschaltet, bezahlter Zeitraum läuft noch | ja, bis `expires_at` |
| `billing_issue` | Zahlung beim Store fehlgeschlagen, Store versucht es erneut | ja, bis `expires_at` |
| `grace` | abgelaufen, aber Kulanzfrist des Stores läuft | ja, bis `grace_expires_at` |
| `expired` | abgelaufen | nein |
| `revoked` | erstattet | nein |

Warum der Webhook nicht direkt aus dem Event schreibt, sondern bei jedem Event den aktuellen Kundenstand von RevenueCat holt: Events können doppelt, verspätet und in falscher Reihenfolge kommen. Der Kundenstand ist immer aktuell; dasselbe Event zweimal ergibt dieselbe Zeile.

## Watchlist-Berichte

Quellen, alle schon im Repository:

| Art | Quelle | Wann ist es ein Ereignis? |
|---|---|---|
| News | `dashboard/data/news_feed.json` | Meldung mit Ticker |
| Hedgefonds | `hedgefonds/data/funds/*.json` | 13F-Meldung **nach** dem letzten Lauf eingereicht: neu gekauft, aufgestockt, reduziert, komplett verkauft (ab 1 Mio. $, keine Optionen) |
| Quant | `dashboard/data/fundamental_scores.json` | Score ändert sich um mindestens 5 Punkte gegenüber dem letzten Lauf |
| Analysten | `dashboard/data/analyst_ratings.json` | Konsens wechselt |
| Signale | `supertrader/data/signals.json` | Neuer Signalzustand je Strategie (Setup, Einstieg bereit, Warnung, Ausstieg …) |

- **Täglich** um 07:43 UTC (nach Hedgefonds- und Signal-Läufen). Berichte gibt es täglich oder wöchentlich (montags, Zeitraum 7 Tage), je nach Profil-Einstellung.
- Nur **Premium-User** mit mindestens einem Watchlist-Wert bekommen einen Bericht.
- Der erste Lauf legt nur den Ausgangsstand fest; Score- und Signaländerungen gibt es ab dem zweiten Lauf.
- Ein Wiederholungslauf am selben Tag erzeugt weder doppelte Berichte noch doppelte E-Mails.
- E-Mail nur an bestätigte Adressen, nur wenn der Bericht nicht leer ist, jede Mail mit Abmelde-Link und „Keine Anlageberatung“.

## Einrichtung, Schritt für Schritt

### 1. Supabase

1. Projekt anlegen unter supabase.com, **Region: Central EU (Frankfurt)**.
2. SQL Editor → Inhalt von `supabase/migrations/20261003000000_accounts.sql` ausführen.
3. Authentication → URL Configuration:
   - Site URL `https://research.visionuniverse.de/konto/`
   - Redirect URLs: dieselbe, plus später das App-Schema, z. B. `de.visionuniverse.app://konto`
4. Authentication → Providers → Email: **Confirm email** an, Mindestlänge Passwort **10**.
5. Authentication → SMTP: eigenen Absender eintragen (z. B. über Resend). Der eingebaute Versand von Supabase ist stark limitiert.
6. Später für die App: **Sign in with Apple** aktivieren. Apple verlangt ihn, sobald eine App andere Social-Logins anbietet.

### 2. Vercel (Environment Variables, Production)

| Variable | Wert |
|---|---|
| `VU_ACCOUNTS_ENABLED` | `true` |
| `SUPABASE_URL` | `https://<projekt>.supabase.co` |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon/public |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role (**geheim**) |
| `REVENUECAT_WEBHOOK_AUTH` | selbst gewählter langer Zufallswert inkl. `Bearer `, identisch in RevenueCat eingetragen |
| `REVENUECAT_API_KEY` | RevenueCat → API Keys → Secret API key (v1) |
| `REVENUECAT_ENTITLEMENT_ID` | `premium` (Standard) |
| `VU_ACCOUNTS_ACCEPT_SANDBOX` | nur in Preview/Test `true` |
| `VU_PREMIUM_S3_*` | eigener, **privater** R2-Bucket für Premium-Daten (Endpoint, Bucket, Access Key, Secret, optional Prefix) |

**Hinweis:** Der Vercel-Hobby-Plan ist laut Vercel nur für nicht-kommerzielle Nutzung. Mit Bezahl-Abo braucht ihr Vercel Pro.

### 3. GitHub (Settings → Secrets and variables → Actions)

- Variables: `VU_ACCOUNTS_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VU_REPORT_EMAIL_FROM`
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`

### 4. Web-Kontoseite einschalten

In `konto/config.js` `enabled: true`, `supabaseUrl` und `anonKey` eintragen. Der anon key ist bewusst öffentlich; er erlaubt nur, was Row-Level-Security zulässt. Danach den Menüpunkt „Konto“ in `assets/site-navigation.js` ergänzen.

### 5. App Store, Google Play, RevenueCat

1. Apple Developer Program (99 € pro Jahr) und Google Play Console (25 $ einmalig). Apple **Small Business Program** beantragen: 15 % statt 30 % Provision.
2. Abo-Produkte in beiden Stores anlegen, z. B. `vu_premium_monthly`, `vu_premium_yearly`, jeweils mit Einführungsangebot **7 Tage gratis**.
3. RevenueCat: Projekt, beide Apps, Produkte importieren, Entitlement **`premium`** anlegen und beide Produkte zuordnen.
4. RevenueCat → Integrations → Webhooks: URL `https://vision-universe-research.vercel.app/api/revenuecat-webhook`, Authorization-Header = `REVENUECAT_WEBHOOK_AUTH`.
5. In der App nach dem Login `Purchases.logIn(<Supabase-User-ID>)` aufrufen, **vor** jedem Kauf. Nur so landet ein Kauf beim richtigen Konto. Anonyme Käufe werden protokolliert, aber keinem Konto zugeordnet, bis RevenueCat sie per Alias bzw. TRANSFER mit der Konto-ID verbindet.
6. Testkäufe in der Sandbox: Preview-Umgebung mit `VU_ACCOUNTS_ACCEPT_SANDBOX=true`.

### 6. Die App selbst (nächster Schritt)

- Web-App mit **Capacitor** für iOS und Android verpacken; `konto/auth-client.js` funktioniert dort unverändert. Die CORS-Regeln erlauben bereits `capacitor://localhost` und `https://localhost`.
- Kauf-UI mit dem RevenueCat-Capacitor-SDK (Paywall, „Käufe wiederherstellen“-Knopf, Pflichtangaben zu Preis und Laufzeit sowie Links zu Nutzungsbedingungen und Datenschutz im Kaufdialog).
- Apple verlangt, dass ein Konto **in der App gelöscht** werden kann. Das deckt `DELETE /api/me` bereits ab.

## Bezahlschranke: Was noch fehlt

Heute liefert GitHub Pages **alle** Daten öffentlich aus. Die Kontoseite allein schützt also noch nichts. Für echte Premium-Inhalte:

1. Festlegen, welche Daten Premium sind (Vorschlag: Watchlist-Berichte, Supertrader-Signale, Quant-Details, Hedgefonds-Details; frei bleiben Markt-Überblick, Magazin, Academy).
2. Diese Dateien im Release **nicht mehr** nach Pages kopieren, sondern in den privaten R2-Bucket (`VU_PREMIUM_S3_*`) schreiben.
3. Das Frontend lädt sie über `GET /api/premium?path=…` mit Bearer-Token. Ohne Abo gibt es `402 PREMIUM_REQUIRED`, und die Oberfläche zeigt den Hinweis auf die App.
4. Erst dann das bisherige Passwort-Gate (`scripts/access-gate/`) abschalten.

Diese Umstellung betrifft die bestehenden Bereiche einzeln und wird bewusst **nicht** in diesem Schritt gemacht.

## Rechtliches vor dem Start (Anwalt)

- AGB und Datenschutzerklärung, inkl. Auftragsverarbeiter (Supabase, Vercel, Cloudflare, RevenueCat, Resend) und Datenübermittlung in die USA
- Hinweis „Keine Anlageberatung“ (ist in Kontoseite, Berichten und E-Mails enthalten)
- **Marktdaten-Lizenzen für ein bezahltes Produkt** (siehe `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`). Das ist der größte offene Kostenpunkt.
- Kündigungsbutton (§ 312k BGB): Entfällt, solange nur über die Stores verkauft wird; nötig, sobald es eine Web-Kasse gibt.

## Laufende Kosten (Stand 10/2026, vor Abschluss prüfen)

| Posten | Kosten |
|---|---|
| Apple Developer Program | 99 € pro Jahr |
| Google Play Console | 25 $ einmalig |
| Store-Provision | 15 % (Small Business Program bzw. Google-Abos) |
| RevenueCat | kostenlos bis ca. 2.500 $ Umsatz pro Monat, danach 1 % |
| Supabase Pro | ca. 25 $ pro Monat (inkl. 100.000 aktive Nutzer) |
| Vercel Pro | 20 $ pro Benutzer und Monat |
| Resend | bis 3.000 Mails pro Monat kostenlos, sonst ca. 20 $ pro Monat |
| Cloudflare R2 und Workers | 0–5 $ pro Monat |

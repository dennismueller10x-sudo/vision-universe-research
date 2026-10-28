# Konten und Abos – echte Entwicklungsumgebung

> **Historisch (Stand vor dem 28.10.2026).** Es gibt nur noch eine Infrastruktur. Die Workflows „Konten — Entwicklungsumgebung einrichten“ und „Konten — vu-account ausrollen (Entwicklung)“ sind stillgelegt; Abläufe und Freigaben stehen in [FREIGABEN.md](FREIGABEN.md).


Meilenstein: Supabase Free, Stripe-**Testmodus** und Brevo werden echt angeschlossen, isoliert von Produktion. Kein Merge, kein
Produktionsdeployment, keine Live-Zahlung, nichts Kostenpflichtiges. `konto/config.js` bleibt auf `main` leer (Konten aus, kein Footer-Link).

Der Owner meldet sich nur dort selbst an, wo es nicht anders geht (Teil 1). Alles Übrige erledigen Workflows (Teil 2), die mit Probelauf
starten und keine Werte ausgeben. Ausführliche Hintergründe je Dienst: [SETUP.md](SETUP.md).

## Teil 1 – Anmelden und Zugangsdaten hinterlegen (Owner)

Alle Werte nur in **GitHub → Settings → Environments → `account-dev`** (Secrets bzw. Variables), nie ins Repository oder in Chats.
Die Umgebung bekommt „Required reviewers: Owner“, damit jeder Lauf deine Freigabe braucht.

| # | Dienst – was | Ergebnis → GitHub `account-dev` |
|---|---|---|
| 1 | **Supabase:** Projekt anlegen, Name muss `dev` enthalten (`vision-universe-dev`), Region Frankfurt, Plan Free | Variable `VU_ACCOUNT_SUPABASE_URL` = `https://<ref>.supabase.co` |
| 2 | Supabase → Connect → **Session pooler** (IPv4; GitHub-Runner haben kein IPv6) → URI mit DB-Passwort | Secret `VU_ACCOUNT_SUPABASE_DB_URL` |
| 3 | Supabase → Settings → API Keys: Publishable Key; neuer Secret Key „vu-account-worker“ | Secrets `VU_ACCOUNT_SUPABASE_PUBLISHABLE_KEY`, `VU_ACCOUNT_SUPABASE_SECRET_KEY` |
| 4 | Supabase → Account → Access Tokens: Token „vu-dev-setup“ (nach der Einrichtung widerrufen) | Secret `VU_ACCOUNT_SUPABASE_ACCESS_TOKEN` (`sbp_…`) |
| 5 | **Stripe:** Anmelden, oben **Testmodus/Sandbox** wählen. Developers → API keys → Secret key (Test) | Secret `VU_ACCOUNT_STRIPE_SETUP_KEY` (`sk_test_…`, nur für die Einrichtung) |
| 6 | Stripe (Testmodus) → Restricted key „vu-account-worker“: *Write* Customers, Checkout Sessions, Customer portal, Subscriptions; *Read* Prices, Invoices | Secret `VU_ACCOUNT_STRIPE_SECRET_KEY` (`rk_test_…`) |
| 7 | **Brevo:** Domain `visionuniverse.de` authentifizieren (DKIM/DMARC-Einträge in die DNS-Zone), Absender `konto@visionuniverse.de` anlegen und bestätigen | Variable `VU_ACCOUNT_MAIL_SENDER` = `konto@visionuniverse.de` |
| 8 | Brevo → SMTP & API → API Keys: neuer Schlüssel „vu-account-transactional“ | Secret `VU_ACCOUNT_BREVO_API_KEY` |
| 9 | Brevo → SMTP & API → SMTP: Login und neuer SMTP-Schlüssel | Secrets `VU_ACCOUNT_BREVO_SMTP_LOGIN`, `VU_ACCOUNT_BREVO_SMTP_KEY` |
| 10 | **Cloudflare:** API-Token „Edit Cloudflare Workers“ (liegt als Repo-Secret bereits vor; sonst anlegen) | Secret `CLOUDFLARE_API_TOKEN` |
| 11 | **GitHub:** Testadressen und Alarmempfänger | Variablen `VU_ACCOUNT_REGISTRATION_ALLOWLIST`, `VU_ACCOUNT_OPS_ALERT_EMAIL` |
| 12 | Nach dem ersten Ausrollen (Teil 2, Schritt 2): Worker-Adresse als **Repository-Variable** (Settings → Variables → Actions), damit auch die stündliche Überwachung sie sieht | Variable `VU_ACCOUNT_API_ORIGIN` |

Optional, für Tests in Safari/Firefox: liegt `visionuniverse.de` in Cloudflare, in `workers/vu-account/wrangler.toml` die `routes`-Zeile
für `account-dev.visionuniverse.de` aktivieren (eigener Commit); dann ist das die Adresse für Nr. 12.

## Teil 2 – Einrichten (Workflows, nach Teil 1)

Jeder Workflow läuft nur von Hand und nur in `account-dev`. „Konten — Entwicklungsumgebung einrichten“ startet als **Probelauf**
(`dry_run` an): erst ansehen, dann ohne Probelauf wiederholen.

1. **Supabase** – Workflow „Entwicklungsumgebung einrichten“, Schritt `supabase`: spielt `supabase/migrations/*` ein
   (`scripts/account/apply-migrations.mjs`, dieselbe Buchführung wie `supabase db push`), setzt die Positivliste und stellt Auth ein
   (`scripts/account/supabase-auth-config.mjs`): Site-URL, E-Mail-Bestätigung, Passwortregeln, deutsche Vorlagen, SMTP über Brevo und den
   Hook **Before User Created** (Registrierungssperre in der Datenbank). Bricht ab, wenn der Projektname nicht `dev`/`test`/`staging` enthält.
   Lehnt die Management-API ein einzelnes Feld ab, nennt der Lauf es; dann diese eine Einstellung im Dashboard setzen (SETUP.md, S3/S4).
2. **Worker ausrollen** – Workflow „vu-account ausrollen (Entwicklung)“. Ohne Stripe-Webhook bleibt die Abrechnung aus (503). Adresse aus
   dem Protokoll → Teil 1, Nr. 12; dann Schritt 1 erneut (Redirect-URL des Workers wird in Supabase eingetragen).
3. **Stripe** – Schritt `stripe`: Produkte `vu_plus`/`vu_pro`, vier Preise (9,90/99,00/19,90/199,00 € inkl. USt, `lookup_key`),
   Kundenportal (Kündigung zum Laufzeitende, Tarifwechsel, Rechnungen), Webhook auf `<API>/v1/billing/webhook/stripe` mit genau den
   Ereignissen, die der Worker verarbeitet. Preis-IDs gehen nach `plan_prices`; Webhook-Geheimnis und Portal-ID direkt als Worker-Secret –
   sie erscheinen nirgends.
4. **Brevo** – Schritt `brevo`: Schlüssel, Absender und Domain-Authentifizierung (sendet nichts).
5. **Worker erneut ausrollen** (jetzt mit Stripe-Schlüssel), dann Schritt `pruefen` (`scripts/account/dev-doctor.mjs`): Worker, Supabase,
   Stripe und Brevo Ende-zu-Ende. Alles muss `OK` sein.

## Teil 3 – Kündigungen ohne Anmeldung (§ 312k BGB) im Betrieb

`VU_CANCELLATION_AUTO_PROCESS=false` ist verpflichtend: `wrangler.toml` und der Deploy-Workflow setzen es hart, `/v1/health` meldet
`autoProcess`, die Überwachung schlägt an, wenn es nicht `false` ist.

**Die Kündigung ist mit dem Absenden wirksam erklärt.** Nichts hängt von einer weiteren Handlung des Kunden ab: kein Login, kein
Bestätigungslink, keine Pflichtangabe außer Name und Adresse. Rückfragen dienen nur dem Auffinden des Vertrags.

| Zuordnung (`match_method`) | Belegt durch | Bearbeitung |
|---|---|---|
| `signed_in` | Anmeldung | sofort bei Stripe zum Laufzeitende vorgemerkt |
| `email_and_reference` | Kontoadresse **und** Rechnungs-/Abo-Nummer des Kontos | `execute` |
| `email` | Kontoadresse | `execute` – beide E-Mails gehen an genau diese Adresse; der Inhaber kann bis zum Laufzeitende fortsetzen |
| `manual` | andere Adresse; Bearbeiter findet den Vertrag (Rechnungsnummer, Name) | `assign` – zusätzlich geht die Abschlussnachricht an die **Kontoadresse** |
| keine (`no_contract`) | kein Konto/Abo zur Adresse | `no-contract` – Mitteilung mit Bitte um Rechnungsnummer; nach Antwort `assign` |
| außerordentlich, App Store/Play | – | immer `manual_review`: Grund prüfen; fristlos in Stripe von Hand beenden bzw. auf den Store verweisen |

Missbrauch (jemand kündigt fremd): wirkt nur zum Laufzeitende, der Inhaber erhält jede Nachricht an seine Kontoadresse und kann im
Kundenportal fortsetzen. Ausführen darf nur, wer den Workflow in `account-dev` freigeben kann; der Name landet im Vorgang (`processed_by`).

**Werkzeuge:** Workflow „Konten — Kündigungen bearbeiten“ (`list`, `check`, `deliver`, `retry`, `drop`, `execute`, `assign`, `no-contract`; Ausgabe immer
geschwärzt, weil Actions-Protokolle öffentlich sind) bzw. lokal `node scripts/account/cancellations.mjs show <id>` für die vollen Angaben.

**Fehlgeschlagene Bestätigungen werden nicht vergessen:**

1. Jede Bestätigung liegt im Postausgang `billing.mail_outbox` (Eingang, Abschluss, Alarm), wird sofort versucht und bei Fehlern nach
   1/5/15/30/60/120/240 min wiederholt (Cron des Workers alle 10 min); nach 8 Versuchen `dead`. Der Status spiegelt sich in
   `cancellation_requests.confirmation_status`.
2. Der Cron meldet `CANCELLATIONS_NEED_ATTENTION`, sobald ein Vorgang älter als 24 h offen ist, eine Bestätigung über 30 min hängt oder
   `dead` ist, und schickt höchstens stündlich einen Alarm (nur Zahlen) an `VU_OPS_ALERT_EMAIL`.
3. Unabhängig von Brevo prüft der Workflow „Konten — Kündigungen überwachen“ stündlich `/v1/health` und schlägt bei `attention` fehl –
   GitHub benachrichtigt dann per E-Mail.
4. Nachbearbeiten (Ursache steht in `mail_outbox.last_error`): nach behobener Ursache `retry` (einzelner Vorgang oder alle) – setzt
   die Versuche zurück und sendet sofort. Ist die Adresse nachweislich unzustellbar, `drop` mit Begründung; Bearbeiter und Grund werden
   festgehalten, der Vorgang zählt nicht mehr als offen. Die Kündigung selbst bleibt davon unberührt wirksam.

## Teil 4 – Kündigungslink im Footer

Die Startseite hat den einzigen Footer mit Rechtslinks. In der bestehenden Spalte „Rechtliches“ erscheint „Verträge hier kündigen“
(`/konto/kuendigen/`) als letzter Eintrag – gleiche Schrift, keine neue Spalte, Menü unverändert. Schalter ist allein der Endpunkt in
`konto/config.js` (`scripts/home/cancel-link.mjs`); solange er leer ist, bleibt `/index.html` Byte für Byte gleich. Alle Kontoseiten
tragen den Link bereits.

Rechtliche Einschätzung (von der Rechtsberatung zu bestätigen): § 312k Abs. 2 BGB verlangt eine ständig verfügbare, unmittelbar und leicht
zugängliche Schaltfläche. Ein Footer-Link auf jeder Seite ist verbreitete Praxis. **Restrisiko:** Die Produktwelten (Quant, Discover …)
haben keinen Footer; dort ist der Link nur über die Startseite erreichbar. Falls die Rechtsberatung den Link auf *jeder* Seite verlangt:
eine Zeile im Fuß der globalen Shell (eigener Shell-PR mit Shell-QA, Menü bleibt unverändert).

## Was ausdrücklich aus bleibt

Öffentliche Registrierung (Worker **und** Datenbank-Hook), Stripe-Live-Schlüssel (Workflows und Worker lehnen sie ab),
automatische Ausführung von Kündigungen ohne Anmeldung, `konto/config.js` auf `main`, jede Produktionsumgebung.

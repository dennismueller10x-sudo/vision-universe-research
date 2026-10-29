# Brevo – Kontaktverwaltung und Newsletter

Stand 29.10.2026. Supabase bleibt führend; Brevo bekommt nur, was der jeweilige Zweck braucht. Beide Teile sind in Produktion
**ausgeschaltet** (`VU_BREVO_SYNC = "false"`, `VU_NEWSLETTER = "false"`), bis die Listen angelegt sind und die rechtliche
Abnahme vorliegt ([RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md) A10, A11). Code: `workers/vu-account/src/brevo.mjs`,
Migration `supabase/migrations/20261029000100_produktivstart.sql`. Schlüssel: Repository-Secret `BREVO_API_KEY`, bereits als
Worker-Secret gesetzt (Transaktionsmails); er erscheint in keinem Log.

## Bestand vor dieser Änderung

- Supabase-Konten wurden **nicht** zu Brevo-Kontakten. Brevo verschickte nur Auth-Mails (SMTP) und Kündigungsbestätigungen
  (API, Transaktion – kein Kontakt, keine Liste).
- Die Landingpage (`landing/server/newsletter.mjs`) führt die Newsletter-Anmeldung mit Double-Opt-in: Liste **4**, Vorlage
  „VU | Newsletter | DE | API Double Opt In | v1“, Einwilligung `vu-newsletter-v1`.
- Ob Konto-Adressen schon als Kontakte (z. B. aus der Landingpage) existieren, meldet der Lauf unten nur als Zahl.

## A Kontaktverwaltung (ohne Werbung)

Zweck: Vertrags- und Servicekommunikation (Konto, Abo, Kündigung, Widerruf, Änderungen der Bedingungen). Rechtsgrundlage nach
Entwurf Art. 6 Abs. 1 lit. b DSGVO (Vertrag) bzw. lit. f – **Prüfung offen**. Diese Listen dürfen nie für Werbung genutzt
werden.

| Liste | Inhalt |
|---|---|
| Vision Universe App – Nutzer | jedes Konto mit bestätigter E-Mail |
| Vision Universe App – Free | Konten ohne aktives Pro |
| Vision Universe App – Pro | Konten mit aktivem Pro (aus `billing.entitlements`) |

- Übertragen: E-Mail und Merkmal `VU_TARIF` (`FREE` | `PRO`). Kein Name, keine Watchlist, keine Zahlungsdaten.
- Abgleich alle 10 Minuten (Worker-Cron) aus `billing.brevo_contacts` (`billing_brevo_pending`): neu, Tarifwechsel,
  geänderte Adresse.
- Konto gelöscht oder E-Mail geändert → Datenbank-Trigger legt einen Auftrag `remove` an (`billing.brevo_jobs`); der Worker
  löscht den alten Kontakt bei Brevo. Fehler werden je Eintrag vermerkt und wiederholt.
- Eine Abmeldung (Blockliste) bei Brevo wird respektiert; Servicemails nach § 312f/§ 312k laufen als Transaktionsmail weiter.

## B Newsletter (nur mit Einwilligung)

- Registrierung: **freiwillige, nicht vorausgewählte** Checkbox mit dem Einwilligungstext und Link auf die
  Newsletter-Hinweise. Keine Voraussetzung für Free oder Pro.
- Bestehende Konten: Opt-in in `/konto/einstellungen/` („Newsletter“). Niemand wird nachträglich oder automatisch eingetragen.
- Ablauf: Wunsch → `billing.marketing_consents` (`requested`, Textfassung, SHA-256 des Wortlauts, Quelle `signup`/`settings`,
  Zeitpunkt) → Brevo-DOI-Mail mit der bestehenden Vorlage (`pending`, Pixel-Tracking aus) → Klick im Postfach → Kontakt in
  Liste 4 → `confirmed` (Zeitpunkt der Bestätigung). Nach 30 Tagen ohne Bestätigung `expired`.
- Nur `confirmed` setzt `user_settings.marketing_emails = true`; Konten können das Feld nicht selbst schreiben.
- Abmeldung: Link in jeder Newsletter-Mail (Brevo) oder in den Einstellungen → `withdrawn`, Kontakt aus Liste 4.
  Abmeldungen bei Brevo übernimmt der Abgleich.
- War die Adresse über die Landingpage schon bestätigt, gibt es keinen zweiten DOI (`BEREITS_BESTAETIGT`).
- Nachweis: Zeile in `billing.marketing_consents` (Text, Fassung, Hash, Quelle, Zeitpunkte, Status) plus DOI-Protokoll bei Brevo.
- Der Worker versendet **keine** Newsletter und keine Kampagnen; das bleibt eine Entscheidung im Brevo-Konto.

Segmente bei Brevo (ergeben sich aus Listen und Merkmal, keine eigenen Objekte nötig):
registriert = Liste „Nutzer“; Newsletter bestätigt = Liste 4; Free/Pro = Listen bzw. `VU_TARIF`.
Für Werbung nur Liste 4 verwenden – nie eine Schnittmenge mit A ohne Liste 4.

## Stand Produktion (29.10.2026, Lauf „Konten — Produktivstart einspielen“ #1)

- Angelegt: Ordner „Vision Universe App“, Listen **11** Nutzer, **12** Free, **13** Pro, Merkmal `VU_TARIF`; eingetragen in
  `[env.production.vars]`. Noch keine Kontakte in diesen Listen (Abgleich aus).
- Liste 4 „VU | Newsletter“: 137 Kontakte. Von 1 bestätigten Konto ist 1 schon Brevo-Kontakt und in Liste 4 (über die
  Landingpage angemeldet), 0 gesperrt.
- **Blocker für B:** Brevo meldet die DOI-Vorlage „VU | Newsletter | DE | API Double Opt In | v1“ (id 8) mit
  `doiTemplate: false`. Der Worker verlangt eine echte DOI-Vorlage und bricht sonst ab (`DOI_TEMPLATE_MISSING`, Einwilligung
  `failed`, keine Mail). Dieselbe Prüfung macht die Landingpage (`landing/server/newsletter.mjs`). Vor `VU_NEWSLETTER = "true"`
  in Brevo die Vorlage als Double-Opt-in-Vorlage anlegen bzw. markieren (Kategorie „Double opt-in“) und den Lauf wiederholen.

## Einrichten

1. Probelauf: Workflow „Konten — Brevo einrichten“ (`scripts/account/brevo-setup.mjs`) ohne Anwenden. Meldet Ordner, Listen,
   Merkmal, Liste 4, DOI-Vorlage – nur IDs und Zähler, keine Adressen.
2. Anwenden: legt Ordner „Vision Universe App“, die drei Listen und `VU_TARIF` an (nie ändern, löschen, Kontakte anlegen).
3. IDs in `[env.production.vars]` eintragen (`VU_BREVO_LIST_USERS/FREE/PRO`; `VU_BREVO_LIST_NEWSLETTER = "4"` ist gesetzt).
4. Nach Abnahme: `VU_BREVO_SYNC = "true"` bzw. `VU_NEWSLETTER = "true"` (eigener PR), ausrollen. `GET /v1/health` zeigt
   `contactSync` und `newsletter`.

Lokal: `node scripts/account/dev-server.mjs --newsletter` simuliert Brevo (`POST /__dev/brevo/confirm?email=…`,
`/__dev/brevo/unsubscribe?email=…`, `/__dev/cron`).

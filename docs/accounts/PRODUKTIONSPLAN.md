# Produktionsplan – öffentlicher Start Free/Pro und Abschluss des Accounts-Projekts

Stand 02.11.2026, verbindlich. Ziel: **ein** abschließender PR, ausgerollt automatisch mit **einer** Owner-Freigabe
(Job `zahlungsfreigabe`, [FREIGABEN.md](FREIGABEN.md)). Keine weiteren Einrichtungs- oder Prüfläufe: alles Übrige wird
lokal, in der CI, lesend oder im jeweiligen Dashboard erledigt.

## 1. Produktionsstand (lesend geprüft am 02.11.2026)

| Bereich | Stand |
|---|---|
| Worker `vu-account` | `konto.visionuniverse.de`, `/v1/health`: `checkout: testers`, `legal: entwurf`, `legalApproved: false`, `liveApproved: true`, `tax: automatic`, `stripeTax: ok`, `newsletter: false`, `newsletterTemplate: ok`, `contactSync: false`, `autoProcess: false` |
| Ausrollen | automatisch nach Merge („Konten — Produktion automatisch“, Umgebung `account-auto`); letzte Läufe 30.10. und 01.11. erfolgreich, ohne Freigabe |
| Datenbank | Supabase `qiytbnpoqvldsatpfkeh`, 12 Migrationen (zuletzt `20261031000100_backtest_reviewer`), RLS überall |
| Konten | 1 Konto (privates Testkonto des Owners), bestätigt, Rollen `user`, `billing_tester`; 0 Abos |
| Rollen | `billing_tester` 1; **`pricing_admin` 0** und **`backtest_reviewer` 0**, beides bewusst (s. u.) |
| Pro-Preis | `pro_month_live` 1,00 €/Monat brutto, Stripe `price_1UVYNiBNKuXfjJefGV0m6LNn` (`inclusive`); Tarifverwaltung: 0 Änderungen |
| Umsatzsteuer | Stripe Tax aktiv (DE-Registrierung), Checkout mit `automatic_tax`; Probe DE/AT/FR 1,00 € brutto mit 0,16 € USt |
| Zahlungsarten | Karte, Apple/Google Pay, PayPal, SEPA, Klarna, Link – Stripe wählt je Kunde |
| Webhook / Portal | `we_1UVYNiBNKuXfjJefAQbiwzw0` (alle benötigten Ereignisse), Portal `bpc_1UVYNiBNKuXfjJefiiNAQOrN` (Kündigung zum Periodenende) |
| Rechtstexte | 7 Seiten unter `konto.visionuniverse.de/rechtliches/`, Fassung `vu-recht-2026-10-29-entwurf-1`, Entwurfsbanner |
| Kündigen / Widerrufen | `/kuendigen`, `/widerrufen` öffentlich; Ausführung manuell (`VU_CANCELLATION_AUTO_PROCESS = "false"`) |
| Brevo | Listen 11/12/13, DOI-Vorlage geprüft (`newsletterTemplate: ok`); Abgleich und Newsletter **aus** |
| Tarifverwaltung | `/konto/admin/tarife/` live, geschützt; ohne Rolle 401/403 ([TARIFVERWALTUNG.md](TARIFVERWALTUNG.md)) |

**Entscheidungen des Owners (02.11.2026):**
- Das vorhandene Konto ist ein **privates Testkonto**. Es bekommt **keine** Administratorrechte; `billing_tester` bleibt für
  den Test des öffentlichen Zahlungsablaufs.
- `pricing_admin` wird derzeit **nicht** vergeben. Wird die Tarifverwaltung gebraucht, legt der Owner dafür ein **eigenes
  geschäftliches Konto** an; erst dann wird die Rolle diesem Konto zugewiesen (mit ausdrücklicher Zustimmung).
- Es wird kein Administratorkonto automatisch angelegt.

## 2. Was bis zum öffentlichen Start fehlt

| # | Punkt | Wer | Wie (ohne Workflow) | Status |
|---|---|---|---|---|
| R1 | Rechtliche Abnahme A1–A14 ([RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md)) | Rechtsberatung | Entwürfe online lesen, Änderungen mitteilen | offen |
| R2 | Fehlende Angaben: USt-IdNr. (falls erteilt), Telefon oder anderer schneller Kontaktweg, Datenschutzbeauftragter ja/nein, Teilnahme an Verbraucherschlichtung ja/nein | Owner | mitteilen (Fragebogen in [RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md)) | offen |
| S1 | Umsatzsteuer: Stripe Tax läuft; Länderfrage, Steuerkategorie und Rechnungsangaben bestätigt der Steuerberater | Steuerberatung | [STEUER.md](STEUER.md) | technisch erledigt, Bestätigung offen |
| S2 | Stripe-Branding (Symbol, Logo, Farben) und öffentliche Angaben (Support-E-Mail/-URL, Steuernummer auf Rechnungen, Beleg-E-Mails) | Owner | Stripe-Dashboard, Schritt für Schritt in [STRIPE_BRANDING.md](STRIPE_BRANDING.md) | offen |
| S3 | Klarna für ein 1-€-Abo behalten? | Owner | Stripe-Dashboard → Zahlungsmethoden (optional) | offen |
| Z1 | Abschließende Zahlungsprüfung: echter Testkauf mit dem Testkonto, Beleg, Kündigung, Erstattung | Owner, Claude prüft lesend | [ZAHLUNGSPRUEFUNG.md](ZAHLUNGSPRUEFUNG.md) – jetzt schon möglich (Checkout `testers`) | offen |
| B1 | Rechtsgrundlage Brevo-Kontaktliste (A10) | Rechtsberatung | mit R1 | offen |
| B2 | DOI-Vorlage | – | `/v1/health` → `newsletterTemplate: ok` | erledigt |

## 3. Ablauf bis zum Start (verbindlich, minimal)

1. **Antworten sammeln** (R1, R2, S1, S3, B1) und Dashboard-Schritte (S2). Kein Lauf.
2. **Testkauf** (Z1) mit dem privaten Testkonto – vor der Freigabe, damit Beleg, Steuer und E-Mails einmal echt geprüft sind.
3. **Ein Abschluss-PR** (Claude, nur CI, keine Freigabe):
   - offene Stellen in `workers/vu-account/src/legal/texts.mjs` nach Abnahme ersetzen, Impressum-Test anpassen;
   - `node scripts/account/go-live-config.mjs --legal-version=vu-recht-JJJJ-MM-TT-1 --tax=automatic --checkout=public
     --brevo-sync=true [--newsletter=true]` – setzt Fassung, Freigabe, Steuer, Checkout und Brevo in einem Schritt und
     prüft wie der Deploy-Workflow (`check-public-checkout.mjs`); verweigert, solange `[[OFFEN]]`/`[[PRÜFEN]]` übrig ist;
   - alle Tests lokal und in der CI.
4. **Deine ausdrückliche Endfreigabe** zum Merge dieses PR.
5. **Ausrollen automatisch** nach dem Merge: Weil der Checkout von `testers` auf `public` erweitert wird, wartet genau
   **ein** Job (`zahlungsfreigabe`, Umgebung `account-production`) auf deine Freigabe – die gewollte, letzte Freigabe.
6. **Kontrolle lesend** (kein Lauf): `GET /v1/health` → `checkout: "public"`, `legalApproved: true`, `tax: "automatic"`,
   `stripeTax: "ok"`, `contactSync: true`; `/preise/` ohne „interner Testpreis“; erste echte Bestellung im Stripe-Dashboard.

**Gesamt bis zum Start: 1 automatischer Lauf, 1 Freigabe.**

## 4. Abschluss des Accounts-Projekts (Checkliste)

Das Projekt gilt als abgeschlossen, wenn alle Punkte erfüllt sind:

- [ ] R1, R2, B1: Texte freigegeben, keine `[[OFFEN]]`/`[[PRÜFEN]]`, `legalApproved: true`
- [ ] S1: Steuerberater bestätigt; S2: Branding und Rechnungsangaben in Stripe gesetzt
- [ ] Z1: Testkauf, Kündigung und Erstattung protokolliert ([ZAHLUNGSPRUEFUNG.md](ZAHLUNGSPRUEFUNG.md))
- [ ] Checkout `public`, Kontrolle nach Abschnitt 3.6 erfüllt
- [ ] Brevo-Abgleich an (`contactSync: true`), Newsletter nach Entscheidung
- [ ] Optional: Lese-Schlüssel `VU_ACCOUNT_STRIPE_READ_KEY` in `account-auto` (tägliche Stripe-Prüfung ohne Freigabe, [FREIGABEN.md](FREIGABEN.md))
- [ ] Optional: geschäftliches Konto für die Tarifverwaltung, Rolle `pricing_admin` nach ausdrücklicher Zustimmung

## 5. Was ausdrücklich nicht gestartet wird

Stripe-Einrichtung, Stripe-Lesecheck mit Freigabe, Brevo-Prüfung, Zwischen-Deploys. Code-, Text- und
Migrationsänderungen rollen nach dem Merge automatisch aus, solange sie keine Zahlungen öffnen.

## 6. Rückweg

`VU_CHECKOUT_ACCESS = "testers"` (eigener PR, rollt ohne Freigabe aus, weil es einschränkt): neue Abschlüsse sofort nur
noch für Tester, bestehende Abos laufen bei Stripe weiter. Kein Free-Konto wird je automatisch kostenpflichtig.

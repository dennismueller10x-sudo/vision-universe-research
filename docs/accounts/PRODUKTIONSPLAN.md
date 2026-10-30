# Produktionsplan – öffentlicher Start Free/Pro

Stand 29.10.2026, verbindlich. Ziel: **ein** abschließender PR, ausgerollt automatisch mit **einer** Freigabe (Zahlungsfreigabe, [FREIGABEN.md](FREIGABEN.md)). Keine weiteren
Prüf- oder Einrichtungsläufe: alles Übrige wird lokal, in der CI, lesend oder im jeweiligen Dashboard erledigt.

## 1. Was in Produktion funktioniert (geprüft, lesend)

| Bereich | Stand |
|---|---|
| Registrierung Free | offen für jede Adresse, Konto erst nach bestätigter E-Mail |
| Konto, Watchlist, Dashboard | live unter research.visionuniverse.de, API `konto.visionuniverse.de` |
| Pro-Checkout | Stripe Live, Preis 1,00 €/Monat brutto (`price_1UVYNiBNKuXfjJefGV0m6LNn`, `inclusive`); **nur Rolle `billing_tester`** |
| Zahlungsarten | Karte, Apple/Google Pay, PayPal (Abo bestätigt), SEPA, Klarna, Link – Stripe wählt je Kunde |
| Webhook | `we_1UVYNiBNKuXfjJefAQbiwzw0`, Ereignisse inkl. fehlgeschlagener SEPA-Zahlung (Lauf #5) |
| Kundenportal | `bpc_1UVYNiBNKuXfjJefiiNAQOrN`: Kündigung zum Periodenende, Zahlungsmethode, Rechnungen; Links auf eigene AGB/Datenschutz |
| Rechtstexte | 7 Seiten unter `konto.visionuniverse.de/rechtliches/` ohne Login/Passwortmaske, als **Entwurf** gekennzeichnet |
| Kündigen / Widerrufen | `/kuendigen` („Jetzt kündigen“), `/widerrufen` („Vertrag widerrufen“ → „Widerruf bestätigen“), Eingangsbestätigung per E-Mail |
| Vertragsbestätigung | E-Mail nach Checkout mit AGB, Widerrufsbelehrung, Muster-Formular |
| Datenbank | 10 Migrationen, RLS; Einwilligungen 0, Brevo-Aufträge 0, Abos 0, fehlgeschlagene Zahlungsereignisse 0 |
| Brevo | Listen 11 Nutzer / 12 Free / 13 Pro, Merkmal `VU_TARIF`; Abgleich und Newsletter **aus** |
| Sperren | `VU_CHECKOUT_ACCESS = "testers"`; Worker und Deploy-Prüfung verlangen für „public“ freigegebene Texte, bestätigte Fassung und USt-Ausweis |

In `main`, aber noch nicht ausgerollt (kommt mit dem einen Abschluss-Deploy): DOI-Vorlagenprüfung per Einzelabruf,
`HEAD` auf Rechtsseiten, `/v1/health` meldet `tax` und `newsletterTemplate`.

## 2. Was wirklich noch fehlt

| # | Punkt | Wer | Wie (ohne Workflow) |
|---|---|---|---|
| R1 | Rechtliche Abnahme A1–A14 ([RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md)) | Rechtsberatung | Entwürfe online lesen, Änderungen mitteilen |
| R2 | Fehlende Angaben: USt-IdNr. (falls erteilt), Telefon oder anderer schneller Kontaktweg, Datenschutzbeauftragter ja/nein | Owner | mitteilen |
| S1 | Umsatzsteuer-Ausweis: Steuersatz „USt. 19 %, inklusive, DE“ anlegen **oder** Stripe Tax aktivieren | Owner (Steuerberatung) | Stripe-Dashboard → Produktkatalog → Steuersätze → „Steuersatz erstellen“ (19 %, inklusive, Land DE, Typ USt) → `txr_…` mitteilen. Alternative: Workflow-Option `tax_rate` (kostet einen Lauf – nicht nötig) |
| S2 | Rechnungsangaben, Support-E-Mail/URL, Logo, Belegversand | Owner | Stripe-Dashboard, Liste in [STEUER.md](STEUER.md) |
| S3 | Klarna für ein 1-€-Abo behalten? | Owner | Stripe-Dashboard → Zahlungsmethoden (optional) |
| S4 | Webhook-Ereignisliste sichtbar bestätigen | Owner | Stripe-Dashboard → Entwickler → Webhooks → Endpunkt (1 Minute, statt Prüflauf) |
| B1 | Rechtsgrundlage Brevo-Kontaktliste (A10) | Rechtsberatung | mit R1 |
| B2 | DOI-Vorlage 8 | – | prüft der Worker nach dem Abschluss-Deploy selbst (`/v1/health` → `newsletterTemplate`); bis „ok“ wird keine DOI-Mail verschickt (schließt sicher) |

## 3. Ablauf bis zum Start (verbindlich, minimal)

1. **Antworten sammeln** (R1, R2, S1–S3, B1). Kein Lauf.
2. **Ein Abschluss-PR** (Claude, nur CI, keine Freigabe):
   - offene Stellen in `workers/vu-account/src/legal/texts.mjs` nach Abnahme ersetzen, Impressum-Test anpassen;
   - `node scripts/account/go-live-config.mjs --legal-version=vu-recht-JJJJ-MM-TT-1 --tax=txr_… --checkout=public
     --brevo-sync=true [--newsletter=true]` – setzt Fassung, Freigabe, Steuer, Checkout und Brevo in einem Schritt und
     prüft wie der Deploy-Workflow; verweigert, solange etwas fehlt;
   - alle Tests lokal und in der CI.
3. **Deine ausdrückliche Endfreigabe** zum Merge dieses PR (Kommentar „freigegeben“).
4. **Ausrollen automatisch** nach dem Merge („Konten — Produktion automatisch“): Weil sich Checkout-Zugang, Rechtsfreigabe
   und Umsatzsteuer ändern, wartet genau **ein** Job auf deine Freigabe (`account-production`). Das ist die gewollte, letzte
   Freigabe für öffentliche Zahlungen. Voraussetzung: einmalige Einrichtung von `account-auto` ([FREIGABEN.md](FREIGABEN.md)).
5. **Kontrolle lesend** (kein Lauf): `GET /v1/health` → `checkout: "public"`, `legalApproved: true`, `tax: "txr_…"`,
   `newsletterTemplate: "ok"`, `contactSync: true`; `/preise/` ohne „interner Testpreis“; erste echte Bestellung im
   Stripe-Dashboard sichtbar.

**Gesamt bis zum Start: 1 automatischer Lauf, 1 Freigabe.** Der Newsletter-Schalter ist optional: Dieselbe Vorlage 8
verschickt die Landingpage heute erfolgreich mit derselben Prüfung, daher wird „ok“ erwartet. Meldet `/v1/health` etwas
anderes, verschickt der Worker keine DOI-Mail (Einwilligung `failed`, kein Werbeversand); die Ursache steht im Feld
(z. B. `DOI_TEMPLATE_MISSING`), die Vorlage wird in Brevo korrigiert und Betroffene setzen den Haken erneut – ohne Lauf.
Wer kein Restrisiko will, lässt `--newsletter` im Abschluss-PR weg; Brevo-Schalter sind nicht zahlungsrelevant und rollen
später ohne Freigabe automatisch aus.

## 4. Was ausdrücklich nicht mehr gestartet wird

Stripe-Lesecheck, Brevo-Prüfung, Stripe-Einrichtung, weitere Migrations- oder Zwischen-Deploys. Die drei Läufe vom
29.10. (#11 Deploy, #3 Stripe-Check, #2 Brevo-Prüfung) wurden ohne Freigabe abgebrochen; ihr Inhalt ist im Abschluss-Deploy
bzw. in den lesenden Kontrollen enthalten.

## 5. Rückweg

`VU_CHECKOUT_ACCESS = "testers"` (eigener PR + Deploy): neue Abschlüsse sofort nur noch für Tester, bestehende Abos laufen
bei Stripe weiter. Kein Free-Konto wird je automatisch kostenpflichtig.

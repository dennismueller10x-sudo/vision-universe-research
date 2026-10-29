# Rechtliche Abnahme – Free/Pro, Newsletter, Kündigen, Widerrufen

Stand 29.10.2026. **Keine Rechtsberatung, keine Freigabe.** Alle Texte sind Entwürfe der Fassung
`vu-recht-2026-10-29-entwurf-1` (`workers/vu-account/src/legal/texts.mjs`, `LEGAL_STATUS = 'entwurf'`). Jede Seite trägt ein
sichtbares Entwurfsbanner. Offene Stellen stehen im Text als **[[OFFEN: …]]** (Angabe fehlt) bzw. **[[PRÜFEN: …]]** (Wertung
der Rechtsberatung nötig). Der Code nimmt keinen dieser Punkte als gelöst an. Ersetzt die Liste in
[RECHTLICHE_PRUEFUNG_CHECKOUT.md](RECHTLICHE_PRUEFUNG_CHECKOUT.md).

## Wo die Texte liegen

Öffentlich ohne Login und **ohne die Research-Passwortmaske** (die Maske umschließt jede Seite auf research.visionuniverse.de;
deshalb liefert der Konto-Worker diese Seiten aus, ohne Skript, mit strenger CSP):

| Text | Adresse | Quelle |
|---|---|---|
| Übersicht | `https://konto.visionuniverse.de/rechtliches/` | `src/public-pages.mjs` |
| Impressum | `…/rechtliches/impressum` | `DOCS.impressum` |
| AGB Free und Pro (Preis, Laufzeit, Zahlung, Kündigung) | `…/rechtliches/agb` | `DOCS.agb`, `PRO_TERMS` |
| Widerrufsbelehrung (digitale Dienstleistung) | `…/rechtliches/widerrufsbelehrung` | `DOCS.widerrufsbelehrung` |
| Muster-Widerrufsformular | `…/rechtliches/widerrufsformular` | `DOCS.widerrufsformular` |
| Datenschutzhinweise (Konto, Abo, Anbieter, Newsletter) | `…/rechtliches/datenschutz` | `DOCS.datenschutz` |
| Newsletter-Hinweise (Brevo, DOI, Abmeldung) | `…/rechtliches/newsletter` | `DOCS.newsletter` |
| Kündigungsfunktion (§ 312k BGB, „Jetzt kündigen“) | `…/kuendigen` | `cancelGet/cancelPost` |
| Elektronische Widerrufsfunktion (§ 356a BGB, „Vertrag widerrufen“ → „Widerruf bestätigen“) | `…/widerrufen` | `withdrawGet/withdrawPost` |

Verlinkt aus dem Fuß jeder Kontoseite (`/konto/**`, `/preise/`), aus Registrierung (AGB, Datenschutz), Tarifseite (AGB,
Widerrufsbelehrung, Muster), Abo-Seite (Kündigen, Widerrufen) und Stripe (Kundenportal und Checkout: AGB, Datenschutz).
Ein Browsertest (`scripts/account/journey-qa.mjs`) öffnet alle Seiten mobil/hell/dunkel, Chromium und WebKit, ohne Anmeldung.

Bestätigungen auf dauerhaftem Datenträger (E-Mail über Brevo, `billing.mail_outbox`):
- **Vertragsbestätigung** (§ 312f BGB) nach erfolgreichem Checkout: Vertragsinhalt, Preis, AGB, Widerrufsbelehrung und
  Muster-Formular als Text, Zeitpunkt der Zustimmung zum sofortigen Beginn (`contract_confirmation`).
- **Eingangsbestätigung des Widerrufs** sofort mit Inhalt, Datum und Uhrzeit (`withdrawal_receipt`).
- **Kündigungsbestätigung** wie bisher. Kündigung und Widerruf werden nie automatisch ausgeführt
  (`VU_CANCELLATION_AUTO_PROCESS = "false"`); Zuordnung und Ausführung durch eine berechtigte Person binnen 24 h.

## Unternehmensangaben (nur aus vorhandenen Quellen)

| Angabe | Wert | Quelle |
|---|---|---|
| Firma | RAM Consulting UG (haftungsbeschränkt) | `landing/impressum/` |
| Anschrift | Bahnhofplatz 15, 74189 Weinsberg | `landing/impressum/` |
| Vertretung | Ralf Andreas Müller, Geschäftsführer (nur Impressum, gesetzliche Pflicht; nicht in Zahlungsbeschreibungen) | `landing/impressum/` |
| Register | Amtsgericht Stuttgart, HRB 803400 | `landing/impressum/` |
| Steuernummer | 65204/71409 | `landing/impressum/` |
| E-Mail | info@visionuniverse.de | `landing/impressum/` |
| **USt-IdNr.** | **fehlt** | keine Quelle |
| **Telefon / weiterer schneller Kontaktweg** | **fehlt** | keine Quelle |
| **Datenschutzbeauftragter** | **fehlt** (benannt oder nicht erforderlich?) | keine Quelle |

## Abnahmeliste

| # | Punkt | Stand im Code | Wer | Status |
|---|---|---|---|---|
| A1 | Impressum vollständig (USt-IdNr., Telefon/Kontaktweg, Verbraucherschlichtung § 36 VSBG) | Entwurf mit [[OFFEN]] | Owner | **offen** |
| A2 | AGB Free/Pro: Leistung, Preis 1,00 €/Monat inkl. USt, monatliche Laufzeit, Verlängerung, Kündigung jederzeit zum Periodenende, Zahlung über Stripe, Änderungsklausel, Sanktionsregel, Kundenkreis/Mindestalter | Entwurf mit [[PRÜFEN]] | Rechtsberatung | **offen** |
| A3 | Widerrufsbelehrung: Einordnung digitale Dienstleistung vs. digitale Inhalte (§ 356 Abs. 4/5 BGB n. F.), Wertersatz § 357a, Übereinstimmung mit der aktuellen Muster-Belehrung (Anlage 1 Art. 246a EGBGB, Fassung ab 19.06.2026) | Entwurf; Checkout fragt ausdrücklichen Beginn und Kenntnis ab | Rechtsberatung | **offen** |
| A4 | Elektronische Widerrufsfunktion § 356a BGB: Beschriftung „Vertrag widerrufen“, Bestätigungsseite „Widerruf bestätigen“, nur Name, Vertragskennung, E-Mail, kein Grund, sofortige Eingangsbestätigung | umgesetzt, getestet | Rechtsberatung | umgesetzt, Prüfung offen |
| A5 | Kündigungsfunktion § 312k BGB ohne Login, „Jetzt kündigen“, Bestätigung | umgesetzt (öffentlich jetzt auch unter `konto.visionuniverse.de/kuendigen`) | Rechtsberatung | umgesetzt, Prüfung offen |
| A6 | Vertragsbestätigung § 312f BGB | umgesetzt (eigene E-Mail mit Volltexten) | Rechtsberatung | umgesetzt, Prüfung offen |
| A7 | Button-Lösung § 312j Abs. 3: letzte Schaltfläche bei Stripe heißt „Abonnieren“; ergänzender Text darüber („Mit „Abonnieren“ bestellst du Vision Universe Pro zahlungspflichtig für 1,00 € pro Monat inkl. USt. …“) | `custom_text.submit.message` | Rechtsberatung | **offen** |
| A8 | Datenschutzhinweise: Rechtsgrundlagen, Speicherfristen, Anbieter (Supabase, Cloudflare, Stripe, PayPal, Klarna, Brevo, GitHub Pages), Drittlandübermittlung (DPF/SCC), AVV je Anbieter | Entwurf mit [[PRÜFEN]] „Fristen festlegen“, „Je Anbieter …“ | Owner + Rechtsberatung | **offen** |
| A9 | Google Fonts auf `/analysten/` (Übermittlung an Google ohne Einwilligung) | nur benannt, nicht geändert (fremde Welt) | Owner | **offen** |
| A10 | Brevo-Kontaktliste (A) ohne Einwilligung: Rechtsgrundlage Art. 6 Abs. 1 lit. b bzw. f DSGVO, nur Service-Kommunikation | Code trennt A und B; A ausgeschaltet | Rechtsberatung | **offen** |
| A11 | Newsletter (B): Einwilligungstext, DOI, Nachweis, Abmeldung, Tracking aus | umgesetzt; Text wortgleich mit der Landingpage (`vu-newsletter-v1`) | Rechtsberatung | umgesetzt, Prüfung offen |
| A12 | Umsatzsteuer: Ausweis, Rechnungsangaben, internationale Kunden (siehe [STEUER.md](STEUER.md)) | Preis inkl. USt, kein gesonderter Steuerausweis (`STRIPE_TAX_MODE = "none"`) | Steuerberatung | **offen** |
| A13 | Stripe öffentliche Angaben: Name in der Abrechnung, Abrechnungsbeschreibung (statement descriptor), Logo, Support-Adresse; keine Privatnamen | Befund 29.10.: Firma und Kontoauszug „VISION UNIVERSE“ korrekt, kein Privatname; Support-E-Mail/-URL leer, kein Logo, keine Steuer-ID für Rechnungen | Owner (Stripe-Dashboard → Einstellungen → Unternehmensdetails, Branding, Rechnungen) | **offen** |
| A14 | Klarna als Zahlungsart für ein 1-€-Abo (Stripe zeigt nur, was zulässig ist) | dynamische Zahlungsarten | Owner | Entscheidung offen |

## Freigabe und Umschalten auf öffentliches Pro

Drei unabhängige Schritte; fehlt einer, bleibt der Live-Checkout auf Konten mit Rolle `billing_tester` beschränkt:

1. **Texte freigeben** (eigener PR, nach Abnahme A1–A14): alle [[OFFEN]]/[[PRÜFEN]] in `texts.mjs` ersetzen, Fassung
   `LEGAL_VERSION` hochzählen (z. B. `vu-recht-2026-11-…-1`), `LEGAL_STATUS = 'freigegeben'`. Ein Unit-Test verlangt, dass eine
   freigegebene Fassung keine Marker mehr enthält.
2. **Fassung in der Konfiguration bestätigen**: `VU_LEGAL_APPROVED = "<LEGAL_VERSION>"` in `[env.production.vars]`.
3. **Checkout öffnen**: `VU_CHECKOUT_ACCESS = "public"` und im Deploy-Workflow
   (`account-production-deploy.yml`, Schritt „Produktionskonfiguration prüfen“) `public` zulassen – im selben, vom Owner
   ausdrücklich freigegebenen PR. Danach „Konten — vu-account ausrollen (Produktion)“ mit `stripe_key = false` starten
   (zwei Freigaben). Kontrolle: `GET https://konto.visionuniverse.de/v1/health` → `checkout: "public"`, `legal: "freigegeben"`, `legalApproved: true`.

Zurück: `VU_CHECKOUT_ACCESS = "testers"` (eigener PR + Deploy) – bestehende Abos laufen bei Stripe weiter.
Bestehende Free-Konten werden nie automatisch kostenpflichtig: ein Abo entsteht nur durch einen eigenen Checkout mit
Bestätigung und Zahlung.

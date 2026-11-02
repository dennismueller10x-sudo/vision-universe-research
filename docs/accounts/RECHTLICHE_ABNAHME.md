# Rechtliche Abnahme – Free/Pro, Newsletter, Kündigen, Widerrufen

Stand 02.11.2026. **Keine Rechtsberatung, keine Freigabe.** Alle Texte sind Entwürfe der Fassung
`vu-recht-2026-11-02-entwurf-2` (`workers/vu-account/src/legal/texts.mjs`, `LEGAL_STATUS = 'entwurf'`). Jede Seite trägt ein
sichtbares Entwurfsbanner. Offene Stellen stehen im Text als **[[OFFEN: …]]** (Angabe fehlt) bzw. **[[PRÜFEN: …]]** (Wertung
der Rechtsberatung nötig). Der Code nimmt keinen dieser Punkte als gelöst an. Ersetzt die Liste in
[RECHTLICHE_PRUEFUNG_CHECKOUT.md](RECHTLICHE_PRUEFUNG_CHECKOUT.md).

## Einordnung der offenen Punkte (Stand 02.11.2026)

**Redaktionell erledigt (keine Wertung, nur Fakten):**
- Unternehmensangaben ausschließlich aus dem bestätigten Impressum (Tabelle unten); nichts ergänzt.
- AGB Abschnitt 5: Preis ohne festen Betrag – maßgeblich ist der vor der Bestellung angezeigte, in der
  Vertragsbestätigung genannte Bruttopreis (Preise sind über die Tarifverwaltung änderbar, gelten nur für neue Abschlüsse).
- AGB und Datenschutz: Umsatzsteuer über Stripe Tax (Ausweis auf der Rechnung, Verarbeitung der Rechnungsadresse).
- Keine Shopify-Bezüge in den Konto-Texten (durch Tests gesichert). Der Fuß der Startseite verlinkt nicht mehr auf die
  stillgelegten Shopify-Rechtsseiten, sondern auf `konto.visionuniverse.de/rechtliches/…`; das tote Shopify-Newsletter-
  Formular ist durch einen Link zur Brevo-Anmeldung der Landingpage ersetzt.
- Technisch überholt und entfernt: fester Steuersatz (`txr_…`), Google Fonts (A9), Preis-Konstante `PRO_TERMS`.

**Angaben des Owners (dürfen nicht erfunden werden):** USt-IdNr., schneller Kontaktweg, Datenschutzbeauftragter,
Haltung zur Verbraucherschlichtung, Kundenkreis/Mindestalter, Protokollfristen – Fragebogen unten (A1, A8).

**Juristische Prüfung (Rechtsberatung):** A2 (AGB inkl. Preisangabe, Änderungs- und Sanktionsklausel), A3
(Widerrufsbelehrung, Einordnung digitale Dienstleistung), A4–A7 (Widerrufs- und Kündigungsfunktion,
Vertragsbestätigung, Button-Lösung), A8 (Datenschutz: AVV, Drittland, Fristen), A10 (Brevo-Kontaktliste), A11
(Newsletter).

**Steuerliche Prüfung (Steuerberatung):** A12 – Prüfliste in [STEUER.md](STEUER.md). Nicht als erfolgt gekennzeichnet.

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
| A2 | AGB Free/Pro: Leistung, Preis (seit 02.11. ohne festen Betrag: maßgeblich ist der vor der Bestellung angezeigte und in der Vertragsbestätigung genannte Bruttopreis, derzeit 1,00 €/Monat; Preise sind über die Tarifverwaltung änderbar und gelten nur für neue Abschlüsse), monatliche Laufzeit, Verlängerung, Kündigung jederzeit zum Periodenende, Zahlung über Stripe, Änderungsklausel, Sanktionsregel, Kundenkreis/Mindestalter | Entwurf mit [[PRÜFEN]] | Rechtsberatung | **offen** |
| A3 | Widerrufsbelehrung: Einordnung digitale Dienstleistung vs. digitale Inhalte (§ 356 Abs. 4/5 BGB n. F.), Wertersatz § 357a, Übereinstimmung mit der aktuellen Muster-Belehrung (Anlage 1 Art. 246a EGBGB, Fassung ab 19.06.2026) | Entwurf; Checkout fragt ausdrücklichen Beginn und Kenntnis ab | Rechtsberatung | **offen** |
| A4 | Elektronische Widerrufsfunktion § 356a BGB: Beschriftung „Vertrag widerrufen“, Bestätigungsseite „Widerruf bestätigen“, nur Name, Vertragskennung, E-Mail, kein Grund, sofortige Eingangsbestätigung | umgesetzt, getestet | Rechtsberatung | umgesetzt, Prüfung offen |
| A5 | Kündigungsfunktion § 312k BGB ohne Login, „Jetzt kündigen“, Bestätigung | umgesetzt (öffentlich jetzt auch unter `konto.visionuniverse.de/kuendigen`) | Rechtsberatung | umgesetzt, Prüfung offen |
| A6 | Vertragsbestätigung § 312f BGB | umgesetzt (eigene E-Mail mit Volltexten) | Rechtsberatung | umgesetzt, Prüfung offen |
| A7 | Button-Lösung § 312j Abs. 3: letzte Schaltfläche bei Stripe heißt „Abonnieren“; ergänzender Text darüber („Mit „Abonnieren“ bestellst du Vision Universe Pro zahlungspflichtig für 1,00 € pro Monat inkl. USt. …“) | `custom_text.submit.message` | Rechtsberatung | **offen** |
| A8 | Datenschutzhinweise: Rechtsgrundlagen, Speicherfristen, Anbieter (Supabase, Cloudflare, Stripe, PayPal, Klarna, Brevo, GitHub Pages), Drittlandübermittlung (DPF/SCC), AVV je Anbieter | Entwurf mit [[PRÜFEN]] „Fristen festlegen“, „Je Anbieter …“ | Owner + Rechtsberatung | **offen** |
| A9 | Google Fonts auf `/analysten/` (Übermittlung an Google ohne Einwilligung) | behoben 30.10.2026: Schriften lokal (`/assets/fonts`); die Website lädt keine Drittinhalte mehr | – | erledigt |
| A10 | Brevo-Kontaktliste (A) ohne Einwilligung: Rechtsgrundlage Art. 6 Abs. 1 lit. b bzw. f DSGVO, nur Service-Kommunikation | Code trennt A und B; A ausgeschaltet | Rechtsberatung | **offen** |
| A11 | Newsletter (B): Einwilligungstext, DOI, Nachweis, Abmeldung, Tracking aus | umgesetzt; Text wortgleich mit der Landingpage (`vu-newsletter-v1`) | Rechtsberatung | umgesetzt, Prüfung offen |
| A12 | Umsatzsteuer: Ausweis, Rechnungsangaben, internationale Kunden (siehe [STEUER.md](STEUER.md)) | Preis inkl. USt (`inclusive`); Stripe Tax aktiv seit 30.10.2026 (`STRIPE_TAX_MODE = "automatic"`, `stripeTax: ok`); öffentlicher Checkout verlangt Stripe Tax | Steuerberatung | technisch umgesetzt, Bestätigung offen |
| A13 | Stripe öffentliche Angaben: Name in der Abrechnung, Abrechnungsbeschreibung (statement descriptor), Logo, Support-Adresse; keine Privatnamen | Befund 29.10.: Firma und Kontoauszug „VISION UNIVERSE“ korrekt, kein Privatname; Support-E-Mail/-URL leer, kein Logo, keine Steuer-ID für Rechnungen | Owner (Schritte in [STRIPE_BRANDING.md](STRIPE_BRANDING.md)) | **offen** |
| A14 | Klarna als Zahlungsart für ein 1-€-Abo (Stripe zeigt nur, was zulässig ist) | dynamische Zahlungsarten | Owner | Entscheidung offen |

## Fragebogen für den Owner (R2)

Bitte beantworten; die Antworten ersetzen die `[[OFFEN]]`-Stellen. Es werden keine Angaben erfunden.

1. **USt-IdNr.**: erteilt? Wenn ja, Nummer (Impressum, Rechnungen).
2. **Schneller Kontaktweg** (§ 5 Abs. 1 Nr. 2 DDG): geschäftliche Telefonnummer oder ein anderer unmittelbarer Weg (z. B.
   Kontaktformular mit Antwort binnen 60 Minuten)? Keine private Nummer.
3. **Datenschutzbeauftragter**: benannt (Name/Kontakt) oder nicht erforderlich (weniger als 20 Personen ständig mit
   personenbezogenen Daten befasst, § 38 BDSG)?
4. **Verbraucherschlichtung** (§ 36 VSBG): bereit oder nicht bereit, an Streitbeilegungsverfahren teilzunehmen?
   Vorschlag im Entwurf: „nicht bereit und nicht verpflichtet“.
5. **Kundenkreis**: Entwurf „Verbraucher und Unternehmer, Konto ab 18 Jahren“ – so bestätigen oder einschränken?
6. **Speicherfristen** (Datenschutz): Entwurf „Kontodaten bis zur Löschung, Rechnungs- und Buchungsdaten bis zu zehn
   Jahre“; offen sind die Fristen für Server- und Anbieterprotokolle.

## Freigabe und Umschalten auf öffentliches Pro

Technisch vorbereitet: `scripts/account/check-public-checkout.mjs` lässt `VU_CHECKOUT_ACCESS = "public"` nur zu, wenn die
Texte freigegeben sind (keine `[[OFFEN]]`/`[[PRÜFEN]]`, `LEGAL_STATUS = 'freigegeben'`), `VU_LEGAL_APPROVED` genau diese
Fassung nennt, die Live-Abrechnung freigegeben ist und Stripe Tax läuft. Der Worker begrenzt den Live-Checkout ohne
freigegebene Texte zusätzlich auf Tester.

Der Umschalt-PR ändert nur Text und Konfiguration: offene Stellen in `workers/vu-account/src/legal/texts.mjs` ersetzen,
dann `node scripts/account/go-live-config.mjs --legal-version=vu-recht-JJJJ-MM-TT-1 --tax=automatic --checkout=public`
(setzt Fassung, Status und Schalter in einem Schritt). Nach dem Merge rollt „Konten — Produktion automatisch“ aus; genau
**ein** Job wartet auf die Owner-Freigabe, weil Zahlungen geöffnet werden ([PRODUKTIONSPLAN.md](PRODUKTIONSPLAN.md)).
Kontrolle: `GET /v1/health` → `checkout: "public"`, `legalApproved: true`; `/preise/` zeigt „interner Testpreis“ nicht mehr.

Zurück: `VU_CHECKOUT_ACCESS = "testers"` (eigener PR, rollt ohne Freigabe aus) – bestehende Abos laufen bei Stripe weiter.
Bestehende Free-Konten werden nie automatisch kostenpflichtig: ein Abo entsteht nur durch einen eigenen Checkout mit
Bestätigung und Zahlung.

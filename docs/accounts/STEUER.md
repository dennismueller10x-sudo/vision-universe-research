# Umsatzsteuer im Pro-Abo (Stripe Tax)

Stand 30.10.2026. **Keine Steuerberatung.** Die steuerrechtliche Bewertung, Registrierungs- und Erklärungspflichten
liegen beim Steuerberater. Dieses Dokument hält fest, was technisch eingestellt ist.

## Ausgangslage

- RAM Consulting UG (haftungsbeschränkt), regelbesteuert, Sitz Deutschland. Stripe Tax Basic im Live-Konto eingerichtet,
  deutsche Registrierung hinterlegt (Owner, 30.10.2026).
- Pro: Stripe-Preis `price_1UVYNiBNKuXfjJefGV0m6LNn`, 1,00 € pro Monat, **`tax_behavior: inclusive`** (Bruttopreis;
  vorübergehender Testpreis). Kein neuer Preis für Stripe Tax nötig.

## Wie gerechnet wird

`STRIPE_TAX_MODE = "automatic"` (nur diese zwei Werte: `none` | `automatic`):

- Checkout mit `automatic_tax.enabled`; das Abo übernimmt die automatische Steuer für **jede Verlängerung**. Die
  Rechnungsadresse (Land, PLZ) fragt Checkout ab (`billing_address_collection: auto`, `customer_update.address: auto`);
  Kunden ändern sie im Kundenportal.
- Der Preis ist inklusive: Stripe **rechnet die Steuer aus dem Endpreis heraus**, der Endpreis steigt nie. Beispiel
  DE-Privatkunde: 1,00 € Endpreis, darin 0,16 € USt (19 %), netto 0,84 €.
- Welche Länder besteuert werden, entscheidet Stripe Tax **aus den hinterlegten Registrierungen**. Wo keine Registrierung
  besteht, berechnet Stripe keine Steuer (`not_collecting`) – der Endpreis bleibt 1,00 €. Ob das für EU-Ausland
  (Schwelle 10.000 €, OSS) und Drittländer richtig ist, entscheidet der Steuerberater; der Code trifft keine Annahme.
- Unternehmerkunden: Die USt-IdNr. wird im Checkout nicht abgefragt; alle Kunden werden als Verbraucher behandelt
  (kein Reverse Charge). Änderung nur nach steuerlicher Entscheidung.
- **Kein fester Steuersatz (`txr_…`) mehr** – der frühere Code dafür ist entfernt, damit nie zwei Steuerberechnungen
  auf derselben Buchung liegen.
- **Preiserhöhung später:** neuer Preis mit `tax_behavior: inclusive` über `LIVE_CATALOG` (eigener PR, Freigabe);
  Stripe Tax muss dafür nicht neu eingerichtet werden.

## Schutz (fail closed)

Vor jedem Checkout mit `automatic` prüft der Worker bei Stripe: Preis `inclusive` **und** Stripe Tax `active`. Sonst
kein Checkout (`503 TAX_CONFIG_INVALID`, nichts berechnet). `/v1/health` zeigt `tax` (Schalter) und `stripeTax`
(`ok`, `STRIPE_TAX_PENDING`, `STRIPE_TAX_UNREADABLE` …) – auch schon vor dem Einschalten.

## Befund 30.10.2026 (Lauf „Konten — Stripe Live prüfen“ #4, Probe-Berechnungen ohne Buchung)

| Kundenland | Endpreis | darin USt | Grund laut Stripe |
|---|---|---|---|
| DE | 1,00 € | 0,16 € (19 %) | standard_rated |
| AT | 1,00 € | 0,16 € (19 %, deutsche USt) | standard_rated |
| FR | 1,00 € | 0,16 € (19 %, deutsche USt) | standard_rated |
| CH | 1,00 € | 0,00 € | not_collecting (keine Registrierung) |
| US | 1,00 € | 0,00 € | not_collecting (keine Registrierung) |

Stripe Tax `active`, Registrierung `DE:standard`, Steuerkategorie Standard `txcd_10000000` (General – Electronically
Supplied Services), Produkt ohne eigene Kategorie, Preis `inclusive`. EU-Ausland wird mit deutscher USt berechnet (nur
deutsche Registrierung, Lieferschwelle) – Bestätigung und Überwachung der 10.000-€-Schwelle durch den Steuerberater.
Seit diesem Befund `STRIPE_TAX_MODE = "automatic"`.

## Prüfung

`scripts/account/stripe-live-check.mjs --probe-checkout` liest Stripe-Tax-Status, Registrierungen, Steuerkategorie
(Produkt und Standard) und rechnet **Probe-Berechnungen** (Stripe Tax Calculations, keine Buchung, keine Zahlung) für
DE, AT, FR, CH, US. Erwartung DE: Endpreis 1,00 €, USt 0,16 €.

**Steuerkategorie:** Für ein Software-/Research-Abo eignet sich z. B. „General – Electronically Supplied Services“
(`txcd_10000000`) oder „Software as a Service – personal use“ (`txcd_10103000`). Gesetzt ist, was im Stripe-Dashboard als
Standard (Einstellungen → Steuern) bzw. am Produkt `vu_pro` hinterlegt ist; die Wahl bestätigt der Steuerberater.

## Rechnungsangaben (Stripe-Dashboard)

| Einstellung | Wo | Wert |
|---|---|---|
| Steuernummer / USt-IdNr. auf Rechnungen | Einstellungen → Steuern → Steuer-IDs | Steuernummer 65204/71409; USt-IdNr. sobald vorhanden |
| Support-E-Mail und -Website | Einstellungen → Unternehmensdetails → Öffentliche Angaben | info@visionuniverse.de, https://research.visionuniverse.de |
| Belegversand | Einstellungen → Kunden-E-Mails | „Erfolgreiche Zahlungen“ und „Rechnungen“ einschalten |
| Rechnungsfußzeile | Einstellungen → Rechnungen | RAM Consulting UG (haftungsbeschränkt), Bahnhofplatz 15, 74189 Weinsberg, AG Stuttgart HRB 803400 |
| Branding | Einstellungen → Branding | [STRIPE_BRANDING.md](STRIPE_BRANDING.md) |

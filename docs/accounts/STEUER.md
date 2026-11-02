# Umsatzsteuer im Pro-Abo (Stripe Tax)

Stand 02.11.2026. **Keine Steuerberatung.** Die steuerliche Prüfung ist **nicht** erfolgt (Prüfliste unten). Die steuerrechtliche Bewertung, Registrierungs- und Erklärungspflichten
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
- **Preisänderung später:** über die Tarifverwaltung (`/konto/admin/tarife/`, [TARIFVERWALTUNG.md](TARIFVERWALTUNG.md)):
  neuer Stripe-Preis mit `tax_behavior: inclusive` für neue Abschlüsse; Stripe Tax muss nicht neu eingerichtet werden.

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

## Prüfliste für den Steuerberater

Bitte je Punkt bestätigen oder korrigieren. Bis dahin gilt die steuerliche Einordnung als **ungeprüft**.

1. **Leistung:** Vision Universe Pro ist ein Online-Abo für eine Research-Web-App (automatisiert bereitgestellt, kein
   individueller Service). Einordnung als elektronisch erbrachte Dienstleistung (§ 3a Abs. 5 UStG) richtig?
2. **Sitz und Regelbesteuerung:** RAM Consulting UG (haftungsbeschränkt), Weinsberg, regelbesteuert. Inländische
   Verbraucher: 19 % aus dem Bruttopreis (1,00 € = 0,84 € netto + 0,16 € USt) – richtig?
3. **EU-Verbraucher und 10.000-€-Schwelle (§ 3a Abs. 5 Satz 3 UStG):** Unterhalb der Schwelle wird mit deutscher USt
   abgerechnet (so rechnet Stripe Tax heute, nur DE-Registrierung). Wer überwacht die Schwelle (Vorjahr und laufendes Jahr,
   EU-weit für alle elektronischen Leistungen)? Soll auf die Schwelle verzichtet werden?
4. **OSS:** Ab Überschreiten der Schwelle: Anmeldung zum One-Stop-Shop beim BZSt; dann in Stripe Tax die OSS-Registrierung
   hinterlegen, damit der Satz des Kundenlands gilt. Gewünschter Ablauf und Zeitpunkt?
5. **Drittländer (z. B. Schweiz, USA, UK):** Stripe berechnet dort keine Steuer (keine Registrierung). Ist das bei
   Kleinstbeträgen zulässig, oder sollen Verkaufsländer beschränkt werden (z. B. nur EU)?
6. **Unternehmerkunden:** Heute werden alle Kunden als Verbraucher behandelt (keine USt-IdNr.-Abfrage, kein Reverse
   Charge). Beibehalten oder USt-IdNr.-Abfrage einschalten?
7. **Steuerkategorie in Stripe:** `txcd_10000000` (General – Electronically Supplied Services) passend?
8. **Rechnungen:** Stripe-Rechnung mit Firma, Anschrift, Steuernummer, Rechnungsnummer, Leistungszeitraum, Netto,
   Steuersatz und Steuerbetrag – genügt sie § 14 UStG (Kleinbetragsrechnung § 33 UStDV)? Fehlt die USt-IdNr.?
9. **Buchhaltung:** Wie gelangen Stripe-Auszahlungen, Gebühren und Rechnungen in die Buchhaltung (Export, DATEV)?
10. **Erstattungen und Widerruf:** Korrektur der Umsatzsteuer bei Erstattungen über Stripe ausreichend?

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

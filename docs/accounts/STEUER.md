# Umsatzsteuer im Pro-Abo

Stand 29.10.2026. **Keine Steuerberatung.** Hält fest, was technisch eingestellt ist und was die Steuerberatung entscheiden muss.

## Ausgangslage

- RAM Consulting UG (haftungsbeschränkt) ist regelbesteuert, **keine** Kleinunternehmerin (Owner-Angabe 29.10.2026).
- Preis: 1,00 € pro Monat **inkl.** gesetzlicher USt (Stripe-Preis `price_1UVYNiBNKuXfjJefGV0m6LNn`, `tax_behavior` soll
  `inclusive` sein – der Lesecheck `stripe-live-check.mjs` meldet den tatsächlichen Wert). Kein neuer Preis.
- Bei 19 % sind darin 0,16 € USt enthalten (netto 0,84 €). Der Kunde zahlt immer 1,00 €; eine doppelte Steuer entsteht nicht,
  weil kein Satz *aufgeschlagen* wird.

## Einstellung im Worker (`STRIPE_TAX_MODE`)

| Wert | Wirkung | Wann |
|---|---|---|
| `none` (Standard, aktiv) | kein Steuerausweis durch Stripe; Betrag brutto | solange die Steuerberatung nicht entschieden hat |
| `txr_…` | fester Steuersatz (z. B. „USt 19 %, inklusive“) an jedem Abo (`subscription_data.default_tax_rates`); Rechnung weist die USt aus | nur deutsche Endkunden/kein OSS |
| `automatic` | Stripe Tax berechnet den Satz nach Kundenort (Adresse wird abgefragt), Rechnung mit Ausweis | Verkäufe an Verbraucher in andere EU-Staaten über der Schwelle, OSS |

Nur ein Modus gleichzeitig; der Deploy-Workflow lässt nur diese drei Formen zu.

## Offene Entscheidungen

1. Rechnungen mit ausgewiesener USt (§ 14 UStG, Kleinbetragsrechnung § 33 UStDV bis 250 €): Steuersatz `txr_` oder Stripe Tax?
   Rechnungsangaben im Stripe-Dashboard (Firma, Anschrift, Steuernummer bzw. **USt-IdNr. – fehlt**).
2. EU-Verbraucher (B2C): Ort der Leistung beim Kunden (§ 3a Abs. 5 UStG); Lieferschwelle 10.000 € EU-weit; OSS-Registrierung ja/nein.
3. B2B (Unternehmer mit USt-IdNr.): Reverse Charge – nur mit Abfrage der USt-IdNr. (Stripe Tax). Bis zur Entscheidung richtet
   sich das Angebot an Verbraucher und Unternehmer ohne gesonderte Behandlung.
4. Kunden außerhalb der EU: Steuerpflicht im Drittland (z. B. CH, UK, NO); gegebenenfalls auf EU beschränken.
5. `tax_behavior` des bestehenden Preises: ist er `unspecified`, verlangt Stripe Tax `inclusive` – ein Preis lässt sich nicht
   ändern; nur dann wäre ein neuer Preis mit gleichem Betrag nötig (eigene Freigabe).

## Befund Stripe (29.10.2026, Lauf „Konten — Stripe Live prüfen“ #2)

- Preis `tax_behavior: inclusive` – richtig für den Bruttopreis; kein neuer Preis nötig, auch nicht für Stripe Tax.
- Stripe Tax: Status `pending` (nicht eingerichtet), keine Registrierungen, keine Steuersätze, **keine Steuernummer/USt-IdNr.
  für den Rechnungsausweis hinterlegt**. Mit `STRIPE_TAX_MODE = "none"` weisen Stripe-Belege keine USt aus.
- Unternehmensangaben: „RAM Consulting UG (haftungsbeschränkt)“, Land DE, Website visionuniverse.de; Kontoauszug
  „VISION UNIVERSE“ (kein Privatname); Support-E-Mail und -URL **leer**, kein Logo/Icon.

## Vorbereitet (nicht ausgeführt)

- **Fester Steuersatz:** Workflow „Konten — Stripe Live einrichten (Produktion)“ mit `dry_run = false`, `tax_rate = true` legt
  einmalig den Steuersatz „USt. 19 % DE, im Preis enthalten“ an (bzw. findet ihn) und gibt die `txr_…`-ID aus. Erst wenn diese ID
  als `STRIPE_TAX_MODE` in `[env.production.vars]` steht, bekommt jedes neue Abo den Satz; die Rechnung zeigt dann
  1,00 € brutto, darin 0,16 € USt (19 %). Bestehende Abos bleiben unverändert.
- **Schutz gegen Preiserhöhung:** Vor jedem Checkout mit Steuerausweis prüft der Worker bei Stripe, dass der Preis
  `inclusive` und der Steuersatz aktiv und **inklusive** ist; sonst kein Checkout (`TAX_CONFIG_INVALID`, nichts berechnet).
  `/v1/health` zeigt den Zustand als `taxRate` (`ok`, `TAX_RATE_NOT_INCLUSIVE`, `TAX_RATE_INACTIVE`, `TAX_RATE_UNREADABLE`).
- **Steuersatz im Dashboard statt Workflow** (keine GitHub-Freigabe): Stripe → Produktkatalog → Steuersätze →
  „Steuersatz erstellen“: Anzeigename `USt.`, Prozentsatz **19**, **Inklusive** (nicht „Exklusive“), Land Deutschland,
  Steuertyp Umsatzsteuer (VAT). Die angezeigte ID `txr_…` geht in den Abschluss-PR.
- **Öffentlicher Checkout** wird vom Deploy-Workflow abgelehnt, solange `STRIPE_TAX_MODE = "none"` ist
  (`scripts/account/check-public-checkout.mjs`), weil eine regelbesteuerte UG die USt ausweisen muss.

## Empfehlung (Entscheidung Steuerberatung)

Für den Start an Verbraucher in Deutschland und der EU **unterhalb der Schwelle von 10.000 € EU-Auslandsumsatz** (§ 3a Abs. 5
S. 3 UStG): fester Satz 19 % DE (`txr_`). Bei Überschreiten der Schwelle oder bei Verkäufen an Unternehmer im Ausland
(Reverse Charge) auf Stripe Tax (`automatic`) mit OSS-Registrierung wechseln. Kunden außerhalb der EU bis zur Entscheidung
nicht gesondert behandeln (Punkt 4 oben).

## Im Stripe-Dashboard einzutragen (Owner, keine API-Änderung durch uns)

| Einstellung | Wo | Wert |
|---|---|---|
| Steuernummer / USt-IdNr. auf Rechnungen | Einstellungen → Steuern → Steuer-IDs (bzw. Rechnungen → Vorlage) | Steuernummer 65204/71409; USt-IdNr. sobald vorhanden |
| Support-E-Mail und -Website | Einstellungen → Unternehmensdetails → Öffentliche Angaben | info@visionuniverse.de, https://research.visionuniverse.de |
| Logo, Icon, Farbe | Einstellungen → Branding | Vision-Universe-Logo |
| Rechnungs-/Belegversand | Einstellungen → Kunden-E-Mails | „Erfolgreiche Zahlungen“ und „Rechnungen“ einschalten |
| Rechnungsfußzeile | Einstellungen → Rechnungen | Firma, Anschrift, Registergericht, HRB 803400 |

Der Lesecheck „Konten — Stripe prüfen“ meldet Steuereinstellungen, Registrierungen, Steuersätze und Steuer-IDs des Kontos,
ohne etwas zu ändern.

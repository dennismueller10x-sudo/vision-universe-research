# Stripe-Branding Vision Universe

Stand 02.11.2026. Ein Ort für alle Zahlungsoberflächen: **Stripe-Dashboard → Einstellungen → Branding** gilt für
Checkout, Kundenportal, Zahlungsbestätigungen, E-Mail-Belege und Rechnungen. Die Kontoeinstellungen des eigenen
Stripe-Kontos lassen sich über die API nicht ändern (nur für verbundene Connect-Konten) – deshalb einmalig im Dashboard.

## Dateien (aus den offiziellen Markenassets, nicht neu gestaltet)

| Feld in Stripe | Datei | Herkunft |
|---|---|---|
| **Symbol** (quadratisch) | `assets/brand/stripe/vision-universe-icon-stripe.png` (512 × 512, PNG) | App-Icon `assets/icons/icon-512.png`: dieselbe Wortmarke auf Weiß, für kleine Darstellungen auf 84 % Breite |
| **Logo** | `assets/brand/stripe/vision-universe-logo-stripe.png` (1600 × 211, PNG, transparent) | offizielle Wortmarke `assets/vision-universe-logo.png`, eng zugeschnitten |

Download: `https://research.visionuniverse.de/assets/brand/stripe/vision-universe-icon-stripe.png` bzw.
`…/vision-universe-logo-stripe.png` (oder direkt aus dem Repository). Ein eigenes Kurzsymbol (Monogramm) gibt es in den
Markenassets nicht; es wurde keines erfunden.

## Farben (aus dem Website-Design, `assets/site-navigation.css`)

| Feld in Stripe | Wert | Herkunft |
|---|---|---|
| **Markenfarbe** (Hintergrund) | `#FFFFFF` | heller Website-Hintergrund; ruhig, wie Apple/Trade Republic |
| **Akzentfarbe** (Schaltflächen) | `#C8F531` | `--vu-accent`, die Schaltflächenfarbe der Kontoseiten; Stripe setzt dunkle Schrift (Kontrast wie `--vu-on-accent #101318`) |

## Öffentliche Angaben (Einstellungen → Unternehmensdetails)

- Öffentlicher Name: **Vision Universe**; Firma bleibt **RAM Consulting UG (haftungsbeschränkt)** (Rechnung, Vertragspartner).
- Abrechnungsbeschreibung (Kontoauszug): **VISION UNIVERSE** – bereits gesetzt, kein Privatname.
- Support: info@visionuniverse.de, Website https://research.visionuniverse.de. Keine private Telefonnummer veröffentlichen.

## Kundenportal

Kündigung zum Laufzeitende, Zahlungsmethode, Rechnungen und Rechnungsadresse sind per API eingestellt; die Links
zeigen auf `konto.visionuniverse.de/rechtliches/agb` und `/datenschutz`. Das Aussehen folgt dem Branding oben.

## Schritt für Schritt (Owner, ca. 10 Minuten, Live-Modus)

Die Bezeichnungen im Stripe-Dashboard können leicht abweichen; maßgeblich ist der Inhalt.

1. **Einstellungen → Unternehmen → Branding**: Symbol `vision-universe-icon-stripe.png`, Logo
   `vision-universe-logo-stripe.png`, Markenfarbe `#FFFFFF`, Akzentfarbe `#C8F531` → Speichern. Die Vorschau zeigt
   Checkout, Belege und Kundenportal.
2. **Einstellungen → Unternehmen → Öffentliche Angaben**: öffentlicher Name „Vision Universe“, Support-E-Mail
   info@visionuniverse.de, Website https://research.visionuniverse.de, Abrechnungsbeschreibung „VISION UNIVERSE“ (prüfen,
   ist gesetzt). Keine Telefonnummer, solange R2 offen ist.
3. **Einstellungen → Steuern / Steuer-IDs**: Steuernummer 65204/71409 hinterlegen und auf Rechnungen anzeigen; USt-IdNr.
   erst eintragen, wenn sie vorliegt (R2).
4. **Einstellungen → Billing → Rechnungen**: Firma „RAM Consulting UG (haftungsbeschränkt)“, Anschrift wie im Impressum;
   Rechnungsnummern-Präfix nach Wunsch.
5. **Einstellungen → Unternehmen → Kunden-E-Mails**: „Erfolgreiche Zahlungen“ und „Erstattungen“ einschalten (Beleg an
   den Kunden).
6. Kontrolle beim Testkauf ([ZAHLUNGSPRUEFUNG.md](ZAHLUNGSPRUEFUNG.md), Schritt 4 und 6).

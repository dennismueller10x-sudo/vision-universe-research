# Rechtliche und steuerliche Prüfpunkte vor der ersten Zahlung

Stand 29.10.2026. **Keine Rechtsberatung.** Diese Liste hält fest, was technisch geprüft wurde und welche Entscheidungen
die RAM Consulting UG (haftungsbeschränkt) bzw. ihre Rechts- und Steuerberatung treffen muss. Der Code nimmt keinen dieser Punkte
als gelöst an. Status: **offen – vor der ersten Zahlung eines Kunden prüfen.** Für den internen 1-EUR-Test des Owners
(Rolle `billing_tester`, eigenes Konto) entscheidet der Owner, ob er mit diesem Stand testen will.

| # | Punkt | Befund im Code | Entscheidung / Prüfung | Status |
|---|---|---|---|---|
| R1 | **Verlinkte Bedingungen in der Bestellbestätigung** | `/konto/tarife/` verlinkt `https://www.visionuniverse.de/policies/terms-of-service` und `…/refund-policy` (Attribut `data-legal`). Das sind die **Shop-Richtlinien** des Shopify-Shops; nicht geprüft, ob sie ein digitales Abo (Vision Universe Pro) abdecken | eigene Nutzungsbedingungen/AGB für das Digitalabo und eine dazu passende Widerrufsbelehrung erstellen lassen; danach die beiden `href` ersetzen (eine Stelle: `konto/tarife/index.html`, `data-legal="terms"` und `"withdrawal"`) | **offen** |
| R2 | Registrierung „akzeptiere die Nutzungsbedingungen“ | Checkbox verlinkt nur die Datenschutzhinweise; `termsVersion: entwurf-2026-10` | Nutzungsbedingungen für das kostenlose Konto festlegen und verlinken; Fassung hochzählen | **offen** |
| R3 | Widerrufsrecht bei digitalen Dienstleistungen | Bestätigungstext: ausdrückliches Verlangen des sofortigen Beginns und Kenntnis der anteiligen Zahlung bei Widerruf (Wertersatz, § 357a Abs. 2 BGB); Fassung `abo-2026-10` mit Zeitpunkt in den Metadaten der Checkout-Sitzung | Wortlaut, Muster-Widerrufsformular und Belehrung prüfen; Einordnung digitale Dienstleistung vs. digitaler Inhalt (§ 356 Abs. 4/5 BGB) | **offen** |
| R4 | Vertragsbestätigung auf dauerhaftem Datenträger (§ 312f BGB) | Kunde erhält die Zahlungsbestätigung/Rechnung von Stripe; **keine eigene Vertragsbestätigung** mit Vertragsinhalt und Widerrufsbelehrung | festlegen, ob Stripe-Belege genügen oder eine eigene Bestätigungs-E-Mail (Brevo, Vorlage wie Kündigungsbestätigung) nötig ist | **offen** |
| R5 | Button-Lösung (§ 312j Abs. 3 BGB) | eigener Knopf heißt „Weiter zur Zahlung bei Stripe“ (kein Bestellknopf); der letzte Knopf liegt bei Stripe Checkout („Abonnieren“) | prüfen, ob die Stripe-Beschriftung genügt; sonst eingebetteter Checkout mit eigenem Knopf „zahlungspflichtig abonnieren“ | **offen** |
| R6 | Preisangabe „inkl. MwSt.“ | Seiten zeigen „1,00 € pro Monat inkl. MwSt.“; Betrag `plan_prices` brutto | steuerlichen Status der UG klären (Regelbesteuerung oder Kleinunternehmer § 19 UStG). Bei Kleinunternehmerregelung wäre „inkl. MwSt.“ falsch | **offen** |
| R7 | Rechnungsangaben, Umsatzsteuer EU (OSS) | Stripe-Rechnungen nach Dashboard-Einstellung; kein Stripe Tax | Rechnungsangaben (Firma, Anschrift, USt-IdNr.), Steuersatz, ggf. OSS/Stripe Tax in Stripe einstellen | **offen** |
| R8 | Datenschutzerklärung | `landing/datenschutz/` ist ein **Entwurf** (Coming-soon) | um Konto, Supabase (Frankfurt), Cloudflare, Stripe, PayPal, Klarna, Brevo ergänzen; AV-Verträge | **offen** |
| R9 | Impressum | `landing/impressum/` nennt RAM Consulting UG (haftungsbeschränkt), Weinsberg | prüfen, ob es für das Digitalangebot unter `research.visionuniverse.de` vollständig ist (Registergericht, Vertretung, USt-IdNr.) | **offen** |
| R10 | Kündigungsbutton (§ 312k BGB) | umgesetzt (`/konto/kuendigen/`, Bestätigung per E-Mail) | Rechtsprüfung wie in ACCOUNTS_AND_SUBSCRIPTIONS.md §8 | umgesetzt, Prüfung offen |
| R11 | PayPal-Abos, Klarna | Zahlungsarten wählt Stripe dynamisch; PayPal für wiederkehrende Zahlungen im Stripe-Dashboard ggf. gesondert freizuschalten | im Stripe-Dashboard prüfen (Einstellungen → Zahlungsmethoden → PayPal → wiederkehrende Zahlungen) | Owner |
| R13 | Shopify-Texte auch im Stripe-Kundenportal | `scripts/account/stripe-live-setup.mjs` (`LEGAL`) setzt im Portal `privacy_policy_url`/`terms_of_service_url` auf `www.visionuniverse.de/policies/privacy-policy` bzw. `…/terms-of-service` (Shop-Texte) | mit R1/R8 ersetzen; danach Einrichtungs-Workflow erneut laufen lassen | **offen** |
| R12 | „Interner Testpreis“ 1,00 € | öffentlich nicht verlinkt, Checkout nur für Tester | vor öffentlicher Freigabe endgültigen Preis festlegen (eigener PR, `LIVE_CATALOG`) | Owner |

Technisch sichergestellt (unabhängig von den offenen Punkten): kein Checkout ohne Bestätigung (`confirm: true`), kein Checkout ohne
Rolle `billing_tester`, Preis wird vor jeder Sitzung bei Stripe abgeglichen, Pro nur aus verifizierten Stripe-Ereignissen,
Abbruch lässt das Konto Free.

## Was für welchen Schritt gelten muss

| Schritt | Voraussetzung aus dieser Liste |
|---|---|
| Interner 1-EUR-Test des Owners (eigenes Konto, Rolle `billing_tester`) | Owner-Entscheidung, mit offenem R1–R9/R13 zu testen (Vertragspartner ist das eigene Unternehmen); R6 (Steuerstatus) sollte bekannt sein, weil Stripe die Rechnung mit „inkl. MwSt.“ ausstellt; R11 (PayPal-Abos) muss im Stripe-Dashboard aktiv sein |
| Erste Zahlung eines Kunden (weitere Tester) | R1–R9 und R13 geprüft und umgesetzt |
| Öffentliche Freigabe (`VU_CHECKOUT_ACCESS = "public"`) | alles oben, R12 entschieden, eigener Freigabe-PR |

Die verlinkten Shopify-Texte (R1, R13) gelten in keinem Schritt als geprüft oder freigegeben.

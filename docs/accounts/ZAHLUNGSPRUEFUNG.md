# Abschließende Zahlungsprüfung (Testkauf Pro, Live)

Stand 02.11.2026. Ein echter Kauf mit echtem Geld (1,00 €) über das **private Testkonto** (Rolle `billing_tester`).
Möglich schon jetzt, weil der Checkout auf `testers` steht – vor der öffentlichen Freigabe. Den Kauf löst nur der Owner
aus; Claude löst keine Zahlung aus und prüft danach nur lesend.

## Ablauf (Owner, ca. 10 Minuten)

1. Mit dem Testkonto anmelden: https://research.visionuniverse.de/konto/anmelden/
2. Angemeldet direkt zur Tarifseite: https://research.visionuniverse.de/konto/tarife/?plan=pro (der Knopf auf `/preise/`
   führt Nicht-Angemeldete zur Registrierung). Prüfen: Preis 1,00 € pro Monat inkl. USt.
3. Bestellübersicht „Pro abonnieren“: Haken setzen → **Weiter zur Zahlung bei Stripe**.
4. Stripe-Zahlungsseite: Prüfen, dass Vision Universe mit Logo und Farben erscheint (nach S2), 1,00 € gesamt,
   davon 0,16 € USt, der Hinweistext über „Abonnieren“, Links zu Bedingungen und Widerrufsbelehrung.
   Zahlungsart wählen (am einfachsten Karte oder PayPal) → **Abonnieren**.
5. Zurück auf `/konto/abo/`: Pro aktiv, nächste Abbuchung in einem Monat.
6. Postfach: **Vertragsbestätigung** (Vertragsinhalt, Preis, Bedingungen, Widerrufsbelehrung, Muster-Formular) und
   Stripe-Beleg/Rechnung (Firma, Steuernummer, 0,16 € USt ausgewiesen).
7. **Kündigen**: `/konto/abo/` → „Zahlung, Rechnungen und Kündigung verwalten“ (Stripe-Kundenportal) bzw. angemeldet „Verträge hier kündigen“ → kündigen. Erwartung: Pro bis zum Ende des Monats,
   danach Free. Alternativ die öffentliche Kündigungsfunktion `https://konto.visionuniverse.de/kuendigen` testen
   (Eingangsbestätigung per E-Mail; Ausführung bewusst manuell).
8. **Erstattung** (optional): Stripe-Dashboard → Zahlungen → die 1,00-€-Zahlung → Erstatten.
9. Claude Bescheid geben („Testkauf erledigt“).

## Was Claude danach lesend prüft (keine Änderungen)

| Prüfung | Quelle | Erwartung |
|---|---|---|
| Abo angelegt und zugeordnet | `public.subscriptions` | 1 Abo, `pro_month_live`, Status `active` (nach Kündigung: `cancel_at_period_end`) |
| Zahlungsereignisse vollständig | `billing.payment_events` | Checkout, Abo, Rechnung bezahlt; keine fehlgeschlagenen Ereignisse |
| Rechnung gespeichert | `public.invoices` | 1 Rechnung, 100 Cent brutto |
| Vertragsbestätigung verschickt | `billing.mail_outbox` | `contract_confirmation` mit Status „gesendet“ |
| Pro freigeschaltet | `/v1/me` im Browser des Owners | Tarif Pro, Funktionen von Pro |
| Worker-Zustand unverändert | `/v1/health` | `checkout: testers`, `tax: automatic`, `stripeTax: ok` |

Stripe-seitig (Owner, Dashboard): Rechnung mit 0,16 € USt, Stripe Tax hat die Transaktion erfasst, Webhook-Zustellung
ohne Fehler (Entwickler → Webhooks → Endpunkt → Ereignisse).

## Ergebnis

| Datum | Zahlungsart | Ergebnis | Auffälligkeiten |
|---|---|---|---|
| 02.11.2026, 16:01 | Live, Testkonto (`billing_tester`) | **bestanden** (lesend geprüft) | siehe unten |

Befund aus den Produktionsdaten (Supabase, nur lesend):
- Zahlung: 1 Rechnung `paid`, 100 Cent brutto bezahlt, Live-Modus, PDF vorhanden; 1 Stripe-Kunde.
- Webhooks: 7 Ereignisse, alle `processed` (checkout.session.completed, customer.subscription.created/updated,
  invoice.created/finalized/paid/payment_succeeded), keine fehlgeschlagenen.
- Pro-Status: Abo `pro_month_live` aktiv; Dashboard zeigt „Pro“.
- Vertragsbestätigung: `contract_confirmation` versendet.
- Kündigung: angemeldet ausgelöst, sofort ausgeführt (`completed`, `cancel_at_period_end`), Eingangsbestätigung
  versendet; Pro bis 02.12.2026, danach automatisch Free.
- Offen (nur im Stripe-Dashboard sichtbar): Umsatzsteuerausweis 0,16 € auf der Rechnung, Branding der Rechnung.

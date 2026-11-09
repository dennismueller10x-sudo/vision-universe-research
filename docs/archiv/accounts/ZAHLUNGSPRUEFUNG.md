# Abschließende Zahlungsprüfung (Testkauf Pro, Live)

Stand 02.11.2026. Ein echter Kauf mit echtem Geld (1,00 €) über das **private Testkonto** (Rolle `billing_tester`).
Möglich schon jetzt, weil der Checkout auf `testers` steht – vor der öffentlichen Freigabe. Den Kauf löst nur der Owner
aus; Claude löst keine Zahlung aus und prüft danach nur lesend.

## Ablauf (Owner, ca. 10 Minuten)

1. Mit dem Testkonto anmelden: https://research.visionuniverse.de/konto/anmelden/
2. https://research.visionuniverse.de/preise/ → **Pro auswählen**. Prüfen: Preis 1,00 € pro Monat inkl. USt, Hinweis
   „interner Testpreis“ ist sichtbar (nur bis zur Freigabe).
3. Bestellübersicht: Haken setzen → **Weiter zur Zahlung bei Stripe**.
4. Stripe-Zahlungsseite: Prüfen, dass Vision Universe mit Logo und Farben erscheint (nach S2), 1,00 € gesamt,
   davon 0,16 € USt, der Hinweistext über „Abonnieren“, Links zu Bedingungen und Widerrufsbelehrung.
   Zahlungsart wählen (am einfachsten Karte oder PayPal) → **Abonnieren**.
5. Zurück auf `/konto/abo/`: Pro aktiv, nächste Abbuchung in einem Monat.
6. Postfach: **Vertragsbestätigung** (Vertragsinhalt, Preis, Bedingungen, Widerrufsbelehrung, Muster-Formular) und
   Stripe-Beleg/Rechnung (Firma, Steuernummer, 0,16 € USt ausgewiesen).
7. **Kündigen**: `/konto/abo/` → Abo verwalten (Stripe-Kundenportal) → kündigen. Erwartung: Pro bis zum Ende des Monats,
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
| – | – | noch nicht durchgeführt | – |

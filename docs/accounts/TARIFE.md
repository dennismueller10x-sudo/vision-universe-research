# Tarife Free und Pro

Owner-Entscheidung vom 28.10.2026. Zwei öffentliche Tarife auf der bestehenden Produktionsinfrastruktur
(Supabase `qiytbnpoqvldsatpfkeh`, Worker `vu-account`, Stripe Live der RAM Consulting UG).

| Tarif | Preis | Umfang |
|---|---|---|
| Free | 0 EUR, ohne Zahlungsdaten | alle freigegebenen Funktionen, Watchlist bis 25 Listen / 500 Titel |
| Pro | 1,00 EUR/Monat inkl. USt, wiederkehrend (interner Einführungs-/Testpreis) | derzeit **identisch** mit Free |

In keinem Tarif: `quant.screener.full` (Quant-Gesamtscore), `supertrader.signals` (unveröffentlichte Signale),
`alerts.push`, `export.csv`. `plus` existiert nur noch als verborgene Zeile (nicht öffentlich, nicht aktiv, kein Live-Preis).
Quelle: `supabase/migrations/20261028000200_free_pro.sql`.

## Abläufe

- **Free:** `/konto/tarife/` → „Kostenlos registrieren“ → E-Mail bestätigen → anmelden → Konto und Watchlist.
- **Pro (neu):** „Pro auswählen“ → Registrierung (`?plan=pro`, Wahl im Browser gemerkt, 7 Tage) → E-Mail bestätigen →
  automatisch zur Pro-Bestätigung auf `/konto/tarife/?plan=pro` → Preis, Laufzeit, Kündigung, Widerrufsfolgen
  bestätigen → Stripe Checkout → `/konto/abo/?checkout=success` → Pro.
- **Pro (bestehendes Konto):** `/konto/tarife/` → „Pro auswählen“ → bestätigen → Stripe Checkout.
- **Abbruch/abgelehnte Karte:** Rücksprung `/konto/tarife/?checkout=canceled`, kein Abo, Konto bleibt Free.
- **Kündigung:** Kundenportal oder `/konto/kuendigen/` (§ 312k BGB), immer zum Ende der bezahlten Zeit; danach
  rechnet die Datenbank automatisch Free (`effective_entitlements`). Fehlgeschlagene Zahlung: `past_due` mit Kulanzfrist,
  Hinweis auf `/konto/abo/`, danach Free.

## Sicherungen

- Checkout serverseitig: Preis aus `plan_prices`, vorher bei Stripe abgeglichen; ein gültiges Abo verhindert ein zweites
  (`ALREADY_SUBSCRIBED`); Bestätigung `confirm: true` Pflicht (Fassung `abo-2026-10` und Zeitpunkt in den
  Metadaten der Checkout-Sitzung).
- `VU_CHECKOUT_ACCESS = "testers"`: nur Konten mit Rolle `billing_tester` (vergibt nur der Betrieb; Nutzer können
  `user_roles` nur lesen). Andere erhalten `403 CHECKOUT_NOT_OPEN` und sehen „Pro ist noch nicht buchbar“.
- Webhooks: Signatur, Idempotenz, Zustand immer frisch von Stripe.

## Spätere Varianten (vorbereitet, nicht aktiv)

Jede Variante ist ein eigener PR mit Vorher/Nachher; Daten werden nie gelöscht (über einer Grenze kommt nur nichts Neues hinzu).

- **A – eingeschränktes Free, volles Pro:** `plan_features` von `free` verkleinern, Zusatzfunktionen nur bei `pro`.
  Die SQL-Tests 04 und 08 prüfen genau diesen Fall (Grenze, Hochstufung, Herabstufung).
- **B – nur Pro:** `free` ohne Funktionen bzw. nur Konto; Registrierung bleibt offen.
- **C – Early Access läuft weiter:** dieser Stand.
- Preisänderung (z. B. 9,99 oder 29,99 EUR): `LIVE_CATALOG` in `scripts/account/stripe-live-setup.mjs` ändern und den
  Workflow „Konten — Stripe Live einrichten“ laufen lassen; der neue Preis übernimmt den Nachschlageschlüssel, der alte
  bleibt für laufende Abos unverändert.

## Öffentlich öffnen (später, eigene Freigabe)

Zwei unabhängige Schlüssel ([FREIGABEN.md](FREIGABEN.md)): `VU_CHECKOUT_ACCESS = "public"` per PR **und**
`vu_public_checkout = true` am Stripe-Produkt, von Hand im Stripe-Dashboard. Erst nach dem gemeinsamen
Ende-zu-Ende-Test mit echter Zahlung und rechtlicher Prüfung (Impressum, AGB/Nutzungsbedingungen,
Widerrufsbelehrung, Umsatzsteuer/Kleinunternehmerstatus, Rechnungsangaben in Stripe).

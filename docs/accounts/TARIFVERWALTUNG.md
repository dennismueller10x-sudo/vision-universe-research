# Tarifverwaltung – Preise ändern ohne Deployment

Stand 30.10.2026. Adresse: **https://research.visionuniverse.de/konto/admin/tarife/** (nur mit Rolle `pricing_admin`).

Eine Preisänderung braucht **keinen** GitHub-Lauf und keine GitHub-Freigabe. Die ausdrückliche Bestätigung geschieht in
der Oberfläche: Vorschau → Zusammenfassung → Passwort + Haken „geprüft“ → Ausführung.

## Was eine Änderung tut

1. legt bei Stripe einen **neuen** Preis an: gleiches Produkt, gleiche Laufzeit, Endpreis **inkl. USt**
   (`tax_behavior: inclusive`). Stripe Tax rechnet die Umsatzsteuer aus dem Endpreis heraus, der Endpreis steigt nicht.
   Der Lookup-Key wandert zum neuen Preis;
2. macht ihn in `public.plan_prices` zum aktiven Preis (eine Transaktion; der alte bleibt als inaktive Zeile erhalten);
3. ab dann zeigen Preisseite (`/preise/`), Tarifseite und Registrierung den neuen Preis, und neue Checkouts nutzen ihn
   (spätestens nach 5 Minuten Katalog-Cache des Workers).

**Bestehende Abos behalten ihren Preis**: Ihre Stripe-Subscription verweist weiter auf den alten Stripe-Preis, und die
alte Zeile in `plan_prices` bleibt für ihre Ereignisse erhalten. Eine Umstellung bestehender Abos ist nicht eingebaut
(sie wäre eine eigene Entscheidung mit Ankündigungspflicht gegenüber den Kunden).

Der alte Stripe-Preis wird nicht archiviert, weil laufende Abos ihn brauchen. Neue Abschlüsse erreichen ihn nicht mehr,
denn der Checkout nimmt nur den aktiven Preis aus `plan_prices`.

## Sicherungen

| Anforderung | Umsetzung |
|---|---|
| nur berechtigte Betreiber | Server prüft die Rolle `pricing_admin` in `user_roles` bei **jeder** Anfrage (403 `NOT_PRICING_ADMIN`) |
| keine Selbstvergabe | `user_roles` ist für Konten nur lesbar (RLS, SQL-Test `11_pricing_admin.sql`); vergeben wird nur über den Datenbankzugang des Betriebs |
| erneute Anmeldung | Ausführung nur mit aktuellem Passwort (`reauthenticate`), dazu Rate-Limit `sensitive` |
| ausdrückliche Bestätigung | `confirm: true` nur nach Vorschau und angehaktem Haken; die Vorschau ändert nichts |
| doppelte Ausführung | Vorgangs-ID `pc_…` je Vorschau: eindeutig im Audit-Log, Stripe-Idempotenzschlüssel `vu-price-<ID>`; Wiederholung schließt einen halb fertigen Vorgang ab, legt aber nichts doppelt an |
| gleichzeitige Änderungen | Vorschau merkt sich den Stripe-Preis; ist er inzwischen ein anderer → 409 `PRICE_CHANGED`; ein offener Vorgang je Tarif (15 min) → 409 `CHANGE_IN_PROGRESS`; Datenbank: höchstens ein aktiver Preis je Tarif und Laufzeit |
| Steuer | bei `STRIPE_TAX_MODE=automatic` nur mit aktivem Stripe Tax (sonst 503 `TAX_CONFIG_INVALID`); alter Preis muss `inclusive` sein |
| Grenzen | 0,50 € bis 999,99 € je Abrechnungszeitraum; Hinweis bei mehr als ±50 % |
| Audit-Log | `billing.price_changes`: wer, wann, alt, neu, Stripe-Preis, Ergebnis, Fehler; die Oberfläche zeigt die letzten 20 |
| Fehler | Fehler vor Stripe → `failed`, nichts geändert. Fehler nach Stripe → bleibt `stripe_created`; erneut bestätigen schließt ab |
| keine Schlüssel im Browser | Stripe-Aufrufe nur im Worker; die Seite spricht nur `/v1/admin/pricing*` mit Sitzungs-Cookie + CSRF-Kopf |

Neue Infrastruktur: keine. Neu sind eine Migration (Tabelle, Funktionen, Rollenwert), drei Worker-Routen und eine Seite.

## Rolle vergeben (einmalig, Owner-Zustimmung)

Die Rolle ist eine Änderung an Produktionsdaten und wird **nur mit ausdrücklicher Zustimmung des Owners** vergeben, nie
von der Oberfläche aus. Über den bestehenden Datenbankzugang (Supabase SQL-Editor):

```sql
insert into public.user_roles (user_id, role)
select id, 'pricing_admin' from auth.users where lower(email) = lower('<E-Mail des Owners>')
on conflict do nothing;
```

Entziehen: `delete from public.user_roles where role = 'pricing_admin' and user_id = '<id>';`

## Verhältnis zu den Workflows

- `account-production-stripe.yml` (Stripe-Einrichtung, Owner-Freigabe) bleibt für Produkte, Portal, Webhook und
  Zahlungsmethoden. Einen in der Tarifverwaltung gesetzten Preis (Stripe-Metadaten `vu_change_id`) setzt sie **nicht**
  auf den Katalogpreis zurück und schreibt keine Preiszeile.
- `release-guard.mjs` betrifft Preise nicht: Preise sind Daten, keine Worker-Konfiguration.

## Prüfung

- SQL: `supabase/tests/11_pricing_admin.sql`
- Worker-Ablauf gegen PostgreSQL + simuliertes Stripe: `workers/vu-account/tests/flows.test.mjs` („Tarifverwaltung“)
- Browser: `scripts/account/browser-qa.mjs` (ohne Rolle gesperrt, Vorschau, ohne Haken nichts, Änderung, Protokoll, mobil)

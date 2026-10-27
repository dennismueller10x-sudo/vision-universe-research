# ADR-006: Konten und Abonnements

**Status:** vorgeschlagen (25.10.2026), gebaut und ausgeschaltet · Details: [docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md](../accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md)

## Entscheidung

1. **Identität: Supabase Auth.** `auth.users.id` ist die einzige Benutzer-ID für Web und App. Nutzerdaten liegen in Supabase Postgres mit RLS auf jeder Tabelle;
   das Modell folgt `core/contracts/user-data.schema.json`. Keine Markt- oder Finanzdaten in Supabase.
2. **Server: ein Cloudflare Worker (`workers/vu-account`) als Backend-for-Frontend.** Statische Seiten unter `/konto/`, Sitzung in HttpOnly-Cookies einer Subdomain derselben Site
   (`account.visionuniverse.de`). Apps nutzen dieselbe API mit `Authorization: Bearer`. Kein Supabase- oder Stripe-SDK, keine neue Laufzeit (Muster wie `vu-ask`).
3. **Abrechnung anbieterunabhängig.** Tarife, Funktionen, Abos, Rechnungen und Zahlungsereignisse sind eigene Tabellen mit Anbieter-Spalte. Berechtigungen rechnet
   ausschließlich die Datenbank (`effective_entitlements`): höchster gültiger Tarif aus allen Quellen. Stripe ist der erste Anbieter; Apple/Google liefern später denselben Schnappschuss.
4. **Stripe-Zustand wird nie aus Ereignissen übernommen,** sondern nach geprüfter Signatur frisch abgerufen. Kunde ↔ Nutzer entsteht nur serverseitig vor der Zahlung.
5. **Ausgeschaltet bis zur Freigabe:** leerer Endpunkt, geschlossene Registrierung, Live-Schlüssel nur mit `STRIPE_LIVE_MODE_APPROVED=true`.

## Nicht gewählt

- **Vercel-Funktionen** (`api/`): Hobby-Plan schließt kommerzielle Nutzung aus; Vercel ist im Repo bewusst auf drei Datenfunktionen begrenzt.
- **Supabase Edge Functions:** Deno-Laufzeit und Supabase-CLI zusätzlich zu Node/Wrangler; keine Wiederverwendung der Worker-Muster und -Tests.
- **supabase-js im Browser:** Tokens in `localStorage`, Drittanbieter-Code in allen Kontoseiten.
- **Berechtigung im Stripe-Metadatenfeld oder im JWT-Claim:** an Stripe gekoppelt bzw. bis zum Token-Ablauf veraltet.

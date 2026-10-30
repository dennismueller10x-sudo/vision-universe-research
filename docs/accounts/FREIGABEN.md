# Freigaben – was automatisch läuft, was der Owner freigibt

Stand 29.10.2026, verbindlich. Ziel: Normale Entwicklung braucht **keine** GitHub-Freigabe. Eine ausdrückliche
Owner-Freigabe bleibt nur für Geld, Preise, Secrets und Datenverlust. Eine einzige zusätzliche Umgebung (`account-auto`)
ist nötig – Begründung unten.

## Matrix

| Schritt | Workflow | Auslöser | Freigabe |
|---|---|---|---|
| Tests (Konten, Kern, Browser) | `account-ci.yml`, `core-ci.yml` u. a. | jeder PR und Push | **keine** |
| Website (research.visionuniverse.de) | GitHub Pages / Cloudflare Pages | Merge nach `main` | **keine** |
| Konto-Worker ausrollen (Code, öffentliche Konfiguration) | `account-production-auto.yml` → `worker` | Merge nach `main` (Worker/Migrationen) | **keine** |
| Nicht destruktive Migration | `account-production-auto.yml` → `migrationen` | Merge nach `main` | **keine** (automatische Prüfungen, s. u.) |
| Stripe, Brevo, Worker lesend prüfen | `account-production-checks.yml` | täglich 05:41 UTC, von Hand | **keine** |
| Datenbank-Sicherung (verschlüsselt) | `account-backup.yml` | täglich | **keine** |
| **Zahlungen öffnen oder Schutz entfernen**: Checkout erweitern (`off`→`testers`→`public`), Live-Abrechnung **ein**, Kündigungsautomatik **ein**, Stripe Tax **aus** | `account-production-auto.yml` → `zahlungsfreigabe` | nur bei genau so einer Änderung gegenüber dem laufenden Worker | **Owner** (`account-production`) |
| Einschränken oder geprüften Schutz hinzufügen: Checkout zurück (`public`→`testers`→`off`), Live-Abrechnung aus, Kündigungsautomatik aus, **Stripe Tax ein**, Rechtsfassung bestätigen (allein ohne Zahlungswirkung) | `account-production-auto.yml` → `worker` | Merge nach `main` | **keine** |
| **Stripe-Produkte, Preise, Portal, Webhook, Steuersatz** | `account-production-stripe.yml` | von Hand | **Owner** (`account-production`, `account-dev`) |
| **Secrets** setzen/erneuern (Supabase, Stripe, Brevo) | `account-production-deploy.yml` | von Hand | **Owner** (`account-dev`, `account-production`) |
| **Destruktive Migration** (DROP, TRUNCATE, Kundendaten ändern, RLS aus, Rollen, Preise) | `account-db-approved.yml` (Eingabe `DESTRUKTIV`) | von Hand | **Owner** (`account-dev`) |
| **Kündigungen ausführen**, Supabase Auth | `account-cancellations.yml`, `account-production-auth.yml` | von Hand | **Owner** (`account-dev`) |

Code-Änderungen am Abrechnungscode sind **keine** Freigabesache: Sie laufen wie jeder Code über Tests und CI. Freigabepflichtig
ist, was Geld bewegt oder freischaltet – und das steht in der Konfiguration, nicht im Code.

## Wie die Automatik sich absichert

**Worker** (`account-production-auto.yml`):
1. nur von `main`; Tests, Produktionskonfiguration, `check-public-checkout.mjs` (öffentlicher Checkout nur mit freigegebenen
   Rechtstexten, bestätigter Fassung, Live-Freigabe, USt-Ausweis), Worker-Bundle;
2. `release-guard.mjs` vergleicht die zahlungsrelevanten Schalter der Konfiguration mit dem, was der **laufende** Worker unter
   `/v1/health` meldet – zustandslos, ohne Lauf-Historie – und bewertet die **Richtung**: Nur was Zahlungen öffnet oder
   einen Schutz entfernt, wartet auf die Owner-Freigabe in `account-production` (der Worker-Job prüft sie zusätzlich
   selbst, fail closed). Unbekannte Werte und ein nicht erreichbarer Worker gelten als freigabepflichtig. Stripe Tax
   einschalten ist automatisch, weil der Worker vor jedem Checkout prüft, dass Preis `inclusive` und Stripe Tax aktiv ist;
3. `wrangler deploy` ohne Secrets; danach muss `/v1/health` wieder zur Konfiguration passen.

**Migrationen** (`scripts/account/migrate-production.mjs`, aus PR #1063 übernommen und um den Produktionsfall ergänzt):
1. Historie: nur neue Dateien nach der letzten eingespielten Version;
2. statische Prüfung: kein DROP/TRUNCATE/DROP COLUMN/Typwechsel, kein RLS-Abschalten, kein Schreiben in Kundentabellen,
   keine Rollen, Preise oder Registrierungsschalter;
3. alle neuen Dateien in **einer** Transaktion (REPEATABLE READ) mit Integritätsprobe: jede bestehende Zeile jeder
   Kundentabelle bleibt inhaltsgleich, RLS/Rechte/Policies werden nicht schwächer, Testerrollen, Live-Preise und
   Registrierungsschalter bleiben gleich – sonst wird alles zurückgerollt (auch bei verstecktem SQL). Getestet gegen
   PostgreSQL, einschließlich „9 Migrationen + Kundendaten, die 10. läuft automatisch“.

**Umgebung `account-auto`**: Jeder Job, der sie nutzt, prüft vorher mit `check-auto-env.mjs`, dass sie existiert und nur
`main` erlaubt; fehlt sie, wird nichts ausgerollt (sonst würde GitHub sie ungeschützt anlegen). Ein Wächter-Test
(`workflow-environments.test.mjs`) sichert bei jeder Workflow-Änderung: `account-auto` nur in vier benannten Jobs und nur mit
fünf Secrets, nie aus Pull Requests; jeder Job in `account-dev`/`account-production` prüft die Freigabe selbst.

## Warum genau eine neue Umgebung

- In `account-dev` und `account-production` wartet **jeder** Job auf eine Freigabe (Required reviewers). Ohne Freigabe kommt
  kein Job an deren Secrets – das ist die Ursache der Freigabeschleife.
- Repository-Secrets wären ohne Freigabe nutzbar, aber **von jedem Branch** (auch aus PR-Branches). Für den Datenbankzugang
  ist das zu weit.
- Eine Umgebung **ohne** Reviewer, aber **nur für `main`**, ist das kleinste Mittel, das einen Secret ohne Menschen schützt:
  Nur Code, der in `main` angekommen ist (Tests, CI, Wächter), kommt heran.
- Reviewer aus `account-dev` zu entfernen, wäre keine Alternative: Dort liegen auch Supabase-Secret-Key und Management-Token
  (Auth-Einstellungen), die weiterhin Freigabe brauchen.

## Warum der Stripe-Tax-Wechsel am 30.10.2026 eine Freigabe brauchte

Bis dahin galt jede Abweichung eines Zahlungsschalters als freigabepflichtig, auch eine schützende. Seitdem zählt die
Richtung (oben). Derselbe Wechsel `none` → `automatic` rollt heute ohne Freigabe aus; Code-, Text-, Brevo- und
Migrationsänderungen bei unveränderten Zahlungsschaltern brauchten schon vorher keine.

## Einmalige Einstellungen (Owner, ca. 10 Minuten, danach nie wieder)

1. **Umgebung anlegen:** GitHub → Settings → Environments → *New environment* `account-auto`.
   - *Required reviewers*: **keine**
   - *Deployment branches and tags*: *Selected branches and tags* → Regel `main`
2. **Drei Secrets in `account-auto`:**
   - `VU_ACCOUNT_SUPABASE_DB_URL` – derselbe Wert wie in `account-dev` (Supabase → Connect → Session pooler URI)
   - `VU_ACCOUNT_SUPABASE_PUBLISHABLE_KEY` – derselbe Wert wie in `account-dev` (`sb_publishable_…`, öffentlich)
   - `VU_ACCOUNT_STRIPE_READ_KEY` – neuer Restricted Key im Stripe-Dashboard (Entwickler → API-Schlüssel →
     *Eingeschränkten Schlüssel erstellen*), **nur Lesen** für: Products, Prices, Payment method configurations, Webhook
     endpoints, Customer portal, Tax (settings, registrations, rates), Tax IDs, Account. Optional – ohne ihn fehlt nur der
     tägliche Stripe-Lesecheck.
3. **`account-dev`:** unter *Deployment branches* zusätzlich `main` erlauben, damit die freigabepflichtigen Workflows von
   `main` gestartet werden können (der Umweg über den Branch `ops/supabase-dev-migrations` entfällt).
4. Optional: Repository-Variable `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` (`age1…`) für die tägliche Sicherung; danach kann das
   Repository-Secret `VU_ACCOUNT_BACKUP_DB_URL` gelöscht werden (die Sicherung nutzt jetzt `account-auto`).

Bis Schritt 1–2 erledigt sind, rollt die Automatik nichts aus (Hinweis im Lauf), und alles bleibt wie heute.

## Stillgelegt

- `account-dev-setup.yml`, `account-deploy.yml`: Das Supabase-Projekt heißt historisch „vision-universe-dev“, ist aber die
  Produktion; die Workflows hätten gegen die Produktion gearbeitet.
- Die Einmal-Workflows auf `ops/supabase-dev-migrations` werden nicht mehr gebraucht; der Branch bleibt nur als Archiv.

## Bewertung PR #1063

Übernommen: Umgebung `account-auto` mit Branch-Beschränkung, `migrate-production.mjs` (Integritätsprobe),
`account-db-approved.yml`, Wächter-Test, Stilllegung der Dev-Workflows, Freigabeprüfung in `account-cancellations.yml`.
Nicht übernommen: die Erkennung „zahlungsrelevant“ über Dateinamen und Suchwörter seit dem letzten Lauf – sie hätte fast jede
Worker-Änderung freigabepflichtig gemacht (das Problem bliebe); ersetzt durch den Vergleich der Schalter mit dem laufenden
Worker. Ebenso nicht: das zusätzliche Stripe-Produktmerkmal `vu_public_checkout` – die Freigabe des öffentlichen Checkouts ist
bereits dreifach gesichert (Rechtstexte, `VU_LEGAL_APPROVED`, Zahlungsfreigabe-Job). PR #1063 wird geschlossen.

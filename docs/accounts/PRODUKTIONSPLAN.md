# Produktionsplan – öffentlicher Start Free/Pro und Abschluss des Accounts-Projekts

Stand 02.11.2026, verbindlich. Ziel: **ein** abschließender PR, ausgerollt automatisch mit **einer** Owner-Freigabe
(Job `zahlungsfreigabe`, [FREIGABEN.md](FREIGABEN.md)). Keine weiteren Einrichtungs- oder Prüfläufe: alles Übrige wird
lokal, in der CI, lesend oder im jeweiligen Dashboard erledigt.

## 1. Produktionsstand (lesend geprüft am 02.11.2026)

| Bereich | Stand |
|---|---|
| Worker `vu-account` | `konto.visionuniverse.de`, `/v1/health`: `checkout: testers`, `legal: entwurf`, `legalApproved: false`, `liveApproved: true`, `tax: automatic`, `stripeTax: ok`, `newsletter: false`, `newsletterTemplate: ok`, `contactSync: false`, `autoProcess: false` |
| Ausrollen | automatisch nach Merge („Konten — Produktion automatisch“, Umgebung `account-auto`); letzte Läufe 30.10. und 01.11. erfolgreich, ohne Freigabe |
| Datenbank | Supabase `qiytbnpoqvldsatpfkeh`, 12 Migrationen (zuletzt `20261031000100_backtest_reviewer`), RLS überall |
| Konten | 1 Konto (privates Testkonto des Owners), bestätigt, Rollen `user`, `billing_tester`; 0 Abos |
| Rollen | `billing_tester` 1; **`pricing_admin` 0** und **`backtest_reviewer` 0**, beides bewusst (s. u.) |
| Pro-Preis | `pro_month_live` 1,00 €/Monat brutto, Stripe `price_1UVYNiBNKuXfjJefGV0m6LNn` (`inclusive`); Tarifverwaltung: 0 Änderungen |
| Umsatzsteuer | Stripe Tax aktiv (DE-Registrierung), Checkout mit `automatic_tax`; Probe DE/AT/FR 1,00 € brutto mit 0,16 € USt |
| Zahlungsarten | Karte, Apple/Google Pay, PayPal, SEPA, Klarna, Link – Stripe wählt je Kunde |
| Webhook / Portal | `we_1UVYNiBNKuXfjJefAQbiwzw0` (alle benötigten Ereignisse), Portal `bpc_1UVYNiBNKuXfjJefiiNAQOrN` (Kündigung zum Periodenende) |
| Rechtstexte | 9 Seiten unter `konto.visionuniverse.de/rechtliches/` (neu: Risikohinweise, Methodik), seit 06.11.2026 freigeschaltet als `vu-recht-2026-11-06-1` (Owner), Anwaltsprüfung offen; dazu `/kontakt` |
| Kündigen / Widerrufen | `/kuendigen`, `/widerrufen` öffentlich; Ausführung manuell (`VU_CANCELLATION_AUTO_PROCESS = "false"`) |
| Brevo | Listen 11/12/13, DOI-Vorlage geprüft (`newsletterTemplate: ok`); Abgleich und Newsletter **aus** |
| Tarifverwaltung | `/konto/admin/tarife/` live, geschützt; ohne Rolle 401/403 ([TARIFVERWALTUNG.md](TARIFVERWALTUNG.md)) |
| Zahlungsereignisse | **0** – der Live-Zahlungsweg (Webhook → Abo → Rechnung → Vertragsbestätigung) wurde in Produktion noch nie durchlaufen; deshalb Z1 vor der Freigabe |
| Registrierung | offen (`registration_gate.open = true`), keine Zulassungsliste |
| Startseite | Fuß verlinkt die eigenen Rechtsseiten; Newsletter-Link zur Brevo-Anmeldung der Landingpage (statt Shopify) |
| Go-live-Probe | `go-live-config.mjs --checkout=public --dry-run` scheitert nur an `[[OFFEN]]`/`[[PRÜFEN]]` – kein technischer Blocker |

**Entscheidungen des Owners (02.11.2026):**
- Das vorhandene Konto ist ein **privates Testkonto**. Es bekommt **keine** Administratorrechte; `billing_tester` bleibt für
  den Test des öffentlichen Zahlungsablaufs.
- `pricing_admin` wird derzeit **nicht** vergeben. Wird die Tarifverwaltung gebraucht, legt der Owner dafür ein **eigenes
  geschäftliches Konto** an; erst dann wird die Rolle diesem Konto zugewiesen (mit ausdrücklicher Zustimmung).
- Es wird kein Administratorkonto automatisch angelegt.
- 02.11. (zweiter Auftrag „Rolle meinem bestehenden, bestätigten Konto zuweisen“): Es gibt weiterhin nur dieses eine Konto,
  das der Owner zuvor ausdrücklich als privates Testkonto ohne Administratorrechte bestimmt hat. Die Rolle wurde deshalb
  **nicht** zugewiesen; sie wird dem geschäftlichen Konto zugewiesen, sobald es registriert und bestätigt ist.

## 2. Was bis zum öffentlichen Start fehlt

| # | Punkt | Wer | Wie (ohne Workflow) | Status |
|---|---|---|---|---|
| R1 | Rechtliche Abnahme A1–A14 ([RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md)) | Rechtsberatung | Entwürfe online lesen, Änderungen mitteilen | offen |
| R2 | Fehlende Angaben: USt-IdNr. (falls erteilt), Telefon oder anderer schneller Kontaktweg, Datenschutzbeauftragter ja/nein, Teilnahme an Verbraucherschlichtung ja/nein | Owner | mitteilen (Fragebogen in [RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md)) | erledigt 06.11.2026 (USt-IdNr., Kontaktformular, kein DSB; Schlichtung wie im Entwurf) |
| S1 | Umsatzsteuer: Stripe Tax läuft; Länderfrage, Steuerkategorie und Rechnungsangaben bestätigt der Steuerberater | Steuerberatung | [STEUER.md](STEUER.md) | technisch erledigt, Bestätigung offen |
| S2 | Stripe-Branding (Symbol, Logo, Farben) und öffentliche Angaben (Support-E-Mail/-URL, Steuernummer auf Rechnungen, Beleg-E-Mails) | Owner | Stripe-Dashboard, Schritt für Schritt in [STRIPE_BRANDING.md](../archiv/accounts/STRIPE_BRANDING.md); über die API für das eigene Konto nicht setzbar. Prüfbar erst mit `VU_ACCOUNT_STRIPE_READ_KEY` (täglicher Lesecheck meldet Logo, Symbol, Farbe, Akzent) | offen (letzter Befund 30.10.: kein Logo, kein Symbol, keine Support-Angaben) |
| S3 | Klarna für ein 1-€-Abo behalten? | Owner | Stripe-Dashboard → Zahlungsmethoden (optional) | offen |
| Z1 | Abschließende Zahlungsprüfung: echter Testkauf mit dem Testkonto, Beleg, Kündigung, Erstattung | Owner, Claude prüft lesend | [ZAHLUNGSPRUEFUNG.md](../archiv/accounts/ZAHLUNGSPRUEFUNG.md) – jetzt schon möglich (Checkout `testers`) | offen |
| B1 | Rechtsgrundlage Brevo-Kontaktliste (A10) | Rechtsberatung | mit R1 | offen |
| B2 | DOI-Vorlage | – | `/v1/health` → `newsletterTemplate: ok` | erledigt |

## 3. Ablauf bis zum Start (verbindlich, minimal)

1. **Antworten sammeln** (R1, R2, S1, S3, B1) und Dashboard-Schritte (S2). Kein Lauf.
2. **Testkauf** (Z1) mit dem privaten Testkonto – vor der Freigabe, damit Beleg, Steuer und E-Mails einmal echt geprüft sind.
3. **Ein Abschluss-PR** (Claude, nur CI, keine Freigabe):
   - offene Stellen in `workers/vu-account/src/legal/texts.mjs` nach Abnahme ersetzen, Impressum-Test anpassen;
   - `node scripts/account/go-live-config.mjs --legal-version=vu-recht-JJJJ-MM-TT-1 --tax=automatic --checkout=public
     --brevo-sync=true [--newsletter=true]` – setzt Fassung, Freigabe, Steuer, Checkout und Brevo in einem Schritt und
     prüft wie der Deploy-Workflow (`check-public-checkout.mjs`); verweigert, solange `[[OFFEN]]`/`[[PRÜFEN]]` übrig ist;
   - alle Tests lokal und in der CI.
4. **Deine ausdrückliche Endfreigabe** zum Merge dieses PR.
5. **Ausrollen automatisch** nach dem Merge: Weil der Checkout von `testers` auf `public` erweitert wird, wartet genau
   **ein** Job (`zahlungsfreigabe`, Umgebung `account-production`) auf deine Freigabe – die gewollte, letzte Freigabe.
6. **Kontrolle lesend** (kein Lauf): `GET /v1/health` → `checkout: "public"`, `legalApproved: true`, `tax: "automatic"`,
   `stripeTax: "ok"`, `contactSync: true`; `/preise/` ohne „interner Testpreis“; erste echte Bestellung im Stripe-Dashboard.

**Gesamt bis zum Start: 1 automatischer Lauf, 1 Freigabe.**

## 4. Abschluss des Accounts-Projekts (Checkliste)

Das Projekt gilt als abgeschlossen, wenn alle Punkte erfüllt sind:

- [ ] R1, R2, B1: Texte freigegeben, keine `[[OFFEN]]`/`[[PRÜFEN]]`, `legalApproved: true`
- [ ] S1: Steuerberater bestätigt; S2: Branding und Rechnungsangaben in Stripe gesetzt
- [ ] Z1: Testkauf, Kündigung und Erstattung protokolliert ([ZAHLUNGSPRUEFUNG.md](../archiv/accounts/ZAHLUNGSPRUEFUNG.md))
- [ ] Checkout `public`, Kontrolle nach Abschnitt 3.6 erfüllt
- [ ] Brevo-Abgleich an (`contactSync: true`), Newsletter nach Entscheidung
- [ ] Optional: Lese-Schlüssel `VU_ACCOUNT_STRIPE_READ_KEY` in `account-auto` (tägliche Stripe-Prüfung ohne Freigabe, [FREIGABEN.md](FREIGABEN.md))
- [ ] Optional: geschäftliches Konto für die Tarifverwaltung, Rolle `pricing_admin` nach ausdrücklicher Zustimmung

## 5. Was ausdrücklich nicht gestartet wird

Stripe-Einrichtung, Stripe-Lesecheck mit Freigabe, Brevo-Prüfung, Zwischen-Deploys. Code-, Text- und
Migrationsänderungen rollen nach dem Merge automatisch aus, solange sie keine Zahlungen öffnen.

## 6. Rückweg

`VU_CHECKOUT_ACCESS = "testers"` (eigener PR, rollt ohne Freigabe aus, weil es einschränkt): neue Abschlüsse sofort nur
noch für Tester, bestehende Abos laufen bei Stripe weiter. Kein Free-Konto wird je automatisch kostenpflichtig.

## 7. Kapazität und Last vor dem öffentlichen Start (Analyse 21.11.2026)

Frage des Owners: *Wie sicher ist Seite und App bei vielen gleichzeitigen Zugriffen?* Antwort in einem Satz: **Bei Last schalten die kostenlosen Tarife ab (Rückfall oder Fehler), sie schicken keine Rechnung; für einen öffentlichen, kommerziellen Start sind drei Dinge nötig: Hosting der Seite wechseln (Nutzungsbedingungen), Cloudflare Workers Paid (5 $) und Supabase Pro (25 $).** Alles hier ist Analyse; es wurde nichts umgestellt, gekauft oder gegen Produktion getestet.

### 7.1 Kapazitätstabelle je Teil

| Teil | Grenze (Quelle) | Heute | Engpass bei N gleichzeitig / M im Monat | Beim Überschreiten |
|---|---|---|---|---|
| **Statische Seite** (GitHub Pages) | Seite ≤ 1 GB, **soft 100 GB/Monat**, 10 Builds/h (nicht bei eigenem Actions-Deploy), 429 möglich; **Bedingungen: nicht erlaubt „to run your online business“ oder „commercial SaaS“** (docs.github.com, 21.11.2026) | Release-Artefakt nahe am Limit (Architektur §2: Scherben allein +230 MB); Besuchsgewicht s. u. | Bandbreite: 100 GB ÷ 3–6 MB je Besuch ≈ **17.000–33.000 Besuche/Monat**. Rechtlich schon vorher: Pro-Abo + Konto = kommerziell | Soft: GitHub drosselt/mahnt (429, Mail), Abschaltung möglich. **Das ist der erste echte Blocker.** |
| **Live-Relay vu-live** (1 Durable Object, Free) | 100.000 DO-Anfragen/Tag, 13.000 GB-s/Tag (je Konto); 1 Anfrage je Verbindung + 1 je 20 Client-Nachrichten; ausgehend frei; max. 50 Symbole, 1 Tiingo-Verbindung (`free-budget.js`, `vu-live.mjs`) | Mess: 17 Ereignisse/s bei 50 Titeln = ~0,1 % des Kontingents | Tiingo wächst **nicht** mit N (ein Abo je Symbol, nicht je Nutzer). Requests: je Besucher ≈ 1 Verbindung + wenige Nachrichten ⇒ ~20.000–50.000 Besucher/Tag bis 90.000 (Reserve 10.000). **Speicher 128 MB:** Lasttest (7.3) ≈ 20 KB/Client ⇒ **ca. 3.000–5.000 gleichzeitige** | Budgetwächter: ab 85 % keine neuen Symbole, Browser fällt auf Snapshot zurück; bei 100 % **schlagen DO-Anfragen fehl** (Ausfall, keine Rechnung). Kein Verbindungs-Deckel, kein Limit je IP (Lücke 7.4) |
| **Konten** (`vu-account` + Supabase Free + Stripe) | Workers Free 100.000 Anfragen/Tag, 10 ms CPU, **für alle Worker im Konto zusammen**; Supabase Free 50.000 MAU, 500 MB, 5 GB Egress, **Pause nach 1 Woche Inaktivität, keine Backups**; Ratenbegrenzung 20/min je Schlüssel + Zähler je Isolate (`limits.mjs`) | 1 Konto, 0 Abos | Konten selbst genügsam (Doku §10: ~50.000 Anfragen/Tag bei 5.000 Konten). Engpass ist das **gemeinsame** Tageslimit mit vu-live/vu-ask/Waker (Waker allein 1.440/Tag) und Supabase Free (keine Backups, Pause) | Workers: ab 100.000/Tag Fehler 1015/Abschaltung für den Rest des Tages, **auch für Login/Checkout/Webhook**. Stripe-Webhooks würden verfehlt (Stripe wiederholt bis 3 Tage; Abgleich `reconcile-stripe` nötig). Supabase Free: Pause = Konten tot |
| **vu-ask** (Haiku 4.5, 1 DO `AskGate`) | Prepaid-Guthaben (Auto-Reload AUS), 100 $/Monat Netz, **100 Fragen/Tag global, 10 je Nutzer, 60 Anfragen je IP/Tag**, Beta-Passwort, Origin-Prüfung, Turnstile optional (aus) | ~0,5–0,8 ct je neue Frage ⇒ Deckel 100 Fragen/Tag ≈ **0,65 $/Tag ≈ 20 $/Monat** | Bei öffentlichem Start sind 100 Fragen/Tag in Minuten weg: **ab ~50 aktiven Nutzern/Tag** „Kontingent aufgebraucht“. Je Nutzer wird per IP-Hash/Browser-ID gezählt, nicht je Konto; Cache-Treffer laufen trotzdem durch das DO (zählen gegen die 100.000) | Frage-Funktion antwortet „Kontingent aufgebraucht“ (sauberer Rückfall); Kosten sind dreifach gedeckelt. Verfügbarkeit wird zur Frage, Kosten nicht |
| **vision-universe-social** (Instagram/OAuth, Owner-intern) | Workers Free, Admin-Schlüssel auf allen Routen außer `/health` und Meta-Callback | nur Owner | Keine Nutzerlast vorgesehen; zählt nur 1:1 gegen das gemeinsame 100.000-Limit | Ausfall betrifft nur Social-Posting, kein Nutzerpfad |

**Gemeinsamer Engpass:** Cloudflare-Freigrenzen gelten **je Konto**, nicht je Worker. vu-live (Besucherverbindungen), vu-ask, vu-account, Waker und social teilen sich 100.000 Anfragen/Tag. Fällt die Grenze, fallen **Konten und Zahlungen mit**, obwohl sie wichtiger sind als der Live-Chart. Das ist das größte Einzelrisiko der Architektur.

### 7.2 Seitengröße je Besuch (lokal gemessen, 21.11.2026)

Chromium 390 px, lokaler Server mit gzip, Quellbaum ohne Release-Minify und ohne Release-Ausschnitte (**Obergrenze**, Produktion ist kleiner; Messung gegen echte Pages-Auslieferung offen):

| Seite | Anfragen | Übertragen |
|---|---|---|
| `/` (Start) | 12 | 0,3 MB |
| `/landing/` | 27 | 2,3 MB (Bilder) |
| `/screener/` | 24 | 0,8 MB |
| `/ask/` | 22 | 0,6 MB |
| `/konto/` | 21 | 0,6 MB |
| `/quant/` | 119 | 2,9 MB |
| `/discover/` | 110 | 4,2 MB |
| `/supertrader/` | 34 | 3,8 MB (`signals-core.json` 2,2 MB) |
| `/aktie/?t=NVDA` | 145 | 5,9 MB (u. a. `logos/credits.json` 1,8 MB, `technical/instruments/NVDA.json` 0,7 MB) |

Annahme **3 MB je Besuch (Mittel) ⇒ 100 GB ≈ 33.000 Besuche/Monat**. Schnelle Hebel ohne Fachänderung: `credits.json` und Bilder (JPG ≈ 300 KB, auf WebP/AVIF) nicht beim ersten Laden holen, `signals-core.json` als Shard. Bei Cloudflare ist Bandbreite nicht abgerechnet, die Seitengröße wird dann zum reinen Komfort-Thema.

### 7.3 Lasttest (nur lokal, nichts gegen Produktion, Tiingo, Supabase, Stripe oder Cloudflare)

- **Statisch, lokaler Node-Server (gzip):** `index.html`: 1.423 Anfragen/s bei 50 und 500 Verbindungen, 0 Fehler, p50 33 ms (50 gleichzeitig) bzw. 194 ms (500). 1,7 MB-Datei: 326/s. Aussage: der Teststand ist kein Maßstab für GitHub-CDN, zeigt aber, dass die Seite **keine serverseitige Logik** hat; die Last trägt allein der Hoster.
- **vu-live, Durable-Object-Code im Original mit der Attrappe aus `worker/tests/harness.mjs`** (Sockets simuliert, 50 Symbole, 17 Ereignisse/s, 1–5 Titel je Client): 100 Clients 1,3 ms CPU je simulierter Sekunde, 1.000: 4,9 ms, 5.000: 18 ms, **10.000: 40 ms (4 % eines Kerns)**; Tiingo bleibt bei **50 Symbolen/1 Verbindung**. Heap 10 → 26 → 98 → 201 MB: **Rechenzeit ist kein Engpass, der 128-MB-Speicher ist es (~5.000 Clients, in der echten Laufzeit eher weniger)**. `wrangler dev` wurde nicht gestartet (nicht nötig, Ergebnis hängt an Plattformgrenzen, die schon dokumentiert sind). Skripte: nicht eingecheckt, in 20 Zeilen reproduzierbar mit `worker/tests/harness.mjs`.
- **Konten/vu-ask:** Ratenbegrenzung, Budget und gleichzeitige Anfragen sind durch `workers/vu-account/tests` und `workers/vu-ask/tests` abgedeckt (Gate serialisiert in einem DO, Grenzen können nicht gemeinsam überschritten werden). Kein Lasttest gegen Supabase/Stripe.

### 7.4 Missbrauchsschutz: Befund

| Punkt | Stand | Lücke / Empfehlung |
|---|---|---|
| vu-live WebSocket | Origin Pflicht + Liste (research/visionuniverse.de) | Ein Nicht-Browser setzt `Origin` beliebig. **Kein Verbindungslimit je IP, kein Gesamtdeckel, keine Nachrichtenrate je Client.** Jede Verbindung kostet 1 DO-Anfrage, 100.000 Verbindungen/Tag = Abschaltung für das ganze Konto. Empfehlung: Deckel gleichzeitiger Clients (z. B. 2.000), Rate-Limit-Binding je IP vor dem DO (`/live`), Schließen bei >1 Nachricht/s |
| vu-account | Binding 20/min + Limits je Kategorie (Login 10/5 min, Anmeldung 5/h …) | Zähler je Isolate ist nur Untergrenze; Binding gilt je Schlüssel (IP). Empfehlung: Turnstile auf Anmeldung/Kontaktformular, Bestätigungs-E-Mail-Pflicht beibehalten, Brevo (300 Mails/Tag Free) als Anmelde-Deckel mitdenken |
| vu-ask | 3 Kostenschranken, Origin, Beta-Passwort, Turnstile bereit (`TURNSTILE_SECRET`) | Je Nutzer = je IP, nicht je Konto. Empfehlung: Turnstile **vor** dem Start einschalten; Limit je Konto (Free 3, Pro 20/Tag) über JWT; globales Tageslimit aus Preis ableiten (Pro 20 Fragen × 0,65 ct = 13 ct/Nutzer/Tag max.) |
| Kosten-Deckel | Prepaid, Auto-Reload aus; Monatslimit; Cloudflare/Supabase Free schalten ab | Beim Wechsel auf Paid **Ausgabenlimit/Benachrichtigung setzen** (Workers Paid: 10 Mio. Anfragen inklusive, danach 0,30 $/Mio.) und Anfrage-Alarme (80 %) in Cloudflare |

### 7.5 Plan mit Schwellen und Kosten

| Stufe | Auslöser | Maßnahme (Owner-Freigabe: Geld, Umzug) | Kosten/Monat (grob) |
|---|---|---|---|
| **0 vor dem Start** | immer | Seite zu Cloudflare Pages/Workers-Assets (GitHub-Pages-Bedingungen verbieten das Geschäft; Bandbreite gratis; 20.000 Dateien Limit prüfen, Release hat deutlich mehr ⇒ ggf. R2 für Daten); **Workers Paid** (alle Worker, 10 Mio. Anfragen); **Supabase Pro** (Backups, keine Pause, 100.000 MAU, 250 GB Egress); Turnstile; Limits je Konto in vu-ask; Verbindungsdeckel vu-live | ≈ 5 $ + 25 $ + 0 = **~30 $** (+ Haiku-Guthaben nach Nutzung) |
| **1 ab ~1.000 Nutzer/Tag** | DO-Anfragen > 50 % | vu-live auf DO Paid (inklusive in Workers Paid): 1 Mio. Anfragen + 400.000 GB-s inklusive, danach 0,15 $/Mio.; Reserve entfällt | ~ +0–5 $ |
| **2 ab ~3.000 gleichzeitig** | Heap/Verbindungen | vu-live in Shards (je Symbolgruppe oder Nutzergruppe), Tiingo-Verbindung bleibt eine | ~ +0–10 $ |
| **3 ab ~100.000 MAU** | Supabase | +0,00325 $/MAU; Compute-Upgrade (Small 15 $) | ~ +300 $ je 100.000 MAU weitere |
| **4 vu-ask** | je 1.000 aktive Fragende/Tag à 3 Fragen | ≈ 20 $/Monat pro 1.000 (0,65 ct je neue Frage, Cache senkt) | linear, durch Tarife (Pro) gedeckt |
| **Stripe** | je Zahlung | wie ACCOUNTS §10 (≈ 1,5 % + 0,25 € + 0,7 % Billing) | Umsatz-abhängig |

**Reihenfolge:** (1) Owner entscheidet Hosting-Umzug; (2) vor Umzug Messung gegen Pages-Auslieferung (Artefaktgröße, Dateizahl, Seitengewicht); (3) Workers Paid + Supabase Pro vor Öffnung der Registrierung für alle; (4) Code-PR mit Deckeln/Turnstile/Konto-Limits (kein Geld, kann ohne Freigabe laufen); (5) Alarme für 80 % Kontingent.

**Offen / nicht gemessen:** echtes Seitengewicht aus der Produktion; Cloudflare-Verbrauch des Kontos (kein Analytics-Zugriff); echter Speicher je WebSocket in der Plattform; Supabase-Auth-E-Mail-Limits (Seite nennt keines; Versand läuft über Brevo).

### 7.6 Umgesetzt am 21.11.2026 (Deckel ohne Geld, PR „Worker-Deckel“)

- **vu-live:** Verbindungsdeckel `MAX_CLIENTS` = 2.500 (Hälfte der gemessenen Speichergrenze); darüber nimmt das Objekt die Verbindung an, sendet `status BLOCKED / CAPACITY` und schließt (der Chart fällt auf den Snapshot zurück, `live-relay-client.js` wiederholt nicht). Limit je IP und Minute **vor** dem Durable Object (`VU_LIVE_LIMITER`, 10/min, Untergrenze je Isolate; ein ausgefallenes Binding sperrt niemanden aus). Nachrichtenrate je Client: über 30 Nachrichten in 10 s wird getrennt (ein Browser sendet etwa 1 je 15 s). Zusätzlich wird `Sec-Fetch-Site: cross-site` abgewiesen. Ein Nicht-Browser kann `Origin` weiter setzen; gegen ihn wirken Deckel und IP-Limit. `/health` zeigt `maxClients`, `rejectedFull`, `rejectedRate`.
- **vu-ask:** Konto-Limit (`VU_ASK_ACCOUNT_LIMITS`, **aus**): gültiges Supabase-Token = Zählung je Konto (`VU_ASK_PER_ACCOUNT_DAILY`, 20) statt je Anschluss/Browser; ungültig = anonym; das globale Tageslimit bleibt oberster Deckel. Im Browser liegt das Token im HttpOnly-Cookie des Konto-Hosts, es greift dort erst mit einem Ticket von `vu-account` (offen, eigener PR); in der App sofort.
- **Turnstile:** Schalter `VU_ASK_TURNSTILE` (**aus**). Einschalten braucht vom Owner: Site-Key im Meta-Tag `vu-ask-turnstile` in `ask/index.html` und Secret `TURNSTILE_SECRET`; danach `VU_ASK_TURNSTILE = "true"`.
- Ausrollen: `frage-worker` rollt nach dem Merge selbst aus; `live-worker` nur per Dispatch oder Commit mit `[cf-deploy]` (Tor mit Realtime-Tests und Zero-Cost-Vertrag).

## 8. Sicherheitsprüfung vor dem öffentlichen Start (Code-Review 22.11.2026)

Umfang: Konten-Worker (Anmeldung, Sitzungen, Token-Brücke, CORS/CSRF, Stripe-Webhook, Supabase-RLS, Rollen, Tarifverwaltung), `vu-ask`, `vu-live`, statische Seite, GitHub Actions. Nur Code-Review und Unit-Tests; nichts gegen Produktion, kein Passwort benutzt, keine Zahlungslogik geändert. Keine Befunde der Stufe „kritisch“.

### 8.1 Befundliste

| Schwere | Bereich | Befund | Stand |
|---|---|---|---|
| **Hoch (Owner-Entscheidung)** | Statische Seite | Das Research-Passwort-Gate ist nur clientseitig: die Originale sind ohne Passwort abrufbar (`docs/RESEARCH_ACCESS_GATE.md`). Als Schutz für den öffentlichen Start ungeeignet. | offen: entfernen oder durch serverseitige Sperre ersetzen (z. B. Cloudflare Access/Worker-Auth) |
| Mittel | Actions | Freie Eingabetexte standen in `run`-Blöcken (ADR-005): `intraday-pacemaker.yml`, `maintenance.yml`, `social.yml` | behoben #2271, Vertragstest WI-1 |
| Mittel | Statische Seite | Release enthielt Worker-Quellen, `supabase/` (Migrationen), `server/`, `CLAUDE.md` | behoben #2272 (Sperrliste in `build-release.mjs`), Stand siehe PR |
| Mittel | vu-live | Eine Verbindung konnte alle 50 Symbolplätze belegen; Symbole ungeprüft | behoben #2274 (12 je Verbindung, Symbolform) |
| Mittel | vu-ask | Berechnete Fehlschläge gaben das Nutzerkontingent zurück | behoben #2275 |
| Niedrig | Konten | Fehlerhafter Cookie-Kopf warf einen Worker-Fehler | behoben #2273 |
| Niedrig | Konten | Öffentliche Kündigung/Widerruf/Kontakt senden E-Mails an frei eingegebene Adressen (Ratenbegrenzung je IP und Adresse vorhanden). Vorschlag: Turnstile vor dem Start | offen |
| Niedrig (Geld, nur gemeldet) | Konten | Bei `VU_CANCELLATION_AUTO_PROCESS=true` würde eine öffentliche Kündigung allein über die Adresse zugeordnet. Heute aus; vor dem Einschalten Ablauf prüfen (Owner-Freigabe) | offen |
| Niedrig | Statische Seite | Keine Content-Security-Policy (GitHub Pages setzt keine Header). Beim Hosting-Wechsel (§7) Header setzen | offen |
| Niedrig | Statische Seite | Das App-Token geht an `research.visionuniverse.de`: eine XSS-Lücke dort würde es abgreifen. XSS-Disziplin (maskieren, kein ungeprüftes `innerHTML`) bleibt Pflicht; `innerHTML`-Stellen der übrigen Frontends nur stichprobenartig geprüft | offen |
| Niedrig | vu-ask | `/v1/quota` ohne Origin-Prüfung; Upstream-`detail` in Fehlerantworten; `sweep()` räumt nur 1.000 Schlüssel je Lauf; Turnstile aus | offen |
| Niedrig | vu-live | `/health` öffentlich und weckt das Durable Object | offen |
| Niedrig | Actions | `github.ref_name` in `run`-Blöcken (nur mit Push-Recht ausnutzbar); `actions/*` auf Tags statt SHA; `maintenance.yml` läuft auf `claude/**` mit Secrets | offen |

### 8.2 Geprüft, ohne Befund

- **Konten-Worker:** Token-Prüfung (ES256/JWKS, `alg none` und HS256 ohne Freigabe abgelehnt, Aussteller, Zielgruppe, Rolle), HttpOnly-/`__Host-`-Cookies, CSRF (Herkunft plus eigener Kopf), CORS nur für eigene Herkunft, Weiterleitungen nur auf feste Pfade, Anmeldung und Wiederherstellung ohne Konto-Auskunft, Webhook (Signatur, Zeitfenster, Idempotenz, Zustand immer frisch bei Stripe, Live-Sperre), Preis und Tarif nur aus der Datenbank, Tarifverwaltung nur mit Rolle und erneuter Anmeldung, HTML-Ausgabe der öffentlichen Seiten maskiert.
- **Supabase:** RLS auf allen Tabellen, `security definer`-Funktionen mit festem `search_path` und nur für `service_role` freigegeben, Nutzer-Funktionen als `security invoker` mit `auth.uid()`, Rollen nur lesbar, Registrierungstor im Auth-Hook (auch bei direktem Aufruf der Supabase-API wirksam).
- **vu-ask:** Modellausgabe per Schema gebunden, Ausgabe im Browser maskiert, Schlüssel in keiner Antwort, Beta-Passwort nur als Hash, Kostenschranken dreifach.
- **Statische Seite:** keine Schlüsselmuster im Repo, keine Dritt-Skripte, Nachrichten-Frontend maskiert Feeddaten, Service Worker cached keine Konto- oder API-Antworten, `postMessage`-Handler prüfen Herkunft.
- **Actions:** kein `pull_request_target`, überall `permissions`, `ci-retry` läuft auf dem Standardzweig.

Nicht geprüft: Artefakt-Vertrauen der übrigen `workflow_run`-Ketten, Secrets in Logs, Lasttest gegen Supabase/Stripe, `wrangler dev`.

§7.4: Verbindungsdeckel, Nachrichtenrate, IP-Limit und `Sec-Fetch-Site`-Prüfung für vu-live sind bereits umgesetzt (siehe oben unter §7).

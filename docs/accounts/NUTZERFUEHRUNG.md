# Nutzerführung: Willkommensseite, Mein Dashboard, Mein Konto

Stand 29.10.2026 · Owner-Auftrag „Persönliches Dashboard, Registrierung, Free/Pro, Checkout und Nutzerführung“.
Baut auf der bestehenden Infrastruktur auf (Supabase `qiytbnpoqvldsatpfkeh`, Worker `vu-account`, Stripe Live, Brevo); keine neue
Datenbank, keine neue Datenhaltung, Passwortmaske und Registrierung unverändert.

## 1. Drei Bereiche

| Bereich | Adresse | Rolle | Inhalt |
|---|---|---|---|
| Willkommensseite | `/willkommen/` | Einstieg nach jeder Anmeldung, nach der E-Mail-Bestätigung und nach bestätigter Zahlung | unverändert: Video, Story-Videos, Produktwelten, Neuigkeiten. **Neu:** Zeile „Mein Dashboard“ (Watchlist und gespeicherte Aktien) direkt unter dem Video, daneben abgesetzt „Konto“; kurze Rückmeldung bei `?konto=verified` bzw. `?konto=pro` |
| Mein Dashboard | `/mein-dashboard/` | persönlicher Investment-Bereich | Begrüßung, Watchlist (hinzufügen, entfernen, rückgängig, Link zur Aktie), „Auf diesem Gerät gemerkt“ (lokale Listen der Produktwelten, Übernahme auf Klick), Schnellzugriff auf Discover, Quant, Fundamental, Technical, Screener, Supertrader |
| Mein Konto | `/konto/` | Einstellungen und Vertrag | persönliche Daten, E-Mail, Passwort und Sicherheit, Tarif, Abonnement, Rechnungen, Zahlungsmethoden (Kundenportal), Kündigung, Datenschutz und Datenexport |

`/dashboard/` ist das bestehende Research-Dashboard (V6.3) und bleibt unverändert; deshalb liegt der persönliche Bereich unter
`/mein-dashboard/`. Die globale Hauptnavigation ist unverändert.

**Watchlist:** primär über „Mein Dashboard“. `/konto/watchlist/` bleibt unter derselben Adresse als **Detailansicht** (alle Kennzahlen,
Filter, Notizen, Benachrichtigungswünsche) und führt zurück zum Dashboard. Die Kontonavigation enthält keinen Watchlist-Eintrag mehr,
sondern abgesetzt „Mein Dashboard →“.

### Datenquellen des Dashboards (nichts Neues gespeichert)

| Inhalt | Quelle |
|---|---|
| Begrüßung, Tarif | `GET /v1/me` (Profil, `effective_entitlements`) |
| Watchlist | `GET /v1/watchlist`, `POST /v1/watchlist/items`, `…/items/remove`, `…/import` – dieselben Aufrufe wie Lesezeichen und Detailansicht (RLS, Tarifgrenze in der Datenbank) |
| Kurse | gemeinsame Watchlist-Übersicht `/core/data/watchlist-summary-v1/` über `core/watchlist-view.js` (veröffentlichter Schluss, Datum, „veraltet“) |
| Auf diesem Gerät gemerkt | `vu-discover-watchlist-v1`, `vu.quant.watchlist.v1`, `vu2.watchlist.selection.v1` (nur gelesen, `W.legacyTickers`/`planMerge`), Europa-Liste nur gezählt |

Nicht gezeigt: Quant-Gesamtscore, Supertrader-Zustände oder -Signale (auch keine „Forschung“-Chips) – das Dashboard liest diese
Abschnitte nicht (Test `mein-dashboard/tests`). Supertrader hat keine eigene Speicherfunktion; es wird nichts vorgetäuscht.

**Erweiterung:** `mein-dashboard/dashboard.js` besteht aus Modulen (`MODULES`: `greeting`, `watchlist`, `add`, `local`, `shortcuts`).
Persönliche Marktveränderungen oder Watchlist-Benachrichtigungen kommen später als eigenes Modul, sobald es eine freigegebene Quelle
gibt (Vorbereitung: `core/watchlist-view.js#events`, `watchlist_items.alerts`). Heute ist nichts davon aktiv oder simuliert.

## 2. Registrierung und Anmeldung

```
/preise/ ── Free ──▶ /konto/registrieren/?plan=free ─▶ E-Mail ─▶ /konto/?status=verified ─▶ /willkommen/?konto=verified
        └─ Pro ───▶ /konto/registrieren/?plan=pro  ─▶ E-Mail ─▶ /konto/?status=verified&plan=pro ─▶ /konto/tarife/?plan=pro
                                                                     (Bestellbestätigung, keine zweite Tarifwahl)
                                                     ─▶ Stripe Checkout ─▶ /konto/abo/?checkout=success
                                                     ─▶ Webhook bestätigt Pro ─▶ /willkommen/?konto=pro
```

Die Registrierung fragt Zustimmung zu AGB und Datenschutzhinweisen (Fassung `LEGAL_VERSION`) und – nur wenn Brevo-Newsletter
eingeschaltet ist – eine freiwillige, nicht vorausgewählte Newsletter-Checkbox (Double-Opt-in, [BREVO.md](BREVO.md)).

Eine Stelle entscheidet über das Ziel: `konto/account-api.js#nextAfterSignIn` (Tests in `konto/tests/konto.test.mjs`).

| Lage | Ziel |
|---|---|
| Anmeldung ohne Ziel | `/willkommen/` |
| Anmeldung mit Deep Link (`?next=/mein-dashboard/`, `/konto/watchlist/` …) | der Deep Link (nur eigene Pfade, kein offener Redirect) |
| offene Pro-Wahl und Konto Free | `/konto/tarife/?plan=pro` – hat Vorrang vor der Willkommensseite |
| Konto hat Pro | nie wieder zur Bestellung |

### Pro-Wahl bleibt erhalten

| Fall | Träger |
|---|---|
| gleicher Browser, Neuladen | `localStorage` `vu-plan-choice-v1` (7 Tage) |
| Bestätigungslink auf anderem Gerät | `&plan=pro` im Link (Worker-Callback) → Anmeldeseite merkt die Wahl |
| neue Anmeldung auf beliebigem Gerät | **neu:** im Konto, `user_metadata.plan_intent = "pro"` + Zeitpunkt (bei der Registrierung gesetzt), `GET /v1/me` → `planIntent` (30 Tage gültig, nur solange Free gilt) |

Die Wahl ist **nur ein Hinweis für die Seitenführung**. Pro gibt es ausschließlich über `effective_entitlements` aus verifizierten
Stripe-Ereignissen; der Hinweis ist für das Konto selbst schreibbar und schaltet nachweislich nichts frei (Test „Tarifwahl Pro im Konto“).

| Aktion | Wirkung auf die Wahl |
|---|---|
| „Mit Free weiter“ (Bestellbestätigung oder Konto-Übersicht) | verworfen (`POST /v1/me/plan-intent {plan: null}`), danach normale Anmeldung zur Willkommensseite |
| Abbruch bei Stripe (`?checkout=canceled`) | verworfen; das Konto bleibt Free, keine erneute Aufforderung |
| „Pro auswählen“ / „Pro fortsetzen“ | eindeutige, nachvollziehbare Aktion; setzt die Wahl neu (`{plan: "pro"}`) und öffnet die Bestätigung |
| Pro aktiv | gilt nicht mehr (Server liefert `planIntent: null`) |

Die Konto-Übersicht zeigt eine offene Pro-Wahl als Karte („Pro fortsetzen“ / „Mit Free weiter“), das Dashboard als Hinweis – ohne
Umleitung bei jedem Besuch.

## 3. Pro-Bestellbestätigung (`/konto/tarife/?plan=pro`)

**Fehler vom 29.10.2026 (iPhone, erste Registrierung): Checkbox nicht anwählbar, „Weiter zur Zahlung bei Stripe“ blieb gesperrt.**

Ursache (in `konto/konto.js#views.plans`, nicht HTML/CSS):

1. `openConfirm()` setzte `terms.disabled = !canBuy()`. `canBuy()` ist nur wahr, wenn `/v1/me/billing` `checkoutAllowed: true` meldet –
   in der Produktion (`VU_CHECKOUT_ACCESS = "testers"`) nur für Konten mit Rolle `billing_tester`. Dem neuen Konto fehlte diese Rolle,
   also wurde die Checkbox **gesperrt** gezeichnet.
2. Der erklärende Satz („Pro ist noch nicht buchbar …“) ging in die Statusbox **oben auf der Seite**, während die Seite zur Bestätigung
   scrollte – auf dem Handy außerhalb des Bildschirms. Sichtbar blieb nur eine scheinbar defekte Checkbox.
3. Zusätzlich ein Wettlauf: Wer „Pro auswählen“ tippte, bevor die Abrechnungsdaten geladen waren, bekam ebenfalls eine dauerhaft gesperrte
   Checkbox (kein erneutes Zeichnen nach dem Laden).

HTML (Label umschließt die Checkbox, `for`-Verknüpfung), CSS (keine `pointer-events`, kein Overlay) und WebKit waren nicht die Ursache;
die Browser-QA prüft das jetzt trotzdem (Tippen auf Text und Kästchen, `elementFromPoint` über der Checkbox, iPhone-Profil in WebKit).

Neu: ein Zustand je Lage (`konto/account-api.js#checkoutState`), sichtbar **in** der Bestätigung:

| Zustand | Anzeige |
|---|---|
| `loading` | „Buchbarkeit wird geprüft …“, nichts bedienbar |
| `ready` | Pflicht-Checkbox (große Tippfläche, ohne Links darin), „Weiter zur Zahlung bei Stripe“ erst nach dem Haken |
| `not-open` | „Pro ist für dein Konto noch nicht buchbar“ + Erklärung + „Mit Free weiter“ – **keine** Checkbox |
| `unavailable`, `no-price` | „Pro ist gerade nicht buchbar“ + Grund + „Mit Free weiter“ |
| `subscribed` | keine Bestellung (kein Doppelabo) |

Der zwingende Bestätigungsschritt bleibt: Checkbox → `confirm: true` → Worker prüft Rolle, Bestätigung, Preis bei Stripe,
bestehende Abos (409) → Checkout. Antwortet der Worker trotz allem `CHECKOUT_NOT_OPEN`, wechselt die Seite in `not-open`.

## 4. Zahlung und Bestätigung

- Bestehende Stripe-Integration unverändert: Checkout im Abo-Modus, dynamische Zahlungsmethoden (kein `payment_method_types`),
  Webhook-Signatur, Idempotenz, Zustand immer frisch von Stripe, Tester-only (`VU_CHECKOUT_ACCESS = "testers"`).
- `/konto/abo/?checkout=success` wartet bis ~15 s auf die Datenbank. **Erst wenn `effective_entitlements` Pro meldet** (verifiziertes
  Webhook-Ereignis), geht es zur Willkommensseite (`?konto=pro`). Der Rücksprung von Stripe allein zählt nicht.
- **SEPA (verzögerte Bestätigung):** Das Abo steht bis zur Bestätigung auf `incomplete` (kein Zugang, kein zweiter Checkout); die
  Seite erklärt das und bietet den Weg zur Willkommensseite, das Konto bleibt Free. **Neu im Worker:**
  `checkout.session.async_payment_failed` holt den Zustand frisch von Stripe (Abo endet, Konto bleibt Free); bisher wurde das
  Ereignis ignoriert und nur über `customer.subscription.*` nachgezogen. Das Ereignis steht in `WEBHOOK_EVENTS`; im Stripe-Webhook
  wird es mit dem nächsten Lauf von „Konten — Stripe Live einrichten“ abonniert (bis dahin wirken weiter die Abo-Ereignisse).
- Kündigung (Kundenportal, `/konto/kuendigen/`), Laufzeitende → automatisch Free: unverändert, in der Browser-QA geprüft.

## 5. Tests

| Prüfung | Befehl |
|---|---|
| Nutzerführung, Bestellzustände, Seitenstruktur | `node --test "konto/tests/*.test.mjs" "mein-dashboard/tests/*.test.mjs"` |
| Worker: Pro-Wahl im Konto, SEPA bestätigt/gescheitert | `PG_TEST_URL=… node --test workers/vu-account/tests/flows.test.mjs` |
| ganze Nutzerreise im Browser (Free, Pro ohne Freigabe, Pro als Tester, SEPA, Kontentrennung, 320 px hell/dunkel) | `node scripts/account/dev-server.mjs --port=8792 --checkout-access=testers &` dann `node scripts/account/journey-qa.mjs --url=http://localhost:8792 [--engine=webkit]` |

`--checkout-access=testers` spielt die Produktion nach; `/__dev/tester?email=…` (POST) vergibt in der Wegwerf-Datenbank die Rolle
`billing_tester`, `/__dev/checkout/<id>/sepa` und `/__dev/sepa/latest/paid|failed` simulieren die SEPA-Bestätigung.

## 6. Vor der ersten echten Zahlung prüfen

Siehe [RECHTLICHE_ABNAHME.md](RECHTLICHE_ABNAHME.md) (Texte, öffentliche Kündigungs- und Widerrufsfunktion, Abnahmeliste,
Umschalten) und [BREVO.md](BREVO.md) (Newsletter-Checkbox bei der Registrierung, Opt-in in den Einstellungen).

# Nutzerführung: Willkommensseite, Mein Dashboard, Mein Konto

Stand 29.10.2026 · Owner-Auftrag „Persönliches Dashboard, Registrierung, Free/Pro, Checkout und Nutzerführung“.
Baut auf der bestehenden Infrastruktur auf (Supabase `qiytbnpoqvldsatpfkeh`, Worker `vu-account`, Stripe Live, Brevo); keine neue
Datenbank, keine neue Datenhaltung, Passwortmaske und Registrierung unverändert.

## 1. Drei Bereiche

| Bereich | Adresse | Rolle | Inhalt |
|---|---|---|---|
| Willkommensseite | `/willkommen/` | Einstieg nach jeder Anmeldung, nach der E-Mail-Bestätigung und nach bestätigter Zahlung | unverändert: Video, Story-Videos, Produktwelten, Neuigkeiten. **Neu:** Zeile „Mein Dashboard“ (Watchlist und gespeicherte Aktien) direkt unter dem Video, daneben abgesetzt „Konto“; kurze Rückmeldung bei `?konto=verified` bzw. `?konto=pro` |
| Mein Dashboard | `/mein-dashboard/` | persönlicher Investment-Bereich | Konzept [mein-bereich-2026-11](../design/mein-bereich-2026-11/HANDOVER.md), Screen `m-home`: Aufbau nach Prototyp `#v-ich` (siehe unten): Kachel mit Ring „Heute bei deinen Aktien“ (auf der Watchlist, neue Ereignisse, Aktien betroffen), Watchlist als Liste (Vorschau und Link zur Aktie; „+ Aktie hinzufügen oder entfernen“ öffnet Suche und „×“ mit Rückgängig), „Was sich getan hat“ (Ereignisse der Welten je Aktie), „Weiter lernen“ (nächstes ungesehenes Video der Willkommensseite), „Deine Welten“, Kachel Konto und Einstellungen mit Tarif-Marke; unter `#/gespeichert` „Auf diesem Gerät gemerkt“ (lokale Listen, Übernahme auf Klick) |
| Mein Konto | `/konto/` | Einstellungen und Vertrag | persönliche Daten, E-Mail, Passwort und Sicherheit, Tarif, Abonnement, Rechnungen, Zahlungsmethoden (Kundenportal), Kündigung, Datenschutz und Datenexport |

`/dashboard/` ist das bestehende Research-Dashboard (V6.3) und bleibt unverändert; deshalb liegt der persönliche Bereich unter
`/mein-dashboard/`. Die globale Hauptnavigation ist unverändert.

**Darstellung nach App-Konzept 2 (Owner 14.11.2026, nur Darstellung, keine neue Funktion):** `/willkommen/` ist „Home“ des Docks und seit 15.11.2026 genau wie der Bildschirm `#v-home` des Prototyps aufgebaut (Owner: „1:1 wie im Prototyp“, nur die Inhalte sind echt): große grüne Karte (Gruß, Ziel, nächster Schritt; mit Watchlist zeigt der Kreis „n von m im Plus“), Story-Kreise mit Fenster (Markt aus dem Market Pulse, Aktien der jüngsten Insights-Artikel, Magazin, zwei Discover-Themen), „Markt heute“ (Bogen: Anteil über der 200-Tage-Linie, Lage, vier Märkte über ihre Tracker; Fenster mit den Messwerten), „Deine Aktien“ (Watchlist als Schiene, nur angemeldet; jede Karte trägt `data-vu-stock`), „Dein Universe“ (sechs Module; eine Zahl nur, wo die Welt eine kleine Zusammenfassung veröffentlicht: Quant-Meldungen, Technical-Dreiecke, Supertrader „Regeln erfüllt“ als Forschung; alle zehn Module hinter „Alle Module“), „Heute zu lesen“ (neuester Artikel aus `/insights/artikel.json`). Darunter im selben Design, was Home zusätzlich hat: „Mehr aus den Insights“, „Kurz erklärt“, Neuigkeiten, „Weiter“, „Daten & Hinweise“. `/mein-dashboard/` ist „Ich“ und seit 16.11.2026 genau wie der Bildschirm `#v-ich` des Prototyps aufgebaut: Reiter im Inhalt (Ich · Gespeichert · Konto, `<html data-vu-tabs="inhalt">`), Kachel mit Ring (wie viele der Watchlist-Aktien im Plus, größte Bewegung, darunter „auf der Watchlist“, „neue Ereignisse“, „Aktien betroffen“), die Watchlist als Liste (Logo, Name, jüngstes Ereignis, Jahresverlauf, Bewegung als Pille; jede Zeile trägt `data-vu-stock` und führt auf `/aktie/#/<T>`, ein Tipp öffnet die Aktien-Vorschau des Rahmens; ab sechs Aktien klappen die Zeilen hinter „N weitere“ zusammen; „Aktie hinzufügen oder entfernen“ öffnet Suche und „×“ mit Rückgängig), dann im Design des Prototyps, was die Seite zusätzlich hat („Was sich getan hat“, „Weiter lernen“, „Deine Welten“), zuletzt die Kachel „Konto und Tarif“ (mit Tarif-Marke), „Hell · Dunkel · EUR · USD“ (Einstellungen), „Alle Kennzahlen der Watchlist“, „Auf diesem Gerät gemerkt“ und „Daten & Hinweise“; `/konto/`, `/konto/einstellungen/`, `/konto/abo/` und `/konto/watchlist/` sehen seit 16.11.2026 aus wie „Ich“ (Owner: dasselbe Design des Prototyps; der Prototyp hat keinen Konto-Bildschirm, Vorlage ist die Kachel „Konto und Einstellungen“ in `#v-ich`): dieselben Reiter im Inhalt (Ich · Gespeichert · Konto; „Konto“ aktiv, im Watchlist-Detail „Ich“), Dock mit „Ich“, `/konto/` mit Profil-Kachel, Tarif-Kachel und Kacheln aus Zeilen (Icon, Text, Unterzeile, Pfeil) unter „Deine App“, „Vertrag und Zahlung“, „Sicherheit und Daten“; die Unterseiten mit „‹ Konto“ statt der früheren Kontonavigation, Formularen in Kacheln, Benachrichtigungen als Zeilen mit Schalter; „Daten & Hinweise“ am Ende. Funktionen, Formulare, Hinweise und Pflichtlinks sind unverändert; Bestellweg, Anmeldung und Registrierung bleiben ohne Leiste. Aufgaben, Abzeichen, Sammlungen, die Wochenkarte und die Zeilen „Meldungen“ (es werden keine Benachrichtigungen verschickt) und „Spielerisches ausblenden“ aus dem Prototyp sind weggelassen. Tagesrunde, Serie, Punkte, Quiz, Stufen, Abzeichen und Community aus dem Prototyp sind nicht gebaut (späterer, eigener Schritt).

**Rahmen genau nach Prototyp (Owner 15.11.2026, „1:1 wie im Prototyp“; `assets/site-navigation.js`):** Kopf = Welten-Wechsler als Pille (Symbol, Name, Pfeil; öffnet „Dein Universe“), rechts KI · Suche · Profil. Der KI-Knopf ist rund und neongrün mit Funke (wie der Senden-Knopf der Suche im Prototyp), sichtbar 38 px, Tippfläche 44 px, und öffnet `/ask/?fokus=1` (Fokus auf der Eingabe). „i“ und Datums-Pille sind seit 16.11.2026 entfallen (Owner: „das sehen wir ja im Menü“, „jeder erwartet, dass das immer tagesaktuell ist“); die Fenster „Daten & Hinweise“ (aus `assets/legal-notices.json`) und „Datenstand“ (Meldung der Seite über `VUNavigation.datenstand(...)`, sonst beim Öffnen `asOf` aus `quant/data/product/market-regime-v1.json`) öffnen sich über „Daten & Hinweise“ am Seitenende (`VUNavigation.openHinweise/openDatenstand`) und über das Menü (Rechtliches). Lange Modulnamen: zuerst entfällt der Pfeil an der Modul-Pille, dann werden die Abstände enger. Die KI heißt seit 16.11.2026 **„Vision Universe KI“** (vorher „AI Atlas“): „Vision Universe“ klein als Dachzeile, „KI“ groß, Beta bleibt – in der Menükachel, auf `/ask/` und im KI-Fenster der Aktienseiten; interne Namen (`atlas`, `/ask/`, `atlas-sheet.js`, `vu-ask`) bleiben. Das Menü zeigt vier Gruppen mit je zwei Kacheln. **Dunkel ist der Standard** auf allen App-Seiten (eine Regel: `themeWanted`); Hell bleibt wählbar (Menü → Darstellung), „Wie Gerät“ (Konto → Einstellungen) folgt dem Gerät. **Hell ist vollständig hell (Owner 16.11.2026):** Im Hellen gibt es keine dunklen Flächen mehr – Dock, Menü „Dein Universe“, Fenster, Aktie des Tages, „Weiter“-Karte, `.vu-night`-Kacheln und Symbolkacheln (neongrün mit dunklem Zeichen) folgen den Hell-Marken; dunkel bleibt unverändert. Dunkel bleiben im Hellen nur Bilder (Fotos mit Schatten für die Schrift, Video-Standbilder, Video-Spieler) und bewusst umgekehrte Elemente (aktiver Reiter, Minus-Pille, Tintenkachel), die im Dunkeln weiß sind. `theme-color`: hell `#ffffff`, dunkel `#08080a`. Entscheidung zur Umstellung: Weil bis 15.11.2026 die erste besuchte Welt ihr Schema auch ohne Wahl speicherte, gilt beim ersten Laden nach der Umstellung einmal dunkel; wer danach Hell wählt, behält Hell. Die öffentliche Startseite `/` behält ihren eigenen Standard. Schalter für Seiten: `<html data-vu-bleed>` (Kopf durchsichtig bis 24 px Scroll) und `<html data-vu-tabs="inhalt">` (Reiter im Inhalt statt im Rahmen), zur Laufzeit `VUNavigation.rahmen({bleed, tabs})`. Aktien-Vorschau: ein Link oder eine Karte mit `data-vu-stock="<TICKER>"` öffnet `VUStockSheet` (`/assets/vu-stock-sheet.js`, beim ersten Tipp geladen); fehlt die Datei, gilt der Link.

**Startseite `/` (abgemeldet oder Tipp auf das Logo) im selben Aussehen (Owner 14.11.2026, nur Darstellung):** dunkle Kopfkachel mit den zwei Wegen „Kostenlos starten“ und „Erst umsehen, ohne Konto“ und den vier Zahlen, die Aktienkarte mit echten Daten samt Perspektiven-Leiste (die sieben Blickwinkel mit Erklärung öffnen sich über „Alle 7“ im Fenster, ohne JavaScript stehen sie auf der Seite), die drei Einstiege, Umsatz-Säulen, Swipe-Karte, neun Welten mit Vision Universe KI („Alle Module“ öffnet das Menü), Free/Pro mit Link auf `/preise/` und am Ende die „Weiter“-Karte zur Registrierung. Erzeuger, Werte, Links, Kündigungslink im Fuß und der Free/Pro-Ablauf sind unverändert (`scripts/home/build-home.mjs`); der Baustein `assets/vu-ui.js` lädt erst beim ersten Tipp auf ein Fenster.

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
| Was sich getan hat | `mein-dashboard/events.js`, nur gelesen: Technical-Tagesbefund vom Stichtag oder Vortag (`/technical/data/stock/<shard>.json`), Quant-Anlagestil neu/nicht mehr erfüllt (`strategy-index-v1`, `historicalEvidence.transitions`), Supertrader-Regel neu erfüllt laut Methode (`sf-candidates`, `changes.added`; Forschung, nicht zertifiziert; ohne Short-Methode); als Zusatz ohne Zählung: 13F-Neupositionen großer Fonds im jüngsten Quartal (Watchlist-Übersicht) und bester Platz in einer Discover-Reihe |
| Weiter lernen | `/willkommen/config/stories.json`, Gesehen-Merker `vu-welcome-seen-v1` (nur gelesen) |

Nicht gezeigt: Quant-Gesamtscore, Supertrader-Zustände oder -Signale außerhalb der Regelereignisse oben. Eine Aktie ohne Ereignis
von heute bekommt keine Karte; hat keine eines, steht dort ein Satz. Supertrader hat keine eigene Speicherfunktion; es wird nichts vorgetäuscht.

**Erweiterung:** `mein-dashboard/dashboard.js` besteht aus Modulen (`MODULES`: `greeting`, `today`, `watchlist`, `events`, `learn`, `add`, `local`, `shortcuts`, `tabs`).
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
  wird es mit dem nächsten Lauf von „Konten (Buendel account)“, Teil `stripe` abonniert (bis dahin wirken weiter die Abo-Ereignisse).
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

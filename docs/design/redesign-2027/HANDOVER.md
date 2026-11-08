# Vision Universe Redesign – Übergabe an Claude Code

Diese Datei ist die Textfassung der Präsentation „Vision Universe Redesign“ (Artifact). Jede Seite hat eine Kennung. Bilder: `now/<ID>.jpg` (heutige Seite, ganze Länge, 390 px breit). Mockups sind HTML-Screens in `worlds/*.js` (Screen-ID in Klammern), gerendert mit `lib.js` und `render.js`.

Grundregeln: nur Weiß, Schwarz, Neongrün #c8f531; ein Chart (C06) überall; ein Urteil (C08: Stark/Mittel/Schwach/Keine Aussage); jede Fachkennzahl mit Erklärung (C09); Kopfzeile + Produkt-Leiste + Menü je Welt; eine gemeinsame Aktienseite mit Perspektiven-Leiste; keine erfundenen Zahlen; Gates und Budgets aus CLAUDE.md gelten.

### A1 · So liest du diese Präsentation



(Übersichtsfolie, siehe Präsentation)

### A2 · Für wen wir bauen



(Übersichtsfolie, siehe Präsentation)

### A3 · Sieben Regeln für jede Seite



(Übersichtsfolie, siehe Präsentation)


## N · Navigation

Produkt-Leiste je Welt, ein Menü für alle Welten, eine Aktienseite mit Perspektiven.

### N1 · Das Navigationsmodell

So bewegt sich jeder Nutzer: In einer Welt über die Leiste unten, zwischen Welten über das Menü, zu jeder Aktie über Suche oder Karte.

(Übersichtsfolie, siehe Präsentation)

### N2 · Produkt-Leiste je Welt

Gleicher Aufbau in allen Welten. Heute hat jede Leiste eigene Einträge und Reihenfolgen.

(Übersichtsfolie, siehe Präsentation)

### N3 · Das Menü

- Adresse heute: `Menü-Taste in jeder Produkt-Leiste`
- Aufnahme heute: `now/M01.jpg`
- Mockups neu: Menü offen: Suche, 9 Produkte, Mein Bereich, Einstellungen (`sys-menu`)

**Aufbau neu (oben nach unten)**
- Vollbild in Schwarz
- Suchfeld mit Atlas
- Raster 3 × 3 Produkte mit Kurzbeschreibung, aktuelle Welt neongrün
- Mein Bereich: Dashboard, Watchlist, Konto
- Darstellung und Währung

**Bausteine**
- C03 Menü
- C20 Suche

**Daten**
- assets/site-navigation.js (groups)

**Entfällt / ändert sich**
- Lange Unterseiten-Listen je Produkt im Menü (Unterseiten stehen in der Produkt-Leiste)
- „Weitere Produkte“ wird ein Eintrag unten im Menü

### N4 · Aktienkopf: Icons oder Perspektiven-Leiste?

- Adresse heute: `/quant/#/aktie/NVDA`
- Aufnahme heute: `now/Q07.jpg`
- Mockups neu: Aus Quant: Perspektive „Faktoren“ aktiv, Quant-Leiste unten (`sys-stock-q`)
- Warum: Heute nimmt die Leiste „Analysewelten“ mit 9 Icons rund 120 px ein, auf dem iPhone fast ein Siebtel des Bildschirms. Neu: eine Zeile Text mit kleinem Icon, 46 px, seitlich wischbar. Empfehlung: konsolidieren.

**Aufbau neu (oben nach unten)**
- Zeile 1: Zurück, Logo, Name + Kürzel + „was die Firma macht“, Merken
- Zeile 2: Kurs, Bewegung, Schlusskurs-Datum, Euro-Wert
- Zeile 3: Perspektiven Überblick · Chart · Zahlen · Faktoren · Methoden · Wellen · Investoren (klebt beim Scrollen oben)
- Darunter der Inhalt der gewählten Perspektive

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C02 Produkt-Leiste der Herkunftswelt

**Daten**
- Ein Preis für alle Welten: veröffentlichter Schluss (ADR-002, published-close.js)

**Entfällt / ändert sich**
- 9er-Icon-Leiste „Analysewelten“ mit „Alle“-Klappe
- Eigene Kopfbereiche je Welt
- Unterschiedliche Preise und Währungen je Welt

### N5 · Perspektive, Welt und Leiste

Jede Perspektive der Aktienseite gehört zu genau einer Produktwelt.

(Übersichtsfolie, siehe Präsentation)

### N6 · Einsteiger und Profi

- Mockups neu: Einsteiger: drei Urteile, Erklärungen (`sys-einsteiger`); Profi: alle Perspektiven, dunkel (`sys-profi`)
- Warum: Gleiche Seite, zwei Tiefen. Die Wahl trifft man beim ersten Start und unter Konto.

**Aufbau neu (oben nach unten)**
- Einsteiger: Überblick mit drei Urteilen (Geschäft, Eigenschaften, Chart), jede Zahl mit „?“
- Profi: alle sechs Perspektiven als Kacheln, Zonen im Chart, Fachbegriffe
- Wellen, Methoden-Signale und Chart Studio tragen die Marke PRO

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C19 PRO-Marke

**Daten**
- Einstellung im Konto (settings.mode)


## C · Bausteine

20 Bausteine bauen jede Seite. Claude Code baut sie einmal und setzt sie überall ein.

### C · Bausteine C01–C20



(Übersichtsfolie, siehe Präsentation)


## 01 · Einstieg und Mein Bereich

Hell statt Neon, eine Frage statt Werbung: „Wo stehst du?“ Danach ein Weg vom Konto bis Pro, und ein eigener Bereich mit Watchlist, Gespeichert und Konto.

### E01 · Einstieg · Startseite

- Adresse heute: `/`
- Aufnahme heute: `now/E01.jpg`
- Mockups neu: Startseite hell, ganze Seite (`e01-a`); Gleiche Seite im Dunkel-Modus (folgt dem Gerät) (`e01-b`)
- Warum: Heute eine dunkle Werbeseite mit 7.000 px Länge, Neon-Effekten und vielen Sprüngen. Neu: hell, ruhig, zuerst die Frage „Wo stehst du?“, dann echte Beispiele, ein klarer Weg zur Anmeldung.

**Aufbau neu (oben nach unten)**
- Eigene Kopfzeile: Logo, Suche, „Anmelden“ (abgemeldet, ohne Produkt-Leiste)
- Hero: „Aktien verstehen. In klaren Worten.“, Unterzeile für Sparplan bis Profi, Knöpfe „Kostenlos starten“ (→ /konto/registrieren/?plan=free) und „Erst umsehen, ohne Konto“ (→ /discover/)
- Live-Karte NVIDIA: Aktienkopf, Chart 1 Jahr, drei Urteile (Geschäft, Eigenschaften, Chart)
- Vier Zahlen: 6.000+ US-Aktien, 9 Welten, 12 Jahre Zahlen, 7.000+ ETFs
- „Wo stehst du?“: drei Einstiege (Anfänger → Vorsorge, Verstehen → Discover, Profi → Supertrader/Hedgefonds/Screener); merkt die Wahl für den ersten Start (E11)
- Sieben Perspektiven einer Aktie als Liste mit Perspektiven-Leiste
- Fundamental-Beispiel: NVIDIA-Umsatz GJ 2015–2026 als Balken
- Discover-Beispiel: Swipe-Karte ADI + drei Themenbilder
- Neun Welten als Raster, AI Atlas als schwarze Karte
- Preise kurz (Free/Pro), Vertrauen (4 Haken), Schluss-Aufruf, Rechtslinks

**Bausteine**
- C04 Aktienkopf (ohne Perspektiven)
- C05 Perspektiven-Leiste
- C06 Chart
- C08 Urteil
- C09 Erklärung
- C17 Balken
- C07 Kursbewegung
- Einstieg-Muster: Kopfzeile abgemeldet (Logo, Suche, Anmelden)
- Einstieg-Muster: Zahlenband (vier große Zahlen mit neongrüner Linie)
- Einstieg-Muster: Einstiegskarte „Wo stehst du?“

**Daten**
- NVDA-Kurse: quant/data/market/discover-series-long/ (veröffentlichter Schluss, published-close.js)
- Umsatz NVIDIA: Fundamental-Reihen (SEC companyfacts, fundamental/engine/model.js)
- ADI Kurs/Bewegung: dieselbe Kursquelle
- Pro-Preis: GET /v1/plans (Tarifverwaltung /konto/admin/tarife/), nie fest im Code
- Zahlen 6.000+/9/12/7.000+ wie heute (Startseite)

**Entfällt / ändert sich**
- Dunkler Neon-Hintergrund, Glow-Effekte und Mockup im Mockup
- Orbit-Grafik „Ein System. Neun Module.“ (ersetzt durch Raster der neun Welten)
- Doppelte Karten Elliott/Technik/Fundamental (stehen in „Sieben Blickwinkel“)
- Leerer Wachstums-Chart ohne Balken (jetzt echte Balken)
- „App öffnen“ und „Alle Module ansehen“ → „Kostenlos starten“ und „Erst umsehen“

### E02 · Mein Bereich · Willkommen

- Adresse heute: `/willkommen/`
- Aufnahme heute: `now/E02.jpg`
- Mockups neu: Start „Mein Bereich“, ganze Seite (`e02-a`); Nach bestätigter Zahlung (?konto=pro) (`e02-b`); Nach E-Mail-Bestätigung (?konto=verified) (`e02-c`)
- Warum: Die Willkommensseite wird der Start von „Mein Bereich“: erst persönlich (Ziel, Watchlist), dann Erklärvideos und Welten. Die Leiste unten führt zu Watchlist, Gespeichert und Konto.

**Aufbau neu (oben nach unten)**
- Datum + Begrüßung mit Anzeigename (GET /v1/me)
- Großes Video „Vision Universe in 30 Sekunden“ (erste Story)
- Karte „Dein Ziel“ aus dem ersten Start (E11) mit nächstem Schritt; ohne Wahl: „Erster Start“ anbieten
- Watchlist heute: Zähler im Plus, größte Bewegung, die ersten drei Aktien, „Alle 5“ → Watchlist (Platz 1)
- Erklärvideos als wischbare Karten (stories.json)
- Neun Welten als Raster + AI Atlas
- Neuigkeiten (news.json, angeheftet zuerst)
- Rückmeldung oben als Hinweis bei ?konto=pro und ?konto=verified, schließt sich selbst

**Bausteine**
- C01 Kopfzeile (Mein Bereich)
- C02 Produkt-Leiste „mein“, Platz 0
- C10 Aktienzeile
- C13 Abschnittstitel
- Mein-Muster: Ziel-Karte (neongrün)
- Mein-Muster: Watchlist-Zusammenfassung (schwarz)
- Mein-Muster: Story-Karte 148 × 200
- Mein-Muster: Hinweis oben (Toast)

**Daten**
- willkommen/config/stories.json (Titel, Dauer, Vorschaubild)
- willkommen/config/news.json
- GET /v1/me (Name, Tarif), GET /v1/watchlist
- Kurse: /core/data/watchlist-summary-v1/ über core/watchlist-view.js
- Ziel und Erfahrung: Einstellungen im Konto (settings.goal, settings.mode, neu)

**Entfällt / ändert sich**
- Zeile „Mein Dashboard | Konto“ (jetzt Produkt-Leiste: Watchlist, Konto)
- „Alle Produkte“-Link (Menü in der Leiste)
- Kopfzeile mit Mond-Taste (Darstellung liegt im Konto)

### E03 · Einstieg · Preise Free/Pro

- Adresse heute: `/preise/`
- Aufnahme heute: `now/E03.jpg`
- Mockups neu: Preise, ganze Seite (Pro buchbar) (`e03-a`); Zustand: Pro gerade nicht buchbar (`e03-b`)
- Warum: Heute steht beim angemeldeten Nutzer „Pro: derzeit nicht verfügbar / Monat“ als Preis. Neu: zwei klare Karten, ein Vergleich in Haken, ehrlicher Zustand, wenn Pro nicht buchbar ist.

**Aufbau neu (oben nach unten)**
- Kopfzeile abgemeldet (Logo, Suche, Anmelden); angemeldet: Kopfzeile „Mein Bereich“ und Knopf „Im Konto verwalten“
- Titel, ein Satz: beide Tarife gleich, Free ohne Zahlungsdaten
- Karte Free (Linie): 0 €, drei Haken, „Kostenlos starten“ → /konto/registrieren/?plan=free
- Karte Pro (schwarz): Preis aus /v1/plans, „inkl. MwSt. · monatlich kündbar“, Marke „Interner Testpreis“ solange Tester-only, „Pro wählen“ → /konto/registrieren/?plan=pro (angemeldet: /konto/tarife/?plan=pro)
- Vergleich Free/Pro als Haken-Tabelle
- „In keinem Tarif enthalten“: Quant-Gesamtscore, unveröffentlichte Supertrader-Signale, mit Erklärung
- FAQ als Klappen (4 Fragen wie heute)
- „Ich habe schon ein Konto“, Rechtslinks
- Zustand no-price/unavailable: Pro-Karte oben mit „Gerade nicht buchbar“, Knopf gesperrt, Free-Karte darunter

**Bausteine**
- C09 Erklärung
- C19 PRO-Marke
- Einstieg-Muster: Tarifkarte (Linie für Free, Schwarz für Pro)
- Einstieg-Muster: Haken-Vergleich (Spalten Free/Pro)
- Einstieg-Muster: FAQ-Klappe

**Daten**
- GET /v1/plans (Preis, Währung, Zustand), gepflegt über /konto/admin/tarife/ (TARIFVERWALTUNG.md)
- Pro-Preis heute 1,00 €/Monat laut Aufnahme E06
- Rechtstexte: RECHTLICHE_ABNAHME.md

**Entfällt / ändert sich**
- „derzeit nicht verfügbar / Monat“ als Preiszeile (jetzt eigener Zustand)
- Fließtext-Absatz zum Testpreis (jetzt Marke + ein Satz)

### E04 · Einstieg · Registrieren mit Pro-Wahl

- Adresse heute: `/konto/registrieren/?plan=pro`
- Aufnahme heute: `now/E04.jpg`
- Mockups neu: Formular, Pro gewählt (`e04-a`); Nach dem Absenden: E-Mail bestätigen (`e04-b`)
- Warum: Gleiche Felder wie heute, aber mit Schrittanzeige, sichtbarer Pro-Wahl samt Preis, Passwortregeln als Haken und einem klaren nächsten Schritt nach dem Absenden.

**Aufbau neu (oben nach unten)**
- Kopfzeile: Zurück, Logo, „Anmelden“
- Schrittanzeige: 1 Konto · 2 E-Mail · 3 Pro bestätigen (nur bei plan=pro; bei Free zwei Schritte)
- Titel „Konto erstellen“
- Karte „Du hast Pro gewählt · Preis/Monat“, Satz „kein Vertrag, nichts berechnet“, Link „Lieber mit Free starten“ (verwirft die Wahl)
- Felder E-Mail, Anzeigename (optional), Passwort mit „Anzeigen“
- Passwortregeln als Haken, die beim Tippen grün werden
- Pflicht-Checkbox Bedingungen + Datenschutz (große Tippfläche), optionale Newsletter-Checkbox nur bei eingeschaltetem Brevo, nie vorausgewählt
- „Konto erstellen“, Hinweis zur Bestätigungs-E-Mail, „Ich habe schon ein Konto“, Rechtslinks
- Danach: Seite „Schau in dein Postfach“ mit E-Mail-App öffnen, erneut senden, Adresse ändern

**Bausteine**
- Einstieg-Muster: Schrittanzeige
- Einstieg-Muster: Eingabefeld (52 px, Rahmen, Fokus schwarz)
- Einstieg-Muster: Checkbox-Karte (26 px Kästchen, ganze Karte tippbar)
- Einstieg-Muster: Haken-Liste
- C19 PRO-Marke

**Daten**
- POST Registrierung über konto/account-api.js (LEGAL_VERSION)
- Pro-Wahl: localStorage vu-plan-choice-v1 (7 Tage) + user_metadata.plan_intent (30 Tage) + &plan=pro im Bestätigungslink
- Newsletter-Feld: GET /v1/plans → newsletter

**Entfällt / ändert sich**
- Grauer Fließtext-Kasten zur Pro-Wahl (jetzt Karte mit Preis)
- Passwortregeln als Punktliste ohne Rückmeldung

### E05 · Einstieg · Anmelden

- Adresse heute: `/konto/anmelden/`
- Aufnahme heute: `now/E05.jpg`
- Mockups neu: Anmelden mit Ziel-Hinweis (`e05-a`); Deep Link ?next=/konto/watchlist/ + Fehler (`e05-b`)
- Warum: Heute endet die Seite nach dem Formular in Leere. Neu: die Seite sagt, wohin es danach geht, erklärt Fehler direkt am Formular und nennt den Grund bei Deep Links.

**Aufbau neu (oben nach unten)**
- Kopfzeile: Zurück, Logo, „Konto erstellen“
- Bei Deep Link: schwarze Karte mit Grund („Melde dich an, um deine Watchlist zu sehen“)
- Titel, ein Satz
- Felder E-Mail, Passwort (Anzeigen), „Passwort vergessen?“ rechts
- „Anmelden“
- Karte „Danach geht es weiter zu …“ (Mein Bereich, Deep Link oder Pro-Bestätigung bei offener Pro-Wahl)
- Trenner „Neu hier?“ + „Kostenlos Konto erstellen“, Rechtslinks
- Fehler: beide Felder schwarz umrandet, Fehlerkarte direkt unter den Feldern, „Passwort zurücksetzen“

**Bausteine**
- Einstieg-Muster: Eingabefeld
- Einstieg-Muster: Fehlerkarte (schwarz, neongrünes „!“)
- C12 Navigationskarte (Ziel-Hinweis)

**Daten**
- konto/account-api.js#nextAfterSignIn (Ziel: /willkommen/, Deep Link, /konto/tarife/?plan=pro)
- POST /v1/auth/login

**Entfällt / ändert sich**
- Leere untere Bildschirmhälfte
- Link-Zeile „Passwort vergessen? Konto erstellen“ (jetzt am Feld bzw. als Knopf)

### E06 · Konto · Pro-Bestellung

- Adresse heute: `/konto/tarife/?plan=pro`
- Aufnahme heute: `now/E06.jpg`
- Mockups neu: ready: Haken gesetzt, Stripe frei (`e06-a`); not-open: keine Checkbox, „Mit Free weiter“ (`e06-b`); loading: Buchbarkeit wird geprüft (`e06-c`); subscribed: kein Doppelabo (`e06-d`)
- Warum: Heute zeigt die Seite noch einmal beide Tarife, und die Checkbox war für Nicht-Tester gesperrt, ohne Grund im Blick. Neu: eine Bestellbestätigung mit genau einem Zustand je Lage, Erklärung immer in der Bestätigung.

**Aufbau neu (oben nach unten)**
- Kopfzeile: Zurück zu Tarife, „Sicher über Stripe“; keine Produkt-Leiste (Bestellweg)
- Schrittanzeige, Schritt 3 aktiv
- Titel „Pro bestätigen“
- Schwarze Preiskarte: Pro, Preis aus /v1/plans, inkl. MwSt.
- Fakten: Laufzeit, Kündigen, Konto, Umfang
- ready: Pflicht-Checkbox als ganze Karte (Text ohne Links), Links darunter; „Weiter zur Zahlung bei Stripe“ erst nach dem Haken aktiv; „Mit Free weiter“
- loading: Lade-Karte, nichts bedienbar
- not-open: Urteil „Noch nicht buchbar“, Erklärung, nur „Mit Free weiter“ (verwirft die Wahl)
- unavailable/no-price: wie not-open, Titel „Pro ist gerade nicht buchbar“ + Grund
- subscribed: „Du hast Pro“, „Abonnement verwalten“; Worker 409 verhindert Doppelabo

**Bausteine**
- C08 Urteil (Keine Aussage-Form für „Noch nicht buchbar“)
- C09 Erklärung
- C19 PRO-Marke
- kv-Liste
- Einstieg-Muster: Checkbox-Karte
- Einstieg-Muster: Schrittanzeige
- Einstieg-Muster: Bestellzustände loading/ready/not-open/unavailable/subscribed

**Daten**
- konto/account-api.js#checkoutState
- GET /v1/me/billing (checkoutAllowed), GET /v1/plans (Preis)
- POST Checkout mit confirm: true → Stripe Checkout (Abo-Modus)
- POST /v1/me/plan-intent {plan:null} bei „Mit Free weiter“

**Entfällt / ändert sich**
- Zweite Tarifwahl mit Free- und Pro-Karte auf dieser Adresse (Tarife bleiben unter /konto/tarife/ ohne ?plan)
- Konto-Reiter Übersicht/Abonnement/Tarife/Einstellungen im Bestellweg
- Erklärung oben in einer Statusbox außerhalb des Blickfelds

### E07 · Mein Bereich · Konto

- Adresse heute: `/konto/`
- Aufnahme heute: `now/E07.jpg`
- Mockups neu: Konto, ganze Seite (Free, offene Pro-Wahl) (`e07-a`); Abonnement (Beispiel: Pro aktiv) (`e07-b`)
- Warum: Heute vier Reiter und eine leere Ladefläche. Neu: eine Seite mit Profil, Tarif, offener Pro-Wahl und allen Einstellungen als Liste, Platz 4 der Leiste „Mein Bereich“.

**Aufbau neu (oben nach unten)**
- Profil: Initialen, Anzeigename, E-Mail, Mitglied seit
- Tarif-Karte mit „Tarife ansehen“ (bei Pro: „Abonnement verwalten“)
- Offene Pro-Wahl als neongrüne Karte: „Pro fortsetzen“ / „Mit Free weiter“ (nur bei planIntent, ohne Umleitung)
- Deine App: Erfahrung (Einsteiger/Fortgeschritten/Profi), Mein Ziel, Darstellung (Hell/Dunkel/Wie Gerät), Währung
- Vertrag und Zahlung: Abonnement (/konto/abo/), Rechnungen, Verträge hier kündigen (/konto/kuendigen/)
- Sicherheit und Daten: Passwort ändern, Newsletter-Schalter, Daten herunterladen, Rechtliches
- Abmelden, darunter klein „Konto endgültig löschen“ (Bestätigung im Sheet)
- Abonnement-Unterseite: Status-Karte, Kundenportal-Knopf, Rechnungen oder Leerzustand, Hinweise Kündigung/SEPA/Zahlungsfehler

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste „mein“, Platz 3 (Konto)
- C08 Urteil
- C14 Reiter (Darstellung)
- C15 Schalter
- C18 Leerer Zustand
- Mein-Muster: Einstellungszeile (Icon, Titel, Untertitel, Wert/Pfeil)

**Daten**
- GET /v1/me (Profil, entitlements, planIntent)
- GET /v1/me/billing (Abo, Rechnungen), Kundenportal
- /konto/einstellungen/ (appearance, newsletter, export, delete)
- settings.mode und settings.goal (neu, siehe E11)

**Entfällt / ändert sich**
- Reiterleiste Übersicht · Abonnement · Tarife · Einstellungen (jetzt eine Liste)
- Leere graue Ladefläche (jetzt Gerüst der Seite sofort sichtbar)
- Abonnement, Einstellungen bleiben als Unterseiten mit eigener Adresse

### E08 · Mein Bereich · Mein Dashboard

- Adresse heute: `/mein-dashboard/`
- Aufnahme heute: `now/E08.jpg`
- Mockups neu: Watchlist mit 5 Aktien, ganze Seite (`e08-a`); Leerzustand (`e08-b`); Platz 2 „Gespeichert“: Gerät-Listen, Schnellzugriff (`e08-c`)
- Warum: Heute: lange Karte mit „kein Kurs“, Kürzel doppelt, Schnellzugriff als zweite Karte. Neu: das Dashboard ist Platz 1 der Leiste „Watchlist“ mit Tageszusammenfassung, echten Kursen und Mini-Charts; lokal Gemerktes zieht nach „Gespeichert“.

**Aufbau neu (oben nach unten)**
- Kopfzeile „Mein Bereich“, Leiste Platz 1 (Watchlist)
- Titel + Tarif-Marke „Free · 5 von 500“
- Schwarze Tageskarte: Anzahl im Plus, größte Bewegung, Mini-Balken je Aktie (neongrün Plus, weiß Minus)
- Suche „Aktie hinzufügen“ mit Atlas-Knopf
- Sortierung: Meine Reihenfolge, Bewegung heute, Name
- Aktienzeilen mit Name, Kurzbeschreibung, Mini-Chart, Kurs, Bewegung; Wischen nach links = entfernen mit „Rückgängig“
- Karte „Alle Kennzahlen“ → E09 (Profi-Ansicht)
- Karte „Auf diesem Gerät gemerkt“ → Platz 2
- Leerzustand: Urteil „Noch leer“, Satz, beliebte Aktien als Chips
- Gespeichert: lokale Listen mit „Übernehmen“, Europa-Liste gezählt, Schnellzugriff 6 Welten

**Bausteine**
- C02 Produkt-Leiste „mein“, Platz 1 und 2
- C10 Aktienzeile
- C07 Kursbewegung
- C18 Leerer Zustand
- C20 Suche
- C19 PRO-Marke
- Mein-Muster: Tageskarte Watchlist

**Daten**
- GET /v1/watchlist, POST /v1/watchlist/items, …/items/remove, …/import
- Kurse: /core/data/watchlist-summary-v1/ über core/watchlist-view.js (veröffentlichter Schluss, Datum, „veraltet“)
- Lokale Listen: vu-discover-watchlist-v1, vu.quant.watchlist.v1, vu2.watchlist.selection.v1 (W.legacyTickers/planMerge)
- Werte im Mockup: Schluss 30.10.2026 (NVDA, AMD, MU, AAPL, MSFT)

**Entfällt / ändert sich**
- „Die Kurse sind gerade nicht verfügbar“ als Dauerzustand (nur noch bei echtem Ausfall, dann je Zeile „veraltet“)
- Kürzel doppelt als Name
- Lesezeichen-Symbol je Zeile (Entfernen per Wischen)
- Link-Zeile „Startseite · Mein Konto · Einstellungen · Abmelden“ (Leiste und Konto)
- Kein Quant-Gesamtscore, keine Supertrader-Zustände im Dashboard (wie heute, Test mein-dashboard/tests)

### E09 · Mein Bereich · Watchlist-Detail

- Adresse heute: `/konto/watchlist/`
- Aufnahme heute: `now/E09.jpg`
- Mockups neu: NVIDIA aufgeklappt, ganze Seite (`e09-a`); Sheet „Benachrichtigen bei“ (`e09-b`)
- Warum: Heute ein Brotkrumen-Titel und eine graue Ladefläche. Neu: die Profi-Ansicht der Watchlist, je Aktie eine aufklappbare Karte mit Chart, Faktoren, Signal, Notiz und Benachrichtigung; gleicher Platz 1 der Leiste.

**Aufbau neu (oben nach unten)**
- Zurück zur Watchlist, Titel „Alle Kennzahlen“ + PRO-Ansicht-Marke
- Filter-Chips: Alle, Filter (Sheet), Neues 52W-Hoch, Mit Notiz
- Je Aktie eine Karte, eine offen: Kopf (Logo, Name, Kurs, Bewegung), Chart 1 Jahr, Quant-Faktoren als Balken mit Zahl + Urteil, Hinweis „Gesamtscore nicht freigegeben“
- Kacheln Supertrader (Methoden-Zustand) und Technik (Chart-Urteil)
- Notizfeld, Zeile „Benachrichtigen bei“ (öffnet Sheet), „Zur Aktie“ (Aktienseite, Perspektive Überblick), „Entfernen“
- Weitere Aktien eingeklappt
- Sheet: drei Schalter (52W-Hoch + Volumen, Supertrader-Signal, Faktoränderung) mit je einem Satz, Hinweis „Noch nicht aktiv“

**Bausteine**
- C02 Produkt-Leiste „mein“, Platz 1
- C06 Chart
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C15 Schalter
- C16 Sheet
- C19 PRO-Marke
- Mein-Muster: aufklappbare Watchlist-Karte

**Daten**
- /core/data/watchlist-summary-v1/ (Faktor-Stufen, Supertrader, Technik, Aktualität) über core/watchlist-view.js
- Notiz und alerts: watchlist_items.note / .alerts (PATCH über Konto-API)
- Faktorwerte NVIDIA wie Folie N4 (quant/data, Perzentile)

**Entfällt / ändert sich**
- Brotkrumen „Mein Dashboard › Watchlist“ (Zurück-Taste)
- Leere Ladefläche
- Adresse bleibt /konto/watchlist/, wird aber unter „Mein Bereich“ geführt

### E10 · Einstieg · AI Atlas

- Adresse heute: `/ask/`
- Aufnahme heute: `now/E10.jpg`
- Mockups neu: Atlas Start, ganze Seite (`e10-a`); Antwort (Beispiel mit echten Zahlen) (`e10-b`)
- Warum: Heute: Sie-Form, blaue Kugel, englische Abschnitte („Quick Access“), Hinweis „noch nicht freigeschaltet“ klein im Fluss. Neu: du-Form, eine Eingabe, Beispiele als tippbare Fragen, ehrlicher Zustand oben, Antworten mit Zahl, Balken, Erklärung und Rechenweg.

**Aufbau neu (oben nach unten)**
- Eigene Kopfzeile: Zurück, „Atlas“, BETA, Schließen; keine Produkt-Leiste (Vollbild-Werkzeug, öffnet aus der Atlas-Taste jeder Kopfzeile)
- Titel „Was möchtest du wissen?“ + ein Satz zur Datenherkunft
- Eingabe mit Mikrofon und Senden
- Zustand „Noch gesperrt“ direkt unter der Eingabe, solange die Fragefunktion nicht freigeschaltet ist
- Vier Beispielfragen als Karten (aus ask/app.js IDEAS)
- Welten, die Atlas fragt: Quant, Screener, Supertrader
- Vertrauenskarte + Beta-Hinweis
- Antwort: Frage als Blase, Kernsatz mit Zahl, Balken, Erklärung, „So hat Atlas gerechnet“ (Quelle, Kennzahl), Weiter-Karten, Eingabe für Folgefrage

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C12 Navigationskarte
- C17 Balken
- Atlas-Muster: Eingabefeld mit Mikrofon
- Atlas-Muster: Frage-Blase und Rechenweg-Karte

**Daten**
- ask/engine.js, ask/app.js (IDEAS, Freischaltung)
- Free Cashflow NVIDIA GJ 2015–2026: Fundamental-Reihe free_cash_flow (SEC companyfacts)

**Entfällt / ändert sich**
- Sie-Form und englische Titel (Quick Access, Verified by …)
- Blaue Kugel und Farbverläufe
- „Antworten vorlesen“-Knopf ohne Antwort (kommt an die Antwort)
- Quick-Access-Kacheln zu Modulen (Menü übernimmt)

### E11 · Einstieg · Erster Start

- Adresse heute: `neu, nach der ersten Anmeldung` → neu: `/willkommen/start/`
- Mockups neu: Ziel wählen (`e11-a`); Erfahrung: Einsteiger, Fortgeschritten, Profi (`e11-b`); Erste Aktien für die Watchlist (`e11-c`)
- Warum: Gibt es heute nicht. Drei kurze Fragen machen aus einer App für alle die richtige App für dich: Ziel, Erfahrung, erste Aktien. Jede Frage lässt sich überspringen.

**Aufbau neu (oben nach unten)**
- Erscheint einmal nach der ersten Anmeldung bzw. E-Mail-Bestätigung (vor /willkommen/), nicht im Bestellweg Pro (danach)
- Kopf: Zurück, Fortschritt in drei Strichen, „Überspringen“
- 1 Ziel: Mit 10 € im Monat anfangen (→ Vorsorge), Eine Aktie verstehen (→ Aktienseite), Ideen finden (→ Discover), Strategien und Signale (→ Supertrader); eine Wahl
- 2 Erfahrung: Einsteiger, Fortgeschritten, Profi, je mit Satz, was sich ändert
- 3 Erste Aktien: Suche + beliebte Kürzel als Chips, Zähler
- „Fertig“ → /willkommen/ mit Ziel-Karte oben (E02); die Wahl aus „Wo stehst du?“ der Startseite ist vorausgewählt

**Bausteine**
- C08 Urteil (Vorschau)
- C20 Suche
- Einstieg-Muster: Auswahlkarte (neongrün, wenn gewählt)
- Einstieg-Muster: Fortschritt in Strichen
- chips (lm = gewählt)

**Daten**
- settings.goal, settings.mode im Profil (neu, gleiche Einstellungs-API wie appearance)
- Watchlist: POST /v1/watchlist/items je gewählter Aktie
- Beliebte Kürzel: feste Liste im Code (keine Empfehlung)

### E12 · Einstieg · Checkout-Ablauf Free → Pro

Ein Weg, sechs Schritte, nie eine zweite Tarifwahl. Pro gilt erst, wenn Stripe es per Webhook bestätigt; der Rücksprung allein zählt nicht.

(Übersichtsfolie, siehe Präsentation)


## 02 · Discover

Aktien finden ohne Fachwissen: eine Frage oben, ein Satz je Aktie, Themen, Strategien und Swipen. Und die eine Aktienseite für alle Welten.

### D01 · Discover · Übersicht

- Adresse heute: `/discover/#/`
- Aufnahme heute: `now/D01.jpg`
- Mockups neu: Start, ganze Seite (`d01-a`); Sheet „Warum steht diese Aktie hier?“ (`d01-b`)
- Warum: Heute: Hero mit Weltkugel, drei Knöpfe, viele gleich aussehende Karussells. Neu: eine Frage oben, darunter in fester Reihenfolge Markt, eine Aktie des Tages mit Begründung, Themen, Ranglisten.

**Aufbau neu (oben nach unten)**
- Kopf: Datum des Schlusskurses, Frage-Überschrift, Suche mit Atlas, Schnellzugriffe (Welten, Strategien, Swipen, Märkte)
- Der Markt heute: Barometer-Karte (schwarz, Stufe 2 von 5 mit 5er-Skala) + 3 Index-Kacheln mit Mini-Chart und Tagesbewegung
- Heute im Blick: eine große Karte (Klartext-Zahl, Klartext-Satz, Chart 1 Jahr, Gründe als Chips, „?“), Punkte 1 von 5, Knöpfe Aktie ansehen / Swipen
- Themenwelten: Bildkarten seitlich wischbar, „Alle 54“
- Die stärksten Aktien: Reiter Alle / S&P 500 / Nasdaq 100 / Dow, Rangliste 1–4
- Neue Jahreshochs (Anzahl Treffer), Strategien (3 Karten mit Trefferzahl), Bekannte Namen
- Neongrüne Karte „400 Aktien“ → Swipen, Hinweis keine Anlageempfehlung

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Platz Discover)
- C20 Suche
- C06 Chart
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C10 Aktienzeile
- C12 Navigationskarte
- C13 Abschnittstitel
- C14 Reiter
- C16 Sheet
- Discover-Muster: Klartext-Zahl (große Pille + Satz)
- Discover-Muster: Ranglistenzeile (Rang, Logo, Satz, Pille)
- Discover-Muster: Stufen-Skala 5

**Daten**
- discover/data/home/US_REAL.json (surfaces: hero, top-10, top-sp500/ndx/djia) und US_REAL.2/3.json (new-52-week-highs, Themen, bekannte-namen)
- Hero-Karte: cards[].plain, .imBlick.reasons, .badges, .hook
- quant/data/market/intelligence/market-pulse.json (environment.level, label, statement)
- quant/data/market/multi-asset/series/QQQ|SPY|DIA.json
- Trefferzahlen: discover/data/rows/US_REAL/.json → coverage.matched

**Entfällt / ändert sich**
- Hero mit Weltkugel und Werbe-Claim „Sieh den Markt mit anderen Augen“
- Knopf-Trio „Jetzt entdecken / Themenwelten / Märkte“ → Chips unter der Suche
- Mini-Reiter Chart/Umsatz/Gewinn/Cashflow auf jeder Karte → nur auf der Aktienseite
- Grüne Werbekachel „Neue Perspektiven“ und Rot/Grün-Zahlen
- „Market Pulse“-Block wandert in „Der Markt heute“
- Fußzeile mit Links → Menü

### D02 · Discover · Welten

- Adresse heute: `/discover/#/welten`
- Aufnahme heute: `now/D02.jpg`
- Mockups neu: Alle 54 Welten, nach Bereich (`d02-a`); Filter „Energie & Rohstoffe“ aktiv (`d02-b`)
- Warum: Heute: 54 gleich große Bildkacheln, 27 davon mit leerem Platzhalterbild, über 12.000 px lang. Neu: Bereich-Filter oben, große Bilder nur für die wichtigsten Themen, der Rest als kompakte Zeilen.

**Aufbau neu (oben nach unten)**
- Titel, Satz „54 Megatrends“, Themensuche
- Bereich-Chips: Alle, Technologie, Gesundheit, Energie & Rohstoffe, Industrie, Finanzen, Konsum
- Meistgeöffnetes Thema als große Bildkarte
- Je Bereich: Titel mit Anzahl Themen, 2er-Raster Bildkarten (nur Themen mit Bild), übrige Themen als Zeilen mit Aktienzahl
- Hinweis redaktionelle Zuordnung
- Filter-Zustand: Liste mit Vorschaubild oder Icon, Untertitel, Aktienzahl

**Bausteine**
- C02 Produkt-Leiste (Platz Welten)
- C20 Suche
- C09 Erklärung
- C13 Abschnittstitel
- Discover-Muster: Themenkarte (Bild, Titel, Untertitel, Aktienzahl)
- Discover-Muster: Themenzeile

**Daten**
- discover/config/themes.json (54 Themen: id, title, lead, world = Bereich)
- Aktienzahl: discover/data/rows/US_REAL/thema-.json → cards.length
- Bilder: assets/themen/-.webp

**Entfällt / ändert sich**
- Kacheln mit leerem dunklem Verlauf statt Bild → Zeile mit Icon
- Gleiches Gewicht für alle 54 Themen → Bilder nur dort, wo vorhanden
- Kopfbild der Seite entfällt

### D03 · Discover · Thema KI

- Adresse heute: `/discover/#/c/US_REAL/thema-ki`
- Aufnahme heute: `now/D03.jpg`
- Mockups neu: Thema, ganze Seite (`d03-a`); Sheet Sortieren und filtern (`d03-b`)
- Warum: Heute: 30 hohe Karten im 2er-Raster, abgeschnittene Namen, Kurse in Rot und Grün. Neu: Kopfbild, drei Kennzahlen zum Thema, eine Liste mit einer Zeile je Firma.

**Aufbau neu (oben nach unten)**
- Zurück zu Themenwelten
- Kopfbild mit Bereich, Titel, Lead
- Drei Kacheln: Aktien im Thema, wie viele 12 Monate im Plus, wie viele heute im Plus + „?“
- Liste „Die Firmen“ mit Sortier-Chip: Logo, Name, Klartext-Satz, Mini-Chart 1 Jahr, Klartext-Zahl mit Zeitraum
- „Alle 30 zeigen“
- Verwandte Themen (Bildkarten wischbar)
- Hinweis redaktionelle Zuordnung
- Sheet: Reihenfolge (Stärke, 12 Monate, heute, Umsatzwachstum, Name) und Filter

**Bausteine**
- C02 Produkt-Leiste (Platz Welten)
- C11 Kachel
- C09 Erklärung
- C15 Schalter
- C16 Sheet
- Discover-Muster: Aktienzeile mit Klartext-Zahl (statt Tagesbewegung)

**Daten**
- discover/data/rows/US_REAL/thema-ki.json (cards[].plain.zahl, .plain.story, metrics.return12M, changePercent)
- discover/config/themes.json (lead, world)
- Mini-Chart: quant/data/market/discover-series/ref_.json

**Entfällt / ändert sich**
- Hohe Karten im 2er-Raster mit abgeschnittenen Texten („Nummer 2 i…“, „Zwischend…“)
- Euro- und Dollar-Kurs auf jeder Karte → nur auf der Aktienseite
- Rot/Grün → Pillen neongrün/schwarz

### D04 · Discover · Strategien

- Adresse heute: `/discover/#/strategien`
- Aufnahme heute: `now/D04.jpg`
- Mockups neu: Alle 23 Auswahlen in 4 Gruppen (`d04-a`); Eine Strategie: Regel, Treffer, Liste (`d04-b`)
- Warum: Heute: 23 gleich große Bildkarten mit Stockfotos ohne Reihenfolge. Neu: vier Gruppen, je Auswahl eine Zeile mit Regel in Alltagssprache, Trefferzahl und heutiger Nr. 1.

**Aufbau neu (oben nach unten)**
- Titel, Satz „23 Auswahlen mit festen Regeln“
- Gruppen-Chips: Alle, Bewegung, Stärke, Geschäft, Qualität
- Schwarze Karte: beliebteste Auswahl
- 4 Gruppen mit Icon und Satz: Was gerade passiert (6), Stärke über Monate (7), Das Geschäft wächst (6), Qualität (4)
- Zeile: Name, Regel in einem Halbsatz, Trefferzahl, Nr. 1 heute
- Detail (neue Adresse /discover/#/strategien/): Titel, Satz, Kacheln Treffer / Gezeigt / Quelle, Karte „Die Regel“ wörtlich, „?“, Rangliste, Knöpfe Swipen und Im Screener öffnen

**Bausteine**
- C02 Produkt-Leiste (Platz Strategien)
- C11 Kachel
- C09 Erklärung
- C13 Abschnittstitel
- Discover-Muster: Strategiezeile (Name, Regel, Treffer, Nr. 1)
- Discover-Muster: Ranglistenzeile

**Daten**
- discover/data/rows/US_REAL/.json: title, subtitle, rule, coverage.matched, coverage.universeSize, cards[0]
- Gruppierung: neues Feld group in der Row-Registry (Vorschlag), heute aus world ableitbar

**Entfällt / ändert sich**
- Stockfoto je Strategie (Berge, Windräder) → Icon je Gruppe
- Großschreibung gemischt („HEUTE IM BLICK“, „STÄRKSTE AKTIEN …“) → einheitliche Schreibweise
- Keine Trefferzahl heute → Trefferzahl neu sichtbar

### D05 · Discover · Swipen

- Adresse heute: `/discover/#/einzeln/US_REAL` → neu: `/discover/#/swipen`
- Aufnahme heute: `now/D05.jpg`
- Mockups neu: Karte 1 von 400 (`d05-a`); Nach rechts gewischt: gemerkt (`d05-b`); Erster Start: Gesten erklärt (`d05-c`)
- Warum: Heute heißt der Platz „Entdecken“, die Karte zeigt keine Knöpfe zum Merken oder Weiterblättern. Neu: echte Swipe-Karten mit drei klaren Gesten.

**Aufbau neu (oben nach unten)**
- Filter-Chips: Alle, Bekannte, Wachstum (Sammlungen aus feed.rule)
- Karte: Herkunft (Sammlung) und Position, Logo, Name, Kurzbeschreibung, Klartext-Zahl, Klartext-Satz, Chart 1 Jahr, drei Gründe als Chips, ein Satz aus den Geschäftszahlen
- Knöpfe: Weiter (links), Öffnen (Mitte, öffnet die Aktienseite), Merken (rechts, neongrün)
- Nach Merken: schwarzer Hinweis oben mit „Rückgängig“
- Erster Start: Overlay mit den drei Gesten

**Bausteine**
- C02 Produkt-Leiste (Platz Swipen)
- C06 Chart
- C16 Sheet / Overlay
- Discover-Muster: Swipe-Karte
- Discover-Muster: Hinweis (Toast) mit Rückgängig

**Daten**
- discover/data/feed/US_REAL.json (count 400, order[].herkunft, cards[].plain, .badges, .hook)
- Merken schreibt in die Watchlist des Kontos (Mein Bereich)

**Entfällt / ändert sich**
- Platzname „Entdecken“ → „Swipen“
- Mini-Reiter Chart/Umsatz/Gewinn/Cashflow auf der Karte → auf der Aktienseite
- Hinweis „Stand … nicht aktuell“ als gelbes Etikett → Datum im Kopf der App

### D06 · Discover · Suchen

- Adresse heute: `/discover/#/suche`
- Aufnahme heute: `now/D06.jpg`
- Mockups neu: Suche geöffnet, noch nichts getippt (`d06-a`); Tippen „nv“: Treffer (`d06-b`)
- Warum: Heute: eine leere weiße Seite mit Tastatur-Hinweisen für den Computer. Neu: Suchen beginnt mit Vorschlägen, Treffer erscheinen beim Tippen, Fragen gehen an Atlas.

**Aufbau neu (oben nach unten)**
- Suchfeld mit Atlas-Knopf und „Abbrechen“ (öffnet aus jeder Kopfzeile, Lupe)
- Leer: Zuletzt gesucht (Chips, lokal gespeichert), Oft gesucht (Aktienzeilen), Themen (Chips), Frag Atlas (3 Beispielfragen)
- Beim Tippen: Treffer nach Gruppen (Aktien, Themen, Strategien), erster Treffer hervorgehoben, Suchbuchstaben neongrün markiert, „als Frage an Atlas senden“

**Bausteine**
- C20 Suche
- C10 Aktienzeile
- C09 Erklärung
- C13 Abschnittstitel
- Discover-Muster: Trefferzeile mit Markierung

**Daten**
- discover/data/search/US_REAL.json (entries: s, n, a = Kurzbeschreibung, href)
- discover/config/themes.json für Themen-Treffer
- Zuletzt gesucht: localStorage (nur auf dem Gerät)

**Entfällt / ändert sich**
- Tastatur-Hinweise „↑ ↓ zum Auswählen · Esc schließt“ auf dem Telefon
- Leere Seite ohne Vorschläge
- Fußzeile im Suchfenster

### D07 · Discover · Märkte

- Adresse heute: `/discover/#/maerkte`
- Aufnahme heute: `now/D07.jpg`
- Mockups neu: Märkte, ganze Seite (`d07-a`); Sheet „Was heißt Vorsichtig?“ (`d07-b`)
- Warum: Heute: 14.000 px mit Tacho in Orange, Rot und Grün, Karussells je Anlageklasse. Neu: oben eine schwarze Barometer-Karte, darunter Geschichte als 100 Punkte, dann alle Märkte als ruhige Zeilen.

**Aufbau neu (oben nach unten)**
- Zurück zu Discover (erreichbar über „Der Markt heute“ und Chip „Märkte“, Platz Discover)
- Barometer: Stufe als Wort, 5er-Skala, Satz, drei Zustände als Chips, Knopf zum Sheet
- Was die Geschichte sagt: 100 Punkte (im Plus / leicht minus / mehr als −10 %), drei Kacheln, „?“
- Reiter Aktien, Rohstoffe, Gold, Krypto, Zinsen (springen zu Abschnitten)
- Aktienmärkte als Zeilen mit Mini-Chart
- Gewinner und Verlierer nebeneinander (je 5)
- Was heute auffällt: Karten mit Urteil „Ungewöhnlich“
- Weitere Märkte als Zeilen (Öl, Gold, Bitcoin, US-Zins, Bund, Leitzins), Datum je Zeile wenn abweichend
- Sheet: Stufe erklärt, Rückrechnung je Stufe als Balken

**Bausteine**
- C02 Produkt-Leiste (Platz Discover)
- C06 Chart (mini)
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C14 Reiter
- C16 Sheet
- Discover-Muster: Stufen-Skala 5
- Discover-Muster: 100-Punkte-Raster
- Discover-Muster: Marktzeile (Name, Art, Wert, Bewegung)

**Daten**
- quant/data/market/intelligence/market-pulse.json (environment, why, dimensions)
- quant/data/market/intelligence/market-pulse-calibration.json (Rückrechnung je Stufe)
- quant/data/market/multi-asset/series/.json und snapshot.json
- Gewinner/Verlierer und „Was heute auffällt“: Werte aus der heutigen Seite (D07), Datei der Discover-Märkte

**Entfällt / ändert sich**
- Tacho in Orange/Rot/Grün → 5er-Skala neongrün
- Rot/Grün-Balken „67 von 100“ → Punkte-Raster
- Breite Karussellkarten je Markt mit Rahmenfarbe je Klasse → Zeilen
- Wetter-Icons und bunte Symbole
- Euro-Umrechnung je Karte → Dollar wie Quelle, Euro im Konto umschaltbar

### D08 · Discover · Watchlist

- Adresse heute: `/discover/#/watchlist` → neu: `/mein-dashboard/#/watchlist`
- Aufnahme heute: `now/D08.jpg`
- Mockups neu: Watchlist mit 6 Aktien (Beispiel) (`d08-a`); Leerer Zustand mit Startvorschlägen (`d08-b`)
- Warum: Heute: eine Discover-eigene Watchlist, leer, mit großem Fußbereich. Neu: eine Watchlist für alle Welten in „Mein Bereich“, mit Tageszusammenfassung und Benachrichtigungen.

**Aufbau neu (oben nach unten)**
- Welt „Mein Bereich“, Platz Watchlist (Discover-Route leitet weiter)
- Schwarze Karte: wie viele gemerkte Aktien heute im Plus
- Reiter Heute / 12 Monate / Name
- Aktienzeilen mit Mini-Chart und Tagesbewegung
- Benachrichtigungen mit Schaltern (±5 %, Jahreshoch, Quartalszahlen)
- Passt zu deiner Liste (aus discoverNext.similar der gemerkten Aktien)
- Leer: Herz-Icon, Satz, drei bekannte Namen zum Merken, Knopf Swipen

**Bausteine**
- C01 Kopfzeile (Mein Bereich)
- C02 Produkt-Leiste Mein Bereich (Platz Watchlist)
- C10 Aktienzeile
- C14 Reiter
- C15 Schalter
- C18 Leerer Zustand
- C09 Erklärung

**Daten**
- Watchlist im Konto (docs/accounts/WATCHLIST.md), ohne Anmeldung lokal
- Kurse: discover/data/stocks/US_REAL/.json (price, changePercent)
- Vorschläge: discoverNext.similar.cards

**Entfällt / ändert sich**
- Eigene Discover-Watchlist → eine Watchlist für alle Welten
- Großer leerer Weißraum und Fußzeile im leeren Zustand

### D09 · Discover · NVIDIA (Aktienseite)

- Adresse heute: `/discover/#/s/US_REAL/NVDA` → neu: `/aktie/NVDA (Perspektive Überblick)`
- Aufnahme heute: `now/D09.jpg`
- Mockups neu: Überblick, ganze Seite (1 Jahr) (`d09-a`); Zeitraum 5 Jahre (`d09-b`); Sheet Merken und Benachrichtigen (`d09-c`); Profi: alle Kennzahlen (dunkel) (`d09-d`)
- Warum: Die wichtigste Seite der App. Heute: 9er-Icon-Leiste, Tageschart in Rot, Kennzahlen in Euro, Abschnitte hinter „Mehr“-Klappen. Neu: ein Kopf für alle Welten, dann Satz, Zeitachse, Spanne, drei Urteile, Geschäft, Gesundheit, Bewertung, Indizes, Nachbarn.

**Aufbau neu (oben nach unten)**
- C04 Aktienkopf (Zurück, Logo, Name, „was die Firma macht“, Herz) mit Kurs, Bewegung, Schluss-Datum, Euro-Wert; Perspektiven-Leiste, „Überblick“ aktiv, klebt oben
- Chart mit Zeitleiste 1T–Max (Standard 1J)
- In einem Satz: plain.story + Klartext-Zahl + plain.zusatz
- Zeitachse 1M/3M/6M/12M als Pillen
- Jahresspanne: Balken mit Punkt, Tief/Heute/Hoch in $, Satz
- Auf einen Blick: drei Urteile Geschäft / Bewertung / Kurs (tippbar → Perspektive Zahlen bzw. Chart)
- Was macht NVIDIA: ein Satz, Sektor, Börse, Aktienzahl, Themen-Chips
- Geschäft 12 Jahre: Reiter Umsatz/Gewinn/Cashflow, Von→Bis, Balken, Kernsatz neongrün, „?“ GJ, drei belegte Aussagen
- Gesundheit: 4 Kategorien mit Frage, Urteil, Beleg
- Bewertung: KGV gegen Marktmedian, Urteil, „?“, 4 Kacheln
- Dafür / dagegen (3 + 2)
- Indexmitgliedschaften mit Gewicht als Balken
- Platz in Ranglisten (memberships, Rang von N)
- Ähnliche Aktien, Gleiches Thema, Günstiger bewertet (je Regel als Satz)
- Mehr in anderen Welten (6 Perspektiven)
- Daten und Methodik, Hinweis
- Zustände: 5 Jahre (Zuwachs, Hoch/Tief), Merken-Sheet mit Benachrichtigungen und Notiz, Profi „Alle Kennzahlen“ (PRO)

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C06 Chart + Zeitleiste
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C10 Aktienzeile
- C11 Kachel
- C14 Reiter
- C15 Schalter
- C16 Sheet
- C17 Balken
- C19 PRO-Marke
- Discover-Muster: Klartext-Zahl
- Discover-Muster: Jahresspanne
- Discover-Muster: Dafür/Dagegen-Liste
- Discover-Muster: Ranglisten-Platz

**Daten**
- discover/data/stocks/US_REAL/NVDA.json: plain, zeitachse, jahresspanne, geschaeftszahlen, fundamentals.journey.tracks, .story.statements, .health.categories, .valuation, indexMemberships (weight), memberships (rank/of), themes, discoverNext.similar|sameTheme|cheaperAlternatives (rule), metrics, rawValues, ranks
- Chart: quant/data/market/discover-series/ref_NVDA.json (1J), discover-series-long (5J/Max); Preis über published-close.js (ADR-002)
- Merken/Benachrichtigen: Konto-Watchlist (docs/accounts/WATCHLIST.md)

**Entfällt / ändert sich**
- 9er-Icon-Leiste „Analysewelten“ → Perspektiven-Leiste
- Index-Etiketten unter dem Namen → Abschnitt „In welchen Indizes?“ mit Gewicht
- Gelbes Etikett „Letzter Handelstag … heutige Kurse …“ → Schluss-Datum im Kopf
- Leerer Block „Auf einen Blick: Meldungen nicht verfügbar“ → drei Urteile
- Kennzahlen in Euro (189,9 Mrd. €) → Dollar wie SEC-Quelle, Euro nur beim Kurs
- Rot/Grün und goldener Balken → Pillen und neongrüner letzter Balken
- „Ab hier: die Analyse“ (Klappe) → Profi-Ansicht „Alle Kennzahlen“ (PRO)
- Knöpfe „Einzeln weiter entdecken / Zurück zu Discover“ → Produkt-Leiste


## 03 · Quant

Quant misst jede Aktie mit sechs Alltagsfragen („Wächst die Firma?“) und zeigt jeden Tag, was sich verändert hat.

### Q00 · Quant · So ist die Welt gebaut

Vier Plätze in der Leiste. Jede heutige Unterseite hat einen festen Platz. Aktien öffnen immer die eine Aktienseite mit der Perspektive „Faktoren“.

(Übersichtsfolie, siehe Präsentation)

### Q01 · Quant · Übersicht

- Adresse heute: `/quant/`
- Aufnahme heute: `now/Q01.jpg`
- Mockups neu: Start, ganze Seite (`q01-a`); Sheet „So arbeitet Quant“ (`q01-b`)
- Warum: Heute: Hero, langer Kartenstapel mit Zahlen ohne Gewichtung. Neu: zuerst die Frage „Was hat sich verändert?“, dann Marktlage, sechs Tageszahlen, wenige Beispiele und klare Wege.

**Aufbau neu (oben nach unten)**
- Intro: Frage als Titel + ein Satz
- Suche (C20)
- Karte „So arbeitet Quant“: 3 Schritte Misst · Meldet · Vergleicht, tippen öffnet Sheet
- Marktlage als schwarze Karte: Urteil + 37 % über 200-Tage-Linie + Balken + „?“
- „Heute bei Quant“: 6 Kacheln mit Richtungspfeil, Link Radar
- PRO-Karte historischer Vorteil (217 / 93)
- „Setup bestätigt“: 3 Karten mit Interessant ab / Ungültig unter / Ziel 1 und früherer Trefferquote, Link „Alle 23“
- „Neu in einer Strategie“: je Strategie +neu / −raus
- „Selbst suchen“: 4 Navigationskarten
- Vertrauenskarte (lime) → Methodik, Hinweis keine Empfehlung

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Quant aktiv)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C12 Navigationskarte
- C13 Abschnittstitel
- C16 Sheet
- C19 PRO
- C20 Suche
- Quant-Muster: Tageszahl-Kachel (Pfeil + Zahl + Satz)
- Quant-Muster: Setup-Karte mit drei Preisfeldern

**Daten**
- quant/data/product/radar-home-v1.json.gz → summary (newSetups 68, confirmedSetups 5, improvingTickers 565, riskRisingTickers 21, newHighs 217, newStrategyMatches 51, edgeTickers 217, weakerEdgeTickers 93)
- quant/data/product/market-regime-v1.json → regime BROAD_WEAKNESS, measures.above200.share 0,366, trendBullish 0,161
- quant/data/product/decision-intelligence-v1.json (Setup-Karten, Ereignisse)
- quant/data/product/universe-list-v1.json.gz → c (Schlusskurs)
- Werte der Setup-Karten aus Aufnahme Q01

**Entfällt / ändert sich**
- Großer Globus und Hero-Icon entfallen
- „Warum Quant mehr ist als ein Screener“ wandert ins Sheet
- Horizontale Strategie-Karussells werden eine kompakte Liste (+/−)
- Fußzeilen-Links Methodik/Backtesting/SEC-Dateninspektor wandern in Methodik (Q05) und Menü

### Q02 · Quant · Screener

- Adresse heute: `/quant/#/screener`
- Aufnahme heute: `now/Q02.jpg`
- Mockups neu: Einfach: Frage wählen, Treffer (`q02-a`); Sheet „Eigene Bedingung“ (`q02-c`); Profi: Regler und Tabelle (dunkel) (`q02-b`)
- Warum: Heute: 40 gleich aussehende Zeilen mit Fachtext („Bilanz- & Ergebnisqualität: sehr stark (71)“). Neu: Schnellwahl als Fragen, eine Zeile pro Aktie, Profi-Tabelle auf Abruf.

**Aufbau neu (oben nach unten)**
- Intro: „Welche Aktien suchst du?“
- Segment Einfach / Profi (C14)
- Schnellwahl: 7 Karten mit Alltagsfrage + Fachname, aktive Karte schwarz mit Haken
- „Eigene Bedingung“ öffnet Sheet mit den 6 Fragen + Schwelle (ab 50/70/90)
- Lime-Karte „Deine Frage“ in einem Satz + Regel
- Trefferzahl + Sortierung, Ergebniszeilen: Logo, Strategie, Name, zwei Werte, Gesamturteil (C08), Wertblock lime
- „Alle 54 zeigen“, Erklärung, Hinweis
- Profi (dunkel): Regler je Eigenschaft (Bereich), Datenbasis, Sortierung, Regeln teilen/speichern, sortierbare Tabelle aller Treffer mit Spaltenwahl

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C14 Reiter
- C16 Sheet
- C19 PRO
- Quant-Muster: Fragekarte (Frage + Fachname)
- Quant-Muster: Ergebniszeile mit Wertblock
- Quant-Muster: Bereichsregler 0–100

**Daten**
- quant/data/market/factors/screener-FULL_UNIVERSE.json (Faktorwerte je Aktie)
- quant/data/product/strategy-index-v1.json.gz (Strategie-Zugehörigkeit, universe 6.426)
- Trefferwerte aus Aufnahme Q02, Profi-Tabelle aus quant/data/product/factor-evidence-v1/{Shard}.json.gz → factors.profitability/quality/growth/risk.score

**Entfällt / ändert sich**
- Satz „Gezeigt werden die ersten 40 von 54“ → Knopf „Alle 54 zeigen“
- Langer Methodik-Absatz unter der Liste → „?“-Erklärung und Methodik Q05
- Text „Profitabilität: sehr stark (94) · Bilanz-…“ → zwei kurze Werte
- Orange „gemischtes Bild“ → Urteil Mittel (grau)

### Q03 · Quant · Strategien

- Adresse heute: `/quant/#/strategien`
- Aufnahme heute: `now/Q03.jpg`
- Mockups neu: Alle 8 Strategien (`q03-a`); Strategie geöffnet: Regeln und Treffer (`q03-b`)
- Warum: Heute: Fotokarten mit Regeln im Fachjargon („Bilanz- & Ergebnisqualität ≥ 75“). Neu: jeder Stil als Satz, Regeln als Chips in Alltagssprache, Zahl der Treffer groß.

**Aufbau neu (oben nach unten)**
- Intro als Frage + Erklärung „kein Kaufsignal“
- 7 Strategie-Karten: Fachname klein, Satz groß, Regeln als Chips (Alltagswort + Schwelle), Trefferzahl rechts
- Earnings Revision Leader als umrandete Karte „Nicht prüfbar“
- Karte „Wie gut war ein Stil früher?“: Backtest gesperrt
- Detail: Titel, 2 Kacheln, Regeln mit Haken, „?“, bekannte Namen als Aktienzeilen (C10), neu seit gestern, Benachrichtigung (C15), Knopf „Im Screener öffnen“

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C10 Aktienzeile
- C11 Kachel
- C15 Schalter
- Quant-Muster: Strategie-Karte (Satz + Regel-Chips + Zahl)
- Quant-Muster: Regelzeile mit Haken

**Daten**
- quant/data/product/strategy-index-v1.json.gz → profiles[].label, plain, count, tickers (MU, AMD, ADI, AAPL, LLY in momentum-leader)
- Schwellen aus Aufnahme Q03 (conditions im Index ohne Wert)
- radar-home-v1.json.gz → Ereignisse STRATEGY_MATCH_NEW/LOST

**Entfällt / ändert sich**
- Stimmungsfotos je Strategie entfallen (drei Farben, schneller)
- Ausklapper „Was passt heute heißt“ → „?“-Satz oben
- Knopf „Wie Strategien geprüft werden“ → Methodik Q05

### Q04 · Quant · Aktien

- Adresse heute: `/quant/#/aktien`
- Aufnahme heute: `now/Q04.jpg`
- Mockups neu: Aktien, ganze Seite (`q04-a`); Sheet „Was Quant verfolgt“ (`q04-b`)
- Warum: Heute: leere Bereiche ohne Hinweis, fünf Karussells mit Logos. Neu: Suche und Schnellwahl oben, ehrlicher Leerzustand, Listen statt Karussells.

**Aufbau neu (oben nach unten)**
- Intro als Frage
- Suche + Chips mit bekannten Namen
- „Beobachten“: Leerzustand (C18) mit Anleitung; gefüllt = Aktienzeilen
- „Zuletzt angesehen“: Aktienzeilen mit Quant-Urteil
- „Setup bestätigt“: 3 Karten + Link alle 23
- „Neu in einer Strategie“: eine Liste, je Zeile Strategie + stärkste Eigenschaft
- „Bekannte Aktien“: Aktienzeilen
- Link zu Technische Lagen (Q06)
- Sheet: welche Ereignisse beim Beobachten gemeldet werden (Schalter)

**Bausteine**
- C10 Aktienzeile
- C12 Navigationskarte
- C15 Schalter
- C16 Sheet
- C18 Leerer Zustand
- C20 Suche

**Daten**
- quant/data/product/radar-home-v1.json.gz (Setups, Strategie-Ereignisse)
- quant/data/product/radar-ticker-v1/{Shard}.json.gz → tracking (für beobachtete Aktien)
- Watchlist: Konto (docs/accounts/WATCHLIST.md)

**Entfällt / ändert sich**
- Fünf horizontale „Neu in …“-Karussells → eine Liste
- „Bekannte Aktien“-Karussell → Aktienzeilen mit Kurs
- Ausklapper „Was Quant für beobachtete Aktien verfolgt“ → Sheet mit Schaltern

### Q05 · Quant · Methodik

- Adresse heute: `/quant/#/methodik`
- Aufnahme heute: `now/Q05.jpg`
- Mockups neu: Methodik, ganze Seite (`q05-a`)
- Warum: Heute: Textwand, Ampelfarben (Rot bis Grün) für die Stufen. Neu: sechs Fragen mit Gewicht, eine Stufenleiste in Schwarz bis Neongrün, Grenzen als vier Kacheln.

**Aufbau neu (oben nach unten)**
- Intro als Frage
- Kapitel-Chips (Überblick · Eigenschaften · Daten · Backtests · Grenzen), springen zu Abschnitten
- „Was ist was?“: Quant, Screener, Discover in drei Karten
- „Die sechs Fragen“ + Erwartungstrend ausgegraut, Gewicht je Faktor (PRO)
- „So liest du eine Zahl“: Stufenleiste 5 Bänder + Satz + „?“
- „Alles im Detail“: Liste der 8 Unterkapitel
- „Was Quant bewusst nicht sagt“: 4 Kacheln mit Urteil „Keine Aussage“
- Knöpfe Technische Dokumentation und SEC-Dateninspektor (PRO)

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C13 Abschnittstitel
- C19 PRO
- Quant-Muster: Stufenleiste (5 Bänder, schwarz → neongrün)

**Daten**
- quant/data/product/factor-evidence-v1/*.json.gz → factorOrder, factorWeights (quality 0,10 · growth 0,15 · momentum 0,25 · value 0,15 · profitability 0,15 · revisions 0,15 · risk 0,05), bandSemantics
- quant/methodology/* (Unterkapitel)
- quant/data/product/methodology-fingerprint-v1.json (Version)

**Entfällt / ändert sich**
- Rot/Orange/Gelb/Grün-Stufen → Graustufen bis Neongrün
- Ausklapper „Acht Begriffe“ und „Prinzipien“ → Unterkapitel in „Alles im Detail“
- „Transparenz-Matrix“ → Unterkapitel Daten

### Q06 · Quant · Technische Lagen

- Adresse heute: `/quant/#/chartlagen`
- Aufnahme heute: `now/Q06.jpg`
- Mockups neu: Lagen, ganze Seite (`q06-a`); Sheet „Eigene Auswahl“ (`q06-b`)
- Warum: Heute: über 100 gleiche Kacheln, Filter als Dropdowns. Neu: Lage als Urteil, Kurs neben der Zone, 12 Kacheln mit „Alle zeigen“, Filter als Sheet mit Fragen.

**Aufbau neu (oben nach unten)**
- Intro als Frage + Satz
- Reihen als Chips (Nahe einer Zone · 24, Rücksetzer, Abwärtstrend)
- Regel der Reihe als Karte + „?“ zu Zone
- Raster 2 Spalten: Kürzel, Name, Kurs, Lage (C08), Zone, Zeitebene
- „Alle 24 zeigen“
- Karte „Eigene Auswahl“ → Sheet: Trend, Struktur, Universum als Chips, Schalter, Ergebnis-Knopf
- Hinweis „Kein Vorteil belegt“

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C15 Schalter
- C16 Sheet
- C19 PRO
- Quant-Muster: Lage-Kachel

**Daten**
- technical/data/* bzw. quant/data/product/technical-signals-v1/{Shard}.json.gz (Lage, Zone, Struktur)
- quant/data/product/universe-list-v1.json.gz → c (Schlusskurs 30.10.2026)
- Zonen aus Aufnahme Q06 (Stand 01.11.2026)

**Entfällt / ändert sich**
- Dropdowns (Trend, Struktur, Universum) → Sheet mit Chips
- Zweite lange Liste „Eigene Auswahl“ (48 Kacheln) → nach Filtern, nicht dauerhaft auf der Seite
- Grüne Zonenschrift → schwarz, Urteil-Pille für die Lage
- Platz in der Leiste: Aktien (wie heute); auch aus Technical erreichbar

### Q07 · Quant · NVIDIA (Aktienseite, Perspektive Faktoren)

- Adresse heute: `/quant/#/aktie/NVDA` → neu: `/aktie/NVDA?p=faktoren`
- Aufnahme heute: `now/Q07.jpg`
- Mockups neu: Schritte 1–3: Überblick, Eigenschaften, Stärken & Risiken (`q07-a`); Schritte 4–6: Veränderungen, Setup & Strategie, Historie (`q07-b`); Sheet: Belege zu „Wächst die Firma?“ (`q07-c`)
- Warum: Heute: sechs Schritte als seitlich wischbare Karten, nur Schritt 1 sichtbar, rote und orange Werte. Neu: eine lange Seite mit Sprung-Chips, sechs Fragen, Stärken und Risiken in Sätzen, echte Veränderungen und Historie.

**Aufbau neu (oben nach unten)**
- Aktienkopf (C04) mit Perspektive „Faktoren“ aktiv, Quant-Leiste bleibt (Platz Aktien)
- Sprung-Chips 1–6, kleben unter dem Kopf
- 1 Überblick: schwarze Karte 3/6 „Überwiegend stark“, 6 Segmente, drei Kacheln (Verdient gut 99, Kurs ruhig 84, Zahlen solide 43), kleiner Chart (C06) 1 Jahr
- 2 Eigenschaften: 6 Fragen mit Wert, Rang („besser als 97 %“), Urteil, Balken; Erwartungstrend „Nicht bewertbar“; tippen öffnet Beleg-Sheet
- 3 Stärken & Risiken: lime Karte (3 Stärken), schwarze Karte (3 Risiken), Karte „Wie verdient NVIDIA?“ → Perspektive Zahlen
- 4 Veränderungen: 1 besser / 4 schlechter, Verlauf Kursstärke mit Schwelle 70, Liste der Kennzahl-Änderungen
- 5 Setup & Strategie: Setup-Zustand + nächste Stufe, knapp verfehlte Strategien mit Regel-Haken
- 6 Historie: Setup-Rückblick seit 2016, Evidenzstufe, Zeitleiste der Ereignisse
- Sheet Beleg je Eigenschaft: Bausteine mit Rohwert und Teilwert, Vergleichsgruppe, Quelle

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C06 Chart (auch für Faktor-Verlauf)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C16 Sheet
- C19 PRO
- Quant-Muster: Sprung-Chips mit Nummer
- Quant-Muster: Eigenschaftszeile (Frage, Wert, Rang, Urteil, Balken)
- Quant-Muster: Ereignis-Zeitleiste

**Daten**
- quant/data/product/factor-evidence-v1/NV.json.gz → securities.NVDA.factors.*.score/position/components, change.items, investorReturn
- quant/data/product/factor-evidence-history/vu-factor-evidence-2.0.0/*.json.gz → rows.NVDA (Kursstärke-Verlauf)
- quant/data/product/radar-ticker-v1/NV.json.gz → rows.NVDA.tracking (Setup, nextCondition, history, episodes, evidenceState)
- quant/data/product/setup-replay-v1/ref_NVDA.json.gz (552 Wochen, 11 bestätigte Episoden)
- quant/data/product/strategy-index-v1.json.gz (Strategie-Regeln)
- Margen aus Aufnahme Q07 (65,2 % · 41,9 % · 83,4 %)

**Entfällt / ändert sich**
- 9er-Icon-Leiste „Analysewelten“ → Perspektiven-Leiste (C05)
- Seitlich wischbare Schritt-Karten → eine lange Seite mit Sprung-Chips
- Rote/orange/grüne Werte → Urteil in drei Farben
- Ausklapper „Was bedeuten die Eigenschaften?“ → Fragen als Zeilentitel + „?“
- „Kursstärke und Anlegerrendite“ → Schritt 4 Veränderungen
- „Unternehmen, Meldungen und Geschäftszahlen“ → Perspektive Zahlen (Q08)
- Kurs in Euro als Hauptzahl → Dollar-Schluss, Euro als Zusatz (ADR-002)

### Q08 · Quant · NVIDIA Zahlen (Perspektive Zahlen)

- Adresse heute: `/quant/#/aktie/NVDA/zahlen` → neu: `/aktie/NVDA?p=zahlen`
- Aufnahme heute: `now/Q08.jpg`
- Mockups neu: Perspektive Zahlen, aus Quant geöffnet (`q08-a`); Sheet „Welche Zahl?“ (`q08-b`)
- Warum: Heute: eigene Unterseite mit zwei Dropdowns und einem Balkenchart. Neu: Perspektive „Zahlen“ der einen Aktienseite, Kennzahl als Chips und als Frage-Sheet, Quant-Leiste bleibt, Rückweg zu Faktoren.

**Aufbau neu (oben nach unten)**
- Aktienkopf mit Perspektive „Zahlen“
- Herkunfts-Hinweis „Du kommst aus Quant“ mit Rücksprung Faktoren
- Titel als Frage
- Kennzahl-Chips (wischbar), „mehr“ öffnet Sheet mit 8 Fragen
- Großer Wert + Veränderung (C07) + Stichtag
- Balken (C17) über 12 Jahre, Segment Jahre/Quartale/12 Monate
- „?“ zur Kennzahl
- Tabelle (kv) + Ausklapper alle Perioden
- Kacheln mit Bezug zu Quant (Wachstum 86)
- Quelle, Knopf SEC-Dateninspektor (PRO)

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C07 Kursbewegung
- C09 Erklärung
- C11 Kachel
- C14 Reiter
- C16 Sheet
- C17 Balken
- C19 PRO

**Daten**
- VU.D.tracks.revenue (aus fundamental/SEC-Daten im Repo), Umsatz GJ 2026 215,938 Mrd. $
- Fundamental-Welt: gleiche Quelle wie /fundamental/#/NVDA
- quant/data/product/factor-evidence-v1/NV.json.gz → growth.components.revenueCagr3y 1,0005

**Entfällt / ändert sich**
- Eigene Route /quant/#/aktie/NVDA/zahlen → Perspektive Zahlen der einen Aktienseite
- Zwei Dropdowns → Chips + Sheet
- Grüne Balken → schwarz, letztes Jahr neongrün
- „Alle Perioden als Tabelle“ bleibt als Link „Tabelle“

### Q09 · Quant · NVIDIA Chartbild (Perspektive Chart)

- Adresse heute: `/quant/#/aktie/NVDA/chartbild` → neu: `/aktie/NVDA?p=chart`
- Aufnahme heute: `now/Q09.jpg`
- Mockups neu: Perspektive Chart, aus Quant geöffnet (`q09-a`); Historie und Zeitreise (`q09-b`)
- Warum: Heute: Quant-Link landet in der Elliott-Welt mit Elliott-Leiste, eigenem Kopf und Rot/Blau/Grün im Chart. Neu: Perspektive „Chart“ der einen Aktienseite, Quant-Leiste bleibt, der eine Chart mit Zonen.

**Aufbau neu (oben nach unten)**
- Aktienkopf mit Perspektive „Chart“, Quant-Leiste bleibt
- Urteil: „Aufwärts“ groß + Pille „Rücksetzer“, Unterzeile Struktur
- Der eine Chart (C06) mit Schlüsselzone (lime), Zielbereich (grau), Ungültig-Linie gestrichelt; Zeitleiste
- Drei Kacheln Schlüsselzone / Zielbereich / Ungültig unter + „?“
- Drei Szenarien als Karten, Hauptszenario schwarz
- „Warum dieses Bild?“: 2 dafür · 2 dagegen · 3 neutral, Top-3-Gründe, „Alle 7“
- Querverweise Wellen (Elliott) und Chart Studio (PRO)
- Zweiter Screen: Historie (48 % vs. Zufall 69 %, −20,4 Pp., 31 Fälle), Prüfweg, frühere Fälle (12), Zeitreise-Regler

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C06 Chart mit Zonen und Linie
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C19 PRO
- Quant-Muster: Szenario-Karte
- Quant-Muster: Zeitreise-Regler

**Daten**
- technical/data/* Chartbild-Artefakt (Zonen, Szenarien, Gründe), quant/data/product/technical-signals-v1/NV.json.gz
- quant/data/product/pattern-research-v1/study.json (Historie, Zufallsvergleich)
- quant/data/product/setup-replay-v1/ref_NVDA.json.gz (Zeitreise)
- Werte aus Aufnahme Q09 (183–196, 209–230, 175, 48 %, 69 %, 31)
- Kurs: VU.D.nvda (252 Tageskurse)

**Entfällt / ändert sich**
- Wechsel in die Elliott-Welt samt Elliott-Leiste → bleibt in Quant, Perspektive Chart
- Kerzen/Linie-Umschalter und „Wellen an/aus“ → Chart Studio (PRO) bzw. Perspektive Wellen
- Elliott-Block mit Marktstruktur → Perspektive Wellen, hier nur Querverweis
- Rot (Ungültig), Blau (Ziel) → gestrichelte Linie, graue Zone
- Hinweis „Frag VU zu dieser Lesart“ → Atlas in der Kopfzeile


## 04 · Technical

Charts lesen ohne Fachchinesisch: Suche in Worten, fertige Vorlagen, ein Chart mit Zonen. Indikatoren und Chart Studio bleiben für Profis.

### T01 · Technical · Übersicht

- Adresse heute: `/technical/#/`
- Aufnahme heute: `now/T01.jpg`
- Mockups neu: Start, ganze Seite (`t01-a`); Sheet „Was ist ein Setup?“ (`t01-b`)
- Warum: Heute: Zahlenkacheln und lange Listen mit Fachbegriffen. Neu: eine Frage („Was zeigt der Chart?“), Marktlage in einem Satz, fertige Suchen in Alltagssprache.

**Aufbau neu (oben nach unten)**
- Titel als Frage + ein Satz Nutzen
- Suche: Aktie oder Setup in Worten (führt in den Screener mit erkannter Abfrage)
- Schnellwahl NVDA, AAPL, TSLA, MSFT
- 3 Kacheln: Aktien, Setups im Fokus, Stand
- Karte „Markt heute“: Anteil über 200-Tage-Linie (1.931 / 5.663 = 34 %) + Urteil + Erklärung
- Fertige Suchen (3 von 13) mit Alltagstitel und Fachsatz, Link „Alle 13“ → Vorlagen
- Heute neu im Chart: 3 Aktien mit frischem Muster
- Bestenlisten als 4 Kacheln (52W-Hoch, 200W-Hoch, Über SMA 200, Volatilitätskontraktion)
- Aktie im Chart (NVDA) + Grundkurs-Karte
- Hinweis „keine Handlungsempfehlung“

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Technical aktiv)
- C20 Suche
- C11 Kachel
- C08 Urteil
- C09 Erklärung
- C10 Aktienzeile
- C12 Navigationskarte
- C16 Sheet
- Technical-Muster: Vorlagenkarte (Alltagstitel, Fachsatz, Treffer, „+x fast“)
- Technical-Muster: Trefferzeile mit Befund-Pille (neongrün = nach oben, schwarz = nach unten)

**Daten**
- technical/data/index-v1.json (count 5663, focusUnion 1252, templates, presets)
- technical/data/screener-v1.json (aboveSma200, formations[] je Aktie)
- technical/data/meta.json (asOf 2026-10-30)

**Entfällt / ändert sich**
- Großes Hero-Bild mit Icon
- „Setups im Fokus“ und „Strategie-Vorlagen“ als zwei fast gleiche Listen → eine Liste „Fertige Suchen“
- „Technische Ranglisten“ als Liste → 4 Kacheln
- Fachbegriffe ohne Erklärung (SMA, ADX) → Alltagstitel, Fachsatz darunter

### T02 · Technical · Screener

- Adresse heute: `/technical/#/screener`
- Aufnahme heute: `now/T02.jpg`
- Mockups neu: Suche in Worten, Treffer (ganze Seite) (`t02-a`); Filter-Sheet offen (`t02-b`); Profi: Tabelle mit Spalten, dunkel (`t02-c`)
- Warum: Heute: Suchfeld, Filter-Baukasten und 5.663 ungefilterte Treffer untereinander (Seite über 14.000 px). Neu: Suche in Worten zuerst, Filter im Sheet, Treffer mit Befund in Worten, Tabelle für Profis.

**Aufbau neu (oben nach unten)**
- Titel + ein Satz
- Reiter Suchen · Vorlagen · Gespeichert (ersetzt Überblick/Vorlagen/Screener-Reiter)
- Karte „Suche in Worten“: Eingabe, erkannte Regeln als neongrüne Pillen, Hinweis „wir raten nicht“
- Zeile: Filter-Knopf mit Anzahl, Zeitrahmen, Verknüpfung
- Schwarze Karte: Trefferzahl groß + Trichter (865 Dreiecke → 363 über SMA 200 → 220 mit Volumen)
- Trefferliste: Aktienzeile + Befund-Pille, erst 7, dann „Alle 220“
- Suche speichern / Melden
- „Probier auch“: 3 Beispielsätze
- Filter-Sheet: Chartmuster-Chips, nur bestätigte, Trend-Chips (+4 PRO: Supertrend, Ichimoku, Parabolic SAR, 200W-Hoch), Volumen, RSI (PRO), Zeitrahmen, Verknüpfung, Knopf „220 Treffer anzeigen“
- Profi-Tabelle: frei wählbare Spalten, CSV-Export

**Bausteine**
- C14 Reiter
- C10 Aktienzeile
- C15 Schalter
- C16 Sheet
- C19 PRO-Marke
- C09 Erklärung
- Technical-Muster: Suche in Worten mit erkannten Regeln
- Technical-Muster: Treffer-Trichter (Zahl je Regel)
- Technical-Muster: Profi-Tabelle

**Daten**
- technical/data/screener-v1.json (cols: formations, aboveSma200, volAboveAvg, rsi14, distHigh52w, close)
- Trefferzahlen nachgerechnet: Dreieck aktiv 865, + über SMA 200 = 363, + Volumen über Ø = 220 (Stand 30.10.2026)
- technical/engine (Abfrage-Übersetzer technical-query-1.13.0)

**Entfällt / ändert sich**
- Liste aller 5.663 Aktien ohne Filter (Treffer erst nach Suche, sortiert nach erfüllten Regeln)
- Leerer Spaltenwert „Bedingungen –“ in jeder Zeile
- Rot/Grün-Mini-Charts → ein Chart-Stil
- Filter-Baukasten als lange Akkordeon-Seite → Sheet
- Fachfilter (Supertrend, Ichimoku, SAR, ADX) bleiben, aber unter PRO

### T03 · Technical · Vorlagen

- Adresse heute: `/technical/#/vorlagen` → neu: `/technical/#/screener?reiter=vorlagen`
- Aufnahme heute: `now/T03.jpg`
- Mockups neu: Vorlagen, ganze Seite (`t03-a`); Vorlage geöffnet: Regeln in Worten (`t03-b`)
- Warum: Vorlagen sind fertige Screener-Suchen. Neu im Screener-Platz der Leiste als Reiter, mit Alltagstiteln und einer Detailseite, die jede Regel in Worten zeigt.

**Aufbau neu (oben nach unten)**
- Titel + Satz, Reiter Suchen · Vorlagen · Gespeichert
- Gruppe Trend (4), Muster (6), Hochs und Ausbrüche (3) = 13 Vorlagen
- Karte: Alltagstitel fett, Fachname klein, Trefferzahl, „+x fast“
- Erklärung zu „fast erfüllt“
- Detail: Erfüllt / eine Regel fehlt als zwei Kacheln, nummerierte Regeln in Worten mit Fachformel klein, Umschalter Erfüllt/Fast, Treffer ansehen, Anpassen (öffnet Filter-Sheet vorbelegt), Speichern

**Bausteine**
- C14 Reiter
- C11 Kachel
- C09 Erklärung
- C19 PRO-Marke
- Technical-Muster: Vorlagenkarte
- Technical-Muster: Regelliste in Worten

**Daten**
- technical/data/index-v1.json → templates {id: [erfüllt, fast, Flag]} (establishedUptrend 618/433, uptrendBasic 865/602, trend 517/863 …)
- Regeltexte: technical/engine/templates.js (TEMPLATES[].criteria, z. B. establishedUptrend mit 8 Kriterien, sort rsRank)

**Entfällt / ändert sich**
- Eigener Reiter „Vorlagen“ neben Überblick und Screener → Reiter im Screener
- Lange Fließtexte in jeder Karte → Alltagstitel + eine Zeile
- Regeln nur im Fließtext → nummerierte Liste

### T04 · Technical · Gespeicherte Suchen

- Adresse heute: `/technical/#/screener/gespeichert` → neu: `/technical/#/screener?reiter=gespeichert`
- Aufnahme heute: `now/T04.jpg`
- Mockups neu: Leerzustand (`t04-a`); Gefüllt (Beispiel) mit Glocke (`t04-b`)
- Warum: Heute: ein grauer Kasten mit Export/Import als erste Aktion. Neu: klarer Leerzustand mit nächstem Schritt, gefüllt mit Neu-Zähler und Benachrichtigung.

**Aufbau neu (oben nach unten)**
- Reiter Gespeichert im Screener
- Leer: Symbol, Satz mit Nutzen, „Erste Suche starten“, „Vorlage wählen“, Hinweis Konto (geräteübergreifend), Export/Import klein unter „Mehr“
- Gefüllt: je Suche Titel in Worten, Trefferzahl, Änderung seit gestern (neongrün), Glocke + Schalter
- Neue Suche

**Bausteine**
- C14 Reiter
- C15 Schalter
- C18 Leerer Zustand
- C09 Erklärung
- Technical-Muster: Gespeicherte Suche mit Neu-Zähler

**Daten**
- Heute localStorage (Browser); neu: Konto-Speicher workers/vu-account (Watchlist-Tabelle um Suchen erweitern, Owner-Freigabe nötig)
- Trefferzahlen aus technical/data/screener-v1.json

**Entfällt / ändert sich**
- Export/Import als erste Aktion → unter „Mehr“
- Text „Gespeichert wird nur in diesem Browser“ als Hauptaussage → Konto-Hinweis

### T05 · Technical · Methodik

- Adresse heute: `/technical/#/methodik` → neu: `/technical/#/muster`
- Aufnahme heute: `now/T05.jpg`
- Mockups neu: Muster-Lexikon, ganze Seite (`t05-a`); Indikator geöffnet (Sheet) (`t05-b`)
- Warum: Heute: Formeln zuerst (EMA_i = …). Neu: der Platz „Muster“ in der Leiste wird zum Lexikon. Erst Alltagssprache und heutige Häufigkeit, dann Belege, Formel als PRO.

**Aufbau neu (oben nach unten)**
- Titel „Muster“ + Satz, Reiter Muster · Indikatoren · Regeln
- Heute im Markt: 9 Muster mit Alltagssatz, Anzahl, Richtung (▲ neongrün / ▼ schwarz)
- Hilft das Muster? Beleg je Muster: Anteil „lagen vorn“ nach 20 Tagen, Urteil Belegt / Kein Vorteil, Fallzahl
- Indikatoren in 4 Familien (Trend, Schwung, Schwankung, Volumen)
- Regeln und Grenzen (Daten, Zeitrahmen, Suche in Worten)
- Indikator-Sheet: Alltagssatz, NVDA-Chart mit Linie, 3 Zeilen „was bedeutet es“, Formel + Parameter als PRO

**Bausteine**
- C14 Reiter
- C06 Chart (lines)
- C08 Urteil
- C09 Erklärung
- C12 Navigationskarte
- C16 Sheet
- C19 PRO-Marke
- Technical-Muster: Musterzeile mit Häufigkeit und Richtung
- Technical-Muster: Beleg-Karte

**Daten**
- technical/data/meta.json → formations (Typ:Status → Anzahl), z. B. SYMMETRICAL+ASCENDING+DESCENDING_TRIANGLE = 898
- technical/data/formation-evidence.json → types[].hitRate, n, significant (BULL_FLAG 54,4 %, n 1.108, signifikant; GAP_DOWN 49,6 %, n 3.933, nicht signifikant)
- technical/data/signal-evidence.json (Indikator-Ereignisse)

**Entfällt / ändert sich**
- Formeln als Hauptinhalt → PRO-Block im Sheet
- „Methodik“ als eigener Leistenplatz → Leistenplatz „Muster“ (Route /technical/#/muster, alte Adresse leitet um)
- Akkordeons ohne Vorschau → Familien mit Satz
- „Historische Evidenz“ versteckt → eigener Abschnitt mit Urteil

### T06 · Technical · NVIDIA im Chart

- Adresse heute: `/technical/#/chart/NVDA`
- Aufnahme heute: `now/T06.jpg`
- Mockups neu: Einsteiger: Chart, drei Sätze, Preise, Signale (`t06-a`); Profi: Chart Studio, dunkel (`t06-b`); Signal geöffnet (Sheet) (`t06-c`)
- Warum: Heute: Kerzenchart mit vier Linien, Rot/Grün-Zonen und Fachsignalen. Neu: die gemeinsame Aktienseite, Perspektive „Chart“. Einsteiger sehen den einen Chart mit Zonen und drei Sätzen; Chart Studio mit Kerzen und Werkzeugen ist die PRO-Ansicht.

**Aufbau neu (oben nach unten)**
- Aktienkopf mit Perspektive „Chart“ aktiv, Technical-Leiste bleibt (Platz „Chart“)
- Urteil in einem Satz: „Rücksetzer im Aufwärtstrend“ (Mittel)
- Der eine Chart mit Zonen Unterstützung 194–198 / Widerstand 207–217, Zeitleiste, Schalter Zonen/Trendlinie/Durchschnitt
- In drei Sätzen: langer Trend, Schwung (RSI), letzter Tag (Kurslücke), je mit Urteil
- Wichtige Preise: Widerstand 211,63 $ (5 Kontakte), Unterstützung 195,61 $ (4 Kontakte) + Erklärung
- Signale (3 von 6) + Chart Studio öffnen (PRO)
- Chart Studio (PRO, dunkel): Linie/Kerzen, SMA 50 + 200, Zeiträume inkl. 1J·W, Ebenen im Kurs, Unterfenster, alle Signale mit Bullisch/Bärisch/Neutral, Niveaus mit Zonen
- Signal-Sheet: Erklärung, Ungültigkeitsgrenze 212,08 $, historischer Beleg, Beobachten

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C06 Chart (zones, lines)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C16 Sheet
- C19 PRO-Marke
- Technical-Muster: Signalzeile
- Technical-Muster: Preis-Kacheln Widerstand/Unterstützung

**Daten**
- technical/data/screener-v1.json (NVDA: close 204,64, rsi14 35,06, relVol 1,832, aboveSma200, sma50AboveSma200, formations GAP_DOWN 2026-10-30)
- Niveaus und Zonen aus der Aufnahme T06 (Widerstand 211,63 $, Zone 207,25–216,83; Unterstützung 195,61 $, Zone 194,06–197,63)
- technical/data/formation-evidence.json (GAP_DOWN hitRate 0,4961, n 3933)
- Kurse: quant/data/market/discover-series (VU.D.nvda)

**Entfällt / ändert sich**
- Eigener Kopf „Chart Studio“ + 9er-Icon-Leiste → gemeinsamer Aktienkopf
- Kerzen + Rot/Grün in der Standardansicht → Linie, Kerzen nur in Chart Studio (PRO)
- Blaue/graue Linien → gestrichelte Graulinien
- „Bullisch/Neutral/Erhöht“ als Text-Pillen → Urteil-Baustein


## 05 · Fundamental

Geschäftszahlen aus den Pflichtmeldungen an die SEC, jede Kennzahl mit einem Satz Alltagssprache und 12 Jahren Verlauf. Ranglisten mit sichtbarer Regel.

### F01 · Fundamental · Übersicht

- Adresse heute: `/fundamental/#/`
- Aufnahme heute: `now/F01.jpg`
- Mockups neu: Start, ganze Seite (`f01-a`); Zustand: Vergleichsdaten fehlen (`f01-b`)
- Warum: Heute: Kacheln mit „–“, Ranglisten „konnten nicht geladen werden“, Seite endet nach drei Abschnitten. Neu: eine Frage, ein echtes Beispiel mit 12 Jahren Umsatz, Ranglisten als Karten, Mini-Lektion für Einsteiger und ein ehrlicher Fehlerzustand.

**Aufbau neu (oben nach unten)**
- Titel als Frage + Satz zur Quelle
- Suche + Schnellwahl NVDA, AAPL, MSFT, PLTR
- Beispielkarte NVIDIA (schwarz): Urteil, Umsatz-Balken 10 GJ, 4 Zahlen
- Ranglisten: 3 von 6 als Navigationskarten (Regel „ab 10 Mrd. $“ sichtbar), „Alle 6“
- Zahlen lesen in 30 Sekunden: Umsatz, Nettogewinn, Free Cashflow, KGV
- Branchen im Vergleich
- Auswahlen aus Discover als Chips
- 3 Kacheln: 60 Kennzahlen, 12 Jahre, Quelle SEC
- Fehlerzustand: Urteil „Keine Aussage“, was weiter geht, Neu laden, Status-Link

**Bausteine**
- C20 Suche
- C17 Balken
- C08 Urteil
- C12 Navigationskarte
- C11 Kachel
- C18 Leerer Zustand
- C09 Erklärung

**Daten**
- VU.D.tracks.revenue (GJ 2015–2026)
- fundamental/engine/catalog.js → METRICS (60), RANKINGS (6), SIZES
- Universum /screener/data/universe-US_REAL.json (Release, nicht im Repo)

**Entfällt / ändert sich**
- Kacheln mit „–“ (Unternehmen mit SEC-Zahlen, Stand) → nur Kacheln mit Wert
- Großes Hero-Icon
- Grauer Fehlerkasten mitten in der Seite → eigener Zustand mit nächstem Schritt
- Leiste: Entdecken/Suche/Methodik → Ranglisten · Branchen · Methodik (Suche in der Kopfzeile)

### F02 · Fundamental · Entdecken

- Adresse heute: `/fundamental/#/entdecken` → neu: `/fundamental/#/ranglisten`
- Aufnahme heute: `now/F02.jpg`
- Mockups neu: Reiter Auswahlen, ganze Seite (`f02-a`); Reiter Ranglisten (`f02-b`)
- Warum: Heute: über 14.000 px lange Liste der Discover-Auswahl, Ranglisten-Fehler oben. Neu: Leistenplatz „Ranglisten“ mit zwei Reitern; die Auswahl zeigt 5 Firmen mit erklärten Balken, dann „Alle“.

**Aufbau neu (oben nach unten)**
- Titel + Satz, Reiter Ranglisten · Auswahlen
- Auswahlen: Chips je Discover-Auswahl, Satz was sie bedeutet, Erklärung Wachstum
- Firmenkarte: Logo, Name, Umsatz, KGV, drei Balken (Wachstum neongrün, Nettomarge, FCF-Marge)
- 5 Karten, dann „Alle Firmen der Auswahl“
- Ranglisten: 6 Navigationskarten mit Kennzahl im Untertitel, Größenfilter-Hinweis

**Bausteine**
- C14 Reiter
- C09 Erklärung
- C12 Navigationskarte
- Fundamental-Muster: Firmenkarte mit drei Balken

**Daten**
- Werte aus Aufnahme F02 (Discover-Auswahl „Profitables Wachstum“, Stand 30.10.2026): discover/data (Auswahl-Definitionen) + Discover-Aktiendateien
- fundamental/engine/catalog.js → RANKINGS

**Entfällt / ändert sich**
- Endlose Liste (über 40 Karten) → 5 + „Alle“
- „KGV keine Angabe“ als eigene Zeile → im Untertitel nur, wenn vorhanden
- Ranglisten-Fehlerkasten oben → eigener Zustand (F01)
- Route /entdecken → /ranglisten (alte Adresse leitet um)

### F03 · Fundamental · Rangliste Wachstum

- Adresse heute: `/fundamental/#/rangliste/wachstum`
- Aufnahme heute: `now/F03.jpg`
- Mockups neu: Rangliste mit Regel (Werte: Beispiel) (`f03-a`); Zustand: Daten fehlen (`f03-b`)
- Warum: Heute: fast leere Seite mit Fehlermeldung, Regel versteckt im Aufklapper. Neu: Frage als Titel, Regel offen sichtbar, Plätze mit Wert als Urteil-Pille, ehrlicher Leerzustand.

**Aufbau neu (oben nach unten)**
- Zurück zu Ranglisten, Titel + Frage
- Chips: andere Ranglisten (wischbar)
- Größe als Segment: ab 2 / 10 / 100 Mrd. $
- Regel-Karte offen (Text aus RANKINGS.rule)
- Plätze 1–25: Rang, Logo, Name, Umsatz, Wert als neongrüne Pille
- Erklärung „sortiert nur eine Zahl“
- Leerzustand mit Urteil „Keine Aussage“, Neu laden, Regel bleibt sichtbar

**Bausteine**
- C14 Reiter/Segment
- C08 Urteil
- C09 Erklärung
- C18 Leerer Zustand
- Fundamental-Muster: Ranglistenzeile

**Daten**
- fundamental/engine/catalog.js → RANKINGS.wachstum (col revCagr3, Filter revenue ≥ 2,5e8, revCagr3 ≤ 3), SIZES, ranking(U, id, sizeId, 25)
- Universum /screener/data/universe-US_REAL.json (im Release)
- Mockup-Werte: Beispiel aus Aufnahme F02

**Entfällt / ändert sich**
- „Regel dieser Rangliste“ als Aufklapper → offene Karte
- Grauer Fehlerkasten ohne Aktion → Leerzustand mit Neu laden

### F04 · Fundamental · Suchen

- Adresse heute: `/fundamental/#/suche`
- Aufnahme heute: `now/F04.jpg`
- Mockups neu: Suche beim Tippen (`f04-a`); Kein Treffer, erklärt (`f04-b`)
- Warum: Heute: eigener Leistenplatz „Suche“ mit Beispielliste. Neu: Suche sitzt in der Kopfzeile (überall gleich); Treffer zeigen sofort eine Zahl, Kennzahlen sind mit durchsuchbar, kein Treffer wird erklärt.

**Aufbau neu (oben nach unten)**
- Kopfzeilen-Suche öffnet Vollbild-Suchfeld mit Cursor
- Abschnitt Firmen: Aktienzeile + eine Kennzahl
- Abschnitt Kennzahlen: Treffer im Katalog → Methodik
- Zuletzt angesehen + Schnellwahl
- Kein Treffer: Grund in einem Satz (nicht SEC-meldepflichtig), Weg nach Discover

**Bausteine**
- C20 Suche (Kopfzeile)
- C10 Aktienzeile
- C12 Navigationskarte
- C18 Leerer Zustand

**Daten**
- Namen/Kürzel: core/identity.js (securityIdForTicker, matchKey)
- fundamental/engine/catalog.js → METRICS[].label für Kennzahl-Treffer

**Entfällt / ändert sich**
- Leistenplatz „Suche“ → Kopfzeilen-Suche (Route /fundamental/#/suche bleibt als Deep Link und öffnet die Suche)
- Beispielliste ohne Werte

### F05 · Fundamental · Methodik

- Adresse heute: `/fundamental/#/methodik`
- Aufnahme heute: `now/F05.jpg`
- Mockups neu: Methodik, ganze Seite (`f05-a`); Kennzahl geöffnet (ROIC) (`f05-b`)
- Warum: Heute: 7.600 px Fließtext mit Formeln. Neu: Quelle in einer Karte, drei Zeiträume als Kacheln, Kennzahlen nach Kategorie mit Alltagssatz, Formeln als PRO im Sheet.

**Aufbau neu (oben nach unten)**
- Titel + Satz
- Quelle (schwarze Karte)
- Drei Zeiträume GJ / Quartal / LTM als Kacheln
- Kennzahlen in Worten: 7 Kategorien als Chips mit Anzahl (60 gesamt), Liste mit Alltagssatz und Kurzformel
- Bewertung, Vergleich mit der Branche, Lücken und Grenzen (je 1–3 Sätze)
- Alle Formeln (PRO, heutiger Volltext)
- Kennzahl-Sheet: Alltagsbild, NVDA-Wert, Formel PRO, Einordnung

**Bausteine**
- C11 Kachel
- C14 Chips
- C09 Erklärung
- C16 Sheet
- C19 PRO-Marke
- Fundamental-Muster: Kennzahl-Zeile (Name, Alltagssatz, Kurzformel)

**Daten**
- fundamental/engine/catalog.js → CATS, METRICS[].desc, FORMULA
- fundamental/app.js (Methodik-Texte, Abschnitt „Vergleich und Ranglisten“)
- NVDA ROIC 71,3 % aus Aufnahme F06

**Entfällt / ändert sich**
- Ein langer Fließtext → Abschnitte mit je einem Satz
- Formeln im Haupttext → PRO-Ansicht „Alle Formeln“ (Inhalt bleibt vollständig)
- „Fundamental“-Zurück-Link oben

### F06 · Fundamental · NVIDIA in Zahlen

- Adresse heute: `/fundamental/#/NVDA`
- Aufnahme heute: `now/F06.jpg`
- Mockups neu: Überblick, ganze Seite (`f06-a`); Reiter Kennzahlen (`f06-b`); Reiter Finanzen (`f06-c`)
- Warum: Heute: eigener Kopf mit 9er-Icons, Warnung „SEC-Historie nicht verfügbar“, Kacheln ohne Erklärung. Neu: gemeinsame Aktienseite, Perspektive „Zahlen“: Urteil in einem Satz, jede Kennzahl mit Alltagssatz, 12 Jahre über Balken, Finanzen als Tabelle.

**Aufbau neu (oben nach unten)**
- Aktienkopf, Perspektive „Zahlen“ aktiv, Fundamental-Leiste bleibt
- Reiter Überblick · Kennzahlen · Branche · Finanzen
- Urteil-Karte: „Wächst stark und verdient sehr gut“ (Sehr stark)
- Auf einen Blick: 8 Kacheln (Börsenwert 4,97 Bio. $, Umsatz LTM 303 Mrd. $, KGV 25,9, KUV 16,4, Nettomarge 63,7 %, FCF 127 Mrd. $, EK-Rendite 76,3 %, ROIC 71,3 %), jede mit „?“ und Alltagssatz
- 12 Jahre Balken (Umsatz/Gewinn/Cashflow)
- Entwicklung GJ 2016 → 2026 pro Jahr
- Branche: Leerzustand, solange Vergleichsdaten fehlen
- Mehr: Dividende, Analysten, Bewertung im Verlauf, Quellen
- Kennzahlen-Reiter: Suche, 7 Kategorien mit Anzahl und Beispielwert
- Finanzen-Reiter: GuV/Bilanz/Cashflow, Balken, Tabelle GJ 22–26, 5 J/10 J/Alle/Quartale

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C14 Reiter
- C08 Urteil
- C17 Balken
- C18 Leerer Zustand
- C09 Erklärung
- C20 Suche
- Fundamental-Muster: Kennzahl-Kachel mit Alltagssatz
- Fundamental-Muster: Finanztabelle

**Daten**
- Kacheln: Aufnahme F06 (Discover-Bewertung zum Schlusskurs 30.10.2026; LTM aus SEC-Historie)
- VU.D.tracks.revenue | net_income | free_cash_flow | operating_cash_flow | cash | debt | eps_diluted (GJ 2015–2026)
- Entwicklung: Aufnahme F06 (GJ 2016 → 2026)
- /fundamental/data/history/{shardKey}.json.gz (Release), Fallback Discover-Block mit Hinweis

**Entfällt / ändert sich**
- 9er-Icon-Leiste und eigener Kopf → gemeinsamer Aktienkopf
- Grün/Rot-Liniengrafik mit Zeitleiste im Zahlen-Reiter (Chart gehört zur Perspektive „Chart“)
- Beige Warnbox → ehrlicher Leerzustand nur im betroffenen Abschnitt
- Graue/grüne Doppelbalken → ein Balken-Stil (letztes Jahr neongrün)


## 06 · Elliott

Wellenmuster für Profis, immer mit Grenze, ab der die Lesart nicht mehr gilt. Einsteiger sehen zuerst Marktstruktur und ehrliche „Keine Aussage“.

### W01 · Elliott · Übersicht

- Adresse heute: `/elliott/`
- Aufnahme heute: `now/W01.jpg`
- Mockups neu: Start, ganze Seite (PRO-Welt) (`w01-a`); Sheet „Was ist eine Elliott-Welle?“ (`w01-b`)
- Warum: Heute: 14.000 px mit zehn Fünfer-Reihen, Rot/Grün und großen Prozentzonen als Blickfang. Neu: eine Frage, drei Kacheln, Richtungsbalken, zwei Reihen ausgeschrieben, der Rest als Navigationskarten. Jede Karte zeigt die Ungültig-Grenze gleich groß wie die Zone.

**Aufbau neu (oben nach unten)**
- Kopf: Elliott + PRO, Frage als Titel, ein Satz
- Suche
- 3 Kacheln: 163 Lesarten in 135 Aktien, 53 Welle 3, 63 neu
- Richtungsbalken 69 auf / 94 ab
- „Wie ist das gemeint?“ → Sheet
- Filterchips mit Anzahl (Alle, Welle 3, Welle C, Aufwärts, Abwärts; mehr im Filter-Sheet W03)
- Top Welle 3 (4 Karten, Sortierregel sichtbar), Neu bestätigt (3)
- Weitere Reihen als Navigationskarten: Trend 83, Relative Stärke 15, Welle C 80, Engine 32, Große Spanne 33
- Hinweis „experimentell, keine Empfehlung“
- Sheet: 5-Schritte-Schema (chart mit marks, als Schema markiert), Begriffe Zone/Ungültig/Status

**Bausteine**
- C19 PRO-Marke
- C20 Suche
- C11 Kachel
- C06 Chart (Mini, marks)
- C08 Urteil (Bestätigt/Im Aufbau)
- C12 Navigationskarte
- C16 Sheet
- C09 Erklärung
- Elliott-Muster: Lesart-Karte (Welle, Richtung, Status, Zone, Ungültig-Grenze, Rolle, Mini-Chart)

**Daten**
- quant/data/technical-intelligence/v3/elliott-home.json (Overlay): summary {theses 163, securities 135, bullish 69, bearish 94, wave3 53, recent 63, newlyConfirmed 16}, rows[].ids/total, cards[] (tiers, inv.p, st, role)
- Mini-Charts: quant/data/market/discover-series/ref_{T}.json

**Entfällt / ändert sich**
- Zehn gleich gebaute Reihen untereinander → 2 Reihen + Navigationskarten
- Rot/Grün für Richtung → neongrün/schwarz
- Große Prozentzone als Hauptzahl → Zone und Ungültig-Grenze gleichrangig
- Fachwort „Explorativ · nicht als reguläre Alternative freigegeben“ → Rolle klein rechts
- Leiste: Suche-Platz → Methodik (Suche oben in der Seite und in der Kopfzeile)

### W02 · Elliott · Welle 3

- Adresse heute: `/elliott/#/?welle=3`
- Aufnahme heute: `now/W02.jpg`
- Mockups neu: Welle 3, ganze Seite (`w02-a`)
- Warum: Heute: Filter auf der Startseite, Kopf und Kennzahlen wiederholen sich, dann eine lange Liste. Neu: eigener Leistenplatz „Welle 3“, Richtung als Chips mit Anzahl, Sortierregel sichtbar, Karten mit Grenze.

**Aufbau neu (oben nach unten)**
- Titel + Satz mit Anzahl
- Chips Alle 53 · Aufwärts 29 · Abwärts 24 · Filter
- Karte mit Sortierregel
- 10 Lesart-Karten nummeriert, dann „Weitere laden“
- Erklärung Motiv-Alternative, Hinweis experimentell

**Bausteine**
- C02 Produkt-Leiste (Welle 3 aktiv)
- C09 Erklärung
- Elliott-Muster: Lesart-Karte

**Daten**
- elliott-home.json → rows[id=wave3].ids (Reihenfolge der Flaggschiff-Reihe), filters.wave["3"] = 53; Richtung aus cards[].dir (UP 29, DOWN 24)

**Entfällt / ändert sich**
- Wiederholter Hero mit Kennzahlen und Suche
- „Zurücksetzen“ → Chip „Alle“
- Filterzeile mit abgeschnittenen Chips

### W03 · Elliott · Aufwärts

- Adresse heute: `/elliott/#/?richtung=auf`
- Aufnahme heute: `now/W03.jpg`
- Mockups neu: Gefiltert: Aufwärts, ganze Seite (`w03-a`); Filter-Sheet offen (`w03-b`)
- Warum: Aufwärts ist ein Filter der Startseite (Leistenplatz „Elliott“). Neu: Unterfilter direkt als Chips, alle Filter mit Anzahl im Sheet, Adresse bleibt teilbar.

**Aufbau neu (oben nach unten)**
- Titel + Satz mit Anzahl
- Chips der Startseite, Aufwärts aktiv
- Zweite Chipzeile: Welle 3 · 29, Welle C · 32, Bestätigt, Mehr
- 8 Lesart-Karten (Reihenfolge der Index-Karten: Rolle, Status, Rang, Kontext), Weitere laden
- Erklärung Haupt-/Alternative
- Filter-Sheet: Welle, Richtung, Status, Rolle mit Anzahlen, Schalter „nur neu“, Knopf mit Trefferzahl

**Bausteine**
- C14 Chips
- C15 Schalter
- C16 Sheet
- C09 Erklärung
- Elliott-Muster: Lesart-Karte

**Daten**
- elliott-home.json → filters {wave, dir, st, role}; cards[] gefiltert dir=UP in Index-Reihenfolge
- URL-Zustand bleibt: /elliott/#/? mit welle=3, richtung=auf, status=bestaetigt, rolle=highlight, neu=1

**Entfällt / ändert sich**
- Kopf mit Kennzahlen bei jeder Filteränderung
- Filter nur als waagerechte, abgeschnittene Chipzeile

### W04 · Elliott · Neu und verändert

- Adresse heute: `/elliott/#/?neu=1`
- Aufnahme heute: `now/W04.jpg`
- Mockups neu: Neu, gruppiert nach Änderung (ganze Seite) (`w04-a`)
- Warum: Heute: dieselbe Liste wie überall, nur gefiltert, ohne zu sagen, was neu ist. Neu: eigener Leistenplatz „Neu“, gruppiert nach Art der Änderung mit Datum, Benachrichtigung für eigene Aktien.

**Aufbau neu (oben nach unten)**
- Titel + Satz (2 Handelstage)
- 4 Kacheln: Neue Lesart 38, Bestätigt 16, Überarbeitet 7, Zone erreicht 2 (= 63)
- Chips je Art
- Gruppen mit Datum: Bestätigt, Neue Lesart, Zone erreicht (je bis 3, dann „Alle“)
- Erklärung „Zone erreicht“
- Melden-Schalter für Watchlist-Aktien

**Bausteine**
- C11 Kachel
- C14 Chips
- C15 Schalter
- C09 Erklärung
- Elliott-Muster: Lesart-Karte
- Elliott-Muster: Änderungsgruppe mit Datum

**Daten**
- elliott-home.json → cards[].chg {k: NEW|CONFIRMED|REVISED|ZONE, d}; summary.recent 63
- Benachrichtigung: Konto (workers/vu-account), Owner-Freigabe nötig

**Entfällt / ändert sich**
- Ungruppierte Liste ohne Änderungsart
- Wiederholter Kopf mit Kennzahlen

### W05 · Elliott · NVIDIA in Wellen

- Adresse heute: `/elliott/#/NVDA`
- Aufnahme heute: `now/W05.jpg`
- Mockups neu: NVIDIA: keine Lesart, Marktstruktur (ganze Seite) (`w05-a`); Profi: Elliott-Profi, dunkel (`w05-b`); Zustand mit Lesart (Beispiel OPRT) (`w05-c`)
- Warum: Heute: Ausblick, Szenarien, „keine belastbare Lesart“, Marktstruktur und Historie in wechselnder Reihenfolge, Rot/Grün/Blau im Chart. Neu: gemeinsame Aktienseite, Perspektive „Wellen“: zuerst die ehrliche „Keine Aussage“, dann Marktstruktur im einen Chart, Ausblick mit Grenze, Profi-Tiefe auf Abruf.

**Aufbau neu (oben nach unten)**
- Aktienkopf, Perspektive „Wellen“ aktiv, Elliott-Leiste bleibt
- Urteil-Karte „Keine Aussage“: keine belastbare Elliott-Lesart, ein Satz Grund
- Marktstruktur: Chart mit Unterstützung 194–198 und Widerstand 207–217, Zeitleiste, 4 Zeilen (Trend steigend, mittelfristig steigend, Unterstützung, Widerstand), Erklärung
- Technischer Ausblick: „Aufwärts – Rücksetzer im Aufwärtstrend“, Schlüsselzone 183–196 $, Zielbereich 209–230 $, Ungültig unter 175 $, drei Szenarien (Haupt/Alternative/Rand)
- Warum dieses Bild: 2 dafür / 2 dagegen / 3 neutral + Punkte
- Historie: Urteil „Kein Vorteil belegt“, 48 % vs. 69 % Zufall, 31 Lagen
- Elliott-Profi (PRO, dunkel): Chart mit Schlüssel- und Zielzone, Zählungswechsel 3, Neuzuordnungs-Risiko mittel, Zeitreise, frühere Fälle 12, Frag VU
- Zustand mit Lesart: Welle-/Richtungs-Pillen, Status, Chart mit Basis- und Erweitert-Zone, Ungültig-Grenze als Kachel

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C06 Chart (zones)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C18 Leerer Zustand
- C19 PRO-Marke
- Elliott-Muster: Szenario-Karten (Haupt neongrün, Alternativen grau)
- Elliott-Muster: Ungültig-Kachel

**Daten**
- Aufnahme W05 (Stand 30.10.2026): Ausblick, Zonen 183–196 / 209–230 / 175, Marktstruktur 194–198 / 207–217, Historie 48 % / 69 % / 31 / −20,4 Pp., Zählungswechsel 3
- quant/app/page-chartbild.js (Chartbild, Host elliott/app.js)
- quant/data/technical-intelligence/elliott-registry, elliott-validation
- OPRT: elliott-home.json cards[OPRT:E:0] tiers.base [0,0071; 0,3658], ext [0,3658; 0,9461], inv.p 2,15; Kurs ref_OPRT

**Entfällt / ändert sich**
- Eigener Kopf mit 9er-Icons und „Frag VU“ oben → gemeinsamer Aktienkopf, Frag VU im Profi-Teil
- Rot gestrichelte Ungültig-Linie, blaue Zielzonen → neongrün/grau, Grenze als Kachel
- Linie/Kerzen- und Wellen-Schalter in der Einsteigeransicht → nur in Elliott-Profi
- Zeitreise, Zeitebenen, Prüfmethode → Elliott-Profi (PRO), nichts entfällt


## 07 · Supertrader

Die Regeln von 13 berühmten Tradern, täglich auf alle US-Aktien angewendet. Jedes Signal in Alltagssprache, jede Methode mit ehrlichem Prüfstand.

### ST01 · Supertrader · Übersicht

- Adresse heute: `/supertrader/`
- Aufnahme heute: `now/ST01.jpg`
- Mockups neu: Start, ganze Seite (`st01-a`); Sheet „Lebenslauf eines Signals“ (`st01-b`)
- Warum: Heute stehen fünf Zählwerke, drei Stufen-Namen und zwei Methoden-Familien nebeneinander. Neu: eine Zahl, eine Leiter mit drei Stufen, ein ehrlicher Satz zur Belastbarkeit.

**Aufbau neu (oben nach unten)**
- Intro: Titel, ein Satz, Datenstand-Zeile
- Schwarze Karte „Heute erkannt“: 3.368 Treffer + Stufen-Leiter (Bild passt 2.103 · Regel bestätigt 1.188 · Durchgerechnet 77) + Erklärung
- Ehrlichkeits-Karte: Urteil „Nicht belegt“ + Satz, dass keine Methode zertifiziert ist
- Die 13 Methoden: Top 4 nach Treffern mit Stufen-Balken, Stil-Chips (Ausbruch, Trend, Kurslücke, Volumen, Rücksetzer), Link „Alle 13“
- Heute im Musterdepot: 4 Kacheln mit Alltagsnamen der Zustände, Erklärung „Musterdepot“
- Neu erkannt heute: Liste der Stufe-3-Treffer mit Abstand zur Marke
- Beispiel NVIDIA: Chart mit Einstieg ① und Ausstieg ②
- Mehr: Hausstrategie, Backtests, Quellen; Hinweiszeile
- Sheet (Tipp auf „?“ oder Zustand): Lebenslauf eines Signals mit Zahlen je Zustand

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Supertrader · Methoden · Signale · Backtests · Menü)
- C06 Chart mit marks
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C12 Navigationskarte
- C13 Abschnittstitel
- C16 Sheet
- Supertrader-Muster: Stufen-Leiter (3 Felder, Stufe 3 neongrün)
- Supertrader-Muster: Stufen-Balken je Methode (schwarz/grau/neongrün)
- Supertrader-Muster: Zustands-Liste mit Alltagsnamen

**Daten**
- supertrader/data/sf-candidates/summary.json (Stufen CHART / CONFIRMED / MODELED je Methode)
- supertrader/data/signals.json → counts (SETUP+ENTRY_READY = 313, ACTIVE+WARNING+EXIT = 684, CLOSED = 586, TRIGGERED = 0)
- supertrader/data/signals.json → strategies.DONCHIAN_TURTLE (NVDA-Zyklus 02.10.–12.10.)
- Zuordnung Zustand → Alltag: DISCOVERED „Entdeckt“, WATCH „Auf Beobachtung“, SETUP „Muster entsteht“, ENTRY_READY „Kurz vor der Marke“, TRIGGERED „Marke erreicht“, ACTIVE „Modell ist dabei“, WARNING „Warnzeichen“, EXIT „Ausstieg ausgelöst“, CLOSED „Abgeschlossen“, INVALIDATED „Muster geplatzt“, RETIRED_BY_RULE_VERSION „Durch neue Regel ersetzt“, REASSESSED_AFTER_RULE_CHANGE „Nach Regeländerung neu bewertet“

**Entfällt / ändert sich**
- Hero mit zwei Buttons → Intro + schwarze Karte
- „Modellbeobachtung · 5 Methoden“ und „Quellentreue Methoden“ als getrennte Zählwerke → eine Leiter
- Fachbegriffe „Chart-Kandidat / Bestätigtes Research-Setup / Modellierter Handelsablauf“ → „Bild passt / Regel bestätigt / Durchgerechnet“ (Fachbegriff im Sheet „Mehr“)
- „Je Methode“, „Modelldepots“, „Teilprüfung“ → Reiter auf ST02
- „Wie belastbar ist welche Methode?“ → Kurzsatz hier, Liste auf ST05
- Farbige Pillen (Orange, Rot, Blau) → C08 Urteil
- Akkordeons „Was bedeuten die Stufen?“, „Was heißt in Prüfung?“ → Sheet

### ST02 · Supertrader · Methoden

- Adresse heute: `/supertrader/strategies/`
- Aufnahme heute: `now/ST02.jpg`
- Mockups neu: Reiter „13 Methoden“, ganze Seite (`st02-a`); Reiter „Musterdepots“ und „Weitere“ (`st02-b`)
- Warum: Heute 13.500 px mit sechs Gruppen, Farbbalken je Familie und 30 Warn-Pillen. Neu: drei Reiter, jede Methode eine Karte mit einem Satz und einem Stufen-Balken.

**Aufbau neu (oben nach unten)**
- Intro: „Was sucht welche Methode?“
- Reiter: 13 Methoden · Musterdepots 5 · Weitere 7
- Suche + Stil-Chips (Ausbruch, Trend, Kurslücke, Short)
- Legende der Stufen
- 13 Methoden-Karten, sortiert nach Treffern: Name, Trader · Stil, ein Satz, Trefferzahl, Stufen-Balken; Parabolic Short mit „Nur Forschung“
- Erklärung + Akkordeons (Stufen, Datenstände)
- Reiter Musterdepots: 5 VU-Adaptionen mit Positionen und Urteilen „Läuft live“ + „In Prüfung“
- Reiter Weitere: VU Trendfolge 52W, CAN SLIM, Piotroski, Greenblatt, 3 in Vorbereitung

**Bausteine**
- C08 Urteil (Läuft live = m, In Prüfung/Teilprüfung = o, Daten fehlen = w)
- C09 Erklärung
- C14 Reiter
- C20 Suche
- Supertrader-Muster: Methoden-Karte mit Stufen-Balken

**Daten**
- supertrader/data/sf-candidates/summary.json (Treffer je Methode und Stufe)
- supertrader/data/registry.json (Name, Trader, Stil, Kurzbeschreibung)
- supertrader/data/signals.json → strategies[*].open (Positionen je Musterdepot)
- supertrader/data/trend52.json (VU Trendfolge 52W)

**Entfällt / ändert sich**
- Farbige Linien links je Familie → einheitliche Karten
- Warn-Pillen je Methode (z. B. „Kein Stop in der Quelle“) → Methodenseite ST03, Abschnitt „Lücken“
- „höchstens Chart-Kandidat“ → Stufen-Balken
- VU Hausstrategie oben → eigene Karte auf ST01 und Seite ST07
- „Weitere Market-Wizards-Modelle“ → Reiter „Weitere“

### ST03 · Supertrader · Methode Minervini VCP

- Adresse heute: `/supertrader/strategies/minervini-vcp/`
- Aufnahme heute: `now/ST03.jpg`
- Mockups neu: Methodenseite, ganze Seite (`st03-a`); Sheet „Regelkarte“ (PRO) (`st03-b`)
- Warum: Steht stellvertretend für alle 13 Methodenseiten. Heute beginnt die Seite mit sechs Status-Feldern und Fachwörtern. Neu: erst ein Satz, was die Methode sucht, dann das ehrliche Urteil, dann die Aktien kurz vor der Marke.

**Aufbau neu (oben nach unten)**
- Zurück zu Methoden
- Titel + Trader + ein Satz in Alltagssprache mit Bild („Feder, die sich spannt“)
- Karte „Wie belastbar?“ mit Urteil
- Zwei Kacheln: Treffer der Originalregel heute (659) · Musterdepot kurz vor der Marke (2)
- Liste „Kurz vor der Marke“: Grenze, Abstand, Marke als Leiste (KRT, TK)
- Chart der ersten Aktie mit Zone „Marke“ (neongrün) und „Grenze“ (grau)
- Protokoll: Abgeschlossen 1 · Geplatzt 34 · Regelwechsel 1
- Musterdepot: Investiert, Bargeld, Positionen, Risiko je Kauf
- Methodentreue als ein Balken (Original / umgesetzt / VU-eigen / unbelegt / fehlt)
- Akkordeons: So denkt die Methode, Regelkarte PRO, alle Regeln PRO, Lücken, Was sie nicht ist, Quellen (9)
- Sheet Regelkarte: Abschnitte mit Herkunft je Regelteil

**Bausteine**
- C06 Chart mit zones (3 Monate)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C16 Sheet
- C19 PRO-Marke
- kv-Liste
- Supertrader-Muster: Marken-Leiste (Grenze · Kurs · Marke)
- Supertrader-Muster: Methodentreue-Balken

**Daten**
- supertrader/data/signals.json → strategies.MINERVINI_VCP (open: KRT, TK mit levels.trigger / invalidation; Protokoll)
- supertrader/data/registry.json → MINERVINI_VCP (tagline, how_it_thinks, fidelity.rules: 17 Teile nach clsLabel, rule_cards[0].sections: 9 Abschnitte mit provenance → Original / umgesetzt / VU-eigen / Fremdregel / ungeklärt)
- supertrader/data/sf-candidates/summary.json (Minervini SEPA / VCP 659)
- supertrader/data/portfolio.json (Musterdepot)
- Kursreihe KRT: quant/data/market/discover-series/ref_KRT.json
- Seite vereint quellentreue Erkennung (C06 Minervini SEPA) und VU-Musterdepot (MINERVINI_VCP); gilt analog für alle 13

**Entfällt / ändert sich**
- Kopf mit 6 Feldern (Produkt, Regel, Methodentreue, Daten, Evidenz) → eine Urteilskarte
- Farbige Pillen „2 Original · 10 umgesetzt …“ → ein Balken
- Kerzenchart mit 4 farbigen Linien → C06 Chart mit zwei Zonen; Kerzen bleiben in Technical (Chart Studio)
- „Was heißt das?“-Akkordeons → C09 Erklärungen
- Acht Detail-Akkordeons → sechs, Regeltext als PRO-Sheet

### ST04 · Supertrader · Signale

- Adresse heute: `/supertrader/signals/`
- Aufnahme heute: `now/ST04.jpg`
- Mockups neu: Signal-Liste, ganze Seite (`st04-a`); Filter offen (Phase, Methode) (`st04-b`)
- Warum: Heute 890 gleich aussehende Zeilen mit roten Stop-Werten, „Tagesspanne N –“ und Fachbadges. Neu: Phasen in Alltagssprache und eine Leiste, die Stop, Einstieg und Schluss auf einen Blick zeigt.

**Aufbau neu (oben nach unten)**
- Intro + Datenstand
- Suche
- Phasen-Chips: Alle 890 · Modell ist dabei 681 · Ausstieg 3 · Vorbereitet
- Methoden-Chips + Filter-Taste
- Lesehilfe in neongrüner Karte
- Signal-Karten: Kürzel, Name, Methode, Phase (C08), Leiste Stop · Einstieg · Schluss, Luft bis zum Stop, Bewegung seit Einstieg (C07)
- Mehr anzeigen, Akkordeon „Phasen“
- Filter-Sheet: Phase (Alltagsnamen), Methode, Schalter „Neu seit gestern“, „Darvas-Nebensignale“, Button mit Trefferzahl

**Bausteine**
- C07 Kursbewegung
- C08 Urteil (Phase)
- C09 Erklärung
- C15 Schalter
- C16 Sheet
- C20 Suche
- Supertrader-Muster: Signal-Leiste (Stop schwarz, Einstieg Strich, Schluss neongrün)

**Daten**
- supertrader/data/signals.json → strategies[*].open (state, levels, anchor.close, lastPrice)
- Phasen-Zuordnung: ACTIVE → „Modell ist dabei“, WARNING → „Warnzeichen“, EXIT → „Ausstieg ausgelöst“, SETUP → „Muster entsteht“, ENTRY_READY → „Kurz vor der Marke“, NEW_SINCE_PREVIOUS_DATA → Schalter „Neu seit gestern“

**Entfällt / ändert sich**
- Rote Stop-Zahlen und grüne Pfeile → Schwarz/Neongrün
- „Modellposition aktiv“ und „Forschung“-Badges → eine Phase
- „0,1 % unter dem 20-Tage-Hoch · Tagesspanne N –“ → im Detail der Aktie (ST08)
- Zwei Chip-Reihen mit Scrollen → Chips + Filter-Sheet

### ST05 · Supertrader · Backtests

- Adresse heute: `/supertrader/backtests/`
- Aufnahme heute: `now/ST05.jpg`
- Mockups neu: Backtests, ganze Seite (`st05-a`); Sheet „Was der Test zeigte“ (`st05-b`)
- Warum: Heute neun gleiche Blöcke mit farbigen Fachwörtern und eingeklapptem „Was der Test zeigte“. Neu: die ehrliche Antwort zuerst („0 von 9“), ein Prüfstand als Haken-Liste und die Pilot-Kurve im einen Chart.

**Aufbau neu (oben nach unten)**
- Intro: was ein Backtest ist
- Schwarze Karte: 0 von 9 getesteten Regelversionen mit belegtem Vorteil + Satz
- 4 Kacheln: In Prüfung 6, Noch nicht geprüft 3, Ohne Vorteil 0, Kriterien erfüllt 0
- Prüfstand als Haken-Liste (Gates in Alltagssprache)
- Älterer Pilot: C06 Chart (Regel als Fläche, S&P 500 gestrichelt), 3 Kacheln Gesamtrendite, Urteil „Nicht belastbar“, Erklärung größter Einbruch
- Liste je Methode mit Version und Urteil → öffnet Sheet
- Akkordeons: Grundsätze, Nächste Schritte, Kennzahlen PRO
- Sheet je Version: alle Gates mit gemessenem Wert

**Bausteine**
- C06 Chart mit lines (Vergleich gestrichelt)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C16 Sheet
- C19 PRO-Marke
- Supertrader-Muster: Prüfstand (Haken neongrün, Kreuz schwarz)

**Daten**
- supertrader/data/backtests.json → runs[*].gates (label, pass, measured), status, nextSteps
- supertrader/data/pilot-backtest.json → curves.strategy, curves.spy (322 Monatswerte, auf 53 verdichtet), strategy.metrics.full, comparison
- Status-Zuordnung: DATA_COVERAGE_INSUFFICIENT / ADVANCED_RESEARCH → „In Prüfung“, DATA_COVERAGE_PENDING → „Noch nicht geprüft“, NOT_COMPARABLE → „In Prüfung“ (Trendfolge)

**Entfällt / ändert sich**
- Farbige Fachwörter „Methodentreue / Darstellung / Daten“ je Block → ein Urteil je Zeile, Details im Sheet
- Pilot als eingeklappte Zeile → sichtbarer Abschnitt mit Chart
- Akkordeon „Was wird geprüft?“ → Prüfstand-Liste

### ST06 · Supertrader · Quellen

- Adresse heute: `/supertrader/sources/` → neu: `/supertrader/sources/ (über Methodenseite und Menü)`
- Aufnahme heute: `now/ST06.jpg`
- Mockups neu: Quellen, Minervini VCP aufgeklappt (`st06-a`)
- Warum: Heute eine nackte Liste mit „+“. Neu: Zahlen mit Erklärung, aufgeklappte Methode zeigt jede Quelle mit Art und Lese-Stand.

**Aufbau neu (oben nach unten)**
- Intro
- 3 Kacheln: 51 Quellen · 46 mit Adresse · 10 im Volltext gelesen
- Erklärung Urheberrecht
- Liste je Methode mit Anzahl, aufklappbar
- Aufgeklappt: Quelle als Karte mit Titel, Art · Verlag, Lese-Stand („Nur Titelangaben“, „Nicht abgerufen“, „Im Volltext gelesen“)

**Bausteine**
- C09 Erklärung
- C11 Kachel
- C13 Abschnittstitel
- Supertrader-Muster: Quellen-Karte

**Daten**
- supertrader/data/sources.json → sources[] (title, author, publisher_or_site, source_type, access, content_retrieved_by_vu, used_for)
- Zuordnung source_type: BOOK_BIBLIOGRAPHIC „Buch“, OWN_WEBSITE „Website des Traders“, OWN_ARTICLE/OWN_SOCIAL „eigener Beitrag“, ORIGINAL_INTERVIEW „Interview“, SECONDARY „Sekundärquelle“, PRESS „Presse“; access: BIBLIOGRAPHIC_ONLY „Nur Titelangaben“, NOT_RETRIEVED „Nicht abgerufen“

**Entfällt / ändert sich**
- Link „Quellen“ oben rechts in jeder Supertrader-Seite → Eintrag auf der Methodenseite (Akkordeon „Quellen“) und unter „Mehr entdecken“ auf ST01
- Leerer Platz unter der Liste

### ST07 · Supertrader · Hausstrategie

- Adresse heute: `/supertrader/hausstrategie/`
- Aufnahme heute: `now/ST07.jpg`
- Mockups neu: Hausstrategie, ganze Seite (`st07-a`)
- Warum: Heute eine lange Tabelle mit 20 × „5,0 % gehalten“. Neu: das Depot als Chips auf einen Blick, Wechsel neongrün, Regeln und Prüfgeschichte als nummerierte Schritte.

**Aufbau neu (oben nach unten)**
- Zurück, Titel, ein Satz
- Karte „Stand der Prüfung“ mit Urteil „Kein Vorteil belegt“
- Musterdepot: 2 Kacheln (entschieden / nächste Entscheidung), 20 Titel als Chips (neu = neongrün, Tipp öffnet Aktienseite Perspektive „Methoden“), Erklärung: keine Renditen veröffentlicht
- Protokoll: je Entscheidung eine Karte (Rein / Raus / festgeschrieben)
- Die fünf Regeln als nummerierte Schritte
- Ehrliche Prüfgeschichte als Schritte H1, H2, H4, Gegenprobe, Vorwärtslauf
- Hinweiszeile

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- Chips
- Supertrader-Muster: nummerierte Schritte

**Daten**
- supertrader/data/ledger/VU_HOUSE_HS4_V03.json → current.holdings (20 × 0,05), decisions[] (Kauf/Verkauf, festgeschrieben), rules[], nextDecision

**Entfällt / ändert sich**
- 20 Tabellenzeilen „5,0 % gehalten“ → 20 Chips (Gewicht steht einmal im Titel „je 5 %“)
- Orange Evidenz-Box → C08 Urteil in Karte
- Fließtext-Protokoll → Karten mit Rein/Raus

### ST08 · Supertrader · NVIDIA (Perspektive Methoden)

- Adresse heute: `/supertrader/stock/NVDA/` → neu: `Aktienseite, Perspektive „Methoden“`
- Aufnahme heute: `now/ST08.jpg`
- Mockups neu: Aktie NVIDIA, Perspektive „Methoden“, Supertrader-Leiste unten (`st08-a`)
- Warum: Heute eigener Aktienkopf mit Euro-Kurs, Intraday-Chart in Rot und Protokoll mit lila und roten Badges. Neu: gemeinsamer Aktienkopf, die Antwort zuerst, das Protokoll als Zeitleiste und der Zyklus im Chart.

**Aufbau neu (oben nach unten)**
- C04 Aktienkopf: 204,64 $ (veröffentlichter Schluss, ADR-002) + Perspektiven-Leiste, „Methoden“ aktiv
- Schwarze Antwort-Karte: Urteil „Kein Muster“ + Satz
- 3 Kacheln je Methoden-Gruppe (0 von 5 / 0 von 4 / 0 von 4)
- Chart der letzten drei Monate mit ① Einstieg 02.10. und ② Ausstieg 12.10.
- Protokoll als Zeitleiste mit Alltagsnamen (Kurz vor der Marke → Modell steigt ein → Warnzeichen → Abgeschlossen), Link „Ältere (13)“
- Erklärung Musterdepot
- Alle 13 Methoden mit „Nein“ je Methode (bei Treffer: Stufe als Urteil)

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C02 Supertrader-Leiste bleibt
- C06 Chart mit marks
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- Supertrader-Muster: Protokoll-Zeitleiste

**Daten**
- supertrader/data/stock/NVDA.json bzw. signals.json → bySymbol.NVDA (DARVAS_BOX, DONCHIAN_TURTLE: transitions mit state, date, price)
- supertrader/data/sf-candidates/ticker/NV.json (keine Treffer der 13)
- Kurs: quant/engines/published-close.js (204,64 $ statt 183,17 €)
- Zuordnung: ENTRY_READY „Kurz vor der Marke“, TRIGGERED+ACTIVE „Modell steigt ein“, WARNING „Warnzeichen“, EXIT+CLOSED zusammengefasst „Abgeschlossen“

**Entfällt / ändert sich**
- Eigener Kopf mit Euro-Kurs und 9er-Icon-Leiste → C04 + C05
- Roter Intraday-Chart → C06 Chart (3 Monate) mit Zyklus-Marken
- Doppelte Einträge „Ausstieg ausgelöst“ + „Geschlossen“ am selben Tag → ein Eintrag
- „Chartbild der Methode: Kerzen, Linien, Marken“ → Technical, Perspektive „Chart“
- „Quellentreue Methoden“ ganz unten → Antwort-Karte oben

### ST-Z · Supertrader · Zustände in Alltagssprache

Verbindliche Zuordnung für alle Supertrader-Seiten. Der Code-Zustand bleibt, die Oberfläche zeigt nur den Alltagsnamen (Fachname im Sheet „Mehr“).

(Übersichtsfolie, siehe Präsentation)


## 08 · Hedgefonds

Was die bekanntesten Investoren kaufen und verkaufen, direkt aus den Pflichtmeldungen an die US-Börsenaufsicht. Ehrlich datiert: Die Meldungen sind bis zu viereinhalb Monate alt.

### H01 · Hedgefonds · Übersicht

- Adresse heute: `/hedgefonds/`
- Aufnahme heute: `now/H01.jpg`
- Mockups neu: Start, ganze Seite (`h01-a`)
- Warum: Heute beginnt die Seite mit großem Bild und Fotos, rote und grüne Balken, sechs bunte Kacheln. Neu: Was ist eine 13F-Meldung (ehrliches Datum), dann die Stars, dann die Bewegungen in Schwarz und Neongrün.

**Aufbau neu (oben nach unten)**
- Intro: „Was Profis kaufen“ + Satz zur Meldepflicht
- Stand-Zeile: Quartal + Prüfdatum
- Suche + Schnell-Chips (Investoren, Aktien)
- 3 Kacheln: 788 Hedgefonds (79 Stars) · 64 DACH · nächste Frist 14.11.
- Erklärung 13F mit Verzug
- Star-Investoren: wischbare Karten (Initialen oder Foto, Fondsgröße, Veränderung, Top 2, Meldestand)
- Käufe und Verkäufe: Reiter Stars / Alle, Top 3 Käufe (neongrüne Balken), Top 3 Verkäufe (schwarze Balken), Erklärung „geschätzter Wert“
- Meistgehalten bei Stars: Top 4 mit Zahl der Fonds
- Entdecken: 4 Karten (Stars, Aktien, Insider-Käufe, DACH)

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Hedgefonds · Investoren · Aktien · Smart Money · Menü)
- C07 Kursbewegung (Fondsgröße ggü. Vorquartal)
- C09 Erklärung
- C11 Kachel
- C14 Reiter
- C20 Suche
- Hedgefonds-Muster: Investor-Karte
- Hedgefonds-Muster: Fluss-Zeile (Kauf neongrün, Verkauf schwarz)
- Hedgefonds-Muster: Avatar mit Stern für Star-Investoren

**Daten**
- hedgefonds/data/hedgefonds.json (latestPeriodLabel, hedgefondsCount 788, dachCount 64, funds[] mit manager, slug, totalValueUSD, aumChangePct, top)
- hedgefonds/data/hedgefonds.json → aggregates.buys / sells / consensus (Stars) und aggregatesAll (alle)
- Fotos: hedgefonds/data/manager-photos.json (Lizenzzeile bleibt im Detail)

**Entfällt / ändert sich**
- Großes Kopfbild mit Säulen → Intro
- Farbige Avatare und bunte Entdecken-Kacheln (Lila, Grün, Rosa, Orange) → Schwarz/Neongrün
- Rote/grüne Mengen-Balken → Fluss-Zeile
- „Fonds-Einstiege“ als Kachel → Reiter auf Smart Money (H06)
- „Datenbank“ in der Leiste → Reiter „Alle Fonds“ unter Investoren (H03)
- Akkordeon „Wie wird das gezählt?“ → C09 Erklärungen an den Zahlen

### H02 · Hedgefonds · Investoren

- Adresse heute: `/hedgefonds/#/investoren`
- Aufnahme heute: `now/H02.jpg`
- Mockups neu: Reiter „Star-Investoren“, ganze Seite (`h02-a`); Sheet „Was heißt welcher Stil?“ (`h02-b`)
- Warum: Heute große bunte Karten, zwölf auf 8.400 px. Neu: eine Zeile je Investor, Stil-Chips, eine Erklärung, was die Prozentzahl bedeutet (keine Rendite).

**Aufbau neu (oben nach unten)**
- Intro
- Reiter: Star-Investoren 79 · Alle Fonds 788 (= heutige Datenbank H03)
- Suche, Stil-Chips, Sortierung
- Investor-Zeilen: Avatar mit Stern, Name, Firma · Stil, Depotwert, Veränderung zum Vorquartal (C07)
- Erklärung „keine Rendite“
- Weitere anzeigen
- Sheet (Tipp auf Stil): Stile in einem Satz + Hinweis auf fehlende Short-Positionen

**Bausteine**
- C07 Kursbewegung
- C09 Erklärung
- C14 Reiter
- C16 Sheet
- C20 Suche
- Hedgefonds-Muster: Investor-Zeile mit Avatar

**Daten**
- hedgefonds/data/hedgefonds.json → funds[] (category „Investoren“, manager, name, style, totalValueUSD, aumChangePct, history)
- Top-3-Positionen je Investor bleiben in der Fondsseite (H05)

**Entfällt / ändert sich**
- Große Karten mit Top-3, „neu/verkauft“-Zählern und Pastell-Hintergründen → Zeile; Top-Positionen auf H05
- Dropdown „Größtes Portfolio“ → Sortier-Taste
- Grüne Pfeile → C07

### H03 · Hedgefonds · Datenbank

- Adresse heute: `/hedgefonds/#/datenbank` → neu: `/hedgefonds/#/investoren/alle`
- Aufnahme heute: `now/H03.jpg`
- Mockups neu: Investoren, Reiter „Alle Fonds“ (`h03-a`); Filter-Sheet (`h03-b`)
- Warum: Die Datenbank ist heute ein eigener Leisten-Platz, sieht aber aus wie die Investoren-Liste. Neu: ein Reiter „Alle Fonds“ unter Investoren, der Leisten-Platz wird frei für Smart Money.

**Aufbau neu (oben nach unten)**
- Intro „Investoren“ (gleiche Seite wie H02)
- Reiter „Alle Fonds 788“ aktiv
- Suche (Fonds, Manager, Stadt), Chips Alle · Stars · DACH 64 · Institutionen 40
- Zeilen: Avatar (Stern bei Star), Manager oder Fonds, Firma oder Stadt, Depotwert
- Erklärung Stern
- Weitere 50 anzeigen; Akkordeon „Weitere Institutionen (40)“
- Filter-Sheet: Sortieren, Region, Schalter, Button mit Trefferzahl

**Bausteine**
- C14 Reiter
- C15 Schalter
- C16 Sheet
- C20 Suche
- Hedgefonds-Muster: Investor-Zeile mit Avatar

**Daten**
- hedgefonds/data/hedgefonds.json → funds[] (category, region, city, totalValueUSD)
- hedgefonds/data/universe.json (788 Fonds, 40 Institutionen)

**Entfällt / ändert sich**
- Leisten-Platz „Datenbank“ → Reiter unter „Investoren“; die Leiste bekommt „Smart Money“
- Bunte Initialen-Kreise → schwarze Avatare
- Dropdown „Größte Fonds“ → Filter-Sheet

### H04 · Hedgefonds · Aktien

- Adresse heute: `/hedgefonds/#/aktien`
- Aufnahme heute: `now/H04.jpg`
- Mockups neu: Aktien, ganze Seite (`h04-a`)
- Warum: Heute 11.800 px: 30 Aktien, dann 20 Käufe und Verkäufe mit Mini-Avataren und „▸ 75 Fonds anzeigen“. Neu: Top 10 mit Balken, Käufe und Verkäufe als Reiter, jede Aktie öffnet die eine Aktienseite.

**Aufbau neu (oben nach unten)**
- Intro + Suche
- Meistgehalten: Reiter Alle Fonds / Stars, Top 10 mit Rang, Logo, Balken, Zahl der Fonds und Stars, Link „Alle 4.840“
- Erklärung Zählweise
- Käufe und Verkäufe: Reiter, Top 5 als Fluss-Zeilen
- Erklärung „beide Listen“
- Mehr: Insider-Käufe, Fonds-Einstiege (→ Smart Money)
- Tipp auf Aktie → Aktienseite Perspektive „Investoren“ (H07)

**Bausteine**
- C09 Erklärung
- C12 Navigationskarte
- C14 Reiter
- C20 Suche
- Hedgefonds-Muster: Fluss-Zeile

**Daten**
- hedgefonds/data/stocks/index.json (fields: cusip, ticker, name, fundCount, starCount, valueUSD; 4.840 Zeilen)
- hedgefonds/data/hedgefonds.json → aggregatesAll.buys / sells

**Entfällt / ändert sich**
- Plätze 11–30 → „Alle 4.840“
- Mini-Avatare „+11“ und „▸ Fonds anzeigen“ → auf der Aktienseite
- Rot/Grün → Schwarz/Neongrün
- Chips „Insider-Käufe“, „Fonds-Einstiege“ oben → Smart Money in der Leiste

### H05 · Hedgefonds · Fonds Pershing Square

- Adresse heute: `/hedgefonds/#/fonds/pershing-square`
- Aufnahme heute: `now/H05.jpg`
- Mockups neu: Fondsseite, ganze Seite (`h05-a`); Reiter „Käufe“ und „Verkäufe“ (`h05-b`)
- Warum: Steht für alle Fondsseiten. Heute: gelbe Warnbox, bunte Icon-Kacheln, Torte in sieben Farben, blaue Balken. Neu: ehrlicher Meldestand als Urteil, Verlauf mit bars(), Positionen als Anteils-Balken, Käufe und Verkäufe als Reiter.

**Aufbau neu (oben nach unten)**
- Zurück zu Investoren
- Kopf: Foto oder Initialen, Stil · Rolle, Name, Fonds, ein Satz
- Meldestand-Karte (C08 „Stand Q1 2026“), wenn das aktuelle Quartal fehlt
- 2 Kacheln: Depotwert + Veränderung, Positionen + Top-5-Anteil
- Depotwert im Verlauf: 8 Quartale als C17 Balken
- Reiter Positionen / Käufe / Verkäufe
- Positionen: Kürzel, Name, Anteil, Veränderung, Anteils-Balken
- Erklärung Anteil; Akkordeons SEC-Meldung, Foto-Lizenz
- Reiter Käufe/Verkäufe: neu, aufgestockt, verkleinert, komplett verkauft (Hilton)

**Bausteine**
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C14 Reiter
- C17 Balken
- Hedgefonds-Muster: Anteils-Zeile

**Daten**
- hedgefonds/data/funds/pershing-square.json (manager, role, style, bio, reportDate, totalValueUSD, aumChangePct, history[8], holdings[11], tradeCounts, trades.new/added/reduced/sold)
- Foto: hedgefonds/data/hedgefonds.json → funds[].photo (Lizenz CC BY 2.0)

**Entfällt / ändert sich**
- Torte in 7 Farben → Anteils-Balken je Position (gleiche Information, eine Farbe)
- Blaue Quartals-Balken → C17
- Gelbe Warnbox → Meldestand-Karte
- Bunte Icon-Kacheln (Koffer, Pfeil, Ebenen, Kalender) → 2 Kacheln
- Button „13F bei der SEC“ → Akkordeon unten

### H06 · Hedgefonds · Smart Money

- Adresse heute: `/hedgefonds/#/smart-money`
- Aufnahme heute: `now/H06.jpg`
- Mockups neu: Insider-Käufe, ganze Seite (`h06-a`); Sheet „Wer ist ein Insider?“ (`h06-b`)
- Warum: Heute bunte Icon-Kacheln, ein langer Erklärtext in einer grünen Box und 45 Zeilen. Neu: der Grund in zwei Sätzen, Gruppen-Käufe und Netto-Käufe als Fluss-Zeilen, eigener Platz in der Leiste.

**Aufbau neu (oben nach unten)**
- Intro „Smart Money“
- Reiter Insider-Käufe / Fonds-Einstiege
- Neongrüne Karte „Warum das zählt“
- 3 Kacheln: Gruppen-Käufe 50 · größter Kauf RSG · Stand 27.10.
- Erklärung Form 4 (fast aktuell, im Gegensatz zu 13F)
- Gruppen-Käufe 30 Tage: Top 6 Fluss-Zeilen (Zahl der Insider, netto)
- Größte Netto-Käufe 90 Tage: Top 5
- Sheet: Wer ist ein Insider, was gezählt wird

**Bausteine**
- C02 Leiste: Platz „Smart Money“ aktiv
- C09 Erklärung
- C11 Kachel
- C14 Reiter
- C16 Sheet
- Hedgefonds-Muster: Fluss-Zeile

**Daten**
- hedgefonds/data (Insider-Datei des Smart-Money-Laufs, Form 4, Stand 27.10.2026; Felder: Cluster je Emittent mit Zahl der Insider, netto USD; Netto-Käufe 90 Tage mit Käuferzahl)
- Fonds-Einstiege: hedgefonds/data/hedgefonds.json → aggregatesAll.buys (status „new“)

**Entfällt / ändert sich**
- Orange/Grün/Blau Icon-Kacheln → C11
- Langer Text in der grünen Box → zwei Sätze + Sheet
- Plätze 7–15 je Liste → „Alle anzeigen“
- Heute nur über Kacheln erreichbar → eigener Platz in der Leiste

### H07 · Hedgefonds · NVIDIA (Perspektive Investoren)

- Adresse heute: `/hedgefonds/#/aktie/67066G104` → neu: `Aktienseite, Perspektive „Investoren“`
- Aufnahme heute: `now/H07.jpg`
- Mockups neu: Aktie NVIDIA, Perspektive „Investoren“, Hedgefonds-Leiste unten (`h07-a`)
- Warum: Heute eigener Kopf ohne Kurs, Adresse über CUSIP, rote und grüne Zahlen. Neu: gemeinsamer Aktienkopf, eine Antwort (413 Fonds, ausgeglichen), Stars mit Gewicht, Insider und alle Melder darunter.

**Aufbau neu (oben nach unten)**
- C04 Aktienkopf (204,64 $, Perspektive „Investoren“ aktiv)
- Schwarze Antwort-Karte: 413 Fonds, 34 Stars, 276,4 Mrd. $, Urteil, Käufer/Verkäufer-Balken 193 : 200, neu 22 / raus 28
- Erklärung „Ausgeglichen“
- Neongrüne Karte „Größte Überzeugung“
- Star-Investoren mit NVIDIA: Top 6 nach Wert, mit Anteil und Veränderung; Link „Alle 34“, dahinter Reiter Alle 413 / Stars 34
- Komplett ausgestiegen (Stars)
- Insider 90 Tage: Käufer 0, Verkäufer 3, Netto; Leerer Zustand „Keine Käufe“
- Alle 13F-Melder als kv-Liste

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C02 Hedgefonds-Leiste bleibt (Platz „Aktien“)
- C07 Kursbewegung
- C08 Urteil (Käufer/Verkäufer: s ab deutlich mehr Käufern, m ausgeglichen, w deutlich mehr Verkäufer)
- C09 Erklärung
- C18 Leerer Zustand
- kv-Liste
- Hedgefonds-Muster: Käufer/Verkäufer-Balken

**Daten**
- hedgefonds/data/stocks/5.json → "67066G104" (fundCount 413, starCount 34, valueUSD, buyers 193, sellersCount 200, holders[] mit w/v/st/d, sellers[])
- hedgefonds/data/hedgefonds.json → funds[] (Zuordnung slug → Manager für Stars)
- Insider und alle 13F-Melder: Smart-Money-Daten, Stand 27.10.2026
- Adresse: Aktienseite per Ticker, CUSIP-Zuordnung über hedgefonds/data/cusip-map.json und core/identity.js

**Entfällt / ändert sich**
- Eigener Kopf ohne Kurs + 9er-Icon-Leiste → C04 + C05
- Grün/Rot für Käufer/Verkäufer → Neongrün/Weiß im schwarzen Feld
- Liste der 413 Fonds nach Gewicht zuerst → Stars zuerst, volle Liste über „Alle“
- Adresse mit CUSIP → Aktienseite mit Ticker


## 09 · Screener

Einsteiger sagen in einem Satz, was sie suchen. Profis bauen Regeln. Beide sehen sofort, wie viele von 5.616 Aktien übrig bleiben.

### S01 · Screener · Übersicht

- Adresse heute: `/screener/`
- Aufnahme heute: `now/S01.jpg`
- Mockups neu: Einfach: Satz, fertige Ideen, Perspektiven (`s01-a`); Profi: Suche, Regeln, alle 117 Kriterien (`s01-b`)
- Warum: Heute: Kacheln nach Fachgruppen und ein Formular. Neu: ein Satz für Einsteiger, fertige Ideen mit echter Trefferzahl und Kriterien nach denselben Perspektiven wie die Aktienseite.

**Aufbau neu (oben nach unten)**
- Kopf: Titel + ein Satz, Umschalter Einfach / Profi
- Satz-Bauer (schwarze Karte): „Zeig mir Aktien, die … und …“ mit neongrünen Lücken, Knopf „N Treffer zeigen“ mit Live-Zählung
- Fertige Ideen: 4 Karten mit echter Trefferzahl (Wachsen stark 1.005, Verdienen Geld 2.144, Aufwärtstrend 1.939, Wachsen und verdienen 182)
- Kriterien nach Perspektive: Basis, Zahlen, Faktoren, Chart, Methoden (PRO), Investoren (PRO) mit Anzahl
- Universum-Kachel 5.616 + Erklärung
- Deine Screens (Leerzustand) und Brücke zu Quant-Backtests
- Profi: Kriteriensuche, aktive Regeln als Chips, Trefferzahl groß, gesperrte Kriterien ehrlich mit „Keine Aussage“

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Screener · Filter · Treffer · Gespeichert · Menü)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C12 Navigationskarte
- C14 Reiter
- C18 Leerer Zustand
- C19 PRO-Marke
- C20 Suche
- Screener-Muster: Satz-Bauer
- Screener-Muster: Perspektiven-Gruppen

**Daten**
- screener/data/universe-US_REAL.json (count 5.616, cols revGrowth, netMargin, distSma200, pe)
- screener/engine/fields.js (GROUPS, 117 Kriterien, available:false = gesperrt)
- Ideen-Zählungen live aus der Engine (query.js), nie hart kodiert

**Entfällt / ändert sich**
- Großes Trichter-Bild und Hero-Icon
- Gruppen-Kacheln „Unternehmen · Größe & Markt · …“ werden sechs Perspektiven; die alten Gruppen bleiben als Unterüberschriften in „Zahlen“ und „Chart“
- „Watchlist“ verlässt die Leiste: liegt unter Gespeichert und im Menü (Mein Bereich)
- Modus-Umschalter wandert von unten nach oben

### S02 · Screener · Filter hinzufügen

- Adresse heute: `/screener/?view=build`
- Aufnahme heute: `now/S02.jpg`
- Mockups neu: Einfach: Eigenschaften ankreuzen, Live-Zählung (`s02-a`); Profi: Regeln als Trichter, Kriterien nach Perspektive (`s02-b`); Sheet: ein Kriterium mit Verteilung (`s02-c`)
- Warum: Heute: ein leeres Feld, Kacheln mit Fachgruppen, drei Vorschläge. Neu: Einsteiger kreuzen Eigenschaften in Alltagssprache an und sehen vorher, wie viele Treffer bleiben. Profis sehen ihre Regeln als Trichter.

**Aufbau neu (oben nach unten)**
- Einfach: Satz oben (sticky), Trefferzahl groß mit Anteilsbalken
- 6 Eigenschaften in Alltagssprache mit Zielzahl („→ 80“ = Treffer, wenn hinzugefügt): stark wachsen, gut verdienen, günstig, Aufwärtstrend, mehr Geld als Schulden, ruhig
- Erklärungen zu Gewinnmarge, KGV, Pfeilzahl
- Perspektiven als Einstieg in alle Kriterien
- Knöpfe: „182 Treffer zeigen“, „Screen speichern“
- Profi: Trichter (alle → Regel 1 → Regel 2 …) mit echter Zählung je Stufe, Reiter der Perspektiven, Kriterienliste mit „aktiv“ / „+“
- Sheet je Kriterium: Erklärung, Schwellen-Reiter, Verteilung als Balken (C17), Zahl passend / ohne Angabe

**Bausteine**
- C09 Erklärung
- C14 Reiter
- C16 Sheet
- C17 Balken (Verteilung)
- Screener-Muster: Satz-Bauer
- Screener-Muster: Eigenschaft mit Zielzahl
- Screener-Muster: Trichter

**Daten**
- screener/data/universe-US_REAL.json: revGrowth > 0,2 → 1.005; netMargin > 0 → 2.144; > 0,15 → 689; beides → 182; + distSma200 > 0 → 71; + 0  0 → 20; + vol252 < 0,25 → 10
- Verteilung netMargin: 921 / 611 / 496 / 348 / 224 / 245 / 220, ohne Angabe 2.551
- screener/engine/query.js (Zählung je Stufe)

**Entfällt / ändert sich**
- Leeres Gestrichel-Feld „Noch keine Filter“
- Gruppen-Kacheln als erster Schritt (jetzt Perspektiven unten bzw. Reiter)
- „Link teilen“ und „Strategien & Backtests“ wandern in das Menü der Trefferliste (S03)
- Vorschläge bleiben, jetzt als Eigenschaften mit Zielzahl

### S03 · Screener · Treffer

- Adresse heute: `/screener/?view=results`
- Aufnahme heute: `now/S03.jpg`
- Mockups neu: Trefferliste: Satz, Chips, Zeilen (`s03-a`); Aktie öffnen: Perspektive „Zahlen“, Screener-Leiste bleibt (`s03-b`); Leerzustand: welche Regel lockern (`s03-c`)
- Warum: Heute: 5.616 große Karten mit rot-grünen Zahlen, ohne Bezug zu den Filtern. Neu: Treffer als Aktienzeile mit dem einen Mini-Chart, die Kennzahlen deiner Filter markiert, „Warum passt sie?“ und ein ehrlicher Leerzustand.

**Aufbau neu (oben nach unten)**
- Kopf (schwarz): Satz + Trefferzahl
- Aktive Filter als neongrüne Chips (× entfernt), „+ Filter“
- Sortierung (Börsenwert, Wachstum, Marge, Kurs 6 M.)
- „Warum passt …?“ für den ersten Treffer, je Regel ein Urteil
- Trefferzeilen: Aktienzeile (Logo, Name, Mini-Chart 1 J., Kurs, Tagesbewegung) + Leiste mit 4 Kennzahlen, die Filterkennzahlen neongrün
- Weitere laden, Speichern, Teilen, in Quant testen
- Aktie öffnen: eine Aktienseite, Perspektive passend zur meistgenutzten Filtergruppe (hier „Zahlen“), Karte „Aus deinem Screen“, Vor/Zurück durch die Treffer
- Leerzustand: 0 Treffer + je Regel „ohne diese Regel: N Treffer“

**Bausteine**
- C04 Aktienkopf
- C05 Perspektiven-Leiste
- C07 Kursbewegung
- C08 Urteil
- C10 Aktienzeile
- C17 Balken
- C18 Leerer Zustand
- Screener-Muster: Trefferzeile mit Filterkennzahlen
- Screener-Muster: Warum passt sie?
- Screener-Muster: Regel lockern

**Daten**
- screener/data/universe-US_REAL.json: s, revGrowth, netMargin, pe, mcap, perf6m
- Mini-Chart: discover/data/stocks (Tagesschluss, 1 Jahr)
- Leerzustand (6 Regeln): ohne vol252 → 2, ohne pe  0 → 1

**Entfällt / ändert sich**
- Große Karten mit 4 Kennzahlen ohne Filterbezug
- Rot/Grün für Kurse (Plus neongrün, Minus schwarz)
- Ungefilterte Liste aller 5.616 Aktien als Startzustand (ohne Filter führt „Treffer“ zum Satz-Bauer)
- Lesezeichen je Karte → Herz im Aktienkopf

### S04 · Screener · Gespeichert

- Adresse heute: `/screener/?view=saved`
- Aufnahme heute: `now/S04.jpg`
- Mockups neu: Mit Screens: Zahl, Veränderung, Benachrichtigen (`s04-a`); Leerzustand mit fertigen Ideen (`s04-b`)
- Warum: Heute nur ein Leerzustand. Neu: gespeicherte Screens als Karten mit Trefferzahl, Veränderung seit dem letzten Datenlauf und Benachrichtigung.

**Aufbau neu (oben nach unten)**
- Titel, Reiter Screens / Watchlist
- Karte je Screen: Name, Regeln als Text, Trefferzahl, Veränderung seit letztem Datenlauf (+neu / −raus), Schalter Benachrichtigen
- Liste „Neu in …“ als Aktienzeilen
- Zuletzt verwendet
- Leerzustand: Erklärung, Knopf „Ersten Screen bauen“, 2 fertige Ideen

**Bausteine**
- C08 Urteil
- C09 Erklärung
- C10 Aktienzeile
- C12 Navigationskarte
- C14 Reiter
- C15 Schalter
- C18 Leerer Zustand
- C19 PRO-Marke
- Screener-Muster: Screen-Karte mit Veränderung

**Daten**
- Konto: gespeicherte Abfragen (screener/engine/store.js, mit Konto: workers/vu-account)
- Veränderung: Vergleich der Treffermengen zweier Datenläufe (universe asOf)
- Veränderungszahlen und „neu“-Liste im Mockup sind Beispiel

**Entfällt / ändert sich**
- „Zuletzt verwendet“ als eigener leerer Block ohne Inhalt
- Großer Leerzustand ohne Vorschlag

### S05 · Screener · Watchlist

- Adresse heute: `/screener/?view=watchlist` → neu: `/screener/?view=saved&tab=watchlist`
- Aufnahme heute: `now/S05.jpg`
- Mockups neu: Watchlist mit „passt zu Screen“ (`s05-a`); Leerzustand mit Vorschlägen (`s05-b`)
- Warum: Heute ein eigener Platz in der Leiste, meist leer. Neu: Reiter unter „Gespeichert“, dieselbe Watchlist wie überall, mit Bezug zu deinen Screens.

**Aufbau neu (oben nach unten)**
- Gespeichert, Reiter „Watchlist“ aktiv
- Hinweis: eine Liste für alle Welten
- Aktienzeilen, Untertitel „in N Screens“ bzw. „in keinem Screen“ (Tippen zeigt welche)
- Knöpfe: Als Screen filtern (Watchlist als Universum), Bearbeiten
- Leerzustand: Herz erklären, Treffer aus letztem Screen anbieten

**Bausteine**
- C09 Erklärung
- C10 Aktienzeile
- C14 Reiter
- C18 Leerer Zustand

**Daten**
- Watchlist aus dem Konto (docs/accounts/WATCHLIST.md), lokal als Rückfall
- Abgleich mit gespeicherten Screens über screener/engine

**Entfällt / ändert sich**
- Eigener Platz „Watchlist“ in der Produkt-Leiste (jetzt Reiter in „Gespeichert“ und im Menü unter Mein Bereich)


## 10 · Vorsorge

Vom ersten 10-Euro-Sparplan bis zum durchleuchteten Portfolio. Ein geführter Weg für Einsteiger, Rechner und X-Ray auf Abruf, jede Beispielrechnung klar markiert.

### V01 · Vorsorge · Start

- Adresse heute: `/vorsorge/#/`
- Aufnahme heute: `now/V01.jpg`
- Mockups neu: Start, ganze Seite (`v01-a`); Erster Besuch: Womit fängst du an? (`v01-b`)
- Warum: Heute: Rechner-Zahlen, ETF-Liste und Linklisten untereinander. Neu: ein klarer Einstieg „Starte mit 10 €“, drei Wege nach Lage, eine markierte Beispielrechnung, Förderung in drei Zahlen und Kern-ETFs mit dem einen Chart.

**Aufbau neu (oben nach unten)**
- Kopf: „Was wird aus deiner Rente?“ + ein Satz
- Neongrüne Karte „Starte mit 10 € im Monat“ → geführter Ablauf V10
- Drei Wege: Ich fange an (V10) · Ich plane (V02) · Ich habe schon ETFs (V05)
- Beispielrechnung (Marke BEISPIELRECHNUNG): 127 Tsd. € in heutiger Kaufkraft, drei Szenarien als Balken, Erklärung Kaufkraft
- Förderung 2027: Grundzulage bis 540 €, Kind bis 300 €, Einsteigerbonus 200 €
- Kern-ETFs als ETF-Zeilen mit Mini-Chart und 1-Jahres-Bewegung
- Was hat sich geändert (3 Zeilen) → V08
- Mehr: Vergleichen, Förderung, Veränderungen, Wissen
- Erster Besuch: Sheet mit 4 Lagen, steuert die Startseite (Einsteiger sieht V10 zuerst, Profi die ETF-Liste)

**Bausteine**
- C01 Kopfzeile
- C02 Produkt-Leiste (Vorsorge · Planer · ETFs · Portfolio · Menü)
- C06 Chart (mini)
- C07 Kursbewegung
- C09 Erklärung
- C11 Kachel
- C12 Navigationskarte
- C16 Sheet
- C19 PRO-Marke
- Vorsorge-Muster: Beispiel-Marke
- Vorsorge-Muster: ETF-Zeile
- Vorsorge-Muster: Szenario-Balken

**Daten**
- vorsorge/data/etf-index-home.json (symbols URTH SPY EEM QQQ FEZ IWM; p1Y, ter, vol)
- vorsorge/data/series/.json (price.daily, Mini-Chart 1 Jahr)
- vorsorge/data/funding-rules/2027-DE.json (maximumFunding: 540 / 300 / 200, minimumAnnualOwnContribution 120)
- vorsorge/data/changes.json bzw. holdings/.json timeline
- Beispielrechnung: Planer-Formel (V02) mit Standardannahmen

**Entfällt / ändert sich**
- Hero-Bild mit Pflanze
- Doppelte Knöpfe „Altersvorsorge berechnen“ / „Eigenen Plan erstellen“ → ein Hauptweg + drei Wege
- „Was am meisten bewirkt“ wandert in den Planer (V02)
- Lange Linklisten (Berechnen, Fördern, ETFs) → Produkt-Leiste und 4 Kacheln
- Rote und grüne Kostenbalken

### V02 · Vorsorge · Planer

- Adresse heute: `/vorsorge/#/plan`
- Aufnahme heute: `now/V02.jpg`
- Mockups neu: Planer: Regler, Ergebnis, Chart (`v02-a`); Sheet: Annahmen offen gelegt (`v02-b`); Profi: alle Kennzahlen, Formel (`v02-c`)
- Warum: Heute: Eingabefelder ganz unten in einem schwarzen Kasten, Ergebnis mit Fachbegriffen, Chart in drei Farben. Neu: Regler oben, ein klares Ergebnis („52 % deines Ziels“) mit Urteil, der eine Chart mit Szenarien als gestrichelte Linien.

**Aufbau neu (oben nach unten)**
- Titel + ein Satz
- 5 Regler: Alter, Rente ab, Sparrate, schon gespart, Wunsch im Alter; Zeile „Rente und andere Einkünfte“
- Ergebnis (schwarz): Marke BEISPIELRECHNUNG, Urteil (Auf Kurs / Knapp / Nicht auf Kurs), Zielerreichung groß, Lücke, Vermögen
- Chart: Vermögenspfad 5 % als Linie, 3 % und 7 % gestrichelt (C06 lines), Achse Alter
- Drei Kacheln je Szenario
- Was am meisten bewirkt (Stellschrauben, Zielerreichung in %-Punkten)
- Kosten über die Laufzeit (0,2 % vs. 1,5 %)
- Plan speichern, Annahmen (Sheet)
- Profi: Tabelle nominal / Kaufkraft / Ziel / nötige Sparrate, Formel, ehrliche „Keine Aussage“ zu Wahrscheinlichkeiten

**Bausteine**
- C06 Chart (mit lines)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C16 Sheet
- Vorsorge-Muster: Regler
- Vorsorge-Muster: Beispiel-Marke
- Vorsorge-Muster: Stellschrauben

**Daten**
- Planer-Engine der heutigen Seite (vorsorge/, Szenarien 3/5/7 %, Kosten 0,30 %, Inflation 2 %, Auszahldauer 25 J.)
- Werte im Mockup = heutige Standardannahmen: 86 / 127 / 191 Tsd. €, 52 %, Lücke 524 €
- Gespeicherter Plan: Konto (heute nur Browser)

**Entfällt / ändert sich**
- Schwarzer Eingabekasten am Seitenende → Regler oben
- Drei Farben im Chart (blau, orange, grün) → eine Linie + gestrichelte Szenarien
- Reiter „Geführter Rechner / Planer / Vorsorgelücke / Kosten / Szenarien“ → eine Seite, Lücke und Kosten als Abschnitte
- Rote Ampel „Nicht auf Kurs“ → Urteil (C08)
- „Wird nur in diesem Browser gespeichert“ → im Konto

### V03 · Vorsorge · ETFs

- Adresse heute: `/vorsorge/#/etfs`
- Aufnahme heute: `now/V03.jpg`
- Mockups neu: Einfach: breit und günstig zuerst (`v03-a`); Sheet: Filter in Alltagssprache (`v03-b`); Themen: stärkste 12 Monate mit Warnung (`v03-c`)
- Warum: Heute sortiert die Liste nach Rendite 1 Jahr: oben stehen Korea- und Chip-ETFs mit +130 %. Für Einsteiger ist das der falsche erste Eindruck. Neu: „Einfach“ zeigt zuerst breite, günstige ETFs; Themen liegen in einem eigenen Reiter mit klarer Warnung.

**Aufbau neu (oben nach unten)**
- Titel, Suche (Ticker, ISIN, Index, Thema)
- Zahl 4.007 + „2.065 komplexe ausgeblendet“
- Reiter Einfach / Alle / Themen
- Einfach: Urteil „Für den Anfang: breit, günstig, lange Historie“, Abschnitte „Breit und günstig“ und „Bausteine dazu“ als ETF-Zeilen
- ETF-Welten als Balken mit Anzahl (tippen = filtern)
- Hinweis UCITS: US-Listings als Marktabbild, in der EU UCITS-Version suchen
- Filter-Sheet: Region, Kosten höchstens, 10 J. Historie, nur mit Beständen, Hebel/Short aus
- Themen: Warnung (Urteil Schwach „Hohes Auf und Ab“), Liste nach 1 Jahr mit Kosten und Schwankung

**Bausteine**
- C06 Chart (mini)
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C14 Reiter
- C15 Schalter
- C16 Sheet
- C20 Suche
- Vorsorge-Muster: ETF-Zeile

**Daten**
- vorsorge/data/etf-index.json + etf-index-extra.json (counts.publicAnalysis 4.007, complex 2.065)
- vorsorge/data/etf-index-home.json (Kern-ETFs)
- Themen-Werte aus der heutigen Liste (p1Y, ter, vol)
- vorsorge/data/eu/etf-eu-index.json für den UCITS-Hinweis

**Entfällt / ändert sich**
- Standard-Sortierung „Rendite 1 Jahr“ für alle → nur im Reiter Themen
- Länderreiter „USA · Kurse, Holdings, Kosten / Europa · UCITS“ → Hinweis + Filter
- Grüne Prozentzahlen → Kursbewegung (C07)
- „Weitere 25 von 3.982 anzeigen“ bleibt als Endlos-Liste

### V04 · Vorsorge · ETF-Detail

- Adresse heute: `/vorsorge/#/etf/URTH`
- Aufnahme heute: `now/V04.jpg`
- Mockups neu: Überblick, ganze Seite (`v04-a`); Bestände (Profi, dunkel) (`v04-b`); Sheet: Planspiel, klar als Beispiel (`v04-c`)
- Warum: Heute: zehn Bereiche mit Fachbegriffen, blaue Balken, drei Chart-Farben. Neu: ein Satz, was drin ist, der eine Chart, vier Zahlen mit Erklärung, Einordnung mit Urteilen und der konkrete Hinweis, wonach man bei der Bank sucht.

**Aufbau neu (oben nach unten)**
- ETF-Kopf (wie Aktienkopf C04): Zurück, Logo, Name, Kategorie, Merken; Kurs, Bewegung, Schluss-Datum, Börse
- Reiter Überblick / Bestände / Risiko / Kosten
- „In einem Satz“ (neongrün) aus holdings.summary
- Chart 1 Jahr + Zeitleiste
- 4 Kacheln: pro Jahr seit Start, Schwankung, Kosten, Firmen + Erklärungen
- Einordnung: 6 Zeilen mit Urteil Passt / Hinweis (ersetzt „3 passt · 0 Achtung · 4 Hinweise“)
- Größte Firmen als Gewichtsbalken, Länder als Balken
- „Bei deiner Bank“: UCITS auf denselben Index + ISIN-Beispiele aus ESMA, ausdrücklich keine Empfehlung
- Planspiel (Sheet): Sparrate, Laufzeit, Ergebnis mit Marke BEISPIELRECHNUNG, „In meinen Plan übernehmen“
- Bestände (Profi): Konzentration, effektive Anzahl, Top 10, Änderungen seit letztem Bericht

**Bausteine**
- C04 Aktienkopf (ETF-Variante)
- C06 Chart
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C14 Reiter
- C16 Sheet
- Vorsorge-Muster: Gewichtsbalken
- Vorsorge-Muster: Bei deiner Bank

**Daten**
- vorsorge/data/etf/URTH.json (costs.value 0,0024, holdings.positions 1.320, top10 0,2476)
- vorsorge/data/series/URTH.json (price.daily → Chart)
- vorsorge/data/holdings/S000035395.json (holdings, exposures.countries, concentration.effectiveNumber 107,5, timeline)
- vorsorge/data/eu/etf-eu-index.json (ISIN, Anbieter, Ausschüttung der MSCI-World-UCITS)
- Planspiel-Werte aus der heutigen Seite (Szenario wie bisher 12,2 % p. a.)

**Entfällt / ändert sich**
- ETF-DNA mit 8 blauen Balken → Einordnung mit Urteilen; DNA-Werte als „Mehr“ unter Risiko
- Drei Chartfarben im Planspiel → Zahlen im Sheet
- Knöpfe „Beobachten / Planspiel / Vergleichen / Zum Portfolio“ → Herz im Kopf + 2 Knöpfe unten
- Originalbeschreibung des Anbieters (englisch) → hinter „Mehr“

### V05 · Vorsorge · Portfolio

- Adresse heute: `/vorsorge/#/portfolio`
- Aufnahme heute: `now/V05.jpg`
- Mockups neu: X-Ray, ganze Seite (`v05-a`); Beispiel-Mischungen (Strategiemodelle) (`v05-b`)
- Warum: Heute: sehr lange Seite mit blauem Chart, bunten Länder- und Sektorbalken und roten Zahlen. Neu: oben deine ETFs, der eine Chart, drei Zahlen, ein Satz „Was du wirklich besitzt“, danach Firmen und Länder; Beispiel-Mischungen auf eigener Seite.

**Aufbau neu (oben nach unten)**
- Titel, Liste deiner ETFs mit Gewicht, „ETF hinzufügen“
- Chart seit 2012 (Start = 100) + 3 Kacheln: pro Jahr, Schwankung, größter Rückgang
- „Was du wirklich besitzt“ (schwarz, ein Satz)
- Größte Firmen effektiv (Gewichtsbalken), Länder effektiv
- Auf einen Blick: Kosten, Gleichlauf, Überschneidung, Währung mit Urteil
- Beispiel-Mischungen: Karte je Modell, eigenes Portfolio markiert, Kennzahlen 10 J. / Schwankung / Kosten, Hinweis bei fehlender Historie
- Profi (unter „Mehr“): Sektoren, Handelswährung, Bestandsänderungen je ETF, Szenario-Lab

**Bausteine**
- C06 Chart
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- Vorsorge-Muster: Gewichtsbalken
- Vorsorge-Muster: Mischungs-Karte

**Daten**
- vorsorge/data/series/URTH.json + EEM.json (price.weekly, wöchentlich neu gewichtet 88/12 → +9,4 % p. a.)
- vorsorge/data/holdings/.json (effektive Firmen und Länder)
- vorsorge/data/model-portfolios.json (one-etf, global-core, core-em, core-small, core-bonds, quality-tilt, factor)
- Werte Gleichlauf, Überschneidung, effektive Gewichte aus der heutigen Seite

**Entfällt / ändert sich**
- Blauer Flächenchart → der eine Chart
- Bunte Länder- und Sektorbalken, Kreisdiagramme der Modelle → Gewichtsbalken
- Rote Änderungswerte („−0,84 PP“) → Urteil gesunken / gestiegen
- „Wirtschaftszweige: 42 % nicht zugeordnet“ → unter Profi mit Hinweis zur Abdeckung
- Knöpfe „Übernehmen / Planspiel“ je Modell → Karte antippen

### V06 · Vorsorge · Vergleichen

- Adresse heute: `/vorsorge/#/vergleichen`
- Aufnahme heute: `now/V06.jpg`
- Mockups neu: ETF-Vergleich URTH und SPY (`v06-a`); Kosten über die Laufzeit (`v06-b`)
- Warum: Heute nur eine Liste mit vier Links. Neu: Der Vergleich ist sofort da, zwei ETFs im einen Chart, eine ehrliche Tabelle; die Kostenwirkung als eigener Screen mit Beispielrechnung.

**Aufbau neu (oben nach unten)**
- Titel + Satz „ohne Gewinner-Logik“
- Zwei (bis vier) ETF-Wähler als Karten
- Chart: beide auf Start = 100, erster als Linie, weitere gestrichelt
- Tabelle: 1 Jahr, Schwankung, größter Rückgang, Kosten, Firmen, Länder, Historie; fehlende Werte als „Keine Aussage“
- Erklärungen zu nicht vergleichbaren Zeiträumen und fehlenden Kosten
- Weitere Vergleiche: Kosten, Anbieter, Riester
- Kosten-Screen: Balken 0,2 % vs. 1,5 %, Kacheln, Unterschied neongrün, Marke BEISPIELRECHNUNG

**Bausteine**
- C06 Chart (lines)
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- C12 Navigationskarte
- Vorsorge-Muster: Vergleichstabelle

**Daten**
- vorsorge/data/series/URTH.json, SPY.json (price.daily, gleicher Zeitraum)
- vorsorge/data/etf-index-home.json (p1Y, vol, mdd, ter; SPY ter = null → k. A.)
- vorsorge/data/etf/SPY.json costs.status SOURCE_NOT_CONNECTED
- Kostenwerte 244 / 187 Tsd. € aus der heutigen Startseite

**Entfällt / ändert sich**
- Nummerierte Linkliste als ganze Seite
- Anbieter- und Riester-Analyse bleiben als Unterseiten

### V07 · Vorsorge · Förderung

- Adresse heute: `/vorsorge/#/foerderung`
- Aufnahme heute: `now/V07.jpg`
- Mockups neu: Förderrechner, ganze Seite (`v07-a`); Für wen lohnt es sich? (`v07-b`)
- Warum: Heute: Eingabekasten unten, Gesetzestext in einem grünen Block. Neu: zwei Regler oben, die Zulage groß, die Rechnung in vier Zeilen, Balken je Beitrag und der Satz „schon 10 € reichen“.

**Aufbau neu (oben nach unten)**
- Titel + Satz zum Start 1.1.2027
- Regler: Beitrag pro Jahr, Kinder; Schalter unter 25 / erster Vertrag
- Ergebnis (schwarz): Zulage pro Jahr groß + Förderquote
- So wird gerechnet: 50 % auf 360 €, 25 % bis 1.800 €, Kind 100 % bis 300 €, Bonus 200 €
- Balken: Zulage je Beitrag 120 / 360 / 600 / 1.200 / 1.800 €
- Modellrechnung nach 32 Jahren mit/ohne Zulagen (Marke)
- Gut zu wissen: Auszahlung ab 65, erlaubte Anlagen, Kostendeckel 1 %, Bestandsverträge
- Quelle mit Datum (neongrün)
- Zweiter Screen: vier Beispielfälle mit Zulage und Förderquote, Knopf „Mit 10 € starten“ → V10

**Bausteine**
- C09 Erklärung
- C11 Kachel
- C15 Schalter
- C17 Balken
- Vorsorge-Muster: Regler
- Vorsorge-Muster: Beispiel-Marke

**Daten**
- vorsorge/data/funding-rules/2027-DE.json (incomeRules.basicAllowance.tiers, childRules.perChild, bonusRules.careerStarter, contributionRules.minimumAnnualOwnContribution 120, productRules.standardDepotCostCap 0,01, payoutRules.earliestAge 65)
- Modellrechnung 111 / 84 Tsd. € aus der heutigen Seite
- Riester: funding-rules/2026-DE-riester.json, Frühstart: fruehstart-DE.json (Unterseiten bleiben)

**Entfällt / ändert sich**
- Fünf Knöpfe oben (Geführter Rechner, Förderrechner, Frühstart, Riester, Anbieter) → Regler + Unterseiten über „Mehr“
- Gesetzesblock als Fließtext → eine Quellenzeile, Details im Sheet
- Mittelbar Zulageberechtigte (§ 79 Satz 2) → Schalter unter „Mehr Angaben“

### V08 · Vorsorge · Veränderungen

- Adresse heute: `/vorsorge/#/monitor`
- Aufnahme heute: `now/V08.jpg`
- Mockups neu: Mit Plan: Kurs, Stellschraube, Änderungen (`v08-a`); Leerzustand ohne Plan (`v08-b`)
- Warum: Heute: Status-Kasten, lange Textzeilen mit Prospekt-Daten und rot-grünen Zahlen. Neu: oben das eine Urteil „auf Kurs?“, die stärkste Stellschraube, danach Änderungen in ETFs und Kosten als Zeilen mit Urteil.

**Aufbau neu (oben nach unten)**
- Titel + Satz
- Plan-Karte (schwarz): Urteil Auf Kurs / Knapp / Nicht auf Kurs, Zielerreichung
- Stärkste Stellschraube (neongrün) → Planer
- Dein Portfolio: Schwankung, größter Rückgang, 12 Monate, Währung
- In deinen ETFs: Bestandsänderungen je Zeile mit Urteil gestiegen/gesunken
- Kosten von Produkten: Prospekt-Änderungen mit Urteil teurer/günstiger
- Schalter Benachrichtigen
- Leerzustand: „Noch kein Plan“, Wege zu V10 und V02, Änderungen der Kern-ETFs

**Bausteine**
- C07 Kursbewegung
- C08 Urteil
- C09 Erklärung
- C15 Schalter
- C18 Leerer Zustand
- Vorsorge-Muster: Änderungszeile

**Daten**
- vorsorge/data/changes.json (Produkte und Kosten, Prospekt-Daten)
- vorsorge/data/holdings/.json (changes.events, timeline)
- Plan aus dem Konto; Plan-Werte im Mockup sind Beispiel

**Entfällt / ändert sich**
- Lange Prospekt-Zeilen mit Datumsangaben → kurze Zeile, Datum im Detail
- Rot/Grün → Urteil (C08)
- „Positionen URTH 88 % · EEM 12 %“ Tabelle → Portfolio (V05)

### V09 · Vorsorge · Wissen

- Adresse heute: `/vorsorge/#/wissen`
- Aufnahme heute: `now/V09.jpg`
- Mockups neu: Begriffe mit einem Satz (`v09-a`); Begriff offen mit Beispiel (`v09-b`)
- Warum: Heute: eine zugeklappte Liste mit Fachbegriffen. Neu: jeder Begriff gleich mit einem Satz sichtbar, Alltagswort zuerst, Fachwort danach; offen mit echtem Beispiel aus den Daten.

**Aufbau neu (oben nach unten)**
- Titel + Satz, Suche
- Lernpfad-Karte: „In 3 Minuten zum ersten Sparplan“ → V10
- Begriffsliste: Alltagswort, ein Satz sofort sichtbar, „+“ öffnet
- Sheet je Begriff: Satz groß, Beispiel mit echten Daten (Chart, Kacheln), Fachbegriff unten
- Mehr lernen: Academy, Datenquellen

**Bausteine**
- C06 Chart
- C09 Erklärung
- C11 Kachel
- C12 Navigationskarte
- C16 Sheet
- C20 Suche

**Daten**
- Begriffe der heutigen Seite (15, hier 13 sichtbar)
- Beispiel Schwankung: vorsorge/data/series/URTH.json (price.weekly), etf-index-home.json (vol, mdd)
- Dieselben Sätze speisen die „?“-Erklärungen (C09) in ganz Vorsorge

**Entfällt / ändert sich**
- Zugeklappte Liste ohne Vorschau
- Fachbegriff als Titel („Schwankung (Volatilität)“) → Alltagswort als Titel, Fachwort unten

### V10 · Vorsorge · Der 10-Euro-Sparplan (Ablauf)

Neue Seite ohne heutiges Gegenstück. Der wichtigste Einstieg für Einsteiger: sechs Schritte, ein Gedanke pro Bildschirm, ohne Produkt-Leiste, jede Zahl erklärt, jede Rechnung als Beispiel markiert.

(Übersichtsfolie, siehe Präsentation)

### V10 · Vorsorge · Der 10-Euro-Sparplan

- Adresse heute: `neu` → neu: `/vorsorge/#/start`
- Mockups neu: Schritt 1: Betrag (`v10-a`); Schritt 2: Beispielrechnung (`v10-b`); Schritt 4: MSCI World (`v10-d`); Schritt 6: Plan + Bank-Checkliste (`v10-f`)
- Warum: Erreichbar von der Vorsorge-Startseite, aus dem Wissen und aus dem Leerzustand von „Bin ich auf Kurs?“. Am Ende steht ein gespeicherter Plan und eine Checkliste für die eigene Bank.

**Aufbau neu (oben nach unten)**
- Vollbild-Ablauf ohne Produkt-Leiste, oben Schließen/Zurück + Fortschritt (6 Segmente)
- 1 Betrag: 10 € groß, Chips 10 / 25 / 50 / 100 / Eigener
- 2 Was daraus werden kann: Chart 30 Jahre (5 % Linie, 3 % und 7 % gestrichelt), Kacheln Eingezahlt 3.600 €, bei 5 %, Spanne; schwarzer Kasten „Keine Prognose“; Marke BEISPIEL
- 3 ETF in einem Satz: „Ein Korb mit vielen Firmen“, Punkte-Raster, drei Vorteile
- 4 Passender ETF: Index MSCI World mit Chart seit 2012, Kosten, Schwankung, tiefster Fall; Alternativen
- 5 Frei oder gefördert: freier Sparplan vs. Altersvorsorgedepot (+60 € Zulage, Auszahlung ab 65)
- 6 Plan steht: Zusammenfassung, 3 Schritte bei der eigenen Bank (Depot, UCITS-ETF auf MSCI World suchen, Sparplan anlegen), Hinweis ohne Provision
- Gespeicherter Plan erscheint in V08 „Bin ich auf Kurs?“ und im Planer

**Bausteine**
- C06 Chart (lines)
- C08 Urteil
- C09 Erklärung
- C11 Kachel
- Vorsorge-Muster: Ablauf-Kopf mit Fortschritt
- Vorsorge-Muster: Beispiel-Marke
- Vorsorge-Muster: Bank-Checkliste
- Punkte-Raster (.dots)

**Daten**
- Beispielrechnung: 120 € pro Jahr, Rendite 3 / 5 / 7 % vor Kosten, jährlich verzinst, 30 Jahre (≈ 5.800 / 8.200 / 11.700 €), Formel im Sheet offen legen
- vorsorge/data/funding-rules/2027-DE.json: Mindestbeitrag 120 €/Jahr, Grundzulage 50 % auf die ersten 360 € → 60 €, Auszahlung frühestens 65
- vorsorge/data/series/URTH.json (price.weekly) und etf-index-home.json (ter 0,24 %, vol, mdd) als Marktabbild des MSCI World
- vorsorge/data/eu/etf-eu-index.json: UCITS-Anteilklassen auf den MSCI World (ISIN) für den Bank-Schritt, ohne Empfehlung
- Plan im Konto (sonst lokal)

**Entfällt / ändert sich**
- Neu, ersetzt den „Geführten Rechner“ als ersten Einstieg; der Planer (V02) bleibt für alle, die schon sparen


## Ü · Übergabe an Claude Code

Reihenfolge, Routen, Abnahme. So wird aus der Präsentation die App.

### Ü1 · Reihenfolge der Umsetzung

Jeder Schritt ist ein eigener Pull Request. Die Isolations-Gates im Repository bleiben unverändert; Querschnittsänderungen werden nach Produkten aufgeteilt.

(Übersichtsfolie, siehe Präsentation)

### Ü2 · Alle Seiten mit Adresse

Generiert aus den Folien dieser Präsentation. Kennung, heutige Adresse, neue Adresse, Bausteine.

(Übersichtsfolie, siehe Präsentation)

### Ü3 · Abnahmekriterien

Eine Seite gilt als fertig, wenn alle Punkte erfüllt sind.

(Übersichtsfolie, siehe Präsentation)

### Ü4 · Auftrag an Claude Code

Diesen Text zusammen mit dem Link zur Präsentation übergeben.

(Übersichtsfolie, siehe Präsentation)


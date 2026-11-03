# Mobile App Phase 1: Capacitor-Prototyp, Messungen und Empfehlung

**Stand:** 03.11.2026 · Entscheidung: [ADR-007](../architecture/ADR-007-capacitor-prototype.md) · Code: [`app/`](../../app/README.md)
**Grenze dieses Berichts:** Alles wurde auf Linux in **Chromium** gemessen, nicht in WKWebView und nicht auf einem iPhone. Der iOS-Build wurde **nicht** ausgeführt. Aussagen zu Gesten, Speicher und Ladezeit auf dem Gerät sind **noch nicht verifiziert**.

Kennzeichnung: **[ok]** gemessen oder getestet · **[offen]** nicht verifiziert · **[fehlt]** nicht vorhanden.

## 1. Was gebaut wurde

| Teil | Status |
|---|---|
| ADR-007 (Prototyp, ADR-004 bleibt) | [ok] |
| Eigenständiges Verzeichnis `app/` (eigene `package.json`, eigene Tests) | [ok] |
| Shell: Tab-Leiste, Konto/Login, Watchlist, Offline-Hinweis, Safe Areas, hell/dunkel | [ok] im Browser, [offen] auf dem Gerät |
| Anmeldung mit Supabase Auth und Bearer-Token, Session-Erneuerung, Logout | [ok] gegen simulierte Dienste, [offen] gegen echtes Supabase |
| Token in der iOS-Keychain (`whenUnlockedThisDeviceOnly`) | [ok] Logik getestet, [offen] Keychain auf dem Gerät |
| Capacitor-iOS-Projekt (`app/ios`, Bundle-ID `de.visionuniverse.app`) | [ok] erzeugt, [offen] Build (kein Xcode, kein CocoaPods hier) |
| Icon und Startbild | vorläufig aus der Wortmarke; ein eigenes App-Symbol steht aus [offen] |
| Produktbereiche (Discover, Quant, Technical, Supertrader) | als Rahmen auf `research.visionuniverse.de`, nichts gebündelt |
| Zahlungen, Registrierung, Store, Veröffentlichung | bewusst [fehlt] |

## 2. Messung der Datenmengen (Start einer Seite)

Chromium, iPhone-Viewport 390×844, gzip Stufe 6 wie GitHub Pages, lokal aus dem Repository. `node app/scripts/measure-payload.mjs [--slow]`.
Wire = übertragen (gzip), dekodiert = nach dem Entpacken. Ladezeit = bis keine Anfrage mehr läuft (höchstens 20 s Wartezeit), kein Maß für „bedienbar“.

| Bereich | Anfragen | Wire | Dekodiert | JSON (Anzahl/Wire) | JS-Heap | Zeit lokal | Zeit 1,6 Mbit/s, 150 ms |
|---|---:|---:|---:|---|---:|---:|---:|
| Discover Start | 127 | 1,15 MB | 3,7 MB | 17 / 229 KB | 6,7 MB | 21,6 s* | 24,3 s* |
| Discover Aktie (NVDA) | 119 | 1,30 MB | 5,0 MB | 18 / 649 KB | 7,8 MB | 2,6 s | 8,8 s |
| Quant Start | 109 | 0,97 MB | 2,4 MB | 4 / 54 KB | 7,2 MB | 1,7 s | 6,8 s |
| **Quant Aktie (NVDA)** | 149 | **3,55 MB** | **25,7 MB** | 32 / 1,80 MB | **32–41 MB** | 4,0 s | **21,8 s** |
| Technical | 25 | 0,22 MB | 0,68 MB | 2 / 60 KB | 2,2 MB | 1,0 s | 2,2 s |
| Supertrader | 20 | 0,61 MB | 5,1 MB | 8 / 449 KB | 7,1 MB | 1,1 s | 4,4 s |
| Konto (Web) | 16 | 0,10 MB | 0,30 MB | 0 | 2,0 MB | 1,3 s | 2,4 s |

\* Discover Start erreicht in 20 s keinen ruhigen Netzzustand (anhaltende Abrufe, vermutlich nachladende Bilder oder Live-Daten). Die Ursache ist nicht untersucht [offen]. Die Seite war nach wenigen Sekunden bedienbar (Titel und Inhalt vorhanden), die Zahl sagt nichts über die gefühlte Ladezeit.
Lokale Läufe zeigten bei Quant Aktie 7–8 Anfragen mit 404. Vermutlich Dateien, die nur im gebauten Release existieren; nicht geprüft [offen].

### Größte Einzeldateien und Maßnahmen zur Datenaufteilung

Dokumentiert, **nicht umgesetzt**. Jede Maßnahme berührt ein Fachprodukt und gehört in einen eigenen PR dieses Produkts (CLAUDE.md, Gates). Der App-Prototyp ändert nichts davon.

| # | Datei (Bereich) | Wire / dekodiert | Befund | Maßnahme |
|---|---|---|---|---|
| 1 | `quant/data/market/factors/factors-FULL_UNIVERSE.json` (Quant Aktie) | 1,27 MB / **19,1 MB** | Die Aktienseite lädt das ganze Universum für eine Aktie. Haupttreiber des Heaps (32–41 MB). | Faktoren je Wertpapier teilen (Schlüssel über `core/identity.js`), die Seite lädt nur den eigenen Satz. Für Listen den vorhandenen `screening.json.gz` (96 KB) nutzen. |
| 2 | `quant/data/product/technical-signals-v1/NV.json.gz` (Quant Aktie) | 0,74 MB | Zwei-Buchstaben-Bucket (`NV`) für eine Aktie; die größten der 650 Buckets haben 2,2–2,4 MB. | Feinere Shards (je Wertpapier oder Hash-Bucket mit etwa 50 Titeln), Bucket-Größe als Gate. |
| 3 | `discover/logos/credits.json` (Discover Aktie) | 0,32 MB / 1,7 MB | Alle Logo-Nachweise für eine Aktie. | Nachweise erst bei Bedarf (Impressum/Info) laden oder je Aktie teilen. |
| 4 | `supertrader/data/signals-core.json` (Supertrader) | 0,34 MB / **4,2 MB** | Dekodiert schwer fürs Parsen auf dem Telefon. `signals.json` (9,9 MB) wird beim Start nicht mehr geladen; ADR-004 nennt noch 3,2 MB und ist veraltet. Je-Aktie-Shards liegen bereits unter `supertrader/data/stock/`. | Startseite nur mit Übersicht (Zählwerte, Kopfzeilen), Details je Aktie aus `stock/`. |
| 5 | Discover Start | 127 Anfragen | Viele kleine Bilder (Themen `.webp` je 85–105 KB). | Bilder verzögert laden, Anfragen bündeln; Budget laut CLAUDE.md gilt (≤ 12 Anfragen für die Discover-Code-Dateien). |

Zum App-Bundle gehört nichts davon. Gebündelt sind nur die Shell (rund 30 KB) und das Plugin-Bundle (rund 15 KB).

## 3. Tests und Ergebnisse

| Prüfung | Ergebnis |
|---|---|
| App-Unit-Tests (`cd app && npm test`): Anmeldung, Erneuerung, Single-Flight, Offline, API-Client, Token-Speicher, Wächter | **26/26 bestanden** |
| Browser-Machbarkeitsnachweis (`node app/scripts/poc-browser.mjs`), 22 Prüfungen: Start, 6 Tabs ≥ 44 px, kein Seitwärts-Scrollen, Safe-Area-Regeln, 4 Produktbereiche im Rahmen (echte Seiten), Login (falsch/richtig), Tarif aus `/v1/me`, kein Token im Web-Speicher, Watchlist aus API, Bearer-Header, Entfernen serverseitig, Erneuerung vor Ablauf, Offline-Hinweis, Offline ohne Abmeldung, Wiederverbindung, Logout | **22/22 bestanden** |
| Bestehende Web-Regressionstests | siehe Abschnitt 4 |

Nicht geprüft [offen]: echte Safe Areas (Notch, Home-Indikator), Tastatur-Verhalten, Touch-Gesten und Zoom in Charts (Technical, Quant), Speicher in WKWebView, Session-Erneuerung gegen echtes Supabase (Rotation, Reuse-Intervall), App-Wechsel in den Hintergrund und zurück, Verhalten von ITP und der Passwortmaske im Rahmen unter `capacitor://localhost`.

Der Nachweis ist ehrlich begrenzt: Er prüft die Shell-Logik und dass die echten Seiten im Rahmen laden. Er sagt nichts über das Geräteverhalten.

## 4. Web-Regressionstests (Vorher/Nachher)

Der PR ändert nur `app/`, `docs/architecture/ADR-007-capacitor-prototype.md` und `docs/mobile/`. Kein Web- oder Worker-Pfad wurde berührt.

Lokal ausgeführt am 03.11.2026 auf Linux (Branch `claude/mobile-capacitor-prototype`, Basis `5dd34fcc59`):

| Suite | Ergebnis |
|---|---|
| `core/tests` | 308 Tests, 308 bestanden |
| `technical/tests` | 95 Tests, 95 bestanden |
| Konten (`workers/vu-account/tests/unit`, `konto`, `mein-dashboard`, `scripts/account`) | 106 Tests, 103 bestanden, 3 übersprungen (Datenbank-Tests ohne `PG_TEST_URL`), 0 fehlgeschlagen. Die Datenbank- und Ablauf-Tests (`sql-tests`, `flows`) liefen **nicht** [offen]. |
| Discover, Supertrader, Screener | 1763 Tests, 1742 bestanden, 21 übersprungen, 0 fehlgeschlagen |
| `scripts/access-gate/build.test.mjs` (Passwortmaske unverändert) | 4 Tests, 4 bestanden |
| `check-test-isolation.mjs` | „Der Lauf hat keine Produktionsdatei verändert.“ |
| `quant/tests` | 3922 Tests, 3894 bestanden, 24 übersprungen, **4 fehlgeschlagen** (siehe unten) |
| Release-Build (`scripts/vu2/build-release.mjs`) mit dem Branch | Status PASS |
| Python-Quant-Tests (`scripts/quant/tests`) | nicht ausgeführt [offen] |

**Die 4 fehlgeschlagenen Quant-Tests sind nicht durch diesen PR verursacht.** Ich habe `app/`, `docs/mobile/` und ADR-007 vorübergehend aus dem Arbeitsverzeichnis genommen (Zustand entspricht dann `main`) und dieselben vier Testdateien erneut laufen lassen: dieselben 4 Tests schlugen fehl.
Es sind `naming-contract` („die Übersicht schreibt kein Kürzel zweimal“, „Liste und Aktienseite nennen denselben Namen“), `debt-instrument-classification` (DEBT7) und `launch-gates` („ein belegtes Nicht-Aktien-Papier behaelt seinen Kurs …“). Der offene PR #1279 („Quant: zurückgehaltener Name bei wiederverwendetem Kürzel …“) betrifft dasselbe Thema. Ob er sie behebt, habe ich nicht geprüft [offen].

## 5. Offene Punkte und Risiken

| # | Punkt | Wirkung |
|---|---|---|
| 1 | Gerätetest fehlt (Gesten, Speicher, Safe Areas, Keychain, ITP) | entscheidet Capacitor oder Expo |
| 2 | Cookie- und Speicher-Regeln im Rahmen unter `capacitor://localhost`: Die Passwortmaske speichert ihren Schlüssel in `localStorage` der Seite. Im Rahmen gilt partitionierter Speicher; Verhalten auf iOS unverifiziert. | Tester müssten das Passwort evtl. oft eingeben |
| 3 | Die Produktseiten im Rahmen nutzen die Cookie-Anmeldung der Web-Konto-Seiten nicht (Drittanbieter-Cookies). Konto und Watchlist sind daher in der Shell gebaut. Aktienseiten, die selbst die Konto-API aufrufen, kennen das Bearer-Token nicht. | Watchlist-Stern auf Aktienseiten funktioniert in der App nicht ohne Brücke (z. B. `postMessage` der Shell) |
| 4 | Hinzufügen zur Watchlist braucht eine `instrumentId` (`vu_…`) nach `core/identity.js` (ADR-001). Die Shell liest und entfernt nur. | Funktionslücke im Prototyp |
| 5 | Direkter Supabase-Login umgeht das Tempolimit des Workers (`ctx.limit('login')`). Supabase hat eigene Limits. | Vorschlag: später `POST /v1/auth/app-login` im Worker, eigener PR mit Worker-Freigabe |
| 6 | `app/` wird mit der Webseite ausgeliefert (`permitted()` in `scripts/vu2/build-release.mjs`). Lokaler Release-Build mit dem Branch: Status PASS, `app/` ergibt 36 Dateien, 1,5 MB (inkl. `ios/`, ohne Tests). Nur öffentlicher Shell-Code, keine Schlüssel. | Optionaler Ausschluss als eigener, freigegebener Pipeline-PR |
| 7 | Einbettung hängt davon ab, dass `research.visionuniverse.de` keine `X-Frame-Options` oder `frame-ancestors` setzt (am 03.11.2026: nicht gesetzt). | Eine spätere Sicherheitskopfzeile bricht den Rahmen |
| 8 | Store-Richtlinie 4.2 (Mindestumfang): Eine Webhülle mit Rahmen kann abgelehnt werden. Für **internen** TestFlight nicht relevant, für den Store ein reales Risiko. | Native Mehrwerte planen (Push, Face ID/Sperre, Widgets) |
| 9 | Supabase-URL und Publishable Key fehlen im Repository. Sie werden als öffentliche Build-Werte gesetzt. | vom Owner zu liefern; kein Secret nötig |
| 10 | Logo: nur eine Wortmarke; das Icon ist ein Platzhalter. | Design vom Owner |

## 6. TestFlight-Vorbereitung (noch nichts ausgeführt)

### Apple-Konfiguration (vom Owner, alles [offen])

1. **Apple Developer Program** (99 €/Jahr). Als Organisation nur mit D-U-N-S-Nummer, Prüfung kann Tage dauern. Account-Inhaber festlegen.
2. **App-ID** (explizit) `de.visionuniverse.app`. Das ist ein Vorschlag aus `capacitor.config.json`; Verfügbarkeit ungeprüft. Capabilities vorerst keine. Später: Sign in with Apple, Push, Associated Domains (Universal Links).
3. **App-Eintrag in App Store Connect:** Name „Vision Universe“ (Verfügbarkeit ungeprüft), Primärsprache Deutsch, SKU, Bundle-ID.
4. **App-Store-Connect-API-Schlüssel** (Rolle App Manager) für automatische Uploads, nur als Secret, nie im Repository.
5. **Interne Testgruppe:** bis zu 100 Personen mit Rolle in App Store Connect, **keine** Beta-App-Prüfung durch Apple. Externe Tester brauchen eine Beta-Prüfung und sind nicht Teil dieses Meilensteins.
6. **Exportnachweis:** Die App nutzt nur HTTPS (Standardverschlüsselung). `ITSAppUsesNonExemptEncryption` ist noch nicht gesetzt; die Antwort verantwortet der Owner [offen].
7. **Datenschutz-Angaben** in App Store Connect (App Privacy) und **Privacy Manifest** (`PrivacyInfo.xcprivacy`) prüfen [offen]. Für internen TestFlight genügt ein Minimum, für den Store sind sie Pflicht.
8. **Mindest-Xcode** laut Apple-Vorgabe zum Upload-Zeitpunkt prüfen. Capacitor 7 verlangt Xcode 16 oder neuer; die aktuelle Apple-Vorgabe wurde nicht abgerufen [offen].

### Bundle-ID und Signing-Konzept

- Bundle-ID `de.visionuniverse.app` (Vorschlag), in `app/ios/App/App.xcodeproj` und `capacitor.config.json` gesetzt.
- **Empfehlung: automatisches Signieren in CI** mit App-Store-Connect-API-Schlüssel (Xcode Cloud oder Fastlane). Zertifikate und Profile liegen nie im Repository.
- Geheimnisse (API-Schlüssel, Team-ID) nur in einer GitHub-Umgebung mit erforderlichen Prüfern, nach dem Muster `account-dev`/`account-production` aus `FREIGABEN.md`. Der Workflow läuft nur von Hand.
- Keine Zugangsdaten in Chat, Issues oder PRs.

### macOS-Buildmöglichkeiten

| Option | Aufwand | Kosten | Bemerkung |
|---|---|---|---|
| Eigener Mac mit Xcode | niedrig, sofort | vorhanden? [offen] | schnellster Weg für den ersten Build, nicht reproduzierbar |
| **Xcode Cloud** | mittel | Kontingent im Developer Program (Höhe nicht geprüft) | direkt mit TestFlight verbunden, kein eigener Runner, Repository-Zugriff für Apple nötig |
| GitHub-gehosteter macOS-Runner | mittel | Minuten-Multiplikator für macOS (nicht geprüft) | passt zu den bestehenden Workflows; `workflow_dispatch`, `permissions: contents: read` |
| Fastlane auf eigenem/Cloud-Mac | mittel | variabel | gut für Wiederholbarkeit |

Empfehlung: **erster Build auf einem Mac von Hand** (Klärung aller Apple-Schritte), danach Xcode Cloud oder ein macOS-Runner.

### Nächster Meilenstein: privater interner TestFlight-Build

Definition (fertig, wenn alles zutrifft):

1. Apple-Konto, App-ID, App-Eintrag vorhanden (Owner).
2. `npm run build:www` mit öffentlichen Supabase-Werten, `npx cap sync ios`, Archiv und Upload erfolgreich.
3. Auf einem echten iPhone: Login/Logout, Session nach App-Neustart und nach Hintergrund, Watchlist-Sync mit Web, Offline-Verhalten, die vier Produktbereiche bedienbar, Chart-Gesten, Passwortmaske im Rahmen.
4. Messwerte aus Abschnitt 2 auf dem Gerät (Mobilfunk) und Speicher über Instruments ergänzt.
5. Entscheidung Capacitor oder Expo nach den Kriterien in ADR-007.
6. Keine Zahlungen, keine Veröffentlichung, kein externer Tester.

## 7. Empfehlung: Capacitor fortführen oder Expo bevorzugen?

**Empfehlung: Capacitor für den ersten internen TestFlight-Build fortführen. Die Wahl für die Store-Version noch nicht treffen, sondern nach dem Gerätetest anhand der Ausstiegskriterien in ADR-007.**

Begründung:

- **Dafür:** Die Shell-Logik ist belegt (26 Tests, 22 Browserprüfungen). Die echten Seiten laden im Rahmen. Bis zum Gerät fehlt wenig, der Aufwand bis zum internen TestFlight ist klein, und es entsteht keine zweite Oberfläche. Der Prototyp ist ein Wegwerfpfad: Die Konto-Logik (`auth.js`, `api.js`, Token-Speicher) ist plattformneutral und ginge nach Expo über.
- **Dagegen (ADR-004 bestätigt sich teilweise):** Quant Aktie ist mit 25,7 MB dekodiert und 32–41 MB Heap der klare Schwachpunkt, im gedrosselten Netz 21,8 s. Das ist ein Problem der Seite, nicht von Capacitor, und lässt sich **mit oder ohne App** nur über die Datenaufteilung lösen (Abschnitt 2). Expo würde diese Last nicht beseitigen, sondern eine neue Oberfläche und einen neuen Datenweg (`/v1/`) verlangen.
- **Offen entscheidend:** Gesten in Charts, Rahmen-Speicher unter iOS und die Store-Richtlinie 4.2. Das lässt sich nur auf dem Gerät klären.
- **Nicht aussagekräftig:** Mein Vergleich gründet auf Chromium-Messungen und simulierten Diensten, nicht auf einem iPhone. Eine Expo-Variante habe ich nicht gebaut und nicht gemessen. Die Empfehlung zwischen den beiden ist deshalb eine begründete Einschätzung, kein Messergebnis.

**Entscheidungen, die der Owner trifft:**
1. Capacitor bis zum internen TestFlight fortführen (empfohlen) oder jetzt auf Expo gehen.
2. Apple-Konto und ein Mac oder Xcode Cloud bereitstellen.
3. Supabase-URL und Publishable Key als öffentliche Build-Werte liefern.
4. Ausschluss von `app/` aus der Webauslieferung (Pipeline-PR) und `app-login` im Worker nur auf ausdrückliche Anweisung.
5. App-Symbol (Design) liefern.
6. Schwellen der Ausstiegskriterien bestätigen.

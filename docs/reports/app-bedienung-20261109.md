# Mobile Bedienprüfung · 09.11.2026

**Ziel:** research.visionuniverse.de soll sich schnell, ruhig und mit großen Tippflächen bedienen lassen; Trade Republic dient als qualitatives Zielbild für Vor-/Zurück-Navigation und Daumenbedienung. Kein instrumentierter Vergleich mit Trade Republic, keine Aussage über dessen konkrete Messwerte.

**Ergebnis:** 1 P1, 4 P2 und 4 P3. Vorrang haben die vom Dock verdeckte Discover-Aktion, der reproduzierbare NVDA-Layoutsprung und die kleinen Tippziele. Alle 22 abschließenden Rück-/Vorwärtstests bestätigen URL und Inhalt; kein horizontaler Seitenüberlauf in den Stichproben.

**Umfang:** Nur Untersuchung und Bericht mit Belegen, keine Änderungen an Produktcode, Daten, Konten oder Veröffentlichungseinstellungen. Gelesen: `CLAUDE.md`, `AGENTS.md`, Neustart-Plan, `app/README.md` insbesondere „Nächster Build (0.2.0)“, `docs/accounts/NUTZERFUEHRUNG.md` und `docs/RESEARCH_ACCESS_GATE.md`.

## Verfahren und Aussagegrenzen

- Playwright Python, Linux, WebKit **26.5** als iPhone und Chromium **151.0.7922.34** als Android; beide **390 × 844 CSS-px**, Touch, mobiles Layout, DPR 3. Das sind Browseremulationen, keine echten Geräte oder TestFlight-/Capacitor-Builds.
- Je Seite frischer Browserkontext, ohne Kontositzung, ohne CPU-/Mobilfunkdrosselung; Verbindung über Cloud-Proxy. Je ein sequenzieller Erstaufruf pro Browser. Proxy-/Server-Caches können warm sein. Werte sind Labor-Stichproben, keine Feld-p75 und kein Median.
- Die Produktion hat einen gemeinsamen Development-/Marketing-Passwortgate. Für den Inhaltsaudit ersetzt eine Playwright-Route ausschließlich die HTML-Dokumentantwort durch das **öffentlich ausgelieferte Original** unter `/__research/content/<Pfad>/index.html`; die sichtbare URL bleibt unverändert. Alle Skripte, Styles, Daten und Links kommen weiterhin live von der Produktion. Dies ist in `docs/RESEARCH_ACCESS_GATE.md` als direkt abrufbares Original dokumentiert. Kein Produktionspasswort verwendet, kein Konto-Zugang umgangen. **Gate-Login, dessen Nachladezeit und der native App-Rahmen sind nicht Bestandteil dieser Inhaltsmessung.** Die zusätzliche Proxy-Abfrage des Originals beeinflusst die Dokument-Latenz; deshalb keine unveränderte End-to-End-Produktions-LCP behaupten.
- PerformanceObserver wird vor den Seitenskripten installiert. LCP = letzter gemeldeter größter Inhalt bis **15 s nach DOMContentLoaded**, noch vor Eingaben. LCP kann eine Überschrift oder ein Bild sein; er beweist keine Datenbereitschaft. Die Screenshots zeigen den Zustand nach diesem Beobachtungsfenster. Requests = gestartete logische Browseranfragen bis zu diesem Zeitpunkt, inkl. fehlgeschlagener Anfragen; der zusätzliche Original-HTML-Abruf der Test-Route wird nicht als zweiter Browserrequest gezählt. Redirects und browserabhängige Assetwahl können die Anzahl beeinflussen.
- CLS in Chromium: größtes Sitzungsfenster (max. 5 s, neue Sitzung nach >1 s Pause), ohne `hadRecentInput`, bis zum selben Zeitpunkt. **WebKit bietet `layout-shift` nicht an: CLS dort nicht messbar, keinesfalls 0.** Kein sichtbarer Sprung im Endbild ist kein Ersatz für eine CLS-Messung.
- DOM-Rechtecke aktiver Links/Buttons/Eingaben/Tabs/Summaries, Schriftgröße direkt texttragender Elemente; Einstieg und Scrollstichproben alle 650 px bis höchstens 12.000 px. Außerhalb der horizontalen Sichtfläche liegende Elemente und versteckte Skiplinks werden in der Auswertung ausgeschlossen. Das ist eine Stichprobe der sichtbaren Zustände, keine erschöpfende Prüfung jeder Tabelle, jedes Karussell-Eintrags und jedes Untertabs. Shadow-DOM-Navigation wird ergänzend über Playwright-Locators gemessen und angetippt.
- „Unter 44 × 44“ bedeutet **Breite <44 oder Höhe <44**, nicht nur wenn beide Seiten zu klein sind. Schriftwerte sind CSS-px, inkl. kleiner Logoersatz-/Badge-Texte; deren Bedeutung wird bei der Priorität berücksichtigt. Seitenüberlauf = `documentElement.scrollWidth - innerWidth`; bewusst horizontal scrollende Karussells zählen separat und sind kein Seitenfehler.
- Pro Seite mindestens ein sichtbarer interner Link und Browser-Zurück zum Ausgangs-URL; Menü zusätzlich angetippt. Für die funktionalen Wiederholungen ist der Service Worker blockiert: sonst umgehen dessen Navigationsantworten die Playwright-HTML-Route und liefern mangels Gate-Sitzung wieder die Passwortmaske. Die Erstaufruf-Messungen laufen in frischen Kontexten; ihre vorläufigen URL-only-Zurückproben werden nicht als Inhaltsnachweis verwendet. Maßgeblich sind die ergänzenden Rück-/Vorwärtstests mit URL- und Textvergleich in `navback`. Eine Aktienreise prüft auch Scrollposition und Website-Randgeste mit `?vuGestures=1`. Ein vom Browser erzeugter Pointer-Drag ist nur ein Funktionstest der Website-Geste. Safari-Systemwischen, Android-Systemgeste, Haptik, Safe Areas, native Vorschau und der neue Build 0.2.0 bleiben am echten Gerät abzunehmen. Aus einem Browsertest folgt keine native Freigabe.
- `/mein-dashboard/` leitet ohne Sitzung zur Anmeldung mit `next=%2Fmein-dashboard%2F` weiter. Geprüft ist dieser Gastweg, **nicht** die angemeldete Watchlist. `/ask/` zeigt einen weiteren Beta-Zugang (Quota-API HTTP 401 ohne Beta-Zugang); Antworten und Sprachinteraktion dahinter sind **nicht geprüft**. Die erwarteten Zugangsschranken sind keine „hängenden Bereiche“.
- Die Kurzform `/discover/#/NVDA` zeigte die Discover-Startseite. Für die geforderte Aktienprüfung wurde deshalb die tatsächlich verlinkte Detailroute **`/discover/#/s/US_REAL/NVDA`** verwendet. Eine bloße Kurzform ohne Produktkontext ist kein belastbarer Deep Link.

Messdaten und genaue URLs/Zeiten: [messwerte.json](app-bedienung-20261109/messwerte.json). Bilder sind unveränderte Viewport-Aufnahmen (1170 × 2532 Bildpixel bei DPR 3); sämtliche Maße im Text beziehen sich auf CSS-px. `top` zeigt den Einstieg, `bottom` die letzte Scrollstichprobe, bei langen Seiten nicht zwingend das Dokumentende.

## Messmatrix

Eine Erstaufruf-Stichprobe je Browser. LCP in Sekunden, Überlauf in CSS-px. „n. m.“ = technisch nicht messbar. Die Ziel-/Textzahlen sind **unterschiedliche Messmuster aus dem Inhalts-DOM**, dedupliziert nach Text, Linkziel und Größe; keine behauptete Zahl aller DOM-Elemente. Die Shadow-Shell ist separat belegt (u. a. Suche/Profil 40 × 44 px). Minimalschrift inkl. Logoersatz; 0-px-Verstecktext ausgeschlossen. „✓“ bei Zurück/Vor setzt echte Navigation, erwartete URL und denselben sichtbaren Textanfang nach Rückkehr voraus.

| Seite · Profil | LCP s | CLS | Requests | Überlauf | Ziele <44 | Text <12 / Minimum px | Zurück/Vor | Screenshot |
|---|---:|---:|---:|---:|---:|---:|:---:|---|
| `/willkommen/` · Android | 0.988 | 0.0000 | 32 | 0 | 5 | 20 / 10.5 | ✓ | [Bild](app-bedienung-20261109/chromium-willkommen-top.png) |
| `/willkommen/` · iPhone | 2.504 | n. m. | 37 | 0 | 5 | 20 / 10.5 | ✓ | [Bild](app-bedienung-20261109/webkit-willkommen-top.png) |
| `/discover/` · Android | 0.852 | 0.0000 | 73 | 0 | 16 | 64 / 7 | ✓ | [Bild](app-bedienung-20261109/chromium-discover-top.png) |
| `/discover/` · iPhone | 1.798 | n. m. | 78 | 0 | 16 | 63 / 7 | ✓ | [Bild](app-bedienung-20261109/webkit-discover-top.png) |
| `/discover/#/s/US_REAL/NVDA` · Android | 0.512 | 0.1664 | 68 | 0 | 15 | 53 / 10 | ✓ | [Bild](app-bedienung-20261109/chromium-nvda-top.png) |
| `/discover/#/s/US_REAL/NVDA` · iPhone | 0.538 | n. m. | 86 | 0 | 15 | 55 / 10 | ✓ | [Bild](app-bedienung-20261109/webkit-nvda-top.png) |
| `/screener/` · Android | 0.688 | 0.0000 | 45 | 0 | 13 | 13 / 10.5 | ✓ | [Bild](app-bedienung-20261109/chromium-screener-top.png) |
| `/screener/` · iPhone | 0.968 | n. m. | 53 | 0 | 13 | 13 / 10.5 | ✓ | [Bild](app-bedienung-20261109/webkit-screener-top.png) |
| `/quant/` · Android | 0.488 | 0.0000 | 23 | 0 | 13 | 38 / 10 | ✓ | [Bild](app-bedienung-20261109/chromium-quant-top.png) |
| `/quant/` · iPhone | 0.716 | n. m. | 26 | 0 | 13 | 38 / 10 | ✓ | [Bild](app-bedienung-20261109/webkit-quant-top.png) |
| `/supertrader/` · Android | 0.560 | 0.0000 | 19 | 0 | 8 | 40 / 10 | ✓ | [Bild](app-bedienung-20261109/chromium-supertrader-top.png) |
| `/supertrader/` · iPhone | 0.987 | n. m. | 23 | 0 | 8 | 42 / 10 | ✓ | [Bild](app-bedienung-20261109/webkit-supertrader-top.png) |
| `/fundamental/` · Android | 0.624 | 0.0000 | 43 | 0 | 9 | 11 / 7 | ✓ | [Bild](app-bedienung-20261109/chromium-fundamental-top.png) |
| `/fundamental/` · iPhone | 0.801 | n. m. | 47 | 0 | 9 | 11 / 7 | ✓ | [Bild](app-bedienung-20261109/webkit-fundamental-top.png) |
| `/morning/` · Android | 0.468 | 0.0000 | 8 | 0 | 5 | 18 / 9 | ✓ | [Bild](app-bedienung-20261109/chromium-morning-top.png) |
| `/morning/` · iPhone | 0.628 | n. m. | 12 | 0 | 4 | 18 / 9 | ✓ | [Bild](app-bedienung-20261109/webkit-morning-top.png) |
| `/ask/` · Android | 0.504 | 0.0000 | 20 | 0 | 1 | 5 / 10.5 | ✓ | [Bild](app-bedienung-20261109/chromium-ask-top.png) |
| `/ask/` · iPhone | 0.546 | n. m. | 20 | 0 | 1 | 5 / 10.5 | ✓ | [Bild](app-bedienung-20261109/webkit-ask-top.png) |
| `/mein-dashboard/` · Android | 0.280 | 0.0000 | 28 | 0 | 6 | 0 / – | ✓ | [Bild](app-bedienung-20261109/chromium-mein-dashboard-top.png) |
| `/mein-dashboard/` · iPhone | 0.364 | n. m. | 32 | 0 | 6 | 0 / – | ✓ | [Bild](app-bedienung-20261109/webkit-mein-dashboard-top.png) |
| `/infos/` · Android | 0.424 | 0.0000 | 8 | 0 | 1 | 1 / 10.5 | ✓ | [Bild](app-bedienung-20261109/chromium-infos-top.png) |
| `/infos/` · iPhone | 0.455 | n. m. | 13 | 0 | 1 | 1 / 10.5 | ✓ | [Bild](app-bedienung-20261109/webkit-infos-top.png) |

Alle gemessenen Seitenbreiten bleiben bei **390 px**. Die seitlichen Karten-/Tabreihen sind bewusst scrollbare Komponenten, kein horizontaler Dokumentüberlauf. Die Chromium-Einstiege außer NVDA haben im Messfenster CLS 0. Die Endbilder zeigen keine dauerhaft leeren/hängenden Inhaltsbereiche; die frühe, kurzzeitig leere NVDA-Ansicht ist separat belegt. Login- und Beta-Schranke sind erwartete Gastzustände, Video-/Audio-Wiedergabe, angemeldete Funktionen und sämtliche Unteransichten sind damit nicht abgenommen.

## Priorisierte Befunde

Prioritäten: **P1 stört sofort** (primäre Aktion/Rückweg führt unmittelbar falsch), **P2 fällt auf** (sichtbare Unruhe, kleine regelmäßig benötigte Ziele, Orientierungsbruch), **P3 Feinschliff** (sekundäre Metadaten und seltene Aktionen). Zugangsschranken und fehlende Geräteabnahme sind Prüfgrenzen, keine erfundenen P1-Fehler.

### P1 · 00 · Discover: Dock verschluckt den ersten Tipp auf „Merken“

- **Seite:** `/discover/`, im fokussierten Chromium-Touchtest; derselbe verdeckte Einstieg ist auch im WebKit-Screenshot sichtbar.
- **Befund/Messwert:** Der erste „Merken“-Button liegt bei **x=172, y=747,5**, Größe **132 × 46 px**. Sein Mittelpunkt **(238; 770,5)** trifft laut tiefem Shadow-DOM-Hittest die **Dock-Navigation**, nicht den Button. Der tatsächliche Touchtest trifft diese Dockfläche; die Seite bleibt am Ausgangs-URL. Das Ziel ist formal groß genug, am erwarteten Fingertipp aber verdeckt. Ein Stück Scrollen macht es erreichbar; es ist kein dauerhaft gesperrter Button.
- **Screenshot:** [vor dem Tipp](app-bedienung-20261109/chromium-discover-before-covered-tap.png), [danach](app-bedienung-20261109/chromium-discover-after-covered-tap.png), [iPhone-Geometrie](app-bedienung-20261109/webkit-discover-top.png). Hittest und Tippkoordinate stehen in `messwerte.json` unter `focused.occlusion`.
- **Vorschlag:** Höhe der ersten Karte und Dock-Abstand auf 390 × 844 so abstimmen, dass die primären Kartenaktionen oberhalb des Docks liegen. Zusätzlich für automatisch in Sicht gescrollte Ziele `scroll-padding-bottom`/`scroll-margin-bottom` auf Dockhöhe plus Abstand abstimmen; ein bloßes Padding am Dokumentende löst die Überlagerung mitten im Inhalt nicht. An jedem üblichen Scrollhaltepunkt muss ein sichtbarer CTA auch an seinem Mittelpunkt getroffen werden.

### P2 · 01 · NVDA: Aktieninhalt schiebt sich nachträglich in den Einstieg

- **Seite:** `/discover/#/s/US_REAL/NVDA`, Chromium.
- **Befund/Messwert:** CLS **0,1664**, Layout-Shift bei **1.757,6 ms** nach Navigation. Die initiale LCP-Meldung bei **512 ms** gehört zum Rechtshinweis, nicht zur fertigen Aktienansicht. Somit darf dieser vermeintlich schnelle LCP nicht als Nachweis für einen ruhigen Aktienstart verwendet werden. Im Wiederholungslauf erneut **CLS 0,1664** bei **1.660,1 ms**. Die Shift-Quellen zeigen den Chart von **y=279 auf y=108**, Höhe **336 auf 618,8 px**; der folgende Tagbereich verschiebt sich um **111,8 px**. WebKit-CLS bleibt mangels API offen.
- **Screenshot:** [während des Ladens](app-bedienung-20261109/chromium-nvda-loading.png), [nachgeladen](app-bedienung-20261109/chromium-nvda-loaded.png), [iPhone-Endzustand](app-bedienung-20261109/webkit-nvda-top.png). Der Zahlenbeleg kommt aus dem Observer; ein Endbild allein zeigt keinen CLS.
- **Vorschlag:** Kopf, Kursblock und Chart von Beginn an mit stabiler Mindesthöhe reservieren. Insbesondere die Chartgeometrie beim Übergang auf die fertige Darstellung beibehalten; nachgeladene Stile/Renderer dürfen die zuvor reservierte Höhe nicht umformen. Die konkrete Ursache ist im Code noch zu verifizieren. Zusätzlich „Aktienkopf mit Kurs bereit“ messen; Ziel CLS ≤0,1 bei wiederholten Kaltstarts und stabiler Fingerposition.

### P2 · 02 · Screener: gerade die Einstiegsaktionen sind zu klein

- **Seite:** `/screener/`, beide Browser.
- **Befund/Messwert:** „+“ **34 × 34 px**, „…“ **43,1 × 34 px**, die fünf vorgeschlagenen Bedingungen jeweils **40 px** hoch. Alle unterschreiten die geforderten 44 px; der große Satz wirkt insgesamt antippbarer als seine eigentlichen Aktionen.
- **Screenshot:** [Android](app-bedienung-20261109/chromium-screener-top.png), [iPhone](app-bedienung-20261109/webkit-screener-top.png).
- **Vorschlag:** beide Symbolbuttons mindestens 44 × 44, besser 48 × 48 px; Bedingungschips mindestens 44 px hoch. Sichtbare Icons dürfen klein bleiben, aber das zusätzliche Padding muss zum echten Trefferbereich gehören.

### P2 · 03 · Kleine „Alle“- und Weiterführungslinks wiederholen sich in mehreren Welten

- **Seiten/Messwert:** Im gemeinsamen Produktkopf sind Suche und Profil jeweils nur **40 × 44 px** breit (auch Willkommen/NVDA/Screener/Fundamental). Quant „Radar“ **40 × 17,5 px**, „Alle“ **26 × 17,5 px**; Supertrader „Alle 13“ **45 × 17,5 px**, „Alle Signale“ **81 × 17,5 px**; Discover „Alle“ **41 × 32 px** (WebKit 39,5 × 32); Fundamental-Tickerchips **40 px** hoch. Die funktionierenden Links verlangen unnötig präzise Daumenbewegungen.
- **Screenshot:** [Quant](app-bedienung-20261109/chromium-quant-top.png), [Supertrader](app-bedienung-20261109/chromium-supertrader-top.png), [Discover](app-bedienung-20261109/chromium-discover-bottom.png), [Fundamental](app-bedienung-20261109/webkit-fundamental-top.png). Weitere Scrollbelege siehe Messdaten.
- **Vorschlag:** einheitlicher 44-px-Mindesttrefferbereich für Abschnittsaktionen; Titelzeile und „Alle“-Pfeil können gemeinsam ein großes Linkziel bilden. Chips auf 44–48 px erhöhen, ohne die gesamte Informationsdichte zu vergrößern.

### P2 · 04 · Morning: anderer Navigationsort und unklarer Aktualitätszustand

- **Seite:** `/morning/`, beide Browser.
- **Befund/Messwert:** kein unteres Produktdock; Menü oben rechts statt im unteren Daumenbereich. Jüngster sichtbarer Beitrag **06.10.2026**, also **34 Tage** vor dem Prüftag, bei der Überschrift „Der tägliche Börsengruß“. Die Seite ist geladen, wirkt aber ohne Erklärung wie ein stehen gebliebener täglicher Feed.
- **Screenshot:** [Android](app-bedienung-20261109/chromium-morning-top.png), [iPhone](app-bedienung-20261109/webkit-morning-top.png).
- **Vorschlag:** einen ausdrücklichen Archiv-/Pausenstatus neben dem Datum zeigen; keine tägliche Aktualität suggerieren. Einen konsistenten, gut erreichbaren Zurück-/Menüort wie in den Produktwelten anbieten. Kein neuer Inhalt muss dafür erfunden werden.

### P3 · 05 · Metadaten und Beschriftungen liegen regelmäßig unter 12 px

- **Seiten/Messwert:** Willkommen Datum **11 px**, Startbadge **10,5 px**; Discover Stand **10,5 px**, Rangbadge **10 px**, Ticker **11,5 px**; Quant Metadaten teils **10–11,5 px**; Supertrader Beschriftungen ab **10 px**; Screener **10,5–11,5 px**; Morning Archivmetadaten bis **9 px**; Atlas „BETA“ **11 px**, Rubriklabel **10,5 px**; Infos Rubriklabel **10,5 px**. NVDA enthält ebenfalls kleine Badge-/Kartenbeschriftungen. Das sind echte Unter-12-Funde; 7-/8,5-px-Logoersatzschrift wird nicht mit wichtigem Lesetext gleichgesetzt. Auf der Dashboard-Anmeldung kein Unter-12-Lesetext in der Inhaltsstichprobe.
- **Screenshot:** [Willkommen](app-bedienung-20261109/webkit-willkommen-top.png), [Discover](app-bedienung-20261109/webkit-discover-top.png), [Quant](app-bedienung-20261109/webkit-quant-top.png), [Supertrader](app-bedienung-20261109/webkit-supertrader-top.png), [Atlas](app-bedienung-20261109/webkit-ask-top.png), [Infos](app-bedienung-20261109/webkit-infos-top.png). Screener/Morning/NVDA siehe die jeweiligen Bilder in der Messmatrix.
- **Vorschlag:** inhaltliche Labels und Zeit-/Standangaben auf mindestens 12 px setzen, wichtige Erklärungen 14 px. Logoersatz und dekorative Ziffern separat gestalten; eine kleine Logoinschrift ist kein Grund, jede Karte umzubauen.

### P3 · 06 · Sekundärlinks sind wesentlich kleiner als die großen Hauptaktionen

- **Seiten/Messwert:** Browser-Rechtsfuß in den meisten Welten nur **15 px** hohe Textlinks (z. B. Kontakt **45 × 15 px**); `/infos/` im Fließtext „Quellen der Regeln“ **129 × 17 px**; Gastweg `/mein-dashboard/` → Anmeldung „Passwort vergessen?“ **136 × 36 px**. Bei Atlas ist der Risikohinweislink ebenfalls ein kleines Textziel. Die großen Rechtliches-Zeilen oben auf `/infos/` sind dagegen gut erreichbar.
- **Screenshot:** [Fußbereich Discover](app-bedienung-20261109/chromium-discover-bottom.png), [Infos unten](app-bedienung-20261109/chromium-infos-bottom.png), [Anmeldung](app-bedienung-20261109/webkit-mein-dashboard-top.png), [Atlas unten](app-bedienung-20261109/webkit-ask-bottom.png).
- **Vorschlag:** im Browser Footerlinks als ausreichend gepolsterte Zeilen umbrechen; Passwort-Hilfe mit 44-px-Zeile. In der App den bestehenden Weg über „Rechtliches & Infos“ beibehalten und dessen Ziele groß halten; Rechtstexte selbst nicht verändern.

### P3 · 07 · Willkommen nennt den persönlichen Einstieg anders als das Führungskonzept

- **Seite:** `/willkommen/`, beide Browser.
- **Befund/Messwert:** Kopf und aktiver Dockpunkt heißen „Mein Bereich“, im Inhalt „Guten Morgen“. Direkt unter dem Video steht die Zieleinrichtung statt der in `NUTZERFUEHRUNG.md` beschriebenen Zeile „Mein Dashboard“ mit abgesetztem „Konto“. Watchlist und Konto sind über Dock/Profile erreichbar; es ist kein fehlender Zugang, aber die Trennung von Einstieg und persönlichem Dashboard ist weniger deutlich.
- **Screenshot:** [Willkommen](app-bedienung-20261109/chromium-willkommen-top.png), [Dashboard-Gastweg](app-bedienung-20261109/chromium-mein-dashboard-top.png).
- **Vorschlag:** Begriffe zwischen Willkommen, Dashboard und Konto vereinheitlichen; die beschriebene Dashboard-Zeile als großes Ziel unter dem Video anbieten oder das Führungskonzept ausdrücklich an die neue Dockstruktur anpassen.

### P3 · 08 · Requestlast und erste sinnvolle Aktienanzeige getrennt beobachten

- **Seiten/Messwert:** Discover **73/78 Requests**, NVDA **68/86** (Chromium/WebKit); Willkommen LCP **0,988/2,504 s**. Andere Seiten siehe Matrix. Ein einzelner 2,504-s-Lauf belegt keine dauerhafte Performanceverletzung. Die Requestzahl allein ist kein Fehler und ist nicht mit dem enger gefassten Discover-Frontendbudget gleichzusetzen.
- **Screenshot:** [Discover Android](app-bedienung-20261109/chromium-discover-top.png), [NVDA iPhone](app-bedienung-20261109/webkit-nvda-top.png), [Willkommen iPhone](app-bedienung-20261109/webkit-willkommen-top.png).
- **Vorschlag:** mit realer Freigabe, Kaltcache und Mobilfunkprofil mindestens drei Wiederholungen messen; separate Zeitmarken für „erste Aktienkarte/Kurs sichtbar“ und LCP. Erst dann unbenutzte Detailmodule, Bilder außerhalb des sichtbaren Bereichs und früh gestartete Datenabfragen gezielt verzögern. Den bereits ruhigen Einstieg nicht durch zusätzliche Ladeanimationen ersetzen.

## Navigation und verbleibende Abnahme

- **chromium · Discover → ARDT → Browser-Zurück:** erfolgreich; Scrollposition **365 → 365 px**.
- **webkit · Discover → ARDT → Browser-Zurück:** erfolgreich; Scrollposition **54 → 54 px**.
- **chromium · Website-Randgeste mit `?vuGestures=1`:** erfolgreich; browsererzeugter Pointer-Drag von x=3 nach x=240, keine native Gerätegeste. Scrollposition **365 → 365 px**.
- **webkit · Website-Randgeste mit `?vuGestures=1`:** erfolgreich; browsererzeugter Pointer-Drag von x=3 nach x=240, keine native Gerätegeste. Scrollposition **54 → 54 px**.

Die Rück-/Vorwärtsergebnisse je Hauptseite stehen mit Ausgang, Ziel, Rückkehr und Inhalt in `messwerte.json` → `navback`. Bei „Mein Dashboard“ ist der Ausgang bewusst die weitergeleitete Anmeldeseite einschließlich `next`, damit der Gastweg nachvollziehbar bleibt. Die Atlas-Ansicht hat einen eigenen Zurück-/Schließenkopf statt des gemeinsamen Menüs. Hauptprodukt-Ziele im Menü werden gesondert angetippt; nicht jede Welt muss als eigener Menü-Link vorkommen (Atlas ist über den Kopf erreichbar, Infos über die Quellenverlinkung). Die zusätzlichen Tipps auf den absoluten Infos-/Quellenlink sowie den Atlas-Kopfzugang sind in beiden Engines erfolgreich (`additionalEntries`). Keine Vollständigkeitsbehauptung für jeden redaktionellen Link.

**Gerätetest vor einer App-Abnahme:** iOS und Android ab Willkommen → mehrere Welten → Aktie → Perspektive/Sheet → zurück/vor; Finger und Scrollposition müssen zur vorherigen Ansicht passen. Native 0.2.0-Randgeste mit Vorschau/Haptik und Android-System-Zurück bis Willkommen/Minimieren prüfen. Außerdem mit freigegebenem Testkonto die echte Watchlist, Wiederanmeldung sowie Atlas mit Beta-Zugang prüfen. Diese Punkte sind offen; dieser Bericht ist keine native Build-Freigabe.

## Berichtskontrolle

22 Erstaufruf-Profile, 22 erfolgreiche Rück-/Vorwärtstests mit Inhaltsvergleich, zwei erfolgreiche Website-Randgesten und zwei Listendetail-Rückwege mit Scrollwiederherstellung. Alle lokalen Beleglinks und SHA-256-Werte der 74 Screenshots geprüft; `git diff --check` ohne Befund. Keine Anwendungstests oder nativen Builds ausgeführt: geändert werden ausschließlich dieser Bericht und seine Mess-/Bildbelege. Branchbasis: `e06c1498e869e8206bbef39c6af071e67e18b9f3` auf `main`; die Live-Seiten sind unabhängig davon ausgelieferte Produktionsartefakte (Zeitpunkte/Asset-URLs in den Messdaten).

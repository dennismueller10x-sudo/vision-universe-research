# Discover 2.1 Premium — Design-QA-Vertrag

Dieser Vertrag bewertet die ausgelieferte Consumer Experience. Ein erfolgreicher Build allein ist kein Design-Pass. Die Browser-Suite erzeugt messbare Evidenz und echte Viewport-Screenshots; anschließend wird die Bildfolge mit der unten stehenden Kritikmatrix geprüft.

## Verantwortlichkeit und Schleife

Der Design-QA-Agent ist unabhängig von den implementierenden Frontend-Agenten. Seine Schleife lautet:

`BUILD → MOBILE SCREENSHOTS → DESIGN CRITIQUE → FIX → 10-VIEWPORT WALK → DATA TRUTH → PERFORMANCE → SCREENSHOTS`

Ein Befund geht an den zuständigen Owner der Surface zurück. Nach einer Änderung wird die betroffene Bildfolge erneut erzeugt. Ein Gate darf erst geschlossen werden, wenn sowohl der technische Check als auch die visuelle Kritik bestanden sind.

## Automatisierte Gates

`scripts/discover-v2/browser-qa.mjs` prüft ohne Daten-Mocks in Chromium und WebKit:

| Gate | Messung | PASS |
| --- | --- | --- |
| First five seconds | Zweck, Suche und Hero-Aktion im unverdeckten ersten Viewport; Ladezeit als lokale Evidenz | alle drei sichtbar, ≤ 5 s |
| Pure white | berechnete Hintergrundfarbe von Body und V2-Header im Light Mode | `rgb(255, 255, 255)` |
| Glass dock | Position, Insets, Radius, Border, Schatten, Backdrop Blur und Active State | schwebend, ≥ 8 px Inset, Blur aktiv, dunkle aktive Capsule |
| Dock-Kontext | echte Screenshots über neutraler, farbiger und Cinema-Surface | alle drei Intensitäten vorhanden |
| Diversity | zwölf Positionen über die vollständig geladene Mobile Journey; Archetyp, Chartband, Ranking, Story und Layout bilden eine Kompositionssignatur | ≥ 6 Archetypen, ≥ 7 Kompositionen, keine identische Komposition über mehr als zwei Positionen; Ranking, Story und mindestens fünf Chart-Beats |
| Worlds | echte Weltenroute, Zahl der Eingänge und unterschiedliche berechnete Hintergründe | ≥ 8 datenbelegte Eingänge, ≥ 3 visuelle Atmosphären |
| Charts | Fläche des primären Stock-Charts und berechnete Farbe relativ zur `data-direction` | auf Mobile ≥ 180 px hoch und breit; positiv grün, negativ rot |
| Freshness | Home-Artwork nutzt den kanonischen Snapshot/Intraday-Pfad und trägt einen gültigen Freshness-State; sichtbare Caption nennt Verlauf und Zeitraum/Stand | `LIVE`, `LAST_SESSION`, `STALE` oder `UNAVAILABLE`; strukturierte Caption sichtbar |
| Caption contract | Quellprüfung plus Browserdarstellung | `D.Artwork.verlauf` als strukturiertes Modell; keine Rekonstruktion aus `aria-label` per Regex |
| Interaktion | nativer Touch-Swipe im Hero, vertikaler Feed-Schritt, Batch Loading, Resume, Welten, Suche, Stock-Wechsel, Fundamental-Tab | Zustand und sichtbarer Inhalt ändern sich |
| Accessibility | axe WCAG 2.0/2.1 A/AA, Namen, Fokusfalle, Fokus-Rückgabe, semantische Tabs und Touch Targets | keine serious/critical Violations, mobile Ziele ≥ 44 px |
| Performance | V2-Budget, Requests, DOM, CLS, Long Tasks | ≤ 150 KB V2-JS/CSS, ≤ 12 V2-Requests, ≤ 3.000 DOM-Knoten beim Start, CLS ≤ 0,15, Long Tasks gesamt ≤ 1.800 ms |

Die Browser-Suite erzeugt zusätzlich Stock-, Fundamental-, Feed-, Such-, Worlds- und Archetyp-Screenshots auf 320 px, 390 px und 1440 px sowie in Chromium und WebKit. Die zwölf Dateien `390-light-rhythm-01.png` bis `390-light-rhythm-12.png` sind die Evidenz für den Diversity Walk.

## Verbindliche visuelle Kritikmatrix

Jede Zeile erhält `PASS` oder einen konkreten Befund mit Surface, Screenshot und Änderung. Aussagen wie „sieht gut aus“ sind nicht zulässig.

| Perspektive | Prüffrage | FAIL-Beispiele |
| --- | --- | --- |
| First five seconds | Erklären Zahl, Chart und Aktion das Produkt ohne längeren Text? | Landingpage-Eindruck, unklare erste Aktion, Hero unter dem Fold |
| Premium Feel | Wirken Material, Typografie und Abstände präzise und erwachsen? | Bonbonfarben, übergroße Radien, generische Gradient-Karten, dekorative Glows ohne Funktion |
| Scroll Rhythm | Ändern sich Dichte, Größe und Lesetempo erkennbar? | zehn ähnliche Rails oder stets Headline plus dunkle Karte |
| Surface Diversity | Unterscheiden sich Kompositionen und Interaktionen, nicht nur Farben? | identische Kartenstruktur mit anderem Hintergrund |
| Color Worlds | Orientiert die Farbe und bleibt die Textlesbarkeit stabil? | Pastell-Template, beliebige Farbe, Chartfarbe durch Weltfarbe ersetzt |
| Chart Quality | Ist der Chart ruhig, groß und der primäre visuelle Träger? | kleiner Chart in gerahmter Technikbox, zu viele Achsen und Labels |
| Navigation | Bleibt das Dock über Weiß, Farbe und Schwarz lesbar und hochwertig? | bodenbündige Website-Tabbar, Lime-Fläche, fehlender Blur, schwacher Active State |
| Discovery | Ist Swipe als nächste Handlung sichtbar und reagiert direkt? | Sackgasse, schwer treffbare Karte, unerklärte Geste |
| Hierarchie | Erkennt ein Einsteiger zuerst Unternehmen, Bewegung, Zeitraum und Grund? | Methodik vor Bedeutung, Zahlenwüste, konkurrierende Headlines |
| Session Depth | Besitzt jede große Surface einen passenden nächsten Schritt? | tote Story, Ranking ohne Aktienlink, Stock Page ohne ähnliche Titel |
| Return Reason | Sind veränderliche Inhalte ehrlich als solche erkennbar? | behauptetes „Heute“ ohne Datenstand, statische Landingpage-Dramaturgie |

## Abnahmegrenzen

Der automatisierte Fünf-Sekunden-Test ist ein Layout- und Inhaltsheuristik-Test und ersetzt keinen moderierten Test mit neuen Nutzern. „Premium Feel“ bleibt eine visuelle Fachentscheidung; die objektiven Material- und Diversity-Messungen verhindern jedoch, dass sie ohne Belege abgehakt wird. Ein geschlossener Markt kann Darstellung und Fallback prüfen, aber keinen neu eintreffenden regulären Realtime-Tick beweisen.

Discover 1.0 gehört nicht zum Änderungsraum. Sein unveränderter Zustand wird separat durch den Isolation-Gate gegen die dokumentierte Baseline belegt.

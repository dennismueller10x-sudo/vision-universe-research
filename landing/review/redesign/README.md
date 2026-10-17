# Landing-Design zur Abnahme

Diese Fassung wird nicht auf die Hauptdomain veröffentlicht und nicht gemergt. Die Produktionsseite und ihre öffentliche Newsletter-Freigabe bleiben unverändert.

Die Bilder entstehen mit `npm run test:design`. Vorher: unveränderter Repository-Stand `11bda0c1a2a0d8add32ea0338a1ec32dfd8e3f49` vom Beginn der Arbeit, isoliert mit `git archive` geladen; nachher: aktueller Branch. Beide verwenden die identische freigegebene öffentliche Datenschutzdatei und den öffentlichen Formular-Buildmodus, ohne API-Schlüssel oder angebundenen Mailversand. Gleiche Viewports: Desktop 1440 × 900, iPhone 390 × 844 CSS-Pixel, gleiche lokale Schrift, reduzierte Bewegung. Ganze Landingpage und Impressum, erster Viewport von Datenschutz und Bestätigungshinweis. Die zweite Produktkachel wird separat als Viewport aufgenommen: Chromiums Ganzseitenkamera setzt verschachtelte horizontale Scrollpositionen zurück; die Kachel wird deshalb ohne Änderung des Produkt-CSS in ihrer tatsächlichen Viewportposition erfasst. Keine Aufnahme auf einem physischen iPhone.

- [Desktop vorher](before-desktop.png) · [Desktop nachher](after-desktop.png)
- [iPhone vorher](before-iphone.png) · [iPhone nachher](after-iphone.png)
- [Discover-Kachel Desktop](after-desktop-discover.png) · [Discover-Kachel iPhone](after-iphone-discover.png)
- [Impressum vorher](before-imprint-iphone.png) · [Impressum nachher](after-impressum-iphone.png)
- [Datenschutz nachher](after-datenschutz-iphone.png) · [Bestätigungshinweis](after-newsletter-iphone.png)
- [Formular prüft](state-pending-iphone.png) · [Fehlerrückmeldung](state-error-iphone.png) (synthetische Adresse/Antwort; erzeugt durch `npm run test:browser`)
- [Messwerte und Prüfergebnisse](checks.json)

Der Designvertrag prüft Original-CSS, Original-Logo und Fontdateien; Claim und Grün; den prominenten Coming-soon-/Bald-verfügbar-Hinweis und die klare Kennzeichnung der noch nicht verfügbaren App; sichtbaren ersten CTA; drei eigenständige Bereiche, iPhone-Übersicht, horizontal blätterbare Produktkacheln und Newsletter darunter; Seitenbudget und Überläufe in 320/390/768/1440 Pixeln; dunkle Rechts-/Bestätigungsseiten; wortgleichen Inhalt und unveränderte Links aller fünf Unterseiten gegenüber dem Ausgangsstand; Zugänglichkeit der Unterseiten; passende Cache-Versionen; keine externen Anfragen und keine Formular-POSTs beim visuellen Test.

Die bestehenden Browserprüfungen testen separat Eingabefehler, Einwilligung, Honeypot, Offline-Zustand, laufende/fehlgeschlagene/unklare Antworten, geschlossenes/kontrolliertes/öffentliches Formular, ohne JavaScript, 200-%-Textvergrößerung und die Weiterleitung zum Bestätigungshinweis. Antworten sind ausschließlich synthetisch. Der vorhandene reale DOI-/Abmeldetest wird durch eine reine Designänderung nicht wiederholt. Die vorhandenen Server-Schutzprüfungen bleiben vollständig bestehen.

Die neue Reihenfolge lautet **Hero → Produktgalerie → Newsletter**. Die Desktop-Ansicht der Modul-Icons ist durch ein iPhone ersetzt. Eine lokale native Scroll-Snap-Galerie zeigt beide Produktkacheln horizontal statt untereinander. Galerie und innere Discover-Swipes lösen einander nicht aus; zwei getrennte Prüfungen mit echten Chromium-Touch-Ereignissen sichern dies ab. Buttons und Tastatur werden zusätzlich in Chromium/WebKit geprüft. Bei 200-%-Textvergrößerung werden auch Produktüberschriften und Galerienavigation tatsächlich vergrößert; nur die Geräteansichten behalten ihre Bildskala.

Der zuletzt erlaubte Gesamtrahmen für die mobile Höhe bleibt erhalten (iPhone 1688 + 430 = 2118 px, schmal 2000 + 430 = 2430 px); statt dynamischer Zusatzhöhe gilt dieser nun als feste Gesamtgrenze. Desktop bleibt bei 1800 px. Keine Sicherheits-, Einwilligungs-, Touchziel- oder WCAG-Grenzen gelockert.

Die alte Prüfung auf identische Geometrie zum Research-Hero wäre mit der ausdrücklich beauftragten Designentwicklung unvereinbar. Sie ist durch diese überprüfbaren Layout-/Marken-/Rechtstext-Verträge ersetzt; Original-Asset-, Längen-, Sicherheits- und WCAG-Grenzen werden nicht gelockert. Die Research-Anwendung selbst wird nicht bearbeitet.

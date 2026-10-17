# Coming-soon-Design nach freigegebener Bildvorlage

Ein einzelnes zentriertes iPhone mit zehn Original-Produkten in zwei Spalten. Direkt darunter die Anmeldekarte. Der Claim bleibt wortgleich; nur „Weitblick.“ ist grün. Der vollständige Einwilligungstext bleibt erhalten. Keine Kontoeinstellung, Freischaltung oder Newsletter-Technik verändert.

Bilder: `npm run test:design`. Vorher ist der unveränderte Produktions-Quellstand `11bda0c1a2a0d8add32ea0338a1ec32dfd8e3f49`, isoliert mit `git archive`; nachher der aktuelle Branch. Identische öffentliche Formular-Buildkonfiguration und freigegebene Datenschutzdatei, keine API-Schlüssel oder Live-Anmeldung. Desktop 1440 × 900, iPhone 390 × 844, zusätzlich schmaler iPhone-SE-Viewport 375 × 667 CSS-Pixel mit Mobile-/Touch-Emulation. Lokale Originalschrift; keine Aufnahme auf einem physischen Gerät.

- [Desktop vorher](before-desktop.png) · [Desktop nachher](after-desktop.png)
- [iPhone vorher](before-iphone.png) · [iPhone nachher](after-iphone.png)
- [iPhone SE nachher](after-iphone-se.png)
- [Impressum vorher](before-imprint-iphone.png) · [Impressum nachher](after-impressum-iphone.png)
- [Datenschutz nachher](after-datenschutz-iphone.png) · [Bestätigungshinweis](after-newsletter-iphone.png)
- [Formular prüft](state-pending-iphone.png) · [Fehlerzustand](state-error-iphone.png), ausschließlich synthetische Daten
- [Messwerte und Nachweise](checks.json)

Der Designvertrag prüft Original-Logo/Font/Basis-CSS, Claim/Grün, exakt ein zentriertes iPhone, zehn unbeschnittene Produktnamen in zwei Spalten, Formular unmittelbar unter dem Motiv, 44-px-Formular-Touchflächen und 16-px-Eingabeschrift. Viewports 320/375/390/768/1440 Pixel ohne horizontalen Seitenüberlauf. Ursprüngliche Höhenbudgets: Desktop 1800 px, iPhone 1688 px, schmal 2000 px; keine zusätzliche Galeriehöhe.

Der vollständige Formular-DOM ist mit der Basis identisch, einschließlich Einwilligung, Link, Feldern, Vorgaben und Rückmeldungen. Die fünf Rechts-/Bestätigungsseiten werden mit wortgleichem Text und identischen Links verglichen und auf WCAG geprüft. Original-Sprite: [Herkunft](../../reference/product-icons-source.json). Keine externen Anfragen und keine Formular-POSTs im visuellen Vergleich.

Bestehende synthetische Browsertests prüfen weiterhin Fehler, Einwilligung, Honeypot, Offline-Zustand, laufende/fehlgeschlagene/unklare Antworten, geschlossenes/kontrolliertes/öffentliches Formular, Weiterleitung, ohne JavaScript und 200-%-Textvergrößerung. Die überholten Slider-Bedienfälle sind durch Prüfungen der statischen Produktansicht ersetzt. Sicherheits- und WCAG-Gates bleiben bestehen; kein echter Mailtest für die reine Darstellung.

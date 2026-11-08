# Vision Universe Aktienmagazin · Nr. 01 (Muster, 09.11.2026)

30 Seiten A4, Wochenmagazin zur KW 46. Muster mit echten Daten und tagesaktuellen Nachrichten, nicht veröffentlicht.
Vorgänger und Konzept: [`../konzept-2026-11/`](../konzept-2026-11/README.md).

## Aufbau des Hefts

| Seite | Rubrik | Inhalt |
|---|---|---|
| 01 | Cover | Titel „Die KI-Bremse“, Anrisse mit Bild |
| 02 | Editorial, Inhalt | |
| 03–04 | Das war die Woche, Zahlen der Woche | acht Meldungen mit Bild, zwölf Zahlen |
| 05–13 | Titelthema (9 Seiten) | Opener, was passiert ist, was die Daten sagen, sechs Aktien im Stresstest (Nvidia, Micron, Vertiv/Lumentum, Oracle/CoreWeave, AMD), Stimmen und Termine |
| 14 | Anzeige: App (bald verfügbar) |
| 15–16 | Analysen | AppLovin, Palantir |
| 17–18 | Berichtssaison | Gewinner (Airbnb, Idexx, Fiserv, Mosaic), Verlierer (Axon, FIS, DraftKings, Atlassian) |
| 19–20 | Hedgefonds-Radar | Oktober der Fonds, Berkshire, Burry, Insider, 13F aus unseren Daten |
| 21–23 | Aus den App-Welten | Chart der Woche (Technical), Screening der Woche (Screener), Markt-Radar (Regime, Sektoren) |
| 24–26 | Konjunktur, Deutschland, Termine | |
| 27–30 | Aus der App, Quick-Check (22 Aktien) mit Newsletter-Kasten, Impressum mit Hinweisen und Quellenverzeichnis, Rückseite als App-Anzeige |

## Dateien

| Datei | Zweck |
|---|---|
| `pages/NN-*.html` | eine Datei je Seite; Kennzahlen über `data-k` und `VUM.k(...)` |
| `build-data.mjs` | zieht alle Kennzahlen aus den Repo-Artefakten nach `data.js` (Kurse, Fundamentaldaten, Technik, Regime, Screening, Eigentümerdaten, 13F) |
| `lib.js`, `charts.js`, `mag.css` | Bausteine (Datenkasten je Aktie, Kopf- und Fußzeile), Charts im VU-Stil, Druck-Design |
| `render.mjs` | setzt `magazin.html` aus den Seiten zusammen, rendert PDF und PNG und meldet fehlende Bilder, JS-Fehler und Überlauf |
| `img/` | `hf-*`: Higgsfield-Motive aus `brand-media/publishing/image-jobs/` (4 Jobs, zusammen höchstens rund 2,85 USD); `bv-*`: Reel-Bildvorrat |

```bash
node docs/publishing/aktienmagazin-01/build-data.mjs
node docs/publishing/aktienmagazin-01/render.mjs --out /tmp/heft --scale 2
```

## Redaktionsregeln

- Tagesaktuell: jede Geschichte hat einen Anlass aus der Woche. Keine reinen Firmenporträts.
- Zwei Quellen für Zahlen: Vision-Universe-Daten (automatisch, mit Stand) und recherchierte Fakten (Quelle im Quellenverzeichnis, bei Zitaten direkt am Zitat). Widersprechen sich Quellen, steht die Spanne oder die Zahl entfällt.
- Wortwahl nach `docs/legal/WORTWAHL.md`: keine Empfehlungen, kein Kursziel, „Stärken/Schwächen laut Kennzahlen“, Pflicht-Hinweis `editorial`. Zitate übersetzt und gekennzeichnet; Angaben Dritter als solche benannt.
- Bilder: KI-Bilder tragen den Vermerk „KI-Bild“; keine echten Personen, keine fremden Logos im Bild. Charts nur aus Daten.

## Rechtliches (Stand 08.11.2026, keine Rechtsberatung)

- **Impressum** im Heft (Seite 29): Pflicht für periodische Druckwerke (§ 8 LPresseG BW) und journalistisch-redaktionelle Angebote online (§ 18 Abs. 2 MStV), mit verantwortlicher Person. Text ist ein Entwurf; Rechtstexte brauchen die Owner-Freigabe (CLAUDE.md).
- **Quellen:** keine allgemeine Pflicht, jede Zahl zu belegen. Pflicht ist die Quellenangabe bei wörtlichen Zitaten (§ 63 UrhG): Sprecher und Medium stehen direkt am Zitat. Übrige Quellen gesammelt im Quellenverzeichnis auf Seite 29 statt in jeder Fußzeile.
- **Keine Empfehlung:** Pflicht-Hinweis `editorial`/`footer` aus `assets/legal-notices.json` auf Seite 29, Fußzeile „Keine Anlageberatung“ auf jeder Seite.
- **KI-Bilder** mit „KI-Bild“ gekennzeichnet (Transparenz, Art. 50 KI-Verordnung); Hinweis zur KI-unterstützten Entstehung im Impressum.
- **Eigenwerbung** für die eigene App braucht keine Kennzeichnung als Anzeige (Kennzeichnungspflicht gilt für bezahlte Fremdwerbung); sie ist gestalterisch klar vom redaktionellen Teil getrennt.

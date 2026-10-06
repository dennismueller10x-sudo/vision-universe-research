# ChatGPT Work – Output-Vertrag für Carousels

Stand 03.10. · Owner-Entscheidung: drei Bilder in EINEM Auftrag (MULTI_ASSET)

## Die gemessene Grenze

Der Vertrag des automatisierten ChatGPT-Work-Agenten steht **außerhalb dieses
Repositorys** (in der Work-Automation des Owners). Was er zulässt, ist an
echten Läufen gemessen:

| Lauf | Befund |
|---|---|
| PR #299 | Nur `FULL_CREATIVE` und `TEXT_REVISION` werden angenommen. |
| PR #300 | `FULL_CREATIVE` verlangt ein Top-Level-Feld `visual_strategy` und erlaubt **ein** Asset: `assets/visual-01.png`. |
| PR #303 | Ein Bogen mit drei 4:5-Paneelen scheitert: Die eingebaute Bildgenerierung lieferte zweimal **1942×809** statt 3240×1350. |
| PR #296 | Auch ein Einzelbild kommt in den Maßen des Werkzeugs (1092×1440), nicht exakt 1080×1350. |

Daraus folgt:

- Drei echte Slides passen **nicht** in einen Auftrag des aktiven Vertrags.
- Drei Slides auf einer Leinwand sind kein Ausweg: Die Maße sind nicht
  steuerbar, und es wären drei Mini-Posts statt eines Carousels.

## Was jetzt gilt: COVER_FIRST

`social/config/work-agent.json` → `"delivery_mode": "COVER_FIRST"`

Ein Work-Auftrag besitzt weiterhin den ganzen Beitrag:
- Recherche, Story, Hook, Caption und Hashtags
- die Dramaturgie **aller** Slides (`carousel_plan`: `headline_de`,
  `key_content` und `visual_concept` je Slide)

Er liefert **ein** Bild: das Cover (Slide 1), vollendet.

Im Approval Center erscheint es als Einzelbild. Freigegeben wird die
Richtung am Cover. Die Owner-Direktive lautet: Qualität vor Carousel-Mechanik.

## Der Weg zu drei Slides: MULTI_ASSET

Vorbereitet ist bereits `"delivery_mode": "MULTI_ASSET"`. Dann verlangt der
Brief je Slide eine eigene Datei:

- `assets/slide-01.png`
- `assets/slide-02.png`
- `assets/slide-03.png`

Die Pipeline (Prüfung, Kandidat, Carousel-Publishing) kann das schon.

**Nötige Owner-Aktion** (einmalig, in der ChatGPT-Work-Automation): Den
Vertrag so erweitern, dass ein `FULL_CREATIVE`-Auftrag mit
`creative_format: CAROUSEL` statt nur `assets/visual-01.png` die Pfade aus
`asset_requirements.deterministic_paths` schreiben darf. Das sind drei bis
vier Dateien `assets/slide-0N.png`, je Datei mit denselben Transportfeldern
(Pfad, Maße, Bytes, SHA-256, `brand_elements`).

Danach in `social/config/work-agent.json` setzen:

- `"delivery_mode": "MULTI_ASSET"`
- `"multi_asset_contract": true`

Weitere Code-Änderungen sind nicht nötig.

## Die Referenzbilder

Die vier Owner-Beispiele liegen unter `social/brand/style-references/`.
Sie liegen damit im selben Checkout wie der Brief, genauso wie Logo und Atlas.

Zwei Messungen, keine Behauptung:

- **`REFERENCE_IMAGES_DELIVERED_TO_WORK`**: Beim Schreiben des Briefs wird
  jede Datei per SHA-256 gegen `manifest.json` geprüft. Das Ergebnis steht im
  Brief unter `style_references.delivered_in_checkout`.
- **`REFERENCE_IMAGES_SEEN_BY_WORK`**:
  - Work nennt je Referenz die dominanten Textzeilen wörtlich
    (`style_references_check`).
  - Verglichen wird gegen Hashes von Wörtern, die nur im Bild stehen.
    Im Checkout liegt kein Klartext, den Work stattdessen ablesen könnte.
  - Das Ergebnis steht am Kandidaten unter
    `presentation.styleReferences`.


## Umgestellt am 03.10.: MULTI_ASSET

`social/config/work-agent.json` steht auf `"delivery_mode": "MULTI_ASSET"`.

Ab dem nächsten Auftrag verlangt der Brief drei finale 4:5-Bilder in einem Auftrag:
- `assets/slide-01.png`: Hook
- `assets/slide-02.png`: Key Insight mit Headline
- `assets/slide-03.png`: Einordnung mit Headline

Text im Bild ist auf jedem Slide Pflicht.

### Der Satz für die ChatGPT-Work-Automation

In den Anweisungen der Automation steht sinngemäß, dass ein `FULL_CREATIVE`-Auftrag genau ein Bild unter `assets/visual-01.png` schreibt. Diese Regel durch Folgendes ersetzen:

> Bei `FULL_CREATIVE` gilt: Schreibe die Bilddateien genau unter den Pfaden, die der Brief vorgibt. Bei `asset_requirements.deterministic_path` (Einzahl) ist das ein Bild. Bei `asset_requirements.deterministic_paths` (Mehrzahl, `creative_format: CAROUSEL`) ist das ein Bild je Slide in der Reihenfolge des `carousel_plan`, Standard drei: `assets/slide-01.png`, `assets/slide-02.png`, `assets/slide-03.png`. Erzeuge die Bilder nacheinander im selben Auftrag. Melde jede Datei als eigene `visual_variants`-Eintragung mit `slide_index`, `asset_path`, `mime_type`, `width`, `height`, `asset_byte_size`, `asset_sha256` und `brand_elements`. Committe alle Bilder zusammen mit `authoring-result.json` in einem Commit.

### Falls Work es trotzdem ablehnt

Der Abgleich schließt den Auftrag automatisch (`AGENT_ABBRUCH_GEMELDET`), es bleibt nichts hängen.

Zurück zum Cover-Weg: in `social/config/work-agent.json` `"delivery_mode": "COVER_FIRST"` setzen.

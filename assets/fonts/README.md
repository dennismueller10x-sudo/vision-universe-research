# Schriften

## `inter-latin.woff2`

| | |
|---|---|
| Schrift | Inter (variabel, Gewichte 100–900) |
| Ausschnitt | lateinisch, `U+0000–00FF` und Nachbarschaft |
| Bezogen von | `https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` |
| Bezogen am | 2026-09-16 |
| Lizenz | SIL Open Font License 1.1 — erlaubt Einbettung und Weitergabe |
| Größe | 48 256 Bytes |

### Warum die Datei hier liegt und nicht geladen wird

`scripts/social/render-asset.mjs` zeichnet Beitragsbilder. Würde die
Schrift bei jedem Lauf aus dem Netz geholt, hinge das Aussehen eines
Beitrags an der Erreichbarkeit eines fremden Dienstes — und dasselbe
Paket ergäbe mal ein Bild mit Inter, mal eines mit der systemeigenen
Grotesk.

Das wäre kein Rückfall, sondern **zwei verschiedene Bilder unter einer
Kennung**. Der Renderer bricht deshalb ab, wenn diese Datei fehlt,
statt anders zu zeichnen.

`scripts/social/make-test-asset.mjs` lädt weiterhin aus dem Netz. Das
Skript erzeugt genau ein Bild und sagt ausdrücklich an, wenn es
zurückgefallen ist; dort ist der Kompromiss vertretbar.

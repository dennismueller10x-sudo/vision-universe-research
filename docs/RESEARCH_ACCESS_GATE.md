# Einfacher Research Development-/Marketing-Gate

Diese clientseitige Schranke ist bewusst kein Authentifizierungs- oder
Autorisierungssystem. Technisch versierte Nutzer können den ausgelieferten
Prüfwert analysieren, den Browser-State verändern oder Originaldateien und Daten
direkt abrufen. Sie ist für die Entwicklungs-/Marketingphase vorgesehen.

Es werden keine Cloudflare-Ressourcen, Routes, DNS-Einträge oder Secrets verändert
oder benötigt. Der ungenutzte `vu-research-access` Worker kann bestehen bleiben.

## Einmaliges GitHub Secret

GitHub → Repository `dennismueller10x-sudo/vision-universe-research` → Settings →
Secrets and variables → Actions → New repository secret:

```text
RESEARCH_ACCESS_PASSWORD
```

Den gewünschten gemeinsamen Passwortwert dort eingeben, niemals im Chat,
Repository oder Workflow-Code. Ein Secret im Cloudflare-Worker reicht hier nicht.
Ohne dieses GitHub-Secret stoppt der Produktionsbuild vor dem Upload. Nach dem
Anlegen den Pages-Release erneut ausführen. Der Wert wird nur beim Gate-Build
verwendet; ausgeliefert wird ausschließlich ein PBKDF2-SHA-256-Prüfwert mit
210.000 Iterationen und einem öffentlichen, anwendungsspezifischen Salt.

## Zentrale Integration

Der bestehende Produktbuild, alle Datenpipelines und Produktdateien bleiben
unverändert. Nach dem Produktbuild und dessen bestehenden Prüfungen verpackt
`scripts/access-gate/build.mjs` **alle** HTML-Seiten des Release-Artefakts,
einschließlich `404.html` und zukünftiger HTML-Unterseiten, in dieselbe Maske.
App-Markup und App-Scripts werden erst nach der Freigabe nachgeladen. Die
Originaldokumente liegen unter `__research/content/`, werden am ursprünglichen
URL ausgeführt und behalten Query, Hash, relative Assets und Script-Reihenfolge.
Diese Originaldateien sind keine geschützte API und bleiben technisch abrufbar.

Bestehende Links und 404-Verhalten bleiben bestehen. Nicht vorhandene Routen
werden durch diese Änderung nicht zu neuen Produktseiten. Die vorhandene
Aktien-Detailseite ist beispielsweise `/quant/#/aktie/NVDA`.

## Freigabe und Logout

Ein gemeinsamer LocalStorage-Eintrag `vu.research.access.v1` speichert Prüfwert
und Ablaufzeit für 30 Tage. Alle Produkte auf derselben Domain verwenden ihn.
Er bleibt bei Reload, Seitenwechsel und Browser-Neustart erhalten. Browser müssen
Website-Daten erlauben. Private Browsersitzungen können Daten beim Schließen
löschen. Normale Daten-Releases ändern den Prüfwert nicht und melden niemanden
ab; ein Passwortwechsel macht alte Freigaben ungültig.

`/__research/logout` löscht ausschließlich diesen LocalStorage-Eintrag und
öffnet die Passwortmaske. Andere App-Einstellungen und Cookies bleiben erhalten.

## Prüfung

```sh
node --test scripts/access-gate/build.test.mjs
PLAYWRIGHT_PATH=/path/to/playwright node scripts/access-gate/browser-qa.mjs
```

Die Browser-QA baut mit einem zufälligen Testpasswort und prüft Chromium und
iPhone/WebKit. Produktions-Secrets werden dabei weder benötigt noch ausgegeben.
Der bestehende Produktions-Smoke wird nach der Verpackung zusätzlich mit
`--access-gate` ausgeführt. Diese Testoption setzt ausschließlich im Testbrowser
den dokumentierten Client-State und benötigt kein echtes Passwort.

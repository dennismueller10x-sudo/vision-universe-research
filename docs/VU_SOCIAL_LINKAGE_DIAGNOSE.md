# VU SOCIAL — WARUM DER CALLBACK `noInstagramAccount` MELDETE

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`

Der Facebook Login for Business ist real durchgelaufen. Der Owner hat im Dialog
ausdrücklich ausgewählt:

- Facebook-Seite: **Vision Universe**
- Instagram-Konto: **visionuniverse.aktienreports**
- Modus jeweils: nur aktuelle Konten/Seiten

Meta hat vier Rechte bestätigt und die Verknüpfung ausdrücklich gemeldet. Der
Callback antwortete trotzdem `noInstagramAccount`.

---

## 1. Die Ursache steht NICHT fest — und das ist der Befund

Das ist keine Ausflucht. Es ist das Ergebnis, und es hat einen benennbaren
Grund im eigenen Code.

`noInstagramAccount` wurde in **zwei völlig verschiedenen Lagen** gemeldet:

| | Was die API sagte | Wo die Ursache liegt |
|---|---|---|
| (a) | `/me/accounts` lieferte **gar keine** Seite | im Login-Dialog / bei der Asset-Auswahl |
| (b) | Seiten geliefert, aber keine mit `instagram_business_account` | in der Instagram-Verknüpfung |

Beide Lagen trugen denselben Namen und dieselbe Meldung. Eine Meldung, die zwei
Ursachen zusammenwirft, schickt den Owner mit halber Wahrscheinlichkeit an die
falsche Stelle.

Schlimmer: der Abbruch **verwarf die Antwort**. Der Autorisierungscode ist nach
einem Versuch verbraucht, das Token wurde nie gespeichert, und damit ließ sich
hinterher nicht mehr feststellen, welcher der beiden Fälle vorlag.

Die Meldung behauptete außerdem etwas, das der Abruf nicht hergab: *„In der
Meta-Business-Suite muss das Instagram-Konto ein Professional-Konto sein"* — das
ist eine Diagnose, keine Beobachtung. Der Owner-Bericht widerspricht ihr direkt:
der Dialog hat das Konto als auswählbar geführt.

---

## 2. Was jetzt gemessen wird, statt geraten

Alles davon passiert **während das Token noch in der Hand ist** — also im
Moment des Fehlschlags, nicht in einem zweiten Anlauf.

### `debug_token` → `granular_scopes`

Bei einer Business-Anmeldung wählt der Nutzer einzelne Assets aus. **Welche das
waren, steht nicht im Token und nicht in `/me/permissions`** — dort steht nur,
*welche Rechte* erteilt wurden, nicht *für welche Assets*.

`granular_scopes` beantwortet genau das: pro Recht eine Liste von `target_ids`
([Debug Token, Graph API Reference](https://developers.facebook.com/docs/graph-api/reference/debug_token/)).

Das trennt die erste Frage sauber: *hat der Nutzer die Seite überhaupt
freigegeben?*

### Feldprobe pro Seite

`instagram_business_account` ist das Feld, das die Dokumentation nennt — aber
nicht zwingend das einzige, über das eine Seite mit einem Instagram-Konto
verbunden ist. Welches gefüllt ist, hängt daran, **wie** die Verknüpfung
entstanden ist, und das lässt sich von außen nicht ansehen.

Deshalb fragt der Worker die API, statt zu raten. Drei Felder, **einzeln**
abgefragt:

```
instagram_business_account
connected_instagram_account
page_backed_instagram_accounts
```

Einzeln, weil ein Feld, das diese API-Version nicht kennt oder das dieser Zugang
nicht lesen darf, in einer Sammelabfrage die **ganze** Antwort kippen würde.
Einzeln kostet es nur eine Fehlermeldung, die protokolliert wird.

### Der Befund landet auf der Abbruchseite

Kennungen und Ja/Nein-Werte — nie ein Token. Ein Test (L4) prüft ausdrücklich,
dass die Page-Tokens aus `/me/accounts` nicht in den Bericht wandern.

**Ein Fehler, der sagt was er gesehen hat, kostet einen Versuch. Einer, der es
nicht sagt, kostet beliebig viele.**

---

## 3. Was geprüft und ausgeschlossen wurde

| Frage | Antwort | Beleg |
|---|---|---|
| Erwartet der Worker ausschließlich `instagram_business_account`? | **Ja** — das war so | Code, jetzt behoben |
| Ist Graph API v21.0 abgelaufen? | **Nein**, läuft bis 2027-01-21 | [Versionsplan](https://singhamandeep.com/meta-graph-api-version-deprecation/) |
| Reichen die vier erteilten Rechte für `/me/accounts`? | **Ja** — `pages_show_list` ist erteilt | `/me/permissions` im Callback |
| Braucht es eine zusätzliche Berechtigung? | **Nicht belegbar** — und ohne Beleg wird keine angefordert | — |

Zur letzten Zeile: eine Permission auf Verdacht hinzuzufügen würde den Owner
durch einen weiteren Dialog schicken und im Erfolgsfall nicht einmal zeigen,
*warum* es dann ging. Der Befund aus §2 entscheidet das mit Daten.

---

## 4. Die Ziel-Allowlist

Ein Autorisierungsdialog zeigt alles, worauf der angemeldete Mensch Rechte hat —
private Konten, Konten anderer Projekte, alte Seiten. Ein Fehlgriff dort fällt
erst auf, wenn ein Beitrag am falschen Ort steht. Dann ist er veröffentlicht.

```toml
META_IG_ALLOWED_USERNAMES = "visionuniverse.aktienreports"
```

Ein Konto, das nicht daraufsteht, wird **gar nicht erst gespeichert** und kann
damit nie Publishing-Ziel werden. Geprüft vor dem Speichern, nicht vor dem
Posten — die Sperre sitzt an der Stelle, an der das Ziel entsteht.

Handle und numerische ID lassen sich kombinieren. Der Handle ist heute bekannt,
die ID erst nach der ersten erfolgreichen Auflösung; dafür lässt sich eine ID,
anders als ein Handle, nicht umbenennen. Sobald sie bekannt ist, gehört sie
eingetragen. Sind beide gesetzt, müssen **beide** passen — passt der Handle, aber
nicht die ID, ist irgendwo etwas vertauscht, und das soll auffallen.

Sechs Tests (A1–A6) halten das fest, darunter der Fall, um den es geht: ein
privates Konto, versehentlich im Dialog gewählt, wird abgewiesen und der Bericht
nennt, was statt dessen gefunden wurde.

---

## 5. Was der nächste Login liefert

Genau eine der folgenden Antworten — und jede sagt, wo es weitergeht:

| Befund | Bedeutung |
|---|---|
| Verbindung steht | Es lag am Feld. Behoben. |
| `noPagesVisible`, `granular_scopes` ohne Page-ID | Die Seite wurde im Dialog nicht freigegeben. Owner-Aktion im Dialog. |
| `noPagesVisible`, `granular_scopes` **mit** Page-ID | Freigegeben, aber nicht sichtbar. Das wäre ein echter Meta-Befund — mit Beleg. |
| `noInstagramAccount` + Probe findet ein anderes Feld gefüllt | Die Verknüpfung läuft über dieses Feld. Resolver erweitern, eine Zeile. |
| `noInstagramAccount` + alle drei Felder leer | Die Verknüpfung Seite ↔ Instagram ist tatsächlich unvollständig. Dann, und erst dann, ist es eine Owner-Aktion in der Business-Suite. |

Es ist **kein** Widerruf und keine Neuverknüpfung nötig. Die bestehende
Meta-Autorisierung bleibt, wie sie ist.

---

## 6. Nachtrag: der Befund lag vor, die Ursache stand fest

2026-09-16, zweiter realer OAuth-Lauf. Meta hat die bestehende Autorisierung
wiederverwendet und direkt zum Callback zurückgeleitet.

```
reason: noPagesVisible
pages:  []
granular_scopes:
  pages_show_list            -> target_id der Vision-Universe-Seite
  instagram_basic            -> Instagram-target_id
  instagram_manage_insights  -> dieselbe Instagram-target_id
  instagram_content_publish  -> dieselbe Instagram-target_id
linkageProbe: null
```

Das ist die dritte Zeile aus der Tabelle in §5: **freigegeben, aber über
`/me/accounts` nicht sichtbar.** `linkageProbe` blieb `null`, weil es keine Seite
gab, die man hätte befragen können — die Probe hängt an `pages[0]`.

### Warum `/me/accounts` leer ist

Es zählt die Seiten auf, die der angemeldete Mensch **als Person** verwaltet.
Beim Business Login mit gezielter Asset-Auswahl entsteht der Zugriff aber nicht
über diese persönliche Liste, sondern als **Freigabe am Token**. Beides sind
gültige Wege zu einer Seite — nur führt der zweite nicht durch `/me/accounts`.

Der Resolver kannte nur den ersten. Das war die Ursache, und sie war es von
Anfang an: auch der erste Lauf hätte so geendet.

### Der neue Pfad

1. `/me/accounts` wie bisher — es liefert das Seiten-Token gleich mit und deckt
   den klassischen Weg ab. Es ist nur nicht mehr die **einzige** Quelle.
2. Bleibt es leer, werden die Assets aus `granular_scopes` gelesen.

**Eine `target_id` wird dabei nicht einfach übernommen.** Sie ist eine Zahl aus
einer Antwort: sie sagt, dass *irgendetwas* freigegeben wurde — nicht, dass es
das richtige Konto ist, nicht einmal, dass es ein Instagram-Konto ist.

| Hürde | Was sie ausschließt |
|---|---|
| Alle drei Instagram-Rechte müssen **dieselbe Menge** nennen | eine ID aus einem einzelnen Recht wäre nur eine Behauptung |
| Die ID wird bei der API gegengeprüft: sie muss sich selbst zurückmelden **und** einen Handle haben | eine verwechselte oder erfundene ID |
| Der Handle geht gegen die Allowlist | ein fremdes Konto, versehentlich freigegeben |

Der Reihenfolgevergleich ist mengenbasiert — die drei Rechte dürfen ihre IDs in
beliebiger Reihenfolge nennen, ohne falschen Alarm auszulösen (N9).

Die **Seite ist ein eigenes Asset** und wird getrennt aufgelöst. Sie liefert das
Seiten-Token, nicht die Instagram-ID. Schlägt ihre Auflösung fehl, ist die
Instagram-Verbindung trotzdem belegt — eine fehlende Seite darf ein belegtes
Konto nicht entwerten.

### Eine zweite Korrektur, die daraus folgte

Ein fehlendes Seiten-Token war bisher ein harter Abbruch. Das war zu streng: das
langlebige **Nutzer-Token** trägt bei einer Business-Anmeldung
`instagram_content_publish` für genau dieses Konto. Es funktioniert — es läuft
nur nach rund 60 Tagen ab.

Jetzt: Seiten-Token bevorzugen, sonst Nutzer-Token **mit vermerktem
Ablaufdatum**. Der Lebendtest prüft genau das Token, das danach gespeichert wird
— sonst prüfte er etwas anderes als das, was später benutzt wird.

### Reichen die vier Permissions?

**Ja.** Die granularen Scopes stammen aus genau diesen vier Rechten — sie sind
der Beleg, nicht das Fehlende. Es wurde keine Permission hinzugefügt.

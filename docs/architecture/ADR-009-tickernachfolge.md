# ADR-009 · Tickernachfolge: die alte securityId bleibt die ID der Historie

Stand 17.11.2026 (Quant, Entscheidung Steuerung). Modul `core/ticker-succession.js`, Register `quant/config/ticker-successions.json`, Tests `core/tests/ticker-succession.test.mjs` (TS) und EG-10.

## Anlass

Texas Capital Bancshares (CIK 0001077428) handelt seit dem 09.11.2026 als TXCP statt TCBI (8-K 0001077428-26-000061, Item 3.01). Tiingo führt TCBI nicht mehr (404) und TXCP erst ab dem 11.11. Die Kurse bis zum 06.11. liegen nur noch in unserer eigenen Ablage unter `ref_TCBI`. Ohne Verbindung beginnt TXCP mit vier Kerzen, und die Historie geht verloren. Weitere Fälle derselben Art stehen in `docs/data/security-master/V130_G7_CANONICAL_EVIDENCE.md` (ADIL → AZR, LRHC → SRTM, QNCX → IRLA, FGNX → FGC).

## Entscheidung

- **Neben ADR-001, nicht darin.** `core/identity.js` bildet die `securityId` aus dem Ticker und bleibt byte-gleich: Supertrader pinnt ihren Hash, und `ref_<TICKER>` ist absichtlich nicht stabil bei einer Tickeränderung. Die Nachfolge ist eine zweite, kleine Regel daneben, nach dem Muster von `core/issuer-alias.js` (CIK-Nachfolge).
- **Die alte ID bleibt die ID der Kurse bis zum Stichtag, die neue führt die Notierung weiter.** Gespeicherte Reihen werden weder umbenannt noch kopiert. Verbraucher verbinden beim Lesen: Vorgänger-Bars strikt vor dem Stichtag, eigene Bars ab dem Stichtag (`joinBars`). Eine Handelslücke bleibt eine Lücke.
- **Regel: gleiche CIK und Beleg Pflicht.** Ein Eintrag nennt alte und neue ID samt Ticker, Stichtag, CIK und einen Beleg (SEC-8-K mit Accession oder Börsenmeldung), eingereicht vor dem Stichtag. Das Modul lehnt Einträge ohne Beleg, Ketten, Zyklen und doppelte Zuordnungen ab (fail closed). Das Eignungs-Gate prüft beim Austausch die CIK beider Ticker gegen die CIK-Karte; fehlt sie oder weicht sie ab, ist es rot.
- **Universum:** Geht der Vorgänger im selben Eignungslauf und kommt seine registrierte Nachfolgerin, ist das ein Austausch derselben Aktie. Das Eignungs-Gate zählt ihn nicht gegen `universeMembersChanged` und nennt ihn unter `successionReplacements` (EG-10).

## Verbraucher (erster Schritt)

| Verbraucher | Wirkung |
|---|---|
| `publish-discover-series.mjs` (Discover-Reihe, 1 Jahr) | Nachfolger trägt die Vorgänger-Bars vor dem Stichtag |
| `publish-long-series.mjs` (Wochenreihe) | dasselbe aus der dauerhaften Ablage |
| `eligibility-gate.mjs` (Universum) | registrierter Austausch zählt nicht als Mitgliederwechsel |

Faktorhistorie, Aktienseite und Weiterleitung alter Links folgen, wenn der Nachfolger im Stamm steht (TXCP: eigener Schritt, Hauptbörse TXSE). Die vier Altfälle kommen einzeln dazu, jeweils mit 8-K.

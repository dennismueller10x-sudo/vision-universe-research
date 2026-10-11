# Stimmenauswahl LEA und DAVID (nur HeyGen)

Stand 2026-10-11. **Es wurde keine endgültige Voice-ID gespeichert.** Auswahl und Freigabe liegen beim Auftraggeber. Nur HeyGen-Stimmen (Engine `orca`), keine externen Anbieter, keine Voice-Clones.

## Vorgehen
1. Katalog `GET /v3/voices?language=German&gender=…` vollständig gelesen (861 weibliche, 891 männliche Einträge mit Sprachfilter „German“; die meisten sind mehrsprachige Stimmen, nur die ersten ≈ 20–45 je Geschlecht sind deutschsprachig kuratiert).
2. **Voice Design** (`POST /v3/voices`, kostenlos, deterministisch): liefert für Deutsch nur englischsprachig gelabelte „German accent“-Stimmen bzw. keine männlichen Treffer ⇒ nicht verwendbar.
3. Kostenlose Vorschauen der kuratierten deutschen Stimmen auf Tonhöhe (F0) und Intonationsspanne vermessen (autokorrelationsbasiert, **Näherung**). Zielbereich LEA: F0 ≈ 170–225 Hz, moderate Spanne (nicht monoton, nicht überbetont); DAVID: ≈ 110–140 Hz. Stimmen mit Emotions-/Werbe-/Nachrichten-Zusätzen („Excited“, „Friendly 😊“, „Newscaster“, „Bedtime“) ausgeschlossen.
4. Für die Kandidaten die **Hörproben mit identischem Testsatz** erzeugt: `POST /v3/voices/speech`, `engine: orca`, 8 Audios.
5. Automatische Spracherkennung (Parakeet, Deutsch) als Verständlichkeitscheck.

**Wichtig:** Ich kann Klang, Natürlichkeit und „Passt zur Person“ nicht hören. Die Auswahl stützt sich auf Metadaten, Tonhöhe/Spanne und ASR. Entscheidend ist deine Hörprobe.

Testsatz: „Drei Aktien zeigen heute besondere Stärke. Doch welche davon überzeugen wirklich? Andere raten. Du verstehst.“

## LEA (5 Kandidaten)
| # | Name | Voice-ID | F0 | Spanne (Halbton) | ASR | Datei |
|---|---|---|---|---|---|---|
| 1 | Susi | `3be7fbe93bb14a16b14ecb3a6082fedf` | 197 Hz | 3,5 | 15/15, klare Satzpause | `voices/samples/LEA_1_Susi.mp3` |
| 2 | Pleasant Petra | `897e08ae92a54e2f9178ae074120262b` | 219 Hz | 2,7 | 15/15, klare Satzpause | `…LEA_2_Pleasant_Petra.mp3` |
| 3 | Greta Stein | `2347d5abd10f4a0c85a5b13eb24c6c39` | 190 Hz | 2,6 | 15/15 | `…LEA_3_Greta_Stein.mp3` |
| 4 | Sylvia – Warm & Friendly | `41021db5177e42bbb5d025db36f8ac46` | 223 Hz | 3,2 | 15/15 | `…LEA_4_Sylvia.mp3` |
| 5 | Liberty X | `24ce8c26e4b24adb9e9d6b17a782bc7d` | 172 Hz | 3,6 | 15/15 | `…LEA_5_Liberty.mp3` |
Zum Vergleich die abgelehnte Stimme „Lea“ (`becf484d…`): F0 178 Hz, Spanne 4,3 (Vorschau). Die Tonhöhe allein erklärt die „künstliche“ Wirkung also nicht.

## DAVID (3 Kandidaten)
| # | Name | Voice-ID | F0 | Spanne | ASR | Datei |
|---|---|---|---|---|---|---|
| 1 | Nero – Thoughtful & Clear | `ef0632945bc64e3b888bd83a50363671` | 132 Hz | 2,7 | 15/15, klare Satzpause | `…DAVID_1_Nero.mp3` |
| 2 | Mordecai – Serious & Composed | `d284344a1ba04039bdfdede36a319f32` | 120 Hz | 3,6 | 15/15, klare Satzpause | `…DAVID_2_Mordecai.mp3` |
| 3 | Quiet Dieter | `45535f795f41425fa45e58ad66687d4d` | 125 Hz | 3,7 | 15/15 | `…DAVID_3_Quiet_Dieter.mp3` |
Verworfen: Reserved Rainer (ASR hörte „Andere **Daten**“, 14/15). Nicht nutzbar für Standalone-Sprache: Stimmen mit leerer Engine-Liste (Gemini-/„Natural“-Stimmen, z. B. Gacrux, Louisa, Fabian) und Otto Müller (Engine nicht verfügbar) – ob sie im Video-Endpunkt laufen, ist ungetestet.

## Kosten
Wallet 14,88 → 14,72 USD für 9 erzeugte Audios (je ≈ 0,01–0,02 USD, Wallet-Anzeige gerundet); fehlgeschlagene Anfragen kosteten nichts. Voice Design, Katalog, Vorschauen: 0 USD.

## Nächster Schritt nach deiner Wahl
Voice-ID in `registry/avatar-registry.json` festschreiben (`voiceProvider: heygen`, `voiceId`, `voiceVersion` 1.0.0), per `PATCH /v3/avatars/{group}` als Default-Stimme setzen (`update_avatar_group`) und erst dann Avatar-V-Dialoge für den Trailer generieren. Hinweis: Katalogstimmen können sich ändern; Audios pro Skript-Hash cachen (siehe `VOICE_SYSTEM.md`).

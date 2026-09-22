/* =========================================================================
   FIXTURE — USD/EUR-Tagesreihe fuer die Tests des Currency Layers.

   WICHTIG: das sind KEINE Produktionsdaten und geben nicht vor, welche zu
   sein. Die Werte sind plausibel geformt (Niveau um 0,82 bis 0,86, taegliche
   Bewegung im Promillebereich), aber erzeugt. Der Zweck ist, die REGELN zu
   pruefen - Stichtag, Wochenende, Feiertag, Periodenmittel, Fallback -,
   nicht die Richtigkeit eines bestimmten Kurses.

   Die Trennung ist absichtlich scharf: ein Test, der mit erfundenen Kursen
   laeuft und dabei aussieht, als pruefe er echte, ist schlimmer als kein
   Test. `source: "fixture"` reist deshalb durch jede Antwort bis in den
   Money-Vertrag - wer einen Produktionswert mit source "fixture" sieht,
   weiss sofort, dass etwas falsch verdrahtet ist.

   Der Nachweis an echten Kursen ist ein eigener Lauf:
   scripts/quality/verify-currency-layer.mjs, und der braucht eine
   qualifizierte FX-Quelle.
   ========================================================================= */

/* Deterministisch erzeugt: ein glatter Verlauf von 0,8200 (Anfang 2021) auf
   0,8528 (Sep 2026) mit einer kleinen Wochenschwingung. Handelstage
   Montag bis Freitag; Wochenenden fehlen, wie in echten Reihen. */
export function buildUsdEurSeries(from = "2021-01-01", to = "2026-09-21", holidays = []) {
  const skip = new Set(holidays);
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  const span = end - start;
  const rows = [];
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;              // Wochenende
    const iso = d.toISOString().slice(0, 10);
    if (skip.has(iso)) continue;                        // Feiertag
    const progress = (t - start) / span;
    const wave = Math.sin(progress * Math.PI * 14) * 0.006;
    rows.push([iso, Number((0.8200 + progress * 0.0328 + wave).toFixed(6))]);
  }
  return rows;
}

/* Ein kurzer Ausschnitt mit von Hand nachrechenbaren Werten - fuer die
   Tests, in denen der erwartete Betrag im Test stehen soll und nicht aus
   derselben Funktion kommt, die geprueft wird. */
export const EXPLICIT = [
  ["2021-06-29", 0.8400],
  ["2021-06-30", 0.8200],   // Bilanzstichtag Q2
  ["2021-07-01", 0.8300],
  ["2021-07-02", 0.8500],   // Freitag
  // 2021-07-03 Samstag, 2021-07-04 Sonntag, 2021-07-05 Feiertag (US)
  ["2021-07-06", 0.8600]
];

export const HOLIDAYS_2021 = ["2021-01-01", "2021-07-05", "2021-12-24", "2021-12-31"];

/* WEEKLY TOTAL RETURN (weekly-total-return-1.0.0)

   Aus einer bestaetigten Tages-Gesamtrendite (adjustedClose, freigegeben in
   return-semantics-v1: TOTAL_RETURN_CONFIRMED) wird je Kalenderwoche der
   Wert des LETZTEN Handelstags genommen - dieselbe Wochensemantik wie die
   splitbereinigten Wochenreihen (discover-series-long). Keine neue Quelle,
   keine Glaettung: Dividenden, Splits und Sonderausschuettungen stecken
   bereits im Tageswert; ein Wochenwert ist nur eine Stichprobe davon.

   weekKey(date)        Freitag derselben Kalenderwoche
   weeklyFromDaily(dates, values, weekIndex, W)   Float64Array(W), NaN wo keine Woche */
const DAY = 86400000;
export const WEEKLY_TOTAL_RETURN_VERSION = "weekly-total-return-1.0.0";

export function weekKey(date) {
  const d = new Date(date + "T00:00:00Z"), dow = d.getUTCDay();
  return new Date(d.getTime() + ((5 - dow + 7) % 7 - (dow === 6 ? 7 : 0)) * DAY).toISOString().slice(0, 10);
}

export function weeklyFromDaily(dates, values, weekIndex, W) {
  const out = new Float64Array(W).fill(NaN);
  for (let i = 0; i < dates.length; i++) {
    const w = weekIndex.get(weekKey(dates[i]));
    if (w === undefined || !(values[i] > 0)) continue;
    out[w] = values[i]; /* aufsteigende Daten: der letzte Handelstag der Woche gewinnt */
  }
  return out;
}

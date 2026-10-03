/* Tageskerzen fuer Gesamtrendite-Tests (canonical-total-return-1.0.0).

   Aus einer Kursreihe [[date, value], ...] (als Rohkurs genommen) wird eine
   Kerzenreihe mit echten Ausschuettungen im dividend-Feld und einer
   Anbieterspalte nach Anbieterkonvention (Rueckwaertsfaktor P_t/(P_t + D_t), wie Tiingo).
   Der Rohkurs bleibt die gegebene Reihe; die Ausschuettung kommt hinzu.
   Damit liegt die Gesamtrendite sichtbar ueber der Kursrendite derselben
   Reihe (die Studien erkennen Signale auf genau dieser Kursreihe).

   opts.every       Abstand der Ex-Tage in Kerzen (Standard 63 = Quartal; der
                    Ex-Tag rueckt auf die naechste ruhige Kerze)
   opts.yield       Ausschuettung je Ex-Tag als Anteil des Vortageskurses
   opts.providerMisses  Set von Ex-Tag-Nummern (0, 1, ...), die die
                    Anbieterspalte nicht mitmacht (Anbieterfehler)
   opts.oursMisses  Set von Ex-Tag-Nummern, die in UNSEREM dividend-Feld
                    fehlen (die Anbieterspalte kennt sie: fehlende Dividende)
   opts.adjusted    false: keine Anbieterspalte (adjustedClose null) */
export function barsWithDividends(points, securityId, opts = {}) {
  const every = opts.every || 63, y = opts.yield ?? 0.01;
  const pm = opts.providerMisses || new Set(), om = opts.oursMisses || new Set();
  const n = points.length, close = new Array(n), div = new Array(n).fill(0), provDiv = new Array(n).fill(0);
  let ex = 0, due = false;
  for (let i = 0; i < n; i++) {
    const c = points[i][1];
    if (i > 0 && i % every === 0) due = true;
    /* Ex-Tag auf der naechsten ruhigen Kerze (unter 10 % Bewegung): die
       Wochenreihen der Fixture springen teils um 40 %, ein echter Ex-Tag
       fast nie - und der alte Vertrag (Vorher-Messung) rechnet mit D/P_vor. */
    if (due && Math.abs(c / close[i - 1] - 1) < 0.1) {
      due = false;
      const d = close[i - 1] * y;
      if (!om.has(ex)) div[i] = d;
      if (!pm.has(ex)) provDiv[i] = d;
      ex++;
    }
    close[i] = c;
  }
  const f = new Array(n); f[n - 1] = 1;
  for (let i = n - 1; i > 0; i--) f[i - 1] = f[i] * (close[i] / (close[i] + provDiv[i]));
  return points.map(([d], i) => ({ securityId, date: d, open: close[i], high: close[i], low: close[i], close: close[i], volume: 1,
    adjustedClose: opts.adjusted === false ? null : close[i] * f[i], splitFactor: 1, dividend: div[i] }));
}

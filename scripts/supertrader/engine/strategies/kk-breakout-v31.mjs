// Momentum Breakout 3.1.0 (Runde 8) - wie 3.0.0, zwei VU-Zusaetze entfernt, an
// denen Kullamaegis eigenes Beispiel (TSLA, Ausbruch 01.06.2020) scheiterte:
// Die Engine 3.0.0 erkannte das Setup am 27.05.2020 (Trigger 55,64, split-
// bereinigt), verwarf es am 28.05. wegen eines Schlusses unter der 10-Tage-Linie
// und sperrte danach 5 Sitzungen (LC-COOLDOWN-01) - der Ausbruch am 01.06. fiel aus.
//  KK-BO-TREND-02  Quelle: der Kurs "surft" die steigende 10- UND/ODER 20-Tage-
//                  Linie ("surfing the rising 10 and 20 day (sometimes 50)").
//                  Neu: Schluss ueber mindestens einer der beiden Linien, 20-Tage-
//                  Linie steigt. Bisher: ueber beiden (strenger als die Quelle).
//  LC-COOLDOWN-01  VU-Sperre nach verlorenem Setup entfaellt (0 Sitzungen).
// Alles andere wie 3.0.0 (Kauf-Stop, Stop am Tagestief <= 1 ADR, 1/3 nach 3 Tagen,
// Rest an der 10-Tage-Linie, 25 % / 0,5 % / 10 Positionen).
import v1 from './kk-breakout.mjs';
import kk3, { PARAMS as P3, scan as scan3, intradayEntry, PORTFOLIO } from './kk-breakout-v3.mjs';

export const PARAMS = Object.freeze({ ...P3, trendMode: 'SURF_10_OR_20' });
export const scan = (ctx, t, p = PARAMS, opts = {}) => scan3(ctx, t, { ...PARAMS, ...p, trendMode: 'SURF_10_OR_20' }, opts);

export default {
  ...kk3,
  variant: 'KK_COMMON_BREAKOUT_BUYSTOP_R8_SURF', version: '3.1.0',
  manageCompatible: ['2.0.0', '3.0.0', '3.1.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1 },
  cooldownAfterSetupLost: 0,
  PARAMS, scan, intradayEntry, portfolio: PORTFOLIO,
};

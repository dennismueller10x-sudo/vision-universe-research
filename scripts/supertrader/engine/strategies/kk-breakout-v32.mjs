// Momentum Breakout 3.2.0 (Runde 11, PREREGISTRATION-R11 – Korrektur eines Implementierungsfehlers).
// Quelle (Kullamaegi, Volltext): „sell 1/3 to 1/2 of the position after 3-5 days, and then move the
// stop to break even.“ Bis 3.1.0 wanderte der Stop nach drei Tagen auch dann auf den Einstieg, wenn der
// Kurs darunter lag – ein Verkaufsstop ueber dem Markt, der den Rest am naechsten Morgen verkaufte.
//  KK-BO-BE-02  Stop auf Einstand erst, wenn ein Schluss ueber dem Einstieg liegt (fruehestens mit dem
//               Teilverkauf); sonst bleibt der bisherige Stop. Alles andere wie 3.1.0.
import kk31, { PARAMS, scan } from './kk-breakout-v31.mjs';

export function manage(ctx, t, pos, p = PARAMS) {
  const { bars, ind } = ctx;
  const out = {};
  const held = pos.heldSessions || 0;
  if (!pos.partialDone && held >= p.partialAfterSessions) out.partialNextOpen = { fraction: p.partialFraction, ruleId: 'KK-BO-SCALE-01' };
  const scaling = pos.partialDone || held >= p.partialAfterSessions;
  if (scaling && bars.close[t] > pos.entry && pos.stop < pos.entry) { out.stop = pos.entry; out.stopRuleId = 'KK-BO-BE-02'; }
  const ma = ind[p.trailSma][t];
  if (pos.partialDone && Number.isFinite(ma) && bars.close[t] < ma) out.exitNextOpen = 'KK-BO-TRAIL-02';
  out.warning = !out.exitNextOpen && (bars.close[t] < pos.entry || (pos.partialDone && Number.isFinite(ma) && bars.close[t] < ma * 1.01));
  out.warningRuleId = 'KK-BO-WARN-01';
  return out;
}

export default { ...kk31, variant: 'KK_COMMON_BREAKOUT_BUYSTOP_R11', version: '3.2.0', manageCompatible: ['2.0.0', '3.0.0', '3.1.0', '3.2.0'], signalCompatible: ['3.1.0'], PARAMS, scan, manage };

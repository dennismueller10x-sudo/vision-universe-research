// MR-SEPA-12 (nur Protokoll, filtert nicht): Rang des Titels in seiner SIC-Gruppe point-in-time und Gruppenstaerke.
// VU-FORMALISIERUNG auf SIC (nicht Minervinis Branchentaxonomie). Alle Groessen aus dem Regelbuch (ind.*).
import { requireP } from '../minervini/trend-template.mjs';
import { industryGroup, groupStrength, SPAC_SHELL_SIC } from '../../data-layer/sec/industry-sic.mjs';

// members: [{id, sic, rsPct}] am Tag d (SIC = sicAt(Historie, d), rsPct = VU-RS-Perzentil des Querschnitts,
// MR-TT-08; Rang nach Perzentil = Rang nach Rangwert am selben Tag). selfId muss enthalten sein.
export function industryRecord(members, selfId, P) {
  requireP(P);
  const self = members.find((m) => m.id === selfId);
  if (!self || !self.sic) return { known: false, reason: 'SIC_UNKNOWN_AT_DATE' };
  if (SPAC_SHELL_SIC.includes(self.sic)) return { known: false, reason: 'SPAC_SHELL' };
  const gs = groupStrength(members.map((m) => ({ id: m.id, sic: m.sic, rsPct: m.rsPct })), selfId, self.sic, { level: P['ind.groupLevel'], fallbackLevel: P['ind.fallbackLevel'], minMembers: P['ind.minMembers'] });
  if (!gs) return { known: false, reason: 'GROUP_TOO_SMALL', sic: self.sic };
  const peers = members.filter((m) => m.sic && !SPAC_SHELL_SIC.includes(m.sic) && industryGroup(m.sic, gs.level) === gs.group && Number.isFinite(m.rsPct));
  if (!Number.isFinite(self.rsPct)) return { known: false, reason: 'RS_UNKNOWN', sic: self.sic };
  const rank = 1 + peers.filter((m) => m.id !== selfId && m.rsPct > self.rsPct).length;
  return { known: true, sic: self.sic, level: gs.level, group: gs.group, groupSize: peers.length, rank, topN: rank <= P['ind.topN'], groupMedianRs: gs.medianRs };
}

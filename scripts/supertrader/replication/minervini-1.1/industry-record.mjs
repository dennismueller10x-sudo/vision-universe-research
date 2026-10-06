// MR-SEPA-12 (nur Protokoll, filtert nicht): Rang des Titels in seiner SIC-Gruppe point-in-time und Gruppenstaerke.
// VU-FORMALISIERUNG auf SIC (nicht Minervinis Branchentaxonomie). Alle Groessen aus dem Regelbuch (ind.*).
import { requireP } from '../minervini/trend-template.mjs';
import { industryGroup, groupStrength, SPAC_SHELL_SIC } from '../../data-layer/sec/industry-sic.mjs';

// members: [{id, cik, sic, rsPct}] am Tag d (SIC = sicAt(Historie, d), rsPct = VU-RS-Perzentil des Querschnitts,
// MR-TT-08; Rang nach Perzentil = Rang nach Rangwert am selben Tag). Titel ohne gueltiges RS fehlen im Querschnitt.
// Mehrere Aktiengattungen einer Firma (gleiche CIK) zaehlen als ein Mitglied (hoechstes RS); andere Gattungen der
// eigenen Firma sind keine Vergleichstitel. groupSize zaehlt die Vergleichstitel OHNE den Titel selbst.
export function industryRecord(members, selfId, P) {
  requireP(P);
  const self = members.find((m) => m.id === selfId);
  if (!self) return { known: false, reason: 'RS_UNKNOWN' };
  if (!self.sic) return { known: false, reason: 'SIC_UNKNOWN_AT_DATE' };
  if (SPAC_SHELL_SIC.includes(self.sic)) return { known: false, reason: 'SPAC_SHELL' };
  const best = new Map();
  for (const m of members) {
    if (m.id === selfId || !Number.isFinite(m.rsPct)) continue;
    const key = m.cik || m.id;
    if (self.cik && key === self.cik) continue;
    const cur = best.get(key);
    if (!cur || m.rsPct > cur.rsPct) best.set(key, m);
  }
  const peers = [...best.values()];
  const gs = groupStrength(peers, selfId, self.sic, { level: P['ind.groupLevel'], fallbackLevel: P['ind.fallbackLevel'], minMembers: P['ind.minMembers'] });
  if (!gs) return { known: false, reason: 'GROUP_TOO_SMALL', sic: self.sic };
  const inGroup = peers.filter((m) => m.sic && !SPAC_SHELL_SIC.includes(m.sic) && industryGroup(m.sic, gs.level) === gs.group);
  const rank = 1 + inGroup.filter((m) => m.rsPct > self.rsPct).length;
  return { known: true, sic: self.sic, level: gs.level, group: gs.group, groupSize: inGroup.length, rank, topN: rank <= P['ind.topN'], groupMedianRs: gs.medianRs };
}

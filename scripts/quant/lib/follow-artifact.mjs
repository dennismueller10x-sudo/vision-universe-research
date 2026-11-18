/* =========================================================================
   VISION UNIVERSE — scripts/quant/lib/follow-artifact.mjs

   Folgeartefakt oder Halbstand? (Steuerung 18.11.2026)

   Ändert ein Eignungslauf das Produktuniversum oder den Wertpapierstamm, bauen
   Faktorevidenz und Survivorship-Inventar erst in der Materialisierung nach
   (sie brauchen die Kurshistorie aus R2). Bis dahin passt das Artefakt nicht
   zum aktuellen Eingang. Die Tests prüfen deshalb nur gegen den Stand, an dem
   das Artefakt gebaut ist (sha256 des Eingangs im Artefakt):

     CURRENT  Hash passt              -> volle Prüfung
     WAITING  Hash passt nicht, der Eingang ist jünger als maxHours
                                      -> sichtbar übersprungen ("wartet auf die Materialisierung")
     STALE    Hash passt nicht seit mehr als maxHours
                                      -> Fehler (ein ausbleibender Lauf rutscht nicht durch)
     LEGACY   das Artefakt trägt noch keinen Hash
                                      -> volle Prüfung wie bisher
   ========================================================================= */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const MAX_FOLLOW_HOURS = 6;

export const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/**
 * @param {object} a
 * @param {string|null|undefined} a.artifactSha  Hash des Eingangs, den das Artefakt nennt
 * @param {string} a.currentSha                   Hash des heutigen Eingangs
 * @param {string|null} a.changedAt               ISO-Zeitpunkt, seit dem der heutige Eingang gilt
 * @param {Date|number} [a.now]
 * @param {number} [a.maxHours]
 * @returns {{state: "CURRENT"|"WAITING"|"STALE"|"LEGACY", hours: number|null, reason: string}}
 */
export function followState({ artifactSha, currentSha, changedAt, now = Date.now(), maxHours = MAX_FOLLOW_HOURS }) {
  if (!artifactSha) return { state: "LEGACY", hours: null, reason: "Artefakt ohne Eingangs-Hash (vor dem 18.11.2026 gebaut)" };
  if (artifactSha === currentSha) return { state: "CURRENT", hours: 0, reason: "Artefakt passt zum Eingang" };
  const t = Date.parse(changedAt || "");
  if (!Number.isFinite(t)) return { state: "STALE", hours: null, reason: "Eingang ohne Zeitstempel, Abweichung nicht einzuordnen" };
  const hours = Math.round(((typeof now === "number" ? now : now.getTime()) - t) / 36e5 * 10) / 10;
  return hours > maxHours
    ? { state: "STALE", hours, reason: `Artefakt passt seit ${hours} h nicht zum Eingang (Grenze ${maxHours} h): Materialisierung ausgeblieben?` }
    : { state: "WAITING", hours, reason: `wartet auf die Materialisierung (Eingang seit ${hours} h neu, Grenze ${maxHours} h)` };
}

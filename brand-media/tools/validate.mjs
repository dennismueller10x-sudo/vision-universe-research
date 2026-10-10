// Prüft Registry-Konsistenz: Hashes der Originale, keine "fertigen" Assets ohne Datei, Masterfreigabe.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(join(root, 'registry/asset-registry.json'), 'utf8'));
const av = JSON.parse(readFileSync(join(root, 'registry/avatar-registry.json'), 'utf8'));
const errors = [];
for (const a of reg.assets) {
  if (!reg.releaseStates.includes(a.releaseStatus)) errors.push(`${a.assetId}: ungültiger releaseStatus`);
  if (a.path) {
    if (!existsSync(join(root, a.path))) errors.push(`${a.assetId}: Datei fehlt`);
    else if (createHash('sha256').update(readFileSync(join(root, a.path))).digest('hex') !== a.sha256) errors.push(`${a.assetId}: Hash weicht ab`);
  } else if (a.releaseStatus === 'APPROVED') errors.push(`${a.assetId}: APPROVED ohne Datei`);
}
for (const c of av.characters) {
  const m = reg.assets.find(a => a.assetId === c.masterAssetId);
  if (!m || m.releaseStatus !== 'APPROVED') errors.push(`${c.id}: Master nicht APPROVED`);
  if (c.heygenAvatarGroupId && c.consentStatus === 'NOT_STARTED') errors.push(`${c.id}: HeyGen-Avatar ohne Consent-Status`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${reg.assets.length} Assets, ${av.characters.length} Charaktere`);

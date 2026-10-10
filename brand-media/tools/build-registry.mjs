// Erzeugt brand-media/registry/*.json aus den Charakter- und Studiodefinitionen.
// Nur Planung: kein Asset hier ist "generiert". Status wird ausschliesslich ueber die Registry gepflegt.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'registry');

const CHARACTERS = [
  { id: 'lea', name: 'LEA', age: 32, outfit: 'schwarze Lederjacke (Blazer-Schnitt), schwarzes Top, schwarze weite Hose, schwarze Stiefeletten', hair: 'blond, wellig, schulterlang', file: 'lea_master_original.png', gender: 'female' },
  { id: 'david', name: 'DAVID', age: 34, outfit: 'schwarzer Strickpullover, schwarze Hose, weisse Sneaker, Armbanduhr', hair: 'dunkelbraun, leicht gewellt, kurzer Bart', file: 'david_master_original.png', gender: 'male' },
  { id: 'marc', name: 'MARC', age: 52, outfit: 'beiges Overshirt, dunkles Shirt, dunkle Hose, weisse Sneaker, Armbanduhr', hair: 'silbergrau, zurueckgekaemmt, grauer Bart', file: 'marc_master_original.png', gender: 'male' },
  { id: 'sofia', name: 'SOFIA', age: 29, outfit: 'heller beiger Grobstrickpullover, schwarze weite Hose, schwarze Stiefel', hair: 'dunkelbraun, lang, wellig', file: 'sofia_master_original.png', gender: 'female' },
];

const SHOTS = [
  ['master', 'Masterbild frontal/3-4, sitzend am Tisch (Original)', 'Halbtotale, Augenhoehe'],
  ['side-left', 'Seitenprofil von links', 'Profil 90 Grad, Augenhoehe'],
  ['side-right', 'Seitenprofil von rechts', 'Profil 90 Grad, Augenhoehe'],
  ['fullbody', 'Ganzkoerper stehend im Studio', 'Totale, leicht untersichtig 35 mm'],
  ['seated-3q-left', 'Sitzend, Dreiviertel von links', '3/4 links, Brusthoehe'],
  ['seated-front', 'Sitzend frontal, Haende auf dem Tisch', 'Frontal, Brusthoehe'],
  ['expr-warm', 'Natuerlicher Ausdruck: leichtes Laecheln', 'Close-up 85 mm'],
  ['expr-focused', 'Natuerlicher Ausdruck: nachdenklich/konzentriert', 'Close-up 85 mm'],
  ['dialogue-a', 'Gespraechsszene: spricht zur Kamera links am Tisch', 'Over-the-shoulder, 50 mm'],
  ['dialogue-b', 'Gespraechsszene: hoert zu, Blick zum Gegenueber', 'Over-the-shoulder, 50 mm'],
];

const STUDIO = [
  ['empty-room', 'Leerer Raum'], ['two-persons', 'Raum mit zwei Personen (Lea, David)'],
  ['four-persons', 'Raum mit vier Personen'], ['front', 'Frontalansicht CAM-A'],
  ['side', 'Seitenansicht CAM-B'], ['three-quarter', 'Dreiviertelperspektive CAM-C'],
  ['wide', 'Totale CAM-D'], ['detail-mug', 'Detail: Tasse/Laptop auf Tisch'],
  ['detail-table', 'Detail: Tischoberflaeche'], ['detail-chair', 'Detail: Stuhl'],
];

const base = { qaStatus: 'NOT_GENERATED', releaseStatus: 'DRAFT', model: null, heygenId: null, format: null, path: null, sha256: null };
const assets = [];
const sha = (f) => createHash('sha256').update(readFileSync(join(root, 'originals', f))).digest('hex');

for (const c of CHARACTERS) {
  SHOTS.forEach(([key, desc, camera], i) => {
    const isMaster = key === 'master';
    assets.push({
      assetId: `${c.id}-${key}`, kind: 'character', character: c.id, description: desc, camera, clothing: c.outfit,
      originalReference: `originals/${c.file}`,
      ...base,
      ...(isMaster ? {
        path: `originals/${c.file}`, format: 'PNG 1024x1536 (2:3), RGB', sha256: sha(c.file),
        model: 'extern (vom Auftraggeber geliefert, Erzeuger unbekannt)', qaStatus: 'SOURCE_SUPPLIED',
        releaseStatus: 'APPROVED', approvalNote: 'Im Auftrag Mission 01 ausdruecklich als verbindliche Masterreferenz benannt. Identitaetsvergleich gegen sich selbst entfaellt.',
      } : { generationStatus: 'PLANNED', dependsOn: `${c.id}-master`, order: i }),
    });
  });
}
for (const [key, desc] of STUDIO) {
  assets.push({ assetId: `studio-${key}`, kind: 'studio', character: null, description: desc, camera: key, clothing: null, originalReference: null, generationStatus: 'PLANNED', ...base });
}

const state = JSON.parse(readFileSync(join(root, 'registry/heygen-state.json'), 'utf8'));
for (const v of state.videos) {
  assets.push({ assetId: v.assetId, kind: 'video-test', character: 'lea', description: v.assetId.includes('clip15') ? '15-s-Clip LEA mit Hook, Produktschnitten (lokale Plattform-Screenshots) und Endcard' : 'Identitaetstest LEA: Blick zur Seite, Kopfdrehung, Satz "Andere raten. Du verstehst."', camera: 'CAM-D-aehnlich (Totale sitzend, Masterkomposition)', clothing: CHARACTERS[0].outfit, originalReference: 'originals/lea_master_original.png', path: v.path, format: v.format, sha256: createHash('sha256').update(readFileSync(join(root, v.path))).digest('hex'), model: `HeyGen ${v.engine} (Photo Avatar, REST)`, heygenId: v.heygenVideoId, heygenAvatarId: v.heygenAvatarId, costUsd: v.costUsd, qaStatus: v.qaStatus, releaseStatus: v.releaseStatus, generationStatus: 'GENERATED' });
}
const registry = {
  schemaVersion: 'brand-media-asset-registry-1.0.0',
  note: 'Nur Eintraege mit generationStatus != PLANNED und gesetztem path/sha256 sind echte Dateien. Alle anderen sind Planung, keine Platzhalter-Bilder.',
  releaseStates: ['DRAFT', 'REVIEW', 'APPROVED', 'REJECTED'],
  counts: { characterSlots: assets.filter(a => a.kind === 'character').length, studioSlots: STUDIO.length, existingFiles: assets.filter(a => a.path).length, generatedAssets: assets.filter(a => a.generationStatus === 'GENERATED').length },
  assets,
};
const avatars = {
  schemaVersion: 'brand-media-avatar-registry-1.0.0',
  note: 'heygen* bleibt null, bis ein Avatar nach Freigabe tatsaechlich angelegt wurde. Keine erfundenen IDs.',
  legacy: { system: 'ATLAS', status: 'ZU_ERSETZEN', heygenGroupIds: { 'Atlas TR Style': 'b172e187701247a7945eef9aa6039a10', 'Avatar V7': 'ff561757ec45434ba20bdf73897cd540', 'Atlas V6': '4ad28a44564e4d9ebf795c7d01ab9a72', 'Atlas V5': '725c89e9c1ea498abc826d2f7218c566', 'Atlas V4': '2ac1b16d30e34ff490d1fba11c49a171', 'Atlas V3': '2b2362ead4f3463794dd393b77db2db3', 'Atlas Frau 2': '2bd172aa90d745be8da3c781a95a3de0', 'Atlas Frau': '9c532e636bc3476c9fd52103271b4b52', 'Atlas Neu': '42c11220157a4899a1cd208e9ee26bea' }, note: 'Nicht loeschen, solange ATLAS im Betrieb ist.' },
  characters: CHARACTERS.map(c => { const a = state.avatars[c.id]; return { id: c.id, name: c.name, masterAssetId: `${c.id}-master`, masterPath: `originals/${c.file}`, masterSha256: sha(c.file), heygenAssetId: state.uploads[c.id] ?? null, heygenAvatarGroupId: a?.groupId ?? null, heygenLookIds: a?.lookIds ?? [], heygenDefaultVoiceId: a?.defaultVoiceId ?? null, heygenTestVoiceId: a?.testVoiceId ?? null, consentStatus: 'NOT_REQUIRED_BY_HEYGEN_PHOTO_AVATAR', consentRecord: 'Eigener Nachweis: Auftraggeber hat Upload und Avatar-Anlage fuer diese Figur am 2026-10-10 im Mission-01-Auftrag (Chat) beauftragt; Figur gilt als fiktiv/KI-generiert (vom Auftraggeber zu bestaetigen).', status: a?.status ?? 'NOT_CREATED_BUDGET_GATE' }; }),
  wallet: state.billing,
};
writeFileSync(join(out, 'asset-registry.json'), JSON.stringify(registry, null, 2) + '\n');
writeFileSync(join(out, 'avatar-registry.json'), JSON.stringify(avatars, null, 2) + '\n');
console.log(JSON.stringify(registry.counts));

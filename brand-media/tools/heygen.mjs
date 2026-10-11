#!/usr/bin/env node
// Minimaler HeyGen-REST-Client fuer die Avatar-Pipeline (Node 22, keine Abhaengigkeiten).
// Auth: HEYGEN_API_KEY (Header x-api-key). In der Cloud-Sandbox injiziert der Proxy den Key; lokal/CI als Secret setzen.
// Kostenwache: 'generate' bricht ab, wenn die Schaetzung > --max-usd oder das Wallet nicht reicht, und schreibt
// die tatsaechlich abgebuchten Kosten (Wallet-Differenz) in die Ausgabe. Preise sind NICHT hartkodiert verifiziert:
// --usd-per-sec muss explizit angegeben werden (Quelle im Aufruf dokumentieren).
// Aufruf:
//   node heygen.mjs balance
//   node heygen.mjs look <look_id>
//   node heygen.mjs generate --request req.json --usd-per-sec 0.04 --est-sec 6 --max-usd 0.50 [--out result.json]
//   node heygen.mjs generate --request req.json --usd-per-clip 7.32 --max-usd 2 ...   (Pauschalpreis je Clip, z. B. Cinematic; bricht ab, wenn Preis > Limit)
const BASE = 'https://api.heygen.com';
const H = { 'content-type': 'application/json', ...(process.env.HEYGEN_API_KEY ? { 'x-api-key': process.env.HEYGEN_API_KEY } : {}) };
const api = async (path, init = {}) => {
  const r = await fetch(BASE + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  if (!r.ok) throw new Error(`${r.status} ${path}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const balance = async () => (await api('/v3/users/me')).data.wallet.remaining_balance;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const [cmd, a1] = process.argv.slice(2);

if (cmd === 'balance') console.log(await balance());
else if (cmd === 'look') { const d = (await api(`/v3/avatars/looks/${a1}`)).data; console.log(JSON.stringify({ id: d.id, type: d.avatar_type, status: d.status, engines: d.supported_api_engines, w: d.image_width, h: d.image_height }, null, 2)); }
else if (cmd === 'generate') {
  const req = JSON.parse((await import('node:fs')).readFileSync(arg('request'), 'utf8'));
  const max = Number(arg('max-usd')), clip = arg('usd-per-clip');
  const est = clip !== undefined ? Number(clip) : Number(arg('usd-per-sec')) * Number(arg('est-sec'));
  if (![est, max].every(Number.isFinite)) throw new Error('--max-usd und (--usd-per-clip oder --usd-per-sec + --est-sec) sind Pflicht');
  const before = await balance();
  if (est > max || est > before) { console.error(`ABBRUCH: Schaetzung ${est.toFixed(3)} USD > Limit ${max} bzw. Wallet ${before}`); process.exit(2); }
  const key = arg('idempotency', `vu-${Date.now()}`);
  const { data } = await api('/v3/videos', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(req) });
  let v; for (let i = 0; i < 60; i++) { await sleep(10000); v = (await api(`/v3/videos/${data.video_id}`)).data; if (['completed', 'failed'].includes(v.status)) break; }
  const after = await balance();
  const res = { videoId: data.video_id, status: v.status, duration: v.duration, estimatedUsd: est, walletBefore: before, walletAfter: after, chargedUsd: +(before - after).toFixed(2), videoUrl: v.video_url, failure: v.failure_message ?? null };
  if (arg('out')) (await import('node:fs')).writeFileSync(arg('out'), JSON.stringify(res, null, 2) + '\n');
  console.log(JSON.stringify({ ...res, videoUrl: res.videoUrl ? '[url]' : null }, null, 2));
} else { console.error('Befehle: balance | look <id> | generate ...'); process.exit(1); }

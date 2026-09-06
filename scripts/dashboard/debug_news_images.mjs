const fetchText = async (url) => (await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } })).text();

console.log('\n--- FinanzNachrichten.de (USA feed): image tags in first 8 items ---');
const fn = await fetchText('https://www.finanznachrichten.de/rss-nachrichten-aktien-usa');
const fnItems = (fn.match(/<item>[\s\S]*?<\/item>/gi) || []).slice(0, 8);
for (const item of fnItems) {
  const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const enclosure = item.match(/<enclosure[^>]*>/)?.[0];
  const mediaContent = item.match(/<media:content[^>]*>/)?.[0];
  const imgInDesc = item.match(/<img[^>]*src="([^"]+)"/)?.[1];
  console.log(title, '| enclosure:', enclosure, '| media:content:', mediaContent, '| img-in-desc:', imgInDesc);
}

console.log('\n--- FinanzNachrichten.de image check (GET, if any found above) ---');
const anyImg = fnItems.map((i) => i.match(/<enclosure url="([^"]+)"/)?.[1] || i.match(/<img[^>]*src="([^"]+)"/)?.[1]).find(Boolean);
if (anyImg) {
  const r = await fetch(anyImg);
  const buf = await r.arrayBuffer();
  console.log(anyImg, '->', r.status, r.headers.get('content-type'), buf.byteLength, 'bytes');
} else {
  console.log('no image URL found in sampled items');
}

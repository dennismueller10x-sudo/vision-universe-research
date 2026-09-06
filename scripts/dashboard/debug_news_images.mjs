const fetchText = async (url) => (await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } })).text();
const headOnly = async (url) => { try { const r = await fetch(url, { method: 'HEAD' }); return `${r.status} ${r.headers.get('content-length') || '?'}b ${r.headers.get('content-type') || ''}`; } catch (e) { return `ERROR ${e}`; } };

console.log('\n--- Investing.com: enclosure images from first 5 items ---');
const iv = await fetchText('https://de.investing.com/rss/news_25.rss');
const ivItems = (iv.match(/<item>[\s\S]*?<\/item>/gi) || []).slice(0, 5);
for (const item of ivItems) {
  const url = item.match(/<enclosure url="([^"]+)"/)?.[1];
  const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  console.log(title, '\n  ', url, '\n  large-variant check:', url ? await headOnly(url.replace('_M.jpg', '_L.jpg')) : 'n/a', '\n  original check:', url ? await headOnly(url) : 'n/a');
}

console.log('\n--- wallstreet-online.de: image-bearing tags in first 8 non-ad items ---');
const wo = await fetchText('https://www.wallstreet-online.de/rss/nachrichten-alle.xml');
const woItems = (wo.match(/<item>[\s\S]*?<\/item>/gi) || []).filter((i) => !/utm_medium=referral/.test(i)).slice(0, 8);
for (const item of woItems) {
  const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1];
  const enclosure = item.match(/<enclosure[^>]*>/)?.[0];
  const mediaContent = item.match(/<media:content[^>]*>/)?.[0];
  const mediaThumb = item.match(/<media:thumbnail[^>]*>/)?.[0];
  const img = item.match(/<img[^>]*>/)?.[0];
  console.log(title, '| enclosure:', enclosure, '| media:content:', mediaContent, '| media:thumbnail:', mediaThumb, '| img-in-desc:', img);
}

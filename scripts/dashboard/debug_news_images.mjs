const fetchText = async (url) => (await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } })).text();

console.log('\n--- Investing.com: GET (not HEAD) on one enclosure image, with/without Referer/browser UA ---');
const iv = await fetchText('https://de.investing.com/rss/news_25.rss');
const url = iv.match(/<enclosure url="([^"]+)"/)?.[1];
console.log('url:', url);
for (const [label, headers] of [
  ['no special headers', {}],
  ['with Referer', { Referer: 'https://de.investing.com/' }],
  ['browser-like UA + Referer', { Referer: 'https://de.investing.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }],
]) {
  try {
    const r = await fetch(url, { headers });
    const buf = await r.arrayBuffer();
    console.log(label, '->', r.status, r.headers.get('content-type'), buf.byteLength, 'bytes');
  } catch (e) {
    console.log(label, '-> ERROR', e);
  }
}

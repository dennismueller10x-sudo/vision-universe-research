const targets = [
  ['wallstreet-online.de', 'https://www.wallstreet-online.de/rss/nachrichten-alle.xml'],
  ['FinanzNachrichten.de', 'https://www.finanznachrichten.de/rss-nachrichten-boerse.htm'],
  ['Investing.com', 'https://de.investing.com/rss/news_301.rss'],
];
for (const [name, url] of targets) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } });
    const text = await r.text();
    console.log(`\n=== ${name} (${url}) ===`);
    console.log('status:', r.status, 'content-type:', r.headers.get('content-type'), 'length:', text.length, 'item-tags:', (text.match(/<item[ >]/gi) || []).length);
    console.log('snippet:', text.slice(0, 500).replace(/\n/g, ' '));
  } catch (e) {
    console.log(`\n=== ${name} (${url}) === ERROR: ${e}`);
  }
}

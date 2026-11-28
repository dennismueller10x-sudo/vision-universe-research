// Teilen-Angaben (og/twitter) für die von Hand gepflegten Seiten von www.visionuniverse.de (Owner 24.11.2026: jede
// Unterseite zeigt beim Teilen ihr eigenes Bild). Bilder baut scripts/share-images.mjs --weitere nach assets/share/.
export const ICON = {
  recht: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/>',
  insta: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6"/>',
  post: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  app: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
};
export const WEITERE = [
  ['impressum/index.html', 'recht', 'Rechtliches', 'Impressum', 'Anbieter, Kontakt und Verantwortliche von Vision Universe.', 'apple'],
  ['datenschutz/index.html', 'recht', 'Rechtliches', 'Datenschutz', 'Welche Daten Vision Universe verarbeitet, wofür und welche Rechte du hast.', 'apple'],
  ['partner/index.html', 'app', 'Produktvorstellung', 'Investieren mit <mark>Weitblick.</mark>', 'Aktien finden, prüfen und verstehen: zehn Analysewerkzeuge in einer App.', 'discover'],
  ['instagram/index.html', 'insta', 'Vision Universe auf Instagram', 'Die Aktien aus <mark>unseren Reels.</mark>', 'Die Aktienlisten aus unseren Reels und die App, die bald kommt.', 'discover'],
  ['instagram/energie/index.html', 'insta', 'Instagram · Aus dem Reel', 'Zehn <mark>Energie&#8209;Aktien.</mark>', 'Aus dem Reel „Wenn du tankst, verdienen diese Aktien“.', 'discover'],
  ['instagram/ki-unterstuetzung/index.html', 'insta', 'Instagram · Aus dem Reel', '<mark>KI&#8209;Aktien</mark> an der Unterstützung.', 'Zehn KI-Aktien vor Nvidias Zahlen an einer Unterstützungszone.', 'technical'],
  ['instagram/robotaxi/index.html', 'insta', 'Instagram · Aus dem Reel', 'Zehn Aktien rund ums <mark>Robotaxi.</mark>', 'Aus dem Reel „Tesla überholt Waymo“.', 'discover'],
  ['instagram/robotaxi-nebenwerte/index.html', 'insta', 'Instagram · Aus dem Reel', 'Robotaxi: <mark>die zweite Reihe.</mark>', 'Zehn Nebenwerte rund um autonome Taxis.', 'discover'],
  ['instagram/zonen/index.html', 'insta', 'Instagram · Aus dem Reel', 'Nach dem Crash: <mark>vier KI&#8209;Aktien</mark> an der Unterstützung.', 'Aus dem Vision-Universe-Reel zum Crash vom 05.11.2026.', 'technical'],
  ['instagram/teilnahmebedingungen/index.html', 'insta', 'Instagram', 'Teilnahme&shy;bedingungen', 'Die Regeln für Aktionen von Vision Universe auf Instagram.', 'discover'],
  ['newsletter/bestaetigen/index.html', 'post', 'Newsletter', 'Bitte bestätige deine <mark>E-Mail-Adresse.</mark>', 'Vision Universe erklärt Aktien in einfachen Sätzen. Bald als App für iPhone und Android.', 'discover'],
  ['newsletter/bestaetigt/index.html', 'post', 'Newsletter', 'Danke für deine <mark>Bestätigung.</mark>', 'Vision Universe erklärt Aktien in einfachen Sätzen. Bald als App für iPhone und Android.', 'discover'],
  ['newsletter/fehler/index.html', 'post', 'Newsletter', 'Deine Anmeldung ist <mark>nicht bestätigt.</mark>', 'Vision Universe erklärt Aktien in einfachen Sätzen. Bald als App für iPhone und Android.', 'discover'],
];

// Rechtstexte: Quelldateien sind per Prüfsumme freigegeben; die Angaben kommen erst im Bau dazu (build.mjs).
export const RECHT = new Set(['impressum/index.html', 'datenschutz/index.html', 'instagram/teilnahmebedingungen/index.html']);

const SITE = 'https://www.visionuniverse.de/';
const klar = (h) => h.replace(/&shy;/g, '').replace(/&#8209;/g, '-').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const attr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const bildPfad = (path) => `assets/share/${path.replace(/\/index\.html$/, '').replace(/\//g, '-')}.jpg`;

// Ersetzt vorhandene og/twitter-Angaben und setzt den vollständigen Satz direkt hinter <title>.
export function teilenTags(html, path, h1, satz) {
  const url = SITE + path.replace(/index\.html$/, ''), bild = SITE + bildPfad(path), titel = attr(klar(h1) + ' · Vision Universe');
  html = html.replace(/\n?[ \t]*<meta (?:property="og:[^"]+"|name="twitter:[^"]+") content="[^"]*">/g, '');
  const tags = [['property="og:type"', 'website'], ['property="og:url"', url], ['property="og:site_name"', 'Vision Universe'], ['property="og:locale"', 'de_DE'], ['property="og:title"', titel], ['property="og:description"', attr(satz)], ['property="og:image"', bild], ['property="og:image:width"', '1200'], ['property="og:image:height"', '630'], ['property="og:image:alt"', titel], ['name="twitter:card"', 'summary_large_image'], ['name="twitter:image"', bild]];
  const ein = html.match(/\n([ \t]*)<title>/i)?.[1] ?? '';
  return html.replace(/(<title>[^<]*<\/title>)/i, `$1\n${tags.map(([k, v]) => `${ein}<meta ${k} content="${v}">`).join('\n')}`);
}

// Ratgeber auf www.visionuniverse.de (Konzept 23.11.2026, Owner-Freigabe): /ratgeber/, /ratgeber/thema/<welt>/, /ratgeber/<slug>/.
// Quelle: landing/ratgeber-inhalt/ (welten.json, artikel/<slug>.json, daten.json mit eingefrorenen Beispielwerten).
// Kopf und Fuß kommen aus landing/news/index.html (wie beim Marktbriefing). Grafiken sind statisches HTML/SVG und ohne
// JavaScript vollständig lesbar; web/ratgeber.js macht sie bedienbar (Schieberegler, Beispiele wechseln).
// Der Bau (scripts/build.mjs) ruft ratgeberSeiten() auf; zur Vorschau: node landing/scripts/ratgeber.mjs --out DIR
import {readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const SITE = 'https://www.visionuniverse.de';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
const zahl = (x, d = 0) => (x == null ? '–' : Number(x).toLocaleString('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d}));
const usd = (x, d = 2) => `${zahl(x, d)} $`;
const pct = (x, d = 1) => (x == null ? '–' : `${zahl(x * 100, x > 0 && x < 0.001 ? 2 : d)} %`);
const mrd = (x) => (x == null ? '–' : `${zahl(x / 1e9, x >= 1e11 ? 0 : 1)} Mrd. $`);
const datum = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}.${m}.${y}`; };
const ic = (paths, size = 22) => `<svg class="rg-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function laden(base = root) {
  const dir = resolve(base, 'ratgeber-inhalt');
  const welten = JSON.parse(readFileSync(resolve(dir, 'welten.json'), 'utf8'));
  const daten = JSON.parse(readFileSync(resolve(dir, 'daten.json'), 'utf8'));
  const artikel = {};
  for (const f of readdirSync(resolve(dir, 'artikel')).filter((f) => f.endsWith('.json'))) {
    const a = JSON.parse(readFileSync(resolve(dir, 'artikel', f), 'utf8'));
    if (a.slug + '.json' !== f) throw new Error(`Ratgeber ${f}: slug passt nicht zum Dateinamen`);
    artikel[a.slug] = a;
  }
  for (const a of Object.values(artikel)) if (!welten.welten.some((w) => w.id === a.welt)) throw new Error(`Ratgeber ${a.slug}: unbekannte Welt ${a.welt}`);
  return {welten, daten, artikel};
}

/* ------------------------------------------------------------------ Grafiken ------------------------------------------------------------------ */
const G = {};
const quelleZeile = (D, extra = '') => `<p class="rg-src">Beispielwerte: Schlusskurs ${datum(D.stand)}, Gewinn der letzten vier Quartale laut SEC-Berichten${extra}. Berechnung Vision Universe. Beispiele, keine Empfehlung.</p>`;

// KGV-Rechner: Kurs ÷ Gewinn je Aktie = KGV, als Reihe von Jahresgewinnen; Beispiele zum Umschalten.
G['kgv-rechner'] = (g, D) => {
  const ts = g.ticker, a = D.aktien[ts[0]];
  const chips = ts.map((t, i) => { const x = D.aktien[t]; return `<button type="button" class="rg-chip${i ? '' : ' on'}" data-kurs="${x.kurs}" data-eps="${x.gewinnJeAktie}" data-name="${esc(x.name)}">${esc(x.name)}</button>`; }).join('');
  const k = a.kurs / a.gewinnJeAktie;
  const muenzen = Array.from({length: 60}, (_, i) => `<i class="${i < Math.floor(k) ? 'f' : i < k ? 'h' : ''}"></i>`).join('');
  return `<figure class="rg-g rg-kgv" data-g="kgv-rechner"><figcaption class="rg-gk">Zum Ausprobieren</figcaption><div class="rg-chips" role="group" aria-label="Beispiel wählen">${chips}</div>
<div class="rg-kgv-eq"><div><span>Aktienkurs</span><b data-o="kurs">${usd(a.kurs)}</b></div><em>÷</em><div><span>Gewinn je Aktie (1 Jahr)</span><b data-o="eps">${usd(a.gewinnJeAktie)}</b></div><em>=</em><div class="rg-kgv-r"><span>KGV</span><b data-o="kgv">${zahl(k, 1)}</b></div></div>
<div class="rg-sl"><label>Kurs <output data-o="kurs2">${usd(a.kurs)}</output><input type="range" min="1" max="${Math.ceil(a.kurs * 2.5)}" step="0.5" value="${a.kurs}" data-i="kurs" aria-label="Aktienkurs"></label><label>Gewinn je Aktie <output data-o="eps2">${usd(a.gewinnJeAktie)}</output><input type="range" min="0.1" max="${Math.ceil(a.gewinnJeAktie * 3)}" step="0.05" value="${a.gewinnJeAktie}" data-i="eps" aria-label="Gewinn je Aktie"></label></div>
<div class="rg-muenzen" aria-hidden="true">${muenzen}</div>
<p class="rg-kgv-satz" data-o="satz">Bei <b>${esc(a.name)}</b> bezahlst du beim Kauf rund <b>${zahl(k, 1)} Jahresgewinne</b>, wenn der Gewinn gleich bleibt.</p>
${quelleZeile(D)}</figure>`;
};

// KGV-Vergleich: Balken je Aktie, Linie beim Median aller US-Aktien.
G['kgv-vergleich'] = (g, D) => {
  const max = g.max || 60, med = D.markt.kgvMedian;
  const rows = g.ticker.map((t) => { const x = D.aktien[t], v = x.kgv; const w = Math.min(v, max) / max * 100;
    return `<li style="--w:${w.toFixed(1)}"><span>${esc(x.name)}</span><i class="${v > med * 1.5 ? 'hoch' : v < med * 0.67 ? 'tief' : ''}${v > max ? ' cut' : ''}"></i><b>${zahl(v, 1)}</b></li>`; }).join('');
  return `<figure class="rg-g rg-bars" data-g="balken"><figcaption class="rg-gk">KGV im Vergleich</figcaption><ul style="--m:${(med / max * 100).toFixed(1)}">${rows}</ul>
<p class="rg-bars-m"><i></i>Median aller ${zahl(D.markt.anzahl)} US-Aktien mit Gewinn: KGV ${zahl(med, 1)}</p>${quelleZeile(D, g.max ? `; Balken über ${g.max} abgeschnitten` : '')}</figure>`;
};

// Dividendenrendite: Balken und was 10.000 $ im Jahr bringen.
G['dividende'] = (g, D) => {
  const xs = g.ticker.map((t) => D.aktien[t]).filter((x) => x.dividendenRendite != null);
  const max = Math.max(...xs.map((x) => x.dividendenRendite));
  const rows = xs.map((x) => `<li style="--w:${(x.dividendenRendite / max * 100).toFixed(1)}"><span>${esc(x.name)}</span><i></i><b>${pct(x.dividendenRendite, 1)}</b><small>${usd(10000 * x.dividendenRendite, 0)} je 10.000 $</small></li>`).join('');
  return `<figure class="rg-g rg-bars rg-div" data-g="balken"><figcaption class="rg-gk">Dividendenrendite im Vergleich</figcaption><ul>${rows}</ul>${quelleZeile(D, '; Dividende der letzten zwölf Monate geteilt durch den Kurs')}</figure>`;
};

// Anteil: Was 1, 10 oder 100 Aktien von einer Firma bedeuten.
G['anteil'] = (g, D) => {
  const x = D.aktien[g.ticker], n = 10;
  return `<figure class="rg-g rg-anteil" data-g="anteil" data-kurs="${x.kurs}" data-eps="${x.gewinnJeAktie}" data-aktien="${x.aktienAnzahl}" data-div="${x.dividendenRendite ?? 0}"><figcaption class="rg-gk">Zum Ausprobieren · ${esc(x.name)}</figcaption>
<div class="rg-anteil-top"><div class="rg-pie" aria-hidden="true"><svg viewBox="0 0 120 120">${Array.from({length: 48}, (_, i) => { const a1 = i / 48 * Math.PI * 2, a2 = (i + 1) / 48 * Math.PI * 2; const p = (a) => `${60 + 54 * Math.sin(a)} ${60 - 54 * Math.cos(a)}`; return `<path d="M60 60 L${p(a1)} A54 54 0 0 1 ${p(a2)}Z"${i === 0 ? ' class="du"' : ''}/>`; }).join('')}</svg></div>
<div><p class="rg-big">${zahl(x.aktienAnzahl / 1e9, 2)} Mrd.</p><p>Aktien gibt es von ${esc(x.name)}. Jede ist ein gleich großes Stück der Firma.</p></div></div>
<div class="rg-sl"><label>Deine Aktien <output data-o="n">${n}</output><input type="range" min="1" max="200" value="${n}" data-i="n" aria-label="Anzahl Aktien"></label></div>
<div class="rg-kacheln"><div><span>Wert heute</span><b data-o="wert">${usd(n * x.kurs, 0)}</b></div><div><span>Dein Anteil am Jahresgewinn</span><b data-o="gewinn">${usd(n * x.gewinnJeAktie, 0)}</b></div><div><span>Davon als Dividende ausgezahlt</span><b data-o="div">${usd(n * x.kurs * (x.dividendenRendite || 0), 0)}</b></div></div>
${quelleZeile(D)}</figure>`;
};

// Zulage-Rechner Altersvorsorgedepot (§ 84, § 85, § 86 EStG n. F.).
export function zulage(beitrag, kinder = 0, unter25 = false) {
  if (beitrag < 120) return {grund: 0, kind: 0, start: 0, summe: 0};
  const grund = 0.5 * Math.min(beitrag, 360) + 0.25 * Math.max(0, Math.min(beitrag, 1800) - 360);
  const kind = kinder * Math.min(300, Math.min(beitrag, 1800));
  const start = unter25 ? 200 : 0;
  return {grund, kind, start, summe: grund + kind + start};
}
G['zulage-rechner'] = () => {
  const rows = [120, 360, 1000, 1800].map((b) => `<tr><td>${zahl(b)} €</td><td><b>${zahl(zulage(b).grund)} €</b></td><td>${zahl(zulage(b).grund / b * 100, 0)} %</td></tr>`).join('');
  const z = zulage(1000);
  return `<figure class="rg-g rg-zul" data-g="zulage"><figcaption class="rg-gk">Zum Ausprobieren · Zulage ab 2027</figcaption>
<div class="rg-sl"><label>Dein Beitrag im Jahr <output data-o="b">1.000 €</output><input type="range" min="0" max="2400" step="10" value="1000" data-i="b" aria-label="Eigener Beitrag im Jahr"></label><label>Kinder mit Kindergeld <output data-o="k">0</output><input type="range" min="0" max="4" step="1" value="0" data-i="k" aria-label="Anzahl Kinder"></label><label class="rg-check"><input type="checkbox" data-i="u25"> unter 25 Jahre (einmalig 200 € Startbonus)</label></div>
<div class="rg-stack" aria-hidden="true"><i class="du" style="--w:74.6"></i><i class="st" style="--w:25.4"></i></div>
<div class="rg-kacheln"><div><span>Du zahlst</span><b data-o="du">1.000 €</b></div><div class="lime"><span>Der Staat legt dazu</span><b data-o="st">${zahl(z.summe)} €</b></div><div><span>Zusammen im Depot</span><b data-o="sum">${zahl(1000 + z.summe)} €</b></div></div>
<noscript><table class="rg-tab"><tr><th>Beitrag im Jahr</th><th>Grundzulage</th><th>Zuschuss</th></tr>${rows}</table></noscript>
<p class="rg-src">Grundzulage 50 % auf die ersten 360 €, 25 % bis 1.800 € (§ 84 EStG n. F.), Kinderzulage 100 % bis 300 € je Kind (§ 85), Mindesteigenbeitrag 120 € (§ 86). Gesetz vom 26.05.2026, BGBl. 2026 I Nr. 156. Ohne Steuervorteil gerechnet.</p></figure>`;
};

// Sparplan: Einzahlungen und Wertentwicklung bei angenommenen Jahresrenditen (Rechenbeispiel, keine Prognose).
export function sparplan(monat, jahre, rendite) {
  const r = Math.pow(1 + rendite, 1 / 12) - 1; let wert = 0; const kurve = [];
  for (let m = 1; m <= jahre * 12; m++) { wert = (wert + monat) * (1 + r); if (m % 12 === 0) kurve.push([m / 12, monat * m, wert]); }
  return {eingezahlt: monat * jahre * 12, wert, kurve};
}
G['sparplan-rechner'] = () => {
  const s = sparplan(100, 25, 0.05);
  const max = s.kurve.at(-1)[2];
  const pts = (i) => s.kurve.map(([j, e, w]) => `${(j / 25 * 300).toFixed(1)},${(150 - (i ? w : e) / max * 140).toFixed(1)}`).join(' ');
  return `<figure class="rg-g rg-spar" data-g="sparplan"><figcaption class="rg-gk">Zum Ausprobieren · Rechenbeispiel</figcaption>
<div class="rg-sl"><label>Sparrate im Monat <output data-o="m">100 €</output><input type="range" min="25" max="1000" step="25" value="100" data-i="m" aria-label="Sparrate im Monat"></label><label>Jahre <output data-o="j">25</output><input type="range" min="1" max="40" value="25" data-i="j" aria-label="Jahre"></label>
<div class="rg-chips" role="group" aria-label="Angenommene Rendite"><button type="button" class="rg-chip" data-r="0.03">3 % im Jahr</button><button type="button" class="rg-chip on" data-r="0.05">5 % im Jahr</button><button type="button" class="rg-chip" data-r="0.07">7 % im Jahr</button></div></div>
<svg class="rg-area" viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden="true"><polygon class="w" data-o="pw" points="0,150 ${pts(1)} 300,150"/><polygon class="e" data-o="pe" points="0,150 ${pts(0)} 300,150"/></svg>
<div class="rg-kacheln"><div><span>Eingezahlt</span><b data-o="ein">${zahl(s.eingezahlt)} €</b></div><div class="lime"><span>Wert am Ende</span><b data-o="wert">${zahl(s.wert)} €</b></div><div><span>Davon Wertzuwachs</span><b data-o="plus">${zahl(s.wert - s.eingezahlt)} €</b></div></div>
<p class="rg-src">Rechenbeispiel mit gleichbleibender Rendite pro Jahr, monatlich verzinst, ohne Kosten und Steuern. Echte Kurse schwanken; eine bestimmte Rendite ist nicht vorhersehbar und nicht zugesagt.</p></figure>`;
};

// Streuung: ein Unternehmen gegen hundert. Fällt eine Firma um die Hälfte, was passiert mit dem Geld?
G['streuung'] = () => {
  const dots = (n, rot) => Array.from({length: n}, (_, i) => `<i${i === rot ? ' class="rot"' : ''}></i>`).join('');
  return `<figure class="rg-g rg-streu" data-g="streuung"><figcaption class="rg-gk">Gedankenexperiment · eine Firma verliert die Hälfte</figcaption>
<div class="rg-streu-g"><div><p class="rg-streu-k">10.000 € in <b>einer</b> Aktie</p><div class="rg-dots one">${dots(1, 0)}</div><p class="rg-streu-v">−5.000 €</p><p>Das ganze Geld steckt in dieser Firma.</p></div>
<div><p class="rg-streu-k">10.000 € in einem ETF mit <b>100</b> Firmen</p><div class="rg-dots">${dots(100, 37)}</div><p class="rg-streu-v ok">−50 €</p><p>Die Firma ist nur einer von hundert gleich großen Teilen.</p></div></div>
<button type="button" class="rg-btn" data-i="los">Absturz zeigen</button>
<p class="rg-src">Vereinfachtes Beispiel mit gleich großen Teilen und ohne Bewegung der anderen 99 Firmen. In echten ETFs sind die Teile unterschiedlich groß.</p></figure>`;
};

// Bruchstücke: Was eine Sparrate von einer Aktie kauft (Bruchstücke bei Sparplänen).
G['bruchstuecke'] = (g, D) => {
  const b = g.betrag || 50;
  const rows = g.ticker.map((t) => { const x = D.aktien[t], s = b / x.kurs; return `<li data-kurs="${x.kurs}"><span>${esc(x.name)}</span><div class="rg-frac" style="--f:${Math.min(1, s).toFixed(3)}"><i></i></div><b data-o="s">${zahl(s, 2)}</b><small>Kurs ${usd(x.kurs)}</small></li>`; }).join('');
  return `<figure class="rg-g rg-bruch" data-g="bruch"><figcaption class="rg-gk">Zum Ausprobieren · so viel Aktie bekommst du</figcaption>
<div class="rg-sl"><label>Sparrate <output data-o="b">${b} $</output><input type="range" min="10" max="500" step="5" value="${b}" data-i="b" aria-label="Sparrate"></label></div><ul class="rg-bruch-l">${rows}</ul>
${quelleZeile(D, '; Bruchstücke gibt es bei vielen Sparplänen, nicht bei jedem Kauf an der Börse')}</figure>`;
};

// Fünf Schritte am echten Beispiel.
G['schritte'] = (g, D) => {
  const x = D.aktien[g.ticker], med = D.markt.kgvMedian;
  const s = [
    ['Was macht die Firma?', x.name === 'Microsoft' ? 'Software (Windows, Office), Cloud (Azure), Spiele' : esc(x.sektor || ''), 'Verstehst du, womit sie Geld verdient?'],
    ['Wächst der Umsatz?', `${mrd(x.umsatzUSD)} · ${x.umsatzWachstum >= 0 ? '+' : ''}${pct(x.umsatzWachstum)}`, 'Umsatz der letzten vier Quartale, Veränderung zum Vorjahr'],
    ['Bleibt Gewinn übrig?', `${mrd(x.gewinnUSD)} · Marge ${pct(x.marge, 0)}`, 'Von 100 $ Umsatz bleiben so viele als Gewinn'],
    ['Was kostet die Aktie?', `KGV ${zahl(x.kgv, 1)}`, `Median aller US-Aktien: ${zahl(med, 1)}`],
    ['Wer hält sie?', 'Große Fonds melden ihre Aktien jedes Quartal (13F)', 'In der App: wer kauft, wer verkauft'],
  ];
  return `<figure class="rg-g rg-steps"><figcaption class="rg-gk">Am Beispiel ${esc(x.name)}</figcaption><ol>${s.map(([t, v, h], i) => `<li><span class="rg-n">${i + 1}</span><div><p class="rg-st">${t}</p><b>${v}</b><small>${h}</small></div></li>`).join('')}</ol>${quelleZeile(D)}</figure>`;
};

// Entscheidungsweg Riester.
G['riester-wege'] = () => {
  const w = [['Behalten', 'Der Vertrag läuft mit den bisherigen Regeln weiter, bis die Auszahlung beginnt.', 'ok'], ['Wechseln ins neue Recht', 'Per Erklärung beim Anbieter gelten ab dem Beitragsjahr die neuen Förderregeln für alle deine Verträge. Unwiderruflich.', 'ok'], ['Übertragen', 'Das Kapital zieht in einen anderen Vertrag, auch in ein Altersvorsorgedepot. In den ersten 5 Jahren nach Abschluss darf der alte Anbieter höchstens 150 € verlangen, danach nichts.', 'ok'], ['Kündigen und auszahlen', 'Gilt als schädliche Verwendung: Zulagen und Steuervorteile müssen zurückgezahlt werden.', 'rot']];
  return `<figure class="rg-g rg-wege"><figcaption class="rg-gk">Vier Wege für einen Riester-Vertrag</figcaption><div class="rg-wege-g">${w.map(([t, x, c]) => `<div class="${c}"><b>${t}</b><p>${x}</p></div>`).join('')}</div><p class="rg-src">§ 52 Abs. 50a EStG, § 1 Abs. 1 AltZertG, § 93 EStG; Altersvorsorgereformgesetz, BGBl. 2026 I Nr. 156.</p></figure>`;
};

// Merksatz-Kachel.
G['merke'] = (g) => `<aside class="rg-merke"><span>Merke</span><p>${g.text}</p></aside>`;

function grafik(g, D) {
  const f = G[g.typ];
  if (!f) throw new Error(`Ratgeber: unbekannte Grafik ${g.typ}`);
  return f(g, D);
}

/* ------------------------------------------------------------------ Seiten ------------------------------------------------------------------ */
function chrome(newsHtml, tiefe) {
  const bodyStart = newsHtml.indexOf('>', newsHtml.indexOf('<body')) + 1;
  let top = newsHtml.slice(bodyStart, newsHtml.indexOf('<main'));
  let bottom = newsHtml.slice(newsHtml.indexOf('</main>') + 7, newsHtml.lastIndexOf('</body>'));
  const pre = '../'.repeat(tiefe);
  const fix = (s) => s.replace(/<vu-navigation><\/vu-navigation><script src="\/assets\/site-navigation\.js"><\/script>/g, '')
    .replace(/ aria-current="page"/g, '').replace(/(href|src)="\.\.\//g, `$1="${pre}`)
    .replace(new RegExp(`href="${pre.replace(/\./g, '\\.')}ratgeber/"`, 'g'), `href="${pre}ratgeber/" aria-current="page"`);
  return {top: fix(top).trim(), bottom: fix(bottom).trim()};
}

function seite({pfad, titel, beschreibung, ld, body, bild, newsHtml}) {
  const tiefe = pfad.split('/').length - 1, pre = '../'.repeat(tiefe), url = `${SITE}/${pfad.replace('index.html', '')}`;
  const c = chrome(newsHtml, tiefe);
  const og = bild || `${SITE}/assets/share/news.jpg`;
  return `<!doctype html>
<html lang="de" class="vw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(beschreibung)}">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${url}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="${ld.some((x) => x['@type'] === 'Article') ? 'article' : 'website'}">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Vision Universe">
<meta property="og:title" content="${esc(titel)}">
<meta property="og:description" content="${esc(beschreibung)}">
<meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${pre}assets/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="${pre}assets/apple-touch-icon.png">
<link rel="preload" href="${pre}assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${pre}web/site.css"><link rel="stylesheet" href="${pre}web/home.css"><link rel="stylesheet" href="${pre}web/sub.css"><link rel="stylesheet" href="${pre}web/ratgeber.css">
<script src="${pre}web/site.js" defer></script>
<script src="${pre}web/consent.js" defer></script>
<script src="${pre}web/ratgeber.js" defer></script>
<meta name="vu-ga" content="">
<script type="application/ld+json">${JSON.stringify({'@context': 'https://schema.org', '@graph': ld}).replace(/</g, '\\u003c')}</script>
</head>
<body>
${c.top}
<main id="inhalt" class="rg">
${body}
</main>
${c.bottom}
</body>
</html>
`;
}

const krumen = (pre, teile) => `<nav class="rg-crumb" aria-label="Brotkrumen"><a href="${pre}">Startseite</a>${teile.map(([n, h]) => `<span aria-hidden="true">/</span>${h ? `<a href="${h}">${esc(n)}</a>` : `<span aria-current="page">${esc(n)}</span>`}`).join('')}</nav>`;
const ldKrumen = (teile) => ({'@type': 'BreadcrumbList', itemListElement: teile.map(([n, u], i) => ({'@type': 'ListItem', position: i + 1, name: n, item: u}))});
const ORG = {'@id': `${SITE}/#organisation`};
const lesezeit = (a) => Math.max(3, Math.round(strip([a.kurz, ...a.abschnitte.map((s) => s.html), ...(a.faq || []).map((f) => f.a)].join(' ')).split(' ').length / 200));

function karte(a, w, pre, gross = false) {
  return `<a class="rg-card${gross ? ' gross' : ''}" href="${pre}ratgeber/${a.slug}/" data-such="${esc((a.titel + ' ' + (a.suchbegriffe || []).join(' ') + ' ' + w.name).toLowerCase())}"><span class="rg-card-w">${ic(w.icon, 18)}${esc(w.name)}</span><b>${esc(a.titel)}</b><span class="rg-card-t">${esc(a.teaser || a.untertitel)}</span><span class="rg-more">Lesen <span aria-hidden="true">→</span></span></a>`;
}
const bald = (titel, w) => `<div class="rg-card bald" data-such="${esc((titel + ' ' + w.name).toLowerCase())}"><span class="rg-card-w">${ic(w.icon, 18)}${esc(w.name)}</span><b>${esc(titel)}</b><span class="rg-bald">Bald</span></div>`;

function artikelSeite(a, ctx) {
  const {welten, daten, artikel, newsHtml} = ctx;
  const w = welten.welten.find((x) => x.id === a.welt), pfad = `ratgeber/${a.slug}/index.html`, pre = '../../';
  const url = `${SITE}/ratgeber/${a.slug}/`;
  const toc = a.abschnitte.map((s, i) => `<li><a href="#${s.id}">${esc(s.h2)}</a></li>`).join('') + ((a.faq || []).length ? '<li><a href="#fragen">Häufige Fragen</a></li>' : '');
  const abschnitte = a.abschnitte.map((s) => `<section class="rg-sec" id="${s.id}"><h2>${esc(s.h2)}</h2>${s.html}${(s.grafiken || []).map((g) => grafik(g, daten)).join('')}${s.nach || ''}</section>`).join('\n');
  const app = a.app ? `<aside class="rg-app"><div class="rg-app-ph"><img src="${pre}web/img/app/${a.app.bild}.jpg" alt="${esc(a.app.alt || 'Vision Universe App')}" loading="lazy" width="390" height="844"></div><div><span class="rg-gk">So zeigt es Vision Universe</span><b>${esc(a.app.titel)}</b><p>${esc(a.app.text)}</p><a class="rg-btn lime" href="${pre}#newsletter">Zum Start benachrichtigen <span aria-hidden="true">→</span></a></div></aside>` : '';
  const faq = (a.faq || []).length ? `<section class="rg-sec" id="fragen"><h2>Häufige Fragen</h2><div class="rg-faq">${a.faq.map((f) => `<details><summary>${esc(f.f)}<i aria-hidden="true">+</i></summary><p>${f.a}</p></details>`).join('')}</div></section>` : '';
  const weiter = (a.weiter || []).map((s) => artikel[s]).filter(Boolean).map((x) => karte(x, welten.welten.find((y) => y.id === x.welt), pre)).join('');
  const quellen = (a.quellen || []).map((q) => `<li>${q.url ? `<a href="${esc(q.url)}" rel="noopener">${esc(q.titel)}</a>` : esc(q.titel)}</li>`).join('');
  const body = `<article class="rg-art">
<header class="rg-head w">${krumen(pre, [['Ratgeber', `${pre}ratgeber/`], [w.name, `${pre}ratgeber/thema/${w.id}/`], [a.kurztitel || a.titel, null]])}
<span class="rg-tag"><span class="ic">${ic(w.icon, 16)}</span>${esc(w.name)}</span>
<h1>${a.h1}</h1><p class="rg-sub">${esc(a.untertitel)}</p>
<p class="rg-meta"><span class="rg-av" aria-hidden="true">VU</span>Redaktion Vision Universe · Stand ${datum(a.stand)} · ${lesezeit(a)} Min. Lesezeit</p></header>
<div class="rg-body w"><div class="rg-text">
<aside class="rg-kurz"><span>Kurz gesagt</span><p>${a.kurz}</p></aside>
<nav class="rg-toc" aria-label="Inhalt"><span>Inhalt</span><ol>${toc}</ol></nav>
${abschnitte}
${app}
${faq}
<section class="rg-quellen"><h2>Quellen</h2><ul>${quellen}</ul><p>Allgemeine Information, keine Anlage-, Steuer- oder Rechtsberatung. Vision Universe erklärt und vergleicht, empfiehlt aber keine Wertpapiere.</p></section>
</div><aside class="rg-side"><div class="rg-side-in"><span class="rg-gk">In diesem Artikel</span><ol>${toc}</ol><div class="rg-side-app"><b>Für jede Aktie in der App</b><p>Kennzahlen in einfachen Sätzen, mit Datum und Quelle.</p><a class="rg-btn lime" href="${pre}#newsletter">Benachrichtigen <span aria-hidden="true">→</span></a></div></div></aside></div>
${weiter ? `<section class="rg-weiter w"><h2>Weiterlesen</h2><div class="rg-grid">${weiter}</div></section>` : ''}
</article>`;
  const ld = [
    {'@type': 'Article', '@id': url + '#artikel', headline: a.titel, description: a.beschreibung, inLanguage: 'de-DE', datePublished: a.erschienen || a.stand, dateModified: a.stand, mainEntityOfPage: url,
      author: {'@type': 'Organization', name: 'Redaktion Vision Universe', url: `${SITE}/`}, publisher: ORG, about: (a.suchbegriffe || []).slice(0, 3), isPartOf: {'@id': `${SITE}/ratgeber/#ratgeber`}},
    ...((a.faq || []).length ? [{'@type': 'FAQPage', '@id': url + '#fragen', mainEntity: a.faq.map((f) => ({'@type': 'Question', name: f.f, acceptedAnswer: {'@type': 'Answer', text: strip(f.a)}}))}] : []),
    ldKrumen([['Vision Universe', `${SITE}/`], ['Ratgeber', `${SITE}/ratgeber/`], [w.name, `${SITE}/ratgeber/thema/${w.id}/`], [a.kurztitel || a.titel, url]]),
  ];
  return {pfad, stand: a.stand, html: seite({pfad, titel: a.seitentitel || `${a.titel} · Vision Universe Ratgeber`, beschreibung: a.beschreibung, ld, body, newsHtml})};
}

function uebersicht(ctx) {
  const {welten, artikel, newsHtml} = ctx, pre = '../', W = welten.welten;
  const auf = artikel[welten.aufmacher];
  const anzahl = W.reduce((n, w) => n + w.artikel.length, 0);
  const start = welten.startHier.map((s, i) => { const a = artikel[s]; const t = a ? a.titel : W.flatMap((w) => w.artikel).find((x) => x[0] === s)?.[1]; return a ? `<li><a href="${pre}ratgeber/${s}/"><span class="rg-n">${i + 1}</span>${esc(t)}</a></li>` : `<li><span class="rg-n">${i + 1}</span>${esc(t)} <span class="rg-bald">Bald</span></li>`; }).join('');
  const weltenHtml = W.map((w) => `<section class="rg-welt" id="${w.id}"><div class="rg-welt-h"><a href="${pre}ratgeber/thema/${w.id}/"><span class="rg-welt-ic">${ic(w.icon, 26)}</span><span><b>${esc(w.name)}</b><small>${esc(w.satz)}</small></span></a><span class="rg-gk">${w.artikel.length} Artikel</span></div><div class="rg-grid">${w.artikel.map(([s, t]) => (artikel[s] ? karte(artikel[s], w, pre) : bald(t, w))).join('')}</div></section>`).join('');
  const body = `<header class="rg-hero w">${krumen(pre, [['Ratgeber', null]])}
<h1>Geld und Börse,<br><mark>einfach erklärt.</mark></h1>
<p class="rg-sub">${anzahl} Antworten auf die Fragen, die sich jeder stellt: von der ersten Aktie bis zum Altersvorsorgedepot. Mit Grafiken zum Ausprobieren und echten Beispielen.</p>
<label class="rg-such"><span class="rg-sr">Ratgeber durchsuchen</span>${ic('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 20)}<input type="search" placeholder="Wonach suchst du? z. B. KGV oder Sparplan" data-rg-such autocomplete="off"></label></header>
<div class="rg-top w">${auf ? `<a class="rg-auf" href="${pre}ratgeber/${auf.slug}/"><div><span class="rg-tag lime">Neu · Gesetz ab 1. Januar 2027</span><b>${esc(auf.titel)}</b><p>${esc(auf.teaser)}</p><span class="rg-more">Lesen <span aria-hidden="true">→</span></span></div>${auf.app ? `<div class="rg-auf-ph"><img src="${pre}web/img/app/${auf.app.bild}.jpg" alt="" width="390" height="844"></div>` : ''}</a>` : ''}
<div class="rg-start"><span class="rg-gk">Start hier</span><b>In 5 Schritten zur ersten Aktie</b><ol>${start}</ol></div></div>
<div class="w rg-welten"><h2 class="rg-h2">Themenwelten</h2><nav class="rg-wnav" aria-label="Themenwelten">${W.map((w) => `<a href="#${w.id}">${ic(w.icon, 16)}${esc(w.name)}</a>`).join('')}</nav>${weltenHtml}<p class="rg-leer" hidden data-rg-leer>Dazu gibt es noch keinen Ratgeber. Schreib uns, was dich interessiert.</p></div>
<section class="w rg-cta"><div><b>Was du hier liest, zeigt die App für jede Aktie.</b><p>KGV, Dividende, Schulden, große Fonds: in einfachen Sätzen, mit Datum und Quelle.</p></div><a class="rg-btn lime" href="${pre}#newsletter">Zum Start benachrichtigen <span aria-hidden="true">→</span></a></section>`;
  const url = `${SITE}/ratgeber/`;
  const ld = [{'@type': 'CollectionPage', '@id': url + '#ratgeber', name: 'Ratgeber: Geld und Börse, einfach erklärt', url, inLanguage: 'de-DE', publisher: ORG,
    hasPart: Object.values(artikel).map((a) => ({'@type': 'Article', headline: a.titel, url: `${SITE}/ratgeber/${a.slug}/`}))}, ldKrumen([['Vision Universe', `${SITE}/`], ['Ratgeber', url]])];
  const stand = Object.values(artikel).map((a) => a.stand).sort().at(-1);
  return {pfad: 'ratgeber/index.html', stand, html: seite({pfad: 'ratgeber/index.html', titel: 'Ratgeber: Aktien, ETFs und Altersvorsorge einfach erklärt · Vision Universe', beschreibung: 'Wie funktionieren Aktien, was ist ein KGV, was bringt das Altersvorsorgedepot? Antworten in einfachen Sätzen, mit Grafiken zum Ausprobieren und echten Beispielen.', ld, body, newsHtml})};
}

function weltSeite(w, ctx) {
  const {artikel, newsHtml} = ctx, pre = '../../../', pfad = `ratgeber/thema/${w.id}/index.html`, url = `${SITE}/ratgeber/thema/${w.id}/`;
  const body = `<header class="rg-hero w">${krumen(pre, [['Ratgeber', `${pre}ratgeber/`], [w.name, null]])}
<span class="rg-tag"><span class="ic">${ic(w.icon, 16)}</span>Themenwelt</span><h1>${esc(w.name)}: <mark>${esc(w.satz)}</mark></h1><p class="rg-sub">${esc(w.beschreibung)}</p></header>
<div class="w rg-welten"><div class="rg-grid">${w.artikel.map(([s, t]) => (artikel[s] ? karte(artikel[s], w, pre, true) : bald(t, w))).join('')}</div>
<p class="rg-zur"><a href="${pre}ratgeber/">← Alle Themenwelten</a></p></div>`;
  const da = w.artikel.map(([s]) => artikel[s]).filter(Boolean);
  const ld = [{'@type': 'CollectionPage', '@id': url, name: `${w.name}: ${w.satz}`, description: w.beschreibung, url, inLanguage: 'de-DE', publisher: ORG, isPartOf: {'@id': `${SITE}/ratgeber/#ratgeber`},
    hasPart: da.map((a) => ({'@type': 'Article', headline: a.titel, url: `${SITE}/ratgeber/${a.slug}/`}))}, ldKrumen([['Vision Universe', `${SITE}/`], ['Ratgeber', `${SITE}/ratgeber/`], [w.name, url]])];
  return {pfad, stand: da.map((a) => a.stand).sort().at(-1) || null, html: seite({pfad, titel: `${w.name}: ${w.satz} · Vision Universe Ratgeber`, beschreibung: w.beschreibung, ld, body, newsHtml})};
}

// Startseiten-Balken (Platzhalter <!--RATGEBER:balken-->…<!--/RATGEBER:balken--> in landing/index.html).
export function balken(ctx, pre = './') {
  const {welten, artikel} = ctx, W = welten.welten;
  const reihe = [welten.aufmacher, ...welten.startHier, ...Object.keys(artikel)].filter((s, i, l) => artikel[s] && l.indexOf(s) === i).slice(0, 5);
  const auf = artikel[reihe[0]];
  return `<section class="rg-bar" aria-labelledby="rg-bar-h"><div class="w"><div class="rg-bar-head"><div><p class="rg-bar-k"><i aria-hidden="true"></i>Ratgeber · Geld und Börse einfach erklärt</p><h2 class="rg-bar-h" id="rg-bar-h">${esc(auf.titel)}</h2></div><a class="rg-btn lime" href="${pre}ratgeber/">Alle Ratgeber <span aria-hidden="true">→</span></a></div>
<div class="rg-bar-rail">${reihe.map((s, i) => { const a = artikel[s], w = W.find((x) => x.id === a.welt); return `<a class="rg-bar-c${i ? '' : ' on'}" href="${pre}ratgeber/${s}/"><span class="rg-card-w">${ic(w.icon, 16)}${esc(w.name)}</span><b>${esc(a.titel)}</b><span class="rg-more">Lesen <span aria-hidden="true">→</span></span></a>`; }).join('')}</div></div></section>`;
}

export function ratgeberSeiten(base = root) {
  const ctx = {...laden(base), newsHtml: readFileSync(resolve(base, 'news/index.html'), 'utf8')};
  const seiten = [uebersicht(ctx), ...ctx.welten.welten.map((w) => weltSeite(w, ctx)), ...Object.values(ctx.artikel).map((a) => artikelSeite(a, ctx))];
  return {seiten, balken: balken(ctx), ctx};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  if (i < 0) { console.error('Aufruf: node landing/scripts/ratgeber.mjs --out DIR'); process.exit(2); }
  const out = resolve(process.argv[i + 1]);
  const {seiten} = ratgeberSeiten();
  for (const s of seiten) { mkdirSync(dirname(resolve(out, s.pfad)), {recursive: true}); writeFileSync(resolve(out, s.pfad), s.html); }
  console.log(`Ratgeber: ${seiten.length} Seiten → ${out}`);
}

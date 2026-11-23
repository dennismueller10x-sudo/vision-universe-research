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

/* ---------------------------------------------- Lese-Bausteine (Runde 2): Icons, Haken, Kennzahlen, Vergleich, Zeitstrahl ---------------------------------------------- */
export const ICONS = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', uhr: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  muenze: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>', chart: '<path d="M4 20h16"/><path d="m5 15 4-4 3 3 6-7"/>',
  schild: '<path d="M12 3 19.5 6v5.5c0 4.6-3.2 7.9-7.5 9.5-4.3-1.6-7.5-4.9-7.5-9.5V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', globus: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.5 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.5-3.7-8.5s1.2-5.9 3.7-8.5"/>',
  bank: '<path d="M3.5 9 12 4l8.5 5"/><path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 20h17"/>', dok: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/>',
  menschen: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.2a4.5 4.5 0 0 1 5 5.3"/>', blitz: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  ziel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>', waage: '<path d="M12 4v16M6 20h12M5 7h14"/><path d="m5 7-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  sparschwein: '<path d="M5 11a6 5 0 0 1 12-1h1.5l1 2-1.5 1v2.5H16l-1 3h-2v-2H9v2H7l-1-3a5 5 0 0 1-1-4.5z"/><circle cx="14.5" cy="10.5" r=".8" fill="currentColor"/>', kalender: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  lupe: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', warnung: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.5"/>', geschenk: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3.5 9h17v3h-17zM12 9v11M12 9c-2-4-6-3.5-5-1s5 1 5 1 4 1.5 5-1-3-3-5 1"/>',
  prozent: '<path d="M18 6 6 18"/><circle cx="7.5" cy="7.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/>', schichten: '<path d="m12 3.5 9 4.5-9 4.5-9-4.5z"/><path d="m3 12.5 9 4.5 9-4.5"/>',
  rakete: '<path d="M12 3c3.3 2.8 4.3 7 3.3 11.5H8.7C7.7 10 8.7 5.8 12 3z"/><circle cx="12" cy="9" r="1.6"/><path d="M8.7 12.5 5.5 16l3.2-.4M15.3 12.5l3.2 3.5-3.2-.4M10.5 17.5 12 21l1.5-3.5"/>', auge: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  haus: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M6 9.5V20h12V9.5"/>', pfeil: '<path d="M5 12h14m-5-5 5 5-5 5"/>', schloss: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
};
const icn = (n, s = 22) => ic(ICONS[n] || ICONS.check, s);

// Kennzahl-Kacheln: große Zahl, kurzer Satz.
G['fakten'] = (g) => `<div class="rg-fakten n${Math.min(g.items.length, 4)}">${g.items.map((x, i) => `<div class="${i === 0 && g.hervor !== false ? 'lime' : ''}">${x.icon ? `<span class="rg-fi">${icn(x.icon, 20)}</span>` : ''}<b>${x.zahl}</b><span>${x.text}</span></div>`).join('')}</div>`;
// Haken-Liste (art: ok = Haken, nein = Kreuz, gemischt: Punkte mit {t, ok}).
G['check'] = (g) => `<div class="rg-check-b">${g.titel ? `<p class="rg-check-t">${g.titel}</p>` : ''}<ul class="rg-checks">${g.items.map((x) => { const t = typeof x === 'string' ? x : x.t, ok = typeof x === 'string' ? g.art !== 'nein' : x.ok; return `<li class="${ok ? 'ok' : 'nein'}"><span>${icn(ok ? 'check' : 'x', 16)}</span><p>${t}</p></li>`; }).join('')}</ul></div>`;
// Icon-Module: Symbol, Titel, Satz.
G['icons'] = (g) => `<div class="rg-icons n${Math.min(g.items.length, 3)}">${g.items.map((x) => `<div><span class="rg-ii">${icn(x.icon, 24)}</span><b>${x.titel}</b><p>${x.text}</p></div>`).join('')}</div>`;
// Vergleich in zwei Spalten.
G['vergleich'] = (g) => `<div class="rg-vgl"><div><p class="rg-vgl-h">${g.links.titel}</p><ul>${g.links.punkte.map((p) => `<li><span>${icn(p.startsWith('–') ? 'x' : 'check', 15)}</span>${esc(p.replace(/^[+–]\s*/, ''))}</li>`).join('')}</ul></div><div class="dark"><p class="rg-vgl-h">${g.rechts.titel}</p><ul>${g.rechts.punkte.map((p) => `<li><span>${icn(p.startsWith('–') ? 'x' : 'check', 15)}</span>${esc(p.replace(/^[+–]\s*/, ''))}</li>`).join('')}</ul></div></div>`;
// Zeitstrahl.
G['zeitstrahl'] = (g) => `<ol class="rg-zeit">${g.items.map((x, i) => `<li class="${i === (g.aktiv ?? -1) ? 'on' : ''}"><b>${x.wann}</b><p>${x.was}</p></li>`).join('')}</ol>`;
// Nummerierte Schritt-Karten.
G['schrittkarten'] = (g) => `<ol class="rg-skarten">${g.items.map((x, i) => `<li><span class="rg-n">${i + 1}</span><div><b>${x.titel}</b><p>${x.text}</p></div></li>`).join('')}</ol>`;

/* ---------------------------------------------- Neue Grafiken (Runde 2) ---------------------------------------------- */
const chips = (ts, D, attrs) => `<div class="rg-chips" role="group" aria-label="Beispiel wählen">${ts.map((t, i) => `<button type="button" class="rg-chip${i ? '' : ' on'}" ${attrs(D.aktien[t], t)}>${esc(D.aktien[t].name)}</button>`).join('')}</div>`;

// Marge: von 100 $ Umsatz bleiben … als Münzen.
G['marge'] = (g, D) => {
  const a = D.aktien[g.ticker[0]], m = Math.round(a.marge * 100);
  return `<figure class="rg-g rg-marge" data-g="marge"><figcaption class="rg-gk">Zum Ausprobieren · von 100 $ Umsatz bleiben als Gewinn</figcaption>${chips(g.ticker, D, (x) => `data-m="${x.marge}" data-name="${esc(x.name)}"`)}
<div class="rg-marge-g"><div class="rg-100" aria-hidden="true">${Array.from({length: 100}, (_, i) => `<i class="${i < m ? 'f' : ''}"></i>`).join('')}</div><div class="rg-marge-z"><b data-o="m">${m} $</b><span data-o="satz">bleiben bei ${esc(a.name)} von 100 $ Umsatz als Gewinn.</span></div></div>
${quelleZeile(D, '; Nettomarge der letzten vier Quartale')}</figure>`;
};

// Marktwert: Kurs × Aktienanzahl, Balken im Vergleich.
G['marktwert'] = (g, D) => {
  const xs = g.ticker.map((t) => D.aktien[t]), max = Math.max(...xs.map((x) => x.marktwertUSD));
  return `<figure class="rg-g rg-bars rg-mw" data-g="balken"><figcaption class="rg-gk">Börsenwert im Vergleich</figcaption><ul>${xs.map((x) => `<li style="--w:${(x.marktwertUSD / max * 100).toFixed(1)}"><span>${esc(x.name)}</span><i></i><b>${zahl(x.marktwertUSD / 1e9, 0)}</b><small>${usd(x.kurs)} × ${zahl(x.aktienAnzahl / 1e9, 2)} Mrd. Aktien</small></li>`).join('')}</ul><p class="rg-bars-m">Werte in Milliarden Dollar</p>${quelleZeile(D, '; Aktienanzahl laut letztem Bericht')}</figure>`;
};

// Gewinn je Aktie und Aktienrückkauf.
G['eps-rueckkauf'] = (g, D) => {
  const x = D.aktien[g.ticker], eps = x.gewinnUSD / x.aktienAnzahl;
  return `<figure class="rg-g rg-eps" data-g="eps" data-gewinn="${x.gewinnUSD}" data-aktien="${x.aktienAnzahl}" data-kurs="${x.kurs}"><figcaption class="rg-gk">Zum Ausprobieren · ${esc(x.name)} kauft eigene Aktien zurück</figcaption>
<div class="rg-formel"><span>${mrd(x.gewinnUSD)} Gewinn</span><em>÷</em><span data-o="aktien">${zahl(x.aktienAnzahl / 1e9, 2)} Mrd. Aktien</span><em>=</em><span class="l" data-o="eps">${usd(eps)}</span></div>
<div class="rg-sl"><label>Aktienrückkauf <output data-o="r">0 %</output><input type="range" min="0" max="20" step="1" value="0" data-i="r" aria-label="Anteil zurückgekaufter Aktien"></label></div>
<div class="rg-kacheln"><div><span>Gewinn je Aktie</span><b data-o="eps2">${usd(eps)}</b></div><div class="lime"><span>Veränderung</span><b data-o="plus">+0,0 %</b></div><div><span>KGV bei gleichem Kurs</span><b data-o="kgv">${zahl(x.kurs / eps, 1)}</b></div></div>
${quelleZeile(D, '; Gewinn je Aktie hier aus Gewinn ÷ Aktien, kann vom berichteten verwässerten Wert leicht abweichen')}</figure>`;
};

// Aktiensplit.
G['split'] = (g, D) => {
  const x = D.aktien[g.ticker];
  return `<figure class="rg-g rg-split" data-g="split" data-kurs="${x.kurs}"><figcaption class="rg-gk">Zum Ausprobieren · Aktiensplit</figcaption><div class="rg-chips" role="group" aria-label="Verhältnis"><button type="button" class="rg-chip on" data-f="2">2 für 1</button><button type="button" class="rg-chip" data-f="4">4 für 1</button><button type="button" class="rg-chip" data-f="10">10 für 1</button></div>
<div class="rg-split-g"><div><p class="rg-gk">Vorher</p><div class="rg-split-s" aria-hidden="true"><i></i></div><b>1 Aktie × ${usd(x.kurs)}</b></div><em aria-hidden="true">→</em><div><p class="rg-gk">Nachher</p><div class="rg-split-s" data-o="teile" aria-hidden="true"><i></i><i></i></div><b data-o="nach">2 Aktien × ${usd(x.kurs / 2)}</b></div></div>
<p class="rg-split-w">Wert vorher und nachher: <strong>${usd(x.kurs)}</strong>. Am Wert der Firma und an deinem Anteil ändert sich nichts.</p><p class="rg-src">Beispiel mit dem Schlusskurs von ${esc(x.name)} am ${datum(D.stand)}. Kein angekündigter Split.</p></figure>`;
};

// Orderbuch: Angebot und Nachfrage bewegen den Kurs (Schema).
G['orderbuch'] = () => `<figure class="rg-g rg-order" data-g="order"><figcaption class="rg-gk">Zum Ausprobieren · Angebot und Nachfrage (Schema)</figcaption>
<div class="rg-sl"><label>Kaufinteresse <output data-o="k">50</output><input type="range" min="0" max="100" value="50" data-i="k" aria-label="Kaufinteresse"></label><label>Verkaufsinteresse <output data-o="v">50</output><input type="range" min="0" max="100" value="50" data-i="v" aria-label="Verkaufsinteresse"></label></div>
<div class="rg-order-g"><div class="rg-order-b kauf"><span>Käufer</span><i data-o="kb" style="--w:50"></i></div><div class="rg-order-p"><span class="rg-gk">Kurs</span><b data-o="p">100,00 €</b><em data-o="d">±0,0 %</em></div><div class="rg-order-b verk"><span>Verkäufer</span><i data-o="vb" style="--w:50"></i></div></div>
<p class="rg-src">Vereinfachtes Schema: Wollen mehr kaufen als verkaufen, steigt der Preis, bis sich wieder Käufer und Verkäufer treffen. Echte Kurse entstehen im Orderbuch aus vielen einzelnen Aufträgen.</p></figure>`;

// Free Cashflow: operativer Cashflow minus Investitionen.
G['cashflow'] = (g, D) => {
  const x = D.aktien[g.ticker[0]], max = Math.max(...g.ticker.map((t) => D.aktien[t].cashflowUSD));
  const w = (v) => (Math.max(0, v) / max * 100).toFixed(1);
  return `<figure class="rg-g rg-cf" data-g="cashflow" data-max="${max}"><figcaption class="rg-gk">Zum Ausprobieren · vom Cashflow zum Free Cashflow</figcaption>${chips(g.ticker, D, (a) => `data-o1="${a.cashflowUSD}" data-o2="${a.investitionenUSD}" data-o3="${a.freeCashflowUSD}"`)}
<ul class="rg-cf-l"><li><span>Geld aus dem Geschäft</span><i data-o="w1" style="--w:${w(x.cashflowUSD)}"></i><b data-o="b1">${mrd(x.cashflowUSD)}</b></li><li class="minus"><span>minus Investitionen</span><i data-o="w2" style="--w:${w(x.investitionenUSD)}"></i><b data-o="b2">−${mrd(x.investitionenUSD)}</b></li><li class="fcf"><span>= Free Cashflow</span><i data-o="w3" style="--w:${w(x.freeCashflowUSD)}"></i><b data-o="b3">${x.freeCashflowUSD < 0 ? '−' : ''}${mrd(Math.abs(x.freeCashflowUSD))}</b></li></ul>
${quelleZeile(D, '; Cashflow der letzten vier Quartale')}</figure>`;
};

// Schulden und Bargeld.
G['schulden'] = (g, D) => {
  const xs = g.ticker.map((t) => [t, D.aktien[t]]).filter(([, x]) => x.schuldenUSD != null && x.barUSD != null), max = Math.max(...xs.flatMap(([, x]) => [x.schuldenUSD, x.barUSD]));
  return `<figure class="rg-g rg-debt"><figcaption class="rg-gk">Schulden und Bargeld im Vergleich</figcaption><ul>${xs.map(([, x]) => { const n = x.schuldenUSD - x.barUSD; return `<li><span>${esc(x.name)}</span><div><i class="s" style="--w:${(x.schuldenUSD / max * 100).toFixed(1)}"></i><i class="c" style="--w:${(x.barUSD / max * 100).toFixed(1)}"></i></div><b class="${n > 0 ? 'neg' : 'pos'}">${n > 0 ? `${mrd(n)} netto Schulden` : `${mrd(-n)} netto Bargeld`}</b></li>`; }).join('')}</ul>
<p class="rg-legende"><span><i class="s"></i>Schulden</span><span><i class="c"></i>Bargeld und kurzfristige Anlagen</span></p>${quelleZeile(D, '; Stand der letzten Bilanz')}</figure>`;
};

// Kosten über die Jahre.
export function kostenWirkung(monat, jahre, rendite, ter) {
  const a = sparplan(monat, jahre, rendite).wert, b = sparplan(monat, jahre, Math.max(rendite - ter, -0.99)).wert;
  return {ohne: a, mit: b, verlust: a - b};
}
G['kosten'] = () => {
  const k = kostenWirkung(200, 30, 0.05, 0.015), k2 = kostenWirkung(200, 30, 0.05, 0.002);
  return `<figure class="rg-g rg-kosten" data-g="kosten"><figcaption class="rg-gk">Zum Ausprobieren · was laufende Kosten ausmachen</figcaption>
<div class="rg-sl"><label>Sparrate im Monat <output data-o="m">200 €</output><input type="range" min="25" max="1000" step="25" value="200" data-i="m" aria-label="Sparrate"></label><label>Jahre <output data-o="j">30</output><input type="range" min="5" max="40" value="30" data-i="j" aria-label="Jahre"></label></div>
<div class="rg-kosten-g"><div><span class="rg-gk">Kosten 0,2 % im Jahr</span><b data-o="a">${zahl(k2.mit)} €</b><i class="bar" data-o="wa" style="--w:100"></i></div><div><span class="rg-gk">Kosten 1,5 % im Jahr</span><b data-o="b">${zahl(k.mit)} €</b><i class="bar dk" data-o="wb" style="--w:${(k.mit / k2.mit * 100).toFixed(1)}"></i></div></div>
<p class="rg-kosten-d">Unterschied: <strong data-o="d">${zahl(k2.mit - k.mit)} €</strong></p>
<p class="rg-src">Rechenbeispiel mit angenommenen 5 % im Jahr vor Kosten, monatlich verzinst, ohne Steuern. Keine Prognose.</p></figure>`;
};

// Thesaurierend oder ausschüttend: Ausschüttungen ausgeben oder wieder anlegen.
export function thesaurierung(start, jahre, kurs = 0.04, div = 0.02) {
  let a = start, b = start, aus = 0;
  for (let i = 0; i < jahre; i++) { a = a * (1 + kurs + div); aus += b * div; b = b * (1 + kurs); }
  return {thes: a, ausWert: b, ausGezahlt: aus};
}
G['thesaurierung'] = () => {
  const t = thesaurierung(10000, 20);
  return `<figure class="rg-g rg-thes" data-g="thes"><figcaption class="rg-gk">Zum Ausprobieren · 10.000 € über die Jahre</figcaption>
<div class="rg-sl"><label>Jahre <output data-o="j">20</output><input type="range" min="1" max="40" value="20" data-i="j" aria-label="Jahre"></label></div>
<div class="rg-kacheln"><div class="lime"><span>Thesaurierend: Wert im Depot</span><b data-o="a">${zahl(t.thes)} €</b></div><div><span>Ausschüttend: Wert im Depot</span><b data-o="b">${zahl(t.ausWert)} €</b></div><div><span>plus ausgezahlt (ausgegeben)</span><b data-o="c">${zahl(t.ausGezahlt)} €</b></div></div>
<p class="rg-src">Rechenbeispiel: 4 % Kursplus und 2 % Ausschüttung im Jahr, ohne Kosten und Steuern. Wer die Ausschüttungen selbst wieder anlegt, landet ungefähr beim thesaurierenden Ergebnis.</p></figure>`;
};

// Kursverlauf mit gleitenden Durchschnitten (ein Jahr).
export function gd(werte, n) { return werte.map((_, i) => (i + 1 < n ? null : werte.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n)); }
G['chart'] = (g, D) => {
  const s = D.serie, p = s.punkte.map((x) => x[1]), min = Math.min(...p) * 0.97, max = Math.max(...p) * 1.02;
  const xy = (v, i) => `${(i / (p.length - 1) * 600).toFixed(1)},${(220 - (v - min) / (max - min) * 210).toFixed(1)}`;
  const linie = (arr) => arr.map((v, i) => (v == null ? null : xy(v, i))).filter(Boolean).join(' ');
  const g50 = gd(p, 50);
  return `<figure class="rg-g rg-chart" data-g="chart"><figcaption class="rg-gk">Zum Ausprobieren · ${esc(s.name)}, ein Jahr</figcaption><div class="rg-chips" role="group" aria-label="Linien"><button type="button" class="rg-chip on" data-l="kurs" aria-pressed="true">Kurs</button><button type="button" class="rg-chip on" data-l="g50" aria-pressed="true">Durchschnitt 50 Tage</button><button type="button" class="rg-chip" data-l="trend" aria-pressed="false">Trendlinie</button></div>
<svg viewBox="0 0 600 230" class="rg-chart-s" role="img" aria-label="Kursverlauf ${esc(s.name)} mit 50-Tage-Durchschnitt"><polyline class="kurs" points="${linie(p)}"/><polyline class="g50" points="${linie(g50)}"/><line class="trend" x1="0" y1="${xy(p[0], 0).split(',')[1]}" x2="600" y2="${xy(p.at(-1), p.length - 1).split(',')[1]}"/></svg>
<div class="rg-chart-x"><span>${datum(s.punkte[0][0])}</span><span>${datum(s.punkte.at(-1)[0])}</span></div>
<p class="rg-src">Schlusskurse ${esc(s.name)} (${s.ticker}), Vision Universe Datenbank. Die Trendlinie verbindet nur ersten und letzten Kurs. Beispiel, keine Empfehlung.</p></figure>`;
};

// 12-Monats-Entwicklung (Momentum) im Vergleich.
G['momentum'] = (g, D) => {
  const xs = g.ticker.map((t) => D.aktien[t]).filter((x) => x.rendite12m != null).sort((a, b) => b.rendite12m - a.rendite12m), max = Math.max(...xs.map((x) => Math.abs(x.rendite12m)));
  return `<figure class="rg-g rg-mom"><figcaption class="rg-gk">Kursveränderung in zwölf Monaten</figcaption><ul>${xs.map((x) => `<li><span>${esc(x.name)}</span><div><i class="${x.rendite12m >= 0 ? 'p' : 'n'}" style="--w:${(Math.abs(x.rendite12m) / max * 50).toFixed(1)}"></i></div><b>${x.rendite12m >= 0 ? '+' : '−'}${pct(Math.abs(x.rendite12m), 0)}</b></li>`).join('')}</ul>${quelleZeile(D, '; Kursveränderung der letzten zwölf Monate bis zum Stichtag')}</figure>`;
};

// Elliott-Wellen: Schema zum Durchklicken.
G['elliott'] = () => {
  const pts = [[0, 200], [70, 130], [110, 160], [220, 50], [270, 95], [340, 20], [400, 90], [440, 60], [520, 150]];
  const txt = ['Welle 1: Erste Käufer steigen ein, kaum jemand bemerkt den Anstieg.', 'Welle 2: Gewinnmitnahmen, der Kurs fällt, aber nicht unter den Start.', 'Welle 3: meist die längste und stärkste Welle, viele steigen ein.', 'Welle 4: Pause und Rücksetzer.', 'Welle 5: letzter Anstieg, oft mit nachlassender Kraft.', 'Welle A: erster Rückgang nach dem Hoch.', 'Welle B: kurze Erholung.', 'Welle C: der Rückgang setzt sich fort.'];
  const lab = ['1', '2', '3', '4', '5', 'A', 'B', 'C'];
  return `<figure class="rg-g rg-ell" data-g="elliott"><figcaption class="rg-gk">Zum Durchklicken · das Wellenmuster (Schema)</figcaption><svg viewBox="0 0 540 220" class="rg-ell-s" role="img" aria-label="Schema: fünf Wellen aufwärts, drei abwärts"><polyline points="${pts.map((x) => x.join(',')).join(' ')}"/>${pts.slice(1).map(([x, y], i) => `<g class="pt${i === 0 ? ' on' : ''}" data-w="${i}" data-t="${esc(txt[i])}"><circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y + 5}">${lab[i]}</text></g>`).join('')}</svg>
<div class="rg-ell-t"><button type="button" class="rg-btn" data-i="zurueck" aria-label="Vorherige Welle">←</button><p data-o="t">${txt[0]}</p><button type="button" class="rg-btn lime" data-i="weiter" aria-label="Nächste Welle">→</button></div><p class="rg-src">Schema nach R. N. Elliott. Welche Welle gerade läuft, ist im echten Chart oft erst im Nachhinein klar.</p></figure>`;
};

// 13F: Top-Positionen bekannter Investoren.
G['fonds13f'] = (g, D) => {
  const ids = g.fonds, F = D.fonds, st = {unchanged: 'unverändert', reduced: 'verringert', added: 'aufgestockt', new: 'neu'};
  const panel = (id, i) => { const f = F[id]; return `<div class="rg-13f-p" data-p="${id}"${i ? ' hidden' : ''}><p class="rg-13f-k">${esc(f.manager)} · ${esc(f.name)} · Stichtag ${datum(f.stichtag)}, gemeldet ${datum(f.gemeldet)} · ${f.positionen} Positionen</p><ul>${f.top.map((x) => `<li style="--w:${Math.min(100, x.anteil * 1.5).toFixed(1)}"><span>${esc(x.name)}${x.art ? ` <em>${x.art === 'PUT' ? 'Put-Option' : 'Call-Option'}</em>` : ''}</span><i></i><b>${zahl(x.anteil, 1)} %</b><small>${st[x.status] || x.status}</small></li>`).join('')}</ul></div>`; };
  return `<figure class="rg-g rg-13f" data-g="fonds"><figcaption class="rg-gk">Zum Ausprobieren · was große Investoren gemeldet haben</figcaption><div class="rg-chips" role="group" aria-label="Investor wählen">${ids.map((id, i) => `<button type="button" class="rg-chip${i ? '' : ' on'}" data-f="${id}">${esc(F[id].manager)}</button>`).join('')}</div>${ids.map(panel).join('')}
<p class="rg-src">Formular 13F bei der SEC, Anteil am gemeldeten US-Depot. Zeigt nur meldepflichtige US-Wertpapiere, mit bis zu 45 Tagen Verzögerung. Keine Empfehlung.</p></figure>`;
};

// Rentenlücke.
export function rentenluecke(netto, anteil, rente, jahre, inflation = 0.02) {
  const heute = Math.max(0, netto * anteil - rente);
  return {heute, spaeter: heute * Math.pow(1 + inflation, jahre), bedarf20: heute * Math.pow(1 + inflation, jahre) * 12 * 20};
}
G['rentenluecke'] = () => {
  const r = rentenluecke(2500, 0.8, 1300, 30);
  return `<figure class="rg-g rg-rl" data-g="rente"><figcaption class="rg-gk">Zum Ausprobieren · deine Lücke grob überschlagen</figcaption>
<div class="rg-sl"><label>Netto heute im Monat <output data-o="n">2.500 €</output><input type="range" min="1000" max="6000" step="100" value="2500" data-i="n" aria-label="Netto im Monat"></label><label>Gewünscht im Alter <output data-o="a">80 %</output><input type="range" min="50" max="100" step="5" value="80" data-i="a" aria-label="Gewünschter Anteil"></label><label>Erwartete Rente laut Renteninformation <output data-o="r">1.300 €</output><input type="range" min="0" max="3000" step="50" value="1300" data-i="r" aria-label="Erwartete Rente"></label><label>Jahre bis zur Rente <output data-o="j">30</output><input type="range" min="1" max="45" value="30" data-i="j" aria-label="Jahre bis zur Rente"></label></div>
<div class="rg-kacheln"><div><span>Lücke im Monat, heutige Kaufkraft</span><b data-o="h">${zahl(r.heute)} €</b></div><div class="lime"><span>Lücke im Monat bei Rentenbeginn</span><b data-o="s">${zahl(r.spaeter)} €</b></div><div><span>Kapital für 20 Jahre Rente</span><b data-o="k">${zahl(r.bedarf20)} €</b></div></div>
<p class="rg-src">Grober Überschlag mit 2 % Preissteigerung im Jahr, Kapitalbedarf ohne Zinsen und ohne Steuern. Die erwartete Rente steht in der Renteninformation der Deutschen Rentenversicherung (Beträge dort ohne Preissteigerung).</p></figure>`;
};

// Indizes im Vergleich.
G['indizes'] = () => {
  const I = [['S&P 500', 'rund 500', '1 (USA)', 'Große US-Firmen'], ['MSCI World', 'rund 1.400', '23 Industrieländer', 'Große und mittlere Firmen aus Industrieländern'], ['MSCI ACWI', 'rund 2.500', '47 Länder', 'Industrie- und Schwellenländer']];
  return `<figure class="rg-g rg-idx" data-g="idx"><figcaption class="rg-gk">Zum Ausprobieren · drei bekannte Indizes</figcaption><div class="rg-chips" role="group" aria-label="Index wählen">${I.map(([n], i) => `<button type="button" class="rg-chip${i === 1 ? ' on' : ''}" data-x="${i}">${n}</button>`).join('')}</div>
${I.map(([n, f, l, s], i) => `<div class="rg-kacheln" data-x="${i}"${i === 1 ? '' : ' hidden'}><div class="lime"><span>Firmen</span><b>${f}</b></div><div><span>Länder</span><b>${l}</b></div><div><span>Was drin ist</span><b class="klein">${s}</b></div></div>`).join('')}
<p class="rg-src">Gerundete Angaben nach den Indexbeschreibungen von S&amp;P Dow Jones Indices und MSCI; die genaue Zahl der Firmen ändert sich bei jeder Überprüfung.</p></figure>`;
};

// Indexverlauf: was aus 10.000 $ geworden wäre (Gesamtrendite über die Index-ETFs), umschaltbar 10 und 5 Jahre.
const INDEX_REIHEN = [['SPY', 'S&P 500', 'sp'], ['URTH', 'MSCI World', 'mw'], ['ACWI', 'MSCI ACWI', 'ac']];
export function indexWerte(I, jahre) {
  const bis = I.daten.at(-1), grenze = `${Number(bis.slice(0, 4)) - jahre}${bis.slice(4)}`;
  const ab = Math.max(0, I.daten.findIndex((d) => d >= grenze));
  return Object.fromEntries(INDEX_REIHEN.map(([t]) => {
    const r = I.reihen[t].slice(ab), v = r.map((x) => x / r[0] * 10000), ende = v.at(-1);
    return [t, {v, ende, gesamt: ende / 10000 - 1, jahr: (ende / 10000) ** (1 / jahre) - 1}];
  }));
}
G['index-chart'] = (g, D) => {
  const I = D.indizes, W = indexWerte(I, 10), max = Math.max(...INDEX_REIHEN.map(([t]) => Math.max(...W[t].v))), lo = Math.min(...INDEX_REIHEN.map(([t]) => Math.min(...W[t].v))) * 0.95;
  const yv = (x) => (220 - (x - lo) / (max - lo) * 205).toFixed(1);
  const linie = (v) => v.map((x, i) => `${(i / (v.length - 1) * 600).toFixed(1)},${yv(x)}`).join(' ');
  return `<figure class="rg-g rg-ichart" data-g="ichart" data-d="${I.daten.join(',')}"${INDEX_REIHEN.map(([t]) => ` data-${t.toLowerCase()}="${I.reihen[t].join(',')}"`).join('')}><figcaption class="rg-gk">Zum Ausprobieren · was aus 10.000 $ geworden wäre</figcaption><div class="rg-chips" role="group" aria-label="Zeitraum"><button type="button" class="rg-chip on" data-j="10">10 Jahre</button><button type="button" class="rg-chip" data-j="5">5 Jahre</button></div>
<svg viewBox="0 0 600 230" class="rg-ichart-s" role="img" aria-label="Wertentwicklung S&amp;P 500, MSCI World und MSCI ACWI"><line class="basis" x1="0" x2="600" y1="${yv(10000)}" y2="${yv(10000)}"/>${INDEX_REIHEN.map(([t, , k]) => `<polyline class="${k}" data-o="l-${t}" points="${linie(W[t].v)}"/>`).join('')}</svg>
<div class="rg-chart-x"><span data-o="von">${datum(I.daten.find((d) => d >= `${Number(I.bis.slice(0, 4)) - 10}${I.bis.slice(4)}`))}</span><span>${datum(I.bis)}</span></div>
<ul class="rg-ichart-l">${INDEX_REIHEN.map(([t, n, k]) => `<li class="${k}"><i aria-hidden="true"></i><span>${esc(n)}</span><b data-o="e-${t}">${zahl(W[t].ende)} $</b><small><span data-o="g-${t}">+${zahl(W[t].gesamt * 100)} %</span> · <span data-o="j-${t}">${zahl(W[t].jahr * 100, 1)} %</span> pro Jahr</small></li>`).join('')}</ul>
<p class="rg-src">Gesamtrendite in US-Dollar mit wieder angelegten Ausschüttungen, gemessen an den ETFs SPY, URTH und ACWI; vor Steuern, ohne Wechselkurseffekt in Euro. Stand ${datum(I.bis)}. Vergangene Entwicklung sagt nichts über die Zukunft.</p></figure>`;
};

// Insider: vom Kauf bis zur Meldung.
G['insider-weg'] = () => `<figure class="rg-g"><figcaption class="rg-gk">Vom Kauf bis zur Meldung</figcaption><ol class="rg-zeit wagerecht"><li class="on"><b>Tag 0</b><p>Ein Vorstand kauft Aktien der eigenen Firma an der Börse.</p></li><li><b>bis 2 Werktage</b><p>Meldung an die SEC auf Formular 4, Code „P“ für einen Kauf am Markt.</p></li><li><b>sofort öffentlich</b><p>Die Meldung steht für alle sichtbar in der SEC-Datenbank EDGAR.</p></li></ol><p class="rg-src">Section 16 Securities Exchange Act; Formular 4 innerhalb von zwei Geschäftstagen.</p></figure>`;

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
  const heldBild = a.app ? `<div class="fh-phone"><div class="fh-wrap"><div class="fh-ph"><img src="${pre}web/img/app/${a.app.bild}.jpg" alt="${esc(a.app.alt || 'Vision Universe App')}" width="390" height="844"></div></div></div>` : '';
  const body = `<article class="rg-art">
<section class="fh ps-hero rg-art-hero"><div class="w fh-g"><div class="fh-copy">${krumen(pre, [['Ratgeber', `${pre}ratgeber/`], [w.name, `${pre}ratgeber/thema/${w.id}/`], [a.kurztitel || a.titel, null]])}
<span class="rg-tag"><span class="ic">${ic(w.icon, 16)}</span>${esc(w.name)}</span>
<h1>${a.h1}</h1><p class="fh-sub">${esc(a.untertitel)}</p>
<p class="rg-meta"><span class="rg-av" aria-hidden="true">VU</span>Redaktion Vision Universe · Stand ${datum(a.stand)} · ${lesezeit(a)} Min. Lesezeit</p></div>${heldBild}</div></section>
<div class="rg-body w"><div class="rg-text">
<aside class="rg-kurz"><span>Kurz gesagt</span><p>${a.kurz}</p></aside>
<nav class="rg-toc" aria-label="Inhalt"><span>Inhalt</span><ol>${toc}</ol></nav>
${abschnitte}
${app}
${faq}
<section class="rg-quellen"><p>Allgemeine Information, keine Anlage-, Steuer- oder Rechtsberatung. Vision Universe erklärt und vergleicht, empfiehlt aber keine Wertpapiere.</p></section>
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

const WELT_BILD = {altersvorsorge: 'vorsorge', einstieg: 'discover', 'aktien-verstehen': 'apple', kennzahlen: 'fundamental', 'etf-sparplan': 'portfolios', investoren: 'hedgefonds'};
const anzahlFertig = (w, artikel) => w.artikel.filter(([s]) => artikel[s]).length;

// Lange Einzelwörter (z. B. Marktkapitalisierung) bekommen eine kleinere Kachelschrift statt Silbentrennung.
const langesWort = (t) => (String(t).split(/[\s-]+/).some((w) => w.length > 13) ? ' class="lang"' : '');
// Kleine Schaukarten für den Kopf der Übersicht: zeigen, was die Grafiken in den Artikeln können.
function schaukarten(D) {
  const ko = D.aktien.KO, pep = D.aktien.PEP, k = ko.kurs / ko.gewinnJeAktie;
  const muenzen = Array.from({length: 30}, (_, i) => `<i class="${i < Math.floor(k) ? 'f' : i < k ? 'h' : ''}"></i>`).join('');
  return `<div class="rg-hv" aria-hidden="true">
<div class="rg-hc c1"><span class="rg-gk">KGV · ${esc(ko.name)}</span><b>${zahl(k, 1)} <small>Jahresgewinne</small></b><div class="rg-muenzen mini">${muenzen}</div></div>
<div class="rg-hc c2 dark"><span class="rg-gk">Altersvorsorgedepot 2027</span><b>+540 € <small>Zulage im Jahr</small></b><div class="rg-stack"><i class="du" style="--w:77"></i><i class="st" style="--w:23"></i></div></div>
<div class="rg-hc c3"><span class="rg-gk">Dividende · ${esc(pep.name)}</span><b>${pct(pep.dividendenRendite)} <small>im Jahr</small></b><div class="rg-mbars"><i style="--h:100"></i><i style="--h:66"></i><i style="--h:53"></i><i style="--h:18"></i><i style="--h:8"></i></div></div>
</div>`;
}

function uebersicht(ctx) {
  const {welten, artikel, daten, newsHtml} = ctx, pre = '../', W = welten.welten;
  const auf = artikel[welten.aufmacher];
  const anzahl = W.reduce((n, w) => n + w.artikel.length, 0), fertig = Object.keys(artikel).length;
  const tiles = W.map((w, i) => `<a class="vw-tile${['', ' dark', '', ' dark', '', ' dark'][i]}" href="${pre}ratgeber/thema/${w.id}/"><span class="vw-ti">${ic(w.icon, 22)}</span><b${langesWort(w.name)}>${esc(w.name)}</b><small>${esc(w.satz)}</small><span class="rg-tile-n">${anzahlFertig(w, artikel) ? (anzahlFertig(w, artikel) === w.artikel.length ? `${w.artikel.length} Artikel` : `${anzahlFertig(w, artikel)} von ${w.artikel.length} Artikeln`) : 'Bald'}</span><span class="vw-shot"><img src="${pre}web/img/app/${WELT_BILD[w.id]}.jpg" alt="" loading="lazy"></span></a>`).join('');
  const start = welten.startHier.map((s, i) => { const a = artikel[s]; const t = a ? a.titel : W.flatMap((w) => w.artikel).find((x) => x[0] === s)?.[1];
    return a ? `<a class="rg-step" href="${pre}ratgeber/${s}/"><i>${i + 1}</i><b>${esc(t)}</b><span class="rg-more">Lesen <span aria-hidden="true">→</span></span></a>` : `<div class="rg-step bald"><i>${i + 1}</i><b>${esc(t)}</b><span class="rg-bald">Bald</span></div>`; }).join('');
  const liste = W.map((w) => `<section class="rg-welt" id="${w.id}"><div class="rg-welt-h"><a href="${pre}ratgeber/thema/${w.id}/"><span class="rg-welt-ic">${ic(w.icon, 24)}</span><span><b>${esc(w.name)}</b><small>${esc(w.satz)}</small></span></a></div><div class="rg-grid">${w.artikel.filter(([s]) => artikel[s]).map(([s]) => karte(artikel[s], w, pre)).join('')}</div>${w.artikel.some(([s]) => !artikel[s]) ? `<p class="rg-bald-l"><span class="rg-bald">Bald</span> ${w.artikel.filter(([s]) => !artikel[s]).map(([, t]) => esc(t)).join(' · ')}</p>` : ''}</section>`).join('');
  const body = `<section class="fh ps-hero rg-ov-hero"><div class="w fh-g"><div class="fh-copy">${krumen(pre, [['Ratgeber', null]])}
<span class="rg-tag"><span class="ic">${ic(W[3].icon, 16)}</span>Ratgeber · ${fertig} Artikel</span>
<h1>Geld und Börse, <mark>einfach erklärt.</mark></h1>
<p class="fh-sub">Mit Grafiken zum Ausprobieren und echten Zahlen von echten Firmen.</p>
<div class="rg-ctas"><a class="fh-btn" href="#start-hier">Jetzt starten <i aria-hidden="true">→</i></a>${auf ? `<a class="rg-btn ghost" href="${pre}ratgeber/${auf.slug}/">Neu: ${esc(auf.kurztitel || auf.titel)} 2027</a>` : ''}</div></div>
${schaukarten(daten)}</div></section>
<section class="vw-facts w rg-facts"><p class="vw-k">Was diesen Ratgeber besonders macht</p><h2 class="vw-h2">Lesen, ausprobieren, <em>verstehen.</em></h2><div class="vw-fgrid">
<div class="vw-fact"><i aria-hidden="true">1</i><b>Zum Anfassen.</b><p>Schieberegler und Rechner statt Formelwüste.</p></div>
<div class="vw-fact"><i aria-hidden="true">2</i><b>Echte Beispiele.</b><p>Coca-Cola, Nvidia, Microsoft: mit Datum und Quelle.</p></div>
<div class="vw-fact"><i aria-hidden="true">3</i><b>Kurz gesagt.</b><p>Jede Antwort in wenigen Sätzen vorneweg.</p></div>
<div class="vw-fact"><i aria-hidden="true">4</i><b>Ohne Verkauf.</b><p>Keine Provision, keine Empfehlung. Nur Erklärung.</p></div></div></section>
<section class="vw-bento w rg-bento"><p class="vw-k">Themenwelten</p><h2 class="vw-h2">Wo willst du <em>anfangen?</em></h2><div class="vw-tiles">${tiles}</div></section>
${auf ? `<section class="rg-band" data-dark><div class="w rg-band-g"><div><p class="vw-k">Neu · Gesetz ab 1. Januar 2027</p><h2 class="vw-h2">Das Altersvorsorgedepot <em>kommt.</em></h2><p class="rg-band-s">${esc(auf.teaser)}</p><a class="fh-btn lime" href="${pre}ratgeber/${auf.slug}/">Was sich ändert <i aria-hidden="true">→</i></a></div>
<ul class="rg-zahlen"><li><b>540 €</b><span>Zulage im Jahr</span></li><li><b>300 €</b><span>extra je Kind</span></li><li><b>200 €</b><span>Startbonus unter 25</span></li><li><b>1,0 %</b><span>Kostendeckel Standarddepot</span></li></ul></div></section>` : ''}
<section class="w rg-start-s" id="start-hier"><p class="vw-k">Start hier</p><h2 class="vw-h2">In 5 Schritten <em>zur ersten Aktie.</em></h2><div class="rg-path">${start}</div></section>
<section class="w rg-alle" id="alle"><p class="vw-k">Alle Ratgeber</p><h2 class="vw-h2">${fertig === anzahl ? `${anzahl} Antworten, <em>alle auf einen Blick.</em>` : `${anzahl} Fragen, <em>${fertig} Antworten schon da.</em>`}</h2>
<label class="rg-such"><span class="rg-sr">Ratgeber durchsuchen</span>${ic('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 20)}<input type="search" placeholder="Wonach suchst du? z. B. KGV oder Sparplan" data-rg-such autocomplete="off"></label>
${liste}<p class="rg-leer" hidden data-rg-leer>Dazu gibt es noch keinen Ratgeber.</p></section>
<section class="w"><div class="rg-cta"><div><b>Was du hier liest, zeigt die App für jede Aktie.</b><p>KGV, Dividende, Schulden, große Fonds: in einfachen Sätzen.</p></div><a class="fh-btn lime" href="${pre}#newsletter">Zum Start benachrichtigen <i aria-hidden="true">→</i></a></div></section>`;
  const url = `${SITE}/ratgeber/`;
  const ld = [{'@type': 'CollectionPage', '@id': url + '#ratgeber', name: 'Ratgeber: Geld und Börse, einfach erklärt', url, inLanguage: 'de-DE', publisher: ORG,
    hasPart: Object.values(artikel).map((a) => ({'@type': 'Article', headline: a.titel, url: `${SITE}/ratgeber/${a.slug}/`}))}, ldKrumen([['Vision Universe', `${SITE}/`], ['Ratgeber', url]])];
  const stand = Object.values(artikel).map((a) => a.stand).sort().at(-1);
  return {pfad: 'ratgeber/index.html', stand, html: seite({pfad: 'ratgeber/index.html', titel: 'Ratgeber: Aktien, ETFs und Altersvorsorge einfach erklärt · Vision Universe', beschreibung: 'Wie funktionieren Aktien, was ist ein KGV, was bringt das Altersvorsorgedepot? Antworten in einfachen Sätzen, mit Grafiken zum Ausprobieren und echten Beispielen.', ld, body, newsHtml})};
}

function weltSeite(w, ctx) {
  const {artikel, newsHtml} = ctx, pre = '../../../', pfad = `ratgeber/thema/${w.id}/index.html`, url = `${SITE}/ratgeber/thema/${w.id}/`;
  const da = w.artikel.map(([s]) => artikel[s]).filter(Boolean);
  const tiles = da.map((a, i) => `<a class="vw-tile${i % 3 === 1 ? ' dark' : ''}" href="${pre}ratgeber/${a.slug}/"><span class="vw-ti">${ic(w.icon, 22)}</span><b${langesWort(a.titel)}>${esc(a.titel)}</b><small>${esc(a.teaser)}</small>${a.app ? `<span class="vw-shot"><img src="${pre}web/img/app/${a.app.bild}.jpg" alt="" loading="lazy"></span>` : ''}</a>`).join('');
  const bald = w.artikel.filter(([s]) => !artikel[s]);
  const body = `<section class="fh ps-hero rg-art-hero"><div class="w fh-g"><div class="fh-copy">${krumen(pre, [['Ratgeber', `${pre}ratgeber/`], [w.name, null]])}
<span class="rg-tag"><span class="ic">${ic(w.icon, 16)}</span>Themenwelt</span><h1>${esc(w.name)}: <mark>${esc(w.satz)}</mark></h1><p class="fh-sub">${esc(w.beschreibung)}</p></div>
<div class="fh-phone"><div class="fh-wrap"><div class="fh-ph"><img src="${pre}web/img/app/${WELT_BILD[w.id]}.jpg" alt="" width="390" height="844"></div></div></div></div></section>
<section class="vw-bento w rg-bento rg-wt"><p class="vw-k">${da.length} ${da.length === 1 ? 'Artikel' : 'Artikel'}</p><div class="vw-tiles">${tiles}</div>
${bald.length ? `<p class="rg-bald-l"><span class="rg-bald">Bald</span> ${bald.map(([, t]) => esc(t)).join(' · ')}</p>` : ''}
<p class="rg-zur"><a href="${pre}ratgeber/">← Alle Themenwelten</a></p></section>`;
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

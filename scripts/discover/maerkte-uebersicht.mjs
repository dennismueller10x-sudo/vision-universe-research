// Maerkte-Uebersicht (#/maerkte, V3 seit #2208/#2258): Auslesen und Pruefen.
// Getrennt von browser-qa-maerkte.mjs, damit ein Test dieselben Pruefungen gegen
// einen Mitschnitt der echten V3-Ansicht laufen lassen kann
// (discover/tests/fixtures/maerkte-v3.html, aufgenommen mit
// scripts/discover/record-maerkte-fixture.mjs aus discover/ui/v3.js und den
// Repo-Marktdaten). Die Detailseiten und das Barometer (#/maerkte/<SYMBOL>,
// #/maerkte/einordnung) haben eigene Pruefungen im QA-Skript.

export const PFLICHT = {
  aktien: ['QQQ', 'SPY', 'DIA', 'N225'],
  energie: ['WTI', 'BRENT', 'NATGAS'],
  edelmetalle: ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD'],
  krypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'],
  'us-renditen': ['US2Y', 'US5Y', 'US10Y', 'US30Y'],
  'eu-renditen': ['DE2Y', 'DE10Y', 'DE30Y'],
  leitzinsen: ['FED_TARGET', 'US_EFFR', 'ECB_DFR'],
  devisen: ['EURUSD']
};
export const TRACKER = { QQQ: 'Nasdaq 100', SPY: 'S&P 500', DIA: 'Dow Jones' };
const ALLE = Object.values(PFLICHT).flat();

/** Laeuft im Browser: liest, was die Uebersicht zeigt (keine Closure ueber Modulwerte). */
export function leseUebersicht() {
  const wurzel = document.querySelector('.dx-maerkte');
  if (!wurzel) return null;
  const text = (n, s) => { const x = n.querySelector(s); return x ? x.textContent.trim() : null; };
  const sektionVon = (n) => { const s = n.closest('section'); return s && s.id ? s.id : null; };
  const zeilen = [...wurzel.querySelectorAll('.dv3-mrow')].map((z) => {
    const href = z.getAttribute('href');
    const preis = z.querySelector('.vu-lrow__price');
    const pille = preis ? preis.querySelector('.vu-chg') : null;
    return {
      tag: z.tagName.toLowerCase(),
      href,
      symbol: href && /^#\/maerkte\/([A-Z0-9_]+)$/.test(href) ? href.replace('#/maerkte/', '') : null,
      sektion: sektionVon(z),
      titel: text(z, '.vu-lrow__name b'),
      zusatz: text(z, '.vu-lrow__name span'),
      wert: preis && preis.firstElementChild ? preis.firstElementChild.textContent.trim() : null,
      veraenderung: pille ? pille.textContent.replace(/[▲▼]/g, '').trim() : null,
      richtung: pille ? (pille.classList.contains('vu-chg--down') ? 'down' : pille.classList.contains('vu-chg--flat') ? 'flat' : 'up') : null
    };
  });
  const kinder = [...wurzel.children].map((n) => n.id || (n.className || '').split(' ').find((c) => /^(dv3-baro|dv3-hist|dv3-jumps|dv3-sec|vu-navcard|v2-back|vu-lt|vu-lead)$/.test(c)) || n.tagName.toLowerCase());
  const baro = wurzel.querySelector('.dv3-baro');
  const h1 = wurzel.querySelector('h1');
  const rect = h1 ? h1.getBoundingClientRect() : null;
  const navcard = wurzel.querySelector('a.vu-navcard');
  const aktien = document.getElementById('maerkte-aktien');
  const weitere = document.getElementById('maerkte-weitere');
  return {
    titel: h1 ? h1.textContent.trim() : '',
    titelSichtbar: !!rect && rect.width > 40 && rect.height > 20,
    kinder,
    chips: [...wurzel.querySelectorAll('.dv3-jumps button')].map((b) => b.textContent.trim()),
    baro: baro ? {
      wort: text(baro, '.dv3-baro__word'),
      stufe: text(baro, '.dv3-baro__head span'),
      skala: baro.querySelectorAll('.dv3-scale li').length,
      heute: baro.querySelectorAll('.dv3-scale li.on').length,
      knopf: text(baro, 'button')
    } : null,
    navcard: navcard ? navcard.getAttribute('href') : null,
    aktienHinweis: aktien ? aktien.textContent : '',
    weitereHinweis: weitere ? weitere.textContent : '',
    zeilen,
    zeilenLinks: [...wurzel.querySelectorAll('a.dv3-mrow')].map((a) => a.getAttribute('href')),
    moversLinks: [...wurzel.querySelectorAll('.dv3-mcol a')].map((a) => a.getAttribute('href')),
    oddLinks: [...wurzel.querySelectorAll('a.dv3-odd')].map((a) => a.getAttribute('href')),
    querlauf: document.documentElement.scrollWidth > window.innerWidth
  };
}

/** Prueft die ausgelesene Uebersicht. Liefert [{name, pass, detail}]. */
export function pruefeUebersicht(seite, { mobil = false, seitenfehler = [] } = {}) {
  const out = [];
  const p = (name, ok, detail) => out.push({ name, pass: !!ok, detail: detail === undefined ? null : detail });
  if (!seite) { p('Uebersicht: Seite gerendert (.dx-maerkte)', false, 'fehlt'); return out; }
  const pos = (id) => seite.kinder.indexOf(id);
  const idx = (pred) => seite.kinder.findIndex(pred);
  const baro = idx((k) => k === 'dv3-baro');
  const chips = idx((k) => k === 'dv3-jumps');
  const aktien = pos('maerkte-aktien');
  const weitere = pos('maerkte-weitere');
  const karte = idx((k) => k === 'vu-navcard');
  p('Uebersicht: Titel "Märkte" sichtbar', seite.titel === 'Märkte' && seite.titelSichtbar, { titel: seite.titel });
  p('Uebersicht: Marktbarometer ganz oben -> Reiter -> Aktienmaerkte -> weitere Maerkte -> Weg zur Einordnung',
    baro >= 0 && baro < chips && chips < aktien && aktien < weitere && weitere < karte, seite.kinder);
  p('Uebersicht: Marktbarometer mit Stufe, Fuenferskala (eine Stufe markiert) und Knopf "Was heißt ...?"',
    !!seite.baro && !!seite.baro.wort && /^Stufe \d von 5$/.test(seite.baro.stufe || '') && seite.baro.skala === 5 && seite.baro.heute === 1 &&
    /^Was heißt „[^“]+“\?$/.test(seite.baro.knopf || ''), seite.baro);
  p('Uebersicht: Weg zur 2-Minuten-Erklaerung (#/maerkte/einordnung)', seite.navcard === '#/maerkte/einordnung', seite.navcard);
  p('Uebersicht: Reiter springen zu Aktien und Zinsen', seite.chips.includes('Aktien') && seite.chips.includes('Zinsen'), seite.chips);

  /* Jedes Pflichtinstrument: eigene Zeile als Link (nur AVAILABLE ist ein Link), Wert vorhanden. */
  const nach = Object.fromEntries(seite.zeilen.filter((z) => z.symbol).map((z) => [z.symbol, z]));
  for (const [gruppe, syms] of Object.entries(PFLICHT)) {
    for (const s of syms) {
      const z = nach[s];
      const platz = gruppe === 'aktien' ? 'maerkte-aktien' : 'maerkte-weitere';
      p(s + ' in ' + gruppe + ' mit Wert', z && z.tag === 'a' && z.sektion === platz && !!z.wert && z.wert !== '–' && !!z.veraenderung,
        z ? { sektion: z.sektion, wert: z.wert, veraenderung: z.veraenderung } : 'fehlt');
    }
  }
  p('Alle Pflichtinstrumente genau einmal (' + ALLE.length + ')', ALLE.every((s) => seite.zeilen.filter((z) => z.symbol === s).length === 1), ALLE.filter((s) => !nach[s]));
  p('Keine Zeile ohne Link (kein nicht verfuegbarer Wert, kein Duplikat)', seite.zeilen.every((z) => z.tag === 'a' && z.symbol), seite.zeilen.filter((z) => !(z.tag === 'a' && z.symbol)).map((z) => z.titel));
  p('Jede Zeile mit Wert ist ein Link zum Marktdetail', seite.zeilenLinks.length >= 28 && seite.zeilenLinks.every((h) => /^#\/maerkte\/[A-Z0-9_]+$/.test(h)), seite.zeilenLinks.length);

  for (const [s, markt] of Object.entries(TRACKER)) {
    const z = nach[s] || {};
    p(s + ' als Tracker gekennzeichnet', z.titel === markt && new RegExp('^Fonds ' + s + '\\b').test(z.zusatz || ''), { titel: z.titel, zusatz: z.zusatz });
    p(s + ' nie als Indexpunkte', !!z.wert && !/Pkt|Punkte/.test(z.wert) && /%$/.test(z.veraenderung || ''), { wert: z.wert, veraenderung: z.veraenderung });
  }
  p('Tracker-Offenlegung im Abschnitt Aktienmaerkte (Kurs des Fonds, Indexstand selbst in Punkten)',
    /Kurs des Fonds/.test(seite.aktienHinweis) && /Indexstand selbst ist in Punkten/.test(seite.aktienHinweis), seite.aktienHinweis.slice(-160));
  const n225 = nach.N225 || {};
  p('Nikkei 225 als echter Index in Punkten', /^Index\b/.test(n225.zusatz || '') && /Pkt\.$/.test(n225.wert || ''), { zusatz: n225.zusatz, wert: n225.wert });
  for (const s of [...PFLICHT['us-renditen'], ...PFLICHT['eu-renditen'], ...PFLICHT.leitzinsen]) {
    const z = nach[s] || {};
    p(s + ' Prozent, bp, keine Kursfarbe', /%$/.test(z.wert || '') && !/[€$]/.test(z.wert || '') && / bp$/.test(z.veraenderung || '') && z.richtung === 'flat',
      { wert: z.wert, veraenderung: z.veraenderung, richtung: z.richtung });
  }
  for (const [s, einheit] of [['WTI', '/bbl'], ['BRENT', '/bbl'], ['NATGAS', '/MMBtu'], ['XAUUSD', '/oz'], ['XAGUSD', '/oz'], ['XPTUSD', '/oz'], ['XPDUSD', '/oz']]) {
    p(s + ' Einheit ' + einheit, ((nach[s] || {}).wert || '').endsWith(einheit), (nach[s] || {}).wert);
  }
  const fx = nach.EURUSD || {};
  p('EUR/USD als Kurs, nicht umgerechnet', /USD$/.test(fx.wert || '') && !/€/.test(fx.wert || ''), fx.wert);
  p('Movers und "Was heute auffaellt" verlinken auf Aktien bzw. Marktdetails',
    seite.moversLinks.every((h) => /^#\/s\/US_REAL\//.test(h)) && seite.oddLinks.every((h) => /^#\/maerkte\/[A-Z0-9_]+$/.test(h)), { movers: seite.moversLinks.slice(0, 3), odd: seite.oddLinks });
  p('Keine Seitenfehler', seitenfehler.length === 0, seitenfehler);
  if (mobil) p('Kein Querlauf auf dem Telefon', !seite.querlauf, seite.querlauf);
  return out;
}

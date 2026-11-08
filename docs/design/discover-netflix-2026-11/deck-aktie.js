/* Konzept Discover · Teil 2: die Aktienseite (Perspektive „Überblick“) als Titelseite.
   Echte Werte aus discover/data/stocks/US_REAL/NVDA.json (window.DX.stock, Datenstand 06.11.2026). */
(function () {
'use strict';
const { screen, slide, chapter, ic, chart, help, vd, bars, tf } = VU;
const { logo, poster, railHead, rail, pillv, p0, p1, nm, n, tt, src, r12, day, T, ASOF } = VU.DXH;
const S = DX.stock, C = DX.cards, SER = DX.series;
const de = (v, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const mrd = v => de(v / 1e9, 2) + ' Mrd. $';
const ROWTITLE = id => T[id] || tt(id);
const EUR = '167,17 €'; /* Euro-Wert wie auf der heutigen Seite (EZB-Kurs) */

/* ---------- Bausteine der Aktienseite ---------- */
const head = (o = {}) => VU.STOCK('Überblick', { s: { t: S.t, name: S.n, what: S.was, p: S.price, d: S.d, eur: EUR, date: ASOF } }).replace(`<span class="lg">${S.t}</span>`, logo(S.t, 42));
/* Etiketten wie die Metazeile einer Serie: Platz in einer Reihe, Thema, Index */
const best = S.memberships.slice().sort((a, b) => a.rank - b.rank || a.rank / a.of - b.rank / b.of)[0];
const tags = () => `<div class="chips" style="flex-wrap:wrap;white-space:normal;gap:6px"><span class="chip lm" style="height:30px;font-size:12.5px">Platz ${best.rank} · ${ROWTITLE(best.rowId)}</span><span class="chip" style="height:30px;font-size:12.5px">Künstliche Intelligenz</span><span class="chip" style="height:30px;font-size:12.5px">S&amp;P 500 · ${de(S.index[0].weight, 1)} %</span><span class="chip" style="height:30px;font-size:12.5px">+${S.memberships.length - 1} Reihen</span></div>`;
/* Die Story: drei Sätze mit je einem Urteil (ersetzt „In einem Satz“ und „Auf einen Blick“) */
const story = () => `<div class="story"><div class="ltag" style="color:#9b9b9b">Die Story in drei Sätzen</div>
${[['fundamental', 'Geschäft', S.story[0], vd('s', 'Sehr stark')],
   ['technical', 'Kurs', `Der Kurs liegt ${S.spanne.zumHoch.replace('−', '')} unter dem Hoch der letzten 12 Monate.`, vd('w', 'Schwächer')],
   ['quant', 'Bewertung', `KGV ${de(S.pe, 1)}, etwa wie der Markt (${de(S.peMedian, 1)}).`, vd('m', 'Wie der Markt')]].map(([i, l, t, v]) => `<div class="story-r"><span class="hud" style="width:34px;height:34px">${ic(i, 18)}</span><div><span class="ltag" style="color:#9b9b9b">${l}</span><p>${t}</p></div>${v}</div>`).join('')}</div>`;
/* Kapitel wie Episoden: Nummer, Bildchen, Titel, Ergebnis in einer Zeile */
const range = () => `<div class="thumb"><div style="position:relative;height:6px;border-radius:9px;background:#333;width:64px"><i style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(S.spanne.position * 100)}%;background:var(--lime);border-radius:9px"></i><b style="position:absolute;left:${Math.round(S.spanne.position * 100)}%;top:-4px;width:14px;height:14px;border-radius:50%;background:#fff;transform:translateX(-50%)"></b></div></div>`;
const minibars = (arr) => { const mx = Math.max(...arr.map(x => x[1])); return `<div class="thumb" style="align-items:flex-end;gap:3px;padding-bottom:12px">${arr.slice(-8).map((x, i, a) => `<i style="width:6px;height:${Math.max(2, x[1] / mx * 36)}px;border-radius:2px;background:${i === a.length - 1 ? 'var(--lime)' : '#fff'}"></i>`).join('')}</div>`; };
const dots = (k, of) => `<div class="thumb" style="gap:5px">${Array.from({ length: of }, (_, i) => `<i style="width:12px;height:12px;border-radius:50%;background:${i < k ? 'var(--lime)' : '#333'}"></i>`).join('')}</div>`;
const pe = () => `<div class="thumb" style="flex-direction:column;align-items:stretch;gap:6px;padding:0 10px"><i style="height:6px;border-radius:9px;background:#fff;width:100%"></i><i style="height:6px;border-radius:9px;background:#777;width:${Math.round(S.peMedian / S.pe * 100)}%"></i></div>`;
const tthumb = () => `<div class="thumb" style="padding:0;overflow:hidden"><img src="${src('img/themen/01-kuenstliche-intelligenz.webp')}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`;
const pm = () => `<div class="thumb" style="flex-direction:column;gap:4px;align-items:flex-start;padding-left:12px"><b style="color:var(--lime);font-size:13px">+ + +</b><b style="color:#fff;font-size:13px">− −</b></div>`;
const idx = () => `<div class="thumb" style="flex-direction:column;align-items:stretch;gap:5px;padding:0 10px"><i style="height:5px;border-radius:9px;background:var(--lime);width:90%"></i><i style="height:5px;border-radius:9px;background:#fff;width:60%"></i><i style="height:5px;border-radius:9px;background:var(--lime);width:30%"></i></div>`;
const CH = [
  ['Kurs: Zeitachse und Jahresspanne', `${S.zeitachse[3].wert} in 12 Monaten · ${S.spanne.zumHoch.replace('−', '')} unter dem Hoch`, range],
  [`Was macht ${S.n}?`, `${S.was} · ${S.themes.length} Themen`, tthumb],
  ['Wie sich das Geschäft entwickelt hat', `Umsatz ${mrd(S.revenue[S.revenue.length - 1][1])} im GJ ${S.revenue[S.revenue.length - 1][0]}`, () => minibars(S.revenue)],
  ['Wie gesund ist die Firma?', `${S.health.filter(h => /Sehr/.test(h.grade)).length} von ${S.health.length} sehr stark`, () => dots(S.health.filter(h => /Sehr/.test(h.grade)).length, S.health.length)],
  [`Ist ${S.n} teuer?`, `KGV ${de(S.pe, 1)} · Markt ${de(S.peMedian, 1)}`, pe],
  ['Stärken und Schwächen laut Kennzahlen', '3 Stärken · 2 Schwächen', pm],
  ['In welchen Indizes?', `S&P 500 ${de(S.index[0].weight, 1)} % · Nasdaq-100 · Dow ${de(S.index[2].weight, 1)} %`, idx]];
const chapterRow = (c, i, open) => `<div class="ep${open ? ' open' : ''}"><b class="ep-n">${i + 1}</b>${c[2]()}<div class="ep-t"><b>${c[0]}</b><span>${c[1]}</span></div><span class="ep-c">${ic(open ? 'i-x' : 'i-next', 15)}</span></div>`;
/* Reihen der Aktie: Platz groß */
const rowCard = m => `<div class="rk2"><span class="num">${m.rank}.</span><b>${ROWTITLE(m.rowId)}</b><span class="mu xs b">von ${m.of.toLocaleString('de-DE')}</span></div>`;
const posterW = t => poster(t, { lab: '12 Mon.' });

const ROWS = S.memberships.slice().sort((a, b) => a.rank - b.rank || a.rank / a.of - b.rank / b.of);
const NEXT_ROW = 'langfristige-compounder', NEXT = 'PAGS';
const nextBar = () => `<div class="nextbar">${logo(NEXT, 34)}<div style="min-width:0;flex:1"><span class="ltag" style="color:#9b9b9b">Weiter in ${ROWTITLE(NEXT_ROW)} · 3 von ${n(NEXT_ROW)}</span><b>${nm(C[NEXT].n)}</b></div><span class="nb-go">${ic('i-next', 18)}</span></div>`;
const rowCtx = () => `<div class="rowctx"><span>${ic('i-back', 14)}</span><b>${ROWTITLE(NEXT_ROW)}</b><span class="mu">2 von ${n(NEXT_ROW)}</span><span>${ic('i-next', 14)}</span></div>`;

const TOP = `${head()}
<div style="margin-top:12px">${chart(SER[S.t], { h: 150, axis: ['06.11.25', '06.11.26'] })}</div>${tf('1J')}
<div style="margin-top:14px">${tags()}</div>
<div style="margin-top:14px">${story()}</div>`;

/* ---------- Screens ---------- */
screen('a-top', { world: 'discover', dock: 0, hdr: false, body: TOP });

screen('a-full', { world: 'discover', dock: 0, hdr: false, h: 3420, body: `${TOP}
${railHead('Kapitel', '', '7 Kapitel, je eins aufklappen. Zusammen das, was heute untereinander steht.')}
<div class="eps">${CH.map((c, i) => chapterRow(c, i)).join('')}</div>
${railHead(`${S.n} steht in ${ROWS.length} Reihen`, '', 'Platz nach der Regel der Reihe. Tipp öffnet die Reihe.')}
${rail(ROWS.map(rowCard))}
${railHead(`Mehr wie ${S.n}`, '', 'Ähnlich in Kursverhalten, Wachstum, Marge und Bewertung.')}
${rail(S.next.similar.cards.slice(0, 5).map(posterW))}
${railHead('Gleiches Thema: Künstliche Intelligenz', n('thema-ki'), '')}
${rail(S.next.sameTheme.cards.filter(t => C[t] && SER[t]).slice(0, 5).map(posterW))}
${railHead('Niedrigere Bewertung im Sektor', '', 'KGV unter 80 % von NVIDIA, Nettomarge mindestens 5 %.')}
${rail(S.next.cheaperAlternatives.cards.map(posterW))}
<div class="card" style="margin-top:26px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center"><b>Alle Kennzahlen <span class="pro">PRO</span></b>${ic('i-next', 16)}</div>
<div class="card" style="margin-top:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center"><b class="sm">Daten &amp; Methodik</b><span class="mu xs b">Stand ${ASOF}</span></div>
<p class="xs mu" style="margin-top:16px">Kurse: Tiingo, Schlusskurs ${ASOF}. Geschäftszahlen: SEC. Keine Anlageempfehlung, kein Kursziel.</p>
<div style="margin-top:16px">${nextBar()}</div>` });

/* Kapitel 3 aufgeklappt */
const rev = S.revenue.map(([fy, v]) => [String(fy), v / 1e9]);
screen('a-chapter', { world: 'discover', dock: 0, hdr: false, h: 1250, body: `${head()}
<div class="eps" style="margin-top:14px">${chapterRow(CH[1], 1)}
<div class="ep open-box">${chapterRow(CH[2], 2, true)}
<div class="seg" style="margin-top:12px"><span class="on">Umsatz</span><span>Gewinn</span><span>Cashflow</span></div>
<div style="display:flex;align-items:flex-end;gap:10px;margin-top:14px"><div><span class="xs mu b">GJ ${S.revenue[0][0]}</span><div class="bb num" style="font-size:18px;color:var(--a-mute)">${mrd(S.revenue[0][1])}</div></div><b style="font-size:18px">›</b><div><span class="xs mu b">GJ ${S.revenue[S.revenue.length - 1][0]}</span><div class="bb num" style="font-size:24px">${mrd(S.revenue[S.revenue.length - 1][1])}</div></div></div>
<div style="margin-top:12px">${bars(rev, { w: 318, h: 120 })}</div>
<div class="card lime" style="margin-top:10px;padding:12px 14px"><b>${S.story[0]}</b></div>
<div style="margin-top:8px">${S.story.slice(1).map(t => `<div class="rule" style="margin-top:6px"><span>${ic('i-check', 13)}</span><p>${t}</p></div>`).join('')}</div>
<div style="margin-top:10px">${help('GJ = Geschäftsjahr. Bei NVIDIA endet es Ende Januar; die Zahlen stammen aus den Berichten an die SEC.')}</div></div>
${chapterRow(CH[3], 3)}${chapterRow(CH[4], 4)}</div>` });

/* Aus einer Reihe gekommen: Reihen-Leiste oben, nächste Aktie unten */
screen('a-next', { world: 'discover', dock: 0, hdr: false, body: `${rowCtx()}<div style="margin-top:10px">${head()}</div>
<div style="margin-top:12px">${chart(SER[S.t], { h: 130 })}</div>
<div class="endcard"><div class="ltag" style="color:#9b9b9b">Ende der Seite · Nächste in der Reihe</div>
<div style="display:flex;gap:14px;align-items:center;margin-top:12px">${poster(NEXT, { dk: 1 })}<div style="flex:1;min-width:0"><b style="font-size:19px;letter-spacing:-.02em;color:#fff">${nm(C[NEXT].n)}</b><p class="sm" style="color:#bdbdbd;margin-top:6px">${C[NEXT].hook}</p><span class="xs b" style="color:#9b9b9b;display:block;margin-top:8px">${ROWTITLE(NEXT_ROW)} · 3 von ${n(NEXT_ROW)}</span></div></div>
<div class="grid2" style="margin-top:14px"><span class="btn" style="height:46px;font-size:14.5px">Nächste Aktie</span><span class="btn line" style="height:46px;font-size:14.5px;border-color:#333;color:#fff">Zur Reihe</span></div>
<p class="xs" style="color:#9b9b9b;margin-top:10px;text-align:center">Oder seitlich wischen: links zurück, rechts weiter.</p></div>` });

/* ---------- Folien ---------- */
const at = VU.slides.findIndex(s => s.anchor === 'umsetzung');
const before = VU.slides.length;

chapter({ n: '03', title: 'Die Aktienseite', icon: 'i-play', anchor: 'aktie', was: 'Eine Aktie wie eine Serie: <b>Trailer, Story, Kapitel</b>, die Reihen, in denen sie steht, und <b>die nächste Aktie</b>.', pages: 'AX01–AX04' });

slide({ t: 'html', id: 'AX01', title: 'Die Aktie als Titelseite', sub: 'Bei Netflix sieht man auf der Titelseite in fünf Sekunden, worum es geht und was als Nächstes kommt. Die Aktienseite bekommt dieselbe Ordnung. Aktienkopf und Perspektiven-Leiste aus dem Redesign bleiben unverändert, es ändert sich die Perspektive „Überblick“.', html: () => `<div class="xscroll"><table class="tbl map"><thead><tr><th>Bei Netflix</th><th>Auf der Aktienseite</th><th>Heute</th></tr></thead><tbody>${[
  ['Trailer oben', 'Chart 1 Jahr direkt unter dem Kopf, Zeitleiste 1T … Max', 'vorhanden'],
  ['Metazeile: Jahr, Altersfreigabe, Genres', `Etiketten: Platz ${best.rank} in ${ROWTITLE(best.rowId)}, Thema, Index-Gewicht, „+${S.memberships.length - 1} Reihen“`, 'unten als „Platz in Ranglisten“'],
  ['Beschreibung in zwei Zeilen', 'Die Story in drei Sätzen: Geschäft, Kurs, Bewertung, je mit Urteil', '„In einem Satz“ und „Auf einen Blick“ getrennt, teils verdeckt'],
  ['Episoden-Liste', '7 Kapitel, zugeklappt, je mit Bildchen und Ergebnis in einer Zeile', '14 Abschnitte untereinander'],
  ['Mehr wie dieses', `Mehr wie ${S.n}, Gleiches Thema, Niedrigere Bewertung im Sektor als Schienen`, '3 Listen'],
  ['Nächste Folge', 'Nächste Aktie der Reihe, aus der man kam: Leiste unten, Karte am Ende, seitlich wischen', 'nicht vorhanden'],
  ['Meine Liste', 'Herz im Aktienkopf', 'vorhanden']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="mu">${r[2]}</td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'AX02', title: 'Was an der Seite heute stört', sub: `Aufgenommen am 08.11.2026: /discover/#/s/US_REAL/${S.t} auf 390 px.`, html: () => `<div class="facts">${[
  ['5.894 px', 'lang, 14 Abschnitte gleich gewichtet. Was wichtig ist, steht nicht oben.'],
  ['2 Jahreswerte', `Im Kopf ${EUR} und −1,59 % „in einem Jahr“ (Euro), darunter ${S.zeitachse[3].wert} in 12 Monaten (Dollar). Dazu 186,64 $ in der Jahresspanne.`],
  ['Rot', 'Die Pille im Kopf ist rot. Die Regel des Redesigns: Plus neongrün, Minus schwarz.'],
  ['„dafür / dagegen“', '„Was dafür spricht, was dagegen“ steht in WORTWAHL.md auf der Nein-Liste. Neu: „Stärken und Schwächen laut Kennzahlen“.'],
  ['3 × ähnlich', '„Ähnliche Aktien“, „Gleiches Thema“, „Günstiger bewertet“ als gleich aussehende Listen; „Mehr in anderen Welten“ wiederholt die Perspektiven-Leiste.'],
  ['0 × weiter', 'Wer aus einer Reihe kommt, muss zurück. Es gibt keine nächste Aktie, obwohl die Daten sie liefern (discoverNext).']].map(([a, b]) => `<div><b>${a}</b><p>${b}</p></div>`).join('')}</div>` });

slide({ id: 'AX03', title: `Aktienseite ${S.n}: neu`, route: `/discover/#/s/US_REAL/${S.t}`, newRoute: `/aktie/${S.t} (Perspektive Überblick)`, now: 'D09',
  sub: 'Oben bleibt der gemeinsame Aktienkopf. Darunter in dieser Reihenfolge: Chart, Etiketten, die Story, sieben Kapitel, die Reihen der Aktie, drei Schienen „Mehr wie …“, am Ende die nächste Aktie. Die Seite wird rund 40 % kürzer. Alle Werte sind die echten vom 06.11.2026.',
  neu: [['a-full', 'Ganze Seite, im Rahmen scrollbar'], ['a-top', 'Erster Bildschirm']],
  spec: {
    aufbau: ['Aktienkopf C04 + Perspektiven-Leiste C05 (unverändert aus dem Redesign)', 'Chart 1J mit Zeitleiste', 'Etiketten: bester Platz in einer Reihe (neongrün), Thema, Index-Gewicht, „+N Reihen“', 'Die Story: Geschäft, Kurs, Bewertung, je ein Satz und ein Urteil (C08)', 'Kapitel 1–7, zugeklappt', `Reihen der Aktie (${ROWS.length} Karten, Platz groß)`, `Mehr wie ${S.n} · Gleiches Thema · Niedrigere Bewertung im Sektor`, 'Alle Kennzahlen PRO, Daten & Methodik, Hinweis, „Weiter“'],
    komponenten: ['C04, C05, C06, C08, C09', 'Neu: Story-Karte (schwarz)', 'Neu: Kapitelzeile (Nummer, Bildchen, Titel, Ergebnis)', 'Neu: Platz-Karte', 'Poster und Schiene aus der Startseite', 'Neu: Leiste „Weiter in …“'],
    daten: [`discover/data/stocks/US_REAL/${S.t}.json: zeitachse, jahresspanne, fundamentals (story, health, journey, valuation), memberships, themes, indexMemberships, discoverNext`, 'Nichts Neues im Datenlauf'],
    weg: ['„In einem Satz“ + „Auf einen Blick“ → Story', '„Zeitachse“, „Jahresspanne“ → Kapitel 1', '„Was dafür spricht, was dagegen“ → Kapitel 6 „Stärken und Schwächen laut Kennzahlen“', '„Platz in Ranglisten“ → Etiketten + Reihen-Schiene', '„Günstiger bewertet“ → „Niedrigere Bewertung im Sektor“', '„Mehr zu NVIDIA in anderen Welten“ → entfällt (Perspektiven-Leiste)', 'Rote Pille, Euro-Kopf mit eigenem Jahreswert']
  } });

slide({ id: 'AX04', title: 'Kapitel öffnen und weiter zur nächsten Aktie', route: 'Kapitel 3 offen · aus der Reihe „Langfristige Compounder“',
  sub: 'Ein Kapitel klappt an Ort und Stelle auf, die anderen bleiben zu. Kommt man aus einer Reihe, zeigt eine schmale Leiste oben die Reihe und die Position; am Ende der Seite wartet die nächste Aktie wie die nächste Folge, ohne automatisch weiterzuspringen.',
  neu: [['a-chapter', 'Kapitel 3 „Geschäft“ aufgeklappt'], ['a-next', 'Aus einer Reihe: oben Position, unten nächste Aktie']],
  spec: {
    aufbau: ['Kapitel: Kopfzeile bleibt, darunter der heutige Inhalt des Abschnitts unverändert', 'Reihen-Leiste: ‹ Reihe · 2 von 184 ›, wischen links/rechts', 'Endkarte: Poster der nächsten Aktie, ein Satz, Nächste Aktie · Zur Reihe'],
    komponenten: ['C14 Reiter, Balken, C09', 'Neu: Reihen-Leiste', 'Neu: Endkarte'],
    daten: ['Reihenfolge aus discover/data/rows/US_REAL/{reihe}.json (cards)', 'Herkunft der Aktie im Adress-Zusatz, z. B. #/s/US_REAL/NVDA?reihe=langfristige-compounder'],
    weg: ['Kein automatisches Weiterspringen (anders als Netflix): Nutzer entscheidet']
  } });

slide({ t: 'html', id: 'AX05', title: 'Aktienseite: Entscheidungen', html: () => `<ol class="dec">${[
  ['Kapitel standardmäßig zugeklappt?', 'Empfehlung: ja, alle zu. Die Story oben trägt die Kernaussage; wer mehr will, öffnet ein Kapitel. Die Seite merkt sich offene Kapitel auf dem Gerät.'],
  ['Eine Währung im Kopf?', `Empfehlung: Dollar wie an der Börse, Euro klein daneben (≈ ${EUR}). Alle Prozentwerte in Dollar, damit es nur einen Jahreswert gibt (ADR-002, eine Preiswahrheit).`],
  ['„Weiter“-Leiste immer oder nur aus einer Reihe?', 'Empfehlung: nur, wenn man aus einer Reihe oder vom Swipen kommt. Aus der Suche bleibt die Seite ruhig; die Endkarte zeigt dann „Mehr wie …“.'],
  ['Gilt das für alle Welten?', 'Empfehlung: Story und Kapitel nur in der Perspektive „Überblick“. Die anderen Perspektiven (Chart, Zahlen, Faktoren …) behalten ihre eigene Seite; die Reihen-Leiste und „Weiter“ gibt es überall.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });

/* Neue Folien vor „Umsetzung“ einsortieren */
const added = VU.slides.splice(before);
VU.slides.splice(at, 0, ...added);
VU.slides.forEach(s => { if (s.t === 'chapter' && s.anchor === 'umsetzung') { s.n = '04'; s.pages = 'U1–U4'; } });
})();

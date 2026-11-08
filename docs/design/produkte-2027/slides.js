/* Produkte 2027: Daten und Bausteine der Präsentation. Werte vom 06.11.2026 aus der App, wo nicht anders vermerkt. */
(function () {
  var NAMES = {discover:'Discover',quant:'Quant',technical:'Technical',fundamental:'Fundamental',supertrader:'Supertrader',hedgefonds:'Hedgefonds',elliott:'Elliott',screener:'Screener',vorsorge:'Vorsorge',portfolios:'Portfolios'};
  var DOING = {discover:'Aktien zu einem Thema entdecken',screener:'Eigene Kriterien kombinieren',hedgefonds:'Buffett & Co. ins Depot schauen',fundamental:'Prüfen, ob die Firma Geld verdient',quant:'Aktien in 7 Eigenschaften vergleichen',technical:'Den Chart in Worten lesen',elliott:'Wellen lesen, mit klarer Grenze',supertrader:'Regeln berühmter Trader verfolgen',portfolios:'Musterdepots ohne echtes Geld ansehen',vorsorge:'Sparplan und Rente ausrechnen'};
  function pi(id, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#p-' + id + '"/></svg>'; }
  function ui(id) { return '<svg aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  function e(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var sigs = {
    discover: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
      ['Künstliche Intelligenz', 'Raumfahrt', 'Robotik'].map(function (t, i) { return '<div style="aspect-ratio:3/4;border-radius:16px;padding:10px;display:flex;align-items:flex-end;font-weight:800;font-size:13px;' + (i === 0 ? 'background:linear-gradient(160deg,#222,#000);color:#fff' : i === 1 ? 'background:#c8f531' : 'background:#e9e9e9') + '">' + t + '</div>'; }).join('') + '</div>',
    quant: '<div class="card" style="padding:10px 14px"><div style="display:flex;justify-content:space-between;align-items:center"><b>NVIDIA</b><span class="vd s">3 stark · 2 Mitte · 1 schwach</span></div>' +
      [['Verdient sie gut?', 99, '#c8f531'], ['Wächst die Firma?', 86, '#c8f531'], ['Ist der Kurs ruhig?', 84, '#c8f531'], ['Läuft der Kurs gut?', 62, '#8c8c8c'], ['Ist sie günstig?', 59, '#8c8c8c'], ['Sind die Zahlen solide?', 43, '#000']].map(function (r) { return '<div style="display:grid;grid-template-columns:1fr 90px 26px;gap:8px;align-items:center;margin-top:7px;font-size:12.5px"><span>' + r[0] + '</span><span class="bar" style="height:7px"><i style="width:' + r[1] + '%;background:' + r[2] + '"></i></span><b class="num">' + r[1] + '</b></div>'; }).join('') + '</div>',
    technical: '<div class="card ink"><div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:34px;font-weight:900;color:#c8f531" class="num">34 %</span><span class="sm">über der 200-Tage-Linie</span></div><div class="bar" style="margin-top:8px;background:#333"><i style="width:34%"></i></div><div class="xs" style="color:#9b9b9b;margin-top:5px">Schwacher Markt · Quelle für alle Produkte</div></div>' +
      '<div class="card" style="margin-top:8px;padding:4px 14px">' + [['Steigt seit Monaten', '542'], ['Gerade ausgebrochen', '832'], ['Dreieck im Aufwärtstrend', '155']].map(function (r) { return '<div class="check" style="grid-template-columns:1fr auto"><span><b>' + r[0] + '</b></span><span class="num bb">' + r[1] + '</span></div>'; }).join('') + '</div>',
    fundamental: '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>NVIDIA in 4 Zahlen</b><span class="vd s">Sehr stark</span></div><div class="g2" style="margin-top:8px">' +
      [['Umsatz', '216 Mrd. $'], ['Gewinn', '120 Mrd. $'], ['Free Cashflow', '96,7 Mrd. $'], ['Wachstum p. a.', '+45,7 %']].map(function (r) { return '<div style="background:#fff;border-radius:12px;padding:8px 10px"><div class="xs mu b">' + r[0] + '</div><div class="bb num" style="font-size:16px">' + r[1] + '</div></div>'; }).join('') + '</div><div class="xs mu" style="margin-top:6px">Geschäftsjahr 2026 · SEC 10-K</div></div>',
    supertrader: '<div class="card" style="padding:4px 14px">' + [['Weinstein Investor', 'Ausbruch aus langer Seitwärtsphase', '622'], ['Weinstein Trader', 'Neuer Anlauf im Aufwärtstrend', '583'], ['Minervini SEPA / VCP', 'Schwankung wird kleiner, dann Ausbruch', '564'], ['Pocket Pivot', 'Aufwärtstag mit hohem Volumen', '405']].map(function (r) { return '<div class="rowi" style="grid-template-columns:1fr auto"><span><b>' + r[0] + '</b><span class="s">' + r[1] + '</span></span><span class="num bb">' + r[2] + '</span></div>'; }).join('') + '</div>',
    hedgefonds: '<div class="card" style="padding:4px 14px">' + [['Warren Buffett', 'Apple 22,0 % · American Express 17,1 %', '299,3 Mrd. $'], ['Cathie Wood', 'Tesla 7,5 % · AMD 5,3 %', '15,4 Mrd. $'], ['Bill Ackman', 'Brookfield 17,6 % · Amazon 17,4 %', '13,7 Mrd. $']].map(function (r) { return '<div class="rowi" style="grid-template-columns:1fr auto"><span><b>' + r[0] + '</b><span class="s">' + r[1] + '</span></span><span class="num bb sm">' + r[2] + '</span></div>'; }).join('') + '</div><div class="xs mu" style="margin-top:6px">Nächste Meldefrist 14.11. für Q3 2026</div>',
    elliott: '<div class="card"><svg viewBox="0 0 320 120" style="width:100%;display:block"><path d="M10 100 L60 55 L85 75 L160 15 L190 45 L240 25 L300 95" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round"/><g font-size="13" font-weight="800" font-family="Inter,sans-serif"><text x="56" y="47">1</text><text x="82" y="92">2</text><text x="155" y="11">3</text><text x="186" y="62">4</text><text x="236" y="17">5</text></g><line x1="10" y1="88" x2="310" y2="88" stroke="#000" stroke-dasharray="5 5" stroke-width="1.5"/><text x="210" y="112" font-size="11" font-weight="700" fill="#6e6e6e" font-family="Inter,sans-serif">Ungültig-Marke laut Methode</text></svg></div>',
    screener: '<div class="card"><div class="chips">' + ['Umsatz +10 % (Fundamental)', 'KGV unter Markt', 'Wachstum stark (Quant)', 'Über 200-Tage-Linie (Technical)', 'Von Fonds gemeldet (13F)'].map(function (c, i) { return '<span class="pill' + (i < 3 ? ' on' : '') + '" style="font-size:12px;padding:6px 10px">' + c + '</span>'; }).join('') + '</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px"><span class="sm b">Treffer</span><span class="num" style="font-size:30px;font-weight:900">–</span></div></div>',
    vorsorge: '<div class="card ink"><div class="xs bb" style="color:#c8f531;letter-spacing:.08em">BEISPIEL · 250 € IM MONAT · 35 → 67</div><div class="num" style="font-size:36px;font-weight:900;letter-spacing:-.05em;margin-top:4px">127 Tsd. €</div><div class="sm" style="color:#9b9b9b">heutige Kaufkraft, 5 % pro Jahr</div></div><div class="card lime" style="margin-top:8px"><b>+ bis 540 € Zulage pro Jahr</b><div class="sm">Altersvorsorgedepot ab 01.01.2027</div></div>',
    portfolios: '<div class="card" style="padding:4px 14px">' + [['Weinstein Stages', 'nach Stan Weinstein · Phase 2', '10 Pos.'], ['Darvas Boxes', 'nach Nicolas Darvas · Ausbruch aus der Kiste', '5 Pos.'], ['Donchian Turtle', 'nach R. Donchian / Turtle Traders', '4 Pos.']].map(function (r) { return '<div class="rowi" style="grid-template-columns:1fr auto"><span><b>' + r[0] + '</b><span class="s">' + r[1] + '</span></span><span class="sm bb">' + r[2] + '</span></div>'; }).join('') + '</div><div class="xs mu" style="margin-top:6px">Rechenmodell, kein echtes Geld · Stand 06.11.2026</div>'
  };

  var P = {
    discover: {no: '3.1', phase: 'Finden', title: 'Discover: der Einstieg und das Schaufenster',
      q: 'Was bewegt die Börse heute?', sub: 'Themen, bekannte Namen und was sich heute bewegt, für über 6.000 US-Aktien.',
      acts: [['Ein Thema durchstöbern', '54 Themen von KI bis Raumfahrt'], ['Aktien swipen und merken', 'Rechts merken, links weiter'], ['Sehen, was sich heute bewegt hat', '574 Aktien auffällig am 06.11.']],
      sigT: 'Themen', next: ['Diese Aktien im Screener weiterfiltern', 'screener'],
      owns: ['Themenwelten (54)', 'Swipen', '„Der Markt heute“', 'Überblick auf der Aktienseite', 'Suche'],
      gives: ['23 „Strategien“ werden Schaufenster: Discover zeigt sie, Technical, Fundamental und Quant rechnen sie (Herkunftssiegel)', 'Jahreshochs (heute 245) → gleiche Zahl wie Technical'],
      fix: ['„Strategien“ heißt in Discover künftig „Listen“, mit Siegel „aus Technical“ usw.', 'Kein „Hier kannst du“: der Start zeigt sofort sieben Abschnitte'] },
    quant: {no: '3.2', phase: 'Prüfen', title: 'Quant: sieben Eigenschaften, nichts anderes', now: 'quant',
      q: 'Wo steht die Aktie im Vergleich?', sub: 'Sieben Eigenschaften jeder US-Aktie, von 0 bis 100, im Vergleich zu allen anderen.',
      acts: [['Eine Aktie einordnen', '7 Eigenschaften, jede mit Beleg'], ['Aktien nach Anlagestil finden', 'Value Momentum, GARP, Quality Momentum …'], ['Sehen, wer sich verbessert hat', '557 Aktien seit gestern']],
      sigT: 'Beispiel NVIDIA', next: ['Musterdepot von Quality Momentum ansehen', 'portfolios'],
      owns: ['Die sieben Eigenschaften', 'Faktor-Listen (Value Momentum, GARP …)', 'Radar „seit gestern verbessert“'],
      gives: ['„Setup bestätigt“ mit Zonen → Technical (Chartlage)', '„Technische Lagen“, „Fundamentaldaten“ in der Leiste → Links zu Technical und Fundamental', 'Musterdepots (5) → Portfolios', 'Marktbreite (35 %) → Wert aus Technical'],
      fix: ['Start sagt „sechs Eigenschaften“, nennt sie aber nicht', 'Erster Block ist ein Radar mit sechs Zählern, bevor klar ist, was Quant misst', 'Setup-Karte nutzt verbotene Wörter (Einstiegsmarke, Stopp-Marke, Zielzone)'] },
    technical: {no: '3.3', phase: 'Prüfen', title: 'Technical: alles, was aus dem Chart kommt',
      q: 'Was zeigt der Chart?', sub: 'Jeden Tag 5.630 US-Charts nach festen Regeln gelesen und in Worten beschrieben.',
      acts: [['Den Chart einer Aktie in Worten lesen', 'Trend, Muster, Marken'], ['Fertige Chart-Suchen nutzen', '13 Suchen: Aufwärtstrend, Ausbruch …'], ['Im Chart Studio selbst analysieren', 'Kerzen, Linien, Muster']],
      sigT: 'Markt und fertige Suchen', next: ['Welche Profi-Methode passt zu dieser Lage?', 'supertrader'],
      owns: ['Chartlagen mit Zonen (übernimmt Quant-Setups)', 'Jahreshochs, Marktbreite: Quelle für alle', 'Chart Studio, Muster', 'Fertige Chart-Suchen'],
      gives: ['Eigene Screener-Oberfläche → der Screener, mit Chart-Filtern vorbelegt'],
      fix: ['„Setups? 1.261 im Fokus“ als zweite Kachel: Fragezeichen im Titel', 'Drei verschiedene Jahreshoch-Zahlen in der App (245, 123, 59)'] },
    fundamental: {no: '3.4', phase: 'Prüfen', title: 'Fundamental: die Zahlen hinter der Firma',
      q: 'Verdient die Firma wirklich Geld?', sub: 'Umsatz, Gewinn und Cashflow über 12 Jahre, direkt aus den Pflichtberichten an die US-Börsenaufsicht.',
      acts: [['Die Zahlen einer Firma ansehen', '12 Geschäftsjahre, jede Zahl erklärt'], ['Ranglisten nutzen', 'Niedrigstes KGV, höchste Kapitalrendite …'], ['Branchen vergleichen', 'Nettomarge je Branche']],
      sigT: 'Beispiel NVIDIA', next: ['Was halten die großen Fonds davon?', 'hedgefonds'],
      owns: ['Zahlen aus SEC-Berichten', 'Ranglisten nach Kennzahlen', 'Branchen', 'die Discover-Listen „Das Geschäft wächst“'],
      gives: ['—'],
      fix: ['Gut aufgebaut („Zahlen lesen in 30 Sekunden“). Es fehlt nur „Hier kannst du“ und die Übergabe', '„Auswahlen aus Discover“ zeigt Listen, die Fundamental selbst besitzen sollte'] },
    supertrader: {no: '3.5', phase: 'Verfolgen', title: 'Supertrader: die Methoden zuerst, die Zahl danach', now: 'supertrader',
      q: 'Welche Aktien erfüllen die Regeln berühmter Trader?', sub: '13 Methoden von Stan Weinstein bis Mark Minervini, jeden Tag an allen US-Aktien geprüft.',
      acts: [['Eine Methode kennenlernen', 'In einem Satz, mit Haltedauer'], ['Sehen, wer heute die Regeln erfüllt', '34 Aktien mit allen Regeln und Plan'], ['Musterdepot und Backtest ansehen', 'Forschung, nicht zertifiziert']],
      sigT: 'Die 13 Methoden', next: ['Chartlage dazu in Technical', 'technical'],
      owns: ['13 Methoden und ihre Regeln', 'Lebenslauf eines Regel-Ergebnisses', 'Backtests, Hausstrategie'],
      gives: ['Musterdepot-Übersicht → Ausschnitt aus Portfolios'],
      fix: ['Erste Zahl „3.312 Treffer“: zu groß, um etwas zu bedeuten', 'Zweite Botschaft „Nicht belegt“: gehört als Etikett an jede Methode', 'Leiste „Signale“ (WORTWAHL) → „Heute erfüllt“'] },
    hedgefonds: {no: '3.6', phase: 'Finden', title: 'Hedgefonds: was andere halten und sagen',
      q: 'Was haben große Fonds gemeldet?', sub: '788 Fonds melden ihre US-Aktien jedes Quartal (13F). Wir zeigen, was sie halten und was sich ändert.',
      acts: [['Ins Depot eines Investors schauen', 'Buffett, Ackman, Burry, Wood …'], ['Sehen, wer eine Aktie hält', 'z. B. wer NVIDIA gemeldet hat'], ['Veränderungen im Quartal ansehen', 'aufgenommen, aufgestockt, abgegeben']],
      sigT: 'Star-Investoren', next: ['Wie stehen seine Aktien da? (Eigenschaften)', 'quant'],
      owns: ['13F-Meldungen von 788 Fonds', 'Star-Investoren, DACH-Melder', 'neu: Reiter „Analysten (Angabe Dritter)“'],
      gives: ['—'],
      fix: ['Klarer Start, gute 13F-Erklärung mit Frist', 'Untertitel „was sie kaufen und verkaufen“ → „was sie gemeldet haben“ (WORTWAHL: „Was Profis kaufen“ lädt zum Nachmachen ein)'] },
    elliott: {no: '3.7', phase: 'Prüfen', title: 'Elliott: Wellen, mit klarer Grenze',
      q: 'Welche Wellen laufen gerade?', sub: 'Wellen in US-Charts nach festen Regeln gezählt. Jede Lesart nennt, ab welchem Kurs sie nicht mehr gilt.',
      acts: [['Die Wellen-Lesart einer Aktie ansehen', 'mit Ungültig-Marke laut Methode'], ['Aktien in Welle 3 finden', 'aufwärts, abwärts, neu und verändert'], ['Verstehen, wie Wellen gezählt werden', 'Lernpfad in der Bibliothek']],
      sigT: 'Lesart (Skizze)', next: ['Chart in Worten dazu in Technical', 'technical'],
      owns: ['Wellenzählung und Lesarten'],
      gives: ['—'],
      fix: ['Ganz PRO, aber die Seite sagt nicht, was man ohne PRO sieht', 'Im lokalen Abzug ohne Daten geladen; Skizze zeigt nur die Form'] },
    screener: {no: '3.8', phase: 'Finden', title: 'Screener: einer für alle Kriterien',
      q: 'Welche Aktien erfüllen deine Kriterien?', sub: 'Ein Filter für alles: Kennzahlen, Eigenschaften, Chartlage und Fondsdaten kombinieren.',
      acts: [['Kriterien aus allen Produkten kombinieren', 'Fundamental, Quant, Technical, Hedgefonds'], ['Mit einer Vorlage starten', '„Günstig und profitabel“, „Im Aufwärtstrend“'], ['Suche speichern', 'und später wieder öffnen']],
      sigT: 'Filter (Form)', next: ['Treffer nach Eigenschaften sortieren', 'quant'],
      owns: ['Die einzige Filter-Oberfläche'],
      gives: ['—', 'übernimmt „Quant Screener“ und „Technical Screener“ als Vorlagen mit Vorbelegung'],
      fix: ['Drei Screener heute (Screener, Quant, Technical) mit drei Bedienungen', 'Im lokalen Abzug ohne Daten geladen; Trefferzahl zeigt nur die Form'] },
    portfolios: {no: '3.9', phase: 'Verfolgen', title: 'Portfolios: das eine Zuhause aller Musterdepots',
      q: 'Was macht eine Methode mit einem Depot?', sub: '14 Musterdepots führen Aktien streng nach Regel. Rechenmodell, kein echtes Geld.',
      acts: [['Alle Musterdepots vergleichen', 'Supertrader 7, Quant 5, KI 2'], ['Positionen eines Depots ansehen', 'mit Regel für Aufnahme und Abgabe'], ['Den Lebenslauf verfolgen', 'jede Aufnahme und Abgabe mit Datum']],
      sigT: 'Supertrader-Musterdepots', next: ['Die Methode dahinter in Supertrader', 'supertrader'],
      owns: ['Alle 14 Musterdepots', 'Positionen, Aufnahmen, Abgaben'],
      gives: ['—', 'Quant und Supertrader zeigen ihre Depots als Ausschnitt von hier'],
      fix: ['„Depot-Wertentwicklung noch nicht veröffentlicht“ auf jeder Karte: einmal oben erklären, nicht 14-mal'] },
    vorsorge: {no: '3.10', phase: 'Vorsorgen', title: 'Vorsorge: bleibt Vorbild, bekommt ETFs dazu', now: 'vorsorge',
      q: 'Was wird aus deiner Rente?', sub: 'Rechnen, verstehen, anfangen. Ohne Produktverkauf, mit amtlichen Regeln.',
      acts: [['Ersten Sparplan ab 10 € planen', '6 Schritte, 3 Minuten'], ['Rente und Förderung ausrechnen', 'bis 540 € Zulage pro Jahr ab 2027'], ['Eigene ETFs durchleuchten', 'Länder, Branchen, Überschneidungen']],
      sigT: 'Beispielrechnung', next: ['Welche Aktien stecken im ETF?', 'discover'],
      owns: ['Sparplan, Rente, Förderung', 'alle ETFs (übernimmt das ETF-Dashboard)'],
      gives: ['—'],
      fix: ['Hat „Wo stehst du?“ schon: das Vorbild für alle anderen', 'Kern-ETFs sind US-Fonds (SPY, URTH). Es fehlen UCITS-ETFs mit ISIN und ein Schritt „Beim Broker einrichten“'] }
  };
  var ORDER = ['discover', 'quant', 'technical', 'fundamental', 'supertrader', 'hedgefonds', 'elliott', 'screener', 'portfolios', 'vorsorge'];

  function dock(id) {
    var docks = {discover: ['Übersicht', 'Welten', 'Listen', 'Swipen'], quant: ['Übersicht', 'Eigenschaften', 'Listen', 'Aktien'], technical: ['Übersicht', 'Suchen', 'Chart Studio', 'Muster'], fundamental: ['Übersicht', 'Ranglisten', 'Branchen', 'Suchen'], supertrader: ['Übersicht', 'Methoden', 'Heute erfüllt', 'Backtests'], hedgefonds: ['Übersicht', 'Investoren', 'Aktien', 'Analysten'], elliott: ['Übersicht', 'Welle 3', 'Neu', 'Suchen'], screener: ['Übersicht', 'Filter', 'Treffer', 'Gespeichert'], portfolios: ['Übersicht', 'Supertrader', 'Quant', 'KI'], vorsorge: ['Vorsorge', 'Planer', 'ETFs', 'Portfolio']}[id];
    return '<div class="dock"><a class="on">' + pi(id) + NAMES[id] + '</a>' + docks.slice(1).map(function (d) { return '<a>' + ui('chart') + e(d) + '</a>'; }).join('') + '<a>' + ui('menu') + 'Menü</a></div>';
  }

  function phoneScreen(id) {
    var p = P[id];
    return '<div class="sb"><span>9:41</span><i>●●● ▮</i></div><div class="bd">' +
      '<div class="hdr"><div class="w"><span class="hud">' + pi(id) + '</span>' + NAMES[id] + '</div><span class="ic">' + ui('search') + '</span><span class="at">' + ui('spark') + 'Atlas</span></div>' +
      '<div class="lt" style="font-size:28px">' + e(p.q) + '</div><p class="mu sm" style="margin-top:6px">' + e(p.sub) + '</p>' +
      '<div class="xs bb mu" style="letter-spacing:.09em;margin:14px 0 6px">HIER KANNST DU</div>' +
      '<div class="card" style="padding:2px 12px">' + p.acts.map(function (a, i) { return '<div class="rowi" style="grid-template-columns:28px 1fr 16px;padding:8px 0"><span style="width:26px;height:26px;border-radius:50%;background:#000;color:#c8f531;display:grid;place-items:center;font-weight:900;font-size:12px">' + (i + 1) + '</span><span><b style="font-size:14px">' + e(a[0]) + '</b><span class="s">' + e(a[1]) + '</span></span>' + '<svg class="chev"><use href="#i-chev"/></svg></div>'; }).join('') + '</div>' +
      '<div class="xs bb mu" style="letter-spacing:.09em;margin:14px 0 6px">' + e(p.sigT).toUpperCase() + '</div>' + sigs[id] +
      '<div class="card lime" style="margin-top:10px;display:grid;grid-template-columns:30px 1fr 16px;gap:10px;align-items:center;padding:10px 12px"><span style="width:30px;height:30px;border-radius:9px;background:#000;color:#c8f531;display:grid;place-items:center">' + pi(p.next[1], 'w16') + '</span><span><span class="xs bb" style="letter-spacing:.08em">WEITER MIT ' + NAMES[p.next[1]].toUpperCase() + '</span><br><b style="font-size:13.5px">' + e(p.next[0]) + '</b></span><svg class="chev" style="color:#000"><use href="#i-chev"/></svg></div>' +
      '</div>' + dock(id) + '<div class="home-ind"></div>';
  }
  function phone(id, s) { return '<div class="ph" style="--s:' + (s || .74) + '"><div class="fr"><div class="vp"><div class="scr">' + phoneScreen(id) + '</div></div></div></div>'; }

  function slide(id, i) {
    var p = P[id];
    var now = p.now ? '<figure class="dev" style="--w:230px"><span class="tag now" style="align-self:flex-start">HEUTE</span><div class="shot"><img src="now/' + p.now + '.jpg" alt="' + NAMES[id] + ' heute"></div></figure>' : '';
    var li = function (a) { return '<ul>' + a.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>'; };
    return '<section class="slide' + (i % 2 ? ' soft' : '') + '" id="prod-' + id + '"><div class="inner">' +
      '<div class="sh"><span class="no">' + p.no + '</span><h2>' + e(p.title) + '</h2><p class="sub"><span class="phase-tag">' + p.phase + '</span> Auftrag: <b style="color:#000">' + e(DOING[id]) + '.</b> ' + e(p.sub) + '</p></div>' +
      '<div class="devs">' + now + phone(id) +
      '<div style="flex:1;min-width:300px;display:grid;gap:12px;align-content:start">' +
      '<div class="box"><h4>Heute auffällig</h4>' + li(p.fix) + '</div>' +
      '<div class="g2"><div class="box ink"><h4 style="color:#c8f531">Besitzt</h4>' + li(p.owns) + '</div><div class="box"><h4>Gibt ab</h4>' + li(p.gives) + '</div></div>' +
      '<div class="box lime"><h4 style="color:#000">Weiter mit</h4><p style="color:#000;font-weight:700">' + e(p.next[0]) + ' → ' + NAMES[p.next[1]] + '</p></div>' +
      '</div></div></div></section>';
  }

  document.getElementById('product-slides').outerHTML = ORDER.map(slide).join('');
  document.querySelectorAll('[data-phone]').forEach(function (el) { el.outerHTML = phone(el.getAttribute('data-phone'), el.style.getPropertyValue('--s')); });
  document.querySelectorAll('[data-pp]').forEach(function (el) { var id = el.getAttribute('data-pp'); el.innerHTML = '<span class="pp-i">' + pi(id) + '</span><span><b>' + NAMES[id] + '</b><small>' + e(DOING[id]) + '</small></span>'; });
  document.querySelectorAll('[data-p]').forEach(function (el) { el.insertAdjacentHTML('afterbegin', pi(el.getAttribute('data-p'), 'w14')); });

  var phases = [['Finden', ['discover', 'screener', 'hedgefonds']], ['Prüfen', ['fundamental', 'quant', 'technical', 'elliott']], ['Verfolgen', ['supertrader', 'portfolios']], ['Vorsorgen', ['vorsorge']]];
  var menu = document.getElementById('menu-new');
  if (menu) menu.innerHTML = '<div class="sb"><span>9:41</span><i>●●● ▮</i></div><div class="bd" style="padding-top:0">' +
    '<div class="hdr"><div class="w" style="font-size:13px;letter-spacing:.12em">VISION UNIVERSE<sup style="font-size:8px">®</sup></div><span class="ic" style="box-shadow:0 0 0 2px #c8f531">✕</span></div>' +
    '<div class="card" style="display:flex;align-items:center;gap:10px;height:42px;border-radius:999px;padding:0 14px"><svg width="16" height="16"><use href="#i-search"/></svg><span class="mu sm">Aktie, Produkt oder Frage …</span></div>' +
    phases.map(function (ph, k) { return '<div class="xs bb" style="letter-spacing:.09em;color:' + (k === 3 ? '#c8f531' : '#9b9b9b') + ';margin:12px 0 5px">' + (k + 1) + ' · ' + ph[0].toUpperCase() + '</div>' + ph[1].map(function (id) { return '<div style="display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;padding:5px 0;' + (id === 'quant' ? 'background:#c8f531;color:#000;border-radius:12px;margin:0 -8px;padding:5px 8px' : '') + '"><span style="width:32px;height:32px;border-radius:9px;background:#000;color:#c8f531;display:grid;place-items:center;box-shadow:0 0 0 1px #333">' + pi(id, 'w16') + '</span><span style="line-height:1.15"><b style="font-size:14px">' + NAMES[id] + '</b><br><span style="font-size:12px;' + (id === 'quant' ? '' : 'color:#9b9b9b') + '">' + e(DOING[id]) + '</span></span></div>'; }).join(''); }).join('') +
    '</div><div class="home-ind"></div>';

  var h1 = document.getElementById('home-new');
  if (h1) h1.innerHTML = '<div class="sb"><span>9:41</span><i>●●● ▮</i></div><div class="bd">' +
    '<div class="ey" style="margin-top:6px">Was du hier tun kannst</div><div class="lt" style="font-size:30px">Zehn Werkzeuge. Vier Schritte.</div>' +
    phases.map(function (ph, k) { return '<div class="card' + (k === 3 ? ' lime' : '') + '" style="margin-top:9px;padding:10px 12px"><div class="xs bb" style="letter-spacing:.08em;' + (k === 3 ? '' : 'color:#6e6e6e') + '">' + (k + 1) + ' · ' + ph[0].toUpperCase() + '</div>' + ph[1].map(function (id) { return '<div style="display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:center;margin-top:6px"><span style="width:22px;height:22px;border-radius:7px;background:#000;color:#c8f531;display:grid;place-items:center">' + pi(id, 'w12') + '</span><span style="font-size:13px"><b>' + NAMES[id] + '</b> · ' + e(DOING[id]) + '</span></div>'; }).join('') + '</div>'; }).join('') +
    '</div><div class="home-ind"></div>';

  var h2 = document.getElementById('home-new2');
  if (h2) h2.innerHTML = '<div class="sb"><span>9:41</span><i>●●● ▮</i></div><div class="bd">' +
    '<div class="ey" style="margin-top:6px">Eine Aktie, alle Werkzeuge</div><div class="lt" style="font-size:30px">So sieht Vision Universe NVIDIA.</div>' +
    '<div style="display:flex;gap:10px;align-items:center;margin-top:12px"><span class="lg">NVDA</span><span><b>NVIDIA</b><br><span class="sm mu">186,64 $ · Schluss 06.11.</span></span><span style="flex:1"></span><span class="chg up">▲ +2,78 %</span></div>' +
    '<div class="card" style="margin-top:10px;padding:2px 12px">' +
    [['fundamental', 'Umsatz 216 Mrd. $, +45,7 % pro Jahr', 'Sehr stark', 's'], ['quant', '3 Eigenschaften stark, 1 schwach', 'Mittel', 'm'], ['technical', '23 % unter dem Jahreshoch', 'Schwächer', 'w'], ['hedgefonds', 'In 41 Fonds-Depots gemeldet', 'Q2', 'm'], ['supertrader', 'Erfüllt 2 von 13 Methoden', 'Regeln', 'm'], ['elliott', 'Wellen-Lesart mit Grenze', 'PRO', 'o']].map(function (r) { return '<div class="rowi" style="grid-template-columns:30px 1fr auto;padding:8px 0"><span style="width:28px;height:28px;border-radius:8px;background:#000;color:#c8f531;display:grid;place-items:center">' + pi(r[0], 'w14') + '</span><span><b style="font-size:13px">' + NAMES[r[0]] + '</b><span class="s">' + r[1] + '</span></span><span class="vd ' + r[3] + '">' + r[2] + '</span></div>'; }).join('') +
    '</div><div class="btn" style="margin-top:12px">NVIDIA öffnen</div></div><div class="home-ind"></div>';

  var b1 = document.getElementById('bridge1');
  if (b1) b1.innerHTML = '<div class="sb"><span>9:41</span><i>●●● ▮</i></div><div class="bd">' +
    '<div class="hdr"><div class="w"><span class="hud">' + pi('hedgefonds') + '</span>Hedgefonds</div></div>' +
    '<div class="ey">Investor · Berkshire Hathaway</div><div class="lt" style="font-size:30px">Warren Buffett</div><p class="sm mu" style="margin-top:4px">299,3 Mrd. $ gemeldet · Meldung Q2 2026</p>' +
    '<div class="xs bb mu" style="letter-spacing:.09em;margin:14px 0 6px">GRÖSSTE POSITIONEN · MIT EIGENSCHAFTEN AUS QUANT</div>' +
    '<div class="card" style="padding:2px 12px">' + [['AAPL', 'Apple', '22,0 %', '4 stark · 1 Mitte · 1 schwach'], ['AXP', 'American Express', '17,1 %', '4 stark · 1 Mitte · 1 schwach']].map(function (r) { return '<div class="rowi" style="grid-template-columns:42px 1fr auto"><span class="lg">' + r[0] + '</span><span><b>' + r[1] + '</b><span class="s" style="display:flex;gap:4px;align-items:center;margin-top:3px"><span class="vd s" style="font-size:10.5px;padding:2px 7px">' + pi('quant', 'w12') + ' ' + r[3] + '</span></span></span><span class="bb num">' + r[2] + '</span></div>'; }).join('') + '<div class="rowi" style="grid-template-columns:1fr"><span class="sm mu">… weitere Positionen</span></div></div>' +
    '<div class="card lime" style="margin-top:10px;display:grid;grid-template-columns:30px 1fr 16px;gap:10px;align-items:center"><span style="width:30px;height:30px;border-radius:9px;background:#000;color:#c8f531;display:grid;place-items:center">' + pi('screener', 'w16') + '</span><span><span class="xs bb" style="letter-spacing:.08em">WEITER MIT SCREENER</span><br><b style="font-size:13.5px">Alle seine Aktien weiterfiltern</b></span><svg class="chev" style="color:#000"><use href="#i-chev"/></svg></div>' +
    '<div class="card" style="margin-top:8px;display:grid;grid-template-columns:30px 1fr 16px;gap:10px;align-items:center"><span style="width:30px;height:30px;border-radius:9px;background:#000;color:#c8f531;display:grid;place-items:center">' + pi('fundamental', 'w16') + '</span><span><b style="font-size:13.5px">Zahlen der Firmen vergleichen</b><br><span class="xs mu">Fundamental</span></span><svg class="chev"><use href="#i-chev"/></svg></div>' +
    '</div>' + dock('hedgefonds') + '<div class="home-ind"></div>';

  var b2 = document.getElementById('bridge2');
  if (b2) b2.innerHTML = '<div class="sb"><span>9:41</span><i>●●● ▮</i></div><div class="bd">' +
    '<div class="hdr"><div class="w"><span class="hud">' + pi('discover') + '</span>Discover</div></div>' +
    '<div class="ey">Thema</div><div class="lt" style="font-size:30px">Künstliche Intelligenz</div>' +
    '<div class="seg" style="margin-top:12px;grid-template-columns:1fr 1fr"><span>Nach Kurs</span><span class="on">' + 'Nach Eigenschaften' + '</span></div>' +
    '<div class="card" style="margin-top:10px;padding:2px 12px">' + [['MU', 'Micron', '4 stark · 2 schwach'], ['NVDA', 'NVIDIA', '3 stark · 1 schwach'], ['AVGO', 'Broadcom', '2 stark · 3 schwach']].map(function (r) { return '<div class="rowi" style="grid-template-columns:42px 1fr"><span class="lg">' + r[0] + '</span><span><b>' + r[1] + '</b><span class="s" style="margin-top:3px"><span class="vd ' + (r[0] === 'AVGO' ? 'm' : 's') + '" style="font-size:10.5px;padding:2px 7px">' + pi('quant', 'w12') + ' ' + r[2] + '</span></span></span></div>'; }).join('') + '</div>' +
    '<p class="xs mu" style="margin-top:6px">Eigenschaften aus Quant, Stand 06.11.2026. Reihenfolge nach Regel, keine Empfehlung.</p>' +
    '<div class="card lime" style="margin-top:10px;display:grid;grid-template-columns:30px 1fr 16px;gap:10px;align-items:center"><span style="width:30px;height:30px;border-radius:9px;background:#000;color:#c8f531;display:grid;place-items:center">' + pi('screener', 'w16') + '</span><span><span class="xs bb" style="letter-spacing:.08em">WEITER MIT SCREENER</span><br><b style="font-size:13.5px">Nur profitable KI-Aktien zeigen</b></span><svg class="chev" style="color:#000"><use href="#i-chev"/></svg></div>' +
    '</div>' + dock('discover') + '<div class="home-ind"></div>';

  var CASES = [
    ['„Ich habe von Palantir gehört. Ist die Firma gut?“', [['discover', 'Suche → Überblick', 1], ['fundamental', 'Verdient sie Geld?', 1], ['quant', 'Wo steht sie im Vergleich?', 1], ['hedgefonds', 'Wer hat sie gemeldet?', 1], ['discover', 'Alarm bei Quartalszahlen', 0]]],
    ['„Ich will in KI investieren, weiß aber nicht, in welche Firma.“', [['discover', 'Thema KI', 1], ['quant', 'Nach Eigenschaften sortieren', 0], ['screener', 'Nur profitable weiterfiltern', 0], ['fundamental', 'Zahlen der Favoriten', 1]]],
    ['„Was hat Warren Buffett gerade im Depot?“', [['hedgefonds', 'Buffetts Depot', 1], ['quant', 'Wie stehen seine Aktien da?', 0], ['fundamental', 'Zahlen der größten Position', 1]]],
    ['„Ich handle aktiv nach Charts.“', [['technical', 'Fertige Suche „Gerade ausgebrochen“', 1], ['supertrader', 'Welche Methode passt?', 0], ['portfolios', 'Wie führt das Musterdepot die Methode?', 1]]],
    ['„Ich will jeden Monat 100 € sparen.“', [['vorsorge', 'Sparplan in 6 Schritten', 1], ['vorsorge', 'ETF wählen', 1], ['discover', 'Welche Aktien stecken drin?', 0], ['vorsorge', 'Beim Broker einrichten', 0]]]
  ];
  var cs = document.getElementById('cases');
  if (cs) cs.innerHTML = CASES.map(function (c) {
    return '<div class="case"><b class="case-q">' + c[0] + '</b><div class="case-steps">' + c[1].map(function (s, i) { return (i ? '<span class="case-arr">→</span>' : '') + '<span class="step' + (s[2] ? '' : ' miss') + '">' + pi(s[0], 'w16') + '<span><small>' + NAMES[s[0]] + (s[2] ? '' : ' · fehlt') + '</small>' + e(s[1]) + '</span></span>'; }).join('') + '</div></div>';
  }).join('');
})();

// Erzeugt scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-CASES.json aus den unten erfassten Faellen.
// Quelle je Fall: Minervinis EIGENE Beitraege auf X (@markminervini), gelesen nur als Suchindex-Ausschnitt
// (x.com ist aus dieser Umgebung nicht direkt abrufbar) -> sourceConfidence hoechstens MEDIUM. Ticker nur aus der
// Ausschnitt-/Titelzeile, nie aus der Zusammenfassung der Suchmaschine (sonst LOW). Keine Preise geraten: Pivot,
// Einstiegskurs und Stop sind ueberall null, weil kein Ausschnitt sie nennt. Paraphrasen statt Zitate.
// Beitragsdatum aus der Status-ID (Snowflake: ms = (id >> 22) + 1288834974657, UTC).
//
// Aufruf: node scripts/supertrader/ground-truth/build-cases.mjs [--out <datei>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_PATH = path.resolve(here, '../fidelity/MINERVINI-GROUND-TRUTH-CASES.json');
export const postDate = (id) => new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString().slice(0, 10);
const url = (id) => `https://x.com/markminervini/status/${id}`;

// Auswertungsgruppen (Praeregistrierung + Nachtrag A1, vor jedem Replay festgelegt):
//  MAIN        POSITIVE mit Anker aus dem Beitrag (Datum genannt oder "heute"/"gestern" im Beitrag)  -> Recall
//  SENSITIVITY POSITIVE, Fenster nur aus Dauerangabe/Begleitbeitrag erschlossen                       -> getrennt
//  WATCHLIST   von ihm genannte Kaufkandidaten ohne Ausbruchstag                                        -> getrennt
//  NEGATIVE    ausdruecklich "nicht kaufen"/abgelehnt                                                   -> Falsch-Positiv-Pruefung
//  NOT_EVALUATED: SOURCE_AMBIGUOUS (Einstieg unbekannt), ILLUSTRATIVE_ONLY, LOW_CONFIDENCE, EXCLUDED_INSTRUMENT, OUT_OF_WINDOW
const C = [];
const add = (o) => C.push(o);

// ------------------------------------------------------------------ MAIN (Anker im Beitrag)
const MAIN = [
  ['ZGNX', 'Zogenix Inc', '1006531423380103168', 'BUY_SETUP', 'POST_DAY', 'Ausbruch aus einer grossen VCP; er sagt, er sei positioniert.', { acquired: 'Uebernahme durch UCB 2022 (Ticker entfaellt)' }],
  ['MTLS', 'Materialise NV (ADR)', '1082650684594548737', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Neue Hochs heute; er ist positioniert; am Montag davor auf die Kaufliste gesetzt.', { foreignPrivateIssuer: true }],
  ['ROKU', 'Roku Inc', '1151132121672474628', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Bricht heute morgen aus; er ist positioniert.', {}],
  ['ACAD', 'ACADIA Pharmaceuticals', '1186675011664465920', 'ENTRY_DOCUMENTED', 'PREVIOUS_DAY_STATED', 'Nennt mehrere Kaufkandidaten; ACAD habe er gestern morgen gekauft.', {}],
  ['AMD', 'Advanced Micro Devices', '1270354059220996098', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Steigt in schwachem Markt, versucht aus einer Basis zu kommen; er ist positioniert.', {}],
  ['DXCM', 'DexCom Inc', '1276517252016242688', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Dreht aus einem Ruecksetzer nach oben (Pullback-Kauf, kein Basisausbruch); er ist positioniert.', { entryType: 'PULLBACK' }],
  ['TNDM', 'Tandem Diabetes Care', '1278004425764868099', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Ausbruch; er ist positioniert.', {}],
  ['AMD', 'Advanced Micro Devices', '1286020981086134277', 'BUY_SETUP', 'POST_DAY', 'Am Vortag auf die Buy-Alert-Liste, heute morgen auf die Breakout-Alert-Liste; grosser Umsatz. Eigener Kauf nicht genannt.', { ownTrade: 'unknown' }],
  ['AEM', 'Agnico Eagle Mines', '1305508439528017922', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Bricht aus; er ist positioniert.', { foreignPrivateIssuer: true }],
  ['RVNC', 'Revance Therapeutics', '1306216940868960256', 'ENTRY_DOCUMENTED', 'PREVIOUS_DAY_STATED', 'Gestern long gegangen nach grossem Ausbruch.', { acquired: 'Uebernahme 2025 (Ticker entfaellt)' }],
  ['AMZN', 'Amazon.com', '1315721815222878209', 'ENTRY_DOCUMENTED', 'WEEKDAY_STATED', 'Hat AMZN am Donnerstag gekauft (Beitrag am Montag danach).', { anchorDate: '2020-10-08' }],
  ['REPL', 'Replimune Group', '1316394720818593793', 'BUY_SETUP', 'POST_DAY', 'Stand heute morgen auf der Buy-Alert-Liste; er hat den Ausbruch verpasst, weil er andere Titel kaufte.', { ownTrade: false, note: 'Setup von ihm bejaht, Kauf aus Kapazitaetsgruenden unterblieben' }],
  ['PENN', 'Penn National Gaming (heute PENN Entertainment)', '1336343967210876930', 'BUY_SETUP', 'POST_DAY', 'Koennte hier aus einer Basis ausbrechen; "wir" sind positioniert (vor dem Ausbruch).', { entryType: 'PRE_BREAKOUT' }],
  ['DKL', 'Delek Logistics Partners LP', '1347626186504085509', 'ENTRY_DOCUMENTED', 'DATE_STATED', 'Auf die Buy-Alert-Liste; Kaeufe am 29.12. und heute.', { anchorDate: '2020-12-29', partnership: true }],
  ['DKL', 'Delek Logistics Partners LP', '1347626186504085509', 'REENTRY', 'POST_DAY', 'Zweiter Kauf (Aufstockung) am Beitragstag.', { partnership: true, sameTitleAs: 'DKL 2020-12-29' }],
  ['RICK', 'RCI Hospitality Holdings', '1379147436611010563', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Dreht durch seinen "Low Cheat" auf hohem Umsatz; kleine Basis; er ist positioniert.', { entryType: 'LOW_CHEAT' }],
  ['RBLX', 'Roblox Corp', '1380519678162927622', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Durch seinen Cheat-Einstieg aus einer Primaerbasis (junges Listing); er ist positioniert.', { entryType: 'CHEAT', listing: 'Direktnotierung Maerz 2021 -> < 252 Handelstage' }],
  ['DECK', 'Deckers Outdoor', '1381655133780578304', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Versucht auszubrechen; er ist positioniert.', {}],
  ['GDDY', 'GoDaddy Inc', '1796180630608183709', 'ENTRY_DOCUMENTED', 'DATE_STATED', 'Verkauf mit ordentlichem Gewinn; Kaufbeginn am 05.02.2024 laut Beitrag.', { anchorDate: '2024-02-05', exitPostDate: true }],
  ['MU', 'Micron Technology', '1795475913833845049', 'ENTRY_DOCUMENTED', 'DATE_STATED', 'Seit dem Kauf (gepostet am 26.04.) nichts verkauft, sogar aufgestockt.', { anchorDate: '2024-04-26' }],
  ['AXON', 'Axon Enterprise', '1834268442897064242', 'BUY_SETUP', 'POST_DAY', 'Aus seiner Focus List hervorgegangen (Ausbruch); er habe neue Titel gekauft und aufgestockt, ohne Zuordnung je Titel.', { ownTrade: 'unknown' }],
  ['APP', 'AppLovin Corp', '1834268442897064242', 'BUY_SETUP', 'POST_DAY', 'Wie AXON (gleicher Beitrag).', { ownTrade: 'unknown' }],
  ['LMB', 'Limbach Holdings', '1834268442897064242', 'BUY_SETUP', 'POST_DAY', 'Wie AXON (gleicher Beitrag).', { ownTrade: 'unknown' }],
  ['NMM', 'Navios Maritime Partners LP', '1834268442897064242', 'BUY_SETUP', 'POST_DAY', 'Wie AXON (gleicher Beitrag).', { ownTrade: 'unknown', foreignPrivateIssuer: true, partnership: true }],
  ['DVA', 'DaVita Inc', '1834268442897064242', 'BUY_SETUP', 'POST_DAY', 'Wie AXON (gleicher Beitrag).', { ownTrade: 'unknown' }],
  ['SG', 'Sweetgreen Inc', '1843739764744434111', 'REENTRY', 'POST_DAY', 'Bestehende Position heute morgen aufgestockt; kommt aus einer klassischen VCP.', { entryType: 'ADD_ON' }],
  ['RNA', 'Avidity Biosciences (Ticker 2024)', '1856764704234041720', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Ausbruch gekauft.', { tickerReused: 'RNA gehoert heute (SEC-Tickerliste) einem anderen Emittenten (CIK 2093101) -> nur ueber das damalige Listing zuordnen' }],
];
for (const [ticker, company, id, cls, basis, rationale, x] of MAIN) {
  const pd = postDate(id);
  const anchor = x.anchorDate || (basis === 'PREVIOUS_DAY_STATED' ? 'PREVIOUS_SESSION_OF_POST' : pd);
  add({ ticker, company, statusId: id, postDate: pd, cls, group: 'MAIN', classGroup: 'POSITIVE', anchorBasis: basis, anchor, rationale, extra: x });
}

// ------------------------------------------------------------------ SENSITIVITY (Fenster nur erschlossen)
add({ ticker: 'GTHX', company: 'G1 Therapeutics', statusId: '994943521328193536', cls: 'SOLD', group: 'SENSITIVITY', classGroup: 'POSITIVE', anchorBasis: 'WINDOW_FROM_STATED_DURATION', window: ['2018-04-13', '2018-04-27'], rationale: 'Teilverkauf mit ca. 38 % Gewinn aus einem "3-Wochen-Swing"; Rest mit Absicherung gehalten. Einstieg nur ueber die Dauerangabe erschlossen.', extra: { acquired: 'Uebernahme 2024 (Ticker entfaellt)' } });
add({ ticker: 'NLOK', company: 'NortonLifeLock (heute Gen Digital, GEN)', statusId: '1298663189341708288', cls: 'ENTRY_DOCUMENTED', group: 'SENSITIVITY', classGroup: 'POSITIVE', anchorBasis: 'WINDOW_FROM_DESCRIBED_SEQUENCE', window: ['2020-08-03', '2020-08-19'], rationale: 'Nach dem Ausbruch "gesquattet", bis 13 Cent an seinen Stop, nach 5-taegiger Erholung neue Hochs. Ausbruchstag nicht genannt.', extra: { tickerChange: 'NLOK -> GEN (2022)', note: 'Fenster: Ausbruch vor einer mindestens 5-taegigen Erholung bis zum Beitrag' } });
for (const t of [['TSM', 'Taiwan Semiconductor (ADR)', { foreignPrivateIssuer: true }], ['AVGO', 'Broadcom Inc', {}], ['NEM', 'Newmont Corp', {}], ['ATI', 'ATI Inc', {}], ['F', 'Ford Motor', {}], ['ROIV', 'Roivant Sciences', { foreignPrivateIssuer: 'pruefen' }]]) {
  add({ ticker: t[0], company: t[1], statusId: '1999138986254573979', cls: 'ENTRY_DOCUMENTED', group: 'SENSITIVITY', classGroup: 'POSITIVE', anchorBasis: 'WINDOW_FROM_COMPANION_POST', window: ['2025-11-26', '2025-12-11'], rationale: 'Unter den "kuerzlich" long gekauften Titeln genannt; Begleitbeitrag desselben Tages: neun Longs ueber "ein paar Wochen" aufgebaut.', extra: { ...t[2], companionStatusId: '1999131108563112387' } });
}

// ------------------------------------------------------------------ WATCHLIST (Kaufkandidaten, kein Ausbruchstag)
for (const [t, co, x] of [['INMD', 'InMode Ltd', { foreignPrivateIssuer: true }], ['NMIH', 'NMI Holdings', {}], ['VEC', 'Vectrus (heute V2X)', { tickerChange: 'VEC -> VVX (2022)' }], ['CPRT', 'Copart Inc', {}], ['RBA', 'Ritchie Bros. Auctioneers (heute RB Global)', { foreignPrivateIssuer: 'pruefen' }]]) {
  add({ ticker: t, company: co, statusId: '1186675011664465920', cls: 'BUY_SETUP', group: 'WATCHLIST', classGroup: 'POSITIVE', anchorBasis: 'POST_DAY', anchor: postDate('1186675011664465920'), rationale: 'Von ihm als Kaufkandidat genannt (neben ACAD, das er kaufte); kein Ausbruchstag.', extra: x });
}

// ------------------------------------------------------------------ NEGATIVE
add({ ticker: 'UPST', company: 'Upstart Holdings', statusId: '1449089499410075651', cls: 'AVOID_OR_NEGATIVE', group: 'NEGATIVE', classGroup: 'NEGATIVE', anchorBasis: 'POST_DAY', anchor: postDate('1449089499410075651'), rationale: 'Nennt UPST "extended" und der Bewegung voraus, also nicht kaufen.', extra: {} });

// ------------------------------------------------------------------ NICHT AUSGEWERTET
const NE = (ticker, company, statusId, cls, status, rationale, extra = {}) => add({ ticker, company, statusId, cls, group: 'NOT_EVALUATED', classGroup: status, rationale, extra });
NE('QCOM', 'Qualcomm', '1131187142879842305', 'STOPPED_OUT', 'SOURCE_AMBIGUOUS', 'Haelfte am 16.05. ausgestoppt, Rest am 20.05. geschlossen; Einstieg unbekannt.');
NE('ZUMZ', 'Zumiez', '1004831084717199362', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'In die Zahlen gehalten; Einstieg unbekannt.');
NE('AMD', 'Advanced Micro Devices', '1348648429178789888', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Unter "unseren Longs", nicht weit von der Basis; Einstieg unbekannt.');
NE('BSIG', 'BrightSphere Investment Group', '1348648429178789888', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Wie AMD (gleicher Beitrag).');
NE('SNAP', 'Snap Inc', '1348648429178789888', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Wie AMD (gleicher Beitrag).');
NE('UPST', 'Upstart Holdings', '1511395010297671687', 'SOLD', 'SOURCE_AMBIGUOUS', 'Erklaert den Absturz; er habe zum Glueck vorher verkauft (Verkaufskurs genannt, Datum nicht).');
NE('SWIR', 'Sierra Wireless', '1551565602917171202', 'STOPPED_OUT', 'SOURCE_AMBIGUOUS', 'Heute morgen ausgestoppt; Einstieg unbekannt.', { foreignPrivateIssuer: true });
NE('LEN', 'Lennar', '1735316359121141900', 'SOLD', 'SOURCE_AMBIGUOUS', 'Ausstieg dokumentiert, Einstieg unbekannt.');
NE('DHI', 'D.R. Horton', '1735316359121141900', 'SOLD', 'SOURCE_AMBIGUOUS', 'Ausstieg dokumentiert, Einstieg unbekannt.');
NE('NVDA', 'NVIDIA', '1760774946777706636', 'SOLD', 'SOURCE_AMBIGUOUS', 'Aus der VCP-Ausbruchsposition zu frueh verkauft; Einstiegstag nicht genannt.');
NE('EME', 'EMCOR Group', '1761131690695557384', 'SOLD', 'SOURCE_AMBIGUOUS', 'Ausstieg dokumentiert, Einstieg unbekannt.');
NE('PSTG', 'Pure Storage', '1796180630608183709', 'SOLD', 'SOURCE_AMBIGUOUS', 'Mit Gewinn verkauft; Einstieg unbekannt.');
NE('ONON', 'On Holding AG', '1871205658386944138', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Einzige verbliebene Long-Position mit Gewinnpolster; Einstieg unbekannt.', { foreignPrivateIssuer: true });
NE('BROS', 'Dutch Bros', '1890167787924103638', 'SOLD', 'SOURCE_AMBIGUOUS', 'In Staerke mit ca. 45 % Gewinn verkauft; Einstieg unbekannt.');
NE('KGC', 'Kinross Gold', '1890167787924103638', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Mit Gewinnpolster durch die Zahlen gehalten, schwaechster Titel; Einstieg unbekannt.');
NE('IBKR', 'Interactive Brokers', '1946221516389286207', 'SOLD', 'SOURCE_AMBIGUOUS', 'In Staerke verkauft; Einstieg unbekannt.');
NE('AAPL', 'Apple', '1274498666561187841', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Nennt es seinen Lehrbuch-Kauf (3-C/Cheat); Kauftag nicht genannt.');
NE('OYST', 'Oyster Point Pharma', '1254861363131879428', 'BUY_SETUP', 'SOURCE_AMBIGUOUS', 'Bester Titel der stark gewachsenen Buy-Alert-Liste; Aufnahmetag unklar.');
for (const t of ['ASML', 'VIK', 'MATX', 'ROST', 'KRYS', 'SMFG', 'MS', 'MAR', 'PSMT', 'MNST', 'FRST', 'PSX']) NE(t, null, '2065129055406444742', 'ENTRY_DOCUMENTED', 'SOURCE_AMBIGUOUS', 'Bestandsliste (aktuell long); die meisten vor dem Ruecksetzer gekauft; kein Kaufdatum je Titel.');
NE('UPST', 'Upstart Holdings', '1389270162407362560', 'ILLUSTRATIVE_ONLY', 'ILLUSTRATIVE_ONLY', 'Dreht heute nach oben; "Bottom Fishing" nach seinem Verstaendnis; kein Kauf genannt.');
NE('GT;ECOM;ESTC;AXP;BYD;UPST;TTGT;ZI;AA', null, '1453455673610678273', 'FAILED_BREAKOUT', 'ILLUSTRATIVE_ONLY', 'Liste von "Pop-and-Drop"-Ausbruechen als Marktkommentar; keine eigenen Trades, kein Tag je Titel.');
NE('(unbekannt)', null, '1765397727037329725', 'STOPPED_OUT', 'ILLUSTRATIVE_ONLY', 'Groesste Verlierer, die er kaufte und rechtzeitig ausgestoppt wurde; Ticker nur in Bildern.');
NE('(unbekannt)', null, '1004013746413539328', 'STOPPED_OUT', 'ILLUSTRATIVE_ONLY', 'Kurzfristiger Swing mit ca. 3,5 % Verlust geschlossen; Ticker nur im Bild.');
NE('(unbekannt)', null, '1183763713523888129', 'BUY_SETUP', 'ILLUSTRATIVE_ONLY', 'Antwort: "Low Cheat"-Pivot mit Preisangabe; Ticker nicht im Ausschnitt.');
NE('(unbekannt)', null, '1319382960706097157', 'VCP_EXAMPLE', 'ILLUSTRATIVE_ONLY', 'VCP-Beispiele aus seinen juengsten Kaeufen; Ticker nur in Bildern.');
for (const [t, id, why] of [['CRWD', '1152221869573062656', 'Ticker nur in der Suchzusammenfassung; sichtbarer Text: nicht gekauft, kein Ausbruch, Pullback-Kauf erwaehnt.'], ['BNTX', '1275130672290705416', 'Wortlaut nur aus der Suchzusammenfassung (Buy-Alert-Liste, VCP in einen Pivot).'], ['VAPO', '1275927229550211072', 'ID und Wortlaut nur aus der Suchzusammenfassung.'], ['TIPT', '1384911871057203203', 'Wortlaut nur aus der Suchzusammenfassung (Trend-Template-Kandidat, nicht gekauft).'], ['BYND', '1155841668542861312', 'Lehrbuch-Pivot laut frueherer Zusammenfassung; nicht im Ausschnitt gesehen.'], ['ANF', null, 'Nur Suchzusammenfassung, keine Status-ID.'], ['SPOT', null, 'Nur Suchzusammenfassung; der Ausschnitt zeigt nur DKL.'], ['ETSY', null, 'Nur Suchzusammenfassung (Stop nach "Boomerang"), keine Status-ID.']]) NE(t, null, id, 'UNVERIFIED', 'LOW_CONFIDENCE', why);
for (const [t, id, why] of [['IBIT', '1765392311532359817', 'Bitcoin-ETF'], ['FNGS', '1890167787924103638', 'ETN'], ['GBTC', '1270718067937472513', 'Trust, kein Kauf genannt'], ['SPY', '1946221516389286207', 'Index-Short'], ['SPY', '1901692374763376678', 'Index-Short'], ['DIA', '1790021562214572075', 'Index-Short'], ['SPY;QQQ;ARKG', '1368993291723800577', 'Shorts'], ['SCHW', '1834268442897064242', 'Short'], ['BTC', '1364228835781320704', 'kein Wertpapier'], ['ZM', '1449082949597605895', 'Scherz ueber Tonausfall, kein Trade']]) NE(t, null, id, 'NOT_LONG_EQUITY', 'EXCLUDED_INSTRUMENT', why);
for (const [t, id, why] of [['AMZN', '1001902474800828416', 'Trade 1997 (Rueckblick)'], ['USPH', '1019229142687141889', 'Trade 2001 (Rueckblick)'], ['AAPL', '1071095448738369536', 'Trade 2004 (Rueckblick; Wortlaut teils nur aus Zusammenfassung)']]) NE(t, null, id, 'ENTRY_DOCUMENTED', 'OUT_OF_WINDOW', why + '; vor 2008-01-02.');
for (const t of ['AMGN', 'DELL', 'MSFT', 'COST', 'HD', 'GPS']) NE(t, null, null, 'BOOK_EXAMPLE_CANDIDATE', 'OUT_OF_WINDOW', 'Fruehe Karriere-Trades (1990er) nur aus Sekundaerhinweisen; Buchseite nicht gelesen; vor 2008.', { sourceConfidence: 'LOW' });

export function buildCases() {
  const counters = {};
  const cases = C.map((c, i) => {
    const pd = c.statusId ? postDate(c.statusId) : null;
    const evaluated = ['MAIN', 'SENSITIVITY', 'WATCHLIST', 'NEGATIVE'].includes(c.group);
    const conf = c.extra?.sourceConfidence || (c.classGroup === 'LOW_CONFIDENCE' ? 'LOW' : 'MEDIUM');
    counters[c.group] = (counters[c.group] || 0) + 1;
    const { sourceConfidence, anchorDate, ...extra } = c.extra || {};
    return {
      case_id: `GT-${String(i + 1).padStart(3, '0')}`,
      ticker: c.ticker,
      company: c.company,
      historical_ticker: c.ticker,
      date_or_window: c.window ? { window: c.window } : { anchor: c.anchor || null, postDate: pd },
      anchor_basis: c.anchorBasis || null,
      source: c.statusId ? { kind: 'X_POST_OWN', account: '@markminervini', statusId: c.statusId, postDate: pd, url: url(c.statusId), read: 'SEARCH_SNIPPET_ONLY' } : { kind: 'SECONDARY_HINT', read: 'NOT_READ' },
      source_type: c.statusId ? 'TIER2_OWN_POST' : 'SECONDARY',
      source_confidence: conf,
      minervini_classification: c.cls,
      evaluation_group: c.group,
      class_group: c.classGroup,
      own_trade: extra.ownTrade ?? (['BUY_SETUP'].includes(c.cls) ? 'unknown' : ['AVOID_OR_NEGATIVE', 'ILLUSTRATIVE_ONLY', 'NOT_LONG_EQUITY'].includes(c.cls) ? false : true),
      documented_entry: { date: c.anchor && /^\d{4}/.test(c.anchor) && c.anchorBasis !== 'POST_DAY' ? c.anchor : null, price: null },
      documented_pivot: null,
      documented_exit: { date: c.cls === 'SOLD' || c.cls === 'STOPPED_OUT' ? (pd ? 'ON_OR_BEFORE_' + pd : null) : null, price: null },
      documented_rationale: c.rationale,
      identity: { ticker_then: c.ticker, ticker_now_sec: null, cik: null, resolution: evaluated ? 'IN_REPLAY_BY_TICKER_AND_DATE (damaliges Listing, CIK aus dem SEC-Datenlayer)' : null, events: Object.fromEntries(Object.entries(extra).filter(([k]) => ['acquired', 'tickerChange', 'tickerReused', 'foreignPrivateIssuer', 'partnership', 'listing'].includes(k))) },
      notes: [extra.entryType ? `Einstiegsart: ${extra.entryType}` : null, extra.note || null, extra.sameTitleAs ? `gleicher Titel wie ${extra.sameTitleAs}` : null, extra.companionStatusId ? `Begleitbeitrag ${extra.companionStatusId}` : null].filter(Boolean),
      ...(evaluated ? { replay_spec: { anchorDate: c.window ? null : c.anchor, window: c.window || null, documentedPivot: null, classGroup: c.classGroup } } : {}),
    };
  });
  return {
    schema: 'vu-minervini-ground-truth-cases-1.0.0',
    status: 'DRAFT_BEFORE_RED_TEAM',
    prereg: 'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-PREREG.json',
    sourcing: {
      method: 'Domain-gefilterte Websuche (x.com/twitter.com) nach Minervinis eigenen Beitraegen; nur Ausschnitt-/Titeltext seiner Beitraege verwendet; Datum aus der Status-ID.',
      limits: ['x.com, minervini.com und Archive aus dieser Umgebung nicht abrufbar -> keine Volltexte, keine Bilder (viele Ticker stehen nur in Chartbildern)', 'Suchindex enthaelt nur einen kleinen, popularitaetsverzerrten Ausschnitt seines Feeds (Auswahlverzerrung nicht kontrollierbar)', 'Buecher (TLSMW, TTLAC, Mindset) nicht lesbar -> keine Buchfaelle; Buchbeispiele liegen zudem ueberwiegend vor 2008', 'Keine Preise (Pivot/Einstieg/Stop) in den Ausschnitten -> Pivot-Vergleich nicht moeglich'],
      noModelMemory: 'Kein Fall stammt aus Modellwissen; Ticker aus Suchzusammenfassungen ohne Ausschnittbeleg sind LOW und werden nicht ausgewertet.',
      selection: 'Alle gefundenen Fall-Beitraege werden aufgenommen; keine Auswahl nach spaeterem Kursverlauf.',
    },
    counts: counters,
    cases,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--out');
  const out = i >= 0 ? process.argv[i + 1] : OUT_PATH;
  fs.writeFileSync(out, JSON.stringify(buildCases(), null, 2) + '\n');
  console.log(`geschrieben: ${out}`);
}

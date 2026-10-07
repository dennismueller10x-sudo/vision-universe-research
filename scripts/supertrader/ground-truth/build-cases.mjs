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
// Erwartete CIK je Ticker (SEC: company_tickers.json bzw. EDGAR-Suche fuer delistete/umbenannte Emittenten, 07.10.2026).
export const EXPECTED_CIK = { ZGNX: '1375151', MTLS: '1091223', ROKU: '1428439', ACAD: '1070494', AMD: '2488', DXCM: '1093557', TNDM: '1438133', AEM: '2809', RVNC: '1479290', AMZN: '1018724', REPL: '1737953', PENN: '921738', DKL: '1552797', RICK: '935419', RBLX: '1315098', DECK: '910521', GDDY: '1609711', MU: '723125', AXON: '1069183', APP: '1751008', LMB: '1606163', NMM: '1415921', DVA: '927066', SG: '1477815', RNA: '1599901', GTHX: '1560241', NLOK: '849399', TSM: '1046179', AVGO: '1730168', NEM: '1164727', ATI: '1018963', F: '37996', ROIV: '1635088', INMD: '1742692', NMIH: '1547903', VEC: '1601548', CPRT: '900075', RBA: '1046102', UPST: '1647639' };
export const TICKER_ALIASES = { NLOK: ['NLOK', 'GEN'], VEC: ['VEC', 'VVX'] };
// SEC-Formulare geprueft (submissions API): 20-F/40-F + 6-K, kein 10-Q.
const FPI = new Set(['MTLS', 'AEM', 'NMM', 'INMD', 'TSM', 'ONON', 'SWIR']);
const add = (o) => C.push(o);

// ------------------------------------------------------------------ MAIN (Anker im Beitrag)
const MAIN = [
  ['ZGNX', 'Zogenix Inc', '1006531423380103168', 'ENTRY_DOCUMENTED', 'POST_DAY', 'Ausbruch aus einer grossen VCP; er sagt, er sei positioniert.', { acquired: 'Uebernahme durch UCB 2022 (Ticker entfaellt)', expectedCik: '1375151' }],
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
// Umgruppierung nach dem Red Team (Nachtrag A1, vor jedem Replay): Schluessel Ticker|Status-ID|Klasse.
const REGROUP = {
  'AXON|1834268442897064242|BUY_SETUP': ['SENSITIVITY', 'FOCUS_LIST_NO_DAY_PER_TITLE'],
  'APP|1834268442897064242|BUY_SETUP': ['SENSITIVITY', 'FOCUS_LIST_NO_DAY_PER_TITLE'],
  'LMB|1834268442897064242|BUY_SETUP': ['SENSITIVITY', 'FOCUS_LIST_NO_DAY_PER_TITLE'],
  'NMM|1834268442897064242|BUY_SETUP': ['SENSITIVITY', 'FOCUS_LIST_NO_DAY_PER_TITLE'],
  'DVA|1834268442897064242|BUY_SETUP': ['SENSITIVITY', 'FOCUS_LIST_NO_DAY_PER_TITLE'],
  'GDDY|1796180630608183709|ENTRY_DOCUMENTED': ['SENSITIVITY', 'EX_POST_OUTCOME_CONDITIONED_ANCHOR'],
  'MU|1795475913833845049|ENTRY_DOCUMENTED': ['SENSITIVITY', 'EX_POST_OUTCOME_CONDITIONED_ANCHOR'],
  'PENN|1336343967210876930|BUY_SETUP': ['WATCHLIST', 'PRE_BREAKOUT_POSITION'],
  'DXCM|1276517252016242688|ENTRY_DOCUMENTED': ['ENTRY_TYPE_NOT_MODELLED', 'PULLBACK_BUY'],
  'DKL|1347626186504085509|REENTRY': ['NOT_EVALUATED', 'DUPLICATE_ADD_ON_OVERLAPPING_WINDOW'],
  'RBLX|1380519678162927622|ENTRY_DOCUMENTED': ['NOT_EVALUATED', 'HISTORY_TOO_SHORT_KNOWN_IN_ADVANCE'],
};
const MAIN_B = new Set(['AMD|1286020981086134277', 'REPL|1316394720818593793']);
for (const [ticker, company, id, cls, basis, rationale, x] of MAIN) {
  const pd = postDate(id);
  const anchor = x.anchorDate || (basis === 'PREVIOUS_DAY_STATED' ? 'PREVIOUS_SESSION_OF_POST' : pd);
  const rg = REGROUP[`${ticker}|${id}|${cls}`];
  const group = rg ? rg[0] : 'MAIN';
  const classGroup = group === 'NOT_EVALUATED' ? rg[1] : 'POSITIVE';
  const stratum = group === 'MAIN' ? (MAIN_B.has(`${ticker}|${id}`) ? 'MAIN_B_SETUP_AFFIRMED_NO_OWN_BUY' : 'MAIN_A_OWN_ENTRY') : null;
  add({ ticker, company, statusId: id, postDate: pd, cls, group, classGroup, stratum, regroupReason: rg ? rg[1] : null, anchorBasis: basis, anchor, rationale, extra: x });
}

// ------------------------------------------------------------------ SENSITIVITY (Fenster nur erschlossen)
add({ ticker: 'GTHX', company: 'G1 Therapeutics', statusId: '994943521328193536', cls: 'SOLD', group: 'SENSITIVITY', classGroup: 'POSITIVE', anchorBasis: 'WINDOW_FROM_STATED_DURATION', window: ['2018-04-13', '2018-04-27'], rationale: 'Teilverkauf mit ca. 38 % Gewinn aus einem "3-Wochen-Swing"; Rest mit Absicherung gehalten. Einstieg nur ueber die Dauerangabe erschlossen.', extra: { acquired: 'Uebernahme 2024 (Ticker entfaellt)' } });
add({ ticker: 'NLOK', company: 'NortonLifeLock (heute Gen Digital, GEN)', statusId: '1298663189341708288', cls: 'ENTRY_DOCUMENTED', group: 'SENSITIVITY', classGroup: 'POSITIVE', anchorBasis: 'WINDOW_FROM_DESCRIBED_SEQUENCE', window: ['2020-08-03', '2020-08-19'], rationale: 'Nach dem Ausbruch "gesquattet", bis 13 Cent an seinen Stop, nach 5-taegiger Erholung neue Hochs. Ausbruchstag nicht genannt.', extra: { tickerChange: 'NLOK -> GEN (2022)', note: 'Fenster: Ausbruch vor einer mindestens 5-taegigen Erholung bis zum Beitrag' } });
for (const t of [['TSM', 'Taiwan Semiconductor (ADR)', { foreignPrivateIssuer: true }], ['AVGO', 'Broadcom Inc', {}], ['NEM', 'Newmont Corp', {}], ['ATI', 'ATI Inc', {}], ['F', 'Ford Motor', {}], ['ROIV', 'Roivant Sciences', {}]]) {
  add({ ticker: t[0], company: t[1], statusId: '1999138986254573979', cls: 'ENTRY_DOCUMENTED', group: 'SENSITIVITY', classGroup: 'POSITIVE', anchorBasis: 'WINDOW_FROM_COMPANION_POST', window: ['2025-11-26', '2025-12-11'], rationale: 'Unter den "kuerzlich" long gekauften Titeln genannt; Begleitbeitrag desselben Tages: neun Longs ueber "ein paar Wochen" aufgebaut.', extra: { ...t[2], companionStatusId: '1999131108563112387' } });
}

// ------------------------------------------------------------------ WATCHLIST (Kaufkandidaten, kein Ausbruchstag)
for (const [t, co, x] of [['INMD', 'InMode Ltd', { foreignPrivateIssuer: true }], ['NMIH', 'NMI Holdings', {}], ['VEC', 'Vectrus (heute V2X)', { tickerChange: 'VEC -> VVX (2022)' }], ['CPRT', 'Copart Inc', {}], ['RBA', 'Ritchie Bros. Auctioneers (heute RB Global)', {}]]) {
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

// Beitragszeit (UTC) und US-Ostkuestenzeit; Kennzeichen ausserhalb der Handelszeit 09:30-16:00 ET.
export function postTime(id) {
  const d = new Date(Number((BigInt(id) >> 22n) + 1288834974657n));
  const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t) => et.find((x) => x.type === t).value;
  const hm = `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
  return { utc: d.toISOString(), etDate: `${g('year')}-${g('month')}-${g('day')}`, et: hm, inSession: hm >= '09:30' && hm <= '16:00' };
}

export const SEARCH_ROUNDS = [
  { round: 1, scope: 'Beitraege 2016-2026, Grundsuche', queries: ['bought/VCP breakout pivot', 'I have a position', 'stopped out', 'textbook pivot', 'losers chart post', 'sell/exit posts'], note: 'erste Kandidaten (NVDA, EME, RNA, MU, IBIT, ONON, LEN/DHI, AAPL, AMZN, TNDM, BYND)' },
  { round: 2, scope: '2016-2019', queries: ['"I have a position"', '"nailed down" profit', '"stopped out" 2018', '"added it to our buy list"', '"held into earnings"', 'ACAD bought', 'Ticker-ODER-Listen (ohne Ertrag)', 'Power Play', 'textbook buy point', 'just bought', 'pullback buy'], approxQueries: 27 },
  { round: 3, scope: '2020-2021', queries: ['"I have a position"/"we have a position" (+breaking out, cheat, pullback buy)', '"added to buy alert list"', 'bottom fishing', 'bought $PENN/$RVNC', 'textbook/cheat entry', 'stopped out', 'I sold', 'nailed down', 'we bought', 'pilot buy', 'squat', 'USIC 2021', 'Einzelticker (ZM, ENPH, ... ohne Ertrag)'], approxQueries: 30 },
  { round: 4, scope: '2022-2026', queries: ['bought/VCP/pivot', 'stopped out', 'we bought/I bought/took a position', 'sold/closed out', 'cheat/low cheat', 'would not buy', 'SMCI, PLTR, HOOD/APP/AXON, SG/BROS/GDDY/PSTG, IBKR/KGC/VAPO, TSLA/NFLX/META/AVGO/CRWD', 'buy alert/focus list', 'pivot failure', 'largest position'], approxQueries: 17 },
  { round: 5, scope: '2016-2021 Nachsuche', queries: ['"I have a position" breaking out', 'stopped out $', 'would not buy', 'took a position', 'bought some', 'we have a position $', 'bought yesterday', '$ANF', 'held into earnings', 'cheat entry position', 'pilot buy', 'not a VCP/too loose/sloppy', 'I passed/I did not buy', '$TSLA position', '$SEDG/$ZM/$ETSY'], approxQueries: 20 },
  { round: 6, scope: '2022-2026 Nachsuche', queries: ['I have a position', 'bought today', 'stopped out of', 'we have a position 2025', 'would not buy', 'not a VCP too loose', 'started buying', 'took a position', 'pilot buy', 'I passed/avoided', 'added to my position', '$SMCI/$PLTR/$HOOD', 'we bought/I bought 2025', 'I sold this morning', 'added long', 'low cheat/cheat entry', 'longs include 2026'], approxQueries: 16 },
];
// Gesichtete eigene Beitraege OHNE Fall (kein Ticker im Ausschnitt, reiner Kommentar oder nicht von ihm).
export const HITS_WITHOUT_CASE = [
  ['1017857720643440641', 'Kommentar Ausbruchs- vs. Kaufalarmliste, kein Ticker'], ['1044673175903248391', 'gueltige VCP ueber Cheat-Pivot, kein Ticker'],
  ['1010223336272678912', 'Fuehrer aus Baermarkt, Kauf an Punkt C, Ticker nur im Bild'], ['1280506672302219264', 'Kaufbeginn 6. April, kein Ticker'],
  ['1486770775931637761', 'Verweis auf Verkaufssignal 22.11.2021, kein Ticker'], ['1357080039951597570', 'GME-Kommentar, kein eigener Trade'],
  ['1549118930140254214', 'Buchchart nach geschlossenem Trade, Ticker nicht im Ausschnitt'], ['1884705597402059074', 'progressive Exposure, keine Ticker'],
  ['1922306266732626316', 'wenig kaufbare Titel, keine Ticker'], ['1999131108563112387', 'Begleitbeitrag: SPY short, neun Longs ueber ein paar Wochen'],
  ['2062172291287413179', 'Marktkommentar Pivot-Fehlschlaege, kein Ticker'], ['2049565140245201280', 'Marktkommentar, kein Ticker'], ['2029213943428698253', 'Marktkommentar, kein Ticker'],
  ['1757794761430229353', 'Bitcoin-Kaufprozess, kein Ticker'], ['1785327649230840140', 'GDDY in die Zahlen gehalten (Datum nicht geprueft)'],
  ['1291814626884231168', 'VAPO unter Druck (Fall VAPO ist LOW)'], ['1483555391887843334', 'USIC-2021-Siegmeldung, keine Trades'],
  ['1225143094682771456', 'TSLA allgemein, kein eigener Trade'], ['1449091307343949828', 'Beitrag von CNBC PowerLunch, nicht von ihm'],
];

export function buildCases() {
  const counters = {};
  const cases = C.map((c, i) => {
    const pd = c.statusId ? postDate(c.statusId) : null;
    const evaluated = ['MAIN', 'SENSITIVITY', 'WATCHLIST', 'NEGATIVE', 'ENTRY_TYPE_NOT_MODELLED'].includes(c.group);
    const conf = c.extra?.sourceConfidence || (c.classGroup === 'LOW_CONFIDENCE' ? 'LOW' : 'MEDIUM');
    counters[c.group] = (counters[c.group] || 0) + 1;
    const { sourceConfidence, anchorDate, ...extra } = c.extra || {};
    const ticker0 = c.ticker.split(';')[0];
    const fpi = FPI.has(ticker0) || extra.foreignPrivateIssuer === true;
    const tags = [fpi ? 'FOREIGN_PRIVATE_ISSUER_NO_10Q' : null, extra.partnership ? 'PARTNERSHIP_UNITS' : null, c.anchorBasis === 'WEEKDAY_STATED' ? 'EX_POST_ANCHOR' : null, extra.entryType ? 'ENTRY_' + extra.entryType : null, extra.tickerReused ? 'TICKER_REUSED_LATER' : null, extra.tickerChange ? 'TICKER_CHANGED' : null, extra.acquired ? 'ACQUIRED_LATER' : null].filter(Boolean);
    const seedKey = `${ticker0}|${c.statusId || ''}|${c.anchor || (c.window ? c.window.join('..') : '')}`;
    return {
      case_id: `GT-${String(i + 1).padStart(3, '0')}`,
      ticker: c.ticker,
      company: c.company,
      historical_ticker: c.ticker,
      ticker_aliases: TICKER_ALIASES[ticker0] || [ticker0],
      date_or_window: c.window ? { window: c.window } : { anchor: c.anchor || null, postDate: pd },
      anchor_basis: c.anchorBasis || null,
      source: c.statusId ? { kind: 'X_POST_OWN', account: '@markminervini', statusId: c.statusId, postDate: pd, postTime: postTime(c.statusId), url: url(c.statusId), read: 'SEARCH_SNIPPET_ONLY' } : { kind: 'SECONDARY_HINT', read: 'NOT_READ' },
      source_type: c.statusId ? 'TIER2_OWN_POST' : 'SECONDARY',
      source_confidence: conf,
      minervini_classification: c.cls,
      evaluation_group: c.group,
      stratum: c.stratum || null,
      regroup_reason: c.regroupReason || null,
      class_group: c.classGroup,
      tags,
      own_trade: extra.ownTrade ?? (['BUY_SETUP'].includes(c.cls) ? 'unknown' : ['AVOID_OR_NEGATIVE', 'ILLUSTRATIVE_ONLY', 'NOT_LONG_EQUITY'].includes(c.cls) ? false : true),
      documented_entry: { date: c.anchor && /^\d{4}/.test(c.anchor) && c.anchorBasis !== 'POST_DAY' ? c.anchor : null, price: null },
      documented_pivot: null,
      documented_exit: { date: c.cls === 'SOLD' || c.cls === 'STOPPED_OUT' ? (pd ? 'ON_OR_BEFORE_' + pd : null) : null, price: null },
      documented_rationale: c.rationale,
      identity: { ticker_then: c.ticker, expected_cik: EXPECTED_CIK[ticker0] || null, cik_source: EXPECTED_CIK[ticker0] ? 'SEC company_tickers.json / EDGAR-Suche (07.10.2026)' : null, resolution: evaluated ? 'IN_REPLAY_BY_TICKER_AND_DATE (damaliges Listing; CIK gegen den SEC-Datenlayer geprueft)' : null, events: Object.fromEntries(Object.entries(extra).filter(([k]) => ['acquired', 'tickerChange', 'tickerReused', 'foreignPrivateIssuer', 'partnership', 'listing'].includes(k))) },
      notes: [extra.entryType ? `Einstiegsart: ${extra.entryType}` : null, extra.note || null, extra.sameTitleAs ? `gleicher Titel wie ${extra.sameTitleAs}` : null, extra.companionStatusId ? `Begleitbeitrag ${extra.companionStatusId}` : null, c.group === 'SENSITIVITY' && c.window ? 'Fenster vom Forscher aus der Beitragsangabe erschlossen; setupAtTStar in diesem Modus guenstig gewaehlt' : null].filter(Boolean),
      ...(evaluated ? { control_seed_key: seedKey, replay_spec: { anchorDate: c.window ? null : c.anchor, window: c.window || null, documentedPivot: null, classGroup: c.classGroup } } : {}),
    };
  });
  return {
    schema: 'vu-minervini-ground-truth-cases-1.1.0',
    status: 'AFTER_RED_TEAM_BEFORE_FREEZE',
    prereg: ['scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-PREREG.json', 'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-PREREG-A1.json'],
    sourcing: {
      method: 'Domain-gefilterte Websuche (x.com/twitter.com) nach Minervinis eigenen Beitraegen; nur Ausschnitt-/Titeltext seiner Beitraege verwendet; Datum aus der Status-ID.',
      limits: ['x.com, minervini.com und Archive aus dieser Umgebung nicht abrufbar -> keine Volltexte, keine Bilder (viele Ticker stehen nur in Chartbildern)', 'Autor, Zitat-/Antwortkontext und Bilder nicht pruefbar (nur Suchindex-Ausschnitte)', 'Suchindex enthaelt nur einen kleinen, popularitaetsverzerrten Ausschnitt seines Feeds; Suchbegriffe wie "breakout"/"VCP" bevorzugen enginefreundliche Beitraege (Auswahlverzerrung nicht kontrollierbar)', 'Verlusttrades (QCOM, SWIR, Verliererliste) haben keinen Einstiegstag und fallen aus der Auswertung (Asymmetrie)', 'Buecher (TLSMW, TTLAC, Mindset) nicht lesbar -> keine Buchfaelle; Buchbeispiele liegen zudem ueberwiegend vor 2008', 'Keine Preise (Pivot/Einstieg/Stop) in den Ausschnitten -> Pivot-Vergleich nicht moeglich'],
      noModelMemory: 'Kein Fall stammt aus Modellwissen; Ticker aus Suchzusammenfassungen ohne Ausschnittbeleg sind LOW und werden nicht ausgewertet.',
      selection: 'Jeder gesichtete eigene Beitrag mit Ticker ist als Fall erfasst (auch nicht ausgewertete); gesichtete Beitraege ohne Fall stehen in hitsWithoutCase. Keine Auswahl nach spaeterem Kursverlauf.',
      searchRounds: SEARCH_ROUNDS,
      hitsWithoutCase: HITS_WITHOUT_CASE.map(([statusId, reason]) => ({ statusId, postDate: postDate(statusId), reason })),
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

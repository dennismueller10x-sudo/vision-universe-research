/** Isolated SEC annual/PIT input certification. No core migration or strategy changes. */
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const ANNUAL_FACT_SCHEMA = 'supertrader-certified-annual-facts-1.0.0';
export const ANNUAL_SOURCE_CONCEPTS = Object.freeze({
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
  cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue'], assets: ['Assets'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities'],
  currentAssets: ['AssetsCurrent'], currentLiabilities: ['LiabilitiesCurrent'],
  longTermDebt: ['LongTermDebtNoncurrent'], cash: ['CashAndCashEquivalentsAtCarryingValue'],
  currentDebt: ['DebtCurrent'], totalDebt: ['DebtLongtermAndShorttermCombinedAmount'],
  netPPE: ['PropertyPlantAndEquipmentNet'],
});
const INSTANT_KEYS = new Set(['assets', 'currentAssets', 'currentLiabilities', 'longTermDebt', 'cash', 'currentDebt', 'totalDebt', 'netPPE']);
const OPERAND_CONCEPTS = ['StockholdersEquity', 'PreferredStockSharesOutstanding', 'PreferredStockValueOutstanding',
  'PreferredStockCarryingValue', 'NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'InterestAndDebtExpense', 'InterestExpenseNonOperating', 'ProceedsFromIssuanceOfCommonStock',
  'ProceedsFromStockOptionsExercised', 'OperatingIncomeLoss', 'FinanceLeaseLiabilityNoncurrent', 'CapitalLeaseObligationsNoncurrent'];
const META_CONCEPTS = ['DocumentFiscalYearFocus', 'DocumentFiscalPeriodFocus', 'DocumentPeriodEndDate',
  'DocumentType', 'DocumentTransitionReport', 'EntityCentralIndexKey'];
const REQUIRED_KEYS = [...Object.keys(ANNUAL_SOURCE_CONCEPTS), 'bookEquity', 'incomeBeforeExtraordinaryItems', 'ebit',
  'grossCommonEquityIssued', 'noCommonEquityIssued', 'sic'];
const DERIVED_DEPENDENCIES = {
  bookEquity: ['StockholdersEquity', 'PreferredStockSharesOutstanding', 'PreferredStockCarryingValue'],
  incomeBeforeExtraordinaryItems: ['NetIncomeLoss'],
  ebit: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'InterestAndDebtExpense'],
  totalDebt: ['DebtCurrent', 'LongTermDebtNoncurrent', 'FinanceLeaseLiabilityNoncurrent', 'CapitalLeaseObligationsNoncurrent'],
  noCommonEquityIssued: ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised'],
};
function affectedKeys(concepts) {
  return [...new Set(Object.entries({...ANNUAL_SOURCE_CONCEPTS, ...DERIVED_DEPENDENCIES}).filter(([, tags]) =>
    tags.some(tag => concepts.includes(tag))).map(([key]) => key))];
}
const SHA = /^[a-f0-9]{64}$/;
const ACC = /^\d{10}-\d{2}-\d{6}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cik = value => /^\d{1,10}$/.test(String(value)) && BigInt(value) > 0 ? String(BigInt(value)).padStart(10, '0') : null;
function day(value) { return typeof value === 'string' && DAY.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null; }
function utc(value) {
  return typeof value === 'string' && day(value.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function duration(start, end) { return day(start) && day(end) ? (Date.parse(end) - Date.parse(start)) / 86400000 + 1 : NaN; }
function annual(start, end) { const days = duration(start, end); return days >= 330 && days <= 390; }
function officialArtifact(artifact, issuer, accession) {
  if (!artifact || typeof artifact.text !== 'string' || !SHA.test(artifact.sha256 ?? '') || hash(artifact.text) !== artifact.sha256) throw new Error('PRIMARY_ARTIFACT_SHA256_REQUIRED');
  const url = new URL(artifact.url);
  const issuerNumber = String(BigInt(issuer)), accessionPath = accession.replaceAll('-', '');
  if (url.protocol !== 'https:' || url.hostname !== 'www.sec.gov' || url.search || url.hash ||
      !(url.pathname.startsWith(`/Archives/edgar/data/${issuerNumber}/${accessionPath}/`) ||
        url.pathname === `/Archives/edgar/data/${issuerNumber}/${accession}.txt`)) throw new Error('PRIMARY_ARTIFACT_ACCESSION_ISSUER_URL_MISMATCH');
  return {url: artifact.url, sha256: artifact.sha256, hashScope: artifact.byteRange ? 'RECEIVED_ORIGINAL_BYTE_RANGE' : 'FULL_RECEIVED_DOCUMENT',
    byteRange: artifact.byteRange ?? null};
}

// Standard-library parser resolves namespace URIs, entity/context scope and unit
// measures from actual XBRL bytes. Prefix labels/decimals never imply USD scaling.
const XML_PARSER = String.raw`
import json,sys,xml.etree.ElementTree as E,math
p=json.load(sys.stdin);text=p['text']
if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():raise ValueError('DTD_NOT_ALLOWED')
ns={'i':'http://www.xbrl.org/2003/instance'};scopes={};stack=[{}];pending={}
parser=E.iterparse(__import__('io').StringIO(text),events=['start-ns','start','end'])
for event,node in parser:
 if event=='start-ns':pending[node[0]]=node[1]
 elif event=='start':
  scope={**stack[-1],**pending};pending={};stack.append(scope);scopes[id(node)]=scope
 else:stack.pop()
root=parser.root
contexts={};units={}
for c in root.findall('i:context',ns):
 key=c.get('id')
 if not key or key.strip()!=key or key in contexts:raise ValueError('CONTEXT_ID_NOT_UNIQUE_OR_EMPTY')
 contexts[key]=None
 ident=c.find('i:entity/i:identifier',ns);period=c.find('i:period',ns)
 if ident is None or period is None:continue
 dims=any(e.tag.endswith('explicitMember') or e.tag.endswith('typedMember') or e.tag.endswith('segment') or e.tag.endswith('scenario') for e in c.iter())
 contexts[key]={'issuer':(ident.text or '').strip(),'scheme':ident.get('scheme'),'start':period.findtext('i:startDate',namespaces=ns),'end':period.findtext('i:endDate',namespaces=ns) or period.findtext('i:instant',namespaces=ns),'dimensional':dims}
for u in root.findall('i:unit',ns):
 key=u.get('id')
 if not key or key.strip()!=key or key in units:raise ValueError('UNIT_ID_NOT_UNIQUE_OR_EMPTY')
 units[key]='UNSUPPORTED'
 measures=u.findall('i:measure',ns)
 if len(measures)!=1 or u.find('i:divide',ns) is not None:continue
 m=(measures[0].text or '').strip();parts=m.split(':',1)
 prefixes=scopes[id(measures[0])]
 uri=prefixes.get(parts[0]) if len(parts)==2 else prefixes.get('');local=parts[-1]
 units[key]='USD' if uri=='http://www.xbrl.org/2003/iso4217' and local=='USD' else 'SHARES' if uri==ns['i'] and local=='shares' else 'UNSUPPORTED'
facts=[];meta={}
for e in root:
 if not e.tag.startswith('{'):continue
 uri,name=e.tag[1:].split('}',1);ref=e.get('contextRef');context=contexts.get(ref) if ref else None
 if not context:continue
 if context['dimensional'] or not context['issuer'].isdigit() or int(context['issuer'])!=int(p['issuer']):continue
 if context['scheme'] not in ['http://www.sec.gov/CIK','https://www.sec.gov/CIK']:continue
 is_dei=uri.startswith('http://xbrl.sec.gov/dei/') or uri.startswith('https://xbrl.sec.gov/dei/')
 if is_dei and name in p['meta']:
  meta.setdefault(name,[]).append((e.text or '').strip());continue
 is_gaap=any(uri.startswith(base) for base in ['http://fasb.org/us-gaap/','https://fasb.org/us-gaap/','http://xbrl.us/us-gaap/','http://taxonomies.xbrl.us/us-gaap/'])
 if not is_gaap or name not in p['concepts']:continue
 if not e.get('unitRef') or e.get('unitRef') not in units:continue
 try:v=float(e.text)
 except (TypeError,ValueError):continue
 if not math.isfinite(v):continue
 facts.append({'concept':name,'namespace':uri,'value':v,'unit':units.get(e.get('unitRef'),'UNSUPPORTED'),'start':context['start'],'end':context['end'],'contextId':e.get('contextRef'),'decimals':e.get('decimals')})
json.dump({'meta':meta,'facts':facts},sys.stdout)
`;

export function parseAnnualPrimaryArtifact(artifact, issuerCik, accession) {
  const issuer = cik(issuerCik);
  if (!issuer || !ACC.test(accession ?? '')) throw new Error('ISSUER_ACCESSION_REQUIRED');
  const source = officialArtifact(artifact, issuer, accession);
  const parsed = spawnSync('python3', ['-c', XML_PARSER], {input: JSON.stringify({text: artifact.text, issuer,
    concepts: [...new Set([...Object.values(ANNUAL_SOURCE_CONCEPTS).flat(), ...OPERAND_CONCEPTS])], meta: META_CONCEPTS}), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  if (parsed.status !== 0) throw new Error('PRIMARY_XBRL_CONTEXT_UNIT_PARSE_FAILED');
  return {...JSON.parse(parsed.stdout), source, accession, issuerCik: issuer};
}

export function acceptanceIndex(submissions, historicalSubmissions = [], issuerCik = submissions?.cik) {
  const issuer = cik(issuerCik);
  if (!issuer || cik(submissions?.cik) !== issuer) throw new Error('SUBMISSIONS_ISSUER_MISMATCH');
  const index = new Map();
  for (const document of [submissions, ...historicalSubmissions]) {
    if (document.cik != null && cik(document.cik) !== issuer) throw new Error('HISTORICAL_SUBMISSIONS_ISSUER_MISMATCH');
    const rows = document.filings?.recent ?? document;
    for (let i = 0; i < (rows.accessionNumber ?? []).length; i++) {
      const accession = rows.accessionNumber[i], accepted = utc(rows.acceptanceDateTime?.[i]);
      const record = {accession, acceptedAt: accepted, apiAcceptedAtRaw: rows.acceptanceDateTime?.[i] ?? null, reportDate: day(rows.reportDate?.[i]),
        filingDate: day(rows.filingDate?.[i]), form: rows.form?.[i], issuerCik: issuer};
      // The API clock is diagnostic only; a complete original header can certify
      // a filing even when the API clock is missing or malformed.
      if (!ACC.test(accession ?? '') || !record.reportDate || !record.filingDate) continue;
      const prior = index.get(accession);
      if (prior && JSON.stringify(prior) !== JSON.stringify(record)) throw new Error('CONFLICTING_ACCESSION_ACCEPTANCE_METADATA');
      index.set(accession, record);
    }
  }
  return index;
}
/** SEC archival acceptance header is New York local time, not an ISO UTC API clock. */
export function certifyOriginalAcceptance(header, filing) {
  const source = officialArtifact(header, filing.issuerCik, filing.accession);
  const accessionMatch = header.text.match(/ACCESSION NUMBER:\s*(\d{10}-\d{2}-\d{6})/);
  const timestamp = header.text.match(/<ACCEPTANCE-DATETIME>\s*(\d{14})/);
  const report = header.text.match(/CONFORMED PERIOD OF REPORT:\s*(\d{8})/);
  const filed = header.text.match(/FILED AS OF DATE:\s*(\d{8})/);
  const form = header.text.match(/CONFORMED SUBMISSION TYPE:\s*([^\r\n]+)/);
  if (accessionMatch?.[1] !== filing.accession || !timestamp || !report || !filed || !form || form[1].trim() !== filing.form) throw new Error('ORIGINAL_ACCEPTANCE_HEADER_BINDING_REQUIRED');
  const dateFromCompact = value => day(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  const reportDate = dateFromCompact(report[1]), filingDate = dateFromCompact(filed[1]);
  const converted = spawnSync('python3', ['-c', String.raw`
import sys,datetime,zoneinfo
s=sys.stdin.read();naive=datetime.datetime.strptime(s,'%Y%m%d%H%M%S');z=zoneinfo.ZoneInfo('America/New_York')
a=naive.replace(tzinfo=z,fold=0);b=naive.replace(tzinfo=z,fold=1)
if a.utcoffset()!=b.utcoffset():raise ValueError('AMBIGUOUS_OR_NONEXISTENT_LOCAL_ACCEPTANCE')
u=a.astimezone(datetime.timezone.utc)
if u.astimezone(z).replace(tzinfo=None)!=naive:raise ValueError('NONEXISTENT_LOCAL_ACCEPTANCE')
print(u.isoformat(timespec='milliseconds').replace('+00:00','Z'))
`], {input: timestamp[1], encoding: 'utf8'});
  const acceptedAt = converted.status === 0 ? utc(converted.stdout.trim()) : null;
  if (!reportDate || !filingDate || !acceptedAt || Date.parse(reportDate) > Date.parse(acceptedAt)) throw new Error('ORIGINAL_ACCEPTANCE_LOCAL_CLOCK_NOT_CERTIFIED');
  const apiClockConflict = filing.acceptedAt !== acceptedAt;
  return {...filing, reportDate, filingDate, acceptedAt, apiAcceptedAt: filing.acceptedAt,
    acceptanceSource: {...source, locator: 'ACCEPTANCE-DATETIME; America/New_York IANA timezone'},
    apiClockConflict, knowledgeConfidence: apiClockConflict ? 'MEDIUM' : 'HIGH',
    pitState: apiClockConflict ? 'PIT_PARTIAL_TIME_SOURCE_CONFLICT' : 'EXACT_ORIGINAL_HEADER_CLOCK'};
}

/** A historical industry code comes from that filing's header, never today's API SIC. */
export function certifyOriginalSICHeader({header, filing, signalSessions = []}) {
  if (!['10-K', '10-K/A'].includes(filing?.form)) throw new Error('ORIGINAL_ANNUAL_SIC_FILING_REQUIRED');
  const certified = certifyOriginalAcceptance(header, filing);
  const values = [...new Set([...header.text.matchAll(/STANDARD INDUSTRIAL CLASSIFICATION:[^\n]*\[(\d{4})\]/g)].map(m => Number(m[1])))];
  if (values.length !== 1 || values[0] === 0) throw new Error('ORIGINAL_HEADER_SIC_SCOPE_NOT_ESTABLISHED');
  return {key: 'sic', value: values[0], unit: 'CODE', frequency: 'ANNUAL', periodEnd: certified.reportDate,
    fiscalYear: null, availableAt: certified.acceptedAt, firstKnownAt: certified.acceptedAt,
    origin: 'AS_REPORTED_AT_TIME', source: {...officialArtifact(header, filing.issuerCik, filing.accession),
      accession: filing.accession, provider: 'SEC_EDGAR_ORIGINAL_SUBMISSION_HEADER', locator: 'STANDARD INDUSTRIAL CLASSIFICATION'},
    eligibility: eligibleAt(certified.acceptedAt, signalSessions), certification: {concept: 'sic', normalized: true,
      mapping: 'EXACT_ORIGINAL_ACCESSION_HEADER', issuerCik: filing.issuerCik,
      knowledgeEvidence: 'EXACT_ORIGINAL_ARCHIVAL_HEADER_NEW_YORK_TO_UTC', acceptanceEvidence: certified.acceptanceSource,
      apiClockConflict: certified.apiClockConflict, confidence: certified.knowledgeConfidence, pitState: certified.pitState}};
}
function scalar(meta, key) { const values = [...new Set(meta[key] ?? [])]; return values.length === 1 ? values[0] : null; }
function eligibleAt(acceptedAt, sessions) {
  const valid = sessions.map(session => ({sessionDate: day(session.sessionDate), formationCutoffUTC: utc(session.formationCutoffUTC)}));
  if (valid.some(session => !session.sessionDate || !session.formationCutoffUTC)) throw new Error('EXPLICIT_UTC_SIGNAL_SESSION_CUTOFF_REQUIRED');
  valid.sort((a, b) => Date.parse(a.formationCutoffUTC) - Date.parse(b.formationCutoffUTC));
  const first = valid.find(session => Date.parse(acceptedAt) <= Date.parse(session.formationCutoffUTC));
  return {status: first ? 'FIRST_ELIGIBLE_SIGNAL_SESSION_CERTIFIED' : 'SIGNAL_CALENDAR_NOT_ESTABLISHED',
    firstEligibleSignalSession: first?.sessionDate ?? null, formationCutoffUTC: first?.formationCutoffUTC ?? null,
    availableAtRemainsActualAcceptance: true};
}
function approved(approvals, id) {
  return approvals.find(a => a.id === id && a.status === 'APPROVED_BEFORE_MEASUREMENT' && SHA.test(a.reviewArtifactSha256 ?? '') &&
    typeof a.reviewer === 'string' && a.reviewer.trim() && Array.isArray(a.primarySources) && a.primarySources.length &&
    a.primarySources.every(url => typeof url === 'string' && url.startsWith('https://')));
}

function applyAnnualMappings({get, emit, period, derivationApprovals}) {
  for (const [key, concepts] of Object.entries(ANNUAL_SOURCE_CONCEPTS)) {
    const f = get(concepts, 'USD', INSTANT_KEYS.has(key));
    if (f) emit(key, f.value, [f], `EXACT_US_GAAP_${key.toUpperCase()}`);
  }
  const equity = get(['StockholdersEquity'], 'USD', true), prefShares = get(['PreferredStockSharesOutstanding'], 'SHARES', true);
  const zeroPrefApproval = approved(derivationApprovals, 'COMMON_EQUITY_PARENT_WITH_ZERO_PREFERRED_OUTSTANDING');
  if (equity && prefShares?.value === 0 && zeroPrefApproval) emit('bookEquity', equity.value, [equity, prefShares],
    'PARENT_EQUITY_EXCLUDES_NCI_EXPLICIT_ZERO_PREFERRED_OUTSTANDING', 'DERIVED_EXACT_ZERO_PREFERRED', zeroPrefApproval);
  const prefCarrying = get(['PreferredStockCarryingValue'], 'USD', true);
  const subtractPrefApproval = approved(derivationApprovals, 'COMMON_EQUITY_PARENT_MINUS_VERIFIED_PREFERRED_CARRYING');
  if (equity && prefCarrying && prefCarrying.value >= 0 && subtractPrefApproval) emit('bookEquity', equity.value - prefCarrying.value,
    [equity, prefCarrying], 'PARENT_EQUITY_MINUS_EXACT_PREFERRED_CARRYING_EXCLUDES_NCI', 'DERIVED_SUBTRACTION', subtractPrefApproval);
  const currentDebt = get(['DebtCurrent'], 'USD', true), noncurrentDebt = get(['LongTermDebtNoncurrent'], 'USD', true);
  const financeLease = get(['FinanceLeaseLiabilityNoncurrent', 'CapitalLeaseObligationsNoncurrent'], 'USD', true);
  const debtApproval = approved(derivationApprovals, 'TOTAL_DEBT_CURRENT_PLUS_NONCURRENT_WITH_EXPLICIT_FINANCE_LEASE_COVERAGE');
  if (currentDebt && noncurrentDebt && financeLease && [currentDebt, noncurrentDebt, financeLease].every(f => f.value >= 0) &&
      debtApproval?.debtDefinition === 'DEBT_EXCLUDING_OPERATING_LEASES_INCLUDING_FINANCE_LEASES') emit('totalDebt',
    currentDebt.value + noncurrentDebt.value + financeLease.value, [currentDebt, noncurrentDebt, financeLease],
    'CURRENT_DEBT_WITH_CURRENT_FINANCE_LEASE_PLUS_NONCURRENT_DEBT_PLUS_EXPLICIT_NONCURRENT_FINANCE_LEASE', 'DERIVED_NONOVERLAPPING_DEBT_COMPONENTS', debtApproval);
  const income = get(['NetIncomeLoss']);
  const incomeApproval = approved(derivationApprovals, 'US_GAAP_ASU2015_01_NET_INCOME_PARENT_NO_EXTRAORDINARY');
  // ASU effective date is period BEGINNING after Dec15,2015; FY label alone is insufficient.
  if (income && incomeApproval && period.periodStart > '2015-12-15') emit('incomeBeforeExtraordinaryItems', income.value, [income],
    'US_GAAP_PARENT_NET_INCOME_EXTRAORDINARY_CATEGORY_ELIMINATED_ASU2015_01', 'DERIVED_ACCOUNTING_STANDARD_IDENTITY', incomeApproval);
  const pbt = get(['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest']);
  const interest = get(['InterestAndDebtExpense']);
  const ebitApproval = approved(derivationApprovals, 'EBIT_PBT_PLUS_GROSS_INTEREST_SOURCE_COMPATIBLE');
  if (pbt && interest && interest.value >= 0 && ebitApproval?.ebitDefinition === 'TOTAL_PRETAX_EARNINGS_BEFORE_GROSS_INTEREST') emit('ebit', pbt.value + interest.value,
    [pbt, interest], 'SOURCE_APPROVED_TOTAL_PRETAX_EARNINGS_PLUS_GROSS_INTEREST_NOT_AUTOMATIC_OPERATING_PROFIT', 'DERIVED_ADDITION', ebitApproval);
  const issuance = [get(['ProceedsFromIssuanceOfCommonStock']), get(['ProceedsFromStockOptionsExercised'])].find(f => f?.value > 0);
  if (issuance && issuance.value > 0) emit('noCommonEquityIssued', false, [issuance],
    'POSITIVE_COMMON_EQUITY_CASH_ISSUANCE_PROVES_FALSE_ONLY_NO_ZERO_INFERENCE', 'DERIVED_POSITIVE_ISSUANCE_FALSE_ONLY', null, 'BOOLEAN');
}

export function certifyAnnualFacts({companyfacts = null, submissions, historicalSubmissions = [], filingDocuments = [],
  securityId, issuerCik = submissions?.cik, signalSessions = [], derivationApprovals = []}) {
  const issuer = cik(issuerCik);
  if (!securityId || !issuer) throw new Error('SECURITY_ISSUER_BINDING_REQUIRED');
  if (companyfacts && cik(companyfacts.cik) !== issuer) throw new Error('COMPANYFACTS_ISSUER_MISMATCH');
  const filings = acceptanceIndex(submissions, historicalSubmissions, issuer), documents = [], rejected = [];
  for (const input of filingDocuments) {
    const apiFiling = filings.get(input.accession);
    if (!apiFiling || !['10-K', '10-K/A'].includes(apiFiling.form)) {rejected.push({reason: 'ORIGINAL_ANNUAL_ACCEPTANCE_METADATA_MISSING'}); continue;}
    let filing;
    try {filing = certifyOriginalAcceptance(input.filingHeader, apiFiling);}
    catch {rejected.push({reason: 'EXACT_ORIGINAL_ACCEPTANCE_HEADER_NOT_CERTIFIED'}); continue;}
    let doc;
    try {doc = {...parseAnnualPrimaryArtifact(input, issuer, input.accession), filing};}
    catch {rejected.push({reason: 'PRIMARY_DOCUMENT_NOT_CERTIFIED'}); continue;}
    const focusEnd = scalar(doc.meta, 'DocumentPeriodEndDate'), focusYearText = scalar(doc.meta, 'DocumentFiscalYearFocus'), focusYear = Number(focusYearText);
    if (focusEnd !== filing.reportDate || !/^\d{4}$/.test(focusYearText ?? '') || !Number.isInteger(focusYear) || focusYear < 1900 || focusYear > 2200 ||
        scalar(doc.meta, 'DocumentFiscalPeriodFocus') !== 'FY' || scalar(doc.meta, 'DocumentType') !== filing.form ||
        /^(true|1)$/i.test(scalar(doc.meta, 'DocumentTransitionReport') ?? '')) {rejected.push({reason: 'CURRENT_REPORT_FISCAL_FOCUS_NOT_CERTIFIED'}); continue;}
    const starts = [...new Set(doc.facts.filter(f => f.end === focusEnd && f.unit === 'USD' && annual(f.start, f.end)).map(f => f.start))];
    if (starts.length !== 1) {rejected.push({reason: 'FULL_ANNUAL_DURATION_NOT_CERTIFIED'}); continue;}
    documents.push({...doc, fiscalYear: focusYear, periodEnd: focusEnd, periodStart: starts[0]});
  }
  const periods = new Map(), fiscalPeriodConflicts = [];
  for (const doc of documents.filter(d => d.filing.form === '10-K').sort((a, b) => a.filing.acceptedAt.localeCompare(b.filing.acceptedAt))) {
    const prior = periods.get(doc.periodEnd);
    if (!prior) periods.set(doc.periodEnd, doc);
  }
  for (const doc of documents) {
    const original = periods.get(doc.periodEnd);
    if (original && (original.fiscalYear !== doc.fiscalYear || original.periodStart !== doc.periodStart)) {
      fiscalPeriodConflicts.push({securityId, issuerCik: issuer, currentPeriodEnd: doc.periodEnd, knownFrom: doc.filing.acceptedAt,
        source: doc.source, status: 'BLOCKED_ORIGINAL_FISCAL_PERIOD_CONFLICT', certification: {originalAnnual: false, fiscalLineageVerified: false}});
      rejected.push({reason: 'CONFLICTING_ORIGINAL_FISCAL_PERIOD_LINEAGE', availableAt: doc.filing.acceptedAt});
    }
  }
  for (const doc of documents.filter(d => d.filing.form === '10-K')) {
    for (const earlier of documents.filter(d => d.filing.form === '10-K' && d.fiscalYear === doc.fiscalYear &&
      d.periodEnd !== doc.periodEnd && d.filing.acceptedAt <= doc.filing.acceptedAt)) {
      for (const end of [earlier.periodEnd, doc.periodEnd]) {
        fiscalPeriodConflicts.push({securityId, issuerCik: issuer, currentPeriodEnd: end, knownFrom: doc.filing.acceptedAt,
          source: doc.source, status: 'BLOCKED_ORIGINAL_FISCAL_PERIOD_CONFLICT', certification: {originalAnnual: false, fiscalLineageVerified: false}});
      }
    }
  }
  const rows = [], factConflicts = [];
  for (const doc of documents) {
    if (fiscalPeriodConflicts.some(c => c.currentPeriodEnd === doc.periodEnd && c.knownFrom === doc.filing.acceptedAt)) continue;
    for (const period of periods.values()) {
      if (period.periodEnd > doc.periodEnd || Date.parse(period.filing.acceptedAt) > Date.parse(doc.filing.acceptedAt)) continue;
      const annualFacts = doc.facts.filter(f => f.end === period.periodEnd && (f.start == null || f.start === period.periodStart) &&
        (f.start == null || annual(f.start, f.end)));
      const get = (concepts, expectedUnit = 'USD', instant = false) => {
        const matches = annualFacts.filter(f => concepts.includes(f.concept) && f.unit === expectedUnit && (instant ? f.start == null : f.start === period.periodStart));
        if (!matches.length) return null;
        if (new Set(matches.map(f => f.value)).size !== 1) {
          for (const key of affectedKeys(concepts)) factConflicts.push({key, periodEnd: period.periodEnd,
            knownFrom: doc.filing.acceptedAt, status: 'BLOCKED_VISIBLE_FACT_CONFLICT', sources: [doc.source]});
          return null;
        }
        if (companyfacts && matches.some(f => {
          const raw = companyfacts.facts?.['us-gaap']?.[f.concept]?.units?.[expectedUnit === 'SHARES' ? 'shares' : expectedUnit] ?? [];
          const reported = raw.filter(r => r.accn === doc.accession && r.end === f.end && (r.start ?? null) === (f.start ?? null));
          return !reported.length || reported.some(r => r.val !== f.value || r.filed !== doc.filing.filingDate);
        })) return null;
        return matches[0];
      };
      const emit = (key, value, operands, definition, mapping = 'DIRECT_PRIMARY_REPORT', approval = null, unit = 'USD') => {
        const source = {...doc.source, accession: doc.accession, provider: 'SEC_EDGAR_PRIMARY_XBRL', locator: operands.map(f => `${f.concept}@${f.contextId}`).join('|')};
        rows.push({key, value, unit, frequency: 'ANNUAL', fiscalYear: period.fiscalYear, periodStart: period.periodStart,
          periodEnd: period.periodEnd, annualperiod: {start: period.periodStart, end: period.periodEnd},
          fiscalPeriodId: `${securityId}:FY:${period.fiscalYear}:${period.periodEnd}`, availableAt: doc.filing.acceptedAt,
          firstKnownAt: doc.filing.acceptedAt, origin: 'AS_REPORTED_AT_TIME', source,
          eligibility: eligibleAt(doc.filing.acceptedAt, signalSessions),
          certification: {concept: key, normalized: true, mapping, definition, issuerCik: issuer,
            sourceConcepts: operands.map(f => `us-gaap:${f.concept}`), unitEvidence: 'PRIMARY_XBRL_RESOLVED_USD_UNIT_NO_SCALE_INFERENCE',
            annualPeriodEvidence: {fiscalYearMethod: 'DEI_CURRENT_REPORT_FOCUS_ONLY', originalPeriodAccession: period.accession,
              originalPeriodSource: period.source, durationDays: duration(period.periodStart, period.periodEnd)},
            knowledgeEvidence: 'EXACT_ORIGINAL_ARCHIVAL_HEADER_NEW_YORK_TO_UTC', issuerScope: 'NON_DIMENSIONAL_SEC_ENTITY',
            acceptanceEvidence: doc.filing.acceptanceSource, apiAcceptedAt: doc.filing.apiAcceptedAt,
            apiAcceptedAtRaw: doc.filing.apiAcceptedAtRaw,
            apiClockConflict: doc.filing.apiClockConflict, confidence: doc.filing.knowledgeConfidence, pitState: doc.filing.pitState,
            operands: operands.map(f => ({...f, accession: doc.accession, acceptedAt: doc.filing.acceptedAt, source: doc.source})),
            derivationApproval: approval ?? null}});
      };
      applyAnnualMappings({get, emit, period, derivationApprovals});
    }
  }
  const links = [];
  const annualPeriods = [...periods.values()];
  for (const current of annualPeriods) {
    const candidates = annualPeriods.filter(p => p.fiscalYear === current.fiscalYear - 1 && p.periodEnd < current.periodEnd &&
      annual(p.periodEnd, current.periodEnd) && new Date(Date.parse(p.periodEnd) + 86400000).toISOString().slice(0, 10) === current.periodStart);
    if (!candidates.length) continue;
    const previous = candidates.sort((a, b) => a.filing.acceptedAt.localeCompare(b.filing.acceptedAt))[0];
    const knownFrom = [current.filing.acceptedAt, previous.filing.acceptedAt].sort().at(-1);
    if (candidates.filter(p => p.filing.acceptedAt <= knownFrom).length !== 1 ||
        annualPeriods.filter(p => p.fiscalYear === current.fiscalYear && p.filing.acceptedAt <= knownFrom).length !== 1) continue;
    links.push({securityId, issuerCik: issuer, currentPeriodEnd: current.periodEnd, previousPeriodEnd: previous.periodEnd,
      currentFiscalYear: current.fiscalYear, previousFiscalYear: previous.fiscalYear, currentAccession: current.accession,
      previousAccession: previous.accession, currentAcceptedAt: current.filing.acceptedAt, previousAcceptedAt: previous.filing.acceptedAt,
      knownFrom, currentPeriodStart: current.periodStart, previousPeriodStart: previous.periodStart,
      currentForm: current.filing.form, previousForm: previous.filing.form,
      currentDocumentPeriodEnd: current.periodEnd, previousDocumentPeriodEnd: previous.periodEnd,
      currentFiscalPeriodId: `${securityId}:FY:${current.fiscalYear}:${current.periodEnd}`,
      previousFiscalPeriodId: `${securityId}:FY:${previous.fiscalYear}:${previous.periodEnd}`,
      source: {current: {...current.source, locator: 'dei:DocumentFiscalYearFocus|dei:DocumentPeriodEndDate|annual-context'},
        previous: {...previous.source, locator: 'dei:DocumentFiscalYearFocus|dei:DocumentPeriodEndDate|annual-context'}},
      certification: {originalAnnual: true, fiscalLineageVerified: true, fiscalYearMethod: 'DEI_CURRENT_REPORT_FOCUS_ONLY',
        currentDurationDays: duration(current.periodStart, current.periodEnd), previousDurationDays: duration(previous.periodStart, previous.periodEnd),
        acceptanceEvidence: {current: current.filing.acceptanceSource, previous: previous.filing.acceptanceSource},
        apiClockConflict: current.filing.apiClockConflict || previous.filing.apiClockConflict,
        confidence: current.filing.apiClockConflict || previous.filing.apiClockConflict ? 'MEDIUM' : 'HIGH'}});
  }
  for (const input of filingDocuments.filter(d => d.filingHeader)) {
    const filing = documents.find(doc => doc.accession === input.accession)?.filing, period = filing && periods.get(filing.reportDate);
    if (!filing || !period) continue;
    try {
      const source = officialArtifact(input.filingHeader, issuer, input.accession);
      const values = [...new Set([...input.filingHeader.text.matchAll(/STANDARD INDUSTRIAL CLASSIFICATION:[^\n]*\[(\d{4})\]/g)].map(m => Number(m[1])))];
      if (values.length !== 1 || values[0] === 0) continue;
      rows.push({key: 'sic', value: values[0], unit: 'CODE', frequency: 'ANNUAL', periodEnd: period.periodEnd,
        fiscalYear: period.fiscalYear, availableAt: filing.acceptedAt, firstKnownAt: filing.acceptedAt,
        origin: 'AS_REPORTED_AT_TIME', source: {...source, accession: input.accession, provider: 'SEC_EDGAR_ORIGINAL_SUBMISSION_HEADER', locator: 'STANDARD INDUSTRIAL CLASSIFICATION'},
        eligibility: eligibleAt(filing.acceptedAt, signalSessions), certification: {concept: 'sic', normalized: true,
          mapping: 'EXACT_ORIGINAL_ACCESSION_HEADER', issuerCik: issuer, knowledgeEvidence: 'EXACT_ORIGINAL_ARCHIVAL_HEADER_NEW_YORK_TO_UTC',
          acceptanceEvidence: filing.acceptanceSource, apiClockConflict: filing.apiClockConflict,
          confidence: filing.knowledgeConfidence, pitState: filing.pitState}});
    } catch {rejected.push({reason: 'ORIGINAL_SIC_HEADER_NOT_CERTIFIED'});}
  }
  const grouped = new Map();
  for (const row of rows) {
    const id = `${row.key}|${row.periodEnd}|${row.availableAt}`;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  const fundamentals = [];
  for (const candidates of grouped.values()) {
    if (new Set(candidates.map(r => JSON.stringify(r.value))).size !== 1) {
      factConflicts.push({key: candidates[0].key, periodEnd: candidates[0].periodEnd, knownFrom: candidates[0].availableAt,
        status: 'BLOCKED_VISIBLE_FACT_CONFLICT', sources: candidates.map(r => r.source)});
      rejected.push({reason: 'CONFLICTING_EQUAL_TIME_NORMALIZED_FACTS'}); continue;
    }
    fundamentals.push(candidates[0]);
  }
  const availableKeys = new Set(fundamentals.map(r => r.key));
  return {schema: ANNUAL_FACT_SCHEMA, status: fundamentals.length ? 'PARTIAL_CERTIFIED_FACTS' : 'BLOCKED_DATA',
    securityId, issuerCik: issuer, fundamentals, fiscalPeriodLinks: [...links, ...fiscalPeriodConflicts], fiscalPeriodConflicts, factConflicts, rejected,
    missingContracts: REQUIRED_KEYS.filter(key => !availableKeys.has(key)),
    originalEngineFiscalLinkSupport: 'BLOCKED_FISCAL_PERIOD_LINK_UNSUPPORTED',
    currentLatestFallbackUsed: false, unknownPreferredAssumedZero: false, missingIssuanceAssumedZero: false};
}

export function selectAnnualFactsAtFormation(certified, {formationCutoffUTC, sessionDate} = {}) {
  const cutoff = utc(formationCutoffUTC);
  if (!cutoff || !day(sessionDate)) throw new Error('EXPLICIT_UTC_FORMATION_CUTOFF_AND_SESSION_REQUIRED');
  return certified.fundamentals.filter(row => !(certified.factConflicts ?? []).some(c => c.key === row.key && c.periodEnd === row.periodEnd &&
      utc(c.knownFrom) && Date.parse(c.knownFrom) <= Date.parse(cutoff)) &&
    utc(row.availableAt) && Date.parse(row.availableAt) <= Date.parse(cutoff) &&
    row.eligibility?.status === 'FIRST_ELIGIBLE_SIGNAL_SESSION_CERTIFIED' && row.eligibility.firstEligibleSignalSession <= sessionDate);
}

function officialJsonReceipt(artifact, issuer, kind, historicalNames = []) {
  if (!artifact || typeof artifact.text !== 'string' || !SHA.test(artifact.sha256 ?? '') || hash(artifact.text) !== artifact.sha256) throw new Error('OFFICIAL_JSON_RECEIPT_SHA256_REQUIRED');
  const url = new URL(artifact.url), name = artifact.entryName;
  const bulkPath = kind === 'companyfacts' ? '/Archives/edgar/daily-index/xbrl/companyfacts.zip' : '/Archives/edgar/daily-index/bulkdata/submissions.zip';
  const allowedNames = [`CIK${issuer}.json`, ...historicalNames];
  const apiPath = kind === 'companyfacts' ? `/api/xbrl/companyfacts/CIK${issuer}.json` : `/submissions/CIK${issuer}.json`;
  const apiAllowed = url.hostname === 'data.sec.gov' && (url.pathname === apiPath || kind === 'submissions' && historicalNames.some(n => url.pathname === `/submissions/${n}`));
  const bulkAllowed = url.hostname === 'www.sec.gov' && url.pathname === bulkPath && allowedNames.includes(name) && SHA.test(artifact.containerSha256 ?? '');
  if (url.protocol !== 'https:' || url.search || url.hash || !(apiAllowed || bulkAllowed)) throw new Error('OFFICIAL_JSON_RECEIPT_ISSUER_DATASET_MISMATCH');
  const document = JSON.parse(artifact.text);
  if (document.cik != null && cik(document.cik) !== issuer) throw new Error('OFFICIAL_JSON_RECEIPT_BODY_ISSUER_MISMATCH');
  return {document, source: {url: artifact.url, sha256: artifact.sha256, entryName: name ?? null,
    containerSha256: artifact.containerSha256 ?? null, hashScope: name ? 'BULK_ARCHIVE_ORIGINAL_ENTRY_BYTES' : 'ORIGINAL_API_RESPONSE_BYTES'}};
}

/** Conservative eligibility boundary, explicitly NOT an actual acceptance timestamp. */
export function conservativeAfterFilingDayUTC(filingDate) {
  if (!day(filingDate)) throw new Error('ORIGINAL_SEC_FILING_DATE_REQUIRED');
  const next = new Date(Date.parse(filingDate) + 86400000).toISOString().slice(0, 10);
  const format = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const candidates = ['04', '05'].map(hour => `${next}T${hour}:00:00.000Z`).filter(candidate => {
    const parts = Object.fromEntries(format.formatToParts(new Date(candidate)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}` === next && `${parts.hour}:${parts.minute}:${parts.second}` === '00:00:00';
  });
  if (candidates.length !== 1) throw new Error('NY_FILING_DAY_BOUND_NOT_ESTABLISHED');
  return candidates[0];
}

/**
 * Scalable, explicitly partial official-companyfacts channel. Only CURRENT
 * annual report-end rows of original 10-K accessions establish a first vintage.
 * No original XBRL context, exact acceptance clock or DEI fiscal-year claim is
 * inherited. Later amendments/reported value changes invalidate that key's
 * first-vintage sleeve; they are not silently substituted or backdated.
 */
export function certifyCompanyfactsAnnualPartial({companyfactsArtifact, submissionsArtifact,
  historicalSubmissionArtifacts = [], originalHeaders = [], securityId, issuerCik, signalSessions = [], derivationApprovals = []}) {
  const issuer = cik(issuerCik);
  if (!issuer || !securityId) throw new Error('SECURITY_ISSUER_BINDING_REQUIRED');
  const cfReceipt = officialJsonReceipt(companyfactsArtifact, issuer, 'companyfacts');
  const subReceipt = officialJsonReceipt(submissionsArtifact, issuer, 'submissions');
  const historicalNames = (subReceipt.document.filings?.files ?? []).map(f => f.name);
  const historical = historicalSubmissionArtifacts.map(a => officialJsonReceipt(a, issuer, 'submissions', historicalNames));
  const index = acceptanceIndex(subReceipt.document, historical.map(r => r.document), issuer);
  const concepts = new Set([...Object.values(ANNUAL_SOURCE_CONCEPTS).flat(), ...OPERAND_CONCEPTS]);
  const raw = [];
  for (const [concept, metadata] of Object.entries(cfReceipt.document.facts?.['us-gaap'] ?? {})) {
    if (!concepts.has(concept)) continue;
    for (const [unit, records] of Object.entries(metadata.units ?? {})) for (const record of records) {
      if (!ACC.test(record.accn ?? '') || !day(record.end) || !Number.isFinite(record.val) || !['USD', 'shares'].includes(unit)) continue;
      raw.push({...record, concept, value: record.val, unit: unit === 'shares' ? 'SHARES' : 'USD', start: record.start ?? null,
        source: cfReceipt.source});
    }
  }
  const fundamentals = [], factConflicts = [], rejected = [];
  for (const filing of [...index.values()].filter(f => f.form === '10-K').sort((a, b) => a.filingDate.localeCompare(b.filingDate))) {
    const current = raw.filter(r => r.accn === filing.accession && r.end === filing.reportDate && r.filed === filing.filingDate &&
      r.form === '10-K' && r.fp === 'FY');
    const starts = [...new Set(current.filter(r => r.unit === 'USD' && annual(r.start, r.end)).map(r => r.start))];
    if (starts.length !== 1) {rejected.push({reason: 'CURRENT_ORIGINAL_REPORT_ANNUAL_CONTEXT_NOT_ESTABLISHED'}); continue;}
    const period = {periodStart: starts[0], periodEnd: filing.reportDate};
    const fiscalClaims = [...new Set(current.filter(r => r.start === period.periodStart && Number.isInteger(r.fy)).map(r => r.fy))];
    const reportedFiscalYearClaim = fiscalClaims.length === 1 ? fiscalClaims[0] : null;
    const bound = conservativeAfterFilingDayUTC(filing.filingDate);
    const get = (tags, unit = 'USD', instant = false) => {
      const matches = current.filter(r => tags.includes(r.concept) && r.unit === unit && (instant ? r.start == null : r.start === period.periodStart));
      if (!matches.length) return null;
      if (new Set(matches.map(r => r.value)).size !== 1) {
        for (const key of affectedKeys(tags)) factConflicts.push({key, periodEnd: period.periodEnd, knownFrom: bound,
          status: 'BLOCKED_VISIBLE_FACT_CONFLICT', sources: [cfReceipt.source]});
        return null;
      }
      return matches[0];
    };
    const emit = (key, value, operands, definition, mapping = 'DIRECT_OFFICIAL_COMPANYFACTS_CURRENT_REPORT', approval = null, unit = 'USD') => {
      fundamentals.push({key, value, unit, frequency: 'ANNUAL', periodStart: period.periodStart, periodEnd: period.periodEnd,
        annualperiod: {start: period.periodStart, end: period.periodEnd}, fiscalYear: null, reportedFiscalYearClaim,
        availableAt: bound, firstKnownAt: null, conservativeFirstKnownUpperBound: bound, actualAcceptedAt: null,
        availabilityKind: 'CONSERVATIVE_AFTER_NY_FILING_DAY_NOT_ACTUAL_ACCEPTANCE',
        origin: 'AS_REPORTED_ORIGINAL_CURRENT_ANNUAL_PARTIAL', source: {...cfReceipt.source,
          accession: filing.accession, provider: 'SEC_EDGAR_OFFICIAL_COMPANYFACTS',
          locator: operands.map(r => `us-gaap:${r.concept}|${r.accn}|${r.start ?? 'INSTANT'}|${r.end}|${r.unit}`).join(';')},
        eligibility: {...eligibleAt(bound, signalSessions), availableAtRemainsActualAcceptance: false,
          conservativeFilingDayBound: true, requiresFormationPrefilter: true},
        certification: {concept: key, normalized: true, mapping, definition, issuerCik: issuer,
          mode: 'COMPANYFACTS_ACCESSION_BOUND_CURRENT_ANNUAL', confidence: 'MEDIUM', pitState: 'PIT_PARTIAL',
          primaryContextVerified: false, dimensionalScopeClaim: 'SEC_API_ENTITY_AGGREGATION_ONLY_NOT_PRIMARY_CONTEXT_VERIFICATION',
          sourceConcepts: operands.map(r => `us-gaap:${r.concept}`), unitEvidence: 'OFFICIAL_COMPANYFACTS_REPORTED_UNIT_NO_SCALE_GUESS',
          annualPeriodEvidence: {method: 'ORIGINAL_10K_ACCESSION_CURRENT_REPORT_END_AND_FULL_REPORTED_DURATION',
            fiscalYearMethod: 'UNKNOWN_DEI_FISCAL_YEAR_NOT_CERTIFIED', durationDays: duration(period.periodStart, period.periodEnd)},
          knowledgeEvidence: 'CONSERVATIVE_UPPER_BOUND_AFTER_SEC_FILED_DATE_IN_NEW_YORK',
          actualFilingDate: filing.filingDate, rawApiAcceptanceDateTime: filing.apiAcceptedAtRaw,
          submissionsSource: subReceipt.source, historicalSubmissionsSources: historical.map(r => r.source),
          operands, derivationApproval: approval ?? null}});
    };
    applyAnnualMappings({get, emit, period, derivationApprovals});
    // A known amendment with unknown exact replacement scope cannot certify the
    // continued use of the first vintage. Preserve pre-publication facts only.
    for (const amendment of index.values()) if (amendment.form === '10-K/A' && amendment.reportDate === period.periodEnd && amendment.filingDate >= filing.filingDate) {
      for (const key of REQUIRED_KEYS) factConflicts.push({key, periodEnd: period.periodEnd,
        knownFrom: conservativeAfterFilingDayUTC(amendment.filingDate), status: 'BLOCKED_UNCERTIFIED_LATER_AMENDMENT_SCOPE', sources: [subReceipt.source]});
    }
    // Comparative changes are recognized by exact original period, not their
    // later filing FY. Updated values require the strict primary-vintage path.
    for (const original of current) {
      if (original.start != null && original.start !== period.periodStart) continue;
      for (const later of raw.filter(r => r.concept === original.concept && r.end === original.end && r.start === original.start && r.value !== original.value)) {
        const laterFiling = index.get(later.accn);
        if (!laterFiling || laterFiling.filingDate < filing.filingDate || laterFiling.accession === filing.accession || later.filed !== laterFiling.filingDate) continue;
        for (const key of affectedKeys([original.concept])) factConflicts.push({key, periodEnd: period.periodEnd,
          knownFrom: conservativeAfterFilingDayUTC(laterFiling.filingDate), status: 'BLOCKED_UNCERTIFIED_LATER_COMPARATIVE_VALUE_CHANGE', sources: [cfReceipt.source]});
      }
    }
  }
  const grouped = new Map();
  for (const header of originalHeaders) {
    const filing = index.get(header.accession);
    if (!filing) {rejected.push({reason: 'ORIGINAL_SIC_ACCESSION_METADATA_MISSING'}); continue;}
    try {fundamentals.push(certifyOriginalSICHeader({header, filing, signalSessions}));}
    catch {rejected.push({reason: 'ORIGINAL_SIC_HEADER_NOT_CERTIFIED'});}
  }
  for (const row of fundamentals) {
    const id = `${row.key}|${row.periodEnd}|${row.availableAt}`;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  const normalized = [];
  for (const candidates of grouped.values()) {
    if (new Set(candidates.map(r => JSON.stringify(r.value))).size !== 1) {
      factConflicts.push({key: candidates[0].key, periodEnd: candidates[0].periodEnd, knownFrom: candidates[0].availableAt,
        status: 'BLOCKED_VISIBLE_FACT_CONFLICT', sources: candidates.map(r => r.source)});
    } else normalized.push(candidates[0]);
  }
  const keys = new Set(normalized.map(r => r.key));
  return {schema: ANNUAL_FACT_SCHEMA, mode: 'COMPANYFACTS_ACCESSION_BOUND_CURRENT_ANNUAL',
    status: normalized.length ? 'PARTIAL_CERTIFIED_FACTS' : 'BLOCKED_DATA', securityId, issuerCik: issuer,
    fundamentals: normalized, fiscalPeriodLinks: [], fiscalPeriodConflicts: [], factConflicts, rejected,
    missingContracts: REQUIRED_KEYS.filter(key => !keys.has(key)),
    knowledgeConfidence: 'MEDIUM', pitState: 'PIT_PARTIAL', actualAcceptanceCertified: false,
    exactDEIFiscalYearCertified: false, currentLatestFallbackUsed: false, missingIssuanceAssumedZero: false,
    originalEngineFiscalLinkSupport: 'BLOCKED_FISCAL_PERIOD_LINK_UNSUPPORTED', requiresFormationPrefilter: true};
}

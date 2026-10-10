"""Stored, source-grounded company profiles. No model, translation or page-time fetch.

Only explicit issuer business sentences are eligible. Missing facts stay empty;
SEC identity/industry alone never becomes a business description.
"""
import hashlib
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit
from .model import clean, canonical_url, timestamp
from .earnings import filing_url
from .transport import SourceError, BudgetExhausted
from .q4_events import public_link

VERSION = 'company-profile-1.0.0'
PARSER_VERSION = 'company-profile-parser-1.0.20'
WEB_DAYS = 90
SEC_STALE_DAYS = 550
MAX_DOCUMENT = 64 * 1024 * 1024
ACTIVITY = re.compile(r'\b(?:designs?|develops?|manufactures?|markets?|sells?|provides?|operates?|offers?|distributes?|produces?|supplies?|commercializes?|researches?|licenses?|delivers?|builds?|serves?|specializes?|engages?|focuses?)\b', re.I)
BUSINESS = re.compile(r'\b(?:software|platforms?|products?|services?|solutions?|bank|banking|insurance|insurer|manufacturer|provider|supplier|developer|retailer|retail|holding company|biotechnology|biopharmaceutical|pharmaceutical|semiconductors?|computing|infrastructure|power management|energy|mining|real estate|transportation|technology|equipment|devices?|vehicles?|EVs?|NEVs?|food|beverages?|materials|merchandise|airline|utilities|utility|producers?|drilling|agribusiness|land management|telecommunications|communications|logistics|restaurants?|medical|furnishings|clothing|chemicals|oil|gas|gold|silver|copper|steel|REIT|education|training|publishing|media|entertainment|gaming|hospitality|hotels?|travel|apparel|textiles|fabrics|construction|engineering|aerospace|defen[sc]e|financial|investments?|asset management|mortgages?|lending|loans?|blank check company|acquisition company|furniture|personal care|cosmetics|candles|packaging|paper|forestry|wood|lumber|timber|electricity|renewable|water|waste|shipping|freight|oilfield|distribution|healthcare|payroll|concrete|wire|metals?|breweries|brewing|cidery|multimedia|television|pipelines?|broadband|internet access|containerboard|cat litters?|resin|hospitals?|health care|kiosks?|pizza|burgers?|salads?|wealth management)\b', re.I)
EXCLUDED = re.compile(r'\b(?:headcount|forward.looking|may|might|could|will|expects?|intends?|plans?|believes?|aims?|aspires?|best|revolutionary|unrivaled|unparalleled|world.class|award.winning|visionary|transforming the future|market leader)\b', re.I)
PROMOTION = re.compile(r'\b(?:(?:world[’\']?s?[ -]|nation[’\']s[ -]|global[ -]|industry[ -]|market[ -])?(?:leading|largest|premier|top.ranked)|growth.oriented|high.return|iconic|innovative|cutting.edge|state.of.the.art|intelligent|novel|differentiated|fashionable|comprehensive|most advanced|effectively)\s*,?\s*', re.I)


def later(now, days):
    return (datetime.fromisoformat(now.replace('Z', '+00:00')) + timedelta(days=days)).isoformat(timespec='seconds').replace('+00:00', 'Z')


def display_name(value):
    # Existing master legal names can carry legacy jurisdiction annotations.
    # This only cleans display text; exact CIK/master identity never changes.
    value = re.sub(r'[/\\][A-Z]{2,3}[/\\]?$', '', value, flags=re.I)
    return re.sub(r'\s+(?:class\s+[a-z]|ordinary shares|common stock)\b.*', '', value, flags=re.I).strip()


class TextBlocks(HTMLParser):
    """Visible paragraphs/headings; navigation, scripts and inline XBRL hidden facts excluded."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.parts, self.stack = [], [], []
        self.language = None
        self.registrants = set()
        self.registrant_parts = None

    def flush(self):
        value = clean(''.join(self.parts), 20000)
        if value:
            self.blocks.append(value)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('name', '').lower() == 'dei:entityregistrantname':
            self.registrant_parts = []
        if tag == 'html':
            self.language = (attrs.get('lang') or '').lower().split('-')[0]
        hidden = bool(self.stack and self.stack[-1][1]) or tag in ('script', 'style', 'nav', 'footer', 'header', 'ix:hidden') or 'hidden' in attrs or re.search(r'display\s*:\s*none', attrs.get('style', ''), re.I) is not None
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'td', 'br'):
            self.flush()
        if tag not in ('meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'wbr'):
            self.stack.append((tag, hidden))

    def handle_endtag(self, tag):
        if tag == 'ix:nonnumeric' and self.registrant_parts is not None:
            name = ' '.join(re.sub(r'[^a-z0-9 ]', ' ', ''.join(self.registrant_parts).lower()).split())
            if name:
                self.registrants.add(name)
            self.registrant_parts = None
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'td'):
            self.flush()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.registrant_parts is not None:
            self.registrant_parts.append(data)
        if not self.stack or not self.stack[-1][1]:
            self.parts.append(data)


def blocks(body):
    if not isinstance(body, bytes) or len(body) > MAX_DOCUMENT:
        raise SourceError('PROFILE_DOCUMENT_TOO_LARGE_OR_INVALID')
    doc = TextBlocks()
    doc.feed(body.decode('utf-8', 'replace'))
    doc.flush()
    return doc


def annual_filing(company, submissions, now):
    """An exact issuer CIK and explicit form/date/document; no inferred filing route."""
    cik = company.get('cik')
    if not cik or str((submissions or {}).get('cik', '')).zfill(10) != cik:
        return None
    recent = submissions.get('filings', {}).get('recent', {})
    found = []
    for i, acc in enumerate(recent.get('accessionNumber', [])):
        def cell(key):
            rows = recent.get(key, [])
            return rows[i] if i < len(rows) else None
        form, filed, primary = cell('form'), cell('filingDate'), cell('primaryDocument')
        if form not in ('10-K', '20-F', '40-F') or not isinstance(filed, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', filed) or filed > now[:10] or not primary:
            continue
        try:
            datetime.strptime(filed, '%Y-%m-%d')
        except ValueError:
            continue
        url = filing_url(cik, acc, primary)
        if url and url.endswith('/' + primary):
            found.append({'type': 'SEC', 'url': url, 'filingId': acc, 'form': form, 'filedAt': filed})
    return max(found, key=lambda f: (f['filedAt'], f['filingId'])) if found else None


def business_blocks(doc, form):
    patterns = [r'^(?:part\s+i\s*)?item\s*1[.| :–-]*business\b', r'^items?\s*1\.?\s*(?:and|&)\s*2[.| :–-]*business(?: and properties)?\b'] if form == '10-K' else [r'^item\s*4[.| :–-]*information on the company\b', r'^(?:[bB][. :–-]*)?business overview\b']
    starts = [i for i, text in enumerate(doc.blocks) if any(re.search(p, text, re.I) for p in patterns)]
    for i in range(len(doc.blocks) - 1):
        if re.fullmatch(r'item\s*1[. :–-]*', doc.blocks[i], re.I) and re.fullmatch(r'business[. :–-]*', doc.blocks[i + 1], re.I) and form == '10-K':
            starts.append(i)
    # The table of contents has no business sentences. Prefer a real section,
    # never borrow Item 1A risks, another issuer's exhibit, or the entire filing.
    for start in sorted(set(starts)):
        selected = []
        for text in doc.blocks[start:start + 100]:
            if selected and re.match(r'^(?:item\s*(?:1[abc]|2|3|4[ab]|5)\b|risk factors\b|properties\b|organizational structure\b|human capital\b|human resources\b|employees\b|our people\b|corporate governance\b)', text, re.I):
                break
            selected.append(text)
            if sum(map(len, selected)) >= 12000:
                break
        if any(BUSINESS.search(t) and (ACTIVITY.search(t) or re.search(r'\b(?:is|are)\s+(?:an?|the)\b', t, re.I)) for t in selected):
            return selected
    return []


def web_business_blocks(doc):
    # Corporate timelines often narrate historical events in present tense.
    # Those clauses cannot describe the issuer's current operating business.
    selected = []
    historical = False
    for text in doc.blocks:
        if re.fullmatch(r'(?:(?:company|our|corporate) )?history|timeline|corporate milestones|(?:18|19|20)\d{2}', text, re.I):
            historical = True
            continue
        if historical and re.fullmatch(r'about us|company overview|our business(?:es)?|what we do|products and services|business segments|current operations', text, re.I):
            historical = False
        if not historical:
            selected.append(text)
    return selected


def sentences(text):
    # A country abbreviation can also end a sentence. Explicit new
    # issuer/management voice is a safe boundary; 'U.S. Department' is not.
    text = re.sub(r'\bU\.([SK])\.\s+(?=(?:We|Our|Management|The [Cc]ompany)\b)', lambda m: 'U\u2024' + m[1] + '. ', text)
    # Protect legal suffixes and country abbreviations from sentence splitting.
    text = re.sub(r'\b(?:Inc|Corp|Ltd|Co|U\.S|U\.K|B\.V|S\.A|e\.g|i\.e)\.', lambda m: m[0].replace('.', '\u2024'), text)
    return [s.replace('\u2024', '.') for s in re.split(r'(?<=[.!?])\s+(?=[A-Z“\"])', text)]


def issuer_sentence(raw, company, sec=False, allow_first_person=True):
    """Require a first-person SEC business statement or exact issuer subject.

    Holding-company/subsidiary names are never interchangeable. Web evidence
    must start with the issuer; mentions in customer/partner copy do not qualify.
    """
    text = clean(raw, 2000).replace('’', "'").replace('™', '').replace('®', '')
    if sec:
        current = re.fullmatch(r'We intend to leverage our current operations, in which (we [^.!?]{40,900}), to achieve (?:that|this) objective\.', text, re.I)
        if current:
            # Only the explicitly current operating clause is factual. The
            # surrounding objective is excluded; future operations never match.
            text = current[1] + '.'
        # Keep the explicit issuer clause, dropping an introductory promotional
        # phrase. Segment wording remains attached; it cannot become a claim
        # about a different issuer or a broader product portfolio.
        text = re.sub(r'^Leveraging [^.!?]{1,200}, we (?=(?:design|develop|manufacture|provide|operate|offer)\b)', 'We ', text, flags=re.I)
        segment = re.match(r'^Through our ([^,.!?]{1,100} segment), we (.+)', text, re.I)
        if segment:
            text = 'We ' + segment[2].rstrip('.') + ' through our ' + segment[1] + '.'
        text = re.sub(r'^We are organized into ((?:two|three|four|five|six|\d+) business segments)(?: for management reporting purposes)?: (.+)', r'We operate through \1: \2', text, flags=re.I)
        text = re.sub(r'^We report our business in ((?:two|three|four|five|six|\d+) segments: .+)', r'We operate through \1', text, flags=re.I)
    text = re.sub(r',?\s+and its common stock is traded\b.*', '.', text, flags=re.I)
    text = re.sub(r'\s+recognized for\b.*', '.', text, flags=re.I)
    text = re.sub(r'focused on driving returns to its stockholders through', 'focused on', text, flags=re.I)
    text = re.sub(r'\s*[–—-]\s*enabling tomorrow[’\']s technologies\b.*', '.', text, flags=re.I)
    text = re.sub(r'\s+with the objective of\b.*', '.', text, flags=re.I)
    text = re.sub(r'\bindustry-leading\s+', '', text, flags=re.I)
    text = re.sub(r'\b(?:company|platform)\b\s+(?:whose mission|that allows any business to simplify)\b.*', lambda m: m[0].split()[0] + '.', text, flags=re.I)
    if re.search(r'powerful features|enhanced value|cost-maximizing|simplifies IT|Fortune \d+|over \d+ years of innovation', text, re.I):
        return None
    if not 40 <= len(text) <= 1000 or not re.search(r'[.!?]$', text) or EXCLUDED.search(text):
        return None
    if re.search(r'\b(?:team|workforce) of (?:over |more than |approximately )?[\d,.]+ (?:members|people|staff)\b', text, re.I):
        return None
    if re.search(r'\b(?:employee count|number of employees|(?:[\d,.]+|hundreds?|thousands?|million|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+[a-z-]+){0,3}\s+employees?)\b', text, re.I):
        return None
    text = re.sub(r'(\bcompany\b)\s+(?:committed|dedicated|founded|reshaping)\b.*', r'\1.', text, flags=re.I)
    if re.search(r'revolutioniz|reshaping|tremendous|competitive|business objective|at the forefront|products are used in|without many of the risks|easy to navigate|quick to close|hassle.free|business strategy|to become|indispensable|consideration and drive|sales representatives who are its employees|exceptional customer support|elegant user interface|intuitive|powerful enough|designed to make its members|purpose.driven|company culture|long.term happiness|most recognized|preeminent|synergistic|secular growth|compelling demographics|benefiting|strengthening|momentum|market leaders|utmost urgency|scalable|scalability|seasonal fluctuations|must.not.fail|inspires? confidence|off.mall|best.in.class|differentiating value|low.cost,? high.quality|\b(?:are|is) (?:also expanding|focused|committed)\b', text, re.I):
        return None
    name = display_name(company['names'][0])
    names = []
    for n in company['names']:
        n = re.sub(r'\s+(?:class\s+[a-z]|ordinary shares|common stock)\b.*', '', n, flags=re.I)
        names.append(n.strip())
        names.append(re.sub(r'[, ]+\b(?:incorporated|inc\.?|corporation|corp\.?|limited|ltd\.?|plc)\s*$', '', n, flags=re.I).strip())
    subject = None
    for n in sorted(set(names), key=len, reverse=True):
        match = re.match(r'^' + re.escape(n) + r'(?!\w)(?:[, ]+(?:incorporated|inc\.?|corporation|corp\.?|limited|ltd\.?|plc)(?!\w))?', text, re.I) if n else None
        if match:
            subject = match[0]
            if re.search(r'\b(?:Inc|Corp|Ltd|Co)$', subject, re.I) and text[len(subject):].startswith('.'):
                subject += '.'
            break
    first_person = sec and allow_first_person and bool(re.match(r'^(?:we|the company|the corporation|the registrant)\s', text, re.I))
    possessive = sec and allow_first_person and re.match(r'^our\s+(?:principal |main |core )?(?:primary focus|products|product (?:portfolio|offering|line)s?|brands?|merchandise|platforms?|services|business|software platforms|technology stack|(?:comprehensive )?set of software|(?:auto )?insurance products?|field programmable gate array)\b', text, re.I)
    if possessive:
        text = re.sub(r'^our\b', lambda m: name + "'s", text, flags=re.I)
        subject = name + "'s"
    if first_person:
        text = re.sub(r'^(?:we|the company|the corporation|the registrant)\b', lambda m: name, text, flags=re.I)
        text = re.sub(r'^' + re.escape(name) + r'\s+(?:also|currently|primarily|generally)\s+', lambda m: name + ' ', text, flags=re.I)
        expertise = re.match(r'^' + re.escape(name) + r' are experts in the ([a-z, ]+) of (.+)', text, re.I)
        if expertise:
            activity_map = {'design': 'designs', 'development': 'develops', 'production': 'produces', 'servicing': 'services', 'manufacturing': 'manufactures', 'distribution': 'distributes', 'marketing': 'markets'}
            nouns = [n.strip() for n in re.split(r',|\band\b', expertise[1]) if n.strip()]
            if len(nouns) >= 2 and all(n in activity_map for n in nouns):
                verbs = [activity_map[n] for n in nouns]
                text = name + ' ' + ', '.join(verbs[:-1]) + ' and ' + verbs[-1] + ' ' + expertise[2]
        # Only the initial coordinated verb chain is conjugated. "offer service
        # and support products" must never become "offer service and supports".
        verbs = [('are', 'is'), ('have', 'has'), ('design', 'designs'), ('develop', 'develops'), ('manufacture', 'manufactures'), ('market', 'markets'), ('sell', 'sells'), ('provide', 'provides'), ('operate', 'operates'), ('offer', 'offers'), ('produce', 'produces'), ('distribute', 'distributes'), ('serve', 'serves'), ('focus', 'focuses'), ('specialize', 'specializes'), ('build', 'builds'), ('make', 'makes'), ('supply', 'supplies'), ('deliver', 'delivers'), ('support', 'supports'), ('engineer', 'engineers'), ('commercialize', 'commercializes'), ('license', 'licenses'), ('research', 'researches')]
        verb_pattern = '(?:' + '|'.join(v[0] for v in verbs) + ')'
        chain = re.match(r'^' + re.escape(name) + r'\s+(' + verb_pattern + r'(?:(?:,\s*(?:and\s+)?|\s+and\s+)' + verb_pattern + r')*)\b', text, re.I)
        if chain:
            mapping = dict(verbs)
            replacement = re.sub(verb_pattern + r'\b', lambda m: mapping[m[0].lower()], chain[1], flags=re.I)
            text = text[:chain.start(1)] + replacement + text[chain.end(1):]
        main_clause = re.split(r'\b(?:that|which)\b', text, maxsplit=1)[0]
        rest = text[len(main_clause):]
        clear_verbs = {k: v for k, v in verbs if k in ('manufacture', 'distribute', 'operate', 'produce', 'commercialize', 'serve', 'sell', 'provide', 'offer', 'deliver', 'develop')}
        if not re.search(r'\bto (?:acquire|design|develop|manufacture|provide|operate|offer|produce|sell|serve|build)\b', main_clause, re.I):
            main_clause = re.sub(r'\band (' + '|'.join(clear_verbs) + r')\b', lambda m: 'and ' + clear_verbs[m[1].lower()], main_clause, flags=re.I)
        main_clause = re.sub(r'\band are\b', 'and is', main_clause, flags=re.I)
        text = main_clause + rest
        text = re.sub(r',?\s+and continue to grow\b.*', '.', text, flags=re.I)
        subject = name
    if not subject:
        return None
    tail = text[len(subject):]
    # Reject a legal extension ("Root Inc. Japan LLC") and financial/history
    # sentences. Activity must be the issuer's predicate, not a customer's.
    delegation = None
    if sec:
        tail = re.sub(r'^\s*,?\s*(?:and|together with) its (?:consolidated )?subsidiaries\b', '', tail, flags=re.I)
        for _ in range(3):
            # Nested legal definitions are common in business introductions.
            # Bound the balanced prefix and never consume the predicate.
            prefix = re.match(r'^\s*,?\s*\(', tail)
            if not prefix:
                break
            depth = 1; end = None
            for i in range(prefix.end(), min(len(tail), prefix.end() + 500)):
                depth += (tail[i] == '(') - (tail[i] == ')')
                if depth == 0:
                    end = i + 1
                    break
            if end is None:
                break
            tail = tail[end:]
        delegated = re.match(r'^\s*,?\s*through its (Operating Subsidiaries)\b', tail, re.I)
        if delegated:
            delegation = 'through its ' + delegated[1]
            tail = tail[delegated.end():]
            prefix = re.match(r'^\s*\([^)]{0,300}\)', tail)
            if prefix:
                tail = tail[prefix.end():]
        # Corporate legal appositives can contain a parenthetical definition.
        tail = re.sub(r'^\s*,\s*a\s+(?:\w+\s+){0,4}corporation(?: incorporated in \d{4})?\s*(?:\([^)]{0,200}\))?\s*,?', '', tail, flags=re.I)
        tail = re.sub(r'^\s*,\s*a\s+(?:\w+\s+){0,4}(?:corporation|company)\s*,?', '', tail, flags=re.I)
    else:
        tail = re.sub(r'^\s*\([^)]{0,120}\)\s*', ' ', tail)
    if sec and allow_first_person and subject and not first_person and re.match(r'^\s*(?:design|develop|manufacture|market|sell|provide|operate|offer|produce|distribute)\b', tail, re.I):
        # An exact legal issuer with consolidated subsidiaries takes a plural
        # predicate in filings; use the same tested issuer-voice conjugation.
        tail = re.sub(r'\bwe monetize\b', 'it monetizes', tail, flags=re.I)
        return issuer_sentence('We ' + tail.strip(' ,'), company, sec=True, allow_first_person=True)
    if not possessive and not re.match(r'^\s*,?\s*(?:(?:is|are|has)\b|(?:designs|develops|manufactures|markets|sells|provides|operates|offers|produces|distributes|supplies|commercializes|researches|licenses|delivers|builds|makes|engineers|serves|specializes|engages|focuses)\b)', tail, re.I):
        return None
    if sec and not possessive and subject != name:
        subject = name
    text = subject + ' ' + tail.strip(' ,')
    if delegation:
        text = text.rstrip('.') + ' ' + delegation + '.'
    # Remove superiority/rank claims while retaining the explicitly stated
    # business role; this is a grammatical normalization, not a new fact.
    roles = {'companies': 'company', 'providers': 'provider', 'suppliers': 'supplier', 'manufacturers': 'manufacturer', 'producers': 'producer', 'retailers': 'retailer', 'operators': 'operator', 'distributors': 'distributor'}
    predicate = text[len(subject):]
    predicate = re.sub(r'^ is the leading ([a-z -]{0,60})(provider|supplier|manufacturer|producer|retailer|operator|distributor)\b', r' is a \1\2', predicate, flags=re.I)
    predicate = re.sub(r'^ is one of (?:the )?(?:(?:world\'s|global|industry) )?(?:leading|largest) ([a-z -]{0,60})(' + '|'.join(roles) + r')\b', lambda m: ' is a ' + m[1] + roles[m[2].lower()], predicate, flags=re.I)
    predicate = re.sub(r'^ is the (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) largest ([a-z -]{0,60})(company|provider|supplier|manufacturer|producer|retailer|operator|distributor|bank)\b', r' is a \1\2', predicate, flags=re.I)
    text = subject + predicate
    text = re.sub(r'\bsecure,\s*trusted,\s*and\s*innovative\s+', '', text, flags=re.I)
    text = subject + PROMOTION.sub('', text[len(subject):])
    text = subject + re.sub(r'\b(?:precise and reliable |trusted and |high.quality |robust |highly engineered |patient.centric |unique |advanced )', '', text[len(subject):], flags=re.I)
    text = re.sub(r'\b(broad|extensive|diverse|full|complete) and (portfolio|range|set|suite|solutions|services|products)\b', r'\1 \2', text, flags=re.I)
    text = subject + re.sub(r'\b(?:disruptive|technology-forward|essential|premium)\s+', '', text[len(subject):], flags=re.I)
    text = re.sub(r'\s+in a \$[\d,.]+\s+(?:billion|million) Total Addressable Market.*', '.', text, flags=re.I)
    text = re.sub(r'\s+with a commitment to\b.*', '.', text, flags=re.I)
    text = re.sub(r'\s+using a powerful combination of science and engineering[.!]?$', '.', text, flags=re.I)
    text = re.sub(r'\b(?:an?|the) innovator,\s*', 'a ', text, flags=re.I)
    text = re.sub(r'\ban (power|software|technology)\b', r'a \1', text, flags=re.I)
    text = re.sub(r'\ba (acquirer|agriculture|organization|energy|environmental|environmentally|investment|industrial|international|integrated|insurance)\b', r'an \1', text, flags=re.I)
    text = re.sub(r',\s*as well as\b.*', '.', text, flags=re.I)
    # Keep a factual company type, dropping an attached mission, founding story
    # or unsupported positioning clause. Do not manufacture an industry type.
    text = re.sub(r'(\b(?:company|provider|supplier|manufacturer|bank|retailer|platform)\b)\s+(?:committed|dedicated|founded)\b.*', r'\1.', text, flags=re.I)
    predicate = text[len(subject):].strip()
    # Legal formation alone does not explain the issuer's business.
    if re.match(r'(?:is|are) an exempted company incorporated\b', predicate, re.I) and re.search(r' as a holding company\.?$', predicate, re.I):
        return None
    if re.fullmatch(r'(?:is|are) (?:an? |the )?(?:exempted )?(?:holding company|REIT|real estate investment trust)(?: organized| incorporated| with limited liability| under| in|\.).*', predicate, re.I):
        return None
    nominal = re.match(r'^(?:is|are)\s+(?:now\s+)?(?:an?\s+|the\s+)(?:[\w,-]+\s+){0,12}(?:company|organization|provider|supplier|manufacturer|marketer|developer|bank|insurer|retailer|holding company|platform|producer|operator|distributor|airline|REIT|real estate investment trust|limited partnership)\b', predicate, re.I)
    active = re.match(r'^(?:designs|develops|manufactures|markets|sells|provides|operates|offers|produces|distributes|supplies|commercializes|researches|licenses|delivers|builds|makes|engineers|serves|specializes|engages|focuses)\b|^has (?:built|developed|manufactured)\b', predicate, re.I)
    if re.match(r'^builds (?:upon|on|within)\b', predicate, re.I):
        active = None
    # A legal name containing 'Energy' or 'Financial' does not turn
    # corporate administration or acreage statistics into a business.
    if not BUSINESS.search(text[len(subject):]) or not (possessive or active or nominal):
        return None
    if re.match(re.escape(subject) + r' operates ', text):
        # Region headings do not travel with isolated sentences. Preserve the
        # explicit facility types without turning regional counts into totals.
        text = re.sub(r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten|[\d,.]+)\s+(?=(?:primary |craft )?(?:breweries|container operations|cidery|manufacturing facilities|facilities|stores|restaurants|hotels|plants|offices)\b)', '', text, flags=re.I)
    # Unresolved pronouns can refer to segments/third parties. Abstain rather
    # than guess their referent or rewrite subsidiary facts into parent facts.
    if sec:
        text = re.sub(r'\bour\b', 'its', text, flags=re.I)
    text = re.sub(r'\band have\b', 'and has', text, flags=re.I) if first_person else text
    text = re.sub(r'\bempowers\b', 'helps', text, flags=re.I)
    if re.search(r'\b(?:we|our|us)\b', text, re.I):
        return None
    if re.search(r'\b(?:this software|these products|these solutions|provides them|no single product contributed|individual part numbers|direct sales force|field sales employees|focuses its investments|products are sold|sells (?:product|the majority of its products) (?:primarily|through))\b', text, re.I):
        return None
    return clean(text, 1000) if len(text) <= 700 else None


def extract(company, body, source, now, official_website=None):
    if not timestamp(now) or not company.get('names'):
        raise ValueError('INVALID_PROFILE_IDENTITY_OR_TIME')
    url = canonical_url(source.get('url'))
    if not url or not public_link(url) or source.get('companyId', company['companyId']) != company['companyId']:
        raise SourceError('PROFILE_SOURCE_IDENTITY_MISMATCH')
    sec = source.get('type') == 'SEC'
    if sec:
        expected = filing_url(company.get('cik') or '', source.get('filingId') or '', urlsplit(url).path.rsplit('/', 1)[-1])
        if url != expected or source.get('form') not in ('10-K', '20-F', '40-F'):
            raise SourceError('PROFILE_SEC_IDENTITY_MISMATCH')
    elif source.get('type') != 'FIRST_PARTY_WEB' or source.get('ownershipVerified') is not True:
        raise SourceError('PROFILE_OWNER_NOT_VERIFIED')
    doc = blocks(body)
    if doc.language and doc.language != 'en':
        return {'state': 'UNAVAILABLE', 'reason': 'UNSUPPORTED_SOURCE_LANGUAGE'}
    selected_blocks = business_blocks(doc, source['form']) if sec else web_business_blocks(doc)
    if sec:
        # A filing may explicitly define a short issuer name (e.g. BD).
        # Accept only the immediate parenthetical after an exact legal issuer
        # subject, never brands, subsidiaries or companies named in an acquisition.
        aliases = []
        for text in selected_blocks:
            normalized = text.replace('’', "'").replace('™', '').replace('®', '')
            for name in company['names']:
                match = re.match(re.escape(name) + r'(?!\w)(?: and its (?:consolidated )?subsidiaries)?\s*\(([^)]{1,300})\)', normalized, re.I)
                if not match:
                    continue
                for alias in re.findall(r'[“"\']([^“”"\']{1,60})[”"\']', match[1]):
                    if alias.lower() not in ('we', 'us', 'our', 'the company', 'company', 'parent') and not re.search(r'\bsubsidiar|together with|incorporated\b', alias, re.I):
                        aliases.append(alias)
        if aliases:
            company = {**company, 'names': company['names'] + sorted(set(aliases))}
    eligible = []
    for text in selected_blocks:
        for raw in sentences(text):
            # Combined annual reports can change the meaning of 'we' by
            # subsidiary section. Exact requested-issuer subjects remain safe;
            # a shared CIK archive route alone cannot resolve that voice.
            normalized = issuer_sentence(raw, company, sec=sec, allow_first_person=len(doc.registrants) <= 1)
            if normalized and normalized not in [s[1] for s in eligible]:
                # Repeated platform lists with the same issuer predicate add
                # no consumer value; keep the shorter complete statement.
                prefix = re.findall(r'\w+', normalized.casefold())[:7]
                duplicate = next((i for i, (_, prior) in enumerate(eligible) if re.findall(r'\w+', prior.casefold())[:7] == prefix), None)
                if duplicate is not None:
                    if len(normalized) < len(eligible[duplicate][1]):
                        eligible[duplicate] = (raw, normalized)
                else:
                    eligible.append((raw, normalized))
            if len(eligible) == 8:
                break
        if len(eligible) == 8:
            break
    if not eligible:
        return {'state': 'UNAVAILABLE', 'reason': 'NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION'}
    # Put what the issuer does before who it serves. A customers-only sentence
    # cannot carry an otherwise missing business description.
    def customer_only(item):
        return bool(re.search(r'\bserves\b', item[1])) and not re.search(r'\b(?:providing|manufactures|develops|offers|products|services|bank|insurance)\b', item[1], re.I)
    def priority(item):
        text = item[1]
        if customer_only(item):
            return 3
        predicate = text[len(display_name(company['names'][0])):].strip()
        if re.match(r'^(?:is (?:a|an|the)|designs|develops|manufactures|produces|operates through)\b', predicate, re.I):
            return 0
        return 1
    eligible.sort(key=priority)
    if all(customer_only(item) for item in eligible):
        return {'state': 'UNAVAILABLE', 'reason': 'NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION'}
    eligible = eligible[:3]
    description = ' '.join(s[1] for s in eligible)
    # Keep complete sentences within a consumer bound, never truncate a fact.
    while len(description) > 800 and len(eligible) > 1:
        eligible.pop()
        description = ' '.join(s[1] for s in eligible)
    if len(description) < 40:
        return {'state': 'UNAVAILABLE', 'reason': 'NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION'}
    provenance = {k: source[k] for k in ('type', 'filingId', 'form', 'filedAt') if k in source}
    provenance.update(companyId=company['companyId'], url=url, contentHash=hashlib.sha256(body).hexdigest(), verifiedAt=now,
                      evidence=[s[0] for s in eligible], method='EXPLICIT_ISSUER_BUSINESS_SENTENCES')
    def facts(pattern):
        values = []
        for _, text in eligible:
            for m in re.finditer(pattern, text, re.I):
                value = m[1].strip(' ,.;')
                if 3 <= len(value) <= 240 and value not in values:
                    values.append(value)
        return values[:5]
    products = facts(r'\b(?:products|platforms|services)(?:\s+(?:include|such as)|:)\s+([^.;]+)')
    markets = facts(r'\bserves\s+([^.;]+)')
    return {'schema': VERSION, 'parserVersion': PARSER_VERSION, 'state': 'AVAILABLE', 'companyId': company['companyId'], 'companyName': display_name(company['names'][0]),
            'description': description, 'language': 'en', 'primaryBusinessActivity': eligible[0][1],
            'businessActivities': [s[1] for s in eligible], 'productsServices': products, 'customerMarkets': markets, 'majorSegments': [],
            'officialWebsite': canonical_url(official_website), 'sources': [provenance], 'confidence': 'HIGH' if sec else 'MEDIUM',
            'lastVerifiedAt': now, 'nextReviewAt': later(now, WEB_DAYS) if not sec else None, 'refreshPolicy': 'NEW_ANNUAL_FILING' if sec else 'QUARTERLY'}


def public_profile(value, cid, now):
    """Prepared factual fields only. Private excerpts, failures and run cursors stay private."""
    if not isinstance(value, dict) or value.get('state') != 'AVAILABLE' or value.get('companyId') != cid or value.get('schema') != VERSION:
        return None
    if not isinstance(value.get('description'), str) or not 40 <= len(value['description']) <= 1200 or value.get('confidence') not in ('HIGH', 'MEDIUM') or not timestamp(value.get('lastVerifiedAt')) or value['lastVerifiedAt'] > now:
        return None
    sources = value.get('sources', [])
    if not isinstance(sources, list) or not 1 <= len(sources) <= 4 or any(not isinstance(s, dict) or s.get('companyId') != cid or s.get('type') not in ('SEC', 'FIRST_PARTY_WEB') or not public_link(s.get('url')) or not re.fullmatch(r'[a-f0-9]{64}', str(s.get('contentHash', ''))) for s in sources):
        return None
    for source in sources:
        if source['type'] == 'SEC':
            cik = cid.removeprefix('iss_cik_')
            if not re.fullmatch(r'\d{10}', cik) or source.get('form') not in ('10-K', '20-F', '40-F') or not source['url'].startswith('https://www.sec.gov/Archives/edgar/data/' + str(int(cik)) + '/'):
                return None
    for field in ('businessActivities', 'productsServices', 'customerMarkets', 'majorSegments'):
        if not isinstance(value.get(field), list) or len(value[field]) > 5 or any(not isinstance(s, str) or len(s) > 700 for s in value[field]):
            return None
    fields = ('schema', 'parserVersion', 'state', 'companyId', 'companyName', 'description', 'language', 'editorialStatus', 'primaryBusinessActivity', 'businessActivities', 'productsServices', 'customerMarkets', 'majorSegments', 'officialWebsite', 'confidence', 'lastVerifiedAt', 'refreshPolicy')
    public = {k: value[k] for k in fields if k in value}
    public['sources'] = [{k: s[k] for k in ('companyId', 'type', 'url', 'filingId', 'form', 'filedAt', 'verifiedAt', 'contentHash') if k in s} for s in sources]
    stale_days = SEC_STALE_DAYS if all(s['type'] == 'SEC' for s in sources) else 180
    public['stale'] = bool(value.get('stale') or value.get('supersededAnnualFiling')) or value['lastVerifiedAt'] < later(now, -stale_days) or any(s.get('type') == 'SEC' and s.get('filedAt', now[:10]) < later(now, -SEC_STALE_DAYS)[:10] for s in sources)
    return public

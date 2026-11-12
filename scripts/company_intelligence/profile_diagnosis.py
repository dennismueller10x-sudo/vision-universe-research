"""Nur lesende Ursachenklassen fuer NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION (Strang AF, 12.11.2026).

Aendert weder den Parser (profiles.py) noch den Katalog: dieselben Bausteine (blocks, business_blocks, sentences,
issuer_sentence) werden nur befragt, warum ein 10-K keine Beschreibung ergibt. Das Ergebnis steht im Bericht des
Katalog-Laufs (Artefakt), je Emittent eine Klasse und zwei kurze Satzanfaenge der oeffentlichen Filing zur Pruefung.
"""
import re

from company_intelligence.profiles import blocks, business_blocks, sentences, issuer_sentence

ITEM1 = re.compile(r'^(?:part\s+i\s*)?items?\s*1\s*(?:[.:|—–-]|and|&|\s)*(?:and\s*2[.:| –-]*)?business', re.I)
ITEM1_SPLIT = re.compile(r'^item\s*1[. :–-]*$', re.I)
CROSS_REF = re.compile(r'incorporated (?:herein )?by reference|see (?:the )?(?:information|discussion|section|pages?|“|")|refer to|appears (?:under|in)|included in (?:the )?(?:annual report|exhibit)|exhibit\s*13|index to form 10-k|cross[- ]reference', re.I)
HOLDING = re.compile(r'\bholding company\b|\bthrough its (?:operating )?subsidiar', re.I)
SEGMENT = re.compile(r'\b(?:segments?|reportable|divisions?)\b', re.I)
SNIPPET = 200


def _snip(text):
    return ' '.join(str(text).split())[:SNIPPET]


def diagnose(company, body, source):
    """Eine Klasse je 10-K: ITEM1_NOT_FOUND, ITEM1_CROSS_REFERENCE, ITEM1_NO_BUSINESS_SENTENCES, NO_ISSUER_SUBJECT_SENTENCE,
    FIRST_PERSON_BLOCKED_COMBINED_REPORT, HOLDING_OR_SEGMENT_ONLY, CUSTOMER_ONLY_OR_TOO_SHORT, DESCRIBABLE (Parser findet etwas)."""
    form = source.get('form')
    doc = blocks(body)
    heads = [i for i, t in enumerate(doc.blocks) if ITEM1.search(t)]
    heads += [i for i in range(len(doc.blocks) - 1) if ITEM1_SPLIT.fullmatch(doc.blocks[i]) and re.fullmatch(r'business[. :–-]*', doc.blocks[i + 1], re.I)]
    out = {'form': form, 'blocks': len(doc.blocks), 'registrants': len(doc.registrants), 'item1Headings': len(set(heads))}
    if not heads and not any(re.match(r'^about\s', t, re.I) for t in doc.blocks):
        out['class'] = 'ITEM1_NOT_FOUND'
        out['sample'] = [_snip(t) for t in doc.blocks[:2]]
        return out
    selected = business_blocks(doc, form, relaxed=True)
    out['selectedBlocks'] = len(selected)
    if not selected:
        first = sorted(set(heads))[-1] if heads else 0
        section = ' '.join(doc.blocks[first:first + 6])
        out['class'] = 'ITEM1_CROSS_REFERENCE' if CROSS_REF.search(section) else 'ITEM1_NO_BUSINESS_SENTENCES'
        out['sample'] = [_snip(t) for t in doc.blocks[first:first + 3]]
        return out
    allow_first = len(doc.registrants) <= 1
    names = list(company.get('names') or [])
    sents = [s for t in selected for s in sentences(t)]
    out['sentences'] = len(sents)
    kept = [s for s in sents if issuer_sentence(s, company, sec=True, allow_first_person=allow_first, relaxed=True)]
    if kept:
        out['class'] = 'CUSTOMER_ONLY_OR_TOO_SHORT'
        out['sample'] = [_snip(s) for s in kept[:2]]
        return out
    subject = re.compile(r'^(?:we|our|the company|' + '|'.join(re.escape(n) for n in names) + r')\b', re.I) if names else re.compile(r'^(?:we|our|the company)\b', re.I)
    subject_sents = [s for s in sents if subject.match(s.replace('’', "'"))]
    holding = [s for s in subject_sents if HOLDING.search(s)]
    segment = [s for s in subject_sents if SEGMENT.search(s)]
    if not subject_sents:
        out['class'] = 'NO_ISSUER_SUBJECT_SENTENCE'
        out['sample'] = [_snip(s) for s in sents[:2]]
    elif not allow_first and any(re.match(r'^(?:we|our)\b', s, re.I) for s in subject_sents):
        out['class'] = 'FIRST_PARTY_VOICE_BLOCKED_COMBINED_REPORT'
        out['sample'] = [_snip(s) for s in subject_sents[:2]]
    elif holding and len(holding) + len(segment) >= len(subject_sents):
        out['class'] = 'HOLDING_OR_SEGMENT_ONLY'
        out['sample'] = [_snip(s) for s in subject_sents[:2]]
    else:
        out['class'] = 'ISSUER_SENTENCE_REJECTED_BY_RULES'
        out['sample'] = [_snip(s) for s in subject_sents[:2]]
    out['subjectSentences'] = len(subject_sents)
    return out

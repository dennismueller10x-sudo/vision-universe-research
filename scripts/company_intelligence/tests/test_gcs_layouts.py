import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.structured_sources import gcs_events

NOW='2026-10-04T12:00:00Z'
def source(**changes):
    return {'sourceId':'gcs-layout','companyId':'iss_cik_0000000001','provider':'GCS','verified':True,
            'url':'https://ir.example.com/events','allowedSites':['https://ir.example.com/'],**changes}
def card(tag, day, slug='q3', name='Q3 2026 Earnings Conference Call', date_class='nir-widget--event--date'):
    return f'<{tag} class="node--type-nir-event"><article class="node--type-nir-asset"><a href="/deck.pdf">Presentation</a></article><div class="{date_class}">{day}</div><a href="/events/event-details/{slug}">{name}</a><a href="https://events.q4inc.com/attendee/123">Listen to webcast</a></{tag}>'

class GCSLayoutTests(unittest.TestCase):
    def test_nested_div_cards_keep_assets_and_separate_explicit_dates(self):
        html=card('div','Oct 22, 2026 9:00 AM EDT')+card('div','Jul 23, 2026 9:00 AM EDT','q2','Q2 2026 Earnings Conference Call')
        rows=gcs_events(html.encode(),source(),NOW)
        self.assertEqual([r['date'] for r in rows],['2026-10-22','2026-07-23'])
        self.assertTrue(all(r['webcastUrl']=='https://events.q4inc.com/attendee/123' for r in rows))
        self.assertEqual(rows[0]['startsAt'],'2026-10-22T13:00:00Z')

    def test_gcs_table_row_requires_observed_date_field_and_issuer_route(self):
        html='<table><tr><td class="wst-event-date"><div class="nir-widget--event--date">August 6, 2026 at 9:00 AM EDT</div></td><td><a href="/events/event-details/q2">Q2 2026 Earnings Conference Call</a></td></tr></table>'
        rows=gcs_events(html.encode(),source(),NOW)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['date'],'2026-08-06')
        self.assertEqual(gcs_events(html.replace('nir-widget--event--date','unrelated-date').replace('wst-event-date','unrelated-column').encode(),source(),NOW),[])
        self.assertEqual(gcs_events(html.replace('/events/event-details/q2','https://wrong.example/events/event-details/q2').encode(),source(),NOW),[])

    def test_media_theme_date_is_scoped_to_its_event_container(self):
        html=card('article','October 22, 2026 9:00 AM EDT',date_class='media-object__meta')
        rows=gcs_events(html.encode(),source(),NOW)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['timezone'],'America/New_York')
        self.assertEqual(gcs_events(html.replace('Q3 2026 Earnings Conference Call','Q3 2026 Clinical Phase 3 Results').encode(),source(),NOW),[])
        self.assertEqual(gcs_events(html.encode(),source(provider='GENERIC'),NOW),[])
        self.assertEqual(gcs_events(html.encode(),source(verified=False),NOW),[])

    def test_widget_card_ignores_webcast_button_as_event_title(self):
        html='<div class="nir-widget--list"><div><div class="nir-widget--event--date">Aug 12, 2026 4:30 PM EDT</div><a href="/events/event-details/q2">Webcast</a><a href="/events/event-details/q2">Q2 2026 Earnings Conference Call</a></div></div>'
        rows=gcs_events(html.encode(),source(),NOW)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['date'],'2026-08-12');self.assertEqual(rows[0]['eventType'],'EARNINGS_CALL')

    def test_year_first_dates_work_without_assuming_slash_locale_or_year(self):
        rows=gcs_events(card('article','2026.09.14 9:30 AM EDT',name='Global Healthcare Conference').encode(),source(),NOW)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['date'],'2026-09-14')
        for day in ('07/09/26 8:30 AM EDT','08/05/2026 9:00 AM EDT','2026.19.14','October 22, 2026 and October 23, 2026'):
            self.assertEqual(gcs_events(card('div',day).encode(),source(),NOW),[],day)

    def test_partial_peer_cards_do_not_mix_dates_and_oversized_card_is_rejected(self):
        first=card('article','October 22, 2026').removesuffix('</article>')
        second=card('article','July 23, 2026','q2','Q2 2026 Earnings Call').removesuffix('</article>')
        rows=gcs_events((first+second).encode(),source(),NOW)
        self.assertEqual([r['date'] for r in rows],['2026-10-22','2026-07-23'])
        huge=card('article','October 22, 2026').replace('</article>',('x'*65537)+'</article>',1)
        self.assertEqual(gcs_events(huge.encode(),source(),NOW),[])

class EventPDFReferenceTests(unittest.TestCase):
    def test_pdf_webcast_wording_is_a_document_and_does_not_reappear_on_merge(self):
        import tempfile
        from company_intelligence.store import Store
        html=card('article','October 22, 2026 9:00 AM EDT').replace('<a href="https://events.q4inc.com/attendee/123">Listen to webcast</a>','<a href="/static-files/deck" type="application/pdf">IEP 3Q26 Webcast v4 FINAL.pdfView Presentation</a>')
        event=gcs_events(html.encode(),source(),NOW)[0]
        self.assertIsNone(event['webcastUrl']);self.assertEqual(event['presentationUrl'],'https://ir.example.com/static-files/deck')
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            old={**event,'webcastUrl':event['presentationUrl'],'replayUrl':event['presentationUrl'],'presentationUrl':None,'sourceDocuments':[event['sourceDocuments'][0]]}
            store.event(old,NOW);store.event(event,NOW)
            import json
            stored=json.loads(store.db.execute('SELECT payload FROM events').fetchone()[0])
            self.assertIsNone(stored['webcastUrl']);self.assertIsNone(stored['replayUrl']);self.assertEqual(stored['presentationUrl'],event['presentationUrl']);self.assertEqual(stored['date'],event['date']);store.close()

    def test_document_correction_preserves_separate_real_webcast(self):
        html=card('article','October 22, 2026 9:00 AM EDT')+'<article></article>'
        html=html.replace('</article><article></article>','<a href="/static-files/transcript" type="application/pdf">Earnings webcast transcript.pdf</a></article>')
        event=gcs_events(html.encode(),source(),NOW)[0]
        self.assertEqual(event['webcastUrl'],'https://events.q4inc.com/attendee/123');self.assertEqual(event['transcriptUrl'],'https://ir.example.com/static-files/transcript')
        import tempfile,json
        from company_intelligence.store import Store
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite');store.event(event,NOW)
            repeated={**event,'webcastUrl':None};store.event(repeated,NOW)
            stored=json.loads(store.db.execute('SELECT payload FROM events').fetchone()[0]);self.assertEqual(stored['webcastUrl'],event['webcastUrl']);self.assertEqual(stored['transcriptUrl'],event['transcriptUrl']);store.close()

if __name__=='__main__':unittest.main()

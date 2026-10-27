import datetime as dt
import importlib.util
import pathlib
import json
import unittest

spec = importlib.util.spec_from_file_location('source_crawler', pathlib.Path(__file__).with_name('source_crawler.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
NOW = dt.datetime(2026, 10, 26, 12, tzinfo=dt.timezone.utc)
TARGET = {'url': 'https://example.gov/visa', 'route_ids': ['xx:work'], 'roles': ['route_reference'], 'authority': 'published_primary', 'legal_checked_on': ['2026-10-24']}

class CrawlerTests(unittest.TestCase):
    def test_real_source_plan_covers_every_catalog_route_without_claiming_primary_authority(self):
        data = pathlib.Path(__file__).resolve().parents[1] / 'data'
        read = lambda name: json.loads((data / name).read_text())
        catalog = read('global-catalog.json')
        plan = c.source_plan(catalog, [read('route-readiness.json'), read('primary-conditions-2026-10-26.json')], read('iran-start-snapshot.json'))
        ids = {route for row in plan for route in row['route_ids']}
        self.assertTrue(all(route['id'] in ids for route in catalog['routes']))
        self.assertTrue(any(row['authority'] == 'atlas_link_unreviewed' for row in plan))
    def test_thirty_days_not_calendar_months_and_failures_retry(self):
        old = {'last_attempt_at': '2026-09-27T12:00:00Z', 'last_success_at': '2026-09-27T12:00:00Z', 'status': 'captured'}
        self.assertFalse(c.due(old, NOW))
        self.assertTrue(c.due(old, NOW + dt.timedelta(days=1)))
        self.assertTrue(c.due({**old, 'status': 'unavailable', 'last_attempt_at': '2026-10-25T12:00:00Z'}, NOW))

    def test_capture_is_not_a_legal_review_and_changes_stay_pending(self):
        page = c.page_document(b'<main><h2>Eligibility</h2><ul><li>A valid employment contract is required for the application.</li></ul></main>', 'text/html')
        first = c.merge_capture(TARGET, None, {'status': 'captured', **page}, NOW)
        self.assertFalse(first['review_required'])
        self.assertEqual(first['legal_checked_on'], ['2026-10-24'])
        changed = c.merge_capture(TARGET, first, {'status': 'captured', **c.page_document(b'<main><h2>Eligibility</h2><li>A two year employment contract is required.</li></main>', 'text/html')}, NOW + dt.timedelta(days=30))
        self.assertTrue(changed['review_required'])
        again = c.merge_capture(TARGET, changed, {'status': 'captured', **c.page_document(b'<main><h2>Eligibility</h2><li>A two year employment contract is required.</li></main>', 'text/html')}, NOW + dt.timedelta(days=60))
        self.assertTrue(again['review_required'])
        self.assertEqual(again['legal_checked_on'], ['2026-10-24'])

    def test_navigation_does_not_create_a_legal_change_and_excerpt_is_bounded(self):
        a = c.page_document(b'<nav>one</nav><main><h2>Requirements</h2><li>Valid passport required.</li></main><footer>2025</footer>', 'text/html')
        b = c.page_document(b'<nav>two</nav><main><h2>Requirements</h2><li>Valid passport required.</li></main><footer>2026</footer>', 'text/html')
        self.assertEqual(a['semantic_sha256'], b['semantic_sha256'])
        self.assertNotEqual(a['body_sha256'], b['body_sha256'])
        self.assertLessEqual(sum(len(x['excerpt'].split()) for x in a['condition_candidates']), 100)
        self.assertEqual(a['condition_candidates'][0]['verification'], 'unreviewed')

    def test_private_hosts_credentials_and_unapproved_redirects_are_rejected(self):
        for url in ['http://example.gov', 'https://user:secret@example.gov/', 'https://127.0.0.1/', 'https://example.local/', 'https://example.gov:444/']:
            with self.assertRaises(ValueError): c.public_target(url, lambda host: ['93.184.216.34'])
        for address in ['127.0.0.1', '10.1.2.3', '::1', '::ffff:127.0.0.1', '169.254.169.254']:
            with self.assertRaises(ValueError): c.public_target(TARGET['url'], lambda host: [address])
        self.assertFalse(c.allowed_redirect(TARGET['url'], 'https://other.gov/visa'))
        self.assertTrue(c.allowed_redirect(TARGET['url'], 'https://www.example.gov/new-visa'))
        self.assertEqual(c.public_target(TARGET['url'], lambda host: ['2606:4700:4700::1111', '93.184.216.34'])[1], '93.184.216.34')

    def test_challenge_or_empty_document_is_not_captured(self):
        for html in [b'<html>Just a moment. Verify you are human</html>', b'<script>hello</script>']:
            with self.assertRaises(ValueError): c.page_document(html, 'text/html')

    def test_robots_denial_prevents_page_fetch(self):
        calls = []
        def request(url):
            calls.append(url)
            return (200, {'content-type': 'text/plain'}, b'User-agent: *\nDisallow: /visa\n')
        client = c.CaptureClient(request=request, delay=0)
        result = client.capture(TARGET['url'])
        self.assertEqual(result['status'], 'robots_disallowed')
        self.assertEqual(calls, ['https://example.gov/robots.txt'])

    def test_failed_fetch_keeps_last_good_hash_and_portal_does_not_block_routes(self):
        first = c.merge_capture(TARGET, None, {'status': 'captured', **c.page_document(b'<main>Visa eligibility requires a passport.</main>', 'text/html')}, NOW)
        failed = c.merge_capture(TARGET, first, {'status': 'unavailable'}, NOW + dt.timedelta(days=30))
        self.assertEqual(failed['semantic_sha256'], first['semantic_sha256'])
        self.assertTrue(failed['review_required'])
        state = {'sources': [{**failed, 'roles': ['country_portal']}], 'generated_at': c.iso(NOW), 'next_due_at': c.iso(NOW)}
        self.assertEqual(c.public_status(state)['blocked_route_ids'], [])

    def test_acknowledgement_requires_exact_hash_and_dated_review(self):
        pending = {**TARGET, 'status': 'captured', 'review_required': True, 'semantic_sha256': 'a'*64, 'last_success_at': c.iso(NOW)}
        self.assertTrue(c.acknowledge(pending, {'semantic_sha256': 'b'*64, 'reviewed_on': '2026-10-26', 'review_reference': 'commit:abc'}, NOW)['review_required'])
        self.assertFalse(c.acknowledge(pending, {'semantic_sha256': 'a'*64, 'reviewed_on': '2026-10-26', 'review_reference': 'commit:abc'}, NOW)['review_required'])

    def test_corrupt_or_future_baseline_fails_closed(self):
        for value in [{}, {'schema_version': 1, 'generated_at': '2099-01-01T00:00:00Z', 'sources': []}]:
            with self.assertRaises(ValueError): c.validate_state(value, NOW)

    def test_no_daily_refetch_and_review_acknowledgement_can_publish_without_a_fetch(self):
        class Client:
            calls = 0
            def capture(self, url):
                self.calls += 1
                return {'status': 'captured', **c.page_document(b'<main>Visa requires a passport.</main>', 'text/html')}
        client = Client()
        first = c.run([TARGET], None, NOW, client)
        second = c.run([TARGET], first, NOW + dt.timedelta(days=1), client)
        self.assertEqual(client.calls, 1)
        self.assertFalse(second['publish_required'])
        first['sources'][0]['review_required'] = True
        first['sources'][0]['review_reasons'] = ['content_changed']
        acknowledged = c.run([TARGET], first, NOW + dt.timedelta(days=1), client, acknowledgements={TARGET['url']: {'semantic_sha256': first['sources'][0]['semantic_sha256'], 'reviewed_on': '2026-10-27', 'review_reference': 'commit:checked'}})
        self.assertTrue(acknowledged['publish_required'])
        self.assertFalse(acknowledged['sources'][0]['review_required'])

    def test_global_deadline_keeps_deferred_sources_due_without_inventing_a_failure(self):
        class Client:
            def capture(self, url): raise AssertionError('No network after deadline')
        state = c.run([TARGET], None, NOW, Client(), max_seconds=0)
        self.assertEqual(state['sources'][0]['status'], 'pending')
        self.assertFalse(state['sources'][0]['review_required'])
        self.assertTrue(c.due(state['sources'][0], NOW))

if __name__ == '__main__': unittest.main()

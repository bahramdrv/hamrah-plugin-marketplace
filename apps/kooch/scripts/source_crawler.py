"""Public source monitoring. Captures and candidates never renew a legal review."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html.parser
import http.client
import ipaddress
import json
import pathlib
import re
import socket
import ssl
import threading
import time
import urllib.parse
import urllib.robotparser

AGENT = 'KoochSourceMonitor'
DAY = 86400
MAX_BYTES = 2_000_000
MAX_SOURCES = 5000
ROUTE_ID = re.compile(r'^[a-z]{2}:[a-z0-9]+(?:-[a-z0-9]+)*$')
REQUIREMENT = re.compile(r'eligib|requirement|who can apply|criteria|requisit|conditions?|voraussetzung|admissib|qualif|necesito|شرایط|الزامات', re.I)

def iso(value): return value.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
def instant(value): return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(dt.timezone.utc)
def digest(value): return hashlib.sha256(value).hexdigest()

def public_target(url, resolver=None):
    p = urllib.parse.urlsplit(url)
    host = p.hostname or ''
    if p.scheme != 'https' or p.username or p.password or p.port not in (None, 443) or len(url) > 4096:
        raise ValueError('unsupported_url')
    if '.' not in host or host.endswith(('.local', '.localhost', '.internal')) or not re.fullmatch(r'[a-zA-Z0-9.-]+', host):
        raise ValueError('unsupported_host')
    try: ipaddress.ip_address(host)
    except ValueError: pass
    else: raise ValueError('literal_address')
    if any(k.lower() in {'token', 'password', 'session', 'secret'} for k, _ in urllib.parse.parse_qsl(p.query)):
        raise ValueError('credential_query')
    addresses = resolver(host) if resolver else list({x[4][0] for x in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError('non_public_address')
    return p, sorted(addresses, key=lambda address: (ipaddress.ip_address(address).version, address))[0]

def allowed_redirect(source, target):
    a, b = urllib.parse.urlsplit(source), urllib.parse.urlsplit(target)
    return b.scheme == 'https' and bool(a.hostname) and (a.hostname or '').removeprefix('www.') == (b.hostname or '').removeprefix('www.') and not b.username and not b.password and b.port in (None, 443)

class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=10, context=ssl.create_default_context())
        self.address = address
    def connect(self):
        self.sock = self._context.wrap_socket(socket.create_connection((self.address, 443), self.timeout), server_hostname=self.host)

def public_request(url):
    p, address = public_target(url)
    connection = PinnedHTTPS(p.hostname, address)
    started = time.monotonic()
    try:
        connection.request('GET', urllib.parse.urlunsplit(('', '', p.path or '/', p.query, '')), headers={
            'User-Agent': AGENT + '/1.0 (+https://my.kooch.app/privacy)',
            'Accept': 'text/html,application/pdf,application/json,text/plain;q=0.8', 'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        headers = {k.lower(): v for k, v in response.getheaders()}
        if headers.get('content-encoding', 'identity').lower() != 'identity': raise ValueError('unexpected_compression')
        if int(headers.get('content-length', '0')) > MAX_BYTES: raise ValueError('response_too_large')
        chunks, size = [], 0
        while True:
            chunk = response.read(65536)
            if not chunk: break
            size += len(chunk)
            if size > MAX_BYTES or time.monotonic() - started > 20: raise ValueError('capture_limit')
            chunks.append(chunk)
        return response.status, headers, b''.join(chunks)
    finally: connection.close()

class Document(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.main = []; self.main_depth = 0; self.hidden = []
        self.heading = None; self.heading_text = []; self.active = None; self.item_depth = 0; self.item = []; self.candidates = []; self.links = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'nav', 'footer', 'header'): self.hidden.append(tag)
        if self.hidden: return
        if tag in ('main', 'article'): self.main_depth += 1
        if re.fullmatch('h[1-6]', tag): self.heading = int(tag[1]); self.heading_text = []
        if tag == 'li':
            if not self.item_depth: self.item = []
            self.item_depth += 1
        if tag == 'a':
            href = dict(attrs).get('href', '')
            if href: self.links.append(href)
    def handle_endtag(self, tag):
        if self.hidden:
            if tag == self.hidden[-1]: self.hidden.pop()
            return
        if re.fullmatch('h[1-6]', tag) and self.heading:
            title = ' '.join(' '.join(self.heading_text).split())
            if REQUIREMENT.search(title): self.active = (self.heading, title[:180])
            elif self.active and self.heading <= self.active[0]: self.active = None
            self.heading = None
        if tag == 'li' and self.item_depth:
            self.item_depth -= 1
            if not self.item_depth and self.active:
                self.candidates.append({'heading': self.active[1], 'excerpt': ' '.join(' '.join(self.item).split()[:20]), 'verification': 'unreviewed'})
        if tag in ('main', 'article'): self.main_depth = max(0, self.main_depth - 1)
    def handle_data(self, value):
        if self.hidden: return
        self.parts.append(value)
        if self.main_depth: self.main.append(value)
        if self.heading: self.heading_text.append(value)
        if self.item_depth: self.item.append(value)

def page_document(body, content_type):
    result = {'body_sha256': digest(body), 'content_type': content_type.split(';')[0], 'bytes': len(body), 'condition_candidates': [], 'discovery_links': []}
    if 'html' in content_type or 'text/plain' in content_type:
        parser = Document(); parser.feed(body.decode('utf-8', errors='replace'))
        text = ' '.join(' '.join(parser.main or parser.parts).split())
        if not text or re.search(r'just a moment|verify you are human|access denied|enable javascript and cookies|captcha challenge', text[:1500], re.I): raise ValueError('challenge_or_empty')
        result['semantic_sha256'] = digest(text.encode())
        result['condition_candidates'] = parser.candidates[:5]
        result['discovery_links'] = sorted(set(link for link in parser.links if re.search(r'visa|residen|immig|student|work.permit|family|invest|nomad', link, re.I)))[:30]
    elif 'pdf' in content_type:
        if not body.startswith(b'%PDF-'): raise ValueError('invalid_pdf')
        result['semantic_sha256'] = result['body_sha256']
        result['extraction_state'] = 'pdf_requires_review'
    elif 'json' in content_type:
        value = json.loads(body)
        result['semantic_sha256'] = digest(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode())
    else: raise ValueError('unsupported_document')
    return result

class CaptureClient:
    def __init__(self, request=public_request, delay=0.5):
        self.request, self.delay = request, delay
        self.robots = {}; self.locks = {}; self.last = {}; self.guard = threading.Lock()
    def get(self, url):
        origin = urllib.parse.urlsplit(url).netloc
        with self.guard: lock = self.locks.setdefault(origin, threading.Lock())
        with lock:
            time.sleep(max(0, self.delay - (time.monotonic() - self.last.get(origin, 0))))
            try: return self.request(url)
            finally: self.last[origin] = time.monotonic()
    def permission(self, url):
        p = urllib.parse.urlsplit(url); origin = p.scheme + '://' + p.netloc
        with self.guard: robot = self.robots.get(origin)
        if robot is None:
            status, headers, body = self.follow(origin + '/robots.txt', robots=True)
            if status == 404: robot = (None, 'allowed')
            elif status == 200 and len(body) <= 500_000:
                parser = urllib.robotparser.RobotFileParser(); parser.parse(body.decode('utf-8', errors='replace').splitlines()); robot = (parser, 'allowed')
            else: robot = (None, 'robots_unavailable')
            with self.guard: self.robots[origin] = robot
        parser, state = robot
        if state != 'allowed': return state
        return 'allowed' if parser is None or parser.can_fetch(AGENT, url) else 'robots_disallowed'
    def follow(self, url, robots=False):
        current = url
        for _ in range(4):
            status, headers, body = self.get(current)
            if status not in (301, 302, 303, 307, 308): return status, {**headers, 'final-url': current}, body
            target = urllib.parse.urljoin(current, headers.get('location', ''))
            if not allowed_redirect(url, target): raise ValueError('redirect_requires_review')
            if not robots and self.permission(target) != 'allowed': raise ValueError('robots_disallowed')
            current = target
        raise ValueError('redirect_limit')
    def capture(self, url):
        try:
            permission = self.permission(url)
            if permission != 'allowed': return {'status': permission}
            status, headers, body = self.follow(url)
            if status != 200: return {'status': 'http_error', 'http_status': status}
            final = headers.get('final-url', url)
            if final != url and self.permission(final) != 'allowed': return {'status': 'robots_disallowed'}
            document = page_document(body, headers.get('content-type', ''))
            # New references are leads, never authority classifications or new legal rules.
            links = [urllib.parse.urljoin(final, link).split('#')[0] for link in document['discovery_links']]
            document['discovery_links'] = [link for link in links if urllib.parse.urlsplit(link).scheme == 'https' and not urllib.parse.urlsplit(link).username and len(link) <= 4096]
            return {'status': 'captured', 'final_url': final, **document}
        except Exception as error:
            return {'status': 'unavailable', 'error': str(error) if isinstance(error, ValueError) else type(error).__name__}

def due(previous, now):
    if not previous: return True
    if previous.get('superseded_by'): return False
    reference = previous.get('last_attempt_at') if previous.get('status') != 'captured' else previous.get('last_success_at')
    return not reference or (now - instant(reference)).total_seconds() >= (DAY if previous.get('status') != 'captured' else 30 * DAY)

def merge_capture(target, previous, capture, now):
    old = previous or {}
    changed = capture.get('status') == 'captured' and bool(old.get('semantic_sha256')) and old['semantic_sha256'] != capture['semantic_sha256']
    failed = capture.get('status') != 'captured' and bool(old.get('last_success_at'))
    row = {**old, **target, **capture, 'last_attempt_at': iso(now), 'review_required': bool(old.get('review_required') or changed or failed), 'legal_reviews_renewed': 0}
    if capture.get('status') == 'captured': row['last_success_at'] = iso(now)
    row['review_reasons'] = sorted(set(old.get('review_reasons', []) + (['content_changed'] if changed else []) + (['source_unavailable'] if failed else [])))
    return row

def acknowledge(row, acknowledgement, now, replacements=None):
    # An explicit reviewed replacement can resolve a permanently broken URL.
    # Retrieval alone never makes this decision, and the old capture is retained.
    if acknowledgement and acknowledgement.get('replaced_by_urls') and acknowledgement.get('review_reference') and acknowledgement.get('semantic_sha256') == row.get('semantic_sha256'):
        try:
            reviewed = dt.date.fromisoformat(acknowledgement['reviewed_on'])
            urls = acknowledgement['replaced_by_urls']
            targets = [(replacements or {})[url] for url in urls]
            covered = {route for target in targets for route in target['route_ids']}
            if isinstance(urls, list) and 0 < len(urls) <= 10 and row['url'] not in urls and instant(row['last_attempt_at']).date() <= reviewed <= now.date() and set(row['route_ids']) <= covered and all(target.get('authority') == 'published_primary' and target.get('status') == 'captured' and not target.get('superseded_by') and 0 <= (now - instant(target['last_success_at'])).total_seconds() <= 30 * DAY and instant(target['last_success_at']).date() <= reviewed for target in targets):
                return {**row, 'review_required': False, 'review_reasons': [], 'review_acknowledgement': acknowledgement, 'superseded_by': urls}
        except (ValueError, KeyError, TypeError): pass
    if row.get('superseded_by'):
        row = {key: value for key, value in row.items() if key != 'superseded_by'}
        row = {**row, 'review_required': True, 'review_reasons': sorted(set(row.get('review_reasons', []) + ['replacement_review_required']))}
    if acknowledgement and acknowledgement.get('semantic_sha256') == row.get('semantic_sha256') and acknowledgement.get('review_reference'):
        try:
            reviewed = dt.date.fromisoformat(acknowledgement['reviewed_on'])
            captured = instant(row['last_success_at']).date()
            if captured <= reviewed <= now.date() and row.get('status') == 'captured':
                return {**row, 'review_required': False, 'review_reasons': [], 'review_acknowledgement': acknowledgement}
        except (ValueError, KeyError): pass
    return row

def validate_state(value, now):
    if value.get('schema_version') != 1 or not isinstance(value.get('sources'), list) or len(value['sources']) > MAX_SOURCES: raise ValueError('invalid_state')
    try:
        if instant(value['generated_at']) > now + dt.timedelta(minutes=5): raise ValueError('future_state')
        urls = set()
        for row in value['sources']:
            if not isinstance(row.get('url'), str) or row['url'] in urls or len(row['url']) > 4096 or not isinstance(row.get('route_ids'), list) or any(not ROUTE_ID.fullmatch(r) for r in row['route_ids']): raise ValueError('invalid_source')
            urls.add(row['url'])
            for key in ['last_attempt_at', 'last_success_at']:
                if row.get(key) and instant(row[key]) > now + dt.timedelta(minutes=5): raise ValueError('future_capture')
    except (KeyError, TypeError): raise ValueError('invalid_state')
    return value

def source_plan(catalog, registries, snapshot, iran_context=None, official_supplement=None, now=None):
    rows = {}
    def add(url, ids, role, primary=False, checked=None):
        if not url: return
        row = rows.setdefault(url, {'url': url, 'route_ids': [], 'roles': [], 'authority': 'atlas_link_unreviewed', 'legal_checked_on': []})
        row['route_ids'] = sorted(set(row['route_ids'] + ids)); row['roles'] = sorted(set(row['roles'] + [role]))
        if primary: row['authority'] = 'published_primary'
        if checked: row['legal_checked_on'] = sorted(set(row['legal_checked_on'] + [checked]))
    for route in catalog['routes']: add(route['source']['url'], [route['id']], 'route_reference', checked=route['source']['lastVerified'])
    today = (now or dt.datetime.now(dt.timezone.utc)).date().isoformat()
    if official_supplement and official_supplement['released_on'] <= today:
        ids = set()
        for route in official_supplement['routes']:
            if route.get('origin') != 'official_supplement' or not route.get('source_id', '').startswith('kooch:') or not ROUTE_ID.fullmatch(route['id']) or route['id'] in ids or route.get('reviewed_on') != route['source']['lastVerified'] or route['source']['lastVerified'] > official_supplement['released_on']:
                raise ValueError('invalid_official_route_supplement')
            ids.add(route['id'])
            add(route['source']['url'], [route['id']], 'official_route_reference', True, route['source']['lastVerified'])
    for code, country in catalog['destinations'].items(): add(country.get('portal'), [r['id'] for r in catalog['routes'] if r['destination'] == code], 'country_portal')
    for route_id, application in catalog.get('iran_application', {}).items():
        for source_id in application['source_ids']:
            source = catalog['iran_sources'][source_id]
            add(source['url'], [route_id], 'iran_application_reference', source.get('authority') == 'primary', source['checked_on'])
    for registry in registries:
        if registry.get('released_on', '') > today: continue
        for source in registry['sources']:
            ids = [r['route_id'] for r in registry['routes'] if source['id'] in r.get('cost_source_ids', []) + r.get('dependant_source_ids', []) + r.get('availability', {}).get('source_ids', []) + [i for check in r['checks'] for i in check['source_ids']]]
            add(source['url'], ids, 'condition_reference', source.get('verification', 'direct') == 'direct', source['checked_on'])
    if iran_context:
        for source in iran_context['sources']:
            ids = [route['route_id'] for route in iran_context['routes'] if source['id'] in route['source_ids']]
            if not ids: raise ValueError('unlinked_iran_context_source')
            add(source['url'], ids, 'iran_context_reference', True, source['checked_on'])
    for route in snapshot['routes']:
        ids = route['application']['source_ids']
        for fact in route['facts']:
            for source in fact['sources']: add(source['url'], [route['id']], 'application_reference', True, source['checked_on'])
        for key in set(ids):
            source = snapshot['sources'][key]; add(source['url'], [route['id']], 'application_reference', True, source['checked_on'])
    if len(rows) > MAX_SOURCES: raise ValueError('source_plan_limit')
    return list(rows.values())

def public_status(state):
    rows = state['sources']
    blocked = sorted({route for source in rows if source.get('review_required') and set(source.get('roles', [])) - {'country_portal'} for route in source['route_ids']})
    return {'schema_version': 1, 'generated_at': state['generated_at'], 'next_due_at': state['next_due_at'], 'interval_days': 30,
            'complete_global_conditions': False, 'legal_reviews_renewed': 0, 'blocked_route_ids': blocked,
            'coverage': {'planned': len(rows), 'captured': sum(r.get('status') == 'captured' for r in rows), 'unavailable': sum(r.get('status') != 'captured' for r in rows),
                         'review_required': sum(bool(r.get('review_required')) for r in rows), 'unreviewed_authority': sum(r.get('authority') != 'published_primary' for r in rows)}}

def run(plan, previous, now, client, workers=4, acknowledgements=None, max_seconds=3000):
    old = {row['url']: row for row in validate_state(previous, now)['sources']} if previous else {}
    pending = [row for row in plan if due(old.get(row['url']), now)]
    results = {}; attempted = 0
    deadline = time.monotonic() + max_seconds
    def capture(target):
        return client.capture(target['url']) if time.monotonic() < deadline else {'status': 'deferred'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(capture, row): row for row in pending}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            target = futures[future]
            result = future.result()
            if result['status'] != 'deferred': attempted += 1
            results[target['url']] = ({**old.get(target['url'], {'status': 'pending', 'review_required': False}), **target} if result['status'] == 'deferred' else merge_capture(target, old.get(target['url']), result, now))
            if index % 50 == 0: print(json.dumps({'processed_sources': index, 'attempted_sources': attempted, 'due_sources': len(pending)}), flush=True)
    available = {target['url']: results.get(target['url']) or {**old[target['url']], **target} for target in plan}
    replacement_candidates = {url: row for url, row in available.items() if not (acknowledgements or {}).get(url, {}).get('replaced_by_urls')}
    sources = [acknowledge(available[target['url']], (acknowledgements or {}).get(target['url']), now, replacement_candidates) for target in plan]
    # A vanished reference is not silently deleted or declared closed.
    sources += [acknowledge({**row, 'review_required': True, 'review_reasons': sorted(set(row.get('review_reasons', []) + ['reference_removed']))}, (acknowledgements or {}).get(url), now, replacement_candidates) for url, row in old.items() if url not in {r['url'] for r in plan}]
    times = [instant(row.get('last_attempt_at') or iso(now)) + dt.timedelta(days=1) if row.get('status') != 'captured' else instant(row['last_success_at']) + dt.timedelta(days=30) for row in sources if not row.get('superseded_by')]
    state = {'schema_version': 1, 'generated_at': iso(now), 'next_due_at': iso(min(times) if times else now + dt.timedelta(days=30)), 'sources': sources, 'attempted_sources': attempted,
             'publish_required': sources != (previous or {}).get('sources', [])}
    return validate_state(state, now)

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1]); parser.add_argument('--output', type=pathlib.Path, required=True); parser.add_argument('--previous', type=pathlib.Path); parser.add_argument('--max-sources', type=int); parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args(); now = dt.datetime.now(dt.timezone.utc)
    data = args.root / 'data'; catalog = json.loads((data / 'global-catalog.json').read_text()); snapshot = json.loads((data / 'iran-start-snapshot.json').read_text())
    registries = [json.loads((data / 'route-readiness.json').read_text())] + [json.loads(path.read_text()) for path in sorted(data.glob('primary-conditions-*.json'))]
    iran_context = json.loads((data / 'iran-context-evidence.json').read_text())
    official_supplement = json.loads((data / 'official-route-supplement.json').read_text())
    plan = source_plan(catalog, registries, snapshot, iran_context, official_supplement, now)
    if args.max_sources: plan = plan[:args.max_sources]
    previous = json.loads(args.previous.read_text()) if args.previous and args.previous.exists() else None
    acknowledgements = json.loads((data / 'source-crawl-reviews.json').read_text()) if (data / 'source-crawl-reviews.json').exists() else {}
    state = run(plan, previous, now, CaptureClient(), max(1, min(args.workers, 6)), acknowledgements)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, value in [('state.json', state), ('public-status.json', public_status(state))]:
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    status = public_status(state)
    print(json.dumps({'attempted': state['attempted_sources'], 'next_due_at': state['next_due_at'], 'blocked_routes': len(status['blocked_route_ids']), 'coverage': status['coverage'], 'legal_reviews_renewed': 0}, ensure_ascii=False), flush=True)

if __name__ == '__main__': main()

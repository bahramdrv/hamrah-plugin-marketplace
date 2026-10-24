"""Build the public discovery catalog. Fetch dates never renew source verification."""
from pathlib import Path
from datetime import datetime, timezone
import json
import hashlib

root = Path(__file__).resolve().parents[3]
captures = root / '.scratch/kooch-global-coverage/evidence'
wp = root / 'outputs/kooch-visa-pages/wordpress/kooch-visa-data'
read = lambda p: json.loads(p.read_text())
countries = read(captures / 'visa-atlas/destinations-complete.json')['records']
routes = read(captures / 'visa-atlas/visas-complete.json')['records']
labels = read(wp / 'catalog-labels.json')
titles = read(wp / 'card-labels-fa.json')
alpha3 = read(captures / 'iso-alpha3.json')
application = read(wp / 'iran-application-evidence.json')
canonical = lambda code: code.removesuffix('_dest')
destinations = {}
for c in countries:
    code = canonical(c['iso'])
    iso = 'gb' if code == 'uk' else code
    destinations[code] = {
        'name': labels['countries'][c['iso']], 'official_name': c['name'], 'flag': c['flag'],
        'region': c['region'], 'source_code': c['iso'], 'alpha3': alpha3.get(iso, 'XKX' if iso == 'xk' else None),
        'portal': c['govPortal'], 'slug': c['slug'],
    }
    if not destinations[code]['alpha3']:
        raise ValueError('No explicit ISO mapping: ' + code)
normalized = []
for r in routes:
    original = r['destination'] + ':' + r['slug']
    code = canonical(r['destination'])
    normalized.append({
        'id': code + ':' + r['slug'], 'source_id': original, 'destination': code, 'slug': r['slug'],
        'name': r['name'], 'name_fa': titles[original], 'category': r['category'], 'summary': r['summary'],
        'sponsorship_required': r['sponsorshipRequired'], 'settlement': r['leadsToSettlement'],
        'duration': r.get('typicalDuration'), 'source': r['primarySource'], 'reviewed_on': r.get('lastReviewed'),
    })
assert len(destinations) == len(countries) == 233
assert len(normalized) == len({r['id'] for r in normalized}) == 1414
data = {
    'schema_version': 1, 'retrieved_at': datetime.now(timezone.utc).isoformat(),
    'provider': 'Visa Atlas', 'source_url': 'https://visaatlas.org/api/public/visas',
    'license': 'CC BY 4.0', 'license_url': 'https://creativecommons.org/licenses/by/4.0/',
    'destinations': destinations, 'routes': normalized,
    'iran_application': {canonical(k.split(':')[0]) + ':' + k.split(':', 1)[1]: v for k, v in application['routes'].items()},
    'iran_sources': application['sources'],
}
target = root / 'apps/kooch/data/global-catalog.json'
target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
(target.parent / 'global-destinations.json').write_text(json.dumps(destinations, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'countries': len(destinations), 'routes': len(normalized), 'iran_application_reviews': len(data['iran_application']), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))

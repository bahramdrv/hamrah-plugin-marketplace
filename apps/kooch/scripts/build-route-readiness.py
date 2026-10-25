"""Compile the dated official-source research into the Kooch preparation registry."""
from pathlib import Path
import json
import re
import hashlib

root = Path(__file__).resolve().parents[3]
folder = root / '.scratch/kooch-route-readiness/research'
sources, routes = {}, []
for name in ['oceania-europe.md', 'core-regions.md']:
    content = (folder / name).read_text()
    packet = json.loads(re.search(r'```json\s*(.*?)\s*```', content, re.S)[1])
    for source in packet['sources']:
        if source['id'] in sources and source != sources[source['id']]:
            raise ValueError('Conflicting source identity: ' + source['id'])
        source.setdefault('verification', 'direct')
        sources[source['id']] = source
    routes.extend(packet['routes'])
# The research records exactly where only indexed text or historical checklists
# were available; observation today is not direct confirmation of a current rule.
for source_id in ['au_sid', 'au_189', 'au_190', 'au_student', 'pt_remote_law', 'pt_remote_documents', 'pt_d2']:
    if source_id in sources:
        sources[source_id]['verification'] = 'indexed'
for source_id in ['pt_d7_tehran', 'pt_means']:
    if source_id in sources:
        sources[source_id]['verification'] = 'historical'

def readable(text):
    text = text.replace('فرزند ب نیاز ویژه', 'فرزند با نیاز ویژه')
    text = re.sub(r'(?<=[\u0621-\u064A\u066E-\u06D3])(?=[A-Za-z0-9۰-۹])', ' ', text)
    text = re.sub(r'(?<=[A-Za-z0-9۰-۹])(?=[\u0621-\u064A\u066E-\u06D3])', ' ', text)
    text = re.sub(r'([،؛])\s*', r'\1 ', text)
    return re.sub(r' +', ' ', text).strip()

adjust = {
    'nl.hsm_registration': 'ثبت حرفه‌ای BIG لازم را داری یا عدم‌شمول شغلت را در منبع بررسی کرده‌ای؟',
    'nl.orientation_foreign_degree': 'رتبه و ارزیابی لازم برای مدرکت آماده است یا عدم‌شمول این شرط را بررسی کرده‌ای؟',
    'nl.orientation_language': 'شرط زبانِ شاخهٔ مدرکت را پوشش می‌دهی یا معافیت مستند داری؟',
}
for route in routes:
    for key in ['scope_fa', 'limits_fa', 'costs_fa', 'dependants_fa']:
        route[key] = readable(route[key])
    for check in route['checks']:
        if check['answer_id'] == 'uk.talent':
            check['answer_id'] = 'uk.talent_field'
        elif check['answer_id'] == 'uk.talent_endorsement':
            check['answer_id'] = 'uk.talent'
        check['question'] = adjust.get(check['answer_id'], readable(check['question']))
        for key in ['reason', 'action']:
            check[key] = readable(check[key])
    ids = set(route['cost_source_ids'] + route['dependant_source_ids'] + [id for c in route['checks'] for id in c['source_ids']])
    material = {'route': route, 'sources': [sources[id] for id in sorted(ids)]}
    route['version'] = 'readiness-' + hashlib.sha256(json.dumps(material, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
assert len(routes) == len({r['route_id'] for r in routes}) == 30
result = {'version': 'route-readiness-1', 'released_on': '2026-10-24', 'sources': sorted(sources.values(), key=lambda s: s['id']), 'routes': sorted(routes, key=lambda r: r['route_id'])}
(root / 'apps/kooch/data/route-readiness.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'routes': len(routes), 'checks': sum(len(r['checks']) for r in routes), 'sources': len(sources), 'source_verification': {mode: sum(s['verification'] == mode for s in sources.values()) for mode in ['direct', 'indexed', 'historical']}}))

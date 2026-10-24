"""Build a source-only release over the fixed commit; never package local secrets."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[2]
out = root / 'outputs/kooch-ux-review-2026-10-24/implementation'
out.mkdir(parents=True, exist_ok=True)
base = 'afa47751ae41678f869ec00081d00b3b55fa8bed'
changed = set(json.loads((root / '.scratch/kooch-guided-journey/evidence/release-overlay.json').read_text()))
names = subprocess.check_output(['git', 'ls-tree', '-rz', '--name-only', base, 'apps/kooch'], cwd=root).decode().split('\0')
files = {name: subprocess.check_output(['git', 'show', f'{base}:{name}'], cwd=root) for name in names if name}
for name in sorted(changed):
    if name.startswith('apps/kooch/'):
        files[name] = (root / name).read_bytes()
for name in files:
    parts = Path(name).parts
    if any((p.startswith('.env') and p != '.env.example') or p in ['.vercel', 'node_modules', '.next'] for p in parts):
        raise SystemExit('A private or generated path reached the release allowlist')
parser = argparse.ArgumentParser()
parser.add_argument('--isolated', type=Path, default=Path('/private/tmp/kooch-guided-release-20261024-final'))
isolated = parser.parse_args().isolated.resolve()
if isolated.exists():
    raise SystemExit('Refusing to overwrite an existing isolated release')
for name, data in files.items():
    target = isolated / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
app = out / 'kooch-guided-app-source.zip'
with zipfile.ZipFile(app, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        archive.writestr(name, data)
plugin = root / 'outputs/kooch-redesign-20261023/plugin'
wordpress = out / 'kooch-design-refresh-1.0.4.zip'
with zipfile.ZipFile(wordpress, 'w', zipfile.ZIP_DEFLATED) as archive:
    for p in sorted(plugin.rglob('*')):
        if p.is_file():
            archive.write(p, str(p.relative_to(plugin)))
manifest = {
    'baseline_commit': base, 'app_source_files': len(files), 'app_overlay': sorted(n for n in changed if n.startswith('apps/kooch/')),
    'packages': {p.name: {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size} for p in [app, wordpress]},
    'credentials_included': False, 'deployed': False,
    'excluded_unrelated_work': ['academic discovery changes', 'backup changes', 'AI budget/production-window changes not authored by this task'],
}
(out / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(root / '.scratch/kooch-guided-journey/evidence/release-overlay.json').write_text(json.dumps(sorted(changed), ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'isolated': str(isolated), 'source_files': len(files), 'packages': manifest['packages']}, indent=2))

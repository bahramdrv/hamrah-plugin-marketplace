"""Package the approved global coverage overlay over the fixed clean app commit."""
from pathlib import Path
import argparse
import subprocess
import json
import zipfile
import hashlib

root = Path(__file__).resolve().parents[2]
base = 'acbb3bb'
changed = json.loads((root / '.scratch/kooch-global-coverage/evidence/changed-files.json').read_text())
out = root / 'outputs/kooch-global-coverage-2026-10-24'
out.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--isolated', type=Path, default=Path('/private/tmp/kooch-global-release-20261024-delivery'))
isolated = parser.parse_args().isolated.resolve()
if isolated.exists():
    raise SystemExit('Refusing to overwrite an existing release directory')
names = subprocess.check_output(['git', 'ls-tree', '-rz', '--name-only', base, 'apps/kooch'], cwd=root).decode().split('\0')
files = {name: subprocess.check_output(['git', 'show', f'{base}:{name}'], cwd=root) for name in names if name}
for name in changed:
    if name.startswith('apps/kooch/'):
        files[name] = (root / name).read_bytes()
for name, data in files.items():
    parts = Path(name).parts
    if any((part.startswith('.env') and part != '.env.example') or part in ['node_modules', '.next', '.vercel'] for part in parts):
        raise SystemExit('Private/generated release path: ' + name)
    target = isolated / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
app = out / 'kooch-global-app-source.zip'
with zipfile.ZipFile(app, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        archive.writestr(name, data)
tool_files = [name for name in changed if name.startswith('plugins/hamrah/mcp/')]
tools = out / 'hamrah-global-tool-source.zip'
with zipfile.ZipFile(tools, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(tool_files):
        archive.writestr(name, (root / name).read_bytes())
packages = [app, tools]
provenance = out / 'coverage-source-evidence.zip'
if provenance.exists():
    packages.append(provenance)
manifest = {
    'baseline_commit': subprocess.check_output(['git', 'rev-parse', base], cwd=root).decode().strip(),
    'app_files': len(files), 'overlay': changed, 'credentials_included': False, 'deployed': False,
    'packages': {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in packages},
    'note': 'Hamrah tool archive is an overlay for the fixed repository baseline, not a standalone MCP server.',
}
(out / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'isolated': str(isolated), 'files': len(files), 'packages': manifest['packages']}, indent=2))

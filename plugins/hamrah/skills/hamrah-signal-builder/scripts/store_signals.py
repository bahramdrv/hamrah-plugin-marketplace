#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description="Validate and store a Hamrah community-signal dataset.")
parser.add_argument("dataset")
parser.add_argument("--store-root", default=".hamrah/community-signals")
parser.add_argument("--label", default="signals")
args = parser.parse_args()

source = Path(args.dataset).resolve()
root = Path(args.store_root).resolve()
validator = Path(__file__).with_name("validate_output.py")
result = subprocess.run([sys.executable, str(validator), str(source)], text=True, capture_output=True)
if result.returncode:
    sys.stderr.write(result.stdout + result.stderr)
    raise SystemExit(result.returncode)
data = json.loads(source.read_text())
if not data.get("quality_control", {}).get("personal_identifiers_removed"):
    print("Refusing to store: personal_identifiers_removed is not true.", file=sys.stderr)
    raise SystemExit(1)

canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
digest = hashlib.sha256(canonical).hexdigest()
label = re.sub(r"[^a-z0-9]+", "-", args.label.lower()).strip("-") or "signals"
stamp = re.sub(r"[^0-9]", "", data.get("generated_at", ""))[:14] or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
relative = Path("datasets") / stamp[:4] / stamp[4:6] / f"{stamp}-{label}-{digest[:10]}.json"
destination = root / relative
catalog_path = root / "catalog.json"
root.mkdir(parents=True, exist_ok=True)

if catalog_path.exists():
    catalog = json.loads(catalog_path.read_text())
else:
    catalog = {"schema_version": "1.0", "updated_at": None, "datasets": []}
existing = next((item for item in catalog["datasets"] if item["sha256"] == digest), None)
if existing:
    print(str(root / existing["path"]))
    raise SystemExit(0)

destination.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
    temporary = Path(handle.name)
try:
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)
finally:
    temporary.unlink(missing_ok=True)

signals = data.get("signals", [])
entry = {
    "path": relative.as_posix(),
    "sha256": digest,
    "schema_version": data.get("schema_version"),
    "generated_at": data.get("generated_at"),
    "countries": sorted({signal.get("destination", {}).get("country_code") for signal in signals if signal.get("destination", {}).get("country_code")}),
    "routes": sorted({route for signal in signals for route in signal.get("migration_routes", [])}),
    "statuses": sorted({signal.get("status") for signal in signals if signal.get("status")}),
    "signal_count": len(signals),
    "source_ids": sorted({item.get("source_id") for item in data.get("source_coverage", []) if item.get("source_id")})
}
catalog["datasets"].append(entry)
catalog["updated_at"] = datetime.now(timezone.utc).isoformat()
catalog["datasets"].sort(key=lambda item: item.get("generated_at") or "", reverse=True)
with tempfile.NamedTemporaryFile("w", dir=root, delete=False, encoding="utf-8") as handle:
    json.dump(catalog, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
    catalog_tmp = Path(handle.name)
os.replace(catalog_tmp, catalog_path)
print(str(destination))

#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description="Find stored Hamrah community signals.")
parser.add_argument("--store-root", default=".hamrah/community-signals")
parser.add_argument("--country-code")
parser.add_argument("--route")
parser.add_argument("--status", action="append", default=["active", "monitoring", "uncertain"])
args = parser.parse_args()
root = Path(args.store_root).resolve()
catalog_path = root / "catalog.json"
if not catalog_path.exists():
    print(json.dumps({"store_root": str(root), "matches": [], "warning": "signal store not found"}))
    raise SystemExit(0)

catalog = json.loads(catalog_path.read_text())
matches = []
for entry in catalog.get("datasets", []):
    if args.country_code and args.country_code not in entry.get("countries", []):
        continue
    if args.route and args.route not in entry.get("routes", []):
        continue
    path = root / entry["path"]
    data = json.loads(path.read_text())
    signal_ids = []
    for signal in data.get("signals", []):
        if args.country_code and signal.get("destination", {}).get("country_code") != args.country_code:
            continue
        if args.route and args.route not in signal.get("migration_routes", []):
            continue
        if args.status and signal.get("status") not in args.status:
            continue
        signal_ids.append(signal.get("signal_id"))
    if signal_ids:
        matches.append({"dataset": str(path), "generated_at": entry.get("generated_at"), "signal_ids": signal_ids})
print(json.dumps({"store_root": str(root), "matches": matches}, ensure_ascii=False, indent=2))

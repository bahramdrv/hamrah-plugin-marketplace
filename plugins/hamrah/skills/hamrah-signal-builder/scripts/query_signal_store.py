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
    version = data.get("schema_version")
    for signal in data.get("signals", []):
        if version == "3.0.0":
            scope = signal.get("scope", {})
            destination, routes = scope.get("destination", {}), scope.get("routes", {}).get("codes", [])
            status = {"unknown": "uncertain"}.get(signal.get("assessment", {}).get("lifecycle"), signal.get("assessment", {}).get("lifecycle"))
        else:
            destination, routes = signal.get("destination", {}), signal.get("migration_routes", [])
            status = signal.get("lifecycle", {}).get("status") if version == "4.0.0" else signal.get("status")
        if args.country_code and destination.get("country_code") != args.country_code:
            continue
        if args.route and args.route not in routes:
            continue
        if args.status and status not in args.status:
            continue
        signal_ids.append(signal.get("id") if version == "4.0.0" else signal.get("signal_id"))
    if signal_ids:
        matches.append({"dataset": str(path), "generated_at": entry.get("generated_at"), "signal_ids": signal_ids})
print(json.dumps({"store_root": str(root), "matches": matches}, ensure_ascii=False, indent=2))

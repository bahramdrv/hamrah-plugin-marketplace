#!/usr/bin/env python3
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description="Validate and store a Hamrah Community Signals v3 dataset.")
parser.add_argument("dataset")
parser.add_argument("--store-root", default=".hamrah/community-signals")
parser.add_argument("--label", default="signals")
args = parser.parse_args()
source = Path(args.dataset).resolve(); root = Path(args.store_root).resolve()
validator = Path(__file__).with_name("validate_output.py")
result = subprocess.run([sys.executable, str(validator), str(source)], text=True, capture_output=True)
if result.returncode:
    sys.stderr.write(result.stdout + result.stderr); raise SystemExit(result.returncode)
data = json.loads(source.read_text(encoding="utf-8"))
if data.get("schema_version") != "3.0.0":
    print("Refusing to store: only canonical schema_version 3.0.0 is accepted.", file=sys.stderr); raise SystemExit(1)
if data.get("quality", {}).get("checks", {}).get("privacy", {}).get("status") != "pass":
    print("Refusing to store: quality.checks.privacy.status must be pass.", file=sys.stderr); raise SystemExit(1)
canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(); digest = hashlib.sha256(canonical).hexdigest()
label = re.sub(r"[^a-z0-9]+", "-", args.label.lower()).strip("-") or "signals"
stamp = re.sub(r"[^0-9]", "", data["dataset"].get("generated_at", ""))[:14] or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
relative = Path("datasets") / stamp[:4] / stamp[4:6] / f"{stamp}-{label}-{digest[:10]}.json"; destination = root / relative; catalog_path = root / "catalog.json"; root.mkdir(parents=True, exist_ok=True)
catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {"schema_version":"2.0","updated_at":None,"datasets":[]}
existing = next((item for item in catalog["datasets"] if item["sha256"] == digest), None)
if existing: print(str(root / existing["path"])); raise SystemExit(0)
destination.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle: temporary = Path(handle.name)
try: shutil.copyfile(source, temporary); os.replace(temporary, destination)
finally: temporary.unlink(missing_ok=True)
entry = {"path":relative.as_posix(),"sha256":digest,"schema_version":data["schema_version"],"taxonomy_version":data["taxonomy_version"],"generated_at":data["dataset"]["generated_at"],"countries":sorted({s.get("scope",{}).get("destination",{}).get("country_code") for s in data.get("signals",[]) if s.get("scope",{}).get("destination",{}).get("country_code")}),"signal_count":len(data.get("signals",[])),"source_ids":sorted({x.get("source_id") for x in data.get("sources",[]) if x.get("source_id")})}
catalog["datasets"].append(entry); catalog["updated_at"] = datetime.now(timezone.utc).isoformat(); catalog["datasets"].sort(key=lambda item:item.get("generated_at") or "", reverse=True)
with tempfile.NamedTemporaryFile("w", dir=root, delete=False, encoding="utf-8") as handle:
    json.dump(catalog, handle, ensure_ascii=False, indent=2); handle.write("\n"); tmp = Path(handle.name)
os.replace(tmp, catalog_path); print(str(destination))

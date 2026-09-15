#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

FORBIDDEN_SIGNAL_FIELDS = {"suggested_fit_adjustment", "conditional_adjustment"}

def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"ERROR: file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: invalid JSON in {path}: {exc}")

def schema_validate(data, schema_path: Path):
    try:
        import jsonschema
    except ImportError:
        return ["jsonschema package is required; validation fails closed when unavailable."]
    schema = load_json(schema_path)
    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    return [f"schema: {'.'.join(str(x) for x in err.absolute_path) or '<root>'}: {err.message}" for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))]

def semantic_validate(data):
    errors = []
    if data.get("schema_version") != "3.0.0": errors.append("schema_version must be '3.0.0'.")
    if data.get("quality", {}).get("checks", {}).get("privacy", {}).get("status") != "pass": errors.append("quality.checks.privacy.status must be 'pass'.")
    source_ids = set()
    for source in data.get("sources", []):
        sid = source.get("source_id")
        if sid in source_ids: errors.append(f"duplicate source_id: {sid}")
        source_ids.add(sid)
    evidence_ids = set()
    for item in data.get("evidence", []):
        eid = item.get("evidence_id")
        if eid in evidence_ids: errors.append(f"duplicate evidence_id: {eid}")
        evidence_ids.add(eid)
        if item.get("source_id") not in source_ids: errors.append(f"{eid}: unknown source_id {item.get('source_id')}")
    signal_ids = set()
    for signal in data.get("signals", []):
        sid = signal.get("signal_id")
        if sid in signal_ids: errors.append(f"duplicate signal_id: {sid}")
        signal_ids.add(sid)
        forbidden = FORBIDDEN_SIGNAL_FIELDS.intersection(signal)
        if forbidden: errors.append(f"{sid}: forbidden scoring fields: {sorted(forbidden)}")
        for link in signal.get("evidence_links", []):
            if link.get("evidence_id") not in evidence_ids: errors.append(f"{sid}: unknown evidence_id {link.get('evidence_id')}")
    for signal in data.get("signals", []):
        for rel in signal.get("relationships", []):
            if rel.get("signal_id") not in signal_ids: errors.append(f"{signal.get('signal_id')}: relationship target not present: {rel.get('signal_id')}")
    return errors

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--schema", type=Path, default=None)
    args = parser.parse_args()
    data = load_json(args.file)
    schema_path = args.schema or Path(__file__).resolve().parents[1] / "references" / "output_schema.json"
    errors = schema_validate(data, schema_path) + semantic_validate(data)
    for error in errors: print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        print(f"FAILED: {len(errors)} error(s).", file=sys.stderr)
        return 1
    print(f"VALID: {args.file}")
    return 0

if __name__ == "__main__": raise SystemExit(main())

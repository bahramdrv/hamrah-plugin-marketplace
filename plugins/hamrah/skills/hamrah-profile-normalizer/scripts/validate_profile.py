#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

VALID_STATUSES = {
    "ready_for_initial_screening",
    "needs_more_information",
    "insufficient_for_screening",
}
IMPORTANCE = {"critical", "high", "medium", "low"}

def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"ERROR: file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: invalid JSON in {path}: {exc}")

def schema_validate(data, schema_path: Path):
    errors, warnings = [], []
    try:
        import jsonschema
    except ImportError:
        warnings.append("jsonschema is not installed; full JSON-Schema validation was skipped.")
        return errors, warnings

    schema = load_json(schema_path)
    validator = jsonschema.Draft202012Validator(schema)
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        loc = ".".join(str(x) for x in err.absolute_path) or "<root>"
        errors.append(f"schema: {loc}: {err.message}")
    return errors, warnings

def semantic_validate(data):
    errors, warnings = [], []

    if data.get("schema_version") != "1.0":
        errors.append("schema_version must be '1.0'.")

    status = data.get("intake_status")
    if status not in VALID_STATUSES:
        errors.append(f"invalid intake_status: {status!r}")

    missing = data.get("missing_information", [])
    critical = sum(1 for x in missing if x.get("importance") == "critical")
    high = sum(1 for x in missing if x.get("importance") == "high")
    ambiguities = data.get("ambiguities", [])
    contradictions = data.get("contradictions", [])
    dq = data.get("data_quality", {})

    expected = {
        "critical_missing_count": critical,
        "high_missing_count": high,
        "ambiguity_count": len(ambiguities),
        "contradiction_count": len(contradictions),
    }
    for key, actual in expected.items():
        if dq.get(key) != actual:
            errors.append(f"data_quality.{key}={dq.get(key)!r} but actual={actual}.")

    if status == "ready_for_initial_screening" and critical > 0:
        errors.append("ready_for_initial_screening cannot have critical missing information.")

    if status == "insufficient_for_screening" and critical == 0:
        warnings.append("insufficient_for_screening has no critical missing fields.")

    if status == "ready_for_initial_screening" and dq.get("overall_confidence") == "low":
        warnings.append("ready_for_initial_screening has low overall confidence.")

    # GPA sanity
    education = data.get("education")
    if isinstance(education, list):
        for i, item in enumerate(education):
            gpa = item.get("gpa")
            if isinstance(gpa, dict):
                value = gpa.get("value")
                scale = gpa.get("scale")
                if isinstance(value, (int, float)) and isinstance(scale, (int, float)):
                    if scale <= 0:
                        errors.append(f"education[{i}].gpa.scale must be > 0.")
                    elif value > scale:
                        warnings.append(f"education[{i}].gpa.value exceeds gpa.scale.")

    # Explicit false vs unknown guard is semantic convention; catch suspicious empty strings.
    def walk(obj, path=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                p = f"{path}.{k}" if path else k
                if v == "":
                    warnings.append(f"{p}: empty string found; prefer null when unknown.")
                walk(v, p)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}[{i}]")
    walk(data)

    # No more than 5 high/critical surfaced questions recommended.
    priority_count = critical + high
    if priority_count > 5:
        warnings.append(
            f"{priority_count} critical/high missing fields are listed; first user-facing follow-up should surface at most 5."
        )

    # Detect suspicious inference: nationalities from residence equality is allowed, but not required.
    applicant = data.get("applicant", {})
    if applicant.get("nationalities") is None and applicant.get("current_country_of_residence"):
        pass

    return errors, warnings

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--schema", type=Path, default=None)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    data = load_json(args.file)
    default_schema = Path(__file__).resolve().parents[1] / "references" / "applicant_profile_schema.json"
    schema_path = args.schema or default_schema

    errors, warnings = schema_validate(data, schema_path)
    sem_errors, sem_warnings = semantic_validate(data)
    errors.extend(sem_errors)
    warnings.extend(sem_warnings)

    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)

    if errors or (args.strict and warnings):
        print(f"FAILED: {len(errors)} error(s), {len(warnings)} warning(s).", file=sys.stderr)
        return 1

    print(f"VALID: {args.file} ({len(warnings)} warning(s))")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

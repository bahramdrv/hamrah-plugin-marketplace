#!/usr/bin/env python3
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    Draft202012Validator = None
    FormatChecker = None

if len(sys.argv) != 2:
    print("Usage: validate_program_matches.py <hamrah_program_matches.json>", file=sys.stderr)
    raise SystemExit(2)

root = Path(__file__).resolve().parents[1]
schema = json.loads((root / "references/program_matches_schema.json").read_text())
data = json.loads(Path(sys.argv[1]).read_text())
errors = []
required_root = {"schema_version", "generated_at", "profile_reference", "search_scope", "programs", "warnings"}
if not isinstance(data, dict):
    errors.append("root must be an object")
else:
    for field in sorted(required_root - set(data)):
        errors.append(f"root: missing {field}")
    if data.get("schema_version") != "1.0":
        errors.append("schema_version must be 1.0")
    if not isinstance(data.get("programs"), list):
        errors.append("programs must be an array")
    else:
        required_program = {"program_id", "institution", "country", "program_title", "degree_level", "field", "official_program_url", "match_status", "match_reasons", "gaps", "admissions", "funding", "immigration_context", "preference_match", "sources", "checked_at"}
        for index, program in enumerate(data["programs"]):
            if not isinstance(program, dict):
                errors.append(f"programs.{index} must be an object")
                continue
            for field in sorted(required_program - set(program)):
                errors.append(f"programs.{index}: missing {field}")
            if program.get("match_status") not in {"supported_fit", "conditional_fit", "insufficient_evidence"}:
                errors.append(f"programs.{index}.match_status is invalid")
            if not str(program.get("official_program_url", "")).startswith("https://"):
                errors.append(f"programs.{index}.official_program_url must use https")
            if not program.get("sources"):
                errors.append(f"programs.{index}.sources must not be empty")
if Draft202012Validator:
    errors.extend(sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data), key=lambda error: list(error.path)))
if errors:
    for error in errors:
        if isinstance(error, str):
            print(error, file=sys.stderr)
        else:
            location = ".".join(map(str, error.path)) or "root"
            print(f"{location}: {error.message}", file=sys.stderr)
    raise SystemExit(1)
print("Program matches are valid.")

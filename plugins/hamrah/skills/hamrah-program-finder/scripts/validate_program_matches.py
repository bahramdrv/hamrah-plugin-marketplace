#!/usr/bin/env python3
import json
import sys
from datetime import date
from pathlib import Path

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    print("jsonschema is required; install requirements-test.txt before validating program matches", file=sys.stderr)
    raise SystemExit(2)

if len(sys.argv) != 2:
    print("Usage: validate_program_matches.py <hamrah_program_matches.json>", file=sys.stderr)
    raise SystemExit(2)

root = Path(__file__).resolve().parents[1]
schema = json.loads((root / "references/program_matches_schema.json").read_text())
data = json.loads(Path(sys.argv[1]).read_text())
schema_errors = sorted(
    Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data),
    key=lambda error: str(list(error.path)),
)
errors = [f"{'.'.join(map(str, error.path)) or 'root'}: {error.message}" for error in schema_errors]

if isinstance(data, dict) and isinstance(data.get("programs"), list):
    scope = data.get("search_scope") if isinstance(data.get("search_scope"), dict) else {}
    for index, program in enumerate(data["programs"]):
        if not isinstance(program, dict):
            continue
        prefix = f"programs.{index}"
        source_urls = {
            source.get("url") for source in program.get("sources", [])
            if isinstance(source, dict) and isinstance(source.get("url"), str)
        } if isinstance(program.get("sources"), list) else set()

        for field in ("country", "degree_level", "field"):
            actual, requested = program.get(field), scope.get(field)
            if isinstance(actual, str) and isinstance(requested, str) and actual.casefold().strip() != requested.casefold().strip():
                errors.append(f"{prefix}.{field} must match search_scope.{field}")
        if isinstance(program.get("official_program_url"), str) and program["official_program_url"] not in source_urls:
            errors.append(f"{prefix}.official_program_url must appear in sources")

        def require_listed_source(url, path):
            if not isinstance(url, str) or not url.startswith("https://"):
                errors.append(f"{prefix}.{path} needs an HTTPS source")
            elif url not in source_urls:
                errors.append(f"{prefix}.{path} must appear in sources")

        reasons = program.get("match_reasons")
        if isinstance(reasons, list):
            for reason_index, reason in enumerate(reasons):
                if isinstance(reason, dict) and isinstance(reason.get("source_urls"), list):
                    for url in reason["source_urls"]:
                        require_listed_source(url, f"match_reasons.{reason_index}.source_urls")

        admissions = program.get("admissions")
        if isinstance(admissions, dict):
            requirements = admissions.get("requirements")
            if isinstance(requirements, list):
                for requirement_index, requirement in enumerate(requirements):
                    if isinstance(requirement, dict):
                        require_listed_source(requirement.get("source_url"), f"admissions.requirements.{requirement_index}.source_url")
            deadline = admissions.get("deadline")
            if isinstance(deadline, dict):
                if deadline.get("status") in {"verified", "expired"}:
                    if not deadline.get("date") or not deadline.get("intake"):
                        errors.append(f"{prefix}.admissions.deadline needs a date and intake")
                    require_listed_source(deadline.get("source_url"), "admissions.deadline.source_url")
                    deadline_date = deadline.get("date")
                    checked_at = program.get("checked_at")
                    if isinstance(deadline_date, str) and isinstance(checked_at, str):
                        try:
                            deadline_day = date.fromisoformat(deadline_date)
                            checked_day = date.fromisoformat(checked_at)
                        except ValueError:
                            pass  # The schema reports invalid date formats.
                        else:
                            if deadline.get("status") == "verified" and deadline_day < checked_day:
                                errors.append(f"{prefix}.admissions.deadline.status must be expired after the deadline")
                            elif deadline.get("status") == "expired" and deadline_day >= checked_day:
                                errors.append(f"{prefix}.admissions.deadline.status cannot be expired before the deadline")
                elif deadline.get("status") == "unknown" and deadline.get("date") is not None:
                    errors.append(f"{prefix}.admissions.deadline.date must be null when status is unknown")

        for field, asserted_statuses in (
            ("funding", {"verified", "competitive", "none"}),
            ("iranian_evidence", {"explicit_permission", "explicit_restriction"}),
        ):
            claim = program.get(field)
            if isinstance(claim, dict) and claim.get("status") in asserted_statuses:
                require_listed_source(claim.get("source_url"), f"{field}.source_url")
                if not claim.get("details"):
                    errors.append(f"{prefix}.{field}.details is required for {claim['status']}")

        affordability = program.get("affordability")
        tuition = affordability.get("tuition") if isinstance(affordability, dict) else None
        if isinstance(tuition, dict):
            if tuition.get("status") in {"verified", "none"}:
                require_listed_source(tuition.get("source_url"), "affordability.tuition.source_url")
            if tuition.get("status") == "verified" and (
                tuition.get("amount") is None or not tuition.get("currency") or not tuition.get("period")
            ):
                errors.append(f"{prefix}.affordability.tuition needs amount, currency, and period")
            if tuition.get("status") == "none" and tuition.get("amount") != 0:
                errors.append(f"{prefix}.affordability.tuition.amount must be zero when status is none")
            if tuition.get("status") == "unknown" and tuition.get("amount") is not None:
                errors.append(f"{prefix}.affordability.tuition.amount must be null when status is unknown")
if errors:
    for error in errors:
        print(error, file=sys.stderr)
    raise SystemExit(1)
print("Program matches are valid.")

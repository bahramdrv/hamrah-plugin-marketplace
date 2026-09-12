#!/usr/bin/env python3
"""
Validate Visa Atlas Community Signals output.

Usage:
    python scripts/validate_output.py path/to/immigration_community_signals.json
    python scripts/validate_output.py path/to/file.json --schema references/output_schema.json
    python scripts/validate_output.py path/to/file.json --strict
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ALLOWED_ADJUSTMENTS = {0, -5, -10, -15, -20}
STATUS_VALUES = {"active", "monitoring", "uncertain", "resolved", "historical"}
SEVERITY_VALUES = {"low", "moderate", "high", "critical"}
CONFIDENCE_VALUES = {"low", "medium", "high"}


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"ERROR: file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: invalid JSON in {path}: {exc}")


def schema_validate(data, schema_path: Path):
    errors = []
    warnings = []
    try:
        import jsonschema
    except ImportError:
        warnings.append(
            "jsonschema package is not installed; full JSON-Schema validation was skipped."
        )
        return errors, warnings

    schema = load_json(schema_path)
    validator = jsonschema.Draft202012Validator(schema)
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        loc = ".".join(str(x) for x in err.absolute_path) or "<root>"
        errors.append(f"schema: {loc}: {err.message}")
    return errors, warnings


def semantic_validate(data):
    errors = []
    warnings = []

    if data.get("schema_version") != "2.0":
        errors.append("schema_version must be '2.0'.")

    signals = data.get("signals")
    if not isinstance(signals, list):
        return ["signals must be an array."], warnings

    ids = [s.get("signal_id") for s in signals]
    if any(not x for x in ids):
        errors.append("every signal must have a non-empty signal_id.")
    duplicates = sorted({x for x in ids if x and ids.count(x) > 1})
    if duplicates:
        errors.append(f"duplicate signal_id values: {duplicates}")

    known_ids = {x for x in ids if x}
    evidence_ids = set()

    counts = {k: 0 for k in STATUS_VALUES}
    highest_order = {"low": 1, "moderate": 2, "high": 3, "critical": 4}
    highest_active = "none"

    for idx, signal in enumerate(signals):
        label = signal.get("signal_id") or f"signals[{idx}]"
        status = signal.get("status")
        severity = signal.get("severity")
        confidence = signal.get("confidence")
        adjustment = signal.get("suggested_fit_adjustment")
        conditional = signal.get("conditional_adjustment", {}).get("adjustment")

        if status not in STATUS_VALUES:
            errors.append(f"{label}: invalid status {status!r}.")
        else:
            counts[status] += 1

        if severity not in SEVERITY_VALUES:
            errors.append(f"{label}: invalid severity {severity!r}.")
        if confidence not in CONFIDENCE_VALUES:
            errors.append(f"{label}: invalid confidence {confidence!r}.")

        if adjustment not in ALLOWED_ADJUSTMENTS:
            errors.append(f"{label}: invalid suggested_fit_adjustment {adjustment!r}.")
        if conditional not in ALLOWED_ADJUSTMENTS:
            errors.append(f"{label}: invalid conditional adjustment {conditional!r}.")

        if status in {"resolved", "historical"} and adjustment != 0:
            errors.append(f"{label}: resolved/historical signals must have adjustment 0.")

        if signal.get("impact_direction") == "positive_resolution" and adjustment != 0:
            errors.append(f"{label}: positive_resolution signals must have adjustment 0.")

        if status == "monitoring" and adjustment not in (0, None):
            warnings.append(f"{label}: monitoring signal has a non-zero current adjustment.")

        ev = signal.get("evidence", [])
        ec = signal.get("evidence_count")
        irc = signal.get("independent_report_count")

        if isinstance(ec, int) and ec < len(ev):
            errors.append(
                f"{label}: evidence_count ({ec}) cannot be lower than listed evidence ({len(ev)})."
            )
        elif isinstance(ec, int) and ec != len(ev):
            warnings.append(
                f"{label}: evidence_count ({ec}) differs from listed evidence length ({len(ev)}); "
                "acceptable only if evidence list is intentionally representative."
            )

        if isinstance(ec, int) and isinstance(irc, int) and irc > ec:
            errors.append(
                f"{label}: independent_report_count ({irc}) cannot exceed evidence_count ({ec})."
            )

        local_groups = set()
        for evidence in ev:
            eid = evidence.get("evidence_id")
            if not eid:
                errors.append(f"{label}: evidence item missing evidence_id.")
            elif eid in evidence_ids:
                errors.append(f"{label}: duplicate evidence_id {eid}.")
            else:
                evidence_ids.add(eid)

            group = evidence.get("independence_group")
            if group:
                local_groups.add(group)

        if isinstance(irc, int) and local_groups and irc > len(local_groups):
            warnings.append(
                f"{label}: independent_report_count ({irc}) exceeds distinct listed "
                f"independence_group values ({len(local_groups)})."
            )

        for corr in signal.get("correlated_signal_ids", []):
            if corr not in known_ids:
                warnings.append(
                    f"{label}: correlated_signal_id {corr!r} is not present in this file."
                )

        resolution = signal.get("resolution", {})
        if resolution.get("resolved") is True and status != "resolved":
            warnings.append(
                f"{label}: resolution.resolved=true but status is {status!r}, not 'resolved'."
            )
        if status == "resolved" and resolution.get("resolved") is not True:
            errors.append(f"{label}: status='resolved' requires resolution.resolved=true.")

        if status == "active" and severity in highest_order:
            if highest_active == "none" or highest_order[severity] > highest_order[highest_active]:
                highest_active = severity

    summary = data.get("summary", {})
    if summary.get("total_signals") != len(signals):
        errors.append(
            f"summary.total_signals={summary.get('total_signals')} but actual={len(signals)}."
        )

    for status in STATUS_VALUES:
        if summary.get(status) != counts[status]:
            errors.append(
                f"summary.{status}={summary.get(status)} but actual={counts[status]}."
            )

    if summary.get("highest_active_severity") != highest_active:
        errors.append(
            "summary.highest_active_severity="
            f"{summary.get('highest_active_severity')!r} but actual={highest_active!r}."
        )

    coverage = data.get("source_coverage", [])
    qc = data.get("quality_control", {})
    if qc.get("full_sources_processed") is True:
        incomplete = [x.get("source_id") for x in coverage if x.get("coverage_complete") is False]
        if incomplete:
            errors.append(
                "quality_control.full_sources_processed=true but these sources are incomplete: "
                + ", ".join(str(x) for x in incomplete)
            )

    return errors, warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--schema", type=Path, default=None)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as validation failures.",
    )
    args = parser.parse_args()

    data = load_json(args.file)
    default_schema = Path(__file__).resolve().parents[1] / "references" / "output_schema.json"
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
        print(
            f"FAILED: {len(errors)} error(s), {len(warnings)} warning(s).",
            file=sys.stderr,
        )
        return 1

    print(f"VALID: {args.file} ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

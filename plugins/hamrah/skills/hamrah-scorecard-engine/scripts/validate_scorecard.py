#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

ALLOWED_COMMUNITY = {0, -5, -10, -15, -20}
WEIGHTS = {
    "eligibility_fit": 30,
    "career_profile_fit": 20,
    "financial_fit": 15,
    "process_practicality": 10,
    "long_term_potential": 10,
    "goal_alignment": 10,
    "evidence_quality": 5,
}
ELIGIBILITY = {"PASS", "FAIL", "POSSIBLE", "UNKNOWN"}

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

    routes = data.get("route_scorecards", [])
    route_keys = set()
    rankable = []

    for i, route in enumerate(routes):
        country_code = route.get("country", {}).get("code")
        route_code = route.get("route", {}).get("code")
        label = f"{country_code or '?'}:{route_code or '?'}"
        key = (country_code, route_code)
        if key in route_keys:
            errors.append(f"{label}: duplicate country/route scorecard.")
        route_keys.add(key)

        status = route.get("official_eligibility", {}).get("status")
        if status not in ELIGIBILITY:
            errors.append(f"{label}: invalid official eligibility status {status!r}.")

        components = route.get("base_fit", {}).get("components", {})
        component_values = []
        all_numeric = True

        for name, expected_max in WEIGHTS.items():
            comp = components.get(name, {})
            max_score = comp.get("max_score")
            score = comp.get("score")

            if max_score != expected_max:
                errors.append(
                    f"{label}: {name}.max_score must be {expected_max}, got {max_score!r}."
                )

            if score is None:
                all_numeric = False
            elif not isinstance(score, int):
                errors.append(f"{label}: {name}.score must be integer or null.")
                all_numeric = False
            else:
                if score < 0 or score > expected_max:
                    errors.append(
                        f"{label}: {name}.score={score} is outside 0..{expected_max}."
                    )
                component_values.append(score)

        base_score = route.get("base_fit", {}).get("score")
        if all_numeric:
            expected_base = sum(component_values)
            if base_score != expected_base:
                errors.append(
                    f"{label}: base_fit.score must equal component sum {expected_base}, got {base_score!r}."
                )
        elif base_score is not None:
            warnings.append(
                f"{label}: base_fit.score is numeric while one or more components are null."
            )

        if status == "PASS":
            ef = components.get("eligibility_fit", {}).get("score")
            if isinstance(ef, int) and ef < 26:
                warnings.append(f"{label}: PASS route has unusually low eligibility_fit score {ef}.")

        if status == "FAIL":
            ef = components.get("eligibility_fit", {}).get("score")
            if ef != 0:
                errors.append(f"{label}: FAIL route must have eligibility_fit score 0.")
            if not route.get("official_eligibility", {}).get("blockers"):
                errors.append(f"{label}: FAIL route must include at least one blocker.")

        if status == "UNKNOWN":
            if route.get("confidence", {}).get("level") == "high":
                errors.append(f"{label}: UNKNOWN official eligibility cannot have high confidence.")
            if route.get("official_eligibility", {}).get("official_data_quality", {}).get("status") == "current":
                warnings.append(
                    f"{label}: UNKNOWN eligibility with current official data should be reviewed."
                )

        community = route.get("community_adjustment", {})
        total = community.get("total")
        if total not in ALLOWED_COMMUNITY:
            errors.append(
                f"{label}: community adjustment must be one of {sorted(ALLOWED_COMMUNITY)}, got {total!r}."
            )

        applied = community.get("applied_signals", [])
        # Sum individual signal penalties only as an audit signal; correlated signals may be de-duplicated.
        for sig in applied:
            adj = sig.get("adjustment")
            if adj not in ALLOWED_COMMUNITY:
                errors.append(
                    f"{label}: applied signal {sig.get('signal_id')} has invalid adjustment {adj!r}."
                )
            if adj > 0:
                errors.append(
                    f"{label}: positive Community Signal adjustment is prohibited."
                )

        practical = route.get("practical_fit", {})
        practical_score = practical.get("score")
        usable = practical.get("usable_for_ranking")

        if base_score is not None and total in ALLOWED_COMMUNITY:
            expected_practical = max(0, base_score + total)
            if practical_score != expected_practical:
                errors.append(
                    f"{label}: practical_fit.score must equal base_fit.score + community_adjustment.total "
                    f"(clamped at 0): expected {expected_practical}, got {practical_score!r}."
                )
        elif practical_score is not None:
            warnings.append(
                f"{label}: practical_fit.score is present although Base Fit is unavailable."
            )

        if status == "FAIL" and usable:
            errors.append(f"{label}: FAIL route cannot be usable_for_ranking.")
        if status == "UNKNOWN" and usable:
            errors.append(f"{label}: UNKNOWN route cannot be usable_for_ranking.")

        if usable:
            if practical_score is None:
                errors.append(f"{label}: rankable route must have a practical_fit score.")
            else:
                rankable.append((country_code, route_code, practical_score))

        dq = route.get("official_eligibility", {}).get("official_data_quality", {})
        if dq.get("status") == "missing" and route.get("confidence", {}).get("level") == "high":
            errors.append(f"{label}: missing official data cannot have high confidence.")

        # Requirement source guard
        for req in route.get("official_eligibility", {}).get("reasons", []):
            if req.get("result") in {"met", "not_met"} and not req.get("source_url"):
                warnings.append(
                    f"{label}: checked requirement {req.get('requirement_id')!r} has no source_url."
                )

    summary = data.get("portfolio_summary", {})
    expected_viable = len(rankable)
    if summary.get("viable_route_count") != expected_viable:
        errors.append(
            f"portfolio_summary.viable_route_count={summary.get('viable_route_count')} but actual rankable routes={expected_viable}."
        )

    strongest = summary.get("strongest_routes", [])
    strongest_keys = {(x.get("country_code"), x.get("route_code")) for x in strongest}
    rankable_keys = {(c, r) for c, r, _ in rankable}

    for item in strongest:
        key = (item.get("country_code"), item.get("route_code"))
        if key not in rankable_keys:
            errors.append(
                f"portfolio_summary.strongest_routes contains non-rankable route {key}."
            )
        else:
            actual = next(s for c, r, s in rankable if (c, r) == key)
            if item.get("practical_fit_score") != actual:
                errors.append(
                    f"portfolio_summary practical_fit_score for {key} must be {actual}."
                )

    blocked_keys = {(x.get("country_code"), x.get("route_code")) for x in summary.get("blocked_routes", [])}
    for route in routes:
        status = route.get("official_eligibility", {}).get("status")
        key = (route.get("country", {}).get("code"), route.get("route", {}).get("code"))
        if status == "FAIL" and key not in blocked_keys:
            warnings.append(f"{key}: FAIL route is not listed in portfolio_summary.blocked_routes.")

    return errors, warnings

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--schema", type=Path, default=None)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    data = load_json(args.file)
    schema_path = args.schema or (
        Path(__file__).resolve().parents[1] / "references" / "scorecard_schema.json"
    )

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

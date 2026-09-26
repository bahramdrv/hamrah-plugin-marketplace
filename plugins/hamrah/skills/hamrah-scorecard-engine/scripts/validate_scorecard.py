#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from freshness import assess_freshness, load_policy as load_freshness_policy, parse_iso
from source_authority import classify_source, load_policy

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

def official_source_errors(route, country_code, route_code, status, usable, label, authority_policy, reference_date, freshness_policy):
    errors = []
    eligibility = route.get("official_eligibility", {})
    checked = []
    classified = []
    has_unknown_authority = False
    for req in eligibility.get("reasons", []):
        req_label = f"{label}: requirement {req.get('requirement_id')!r}"
        authority = classify_source(req, country_code, route_code, authority_policy, reference_date, freshness_policy)
        if req.get("source_authority") != authority:
            errors.append(f"{req_label}: source_authority must match versioned source classification {authority}.")
        decisive = req.get("result") in {"met", "not_met"}
        if decisive:
            checked.append(req)
            if not req.get("source_url"):
                errors.append(f"{req_label}: checked requirement has no source_url.")
            if authority["classification"] not in {"primary", "trusted"}:
                errors.append(f"{req_label}: source authority is unknown or out of scope; result must remain unverified.")
            for field in ("claim_type", "checked_at", "retrieved_at", "effective_from"):
                if not req.get(field):
                    errors.append(f"{req_label}: checked requirement needs {field}.")
        if authority["classification"] == "unknown" and req.get("result") != "not_applicable":
            has_unknown_authority = True
        classified.append((req, authority["classification"]))

    # A primary check decides its requirement, overriding other checks of it (such as a contradicting
    # Visa Atlas record). A decisive requirement with only trusted checks awaits official confirmation.
    decisive = [(req, kind) for req, kind in classified if req.get("result") in {"met", "not_met"}]
    confirmed = {req.get("requirement_id") for req, kind in decisive if kind == "primary"}
    awaiting = [req for req, kind in decisive if kind == "trusted" and req.get("requirement_id") not in confirmed]
    effective = [
        req for req, kind in classified
        if req.get("result") != "not_applicable" and (req.get("requirement_id") not in confirmed or kind == "primary")
    ]
    awaiting_ids = {req.get("requirement_id") for req in awaiting}
    if status in {"PASS", "FAIL"}:
        if eligibility.get("assessment_kind") != "official":
            errors.append(f"{label}: decisive eligibility needs assessment_kind='official'.")
        if not checked:
            errors.append(f"{label}: decisive eligibility needs a checked authoritative requirement.")
        if has_unknown_authority:
            errors.append(f"{label}: unknown source authority cannot establish official {status}.")
        if status == "PASS":
            for requirement_id in sorted(awaiting_ids, key=str):
                errors.append(
                    f"{label}: requirement {requirement_id!r} rests only on trusted Visa Atlas evidence and is awaiting "
                    "official confirmation at a primary source; it cannot establish official PASS."
                )
        if status == "PASS" and any(req.get("result") == "not_met" for req in effective):
            errors.append(f"{label}: PASS conflicts with a not_met requirement.")
        if status == "PASS" and (
            eligibility.get("missing_requirements")
            or any(req.get("result") == "unknown" for req in effective)
        ):
            errors.append(f"{label}: PASS cannot leave mandatory requirements unverified.")
        if status == "FAIL" and not any(
            req.get("result") == "not_met" and req.get("requirement_id") in confirmed for req in effective
        ):
            errors.append(f"{label}: FAIL needs a not_met requirement confirmed at a primary official source.")
    elif has_unknown_authority and eligibility.get("assessment_kind") != "provisional":
        errors.append(f"{label}: unknown source authority requires a provisional assessment.")
    elif awaiting_ids and not has_unknown_authority:
        if eligibility.get("assessment_kind") != "awaiting_official_confirmation":
            errors.append(f"{label}: a decisive requirement with only trusted authority needs assessment_kind='awaiting_official_confirmation'.")
        listed = eligibility.get("awaiting_official_confirmation")
        listed = listed if isinstance(listed, list) else []
        for req in awaiting:
            if req.get("title") not in listed:
                errors.append(f"{label}: requirement {req.get('requirement_id')!r} must be listed in awaiting_official_confirmation.")
    if eligibility.get("assessment_kind") == "awaiting_official_confirmation" and not awaiting_ids:
        errors.append(f"{label}: assessment_kind 'awaiting_official_confirmation' needs a decisive requirement with only trusted authority.")
    if has_unknown_authority and usable:
        errors.append(f"{label}: provisional assessment with unknown source authority cannot be ranked.")

    return errors

REQUIREMENT_DATE_FIELDS = {
    "checked_at": (True, True),
    "retrieved_at": (False, True),
    "published_at": (True, True),
    "effective_from": (True, False),
    "effective_until": (True, False),
    "verified_at": (True, True),
}
OBSERVATION_DATE_FIELDS = ("checked_at", "retrieved_at", "published_at", "verified_at")


def iso_kind(allow_date, allow_date_time):
    return " or ".join(kind for kind, allowed in (("date", allow_date), ("date-time", allow_date_time)) if allowed)


def date_error(label, field, value, allow_date=True, allow_date_time=True):
    if value is None or parse_iso(value, allow_date, allow_date_time):
        return None
    return f"{label}: {field} is not a valid ISO {iso_kind(allow_date, allow_date_time)}."


def requirement_freshness(route, reference_date, usable, label, freshness_policy):
    errors, warnings = [], []
    eligibility = route.get("official_eligibility", {})
    blocking = []
    for req in eligibility.get("reasons", []):
        req_label = f"{label}: requirement {req.get('requirement_id')!r}"
        dates = {}
        for field, kinds in REQUIREMENT_DATE_FIELDS.items():
            error = date_error(req_label, field, req.get(field), *kinds)
            if error:
                errors.append(error)
            else:
                dates[field] = parse_iso(req.get(field), *kinds)
        if dates.get("effective_from") and dates.get("effective_until") and dates["effective_until"] < dates["effective_from"]:
            errors.append(f"{req_label}: effective_until is before effective_from.")
        for field in OBSERVATION_DATE_FIELDS:
            if reference_date and dates.get(field) and dates[field] > reference_date:
                errors.append(f"{req_label}: {field} is after generated_at.")

        expected = assess_freshness(req, reference_date, freshness_policy)
        if req.get("freshness") != expected:
            errors.append(f"{req_label}: freshness must match versioned freshness policy {expected}.")
        if req.get("result") not in {"met", "not_met"}:
            continue
        if reference_date and dates.get("effective_from") and dates["effective_from"] > reference_date:
            errors.append(f"{req_label}: effective_from is after generated_at; a decisive requirement cannot cite a rule not yet in effect.")
        if expected["status"] == "stale":
            blocking.append((req.get("requirement_id"), "stale_decisive_requirement"))
            if usable:
                errors.append(f"{req_label}: stale decisive requirement cannot be ranked.")
        elif expected["status"] == "unknown":
            blocking.append((req.get("requirement_id"), "unknown_freshness"))
            if usable:
                errors.append(f"{req_label}: decisive requirement with unknown freshness cannot be ranked.")
        elif expected["status"] == "aging":
            warnings.append(f"{req_label}: decisive requirement is aging ({expected['age_days']} of {expected['max_age_days']} days); re-verify before relying on it.")

    blockers = [b for b in route.get("practical_fit", {}).get("ranking_blockers", []) if isinstance(b, dict)]
    if usable and blockers:
        errors.append(f"{label}: rankable route cannot list ranking_blockers.")
    for requirement_id, code in blocking:
        if not any(b.get("requirement_id") == requirement_id and b.get("code") == code and b.get("reason") for b in blockers):
            errors.append(f"{label}: requirement {requirement_id!r} needs a ranking_blockers entry with code {code!r} and a reason.")
    if blocking and eligibility.get("official_data_quality", {}).get("status") == "current":
        errors.append(f"{label}: official_data_quality.status cannot be 'current' with a stale or undated decisive requirement.")
    return errors, warnings


def semantic_validate(data):
    errors, warnings = [], []
    authority_policy = load_policy()
    freshness_policy = load_freshness_policy()

    reference_date = parse_iso(data.get("generated_at"), allow_date=False)
    if not reference_date:
        errors.append("generated_at is not a valid ISO date-time.")
    profile_date_error = date_error(
        "applicant_profile_reference", "profile_generated_at",
        data.get("applicant_profile_reference", {}).get("profile_generated_at"), allow_date=False,
    )
    if profile_date_error:
        errors.append(profile_date_error)

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
        as_of_error = date_error(f"{label}: official_data_quality", "as_of", dq.get("as_of"))
        if as_of_error:
            errors.append(as_of_error)
        if dq.get("status") == "missing" and route.get("confidence", {}).get("level") == "high":
            errors.append(f"{label}: missing official data cannot have high confidence.")

        errors.extend(official_source_errors(
            route, country_code, route_code, status, usable, label, authority_policy, reference_date, freshness_policy
        ))
        freshness_errors, freshness_warnings = requirement_freshness(route, reference_date, usable, label, freshness_policy)
        errors.extend(freshness_errors)
        warnings.extend(freshness_warnings)

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

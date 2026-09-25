"""ISO date validation and versioned, fact-type freshness assessment for scorecards."""

import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

POLICY_PATH = Path(__file__).resolve().parents[1] / "references" / "freshness_policy.json"
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
DATE_TIME_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})")


def load_policy(path=POLICY_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def parse_iso(value, allow_date=True, allow_date_time=True):
    """Return the UTC calendar date of a strict ISO date or zoned date-time, or None if invalid."""
    if not isinstance(value, str):
        return None
    try:
        if allow_date and DATE_PATTERN.fullmatch(value):
            return date.fromisoformat(value)
        if allow_date_time and DATE_TIME_PATTERN.fullmatch(value):
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).date()
    except ValueError:
        return None
    return None


def assess_freshness(requirement, reference_date, policy):
    fact_type = requirement.get("fact_type")
    rule = policy["fact_types"].get(fact_type) if isinstance(fact_type, str) else None
    retrieved = parse_iso(requirement.get("retrieved_at"), allow_date=False)
    age_days = (reference_date - retrieved).days if retrieved and reference_date else None
    result = {
        "policy_version": policy["policy_version"],
        "fact_type": requirement.get("fact_type"),
        "status": "unknown",
        "age_days": age_days,
        "max_age_days": rule["max_age_days"] if rule else None,
    }
    if rule is None or age_days is None:
        return result
    effective_until = parse_iso(requirement.get("effective_until"), allow_date_time=False)
    if age_days > rule["max_age_days"] or (effective_until and effective_until < reference_date):
        result["status"] = "stale"
    elif age_days > rule["aging_after_days"]:
        result["status"] = "aging"
    else:
        result["status"] = "current"
    return result

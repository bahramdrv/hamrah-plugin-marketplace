"""Versioned, claim-scoped source authority classification for scorecards."""

import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

from freshness import assess_freshness, parse_iso

POLICY_PATH = Path(__file__).resolve().parents[1] / "references" / "source_authority_policy.json"


def load_policy(path=POLICY_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def safe_path(path):
    """Reject empty inner segments and dot segments, which could walk a path out of a rule's prefix."""
    segments = path.split("/")[1:]
    return all(
        segment not in {".", ".."} and (segment != "" or index == len(segments) - 1)
        for index, segment in enumerate(segments)
    )


def parse_source_url(raw_url):
    if not isinstance(raw_url, str):
        return None
    try:
        url = urlsplit(raw_url)
        host = url.hostname
        if url.scheme != "https" or not host or url.username or url.password or url.port or url.query or url.fragment:
            return None
        source_path = unquote(url.path)
    except ValueError:
        return None
    if not safe_path(source_path):
        return None
    return host.lower(), source_path


def government_link_on_other_host(requirement, source_host, _reference_date, _freshness_policy):
    government = parse_source_url(requirement.get("government_source_url"))
    return government is not None and government[0] != source_host


def verified_within_freshness(requirement, _source_host, reference_date, freshness_policy):
    """Age the verification date like a retrieval date; a plain date counts from the start of that UTC day."""
    verified_at = requirement.get("verified_at")
    if parse_iso(verified_at, allow_date_time=False):
        verified_at = f"{verified_at}T00:00:00Z"
    freshness = assess_freshness(
        {"fact_type": requirement.get("fact_type"), "retrieved_at": verified_at, "effective_until": requirement.get("effective_until")},
        reference_date,
        freshness_policy,
    )
    return freshness["status"] in {"current", "aging"} and freshness["age_days"] >= 0


CONDITIONS = {
    "government_source_url": government_link_on_other_host,
    "verified_at_within_freshness": verified_within_freshness,
}


def matches_exact(rule, requirement, country_code, route_code, host, source_path):
    return (
        requirement.get("claim_type") == rule["claim_type"]
        and requirement.get("requirement_id") == rule["requirement_id"]
        and requirement.get("title") == rule["claim_title"]
        and requirement.get("explanation") == rule["result_explanations"].get(requirement.get("result"))
        and country_code == rule["country_code"]
        and route_code == rule["route_code"]
        and host == rule["source_host"]
        and source_path == rule["source_path"]
    )


def matches_host_path_prefix(rule, requirement, country_code, _route_code, host, source_path):
    return (
        requirement.get("claim_type") in rule["claim_types"]
        and rule["country_code"] in {"*", country_code}
        and host == rule["source_host"]
        and source_path.startswith(rule["source_path_prefix"])
    )


MATCHERS = {"exact": matches_exact, "host_path_prefix": matches_host_path_prefix}


def classify_source(requirement, country_code, route_code, policy, reference_date, freshness_policy):
    """Classify one requirement against the policy; the first matching rule decides, and its `requires`
    conditions must hold. `reference_date` is the scorecard's generated_at UTC date."""
    unknown = {
        "policy_version": policy["policy_version"],
        "classification": "unknown",
        "rule_id": None,
    }
    source = parse_source_url(requirement.get("source_url"))
    if source is None:
        return unknown
    host, source_path = source
    rule = next(
        (
            candidate
            for candidate in policy["rules"]
            if candidate.get("match") in MATCHERS
            and MATCHERS[candidate["match"]](candidate, requirement, country_code, route_code, host, source_path)
        ),
        None,
    )
    if rule is None or not all(
        name in CONDITIONS and CONDITIONS[name](requirement, host, reference_date, freshness_policy)
        for name in rule.get("requires", [])
    ):
        return unknown
    return {
        "policy_version": policy["policy_version"],
        "classification": rule["classification"],
        "rule_id": rule["rule_id"],
    }

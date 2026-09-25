"""Versioned, claim-scoped source authority classification for scorecards."""

import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

POLICY_PATH = Path(__file__).resolve().parents[1] / "references" / "source_authority_policy.json"


def load_policy(path=POLICY_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def classify_source(requirement, country_code, route_code, policy):
    unknown = {
        "policy_version": policy["policy_version"],
        "classification": "unknown",
        "rule_id": None,
    }
    raw_url = requirement.get("source_url")
    if not isinstance(raw_url, str):
        return unknown
    try:
        url = urlsplit(raw_url)
        host = url.hostname
        if url.scheme != "https" or not host or url.username or url.password or url.port or url.query or url.fragment:
            return unknown
        source_path = unquote(url.path)
    except ValueError:
        return unknown
    for rule in policy["rules"]:
        if (
            requirement.get("claim_type") == rule["claim_type"]
            and requirement.get("requirement_id") == rule["requirement_id"]
            and requirement.get("title") == rule["claim_title"]
            and requirement.get("explanation") == rule["result_explanations"].get(requirement.get("result"))
            and country_code == rule["country_code"]
            and route_code == rule["route_code"]
            and host.lower() == rule["source_host"]
            and source_path == rule["source_path"]
        ):
            return {
                "policy_version": policy["policy_version"],
                "classification": rule["classification"],
                "rule_id": rule["rule_id"],
            }
    return unknown

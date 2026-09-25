import subprocess
import sys
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_scorecard.py"
FIXTURES = ROOT / "tests" / "fixtures"

def run(name):
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(FIXTURES / name)],
        text=True,
        capture_output=True,
    )

def test_valid_scorecard_passes():
    result = run("valid_strong.json")
    assert result.returncode == 0, result.stderr

def test_positive_community_adjustment_fails():
    result = run("invalid_positive_community.json")
    assert result.returncode != 0
    assert "community adjustment must be one of" in result.stderr

def test_failed_route_cannot_be_ranked():
    result = run("invalid_fail_ranked.json")
    assert result.returncode != 0
    assert "FAIL route cannot be usable_for_ranking" in result.stderr

def test_practical_fit_formula_is_enforced():
    result = run("invalid_formula.json")
    assert result.returncode != 0
    assert "practical_fit.score must equal base_fit.score + community_adjustment.total" in result.stderr


def validate_variant(change):
    data = json.loads((FIXTURES / "valid_strong.json").read_text(encoding="utf-8"))
    change(data)
    with tempfile.TemporaryDirectory() as directory:
        candidate = Path(directory) / "scorecard.json"
        candidate.write_text(json.dumps(data), encoding="utf-8")
        return subprocess.run([sys.executable, str(VALIDATOR), str(candidate)], text=True, capture_output=True)


def test_decisive_requirement_needs_real_scoped_source():
    cases = [
        (lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(source_url=None), "source_url"),
        (lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(source_url="https://example.gov/route"), "source authority"),
        (lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(claim_type="university_admission"), "source authority"),
    ]
    for change, message in cases:
        result = validate_variant(change)
        assert result.returncode != 0, result.stderr
        assert message in result.stderr


def test_unknown_source_is_provisional_not_official_pass():
    def change(data):
        route = data["route_scorecards"][0]
        route["official_eligibility"]["status"] = "POSSIBLE"
        route["official_eligibility"]["assessment_kind"] = "provisional"
        requirement = route["official_eligibility"]["reasons"][0]
        requirement["result"] = "unknown"
        requirement["source_url"] = "https://unknown.example.org/admissions"
        requirement["source_authority"] = {"policy_version": "1.0.0", "classification": "unknown", "rule_id": None}
        route["practical_fit"]["usable_for_ranking"] = False
        data["portfolio_summary"]["viable_route_count"] = 0
        data["portfolio_summary"]["strongest_routes"] = []
    result = validate_variant(change)
    assert result.returncode == 0, result.stderr


def test_source_authority_metadata_and_dates_are_required():
    def spoof(data):
        requirement = data["route_scorecards"][0]["official_eligibility"]["reasons"][0]
        requirement["source_authority"]["rule_id"] = "invented-rule"
        requirement["retrieved_at"] = None
        requirement["effective_from"] = None
    result = validate_variant(spoof)
    assert result.returncode != 0
    assert "source_authority must match" in result.stderr
    assert "needs retrieved_at" in result.stderr
    assert "needs effective_from" in result.stderr


def test_authority_is_tied_to_exact_route_claim_and_url():
    for change in (
        lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(requirement_id="unrelated-requirement"),
        lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(title="University tuition is guaranteed"),
        lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(explanation="University tuition is guaranteed"),
        lambda data: data["route_scorecards"][0]["route"].update(code="unrelated-route"),
        lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(source_url="https://www.gesetze-im-internet.de/aufenthg_2004/__20b.html"),
        lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(source_url="https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html////////"),
        lambda data: data["route_scorecards"][0]["official_eligibility"]["reasons"][0].update(source_url="https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html?override=1"),
    ):
        result = validate_variant(change)
        assert result.returncode != 0, result.stderr
        assert "source authority" in result.stderr


def requirement_of(data):
    return data["route_scorecards"][0]["official_eligibility"]["reasons"][0]


def retrieved_days_before_generation(days):
    from datetime import date, timedelta
    return (date(2026, 9, 11) - timedelta(days=days)).isoformat() + "T00:00:00Z"


def freshness(status, age_days, max_age_days=365, fact_type="financial_requirement"):
    return {"policy_version": "1.0.0", "fact_type": fact_type, "status": status, "age_days": age_days, "max_age_days": max_age_days}


def block_ranking(data, requirement_id, code, reason):
    route = data["route_scorecards"][0]
    route["practical_fit"]["usable_for_ranking"] = False
    route["practical_fit"]["ranking_blockers"] = [{"requirement_id": requirement_id, "code": code, "reason": reason}]
    route["official_eligibility"]["official_data_quality"]["status"] = "stale"
    route["confidence"]["level"] = "low"
    data["portfolio_summary"]["viable_route_count"] = 0
    data["portfolio_summary"]["strongest_routes"] = []


def test_impossible_or_malformed_dates_are_rejected():
    cases = [
        lambda data: requirement_of(data).update(checked_at="2026-02-30"),
        lambda data: requirement_of(data).update(retrieved_at="2026-13-01T00:00:00Z"),
        lambda data: requirement_of(data).update(retrieved_at="2026-09-11T00:00:00"),
        lambda data: requirement_of(data).update(effective_from="2025-02-29"),
        lambda data: requirement_of(data).update(effective_until="2026-9-30"),
        lambda data: data.update(generated_at="2026-09-31T00:00:00Z"),
        lambda data: data["route_scorecards"][0]["official_eligibility"]["official_data_quality"].update(as_of="2026-04-31"),
    ]
    for change in cases:
        result = validate_variant(change)
        assert result.returncode != 0, result.stderr
        assert "is not a valid ISO" in result.stderr


def test_inconsistent_effective_period_and_future_retrieval_are_rejected():
    result = validate_variant(lambda data: requirement_of(data).update(effective_from="2026-06-01", effective_until="2026-05-31"))
    assert result.returncode != 0
    assert "effective_until is before effective_from" in result.stderr

    result = validate_variant(lambda data: requirement_of(data).update(retrieved_at="2026-09-12T00:00:00Z", checked_at="2026-09-12"))
    assert result.returncode != 0
    assert "retrieved_at is after generated_at" in result.stderr
    assert "checked_at is after generated_at" in result.stderr


def test_fresh_and_aging_decisive_requirements_remain_rankable():
    for age, status in ((0, "current"), (180, "current"), (181, "aging"), (365, "aging")):
        def change(data, age=age, status=status):
            requirement_of(data).update(retrieved_at=retrieved_days_before_generation(age), freshness=freshness(status, age))
        result = validate_variant(change)
        assert result.returncode == 0, (age, result.stderr)
        if status == "aging":
            assert "aging" in result.stderr


def test_stale_decisive_requirement_blocks_ranking():
    def stale_but_ranked(data):
        requirement_of(data).update(retrieved_at=retrieved_days_before_generation(366), freshness=freshness("stale", 366))
    result = validate_variant(stale_but_ranked)
    assert result.returncode != 0
    assert "stale decisive requirement cannot be ranked" in result.stderr
    assert "official_data_quality.status cannot be 'current'" in result.stderr

    def stale_and_blocked(data):
        stale_but_ranked(data)
        block_ranking(data, "opportunity_card_secured_livelihood", "stale_decisive_requirement",
                      "Secured livelihood amount was retrieved 366 days ago; financial requirements expire after 365 days.")
    result = validate_variant(stale_and_blocked)
    assert result.returncode == 0, result.stderr

    def blocked_without_reason(data):
        stale_and_blocked(data)
        data["route_scorecards"][0]["practical_fit"]["ranking_blockers"] = []
    result = validate_variant(blocked_without_reason)
    assert result.returncode != 0
    assert "needs a ranking_blockers entry" in result.stderr


def test_expired_effective_period_is_stale():
    def change(data):
        requirement_of(data).update(effective_until="2026-09-10", freshness=freshness("stale", 0))
        block_ranking(data, "opportunity_card_secured_livelihood", "stale_decisive_requirement", "The cited rule stopped applying on 2026-09-10.")
    result = validate_variant(change)
    assert result.returncode == 0, result.stderr


def test_freshness_must_match_versioned_policy():
    def spoof(data):
        requirement_of(data).update(retrieved_at=retrieved_days_before_generation(400), freshness=freshness("current", 0))
    result = validate_variant(spoof)
    assert result.returncode != 0
    assert "freshness must match versioned freshness policy" in result.stderr


def test_missing_date_or_unknown_fact_type_is_not_silently_current():
    def missing_date_claimed_current(data):
        route = data["route_scorecards"][0]
        route["official_eligibility"]["status"] = "POSSIBLE"
        route["official_eligibility"]["assessment_kind"] = "provisional"
        requirement_of(data).update(result="unknown", retrieved_at=None, checked_at=None, freshness=freshness("current", 0),
                                    source_authority={"policy_version": "1.0.0", "classification": "unknown", "rule_id": None})
        route["official_eligibility"]["missing_requirements"] = ["Secured livelihood evidence was not reviewed."]
        route["practical_fit"]["usable_for_ranking"] = False
        route["confidence"]["level"] = "medium"
        data["portfolio_summary"]["viable_route_count"] = 0
        data["portfolio_summary"]["strongest_routes"] = []
    result = validate_variant(missing_date_claimed_current)
    assert result.returncode != 0
    assert "freshness must match" in result.stderr

    def missing_date_reported_unknown(data):
        missing_date_claimed_current(data)
        requirement_of(data)["freshness"] = freshness("unknown", None)
    result = validate_variant(missing_date_reported_unknown)
    assert result.returncode == 0, result.stderr

    def unknown_fact_type_ranked(data):
        requirement_of(data).update(fact_type="unreviewed_fact", freshness=freshness("unknown", 0, None, "unreviewed_fact"))
    result = validate_variant(unknown_fact_type_ranked)
    assert result.returncode != 0
    assert "decisive requirement with unknown freshness cannot be ranked" in result.stderr


def test_decisive_requirement_cannot_cite_rule_not_yet_in_effect():
    result = validate_variant(lambda data: requirement_of(data).update(effective_from="2026-09-12"))
    assert result.returncode != 0
    assert "effective_from is after generated_at" in result.stderr


def test_malformed_freshness_inputs_are_reported_not_crashed():
    def change(data):
        requirement_of(data)["fact_type"] = ["fee"]
        data["route_scorecards"][0]["practical_fit"]["ranking_blockers"] = ["stale"]
    result = validate_variant(change)
    assert result.returncode == 1
    assert "Traceback" not in result.stderr

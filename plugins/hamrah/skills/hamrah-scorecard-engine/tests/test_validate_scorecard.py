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

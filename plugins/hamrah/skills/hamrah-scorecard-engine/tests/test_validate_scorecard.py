import subprocess
import sys
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

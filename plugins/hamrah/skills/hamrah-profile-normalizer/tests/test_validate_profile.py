import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_profile.py"
FIXTURES = ROOT / "tests" / "fixtures"

def run(name):
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(FIXTURES / name)],
        text=True,
        capture_output=True,
    )

def test_valid_academic_profile_passes():
    result = run("valid_academic_profile.json")
    assert result.returncode == 0, result.stderr

def test_ready_profile_with_critical_missing_fails():
    result = run("invalid_ready_with_critical_missing.json")
    assert result.returncode != 0
    assert "ready_for_initial_screening cannot have critical missing information" in result.stderr

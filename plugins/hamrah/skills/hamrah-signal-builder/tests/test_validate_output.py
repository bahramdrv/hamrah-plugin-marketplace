import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_output.py"
FIXTURES = ROOT / "tests" / "fixtures"


def run(name):
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(FIXTURES / name)],
        text=True,
        capture_output=True,
    )


def test_valid_gold_standard_passes():
    result = run("valid_gold_standard.json")
    assert result.returncode == 0, result.stderr


def test_resolved_signal_with_penalty_fails():
    result = run("invalid_resolved_penalty.json")
    assert result.returncode != 0
    assert "resolved/historical signals must have adjustment 0" in result.stderr

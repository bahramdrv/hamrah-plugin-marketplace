import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_program_matches.py"


def example_match():
    return {
        "schema_version": "2.0",
        "generated_at": "2026-09-27T12:00:00Z",
        "profile_reference": {
            "kind": "minimal",
            "fields_used": ["country", "degree_level", "field"],
            "missing_information": ["language evidence"],
        },
        "search_scope": {"country": "DE", "degree_level": "phd", "field": "artificial intelligence"},
        "programs": [
            {
                "program_id": "example-phd-ai",
                "institution": "Example University",
                "country": "DE",
                "program_title": "PhD in Artificial Intelligence",
                "degree_level": "phd",
                "field": "artificial intelligence",
                "official_program_url": "https://example.edu/phd-ai",
                "match_status": "conditional_fit",
                "match_reasons": [
                    {"reason": "Research topic overlaps the requested field", "source_urls": ["https://example.edu/phd-ai"]}
                ],
                "gaps": ["Language evidence is missing", "Deadline is unknown", "Funding is unknown"],
                "admissions": {
                    "requirements": [],
                    "deadline": {"status": "unknown", "date": None, "intake": None, "source_url": None},
                },
                "funding": {"status": "unknown", "details": None, "source_url": None},
                "affordability": {
                    "tuition": {"status": "unknown", "amount": None, "currency": None, "period": None, "source_url": None},
                    "notes": [],
                },
                "iranian_evidence": {"status": "unknown", "details": None, "source_url": None},
                "immigration_context": {"status": "not_assessed", "notes": None},
                "preference_match": {"status": "unknown", "reasons": []},
                "sources": [{"title": "Official program page", "url": "https://example.edu/phd-ai", "checked_at": "2026-09-27"}],
                "checked_at": "2026-09-27",
            }
        ],
        "warnings": [],
    }


def validate(tmp_path, data):
    output = tmp_path / "program_matches.json"
    output.write_text(json.dumps(data), encoding="utf-8")
    return subprocess.run([sys.executable, str(VALIDATOR), str(output)], capture_output=True, text=True)


def test_minimal_profile_with_unknown_deadline_and_funding_is_valid(tmp_path):
    result = validate(tmp_path, example_match())
    assert result.returncode == 0, result.stderr


def test_verified_funding_requires_a_source(tmp_path):
    data = example_match()
    data["programs"][0]["funding"] = {"status": "verified", "details": "Full stipend", "source_url": None}
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "funding.source_url" in result.stderr


def test_explicit_iranian_restriction_requires_a_source(tmp_path):
    data = example_match()
    data["programs"][0]["iranian_evidence"] = {"status": "explicit_restriction", "details": "Restricted", "source_url": None}
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "iranian_evidence.source_url" in result.stderr


def test_unknown_deadline_cannot_carry_a_date(tmp_path):
    data = example_match()
    data["programs"][0]["admissions"]["deadline"]["date"] = "2027-01-01"
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "admissions.deadline.date" in result.stderr


def test_claim_source_must_appear_in_program_sources(tmp_path):
    data = example_match()
    data["programs"][0]["funding"] = {
        "status": "competitive",
        "details": "Scholarship competition",
        "source_url": "https://example.edu/scholarships",
    }
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "funding.source_url" in result.stderr


def test_verified_tuition_requires_a_source(tmp_path):
    data = example_match()
    data["programs"][0]["affordability"]["tuition"] = {
        "status": "verified", "amount": 500, "currency": "EUR", "period": "semester", "source_url": None,
    }
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "affordability.tuition.source_url" in result.stderr


def test_program_country_and_degree_must_match_search_scope(tmp_path):
    data = example_match()
    data["programs"][0]["country"] = "NL"
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "country" in result.stderr


def test_source_linked_program_facts_are_valid(tmp_path):
    data = example_match()
    program = data["programs"][0]
    program["admissions"]["deadline"] = {
        "status": "verified", "date": "2027-01-15", "intake": "2027 fall",
        "source_url": "https://example.edu/admissions",
    }
    program["affordability"]["tuition"] = {
        "status": "verified", "amount": 500, "currency": "EUR", "period": "semester",
        "source_url": "https://example.edu/fees",
    }
    program["funding"] = {
        "status": "competitive", "details": "Merit scholarship competition",
        "source_url": "https://example.edu/scholarships",
    }
    program["iranian_evidence"] = {
        "status": "explicit_permission", "details": "The university lists Iranian applicants",
        "source_url": "https://example.edu/international-admissions",
    }
    for label, url in (
        ("Admissions", "https://example.edu/admissions"),
        ("Fees", "https://example.edu/fees"),
        ("Scholarships", "https://example.edu/scholarships"),
        ("International admissions", "https://example.edu/international-admissions"),
    ):
        program["sources"].append({"title": label, "url": url, "checked_at": "2026-09-27"})
    result = validate(tmp_path, data)
    assert result.returncode == 0, result.stderr


def test_match_reason_and_admission_requirement_need_listed_sources(tmp_path):
    data = example_match()
    program = data["programs"][0]
    program["match_reasons"][0]["source_urls"] = ["https://example.edu/unlisted"]
    program["admissions"]["requirements"] = [
        {"criterion": "Language B2", "source_url": "https://example.edu/unlisted"}
    ]
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "match_reasons.0.source_urls" in result.stderr
    assert "admissions.requirements.0.source_url" in result.stderr


def test_officially_tuition_free_program_needs_no_currency(tmp_path):
    data = example_match()
    data["programs"][0]["affordability"]["tuition"] = {
        "status": "none", "amount": 0, "currency": None, "period": None,
        "source_url": "https://example.edu/phd-ai",
    }
    result = validate(tmp_path, data)
    assert result.returncode == 0, result.stderr


def test_malformed_source_reports_validation_error_without_crashing(tmp_path):
    data = example_match()
    data["programs"][0]["sources"][0]["url"] = []
    result = validate(tmp_path, data)
    assert result.returncode == 1
    assert "sources.0.url" in result.stderr
    assert "Traceback" not in result.stderr

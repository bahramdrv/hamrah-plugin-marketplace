#!/usr/bin/env python3
"""Create a retrieval-friendly compact signal file from a full Visa Atlas signal dataset."""

from __future__ import annotations
import argparse
import json
from pathlib import Path


KEEP = [
    "signal_id", "root_cause_id", "correlated_signal_ids", "title",
    "signal_family", "signal_type", "signal_class", "impact_direction",
    "status", "trend", "severity", "confidence", "destination",
    "applicant_scope", "migration_routes", "migration_route_family",
    "process_stages", "entities", "summary_en", "summary_fa",
    "practical_impact", "who_should_care", "recommended_action",
    "known_workaround", "first_seen", "last_seen", "last_verified",
    "recency_class", "officially_confirmed", "community_confirmed",
    "official_verification", "suggested_fit_adjustment",
    "conditional_adjustment", "reason_for_adjustment", "keywords",
    "needs_recheck", "suggested_recheck_date",
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path, nargs="?")
    args = p.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    compact = {
        "schema_version": data.get("schema_version"),
        "generated_at": data.get("generated_at"),
        "source_coverage": data.get("source_coverage", []),
        "summary": data.get("summary", {}),
        "signals": [
            {k: s.get(k) for k in KEEP if k in s}
            for s in data.get("signals", [])
        ],
        "watchlist": data.get("watchlist", []),
    }

    output = args.output or args.input.with_name(
        args.input.stem + "_compact.json"
    )
    output.write_text(json.dumps(compact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()

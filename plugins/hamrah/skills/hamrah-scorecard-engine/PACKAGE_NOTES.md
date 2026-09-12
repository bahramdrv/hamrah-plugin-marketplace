# Hamrah Scorecard Engine — Package Notes

Purpose:
Generate explainable route-by-route immigration scorecards from:

1. normalized Hamrah applicant profile
2. current official route data
3. applicable Community Signals

Layers:
- Official Eligibility
- Base Fit
- Community Adjustment
- Practical Fit
- Confidence

Important:
- Community Signals never override official eligibility.
- Community adjustment is downside-only.
- Preferences and university matching are outside this skill.
- Scores are not approval probabilities.

Default output:
`hamrah_scorecard.json`

Validation:
`python scripts/validate_scorecard.py hamrah_scorecard.json`

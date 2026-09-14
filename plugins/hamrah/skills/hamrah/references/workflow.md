# Hamrah workflow

## Route the request

Choose one entry point before asking questions:

1. **Community evidence:** for Telegram JSON, forum exports, posts, emails, URLs, or similar material, run Hamrah Signal Builder, validate the dataset, and offer local persistence. Applicant intake starts only when requested.
2. **Applicant journey:** a facilitator or applicant wants guidance, route assessment, or a scorecard. Continue through the stages below.
3. **Existing artifact:** validate a supplied profile, state, scorecard, academic-match file, or stored signal catalog and resume from the earliest incomplete stage.

## Applicant journey

### 1. Orient

Identify whether the speaker is the applicant or a facilitator and establish the goal when unclear. Explain the next stage briefly. Completion: actor and assessment goal are known.

### 2. Intake and normalize

Read all supplied case material before asking. Use Hamrah Profile Normalizer after meaningful information arrives. Default to one high-value question per turn, paired with a plain-language explanation and facilitator note when applicable. Collect feasibility facts, goals, preferences, and hard constraints without repeating known information. Completion: the profile is validated and ready for initial screening, or the single highest-value missing question is identified.

### 3. Screen current routes

Use the bundled Visa Atlas MCP tools and linked primary sources. Start with `getVisaAtlasCatalog` when dataset availability is uncertain, and use only the smallest relevant operation. Use `findMatchingVisaRoutes` only after the consent gate in `api_access.md`. Shortlist 3–5 plausible country/route combinations plus any route explicitly requested. Compare every mandatory condition with an explicit fact, unknown, or achievable dependency. Completion: every candidate has traceable sources and PASS, POSSIBLE, FAIL, or UNKNOWN.

### 4. Apply community context

Query the local signal store for each candidate and recheck applicability at signal level. Without a matching dataset, use adjustment 0 and label coverage unavailable; this is not evidence of zero friction. Completion: coverage status and applicable IDs are recorded for every candidate.

### 5. Score and explain

Run Hamrah Scorecard Engine and validate its JSON. Present rankable routes in the main ranking and requested blocked routes separately. Give reasons, blocker, confidence, and 1–3 next actions. Completion: validated JSON plus a readable facilitator/applicant explanation.

### 6. Optional next layers

- For study/research, offer Hamrah Program Finder when academic recommendations are requested.
- For a shareable visual, offer Hamrah Scorecard Visualizer. It uses ChatGPT image generation after validating the visual model.
- Offer profile/state export when the case must resume elsewhere.

Optional layers cannot rewrite validated immigration scores. Academic fit and preference remain separate from immigration feasibility.

## Updates

When facts, official rules, or signal datasets change, identify the earliest affected stage and recompute downstream outputs. Preserve source and check dates. Never reuse a stale scorecard as current.

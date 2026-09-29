# Hamrah workflow

## Route the request

Choose one entry point before asking questions:

For a facilitator's sample labelled as a product test, establish the feature under test from the request and recent context. Complete only that feature's acceptance slice and report what passed, failed, or remains untested. Continue the applicant journey only if the user asks to use the sample as a real case.

1. **Community evidence:** only when the user asks to analyze a specified Telegram JSON, forum export, post set, URL, or similar source for Community Signals, run Hamrah Signal Builder. Extract Questions from that same reviewed source in the same pass, validate the candidate dataset, and offer local persistence. Do not start a separate question-harvesting campaign from an unspecified source. Applicant intake starts only when requested.
2. **Applicant journey:** a facilitator or applicant wants guidance, route assessment, or a scorecard. Continue through the stages below.
3. **Existing artifact:** validate a supplied profile, state, scorecard, academic-match file, or stored signal catalog and resume from the earliest incomplete stage.
4. **Academic program request:** when the user explicitly asks for programs, go directly to Hamrah Program Finder. Use relevant profile facts if available and collect only missing facts that change the search; a route scorecard is optional.
5. **Open academic call request:** when the user explicitly asks for a current Master's or PhD admission/funding call, doctoral/postdoctoral vacancy, or research job, use `api_assisted_academic_calls.md`. Query available free API/feed leads and search live official pages. A previously published Academic Opportunity, API hit, or professor profile does not establish current availability. A route scorecard is optional.
6. **Professor or group request:** when the user explicitly asks whom to contact about a research topic, use `academic_supervisor_leads.md`. A research profile establishes an Academic Supervisor Lead, with recruitment and former Iranian-student evidence evaluated separately. A route scorecard is optional.

## Applicant journey

### 1. Orient

Identify whether the speaker is the applicant or a facilitator and establish the goal when unclear. Explain the next stage briefly. Completion: actor and assessment goal are known.

### 2. Intake and normalize

Read all supplied case material before asking. Use Hamrah Profile Normalizer after meaningful information arrives. Default to one high-value question per turn, paired with a plain-language explanation and facilitator note when applicable. Collect feasibility facts, goals, preferences, and hard constraints without repeating known information. Completion: the profile is validated and ready for initial screening, or the single highest-value missing question is identified.

### 3. Screen current routes

Use the bundled Visa Atlas MCP tools and linked primary sources. Start with `getVisaAtlasCatalog` when dataset availability is uncertain, and use only the smallest relevant operation. Use `findMatchingVisaRoutes` only after the consent gate in `api_access.md`. Shortlist 3–5 plausible country/route combinations plus any route explicitly requested. Compare every mandatory condition with an explicit fact, unknown, or achievable dependency. Completion: every candidate has traceable sources and PASS, POSSIBLE, FAIL, or UNKNOWN.

### 4. Apply community context

Call `searchCommunitySignals` for each candidate using the narrowest known destination, route, stage, topic, entity, and applicant scope. Then call `getCommunitySignalDataset` for the selected dataset and signal IDs before applying any adjustment. Recheck applicability at signal level. Without a matching valid dataset, use adjustment 0 and label coverage unavailable; this is not evidence of zero friction. Record coverage status, dataset ID, and applicable signal IDs for every candidate.

### 5. Score and explain

Run Hamrah Scorecard Engine and validate its JSON. Present rankable routes in the main ranking and requested blocked routes separately. Give reasons, blocker, confidence, and 1–3 next actions. Completion: validated JSON plus a readable facilitator/applicant explanation.

### 6. Optional next layers

- For study/research, use Hamrah Program Finder only when the user asks for academic recommendations. Until a user-selected program API is connected and working, search current official university and funding pages online for that request. When the user supplies an API and requests integration, add it to MCP and query it on demand. Keep discovery queries limited to needed search terms and compare personal profile facts within Hamrah. Do not build a persistent university or program catalog.
- For a requested current academic admission/funding call or research vacancy, use `api_assisted_academic_calls.md`; this search is distinct from matching a general admissions program and from the published Academic Opportunity store.
- For a requested professor or research-group shortlist, use `academic_supervisor_leads.md`; keep it separate from program and opening searches.
- Search for or curate a person who actually completed a route only when the user explicitly requests that work. A future automated search requires a separate user instruction.
- For a shareable visual, offer Hamrah Scorecard Visualizer. It uses ChatGPT image generation after validating the visual model.
- Offer profile/state export when the case must resume elsewhere.

Optional layers cannot rewrite validated immigration scores. Academic fit and preference remain separate from immigration feasibility.

## Updates

When facts, official rules, or signal datasets change, identify the earliest affected stage and recompute downstream outputs. Preserve source and check dates. Never reuse a stale scorecard as current.

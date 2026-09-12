# Hamrah Community Adjustment Rules

## Purpose

Community Signals capture real-world execution friction after official eligibility is evaluated.

They are a downside/risk layer only.

## Allowed total adjustment

Only:

- `0`
- `-5`
- `-10`
- `-15`
- `-20`

Never positive.

## Applicability

A signal should be applied only when its scope matches the applicant and route.

Check:

- destination
- route
- route family
- applicant nationality/origin/residence/applying-from
- process stage
- institution/employer/provider
- field/occupation
- time/recency
- conditional `apply_when`

If scope does not match, ignore the signal.

## Status handling

### active
Can contribute a penalty when applicable and sufficiently supported.

### monitoring
Normally `0`.
May justify a conditional caution but not a blanket current penalty.

### uncertain
Normally `0` unless product policy explicitly allows a conservative provisional adjustment; default Hamrah behavior is `0`.

### resolved
Always `0`.

### historical
Always `0`.

## Suggested penalty meaning

- `0`: no current material friction
- `-5`: moderate current friction
- `-10`: strong repeated friction
- `-15`: severe execution barrier
- `-20`: near-blocked in practice for the exact matched context

## One anecdote

A single anecdote should not create a route penalty.

Default:
- monitoring
- adjustment 0

## Correlated signals

Do not double count multiple signals caused by the same root problem.

Use:
- `root_cause_id`
- `correlated_signal_ids`

Example:
visa delay → employer reluctance → offer expiry

Do not blindly add all three.

The total Community Adjustment for a route is capped at `-20`.

## Positive evidence

Positive/resolution evidence may:
- remove an old penalty
- weaken a negative signal
- establish normalization
- provide a counterexample

It may not add positive score points.

## Official conflict

If community claims conflict with current official evidence:
- keep official eligibility based on official evidence;
- lower or remove the community penalty as appropriate;
- preserve the contradiction in the underlying Signal dataset.

## Applied signal record

For every applied signal include:
- `signal_id`
- `root_cause_id`
- `adjustment`
- `reason`
- `applicability`

`applicability`:
- `matched`
- `partial_match`

Ignored signals can be listed for audit, but are not required for every possible signal.

## Practical Fit

```text
Practical Fit = Base Fit + Community Adjustment
```

Minimum score is 0.

Community score is not an approval probability and not a legal eligibility score.

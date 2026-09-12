---
name: hamrah-scorecard-visualizer
description: Turn a validated Hamrah scorecard into a consistent, privacy-safe, shareable immigration scorecard image or SVG with the most important routes, reasons, blockers, and next actions.
---

# Hamrah Scorecard Visualizer

Use only after `hamrah-scorecard-engine` has produced a validated scorecard. Read `references/visual_contract.md`, create `hamrah_scorecard_visual.json`, and validate it with `scripts/render_scorecard_svg.py --check`.

The visual is a summary of the validated scorecard. Keep official eligibility, Base Fit, Community Adjustment, and Practical Fit distinct. Show at most three routes and three next actions. Use an anonymous case label; exclude names, contact details, government identifiers, application numbers, detailed medical/criminal facts, and raw community evidence.

Use the built-in ChatGPT image-generation skill/tool as the primary renderer. Build its exact prompt from the validated visual model using the `infographic-diagram` use case, generate a portrait card, inspect the output for text accuracy and score integrity, and iterate on one defect at a time. Return the generated image and state that ChatGPT image generation was used.

Generated text can drift. If two targeted generations still alter a score, status, route name, or Persian wording, use `scripts/render_scorecard_svg.py` as the accuracy fallback and disclose that the deterministic renderer was used. Never deliver a polished card with incorrect case data.

# Hamrah plugin marketplace

Hamrah guides facilitators and applicants through immigration intake, profile normalization, live Visa Atlas route assessment, reusable community signals, academic program matching, explainable scorecards, and scorecard visuals. The plugin now bundles a local MCP adapter for the curated Visa Atlas Core OpenAPI 1.3.0 contract.

## ChatGPT Web

Production MCP URL:

```text
https://hamrah-plugin-marketplace.vercel.app/mcp
```

In ChatGPT Web, enable Developer mode, add a new plugin/app with the URL above, and run **Scan Tools**. The server exposes 25 read-only tools and five importable Hamrah skills. The main imported skill also contains the scorecard-image workflow so ChatGPT can use its image-generation capability after validating a scorecard.

The remote service stores no applicant profiles. The optional route-finder sends only documented coarse fields to Visa Atlas after explicit consent.

## Install

```sh
codex plugin marketplace add bahramdrv/hamrah-plugin-marketplace --ref main
codex plugin add hamrah@hamrah-marketplace
```

Open a new Codex chat after installation and ask Hamrah to start a new case.

## Update

```sh
codex plugin marketplace upgrade hamrah-marketplace
codex plugin add hamrah@hamrah-marketplace
```

The Visa Atlas MCP adapter uses only fixed endpoints under `https://visaatlas.org/api/public`. It applies optional filters locally so large datasets do not flood the conversation. Generated applicant profiles and community-signal stores remain local unless the user explicitly publishes them. The Vercel project is connected to the GitHub repository for production updates.

The supplied OpenAPI currently lists `freshness`, `citation-packs`, and `answer-capsules`, but those endpoints returned HTTP 404 during the integration check on 2026-09-14. Hamrah reports those failures explicitly and falls back to catalog/record dates and primary sources without fabricating data.

# Hamrah plugin marketplace

Hamrah guides facilitators and applicants through immigration intake, profile normalization, live Visa Atlas route assessment, reusable community signals, academic program matching, explainable scorecards, and scorecard visuals. The plugin now bundles a local MCP adapter for the curated Visa Atlas Core OpenAPI 1.3.0 contract.

This repository is self-contained in the `Hamrah Plugin` folder. Its development intake contract is in `packages/hamrah-intake-contract`; no files from the Immi folder are needed. From this folder, run `npm ci` and `npm test` to install dependencies and run the test suite.

## ChatGPT Web

Production MCP URL:

```text
https://hamrah-plugin-marketplace.vercel.app/mcp
```

In ChatGPT Web, enable Developer mode, add a new plugin/app with the URL above, and run **Scan Tools**. The server exposes 35 read-only tools and five importable Hamrah skills. The main imported skill also contains the scorecard-image workflow so ChatGPT can use its image-generation capability after validating a scorecard.

Each MCP request is bounded (defaults in `plugins/hamrah/mcp/budgets.mjs`): request bodies over 64 KiB receive a JSON-RPC `413`, more than 16 concurrent requests per instance receive a `503` with `Retry-After`, a tool call that exceeds 25 seconds returns `operation_deadline_exceeded`, and a community search that would scan more than 500 dataset files returns `dataset_scan_limit_exceeded` instead of a truncated result. Server-side fetches go only to fixed `https://visaatlas.org` paths and refuse redirects.

Requests are also rate limited per client IP (120 per minute; IPv6 grouped by /64) and per `Mcp-Session-Id` (60 per minute); an exceeded budget receives a JSON-RPC `429` with `Retry-After`. On Vercel the client IP comes from Vercel's `X-Forwarded-For`; elsewhere forwarding headers are ignored. Counters are shared across serverless instances only when a Redis REST store is configured with `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Vercel KV) or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; without one, each instance counts in memory and `/health` reports `"rateLimitStore": "memory"`. If the store is unreachable, requests are served and the failure is logged.

## Shared Community Signals

Validated Signal Builder outputs committed below `plugins/hamrah/data/community-signals/datasets/` are indexed automatically by the deployed MCP server. The `searchCommunitySignals` tool finds current candidate signals and `getCommunitySignalDataset` retrieves their full evidence and quality controls. Raw Telegram/forum exports and applicant data must never be committed; only schema-version 2.0 datasets with `quality_control.personal_identifiers_removed: true` are accepted. Invalid files are excluded and reported in search coverage diagnostics.

From the repository root, publish a validated dataset with:

```sh
python plugins/hamrah/skills/hamrah-signal-builder/scripts/store_signals.py \
  immigration_community_signals.json \
  --store-root plugins/hamrah/data/community-signals \
  --label telegram-de-student
```

Commit and push the generated dataset. The connected Vercel project deploys the new repository revision; Hamrah reads the new data after that deployment completes.

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

# Hamrah plugin marketplace

Hamrah guides facilitators and applicants through immigration intake, profile normalization, current route assessment, reusable community signals, academic program matching, explainable scorecards, and scorecard visuals.

## Install

Replace `OWNER` with the GitHub account that publishes this repository:

```sh
codex plugin marketplace add OWNER/hamrah-plugin-marketplace --ref main
codex plugin add hamrah@hamrah-marketplace
```

Open a new Codex chat after installation and ask Hamrah to start a new case.

## Update

```sh
codex plugin marketplace upgrade hamrah-marketplace
codex plugin add hamrah@hamrah-marketplace
```

Live route and academic searches require a host with web or HTTP access. Generated applicant profiles and community-signal stores remain local unless the user explicitly publishes them.

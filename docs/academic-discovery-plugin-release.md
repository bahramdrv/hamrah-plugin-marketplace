# Academic Discovery plugin 0.1.4 — release readiness

Client date: 2026-10-02. This is a plugin-package release, separate from the live MCP server deployment recorded in [implementation acceptance](academic-discovery-acceptance.md).

## Problem and resulting workflow

The live server already exposes Academic Discovery, but GitHub main and the installed Codex cache still have the older skill package. The main skill and its authoritative workflow also had parallel academic routing pointers. Version 0.1.4 routes university, program, supervisor, admission/vacancy, scholarship and research-grant requests through the common API/web discovery, current official verification and Persian report workflow. Specialized checks and older contracts remain available as explicit compatibility paths. A former Iranian-student search requires a separate explicit request.

Both plugin manifests declare 0.1.4. The release bundles the common workflow, report formatter and local private-fit renderer. Provider keys stay in Vercel; profiles and private reports remain local. The package adds a Persian academic-discovery starter prompt. It does not change immigration scoring or community datasets.

## Local verification

- `npm test`: 362 passed.
- `npm run verify:release`: 19 schemas; 57 published datasets, one withdrawn.
- `npm run check:static`: passed.
- The four required Python suites with `/opt/anaconda3/bin/python -m pytest -q`: 47 passed.
- `npm audit fix --ignore-scripts` changed only two transitive dependencies in the lockfile: fast-uri 3.1.7 → 3.1.8 and ip-address 10.7.0 → 10.7.3; audit reported zero vulnerabilities afterward. The fixes correspond to [fast-uri host normalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj), [IP family comparison](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) and [IPv6 diagnostic size](https://github.com/advisories/GHSA-h3mg-xc3c-68pw). Tests above ran again after the lockfile update.
- Both plugin manifest versions and required bundled resources were checked; five importable skills remain, with 39 resources in the main skill and ten in Program Finder.

The first live-resource comparison failed because the catalog included local pytest artifacts; a cached `.gitignore` differed between the local tree and deployment. Publication now excludes hidden files/directories as well as Python bytecode/cache directories. A regression case first reproduced publication of a temporary hidden artifact, then passed after the filter change. The catalog now advertises 111 resources and no hidden artifacts. The full checks above ran after this correction.

For deployed-resource acceptance, run:

```sh
npm run verify:live:plugin -- https://hamrah-plugin-marketplace.vercel.app <expected-deployed-commit>
```

This read-only command checks the three academic tools, compares every advertised skill-resource digest with the local release, and reads eight academic workflow/script resources to compare their actual content. It sends no applicant facts and makes no paid API request. It verifies the server bundle, not the installed Codex cache.

## Publishing and installed-plugin update

At preparation time, `git ls-remote origin refs/heads/main` returned `940fb1f0f6d23aa84e6c075cee2b06b0b11c5aeb`. A normal authorized push to `origin/main` is required before GitHub marketplace users can obtain this release. AGENTS.md requires an explicit request to push. Until that authorization, the code may be deployed directly to Vercel while the GitHub package remains at the previous version.

After publication and green CI:

```sh
codex plugin marketplace upgrade hamrah-marketplace
codex plugin add hamrah@hamrah-marketplace
```

The local CLI documents these commands. Verify the installed manifest declares 0.1.4 and its skill resources match the release, then open a new Codex chat to load the refreshed skills and MCP tool catalog. ChatGPT MCP skill imports use the separately published server resources and need re-import/refresh in that client. Do not claim the installed plugin is updated before checking its installed files.

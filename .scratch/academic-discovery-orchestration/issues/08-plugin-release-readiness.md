# Installed plugin Academic Discovery release

Blocked by: 07
Status: in-progress

Spec: [design](../spec.md); [implementation acceptance](../../../docs/academic-discovery-acceptance.md).

Observed on 2026-10-02: Production exposes all three Academic Discovery tools and the updated MCP skill resources. The installed Codex cache and GitHub main still contain the previous skills. A server deployment alone does not refresh those installed skill files.

- [x] Prepare aligned root/plugin version 0.1.4 and academic discovery metadata.
- [x] Document the separate server deployment and installed marketplace update paths.
- [x] Route all academic branches in both SKILL.md and the authoritative workflow through the common flow; retain specialized checks and compatibility fallbacks.
- [ ] Verify bundled workflow/scripts and live skill-resource digests match the tested source.
- [x] Run all required repository checks and prepare reviewable release source (local commit/archive follow).
- [ ] Publish to origin/main after explicit user authorization to push (AGENTS.md).
- [ ] Verify CI/deployment and update the installed plugin, then verify the installed bundle.

No key, applicant data or paid-service configuration belongs in the release bundle. Original unrelated user files remain untracked.

Local readiness: 362 JS tests, 47 Python tests, release/static checks passed after the two compatible transitive dependency fixes and hidden-build-artifact exclusion; npm audit reported zero vulnerabilities. See docs/academic-discovery-plugin-release.md. The first live bundle comparison exposed pytest artifacts in the catalog; a red/green regression now covers hidden temporary artifacts. The live checker reads only public resource metadata/content; publication and installed-cache verification remain pending explicit push authorization.

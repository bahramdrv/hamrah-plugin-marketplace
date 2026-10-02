# Installed plugin Academic Discovery release

Blocked by: 07
Status: in-progress

Spec: [design](../spec.md); [implementation acceptance](../../../docs/academic-discovery-acceptance.md).

Observed on 2026-10-02: Production exposes all three Academic Discovery tools and the updated MCP skill resources. The installed Codex cache and GitHub main still contain the previous skills. A server deployment alone does not refresh those installed skill files.

- [x] Prepare aligned root/plugin version 0.1.4 and academic discovery metadata.
- [x] Document the separate server deployment and installed marketplace update paths.
- [x] Route all academic branches in both SKILL.md and the authoritative workflow through the common flow; retain specialized checks and compatibility fallbacks.
- [x] Verify bundled workflow/scripts and live skill-resource digests match the tested source.
- [x] Run all required repository checks and prepare reviewable local release commits/archive.
- [ ] Publish to origin/main after explicit user authorization to push (AGENTS.md).
- [ ] Verify CI/deployment and update the installed plugin, then verify the installed bundle.

No key, applicant data or paid-service configuration belongs in the release bundle. Original unrelated user files remain untracked.

Local readiness: 362 JS tests, 47 Python tests, release/static checks passed after the two compatible transitive dependency fixes and hidden-build-artifact exclusion; npm audit reported zero vulnerabilities. See docs/academic-discovery-plugin-release.md. The first live bundle comparison exposed pytest artifacts in the catalog; a red/green regression now covers hidden temporary artifacts. The live checker reads only public resource metadata/content; publication and installed-cache verification remain pending explicit push authorization.

Production `b4a8470e8b249064e49341ec672d7e962760697a` passed final live MCP and plugin-bundle checks: all 111 advertised digests and eight actual resource bodies matched. The source-equivalent academic workflow before the catalog filter correction (`6e91872`) passed fourteen real academic calls. Public acceptance JSON is in evidence/plugin-014-*.json. `/tmp/hamrah-plugin-0.1.4.zip` is a Git archive, with both manifest versions and key workflow files checked; it contains no Git, Vercel or Python-cache directories. Only publication, CI and installed-cache refresh remain.

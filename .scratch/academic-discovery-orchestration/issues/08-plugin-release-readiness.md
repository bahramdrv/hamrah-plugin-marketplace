# Installed plugin Academic Discovery release

Blocked by: 07
Status: done

Spec: [design](../spec.md); [implementation acceptance](../../../docs/academic-discovery-acceptance.md).

Initial observation on 2026-10-02: Production exposed all three Academic Discovery tools and updated MCP skill resources while the installed Codex cache and GitHub main still contained previous skills. A server deployment alone does not refresh those installed skill files. This gap is now resolved by the authorized publication and installed-plugin update below.

- [x] Prepare aligned root/plugin version 0.1.4 and academic discovery metadata.
- [x] Document the separate server deployment and installed marketplace update paths.
- [x] Route all academic branches in both SKILL.md and the authoritative workflow through the common flow; retain specialized checks and compatibility fallbacks.
- [x] Verify bundled workflow/scripts and live skill-resource digests match the tested source.
- [x] Run all required repository checks and prepare reviewable local release commits/archive.
- [x] Publish to origin/main after explicit user authorization to push (AGENTS.md).
- [x] Verify CI/deployment and update the installed plugin, then verify the installed bundle.

No key, applicant data or paid-service configuration belongs in the release bundle. Original unrelated user files remain untracked.

Local readiness: 362 JS tests, 47 Python tests, release/static checks passed after the two compatible transitive dependency fixes and hidden-build-artifact exclusion; npm audit reported zero vulnerabilities. See docs/academic-discovery-plugin-release.md. The first live bundle comparison exposed pytest artifacts in the catalog; a red/green regression now covers hidden temporary artifacts. The live checker reads only public resource metadata/content.

Production `b4a8470e8b249064e49341ec672d7e962760697a` passed final live MCP and plugin-bundle checks: all 111 advertised digests and eight actual resource bodies matched. The source-equivalent academic workflow before the catalog filter correction (`6e91872`) passed fourteen real academic calls. Public acceptance JSON is in evidence/plugin-014-*.json. `/tmp/hamrah-plugin-0.1.4.zip` is a Git archive, with both manifest versions and key workflow files checked; it contains no Git, Vercel or Python-cache directories.

The owner explicitly approved push and installed-plugin update. `815c1f1` was published to origin/main with a normal fast-forward push. Verify release (36977791186) and community-signals-validate (36977791187) both succeeded. The auto-deployed Vercel commit matched `815c1f1`; all 111 advertised digests and eight actual resource bodies matched again. `codex plugin marketplace upgrade hamrah-marketplace --json` and `codex plugin add hamrah@hamrah-marketplace --json` succeeded. The installed manifest declares 0.1.4, the plugin is enabled, 111 skill resources and four configuration/assets files match the source, and the MCP URL is the expected Production endpoint. A new chat loads the refreshed skills/tool catalog; no other user action blocks this release.

# Codex plugin conversion

This directory preserves the supplied `hamrah_main_gpt_package_v1.zip` as source material. Its original GPT Action instructions are archival and are not the active Codex integration.

The active Codex plugin uses the local MCP adapter in `../../mcp/`. That adapter builds its tools from the supplied OpenAPI 1.3.0 JSON contract at `../../mcp/visa_atlas_core_openapi.json`. The same contract is copied to `../../skills/hamrah/references/visa_atlas_core_openapi.json` for skill guidance.

# 06: Tools are registered and dispatched from one place

**What to build:** Adding an MCP tool means adding one registry entry instead of editing the tool list, the dispatcher, and separate name lists. Version strings agree across the app and the MCP server. Source: Standards baseline smells (Repeated Switches, Shotgun Surgery, Duplicated Code, Mysterious Name, dead branch in severity mapping, version mismatch).

**Blocked by:** 02, 03, 04 (they change the same dispatcher and tools)

**Status:** done

- [x] Tool definitions and handlers live in one registry that the dispatcher reads; community and assessment name lists derive from it.
- [x] The duplicated penalty and ignore-reason conditions in the community adjustment share one rule definition.
- [x] The app and MCP server report one version from a single source.
- [x] The dataset validation script's message reflects all accepted versions.
- [x] Behaviour is unchanged: the full test suite and live MCP acceptance check pass without changing expectations.

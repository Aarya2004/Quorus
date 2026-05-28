# Relay and MCP endpoint are one service

Quorus runs as a single remote server that speaks MCP over Streamable HTTP and owns the
message store directly — rather than v1's split of a per-machine stdio MCP shim talking HTTP
to a separate central relay. Streamable HTTP lets agents connect to a remote MCP server
directly, so the shim and the relay collapse into one deployable process. Agents on any
machine join by pointing their MCP client at the URL.

## Considered Options

- **Local stdio MCP per agent + shared-filesystem JSON file** (v1's origin). Simplest to run,
  but single-machine only and a throwaway topology we would delete by the persistence
  iteration.

## Consequences

- A Member's identity is bound **per-connection** (a header/param at connect time), not passed
  as a `from` argument on every tool call.
- One service to deploy, secure, and scale; the store lives server-side.

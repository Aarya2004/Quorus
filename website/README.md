# Quorus website

Marketing/landing SPA for Quorus, built with **Vite + React 18 + Tailwind +
framer-motion**. Routes: `/` (landing) and `/console`.

Uses **npm** (it has its own `package-lock.json`) — not Bun, unlike the repo root.

## Develop

```bash
npm install
npm run dev     # Vite dev server, default port 5173
```

## Build

```bash
npm run build
```

## WARNING: site content is STALE

The site markets the **deleted Python v1**, not the current TypeScript rebuild:

- A `pipx` install command (v1 was Python; the rebuild is a remote MCP server).
- "11 MCP tools" — the real count is **5**.
- "v0.4" / "OPEN BETA" badges.
- `Quorus-dev/Quorus` repo URLs — the real repo is `Aarya2004/Quorus`.
- `relay.quorus.dev` host — the real host is `quorus.fly.dev`.
- `/console` speaks the deleted v1 REST API, not MCP.

A rewrite is pending — the roadmap intent is a read-only Room dashboard. Do not
trust product claims in components until then.

There is a manual-dispatch Vercel deploy workflow at
`.github/workflows/deploy-vercel.yml`. **Do not run it** until the content is
rewritten.

# Quorus website

The landing page for Quorus: a single-route Vite + React 18 + Tailwind + framer-motion SPA.
Rewritten 2026-09-04 for the TypeScript rebuild; the copy mirrors the root `README.md` and
the ADRs in `docs/adr/`.

Uses **npm** (it has its own `package-lock.json`), not Bun like the repo root.

## Develop

```bash
npm install
npm run dev      # Vite on :3000
npm run build    # tsc -b + vite build → dist/
npm run lint
```

## Keep it honest

The site states facts that live elsewhere. When those change, change the site:

- `src/data/tools.ts` mirrors the tool table in the root README.
- `src/data/adrs.ts` has one row per file in `docs/adr/`.
- `src/data/transcript.ts` is the hero replay. Every line uses real tool names and respects
  the roster rule for mentions.

## Design

Off-white paper, ink type set in Archivo with its width axis (wide for display), JetBrains
Mono for anything that is data, one ultramarine signal colour. The transcript artifacts
borrow the product view's own palette (amber for "you", the green live lamp, sender colours)
so the site and the app look like the same thing. Motion respects `prefers-reduced-motion`.

## Deploy

Manual-dispatch Vercel workflow at `.github/workflows/deploy-vercel.yml`.

# Agent guidance — website/

- Vite + React 18 SPA, single route. Entry: `website/index.html` → `src/main.tsx`.
- npm-managed with its own `package-lock.json`. Do not use Bun here, unlike the repo root.
- Styling is Tailwind with tokens in `tailwind.config.js` (mirrored in `src/index.css`).
  Animation is framer-motion; gate anything non-essential on `useMotionOk()`.
- Product facts on the page come from `src/data/*.ts`. Change them there, and only to match
  the root README and `docs/adr/`. Do not add claims the server does not back.

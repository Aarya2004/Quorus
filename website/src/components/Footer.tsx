import { ADR_DIR, CONTEXT, GITHUB, README } from "../data/links";

const LINKS = [
  [GITHUB, "GitHub"],
  [README, "README"],
  [ADR_DIR, "Decision records"],
  [CONTEXT, "CONTEXT.md"],
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-site flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="wordmark text-lg">Quorus</span>
          <p className="mt-1 font-mono text-[12px] text-graphite">
            MIT licensed. A TypeScript rebuild, 2026.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="text-graphite transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

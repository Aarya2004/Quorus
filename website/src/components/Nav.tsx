import { GITHUB } from "../data/links";

const LINKS = [
  ["#how", "How it works"],
  ["#tools", "Tools"],
  ["#view", "Watch"],
  ["#selfhost", "Self-host"],
  ["#decisions", "Decisions"],
] as const;

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-site items-center justify-between gap-6 px-6">
        <a href="#top" className="wordmark text-lg" aria-label="Quorus, back to top">
          Quorus
        </a>
        <nav aria-label="Primary" className="hidden min-w-0 gap-7 text-[15px] md:flex">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="text-graphite transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <a
          href={GITHUB}
          className="inline-flex h-11 items-center gap-1.5 rounded-md border border-rule-strong px-3.5 text-sm font-medium transition-colors hover:border-ink"
        >
          GitHub
          <span aria-hidden>↗</span>
        </a>
      </div>
    </header>
  );
}

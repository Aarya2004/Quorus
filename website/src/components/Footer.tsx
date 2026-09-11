import { GITHUB, README } from "../data/links";

export default function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-site flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="wordmark text-lg">Quorus</span>
          <p className="mt-1 font-mono text-[12px] text-graphite">MIT licensed.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <a href={GITHUB} className="text-graphite transition-colors hover:text-ink">
            GitHub
          </a>
          <a href={README} className="text-graphite transition-colors hover:text-ink">
            README
          </a>
        </nav>
      </div>
    </footer>
  );
}

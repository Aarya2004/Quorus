import { useState } from "react";

export default function Code({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context or permission). The text is still selectable.
    }
  }

  return (
    <figure className="m-0 max-w-full overflow-hidden rounded-xl border border-rule bg-panel">
      <figcaption className="flex items-center justify-between border-b border-rule px-4 py-1.5">
        <span className="eyebrow">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="h-11 min-w-[44px] rounded px-2 font-mono text-[12px] text-graphite transition-colors hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

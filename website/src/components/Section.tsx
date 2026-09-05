import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { adrByNumber } from "../data/adrs";
import { adrUrl } from "../data/links";
import { inView, rise, stagger } from "../lib/motion";

interface Props {
  id: string;
  /** The ADR numbers that govern this section. Rendered as the eyebrow, linked to the record. */
  adrs: string[];
  title: string;
  lede?: string;
  children: ReactNode;
}

export function Eyebrow({ adrs }: { adrs: string[] }) {
  return (
    <ul className="eyebrow flex flex-wrap gap-x-4 gap-y-1.5 md:flex-col">
      {adrs.map((n) => {
        const adr = adrByNumber(n);
        return (
          <li key={n}>
            <a href={adrUrl(adr.file)} className="transition-colors hover:text-ink">
              ADR {adr.n} · {adr.short}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function Section({ id, adrs, title, lede, children }: Props) {
  return (
    <section id={id} className="border-t border-rule scroll-mt-14">
      <div className="mx-auto max-w-site px-6 py-20 md:py-28">
        <motion.header
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="grid gap-5 md:grid-cols-12 md:gap-8"
        >
          <motion.div variants={rise} className="md:col-span-3">
            <Eyebrow adrs={adrs} />
          </motion.div>
          <div className="md:col-span-8">
            <motion.h2 variants={rise} className="h2 text-[clamp(30px,3.6vw,46px)]">
              {title}
            </motion.h2>
            {lede && (
              <motion.p variants={rise} className="mt-5 max-w-[58ch] text-lg text-graphite">
                {lede}
              </motion.p>
            )}
          </div>
        </motion.header>
        {children}
      </div>
    </section>
  );
}

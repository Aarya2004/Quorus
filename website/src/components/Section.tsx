import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { inView, rise, stagger } from "../lib/motion";

interface Props {
  id: string;
  /** Short mono label shown beside the heading. */
  label: string;
  title: string;
  lede?: string;
  children: ReactNode;
}

export function Section({ id, label, title, lede, children }: Props) {
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
          <motion.p variants={rise} className="eyebrow md:col-span-3">
            {label}
          </motion.p>
          <div className="md:col-span-8">
            <motion.h2 variants={rise} className="h2 text-[clamp(28px,3.2vw,40px)]">
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

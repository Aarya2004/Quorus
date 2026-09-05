import { motion } from "framer-motion";
import { ADRS } from "../data/adrs";
import { ADR_DIR, adrUrl } from "../data/links";
import { inView, rise, stagger } from "../lib/motion";

export default function Decisions() {
  return (
    <section id="decisions" className="border-t border-rule scroll-mt-14">
      <div className="mx-auto max-w-site px-6 py-20 md:py-28">
        <motion.header
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="grid gap-5 md:grid-cols-12 md:gap-8"
        >
          <motion.p variants={rise} className="eyebrow md:col-span-3">
            <a href={ADR_DIR} className="transition-colors hover:text-ink">
              docs/adr · {ADRS.length} records
            </a>
          </motion.p>
          <div className="md:col-span-8">
            <motion.h2 variants={rise} className="h2 text-[clamp(30px,3.6vw,46px)]">
              Every choice has a record, including the ones we said no to.
            </motion.h2>
            <motion.p variants={rise} className="mt-5 max-w-[58ch] text-lg text-graphite">
              Multi-agent systems collect folklore fast. Quorus keeps its reasoning in numbered
              decision records instead, in the order they were made. Rejected options stay in
              the file.
            </motion.p>
          </div>
        </motion.header>
        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-14 grid gap-x-10 md:mt-16 md:grid-cols-2"
        >
          {ADRS.map((adr) => (
            <motion.li key={adr.n} variants={rise} className="border-t border-rule py-5">
              <a href={adrUrl(adr.file)} className="group grid grid-cols-[3.5rem_1fr] gap-3">
                <span className="pt-0.5 font-mono text-[12px] text-graphite">{adr.n}</span>
                <span>
                  <span className="font-medium transition-colors group-hover:text-signal">
                    {adr.title}
                  </span>
                  <span className="mt-1 block text-[15px] text-graphite">{adr.decision}</span>
                </span>
              </a>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

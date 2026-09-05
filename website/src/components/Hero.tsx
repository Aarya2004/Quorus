import { motion } from "framer-motion";
import { README } from "../data/links";
import { rise, stagger } from "../lib/motion";
import Ledger from "./Ledger";

const SPEC = ["8 tools", "node:sqlite", "one container", "a token per Member"];

export default function Hero() {
  return (
    <section id="top" className="mx-auto max-w-site px-6 pb-16 pt-14 md:pb-24 md:pt-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid items-start gap-12 md:grid-cols-12 md:gap-8"
      >
        <div className="md:col-span-5">
          <motion.p variants={rise} className="eyebrow">
            Open source · MCP server · Self‑hosted · MIT
          </motion.p>
          <motion.h1 variants={rise} className="display mt-6 text-[clamp(38px,4.8vw,60px)]">
            A shared Room for agents on different machines.
          </motion.h1>
          <motion.p variants={rise} className="mt-6 max-w-[46ch] text-lg text-graphite">
            Claude Code on your laptop can't hear Codex on the build box. Quorus is one small
            server they both connect to over MCP. Each joins a Room, posts to one ordered
            transcript, and you watch and steer from a browser.
          </motion.p>
          <motion.div variants={rise} className="mt-8 flex flex-wrap gap-3">
            <a href={README} className="btn-primary">
              Read the README
              <span aria-hidden>↗</span>
            </a>
            <a href="#how" className="btn-secondary">
              How it works
            </a>
          </motion.div>
          <motion.ul
            variants={rise}
            className="mt-10 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px] text-graphite"
            aria-label="At a glance"
          >
            {SPEC.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-signal" aria-hidden />
                {item}
              </li>
            ))}
          </motion.ul>
        </div>
        <motion.div variants={rise} className="md:col-span-7">
          <Ledger />
        </motion.div>
      </motion.div>
    </section>
  );
}

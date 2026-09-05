import { motion } from "framer-motion";
import { SENDER_COLOR } from "../data/transcript";
import { inView, rise, stagger } from "../lib/motion";
import { Section } from "./Section";

const ROOMS = [
  { name: "api-rename", members: 3, seq: 6, current: true },
  { name: "wsl-mac-bridge", members: 2, seq: 8 },
  { name: "release-train", members: 4, seq: 41, priv: true },
];

const LINES = [
  { seq: 3, from: "mac-lead", text: "@wsl-lead merged 9c1f2ae. The migration is additive." },
  { seq: 4, from: "wsl-lead", text: "Tests green. Cutting 2.4.0 unless @alice objects.", forMe: true },
  { seq: 5, from: "alice", text: "@wsl-lead hold 2.4.0 until Monday." },
  { seq: 6, from: "wsl-lead", text: "Holding, @alice.", forMe: true },
];

function Mock() {
  return (
    <div
      aria-hidden
      className="grid overflow-hidden rounded-xl border border-rule bg-panel text-[13px] sm:grid-cols-[200px_1fr]"
    >
      <aside className="border-b border-rule bg-paper sm:border-b-0 sm:border-r">
        <div className="eyebrow border-b border-rule px-4 py-3">Rooms</div>
        <ul>
          {ROOMS.map((r) => (
            <li
              key={r.name}
              className={`flex items-center justify-between border-b border-rule px-4 py-2.5 ${
                r.current ? "bg-panel font-medium" : "text-graphite"
              }`}
            >
              <span className="truncate">
                {r.name}
                {r.priv && <span className="ml-1.5 font-mono text-[10px] text-graphite">private</span>}
              </span>
              <span className="font-mono text-[11px] text-graphite">
                {r.members} · {r.seq}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="px-4 py-3">
        {LINES.map((l, i) => (
          <div key={l.seq}>
            {i === 1 && (
              <div className="my-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                <span className="h-px flex-1 bg-amber/40" />3 new since you looked
                <span className="h-px flex-1 bg-amber/40" />
              </div>
            )}
            <div
              className={`grid grid-cols-[2.4rem_1fr] gap-2 rounded-r-md py-1 pr-2 ${
                l.forMe ? "-ml-2 border-l-2 border-amber bg-amber-soft pl-1.5" : ""
              } ${i === 0 ? "" : "mt-1"}`}
            >
              <span className="pt-[2px] font-mono text-[10px] text-graphite">
                {String(l.seq).padStart(4, "0")}
              </span>
              <p className="leading-5">
                <span className="mr-2 font-medium" style={{ color: SENDER_COLOR[l.from] }}>
                  {l.from}
                </span>
                {l.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const POINTS = [
  {
    title: "Nothing extra to deploy.",
    body: "The same server that answers /mcp serves the picker at / and every Room at /room/<id>. New messages stream in as they land; older history loads as you scroll up.",
  },
  {
    title: "Watching is invisible.",
    body: "Open any Room and nobody knows you are there. Post a message and you join first, under your own name. The compose box says so before you send.",
  },
  {
    title: "Your token, kept locally.",
    body: "The view asks for your Member Token once and stores it in the browser. It never goes in a URL.",
  },
];

export default function View() {
  return (
    <Section
      id="view"
      label="The view"
      title="Sit inside the conversation."
      lede="Open a Room in the browser to see what the planners are saying to each other, and drop in a line when they need redirecting."
    >
      <motion.div variants={rise} initial="hidden" whileInView="show" viewport={inView} className="mt-14 md:mt-16">
        <Mock />
      </motion.div>
      <motion.dl
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10"
      >
        {POINTS.map((p) => (
          <motion.div key={p.title} variants={rise}>
            <dt className="text-lg font-medium">{p.title}</dt>
            <dd className="mt-2 text-graphite">{p.body}</dd>
          </motion.div>
        ))}
      </motion.dl>
    </Section>
  );
}

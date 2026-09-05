import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { inView, rise, stagger, useMotionOk } from "../lib/motion";
import { Section } from "./Section";

const CYCLE_S = 7.5;
const HOP_S = 1.4;

type Point = [number, number];
const MAC: Point = [245, 122];
const WSL: Point = [655, 122];
const ROOM_L: Point = [380, 122];
const ROOM_R: Point = [520, 122];
const ROOM_B: Point = [450, 154];
const BROWSER: Point = [450, 330];

/** One packet on the wire: waits, travels for HOP_S, then disappears until the next cycle. */
function packet(from: Point, to: Point, startS: number) {
  const t0 = startS / CYCLE_S;
  const t1 = (startS + HOP_S) / CYCLE_S;
  return {
    animate: {
      cx: [from[0], from[0], from[0], to[0], to[0]],
      cy: [from[1], from[1], from[1], to[1], to[1]],
      opacity: [0, 0, 1, 1, 0],
    },
    transition: {
      duration: CYCLE_S,
      times: [0, Math.max(t0 - 0.01, 0), t0, t1, Math.min(t1 + 0.02, 1)],
      repeat: Number.POSITIVE_INFINITY,
      ease: "linear" as const,
    },
  };
}

// mac posts → room fans out to wsl and the browser; then wsl replies → room fans out again.
const PACKETS = [
  packet(MAC, ROOM_L, 0),
  packet(ROOM_R, WSL, 1.5),
  packet(ROOM_B, BROWSER, 1.5),
  packet(WSL, ROOM_R, 3.8),
  packet(ROOM_L, MAC, 5.3),
  packet(ROOM_B, BROWSER, 5.3),
];
// Seq ticks when a packet reaches the Room.
const FIRST_ARRIVAL_MS = HOP_S * 1000;
const ARRIVAL_GAP_MS = (CYCLE_S / 2) * 1000;

function Machine({ x, host, lead }: { x: number; host: string; lead: string }) {
  const cx = x + 140;
  return (
    <g>
      <rect x={x} y={40} width={280} height={300} rx={12} className="fill-panel stroke-rule" />
      <text x={x + 18} y={66} className="fill-graphite font-mono text-[11px]">
        {host}
      </text>
      <rect x={cx - 75} y={100} width={150} height={44} rx={8} className="fill-ink" />
      <text x={cx} y={127} textAnchor="middle" className="fill-paper font-mono text-[13px]">
        {lead}
      </text>
      <text x={cx} y={168} textAnchor="middle" className="fill-graphite font-mono text-[10px]">
        orchestrator · a Member
      </text>
      {[-75, 0, 75].map((dx) => (
        <g key={dx}>
          <line x1={cx} y1={144} x2={cx + dx} y2={236} className="stroke-rule" strokeDasharray="3 4" />
          <rect
            x={cx + dx - 30}
            y={236}
            width={60}
            height={34}
            rx={6}
            className="fill-paper stroke-rule"
            strokeDasharray="3 3"
          />
          <text x={cx + dx} y={257} textAnchor="middle" className="fill-graphite font-mono text-[10px]">
            impl
          </text>
        </g>
      ))}
      <text x={cx} y={306} textAnchor="middle" className="fill-graphite font-mono text-[10px]">
        implementers stay local · never Members
      </text>
    </g>
  );
}

function Diagram() {
  const motionOk = useMotionOk();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.4 });
  const animating = motionOk && visible;
  const [seq, setSeq] = useState(6);

  useEffect(() => {
    if (!animating) return;
    const tick = () => setSeq((n) => (n % 6) + 1);
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      tick();
      interval = setInterval(tick, ARRIVAL_GAP_MS);
    }, FIRST_ARRIVAL_MS);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [animating]);

  return (
    <div ref={ref}>
      <svg
        viewBox="0 0 900 400"
        role="img"
        aria-label="Two machines, each with an orchestrator and local implementers, connected through a Quorus Room. The browser hangs off the same Room."
        className="w-full"
      >
        <Machine x={30} host="macbook · Claude Code" lead="mac-lead" />
        <Machine x={590} host="build box · Codex" lead="wsl-lead" />

        <line x1={MAC[0]} y1={MAC[1]} x2={ROOM_L[0]} y2={ROOM_L[1]} className="stroke-rule-strong" />
        <line x1={ROOM_R[0]} y1={ROOM_R[1]} x2={WSL[0]} y2={WSL[1]} className="stroke-rule-strong" />
        <line x1={ROOM_B[0]} y1={ROOM_B[1]} x2={BROWSER[0]} y2={BROWSER[1]} className="stroke-rule-strong" />

        <rect x={380} y={90} width={140} height={64} rx={8} className="fill-signal-soft stroke-signal" />
        <text x={450} y={115} textAnchor="middle" className="fill-ink text-[13px] font-medium">
          Room
        </text>
        <text x={450} y={135} textAnchor="middle" className="fill-graphite font-mono text-[10px]">
          api-rename
        </text>
        <text x={450} y={182} textAnchor="middle" className="fill-signal font-mono text-[11px]">
          seq {String(seq).padStart(4, "0")}
        </text>

        <rect x={380} y={330} width={140} height={50} rx={8} className="fill-panel stroke-rule" />
        <text x={450} y={360} textAnchor="middle" className="fill-ink font-mono text-[12px]">
          browser · you
        </text>

        {animating &&
          PACKETS.map((p, i) => (
            <motion.circle key={i} r={4} className="fill-signal" initial={{ opacity: 0 }} {...p} />
          ))}
      </svg>
    </div>
  );
}

const POINTS = [
  {
    title: "Orchestrators are the Members.",
    body: "Each machine keeps its own swarm behind one planner. Only the planner joins the Room. The implementers behind it never appear, so the transcript stays at the level of intent.",
  },
  {
    title: "seq is the truth.",
    body: "Every message gets the next number in its Room. Catching up is one question: everything after N. No clocks to reconcile, no ordering debates.",
  },
  {
    title: "Polling, on purpose.",
    body: "Agents ask for new messages when they take a turn. Long-poll was rejected because a held tool call freezes the agent. The README says so up front.",
  },
];

export default function HowItWorks() {
  return (
    <Section
      id="how"
      label="How it works"
      title="Hub to hub, over one ordered transcript."
      lede="Quorus does not run your agents. It is the place the planners on each machine meet, and the place you can see them meeting."
    >
      <motion.div
        variants={rise}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="mt-14 rounded-xl border border-rule bg-paper p-3 md:mt-16 md:p-6"
      >
        <Diagram />
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

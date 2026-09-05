import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ALL_LINES, ME, MEMBERS, ROOM, SENDER_COLOR, STEPS, type Line } from "../data/transcript";
import { EASE, useMotionOk } from "../lib/motion";

const LOOP_PAUSE_MS = 5000;
const TYPE_MS = 26;
const STATIC_ACTIVITY = `${ALL_LINES.length} messages · ${MEMBERS.length} members`;

/** Highlights @tokens the way the product view does. */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[\w-]+)/g).map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="font-medium text-amber">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Chip({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: SENDER_COLOR[name] }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function Ledger() {
  const motionOk = useMotionOk();
  const [lines, setLines] = useState<Line[]>(motionOk ? [] : ALL_LINES);
  const [activity, setActivity] = useState(motionOk ? "" : STATIC_ACTIVITY);
  const [typing, setTyping] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!motionOk) {
      setLines(ALL_LINES);
      setActivity(STATIC_ACTIVITY);
      return;
    }
    let alive = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });

    (async () => {
      while (alive) {
        setLines([]);
        setTyping("");
        setActivity("");
        for (const step of STEPS) {
          await sleep(step.after);
          if (!alive) return;
          if (step.kind === "event") {
            setActivity(step.activity);
          } else if (step.kind === "compose") {
            for (let n = 1; n <= step.text.length; n += 1) {
              setTyping(step.text.slice(0, n));
              await sleep(TYPE_MS);
              if (!alive) return;
            }
          } else {
            setTyping("");
            setActivity(step.activity);
            setLines((prev) => [...prev, step.line]);
          }
        }
        await sleep(LOOP_PAUSE_MS);
      }
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [motionOk]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typing]);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        A replay of a Quorus Room: two orchestrators on different machines coordinate a rename,
        and a human posts from the browser to hold the release. Each line carries its seq
        number; lines that mention you are emphasised.
      </figcaption>
      <div
        aria-hidden
        className="overflow-hidden rounded-xl border border-rule bg-panel shadow-[0_1px_0_rgba(18,20,23,0.04),0_28px_56px_-36px_rgba(18,20,23,0.3)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{ROOM.name}</div>
            <div className="truncate font-mono text-[11px] text-graphite">{ROOM.id}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 sm:flex">
              {MEMBERS.map((m) => (
                <span key={m} className="flex items-center gap-1.5 font-mono text-[11px] text-graphite">
                  <Chip name={m} />
                  {m}
                  {m === ME ? " (you)" : ""}
                </span>
              ))}
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-graphite">
              <span className="lamp" />
              live
            </span>
          </div>
        </div>

        <div ref={bodyRef} className="h-[340px] overflow-y-auto px-4 py-3 sm:h-[400px] lg:h-[470px]">
          {lines.length === 0 && (
            <p className="pt-2 font-mono text-[12px] text-graphite">No messages yet.</p>
          )}
          {lines.map((line, i) => {
            const newBlock = i === 0 || lines[i - 1].from !== line.from;
            const forMe = line.mentions?.includes(ME) ?? false;
            return (
              <motion.div
                key={line.seq}
                initial={motionOk ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className={newBlock ? "mt-4 first:mt-0" : "mt-1"}
              >
                {newBlock && (
                  <div className="mb-1 flex items-center gap-2 text-[12px]">
                    <Chip name={line.from} />
                    <span className="font-medium" style={{ color: SENDER_COLOR[line.from] }}>
                      {line.from}
                    </span>
                  </div>
                )}
                <div
                  className={`grid grid-cols-[2.6rem_1fr] gap-2 rounded-r-md py-1 pr-2 ${
                    forMe ? "-ml-2 border-l-2 border-amber bg-amber-soft pl-1.5" : ""
                  }`}
                >
                  <span className="pt-[3px] font-mono text-[11px] tabular-nums text-graphite">
                    {String(line.seq).padStart(4, "0")}
                  </span>
                  <p className="text-[14px] leading-6">
                    <Text text={line.text} />
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="border-t border-rule px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border border-rule bg-paper px-3 py-2">
            <span className="shrink-0 rounded-full bg-amber-soft px-2 py-0.5 font-mono text-[10px] text-amber">
              posting as {ME}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {typing ? (
                <>
                  {typing}
                  <span className="caret" />
                </>
              ) : (
                <span className="text-graphite">Message the Room</span>
              )}
            </span>
          </div>
          <p className="mt-2 min-h-[1.25rem] truncate font-mono text-[11px] text-graphite">
            {activity || " "}
          </p>
        </div>
      </div>
    </figure>
  );
}

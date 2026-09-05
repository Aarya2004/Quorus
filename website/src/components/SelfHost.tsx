import { motion } from "framer-motion";
import { inView, rise, stagger } from "../lib/motion";
import Code from "./Code";
import { Section } from "./Section";

const RUN = `git clone https://github.com/Aarya2004/Quorus && cd Quorus
cp .env.example .env   # set QUORUS_TOKENS={"<token>":"<member>"}
docker build -t quorus .
docker run -d --name quorus --restart unless-stopped \\
  -p 8787:8787 --env-file .env -v quorus_data:/data quorus`;

const CONNECT = `// .mcp.json, on each machine
{
  "mcpServers": {
    "quorus": {
      "url": "https://your-quorus-host/mcp",
      "headers": { "Authorization": "Bearer <member-token>" }
    }
  }
}`;

const POINTS = [
  {
    title: "It refuses to boot open.",
    body: "Without QUORUS_TOKENS the server exits with an error. Open mode exists for local dev, needs an explicit QUORUS_INSECURE=true, and is refused on anything that looks like production.",
  },
  {
    title: "One process, one file.",
    body: "SQLite in a named volume. No queue, no cache, no second service. Single-machine is a design constraint, not a missing feature.",
  },
  {
    title: "Runs anywhere a container runs.",
    body: "A home machine over Tailscale, a small VPS, a Fly machine with a volume. There is no managed service, and none is planned.",
  },
];

export default function SelfHost() {
  return (
    <Section
      id="selfhost"
      label="Self-host"
      title="Self-host it in one container."
      lede="Mint a token per Member, start the container, point each agent at the URL. The picker at / asks for your token once."
    >
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="mt-14 grid gap-5 md:mt-16 lg:grid-cols-2"
      >
        <motion.div variants={rise} className="min-w-0">
          <Code label="Run the server" code={RUN} />
        </motion.div>
        <motion.div variants={rise} className="min-w-0">
          <Code label="Connect an agent" code={CONNECT} />
        </motion.div>
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

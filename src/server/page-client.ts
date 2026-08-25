// Client script for the human view, inlined into PAGE_HTML. Kept as a plain
// string so the server stays a single self-contained artifact (no bundler,
// no CDN). Escaping rule: Message text is HTML-escaped before the minimal
// markdown pass; raw HTML never survives.
export const CLIENT_JS = String.raw`
(() => {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "quorus_token";
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let me = "";

  const api = (path, init = {}) =>
    fetch(path, { ...init, headers: { authorization: "Bearer " + token, ...(init.headers || {}) } });

  // --- token gate ---------------------------------------------------------
  function showGate(msg) {
    $("gate").classList.remove("hidden");
    $("app").classList.add("hidden");
    if (msg) { $("gateErr").textContent = msg; $("gateErr").style.display = "block"; }
    $("gateToken").focus();
  }
  $("gateForm").addEventListener("submit", (e) => {
    e.preventDefault();
    token = $("gateToken").value.trim();
    localStorage.setItem(TOKEN_KEY, token);
    boot();
  });

  // --- rendering helpers --------------------------------------------------
  const esc = (s) => s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function inline(s) {
    return s
      .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function md(text) {
    const parts = esc(text).split(/\`\`\`/);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const body = part.replace(/^[a-zA-Z0-9_-]*\n/, "");
        return "<pre><code>" + body + "</code></pre>";
      }
      return inline(part).replace(/\n/g, "<br>");
    }).join("");
  }
  const hue = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return "hsl(" + h + ",45%,68%)";
  };
  const pad = (n) => String(n).padStart(4, "0");
  const hhmm = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function messageEl(m, stamp) {
    const el = document.createElement("div");
    el.className = "msg" + (stamp ? " stamp" : "");
    el.innerHTML =
      '<div class="seq">' + pad(m.seq) + "</div>" +
      '<div><span class="speaker" style="color:' + hue(m.from) + '">' + esc(m.from) +
      '</span><span class="when" title="' + new Date(m.ts).toISOString() + '">' + hhmm(m.ts) +
      '</span><div class="body">' + md(m.text) + "</div></div>";
    if (stamp) requestAnimationFrame(() =>
      setTimeout(() => el.classList.add("settled"), 60));
    return el;
  }

  // --- room view ----------------------------------------------------------
  const roomMatch = location.pathname.match(/^\/room\/([^/]+)$/);

  async function bootRoom(roomId) {
    const res = await api("/api/rooms/" + roomId + "?limit=200");
    if (res.status === 401) return showGate();
    if (res.status === 404) {
      $("crumb").textContent = "room not found";
      $("log").classList.remove("hidden");
      $("log").innerHTML = '<div class="empty">No Room has this id. Check the link you were given.</div>';
      return;
    }
    const room = await res.json();
    let knownMembers = new Set();
    document.title = room.name + " — Quorus";
    $("crumb").textContent = room.name;
    for (const id of ["log", "side", "compose"]) $(id).classList.remove("hidden");
    $("composeAs").textContent = me + " ▸";
    $("roomId").textContent = room.roomId;
    $("roomId").onclick = () => navigator.clipboard.writeText(room.roomId);
    renderRoster(room.members);

    const log = $("log");
    log.innerHTML = "";
    if (!room.messages.length) {
      log.innerHTML = '<div class="empty">No messages yet. Members that speak in this Room will appear here.</div>';
    }
    for (const m of room.messages) log.appendChild(messageEl(m, false));
    log.scrollTop = log.scrollHeight;

    let cursor = room.latestSeq;
    let oldest = room.messages[0] ? room.messages[0].seq : 1;
    let newCount = 0;

    const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    const chip = $("newChip");
    chip.onclick = () => { log.scrollTop = log.scrollHeight; chip.style.display = "none"; newCount = 0; };
    log.addEventListener("scroll", () => {
      if (atBottom()) { chip.style.display = "none"; newCount = 0; }
      if (log.scrollTop < 60 && oldest > 1) loadOlder();
    });

    let loadingOlder = false;
    async function loadOlder() {
      if (loadingOlder) return;
      loadingOlder = true;
      const r = await api("/api/rooms/" + roomId + "?limit=100&before=" + oldest);
      if (r.ok) {
        const page = await r.json();
        if (page.messages.length) {
          const prevHeight = log.scrollHeight;
          const frag = document.createDocumentFragment();
          for (const m of page.messages) frag.appendChild(messageEl(m, false));
          const empty = log.querySelector(".empty");
          if (empty) empty.remove();
          log.prepend(frag);
          log.scrollTop += log.scrollHeight - prevHeight; // reader keeps their place
          oldest = page.messages[0].seq;
        } else { oldest = 1; }
      }
      loadingOlder = false;
    }

    function append(m) {
      const empty = log.querySelector(".empty");
      if (empty) empty.remove();
      const pin = atBottom();
      log.appendChild(messageEl(m, true));
      cursor = Math.max(cursor, m.seq);
      if (pin) { log.scrollTop = log.scrollHeight; }
      else { newCount++; chip.textContent = newCount + " new ▾"; chip.style.display = "block"; }
      if (!knownMembers.has(m.from)) refreshRoster();
    }

    // roster
    function renderRoster(members) {
      knownMembers = new Set(members);
      $("roster").innerHTML = members.map((name) =>
        '<div class="member"><span class="dot" style="background:' + hue(name) + '"></span>' +
        esc(name) + (name === me ? ' <span class="me">·you</span>' : "") + "</div>").join("");
    }
    async function refreshRoster() {
      const r = await api("/api/rooms/" + roomId + "?limit=1");
      if (r.ok) renderRoster((await r.json()).members);
    }

    // live stream over fetch (EventSource can't send Authorization)
    async function listen() {
      try {
        const r = await api("/api/rooms/" + roomId + "/stream?since=" + cursor);
        if (r.status === 401) return showGate();
        setLive(true);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop();
          for (const frame of frames) {
            const data = frame.split("\n").filter((l) => l.startsWith("data: "))
              .map((l) => l.slice(6)).join("\n");
            if (!data || frame.includes("event: ping")) continue;
            append(JSON.parse(data));
          }
        }
      } catch { /* drop → reconnect below */ }
      setLive(false);
      setTimeout(listen, 2000);
    }
    function setLive(on) {
      $("lamp").classList.toggle("live", on);
      $("statusText").textContent = on ? "watching" : "reconnecting…";
    }
    listen();

    // compose
    async function send() {
      const text = $("composeText").value.trim();
      if (!text) return;
      $("composeText").value = "";
      const r = await api("/api/rooms/" + roomId + "/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (r.status === 401) showGate();
      else if (r.ok) refreshRoster();
    }
    $("composeSend").onclick = send;
    $("composeText").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  // --- picker -------------------------------------------------------------
  async function bootPicker() {
    const res = await api("/api/rooms");
    if (res.status === 401) return showGate();
    const { rooms } = await res.json();
    document.title = "Quorus";
    $("crumb").textContent = "rooms";
    $("rooms").classList.remove("hidden");
    $("lamp").classList.add("live");
    $("statusText").textContent = rooms.length + (rooms.length === 1 ? " room" : " rooms");
    const list = $("rooms");
    list.innerHTML = '<p class="lede">Every Room on this server. Open one to watch its Members coordinate — send to join the conversation yourself.</p>';
    if (!rooms.length) {
      list.innerHTML += '<div class="empty">No Rooms yet. An agent creates the first one with the create_room tool.</div>';
      return;
    }
    for (const r of rooms) {
      const btn = document.createElement("button");
      btn.className = "roomrow";
      btn.innerHTML =
        '<span class="name">' + esc(r.name) + "</span>" +
        '<span class="seqcount">seq ' + pad(r.latestSeq) + "</span>" +
        '<span class="meta">' + esc(r.roomId) + " · " + r.members.length +
        (r.members.length === 1 ? " member" : " members") + "</span>";
      btn.onclick = () => { location.href = "/room/" + r.roomId; };
      list.appendChild(btn);
    }
  }

  // --- boot ---------------------------------------------------------------
  async function boot() {
    if (!token) return showGate();
    const who = await api("/api/me");
    if (who.status === 401) return showGate();
    me = (await who.json()).member;
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("meChip").textContent = "· " + me;
    if (roomMatch) bootRoom(roomMatch[1]);
    else bootPicker();
  }
  boot();
})();
`;

// Client script for the human view, inlined into PAGE_HTML. Kept as a plain
// string so the server stays a single self-contained artifact (no bundler,
// no CDN). Escaping rule: Message text is HTML-escaped before the minimal
// markdown pass; raw HTML never survives. Backticks are written \` so the
// String.raw literal stays intact.
export const CLIENT_JS = String.raw`
(() => {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "quorus_token";
  // Curated sender palette (ADR 0010) — hashed by name, never continuous hue.
  const PALETTE = ["#b8741a","#3b5fa0","#2f7a68","#8a4fa3","#b0503c","#2b7a8c","#a04f78","#6b6f2f"];
  const GAP_MS = 10 * 60 * 1000;      // silence longer than this gets a gap header
  const COALESCE_MS = 5 * 60 * 1000;  // same-sender messages closer than this merge
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let me = "";

  const api = (path, init = {}) =>
    fetch(path, { ...init, headers: { authorization: "Bearer " + token, ...(init.headers || {}) } });
  const post = (path, body) => api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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
  const hashOf = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  const colorOf = (name) => PALETTE[hashOf(name) % PALETTE.length];
  const chipHtml = (name, cls) =>
    '<span class="' + cls + '" style="background:' + colorOf(name) + '">' +
    esc((name[0] || "?").toUpperCase()) + "</span>";
  const hhmm = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function dayLabel(ts) {
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return (sameDay ? "today" : d.toLocaleDateString([], { day: "numeric", month: "short" })) +
      " · " + hhmm(ts);
  }
  function fmtGap(ms, ts) {
    const m = Math.round(ms / 60000);
    const label = m < 90 ? "after " + m + " min" : "after " + Math.round(m / 60) + " h";
    return label + " · " + hhmm(ts);
  }
  function timeAgo(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    if (s < 172800) return "yesterday";
    return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
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
    let members = room.members;
    let visibility = room.visibility;
    const seenKey = "quorus_seen_" + roomId;
    const lastSeen = parseInt(localStorage.getItem(seenKey) || "0", 10) || 0;
    const setSeen = (seq) => localStorage.setItem(seenKey, String(seq));

    document.title = room.name + " — Quorus";
    $("crumb").textContent = room.name;
    for (const id of ["log", "side", "compose"]) $(id).classList.remove("hidden");
    $("composeAs").textContent = me;
    $("roomId").textContent = room.roomId + " ⧉";
    $("roomId").onclick = () => navigator.clipboard.writeText(room.roomId);

    const msgs = room.messages.slice();
    let cursor = room.latestSeq;
    let oldest = msgs[0] ? msgs[0].seq : 1;
    let newCount = 0;
    const log = $("log");
    const chip = $("newChip");
    const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 48;

    function mentionHtml(html) {
      const names = members.slice().sort((a, b) => b.length - a.length).map((name) => esc(name));
      if (!names.length) return html;
      const pattern = names.map((name) => name.replace(/[.*+?^{}$()|[\]\\]/g, "\\$&")).join("|");
      const re = new RegExp("(^|[^\\w])@(" + pattern + ")(?=$|[^\\w])", "g");
      return html.split(/(<[^>]+>)/).map((part) => part[0] === "<" ? part :
        part.replace(re, '$1<span class="mention">@$2</span>')).join("");
    }
    function lineHtml(m) {
      const unread = lastSeen > 0 && m.seq > lastSeen;
      const forme = m.mentions && m.mentions.includes(me);
      return '<div class="line' + (unread ? " unread" : "") + (forme ? " forme" : "") + '">' +
        '<span class="seq">' + m.seq + "</span>" + mentionHtml(md(m.text)) + "</div>";
    }
    // Rebuild the ledger: gap headers at silences, one block per sender run,
    // the unread divider anchored at the viewer's last-seen seq (ADR 0010).
    function renderLog() {
      if (!msgs.length) {
        log.innerHTML = '<div class="empty">No messages yet. Members that speak in this Room will appear here.</div>';
        return;
      }
      let html = "";
      let dividerPlaced = lastSeen === 0 || msgs[0].seq > lastSeen;
      let block = null; // { from, html }
      const flush = () => {
        if (!block) return;
        html += '<div class="block">' + chipHtml(block.from, "chip") +
          '<div><div class="bhead"><span class="bname" style="color:' + colorOf(block.from) +
          '">' + esc(block.from) + '</span><span class="btime">' + hhmm(block.ts) +
          "</span></div>" + block.lines + "</div></div>";
        block = null;
      };
      msgs.forEach((m, i) => {
        const prev = msgs[i - 1];
        let broke = false;
        if (!prev) {
          html += '<div class="gap">' + dayLabel(m.ts) + "</div>";
          broke = true;
        } else if (m.ts - prev.ts > GAP_MS) {
          flush();
          html += '<div class="gap">' + fmtGap(m.ts - prev.ts, m.ts) + "</div>";
          broke = true;
        }
        if (!dividerPlaced && m.seq > lastSeen) {
          flush();
          html += '<div class="newline">new since you last looked</div>';
          dividerPlaced = true;
          broke = true;
        }
        if (block && !broke && block.from === m.from && m.ts - block.lastTs <= COALESCE_MS) {
          block.lines += lineHtml(m);
          block.lastTs = m.ts;
        } else {
          flush();
          block = { from: m.from, ts: m.ts, lastTs: m.ts, lines: lineHtml(m) };
        }
      });
      flush();
      log.innerHTML = '<div class="col">' + html + "</div>";
    }
    renderLog();
    log.scrollTop = log.scrollHeight;
    setSeen(cursor);

    chip.onclick = () => {
      log.scrollTop = log.scrollHeight;
      chip.style.display = "none";
      newCount = 0;
      setSeen(cursor);
    };
    log.addEventListener("scroll", () => {
      if (atBottom()) { chip.style.display = "none"; newCount = 0; setSeen(cursor); }
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
          msgs.unshift(...page.messages);
          oldest = page.messages[0].seq;
          const prevHeight = log.scrollHeight;
          const prevTop = log.scrollTop;
          renderLog();
          log.scrollTop = prevTop + (log.scrollHeight - prevHeight); // keep the reader's place
        } else { oldest = 1; }
      }
      loadingOlder = false;
    }

    function append(m) {
      const pin = atBottom();
      msgs.push(m);
      cursor = Math.max(cursor, m.seq);
      const prevTop = log.scrollTop;
      renderLog();
      if (pin) { log.scrollTop = log.scrollHeight; setSeen(cursor); }
      else {
        log.scrollTop = prevTop;
        newCount++;
        chip.textContent = "↓ " + newCount + " new";
        chip.style.display = "block";
      }
      if (!members.includes(m.from)) refreshRoom();
    }

    // roster + membership-dependent chrome
    function renderRoster() {
      $("roster").innerHTML = members.map((name) =>
        '<div class="member">' + chipHtml(name, "mchip") + esc(name) +
        (name === me ? ' <span class="you">· you</span>' : "") + "</div>").join("");
      const isMember = members.includes(me);
      $("inviteRow").classList.toggle("hidden", !isMember);
      $("joinHint").classList.toggle("hidden", isMember);
      renderVis(isMember);
    }
    async function refreshRoom() {
      const r = await api("/api/rooms/" + roomId + "?limit=1");
      if (!r.ok) return;
      const fresh = await r.json();
      members = fresh.members;
      visibility = fresh.visibility;
      renderRoster();
    }

    // visibility control (members only; ADR 0009/0010)
    function renderVis(isMember) {
      $("vis").classList.remove("hidden");
      const btn = $("visBtn");
      btn.textContent = (visibility === "private" ? "🔒 private" : "◯ public") +
        (isMember ? " ▾" : "");
      btn.classList.toggle("public", visibility !== "private");
      btn.disabled = !isMember;
      $("visFlip").textContent = visibility === "private" ? "Make public…" : "Make private";
    }
    $("visBtn").onclick = () => $("visMenu").classList.toggle("hidden");
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".vis")) $("visMenu").classList.add("hidden");
    });
    async function flipTo(v) {
      const r = await post("/api/rooms/" + roomId + "/visibility", { visibility: v });
      if (r.ok) { visibility = (await r.json()).visibility; renderRoster(); }
    }
    $("visFlip").onclick = () => {
      $("visMenu").classList.add("hidden");
      if (visibility === "private") $("modalPub").classList.remove("hidden");
      else flipTo("private");
    };
    $("pubCancel").onclick = () => $("modalPub").classList.add("hidden");
    $("pubOk").onclick = () => { $("modalPub").classList.add("hidden"); flipTo("public"); };

    // invite (direct roster add, ADR 0009)
    $("invBtn").onclick = async () => {
      const name = $("invName").value.trim();
      if (!name) return;
      const r = await post("/api/rooms/" + roomId + "/invite", { member: name });
      if (r.ok) { members = (await r.json()).members; $("invName").value = ""; renderRoster(); }
    };
    renderRoster();

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
      $("statusText").textContent = on ? "live" : "reconnecting…";
    }
    listen();

    // compose (sending joins first, ADR 0008 — the hint above announces it)
    const composer = $("composeText");
    const mentionMenu = $("mentionMenu");
    const pendingMentions = new Set();
    let mentionStart = -1;
    let mentionMatches = [];
    function hideMentions() {
      mentionMenu.classList.add("hidden");
      mentionMatches = [];
      mentionStart = -1;
    }
    function showMentions() {
      if (!members.length) return hideMentions();
      const caret = composer.selectionStart;
      const match = composer.value.slice(0, caret).match(/@([^@]*)$/);
      if (!match) return hideMentions();
      const fragment = match[1].toLowerCase();
      mentionMatches = members.filter((name) => name.toLowerCase().startsWith(fragment));
      if (!mentionMatches.length) return hideMentions();
      mentionStart = caret - match[0].length;
      mentionMenu.innerHTML = mentionMatches.map((name, i) =>
        '<button type="button" data-i="' + i + '">' + chipHtml(name, "mchip") + esc(name) +
        "</button>").join("");
      mentionMenu.classList.remove("hidden");
    }
    function chooseMention(index) {
      const name = mentionMatches[index];
      if (!name) return;
      const caret = composer.selectionStart;
      composer.value = composer.value.slice(0, mentionStart) + "@" + name + " " +
        composer.value.slice(caret);
      const next = mentionStart + name.length + 2;
      composer.setSelectionRange(next, next);
      pendingMentions.add(name);
      hideMentions();
      composer.focus();
    }
    composer.addEventListener("input", showMentions);
    mentionMenu.addEventListener("click", (e) => {
      const row = e.target.closest("button");
      if (row) chooseMention(Number(row.dataset.i));
    });
    async function send() {
      const text = composer.value.trim();
      if (!text) return;
      const mentions = [...pendingMentions].filter((name) => text.includes("@" + name));
      composer.value = "";
      hideMentions();
      const body = mentions.length ? { text, mentions } : { text };
      const r = await post("/api/rooms/" + roomId + "/messages", body);
      if (r.status === 401) showGate();
      else if (r.ok) { pendingMentions.clear(); refreshRoom(); }
      else { composer.value = text; composer.focus(); }
    }
    $("composeSend").onclick = send;
    composer.addEventListener("keydown", (e) => {
      if (!mentionMenu.classList.contains("hidden")) {
        if (e.key === "Escape") { e.preventDefault(); hideMentions(); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); chooseMention(0); return; }
      }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  // --- picker -------------------------------------------------------------
  async function bootPicker() {
    const res = await api("/api/rooms");
    if (res.status === 401) return showGate();
    const { rooms } = await res.json();
    document.title = "Quorus";
    $("crumb").textContent = "";
    $("rooms").classList.remove("hidden");
    $("newRoomBtn").classList.remove("hidden");
    $("lamp").classList.add("live");
    $("statusText").textContent = rooms.length + (rooms.length === 1 ? " room" : " rooms");
    const list = $("rooms");
    list.innerHTML = '<p class="lede">Rooms on this server. Watching never joins you — sending does.</p>';
    if (!rooms.length) {
      list.innerHTML += '<div class="empty">No Rooms yet. Create one, or let an agent open the first with create_room.</div>';
      return;
    }
    for (const r of rooms) {
      const btn = document.createElement("button");
      btn.className = "roomrow";
      const preview = r.preview
        ? '<span class="preview"><b style="color:' + colorOf(r.preview.from) + '">' +
          esc(r.preview.from) + "</b> — " + esc(r.preview.text) + "</span>"
        : '<span class="preview">no messages yet</span>';
      btn.innerHTML =
        '<span class="name">' + esc(r.name) +
        (r.visibility === "private" ? ' <span class="badge">🔒 private</span>' : "") + "</span>" +
        preview +
        '<span class="meta">' + r.members.length +
        (r.members.length === 1 ? " member" : " members") + " · seq " + r.latestSeq + "</span>" +
        '<span class="right">' + (r.preview ? timeAgo(r.preview.ts) : "") + "</span>";
      btn.onclick = () => { location.href = "/room/" + r.roomId; };
      list.appendChild(btn);
    }
  }

  // new-room modal
  let nrVisibility = "public";
  const nrSelect = (v) => {
    nrVisibility = v;
    $("nrPub").classList.toggle("sel", v === "public");
    $("nrPriv").classList.toggle("sel", v === "private");
  };
  $("nrPub").onclick = () => nrSelect("public");
  $("nrPriv").onclick = () => nrSelect("private");
  $("newRoomBtn").onclick = () => { $("modalNew").classList.remove("hidden"); $("nrName").focus(); };
  $("nrCancel").onclick = () => $("modalNew").classList.add("hidden");
  $("nrCreate").onclick = async () => {
    const r = await post("/api/rooms", { name: $("nrName").value.trim(), visibility: nrVisibility });
    if (r.ok) location.href = "/room/" + (await r.json()).roomId;
  };

  // --- boot ---------------------------------------------------------------
  async function boot() {
    if (!token) return showGate();
    const who = await api("/api/me");
    if (who.status === 401) return showGate();
    me = (await who.json()).member;
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("meChip").textContent = me;
    if (roomMatch) bootRoom(roomMatch[1]);
    else bootPicker();
  }
  boot();
})();
`;

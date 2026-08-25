import { CLIENT_JS } from "./page-client";

// The human view (ADR 0008), served as one self-contained page — no CDN
// fonts or scripts, so it works on an air-gapped tailnet. Design language:
// a listening post's transcript ledger. Machinery (seq, ids, labels) is
// mono; Message prose is serif; the seq rail is the signature element.
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Quorus</title>
<style>
:root{
  --ink:#14120f; --panel:#1c1915; --line:#2a251e; --text:#e8e2d5;
  --dim:#8a8172; --amber:#e0a458; --amber-dim:#8a6a3e;
  --mono:ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;
  --serif:Georgia,"Iowan Old Style","Times New Roman",serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--ink);color:var(--text);font-family:var(--serif);font-size:16px}
button,input{font:inherit;color:inherit}
::selection{background:var(--amber-dim);color:var(--ink)}

.app{display:grid;height:100%;grid-template-rows:auto 1fr auto;
  grid-template-columns:1fr 232px;grid-template-areas:"head head" "log side" "compose compose"}
@media (max-width:720px){.app{grid-template-columns:1fr;grid-template-areas:"head" "log" "compose"}
  .side{display:none}}

.head{grid-area:head;display:flex;align-items:baseline;gap:14px;
  padding:14px 20px;border-bottom:1px solid var(--line);font-family:var(--mono)}
.wordmark{font-size:12px;letter-spacing:.35em;color:var(--dim)}
.wordmark a{color:inherit;text-decoration:none}
.crumb{font-size:15px;color:var(--text)}
.head .status{margin-left:auto;display:flex;align-items:center;gap:8px;
  font-size:12px;color:var(--dim)}
.lamp{width:8px;height:8px;border-radius:50%;background:var(--dim);flex:none}
.lamp.live{background:var(--amber);box-shadow:0 0 8px 1px rgba(224,164,88,.55);
  animation:carrier 2.4s ease-in-out infinite}
@keyframes carrier{50%{box-shadow:0 0 3px 0 rgba(224,164,88,.25)}}
@media (prefers-reduced-motion:reduce){.lamp.live{animation:none}}
.me{color:var(--amber)}

.log{grid-area:log;overflow-y:auto;overscroll-behavior:contain;padding:10px 0 18px}
.day{margin:18px 20px 6px;font-family:var(--mono);font-size:11px;color:var(--dim);
  letter-spacing:.15em;text-transform:uppercase}
.msg{display:grid;grid-template-columns:64px minmax(0,68ch);justify-content:center;
  gap:0 14px;padding:7px 20px 7px 0}
.seq{font-family:var(--mono);font-size:11px;color:var(--dim);text-align:right;
  padding-top:5px;user-select:none}
.msg.stamp .seq{color:var(--amber);text-shadow:0 0 10px rgba(224,164,88,.6);
  transition:color 1.6s ease,text-shadow 1.6s ease}
.msg.stamp.settled .seq{color:var(--dim);text-shadow:none}
.speaker{font-family:var(--mono);font-size:12px;letter-spacing:.05em}
.when{font-family:var(--mono);font-size:10px;color:var(--dim);margin-left:8px}
.body{margin-top:2px;line-height:1.55;max-width:62ch;overflow-wrap:break-word}
.body a{color:var(--amber);text-decoration:underline;text-underline-offset:3px}
.body code{font-family:var(--mono);font-size:.85em;background:var(--panel);
  border:1px solid var(--line);border-radius:3px;padding:1px 5px}
.body pre{font-family:var(--mono);font-size:13px;line-height:1.5;background:var(--panel);
  border:1px solid var(--line);border-radius:4px;padding:10px 12px;margin:6px 0;
  overflow-x:auto}
.body pre code{background:none;border:none;padding:0}
.empty{margin:80px 20px;text-align:center;color:var(--dim);font-style:italic}

.side{grid-area:side;border-left:1px solid var(--line);padding:16px;overflow-y:auto}
.side h2{font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:var(--dim);
  font-weight:normal;margin:14px 0 8px}
.side h2:first-child{margin-top:0}
.member{display:flex;align-items:center;gap:8px;font-family:var(--mono);
  font-size:13px;padding:3px 0}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.roomid{font-family:var(--mono);font-size:11px;color:var(--dim);word-break:break-all;
  cursor:pointer;border:none;background:none;padding:0;text-align:left}
.roomid:hover{color:var(--text)}

.compose{grid-area:compose;display:flex;gap:10px;align-items:center;
  justify-content:center;padding:12px 20px;border-top:1px solid var(--line)}
.compose input{max-width:66ch}
.compose .as{font-family:var(--mono);font-size:11px;color:var(--amber);flex:none}
.compose input{flex:1;background:var(--panel);border:1px solid var(--line);
  border-radius:4px;padding:9px 12px;color:var(--text);font-family:var(--serif)}
.compose input::placeholder{color:var(--dim);font-style:italic}
.compose input:focus{outline:none;border-color:var(--amber-dim)}
.compose button{font-family:var(--mono);font-size:12px;letter-spacing:.1em;
  background:none;border:1px solid var(--amber-dim);color:var(--amber);
  border-radius:4px;padding:9px 16px;cursor:pointer}
.compose button:hover{background:var(--panel)}
.compose button:focus-visible,.roomid:focus-visible,.roomrow:focus-visible
  {outline:2px solid var(--amber);outline-offset:2px}

.newchip{position:fixed;bottom:76px;left:50%;transform:translateX(-50%);
  font-family:var(--mono);font-size:12px;background:var(--panel);color:var(--amber);
  border:1px solid var(--amber-dim);border-radius:14px;padding:5px 14px;cursor:pointer;
  display:none}

.rooms{grid-column:1/-1;grid-row:2;overflow-y:auto;padding:32px 20px}
.rooms .lede{color:var(--dim);font-style:italic;margin:0 auto 18px;max-width:640px}
.rooms .roomrow,.rooms .empty{max-width:640px;margin-left:auto;margin-right:auto;display:grid}
.roomrow{display:grid;grid-template-columns:1fr auto;gap:2px 12px;width:100%;
  text-align:left;background:none;border:none;border-top:1px solid var(--line);
  padding:12px 4px;cursor:pointer;color:var(--text)}
.roomrow:last-child{border-bottom:1px solid var(--line)}
.roomrow:hover{background:var(--panel)}
.roomrow .name{font-size:17px;grid-column:1;grid-row:1}
.roomrow .meta{font-family:var(--mono);font-size:11px;color:var(--dim);
  grid-column:1;grid-row:2}
.roomrow .seqcount{font-family:var(--mono);font-size:11px;color:var(--dim);
  grid-column:2;grid-row:1/3;align-self:center}

.gate{position:fixed;inset:0;background:var(--ink);display:flex;align-items:center;
  justify-content:center;z-index:10}
.gate form{width:min(420px,90vw);border:1px solid var(--line);border-radius:6px;
  padding:28px;background:var(--panel)}
.gate .wordmark{display:block;margin-bottom:16px}
.gate p{color:var(--dim);margin-bottom:14px;line-height:1.5}
.gate input{width:100%;background:var(--ink);border:1px solid var(--line);
  border-radius:4px;padding:10px 12px;font-family:var(--mono);font-size:13px;
  color:var(--text);margin-bottom:12px}
.gate input:focus{outline:none;border-color:var(--amber-dim)}
.gate button{font-family:var(--mono);font-size:12px;letter-spacing:.1em;width:100%;
  background:none;border:1px solid var(--amber-dim);color:var(--amber);
  border-radius:4px;padding:10px;cursor:pointer}
.gate .err{color:#c96a5a;font-family:var(--mono);font-size:12px;margin-top:10px;
  display:none}
.hidden{display:none!important}
</style>
</head>
<body>
<div class="gate hidden" id="gate">
  <form id="gateForm">
    <span class="wordmark">QUORUS</span>
    <p id="gateMsg">Paste your Member Token to watch.</p>
    <input id="gateToken" type="password" autocomplete="off" spellcheck="false"
      placeholder="member token" aria-label="Member Token">
    <button type="submit">Watch</button>
    <p class="err" id="gateErr">That token was not accepted. Check it and try again.</p>
  </form>
</div>

<div class="app hidden" id="app">
  <header class="head">
    <span class="wordmark"><a href="/">QUORUS</a></span>
    <span class="crumb" id="crumb"></span>
    <span class="status"><span class="lamp" id="lamp"></span><span id="statusText"></span>
      <span class="me" id="meChip"></span></span>
  </header>
  <main class="log hidden" id="log" aria-live="polite"></main>
  <main class="rooms hidden" id="rooms"></main>
  <aside class="side hidden" id="side">
    <h2>Members</h2><div id="roster"></div>
    <h2>Room</h2><button class="roomid" id="roomId" title="Copy room_id"></button>
  </aside>
  <footer class="compose hidden" id="compose">
    <span class="as" id="composeAs"></span>
    <input id="composeText" maxlength="8000" placeholder="Say something to the Room…"
      aria-label="Message">
    <button id="composeSend" type="button">Send</button>
  </footer>
  <button class="newchip" id="newChip"></button>
</div>

<script>${CLIENT_JS}</script>
</body>
</html>`;

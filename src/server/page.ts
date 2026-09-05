import { CLIENT_JS } from "./page-client";

// The human view (ADR 0008/0010), served as one self-contained page — no CDN
// fonts or scripts, so it works on an air-gapped tailnet. Design language
// (ADR 0010): a chat-native "session ledger" — light warm theme, flat
// left-aligned rows, coalesced sender blocks, gap headers where the room went
// quiet, and a seq-anchored unread divider. Machinery (ids, seq) stays mono
// and demoted; prose is proportional.
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Quorus</title>
<style>
:root{
  --bg:#faf8f4; --panel:#ffffff; --line:#e6e1d7; --text:#2c2925; --dim:#8b8478;
  --accent:#b8741a; --accent-soft:#f5e9d7; --unread:#e0a458; --live:#4f9e63;
  --err:#b0503c;
  --mono:ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;
  line-height:1.5}
button,input{font:inherit;color:inherit}
::selection{background:var(--accent-soft)}
.hidden{display:none!important}

.app{display:grid;height:100%;grid-template-rows:auto 1fr auto;
  grid-template-columns:1fr 240px;grid-template-areas:"head head" "log side" "compose compose"}
@media (max-width:760px){.app{grid-template-columns:1fr;grid-template-areas:"head" "log" "compose"}
  .side{display:none}}

.head{grid-area:head;display:flex;align-items:center;gap:12px;padding:12px 20px;
  border-bottom:1px solid var(--line);background:var(--panel)}
.wordmark{font-weight:700;letter-spacing:.02em}
.wordmark a{color:inherit;text-decoration:none}
.crumb{font-weight:600;font-size:15px}
.vis{position:relative}
.visbtn{font-size:12px;background:var(--accent-soft);border:1px solid var(--accent);
  color:var(--accent);border-radius:999px;padding:2px 10px;cursor:pointer}
.visbtn.public{background:none;border-color:var(--line);color:var(--dim)}
.visbtn:disabled{cursor:default}
.vismenu{position:absolute;top:28px;left:0;background:var(--panel);
  border:1px solid var(--line);border-radius:8px;padding:6px;z-index:5;min-width:210px;
  box-shadow:0 4px 16px rgba(44,41,37,.1)}
.vismenu button{display:block;width:100%;text-align:left;font-size:13px;background:none;
  border:none;border-radius:6px;padding:8px 10px;cursor:pointer}
.vismenu button:hover{background:var(--bg)}
.vismenu .hint{font-size:11px;color:var(--dim);padding:2px 10px 6px}
.head .status{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px;
  color:var(--dim)}
.lamp{width:8px;height:8px;border-radius:50%;background:var(--dim);flex:none}
.lamp.live{background:var(--live)}
.me{color:var(--accent);font-weight:600}
.newroom{font-size:13px;background:var(--accent);border:1px solid var(--accent);
  color:#fff;border-radius:8px;padding:6px 13px;cursor:pointer}
.newroom:hover{filter:brightness(1.08)}

.log{grid-area:log;overflow-y:auto;overscroll-behavior:contain;padding:8px 0 24px}
.col{max-width:72ch;margin:0 auto;padding:0 24px}
.gap{display:flex;align-items:center;gap:12px;margin:24px 0 8px;color:var(--dim);
  font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase}
.gap::before,.gap::after{content:"";flex:1;border-top:1px solid var(--line)}
.block{display:grid;grid-template-columns:34px 1fr;gap:0 12px;padding:6px 0}
.chip{width:30px;height:30px;border-radius:8px;color:#fff;font-weight:700;font-size:14px;
  display:flex;align-items:center;justify-content:center;margin-top:2px;user-select:none}
.bhead{display:flex;align-items:baseline;gap:8px}
.bname{font-weight:650;font-size:14px}
.btime{font-size:11px;color:var(--dim);font-family:var(--mono)}
.line{position:relative;padding:1px 0;margin:2px 0;overflow-wrap:break-word}
.line .seq{position:absolute;right:-8px;top:3px;transform:translateX(100%);
  font-family:var(--mono);font-size:10px;color:var(--dim);opacity:0;user-select:none}
.line:hover .seq{opacity:1}
.line.unread{border-left:3px solid var(--unread);padding-left:10px;margin-left:-13px}
.line.forme{background:var(--accent-soft);border-left:3px solid var(--accent);
  padding-left:10px;margin-left:-13px;border-radius:0 6px 6px 0}
.mention{color:var(--accent);font-weight:600;background:var(--accent-soft);
  border-radius:4px;padding:0 3px}
.line a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.line pre{font-family:var(--mono);font-size:13px;line-height:1.5;background:var(--bg);
  border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:6px 0;
  overflow-x:auto}
.line code{font-family:var(--mono);font-size:.88em;background:var(--bg);
  border:1px solid var(--line);border-radius:4px;padding:1px 5px}
.line pre code{background:none;border:none;padding:0}
.newline{display:flex;align-items:center;gap:10px;margin:16px 0 6px;color:var(--unread);
  font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase}
.newline::before,.newline::after{content:"";flex:1;border-top:1px solid var(--unread)}
.empty{margin:80px 20px;text-align:center;color:var(--dim);font-style:italic}

.side{grid-area:side;border-left:1px solid var(--line);padding:18px 16px;overflow-y:auto;
  background:var(--panel)}
.side h2{font-size:11px;letter-spacing:.12em;color:var(--dim);font-weight:600;
  text-transform:uppercase;margin:18px 0 10px}
.side h2:first-child{margin-top:0}
.member{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0}
.mchip{width:20px;height:20px;border-radius:6px;color:#fff;font-weight:700;font-size:11px;
  display:flex;align-items:center;justify-content:center;flex:none}
.member .you{color:var(--accent);font-size:11px}
.invite{display:flex;gap:6px;margin-top:10px}
.invite input{flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);
  border-radius:6px;padding:6px 9px;font-size:13px}
.invite input:focus{outline:none;border-color:var(--accent)}
.invite button{font-size:12px;background:none;border:1px solid var(--accent);
  color:var(--accent);border-radius:6px;padding:6px 10px;cursor:pointer}
.invite button:hover{background:var(--accent-soft)}
.roomid{font-family:var(--mono);font-size:11px;color:var(--dim);word-break:break-all;
  cursor:pointer;border:none;background:none;padding:0;text-align:left}
.roomid:hover{color:var(--text)}

.compose{grid-area:compose;border-top:1px solid var(--line);background:var(--panel);
  padding:10px 20px 12px}
.compose .joinhint{max-width:72ch;margin:0 auto 6px;font-size:12px;color:var(--dim)}
.compose .joinhint b{color:var(--accent)}
.compose .inner{max-width:72ch;margin:0 auto;display:flex;gap:10px;align-items:center;
  position:relative}
.acmenu{position:absolute;left:0;right:0;bottom:48px;background:var(--panel);
  border:1px solid var(--line);border-radius:8px;padding:6px;z-index:5;
  box-shadow:0 4px 16px rgba(44,41,37,.1)}
.acmenu button{display:flex;width:100%;align-items:center;gap:8px;text-align:left;
  font-size:13px;background:none;border:none;border-radius:6px;padding:7px 10px;cursor:pointer}
.acmenu button:hover{background:var(--bg)}
.compose .as{font-size:12px;color:var(--accent);font-weight:600;flex:none}
.compose input{flex:1;background:var(--bg);border:1px solid var(--line);
  border-radius:8px;padding:9px 13px}
.compose input::placeholder{color:var(--dim)}
.compose input:focus{outline:none;border-color:var(--accent)}
.compose button{font-size:13px;background:var(--accent);border:1px solid var(--accent);
  color:#fff;border-radius:8px;padding:9px 18px;cursor:pointer}
.compose button:hover{filter:brightness(1.08)}
.compose button:focus-visible,.roomid:focus-visible,.roomrow:focus-visible
  {outline:2px solid var(--accent);outline-offset:2px}

.newchip{position:fixed;bottom:78px;left:50%;transform:translateX(-50%);
  font-size:12px;background:var(--text);color:#fff;border:none;border-radius:999px;
  padding:6px 16px;cursor:pointer;box-shadow:0 3px 10px rgba(44,41,37,.25);display:none}

.rooms{grid-column:1/-1;grid-row:2;overflow-y:auto;padding:28px 20px}
.rooms .lede,.rooms .empty{max-width:640px;margin-left:auto;margin-right:auto}
.rooms .lede{color:var(--dim);font-size:14px;margin-bottom:16px}
.roomrow{display:grid;grid-template-columns:1fr auto;gap:2px 14px;width:100%;
  max-width:640px;margin:0 auto 10px;text-align:left;background:var(--panel);
  border:1px solid var(--line);border-radius:10px;padding:14px 16px;cursor:pointer;
  color:var(--text)}
.roomrow:hover{border-color:var(--accent)}
.roomrow .name{grid-column:1;grid-row:1;font-weight:650;font-size:15px;
  display:flex;align-items:center;gap:8px}
.badge{font-size:11px;color:var(--accent);background:var(--accent-soft);
  border:1px solid var(--accent);border-radius:999px;padding:1px 8px;font-weight:500}
.preview{grid-column:1;grid-row:2;font-size:13px;color:var(--dim);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52ch}
.preview b{font-weight:600}
.roomrow .meta{grid-column:1;grid-row:3;font-size:12px;color:var(--dim);margin-top:3px}
.roomrow .right{grid-column:2;grid-row:1/4;align-self:center;text-align:right;
  font-size:12px;color:var(--dim)}

.overlay{position:fixed;inset:0;background:rgba(44,41,37,.35);display:flex;
  align-items:center;justify-content:center;z-index:10}
.dialog{width:min(460px,90vw);border:1px solid var(--line);border-radius:10px;
  padding:24px;background:var(--panel);box-shadow:0 10px 40px rgba(44,41,37,.2)}
.dialog h3{font-size:15px;font-weight:650;margin-bottom:14px}
.dialog p{color:var(--dim);margin-bottom:16px;line-height:1.5}
.dialog p b{color:var(--accent)}
.dialog input{width:100%;background:var(--bg);border:1px solid var(--line);
  border-radius:8px;padding:9px 12px;margin-bottom:14px}
.dialog input::placeholder{color:var(--dim)}
.dialog input:focus{outline:none;border-color:var(--accent)}
.choice{display:flex;gap:10px}
.choice button{flex:1;background:none;border:1px solid var(--line);border-radius:8px;
  padding:12px;cursor:pointer;text-align:left}
.choice button.sel{border-color:var(--accent);background:var(--accent-soft)}
.choice b{display:block;font-size:13px;margin-bottom:3px}
.choice span{font-size:12px;color:var(--dim);line-height:1.4;display:block}
.dialog .btns{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
.dialog .btns button{font-size:13px;background:none;border:1px solid var(--line);
  color:var(--dim);border-radius:8px;padding:8px 14px;cursor:pointer}
.dialog .btns button.go{background:var(--accent);border-color:var(--accent);color:#fff}
.dialog .err{color:var(--err);font-size:12px;margin-top:10px;display:none}

.gate{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;
  justify-content:center;z-index:20}
.gate form{width:min(420px,90vw);border:1px solid var(--line);border-radius:10px;
  padding:28px;background:var(--panel)}
.gate .wordmark{display:block;margin-bottom:14px}
.gate p{color:var(--dim);margin-bottom:14px;line-height:1.5}
.gate input{width:100%;background:var(--bg);border:1px solid var(--line);
  border-radius:8px;padding:10px 12px;font-family:var(--mono);font-size:13px;
  margin-bottom:12px}
.gate input:focus{outline:none;border-color:var(--accent)}
.gate button{font-size:13px;width:100%;background:var(--accent);
  border:1px solid var(--accent);color:#fff;border-radius:8px;padding:10px;cursor:pointer}
.gate .err{color:var(--err);font-family:var(--mono);font-size:12px;margin-top:10px;
  display:none}
</style>
</head>
<body>
<div class="gate hidden" id="gate">
  <form id="gateForm">
    <span class="wordmark">Quorus</span>
    <p id="gateMsg">Paste your Member Token to watch.</p>
    <input id="gateToken" type="password" autocomplete="off" spellcheck="false"
      placeholder="member token" aria-label="Member Token">
    <button type="submit">Watch</button>
    <p class="err" id="gateErr">That token was not accepted. Check it and try again.</p>
  </form>
</div>

<div class="app hidden" id="app">
  <header class="head">
    <span class="wordmark"><a href="/">Quorus</a></span>
    <span class="crumb" id="crumb"></span>
    <span class="vis hidden" id="vis">
      <button class="visbtn" id="visBtn"></button>
      <div class="vismenu hidden" id="visMenu">
        <div class="hint">any member can change this</div>
        <button id="visFlip"></button>
      </div>
    </span>
    <span class="status">
      <button class="newroom hidden" id="newRoomBtn">+ New room</button>
      <span class="lamp" id="lamp"></span><span id="statusText"></span>
      <span class="me" id="meChip"></span>
    </span>
  </header>
  <main class="log hidden" id="log" aria-live="polite"></main>
  <main class="rooms hidden" id="rooms"></main>
  <aside class="side hidden" id="side">
    <h2>Members</h2><div id="roster"></div>
    <div class="invite hidden" id="inviteRow">
      <input id="invName" placeholder="Invite by name…" aria-label="Invite member">
      <button id="invBtn">Invite</button>
    </div>
    <h2>Room</h2><button class="roomid" id="roomId" title="Copy room_id"></button>
  </aside>
  <footer class="compose hidden" id="compose">
    <p class="joinhint hidden" id="joinHint">watching — <b>sending will add you to this Room's roster</b></p>
    <div class="inner">
      <div class="acmenu hidden" id="mentionMenu"></div>
      <span class="as" id="composeAs"></span>
      <input id="composeText" maxlength="8000" placeholder="Say something to the Room…"
        aria-label="Message">
      <button id="composeSend" type="button">Send</button>
    </div>
  </footer>
  <button class="newchip" id="newChip"></button>
</div>

<div class="overlay hidden" id="modalNew">
  <div class="dialog">
    <h3>New room</h3>
    <input id="nrName" placeholder="Room name…" aria-label="Room name">
    <div class="choice">
      <button type="button" class="sel" id="nrPub"><b>◯ Public</b><span>Any member can discover and join</span></button>
      <button type="button" id="nrPriv"><b>🔒 Private</b><span>Roster-only; entry by invitation</span></button>
    </div>
    <div class="btns">
      <button type="button" id="nrCancel">Cancel</button>
      <button type="button" class="go" id="nrCreate">Create</button>
    </div>
  </div>
</div>

<div class="overlay hidden" id="modalPub">
  <div class="dialog">
    <h3>Make this room public?</h3>
    <p>Every member on the server will be able to read its <b>entire history</b> —
    not just what comes next.</p>
    <div class="btns">
      <button type="button" id="pubCancel">Cancel</button>
      <button type="button" class="go" id="pubOk">Make public</button>
    </div>
  </div>
</div>

<script>${CLIENT_JS}</script>
</body>
</html>`;

/* ══════════════════════════════════════════
   GENCRAFT MULTIPLAYER — N-PLAYER VERSION
   Supports 2, 3, 4+ players in one room.
   Uses room_players table for flexible roster.
   Pure HTTP polling — no WebSockets needed.
══════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ══════════════════════════════════════════
   SUPABASE REST — plain fetch()
══════════════════════════════════════════ */
function sbH(extra) {
  return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, extra || {});
}
async function sbInsert(table, row) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: sbH({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (!r.ok) { const e = await r.text(); console.error('INSERT ' + table, r.status, e); return null; }
    const d = await r.json();
    return Array.isArray(d) ? d[0] : d;
  } catch(e) { console.error('INSERT network:', e); return null; }
}
async function sbUpdate(table, match, changes) {
  try {
    const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs, {
      method: 'PATCH',
      headers: sbH({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(changes),
    });
    if (!r.ok) { const e = await r.text(); console.error('UPDATE ' + table, r.status, e); return null; }
    const d = await r.json();
    return Array.isArray(d) ? (d[0] || true) : (d || true);
  } catch(e) { console.error('UPDATE network:', e); return null; }
}
async function sbSelect(table, match) {
  try {
    const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs + '&limit=1', { headers: sbH() });
    if (!r.ok) { const e = await r.text(); console.error('SELECT ' + table, r.status, e); return null; }
    const d = await r.json();
    return Array.isArray(d) && d.length ? d[0] : null;
  } catch(e) { console.error('SELECT network:', e); return null; }
}
async function sbSelectMany(table, match, order) {
  try {
    const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    const ord = order ? '&order=' + order : '';
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs + ord, { headers: sbH() });
    if (!r.ok) { const e = await r.text(); console.error('SELECT* ' + table, r.status, e); return []; }
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { console.error('SELECT* network:', e); return []; }
}
async function sbGetEvents(roomId, afterId) {
  try {
    const url = SUPABASE_URL + '/rest/v1/game_events'
      + '?room_id=eq.' + encodeURIComponent(roomId)
      + '&id=gt.' + afterId
      + '&order=id.asc&limit=100';
    const r = await fetch(url, { headers: sbH() });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
async function sbInsertEvent(roomId, playerNum, type, payload) {
  return sbInsert('game_events', { room_id: roomId, player_id: playerNum, event_type: type, payload: payload || {} });
}

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const MP = {
  roomId:         null,
  myPlayerNum:    null,   // 1 = host, 2, 3, 4...
  myName:         null,
  isHost:         false,
  questionSeed:   null,
  gameStarted:    false,
  iFinished:      false,
  lastEventId:    0,
  roomPollTimer:  null,
  eventPollTimer: null,
  allPlayers:     [],     // [{ player_num, name, score, finished }]
};

/* ══════════════════════════════════════════
   SEEDED QUESTIONS
══════════════════════════════════════════ */
function _rng(s) { return ()=>{ s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; }; }
function _shuf(arr, seed) {
  const r=_rng(seed), a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function buildQuestionsFromSeed(seed) {
  const base=_shuf([...QUESTIONS],seed).slice(0,16);
  const bluffs=_shuf([...BLUFFS],seed+1).slice(0,4);
  const out=[]; let bi=0;
  for(let i=0;i<base.length;i++){
    out.push(base[i]);
    if((i+1)%4===0&&bi<bluffs.length) out.push(bluffs[bi++]);
  }
  return out.slice(0,20);
}

/* ══════════════════════════════════════════
   WAITING ROOM POLL
══════════════════════════════════════════ */
function startRoomPoll() {
  stopRoomPoll();
  setTimeout(roomPollTick, 100);
  MP.roomPollTimer = setInterval(roomPollTick, 2000);
}
function stopRoomPoll() { clearInterval(MP.roomPollTimer); MP.roomPollTimer = null; }

async function roomPollTick() {
  if (!MP.roomId || !document.getElementById('page-waiting')?.classList.contains('active')) return;

  const [room, players] = await Promise.all([
    sbSelect('rooms', { id: MP.roomId }),
    sbSelectMany('room_players', { room_id: MP.roomId }, 'player_num.asc'),
  ]);
  if (!room) { showMultiStatus('Connection error — retrying...'); return; }

  MP.allPlayers = players;
  renderWaitingPlayers(players);

  if (MP.isHost) {
    setHostSections(true);
    if (players.length < 2) {
      showMultiStatus(players.length + ' player in room. Waiting for others to join...');
      setStartEnabled(false);
      setStartHint('Need at least 1 more player to start.');
    } else {
      showMultiStatus(players.length + ' players ready!');
      setStartEnabled(true);
      setStartHint(players.length + ' players in room — click START when everyone is in!');
    }
  } else {
    setHostSections(false);
    showMultiStatus('Waiting for host to start... (' + players.length + ' in room)');
  }

  if (room.status === 'starting' && !MP.gameStarted) {
    MP.gameStarted  = true;
    MP.questionSeed = room.question_seed;
    stopRoomPoll();
    showMultiStatus('Game is starting!');
    countdownThenLaunch();
  }
  if (room.status === 'finished' && !MP.gameStarted) {
    stopRoomPoll();
    showMultiError('Room was closed.');
  }
}

/* ══════════════════════════════════════════
   WAITING ROOM UI
══════════════════════════════════════════ */
function setHostSections(isHost) {
  const h = document.getElementById('mp-host-section');
  const j = document.getElementById('mp-joiner-section');
  const g = document.getElementById('mp-generic-hint');
  if (h) h.style.display = isHost ? 'flex' : 'none';
  if (j) j.style.display = isHost ? 'none' : 'block';
  if (g) g.style.display = 'none';
}
function setStartEnabled(ok) {
  const btn = document.getElementById('mp-start-btn');
  if (!btn) return;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '0.4';
  btn.style.pointerEvents = ok ? 'auto' : 'none';
}
function setStartHint(msg) {
  const el = document.getElementById('mp-start-hint');
  if (el) el.textContent = msg;
}
function renderWaitingPlayers(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;
  const colors = ['var(--em)', 'var(--am)', 'var(--di)', 'var(--pu)', 'var(--rs)', 'var(--go)'];
  el.innerHTML = players.map((p, i) => {
    const col = colors[i % colors.length];
    const isHost = p.player_num === 1;
    const isMe   = p.player_num === MP.myPlayerNum;
    const tag    = isMe ? ' (YOU)' : isHost ? ' (HOST)' : ' (JOINED ✓)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 13px;border:1px solid ${col};background:${col.replace(')',',0.06)').replace('var(','rgba(').replace('--em','74,222,128').replace('--am','251,191,36').replace('--di','96,165,250').replace('--pu','167,139,250').replace('--rs','248,113,113').replace('--go','250,204,21')};">
      <div style="width:30px;height:30px;border:2px solid ${col};color:${col};font-family:var(--px);font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${p.name[0].toUpperCase()}</div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${col};">${p.name}<span style="color:var(--txt3);font-size:6px;margin-left:4px;">${tag}</span></div>
      <div style="width:7px;height:7px;background:${col};border-radius:50%;animation:pulse 1.2s infinite;flex-shrink:0;"></div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   HOST — START
══════════════════════════════════════════ */
async function hostStartGame() {
  if (!MP.isHost || !MP.roomId) return;
  setStartEnabled(false);
  setStartHint('Starting...');
  showMultiStatus('Starting game for all ' + MP.allPlayers.length + ' players...');

  const ok = await sbUpdate('rooms', { id: MP.roomId }, { status: 'starting' });
  if (!ok) {
    showMultiError('⚠ Could not start — try again.');
    setStartEnabled(true);
    return;
  }
  stopRoomPoll();
  MP.gameStarted = true;
  countdownThenLaunch();
}
window.hostStartGame = hostStartGame;

/* ══════════════════════════════════════════
   COUNTDOWN + LAUNCH
══════════════════════════════════════════ */
function countdownThenLaunch() {
  let n = 3;
  showMultiStatus('Starting in ' + n + '...');
  const iv = setInterval(() => {
    n--;
    if (n > 0) { showMultiStatus('Starting in ' + n + '...'); }
    else { clearInterval(iv); launchGame(); startEventPoll(); }
  }, 1000);
}

function launchGame() {
  mode      = 'multi';
  myName    = MP.myName;
  questions = buildQuestionsFromSeed(MP.questionSeed);
  showPage('game');
  startGame();

  // Build N-player mini-leaderboard in HUD area
  buildMultiHUD();
}

/* ══════════════════════════════════════════
   N-PLAYER HUD
   Replace the 2-player HUD with a live
   standings sidebar showing all players
══════════════════════════════════════════ */
function buildMultiHUD() {
  // Update my name in existing HUD
  const p1 = document.getElementById('p1name');
  if (p1) p1.textContent = MP.myName;

  // Build or update the live standings panel
  updateMultiHUD();
}

function updateMultiHUD() {
  // Show all scores in a compact panel above the game
  let panel = document.getElementById('mp-live-scores');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'mp-live-scores';
    panel.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'gap:6px', 'padding:6px 12px',
      'background:var(--bg2)', 'border-bottom:1px solid var(--bdr)',
      'font-family:var(--px)', 'font-size:7px', 'z-index:10',
    ].join(';');
    const hud = document.getElementById('game-hud');
    if (hud) hud.parentNode.insertBefore(panel, hud.nextSibling);
  }
  const colors = ['var(--em)', 'var(--am)', 'var(--di)', 'var(--pu)', 'var(--rs)', 'var(--go)'];
  panel.innerHTML = MP.allPlayers.map((p, i) => {
    const isMe = p.player_num === MP.myPlayerNum;
    const col  = colors[i % colors.length];
    const sc   = isMe ? score1 : (p.score || 0);
    return `<div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid ${col};background:${isMe?col.replace(')',',0.1)').replace('var(','rgba(').replace('--em','74,222,128').replace('--am','251,191,36').replace('--di','96,165,250').replace('--pu','167,139,250').replace('--rs','248,113,113').replace('--go','250,204,21'):'transparent'}">
      <span style="color:${col}">${p.name}</span>
      <span style="color:${col};font-size:6px">${sc} XP</span>
      ${isMe ? '<span style="color:'+col+';font-size:5px">◄</span>' : ''}
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   IN-GAME EVENT POLLING
══════════════════════════════════════════ */
function startEventPoll() {
  clearInterval(MP.eventPollTimer);
  MP.eventPollTimer = setInterval(eventPollTick, 1500);
}
function stopEventPoll() { clearInterval(MP.eventPollTimer); MP.eventPollTimer = null; }

async function eventPollTick() {
  if (!MP.roomId) return;
  const events = await sbGetEvents(MP.roomId, MP.lastEventId);
  for (const ev of events) {
    if (ev.id > MP.lastEventId) MP.lastEventId = ev.id;
    if (ev.player_id === MP.myPlayerNum) continue;
    handleOpponentEvent(ev.player_id, ev.event_type, ev.payload || {});
  }
}

function handleOpponentEvent(playerNum, type, p) {
  // Find the player in our roster and update their score
  const player = MP.allPlayers.find(pl => pl.player_num === playerNum);
  if (!player) return;

  if (type === 'answer') {
    if (p.score !== undefined) player.score = p.score;
    updateMultiHUD();
    // Update p2 score in legacy HUD if 2-player
    if (MP.allPlayers.length === 2) {
      score2 = p.score || score2;
      streak2 = p.streak || 0;
      updateHUD();
    }
  }
  if (type === 'done') {
    player.score    = p.score;
    player.finished = true;
    updateMultiHUD();
    if (MP.allPlayers.length === 2) { score2 = p.score; updateHUD(); }
    checkAllFinished();
  }
  if (type === 'bye') {
    player.disconnected = true;
    // If only this player left, auto-finish
    const activePlayers = MP.allPlayers.filter(pl => !pl.disconnected && pl.player_num !== MP.myPlayerNum);
    if (MP.iFinished || activePlayers.length === 0) checkAllFinished();
  }
}

function checkAllFinished() {
  if (!MP.iFinished) return;
  const allDone = MP.allPlayers.every(p =>
    p.player_num === MP.myPlayerNum || p.finished || p.disconnected
  );
  if (allDone) doShowResults();
}

/* ══════════════════════════════════════════
   RESULTS SYNC
══════════════════════════════════════════ */
function notifyIFinished() {
  MP.iFinished = true;
  // Update our own score in the roster
  const me = MP.allPlayers.find(p => p.player_num === MP.myPlayerNum);
  if (me) { me.score = score1; me.finished = true; }
  // Update score in DB
  sbUpdate('room_players', { room_id: MP.roomId, player_num: MP.myPlayerNum }, { score: score1, finished: true });
  sbInsertEvent(MP.roomId, MP.myPlayerNum, 'done', { score: score1, name: myName });

  checkAllFinished();
  if (!MP.allPlayers.every(p => p.player_num === MP.myPlayerNum || p.finished || p.disconnected)) {
    showWaitingForOthers();
  }
}

function showWaitingForOthers() {
  hideGamePanels();
  const od = document.getElementById('od-final');
  if (od) od.style.display = 'none';

  const remaining = MP.allPlayers.filter(p =>
    p.player_num !== MP.myPlayerNum && !p.finished && !p.disconnected
  );

  let ov = document.getElementById('mp-wait-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'mp-wait-ov';
    ov.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;margin:16px;';
    document.getElementById('page-game').appendChild(ov);
  }
  ov.style.display = 'flex';
  ov.innerHTML =
    '<div style="font-family:var(--px);font-size:8px;color:var(--am)">ROUND COMPLETE</div>' +
    '<div style="font-family:var(--px);font-size:24px;color:var(--em)">' + score1 + ' XP</div>' +
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Score locked.</div>' +
    '<div style="font-family:var(--mn);font-size:10px;color:var(--txt3)">Waiting for ' + remaining.length + ' more player(s)...</div>' +
    '<div style="display:flex;flex-direction:column;gap:4px;width:100%">' +
    remaining.map(p =>
      '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid var(--am)">' +
      '<div style="width:6px;height:6px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>' +
      '<div style="font-family:var(--px);font-size:7px;color:var(--am)">' + p.name + '</div>' +
      '</div>'
    ).join('') +
    '</div>';

  // 60s fallback
  setTimeout(() => { if (!MP.allPlayers.every(p => p.finished || p.disconnected || p.player_num === MP.myPlayerNum)) doShowResults(); }, 60000);
}

function doShowResults() {
  stopEventPoll();
  document.getElementById('mp-wait-ov')?.remove();

  // Sync all scores into score variables for results screen
  // Sort by score descending for podium
  const sorted = [...MP.allPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));
  const me = sorted.find(p => p.player_num === MP.myPlayerNum);
  if (me) score1 = me.score;
  if (sorted.length >= 2) score2 = sorted.find(p => p.player_num !== MP.myPlayerNum)?.score || score2;

  // Inject N-player podium into results screen
  showNPlayerResults(sorted);
}

function showNPlayerResults(sorted) {
  showPage('results');
  const banner = document.getElementById('results-banner');
  const myRank = sorted.findIndex(p => p.player_num === MP.myPlayerNum) + 1;
  const medals = ['🥇', '🥈', '🥉'];
  if (banner) {
    banner.style.background = myRank === 1 ? 'linear-gradient(135deg,rgba(250,204,21,.2),rgba(74,222,128,.15))' : '';
    document.getElementById('res-title').textContent =
      myRank === 1 ? '🏆 VICTORY!' : myRank === 2 ? '🥈 RUNNER UP' : 'GAME COMPLETE';
    document.getElementById('res-sub').textContent =
      'You placed #' + myRank + ' of ' + sorted.length + ' validators';
  }

  const rows = document.getElementById('results-rows');
  if (rows) {
    rows.innerHTML = sorted.map((p, i) => {
      const isMe = p.player_num === MP.myPlayerNum;
      const col  = i === 0 ? 'var(--go)' : i === 1 ? 'var(--txt2)' : 'var(--am)';
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;
        border:1px solid ${col};background:${isMe?'rgba(74,222,128,0.05)':'transparent'};margin-bottom:4px;">
        <div style="font-family:var(--px);font-size:14px;width:32px;text-align:center">${medals[i] || '#'+(i+1)}</div>
        <div style="flex:1;font-family:var(--px);font-size:8px;color:${col}">${p.name}${isMe?' ◄ YOU':''}</div>
        <div style="font-family:var(--px);font-size:10px;color:${col}">${p.score || 0} XP</div>
      </div>`;
    }).join('');
  }

  setTimeout(() => cleanupMP(), 8000);
}

/* ══════════════════════════════════════════
   MAIN ENTRY — joinOrCreate
══════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input')?.value.trim() || 'MINER').toUpperCase();
  const roomCode   = document.getElementById('room-input')?.value.trim().toUpperCase() || '';

  stopRoomPoll(); stopEventPoll();
  Object.assign(MP, {
    roomId: null, myPlayerNum: null, myName: playerName,
    isHost: false, gameStarted: false, iFinished: false,
    lastEventId: 0, allPlayers: [],
  });

  const pl = document.getElementById('mp-player-list'); if (pl) pl.innerHTML = '';
  const hs = document.getElementById('mp-host-section'); if (hs) hs.style.display = 'none';
  const js = document.getElementById('mp-joiner-section'); if (js) js.style.display = 'none';
  const gh = document.getElementById('mp-generic-hint'); if (gh) gh.style.display = 'block';

  showPage('waiting');
  showMultiStatus('Connecting...');

  if (roomCode) {
    /* ──── JOINING ──── */
    document.getElementById('room-display').textContent = roomCode;
    showMultiStatus('Looking up room ' + roomCode + '...');

    const room = await sbSelect('rooms', { id: roomCode });
    if (!room) { showMultiError('⚠ Room "' + roomCode + '" not found.'); return; }
    if (room.status === 'finished')  { showMultiError('⚠ That game already finished.'); return; }
    if (room.status === 'starting')  { showMultiError('⚠ That game is already starting.'); return; }

    // Find next available player_num
    const existing = await sbSelectMany('room_players', { room_id: roomCode }, 'player_num.asc');
    const takenNums = existing.map(p => p.player_num);
    let myNum = 2; while (takenNums.includes(myNum)) myNum++;

    const inserted = await sbInsert('room_players', {
      room_id: roomCode, player_num: myNum, name: playerName, score: 0, finished: false,
    });
    if (!inserted) { showMultiError('⚠ Could not join. Try again.'); return; }

    MP.roomId      = roomCode;
    MP.myPlayerNum = myNum;
    MP.isHost      = false;
    MP.questionSeed = room.question_seed;

    showMultiStatus('Joined as player ' + myNum + '! Waiting for host to start...');
    startRoomPoll();

  } else {
    /* ──── HOSTING ──── */
    showMultiStatus('Creating room...');
    const roomId = 'GL' + Math.floor(1000 + Math.random() * 9000);
    const seed   = Math.floor(Math.random() * 1000000);

    const room = await sbInsert('rooms', {
      id: roomId, player1_name: playerName, status: 'waiting', question_seed: seed,
    });
    if (!room) { showMultiError('⚠ Could not create room. Check Supabase credentials.'); return; }

    // Insert host into room_players
    const inserted = await sbInsert('room_players', {
      room_id: roomId, player_num: 1, name: playerName, score: 0, finished: false,
    });
    if (!inserted) { showMultiError('⚠ Room created but could not add you as player.'); return; }

    MP.roomId      = roomId;
    MP.myPlayerNum = 1;
    MP.isHost      = true;
    MP.questionSeed = seed;

    document.getElementById('room-display').textContent = roomId;
    showMultiStatus('Room created! Share this code with up to 5 others.');
    startRoomPoll();
  }
};

/* ══════════════════════════════════════════
   GAME PATCHES
══════════════════════════════════════════ */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2 = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random()*20) : -20));
    streak2 = correct ? streak2+1 : 0; updateHUD();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  function mpSend(type, extra) {
    if (mode !== 'multi' || !MP.roomId) return;
    sbInsertEvent(MP.roomId, MP.myPlayerNum, type, Object.assign({ name: myName }, extra || {}));
    // Also update score in room_players table
    if (extra && extra.score !== undefined) {
      sbUpdate('room_players', { room_id: MP.roomId, player_num: MP.myPlayerNum }, { score: extra.score });
    }
    // Update our own entry in allPlayers for instant HUD refresh
    const me = MP.allPlayers.find(p => p.player_num === MP.myPlayerNum);
    if (me && extra && extra.score !== undefined) { me.score = extra.score; updateMultiHUD(); }
  }

  const _sa = window.selectAnswer;
  if (_sa) window.selectAnswer = function(b,c,q,s) {
    _sa(b,c,q,s);
    mpSend('answer', { score: score1, correct: c, streak: streak1 });
  };
  const _sb = window.selectBluff;
  if (_sb) window.selectBluff = function(b,i,q) {
    _sb(b,i,q);
    mpSend('answer', { score: score1, correct: i===q.bluff, streak: streak1 });
  };
  const _ov = window.castODVote;
  if (_ov) window.castODVote = function(v) { _ov(v); mpSend('od_vote', { vote: v }); };

  const _sr = window.showResults;
  if (_sr) {
    window._originalShowResults = _sr;
    window.showResults = function() {
      if (mode === 'multi' && MP.roomId) notifyIFinished();
      else _sr();
    };
  }
  window.showFinalResults = doShowResults;
});

/* ══════════════════════════════════════════
   CLEANUP
══════════════════════════════════════════ */
function cleanupMP() {
  stopRoomPoll(); stopEventPoll();
  if (MP.roomId) sbInsertEvent(MP.roomId, MP.myPlayerNum, 'bye', {});
  Object.assign(MP, { roomId: null, gameStarted: false, iFinished: false });
  document.getElementById('mp-live-scores')?.remove();
}
window.addEventListener('beforeunload', () => MP.roomId && cleanupMP());

function showMultiStatus(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = ''; }
}
function showMultiError(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--rs)'; }
}

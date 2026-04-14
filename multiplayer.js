/* ══════════════════════════════════════════
   GENCRAFT MULTIPLAYER — v10 FINAL
   Plain HTTP polling — no WebSockets needed
══════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ══════════════════════════════════════════
   SUPABASE REST API — plain fetch() only
   No SDK, no WebSockets, works everywhere
══════════════════════════════════════════ */

function sbHeaders(extra) {
  return Object.assign({
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
  }, extra || {});
}

async function sbInsert(table, row) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method:  'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body:    JSON.stringify(row),
    });
    if (!r.ok) {
      const e = await r.text();
      console.error('sbInsert(' + table + ') failed ' + r.status + ':', e);
      return null;
    }
    const d = await r.json();
    return Array.isArray(d) ? d[0] : d;
  } catch(e) { console.error('sbInsert network error:', e); return null; }
}

async function sbUpdate(table, match, changes) {
  try {
    const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs, {
      method:  'PATCH',
      headers: sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body:    JSON.stringify(changes),
    });
    if (!r.ok) {
      const e = await r.text();
      console.error('sbUpdate(' + table + ') failed ' + r.status + ':', e);
      return null;
    }
    const d = await r.json();
    return Array.isArray(d) ? (d[0] || true) : d;
  } catch(e) { console.error('sbUpdate network error:', e); return null; }
}

async function sbSelect(table, match) {
  try {
    const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs + '&limit=1', {
      headers: sbHeaders(),
    });
    if (!r.ok) {
      const e = await r.text();
      console.error('sbSelect(' + table + ') failed ' + r.status + ':', e);
      return null;
    }
    const d = await r.json();
    return Array.isArray(d) && d.length ? d[0] : null;
  } catch(e) { console.error('sbSelect network error:', e); return null; }
}

async function sbGetEvents(roomId, afterId) {
  try {
    const url = SUPABASE_URL + '/rest/v1/game_events'
      + '?room_id=eq.' + encodeURIComponent(roomId)
      + '&id=gt.' + afterId
      + '&order=id.asc&limit=50';
    const r = await fetch(url, { headers: sbHeaders() });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function sbInsertEvent(roomId, playerId, type, payload) {
  return sbInsert('game_events', {
    room_id:    roomId,
    player_id:  playerId,
    event_type: type,
    payload:    payload || {},
  });
}

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const MP = {
  roomId:             null,
  myPlayerId:         null,
  myName:             null,
  opponentName:       null,
  questionSeed:       null,
  isHost:             false,
  gameStarted:        false,
  iFinished:          false,
  opponentFinalScore: null,
  lastEventId:        0,
  roomPollTimer:      null,
  eventPollTimer:     null,
};

/* ══════════════════════════════════════════
   SEEDED QUESTIONS
══════════════════════════════════════════ */
function _sr(seed) {
  let s=seed;
  return ()=>{ s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
}
function _shuffle(arr, seed) {
  const rand=_sr(seed); const r=[...arr];
  for(let i=r.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[r[i],r[j]]=[r[j],r[i]];}
  return r;
}
function buildQuestionsFromSeed(seed) {
  const base=_shuffle([...QUESTIONS],seed).slice(0,16);
  const bluffs=_shuffle([...BLUFFS],seed+1).slice(0,4);
  const out=[]; let bi=0;
  for(let i=0;i<base.length;i++){
    out.push(base[i]);
    if((i+1)%4===0&&bi<bluffs.length) out.push(bluffs[bi++]);
  }
  return out.slice(0,20);
}

/* ══════════════════════════════════════════
   WAITING ROOM POLL — checks DB every 2s
══════════════════════════════════════════ */
function startRoomPoll() {
  stopRoomPoll();
  setTimeout(roomPollTick, 100); // fast first tick
  MP.roomPollTimer = setInterval(roomPollTick, 2000);
}
function stopRoomPoll() {
  clearInterval(MP.roomPollTimer);
  MP.roomPollTimer = null;
}

async function roomPollTick() {
  if (!MP.roomId || !document.getElementById('page-waiting')?.classList.contains('active')) return;

  const room = await sbSelect('rooms', { id: MP.roomId });
  if (!room) {
    showMultiStatus('Connection error — retrying...');
    return;
  }

  // Build player list
  const players = [];
  if (room.player1_name) players.push({ name: room.player1_name, isHost: true });
  if (room.player2_name) players.push({ name: room.player2_name, isHost: false });
  renderWaitingPlayers(players);

  if (MP.myPlayerId === 1 && room.player2_name) MP.opponentName = room.player2_name;

  if (MP.isHost) {
    setHostSections(true);
    const count = players.length;
    if (count < 2) {
      showMultiStatus(count + ' player in room. Waiting for someone to join...');
      setStartEnabled(false);
      setStartHint('Waiting for at least 1 more player to join...');
    } else {
      showMultiStatus(count + ' players ready!');
      setStartEnabled(true);
      setStartHint('Everyone is in — start when ready!');
    }
  } else {
    setHostSections(false);
    showMultiStatus('Waiting for host to start... (' + players.length + ' in room)');
  }

  // Detect game start
  if ((room.status === 'starting') && !MP.gameStarted) {
    MP.gameStarted  = true;
    MP.questionSeed = room.question_seed;
    if (!MP.isHost && room.player1_name) MP.opponentName = room.player1_name;
    stopRoomPoll();
    showMultiStatus('Host started the game!');
    countdownThenLaunch();
  }
}

/* ══════════════════════════════════════════
   WAITING ROOM UI HELPERS
══════════════════════════════════════════ */
function setHostSections(isHost) {
  const hostEl   = document.getElementById('mp-host-section');
  const joinerEl = document.getElementById('mp-joiner-section');
  const hintEl   = document.getElementById('mp-generic-hint');
  if (hostEl)   hostEl.style.display   = isHost ? 'flex' : 'none';
  if (joinerEl) joinerEl.style.display = isHost ? 'none' : 'block';
  if (hintEl)   hintEl.style.display   = 'none'; // hide generic once role known
}

function setStartEnabled(enabled) {
  const btn = document.getElementById('mp-start-btn');
  if (!btn) return;
  btn.disabled            = !enabled;
  btn.style.opacity       = enabled ? '1'    : '0.4';
  btn.style.pointerEvents = enabled ? 'auto' : 'none';
}

function setStartHint(msg) {
  const el = document.getElementById('mp-start-hint');
  if (el) el.textContent = msg;
}

function renderWaitingPlayers(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;
  el.innerHTML = players.map((p, i) => {
    const col = i === 0 ? 'var(--em)' : 'var(--am)';
    const bg  = i === 0 ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)';
    const tag = p.name === MP.myName
      ? ' (YOU)'
      : p.isHost ? ' (HOST)' : ' (JOINED ✓)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 13px;border:1px solid ${col};background:${bg};">
      <div style="width:30px;height:30px;border:2px solid ${col};color:${col};font-family:var(--px);font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${p.name[0].toUpperCase()}</div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${col};">${p.name}<span style="color:var(--txt3);font-size:6px;margin-left:4px;">${tag}</span></div>
      <div style="width:7px;height:7px;background:${col};border-radius:50%;animation:pulse 1.2s infinite;flex-shrink:0;"></div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   HOST — START GAME BUTTON
══════════════════════════════════════════ */
async function hostStartGame() {
  if (!MP.isHost || !MP.roomId) return;

  setStartEnabled(false);
  setStartHint('Saving to database...');
  showMultiStatus('Starting game...');

  const result = await sbUpdate('rooms', { id: MP.roomId }, { status: 'starting' });

  if (!result) {
    showMultiError('⚠ Could not start. Check Supabase credentials.');
    setStartEnabled(true);
    setStartHint('Try again');
    return;
  }

  stopRoomPoll();
  MP.gameStarted = true;
  showMultiStatus('Starting!');
  countdownThenLaunch();
}

// Expose for inline onclick
window.hostStartGame = hostStartGame;

/* ══════════════════════════════════════════
   COUNTDOWN + LAUNCH
══════════════════════════════════════════ */
function countdownThenLaunch() {
  let n = 3;
  showMultiStatus('Starting in ' + n + '...');
  const iv = setInterval(() => {
    n--;
    if (n > 0) {
      showMultiStatus('Starting in ' + n + '...');
    } else {
      clearInterval(iv);
      launchGame();
      startEventPoll();
    }
  }, 1000);
}

function launchGame() {
  mode      = 'multi';
  myName    = MP.myName;
  questions = buildQuestionsFromSeed(MP.questionSeed);
  showPage('game');
  startGame();
  const p2 = document.getElementById('p2name');
  if (p2) p2.textContent = MP.opponentName || 'OPPONENT';
}

/* ══════════════════════════════════════════
   IN-GAME EVENT POLLING
══════════════════════════════════════════ */
function startEventPoll() {
  clearInterval(MP.eventPollTimer);
  MP.eventPollTimer = setInterval(eventPollTick, 1500);
}
function stopEventPoll() {
  clearInterval(MP.eventPollTimer);
  MP.eventPollTimer = null;
}

async function eventPollTick() {
  if (!MP.roomId) return;
  const events = await sbGetEvents(MP.roomId, MP.lastEventId);
  for (const ev of events) {
    if (ev.id > MP.lastEventId) MP.lastEventId = ev.id;
    if (ev.player_id === MP.myPlayerId) continue;
    handleOpponentEvent(ev.event_type, ev.payload || {});
  }
}

function handleOpponentEvent(type, p) {
  if (type === 'answer') {
    if (p.score !== undefined) score2 = p.score;
    if (p.streak !== undefined) streak2 = p.streak;
    if (p.name && p.name !== myName) {
      MP.opponentName = p.name;
      const el = document.getElementById('p2name');
      if (el) el.textContent = p.name;
    }
    updateHUD();
  }
  if (type === 'done') {
    MP.opponentFinalScore = p.score;
    score2 = p.score;
    if (p.name) MP.opponentName = p.name;
    updateHUD();
    if (MP.iFinished) doShowResults();
  }
  if (type === 'bye') {
    if (!MP.iFinished) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const el = document.getElementById('p2name')?.closest?.('.hud-player');
      if (el) el.style.opacity = '0.3';
    } else {
      MP.opponentFinalScore = MP.opponentFinalScore ?? score2;
      doShowResults();
    }
  }
}

/* ══════════════════════════════════════════
   RESULTS SYNC
══════════════════════════════════════════ */
function notifyIFinished() {
  MP.iFinished    = true;
  MP.myFinalScore = score1;
  sbInsertEvent(MP.roomId, MP.myPlayerId, 'done', { score: score1, name: myName });
  sbUpdate('rooms', { id: MP.roomId }, { status: 'finished' });

  if (MP.opponentFinalScore !== null) {
    doShowResults();
  } else {
    showWaitingForOpponent();
    setTimeout(() => {
      if (!MP.opponentFinalScore) {
        MP.opponentFinalScore = score2;
        doShowResults();
      }
    }, 60000);
  }
}

function showWaitingForOpponent() {
  hideGamePanels();
  document.getElementById('od-final') &&
    (document.getElementById('od-final').style.display = 'none');

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
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>' +
    '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + '...</div>' +
    '</div>';
}

function doShowResults() {
  stopEventPoll();
  document.getElementById('mp-wait-ov')?.remove();
  if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;
  (window._originalShowResults || window.showResults)?.();
  setTimeout(cleanupMP, 6000);
}

/* ══════════════════════════════════════════
   MAIN ENTRY — joinOrCreate
══════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input')?.value.trim() || 'MINER').toUpperCase();
  const roomCode   = document.getElementById('room-input')?.value.trim().toUpperCase() || '';

  // Reset state
  stopRoomPoll(); stopEventPoll();
  Object.assign(MP, {
    roomId:null, myPlayerId:null, myName:playerName,
    opponentName:null, gameStarted:false, iFinished:false,
    opponentFinalScore:null, lastEventId:0, isHost:false,
  });

  // Reset UI
  const pl = document.getElementById('mp-player-list');
  if (pl) pl.innerHTML = '';
  const hs = document.getElementById('mp-host-section');
  if (hs) hs.style.display = 'none';
  const js = document.getElementById('mp-joiner-section');
  if (js) js.style.display = 'none';
  const gh = document.getElementById('mp-generic-hint');
  if (gh) gh.style.display = 'block';

  showPage('waiting');
  showMultiStatus('Connecting...');

  if (roomCode) {
    /* ──── JOINING ──── */
    document.getElementById('room-display').textContent = roomCode;
    showMultiStatus('Looking up room ' + roomCode + '...');

    const room = await sbSelect('rooms', { id: roomCode });
    if (!room) {
      showMultiError('⚠ Room "' + roomCode + '" not found. Check the code.');
      return;
    }
    if (room.status === 'finished') {
      showMultiError('⚠ That game already finished.');
      return;
    }
    if (room.status === 'starting') {
      showMultiError('⚠ That game is already starting.');
      return;
    }

    const updated = await sbUpdate('rooms', { id: roomCode }, { player2_name: playerName });
    if (!updated) {
      showMultiError('⚠ Could not join. Please try again.');
      return;
    }

    MP.roomId       = roomCode;
    MP.myPlayerId   = 2;
    MP.isHost       = false;
    MP.opponentName = room.player1_name;
    MP.questionSeed = room.question_seed;

    showMultiStatus('Joined! Waiting for host to start...');
    startRoomPoll();

  } else {
    /* ──── HOSTING ──── */
    showMultiStatus('Creating room...');
    const roomId = 'GL' + Math.floor(1000 + Math.random() * 9000);
    const seed   = Math.floor(Math.random() * 1000000);

    const room = await sbInsert('rooms', {
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: seed,
    });

    if (!room) {
      showMultiError('⚠ Could not create room. Check your Supabase credentials in multiplayer.js.');
      return;
    }

    MP.roomId       = roomId;
    MP.myPlayerId   = 1;
    MP.isHost       = true;
    MP.questionSeed = seed;

    document.getElementById('room-display').textContent = roomId;
    showMultiStatus('Room created! Share this code.');
    startRoomPoll();
  }
};

/* ══════════════════════════════════════════
   GAME PATCHES
══════════════════════════════════════════ */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2 = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random()*20) : -20));
    streak2 = correct ? streak2+1 : 0;
    updateHUD();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  function mpSend(type, extra) {
    if (mode !== 'multi' || !MP.roomId) return;
    sbInsertEvent(MP.roomId, MP.myPlayerId, type,
      Object.assign({ name: myName }, extra || {}));
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
  if (_ov) window.castODVote = function(v) {
    _ov(v); mpSend('od_vote', { vote: v });
  };

  const _sr2 = window.showResults;
  if (_sr2) {
    window._originalShowResults = _sr2;
    window.showResults = function() {
      if (mode === 'multi' && MP.roomId) { notifyIFinished(); }
      else { _sr2(); }
    };
  }

  window.showFinalResults = doShowResults;
});

/* ══════════════════════════════════════════
   CLEANUP
══════════════════════════════════════════ */
function cleanupMP() {
  stopRoomPoll(); stopEventPoll();
  if (MP.roomId) sbInsertEvent(MP.roomId, MP.myPlayerId, 'bye', {});
  Object.assign(MP, { roomId:null, gameStarted:false, iFinished:false });
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

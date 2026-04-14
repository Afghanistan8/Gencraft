/* ══════════════════════════════════════════
   GENCRAFT MULTIPLAYER — FINAL VERSION
   Uses simple HTTP polling. No WebSockets.
   No realtime subscriptions. No Ably.
   Works on every network, every device.
══════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ══════════════════════════════════════════
   DIRECT HTTP HELPERS
   No Supabase SDK needed — plain fetch() calls
   to the Supabase REST API. Works everywhere.
══════════════════════════════════════════ */

async function dbInsert(table, row) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(row),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('dbInsert error:', data); return null; }
  return Array.isArray(data) ? data[0] : data;
}

async function dbUpdate(table, match, changes) {
  const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + v).join('&');
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs, {
    method:  'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(changes),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('dbUpdate error:', data); return null; }
  return Array.isArray(data) ? data[0] : data;
}

async function dbSelect(table, match) {
  const qs = Object.entries(match).map(([k,v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + qs + '&limit=1', {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    },
  });
  const data = await r.json().catch(() => []);
  if (!r.ok) { console.error('dbSelect error:', data); return null; }
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function dbInsertEvent(roomId, playerId, eventType, payload) {
  return dbInsert('game_events', {
    room_id:    roomId,
    player_id:  playerId,
    event_type: eventType,
    payload:    payload,
  });
}

async function dbGetEvents(roomId, afterId) {
  const url = SUPABASE_URL + '/rest/v1/game_events'
    + '?room_id=eq.' + encodeURIComponent(roomId)
    + '&id=gt.' + afterId
    + '&order=id.asc&limit=20';
  const r = await fetch(url, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    },
  });
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const MP = {
  roomId:             null,
  myPlayerId:         null,  // 1 = host, 2 = joiner
  myName:             null,
  opponentName:       null,
  questionSeed:       null,
  isHost:             false,
  gameStarted:        false,
  iFinished:          false,
  opponentFinalScore: null,
  lastEventId:        0,
  pollTimer:          null,
  roomPollTimer:      null,
};

/* ══════════════════════════════════════════
   SEEDED QUESTIONS
══════════════════════════════════════════ */
function seededRandom(seed) {
  let s = seed;
  return () => { s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
}
function seededShuffle(arr, seed) {
  const rand=seededRandom(seed); const r=[...arr];
  for (let i=r.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[r[i],r[j]]=[r[j],r[i]];}
  return r;
}
function buildQuestionsFromSeed(seed) {
  const base=seededShuffle([...QUESTIONS],seed).slice(0,16);
  const bluffs=seededShuffle([...BLUFFS],seed+1).slice(0,4);
  const out=[]; let bi=0;
  for(let i=0;i<base.length;i++){
    out.push(base[i]);
    if((i+1)%4===0&&bi<bluffs.length) out.push(bluffs[bi++]);
  }
  return out.slice(0,20);
}

/* ══════════════════════════════════════════
   WAITING ROOM — poll DB every 2s
   Host sees player list + START button
   Joiners see "waiting for host to start"
══════════════════════════════════════════ */
function startRoomPoll() {
  stopRoomPoll();
  roomPollTick(); // immediate first tick
  MP.roomPollTimer = setInterval(roomPollTick, 2000);
}
function stopRoomPoll() {
  if (MP.roomPollTimer) { clearInterval(MP.roomPollTimer); MP.roomPollTimer = null; }
}

async function roomPollTick() {
  if (!MP.roomId) return;
  const room = await dbSelect('rooms', { id: MP.roomId });
  if (!room) return;

  const players = [];
  if (room.player1_name) players.push({ name: room.player1_name, isHost: true });
  if (room.player2_name) players.push({ name: room.player2_name, isHost: false });

  // update opponent name
  if (MP.myPlayerId === 1 && room.player2_name) MP.opponentName = room.player2_name;
  if (MP.myPlayerId === 2) MP.opponentName = room.player1_name;

  renderWaitingPlayers(players);

  if (MP.isHost) {
    if (players.length < 2) {
      showMultiStatus('Waiting for players... (' + players.length + ' in room)');
      hideStartBtn();
    } else {
      showMultiStatus(players.length + ' players ready. Start when everyone is in!');
      showStartBtn();
    }
  } else {
    showMultiStatus('Waiting for host to start... (' + players.length + ' in room)');
  }

  // Detect game start — host sets status='starting'
  if (room.status === 'starting' && !MP.gameStarted) {
    MP.gameStarted  = true;
    MP.questionSeed = room.question_seed;
    stopRoomPoll();
    countdownAndLaunch();
  }

  if (room.status === 'finished' && !MP.gameStarted) {
    stopRoomPoll();
    showMultiError('Room was closed.');
  }
}

/* ══════════════════════════════════════════
   HOST — START THE GAME
══════════════════════════════════════════ */
async function hostStartGame() {
  if (!MP.isHost) return;
  const btn = document.getElementById('mp-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'STARTING...'; }

  stopRoomPoll();
  const result = await dbUpdate('rooms', { id: MP.roomId }, { status: 'starting' });
  if (!result) {
    showMultiError('Failed to start. Check credentials and try again.');
    if (btn) { btn.disabled = false; btn.textContent = '⛏ START GAME'; }
    startRoomPoll();
    return;
  }

  MP.gameStarted = true;
  countdownAndLaunch();
}

// Expose for any inline onclick fallback
window.hostStartGame = hostStartGame;

function countdownAndLaunch() {
  let n = 3;
  showMultiStatus('Starting in ' + n + '...');
  const iv = setInterval(() => {
    n--;
    if (n > 0) {
      showMultiStatus('Starting in ' + n + '...');
    } else {
      clearInterval(iv);
      launchGame();
      startEventPoll(); // begin watching for opponent events
    }
  }, 1000);
}

/* ══════════════════════════════════════════
   IN-GAME EVENT POLLING
   Polls game_events table every 1.5s
   for new rows from the opponent
══════════════════════════════════════════ */
function startEventPoll() {
  stopEventPoll();
  MP.pollTimer = setInterval(eventPollTick, 1500);
}
function stopEventPoll() {
  if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = null; }
}

async function eventPollTick() {
  if (!MP.roomId) return;
  const events = await dbGetEvents(MP.roomId, MP.lastEventId);
  for (const ev of events) {
    if (ev.id > MP.lastEventId) MP.lastEventId = ev.id;
    if (ev.player_id === MP.myPlayerId) continue; // skip own events
    handleOpponentEvent(ev.event_type, ev.payload || {});
  }
}

function handleOpponentEvent(type, payload) {
  if (type === 'answer') {
    score2 = payload.score || score2;
    streak2 = payload.streak || 0;
    if (payload.name) {
      MP.opponentName = payload.name;
      const el = document.getElementById('p2name');
      if (el) el.textContent = payload.name;
    }
    updateHUD();
  }
  if (type === 'done') {
    MP.opponentFinalScore = payload.score;
    score2 = payload.score;
    if (payload.name) MP.opponentName = payload.name;
    updateHUD();
    if (MP.iFinished) doShowResults();
  }
  if (type === 'bye') {
    if (!MP.iFinished) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const el = document.getElementById('p2name')?.closest('.hud-player');
      if (el) el.style.opacity = '0.3';
    } else {
      MP.opponentFinalScore = MP.opponentFinalScore ?? score2;
      doShowResults();
    }
  }
}

/* ══════════════════════════════════════════
   GAME LAUNCH
══════════════════════════════════════════ */
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
   RESULTS SYNC
══════════════════════════════════════════ */
function notifyIFinished() {
  MP.iFinished    = true;
  MP.myFinalScore = score1;
  dbInsertEvent(MP.roomId, MP.myPlayerId, 'done', { score: score1, name: myName });
  dbUpdate('rooms', { id: MP.roomId }, { status: 'finished' });

  if (MP.opponentFinalScore !== null) {
    doShowResults();
  } else {
    showWaitingForOpponent();
  }
}

function showWaitingForOpponent() {
  hideGamePanels();
  const od = document.getElementById('od-final');
  if (od) od.style.display = 'none';

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
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Your score is locked.</div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>' +
      '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + ' to finish...</div>' +
    '</div>';

  // 60s safety fallback
  setTimeout(() => {
    if (!MP.opponentFinalScore) {
      MP.opponentFinalScore = score2;
      doShowResults();
    }
  }, 60000);
}

function doShowResults() {
  stopEventPoll();
  document.getElementById('mp-wait-ov')?.remove();
  if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;
  (window._originalShowResults || window.showResults)?.();
  setTimeout(cleanupMP, 6000);
}

/* ══════════════════════════════════════════
   WAITING ROOM UI
══════════════════════════════════════════ */
function renderWaitingPlayers(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;
  el.innerHTML = players.map((p, i) => {
    const col = i === 0 ? 'var(--em)' : 'var(--am)';
    const bg  = i === 0 ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)';
    const tag = p.name === MP.myName ? ' (YOU)' : p.isHost ? ' (HOST)' : ' (JOINED ✓)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 13px;border:1px solid ${col};background:${bg};">
      <div style="width:30px;height:30px;border:2px solid ${col};color:${col};font-family:var(--px);font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${p.name[0].toUpperCase()}</div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${col};">${p.name}<span style="color:var(--txt3);font-size:6px;margin-left:4px;">${tag}</span></div>
      <div style="width:7px;height:7px;background:${col};border-radius:50%;animation:pulse 1.2s infinite;flex-shrink:0;"></div>
    </div>`;
  }).join('');
}

function showStartBtn() {
  if (document.getElementById('mp-start-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'mp-start-btn';
  btn.className = 'btn em';
  btn.style.cssText = 'max-width:300px;margin-top:8px;';
  btn.textContent = '⛏ START GAME';
  btn.onclick = hostStartGame;
  const back = document.querySelector('#page-waiting .btn.ghost');
  if (back) back.insertAdjacentElement('beforebegin', btn);
}
function hideStartBtn() { document.getElementById('mp-start-btn')?.remove(); }

/* ══════════════════════════════════════════
   OVERRIDE joinOrCreate FROM game.js
══════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const nameEl = document.getElementById('pname-input');
  const codeEl = document.getElementById('room-input');
  const playerName = (nameEl?.value.trim() || 'MINER').toUpperCase();
  const roomCode   = codeEl?.value.trim().toUpperCase() || '';

  // Reset
  stopRoomPoll(); stopEventPoll();
  MP.roomId=null; MP.myPlayerId=null; MP.myName=playerName;
  MP.opponentName=null; MP.gameStarted=false; MP.iFinished=false;
  MP.opponentFinalScore=null; MP.lastEventId=0; MP.isHost=false;
  const listEl = document.getElementById('mp-player-list');
  if (listEl) listEl.innerHTML = '';
  hideStartBtn();

  showPage('waiting');
  showMultiStatus('Connecting...');

  if (roomCode) {
    /* ──── JOINER ──── */
    document.getElementById('room-display').textContent = roomCode;
    showMultiStatus('Looking up room ' + roomCode + '...');

    const room = await dbSelect('rooms', { id: roomCode });
    if (!room) {
      showMultiError('⚠ Room "' + roomCode + '" not found. Check the code.');
      return;
    }
    if (room.status === 'finished') {
      showMultiError('⚠ That game already finished.');
      return;
    }
    if (room.status === 'starting' || room.status === 'active') {
      showMultiError('⚠ That game already started.');
      return;
    }

    const updated = await dbUpdate('rooms', { id: roomCode }, { player2_name: playerName });
    if (!updated) {
      showMultiError('⚠ Could not join room. Try again.');
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
    /* ──── HOST ──── */
    const roomId = 'GL' + Math.floor(1000 + Math.random() * 9000);
    const seed   = Math.floor(Math.random() * 1000000);

    showMultiStatus('Creating room...');
    const room = await dbInsert('rooms', {
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: seed,
    });

    if (!room) {
      showMultiError('⚠ Could not create room. Check your Supabase credentials.');
      return;
    }

    MP.roomId       = roomId;
    MP.myPlayerId   = 1;
    MP.isHost       = true;
    MP.questionSeed = seed;

    document.getElementById('room-display').textContent = roomId;
    showMultiStatus('Share this code. Waiting for players...');
    startRoomPoll();
  }
};

/* ══════════════════════════════════════════
   OVERRIDE simulateOpponentAnswer
══════════════════════════════════════════ */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random()*20) : -20));
    streak2 = correct ? streak2+1 : 0;
    updateHUD();
  }
};

/* ══════════════════════════════════════════
   PATCH game.js — broadcast events
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  function mpBroadcast(type, extra) {
    if (mode !== 'multi' || !MP.roomId) return;
    dbInsertEvent(MP.roomId, MP.myPlayerId, type,
      Object.assign({ name: myName }, extra || {}));
  }

  const _sa = window.selectAnswer;
  if (_sa) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _sa(btn, correct, q, shuffled);
      mpBroadcast('answer', { score: score1, correct, streak: streak1 });
    };
  }

  const _sb = window.selectBluff;
  if (_sb) {
    window.selectBluff = function(btn, origIndex, q) {
      _sb(btn, origIndex, q);
      mpBroadcast('answer', { score: score1, correct: origIndex===q.bluff, streak: streak1 });
    };
  }

  const _ov = window.castODVote;
  if (_ov) {
    window.castODVote = function(vote) {
      _ov(vote);
      mpBroadcast('od_vote', { vote });
    };
  }

  const _sr = window.showResults;
  if (_sr) {
    window._originalShowResults = _sr;
    window.showResults = function() {
      if (mode === 'multi' && MP.roomId) {
        notifyIFinished();
      } else {
        _sr();
      }
    };
  }

  window.showFinalResults = doShowResults;
});

/* ══════════════════════════════════════════
   CLEANUP
══════════════════════════════════════════ */
function cleanupMP() {
  stopRoomPoll(); stopEventPoll();
  if (MP.roomId) {
    dbInsertEvent(MP.roomId, MP.myPlayerId, 'bye', {});
  }
  MP.roomId=null; MP.myPlayerId=null;
  MP.gameStarted=false; MP.iFinished=false;
}
window.addEventListener('beforeunload', () => MP.roomId && cleanupMP());

/* ══════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════ */
function showMultiStatus(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = ''; }
}
function showMultiError(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--rs)'; }
}

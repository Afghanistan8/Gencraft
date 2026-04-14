/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v8)
   Pure Supabase — uses EXISTING schema
   No new columns required.

   Existing rooms table columns used:
     id, player1_name, player2_name,
     status, question_seed

   Status flow:
     'waiting'  → host created, no one joined
     'ready'    → at least 1 player joined
     'starting' → host clicked START
     'active'   → game running
     'finished' → game over
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
const MP = {
  roomId:             null,
  isHost:             false,
  myName:             null,
  opponentName:       null,
  questionSeed:       null,
  channel:            null,
  isConnected:        false,
  gameStarted:        false,
  pollTimer:          null,
  iFinished:          false,
  opponentFinalScore: null,
  myFinalScore:       null,
};

/* ════════════════════════════════════════
   SUPABASE CLIENT
════════════════════════════════════════ */
function getDB() {
  if (!window._supabaseClient) {
    if (!window.supabase) {
      showMultiError('Supabase not loaded. Please refresh.');
      return null;
    }
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return window._supabaseClient;
}

/* ════════════════════════════════════════
   SEEDED QUESTIONS — same order both sides
════════════════════════════════════════ */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
function seededShuffle(arr, seed) {
  const rand = seededRandom(seed);
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function buildQuestionsFromSeed(seed) {
  const base   = seededShuffle([...QUESTIONS], seed).slice(0, 16);
  const bluffs = seededShuffle([...BLUFFS], seed + 1).slice(0, 4);
  const out = [];
  let bi = 0;
  for (let i = 0; i < base.length; i++) {
    out.push(base[i]);
    if ((i + 1) % 4 === 0 && bi < bluffs.length) out.push(bluffs[bi++]);
  }
  return out.slice(0, 20);
}

/* ════════════════════════════════════════
   DATABASE HELPERS
════════════════════════════════════════ */
async function dbCreate(playerName) {
  const db = getDB();
  if (!db) return null;

  const roomId = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const seed   = Math.floor(Math.random() * 1000000);

  const { error } = await db.from('rooms').insert({
    id:            roomId,
    player1_name:  playerName,
    status:        'waiting',
    question_seed: seed,
  });

  if (error) {
    showMultiError('Could not create room: ' + error.message);
    console.error('DB create error:', error);
    return null;
  }

  return { roomId, seed };
}

async function dbJoin(roomId, playerName) {
  const db = getDB();
  if (!db) return { ok: false, msg: 'Database not available.' };

  const { data: room, error: fe } = await db
    .from('rooms').select('*').eq('id', roomId).single();

  if (fe || !room) return { ok: false, msg: 'Room "' + roomId + '" not found. Check the code.' };

  if (room.status === 'finished')
    return { ok: false, msg: 'That game has already finished.' };
  if (room.status === 'starting' || room.status === 'active')
    return { ok: false, msg: 'That game has already started.' };

  const { error: ue } = await db.from('rooms')
    .update({ player2_name: playerName, status: 'ready' })
    .eq('id', roomId);

  if (ue) return { ok: false, msg: 'Could not join: ' + ue.message };

  return { ok: true, room };
}

async function dbFetch(roomId) {
  const db = getDB();
  if (!db) return null;
  const { data, error } = await db
    .from('rooms').select('*').eq('id', roomId).single();
  if (error || !data) return null;
  return data;
}

async function dbSetStatus(status) {
  const db = getDB();
  if (!db || !MP.roomId) return false;
  const { error } = await db.from('rooms')
    .update({ status })
    .eq('id', MP.roomId);
  if (error) {
    console.error('Status update failed:', error);
    return false;
  }
  return true;
}

/* ════════════════════════════════════════
   WAITING ROOM — POLL LOOP
   Runs every 2.5s. Reads DB row and:
   • Updates the live player list UI
   • Detects when status → 'starting'
════════════════════════════════════════ */
function startPoll() {
  stopPoll();
  MP.pollTimer = setInterval(mpPollTick, 2500);
  // Run immediately so UI updates without waiting 2.5s
  mpPollTick();
}

function stopPoll() {
  if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = null; }
}

async function mpPollTick() {
  if (!MP.roomId) return;

  const room = await dbFetch(MP.roomId);
  if (!room) return;

  // Build player list from what we know
  const players = [];
  if (room.player1_name) players.push({ name: room.player1_name, isHost: true });
  if (room.player2_name) players.push({ name: room.player2_name, isHost: false });

  // Store opponent name
  if (MP.isHost && room.player2_name) {
    MP.opponentName = room.player2_name;
  } else if (!MP.isHost) {
    MP.opponentName = room.player1_name;
  }

  // Render player cards
  renderPlayerList(players);

  if (MP.isHost) {
    if (players.length === 1) {
      showMultiStatus('Waiting for players to join...');
      hideStartBtn();
    } else {
      showMultiStatus(players.length + ' player' + (players.length > 1 ? 's' : '') + ' ready — start when everyone is in!');
      showStartBtn();
    }
  } else {
    showMultiStatus('Waiting for host to start... (' + players.length + ' in room)');
  }

  // DETECT GAME START → triggered when host sets status='starting'
  if (room.status === 'starting' && !MP.gameStarted) {
    stopPoll();
    MP.gameStarted  = true;
    MP.questionSeed = room.question_seed;

    // Update opponent name one more time from fresh data
    if (MP.isHost) {
      MP.opponentName = room.player2_name || 'OPPONENT';
    } else {
      MP.opponentName = room.player1_name || 'OPPONENT';
    }

    showMultiStatus('Game starting...');
    runCountdown(3, () => {
      connectBroadcast(MP.roomId);
      launchGame();
    });
  }

  if (room.status === 'finished' && !MP.gameStarted) {
    stopPoll();
    showMultiError('Room was closed.');
  }
}

/* ════════════════════════════════════════
   HOST START GAME
════════════════════════════════════════ */
async function hostStartGame() {
  if (!MP.isHost || !MP.roomId) return;

  const btn = document.getElementById('mp-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'STARTING...'; }

  showMultiStatus('Starting game...');
  stopPoll();

  const ok = await dbSetStatus('starting');
  if (!ok) {
    showMultiError('Failed to start. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = '⛏ START GAME'; }
    startPoll();
    return;
  }

  // Host launches immediately — no need to wait for next poll
  MP.gameStarted = true;
  runCountdown(3, () => {
    connectBroadcast(MP.roomId);
    launchGame();
  });
}

// Expose globally so onclick="hostStartGame()" works in HTML
window.hostStartGame = hostStartGame;

/* ════════════════════════════════════════
   COUNTDOWN HELPER
════════════════════════════════════════ */
function runCountdown(n, onDone) {
  showMultiStatus('Starting in ' + n + '...');
  let i = n;
  const iv = setInterval(() => {
    i--;
    if (i > 0) {
      showMultiStatus('Starting in ' + i + '...');
    } else {
      clearInterval(iv);
      onDone();
    }
  }, 1000);
}

/* ════════════════════════════════════════
   WAITING ROOM UI HELPERS
════════════════════════════════════════ */
function renderPlayerList(players) {
  // The mp-player-list div already exists in game.html
  let el = document.getElementById('mp-player-list');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mp-player-list';
    el.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;max-width:320px;margin-top:8px;';
    const indicator = document.querySelector('#page-waiting .wait-indicator');
    if (indicator) indicator.insertAdjacentElement('afterend', el);
  }

  el.innerHTML = players.map((p, i) => {
    const col  = i === 0 ? 'var(--em)' : 'var(--am)';
    const bg   = i === 0 ? 'rgba(74,222,128,0.05)' : 'rgba(251,191,36,0.05)';
    const isMe = p.name === MP.myName;
    const tag  = isMe ? ' · YOU' : (p.isHost ? ' · HOST' : ' · JOINED');
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid ${col};background:${bg};">
      <div style="width:30px;height:30px;border:2px solid ${col};color:${col};font-family:var(--px);font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${p.name[0].toUpperCase()}</div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${col};letter-spacing:.04em;">${p.name}<span style="color:var(--txt3);font-size:6px;">${tag}</span></div>
      <div style="width:7px;height:7px;background:${col};border-radius:50%;animation:pulse 1.2s ease-in-out infinite;"></div>
    </div>`;
  }).join('');
}

function showStartBtn() {
  if (document.getElementById('mp-start-btn')) return;
  const btn = document.createElement('button');
  btn.id        = 'mp-start-btn';
  btn.className = 'btn em';
  btn.style.cssText = 'max-width:300px;margin-top:4px;';
  btn.textContent = '⛏ START GAME';
  btn.onclick = hostStartGame;
  const backBtn = document.querySelector('#page-waiting .btn.ghost');
  if (backBtn) backBtn.insertAdjacentElement('beforebegin', btn);
}

function hideStartBtn() {
  document.getElementById('mp-start-btn')?.remove();
}

/* ════════════════════════════════════════
   SUPABASE REALTIME BROADCAST
   In-game score/event sync.
   Channel-level only — no postgres_changes.
   Works on all Supabase plans.
════════════════════════════════════════ */
function connectBroadcast(roomId) {
  const db = getDB();
  if (!db) return;

  const ch = db.channel('gc:' + roomId, {
    config: { broadcast: { self: false } },
  });

  ch.on('broadcast', { event: '*' }, ({ event, payload }) => {
    handleBroadcast(event, payload || {});
  });

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') MP.isConnected = true;
  });

  MP.channel = ch;
}

function broadcast(event, payload) {
  if (!MP.channel) return;
  MP.channel.send({ type: 'broadcast', event, payload: payload || {} });
}

/* ════════════════════════════════════════
   IN-GAME BROADCAST HANDLER
════════════════════════════════════════ */
function handleBroadcast(event, data) {
  if (event === 'answer') {
    if (data.player_name && data.player_name !== myName) {
      score2  = data.new_score  || score2;
      streak2 = data.streak     || 0;
      if (data.player_name !== MP.opponentName) {
        MP.opponentName = data.player_name;
        const el = document.getElementById('p2name');
        if (el) el.textContent = data.player_name;
      }
      updateHUD();
    }
  }

  if (event === 'game_finished') {
    if (data.player_name && data.player_name !== myName) {
      MP.opponentFinalScore = data.final_score;
      if (data.player_name) MP.opponentName = data.player_name;
      score2 = data.final_score;
      updateHUD();
      if (MP.iFinished) doShowFinalResults();
    }
  }

  if (event === 'disconnect') {
    if (!MP.iFinished) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const p2 = document.getElementById('p2name')?.closest('.hud-player');
      if (p2) p2.style.opacity = '0.4';
    } else {
      MP.opponentFinalScore = MP.opponentFinalScore ?? score2;
      doShowFinalResults();
    }
  }
}

/* ════════════════════════════════════════
   GAME LAUNCH
════════════════════════════════════════ */
function launchGame() {
  mode      = 'multi';
  myName    = MP.myName;
  questions = buildQuestionsFromSeed(MP.questionSeed);

  showPage('game');
  startGame();

  // Set opponent name after startGame (which sets p1name)
  const p2el = document.getElementById('p2name');
  if (p2el) p2el.textContent = MP.opponentName || 'OPPONENT';
}

/* ════════════════════════════════════════
   RESULTS SYNCHRONISATION
════════════════════════════════════════ */
function notifyIFinished() {
  MP.iFinished    = true;
  MP.myFinalScore = score1;

  broadcast('game_finished', {
    final_score:  score1,
    player_name:  myName,
  });

  if (MP.opponentFinalScore !== null) {
    doShowFinalResults();
  } else {
    showWaitingForOpponent();
  }
}

function showWaitingForOpponent() {
  hideGamePanels();
  const od = document.getElementById('od-final');
  if (od) od.style.display = 'none';

  let ov = document.getElementById('mp-waiting-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'mp-waiting-ov';
    ov.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;margin:16px;';
    document.getElementById('page-game').appendChild(ov);
  }
  ov.style.display = 'flex';
  ov.innerHTML =
    '<div style="font-family:var(--px);font-size:8px;color:var(--am)">ROUND COMPLETE</div>' +
    '<div style="font-family:var(--px);font-size:24px;color:var(--em)">' + score1 + ' XP</div>' +
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Your score is locked.</div>' +
    '<div style="display:flex;align-items:center;gap:10px;">' +
      '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite;"></div>' +
      '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + ' to finish...</div>' +
    '</div>';

  // 60s fallback
  setTimeout(() => {
    if (!MP.opponentFinalScore) {
      MP.opponentFinalScore = score2;
      doShowFinalResults();
    }
  }, 60000);
}

function doShowFinalResults() {
  document.getElementById('mp-waiting-ov')?.remove();
  if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;
  if (window._originalShowResults) {
    window._originalShowResults();
  } else if (window.showResults) {
    window.showResults();
  }
  setTimeout(() => cleanupMP(), 6000);
}

/* ════════════════════════════════════════
   CLEANUP
════════════════════════════════════════ */
function cleanupMP() {
  stopPoll();
  if (MP.channel) {
    broadcast('disconnect', {});
    const db = getDB();
    if (db) db.removeChannel(MP.channel);
    MP.channel = null;
  }
  if (MP.roomId) {
    const db = getDB();
    if (db) db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
  }
  MP.isConnected        = false;
  MP.gameStarted        = false;
  MP.iFinished          = false;
  MP.opponentFinalScore = null;
  MP.myFinalScore       = null;
}

window.addEventListener('beforeunload', () => {
  if (MP.roomId) cleanupMP();
});

/* ════════════════════════════════════════
   OVERRIDE joinOrCreate FROM game.js
════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const nameInput = document.getElementById('pname-input');
  const codeInput = document.getElementById('room-input');
  const playerName = (nameInput?.value.trim() || 'MINER').toUpperCase();
  const roomCode   = codeInput?.value.trim().toUpperCase() || '';

  // Reset state
  MP.roomId = null; MP.isHost = false; MP.myName = null;
  MP.opponentName = null; MP.gameStarted = false;
  MP.iFinished = false; MP.opponentFinalScore = null;
  stopPoll();
  document.getElementById('mp-player-list')?.remove();
  document.getElementById('mp-start-btn')?.remove();

  showPage('waiting');
  showMultiStatus('Connecting...');

  if (roomCode) {
    /* ──────── JOINER ──────── */
    document.getElementById('room-display').textContent = roomCode;
    showMultiStatus('Looking up room ' + roomCode + '...');

    const result = await dbJoin(roomCode, playerName);
    if (!result.ok) {
      showMultiError(result.msg);
      return;
    }

    MP.roomId       = roomCode;
    MP.isHost       = false;
    MP.myName       = playerName;
    MP.opponentName = result.room.player1_name;
    MP.questionSeed = result.room.question_seed;

    showMultiStatus('Joined! Waiting for host to start...');
    startPoll();

  } else {
    /* ──────── HOST ──────── */
    showMultiStatus('Creating room...');

    const result = await dbCreate(playerName);
    if (!result) return; // error shown by dbCreate

    MP.roomId       = result.roomId;
    MP.isHost       = true;
    MP.myName       = playerName;
    MP.questionSeed = result.seed;

    document.getElementById('room-display').textContent = result.roomId;
    showMultiStatus('Share this code. Waiting for players to join...');
    startPoll();
  }
};

/* ════════════════════════════════════════
   OVERRIDE simulateOpponentAnswer
════════════════════════════════════════ */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    streak2 = correct ? streak2 + 1 : 0;
    updateHUD();
  }
};

/* ════════════════════════════════════════
   PATCH game.js — broadcast in-game events
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi' && MP.isConnected) {
        broadcast('answer', { new_score: score1, correct, streak: streak1, player_name: myName });
      }
    };
  }

  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi' && MP.isConnected) {
        broadcast('answer', { new_score: score1, correct: origIndex === q.bluff, streak: streak1, player_name: myName });
      }
    };
  }

  const _castODVote = window.castODVote;
  if (_castODVote) {
    window.castODVote = function(vote) {
      _castODVote(vote);
      if (mode === 'multi' && MP.isConnected) broadcast('od_vote', { vote });
    };
  }

  // Save original showResults, replace with sync version
  const _showResults = window.showResults;
  if (_showResults) {
    window._originalShowResults = _showResults;
    window.showResults = function() {
      if (mode === 'multi' && MP.channel) {
        notifyIFinished();
      } else {
        _showResults();
      }
    };
  }

  window.showFinalResults = doShowFinalResults;
});

/* ════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════ */
function showMultiStatus(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = ''; }
}
function showMultiError(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = '⚠ ' + msg; el.style.color = 'var(--rs)'; }
}

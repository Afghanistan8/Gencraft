/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v7)
   100% Supabase — no Ably dependency

   PASTE YOUR CREDENTIALS:
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ════════════════════════════════════════
   ARCHITECTURE
   ────────────────────────────────────
   Waiting room  → DB polling every 2s
                   Host sees player list + START button
                   Game only starts when host clicks START
                   All players receive 'game_started' event

   In-game sync  → Supabase Realtime Broadcast
                   (channel-level messaging, no postgres_changes)
                   Works on all Supabase plans, no RLS needed

   Flow:
   1. Host creates room (status='waiting', players=[hostName])
   2. Joiners update rooms.players array in DB + set status='joining'
   3. Host polls DB every 2s, sees new players listed
   4. Host clicks START → sets status='starting', writes seed
   5. All players' polls detect status='starting' → launch game
   6. In-game: answers/scores flow via Realtime Broadcast channel
   7. End of game: players post final score to DB then show results
════════════════════════════════════════ */

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
const MP = {
  roomId:            null,
  isHost:            false,
  myName:            null,
  myIndex:           0,       // position in players array (0 = host)
  players:           [],      // [{name, score, finished}]
  questionSeed:      null,
  channel:           null,    // Supabase Realtime broadcast channel
  isConnected:       false,
  gameStarted:       false,
  pollTimer:         null,    // waiting room poll interval
  iFinished:         false,
  opponentFinalScore:null,
  opponentName:      null,    // convenience alias for 1v1
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
   SEEDED QUESTIONS
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
   ROOM OPERATIONS
════════════════════════════════════════ */
async function createRoom(playerName) {
  const db   = getDB();
  if (!db) return null;

  const roomId       = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const questionSeed = Math.floor(Math.random() * 1000000);
  const players      = [{ name: playerName, score: 0, finished: false }];

  const { error } = await db.from('rooms').insert({
    id:            roomId,
    player1_name:  playerName,
    status:        'waiting',
    question_seed: questionSeed,
    players:       JSON.stringify(players),
  });

  if (error) {
    showMultiError('Could not create room: ' + error.message);
    return null;
  }

  MP.roomId       = roomId;
  MP.isHost       = true;
  MP.myName       = playerName;
  MP.myIndex      = 0;
  MP.questionSeed = questionSeed;
  MP.players      = players;

  return roomId;
}

async function joinRoom(roomId, playerName) {
  const db = getDB();
  if (!db) return { ok: false, msg: 'Not connected' };

  // Fetch the room
  const { data: room, error: fetchErr } = await db
    .from('rooms').select('*').eq('id', roomId).single();

  if (fetchErr || !room) return { ok: false, msg: 'Room ' + roomId + ' not found.' };
  if (room.status === 'finished')  return { ok: false, msg: 'That game already finished.' };
  if (room.status === 'starting' || room.status === 'active')
    return { ok: false, msg: 'Game already in progress.' };

  // Parse existing players
  let players = [];
  try { players = JSON.parse(room.players || '[]'); } catch(e) {}

  // Check not already in room
  if (players.find(p => p.name === playerName)) {
    playerName = playerName + (players.length + 1);
  }

  players.push({ name: playerName, score: 0, finished: false });

  const { error: updateErr } = await db.from('rooms')
    .update({ players: JSON.stringify(players), player2_name: playerName })
    .eq('id', roomId);

  if (updateErr) return { ok: false, msg: 'Could not join: ' + updateErr.message };

  MP.roomId       = roomId;
  MP.isHost       = false;
  MP.myName       = playerName;
  MP.myIndex      = players.length - 1;
  MP.questionSeed = room.question_seed;
  MP.players      = players;
  MP.opponentName = room.player1_name;

  return { ok: true, room };
}

async function fetchRoom(roomId) {
  const db = getDB();
  if (!db) return null;
  const { data: room, error } = await db
    .from('rooms').select('*').eq('id', roomId).single();
  if (error || !room) return null;
  return room;
}

async function setRoomStatus(status, extra = {}) {
  const db = getDB();
  if (!db || !MP.roomId) return;
  await db.from('rooms').update({ status, ...extra }).eq('id', MP.roomId);
}

/* ════════════════════════════════════════
   WAITING ROOM UI — host view
════════════════════════════════════════ */
function renderWaitingPlayers(players) {
  let el = document.getElementById('mp-player-list');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mp-player-list';
    el.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;max-width:320px;';
    const waitMsg = document.getElementById('wait-msg');
    if (waitMsg) waitMsg.parentNode.insertBefore(el, waitMsg.nextSibling);
  }

  el.innerHTML = players.map((p, i) => {
    const isMe   = i === MP.myIndex;
    const colour = i === 0 ? 'var(--em)' : 'var(--am)';
    const tag    = i === 0 ? ' (HOST)' : ' (JOINED)';
    return `
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:8px 12px;
        border:1px solid ${colour};
        background:${i===0?'rgba(74,222,128,0.05)':'rgba(251,191,36,0.05)'};
      ">
        <div style="width:28px;height:28px;border:2px solid ${colour};color:${colour};
          font-family:var(--px);font-size:9px;display:flex;align-items:center;justify-content:center;">
          ${p.name[0].toUpperCase()}
        </div>
        <div style="flex:1">
          <div style="font-family:var(--px);font-size:8px;color:${colour}">${p.name}${isMe?' (YOU)':tag}</div>
        </div>
        <div style="width:8px;height:8px;background:${colour};border-radius:50%;animation:pulse 1.2s infinite"></div>
      </div>`;
  }).join('');
}

function showStartButton() {
  if (document.getElementById('mp-start-btn')) return;

  const btn = document.createElement('button');
  btn.id        = 'mp-start-btn';
  btn.className = 'btn em';
  btn.style.cssText = 'max-width:300px;margin-top:8px;animation:pulse 1s ease-in-out infinite alternate;';
  btn.textContent = '⛏ START THE GAME';
  btn.onclick = hostStartGame;

  const backBtn = document.querySelector('#page-waiting .btn.ghost');
  if (backBtn) backBtn.parentNode.insertBefore(btn, backBtn);
}

function hideStartButton() {
  document.getElementById('mp-start-btn')?.remove();
}

/* ════════════════════════════════════════
   POLL WAITING ROOM
   Checks DB every 2 seconds for:
   - New players joining (host sees list update)
   - status = 'starting' (non-host starts game)
════════════════════════════════════════ */
function startWaitingPoll() {
  stopWaitingPoll();

  MP.pollTimer = setInterval(async () => {
    const room = await fetchRoom(MP.roomId);
    if (!room) return;

    // Parse current players
    let players = [];
    try { players = JSON.parse(room.players || '[]'); } catch(e) {}
    MP.players = players;

    // ── HOST view ──
    if (MP.isHost) {
      const count = players.length;

      if (count === 1) {
        showMultiStatus('Waiting for players... (1/' + count + ')');
      } else {
        showMultiStatus(count + ' players ready — click START when everyone is in!');
      }

      renderWaitingPlayers(players);

      // Show start button once at least 1 opponent has joined
      if (count >= 2) {
        showStartButton();
      } else {
        hideStartButton();
      }
    }

    // ── NON-HOST view ──
    else {
      renderWaitingPlayers(players);
      showMultiStatus('Waiting for host to start... (' + players.length + ' player' + (players.length !== 1 ? 's' : '') + ' in room)');
    }

    // ── GAME START — detected by ALL players including host ──
    if (room.status === 'starting' && !MP.gameStarted) {
      MP.gameStarted  = true;
      MP.questionSeed = room.question_seed;
      stopWaitingPoll();

      // Update opponent name for 1v1
      if (players.length === 2) {
        const opp = players.find((_, i) => i !== MP.myIndex);
        if (opp) MP.opponentName = opp.name;
      }

      // Short countdown then launch
      let count = 3;
      showMultiStatus('Game starting in ' + count + '...');
      const iv = setInterval(() => {
        count--;
        if (count > 0) {
          showMultiStatus('Starting in ' + count + '...');
        } else {
          clearInterval(iv);
          connectBroadcastChannel(MP.roomId);
          launchGame();
        }
      }, 1000);
    }

    // Room was closed/finished
    if (room.status === 'finished' && !MP.gameStarted) {
      stopWaitingPoll();
      showMultiError('Room was closed by the host.');
    }

  }, 2000);
}

function stopWaitingPoll() {
  if (MP.pollTimer) {
    clearInterval(MP.pollTimer);
    MP.pollTimer = null;
  }
}

/* ════════════════════════════════════════
   HOST — START GAME
   Called when host clicks START GAME btn
════════════════════════════════════════ */
async function hostStartGame() {
  if (!MP.isHost) return;

  const btn = document.getElementById('mp-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'STARTING...'; }

  // Write status='starting' to DB so all pollers detect it
  await setRoomStatus('starting', {
    status:       'starting',
    question_seed: MP.questionSeed,
  });

  // Host's own poll will pick this up in ≤2s
  // But trigger it immediately for the host
  MP.gameStarted  = true;
  stopWaitingPoll();

  // Update opponent name
  if (MP.players.length === 2) {
    const opp = MP.players.find((_, i) => i !== 0);
    if (opp) MP.opponentName = opp.name;
  }

  let count = 3;
  showMultiStatus('Starting in ' + count + '...');
  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      showMultiStatus('Starting in ' + count + '...');
    } else {
      clearInterval(iv);
      connectBroadcastChannel(MP.roomId);
      launchGame();
    }
  }, 1000);
}

/* ════════════════════════════════════════
   SUPABASE REALTIME BROADCAST CHANNEL
   Used for in-game events ONLY
   (scores, answers, game_finished)
   This is channel-level broadcast —
   does NOT require postgres_changes or RLS
════════════════════════════════════════ */
function connectBroadcastChannel(roomId) {
  const db = getDB();
  if (!db) return;

  const channel = db.channel('gencraft-game-' + roomId, {
    config: { broadcast: { self: false, ack: false } },
  });

  channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
    handleBroadcast(event, payload);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      MP.isConnected = true;
    }
  });

  MP.channel = channel;
}

function broadcast(event, payload) {
  if (!MP.channel || !MP.isConnected) return;
  MP.channel.send({ type: 'broadcast', event, payload: payload || {} });
}

/* ════════════════════════════════════════
   BROADCAST MESSAGE HANDLER (in-game)
════════════════════════════════════════ */
function handleBroadcast(event, data) {

  if (event === 'answer') {
    // Find which player this is and update their score
    const senderIdx = data.player_index;
    if (senderIdx !== MP.myIndex) {
      // For 1v1, this is opponent
      score2  = data.new_score;
      streak2 = data.streak || 0;
      if (data.player_name) {
        MP.opponentName = data.player_name;
        const p2el = document.getElementById('p2name');
        if (p2el) p2el.textContent = data.player_name;
      }
      updateHUD();
    }
  }

  if (event === 'game_finished') {
    if (data.player_index !== MP.myIndex) {
      MP.opponentFinalScore = data.final_score;
      if (data.player_name) MP.opponentName = data.player_name;
      score2 = data.final_score;
      updateHUD();

      if (MP.iFinished) {
        doShowFinalResults();
      }
    }
  }

  if (event === 'disconnect') {
    if (!MP.iFinished) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const p2 = document.getElementById('p2name')?.closest('.hud-player');
      if (p2) p2.style.opacity = '0.35';
    } else if (MP.iFinished && MP.opponentFinalScore === null) {
      MP.opponentFinalScore = score2;
      doShowFinalResults();
    }
  }
}

/* ════════════════════════════════════════
   RESULTS SYNC
   My finish + opponent finish → show results
════════════════════════════════════════ */
function notifyIFinished() {
  MP.iFinished    = true;
  MP.myFinalScore = score1;

  broadcast('game_finished', {
    final_score:  score1,
    player_name:  myName,
    player_index: MP.myIndex,
  });

  // Save my final score to DB too
  saveFinalScoreToDB(score1);

  if (MP.opponentFinalScore !== null) {
    doShowFinalResults();
  } else {
    showWaitingForOpponent();
  }
}

async function saveFinalScoreToDB(finalScore) {
  const db = getDB();
  if (!db || !MP.roomId) return;
  const room = await fetchRoom(MP.roomId);
  if (!room) return;
  let players = [];
  try { players = JSON.parse(room.players || '[]'); } catch(e) {}
  if (players[MP.myIndex]) {
    players[MP.myIndex].score    = finalScore;
    players[MP.myIndex].finished = true;
    await db.from('rooms').update({ players: JSON.stringify(players) }).eq('id', MP.roomId);
  }
}

function showWaitingForOpponent() {
  hideGamePanels();
  document.getElementById('od-final')?.style && (document.getElementById('od-final').style.display = 'none');

  let overlay = document.getElementById('waiting-for-opponent');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'waiting-for-opponent';
    overlay.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;';
    document.getElementById('page-game').appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div style="font-family:var(--px);font-size:8px;color:var(--am)">GAME COMPLETE</div>' +
    '<div style="font-family:var(--px);font-size:22px;color:var(--em)">' + score1 + ' XP</div>' +
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Your score is locked in.</div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>' +
      '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + ' to finish...</div>' +
    '</div>';

  // 60s safety fallback
  setTimeout(() => {
    if (!MP.opponentFinalScore) {
      MP.opponentFinalScore = score2;
      doShowFinalResults();
    }
  }, 60000);
}

function doShowFinalResults() {
  document.getElementById('waiting-for-opponent')?.remove();
  if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;
  if (window._originalShowResults) {
    window._originalShowResults();
  } else {
    showResults();
  }
  setTimeout(() => cleanupMP(), 5000);
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

  // Set opponent name in HUD after startGame runs
  const p2el = document.getElementById('p2name');
  if (p2el) p2el.textContent = MP.opponentName || 'OPPONENT';
}

/* ════════════════════════════════════════
   OVERRIDE joinOrCreate FROM game.js
════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input').value.trim() || 'MINER').toUpperCase();
  const codeInput  = document.getElementById('room-input').value.trim().toUpperCase();

  showPage('waiting');
  showMultiStatus('Connecting...');

  // Clear any old player list
  document.getElementById('mp-player-list')?.remove();
  document.getElementById('mp-start-btn')?.remove();

  if (codeInput) {
    /* ─────── PLAYER JOINING ─────── */
    document.getElementById('room-display').textContent = codeInput;
    showMultiStatus('Looking up room ' + codeInput + '...');

    const result = await joinRoom(codeInput, playerName);
    if (!result.ok) {
      showMultiError(result.msg);
      return;
    }

    showMultiStatus('Joined! Waiting for host to start...');
    renderWaitingPlayers(MP.players);
    startWaitingPoll();

  } else {
    /* ─────── HOST CREATING ─────── */
    showMultiStatus('Creating room...');

    const roomId = await createRoom(playerName);
    if (!roomId) return;

    document.getElementById('room-display').textContent = roomId;
    showMultiStatus('Share this code. Waiting for players...');
    renderWaitingPlayers(MP.players);
    startWaitingPoll();
  }
};

/* ════════════════════════════════════════
   OPPONENT SIMULATION OVERRIDE
════════════════════════════════════════ */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    streak2 = correct ? streak2 + 1 : 0;
    updateHUD();
  }
};

/* ════════════════════════════════════════
   PATCH game.js FUNCTIONS
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  // Broadcast answer events
  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi' && MP.isConnected) {
        broadcast('answer', {
          new_score:    score1,
          correct,
          streak:       streak1,
          player_name:  myName,
          player_index: MP.myIndex,
        });
      }
    };
  }

  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi' && MP.isConnected) {
        broadcast('answer', {
          new_score:    score1,
          correct:      origIndex === q.bluff,
          streak:       streak1,
          player_name:  myName,
          player_index: MP.myIndex,
        });
      }
    };
  }

  const _castODVote = window.castODVote;
  if (_castODVote) {
    window.castODVote = function(vote) {
      _castODVote(vote);
      if (mode === 'multi' && MP.isConnected) {
        broadcast('od_vote', { vote });
      }
    };
  }

  // Intercept showResults for multiplayer sync
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

  // Override showFinalResults (called by genlayer.js too)
  window.showFinalResults = doShowFinalResults;

});

/* ════════════════════════════════════════
   CLEANUP
════════════════════════════════════════ */
function cleanupMP() {
  stopWaitingPoll();

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
  if (MP.isConnected || MP.pollTimer) cleanupMP();
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

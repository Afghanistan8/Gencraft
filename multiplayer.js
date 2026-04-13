/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v8 — Fixed)
   100% Supabase — no Ably dependency

   WHAT CHANGED vs v7:
   • NEVER removes #mp-player-list from DOM — only clears innerHTML
   • START button goes into a dedicated #mp-start-wrap container
   • Status messages fire immediately (no poll needed for first render)
   • Clear console.error on all Supabase failures for debugging
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
  myIndex:            0,
  players:            [],
  questionSeed:       null,
  channel:            null,
  isConnected:        false,
  gameStarted:        false,
  pollTimer:          null,
  iFinished:          false,
  opponentFinalScore: null,
  opponentName:       null,
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
  const db = getDB();
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
    console.error('[MP] createRoom error:', error);
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
  if (!db) return { ok: false, msg: 'Not connected to database.' };

  const { data: room, error: fetchErr } = await db
    .from('rooms').select('*').eq('id', roomId).single();

  if (fetchErr || !room) {
    console.error('[MP] joinRoom fetch error:', fetchErr);
    return { ok: false, msg: 'Room "' + roomId + '" not found. Check the code.' };
  }
  if (room.status === 'finished')
    return { ok: false, msg: 'That game has already finished.' };
  if (room.status === 'starting' || room.status === 'active')
    return { ok: false, msg: 'Game already in progress — too late to join.' };

  let players = [];
  try { players = JSON.parse(room.players || '[]'); } catch(e) {}

  // Avoid duplicate name
  if (players.find(p => p.name === playerName)) {
    playerName = playerName + players.length;
  }
  players.push({ name: playerName, score: 0, finished: false });

  const { error: updateErr } = await db.from('rooms')
    .update({ players: JSON.stringify(players), player2_name: playerName })
    .eq('id', roomId);

  if (updateErr) {
    console.error('[MP] joinRoom update error:', updateErr);
    return { ok: false, msg: 'Could not join: ' + updateErr.message };
  }

  MP.roomId       = roomId;
  MP.isHost       = false;
  MP.myName       = playerName;
  MP.myIndex      = players.length - 1;
  MP.questionSeed = room.question_seed;
  MP.players      = players;
  MP.opponentName = room.player1_name;

  return { ok: true };
}

async function fetchRoom(roomId) {
  const db = getDB();
  if (!db) return null;
  const { data: room, error } = await db
    .from('rooms').select('*').eq('id', roomId).single();
  if (error) { console.error('[MP] fetchRoom error:', error); return null; }
  return room || null;
}

async function setRoomStatus(status, extra = {}) {
  const db = getDB();
  if (!db || !MP.roomId) return;
  const { error } = await db.from('rooms')
    .update({ status, ...extra })
    .eq('id', MP.roomId);
  if (error) console.error('[MP] setRoomStatus error:', error);
}

/* ════════════════════════════════════════
   WAITING ROOM UI HELPERS
   — Uses #mp-player-list (always in DOM)
   — Uses #mp-start-wrap  (always in DOM)
   Never remove these elements, only clear innerHTML
════════════════════════════════════════ */
function renderWaitingPlayers(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;

  el.innerHTML = players.map((p, i) => {
    const isMe   = (i === MP.myIndex);
    const colour = (i === 0) ? 'var(--em)' : 'var(--am)';
    const label  = isMe ? '(YOU)' : (i === 0 ? '(HOST)' : '(JOINED)');
    return `<div style="
      display:flex;align-items:center;gap:10px;padding:8px 12px;
      border:1px solid ${colour};
      background:${i===0?'rgba(74,222,128,0.05)':'rgba(251,191,36,0.05)'};
    ">
      <div style="width:28px;height:28px;border:2px solid ${colour};color:${colour};
        font-family:var(--px);font-size:9px;display:flex;align-items:center;justify-content:center;">
        ${p.name[0].toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="font-family:var(--px);font-size:8px;color:${colour}">${p.name} ${label}</div>
      </div>
      <div style="width:8px;height:8px;background:${colour};border-radius:50%;animation:pulse 1.2s infinite"></div>
    </div>`;
  }).join('');
}

function setStartButtonVisible(visible) {
  const wrap = document.getElementById('mp-start-wrap');
  if (!wrap) return;
  wrap.style.display = visible ? 'block' : 'none';
}

/* ════════════════════════════════════════
   POLL WAITING ROOM  (every 2 s)
════════════════════════════════════════ */
function startWaitingPoll() {
  stopWaitingPoll();

  MP.pollTimer = setInterval(async () => {
    const room = await fetchRoom(MP.roomId);
    if (!room) return;

    let players = [];
    try { players = JSON.parse(room.players || '[]'); } catch(e) {}
    MP.players = players;
    renderWaitingPlayers(players);

    if (MP.isHost) {
      const count = players.length;
      if (count <= 1) {
        showMultiStatus('Waiting for players to join...');
        setStartButtonVisible(false);
      } else {
        showMultiStatus(count + ' players ready — start whenever you like!');
        setStartButtonVisible(true);
      }
    } else {
      showMultiStatus('Waiting for host to start... (' + players.length + ' player' + (players.length !== 1 ? 's' : '') + ' in room)');
    }

    // ── All players detect game start ──
    if (room.status === 'starting' && !MP.gameStarted) {
      MP.gameStarted  = true;
      MP.questionSeed = room.question_seed;
      stopWaitingPoll();

      if (players.length === 2) {
        const opp = players.find((_, i) => i !== MP.myIndex);
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

    if (room.status === 'finished' && !MP.gameStarted) {
      stopWaitingPoll();
      showMultiError('Room was closed.');
    }

  }, 2000);
}

function stopWaitingPoll() {
  if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = null; }
}

/* ════════════════════════════════════════
   HOST — START GAME
════════════════════════════════════════ */
async function hostStartGame() {
  if (!MP.isHost || MP.gameStarted) return;

  setStartButtonVisible(false);
  showMultiStatus('Starting game...');

  await setRoomStatus('starting', { question_seed: MP.questionSeed });

  // Immediately start for the host (don't wait for own poll)
  MP.gameStarted = true;
  stopWaitingPoll();

  if (MP.players.length >= 2) {
    MP.opponentName = MP.players.find((_, i) => i !== 0)?.name || 'OPPONENT';
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

// Expose for inline onclick in HTML
window.hostStartGame = hostStartGame;

/* ════════════════════════════════════════
   SUPABASE REALTIME BROADCAST (in-game)
════════════════════════════════════════ */
function connectBroadcastChannel(roomId) {
  const db = getDB();
  if (!db) return;

  const ch = db.channel('gencraft-game-' + roomId, {
    config: { broadcast: { self: false, ack: false } },
  });

  ch.on('broadcast', { event: '*' }, ({ event, payload }) => {
    handleBroadcast(event, payload);
  });

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') MP.isConnected = true;
    else console.warn('[MP] broadcast channel status:', status);
  });

  MP.channel = ch;
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
    if (data.player_index !== MP.myIndex) {
      score2  = data.new_score;
      streak2 = data.streak || 0;
      if (data.player_name) {
        MP.opponentName = data.player_name;
        const el = document.getElementById('p2name');
        if (el) el.textContent = data.player_name;
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
      if (MP.iFinished) doShowFinalResults();
    }
  }

  if (event === 'disconnect') {
    if (!MP.iFinished) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const p2 = document.getElementById('p2name')?.closest('.hud-player');
      if (p2) p2.style.opacity = '0.35';
    } else if (MP.opponentFinalScore === null) {
      MP.opponentFinalScore = score2;
      doShowFinalResults();
    }
  }
}

/* ════════════════════════════════════════
   RESULTS SYNC
════════════════════════════════════════ */
function notifyIFinished() {
  MP.iFinished    = true;
  MP.myFinalScore = score1;

  broadcast('game_finished', {
    final_score:  score1,
    player_name:  myName,
    player_index: MP.myIndex,
  });

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
  const od = document.getElementById('od-final');
  if (od) od.style.display = 'none';

  let overlay = document.getElementById('waiting-for-opponent');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'waiting-for-opponent';
    overlay.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;';
    document.getElementById('page-game').appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div style="font-family:var(--px);font-size:8px;color:var(--am);letter-spacing:.1em">GAME COMPLETE</div>' +
    '<div style="font-family:var(--px);font-size:22px;color:var(--em)">' + score1 + ' XP</div>' +
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Your score is locked in.</div>' +
    '<div style="display:flex;align-items:center;gap:8px;justify-content:center">' +
      '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>' +
      '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + ' to finish...</div>' +
    '</div>';

  setTimeout(() => {
    if (MP.opponentFinalScore === null) {
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

  const p2el = document.getElementById('p2name');
  if (p2el) p2el.textContent = MP.opponentName || 'OPPONENT';
}

/* ════════════════════════════════════════
   OVERRIDE joinOrCreate
════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const rawName    = document.getElementById('pname-input').value.trim();
  const playerName = (rawName || 'MINER').toUpperCase();
  const codeInput  = document.getElementById('room-input').value.trim().toUpperCase();

  // Show waiting page
  showPage('waiting');

  // Reset UI — clear contents, NOT the elements themselves
  const listEl = document.getElementById('mp-player-list');
  if (listEl) listEl.innerHTML = '';
  setStartButtonVisible(false);

  if (codeInput) {
    /* ─── JOINER ─── */
    document.getElementById('room-display').textContent = codeInput;
    showMultiStatus('Looking up room ' + codeInput + '...');

    const result = await joinRoom(codeInput, playerName);
    if (!result.ok) {
      showMultiError(result.msg);
      return;
    }

    renderWaitingPlayers(MP.players);
    showMultiStatus('Joined! Waiting for host to start the game...');
    startWaitingPoll();

  } else {
    /* ─── HOST ─── */
    showMultiStatus('Creating room...');

    const roomId = await createRoom(playerName);
    if (!roomId) return; // error already shown

    document.getElementById('room-display').textContent = roomId;
    renderWaitingPlayers(MP.players); // Shows just the host slot immediately
    showMultiStatus('Share the code above. Waiting for players to join...');
    startWaitingPoll();
  }
};

/* ════════════════════════════════════════
   PATCH game.js FUNCTIONS
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

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

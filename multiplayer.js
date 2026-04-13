/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (Supabase Broadcast)

   Using Supabase Realtime 'Broadcast' for instant
   websockets without needing Ably or game_event tables.
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */

const MP = {
  roomId:            null,
  myPlayerId:        null,
  myName:            null,
  opponentName:      null,
  questionSeed:      null,
  channel:           null, // Supabase Broadcast channel
  isConnected:       false,
  gameStarted:       false,

  // These track whether both players have finished
  iFinished:         false,
  opponentFinished:  false,
  myFinalScore:      null,
  opponentFinalScore:null,
};

/* ════════════════════════════════════════
   SUPABASE
════════════════════════════════════════ */

function getSupabase() {
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
   SEEDED QUESTIONS — identical order both players
════════════════════════════════════════ */

function seededRandom(seed) {
  let s = seed;
  return function() {
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
   DATABASE — room creation and lookup
════════════════════════════════════════ */

async function createRoomInDB(playerName) {
  const db           = getSupabase();
  const roomId       = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const questionSeed = Math.floor(Math.random() * 1000000);

  if (db) {
    // We only rely on 'id'. If your table has player1_name, we add it. 
    // We removed 'host_name' permanently.
    await db.from('rooms').insert({
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: questionSeed,
    });
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 1;
  MP.myName       = playerName;
  MP.questionSeed = questionSeed;

  return { roomId, questionSeed };
}

async function lookupRoomInDB(roomId) {
  const db = getSupabase();
  if (!db) return null;
  const { data: room, error } = await db
    .from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error || !room) return null;
  return room;
}

/* ════════════════════════════════════════
   SUPABASE BROADCAST CHANNEL
════════════════════════════════════════ */

function connectToRoom(roomId, onMessage) {
  const db = getSupabase();
  if (!db) return;

  showMultiStatus('Connecting...');

  // 1. Create a Supabase channel for this room
  const channel = db.channel('gencraft-' + roomId);
  MP.channel = channel;

  // 2. Listen for Broadcast messages coming from the opponent
  channel.on(
    'broadcast',
    { event: '*' },
    (payload) => {
      onMessage(payload.event, payload.payload);
    }
  );

  // 3. Subscribe to the channel
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      MP.isConnected = true;

      // If Player 2, announce joining
      if (MP.myPlayerId === 2) {
        showMultiStatus('Connected! Announcing to host...');
        publishToChannel('player_joined', {
          name:         MP.myName,
          questionSeed: MP.questionSeed,
        });

        // Fallback in case game_confirmed never arrives
        setTimeout(() => {
          if (!MP.gameStarted) {
            MP.gameStarted = true;
            launchGame();
          }
        }, 8000);
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      showMultiError('Connection failed. Please refresh.');
    }
  });
}

function publishToChannel(eventName, data) {
  if (!MP.channel) return;
  MP.channel.send({
    type:    'broadcast',
    event:   eventName,
    payload: data,
  });
}

/* ════════════════════════════════════════
   MESSAGE HANDLER
   This is the central place that processes
   every message from the opponent
════════════════════════════════════════ */

function handleMessage(event, data) {

  /* ── Player 2 joined — Player 1 receives ── */
  if (event === 'player_joined') {
    if (MP.myPlayerId !== 1) return;
    MP.opponentName = data.name || 'OPPONENT';
    startBothPlayers(data.name, data.questionSeed || MP.questionSeed);
  }

  /* ── Game confirmed — Player 2 receives ── */
  if (event === 'game_confirmed') {
    if (MP.myPlayerId !== 2) return;
    if (data.player1Name) MP.opponentName = data.player1Name;
    if (!MP.gameStarted) {
      MP.gameStarted = true;
      launchGame();
    }
  }

  /* ── Opponent answered a question ── */
  if (event === 'answer') {
    score2  = data.new_score;
    streak2 = data.streak || 0;
    // Update opponent name in HUD if provided
    if (data.player_name) {
      MP.opponentName = data.player_name;
      const p2el = document.getElementById('p2name');
      if (p2el) p2el.textContent = data.player_name;
    }
    updateHUD();
  }

  /* ── Opponent finished their game ── */
  if (event === 'game_finished') {
    MP.opponentFinished   = true;
    MP.opponentFinalScore = data.final_score;
    if (data.player_name) MP.opponentName = data.player_name;

    // Update score2 with the final confirmed score
    score2 = data.final_score;
    updateHUD();

    // If I already finished, we can now show results
    if (MP.iFinished) {
      showFinalResults();
    }
  }

  /* ── Opponent disconnected ── */
  if (event === 'disconnect') {
    // If we haven't shown results yet, show them now
    if (MP.iFinished) {
      showFinalResults();
    } else {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const p2 = document.getElementById('p2name').closest('.hud-player');
      if (p2) p2.style.opacity = '0.35';
    }
  }
}

/* ════════════════════════════════════════
   RESULTS SYNCHRONISATION
════════════════════════════════════════ */

function notifyIFinished() {
  MP.iFinished      = true;
  MP.myFinalScore   = score1;

  publishToChannel('game_finished', {
    final_score: score1,
    player_name: myName,
  });

  if (MP.opponentFinished) {
    showFinalResults();
  } else {
    showWaitingForOpponent();
  }
}

function showWaitingForOpponent() {
  hideGamePanels();
  document.getElementById('od-final').style.display = 'none';

  let overlay = document.getElementById('waiting-for-opponent');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'waiting-for-opponent';
    overlay.style.cssText = [
      'padding:24px',
      'background:var(--stone)',
      'border:2px solid var(--am)',
      'text-align:center',
      'display:flex',
      'flex-direction:column',
      'gap:12px',
      'align-items:center',
    ].join(';');
    document.getElementById('page-game').appendChild(overlay);
  }

  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div style="font-family:var(--px);font-size:8px;color:var(--am);letter-spacing:.1em">GAME COMPLETE</div>' +
    '<div style="font-family:var(--px);font-size:20px;color:var(--em)">' + score1 + ' XP</div>' +
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Your score is locked in.</div>' +
    '<div style="display:flex;align-items:center;gap:8px;justify-content:center">' +
      '<div style="width:8px;height:8px;background:var(--am);animation:pulse 1s infinite"></div>' +
      '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + ' to finish...</div>' +
    '</div>';

  setTimeout(() => {
    if (!MP.opponentFinished) {
      MP.opponentFinished   = true;
      MP.opponentFinalScore = score2;
      showFinalResults();
    }
  }, 30000);
}

function showFinalResults() {
  const overlay = document.getElementById('waiting-for-opponent');
  if (overlay) overlay.style.display = 'none';

  if (MP.opponentFinalScore !== null) {
    score2 = MP.opponentFinalScore;
  }

  showResults();

  setTimeout(() => cleanupConnection(), 5000);
}

/* ════════════════════════════════════════
   GAME LAUNCH
════════════════════════════════════════ */

function startBothPlayers(opponentName, seed) {
  if (MP.gameStarted) return;
  MP.gameStarted  = true;
  MP.questionSeed = seed;

  showMultiStatus((opponentName || 'OPPONENT') + ' joined! Starting in 3...');

  publishToChannel('game_confirmed', {
    seed,
    player1Name: MP.myName,
  });

  let count = 3;
  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      showMultiStatus('Starting in ' + count + '...');
    } else {
      clearInterval(iv);
      launchGame();
    }
  }, 1000);
}

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
   OVERRIDE joinOrCreate FROM game.js
════════════════════════════════════════ */

window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input').value.trim() || 'MINER').toUpperCase();
  const codeInput  = document.getElementById('room-input').value.trim().toUpperCase();

  showMultiStatus('Initialising...');
  showPage('waiting');

  if (codeInput) {
    /* ── PLAYER 2 — JOINING ── */
    MP.myPlayerId = 2;
    MP.myName     = playerName;
    MP.roomId     = codeInput;

    document.getElementById('room-display').textContent = codeInput;
    showMultiStatus('Looking up room ' + codeInput + '...');

    const room = await lookupRoomInDB(codeInput);
    if (room) {
      MP.questionSeed = room.question_seed;
      MP.opponentName = room.player1_name;
      const db = getSupabase();
      if (db) {
        await db.from('rooms')
          .update({ player2_name: playerName, status: 'active' })
          .eq('id', codeInput);
      }
    } else {
      MP.questionSeed = Math.floor(Math.random() * 1000000);
    }

    connectToRoom(codeInput, handleMessage);

  } else {
    /* ── PLAYER 1 — CREATING ── */
    const result = await createRoomInDB(playerName);

    document.getElementById('room-display').textContent = result.roomId;
    showMultiStatus('Room ready. Share this code. Waiting for opponent...');

    connectToRoom(result.roomId, handleMessage);
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
   PATCH game.js FUNCTIONS
════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {

  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi' && MP.isConnected) {
        publishToChannel('answer', {
          new_score:   score1,
          correct,
          streak:      streak1,
          player_name: myName,
        });
      }
    };
  }

  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi' && MP.isConnected) {
        publishToChannel('answer', {
          new_score:   score1,
          correct:     origIndex === q.bluff,
          streak:      streak1,
          player_name: myName,
        });
      }
    };
  }

  const _castODVote = window.castODVote;
  if (_castODVote) {
    window.castODVote = function(vote) {
      _castODVote(vote);
      if (mode === 'multi' && MP.isConnected) {
        publishToChannel('od_vote', { vote });
      }
    };
  }

  const _showResults = window.showResults;
  if (_showResults) {
    window.showResults = function() {
      if (mode === 'multi' && MP.isConnected) {
        notifyIFinished();
      } else {
        _showResults();
      }
    };
    window._originalShowResults = _showResults;
  }

  window.showFinalResults = function() {
    const overlay = document.getElementById('waiting-for-opponent');
    if (overlay) overlay.style.display = 'none';

    if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;

    if (window._originalShowResults) {
      window._originalShowResults();
    }

    setTimeout(() => cleanupConnection(), 5000);
  };

});

/* ════════════════════════════════════════
   CLEANUP
════════════════════════════════════════ */

function cleanupConnection() {
  if (MP.channel) {
    publishToChannel('disconnect', {});
    const db = getSupabase();
    if (db) db.removeChannel(MP.channel);
    MP.channel = null;
  }
  if (MP.roomId) {
    const db = getSupabase();
    if (db) db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
  }
  MP.isConnected       = false;
  MP.gameStarted       = false;
  MP.iFinished         = false;
  MP.opponentFinished  = false;
  MP.myFinalScore      = null;
  MP.opponentFinalScore = null;
}

window.addEventListener('beforeunload', () => {
  if (MP.isConnected) cleanupConnection();
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

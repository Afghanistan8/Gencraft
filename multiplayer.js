/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v3 — Polling)

   Uses DB polling for join detection instead
   of Broadcast/Realtime which proved unreliable.
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';


/* ════════════════════════════════════════
   SUPABASE CLIENT
════════════════════════════════════════ */

function getSupabase() {
  if (!window._supabaseClient) {
    if (!window.supabase) {
      showMultiError('Connection failed. Please refresh the page.');
      return null;
    }
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return window._supabaseClient;
}


/* ════════════════════════════════════════
   MULTIPLAYER STATE
════════════════════════════════════════ */

const MP = {
  roomId:        null,
  myPlayerId:    null,
  myName:        null,
  opponentName:  null,
  questionSeed:  null,
  isConnected:   false,
  gameStarted:   false,
  pollTimer:     null,
};


/* ════════════════════════════════════════
   SEEDED RANDOM
════════════════════════════════════════ */

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function seededShuffle(array, seed) {
  const rand   = seededRandom(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQuestionsFromSeed(seed) {
  const base   = seededShuffle([...QUESTIONS], seed).slice(0, 16);
  const bluffs = seededShuffle([...BLUFFS], seed + 1).slice(0, 4);
  const result = [];
  let bi = 0;
  for (let i = 0; i < base.length; i++) {
    result.push(base[i]);
    if ((i + 1) % 4 === 0 && bi < bluffs.length) result.push(bluffs[bi++]);
  }
  return result.slice(0, 20);
}


/* ════════════════════════════════════════
   ROOM DATABASE OPERATIONS
════════════════════════════════════════ */

async function createRoomInDB(playerName) {
  const db = getSupabase();
  if (!db) return null;

  const roomId       = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const questionSeed = Math.floor(Math.random() * 1000000);

  const { error } = await db
    .from('rooms')
    .insert({
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: questionSeed,
    });

  if (error) {
    showMultiError('Could not create room: ' + error.message);
    return null;
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 1;
  MP.myName       = playerName;
  MP.questionSeed = questionSeed;

  return { roomId, questionSeed };
}

async function joinRoomInDB(roomId, playerName) {
  const db = getSupabase();
  if (!db) return { success: false, message: 'Not connected' };

  const { data: room, error: fetchError } = await db
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (fetchError || !room) {
    return { success: false, message: 'Room "' + roomId + '" not found. Check the code.' };
  }
  if (room.status === 'active') {
    return { success: false, message: 'Room is already full.' };
  }
  if (room.status === 'finished') {
    return { success: false, message: 'That game already finished.' };
  }

  const { error: updateError } = await db
    .from('rooms')
    .update({ player2_name: playerName, status: 'active' })
    .eq('id', roomId);

  if (updateError) {
    return { success: false, message: 'Could not join: ' + updateError.message };
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 2;
  MP.myName       = playerName;
  MP.opponentName = room.player1_name;
  MP.questionSeed = room.question_seed;

  return { success: true, questionSeed: room.question_seed, player1Name: room.player1_name };
}


/* ════════════════════════════════════════
   POLLING — THE RELIABLE JOIN DETECTION
   ─────────────────────────────────────
   Player 1 polls the rooms table every 2s
   checking if status changed to 'active'.
   This is simple, works on every Supabase
   plan, requires zero realtime config, and
   never silently fails.
════════════════════════════════════════ */

function startPollingForOpponent(roomId) {
  if (MP.pollTimer) clearInterval(MP.pollTimer);

  MP.pollTimer = setInterval(async () => {
    const db = getSupabase();
    if (!db) return;

    const { data: room, error } = await db
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error || !room) return;

    if (room.status === 'active' && room.player2_name) {
      clearInterval(MP.pollTimer);
      MP.pollTimer = null;

      MP.opponentName = room.player2_name;
      MP.isConnected  = true;

      startCountdown(room.player2_name, room.question_seed);
    }
  }, 2000);
}

function stopPolling() {
  if (MP.pollTimer) {
    clearInterval(MP.pollTimer);
    MP.pollTimer = null;
  }
}


/* ════════════════════════════════════════
   COUNTDOWN + GAME LAUNCH
════════════════════════════════════════ */

function startCountdown(opponentName, seed) {
  if (MP.gameStarted) return;
  MP.gameStarted  = true;
  MP.questionSeed = seed;

  showMultiStatus((opponentName || 'Opponent') + ' joined! Starting in 3...');

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

  const p2name = document.getElementById('p2name');
  if (p2name) p2name.textContent = MP.opponentName || 'OPPONENT';

  showPage('game');
  startGame();
}


/* ════════════════════════════════════════
   OVERRIDE joinOrCreate FROM game.js
════════════════════════════════════════ */

window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input').value.trim() || 'MINER').toUpperCase();
  const codeInput  = document.getElementById('room-input').value.trim().toUpperCase();

  showMultiStatus('Connecting...');
  showPage('waiting');

  if (codeInput) {

    /* ════ PLAYER 2 — JOINING ════ */
    showMultiStatus('Looking for room ' + codeInput + '...');

    const result = await joinRoomInDB(codeInput, playerName);

    if (!result.success) {
      showMultiError(result.message);
      return;
    }

    document.getElementById('room-display').textContent = codeInput;
    showMultiStatus('Joined! Starting game...');
    MP.isConnected = true;

    // Player 2 starts immediately — Player 1 will detect via poll
    setTimeout(() => {
      startCountdown(result.player1Name, result.questionSeed);
    }, 1000);

  } else {

    /* ════ PLAYER 1 — CREATING ════ */
    showMultiStatus('Creating room...');

    const result = await createRoomInDB(playerName);

    if (!result) return;

    document.getElementById('room-display').textContent = result.roomId;
    showMultiStatus('Share this code with your opponent. Waiting for them to join...');

    // Start polling every 2 seconds to detect Player 2
    startPollingForOpponent(result.roomId);
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
    };
  }

  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
    };
  }

  const _castODVote = window.castODVote;
  if (_castODVote) {
    window.castODVote = function(vote) {
      _castODVote(vote);
    };
  }

  const _showResults = window.showResults;
  if (_showResults) {
    window.showResults = function() {
      _showResults();
      if (mode === 'multi' && MP.roomId) {
        const db = getSupabase();
        if (db) {
          db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
        }
      }
    };
  }

});


/* ════════════════════════════════════════
   CLEANUP
════════════════════════════════════════ */

window.addEventListener('beforeunload', () => {
  stopPolling();
  if (MP.roomId) {
    const db = getSupabase();
    if (db) {
      db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
    }
  }
});


/* ════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════ */

function showMultiStatus(message) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = message; el.style.color = ''; }
}

function showMultiError(message) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = '⚠ ' + message; el.style.color = 'var(--rs)'; }
}

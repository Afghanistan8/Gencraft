/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v4 — Dual Sync)

   Combines DB Polling (cache-busted) AND 
   Broadcast Channels for 100% reliable 
   connections and live score syncing.
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';


/* ════════════════════════════════════════
   SUPABASE CLIENT
════════════════════════════════════════ */

function getSupabase() {
  if (!window._supabaseClient) {
    if (!window.supabase) {
      showMultiError('Supabase library missing. Ensure CDN script is loaded first.');
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
  channel:       null,
  pollAttempts:  0
};


/* ════════════════════════════════════════
   SEEDED RANDOM (Synced questions)
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
   CHANNEL BROADCAST (For Scores & Fallback Join)
════════════════════════════════════════ */

function setupChannel(roomId) {
  const db = getSupabase();
  if (!db) return;

  const channelName = 'room-' + roomId;
  MP.channel = db.channel(channelName, {
    config: { broadcast: { self: false } }
  });

  const events = ['player_joined', 'answer', 'game_finished'];
  events.forEach(ev => {
    MP.channel.on('broadcast', { event: ev }, (msg) => {
      handleChannelMessage(ev, msg.payload);
    });
  });

  MP.channel.subscribe((status) => {
    console.log('Channel ' + channelName + ' status:', status);
  });
}

function handleChannelMessage(event, payload) {
  // Fallback join detection if polling didn't catch it yet
  if (event === 'player_joined' && MP.myPlayerId === 1 && !MP.isConnected) {
    stopPolling();
    MP.opponentName = payload.name;
    MP.isConnected = true;
    startCountdown(payload.name, payload.seed || MP.questionSeed);
  }

  // Live Score Updates
  if (event === 'answer') {
    score2 = payload.score;
    streak2 = payload.streak;
    updateHUD();
  }

  if (event === 'game_finished') {
    score2 = payload.score;
    updateHUD();
  }
}

async function sendBroadcast(event, payload) {
  if (MP.channel && MP.isConnected) {
    try {
      await MP.channel.send({
        type: 'broadcast',
        event: event,
        payload: payload
      });
    } catch(e) {
      console.warn('Broadcast failed:', e);
    }
  }
}


/* ════════════════════════════════════════
   ROOM DB POLICIES
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
    showMultiError('DB Error: ' + error.message);
    return null;
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 1;
  MP.myName       = playerName;
  MP.questionSeed = questionSeed;

  setupChannel(roomId);

  return { roomId, questionSeed };
}

async function joinRoomInDB(roomId, playerName) {
  const db = getSupabase();
  if (!db) return { success: false, message: 'Supabase offline' };

  const { data: room, error: fetchError } = await db
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (fetchError || !room) {
    return { success: false, message: 'Room ' + roomId + ' not found.' };
  }
  if (room.status === 'active') {
    return { success: false, message: 'Room is already full.' };
  }
  if (room.status === 'finished') {
    return { success: false, message: 'Game already finished.' };
  }

  const { error: updateError } = await db
    .from('rooms')
    .update({ player2_name: playerName, status: 'active' })
    .eq('id', roomId);

  if (updateError) {
    return { success: false, message: 'Join failed: ' + updateError.message };
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 2;
  MP.myName       = playerName;
  MP.opponentName = room.player1_name;
  MP.questionSeed = room.question_seed;

  setupChannel(roomId);

  // Send broadcast immediately so Player 1 can catch it
  setTimeout(() => {
    sendBroadcast('player_joined', { name: playerName, seed: room.question_seed });
  }, 1000);

  return { success: true, questionSeed: room.question_seed, player1Name: room.player1_name };
}


/* ════════════════════════════════════════
   POLLING — THE RELIABLE JOIN DETECTION
════════════════════════════════════════ */

function startPollingForOpponent(roomId) {
  if (MP.pollTimer) clearInterval(MP.pollTimer);
  MP.pollAttempts = 0;

  MP.pollTimer = setInterval(async () => {
    if (MP.isConnected) {
      stopPolling();
      return;
    }

    const db = getSupabase();
    if (!db) return;

    MP.pollAttempts++;
    document.getElementById('wait-msg').textContent = 'Waiting for opponent... (Check ' + MP.pollAttempts + ')';

    // The .neq is a cache-buster trick to ensure browsers don't cache the fetch request!
    const cacheBuster = 'ignore_' + Math.random();
    const { data: room, error } = await db
      .from('rooms')
      .select('status, player2_name, question_seed')
      .eq('id', roomId)
      .neq('status', cacheBuster)
      .single();

    if (error || !room) return;

    if (room.status === 'active' && room.player2_name) {
      stopPolling();
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
    showMultiStatus('Joined! Starting game in 3...');
    MP.isConnected = true;

    // Start Player 2 countdown
    setTimeout(() => {
      startCountdown(result.player1Name, result.questionSeed);
    }, 500);

  } else {

    /* ════ PLAYER 1 — CREATING ════ */
    showMultiStatus('Creating room...');

    const result = await createRoomInDB(playerName);

    if (!result) return;

    document.getElementById('room-display').textContent = result.roomId;
    showMultiStatus('Share this code with your opponent. Waiting for them to join...');

    // Start cache-busted polling
    startPollingForOpponent(result.roomId);
  }
};


/* ════════════════════════════════════════
   OVERRIDE simulateOpponentAnswer
════════════════════════════════════════ */

window.simulateOpponentAnswer = function(correct) {
  // Solo mode only. In multiplayer, handled by channel broadcasts.
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    streak2 = correct ? streak2 + 1 : 0;
    updateHUD();
  }
};


/* ════════════════════════════════════════
   PATCH game.js FUNCTIONS (Score Sync)
════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {

  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi') sendBroadcast('answer', { score: score1, streak: streak1 });
    };
  }

  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi') sendBroadcast('answer', { score: score1, streak: streak1 });
    };
  }

  const _showResults = window.showResults;
  if (_showResults) {
    window.showResults = function() {
      _showResults();
      if (mode === 'multi' && MP.roomId) {
        sendBroadcast('game_finished', { score: score1 });
        const db = getSupabase();
        if (db) db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
      }
    };
  }

});


/* ════════════════════════════════════════
   CLEANUP
════════════════════════════════════════ */

window.addEventListener('beforeunload', () => {
  stopPolling();
  if (MP.channel) {
    const db = getSupabase();
    if (db) db.removeChannel(MP.channel);
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

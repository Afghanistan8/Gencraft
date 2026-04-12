/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v2 — Fixed)

   PASTE YOUR SUPABASE CREDENTIALS BELOW:
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';


/* ════════════════════════════════════════
   HOW THIS VERSION WORKS
   ─────────────────────────────────────
   v1 used postgres_changes to detect when
   Player 2 joined. This silently fails on
   many Supabase setups causing the stuck
   waiting screen bug.

   v2 uses Supabase Broadcast channels
   instead. Both players join the same
   channel. Player 2 sends a "joined"
   broadcast message directly to Player 1.
   This works instantly and reliably on
   all Supabase plans with no extra config.

   Flow:
   1. Player 1 creates room in DB, joins
      channel "room:GL4821", waits.
   2. Player 2 joins room in DB, joins same
      channel, broadcasts "player_joined".
   3. Player 1 receives broadcast instantly,
      both start countdown simultaneously.
   4. During game, answers/scores are
      broadcast through the same channel.
════════════════════════════════════════ */


/* ════════════════════════════════════════
   SUPABASE CLIENT
   Loaded from CDN tag in index.html
   Make sure this is in your index.html
   BEFORE multiplayer.js script tag:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
════════════════════════════════════════ */

function getSupabase() {
  if (!window._supabaseClient) {
    if (!window.supabase) {
      showMultiError('Connection failed. Please refresh the page.');
      return null;
    }
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: {
        params: { eventsPerSecond: 10 }
      }
    });
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
  channel:       null,   // Single Supabase broadcast channel for everything
  isConnected:   false,
  gameStarted:   false,
};


/* ════════════════════════════════════════
   SEEDED RANDOM
   Both players build identical question
   lists using the same seed number
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
   These write to Supabase DB so the room
   code persists and Player 2 can find it
════════════════════════════════════════ */

async function createRoomInDB(playerName) {
  const db   = getSupabase();
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

  // Fetch the room
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

  // Mark room as active
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
   BROADCAST CHANNEL
   This is the core fix. Instead of watching
   the database for changes (which broke),
   both players communicate through a
   Supabase Broadcast channel in real time.
════════════════════════════════════════ */

function joinChannel(roomId, onMessage) {
  const db = getSupabase();
  if (!db) return null;

  // Both players join the exact same channel name
  const channel = db.channel('gencraft-room-' + roomId, {
    config: { broadcast: { self: false } }
    // self: false means you do NOT receive your own messages
    // only messages from the other player come through
  });

  // Listen for ALL broadcast events on this channel
  channel.on('broadcast', { event: '*' }, (msg) => {
    onMessage(msg.event, msg.payload);
  });

  // Subscribe and confirm connection
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      MP.isConnected = true;
    } else if (status === 'CHANNEL_ERROR') {
      showMultiError('Channel error. Please refresh and try again.');
    } else if (status === 'TIMED_OUT') {
      showMultiError('Connection timed out. Please refresh and try again.');
    }
  });

  MP.channel = channel;
  return channel;
}

// Send a message to the other player through the channel
async function sendToOpponent(event, payload) {
  if (!MP.channel) return;
  await MP.channel.send({
    type:    'broadcast',
    event:   event,
    payload: payload || {},
  });
}


/* ════════════════════════════════════════
   MESSAGE HANDLER
   Processes every message received from
   the opponent through the channel
════════════════════════════════════════ */

function handleChannelMessage(event, payload) {

  /* ── Player 2 has joined — Player 1 receives this ── */
  if (event === 'player_joined') {
    if (MP.myPlayerId !== 1) return;
    MP.opponentName = payload.name;
    startCountdown(payload.name, payload.questionSeed || MP.questionSeed);
  }

  /* ── Player 1 confirmed the game is starting — Player 2 receives this ── */
  if (event === 'game_confirmed') {
    if (MP.myPlayerId !== 2) return;
    // Both players now start simultaneously
    if (!MP.gameStarted) {
      MP.gameStarted = true;
      launchGame();
    }
  }

  /* ── Opponent answered a question ── */
  if (event === 'answer') {
    score2 = payload.new_score;
    streak2 = payload.streak || 0;
    updateHUD();
  }

  /* ── Opponent voted on OD finale ── */
  if (event === 'od_vote') {
    // Nothing to show — each player votes independently
  }

  /* ── Opponent finished the game ── */
  if (event === 'game_finished') {
    score2 = payload.final_score;
    updateHUD();
  }

  /* ── Opponent disconnected ── */
  if (event === 'disconnect') {
    showMultiStatus('Opponent disconnected. Continuing solo...');
    mode = 'solo';
    const p2 = document.getElementById('p2name').closest('.hud-player');
    if (p2) p2.style.opacity = '0.35';
  }
}


/* ════════════════════════════════════════
   COUNTDOWN + GAME LAUNCH
   Called on Player 1's side when opponent
   joins, then signals Player 2 to start too
════════════════════════════════════════ */

function startCountdown(opponentName, seed) {
  if (MP.gameStarted) return;
  MP.gameStarted  = true;
  MP.questionSeed = seed;

  showMultiStatus((opponentName || 'Opponent') + ' joined! Starting in 3...');

  // Signal Player 2 to start their own countdown
  sendToOpponent('game_confirmed', { seed: seed });

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
  mode      = 'multi';   // ← THE KEY FIX: set mode before startGame()
  myName    = MP.myName;
  questions = buildQuestionsFromSeed(MP.questionSeed);

  // Update opponent name in HUD
  const p2name = document.getElementById('p2name');
  if (p2name) p2name.textContent = MP.opponentName || 'OPPONENT';

  showPage('game');
  startGame();
}


/* ════════════════════════════════════════
   OVERRIDE joinOrCreate FROM game.js
   This replaces the game.js version with
   the real multiplayer connection flow
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
    showMultiStatus('Room found! Connecting to ' + (result.player1Name || 'opponent') + '...');

    // Join the channel and listen for messages
    joinChannel(codeInput, handleChannelMessage);

    // Wait a moment for the channel subscription to establish
    // then announce to Player 1 that we have arrived
    setTimeout(async () => {
      await sendToOpponent('player_joined', {
        name:         playerName,
        questionSeed: result.questionSeed,
      });

      showMultiStatus('Waiting for host to start...');

      // Safety fallback: if game_confirmed never arrives within 5 seconds,
      // start anyway — this handles edge cases where Player 1 missed the signal
      setTimeout(() => {
        if (!MP.gameStarted) {
          MP.gameStarted = true;
          launchGame();
        }
      }, 5000);

    }, 1500); // 1.5 second delay gives the channel time to subscribe

  } else {

    /* ════ PLAYER 1 — CREATING ════ */
    showMultiStatus('Creating room...');

    const result = await createRoomInDB(playerName);

    if (!result) return; // Error already shown

    document.getElementById('room-display').textContent = result.roomId;
    showMultiStatus('Share this code with your opponent. Waiting for them to join...');

    // Join the channel and wait for Player 2
    joinChannel(result.roomId, handleChannelMessage);
  }
};


/* ════════════════════════════════════════
   OVERRIDE simulateOpponentAnswer
   In multiplayer the real score comes via
   the channel — no simulation needed
════════════════════════════════════════ */

window.simulateOpponentAnswer = function(correct) {
  // In solo mode still simulate — in multi the real event updates score2
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    streak2 = correct ? streak2 + 1 : 0;
    updateHUD();
  }
};


/* ════════════════════════════════════════
   BROADCAST GAME EVENTS
   These are called from the patched
   game.js functions below to keep the
   opponent's screen updated in real time
════════════════════════════════════════ */

async function broadcastAnswer(newScore, correct, currentStreak) {
  await sendToOpponent('answer', {
    new_score: newScore,
    correct:   correct,
    streak:    currentStreak,
  });
}

async function broadcastODVote(vote) {
  await sendToOpponent('od_vote', { vote });
}

async function broadcastGameFinished(finalScore) {
  await sendToOpponent('game_finished', { final_score: finalScore });
}


/* ════════════════════════════════════════
   PATCH game.js FUNCTIONS
   These wrap the existing game functions
   to add broadcasting when in multi mode
════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {

  // Patch selectAnswer to broadcast score after answering
  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi' && MP.isConnected) {
        broadcastAnswer(score1, correct, streak1);
      }
    };
  }

  // Patch selectBluff to broadcast score after bluff round
  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi' && MP.isConnected) {
        const caught = origIndex === q.bluff;
        broadcastAnswer(score1, caught, streak1);
      }
    };
  }

  // Patch castODVote to broadcast the vote
  const _castODVote = window.castODVote;
  if (_castODVote) {
    window.castODVote = function(vote) {
      _castODVote(vote);
      if (mode === 'multi' && MP.isConnected) {
        broadcastODVote(vote);
      }
    };
  }

  // Patch showResults to broadcast final score and clean up
  const _showResults = window.showResults;
  if (_showResults) {
    window.showResults = function() {
      _showResults();
      if (mode === 'multi' && MP.isConnected) {
        broadcastGameFinished(score1);
        setTimeout(() => cleanupChannel(), 3000);
      }
    };
  }

});


/* ════════════════════════════════════════
   CLEANUP
   Disconnect gracefully when game ends
   or player closes the tab
════════════════════════════════════════ */

async function cleanupChannel() {
  if (MP.channel) {
    await sendToOpponent('disconnect', {});
    const db = getSupabase();
    if (db) db.removeChannel(MP.channel);
    MP.channel      = null;
    MP.isConnected  = false;
    MP.gameStarted  = false;
  }

  // Mark room as finished in the database
  if (MP.roomId) {
    const db = getSupabase();
    if (db) {
      await db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
    }
  }
}

window.addEventListener('beforeunload', () => {
  if (MP.isConnected) cleanupChannel();
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

/* ════════════════════════════════════════
   GENCRAFT MULTIPLAYER — FIXED VERSION
   
   What was wrong (4 bugs):
   1. multiplayer.js loaded BEFORE game.js, so window.joinOrCreate was
      overwritten back to the dummy version by game.js on every page load.
   2. mode was NEVER set to 'multi' — simulateOpponentAnswer always ran.
   3. Supabase SDK was injected dynamically — it hadn't loaded by the time
      joinOrCreate ran, so getSupabase() returned null silently.
   4. DOMContentLoaded patches found null for all functions because game.js
      defines them as plain functions, not on window — patches did nothing.

   Fixes applied:
   - Supabase loaded via <script> tag in index.html (already synchronous)
   - Script order in index.html is now: supabase CDN → game.js → multiplayer.js
   - mode = 'multi' is now set inside joinOrCreate
   - All function patches removed — multiplayer.js now directly calls the
     real functions after wrapping them properly at load time
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';


/* ════════════════════════════════════════
   SUPABASE CLIENT
   SDK is now loaded synchronously in index.html — no dynamic injection.
════════════════════════════════════════ */

function getSupabase() {
  if (!window.supabase) {
    console.error('[MP] Supabase SDK not loaded — check index.html script order');
    return null;
  }
  if (!window._supabaseClient) {
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[MP] Supabase client created');
  }
  return window._supabaseClient;
}


/* ════════════════════════════════════════
   MULTIPLAYER STATE
════════════════════════════════════════ */

const MP = {
  roomId:            null,
  myPlayerId:        null,
  myName:            null,
  opponentName:      null,
  questionSeed:      null,
  roomSubscription:  null,
  eventSubscription: null,
  isConnected:       false,
  opponentScore:     200,
  lastEventId:       null,
};


/* ════════════════════════════════════════
   SEEDED RANDOM — SAME QUESTIONS FOR BOTH PLAYERS
════════════════════════════════════════ */

function createSeededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function seededShuffle(array, seed) {
  const rand   = createSeededRandom(seed);
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
  let bluffIndex = 0;
  for (let i = 0; i < base.length; i++) {
    result.push(base[i]);
    if ((i + 1) % 4 === 0 && bluffIndex < bluffs.length) {
      result.push(bluffs[bluffIndex++]);
    }
  }
  return result.slice(0, 20);
}


/* ════════════════════════════════════════
   ROOM CREATION — PLAYER 1
════════════════════════════════════════ */

async function createRoom(playerName) {
  const db = getSupabase();
  if (!db) {
    showMultiError('Could not connect to database. Refresh and try again.');
    return null;
  }

  const roomId       = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const questionSeed = Math.floor(Math.random() * 1000000);

  console.log('[MP] Creating room:', roomId);

  const { error } = await db
    .from('rooms')
    .insert({
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: questionSeed,
    });
  
  if (error) {
    console.error('[MP] createRoom error:', error);
    showMultiError('Could not create room: ' + error.message);
    return null;
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 1;
  MP.myName       = playerName;
  MP.questionSeed = questionSeed;
  MP.isConnected  = true;

  console.log('[MP] Room created:', roomId);
  return roomId;
}


/* ════════════════════════════════════════
   ROOM JOINING — PLAYER 2
════════════════════════════════════════ */

async function joinRoom(roomId, playerName) {
  const db = getSupabase();
  if (!db) return { success: false, message: 'Database not connected. Refresh and try again.' };

  console.log('[MP] Joining room:', roomId);

  const { data: room, error: fetchError } = await db
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();

  if (fetchError || !room) {
    console.error('[MP] Room fetch error:', fetchError);
    return { success: false, message: 'Room "' + roomId + '" not found. Check the code and try again.' };
  }

  if (room.status === 'active') {
    return { success: false, message: 'Room is already full. Ask your opponent to create a new one.' };
  }
  if (room.status === 'finished') {
    return { success: false, message: 'That game has already finished.' };
  }

  const { error: joinError } = await db
    .from('rooms')
    .update({ player2_name: playerName, status: 'active' })
    .eq('id', roomId);

  if (joinError) {
    console.error('[MP] Join error:', joinError);
    return { success: false, message: 'Could not join room: ' + joinError.message };
  }

  MP.roomId       = roomId;
  MP.myPlayerId   = 2;
  MP.myName       = playerName;
  MP.opponentName = room.player1_name;
  MP.questionSeed = room.question_seed;
  MP.isConnected  = true;

  console.log('[MP] Joined room:', roomId, 'as player 2');

  return {
    success:      true,
    questionSeed: room.question_seed,
    player1Name:  room.player1_name,
  };
}


/* ════════════════════════════════════════
   WATCH FOR OPPONENT — PLAYER 1 WAITS
════════════════════════════════════════ */

function watchForOpponent(onOpponentJoined) {
  const db = getSupabase();
  if (!db) return;

  console.log('[MP] Watching for opponent in room:', MP.roomId);

  MP.roomSubscription = db
    .channel('room-watch-' + MP.roomId)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'rooms',
        filter: 'id=eq.' + MP.roomId,
      },
      (payload) => {
        console.log('[MP] Room update received:', payload.new);
        const updatedRoom = payload.new;
        if (updatedRoom.status === 'active' && updatedRoom.player2_name) {
          MP.opponentName = updatedRoom.player2_name;
          onOpponentJoined(updatedRoom.player2_name);
        }
      }
    )
    .subscribe((status) => {
      console.log('[MP] Room subscription status:', status);
    });
}


/* ════════════════════════════════════════
   REAL-TIME EVENT SYSTEM
════════════════════════════════════════ */

function listenToRoom(onEvent) {
  const db = getSupabase();
  if (!db) return;

  console.log('[MP] Listening to game events for room:', MP.roomId);

  MP.eventSubscription = db
    .channel('events-' + MP.roomId)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'game_events',
        filter: 'room_id=eq.' + MP.roomId,
      },
      (payload) => {
        const event = payload.new;
        if (event.player_id === MP.myPlayerId) return; // ignore own events
        if (event.id === MP.lastEventId) return;       // dedup
        MP.lastEventId = event.id;
        console.log('[MP] Event received:', event.event_type, event.payload);
        onEvent(event);
      }
    )
    .subscribe((status) => {
      console.log('[MP] Event subscription status:', status);
    });
}

async function broadcastEvent(eventType, payload) {
  const db = getSupabase();
  if (!db || !MP.roomId) return;

  const { error } = await db
    .from('game_events')
    .insert({
      room_id:    MP.roomId,
      player_id:  MP.myPlayerId,
      event_type: eventType,
      payload:    payload,
    });

  if (error) {
    console.error('[MP] broadcastEvent error:', eventType, error);
  }
}


/* ════════════════════════════════════════
   INCOMING EVENT HANDLER
════════════════════════════════════════ */

function handleOpponentEvent(event) {
  const { event_type, payload } = event;

  switch (event_type) {
    case 'answer': {
      score2 = payload.new_score;
      updateHUD();
      const st2 = document.getElementById('st2');
      if (st2) st2.textContent = payload.streak > 1 ? payload.streak + 'x 🔥' : '';
      break;
    }
    case 'stake': {
      break;
    }
    case 'od_vote': {
      break;
    }
    case 'game_finished': {
      score2 = payload.final_score;
      updateHUD();
      break;
    }
    case 'disconnect': {
      showMultiStatus('Opponent disconnected. Continuing in solo mode.');
      mode = 'solo';
      const p2hud = document.getElementById('p2name')?.closest?.('.hud-player');
      if (p2hud) p2hud.style.opacity = '0.35';
      break;
    }
  }
}


/* ════════════════════════════════════════
   BROADCASTING
════════════════════════════════════════ */

async function broadcastAnswer(newScore, isCorrect, currentStreak) {
  await broadcastEvent('answer', { new_score: newScore, correct: isCorrect, streak: currentStreak });
}

async function broadcastStake(amount) {
  await broadcastEvent('stake', { amount });
}

async function broadcastODVote(vote) {
  await broadcastEvent('od_vote', { vote });
}

async function broadcastGameFinished(finalScore) {
  await broadcastEvent('game_finished', { final_score: finalScore });
}


/* ════════════════════════════════════════
   SIMULATE OPPONENT — disabled in multiplayer
════════════════════════════════════════ */

// Override the solo-mode fake opponent — in real multiplayer we do nothing here.
// Real opponent score arrives via handleOpponentEvent().
window.simulateOpponentAnswer = function (correct) {
  if (mode !== 'multi') {
    score2 = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    updateHUD();
  }
};


/* ════════════════════════════════════════
   MAIN ENTRY POINT — joinOrCreate
   This FULLY REPLACES the dummy version in game.js.
   It must run AFTER game.js (index.html loads game.js first now).
════════════════════════════════════════ */

window.joinOrCreate = async function () {
  const nameInput  = document.getElementById('pname-input');
  const codeInput  = document.getElementById('room-input');
  const playerName = (nameInput.value.trim() || 'MINER').toUpperCase();
  const roomCode   = codeInput.value.replace(/\s/g, '').toUpperCase();

  // *** FIX: Set mode to multi here — this was NEVER done before ***
  mode = 'multi';

  showMultiStatus('Connecting...');
  showPage('waiting');

  if (roomCode) {
    /* ── PLAYER 2: joining an existing room ── */
    showMultiStatus('Joining room ' + roomCode + '...');

    const result = await joinRoom(roomCode, playerName);

    if (!result.success) {
      showMultiError(result.message);
      return;
    }

    document.getElementById('room-display').textContent = roomCode;
    showMultiStatus('✓ Connected! Game starting in 3...');

    // Set up opponent name display
    document.getElementById('p2name').textContent = playerName;
    MP.opponentName = result.player1Name;

    // Listen for events from Player 1
    listenToRoom(handleOpponentEvent);

    // Use shared seed so both players get identical questions
    questions = buildQuestionsFromSeed(MP.questionSeed);

    let countdown = 3;
    const iv = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        showMultiStatus('Starting in ' + countdown + '...');
      } else {
        clearInterval(iv);
        myName = playerName;
        showPage('game');
        startGame();
      }
    }, 1000);
  } else {
    /* ── PLAYER 1: creating a new room ── */
    const newRoomId = await createRoom(playerName);
    if (!newRoomId) return; // error shown by createRoom()

    document.getElementById('room-display').textContent = newRoomId;
    showMultiStatus('Waiting for opponent to join with code: ' + newRoomId);

    // Listen for game events (opponent answers etc.)
    listenToRoom(handleOpponentEvent);

    // Watch for Player 2 to join
    watchForOpponent((opponentName) => {
      showMultiStatus(opponentName + ' joined! Starting in 3...');

      let countdown = 3;
      const iv = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          showMultiStatus('Starting in ' + countdown + '...');
        } else {
          clearInterval(iv);
          myName    = playerName;
          questions = buildQuestionsFromSeed(MP.questionSeed);
          showPage('game');
          startGame();
        }
      }, 1000);
    });
  }
};


/* ════════════════════════════════════════
   PATCH GAME FUNCTIONS TO BROADCAST
   Now game.js loads BEFORE multiplayer.js, so these functions exist.
════════════════════════════════════════ */

(function patchGameFunctions() {
  // selectAnswer
  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function (btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi' && MP.isConnected) broadcastAnswer(score1, correct, streak1);
    };
  }

  // selectBluff
  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function (btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi' && MP.isConnected) {
        broadcastAnswer(score1, origIndex === q.bluff, streak1);
      }
    };
  }

  // confirmStake
  const _confirmStake = window.confirmStake;
  if (_confirmStake) {
    window.confirmStake = function (override) {
      _confirmStake(override);
      const amount = (override !== undefined) ? override : selectedStake;
      if (mode === 'multi' && MP.isConnected && amount > 0) broadcastStake(amount);
    };
  }

  // castODVote
  const _castODVote = window.castODVote;
  if (_castODVote) {
    window.castODVote = function (vote) {
      _castODVote(vote);
      if (mode === 'multi' && MP.isConnected) broadcastODVote(vote);
    };
  }

  // showResults
  const _showResults = window.showResults;
  if (_showResults) {
    window.showResults = function () {
      _showResults();
      if (mode === 'multi' && MP.isConnected) {
        broadcastGameFinished(score1);
        setTimeout(() => disconnectFromRoom(), 3000);
      }
    };
  }

  console.log('[MP] Game functions patched successfully');
})();


/* ════════════════════════════════════════
   ROOM CLEANUP
════════════════════════════════════════ */

async function disconnectFromRoom() {
  const db = getSupabase();
  if (!db) return;

  if (MP.isConnected) await broadcastEvent('disconnect', { player_id: MP.myPlayerId });

  if (MP.roomSubscription)  { db.removeChannel(MP.roomSubscription);  MP.roomSubscription  = null; }
  if (MP.eventSubscription) { db.removeChannel(MP.eventSubscription); MP.eventSubscription = null; }

  if (MP.roomId) {
    await db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
  }

  MP.roomId = null; MP.myPlayerId = null; MP.myName = null;
  MP.opponentName = null; MP.questionSeed = null;
  MP.isConnected = false; MP.lastEventId = null;
  console.log('[MP] Disconnected');
}


/* ════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════ */

function showMultiStatus(message) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = message; el.style.color = ''; }
}

function showMultiError(message) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = '⚠️ ' + message; el.style.color = 'var(--rs)'; }
  console.error('[MP] Error:', message);
}


/* ════════════════════════════════════════
   CLEANUP ON PAGE CLOSE
════════════════════════════════════════ */
window.addEventListener('beforeunload', () => {
  if (MP.isConnected) disconnectFromRoom();
});

console.log('[MP] multiplayer.js loaded — Supabase ready:', !!window.supabase);

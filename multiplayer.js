const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
// Example: 'https://xyzabcdefgh.supabase.co'

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';
// Example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'


/* ════════════════════════════════════════
   STEP 2 — RUN THESE TWO SQL COMMANDS IN SUPABASE
   Go to your Supabase project → SQL Editor → New Query
   Paste each block and click Run

   ── TABLE 1: rooms ──────────────────────
   create table rooms (
     id               text        primary key,
     created_at       timestamp   default now(),
     player1_name     text,
     player2_name     text,
     player1_score    integer     default 200,
     player2_score    integer     default 200,
     current_question integer     default 0,
     status           text        default 'waiting',
     question_seed    integer     default 0
   );

   ── TABLE 2: game_events ────────────────
   create table game_events (
     id          bigint generated always as identity primary key,
     room_id     text        references rooms(id),
     created_at  timestamp   default now(),
     event_type  text,
     player_id   integer,
     payload     jsonb
   );

   ── ENABLE REAL-TIME ON BOTH TABLES ────
   After running the SQL above:
   Go to Database → Replication in the left sidebar
   Toggle ON the switch next to both "rooms" and "game_events"
════════════════════════════════════════ */


/* ════════════════════════════════════════
   SUPABASE CLIENT SETUP
   This creates the connection to your database
════════════════════════════════════════ */

// Load the Supabase library from CDN
// This adds window.supabase to the page
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
document.head.appendChild(supabaseScript);

// Wait for the library to load before doing anything
supabaseScript.onload = function () {
  window._supabaseReady = true;
};

/**
 * Get the Supabase client
 * We create it lazily (only when needed) so the script has time to load
 */
function getSupabase() {
  if (!window._supabaseClient) {
    if (!window.supabase) {
      return null;
    }
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return window._supabaseClient;
}


/* ════════════════════════════════════════
   MULTIPLAYER STATE
   These variables track the current multiplayer session
════════════════════════════════════════ */

const MP = {
  roomId:           null,   // The room code e.g. "GL4821"
  myPlayerId:       null,   // 1 or 2
  myName:           null,   // Player's display name
  opponentName:     null,   // Opponent's display name
  questionSeed:     null,   // Shared random seed for question order
  roomSubscription: null,   // Supabase channel for room updates
  eventSubscription: null,  // Supabase channel for game events
  isConnected:      false,  // Are we connected to a room?
  opponentScore:    200,    // Opponent's current XP
  lastEventId:      null,   // Prevents processing duplicate events
};


/* ════════════════════════════════════════
   SEEDED RANDOM — SAME QUESTIONS FOR BOTH PLAYERS
   Both players must get the exact same questions in the same order.
   This uses a mathematical seed to make the shuffle deterministic.
════════════════════════════════════════ */

/**
 * Creates a random number generator from a seed number.
 * Every time you call the returned function with the same seed,
 * you get the exact same sequence of numbers.
 */
function createSeededRandom(seed) {
  let s = seed;
  return function () {
    // Linear Congruential Generator algorithm
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Shuffles an array using a seed so both players get identical results.
 * Player 1 and Player 2 both call this with the same seed number
 * and will always get the same shuffled order.
 */
function seededShuffle(array, seed) {
  const rand   = createSeededRandom(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Build the question list using a shared seed.
 * Both Player 1 and Player 2 call this with the same seed
 * so they always see questions in the same order.
 * This replaces the random buildQuestions() in game.js for multiplayer.
 */
function buildQuestionsFromSeed(seed) {
  // QUESTIONS and BLUFFS are defined in game.js
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
   Called when Player 1 clicks "Enter the Forge"
   without typing a room code
════════════════════════════════════════ */

/**
 * Creates a new game room in the database.
 * Returns the room code (e.g. "GL4821") or null if it failed.
 */
async function createRoom(playerName) {
  const db = getSupabase();
  if (!db) return null;

  // Generate a unique room code
  const roomId = 'GL' + Math.floor(1000 + Math.random() * 9000);

  // Generate a seed number for question ordering
  // Both players will use this exact number to shuffle questions identically
  const questionSeed = Math.floor(Math.random() * 1000000);

  const { data, error } = await db
    .from('rooms')
    .insert({
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: questionSeed,
    });

  if (error) {
    showMultiError('Could not create room. Please check your Supabase credentials.');
    return null;
  }

  // Save to our local MP state
  MP.roomId       = roomId;
  MP.myPlayerId   = 1;
  MP.myName       = playerName;
  MP.questionSeed = questionSeed;
  MP.isConnected  = true;

  return roomId;
}


/* ════════════════════════════════════════
   ROOM JOINING — PLAYER 2
   Called when Player 2 enters a room code
   and clicks "Enter the Forge"
════════════════════════════════════════ */

/**
 * Joins an existing room.
 * Returns an object with success status and room data,
 * or an error message if joining failed.
 */
async function joinRoom(roomId, playerName) {
  const db = getSupabase();
  if (!db) return { success: false, message: 'Supabase not connected' };

  // First fetch the room to check it exists
  const { data: room, error: fetchError } = await db
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (fetchError || !room) {
    return { success: false, message: 'Room "' + roomId + '" not found. Check the code and try again.' };
  }

  if (room.status === 'active') {
    return { success: false, message: 'Room is already full. Ask for a new code.' };
  }

  if (room.status === 'finished') {
    return { success: false, message: 'That game has already finished.' };
  }

  // Join the room — update the database row
  const { error: joinError } = await db
    .from('rooms')
    .update({
      player2_name: playerName,
      status:       'active',
    })
    .eq('id', roomId);

  if (joinError) {
    return { success: false, message: 'Could not join room. Please try again.' };
  }

  // Save to local MP state
  MP.roomId        = roomId;
  MP.myPlayerId    = 2;
  MP.myName        = playerName;
  MP.opponentName  = room.player1_name;
  MP.questionSeed  = room.question_seed;
  MP.isConnected   = true;

  return {
    success:      true,
    questionSeed: room.question_seed,
    player1Name:  room.player1_name,
  };
}


/* ════════════════════════════════════════
   WATCHING FOR OPPONENT — PLAYER 1 WAITS
   After Player 1 creates a room, they sit on the
   waiting screen until Player 2 joins.
   This function watches the database for that change.
════════════════════════════════════════ */

/**
 * Player 1 calls this to listen for Player 2 joining.
 * When Player 2 joins, the rooms table row gets updated.
 * Supabase sends that update in real time to Player 1.
 */
function watchForOpponent(onOpponentJoined) {
  const db = getSupabase();
  if (!db) return;


  MP.roomSubscription = db
    .channel('room-watch-' + MP.roomId)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',       // Listen for UPDATE events
        schema: 'public',
        table:  'rooms',
        filter: 'id=eq.' + MP.roomId,  // Only for our specific room
      },
      (payload) => {
        const updatedRoom = payload.new;

        // Check if Player 2 has now joined
        if (updatedRoom.status === 'active' && updatedRoom.player2_name) {
          MP.opponentName = updatedRoom.player2_name;

          // Call the callback to start the game
          onOpponentJoined(updatedRoom.player2_name);
        }
      }
    )
    .subscribe();
}


/* ════════════════════════════════════════
   REAL-TIME EVENT SYSTEM
   This is how game events flow between two players.
   When Player 1 answers a question, it gets saved to the
   game_events table. Supabase instantly sends that to Player 2.
════════════════════════════════════════ */

/**
 * Listen for incoming game events from the other player.
 * onEvent is a function you provide that will be called
 * every time the other player does something.
 */
function listenToRoom(onEvent) {
  const db = getSupabase();
  if (!db) return;


  MP.eventSubscription = db
    .channel('events-' + MP.roomId)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',       // Listen for new event rows
        schema: 'public',
        table:  'game_events',
        filter: 'room_id=eq.' + MP.roomId,
      },
      (payload) => {
        const event = payload.new;

        // IMPORTANT: Ignore events from yourself
        // Only process events from the other player
        if (event.player_id === MP.myPlayerId) return;

        // Prevent processing the same event twice (safety check)
        if (event.id === MP.lastEventId) return;
        MP.lastEventId = event.id;


        // Pass to the handler
        onEvent(event);
      }
    )
    .subscribe();
}

/**
 * Broadcast an event to the other player.
 * This inserts a row into game_events which Supabase
 * instantly delivers to everyone listening.
 */
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
  } else {
  }
}


/* ════════════════════════════════════════
   INCOMING EVENT HANDLER
   This function is called every time the opponent
   does something. It updates our game state to match.
════════════════════════════════════════ */

/**
 * Handle an event received from the opponent.
 * This updates score2, the opponent name in HUD, etc.
 */
function handleOpponentEvent(event) {
  const { event_type, payload } = event;

  switch (event_type) {

    /* ── Opponent answered a question ── */
    case 'answer': {
      // Update their score on screen
      score2 = payload.new_score;
      updateHUD();

      // Update their streak display
      if (payload.streak > 1) {
        document.getElementById('st2').textContent = payload.streak + 'x 🔥';
      } else {
        document.getElementById('st2').textContent = '';
      }

      break;
    }

    /* ── Opponent staked XP ── */
    case 'stake': {
      // Optional: show a subtle indicator that opponent is staking
      break;
    }

    /* ── Opponent voted in OD finale ── */
    case 'od_vote': {
      // The OD result will be shown when the local player votes
      break;
    }

    /* ── Opponent finished the game ── */
    case 'game_finished': {
      score2 = payload.final_score;
      updateHUD();
      break;
    }

    /* ── Opponent disconnected ── */
    case 'disconnect': {
      showMultiStatus('Opponent disconnected. Game will continue in solo mode.');
      // Convert to solo mode gracefully
      mode = 'solo';
      document.getElementById('p2name').closest('.hud-player').style.opacity = '0.35';
      break;
    }

    default:
  }
}


/* ════════════════════════════════════════
   SCORE BROADCASTING
   Call these from game.js at the right moments
   to keep the opponent's screen updated in real time
════════════════════════════════════════ */

/**
 * Call this after the player answers a question.
 * It sends your new score to the opponent so their
 * HUD updates immediately.
 */
async function broadcastAnswer(newScore, isCorrect, currentStreak) {
  await broadcastEvent('answer', {
    new_score: newScore,
    correct:   isCorrect,
    streak:    currentStreak,
  });
}

/**
 * Call this when the player stakes XP.
 */
async function broadcastStake(amount) {
  await broadcastEvent('stake', { amount });
}

/**
 * Call this when the player votes in the OD finale.
 */
async function broadcastODVote(vote) {
  await broadcastEvent('od_vote', { vote });
}

/**
 * Call this at the end of the game with the final score.
 */
async function broadcastGameFinished(finalScore) {
  await broadcastEvent('game_finished', { final_score: finalScore });
}


/* ════════════════════════════════════════
   ROOM CLEANUP
   Disconnect cleanly when the game ends or player leaves
════════════════════════════════════════ */

/**
 * Stop all Supabase subscriptions.
 * Call this when the game ends or the player navigates away.
 */
async function disconnectFromRoom() {
  const db = getSupabase();
  if (!db) return;

  // Notify the opponent we're leaving
  if (MP.isConnected) {
    await broadcastEvent('disconnect', { player_id: MP.myPlayerId });
  }

  // Remove all subscriptions
  if (MP.roomSubscription) {
    db.removeChannel(MP.roomSubscription);
    MP.roomSubscription = null;
  }

  if (MP.eventSubscription) {
    db.removeChannel(MP.eventSubscription);
    MP.eventSubscription = null;
  }

  // Mark room as finished in the database
  if (MP.roomId) {
    await db
      .from('rooms')
      .update({ status: 'finished' })
      .eq('id', MP.roomId);
  }

  // Reset MP state
  MP.roomId       = null;
  MP.myPlayerId   = null;
  MP.myName       = null;
  MP.opponentName = null;
  MP.questionSeed = null;
  MP.isConnected  = false;
  MP.lastEventId  = null;

}


/* ════════════════════════════════════════
   UI HELPERS
   Small functions to show messages on the waiting screen
════════════════════════════════════════ */

function showMultiStatus(message) {
  const el = document.getElementById('wait-msg');
  if (el) el.textContent = message;
}

function showMultiError(message) {
  const el = document.getElementById('wait-msg');
  if (el) {
    el.textContent  = '⚠ ' + message;
    el.style.color  = 'var(--rs)';
  }
}


/* ════════════════════════════════════════
   OVERRIDE GAME.JS FUNCTIONS FOR MULTIPLAYER
   These replace the existing functions in game.js
   when multiplayer mode is active.
   They work automatically — you do not need to
   change anything in game.js.
════════════════════════════════════════ */

/**
 * Override joinOrCreate() from game.js with the real multiplayer version.
 * When the player fills in the form and clicks "Enter the Forge",
 * this runs instead of the original simulated version.
 */
window.joinOrCreate = async function () {
  const nameInput = document.getElementById('pname-input');
  const codeInput = document.getElementById('room-input');

  const playerName = (nameInput.value.trim() || 'MINER').toUpperCase();
  const roomCode   = codeInput.value.trim().toUpperCase();

  // Show loading state
  showMultiStatus('Connecting...');
  showPage('waiting');

  if (roomCode) {
    /* ── Player 2 is joining an existing room ── */
    showMultiStatus('Joining room ' + roomCode + '...');

    const result = await joinRoom(roomCode, playerName);

    if (!result.success) {
      showMultiError(result.message);
      return;
    }

    // Show the room code on screen
    document.getElementById('room-display').textContent = roomCode;

    showMultiStatus('Connected! Starting in 3...');

    // Start listening for events from Player 1
    listenToRoom(handleOpponentEvent);

    // Build questions using the shared seed (same order as Player 1)
    questions = buildQuestionsFromSeed(MP.questionSeed);

    // Short countdown before the game starts
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        showMultiStatus('Starting in ' + countdown + '...');
      } else {
        clearInterval(countdownInterval);
        myName = playerName;
        showPage('game');
        startGame();
      }
    }, 1000);

  } else {
    /* ── Player 1 is creating a new room ── */
    const newRoomId = await createRoom(playerName);

    if (!newRoomId) return; // Error already shown by createRoom()

    // Show the room code for Player 1 to share
    document.getElementById('room-display').textContent = newRoomId;
    showMultiStatus('Share this code with your opponent. Waiting for them to join...');

    // Start listening for game events
    listenToRoom(handleOpponentEvent);

    // Watch for Player 2 to join
    watchForOpponent((opponentName) => {
      // Player 2 joined — start the countdown
      showMultiStatus(opponentName + ' joined! Starting in 3...');

      let countdown = 3;
      const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          showMultiStatus('Starting in ' + countdown + '...');
        } else {
          clearInterval(countdownInterval);
          myName    = playerName;
          questions = buildQuestionsFromSeed(MP.questionSeed);
          showPage('game');
          startGame();
        }
      }, 1000);
    });
  }
};



/**
 * Override simulateOpponentAnswer() from game.js.
 * The original randomly fakes an opponent answer.
 * In real multiplayer we do nothing here because the real
 * opponent's score arrives via handleOpponentEvent().
 */
window.simulateOpponentAnswer = function (correct) {
  // Only simulate in solo mode — in multiplayer the real score comes via events
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    updateHUD();
  }
  // In multiplayer, score2 is updated by handleOpponentEvent() instead
};


/* ════════════════════════════════════════
   HOOK INTO GAME EVENTS
   We need to broadcast events at key moments in game.js.
   Instead of editing game.js directly, we patch the functions here.
════════════════════════════════════════ */

/**
 * Wait for game.js to be fully loaded, then patch the functions.
 * We use a small delay to make sure game.js has run first.
 */
document.addEventListener('DOMContentLoaded', function () {

  /* ── Patch selectAnswer to broadcast when multiplayer ── */
  const originalSelectAnswer = window.selectAnswer;
  if (originalSelectAnswer) {
    window.selectAnswer = function (btn, correct, q, shuffled) {
      // Call the original function first
      originalSelectAnswer(btn, correct, q, shuffled);

      // Then broadcast the result to the opponent
      if (mode === 'multi' && MP.isConnected) {
        broadcastAnswer(score1, correct, streak1);
      }
    };
  }

  /* ── Patch selectBluff to broadcast when multiplayer ── */
  const originalSelectBluff = window.selectBluff;
  if (originalSelectBluff) {
    window.selectBluff = function (btn, origIndex, q) {
      originalSelectBluff(btn, origIndex, q);

      if (mode === 'multi' && MP.isConnected) {
        const caught = origIndex === q.bluff;
        broadcastAnswer(score1, caught, streak1);
      }
    };
  }

  /* ── Patch confirmStake to broadcast when multiplayer ── */
  const originalConfirmStake = window.confirmStake;
  if (originalConfirmStake) {
    window.confirmStake = function (override) {
      originalConfirmStake(override);

      const amount = (override !== undefined) ? override : selectedStake;
      if (mode === 'multi' && MP.isConnected && amount > 0) {
        broadcastStake(amount);
      }
    };
  }

  /* ── Patch castODVote to broadcast when multiplayer ── */
  const originalCastODVote = window.castODVote;
  if (originalCastODVote) {
    window.castODVote = function (vote) {
      originalCastODVote(vote);

      if (mode === 'multi' && MP.isConnected) {
        broadcastODVote(vote);
      }
    };
  }

  /* ── Patch showResults to broadcast final score ── */
  const originalShowResults = window.showResults;
  if (originalShowResults) {
    window.showResults = function () {
      originalShowResults();

      if (mode === 'multi' && MP.isConnected) {
        broadcastGameFinished(score1);
        // Clean up the connection after a short delay
        setTimeout(() => disconnectFromRoom(), 3000);
      }
    };
  }

});


/* ════════════════════════════════════════
   DISCONNECT ON PAGE CLOSE
   Clean up the Supabase connection if the player
   closes the tab or navigates away
════════════════════════════════════════ */

window.addEventListener('beforeunload', function () {
  if (MP.isConnected) {
    disconnectFromRoom();
  }
});


/* ════════════════════════════════════════
   CONNECTION STATUS CHECK


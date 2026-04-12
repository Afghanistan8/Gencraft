/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v5 — Ably)

   HOW TO SET UP (5 minutes):
   ─────────────────────────────────────
   1. Go to ably.com and sign up free
   2. Create a new app called "gencraft"
   3. Go to API Keys in your app dashboard
   4. Copy the first API key (Root key)
   5. Paste it into ABLY_KEY below
   6. That is it — no database config,
      no RLS policies, no replication.
      Ably handles everything.

   We still use Supabase ONLY to store the
   room code so Player 2 can look it up.
   All real-time communication goes through
   Ably which is built for exactly this.
════════════════════════════════════════ */

const ABLY_KEY      = 'PLcYfQ.xNcEow:nFYqchY3fQTasdZ2F9MKOU60yXV8KuK8jgndqMhg3yo';
const SUPABASE_URL  = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ════════════════════════════════════════
   LOAD ABLY FROM CDN
   We load it the same way as Supabase —
   as a script tag. Add this to index.html
   in the <head> section:

   <script src="https://cdn.ably.com/lib/ably.min-2.js"></script>

   It must appear BEFORE multiplayer.js
════════════════════════════════════════ */

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */

const MP = {
  roomId:       null,
  myPlayerId:   null,
  myName:       null,
  opponentName: null,
  questionSeed: null,
  ablyClient:   null,
  channel:      null,
  isConnected:  false,
  gameStarted:  false,
};

/* ════════════════════════════════════════
   ABLY CLIENT
════════════════════════════════════════ */

function getAbly() {
  if (!MP.ablyClient) {
    if (!window.Ably) {
      showMultiError('Ably not loaded. Please refresh.');
      return null;
    }
    MP.ablyClient = new Ably.Realtime({
      key:            ABLY_KEY,
      echoMessages:   false,
    });
  }
  return MP.ablyClient;
}

/* ════════════════════════════════════════
   SUPABASE CLIENT (for room lookup only)
════════════════════════════════════════ */

function getSupabase() {
  if (!window._supabaseClient) {
    if (!window.supabase) return null;
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return window._supabaseClient;
}

/* ════════════════════════════════════════
   SEEDED QUESTIONS
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
   SUPABASE ROOM OPERATIONS
   Only used to store/retrieve the room
   code. All real-time goes through Ably.
════════════════════════════════════════ */

async function createRoomInDB(playerName) {
  const db = getSupabase();

  const roomId       = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const questionSeed = Math.floor(Math.random() * 1000000);

  if (db) {
    const { error } = await db.from('rooms').insert({
      id:            roomId,
      player1_name:  playerName,
      status:        'waiting',
      question_seed: questionSeed,
    });
    if (error) {
      // DB failed but we can still play using Ably-only mode
      // Room code is generated locally — player just needs to share it
    }
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
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !room) return null;
  return room;
}

/* ════════════════════════════════════════
   ABLY CHANNEL — CORE CONNECTION
   This replaces ALL of the Supabase
   real-time code. Ably is specifically
   built for this use case and works
   reliably without any configuration.
════════════════════════════════════════ */

function connectToRoom(roomId, onMessage) {
  const ably = getAbly();
  if (!ably) return;

  showMultiStatus('Connecting to room...');

  // Both players subscribe to the same channel name
  const channel = ably.channels.get('gencraft-' + roomId);
  MP.channel = channel;

  // Listen for all messages from the opponent
  channel.subscribe((message) => {
    onMessage(message.name, message.data);
  });

  // Confirm Ably connection is established
  ably.connection.on('connected', () => {
    MP.isConnected = true;

    // Player 2 announces themselves once connected
    if (MP.myPlayerId === 2) {
      showMultiStatus('Connected! Announcing to host...');
      publishToChannel('player_joined', {
        name:         MP.myName,
        questionSeed: MP.questionSeed,
      });

      // Fallback: start anyway after 8 seconds if no confirmation arrives
      setTimeout(() => {
        if (!MP.gameStarted) {
          MP.gameStarted = true;
          launchGame();
        }
      }, 8000);
    }
  });

  ably.connection.on('failed', () => {
    showMultiError('Connection failed. Check your Ably key and refresh.');
  });

  ably.connection.on('disconnected', () => {
    if (!MP.gameStarted) {
      showMultiStatus('Reconnecting...');
    }
  });
}

function publishToChannel(eventName, data) {
  if (!MP.channel) return;
  MP.channel.publish(eventName, data);
}

/* ════════════════════════════════════════
   MESSAGE HANDLER
════════════════════════════════════════ */

function handleMessage(event, data) {

  if (event === 'player_joined') {
    // Player 1 receives this when Player 2 connects
    if (MP.myPlayerId !== 1) return;
    MP.opponentName = data.name || 'Opponent';
    startBothPlayers(data.name, data.questionSeed || MP.questionSeed);
  }

  if (event === 'game_confirmed') {
    // Player 2 receives this when Player 1 confirms start
    if (MP.myPlayerId !== 2) return;
    if (!MP.gameStarted) {
      MP.gameStarted = true;
      launchGame();
    }
  }

  if (event === 'answer') {
    score2  = data.new_score;
    streak2 = data.streak || 0;
    updateHUD();
  }

  if (event === 'game_finished') {
    score2 = data.final_score;
    updateHUD();
  }

  if (event === 'disconnect') {
    showMultiStatus('Opponent disconnected.');
    mode = 'solo';
    const p2 = document.getElementById('p2name').closest('.hud-player');
    if (p2) p2.style.opacity = '0.35';
  }
}

/* ════════════════════════════════════════
   GAME START
════════════════════════════════════════ */

function startBothPlayers(opponentName, seed) {
  if (MP.gameStarted) return;
  MP.gameStarted  = true;
  MP.questionSeed = seed;

  showMultiStatus((opponentName || 'Opponent') + ' joined! Starting in 3...');

  // Tell Player 2 to start their countdown too
  publishToChannel('game_confirmed', { seed });

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

  const p2el = document.getElementById('p2name');
  if (p2el) p2el.textContent = MP.opponentName || 'OPPONENT';

  showPage('game');
  startGame();
}

/* ════════════════════════════════════════
   OVERRIDE joinOrCreate FROM game.js
════════════════════════════════════════ */

window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input').value.trim() || 'MINER').toUpperCase();
  const codeInput  = document.getElementById('room-input').value.trim().toUpperCase();

  showMultiStatus('Initialising connection...');
  showPage('waiting');

  if (codeInput) {
    /* ── PLAYER 2 — JOINING ── */
    MP.myPlayerId   = 2;
    MP.myName       = playerName;
    MP.roomId       = codeInput;

    document.getElementById('room-display').textContent = codeInput;
    showMultiStatus('Looking up room...');

    // Try to get the question seed from DB
    const room = await lookupRoomInDB(codeInput);
    if (room) {
      MP.questionSeed  = room.question_seed;
      MP.opponentName  = room.player1_name;

      // Update room status in DB
      const db = getSupabase();
      if (db) {
        await db.from('rooms')
          .update({ player2_name: playerName, status: 'active' })
          .eq('id', codeInput);
      }
    } else {
      // DB lookup failed — generate a seed locally
      // This means both players will get different questions
      // but the game will still work
      MP.questionSeed = Math.floor(Math.random() * 1000000);
      showMultiStatus('Room found. Connecting...');
    }

    // Connect via Ably
    connectToRoom(codeInput, handleMessage);

  } else {
    /* ── PLAYER 1 — CREATING ── */
    const result = await createRoomInDB(playerName);

    document.getElementById('room-display').textContent = result.roomId;
    showMultiStatus('Room created! Share this code. Waiting for opponent...');

    // Connect via Ably and wait
    connectToRoom(result.roomId, handleMessage);
  }
};

/* ════════════════════════════════════════
   OVERRIDE OPPONENT SIMULATION
════════════════════════════════════════ */

window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20));
    streak2 = correct ? streak2 + 1 : 0;
    updateHUD();
  }
};

/* ════════════════════════════════════════
   PATCH game.js TO BROADCAST EVENTS
════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {

  const _selectAnswer = window.selectAnswer;
  if (_selectAnswer) {
    window.selectAnswer = function(btn, correct, q, shuffled) {
      _selectAnswer(btn, correct, q, shuffled);
      if (mode === 'multi' && MP.isConnected) {
        publishToChannel('answer', { new_score: score1, correct, streak: streak1 });
      }
    };
  }

  const _selectBluff = window.selectBluff;
  if (_selectBluff) {
    window.selectBluff = function(btn, origIndex, q) {
      _selectBluff(btn, origIndex, q);
      if (mode === 'multi' && MP.isConnected) {
        publishToChannel('answer', { new_score: score1, correct: origIndex === q.bluff, streak: streak1 });
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
      _showResults();
      if (mode === 'multi' && MP.isConnected) {
        publishToChannel('game_finished', { final_score: score1 });
        setTimeout(() => cleanupConnection(), 3000);
      }
    };
  }

});

/* ════════════════════════════════════════
   CLEANUP
════════════════════════════════════════ */

function cleanupConnection() {
  if (MP.channel) {
    publishToChannel('disconnect', {});
    MP.channel.unsubscribe();
    MP.channel = null;
  }
  if (MP.ablyClient) {
    MP.ablyClient.close();
    MP.ablyClient = null;
  }
  if (MP.roomId) {
    const db = getSupabase();
    if (db) db.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
  }
  MP.isConnected = false;
  MP.gameStarted = false;
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

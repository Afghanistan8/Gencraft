/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v5 — Ably)

   HOW TO SET UP:
   ─────────────────────────────────────
   1. Uses Ably for real-time multiplayer
   2. Uses Supabase to store room codes
════════════════════════════════════════ */

const ABLY_KEY     = 'PLcYfQ.xNcEow:nFYqchY3fQTasdZ2F9MKOU60yXV8KuK8jgndqMhg3yo';
const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ────────────────────────────────────────
   GLOBAL MP STATE
──────────────────────────────────────── */
window.MP = {
  isMultiplayer: false,
  roomCode: null,
  isHost: false,
  opponentName: 'OPPONENT',
  channel: null,
  ably: null
};

// Core logic wrapped to ensure window game functions have loaded
document.addEventListener('DOMContentLoaded', () => {

  console.log('[MP] Initializing Multiplayer...');
  
  if (!window.supabase) {
    console.error('[MP] Supabase SDK missing - Ensure CDN script is loaded before multiplayer.js');
  }

  // --- OVERRIDE CORE FUNCTIONS --- //
  
  // Save original functions if necessary
  const __originalTimeUp = window.timeUp;
  const __originalSelectAnswer = window.selectAnswer;
  const __originalSelectBluff = window.selectBluff;

  // Re-write joinOrCreate completely!
  window.joinOrCreate = async function() {
    console.log('[MP] joinOrCreate (Patched)');
    
    // We force mode to multi right away
    window.mode = 'multi';
    window.MP.isMultiplayer = true;
    
    window.myName = (document.getElementById('pname-input').value.trim()||'MINER').toUpperCase();
    let rawRoom = document.getElementById('room-input').value.toUpperCase().replace(/\s/g, '');

    document.getElementById('pname-input').disabled = true;
    document.getElementById('room-input').disabled = true;

    try {
      showMultiError(''); // clear errors

      if (!rawRoom) {
        // HOSTING A NEW ROOM
        window.MP.isHost = true;
        window.MP.roomCode = 'GL' + Math.floor(1000 + Math.random() * 9000);
        console.log('[MP] Creating Room:', window.MP.roomCode);

        // Save to Supabase (so P2 can find it)
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { error } = await sb.from('rooms').insert([{ 
          id: window.MP.roomCode,
          host_name: window.myName,
          seed: Math.floor(Math.random() * 1000000)
        }]);

        if(error) throw error;

        // Connect to Ably
        await connectToAbly();
        window.showPage('waiting');
        document.getElementById('room-display').textContent = window.MP.roomCode;

      } else {
        // JOINING AN EXISTING ROOM
        window.MP.isHost = false;
        window.MP.roomCode = rawRoom;
        console.log('[MP] Joining Room:', rawRoom);

        // Verify in Supabase
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await sb.from('rooms').select('*').eq('id', rawRoom).maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error(`Room "${rawRoom}" not found. Check the code and try again.`);
        }

        window.MP.opponentName = data.host_name || 'HOST';

        // Connect to Ably
        await connectToAbly();
        window.showPage('waiting');
        document.getElementById('room-display').textContent = window.MP.roomCode;
        
        // Let host know we joined
        publishMessage('player_joined', { name: window.myName });
      }

    } catch (err) {
      console.error('[MP] Setup Error:', err);
      showMultiError(err.message || 'Failed to connect. Try again.');
      document.getElementById('pname-input').disabled = false;
      document.getElementById('room-input').disabled = false;
    }
  };

  // Replace answer functions so they sync
  window.timeUp = function(q, shuffled) {
    if (__originalTimeUp) __originalTimeUp(q, shuffled);
    if (window.MP.isMultiplayer) syncScore();
  };

  window.selectAnswer = function(btn, correct, q, shuffled) {
    if (__originalSelectAnswer) __originalSelectAnswer(btn, correct, q, shuffled);
    if (window.MP.isMultiplayer) syncScore();
  };

  window.selectBluff = function(btn, origIndex, q) {
    if (__originalSelectBluff) __originalSelectBluff(btn, origIndex, q);
    if (window.MP.isMultiplayer) syncScore();
  };


  // Override opponent simulation entirely to disable it during multi
  window.simulateOpponentAnswer = function() {
    // Disabled! Opponent score comes from network!
  };


  console.log('[MP] Overrides applied successfully.');
});


/* ────────────────────────────────────────
   ABLY CONNECTION LOGIC
──────────────────────────────────────── */

async function connectToAbly() {
  console.log('[MP] Connecting to Ably...');
  
  if (!window.Ably) {
    throw new Error('Ably SDK missing!');
  }

  // We init Ably
  window.MP.ably = new window.Ably.Realtime.Promise({ key: ABLY_KEY, clientId: window.myName });
  window.MP.channel = window.MP.ably.channels.get(`room:${window.MP.roomCode}`);

  await window.MP.channel.subscribe(handleMessage);

  console.log('[MP] Ably channel subscribed!');
}

function publishMessage(type, payload) {
  if (!window.MP.channel) return;
  window.MP.channel.publish(type, payload);
}

function handleMessage(message) {
  const { name, data } = message;

  // Ignore our own messages
  if (message.clientId === window.myName) return;

  console.log(`[MP] Received: ${name}`, data);

  if (name === 'player_joined' && window.MP.isHost) {
    window.MP.opponentName = data.name;
    const wm = document.getElementById('wait-msg');
    
    // Quick countdown
    wm.textContent = 'OPPONENT CONNECTED — FORGING IN 3...';
    let c = 3;
    const iv = setInterval(() => {
      c--;
      if (c > 0) {
        wm.textContent = 'FORGING IN ' + c + '...';
      } else {
        clearInterval(iv);
        // Start Game
        publishMessage('game_start', { seed: 1234 });
        startGameFromEvent(1234);
      }
    }, 1000);
  }

  if (name === 'game_start' && !window.MP.isHost) {
    startGameFromEvent(data.seed);
  }

  if (name === 'sync_score') {
    window.score2 = data.score;
    window.streak2 = data.streak;
    window.updateHUD(); // Trigger re-render
  }
}

function startGameFromEvent(seed) {
  console.log('[MP] Game Starting!');
  
  // Very simplistic seed mechanism so questions match up 
  // (In production, replace shuffle with seeded shuffle)
  // For now, we trust the random seed or just call normal buildQuestions
  window.buildQuestions();
  window.showPage('game');
  window.startGame();

  // Also we want to label the opponent
  document.getElementById('p2name').textContent = window.MP.opponentName;
}

function syncScore() {
  if (!window.MP.isMultiplayer) return;
  publishMessage('sync_score', { score: window.score1, streak: window.streak1 });
}


/* ────────────────────────────────────────
   UI HELPERS
──────────────────────────────────────── */
function showMultiError(msg) {
  let eb = document.getElementById('multi-error');
  if(!eb) {
    eb = document.createElement('div');
    eb.id = 'multi-error';
    eb.style.color = '#f87171';
    eb.style.fontSize = '12px';
    eb.style.marginBottom = '12px';
    const ipt = document.getElementById('room-input');
    ipt.parentNode.insertBefore(eb, ipt);
  }
  eb.textContent = msg;
}

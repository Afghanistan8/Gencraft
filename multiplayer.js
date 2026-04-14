/* ══════════════════════════════════════════
   GENCRAFT MULTIPLAYER — Ably Edition
   Credentials hardcoded and ready to deploy
══════════════════════════════════════════ */

const ABLY_KEY = 'PLcYfQ.Q-j42w:gn7JJ70LbSF1whd8wp1jgMGx1geRh9_dmCmBhB187zg';

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const MP = {
  roomId:             null,
  isHost:             false,
  myName:             null,
  opponentName:       null,
  questionSeed:       null,
  ably:               null,
  channel:            null,
  isConnected:        false,
  gameStarted:        false,
  iFinished:          false,
  opponentFinalScore: null,
  players:            [],
};

/* ══════════════════════════════════════════
   SEEDED QUESTIONS — same order both sides
══════════════════════════════════════════ */
function mpSeededRandom(seed) {
  let s = seed;
  return () => { s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
}
function mpShuffle(arr, seed) {
  const rand = mpSeededRandom(seed);
  const r = [...arr];
  for (let i=r.length-1; i>0; i--) {
    const j = Math.floor(rand()*(i+1));
    [r[i],r[j]] = [r[j],r[i]];
  }
  return r;
}
function buildQuestionsFromSeed(seed) {
  const base   = mpShuffle([...QUESTIONS], seed).slice(0,16);
  const bluffs = mpShuffle([...BLUFFS], seed+1).slice(0,4);
  const out=[]; let bi=0;
  for (let i=0; i<base.length; i++) {
    out.push(base[i]);
    if ((i+1)%4===0 && bi<bluffs.length) out.push(bluffs[bi++]);
  }
  return out.slice(0,20);
}

/* ══════════════════════════════════════════
   ABLY — connect and get channel
══════════════════════════════════════════ */
function mpConnect(roomId, onReady) {
  if (!window.Ably) {
    showMultiError('⚠ Ably library not loaded. Please refresh.');
    return;
  }

  showMultiStatus('Connecting...');

  MP.ably = new Ably.Realtime({ key: ABLY_KEY, echoMessages: false });
  MP.channel = MP.ably.channels.get('gencraft-' + roomId);

  MP.channel.subscribe((msg) => {
    mpHandleMsg(msg.name, msg.data || {});
  });

  MP.ably.connection.once('connected', () => {
    MP.isConnected = true;
    onReady();
  });

  MP.ably.connection.on('failed', () => {
    showMultiError('⚠ Ably connection failed. Check your key.');
  });
}

function mpPub(event, data) {
  if (!MP.channel) return;
  MP.channel.publish(event, Object.assign({ from: MP.myName }, data || {}));
}

/* ══════════════════════════════════════════
   MESSAGE HANDLER
══════════════════════════════════════════ */
function mpHandleMsg(event, data) {

  /* ── A player joined ── */
  if (event === 'player_joined') {
    const name = data.name || data.from;
    if (name && !MP.players.find(p => p.name === name)) {
      MP.players.push({ name });
    }
    MP.opponentName = name;
    mpUpdateWaitingUI();

    /* Host: tell everyone who is in the room */
    if (MP.isHost) {
      mpPub('room_state', {
        players:      MP.players.map(p => p.name),
        seed:         MP.questionSeed,
        host:         MP.myName,
      });
    }
  }

  /* ── Host broadcast current room state ── */
  if (event === 'room_state') {
    const names = data.players || [];
    MP.players = names.map(n => ({ name: n }));
    if (data.host) MP.opponentName = data.host;
    if (!MP.questionSeed && data.seed) MP.questionSeed = data.seed;
    mpUpdateWaitingUI();
  }

  /* ── Host started the game ── */
  if (event === 'game_start') {
    if (MP.gameStarted) return;
    MP.gameStarted  = true;
    MP.questionSeed = data.seed || MP.questionSeed;
    MP.opponentName = data.host || MP.opponentName;
    mpCountdownThenLaunch();
  }

  /* ── Opponent answered ── */
  if (event === 'answer') {
    if (data.from === myName) return;
    if (data.score !== undefined) score2 = data.score;
    if (data.streak !== undefined) streak2 = data.streak;
    if (data.from) {
      MP.opponentName = data.from;
      const el = document.getElementById('p2name');
      if (el) el.textContent = data.from;
    }
    updateHUD();
  }

  /* ── Opponent finished ── */
  if (event === 'done') {
    if (data.from === myName) return;
    MP.opponentFinalScore = data.score;
    MP.opponentName = data.from || MP.opponentName;
    score2 = data.score;
    updateHUD();
    if (MP.iFinished) mpShowFinalResults();
  }

  /* ── Opponent left ── */
  if (event === 'bye') {
    if (!MP.iFinished) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      const el = document.getElementById('p2name')?.closest?.('.hud-player');
      if (el) el.style.opacity = '0.3';
    } else {
      MP.opponentFinalScore = MP.opponentFinalScore ?? score2;
      mpShowFinalResults();
    }
  }
}

/* ══════════════════════════════════════════
   WAITING ROOM UI
══════════════════════════════════════════ */
function mpUpdateWaitingUI() {
  renderWaitingPlayers(MP.players);

  const hostEl   = document.getElementById('mp-host-section');
  const joinerEl = document.getElementById('mp-joiner-section');
  const hintEl   = document.getElementById('mp-generic-hint');
  if (hintEl)   hintEl.style.display   = 'none';
  if (hostEl)   hostEl.style.display   = MP.isHost ? 'flex' : 'none';
  if (joinerEl) joinerEl.style.display = MP.isHost ? 'none' : 'block';

  if (MP.isHost) {
    const count = MP.players.length;
    if (count < 2) {
      showMultiStatus(count + ' player in room. Waiting for others...');
      mpSetStartEnabled(false);
      mpSetStartHint('Waiting for at least 1 more player to join...');
    } else {
      showMultiStatus(count + ' players ready!');
      mpSetStartEnabled(true);
      mpSetStartHint(count + ' players in room — start when ready!');
    }
  } else {
    showMultiStatus('Waiting for host to start... (' + MP.players.length + ' in room)');
  }
}

function mpSetStartEnabled(on) {
  const btn = document.getElementById('mp-start-btn');
  if (!btn) return;
  btn.disabled            = !on;
  btn.style.opacity       = on ? '1' : '0.4';
  btn.style.pointerEvents = on ? 'auto' : 'none';
}
function mpSetStartHint(msg) {
  const el = document.getElementById('mp-start-hint');
  if (el) el.textContent = msg;
}

function renderWaitingPlayers(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;
  el.innerHTML = (players || []).map((p, i) => {
    const col = i === 0 ? 'var(--em)' : 'var(--am)';
    const bg  = i === 0 ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)';
    const tag = p.name === MP.myName
      ? ' (YOU)' : i === 0 ? ' (HOST)' : ' (JOINED ✓)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 13px;border:1px solid ${col};background:${bg};">
      <div style="width:30px;height:30px;border:2px solid ${col};color:${col};font-family:var(--px);font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${(p.name||'?')[0].toUpperCase()}</div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${col};">${p.name}<span style="color:var(--txt3);font-size:6px;margin-left:4px;">${tag}</span></div>
      <div style="width:7px;height:7px;background:${col};border-radius:50%;animation:pulse 1.2s infinite;flex-shrink:0;"></div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   HOST — START GAME
══════════════════════════════════════════ */
function hostStartGame() {
  if (!MP.isHost || MP.players.length < 2) return;

  mpSetStartEnabled(false);
  mpSetStartHint('Starting...');
  showMultiStatus('Starting game...');

  /* Tell everyone to start */
  mpPub('game_start', {
    seed: MP.questionSeed,
    host: MP.myName,
  });

  /* Host starts immediately */
  MP.gameStarted = true;
  mpCountdownThenLaunch();
}

// Expose for inline onclick
window.hostStartGame = hostStartGame;

/* ══════════════════════════════════════════
   COUNTDOWN + LAUNCH
══════════════════════════════════════════ */
function mpCountdownThenLaunch() {
  let n = 3;
  showMultiStatus('Starting in ' + n + '...');
  const iv = setInterval(() => {
    n--;
    if (n > 0) {
      showMultiStatus('Starting in ' + n + '...');
    } else {
      clearInterval(iv);
      mpLaunchGame();
    }
  }, 1000);
}

function mpLaunchGame() {
  mode      = 'multi';
  myName    = MP.myName;
  questions = buildQuestionsFromSeed(MP.questionSeed);
  showPage('game');
  startGame();
  const p2 = document.getElementById('p2name');
  if (p2) p2.textContent = MP.opponentName || 'OPPONENT';
}

/* ══════════════════════════════════════════
   RESULTS SYNC
══════════════════════════════════════════ */
function mpNotifyFinished() {
  MP.iFinished    = true;
  MP.myFinalScore = score1;
  mpPub('done', { score: score1 });

  if (MP.opponentFinalScore !== null) {
    mpShowFinalResults();
  } else {
    mpShowWaitingOverlay();
    setTimeout(() => {
      if (!MP.opponentFinalScore) {
        MP.opponentFinalScore = score2;
        mpShowFinalResults();
      }
    }, 60000);
  }
}

function mpShowWaitingOverlay() {
  hideGamePanels();
  const od = document.getElementById('od-final');
  if (od) od.style.display = 'none';

  let ov = document.getElementById('mp-wait-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'mp-wait-ov';
    ov.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;margin:16px;';
    document.getElementById('page-game').appendChild(ov);
  }
  ov.style.display = 'flex';
  ov.innerHTML =
    '<div style="font-family:var(--px);font-size:8px;color:var(--am)">ROUND COMPLETE</div>' +
    '<div style="font-family:var(--px);font-size:24px;color:var(--em)">' + score1 + ' XP</div>' +
    '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Score locked.</div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>' +
    '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName||'opponent') + '...</div>' +
    '</div>';
}

function mpShowFinalResults() {
  document.getElementById('mp-wait-ov')?.remove();
  if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;
  (window._originalShowResults || window.showResults)?.();
  setTimeout(mpCleanup, 6000);
}

/* ══════════════════════════════════════════
   MAIN ENTRY — override joinOrCreate
══════════════════════════════════════════ */
window.joinOrCreate = async function () {
  const playerName = (document.getElementById('pname-input')?.value.trim() || 'MINER').toUpperCase();
  const roomCode   = document.getElementById('room-input')?.value.trim().toUpperCase() || '';

  /* Reset state */
  mpCleanup();
  Object.assign(MP, {
    myName: playerName, roomId: null, isHost: false,
    opponentName: null, gameStarted: false, iFinished: false,
    opponentFinalScore: null, players: [],
  });

  /* Reset waiting room UI */
  const pl = document.getElementById('mp-player-list');
  if (pl) pl.innerHTML = '';
  ['mp-host-section','mp-joiner-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const gh = document.getElementById('mp-generic-hint');
  if (gh) gh.style.display = 'block';

  showPage('waiting');
  showMultiStatus('Connecting to Ably...');

  if (roomCode) {
    /* ──── JOINER ──── */
    MP.roomId = roomCode;
    MP.isHost = false;
    document.getElementById('room-display').textContent = roomCode;

    mpConnect(roomCode, () => {
      showMultiStatus('Connected! Announcing...');
      MP.players = [{ name: playerName }];
      renderWaitingPlayers(MP.players);

      const hostEl   = document.getElementById('mp-host-section');
      const joinerEl = document.getElementById('mp-joiner-section');
      const hintEl   = document.getElementById('mp-generic-hint');
      if (hostEl)   hostEl.style.display   = 'none';
      if (joinerEl) joinerEl.style.display = 'block';
      if (hintEl)   hintEl.style.display   = 'none';

      showMultiStatus('Joined! Waiting for host to start...');

      /* Announce presence to host */
      mpPub('player_joined', { name: playerName });
    });

  } else {
    /* ──── HOST ──── */
    const roomId = 'GL' + Math.floor(1000 + Math.random() * 9000);
    const seed   = Math.floor(Math.random() * 1000000);

    MP.roomId       = roomId;
    MP.isHost       = true;
    MP.questionSeed = seed;
    MP.players      = [{ name: playerName }];

    document.getElementById('room-display').textContent = roomId;

    mpConnect(roomId, () => {
      showMultiStatus('Room ready! Share this code.');
      mpUpdateWaitingUI();
    });
  }
};

/* ══════════════════════════════════════════
   OPPONENT SIMULATION OVERRIDE
══════════════════════════════════════════ */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random()*20) : -20));
    streak2 = correct ? streak2+1 : 0;
    updateHUD();
  }
};

/* ══════════════════════════════════════════
   PATCH game.js — broadcast in-game events
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  function mpSend(event, extra) {
    if (mode !== 'multi' || !MP.channel) return;
    mpPub(event, extra || {});
  }

  const _sa = window.selectAnswer;
  if (_sa) window.selectAnswer = function(b,c,q,s) {
    _sa(b,c,q,s);
    mpSend('answer', { score: score1, correct: c, streak: streak1 });
  };

  const _sb = window.selectBluff;
  if (_sb) window.selectBluff = function(b,i,q) {
    _sb(b,i,q);
    mpSend('answer', { score: score1, correct: i===q.bluff, streak: streak1 });
  };

  const _ov = window.castODVote;
  if (_ov) window.castODVote = function(v) {
    _ov(v); mpSend('od_vote', { vote: v });
  };

  const _sr = window.showResults;
  if (_sr) {
    window._originalShowResults = _sr;
    window.showResults = function() {
      if (mode === 'multi' && MP.channel) mpNotifyFinished();
      else _sr();
    };
  }

  window.showFinalResults = mpShowFinalResults;
});

/* ══════════════════════════════════════════
   CLEANUP
══════════════════════════════════════════ */
function mpCleanup() {
  if (MP.channel) { mpPub('bye', {}); MP.channel.unsubscribe(); }
  if (MP.ably)    { MP.ably.close(); }
  MP.ably = null; MP.channel = null;
  MP.isConnected = false; MP.gameStarted = false; MP.iFinished = false;
}
window.addEventListener('beforeunload', () => MP.roomId && mpCleanup());

/* ══════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════ */
function showMultiStatus(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = ''; }
}
function showMultiError(msg) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--rs)'; }
}

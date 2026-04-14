/* ═══════════════════════════════════════════
   GENCRAFT MULTIPLAYER — v11
   Uses identical Ably logic as test-mp.html
   which is confirmed working.
═══════════════════════════════════════════ */

const ABLY_KEY = 'PLcYfQ.Q-j42w:gn7JJ70LbSF1whd8wp1jgMGx1geRh9_dmCmBhB187zg';

/* ─── STATE ─────────────────────────────── */
const MP = {
  roomId:   null,
  isHost:   false,
  myName:   null,
  oppName:  null,
  seed:     null,
  ably:     null,
  ch:       null,
  players:  [],
  started:  false,
  iDone:    false,
  oppScore: null,
};

/* ─── SEEDED QUESTIONS ──────────────────── */
function _r(seed){let s=seed;return()=>{s=(s*1664525+1013904223)&0xffffffff;return(s>>>0)/0xffffffff;}}
function _sh(a,seed){const r=_r(seed),arr=[...a];for(let i=arr.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function buildQuestionsFromSeed(seed){
  const b=_sh([...QUESTIONS],seed).slice(0,16),bl=_sh([...BLUFFS],seed+1).slice(0,4),o=[];
  let bi=0;for(let i=0;i<b.length;i++){o.push(b[i]);if((i+1)%4===0&&bi<bl.length)o.push(bl[bi++]);}
  return o.slice(0,20);
}

/* ─── ABLY CONNECT — same as test page ──── */
function mpConnect(roomId, onConnected) {
  // Create Ably client exactly like the working test page
  MP.ably = new Ably.Realtime({ key: ABLY_KEY, echoMessages: false });
  MP.ch   = MP.ably.channels.get('gc-' + roomId);

  // Subscribe to ALL messages on the channel
  MP.ch.subscribe(function(msg) {
    mpOnMessage(msg.name, msg.data || {});
  });

  // Wait for connected then call onConnected
  MP.ably.connection.on('connected', function() {
    onConnected();
  });

  MP.ably.connection.on('failed', function() {
    showMultiError('⚠ Ably connection failed.');
  });
}

function mpPub(event, data) {
  if (!MP.ch) return;
  MP.ch.publish(event, Object.assign({ from: MP.myName }, data || {}));
}

/* ─── MESSAGE HANDLER ───────────────────── */
function mpOnMessage(event, d) {

  // A player joined the room
  if (event === 'player_joined') {
    const name = d.name || d.from;
    if (name && !MP.players.find(p => p.name === name)) {
      MP.players.push({ name: name });
    }
    if (name !== MP.myName) MP.oppName = name;
    mpRenderWaiting();
    // Host: broadcast current room state back so joiner sees everyone
    if (MP.isHost) {
      mpPub('room_state', {
        players: MP.players.map(p => p.name),
        seed:    MP.seed,
        host:    MP.myName,
      });
    }
  }

  // Host sent room state (received by joiners)
  if (event === 'room_state') {
    MP.players = (d.players || []).map(function(n){ return { name: n }; });
    if (d.host && d.host !== MP.myName) MP.oppName = d.host;
    if (d.seed) MP.seed = d.seed;
    mpRenderWaiting();
    showMultiStatus('Waiting for host to start... (' + MP.players.length + ' in room)');
  }

  // Host started the game
  if (event === 'game_start') {
    if (MP.started) return;
    MP.started = true;
    if (d.seed) MP.seed = d.seed;
    if (d.host && d.host !== MP.myName) MP.oppName = d.host;
    mpCountdown();
  }

  // Opponent answered a question
  if (event === 'answer') {
    if (d.from === myName) return;
    if (d.score  !== undefined) score2  = d.score;
    if (d.streak !== undefined) streak2 = d.streak;
    if (d.from) {
      MP.oppName = d.from;
      var p2 = document.getElementById('p2name');
      if (p2) p2.textContent = d.from;
    }
    updateHUD();
  }

  // Opponent finished the game
  if (event === 'game_done') {
    if (d.from === myName) return;
    MP.oppScore = d.score;
    score2 = d.score;
    if (d.from) MP.oppName = d.from;
    updateHUD();
    if (MP.iDone) mpShowResults();
  }

  // Opponent left
  if (event === 'bye') {
    if (!MP.iDone) {
      showMultiStatus('Opponent disconnected.');
      mode = 'solo';
      var p2row = document.getElementById('p2name');
      var p2hud = p2row ? p2row.closest('.hud-player') : null;
      if (p2hud) p2hud.style.opacity = '0.3';
    } else {
      if (MP.oppScore === null) MP.oppScore = score2;
      mpShowResults();
    }
  }
}

/* ─── WAITING ROOM UI ───────────────────── */
function mpRenderWaiting() {
  // Render player cards
  var el = document.getElementById('mp-player-list');
  if (el) {
    el.innerHTML = MP.players.map(function(p, i) {
      var col = i === 0 ? 'var(--em)' : 'var(--am)';
      var bg  = i === 0 ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)';
      var tag = p.name === MP.myName ? ' (YOU)' : i === 0 ? ' (HOST)' : ' (JOINED ✓)';
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 13px;border:1px solid '+col+';background:'+bg+';">'
        + '<div style="width:30px;height:30px;border:2px solid '+col+';color:'+col+';font-family:var(--px);font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(p.name[0]||'?').toUpperCase()+'</div>'
        + '<div style="flex:1;font-family:var(--px);font-size:8px;color:'+col+';">'+p.name+'<span style="color:var(--txt3);font-size:6px;margin-left:4px;">'+tag+'</span></div>'
        + '<div style="width:7px;height:7px;background:'+col+';border-radius:50%;animation:pulse 1.2s infinite;flex-shrink:0;"></div>'
        + '</div>';
    }).join('');
  }

  // Show host or joiner sections
  var hostSec   = document.getElementById('mp-host-section');
  var joinerSec = document.getElementById('mp-joiner-section');
  var hintSec   = document.getElementById('mp-generic-hint');
  if (hintSec)   hintSec.style.display   = 'none';
  if (hostSec)   hostSec.style.display   = MP.isHost ? 'flex' : 'none';
  if (joinerSec) joinerSec.style.display = MP.isHost ? 'none' : 'block';

  if (MP.isHost) {
    var count  = MP.players.length;
    var btn    = document.getElementById('mp-start-btn');
    var hint   = document.getElementById('mp-start-hint');
    var ready  = count >= 2;
    if (btn) {
      btn.disabled          = !ready;
      btn.style.opacity     = ready ? '1' : '0.4';
      btn.style.pointerEvents = ready ? 'auto' : 'none';
    }
    if (hint) hint.textContent = ready
      ? count + ' players in room — start when ready!'
      : 'Waiting for at least 1 more player to join...';
    showMultiStatus(ready
      ? count + ' players ready!'
      : 'Waiting for players... (' + count + ' in room)');
  }
}

/* ─── HOST START BUTTON ─────────────────── */
function hostStartGame() {
  if (!MP.isHost || MP.players.length < 2) return;
  var btn = document.getElementById('mp-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'STARTING...'; }

  // Broadcast start to everyone — same as test page's doStart()
  mpPub('game_start', { seed: MP.seed, host: MP.myName });

  // Host launches too
  MP.started = true;
  mpCountdown();
}

/* ─── COUNTDOWN + LAUNCH ────────────────── */
function mpCountdown() {
  var n = 3;
  showMultiStatus('Starting in ' + n + '...');
  var iv = setInterval(function() {
    n--;
    if (n > 0) {
      showMultiStatus('Starting in ' + n + '...');
    } else {
      clearInterval(iv);
      mpLaunch();
    }
  }, 1000);
}

function mpLaunch() {
  mode      = 'multi';
  myName    = MP.myName;
  questions = buildQuestionsFromSeed(MP.seed);
  // Derive opponent name from players list if not already set
  if (!MP.oppName) {
    var opp = MP.players.find(function(p){ return p.name !== MP.myName; });
    if (opp) MP.oppName = opp.name;
  }
  showPage('game');
  startGame();
  var p2 = document.getElementById('p2name');
  if (p2) p2.textContent = MP.oppName || 'OPPONENT';
}

/* ─── RESULTS SYNC ──────────────────────── */
function mpNotifyDone() {
  MP.iDone       = true;
  MP.myFinalScore = score1;
  mpPub('game_done', { score: score1 });

  if (MP.oppScore !== null) {
    mpShowResults();
  } else {
    // Show waiting overlay
    hideGamePanels();
    var od = document.getElementById('od-final');
    if (od) od.style.display = 'none';
    var ov = document.getElementById('mp-done-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mp-done-ov';
      ov.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;margin:16px;';
      document.getElementById('page-game').appendChild(ov);
    }
    ov.style.display = 'flex';
    ov.innerHTML = '<div style="font-family:var(--px);font-size:8px;color:var(--am)">DONE</div>'
      + '<div style="font-family:var(--px);font-size:24px;color:var(--em)">' + score1 + ' XP</div>'
      + '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Score locked.</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite;"></div>'
      + '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.oppName || 'opponent') + '...</div></div>';

    // 60s fallback
    setTimeout(function() {
      if (MP.oppScore === null) { MP.oppScore = score2; mpShowResults(); }
    }, 60000);
  }
}

function mpShowResults() {
  var ov = document.getElementById('mp-done-ov');
  if (ov) ov.remove();
  if (MP.oppScore !== null) score2 = MP.oppScore;
  // Make sure opponentName global is set for results page
  if (MP.oppName) {
    try { opponentName = MP.oppName; } catch(e){}
    // Also patch into MP so showResults can use it
    if (typeof MP !== 'undefined') MP.opponentName = MP.oppName;
  }
  var fn = window._origShowResults || window.showResults;
  if (fn) fn();
  setTimeout(mpCleanup, 6000);
}

/* ─── MAIN ENTRY ────────────────────────── */
window.joinOrCreate = function() {
  var playerName = (document.getElementById('pname-input').value.trim() || 'MINER').toUpperCase();
  var roomCode   = document.getElementById('room-input').value.trim().toUpperCase();

  // Reset everything
  mpCleanup();
  MP.myName  = playerName;
  MP.players = [];
  MP.started = false;
  MP.iDone   = false;
  MP.oppScore = null;
  MP.oppName  = null;
  MP.isHost   = false;
  MP.roomId   = null;

  // Reset waiting room UI
  var pl = document.getElementById('mp-player-list');
  if (pl) pl.innerHTML = '';
  ['mp-host-section','mp-joiner-section'].forEach(function(id) {
    var e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });
  var gh = document.getElementById('mp-generic-hint');
  if (gh) gh.style.display = 'block';

  showPage('waiting');
  showMultiStatus('Connecting...');

  if (roomCode) {
    /* ── JOINER ── */
    MP.roomId  = roomCode;
    MP.isHost  = false;
    MP.players = [{ name: playerName }];
    document.getElementById('room-display').textContent = roomCode;

    // Connect using exact same pattern as test page
    mpConnect(roomCode, function() {
      showMultiStatus('Connected! Announcing...');
      mpRenderWaiting();
      // Announce presence — same as test page's pub('join', {name})
      mpPub('player_joined', { name: playerName });
    });

  } else {
    /* ── HOST ── */
    var rid  = 'GL' + Math.floor(1000 + Math.random() * 9000);
    var seed = Math.floor(Math.random() * 1000000);
    MP.roomId  = rid;
    MP.isHost  = true;
    MP.seed    = seed;
    MP.players = [{ name: playerName }];
    document.getElementById('room-display').textContent = rid;

    // Connect using exact same pattern as test page
    mpConnect(rid, function() {
      showMultiStatus('Room ready! Share this code.');
      mpRenderWaiting();
    });
  }
};

/* ─── OVERRIDE SIMULATE ─────────────────── */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') {
    score2  = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random()*20) : -20));
    streak2 = correct ? streak2+1 : 0;
    updateHUD();
  }
};

/* ─── PATCH game.js ─────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  function mpSend(event, extra) {
    if (mode !== 'multi' || !MP.ch) return;
    mpPub(event, extra || {});
  }

  var _sa = window.selectAnswer;
  if (_sa) window.selectAnswer = function(b,c,q,s) {
    _sa(b,c,q,s);
    mpSend('answer', { score: score1, streak: streak1, correct: c });
  };

  var _sb = window.selectBluff;
  if (_sb) window.selectBluff = function(b,i,q) {
    _sb(b,i,q);
    mpSend('answer', { score: score1, streak: streak1, correct: i===q.bluff });
  };

  var _od = window.castODVote;
  if (_od) window.castODVote = function(v) {
    _od(v);
    mpSend('od_vote', { vote: v });
  };

  var _sr = window.showResults;
  if (_sr) {
    window._origShowResults = _sr;
    window.showResults = function() {
      if (mode === 'multi' && MP.ch) mpNotifyDone();
      else _sr();
    };
  }

  window.showFinalResults = mpShowResults;
});

/* ─── CLEANUP ───────────────────────────── */
function mpCleanup() {
  if (MP.ch)   { try { mpPub('bye', {}); } catch(e){} MP.ch.unsubscribe(); }
  if (MP.ably) { try { MP.ably.close(); } catch(e){} }
  MP.ably    = null;
  MP.ch      = null;
  MP.started = false;
  MP.iDone   = false;
}
window.addEventListener('beforeunload', function() { if (MP.roomId) mpCleanup(); });

/* ─── UI HELPERS ────────────────────────── */
function showMultiStatus(msg) {
  var el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = ''; }
}
function showMultiError(msg) {
  var el = document.getElementById('wait-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--rs)'; }
}

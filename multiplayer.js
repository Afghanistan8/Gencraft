/* ════════════════════════════════════════
   GENCRAFT — MULTIPLAYER.JS  (v9 — Clean)
   100% Supabase, no Ably.

   KEY FIX: Was broken by Supabase RLS
   blocking all browser reads/writes.
   RLS is now disabled on rooms table.

   Architecture:
   • Waiting room  → DB poll every 2s
   • In-game sync  → Supabase Realtime Broadcast
════════════════════════════════════════ */

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

/* ── STATE ───────────────────────────── */
const MP = {
  roomId:             null,
  isHost:             false,
  myName:             null,
  myIndex:            0,
  players:            [],
  questionSeed:       null,
  channel:            null,
  isConnected:        false,
  gameStarted:        false,
  pollTimer:          null,
  iFinished:          false,
  opponentFinalScore: null,
  opponentName:       null,
};

/* ── SUPABASE CLIENT ─────────────────── */
function getDB() {
  if (!window._supabaseClient) {
    if (!window.supabase) { showMultiError('Supabase not loaded.'); return null; }
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return window._supabaseClient;
}

/* ── SEEDED SHUFFLE ──────────────────── */
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}
function seededShuffle(arr, seed) {
  const rand = seededRandom(seed), r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function buildQuestionsFromSeed(seed) {
  const base = seededShuffle([...QUESTIONS], seed).slice(0, 16);
  const bluffs = seededShuffle([...BLUFFS], seed + 1).slice(0, 4);
  const out = []; let bi = 0;
  for (let i = 0; i < base.length; i++) {
    out.push(base[i]);
    if ((i + 1) % 4 === 0 && bi < bluffs.length) out.push(bluffs[bi++]);
  }
  return out.slice(0, 20);
}

/* ── ROOM CREATION ───────────────────── */
async function createRoom(playerName) {
  const db = getDB();
  if (!db) return null;

  const roomId       = 'GL' + Math.floor(1000 + Math.random() * 9000);
  const questionSeed = Math.floor(Math.random() * 1000000);
  const players      = [{ name: playerName, score: 0, finished: false }];

  const { error } = await db.from('rooms').insert({
    id:            roomId,
    player1_name:  playerName,
    status:        'waiting',
    question_seed: questionSeed,
    players:       JSON.stringify(players),
  });

  if (error) { console.error('[MP] createRoom:', error); showMultiError('DB error: ' + error.message); return null; }

  MP.roomId       = roomId;
  MP.isHost       = true;
  MP.myName       = playerName;
  MP.myIndex      = 0;
  MP.questionSeed = questionSeed;
  MP.players      = players;
  return roomId;
}

/* ── ROOM JOINING ────────────────────── */
async function joinRoom(roomId, playerName) {
  const db = getDB();
  if (!db) return { ok: false, msg: 'Not connected to database.' };

  const { data: room, error } = await db.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) { console.error('[MP] joinRoom fetch:', error); return { ok: false, msg: 'DB error: ' + error.message }; }
  if (!room)  return { ok: false, msg: 'Room "' + roomId + '" not found.' };
  if (room.status === 'finished') return { ok: false, msg: 'That game already finished.' };
  if (room.status === 'starting' || room.status === 'active') return { ok: false, msg: 'Game already started.' };

  let players = [];
  try { players = JSON.parse(room.players || '[]'); } catch(e) {}
  if (players.find(p => p.name === playerName)) playerName = playerName + players.length;
  players.push({ name: playerName, score: 0, finished: false });

  const { error: updErr } = await db.from('rooms')
    .update({ players: JSON.stringify(players), player2_name: playerName })
    .eq('id', roomId);
  if (updErr) { console.error('[MP] joinRoom update:', updErr); return { ok: false, msg: 'Could not join: ' + updErr.message }; }

  MP.roomId       = roomId;
  MP.isHost       = false;
  MP.myName       = playerName;
  MP.myIndex      = players.length - 1;
  MP.questionSeed = room.question_seed;
  MP.players      = players;
  MP.opponentName = room.player1_name;
  return { ok: true };
}

/* ── FETCH ROOM ──────────────────────── */
async function fetchRoom() {
  const db = getDB();
  if (!db || !MP.roomId) return null;
  const { data, error } = await db.from('rooms').select('*').eq('id', MP.roomId).maybeSingle();
  if (error) { console.warn('[MP] fetchRoom:', error.message); return null; }
  return data;
}

/* ── RENDER PLAYER LIST ──────────────── */
function renderPlayers(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;
  el.innerHTML = players.map((p, i) => {
    const isMe  = (i === MP.myIndex);
    const color = i === 0 ? 'var(--em)' : 'var(--am)';
    const lbl   = isMe ? '(YOU)' : (i === 0 ? '(HOST)' : '(JOINED)');
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
      border:1px solid ${color};background:${i===0?'rgba(74,222,128,.06)':'rgba(251,191,36,.06)'};">
      <div style="width:26px;height:26px;border:2px solid ${color};color:${color};
        font-family:var(--px);font-size:9px;display:flex;align-items:center;justify-content:center;">
        ${p.name[0]}</div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${color}">${p.name} <span style="opacity:.6">${lbl}</span></div>
      <div style="width:7px;height:7px;border-radius:50%;background:${color};animation:pulse 1.2s infinite"></div>
    </div>`;
  }).join('');
}

/* ── UPDATE HOST START BUTTON ────────── */
function updateHostStartBtn(playerCount) {
  const btn  = document.getElementById('mp-start-btn');
  const hint = document.getElementById('mp-start-hint');
  const wrap = document.getElementById('mp-start-wrap');
  if (!btn || !wrap) return;

  // Always visible for host
  wrap.style.display = 'block';

  if (playerCount >= 2) {
    btn.disabled      = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    if (hint) { hint.textContent = (playerCount - 1) + ' player(s) ready — start whenever!'; hint.style.color = 'var(--em)'; }
  } else {
    btn.disabled      = true;
    btn.style.opacity = '0.35';
    btn.style.cursor  = 'not-allowed';
    if (hint) { hint.textContent = 'Waiting for at least 1 more player...'; hint.style.color = 'var(--txt3)'; }
  }
}

/* ── POLL WAITING ROOM ───────────────── */
function startWaitingPoll() {
  stopWaitingPoll();
  MP.pollTimer = setInterval(async () => {
    const room = await fetchRoom();
    if (!room) return;

    let players = [];
    try { players = JSON.parse(room.players || '[]'); } catch(e) {}
    MP.players = players;
    renderPlayers(players);

    // Update count badge
    const countEl = document.getElementById('mp-count-num');
    if (countEl) countEl.textContent = players.length;

    if (MP.isHost) {
      updateHostStartBtn(players.length);
      if (players.length <= 1) {
        showMultiStatus('Waiting for players to join...');
      } else {
        showMultiStatus(players.length + ' players in room — click START when ready!');
      }
    } else {
      showMultiStatus('Waiting for host to start... (' + players.length + ' in room)');
    }

    // ── Detect game start ──
    if (room.status === 'starting' && !MP.gameStarted) {
      MP.gameStarted  = true;
      MP.questionSeed = room.question_seed;
      stopWaitingPoll();
      if (players.length >= 2) {
        MP.opponentName = (players.find((_, i) => i !== MP.myIndex) || {}).name || 'OPPONENT';
      }
      let c = 3;
      showMultiStatus('Starting in ' + c + '...');
      const iv = setInterval(() => {
        c--;
        if (c > 0) { showMultiStatus('Starting in ' + c + '...'); }
        else { clearInterval(iv); connectBroadcast(); launchGame(); }
      }, 1000);
    }

    if (room.status === 'finished' && !MP.gameStarted) {
      stopWaitingPoll();
      showMultiError('Room was closed.');
    }
  }, 2000);
}

function stopWaitingPoll() {
  if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = null; }
}

/* ── HOST STARTS GAME ────────────────── */
window.hostStartGame = async function() {
  if (!MP.isHost || MP.gameStarted) return;
  const btn = document.getElementById('mp-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'STARTING...'; }

  const db = getDB();
  if (db) {
    const { error } = await db.from('rooms')
      .update({ status: 'starting', question_seed: MP.questionSeed })
      .eq('id', MP.roomId);
    if (error) { console.error('[MP] hostStartGame:', error); showMultiError('Could not start: ' + error.message); return; }
  }

  // Immediately launch for host without waiting for next poll
  MP.gameStarted = true;
  stopWaitingPoll();
  if (MP.players.length >= 2) {
    MP.opponentName = (MP.players.find((_, i) => i !== 0) || {}).name || 'OPPONENT';
  }
  let c = 3;
  showMultiStatus('Starting in ' + c + '...');
  const iv = setInterval(() => {
    c--;
    if (c > 0) { showMultiStatus('Starting in ' + c + '...'); }
    else { clearInterval(iv); connectBroadcast(); launchGame(); }
  }, 1000);
};

/* ── BROADCAST (in-game) ─────────────── */
function connectBroadcast() {
  const db = getDB();
  if (!db) return;
  const ch = db.channel('gc-game-' + MP.roomId, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: '*' }, ({ event, payload }) => onBroadcast(event, payload));
  ch.subscribe(s => { if (s === 'SUBSCRIBED') MP.isConnected = true; });
  MP.channel = ch;
}
function broadcast(event, payload) {
  if (MP.channel && MP.isConnected) MP.channel.send({ type: 'broadcast', event, payload: payload || {} });
}

function onBroadcast(event, data) {
  if (event === 'answer' && data.player_index !== MP.myIndex) {
    score2 = data.new_score; streak2 = data.streak || 0;
    if (data.player_name) { MP.opponentName = data.player_name; const el = document.getElementById('p2name'); if (el) el.textContent = data.player_name; }
    updateHUD();
  }
  if (event === 'game_finished' && data.player_index !== MP.myIndex) {
    MP.opponentFinalScore = data.final_score;
    if (data.player_name) MP.opponentName = data.player_name;
    score2 = data.final_score; updateHUD();
    if (MP.iFinished) doShowFinalResults();
  }
  if (event === 'disconnect') {
    if (!MP.iFinished) { showMultiStatus('Opponent disconnected.'); mode = 'solo'; const p2 = document.getElementById('p2name')?.closest('.hud-player'); if (p2) p2.style.opacity = '.4'; }
    else if (MP.opponentFinalScore === null) { MP.opponentFinalScore = score2; doShowFinalResults(); }
  }
}

/* ── GAME RESULTS SYNC ───────────────── */
function notifyIFinished() {
  MP.iFinished = true; MP.myFinalScore = score1;
  broadcast('game_finished', { final_score: score1, player_name: myName, player_index: MP.myIndex });
  saveFinalScore(score1);
  if (MP.opponentFinalScore !== null) doShowFinalResults();
  else showWaitingForOpponent();
}

async function saveFinalScore(sc) {
  const db = getDB(); if (!db || !MP.roomId) return;
  const room = await fetchRoom(); if (!room) return;
  let ps = []; try { ps = JSON.parse(room.players || '[]'); } catch(e) {}
  if (ps[MP.myIndex]) { ps[MP.myIndex].score = sc; ps[MP.myIndex].finished = true; }
  await db.from('rooms').update({ players: JSON.stringify(ps) }).eq('id', MP.roomId);
}

function showWaitingForOpponent() {
  hideGamePanels();
  const od = document.getElementById('od-final'); if (od) od.style.display = 'none';
  let ov = document.getElementById('waiting-for-opponent');
  if (!ov) { ov = document.createElement('div'); ov.id = 'waiting-for-opponent'; ov.style.cssText = 'padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;'; document.getElementById('page-game').appendChild(ov); }
  ov.style.display = 'flex';
  ov.innerHTML = '<div style="font-family:var(--px);font-size:8px;color:var(--am)">GAME COMPLETE</div>'
    + '<div style="font-family:var(--px);font-size:22px;color:var(--em)">' + score1 + ' XP</div>'
    + '<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Your score is locked in.</div>'
    + '<div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>'
    + '<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for ' + (MP.opponentName || 'opponent') + '...</div></div>';
  setTimeout(() => { if (MP.opponentFinalScore === null) { MP.opponentFinalScore = score2; doShowFinalResults(); } }, 60000);
}

function doShowFinalResults() {
  document.getElementById('waiting-for-opponent')?.remove();
  if (MP.opponentFinalScore !== null) score2 = MP.opponentFinalScore;
  (window._originalShowResults || showResults)();
  setTimeout(() => cleanupMP(), 5000);
}

/* ── LAUNCH GAME ─────────────────────── */
function launchGame() {
  mode = 'multi'; myName = MP.myName;
  questions = buildQuestionsFromSeed(MP.questionSeed);
  showPage('game'); startGame();
  const p2el = document.getElementById('p2name');
  if (p2el) p2el.textContent = MP.opponentName || 'OPPONENT';
}

/* ── OVERRIDE joinOrCreate ───────────── */
window.joinOrCreate = async function() {
  const pname  = (document.getElementById('pname-input').value.trim() || 'MINER').toUpperCase();
  const code   = document.getElementById('room-input').value.trim().toUpperCase();

  // Go to waiting page
  showPage('waiting');

  // Reset waiting room UI (clear content only, never remove elements)
  showMultiStatus('Connecting...');
  const listEl = document.getElementById('mp-player-list'); if (listEl) listEl.innerHTML = '';
  const wrap = document.getElementById('mp-start-wrap'); if (wrap) wrap.style.display = 'none';
  const countEl = document.getElementById('mp-count-num'); if (countEl) countEl.textContent = '...';

  if (code) {
    /* ─── JOINER ─── */
    document.getElementById('room-display').textContent = code;
    showMultiStatus('Looking up room ' + code + '...');
    const res = await joinRoom(code, pname);
    if (!res.ok) { showMultiError(res.msg); return; }
    showMultiStatus('Joined! Waiting for host to start...');
    renderPlayers(MP.players);
    if (countEl) countEl.textContent = MP.players.length;
    startWaitingPoll();

  } else {
    /* ─── HOST ─── */
    showMultiStatus('Creating room...');
    const roomId = await createRoom(pname);
    if (!roomId) return;
    document.getElementById('room-display').textContent = roomId;
    showMultiStatus('Share the code! Waiting for players...');
    renderPlayers(MP.players);
    if (countEl) countEl.textContent = '1';
    updateHostStartBtn(1); // Show disabled button immediately
    startWaitingPoll();
  }
};

/* ── PATCH game.js ───────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  const _sa = window.selectAnswer;
  if (_sa) window.selectAnswer = function(btn, correct, q, shuffled) {
    _sa(btn, correct, q, shuffled);
    if (mode === 'multi' && MP.isConnected) broadcast('answer', { new_score: score1, correct, streak: streak1, player_name: myName, player_index: MP.myIndex });
  };

  const _sb = window.selectBluff;
  if (_sb) window.selectBluff = function(btn, origIndex, q) {
    _sb(btn, origIndex, q);
    if (mode === 'multi' && MP.isConnected) broadcast('answer', { new_score: score1, correct: origIndex === q.bluff, streak: streak1, player_name: myName, player_index: MP.myIndex });
  };

  const _od = window.castODVote;
  if (_od) window.castODVote = function(vote) {
    _od(vote);
    if (mode === 'multi' && MP.isConnected) broadcast('od_vote', { vote });
  };

  const _sr = window.showResults;
  if (_sr) {
    window._originalShowResults = _sr;
    window.showResults = function() {
      if (mode === 'multi' && MP.channel) notifyIFinished();
      else _sr();
    };
  }

  window.showFinalResults = doShowFinalResults;
});

/* ── SIMULATE OPPONENT (solo mode) ──── */
window.simulateOpponentAnswer = function(correct) {
  if (mode !== 'multi') { score2 = Math.max(0, score2 + (correct ? 65 + Math.floor(Math.random() * 20) : -20)); streak2 = correct ? streak2 + 1 : 0; updateHUD(); }
};

/* ── CLEANUP ─────────────────────────── */
function cleanupMP() {
  stopWaitingPoll();
  if (MP.channel) { broadcast('disconnect', {}); getDB()?.removeChannel(MP.channel); MP.channel = null; }
  if (MP.roomId) getDB()?.from('rooms').update({ status: 'finished' }).eq('id', MP.roomId);
  Object.assign(MP, { isConnected: false, gameStarted: false, iFinished: false, opponentFinalScore: null, myFinalScore: null });
}
window.addEventListener('beforeunload', () => { if (MP.isConnected || MP.pollTimer) cleanupMP(); });

/* ── UI HELPERS ──────────────────────── */
function showMultiStatus(msg) { const el = document.getElementById('wait-msg'); if (el) { el.textContent = msg; el.style.color = ''; } }
function showMultiError(msg)  { const el = document.getElementById('wait-msg'); if (el) { el.textContent = '⚠ ' + msg; el.style.color = 'var(--rs)'; } }

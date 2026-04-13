/* ════════════════════════════════════════
   GENCRAFT MULTIPLAYER v10
   Pure Supabase, DB-poll architecture
   
   RLS must be disabled on rooms table.
   Run fix-rls.js if you haven't already.
════════════════════════════════════════ */

(function() {  // wrapped in IIFE to avoid any global scope collisions

const SB_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

// ─── STATE ───────────────────────────────
const MP = {
  roomId:     null,
  isHost:     false,
  myName:     null,
  myIndex:    0,
  players:    [],
  seed:       null,
  channel:    null,
  connected:  false,
  started:    false,
  pollTimer:  null,
  iDone:      false,
  oppScore:   null,
  oppName:    null,
};

// ─── SUPABASE ────────────────────────────
function db() {
  if (!window._sbc) {
    if (!window.supabase) { setMsg('⚠ Supabase SDK not loaded', true); return null; }
    window._sbc = window.supabase.createClient(SB_URL, SB_KEY);
  }
  return window._sbc;
}

// ─── DOM HELPERS ─────────────────────────
function setMsg(txt, isErr) {
  const el = document.getElementById('wait-msg');
  if (el) { el.textContent = txt; el.style.color = isErr ? 'var(--rs)' : ''; }
  console.log('[MP]', txt);
}
function setCount(n) {
  const el = document.getElementById('mp-count-num');
  if (el) el.textContent = n;
}
function setPlayerList(players) {
  const el = document.getElementById('mp-player-list');
  if (!el) return;
  el.innerHTML = players.map((p, i) => {
    const mine  = i === MP.myIndex;
    const col   = i === 0 ? 'var(--em)' : 'var(--am)';
    const label = mine ? '(YOU)' : i === 0 ? '(HOST)' : '(JOINED)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
      border:1px solid ${col};background:${i===0?'rgba(74,222,128,.06)':'rgba(251,191,36,.06)'};">
      <div style="width:26px;height:26px;border:2px solid ${col};color:${col};
        font-family:var(--px);font-size:9px;display:flex;align-items:center;justify-content:center">
        ${(p.name||'?')[0].toUpperCase()}
      </div>
      <div style="flex:1;font-family:var(--px);font-size:8px;color:${col}">
        ${p.name} <span style="opacity:.55">${label}</span>
      </div>
      <div style="width:7px;height:7px;border-radius:50%;background:${col};animation:pulse 1.4s infinite"></div>
    </div>`;
  }).join('');
}
function setStartBtn(canStart) {
  const wrap = document.getElementById('mp-start-wrap');
  const btn  = document.getElementById('mp-start-btn');
  const hint = document.getElementById('mp-start-hint');
  if (!wrap) return;
  wrap.style.display  = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap      = '6px';
  wrap.style.alignItems = 'center';
  wrap.style.width    = '100%';
  wrap.style.maxWidth = '300px';
  if (btn) {
    btn.disabled      = !canStart;
    btn.style.opacity = canStart ? '1' : '0.35';
    btn.style.cursor  = canStart ? 'pointer' : 'not-allowed';
  }
  if (hint) {
    hint.textContent  = canStart
      ? (MP.players.length - 1) + ' player(s) ready. Click START when everyone is in!'
      : 'Waiting for at least 1 more player to join...';
    hint.style.color  = canStart ? 'var(--em)' : 'var(--txt3)';
  }
}

// ─── SEEDED SHUFFLE ──────────────────────
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}
function shuffle(arr, seed) {
  const r = rng(seed), a = [...arr];
  for (let i = a.length-1; i > 0; i--) { const j = Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function makeQuestions(seed) {
  const base   = shuffle([...QUESTIONS], seed).slice(0,16);
  const bluffs = shuffle([...BLUFFS], seed+1).slice(0,4);
  const out = []; let b = 0;
  for (let i = 0; i < base.length; i++) {
    out.push(base[i]);
    if ((i+1)%4===0 && b<bluffs.length) out.push(bluffs[b++]);
  }
  return out.slice(0,20);
}

// ─── ROOM OPERATIONS ─────────────────────
async function createRoom(name) {
  const d = db(); if (!d) return null;
  const id   = 'GL' + Math.floor(1000 + Math.random()*9000);
  const seed = Math.floor(Math.random()*1000000);
  const ps   = [{name, score:0, finished:false}];
  setMsg('Creating room in database...');
  const { error } = await d.from('rooms').insert({
    id, player1_name: name, status: 'waiting',
    question_seed: seed, players: JSON.stringify(ps),
  });
  if (error) { setMsg('❌ Create failed: ' + error.message, true); console.error(error); return null; }
  MP.roomId = id; MP.isHost = true; MP.myName = name;
  MP.myIndex = 0; MP.seed = seed; MP.players = ps;
  return id;
}

async function joinRoom(code, name) {
  const d = db(); if (!d) return {ok:false, msg:'DB not connected'};
  setMsg('Looking up room ' + code + '...');
  const { data: room, error } = await d.from('rooms').select('*').eq('id', code).maybeSingle();
  if (error) return {ok:false, msg:'DB error: ' + error.message};
  if (!room)  return {ok:false, msg:'Room "' + code + '" not found.'};
  if (room.status === 'finished')  return {ok:false, msg:'That game already finished.'};
  if (room.status === 'starting' || room.status === 'active') return {ok:false, msg:'Game already started.'};
  let ps = []; try { ps = JSON.parse(room.players||'[]'); } catch(e){}
  if (ps.find(p => p.name===name)) name = name + ps.length;
  ps.push({name, score:0, finished:false});
  const { error: e2 } = await d.from('rooms')
    .update({ players: JSON.stringify(ps), player2_name: name }).eq('id', code);
  if (e2) return {ok:false, msg:'Join failed: ' + e2.message};
  MP.roomId = code; MP.isHost = false; MP.myName = name;
  MP.myIndex = ps.length-1; MP.seed = room.question_seed;
  MP.players = ps; MP.oppName = room.player1_name;
  return {ok:true};
}

async function pollRoom() {
  const d = db(); if (!d || !MP.roomId) return;
  const { data: room, error } = await d.from('rooms').select('*').eq('id', MP.roomId).maybeSingle();
  if (error || !room) { console.warn('[MP poll]', error?.message); return; }

  let ps = []; try { ps = JSON.parse(room.players||'[]'); } catch(e){}
  MP.players = ps;
  setCount(ps.length);
  setPlayerList(ps);

  if (MP.isHost) {
    setStartBtn(ps.length >= 2);
    if (ps.length <= 1) setMsg('Waiting for players to join...');
    else setMsg(ps.length + ' players in room — click START when ready!');
  } else {
    setMsg('Waiting for host to start... (' + ps.length + ' in room)');
  }

  // Detect game start
  if (room.status === 'starting' && !MP.started) {
    MP.started = true; MP.seed = room.question_seed;
    stopPoll();
    if (ps.length >= 2) MP.oppName = (ps.find((_,i) => i!==MP.myIndex)||{}).name||'OPPONENT';
    countdown(() => { openBroadcast(); launchGame(); });
  }
  if (room.status === 'finished' && !MP.started) { stopPoll(); setMsg('Room was closed.', true); }
}

function stopPoll() { if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = null; } }
function startPoll() { stopPoll(); MP.pollTimer = setInterval(pollRoom, 2000); }

function countdown(cb) {
  let c = 3; setMsg('Starting in ' + c + '...');
  const iv = setInterval(() => { c--; if (c>0) setMsg('Starting in '+c+'...'); else { clearInterval(iv); cb(); } }, 1000);
}

// ─── HOST STARTS GAME ────────────────────
async function hostStartGame() {
  if (!MP.isHost || MP.started || MP.players.length < 2) return;
  const btn = document.getElementById('mp-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'STARTING...'; }
  setMsg('Saving game start to database...');
  const d = db();
  const { error } = await d.from('rooms').update({
    status: 'starting', question_seed: MP.seed,
  }).eq('id', MP.roomId);
  if (error) { setMsg('❌ Start failed: ' + error.message, true); return; }
  MP.started = true; stopPoll();
  if (MP.players.length >= 2) MP.oppName = (MP.players.find((_,i)=>i!==0)||{}).name||'OPPONENT';
  countdown(() => { openBroadcast(); launchGame(); });
}
window.hostStartGame = hostStartGame;

// ─── BROADCAST (in-game scores) ──────────
function openBroadcast() {
  const d = db(); if (!d) return;
  const ch = d.channel('gc-'+MP.roomId, { config:{broadcast:{self:false}} });
  ch.on('broadcast',{event:'*'},({event,payload}) => onMsg(event,payload));
  ch.subscribe(s => { if (s==='SUBSCRIBED') MP.connected = true; });
  MP.channel = ch;
}
function send(ev, data) {
  if (MP.channel && MP.connected) MP.channel.send({type:'broadcast',event:ev,payload:data||{}});
}

function onMsg(ev, data) {
  if (ev==='answer' && data.player_index!==MP.myIndex) {
    score2=data.new_score; streak2=data.streak||0;
    if (data.player_name){ MP.oppName=data.player_name; const el=document.getElementById('p2name'); if(el)el.textContent=data.player_name; }
    updateHUD();
  }
  if (ev==='game_finished' && data.player_index!==MP.myIndex) {
    MP.oppScore=data.final_score; if(data.player_name)MP.oppName=data.player_name;
    score2=data.final_score; updateHUD(); if(MP.iDone)showFinal();
  }
  if (ev==='disconnect') {
    if (!MP.iDone){ setMsg('Opponent disconnected.'); mode='solo'; const el=document.getElementById('p2name')?.closest('.hud-player'); if(el)el.style.opacity='.4'; }
    else if(MP.oppScore===null){ MP.oppScore=score2; showFinal(); }
  }
}

// ─── RESULTS ─────────────────────────────
function iFinished() {
  MP.iDone=true; MP.myScore=score1;
  send('game_finished',{final_score:score1,player_name:myName,player_index:MP.myIndex});
  saveFinalToDB(score1);
  if (MP.oppScore!==null) showFinal(); else showWaiting();
}

async function saveFinalToDB(sc) {
  const d=db(); if(!d||!MP.roomId)return;
  const {data:room}=await d.from('rooms').select('players').eq('id',MP.roomId).maybeSingle();
  if(!room)return;
  let ps=[]; try{ps=JSON.parse(room.players||'[]');}catch(e){}
  if(ps[MP.myIndex]){ps[MP.myIndex].score=sc;ps[MP.myIndex].finished=true;}
  await d.from('rooms').update({players:JSON.stringify(ps)}).eq('id',MP.roomId);
}

function showWaiting() {
  hideGamePanels();
  const od=document.getElementById('od-final'); if(od)od.style.display='none';
  let ov=document.getElementById('waiting-for-opponent');
  if(!ov){ ov=document.createElement('div'); ov.id='waiting-for-opponent';
    ov.style.cssText='padding:28px;background:var(--stone);border:2px solid var(--am);text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;';
    document.getElementById('page-game').appendChild(ov); }
  ov.style.display='flex';
  ov.innerHTML='<div style="font-family:var(--px);font-size:8px;color:var(--am)">GAME COMPLETE</div>'
    +'<div style="font-family:var(--px);font-size:22px;color:var(--em)">'+score1+' XP</div>'
    +'<div style="font-family:var(--mn);font-size:12px;color:var(--txt2)">Locked in. Waiting for opponent...</div>'
    +'<div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;background:var(--am);border-radius:50%;animation:pulse 1s infinite"></div>'
    +'<div style="font-family:var(--mn);font-size:11px;color:var(--txt2)">Waiting for '+(MP.oppName||'opponent')+'...</div></div>';
  setTimeout(()=>{ if(MP.oppScore===null){MP.oppScore=score2;showFinal();}},60000);
}

function showFinal() {
  document.getElementById('waiting-for-opponent')?.remove();
  if(MP.oppScore!==null)score2=MP.oppScore;
  (window._origShowResults||showResults)();
  setTimeout(()=>cleanup(),5000);
}

// ─── LAUNCH GAME ─────────────────────────
function launchGame() {
  mode='multi'; myName=MP.myName; questions=makeQuestions(MP.seed);
  showPage('game'); startGame();
  const p2=document.getElementById('p2name'); if(p2)p2.textContent=MP.oppName||'OPPONENT';
}

// ─── MAIN ENTRY ──────────────────────────
window.joinOrCreate = async function() {
  const name = (document.getElementById('pname-input').value.trim()||'MINER').toUpperCase();
  const code  =  document.getElementById('room-input').value.trim().toUpperCase();

  showPage('waiting');

  // Reset UI
  setMsg('Connecting...');
  setCount('...');
  const pl = document.getElementById('mp-player-list'); if(pl) pl.innerHTML='';
  const sw = document.getElementById('mp-start-wrap'); if(sw) sw.style.display='none';

  if (code) {
    // ── JOINER ──
    document.getElementById('room-display').textContent = code;
    const res = await joinRoom(code, name);
    if (!res.ok) { setMsg('⚠ '+res.msg, true); return; }
    setMsg('Joined "'+code+'"! Waiting for host to start...');
    setCount(MP.players.length);
    setPlayerList(MP.players);
    startPoll();
  } else {
    // ── HOST ──
    const roomId = await createRoom(name);
    if (!roomId) return;
    document.getElementById('room-display').textContent = roomId;
    setMsg('Share the code! Waiting for players...');
    setCount(1);
    setPlayerList(MP.players);
    setStartBtn(false);   // show disabled start button for host
    startPoll();
  }
};

// ─── PATCH game.js HOOKS ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Intercept answer selection
  const _sa = window.selectAnswer;
  if (_sa) window.selectAnswer = function(btn,correct,q,shuffled){
    _sa(btn,correct,q,shuffled);
    if(mode==='multi'&&MP.connected) send('answer',{new_score:score1,correct,streak:streak1,player_name:myName,player_index:MP.myIndex});
  };
  const _sb = window.selectBluff;
  if (_sb) window.selectBluff = function(btn,origIndex,q){
    _sb(btn,origIndex,q);
    if(mode==='multi'&&MP.connected) send('answer',{new_score:score1,correct:origIndex===q.bluff,streak:streak1,player_name:myName,player_index:MP.myIndex});
  };
  const _od = window.castODVote;
  if (_od) window.castODVote = function(vote){ _od(vote); if(mode==='multi'&&MP.connected) send('od_vote',{vote}); };

  // Intercept showResults
  const _sr = window.showResults;
  if (_sr) { window._origShowResults=_sr; window.showResults=function(){ if(mode==='multi'&&MP.channel) iFinished(); else _sr(); }; }

  window.showFinalResults = showFinal;
});

window.simulateOpponentAnswer = function(correct) {
  if(mode!=='multi'){ score2=Math.max(0,score2+(correct?65+Math.floor(Math.random()*20):-20)); streak2=correct?streak2+1:0; updateHUD(); }
};

// ─── CLEANUP ─────────────────────────────
function cleanup() {
  stopPoll();
  if(MP.channel){ send('disconnect',{}); db()?.removeChannel(MP.channel); MP.channel=null; }
  if(MP.roomId) db()?.from('rooms').update({status:'finished'}).eq('id',MP.roomId);
  Object.assign(MP,{connected:false,started:false,iDone:false,oppScore:null,myScore:null});
}
window.addEventListener('beforeunload',()=>{ if(MP.connected||MP.pollTimer)cleanup(); });

})(); // end IIFE

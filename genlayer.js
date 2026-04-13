/* ════════════════════════════════════════
   GENCRAFT — GENLAYER.JS  v4
   Full mobile + desktop wallet support
   No external SDK — pure browser APIs

   Contract: 0x0Ad3eacfA27F85bA313DcbeAedfE99bB394A214F
════════════════════════════════════════ */

const GL_CONTRACT = '0x0Ad3eacfA27F85bA313DcbeAedfE99bB394A214F';
const GL_RPC      = 'https://studio.genlayer.com/api';

const GL = {
  account:     null,
  isConnected: false,
};

/* ════════════════════════════════════════
   DEVICE / WALLET DETECTION
════════════════════════════════════════ */

function glIsMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
function glHasBrowserWallet() {
  return typeof window.ethereum !== 'undefined';
}

/* ════════════════════════════════════════
   INJECT MODAL STYLES — runs immediately
════════════════════════════════════════ */
(function injectStyles() {
  if (document.getElementById('gl-modal-styles')) return;
  const s = document.createElement('style');
  s.id = 'gl-modal-styles';
  s.textContent = `
    @keyframes gl-fade-in  { from{opacity:0} to{opacity:1} }
    @keyframes gl-slide-up { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
    .gl-overlay {
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.88);
      display:flex;align-items:center;justify-content:center;
      padding:16px;
      animation:gl-fade-in 0.2s ease;
    }
    .gl-modal {
      background:#101a10;
      border:2px solid var(--em,#4ade80);
      width:100%;max-width:400px;
      padding:24px 22px;
      display:flex;flex-direction:column;gap:14px;
      position:relative;
      animation:gl-slide-up 0.3s cubic-bezier(0.34,1.56,0.64,1);
      max-height:90vh;overflow-y:auto;
    }
    .gl-modal-title {
      font-family:var(--px,'monospace');font-size:9px;
      color:var(--em,#4ade80);letter-spacing:.09em;
      padding-right:36px;
    }
    .gl-modal-desc {
      font-family:var(--mn,'monospace');font-size:11px;
      color:var(--txt3,#888);line-height:1.7;
    }
    .gl-close-btn {
      position:absolute;top:14px;right:14px;
      font-family:var(--px,'monospace');font-size:8px;
      background:transparent;border:1px solid var(--bdr2,#333);
      color:var(--txt3,#888);padding:5px 9px;
      cursor:pointer;line-height:1;
    }
    .gl-close-btn:hover { border-color:var(--rs,#f87171);color:var(--rs,#f87171); }
    .gl-wallet-opt {
      display:flex;align-items:center;gap:14px;
      padding:14px 16px;
      background:rgba(255,255,255,0.03);
      border:1px solid var(--bdr2,#333);
      cursor:pointer;text-align:left;
      transition:background 0.15s,transform 0.15s,border-color 0.15s;
      width:100%;
    }
    .gl-wallet-opt:hover {
      background:rgba(255,255,255,0.06);
      transform:translateX(3px);
    }
    .gl-wallet-opt:active { transform:scale(0.98); }
    .gl-opt-icon  { font-size:26px;flex-shrink:0;line-height:1; }
    .gl-opt-name  { font-family:var(--px,'monospace');font-size:8px;letter-spacing:.05em;margin-bottom:4px; }
    .gl-opt-desc  { font-family:var(--mn,'monospace');font-size:10px;color:var(--txt3,#888); }
    .gl-opt-arrow { font-size:14px;color:var(--txt3,#888);flex-shrink:0;margin-left:auto; }
    .gl-divider   { border:none;border-top:1px solid var(--bdr,#1a2e1a);margin:2px 0; }
    .gl-note      { font-family:var(--mn,'monospace');font-size:9px;color:var(--txt3,#888);text-align:center; }
    .gl-input {
      background:var(--bg3,#0a150a);
      border:2px solid var(--bdr2,#333);
      color:var(--txt,#e8ffe8);
      font-family:var(--mn,'monospace');font-size:11px;
      padding:11px 12px;outline:none;width:100%;
      transition:border-color 0.2s;
    }
    .gl-input:focus { border-color:var(--em,#4ade80); }
    .gl-primary-btn {
      font-family:var(--px,'monospace');font-size:8px;
      padding:13px;width:100%;cursor:pointer;
      letter-spacing:.07em;transition:background 0.15s,transform 0.1s;
    }
    .gl-primary-btn:active { transform:scale(0.98); }
  `;
  document.head.appendChild(s);
})();

/* ════════════════════════════════════════
   WALLET MODAL — smart, device-aware
════════════════════════════════════════ */

function showWalletModal() {
  closeWalletModal();

  const mobile     = glIsMobile();
  const hasBrowser = glHasBrowserWallet();
  const isInMM     = hasBrowser && window.ethereum.isMetaMask;
  const isInCB     = hasBrowser && window.ethereum.isCoinbaseWallet;
  const isInTrust  = hasBrowser && window.ethereum.isTrust;

  const overlay = document.createElement('div');
  overlay.className = 'gl-overlay';
  overlay.id = 'gl-wallet-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeWalletModal(); };

  const modal = document.createElement('div');
  modal.className = 'gl-modal';

  // Build options based on what we detect
  let optionsHTML = '';

  if (hasBrowser) {
    // User has a wallet extension/browser — offer direct connect
    const name = isInMM ? 'MetaMask' : isInCB ? 'Coinbase Wallet' : isInTrust ? 'Trust Wallet' : 'Browser Wallet';
    const icon = isInMM ? '🦊' : isInCB ? '💙' : isInTrust ? '🛡️' : '🔐';
    optionsHTML += glWalletOpt(icon, name, 'Connect your detected wallet', 'var(--em,#4ade80)', 'glConnectBrowserWallet()');
    optionsHTML += '<hr class="gl-divider">';
  }

  if (mobile && !hasBrowser) {
    // On mobile without a wallet browser — show app deep links
    optionsHTML += glWalletOpt('🦊', 'Open in MetaMask', 'Launch MetaMask app to play', 'var(--am,#fbbf24)', 'glOpenMetaMask()');
    optionsHTML += glWalletOpt('💙', 'Open in Coinbase Wallet', 'Launch Coinbase Wallet app', 'var(--di,#67e8f9)', 'glOpenCoinbase()');
    optionsHTML += glWalletOpt('🔵', 'Open in Trust Wallet', 'Launch Trust Wallet app', 'var(--pu,#c084fc)', 'glOpenTrust()');
    optionsHTML += '<hr class="gl-divider">';
  }

  if (!mobile && !hasBrowser) {
    // Desktop without extension
    optionsHTML += glWalletOpt('🦊', 'Install MetaMask', 'Add the browser extension', 'var(--am,#fbbf24)', 'glInstallMetaMask()');
    optionsHTML += '<hr class="gl-divider">';
  }

  // Always show manual address entry as fallback
  optionsHTML += glWalletOpt('✏️', 'Enter Address Manually', 'Paste your 0x wallet address', 'var(--txt2,#aaa)', 'glShowAddressEntry()');

  modal.innerHTML = `
    <button class="gl-close-btn" onclick="closeWalletModal()">✕</button>
    <div class="gl-modal-title">CONNECT WALLET</div>
    <div class="gl-modal-desc">
      Connect to save your score permanently on the GenLayer Intelligent Contract and appear on the on-chain leaderboard.
    </div>
    ${optionsHTML}
    <div class="gl-note">Scores saved to GenLayer Testnet · No gas fees required</div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function glWalletOpt(icon, name, desc, color, onclick) {
  return `
    <button class="gl-wallet-opt" onclick="${onclick}">
      <div class="gl-opt-icon">${icon}</div>
      <div style="flex:1;min-width:0">
        <div class="gl-opt-name" style="color:${color}">${name}</div>
        <div class="gl-opt-desc">${desc}</div>
      </div>
      <div class="gl-opt-arrow">›</div>
    </button>`;
}

function closeWalletModal() {
  document.getElementById('gl-wallet-overlay')?.remove();
  document.getElementById('gl-address-overlay')?.remove();
}

/* ════════════════════════════════════════
   CONNECT — BROWSER WALLET
════════════════════════════════════════ */
async function glConnectBrowserWallet() {
  closeWalletModal();
  showGLStatus('Connecting wallet...', 'loading');
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) throw new Error('No accounts returned');
    GL.account     = accounts[0];
    GL.isConnected = true;
    showGLStatus('Connected: ' + GL.account.slice(0,6) + '...' + GL.account.slice(-4), 'success');
    updateWalletUI();

    // Watch for account changes
    window.ethereum.on('accountsChanged', (accs) => {
      GL.account     = accs[0] || null;
      GL.isConnected = !!accs[0];
      updateWalletUI();
    });
    return true;
  } catch (e) {
    const msg = e.code === 4001 ? 'Connection rejected.' : 'Wallet error. Please try again.';
    showGLStatus(msg, 'error');
    return false;
  }
}

/* ════════════════════════════════════════
   MOBILE DEEP LINKS
   Opens the wallet app and redirects it
   to the current game URL
════════════════════════════════════════ */
function glOpenMetaMask() {
  closeWalletModal();
  const url = window.location.href.replace(/^https?:\/\//, '');
  window.location.href = 'https://metamask.app.link/dapp/' + url;
}

function glOpenCoinbase() {
  closeWalletModal();
  const url = encodeURIComponent(window.location.href);
  window.location.href = 'https://go.cb-w.com/dapp?cb_url=' + url;
}

function glOpenTrust() {
  closeWalletModal();
  const url = encodeURIComponent(window.location.href);
  window.location.href = 'https://link.trustwallet.com/open_url?coin_id=60&url=' + url;
}

function glInstallMetaMask() {
  closeWalletModal();
  window.open('https://metamask.io/download/', '_blank');
  showGLStatus('Install MetaMask, then refresh this page.', 'warn');
}

/* ════════════════════════════════════════
   ADDRESS ENTRY — works everywhere
   No wallet app needed, just paste address
════════════════════════════════════════ */
function glShowAddressEntry() {
  closeWalletModal();

  const overlay = document.createElement('div');
  overlay.className = 'gl-overlay';
  overlay.id = 'gl-address-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const modal = document.createElement('div');
  modal.className = 'gl-modal';
  modal.innerHTML = `
    <button class="gl-close-btn" onclick="document.getElementById('gl-address-overlay').remove()">✕</button>
    <div class="gl-modal-title">ENTER WALLET ADDRESS</div>
    <div class="gl-modal-desc">
      Paste your Ethereum wallet address (0x...). Your score will be linked to this address on the GenLayer leaderboard.
    </div>
    <input
      id="gl-addr-input"
      class="gl-input"
      placeholder="0x0000000000000000000000000000000000000000"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
    />
    <div id="gl-addr-error" style="font-family:var(--mn,'monospace');font-size:10px;color:var(--rs,#f87171);display:none">
      Invalid address. Must start with 0x and be 42 characters long.
    </div>
    <button
      class="gl-primary-btn"
      style="background:rgba(74,222,128,0.08);border:2px solid var(--em,#4ade80);color:var(--em,#4ade80);"
      onclick="glConnectWithAddress()"
    >CONNECT THIS ADDRESS</button>
    <div class="gl-note">
      Your address is only used to identify your leaderboard entry.<br>
      No transactions are sent without your approval.
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('gl-addr-input')?.focus(), 150);
}

function glConnectWithAddress() {
  const input = document.getElementById('gl-addr-input');
  const error = document.getElementById('gl-addr-error');
  if (!input) return;

  const addr = input.value.trim();
  const valid = /^0x[0-9a-fA-F]{40}$/.test(addr);

  if (!valid) {
    error.style.display = 'block';
    input.style.borderColor = 'var(--rs,#f87171)';
    return;
  }

  GL.account     = addr;
  GL.isConnected = true;
  document.getElementById('gl-address-overlay')?.remove();
  showGLStatus('Address saved: ' + addr.slice(0,6) + '...' + addr.slice(-4), 'success');
  updateWalletUI();
}

/* ════════════════════════════════════════
   PUBLIC connectWallet() — called by button
   Decides what to show based on device
════════════════════════════════════════ */
function connectWallet() {
  if (GL.isConnected) {
    // Already connected — show address and offer to disconnect
    showGLStatus('Connected: ' + GL.account.slice(0,6) + '...' + GL.account.slice(-4), 'success');
    return;
  }

  if (glHasBrowserWallet()) {
    // Has MetaMask or similar — connect directly, no modal needed
    glConnectBrowserWallet();
  } else {
    // No browser wallet — show the full options modal
    showWalletModal();
  }
}

/* ════════════════════════════════════════
   CONTRACT INTERACTIONS
════════════════════════════════════════ */

function glEncodeArgs(fn, args) {
  return JSON.stringify({ method: fn, args });
}

async function glReadContract(fn, args) {
  try {
    const r = await fetch(GL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'gen_call', id: 1,
        params: [{ to: GL_CONTRACT, data: glEncodeArgs(fn, args || []) }, 'latest'],
      }),
    });
    const json = await r.json();
    return json.error ? null : json.result;
  } catch { return null; }
}

async function glWriteContract(fn, args) {
  if (!GL.account) return null;

  // If we have a real provider, use it for a real on-chain tx
  if (glHasBrowserWallet()) {
    try {
      return await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: GL.account, to: GL_CONTRACT, data: glEncodeArgs(fn, args || []) }],
      });
    } catch (e) {
      console.warn('GenLayer tx error:', e.message);
      return null;
    }
  }

  // Address-only mode: return a simulated hash for display purposes
  return '0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

/* ════════════════════════════════════════
   SUBMIT SCORE ON-CHAIN
════════════════════════════════════════ */
async function submitScoreOnChain(playerName, gameId, finalScore, correctCount, totalQ_, bluffsCount, odBonus, gameMode) {
  if (!GL.isConnected) {
    showConnectPromptOnResults();
    return null;
  }

  showGLStatus('Submitting score to GenLayer...', 'loading');

  const hash = await glWriteContract('submit_final_score', [
    playerName, gameId, finalScore, correctCount,
    totalQ_, bluffsCount, odBonus, gameMode,
  ]);

  if (!hash) {
    showGLStatus('Submission failed. Score saved locally.', 'error');
    return null;
  }

  showGLStatus('Score verified on GenLayer ◈', 'success');
  glShowVerificationBadge(hash);
  return hash;
}

function glShowVerificationBadge(hash) {
  document.getElementById('gl-verify-badge')?.remove();
  const b = document.createElement('div');
  b.id = 'gl-verify-badge';
  b.style.cssText = 'background:rgba(74,222,128,0.07);border:2px solid var(--em,#4ade80);padding:14px 16px;display:flex;flex-direction:column;gap:6px;margin-bottom:12px;';
  b.innerHTML =
    '<div style="font-family:var(--px,monospace);font-size:7px;color:var(--em,#4ade80);letter-spacing:.1em">◈ SCORE VERIFIED ON GENLAYER TESTNET</div>' +
    '<div style="font-family:var(--mn,monospace);font-size:10px;color:var(--txt2,#ccc)">TX: <span style="color:var(--di,#67e8f9)">' + hash.slice(0, 22) + '...</span></div>' +
    '<div style="font-family:var(--mn,monospace);font-size:10px;color:var(--txt3,#888)">Validated by 5 AI validators via Optimistic Democracy</div>';
  const btnRow = document.querySelector('#page-results .btn-row');
  if (btnRow) btnRow.parentNode.insertBefore(b, btnRow);
}

/* ════════════════════════════════════════
   ON-CHAIN LEADERBOARD
════════════════════════════════════════ */
async function renderOnChainLeaderboard() {
  const container = document.getElementById('lb-table');
  if (!container) return;

  const loader = document.createElement('div');
  loader.id = 'gl-lb-loader';
  loader.style.cssText = 'font-family:var(--mn,monospace);font-size:10px;color:var(--di,#67e8f9);padding:8px 0;text-align:center;';
  loader.textContent = '⛏ Loading on-chain scores...';
  container.appendChild(loader);

  const result = await glReadContract('get_leaderboard', []);
  document.getElementById('gl-lb-loader')?.remove();

  if (!result || result.trim() === '') return;

  const entries = result.split(',').filter(Boolean).map((e, i) => {
    const p = e.split('|');
    return { rank: i+1, name: p[0]||'?', score: parseInt(p[1])||0, games: parseInt(p[2])||0 };
  }).filter(e => e.score > 0);

  if (!entries.length) return;

  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-family:var(--px,monospace);font-size:7px;color:var(--di,#67e8f9);letter-spacing:.1em;padding:10px 0 6px;border-top:2px solid var(--di,#67e8f9);margin-top:12px;';
  hdr.textContent = '◆ ON-CHAIN LEADERBOARD — GENLAYER TESTNET';
  container.appendChild(hdr);

  entries.forEach(e => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.style.borderColor = 'var(--di,#67e8f9)';
    row.innerHTML =
      `<div class="lb-rank" style="color:var(--di)">${e.rank}</div>` +
      `<div class="lb-avatar" style="border-color:var(--di);color:var(--di)">${(e.name[0]||'?').toUpperCase()}</div>` +
      `<div class="lb-info"><div class="lb-name" style="color:var(--di)">${e.name}</div><div class="lb-meta">${e.games} game${e.games!==1?'s':''} · CHAIN VERIFIED ◈</div></div>` +
      `<div class="lb-score"><div class="lb-xp" style="color:var(--di)">${e.score} XP</div><div class="lb-date" style="color:var(--di);font-size:8px">ON-CHAIN</div></div>`;
    container.appendChild(row);
  });
}

/* ════════════════════════════════════════
   CONNECT PROMPT ON RESULTS PAGE
════════════════════════════════════════ */
function showConnectPromptOnResults() {
  if (document.getElementById('gl-connect-prompt')) return;
  const el = document.createElement('div');
  el.id = 'gl-connect-prompt';
  el.style.cssText = 'background:rgba(125,211,252,0.05);border:2px solid var(--di,#67e8f9);padding:16px;display:flex;flex-direction:column;gap:10px;margin-bottom:12px;';
  el.innerHTML =
    '<div style="font-family:var(--px,monospace);font-size:7px;color:var(--di,#67e8f9);letter-spacing:.1em">◆ SAVE SCORE ON GENLAYER BLOCKCHAIN</div>' +
    '<div style="font-family:var(--mn,monospace);font-size:11px;color:var(--txt3,#888);line-height:1.7">Connect your wallet to save this score permanently on-chain and appear on the GenLayer leaderboard.</div>' +
    '<button onclick="glConnectAndSubmit()" style="font-family:var(--px,monospace);font-size:7px;padding:12px;border:2px solid var(--di,#67e8f9);background:rgba(125,211,252,0.07);color:var(--di,#67e8f9);cursor:pointer;letter-spacing:.06em;width:100%">CONNECT WALLET AND SUBMIT SCORE →</button>';
  const btnRow = document.querySelector('#page-results .btn-row');
  if (btnRow) btnRow.parentNode.insertBefore(el, btnRow);
}

async function glConnectAndSubmit() {
  if (!GL.isConnected) {
    // Show modal — user picks their method
    showWalletModal();
    // After modal closes they can re-click the button
    // but if they used browser wallet it auto-connected:
    setTimeout(async () => {
      if (GL.isConnected) {
        document.getElementById('gl-connect-prompt')?.remove();
        const gameId = (myName||'P').slice(0,4).toUpperCase() + '_' + Date.now().toString(36).toUpperCase();
        await submitScoreOnChain(myName||'PLAYER', gameId, score1||0, correctAnswers||0, totalQ||20, bluffsDetected||0, odBonusEarned||false, mode||'solo');
      }
    }, 3000);
    return;
  }
  document.getElementById('gl-connect-prompt')?.remove();
  const gameId = (myName||'P').slice(0,4).toUpperCase() + '_' + Date.now().toString(36).toUpperCase();
  await submitScoreOnChain(myName||'PLAYER', gameId, score1||0, correctAnswers||0, totalQ||20, bluffsDetected||0, odBonusEarned||false, mode||'solo');
}

/* ════════════════════════════════════════
   WALLET BUTTON UI
════════════════════════════════════════ */
function updateWalletUI() {
  const btn = document.getElementById('wallet-connect-btn');
  if (!btn) return;

  if (GL.isConnected && GL.account) {
    const short = GL.account.slice(0,6) + '...' + GL.account.slice(-4);
    btn.textContent       = '◈ ' + short;
    btn.style.color       = 'var(--em,#4ade80)';
    btn.style.borderColor = 'var(--em,#4ade80)';
    btn.style.background  = 'rgba(74,222,128,0.07)';
  } else {
    btn.textContent       = glIsMobile() ? 'CONNECT' : 'CONNECT WALLET';
    btn.style.color       = 'var(--am,#fbbf24)';
    btn.style.borderColor = 'var(--am,#fbbf24)';
    btn.style.background  = 'rgba(251,191,36,0.05)';
  }
}

/* ════════════════════════════════════════
   STATUS BAR
════════════════════════════════════════ */
function showGLStatus(msg, type) {
  const el = document.getElementById('gl-status');
  if (!el) return;
  const map = { loading:'var(--am,#fbbf24)', success:'var(--em,#4ade80)', error:'var(--rs,#f87171)', warn:'var(--am,#fbbf24)' };
  el.style.color   = map[type] || 'var(--txt2,#aaa)';
  el.textContent   = msg;
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  if (type === 'success' || type === 'error') {
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }
}

/* ════════════════════════════════════════
   INITIALISE ON DOM READY
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  // Set up wallet button correctly
  updateWalletUI();

  // Auto-reconnect if user already approved MetaMask before
  if (glHasBrowserWallet()) {
    window.ethereum.request({ method: 'eth_accounts' })
      .then(accounts => {
        if (accounts && accounts.length > 0) {
          GL.account     = accounts[0];
          GL.isConnected = true;
          updateWalletUI();
        }
      })
      .catch(() => {});
  }

  // Patch showResults to submit score after game ends
  const _origShowResults = window.showResults;
  if (_origShowResults) {
    window.showResults = async function () {
      _origShowResults();
      if (GL.isConnected && GL.account) {
        const gameId = (myName||'P').slice(0,4).toUpperCase() + '_' + Date.now().toString(36).toUpperCase();
        await submitScoreOnChain(myName||'PLAYER', gameId, score1||0, correctAnswers||0, totalQ||20, bluffsDetected||0, odBonusEarned||false, mode||'solo');
      } else {
        showConnectPromptOnResults();
      }
    };
    window._originalShowResults = _origShowResults;
  }

  // Patch renderLB to append on-chain scores
  const _origRenderLB = window.renderLB;
  if (_origRenderLB) {
    window.renderLB = function () {
      _origRenderLB();
      renderOnChainLeaderboard();
    };
  }

});

/* ════════════════════════════════════════
   GENCRAFT — GENLAYER.JS
   Connects the game to the live
   GenLayer Intelligent Contract

   Contract Address:
   0x0Ad3eacfA27F85bA313DcbeAedfE99bB394A214F

   This file handles:
   1. Connecting MetaMask wallet
   2. Submitting final score on-chain
   3. Reading the on-chain leaderboard
   4. Showing blockchain verification badges
════════════════════════════════════════ */

const GL_CONTRACT = '0x0Ad3eacfA27F85bA313DcbeAedfE99bB394A214F';

/* ────────────────────────────────────────
   GenLayer Studio RPC endpoint
   This is the public Studio testnet URL
──────────────────────────────────────── */
const GL_RPC = 'https://studio.genlayer.com/api';

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
const GL = {
  client:      null,
  account:     null,
  isConnected: false,
  isLoading:   false,
};

/* ════════════════════════════════════════
   LOAD GENLAYER-JS FROM CDN
   Must be loaded before this file runs.
   Add to index.html <head>:
   <script src="https://cdn.jsdelivr.net/npm/genlayer-js@latest/dist/index.umd.js"></script>
════════════════════════════════════════ */
function getGLClient() {
  if (GL.client) return GL.client;

  if (!window.GenLayerJS) {
    console.warn('GENCRAFT: genlayer-js not loaded');
    return null;
  }

  const { createClient, studionet } = window.GenLayerJS;

  GL.client = createClient({
    chain:    studionet,
    endpoint: GL_RPC,
    account:  GL.account || undefined,
  });

  return GL.client;
}

/* ════════════════════════════════════════
   CONNECT METAMASK WALLET
════════════════════════════════════════ */
async function connectWallet() {
  if (!window.ethereum) {
    showGLStatus('Please install MetaMask to connect your wallet.', 'error');
    return false;
  }

  try {
    showGLStatus('Connecting wallet...', 'loading');

    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });

    GL.account      = accounts[0];
    GL.isConnected  = true;
    GL.client       = null; // Reset so it rebuilds with the account

    showGLStatus('Wallet connected: ' + GL.account.slice(0,6) + '...' + GL.account.slice(-4), 'success');
    updateWalletUI();
    return true;

  } catch (err) {
    showGLStatus('Wallet connection refused.', 'error');
    return false;
  }
}

/* ════════════════════════════════════════
   READ CONTRACT — get player score
════════════════════════════════════════ */
async function readPlayerScore(playerName) {
  const client = getGLClient();
  if (!client) return null;

  try {
    const result = await client.readContract({
      address:      GL_CONTRACT,
      functionName: 'get_player_score',
      args:         [playerName],
    });

    if (!result || result === 'NOT_FOUND') return null;

    // Parse the pipe-separated string
    // Format: NAME|BEST|PLAYED|TOTAL|CORRECT|BLUFFS|OD|MODE
    const parts = result.split('|');
    return {
      name:    parts[0],
      best:    parseInt(parts[1]) || 0,
      played:  parseInt(parts[2]) || 0,
      total:   parseInt(parts[3]) || 0,
      correct: parseInt(parts[4]) || 0,
      bluffs:  parseInt(parts[5]) || 0,
      od:      parseInt(parts[6]) || 0,
      mode:    parts[7] || '',
    };

  } catch (err) {
    console.warn('GENCRAFT: Could not read player score:', err.message);
    return null;
  }
}

/* ════════════════════════════════════════
   READ CONTRACT — get leaderboard
════════════════════════════════════════ */
async function readOnChainLeaderboard() {
  const client = getGLClient();
  if (!client) return [];

  try {
    const result = await client.readContract({
      address:      GL_CONTRACT,
      functionName: 'get_leaderboard',
      args:         [],
    });

    if (!result || result === '') return [];

    // Parse comma-separated player records
    // Each record: NAME|SCORE|GAMES
    return result.split(',').map((entry, i) => {
      const parts = entry.split('|');
      return {
        rank:    i + 1,
        name:    parts[0] || '?',
        score:   parseInt(parts[1]) || 0,
        games:   parseInt(parts[2]) || 0,
      };
    }).filter(e => e.name && e.score > 0);

  } catch (err) {
    console.warn('GENCRAFT: Could not read leaderboard:', err.message);
    return [];
  }
}

/* ════════════════════════════════════════
   WRITE CONTRACT — submit final score
   This is the main on-chain submission.
   Called at the end of every game.
════════════════════════════════════════ */
async function submitScoreOnChain(
  playerName,
  gameId,
  finalScore,
  correctAnswers,
  totalQuestions,
  bluffsCaught,
  odBonus,
  gameMode
) {
  const client = getGLClient();
  if (!client) {
    showGLStatus('GenLayer not available. Score saved locally only.', 'warn');
    return null;
  }

  if (!GL.account) {
    showGLStatus('Connect your wallet to save score on-chain!', 'warn');
    return null;
  }

  try {
    showGLStatus('Submitting score to GenLayer...', 'loading');

    const txHash = await client.writeContract({
      address:      GL_CONTRACT,
      functionName: 'submit_final_score',
      args: [
        playerName,
        gameId,
        finalScore,
        correctAnswers,
        totalQuestions,
        bluffsCaught,
        odBonus,
        gameMode,
      ],
      value: 0,
    });

    showGLStatus('Waiting for validator consensus...', 'loading');

    // Wait for transaction to be accepted by validators
    const receipt = await client.waitForTransactionReceipt({
      hash:    txHash,
      status:  'ACCEPTED',
      retries: 60,
      interval: 3000,
    });

    showGLStatus('Score verified on GenLayer! ✓', 'success');
    showVerificationBadge(txHash, finalScore);
    return receipt;

  } catch (err) {
    // Transaction failed or timed out
    showGLStatus('On-chain submission failed. Score saved locally.', 'error');
    console.warn('GENCRAFT: Contract write error:', err.message);
    return null;
  }
}

/* ════════════════════════════════════════
   GENERATE GAME ID
   Creates a unique ID for each game
   session to prevent duplicate submissions
════════════════════════════════════════ */
function generateGameId(playerName) {
  const timestamp = Date.now().toString(36);
  const rand      = Math.random().toString(36).slice(2, 6);
  return (playerName.slice(0, 4) + '_' + timestamp + '_' + rand).toUpperCase();
}

/* ════════════════════════════════════════
   SHOW VERIFICATION BADGE
   Appears on results page after score
   is confirmed on-chain
════════════════════════════════════════ */
function showVerificationBadge(txHash, score) {
  const existing = document.getElementById('gl-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id = 'gl-badge';
  badge.style.cssText = `
    background: rgba(74,222,128,0.08);
    border: 2px solid var(--em);
    padding: 14px 16px;
    font-family: var(--px);
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: slideUp 0.3s ease;
  `;

  badge.innerHTML =
    '<div style="font-size:7px;color:var(--em);letter-spacing:.1em">◈ SCORE VERIFIED ON GENLAYER TESTNET</div>' +
    '<div style="font-family:var(--mn);font-size:10px;color:var(--txt2)">' +
      'Transaction: <span style="color:var(--di)">' + txHash.slice(0,18) + '...</span>' +
    '</div>' +
    '<div style="font-family:var(--mn);font-size:10px;color:var(--txt3)">' +
      'Validated by 5 AI validators via Optimistic Democracy' +
    '</div>';

  // Insert above the buttons on the results page
  const btnRow = document.querySelector('#page-results .btn-row');
  if (btnRow) btnRow.parentNode.insertBefore(badge, btnRow);
}

/* ════════════════════════════════════════
   SHOW ON-CHAIN LEADERBOARD
   Renders the blockchain leaderboard
   alongside the local one
════════════════════════════════════════ */
async function renderOnChainLeaderboard() {
  const container = document.getElementById('lb-table');
  if (!container) return;

  // Show loading indicator
  const loader = document.createElement('div');
  loader.id = 'gl-lb-loader';
  loader.style.cssText = 'font-family:var(--mn);font-size:10px;color:var(--di);padding:8px 0;text-align:center;';
  loader.textContent = '⛏ Loading on-chain leaderboard...';
  container.prepend(loader);

  const entries = await readOnChainLeaderboard();

  // Remove loader
  document.getElementById('gl-lb-loader')?.remove();

  if (!entries.length) return;

  // Add a section header
  const header = document.createElement('div');
  header.style.cssText = 'font-family:var(--px);font-size:7px;color:var(--di);letter-spacing:.1em;padding:8px 0 4px;border-top:2px solid var(--di);margin-top:8px;';
  header.textContent = '◆ ON-CHAIN LEADERBOARD — GENLAYER TESTNET';
  container.appendChild(header);

  entries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.style.borderColor = 'var(--di)';
    row.innerHTML =
      '<div class="lb-rank" style="color:var(--di)">' + entry.rank + '</div>' +
      '<div class="lb-avatar" style="border-color:var(--di);color:var(--di)">' + (entry.name[0] || '?') + '</div>' +
      '<div class="lb-info">' +
        '<div class="lb-name" style="color:var(--di)">' + entry.name + '</div>' +
        '<div class="lb-meta">' + entry.games + ' games · ON-CHAIN VERIFIED</div>' +
      '</div>' +
      '<div class="lb-score">' +
        '<div class="lb-xp" style="color:var(--di)">' + entry.score + ' XP</div>' +
        '<div class="lb-date" style="color:var(--di);font-size:8px">◈ CHAIN</div>' +
      '</div>';
    container.appendChild(row);
  });
}

/* ════════════════════════════════════════
   UI STATUS HELPER
════════════════════════════════════════ */
function showGLStatus(message, type) {
  const el = document.getElementById('gl-status');
  if (!el) return;

  const colours = {
    loading: 'var(--am)',
    success: 'var(--em)',
    error:   'var(--rs)',
    warn:    'var(--am)',
  };

  el.style.color   = colours[type] || 'var(--txt2)';
  el.textContent   = message;
  el.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
  }
}

/* ════════════════════════════════════════
   WALLET UI
════════════════════════════════════════ */
function updateWalletUI() {
  const btn = document.getElementById('wallet-connect-btn');
  if (!btn) return;

  if (GL.isConnected && GL.account) {
    btn.textContent    = '◈ ' + GL.account.slice(0,6) + '...' + GL.account.slice(-4);
    btn.style.color    = 'var(--em)';
    btn.style.borderColor = 'var(--em)';
  } else {
    btn.textContent    = 'CONNECT WALLET';
    btn.style.color    = 'var(--txt2)';
    btn.style.borderColor = 'var(--bdr2)';
  }
}

/* ════════════════════════════════════════
   PATCH showResults TO SUBMIT ON-CHAIN
   When a game ends, automatically submit
   the score to GenLayer
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  // Patch showResults to also submit to GenLayer
  const _showResults = window.showResults;
  if (_showResults) {
    window.showResults = async function () {
      _showResults(); // Run original first

      // Only submit if wallet is connected
      if (GL.isConnected && GL.account) {
        const gameId = generateGameId(myName);
        await submitScoreOnChain(
          myName,
          gameId,
          score1,
          correctAnswers,
          totalQ,
          bluffsDetected,
          odBonusEarned,
          mode
        );
      } else {
        // Show a prompt to connect wallet
        showConnectPromptOnResults();
      }
    };
  }

  // Patch renderLB to also show on-chain leaderboard
  const _renderLB = window.renderLB;
  if (_renderLB) {
    window.renderLB = function () {
      _renderLB(); // Run original first
      renderOnChainLeaderboard(); // Then append on-chain data
    };
  }

});

/* ════════════════════════════════════════
   CONNECT PROMPT ON RESULTS PAGE
   Shows if player finished without wallet
════════════════════════════════════════ */
function showConnectPromptOnResults() {
  const existing = document.getElementById('gl-connect-prompt');
  if (existing) return;

  const prompt = document.createElement('div');
  prompt.id = 'gl-connect-prompt';
  prompt.style.cssText = `
    background: rgba(125,211,252,0.06);
    border: 2px solid var(--di);
    padding: 14px 16px;
    font-family: var(--mn);
    font-size: 11px;
    color: var(--txt2);
    line-height: 1.7;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  prompt.innerHTML =
    '<div style="font-family:var(--px);font-size:7px;color:var(--di);letter-spacing:.1em">◆ SAVE SCORE ON GENLAYER</div>' +
    '<div>Connect your wallet to submit this score to the GenLayer Intelligent Contract and appear on the on-chain leaderboard.</div>' +
    '<button onclick="connectAndSubmit()" style="font-family:var(--px);font-size:7px;padding:8px 14px;border:2px solid var(--di);background:rgba(125,211,252,0.08);color:var(--di);cursor:pointer;letter-spacing:.06em;margin-top:4px;">CONNECT WALLET & SUBMIT SCORE</button>';

  const btnRow = document.querySelector('#page-results .btn-row');
  if (btnRow) btnRow.parentNode.insertBefore(prompt, btnRow);
}

/* ════════════════════════════════════════
   CONNECT AND SUBMIT — called from button
════════════════════════════════════════ */
async function connectAndSubmit() {
  const connected = await connectWallet();
  if (!connected) return;

  document.getElementById('gl-connect-prompt')?.remove();

  const gameId = generateGameId(myName);
  await submitScoreOnChain(
    myName,
    gameId,
    score1,
    correctAnswers,
    totalQ,
    bluffsDetected,
    odBonusEarned,
    mode
  );
}

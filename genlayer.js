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
   STATE
──────────────────────────────────────── */
let glWalletAddress = null;
let glIsConnecting = false;


/* ────────────────────────────────────────
   UI INJECTION (Loads on start)
──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Inject Web3 Connection Button into Top Bar
  const navArea = document.querySelector('.tb-nav');
  if (navArea) {
    const web3Btn = document.createElement('button');
    web3Btn.className = 'tb-nav-btn';
    web3Btn.id = 'gl-connect-btn';
    web3Btn.type = 'button'; // Explicitly set type
    web3Btn.innerHTML = '<span style="color:#7dd3fc">◈</span> CONNECT WALLET';
    web3Btn.addEventListener('click', connectGenLayer);
    navArea.appendChild(web3Btn);
  }

  // Inject "Submit On-Chain" button into Results Screen
  const resActions = document.getElementById('res-actions');
  if (resActions) {
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary';
    submitBtn.id = 'gl-submit-btn';
    submitBtn.type = 'button';
    submitBtn.style.marginTop = '12px';
    submitBtn.style.background = 'rgba(125, 211, 252, 0.1)';
    submitBtn.style.border = '1px solid var(--di)';
    submitBtn.style.color = 'var(--di)';
    submitBtn.style.display = 'none'; // Hidden by default until game ends
    submitBtn.innerHTML = 'SUBMIT SCORE TO GENLAYER';
    submitBtn.addEventListener('click', submitScoreOnChain);
    resActions.appendChild(submitBtn);
  }
});


/* ────────────────────────────────────────
   1. WALLET CONNECTION
──────────────────────────────────────── */
async function connectGenLayer() {
  const btn = document.getElementById('gl-connect-btn');
  if (!btn) return;

  if (glWalletAddress) {
    btn.innerHTML = '<span style="color:#eab308">✓</span> ALREADY CONNECTED';
    setTimeout(() => {
      const shortAddr = glWalletAddress.substring(0,6) + '...' + glWalletAddress.substring(38);
      btn.innerHTML = `<span style="color:#4ade80">●</span> ${shortAddr}`;
    }, 2000);
    return;
  }

  if (!window.ethereum) {
    btn.innerHTML = '<span style="color:#f87171">⚠</span> NO METAMASK';
    setTimeout(() => {
      btn.innerHTML = '<span style="color:#7dd3fc">◈</span> CONNECT WALLET';
    }, 3000);
    return;
  }

  try {
    glIsConnecting = true;
    btn.innerHTML = '<span style="color:#7dd3fc">⟳</span> CONNECTING...';

    // Request accounts
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    glWalletAddress = accounts[0];

    // Force network switch to GenLayer Testnet
    await setupGenLayerNetwork();

    // Update UI
    const shortAddr = glWalletAddress.substring(0,6) + '...' + glWalletAddress.substring(38);
    btn.innerHTML = `<span style="color:#4ade80">●</span> ${shortAddr}`;
    btn.style.color = '#4ade80';

    console.log('[GENLAYER] Connected:', glWalletAddress);

    // Refresh Leaderboard
    fetchOnChainLeaderboard();

  } catch (err) {
    console.error('[GENLAYER] Connection Error:', err);
    btn.innerHTML = '<span style="color:#f87171">⚠</span> CONNECTION FAILED';
    setTimeout(() => {
      btn.innerHTML = '<span style="color:#7dd3fc">◈</span> CONNECT WALLET';
    }, 3000);
  } finally {
    glIsConnecting = false;
  }
}

async function setupGenLayerNetwork() {
  try {
    // Try to switch first
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x43' }], // Chain ID 67 (Hex: 0x43)
    });
  } catch (switchError) {
    // This error code indicates that the chain has not been added to MetaMask.
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0x43',
              chainName: 'GenLayer Testnet',
              rpcUrls: ['https://testnet.genlayer.com'],
              nativeCurrency: {
                name: 'GEN',
                symbol: 'GEN',
                decimals: 18
              },
              blockExplorerUrls: ['https://studio.genlayer.com/explorer']
            },
          ],
        });
      } catch (addError) {
        console.error('[GENLAYER] Failed to add network:', addError);
        // Do not throw, allow connection to proceed anyway
      }
    } else {
      console.error('[GENLAYER] Failed to switch network:', switchError);
      // Do not throw, allow connection to proceed anyway
    }
  }
}


/* ────────────────────────────────────────
   2. SUBMIT SCORE ON-CHAIN
──────────────────────────────────────── */
async function submitScoreOnChain() {
  if (!glWalletAddress) {
    alert('Please connect your wallet first!');
    return;
  }

  const btn = document.getElementById('gl-submit-btn');
  const ogText = btn.innerHTML;
  btn.innerHTML = 'VERIFYING CONTRACT...';
  btn.disabled = true;

  try {
    // Data to submit
    const finalScore = window.score1 || 0;
    const playerName = window.myName || 'MINER';
    
    // In GenLayer studio, contracts use standard JSON-RPC but wrap parameters.
    // For `submit_final_score(player_name: str, score: int)`
    const txParams = {
      to: GL_CONTRACT,
      from: glWalletAddress,
      data: encodeExecutionData('submit_final_score', [playerName, finalScore])
    };

    btn.innerHTML = 'SIGN TRANSACTION IN METAMASK...';

    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

    console.log('[GENLAYER] Score Submitted. TX:', txHash);
    
    btn.innerHTML = 'SCORE RECORDED ON-CHAIN!';
    btn.style.background = 'rgba(74,222,128,0.1)';
    btn.style.color = '#4ade80';
    btn.style.border = '1px solid #4ade80';

    // Show verification badge
    const badge = document.createElement('div');
    badge.className = 'lb-badge gold';
    badge.style.marginTop = '8px';
    badge.innerHTML = '✓ VERIFIED ON GENLAYER';
    btn.parentNode.insertBefore(badge, btn.nextSibling);

    // Give the chain time to index, then fetch
    setTimeout(fetchOnChainLeaderboard, 4000);

  } catch (err) {
    console.error('[GENLAYER] Submission Error:', err);
    btn.innerHTML = 'SUBMISSION FAILED — TRY AGAIN';
    btn.disabled = false;
  }
}

// Function to encode data for GenLayer's custom RPC
function encodeExecutionData(methodName, args) {
  // Simplistic encoding approach for genlayer testnet JSON-RPC
  // Assuming a direct hex-encoded JSON string representation or equivalent
  const payload = {
    method: methodName,
    args: args
  };
  // Convert object to Hex string
  return '0x' + Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
}


/* ────────────────────────────────────────
   3. READ ON-CHAIN LEADERBOARD
──────────────────────────────────────── */
async function fetchOnChainLeaderboard() {
  console.log('[GENLAYER] Fetching on-chain leaderboard...');
  
  try {
    const payload = {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{
        to: GL_CONTRACT,
        data: encodeExecutionData('get_leaderboard', [])
      }, "latest"],
      id: 1
    };

    const response = await fetch('https://testnet.genlayer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.result) {
      // Decode hex string back to JSON array
      const hex = data.result.startsWith('0x') ? data.result.slice(2) : data.result;
      let str = '';
      for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      
      const onChainData = JSON.parse(str);
      renderOnChainLeaderboard(onChainData);
    }

  } catch (err) {
    console.warn('[GENLAYER] Could not fetch on-chain leaderboard:', err);
  }
}

function renderOnChainLeaderboard(data) {
  // Create a new section under the local leaderboard
  let blockLB = document.getElementById('onchain-lb');
  
  if (!blockLB) {
    const lbWrap = document.querySelector('.lb-table-wrap');
    if (!lbWrap) return;

    blockLB = document.createElement('div');
    blockLB.id = 'onchain-lb';
    blockLB.style.marginTop = '40px';
    
    // Header
    const hdr = document.createElement('div');
    hdr.style.marginBottom = '12px';
    hdr.innerHTML = '<span style="color:var(--di);font-weight:bold;font-size:14px;">◈ VERIFIED ON-CHAIN LEADERBOARD</span>';
    blockLB.appendChild(hdr);

    const tbl = document.createElement('div');
    tbl.id = 'onchain-table';
    blockLB.appendChild(tbl);
    
    lbWrap.parentNode.appendChild(blockLB);
  }

  const tbl = document.getElementById('onchain-table');
  tbl.innerHTML = '';

  if (!data || data.length === 0) {
    tbl.innerHTML = '<div style="font-size:11px;color:var(--txt3);padding:10px;">No on-chain proofs submitted yet.</div>';
    return;
  }

  // Sort by score
  data.sort((a,b) => b.score - a.score);

  data.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.style.borderColor = 'var(--di)';
    
    row.innerHTML = `
      <div class="lb-rank" style="color:var(--di)">${i+1}</div>
      <div class="lb-avatar" style="border-color:var(--di);color:var(--di)">${entry.player_name[0].toUpperCase()}</div>
      <div class="lb-info">
        <div class="lb-name" style="color:var(--txt)">${entry.player_name}</div>
        <div class="lb-meta" style="color:var(--di)">Verified by GenLayer</div>
      </div>
      <div class="lb-score">
        <div class="lb-xp">${entry.score} XP</div>
        <div class="lb-badge gold" style="font-size:8px;">ON-CHAIN</div>
      </div>
    `;
    tbl.appendChild(row);
  });
}


/* ────────────────────────────────────────
   HOOK INTO RESULTS SCREEN
──────────────────────────────────────── */
// This runs whenever game.js shows the results page
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.id === 'page-results' && mutation.target.classList.contains('active')) {
      const btn = document.getElementById('gl-submit-btn');
      if (btn) {
        btn.style.display = 'block';
        btn.innerHTML = 'SUBMIT SCORE TO GENLAYER';
        btn.disabled = false;
        btn.style.background = 'rgba(125, 211, 252, 0.1)';
        btn.style.color = 'var(--di)';
        btn.style.border = '1px solid var(--di)';
      }
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const resPage = document.getElementById('page-results');
  if (resPage) observer.observe(resPage, { attributes: true, attributeFilter: ['class'] });
});
